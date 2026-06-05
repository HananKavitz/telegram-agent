import type { Context } from "telegraf";
import { chatComplete } from "../services/llm.js";
import { generateImage } from "../services/image.js";
import { webSearch } from "../services/search.js";
import {
  getMessages,
  addMessage,
  getSelectedModel,
} from "../services/storage.js";
import { TOOLS } from "../tools.js";
import type { ChatMessage, ToolCall } from "../types.js";

const MAX_TOOL_ROUNDS = 3;

export async function handleChat(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  if (!text || text.startsWith("/")) return;

  const model = getSelectedModel(userId);

  const statusMsg = await ctx.reply("💭 Thinking...");

  try {
    const history = getMessages(userId);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a helpful AI assistant. You have access to tools:\n" +
          "- generate_image: Create images from text descriptions using FLUX\n" +
          "- web_search: Search the web for current information\n" +
          "When the user asks you to create an image or search the web, use the appropriate tool. " +
          "After using a tool, ALWAYS summarize the results for the user. " +
          "Do not call tools more than once per query — if you already have the answer, just respond directly.",
      },
      ...(history as ChatMessage[]),
      { role: "user", content: text },
    ];

    addMessage(userId, "user", text);

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

      for (const toolCall of toolCalls) {
        const args = JSON.parse(toolCall.function.arguments);

        if (toolCall.function.name === "generate_image") {
          try {
            const imageBuffer = await generateImage(args.prompt);
            await ctx.replyWithPhoto({ source: imageBuffer });
            addMessage(userId, "assistant", `[Generated image: ${args.prompt}]`);
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
      addMessage(userId, "assistant", finalText);
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
