import type { Context } from "telegraf";
import { clearMessages } from "../services/storage.js";

export async function clearCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    await clearMessages(userId);
    await ctx.reply("Conversation context cleared. Starting fresh!");
  } catch (error) {
    await ctx.reply(`Failed to clear context: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
