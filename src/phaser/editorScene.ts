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

type PlayerSprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  isFalling?: boolean;
};

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

  private editorButton!: Phaser.GameObjects.Container;
  private scrollSpeed = 10; // pixels per second

    /// Game Variables.
  private gameActive = false;
  private player!: PlayerSprite;

  // keyboard controls
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;

  private setPointerOverUI = (v: boolean) => this.registry.set("uiPointerOver", v);
  
  constructor() {
    super({ key: "editorScene" });
  }

  
  preload() {

    this.load.setPath("phaserAssets/");
    //this.load.image("tilemap_tiles", "tilemap_packed.png");
    
    // Load as spritesheet, not image
    this.load.spritesheet("tilemap_tiles", "tilemap_packed.png", {
        frameWidth: 18,  // width of each tile
        frameHeight: 18  // height of each tile
    });

    // Load the character atlas (PNG + JSON)
    this.load.atlas("platformer_characters", "tilemap-characters-packed.png", "tilemap-characters-packed.json");

  }

  startGame() {
    this.gameActive = true;
    this.cameras.remove(this.minimap);
    this.createEditorButton();
    this.setupPlayer();
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

    

    //UI Scene setup
    this.scene.launch("UIScene");
    this.scene.bringToTop("UIScene");

    //TODO: handle UI -> Editor communication
  }

  setupPlayer()
  {
    this.player = this.add.sprite(
      100,
      200,
      "platformer_characters",
      "tile_0000.png",
    ) as PlayerSprite;
    
    /*
    //setup physics:
    this.groundLayer.setCollisionByProperty({ collides: true });
    this.physics.world.setBounds(
      0,
      0,
      this.map.widthInPixels,
      this.map.heightInPixels,
    );
    this.physics.world.gravity.y = 1500;

    this.player = this.physics.add.sprite(
      100,
      100,
      "platformer_characters",
      "tile_0000.png",
    ) as PlayerSprite;

    this.player.setCollideWorldBounds(false);
    this.player.isFalling = false;
    this.physics.add.collider(this.player, this.groundLayer);
    */

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
        case "q":
          this.startEditor();
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

    if(this.input.keyboard) {
      this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    }
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

  // Create the editor button - Shawn K
  private createEditorButton() {
    
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
    this.gameActive = false;
    this.scene.start("editorScene");
  }

}
