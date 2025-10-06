import Phaser from "phaser";

export class SelectionBox {
  /**
   * Summarize the chat log into a single keyword using the LLM and set as themeIntent
   */
  async summarizeChatToThemeIntent(): Promise<string> {
    // Import sendUserPrompt from chatBox dynamically to avoid circular deps
    // (or you can import at the top if safe)
    // @ts-ignore
    const { sendUserPrompt } = await import("../languageModel/chatBox");
    // Flatten chat history into a single string
    const chatLog = this.localContext.chatHistory
      .map((msg: any) =>
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content),
      )
      .join("\n");
    // Prompt for keyword summarization
    const prompt = `Summarize the following chat log into a single keyword that best represents the user's thematic intent for this selection box. Only reply with the keyword.\n${chatLog}`;
    const keyword = (await sendUserPrompt(prompt)).trim();
    this.setThemeIntent(keyword);
    return keyword;
  }
  private graphics: Phaser.GameObjects.Graphics;
  private start: Phaser.Math.Vector2;
  private end: Phaser.Math.Vector2;
  /**
   * Thematic intent or user prompt context for this box (e.g., story, purpose, tags)
   */
  private themeIntent: string = "";
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
  public localContext: { chatHistory: any[] };
  private tabContainer: Phaser.GameObjects.Container | null = null;
  private onSelect?: (box: SelectionBox) => void;
  private tabBg: Phaser.GameObjects.Rectangle | null = null;
  private tabText: Phaser.GameObjects.Text | null = null;
  private isActive: boolean = false;
  private isFinalized: boolean = false;

  // Drag helpers
  private _dragInitialStart?: Phaser.Math.Vector2;
  private _dragInitialEnd?: Phaser.Math.Vector2;
  private _dragInitialContainerX?: number;
  private _dragInitialContainerY?: number;
  private _dragPointerTileX?: number;
  private _dragPointerTileY?: number;
  private _dragPointerOffsetX?: number;
  private _dragPointerOffsetY?: number;
  private _dragStartHandler?: (pointer: Phaser.Input.Pointer, obj: any) => void;
  private _dragHandler?: (
    pointer: Phaser.Input.Pointer,
    obj: any,
    dragX: number,
    dragY: number,
  ) => void;
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

    // Initialize localContext with its own chatHistory
    this.localContext = { chatHistory: [] };
    this.onSelect = onSelect;
    // create tab after initial draw
    this.createTab();
    // themeIntent can be set later via setter
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
    // Remove drag listeners
    if (this._dragStartHandler)
      this.scene.input.off("dragstart", this._dragStartHandler);
    if (this._dragHandler) this.scene.input.off("drag", this._dragHandler);
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
  }

  // Chat history management for this selection box
  addChatMessage(msg: any) {
    this.localContext.chatHistory.push(msg);
  }

  getChatHistory(): any[] {
    return this.localContext.chatHistory;
  }

  clearChatHistory() {
    this.localContext.chatHistory.length = 0;
  }

  /**
   * Set the thematic intent or user prompt context for this box
   */
  setThemeIntent(intent: string) {
    this.themeIntent = intent;
  }

  /**
   * Get the thematic intent or user prompt context for this box
   */
  getThemeIntent(): string {
    return this.themeIntent;
  }

  /**
   * Communicate this box's themeIntent to another box (for later interactions)
   */
  communicateThemeTo(box: SelectionBox) {
    if (box && typeof box.setThemeIntent === "function") {
      box.setThemeIntent(this.themeIntent);
    }
  }
}
