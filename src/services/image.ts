import { config, FLUX_MODELS } from "../config.js";
import { addLog } from "./debug.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function generateImage(prompt: string, modelKey: keyof typeof FLUX_MODELS = "flux.2-klein-4b"): Promise<Buffer> {
  const model = FLUX_MODELS[modelKey];

  addLog("info", `Image gen request`, { model, prompt: prompt.slice(0, 100) });

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openrouterApiKey}`,
        "HTTP-Referer": "https://github.com/telegram-agent",
        "X-Title": "Telegram Agent",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image"],
      }),
    });
  } catch (fetchError) {
    const msg = fetchError instanceof Error ? fetchError.message : "Network error";
    addLog("error", `Image gen network error`, { error: msg });
    throw new Error(`Network error: ${msg}`);
  }

  if (!response.ok) {
    const text = await response.text();
    addLog("error", `Image gen HTTP ${response.status}`, { body: text.slice(0, 500) });
    throw new Error(`Image generation failed (HTTP ${response.status}): ${response.statusText}`);
  }

  let data: {
    choices?: { message: { content?: string; images?: { image_url: { url: string } }[] } }[];
    error?: { message: string };
  };
  try {
    data = await response.json();
  } catch {
    addLog("error", `Image gen invalid JSON`);
    throw new Error("Invalid JSON from image generation endpoint");
  }

  if (data.error) {
    addLog("error", `Image gen API error`, { message: data.error.message });
    throw new Error(`Image generation error: ${data.error.message}`);
  }

  const images = data.choices?.[0]?.message?.images;
  if (!images || images.length === 0) {
    addLog("error", `Image gen no images in response`, { data: JSON.stringify(data).slice(0, 300) });
    throw new Error("No images in response");
  }

  const imageUrl = images[0].image_url.url;
  addLog("info", `Image gen got result`, { url: imageUrl.slice(0, 60) + (imageUrl.length > 60 ? "..." : "") });

  if (imageUrl.startsWith("data:")) {
    const base64Data = imageUrl.split(",")[1];
    return Buffer.from(base64Data, "base64");
  }

  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) {
    addLog("error", `Image download failed`, { status: imgResponse.status, url: imageUrl.slice(0, 100) });
    throw new Error(`Failed to download image: ${imgResponse.statusText}`);
  }

  const arrayBuffer = await imgResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
