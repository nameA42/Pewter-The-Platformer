import { getChatResponse } from "./modelConnector.ts";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";

// Persistent history of all chat messages exchanged
// Expose current chat history for UI rendering
export function getCurrentChatHistory() {
  return currentChatHistory;
}
// Attach to window for UIScene access
if (typeof window !== "undefined") {
  (window as any).getCurrentChatHistory = getCurrentChatHistory;
}
// Returns formatted HTML for current chat history (excluding system message)
export function getDisplayChatHistory(): string {
  return currentChatHistory
    .filter((msg) => msg._getType() !== "system")
    .map((msg) => {
      let displayContent = msg.content;
      if (typeof displayContent === "object") {
        displayContent = JSON.stringify(displayContent);
      }
      const sender = msg._getType().toUpperCase();
      return `<p><strong>${sender}:</strong> ${displayContent}</p>`;
    })
    .join("");
}
const welcomePrompt = new SystemMessage(
  "You are Pewter, a friendly platformer level design assistant. " +
  "Greet the player warmly and let them know they need to draw a selection box on the map to get started. Keep it short and encouraging."
);

// Swappable reference to the current chat history array
let currentChatHistory: BaseMessage[] = [welcomePrompt];

let currentActiveBox: any = null; // Store reference to active selection box

// Set the active selection box context for chat
export function setActiveSelectionBox(
  box: { localContext: { chatHistory: BaseMessage[] } } | null,
) {
  if (!box) {
    // Clear active context
    currentChatHistory = [];
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }
    return;
  }

  currentChatHistory = box.localContext.chatHistory;
  // Keep the original SelectionBox object reference if present so
  // we can finalize it when tools are invoked.
  // (no local object stored here; editor listens for tool events)
  // Ensure system message is always first
  const sysPrompt =
    "You are 'Pewter', an expert tile-based map designer by day and an incredible video game player by night. " +
    "Your goal is to assist the player in making a platformer game that is playable and completable. You have access to a set of tools — use them proactively as needed to fulfill the player's requests. " +
    "IMPORTANT: You must ONLY make changes inside the selection box. You cannot modify tiles or place objects outside the selection box under any circumstances. " +
    "The default map is 20 tiles tall. The bottom 5 rows are ground tiles (solid). The top 15 rows are empty sky. Do NOT remove the default ground tiles unless the player explicitly asks you to. " +
    "Layers available: Collectables_Layer and Ground_Layer. " +
    "Tile ID 2 = coin, 3 = fruit, 4 = platform block, 5 = dirt block, 6 = grass block, 7 = question mark block, 8 = super slime, 9 = normal slime, 10-14 = sky/background tiles. " +
    "Category: Collectables = [2, 3], Ground = [4, 5, 6, 7]. " +
    "Undo/Redo: Use the undoRedo tool to revert or re-apply map changes. 'undo' steps back through saved snapshots; 'redo' moves forward. Use 'times' to jump multiple steps. " +
    "Each tool has a description — check it. Most tasks require one or more tools; use each as many times as needed. When given specific coordinates, use them strictly. When given a general location or random placement, use your judgement. " +
    "When the WorldFacts tool gives you information about the world, use it silently to inform your tool calls — do not summarize or report it back to the player. " +
    "You operate in rounds: each round you may call tools, and the results are fed back to you for the next round. You have a maximum of 8 rounds before you must give a final response, so plan your tool calls efficiently. " +
    "Execute the player's requests directly. Only ask for clarification if the player explicitly requests it, or if the instruction is genuinely ambiguous and a reasonable assumption cannot be made. When given a multi-step task, execute all steps in sequence without pausing. " +
    "When summarizing what you did, keep it short and conversational — do not dump raw coordinates, tile IDs, or tool output data into your response. " +
    "Be friendly. The level must be completable. The player character is 2 tiles wide and 2 tiles tall and can jump approximately 6 tiles high — keep this in mind when placing platforms, enemies, and obstacles. When creating gaps, a gap of 1 tile is not traversable or fallable by the player; gaps must be 2 or more tiles wide to be meaningful.";
  const isSystemMessage = (msg: any) =>
    msg && msg._getType && msg._getType() === "system";
  if (
    currentChatHistory.length === 0 ||
    !isSystemMessage(currentChatHistory[0]) ||
    currentChatHistory[0].content !== sysPrompt
  ) {
    // Import SystemMessage from langchain
    // (import already present at top)
    currentChatHistory.unshift(new SystemMessage(sysPrompt));
    console.log(
      "System prompt injected into chat history for active selection box.",
    );
  }
  // Notify any UI listeners that the active selection (and its history) changed
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
  }
}

// Track bot typing state to prevent overlapping responses
let botResponding = false;

// Initialize system prompt on load

/**
 * Add a new chat message to the conversation history.
 * Handles both user and AI messages.
 * Safely stringifies objects to prevent UI crashes.
 */
export function addChatMessage(chatMessage: BaseMessage): string {
  currentChatHistory.push(chatMessage);

  // Prepare safe message content for display.
  let displayContent = chatMessage.content;
  if (typeof displayContent === "object") {
    console.log("Detected object message in addChatMessage:", displayContent);
    displayContent = JSON.stringify(displayContent);
  }

  const sender = chatMessage._getType().toUpperCase(); // "HUMAN" or "AI"
  return `<strong>${sender}:</strong> ${displayContent}`;
}

/**
 * Set internal flag to track if bot is generating a response.
 * You can use this to disable input in your Phaser chatbox.
 */
export function setBotResponding(value: boolean) {
  botResponding = value;
}

/**
 * Check if the bot is currently processing a prompt.
 */
export function isBotResponding(): boolean {
  return botResponding;
}

/**
 * Send a user message to the LLM and get Pewter's response.
 * Handles error formatting and message history updates.
 */
export async function sendUserPrompt(message: string): Promise<string> {
  // Capture the current history reference at send time so replies go to the
  // same selection box even if the active box changes while the request is in-flight.
  const historyRef = currentChatHistory;

  const userMessage = new HumanMessage(message);
  historyRef.push(userMessage);

  setBotResponding(true);

  try {
    const reply = await getChatResponse(historyRef);
    const replyText = Array.isArray(reply.text)
      ? reply.text.join("\n")
      : String(reply.text);
    const aiMessage = new AIMessage(replyText);
    historyRef.push(aiMessage);

    // Let UI know new content is available for the active selection
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }

    return replyText;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const fallback = new AIMessage("Error: " + errorMessage);
    historyRef.push(fallback);
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }
    return fallback.content as string;
  } finally {
    setBotResponding(false);
  }
}

/**
 * Sends a user prompt to the LLM but keeps an optional world/context string
 * out of the visible chat history. The visible history will contain only the
 * user's plain message and the AI reply; the world context is appended to a
 * temporary history passed to the model so it influences the response but is
 * not stored in the selection's chatHistory array.
 */
export async function sendUserPromptWithContext(
  userMessageText: string,
  hiddenContext?: string,
): Promise<string> {
  const historyRef = currentChatHistory;

  // Push the user's visible message into the active history
  const userMessage = new HumanMessage(userMessageText);
  historyRef.push(userMessage);

  setBotResponding(true);

  try {
    // Build a temporary history for the model that includes the hidden context
    const tempHistory: BaseMessage[] = historyRef.slice();
    if (hiddenContext && hiddenContext.trim().length > 0) {
      tempHistory.push(new HumanMessage(`[WORLD CONTEXT]: ${hiddenContext}`));
    }

    const reply = await getChatResponse(tempHistory);
    const replyText = Array.isArray(reply.text)
      ? reply.text.join("\n")
      : String(reply.text);
    const aiMessage = new AIMessage(replyText);
    historyRef.push(aiMessage);

    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }

    return replyText;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const fallback = new AIMessage("Error: " + errorMessage);
    historyRef.push(fallback);
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }
    return fallback.content as string;
  } finally {
    setBotResponding(false);
  }
}

/**
 * Send a user prompt to the LLM but do NOT modify the visible chat history.
 * This is intended for background/regeneration calls where we want the model
 * to see the selection's history + an optional hidden context, but we do not
 * want to add the user or AI messages to the UI-visible chat feed.
 */
export async function sendUserPromptHidden(
  userMessageText: string,
  hiddenContext?: string,
): Promise<string> {
  // Keep the visible history untouched; build a temporary history for the model
  const tempHistory: BaseMessage[] = currentChatHistory.slice();
  tempHistory.push(new HumanMessage(userMessageText));
  if (hiddenContext && hiddenContext.trim().length > 0) {
    tempHistory.push(new HumanMessage(`[WORLD CONTEXT]: ${hiddenContext}`));
  }

  setBotResponding(true);
  try {
    const reply = await getChatResponse(tempHistory);
    const replyText = Array.isArray(reply.text)
      ? reply.text.join("\n")
      : String(reply.text);
    // Do NOT push AIMessage into currentChatHistory and DO NOT dispatch UI events.
    return replyText;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return "Error: " + errorMessage;
  } finally {
    setBotResponding(false);
  }
}

/**
 * Send a system-level message to the LLM (e.g., instructions or context).
 */
export async function sendSystemMessage(message: string): Promise<string> {
  const historyRef = currentChatHistory;
  const systemMessage = new HumanMessage(message);
  historyRef.push(systemMessage);

  setBotResponding(true);

  try {
    const reply = await getChatResponse(historyRef);
    const replyText = Array.isArray(reply.text)
      ? reply.text.join("\n")
      : String(reply.text);
    const aiMessage = new AIMessage(replyText);
    historyRef.push(aiMessage);

    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }

    return replyText;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const fallback = new AIMessage("Error: " + errorMessage);
    historyRef.push(fallback);
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }
    return fallback.content as string;
  } finally {
    setBotResponding(false);
  }
}

/**
 * Clear chat history and start fresh (except for system prompt if reinitialized).
 */
export function clearChatHistory(): void {
  currentChatHistory.length = 0;
  console.log("Chat history cleared.");
}

// Collaborative Context Merging - Enhanced chat functions with neighbor context

/**
 * Send a user prompt with collaborative context from the active selection box.
 * This includes data from the box and its neighbors to provide richer context to the AI.
 */
export async function sendUserPromptWithCollaborativeContext(
  userMessageText: string,
): Promise<string> {
  const historyRef = currentChatHistory;

  // Get the current active selection box (if any)
  let collaborativeContext = "";

  // Try to get collaborative context from the active box
  // We need to access the active box through the editor scene
  try {
    // Access the active selection box through the global window object
    // This assumes the EditorScene sets window.activeSelectionBox or similar
    const activeBox = (window as any).getActiveSelectionBox?.();

    if (
      activeBox &&
      typeof activeBox.getCollaborativeContextForChat === "function"
    ) {
      collaborativeContext = activeBox.getCollaborativeContextForChat();
      console.log("Including collaborative context from active selection box");
    }
  } catch (error) {
    console.warn("Could not retrieve collaborative context:", error);
  }

  // Push the user's visible message into the active history
  const userMessage = new HumanMessage(userMessageText);
  historyRef.push(userMessage);

  setBotResponding(true);

  try {
    // Build a temporary history for the model that includes the collaborative context
    const tempHistory: BaseMessage[] = historyRef.slice();

    if (collaborativeContext && collaborativeContext.trim().length > 0) {
      tempHistory.push(
        new HumanMessage(`[COLLABORATIVE CONTEXT]: ${collaborativeContext}`),
      );
    }

    const reply = await getChatResponse(tempHistory);
    const replyText = Array.isArray(reply.text)
      ? reply.text.join("\n")
      : String(reply.text);
    const aiMessage = new AIMessage(replyText);
    historyRef.push(aiMessage);

    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }

    return replyText;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const fallback = new AIMessage("Error: " + errorMessage);
    historyRef.push(fallback);
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }
    return fallback.content as string;
  } finally {
    setBotResponding(false);
  }
}

/**
 * Enhanced version of sendUserPromptWithContext that also includes collaborative context
 */
export async function sendUserPromptWithFullContext(
  userMessageText: string,
  additionalContext?: string,
): Promise<string> {
  const historyRef = currentChatHistory;

  // Get collaborative context
  let collaborativeContext = "";
  try {
    const activeBox = (window as any).getActiveSelectionBox?.();
    if (
      activeBox &&
      typeof activeBox.getCollaborativeContextForChat === "function"
    ) {
      collaborativeContext = activeBox.getCollaborativeContextForChat();
    }
  } catch (error) {
    console.warn("Could not retrieve collaborative context:", error);
  }

  // Push the user's visible message into the active history
  const userMessage = new HumanMessage(userMessageText);
  historyRef.push(userMessage);

  setBotResponding(true);

  try {
    // Build a temporary history that includes both types of context
    const tempHistory: BaseMessage[] = historyRef.slice();

    // Add additional context first (world data, etc.)
    if (additionalContext && additionalContext.trim().length > 0) {
      tempHistory.push(
        new HumanMessage(`[WORLD CONTEXT]: ${additionalContext}`),
      );
    }

    // Add collaborative context second (neighbor data, etc.)
    if (collaborativeContext && collaborativeContext.trim().length > 0) {
      tempHistory.push(
        new HumanMessage(`[COLLABORATIVE CONTEXT]: ${collaborativeContext}`),
      );
    }

    const reply = await getChatResponse(tempHistory);
    const replyText = Array.isArray(reply.text)
      ? reply.text.join("\n")
      : String(reply.text);
    const aiMessage = new AIMessage(replyText);
    historyRef.push(aiMessage);

    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }

    return replyText;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const fallback = new AIMessage("Error: " + errorMessage);
    historyRef.push(fallback);
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    ) {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }
    return fallback.content as string;
  } finally {
    setBotResponding(false);
  }
}
