import Phaser from "phaser";
import { sendUserPrompt } from "../languageModel/chatBox";

export class EditorScene extends Phaser.Scene {
  private TILE_SIZE = 16;
  private map!: Phaser.Tilemaps.Tilemap;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private backgroundLayer!: Phaser.Tilemaps.TilemapLayer;
  private gridGraphics!: Phaser.GameObjects.Graphics;

  private minZoomLevel = 2.25;
  private maxZoomLevel = 10;
  private zoomLevel = 2.25;

  // Brush tile id (1..N). Number keys will change this.
  private selectedTileIndex = 1;

  // New selection and painting state
  private isPlacing = false; // continuous paint while LMB held
  private highlightBox!: Phaser.GameObjects.Graphics;
  private selectionBox!: Phaser.GameObjects.Graphics;

  private isSelecting = false;
  public selectionStart!: Phaser.Math.Vector2;
  public selectionEnd!: Phaser.Math.Vector2;
  private selectionBounds:
    | { startX: number; startY: number; endX: number; endY: number }
    | null = null;

  // Clipboard for multi-tile copy or cut or paste
  private selectedTiles: number[][] = [];

  // Copy or Cut or Paste keys
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyV!: Phaser.Input.Keyboard.Key;

  // keyboard controls
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;

  private isTyping = false;
  private chatBox!: Phaser.GameObjects.DOMElement;

  // minimap
  private minimap!: Phaser.Cameras.Scene2D.Camera;
  private minimapZoom = 0.15;

  // camera scroll
  private scrollDeadzone = 50;
  private scrollSpeed = 10;

  constructor() {
    super({ key: "editorScene" });
  }

  preload() {}

  create() {
    this.map = this.make.tilemap({ key: "defaultMap" });

    const tileset = this.map.addTilesetImage(
      "pewterPlatformerTileset",
      "tileset",
      16,
      16,
      0,
      0
    )!;

    this.backgroundLayer = this.map.createLayer("Background_Layer", tileset, 0, 0)!;
    this.groundLayer = this.map.createLayer("Ground_Layer", tileset, 0, 0)!;

    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.centerOn(0, 0);
    this.cameras.main.setZoom(this.zoomLevel);

    // minimap
    this.minimap = this.cameras
      .add(
        10,
        10,
        this.map.widthInPixels * this.minimapZoom,
        this.map.heightInPixels * this.minimapZoom
      )
      .setZoom(this.minimapZoom)
      .setName("minimap");
    this.minimap.setBackgroundColor(0x002244);
    this.minimap.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.centerOn(0, 0);

    // grid
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.setDepth(10);
    this.drawGrid();

    // zoom with wheel
    this.input.on(
      "wheel",
      (
        pointer: Phaser.Input.Pointer,
        gameObjects: Phaser.GameObjects.GameObject[],
        deltaX: number,
        deltaY: number
      ) => {
        if (deltaY > 0) {
          this.zoomLevel = Phaser.Math.Clamp(
            this.zoomLevel - 0.1,
            this.minZoomLevel,
            this.maxZoomLevel
          );
        } else {
          this.zoomLevel = Phaser.Math.Clamp(
            this.zoomLevel + 0.1,
            this.minZoomLevel,
            this.maxZoomLevel
          );
        }
        this.cameras.main.setZoom(this.zoomLevel);
      }
    );

    // no browser context menu on right click
    if (this.input.mouse) this.input.mouse.disableContextMenu();

    // overlays on top
    this.highlightBox = this.add.graphics().setDepth(101);
    this.selectionBox = this.add.graphics().setDepth(100);

    // basic hover and selection stretch
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      this.highlightTile(p);
      this.updateSelection(p);
    });
    this.input.on("pointerup", () => this.endSelection());

    // copy or cut or paste hotkeys
    if (this.input.keyboard) {
      this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
      this.keyX = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
      this.keyV = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V);
    }

    // pointer and keyboard input
    this.setupInput();

    // chatbox UI
    this.buildChatboxUI();

    // movement keys
    if (this.input.keyboard) {
      this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    }
  }

  cameraMotion() {
    if (this.isTyping) return;

    const cam = this.cameras.main;
    let spd = this.scrollSpeed;
    if (this.keyShift && this.keyShift.isDown) spd *= 4;

    if (this.keyA && this.keyA.isDown) cam.scrollX -= spd / cam.zoom;
    if (this.keyD && this.keyD.isDown) cam.scrollX += spd / cam.zoom;
    if (this.keyW && this.keyW.isDown) cam.scrollY -= spd / cam.zoom;
    if (this.keyS && this.keyS.isDown) cam.scrollY += spd / cam.zoom;
  }

  private async sendToGemini(prompt: string): Promise<string> {
    return await sendUserPrompt(prompt);
  }

  public showChatboxAt(x: number, y: number): void {
    this.chatBox.setPosition(x, y);
    this.chatBox.setVisible(true);
    const input = this.chatBox.getChildByID("chat-input") as HTMLInputElement;
    input.focus();
  }

  drawGrid() {
    const cam = this.cameras.main;

    this.gridGraphics.clear();
    this.gridGraphics.fillStyle(0x000000, 1);

    const startX = Math.floor(cam.worldView.x / this.TILE_SIZE) * this.TILE_SIZE;
    const endX =
      Math.ceil((cam.worldView.x + cam.worldView.width) / this.TILE_SIZE) *
      this.TILE_SIZE;

    const startY = Math.floor(cam.worldView.y / this.TILE_SIZE) * this.TILE_SIZE;
    const endY =
      Math.ceil((cam.worldView.y + cam.worldView.height) / this.TILE_SIZE) *
      this.TILE_SIZE;

    const dotSpacing = 4;
    const dotLength = 0.4;
    const dotWidth = 1.2;

    const edgewidth = 2;
    this.gridGraphics.lineStyle(edgewidth, 0xf00000, 1);
    this.gridGraphics.strokeRect(
      startX - edgewidth,
      startY - edgewidth,
      endX - startX + edgewidth,
      endY - startY + edgewidth
    );

    // vertical dotted lines
    for (let x = startX; x <= endX; x += this.TILE_SIZE) {
      for (let y = startY - dotLength; y <= endY - dotLength; y += dotSpacing) {
        this.gridGraphics.fillRect(
          x - dotLength / 2,
          y - dotLength / 2,
          dotLength,
          dotWidth
        );
      }
    }

    // horizontal dotted lines
    for (let y = startY; y <= endY; y += this.TILE_SIZE) {
      for (let x = startX - dotLength; x <= endX - dotLength; x += dotSpacing) {
        this.gridGraphics.fillRect(
          x - dotLength / 2,
          y - dotLength / 2,
          dotWidth,
          dotLength
        );
      }
    }
  }

  // place or delete (tileIndex < 0 means delete)
  placeTile(
    layer: Phaser.Tilemaps.TilemapLayer,
    x: number,
    y: number,
    tileIndex: number
  ) {
    if (tileIndex < 0) {
      layer.removeTileAt(x, y);
      return;
    }
    const total = layer.tilemap.tilesets[0].total - 1;
    tileIndex = Phaser.Math.Clamp(tileIndex, 1, total);
    layer.putTileAt(tileIndex, x, y);
  }

  update() {
    this.drawGrid();
    this.cameraMotion();

    // continuous paint while LMB held
    if (this.isPlacing) {
      const pointer = this.input.activePointer;
      const { x, y } = this.tileXYFromPointer(pointer);
      this.placeTile(this.groundLayer, x, y, this.selectedTileIndex);
    }

    // C or X or V shortcuts
    if (this.keyC && Phaser.Input.Keyboard.JustDown(this.keyC)) this.copySelection();
    else if (this.keyX && Phaser.Input.Keyboard.JustDown(this.keyX)) this.cutSelection();
    else if (this.keyV && Phaser.Input.Keyboard.JustDown(this.keyV))
      this.pasteSelection(this.input.activePointer);
  }

  // NEW INPUT: LMB paints, RMB selects, MMB drags
  setupInput() {
    let isDragging = false;
    const dragStartPoint = new Phaser.Math.Vector2();

    // pointer down
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown()) {
        isDragging = true;
        dragStartPoint.set(pointer.x, pointer.y);
        return;
      }

      if (pointer.leftButtonDown()) {
        this.isPlacing = true;
        const { x, y } = this.tileXYFromPointer(pointer);
        this.placeTile(this.groundLayer, x, y, this.selectedTileIndex);
        return;
      }

      if (pointer.rightButtonDown()) {
        // start selection rectangle
        this.startSelection(pointer);

        // pick brush from tile under cursor
        const { x, y } = this.tileXYFromPointer(pointer);
        const t = this.groundLayer.getTileAt(x, y);
        this.selectedTileIndex = t ? t.index : this.selectedTileIndex;
        return;
      }
    });

    // pointer up
    this.input.on("pointerup", () => {
      isDragging = false;
      this.isPlacing = false;
      this.endSelection();
    });

    // pointer move for camera drag
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!isDragging) return;

      if (
        pointer.x >= this.cameras.main.width - this.scrollDeadzone ||
        pointer.y >= this.cameras.main.height - this.scrollDeadzone ||
        pointer.x <= this.scrollDeadzone ||
        pointer.y <= this.scrollDeadzone
      ) {
        isDragging = false;
        return;
      }

      const dx = dragStartPoint.x - pointer.x;
      const dy = dragStartPoint.y - pointer.y;
      this.cameras.main.scrollX += dx / this.cameras.main.zoom;
      this.cameras.main.scrollY += dy / this.cameras.main.zoom;
      dragStartPoint.set(pointer.x, pointer.y);
    });

    // keyboard: number keys select brush tile
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (this.isTyping) return;
      switch (event.key) {
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
          this.selectedTileIndex = parseInt(event.key, 10);
          break;
      }
    });
  }

  // chatbox UI kept intact
  private buildChatboxUI() {
    this.chatBox = this.add.dom(1600, 1400).createFromHTML(`
  <div id="chatbox" style="
    width: 1400px;
    height: 1420px;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    font-family: sans-serif;
    font-size: 70px;
    padding: 20px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    box-shadow: 0 0 8px rgba(0,0,0,0.6);
  ">
    <div id="chat-header" style="
      height: 100px;
      display: flex;
      align-items: center;
      padding: 0 12px;
      font-size: 60px;
      opacity: 0.8;
      cursor: move;
      user-select: none;
      -webkit-user-select: none;
    ">☰ Drag</div>

    <div id="chat-log" style="flex-grow: 1; overflow-y: auto; font-size: 70px; line-height: 1.5;"></div>

    <input id="chat-input" type="text" placeholder="Type a command..." style="
      margin-top: 16px;
      padding: 14px;
      font-size: 70px;
      border: none;
      border-radius: 4px;
    " />
  </div>
`);
    this.chatBox.setVisible(true);
    let isChatVisible = true;

    const input = this.chatBox.getChildByID("chat-input") as HTMLInputElement;
    const log = this.chatBox.getChildByID("chat-log") as HTMLDivElement;

    
    this.chatBox.setScrollFactor(0).setDepth(10000).setOrigin(0, 0);

    const header = this.chatBox.getChildByID("chat-header") as HTMLElement;
    const root = this.chatBox.node as HTMLElement;

    // Drag state
    let dragging = false;
    let startCssX = 0,
      startCssY = 0;
    let startBoxX = this.chatBox.x,
      startBoxY = this.chatBox.y;
    let convX = 1,
      convY = 1;

    const onDragStart = (ev: MouseEvent | TouchEvent) => {
      dragging = true;
      const p =
        ev instanceof TouchEvent
          ? ev.touches[0] ?? ev.changedTouches[0]
          : (ev as MouseEvent);
      startCssX = p.clientX;
      startCssY = p.clientY;
      startBoxX = this.chatBox.x;
      startBoxY = this.chatBox.y;

      const rect = this.game.canvas.getBoundingClientRect();
      convX = this.scale.width / rect.width || 1;
      convY = this.scale.height / rect.height || 1;

      root.style.userSelect = "none";
      ev.stopPropagation();
      ev.preventDefault();
    };

    const onDragMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragging) return;
      const p =
        ev instanceof TouchEvent
          ? ev.touches[0] ?? ev.changedTouches[0]
          : (ev as MouseEvent);

      const DRAG_MULTIPLIER = 6;
      const boost = p instanceof MouseEvent && p.shiftKey ? 2.5 : 1;

      const dx = (p.clientX - startCssX) * convX * DRAG_MULTIPLIER * boost;
      const dy = (p.clientY - startCssY) * convY * DRAG_MULTIPLIER * boost;

      this.chatBox.setPosition(startBoxX + dx, startBoxY + dy);
      ev.stopPropagation();
      ev.preventDefault();
    };

    const onDragEnd = () => {
      if (!dragging) return;
      dragging = false;
      root.style.userSelect = "";
    };

    header.addEventListener("mousedown", onDragStart);
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);

    header.addEventListener("touchstart", onDragStart, { passive: false });
    window.addEventListener("touchmove", onDragMove, { passive: false });
    window.addEventListener("touchend", onDragEnd);

    // Track focus to mute game controls while typing
    input.addEventListener("focus", () => {
      this.isTyping = true;
      if (this.input.keyboard) this.input.keyboard.enabled = false;
    });
    input.addEventListener("blur", () => {
      this.isTyping = false;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
    });

    // Handle typing in the chatbox only once
    input.addEventListener("keydown", async (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        isChatVisible = !isChatVisible;
        this.chatBox.setVisible(isChatVisible);
        if (isChatVisible) setTimeout(() => input.focus(), 0);
        else input.blur();
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      if (e.key === "Enter") {
        const msg = input.value.trim();
        if (!msg) {
          e.stopPropagation();
          e.preventDefault();
          return;
        }

        input.value = "";
        log.innerHTML += `<p><strong>You:</strong> ${msg}</p>`;
        const reply = await this.sendToGemini(msg);
        log.innerHTML += `<p><strong>Pewter:</strong> ${reply}</p>`;
        log.scrollTop = log.scrollHeight;

        e.stopPropagation();
        e.preventDefault();
        return;
      }

      e.stopPropagation();
    });

    // Global Escape toggle when input is not focused
    this.input.keyboard?.addCapture([Phaser.Input.Keyboard.KeyCodes.ESC]);
    this.input.keyboard?.on("keydown-ESC", () => {
      if (document.activeElement === input) return;
      isChatVisible = !isChatVisible;
      this.chatBox.setVisible(isChatVisible);
      if (isChatVisible) setTimeout(() => input.focus(), 0);
      else input.blur();
    });
  }

  // ===== Selection helpers =====

  private tileXYFromPointer(pointer: Phaser.Input.Pointer) {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor(world.x / this.TILE_SIZE);
    const y = Math.floor(world.y / this.TILE_SIZE);
    return { x, y };
  }

  private highlightTile(pointer: Phaser.Input.Pointer): void {
    const { x, y } = this.tileXYFromPointer(pointer);
    if (x >= 0 && x < this.map.width && y >= 0 && y < this.map.height) {
      this.drawHighlightBox(x, y, 0xff0000);
    } else {
      this.highlightBox.clear();
    }
  }

  private drawHighlightBox(x: number, y: number, color: number): void {
    const s = this.TILE_SIZE;
    this.highlightBox.clear();
    this.highlightBox.fillStyle(color, 0.25);
    this.highlightBox.lineStyle(2, color, 1);
    this.highlightBox.strokeRect(x * s, y * s, s, s);
    this.highlightBox.fillRect(x * s, y * s, s, s);
  }

  private startSelection(pointer: Phaser.Input.Pointer): void {
    const { x, y } = this.tileXYFromPointer(pointer);
    const cx = Phaser.Math.Clamp(x, 0, this.map.width - 1);
    const cy = Phaser.Math.Clamp(y, 0, this.map.height - 1);
    this.isSelecting = true;
    this.selectionStart = new Phaser.Math.Vector2(cx, cy);
    this.selectionEnd = new Phaser.Math.Vector2(cx, cy);
    this.selectionBounds = null;
    this.drawSelectionBox();
  }

  private drawSelectionBox(): void {
    this.selectionBox.clear();
    if (!this.isSelecting) return;

    const s = this.TILE_SIZE;
    const startX = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const startY = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const endX = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const endY = Math.max(this.selectionStart.y, this.selectionEnd.y);

    this.selectionBox.fillStyle(0xff5555, 0.3);
    this.selectionBox.fillRect(
      startX * s,
      startY * s,
      (endX - startX + 1) * s,
      (endY - startY + 1) * s
    );

    this.selectionBox.lineStyle(2, 0xff5555, 1);
    this.selectionBox.strokeRect(
      startX * s,
      startY * s,
      (endX - startX + 1) * s,
      (endY - startY + 1) * s
    );
  }

  private updateSelection(pointer: Phaser.Input.Pointer): void {
    if (!this.isSelecting) return;
    const { x, y } = this.tileXYFromPointer(pointer);
    const cx = Phaser.Math.Clamp(x, 0, this.map.width - 1);
    const cy = Phaser.Math.Clamp(y, 0, this.map.height - 1);
    this.selectionEnd.set(cx, cy);
    this.drawSelectionBox();
  }

  private endSelection(): void {
    if (!this.isSelecting) return;
    this.isSelecting = false;

    this.selectionBounds = {
      startX: Math.min(this.selectionStart.x, this.selectionEnd.x),
      startY: Math.min(this.selectionStart.y, this.selectionEnd.y),
      endX: Math.max(this.selectionStart.x, this.selectionEnd.x),
      endY: Math.max(this.selectionStart.y, this.selectionEnd.y)
    };
  }

  private copySelection(): void {
    if (!this.selectionBounds) return;
    const { startX, startY, endX, endY } = this.selectionBounds;
    this.selectedTiles = [];
    for (let y = startY; y <= endY; y++) {
      const row: number[] = [];
      for (let x = startX; x <= endX; x++) {
        const t = this.groundLayer.getTileAt(x, y);
        row.push(t ? t.index : -1);
      }
      this.selectedTiles.push(row);
    }
  }

  private cutSelection(): void {
    this.copySelection();
    if (!this.selectionBounds) return;
    const { startX, startY, endX, endY } = this.selectionBounds;
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        this.placeTile(this.groundLayer, x, y, -1);
      }
    }
  }

  private pasteSelection(pointer: Phaser.Input.Pointer): void {
    if (this.selectedTiles.length === 0) return;
    const { x: pasteX, y: pasteY } = this.tileXYFromPointer(pointer);
    for (let y = 0; y < this.selectedTiles.length; y++) {
      for (let x = 0; x < this.selectedTiles[y].length; x++) {
        const idx = this.selectedTiles[y][x];
        if (idx === -1) continue;
        this.placeTile(this.groundLayer, pasteX + x, pasteY + y, idx);
      }
    }
  }
}
