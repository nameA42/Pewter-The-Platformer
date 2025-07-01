import "./style.css";
import { LoadingScene } from "./phaser/loadingScene.ts";
import { GameScene } from "./phaser/gameScene.ts";
import "./languageModel/chatBox.ts";
import { GravityTool } from "./languageModel/tools/gravityTool.ts";
import {
  initializeTools,
  registerTool,
} from "./languageModel/modelConnector.ts";
import { MoveTool } from "./languageModel/tools/moveTool.ts";

const tools = {
  gravity: new GravityTool(getScene),
  direction: new MoveTool(getScene),
};

Object.values(tools).forEach((generator) => {
  if (generator.toolCall) {
    registerTool(generator.toolCall);
  }
});

initializeTools();

//Create Phaser game instance
const gameInstance = new Phaser.Game({
  type: Phaser.CANVAS,
  render: {
    pixelArt: true,
  },
  physics: {
    default: "arcade",
    arcade: {
      debug: true,
      gravity: {
        x: 0,
        y: 0,
      },
    },
  },
  width: 640,
  height: 400,
  parent: document.getElementById("phaser"),
  scene: [LoadingScene, GameScene],
});

export function getScene(): GameScene {
  if (!gameInstance) throw Error("Scene does not exist >:(");
  console.log(gameInstance.scene.getScene("GameScene"));
  return gameInstance.scene.getScene("GameScene") as GameScene;
}

function getRandEmoji(): string {
  let emoji = [
    ":)",
    ":(",
    ">:(",
    ":D",
    ">:D",
    ":^D",
    ":(",
    ":D",
    "O_O",
    ":P",
    "-_-",
    "O_-",
    "O_o",
    "𓆉",
    "ジ",
    "⊂(◉‿◉)つ",
    "	(｡◕‿‿◕｡)",
    "(⌐■_■)",
    "<|°_°|>",
    "<|^.^|>",
    ":P",
    ":>",
    ":C",
    ":}",
    ":/",
    "ʕ ● ᴥ ●ʔ",
    "(˶ᵔ ᵕ ᵔ˶)",
  ];
  return emoji[Math.floor(Math.random() * emoji.length)];
}
