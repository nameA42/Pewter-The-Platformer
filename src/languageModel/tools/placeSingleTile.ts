import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";
// import {
//   OverlapChecker,
//   type PlacementType,
// } from "../../phaser/OverlapChecker.ts";
import { getProcessingBox } from "../chatBox";

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
      .max(9)
      .describe("The numeric index of the tile to place (0–9 only)."),

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
        console.log("getSceneFailed");
        return "Tool Failed: no reference to scene.";
      }

      const { tileIndex, x, y } = args;
      let { layerName } = args;

      if (tileIndex > 9) {
        return `❌ Tool Failed: tile index ${tileIndex} is a background tile and cannot be placed.`;
      }

      const ENEMY_TILE_INDICES = [8, 9];
      if (ENEMY_TILE_INDICES.includes(tileIndex)) {
        layerName = "Ground_Layer";
      }

      const map = scene.map;
      const layer = map.getLayer(layerName)?.tilemapLayer;

      if (!layer) {
        return `Tool Failed: layer '${layerName}' not found.`;
      }

      // Unknown layer - skip overlap check
      if (layerName !== "Ground_Layer" && layerName !== "Collectables_Layer") {
        map.putTileAt(tileIndex, x, y, true, layer);
        const targetBox = getProcessingBox() ?? scene.activeBox;
        if (targetBox) {
          targetBox.addPlacedTile(tileIndex, x, y, layerName);
        }
        return `✅ Placed tile ${tileIndex} at (${x}, ${y}) on layer '${layerName}'.`;
      }

      // Check for overlaps before placing (disabled)
      // const overlapCheck = OverlapChecker.checkTileOverlap(scene, x, y, placementType);
      // if (!overlapCheck.canPlace && tileIndex < 7) {
      //   return `❌ Cannot place tile at (${x}, ${y}): ${overlapCheck.reason}`;
      // }

      map.putTileAt(tileIndex, x, y, true, layer);

      //Record the placement
      const targetBox = getProcessingBox() ?? scene.activeBox;
      if (targetBox) {
        targetBox.addPlacedTile(tileIndex, x, y, layerName);
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
        - layerName: the name of the target map layer. Choose between 'Ground_Layer' and 'Collectables_Layer'.
        - IMPORTANT: Enemy tiles (index 8 = Ultra Slime, index 9 = Slime) must always be placed on 'Ground_Layer'. This is enforced automatically.
        `,
    },
  );
}
