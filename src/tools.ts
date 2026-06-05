import type { ToolDefinition } from "./types.js";

export const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "generate_image",
      description: "Generate a realistic image from a text description. Use this when the user asks to create, generate, or imagine an image.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Detailed description of the image to generate",
          },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information. Use this when the user asks about recent events, facts, or anything that requires up-to-date knowledge.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
        },
        required: ["query"],
      },
    },
  },
];
