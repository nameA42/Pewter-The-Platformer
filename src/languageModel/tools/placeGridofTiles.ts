import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class PlaceGridofTiles {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  // Improved schema with clearer descriptions & constraints
  static argsSchema = z.object({
    tileIndex: z
      .number()
      .int()
      .min(0)
      .describe("Numeric ID of the tile to place (e.g. 0, 5, 12)."),

    xMin: z
      .number()
      .int()
      .min(0)
      .describe("Minimum X (leftmost column index, inclusive)."),

    xMax: z
      .number()
      .int()
      .min(0)
      .describe("Maximum X (rightmost column index, inclusive)."),

    yMin: z
      .number()
      .int()
      .min(0)
      .describe("Minimum Y (topmost row index, inclusive)."),

    yMax: z
      .number()
      .int()
      .min(0)
      .describe("Maximum Y (bottommost row index, inclusive)."),

    layerName: z
      .string()
      .min(1)
      .describe("Name of the map layer where tiles will be placed."),
  });

  toolCall = tool(
    async (args: z.infer<typeof PlaceGridofTiles.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        console.log("getSceneFailed");
        return "❌ Tool Failed: no reference to scene.";
      }

      const { tileIndex, xMin, xMax, yMin, yMax, layerName } = args;
      const map = scene.map;
      const layer = map.getLayer(layerName)?.tilemapLayer;

      if (!layer) {
        return `❌ Tool Failed: layer '${layerName}' not found.`;
      }

      try {
        // Use history-aware API if available for batch placement
        const w = xMax - xMin + 1;
        const h = yMax - yMin + 1;
        const matrix = Array.from({ length: h }, () => Array.from({ length: w }, () => tileIndex));
        if ((scene as any).applyTileMatrixWithHistoryPublic) {
          (scene as any).applyTileMatrixWithHistoryPublic(
            { x: xMin, y: yMin, w, h },
            matrix,
            null,
            "chat",
            scene.activeBox?.getId?.(),
            "placeGridofTiles",
            layerName,
          );
        } else {
          for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
              map.putTileAt(tileIndex, x, y, true, layer);
              if (scene.activeBox) {
                scene.activeBox.addPlacedTile(tileIndex, x, y, layerName);
              }
            }
          }
        }
        if (layerName == "Ground_Layer") {
          scene.worldFacts.setFact("Structure");
        } else if (layerName == "Collectables_Layer") {
          scene.worldFacts.setFact("Collectable");
        }
        return `✅ Placed grid of tile ${tileIndex} from (${xMin}, ${yMin}) up to (${xMax}, ${yMax}) on layer '${layerName}'.`;
      } catch (e) {
        console.error("putTileAt failed:", e);
        return "❌ Tool Failed: error while placing grid of tiles.";
      }
    },
    {
      name: "placeGridofTiles",
      schema: PlaceGridofTiles.argsSchema,
      description: `
Places a rectangular grid of tiles on the map.

- tileIndex: numeric ID of the tile to place.
- (xMin, yMin): top-left inclusive coordinates.
- (xMax, yMax): bottom-right exclusive coordinates.
- layerName: the name of the target map layer. Choose between 'Ground_Layer' and 'Collectables_Layer' 
`,
    },
  );
}
