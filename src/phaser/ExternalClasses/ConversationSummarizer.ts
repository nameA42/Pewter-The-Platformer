import { sendSystemMessage } from "../../languageModel/chatBox";

export interface ConversationData {
  userMessage: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, any>;
    result: string;
  }>;
  aiResponse: string;
  timestamp: number;
}

export class ConversationSummarizer {
  /**
   * Summarize a conversation into markdown format
   */
  static async summarizeConversation(
    userMessage: string,
    toolCalls: Array<{
      name: string;
      args: Record<string, any>;
      result: string;
    }>,
    aiResponse: string,
  ): Promise<string> {
    // If no tool calls, create a simple summary
    if (toolCalls.length === 0) {
      return this.createSimpleSummary(userMessage, aiResponse);
    }

    // Create markdown summary from tool calls
    return this.createMarkdownSummary({
      userMessage,
      toolCalls,
      aiResponse,
      timestamp: Date.now(),
    });
  }

  /**
   * Create markdown summary from conversation data
   */
  static createMarkdownSummary(conversation: ConversationData): string {
    let markdown = "## Design Intent Summary\n\n";

    markdown += `**User Request:** ${conversation.userMessage}\n\n`;

    if (conversation.toolCalls.length > 0) {
      markdown += "**Actions Taken:**\n";
      conversation.toolCalls.forEach((toolCall) => {
        const description = this.describeToolCall(toolCall);
        markdown += `- ${toolCall.name}: ${description}\n`;
      });
      markdown += "\n";
    }

    if (conversation.aiResponse) {
      markdown += `**Result:** ${this.extractKeyPoints(conversation.aiResponse)}\n\n`;
    }

    // Extract design intent from tool calls
    const designNotes = this.extractDesignIntent(conversation);
    if (designNotes) {
      markdown += `**Design Notes:** ${designNotes}\n`;
    }

    return markdown;
  }

  /**
   * Create a simple summary when no tools were called
   */
  static createSimpleSummary(userMessage: string, aiResponse: string): string {
    let markdown = "## Design Intent Summary\n\n";
    markdown += `**User Request:** ${userMessage}\n\n`;
    markdown += `**Result:** ${this.extractKeyPoints(aiResponse)}\n\n`;
    markdown += `**Design Notes:** Conversation note - no actions taken yet.\n`;
    return markdown;
  }

  /**
   * Describe a tool call in human-readable format
   */
  private static describeToolCall(toolCall: {
    name: string;
    args: Record<string, any>;
    result: string;
  }): string {
    const { name, args, result } = toolCall;

    switch (name) {
      case "placeSingleTile":
        return `Placed tile ${args.tileIndex} at (${args.x}, ${args.y}) on ${args.layerName}`;

      case "placeGridofTiles":
        return `Placed grid of tile ${args.tileIndex} from (${args.xMin}, ${args.yMin}) to (${args.xMax}, ${args.yMax}) on ${args.layerName}`;

      case "placeEnemy":
        return `Placed ${args.enemyType} at (${args.x}, ${args.y})`;

      case "clearTiles":
        return `Cleared tiles from (${args.xMin}, ${args.yMin}) to (${args.xMax}, ${args.yMax}) on ${args.layerName}`;

      case "getWorldFacts":
        return `Retrieved world facts for category: ${args.category}`;

      default:
        return `Executed ${name} with result: ${result.substring(0, 50)}...`;
    }
  }

  /**
   * Extract key points from AI response
   */
  private static extractKeyPoints(aiResponse: string): string {
    // Take first sentence or first 200 characters
    const sentences = aiResponse.split(/[.!?]\s+/);
    if (sentences.length > 0) {
      return sentences[0].substring(0, 200);
    }
    return aiResponse.substring(0, 200);
  }

  /**
   * Extract design intent from conversation
   */
  private static extractDesignIntent(conversation: ConversationData): string {
    const intentParts: string[] = [];

    // Analyze tool calls to infer design intent
    const layerUsage = new Set<string>();
    const tileTypes = new Set<number>();
    const enemyTypes = new Set<string>();

    conversation.toolCalls.forEach((toolCall) => {
      if (toolCall.args.layerName) {
        layerUsage.add(toolCall.args.layerName);
      }
      if (toolCall.args.tileIndex !== undefined) {
        tileTypes.add(toolCall.args.tileIndex);
      }
      if (toolCall.args.enemyType) {
        enemyTypes.add(toolCall.args.enemyType);
      }
    });

    if (layerUsage.size > 0) {
      intentParts.push(
        `Working on layers: ${Array.from(layerUsage).join(", ")}`,
      );
    }

    if (tileTypes.size > 0) {
      const tileDescriptions = Array.from(tileTypes).map((idx) => {
        const tileMap: Record<number, string> = {
          2: "coins",
          4: "fruits",
          5: "platform blocks",
          6: "dirt blocks",
          7: "item blocks",
        };
        return tileMap[idx] || `tile ${idx}`;
      });
      intentParts.push(`Placing: ${tileDescriptions.join(", ")}`);
    }

    if (enemyTypes.size > 0) {
      intentParts.push(`Enemies: ${Array.from(enemyTypes).join(", ")}`);
    }

    // Extract from user message if it contains design keywords
    const userMsg = conversation.userMessage.toLowerCase();
    if (userMsg.includes("challenge") || userMsg.includes("difficult")) {
      intentParts.push("Design intent: Increase difficulty");
    }
    if (userMsg.includes("easy") || userMsg.includes("simple")) {
      intentParts.push("Design intent: Simplify design");
    }
    if (userMsg.includes("collect") || userMsg.includes("coin")) {
      intentParts.push("Design intent: Add collectables");
    }
    if (userMsg.includes("platform") || userMsg.includes("jump")) {
      intentParts.push("Design intent: Platforming focused");
    }

    return intentParts.join(". ") || "General map editing";
  }

  /**
   * Append to existing summary (for multiple conversations)
   */
  static appendToSummary(existingSummary: string, newSummary: string): string {
    if (!existingSummary || existingSummary.trim().length === 0) {
      return newSummary;
    }

    // Remove the closing part if it exists
    const cleanedExisting = existingSummary
      .replace(/\*\*Design Notes:\*\*.*$/, "")
      .trim();

    // Combine summaries
    return `${cleanedExisting}\n\n---\n\n${newSummary}`;
  }
}
