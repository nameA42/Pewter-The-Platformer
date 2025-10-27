"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UltraSlime = void 0;
const phaser_1 = require("phaser");
const Pathfinding_1 = require("./Pathfinding");
class UltraSlime extends phaser_1.default.Physics.Arcade.Sprite {
  constructor(scene, x, y, map, groundLayer) {
    super(scene, x, y, "spritesheet", 6);
    // health
    this.health = 20;
    // essentials
    this.frameCounter = 0;
    // pellet information
    this.fireRate = 50;
    this.pellets = [];
    this.pelletVelocity = 250;
    this.megaPelletVelocity = 275;
    this.isRapidFiring = false;
    // flipped left or right
    this.isFlipped = false;
    this.reachedPoint = true; // whether patrol point is reached
    this.patrolPoints = [];
    this.currentPatrolIndex = 0;
    this.speed = 35;
    this.patrolLength = 5;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    //this.setCollideWorldBounds(true);
    scene.physics.add.collider(this, groundLayer);
    this.pathfinder = new Pathfinding_1.Pathfinding(
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
  update(player, playerHealth, active) {
    if (active) {
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
  }
  shootPellet() {
    const pellet = this.scene.physics.add.sprite(this.x, this.y, "pellets", 0);
    pellet.body.velocity.x = !this.isFlipped
      ? this.pelletVelocity
      : -this.pelletVelocity;
    this.pellets.push(pellet);
    this.scene.time.delayedCall(2000, () => pellet.destroy());
  }
  shootMegaPellet() {
    const mega = this.scene.physics.add.sprite(this.x, this.y, "pellets", 2); // Different frame
    mega.body.velocity.x = !this.isFlipped
      ? this.megaPelletVelocity
      : -this.megaPelletVelocity;
    mega.setData("isMega", true);
    this.pellets.push(mega);
    this.scene.time.delayedCall(2000, () => mega.destroy());
  }
  causeDamage(healthDamage) {
    this.health -= healthDamage;
    if (this.health <= 0) {
      this.destroy();
    }
  }
  getHealth() {
    return this.health;
  }
  flip(flip) {
    this.isFlipped = flip;
    if (this.isFlipped == true) {
      this.flipX = true;
    } else {
      this.flipX = false;
    }
  }
}
exports.UltraSlime = UltraSlime;
