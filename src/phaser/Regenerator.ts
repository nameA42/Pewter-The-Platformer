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
