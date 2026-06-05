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

export async function handleChat(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  if (!text) return;

  if (text.startsWith("/")) return;

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
          "After generating an image, describe what you created. " +
          "After searching, summarize the results for the user.",
      },
      ...(history as ChatMessage[]),
      { role: "user", content: text },
    ];

    addMessage(userId, "user", text);

    const response = await chatComplete(model, messages, TOOLS);
    const message = response.message;
    const toolCalls = message.tool_calls as ToolCall[] | undefined;

    if (toolCalls && toolCalls.length > 0) {
      await ctx.deleteMessage(statusMsg.message_id);
      const toolStatusMsg = await ctx.reply("🛠️ Using tools...");

      for (const toolCall of toolCalls) {
        const args = JSON.parse(toolCall.function.arguments);

        if (toolCall.function.name === "generate_image") {
          try {
            const imageBuffer = await generateImage(args.prompt);
            await ctx.replyWithPhoto({ source: imageBuffer });
            addMessage(userId, "assistant", `[Generated image: ${args.prompt}]`);
          } catch (error) {
            await ctx.reply(`Image generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
            addMessage(userId, "assistant", `[Image generation failed: ${args.prompt}]`);
          }
        } else if (toolCall.function.name === "web_search") {
          try {
            const results = await webSearch(args.query);
            const truncated =
              results.length > 1500
                ? results.slice(0, 1500) + "\n\n... (truncated)"
                : results;

            messages.push({
              role: "assistant",
              content: null as unknown as string,
              tool_call_id: toolCall.id,
            });
            messages.push({
              role: "tool",
              content: truncated,
              tool_call_id: toolCall.id,
            });

            const finalResponse = await chatComplete(model, messages);
            const finalText = finalResponse.message.content || "Search complete.";

              await ctx.reply(finalText);
            addMessage(userId, "assistant", finalText);
          } catch (error) {
            await ctx.reply(`Search failed: ${error instanceof Error ? error.message : "Unknown error"}`);
            addMessage(userId, "assistant", `[Search failed: ${args.query}]`);
          }
        }
      }

      await ctx.deleteMessage(toolStatusMsg.message_id);
    } else {
      await ctx.deleteMessage(statusMsg.message_id);
      const content = message.content || "No response generated.";
      await ctx.reply(content);
      addMessage(userId, "assistant", content);
    }
  } catch (error) {
    await ctx.deleteMessage(statusMsg.message_id).catch(() => {});
    await ctx.reply(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
