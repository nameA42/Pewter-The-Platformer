import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class GetTileHistory {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  static argsSchema = z.object({ x: z.number().int(), y: z.number().int() });

  toolCall = tool(
    async (args: z.infer<typeof GetTileHistory.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) return "Tool Failed: no scene reference.";
      const hist = (scene as any).getTileHistory(args.x, args.y);
      return JSON.stringify(hist);
    },
    {
      name: "getTileHistory",
      schema: GetTileHistory.argsSchema,
      description: "Return placement history for a single tile",
    },
  );
}
