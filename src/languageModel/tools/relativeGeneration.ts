import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

/** FIX: your earlier class referenced GetPlacedTiles.argsSchema.
 * If you still want that tool, ensure its name/schema match.
 * Below we add a new tool specifically for checkTilesInBox().
 */

export class RelativeRegeneration {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  // No args required: we read the current activeBox
  static argsSchema = z.object({});

  toolCall = tool(
    async (_args: z.infer<typeof RelativeRegeneration.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) return "Tool Failed: no reference to scene.";

      const box = scene.activeBox as any; // type as needed for your project
      if (!box) return "Tool Failed: no selection box found.";

      if (typeof box.checkTilesInBox !== "function") {
        return "Tool Failed: activeBox.checkTilesInBox() not available.";
      }

      //checkTilesInBox() { tileIndex, x, y, layerName }[]
      const tiles = box.checkTilesInBox();

      // If you want the LLM to parse this easily, return JSON:
      return JSON.stringify({
        count: tiles?.length ?? 0,
        tiles,
      });
    },
    {
      name: "relativeGeneration",
      schema: RelativeRegeneration.argsSchema,
      description: `
Returns all non-empty tiles inside the current selection box by calling selectionBox.checkTilesInBox().
Each item has { tileIndex, x, y, layerName } in tile coordinates.
      `,
    }
  );
}
