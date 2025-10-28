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
  });

  toolCall = tool(
    async (args: z.infer<typeof PlaceSingleTile.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        return "Tool Failed: no reference to scene.";
      }

      const { tileIndex, x, y, layerName } = args;
      const map = scene.map;
      const layer = map.getLayer(layerName)?.tilemapLayer;

      if (!layer) {
        return `Tool Failed: layer '${layerName}' not found. Available layers: ${map.layers.map(l => l.name).join(', ')}`;
      }

      // Validate coordinates are within map bounds
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
        return `Tool Failed: coordinates (${x}, ${y}) are outside map bounds (0,0) to (${map.width-1},${map.height-1})`;
      }

      map.putTileAt(tileIndex, x, y, true, layer);

      //Record the placement
      // Prefer history-aware API when present
      try {
        if (scene.applyTileMatrixWithHistoryPublic) {
          scene.applyTileMatrixWithHistoryPublic(
            { x, y, w: 1, h: 1 },
            [[tileIndex]],
            null,
            "chat",
            scene.activeBox?.getId?.(),
            "placeSingleTile",
            layerName,
          );
        } else {
          if (scene.activeBox) scene.activeBox.addPlacedTile(tileIndex, x, y, layerName);
        }
      } catch (e) {
        console.error("Failed to record tile placement in history:", e);
        if (scene.activeBox) scene.activeBox.addPlacedTile(tileIndex, x, y, layerName);
      }

      if (layerName == "Ground_Layer") {
        scene.worldFacts.setFact("Structure");
      } else if (layerName == "Collectables_Layer") {
        scene.worldFacts.setFact("Collectable");
      }
      return `✅ Placed tile ${tileIndex} at (${x}, ${y}) on layer '${layerName}'.`;
    },
    {
      name: "placeSingleTile",
      schema: PlaceSingleTile.argsSchema,
      description: `
        Places a single tile at the given tile coordinates (x, y) on the specified map layer.

        - tileIndex: numeric ID of the tile to place.
        - x, y: integer tile coordinates (not pixels).
        - layerName: the name of the target map layer. Choose between 'Ground_Layer' and 'Collectables_Layer' 
        `,
    },
  );
}
