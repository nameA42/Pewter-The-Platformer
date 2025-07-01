import type { GameScene } from "../../phaser/gameScene.ts";

export interface playerTool {
  sceneGetter: () => GameScene;
  toolCall?: any;
}
