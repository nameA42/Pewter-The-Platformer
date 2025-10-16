import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

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
    // layerName removed — hardcoded to Ground_Layer
  });

  toolCall = tool(
    async (args: z.infer<typeof ClearTile.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        console.log("getSceneFailed");
        return "❌ Tool Failed: no reference to scene.";
      }

      const { xMin, xMax, yMin, yMax } = args;
      const map = scene.map;
      const layerName = "Ground_Layer";
      const layer = map.getLayer(layerName)?.tilemapLayer;
      if (!layer) return `❌ Tool Failed: layer '${layerName}' not found.`;

      try {
        // Prefer history-aware API if available
        const w = xMax - xMin;
        const h = yMax - yMin;
          if ((scene as any).applyTileMatrixWithHistoryPublic) {
            let note = "clearTile";
            try {
              const hist = scene.activeBox?.getChatHistory?.();
              if (hist && hist.length) {
                for (let i = hist.length - 1; i >= 0; i--) {
                  const m: any = hist[i];
                  if (m && typeof m._getType === "function" && m._getType() === "human") {
                    note = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
                    break;
                  }
                }
              }
            } catch (e) {}

          (scene as any).applyTileMatrixWithHistoryPublic(
            { x: xMin, y: yMin, w, h },
            null,
            -1,
            "chat",
            scene.activeBox?.getId?.(),
            note,
            layerName,
          );
        } else {
          for (let x = xMin; x < xMax; x++) {
            for (let y = yMin; y < yMax; y++) {
              map.removeTileAt(x, y, false, false, layer);
            }
          }
        }

        // Hardcoded to Ground_Layer
        scene.worldFacts.setFact("Structure");
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

(xMin, yMin): top-left inclusive coordinates.
(xMax, yMax): bottom-right exclusive coordinates.
Note: This tool clears tiles on the Ground_Layer only.
`,
    },
  );
}
