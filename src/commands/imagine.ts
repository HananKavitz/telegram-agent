import type { Context } from "telegraf";
import { generateImage } from "../services/image.js";
import { getSelectedImageModel } from "../services/storage.js";
import type { FLUX_MODELS } from "../config.js";

export async function imagineCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const prompt = text.replace(/^\/imagine\s*/i, "").trim();

  if (!prompt) {
    await ctx.reply("Please provide an image description. Example: `/imagine a cat in space`", {
      parse_mode: "Markdown",
    });
    return;
  }

  const modelKey = getSelectedImageModel(userId) as keyof typeof FLUX_MODELS;
  const statusMsg = await ctx.reply(`🎨 Generating image: "${prompt}"...`);

  try {
    const imageBuffer = await generateImage(prompt, modelKey);
    await ctx.deleteMessage(statusMsg.message_id);
    await ctx.replyWithPhoto({ source: imageBuffer });
  } catch (error) {
    await ctx.deleteMessage(statusMsg.message_id);
    await ctx.reply(`Image generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
