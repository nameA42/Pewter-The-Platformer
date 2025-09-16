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
  "You are 'Pewter, an expert tile-based map designer by day, but an incredible video game player by night. " +
  "Your goal is to assist the player in making a platformer game that is playable and completable. Your job is to assist and help the player! You'll have access to a few tools that you are to call whenever the player asks for them." +
  "The layers are Background_Layer and Ground_Layer. there are no backslashes" +
  "Tile ID 1 matches with an empty tile. Tile ID 2 matches with a coin. Tile ID 4 matches with a fruit (apple, mango, etc.). Tile ID 5 matches with a platform block. Tile ID 6 matches with a dirt block. Tile ID 7 matches with a item (question mark (?)) block." +
  "Each tool has a description associated to it so make sure to check out each tool. Most of your task will require you to use at lease one of the tools or multiple tools at once so use them. You may use each tool multiple times if instructed. When told specific coordinates, make sure to use them strictly. If told to choose random coordinates or place something in a general viscinity of the selection, make sure to be open to such situations and accomodate what they ask of you." +
  "Be friendly and remember to do what you are told. You may also provide suggestions occasionally if you feel it is right to do so. Account for the fact that the level has to be completable and things look straight.";

// Nudge the assistant to query the selection tool before modifying tiles
const promptNudge =
  " Before placing or modifying tiles \"in the selection\", first call get_current_selection. " +
  "If it returns `type: \"none\"`, ask the user to create a selection. Otherwise, use the returned {x,y,w,h} and id. " +
  "Do not ask the user for coordinates if get_current_selection can provide them.";

// Append the nudge to the system prompt
// (keep original sysPrompt variable stable for future reference)


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
  // Inject system prompt combined with the usage nudge so the assistant
  // always receives both pieces of guidance.
  const combinedPrompt = `${sysPrompt}${promptNudge}`;
  chatMessageHistory.push(new SystemMessage(combinedPrompt));
}

function normalizeContentToString(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    try {
      return content
        .map((c: any) => {
          if (typeof c === "string") return c;
          if (c?.text) return String(c.text);
          if (c?.content) return String(c.content);
          return JSON.stringify(c);
        })
        .join("\n");
    } catch {
      // fallthrough to stringify
    }
  }

  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export async function getChatResponse(
  chatMessageHistory: BaseMessage[],
): Promise<string> {
  if (!llmWithTools) {
    throw new Error("LLM has not be initialized yet! Stop breaking stuff");
  }

  const MAX_TOOL_HOPS = 3;
  let hops = 0;

  try {
    let response: any = await llmWithTools.invoke(chatMessageHistory);
    console.log("Message sent to LLM", chatMessageHistory, "and received:", response);

    // Push the assistant response into history (may include tool_calls)
    chatMessageHistory.push(response);

    // Process tool calls up to the hop limit
    while ((response.tool_calls?.length ?? 0) > 0 && hops < MAX_TOOL_HOPS) {
      const calls = response.tool_calls ?? [];
      for (const toolCall of calls) {
        const selectedTool = toolsByName[toolCall.name];
        if (!selectedTool) {
          const msg = `Error: Unknown tool "${toolCall.name}".`;
          console.error(msg);
          chatMessageHistory.push(
            new ToolMessage({ name: toolCall.name, content: msg, tool_call_id: String(toolCall.id || "") }),
          );
          continue;
        }
        try {
          const result = await selectedTool.invoke(toolCall.args);
          chatMessageHistory.push(
            new ToolMessage({ name: toolCall.name, content: result, tool_call_id: String(toolCall.id || "") }),
          );
        } catch (toolError) {
          console.error(`Tool ${toolCall.name} failed:`, toolError);
          const errorMessage =
            `Error: Tool '${toolCall.name}' failed with args: ${JSON.stringify(toolCall.args)}.\n` +
            `Details: ${toolError}. Please try again with different parameters.`;
          chatMessageHistory.push(
            new ToolMessage({ name: toolCall.name, content: errorMessage, tool_call_id: String(toolCall.id ?? "") }),
          );
        }
      }

      // Re-invoke the model now that tool outputs are appended
      hops += 1;
      response = await llmWithTools.invoke(chatMessageHistory);
      console.log(`Raw LLM response after tool calls (hop ${hops}):`, response);
      chatMessageHistory.push(response);
    }

    // If still calling tools after hitting the cap, give a soft boundary and ask for a final summary
    if ((response.tool_calls?.length ?? 0) > 0 && hops >= MAX_TOOL_HOPS) {
      chatMessageHistory.push(
        new SystemMessage(`Note: Tool hop limit of ${MAX_TOOL_HOPS} reached. Summarize results without further tool calls.`),
      );
      const finalResp: any = await llmWithTools.invoke(chatMessageHistory);
      return normalizeContentToString(finalResp.content);
    }

    return normalizeContentToString(response.content);
  } catch (error) {
    console.error("Error during tool call:", error);
    return "Error communicating with model :(";
  }
}
