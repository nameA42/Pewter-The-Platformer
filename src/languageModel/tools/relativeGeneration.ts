import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class RelativeRegeneration {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  // Accept human instructions; optionally limit history (default: all)
  static argsSchema = z.object({
    instructions: z.string().min(1).describe("What to generate/do relative to the current selection."),
    historyLimit: z.number().int().min(1).optional()
      .describe("If set, only include the most recent N chat messages from the box."),
    includeTilePositions: z.boolean().default(true)
      .describe("If true, include per-tile x/y; otherwise just counts and indices."),
  });

  toolCall = tool(
    async (args: z.infer<typeof RelativeRegeneration.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) return "Tool Failed: no reference to scene.";

      const box = (scene as any).activeBox as any;
      if (!box) return "Tool Failed: no selection box found.";

      // --- Step 1: Check tiles in box
      if (typeof box.checkTilesInBox !== "function") {
        return "Tool Failed: activeBox.checkTilesInBox() not available.";
      }
      const tilesRaw = box.checkTilesInBox() as Array<{ tileIndex:number; x:number; y:number; layerName:string }>;
      const tiles = Array.isArray(tilesRaw) ? tilesRaw : [];
      const tileCount = tiles.length;

      // Optionally strip positions to shrink payloads
      const tileSummary = args.includeTilePositions
        ? tiles
        : tiles.map(t => ({ tileIndex: t.tileIndex, layerName: t.layerName }));

      // Compute simple bounds (in tile coords) for convenience
      const xs = tiles.map(t => t.x);
      const ys = tiles.map(t => t.y);
      const tileBounds = tiles.length
        ? {
            minX: Math.min(...xs),
            minY: Math.min(...ys),
            maxX: Math.max(...xs),
            maxY: Math.max(...ys),
            width: Math.max(...xs) - Math.min(...xs) + 1,
            height: Math.max(...ys) - Math.min(...ys) + 1,
          }
        : null;

      // --- Step 2: Read entire chat history of the box
      const history = typeof box.getChatHistory === "function" ? box.getChatHistory() : (box.localContext?.chatHistory ?? []);
      const trimmedHistory = (args.historyLimit && history.length > args.historyLimit)
        ? history.slice(-args.historyLimit)
        : history;

      // --- Step 3: Prepare a consolidated prompt for regeneration
      // We keep it deterministic: the tool returns a ready prompt;
      // your calling agent can feed this directly into the LLM.
      const generationPrompt =
`You are regenerating content relative to a tile selection.

# Selection Context
- Layer(s): ${[...new Set(tiles.map(t => t.layerName))].join(", ") || "N/A"}
- Tile count: ${tileCount}
- Bounds: ${tileBounds ? `(${tileBounds.minX}, ${tileBounds.minY}) → (${tileBounds.maxX}, ${tileBounds.maxY}) [${tileBounds.width}×${tileBounds.height}]` : "none"}

# Tiles
${tileCount ? JSON.stringify(tileSummary, null, 2) : "[]"}

# Box Chat History (most recent first)
${trimmedHistory.length ? JSON.stringify(trimmedHistory, null, 2) : "[]"}

# Instructions
${args.instructions}

# Requirements
- Use the selection context and chat history to interpret the instructions.
- Keep coordinates in tile space (not pixels).  
- If you propose placements/edits, output them as a JSON array of operations with fields:
  { "op": "place" | "remove" | "replace", "tileIndex": number, "x": number, "y": number, "layerName": string }
- If nothing should change, return an empty array: []
`;

      // Return a single JSON string so the LLM tool caller can parse it easily.
      const result = {
        ok: true,
        meta: {
          layerNames: [...new Set(tiles.map(t => t.layerName))],
          tileCount,
          tileBounds,
          historyCount: trimmedHistory.length,
        },
        tiles: tileSummary,
        chatHistory: trimmedHistory,
        generationPrompt,
      };

      // DEBUG: show the JSON result in the console for easier debugging (UNCOMMENT TO ENABLE)
      try {
        //console.log("relativeGeneration result:", JSON.stringify(result, null, 2));
      } catch (e) {
        // fall back to logging the object
        //console.log("relativeGeneration result (object):", result);
      }

      return JSON.stringify(result);
    },
    {
      name: "relativeGeneration",
      schema: RelativeRegeneration.argsSchema,
      description: `
1) Checks all non-empty tiles inside the current selection box via selectionBox.checkTilesInBox().
2) Reads the selection box's entire chat history (or most recent N via historyLimit).
3) Returns a ready-to-use generationPrompt that combines tiles + history + your instructions.
      `,
    }
  );
}
