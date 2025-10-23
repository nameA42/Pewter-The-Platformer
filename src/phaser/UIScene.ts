import Phaser from "phaser";
import {
  sendUserPromptWithContext,
  getDisplayChatHistory,
} from "../languageModel/chatBox.ts";
import { EditorScene } from "./editorScene.ts";

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: "UIScene" });
  }

  //Variables

  //Data
  private currentBlock: string = "";
  private blocks: string[] = ["block1", "block2", "block3"];
  //Registry (Global variables)
  private setPointerOverUI = (v: boolean) =>
    this.registry.set("uiPointerOver", v);

  //UI
  private panel!: Phaser.GameObjects.Container;
  private buttons: Phaser.GameObjects.Text[] = [];
  private playButton!: Phaser.GameObjects.Container;

  //Inputs
  private keyR!: Phaser.Input.Keyboard.Key;

  //Chat LLM
  private chatBox!: Phaser.GameObjects.DOMElement;
  //private selectedTileIndex = 0; // index of the tile to place

  // Latest selection context
  private latestSelectionContext: string = "";

  create() {
    // Transparent background
    //this.cameras.main.setBackgroundColor("rgba(0,0,0,0.3)");

    // Build UI panel container
    this.panel = this.add.container(-100, 0);
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

    // Buttons - compact, centered on middle button, text 'block#', lifted off bottom
    const buttonWidth = 110;
    const buttonHeight = 38;
    const gap = 16;
    const numButtons = this.blocks.length;
    const centerIndex = Math.floor(numButtons / 2);
    const screenWidth = this.cameras.main.width;
    const centerX = screenWidth / 2;
    const startY = this.cameras.main.height - buttonHeight - 64; // lifted off bottom
    this.buttons = [];

    this.blocks.forEach((block, i) => {
      // Position relative to center button
      const offset = (i - centerIndex) * (buttonWidth + gap);
      const btn = this.createButton(
        this,
        centerX + offset,
        startY,
        `block${i + 1}`,
        () => this.emitSelect(block),
        {
          fixedWidth: buttonWidth,
          minHeight: buttonHeight,
          fontSize: 20,
          paddingX: 8,
          paddingY: 6,
          fill: 0xffffff,
          hoverFill: 0xe0e0e0,
          downFill: 0xcccccc,
          strokeWidth: 2,
          stroke: 0x222222,
          textColor: "#222222",
        },
      );
      this.panel.add(btn);
    });

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
      if (e.key.toLowerCase() === "c" && !e.ctrlKey) {
        isChatVisible = !isChatVisible;
        this.chatBox.setVisible(isChatVisible);
      }
    });

    const input = this.chatBox.getChildByID("chat-input") as HTMLInputElement;
    const log = this.chatBox.getChildByID("chat-log") as HTMLDivElement;

    // Blur input when clicking/tapping outside the chatbox
    try {
      const rootNode = (this.chatBox.node as HTMLElement) || null;
      const onPointerDown = (e: PointerEvent) => {
        try {
          const target = e.target as Node | null;
          if (!rootNode || !target) return;
          if (!rootNode.contains(target)) {
            input.blur();
          }
        } catch (err) {
          // ignore
        }
      };
      window.addEventListener("pointerdown", onPointerDown);

      // clean up when scene shuts down to avoid leaks
      this.events.on("shutdown", () => {
        try {
          window.removeEventListener("pointerdown", onPointerDown);
        } catch (e) {}
      });
    } catch (e) {
      // ignore if DOM not available
    }

    // Listen for changes to the active selection so we always render only the
    // currently-active selection box history.
    if (
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function"
    ) {
      window.addEventListener("activeSelectionChanged", () => {
        try {
          log.innerHTML = getDisplayChatHistory();
          log.scrollTop = log.scrollHeight;
        } catch (e) {
          console.warn("Failed to render active selection history:", e);
        }
      });
    }

    input.addEventListener("keydown", (e: KeyboardEvent) => {
      // Prevent Phaser from capturing WASD and other keys when typing in chat
      e.stopPropagation();
    });

    // Only display new messages as they are sent (not history)
    input.addEventListener("keydown", async (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const userMsg = input.value.trim();
        if (!userMsg) return;

        input.value = "";
        const sendPromise = sendUserPromptWithContext(
          userMsg,
          this.latestSelectionContext,
        );
        // Render the user's message immediately (sendUserPrompt pushes it sync).
        log.innerHTML = getDisplayChatHistory();
        log.scrollTop = log.scrollHeight;

        // Wait for the reply to complete; the activeSelectionChanged listener
        // will re-render the full history (including AI reply), so we don't
        // render again here to avoid double-render or double-push issues.
        await sendPromise;
      }
    });

    // Play mode button - Shawn
    this.createPlayButton();

    // Add a small helper button to select the current temporary selection box
    const selectBoxBtn = this.createButton(
      this,
      220, // x position
      this.cameras.main.height - 50,
      "Deselect Box",
      () => {
        // Emit an event the EditorScene can listen to; per request this will deselect all boxes
        this.game.events.emit("ui:deselectAllBoxes");
      },
      {
        fill: 0x1a1a1a,
        hoverFill: 0x2b6bff,
        downFill: 0x1f4fcf,
        textColor: "#ffffff",
        fontSize: 14,
        paddingX: 10,
        paddingY: 6,
        fixedWidth: 120,
      },
    );
    selectBoxBtn.setDepth(1001);

    this.input.keyboard!.on('keydown-H', () => {
      const editorScene = this.scene.get('editorScene') as EditorScene;
      const activeBox = editorScene.activeBox;
      if (activeBox) {
        activeBox.printPlacedTiles();
      } else {
        console.log('No active selection box.');
      }
    });
  }
  // Receives selection info from EditorScene and displays it in the chatbox
  public handleSelectionInfo(msg: string) {
    this.latestSelectionContext = msg;
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
  public createButton(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    opts?: {
      paddingX?: number;
      paddingY?: number;
      strokeWidth?: number;
      stroke?: number;
      fill?: number;
      hoverFill?: number;
      downFill?: number;
      textColor?: string;
      fontSize?: number;
      fixedWidth?: number;
      minHeight?: number;
    },
  ): Phaser.GameObjects.Container {
    const paddingX = opts?.paddingX ?? 14;
    const paddingY = opts?.paddingY ?? 8;
    const strokeW = opts?.strokeWidth ?? 2;
    const stroke = opts?.stroke ?? 0x000000;
    const fill = opts?.fill ?? 0xffffff;
    const hoverFill = opts?.hoverFill ?? 0xeeeeee;
    const downFill = opts?.downFill ?? 0xdddddd;
    const fontSize = opts?.fontSize ?? 25;
    const textColor = opts?.textColor ?? "#111111";

    // Label
    const txt = scene.add
      .text(0, 0, label, {
        fontSize: `${fontSize}px`,
        color: textColor,
      })
      .setOrigin(0.5);

    // Size
    const w = Math.max(
      opts?.fixedWidth ?? Math.ceil(txt.width) + paddingX * 2,
      48,
    );
    const h = Math.max(
      opts?.minHeight ?? Math.ceil(txt.height) + paddingY * 2,
      28,
    );

    /*const bg1 = scene.add.rectangle(0, 0, w, h, fill)
      .setOrigin(0.5)
      .setStrokeStyle(strokeW, stroke)
      .setInteractive({ useHandCursor: true });
      */

    // Background with real border — make THIS the interactive thing
    const bg = scene.add
      .rectangle(0, 0, w, h, fill)
      .setOrigin(0.5)
      .setStrokeStyle(strokeW, stroke)
      .setInteractive({ useHandCursor: true }); // attach events to bg

    // Container groups them (so you can add to panel)
    const btn = scene.add.container(x, y, [bg, txt]).setSize(w, h);

    // ----- States -----
    bg.on("pointerover", () => {
      bg.setFillStyle(hoverFill);
      (scene as UIScene).setPointerOverUI?.(true);
    });

    bg.on("pointerout", () => {
      bg.setFillStyle(fill);
      (scene as UIScene).setPointerOverUI?.(false);
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
  // ...existing code...

  public showChatboxAt(x: number, y: number): void {
    this.chatBox.setPosition(x, y);
    this.chatBox.setVisible(true);
    const input = this.chatBox.getChildByID("chat-input") as HTMLInputElement;
    input.focus();
    // Clear chat log when chatbox is shown
    const log = this.chatBox.getChildByID("chat-log") as HTMLDivElement;
    log.innerHTML = "";
  }

  private startGame() {
    console.log("Play button clicked!");
    (this.scene.get("editorScene") as EditorScene).startGame();
    this.scene.stop("UIScene");
  }

  // Create the play button - Shawn K
  private createPlayButton() {
    this.playButton = this.createButton(
      this,
      100, // 100 pixels from left of screen
      this.cameras.main.height - 50, // 100 pixels from bottom of screen
      "Play",
      () => {
        this.startGame();
      },
      {
        fill: 0x1a1a1a, // Dark background
        hoverFill: 0x127803, // Green hover
        downFill: 0x0f5f02, // Darker green
        textColor: "#ffffff", // White text
        fontSize: 24,
        paddingX: 15,
        paddingY: 10,
      },
    );

    // Set high depth so it appears above other UI elements
    this.playButton.setDepth(1001);
  }
}
