import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  BaseMessage,
  ToolMessage,
  SystemMessage,
} from "@langchain/core/messages";

const apiKey: string | undefined = import.meta.env.VITE_LLM_API_KEY;
const modelName: string | undefined = import.meta.env.VITE_LLM_MODEL_NAME;
if (!apiKey) throw new Error("Missing VITE_LLM_API_KEY in .env file!");
if (!modelName) throw new Error("Missing VITE_LLM_MODEL_NAME in .env file!");

const llmTemp = 0;

const sysPrompt =
  "You are 'Pewter', an expert tile-based map designer by day and an incredible video game player by night. " +
  "Your job is to help the player create a platformer game that is both playable and completable. You must always follow instructions and use the tools available. " +
  "Sometimes your job will require you to use multiple different tools at once so feel free to use each tool multiple times and use all the tools if necessary. " +
  "IMPORTANT: You must ONLY make changes inside the selection box. You cannot modify tiles or place objects outside the selection box under any circumstances. " +
  "When a scene is first set up, you MUST call the World Facts Tool to initialize the facts of the scene. This means recording all ground levels, platform locations, solid ground, item locations (enemies, collectables, breakable blocks), and pitfalls. " +
  "This initialization MUST happen before making any placements or edits. " +
  "Layers available: Collectables_Layer and Ground_Layer. " +
  "Tile ID mapping: 1 = empty tile, 2 = coin, 4 = fruit, 5 = platform block, 6 = dirt block, 7 = item (question mark) block. " +
  "Category: Collectables = [2, 4], Ground = [5, 6, 7]. " +
  "Tool rules: " +
  "Place Enemy: Only place enemies on ground. Find the nearest ground tile and place the enemy one tile above it. Ensure the enemy has enough space to move side-to-side. If placement is impossible, suggest an alternative location but do not place it. " +
  "Clear Tile: Clear only on the Ground_Layer unless specifically instructed otherwise. " +
  "World Facts: Use this tool to provide yourself with the facts within the world or within the selection. " +
  "Place Tile: Use this tool to place a given index or term on a layer when told. Use the tile information and map each tile to the index. " +
  "Place Grid of Tiles: Use this tool to place a grid of tiles with a given index or term on a layer when told. Use the tile information and map each tile to the index. " +
  "Get Placed Tiles: Use this tool to retrieve all tiles placed within a selection box. " +
  // Strong, explicit tool-selection policy (the key nudge)
  "When the user asks about current contents of a selection (e.g., 'what's in the box', 'what is inside', 'show contents', 'now', 'currently', 'visible', 'topmost'), you MUST call the `getSelectionTiles` tool. " +
  "When the user asks about history of what a selection placed (e.g., 'what did this box place', 'history', 'previous placements', 'audit', 'undo scope'), you MUST call the `getPlacedTiles` tool. " +
  "Do NOT use `getPlacedTiles` to answer current/visible contents, and do NOT use `getSelectionTiles` to answer history. " +
  "Always be friendly and helpful. Make the level playable and visually consistent. You may offer suggestions occasionally, but you must always follow these rules.";

let tools: any = []; // tool functions and their schemas
let toolsByName: Record<string, any> = {}; // Backwards references to tool functions by name

const llm = new ChatGoogleGenerativeAI({
  model: modelName,
  temperature: llmTemp,
  maxRetries: 2,
  apiKey: apiKey,
});

let llmWithTools: ReturnType<typeof llm.bindTools> | null = null;

export function registerTool(tool: any) {
  if (toolsByName[tool.name]) {
    console.warn(`Tool "${tool.name}" already registered; overwriting.`);
  }
  tools.push(tool);
  toolsByName[tool.name] = tool;
  console.log("Tool Registered: ", tool.name);
}

export function initializeTools() {
  if (llmWithTools) {
    console.error("Attempting to init tools when model is already bound!");
    return;
  }
  llmWithTools = llm.bindTools(tools);
  console.log("Bound following tools to LLM: ", Object.keys(toolsByName));
}

export async function initializeLLM(
  chatMessageHistory: BaseMessage[],
): Promise<void> {
  // inject sys prompt
  chatMessageHistory.push(new SystemMessage(sysPrompt));
}

export async function getChatResponse(
  chatMessageHistory: BaseMessage[],
): Promise<{
  text: string[];
  toolCalls: {
    name: string;
    args: Record<string, any>;
    result: string;
  }[];
  errors: string[];
}> {
  if (!llmWithTools) {
    throw new Error(
      "LLM has not been initialized with tools. Did you forget to call initializeTools()?",
    );
  }

  const output = {
    text: [] as string[],
    toolCalls: [] as {
      name: string;
      args: Record<string, any>;
      result: string;
    }[],
    errors: [] as string[],
  };

  try {
    // Step 1: Initial LLM call
    console.log("Invoking LLM with message history:", chatMessageHistory);
    let response = await llmWithTools.invoke(chatMessageHistory);
    console.log("Raw LLM response:", response);
    chatMessageHistory.push(response);

    // Step 2: Extract any text content
    if (typeof response.content === "string") {
      output.text.push(response.content);
    } else if (Array.isArray(response.content)) {
      for (const part of response.content) {
        if (part.type === "text" && typeof part.text === "string") {
          output.text.push(part.text);
        }
      }
    }

    // Step 3: Handle tool calls
    for await (const toolCall of response.tool_calls ?? []) {
      const tool = toolsByName[toolCall.name];
      if (!tool) {
        const errorMsg = `Error: Unknown tool "${toolCall.name}".`;
        console.error(errorMsg);
        output.errors.push(errorMsg);
        chatMessageHistory.push(
          new ToolMessage({
            name: toolCall.name,
            content: errorMsg,
            tool_call_id: String(toolCall.id ?? ""),
          }),
        );
        continue;
      }

      try {
        const result = await tool.invoke(toolCall.args);
        console.log(`Tool called ${toolCall.name} with result:`, result);

        output.toolCalls.push({
          name: toolCall.name,
          args: toolCall.args,
          result: result,
        });

        chatMessageHistory.push(
          new ToolMessage({
            name: toolCall.name,
            content: result,
            tool_call_id: String(toolCall.id ?? ""),
          }),
        );

        // Notify UI/editor that a tool was called so selection boxes can finalize
        try {
          if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
            window.dispatchEvent(
              new CustomEvent("toolCalled", {
                detail: { name: toolCall.name, args: toolCall.args, result },
              }),
            );
          }
        } catch (e) {
          // ignore
        }
      } catch (toolError) {
        const errorMsg = `Error: Tool '${toolCall.name}' failed with args: ${JSON.stringify(
          toolCall.args,
        )}.\nDetails: ${toolError}`;
        console.error(errorMsg);
        output.errors.push(errorMsg);

        chatMessageHistory.push(
          new ToolMessage({
            name: toolCall.name,
            content: errorMsg,
            tool_call_id: String(toolCall.id ?? ""),
          }),
        );
      }
    }

    // Step 4: Re-invoke LLM if tools were used
    if ((response.tool_calls?.length ?? 0) > 0) {
      response = await llmWithTools.invoke(chatMessageHistory);
      console.log("Raw LLM response after tool calls:", response);

      if (typeof response.content === "string") {
        output.text.push(response.content);
      } else if (Array.isArray(response.content)) {
        for (const part of response.content) {
          if (part.type === "text" && typeof part.text === "string") {
            output.text.push(part.text);
          }
        }
      }
    }

    return output;
  } catch (error) {
    const errorMsg = `Error communicating with model: ${error}`;
    console.error(errorMsg);
    output.errors.push(errorMsg);
    return output;
  }
}
