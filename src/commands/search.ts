import type { Context } from "telegraf";
import { webSearch } from "../services/search.js";

export async function searchCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const query = text.replace(/^\/search\s*/i, "").trim();

  if (!query) {
    await ctx.reply("Please provide a search query. Example: `/search latest technology news`", {
      parse_mode: "Markdown",
    });
    return;
  }

  const statusMsg = await ctx.reply(`🔍 Searching for: "${query}"...`);

  try {
    const results = await webSearch(query);
    await ctx.deleteMessage(statusMsg.message_id);

    const maxLength = 4000;
    const truncated = results.length > maxLength ? results.slice(0, maxLength) + "\n\n... (truncated)" : results;

    await ctx.reply(`*Search Results for:* "${query}"\n\n${truncated}`, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    await ctx.deleteMessage(statusMsg.message_id);
    await ctx.reply(`Search failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
