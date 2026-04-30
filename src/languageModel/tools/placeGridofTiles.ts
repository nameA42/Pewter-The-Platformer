import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";
// import {
//   OverlapChecker,
//   type PlacementType,
// } from "../../phaser/OverlapChecker.ts";
import { getProcessingBox } from "../chatBox";

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
      .max(9)
      .describe("Numeric ID of the tile to place (0–9 only)."),

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

      const { tileIndex, xMin, xMax, yMin, yMax } = args;
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
        return `❌ Tool Failed: layer '${layerName}' not found.`;
      }

      // Unknown layer - skip overlap check
      if (layerName !== "Ground_Layer" && layerName !== "Collectables_Layer") {
        try {
          for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
              map.putTileAt(tileIndex, x, y, true, layer);
              const targetBox = getProcessingBox() ?? scene.activeBox;
              if (targetBox) {
                targetBox.addPlacedTile(tileIndex, x, y, layerName);
              }
            }
          }
          return `✅ Placed grid of tile ${tileIndex} from (${xMin}, ${yMin}) to (${xMax}, ${yMax}) on layer '${layerName}'.`;
        } catch (e) {
          console.error("putTileAt failed:", e);
          return "❌ Tool Failed: error while placing grid of tiles.";
        }
      }

      // Check ALL tiles in grid for overlaps BEFORE placing any
      // for (let x = xMin; x <= xMax; x++) {
      //   for (let y = yMin; y <= yMax; y++) {
      //     const overlapCheck = OverlapChecker.checkTileOverlap(
      //       scene,
      //       x,
      //       y,
      //       placementType,
      //     );
      //     if (!overlapCheck.canPlace && tileIndex < 7) {
      //       return `❌ Cannot place grid: ${overlapCheck.reason} at position (${x}, ${y})`;
      //     }
      //   }
      // }

      // All tiles are clear - proceed with placement
      try {
        const targetBox = getProcessingBox() ?? scene.activeBox;
        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            map.putTileAt(tileIndex, x, y, true, layer);

            if (targetBox) {
              targetBox.addPlacedTile(tileIndex, x, y, layerName);
            }
          }
        }
        if (layerName == "Ground_Layer") {
          scene.worldFacts.setFact("Structure");
        } else if (layerName == "Collectables_Layer") {
          scene.worldFacts.setFact("Collectable");
        }
        return `✅ Placed grid of tile ${tileIndex} from (${xMin}, ${yMin}) to (${xMax}, ${yMax}) on layer '${layerName}'.`;
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
- (xMax, yMax): bottom-right inclusive coordinates.
- layerName: the name of the target map layer. Choose between 'Ground_Layer' and 'Collectables_Layer'.
- IMPORTANT: Enemy tiles (index 8 = Ultra Slime, index 9 = Slime) must always be placed on 'Ground_Layer'. This is enforced automatically.
`,
    },
  );
}
