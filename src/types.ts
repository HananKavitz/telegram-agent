export type ContentPart = {
  type: "text";
  text: string;
} | {
  type: "image_url";
  image_url: {
    url: string;
  };
};

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string | null | ContentPart[];
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}
