import { tool } from "@langchain/core/tools";
import type { playerTool } from "./ITool.ts";
import type { GameScene } from "../../phaser/gameScene.ts";

export class GravityTool implements playerTool {
  sceneGetter: () => GameScene;

  constructor(sceneGetter: () => GameScene) {
    this.sceneGetter = sceneGetter;
  }

  toolCall = tool(
    async () => {
      //The actual action to perform. Should return a string representing the output of the tool
      let gameScene = this.sceneGetter();
      if (gameScene === null) {
        return "Tool Failed: Unable to load game data";
      }
      gameScene.toggleGravity();
      let sentencePhrasing = gameScene.isUpDown ? "inverted" : "normal";

      return `Successfully flipped gravity. It is now ${sentencePhrasing}`;
    },
    {
      //The schema of the tool - what the LLM sees beforehand
      name: "flipGravity",
      description: "Inverts the gravity in the game",
    },
  );
}
