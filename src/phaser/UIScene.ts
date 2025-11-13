import Phaser from "phaser";
import { sendUserPromptWithContext } from "../languageModel/chatBox";
import ChatBox from "./chatbox";
import { EditorScene } from "./editorScene.ts";

////***Imports***////

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: "UIScene" });
  }

  ////***State / Data***////
  //Data
  private readonly blocks: string[] = ["block1", "block2", "block3"]; //TODO: THIS NEEDS TO BE DYNAMIC
  private isChatVisible: boolean = true;

  ////***Registry (Global variables)***////
  //Registry (Global variables)
  private readonly setPointerOverUI = (v: boolean) =>
    this.registry.set("uiPointerOver", v);

  ////***UI Elements***////
  //UI
  private playButton!: Phaser.GameObjects.Container;

  ////***Chat LLM***////
  //Chat LLM
  private chatBox!: ChatBox;

  ////***Selection Context***////
  // Latest selection context
  private latestSelectionContext: string = "";

  ////***Lifecycle: create()***////
  /**
   * Phaser lifecycle method - invoked by the engine at scene creation time.
   * Kept intentionally as a public lifecycle hook even though static analysis
   * may report it as "unused".
   */
  create() {
    ////***Init: Chatbox, Keyboard, Buttons***////
    this.initChatBox();
    this.setupKeyboardShortcuts();

    // Play mode button - Shawn
    this.createPlayButton();

    // helper button to deselect selection boxes
    this.createSelectBoxButton();
  }

  ////***Event Handlers / Public API***////
  // Receives selection info from EditorScene and displays it in the chatbox
  public handleSelectionInfo(msg: string) {
    this.latestSelectionContext = msg;
  }

  ////***Helpers: Chatbox Initialization***////
  private initChatBox() {
    // Pull chatbox UI into its own module for easier editing
    this.chatBox = new ChatBox(
      this,
      1100,
      350,
      this.blocks,
      async (userMsg: string) => {
        // forward send to language model with current selection context
        const p = sendUserPromptWithContext(
          userMsg,
          this.latestSelectionContext,
        );
        // chatbox will update log; wait for model to finish
        await p;
      },
      (block: string) => this.emitSelect(block),
    );

    this.chatBox.setVisible(this.isChatVisible);

    // Ensure ChatBox is destroyed when this scene shuts down
    this.events.on("shutdown", () => {
      try {
        this.chatBox.destroy();
      } catch (e) {
        // Log any destroy-time errors to help debugging
        // (Phaser sometimes throws when scene is tearing down)
        // eslint-disable-next-line no-console
        console.warn("Error destroying chatBox:", e);
      }
    });
  }

  ////***Helpers: Keyboard Shortcuts***////
  private setupKeyboardShortcuts() {
    // Toggle chatbox visibility with 'c' (avoid Ctrl+C)
    globalThis.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "c" && !e.ctrlKey) {
        this.isChatVisible = !this.isChatVisible;
        this.chatBox.setVisible(this.isChatVisible);
      }
    });

    // H key: print active selection box tiles (uses Phaser input keyboard)
    this.input.keyboard!.on("keydown-H", () => {
      const editorScene = this.scene.get("editorScene") as EditorScene;
      const activeBox = editorScene?.activeBox;
      if (activeBox) {
        activeBox.printPlacedTiles();
      } else {
        // eslint-disable-next-line no-console
        console.log("No active selection box.");
      }
    });
  }

  ////***Helpers: Select Box Button***////
  private createSelectBoxButton() {
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
  }

  ////***Helpers: createButton***////
  //Working Code - Jason Cho (Helper functions)

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

  ////***Events & Commands***////
  private emitSelect(block: string) {
    this.game.events.emit("ui:selectBlock", block);
  }

  private startGame() {
    console.log("Play button clicked!");
    (this.scene.get("editorScene") as EditorScene).startGame();
    this.scene.stop("UIScene");
  }

  ////***Play Button***////
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
