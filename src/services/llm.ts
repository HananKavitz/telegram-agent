import { config } from "../config.js";
import { addLog } from "./debug.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenRouterChoice {
  finish_reason: string;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: ToolCall[];
  };
}

interface OpenRouterError {
  code: number;
  message: string;
  metadata?: Record<string, unknown>;
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: OpenRouterError;
}

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const FALLBACK_MODELS = [
  "openrouter/free",
  "google/gemma-4-31b-it:free",
  "qwen/qwen3-coder:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

const blockedModels = new Set<string>();
const BLOCK_DURATION_MS = 10 * 60 * 1000;

function isModelBlocked(model: string): boolean {
  return blockedModels.has(model);
}

function blockModel(model: string): void {
  blockedModels.add(model);
  setTimeout(() => blockedModels.delete(model), BLOCK_DURATION_MS);
}

async function tryChatComplete(
  model: string,
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<{ choice: OpenRouterChoice; model: string; fallbackReason?: string }> {
  const body: Record<string, unknown> = {
    model,
    messages,
  };
  if (tools) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  addLog("info", `LLM request: ${model}`, {
    msgCount: messages.length,
    hasTools: !!tools,
  });

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
      body: JSON.stringify(body),
    });
  } catch (fetchError) {
    const msg = fetchError instanceof Error ? fetchError.message : "Network error";
    addLog("error", `LLM network error`, { error: msg });
    throw new Error(`Network error contacting OpenRouter: ${msg}`);
  }

  const responseText = await response.text();

  if (!response.ok) {
    const details: Record<string, unknown> = {
      status: response.status,
      statusText: response.statusText,
    };

    try {
      const errData = JSON.parse(responseText);
      if (errData.error) {
        details.errorCode = errData.error.code;
        details.errorMessage = errData.error.message;
        if (errData.error.metadata) {
          details.metadata = errData.error.metadata;
        }
      }
    } catch {
      details.body = responseText.slice(0, 500);
    }

    addLog("error", `LLM HTTP ${response.status}`, details);

    const errorCode = (details.errorCode as string) || String(response.status);
    const errorMsg = (details.errorMessage as string) || response.statusText;
    const error = new Error(`OpenRouter error (${errorCode}): ${errorMsg}`);
    (error as unknown as Record<string, unknown>).statusCode = response.status;
    throw error;
  }

  let data: OpenRouterResponse;
  try {
    data = JSON.parse(responseText) as OpenRouterResponse;
  } catch {
    addLog("error", `LLM invalid JSON response`, { body: responseText.slice(0, 500) });
    throw new Error("OpenRouter returned invalid JSON response");
  }

  if (data.error) {
    addLog("error", `LLM returned error object`, {
      code: data.error.code,
      message: data.error.message,
      metadata: data.error.metadata,
    });
    const error = new Error(`OpenRouter error: ${data.error.message}`);
    (error as unknown as Record<string, unknown>).statusCode = data.error.code;
    throw error;
  }

  if (!data.choices || data.choices.length === 0) {
    addLog("error", `LLM no choices in response`, { response: responseText.slice(0, 500) });
    throw new Error("OpenRouter returned no choices");
  }

  const choice = data.choices[0];
  addLog("info", `LLM response: ${choice.finish_reason}`, {
    finishReason: choice.finish_reason,
    hasToolCalls: !!choice.message.tool_calls,
    contentLength: choice.message.content?.length || 0,
  });

  return { choice, model };
}

function isRetryableError(error: Error): boolean {
  const statusCode = (error as unknown as Record<string, unknown>).statusCode;
  const msg = error.message.toLowerCase();

  if (statusCode === 429) return true;
  if (statusCode === 503) return true;
  if (msg.includes("rate limit") || msg.includes("rate_limit")) return true;
  if (msg.includes("temporarily")) return true;
  if (msg.includes("provider returned error") && msg.includes("rate")) return true;

  return false;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
  baseDelay = 2000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const err = error instanceof Error ? error : new Error(String(error));
      if (!isRetryableError(err)) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      addLog("warn", `${label}: attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms`, {
        error: err.message,
      });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

export async function chatComplete(
  model: string,
  messages: ChatMessage[],
  tools?: ToolDefinition[]
): Promise<OpenRouterChoice> {
  const triedModels: string[] = [];
  let lastError: Error | null = null;

  if (isModelBlocked(model)) {
    addLog("info", `Skipping blocked model ${model}, going directly to fallbacks`);
  } else {
    triedModels.push(model);

    try {
      const result = await retryWithBackoff(
        () => tryChatComplete(model, messages, tools),
        `Primary model ${model}`,
        3, 2000
      );
      return result.choice;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message.includes("429") || (lastError as any).statusCode === 429) {
        blockModel(model);
      }
      addLog("warn", `Primary model ${model} exhausted, trying fallbacks...`, {
        error: lastError.message,
      });
    }
  }

  for (const fallbackModel of FALLBACK_MODELS) {
    if (triedModels.includes(fallbackModel)) continue;
    triedModels.push(fallbackModel);

    try {
      const result = await retryWithBackoff(
        () => tryChatComplete(fallbackModel, messages, tools),
        `Fallback ${fallbackModel}`,
        2, 3000
      );
      addLog("info", `Fallback succeeded with ${fallbackModel}`);
      return result.choice;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      addLog("warn", `Fallback ${fallbackModel} exhausted`, {
        error: lastError.message,
      });
    }
  }

  addLog("error", `All models failed`, {
    tried: triedModels,
    lastError: lastError?.message,
  });

  if (lastError) {
    throw new Error(`All models failed. Last error: ${lastError.message}`);
  }
  throw new Error("All models failed (no last error)");
}
