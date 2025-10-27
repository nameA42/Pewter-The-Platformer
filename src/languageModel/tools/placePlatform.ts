import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { EditorScene } from "../../phaser/editorScene.ts";

export class PlacePlatform {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  // If x/y not provided, default to using active selection box
  static argsSchema = z.object({
    side: z
      .enum(["left", "right"])
      .optional()
      .describe("Side of the selection to place the platform on (left/right)."),
    width: z
      .number()
      .int()
      .min(1)
      .max(32)
      .optional()
      .describe("Platform width in tiles."),
    tileIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Tile index to use for platform blocks."),
    x: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Optional explicit X coordinate (tile) to place the platform starting X).",
      ),
    y: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Optional explicit Y coordinate (tile) for platform row)."),
    layerName: z
      .string()
      .optional()
      .describe("Layer name, defaults to 'Ground_Layer'."),
  });

  toolCall = tool(
    async (args: z.infer<typeof PlacePlatform.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) return "Tool Failed: no reference to scene.";

      const side = args.side ?? "left";
      const width = Number(args.width ?? 5);
      const tileIndex = Number(args.tileIndex ?? 5);
      const layerName = args.layerName ?? "Ground_Layer";

      const map = scene.map;
      const layer = map.getLayer(layerName)?.tilemapLayer;
      if (!layer) return `Tool Failed: layer '${layerName}' not found.`;

      let startX: number | null = null;
      let startY: number | null = null;

      // Prefer explicit coordinates if provided
      if (typeof args.x === "number" && typeof args.y === "number") {
        startX = args.x;
        startY = args.y;
      } else {
        // Try to use active selection box
        const anyScene: any = scene as any;
        const activeBox = anyScene.activeBox as any;
        if (!activeBox) {
          return "Tool Failed: no active selection box and no explicit coordinates provided.";
        }
        // selectionBox.getBounds returns rectangle with x,y,width,height (tiles)
        const bounds = activeBox.getBounds();
        // Compute placement X: left side -> bounds.x, right side -> bounds.x + bounds.width - width + 1
        if (side === "left") {
          startX = bounds.x;
        } else {
          startX = bounds.x + Math.max(0, bounds.width - width + 1);
        }
        // Compute Y: place platform vertically centered within selection (clamped)
        startY = bounds.y + Math.floor(bounds.height / 2);
      }

      // Ensure startX/startY are numbers
      if (startX === null || startY === null) {
        return "Tool Failed: unable to compute start coordinates.";
      }
      // Bounds check
      const w = map.width;
      const h = map.height;
      if (startX < 0 || startX + width - 1 >= w || startY < 0 || startY >= h) {
        return `Tool Failed: target platform (${startX}-${startX + width - 1}, ${startY}) out of map bounds.`;
      }

      // Place tiles
      const placedTiles: { x: number; y: number; index: number }[] = [];
      try {
        for (let i = 0; i < width; i++) {
          const x = startX + i;
          const y = startY;
          map.putTileAt(tileIndex, x, y, true, layer);
          placedTiles.push({ x: x, y: y, index: tileIndex });
          // record in selection box if available
          try {
            const anyScene: any = scene as any;
            const activeBox = anyScene.activeBox as any;
            if (activeBox && typeof activeBox.addPlacedTile === "function") {
              activeBox.addPlacedTile(tileIndex, x, y, layerName);
            }
          } catch (e) {}
        }
      } catch (e) {
        console.error("PlacePlatform failed while putting tiles:", e);
        return "Tool Failed: error while placing platform tiles.";
      }

      // Mark chunks & refresh world facts
      try {
        const rg = (scene as any).regenerator as any;
        if (rg && typeof rg.markChunksForTilePositions === "function") {
          rg.markChunksForTilePositions(
            placedTiles.map((p) => ({ x: p.x, y: p.y })),
            1,
          );
          try {
            rg.scheduleRegenNow?.();
          } catch (e) {}
        }
      } catch (e) {}

      try {
        scene.worldFacts?.setFact("Structure");
      } catch (e) {}

      return `✅ Placed ${width}-tile platform at (${startX}, ${startY}) on ${layerName} (side=${side}).`;
    },
    {
      name: "placePlatform",
      schema: PlacePlatform.argsSchema,
      description:
        "Place a horizontal platform of a given width on the left or right side of the active selection (defaults: width=5, side=left, tileIndex=5). If x/y are provided, them will be used as starting coordinates.",
    },
  );
}
