import Phaser from "phaser";

export class LoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: "LoadingScene" });
  }

  preload() {
    this.load.setPath("phaserAssets/");
    this.load.image("tileset", "pewterPlatformerTileset.png");
    this.load.tilemapTiledJSON("defaultMap", "pewterPlatformerDefaultMap.json");
    //this.load.image("pellets", "pellets.png");

    this.load.spritesheet("spritesheet", "pewterPlatformerTileset.png", {
      frameWidth: 16,
      frameHeight: 16,
    });

    this.load.spritesheet("pellets", "pellets.png", {
      frameWidth: 16,
      frameHeight: 16,
    });
  }

  create() {
    this.scene.start("editorScene");
  }
}
