import bot from "./bot.js";
import { initDatabase } from "./services/storage.js";

async function main() {
  try {
    await initDatabase();
    console.log("Database initialized.");

    bot.launch();
    console.log("Bot is running...");
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exit(1);
  }
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

main();
