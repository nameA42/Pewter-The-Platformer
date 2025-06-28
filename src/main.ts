import "./style.css";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
    <h1>${getRandEmoji()}</h1>
  </div>
`;

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
