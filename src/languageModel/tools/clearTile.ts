import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { invokeTool } from "../modelConnector";
import { z } from "zod";
import { getProcessingBox } from "../chatBox";

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
        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            map.removeTileAt(x, y, false, false, layer);
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
Clears a rectangular section of the map by removing tiles from the specified layer. Also removes any enemies whose position falls within the cleared region.

- (xMin, yMin): top-left inclusive coordinates.
- (xMax, yMax): bottom-right inclusive coordinates.
- layerName: the name of the target map layer. Choose between 'Ground_Layer' and 'Collectables_Layer'
`,
    },
  );
}
