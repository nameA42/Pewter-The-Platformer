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

  constructor(scene: EditorScene) {
    this.scene = scene;
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

      for (let x = 0; x < collectablesLayer.width; x++) {
        for (let y = 0; y < collectablesLayer.height; y++) {
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

    const width = groundLayer.width;
    const height = groundLayer.height;

    // --- Build grid[y][x] (1 = tile, 0 = empty)
    const grid: number[][] = [];
    for (let y = 0; y < height; y++) {
      const row: number[] = [];
      for (let x = 0; x < width; x++) {
        row.push(groundLayer.getTileAt(x, y) ? 1 : 0);
      }
      grid.push(row);
    }

    // --- bottommost tile per column (max y), -1 if none
    const columnBottoms: number[] = new Array(width).fill(-1);
    for (let x = 0; x < width; x++) {
      let bottom = -1;
      for (let y = 0; y < height; y++) {
        if (grid[y][x] === 1) bottom = y;
      }
      columnBottoms[x] = bottom;
    }

    // --- choose base ground Y as the mode of columnBottoms (ignore -1)
    const freq = new Map<number, number>();
    for (const b of columnBottoms) {
      if (b === -1) continue;
      freq.set(b, (freq.get(b) ?? 0) + 1);
    }
    let baseGroundY: number | null = null;
    let maxCount = 0;
    for (const [y, count] of freq.entries()) {
      if (count > maxCount) {
        maxCount = count;
        baseGroundY = y;
      }
    }

    // --- Produce base ground runs (Flats) using columnBottoms === baseGroundY
    if (baseGroundY !== null) {
      let runStart: number | null = null;
      for (let x = 0; x < width; x++) {
        const isBase = columnBottoms[x] === baseGroundY;
        if (isBase && runStart === null) runStart = x;
        if (!isBase && runStart !== null) {
          structures.push(
            new StructureFact(runStart, x - 1, "Flat", baseGroundY),
          );
          runStart = null;
        }
      }
      if (runStart !== null)
        structures.push(
          new StructureFact(runStart, width - 1, "Flat", baseGroundY),
        );
    }

    // --- Flood-fill to find all connected chunks (4-neighbor)
    const visited = Array.from({ length: height }, () =>
      Array(width).fill(false),
    );
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    function floodFill(sx: number, sy: number): [number, number][] {
      const stack: [number, number][] = [[sx, sy]];
      const cells: [number, number][] = [];
      visited[sy][sx] = true;
      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        cells.push([x, y]);
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (
            nx >= 0 &&
            nx < width &&
            ny >= 0 &&
            ny < height &&
            !visited[ny][nx] &&
            grid[ny][nx] === 1
          ) {
            visited[ny][nx] = true;
            stack.push([nx, ny]);
          }
        }
      }
      return cells;
    }

    // Helper: compute bottommost per column inside a chunk
    function chunkColumnBottoms(cells: [number, number][]): {
      xStart: number;
      xEnd: number;
      bottoms: number[];
    } {
      const xs = cells.map(([x]) => x);
      const xStart = Math.min(...xs);
      const xEnd = Math.max(...xs);
      const bottoms: number[] = [];
      for (let x = xStart; x <= xEnd; x++) {
        let b = -1;
        for (const [cx, cy] of cells) {
          if (cx === x && cy > b) b = cy;
        }
        bottoms.push(b);
      }
      return { xStart, xEnd, bottoms };
    }

    // --- Classify non-base chunks (Platforms / Flats / Ramps)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!visited[y][x] && grid[y][x] === 1) {
          const cells = floodFill(x, y);
          const { xStart, xEnd, bottoms } = chunkColumnBottoms(cells);

          // if this chunk is exactly the base-ground slice we already emitted, skip it
          const isSameAsBase =
            baseGroundY !== null && bottoms.every((b) => b === baseGroundY);
          if (isSameAsBase) continue;

          // check if any column in this chunk is floating (no tile directly below its bottom)
          let hasFloatingColumn = false;
          for (let i = 0; i < bottoms.length; i++) {
            const b = bottoms[i];
            if (b === -1) continue; // no tile in that column of chunk (shouldn't happen)
            const belowY = b + 1;
            if (belowY >= height || grid[belowY][xStart + i] === 0) {
              hasFloatingColumn = true;
              break;
            }
          }

          if (hasFloatingColumn) {
            // Platform: report the per-column bottom heights (could be mixed)
            structures.push(
              new StructureFact(xStart, xEnd, "Platform", bottoms),
            );
            continue;
          }

          // Fully supported: decide Flat vs Ramp vs Irregular
          const noMissing = bottoms.every((b) => b !== -1);
          if (!noMissing) {
            // treat as platform-ish if there are holes in the chunk's horizontal span
            structures.push(
              new StructureFact(xStart, xEnd, "Platform", bottoms),
            );
            continue;
          }

          // compute diffs
          const diffs: number[] = [];
          for (let i = 1; i < bottoms.length; i++)
            diffs.push(bottoms[i] - bottoms[i - 1]);
          const allDiffEqual = diffs.every((d) => d === diffs[0]);

          if (allDiffEqual && diffs[0] === 0) {
            if (
              baseGroundY !== null &&
              bottoms.every((b) => b === baseGroundY)
            ) {
              // true base ground flat
              structures.push(
                new StructureFact(xStart, xEnd, "Flat", baseGroundY),
              );
            } else {
              // flat chunk but not base → platform, report min height
              const minHeight = Math.min(...bottoms);
              structures.push(
                new StructureFact(xStart, xEnd, "Platform", minHeight),
              );
            }
          } else if (allDiffEqual && Math.abs(diffs[0]) === 1) {
            // ramp (consistent slope of +/-1)
            structures.push(new StructureFact(xStart, xEnd, "Ramp", bottoms));
          } else {
            // irregular but supported -> platform, report min height
            const minHeight = Math.min(...bottoms);
            structures.push(
              new StructureFact(xStart, xEnd, "Platform", minHeight),
            );
          }
        }
      }
    }

    // --- Pitfalls: columns where the base ground is missing (columnBottoms !== baseGroundY)
    if (baseGroundY !== null) {
      let pitStart: number | null = null;
      for (let x = 0; x < width; x++) {
        const isPit = columnBottoms[x] !== baseGroundY;
        if (isPit && pitStart === null) pitStart = x;
        if (!isPit && pitStart !== null) {
          structures.push(new StructureFact(pitStart, x - 1, "Pitfall", [-1]));
          pitStart = null;
        }
      }
      if (pitStart !== null)
        structures.push(
          new StructureFact(pitStart, width - 1, "Pitfall", [-1]),
        );
    } else {
      // no dominant base ground found; if you want, treat columns with no tiles as pitfalls:
      let pitStart: number | null = null;
      for (let x = 0; x < width; x++) {
        const isPit = columnBottoms[x] === -1;
        if (isPit && pitStart === null) pitStart = x;
        if (!isPit && pitStart !== null) {
          structures.push(new StructureFact(pitStart, x - 1, "Pitfall", [-1]));
          pitStart = null;
        }
      }
      if (pitStart !== null)
        structures.push(
          new StructureFact(pitStart, width - 1, "Pitfall", [-1]),
        );
    }

    // --- Sort facts by xStart for deterministic output
    structures.sort((a: any, b: any) => a.xStart - b.xStart);

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
