"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Slime = void 0;
const phaser_1 = require("phaser");
const Pathfinding_1 = require("./Pathfinding");
class Slime extends phaser_1.default.Physics.Arcade.Sprite {
  constructor(scene, x, y, map, groundLayer) {
    super(scene, x, y, "spritesheet", 7);
    this.health = 10;
    this.frameCounter = 0;
    // pellet info
    this.fireRate = 100;
    this.pellets = [];
    this.pelletVelocity = 200;
    this.isFlipped = false;
    this.reachedPoint = true; // whether patrol point is reached
    this.patrolPoints = [];
    this.currentPatrolIndex = 0;
    this.speed = 20;
    this.patrolLength = 3;
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
    console.log("is inactive");
    if (active) {
      console.log("is active");
      this.frameCounter++;
      // shooting logic
      if (this.frameCounter % this.fireRate === 0) {
        this.shootPellet();
      }
      // pellet collisions with player
      this.pellets = this.pellets.filter((pellet) => {
        // skip destroyed pellets
        if (!pellet || !pellet.body) return false;
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
  }
  shootPellet() {
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
    this.setFlipX(flip);
  }
}
exports.Slime = Slime;
