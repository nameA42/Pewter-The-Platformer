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
  private backgroundLayer!: Phaser.Tilemaps.TilemapLayer;
  private coinGroup!: Phaser.GameObjects.Group;
  //private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private partCountText!: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.TileSprite;
  private midground!: Phaser.GameObjects.TileSprite;
  private vfx: VFX = {};
  private player!: PlayerSprite;
  private editorButton!: Phaser.GameObjects.Text;

  private readonly PLAYER_SPEED = 400;   // Player run speed
  private readonly JUMP_VELOCITY = -550; // Player jump height
  private readonly ACCELERATION = 1500;  // Rate the player gets to max speed
  private readonly FRICTION = 1200;      // Rate the player slows down
  private readonly AIR_CONTROL = 0.8;    // % of ground control while in the air

  private isJumpPressed = false;

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
    // Add keyboard controls
    const cursors = this.input.keyboard!.createCursorKeys();
    const wasd = this.input.keyboard!.addKeys('W,S,A,D');

    // Store references
    this.cursors = cursors;
    this.wasd = wasd;

    /*
    this.map = this.make.tilemap({
      key: "platformer-level-1",
      tileWidth: 18,
      tileHeight: 18,
      width: 100,
      height: 40,
    });
    */

    this.map = this.make.tilemap({ key: "defaultMap" });

    /*
    const tileset = this.map.addTilesetImage(
      "kenny_tilemap_packed",
      "tilemap_tiles",
    )!;
    */

    const tileset = this.map.addTilesetImage(
      "pewterPlatformerTileset",
      "tileset",
      16,
      16,
      0,
      0,
    )!;

    // Create ground and background layer
    this.backgroundLayer = this.map.createLayer(
      "Background_Layer",
      tileset,
      0,
      0,
    )!;

    this.groundLayer = this.map.createLayer(
      "Ground_Layer", 
      tileset,
      0,
      0,
    )!;

    if (!this.groundLayer) {
        console.error('GROUND LAYER FAILED TO CREATE!');
        console.log('Available layers:', this.map.layers.map(l => l.name));
        return; // Stop execution
    }

    // Gives everything in the ground layer collision except empty tiles
    this.groundLayer.setCollisionByExclusion([-1]);

    if (this.groundLayer.layer.data[19]) { // Check bottom row
      console.log('Bottom row tile data:', this.groundLayer.layer.data[19].slice(0, 5)); // First 5 tiles
    }

    console.log('Checking tile collision after setting...');
    const testTile = this.groundLayer.getTileAt(10, 15); // Check a tile in the ground area
    if (testTile) {
      console.log('Test tile ID:', testTile.index, 'Collides:', testTile.collides);
    }

    console.log('Ground layer exists:', !!this.groundLayer);
    console.log('Ground layer data:', this.groundLayer.layer.data);
    console.log('Map layers:', this.map.layers.map(layer => layer.name));



    this.physics.world.setBounds(
      0,
      0,
      this.map.widthInPixels,
      this.map.heightInPixels,
    );
    this.physics.world.gravity.y = 1500;

    /*
    //Not actually coins but whatever
    const coins = this.map.createFromObjects("Objects", {
      name: "coin",
      key: "tilemap_tiles",
      frame: 151,
    });
    this.physics.world.enable(coins, Phaser.Physics.Arcade.STATIC_BODY);
    this.coinGroup = this.add.group(coins);
    */

    /*
    this.player = this.physics.add.sprite(
      30,
      630,
      "platformer_characters",
      "tile_0000.png",
    ) as PlayerSprite;
    */

    if (!this.textures.exists('player-temp')) {
      this.add.graphics()
        .fillStyle(0xff0000)
        .fillRect(0, 0, 16, 16)
        .generateTexture('player-temp', 16, 16)
        .destroy();
    }

    this.player = this.physics.add.sprite(100, 150, 'player-temp') as PlayerSprite;

    this.player.setCollideWorldBounds(false);
    this.player.isFalling = false;

    this.player.setDrag(0, 0);
    this.player.setMaxVelocity(this.PLAYER_SPEED * 1.2, 800);

    // this.cameras.main.centerOn(this.player.x, this.player.y);
    console.log('Player created at:', this.player.x, this.player.y);
    console.log('Player visible:', this.player.visible);
    console.log('Map height:', this.map.heightInPixels);
    console.log('Camera bounds:', this.cameras.main.getBounds());

    this.cameras.main
      .setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels)
      .startFollow(this.player, true, 0.25, 0.25)
      .setDeadzone(50, 50)
      .setZoom(2.25);

    this.cameras.main.useBounds = true;

    console.log('Camera scroll:', this.cameras.main.scrollX, this.cameras.main.scrollY);
    console.log('Camera zoom:', this.cameras.main.zoom);

    // Make sure player is big enough to see and positioned well
    this.player.setScale(2); // Make it bigger
    this.player.setTint(0xff0000); // Make sure it's red

    this.physics.add.collider(this.player, this.groundLayer);


    /* coin collision
    this.physics.add.overlap(this.player, this.coinGroup, (_obj1, obj2) => {
      obj2.destroy();
      this.sound.play("partCollect");
      this.collectedItems++;
      this.partCountText.setText(
        `Parts Collected: ${this.collectedItems} / 10`,
      );
    });
    */

    //Debug Key bound to D
    //this.cursors = this.input.keyboard!.createCursorKeys();
    //this.input.keyboard!.on("keydown-D", () => {
    //  this.physics.world.drawDebug = !this.physics.world.drawDebug;
    //  this.physics.world.debugGraphic.clear();
    //});
    this.physics.world.drawDebug = true;

    //Gravity switch
    //this.input.keyboard!.on("keydown-G", () => this.toggleGravity(), this);

    /*
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
    */

    // DEBUG: Check camera
    //console.log('Camera following:', this.cameras.main.followTarget);
    console.log('Player depth:', this.player.depth);

    /* sound
    if (!this.sound.get("bgm")?.isPlaying)
      this.sound.play("bgm", { loop: true, volume: 0.0 });
    */
    
    /*
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
      */

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

    // editor button
    this.createEditorButton();
  }

  update() {
    this.handlePlayerMovement();
    this.updateTextPosition();

    // update the edit button's position to the camera
    if (this.editorButton) {
      const cam = this.cameras.main;
      this.editorButton.x = cam.worldView.x + cam.worldView.width - 550;
      this.editorButton.y = cam.worldView.y + 250;
    }
  }
  


  
  private handlePlayerMovement() {
    const player = this.player;
    const body = player.body;
    const onGround = body.blocked.down;

    let velocityX = body.velocity.x;
    let velocityY = body.velocity.y;

    let moveInput = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      moveInput = -1;
      player.setFlipX(true);
    } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
      moveInput = 1;
      player.setFlipX(false);
    }

    if (moveInput !== 0) {
      const acceleration = onGround ? this.ACCELERATION : this.ACCELERATION * this.AIR_CONTROL;
      const targetVelocity = moveInput * this.PLAYER_SPEED;

      if (Math.abs(velocityX - targetVelocity) > 5) {
        velocityX += (targetVelocity - velocityX) * (acceleration / 1000) * (1/60);
        velocityX = Phaser.Math.Clamp(velocityX, -this.PLAYER_SPEED, this.PLAYER_SPEED);
      } else {
        velocityX = targetVelocity;
      }
      
      // Walking effects
      if (onGround) {
        this.startWalkingVFX();
      }

    } else {
      // No horizontal input - apply friction
      if (onGround) {
        // Strong friction on ground
        const frictionForce = this.FRICTION * (1/60); // 60fps assumption
        if (Math.abs(velocityX) > frictionForce) {
          velocityX -= Math.sign(velocityX) * frictionForce;
        } else {
          velocityX = 0; // Stop completely when velocity is small
        }
      } else {
        // Less friction in air
        const airFriction = this.FRICTION * 0.3 * (1/60);
        if (Math.abs(velocityX) > airFriction) {
          velocityX -= Math.sign(velocityX) * airFriction;
        } else {
          velocityX = 0;
        }
      }
      
      // Stop walking effects
      if (this.vfx.walking) {
        this.vfx.walking.stop();
      }
    
    }
    const jumpPressed = this.cursors.up.isDown || this.wasd.W.isDown;
    
    if (jumpPressed && !this.isJumpPressed && onGround) {
      // Start jump
      velocityY = this.JUMP_VELOCITY;
      this.isJumpPressed = true;
      player.isFalling = false;
      
      this.startJumpVFX();
    } else if (!jumpPressed && this.isJumpPressed && velocityY < -50) {
      // Jump button released early - cut jump short
      velocityY *= 0.4;
    }
    
    // Track jump button state
    if (!jumpPressed) {
      this.isJumpPressed = false;
    }

    // === APPLY VELOCITIES ===
    player.setVelocity(velocityX, velocityY);

    // === HANDLE LANDING ===
    if (onGround && player.isFalling) {
      player.isFalling = false;
    } else if (!onGround && velocityY > 0) {
      player.isFalling = true;
    }

    // === RESET IF FALLEN OFF WORLD ===
    if (player.y > this.map.heightInPixels + 100) {
      // Reset player position or restart scene
      player.setPosition(100, 150);
      player.setVelocity(0, 0);
    }
  }

  

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: any;

  private startWalkingVFX() {
    if (!this.vfx.walking) return;
    const { x, y } = this.getPlayerFootPos();
    this.vfx.walking.startFollow(this.player, x, y, false);
    this.vfx.walking.setParticleSpeed(this.particleVelocity, 0);

    if (this.player.body.blocked.down) {
      this.vfx.walking.start();
    }
    
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

  // Editor button
  private createEditorButton() {

    const button = this.add.text(100, 100, 'Play', {
      fontSize:'24px',
      color: '#ffffff',
      backgroundColor: '#1a1a1a',
      padding: { x: 15, y: 10 },
    })
    .setDepth(100)
    .setInteractive()
    .on('pointerdown', () => {
      console.log('Editor button clicked!');
      this.scene.start('editorScene');
    })
    .on('pointerover', () => {
      button.setStyle({ backgroundColor: '#127803' });
    })
    .on('pointerout', () => {
      button.setStyle({ backgroundColor: '#1a1a1a' });
    });
    
    this.editorButton = button;
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
