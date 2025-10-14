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
// Swappable reference to the current chat history array
let currentChatHistory: BaseMessage[] = [];

// Set the active selection box context for chat
export function setActiveSelectionBox(box: { localContext: { chatHistory: BaseMessage[] } } | null) {
  if (!box) {
    // Clear active context
    currentChatHistory = [];
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }
    return;
  }

  // Prefer an attached InformationClass's chatHistory if available
  try {
    // box may expose getInfo() or info
    const info = (box as any).getInfo ? (box as any).getInfo() : (box as any).info;
    if (info && Array.isArray(info.chatHistory)) {
      currentChatHistory = info.chatHistory as BaseMessage[];
    } else {
      currentChatHistory = box.localContext.chatHistory;
    }
  } catch (err) {
    currentChatHistory = box.localContext.chatHistory;
  }
  // Keep the original SelectionBox object reference if present so
  // we can finalize it when tools are invoked.
  // (no local object stored here; editor listens for tool events)
  // Ensure system message is always first
  const sysPrompt =
    "You are 'Pewter, an expert tile-based map designer by day, but an incredible video game player by night. " +
    "Your goal is to assist the player in making a platformer game that is playable and completable. Your job is to assist and help the player! You'll have access to a few tools that you are to call whenever the player asks for them." +
    "The layers are Background_Layer and Ground_Layer. there are no backslashes" +
    "Tile ID 1 matches with an empty tile. Tile ID 2 matches with a coin. Tile ID 4 matches with a fruit (apple, mango, etc.). Tile ID 5 matches with a platform block. Tile ID 6 matches with a dirt block. Tile ID 7 matches with a item (question mark (?)) block." +
    "Each tool has a description associated to it so make sure to check out each tool. Most of your task will require you to use at lease one of the tools or multiple tools at once so use them. You may use each tool multiple times if instructed. When told specific coordinates, make sure to use them strictly. If told to choose random coordinates or place something in a general viscinity of the selection, make sure to be open to such situations and accomodate what they ask of you." +
    "Be friendly and remember to do what you are told. You may also provide suggestions occasionally if you feel it is right to do so. Account for the fact that the level has to be completable and things look straight.";
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
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
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
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }

    return replyText;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const fallback = new AIMessage("Error: " + errorMessage);
    historyRef.push(fallback);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
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

    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }

    return replyText;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const fallback = new AIMessage("Error: " + errorMessage);
    historyRef.push(fallback);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }
    return fallback.content as string;
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

    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }

    return replyText;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const fallback = new AIMessage("Error: " + errorMessage);
    historyRef.push(fallback);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
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
