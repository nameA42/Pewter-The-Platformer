// Test orchestration: higher box should not be overwritten by lower box regeneration
const { deepStrictEqual } = require("assert");

function placeTile(placements, layer, x, y, tileIndex) {
  placements.push({
    x,
    y,
    tileIndex,
    layerName: layer && layer.layer ? layer.layer.name : "unknown",
  });
}

async function singleRegenMock(box, scene, userPromptFn, ctxSuffix) {
  const start = box.getStart();
  const end = box.getEnd();
  const sX = Math.min(start.x, end.x);
  const sY = Math.min(start.y, end.y);
  const eX = Math.max(start.x, end.x);
  const eY = Math.max(start.y, end.y);
  const layer = box.getLayer();

  // parse HIGHER_BOXES from ctxSuffix
  let higherRects = [];
  try {
    if (ctxSuffix && ctxSuffix.startsWith("HIGHER_BOXES:")) {
      higherRects = JSON.parse(ctxSuffix.substring("HIGHER_BOXES:".length));
    }
  } catch (e) {
    higherRects = [];
  }

  const isInsideAnyHigher = (tx, ty) => {
    for (const h of higherRects) {
      const x0 = h.bounds.x;
      const x1 = h.bounds.x + h.bounds.width;
      const y0 = h.bounds.y;
      const y1 = h.bounds.y + h.bounds.height;
      if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) return true;
    }
    return false;
  };

  // clear outside higher boxes
  for (let y = sY; y <= eY; y++) {
    for (let x = sX; x <= eX; x++) {
      if (!isInsideAnyHigher(x, y))
        placeTile(scene.placements, layer, x, y, -1);
    }
  }

  const reply = await userPromptFn("prompt", ctxSuffix);
  const matrix = JSON.parse(reply);
  for (let ry = 0; ry < matrix.length; ry++) {
    for (let rx = 0; rx < matrix[ry].length; rx++) {
      const tile = matrix[ry][rx];
      const wx = sX + rx;
      const wy = sY + ry;
      if (!isInsideAnyHigher(wx, wy))
        placeTile(scene.placements, layer, wx, wy, tile);
    }
  }
}

(async function () {
  console.log("Running orchestration test");

  // Setup: higher box at (1,1)-(2,2), lower box overlapping at (2,1)-(3,2)
  const higherBox = {
    getStart: () => ({ x: 1, y: 1 }),
    getEnd: () => ({ x: 2, y: 2 }),
    getLayer: () => ({ layer: { name: "Ground_Layer" } }),
    getBounds: () => ({ x: 1, y: 1, width: 2, height: 2 }),
    getZLevel: () => 3,
    getThemeIntent: () => "castle",
    getChatHistory: () => [],
    copyTiles: () => {},
    addPlacedTile: () => {},
    getPlacedTiles: () => [],
  };

  const lowerBox = {
    getStart: () => ({ x: 2, y: 1 }),
    getEnd: () => ({ x: 3, y: 2 }),
    getLayer: () => ({ layer: { name: "Ground_Layer" } }),
    getBounds: () => ({ x: 2, y: 1, width: 2, height: 2 }),
    getZLevel: () => 2,
    getThemeIntent: () => "dungeon",
    getChatHistory: () => [],
    copyTiles: () => {},
    addPlacedTile: () => {},
    getPlacedTiles: () => [],
  };

  const scene = { placements: [] };

  // model for higher box: set tile 9 across its 2x2
  const higherModel = async (p, ctx) =>
    JSON.stringify([
      [9, 9],
      [9, 9],
    ]);
  // model for lower box: would set tile 1 across its 2x2
  const lowerModel = async (p, ctx) =>
    JSON.stringify([
      [1, 1],
      [1, 1],
    ]);

  // First, regen higher box
  await singleRegenMock(higherBox, scene, higherModel, "");
  // Compose HIGHER_BOXES for lower box
  const higherInfo = JSON.stringify([
    {
      bounds: higherBox.getBounds(),
      zLevel: higherBox.getZLevel(),
      theme: higherBox.getThemeIntent(),
      placedTiles: higherBox.getPlacedTiles(),
    },
  ]);

  // Then regen lower box with HIGHER_BOXES context
  await singleRegenMock(
    lowerBox,
    scene,
    lowerModel,
    `HIGHER_BOXES:${higherInfo}`,
  );

  // Evaluate: positions (1,1),(1,2),(2,1),(2,2) are higher box area and should remain tile 9
  // Lower-only positions (3,1),(3,2) should be tile 1
  const final = {};
  for (const p of scene.placements) final[`${p.x},${p.y}`] = p.tileIndex;

  try {
    deepStrictEqual(final["1,1"], 9);
    deepStrictEqual(final["1,2"], 9);
    deepStrictEqual(final["2,1"], 9); // overlap cell should remain 9
    deepStrictEqual(final["2,2"], 9);
    deepStrictEqual(final["3,1"], 1);
    deepStrictEqual(final["3,2"], 1);
  } catch (e) {
    console.error("FAIL", e.message);
    process.exit(1);
  }

  console.log("PASS");
})();
