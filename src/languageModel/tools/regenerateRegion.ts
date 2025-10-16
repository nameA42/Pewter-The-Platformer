import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { getChatResponse } from "../modelConnector.ts";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export class RegenerateRegion {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  static argsSchema = z.object({
    selectionId: z.string().optional(),
    prompt: z.string().optional(),
    // mode can later steer heuristic vs creative behaviors
    mode: z.enum(["creative", "conservative"]).optional(),
  });

  toolCall = tool(
    async (args: z.infer<typeof RegenerateRegion.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) return "Tool Failed: no scene reference.";

      // Resolve the selection box
      let box: any = scene.activeBox;
      if (args.selectionId) box = scene.getSelectionById(args.selectionId as any);
      if (!box) return "Tool Failed: no selection box found.";

      // Ensure tile copy is populated
      try { box.copyTiles?.(); } catch (e) {}
      const tiles = box.getSelectedTiles?.() ?? [];

      const bounds = box.getBounds();
      const bbox = { x: Math.floor(bounds.x), y: Math.floor(bounds.y), w: Math.floor(bounds.width) + 1, h: Math.floor(bounds.height) + 1 };

      // Gather world facts and recent history for the region
      let worldFacts: any = null;
      try {
        worldFacts = scene.worldFacts ? {
          structure: scene.worldFacts.getFact ? scene.worldFacts.getFact("Structure") : null,
          collectable: scene.worldFacts.getFact ? scene.worldFacts.getFact("Collectable") : null,
          enemy: scene.worldFacts.getFact ? scene.worldFacts.getFact("Enemy") : null,
        } : null;
      } catch (e) { worldFacts = null; }

      let regionHistory: any = [];
      try { regionHistory = scene.getRegionHistory({ x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h }, 10); } catch (e) { regionHistory = []; }

  // Build system prompt that strictly requests a JSON tile matrix and gives an example
  const systemPrompt = `You are a tilemap assistant. You will receive the current tile index matrix for a selection and contextual world facts. Your job is to produce a replacement tile matrix that fits the surrounding terrain. OUTPUT MUST be valid JSON only, with the following schema: {"width": number, "height": number, "tiles": [[int,int,...], ...]} where height equals number of rows and each row has length width. Do not include any explanation or text outside the JSON block.

Example:
Input selection size: 3x2 and selection tiles: [[1,1,1],[6,6,1]]
Acceptable output (JSON only):
{"width":3,"height":2,"tiles":[[1,1,1],[6,6,1]]}

Rules:
- Tile IDs must be integers. Use -1 for empty/no-tile. Valid tile IDs are -1 and non-negative integers up to 255. Values outside this range will be clamped.\n`;

  const userPrompt = `User prompt: ${args.prompt ?? "Regenerate this region to flow better with the surrounding map."}\n\nSelection bbox: ${JSON.stringify(bbox)}\nSelection tiles (rows): ${JSON.stringify(tiles)}\nWorld facts: ${JSON.stringify(worldFacts)}\nRecent region history: ${JSON.stringify(regionHistory)}\nMode: ${args.mode ?? "conservative"}\n\nPlease return only the JSON described above.`;

      // Build a small chat history for the model
      const history = [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)];

      // Call the model
      let reply;
      try {
        const res = await getChatResponse(history);
        if (res.errors && res.errors.length) {
          return `Tool Failed: LLM errors: ${res.errors.join("; ")}`;
        }
        reply = Array.isArray(res.text) ? res.text.join("\n") : String(res.text ?? "");
      } catch (e) {
        return `Tool Failed: LLM call failed: ${String(e)}`;
      }

      // Try to extract JSON object from reply
      let jsonText = reply.trim();
      // If the model wrapped the JSON in backticks or markdown, try to extract braces
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace >= 0) {
        jsonText = jsonText.slice(firstBrace, lastBrace + 1);
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        return `Tool Failed: Could not parse JSON from LLM response. Raw response: ${reply}`;
      }

      // Validate parsed structure
      if (!parsed || typeof parsed.width !== 'number' || typeof parsed.height !== 'number' || !Array.isArray(parsed.tiles)) {
        return `Tool Failed: Invalid matrix schema returned by LLM.`;
      }

      if (parsed.width !== bbox.w || parsed.height !== bbox.h) {
        // Allow case where model returns correct dims inside arrays, but otherwise error
        if (!(parsed.tiles.length === bbox.h && parsed.tiles[0]?.length === bbox.w)) {
          return `Tool Failed: Matrix dimensions (${parsed.width}x${parsed.height}) do not match selection bbox (${bbox.w}x${bbox.h}).`;
        }
      }

      // Ensure tiles are numbers and normalized; clamp to valid range
      const matrix = parsed.tiles.map((row: any) => row.map((v: any) => {
        let n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n) || Number.isNaN(n)) n = -1;
        n = Math.floor(n);
        if (n < -1) n = -1;
        if (n > 255) n = 255;
        return n;
      }));

      // Apply the matrix using the editor's history-aware API
      try {
        if ((scene as any).applyTileMatrixWithHistoryPublic) {
          (scene as any).applyTileMatrixWithHistoryPublic(
            { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h },
            matrix,
            null,
            "chat",
            box.getId?.(),
            args.prompt ?? "regenerateRegion",
            "Ground_Layer",
          );
        } else {
          // Fallback to naive placement
          const layer = scene.map.getLayer("Ground_Layer")?.tilemapLayer;
          for (let dy = 0; dy < bbox.h; dy++) {
            for (let dx = 0; dx < bbox.w; dx++) {
              scene.map.putTileAt(matrix[dy][dx], bbox.x + dx, bbox.y + dy, true, layer);
              if (scene.activeBox) scene.activeBox.addPlacedTile(matrix[dy][dx], bbox.x + dx, bbox.y + dy, "Ground_Layer");
            }
          }
        }
      } catch (e) {
        return `Tool Failed: error applying tile matrix: ${String(e)}`;
      }

      // Update world facts
      try { scene.worldFacts.setFact?.("Structure"); } catch (e) {}

      return `✅ Regenerated region at (${bbox.x},${bbox.y}) size ${bbox.w}x${bbox.h}.`;
    },
    {
      name: "regenerateRegion",
      schema: RegenerateRegion.argsSchema,
      description: `Regenerate the tiles inside a selection box. The model will be called to produce a JSON tile matrix which will then be applied inside the selection only.`,
    },
  );
}
