import Phaser from "phaser";

// Regenerator: chunk-based regen orchestrator using "slinky" pass order and
// robust topological ordering (with SCC collapse). Meant to be extended with
// a dependencyProvider that maps chunk->dependencies extracted from your IDS.

export type ChunkKey = string;

export interface RegeneratorOptions {
  chunkSize?: number; // in tiles
  timeBudgetMs?: number; // per-run budget checkpoint
  // Optional dependency provider: given an array of chunk keys returns a map
  // mapping each chunk to the set of chunk keys it depends on.
  dependencyProvider?: (chunkKeys: ChunkKey[]) => Map<ChunkKey, Set<ChunkKey>>;
  // Optional per-chunk regen handler. Called for each chunk during regen.
  onChunkRegen?: (chunkKey: ChunkKey) => void | Promise<void>;
}

export class Regenerator {
  public scene: Phaser.Scene;
  public chunkSize: number;
  private dirtyChunks: Set<ChunkKey> = new Set();
  private pendingRun: number | null = null;
  private debounceTimer: number | null = null;
  private timeBudgetMs: number;
  private dependencyProvider?: (
    chunkKeys: ChunkKey[],
  ) => Map<ChunkKey, Set<ChunkKey>>;
  private onChunkRegen?: (chunkKey: ChunkKey) => void | Promise<void>;

  constructor(scene: Phaser.Scene, options: RegeneratorOptions = {}) {
    this.scene = scene;
    this.chunkSize = options.chunkSize ?? 8;
    this.timeBudgetMs = options.timeBudgetMs ?? 8;
    this.dependencyProvider = options.dependencyProvider;
    this.onChunkRegen = options.onChunkRegen;

    try {
      (this.scene as any).regenerator = this;
    } catch (e) {
      // ignore
    }
  }

  // --- High-level helpers moved into Regenerator so regen logic lives here ---

  /** Parse a chunk key "cx,cy,z" into numbers */
  private parseChunkKey(key: ChunkKey) {
    const parts = (key || "").split(",").map((p) => parseInt(p, 10));
    return { cx: parts[0] || 0, cy: parts[1] || 0, z: parts[2] || 0 };
  }

  /** Mark chunks touched by a set of tile positions (in tile coords) */
  public markChunksForTilePositions(
    tiles: Array<{ x: number; y: number; index?: number }>,
    z: number = 1,
  ) {
    if (!tiles || tiles.length === 0) return;
    const keys = new Set<string>();
    for (const t of tiles) {
      const cx = Math.floor(t.x / this.chunkSize);
      const cy = Math.floor(t.y / this.chunkSize);
      keys.add(this.chunkKeyFromCoords(cx, cy, z));
    }
    for (const k of keys) {
      const parts = k.split(",").map((n) => parseInt(n, 10));
      const rect = new Phaser.Geom.Rectangle(
        parts[0] * this.chunkSize,
        parts[1] * this.chunkSize,
        this.chunkSize,
        this.chunkSize,
      );
      try {
        this.markDirty(rect, parts[2] || 0);
      } catch (e) {}
    }
  }

  /** Attempt to push/slide occupied tiles to the right inside the chunk region.
   *  Returns the number of moves applied. Operates on the scene's Ground_Layer by default.
   */
  public pushSlideChunk(
    chunkKey: ChunkKey,
    layerName: string = "Ground_Layer",
    maxChain: number = 128,
  ): number {
    try {
      const { cx, cy } = this.parseChunkKey(chunkKey);
      const startX = cx * this.chunkSize;
      const startY = cy * this.chunkSize;
      const endX = Math.min(
        startX + this.chunkSize - 1,
        (this.scene as any).map.width - 1,
      );
      const endY = Math.min(
        startY + this.chunkSize - 1,
        (this.scene as any).map.height - 1,
      );

      const layer =
        (this.scene as any)[`${layerName.replace(/\s+/g, "")}Layer`] ||
        (this.scene as any).groundLayer;
      if (!layer) return 0;

      const posKey = (x: number, y: number) => `${x},${y}`;
      const moves = new Map<
        string,
        {
          fromX: number;
          fromY: number;
          toX: number;
          toY: number;
          tileIndex: number;
        }
      >();
      const plannedFrom = new Set<string>();
      const plannedTo = new Set<string>();

      for (let ty = startY; ty <= endY; ty++) {
        for (let tx = endX; tx >= startX; tx--) {
          const fKey = posKey(tx, ty);
          if (plannedFrom.has(fKey)) continue;
          const tile = layer.getTileAt(tx, ty);
          if (!tile) continue;

          const destX = tx + 1;
          if (destX > (this.scene as any).map.width - 1) continue;

          const chain: Array<{ x: number; y: number; index: number }> = [];
          let curX = destX;
          let blocked = false;
          while (curX <= (this.scene as any).map.width - 1) {
            const t = layer.getTileAt(curX, ty);
            if (!t) break;
            chain.push({ x: curX, y: ty, index: t.index });
            curX++;
            if (chain.length > maxChain) {
              blocked = true;
              break;
            }
          }
          if (blocked) continue;

          let targetX = curX;
          for (let i = chain.length - 1; i >= 0; i--) {
            const c = chain[i];
            const fromK = posKey(c.x, c.y);
            const toK = posKey(targetX, c.y);
            if (plannedTo.has(toK)) {
              blocked = true;
              break;
            }
            moves.set(fromK, {
              fromX: c.x,
              fromY: c.y,
              toX: targetX,
              toY: c.y,
              tileIndex: c.index,
            });
            plannedFrom.add(fromK);
            plannedTo.add(toK);
            targetX--;
          }
          if (blocked) continue;

          const toK = posKey(destX, ty);
          if (!plannedTo.has(toK)) {
            moves.set(fKey, {
              fromX: tx,
              fromY: ty,
              toX: destX,
              toY: ty,
              tileIndex: tile.index,
            });
            plannedFrom.add(fKey);
            plannedTo.add(toK);
          }
        }
      }

      if (moves.size === 0) return 0;

      // remove originals
      for (const m of moves.values()) {
        try {
          layer.removeTileAt(m.fromX, m.fromY);
        } catch (e) {}
      }
      // place targets
      for (const m of moves.values()) {
        try {
          layer.putTileAt(m.tileIndex, m.toX, m.toY);
        } catch (e) {}
      }

      // mark affected chunks & emit event
      this.markChunksForTilePositions(
        Array.from(moves.values()).map((m) => ({ x: m.toX, y: m.toY })),
      );
      try {
        this.scene.game.events.emit("regenerator:chunk", chunkKey);
      } catch (e) {}
      return moves.size;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[Regenerator] pushSlideChunk error", e);
      return 0;
    }
  }

  /** Use WorldFacts to locate a platform StructureFact covering tileX,tileY */
  public findPlatformFactAt(tileX: number, tileY: number): any | null {
    try {
      const wf = (this.scene as any).worldFacts;
      if (!wf) return null;
      wf.refresh?.();
      const facts = wf.getFact("Structure") as any[];
      for (const f of facts) {
        if (
          f.structureType === "Platform" &&
          tileX >= f.xStart &&
          tileX <= f.xEnd
        ) {
          const idx = tileX - f.xStart;
          const expectedY = f.heights?.[idx];
          if (typeof expectedY === "number") {
            if (expectedY === tileY) return f;
            // still return candidate if mismatch
            return f;
          }
          return f;
        }
      }
    } catch (e) {}
    return null;
  }

  public collectPlatformTilesFromFact(
    fact: any,
  ): Array<{ x: number; y: number; index: number }> {
    const out: Array<{ x: number; y: number; index: number }> = [];
    try {
      if (
        !fact ||
        fact.structureType !== "Platform" ||
        !Array.isArray(fact.heights)
      )
        return out;
      const layer = (this.scene as any).groundLayer;
      if (!layer) return out;
      for (let x = fact.xStart; x <= fact.xEnd; x++) {
        const idx = x - fact.xStart;
        const y = fact.heights![idx];
        if (typeof y !== "number" || y < 0) continue;
        const tile = layer.getTileAt(x, y);
        if (tile) out.push({ x, y, index: tile.index });
      }
    } catch (e) {}
    return out;
  }

  public removePlatformAt(tileX: number, tileY: number) {
    try {
      const fact = this.findPlatformFactAt(tileX, tileY);
      if (!fact) return false;
      const tiles = this.collectPlatformTilesFromFact(fact);
      const layer = (this.scene as any).groundLayer;
      for (const t of tiles) {
        try {
          layer.removeTileAt(t.x, t.y);
        } catch (e) {}
      }
      this.markChunksForTilePositions(tiles);
      try {
        (this.scene as any).regenerator?.scheduleRegenNow?.();
      } catch (e) {}
      try {
        (this.scene as any).worldFacts?.refresh?.();
      } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  }

  public movePlatformAt(
    tileX: number,
    tileY: number,
    dx: number,
    dy: number,
    force: boolean = false,
  ): boolean {
    try {
      const fact = this.findPlatformFactAt(tileX, tileY);
      if (!fact) return false;
      const tiles = this.collectPlatformTilesFromFact(fact);
      if (!tiles.length) return false;
      const w = (this.scene as any).map.width;
      const h = (this.scene as any).map.height;
      const layer = (this.scene as any).groundLayer;
      const key = (x: number, y: number) => `${x},${y}`;

      const targets = new Map<
        string,
        { tx: number; ty: number; index: number }
      >();
      for (const t of tiles) {
        const tx = t.x + dx;
        const ty = t.y + dy;
        if (tx < 0 || tx >= w || ty < 0 || ty >= h) return false;
        targets.set(key(tx, ty), { tx, ty, index: t.index });
      }

      if (!force) {
        for (const v of targets.values()) {
          const existing = layer.getTileAt(v.tx, v.ty);
          const wasMoving = tiles.some(
            (t) => t.x === v.tx - dx && t.y === v.ty - dy,
          );
          if (existing && !wasMoving) return false;
        }
      }

      for (const t of tiles) {
        try {
          layer.removeTileAt(t.x, t.y);
        } catch (e) {}
      }
      for (const v of targets.values()) {
        try {
          layer.putTileAt(v.index, v.tx, v.ty);
        } catch (e) {}
      }

      const all = tiles.concat(
        Array.from(targets.values()).map((v) => ({
          x: v.tx,
          y: v.ty,
          index: v.index,
        })),
      );
      this.markChunksForTilePositions(all);
      try {
        (this.scene as any).regenerator?.scheduleRegenNow?.();
      } catch (e) {}
      try {
        (this.scene as any).worldFacts?.refresh?.();
      } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  }

  private chunkKeyFromCoords(cx: number, cy: number, z: number): ChunkKey {
    return `${cx},${cy},${z}`;
  }

  private tileToChunk(x: number, y: number): { cx: number; cy: number } {
    const cx = Math.floor(x / this.chunkSize);
    const cy = Math.floor(y / this.chunkSize);
    return { cx, cy };
  }

  public markDirty(rect: Phaser.Geom.Rectangle, z: number = 1): void {
    const startX = Math.floor(rect.x);
    const startY = Math.floor(rect.y);
    const endX = Math.floor(rect.x + Math.max(0, rect.width));
    const endY = Math.floor(rect.y + Math.max(0, rect.height));

    const { cx: aCx, cy: aCy } = this.tileToChunk(startX, startY);
    const { cx: bCx, cy: bCy } = this.tileToChunk(endX, endY);

    for (let cx = aCx; cx <= bCx; cx++) {
      for (let cy = aCy; cy <= bCy; cy++) {
        this.dirtyChunks.add(this.chunkKeyFromCoords(cx, cy, z));
      }
    }
  }

  public debouncedMarkDirty(
    rect: Phaser.Geom.Rectangle,
    z: number = 1,
    debounceMs: number = 120,
  ): void {
    this.markDirty(rect, z);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      this.scheduleRegenNow();
    }, debounceMs);
  }

  public scheduleRegenNow(): void {
    if (this.pendingRun !== null) return;
    this.pendingRun = window.requestAnimationFrame(() => {
      this.pendingRun = null;
      this.runSlinkyCycle();
    });
  }

  private async callOnChunkRegen(chunk: ChunkKey) {
    try {
      if (this.onChunkRegen) await this.onChunkRegen(chunk);
      else console.log(`[Regenerator] regenerating chunk ${chunk}`);
    } catch (e) {
      // swallow; user handler should log
      // eslint-disable-next-line no-console
      console.error("[Regenerator] onChunkRegen error", e);
    }
  }

  private buildDependencyMap(
    affected: ChunkKey[],
  ): Map<ChunkKey, Set<ChunkKey>> {
    const setAffected = new Set(affected);
    if (this.dependencyProvider) {
      try {
        const prov = this.dependencyProvider(affected);
        const out = new Map<ChunkKey, Set<ChunkKey>>();
        for (const k of affected) {
          const deps = prov.get(k) ?? new Set();
          const filtered = new Set<ChunkKey>();
          for (const d of deps) if (setAffected.has(d)) filtered.add(d);
          out.set(k, filtered);
        }
        return out;
      } catch (e) {
        // fallback
      }
    }
    const empty = new Map<ChunkKey, Set<ChunkKey>>();
    for (const k of affected) empty.set(k, new Set());
    return empty;
  }

  private tarjanSCC(
    nodes: ChunkKey[],
    edges: Map<ChunkKey, Set<ChunkKey>>,
  ): ChunkKey[][] {
    const indexMap = new Map<ChunkKey, number>();
    const lowlink = new Map<ChunkKey, number>();
    const stack: ChunkKey[] = [];
    const onStack = new Set<ChunkKey>();
    let index = 0;
    const sccs: ChunkKey[][] = [];

    const strongconnect = (v: ChunkKey) => {
      indexMap.set(v, index);
      lowlink.set(v, index);
      index++;
      stack.push(v);
      onStack.add(v);

      const neighbors = edges.get(v) ?? new Set();
      for (const w of neighbors) {
        if (!indexMap.has(w)) {
          strongconnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indexMap.get(w)!));
        }
      }

      if (lowlink.get(v) === indexMap.get(v)) {
        const comp: ChunkKey[] = [];
        let w: ChunkKey | undefined;
        do {
          w = stack.pop();
          if (!w) break;
          onStack.delete(w);
          comp.push(w);
        } while (w !== v);
        sccs.push(comp);
      }
    };

    for (const n of nodes) if (!indexMap.has(n)) strongconnect(n);
    return sccs;
  }

  private topoOrderWithSCC(
    affected: ChunkKey[],
    depMap: Map<ChunkKey, Set<ChunkKey>>,
  ): ChunkKey[] {
    const sccs = this.tarjanSCC(affected, depMap);
    if (sccs.length === 0) return [];

    const nodeToScc = new Map<ChunkKey, number>();
    sccs.forEach((comp, idx) => comp.forEach((n) => nodeToScc.set(n, idx)));

    const metaDeps = new Map<number, Set<number>>();
    for (let i = 0; i < sccs.length; i++) metaDeps.set(i, new Set());

    for (const [node, deps] of depMap.entries()) {
      const a = nodeToScc.get(node)!;
      for (const d of deps) {
        const b = nodeToScc.get(d)!;
        if (a !== b) metaDeps.get(a)!.add(b);
      }
    }

    const inDegree = new Map<number, number>();
    for (const [k] of metaDeps.entries()) inDegree.set(k, 0);
    for (const [, s] of metaDeps.entries())
      for (const dep of s) inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);

    const q: number[] = [];
    for (const [k, deg] of inDegree.entries()) if (deg === 0) q.push(k);
    const metaOrder: number[] = [];
    while (q.length > 0) {
      const n = q.shift()!;
      metaOrder.push(n);
      for (const m of metaDeps.get(n) ?? []) {
        inDegree.set(m, inDegree.get(m)! - 1);
        if (inDegree.get(m) === 0) q.push(m);
      }
    }

    if (metaOrder.length !== sccs.length)
      for (let i = 0; i < sccs.length; i++)
        if (!metaOrder.includes(i)) metaOrder.push(i);

    const result: ChunkKey[] = [];
    for (const sccId of metaOrder) {
      const comp = sccs[sccId];
      for (const node of comp) result.push(node);
    }
    return result;
  }

  private runSlinkyCycle(): void {
    if (this.dirtyChunks.size === 0) return;

    const affected = Array.from(this.dirtyChunks);
    this.dirtyChunks.clear();

    const depMap = this.buildDependencyMap(affected);
    const topoOrder = this.topoOrderWithSCC(affected, depMap);

    // Define passes
    const passBottom = async () => {
      for (const k of topoOrder) await this.callOnChunkRegen(k);
    };

    const passTop = async () => {
      for (let i = topoOrder.length - 1; i >= 0; i--)
        await this.callOnChunkRegen(topoOrder[i]);
    };

    const passTopVerify = async () => {
      for (
        let i = topoOrder.length - 1;
        i >= Math.max(0, topoOrder.length - 3);
        i--
      )
        await this.callOnChunkRegen(topoOrder[i]);
    };

    const passBottomStabilize = async () => {
      for (const k of topoOrder) await this.callOnChunkRegen(k);
    };

    const passes: Array<() => Promise<void>> = [
      passBottom,
      passTop,
      passTopVerify,
      passBottomStabilize,
    ];

    const runPasses = async (i = 0) => {
      if (i >= passes.length) return;
      const start = performance.now();
      await passes[i]();
      const elapsed = performance.now() - start;
      if (elapsed > this.timeBudgetMs) {
        window.requestAnimationFrame(() => runPasses(i + 1));
      } else {
        runPasses(i + 1);
      }
    };

    // Start asynchronous pass execution
    runPasses(0);
  }
}

export default Regenerator;
