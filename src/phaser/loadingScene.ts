import Phaser from "phaser";

export class LoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: "LoadingScene" });
  }

  preload() {
    this.load.setPath("phaserAssets/");
    this.load.image("tileset", "pewterPlatformerTileset.png");
    this.load.spritesheet("spriteSheet", "pewterPlatformerTileset.png", {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.tilemapTiledJSON("defaultMap", "pewterPlatformerDefaultMap.json");
  }

  create() {
    this.scene.start("editorScene");
  }
}
