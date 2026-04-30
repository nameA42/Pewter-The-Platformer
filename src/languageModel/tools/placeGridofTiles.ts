import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";
import {
  OverlapChecker,
  type PlacementType,
} from "../../phaser/OverlapChecker.ts";
import { getProcessingBox } from "../chatBox";

const COLLECTABLE_INDICES = [2, 3];
const ENEMY_INDICES = [8, 9];
const SOLID_BLOCK_INDICES = [4, 5, 6, 7];

function getTileName(index: number): string {
  if (index === 8) return "tile 8 (Ultra Slime)";
  if (index === 9) return "tile 9 (Slime)";
  if (COLLECTABLE_INDICES.includes(index)) return `tile ${index} (Collectable)`;
  if (SOLID_BLOCK_INDICES.includes(index)) return `tile ${index} (Solid Block)`;
  return `tile ${index}`;
}

export class PlaceGridofTiles {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

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

      if (ENEMY_INDICES.includes(tileIndex)) {
        layerName = "Ground_Layer";
      }

      const map = scene.map;
      const layer = map.getLayer(layerName)?.tilemapLayer;

      if (!layer) {
        return `❌ Tool Failed: layer '${layerName}' not found.`;
      }

      // All placements must be within the active selection box — check all positions first
      const targetBox = getProcessingBox() ?? scene.activeBox;
      if (!targetBox) {
        return `❌ Cannot place ${getTileName(tileIndex)} grid: no active selection box exists. The entire placement has been cancelled.`;
      }
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          if (!targetBox.containsPoint(x, y)) {
            const b = targetBox.getBounds();
            return `❌ Cannot place ${getTileName(tileIndex)} grid: position (${x}, ${y}) is outside the selection box. The entire placement has been cancelled. Box bounds: (${b.x}, ${b.y}) to (${b.x + b.width - 1}, ${b.y + b.height - 1}).`;
          }
        }
      }

      // Skip overlap check for non-standard layers
      if (layerName !== "Ground_Layer" && layerName !== "Collectables_Layer") {
        try {
          for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
              map.putTileAt(tileIndex, x, y, true, layer);
              targetBox!.addPlacedTile(tileIndex, x, y, layerName);
            }
          }
          return `✅ Placed grid of tile ${tileIndex} from (${xMin}, ${yMin}) to (${xMax}, ${yMax}) on layer '${layerName}'.`;
        } catch (e) {
          console.error("putTileAt failed:", e);
          return "❌ Tool Failed: error while placing grid of tiles.";
        }
      }

      let placementType: PlacementType | null = null;
      if (COLLECTABLE_INDICES.includes(tileIndex)) placementType = "collectable";
      else if (ENEMY_INDICES.includes(tileIndex)) placementType = "enemy";

      if (placementType) {
        try {
          const currentZLevel = targetBox!.getZLevel();
          for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
              const check = OverlapChecker.checkTileOverlap(scene, x, y, placementType, currentZLevel);
              if (!check.canPlace) {
                return `❌ Cannot place grid: ${check.reason} at (${x}, ${y}). To fix: remove the solid block at that position first, or adjust the grid bounds.`;
              }
            }
          }
        } catch (e) {
          console.error("OverlapChecker failed:", e);
        }
      }

      try {
        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            // When placing a collectable, erase any solid block at the same Ground_Layer position
            if (COLLECTABLE_INDICES.includes(tileIndex)) {
              const groundTile = scene.groundLayer.getTileAt(x, y);
              if (groundTile && SOLID_BLOCK_INDICES.includes(groundTile.index)) {
                scene.groundLayer.putTileAt(-1, x, y);
                const solidIdx = targetBox!.placedTiles.findIndex(
                  (t: { x: number; y: number; layerName: string }) => t.x === x && t.y === y && t.layerName === "Ground_Layer"
                );
                if (solidIdx !== -1) {
                  targetBox!.placedTiles.splice(solidIdx, 1);
                } else {
                  targetBox!.placedTiles.push({ tileIndex: -1, x, y, layerName: "Ground_Layer" });
                }
              }
            }

            // When placing a solid block, erase any collectable at the same Collectables_Layer position
            if (SOLID_BLOCK_INDICES.includes(tileIndex)) {
              const collectableTile = scene.collectablesLayer.getTileAt(x, y);
              if (collectableTile && COLLECTABLE_INDICES.includes(collectableTile.index)) {
                scene.collectablesLayer.putTileAt(-1, x, y);
                const collectableIdx = targetBox!.placedTiles.findIndex(
                  (t: { x: number; y: number; layerName: string }) => t.x === x && t.y === y && t.layerName === "Collectables_Layer"
                );
                if (collectableIdx !== -1) {
                  targetBox!.placedTiles.splice(collectableIdx, 1);
                } else {
                  targetBox!.placedTiles.push({ tileIndex: -1, x, y, layerName: "Collectables_Layer" });
                }
              }
            }

            map.putTileAt(tileIndex, x, y, true, layer);
            targetBox!.addPlacedTile(tileIndex, x, y, layerName);
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
- IMPORTANT: All coordinates must be within the active selection box bounds.
`,
    },
  );
}
