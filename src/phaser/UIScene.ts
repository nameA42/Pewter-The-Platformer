import Phaser from "phaser";
import {
  sendUserPromptWithContext,
  getDisplayChatHistory,
} from "../languageModel/chatBox";
import { EditorScene } from "./editorScene.ts";
import "./chatbox.css";

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: "UIScene" });
  }

  public dom!: Phaser.GameObjects.DOMElement;

  //Variables

  //Data
  private currentBlock: string = "";
  private blocks: string[] = ["block1", "block2", "block3"];
  //Registry (Global variables)
  private setPointerOverUI = (v: boolean) =>
    this.registry.set("uiPointerOver", v);

  //UI
  private playButton!: Phaser.GameObjects.Container;

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
    // const keys = [
    //   Phaser.Input.Keyboard.KeyCodes.ONE,
    //   Phaser.Input.Keyboard.KeyCodes.TWO,
    //   Phaser.Input.Keyboard.KeyCodes.THREE,
    // ];

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
    // this.buttons = [];

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
      <div id="chatbox" class="pt-chatbox">
        <div id="tabs" class="pt-tabs">
          <button id="tab-chat" class="pt-tab active">Chat</button>
          <button id="tab-blocks" class="pt-tab">Blocks</button>
        </div>
        <div id="tab-contents" class="pt-tab-contents">
          <div id="chat-content" class="pt-chat-content">
            <div id="chat-log" class="pt-chat-log"></div>
            <input id="chat-input" class="pt-chat-input" type="text" placeholder="Type a command..." autocomplete="off" />
          </div>
          <div id="blocks-content" class="pt-blocks-content">
            <div id="blocks-list" class="pt-blocks-list"></div>
          </div>
        </div>
      </div>
    `);
    this.chatBox.setVisible(true);
    // Make the convenience dom reference point to the created DOM element
    this.dom = this.chatBox;
    let isChatVisible = true;

    // Initialize tabs, blocks list and input handlers
    this.setupTabs();
    this.populateBlocks(this.blocks);
    this.setupInput();

    // Toggle chatbox (and notify other scenes to toggle overview/minimap)
    if (this.input && this.input.keyboard) {
      this.input.keyboard.on("keydown-C", (e: KeyboardEvent) => {
        if ((e as KeyboardEvent).ctrlKey) return; // ignore Ctrl+C
        isChatVisible = !isChatVisible;
        this.chatBox.setVisible(isChatVisible);
        try {
          this.game.events.emit("ui:toggleMinimap", isChatVisible);
        } catch (err) {
          // ignore
        }
      });

      this.events.on("shutdown", () => {
        try {
          // Guard against `this.input` or `this.input.keyboard` being null
          this.input.keyboard?.off?.("keydown-C");
        } catch (err) {
          // ignore
        }
      });
    } else {
      // Fallback for non-Phaser environments
      window.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key.toLowerCase() === "c" && !e.ctrlKey) {
          isChatVisible = !isChatVisible;
          this.chatBox.setVisible(isChatVisible);
          try {
            this.game.events.emit("ui:toggleMinimap", isChatVisible);
          } catch (err) {}
        }
      });
    }

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

    this.input.keyboard!.on("keydown-H", () => {
      const editorScene = this.scene.get("editorScene") as EditorScene;
      const activeBox = editorScene.activeBox;
      if (activeBox) {
        activeBox.printPlacedTiles();
      } else {
        console.log("No active selection box.");
      }
    });
  }

  //Stuff to set up the selection box:

  public populateBlocks(blocks: string[]) {
    try {
      const blocksList = this.dom.getChildByID(
        "blocks-list",
      ) as HTMLDivElement | null;
      if (!blocksList) {
        console.log("Unable to populate block list!");
        return;
      }
      blocksList.innerHTML = "";
      for (const block of blocks) {
        const b = document.createElement("button");
        // Use the block name for the label and emit selection so other scenes can react
        b.textContent = block;
        b.addEventListener("click", () => this.emitSelect(block));
        blocksList.appendChild(b);
      }
    } catch (e) {
      // ignore
    }
  }

  private setupTabs() {
    try {
      const tabChat = this.dom.getChildByID(
        "tab-chat",
      ) as HTMLButtonElement | null;
      const tabBlocks = this.dom.getChildByID(
        "tab-blocks",
      ) as HTMLButtonElement | null;
      const chatContent = this.dom.getChildByID(
        "chat-content",
      ) as HTMLDivElement | null;
      const blocksContent = this.dom.getChildByID(
        "blocks-content",
      ) as HTMLDivElement | null;
      const log = this.dom.getChildByID("chat-log") as HTMLDivElement | null;
      if (!tabChat || !tabBlocks || !chatContent || !blocksContent || !log)
        return;

      const switchToChat = () => {
        tabChat.classList.add("active");
        tabBlocks.classList.remove("active");
        chatContent.style.display = "flex";
        blocksContent.style.display = "none";
        this.updateLog();
      };

      const switchToBlocks = () => {
        tabBlocks.classList.add("active");
        tabChat.classList.remove("active");
        chatContent.style.display = "none";
        blocksContent.style.display = "flex";
      };

      tabChat.addEventListener("click", switchToChat);
      tabBlocks.addEventListener("click", switchToBlocks);

      // default to chat
      switchToChat();
    } catch (e) {
      // ignore
    }
  }

  private setupInput() {
    return;
  }

  // Helper to refresh the chat log DOM from the language model history
  private updateLog(): void {
    try {
      const log = this.dom?.getChildByID("chat-log") as HTMLDivElement | null;
      if (!log) return;
      log.innerHTML = getDisplayChatHistory();
      log.scrollTop = log.scrollHeight;
    } catch (e) {
      // ignore
    }
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
