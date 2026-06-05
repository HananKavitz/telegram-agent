import type { Context } from "telegraf";
import { generateImage } from "../services/image.js";

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

  const statusMsg = await ctx.reply(`🎨 Generating image: "${prompt}"...`);

  try {
    const imageBuffer = await generateImage(prompt);
    await ctx.deleteMessage(statusMsg.message_id);
    await ctx.replyWithPhoto({ source: imageBuffer });
  } catch (error) {
    await ctx.deleteMessage(statusMsg.message_id);
    await ctx.reply(`Image generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
