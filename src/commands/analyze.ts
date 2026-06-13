import type { Context } from "telegraf";
import { chatComplete } from "../services/llm.js";
import { VISION_MODEL, downloadTelegramFile, prepareImageContent, getMimeType, VISION_SYSTEM_PROMPT } from "../services/vision.js";
import { addMessage, getMessages } from "../services/storage.js";
import type { ChatMessage, ContentPart } from "../types.js";

function getCommandText(ctx: Context): string {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  return text.replace(/^\/\w+@?\w*/i, "").trim();
}

function getPhotoFromMessage(ctx: Context): { fileId: string; mimeType: string } | null {
  if (ctx.message && "photo" in ctx.message && ctx.message.photo) {
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    return { fileId: largest.file_id, mimeType: "image/jpeg" };
  }
  return null;
}

function getPhotoFromReply(ctx: Context): { fileId: string; mimeType: string } | null {
  const replyTo = ctx.message && "reply_to_message" in ctx.message ? (ctx.message as any).reply_to_message : null;
  if (!replyTo) return null;
  if ("photo" in replyTo && replyTo.photo) {
    const photos = replyTo.photo;
    const largest = photos[photos.length - 1];
    return { fileId: largest.file_id, mimeType: "image/jpeg" };
  }
  return null;
}

export async function analyzeCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const photo = getPhotoFromMessage(ctx) || getPhotoFromReply(ctx);

  if (!photo) {
    await ctx.reply(
      "Please reply to a photo with `/analyze <your question>` to analyze an image.\n\n" +
      "Example: reply to a photo with `/analyze what breed is this dog?`\n\n" +
      "You can also just send a photo with a caption and I'll analyze it automatically.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const userQuestion = getCommandText(ctx) || "Describe this image in detail.";
  const statusMsg = await ctx.reply("🔍 Analyzing image...");

  try {
    const fileLink = await ctx.telegram.getFileLink(photo.fileId);
    const buffer = await downloadTelegramFile(fileLink.href);
    const imageContent = await prepareImageContent(buffer, photo.mimeType);

    const history = await getMessages(userId);
    const messages: ChatMessage[] = [
      { role: "system", content: VISION_SYSTEM_PROMPT },
      ...(history as ChatMessage[]),
      {
        role: "user",
        content: [
          { type: "text" as const, text: userQuestion },
          imageContent,
        ] as ContentPart[],
      },
    ];

    const response = await chatComplete(VISION_MODEL, messages);
    const replyText = response.message.content?.trim() || "I couldn't analyze that image.";

    await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
    await ctx.reply(replyText);

    const captionPreview = userQuestion.length > 80 ? userQuestion.slice(0, 80) + "..." : userQuestion;
    await addMessage(userId, "user", `[Analyzed image] ${captionPreview}`);
    await addMessage(userId, "assistant", replyText);
  } catch (error) {
    await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
    const msg = error instanceof Error ? error.message : "Unknown error";
    await ctx.reply(`Image analysis failed: ${msg}`);
  }
}
