# Telegram Agent (Hippo Bot)

A multi-purpose Telegram assistant bot powered by OpenRouter-hosted LLMs with web search, image generation, and deep research capabilities.

## Capabilities

- **Conversational AI chat** — talk naturally; the bot selects the appropriate LLM model and can autonomously use tools
- **Web search** — search the web via SerpAPI and return formatted results
- **Image generation** — generate images from text prompts using FLUX models via OpenRouter
- **Deep research** — multi-phase, multi-source research producing structured reports with executive summary, key findings, detailed analysis, and citations

## Commands

| Command | Description |
|---|---|
| `/start` | Welcome message listing capabilities |
| `/help` | Detailed help for all commands |
| `/model` | Select the LLM chat model |
| `/imagemodel` | Select the FLUX image generation model |
| `/clear` | Delete your conversation history |
| `/imagine <prompt>` | Generate an image from a text prompt |
| `/search <query>` | Perform a web search |
| `/debug` | Show bot status and logs |

Plain text messages (not starting with `/`) trigger the conversational AI with tool support.

## How to Run

### Prerequisites
- Node.js 18+
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- OpenRouter API key
- SerpAPI key

### Setup

1. Clone the repo and install dependencies:
   ```
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your keys:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   OPENROUTER_API_KEY=your_openrouter_api_key
   SERPAPI_API_KEY=your_serpapi_api_key
   DATABASE_PATH=./data/bot.db
   DEFAULT_MODEL=google/gemini-2.0-flash-001
   RESEARCH_TIMEOUT_MS=120000
   SEARCH_TIMEOUT_MS=15000
   LLM_TIMEOUT_MS=30000
   ```

### Run

- **Development** (hot reload):
  ```
  npm run dev
  ```
- **Production**:
  ```
  npm run build
  npm start
  ```
- **Docker**:
  ```
  docker compose up -d
  ```

The bot starts an HTTP health check server on port 3000 and begins polling Telegram for updates.
