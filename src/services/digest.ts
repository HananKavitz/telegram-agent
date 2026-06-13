import { webSearch } from "./search.js";
import { chatComplete } from "./llm.js";
import {
  getDigestSettings,
  getAllDigestEnabledUsers,
  setDigestLastSent,
  getSelectedModel,
} from "./storage.js";
import { DIGEST_CHECK_INTERVAL_MS } from "../config.js";
import { addLog } from "./debug.js";
import type { ChatMessage } from "../types.js";
import type { Telegraf } from "telegraf";

const MAX_DIGEST_LENGTH = 3800;

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function generateDigest(userId: number): Promise<string> {
  const settings = getDigestSettings(userId);
  const model = getSelectedModel(userId) || "google/gemini-2.0-flash-001";
  const sections: string[] = [];
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  for (const topic of settings.topics) {
    try {
      const raw = await webSearch(topic, 5);
      if (!raw || raw === "No search results found.") continue;

      const results = raw
        .split("\n\n")
        .filter((l: string) => l.trim())
        .slice(0, 5);

      const synthesizeMessages: ChatMessage[] = [
        {
          role: "system",
          content:
            "You are a news curator. Given a topic and raw search results, produce a digest entry. " +
            "For each result, write a short headline followed by 1-2 sentences explaining what is new or why it matters. " +
            "Keep it factual and concise. Each entry MUST be under 300 characters total.\n\n" +
            "Format each entry EXACTLY as:\n" +
            " {emoji} Headline — 1-2 sentence explanation\n" +
            "  → URL\n\n" +
            "Do not number entries. Use a relevant emoji per entry. Output only the entries, no extra text.",
        },
        { role: "user", content: `Topic: ${topic}\n\nSearch results:\n${results.map((r: string, i: number) => `Result ${i+1}:\n${r}`).join("\n\n")}` },
      ];

      const response = await chatComplete(model, synthesizeMessages);
      const synthesized = response.message.content?.trim();
      if (synthesized) {
        sections.push(`🔹 *${topic}*\n${synthesized}`);
      }
    } catch (error) {
      addLog("warn", `Digest topic failed: ${topic}`, {
        error: error instanceof Error ? error.message : "Unknown",
      });
    }
  }

  if (sections.length === 0) {
    return "No digest content could be generated. Try different topics.";
  }

  const header = `📬 *Daily Digest — ${dateStr}*\n━━━━━━━━━━━━━━━━━━\n\n`;
  const footer = `\n━━━━━━━━━━━━━━━━━━\n/digest to manage · /digest off to disable`;

  let body = sections.join("\n\n");
  let full = header + body + footer;

  if (full.length > MAX_DIGEST_LENGTH) {
    const available = MAX_DIGEST_LENGTH - header.length - footer.length - 100;
    let truncated = "";
    for (const section of sections) {
      const candidate = truncated ? truncated + "\n\n" + section : section;
      if (candidate.length + header.length + footer.length + 100 > MAX_DIGEST_LENGTH) {
        const room = available - truncated.length;
        if (room > 80) {
          truncated += (truncated ? "\n\n" : "") + section.slice(0, room) + "\n… *(truncated)*";
        }
        break;
      }
      truncated = candidate;
    }
    body = truncated;
    full = header + body + footer;
  }

  return full;
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let botRef: Telegraf | null = null;

async function checkAndSendDigests() {
  const b = botRef;
  if (!b) return;

  try {
    const nowHHMM = currentHHMM();
    const today = todayDate();
    const users = getAllDigestEnabledUsers();

    for (const user of users) {
      if (user.time !== nowHHMM) continue;
      if (user.lastSent === today) continue;

      try {
        const digest = await generateDigest(user.userId);
        await b.telegram.sendMessage(user.userId, digest, {
          parse_mode: "Markdown",
          link_preview_options: { is_disabled: true },
        });
        setDigestLastSent(user.userId, today);
        addLog("info", "Digest sent", { userId: user.userId });
      } catch (error) {
        addLog("error", "Digest delivery failed", {
          userId: user.userId,
          error: error instanceof Error ? error.message : "Unknown",
        });
      }
    }
  } catch (error) {
    addLog("error", "Digest scheduler check failed", {
      error: error instanceof Error ? error.message : "Unknown",
    });
  }
}

export function startDigestScheduler(bot: Telegraf) {
  if (schedulerTimer) return;
  botRef = bot;
  schedulerTimer = setInterval(checkAndSendDigests, DIGEST_CHECK_INTERVAL_MS);
  addLog("info", "Digest scheduler started", { interval: DIGEST_CHECK_INTERVAL_MS });
}

export function stopDigestScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  botRef = null;
}
