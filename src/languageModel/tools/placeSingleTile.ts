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

    // layerName removed — hardcoded to Ground_Layer
  });

  toolCall = tool(
    async (args: z.infer<typeof PlaceSingleTile.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        console.log("getSceneFailed");
        return "Tool Failed: no reference to scene.";
      }

      const { tileIndex, x, y } = args;
      const map = scene.map;
      const layerName = "Ground_Layer";
      const layer = map.getLayer(layerName)?.tilemapLayer;
      if (!layer) return `Tool Failed: layer '${layerName}' not found.`;
      map.putTileAt(tileIndex, x, y, true, layer);

      //Record the placement
      // Prefer history-aware API when present
      try {
        if ((scene as any).applyTileMatrixWithHistoryPublic) {
          let note = "placeSingleTile";
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
            { x, y, w: 1, h: 1 },
            [[tileIndex]],
            null,
            "chat",
            scene.activeBox?.getId?.(),
            note,
            layerName,
          );
        } else {
          if (scene.activeBox) scene.activeBox.addPlacedTile(tileIndex, x, y, layerName);
        }
      } catch (e) {
        if (scene.activeBox) scene.activeBox.addPlacedTile(tileIndex, x, y, layerName);
      }

      // Hardcoded to Ground_Layer
      scene.worldFacts.setFact("Structure");
      return `✅ Placed tile ${tileIndex} at (${x}, ${y}) on layer '${layerName}'.`;
    },
    {
      name: "placeSingleTile",
      schema: PlaceSingleTile.argsSchema,
      description: `
        Places a single tile at the given tile coordinates (x, y) on the specified map layer.

        - tileIndex: numeric ID of the tile to place.
        - x, y: integer tile coordinates (not pixels).
  Note: This tool places tiles on the Ground_Layer only.
        `,
    },
  );
}
