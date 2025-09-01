import Phaser from "phaser";
import { sendUserPrompt } from "../languageModel/chatBox";
import { Slime } from "./EnemyClasses/Slime.ts";
import { UltraSlime } from "./EnemyClasses/UltraSlime.ts";

export class EditorScene extends Phaser.Scene {
  private TILE_SIZE = 16;
  private SCALE = 1.0;
  public map!: Phaser.Tilemaps.Tilemap;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private backgroundLayer!: Phaser.Tilemaps.TilemapLayer;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private playButton!: Phaser.GameObjects.Text;
  private mapHistory: Phaser.Tilemaps.Tilemap[] = [];
  private currentMapIteration: number = 0;

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
  private keyU!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyN!: Phaser.Input.Keyboard.Key;
  private keyCtrl!: Phaser.Input.Keyboard.Key;

  private chatBox!: Phaser.GameObjects.DOMElement;

  public enemies: (Slime | UltraSlime)[] = [];

  private player!: Phaser.GameObjects.Sprite;

  private damageKey!: Phaser.Input.Keyboard.Key;
  private flipKey!: Phaser.Input.Keyboard.Key;

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

    if (this.input.mouse) {
      this.input.mouse.disableContextMenu();
    }
    // scrolling + tile placement
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
      if (e.key === "Escape") {
        isChatVisible = !isChatVisible;
        this.chatBox.setVisible(isChatVisible);
      }
    });

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

    this.input.on("pointerup", () => {
      isDragging = false;
      this.isPlacing = false;
    });

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
      const keyCodes = [
        "A",
        "S",
        "D",
        "W",
        "SHIFT",
        "C",
        "X",
        "V",
        "R",
        "U",
        "N",
        "CTRL",
        "SPACE",
        "F",
      ];

      keyCodes.forEach((code) => {
        const phaserCode =
          Phaser.Input.Keyboard.KeyCodes[
            code as keyof typeof Phaser.Input.Keyboard.KeyCodes
          ];
        if (phaserCode !== undefined) {
          this.input.keyboard!.addKey(phaserCode, false, false); // capture = false
        }
      });

      // Keep references for hotkeys you check in update
      this.keyA = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.A,
        false,
        false,
      );
      this.keyS = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.S,
        false,
        false,
      );
      this.keyD = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.D,
        false,
        false,
      );
      this.keyW = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.W,
        false,
        false,
      );
      this.keyShift = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SHIFT,
        false,
        false,
      );
      this.keyC = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.C,
        false,
        false,
      );
      this.keyX = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.X,
        false,
        false,
      );
      this.keyV = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.V,
        false,
        false,
      );
      this.keyR = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.R,
        false,
        false,
      );
      this.keyU = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.U,
        false,
        false,
      );
      this.keyN = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.N,
        false,
        false,
      );
      this.keyCtrl = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.CTRL,
        false,
        false,
      );
    }

    // Disable Phaser key processing while typing
    const chatInput = this.chatBox.getChildByID(
      "chat-input",
    ) as HTMLInputElement;
    chatInput.addEventListener("focus", () => {
      this.input.keyboard!.enabled = false;
    });
    chatInput.addEventListener("blur", () => {
      this.input.keyboard!.enabled = true;
    });

    this.createPlayButton();

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
    // play button
    const slime1 = new Slime(this, 5 * 16 + 8, 14 * 16 + 8, this.map);
    this.enemies.push(slime1);
    const slime2 = new UltraSlime(this, 15 * 16 + 8, 14 * 16 + 8, this.map);
    this.enemies.push(slime2);

    this.player = this.add.sprite(0, 0, "spritesheet", 13);

    this.damageKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );
    this.flipKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.F,
    );
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

  // play button
  private createPlayButton() {
    const button = this.add
      .text(100, 100, "Play", {
        fontSize: "24px",
        color: "#ffffff",
        backgroundColor: "#1a1a1a",
        padding: { x: 15, y: 10 },
      })
      .setDepth(100)
      .setInteractive()
      .on("pointerdown", () => {
        console.log("Play button clicked!");
        this.scene.start("GameScene");
      })
      .on("pointerover", () => {
        button.setStyle({ backgroundColor: "#127803" });
      })
      .on("pointerout", () => {
        button.setStyle({ backgroundColor: "#1a1a1a" });
      });

    this.minimap.ignore(button); // stops the button from apearing in the mini map
    this.playButton = button;
  }

  update() {
    this.drawGrid();
    this.cameraMotion();
    // update the play button's position to the camera
    if (this.playButton) {
      const cam = this.cameras.main;
      this.playButton.x = cam.worldView.x + cam.worldView.width - 550;
      this.playButton.y = cam.worldView.y + 250;
    }

    // Continuous Block Placement
    if (this.isPlacing) {
      const pointer = this.input.activePointer;
      const tileX = Math.floor(pointer.worldX / this.TILE_SIZE);
      const tileY = Math.floor(pointer.worldY / this.TILE_SIZE);
      this.placeTile(this.groundLayer, tileX, tileY, this.selectedTileIndex);
    }

    if (
      Phaser.Input.Keyboard.JustDown(this.keyC) &&
      Phaser.Input.Keyboard.JustDown(this.keyCtrl)
    ) {
      this.copySelection();
      console.log("Copied selection");
    } else if (
      Phaser.Input.Keyboard.JustDown(this.keyX) &&
      Phaser.Input.Keyboard.JustDown(this.keyCtrl)
    ) {
      this.cutSelection();
      console.log("Cut selection");
    } else if (
      Phaser.Input.Keyboard.JustDown(this.keyV) &&
      Phaser.Input.Keyboard.JustDown(this.keyCtrl)
    ) {
      const pointer = this.input.activePointer;
      this.pasteSelection(pointer);
      console.log("Pasted selection");
    } else if (
      Phaser.Input.Keyboard.JustDown(this.keyN) &&
      Phaser.Input.Keyboard.JustDown(this.keyCtrl)
    ) {
      this.bindMapHistory();
      console.log("Saved map state");
    } else if (
      Phaser.Input.Keyboard.JustDown(this.keyU) &&
      Phaser.Input.Keyboard.JustDown(this.keyCtrl)
    ) {
      this.undoLastAction();
      console.log("Undid last action");
    } else if (
      Phaser.Input.Keyboard.JustDown(this.keyR) &&
      Phaser.Input.Keyboard.JustDown(this.keyCtrl)
    ) {
      this.redoLastAction();
      console.log("Redid last action");
    }
  }

  undoLastAction(): void {
    if (this.currentMapIteration > 0) {
      this.currentMapIteration--;
      this.map = this.mapHistory[this.currentMapIteration];
      console.log("Undid last action");
    } else {
      console.log("No action to undo");
    }
  }

  redoLastAction(): void {
    if (this.currentMapIteration < this.mapHistory.length - 1) {
      this.currentMapIteration++;
      this.map = this.mapHistory[this.currentMapIteration];
      console.log("Redid last action");
    } else {
      console.log("No action to redo");
    }
  }

  bindMapHistory(): void {
    // Only keep history up to the current iteration
    this.mapHistory = this.mapHistory.slice(0, this.currentMapIteration + 1);
    this.mapHistory.push(this.map);
    this.currentMapIteration = this.mapHistory.length - 1;
  }

  highlightTile(pointer: Phaser.Input.Pointer): void {
    // Convert screen coordinates to tile coordinates
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x: number = Math.floor(worldPoint.x / (16 * this.SCALE));
    const y: number = Math.floor(worldPoint.y / (16 * this.SCALE));

    // Only highlight if within map bounds
    if (x >= 0 && x < 36 && y >= 0 && y < 20) {
      this.drawHighlightBox(x, y, 0xff0000); // Red outline
    } else {
      // Clear highlight if out of bounds
      this.highlightBox.clear();
    }
  }

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

  updateSelection(pointer: Phaser.Input.Pointer): void {
    if (!this.isSelecting) return;

    // Convert screen coordinates to tile coordinates
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x: number = Math.floor(worldPoint.x / (16 * this.SCALE));
    const y: number = Math.floor(worldPoint.y / (16 * this.SCALE));

    // Clamp to map bounds
    let clampedX: number = Phaser.Math.Clamp(x, 0, 36 - 1);
    let clampedY: number = Phaser.Math.Clamp(y, 0, 20 - 1);

    this.selectionEnd.set(clampedX, clampedY);
    this.drawSelectionBox();
  }

  async endSelection() {
    if (!this.isSelecting) return;

    this.isSelecting = false;
    this.selectedTiles = [];

    const sX = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const sY = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const eX = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const eY = Math.max(this.selectionStart.y, this.selectionEnd.y);

    // Copying tiles from the selected region
    this.selectionBounds = {
      startX: sX,
      startY: sY,
      endX: eX,
      endY: eY,
    };

    // These define the height and width of the selection box
    const selectionWidth = eX - sX + 1;
    const selectionHeight = eY - sY + 1;

    // Helper to convert any global (x, y) to selection-local coordinates
    const toSelectionCoordinates = (x: number, y: number) => {
      return {
        x: x - sX,
        y: eY - y,
      };
    };

    let msg: string;

    if (sX === eX && sY === eY) {
      const { x: localX, y: localY } = toSelectionCoordinates(sX, sY);
      msg = `User has selected a single tile at (${localX}, ${localY}) relative to the bottom-left of the selection box.`;
    } else {
      msg =
        `User has selected a rectangular region that is this size: ${selectionWidth}x${selectionHeight}. Here are the global coordinates for the selection box: [${sX}, ${sY}] to [${eX}, ${eY}].` +
        `There are no notable points of interest in this selection` +
        `Be sure to re-explain what is in the selection box. If there are objects in the selection, specify the characteristics of the object. ` +
        `If no objects are inside the selection, then do not mention anything else.`;
      console.log(msg);
    }

    const input = this.chatBox.getChildByID("chat-input") as HTMLInputElement;
    const log = this.chatBox.getChildByID("chat-log") as HTMLDivElement;

    input.value = "";
    log.innerHTML += `<p><strong>You:</strong> Got Selection</p>`;
    const reply = await this.sendToGemini(msg);
    console.log(reply);
    log.innerHTML += `<p><strong>Pewter:</strong> ${reply}</p>`;
    log.scrollTop = log.scrollHeight;
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

    this.enemies.forEach((enemy, index) => {
      if (!enemy || !enemy.active) {
        enemy.destroy();
        if (index !== -1) {
          this.enemies.splice(index, 1); // removes 1 item at that index
        }

        return;
      }
      enemy.update(this.player, 0);
    });

    if (Phaser.Input.Keyboard.JustDown(this.damageKey)) {
      this.enemies[0].causeDamage(1);
      console.log(this.enemies[0].getHealth());
    }

    if (Phaser.Input.Keyboard.JustDown(this.flipKey)) {
      this.enemies[0].flip(true);
    }
  }
}
