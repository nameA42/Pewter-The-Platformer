import Phaser from "phaser";

export class EditorScene extends Phaser.Scene {
  private TILE_SIZE = 16;
  private SCALE = 1.0;
  private map!: Phaser.Tilemaps.Tilemap;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private backgroundLayer!: Phaser.Tilemaps.TilemapLayer;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private previewBox!: Phaser.GameObjects.Graphics;

  private minZoomLevel = 2.25;
  private maxZoomLevel = 10;
  private zoomLevel = 2.25;

  private minimap!: Phaser.Cameras.Scene2D.Camera;
  private minimapZoom = 0.15;

  private scrollDeadzone = 50; // pixels from the edge of the camera view to stop scrolling
  private scrollSpeed = 10; // pixels per second

  private selectedTileIndex = 0; // index of the tile to place

  private isPlacing: boolean = false; // Place tile flag

  private selectedTiles: number[][] = []; // Selected Tiles

  //Box Properties
  private highlightBox!: Phaser.GameObjects.Graphics;
  private selectionBox!: Phaser.GameObjects.Graphics;
  public selectionStart!: Phaser.Math.Vector2;
  public selectionEnd!: Phaser.Math.Vector2;
  private isSelecting: boolean = false;
  private selectionBounds: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null = null;

  // keyboard controls
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyV!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: "editorScene" });
  }

  preload() {}

  create() {
    this.map = this.make.tilemap({ key: "defaultMap" });

    console.log("Map loaded:", this.map);
    const tileset = this.map.addTilesetImage(
      "pewterPlatformerTileset",
      "tileset",
      16,
      16,
      0,
      0,
    )!;
    // console.log("Tileset added:", this.map);

    this.backgroundLayer = this.map.createLayer(
      "Background_Layer",
      tileset,
      0,
      0,
    )!;
    // console.log("LAYER1 added:", this.map);
    this.groundLayer = this.map.createLayer("Ground_Layer", tileset, 0, 0)!;
    // console.log("LAYER2 added:", this.map);

    this.cameras.main.setBounds(
      0,
      0,
      this.map.widthInPixels,
      this.map.heightInPixels,
    );
    this.cameras.main.centerOn(0, 0);
    this.cameras.main.setZoom(this.zoomLevel);

    // minimap
    this.minimap = this.cameras
      .add(
        10,
        10,
        this.map.widthInPixels * this.minimapZoom,
        this.map.heightInPixels * this.minimapZoom,
      )
      .setZoom(this.minimapZoom)
      .setName("minimap");
    this.minimap.setBackgroundColor(0x002244);
    this.minimap.setBounds(
      0,
      0,
      this.map.widthInPixels,
      this.map.heightInPixels,
    );
    this.cameras.main.centerOn(0, 0);

    // grid
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.setDepth(10);
    this.drawGrid();

    // preview box
    this.previewBox = this.add.graphics();
    this.previewBox.setDepth(200); // draw above everything else

    // zoom in & zoom out
    this.input.on(
      "wheel",
      (
        pointer: Phaser.Input.Pointer,
        gameObjects: Phaser.GameObjects.GameObject[],
        deltaX: number,
        deltaY: number,
        deltaZ: number,
      ) => {
        if (deltaY > 0) {
          this.zoomLevel = Phaser.Math.Clamp(
            this.zoomLevel - 0.1,
            this.minZoomLevel,
            this.maxZoomLevel,
          );
        } else {
          this.zoomLevel = Phaser.Math.Clamp(
            this.zoomLevel + 0.1,
            this.minZoomLevel,
            this.maxZoomLevel,
          );
        }

        this.cameras.main.setZoom(this.zoomLevel);
      },
    );

    if (this.input.mouse) {
      this.input.mouse.disableContextMenu();
    }

    // scrolling
    let isDragging = false;
    let dragStartPoint = new Phaser.Math.Vector2();

    // highlight box
    this.highlightBox = this.add.graphics();
    this.highlightBox.setDepth(101); // Ensure it's on top of everything

    // selection box
    this.selectionBox = this.add.graphics();
    this.selectionBox.setDepth(100); // Slightly under highlight box
    this.input.on("pointermove", this.updateSelection, this);
    this.input.on("pointerup", this.endSelection, this);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown()) {
        isDragging = true;
        dragStartPoint.set(pointer.x, pointer.y);
      } else if (pointer.leftButtonDown()) {
        this.isPlacing = true;
        // Pasting the recently selected area of tiles
        const worldPoint = this.cameras.main.getWorldPoint(
          pointer.x,
          pointer.y,
        );
        const tileX = Math.floor(worldPoint.x / (16 * this.SCALE));
        const tileY = Math.floor(worldPoint.y / (16 * this.SCALE));

        // Place the currently selected brush tile
        this.placeTile(this.groundLayer, tileX, tileY, this.selectedTileIndex);
      } else if (pointer.rightButtonDown()) {
        // Setup selection box
        console.log(`Starting selection`);
        this.startSelection(pointer);

        this.selectedTileIndex =
          this.groundLayer.getTileAtWorldXY(pointer.worldX, pointer.worldY)
            ?.index || 0;
      }
    });

    // Finish up continous placement of tiles
    this.input.on("pointerup", () => {
      isDragging = false;
      this.isPlacing = false;
    });

    // Highlight the current tile the cursor is on
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      // Setup pointer movement
      this.highlightTile(pointer);

      if (!isDragging) return;
      if (
        pointer.x >= this.cameras.main.width - this.scrollDeadzone ||
        pointer.y >= this.cameras.main.height - this.scrollDeadzone ||
        pointer.x <= this.scrollDeadzone ||
        pointer.y <= this.scrollDeadzone
      ) {
        isDragging = false; // Stop dragging if pointer is outside the camera view
        console.warn("Pointer moved outside camera view, stopping drag.");
        return;
      }

      const dragX = dragStartPoint.x - pointer.x;
      const dragY = dragStartPoint.y - pointer.y;

      this.cameras.main.scrollX += dragX / this.cameras.main.zoom;
      this.cameras.main.scrollY += dragY / this.cameras.main.zoom;

      dragStartPoint.set(pointer.x, pointer.y);
    });

    if (this.input.keyboard) {
      this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyShift = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SHIFT,
      );
      this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
      this.keyX = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
      this.keyV = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V);
    }

    //highlight box
    this.highlightBox = this.add.graphics();
    this.highlightBox.setDepth(101); // Ensure it's on top of everything
  }

  cameraMotion() {
    const cam = this.cameras.main;
    let scrollSpeed = this.scrollSpeed;
    if (this.keyShift.isDown) {
      scrollSpeed *= 4;
    }
    if (this.keyA.isDown) {
      cam.scrollX -= scrollSpeed / cam.zoom;
    }
    if (this.keyD.isDown) {
      cam.scrollX += scrollSpeed / cam.zoom;
    }
    if (this.keyW.isDown) {
      cam.scrollY -= scrollSpeed / cam.zoom;
    }
    if (this.keyS.isDown) {
      cam.scrollY += scrollSpeed / cam.zoom;
    }
  }

  // Draws an overlay grid on the top of the map
  drawGrid() {
    const cam = this.cameras.main;

    this.gridGraphics.clear();
    this.gridGraphics.fillStyle(0x000000, 1); // color and alpha

    const startX =
      Math.floor(cam.worldView.x / this.TILE_SIZE) * this.TILE_SIZE;
    const endX =
      Math.ceil((cam.worldView.x + cam.worldView.width) / this.TILE_SIZE) *
      this.TILE_SIZE;

    const startY =
      Math.floor(cam.worldView.y / this.TILE_SIZE) * this.TILE_SIZE;
    const endY =
      Math.ceil((cam.worldView.y + cam.worldView.height) / this.TILE_SIZE) *
      this.TILE_SIZE;

    const dotSpacing = 4;
    const dotLength = 0.4;
    const dotWidth = 1.2;

    const edgewidth = 2;
    // draw edge lines for minimap
    this.gridGraphics.lineStyle(edgewidth, 0xf00000, 1); // color and alpha
    this.gridGraphics.strokeRect(
      startX - edgewidth,
      startY - edgewidth,
      endX - startX + edgewidth,
      endY - startY + edgewidth,
    );

    // Vertical dotted lines
    for (let x = startX; x <= endX; x += this.TILE_SIZE) {
      for (let y = startY - dotLength; y <= endY - dotLength; y += dotSpacing) {
        this.gridGraphics.fillRect(
          x - dotLength / 2,
          y - dotLength / 2,
          dotLength,
          dotWidth,
        );
      }
    }

    // Horizontal dotted lines
    for (let y = startY; y <= endY; y += this.TILE_SIZE) {
      for (let x = startX - dotLength; x <= endX - dotLength; x += dotSpacing) {
        this.gridGraphics.fillRect(
          x - dotLength / 2,
          y - dotLength / 2,
          dotWidth,
          dotLength,
        );
      }
    }
  }

  placeTile(
    layer: Phaser.Tilemaps.TilemapLayer,
    x: number,
    y: number,
    tileIndex: number,
  ) {
    tileIndex = Phaser.Math.Clamp(
      tileIndex,
      1,
      layer.tilemap.tilesets[0].total - 1,
    );
    console.log(`Placing tile at (${x}, ${y}) with index ${tileIndex}`);
    layer.putTileAt(tileIndex, x, y);
  }

  update() {
    this.drawGrid();
    this.cameraMotion();

    // Continuous Block Placement
    if (this.isPlacing) {
      const pointer = this.input.activePointer;
      const tileX = Math.floor(pointer.worldX / this.TILE_SIZE);
      const tileY = Math.floor(pointer.worldY / this.TILE_SIZE);
      this.placeTile(this.groundLayer, tileX, tileY, this.selectedTileIndex);
    }

    // Is able to either cut, copy, or paste
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) {
      this.copySelection();
      console.log("Copied selection");
    } else if (Phaser.Input.Keyboard.JustDown(this.keyX)) {
      this.cutSelection();
      console.log("Cut selection");
    } else if (Phaser.Input.Keyboard.JustDown(this.keyV)) {
      const pointer = this.input.activePointer;
      this.pasteSelection(pointer);
      console.log("Pasted selection");
    }
  }

  // Highlights the current tile the cursor is currently on
  highlightTile(pointer: Phaser.Input.Pointer): void {
    // Convert screen coordinates to tile coordinates
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x: number = Math.floor(worldPoint.x / (16 * this.SCALE));
    const y: number = Math.floor(worldPoint.y / (16 * this.SCALE));

    // Only highlight if within map bounds
    if (x >= 0 && x < this.map.width && y >= 0 && y < this.map.height) {
      this.drawHighlightBox(x, y, 0xff0000); // Red outline
    } else {
      // Clear highlight if out of bounds
      this.highlightBox.clear();
    }
  }

  // Helper function: Filling the box with a certain color
  drawHighlightBox(x: number, y: number, color: number): void {
    // Clear any previous highlights
    this.highlightBox.clear();

    // Set the style for the highlight (e.g., semi-transparent yellow)
    this.highlightBox.fillStyle(color, 0.5);
    this.highlightBox.lineStyle(2, color, 1);

    // Draw a rectangle around the hovered tile
    this.highlightBox.strokeRect(
      x * 16 * this.SCALE,
      y * 16 * this.SCALE,
      16 * this.SCALE,
      16 * this.SCALE,
    );

    // Optionally, you can fill the tile with a semi-transparent color to highlight it
    this.highlightBox.fillRect(
      x * 16 * this.SCALE,
      y * 16 * this.SCALE,
      16 * this.SCALE,
      16 * this.SCALE,
    );
  }

  /*
   Starts a new tile selection when the user clicks.
   * Converts the pointer's screen position into tilemap coordinates
   * Clamps the starting tile to stay within map bounds
   * Initializes both start and end of the selection to this tile
   * Flags that a selection is in progress
  */
  startSelection(pointer: Phaser.Input.Pointer): void {
    // Convert screen coordinates to tile coordinates
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x: number = Math.floor(worldPoint.x / (16 * this.SCALE));
    const y: number = Math.floor(worldPoint.y / (16 * this.SCALE));

    // Begin the selection
    this.isSelecting = true;
    this.selectionStart = new Phaser.Math.Vector2(x, y);
    this.selectionEnd = new Phaser.Math.Vector2(x, y);
    this.drawSelectionBox();
  }

  drawSelectionBox() {
    this.selectionBox.clear();

    if (!this.isSelecting) return;

    // Calculate the bounds of the selection
    const startX = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const startY = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const endX = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const endY = Math.max(this.selectionStart.y, this.selectionEnd.y);

    const width = endX - startX + 1;
    const height = endY - startY + 1;

    // Draw a semi-transparent rectangle
    this.selectionBox.fillStyle(0xff5555, 0.3);
    this.selectionBox.fillRect(
      startX * 16 * this.SCALE,
      startY * 16 * this.SCALE,
      (endX - startX + 1) * 16 * this.SCALE,
      (endY - startY + 1) * 16 * this.SCALE,
    );

    // Draw a dashed border
    this.selectionBox.lineStyle(2, 0xff5555, 1);
    this.selectionBox.beginPath();
    const dashLength = 8; // Length of each dash
    const gapLength = 4; // Length of each gap

    // Top border
    for (let i = 0; i < width * 16 * this.SCALE; i += dashLength + gapLength) {
      this.selectionBox.moveTo(
        startX * 16 * this.SCALE + i,
        startY * 16 * this.SCALE,
      );
      this.selectionBox.lineTo(
        Math.min(
          startX * 16 * this.SCALE + i + dashLength,
          endX * 16 * this.SCALE + 16 * this.SCALE,
        ),
        startY * 16 * this.SCALE,
      );
    }

    // Bottom border
    for (let i = 0; i < width * 16 * this.SCALE; i += dashLength + gapLength) {
      this.selectionBox.moveTo(
        startX * 16 * this.SCALE + i,
        endY * 16 * this.SCALE + 16 * this.SCALE,
      );
      this.selectionBox.lineTo(
        Math.min(
          startX * 16 * this.SCALE + i + dashLength,
          endX * 16 * this.SCALE + 16 * this.SCALE,
        ),
        endY * 16 * this.SCALE + 16 * this.SCALE,
      );
    }

    // Left border
    for (let i = 0; i < height * 16 * this.SCALE; i += dashLength + gapLength) {
      this.selectionBox.moveTo(
        startX * 16 * this.SCALE,
        startY * 16 * this.SCALE + i,
      );
      this.selectionBox.lineTo(
        startX * 16 * this.SCALE,
        Math.min(
          startY * 16 * this.SCALE + i + dashLength,
          endY * 16 * this.SCALE + 16 * this.SCALE,
        ),
      );
    }

    // Right border
    for (let i = 0; i < height * 16 * this.SCALE; i += dashLength + gapLength) {
      this.selectionBox.moveTo(
        endX * 16 * this.SCALE + 16 * this.SCALE,
        startY * 16 * this.SCALE + i,
      );
      this.selectionBox.lineTo(
        endX * 16 * this.SCALE + 16 * this.SCALE,
        Math.min(
          startY * 16 * this.SCALE + i + dashLength,
          endY * 16 * this.SCALE + 16 * this.SCALE,
        ),
      );
    }

    this.selectionBox.strokePath();
  }

  /*
   Updates the selection box as the user drags the mouse.
   * Continuously converts the pointer's current screen position into tilemap coordinates
   * Updates the selection’s end position and redraws the highlight box
   */
  updateSelection(pointer: Phaser.Input.Pointer): void {
    if (!this.isSelecting) return;

    // Convert screen coordinates to tile coordinates
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x: number = Math.floor(worldPoint.x / (16 * this.SCALE));
    const y: number = Math.floor(worldPoint.y / (16 * this.SCALE));

    // Clamp to map bounds
    const mapWidth = this.map.width;
    const mapHeight = this.map.height;

    let clampedX: number = Phaser.Math.Clamp(x, 0, mapWidth - 1);
    let clampedY: number = Phaser.Math.Clamp(y, 0, mapHeight - 1);

    this.selectionEnd.set(clampedX, clampedY);
    this.drawSelectionBox();
  }

  /*
   Finalizes the selection when the user releases the mouse.
   * Unflags the selection state
   * Computes the rectangular area between the start and end positions
   * Loops through all tiles in the area, storing their indices into 'selectedTiles`
   * Makes the selected tiles available for copy, cut, or paste
   */
  endSelection() {
    if (!this.isSelecting) return;

    this.isSelecting = false;
    this.selectedTiles = [];

    // Copying tiles from the selected region
    this.selectionBounds = {
      startX: Math.min(this.selectionStart.x, this.selectionEnd.x),
      startY: Math.min(this.selectionStart.y, this.selectionEnd.y),
      endX: Math.max(this.selectionStart.x, this.selectionEnd.x),
      endY: Math.max(this.selectionStart.y, this.selectionEnd.y),
    };
  }

  // Copy selection of tiles function
  copySelection() {
    if (!this.selectionBounds) return;

    const { startX, startY, endX, endY } = this.selectionBounds;
    this.selectedTiles = [];

    for (let y = startY; y <= endY; y++) {
      const row: number[] = [];
      for (let x = startX; x <= endX; x++) {
        const tile = this.groundLayer.getTileAt(x, y);
        row.push(tile ? tile.index : -1);
      }
      this.selectedTiles.push(row);
    }

    console.log("Copied selection:", this.selectedTiles);
  }

  // Cutting selection of tiles function
  cutSelection() {
    this.copySelection();

    if (!this.selectionBounds) return;
    const { startX, startY, endX, endY } = this.selectionBounds;

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        this.placeTile(this.groundLayer, x, y, -1); // Remove tile
      }
    }
  }

  // Pasting selection of tiles function
  pasteSelection(pointer: Phaser.Input.Pointer) {
    if (this.selectedTiles.length === 0) return; // Nothing to paste

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const pasteX = Math.floor(worldPoint.x / (16 * this.SCALE));
    const pasteY = Math.floor(worldPoint.y / (16 * this.SCALE));

    for (let y = 0; y < this.selectedTiles.length; y++) {
      for (let x = 0; x < this.selectedTiles[y].length; x++) {
        const tileIndex = this.selectedTiles[y][x];
        if (tileIndex === -1) continue; // Skip empty spots

        this.placeTile(this.groundLayer, pasteX + x, pasteY + y, tileIndex);
      }
    }
  }
}
