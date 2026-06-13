import type { ContentPart } from "../types.js";
import { addLog } from "./debug.js";

export const VISION_MODEL = "google/gemini-2.5-flash";

const MIME_MAP: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

export function getMimeType(format: string): string {
  return MIME_MAP[format] || "image/jpeg";
}

export async function prepareImageContent(buffer: Buffer, mimeType: string): Promise<ContentPart> {
  addLog("info", "Preparing image for vision", { mimeType, size: buffer.length });
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;
  addLog("info", "Image encoded", { base64Length: base64.length, dataUrlPrefix: dataUrl.slice(0, 60) + "..." });
  return {
    type: "image_url",
    image_url: { url: dataUrl },
  };
}

export async function downloadTelegramFile(url: string): Promise<Buffer> {
  addLog("info", "Downloading Telegram file", { url: url.slice(0, 80) });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export const VISION_SYSTEM_PROMPT =
  "You are Hippo, a friendly and helpful Telegram assistant with vision capabilities. " +
  "You can see and analyze images that users send you. " +
  "Current date: " + new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) + ".\n" +
  "Examine the image carefully and answer the user's questions about it. " +
  "If the user hasn't asked a specific question, describe the image in detail. " +
  "Be concise and helpful. Limited, tasteful use of emojis is allowed.";
