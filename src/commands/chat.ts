import type { Context } from "telegraf";
import { chatComplete } from "../services/llm.js";
import { generateImage } from "../services/image.js";
import { webSearch } from "../services/search.js";
import { research } from "../services/research.js";
import {
  getMessages,
  addMessage,
  getSelectedModel,
  getSelectedImageModel,
} from "../services/storage.js";
import { TOOLS } from "../tools.js";
import type { ChatMessage, ContentPart, ToolCall } from "../types.js";
import { RESEARCH_TIMEOUT_MS, type FLUX_MODELS } from "../config.js";
import {
  VISION_MODEL,
  downloadTelegramFile,
  prepareImageContent,
  getMimeType,
  VISION_SYSTEM_PROMPT,
} from "../services/vision.js";
import { addLog } from "../services/debug.js";

const MAX_TOOL_ROUNDS = 3;
const TYPING_INTERVAL_MS = 4000;

export async function processUserText(ctx: Context, userId: number, text: string): Promise<void> {
  const model = await getSelectedModel(userId);

  const statusMsg = await ctx.reply("💭 Thinking...");

  try {
    const history = await getMessages(userId);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Current date: " + new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) + ".\n" +
          "You are Hippo, a friendly and helpful Telegram assistant. You have a warm, approachable tone. Limited, tasteful use of emojis is allowed to make responses more engaging.\n" +
          "TOOLS:\n" +
          "- generate_image: Create images from text descriptions using FLUX\n" +
          "- web_search: Search the web for current information\n" +
          "- research: Perform deep, multi-source research on complex topics. Use this when the user needs comprehensive, well-cited analysis.\n" +
          "RULES:\n" +
          "1. Always use the available tools when applicable — do not answer from memory if a tool can provide better results. Use web_search for current events, recent news, or facts. Use generate_image when the user asks to create or generate an image.\n" +
          "2. If a request needs multiple tools, use them sequentially. For example, search first, then use the results to generate an image.\n" +
          "3. If a tool returns an error, explain the issue to the user clearly and offer alternatives if possible.\n" +
          "4. After using a tool, summarize the results conversationally.\n" +
          "5. Keep responses concise and scannable.\n" +
          "6. Always respond in the same language the user wrote in.\n" +
          "7. You have a maximum of 3 tool-use rounds per turn. Plan your calls wisely rather than making many small tool calls.\n" +
          "8. Do not output raw JSON, function call details, or internal reasoning. Only show the user your final answer.",
      },
      ...(history as ChatMessage[]),
      { role: "user", content: text },
    ];

    await addMessage(userId, "user", text);

    let toolRound = 0;
    let finalText = "";

    while (toolRound < MAX_TOOL_ROUNDS) {
      const response = await chatComplete(model, messages, TOOLS);
      const message = response.message;
      const toolCalls = message.tool_calls as ToolCall[] | undefined;

      if (!toolCalls || toolCalls.length === 0) {
        finalText = message.content || "";
        break;
      }

      toolRound++;

      if (toolRound === 1) {
        await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
      }

      const toolStatusMsg = toolRound === 1
        ? await ctx.reply("🛠️ Using tools...")
        : null;

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: null,
        tool_calls: toolCalls,
      };
      messages.push(assistantMsg);

      const imgModelKey = await getSelectedImageModel(userId) as keyof typeof FLUX_MODELS;

      for (const toolCall of toolCalls) {
        const args = JSON.parse(toolCall.function.arguments);

        if (toolCall.function.name === "generate_image") {
          try {
            const imageBuffer = await generateImage(args.prompt, imgModelKey);
            await ctx.replyWithPhoto({ source: imageBuffer });
            await addMessage(userId, "assistant", `[Generated image: ${args.prompt}]`);
            messages.push({
              role: "tool",
              content: `[Image generated: ${args.prompt}]`,
              tool_call_id: toolCall.id,
            });
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : "Unknown error";
            await ctx.reply(`Image generation failed: ${errMsg}`);
            messages.push({
              role: "tool",
              content: `Image generation failed: ${errMsg}`,
              tool_call_id: toolCall.id,
            });
          }
        } else if (toolCall.function.name === "research") {
          const chatId = ctx.chat?.id;
          const typingInterval = setInterval(() => {
            if (chatId) {
              ctx.telegram.sendChatAction(chatId, "typing").catch(() => {});
            }
          }, TYPING_INTERVAL_MS);

          try {
            const report = await research(args.subject, model, args.depth || "standard", RESEARCH_TIMEOUT_MS);
            const maxLen = 6000;
            const truncated =
              report.length > maxLen
                ? report.slice(0, maxLen) + "\n\n... (report truncated)"
                : report;

            messages.push({
              role: "tool",
              content: truncated,
              tool_call_id: toolCall.id,
            });
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : "Unknown error";
            messages.push({
              role: "tool",
              content: `Research failed: ${errMsg}`,
              tool_call_id: toolCall.id,
            });
          } finally {
            clearInterval(typingInterval);
          }
        } else if (toolCall.function.name === "web_search") {
          try {
            const results = await webSearch(args.query);
            const truncated =
              results.length > 2000
                ? results.slice(0, 2000) + "\n\n... (truncated)"
                : results;

            messages.push({
              role: "tool",
              content: truncated,
              tool_call_id: toolCall.id,
            });
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : "Unknown error";
            messages.push({
              role: "tool",
              content: `Search failed: ${errMsg}`,
              tool_call_id: toolCall.id,
            });
          }
        }
      }

      if (toolStatusMsg) {
        await ctx.deleteMessage(toolStatusMsg.message_id).catch(() => {});
      }
    }

    if (toolRound >= MAX_TOOL_ROUNDS) {
      finalText = "I've done several searches but couldn't get a complete answer. Please try rephrasing your question.";
    }

    if (finalText) {
      await ctx.reply(finalText);
      await addMessage(userId, "assistant", finalText);
    }

    if (!finalText && toolRound === 0) {
      await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
      await ctx.reply("No response generated.");
    }
  } catch (error) {
    await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
    await ctx.reply(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function handlePhotoWithText(ctx: Context) {
  const userId = ctx.from?.id;
  addLog("info", "handlePhotoWithText entered", { userId, hasMessage: !!ctx.message });
  if (!userId) return;

  const hasPhoto = ctx.message && "photo" in ctx.message;
  addLog("info", "Photo check", { hasPhoto, messageKeys: ctx.message ? Object.keys(ctx.message) : [] });

  const photo = ctx.message && "photo" in ctx.message ? ctx.message.photo : null;
  if (!photo || photo.length === 0) {
    addLog("warn", "No photo found in message");
    return;
  }

  const caption = (ctx.message && "caption" in ctx.message ? ctx.message.caption : "") || "";
  const largest = photo[photo.length - 1];
  addLog("info", "Photo received", { fileId: largest.file_id, caption: caption.slice(0, 100), photoSizes: photo.length });

  const statusMsg = await ctx.reply("🔍 Analyzing image...");

  try {
    addLog("info", "Getting file link from Telegram");
    const fileLink = await ctx.telegram.getFileLink(largest.file_id);
    addLog("info", "File link obtained", { url: fileLink.href.slice(0, 80) });

    const buffer = await downloadTelegramFile(fileLink.href);
    addLog("info", "File downloaded", { size: buffer.length });

    const imageContent = await prepareImageContent(buffer, "image/jpeg");

    const userText = caption || "Describe this image in detail.";
    const history = await getMessages(userId);
    addLog("info", "Building vision messages", { historyLen: history.length, userText });

    const messages: ChatMessage[] = [
      { role: "system", content: VISION_SYSTEM_PROMPT },
      ...(history as ChatMessage[]),
      {
        role: "user",
        content: [
          { type: "text", text: userText } as ContentPart,
          imageContent,
        ] as ContentPart[],
      },
    ];

    addLog("info", "Calling vision model", { model: VISION_MODEL });
    const response = await chatComplete(VISION_MODEL, messages);
    addLog("info", "Vision response received", { finishReason: response.finish_reason, hasContent: !!response.message.content });

    const replyText = response.message.content?.trim() || "I couldn't analyze that image.";

    await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
    await ctx.reply(replyText);

    const captionPreview = caption.length > 80 ? caption.slice(0, 80) + "..." : (caption || "[no caption]");
    await addMessage(userId, "user", `[Attached image] ${captionPreview}`);
    await addMessage(userId, "assistant", replyText);
    addLog("info", "Photo analysis complete", { replyLength: replyText.length });
  } catch (error) {
    await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
    const msg = error instanceof Error ? error.message : "Unknown error";
    addLog("error", "Photo analysis failed", { error: msg, stack: error instanceof Error ? error.stack?.slice(0, 300) : undefined });
    await ctx.reply(`Image analysis failed: ${msg}`);
  }
}

export async function handleChat(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  if (!text || text.startsWith("/")) return;

  await processUserText(ctx, userId, text);
}
