import { Markup } from "telegraf";
import type { Context } from "telegraf";
import { FLUX_MODELS } from "../config.js";
import { getSelectedImageModel, setSelectedImageModel } from "../services/storage.js";

const FLUX_OPTIONS = Object.entries(FLUX_MODELS).map(([key, slug]) => ({
  key,
  name: key.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
  slug,
}));

export async function imageModelCommand(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const currentModel = await getSelectedImageModel(userId);

  const buttons = FLUX_OPTIONS.map((m) =>
    Markup.button.callback(
      `${m.key === currentModel ? "✓ " : "  "}${m.name}`,
      `imagemodel:${m.key}`
    )
  );

  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    keyboard.push(buttons.slice(i, i + 2));
  }

  const currentName = FLUX_OPTIONS.find(m => m.key === currentModel)?.name || currentModel;

  await ctx.reply(
    `*Select your Image Generation model*

Current: \`${currentName}\`

Choose from the list below:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(keyboard),
    }
  );
}

export async function handleImageModelSelection(ctx: Context) {
  if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) return;
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("imagemodel:")) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  const modelKey = data.replace("imagemodel:", "");

  try {
    await setSelectedImageModel(userId, modelKey);

    const modelName = FLUX_OPTIONS.find(m => m.key === modelKey)?.name || modelKey;

    await ctx.editMessageText(
      `*Image Model Selected* ✅\n\nSwitched to: \`${modelName}\``,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    await ctx.editMessageText(
      `Failed to save image model selection: ${error instanceof Error ? error.message : "Unknown error"}`
    ).catch(() => {});
  }
}
