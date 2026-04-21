import Phaser from "phaser";
import { Z_LEVEL_COLORS } from "./colors";
import { COLLECTABLES_LAYER, editorScene, EditorScene, GROUND_LAYER } from "./editorScene";
import type { Slime } from "./ExternalClasses/Slime";
import type { UltraSlime } from "./ExternalClasses/UltraSlime";

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

export const allSelectionBoxes: SelectionBox[] = [];
// if future people wonder "why didn't they just make a selection box that doesn't have shading"
// I don't know how that code works or if we can disable it so I didn't touch it :thumbsup:
export const superDuperRealUserLayer: {
  tileIndex: number,
  x: number,
  y: number,
  layerName: string
}[] = [
    // { tileIndex: 7, x: 5, y: 5, layerName: "Ground_Layer" }, // ULTRA SLIME
    // { tileIndex: 8, x: 6, y: 5, layerName: "Ground_Layer" } // normal slime
  ];


export function replaceAllBoxes() {
  // ! because I am lazy will just be regeneing all of everything ever place, not efficient but computer are fast
  allSelectionBoxes.sort((a: SelectionBox, b: SelectionBox) => {
    if (a.getZLevel() < b.getZLevel()) {
      return -1;
    }
    if (a.getZLevel() > b.getZLevel()) {
      return 1;
    }
    return 0;
  })
  for (let sb of allSelectionBoxes) {
    for (let tile of sb.placedTiles) {
      if (tile.tileIndex > 1)
        (tile.layerName == "Ground_Layer" ? GROUND_LAYER : COLLECTABLES_LAYER).putTileAt(tile.tileIndex, tile.x, tile.y);
    }
  }
  for (let tile of superDuperRealUserLayer) {
    if (tile.tileIndex > 1)
      (tile.layerName == "Ground_Layer" ? GROUND_LAYER : COLLECTABLES_LAYER).putTileAt(tile.tileIndex, tile.x, tile.y);
  }
  editorScene.worldFacts.clearEnemies();
  GROUND_LAYER.forEachTile((tile) => {
    if (tile.index == 7 || tile.index == 8) {
      editorScene.worldFacts.setFact("Enemy", tile.x, tile.y, tile.index == 7 ? "UltraSlime" : "Slime");
    }
  })
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
  public selectedTiles: number[][][] = [];
  // private layer: Phaser.Tilemaps.TilemapLayer;
  public localContext: BoxContext;
  public placedTiles: {
    tileIndex: number;
    x: number;
    y: number;
    layerName: string;
  }[] = [];
  // public placedEnemies:
  //   // {
  //   // enemyType: string;
  //   // x: number;
  //   // y: number;

  //   // }
  //   (Slime | UltraSlime)[] = [];
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
  // private _dragOriginalPlacedEnemies?: {
  //   enemyType: string;
  //   x: number;
  //   y: number;
  // }[];
  private _dragStartHandler?: (pointer: Phaser.Input.Pointer, obj: any) => void;
  private _dragHandler?: (
    pointer: Phaser.Input.Pointer,
    obj: any,
    dragX: number,
    dragY: number,
  ) => void;
  private _pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
  private _pointerUpHandler?: (pointer: Phaser.Input.Pointer) => void;

  // Coordinate tracking for AI context
  public currentCoords: { start: { x: number; y: number }; end: { x: number; y: number } } = { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
  public coordHistory: Array<{ start: { x: number; y: number }; end: { x: number; y: number }; timestamp: number }> = [];
  private _pendingMoveNotify: boolean = false;
  //Drag and Drop support - Jason Cho
  private dragSnapshot?: {
    w: number;
    h: number;
    tiles: { dx: number; dy: number; index: number }[];
  };
  private previewMap?: Phaser.Tilemaps.Tilemap;
  private previewLayer?: Phaser.Tilemaps.TilemapLayer | null;
  private dragOriginStart?: Phaser.Math.Vector2; // where the drag began (tile coords)

  constructor(
    scene: Phaser.Scene,
    start: Phaser.Math.Vector2,
    end: Phaser.Math.Vector2,
    zLevel: number = 1,
    // layer: Phaser.Tilemaps.TilemapLayer,
    onSelect?: (box: SelectionBox) => void,
  ) {
    this.scene = scene;
    this.start = start.clone();
    this.end = end.clone();
    this.zLevel = zLevel;
    // this.layer = layer;

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(100);
    this.redraw();

    // Initialize coordinate tracking
    this.currentCoords = { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
    this.coordHistory = [{ start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y }, timestamp: Date.now() }];

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
    allSelectionBoxes.push(this);
  }

  public containsPoint(x: number, y: number) {
    return Math.min(this.start.x, this.end.x) <= x && Math.max(this.start.x, this.end.x) >= x
      && Math.min(this.start.y, this.end.y) <= y && Math.max(this.start.y, this.end.y) >= y
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

    // If intersections changed, update visuals
    if (this.intersections.size !== previous.size) {
      this.updateTabWithNewInfo();
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
    this.updateTabWithNewInfo();
  }

  /**
   * Called when a neighbor is no longer touching
   */
  private onNeighborRemoved(neighbor: SelectionBox): void {
    console.log(
      `Box ${this.localContext.id} lost neighbor ${neighbor.localContext.id}`,
    );
    // Update visual indicator
    this.updateTabWithNewInfo();
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
    replaceAllBoxes();
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
    //const tabVisualMargin = 14;

    // Pixel coordinates for drawing (expand upward by tabVisualMargin)
    const pixelLeft = startX * 16;
    const pixelTop = startY * 16; //- tabVisualMargin;
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
      .text(6, 0, `Box`, { fontSize: "10px", color: "#ffffff", resolution: 2 })
      .setOrigin(0, 0.5);

    const container = this.scene.add.container(worldX, worldY - 10, [bg, txt]);
    container.setDepth(1001);
    container.setSize(w, h);

    // Store references for state changes
    this.tabBg = bg;
    this.tabText = txt;

    // Make interactive on the background rectangle
    bg.setInteractive({ useHandCursor: true });

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
            candidateEnd.x - candidateStart.x + 1,
            candidateEnd.y - candidateStart.y + 1,
          );
          for (const b of boxes) {
            if (b === this) continue;
            if (b.getZLevel && b.getZLevel() === this.zLevel) {
              const br = b.getBounds();
              if (SelectionBox.rectanglesOverlap(candRect, br)) {
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
            } catch (e) { }

            this.start = candidateStart;
            this.end = candidateEnd;
            this.redraw();
            this.updatePreviewLayerPosition(); //Drag and Drop
            this.updateTabWithNewInfo();
          }
        } catch (e) {
          this.start = candidateStart;
          this.end = candidateEnd;
          this.redraw();
          this.updatePreviewLayerPosition(); //Drag and Drop
        }
      };

      const pointerUp = (_pointer: Phaser.Input.Pointer) => {
        dragging = false;

        try {
          if (this._pointerMoveHandler)
            this.scene.input.off("pointermove", this._pointerMoveHandler);
        } catch (e) { }
        try {
          if (this._pointerUpHandler)
            this.scene.input.off("pointerup", this._pointerUpHandler);
        } catch (e) { }

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

            // console.log(`Things be thinging: ${movements}`);
            this.printPlacedTiles();
          }
        } catch (e) {
          // swallow
        }
        // Also handle any placed enemies that were moved with the box
        // ! this doesn't work anyways and I aint gonna read all of that so it's going
        // try {
        //   const origE = this._dragOriginalPlacedEnemies;
        //   if (origE && origE.length > 0) {
        //     const rg = (this.scene as any).regenerator as any;
        //     const deltaX = Math.floor(
        //       this.start.x - (this._dragInitialStart?.x ?? 0),
        //     );
        //     const deltaY = Math.floor(
        //       this.start.y - (this._dragInitialStart?.y ?? 0),
        //     );
        //     const eMoves: Array<any> = [];
        //     if (
        //       this.placedEnemies &&
        //       this.placedEnemies.length === origE.length
        //     ) {
        //       for (let i = 0; i < origE.length; i++) {
        //         const o = origE[i];
        //         const n = this.placedEnemies[i];
        //         if (!n) continue;
        //         if (o.x === n.x && o.y === n.y) continue;
        //         eMoves.push({
        //           type: "enemy",
        //           from: { x: o.x, y: o.y },
        //           to: { x: n.x, y: n.y },
        //         });
        //       }
        //     } else {
        //       for (const o of origE) {
        //         const toX = o.x + deltaX;
        //         const toY = o.y + deltaY;
        //         if (o.x === toX && o.y === toY) continue;
        //         eMoves.push({
        //           type: "enemy",
        //           from: { x: o.x, y: o.y },
        //           to: { x: toX, y: toY },
        //         });
        //       }
        //     }
        //     if (
        //       eMoves.length > 0 &&
        //       rg &&
        //       typeof rg.moveObjects === "function"
        //     ) {
        //       try {
        //         // console.log("Things be thinging"); // NOTE: This be not being happening
        //         rg.moveObjects(eMoves);
        //       } catch (er) {
        //         // eslint-disable-next-line no-console
        //         console.error("SelectionBox: moveObjects (enemies) failed", er);
        //       }
        //     }
        //   }
        // } catch (e) {
        //   // swallow
        // }
        // clear drag snapshot
        try {
          this._dragOriginalPlacedTiles = undefined;
        } catch (e) { }

        // Record the new position in coord history and flag for AI notification
        const newEntry = {
          start: { x: this.start.x, y: this.start.y },
          end: { x: this.end.x, y: this.end.y },
          timestamp: Date.now(),
        };
        const lastEntry = this.coordHistory[this.coordHistory.length - 1];
        if (
          !lastEntry ||
          lastEntry.start.x !== newEntry.start.x ||
          lastEntry.start.y !== newEntry.start.y ||
          lastEntry.end.x !== newEntry.end.x ||
          lastEntry.end.y !== newEntry.end.y
        ) {
          this.coordHistory.push(newEntry);
          this._pendingMoveNotify = true;
          console.log("[SelectionBox] Move recorded, pending AI notification:", newEntry);
        }

        // Only commit if we actually started a drag snapshot - Drag and Drop
        if (this.dragSnapshot) {
          console.log("drop finished");

          this.commitMoveToCurrentPosition();
        } else {
          // No snapshot -> just ensure ghost is gone
          this.destroyPreviewLayer();
        }
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
          } catch (e) { }
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
            // this._dragOriginalPlacedEnemies = this.placedEnemies.map((e) => ({
            //   enemyType: e.type,
            //   x: e.x,
            //   y: e.y,
            // }));
          } catch (err) {
            this._dragOriginalPlacedTiles = undefined;
            // this._dragOriginalPlacedEnemies = undefined;
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

          if (dragging) {
            return;
          }
          dragging = true;
          this._pointerMoveHandler = pointerMove;
          this._pointerUpHandler = pointerUp;
          this.scene.input.on("pointermove", this._pointerMoveHandler);
          this.scene.input.on("pointerup", this._pointerUpHandler);

          //Drag and Drop support - Jason Cho
          this.snapshotSelection();
          this.updatePreviewLayerPosition();
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
      console.log(this.tabText);
      this.tabText.setStyle({ color: "#ffffff" });
    }
    this.updateTabWithNewInfo()
  }

  // ! will just copy the topmost info
  copyTiles() {
    const sX = Math.min(this.start.x, this.end.x);
    const sY = Math.min(this.start.y, this.end.y);
    const eX = Math.max(this.start.x, this.end.x);
    const eY = Math.max(this.start.y, this.end.y);

    this.selectedTiles = [];
    for (let y = sY; y <= eY; y++) {
      const row: number[][] = [];
      for (let x = sX; x <= eX; x++) {
        const tile = GROUND_LAYER.getTileAt(x, y);
        const collectable = COLLECTABLES_LAYER.getTileAt(x, y);
        row.push([tile ? tile.index : -1, collectable ? collectable.index : -1]);
      }
      this.selectedTiles.push(row);
    }
  }

  private getColorForZLevel(zLevel: number): number {
    // Clamp Z-Level
    if (zLevel < 1) return Z_LEVEL_COLORS[0];
    if (zLevel > Z_LEVEL_COLORS.length)
      return Z_LEVEL_COLORS[Z_LEVEL_COLORS.length - 1];

    return Z_LEVEL_COLORS[zLevel - 1];
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
      endX - startX + 1,
      endY - startY + 1,
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
      endX - startX + 1,
      endY - startY + 1,
    );
  }

  // Returns the selected tiles
  getSelectedTiles(): number[][][] {
    return this.selectedTiles;
  }

  // // Expose the layer this selection box is associated with
  // public getLayer(): Phaser.Tilemaps.TilemapLayer {
  //   return this.layer;
  // }

  // Check if this box overlaps with another box in tile-space
  // Returns true only if they share actual tiles (not just edges)
  overlapsWith(otherBox: SelectionBox): boolean {
    const thisBounds = this.getBounds();
    const otherBounds = otherBox.getBounds();

    // Get the actual tile ranges (inclusive end coordinates)
    const thisEndX = thisBounds.x + thisBounds.width - 1;
    const thisEndY = thisBounds.y + thisBounds.height - 1;
    const otherEndX = otherBounds.x + otherBounds.width - 1;
    const otherEndY = otherBounds.y + otherBounds.height - 1;

    // Check if X ranges overlap (share at least one tile in X)
    const xOverlap = thisBounds.x <= otherEndX && otherBounds.x <= thisEndX;
    // Check if Y ranges overlap (share at least one tile in Y)
    const yOverlap = thisBounds.y <= otherEndY && otherBounds.y <= thisEndY;

    // They overlap only if both X and Y ranges overlap
    return xOverlap && yOverlap;
  }

  // Static helper to check if two rectangles overlap in tile-space
  static rectanglesOverlap(
    rect1: Phaser.Geom.Rectangle,
    rect2: Phaser.Geom.Rectangle,
  ): boolean {
    // Get the actual tile ranges (inclusive end coordinates)
    const rect1EndX = rect1.x + rect1.width - 1;
    const rect1EndY = rect1.y + rect1.height - 1;
    const rect2EndX = rect2.x + rect2.width - 1;
    const rect2EndY = rect2.y + rect2.height - 1;

    // Check if X ranges overlap (share at least one tile in X)
    const xOverlap = rect1.x <= rect2EndX && rect2.x <= rect1EndX;
    // Check if Y ranges overlap (share at least one tile in Y)
    const yOverlap = rect1.y <= rect2EndY && rect2.y <= rect1EndY;

    // They overlap only if both X and Y ranges overlap
    return xOverlap && yOverlap;
  }


  destroy() {
    this.graphics.destroy();
    if (this.tabText) {
      this.tabText.destroy();
      this.tabText = null;
    }

    if (this.tabContainer) {
      this.tabContainer.destroy();
      this.tabContainer = null;
    }


    // Remove drag listeners
    if (this._dragStartHandler)
      this.scene.input.off("dragstart", this._dragStartHandler);
    if (this._dragHandler) this.scene.input.off("drag", this._dragHandler);

    // clean up actual stuff

    let tempInd = allSelectionBoxes.indexOf(this);
    if (tempInd != -1)
      allSelectionBoxes.splice(tempInd, 1);
    // delete owned tiles
    for (let tile of this.placedTiles) {
      GROUND_LAYER.putTileAt(-1, tile.x, tile.y);
      COLLECTABLES_LAYER.putTileAt(-1, tile.x, tile.y);
    }

    replaceAllBoxes();
  }

  // Mark this selection as finalized (permanent). Keeps a tab for dragging but
  // prevents further resizing via updateStart/updateEnd.
  public finalize() {
    this.isFinalized = true;
    // Snapshot the true final coords now that the user has finished drawing the box
    const finalEntry = {
      start: { x: this.start.x, y: this.start.y },
      end: { x: this.end.x, y: this.end.y },
      timestamp: Date.now(),
    };
    this.coordHistory = [finalEntry];
    this.currentCoords = { start: { ...finalEntry.start }, end: { ...finalEntry.end } };
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
  public updateTabWithNewInfo(): void {
    if (!this.tabText) return;

    const neighborCount = this.neighbors.size;
    const dataCount = this.localContext.data.size;
    const intersectionCount = this.intersections.size;

    // Update tab text to show network info, but omit zero-valued parts
    const parts: string[] = [];
    if (neighborCount > 0) parts.push(`${neighborCount}n`);
    if (dataCount > 0) parts.push(`${dataCount}d`);
    if (intersectionCount > 0) parts.push(`${intersectionCount}z`);
    let text = `Box${this.isActive ? `[(${this.start.x},${this.start.y}),(${this.end.x},${this.end.y})]` : ''}${parts.length > 0 ? ` (${parts.join(", ")})` : ''}`;

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
      } catch (e) { }
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

  /**
   * If the box was moved since the last user message, returns a hidden context
   * string describing the move and updates currentCoords. Returns null otherwise.
   * Call this just before sending the user's message to the AI.
   */
  public consumePendingMoveContext(): string | null {
    if (!this._pendingMoveNotify) return null;
    const latest = this.coordHistory[this.coordHistory.length - 1];
    if (!latest) return null;
    const prev = this.currentCoords;
    this._pendingMoveNotify = false;
    this.currentCoords = { start: { ...latest.start }, end: { ...latest.end } };

    let msg =
      `[BOX MOVED]: This selection box was moved from tile ` +
      `(${prev.start.x}, ${prev.start.y})-(${prev.end.x}, ${prev.end.y}) ` +
      `to (${latest.start.x}, ${latest.start.y})-(${latest.end.x}, ${latest.end.y}). ` +
      `All tiles and objects previously placed inside this box moved with it.`;

    if (this.placedTiles.length > 0) {
      const tileList = this.placedTiles
        .map((p) => `tile ID ${p.tileIndex} at (${p.x}, ${p.y}) on ${p.layerName}`)
        .join("; ");
      msg += ` Current placed tile positions: ${tileList}.`;
    }
    // if (this.placedEnemies.length > 0) {
    //   const enemyList = this.placedEnemies
    //     .map((e) => `${e.type} at (${e.x}, ${e.y})`)
    //     .join("; ");
    //   msg += ` Current placed enemy positions: ${enemyList}.`;
    // }

    return msg;
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
    if (this.containsPoint(x, y))
      addPlacedTile(this.placedTiles, tileIndex, x, y, layerName);
  }

  // // Register an enemy placed within this selection box (tile coords)
  // public addPlacedEnemy(enemy: (Slime | UltraSlime)) {
  //   // this.placedEnemies.push({ enemyType, x, y });
  //   this.placedEnemies.push(enemy);
  //   // console.log("Added placed enemy:", { enemyType, x, y });
  // }

  // public getPlacedEnemies() {
  //   return this.placedEnemies;
  // }

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

  public getActive(): boolean {
    return this.isActive;
  }

  // //Drag and Drop support - Jason Cho
  // public checkTilesInBox() {
  //   const sX = Math.min(this.start.x, this.end.x);
  //   const sY = Math.min(this.start.y, this.end.y);
  //   const eX = Math.max(this.start.x, this.end.x);
  //   const eY = Math.max(this.start.y, this.end.y);
  //   const tilesInBox: {
  //     tileIndex: number;
  //     x: number;
  //     y: number;
  //     layerName: string;
  //   }[] = [];
  //   for (let y = sY; y <= eY; y++) {
  //     for (let x = sX; x <= eX; x++) {
  //       const tile = this.layer.getTileAt(x, y);
  //       if (tile) {
  //         tilesInBox.push({
  //           tileIndex: tile.index,
  //           x: x,
  //           y: y,
  //           layerName: this.layer.layer.name,
  //         });
  //       }
  //     }
  //   }
  //   console.log("Tiles in Box:", tilesInBox);
  //   return tilesInBox;
  // }

  private snapshotSelection(): void {
    const sX = Math.min(this.start.x, this.end.x);
    const sY = Math.min(this.start.y, this.end.y);
    const eX = Math.max(this.start.x, this.end.x);
    const eY = Math.max(this.start.y, this.end.y);
    const w = eX - sX + 1;
    const h = eY - sY + 1;

    const tiles: { dx: number; dy: number; index: number }[] = [];

    for (let t of this.placedTiles) {
      console.log(`tiles: (tx: ${t.x}, ty: ${t.y}), (sx: ${sX}, sy: ${sY}), (dx: ${t.x - sX}, dy: ${t.y - sY}), index: ${t.tileIndex} }}`);
      tiles.push({ dx: t.x - sX, dy: t.y - sY, index: t.tileIndex });
    }

    // for (let ty = 0; ty < h; ty++) {
    //   for (let tx = 0; tx < w; tx++) {
    //     const tile = this.layer.getTileAt(sX + tx, sY + ty);
    //     if (tile && tile.index !== -1) {
    //       tiles.push({ dx: tx, dy: ty, index: tile.index });
    //     }
    //   }
    // }

    this.dragSnapshot = { w, h, tiles };
    this.dragOriginStart = new Phaser.Math.Vector2(sX, sY);

    this.buildPreviewLayer(); // build the ghost layer
    this.updatePreviewLayerPosition(); // position it under the box
  }

  private buildPreviewLayer(): void {
    this.destroyPreviewLayer();
    if (!this.dragSnapshot) return;

    const map = GROUND_LAYER.tilemap; // use the SAME map
    const tileW = map.tileWidth;
    const tileH = map.tileHeight;

    // Use the exact tilesets already attached to the map (no re-adding)
    const sourceTilesets = map.tilesets as Phaser.Tilemaps.Tileset[];
    if (!sourceTilesets || sourceTilesets.length === 0) {
      console.warn("[SelectionBox] No tilesets on map; preview cannot render.");
      return;
    }

    // Create a temporary blank layer ON THIS MAP (avoids tileset/key/firstgid mismatches)
    this.previewLayer = map.createBlankLayer(
      "PREVIEW_GHOST",
      sourceTilesets,
      0,
      0,
    );
    if (!this.previewLayer) {
      console.warn("[SelectionBox] Failed to create preview layer.");
      return;
    }

    this.previewLayer.setDepth(1002);
    this.previewLayer.setAlpha(0.75);
    this.previewLayer.setVisible(true);
    this.previewLayer.setScrollFactor(1, 1);

    // Clear to empty, then paint snapshot indices
    this.previewLayer.fill(-1, 0, 0, this.dragSnapshot.w, this.dragSnapshot.h);

    for (const t of this.dragSnapshot.tiles) {
      this.previewLayer.putTileAt(t.index, t.dx, t.dy);
    }

    // Position under the box (world pixels)
    const sX = Math.min(this.start.x, this.end.x);
    const sY = Math.min(this.start.y, this.end.y);
    this.previewLayer.setPosition(sX * tileW, sY * tileH);
  }

  private destroyPreviewLayer(): void {
    if (this.previewLayer) {
      this.previewLayer.destroy();
      this.previewLayer = undefined;
    }
    if (this.previewMap) {
      (this.previewMap as any).destroy?.();
      this.previewMap = undefined;
    }
  }

  private updatePreviewLayerPosition(): void {
    if (!this.previewLayer) return;
    const map = GROUND_LAYER.tilemap;
    const sX = Math.min(this.start.x, this.end.x);
    const sY = Math.min(this.start.y, this.end.y);
    this.previewLayer.setPosition(sX * map.tileWidth, sY * map.tileHeight);
  }

  private commitMoveToCurrentPosition(): void {
    if (!this.dragSnapshot || !this.dragOriginStart) {
      this.destroyPreviewLayer();
      return;
    }

    const oldSX = this.dragOriginStart.x;
    const oldSY = this.dragOriginStart.y;
    const newSX = Math.min(this.start.x, this.end.x);
    const newSY = Math.min(this.start.y, this.end.y);
    const dx = newSX - oldSX;
    const dy = newSY - oldSY;

    // OPTIONAL: prevent overlapping paste // ! think this is bad, layers viewed as filters this dont make sense, also prevents 1 tile moves if tile in over self
    // if (!this.targetAreaIsClear(newSX, newSY)) {
    //   console.log("Overlapped!");
    //   // cleanup + snap back to original
    //   this.destroyPreviewLayer();
    //   this.start.set(oldSX, oldSY);
    //   this.end.set(
    //     oldSX + this.dragSnapshot!.w - 1,
    //     oldSY + this.dragSnapshot!.h - 1,
    //   );
    //   this.dragSnapshot = undefined;
    //   this.dragOriginStart = undefined;
    //   this.redraw();
    //   return;
    // }

    // 1) Clear original snapshot footprint (only cells that had tiles)
    for (let ty = 0; ty < this.dragSnapshot.h; ty++) {
      for (let tx = 0; tx < this.dragSnapshot.w; tx++) {
        // const hadTile = this.dragSnapshot.tiles.some(
        //   (t) => t.dx === tx && t.dy === ty,
        // );

        GROUND_LAYER.putTileAt(-1, oldSX + tx, oldSY + ty);
        COLLECTABLES_LAYER.putTileAt(-1, oldSX + tx, oldSY + ty);
      }
    }

    // // 2) Paste at new location
    // for (const t of this.dragSnapshot.tiles) {
    //   const nx = newSX + t.dx;
    //   const ny = newSY + t.dy;
    //   this.layer.putTileAt(t.index, nx, ny);
    // }
    replaceAllBoxes(); // Todo: this is evil but works :thumbsup:


    //! idk what this code what doing but it was breaking things I hate it here I hate it here I hate it here
    // // 3) Update bookkeeping for tiles associated with this box 
    // if (this.placedTiles?.length) {
    //   for (const pt of this.placedTiles) {
    //     // // Only shift tiles that were inside the old selection
    //     // if (
    //     //   pt.x >= oldSX &&
    //     //   pt.x < oldSX + this.dragSnapshot.w &&
    //     //   pt.y >= oldSY &&
    //     //   pt.y < oldSY + this.dragSnapshot.h
    //     // ) {
    //     // pt.x += dx;
    //     // pt.y += dy;
    //     // }
    //   }
    // }

    // Cleanup
    this.destroyPreviewLayer();
    this.dragSnapshot = undefined;
    this.dragOriginStart = undefined;

    this.redraw();
  }

  // private targetAreaIsClear(newSX: number, newSY: number): boolean {
  //   if (!this.dragSnapshot) return true;
  //   for (const t of this.dragSnapshot.tiles) {
  //     const nx = newSX + t.dx;
  //     const ny = newSY + t.dy;
  //     const tile = this.layer.getTileAt(nx, ny);
  //     if (tile && tile.index !== -1) return false;
  //   } 
  //   return true;
  // }
}

export function addPlacedTile(
  tilesthing: { tileIndex: number, x: number, y: number, layerName: string }[],
  tileIndex: number,
  x: number,
  y: number,
  layerName: string,
) {

  // this.placedTiles = this.placedTiles.filter((tile) => {tile.x != x || tile.y != y})
  let replace = tilesthing.findIndex((tile) => tile.x == x && tile.y == y && tile.layerName == layerName);


  if (replace != -1) {
    if (tileIndex == -1) {
      tilesthing.splice(replace, 1);
      return;
    }
    tilesthing[replace].tileIndex = tileIndex;
  }
  else if (tileIndex != -1) {
    tilesthing.push({ tileIndex, x, y, layerName });
  }
  console.log("Added placed tile:", { tileIndex, x, y, layerName });
}