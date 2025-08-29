import Phaser from "phaser";
import { Pathfinding } from "./Pathfinding";

export class Slime extends Phaser.Physics.Arcade.Sprite {
  private health: number = 10;
  private frameCounter: number = 0;

  // pellet info
  private fireRate: number = 100;
  private pellets: Phaser.Physics.Arcade.Sprite[] = [];
  private pelletVelocity: number = 200;

  private isFlipped = false;
  private pathfinder: Pathfinding;
  private reachedPoint: boolean = true; // whether patrol point is reached
  private patrolPoints: { x: number; y: number }[] = [];
  private currentPatrolIndex: number = 0;

  private speed: number = 20;

  private patrolLength: number = 3;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    map: Phaser.Tilemaps.Tilemap,
  ) {
    super(scene, x, y, "spritesheet", 7);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    //this.setCollideWorldBounds(true);

    this.pathfinder = new Pathfinding(
      scene,
      map,
      this,
      "Ground_Layer",
      this.speed,
    );

    // define two patrol points: 3 tiles left, back to original position
    const tileSize = map.tileWidth;
    const startTile = {
      x: Math.floor(x / tileSize),
      y: Math.floor(y / tileSize),
    };
    this.patrolPoints = [
      { x: startTile.x - this.patrolLength, y: startTile.y }, // left
      { x: startTile.x, y: startTile.y }, // back to start
    ];
  }

  update(player: Phaser.GameObjects.Sprite, playerHealth: number) {
    this.frameCounter++;

    // shooting logic
    if (this.frameCounter % this.fireRate === 0) {
      this.shootPellet();
    }

    // pellet collisions with player
    this.pellets = this.pellets.filter((pellet) => {
      if (this.scene.physics.overlap(player, pellet)) {
        playerHealth--;
        pellet.destroy();
        return false;
      }
      return true;
    });

    // --- PATROL LOGIC ---
    if (this.reachedPoint) {
      // reached a patrol point → set up next path
      const start = this.patrolPoints[this.currentPatrolIndex == 1 ? 0 : 1];
      const target = this.patrolPoints[this.currentPatrolIndex];

      this.pathfinder.findPath(start.x, start.y, target.x, target.y);
      this.reachedPoint = false;

      // next target in sequence
      this.currentPatrolIndex++;
      this.currentPatrolIndex = this.currentPatrolIndex % 2;
    } else {
      // continue pathfinding
      this.reachedPoint = this.pathfinder.pathfind();
    }

    if (this.currentPatrolIndex == 0) {
      this.flip(false);
    } else if (this.currentPatrolIndex == 1) {
      this.flip(true);
    }
  }

  private shootPellet() {
    const pellet = this.scene.physics.add.sprite(this.x, this.y, "pellets", 1);
    pellet.body.velocity.x = !this.isFlipped
      ? this.pelletVelocity
      : -this.pelletVelocity;

    this.pellets.push(pellet);

    // auto-destroy after 2s
    this.scene.time.delayedCall(2000, () => {
      if (pellet.active) pellet.destroy();
    });
  }

  causeDamage(healthDamage: number) {
    this.health -= healthDamage;
    if (this.health <= 0) {
      this.destroy();
    }
  }

  getHealth() {
    return this.health;
  }

  flip(flip: boolean) {
    this.isFlipped = flip;
    this.setFlipX(flip);
  }
}
