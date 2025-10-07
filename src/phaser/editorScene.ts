// Pewter Platformer EditorScene - Cleaned and consolidated after merge
import Phaser from "phaser";

// After imports, before the class:
type FactCounts = Record<string, number>;

type PlayerSprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  isFalling?: boolean;
};
// removed: sendUserPrompt (unused)
import { setActiveSelectionBox } from "../languageModel/chatBox";
import { Slime } from "./ExternalClasses/Slime.ts";
import { UltraSlime } from "./ExternalClasses/UltraSlime.ts";
import { UIScene } from "./UIScene.ts";
import { WorldFacts } from "./ExternalClasses/worldFacts.ts";
import { SelectionBox } from "./selectionBox.ts";

export class EditorScene extends Phaser.Scene {
  private TILE_SIZE = 16;
  private SCALE = 1.0;
  public map!: Phaser.Tilemaps.Tilemap;
  public groundLayer!: Phaser.Tilemaps.TilemapLayer;
  public collectablesLayer!: Phaser.Tilemaps.TilemapLayer;
  private backgroundLayer!: Phaser.Tilemaps.TilemapLayer;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  // removed: playButton (unused)
  private mapHistory: Phaser.Tilemaps.Tilemap[] = [];
  private currentMapIteration: number = 0;

  private minZoomLevel = 2.25;
  private maxZoomLevel = 10;
  private zoomLevel = 2.25;

  // removed: isEditMode (unused)

  private minimap: Phaser.Cameras.Scene2D.Camera | null = null;
  private minimapZoom = 0.15;

  private scrollDeadzone = 50; // pixels from the edge of the camera view to stop scrolling

  // removed: editorButton (unused)
  private scrollSpeed = 10; // pixels per second

  /// Game Variables.
  private gameActive = false;
  private player!: PlayerSprite;
  // Play mode controls
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: any;
  private isJumpPressed = false;

  private selectedTileIndex = -1; // index of the tile to place

  private isPlacing: boolean = false; // Place tile flag

  private selectedTiles: number[][] = []; // Selected Tiles

  private clipboard: number[][] = []; // Global clipboard for copy and paste

  //Selection Box Properties
  private highlightBox!: Phaser.GameObjects.Graphics;
  public selectionStart!: Phaser.Math.Vector2;
  public selectionEnd!: Phaser.Math.Vector2;
  private isSelecting: boolean = false;
  // removed: selectionBounds (unused)
  public activeBox: SelectionBox | null = null;
  private selectionBoxes: SelectionBox[] = [];

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

  // removed: setPointerOverUI (unused)

  // Removed chatBox from EditorScene

  public enemies: (Slime | UltraSlime)[] = [];

  // removed: damageKey, flipKey (unused)

  private currentZLevel: number = 1; // 1 = red, 2 = green, 3 = blue

  public worldFacts!: WorldFacts;

  // --- Selection + nesting state ---
  private allSelections = new Map<string, SelectionBox>();

  // tile -> selections that cover that tile (tile coords, not pixels)
  private tileSelIndex = new Map<string, Set<SelectionBox>>();
  private tkey(x: number, y: number) {
    return `${x},${y}`;
  }

  // removed: currentSelection (unused)

  private onFinalizeBox(box: SelectionBox) {
    this.snapshotSelection(box);
    this.indexSelection(box);
    this.linkNestingFor(box);
    this.recomputeAggFactsUpwards(box.id);
    console.log("Finalized selection:", box.id, {
      own: box.ownFacts,
      agg: box.aggFacts,
    });
  }

  private indexSelection(sel: SelectionBox) {
    const { x0, y0, x1, y1 } = sel.getTileRect();
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const k = this.tkey(tx, ty);
        if (!this.tileSelIndex.has(k)) this.tileSelIndex.set(k, new Set());
        this.tileSelIndex.get(k)!.add(sel);
      }
    }
  }

  // --- parent/child linking (tightest container wins) ---
  // Got this from GPT
  private linkNestingFor(sel: SelectionBox) {
    const others = Array.from(this.allSelections.values()).filter(
      (s) => s.id !== sel.id,
    );

    // find containers
    const containers = others.filter((s) => s.containsBox(sel));
    let parent: SelectionBox | null = null;
    let minArea = Number.POSITIVE_INFINITY;
    for (const c of containers) {
      const r = c.getTileRect();
      const area = r.w * r.h;
      if (area < minArea) {
        minArea = area;
        parent = c;
      }
    }

    if (parent) {
      if (sel.parentId) {
        const old = this.allSelections.get(sel.parentId);
        old?.childIds.delete(sel.id);
      }
      sel.parentId = parent.id;
      parent.childIds.add(sel.id);
    }
  }
  //Got this from GPT
  private recomputeAggFactsUpwards(selId: string) {
    let curId: string | null = selId;
    while (curId) {
      const cur: SelectionBox = this.allSelections.get(curId)!;
      const childFacts = Array.from(cur.childIds).map(
        (id) => this.allSelections.get(id)!.aggFacts,
      );
      cur.aggFacts = this.sumFacts(cur.ownFacts, ...childFacts);
      curId = cur.parentId;
    }
  }

  // Sums fact objects (e.g., {coin: 2, enemy: 1}) into a single aggregate object
  private sumFacts(
    ...facts: Array<Record<string, number>>
  ): Record<string, number> {
    const result: Record<string, number> = {};
    for (const factObj of facts) {
      for (const key in factObj) {
        if (factObj.hasOwnProperty(key)) {
          result[key] = (result[key] ?? 0) + factObj[key];
        }
      }
    }
    return result;
  }

  // --- tools/editor call these to record content changes ---
  private pickDeepestSelection(selections: Set<SelectionBox>): SelectionBox {
    let best: SelectionBox | null = null;
    let minArea = Number.POSITIVE_INFINITY;
    for (const s of selections) {
      const r = s.getTileRect();
      const area = r.w * r.h;
      if (area < minArea) {
        minArea = area;
        best = s;
      }
    }
    return best!;
  }

  private bumpOwnFacts(sel: SelectionBox, kind: string, delta: 1 | -1) {
    sel.ownFacts[kind] = (sel.ownFacts[kind] ?? 0) + delta;
    if (sel.ownFacts[kind] <= 0) delete sel.ownFacts[kind];
  }

  public registerPlacement(tx: number, ty: number, kind: string) {
    const k = this.tkey(tx, ty);
    const selections = this.tileSelIndex.get(k);
    if (!selections || selections.size === 0) return;
    const target = this.pickDeepestSelection(selections);
    this.bumpOwnFacts(target, kind, +1);
    this.recomputeAggFactsUpwards(target.id);
  }

  public registerRemoval(tx: number, ty: number, kind: string) {
    const k = this.tkey(tx, ty);
    const selections = this.tileSelIndex.get(k);
    if (!selections || selections.size === 0) return;
    const target = this.pickDeepestSelection(selections);
    this.bumpOwnFacts(target, kind, -1);
    this.recomputeAggFactsUpwards(target.id);
  }

  // Count existing content inside sel at finalize-time (so pre-finalize edits are captured)
  /*private seedOwnFactsFromMap(sel: SelectionBox) {
    const { x0, y0, x1, y1 } = sel.getTileRect();

    // If you want to categorize tiles, do that here. For now: any non-empty ground tile = "platform"
    let platform = 0;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.groundLayer?.getTileAt(tx, ty);
        if (t && t.index !== -1) platform++;
      }
    }

    // You can add other layers/kinds here (e.g., enemies) similarly.

    sel.ownFacts = {};
    if (platform > 0) sel.ownFacts["platform"] = platform;
  }*/

  // === Snap-shot the current world state inside a selection (tile coords) ===
  private scanSelectionFacts(sel: SelectionBox): FactCounts {
    const { x0, y0, x1, y1 } = sel.getTileRect();
    const facts: FactCounts = {};
    const bump = (k: string, n = 1) => (facts[k] = (facts[k] ?? 0) + n);

    // Count ground tiles (treat any non-empty as "platform")
    if (this.groundLayer) {
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const t = this.groundLayer.getTileAt(tx, ty);
          if (t && t.index !== -1) bump("platform");
        }
      }
    }

    // Count collectables (optional)
    if (this.collectablesLayer) {
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const t = this.collectablesLayer.getTileAt(tx, ty);
          if (t && t.index !== -1) bump("collectable");
        }
      }
    }

    // Count enemies by tile position (enemy.x/y are world pixels)
    if (this.enemies?.length) {
      for (const e of this.enemies) {
        if (!e || !e.active) continue;
        const tx = Math.floor(e.x / this.TILE_SIZE);
        const ty = Math.floor(e.y / this.TILE_SIZE);
        if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) bump("enemy");
      }
    }

    // strip zeros (just in case)
    for (const [k, v] of Object.entries(facts)) if (v <= 0) delete facts[k];
    return facts;
  }

  // Apply a fresh snapshot to a selection and reset its aggregates to match
  private snapshotSelection(sel: SelectionBox) {
    const facts = this.scanSelectionFacts(sel); // you already added scanSelectionFacts
    sel.ownFacts = facts;
    sel.aggFacts = { ...facts };
  }

  private describeFacts(facts: Record<string, number>): string {
    const parts: string[] = [];
    const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);

    if (facts.platform)
      parts.push(
        `${facts.platform} ${plural(facts.platform, "platform", "platforms")}`,
      );
    if (facts.collectable)
      parts.push(
        `${facts.collectable} ${plural(facts.collectable, "collectable", "collectables")}`,
      );
    if (facts.enemy)
      parts.push(`${facts.enemy} ${plural(facts.enemy, "enemy", "enemies")}`);

    return parts.length
      ? `Inside this selection: ${parts.join(", ")}.`
      : `No notable objects inside this selection.`;
  }

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

    //UI Scene setup
    this.scene.launch("UIScene");
    this.scene.bringToTop("UIScene");

    // Listen for a UI request to select the current temporary selection box
    this.game.events.on("ui:selectCurrentBox", () => {
      if (this.activeBox) {
        console.log("ui:selectCurrentBox -> selecting activeBox");
        this.selectBox(this.activeBox);
      } else {
        console.log("ui:selectCurrentBox fired but no active box exists");
      }
    });

    // Deselect all boxes when UI asks
    this.game.events.on("ui:deselectAllBoxes", () => {
      console.log("ui:deselectAllBoxes -> deselecting all boxes");
      for (const b of this.selectionBoxes) {
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

    // When the LLM invokes a tool, finalize the active selection box (if any)
    if (
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function"
    ) {
      window.addEventListener("toolCalled", (_ev: any) => {
        console.log(
          "toolCalled event received; finalizing active box if present",
        );
        if (this.activeBox) {
          this.activeBox.finalize?.();
          if (!this.selectionBoxes.includes(this.activeBox)) {
            this.selectionBoxes.push(this.activeBox);
          }
          // ensure visuals update
          this.activeBox.setActive?.(false);
          this.activeBox = null;
          // Clear chat context
          try {
            setActiveSelectionBox(null);
          } catch (e) {
            // ignore
          }
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
      this.keyU = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.U);
      this.keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
      this.keyN = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
      this.keyZ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
      this.keyB = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);

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
    //this.selectionBox = this.add.graphics();
    //this.selectionBox.setDepth(100); // Slightly under highlight box
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

  // removed: sendToGemini (unused)

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
    tileIndex = tileIndex === 0 ? -1 : tileIndex; // 0 -> empty

    const prev = layer.getTileAt(x, y);
    const prevIndex = prev ? prev.index : -1;

    layer.putTileAt(tileIndex, x, y);

    const kind = "platform"; // use other kinds for other layers/types if you want

    if (prevIndex !== -1 && tileIndex === -1) {
      this.registerRemoval(x, y, kind);
    } else if (prevIndex === -1 && tileIndex !== -1) {
      this.registerPlacement(x, y, kind);
    } else if (
      prevIndex !== -1 &&
      tileIndex !== -1 &&
      prevIndex !== tileIndex
    ) {
      this.registerRemoval(x, y, kind);
      this.registerPlacement(x, y, kind);
    }
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
      // removed: playButton reposition (unused)
      return;
    }

    // Editor mode: normal controls
    this.drawGrid();
    this.cameraMotion();
    // removed: playButton reposition (unused)

    // Continuous Block Placement
    if (this.isPlacing) {
      const pointer = this.input.activePointer;
      const tileX = Math.floor(pointer.worldX / this.TILE_SIZE);
      const tileY = Math.floor(pointer.worldY / this.TILE_SIZE);
      this.placeTile(this.groundLayer, tileX, tileY, this.selectedTileIndex);
    }

    // Update selection box tab positions so tabs follow boxes in real-time
    for (const box of this.selectionBoxes) {
      box.updateTabPosition?.();
    }
    this.activeBox?.updateTabPosition?.();

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
    } else if (Phaser.Input.Keyboard.JustDown(this.keyZ)) {
      this.cycleZLevel();
    } else if (Phaser.Input.Keyboard.JustDown(this.keyN)) {
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

    // Checking Overlapping
    const candidate = new Phaser.Geom.Rectangle(x, y, 1, 1);
    let overlap = false;
    for (const box of this.selectionBoxes) {
      if (box === this.activeBox) continue; // skip the box currently being edited

      if (box.getZLevel() === this.currentZLevel) {
        // only check boxes on same level
        const bound = box.getBounds(); // MUST be tile-space rectangle
        if (Phaser.Geom.Intersects.RectangleToRectangle(candidate, bound)) {
          console.log("Cannot create box here — overlap detected");
          overlap = true;
          break;
        }
      }
    }
    // If overlap does occur, do not make a box
    if (overlap) {
      // If the click lands inside an existing finalized box, select it instead
      for (const box of this.selectionBoxes) {
        const bound = box.getBounds();
        if (Phaser.Geom.Intersects.RectangleToRectangle(candidate, bound)) {
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
          this.groundLayer,
          (box) => this.selectBox(box), // onSelect
          (box) => this.onFinalizeBox(box), // <-- onFinalize (NEW)
        );
        // Keep using selectionBoxes for your UI, but also index it by id for nesting/facts
        this.allSelections.set(this.activeBox.id, this.activeBox);
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
    for (const box of this.selectionBoxes) {
      if (box.getZLevel() === this.currentZLevel) {
        // only check boxes on same level
        if (
          box !== this.activeBox &&
          Phaser.Geom.Intersects.RectangleToRectangle(
            possibleBounds,
            box.getBounds(),
          )
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

    // Finalize geometry of the box (but not the box itself; N will finalize)
    this.activeBox.updateEnd(this.selectionEnd);
    this.activeBox.copyTiles();

    // Swap chatbox context to this selection box
    setActiveSelectionBox(this.activeBox);

    // Make visuals reflect the selection
    this.selectBox(this.activeBox);

    // Add to permanent list (guard against duplicates)
    if (!this.selectionBoxes.includes(this.activeBox)) {
      this.selectionBoxes.push(this.activeBox);
    }

    // === NEW: snapshot what's currently inside the selection and describe it
    // (This works regardless of inner/outer selections.)
    this.snapshotSelection(this.activeBox); // populates ownFacts/aggFacts from a fresh scan
    const factsSummary = this.describeFacts(this.activeBox.ownFacts);

    // Size and summary
    const selectionWidth = eX - sX + 1;
    const selectionHeight = eY - sY + 1;

    let msg: string;
    if (sX === eX && sY === eY) {
      // Single-tile selection: bottom-left relative coords are (0,0)
      msg = `User selected a single tile at (0, 0) relative to the bottom-left of the selection box. ${factsSummary}`;
    } else {
      msg = `User selected a ${selectionWidth}x${selectionHeight} region with global coords [${sX}, ${sY}] to [${eX}, ${eY}]. ${factsSummary}`;
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
        const tileIndex = this.clipboard[y][x];
        if (tileIndex === -1) continue;

        const pasteX = sX + x;
        const pasteY = sY + y;

        if (
          pasteX >= 0 &&
          pasteX < mapWidth &&
          pasteY >= 0 &&
          pasteY < mapHeight
        ) {
          this.placeTile(this.groundLayer, pasteX, pasteY, tileIndex);
        }
      }
    }
    console.log(
      "Pasted to clipboard:",
      this.clipboard.length,
      "x",
      this.clipboard[0]?.length,
    );
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
    if (!this.activeBox) return;

    this.currentZLevel++;
    if (this.currentZLevel > 3) {
      this.currentZLevel = 1;
    }

    // Proposed rectangle of the active box
    const checkedRect = this.activeBox.getBounds();
    let overlap = false;

    for (const box of this.selectionBoxes) {
      if (box === this.activeBox) continue; // skip the box currently being edited

      if (box.getZLevel() === this.currentZLevel) {
        // only check boxes on same level
        const bound = box.getBounds(); // MUST be tile-space rectangle
        if (Phaser.Geom.Intersects.RectangleToRectangle(checkedRect, bound)) {
          overlap = true;
          break;
        }
      }
    }

    if (overlap) {
      console.log("Skipping one Z-Level");
      this.currentZLevel++;
      if (this.currentZLevel > 3) {
        this.currentZLevel = 1;
      }
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

    // Push it to the array
    if (!this.selectionBoxes.includes(this.activeBox)) {
      this.selectionBoxes.push(this.activeBox);
    }

    // mark it as finalized (permanent) so it can't be redrawn; it can still be dragged via its tab
    this.activeBox.finalize?.();

    // Clear references
    // this.activeBox = null;
    this.isSelecting = false;
  }

  // Helper to set a selection box as active and update visuals/chat
  // Helper to set a selection box as active and update visuals/chat
  selectBox(box: SelectionBox | null) {
    if (!box) return;

    // Deactivate others
    for (const b of this.selectionBoxes) b.setActive?.(false);
    if (this.activeBox) this.activeBox.setActive?.(false);

    // Activate new box
    this.activeBox = box;
    box.setActive?.(true);
    setActiveSelectionBox(box);

    // Re-scan facts for the newly active box and push a fresh description to UI
    this.snapshotSelection(box); // <- scan tiles/enemies now
    const factsSummary = this.describeFacts(box.ownFacts); // <- make human-readable text

    const r = box.getTileRect();
    const selectionWidth = r.w,
      selectionHeight = r.h;
    const msg = `Active selection is ${selectionWidth}x${selectionHeight} at [${r.x0}, ${r.y0}]-[${r.x1}, ${r.y1}]. ${factsSummary}`;

    const uiScene = this.scene.get("UIScene") as UIScene;
    if (uiScene && typeof uiScene.handleSelectionInfo === "function") {
      uiScene.handleSelectionInfo(msg);
    }
  }

  // Match Highlight Color with Z-Level
  getHighlightColorForZLevel(zLevel: number): number {
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
}
