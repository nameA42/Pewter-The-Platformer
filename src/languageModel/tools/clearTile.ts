import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { invokeTool } from "../modelConnector";
import { z } from "zod";
import { getProcessingBox } from "../chatBox";
import { superDuperRealUserLayer, baseStartingLayer, allSelectionBoxes } from "../../phaser/selectionBox.ts";

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
        let clearedCount = 0;
        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            const removed = map.removeTileAt(x, y, false, false, layer);
            if (removed) clearedCount++;
            const targetBox = getProcessingBox() ?? scene.activeBox;
            if (targetBox) {
              targetBox.addPlacedTile(-1, x, y, layerName);
            }
          }
        }

        // Remove any enemies whose tile position falls within the cleared region
        const tileW = scene.map.tileWidth;
        const tileH = scene.map.tileHeight;
        const toRemove = scene.enemies.filter((enemy) => {
          const tileX = Math.floor(enemy.x / tileW);
          const tileY = Math.floor(enemy.y / tileH);
          return tileX >= xMin && tileX <= xMax && tileY >= yMin && tileY <= yMax;
        });
        for (const enemy of toRemove) {
          const idx = scene.enemies.indexOf(enemy);
          if (idx !== -1) scene.enemies.splice(idx, 1);
          enemy.destroy();
        }
        scene.worldFacts.refresh();

        if (layerName == "Ground_Layer") {
          scene.worldFacts.setFact("Structure");
        } else if (layerName == "Collectables_Layer") {
          scene.worldFacts.setFact("Collectable");
        }

        console.log(layer);
        // After clearing, invoke relativeGeneration so the chatbot has an
        // up-to-date view of the scene. Try to set the active selection box
        // to a box that intersects the cleared area so relativeGeneration
        // reports the relevant tiles.
        const _savedActiveBox = scene.activeBox;
        try {
          try {
            const boxes = (scene as any).selectionBoxes || [];
            const clearedX1 = xMin;
            const clearedY1 = yMin;
            const clearedX2 = xMax - 1;
            const clearedY2 = yMax - 1;
            let matched: any = null;
            for (const b of boxes) {
              if (!b || typeof b.getBounds !== "function") continue;
              try {
                const bb = b.getBounds();
                const bx1 = bb.x;
                const by1 = bb.y;
                const bx2 = bb.x + bb.width - 1;
                const by2 = bb.y + bb.height - 1;
                const overlap = !(
                  clearedX2 < bx1 ||
                  clearedX1 > bx2 ||
                  clearedY2 < by1 ||
                  clearedY1 > by2
                );
                if (overlap) {
                  matched = b;
                  break;
                }
              } catch (e) {
                // ignore per-box errors
              }
            }
            if (matched) scene.activeBox = matched;
          } catch (e) {
            // ignore selection box scanning errors
          }

          try {
            await invokeTool("relativeGeneration", {});
          } catch (e) {
            // ignore tool errors
          }
        } finally {
          scene.activeBox = _savedActiveBox;
        }

        // Scan all layers for tiles remaining in the cleared area
        // Layer order: higher index = higher priority (rendered on top)
        const layerOrder: Record<string, number> = {
          "Ground_Layer": 1,
          "Collectables_Layer": 2,
        };
        const clearedLayerRank = layerOrder[layerName] ?? 0;

        const currentBox = getProcessingBox() ?? scene.activeBox;
        const remaining: Array<{ x: number; y: number; tileIndex: number; layer: string; source: string; canClear: boolean; reason: string }> = [];

        for (const layerData of map.layers) {
          if (!layerData.tilemapLayer) continue;
          if (layerData.name === "Background_Layer") continue;
          for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
              const tile = map.getTileAt(x, y, false, layerData.tilemapLayer);
              if (!tile || tile.index < 0) continue;

              const lName = layerData.name;
              let source = "unknown origin";

              if (superDuperRealUserLayer.some(t => t.x === x && t.y === y && t.layerName === lName)) {
                source = "placed by user";
              } else if (baseStartingLayer.some(t => t.x === x && t.y === y && t.layerName === lName)) {
                source = "pre-existing base tile";
              } else if (currentBox?.placedTiles?.some((t: any) => t.x === x && t.y === y && t.layerName === lName)) {
                source = "placed by this agent";
              } else {
                for (const box of allSelectionBoxes) {
                  if (box === currentBox) continue;
                  if (box.placedTiles?.some(t => t.x === x && t.y === y && t.layerName === lName)) {
                    source = "placed by another agent";
                    break;
                  }
                }
              }

              const tileLayerRank = layerOrder[lName] ?? 0;
              const isHigherLayer = tileLayerRank > clearedLayerRank;
              let canClear = false;
              let reason = "";

              if (source === "placed by user") {
                canClear = false;
                reason = "no authority — user-placed tile";
              } else if (source === "placed by this agent") {
                canClear = true;
                reason = "can clear — own tile";
              } else if (source === "pre-existing base tile") {
                canClear = true;
                reason = "can clear — base tile";
              } else if (isHigherLayer) {
                canClear = false;
                reason = `no authority — tile is on a higher layer ('${lName}' is above '${layerName}')`;
              } else {
                canClear = true;
                reason = "can clear — lower layer tile";
              }

              remaining.push({ x, y, tileIndex: tile.index, layer: lName, source, canClear, reason });
            }
          }
        }

        let result = `✅ Cleared ${clearedCount} tile(s) from (${xMin}, ${yMin}) to (${xMax}, ${yMax}) on layer '${layerName}'.`;
        if (clearedCount === 0) {
          result = `✅ No tiles were present to clear from (${xMin}, ${yMin}) to (${xMax}, ${yMax}) on layer '${layerName}'.`;
        }

        if (remaining.length > 0) {
          const onTargetLayer = remaining.filter(t => t.layer === layerName);
          const onOtherLayers = remaining.filter(t => t.layer !== layerName);

          if (onTargetLayer.length > 0) {
            result += `\n⚠️ ${onTargetLayer.length} tile(s) on '${layerName}' could NOT be cleared:`;
            for (const t of onTargetLayer) {
              result += `\n  - (${t.x}, ${t.y}) [tile #${t.tileIndex}] — ${t.source} — ${t.reason}`;
            }
          }

          if (onOtherLayers.length > 0) {
            result += `\n⚠️ ${onOtherLayers.length} tile(s) remain in this area on other layers (visually covering the cleared space):`;
            for (const t of onOtherLayers) {
              result += `\n  - (${t.x}, ${t.y}) on '${t.layer}' [tile #${t.tileIndex}] — ${t.source} — ${t.reason}`;
            }
            const clearable = onOtherLayers.filter(t => t.canClear);
            if (clearable.length > 0) {
              result += `\nYou have authority to clear ${clearable.length} of these — call clearTiles for their respective layers.`;
            }
          }
        }

        return result;
      } catch (e) {
        console.error("removeTileAt failed:", e);
        return "❌ Tool Failed: error while clearing tiles.";
      }
    },
    {
      name: "clearTiles",
      schema: ClearTile.argsSchema,
      description: `
Clears a rectangular section of the map by removing tiles from the specified layer. Also removes any enemies whose position falls within the cleared region.

- (xMin, yMin): top-left inclusive coordinates.
- (xMax, yMax): bottom-right inclusive coordinates.
- layerName: the name of the target map layer. Choose between 'Ground_Layer' and 'Collectables_Layer'
`,
    },
  );
}
