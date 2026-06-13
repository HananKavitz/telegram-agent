import { Markup } from "telegraf";
import type { Context } from "telegraf";
import { AVAILABLE_MODELS } from "../config.js";
import { getSelectedModel, setSelectedModel } from "../services/storage.js";

export async function modelCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const currentModel = await getSelectedModel(userId);

  const buttons = AVAILABLE_MODELS.map((m) =>
    Markup.button.callback(
      `${m.slug === currentModel ? "✓ " : "  "}${m.name}`,
      `model:${m.slug}`
    )
  );

  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    keyboard.push(buttons.slice(i, i + 2));
  }

  const currentName = AVAILABLE_MODELS.find((m) => m.slug === currentModel)?.name || currentModel;

  await ctx.reply(
    `*Select your LLM model*

Current: \`${currentName}\`

Choose from the list below:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(keyboard),
    }
  );
}

export async function handleModelSelection(ctx: Context) {
  if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) return;
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("model:")) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  const modelSlug = data.replace("model:", "");

  try {
    await setSelectedModel(userId, modelSlug);

    const modelName = AVAILABLE_MODELS.find((m) => m.slug === modelSlug)?.name || modelSlug;

    await ctx.editMessageText(
      `*Model Selected* ✅\n\nSwitched to: \`${modelName}\``,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    await ctx.editMessageText(
      `Failed to save model selection: ${error instanceof Error ? error.message : "Unknown error"}`
    ).catch(() => {});
  }
}
