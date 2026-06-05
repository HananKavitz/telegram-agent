import { config } from "../config.js";
import { addLog } from "./debug.js";

const SERPAPI_URL = "https://serpapi.com/search";

interface SerpResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

export async function webSearch(query: string): Promise<string> {
  addLog("info", `Web search`, { query: query.slice(0, 100) });

  const url = new URL(SERPAPI_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", config.serpapiApiKey);
  url.searchParams.set("num", "5");

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (fetchError) {
    const msg = fetchError instanceof Error ? fetchError.message : "Network error";
    addLog("error", `Search network error`, { error: msg });
    throw new Error(`Network error contacting SerpAPI: ${msg}`);
  }

  const text = await response.text();

  if (!response.ok) {
    addLog("error", `Search HTTP ${response.status}`, { body: text.slice(0, 500) });
    throw new Error(`SerpAPI error (HTTP ${response.status}): ${response.statusText}`);
  }

  let data: { organic_results?: SerpResult[]; error?: string };
  try {
    data = JSON.parse(text);
  } catch {
    addLog("error", `Search invalid JSON`, { body: text.slice(0, 500) });
    throw new Error("SerpAPI returned invalid JSON");
  }

  if (data.error) {
    addLog("error", `Search API error`, { error: data.error });
    throw new Error(`SerpAPI error: ${data.error}`);
  }

  const results = data.organic_results || [];

  if (results.length === 0) {
    addLog("info", `Search no results`);
    return "No search results found.";
  }

  addLog("info", `Search got ${results.length} results`);
  return results
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.link}`
    )
    .join("\n\n");
}
