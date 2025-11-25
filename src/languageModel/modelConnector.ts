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
  // Work only in selection box
  "IMPORTANT: You must ONLY make changes inside the selection box. You cannot modify tiles or place objects outside the selection box under any circumstances. " +
  // World Facts initialization
  "When a scene is first set up, you MUST call the World Facts Tool to initialize the facts of the scene. This means recording all ground levels, platform locations, solid ground, item locations (enemies, collectables, breakable blocks), and pitfalls. " +
  "This initialization MUST happen before making any placements or edits. " +
  // Handling multiple instructions
  "The player may sometimes ask you to perform multiple actions at once. In such cases, you must use the tools as needed to complete ALL parts of the request. " +
  // Layer and tile info
  "Layers available: Collectables_Layer and Ground_Layer. " +
  "Tile ID mapping: 1 = empty tile, 2 = coin, 4 = fruit, 5 = platform block, 6 = dirt block, 7 = item (question mark) block. " +
  "Category: Collectables = [2, 4], Ground = [5, 6, 7]" +
  // Tool rules
  "Tool rules: " +
  "Place Enemy: Only place enemies on ground. Find the nearest ground tile and place the enemy one tile above it. Ensure the enemy has enough space to move side-to-side. If placement is impossible, suggest an alternative location but do not place it. " +
  "Clear Tile: Clear only on the Ground_Layer unless specifically instructed otherwise. " +
  "World Facts: Use this tool to provide yourself with the facts within the world or within the selection. Using the get method, you " +
  "Place Tile: Use this tool to place a given index or term on a layer when told. Use the tile information and map each tile to the index. " +
  "Place Grid of Tiles: Use this tool to place a grid of tiles with a given index or term on a layer when told. Use the tile information and map each tile to the index. " +
  "Get Placed Tiles: Use this tool to retrieve all tiles placed within a selection box. " +
  "PLEASE USE THE WORLD FACTS TOOL TO RECEIVE INFORMATION ABOUT THE LAYER YOU MIGHT NEED TO WORK ON. For example, if the player asks you to place an enemy within a selection, first check where the top of the ground is before placing making sure not to place it within the ground. Same applies to collectables or anything else. The world facts tool is your best guide as to what is within the game world. Use it to your advantage PLEASE. " +
  "Always be friendly and helpful. Make the level playable and visually consistent. You may offer suggestions occasionally, but you must always follow these rules.";

let tools: any = []; //tool functions and their schemas
let toolsByName: Record<string, any> = {}; //Backwards references to tool functions by name

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

// Programmatic invocation helper for registered tools
export async function invokeTool(name: string, args: Record<string, any>) {
  const tool = toolsByName[name];
  if (!tool) {
    throw new Error(`Tool '${name}' is not registered.`);
  }
  // Some tool wrappers expose 'invoke' or 'toolCall' with invoke
  if (typeof tool.invoke === "function") {
    return await tool.invoke(args);
  }
  if (
    typeof tool.toolCall === "function" &&
    typeof tool.toolCall.invoke === "function"
  ) {
    return await tool.toolCall.invoke(args);
  }
  // if tool is itself an object returned by @langchain/tool, try calling it
  if (typeof tool === "function") {
    return await tool(args);
  }
  throw new Error(`Tool '${name}' cannot be invoked programmatically.`);
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
  //inject sys prompt
  chatMessageHistory.push(new SystemMessage(sysPrompt));
}

// OLD implementation kept as a comment for reference
// export async function getChatResponse(chatMessageHistory: BaseMessage[]): Promise<string> {
//   ...
// }

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

  // Small helper so we only have one place that pulls text from a response
  const extractTextFromResponse = (response: any) => {
    if (typeof response.content === "string") {
      const trimmed = response.content.trim();
      if (trimmed.length > 0) {
        output.text.push(trimmed);
      }
    } else if (Array.isArray(response.content)) {
      for (const part of response.content) {
        if (part.type === "text" && typeof part.text === "string") {
          const trimmed = part.text.trim();
          if (trimmed.length > 0) {
            output.text.push(trimmed);
          }
        }
      }
    }
  };

  try {
    // Step 1: Initial LLM call
    console.log("Invoking LLM with message history:", chatMessageHistory);
    const firstResponse = await llmWithTools.invoke(chatMessageHistory);
    console.log("Raw LLM response:", firstResponse);
    chatMessageHistory.push(firstResponse);

    const hadTools = (firstResponse.tool_calls?.length ?? 0) > 0;

    // Step 2: Handle tool calls (if any)
    for await (const toolCall of firstResponse.tool_calls ?? []) {
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
          if (
            typeof window !== "undefined" &&
            typeof window.dispatchEvent === "function"
          ) {
            window.dispatchEvent(
              new CustomEvent("toolCalled", {
                detail: { name: toolCall.name, args: toolCall.args, result },
              }),
            );
          }
        } catch (e) {
          // ignore UI errors
        }
      } catch (toolError) {
        const errorMsg = `Error: Tool '${toolCall.name}' failed with args: ${JSON.stringify(toolCall.args)}.\nDetails: ${toolError}`;
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

    // Step 3: Decide which response's text to expose
    if (hadTools) {
      // Re-invoke LLM after tools and only expose THIS text
      const secondResponse = await llmWithTools.invoke(chatMessageHistory);
      console.log("Raw LLM response after tool calls:", secondResponse);
      chatMessageHistory.push(secondResponse);
      extractTextFromResponse(secondResponse);
    } else {
      // No tools were used; expose the first response text
      extractTextFromResponse(firstResponse);
    }

    return output;
  } catch (error) {
    const errorMsg = `Error communicating with model: ${error}`;
    console.error(errorMsg);
    output.errors.push(errorMsg);
    return output;
  }
}
