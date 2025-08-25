import Phaser from "phaser";
import { sendUserPrompt } from "../languageModel/chatBox";

export class UIScene extends Phaser.Scene {

  constructor() {
    super({key : "UIScene"}); 
  }

  //Variables
  
  //Data
  private currentBlock: string = "";
  private blocks: string[] = ["block1", "block2", "block3"]; 
  //Registry (Global variables)
  private setPointerOverUI = (v: boolean) => this.registry.set("uiPointerOver", v);

  //UI
  private panel!: Phaser.GameObjects.Container;
  private buttons: Phaser.GameObjects.Text[] = [];

  //Inputs
  private keyR!: Phaser.Input.Keyboard.Key;

  //Chat LLM 
  private chatBox!: Phaser.GameObjects.DOMElement;
  //private selectedTileIndex = 0; // index of the tile to place

  create() {
    // Transparent background
    //this.cameras.main.setBackgroundColor("rgba(0,0,0,0.3)");

    // Build UI panel container
    this.panel = this.add.container(160, 50);
    this.panel.setDepth(1000);

    //Variables
    this.blocks = ["block1", "block2", "block3"]; //Add more blocks to see capabilities

    //Input
    const keys = [
    Phaser.Input.Keyboard.KeyCodes.ONE,
    Phaser.Input.Keyboard.KeyCodes.TWO,
    Phaser.Input.Keyboard.KeyCodes.THREE,
    ];
    
    //Event Input
    // keys.forEach((code, index) => {
    //   const key = this.input.keyboard!.addKey(code);
    //   key.on('down', () => {
    //     this.changeBlock(this.blocks[index]);
    //   });
    // });

    // Buttons
    const startX = 0;
    const startY = 550;
    const gap = 175;
    this.buttons = [];

    // Build the buttons
    this.blocks.forEach((block, i) => {
      const btn = this.createButton(startX + i * (24 + gap), startY, `Set ${block}`, () => this.emitSelect(block));
      this.panel.add(btn);
      //this.buttons.push(btn);
    });
    
    // Place Block button
    const placeX = startX + this.blocks.length * (24 + gap) + gap;
    const placeY = startY;
    const placeBtn = this.createButton(placeX, placeY, "Place Block", () => this.game.events.emit("ui:placeRequested"));
    this.panel.add(placeBtn);

    //Working Code - Manvir

    // Create hidden chatbox
    this.chatBox = this.add.dom(1100, 350).createFromHTML(`
      <div id="chatbox" style="
        width: 300px;
        height: 650px;
        background: rgba(0, 0, 0, 0.85);
        color: white;
        font-family: sans-serif;
        font-size: 15px;
        padding: 20px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        box-shadow: 0 0 8px rgba(0,0,0,0.6);
      ">
        <div id="chat-log" style="flex-grow: 1; overflow-y: auto; font-size: 15px; line-height: 1.5;"></div>
        <input id="chat-input" type="text" placeholder="Type a command..." style="
          margin-top: 16px;
          padding: 14px;
          font-size: 15px;
          border: none;
          border-radius: 4px;
        " />
      </div>
    `);
    this.chatBox.setVisible(true);
    let isChatVisible = true;

    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "c") {
        isChatVisible = !isChatVisible;
        this.chatBox.setVisible(isChatVisible);
      }
    });
    const input = this.chatBox.getChildByID("chat-input") as HTMLInputElement;
    const log = this.chatBox.getChildByID("chat-log") as HTMLDivElement;

    input.addEventListener("keydown", async (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const msg = input.value.trim();
        if (!msg) return;

        input.value = "";
        log.innerHTML += `<p><strong>You:</strong> ${msg}</p>`;
        const reply = await this.sendToGemini(msg);
        log.innerHTML += `<p><strong>Pewter:</strong> ${reply}</p>`;
        log.scrollTop = log.scrollHeight;
      }
    });
  }

  //Working Code - Jason Cho (Helper functions)

  //Change currentBlock to block
  private changeBlock(block: string) {
    this.currentBlock = block;
    console.log("CurrentBlock changed to:", this.currentBlock);
  }

  //Placeholder for placing a block
  private placeBlock() {
    console.log("Placing block:", this.currentBlock);
    // Add actual placement logic here later
  }

  // Return a Container [bg + label], but attach interactivity to the bg rectangle.
  private createButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    opts?: {
      paddingX?: number; paddingY?: number;
      strokeWidth?: number; stroke?: number;
      fill?: number; hoverFill?: number; downFill?: number;
      textColor?: string; fontSize?: number;
      fixedWidth?: number; minHeight?: number;
    }
  ): Phaser.GameObjects.Container {
    const paddingX  = opts?.paddingX  ?? 14;
    const paddingY  = opts?.paddingY  ?? 8;
    const strokeW   = opts?.strokeWidth ?? 2;
    const stroke    = opts?.stroke    ?? 0x000000;
    const fill      = opts?.fill      ?? 0xffffff;
    const hoverFill = opts?.hoverFill ?? 0xeeeeee;
    const downFill  = opts?.downFill  ?? 0xdddddd;
    const fontSize  = opts?.fontSize  ?? 25;
    const textColor = opts?.textColor ?? "#111111";

    // Label
    const txt = this.add.text(0, 0, label, {
      fontSize: `${fontSize}px`,
      color: textColor,
    }).setOrigin(0.5);

    // Size
    const w = Math.max(opts?.fixedWidth ?? (Math.ceil(txt.width) + paddingX * 2), 48);
    const h = Math.max(opts?.minHeight ?? (Math.ceil(txt.height) + paddingY * 2), 28);

    // Background with real border — make THIS the interactive thing
    const bg = this.add.rectangle(0, 0, w, h, fill)
      .setOrigin(0.5)
      .setStrokeStyle(strokeW, stroke)
      .setInteractive({ useHandCursor: true }); // attach events to bg

    // Container groups them (so you can add to panel)
    const btn = this.add.container(x, y, [bg, txt])
      .setSize(w, h);

    // ----- States -----
    bg.on("pointerover", () => {
      bg.setFillStyle(hoverFill);
      this.setPointerOverUI?.(true);     // if you added this helper
    });

    bg.on("pointerout", () => {
      bg.setFillStyle(fill);
      this.setPointerOverUI?.(false);
    });

    bg.on("pointerdown", () => {
      bg.setFillStyle(downFill);
    });

    // Fire only on release *inside*; also handle outside release to reset color
    bg.on("pointerup", () => {
      bg.setFillStyle(hoverFill);
      onClick();
    });

    bg.on("pointerupoutside", () => {
      // released outside: revert to normal, don't click
      bg.setFillStyle(fill);
    });

    return btn;
  }


  
  private emitSelect(block: string) {
    this.game.events.emit("ui:selectBlock", block);
  }

  //Working Code - Manvir (Helper Functions)
  private async sendToGemini(prompt: string): Promise<string> {
    return await sendUserPrompt(prompt);
  }

  public showChatboxAt(x: number, y: number): void {
    this.chatBox.setPosition(x, y);
    this.chatBox.setVisible(true);
    const input = this.chatBox.getChildByID("chat-input") as HTMLInputElement;
    input.focus();
  }
}