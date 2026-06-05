import { Telegraf } from "telegraf";
import { config } from "./config.js";
import { startCommand } from "./commands/start.js";
import { helpCommand } from "./commands/help.js";
import { modelCommand, handleModelSelection } from "./commands/model.js";
import { clearCommand } from "./commands/clear.js";
import { imagineCommand } from "./commands/imagine.js";
import { searchCommand } from "./commands/search.js";
import { debugCommand } from "./commands/debug.js";
import { handleChat } from "./commands/chat.js";

const bot = new Telegraf(config.telegramBotToken);

bot.start(startCommand);
bot.help(helpCommand);

bot.command("model", modelCommand);
bot.action(/^model:/, handleModelSelection);

bot.command("clear", clearCommand);
bot.command("imagine", imagineCommand);
bot.command("search", searchCommand);
bot.command("debug", debugCommand);

bot.on("text", handleChat);

export default bot;
