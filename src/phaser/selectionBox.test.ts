import { SelectionBox } from "./selectionBox";
import Phaser from "phaser";

async function testThemeIntentCommunication() {
  console.log("\n--- Theme Intent Communication Test ---");
  const start = new Phaser.Math.Vector2(2, 2);
  const end = new Phaser.Math.Vector2(3, 3);
  const boxA = new (SelectionBox as any)(mockScene, start, end, 1, mockLayer);
  const boxB = new (SelectionBox as any)(mockScene, start, end, 1, mockLayer);

  // Set theme intent on boxA
  boxA.setThemeIntent("forest");
  console.log("boxA theme intent:", boxA.getThemeIntent());

  // Communicate theme from boxA to boxB
  boxA.communicateThemeTo(boxB);
  console.log("boxB theme intent after communication:", boxB.getThemeIntent());

  // Check correctness
  if (boxB.getThemeIntent() === "forest") {
    console.log("Theme intent communication: PASS");
  } else {
    console.error("Theme intent communication: FAIL");
  }
}

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
    box.addChatMessage({
      content: "User wants a forest area with lots of trees.",
    });
    box.addChatMessage({ content: "Add some wildlife and rivers." });
    console.log("Dummy chat messages added.");
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

// Always run the tests when this file is loaded
testSummarizeChatToThemeIntent();
testThemeIntentCommunication();
