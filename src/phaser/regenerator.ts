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

  // Try to save map history if available
  try {
    scene.bindMapHistory?.();
  } catch (e) {}

  // Helper to regenerate a single box
  const singleRegen = async (targetBox: SelectionBox, ctxSuffix: string) => {
    const start = targetBox.getStart();
    const end = targetBox.getEnd();
    const sX = Math.min(start.x, end.x);
    const sY = Math.min(start.y, end.y);
    const eX = Math.max(start.x, end.x);
    const eY = Math.max(start.y, end.y);

    const layer = targetBox.getLayer();

    // parse HIGHER_BOUNDS from ctxSuffix (bounds-only protection)
    const higherRects: Phaser.Geom.Rectangle[] = [];
    try {
      if (ctxSuffix && ctxSuffix.startsWith("HIGHER_BOUNDS:")) {
        const jsonPart = ctxSuffix.substring("HIGHER_BOUNDS:".length);
        const parsed = JSON.parse(jsonPart);
        if (Array.isArray(parsed)) {
          for (const h of parsed) {
            try {
              higherRects.push(
                new Phaser.Geom.Rectangle(h.x, h.y, h.width, h.height),
              );
            } catch (e) {
              // ignore
            }
          }
        }
      }
    } catch (e) {}

    const isInsideAnyHigher = (tx: number, ty: number) => {
      for (const r of higherRects) {
        const x0 = r.x;
        const x1 = r.x + r.width;
        const y0 = r.y;
        const y1 = r.y + r.height;
        if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) return true;
      }
      return false;
    };

    // Clear area, preserve tiles inside higher boxes
    if (higherRects.length === 0) {
      try {
        // Clear both Ground and Collectables layers via the tool
        await invokeTool("clearTiles", {
          xMin: sX,
          xMax: eX + 1,
          yMin: sY,
          yMax: eY + 1,
          layerName: "Ground_Layer",
        });
        console.log("Cleared Ground_Layer via tool");
        await invokeTool("clearTiles", {
          xMin: sX,
          xMax: eX + 1,
          yMin: sY,
          yMax: eY + 1,
          layerName: "Collectables_Layer",
        });
        console.log("Cleared Collectables_Layer via tool");
      } catch (toolErr) {
        // fallback manual clear: clear both layers
        for (let y = sY; y <= eY; y++) {
          for (let x = sX; x <= eX; x++) {
            if (x < 0 || y < 0 || x >= scene.map.width || y >= scene.map.height)
              continue;
            try {
              if (scene.groundLayer)
                scene.placeTile(scene.groundLayer, x, y, -1);
            } catch (e) {}
            try {
              if (scene.collectablesLayer)
                scene.placeTile(scene.collectablesLayer, x, y, -1);
            } catch (e) {}
          }
        }
      }
    } else {
      // manual per-tile clear outside higher boxes - clear both layers where allowed
      for (let y = sY; y <= eY; y++) {
        for (let x = sX; x <= eX; x++) {
          if (x < 0 || y < 0 || x >= scene.map.width || y >= scene.map.height)
            continue;
          if (isInsideAnyHigher(x, y)) continue;
          try {
            if (scene.groundLayer) scene.placeTile(scene.groundLayer, x, y, -1);
          } catch (e) {}
          try {
            if (scene.collectablesLayer)
              scene.placeTile(scene.collectablesLayer, x, y, -1);
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
    const baseHidden = `SELECTION_BOUNDS:${sX},${sY},${eX},${eY};LAYER:${layer.layer.name}`;
    const suffix = relativeGenContext
      ? `;${relativeGenContext}`
      : ctxSuffix
        ? `;${ctxSuffix}`
        : "";
    const hiddenContext = baseHidden + suffix;

    // Get last human message for this box
    let lastUserMessageT = "";
    try {
      const chatHistory = targetBox.getChatHistory
        ? targetBox.getChatHistory()
        : [];
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        const msg: any = chatHistory[i];
        if (msg && typeof msg._getType === "function") {
          const t = String(msg._getType()).toLowerCase();
          if (t === "human" || t === "user") {
            lastUserMessageT =
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content);
            break;
          }
        }
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
          if (isInsideAnyHigher(worldX, worldY)) continue;
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

      const regeneratedBounds: any[] = [];
      for (const b of intersecting) {
        const higherContext = regeneratedBounds.length
          ? `HIGHER_BOUNDS:${JSON.stringify(regeneratedBounds)}`
          : "";
        try {
          const info = await singleRegen(b, higherContext);
          regeneratedBounds.push(info);
        } catch (e) {
          // ignore per-box failures
        }
      }
    } catch (e) {
      // orchestration failed
    }
    return;
  }

  try {
    await singleRegen(box, extraHiddenContext);
  } catch (e) {}
}

export default regenerateSelection;
