// Pewter Platformer EditorScene - Cleaned and consolidated after merge
import Phaser from "phaser";

type PlayerSprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  isFalling?: boolean;
};
import { regenerateSelection as regenerateSelectionModule } from "./regenerator";
import { sendUserPrompt, getProcessingBox } from "../languageModel/chatBox";
import { setActiveSelectionBox } from "../languageModel/chatBox";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { Slime } from "./ExternalClasses/Slime.ts";
import { UltraSlime } from "./ExternalClasses/UltraSlime.ts";
import { DynamicEnemy } from "../enemySystem/runtime/DynamicEnemy.ts";
import { UIScene } from "./UIScene.ts";
import { WorldFacts } from "./ExternalClasses/worldFacts.ts";
import { replaceAllBoxes, SelectionBox, allSelectionBoxes, addPlacedTile, superDuperRealUserLayer } from "./selectionBox.ts";
import { regenerate } from "./ExternalClasses/RegenerationTools.ts";
import { Z_LEVEL_COLORS } from "./colors";

type EnemySnapshotEntry =
  | { kind: "Slime"; spawnX: number; spawnY: number }
  | { kind: "UltraSlime"; spawnX: number; spawnY: number }
  | { kind: "Dynamic"; spawnX: number; spawnY: number; definition: any };

interface BoxSnapshot {
  start: { x: number; y: number };
  end: { x: number; y: number };
  zLevel: number;
  placedTiles: { tileIndex: number; x: number; y: number; layerName: string }[];
  // placedEnemies:
  // { enemyType: string; x: number; y: number }[];
  // (Slime | UltraSlime)[];
  chatHistory: { type: string; content: string }[];
}

interface WorldSnapshot {
  groundTiles: { x: number; y: number; index: number }[];
  collectablesTiles: { x: number; y: number; index: number }[];
  enemies: EnemySnapshotEntry[];
  selectionBoxes: BoxSnapshot[];
  userTiles: { tileIndex: number; x: number; y: number; layerName: string }[];
}

export let GROUND_LAYER: Phaser.Tilemaps.TilemapLayer;
export let COLLECTABLES_LAYER: Phaser.Tilemaps.TilemapLayer;
export let editorScene: EditorScene;

export class EditorScene extends Phaser.Scene {
  private TILE_SIZE = 16;
  private SCALE = 1.0;
  public map!: Phaser.Tilemaps.Tilemap;
  public groundLayer!: Phaser.Tilemaps.TilemapLayer;
  public collectablesLayer!: Phaser.Tilemaps.TilemapLayer;
  private backgroundLayer!: Phaser.Tilemaps.TilemapLayer;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private playButton!: Phaser.GameObjects.Text;
  private mapHistory: WorldSnapshot[] = [];
  private currentMapIteration: number = -1;
  private static readonly MAX_HISTORY = 50;

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

  private selectedTileIndex = -1; // index of the tile to place
  private selectedBlockName = ""; // name of the selected block

  private isPlacing: boolean = false; // Place tile flag

  private selectedTiles: number[][] = []; // Selected Tiles

  private clipboard: number[][][] = []; // Global clipboard for copy and paste

  //Selection Box Properties
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
  public activeBox: SelectionBox | null = null;
  // allSelectionBoxes: SelectionBox[] = [];

  // keyboard controls
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyV!: Phaser.Input.Keyboard.Key;
  private keyN!: Phaser.Input.Keyboard.Key;
  private keyZ!: Phaser.Input.Keyboard.Key;
  private keyY!: Phaser.Input.Keyboard.Key;
  private keyO!: Phaser.Input.Keyboard.Key;
  private keyP!: Phaser.Input.Keyboard.Key;
  private keyB!: Phaser.Input.Keyboard.Key;
  private keyCtrl!: Phaser.Input.Keyboard.Key;
  private keyDelete!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;

  private setPointerOverUI = (v: boolean) =>
    this.registry.set("uiPointerOver", v);

  // Removed chatBox from EditorScene

  public enemies: (
    | Slime
    | UltraSlime
    | import("../enemySystem/runtime/DynamicEnemy").DynamicEnemy
  )[] = [];

  private damageKey!: Phaser.Input.Keyboard.Key;
  private flipKey!: Phaser.Input.Keyboard.Key;

  // Play mode: player stats and HUD
  private playerHealth = 5;
  private readonly maxPlayerHealth = 5;
  private coinCount = 0;
  private healthText: Phaser.GameObjects.Text | null = null;
  private coinText: Phaser.GameObjects.Text | null = null;
  private collectablesSnapshot: { x: number; y: number; index: number }[] = [];
  private isDead = false;
  private optionsButton!: Phaser.GameObjects.Container;
  private optionsPanel!: Phaser.GameObjects.Container;
  private optionsPanelVisible: boolean = false;

  private currentZLevel: number = 1;
  private useEventQueueRegen: boolean = false; // Toggle between linear and event queue regen

  public worldFacts!: WorldFacts;

  constructor() {
    super({ key: "editorScene" });
    editorScene = this;
  }

  // Collaborative Context Merging - Expose active box for chat system
  private setupGlobalActiveBoxAccess(): void {
    // Expose active selection box to the chat system
    if (typeof window !== "undefined") {
      (window as any).getActiveSelectionBox = () => {
        return this.activeBox;
      };
    }
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
    this.isDead = false;
    this.playerHealth = this.maxPlayerHealth;
    this.coinCount = 0;
    this.removeMinimap();
    this.setupPlayer();
    this.createOptionsButton();

    // Snapshot all collectable tiles so we can restore them on death/exit
    this.collectablesSnapshot = [];
    this.collectablesLayer.forEachTile((tile) => {
      if (tile.index > 0) {
        this.collectablesSnapshot.push({
          x: tile.x,
          y: tile.y,
          index: tile.index,
        });
      }
    });

    // instantiate enemies // !NOTE: I know this is evil but like I don't wanna have to figure out a better way
    this.enemies.forEach((e) => e.destroy());
    this.enemies.length = 0;

    replaceAllBoxes(); // one last replace just in case
    this.groundLayer.forEachTile((tile) => {
      if (tile.index == 8) {
        const spawnX = tile.x * this.map.tileWidth + this.map.tileWidth / 2;
        const spawnY = tile.y * this.map.tileWidth + this.map.tileWidth / 2;
        const ultraSlime = new UltraSlime(
          this,
          spawnX,
          spawnY,
          this.map,
          this.groundLayer,
        );
        // Store spawn position for reset when exiting play mode
        ultraSlime.setData("spawnX", spawnX);
        ultraSlime.setData("spawnY", spawnY);
        this.enemies.push(ultraSlime);
        // this.worldFacts.setFact("Enemy", x, y, "UltraSlime"); // TODO: think I need to learn worldfacts and edit this later
        tile.index = -1;
      }
      if (tile.index == 9) {
        const spawnX = tile.x * this.map.tileWidth + this.map.tileWidth / 2;
        const spawnY = tile.y * this.map.tileWidth + this.map.tileWidth / 2;
        const slime = new Slime(
          this,
          spawnX,
          spawnY,
          this.map,
          this.groundLayer,
        );
        // Store spawn position for reset when exiting play mode
        slime.setData("spawnX", spawnX);
        slime.setData("spawnY", spawnY);
        this.enemies.push(slime);
        // this.worldFacts.setFact("Enemy", x, y, "UltraSlime"); // TODO: think I need to learn worldfacts and edit this later
        tile.index = -1;
      }

    })


    // Enable physics and gravity for play mode
    this.physics.world.gravity.y = 1500;

    // Ensure ground layer has collision enabled
    if (this.groundLayer) {
      this.groundLayer.setCollisionByExclusion([-1]);
    }
    // Add collider between player and ground layer
    this.physics.add.collider(this.player, this.groundLayer);

    // Add physical colliders between player and all enemies
    for (const enemy of this.enemies) {
      this.physics.add.collider(this.player, enemy as any);
    }

    // Enable overlap detection for collectables (coin = 2, fruit = 3)
    this.collectablesLayer.setCollision([2, 3]);
    this.physics.add.overlap(
      this.player,
      this.collectablesLayer,
      (_player, tile) => {
        const t = tile as Phaser.Tilemaps.Tile;
        if (t.index === 2) {
          // Coin collected
          this.coinCount++;
        } else if (t.index === 3) {
          // Fruit collected — restore 1 HP
          this.playerHealth = Math.min(
            this.playerHealth + 1,
            this.maxPlayerHealth,
          );
        }
        this.collectablesLayer.putTileAt(-1, t.x, t.y);
      },
    );

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
      keyQ.removeAllListeners("down");
      keyQ.on("down", () => {
        this.startEditor();
      });

      // Add G key handler to toggle debug overlay (removeAllListeners prevents stacking on re-entry)
      const keyG = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
      keyG.removeAllListeners("down");
      keyG.on("down", () => {
        this.toggleDebugOverlay();
      });
    }

    // Create play-mode HUD (world-space, manually repositioned each frame)
    const cam = this.cameras.main;
    const baseFontSize = 18;
    const scaledFontSize = Math.max(8, baseFontSize / cam.zoom);
    const hudTopLeft = cam.getWorldPoint(16, 16);

    const initHearts =
      "♥".repeat(this.playerHealth) +
      "♡".repeat(this.maxPlayerHealth - this.playerHealth);
    this.healthText = this.add
      .text(hudTopLeft.x, hudTopLeft.y, `HP: ${initHearts}`, {
        fontSize: `${scaledFontSize}px`,
        color: "#ff4444",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setScrollFactor(1)
      .setDepth(1000);

    this.coinText = this.add
      .text(
        hudTopLeft.x,
        hudTopLeft.y + scaledFontSize + 4,
        `Coins: ${this.coinCount}`,
        {
          fontSize: `${scaledFontSize}px`,
          color: "#FFD700",
          stroke: "#000000",
          strokeThickness: 4,
        },
      )
      .setScrollFactor(1)
      .setDepth(1000);
  }

  // Toggle Phaser arcade physics hitbox overlay
  private toggleDebugOverlay() {
    const newDebugState = !this.physics.world.drawDebug;

    this.physics.world.drawDebug = newDebugState;
    if (newDebugState) {
      if (!this.physics.world.debugGraphic) {
        this.physics.world.createDebugGraphic();
      }
    } else {
      this.physics.world.debugGraphic?.clear();
    }

    console.log(`Debug overlay: ${newDebugState ? "ON" : "OFF"}`);

    // Show brief notification
    const notification = this.add.text(
      this.cameras.main.worldView.centerX,
      this.cameras.main.worldView.y + 50,
      `Debug Overlay: ${newDebugState ? "ON (Press G to disable)" : "OFF"}`,
      {
        fontSize: "16px",
        fontFamily: "monospace",
        color: newDebugState ? "#00ff00" : "#ff6600",
        backgroundColor: "#000000cc",
        padding: { x: 10, y: 5 },
      },
    );
    notification.setOrigin(0.5, 0);
    notification.setScrollFactor(0);
    notification.setDepth(2000);

    // Fade out notification
    this.time.delayedCall(2000, () => {
      this.tweens.add({
        targets: notification,
        alpha: 0,
        duration: 500,
        onComplete: () => notification.destroy(),
      });
    });
  }

  create() {
    // Setup global access for collaborative context
    if (typeof window !== "undefined") {
      (window as any).getActiveSelectionBox = () => this.activeBox;
    }

    this.game.events.on("ui:save", () => this.saveToFile());
    this.game.events.on("ui:load", () => this.loadFromFile());

    this.map = this.make.tilemap({ key: "defaultMap" });
    this.worldFacts = new WorldFacts(this);

    console.log("Map loaded:", this.map);
    const tileset = this.map.addTilesetImage(
      "pewterPlatformerTilesetExtended",
      "tileset",
      16,
      16,
      0,
      0,
    )!;

    const extrasTileset = this.map.addTilesetImage(
      "Extras",
      "extras-tileset",
      16,
      16,
      0,
      0,
    );

    this.backgroundLayer = this.map.createLayer(
      "Background_Layer",
      extrasTileset ? [tileset, extrasTileset] : tileset,
      0,
      0,
    )!;
    // console.log("LAYER1 added:", this.map);
    this.groundLayer = this.map.createLayer("Ground_Layer", tileset, 0, 0)!;
    GROUND_LAYER = this.groundLayer;
    // console.log("LAYER2 added:", this.map);
    this.collectablesLayer = this.map.createLayer(
      "Collectables_Layer",
      tileset,
      0,
      0,
    )!;
    COLLECTABLES_LAYER = this.collectablesLayer;

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

    this.worldFacts = new WorldFacts(this);
    this.worldFacts.refresh();

    // Save initial map state so undo has a baseline
    this.saveSnapshot();

    // Listen for requests to save a snapshot (e.g. before AI sends a message)
    window.addEventListener("saveWorldSnapshot", () => this.saveSnapshot());

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

    // Listen for UI toggles (chatbox C key) to also toggle the overview/minimap
    try {
      this.game.events.on("ui:toggleMinimap", (_isChatVisible?: boolean) => {
        if (this.minimap) {
          this.removeMinimap();
        } else {
          this.createMinimap();
        }
      });

      // Remove listener on shutdown to avoid duplicates
      this.events.on("shutdown", () => {
        try {
          this.game.events.off("ui:toggleMinimap");
        } catch (e) {
          // ignore
        }
      });
    } catch (e) {
      // ignore if game.events not available
    }

    // Listen for a UI request to select the current temporary selection box
    this.game.events.on("ui:selectCurrentBox", () => {
      if (this.activeBox) {
        console.log("ui:selectCurrentBox -> selecting activeBox");
        this.selectBox(this.activeBox);
      } else {
        console.log("ui:selectCurrentBox fired but no active box exists");
      }
    });

    // Listen for Event Queue Regen button
    this.game.events.on("ui:eventQueueRegen", async () => {
      console.log("ui:eventQueueRegen received");
      if (allSelectionBoxes.length === 0) {
        console.log("No selection boxes to regenerate");
        return;
      }

      try {
        await regenerate(
          allSelectionBoxes,
          this.computeDependencyMap(allSelectionBoxes),
          this.worldFacts,
          this,
        );
      } catch (err) {
        console.error("Event queue regeneration failed:", err);
      }
    });

    // Listen for UI linear regenerate requests
    this.game.events.on("ui:regenerateSelection", async () => {
      console.log("ui:regenerateSelection received");
      if (!this.activeBox) {
        console.log("No active selection to regenerate");
        this.game.events.emit("regenerate:finished", {
          success: false,
          reason: "no-active-box",
        });
        return;
      }

      // Emit started so UI can show feedback
      this.game.events.emit("regenerate:started");

      try {
        // Use linear regeneration (single active box)
        await this.regenerateSelection(this.activeBox);
        this.game.events.emit("regenerate:finished", { success: true });
      } catch (err) {
        console.error("Regeneration failed:", err);
        this.game.events.emit("regenerate:finished", {
          success: false,
          error: err,
        });
      }
    });

    // Deselect all boxes when UI asks
    this.game.events.on("ui:deselectAllBoxes", () => {
      console.log("ui:deselectAllBoxes -> deselecting all boxes");
      for (const b of allSelectionBoxes) {
        b.setActive?.(false);
      }
      if (this.activeBox) {
        this.activeBox.setActive?.(false);
      }
      this.activeBox = null;
      // Also notify chatBox to clear active selection context
      try {
        setActiveSelectionBox(null);
      } catch (e) {
        // ignore
      }
    });

    // Listen for block selection from UI
    this.game.events.on("ui:selectBlock", (blockName: string) => {
      console.log("Block selected:", blockName);
      // Map block names to tile indices
      const blockToTileMap: { [key: string]: number } = {
        "Block 1": 1,
        Coin: 2,
        Fruit: 3,
        "Grass-Half Block": 4,
        "Dirt Block": 5,
        "Grass Block": 6,
        "Question Block": 7,
        "Ultra Slime": 8,
        "Slime Enemy": 9,
        Eraser: -1,
      };

      const tileIndex = blockToTileMap[blockName];
      if (tileIndex !== undefined) {
        this.selectedTileIndex = tileIndex;
        this.selectedBlockName = blockName;
        console.log(
          `Selected tile index: ${this.selectedTileIndex}, block: ${blockName}`,
        );
      } else {
        console.warn(`Unknown block: ${blockName}`);
      }
    });

    // When the LLM invokes a tool, finalize the active selection box (if any)
    if (
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function"
    ) {
      window.addEventListener("toolCalled", (_ev: any) => {
        console.log(
          "toolCalled event received; finalizing active box if present",
        );
        const boxToFinalize = getProcessingBox() ?? this.activeBox;
        if (boxToFinalize) {
          // Mark the box as finalized (permanent)
          boxToFinalize.finalize?.();

          // Ensure it's in the permanent list
          if (!allSelectionBoxes.includes(boxToFinalize)) {
            allSelectionBoxes.push(boxToFinalize);
          }

          // Keep the box active/selected so the UI and chat context remain tied to it.
          // Do NOT clear this.activeBox or call setActiveSelectionBox(null) here.
          boxToFinalize.setActive?.(true);

          // ! idk how things work so I am going to rerender here, someone find where this should actually go if there is a better spot
          replaceAllBoxes();
        }
      });
    }

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
      this.keyN = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
      this.keyO = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.O);
      this.keyP = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
      this.keyB = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
      this.keyDelete = this.input.keyboard!.addKey(
        Phaser.Input.Keyboard.KeyCodes.DELETE,
      );
      this.keyCtrl = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.CTRL,
      );
      this.keyQ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
      this.keyZ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
      this.keyY = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Y);
    }

    // scrolling
    let isDragging = false;
    let dragStartPoint = new Phaser.Math.Vector2();

    // highlight box
    this.highlightBox = this.add.graphics();
    this.highlightBox.setDepth(101); // Ensure it's on top of everything

    // selection box
    //this.selectionBox = this.add.graphics();
    //this.selectionBox.setDepth(100); // Slightly under highlight box
    this.input.on("pointermove", this.updateSelection, this);
    this.input.on("pointerup", this.endSelection, this);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.gameActive) return;
      if (pointer.middleButtonDown()) {
        // ! might need to change this to chain of ifs instead of if else
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
        if (this.selectedBlockName === "Eraser") {
          // Eraser should clear from both layers
          this.placeTile(this.groundLayer, tileX, tileY, -1);
          this.placeTile(this.collectablesLayer, tileX, tileY, -1);
          // } else if (this.selectedBlockName === "Slime Enemy") {
          //   // Spawn actual Slime object (not a tile)
          //   const spawnX = tileX * this.map.tileWidth + this.map.tileWidth / 2;
          //   const spawnY = tileY * this.map.tileHeight + this.map.tileHeight / 2;
          //   const slime = new Slime(this, spawnX, spawnY, this.map, this.groundLayer);
          //   slime.setData("spawnX", spawnX);
          //   slime.setData("spawnY", spawnY);
          //   this.enemies.push(slime);
          // } else if (this.selectedBlockName === "Ultra Slime") {
          //   // Spawn actual UltraSlime object (not a tile)
          //   const spawnX = tileX * this.map.tileWidth + this.map.tileWidth / 2;
          //   const spawnY = tileY * this.map.tileHeight + this.map.tileHeight / 2;
          //   const ultraSlime = new UltraSlime(this, spawnX, spawnY, this.map, this.groundLayer);
          //   ultraSlime.setData("spawnX", spawnX);
          //   ultraSlime.setData("spawnY", spawnY);
          //   this.enemies.push(ultraSlime);
        } else if (this.selectedBlockName === "Coin" || this.selectedBlockName === "Fruit") {
          // Place collectable in the dedicated collectables layer
          this.placeTile(
            this.collectablesLayer,
            tileX,
            tileY,
            this.selectedTileIndex,
          );
        } else {
          // All terrain tiles go in the ground layer
          this.placeTile(
            this.groundLayer,
            tileX,
            tileY,
            this.selectedTileIndex,
          );
        }
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
      if (this.gameActive) return;
      isDragging = false;
      if (this.isPlacing) {
        this.saveSnapshot(); // save after the paint stroke completes
      }
      this.isPlacing = false;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.gameActive) return;
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

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.gameActive) return;
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

    this.keyDelete.on("down", () => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (!this.activeBox) return;
      // remove from permanent list if present
      // const idx = allSelectionBoxes.indexOf(this.activeBox);
      // if (idx !== -1) {
      //   // console.log(`try del a box, old: ${this.selectionBoxes}`);
      //   let temp = allSelectionBoxes.splice(idx, 1);
      //   // console.log(`Deleted a box, new: ${this.selectionBoxes}, rem: ${temp}`);
      // }
      // destroy visuals and resources
      this.activeBox.destroy?.();
      // clear active reference and notify any external context
      this.activeBox = null;
      try {
        // call global helper if present (legacy code referenced this earlier)
        (window as any).setActiveSelectionBox?.(null);
      } catch (e) {
        // ignore
      }
      this.saveSnapshot();
      console.log("Active selection box deleted");
    });
    //TODO: handle UI -> Editor communication
  }

  setupPlayer() {
    this.player = this.physics.add.sprite(
      100,
      100,
      "spritesheet",
      14,
    ) as PlayerSprite;

    this.player.setSize(10, 14).setOffset(3, 1);
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
      0,
      layer.tilemap.tilesets[0].total - 1,
    );
    tileIndex = tileIndex === 0 ? -1 : tileIndex; // Allow -1 for erasing tiles
    console.log(`Placing tile at (${x}, ${y}) with index ${tileIndex}`);
    if (this.activeBox) {
      if (this.activeBox.containsPoint(x, y)) {
        this.activeBox.addPlacedTile(tileIndex, x, y, layer.layer.name);
        layer.putTileAt(tileIndex, x, y);
        replaceAllBoxes();
      }
    }
    else {
      addPlacedTile(superDuperRealUserLayer, tileIndex, x, y, layer.layer.name);
      layer.putTileAt(tileIndex, x, y);
      replaceAllBoxes();
    }

  }

  update() {
    if (this.gameActive && this.player) {
      // Play mode: player movement and camera follow
      // Hide grid and red outline

      // Apply enemy damage to persistent health (only when alive)
      if (!this.isDead) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const enemy = this.enemies[i];
          if (!enemy || !enemy.active) continue; // skip dead enemies (they respawn on player death)
          this.playerHealth = enemy.update(
            this.player,
            this.playerHealth,
            this.gameActive,
          );
        }
      }

      // Update HUD (reposition and resize to stay fixed to camera top-left)
      if (this.healthText || this.coinText) {
        const hudCam = this.cameras.main;
        const baseFontSize = 18;
        const scaledFontSize = Math.max(8, baseFontSize / hudCam.zoom);
        const hudTopLeft = hudCam.getWorldPoint(16, 16);

        if (this.healthText) {
          const hearts =
            "♥".repeat(Math.max(0, this.playerHealth)) +
            "♡".repeat(Math.max(0, this.maxPlayerHealth - this.playerHealth));
          this.healthText.setText(`HP: ${hearts}`);
          this.healthText.setFontSize(scaledFontSize);
          this.healthText.setPosition(hudTopLeft.x, hudTopLeft.y);
        }
        if (this.coinText) {
          this.coinText.setText(`Coins: ${this.coinCount}`);
          this.coinText.setFontSize(scaledFontSize);
          this.coinText.setPosition(
            hudTopLeft.x,
            hudTopLeft.y + scaledFontSize + 4,
          );
        }
      }

      // Death checks — health depleted or fell off the map
      if (!this.isDead) {
        const fellOff = this.player.y > this.map.heightInPixels + 100;
        if (this.playerHealth <= 0 || fellOff) {
          this.isDead = true;
          this.resetPlayLevel();
        }
      }

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
      }
      // update the play button's position to the camera
      if (this.playButton) {
        const cam = this.cameras.main;
        this.playButton.x = cam.worldView.x + cam.worldView.width - 550;
        this.playButton.y = cam.worldView.y + 250;
      }
      // No grid/camera/block placement/editing in play mode
      this.repositionOptionsUI();
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

    // Continuous Block Placement (enemies are placed once on click, not continuously)
    // if (this.isPlacing && this.selectedBlockName !== "Slime Enemy" && this.selectedBlockName !== "Ultra Slime") {
    if (this.isPlacing) {
      const pointer = this.input.activePointer;
      const tileX = Math.floor(pointer.worldX / this.TILE_SIZE);
      const tileY = Math.floor(pointer.worldY / this.TILE_SIZE);
      if (this.selectedBlockName === "Eraser") {
        this.placeTile(this.groundLayer, tileX, tileY, -1);
        this.placeTile(this.collectablesLayer, tileX, tileY, -1);
      } else if (
        this.selectedBlockName === "Coin" ||
        this.selectedBlockName === "Fruit"
      ) {
        this.placeTile(
          this.collectablesLayer,
          tileX,
          tileY,
          this.selectedTileIndex,
        );
      } else {
        this.placeTile(this.groundLayer, tileX, tileY, this.selectedTileIndex);
      }
    }

    // Update selection box tab positions so tabs follow boxes in real-time
    for (const box of allSelectionBoxes) {
      box.updateTabPosition?.();
    }
    this.activeBox?.updateTabPosition?.();

    // Collaborative Context Merging - Update neighbor detection for all boxes
    for (const box of allSelectionBoxes) {
      if (box.updateNeighbors) {
        box.updateNeighbors(allSelectionBoxes);
      }
      if (box.updateIntersections) {
        box.updateIntersections(allSelectionBoxes);
      }
    }
    if (this.activeBox && this.activeBox.updateNeighbors) {
      this.activeBox.updateNeighbors(allSelectionBoxes);
      if (this.activeBox.updateIntersections) {
        this.activeBox.updateIntersections(allSelectionBoxes);
      }
    }

    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
      return;
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
    } else if (this.keyCtrl.isDown) {
      const zJustDown = Phaser.Input.Keyboard.JustDown(this.keyZ);
      const yJustDown = Phaser.Input.Keyboard.JustDown(this.keyY);
      if (zJustDown && !this.keyShift.isDown) {
        this.undoLastAction();
      } else if (yJustDown || (zJustDown && this.keyShift.isDown)) {
        this.redoLastAction();
      }
    } else if (Phaser.Input.Keyboard.JustDown(this.keyP)) {
      this.increaseZLevel();
    } else if (Phaser.Input.Keyboard.JustDown(this.keyO)) {
      this.decreaseZLevel();
    } else if (Phaser.Input.Keyboard.JustDown(this.keyN)) {
      this.finalizeSelectBox();
    }

    // //Temp code - Jason
    // if (Phaser.Input.Keyboard.JustDown(this.keyB)) {
    //   //Call selectionBox.ts checkTilesInBox
    //   if (this.activeBox) {
    //     this.activeBox.checkTilesInBox();
    //   }
    // }
  }

  public captureSnapshot(): WorldSnapshot {
    const groundTiles: { x: number; y: number; index: number }[] = [];
    const collectablesTiles: { x: number; y: number; index: number }[] = [];
    const gData = this.groundLayer.layer.data;
    for (let y = 0; y < gData.length; y++) {
      for (let x = 0; x < gData[y].length; x++) {
        const idx = gData[y][x].index;
        if (idx !== -1) groundTiles.push({ x, y, index: idx });
      }
    }
    const cData = this.collectablesLayer.layer.data;
    for (let y = 0; y < cData.length; y++) {
      for (let x = 0; x < cData[y].length; x++) {
        const idx = cData[y][x].index;
        if (idx !== -1) collectablesTiles.push({ x, y, index: idx });
      }
    }
    // Capture enemies
    const enemies: EnemySnapshotEntry[] = this.enemies.map((e) => {
      const spawnX = e.getData("spawnX") ?? e.x;
      const spawnY = e.getData("spawnY") ?? e.y;
      if (e instanceof DynamicEnemy) {
        return {
          kind: "Dynamic",
          spawnX,
          spawnY,
          definition: e.getDefinition(),
        };
      } else if (e instanceof UltraSlime) {
        return { kind: "UltraSlime", spawnX, spawnY };
      } else {
        return { kind: "Slime", spawnX, spawnY };
      }
    });

    // Capture selection boxes — serialize chat messages to plain objects so
    // they survive both JSON save/load and in-memory undo/redo correctly.
    const selectionBoxes: BoxSnapshot[] = allSelectionBoxes.map((b) => ({
      start: { x: b.getStart().x, y: b.getStart().y },
      end: { x: b.getEnd().x, y: b.getEnd().y },
      zLevel: b.getZLevel(),
      placedTiles: b.placedTiles.slice(),
      // placedEnemies: b.placedEnemies.slice(),
      chatHistory: b.localContext.chatHistory
        .filter((m) => m._getType?.() !== "system") // don't snapshot the system prompt
        .map((m) => ({
          type: m._getType?.() ?? "human",
          content:
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
        })),
    }));

    const userTiles = superDuperRealUserLayer.slice();

    return { groundTiles, collectablesTiles, enemies, selectionBoxes, userTiles };
  }

  public restoreSnapshot(snapshot: WorldSnapshot): void {
    const w = this.groundLayer.layer.width;
    const h = this.groundLayer.layer.height;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) this.groundLayer.putTileAt(-1, x, y);
    snapshot.groundTiles.forEach(({ x, y, index }) =>
      this.groundLayer.putTileAt(index, x, y),
    );
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) this.collectablesLayer.putTileAt(-1, x, y);
    snapshot.collectablesTiles.forEach(({ x, y, index }) =>
      this.collectablesLayer.putTileAt(index, x, y),
    );

    // Restore enemies
    this.enemies.forEach((e) => e.destroy());
    this.enemies = [];
    for (const entry of snapshot.enemies) {
      if (entry.kind === "Slime") {
        const s = new Slime(
          this,
          entry.spawnX,
          entry.spawnY,
          this.map,
          this.groundLayer,
        );
        s.setData("spawnX", entry.spawnX);
        s.setData("spawnY", entry.spawnY);
        this.enemies.push(s);
      } else if (entry.kind === "UltraSlime") {
        const u = new UltraSlime(
          this,
          entry.spawnX,
          entry.spawnY,
          this.map,
          this.groundLayer,
        );
        u.setData("spawnX", entry.spawnX);
        u.setData("spawnY", entry.spawnY);
        this.enemies.push(u);
      } else {
        const d = new DynamicEnemy(
          this,
          entry.spawnX,
          entry.spawnY,
          entry.definition,
          this.map,
          this.groundLayer,
        );
        d.setData("spawnX", entry.spawnX);
        d.setData("spawnY", entry.spawnY);
        this.enemies.push(d);
      }
    }

    // Restore superDuperRealUserLayer before destroying old boxes
    superDuperRealUserLayer.length = 0;
    for (const t of snapshot.userTiles ?? []) superDuperRealUserLayer.push(t);

    // Restore selection boxes — destroy old ones safely:
    // 1. Snapshot the array and clear references first so destroy()'s internal
    //    splice is a no-op (no mutation during iteration) and replaceAllBoxes()
    //    inside destroy() won't render stale partial state.
    // 2. Zero out placedTiles before destroy() so it doesn't erase the tile
    //    layer that was just restored from the snapshot above.
    const toDestroy = allSelectionBoxes.slice();
    if (this.activeBox && !toDestroy.includes(this.activeBox)) {
      toDestroy.push(this.activeBox);
    }
    allSelectionBoxes.length = 0;
    this.activeBox = null;
    setActiveSelectionBox(null);
    for (const b of toDestroy) {
      b.placedTiles = [];
      b.destroy?.();
    }

    for (const sd of snapshot.selectionBoxes) {
      const box = new SelectionBox(
        this,
        new Phaser.Math.Vector2(sd.start.x, sd.start.y),
        new Phaser.Math.Vector2(sd.end.x, sd.end.y),
        sd.zLevel,
        // this.groundLayer,
        (b) => this.selectBox(b),
      );
      box.placedTiles = sd.placedTiles.slice();
      // box.placedEnemies = sd.placedEnemies.slice();
      // Reconstruct proper LangChain message instances from the serialized format
      box.localContext.chatHistory = sd.chatHistory.map((m) => {
        if (m.type === "ai") return new AIMessage(m.content);
        if (m.type === "system") return new SystemMessage(m.content);
        return new HumanMessage(m.content);
      });
      box.finalize();
      // Note: constructor already pushes to allSelectionBoxes — no push needed here
    }

    this.worldFacts.refresh();
  }

  public saveSnapshot(): void {
    this.mapHistory = this.mapHistory.slice(0, this.currentMapIteration + 1);
    this.mapHistory.push(this.captureSnapshot());
    if (this.mapHistory.length > EditorScene.MAX_HISTORY) {
      this.mapHistory.splice(0, this.mapHistory.length - EditorScene.MAX_HISTORY);
    }
    this.currentMapIteration = this.mapHistory.length - 1;
  }

  undoLastAction(): boolean {
    if (this.currentMapIteration > 0) {
      this.currentMapIteration--;
      this.restoreSnapshot(this.mapHistory[this.currentMapIteration]);
      (document.getElementById("chat-input") as HTMLElement | null)?.blur();
      console.log("Undid last action");
      return true;
    }
    console.log("No action to undo");
    return false;
  }

  redoLastAction(): boolean {
    if (this.currentMapIteration < this.mapHistory.length - 1) {
      this.currentMapIteration++;
      this.restoreSnapshot(this.mapHistory[this.currentMapIteration]);
      (document.getElementById("chat-input") as HTMLElement | null)?.blur();
      console.log("Redid last action");
      return true;
    }
    console.log("No action to redo");
    return false;
  }

  public saveToFile(): void {
    // captureSnapshot already serializes everything including chat history correctly
    const snap = this.captureSnapshot();
    const payload = JSON.stringify({ version: 1, ...snap }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    a.download = `pewter-map_${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  public loadFromFile(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target!.result as string);

          // Normalise chat history entries — old saves used raw LangChain
          // serialisation ({ lc, type: "constructor", id, kwargs }); new saves
          // use plain { type, content } objects. Convert old format on the fly.
          const normBoxes = (data.selectionBoxes ?? []).map((sd: any) => ({
            ...sd,
            chatHistory: (sd.chatHistory ?? []).map((m: any) => {
              if (m.type === "constructor" && Array.isArray(m.id)) {
                const kind = m.id[m.id.length - 1] ?? "HumanMessage";
                const content = m.kwargs?.content ?? "";
                if (kind === "AIMessage") return { type: "ai", content };
                if (kind === "SystemMessage") return { type: "system", content };
                return { type: "human", content };
              }
              return m; // already in new { type, content } format
            }),
          }));

          this.restoreSnapshot({
            groundTiles: data.groundTiles ?? [],
            collectablesTiles: data.collectablesTiles ?? [],
            enemies: data.enemies ?? [],
            selectionBoxes: normBoxes,
            userTiles: data.userTiles ?? [],
          });

          this.saveSnapshot();
        } catch (err) {
          console.error("Failed to load save file:", err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  bindMapHistory(): void {
    this.saveSnapshot();
  }

  highlightTile(pointer: Phaser.Input.Pointer): void {
    // Convert screen coordinates to tile coordinates
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x: number = Math.floor(worldPoint.x / (16 * this.SCALE));
    const y: number = Math.floor(worldPoint.y / (16 * this.SCALE));

    // Only highlight if within map bounds
    if (x >= 0 && x < 36 && y >= 0 && y < 20) {
      const color = this.getHighlightColorForZLevel(this.currentZLevel);
      this.drawHighlightBox(x, y, color);
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
    /*
    if (!this.activeBox) {
      // Checking Overlapping
      const candidate = new Phaser.Geom.Rectangle(x, y, 1, 1);
      let overlap = false;
      for (const box of this.selectionBoxes) {
        const bound = box.getBounds(); // MUST be tile-space rectangle
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
        this.currentZLevel = 1;
        this.activeBox = new SelectionBox(
          this,
          this.selectionStart,
          this.selectionEnd,
          this.currentZLevel,
          this.groundLayer,
          (box) => {
            // When the tab is clicked, make this box active and update chat context
            this.selectBox(box);
          },
        );
      }
    } else {
      // Continue working with the existing active box
      this.selectionStart.set(x, y);
      this.selectionEnd.set(x, y);
      this.activeBox.updateEnd(this.selectionEnd);
    }
      this.activeBox.updateStart(this.selectionStart);
      this.activeBox.updateEnd(this.selectionEnd);
    }
    */
    // Checking Overlapping
    const candidate = new Phaser.Geom.Rectangle(x, y, 1, 1);
    let overlap = false;
    for (const box of allSelectionBoxes) {
      if (box === this.activeBox) continue; // skip the box currently being edited

      if (box.getZLevel() === this.currentZLevel) {
        // only check boxes on same level
        const bound = box.getBounds(); // MUST be tile-space rectangle
        if (SelectionBox.rectanglesOverlap(candidate, bound)) {
          console.log("Cannot create box here — overlap detected");
          overlap = true;
          break;
        }
      }
    }
    // If overlap does occur, do not make a box
    if (overlap) {
      // If the click lands inside an existing finalized box, select it instead
      for (const box of allSelectionBoxes) {
        const bound = box.getBounds();
        if (SelectionBox.rectanglesOverlap(candidate, bound)) {
          // Select this box
          console.log("Clicked existing selection — activating it.");
          this.selectBox(box);
          return;
        }
      }
      console.log("Cannot create box there!! Overlap detected!!");
      this.isSelecting = false;
      return;
    } else {
      if (!this.activeBox) {
        // If overlap does not occur, do make a new box
        console.log("Made a new box!");
        this.currentZLevel = 1;
        this.activeBox = new SelectionBox(
          this,
          this.selectionStart,
          this.selectionEnd,
          this.currentZLevel,
          // this.groundLayer,
          (box) => {
            this.selectBox(box);
          },
        );
        // Immediately make this new box active (visual + chat)
        this.selectBox(this.activeBox);
      } else {
        // If overlap does not occur, continue working with the existing active box
        this.selectionStart.set(x, y);
        this.selectionEnd.set(x, y);
        this.activeBox.updateStart(this.selectionStart);
        this.activeBox.updateEnd(this.selectionEnd);
      }
    }
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
    for (const box of allSelectionBoxes) {
      if (box.getZLevel() === this.currentZLevel) {
        // only check boxes on same level
        if (
          box !== this.activeBox &&
          SelectionBox.rectanglesOverlap(possibleBounds, box.getBounds())
        ) {
          console.log("Overlap has been detected!!");
          overlap = true;
          break;
        }
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
    console.log("ending selection");

    const sX = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const sY = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const eX = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const eY = Math.max(this.selectionStart.y, this.selectionEnd.y);

    // Finalize the box
    this.activeBox.updateEnd(this.selectionEnd);
    this.activeBox.copyTiles();
    // Swap chatbox context to this selection box
    setActiveSelectionBox(this.activeBox);

    // Make visuals reflect the selection
    this.selectBox(this.activeBox);

    // Add to permanent list
    if (!allSelectionBoxes.includes(this.activeBox)) {
      allSelectionBoxes.push(this.activeBox);
    }

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
        //`There are no notable points of interest in this selection` +
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
    if (!this.activeBox) {
      console.log("No active box to copy");
      return;
    }

    this.activeBox.copyTiles();
    const tiles = this.activeBox.getSelectedTiles();

    if (tiles.length === 0 || tiles[0].length === 0) {
      console.log("No tiles to copy");
      return;
    }

    this.clipboard = tiles.map((row) => [...row]);
    console.log(
      "Copied to clipboard:",
      this.clipboard.length,
      "x",
      this.clipboard[0]?.length,
    );
  }

  // Cutting selection of tiles function
  cutSelection() {
    if (!this.activeBox) {
      console.log("No active box to cut");
      return;
    }

    this.activeBox.copyTiles();
    const tiles = this.activeBox.getSelectedTiles();

    if (tiles.length === 0 || tiles[0].length === 0) {
      console.log("No tiles to cut");
      return;
    }

    this.clipboard = tiles.map((row) => [...row]);
    console.log(
      "Cut to clipboard:",
      this.clipboard.length,
      "x",
      this.clipboard[0]?.length,
    );

    const start = this.activeBox.getStart();
    const end = this.activeBox.getEnd();
    const sX = Math.min(start.x, end.x);
    const sY = Math.min(start.y, end.y);
    const eX = Math.max(start.x, end.x);
    const eY = Math.max(start.y, end.y);

    for (let y = sY; y <= eY; y++) {
      for (let x = sX; x <= eX; x++) {
        this.placeTile(this.groundLayer, x, y, -1); // Remove tile
      }
    }
    this.saveSnapshot();
  }

  // Pasting selection of tiles function
  pasteSelection(pointer: Phaser.Input.Pointer) {
    if (this.clipboard.length === 0) {
      console.log("No clipboard to paste");
      return;
    }

    if (!this.activeBox) {
      console.log("No active selection box to paste");
      return;
    }

    const start = this.activeBox.getStart();
    const end = this.activeBox.getEnd();
    const sX = Math.min(start.x, end.x);
    const sY = Math.min(start.y, end.y);

    // Map bounds to not exceed
    const mapWidth = this.map.width;
    const mapHeight = this.map.height;

    for (let y = 0; y < this.clipboard.length; y++) {
      for (let x = 0; x < this.clipboard[y].length; x++) {
        const tileIndex = this.clipboard[y][x][0];
        const collectablesIndex = this.clipboard[y][x][1];

        const pasteX = sX + x;
        const pasteY = sY + y;

        if (
          pasteX >= 0 &&
          pasteX < mapWidth &&
          pasteY >= 0 &&
          pasteY < mapHeight
        ) {
          if (tileIndex > 1)
            this.placeTile(this.groundLayer, pasteX, pasteY, tileIndex);
          if (tileIndex > 1)
            this.placeTile(this.collectablesLayer, pasteX, pasteY, collectablesIndex);
        }
      }
    }
    console.log(
      "Pasted to clipboard:",
      this.clipboard.length,
      "x",
      this.clipboard[0]?.length,
    );
    this.saveSnapshot();
  }

  private createOptionsButton(): void {
    const makeBtn = (
      label: string,
      onClick: () => void,
      fill = 0x222222,
      stroke = 0x444444,
      hoverStroke = 0xb3b3b3,
    ): Phaser.GameObjects.Container => {
      const txt = this.add
        .text(0, 0, label, { fontSize: "13px", color: "#ffffff" })
        .setOrigin(0.5);
      const w = Math.max(txt.width + 24, 90);
      const h = 36;
      const bg = this.add
        .rectangle(0, 0, w, h, fill)
        .setOrigin(0.5)
        .setStrokeStyle(2, stroke)
        .setInteractive({ useHandCursor: true });
      bg.on("pointerover", () => bg.setStrokeStyle(2, hoverStroke));
      bg.on("pointerout", () => bg.setStrokeStyle(2, stroke));
      bg.on("pointerup", () => onClick());
      return this.add.container(0, 0, [bg, txt]).setSize(w, h).setDepth(2000);
    };

    const toggleFn = () => {
      this.optionsPanelVisible = !this.optionsPanelVisible;
      this.optionsPanel.setVisible(this.optionsPanelVisible);
    };

    this.optionsButton = makeBtn("⚙ Options", toggleFn);

    const panelW = 290;
    const panelBg = this.add
      .rectangle(0, 0, panelW, 220, 0x111111, 0.95)
      .setOrigin(0)
      .setStrokeStyle(2, 0x666666);

    const title = this.add
      .text(panelW / 2, 14, "Options", {
        fontSize: "15px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    const controls = [
      "WASD / Arrow Keys  —  Move & Jump",
      "G  —  Toggle Debug Overlay",
      "Q  —  Exit to Editor",
    ];
    const controlTexts = controls.map((line, i) =>
      this.add.text(12, 44 + i * 22, line, {
        fontSize: "12px",
        color: "#cccccc",
      }),
    );

    const divider = this.add
      .rectangle(panelW / 2, 126, panelW - 20, 1, 0x444444)
      .setOrigin(0.5, 0);

    const exitBtn = makeBtn(
      "Exit to Editor",
      () => this.startEditor(),
      0x550000,
      0x884444,
      0xff6666,
    );
    exitBtn.setPosition(panelW / 2, 170);

    this.optionsPanel = this.add
      .container(0, 0, [panelBg, title, divider, ...controlTexts, exitBtn])
      .setDepth(1999)
      .setVisible(false);
  }

  private repositionOptionsUI(): void {
    if (!this.optionsButton) return;
    const cam = this.cameras.main;

    const screenX = 120; // pixels from left edge — change to move button
    const screenY = 135; // pixels from top edge — change to move button

    const btnPos = cam.getWorldPoint(screenX, screenY);
    this.optionsButton.setPosition(btnPos.x, btnPos.y);

    if (this.optionsPanel) {
      const panelPos = cam.getWorldPoint(screenX, screenY + 22);
      this.optionsPanel.setPosition(panelPos.x, panelPos.y);
    }
  }

  // Removed duplicate setupInput logic (all hotkey setup is handled in create)

  // ...existing code...
  // cameraMotion is already defined above, removed duplicate
  // ...existing code...

  private startEditor() {
    // Undo play mode and restore editor mode
    this.gameActive = false;

    // Disable debug overlay for all enemy types when exiting play mode
    DynamicEnemy.debugMode = false;
    Slime.debugMode = false;
    UltraSlime.debugMode = false;


    this.scene.launch("UIScene");
    this.scene.bringToTop("UIScene");
    // Stop camera follow and reset zoom
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(this.zoomLevel);

    this.createMinimap();
    // Restore minimap
    /*
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
    */

    // Remove player sprite
    if (this.player) {
      this.player.destroy();
      this.player = undefined as any;
    }
    if (this.optionsButton) {
      this.optionsButton.destroy();
      this.optionsButton = undefined as any;
    }
    if (this.optionsPanel) {
      this.optionsPanel.destroy();
      this.optionsPanel = undefined as any;
    }
    this.optionsPanelVisible = false;

    // Destroy all enemies — tiles are restored by replaceAllBoxes() below
    this.enemies.forEach((enemy) => {
      (enemy as any).clearProjectiles?.();
      enemy.destroy();
    });
    this.enemies.length = 0;

    // Reset gravity
    this.physics.world.gravity.y = 0;

    // Clear play mode controls
    this.cursors = undefined as any;
    this.wasd = undefined as any;
    this.isJumpPressed = false;

    // Destroy play-mode HUD
    if (this.healthText) {
      this.healthText.destroy();
      this.healthText = null;
    }
    if (this.coinText) {
      this.coinText.destroy();
      this.coinText = null;
    }

    // Restore collected tiles so the editor shows the original map
    for (const t of this.collectablesSnapshot) {
      this.collectablesLayer.putTileAt(t.index, t.x, t.y);
    }
    this.collectablesSnapshot = [];

    // Reset play-mode state
    this.playerHealth = this.maxPlayerHealth;
    this.coinCount = 0;
    this.isDead = false;

    // Redraw grid and highlight
    if (this.gridGraphics) this.gridGraphics.clear();
    this.drawGrid();
    if (this.highlightBox) this.highlightBox.clear();
    //if (this.selectionBox) this.selectionBox.clear();

    // Optionally, reset camera position
    this.cameras.main.centerOn(0, 0);

    // also remove the editor button


    replaceAllBoxes();
  }

  private resetPlayLevel() {
    // Brief pause so the player notices the death before the level resets
    this.time.delayedCall(600, () => {
      if (!this.gameActive) return; // aborted to editor before delay finished

      // Restore all collectable tiles from the snapshot
      for (const t of this.collectablesSnapshot) {
        this.collectablesLayer.putTileAt(t.index, t.x, t.y);
      }

      // Respawn player
      if (this.player) {
        this.player.setPosition(100, 150);
        this.player.setVelocity(0, 0);
      }

      // Reset stats
      this.playerHealth = this.maxPlayerHealth;
      this.coinCount = 0;
      this.isDead = false;

      // Respawn all enemies (including ones killed during play)
      this.enemies.forEach((enemy) => {
        const spawnX = enemy.getData("spawnX");
        const spawnY = enemy.getData("spawnY");
        if (spawnX !== undefined && spawnY !== undefined) {
          (enemy as any).respawn(spawnX, spawnY);
        }

        // Clear any lingering projectiles
        (enemy as any).clearProjectiles?.();
      });



      this.groundLayer.forEachTile((tile) => {
        if (tile.index == 8) {
          tile.index = -1;
        }
        if (tile.index == 9) {
          tile.index = -1;
        }

      })
    });
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

  // Increases the Z Level
  increaseZLevel() {
    if (!this.activeBox) return;

    const MAX_Z = Z_LEVEL_COLORS.length;

    if (this.currentZLevel < MAX_Z) {
      this.currentZLevel++;
    } else {
      console.log("Already at highest Z-Level");
    }

    let overlap = this.checkLevelOverlap(
      this.activeBox,
      allSelectionBoxes,
      this.currentZLevel,
    );

    while (overlap) {
      console.log("Skipping one Z-Level Upward");
      if (this.currentZLevel > MAX_Z) {
        this.currentZLevel = MAX_Z;
      } else {
        this.currentZLevel++;
      }
      overlap = this.checkLevelOverlap(
        this.activeBox,
        allSelectionBoxes,
        this.currentZLevel,
      );
    }

    console.log("Z-Level changed to:", this.currentZLevel);

    // If a box is being drawn, update its z-level immediately
    if (this.activeBox) {
      this.activeBox.setZLevel(this.currentZLevel);
    }
  }

  // Decreases the Z Level
  decreaseZLevel() {
    if (!this.activeBox) return;
    if (this.currentZLevel === 1) return;

    let ogZLevel = this.currentZLevel;
    this.currentZLevel--;

    let overlap = this.checkLevelOverlap(
      this.activeBox,
      allSelectionBoxes,
      this.currentZLevel,
    );

    while (overlap) {
      if (this.currentZLevel === 0) {
        break;
      }
      console.log("Skipping one Z-Level Downward");
      this.currentZLevel--;
      overlap = this.checkLevelOverlap(
        this.activeBox,
        allSelectionBoxes,
        this.currentZLevel,
      );
    }

    if (this.currentZLevel === 0) {
      console.log(
        "Impossible to decrement to available level. Going back to original.",
      );
      this.currentZLevel = ogZLevel;
    }

    console.log("Z-Level changed to:", this.currentZLevel);

    // If a box is being drawn, update its z-level immediately
    if (this.activeBox) {
      this.activeBox.setZLevel(this.currentZLevel);
    }
  }

  // Helper function: Check overlap of boxes between its Z-Levels
  checkLevelOverlap(
    activeBox: SelectionBox,
    boxes: SelectionBox[],
    zLevel: number,
  ): boolean {
    // Proposed rectangle of the active box
    const checkedRect = activeBox.getBounds();

    for (const box of boxes) {
      if (box === activeBox) continue;

      if (box.getZLevel() === zLevel) {
        // only check boxes on same level
        const bound = box.getBounds(); // MUST be tile-space rectangle
        if (SelectionBox.rectanglesOverlap(checkedRect, bound)) {
          return true;
        }
      }
    }

    return false;
  }

  // Finalize the box whenever user wants a brand new box
  finalizeSelectBox() {
    if (!this.activeBox) return;

    // Push it to the array
    if (!allSelectionBoxes.includes(this.activeBox))
      allSelectionBoxes.push(this.activeBox);
    // mark it as finalized (permanent) so it can't be redrawn; it can still be dragged via its tab
    this.activeBox.finalize?.();

    // Clear references
    // this.activeBox = null;
    this.isSelecting = false;
  }

  // Helper to set a selection box as active and update visuals/chat
  selectBox(box: SelectionBox | null) {
    if (!box) return;
    // Deactivate all boxes we know about (selectionBoxes and any current activeBox)
    console.log(`Boxes: ${allSelectionBoxes}`);
    for (const b of allSelectionBoxes) {
      b.setActive?.(false);
    }
    if (this.activeBox) {
      this.activeBox.setActive?.(false);
    }

    // activate the new box
    this.activeBox = box;
    console.log("EditorScene.selectBox activating box", box.getBounds());
    box.setActive?.(true);
    setActiveSelectionBox(box);
  }

  // Match Highlight Color with Z-Level
  getHighlightColorForZLevel(zLevel: number): number {
    if (zLevel < 1) return Z_LEVEL_COLORS[0];
    if (zLevel > Z_LEVEL_COLORS.length)
      return Z_LEVEL_COLORS[Z_LEVEL_COLORS.length - 1];

    return Z_LEVEL_COLORS[zLevel - 1];
  }

  computeDependencyMap(selections: SelectionBox[]): Map<SelectionBox, number> {
    const dependencyMap = new Map<SelectionBox, number>();

    // Initialize all with 0 dependencies
    for (const box of selections) {
      dependencyMap.set(box, 0);
    }

    // Compare each pair of boxes
    for (let i = 0; i < selections.length; i++) {
      const boxA = selections[i];
      const startA = boxA.getStart();
      const endA = boxA.getEnd();

      for (let j = 0; j < selections.length; j++) {
        if (i === j) continue;

        const boxB = selections[j];
        const startB = boxB.getStart();
        const endB = boxB.getEnd();

        // Check overlap
        const overlaps =
          startA.x <= endB.x &&
          endA.x >= startB.x &&
          startA.y <= endB.y &&
          endA.y >= startB.y;

        if (overlaps) {
          // Increment dependency count for the box with higher zLevel
          if (boxB.getZLevel() > boxA.getZLevel()) {
            dependencyMap.set(boxB, (dependencyMap.get(boxB) || 0) + 1);
          } else {
            dependencyMap.set(boxA, (dependencyMap.get(boxA) || 0) + 1);
          }
        }
      }
    }

    return dependencyMap;
  }

  // Thin wrapper that delegates regeneration to the extracted module.
  async regenerateSelection(
    box: SelectionBox,
    propagateLower: boolean = true,
    extraHiddenContext: string = "",
    visited: Set<SelectionBox> = new Set(),
  ): Promise<void> {
    try {
      await regenerateSelectionModule(
        this,
        box,
        propagateLower,
        extraHiddenContext,
        visited,
      );
    } catch (e) {
      console.warn("Regeneration (module) failed:", e);
    }
  }
}
