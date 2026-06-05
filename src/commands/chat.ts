import type { Context } from "telegraf";
import { chatComplete } from "../services/llm.js";
import { generateImage } from "../services/image.js";
import { webSearch } from "../services/search.js";
import { addLog } from "../services/debug.js";
import {
  getMessages,
  addMessage,
  getSelectedModel,
} from "../services/storage.js";
import { TOOLS } from "../tools.js";
import type { ChatMessage, ToolCall } from "../types.js";

const SEARCH_KEYWORDS = [
  "search", "find", "look up", "google", "what is", "what are",
  "who is", "tell me about", "news", "current", "latest",
  "weather", "price", "stock", "update", "recent",
];

function needsSearch(text: string): boolean {
  const lower = text.toLowerCase();
  return SEARCH_KEYWORDS.some(kw => lower.includes(kw));
}

const IMAGE_KEYWORDS = [
  "generate", "create", "draw", "make an image", "make a picture",
  "imagine", "picture of", "image of", "generate a photo",
];

function needsImage(text: string): boolean {
  const lower = text.toLowerCase();
  return IMAGE_KEYWORDS.some(kw => lower.includes(kw));
}

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
    addMessage(userId, "user", text);

    const toolResults: { name: string; content: string }[] = [];
    const searchQuery = needsSearch(text) ? text : null;
    const imagePrompt = needsImage(text) ? text : null;

    if (imagePrompt && !searchQuery) {
      await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
      const imgStatus = await ctx.reply("🎨 Generating image...");
      try {
        const imageBuffer = await generateImage(imagePrompt);
        await ctx.deleteMessage(imgStatus.message_id).catch(() => {});
        await ctx.replyWithPhoto({ source: imageBuffer });
        addMessage(userId, "assistant", `[Generated image: ${imagePrompt}]`);
      } catch (error) {
        await ctx.deleteMessage(imgStatus.message_id).catch(() => {});
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        await ctx.reply(`Image generation failed: ${errMsg}`);
        addMessage(userId, "assistant", `Image generation failed: ${errMsg}`);
      }
      return;
    }

    if (searchQuery) {
      await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
      await ctx.reply("🔍 Searching...");
      try {
        const results = await webSearch(searchQuery);
        toolResults.push({
          name: "web_search",
          content: results.length > 2000 ? results.slice(0, 2000) + "\n\n... (truncated)" : results,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        toolResults.push({
          name: "web_search",
          content: `Search failed: ${errMsg}`,
        });
      }
    }

    const systemContent = toolResults.length > 0
      ? `You are a helpful AI assistant. The user asked a question that required a web search. Here are the search results:\n\n${toolResults.map(r => r.content).join("\n\n")}\n\nPlease summarize these results for the user in a helpful way. If the search failed, let the user know.`
      : "You are a helpful AI assistant. Answer the user's question conversationally.";

    const messages: ChatMessage[] = [
      { role: "system", content: systemContent },
      ...(history as ChatMessage[]),
      { role: "user", content: text },
    ];

    const response = await chatComplete(model, messages);
    const finalText = response.message.content || "";
    const toolCalls = response.message.tool_calls as ToolCall[] | undefined;

    if (toolCalls && toolCalls.length > 0) {
      addLog("info", "Model returned tool_calls despite pre-processing", {
        toolCount: toolCalls.length,
        names: toolCalls.map(tc => tc.function.name),
      });

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: null,
        tool_calls: toolCalls,
      };
      messages.push(assistantMsg);

      for (const toolCall of toolCalls) {
        const args = JSON.parse(toolCall.function.arguments);
        if (toolCall.function.name === "web_search") {
          try {
            const results = await webSearch(args.query);
            const truncated = results.length > 2000 ? results.slice(0, 2000) + "\n\n... (truncated)" : results;
            messages.push({ role: "tool", content: truncated, tool_call_id: toolCall.id });
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : "Unknown error";
            messages.push({ role: "tool", content: `Search failed: ${errMsg}`, tool_call_id: toolCall.id });
          }
        } else if (toolCall.function.name === "generate_image") {
          try {
            const imageBuffer = await generateImage(args.prompt);
            await ctx.replyWithPhoto({ source: imageBuffer });
            messages.push({ role: "tool", content: `[Image generated: ${args.prompt}]`, tool_call_id: toolCall.id });
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : "Unknown error";
            messages.push({ role: "tool", content: `Image generation failed: ${errMsg}`, tool_call_id: toolCall.id });
          }
        }
      }

      const response2 = await chatComplete(model, messages);
      if (response2.message.content) {
        await ctx.reply(response2.message.content);
        addMessage(userId, "assistant", response2.message.content);
      }
      return;
    }

    if (finalText) {
      await ctx.reply(finalText);
      addMessage(userId, "assistant", finalText);
    } else {
      await ctx.reply("No response generated.");
    }

  } catch (error) {
    await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
    await ctx.reply(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
