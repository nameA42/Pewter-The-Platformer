import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class GetRegionHistory {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  static argsSchema = z.object({
    x: z.number().int(),
    y: z.number().int(),
    w: z.number().int(),
    h: z.number().int(),
    limit: z.number().int().optional(),
  });

  toolCall = tool(
    async (args: z.infer<typeof GetRegionHistory.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) return "Tool Failed: no scene reference.";
      const hist = (scene as any).getRegionHistory({ x: args.x, y: args.y, w: args.w, h: args.h }, args.limit ?? 50);
      return JSON.stringify(hist);
    },
    {
      name: "getRegionHistory",
      schema: GetRegionHistory.argsSchema,
      description: "Return placement history within a region",
    },
  );
}
