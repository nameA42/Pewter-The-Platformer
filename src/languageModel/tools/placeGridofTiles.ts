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
      .describe("Name of the map layer where tiles will be placed."),
    note: z.string().optional().describe("Optional note for history logging."),
  });

  toolCall = tool(
    async (args: z.infer<typeof PlaceGridofTiles.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        console.log("getSceneFailed");
        return "❌ Tool Failed: no reference to scene.";
      }

      const { tileIndex, xMin, xMax, yMin, yMax, layerName, note } = args;

      const w = xMax - xMin;
      const h = yMax - yMin;
      if (w <= 0 || h <= 0) return "❌ Tool Failed: width/height must be positive.";

      // Build uniform matrix
      const matrix = Array.from({ length: h }, () => Array.from({ length: w }, () => tileIndex));

      // Route through history-aware API
      try {
        scene.applyTileMatrixWithHistoryPublic(
          { x: xMin, y: yMin, w, h },
          matrix,
          null,
          "chat",
          undefined,
          note ?? "placeGridofTiles",
          layerName,
        );
        return `✅ Placed grid of ${tileIndex} from (${xMin}, ${yMin}) to (${xMax}, ${yMax}) on '${layerName}'.`;
      } catch (e) {
        console.error("placeGridofTiles failed:", e);
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
- layerName: the name of the target map layer.

Examples:
  { "tileIndex": 5, "xMin": 0, "yMin": 0, "xMax": 3, "yMax": 3, "layerName": "Ground" }
  { "tileIndex": 12, "xMin": 2, "yMin": 2, "xMax": 5, "yMax": 6, "layerName": "Walls" }
`,
    },
  );
}

