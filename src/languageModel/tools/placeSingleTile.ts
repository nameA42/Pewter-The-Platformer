import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class PlaceSingleTile {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  // New schema: tile index + coordinates + layer name
  static argsSchema = z.object({
    tileIndex: z.number().int().min(0),
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    layerName: z.string(),
  });

  toolCall = tool(
    async (args: z.infer<typeof PlaceSingleTile.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        console.log("getSceneFailed");
        return "Tool Failed: no reference to scene.";
      }

      const { tileIndex, x, y, layerName } = args;
      const map = scene.map;
      const layer = map.getLayer(layerName)?.tilemapLayer;

      if (!layer) {
        return `Tool Failed: layer '${layerName}' not found.`;
      }

      console.log(`Placing tile ${tileIndex} at (${x}, ${y}) on layer '${layerName}'`);
      map.putTileAt(tileIndex, x, y, true, layer);
      return `Placed tile ${tileIndex} at (${x}, ${y}) on layer '${layerName}'.`;
    },
    {
      name: "placeSingleTile",
      schema: PlaceSingleTile.argsSchema,
      description:
        "Places a tile at given tile coordinates (x, y) on the given layer in the map.",
    },
  );
}
