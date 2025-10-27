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
    // Uniform height (Y tile) for the whole platform
    height: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Uniform Y coordinate (tile) to place the platform row at."),
    // Per-column heights: when provided, its length may be used as width
    heights: z
      .array(z.number().int().min(0))
      .optional()
      .describe("Optional per-column Y coordinates (array length = width)."),
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
      // prefer heights length if provided and width not explicitly set
      const heightsArg = (args as any).heights as number[] | undefined;
      const heightArg = (args as any).height as number | undefined;
      let width = Number(args.width ?? (heightsArg ? heightsArg.length : 5));
      const tileIndex = Number(args.tileIndex ?? 5);
      const layerName = args.layerName ?? "Ground_Layer";

      const map = scene.map;
      const layer = map.getLayer(layerName)?.tilemapLayer;
      if (!layer) return `Tool Failed: layer '${layerName}' not found.`;

      let startX: number | null = null;
      // startY may be a single number or null if using per-column heights
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

      // If we have no explicit startY and no heights, we cannot proceed
      if (startX === null && typeof args.x !== "number")
        return "Tool Failed: unable to compute start X coordinate.";

      // Bounds check preparatory
      const w = map.width;
      const h = map.height;

      // If heights provided, validate length and Y ranges
      if (heightsArg && Array.isArray(heightsArg)) {
        if (heightsArg.length !== width)
          return `Tool Failed: heights length (${heightsArg.length}) does not match width (${width}).`;
        for (let i = 0; i < heightsArg.length; i++) {
          const yv = heightsArg[i];
          if (yv < 0 || yv >= h)
            return `Tool Failed: heights[${i}]=${yv} out of map vertical bounds (0..${h - 1}).`;
        }
      }

      // If a uniform height was provided, validate it
      if (typeof heightArg === "number") {
        if (heightArg < 0 || heightArg >= h)
          return `Tool Failed: height=${heightArg} out of map vertical bounds (0..${h - 1}).`;
      }

      // If we still need a single startY and none provided, ensure selection provided startY
      if (!heightsArg && typeof heightArg !== "number") {
        if (startY === null)
          return "Tool Failed: unable to compute start Y coordinate.";
        if (startY < 0 || startY >= h)
          return `Tool Failed: target Y ${startY} out of bounds.`;
      }

      // Place tiles
      const placedTiles: { x: number; y: number; index: number }[] = [];
      try {
        for (let i = 0; i < width; i++) {
          const x = (startX as number) + i;
          const y =
            heightsArg && heightsArg[i] != null
              ? heightsArg[i]
              : typeof heightArg === "number"
                ? heightArg
                : (startY as number);
          if (x < 0 || x >= w || y < 0 || y >= h)
            return `Tool Failed: computed tile (${x},${y}) out of bounds.`;
          // place tile using map or layer
          try {
            map.putTileAt(tileIndex, x, y, true, layer);
          } catch (e) {
            try {
              layer.putTileAt(tileIndex, x, y);
            } catch (er) {
              throw er || e;
            }
          }
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
        // eslint-disable-next-line no-console
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
        (scene as any).worldFacts?.refresh?.();
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
