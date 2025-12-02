import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";
import { SelectionBox } from "../../phaser/selectionBox.ts";

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
        const selectionBoxes = scene.selectionBoxes;

        type Coord = [number, number];
        type Selection = [Coord, Coord];

        let affectedSelections: Selection[] = [];

        for (let i = 0; i < selectionBoxes.length; i++) {
          const sel = selectionBoxes[i];
          if (sel.getActive() == true) {
            continue;
          }

          const sx = sel.getStart().x;
          const sy = sel.getStart().y;
          const ex = sel.getEnd().x;
          const ey = sel.getEnd().y;

          const overlaps = ex >= xMin && sx <= xMax && ey >= yMin && sy <= yMax;

          if (overlaps) {
            affectedSelections.push([
              [Math.max(sx, xMin), Math.max(sy, yMin)],
              [Math.min(ex, xMax), Math.min(ey, yMax)],
            ]);
          }
        }

        for (let x = xMin; x < xMax; x++) {
          for (let y = yMin; y < yMax; y++) {
            let insideSelection = false;

            for (const sel of affectedSelections) {
              const [[sx, sy], [ex, ey]] = sel;

              if (x >= sx && x <= ex && y >= sy && y <= ey) {
                insideSelection = true;
                break;
              }
            }

            if (!insideSelection) {
              layer.removeTileAt(x, y);
            }
          }
        }

        if (layerName == "Ground_Layer") {
          scene.worldFacts.setFact("Structure");
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
`,
    },
  );
}
