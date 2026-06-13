import type { Context } from "telegraf";

export function helpCommand(ctx: Context) {
  ctx.reply(
    `*Available Commands*

*/start* - Welcome message and overview

*/help* - Shows this help message

*/model* - Opens an interactive menu to select which LLM model to use for chat

*/imagemodel* - Opens an interactive menu to select the FLUX image generation model

*/analyze <question>* - Analyze a photo or image. Reply to a photo with \`/analyze <question>\` or send a photo with a caption. Powered by Google Gemini 2.5 Flash.

*/imagine <prompt>* - Generate an image using FLUX. Example: \`/imagine a serene mountain lake at sunset\`

*/search <query>* - Search the web. Example: \`/search latest AI news\`

*/clear* - Clears your conversation history, starting a fresh session

*/debug* - Shows bot status, current model, and recent error logs

*/digest* - Daily AI-curated news digest. Set topics with \`/digest topic1, topic2\`, set delivery time with \`/digest time HH:MM\` (UTC), preview with \`/digest now\`, toggle with \`/digest on\` / \`/digest off\`

*Voice & Vision:*
- 🎤 Send a voice message and I'll transcribe and respond
- 🖼️ Send a photo with a caption and I'll analyze it automatically (Gemini 2.5 Flash)

*Tips:*
- Chat naturally — I can use tools like web search, image generation, and deep research automatically
- Ask me to "search", "generate an image", or "research" a topic`,
    { parse_mode: "Markdown" }
  );
}
