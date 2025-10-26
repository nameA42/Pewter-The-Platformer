import Phaser from "phaser";

// Collaborative Context Merging - Basic interfaces and ownership structure
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
  private graphics: Phaser.GameObjects.Graphics;
  private start: Phaser.Math.Vector2;
  private end: Phaser.Math.Vector2;
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
  public localContext: { chatHistory: any[]; BoxContext: any };
  public placedTiles: {
    tileIndex: number;
    x: number;
    y: number;
    layerName: string;
  }[] = [];
  private tabContainer: Phaser.GameObjects.Container | null = null;
  private onSelect?: (box: SelectionBox) => void;
  private tabBg: Phaser.GameObjects.Rectangle | null = null;
  private tabText: Phaser.GameObjects.Text | null = null;
  private isActive: boolean = false;
  private isFinalized: boolean = false;

  // Collaborative Context Merging - Neighbor tracking
  private neighbors: Set<SelectionBox> = new Set();
  // Intersections with boxes on different z-levels
  private intersections: Set<SelectionBox> = new Set();
  private lastNeighborCheck: number = 0;
  private neighborCheckInterval: number = 500; // Check every 500ms

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
  }

  // Collaborative Context Merging - Basic data management methods

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

  // Collaborative Context Merging - Neighbor detection and management

  /**
   * Check if this box is touching another box (adjacent or overlapping)
   */
  public isTouching(other: SelectionBox): boolean {
    if (other === this || other.getZLevel() !== this.zLevel) {
      return false;
    }

    const myBounds = this.getBounds();
    const otherBounds = other.getBounds();

    // Check if boxes are adjacent (touching edges) or overlapping
    const touching =
      // Overlapping
      Phaser.Geom.Intersects.RectangleToRectangle(myBounds, otherBounds) ||
      // Adjacent horizontally
      ((myBounds.right + 1 === otherBounds.left ||
        otherBounds.right + 1 === myBounds.left) &&
        !(
          myBounds.bottom < otherBounds.top || otherBounds.bottom < myBounds.top
        )) ||
      // Adjacent vertically
      ((myBounds.bottom + 1 === otherBounds.top ||
        otherBounds.bottom + 1 === myBounds.top) &&
        !(
          myBounds.right < otherBounds.left || otherBounds.right < myBounds.left
        ));

    return touching;
  }

  /**
   * Update neighbor list by checking all boxes in the scene
   */
  public updateNeighbors(allBoxes: SelectionBox[]): void {
    const now = Date.now();
    if (now - this.lastNeighborCheck < this.neighborCheckInterval) {
      return; // Don't check too frequently
    }

    this.lastNeighborCheck = now;
    const previousNeighbors = new Set(this.neighbors);
    this.neighbors.clear();

    // Find current neighbors
    for (const box of allBoxes) {
      if (this.isTouching(box)) {
        this.neighbors.add(box);
      }
    }

    // Notify about new neighbors
    this.neighbors.forEach((neighbor) => {
      if (!previousNeighbors.has(neighbor)) {
        this.onNeighborAdded(neighbor);
      }
    });

    // Notify about lost neighbors
    previousNeighbors.forEach((previousNeighbor) => {
      if (!this.neighbors.has(previousNeighbor)) {
        this.onNeighborRemoved(previousNeighbor);
      }
    });
  }

  /**
   * Check for intersections with boxes on different z-levels
   */
  public updateIntersections(allBoxes: SelectionBox[]): void {
    const previous = new Set(this.intersections);
    this.intersections.clear();

    const myBounds = this.getBounds();
    for (const box of allBoxes) {
      if (box === this) continue;
      if (box.getZLevel && box.getZLevel() === this.zLevel) continue; // only different z-levels
      try {
        const otherBounds = box.getBounds();
        if (
          Phaser.Geom.Intersects.RectangleToRectangle(myBounds, otherBounds)
        ) {
          this.intersections.add(box);
        }
      } catch (e) {
        // skip boxes that don't implement getBounds
      }
    }

    // If intersections changed, update visuals
    if (this.intersections.size !== previous.size) {
      this.updateTabWithNetworkInfo();
    }
  }

  /**
   * Called when a new neighbor is detected
   */
  private onNeighborAdded(neighbor: SelectionBox): void {
    console.log(
      `Box ${this.localContext.id} gained neighbor ${neighbor.localContext.id}`,
    );
    // Share our shareable data with the new neighbor
    this.shareDataWithNeighbor(neighbor);
    // Update visual indicator
    this.updateTabWithNetworkInfo();
  }

  /**
   * Called when a neighbor is no longer touching
   */
  private onNeighborRemoved(neighbor: SelectionBox): void {
    console.log(
      `Box ${this.localContext.id} lost neighbor ${neighbor.localContext.id}`,
    );
    // Update visual indicator
    this.updateTabWithNetworkInfo();
  }

  /**
   * Share shareable data with a specific neighbor
   */
  private shareDataWithNeighbor(neighbor: SelectionBox): void {
    const shareableData = this.getShareableData();
    shareableData.forEach((data, key) => {
      neighbor.receiveSharedData(key, data);
    });
  }

  /**
   * Get current neighbors
   */
  public getNeighbors(): SelectionBox[] {
    return Array.from(this.neighbors);
  }

  // Collaborative Context Merging - Data sharing and merging methods

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
    const shareableData = this.getShareableData();
    this.neighbors.forEach((neighbor) => {
      shareableData.forEach((data, key) => {
        neighbor.receiveSharedData(key, data);
      });
    });
  }

  /**
   * Request specific data from neighbors
   */
  public requestDataFromNeighbors(key: string): BoxContextData | null {
    for (const neighbor of this.neighbors) {
      const data = neighbor.localContext.data.get(key);
      if (data && data.canShare) {
        // Receive this data through normal merging process
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

    // Visual margin to include the tab/indicator above the box (in pixels)
    const tabVisualMargin = 14;

    // Pixel coordinates for drawing (expand upward by tabVisualMargin)
    const pixelLeft = startX * 16;
    const pixelTop = startY * 16 - tabVisualMargin;
    const pixelRight = endX * 16 + 16;
    const pixelBottom = endY * 16 + 16;
    const pixelWidth = pixelRight - pixelLeft;
    const pixelHeight = pixelBottom - pixelTop;

    // Draw filled region (including margin for the tab)
    this.graphics.fillStyle(color, 0.3);
    this.graphics.fillRect(pixelLeft, pixelTop, pixelWidth, pixelHeight);

    // Draw dashed border
    this.graphics.lineStyle(2, color, 1);
    this.graphics.beginPath();

    // width/height (in tiles) were previously used for dashed border math; replaced by pixelWidth/pixelHeight
    const dashLength = 8;
    const gapLength = 4;

    if (this.isFinalized) {
      // Solid rectangle border for finalized boxes (include margin)
      this.graphics.strokeRect(pixelLeft, pixelTop, pixelWidth, pixelHeight);
    } else {
      // Dashed border for temporary boxes
      // Top border (use pixelTop so the dashed border includes the tab area)
      for (let i = 0; i < pixelWidth; i += dashLength + gapLength) {
        this.graphics.moveTo(pixelLeft + i, pixelTop);
        this.graphics.lineTo(
          Math.min(pixelLeft + i + dashLength, pixelRight),
          pixelTop,
        );
      }

      // Bottom border
      for (let i = 0; i < pixelWidth; i += dashLength + gapLength) {
        this.graphics.moveTo(pixelLeft + i, pixelBottom);
        this.graphics.lineTo(
          Math.min(pixelLeft + i + dashLength, pixelRight),
          pixelBottom,
        );
      }

      // Left border
      for (let i = 0; i < pixelHeight; i += dashLength + gapLength) {
        this.graphics.moveTo(pixelLeft, pixelTop + i);
        this.graphics.lineTo(
          pixelLeft,
          Math.min(pixelTop + i + dashLength, pixelBottom),
        );
      }

      // Right border
      for (let i = 0; i < pixelHeight; i += dashLength + gapLength) {
        this.graphics.moveTo(pixelRight, pixelTop + i);
        this.graphics.lineTo(
          pixelRight,
          Math.min(pixelTop + i + dashLength, pixelBottom),
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

  // Collaborative Context Merging - Helper methods for easy usage

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

    // Check neighbors
    for (const neighbor of this.neighbors) {
      if (neighbor.localContext.data.has(key)) {
        return true;
      }
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
    const own = Array.from(this.localContext.data.keys());
    const neighborsShareable = new Set<string>();

    this.neighbors.forEach((neighbor) => {
      neighbor.localContext.data.forEach((data, key) => {
        if (data.canShare) {
          neighborsShareable.add(key);
        }
      });
    });

    return {
      own,
      neighborsShareable: Array.from(neighborsShareable),
    };
  }

  /**
   * Get basic info about this box for debugging
   */
  public getDebugInfo(): any {
    return {
      id: this.localContext.id,
      zLevel: this.zLevel,
      bounds: this.getBounds(),
      neighbors: this.neighbors.size,
      dataKeys: Array.from(this.localContext.data.keys()),
      version: this.localContext.version,
    };
  }

  // Collaborative Context Merging - Demo/Test methods

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

    console.log(
      `Box ${this.localContext.id} shared data with ${this.neighbors.size} neighbors`,
    );
  }

  /**
   * Demo method: Log all available data in the network
   */
  public demoLogNetworkData(): void {
    console.log(`=== Network Data for Box ${this.localContext.id} ===`);
    console.log("My data:", Array.from(this.localContext.data.entries()));
    console.log("Network summary:", this.getNetworkDataSummary());
    console.log("Debug info:", this.getDebugInfo());

    this.neighbors.forEach((neighbor) => {
      console.log(
        `Neighbor ${neighbor.localContext.id}:`,
        neighbor.getDebugInfo(),
      );
    });
  }

  // Collaborative Context Merging - Chat system integration

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
    contextLines.push(`Neighbors: ${this.neighbors.size} connected boxes`);

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
    if (this.neighbors.size > 0) {
      contextLines.push(`\n=== Neighbor Details ===`);
      this.neighbors.forEach((neighbor) => {
        const neighborInfo = neighbor.getDebugInfo();
        contextLines.push(
          `Neighbor ${neighborInfo.id}: Z${neighborInfo.zLevel}, ${neighborInfo.dataKeys.length} data items`,
        );
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
    // Add to our own chat history
    this.localContext.chatHistory.push(msg);

    // Optionally share with neighbors
    if (shareWithNeighbors && typeof msg.content === "string") {
      this.shareData(
        "last_chat_message",
        {
          content: msg.content,
          timestamp: Date.now(),
          from: this.localContext.id,
        },
        true,
      );
    }
  }

  /**
   * Get shared chat messages from neighbors
   */
  public getSharedChatMessages(): any[] {
    const sharedMessages: any[] = [];

    this.neighbors.forEach((neighbor) => {
      const sharedMsg = neighbor.getContextData("last_chat_message");
      if (sharedMsg) {
        sharedMessages.push({
          ...sharedMsg,
          fromNeighbor: neighbor.localContext.id,
        });
      }
    });

    return sharedMessages.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Testing and Verification Methods

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
    console.log(`👥 Connected to ${this.neighbors.size} neighbors`);

    // Log what we can see from neighbors
    setTimeout(() => {
      const summary = this.getNetworkDataSummary();
      console.log(
        `📥 Box ${this.localContext.id} can see from neighbors:`,
        summary.neighborsShareable,
      );
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

    const neighborCount = this.neighbors.size;
    const dataCount = this.localContext.data.size;
    const intersectionCount = this.intersections.size;

    // Update tab text to show network info, but omit zero-valued parts
    const parts: string[] = [];
    if (neighborCount > 0) parts.push(`${neighborCount}n`);
    if (dataCount > 0) parts.push(`${dataCount}d`);
    if (intersectionCount > 0) parts.push(`${intersectionCount}z`);
    const text = parts.length > 0 ? `Box (${parts.join(", ")})` : `Box`;
    this.tabText.setText(text);

    // Make the tab wider when visual indicators are added: add 20px per indicator
    if (this.tabBg && this.tabText) {
      const baseWidth = 48;
      const padding = 8;
      const indicatorsExtra = parts.length * 3;
      const measured = Math.ceil(this.tabText.width || 0) + padding * 2;
      const newWidth = Math.max(baseWidth, measured + indicatorsExtra);

      try {
        // Update rectangle display size (some Phaser builds support setDisplaySize)
        if (typeof (this.tabBg as any).setDisplaySize === "function") {
          (this.tabBg as any).setDisplaySize(
            newWidth,
            (this.tabBg as any).height || 14,
          );
        } else {
          // Fallback: directly set width property
          (this.tabBg as any).width = newWidth;
        }
      } catch (e) {
        // ignore if resizing not supported
      }

      // Update container size and text padding
      this.tabContainer?.setSize(newWidth, (this.tabBg as any).height || 14);
      // Keep text positioned with left padding
      try {
        this.tabText.x = padding;
      } catch (e) {}
    }

    // Change color based on connectivity
    if (this.tabBg) {
      if (intersectionCount > 0) {
        // Intersection present - orange stroke to warn
        this.tabBg.setFillStyle(this.isActive ? 0xffe0cc : 0xfff0e6);
        this.tabBg.setStrokeStyle(2, 0xffa500);
      } else if (neighborCount > 0) {
        // Connected - use cyan to indicate network activity
        this.tabBg.setFillStyle(this.isActive ? 0x00ff88 : 0x00aaff);
      } else {
        // Not connected - use original colors
        this.tabBg.setFillStyle(
          this.isActive ? 0x127803 : this.isFinalized ? 0x2b2b2b : 0x2b6bff,
        );
      }
    }
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

  //Working Code - Jason Cho
  printChatHistory() {
    console.log("Chat History for this SelectionBox:");
    this.localContext.chatHistory.forEach((msg, index) => {
      console.log(`${index + 1}: ${JSON.stringify(msg)}`);
    });
  }

  //TODO: clear placed tiles accordingly, especially with user actions
  public addPlacedTile(
    tileIndex: number,
    x: number,
    y: number,
    layerName: string,
  ) {
    this.placedTiles.push({ tileIndex, x, y, layerName });
    console.log("Added placed tile:", { tileIndex, x, y, layerName });
  }

  public getPlacedTiles() {
    return this.placedTiles;
  }

  public printPlacedTiles() {
    console.log("Placed Tiles for this SelectionBox:");
    this.placedTiles.forEach((tile, index) => {
      console.log(`${index + 1}: ${JSON.stringify(tile)}`);
    });
  }
}
