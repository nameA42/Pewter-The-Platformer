// Pewter Platformer EditorScene - Cleaned and consolidated after merge
import Phaser from "phaser";

type PlayerSprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  isFalling?: boolean;
};
import { sendUserPrompt } from "../languageModel/chatBox";
import { Slime } from "./ExternalClasses/Slime.ts";
import { UltraSlime } from "./ExternalClasses/UltraSlime.ts";
import { UIScene } from "./UIScene.ts";
import { WorldFacts } from "./ExternalClasses/worldFacts.ts";
import type { World } from "matter";

export class EditorScene extends Phaser.Scene {
  private TILE_SIZE = 16;
  private SCALE = 1.0;
  public map!: Phaser.Tilemaps.Tilemap;
  public groundLayer!: Phaser.Tilemaps.TilemapLayer;
  public collectablesLayer!: Phaser.Tilemaps.TilemapLayer;
  private backgroundLayer!: Phaser.Tilemaps.TilemapLayer;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private playButton!: Phaser.GameObjects.Text;
  private mapHistory: Phaser.Tilemaps.Tilemap[] = [];
  private currentMapIteration: number = 0;

  private minZoomLevel = 2.25;
  private maxZoomLevel = 10;
  private zoomLevel = 2.25;

  //private currentTileId = 1; // What tile to place
  private isEditMode = false; // Toggle between drag mode and edit mode

  private minimap!: Phaser.Cameras.Scene2D.Camera;
  private minimapZoom = 0.15;

  private scrollDeadzone = 50; // pixels from the edge of the camera view to stop scrolling

  private editorButton!: Phaser.GameObjects.Container;
  private scrollSpeed = 10; // pixels per second

  /// Game Variables.
  private gameActive = false;
  private player!: PlayerSprite;
  // Play mode controls
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: any;
  private isJumpPressed = false;

  private selectedTileIndex = 1; // index of the tile to place

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

  private setPointerOverUI = (v: boolean) =>
    this.registry.set("uiPointerOver", v);

  // Removed chatBox from EditorScene

  public enemies: (Slime | UltraSlime)[] = [];

  private damageKey!: Phaser.Input.Keyboard.Key;
  private flipKey!: Phaser.Input.Keyboard.Key;

  public worldFacts!: WorldFacts;

  constructor() {
    super({ key: "editorScene" });
  }

  preload() {
    this.load.setPath("phaserAssets/");
    //this.load.image("tilemap_tiles", "tilemap_packed.png");

    // Load as spritesheet, not image
    this.load.spritesheet("tilemap_tiles", "tilemap_packed.png", {
      frameWidth: 18, // width of each tile
      frameHeight: 18, // height of each tile
    });

    // Load the character atlas (PNG + JSON)
    this.load.atlas(
      "platformer_characters",
      "tilemap-characters-packed.png",
      "tilemap-characters-packed.json",
    );
  }

  startGame() {
    this.gameActive = true;
    this.cameras.remove(this.minimap);
    this.createEditorButton();
    this.setupPlayer();

    // Enable physics and gravity for play mode
    this.physics.world.gravity.y = 1500;

    // Ensure ground layer has collision enabled
    if (this.groundLayer) {
      this.groundLayer.setCollisionByExclusion([-1]);
    }
    // Add collider between player and ground layer
    this.physics.add.collider(this.player, this.groundLayer);

    // Camera follows player in play mode
    this.cameras.main
      .startFollow(this.player, true, 0.25, 0.25)
      .setDeadzone(50, 50)
      .setZoom(this.zoomLevel);

    // Setup player movement controls
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,S,A,D");

    // Add Q key handler to quit play mode
    if (this.input.keyboard) {
      const keyQ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
      keyQ.on("down", () => {
        this.startEditor();
      });
    }
  }

  create() {
    this.map = this.make.tilemap({ key: "defaultMap" });

    this.worldFacts = new WorldFacts(this);

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
    this.collectablesLayer = this.map.createLayer(
      "Collectables_Layer",
      tileset,
      0,
      0,
    )!;
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

    //UI Scene setup
    this.scene.launch("UIScene");
    this.scene.bringToTop("UIScene");

    // Restore keyboard key initialization with null check
    if (this.input.keyboard) {
      this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyShift = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SHIFT,
      );
      this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
      this.keyX = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
      this.keyV = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V);
      this.keyU = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.U);
      this.keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
      this.keyN = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
      this.keyCtrl = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.CTRL,
      );
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
    this.input.on(
      "pointerup",
      (pointer: Phaser.Input.Pointer) => {
        if (pointer.rightButtonReleased()) {
          if (this.isSelecting) {
            this.endSelection();
          }
        } else if (pointer.leftButtonReleased()) {
          this.isPlacing = false;
        }
      },
      this,
    );

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
        //this.placeTile(this.groundLayer, tileX, tileY, this.selectedTileIndex);
      } else if (pointer.rightButtonDown()) {
        // Setup selection box
        console.log(`Starting selection`);
        this.startSelection(pointer);

        this.selectedTileIndex =
          this.groundLayer.getTileAtWorldXY(pointer.worldX, pointer.worldY)
            ?.index || 0;
      }
    });
    //TODO: handle UI -> Editor communication

    this.worldFacts.refresh();
  }

  setupPlayer() {
    this.player = this.physics.add.sprite(
      100,
      100,
      "platformer_characters",
      "tile_0000.png",
    ) as PlayerSprite;

    this.player.setCollideWorldBounds(false);
    this.player.isFalling = true;
    this.physics.add.collider(this.player, this.groundLayer);
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

  private async sendToGemini(prompt: string): Promise<string> {
    return await sendUserPrompt(prompt);
  }

  // Removed showChatboxAt from EditorScene

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
    if (this.gameActive) {
      // Play mode: player movement and camera follow
      // Hide grid and red outline

      this.enemies.forEach((enemy, index) => {
        if (!enemy || !enemy.active) {
          enemy.destroy();
          if (index !== -1) {
            this.enemies.splice(index, 1); // removes 1 item at that index
          }

          return;
        }
        enemy.update(this.player, 0, this.gameActive);
      });

      if (this.gridGraphics) this.gridGraphics.clear();
      if (this.highlightBox) this.highlightBox.clear();
      if (this.selectionBox) this.selectionBox.clear();

      if (this.player && this.cursors && this.wasd) {
        const player = this.player;
        const body = player.body;
        const onGround = body.blocked.down;

        let velocityX = body.velocity.x;
        let velocityY = body.velocity.y;

        let moveInput = 0;
        if (this.cursors.left.isDown || this.wasd.A.isDown) {
          moveInput = -1;
          player.setFlipX(true);
        } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
          moveInput = 1;
          player.setFlipX(false);
        }

        const PLAYER_SPEED = 400;
        const ACCELERATION = 1500;
        const FRICTION = 1200;
        const AIR_CONTROL = 0.8;
        const JUMP_VELOCITY = -550;

        if (moveInput !== 0) {
          const acceleration = onGround
            ? ACCELERATION
            : ACCELERATION * AIR_CONTROL;
          const targetVelocity = moveInput * PLAYER_SPEED;
          if (Math.abs(velocityX - targetVelocity) > 5) {
            velocityX +=
              (targetVelocity - velocityX) * (acceleration / 1000) * (1 / 60);
            velocityX = Phaser.Math.Clamp(
              velocityX,
              -PLAYER_SPEED,
              PLAYER_SPEED,
            );
          } else {
            velocityX = targetVelocity;
          }
        } else {
          // No horizontal input - apply friction
          if (onGround) {
            const frictionForce = FRICTION * (1 / 60);
            if (Math.abs(velocityX) > frictionForce) {
              velocityX -= Math.sign(velocityX) * frictionForce;
            } else {
              velocityX = 0;
            }
          } else {
            const airFriction = FRICTION * 0.3 * (1 / 60);
            if (Math.abs(velocityX) > airFriction) {
              velocityX -= Math.sign(velocityX) * airFriction;
            } else {
              velocityX = 0;
            }
          }
        }

        // Jump logic
        const jumpPressed = this.cursors.up.isDown || this.wasd.W.isDown;
        if (jumpPressed && !this.isJumpPressed && onGround) {
          velocityY = JUMP_VELOCITY;
          this.isJumpPressed = true;
        } else if (!jumpPressed && this.isJumpPressed && velocityY < -50) {
          velocityY *= 0.4;
        }
        if (!jumpPressed) {
          this.isJumpPressed = false;
        }

        player.setVelocity(velocityX, velocityY);

        // Reset if fallen off world
        if (player.y > this.map.heightInPixels + 100) {
          player.setPosition(100, 150);
          player.setVelocity(0, 0);
        }
      }
      // update the play button's position to the camera
      if (this.playButton) {
        const cam = this.cameras.main;
        this.playButton.x = cam.worldView.x + cam.worldView.width - 550;
        this.playButton.y = cam.worldView.y + 250;
      }
      // No grid/camera/block placement/editing in play mode
      return;
    }

    // Editor mode: normal controls
    this.drawGrid();
    this.cameraMotion();
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

    if (Phaser.Input.Keyboard.JustDown(this.keyC) && this.keyCtrl.isDown) {
      this.copySelection();
      console.log("Copied selection");
    } else if (
      Phaser.Input.Keyboard.JustDown(this.keyX) &&
      this.keyCtrl.isDown
    ) {
      this.cutSelection();
      console.log("Cut selection");
    } else if (
      Phaser.Input.Keyboard.JustDown(this.keyV) &&
      this.keyCtrl.isDown
    ) {
      const pointer = this.input.activePointer;
      this.pasteSelection(pointer);
      console.log("Pasted selection");
    } else if (Phaser.Input.Keyboard.JustDown(this.keyN)) {
      this.bindMapHistory();
      console.log("Saved map state");
    } else if (
      Phaser.Input.Keyboard.JustDown(this.keyU) &&
      this.keyCtrl.isDown
    ) {
      this.undoLastAction();
      console.log("Undid last action");
    } else if (
      Phaser.Input.Keyboard.JustDown(this.keyR) &&
      this.keyCtrl.isDown
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

    // Send selection info to UIScene
    const uiScene = this.scene.get("UIScene") as UIScene;
    if (uiScene && typeof uiScene.handleSelectionInfo === "function") {
      uiScene.handleSelectionInfo(msg);
    }
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

  // Removed duplicate setupInput logic (all hotkey setup is handled in create)

  // ...existing code...
  // cameraMotion is already defined above, removed duplicate
  // ...existing code...

  // Create the editor button - Shawn K
  createEditorButton() {
    // some help text
    this.add.rectangle(30, 310, 500, 20, 0x1a1a1a);
    this.add.text(20, 300, "Press Q to quit play mode.");

    /* Someone help me! I can't get this button to draw.
    var UIScene = this.scene.get("UIScene");
    
    this.editorButton = UIScene.createButton(
      this,
      100, // 100 pixels from left of screen
      this.cameras.main.height - 50, // 100 pixels from bottom of screen
      'Edit',
      () => {
        this.startEditor();
      },
      {
        fill: 0x1a1a1a,        // Dark background
        hoverFill: 0x127803,   // Green hover
        downFill: 0x0f5f02,    // Darker green
        textColor: '#ffffff',   // White text
        fontSize: 24,
        paddingX: 15,
        paddingY: 10
      }
    );

    // Set high depth so it appears above other UI elements
    this.editorButton.setDepth(1001);
    */
  }

  private startEditor() {
    // Undo play mode and restore editor mode
    this.gameActive = false;

    this.scene.launch("UIScene");
    this.scene.bringToTop("UIScene");
    // Stop camera follow and reset zoom
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(this.zoomLevel);

    // Restore minimap
    if (!this.cameras.cameras.includes(this.minimap)) {
      this.cameras
        .add(
          10,
          10,
          this.map.widthInPixels * this.minimapZoom,
          this.map.heightInPixels * this.minimapZoom,
        )
        .setZoom(this.minimapZoom)
        .setName("minimap")
        .setBackgroundColor(0x002244)
        .setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    }

    // Remove player sprite
    if (this.player) {
      this.player.destroy();
      this.player = undefined as any;
    }

    // Reset gravity
    this.physics.world.gravity.y = 0;

    // Clear play mode controls
    this.cursors = undefined as any;
    this.wasd = undefined as any;
    this.isJumpPressed = false;

    // Redraw grid and highlight
    if (this.gridGraphics) this.gridGraphics.clear();
    this.drawGrid();
    if (this.highlightBox) this.highlightBox.clear();
    if (this.selectionBox) this.selectionBox.clear();

    // Optionally, reset camera position
    this.cameras.main.centerOn(0, 0);

    // also remove the editor button
  }
}
