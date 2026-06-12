import { config } from "../config.js";
import { addLog } from "./debug.js";

const STT_URL = "https://openrouter.ai/api/v1/audio/transcriptions";

interface SttResponse {
  text: string;
  usage?: {
    seconds: number;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    cost: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

export async function transcribeAudio(audioBuffer: Buffer, format: string): Promise<string> {
  addLog("info", `Transcription request`, { format, size: audioBuffer.length });

  const base64Data = audioBuffer.toString("base64");

  let response: Response;
  try {
    response = await fetch(STT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openrouterApiKey}`,
      },
      body: JSON.stringify({
        model: "openai/whisper-1",
        input_audio: {
          data: base64Data,
          format,
        },
      }),
    });
  } catch (fetchError) {
    const msg = fetchError instanceof Error ? fetchError.message : "Network error";
    addLog("error", `Transcription network error`, { error: msg });
    throw new Error(`Network error contacting OpenRouter STT: ${msg}`);
  }

  const responseText = await response.text();

  if (!response.ok) {
    addLog("error", `Transcription HTTP ${response.status}`, { body: responseText.slice(0, 500) });
    throw new Error(`Transcription failed (HTTP ${response.status}): ${response.statusText}`);
  }

  let data: SttResponse;
  try {
    data = JSON.parse(responseText) as SttResponse;
  } catch {
    addLog("error", `Transcription invalid JSON`, { body: responseText.slice(0, 500) });
    throw new Error("OpenRouter STT returned invalid JSON");
  }

  if (data.error) {
    addLog("error", `Transcription API error`, { code: data.error.code, message: data.error.message });
    throw new Error(`Transcription error: ${data.error.message}`);
  }

  const text = data.text?.trim();

  if (!text) {
    addLog("info", `Transcription empty result`);
    return "";
  }

  if (data.usage) {
    addLog("info", `Transcription complete`, {
      seconds: data.usage.seconds,
      cost: data.usage.cost,
      chars: text.length,
    });
  }

  return text;
}
