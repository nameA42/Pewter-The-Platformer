import { getChatResponse, initializeLLM } from "./modelConnector.ts";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";

// Persistent history of all chat messages exchanged
export const chatHistory: BaseMessage[] = [];

// Track bot typing state to prevent overlapping responses
let botResponding = false;

// Initialize system prompt on load
initializeLLM(chatHistory).then(() => {
  console.log("System prompt injected into chat history.");
});

/**
 * Add a new chat message to the conversation history.
 * Handles both user and AI messages.
 * Safely stringifies objects to prevent UI crashes.
 */
export function addChatMessage(chatMessage: BaseMessage): string {
  chatHistory.push(chatMessage);

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
  const userMessage = new HumanMessage(message);
  chatHistory.push(userMessage);

  setBotResponding(true);

  try {
    const reply = await getChatResponse(chatHistory);
    const replyText = Array.isArray(reply.text)
      ? reply.text.join("\n")
      : String(reply.text);
    const aiMessage = new AIMessage(replyText);
    chatHistory.push(aiMessage);
    return replyText;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const fallback = new AIMessage("Error: " + errorMessage);
    chatHistory.push(fallback);
    return fallback.content as string;
  } finally {
    setBotResponding(false);
  }
}

/**
 * Send a system-level message to the LLM (e.g., instructions or context).
 */
export async function sendSystemMessage(message: string): Promise<string> {
  const systemMessage = new HumanMessage(message);
  chatHistory.push(systemMessage);

  setBotResponding(true);

  try {
    const reply = await getChatResponse(chatHistory);
    const replyText = Array.isArray(reply.text)
      ? reply.text.join("\n")
      : String(reply.text);
    const aiMessage = new AIMessage(replyText);
    chatHistory.push(aiMessage);
    return replyText;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const fallback = new AIMessage("Error: " + errorMessage);
    chatHistory.push(fallback);
    return fallback.content as string;
  } finally {
    setBotResponding(false);
  }
}

/**
 * Clear chat history and start fresh (except for system prompt if reinitialized).
 */
export function clearChatHistory(): void {
  chatHistory.length = 0;
  console.log("Chat history cleared.");
}
