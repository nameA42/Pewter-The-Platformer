import EasyStar from "easystarjs";

export class Pathfinding {
  private easystar: EasyStar.js;
  private grid: number[][];
  private walkables: number[];
  private width: number;
  private height: number;
  private layer: Phaser.Tilemaps.TilemapLayer;
  private sprite: Phaser.Physics.Arcade.Sprite;
  private tileSize: number;
  private currentPath: { x: number; y: number }[] = [];
  private targetReached: boolean = true;
  private nextPointIndex: number = 0;
  private speed: number = 0;

  constructor(
    scene: Phaser.Scene,
    map: Phaser.Tilemaps.Tilemap,
    sprite: Phaser.Physics.Arcade.Sprite,
    layerName: string = "Ground_Layer",
    speed: number,
  ) {
    this.sprite = sprite;
    this.grid = [];
    this.walkables = [];
    this.layer = map.getLayer(layerName)!.tilemapLayer;
    this.width = map.width;
    this.height = map.height;
    this.tileSize = map.tileWidth;
    this.speed = speed;

    // for (let y = 0; y < this.height; y++) {
    //     this.grid.push([]);
    //     for (let x = 0; x < this.width; x++) {
    //         const tile = this.layer.getTileAt(x, y);
    //         const below = this.layer.getTileAt(x, y + 1);

    //         if (!tile && below) {
    //         this.grid[y].push(0); // walkable
    //         } else {
    //         this.grid[y].push(1); // blocked
    //         }
    //     }
    // }

    this.grid = [];
    for (let y = 0; y < this.height; y++) {
      const col = [];
      for (let x = 0; x < this.width; x++) {
        const tile = this.layer.getTileAt(x, y);
        const below = this.layer.getTileAt(x, y + 1);

        if (!tile && below) {
          col.push(0); // walkable
        } else {
          col.push(1); // blocked
        }
      }
      this.grid.push(col);
    }

    this.walkables = [0];
    this.easystar = new EasyStar.js();
    this.easystar.setGrid(this.grid);
    this.easystar.setAcceptableTiles(this.walkables);
  }

  public findPath(startX: number, startY: number, endX: number, endY: number) {
    this.targetReached = false; // start moving again
    this.nextPointIndex = 0;

    this.easystar.findPath(startX, startY, endX, endY, (path) => {
      if (!path || path.length === 0) {
        console.warn("Path was not found.");
      } else {
        this.currentPath = path;
      }
    });
  }

  /**
   * Moves the sprite along the path toward (endX, endY).
   * Returns true once reached, false otherwise.
   */
  public pathfind() {
    // If we already have an active path, continue moving
    if (!this.targetReached && this.currentPath.length > 0) {
      this.updateMovement();
      return false;
    }

    // If we already reached last target, return true
    if (this.targetReached) {
      this.currentPath = [];
      this.nextPointIndex = 0;
      return true;
    }

    // Otherwise still moving, but no path → return false

    this.easystar.calculate();
    return false;
  }

  private updateMovement() {
    if (this.currentPath.length === 0) {
      this.targetReached = true;
      this.sprite.setVelocity(0, 0);
      return;
    }

    if (this.nextPointIndex >= this.currentPath.length) {
      this.targetReached = true;
      this.sprite.setVelocity(0, 0);
      return;
    }

    const nextPoint = this.currentPath[this.nextPointIndex];

    // Convert tile coords → world coords (center of tile)
    const targetX = nextPoint.x * this.tileSize + this.tileSize / 2;
    const targetY = nextPoint.y * this.tileSize + this.tileSize / 2;

    const dx = targetX - this.sprite.x;
    const dy = targetY - this.sprite.y;

    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 0.5) {
      // close enough → snap to tile & move to next
      this.sprite.setVelocity(0, 0);
      this.sprite.setPosition(targetX, targetY);
      this.nextPointIndex++;
      return;
    }

    // Normalize velocity
    const vx = (dx / distance) * this.speed;
    const vy = (dy / distance) * this.speed;
    this.sprite.setVelocity(vx, vy);
  }

  public isTileStandable(x: number, y: number): boolean {
    if (y + 1 >= this.grid.length || x < 0 || x >= this.grid[0].length)
      return false;
    return this.grid[y][x] === 0 && this.grid[y + 1][x] === 1;
  }
}
