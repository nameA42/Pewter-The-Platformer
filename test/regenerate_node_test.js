// Standalone runtime test for the regenerateSelection behavior
// This file intentionally avoids TypeScript so it can be run with node directly.

function placeTile(placements, layer, x, y, tileIndex) {
  // record placements
  placements.push({
    x,
    y,
    tileIndex,
    layerName: layer && layer.layer ? layer.layer.name : "unknown",
  });
}

async function regenerateSelectionMock(box, scene, sendUserPromptWithContext) {
  if (!box) throw new Error("No box");
  // bindMapHistory
  if (scene.bindMapHistory) scene.bindMapHistory();

  const start = box.getStart();
  const end = box.getEnd();
  const sX = Math.min(start.x, end.x);
  const sY = Math.min(start.y, end.y);
  const eX = Math.max(start.x, end.x);
  const eY = Math.max(start.y, end.y);

  const layer = box.getLayer();
  // clear
  for (let y = sY; y <= eY; y++) {
    for (let x = sX; x <= eX; x++) {
      placeTile(scene.placements, layer, x, y, -1);
    }
  }

  // last user message
  let lastUserMessage = "";
  try {
    const chat = box.getChatHistory();
    for (let i = chat.length - 1; i >= 0; i--) {
      const m = chat[i];
      const t = (m._getType && m._getType()) || m.type || "";
      if (
        String(t).toLowerCase() === "human" ||
        String(t).toLowerCase() === "user"
      ) {
        lastUserMessage =
          typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        break;
      }
    }
  } catch (e) {
    lastUserMessage = "";
  }

  const theme =
    typeof box.getThemeIntent === "function" ? box.getThemeIntent() : "";
  const hiddenContext = `SELECTION_BOUNDS:${sX},${sY},${eX},${eY};LAYER:${layer.layer.name};THEME:${theme}`;

  const userPrompt =
    lastUserMessage ||
    `Regenerate tiles for selection (${sX},${sY})-(${eX},${eY})`;
  const reply = await sendUserPromptWithContext(userPrompt, hiddenContext);

  let matrix = null;
  try {
    matrix = JSON.parse(reply);
    if (!Array.isArray(matrix) || !Array.isArray(matrix[0])) matrix = null;
  } catch (e) {
    matrix = null;
  }

  if (matrix) {
    for (let ry = 0; ry < matrix.length; ry++) {
      for (let rx = 0; rx < matrix[ry].length; rx++) {
        const tile = matrix[ry][rx];
        const worldX = sX + rx;
        const worldY = sY + ry;
        placeTile(scene.placements, layer, worldX, worldY, tile);
      }
    }
  } else {
    for (let y = sY; y <= eY; y++) {
      for (let x = sX; x <= eX; x++) {
        placeTile(scene.placements, layer, x, y, 1);
      }
    }
  }

  if (typeof box.copyTiles === "function") box.copyTiles();
}

// Test runner
(async function () {
  console.log("\nStandalone regenerate runtime test");

  const scene = { placements: [], bindMapHistory: () => {} };

  const mockBox = {
    getStart: () => ({ x: 1, y: 1 }),
    getEnd: () => ({ x: 2, y: 2 }),
    getLayer: () => ({ layer: { name: "Ground_Layer" } }),
    getChatHistory: () => [
      { _getType: () => "system", content: "sys" },
      { _getType: () => "human", content: "Generate platforms" },
    ],
    getThemeIntent: () => "forest",
    copyTiles: () => {},
  };

  let called = false;
  let captured = null;
  const mockModel = async (userPrompt, hiddenContext) => {
    called = true;
    captured = { userPrompt, hiddenContext };
    return JSON.stringify([
      [5, 5],
      [5, 5],
    ]);
  };

  await regenerateSelectionMock(mockBox, scene, mockModel);

  if (!called) return console.error("FAIL: model not called");
  if (!captured.userPrompt.includes("Generate platforms"))
    return console.error("FAIL: prompt missing");
  if (!captured.hiddenContext.includes("SELECTION_BOUNDS:1,1,2,2"))
    return console.error("FAIL: hidden context missing bounds");
  if (!captured.hiddenContext.includes("LAYER:Ground_Layer"))
    return console.error("FAIL: hidden context missing layer");
  if (!captured.hiddenContext.includes("THEME:forest"))
    return console.error("FAIL: hidden context missing theme");

  // Verify placements
  const final = {};
  for (const p of scene.placements) final[`${p.x},${p.y}`] = p.tileIndex;
  const coords = ["1,1", "2,1", "1,2", "2,2"];
  for (const c of coords)
    if (final[c] !== 5)
      return console.error("FAIL: expected tile 5 at", c, "got", final[c]);

  console.log("PASS");
})();
