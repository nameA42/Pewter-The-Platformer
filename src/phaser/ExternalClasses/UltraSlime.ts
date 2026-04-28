import Phaser from "phaser";
import { Pathfinding } from "./Pathfinding";

export class UltraSlime extends Phaser.Physics.Arcade.Sprite {
  // Static flag to enable/disable debug overlay (shared with DynamicEnemy)
  public static debugMode: boolean = false;

  public type: string = "UltraSlime";
  // health
  private health: number = 20;
  private maxHealth: number = 20;

  // essentials
  private frameCounter: number = 0;

  // pellet information
  private fireRate: number = 50;
  private pellets: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[] = [];
  private pelletVelocity: number = 125;
  private megaPelletVelocity: number = 138;
  private isRapidFiring = false;

  // flipped left or right
  private isFlipped = false;
  private pathfinder: Pathfinding;
  private reachedPoint: boolean = true; // whether patrol point is reached
  private patrolPoints: { x: number; y: number }[] = [];
  private currentPatrolIndex: number = 0;

  private speed: number = 35;

  private patrolLength: number = 5;

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
      if (!pellet || !pellet.active || !pellet.body) return false;
      if (this.scene.physics.overlap(player, pellet)) {
        const isMega = pellet.getData("isMega") === true;
        playerHealth -= isMega ? 2 : 1;
        pellet.destroy();
        return false;
      }
      return true;
    });

    // Stomp check - head hitbox only (won't trigger from side)
    {
      const playerBody = (player as any).body as Phaser.Physics.Arcade.Body;
      const thisBody = this.body as Phaser.Physics.Arcade.Body;
      if (playerBody && thisBody) {
        const hOverlap = playerBody.right > thisBody.left && playerBody.left < thisBody.right;
        const headBottom = thisBody.top + thisBody.height * 0.4;
        const onHead = playerBody.bottom >= thisBody.top - 4 && playerBody.bottom <= headBottom;
        if (hOverlap && onHead && playerBody.velocity.y > 100) {
          playerBody.setVelocityY(-450);
          this.causeDamage(this.health);
          return playerHealth;
        }
      }
    }

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
    if (UltraSlime.debugMode) {
      this.updateDebugOverlay(player);
    } else {
      this.hideDebugOverlay();
    }

    return playerHealth;
  }

  private shootPellet() {
    const pellet = this.scene.physics.add.sprite(this.x, this.y, "pellets", 0);
    pellet.setScale(2);
    pellet.body.setSize(5, 5, true);
    pellet.body.velocity.x = !this.isFlipped
      ? this.pelletVelocity
      : -this.pelletVelocity;
    pellet.body.setAllowGravity(false);
    pellet.body.setGravityY(0);
    this.pellets.push(pellet);
    this.scene.time.delayedCall(2000, () => { if (pellet.active) pellet.destroy(); });
  }

  private shootMegaPellet() {
    const mega = this.scene.physics.add.sprite(this.x, this.y, "pellets", 2);
    mega.setScale(2);
    mega.body.setSize(7, 7, true);
    mega.body.velocity.x = !this.isFlipped
      ? this.megaPelletVelocity
      : -this.megaPelletVelocity;
    mega.body.setAllowGravity(false);
    mega.body.setGravityY(0);
    mega.setData("isMega", true);
    this.pellets.push(mega);
    this.scene.time.delayedCall(2000, () => { if (mega.active) mega.destroy(); });
  }

  causeDamage(healthDamage: number) {
    this.health -= healthDamage;
    if (this.health <= 0) {
      this.clearProjectiles();
      this.disableBody(true, true);
    }
  }

  respawn(x: number, y: number) {
    this.health = this.maxHealth;
    this.enableBody(true, x, y, true, true);
    this.body.velocity.x = 0;
    this.body.velocity.y = 0;
  }

  clearProjectiles() {
    for (const pellet of this.pellets) {
      if (pellet && pellet.active) pellet.destroy();
    }
    this.pellets = [];
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
    const patrolState = this.reachedPoint ? "PATROL_WAIT" : "PATROL_MOVE";
    const fireState = this.isRapidFiring ? "RAPID_FIRE 🔥" : "NORMAL_FIRE";
    const direction = this.currentPatrolIndex === 0 ? "→" : "←";

    const lines = [
      `[UltraSlime]`,
      `Move: ${patrolState} ${direction}`,
      `Attack: ${fireState}`,
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
