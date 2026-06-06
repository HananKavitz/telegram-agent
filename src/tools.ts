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
  {
    type: "function",
    function: {
      name: "research",
      description: "Perform deep, multi-source online research on a complex topic. Produces a comprehensive, well-cited report with executive summary, key findings, detailed analysis, and sources. Use this for complex questions that require synthesizing information from multiple sources.",
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            description: "The topic or question to research deeply",
          },
          depth: {
            type: "string",
            enum: ["standard", "deep"],
            description: "Research depth. 'deep' performs more searches and fetches more pages for maximum quality.",
          },
        },
        required: ["subject"],
      },
    },
  },
];
