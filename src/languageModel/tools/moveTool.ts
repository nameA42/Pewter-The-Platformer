import { tool } from "@langchain/core/tools";
import type { playerTool } from "./ITool.ts";
import type { GameScene } from "../../phaser/gameScene.ts";
import { z } from "zod";

export class MoveTool implements playerTool {
  sceneGetter: () => GameScene;

  constructor(sceneGetter: () => GameScene) {
    this.sceneGetter = sceneGetter;
  }

  static moveArgsSchema = z.object({
    direction: z.number().min(0).max(2),
    distance: z.number().min(1).max(10),
  });

  toolCall = tool(
    async (args: z.infer<typeof MoveTool.moveArgsSchema>) => {
      //cast to numbers
      args.direction = Number(args.direction);
      args.distance = Number(args.distance);

      //TODO Movement logic
      let gameScene = this.sceneGetter();
      gameScene.handlePlayerMovement(args.direction, args.distance);

      let dirName = "";
      switch (args.direction) {
        case 0:
          dirName = "leftward";
          break;
        case 1:
          dirName = "upward";
          break;
        case 2:
          dirName = "rightward";
          break;
      }

      return `Moved ${args.distance} units in the ${dirName} direction`;
    },
    {
      //The schema of the tool - what the LLM sees beforehand
      name: "movePlayer",
      schema: MoveTool.moveArgsSchema,
      description: "Moves the player. Directions are 0:left, 1:up, 2:right",
    },
  );
}
