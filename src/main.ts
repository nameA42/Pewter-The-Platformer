import "./style.css";
import { LoadingScene } from "./phaser/loadingScene.ts";
import { EditorScene } from "./phaser/editorScene.ts";
import { sendSystemMessage } from "./languageModel/chatBox.ts";
import { initializeTools } from "./languageModel/modelConnector.ts";
import { GameScene } from "./phaser/gameScene.ts";

//initializeTools();
import { PlaceGridofTiles } from "./languageModel/tools/placeGridofTiles.ts";
import { ClearTile } from "./languageModel/tools/clearTile.ts";
import { PlaceSingleTile } from "./languageModel/tools/placeSingleTile.ts";
import {
   registerTool,
 } from "./languageModel/modelConnector.ts";

//****LLM Tool Setup****////
const tools = {
  gravity: new PlaceGridofTiles(getScene),
  direction: new ClearTile(getScene),
  zoom: new PlaceSingleTile(getScene),
};

// Register all tools with the LLM
Object.values(tools).forEach((generator) => {
  if (generator.toolCall) {
    registerTool(generator.toolCall);
  }
});

//Now that all tools are registered, we can send them to the LLM.
initializeTools();

// // Tell the system to introduce itself and explain what it can do
// sendSystemMessage("Introduce yourself and explain what you can do. ");

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
  width: 1280,
  height: 720,
  parent: document.getElementById("phaser"),
  scene: [LoadingScene, EditorScene, GameScene],
  dom: {
    createContainer: true, //This line enables DOM support for chatbox
  },
});

export function getScene(): EditorScene {
  if (!gameInstance) throw Error("Scene does not exist >:(");
  console.log(gameInstance.scene.getScene("editorScene"));
  return gameInstance.scene.getScene("editorScene") as EditorScene;
}
sendSystemMessage("Introduce yourself and explain what you can do.");
