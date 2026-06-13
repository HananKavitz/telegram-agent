import type { Context } from "telegraf";
import { getDigestSettings, setDigestTopics, setDigestTime, setDigestEnabled } from "../services/storage.js";
import { generateDigest } from "../services/digest.js";

function parseTimeArg(text: string): string | null {
  const match = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export async function digestCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message && "text" in ctx.message ? ctx.message.text.trim() : "";

  if (!text || text === "/digest") {
    const settings = await getDigestSettings(userId);
    const topicsList = settings.topics.map((t: string) => `• ${t}`).join("\n");
    const status = settings.enabled ? "✅ *Enabled*" : "❌ *Disabled*";
    await ctx.reply(
      `*Daily Digest*\n\n` +
      `${status}\n` +
      `Time: \`${settings.time}\` UTC\n\n` +
      `*Topics:*\n${topicsList}\n\n` +
      `*Commands:*\n` +
      `\`/digest <topic1, topic2, ...>\` — Set topics & enable\n` +
      `\`/digest time HH:MM\` — Set delivery time (UTC)\n` +
      `\`/digest on\` / \`/digest off\` — Toggle\n` +
      `\`/digest now\` — Send preview now`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const parts = text.split(" ");
  const sub = parts[1]?.toLowerCase();

  if (sub === "on") {
    try {
      await setDigestEnabled(userId, true);
      await ctx.reply("✅ Daily digest enabled!");
    } catch (error) {
      await ctx.reply(`Failed to enable digest: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    return;
  }

  if (sub === "off") {
    try {
      await setDigestEnabled(userId, false);
      await ctx.reply("❌ Daily digest disabled.");
    } catch (error) {
      await ctx.reply(`Failed to disable digest: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    return;
  }

  if (sub === "now") {
    await ctx.reply("📬 Generating digest...");
    try {
      const result = await generateDigest(userId);
      await ctx.reply(result, { parse_mode: "Markdown", link_preview_options: { is_disabled: true } });
    } catch (error) {
      await ctx.reply(`Digest failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    return;
  }

  if (sub === "time") {
    const timeStr = parts.slice(2).join(" ");
    const parsed = parseTimeArg(timeStr);
    if (!parsed) {
      await ctx.reply("Invalid time format. Use HH:MM (UTC), e.g. \`/digest time 07:00\`", { parse_mode: "Markdown" });
      return;
    }
    try {
      await setDigestTime(userId, parsed);
      await ctx.reply(`⏰ Digest delivery time set to \`${parsed}\` UTC.`, { parse_mode: "Markdown" });
    } catch (error) {
      await ctx.reply(`Failed to save digest time: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    return;
  }

  const topicsText = text.slice(text.indexOf(" ") + 1).trim();
  if (topicsText) {
    const topics = topicsText.split(",").map((t: string) => t.trim()).filter(Boolean);
    if (topics.length === 0) {
      await ctx.reply("Please provide at least one topic.");
      return;
    }
    try {
      await setDigestTopics(userId, topics);
      await setDigestEnabled(userId, true);
      await ctx.reply(
        `✅ Topics set and digest enabled!\n\n` +
        `*Topics:* ${topics.join(", ")}\n` +
        `Use \`/digest time HH:MM\` to set delivery time (default 08:00 UTC).\n` +
        `Use \`/digest now\` for a preview.`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      await ctx.reply(`Failed to save digest settings: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}
