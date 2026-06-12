import type { Context } from "telegraf";
import { transcribeAudio } from "../services/transcription.js";
import { processUserText } from "./chat.js";

const SUPPORTED_FORMATS = ["ogg", "mp3", "wav", "m4a", "webm", "aac", "flac"];

function getFormat(mimeType: string | undefined): string {
  if (!mimeType) return "ogg";
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/webm": "webm",
    "audio/aac": "aac",
    "audio/flac": "flac",
  };
  return map[mimeType] || "ogg";
}

export async function handleVoice(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const voice = ctx.message && "voice" in ctx.message ? ctx.message.voice : null;
  if (!voice) return;

  const statusMsg = await ctx.reply("🎤 Transcribing...");

  try {
    const fileLink = await ctx.telegram.getFileLink(voice.file_id);
    const response = await fetch(fileLink.href);
    if (!response.ok) {
      throw new Error(`Failed to download voice file: ${response.statusText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const format = getFormat(voice.mime_type);

    if (!SUPPORTED_FORMATS.includes(format)) {
      await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
      await ctx.reply(`Unsupported audio format: ${format}. Supported formats: ${SUPPORTED_FORMATS.join(", ")}`);
      return;
    }

    const text = await transcribeAudio(audioBuffer, format);

    await ctx.deleteMessage(statusMsg.message_id).catch(() => {});

    if (!text) {
      await ctx.reply("I couldn't make out any speech in that voice message. Could you try speaking more clearly or typing your message?");
      return;
    }

    const displayText = text.length > 100 ? text.slice(0, 100) + "..." : text;
    await ctx.reply(`You said: "${displayText}"`);

    await processUserText(ctx, userId, text);
  } catch (error) {
    await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
    const msg = error instanceof Error ? error.message : "Unknown error";
    await ctx.reply(`Voice processing failed: ${msg}`);
  }
}
