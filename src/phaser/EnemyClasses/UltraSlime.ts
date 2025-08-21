import Phaser from "phaser";
import { Pathfinding } from "./Pathfinding";

export class UltraSlime extends Phaser.Physics.Arcade.Sprite {
  // health
  private health: number = 20;

  // essentials
  private frameCounter: number = 0;

  // pellet information
  private fireRate: number = 50;
  private pellets: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[] = [];
  private pelletVelocity: number = 250;
  private megaPelletVelocity: number = 275;
  private isRapidFiring = false;

  // flipped left or right
  private isFlipped = false;
  private pathfinder: Pathfinding;
  private reachedPoint: boolean = true; // whether patrol point is reached
  private patrolPoints: { x: number; y: number }[] = [];
  private currentPatrolIndex: number = 0;

  private speed: number = 35;

  private patrolLength: number = 5;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    map: Phaser.Tilemaps.Tilemap,
  ) {
    super(scene, x, y, "spritesheet", 6);

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

    if (this.frameCounter > 100 && this.frameCounter <= 200) {
      this.isRapidFiring = true;
    } else if (this.frameCounter <= 100) {
      this.isRapidFiring = false;
    } else if (this.frameCounter > 200) {
      this.frameCounter = 0;
    }

    if (this.isRapidFiring == false) {
      if (this.frameCounter % this.fireRate === 0) {
        this.shootPellet();
      }
    } else {
      if ((this.frameCounter % this.fireRate) / 10 === 0) {
        this.shootMegaPellet();
      }
    }

    this.pellets = this.pellets.filter((pellet) => {
      this.scene.physics.add.overlap(player, pellet, () => {
        const isMega = pellet.getData("isMega") === true;
        playerHealth -= isMega ? 5 : 2;
        pellet.destroy();
      });
      return playerHealth;
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
    const pellet = this.scene.physics.add.sprite(this.x, this.y, "pellets", 0);
    pellet.body.velocity.x = !this.isFlipped
      ? this.pelletVelocity
      : -this.pelletVelocity;
    this.pellets.push(pellet);
    this.scene.time.delayedCall(2000, () => pellet.destroy());
  }

  private shootMegaPellet() {
    const mega = this.scene.physics.add.sprite(this.x, this.y, "pellets", 2); // Different frame
    mega.body.velocity.x = !this.isFlipped
      ? this.megaPelletVelocity
      : -this.megaPelletVelocity;
    mega.setData("isMega", true);
    this.pellets.push(mega);
    this.scene.time.delayedCall(2000, () => mega.destroy());
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

    if (this.isFlipped == true) {
      this.flipX = true;
    } else {
      this.flipX = false;
    }
  }
}
