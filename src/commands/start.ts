import type { Context } from "telegraf";

export function startCommand(ctx: Context) {
  ctx.reply(
    `*Welcome to Telegram Agent!* 🤖

I'm an AI assistant powered by multiple LLM models. I can:
- 💬 Chat with you using your chosen model
- 🎨 Generate images (just ask!)
- 🌐 Search the web for current info
- 🖼️ Analyze photos and images (powered by Gemini 2.5 Flash)
- 🎤 Transcribe and respond to voice messages

*Commands:*
/start - Show this message
/help - Detailed help
/model - Pick your LLM model
/imagemodel - Pick your FLUX image model
/analyze - Analyze a photo (reply to a photo or send with caption)
/imagine <prompt> - Generate an image
/search <query> - Search the web
/clear - Reset conversation context
/debug - Show debug info
/digest - Daily digest of your topics

Let's get started!`,
    { parse_mode: "Markdown" }
  );
}
