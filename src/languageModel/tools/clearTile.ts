import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class ClearTile {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  // Improved schema with clearer descriptions
  static argsSchema = z.object({
    xMin: z
      .number()
      .int()
      .min(0)
      .describe("Minimum X (leftmost column index, inclusive)."),
    xMax: z
      .number()
      .int()
      .min(0)
      .describe("Maximum X (rightmost column index, exclusive)."),
    yMin: z
      .number()
      .int()
      .min(0)
      .describe("Minimum Y (topmost row index, inclusive)."),
    yMax: z
      .number()
      .int()
      .min(0)
      .describe("Maximum Y (bottommost row index, exclusive)."),
    layerName: z
      .string()
      .min(1)
      .describe("Name of the map layer to clear tiles from."),
  });

  toolCall = tool(
    async (args: z.infer<typeof ClearTile.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        console.log("getSceneFailed");
        return "❌ Tool Failed: no reference to scene.";
      }

      const { xMin, xMax, yMin, yMax, layerName } = args;
      const map = scene.map;
      const layer = map.getLayer(layerName)?.tilemapLayer;

      if (!layer) {
        return `❌ Tool Failed: layer '${layerName}' not found.`;
      }

      try {
        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            map.removeTileAt(x, y, false, false, layer);
          }
        }

        if (layerName == "Ground_Layer") {
          scene.worldFacts.setFact("Ground");
        } else if (layerName == "Collectables_Layer") {
          scene.worldFacts.setFact("Collectable");
        }

        console.log(layer);
        return `✅ Cleared tiles from (${xMin}, ${yMin}) up to (${xMax}, ${yMax}) on layer '${layerName}'.`;
      } catch (e) {
        console.error("removeTileAt failed:", e);
        return "❌ Tool Failed: error while clearing tiles.";
      }
    },
    {
      name: "clearTiles",
      schema: ClearTile.argsSchema,
      description: `
Clears a rectangular section of the map by removing tiles from the specified layer.

- (xMin, yMin): top-left inclusive coordinates.
- (xMax, yMax): bottom-right exclusive coordinates.
- layerName: the name of the target map layer. Choose between 'Ground_Layer' and 'Collectables_Layer' 

Examples:
  { "xMin": 0, "yMin": 0, "xMax": 3, "yMax": 3, "layerName": "Ground" }
  { "xMin": 2, "yMin": 2, "xMax": 5, "yMax": 6, "layerName": "Walls" }
`,
    },
  );
}
