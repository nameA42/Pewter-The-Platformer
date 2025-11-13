import Phaser from "phaser";
import { getDisplayChatHistory } from "../languageModel/chatBox";
import "./chatbox.css";

export type OnSendFn = (msg: string) => Promise<any> | any;
export type OnSelectFn = (block: string) => void;

export default class ChatBox {
  public dom: Phaser.GameObjects.DOMElement;
  private scene: Phaser.Scene;
  private onSend?: OnSendFn;
  private onSelect?: OnSelectFn;
  private pointerDownHandler?: (e: PointerEvent) => void;
  private activeSelectionHandler?: () => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    blocks: string[],
    onSend?: OnSendFn,
    onSelect?: OnSelectFn,
  ) {
    this.scene = scene;
    this.onSend = onSend;
    this.onSelect = onSelect;

    this.dom = this.scene.add.dom(x, y).createFromHTML(`
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

    // Wire up behavior
    this.setupTabs();
    this.populateBlocks(blocks);
    this.setupInput();
    this.setupOutsideBlur();
    this.setupActiveSelectionListener();

    // Render current history
    this.updateLog();
  }

  public setVisible(v: boolean) {
    this.dom.setVisible(v);
  }

  public setPosition(x: number, y: number) {
    this.dom.setPosition(x, y);
  }

  public focusInput() {
    const input = this.dom.getChildByID(
      "chat-input",
    ) as HTMLInputElement | null;
    if (input) input.focus();
  }

  public updateLog() {
    try {
      const log = this.dom.getChildByID("chat-log") as HTMLDivElement | null;
      if (!log) return;
      log.innerHTML = getDisplayChatHistory();
      log.scrollTop = log.scrollHeight;
    } catch (e) {
      // ignore
    }
  }

  public populateBlocks(blocks: string[]) {
    try {
      const blocksList = this.dom.getChildByID(
        "blocks-list",
      ) as HTMLDivElement | null;
      if (!blocksList) return;
      blocksList.innerHTML = "";
      blocks.forEach((block, i) => {
        const b = document.createElement("button");
        b.textContent = `block${i + 1}`;
        b.addEventListener(
          "click",
          () => this.onSelect && this.onSelect(block),
        );
        blocksList.appendChild(b);
      });
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
    try {
      const input = this.dom.getChildByID(
        "chat-input",
      ) as HTMLInputElement | null;
      const log = this.dom.getChildByID("chat-log") as HTMLDivElement | null;
      if (!input || !log) return;

      input.addEventListener("keydown", (e: KeyboardEvent) => {
        e.stopPropagation();
      });

      input.addEventListener("keydown", async (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          const userMsg = input.value.trim();
          if (!userMsg) return;
          input.value = "";
          if (this.onSend) {
            const ret = this.onSend(userMsg);
            // Immediately update log for the user's message
            this.updateLog();
            try {
              await ret;
            } catch (err) {
              // ignore
            }
            // Ensure final history rendered
            this.updateLog();
          }
        }
      });
    } catch (e) {
      // ignore
    }
  }

  private setupOutsideBlur() {
    try {
      const rootNode = (this.dom.node as HTMLElement) || null;
      this.pointerDownHandler = (e: PointerEvent) => {
        try {
          const target = e.target as Node | null;
          if (!rootNode || !target) return;
          if (!rootNode.contains(target)) {
            const input = this.dom.getChildByID(
              "chat-input",
            ) as HTMLInputElement | null;
            if (input) input.blur();
          }
        } catch (err) {
          // ignore
        }
      };
      window.addEventListener("pointerdown", this.pointerDownHandler);

      this.scene.events.on("shutdown", () => {
        try {
          if (this.pointerDownHandler)
            window.removeEventListener("pointerdown", this.pointerDownHandler);
        } catch (e) {}
      });
    } catch (e) {
      // ignore
    }
  }

  private setupActiveSelectionListener() {
    try {
      this.activeSelectionHandler = () => {
        this.updateLog();
      };
      window.addEventListener(
        "activeSelectionChanged",
        this.activeSelectionHandler,
      );
      this.scene.events.on("shutdown", () => {
        try {
          if (this.activeSelectionHandler)
            window.removeEventListener(
              "activeSelectionChanged",
              this.activeSelectionHandler,
            );
        } catch (e) {}
      });
    } catch (e) {
      // ignore
    }
  }

  public destroy() {
    try {
      if (this.pointerDownHandler)
        window.removeEventListener("pointerdown", this.pointerDownHandler);
      if (this.activeSelectionHandler)
        window.removeEventListener(
          "activeSelectionChanged",
          this.activeSelectionHandler,
        );
    } catch (e) {}
    try {
      this.dom.destroy();
    } catch (e) {}
  }
}
