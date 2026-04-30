import "./style.css";
import { LoadingScene } from "./phaser/loadingScene.ts";
import { EditorScene } from "./phaser/editorScene.ts";
import { sendSystemMessage, addStaticAIMessage } from "./languageModel/chatBox.ts";
import { GameScene } from "./phaser/gameScene.ts";
import { UIScene } from "./phaser/UIScene.ts";

import {
  initializeTools,
  registerTool,
} from "./languageModel/modelConnector.ts";
import { PlaceSingleTile } from "./languageModel/tools/placeSingleTile.ts";
// import { PlaceEnemy } from "./languageModel/tools/placeEnemy.ts";
import { PlaceGridofTiles } from "./languageModel/tools/placeGridofTiles.ts";
import { ClearTile } from "./languageModel/tools/clearTile.ts";
import { WorldFactsTool } from "./languageModel/tools/worldFactsTool.ts";
import { GetPlacedTiles } from "./languageModel/tools/getPlacedTiles.ts";
import { RelativeRegeneration } from "./languageModel/tools/relativeGeneration.ts";
// import { GenerateEnemy } from "./languageModel/tools/generateEnemy.ts";
// import { ModifyEnemy } from "./languageModel/tools/modifyEnemy.ts";

////****LLM Tool Setup****////

const tools = {
  placeSingleTile: new PlaceSingleTile(getScene),
  // placeEnemy: new PlaceEnemy(getScene),
  placeGridofTiles: new PlaceGridofTiles(getScene),
  clearTile: new ClearTile(getScene),
  WorldFactsTool: new WorldFactsTool(getScene),
  getPlacedTiles: new GetPlacedTiles(getScene),
  relativeGeneration: new RelativeRegeneration(getScene),
  // generateEnemy: new GenerateEnemy(getScene),
  // modifyEnemy: new ModifyEnemy(getScene)
};

// // Register all tools with the LLM
Object.values(tools).forEach((generator) => {
  if (generator.toolCall) {
    registerTool(generator.toolCall);
  }
});

//Now that all tools are registered, we can send them to the LLM.
initializeTools();

// Set to true to have the AI generate the intro message, false to use the hardcoded one
const USE_AI_INTRO = true;

if (USE_AI_INTRO) {
  sendSystemMessage("Introduce yourself and explain what you can do briefly.");
} else {
  addStaticAIMessage(
    "Hello there! I'm Pewter, your friendly platformer level design assistant. " +
    "I can help you create amazing levels by placing and clearing tiles, and even tell you about the world. " +
    "To get started, please draw a selection box on the map!"
  );
}

////****Phaser Game Setup****////

const renderResolution = Math.min(window.devicePixelRatio || 1, 2);

//Create Phaser game instance
const gameConfig: Phaser.Types.Core.GameConfig & { resolution?: number } = {
  type: Phaser.CANVAS,
  resolution: renderResolution,
  render: {
    pixelArt: true,
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
      gravity: {
        x: 0,
        y: 0,
      },
    },
  },
  width: 1280,
  height: 720,
  parent: document.getElementById("phaser"),
  scene: [LoadingScene, EditorScene, UIScene, GameScene],
  dom: {
    createContainer: true, //This line enables DOM support for chatbox
  },
};

const gameInstance = new Phaser.Game(gameConfig);

export function getScene(): EditorScene {
  if (!gameInstance) throw Error("Scene does not exist >:(");
  console.log(gameInstance.scene.getScene("editorScene"));
  return gameInstance.scene.getScene("editorScene") as EditorScene;
}
