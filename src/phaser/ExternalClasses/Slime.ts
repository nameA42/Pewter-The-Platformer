import Phaser from "phaser";
import { Pathfinding } from "./Pathfinding";

export class Slime extends Phaser.Physics.Arcade.Sprite {
  // Static flag to enable/disable debug overlay (shared with DynamicEnemy)
  public static debugMode: boolean = false;

  public type: string = "Slime";
  private health: number = 10;
  private maxHealth: number = 10;
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

  // Debug overlay
  private debugText: Phaser.GameObjects.Text | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    map: Phaser.Tilemaps.Tilemap,
    groundLayer: Phaser.Tilemaps.TilemapLayer,
  ) {
    super(scene, x, y, "spritesheet", 7);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    //this.setCollideWorldBounds(true);
    scene.physics.add.collider(this, groundLayer);

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

  update(
    player: Phaser.GameObjects.Sprite,
    playerHealth: number,
    active: boolean,
  ) {
    if (!active) {
      this.hideDebugOverlay();
      return playerHealth;
    }

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

    // Update debug overlay if enabled
    if (Slime.debugMode) {
      this.updateDebugOverlay(player);
    } else {
      this.hideDebugOverlay();
    }

    return playerHealth;
  }

  private shootPellet() {
    const pellet = this.scene.physics.add.sprite(this.x, this.y, "pellets", 1);
    pellet.body.velocity.x = !this.isFlipped
      ? this.pelletVelocity
      : -this.pelletVelocity;

    // Disable gravity on projectiles
    pellet.body.setAllowGravity(false);
    pellet.body.setGravityY(0);

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

  // Debug overlay methods
  private updateDebugOverlay(player: Phaser.GameObjects.Sprite) {
    if (!this.debugText) {
      this.debugText = this.scene.add.text(this.x, this.y - 40, "", {
        fontSize: "10px",
        fontFamily: "monospace",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 4, y: 2 },
        align: "center",
      });
      this.debugText.setOrigin(0.5, 1);
      this.debugText.setDepth(1001);
    }

    const distance = Math.floor(
      Math.sqrt(
        Math.pow(player.x - this.x, 2) + Math.pow(player.y - this.y, 2),
      ),
    );
    const state = this.reachedPoint ? "PATROL_WAIT" : "PATROL_MOVE";
    const direction = this.currentPatrolIndex === 0 ? "→" : "←";

    const lines = [
      `[Slime]`,
      `State: ${state} ${direction}`,
      `HP: ${this.health}/${this.maxHealth}`,
      `Dist: ${distance}px`,
    ];

    this.debugText.setText(lines.join("\n"));
    this.debugText.setPosition(this.x, this.y - 20);

    // Update color based on health
    const healthPercent = this.health / this.maxHealth;
    if (healthPercent <= 0.25) {
      this.debugText.setStyle({ backgroundColor: "#aa0000cc" });
    } else if (healthPercent <= 0.5) {
      this.debugText.setStyle({ backgroundColor: "#aa6600cc" });
    } else {
      this.debugText.setStyle({ backgroundColor: "#000000aa" });
    }
  }

  private hideDebugOverlay() {
    if (this.debugText) {
      this.debugText.destroy();
      this.debugText = null;
    }
  }

  destroy(fromScene?: boolean) {
    this.hideDebugOverlay();
    super.destroy(fromScene);
  }
}
