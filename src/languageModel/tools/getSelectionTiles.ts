import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class GetSelectionTiles {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  static argsSchema = z.object({
    selectionId: z.string().optional(),
  });

  toolCall = tool(
    async (args: z.infer<typeof GetSelectionTiles.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) return "Tool Failed: no scene reference.";

      let box = scene.activeBox;
      if (args.selectionId) box = scene.getSelectionById(args.selectionId);

      if (!box) return "Tool Failed: no selection box found.";

      // ensure selectedTiles is populated
      try {
        box.copyTiles?.();
      } catch (e) {
        // ignore
      }

      const tiles = box.getSelectedTiles?.() ?? [];
      return JSON.stringify({ width: tiles[0]?.length ?? 0, height: tiles.length, tiles });
    },
    {
      name: "getSelectionTiles",
      schema: GetSelectionTiles.argsSchema,
      description: `Returns the tile index matrix for the active selection box or selectionId if provided.`,
    },
  );
}
