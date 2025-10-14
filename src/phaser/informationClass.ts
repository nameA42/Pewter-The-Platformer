import { sendUserPrompt } from "../languageModel/chatBox";

export class InformationClass {
  // Keyword summary
  public keywordSummary: string = "";

  // Selection Box Information
  public placedTiles: { x: number; y: number; index: number }[] = [];
  public chatHistory: any[] = []; // mirrored from SelectionBox.localContext.chatHistory

  // Neighbor detection
  public neighbors: Set<string> = new Set(); // store neighbor keys as 'x,y'

  // Theme intent handling
  private themeIntent: string = "";

  // World / selection facts
  public worldFacts: string[] = [];
  public box: any;
  // Internal guard to prevent re-entrant summarization
  private _summarizing: boolean = false;

  constructor(box: any) {
    this.box = box;
    // initialize from box
    if (box && (box as any).localContext) {
      this.chatHistory = (box as any).localContext.chatHistory;
    }
    // Attempt to seed placedTiles from the box.selectedTiles if present
    this.extractPlacedTilesFromBox();
    
    // Auto-listen for chat updates so we can refresh/summarize when user sends messages.
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      // chatBox dispatches "activeSelectionChanged" when messages are added; listen and refresh.
      window.addEventListener("activeSelectionChanged", () => {
        try {
          // quick non-blocking refresh
          this.refreshFromBox();
        } catch (e) {
          // ignore
        }
      });
    }
  }

  // Re-sync internal data from the attached SelectionBox
  public refreshFromBox() {
    // Re-link chatHistory if the box has it
    try {
      if (this.box && (this.box as any).localContext) {
        this.chatHistory = (this.box as any).localContext.chatHistory;
      }
    } catch (e) {}

    // Re-extract placed tiles from the selection geometry if available
    try {
      this.extractPlacedTilesFromBox();
    } catch (e) {}

    // Update neighbor map
    try {
      this.updateNeighbors();
    } catch (e) {}

    // Optionally trigger summarization if the last message was a human/user message
    try {
      const last = this.chatHistory && this.chatHistory.length > 0 ? this.chatHistory[this.chatHistory.length - 1] : null;
      const isUser = last && last._getType && last._getType() === "human" || last && (last.role === "user" || last.role === "human");
      if (isUser) {
        // schedule summarization but avoid re-entrancy
        if (!this._summarizing) {
          this._summarizing = true;
          // fire-and-forget
          this.summarizeChatToThemeIntent().finally(() => {
            this._summarizing = false;
          });
        }
      }
    } catch (e) {
      // ignore
    }
    console.group("RefreshFromBox");
    console.log("InformationClass refreshed from box.");
    console.log(this);
    console.groupEnd();
  }
  // Extract placed tiles from the selection box's selectedTiles grid
  private extractPlacedTilesFromBox() {
    if (!this.box || !this.box.selectedTiles) return;
    this.placedTiles = [];
    for (let y = 0; y < this.box.selectedTiles.length; y++) {
      for (let x = 0; x < this.box.selectedTiles[y].length; x++) {
        const idx = this.box.selectedTiles[y][x];
        if (idx !== -1 && idx != null) {
          this.placedTiles.push({ x, y, index: idx });
        }
      }
    }
  }

  // Chat helpers
  addChatMessage(msg: any) {
    this.chatHistory.push(msg);
  }

  getChatHistory(): any[] {
    return this.chatHistory;
  }

  clearChatHistory() {
    this.chatHistory.length = 0;
  }

  printChatHistory() {
    console.log("Chat History for this InformationClass:");
    this.chatHistory.forEach((msg, index) => {
      console.log(`${index + 1}: ${JSON.stringify(msg)}`);
    });
  }

  // Placed tiles helpers
  addPlacedTile(tileIndex: number, x: number, y: number, layerName?: string) {
    // layerName currently unused but kept for future use
    void layerName;
    this.placedTiles.push({ x, y, index: tileIndex });
  }

  getPlacedTiles() {
    return this.placedTiles;
  }

  printPlacedTiles() {
    console.log("Placed Tiles for this InformationClass:");
    this.placedTiles.forEach((tile, index) => {
      console.log(`${index + 1}: ${JSON.stringify(tile)}`);
    });
  }

  // Asynchronous method that summarizes chat history into a theme/intent string
  async summarizeChatToThemeIntent(): Promise<string> {
    // If themeIntent already set, return it
    if (this.themeIntent) return this.themeIntent;

    const chatText = this.chatHistory
      .map((m: any) => (m && m.content ? m.content : JSON.stringify(m)))
      .join("\n");

    const prompt = `Based on the following chat and selection info, summarize the overall theme or intent in one short label: ${chatText}`;

    try {
      const reply = await sendUserPrompt(prompt);
      this.themeIntent = reply || "";
      return this.themeIntent;
    } catch (err) {
      console.warn("summarizeChatToThemeIntent failed:", err);
      return this.themeIntent;
    }
  }

  setThemeIntent(intent: string) {
    this.themeIntent = intent;
  }

  getThemeIntent(): string {
    return this.themeIntent;
  }

  communicateThemeTo(box: any) {
    // store theme intent into the target box's localContext
    if ((box as any).localContext) {
      (box as any).localContext.themeIntent = this.themeIntent;
    }
  }

  // Detect if a tile at (x,y) is touching another placed tile (4-neighborhood)
  isTouching(x: number, y: number): boolean {
    const neighbors = [
      `${x - 1},${y}`,
      `${x + 1},${y}`,
      `${x},${y - 1}`,
      `${x},${y + 1}`,
    ];
    return neighbors.some((k) => this.neighbors.has(k));
  }

  // Update neighbors set from placedTiles (local coords)
  updateNeighbors() {
    this.neighbors.clear();
    for (const t of this.placedTiles) {
      this.neighbors.add(`${t.x},${t.y}`);
    }
  }

  // Provide a small summary of world facts / selection facts
  getSelectionFacts(): string {
    const count = this.placedTiles.length;
    const tiles = Array.from(new Set(this.placedTiles.map((t) => t.index))).slice(0, 5);
    return `Tiles placed: ${count}. Distinct tile types (up to 5): ${tiles.join(", ")}`;
  }
}

export default InformationClass;
