import { getChatResponse } from "./modelConnector.ts";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";
import { detectBoxIntent } from "./intent";

/* =====================================================================================
   Chat history exposure
===================================================================================== */

// Persistent history of all chat messages exchanged
// Swappable reference to the current chat history array
let currentChatHistory: BaseMessage[] = [];

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
      let displayContent: any = msg.content;
      if (typeof displayContent === "object") {
        displayContent = JSON.stringify(displayContent);
      }
      const sender = msg._getType().toUpperCase();
      return `<p><strong>${sender}:</strong> ${displayContent}</p>`;
    })
    .join("");
}

/* =====================================================================================
   Selection box context binding
===================================================================================== */

// Set the active selection box context for chat
export function setActiveSelectionBox(
  box: { localContext: { chatHistory: BaseMessage[] } } | null,
) {
  console.log("🔄 setActiveSelectionBox called with box:", box ? "EXISTS" : "NULL");

  if (!box) {
    console.log("❌ Clearing chat history (no box)");
    currentChatHistory = [];
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }
    return;
  }

  console.log("📦 Box has chat history with", box.localContext.chatHistory.length, "messages");

  // Update reference to THIS box's history
  currentChatHistory = box.localContext.chatHistory;

  console.log("✅ currentChatHistory now points to box history:", currentChatHistory.length, "messages");

  // Ensure system message is always first
  const sysPrompt =
    "You are 'Pewter, an expert tile-based map designer by day, but an incredible video game player by night. " +
    "Your goal is to assist the player in making a platformer game that is playable and completable. Your job is to assist and help the player! You'll have access to a few tools that you are to call whenever the player asks of them. " +
    "The layers are Background_Layer and Ground_Layer. there are no backslashes. " +
    "Tile ID 1 matches with an empty tile. Tile ID 2 matches with a coin. Tile ID 4 matches with a fruit (apple, mango, etc.). Tile ID 5 matches with a platform block. Tile ID 6 matches with a dirt block. Tile ID 7 matches with a item (question mark (?)) block. " +
    "Each tool has a description associated to it so make sure to check out each tool. Most of your tasks will require you to use at least one of the tools or multiple tools at once, so use them. You may use each tool multiple times if instructed. When told specific coordinates, make sure to use them strictly. If told to choose random coordinates or place something in a general vicinity of the selection, make sure to be open to such situations and accommodate what they ask of you. " +
    "Be friendly and remember to do what you are told. You may also provide suggestions occasionally if you feel it is right to do so. Account for the fact that the level has to be completable and things look straight.";

  const isSystemMessage = (msg: any) => msg && msg._getType && msg._getType() === "system";

  if (currentChatHistory.length === 0 || !isSystemMessage(currentChatHistory[0])) {
    currentChatHistory.unshift(new SystemMessage(sysPrompt));
    console.log("💉 System prompt injected (new history length:", currentChatHistory.length, ")");
  } else {
    console.log("✓ System prompt already present");
  }

  // Notify any UI listeners that the active selection (and its history) changed
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
  }

  console.log("🎯 Final currentChatHistory length:", currentChatHistory.length);
}

/* =====================================================================================
   Bot typing state
===================================================================================== */

let botResponding = false;

export function setBotResponding(value: boolean) {
  botResponding = value;
}

export function isBotResponding(): boolean {
  return botResponding;
}

/* =====================================================================================
   Tool lifecycle state and listeners (prevents repeated confirmations)
===================================================================================== */

type PendingToolState = {
  name: string;
  selectionId?: string;
  awaitingConfirm: boolean;
  executing: boolean;
} | null;

// Single pending tool at a time is enough for this UI
let pendingTool: PendingToolState = null;

// Wire up tool lifecycle signals from the Editor
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  // Fired when the editor begins a tool action (you can dispatch this from your tool entry points)
  window.addEventListener("toolCalled", (ev: any) => {
    const name = ev?.detail?.tool ?? "unknown_tool";
    const selectionId = ev?.detail?.selectionId;
    pendingTool = { name, selectionId, awaitingConfirm: true, executing: false };
  });

  // Fired from EditorScene.applyTileMatrixWithHistoryPublic when a write actually completes
  window.addEventListener("toolCompleted", (ev: any) => {
    const doneTool = ev?.detail?.tool ?? "unknown_tool";
    if (pendingTool && (!doneTool || pendingTool.name === doneTool)) {
      pendingTool = null;
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }
  });
}

/* =====================================================================================
   Utilities
===================================================================================== */

function isSimpleAffirmation(text: string): boolean {
  return /^\s*(yes|y|yep|yeah|ok|okay|do it|confirm|please|go ahead|sure)\s*$/i.test(text);
}

function markAwaitingConfirmFromReply(replyText: string) {
  if (/\b(are you sure|confirm|should i|do you want me to)\b/i.test(replyText)) {
    if (!pendingTool) {
      pendingTool = {
        name: "generic",
        selectionId: undefined,
        awaitingConfirm: true,
        executing: false,
      };
    } else {
      pendingTool.awaitingConfirm = true;
    }
  }
}

function markExecutingFromReply(replyText: string) {
  if (/\b(i will|i am going to|filling|placing|doing this now|executing)\b/i.test(replyText)) {
    if (pendingTool) pendingTool.executing = true;
  }
}

/* =====================================================================================
   Message helpers
===================================================================================== */

/**
 * Add a new chat message to the conversation history.
 * Handles both user and AI messages.
 * Safely stringifies objects to prevent UI crashes.
 */
export function addChatMessage(chatMessage: BaseMessage): string {
  currentChatHistory.push(chatMessage);

  let displayContent: any = chatMessage.content;
  if (typeof displayContent === "object") {
    console.log("Detected object message in addChatMessage:", displayContent);
    displayContent = JSON.stringify(displayContent);
  }

  const sender = chatMessage._getType().toUpperCase(); // "HUMAN" or "AI"
  return `<strong>${sender}:</strong> ${displayContent}`;
}

/* =====================================================================================
   Core send functions
===================================================================================== */

/**
 * Send a user message to the LLM and get Pewter's response.
 * Handles error formatting and message history updates.
 * Includes guards to avoid infinite confirmation loops.
 */
export async function sendUserPrompt(message: string): Promise<string> {
  // Capture the current history reference at send time so replies go to the
  // same selection box even if the active box changes while the request is in flight.
  const historyRef = currentChatHistory;

  // Guard: if user says "yes/ok/do it" but nothing is awaiting confirmation, avoid loops
  if (isSimpleAffirmation(message) && (!pendingTool || !pendingTool.awaitingConfirm)) {
    const aiMessage = new AIMessage("Noted. Nothing pending to confirm right now.");
    historyRef.push(aiMessage);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }
    return aiMessage.content as string;
  }

  const userMessage = new HumanMessage(message);
  historyRef.push(userMessage);

  // Intent-based one-turn coaching (must be FIRST for Gemini; insert at index 0)
  let _coachPushed = false;
  let _coachMsg: SystemMessage | null = null;
  const intent = detectBoxIntent(message);
  if (intent === "current_contents") {
    _coachMsg = new SystemMessage(
      "For this turn: Use `getSelectionTiles` (current/visible contents). Do NOT use `getPlacedTiles`."
    );
  } else if (intent === "placement_history") {
    _coachMsg = new SystemMessage(
      "For this turn: Use `getPlacedTiles` (history/audit of what this selection placed). Do NOT use `getSelectionTiles`."
    );
  }
  if (_coachMsg) {
    historyRef.unshift(_coachMsg); // insert at the very beginning
    _coachPushed = true;
  }

  setBotResponding(true);

  try {
    const reply = await getChatResponse(historyRef);
    const replyText = Array.isArray(reply.text) ? reply.text.join("\n") : String(reply.text);

    // Remove the one-turn coach SystemMessage if added (remove first element)
    if (_coachPushed) {
      const first = historyRef[0] as any;
      if (first && typeof first._getType === "function" && first._getType() === "system") {
        historyRef.shift();
      }
    }

    // Update pending-tool state based on the reply content
    markAwaitingConfirmFromReply(replyText);
    markExecutingFromReply(replyText);

    // Attach tool errors if present
    if (Array.isArray(reply.errors) && reply.errors.length > 0) {
      const errBlock = "\n\n[Tool Errors]:\n" + reply.errors.join("\n");
      const combined = replyText + errBlock;
      const aiMessage = new AIMessage(combined);
      historyRef.push(aiMessage);
    } else {
      const aiMessage = new AIMessage(replyText);
      historyRef.push(aiMessage);
    }

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
 * out of the visible chat history.
 */
export async function sendUserPromptWithContext(
  userMessageText: string,
  hiddenContext?: string,
): Promise<string> {
  const historyRef = currentChatHistory;

  // Guard: same as sendUserPrompt
  if (isSimpleAffirmation(userMessageText) && (!pendingTool || !pendingTool.awaitingConfirm)) {
    const aiMessage = new AIMessage("Noted. Nothing pending to confirm right now.");
    historyRef.push(aiMessage);
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("activeSelectionChanged"));
    }
    return aiMessage.content as string;
  }

  // Push the user's visible message into the active history
  const userMessage = new HumanMessage(userMessageText);
  historyRef.push(userMessage);

  // Build a temporary history for the model that includes the hidden context
  const tempHistory: BaseMessage[] = historyRef.slice();
  if (hiddenContext && hiddenContext.trim().length > 0) {
    tempHistory.push(new HumanMessage(`[WORLD CONTEXT]: ${hiddenContext}`));
  }

  // Intent-based one-turn coaching on the temp history (must be FIRST)
  let _coachPushed = false;
  let _coachMsg: SystemMessage | null = null;
  const intent = detectBoxIntent(userMessageText);
  if (intent === "current_contents") {
    _coachMsg = new SystemMessage(
      "For this turn: Use `getSelectionTiles` (current/visible contents). Do NOT use `getPlacedTiles`."
    );
  } else if (intent === "placement_history") {
    _coachMsg = new SystemMessage(
      "For this turn: Use `getPlacedTiles` (history/audit of what this selection placed). Do NOT use `getSelectionTiles`."
    );
  }
  if (_coachMsg) {
    tempHistory.unshift(_coachMsg); // insert at the very beginning
    _coachPushed = true;
  }

  setBotResponding(true);

  try {
    const reply = await getChatResponse(tempHistory);
    const replyText = Array.isArray(reply.text) ? reply.text.join("\n") : String(reply.text);

    // Remove the one-turn coach from the temp history (remove first element)
    if (_coachPushed) {
      const first = tempHistory[0] as any;
      if (first && typeof first._getType === "function" && first._getType() === "system") {
        tempHistory.shift();
      }
    }

    // Update pending-tool state based on the reply content
    markAwaitingConfirmFromReply(replyText);
    markExecutingFromReply(replyText);

    if (Array.isArray(reply.errors) && reply.errors.length > 0) {
      const errBlock = "\n\n[Tool Errors]:\n" + reply.errors.join("\n");
      const combined = replyText + errBlock;
      const aiMessage = new AIMessage(combined);
      historyRef.push(aiMessage);
    } else {
      const aiMessage = new AIMessage(replyText);
      historyRef.push(aiMessage);
    }

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
    const replyText = Array.isArray(reply.text) ? reply.text.join("\n") : String(reply.text);

    // Update pending-tool state based on the reply content
    markAwaitingConfirmFromReply(replyText);
    markExecutingFromReply(replyText);

    if (Array.isArray(reply.errors) && reply.errors.length > 0) {
      const errBlock = "\n\n[Tool Errors]:\n" + reply.errors.join("\n");
      const combined = replyText + errBlock;
      const aiMessage = new AIMessage(combined);
      historyRef.push(aiMessage);
    } else {
      const aiMessage = new AIMessage(replyText);
      historyRef.push(aiMessage);
    }

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
