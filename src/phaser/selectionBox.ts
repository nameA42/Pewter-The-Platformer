import Phaser from "phaser";

export class SelectionBox {
  private graphics: Phaser.GameObjects.Graphics;
  private start: Phaser.Math.Vector2;
  private end: Phaser.Math.Vector2;
  public getStart(): Phaser.Math.Vector2 {
    return this.start.clone();
  }
  public getEnd(): Phaser.Math.Vector2 {
    return this.end.clone();
  }
  private scene: Phaser.Scene;
  private zLevel: number;
  public selectedTiles: number[][] = [];
  private layer: Phaser.Tilemaps.TilemapLayer;
  public localContext: { chatHistory: any[] };

  constructor(
    scene: Phaser.Scene,
    start: Phaser.Math.Vector2,
    end: Phaser.Math.Vector2,
    zLevel: number = 1,
    layer: Phaser.Tilemaps.TilemapLayer,
  ) {
    this.scene = scene;
    this.start = start.clone();
    this.end = end.clone();
    this.zLevel = zLevel;
    this.layer = layer;

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(100);
    this.redraw();

    // Initialize localContext with its own chatHistory
    this.localContext = { chatHistory: [] };
  }

  getZLevel(): number {
    return this.zLevel;
  }

  updateStart(start: Phaser.Math.Vector2) {
    this.start = start.clone();
    this.redraw();
  }

  updateEnd(end: Phaser.Math.Vector2) {
    this.end = end.clone();
    this.redraw();
  }

  setZLevel(zLevel: number) {
    this.zLevel = zLevel;
    this.redraw();
  }

  private redraw() {
    this.graphics.clear();

    const startX = Math.min(this.start.x, this.end.x);
    const startY = Math.min(this.start.y, this.end.y);
    const endX = Math.max(this.start.x, this.end.x);
    const endY = Math.max(this.start.y, this.end.y);

    // Pick color based on zLevel
    const color = this.getColorForZLevel(this.zLevel);

    // Draw filled region
    this.graphics.fillStyle(color, 0.3);
    this.graphics.fillRect(
      startX * 16,
      startY * 16,
      (endX - startX + 1) * 16,
      (endY - startY + 1) * 16,
    );

    // Draw dashed border
    this.graphics.lineStyle(2, color, 1);
    this.graphics.beginPath();

    const width = endX - startX + 1;
    const height = endY - startY + 1;
    const dashLength = 8;
    const gapLength = 4;

    // Top border
    for (let i = 0; i < width * 16; i += dashLength + gapLength) {
      this.graphics.moveTo(startX * 16 + i, startY * 16);
      this.graphics.lineTo(
        Math.min(startX * 16 + i + dashLength, endX * 16 + 16),
        startY * 16,
      );
    }

    // Bottom border
    for (let i = 0; i < width * 16; i += dashLength + gapLength) {
      this.graphics.moveTo(startX * 16 + i, endY * 16 + 16);
      this.graphics.lineTo(
        Math.min(startX * 16 + i + dashLength, endX * 16 + 16),
        endY * 16 + 16,
      );
    }

    // Left border
    for (let i = 0; i < height * 16; i += dashLength + gapLength) {
      this.graphics.moveTo(startX * 16, startY * 16 + i);
      this.graphics.lineTo(
        startX * 16,
        Math.min(startY * 16 + i + dashLength, endY * 16 + 16),
      );
    }

    // Right border
    for (let i = 0; i < height * 16; i += dashLength + gapLength) {
      this.graphics.moveTo(endX * 16 + 16, startY * 16 + i);
      this.graphics.lineTo(
        endX * 16 + 16,
        Math.min(startY * 16 + i + dashLength, endY * 16 + 16),
      );
    }

    this.graphics.strokePath();
  }

  copyTiles() {
    const sX = Math.min(this.start.x, this.end.x);
    const sY = Math.min(this.start.y, this.end.y);
    const eX = Math.max(this.start.x, this.end.x);
    const eY = Math.max(this.start.y, this.end.y);

    this.selectedTiles = [];
    for (let y = sY; y <= eY; y++) {
      const row: number[] = [];
      for (let x = sX; x <= eX; x++) {
        const tile = this.layer.getTileAt(x, y);
        row.push(tile ? tile.index : -1);
      }
      this.selectedTiles.push(row);
    }
  }

  private getColorForZLevel(zLevel: number): number {
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

  // Checking the possible bounds without finalizing the update
  tempBounds(possibleEnd: Phaser.Math.Vector2): Phaser.Geom.Rectangle {
    const startX = Math.min(this.start.x, possibleEnd.x);
    const startY = Math.min(this.start.y, possibleEnd.y);
    const endX = Math.max(this.start.x, possibleEnd.x);
    const endY = Math.max(this.start.y, possibleEnd.y);

    return new Phaser.Geom.Rectangle(
      startX,
      startY,
      endX - startX,
      endY - startY,
    );
  }

  // Returns the current Bounds of that box
  getBounds(): Phaser.Geom.Rectangle {
    const startX = Math.min(this.start.x, this.end.x);
    const startY = Math.min(this.start.y, this.end.y);
    const endX = Math.max(this.start.x, this.end.x);
    const endY = Math.max(this.start.y, this.end.y);

    return new Phaser.Geom.Rectangle(
      startX,
      startY,
      endX - startX,
      endY - startY,
    );
  }

  // Returns the selected tiles
  getSelectedTiles(): number[][] {
    return this.selectedTiles;
  }

  destroy() {
    this.graphics.destroy();
  }

  // Chat history management for this selection box
  addChatMessage(msg: any) {
    this.localContext.chatHistory.push(msg);
  }

  getChatHistory(): any[] {
    return this.localContext.chatHistory;
  }

  clearChatHistory() {
    this.localContext.chatHistory.length = 0;
  }
}
