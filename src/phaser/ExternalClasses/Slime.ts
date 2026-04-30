import Phaser from "phaser";

export class Slime extends Phaser.Physics.Arcade.Sprite {
  public static debugMode: boolean = false;

  public type: string = "Slime";
  private health: number = 10;
  private maxHealth: number = 10;
  private frameCounter: number = 0;

  private fireRate: number = 100;
  private pellets: Phaser.Physics.Arcade.Sprite[] = [];
  private pelletVelocity: number = 100;

  private isFlipped = false;

  private speed: number = 20;
  private direction: number = 1; // 1 = right, -1 = left
  private spawnTileX: number;
  private readonly PATROL_TILES = 2;

  private tileSize: number;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;

  private headHitbox: Phaser.GameObjects.Zone | null = null;
  private debugText: Phaser.GameObjects.Text | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    map: Phaser.Tilemaps.Tilemap,
    groundLayer: Phaser.Tilemaps.TilemapLayer,
  ) {
    super(scene, x, y, "spritesheet", 8);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    scene.physics.add.collider(this, groundLayer);

    this.tileSize = map.tileWidth;
    this.groundLayer = groundLayer;
    this.spawnTileX = Math.floor(x / this.tileSize);

    this.headHitbox = scene.add.zone(x, y, 1, 1);
    scene.physics.add.existing(this.headHitbox);
    const headBody = this.headHitbox.body as Phaser.Physics.Arcade.Body;
    headBody.setAllowGravity(false);
    headBody.immovable = true;
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

    if (this.frameCounter % this.fireRate === 0) {
      this.shootPellet();
    }

    this.pellets = this.pellets.filter((pellet) => {
      if (!pellet || !pellet.active || !pellet.body) return false;
      if (this.scene.physics.overlap(player, pellet)) {
        playerHealth -= 1;
        pellet.destroy();
        return false;
      }
      return true;
    });

    if (this.headHitbox?.active && this.active) {
      const thisBody = this.body as Phaser.Physics.Arcade.Body;
      const headBody = this.headHitbox.body as Phaser.Physics.Arcade.Body;
      headBody.x = thisBody.x;
      headBody.y = thisBody.y;
      headBody.setSize(thisBody.width, thisBody.height * 0.4, false);
    }

    if (this.headHitbox?.active && this.scene.physics.overlap(player, this.headHitbox)) {
      const playerBody = (player as any).body as Phaser.Physics.Arcade.Body;
      playerBody.setVelocityY(-450);
      this.causeDamage(this.health);
      return playerHealth;
    }

    // --- PATROL AI ---
    const body = this.body as Phaser.Physics.Arcade.Body;
    const enemyTileX = Math.floor(this.x / this.tileSize);

    const atRightBound = this.direction > 0 && enemyTileX >= this.spawnTileX + this.PATROL_TILES;
    const atLeftBound = this.direction < 0 && enemyTileX <= this.spawnTileX - this.PATROL_TILES;

    if (atRightBound || atLeftBound || this.isLedgeAhead(this.direction)) {
      this.direction *= -1;
    }

    body.setVelocityX(this.speed * this.direction);
    this.flip(this.direction < 0);

    if (Slime.debugMode) {
      this.updateDebugOverlay(player);
    } else {
      this.hideDebugOverlay();
    }

    return playerHealth;
  }

  private isSolidTile(tileX: number, tileY: number): boolean {
    const tile = this.groundLayer.getTileAt(tileX, tileY);
    return tile !== null && tile.index !== -1;
  }

  private isLedgeAhead(direction: number): boolean {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const enemyTileX = Math.floor(this.x / this.tileSize);
    const footTileY = Math.floor(body.bottom / this.tileSize);
    const nextTileX = direction > 0 ? enemyTileX + 1 : enemyTileX - 1;
    return !this.isSolidTile(nextTileX, footTileY);
  }

  private shootPellet() {
    const pellet = this.scene.physics.add.sprite(this.x, this.y, "pellets", 1);
    pellet.setScale(2);
    pellet.body.setSize(5, 5, true);
    pellet.body.velocity.x = !this.isFlipped
      ? this.pelletVelocity
      : -this.pelletVelocity;
    pellet.body.setAllowGravity(false);
    pellet.body.setGravityY(0);
    this.pellets.push(pellet);

    this.scene.time.delayedCall(2000, () => {
      if (pellet.active) pellet.destroy();
    });
  }

  causeDamage(healthDamage: number) {
    this.health -= healthDamage;
    if (this.health <= 0) {
      this.clearProjectiles();
      if (this.headHitbox) { this.headHitbox.destroy(); this.headHitbox = null; }
      this.disableBody(true, true);
    }
  }

  respawn(x: number, y: number) {
    this.health = this.maxHealth;
    this.enableBody(true, x, y, true, true);
    this.body.velocity.x = 0;
    this.body.velocity.y = 0;
    this.spawnTileX = Math.floor(x / this.tileSize);
    this.direction = 1;
    if (!this.headHitbox) {
      this.headHitbox = this.scene.add.zone(x, y, 1, 1);
      this.scene.physics.add.existing(this.headHitbox);
      const headBody = this.headHitbox.body as Phaser.Physics.Arcade.Body;
      headBody.setAllowGravity(false);
      headBody.immovable = true;
    }
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
    this.setFlipX(flip);
  }

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
      Math.sqrt(Math.pow(player.x - this.x, 2) + Math.pow(player.y - this.y, 2)),
    );
    const dir = this.direction > 0 ? "→" : "←";
    const ledge = this.isLedgeAhead(this.direction) ? " LEDGE" : "";

    this.debugText.setText([
      `[Slime]`,
      `Dir: ${dir}${ledge}`,
      `HP: ${this.health}/${this.maxHealth}`,
      `Dist: ${distance}px`,
    ].join("\n"));
    this.debugText.setPosition(this.x, this.y - 20);

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
