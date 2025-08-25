/* Jason Cho Changelog

TODO:
1. Make a UIScene that runs parallel to the editorScene 
  - UI will follow camera scrolling
  1.1: Make editor and uiScene communicate
  1.2: Handle anchoring
  1.3: Created a registry variable 'uiPointerOver'

2. Make buttons look nice
  2.1: Buttons have borders and are the interactive element
  2.2: Buttons detect if they are hovered over 

3. Make buttons work with placeTile



*/



import Phaser from "phaser";
import { sendUserPrompt } from "../languageModel/chatBox";
export class EditorScene extends Phaser.Scene {
  private TILE_SIZE = 16;
  private map!: Phaser.Tilemaps.Tilemap;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private backgroundLayer!: Phaser.Tilemaps.TilemapLayer;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private minZoomLevel = 2.25;
  private maxZoomLevel = 10;
  private zoomLevel = 2.25;

  private currentTileId = 1; // What tile to place
  private isEditMode = false; // Toggle between drag mode and edit mode

  private minimap!: Phaser.Cameras.Scene2D.Camera;
  private minimapZoom = 0.15;

  private scrollDeadzone = 50; // pixels from the edge of the camera view to stop scrolling

  private chatBox!: Phaser.GameObjects.DOMElement;
  private scrollSpeed = 10; // pixels per second

  private selectedTileIndex = 0; // index of the tile to place

  // keyboard controls
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;

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

    if (this.input.mouse)
    {
      this.input.mouse.disableContextMenu();
    }

    // scrolling + tile placement
    this.setupInput();
    // How to use it is to first press e which turns on the edit mode,
    // then you can use the number keys to select a tile to place, 2-5
    // you can also right click to delete a tile in edit mode.
    // you can move the3 camera still by dragging the mouse around when in edit mode.
    // make sure to not be moving the mouse too fast or it will not register and not place the tile.

    // Create hidden chatbox
    this.chatBox = this.add.dom(1600, 1400).createFromHTML(`
  <div id="chatbox" style="
    width: 1400px;
    height: 1420px;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    font-family: sans-serif;
    font-size: 70px;
    padding: 20px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-shadow: 0 0 8px rgba(0,0,0,0.6);
  ">
    <div id="chat-log" style="flex-grow: 1; overflow-y: auto; font-size: 70px; line-height: 1.5;"></div>
    <input id="chat-input" type="text" placeholder="Type a command..." style="
      margin-top: 16px;
      padding: 14px;
      font-size: 70px;
      border: none;
      border-radius: 4px;
    " />
  </div>
`);
    this.chatBox.setVisible(true);
    let isChatVisible = true;

    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "c") {
        isChatVisible = !isChatVisible;
        this.chatBox.setVisible(isChatVisible);
      }
    });
    const input = this.chatBox.getChildByID("chat-input") as HTMLInputElement;
    const log = this.chatBox.getChildByID("chat-log") as HTMLDivElement;

    input.addEventListener("keydown", async (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const msg = input.value.trim();
        if (!msg) return;

        input.value = "";
        log.innerHTML += `<p><strong>You:</strong> ${msg}</p>`;
        const reply = await this.sendToGemini(msg);
        log.innerHTML += `<p><strong>Pewter:</strong> ${reply}</p>`;
        log.scrollTop = log.scrollHeight;
      }
    });
  }

  private async sendToGemini(prompt: string): Promise<string> {
    return await sendUserPrompt(prompt);
  }

  public showChatboxAt(x: number, y: number): void {
    this.chatBox.setPosition(x, y);
    this.chatBox.setVisible(true);
    const input = this.chatBox.getChildByID("chat-input") as HTMLInputElement;
    input.focus();
  }

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

  placeTile(layer: Phaser.Tilemaps.TilemapLayer, x: number, y: number, tileIndex: number) {
    tileIndex = Phaser.Math.Clamp(tileIndex, 1, layer.tilemap.tilesets[0].total - 1);
    console.log(`Placing tile at (${x}, ${y}) with index ${tileIndex}`);
    layer.putTileAt(tileIndex, x, y);
  }


  update() {
    this.drawGrid();
    this.cameraMotion();
  }
  setupInput() {
    // Keep your existing zoom functionality unchanged

    // Scrolling and tile placement combined
    let isDragging = false;
    let dragStartPoint = new Phaser.Math.Vector2();
    let hasDragged = false;

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.isEditMode && pointer.rightButtonDown()) {
        // Right click in edit mode = delete tile
        const worldX = pointer.worldX;
        const worldY = pointer.worldY;
        const tileX = Math.floor(worldX / this.TILE_SIZE);
        const tileY = Math.floor(worldY / this.TILE_SIZE);
        this.groundLayer.removeTileAt(tileX, tileY);
        return;
      }

      if (pointer.leftButtonDown()) {
        isDragging = true;
        hasDragged = false;
        dragStartPoint.set(pointer.x, pointer.y);
      }
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (
        isDragging &&
        !hasDragged &&
        this.isEditMode &&
        pointer.leftButtonReleased()
      ) {
        // Left click in edit mode without dragging = place tile
        const worldX = pointer.worldX;
        const worldY = pointer.worldY;
        const tileX = Math.floor(worldX / this.TILE_SIZE);
        const tileY = Math.floor(worldY / this.TILE_SIZE);
        this.groundLayer.putTileAt(this.currentTileId, tileX, tileY);
      }
      isDragging = false;
      hasDragged = false;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!isDragging) return;

      const dragDistance = Phaser.Math.Distance.Between(
        dragStartPoint.x,
        dragStartPoint.y,
        pointer.x,
        pointer.y,
      );

      if (dragDistance > 5) {
        hasDragged = true;
      }

      if (hasDragged) {
        // Your existing camera dragging logic
        if (
          pointer.x >= this.cameras.main.width - this.scrollDeadzone ||
          pointer.y >= this.cameras.main.height - this.scrollDeadzone ||
          pointer.x <= this.scrollDeadzone ||
          pointer.y <= this.scrollDeadzone
        ) {
          isDragging = false;
          console.warn("Pointer moved outside camera view, stopping drag.");
          return;
        }

        const dragX = dragStartPoint.x - pointer.x;
        const dragY = dragStartPoint.y - pointer.y;

        this.cameras.main.scrollX += dragX / this.cameras.main.zoom;
        this.cameras.main.scrollY += dragY / this.cameras.main.zoom;

        dragStartPoint.set(pointer.x, pointer.y);
      }
    });

    // Keyboard shortcuts
    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => {
      switch (event.key.toLowerCase()) {
        case "e":
          this.isEditMode = !this.isEditMode;
          console.log(`Edit mode: ${this.isEditMode ? "ON" : "OFF"}`);
          break;
        case "1":
          this.currentTileId = 1;
          break;
        case "2":
          this.currentTileId = 2;
          break;
        case "3":
          this.currentTileId = 3;
          break;
        case "4":
          this.currentTileId = 4;
          break;
        case "5":
          this.currentTileId = 5;
          break;
      }
    });
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
}
