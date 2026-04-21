import Phaser from "phaser";

export class LoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: "LoadingScene" });
  }

  preload() {
    this.load.setPath("phaserAssets/");
    this.load.image("tileset", "pewterPlatformerTilesetExtended.png");
    this.load.tilemapTiledJSON("defaultMap", "pewterPlatformerDefaultMap.json");
    //this.load.image("pellets", "pellets.png");

    this.load.spritesheet("spritesheet", "pewterPlatformerTilesetExtended.png", {
      frameWidth: 16,
      frameHeight: 16,
    });

    this.load.spritesheet("pellets", "pellets.png", {
      frameWidth: 16,
      frameHeight: 16,
    });

    // Load particle effects for enemy system (optional - effects will gracefully degrade if missing)
    // Uncomment when kenny-particles assets are available:
    // this.load.atlas("kenny-particles", "kenny-particles-0.png", "kenny-particles.json");
  }

  create() {
    this.scene.start("editorScene");
  }
}
