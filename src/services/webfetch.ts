import * as cheerio from "cheerio";
import { addLog } from "./debug.js";

export async function webFetch(url: string): Promise<string> {
  addLog("info", "Fetching page", { url: url.slice(0, 200) });

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      addLog("warn", "Fetch non-200", { url, status: response.status });
      return "";
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $(
      "script, style, nav, footer, header, aside, iframe, noscript, svg, form, .sidebar, .nav, .footer, .header, .menu, .advertisement"
    ).remove();

    const text = $("body").text();
    const cleaned = text.replace(/\s+/g, " ").trim();

    addLog("info", "Fetched page content", {
      url: url.slice(0, 200),
      chars: cleaned.length,
    });
    return cleaned.slice(0, 5000);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    addLog("warn", "Fetch failed", { url: url.slice(0, 200), error: msg });
    return "";
  }
}
