import * as phaser from "phaser";

export class LoadingScene extends phaser.Scene {
  constructor() {
    super({ key: "LoadingScene" });
  }

  preload() {
    this.load.setPath("phaserAssets/");

    //Load all of the assets that we can before the game starts
    this.load.atlas(
      "platformer_characters",
      "tilemap-characters-packed.png",
      "tilemap-characters-packed.json",
    );

    // Load tilemap information
    this.load.image("tilemap_tiles", "tilemap_packed.png"); // Packed tilemap
    this.load.tilemapTiledJSON("platformer-level-1", "platformer-level-1.tmj"); // Tilemap in JSON

    // Load the tilemap as a spritesheet
    this.load.spritesheet("tilemap_sheet", "tilemap_packed.png", {
      frameWidth: 18,
      frameHeight: 18,
    });

    // Oooh, fancy. A multi atlas is a texture atlas which has the textures spread
    // across multiple png files, so as to keep their size small for use with
    // lower resource devices (like mobile phones).
    // kenny-particles.json internally has a list of the png files
    // The multiatlas was created using TexturePacker and the Kenny
    // Particle Pack asset pack.
    this.load.multiatlas("kenny-particles", "kenny-particles.json");

    this.load.audio("jumpAudio", "audio/jumpSound.wav");
    this.load.audio("landAudio", "audio/landingSound.wav");
    this.load.audio("bgm", "audio/bgm.wav");
    this.load.audio("partCollect", "audio/partCollect.wav");
    this.load.audio("gameOver", "audio/gameOver.wav");

    // Load the background
    this.load.image("background", "background/bg.png");
    this.load.image("buildings", "background/buildings.png");
    this.load.image("far", "background/far.png");
  }

  create() {
    this.anims.create({
      key: "walk",
      frames: this.anims.generateFrameNames("platformer_characters", {
        prefix: "tile_",
        start: 0,
        end: 1,
        suffix: ".png",
        zeroPad: 4,
      }),
      frameRate: 15,
      repeat: -1,
    });

    this.anims.create({
      key: "idle",
      defaultTextureKey: "platformer_characters",
      frames: [{ frame: "tile_0000.png" }],
      repeat: -1,
    });

    this.anims.create({
      key: "jump",
      defaultTextureKey: "platformer_characters",
      frames: [{ frame: "tile_0001.png" }],
    });

    // ...and pass to the next Scene
    this.scene.start("GameScene");
  }
}
