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
  public localContext: BoxContext;
  public placedTiles: {
    tileIndex: number;
    x: number;
    y: number;
    layerName: string;
  }[] = [];
  public placedEnemies: {
    enemyType: string;
    x: number;
    y: number;
  }[] = [];
  private tabContainer: Phaser.GameObjects.Container | null = null;
  private onSelect?: (box: SelectionBox) => void;
  private tabBg: Phaser.GameObjects.Rectangle | null = null;
  private tabText: Phaser.GameObjects.Text | null = null;
  private isActive: boolean = false;
  private isFinalized: boolean = false;

  // STEP 3: Collaborative Context Merging - Neighbor tracking
  private neighbors: Set<SelectionBox> = new Set();
  // Intersections with boxes on different z-levels
  private intersections: Set<SelectionBox> = new Set();
  private lastNeighborCheck: number = 0;
  private neighborCheckInterval: number = 500; // Check every 500ms

  // Drag helpers
  private _dragInitialStart?: Phaser.Math.Vector2;
  private _dragInitialEnd?: Phaser.Math.Vector2;
  private _dragPointerTileX?: number;
  private _dragPointerTileY?: number;
  // Snapshot of placedTiles at the start of a drag so we can keep them in sync
  private _dragOriginalPlacedTiles?: {
    tileIndex: number;
    x: number;
    y: number;
    layerName: string;
  }[];
  private _dragOriginalPlacedEnemies?: {
    enemyType: string;
    x: number;
    y: number;
  }[];
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
  }

  /**
   * Called when a neighbor is no longer touching
   */
  private onNeighborRemoved(neighbor: SelectionBox): void {
    console.log(
      `Box ${this.localContext.id} lost neighbor ${neighbor.localContext.id}`,
    );
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
            // compute integer delta relative to initial start
            const deltaX = Math.floor(
              candidateStart.x - (this._dragInitialStart?.x ?? 0),
            );
            const deltaY = Math.floor(
              candidateStart.y - (this._dragInitialStart?.y ?? 0),
            );
            // update placedTiles positions relative to the original snapshot
            try {
              if (
                this._dragOriginalPlacedTiles &&
                this._dragOriginalPlacedTiles.length > 0
              ) {
                this.placedTiles = this._dragOriginalPlacedTiles.map((p) => ({
                  tileIndex: p.tileIndex,
                  x: p.x + deltaX,
                  y: p.y + deltaY,
                  layerName: p.layerName,
                }));
              }
            } catch (e) {}

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
        // If we had a snapshot of placed tiles, commit a move of those tiles on the map
        try {
          const orig = this._dragOriginalPlacedTiles;
          if (orig && orig.length > 0) {
            const rg = (this.scene as any).regenerator as any;
            // compute delta from initial drag start if needed
            const deltaX = Math.floor(
              this.start.x - (this._dragInitialStart?.x ?? 0),
            );
            const deltaY = Math.floor(
              this.start.y - (this._dragInitialStart?.y ?? 0),
            );

            const movements: Array<any> = [];
            if (this.placedTiles && this.placedTiles.length === orig.length) {
              for (let i = 0; i < orig.length; i++) {
                const o = orig[i];
                const n = this.placedTiles[i];
                if (!n) continue;
                // only add movement if different
                if (o.x === n.x && o.y === n.y) continue;
                movements.push({
                  type: "tile",
                  layerName: o.layerName,
                  from: { x: o.x, y: o.y },
                  to: { x: n.x, y: n.y },
                  index: o.tileIndex,
                });
              }
            } else {
              // fallback: apply delta to each original
              for (const o of orig) {
                const toX = o.x + deltaX;
                const toY = o.y + deltaY;
                if (o.x === toX && o.y === toY) continue;
                movements.push({
                  type: "tile",
                  layerName: o.layerName,
                  from: { x: o.x, y: o.y },
                  to: { x: toX, y: toY },
                  index: o.tileIndex,
                });
              }
            }

            if (
              movements.length > 0 &&
              rg &&
              typeof rg.moveObjects === "function"
            ) {
              try {
                rg.moveObjects(movements);
              } catch (e) {
                // ignore move errors but log for debugging
                // eslint-disable-next-line no-console
                console.error("SelectionBox: moveObjects failed", e);
              }
            }
          }
        } catch (e) {
          // swallow
        }
        // Also handle any placed enemies that were moved with the box
        try {
          const origE = this._dragOriginalPlacedEnemies;
          if (origE && origE.length > 0) {
            const rg = (this.scene as any).regenerator as any;
            const deltaX = Math.floor(
              this.start.x - (this._dragInitialStart?.x ?? 0),
            );
            const deltaY = Math.floor(
              this.start.y - (this._dragInitialStart?.y ?? 0),
            );
            const eMoves: Array<any> = [];
            if (
              this.placedEnemies &&
              this.placedEnemies.length === origE.length
            ) {
              for (let i = 0; i < origE.length; i++) {
                const o = origE[i];
                const n = this.placedEnemies[i];
                if (!n) continue;
                if (o.x === n.x && o.y === n.y) continue;
                eMoves.push({
                  type: "enemy",
                  from: { x: o.x, y: o.y },
                  to: { x: n.x, y: n.y },
                });
              }
            } else {
              for (const o of origE) {
                const toX = o.x + deltaX;
                const toY = o.y + deltaY;
                if (o.x === toX && o.y === toY) continue;
                eMoves.push({
                  type: "enemy",
                  from: { x: o.x, y: o.y },
                  to: { x: toX, y: toY },
                });
              }
            }
            if (
              eMoves.length > 0 &&
              rg &&
              typeof rg.moveObjects === "function"
            ) {
              try {
                rg.moveObjects(eMoves);
              } catch (er) {
                // eslint-disable-next-line no-console
                console.error("SelectionBox: moveObjects (enemies) failed", er);
              }
            }
          }
        } catch (e) {
          // swallow
        }
        // clear drag snapshot
        try {
          this._dragOriginalPlacedTiles = undefined;
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
          // snapshot placed tiles so we can update their coordinates while dragging
          try {
            this._dragOriginalPlacedTiles = this.placedTiles.map((p) => ({
              tileIndex: p.tileIndex,
              x: p.x,
              y: p.y,
              layerName: p.layerName,
            }));
            this._dragOriginalPlacedEnemies = this.placedEnemies.map((e) => ({
              enemyType: e.enemyType,
              x: e.x,
              y: e.y,
            }));
          } catch (err) {
            this._dragOriginalPlacedTiles = undefined;
            this._dragOriginalPlacedEnemies = undefined;
          }
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

  // Register an enemy placed within this selection box (tile coords)
  public addPlacedEnemy(enemyType: string, x: number, y: number) {
    this.placedEnemies.push({ enemyType, x, y });
    console.log("Added placed enemy:", { enemyType, x, y });
  }

  public getPlacedEnemies() {
    return this.placedEnemies;
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

  public getActive(): boolean {
    return this.isActive;
  }
}
