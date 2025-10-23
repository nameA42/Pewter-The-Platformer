import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class GetPlacedTiles {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  // Optionally allow selection by box index or ID
  static argsSchema = z.object({
    selectionId: z.string().optional().describe("Optional selectionId to query. If omitted, uses the active selection box."),
  });

  toolCall = tool(
    async (args: z.infer<typeof GetPlacedTiles.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        return "Tool Failed: no reference to scene.";
      }

      // Get the selection box
      // Try to resolve selection box in a few ways:
      // 1. If selectionId provided, look it up in finalized boxes
      // 2. Fallback to current activeBox (temporary)
      // 3. Fallback to lastSelectionBBox id stored on the scene
      let box: any = null;
      if (args.selectionId) {
        try {
          box = scene.getSelectionById(args.selectionId as any);
        } catch (e) {
          box = null;
        }
      }

      if (!box) {
        try {
          box = (scene as any).activeBox ?? null;
        } catch (e) {
          box = null;
        }
      }

      if (!box) {
        try {
          const last = (scene as any).getLastSelectionBBox?.();
          if (last && last.id) box = scene.getSelectionById(last.id as any);
        } catch (e) {
          // ignore
        }
      }

      if (!box) {
        return "Tool Failed: no selection box found.";
      }

      const placedTiles = box.getPlacedTiles?.();
      if (!placedTiles || placedTiles.length === 0) {
        return "No tiles have been placed in this selection box.";
      }

      // Return as a JSON string for LLM
      return JSON.stringify(placedTiles);
    },
    {
      name: "getPlacedTiles",
      schema: GetPlacedTiles.argsSchema,
      description: `
Returns a list of all tiles placed in a selection box.
Each tile includes its index, coordinates, and layer name.
      `,
    }
  );
}