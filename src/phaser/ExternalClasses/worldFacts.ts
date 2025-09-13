import type { EditorScene } from "../editorScene.ts";

export type FactCategory = "Ground" | "Collectable" | "Enemy";

export abstract class Fact {
  key: string;
  category: FactCategory;
  description?: string;
  updatedAt: number;

  constructor(key: string, category: FactCategory, description?: string) {
    this.key = key;
    this.category = category;
    this.description = description;
    this.updatedAt = Date.now();
  }

  abstract toJSON(): Record<string, unknown>;
}

export class GroundFact extends Fact {
  xs: number[];
  ys: number[];

  constructor(xs: number[], ys: number[]) {
    super("ground", "Ground");
    this.xs = xs;
    this.ys = ys;
  }

  toJSON() {
    return {
      category: this.category,
      xs: this.xs,
      ys: this.ys,
    };
  }
}

export class CollectableFact extends Fact {
  x: number;
  y: number;
  itemType: string;

  constructor(x: number, y: number, itemType: string) {
    super(
      `collectable:${x},${y}`,
      "Collectable",
      `Collectable of type '${itemType}'`,
    );
    this.x = x;
    this.y = y;
    this.itemType = itemType;
  }

  toJSON() {
    return {
      category: this.category,
      x: this.x,
      y: this.y,
      itemType: this.itemType,
    };
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

  toJSON() {
    return {
      category: this.category,
      x: this.x,
      y: this.y,
      enemyType: this.enemyType,
    };
  }
}

export class WorldFacts {
  private groundFacts: GroundFact[] = [];
  private collectableFacts: CollectableFact[] = [];
  private enemyFacts: EnemyFact[] = [];
  private scene: EditorScene;

  constructor(scene: EditorScene) {
    this.scene = scene;
    this.refresh();
  }

  /** Refresh all facts by extracting everything from the scene */
  refresh() {
    this.groundFacts = [];
    this.collectableFacts = [];
    this.enemyFacts = [];
    this.extractFromScene(this.scene);
  }

  private extractFromScene(scene: EditorScene) {
    // 1. Ground heights
    const groundLayer = scene.map.getLayer("Ground_Layer")?.tilemapLayer;
    if (groundLayer) {
      const groundHeights: Record<number, number> = {};

      for (let x = 0; x < groundLayer.width; x++) {
        for (let y = 0; y < groundLayer.height; y++) {
          const tile = groundLayer.getTileAt(x, y);
          if (tile) {
            groundHeights[x] = y;
            break;
          }
        }
      }

      const xs = Object.keys(groundHeights)
        .map(Number)
        .sort((a, b) => a - b);
      const ys = xs.map((x) => groundHeights[x]);

      this.groundFacts.push(new GroundFact(xs, ys));
    }

    // 2. Collectables
    for (const c of scene.collectables ?? []) {
      this.collectableFacts.push(new CollectableFact(c.x, c.y, c.type));
    }

    // 3. Enemies
    for (const e of scene.enemies ?? []) {
      this.enemyFacts.push(new EnemyFact(e.x, e.y, e.type));
    }
  }

  // --- API methods ---

  setFact(category: FactCategory, x: number, y: number, type?: string): void {
    switch (category) {
      case "Ground": {
        // Recompute ground heights directly from the scene
        const groundLayer =
          this.scene.map.getLayer("Ground_Layer")?.tilemapLayer;
        if (groundLayer) {
          const groundHeights: Record<number, number> = {};
          for (let gx = 0; gx < groundLayer.width; gx++) {
            for (let gy = 0; gy < groundLayer.height; gy++) {
              const tile = groundLayer.getTileAt(gx, gy);
              if (tile) {
                groundHeights[gx] = gy;
                break;
              }
            }
          }
          const xs = Object.keys(groundHeights)
            .map(Number)
            .sort((a, b) => a - b);
          const ys = xs.map((gx) => groundHeights[gx]);

          this.groundFacts = [new GroundFact(xs, ys)];
        }
        break;
      }

      case "Enemy": {
        // Replace any existing enemy fact at same (x, y)
        this.enemyFacts = this.enemyFacts.filter(
          (f) => !(f.x === x && f.y === y),
        );
        this.enemyFacts.push(new EnemyFact(x, y, type ?? "unknown"));
        break;
      }

      case "Collectable": {
        // Replace any existing collectable fact at same (x, y)
        this.collectableFacts = this.collectableFacts.filter(
          (f) => !(f.x === x && f.y === y),
        );
        this.collectableFacts.push(
          new CollectableFact(x, y, type ?? "unknown"),
        );
        break;
      }
    }
  }

  getFact(category: FactCategory): Fact[] {
    switch (category) {
      case "Ground":
        return this.groundFacts;
      case "Collectable":
        return this.collectableFacts;
      case "Enemy":
        return this.enemyFacts;
      default:
        return [];
    }
  }
}
