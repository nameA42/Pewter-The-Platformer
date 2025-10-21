import Phaser from "phaser";

// STEP 1: Collaborative Context Merging - Basic interfaces and ownership structure
// Interface for collaborative context data
interface BoxContextData {
  value: any;
  owner: string; // box id that owns this data
  version: number;
  lastModified: number;
  canShare: boolean; // whether this data can be shared with neighbors
}

// Interface for box context with ownership tracking
interface BoxContext {
  id: string;
  data: Map<string, BoxContextData>;
  chatHistory: any[];
  version: number;
}

export class SelectionBox {
  /**
   * Summarize the chat log into a single keyword using the InformationClass (which uses the LLM).
   * Falls back to the old inline summarization if info isn't available.
   */
  async summarizeChatToThemeIntent(): Promise<string> {
    const info = (this as any).getInfo?.() || (this as any).info;
    if (info && typeof info.summarizeChatToThemeIntent === "function") {
      try {
        const kw = await info.summarizeChatToThemeIntent();
        return kw;
      } catch (e) {
        // fall through to fallback
      }
    }

    // Fallback: dynamic import and previous inline summarization
    // @ts-ignore
    const { sendUserPrompt } = await import("../languageModel/chatBox");
    const chatLog = this.getChatHistory()
      .map((msg: any) =>
        typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      )
      .join("\n");
    const prompt = `Summarize the following chat log into a single keyword that best represents the user's thematic intent for this selection box. Only reply with the keyword.\n${chatLog}`;
    const keyword = (await sendUserPrompt(prompt)).trim();
    // Delegate setting theme intent to info if possible
    if (info && typeof info.setThemeIntent === "function") {
      info.setThemeIntent(keyword);
    }
    return keyword;
  }
  private graphics: Phaser.GameObjects.Graphics;
  private start: Phaser.Math.Vector2;
  private end: Phaser.Math.Vector2;
  /**
   * Thematic intent is now owned by the attached InformationClass (this.info).
   * SelectionBox will delegate theme-related calls to the info object when present.
   */
  public getStart(): Phaser.Math.Vector2 {
    return this.start.clone();
  }
  public getEnd(): Phaser.Math.Vector2 {
    return this.end.clone();
  }
  private scene: Phaser.Scene;
  private zLevel: number;
  public selectedTiles: number[][] = [];
  private layer: Phaser.Tilemaps.TilemapLayer;
  public localContext: BoxContext;
  public placedTiles: { tileIndex: number; x: number; y: number; layerName: string}[] = [];
  private tabContainer: Phaser.GameObjects.Container | null = null;
  private onSelect?: (box: SelectionBox) => void;
  private tabBg: Phaser.GameObjects.Rectangle | null = null;
  private tabText: Phaser.GameObjects.Text | null = null;
  private isActive: boolean = false;
  private isFinalized: boolean = false;

  // STEP 3: Collaborative Context Merging - Neighbor tracking
  // neighbor tracking is delegated to attached InformationClass (box.getInfo())

  // Drag helpers
  private _dragInitialStart?: Phaser.Math.Vector2;
  private _dragInitialEnd?: Phaser.Math.Vector2;
  private _dragPointerTileX?: number;
  private _dragPointerTileY?: number;
  
  
  private _pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
  private _pointerUpHandler?: (pointer: Phaser.Input.Pointer) => void;

  constructor(
    scene: Phaser.Scene,
    start: Phaser.Math.Vector2,
    end: Phaser.Math.Vector2,
    zLevel: number = 1,
    layer: Phaser.Tilemaps.TilemapLayer,
    onSelect?: (box: SelectionBox) => void,
  ) {
    this.scene = scene;
    this.start = start.clone();
    this.end = end.clone();
    this.zLevel = zLevel;
    this.layer = layer;

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(100);
    this.redraw();

    // Initialize localContext with proper structure
    this.localContext = {
      id: `box_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      data: new Map(),
      chatHistory: [],
      version: 1,
    };
    this.onSelect = onSelect;
    // create tab after initial draw
    this.createTab();
    // Attach an InformationClass instance lazily to avoid circular imports
    // InformationClass should be attached by the caller (EditorScene) to avoid
    // dynamic import races. If not attached, callers can create one manually.
    // themeIntent can be set later via setter
  }

  // STEP 2: Collaborative Context Merging - Basic data management methods

  /**
   * Set data in this box's context with ownership tracking
   */
  public setContextData(
    key: string,
    value: any,
    canShare: boolean = false,
  ): void {
    const contextData: BoxContextData = {
      value,
      owner: this.localContext.id,
      version: 1,
      lastModified: Date.now(),
      canShare,
    };

    this.localContext.data.set(key, contextData);
    this.localContext.version++;
  }

  /**
   * Get data from this box's context
   */
  public getContextData(key: string): any {
    const contextData = this.localContext.data.get(key);
    return contextData ? contextData.value : null;
  }

  /**
   * Check if this box owns a specific piece of data
   */
  public ownsData(key: string): boolean {
    const contextData = this.localContext.data.get(key);
    return contextData ? contextData.owner === this.localContext.id : false;
  }

  /**
   * Get all shareable data from this box
   */
  public getShareableData(): Map<string, BoxContextData> {
    const shareableData = new Map<string, BoxContextData>();
    this.localContext.data.forEach((data, key) => {
      if (data.canShare) {
        shareableData.set(key, data);
      }
    });
    return shareableData;
  }

  // STEP 3: Collaborative Context Merging - Neighbor detection and management

  /**
   * Check if this box is touching another box (adjacent or overlapping)
   */
  public isTouching(other: SelectionBox): boolean {
    // Delegate to InformationClass if present
    try {
      const info = (this as any).getInfo?.() || (this as any).info;
      if (info && typeof info.isTouchingBox === "function") return info.isTouchingBox(other);
    } catch (e) {}
    // Fallback to conservative check
    if (other === this || other.getZLevel() !== this.zLevel) return false;
    return Phaser.Geom.Intersects.RectangleToRectangle(this.getBounds(), other.getBounds());
  }
  // Update neighbors: delegate to info
  public updateNeighbors(allBoxes: SelectionBox[]): void {
    try {
      const info = (this as any).getInfo?.() || (this as any).info;
      if (info && typeof info.updateNeighborsForBoxes === "function") return info.updateNeighborsForBoxes(allBoxes as any[]);
    } catch (e) {}
  }

  /**
   * Called when a new neighbor is detected
   */
  // neighbor add/remove/share handled by InformationClass; SelectionBox keeps lightweight delegates

  /**
   * Get current neighbors
   */
  public getNeighbors(): SelectionBox[] {
    try {
      const info = (this as any).getInfo?.() || (this as any).info;
      if (info && typeof info.getNeighborsBoxes === "function") return info.getNeighborsBoxes() as SelectionBox[];
    } catch (e) {}
    return [];
  }

  // STEP 4: Collaborative Context Merging - Data sharing and merging methods

  /**
   * Receive shared data from a neighbor - implements collaborative merging
   */
  public receiveSharedData(key: string, incomingData: BoxContextData): void {
    const existingData = this.localContext.data.get(key);

    if (!existingData) {
      // We don't have this data, accept it if it's shareable
      if (incomingData.canShare) {
        this.localContext.data.set(key, {
          ...incomingData,
          // Don't change ownership when receiving shared data
        });
        this.localContext.version++;
      }
      return;
    }

    // We have this data - apply collaborative merging rules
    if (existingData.owner === this.localContext.id) {
      // We own this data - only update if incoming is newer from same owner
      if (
        incomingData.owner === existingData.owner &&
        incomingData.version > existingData.version
      ) {
        this.localContext.data.set(key, incomingData);
        this.localContext.version++;
      }
      // Otherwise, keep our version (we're the owner)
    } else {
      // We don't own this data - accept updates from the rightful owner
      if (
        incomingData.owner === existingData.owner &&
        incomingData.version > existingData.version
      ) {
        this.localContext.data.set(key, incomingData);
        this.localContext.version++;
      }
    }
  }

  /**
   * Broadcast shareable data to all current neighbors
   */
  public broadcastToNeighbors(): void {
    try {
      const info = (this as any).getInfo?.() || (this as any).info;
      if (info && typeof info.broadcastToNeighborsBox === "function") return info.broadcastToNeighborsBox();
    } catch (e) {}

    const shareableData = this.getShareableData();
    this.getNeighbors().forEach((neighbor) => {
      shareableData.forEach((data, key) => {
        neighbor.receiveSharedData(key, data);
      });
    });
  }

  /**
   * Request specific data from neighbors
   */
  public requestDataFromNeighbors(key: string): BoxContextData | null {
    try {
      const info = (this as any).getInfo?.() || (this as any).info;
      if (info && typeof info.requestDataFromNeighborsBox === "function") return info.requestDataFromNeighborsBox(key);
    } catch (e) {}

    for (const neighbor of this.getNeighbors()) {
      const data = neighbor.localContext.data.get(key);
      if (data && data.canShare) {
        this.receiveSharedData(key, data);
        return data;
      }
    }
    return null;
  }

  getZLevel(): number {
    return this.zLevel;
  }

  updateStart(start: Phaser.Math.Vector2) {
    if (this.isFinalized) return; // don't allow resizing finalized boxes
    this.start = start.clone();
    this.redraw();
  }

  updateEnd(end: Phaser.Math.Vector2) {
    if (this.isFinalized) return; // don't allow resizing finalized boxes
    this.end = end.clone();
    this.redraw();
  }

  setZLevel(zLevel: number) {
    this.zLevel = zLevel;
    this.redraw();
  }

  private redraw() {
    this.graphics.clear();

    const startX = Math.min(this.start.x, this.end.x);
    const startY = Math.min(this.start.y, this.end.y);
    const endX = Math.max(this.start.x, this.end.x);
    const endY = Math.max(this.start.y, this.end.y);

    // Pick color based on zLevel
    const color = this.getColorForZLevel(this.zLevel);

    // Draw filled region
    this.graphics.fillStyle(color, 0.3);
    this.graphics.fillRect(
      startX * 16,
      startY * 16,
      (endX - startX + 1) * 16,
      (endY - startY + 1) * 16,
    );

    // Draw dashed border
    this.graphics.lineStyle(2, color, 1);
    this.graphics.beginPath();

    const width = endX - startX + 1;
    const height = endY - startY + 1;
    const dashLength = 8;
    const gapLength = 4;

    if (this.isFinalized) {
      // Solid rectangle border for finalized boxes
      this.graphics.strokeRect(
        startX * 16,
        startY * 16,
        (endX - startX + 1) * 16,
        (endY - startY + 1) * 16,
      );
    } else {
      // Dashed border for temporary boxes
      // Top border
      for (let i = 0; i < width * 16; i += dashLength + gapLength) {
        this.graphics.moveTo(startX * 16 + i, startY * 16);
        this.graphics.lineTo(
          Math.min(startX * 16 + i + dashLength, endX * 16 + 16),
          startY * 16,
        );
      }

      // Bottom border
      for (let i = 0; i < width * 16; i += dashLength + gapLength) {
        this.graphics.moveTo(startX * 16 + i, endY * 16 + 16);
        this.graphics.lineTo(
          Math.min(startX * 16 + i + dashLength, endX * 16 + 16),
          endY * 16 + 16,
        );
      }

      // Left border
      for (let i = 0; i < height * 16; i += dashLength + gapLength) {
        this.graphics.moveTo(startX * 16, startY * 16 + i);
        this.graphics.lineTo(
          startX * 16,
          Math.min(startY * 16 + i + dashLength, endY * 16 + 16),
        );
      }

      // Right border
      for (let i = 0; i < height * 16; i += dashLength + gapLength) {
        this.graphics.moveTo(endX * 16 + 16, startY * 16 + i);
        this.graphics.lineTo(
          endX * 16 + 16,
          Math.min(startY * 16 + i + dashLength, endY * 16 + 16),
        );
      }

      this.graphics.strokePath();
    }

    this.updateTabPosition();
  }

  private createTab() {
    // Create a small clickable tab that sits above the selection box
    if (this.tabContainer) {
      this.tabContainer.destroy();
    }
    const startX = Math.min(this.start.x, this.end.x);
    const startY = Math.min(this.start.y, this.end.y);

    const worldX = startX * 16;
    const worldY = startY * 16;
    // smaller, neater tab
    const w = 48;
    const h = 14;
    // Decide initial fill based on state: active -> green, temporary (not finalized) -> blue, finalized -> gray
    const initialFill = this.isActive
      ? 0x127803
      : this.isFinalized
        ? 0x2b2b2b
        : 0x2b6bff; // bright blue for temporary non-selected box
    const initialStroke = this.isActive
      ? 0x0f3800
      : this.isFinalized
        ? 0x111111
        : 0x123a66;

    const bg = this.scene.add
      .rectangle(0, 0, w, h, initialFill)
      .setOrigin(0, 0.5);
    bg.setStrokeStyle(1, initialStroke);
    const txt = this.scene.add
      .text(6, 0, `Box`, { fontSize: "10px", color: "#ffffff" })
      .setOrigin(0, 0.5);

    const container = this.scene.add.container(worldX, worldY - 10, [bg, txt]);
    container.setDepth(1001);
    container.setSize(w, h);

    // Store references for state changes
    this.tabBg = bg;
    this.tabText = txt;

    // Make interactive on the background rectangle
    bg.setInteractive({ useHandCursor: true });
    bg.on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: any,
      ) => {
        // Prevent global pointer handlers (like EditorScene startSelection)
        // from also reacting to this click.
        try {
          if (event && typeof event.stopPropagation === "function") {
            event.stopPropagation();
          }
        } catch (e) {
          // ignore
        }
        if (this.onSelect) this.onSelect(this);
      },
    );

    // Implement pointer-driven drag so the box follows the mouse without snapping
    try {
      let dragging = false;

      const pointerMove = (pointer: Phaser.Input.Pointer) => {
        if (!dragging) return;
        if (!this._dragInitialStart || !this._dragInitialEnd) return;
        const cam =
          this.scene.cameras && this.scene.cameras.main
            ? this.scene.cameras.main
            : null;
        const world = cam
          ? cam.getWorldPoint(pointer.x, pointer.y)
          : { x: pointer.worldX, y: pointer.worldY };
        const currentTileX = Math.floor(world.x / 16);
        const currentTileY = Math.floor(world.y / 16);

        const startTileX = this._dragPointerTileX ?? currentTileX;
        const startTileY = this._dragPointerTileY ?? currentTileY;
        const tileDX = currentTileX - startTileX;
        const tileDY = currentTileY - startTileY;

        const newStart = this._dragInitialStart
          .clone()
          .add(new Phaser.Math.Vector2(tileDX, tileDY));
        const newEnd = this._dragInitialEnd
          .clone()
          .add(new Phaser.Math.Vector2(tileDX, tileDY));

        const boxWidth =
          Math.max(newEnd.x, newStart.x) - Math.min(newStart.x, newEnd.x) + 1;
        const boxHeight =
          Math.max(newEnd.y, newStart.y) - Math.min(newStart.y, newEnd.y) + 1;

        let newStartX = newStart.x;
        let newStartY = newStart.y;

        const worldMinX = 0;
        const worldMinY = 0;
        const worldMaxX = cam
          ? Math.floor((cam.worldView.width + cam.worldView.x) / 16)
          : Number.MAX_SAFE_INTEGER;
        const worldMaxY = cam
          ? Math.floor((cam.worldView.height + cam.worldView.y) / 16)
          : Number.MAX_SAFE_INTEGER;

        if (newStartX < worldMinX) newStartX = worldMinX;
        if (newStartY < worldMinY) newStartY = worldMinY;
        if (newStartX + boxWidth - 1 > worldMaxX)
          newStartX = worldMaxX - (boxWidth - 1);
        if (newStartY + boxHeight - 1 > worldMaxY)
          newStartY = worldMaxY - (boxHeight - 1);

        const candidateStart = new Phaser.Math.Vector2(newStartX, newStartY);
        const candidateEnd = new Phaser.Math.Vector2(
          newStartX + boxWidth - 1,
          newStartY + boxHeight - 1,
        );

        // Prevent intersection with other boxes on same z-level
        try {
          const editor = this.scene as any as any;
          const boxes: any[] = editor.selectionBoxes || [];
          let intersects = false;
          const candRect = new Phaser.Geom.Rectangle(
            candidateStart.x,
            candidateStart.y,
            candidateEnd.x - candidateStart.x,
            candidateEnd.y - candidateStart.y,
          );
          for (const b of boxes) {
            if (b === this) continue;
            if (b.getZLevel && b.getZLevel() === this.zLevel) {
              const br = b.getBounds();
              if (Phaser.Geom.Intersects.RectangleToRectangle(candRect, br)) {
                intersects = true;
                break;
              }
            }
          }
          if (!intersects) {
            this.start = candidateStart;
            this.end = candidateEnd;
            this.redraw();
          }
        } catch (e) {
          this.start = candidateStart;
          this.end = candidateEnd;
          this.redraw();
        }
      };

      const pointerUp = (_pointer: Phaser.Input.Pointer) => {
        dragging = false;
        try {
          if (this._pointerMoveHandler)
            this.scene.input.off("pointermove", this._pointerMoveHandler);
        } catch (e) {}
        try {
          if (this._pointerUpHandler)
            this.scene.input.off("pointerup", this._pointerUpHandler);
        } catch (e) {}
        // After drag ends, inform info to refresh
        try {
          const info = (this as any).getInfo?.() || (this as any).info;
          if (info && typeof info.refreshFromBox === "function") info.refreshFromBox();
        } catch (e) {}
      };

      // Start drag on pointerdown on the tab if finalized
      bg.on(
        "pointerdown",
        (
          pointer: Phaser.Input.Pointer,
          _lx: number,
          _ly: number,
          event: any,
        ) => {
          try {
            if (event && typeof event.stopPropagation === "function")
              event.stopPropagation();
          } catch (e) {}
          if (this.onSelect) this.onSelect(this);
          if (!this.isFinalized) return;
          // prepare drag
          this._dragInitialStart = this.start.clone();
          this._dragInitialEnd = this.end.clone();
          const cam =
            this.scene.cameras && this.scene.cameras.main
              ? this.scene.cameras.main
              : null;
          const world = cam
            ? cam.getWorldPoint(pointer.x, pointer.y)
            : { x: pointer.worldX, y: pointer.worldY };
          const pTileX = Math.floor(world.x / 16);
          const pTileY = Math.floor(world.y / 16);
          // store pointer-start tile so subsequent moves compute a delta from this origin
          this._dragPointerTileX = pTileX;
          this._dragPointerTileY = pTileY;
          dragging = true;
          this._pointerMoveHandler = pointerMove;
          this._pointerUpHandler = pointerUp;
          this.scene.input.on("pointermove", this._pointerMoveHandler);
          this.scene.input.on("pointerup", this._pointerUpHandler);
        },
      );
    } catch (e) {
      // ignore if input system not available
    }
    bg.on("pointerover", () => {
      if (!this.isActive) {
        if (this.isFinalized) {
          bg.setFillStyle(0x3d3d3d);
        } else {
          // lighter blue hover for temporary box
          bg.setFillStyle(0x4d8cff);
        }
      }
    });
    bg.on("pointerout", () => {
      if (!this.isActive) {
        if (this.isFinalized) {
          bg.setFillStyle(0x2b2b2b);
        } else {
          bg.setFillStyle(0x2b6bff);
        }
      }
    });

    this.tabContainer = container;
  }

  public updateTabPosition() {
    if (!this.tabContainer) return;
    const startX = Math.min(this.start.x, this.end.x);
    const startY = Math.min(this.start.y, this.end.y);
    const worldX = startX * 16;
    const worldY = startY * 16;
    this.tabContainer.setPosition(worldX, worldY - 12);
  }

  // Toggle active visual state on the tab
  public setActive(active: boolean) {
    this.isActive = active;
    console.log(`SelectionBox.setActive called: ${active}`);
    if (!this.tabBg || !this.tabText) return;
    if (active) {
      this.tabBg.setFillStyle(0x127803); // green when active
      this.tabBg.setStrokeStyle(1, 0x0f3800);
      this.tabText.setStyle({ color: "#ffffff" });
    } else {
      // Not active: if temporary (not finalized) use blue glowing style, otherwise default gray
      if (!this.isFinalized) {
        this.tabBg.setFillStyle(0x2b6bff);
        this.tabBg.setStrokeStyle(1, 0x123a66);
      } else {
        this.tabBg.setFillStyle(0x2b2b2b);
        this.tabBg.setStrokeStyle(1, 0x111111);
      }
      this.tabText.setStyle({ color: "#ffffff" });
    }
  }

  copyTiles() {
    const sX = Math.min(this.start.x, this.end.x);
    const sY = Math.min(this.start.y, this.end.y);
    const eX = Math.max(this.start.x, this.end.x);
    const eY = Math.max(this.start.y, this.end.y);

    this.selectedTiles = [];
    for (let y = sY; y <= eY; y++) {
      const row: number[] = [];
      for (let x = sX; x <= eX; x++) {
        const tile = this.layer.getTileAt(x, y);
        row.push(tile ? tile.index : -1);
      }
      this.selectedTiles.push(row);
    }
  }

  private getColorForZLevel(zLevel: number): number {
    switch (zLevel) {
      case 1:
        return 0xff5555; // red
      case 2:
        return 0x55ff55; // green
      case 3:
        return 0x5555ff; // blue
      default:
        return 0xffffff; // white (This is not gonna happen)
    }
  }

  // Checking the possible bounds without finalizing the update
  tempBounds(possibleEnd: Phaser.Math.Vector2): Phaser.Geom.Rectangle {
    const startX = Math.min(this.start.x, possibleEnd.x);
    const startY = Math.min(this.start.y, possibleEnd.y);
    const endX = Math.max(this.start.x, possibleEnd.x);
    const endY = Math.max(this.start.y, possibleEnd.y);

    return new Phaser.Geom.Rectangle(
      startX,
      startY,
      endX - startX,
      endY - startY,
    );
  }

  // Returns the current Bounds of that box
  getBounds(): Phaser.Geom.Rectangle {
    const startX = Math.min(this.start.x, this.end.x);
    const startY = Math.min(this.start.y, this.end.y);
    const endX = Math.max(this.start.x, this.end.x);
    const endY = Math.max(this.start.y, this.end.y);

    return new Phaser.Geom.Rectangle(
      startX,
      startY,
      endX - startX,
      endY - startY,
    );
  }

  // Returns the selected tiles
  getSelectedTiles(): number[][] {
    return this.selectedTiles;
  }

  destroy() {
    this.graphics.destroy();
    if (this.tabContainer) {
      this.tabContainer.destroy();
      this.tabContainer = null;
    }
    // Remove any pointer listeners we registered during dragging
    try {
      if (this._pointerMoveHandler)
        this.scene.input.off("pointermove", this._pointerMoveHandler);
    } catch (e) {}
    try {
      if (this._pointerUpHandler)
        this.scene.input.off("pointerup", this._pointerUpHandler);
    } catch (e) {}
  }

  // Mark this selection as finalized (permanent). Keeps a tab for dragging but
  // prevents further resizing via updateStart/updateEnd.
  public finalize() {
    this.isFinalized = true;
    // Update visuals immediately so dashed -> solid border swap happens
    this.redraw();
    // Update tab visuals to a finalized (gray) style
    if (this.tabBg) {
      this.tabBg.setFillStyle(0x2b2b2b);
      this.tabBg.setStrokeStyle(1, 0x111111);
    }
    if (this.tabText) {
      this.tabText.setStyle({ color: "#ffffff" });
    }
    // ensure tab is activeable for dragging
    // nothing else needed for now
    // Sync attached info now that box is finalized
    try {
      const info = (this as any).getInfo?.() || (this as any).info;
      if (info && typeof info.refreshFromBox === "function") info.refreshFromBox();
    } catch (e) {}
  }

  // STEP 6: Collaborative Context Merging - Helper methods for easy usage

  /**
   * Share a piece of data with all current neighbors
   * @param key - The data key
   * @param value - The data value
   * @param canShare - Whether neighbors can further share this data (default: true)
   */
  public shareData(key: string, value: any, canShare: boolean = true): void {
    this.setContextData(key, value, canShare);
    this.broadcastToNeighbors();
  }

  /**
   * Get data, checking neighbors if we don't have it locally
   * @param key - The data key to look for
   * @returns The data value or null if not found
   */
  public findData(key: string): any {
    // Check our own data first
    const localData = this.getContextData(key);
    if (localData !== null) {
      return localData;
    }

    // Request from neighbors if we don't have it
    const neighborData = this.requestDataFromNeighbors(key);
    return neighborData ? neighborData.value : null;
  }

  /**
   * Check if any box in our network (us or neighbors) has specific data
   * @param key - The data key to check for
   * @returns true if any connected box has this data
   */
  public networkHasData(key: string): boolean {
    // Check ourselves first
    if (this.localContext.data.has(key)) {
      return true;
    }

    try {
      const info = (this as any).getInfo?.() || (this as any).info;
      if (info && typeof info.networkHasDataBox === "function") return info.networkHasDataBox(key);
    } catch (e) {}

    for (const neighbor of this.getNeighbors()) {
      if (neighbor.localContext.data.has(key)) return true;
    }
    return false;
  }

  /**
   * Get a summary of all data available in our network
   * @returns Object with our data and neighbors' shareable data
   */
  public getNetworkDataSummary(): {
    own: string[];
    neighborsShareable: string[];
  } {
    try {
      const info = (this as any).getInfo?.() || (this as any).info;
      if (info && typeof info.getNetworkDataSummaryBox === "function") return info.getNetworkDataSummaryBox();
    } catch (e) {}

    const own = Array.from(this.localContext.data.keys());
    const neighborsShareable = new Set<string>();
    this.getNeighbors().forEach((neighbor) => {
      neighbor.localContext.data.forEach((data: any, key: string) => {
        if (data.canShare) neighborsShareable.add(key);
      });
    });
    return { own, neighborsShareable: Array.from(neighborsShareable) };
  }

  /**
   * Get basic info about this box for debugging
   */
  public getDebugInfo(): any {
    return {
      id: this.localContext.id,
      zLevel: this.zLevel,
      bounds: this.getBounds(),
      neighbors: this.getNeighbors().length,
      dataKeys: Array.from(this.localContext.data.keys()),
      version: this.localContext.version,
    };
  }

  // STEP 7: Collaborative Context Merging - Demo/Test methods

  /**
   * Demo method: Set some test data and share it with neighbors
   * This shows how the collaborative system works
   */
  public demoCollaborativeSharing(): void {
    console.log(`Box ${this.localContext.id} starting demo...`);

    // Set some shareable data
    this.shareData("demo_message", `Hello from ${this.localContext.id}!`, true);
    this.shareData("timestamp", Date.now(), true);
    this.shareData("box_color", this.getColorForZLevel(this.zLevel), true);

    // Set some private data (not shareable)
    this.setContextData("private_note", "This is private data", false);

    console.log(`Box ${this.localContext.id} shared data with ${this.getNeighbors().length} neighbors`);
  }

  /**
   * Demo method: Log all available data in the network
   */
  public demoLogNetworkData(): void {
    console.log(`=== Network Data for Box ${this.localContext.id} ===`);
    console.log("My data:", Array.from(this.localContext.data.entries()));
    console.log("Network summary:", this.getNetworkDataSummary());
    console.log("Debug info:", this.getDebugInfo());
    this.getNeighbors().forEach((neighbor) => {
      console.log(`Neighbor ${neighbor.localContext.id}:`, neighbor.getDebugInfo());
    });
  }

  // STEP 8: Collaborative Context Merging - Chat system integration

  /**
   * Get collaborative context information for the language model
   * This provides rich context about the box and its neighbors
   */
  public getCollaborativeContextForChat(): string {
    const contextLines: string[] = [];

    // Basic box info
    contextLines.push(`=== Box Context ===`);
    contextLines.push(`Box ID: ${this.localContext.id}`);
    contextLines.push(`Z-Level: ${this.zLevel}`);
    contextLines.push(
      `Position: (${this.start.x}, ${this.start.y}) to (${this.end.x}, ${this.end.y})`,
    );
    try {
      const info = (this as any).getInfo?.() || (this as any).info;
      if (info && typeof info.getCollaborativeContextForChatBox === "function") return info.getCollaborativeContextForChatBox();
    } catch (e) {}
    contextLines.push(`Neighbors: ${this.getNeighbors().length} connected boxes`);

    // Own data
    if (this.localContext.data.size > 0) {
      contextLines.push(`\n=== My Data ===`);
      this.localContext.data.forEach((data, key) => {
        contextLines.push(
          `${key}: ${JSON.stringify(data.value)} (${data.canShare ? "shareable" : "private"})`,
        );
      });
    }

    // Network data summary
    const networkSummary = this.getNetworkDataSummary();
    if (networkSummary.neighborsShareable.length > 0) {
      contextLines.push(`\n=== Available from Neighbors ===`);
      networkSummary.neighborsShareable.forEach((key) => {
        const value = this.findData(key);
        if (value !== null) {
          contextLines.push(`${key}: ${JSON.stringify(value)} (from neighbor)`);
        }
      });
    }

    // Neighbor details
    if (this.getNeighbors().length > 0) {
      contextLines.push(`\n=== Neighbor Details ===`);
      this.getNeighbors().forEach((neighbor) => {
        const neighborInfo = neighbor.getDebugInfo();
        contextLines.push(`Neighbor ${neighborInfo.id}: Z${neighborInfo.zLevel}, ${neighborInfo.dataKeys.length} data items`);
      });
    }

    return contextLines.join("\n");
  }

  /**
   * Add a chat message and optionally share it with neighbors
   * @param msg - The message to add
   * @param shareWithNeighbors - Whether to share this message with touching boxes
   */
  public addCollaborativeChatMessage(
    msg: any,
    shareWithNeighbors: boolean = false,
  ): void {
    try {
      const info = (this as any).getInfo?.() || (this as any).info;
      if (info && typeof info.addCollaborativeChatMessageBox === "function") return info.addCollaborativeChatMessageBox(msg, shareWithNeighbors);
    } catch (e) {}
    this.localContext.chatHistory.push(msg);
    if (shareWithNeighbors && typeof msg.content === "string") {
      this.shareData("last_chat_message", { content: msg.content, timestamp: Date.now(), from: this.localContext.id }, true);
    }
  }

  /**
   * Get shared chat messages from neighbors
   */
  public getSharedChatMessages(): any[] {
    try {
      const info = (this as any).getInfo?.() || (this as any).info;
      if (info && typeof info.getSharedChatMessagesBox === "function") return info.getSharedChatMessagesBox();
    } catch (e) {}
    const sharedMessages: any[] = [];
    this.getNeighbors().forEach((neighbor) => {
      const sharedMsg = neighbor.getContextData("last_chat_message");
      if (sharedMsg) sharedMessages.push({ ...sharedMsg, fromNeighbor: neighbor.localContext.id });
    });
    return sharedMessages.sort((a, b) => a.timestamp - b.timestamp);
  }

  // STEP 10: Testing and Verification Methods

  /**
   * Quick test: Set some test data and verify neighbors can see it
   */
  public testCollaborativeSharing(): void {
    console.log(
      `🧪 Testing collaborative sharing for Box ${this.localContext.id}`,
    );

    // Set some test data
    this.shareData(
      "test_message",
      `Hello from Box ${this.localContext.id}!`,
      true,
    );
    this.shareData("test_number", Math.floor(Math.random() * 100), true);
    this.shareData("test_timestamp", new Date().toISOString(), true);

  console.log(`📤 Box ${this.localContext.id} shared 3 test items`);
  console.log(`👥 Connected to ${this.getNeighbors().length} neighbors`);

    // Log what we can see from neighbors
    setTimeout(() => {
      const summary = this.getNetworkDataSummary();
      console.log(`📥 Box ${this.localContext.id} can see from neighbors:`, summary.neighborsShareable);
    }, 100);
  }

  /**
   * Verify the collaborative context is working for chat
   */
  public testChatContext(): string {
    console.log(`💬 Testing chat context for Box ${this.localContext.id}`);
    const context = this.getCollaborativeContextForChat();
    console.log("Generated context:", context);
    return context;
  }

  /**
   * Visual indicator: Change tab color based on neighbor count
   */
  public updateTabWithNetworkInfo(): void {
    if (!this.tabText) return;
    try {
      const info = (this as any).getInfo?.() || (this as any).info;
      if (info && typeof info.updateTabWithNetworkInfoBox === "function") return info.updateTabWithNetworkInfoBox();
    } catch (e) {}

    const neighborCount = this.getNeighbors().length;
    const dataCount = this.localContext.data.size;
    this.tabText.setText(`Box (${neighborCount}n, ${dataCount}d)`);
    if (this.tabBg) {
      if (neighborCount > 0) this.tabBg.setFillStyle(this.isActive ? 0x00ff88 : 0x00aaff);
      else this.tabBg.setFillStyle(this.isActive ? 0x127803 : this.isFinalized ? 0x2b2b2b : 0x2b6bff);
    }
  }

  addChatMessage(msg: any) {
    const info = (this as any).getInfo?.() || (this as any).info;
    if (info && typeof info.addChatMessage === "function") return info.addChatMessage(msg);
    this.localContext.chatHistory.push(msg);
  }

  getChatHistory(): any[] {
    const info = (this as any).getInfo?.() || (this as any).info;
    if (info && typeof info.getChatHistory === "function") return info.getChatHistory();
    return this.localContext.chatHistory;
  }

  clearChatHistory() {
    const info = (this as any).getInfo?.() || (this as any).info;
    if (info && typeof info.clearChatHistory === "function") return info.clearChatHistory();
    this.localContext.chatHistory.length = 0;
  }

  // Clear only the info's chat history if present
  clearInfoChatHistory() {
    try {
      if ((this as any).info && typeof (this as any).info.chatHistory !== "undefined") {
        (this as any).info.chatHistory.length = 0;
      }
    } catch (e) {}
  }

  // Getter for attached info object
  getInfo() {
    return (this as any).info;
  }

  //Working Code - Jason Cho
  printChatHistory() {
    console.log("Chat History for this SelectionBox:");
    this.localContext.chatHistory.forEach((msg, index) => {
      console.log(`${index + 1}: ${JSON.stringify(msg)}`);
    });
  }

  //TODO: clear placed tiles accordingly, especially with user actions
  public addPlacedTile(tileIndex: number, x: number, y: number, layerName?: string) {
    const info = (this as any).getInfo?.() || (this as any).info;
    if (info && typeof info.addPlacedTile === "function") return info.addPlacedTile(tileIndex, x, y, layerName);
    this.placedTiles.push({ tileIndex, x, y, layerName: layerName || "" });
    console.log("Added placed tile:", { tileIndex, x, y, layerName });
  }

  public getPlacedTiles() {
    const info = (this as any).getInfo?.() || (this as any).info;
    if (info && typeof info.getPlacedTiles === "function") return info.getPlacedTiles();
    return this.placedTiles;
  }

  public printPlacedTiles() {
    const info = (this as any).getInfo?.() || (this as any).info;
    if (info && typeof info.printPlacedTiles === "function") return info.printPlacedTiles();
    console.log("Placed Tiles for this SelectionBox:");
    this.placedTiles.forEach((tile, index) => {
      console.log(`${index + 1}: ${JSON.stringify(tile)}`);
    });
  }
  /**
   * Set the thematic intent or user prompt context for this box
   */
  setThemeIntent(intent: string) {
    const info = (this as any).getInfo?.() || (this as any).info;
    if (info && typeof info.setThemeIntent === "function") {
      return info.setThemeIntent(intent);
    }
    // no-op if no info available
  }

  /**
   * Get the thematic intent or user prompt context for this box
   */
  getThemeIntent(): string {
    const info = (this as any).getInfo?.() || (this as any).info;
    if (info && typeof info.getThemeIntent === "function") {
      return info.getThemeIntent();
    }
    return "";
  }

  /**
   * Communicate this box's themeIntent to another box (for later interactions)
   */
  communicateThemeTo(box: SelectionBox) {
    const info = (this as any).getInfo?.() || (this as any).info;
    if (info && typeof info.communicateThemeTo === "function") {
      return info.communicateThemeTo(box);
    }
    // fallback: try to set directly on target
    if (box && typeof box.setThemeIntent === "function") {
      box.setThemeIntent("");
    }
  }
}
