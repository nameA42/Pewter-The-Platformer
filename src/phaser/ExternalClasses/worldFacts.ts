import type { EditorScene } from "../editorScene.ts";

export type FactCategory = "Structure" | "Collectable" | "Enemy";

export abstract class Fact {
  key: string;
  category: FactCategory;
  description?: string;

  constructor(key: string, category: FactCategory, description?: string) {
    this.key = key;
    this.category = category;
    this.description = description;
  }

  abstract toString(): string;
}

export class StructureFact extends Fact {
  xStart: number;
  xEnd: number;
  structureType: "Pitfall" | "Ramp" | "Flat" | "Platform";
  height?: number; // only for Flat sections
  heights?: number[]; // only for Ramps / Platforms

  constructor(
    xStart: number,
    xEnd: number,
    structureType: "Pitfall" | "Ramp" | "Flat" | "Platform",
    heightsOrHeight?: number[] | number,
  ) {
    super(
      `structure:${structureType}:${xStart}-${xEnd}`,
      "Structure",
      `${structureType} from ${xStart} to ${xEnd}`,
    );
    this.xStart = xStart;
    this.xEnd = xEnd;
    this.structureType = structureType;

    if (structureType === "Flat" && typeof heightsOrHeight === "number") {
      this.height = heightsOrHeight;
    } else if (
      (structureType === "Ramp" || structureType === "Platform") &&
      Array.isArray(heightsOrHeight)
    ) {
      this.heights = heightsOrHeight;
    }
    // Pitfall → height implied 0
  }

  toString(): string {
    switch (this.structureType) {
      case "Pitfall":
        return `From range [${this.xStart}, ${this.xEnd}] on the x axis there is a pitfall.`;
      case "Flat":
        return `From range [${this.xStart}, ${this.xEnd}] on the x axis there is a flat plane with height ${this.height}.`;
      case "Ramp":
      case "Platform":
        const heightsStr = this.heights?.join(", ") ?? "";
        return `From range [${this.xStart}, ${this.xEnd}] on the x axis there is a ${this.structureType.toLowerCase()} with heights ${heightsStr}.`;
      default:
        return `From range [${this.xStart}, ${this.xEnd}] on the x axis there is an unknown structure.`;
    }
  }
}

export class CollectableFact extends Fact {
  xs: number[];
  ys: number[];
  types: number[];

  constructor(xs: number[], ys: number[], types: number[]) {
    super("collectables", "Collectable");
    this.xs = xs;
    this.ys = ys;
    this.types = types;
  }

  toString(): string {
    let sentence: string = "";
    if (
      this.xs.length == this.ys.length &&
      this.ys.length == this.types.length
    ) {
      for (let i = 0; i < this.xs.length; i++) {
        let x = this.xs[i];
        let y = this.ys[i];
        let type = this.types[i];
        sentence += `At point (${x}, ${y}), there is a ${type} collectable. `;
      }
    }

    return sentence;
  }
}

export class EnemyFact extends Fact {
  x: number;
  y: number;
  enemyType: string;

  constructor(x: number, y: number, enemyType: string) {
    super(`enemy:${x},${y}`, "Enemy", `Enemy of type '${enemyType}'`);
    this.x = x;
    this.y = y;
    this.enemyType = enemyType;
  }

  toString(): string {
    return `At coordinate (${this.x}, ${this.y}), there is a ${this.enemyType} enemy. `;
  }
}

// export class WorldFacts {
//   private structureFacts: GroundFact[] = [];
//   private collectableFacts: CollectableFact[] = [];
//   private enemyFacts: EnemyFact[] = [];
//   private scene: EditorScene;

//   constructor(scene: EditorScene) {
//     this.scene = scene;
//     this.refresh();
//   }

//   /** Refresh all facts by extracting everything from the scene */
//   refresh() {
//     this.groundFacts = [];
//     this.collectableFacts = [];
//     this.enemyFacts = [];
//     this.extractFromScene(this.scene);
//   }

//   private extractFromScene(scene: EditorScene) {
//     // 1. Ground heights
//     const groundLayer = scene.map.getLayer("Ground_Layer")?.tilemapLayer;
//     if (groundLayer) {
//       const groundHeights: Record<number, number> = {};

//       for (let x = 0; x < groundLayer.width; x++) {
//         for (let y = 0; y < groundLayer.height; y++) {
//           const tile = groundLayer.getTileAt(x, y);
//           if (tile) {
//             groundHeights[x] = y;
//             break;
//           }
//         }
//       }

//       const xs = Object.keys(groundHeights)
//         .map(Number)
//         .sort((a, b) => a - b);
//       const ys = xs.map((x) => groundHeights[x]);

//       this.groundFacts.push(new GroundFact(xs, ys));
//     }

//     // 2. Collectables
//     const collectablesLayer =
//       scene.map.getLayer("Collectables_Layer")?.tilemapLayer;
//     if (collectablesLayer) {
//       const xs: number[] = [];
//       const ys: number[] = [];
//       const types: number[] = [];

//       for (let x = 0; x < collectablesLayer.width; x++) {
//         for (let y = 0; y < collectablesLayer.height; y++) {
//           const tile = collectablesLayer.getTileAt(x, y);
//           if (tile) {
//             xs.push(x);
//             ys.push(y);
//             types.push(tile.index); // store the tile type/index
//           }
//         }
//       }

//       if (xs.length > 0) {
//         this.collectableFacts.push(new CollectableFact(xs, ys, types));
//       }
//     }

//     // 3. Enemies
//     for (const e of scene.enemies ?? []) {
//       this.enemyFacts.push(new EnemyFact(e.x, e.y, e.type));
//     }
//   }

//   // --- API methods ---

//   setFact(category: FactCategory, x?: number, y?: number, type?: string): void {
//     switch (category) {
//       case "Ground": {
//         // Recompute ground heights directly from the scene
//         const groundLayer =
//           this.scene.map.getLayer("Ground_Layer")?.tilemapLayer;
//         if (groundLayer) {
//           const groundHeights: Record<number, number> = {};
//           for (let gx = 0; gx < groundLayer.width; gx++) {
//             for (let gy = 0; gy < groundLayer.height; gy++) {
//               const tile = groundLayer.getTileAt(gx, gy);
//               if (tile) {
//                 groundHeights[gx] = gy;
//                 break;
//               }
//             }
//           }
//           const xs = Object.keys(groundHeights)
//             .map(Number)
//             .sort((a, b) => a - b);
//           const ys = xs.map((gx) => groundHeights[gx]);

//           this.groundFacts = [new GroundFact(xs, ys)];
//         }
//         break;
//       }

//       case "Enemy": {
//         // Replace any existing enemy fact at same (x, y)
//         this.enemyFacts = this.enemyFacts.filter(
//           (f) => !(f.x === x && f.y === y),
//         );
//         this.enemyFacts.push(new EnemyFact(x!, y!, type ?? "unknown"));
//         break;
//       }

//       case "Collectable": {
//         const collectablesLayer =
//           this.scene.map.getLayer("Collectables_Layer")?.tilemapLayer;
//         if (collectablesLayer) {
//           const xs: number[] = [];
//           const ys: number[] = [];
//           const types: number[] = [];

//           for (let x = 0; x < collectablesLayer.width; x++) {
//             for (let y = 0; y < collectablesLayer.height; y++) {
//               const tile = collectablesLayer.getTileAt(x, y);
//               if (tile) {
//                 xs.push(x);
//                 ys.push(y);
//                 types.push(tile.index); // store the tile type/index
//               }
//             }
//           }

//           if (xs.length > 0) {
//             this.collectableFacts.push(new CollectableFact(xs, ys, types));
//           }
//         }
//       }
//     }
//   }

//   getFact(category: FactCategory): Fact[] {
//     switch (category) {
//       case "Ground":
//         return this.groundFacts;
//       case "Collectable":
//         return this.collectableFacts;
//       case "Enemy":
//         return this.enemyFacts;
//       default:
//         return [];
//     }
//   }
// }

export class WorldFacts {
  private structureFacts: StructureFact[] = [];
  private collectableFacts: CollectableFact[] = [];
  private enemyFacts: EnemyFact[] = [];
  private scene: EditorScene;

  private width: number;
  private height: number;

  private startXCoord: number;
  private startYCoord: number;

  constructor(
    scene: EditorScene,
    startXCoord: number,
    startYCoord: number,
    endXCoord: number,
    endYCoord: number,
  ) {
    this.scene = scene;
    this.startXCoord = startXCoord;
    this.startYCoord = startYCoord;
    this.width = endXCoord - startXCoord;
    this.height = endYCoord - startYCoord;
    this.refresh();
  }

  refresh() {
    this.structureFacts = [];
    this.collectableFacts = [];
    this.enemyFacts = [];
    this.extractFromScene(this.scene);
  }

  private extractFromScene(scene: EditorScene) {
    // 1. Structures
    this.structureFacts = this.extractStructures(scene);

    // 2. Collectables
    const collectablesLayer =
      scene.map.getLayer("Collectables_Layer")?.tilemapLayer;
    if (collectablesLayer) {
      const xs: number[] = [];
      const ys: number[] = [];
      const types: number[] = [];

      for (let x = this.startXCoord; x < this.width; x++) {
        for (let y = this.startYCoord; y < this.height; y++) {
          const tile = collectablesLayer.getTileAt(x, y);
          if (tile) {
            xs.push(x);
            ys.push(y);
            types.push(tile.index);
          }
        }
      }
      if (xs.length > 0) {
        this.collectableFacts.push(new CollectableFact(xs, ys, types));
      }
    }

    // 3. Enemies
    for (const e of scene.enemies ?? []) {
      this.enemyFacts.push(new EnemyFact(e.x, e.y, e.type));
    }
  }

  private extractStructures(scene: EditorScene): StructureFact[] {
    const structures: StructureFact[] = [];
    const groundLayer = scene.map.getLayer("Ground_Layer")?.tilemapLayer;
    if (!groundLayer) return structures;

    const xEnd = this.startXCoord + this.width;
    const yEnd = this.startYCoord + this.height;

    const hasTile = (x: number, y: number) =>
      x >= this.startXCoord &&
      x < xEnd &&
      y >= this.startYCoord &&
      y < yEnd &&
      !!groundLayer.getTileAt(x, y);

    // --- topmost (smallest y) and bottommost (largest y) tile per column
    const columnTop: Record<number, number> = {};
    const columnBottom: Record<number, number> = {};

    for (let x = this.startXCoord; x < xEnd; x++) {
      let topY = -1;
      let bottomY = -1;

      // Find topmost
      for (let y = this.startYCoord; y < yEnd; y++) {
        if (hasTile(x, y)) {
          topY = y;
          break;
        }
      }

      // Find bottommost
      for (let y = yEnd - 1; y >= this.startYCoord; y--) {
        if (hasTile(x, y)) {
          bottomY = y;
          break;
        }
      }

      columnTop[x] = topY;
      columnBottom[x] = bottomY;
    }

    // --- Determine base ground level (mode of bottoms)
    const freq = new Map<number, number>();
    for (let x = this.startXCoord; x < xEnd; x++) {
      const b = columnBottom[x];
      if (b !== -1) freq.set(b, (freq.get(b) ?? 0) + 1);
    }

    let baseGroundY: number | null = null;
    let maxCount = 0;
    for (const [y, count] of freq.entries()) {
      if (count > maxCount) {
        maxCount = count;
        baseGroundY = y;
      }
    }

    // --- Identify flat/platform segments
    let runStart: number | null = null;
    let runTop: number | null = null;

    const flushRun = (endX: number) => {
      if (runStart === null || runTop === null) return;
      const x0 = runStart;
      const x1 = endX;
      if (runTop === -1) {
        runStart = null;
        runTop = null;
        return;
      }

      const heights: number[] = [];
      let isPlatform = false;

      for (let x = x0; x <= x1; x++) {
        const topY = columnTop[x];
        heights.push(topY);

        const belowY = topY + 1;
        const supported = topY !== -1 && hasTile(x, belowY);
        const baseMissing =
          baseGroundY !== null
            ? columnBottom[x] !== baseGroundY
            : columnBottom[x] === -1;

        if (!supported || baseMissing) {
          isPlatform = true;
        }
      }

      if (isPlatform) {
        structures.push(new StructureFact(x0, x1, "Platform", heights));
      } else {
        structures.push(new StructureFact(x0, x1, "Flat", runTop));
      }

      runStart = null;
      runTop = null;
    };

    for (let x = this.startXCoord; x < xEnd; x++) {
      const top = columnTop[x];
      if (runStart === null) {
        runStart = x;
        runTop = top;
        continue;
      }
      if (top !== runTop) {
        flushRun(x - 1);
        runStart = x;
        runTop = top;
      }
    }
    flushRun(xEnd - 1);

    // --- Identify pitfalls
    let pitStart: number | null = null;
    const baseExists = baseGroundY !== null;
    for (let x = this.startXCoord; x < xEnd; x++) {
      const isPit = baseExists
        ? columnBottom[x] !== baseGroundY
        : columnBottom[x] === -1;

      if (isPit) {
        if (pitStart === null) pitStart = x;
      } else {
        if (pitStart !== null) {
          structures.push(new StructureFact(pitStart, x - 1, "Pitfall"));
          pitStart = null;
        }
      }
    }
    if (pitStart !== null) {
      structures.push(new StructureFact(pitStart, xEnd - 1, "Pitfall"));
    }

    // Sort deterministically
    structures.sort((a, b) => a.xStart - b.xStart);

    return structures;
  }

  setFact(category: FactCategory, x?: number, y?: number, type?: string): void {
    switch (category) {
      case "Structure": {
        // Recompute structure facts directly from the scene
        this.structureFacts = this.extractStructures(this.scene);
        break;
      }

      case "Enemy": {
        if (x === undefined || y === undefined) return;

        // Remove any existing enemy at (x, y)
        this.enemyFacts = this.enemyFacts.filter(
          (f) => !(f.x === x && f.y === y),
        );

        this.enemyFacts.push(new EnemyFact(x, y, type ?? "unknown"));
        break;
      }

      case "Collectable": {
        // Always recompute collectables from layer (keeps it consistent)
        this.collectableFacts = [];

        const collectablesLayer =
          this.scene.map.getLayer("Collectables_Layer")?.tilemapLayer;

        if (collectablesLayer) {
          const xs: number[] = [];
          const ys: number[] = [];
          const types: number[] = [];

          for (let cx = 0; cx < collectablesLayer.width; cx++) {
            for (let cy = 0; cy < collectablesLayer.height; cy++) {
              const tile = collectablesLayer.getTileAt(cx, cy);
              if (tile) {
                xs.push(cx);
                ys.push(cy);
                types.push(tile.index);
              }
            }
          }

          if (xs.length > 0) {
            this.collectableFacts.push(new CollectableFact(xs, ys, types));
          }
        }
        break;
      }
    }

    console.log(this.toString());
  }

  getFact(category: FactCategory): Fact[] {
    switch (category) {
      case "Structure":
        return this.structureFacts;
      case "Collectable":
        return this.collectableFacts;
      case "Enemy":
        return this.enemyFacts;
      default:
        return [];
    }
  }

  toString(): string {
    const parts: string[] = [];

    if (this.structureFacts.length > 0) {
      parts.push(this.structureFacts.map((s) => s.toString()).join(" "));
    }
    if (this.collectableFacts.length > 0) {
      parts.push(this.collectableFacts.map((c) => c.toString()).join(" "));
    }
    if (this.enemyFacts.length > 0) {
      parts.push(this.enemyFacts.map((e) => e.toString()).join(" "));
    }

    return parts.join(" ");
  }
}
