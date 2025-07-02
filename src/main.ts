import "./style.css";
import { LoadingScene } from "./phaser/loadingScene.ts";
import { GameScene } from "./phaser/gameScene.ts";
import { GravityTool } from "./languageModel/tools/gravityTool.ts";
import {
  initializeTools,
  registerTool,
} from "./languageModel/modelConnector.ts";
import { MoveTool } from "./languageModel/tools/moveTool.ts";
import { sendSystemMessage } from "./languageModel/chatBox.ts";
import { ZoomTool } from "./languageModel/tools/zoomTool.ts";

////****LLM Tool Setup****////
const tools = {
  gravity: new GravityTool(getScene),
  direction: new MoveTool(getScene),
  zoom: new ZoomTool(getScene),
};

// Register all tools with the LLM
Object.values(tools).forEach((generator) => {
  if (generator.toolCall) {
    registerTool(generator.toolCall);
  }
});

//Now that all tools are registered, we can send them to the LLM.
initializeTools();

// Tell the system to introduce itself and explain what it can do
sendSystemMessage("Introduce yourself and explain what you can do. ");

////****Phaser Game Setup****////

//Create Phaser game instance
const gameInstance = new Phaser.Game({
  type: Phaser.CANVAS,
  render: {
    pixelArt: true,
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: true,
      gravity: {
        x: 0,
        y: 0,
      },
    },
  },
  width: 640,
  height: 400,
  parent: document.getElementById("phaser"),
  scene: [LoadingScene, GameScene],
});

export function getScene(): GameScene {
  if (!gameInstance) throw Error("Scene does not exist >:(");
  console.log(gameInstance.scene.getScene("GameScene"));
  return gameInstance.scene.getScene("GameScene") as GameScene;
}
