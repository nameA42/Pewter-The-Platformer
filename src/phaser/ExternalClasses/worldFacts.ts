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

    const xs: number[] = [];
    const ys: number[] = [];

    // Step 1: record topmost tile for each column
    for (let x = 0; x < width; x++) {
      xs.push(x);
      let topY = -1;
      for (let y = 0; y < height; y++) {
        if (groundLayer.getTileAt(x, y)) {
          topY = y;
          break;
        }
      }
      ys.push(topY);
    }

    // Helper: is the tile unsupported below?
    const isFloating = (x: number, y: number) => {
      if (y === -1) return false;
      const belowTile = groundLayer.getTileAt(x, y + 1);
      return !belowTile;
    };

    let segStart = 0;
    let prevType: "Pitfall" | "Platform" | "Flat" | "Ramp" | null = null;
    let prevHeights: number | number[] | null = null;

    for (let i = 0; i <= xs.length; i++) {
      const x = xs[i];
      const y = ys[i] ?? -1;

      // Determine current type and height(s)
      let type: "Pitfall" | "Platform" | "Flat" | "Ramp";
      let heightsOrHeight: number | number[];

      if (y === -1) {
        type = "Pitfall";
        heightsOrHeight = [-1];
      } else if (isFloating(x, y)) {
        type = "Platform";
        heightsOrHeight = [y];
      } else {
        // fully supported
        type = "Flat";
        heightsOrHeight = y;
      }

      // Check if we should split segment
      const typeChanged =
        prevType !== null &&
        (type !== prevType ||
          (type === "Flat" && heightsOrHeight !== prevHeights));

      if (typeChanged) {
        structures.push(
          new StructureFact(xs[segStart], xs[i - 1], prevType!, prevHeights!),
        );
        segStart = i;
      }

      prevType = type;
      prevHeights = heightsOrHeight;
    }

    // Push final segment
    if (segStart < xs.length) {
      structures.push(
        new StructureFact(
          xs[segStart],
          xs[xs.length - 1],
          prevType!,
          prevHeights!,
        ),
      );
    }

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
