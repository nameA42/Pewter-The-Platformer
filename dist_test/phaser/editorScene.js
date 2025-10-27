"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditorScene = void 0;
// Pewter Platformer EditorScene - Cleaned and consolidated after merge
const phaser_1 = require("phaser");
const chatBox_1 = require("../languageModel/chatBox");
const chatBox_2 = require("../languageModel/chatBox");
const worldFacts_ts_1 = require("./ExternalClasses/worldFacts.ts");
const selectionBox_ts_1 = require("./selectionBox.ts");
class EditorScene extends phaser_1.default.Scene {
  constructor() {
    super({ key: "editorScene" });
    this.TILE_SIZE = 16;
    this.SCALE = 1.0;
    this.mapHistory = [];
    this.currentMapIteration = 0;
    this.minZoomLevel = 2.25;
    this.maxZoomLevel = 10;
    this.zoomLevel = 2.25;
    //private currentTileId = 1; // What tile to place
    this.isEditMode = false; // Toggle between drag mode and edit mode
    this.minimap = null;
    this.minimapZoom = 0.15;
    this.scrollDeadzone = 50; // pixels from the edge of the camera view to stop scrolling
    this.scrollSpeed = 10; // pixels per second
    /// Game Variables.
    this.gameActive = false;
    this.isJumpPressed = false;
    this.selectedTileIndex = -1; // index of the tile to place
    this.isPlacing = false; // Place tile flag
    this.selectedTiles = []; // Selected Tiles
    this.clipboard = []; // Global clipboard for copy and paste
    this.isSelecting = false;
    this.selectionBounds = null;
    this.activeBox = null;
    this.selectionBoxes = [];
    this.setPointerOverUI = (v) => this.registry.set("uiPointerOver", v);
    // Removed chatBox from EditorScene
    this.enemies = [];
    this.currentZLevel = 1; // 1 = red, 2 = green, 3 = blue
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
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,S,A,D");
    // Add Q key handler to quit play mode
    if (this.input.keyboard) {
      const keyQ = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.Q,
      );
      keyQ.on("down", () => {
        this.startEditor();
      });
    }
  }
  create() {
    this.map = this.make.tilemap({ key: "defaultMap" });
    this.worldFacts = new worldFacts_ts_1.WorldFacts(this);
    console.log("Map loaded:", this.map);
    const tileset = this.map.addTilesetImage(
      "pewterPlatformerTileset",
      "tileset",
      16,
      16,
      0,
      0,
    );
    // console.log("Tileset added:", this.map);
    this.backgroundLayer = this.map.createLayer(
      "Background_Layer",
      tileset,
      0,
      0,
    );
    // console.log("LAYER1 added:", this.map);
    this.groundLayer = this.map.createLayer("Ground_Layer", tileset, 0, 0);
    // console.log("LAYER2 added:", this.map);
    this.collectablesLayer = this.map.createLayer(
      "Collectables_Layer",
      tileset,
      0,
      0,
    );
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
    this.input.on("wheel", (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
      if (deltaY > 0) {
        this.zoomLevel = phaser_1.default.Math.Clamp(
          this.zoomLevel - 0.1,
          this.minZoomLevel,
          this.maxZoomLevel,
        );
      } else {
        this.zoomLevel = phaser_1.default.Math.Clamp(
          this.zoomLevel + 0.1,
          this.minZoomLevel,
          this.maxZoomLevel,
        );
      }
      this.cameras.main.setZoom(this.zoomLevel);
    });
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
    // Listen for a UI request to select the current temporary selection box
    this.game.events.on("ui:selectCurrentBox", () => {
      if (this.activeBox) {
        console.log("ui:selectCurrentBox -> selecting activeBox");
        this.selectBox(this.activeBox);
      } else {
        console.log("ui:selectCurrentBox fired but no active box exists");
      }
    });
    // Listen for UI regenerate requests
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
      for (const b of this.selectionBoxes) {
        b.setActive?.(false);
      }
      if (this.activeBox) {
        this.activeBox.setActive?.(false);
      }
      this.activeBox = null;
      // Also notify chatBox to clear active selection context
      try {
        (0, chatBox_2.setActiveSelectionBox)(null);
      } catch (e) {
        // ignore
      }
    });
    // When the LLM invokes a tool, finalize the active selection box (if any)
    if (
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function"
    ) {
      window.addEventListener("toolCalled", (_ev) => {
        console.log(
          "toolCalled event received; finalizing active box if present",
        );
        if (this.activeBox) {
          // Mark the box as finalized (permanent)
          this.activeBox.finalize?.();
          // Ensure it's in the permanent list
          if (!this.selectionBoxes.includes(this.activeBox)) {
            this.selectionBoxes.push(this.activeBox);
          }
          // Keep the box active/selected so the UI and chat context remain tied to it.
          // Do NOT clear this.activeBox or call setActiveSelectionBox(null) here.
          this.activeBox.setActive?.(true);
        }
      });
    }
    // Restore keyboard key initialization with null check
    if (this.input.keyboard) {
      this.keyA = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.A,
      );
      this.keyD = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.D,
      );
      this.keyW = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.W,
      );
      this.keyS = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.S,
      );
      this.keyShift = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.SHIFT,
      );
      this.keyC = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.C,
      );
      this.keyX = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.X,
      );
      this.keyV = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.V,
      );
      this.keyU = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.U,
      );
      this.keyR = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.R,
      );
      this.keyN = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.N,
      );
      this.keyZ = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.Z,
      );
      this.keyB = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.B,
      );
      this.keyDelete = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.DELETE,
      );
      this.keyCtrl = this.input.keyboard.addKey(
        phaser_1.default.Input.Keyboard.KeyCodes.CTRL,
      );
    }
    // scrolling
    let isDragging = false;
    let dragStartPoint = new phaser_1.default.Math.Vector2();
    // highlight box
    this.highlightBox = this.add.graphics();
    this.highlightBox.setDepth(101); // Ensure it's on top of everything
    // selection box
    //this.selectionBox = this.add.graphics();
    //this.selectionBox.setDepth(100); // Slightly under highlight box
    this.input.on("pointermove", this.updateSelection, this);
    this.input.on("pointerup", this.endSelection, this);
    this.input.on("pointerdown", (pointer) => {
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
    this.input.on("pointermove", (pointer) => {
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
    this.input.on("pointerdown", (pointer) => {
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
      if (!this.activeBox) return;
      // remove from permanent list if present
      const idx = this.selectionBoxes.indexOf(this.activeBox);
      if (idx !== -1) {
        this.selectionBoxes.splice(idx, 1);
      }
      // destroy visuals and resources
      this.activeBox.destroy?.();
      // clear active reference and notify any external context
      this.activeBox = null;
      try {
        // call global helper if present (legacy code referenced this earlier)
        window.setActiveSelectionBox?.(null);
      } catch (e) {
        // ignore
      }
      console.log("Active selection box deleted");
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
    );
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
  async sendToGemini(prompt) {
    return await (0, chatBox_1.sendUserPrompt)(prompt);
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
  placeTile(layer, x, y, tileIndex) {
    tileIndex = phaser_1.default.Math.Clamp(
      tileIndex,
      0,
      layer.tilemap.tilesets[0].total - 1,
    );
    tileIndex = tileIndex === 0 ? -1 : tileIndex; // Allow -1 for erasing tiles
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
            velocityX = phaser_1.default.Math.Clamp(
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
    // Update selection box tab positions so tabs follow boxes in real-time
    for (const box of this.selectionBoxes) {
      box.updateTabPosition?.();
    }
    this.activeBox?.updateTabPosition?.();
    if (
      phaser_1.default.Input.Keyboard.JustDown(this.keyC) &&
      this.keyCtrl.isDown
    ) {
      this.copySelection();
      console.log("Copied selection");
    } else if (
      phaser_1.default.Input.Keyboard.JustDown(this.keyX) &&
      this.keyCtrl.isDown
    ) {
      this.cutSelection();
      console.log("Cut selection");
    } else if (
      phaser_1.default.Input.Keyboard.JustDown(this.keyV) &&
      this.keyCtrl.isDown
    ) {
      const pointer = this.input.activePointer;
      this.pasteSelection(pointer);
      console.log("Pasted selection");
    } else if (
      phaser_1.default.Input.Keyboard.JustDown(this.keyU) &&
      this.keyCtrl.isDown
    ) {
      this.undoLastAction();
      console.log("Undid last action");
    } else if (
      phaser_1.default.Input.Keyboard.JustDown(this.keyR) &&
      this.keyCtrl.isDown
    ) {
      this.redoLastAction();
      console.log("Redid last action");
    } else if (phaser_1.default.Input.Keyboard.JustDown(this.keyZ)) {
      this.cycleZLevel();
    } else if (phaser_1.default.Input.Keyboard.JustDown(this.keyN)) {
      this.finalizeSelectBox();
    }
  }
  undoLastAction() {
    if (this.currentMapIteration > 0) {
      this.currentMapIteration--;
      this.map = this.mapHistory[this.currentMapIteration];
      console.log("Undid last action");
    } else {
      console.log("No action to undo");
    }
  }
  redoLastAction() {
    if (this.currentMapIteration < this.mapHistory.length - 1) {
      this.currentMapIteration++;
      this.map = this.mapHistory[this.currentMapIteration];
      console.log("Redid last action");
    } else {
      console.log("No action to redo");
    }
  }
  bindMapHistory() {
    // Only keep history up to the current iteration
    this.mapHistory = this.mapHistory.slice(0, this.currentMapIteration + 1);
    this.mapHistory.push(this.map);
    this.currentMapIteration = this.mapHistory.length - 1;
  }
  highlightTile(pointer) {
    // Convert screen coordinates to tile coordinates
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor(worldPoint.x / (16 * this.SCALE));
    const y = Math.floor(worldPoint.y / (16 * this.SCALE));
    // Only highlight if within map bounds
    if (x >= 0 && x < 36 && y >= 0 && y < 20) {
      const color = this.getHighlightColorForZLevel(this.currentZLevel);
      this.drawHighlightBox(x, y, color);
    } else {
      // Clear highlight if out of bounds
      this.highlightBox.clear();
    }
  }
  drawHighlightBox(x, y, color) {
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
  startSelection(pointer) {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor(worldPoint.x / this.TILE_SIZE);
    const y = Math.floor(worldPoint.y / this.TILE_SIZE);
    this.selectionStart = new phaser_1.default.Math.Vector2(x, y);
    this.selectionEnd = new phaser_1.default.Math.Vector2(x, y);
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
    const candidate = new phaser_1.default.Geom.Rectangle(x, y, 1, 1);
    let overlap = false;
    for (const box of this.selectionBoxes) {
      if (box === this.activeBox) continue; // skip the box currently being edited
      if (box.getZLevel() === this.currentZLevel) {
        // only check boxes on same level
        const bound = box.getBounds(); // MUST be tile-space rectangle
        if (
          phaser_1.default.Geom.Intersects.RectangleToRectangle(
            candidate,
            bound,
          )
        ) {
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
        if (
          phaser_1.default.Geom.Intersects.RectangleToRectangle(
            candidate,
            bound,
          )
        ) {
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
        this.activeBox = new selectionBox_ts_1.SelectionBox(
          this,
          this.selectionStart,
          this.selectionEnd,
          this.currentZLevel,
          this.groundLayer,
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
  updateSelection(pointer) {
    if (!this.isSelecting || !this.activeBox) return;
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor(worldPoint.x / this.TILE_SIZE);
    const y = Math.floor(worldPoint.y / this.TILE_SIZE);
    // Now checking whether if any finalized boxes overlap with current one
    const possibleEnd = new phaser_1.default.Math.Vector2(x, y);
    const possibleBounds = this.activeBox.tempBounds(possibleEnd);
    let overlap = false;
    for (const box of this.selectionBoxes) {
      if (box.getZLevel() === this.currentZLevel) {
        // only check boxes on same level
        if (
          box !== this.activeBox &&
          phaser_1.default.Geom.Intersects.RectangleToRectangle(
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
    // Finalize the box
    this.activeBox.updateEnd(this.selectionEnd);
    this.activeBox.copyTiles();
    // Swap chatbox context to this selection box
    (0, chatBox_2.setActiveSelectionBox)(this.activeBox);
    // Make visuals reflect the selection
    this.selectBox(this.activeBox);
    // Add to permanent list
    if (!this.selectionBoxes.includes(this.activeBox)) {
      this.selectionBoxes.push(this.activeBox);
    }
    // These define the height and width of the selection box
    const selectionWidth = eX - sX + 1;
    const selectionHeight = eY - sY + 1;
    // Helper to convert any global (x, y) to selection-local coordinates
    const toSelectionCoordinates = (x, y) => {
      return {
        x: x - sX,
        y: eY - y,
      };
    };
    let msg;
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
    const uiScene = this.scene.get("UIScene");
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
  pasteSelection(pointer) {
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
  startEditor() {
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
      this.player = undefined;
    }
    // Reset gravity
    this.physics.world.gravity.y = 0;
    // Clear play mode controls
    this.cursors = undefined;
    this.wasd = undefined;
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
  createMinimap() {
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
  removeMinimap() {
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
        if (
          phaser_1.default.Geom.Intersects.RectangleToRectangle(
            checkedRect,
            bound,
          )
        ) {
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
    this.selectionBoxes.push(this.activeBox);
    // mark it as finalized (permanent) so it can't be redrawn; it can still be dragged via its tab
    this.activeBox.finalize?.();
    // Clear references
    // this.activeBox = null;
    this.isSelecting = false;
  }
  // Helper to set a selection box as active and update visuals/chat
  selectBox(box) {
    if (!box) return;
    // Deactivate all boxes we know about (selectionBoxes and any current activeBox)
    for (const b of this.selectionBoxes) {
      b.setActive?.(false);
    }
    if (this.activeBox) {
      this.activeBox.setActive?.(false);
    }
    // activate the new box
    this.activeBox = box;
    console.log("EditorScene.selectBox activating box", box.getBounds());
    box.setActive?.(true);
    (0, chatBox_2.setActiveSelectionBox)(box);
  }
  // Match Highlight Color with Z-Level
  getHighlightColorForZLevel(zLevel) {
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
  // Simple stub regenerate implementation for UI demo: fills the active box with a demo tile
  async regenerateSelection(box) {
    if (!box) throw new Error("No box provided");
    // Save map history for undo
    try {
      this.bindMapHistory();
    } catch (e) {
      // ignore
    }
    // Get bounds
    const start = box.getStart();
    const end = box.getEnd();
    const sX = Math.min(start.x, end.x);
    const sY = Math.min(start.y, end.y);
    const eX = Math.max(start.x, end.x);
    const eY = Math.max(start.y, end.y);
    // Clear tiles in the selection on the selection's layer
    const layer = box.getLayer();
    for (let y = sY; y <= eY; y++) {
      for (let x = sX; x <= eX; x++) {
        if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height)
          continue;
        this.placeTile(layer, x, y, -1);
      }
    }
    // Ask model to regenerate based on the most recent user message in the box's chat history
    // Get latest human/user message from the selection box chat history, if present
    let lastUserMessage = "";
    try {
      const chatHistory = box.getChatHistory ? box.getChatHistory() : [];
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        const msg = chatHistory[i];
        if (msg && typeof msg._getType === "function") {
          const t = String(msg._getType()).toLowerCase();
          if (t === "human" || t === "user") {
            lastUserMessage =
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content);
            break;
          }
        }
      }
    } catch (e) {
      lastUserMessage = "";
    }
    // include theme intent if available to guide regeneration
    const themeIntent =
      typeof box.getThemeIntent === "function" ? box.getThemeIntent() : "";
    const hiddenContext = `SELECTION_BOUNDS:${sX},${sY},${eX},${eY};LAYER:${layer.layer.name};THEME:${themeIntent}`;
    // Ask the LLM for a tile matrix. Expected response: JSON array of arrays matching height x width
    let tileMatrix = null;
    try {
      const userPrompt =
        lastUserMessage ||
        `Regenerate tiles for selection (${sX},${sY})-(${eX},${eY})`;
      const replyText = await (0, chatBox_1.sendUserPromptWithContext)(
        userPrompt,
        hiddenContext,
      );
      // Try to parse JSON in the replyText
      try {
        const parsed = JSON.parse(replyText);
        if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
          tileMatrix = parsed;
        }
      } catch (e) {
        // not valid JSON — fall through to fallback
      }
    } catch (e) {
      console.warn("Model call failed during regeneration:", e);
    }
    if (tileMatrix) {
      // tileMatrix is expected to be rows from top-to-bottom or bottom-to-top? We'll assume top-to-bottom mapping to selection coords.
      const height = tileMatrix.length;
      const width = tileMatrix[0]?.length || 0;
      for (let ry = 0; ry < height; ry++) {
        for (let rx = 0; rx < width; rx++) {
          const tileIdx = tileMatrix[ry][rx];
          const worldX = sX + rx;
          const worldY = sY + ry;
          if (
            worldX < 0 ||
            worldY < 0 ||
            worldX >= this.map.width ||
            worldY >= this.map.height
          )
            continue;
          this.placeTile(layer, worldX, worldY, tileIdx);
        }
      }
    } else {
      // Fallback: fill with demo tile 1
      const demoTileIndex = 1;
      for (let y = sY; y <= eY; y++) {
        for (let x = sX; x <= eX; x++) {
          if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height)
            continue;
          this.placeTile(layer, x, y, demoTileIndex);
        }
      }
    }
    // update box tile cache
    try {
      box.copyTiles();
    } catch (e) {
      // ignore
    }
  }
}
exports.EditorScene = EditorScene;
