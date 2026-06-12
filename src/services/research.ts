import { webSearch } from "./search.js";
import { webFetch } from "./webfetch.js";
import { chatComplete } from "./llm.js";
import { addLog } from "./debug.js";
import type { ChatMessage } from "../types.js";

function extractUrls(text: string): string[] {
  const urls: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      urls.push(trimmed);
    }
  }
  return urls;
}

async function expandQueries(
  subject: string,
  model: string,
  depth: "standard" | "deep"
): Promise<string[]> {
  const count = depth === "deep" ? 4 : 3;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a research query expansion specialist. Generate exactly ${count} specific, diverse search queries that cover different aspects of the research subject. Return one query per line, no numbering, no extra text.`,
    },
    { role: "user", content: subject },
  ];

  try {
    const response = await chatComplete(model, messages);
    const content = response.message.content || "";

    const queries = content
      .split("\n")
      .map((q) => q.trim())
      .filter((q) => q.length > 0 && !q.startsWith("-") && !q.startsWith("*"))
      .slice(0, count);

    if (queries.length === 0) {
      addLog("warn", "Query expansion returned no queries, using subject");
      return [subject];
    }

    return queries;
  } catch (error) {
    addLog("warn", "Query expansion failed, using subject as query", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    return [subject];
  }
}

async function synthesize(
  subject: string,
  data: string,
  model: string,
  sourceUrls: string[]
): Promise<string> {
  const maxDataLength = 12000;
  const truncated =
    data.length > maxDataLength
      ? data.slice(0, maxDataLength) +
        "\n\n[... Additional sources omitted due to length ...]"
      : data;

  const sourcesBlock =
    sourceUrls.length > 0
      ? "\n\nVERIFIED SOURCE URLs (cite with [N] or (Source N)):\n" +
        sourceUrls.map((u, i) => `${i + 1}. ${u}`).join("\n")
      : "";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a research analyst. Synthesize the provided search results and page content into a comprehensive research report on the subject: "${subject}".

Structure the report as:
## Executive Summary
(2-3 paragraph overview)

## Key Findings
(Bullet points with inline citations marked [N] where N is the source number)

## Detailed Analysis
(Organized by theme or topic, 3-5 sections, cite with [N])

CRITICAL RULES:
- ONLY cite sources from the VERIFIED SOURCE URLS list below
- Do NOT invent or guess any URLs
- Do NOT include a ## Sources section - the sources will be appended automatically
- Use [1], [2], etc. for inline citations referencing the numbered list below
- If a claim cannot be attributed to a verified source, state it as analysis or speculation
- Clearly distinguish established facts from opinions or speculation
- Note when sources conflict or disagree
- Be objective and balanced
- Use plain text formatting with ## headings
- Maximum 3000 words`,
    },
    {
      role: "user",
      content: `Research data for "${subject}":\n\n${truncated}${sourcesBlock}`,
    },
  ];

  try {
    const response = await chatComplete(model, messages);
    let report = response.message.content || "Research completed but no report could be generated.";

    // Strip any Sources section the LLM might have generated despite instructions
    report = report.replace(/^## Sources[\s\S]*$/im, "").trim();

    // Append the real verified sources
    if (sourceUrls.length > 0) {
      report +=
        "\n\n## Sources\n" +
        sourceUrls.map((u, i) => `${i + 1}. ${u}`).join("\n");
    }

    return report;
  } catch (error) {
    addLog("error", "Research synthesis failed", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    return `Research data collected but synthesis failed. Raw findings:\n\n${truncated.slice(0, 3000)}`;
  }
}

export async function research(
  subject: string,
  model: string,
  depth: "standard" | "deep" = "standard",
  timeoutMs?: number
): Promise<string> {
  addLog("info", "Starting research", { subject, depth, timeoutMs });

  const deadline = timeoutMs ? Date.now() + timeoutMs : Infinity;

  // Phase 1: Query expansion
  const queries = await expandQueries(subject, model, depth);
  addLog("info", "Expanded research queries", {
    queries: queries.join(" | "),
  });

  // Phase 2: Deep search
  const allData: string[] = [];
  const sourceUrls: string[] = [];

  for (const query of queries) {
    if (Date.now() >= deadline) {
      addLog("warn", "Research time budget exceeded, stopping search", {
        completed: `${allData.length} sources`,
      });
      break;
    }

    try {
      const searchResults = await webSearch(query, 8);
      allData.push(`=== Search: ${query} ===\n${searchResults}`);

      const urls = extractUrls(searchResults);
      const maxUrls = depth === "deep" ? 4 : 3;

      const pageResults = await Promise.allSettled(
        urls.slice(0, maxUrls).map(async (url) => ({
          url,
          content: await webFetch(url),
        }))
      );

      for (const result of pageResults) {
        if (result.status === "fulfilled" && result.value.content && result.value.content.length > 50) {
          allData.push(`=== Page: ${result.value.url} ===\n${result.value.content}`);
          sourceUrls.push(result.value.url);
        }
      }
    } catch (error) {
      addLog("warn", "Search failed for query", { query });
    }
  }

  if (allData.length === 0) {
    return `Research on "${subject}" returned no results. The search may have failed or no relevant sources were found.`;
  }

  // Phase 3: Synthesis
  const report = await synthesize(subject, allData.join("\n\n"), model, sourceUrls);

  addLog("info", "Research completed", {
    subject,
    reportLength: report.length,
    timedOut: Date.now() >= deadline,
  });
  return report;
}
