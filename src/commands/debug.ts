import type { Context } from "telegraf";
import { getLogs, getLastError } from "../services/debug.js";
import { getSelectedModel, getTotalMessageCount } from "../services/storage.js";
import { config, AVAILABLE_MODELS } from "../config.js";

function esc(text: string): string {
  return text.replace(/[_*[`]/g, "\\$&");
}

export async function debugCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const model = await getSelectedModel(userId);
  const modelName = AVAILABLE_MODELS.find((m) => m.slug === model)?.name || model;
  const lastError = getLastError();
  const recentLogs = getLogs(undefined, 10);
  const totalMessages = await getTotalMessageCount();
  let msg = `*Bot Debug Info*\n\n`;
  msg += `*Status:* Running\n`;
  msg += `*Database:* Turso (remote)\n`;
  msg += `*Total Messages Stored:* ${totalMessages}\n`;
  msg += `*Selected Model:* \`${esc(modelName)}\`\n`;
  msg += `*Model Slug:* \`${esc(model)}\`\n`;
  msg += `*Default Model:* \`${esc(config.defaultModel)}\`\n\n`;

  if (lastError) {
    msg += `*Last Error:*\n${esc(lastError.message)}\n`;
    if (lastError.details) {
      msg += `Details: ${esc(JSON.stringify(lastError.details).slice(0, 300))}\n`;
    }
    msg += `\n`;
  } else {
    msg += `*Last Error:* None\n\n`;
  }

  msg += `*Recent Logs (${recentLogs.length}):*\n`;
  for (const log of recentLogs.slice(-5)) {
    const icon = log.level === "error" ? "❌" : log.level === "warn" ? "⚠️" : "ℹ️";
    const time = log.timestamp.slice(11, 19);
    msg += `${icon} \`${time}\` ${esc(log.message)}\n`;
  }

  msg += `\n*Tip:* Check bot-error.log for full error details.`;

  await ctx.reply(msg, { parse_mode: "Markdown" });
}
