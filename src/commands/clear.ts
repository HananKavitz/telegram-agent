import type { Context } from "telegraf";
import { clearMessages } from "../services/storage.js";

export function clearCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  clearMessages(userId);
  ctx.reply("Conversation context cleared. Starting fresh!");
}
