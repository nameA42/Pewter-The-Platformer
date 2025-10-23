import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class GetSelectionTiles {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  static argsSchema = z.object({
    selectionId: z.string().optional(),
  });

  toolCall = tool(
    async (args: z.infer<typeof GetSelectionTiles.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) return "Tool Failed: no scene reference.";

      let box = scene.activeBox;
      if (args.selectionId) box = scene.getSelectionById(args.selectionId);
      if (!box) return "Tool Failed: no selection box found.";

      // --- Compute bounds from the box itself (avoids any off-by-one in getBounds)
      const s = box.getStart();
      const e = box.getEnd();
      const startX = Math.min(s.x, e.x);
      const startY = Math.min(s.y, e.y);
      const endX   = Math.max(s.x, e.x);
      const endY   = Math.max(s.y, e.y);
      const width  = endX - startX + 1;
      const height = endY - startY + 1;

      // Use the improved copyTiles method from the SelectionBox
      // This will use the same layer detection logic that works correctly
      let tiles: number[][] = [];
      try { 
        box.copyTiles?.(); 
        tiles = box.getSelectedTiles?.() ?? [];
      } catch (e) { 
        // If copyTiles fails, fall back to direct layer reading
        const layersTopDown: Phaser.Tilemaps.TilemapLayer[] = []
          .concat((scene as any).collectablesLayer || [])
          .concat((scene as any).groundLayer || [])
          .filter(Boolean);

        tiles = [];
        if (layersTopDown.length > 0) {
          // Topmost-wins snapshot (current visible truth)
          for (let y = startY; y <= endY; y++) {
            const row: number[] = [];
            for (let x = startX; x <= endX; x++) {
              let chosen = -1;
              for (const layer of layersTopDown) {
                const t = layer.getTileAt(x, y, false);
                const idx = t ? t.index : -1;
                if (idx > 0) { chosen = idx; break; } // first non-empty (topmost)
              }
              row.push(chosen);
            }
            tiles.push(row);
          }
        } else {
          // Last resort: return empty array
          tiles = [];
        }
      }

      return JSON.stringify({ width, height, tiles });
    },
    {
      name: "getSelectionTiles",
      schema: GetSelectionTiles.argsSchema,
      description: `Returns the tile index matrix for the active selection box or selectionId if provided.`,
    }
  );
}
