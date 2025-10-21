import { sendUserPromptWithFullContext } from "../languageModel/chatBox";

export class InformationClass {
  // Keyword summary
  public keywordSummary: string = "";

  // Selection Box Information
  // Placed tiles carry ownership and timestamp metadata so selections can
  // distinguish which box placed which tile.
  public placedTiles: {
    x: number;
    y: number;
    index: number;
    layerName?: string;
    owner?: string;
    timestamp?: number;
    version?: number;
  }[] = [];
  public chatHistory: any[] = []; // mirrored from SelectionBox.localContext.chatHistory

  // Neighbor detection
  public neighbors: Set<string> = new Set(); // store neighbor keys as 'x,y'

  // Theme intent handling
  private themeIntent: string = "";

  // World / selection facts
  public worldFacts: any[] = [];
  public box: any;
  // allow consumers to opt-out of automatic summarization
  public enableAutoSummarize: boolean = true;
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

    // Populate worldFacts from scene helper if present (WorldFacts API)
    try {
      if (this.box && (this.box as any).scene && (this.box as any).scene.worldFacts) {
        const wf = (this.box as any).scene.worldFacts;

        // helper: check whether a fact's bounding coordinates intersect the box bounds
        const intersectsBox = (fact: any) => {
          try {
            if (!fact) return false;
            const fx = typeof fact.x === "number" ? fact.x : fact.x0 ?? fact.x1 ?? null;
            const fy = typeof fact.y === "number" ? fact.y : fact.y0 ?? fact.y1 ?? null;
            const fw = typeof fact.width === "number" ? fact.width : Math.abs((fact.x1 ?? fx) - (fact.x0 ?? fx)) || 0;
            const fh = typeof fact.height === "number" ? fact.height : Math.abs((fact.y1 ?? fy) - (fact.y0 ?? fy)) || 0;
            if (fx === null || fy === null) return false;
            const bx = this.box ? this.box.start?.x ?? this.box.x ?? 0 : 0;
            const by = this.box ? this.box.start?.y ?? this.box.y ?? 0 : 0;
            const bw = this.box ? (this.box.end ? Math.abs(this.box.end.x - (this.box.start?.x ?? this.box.x ?? 0)) : this.box.width ?? 0) : 0;
            const bh = this.box ? (this.box.end ? Math.abs(this.box.end.y - (this.box.start?.y ?? this.box.y ?? 0)) : this.box.height ?? 0) : 0;

            const fminx = fx;
            const fminy = fy;
            const fmaxx = fx + (fw || 0);
            const fmaxy = fy + (fh || 0);
            const bminx = bx;
            const bminy = by;
            const bmaxx = bx + (bw || 0);
            const bmaxy = by + (bh || 0);

            return !(fmaxx < bminx || fminx > bmaxx || fmaxy < bminy || fminy > bmaxy);
          } catch (e) {
            return false;
          }
        };

        const facts: any[] = [];
        try {
          if (wf && typeof wf.getFact === "function") {
            const categories = ["Structure", "Collectable", "Enemy", "Terrain", "Annotation"];
            for (const c of categories) {
              try {
                const maybe = wf.getFact(c);
                if (!maybe) continue;
                if (Array.isArray(maybe)) {
                  for (const f of maybe) {
                    if (intersectsBox(f)) facts.push({ category: c, fact: f });
                  }
                } else {
                  if (intersectsBox(maybe)) facts.push({ category: c, fact: maybe });
                }
              } catch (e) {
                // ignore per-category errors
              }
            }
          }
        } catch (e) {
          // ignore
        }

        if (facts.length === 0 && wf && typeof wf.toString === "function") {
          const s = wf.toString();
          if (s && typeof s === "string" && s.trim().length > 0) this.worldFacts = [{ summary: s.trim() }];
        } else {
          this.worldFacts = facts;
        }
      }
    } catch (e) {
      // ignore and fall back to selection facts
    }

    // Update neighbor map: prefer box-level neighbor detection (selection boxes)
    try {
      // If scene has selectionBoxes, update box neighbors using that list
      const boxes = this.box && (this.box as any).scene ? (this.box as any).scene.selectionBoxes : undefined;
      if (Array.isArray(boxes) && boxes.length > 0) {
        try {
          this.updateNeighborsForBoxes(boxes);
        } catch (e) {
          // fallback to tile-level neighbor update
          this.updateNeighbors();
        }
      } else {
        // fallback: tile-based neighbor mapping
        this.updateNeighbors();
      }
    } catch (e) {}

    // NOTE: Do not auto-summarize during refresh. Summarization should be
    // triggered explicitly when the user sends a message (see chatBox hooks).
    console.group("RefreshFromBox");
    console.log("InformationClass refreshed from box.");
    console.log(this);
    console.groupEnd();
  }
  // Extract placed tiles from the selection box's selectedTiles grid
  private extractPlacedTilesFromBox() {
    // Merge existing recorded placements with a fresh scan so we preserve ownership metadata.
    const merged = new Map<string, any>();
    try {
      // Seed from currently recorded placements
      for (const t of this.placedTiles) {
        const key = `${t.x},${t.y},${t.layerName || ""}`;
        merged.set(key, { ...t });
      }

      // Preferred: if SelectionBox has a selectedTiles grid filled by copyTiles(), use it
      if (this.box && Array.isArray((this.box as any).selectedTiles) && (this.box as any).selectedTiles.length > 0) {
        const grid = (this.box as any).selectedTiles as number[][];
        for (let y = 0; y < grid.length; y++) {
          for (let x = 0; x < grid[y].length; x++) {
            const idx = grid[y][x];
            if (idx !== -1 && idx != null) {
              const key = `${x},${y},`;
              if (!merged.has(key)) merged.set(key, { x, y, index: idx });
            }
          }
        }
      } else if (this.box && (this.box as any).start && (this.box as any).end && (this.box as any).layer) {
        // Fallback: compute from box.start..box.end using the associated tilemap layer
        const startX = Math.min((this.box as any).start.x, (this.box as any).end.x);
        const startY = Math.min((this.box as any).start.y, (this.box as any).end.y);
        const endX = Math.max((this.box as any).start.x, (this.box as any).end.x);
        const endY = Math.max((this.box as any).start.y, (this.box as any).end.y);
        const layer = (this.box as any).layer as Phaser.Tilemaps.TilemapLayer | undefined;
        const layerName = (this.box as any).layer?.name || undefined;
        if (layer) {
          for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
              try {
                const tile = layer.getTileAt(x, y);
                if (tile && tile.index != null && tile.index !== -1) {
                  const key = `${x},${y},${layerName || ""}`;
                  if (!merged.has(key)) merged.set(key, { x, y, index: tile.index, layerName });
                }
              } catch (e) {
                // ignore tile read errors
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore and fall back to what we have
    }

    this.placedTiles = Array.from(merged.values());
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
    try {
      const owner = this.box && (this.box as any).localContext ? (this.box as any).localContext.id : undefined;
      const timestamp = Date.now();
      const version = ((this.box as any).localContext?.version || 0) + 1;
      const key = `${x},${y},${layerName || ""}`;

      // replace existing entry at same coord+layer
      for (let i = 0; i < this.placedTiles.length; i++) {
        const t = this.placedTiles[i];
        const k = `${t.x},${t.y},${t.layerName || ""}`;
        if (k === key) {
          this.placedTiles[i] = { x, y, index: tileIndex, layerName, owner: t.owner || owner, timestamp, version };
          return;
        }
      }
      this.placedTiles.push({ x, y, index: tileIndex, layerName, owner, timestamp, version });
    } catch (e) {
      // best-effort fallback
      this.placedTiles.push({ x, y, index: tileIndex, layerName });
    }
  }

  getPlacedTiles() {
    return this.placedTiles;
  }

  printPlacedTiles() {
    console.log("Placed Tiles for this InformationClass:");
    this.placedTiles.forEach((tile, index) => {
      console.log(
        `${index + 1}: x=${tile.x}, y=${tile.y}, index=${tile.index}, layer=${tile.layerName || "?"}, owner=${tile.owner || "unknown"}, ts=${tile.timestamp || "-"}`,
      );
    });
  }

  // Return only placements recorded as by this attached SelectionBox
  getPlacedTilesForThisBox() {
    const owner = this.box && (this.box as any).localContext ? (this.box as any).localContext.id : undefined;
    if (!owner) return [];
    return this.placedTiles.filter((t) => t.owner === owner);
  }

  // Asynchronous method that summarizes chat history into a theme/intent string
  async summarizeChatToThemeIntent(): Promise<string> {
    // Avoid duplicate concurrent summarizations
    if (this._summarizing) return this.themeIntent;

    // If themeIntent already set, return it
    if (this.themeIntent) return this.themeIntent;

    // Nothing to summarize
    if (!this.chatHistory || this.chatHistory.length === 0) return "";

    this._summarizing = true;
    try {
      // Build a compact hidden context containing world facts, selection facts and a sample of placed tiles
      const selectionFacts = this.getSelectionFacts();
      const wfSummary = (this.worldFacts || []).slice(0, 8).map((f: any) => {
        try {
          if (typeof f === "string") return f;
          if (f && f.summary) return f.summary;
          if (f && f.category && f.fact) return `${f.category}: ${JSON.stringify(f.fact)}`;
          return JSON.stringify(f);
        } catch (e) {
          return String(f);
        }
      }).join("\n");

      const placedSample = (this.placedTiles || []).slice(0, 8).map((p: any) => {
        return `x=${p.x},y=${p.y},tile=${p.index}${p.owner ? `,owner=${p.owner}` : ""}`;
      }).join("; ");

      const hiddenContextParts: string[] = [];
      if (selectionFacts) hiddenContextParts.push(`SelectionFacts: ${selectionFacts}`);
      if (wfSummary && wfSummary.length > 0) hiddenContextParts.push(`LocalWorldFacts:\n${wfSummary}`);
      if (placedSample && placedSample.length > 0) hiddenContextParts.push(`PlacedTilesSample: ${placedSample}`);
      const hiddenContext = hiddenContextParts.join("\n\n");

      // Prompt to LLM: ask for a one-line theme and 3-6 comma-separated keywords
      const userPrompt = `Please summarize the selection's discussion in one short theme label (3 words max) and return 3-6 brief keyword tags separated by commas.`;

      console.log("InformationClass: requesting summarization with hidden context:", hiddenContext);
  const reply = await sendUserPromptWithFullContext(userPrompt, hiddenContext);
  const replyText = (reply || "").trim();
  console.log("InformationClass.summarizeChatToThemeIntent raw reply:", replyText);

      // Attempt to parse reply: common formats ->
      // Theme: <label>\nKeywords: a, b, c
      // or first line = theme, rest include keywords
      let parsedTheme = "";
      let parsedKeywords: string[] = [];

      try {
        const lines = replyText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
        if (lines.length === 0) {
          parsedTheme = replyText;
        } else {
          // Look for explicit labels
          const themeLine = lines.find((l) => /^theme[:\s]/i.test(l)) || lines[0];
          const kwLine = lines.find((l) => /keywords?:/i.test(l)) || lines.slice(1).join(" ") || "";

          // Extract theme text
          const themeMatch = themeLine.match(/^(?:theme[:\s]*)?(.*)$/i);
          if (themeMatch) parsedTheme = themeMatch[1].trim();

          // Extract keywords from kwLine if possible
          const kwMatch = kwLine.match(/(?:keywords?:\s*)(.*)/i);
          const kwSource = (kwMatch && kwMatch[1]) ? kwMatch[1] : kwLine;
          if (kwSource) {
            // split on commas or spaces if comma-less
            const parts = kwSource.split(/[,;]+/).map((s) => s.trim()).filter((s) => s.length > 0);
            if (parts.length >= 1) parsedKeywords = parts.slice(0, 6);
          }
        }
      } catch (e) {
        // fallback: use entire reply
        parsedTheme = replyText;
      }

      // Final fallback
      if (!parsedTheme || parsedTheme.length === 0) parsedTheme = replyText;
      if ((!parsedKeywords || parsedKeywords.length === 0) && replyText) {
        // attempt to extract short words from reply as keywords (last resort)
        const tokenParts = replyText.split(/\W+/).filter((t) => t.length > 3);
        parsedKeywords = tokenParts.slice(0, 6);
      }

      this.themeIntent = parsedTheme;
      this.keywordSummary = parsedKeywords.join(", ") || parsedTheme;

      console.log("InformationClass: summarization theme=", this.themeIntent, "keywords=", this.keywordSummary);
      return this.themeIntent;
    } catch (err) {
      console.warn("summarizeChatToThemeIntent failed:", err);
      return this.themeIntent;
    } finally {
      this._summarizing = false;
    }
  }

  // Convenience wrapper to force-run summarization now and return the result
  public async runSummarizationNow(): Promise<{ theme: string; keywords: string }> {
    const theme = await this.summarizeChatToThemeIntent();
    return { theme, keywords: this.keywordSummary };
  }

  // Simpler one-shot summary: ask the LLM for a one-line summary (used when user sends a message)
  public async generateSummaryOneLine(): Promise<string> {
    try {
      const hidden = this.getSelectionFacts();
      const prompt = `Please provide a single short label (max 4 words) that summarizes the user's last message and the selection context. Only reply with the label.`;
      const hiddenContext = hidden || "";
      console.log("InformationClass.generateSummaryOneLine called; hiddenContext=", hiddenContext);
      const reply = await sendUserPromptWithFullContext(prompt, hiddenContext);
      const label = (reply || "").trim();
      console.log("InformationClass.generateSummaryOneLine raw reply:", label);
      if (label && label.length > 0) {
        this.themeIntent = label;
        this.keywordSummary = label;
      }
      return this.themeIntent;
    } catch (e) {
      console.warn("generateSummaryOneLine failed:", e);
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

  // --- Box-level neighbor / collaborative methods (migrated from SelectionBox)
  // store actual SelectionBox neighbors
  public boxNeighbors: Set<any> = new Set();
  private lastNeighborCheckBox: number = 0;
  private neighborCheckIntervalBox: number = 500;

  // Determine whether this.box is touching another SelectionBox (adjacent/overlap)
  public isTouchingBox(other: any): boolean {
    try {
      if (!this.box || !other || other === this) return false;
      if (other.getZLevel && this.box.getZLevel && other.getZLevel() !== this.box.getZLevel()) return false;
      const myBounds = this.box.getBounds();
      const otherBounds = other.getBounds();

      const touching =
        Phaser.Geom.Intersects.RectangleToRectangle(myBounds, otherBounds) ||
        ((myBounds.right + 1 === otherBounds.left || otherBounds.right + 1 === myBounds.left) &&
          !(myBounds.bottom < otherBounds.top || otherBounds.bottom < myBounds.top)) ||
        ((myBounds.bottom + 1 === otherBounds.top || otherBounds.bottom + 1 === myBounds.top) &&
          !(myBounds.right < otherBounds.left || otherBounds.right < myBounds.left));

      return touching;
    } catch (e) {
      return false;
    }
  }

  // Update neighbor list by checking provided boxes (or scene's selectionBoxes if none provided)
  public updateNeighborsForBoxes(allBoxes?: any[]) {
    const now = Date.now();
    if (now - this.lastNeighborCheckBox < this.neighborCheckIntervalBox) return;
    this.lastNeighborCheckBox = now;

    const previous = new Set(this.boxNeighbors);
    this.boxNeighbors.clear();

    const boxes = allBoxes || (this.box && (this.box.scene as any)?.selectionBoxes) || [];
    for (const b of boxes) {
      if (b === this.box) continue;
      if (this.isTouchingBox(b)) {
        this.boxNeighbors.add(b);
      }
    }

    // notify additions
    this.boxNeighbors.forEach((n) => {
      if (!previous.has(n)) this.onNeighborAdded(n);
    });
    // notify removals
    previous.forEach((p) => {
      if (!this.boxNeighbors.has(p)) this.onNeighborRemoved(p);
    });
  }

  private onNeighborAdded(neighbor: any) {
    try {
      // share shareable data
      this.shareDataWithNeighbor(neighbor);
      // update visual indicator on the selection box if available
      if (this.box && typeof this.box.updateTabPosition === "function") {
        this.box.updateTabPosition();
      }
    } catch (e) {}
  }

  private onNeighborRemoved(_neighbor: any) {
    try {
      if (this.box && typeof this.box.updateTabPosition === "function") {
        this.box.updateTabPosition();
      }
    } catch (e) {}
  }

  private shareDataWithNeighbor(neighbor: any) {
    try {
      const shareableData = this.getShareableDataFromLocalContext();
      shareableData.forEach((data: any, key: string) => {
        if (neighbor && typeof neighbor.receiveSharedData === "function") {
          neighbor.receiveSharedData(key, data);
        }
      });
    } catch (e) {}
  }

  private getShareableDataFromLocalContext(): Map<string, any> {
    const out = new Map<string, any>();
    try {
      const map = (this.box as any).localContext?.data as Map<string, any> | undefined;
      if (!map) return out;
      map.forEach((data: any, key: string) => {
        if (data && data.canShare) out.set(key, data);
      });
    } catch (e) {}
    return out;
  }

  // Receive shared data from a neighbor - delegates into box.localContext merge rules
  public receiveSharedData(key: string, incomingData: any): void {
    try {
      const map = (this.box as any).localContext?.data as Map<string, any>;
      if (!map) return;
      const existing = map.get(key);
      if (!existing) {
        if (incomingData.canShare) {
          map.set(key, { ...incomingData });
          (this.box as any).localContext.version++;
        }
        return;
      }
      if (existing.owner === (this.box as any).localContext.id) {
        if (incomingData.owner === existing.owner && incomingData.version > existing.version) {
          map.set(key, incomingData);
          (this.box as any).localContext.version++;
        }
      } else {
        if (incomingData.owner === existing.owner && incomingData.version > existing.version) {
          map.set(key, incomingData);
          (this.box as any).localContext.version++;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // Broadcast shareable data to current neighbors (box-level)
  public broadcastToNeighborsBox(): void {
    try {
      const shareableData = this.getShareableDataFromLocalContext();
      this.boxNeighbors.forEach((neighbor: any) => {
        shareableData.forEach((data: any, key: string) => {
          if (neighbor && typeof neighbor.receiveSharedData === "function") {
            neighbor.receiveSharedData(key, data);
          }
        });
      });
    } catch (e) {}
  }

  // Request specific data from neighbors
  public requestDataFromNeighborsBox(key: string): any | null {
    try {
      for (const neighbor of this.boxNeighbors) {
        const data = neighbor.localContext?.data?.get(key);
        if (data && data.canShare) {
          // merge via receive
          this.receiveSharedData(key, data);
          return data;
        }
      }
    } catch (e) {}
    return null;
  }

  public getNeighborsBoxes(): any[] {
    return Array.from(this.boxNeighbors);
  }

  public networkHasDataBox(key: string): boolean {
    try {
      if ((this.box as any).localContext?.data?.has(key)) return true;
      for (const n of this.boxNeighbors) {
        if (n.localContext?.data?.has(key)) return true;
      }
    } catch (e) {}
    return false;
  }

  public getNetworkDataSummaryBox(): { own: string[]; neighborsShareable: string[] } {
    const own: string[] = Array.from(((this.box as any).localContext?.data?.keys()) || []);
    const neighborsShareable = new Set<string>();
    this.boxNeighbors.forEach((neighbor: any) => {
      neighbor.localContext?.data?.forEach((data: any, key: string) => {
        if (data && data.canShare) neighborsShareable.add(key);
      });
    });
    return { own, neighborsShareable: Array.from(neighborsShareable) };
  }

  public getCollaborativeContextForChatBox(): string {
    const contextLines: string[] = [];
    try {
      contextLines.push(`=== Box Context ===`);
      contextLines.push(`Box ID: ${(this.box as any).localContext?.id}`);
      contextLines.push(`Z-Level: ${this.box.getZLevel ? this.box.getZLevel() : "?"}`);
      contextLines.push(`Position: (${this.box.start?.x}, ${this.box.start?.y}) to (${this.box.end?.x}, ${this.box.end?.y})`);
      contextLines.push(`Neighbors: ${this.boxNeighbors.size} connected boxes`);

      const map = (this.box as any).localContext?.data as Map<string, any> | undefined;
      if (map && map.size > 0) {
        contextLines.push(`\n=== My Data ===`);
        map.forEach((data: any, key: string) => {
          contextLines.push(`${key}: ${JSON.stringify(data.value)} (${data.canShare ? "shareable" : "private"})`);
        });
      }

      const networkSummary = this.getNetworkDataSummaryBox();
      if (networkSummary.neighborsShareable.length > 0) {
        contextLines.push(`\n=== Available from Neighbors ===`);
        networkSummary.neighborsShareable.forEach((key) => {
          const value = this.requestDataFromNeighborsBox(key);
          if (value !== null) {
            contextLines.push(`${key}: ${JSON.stringify(value)} (from neighbor)`);
          }
        });
      }

      if (this.boxNeighbors.size > 0) {
        contextLines.push(`\n=== Neighbor Details ===`);
        this.boxNeighbors.forEach((neighbor: any) => {
          try {
            const ni = neighbor.getDebugInfo ? neighbor.getDebugInfo() : { id: neighbor.localContext?.id };
            contextLines.push(`Neighbor ${ni.id}: Z${ni.zLevel}, ${ni.dataKeys?.length || 0} data items`);
          } catch (e) {}
        });
      }
    } catch (e) {}
    return contextLines.join("\n");
  }

  public addCollaborativeChatMessageBox(msg: any, shareWithNeighbors: boolean = false) {
    try {
      (this.box as any).localContext.chatHistory.push(msg);
      if (shareWithNeighbors && typeof msg.content === "string") {
        // share as last_chat_message
        const payload = {
          content: msg.content,
          timestamp: Date.now(),
          from: (this.box as any).localContext.id,
        };
        this.shareDataWithLocalContext("last_chat_message", payload, true);
      }
    } catch (e) {}
  }

  private shareDataWithLocalContext(key: string, value: any, canShare: boolean = true) {
    try {
      const ctx = (this.box as any).localContext;
      if (!ctx) return;
      const data = {
        value,
        owner: ctx.id,
        version: (ctx.version || 0) + 1,
        lastModified: Date.now(),
        canShare,
      };
      ctx.data.set(key, data);
      ctx.version = (ctx.version || 0) + 1;
    } catch (e) {}
  }

  public getSharedChatMessagesBox(): any[] {
    const out: any[] = [];
    try {
      this.boxNeighbors.forEach((neighbor: any) => {
        const sharedMsg = neighbor.getContextData ? neighbor.getContextData("last_chat_message") : neighbor.localContext?.data?.get("last_chat_message");
        if (sharedMsg) {
          out.push({ ...sharedMsg, fromNeighbor: neighbor.localContext?.id });
        }
      });
    } catch (e) {}
    return out.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Demo helpers
  public demoCollaborativeSharingBox(): void {
    try {
      this.shareDataWithLocalContext("demo_message", `Hello from ${(this.box as any).localContext?.id}!`, true);
      this.shareDataWithLocalContext("timestamp", Date.now(), true);
      this.shareDataWithLocalContext("box_color", this.box.getColorForZLevel ? this.box.getColorForZLevel(this.box.getZLevel()) : 0xffffff, true);
    } catch (e) {}
  }

  public demoLogNetworkDataBox(): void {
    try {
      console.log(`=== Network Data for Box ${(this.box as any).localContext?.id} ===`);
      console.log("My data:", Array.from(((this.box as any).localContext?.data?.entries()) || []));
      console.log("Network summary:", this.getNetworkDataSummaryBox());
      console.log("Debug info:", (this.box as any).getDebugInfo ? (this.box as any).getDebugInfo() : {});
      this.boxNeighbors.forEach((neighbor: any) => {
        console.log(`Neighbor ${neighbor.localContext?.id}:`, neighbor.getDebugInfo ? neighbor.getDebugInfo() : {});
      });
    } catch (e) {}
  }

  public testCollaborativeSharingBox(): void {
    try {
      this.shareDataWithLocalContext("test_message", `Hello from Box ${(this.box as any).localContext?.id}!`, true);
      this.shareDataWithLocalContext("test_number", Math.floor(Math.random() * 100), true);
      this.shareDataWithLocalContext("test_timestamp", new Date().toISOString(), true);
      setTimeout(() => {
        console.log(`Box ${(this.box as any).localContext?.id} can see from neighbors:`, this.getNetworkDataSummaryBox().neighborsShareable);
      }, 100);
    } catch (e) {}
  }

  public testChatContextBox(): string {
    try {
      const c = this.getCollaborativeContextForChatBox();
      console.log("Generated context:", c);
      return c;
    } catch (e) {
      return "";
    }
  }

  public updateTabWithNetworkInfoBox(): void {
    try {
      if (!this.box || !this.box.tabText || !this.box.tabBg) return;
      const neighborCount = this.boxNeighbors.size;
      const dataCount = (this.box as any).localContext?.data?.size || 0;
      this.box.tabText.setText(`Box (${neighborCount}n, ${dataCount}d)`);
      if (this.box.tabBg) {
        if (neighborCount > 0) {
          this.box.tabBg.setFillStyle(this.box.isActive ? 0x00ff88 : 0x00aaff);
        } else {
          this.box.tabBg.setFillStyle(this.box.isActive ? 0x127803 : this.box.isFinalized ? 0x2b2b2b : 0x2b6bff);
        }
      }
    } catch (e) {}
  }

  // Provide a small summary of world facts / selection facts
  getSelectionFacts(): string {
    const count = this.placedTiles.length;
    const tiles = Array.from(new Set(this.placedTiles.map((t) => t.index))).slice(0, 5);
    const base = `Tiles placed: ${count}. Distinct tile types (up to 5): ${tiles.join(", ")}`;
    if (this.worldFacts && this.worldFacts.length > 0) {
      return `${base} | World facts: ${this.worldFacts.slice(0, 3).join("; ")}`;
    }
    return base;
  }
}

export default InformationClass;
