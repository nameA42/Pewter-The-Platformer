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
  "Your goal is to assist the player in creating a platformer game that is playable and completable. You will always follow instructions and use the tools available. " +
  // Force working only in selection box
  "IMPORTANT: You must ONLY make changes within the selection box. You cannot modify tiles or place objects outside the selection box under any circumstances. " +
  // World facts initialization
  "When setting up a scene for the first time, you MUST call the World Facts Tool to initialize the facts of the scene. This includes recording ground levels, platform locations, solid ground, item locations (enemies, collectables, breakable blocks), and pitfalls. " +
  "This initialization is REQUIRED and must be done before making any placements or edits. " +
  // World facts updating
  "After ANY change to the scene (placing, clearing, or moving tiles, enemies, or collectables), you MUST immediately update the World Facts Tool to reflect the new state of the scene. " +
  "Even if the user does not explicitly mention keywords like 'pitfall', 'ground', 'collectable', or 'enemy', you must automatically detect and update any new additions, removals, or changes in the scene. " +
  "World Facts must always reflect the current state: add new facts for any new elements and remove facts for any elements that were undone or deleted. " +
  // Layer and tile info
  "Layers available: Background_Layer and Ground_Layer. " +
  "Tile ID mapping: 1 = empty tile, 2 = coin, 4 = fruit, 5 = platform block, 6 = dirt block, 7 = item (question mark) block. " +
  // Tool rules
  "Tool rules: " +
  "Place Enemy: Only place on ground. Find the nearest ground tile and place the enemy one tile above it. Ensure the enemy has enough space to move side-to-side. If placement is impossible, suggest an alternative location but do not place it. " +
  "Clear Tile: Clear only on the Ground_Layer unless instructed otherwise. " +
  "World Facts Tool: Always use this tool to maintain an accurate internal map of the scene. Never skip updates. Automatically detect changes and update facts after every modification, even if the user does not explicitly instruct you. " +
  "Always be friendly and helpful. Make the level playable and straight-looking. You may provide suggestions occasionally, but you must always follow these rules. " +
  "Never mention the World Facts to the player unless explicitly asked. Treat it as internal storage for your understanding of the scene.";

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

export async function getChatResponse(
  chatMessageHistory: BaseMessage[],
): Promise<string> {
  if (!llmWithTools) {
    throw new Error("LLM has not be initialized yet! Stop breaking stuff");
  }

  try {
    let response = await llmWithTools.invoke(chatMessageHistory);
    console.log(
      `Message sent to LLM`,
      chatMessageHistory,
      `and received: `,
      response,
    );

    //VERY IMPORTANT --- Push the fact that a tool was called back into the chat history or stuff will break
    chatMessageHistory.push(response);

    //Match the tool and execute
    const calls = response.tool_calls ?? [];
    for (const toolCall of calls) {
      const selectedTool = toolsByName[toolCall.name];
      if (!selectedTool) {
        const msg = `Error: Unknown tool "${toolCall.name}".`;
        console.error(msg);
        chatMessageHistory.push(
          new ToolMessage({
            name: toolCall.name,
            content: msg,
            tool_call_id: String(toolCall.id || ""),
          }),
        );
        continue;
      }
      try {
        const result = await selectedTool.invoke(toolCall.args);
        console.log(`Tool called ${toolCall.name} with result: ${result}`);

        chatMessageHistory.push(
          new ToolMessage({
            name: toolCall.name,
            content: result,
            tool_call_id: String(toolCall.id || ""),
          }),
        );
      } catch (toolError) {
        console.error(`Tool ${toolCall.name} failed:`, toolError);
        // Add error message to chat history
        const errorMessage =
          `Error: Tool '${toolCall.name}' failed with args: ${JSON.stringify(toolCall.args)}.\n` +
          `Details: ${toolError}. Please try again with different parameters.`;

        chatMessageHistory.push(
          new ToolMessage({
            name: toolCall.name,
            content: errorMessage,
            tool_call_id: String(toolCall.id ?? ""),
          }),
        );
      }
    }
    //In order for the result to be used, it needs to be sent back to the llm
    if (calls.length > 0) {
      response = await llmWithTools.invoke(chatMessageHistory);
      console.log("Raw LLM response after tool calls: ", response);
    }

    let resultContent = response.content;
    if (typeof resultContent !== "string") {
      console.log(
        "Non-string AI response detected, need to fix this later:",
        resultContent,
      );
      resultContent = JSON.stringify(resultContent);
    }
    return resultContent;
  } catch (error) {
    console.error(
      "Error during tool call. THIS WILL BREAK EVERYTHING: ",
      error,
    );
    return "Error communicating with model :(";
  }
}
