import http from "http";
import bot from "./bot.js";
import { initDatabase } from "./services/storage.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK");
});

async function main() {
  try {
    await initDatabase();
    console.log("Database initialized.");

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Health check server listening on 0.0.0.0:${PORT}`);
    });

    bot.launch();
    console.log("Bot is running...");
  } catch (error) {
    console.error("Failed to start bot:", error);
    process.exit(1);
  }
}

process.once("SIGINT", () => { server.close(); bot.stop("SIGINT"); });
process.once("SIGTERM", () => { server.close(); bot.stop("SIGTERM"); });

main();
