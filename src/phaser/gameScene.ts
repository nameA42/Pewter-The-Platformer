import Phaser from "phaser";

type VFX = {
  walking?: Phaser.GameObjects.Particles.ParticleEmitter;
  jump?: Phaser.GameObjects.Particles.ParticleEmitter;
};
type PlayerSprite = Phaser.Types.Physics.Arcade.SpriteWithDynamicBody & {
  isFalling?: boolean;
};

export class GameScene extends Phaser.Scene {
  private collectedItems = 0;
  isUpDown = false;
  //private readonly acceleration = 400;
  //private readonly drag = 1100;
  //private readonly jumpVelocity = -600;
  private readonly particleVelocity = 50;
  private gameScale = 2;

  private map!: Phaser.Tilemaps.Tilemap;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private coinGroup!: Phaser.GameObjects.Group;
  //private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private partCountText!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.TileSprite;
  private midground!: Phaser.GameObjects.TileSprite;
  private vfx: VFX = {};
  private player!: PlayerSprite;

  constructor() {
    super({ key: "GameScene" });
  }

  init() {
    this.collectedItems = 0;
    this.isUpDown = false;
  }

  preload(){
    this.load.setPath("phaserAssets/");
    //this.load.image("tilemap_tiles", "tilemap_packed.png");
    
    // Load as spritesheet, not image
    this.load.spritesheet("tilemap_tiles", "tilemap_packed.png", {
        frameWidth: 18,  // width of each tile
        frameHeight: 18  // height of each tile
    });

    // Load the character atlas (PNG + JSON)
    this.load.atlas("platformer_characters", "tilemap-characters-packed.png", "tilemap-characters-packed.json");

    // Add audio loading
    this.load.audio("bgm", "audio/bgm.wav");

    this.load.tilemapTiledJSON("platformer-level-1", "platformer-level-1.tmj");
  }

  create() {
    this.map = this.make.tilemap({
      key: "platformer-level-1",
      tileWidth: 18,
      tileHeight: 18,
      width: 100,
      height: 40,
    });
    const tileset = this.map.addTilesetImage(
      "kenny_tilemap_packed",
      "tilemap_tiles",
    )!;
    this.groundLayer = this.map.createLayer(
      "Ground-n-Platforms",
      tileset,
      0,
      0,
    )!;
    this.groundLayer.setCollisionByProperty({ collides: true });
    this.physics.world.setBounds(
      0,
      0,
      this.map.widthInPixels,
      this.map.heightInPixels,
    );
    this.physics.world.gravity.y = 1500;

    //Not actually coins but whatever
    const coins = this.map.createFromObjects("Objects", {
      name: "coin",
      key: "tilemap_tiles",
      frame: 151,
    });
    this.physics.world.enable(coins, Phaser.Physics.Arcade.STATIC_BODY);
    this.coinGroup = this.add.group(coins);

    this.player = this.physics.add.sprite(
      30,
      630,
      "platformer_characters",
      "tile_0000.png",
    ) as PlayerSprite;
    this.player.setCollideWorldBounds(false);
    this.player.isFalling = false;
    this.physics.add.collider(this.player, this.groundLayer);

    this.physics.add.overlap(this.player, this.coinGroup, (_obj1, obj2) => {
      obj2.destroy();
      this.sound.play("partCollect");
      this.collectedItems++;
      this.partCountText.setText(
        `Parts Collected: ${this.collectedItems} / 10`,
      );
    });

    //Debug Key bound to D
    //this.cursors = this.input.keyboard!.createCursorKeys();
    //this.input.keyboard!.on("keydown-D", () => {
    //  this.physics.world.drawDebug = !this.physics.world.drawDebug;
    //  this.physics.world.debugGraphic.clear();
    //});
    this.physics.world.drawDebug = false;

    //Gravity switch
    //this.input.keyboard!.on("keydown-G", () => this.toggleGravity(), this);

    //Dust particles while walking/Jumping
    this.vfx.walking = this.add.particles(0, 0, "kenny-particles", {
      frame: ["dirt_01.png"],
      //random: true,
      scale: { start: 0.03, end: 0.02 },
      maxAliveParticles: 8,
      lifespan: 350,
      alpha: { start: 1, end: 0.1 },
    });
    this.vfx.jump = this.add.particles(0, 0, "kenny-particles", {
      frame: ["dirt_02.png"],
      //random: true,
      scale: { start: 0.03, end: 0.2 },
      maxAliveParticles: 20,
      lifespan: 350,
      alpha: { start: 1, end: 0.1 },
    });
    this.vfx.walking.stop();
    this.vfx.jump.stop();

    this.cameras.main
      .setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels)
      .startFollow(this.player, true, 0.25, 0.25)
      .setDeadzone(50, 50)
      .setZoom(this.gameScale);

    if (!this.sound.get("bgm")?.isPlaying)
      this.sound.play("bgm", { loop: true, volume: 0.0 });

    //Parallax background
    this.background = this.add
      .tileSprite(
        0,
        0,
        this.map.widthInPixels,
        this.map.heightInPixels,
        "background",
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-90)
      .setScale(5);
    this.midground = this.add
      .tileSprite(
        0,
        0,
        this.map.widthInPixels,
        this.map.heightInPixels,
        "buildings",
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-89)
      .setScale(5);

    this.partCountText = this.add
      .text(0, 0, "Parts Collected: 0 / 10", { fontSize: "20px" })
      .setDepth(99)
      .setScrollFactor(1); //bad text that should be done better

    /*
    this.add
      .text(20, 600, "Press 'G' to\n flip gravity", { fontSize: "12px" })
      .setDepth(99);
    */

    this.cameras.main.on("cameraupdate", this.updateTextPosition, this);
    this.updateTextPosition();
  }

  update() {
    if (this.player.y > this.map.heightInPixels || this.player.y < 20)
      this.scene.restart();
    if (this.collectedItems === 10) this.scene.restart();

    if (this.player.body.blocked.down && this.player.isFalling) {
      this.sound.play("landAudio");
      this.player.isFalling = false;
    }

    this.background.tilePositionX = this.cameras.main.scrollX * 0.01;
    this.midground.tilePositionX = this.cameras.main.scrollX * 0.05;
    this.updateTextPosition();
  }

  /**
   * Moves the player in a given direction with a given force.
   * @param direction 0: left, 1: up (jump), 2: right
   * @param force The force/distance to apply in the given direction
   */
  handlePlayerMovement(direction?: number, force?: number) {
    const p = this.player;

    // Only act if direction and force are provided
    if (typeof direction === "number" && typeof force === "number") {
      let dx = 0,
        dy = 0;
      if (direction === 0)
        dx = -force * 20; // left
      else if (direction === 2)
        dx = force * 20; // right
      else if (direction === 1) dy = -force * 30; // up (jump)

      // Stop any existing tweens on the player
      this.tweens.killTweensOf(p);

      if (direction === 0 || direction === 2) {
        // Horizontal movement via tween for fixed distance
        p.anims.play("walk", true);
        p.setFlip(direction === 2, this.isUpDown);
        this.startWalkingVFX();
        this.tweens.add({
          targets: p,
          x: p.x + dx,
          duration: 200,
          onComplete: () => {
            p.setVelocityX(0);
            p.anims.play("idle");
            this.vfx.walking?.stop();
          },
        });
      } else if (direction === 1) {
        // Jump (vertical movement)
        if (p.body.blocked.down || p.body.blocked.up) {
          p.setVelocityY(-Math.abs(force) * 60);
          this.sound.play("jumpAudio");
          this.startJumpVFX();
        }
      }
    } else {
      // No movement input, play idle
      p.anims.play("idle");
      this.vfx.walking?.stop();
    }

    // Handle jump/fall animation state
    if (!p.body.blocked.down && !p.body.blocked.up) {
      p.anims.play("jump");
      p.isFalling = true;
    }
  }

  private startWalkingVFX() {
    if (!this.vfx.walking) return;
    const { x, y } = this.getPlayerFootPos();
    this.vfx.walking.startFollow(this.player, x, y, false);
    this.vfx.walking.setParticleSpeed(this.particleVelocity, 0);
    if (this.player.body.blocked.down || this.player.body.blocked.up)
      this.vfx.walking.start();
  }

  private startJumpVFX() {
    if (!this.vfx.jump) return;
    const { x, y } = this.getPlayerFootPos();
    this.vfx.jump.startFollow(this.player, x, y, false);
    this.vfx.jump.emitParticle(10);
  }

  private getPlayerFootPos() {
    const x = this.player.displayWidth / 2 - 15;
    const y = this.player.flipY
      ? this.player.displayHeight / 2 - 25
      : this.player.displayHeight / 2 - 5;
    return { x, y };
  }

  private updateTextPosition() {
    const offset = 20;
    const cam = this.cameras.main;
    const worldPoint = cam.getWorldPoint(offset, offset);
    this.partCountText.x = worldPoint.x;
    this.partCountText.y = worldPoint.y;

    const baseFontSize = 20;
    const scaledFontSize = Math.max(10, baseFontSize / cam.zoom);
    this.partCountText.setFontSize(scaledFontSize);
  }

  toggleGravity() {
    this.physics.world.gravity.y *= -1;
    this.player.flipY = !this.player.flipY;
    this.isUpDown = !this.isUpDown;
  }

  zoomMap(zoomLevel: number) {
    const clampedZoom = Phaser.Math.Clamp(zoomLevel, 0, 10);
    this.gameScale = clampedZoom; // Store the zoom level
    this.cameras.main.setZoom(clampedZoom);
    return `Game is now zoomed to level ${clampedZoom}`;
  }
}
