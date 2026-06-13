import type { Context } from "telegraf";

export function helpCommand(ctx: Context) {
  ctx.reply(
    `*Available Commands*

*/start* - Welcome message and overview

*/help* - Shows this help message

*/model* - Opens an interactive menu to select which LLM model to use for chat. Options include free models (Mistral 7B, Llama 3.1 8B, DeepSeek) and cheap paid models (Gemini Flash, GPT-4o Mini, Claude Haiku).

*/imagine <prompt>* - Directly generate an image using FLUX. Example: /imagine a serene mountain lake at sunset

*/search <query>* - Directly search the web. Example: /search latest AI news 2026

*/clear* - Clears your conversation history, starting a fresh session

*/debug* - Shows bot status, current model, and recent error logs for troubleshooting

*/digest* - Daily digest with AI-synthesized updates on your topics. \`/digest <topic1, topic2>\` to set topics and enable. \`/digest time HH:MM\` to set time (UTC). \`/digest now\` for preview. \`/digest off\` to disable.

*Tips:*
- You can also just chat normally — the bot will use your selected model
- Ask the bot to "generate an image of..." and it will create one automatically
- Ask the bot to "search for..." and it will look up current information`,
    { parse_mode: "Markdown" }
  );
}
