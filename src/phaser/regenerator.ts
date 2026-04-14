import Phaser from "phaser";
import { invokeTool } from "../languageModel/modelConnector";
import { sendUserPromptHidden } from "../languageModel/chatBox";
import { SelectionBox } from "./selectionBox";

/**
 * Regenerator: extracted from EditorScene.regenerateSelection.
 * Accepts a scene-like object (must provide map, placeTile, selectionBoxes)
 * and a SelectionBox to operate on. This is intentionally a lightweight
 * module to avoid circular imports; scene is typed as any.
 */
export async function regenerateSelection(
  scene: any,
  box: SelectionBox,
  propagateLower: boolean = true,
  extraHiddenContext: string = "",
  visited: Set<SelectionBox> = new Set(),
): Promise<void> {
  if (!box) throw new Error("No box provided");
  if (visited.has(box)) return;
  visited.add(box);

  // Save current activeBox so we can restore it after any temporary changes
  const _savedActiveBox = scene.activeBox;

  // Try to save map history if available
  try {
    scene.bindMapHistory?.();
  } catch (e) {}

  const rectFromBox = (b: SelectionBox) => {
    const start = b.getStart();
    const end = b.getEnd();
    const sX = Math.min(start.x, end.x);
    const sY = Math.min(start.y, end.y);
    const eX = Math.max(start.x, end.x);
    const eY = Math.max(start.y, end.y);
    return { sX, sY, eX, eY };
  };

  const getLayerName = (b: SelectionBox): string => {
    try {
      const l = b.getLayer();
      return l?.layer?.name ?? "";
    } catch (e) {
      return "";
    }
  };

  const getChatHumanSummary = (
    b: SelectionBox,
    maxMessages: number = 4,
  ): string => {
    try {
      const chatHistory = (b as any).getChatHistory
        ? (b as any).getChatHistory()
        : [];
      const humanMessages: string[] = [];
      for (let i = 0; i < chatHistory.length; i++) {
        const msg: any = chatHistory[i];
        if (!msg || typeof msg._getType !== "function") continue;
        const t = String(msg._getType()).toLowerCase();
        if (t !== "human" && t !== "user") continue;
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        if (content) humanMessages.push(content);
      }
      return humanMessages.slice(-maxMessages).join("\n");
    } catch (e) {
      return "";
    }
  };

  // Helper to regenerate a single box
  const singleRegen = async (
    targetBox: SelectionBox,
    ctxSuffix: string,
    protectedRects: Phaser.Geom.Rectangle[] = [],
  ) => {
    const { sX, sY, eX, eY } = rectFromBox(targetBox);

    const layer = targetBox.getLayer();
    const layerName: string = layer?.layer?.name ?? "";

    // Parse optional HIGHER_BOUNDS from ctxSuffix (legacy) and treat them as protected.
    // Tiles inside protected rects must not be cleared or overwritten.
    const parsedProtected: Phaser.Geom.Rectangle[] = [];
    try {
      if (ctxSuffix && ctxSuffix.startsWith("HIGHER_BOUNDS:")) {
        const jsonPart = ctxSuffix.substring("HIGHER_BOUNDS:".length);
        const parsed = JSON.parse(jsonPart);
        if (Array.isArray(parsed)) {
          for (const h of parsed) {
            try {
              parsedProtected.push(
                new Phaser.Geom.Rectangle(h.x, h.y, h.width, h.height),
              );
            } catch (e) {
              // ignore
            }
          }
        }
      }
    } catch (e) {}

    const allProtectedRects = [...protectedRects, ...parsedProtected];

    const isInsideAnyProtected = (tx: number, ty: number) => {
      for (const r of allProtectedRects) {
        const x0 = r.x;
        const x1 = r.x + r.width;
        const y0 = r.y;
        const y1 = r.y + r.height;
        if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) return true;
      }
      return false;
    };

    // Clear area on ONLY the SelectionBox's layer.
    // If we have protected rects (e.g. regenerated lower-z selections), do not
    // clear inside them.
    if (allProtectedRects.length === 0) {
      try {
        if (!layerName) throw new Error("SelectionBox has no layer name");
        await invokeTool("clearTiles", {
          xMin: sX,
          xMax: eX + 1,
          yMin: sY,
          yMax: eY + 1,
          layerName,
        });
        console.log(`Cleared ${layerName} via tool`);
      } catch (toolErr) {
        for (let y = sY; y <= eY; y++) {
          for (let x = sX; x <= eX; x++) {
            if (x < 0 || y < 0 || x >= scene.map.width || y >= scene.map.height)
              continue;
            try {
              if (layer) scene.placeTile(layer, x, y, -1);
            } catch (e) {}
          }
        }
      }
    } else {
      for (let y = sY; y <= eY; y++) {
        for (let x = sX; x <= eX; x++) {
          if (x < 0 || y < 0 || x >= scene.map.width || y >= scene.map.height)
            continue;
          if (isInsideAnyProtected(x, y)) continue;
          try {
            if (layer) scene.placeTile(layer, x, y, -1);
          } catch (e) {}
        }
      }
    }

    // Invoke relative regeneration to capture current tile state
    // after clearing but before regenerating
    let relativeGenContext = "";
    try {
      scene.activeBox = targetBox;
      const relGenResult = await invokeTool("relativeGeneration", {});
      if (relGenResult) {
        relativeGenContext = `RELATIVE_TILES:${relGenResult}`;
      }
    } catch (e) {
      // ignore if tool fails
    }

    // Build hidden context (only bounds + layer; no cross-box chat/theme/tiles)
    const baseHidden = `SELECTION_BOUNDS:${sX},${sY},${eX},${eY};LAYER:${layerName}`;
    const suffix = relativeGenContext
      ? `;${relativeGenContext}`
      : ctxSuffix
        ? `;${ctxSuffix}`
        : "";
    const hiddenContext = baseHidden + suffix;

    // Build a combined human chat log for this box (chronological)
    let lastUserMessageT = "";
    try {
      const chatHistory = targetBox.getChatHistory
        ? targetBox.getChatHistory()
        : [];
      const humanMessages: string[] = [];
      for (let i = 0; i < chatHistory.length; i++) {
        const msg: any = chatHistory[i];
        if (msg && typeof msg._getType === "function") {
          const t = String(msg._getType()).toLowerCase();
          if (t === "human" || t === "user") {
            const content =
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content);
            humanMessages.push(content);
          }
        }
      }
      if (humanMessages.length) {
        // join messages with newlines to preserve separation and order
        lastUserMessageT = humanMessages.join("\n");
      }
    } catch (e) {
      lastUserMessageT = "";
    }

    // Call model using hidden prompt so no messages are added to UI
    let tileMatrix: number[][] | null = null;
    try {
      const userPrompt =
        lastUserMessageT ||
        `Regenerate tiles for selection (${sX},${sY})-(${eX},${eY})`;
      const replyText = await sendUserPromptHidden(userPrompt, hiddenContext);
      try {
        const parsed = JSON.parse(replyText);
        if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
          tileMatrix = parsed as number[][];
        }
      } catch (e) {
        // ignore parse errors
      }
    } catch (e) {
      // model call failed
    }

    if (tileMatrix) {
      const height = tileMatrix.length;
      const width = tileMatrix[0]?.length || 0;
      for (let ry = 0; ry < height; ry++) {
        for (let rx = 0; rx < width; rx++) {
          const tileIdx = tileMatrix[ry][rx];
          const worldX = sX + rx;
          const worldY = sY + ry;
          if (
            worldX < 0 ||
            worldY < 0 ||
            worldX >= scene.map.width ||
            worldY >= scene.map.height
          )
            continue;
          if (isInsideAnyProtected(worldX, worldY)) continue;
          scene.placeTile(layer, worldX, worldY, tileIdx);
          try {
            targetBox.addPlacedTile(tileIdx, worldX, worldY, layer.layer.name);
          } catch (e) {}
        }
      }
    }

    try {
      targetBox.copyTiles();
    } catch (e) {}

    const brect = targetBox.getBounds
      ? targetBox.getBounds()
      : { x: sX, y: sY, width: eX - sX + 1, height: eY - sY + 1 };
    return { x: brect.x, y: brect.y, width: brect.width, height: brect.height };
  };

  if (propagateLower) {
    try {
      const allBoxes: any[] = scene.selectionBoxes || [];
      const thisBounds = box.getBounds();
      const intersecting: SelectionBox[] = [];
      for (const b of allBoxes) {
        if (!b) continue;
        try {
          const bb = b.getBounds();
          if (Phaser.Geom.Intersects.RectangleToRectangle(thisBounds, bb)) {
            intersecting.push(b);
          }
        } catch (e) {}
      }
      if (!intersecting.includes(box)) intersecting.push(box);

      // Sort by Z level ascending so regeneration runs from lower -> higher
      intersecting.sort(
        (a, b) =>
          (a.getZLevel ? a.getZLevel() : 0) - (b.getZLevel ? b.getZLevel() : 0),
      );

      const alreadyRegenerated: SelectionBox[] = [];

      for (const b of intersecting) {
        const bz = b.getZLevel ? b.getZLevel() : 0;

        // Protect overlaps with any LOWER selections that have already run.
        const protectedRects: Phaser.Geom.Rectangle[] = [];
        for (const low of alreadyRegenerated) {
          const lz = low.getZLevel ? low.getZLevel() : 0;
          if (lz >= bz) continue;
          try {
            const ib = Phaser.Geom.Rectangle.Intersection(
              b.getBounds(),
              low.getBounds(),
            );
            if (ib && ib.width > 0 && ib.height > 0) protectedRects.push(ib);
          } catch (e) {}
        }

        // For LOWER selections, include context about overlapping HIGHER selections.
        // This is read-only intent context to help S1 preserve areas that will
        // be regenerated by S2/S3 (e.g., "grid of coins").
        let overlapHigherContext = "";
        try {
          const higherOverlaps = intersecting.filter((o) => {
            if (!o || o === b) return false;
            const oz = o.getZLevel ? o.getZLevel() : 0;
            if (oz <= bz) return false;
            try {
              return Phaser.Geom.Intersects.RectangleToRectangle(
                b.getBounds(),
                o.getBounds(),
              );
            } catch (e) {
              return false;
            }
          });

          if (higherOverlaps.length) {
            const list = higherOverlaps.map((o) => {
              const r = rectFromBox(o);
              return {
                z: o.getZLevel ? o.getZLevel() : 0,
                layer: getLayerName(o),
                bounds: { x1: r.sX, y1: r.sY, x2: r.eX, y2: r.eY },
                intent: getChatHumanSummary(o, 4),
              };
            });
            overlapHigherContext = `OVERLAPPING_HIGHER_SELECTIONS:${JSON.stringify(list)}`;
          }
        } catch (e) {
          overlapHigherContext = "";
        }

        const ctxParts: string[] = [];
        if (overlapHigherContext) ctxParts.push(overlapHigherContext);
        if (extraHiddenContext) ctxParts.push(extraHiddenContext);
        const ctxSuffix = ctxParts.join(";");

        try {
          if (overlapHigherContext) {
            console.log(
              "Regen overlap context for box",
              (b as any).localContext?.id ?? "?",
              overlapHigherContext,
            );
          }
          await singleRegen(b, ctxSuffix, protectedRects);
        } catch (e) {
          // ignore per-box failures
        }

        alreadyRegenerated.push(b);
      }

      // After finishing propagation, invoke relativeGeneration with the
      // originally requested box as active so the chatbot sees the updated
      // tiles for that selection before continuing the conversation.
      try {
        scene.activeBox = box;
        await invokeTool("relativeGeneration", {});
      } catch (e) {
        // ignore tool errors
      } finally {
        scene.activeBox = _savedActiveBox;
      }
    } catch (e) {
      // orchestration failed
    }
    return;
  }

  try {
    await singleRegen(box, extraHiddenContext, []);

    // After single-box regeneration, update chatbot with current scene
    try {
      scene.activeBox = box;
      await invokeTool("relativeGeneration", {});
    } catch (e) {
      // ignore
    } finally {
      scene.activeBox = _savedActiveBox;
    }
  } catch (e) {}
}

export default regenerateSelection;
