import "./style.css";
import { LoadingScene } from "./phaser/loadingScene.ts";
import { EditorScene } from "./phaser/editorScene.ts";
import { sendSystemMessage } from "./languageModel/chatBox.ts";
import { GameScene } from "./phaser/gameScene.ts";
import { UIScene } from './phaser/UIScene.ts';

//initializeTools();

// import { GravityTool } from "./languageModel/tools/gravityTool.ts";
import {
  initializeTools,
  registerTool,
} from "./languageModel/modelConnector.ts";
// import { MoveTool } from "./languageModel/tools/moveTool.ts";
// import { sendSystemMessage } from "./languageModel/chatBox.ts";
// import { ZoomTool } from "./languageModel/tools/zoomTool.ts";

import { PlaceSingleTile } from "./languageModel/tools/placeSingleTile.ts";
import { PlaceEnemy } from "./languageModel/tools/placeEnemy.ts";
import { PlaceGridofTiles } from "./languageModel/tools/placeGridofTiles.ts";
import { ClearTile } from "./languageModel/tools/clearTile.ts";

////****LLM Tool Setup****////
// const tools = {
//   gravity: new GravityTool(getScene),
//   direction: new MoveTool(getScene),
//   zoom: new ZoomTool(getScene),
// };

const tools = {
  placeSingleTile: new PlaceSingleTile(getScene),
  placeEnemy: new PlaceEnemy(getScene),
  placeGridofTiles: new PlaceGridofTiles(getScene),
  clearTile: new ClearTile(getScene),
};

// // Register all tools with the LLM
Object.values(tools).forEach((generator) => {
  if (generator.toolCall) {
    registerTool(generator.toolCall);
  }
});

// Register read-only selection getter tool for the LLM
registerTool({
  name: "get_current_selection",
  description:
    "Returns the current active selection box in tile coordinates. If none is active, returns the last finalized selection.",
  schema: {
    type: "object",
    properties: {},
  },
  async invoke() {
    const editorScene = getScene();
    const active = editorScene.getActiveSelectionBBox();
    const last = editorScene.getLastSelectionBBox();
    if (active) return JSON.stringify({ type: "active", ...active });
    if (last) return JSON.stringify({ type: "last", ...last });
    return JSON.stringify({ type: "none" });
  },
});

// Tool to fill current selection with a tile index
registerTool({
  name: "fill_selection",
  description: "Fill the current selection with a single tile index.",
  schema: {
    type: "object",
    properties: { tileIndex: { type: "number" }, note: { type: "string" } },
    required: ["tileIndex"],
  },
  async invoke({ tileIndex, note }: any) {
    const scene = getScene();
    const sel = scene.getActiveSelectionBBox() ?? scene.getLastSelectionBBox();
    if (!sel) return "Error: no selection.";

    const box = scene.getSelectionById(sel.id);
    if (!box) return "Error: selection not found.";

    scene.fillSelectionWithTile(box, tileIndex, note ?? "llm_fill");
    return "ok";
  },
});

// region history tool
registerTool({
  name: "get_region_history",
  description: "Return placement history within a region",
  schema: {
    type: "object",
    properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" }, limit: { type: "number" } },
    required: ["x", "y", "w", "h"],
  },
  async invoke({ x, y, w, h, limit }: any) {
    const scene = getScene();
    const hist = scene.getRegionHistory({ x, y, w, h }, limit ?? 50);
    return JSON.stringify(hist);
  },
});

// single tile history tool
registerTool({
  name: "get_tile_history",
  description: "Return placement history for a single tile",
  schema: {
    type: "object",
    properties: { x: { type: "number" }, y: { type: "number" } },
    required: ["x", "y"],
  },
  async invoke({ x, y }: any) {
    const scene = getScene();
    const hist = scene.getTileHistory(x, y);
    return JSON.stringify(hist);
  },
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
  scene: [LoadingScene, EditorScene, UIScene, GameScene],
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
