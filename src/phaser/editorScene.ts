// Pewter Platformer EditorScene - Cleaned and consolidated after merge
import Phaser from "phaser";

type PlayerSprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  isFalling?: boolean;
};
import { sendUserPrompt } from "../languageModel/chatBox";
import { Slime } from "./EnemyClasses/Slime.ts";
import { UltraSlime } from "./EnemyClasses/UltraSlime.ts";
import { UIScene } from "./UIScene.ts";
import { SelectionBox } from "./selectionBox.ts";

// History types
type BBox = { x: number; y: number; w: number; h: number };
type TileIndex = number;
type TileDiffCell = { dx: number; dy: number; before: TileIndex; after: TileIndex };
type PlacementOp = {
  id: string;
  ts: number;
  actor: "chat" | "user";
  selectionId?: string;
  bbox: BBox;
  diffs: TileDiffCell[];
  note?: string;
};

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

  //private currentTileId = 1; // What tile to place
  private isEditMode = false; // Toggle between drag mode and edit mode

  private minimap: Phaser.Cameras.Scene2D.Camera | null = null;
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

  // New history state
  private placementHistory: PlacementOp[] = [];
  private tileProvenance: Map<string, string[]> = new Map();
  private selectionIdCounter = 0;

  //Box Properties
  private highlightBox!: Phaser.GameObjects.Graphics;
  public selectionStart!: Phaser.Math.Vector2;
  public selectionEnd!: Phaser.Math.Vector2;
  private isSelecting: boolean = false;
  private selectionBounds: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null = null;
  private activeBox: SelectionBox | null = null;
  private selectionBoxes: SelectionBox[] = [];
  // New private flags for right-drag preview behavior
  private _selectionWasRightDrag: boolean = false;
  private _lastOverlapState: boolean = false;
  // expose last selection bbox and id for tools
  private lastSelectionBBox: { x: number; y: number; w: number; h: number } | null = null;
  private lastSelectionId?: string;

  public getActiveSelectionBBox() {
    const b = this.activeBox?.getBounds();
    if (!b) return null;
    return { x: b.x, y: b.y, w: b.width, h: b.height, id: (this.activeBox as any).getId?.() };
  }

  public getLastSelectionBBox() {
    if (!this.lastSelectionBBox) return null;
    return { ...this.lastSelectionBBox, id: this.lastSelectionId };
  }

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
  private keyZ!: Phaser.Input.Keyboard.Key;
  private keyB!: Phaser.Input.Keyboard.Key;
  private keyCtrl!: Phaser.Input.Keyboard.Key;

  private currentZLevel: number = 1; // 1 = red, 2 = green, 3 = blue
  private zLabel?: Phaser.GameObjects.Text;

  private setPointerOverUI = (v: boolean) =>
    this.registry.set("uiPointerOver", v);

  // Removed chatBox from EditorScene

  public enemies: (Slime | UltraSlime)[] = [];

  private damageKey!: Phaser.Input.Keyboard.Key;
  private flipKey!: Phaser.Input.Keyboard.Key;

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
    this.removeMinimap();
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

    this.createMinimap();
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

    // Z-level label in the UI (fixed to camera)
    this.zLabel = this.add
      .text(8, 40, `Z: ${this.currentZLevel}`, { fontSize: "12px" })
      .setScrollFactor(0)
      .setDepth(10000);

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
      this.keyZ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
      this.keyB = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
      this.keyCtrl = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.CTRL,
      );

      // Bind Ctrl+Z to cycle persisted Z-level (1->2->3->1)
      this.input.keyboard.on("keydown-Z", (ev: KeyboardEvent) => {
        if (!ev.ctrlKey) return;
        // cycle through 1..3
        this.currentZLevel = (this.currentZLevel % 3) + 1;
        // update any active preview box immediately
        if (this.activeBox) {
          this.activeBox.setZLevel(this.currentZLevel);
        }
        // update HUD
        this.zLabel?.setText(`Z: ${this.currentZLevel}`);
      });

      // Bind Ctrl+B to finalize the active selection (if any)
      this.input.keyboard.on("keydown-B", (ev: KeyboardEvent) => {
        if (!ev.ctrlKey) return;
        if (!this.activeBox) return;

        // disallow finalize if overlapping any existing finalized box
        if (this._checkOverlapAgainstFinalized(this.activeBox)) {
          this.sound?.play?.("error");
          console.warn("Cannot finalize — overlap detected");
          return;
        }

        // copy tiles from the active box into its internal buffer
        this.activeBox.copyTiles();

        // save finalized bbox + id
        const gb = this.activeBox.getBounds();
        this.lastSelectionBBox = { x: gb.x, y: gb.y, w: gb.width, h: gb.height };
        this.lastSelectionId = (this.activeBox as any).getId?.();

        // now finalize (push into selectionBoxes and clear active)
        this.finalizeSelectBox();
        this._selectionWasRightDrag = false;

        // Build and send the user-facing selection message (same style as previous endSelection)
        const b = this.selectionBoxes[this.selectionBoxes.length - 1].getBounds();
        const selectionWidth = b.width;
        const selectionHeight = b.height;
        const msg =
          `User has selected a rectangular region that is this size: ${selectionWidth}x${selectionHeight}. Here are the global coordinates for the selection box: [${b.x}, ${b.y}] to [${b.x + b.width - 1}, ${b.y + b.height - 1}].` +
          `There are no notable points of interest in this selection` +
          `Be sure to re-explain what is in the selection box. If there are objects in the selection, specify the characteristics of the object. ` +
          `If no objects are inside the selection, then do not mention anything else.`;

        const uiScene = this.scene.get("UIScene") as UIScene;
        if (uiScene && typeof uiScene.handleSelectionInfo === "function") {
          uiScene.handleSelectionInfo(msg);
        }
      });
    }

    // scrolling
    let isDragging = false;
    let dragStartPoint = new Phaser.Math.Vector2();

    // highlight box
    this.highlightBox = this.add.graphics();
    this.highlightBox.setDepth(101); // Ensure it's on top of everything
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
    // selection box - use pointer events for preview-only right-drag
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      // only update selection preview when actively selecting from right-drag
      if (this.isSelecting && this._selectionWasRightDrag && this.activeBox) {
        this.updateSelection(p);

        // de-spam overlap logs by only logging on state change
        const nowOver = this._checkOverlapAgainstFinalized(this.activeBox);
        if (nowOver !== this._lastOverlapState) {
          this._lastOverlapState = nowOver;
          if (nowOver) console.warn("Overlap detected");
        }
      }
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonReleased()) {
        this.isPlacing = false;
      }

      // If we were right-dragging, cancel preview on release
      if (
        this.isSelecting &&
        this._selectionWasRightDrag &&
        pointer.rightButtonReleased()
      ) {
        this.cancelSelection();
        this._selectionWasRightDrag = false;
      }
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown()) {
        isDragging = true;
        dragStartPoint.set(pointer.x, pointer.y);
      } else if (pointer.leftButtonDown()) {
        this.isPlacing = true;
        // Pasting the recently selected area of tiles
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const tileX = Math.floor(worldPoint.x / (16 * this.SCALE));
        const tileY = Math.floor(worldPoint.y / (16 * this.SCALE));

        // Place the currently selected brush tile
        //this.placeTile(this.groundLayer, tileX, tileY, this.selectedTileIndex);
      } else if (pointer.rightButtonDown()) {
        // Setup preview selection box (right-drag only)
        this.startSelection(pointer);
        this._selectionWasRightDrag = true;
        this._lastOverlapState = false;

        // grab index under pointer for potential UX needs
        this.selectedTileIndex =
          this.groundLayer.getTileAtWorldXY(pointer.worldX, pointer.worldY)
            ?.index || 0;
      }
    });
    //TODO: handle UI -> Editor communication
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
    // allow clearing a tile when tileIndex === -1
    if (tileIndex === -1) {
      // putTileAt accepts -1 to clear a tile
      layer.putTileAt(-1, x, y);
      return;
    }

    const tileset = layer.tilemap.tilesets[0];
    const max = Math.max(1, (tileset?.total ?? 1) - 1);
    const clamped = Phaser.Math.Clamp(tileIndex, 1, max);
    console.log(`Placing tile at (${x}, ${y}) with index ${clamped}`);
    layer.putTileAt(clamped, x, y);
  }

  update() {
    if (this.gameActive) {
      // Play mode: player movement and camera follow
      // Hide grid and red outline
      if (this.gridGraphics) this.gridGraphics.clear();
      if (this.highlightBox) this.highlightBox.clear();
      //if (this.selectionBox) this.selectionBox.clear();

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
    } else if (
      Phaser.Input.Keyboard.JustDown(this.keyZ) &&
      this.keyCtrl.isDown
    ) {
      this.cycleZLevel();
    } else if (
      Phaser.Input.Keyboard.JustDown(this.keyB) &&
      this.keyCtrl.isDown
    ) {
      this.finalizeSelectBox();
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

  startSelection(pointer: Phaser.Input.Pointer) {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor(worldPoint.x / this.TILE_SIZE);
    const y = Math.floor(worldPoint.y / this.TILE_SIZE);
    this.selectionStart = new Phaser.Math.Vector2(x, y);
    this.selectionEnd = new Phaser.Math.Vector2(x, y);

    // Begin the selection
    this.isSelecting = true;

    if (!this.activeBox) {
      // Checking Overlapping
      const candidate = new Phaser.Geom.Rectangle(x, y, 1, 1);
      let overlap = false;
      for (const box of this.selectionBoxes) {
        const bound = box.getBounds(); // MUST be tile-space rectangle
        // Only consider overlap if on same Z-level
        if ((box as any).getZLevel && (this.currentZLevel !== (box as any).getZLevel())) continue;
        if (Phaser.Geom.Intersects.RectangleToRectangle(candidate, bound)) {
          console.log("Cannot create box here — overlap detected");
          overlap = true;
          break;
        }
      }
      // If overlap does occur, do not make a box
      if (overlap) {
        console.log("Cannot create box there!! Overlap detected!!");
        this.isSelecting = false;
        return;
      } else {
        // If overlap does not occur, do make a box
        console.log("Made a new box!");
        this.activeBox = new SelectionBox(
          this,
          this.selectionStart,
          this.selectionEnd,
          this.currentZLevel,
          this.groundLayer,
        );
        // assign id so we can attribute ops
        const selId = `sel_${++this.selectionIdCounter}`;
        (this.activeBox as any).setId?.(selId);
      }
    } else {
      // Continue working with the existing active box
      this.selectionStart.set(x, y);
      this.selectionEnd.set(x, y);
      this.activeBox.updateEnd(this.selectionEnd);
    }
  }

  // Cancel an in-progress (preview) selection without finalizing it
  private cancelSelection() {
    if (this.activeBox) {
      this.activeBox.destroy();
    }
    this.activeBox = null;
    this.isSelecting = false;
  }

  // Check whether the provided box would overlap any finalized selection boxes
  private _checkOverlapAgainstFinalized(box: SelectionBox): boolean {
    const possible = box.getBounds();
    const z = (box as any).getZLevel?.() ?? 1;
    for (const b of this.selectionBoxes) {
      const bz = (b as any).getZLevel?.() ?? 1;
      // only block if same z-level
      if (bz !== z) continue;
      if (Phaser.Geom.Rectangle.Overlaps(
        new Phaser.Geom.Rectangle(possible.x, possible.y, possible.width, possible.height),
        new Phaser.Geom.Rectangle(b.getBounds().x, b.getBounds().y, b.getBounds().width, b.getBounds().height)
      )) {
        return true;
      }
    }
    return false;
  }

  updateSelection(pointer: Phaser.Input.Pointer) {
    if (!this.isSelecting || !this.activeBox) return;

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor(worldPoint.x / this.TILE_SIZE);
    const y = Math.floor(worldPoint.y / this.TILE_SIZE);

    // Now checking whether if any finalized boxes overlap with current one
    const possibleEnd = new Phaser.Math.Vector2(x, y);
    const possibleBounds = this.activeBox.tempBounds(possibleEnd);

    let overlap = false;
    for (const box of this.selectionBoxes) {
      if (box === this.activeBox) continue;
      // only consider collisions on same Z
      const bz = (box as any).getZLevel?.() ?? 1;
      const az = (this.activeBox as any).getZLevel?.() ?? 1;
      if (bz !== az) continue;
      if (Phaser.Geom.Rectangle.Overlaps(possibleBounds, box.getBounds())) {
        console.log("Overlap has been detected!!");
        overlap = true;
        break;
      }
    }

    // If no overlap was detected
    if (!overlap) {
      this.selectionEnd.set(x, y);
      this.activeBox.updateEnd(this.selectionEnd);
    }
  }

  async endSelection() {
    if (!this.isSelecting || !this.activeBox) return;

    this.isSelecting = false;
    this.selectedTiles = [];

    const sX = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const sY = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const eX = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const eY = Math.max(this.selectionStart.y, this.selectionEnd.y);

    // Finalize the box
    this.activeBox.updateEnd(this.selectionEnd);
    this.activeBox.copyTiles();

    // save finalized bbox + id
    const gb = this.activeBox.getBounds(); // width/height already inclusive
    this.lastSelectionBBox = { x: gb.x, y: gb.y, w: gb.width, h: gb.height };
    this.lastSelectionId = (this.activeBox as any).getId?.();

    // Finalize and add to permanent list (finalizeSelectBox guards duplicates)
    this.finalizeSelectBox();

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

    const h = this.selectedTiles.length;
    const w = this.selectedTiles[0]?.length ?? 0;
    if (w === 0) return;

    this.applyTileMatrixWithHistory(
      { x: pasteX, y: pasteY, w, h },
      this.selectedTiles,
      null,
      "user",
      this.activeBox?.getId(),
      "pasteSelection",
    );

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

    this.createMinimap();
    // Restore minimap
    /*
    if (!this.cameras.cameras.includes(this.minimap)) {
      this.cameras.add(
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
    */

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
    //if (this.selectionBox) this.selectionBox.clear();

    // Optionally, reset camera position
    this.cameras.main.centerOn(0, 0);

    // also remove the editor button
  }

  private createMinimap() {
    if (this.minimap) {
      this.removeMinimap();
    }

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
  }

  private removeMinimap() {
    if (this.minimap) {
      this.cameras.remove(this.minimap);
      this.minimap = null;
    }
  }

  // Goes through each Z Level
  cycleZLevel() {
    this.currentZLevel++;
    if (this.currentZLevel > 3) {
      this.currentZLevel = 1;
    }

    console.log("Z-Level changed to:", this.currentZLevel);

    // If a box is being drawn, update its z-level immediately
    if (this.activeBox) {
      this.activeBox.setZLevel(this.currentZLevel);
    }
  }

  // Finalize the box whenever user wants a brand new box
  finalizeSelectBox() {
    if (!this.activeBox) return;

    // Push it to the array only if it's not already present
    if (!this.selectionBoxes.includes(this.activeBox)) {
      this.selectionBoxes.push(this.activeBox);
    }

    // Clear references
    this.activeBox = null;
    this.isSelecting = false;
  }

  // Helpers for selection lifecycle
  public clearAllSelections() {
    for (const box of this.selectionBoxes) box.destroy();
    if (this.activeBox) this.activeBox.destroy();
    this.selectionBoxes = [];
    this.activeBox = null;
    this.isSelecting = false;
    this.lastSelectionBBox = null;
    this.lastSelectionId = undefined;
  }

  public removeSelectionById(id: string) {
    const idx = this.selectionBoxes.findIndex((b) => (b as any).getId?.() === id);
    if (idx >= 0) {
      this.selectionBoxes[idx].destroy();
      this.selectionBoxes.splice(idx, 1);
    }
  }

  // Lookup a selection box by id
  public getSelectionById(id: string) {
    return this.selectionBoxes.find((b) => (b as any).getId?.() === id) ?? null;
  }

  // Z-level UI helper
  private setSelectionZ(z: number) {
    this.currentZLevel = z;
    if (this.activeBox) this.activeBox.setZLevel(z);
    if (this.zLabel) this.zLabel.setText(`Z: ${z}`);
  }

  private applyTileMatrixWithHistory(
    bbox: BBox,
    matrix: number[][] | null,
    fallbackIndex: number | null,
    actor: "chat" | "user",
    selectionId?: string,
    note?: string,
  ) {
    const layer = this.groundLayer;
    const diffs: TileDiffCell[] = [];

    // snapshot before
    const before: number[][] = [];
    for (let dy = 0; dy < bbox.h; dy++) {
      const row: number[] = [];
      for (let dx = 0; dx < bbox.w; dx++) {
        const x = bbox.x + dx,
          y = bbox.y + dy;
        row.push(layer.getTileAt(x, y)?.index ?? -1);
      }
      before.push(row);
    }

    // write tiles
    for (let dy = 0; dy < bbox.h; dy++) {
      for (let dx = 0; dx < bbox.w; dx++) {
        const x = bbox.x + dx,
          y = bbox.y + dy;
        const desired = matrix ? matrix[dy]?.[dx] ?? -1 : fallbackIndex ?? -1;
        layer.putTileAt(desired, x, y); // allow -1 to clear
      }
    }

    // after + sparse diffs
    for (let dy = 0; dy < bbox.h; dy++) {
      for (let dx = 0; dx < bbox.w; dx++) {
        const x = bbox.x + dx,
          y = bbox.y + dy;
        const a = layer.getTileAt(x, y)?.index ?? -1;
        const b = before[dy][dx];
        if (a !== b) diffs.push({ dx, dy, before: b, after: a });
      }
    }

    if (diffs.length === 0) return;

    const opId = (crypto as any).randomUUID?.() ?? `${Date.now()}_${Math.random()}`;
    const op: PlacementOp = {
      id: opId,
      ts: Date.now(),
      actor,
      selectionId,
      bbox: { ...bbox },
      diffs,
      note,
    };

    // provenance
    for (const d of diffs) {
      const key = `${bbox.x + d.dx},${bbox.y + d.dy}`;
      const list = this.tileProvenance.get(key) ?? [];
      list.push(opId);
      this.tileProvenance.set(key, list);
    }

    this.placementHistory.push(op);
    // optional cap
    const MAX_OPS = 1000;
    if (this.placementHistory.length > MAX_OPS) {
      this.placementHistory.splice(0, this.placementHistory.length - MAX_OPS);
    }
  }

  // Public wrapper so external tools (LLM tools) can route edits through history.
  // Accepts an optional layerName to tag the operation for external tooling.
  public applyTileMatrixWithHistoryPublic(
    bbox: BBox,
    matrix: number[][] | null,
    fallbackIndex: number | null,
    actor: "chat" | "user",
    selectionId?: string,
    note?: string,
    layerName?: string,
  ) {
    // Forward to the internal implementation that actually writes tiles and builds diffs.
    this.applyTileMatrixWithHistory(bbox, matrix, fallbackIndex, actor, selectionId, note);

    // Tag the latest placement op with a layerName, if provided.
    if (layerName && this.placementHistory.length > 0) {
      const lastOp = this.placementHistory[this.placementHistory.length - 1] as any;
      if (lastOp) lastOp.layerName = layerName;
    }
  }

  public getRegionHistory(bbox: BBox, limit = 10): PlacementOp[] {
    const inter = (a: BBox, b: BBox) =>
      !(a.x + a.w - 1 < b.x || b.x + b.w - 1 < a.x || a.y + a.h - 1 < b.y || b.y + b.h - 1 < a.y);
    return this.placementHistory
      .filter((op) => inter(op.bbox, bbox))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);
  }

  public getTileHistory(x: number, y: number): PlacementOp[] {
    const ids = this.tileProvenance.get(`${x},${y}`) ?? [];
    const dict = new Map(this.placementHistory.map((op) => [op.id, op] as const));
    return ids.map((id) => dict.get(id)!).filter(Boolean) as PlacementOp[];
  }

  public fillSelectionWithTile(box: SelectionBox, tileIndex: number, note?: string) {
    const b = box.getBounds(); // now width/height are correct
    const bbox: BBox = { x: b.x, y: b.y, w: b.width, h: b.height };
    this.applyTileMatrixWithHistory(
      bbox,
      null,
      tileIndex,
      "chat",
      box.getId(),
      note ?? "fillSelectionWithTile",
    );
  }
}
