import { SelectionBox } from "./selectionBox";
import Phaser from "phaser";

// Minimal mock objects for runtime test
const mockRectangle = {
  setOrigin: function () {
    return this;
  },
  setStrokeStyle: function () {
    return this;
  },
  setFillStyle: function () {
    return this;
  },
  setInteractive: function () {
    return this;
  },
  on: function () {
    return this;
  },
  destroy: function () {
    return this;
  },
};

const mockScene = {
  add: {
    graphics: () => ({
      setDepth: () => {},
      clear: () => {},
      fillStyle: () => {},
      fillRect: () => {},
      lineStyle: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      strokePath: () => {},
      strokeRect: () => {},
    }),
    rectangle: () => Object.create(mockRectangle),
    text: () => ({
      setOrigin: () => {},
      setStyle: () => {},
      destroy: () => {},
    }),
    container: () => ({
      setDepth: () => {},
      setSize: () => {},
      setPosition: () => {},
      destroy: () => {},
    }),
  },
  cameras: {
    main: {
      getWorldPoint: (x: number, y: number) => ({ x, y }),
      width: 100,
      height: 100,
      zoom: 1,
      worldView: { x: 0, y: 0, width: 100, height: 100 },
    },
  },
  input: { on: () => {}, off: () => {} },
} as any;

const mockLayer = { getTileAt: () => ({ index: 1 }) } as any;

console.log("Test started");

async function testSummarizeChatToThemeIntent() {
  console.log("Instantiating SelectionBox...");
  // Use Phaser.Math.Vector2 for vectors
  const start = new Phaser.Math.Vector2(0, 0);
  const end = new Phaser.Math.Vector2(1, 1);
  let box;
  try {
    box = new (SelectionBox as any)(mockScene, start, end, 1, mockLayer);
    console.log("SelectionBox instantiated.");
  } catch (err) {
    console.error("Error instantiating SelectionBox:", err);
    return;
  }

  // Add dummy chat messages
  try {
    const info = box.getInfo ? box.getInfo() : (box as any).info;
    if (info && typeof info.addChatMessage === "function") {
      info.addChatMessage({ content: "User wants a forest area with lots of trees." });
      info.addChatMessage({ content: "Add some wildlife and rivers." });
      console.log("Dummy chat messages added.");
    } else {
      console.warn("Info object not available on SelectionBox in test");
    }
  } catch (err) {
    console.error("Error adding chat messages:", err);
    return;
  }

  // Test the summarization
  try {
    console.log("Calling summarizeChatToThemeIntent...");
    const theme = await box.summarizeChatToThemeIntent();
    console.log("Summarized theme intent:", theme);
    console.log("Theme intent property:", box.getThemeIntent());
  } catch (err) {
    console.error("Error during theme summarization:", err);
  }
}

// Always run the test when this file is loaded
testSummarizeChatToThemeIntent();
