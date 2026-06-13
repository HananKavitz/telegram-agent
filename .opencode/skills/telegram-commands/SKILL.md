---
name: telegram-commands
description: Use when the user wants to register, update, or view Telegram bot commands for BotFather's /setcommands. Generates a formatted command list from the project's bot source code.
---

# Telegram Commands Generator

Read the bot's source code and produce a command list formatted for BotFather's `/setcommands`.

## Instructions

1. Read `src/bot.ts` to find every command registered via `bot.command("name", ...)`
2. Read each corresponding file in `src/commands/` to extract the command description
3. Output the list in BotFather pasteable format:

```
command1 - Short description
command2 - Short description
```

## Rules

- Use only the command name (no leading `/`, no `<args>` placeholders)
- Descriptions must be ≤ 256 characters
- Keep descriptions concise and user-friendly
- Exclude non-command handlers like `bot.on("text", ...)` and `bot.on(message("voice"), ...)`
- Sort alphabetically by command name
