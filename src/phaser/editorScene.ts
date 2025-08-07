import Phaser from "phaser";
import { placeTile } from "./placeTile.ts";

export class EditorScene extends Phaser.Scene {
  private TILE_SIZE = 16;
  private map!: Phaser.Tilemaps.Tilemap;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private backgroundLayer!: Phaser.Tilemaps.TilemapLayer;
  private gridGraphics!: Phaser.GameObjects.Graphics;

  private minZoomLevel = 2.25;
  private maxZoomLevel = 10;
  private zoomLevel = 2.25;

  private minimap!: Phaser.Cameras.Scene2D.Camera;
  private minimapZoom = 0.15;

  private scrollDeadzone = 50; // pixels from the edge of the camera view to stop scrolling

  private currentTileID = 1;

  private placeTileKeys!: { [key: string]: Phaser.Input.Keyboard.Key };

  private ghostTile!: Phaser.GameObjects.Image;

  constructor() {
    super({ key: "editorScene" });
  }

  preload() {}

  create() {
    this.map = this.make.tilemap({ key: "defaultMap" });

    const tileset = this.map.addTilesetImage(
      "pewterPlatformerTileset",
      "tileset",
      16,
      16,
      0,
      0,
    )!;

    this.backgroundLayer = this.map.createLayer(
      "Background_Layer",
      tileset,
      0,
      0,
    )!;
    this.groundLayer = this.map.createLayer("Ground_Layer", tileset, 0, 0)!;

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

    // scrolling
    let isDragging = false;
    let dragStartPoint = new Phaser.Math.Vector2();

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) return; // Optional: allow only left-click
      isDragging = true;
      dragStartPoint.set(pointer.x, pointer.y);
    });

    this.input.on("pointerup", () => {
      isDragging = false;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
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
      placeTile(this.map, this.groundLayer, this.currentTileID, pointer);
    });

    this.placeTileKeys = this.input.keyboard!.addKeys({
      erase: Phaser.Input.Keyboard.KeyCodes.ONE,
      dirtBlock: Phaser.Input.Keyboard.KeyCodes.TWO,
      platformBlock: Phaser.Input.Keyboard.KeyCodes.THREE,
      itemBlock: Phaser.Input.Keyboard.KeyCodes.FOUR,
    }) as { [key: string]: Phaser.Input.Keyboard.Key };

    this.ghostTile = this.add
      .image(0, 0, "spriteSheet", this.currentTileID)
      .setAlpha(0.5)
      .setOrigin(0)
      .setDepth(40);
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

  update() {
    this.drawGrid();

    if (this.placeTileKeys.erase.isDown) {
      this.currentTileID = 1;
    } else if (this.placeTileKeys.dirtBlock.isDown) {
      this.currentTileID = 5;
    } else if (this.placeTileKeys.platformBlock.isDown) {
      this.currentTileID = 4;
    } else if (this.placeTileKeys.itemBlock.isDown) {
      this.currentTileID = 6;
    }

    let pointer = this.input.activePointer;

    let tileX = this.map.worldToTileX(pointer.worldX);
    let tileY = this.map.worldToTileY(pointer.worldY);

    let worldX = this.map.tileToWorldX(tileX!);
    let worldY = this.map.tileToWorldY(tileY!);

    this.ghostTile.setPosition(worldX!, worldY!);

    // Update the frame if the tile ID changes
    if (Number(this.ghostTile.frame.name) !== this.currentTileID - 1) {
      this.ghostTile.setFrame(this.currentTileID - 1);
    }
  }
}
