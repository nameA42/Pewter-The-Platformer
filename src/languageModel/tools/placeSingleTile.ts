import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class PlaceSingleTile {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  // Improved schema: strong typing, descriptions, defaults
  static argsSchema = z.object({
    tileIndex: z
      .number()
      .int()
      .min(0)
      .describe("The numeric index of the tile to place (e.g., 0, 5, 12)."),

    x: z
      .number()
      .int()
      .min(0)
      .describe("Tile X coordinate (column index, starting at 0)."),

    y: z
      .number()
      .int()
      .min(0)
      .describe("Tile Y coordinate (row index, starting at 0)."),

    layerName: z
      .string()
      .min(1)
      .describe("The name of the map layer where the tile should be placed."),

    note: z.string().optional().describe("Optional note for history logging."),
  });

  toolCall = tool(
    async (args: z.infer<typeof PlaceSingleTile.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        console.log("getSceneFailed");
        return "Tool Failed: no reference to scene.";
      }

      const { tileIndex, x, y, layerName, note } = args;

      // Use the EditorScene history-aware public API to place the tile
      scene.applyTileMatrixWithHistoryPublic(
        { x, y, w: 1, h: 1 },
        [[tileIndex]],
        null,
        "chat",
        undefined,
        note ?? "placeSingleTile",
        layerName,
      );

      return `✅ Placed tile ${tileIndex} at (${x}, ${y}) on layer '${layerName}'.`;
    },
    {
      name: "placeSingleTile",
      schema: PlaceSingleTile.argsSchema,
      description: `
Places a single tile at the given tile coordinates (x, y) on the specified map layer and logs it to history.
`,
    },
  );
}
