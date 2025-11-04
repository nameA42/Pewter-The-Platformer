import { EditorScene } from "../editorScene";
import { sendSystemMessage } from "../../languageModel/chatBox";

export interface MapSnapshot {
  timestamp: number;
  worldFacts: { structures: any[]; collectables: any[]; enemies: any[] };
  tileData: {
    layer: string;
    tiles: { x: number; y: number; index: number }[];
  }[];
  bounds: { x: number; y: number; width: number; height: number };
}

export class MapRegenerator {
  private scene: EditorScene;

  constructor(scene: EditorScene) {
    this.scene = scene;
  }

  /**
   * Capture current map state - both WorldFacts and raw tile data
   */
  captureSnapshot(bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): MapSnapshot {
    const mapBounds = bounds || {
      x: 0,
      y: 0,
      width: this.scene.map.width,
      height: this.scene.map.height,
    };

    console.log(`Capturing snapshot for bounds:`, mapBounds);

    // Capture WorldFacts
    const structures = this.scene.worldFacts.getFact("Structure");
    const collectables = this.scene.worldFacts.getFact("Collectable");
    const enemies = this.scene.worldFacts.getFact("Enemy");

    // Capture raw tile data from layers
    const tileData: {
      layer: string;
      tiles: { x: number; y: number; index: number }[];
    }[] = [];

    // Capture Ground Layer
    const groundLayer = this.scene.map.getLayer("Ground_Layer")?.tilemapLayer;
    if (groundLayer) {
      const tiles: { x: number; y: number; index: number }[] = [];
      for (let x = mapBounds.x; x < mapBounds.x + mapBounds.width; x++) {
        for (let y = mapBounds.y; y < mapBounds.y + mapBounds.height; y++) {
          const tile = groundLayer.getTileAt(x, y);
          if (tile && tile.index !== -1) {
            tiles.push({ x, y, index: tile.index });
          }
        }
      }
      tileData.push({ layer: "Ground_Layer", tiles });
    }

    // Capture Collectables Layer
    const collectablesLayer =
      this.scene.map.getLayer("Collectables_Layer")?.tilemapLayer;
    if (collectablesLayer) {
      const tiles: { x: number; y: number; index: number }[] = [];
      for (let x = mapBounds.x; x < mapBounds.x + mapBounds.width; x++) {
        for (let y = mapBounds.y; y < mapBounds.y + mapBounds.height; y++) {
          const tile = collectablesLayer.getTileAt(x, y);
          if (tile && tile.index !== -1) {
            tiles.push({ x, y, index: tile.index });
          }
        }
      }
      tileData.push({ layer: "Collectables_Layer", tiles });
    }

    return {
      timestamp: Date.now(),
      worldFacts: { structures, collectables, enemies },
      tileData,
      bounds: mapBounds,
    };
  }

  /**
   * Clear tiles and enemies in specified area (or entire map)
   */
  clearMap(bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): void {
    const mapBounds = bounds || {
      x: 0,
      y: 0,
      width: this.scene.map.width,
      height: this.scene.map.height,
    };

    console.log(`Clearing map bounds:`, mapBounds);

    // Clear tiles
    const groundLayer = this.scene.map.getLayer("Ground_Layer")?.tilemapLayer;
    const collectablesLayer =
      this.scene.map.getLayer("Collectables_Layer")?.tilemapLayer;

    if (groundLayer) {
      for (let x = mapBounds.x; x < mapBounds.x + mapBounds.width; x++) {
        for (let y = mapBounds.y; y < mapBounds.y + mapBounds.height; y++) {
          this.scene.map.removeTileAt(x, y, false, false, groundLayer);
        }
      }
    }

    if (collectablesLayer) {
      for (let x = mapBounds.x; x < mapBounds.x + mapBounds.width; x++) {
        for (let y = mapBounds.y; y < mapBounds.y + mapBounds.height; y++) {
          this.scene.map.removeTileAt(x, y, false, false, collectablesLayer);
        }
      }
    }

    // Clear enemies within bounds
    this.scene.enemies = this.scene.enemies.filter((enemy) => {
      const tileSize = this.scene.map.tileWidth;
      const enemyTileX = Math.floor(enemy.x / tileSize);
      const enemyTileY = Math.floor(enemy.y / tileSize);

      const inBounds =
        enemyTileX >= mapBounds.x &&
        enemyTileX < mapBounds.x + mapBounds.width &&
        enemyTileY >= mapBounds.y &&
        enemyTileY < mapBounds.y + mapBounds.height;

      if (inBounds && enemy.active) {
        enemy.destroy();
      }
      return !inBounds;
    });

    // Update WorldFacts after clearing
    this.scene.worldFacts.setFact("Structure");
    this.scene.worldFacts.setFact("Collectable");
    this.scene.worldFacts.setFact("Enemy");
  }

  /**
   * Generate LLM prompt from snapshot data
   */
  generatePrompt(snapshot: MapSnapshot): string {
    let prompt = `Regenerate the map section with these specifications:\n\n`;

    // Area info
    prompt += `Area: ${snapshot.bounds.width}x${snapshot.bounds.height} tile section (starting at ${snapshot.bounds.x}, ${snapshot.bounds.y})\n\n`;

    // Structures summary
    if (snapshot.worldFacts.structures.length > 0) {
      prompt += `Structures in this area:\n`;
      snapshot.worldFacts.structures.forEach((fact) => {
        prompt += `- ${fact.toString()}\n`;
      });
      prompt += `\n`;
    }

    // Collectables summary
    if (snapshot.worldFacts.collectables.length > 0) {
      prompt += `Collectables:\n`;
      snapshot.worldFacts.collectables.forEach((fact) => {
        prompt += `- ${fact.toString()}\n`;
      });
      prompt += `\n`;
    }

    // Enemies summary
    if (snapshot.worldFacts.enemies.length > 0) {
      prompt += `Enemies:\n`;
      snapshot.worldFacts.enemies.forEach((fact) => {
        prompt += `- ${fact.toString()}\n`;
      });
      prompt += `\n`;
    }

    prompt += `Use the available tools (placeSingleTile, placeGridofTiles, placeEnemy) to recreate this map section. `;
    prompt += `Keep the design playable and maintain similar difficulty/layout. `;
    prompt += `Work within the bounds: (${snapshot.bounds.x}, ${snapshot.bounds.y}) to (${snapshot.bounds.x + snapshot.bounds.width}, ${snapshot.bounds.y + snapshot.bounds.height}).`;

    return prompt;
  }

  /**
   * Execute regeneration by sending prompt to LLM
   */
  async executeRegeneration(prompt: string): Promise<void> {
    console.log("Executing regeneration with prompt:", prompt);
    try {
      const response = await sendSystemMessage(prompt);
      console.log("Regeneration response:", response);
    } catch (error) {
      console.error("Regeneration failed:", error);
      throw error;
    }
  }

  /**
   * Convenience method: Full map regeneration
   */
  async regenerateFullMap(): Promise<void> {
    const snapshot = this.captureSnapshot();
    this.clearMap();
    const prompt = this.generatePrompt(snapshot);
    await this.executeRegeneration(prompt);
  }

  /**
   * Convenience method: Selection-based regeneration
   */
  async regenerateSelection(
    bounds: { x: number; y: number; width: number; height: number },
    selectionBox?: any,
  ): Promise<void> {
    const snapshot = this.captureSnapshot(bounds);
    this.clearMap(bounds);

    // Generate prompt - prioritize stored summary, fallback to chat history
    let prompt = this.generatePrompt(snapshot);

    if (selectionBox) {
      // First check for stored markdown summary
      const storedSummary = this.getRegenerationSummary(selectionBox);

      if (storedSummary) {
        prompt = this.generatePromptFromSummary(snapshot, storedSummary);
      } else if (
        selectionBox.localContext &&
        selectionBox.localContext.chatHistory
      ) {
        // Fallback to chat history parsing
        prompt = this.generatePromptWithHistory(
          snapshot,
          selectionBox.localContext.chatHistory,
        );
      }
    }

    await this.executeRegeneration(prompt);
  }

  /**
   * Get stored regeneration summary from selection box
   */
  private getRegenerationSummary(selectionBox: any): string | null {
    if (
      !selectionBox ||
      !selectionBox.localContext ||
      !selectionBox.localContext.data
    ) {
      return null;
    }

    try {
      // Try using getContextData method if available
      if (typeof selectionBox.getContextData === "function") {
        const summary = selectionBox.getContextData("regenerationSummary");
        return summary || null;
      }

      // Fallback: access data map directly
      const summaryData = selectionBox.localContext.data.get(
        "regenerationSummary",
      );
      if (summaryData && summaryData.value) {
        return summaryData.value;
      }
    } catch (error) {
      console.warn("Error retrieving regeneration summary:", error);
    }

    return null;
  }

  /**
   * Generate prompt from stored markdown summary
   */
  generatePromptFromSummary(snapshot: MapSnapshot, summary: string): string {
    let prompt = `Regenerate the map section with these specifications:\n\n`;

    // Include stored design intent summary
    prompt += `## Stored Design Intent\n${summary}\n\n`;

    // Area coordinates
    prompt += `## Area Coordinates\n`;
    prompt += `Area: ${snapshot.bounds.width}x${snapshot.bounds.height} tile section (starting at ${snapshot.bounds.x}, ${snapshot.bounds.y})\n\n`;

    // Current state (if any exists)
    prompt += `## Current State\n`;
    if (snapshot.worldFacts.structures.length > 0) {
      prompt += `Structures in this area:\n`;
      snapshot.worldFacts.structures.forEach((fact) => {
        prompt += `- ${fact.toString()}\n`;
      });
      prompt += `\n`;
    }

    if (snapshot.worldFacts.collectables.length > 0) {
      prompt += `Collectables:\n`;
      snapshot.worldFacts.collectables.forEach((fact) => {
        prompt += `- ${fact.toString()}\n`;
      });
      prompt += `\n`;
    }

    if (snapshot.worldFacts.enemies.length > 0) {
      prompt += `Enemies:\n`;
      snapshot.worldFacts.enemies.forEach((fact) => {
        prompt += `- ${fact.toString()}\n`;
      });
      prompt += `\n`;
    }

    prompt += `Use the available tools to recreate this design based on the stored design intent above. `;
    prompt += `Work within the bounds: (${snapshot.bounds.x}, ${snapshot.bounds.y}) to (${snapshot.bounds.x + snapshot.bounds.width}, ${snapshot.bounds.y + snapshot.bounds.height}).`;

    return prompt;
  }

  /**
   * Generate prompt with chat history for better context (fallback method)
   */
  generatePromptWithHistory(snapshot: MapSnapshot, chatHistory: any[]): string {
    // Extract conversation summary from chat history
    let conversationSummary = "";

    if (chatHistory && chatHistory.length > 0) {
      // Filter out system messages and get only user/AI messages
      const relevantMessages = chatHistory.slice(1); // Skip system message

      if (relevantMessages.length > 0) {
        conversationSummary = "\n\n=== Chat History Summary ===\n";

        // Add last 3-5 messages as context
        const recentMessages = relevantMessages.slice(-5);
        recentMessages.forEach((msg: any) => {
          const content =
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content);
          const type = msg._getType ? msg._getType() : "UNKNOWN";
          conversationSummary += `\n${type.toUpperCase()}: ${content}`;
        });

        conversationSummary +=
          "\n\n=== Use this chat history as context to understand what the user wants in this area ===\n";
      }
    }

    // Generate base prompt
    const basePrompt = this.generatePrompt(snapshot);

    // Combine with history
    const enhancedPrompt = basePrompt + conversationSummary;

    return enhancedPrompt;
  }
}
