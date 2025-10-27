"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const phaser_1 = require("phaser");
const editorScene_1 = require("./editorScene");
const chatBox = require("../languageModel/chatBox");
(async function runRegenerateTests() {
  console.log("\n--- Regenerate integration test ---");
  // Create a fake EditorScene instance by using its prototype and assigning needed props
  const scene = Object.create(editorScene_1.EditorScene.prototype);
  // minimal map
  scene.map = { width: 10, height: 10 };
  const placements = [];
  scene.bindMapHistory = () => {
    // noop for test
  };
  // replace placeTile to record placements
  scene.placeTile = (layer, x, y, tileIndex) => {
    // reference layer name to avoid unused param warning
    const _layerName = layer && layer.layer ? layer.layer.name : "unknown";
    void _layerName;
    placements.push({ x, y, tileIndex });
  };
  // Mock SelectionBox (we don't need an actual SelectionBox instance)
  const mockBox = {
    getStart: () => new phaser_1.default.Math.Vector2(1, 1),
    getEnd: () => new phaser_1.default.Math.Vector2(2, 2),
    getLayer: () => ({ layer: { name: "Ground_Layer" } }),
    getChatHistory: () => [
      { _getType: () => "system", content: "sys" },
      { _getType: () => "human", content: "Please regenerate platforms here" },
      { _getType: () => "ai", content: "ok" },
    ],
    getThemeIntent: () => "forest",
    copyTiles: () => {},
  };
  // Spy/mock the model call
  let spyCalled = false;
  let spyArgs = null;
  chatBox.sendUserPromptWithContext = async (userPrompt, hiddenContext) => {
    spyCalled = true;
    spyArgs = { userPrompt, hiddenContext };
    // Return a 2x2 matrix of tile index 5
    return JSON.stringify([
      [5, 5],
      [5, 5],
    ]);
  };
  // Run regeneration
  try {
    await scene.regenerateSelection(mockBox);
  } catch (err) {
    console.error("regenerateSelection threw:", err);
    console.error("FAIL");
    return;
  }
  // Verify model was called with last human message
  if (!spyCalled) {
    console.error("Model was not called");
    console.error("FAIL");
    return;
  }
  if (!spyArgs.userPrompt.includes("Please regenerate platforms")) {
    console.error(
      "Model prompt did not include last user message:",
      spyArgs.userPrompt,
    );
    console.error("FAIL");
    return;
  }
  // Hidden context should include bounds and layer and theme
  if (!spyArgs.hiddenContext.includes("SELECTION_BOUNDS:1,1,2,2")) {
    console.error("Hidden context missing bounds:", spyArgs.hiddenContext);
    console.error("FAIL");
    return;
  }
  if (!spyArgs.hiddenContext.includes("LAYER:Ground_Layer")) {
    console.error("Hidden context missing layer:", spyArgs.hiddenContext);
    console.error("FAIL");
    return;
  }
  if (!spyArgs.hiddenContext.includes("THEME:forest")) {
    console.error("Hidden context missing theme:", spyArgs.hiddenContext);
    console.error("FAIL");
    return;
  }
  // Verify placements contain final tile index 5 for each cell in the selection
  // last placement for each coordinate should be 5
  const finalMap = new Map();
  for (const p of placements) {
    finalMap.set(`${p.x},${p.y}`, p.tileIndex);
  }
  const coords = [
    [1, 1],
    [2, 1],
    [1, 2],
    [2, 2],
  ];
  for (const [x, y] of coords) {
    const key = `${x},${y}`;
    const v = finalMap.get(key);
    if (v !== 5) {
      console.error(
        "Tile at",
        key,
        "expected 5 but got",
        v,
        "placements:",
        placements,
      );
      console.error("FAIL");
      return;
    }
  }
  console.log("regenerateSelection behavior: PASS");
})();
