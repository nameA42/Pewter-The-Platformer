import "./style.css";
import { LoadingScene } from "./phaser/loadingScene.ts";
import { GameScene } from "./phaser/gameScene.ts";

// Initialize the global 'my' object before game initialization
(window as any).my = {
  sprite: {},
  vfx: {},
};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="container">
    <div class="emoji-container">
      <h1>${getRandEmoji()}</h1>
    </div>
    <div class="content-container">
      <div id="phaser"></div>
      <div id="llm-chat">
        <div>
          <ul id="chat-history"></ul>
          <form id="llm-chat-form" autocomplete="off">
            <input type="text" id="llm-chat-input" />
            <button type="submit" id="llm-chat-submit">Send</button>
          </form>
        </div>
      </div>
    </div>
  </div>
`;

//Create Phaser game instance
const game = new Phaser.Game({
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
