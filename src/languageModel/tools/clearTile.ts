import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class ClearTile {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  // New schema: tile index + coordinates + layer name
  static argsSchema = z.object({
    xMin: z.number().int().min(0),
    xMax: z.number().int().min(0),
    yMin: z.number().int().min(0),
    yMax: z.number().int().min(0),
    layerName: z.string(),
  });

  toolCall = tool(
    async (args: z.infer<typeof ClearTile.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        console.log("getSceneFailed");
        return "Tool Failed: no reference to scene.";
      }

      const { xMin, xMax, yMin, yMax, layerName } = args;
      const map = scene.map;
      const layer = map.getLayer(layerName)?.tilemapLayer;

      if (!layer) {
        return `Tool Failed: layer '${layerName}' not found.`;
      }

      for (let x: number = xMin; x < xMax; x++) {
        for (let y: number = yMin; y < yMax; y++) {
          map.removeTileAt(x, y, false, false, layer);
        }
      }
      return `Cleared grid of tile from (${xMin}, ${yMin}) up to (${xMax}, ${yMax}) on layer '${layerName}'.`;
    },
    {
      name: "placeSingleTile",
      schema: ClearTile.argsSchema,
      description: "Clears a section of the map given a selection.",
    },
  );
}
