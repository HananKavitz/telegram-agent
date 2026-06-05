import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  openrouterApiKey: requireEnv("OPENROUTER_API_KEY"),
  serpapiApiKey: requireEnv("SERPAPI_API_KEY"),
  databasePath: process.env.DATABASE_PATH || "./data/bot.db",
  defaultModel: process.env.DEFAULT_MODEL || "openrouter/free",
} as const;

export const AVAILABLE_MODELS = [
  { slug: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B (Free)" },
  { slug: "google/gemma-4-31b-it:free", name: "Gemma 4 31B (Free)" },
  { slug: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (Free)" },
  { slug: "qwen/qwen3-coder:free", name: "Qwen 3 Coder (Free)" },
  { slug: "openrouter/free", name: "Auto Route (Free)" },
  { slug: "openai/gpt-4o-mini", name: "GPT-4o Mini (Paid)" },
  { slug: "openai/gpt-4o", name: "GPT-4o (Paid)" },
] as const;

export const FLUX_MODELS = {
  "flux.2-pro": "black-forest-labs/flux.2-pro",
  "flux.2-flex": "black-forest-labs/flux.2-flex",
  "flux.2-klein-4b": "black-forest-labs/flux.2-klein-4b",
} as const;

export const MAX_CONTEXT_PAIRS = 10;
