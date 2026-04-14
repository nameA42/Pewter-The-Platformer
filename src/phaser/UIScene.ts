import Phaser from "phaser";
import {
  sendUserPromptWithContext,
  getDisplayChatHistory,
} from "../languageModel/chatBox.ts";
import { EditorScene } from "./editorScene.ts";
import { SpriteGenerator } from "../enemySystem/sprite/SpriteGenerator.ts";
import "./chatbox.css";

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: "UIScene" });
  }

  public dom!: Phaser.GameObjects.DOMElement;
  public panel!: Phaser.GameObjects.Container;

  //Variables

  //Data
  private currentBlock: string = "";
  private collectables: string[] = ["Coin", "Fruit"];
  private terrainBlocks: string[] = [
    "Grass-Half Block",
    "Dirt Block",
    "Question Block",
  ];
  private enemies: string[] = ["Slime Enemy", "Ultra Slime"];
  private eraserTools: string[] = ["Eraser"];
  private blocks: string[] = [];

  //Registry (Global variables)
  private setPointerOverUI = (v: boolean) =>
    this.registry.set("uiPointerOver", v);

  //UI
  private playButton!: Phaser.GameObjects.Container;
  private regenerateButton!: Phaser.GameObjects.Container;
  private deselectBoxBtn!: Phaser.GameObjects.Container;
  private regenAlgoToggle!: Phaser.GameObjects.Container;
  private apiSpriteToggle!: Phaser.GameObjects.Container;

  //Inputs
  private keyR!: Phaser.Input.Keyboard.Key;

  //Chat LLM
  private chatBox!: Phaser.GameObjects.DOMElement;
  //private selectedTileIndex = 0; // index of the tile to place

  // Latest selection context
  private latestSelectionContext: string = "";

  private drawRoundedButtonBackground(
    bg: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    fill: number,
    strokeWidth: number,
    stroke: number,
    cornerRadius: number,
  ): void {
    bg.clear();
    bg.fillStyle(fill, 1);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, cornerRadius);
    if (strokeWidth > 0) {
      bg.lineStyle(strokeWidth, stroke, 1);
      bg.strokeRoundedRect(
        -width / 2,
        -height / 2,
        width,
        height,
        cornerRadius,
      );
    }
  }

  private updateRoundedButtonColors(
    bgObj: Phaser.GameObjects.GameObject,
    fill: number,
    stroke: number,
  ): void {
    if (!(bgObj instanceof Phaser.GameObjects.Graphics)) return;
    const width = (bgObj.getData("buttonWidth") as number) ?? 0;
    const height = (bgObj.getData("buttonHeight") as number) ?? 0;
    const strokeWidth = (bgObj.getData("buttonStrokeWidth") as number) ?? 2;
    const cornerRadius = (bgObj.getData("buttonCornerRadius") as number) ?? 10;
    this.drawRoundedButtonBackground(
      bgObj,
      width,
      height,
      fill,
      strokeWidth,
      stroke,
      cornerRadius,
    );
  }

  create() {
    // Transparent background
    //this.cameras.main.setBackgroundColor("rgba(0,0,0,0.3)");

    // Build UI panel container
    this.panel = this.add.container(-100, 0);
    this.panel.setDepth(1000);

    //Variables
    this.blocks = [
      ...this.collectables,
      ...this.terrainBlocks,
      ...this.enemies,
      ...this.eraserTools,
    ]; //Add more blocks to see capabilities

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

    //Working Code - Manvir

    // Create hidden chatbox
    this.chatBox = this.add.dom(1090, 350).createFromHTML(`
      <div id="chatbox" class="pt-chatbox">
        <div id="tabs" class="pt-tabs">
          <button id="tab-chat" class="pt-tab active">💬 Chat</button>
          <button id="tab-blocks" class="pt-tab">🧱 Manual Edit</button>
          <button id="tab-controls" class="pt-tab">🎮 Controls</button>
        </div>
        <div id="tab-contents" class="pt-tab-contents">
          <div id="chat-content" class="pt-chat-content">
            <div id="chat-log" class="pt-chat-log"></div>
            <input id="chat-input" class="pt-chat-input" type="text" placeholder="Type a command..." autocomplete="off" />
          </div>
          <div id="blocks-content" class="pt-blocks-content">
            <div class="pt-blocks-group">
              <div id="blocks-list-eraser" class="pt-blocks-list"></div>
            </div>
            <div class="pt-blocks-group">
              <h4 class="pt-blocks-heading">Collectables</h4>
              <div id="blocks-list-collectables" class="pt-blocks-list"></div>
            </div>
            <div class="pt-blocks-group">
              <h4 class="pt-blocks-heading">Blocks</h4>
              <div id="blocks-list-terrain" class="pt-blocks-list"></div>
            </div>
            <div class="pt-blocks-group">
              <h4 class="pt-blocks-heading">Enemies</h4>
              <div id="blocks-list-enemies" class="pt-blocks-list"></div>
            </div>
          </div>
          <div id="controls-content" class="pt-controls-content">
            <h3>Basic Controls</h3>
            <div class="control-item">
              <span class="control-key">Left Click</span>
              <span class="control-desc">Place tile (drag to continuously place)</span>
            </div>
            <div class="control-item">
              <span class="control-key">Right Click</span>
              <span class="control-desc">Make a selection box (drag)</span>
            </div>
            <div class="control-item">
              <span class="control-key">WASD</span>
              <span class="control-desc">Move camera & character (Press <strong>Shift</strong> to move slower)</span>
            </div>
            <div class="control-item">
              <span class="control-key">U</span>
              <span class="control-desc">Toggle UI</span>
            </div>
            <h3 style="margin-top: 16px;">Selection Controls</h3>
            <div class="control-item">
              <span class="control-key">Ctrl + C</span>
              <span class="control-desc">Copy selection</span>
            </div>
            <div class="control-item">
              <span class="control-key">Ctrl + X</span>
              <span class="control-desc">Cut selection</span>
            </div>
            <div class="control-item">
              <span class="control-key">Ctrl + V</span>
              <span class="control-desc">Paste selection</span>
            </div>
            <div class="control-item">
              <span class="control-key">Ctrl + Z</span>
              <span class="control-desc">Undo last action</span>
            </div>
            <div class="control-item">
              <span class="control-key">Del</span>
              <span class="control-desc">Delete selected box</span>
            </div>
            <div class="control-item">
              <span class="control-key">N</span>
              <span class="control-desc">Confirm new selection box</span>
            </div>
            <div class="control-item">
              <span class="control-key">O</span>
              <span class="control-desc">Decrease Z-Level</span>
            </div>
            <div class="control-item">
              <span class="control-key">P</span>
              <span class="control-desc">Increase Z-Level</span>
            </div>
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

    // Toggle UI (and notify other scenes to toggle overview/minimap)
    if (this.input && this.input.keyboard) {
      this.input.keyboard.on("keydown-U", (e: KeyboardEvent) => {
        if ((e as KeyboardEvent).ctrlKey) return; // ignore Ctrl+U
        isChatVisible = !isChatVisible;
        this.chatBox.setVisible(isChatVisible);
        this.playButton.setVisible(isChatVisible);
        this.deselectBoxBtn.setVisible(isChatVisible);
        this.regenerateButton.setVisible(isChatVisible);
        this.regenAlgoToggle.setVisible(isChatVisible);
        this.apiSpriteToggle.setVisible(isChatVisible);
        try {
          this.game.events.emit("ui:toggleMinimap", isChatVisible);
        } catch (err) {
          // ignore
        }
      });

      this.events.on("shutdown", () => {
        try {
          // Guard against `this.input` or `this.input.keyboard` being null
          this.input.keyboard?.off?.("keydown-U");
        } catch (err) {
          // ignore
        }
      });
    } else {
      // Fallback for non-Phaser environments
      window.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key.toLowerCase() === "u" && !e.ctrlKey) {
          isChatVisible = !isChatVisible;
          this.chatBox.setVisible(isChatVisible);
          this.playButton.setVisible(isChatVisible);
          this.deselectBoxBtn.setVisible(isChatVisible);
          this.regenerateButton.setVisible(isChatVisible);
          this.regenAlgoToggle.setVisible(isChatVisible);
          this.apiSpriteToggle.setVisible(isChatVisible);
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

    const toolbarButtonHeight = 52;
    const toolbarButtonFontSize = 17;
    const toolbarButtonPaddingX = 16;
    const toolbarButtonPaddingY = 11;
    const toolbarButtonGap = 14;
    const toolbarY = this.cameras.main.height - 50;

    // Play mode button - Shawn
    this.createPlayButton();

    // Add a small helper button to select the current temporary selection box
    this.deselectBoxBtn = this.createButton(
      this,
      220,
      toolbarY,
      "🧹 Deselect Box",
      () => {
        // Emit an event the EditorScene can listen to; per request this will deselect all boxes
        this.game.events.emit("ui:deselectAllBoxes");
      },
      {
        fill: 0x222222,
        hoverFill: 0x222222,
        downFill: 0x1a1a1a,
        stroke: 0x444444,
        hoverStroke: 0xb3b3b3,
        downStroke: 0xd9d9d9,
        textColor: "#ffffff",
        fontSize: toolbarButtonFontSize,
        paddingX: toolbarButtonPaddingX,
        paddingY: toolbarButtonPaddingY,
        minHeight: toolbarButtonHeight,
      },
    );
    this.deselectBoxBtn.setDepth(1001);

    // Linear Regen button - emits a request the EditorScene will handle
    this.regenerateButton = this.createButton(
      this,
      380,
      toolbarY,
      "♻️ Linear Regen",
      () => {
        this.game.events.emit("ui:regenerateSelection");
      },
      {
        fill: 0x222222,
        hoverFill: 0x222222,
        downFill: 0x1a1a1a,
        stroke: 0x444444,
        hoverStroke: 0xb3b3b3,
        downStroke: 0xd9d9d9,
        textColor: "#ffffff",
        fontSize: toolbarButtonFontSize,
        paddingX: toolbarButtonPaddingX,
        paddingY: toolbarButtonPaddingY,
        minHeight: toolbarButtonHeight,
      },
    );
    this.regenerateButton.setDepth(1001);

    // Event Queue Regen button
    this.regenAlgoToggle = this.createButton(
      this,
      550,
      toolbarY,
      "🗂️ Event Queue Regen",
      () => {
        this.game.events.emit("ui:eventQueueRegen");
      },
      {
        fill: 0x222222,
        hoverFill: 0x222222,
        downFill: 0x1a1a1a,
        stroke: 0x444444,
        hoverStroke: 0xb3b3b3,
        downStroke: 0xd9d9d9,
        textColor: "#ffffff",
        fontSize: toolbarButtonFontSize,
        paddingX: toolbarButtonPaddingX,
        paddingY: toolbarButtonPaddingY,
        minHeight: toolbarButtonHeight,
      },
    );
    this.regenAlgoToggle.setDepth(1001);

    // API Sprite Generation toggle button
    // Starts OFF to prevent accidental API credit usage
    this.apiSpriteToggle = this.createButton(
      this,
      740,
      toolbarY,
      "👾 API Sprites: OFF",
      () => {
        // Toggle the API sprite generation
        SpriteGenerator.useExternalApi = !SpriteGenerator.useExternalApi;
        const isEnabled = SpriteGenerator.useExternalApi;

        // Update button text and color
        const txt = this.apiSpriteToggle.list[1] as Phaser.GameObjects.Text;
        const statusTxt = this.apiSpriteToggle
          .list[2] as Phaser.GameObjects.Text;
        const bg = this.apiSpriteToggle
          .list[0] as Phaser.GameObjects.GameObject;

        const stateLabel = isEnabled ? "ON" : "OFF";
        const fullLabel = `👾 API Sprites: ${stateLabel}`;

        txt.setText(fullLabel);
        txt.setColor("#ffffff");

        // Place the colored ON/OFF token at the end of the white prefix.
        txt.setText("👾 API Sprites: ");
        const prefixWidth = txt.width;
        txt.setText(fullLabel);

        const fullWidth = txt.width;
        statusTxt.setText(stateLabel);
        statusTxt.setColor(isEnabled ? "#22c55e" : "#ef4444");
        statusTxt.setPosition(-fullWidth / 2 + prefixWidth, 0);

        if (isEnabled) {
          this.updateRoundedButtonColors(bg, 0x222222, 0xffffff);
        } else {
          this.updateRoundedButtonColors(bg, 0x222222, 0x444444);
        }

        console.log(
          `🎨 API Sprite Generation: ${isEnabled ? "ENABLED" : "DISABLED"}`,
        );
      },
      {
        fill: 0x222222,
        hoverFill: 0x222222,
        downFill: 0x1a1a1a,
        stroke: 0x444444,
        hoverStroke: 0xb3b3b3,
        downStroke: 0xd9d9d9,
        textColor: "#ffffff",
        fontSize: toolbarButtonFontSize,
        paddingX: toolbarButtonPaddingX,
        paddingY: toolbarButtonPaddingY,
        minHeight: toolbarButtonHeight,
      },
    );

    // Overlay just the ON/OFF token in color while keeping the base label white.
    const apiLabel = this.apiSpriteToggle.list[1] as Phaser.GameObjects.Text;
    const apiStatus = this.add
      .text(0, 0, "OFF", {
        fontFamily: "sans-serif",
        fontSize: `${toolbarButtonFontSize}px`,
        color: "#ef4444",
      })
      .setOrigin(0, 0.5);

    apiLabel.setText("👾 API Sprites: OFF");
    apiLabel.setColor("#ffffff");
    apiLabel.setText("👾 API Sprites: ");
    const initialPrefixWidth = apiLabel.width;
    apiLabel.setText("👾 API Sprites: OFF");
    const initialFullWidth = apiLabel.width;
    apiStatus.setPosition(-initialFullWidth / 2 + initialPrefixWidth, 0);
    this.apiSpriteToggle.add(apiStatus);

    this.apiSpriteToggle.setDepth(1001);

    // Layout toolbar buttons based on measured text width with consistent spacing.
    const toolbarButtons = [
      this.playButton,
      this.deselectBoxBtn,
      this.regenerateButton,
      this.regenAlgoToggle,
      this.apiSpriteToggle,
    ];
    let toolbarX = 20;
    for (const btn of toolbarButtons) {
      const w = btn.width || 0;
      btn.setPosition(toolbarX + w / 2, toolbarY);
      toolbarX += w + toolbarButtonGap;
    }

    // Listen for event queue regeneration lifecycle events
    this.game.events.on("eventQueueRegen:started", () => {
      try {
        const bg = this.regenAlgoToggle
          .list[0] as Phaser.GameObjects.GameObject;
        const txt = this.regenAlgoToggle.list[1] as Phaser.GameObjects.Text;
        // Visual feedback: disable interaction and change text
        try {
          bg.disableInteractive();
        } catch (e) {}
        try {
          txt.setText("🗂️ Regenerating...");
        } catch (e) {}
      } catch (e) {
        // ignore
      }
    });

    this.game.events.on("eventQueueRegen:finished", (_payload?: any) => {
      try {
        const bg = this.regenAlgoToggle
          .list[0] as Phaser.GameObjects.GameObject;
        const txt = this.regenAlgoToggle.list[1] as Phaser.GameObjects.Text;
        try {
          bg.setInteractive({ useHandCursor: true });
        } catch (e) {}
        try {
          txt.setText("🗂️ Event Queue Regen");
        } catch (e) {}
      } catch (e) {
        // ignore
      }
    });

    // Listen for regeneration lifecycle events so the button can show feedback
    this.game.events.on("regenerate:started", () => {
      try {
        const bg = this.regenerateButton
          .list[0] as Phaser.GameObjects.GameObject;
        const txt = this.regenerateButton.list[1] as Phaser.GameObjects.Text;
        // Visual feedback: disable interaction and change text
        try {
          bg.disableInteractive();
        } catch (e) {}
        try {
          txt.setText("♻️ Regenerating...");
        } catch (e) {}
      } catch (e) {
        // ignore
      }
    });

    this.game.events.on("regenerate:finished", (_payload?: any) => {
      try {
        const bg = this.regenerateButton
          .list[0] as Phaser.GameObjects.GameObject;
        const txt = this.regenerateButton.list[1] as Phaser.GameObjects.Text;
        try {
          bg.setInteractive({ useHandCursor: true });
        } catch (e) {}
        try {
          txt.setText("♻️ Linear Regen");
        } catch (e) {}
      } catch (e) {
        // ignore
      }
    });

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
      const groupedCollectables = this.dom.getChildByID(
        "blocks-list-collectables",
      ) as HTMLDivElement | null;
      const groupedTerrain = this.dom.getChildByID(
        "blocks-list-terrain",
      ) as HTMLDivElement | null;
      const groupedEnemies = this.dom.getChildByID(
        "blocks-list-enemies",
      ) as HTMLDivElement | null;
      const groupedEraser = this.dom.getChildByID(
        "blocks-list-eraser",
      ) as HTMLDivElement | null;

      if (
        groupedCollectables &&
        groupedTerrain &&
        groupedEnemies &&
        groupedEraser
      ) {
        this.populateBlockGroup(groupedCollectables, this.collectables);
        this.populateBlockGroup(groupedTerrain, this.terrainBlocks);
        this.populateBlockGroup(groupedEnemies, this.enemies);
        this.populateBlockGroup(groupedEraser, this.eraserTools);
        return;
      }

      const blocksList = this.dom.getChildByID(
        "blocks-list",
      ) as HTMLDivElement | null;
      if (!blocksList) {
        console.log("Unable to populate block list!");
        return;
      }
      this.populateBlockGroup(blocksList, blocks);
    } catch (e) {
      // ignore
    }
  }

  private populateBlockGroup(container: HTMLDivElement, blocks: string[]) {
    container.innerHTML = "";
    for (const block of blocks) {
      const b = document.createElement("button");
      if (block === "Eraser") {
        b.textContent = "Eraser 🗑️";
      } else {
        b.textContent = block;
      }

      b.addEventListener("click", () => {
        // Remove 'selected' class from all block buttons in the Blocks tab
        const allBlockButtons = (
          this.chatBox.node as HTMLElement
        ).querySelectorAll(".pt-blocks-list button");
        allBlockButtons.forEach((btn) => btn.classList.remove("selected"));

        // Add 'selected' class to the clicked button
        b.classList.add("selected");
        // Update current block and emit event
        this.currentBlock = block;
        this.emitSelect(block);
      });
      container.appendChild(b);
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
      const tabControls = this.dom.getChildByID(
        "tab-controls",
      ) as HTMLButtonElement | null;
      const chatContent = this.dom.getChildByID(
        "chat-content",
      ) as HTMLDivElement | null;
      const blocksContent = this.dom.getChildByID(
        "blocks-content",
      ) as HTMLDivElement | null;
      const controlsContent = this.dom.getChildByID(
        "controls-content",
      ) as HTMLDivElement | null;
      const log = this.dom.getChildByID("chat-log") as HTMLDivElement | null;
      if (
        !tabChat ||
        !tabBlocks ||
        !tabControls ||
        !chatContent ||
        !blocksContent ||
        !controlsContent ||
        !log
      )
        return;

      const switchToChat = () => {
        tabChat.classList.add("active");
        tabBlocks.classList.remove("active");
        tabControls.classList.remove("active");
        chatContent.style.display = "flex";
        blocksContent.style.display = "none";
        controlsContent.style.display = "none";
        this.updateLog();
      };

      const switchToBlocks = () => {
        tabBlocks.classList.add("active");
        tabChat.classList.remove("active");
        tabControls.classList.remove("active");
        chatContent.style.display = "none";
        blocksContent.style.display = "flex";
        controlsContent.style.display = "none";
      };

      const switchToControls = () => {
        tabControls.classList.add("active");
        tabChat.classList.remove("active");
        tabBlocks.classList.remove("active");
        chatContent.style.display = "none";
        blocksContent.style.display = "none";
        controlsContent.style.display = "flex";
      };

      tabChat.addEventListener("click", switchToChat);
      tabBlocks.addEventListener("click", switchToBlocks);
      tabControls.addEventListener("click", switchToControls);

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
      cornerRadius?: number;
      fontFamily?: string;
      minWidth?: number;
      strokeWidth?: number;
      stroke?: number;
      fill?: number;
      hoverFill?: number;
      downFill?: number;
      hoverStroke?: number;
      downStroke?: number;
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
    const hoverStroke = opts?.hoverStroke ?? stroke;
    const downStroke = opts?.downStroke ?? stroke;
    const fontSize = opts?.fontSize ?? 25;
    const fontFamily = opts?.fontFamily ?? "sans-serif";
    const textColor = opts?.textColor ?? "#111111";
    const cornerRadius = opts?.cornerRadius ?? 10;

    // Label
    const txt = scene.add
      .text(0, 0, label, {
        fontFamily,
        fontSize: `${fontSize}px`,
        color: textColor,
      })
      .setOrigin(0.5);

    // Size from rendered text bounds plus padding.
    const effectiveTextWidth = Math.ceil(txt.width);
    const effectiveTextHeight = Math.ceil(txt.height);
    const w = Math.max(
      opts?.fixedWidth ?? effectiveTextWidth + paddingX * 2,
      opts?.minWidth ?? 48,
      48,
    );
    const h = Math.max(
      opts?.minHeight ?? effectiveTextHeight + paddingY * 2,
      28,
    );

    /*const bg1 = scene.add.rectangle(0, 0, w, h, fill)
      .setOrigin(0.5)
      .setStrokeStyle(strokeW, stroke)
      .setInteractive({ useHandCursor: true });
      */

    // Rounded background with real border — make THIS the interactive thing
    const bg = scene.add.graphics();
    this.drawRoundedButtonBackground(
      bg,
      w,
      h,
      fill,
      strokeW,
      stroke,
      cornerRadius,
    );
    bg.setData("buttonWidth", w);
    bg.setData("buttonHeight", h);
    bg.setData("buttonStrokeWidth", strokeW);
    bg.setData("buttonCornerRadius", cornerRadius);
    bg.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    bg.input!.cursor = "pointer";

    // Container groups them (so you can add to panel)
    const btn = scene.add.container(x, y, [bg, txt]).setSize(w, h);

    // ----- States -----
    bg.on("pointerover", () => {
      this.drawRoundedButtonBackground(
        bg,
        w,
        h,
        hoverFill,
        strokeW,
        hoverStroke,
        cornerRadius,
      );
      (scene as UIScene).setPointerOverUI?.(true);
    });

    bg.on("pointerout", () => {
      this.drawRoundedButtonBackground(
        bg,
        w,
        h,
        fill,
        strokeW,
        stroke,
        cornerRadius,
      );
      (scene as UIScene).setPointerOverUI?.(false);
    });

    bg.on("pointerdown", () => {
      this.drawRoundedButtonBackground(
        bg,
        w,
        h,
        downFill,
        strokeW,
        downStroke,
        cornerRadius,
      );
    });

    // Fire only on release *inside*; also handle outside release to reset color
    bg.on("pointerup", () => {
      this.drawRoundedButtonBackground(
        bg,
        w,
        h,
        hoverFill,
        strokeW,
        hoverStroke,
        cornerRadius,
      );
      onClick();
    });

    bg.on("pointerupoutside", () => {
      // released outside: revert to normal, don't click
      this.drawRoundedButtonBackground(
        bg,
        w,
        h,
        fill,
        strokeW,
        stroke,
        cornerRadius,
      );
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
      100,
      this.cameras.main.height - 50, // 100 pixels from bottom of screen
      "▶️ Play",
      () => {
        this.startGame();
      },
      {
        fill: 0x222222,
        hoverFill: 0x222222,
        downFill: 0x1a1a1a,
        stroke: 0x444444,
        hoverStroke: 0xb3b3b3,
        downStroke: 0xd9d9d9,
        textColor: "#ffffff", // White text
        fontSize: 17,
        paddingX: 16,
        paddingY: 11,
        minHeight: 52,
      },
    );

    // Set high depth so it appears above other UI elements
    this.playButton.setDepth(1001);
  }
}
