import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class PlaceGridofTiles {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  // New schema: tile index + coordinates + layer name
  static argsSchema = z.object({
    tileIndex: z.number().int().min(0),
    xMin: z.number().int().min(0),
    xMax: z.number().int().min(0),
    yMin: z.number().int().min(0),
    yMax: z.number().int().min(0),
    layerName: z.string(),
  });

  toolCall = tool(
    async (args: z.infer<typeof PlaceGridofTiles.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        console.log("getSceneFailed");
        return "Tool Failed: no reference to scene.";
      }

      const { tileIndex, xMin, xMax, yMin, yMax, layerName } = args;
      const map = scene.map;
      const layer = map.getLayer(layerName)?.tilemapLayer;

      if (!layer) {
        return `Tool Failed: layer '${layerName}' not found.`;
      }

      for (let x: number = xMin; x < xMax; x++) {
        for (let y: number = yMin; y < yMax; y++) {
          map.putTileAt(tileIndex, x, y, true, layer);
        }
      }
      return `Placed grid of tile with ${tileIndex} from (${xMin}, ${yMin}) up to (${xMax}, ${yMax}) on layer '${layerName}'.`;
    },
    {
      name: "placeGridofTiles",
      schema: PlaceGridofTiles.argsSchema,
      description:
        "Places a grid of tiles at given tile coordinates (xMin, yMin) up to (xMax, yMax) on the given layer in the map.",
    },
  );
}
