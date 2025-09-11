import type { EditorScene } from "./phaser/editorScene.ts";

// Base fact interface
export type FactCategory = "Ground" | "Pitfall" | "Collectable" | "Enemy";

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

// Ground fact: coordinate → ground height
export class GroundFact extends Fact {
  x: number;
  y: number;
  hasGround: boolean;

  constructor(x: number, y: number, hasGround: boolean) {
    super(
      `ground:${x},${y}`,
      hasGround ? "Ground" : "Pitfall",
      hasGround ? "Ground tile" : "Pitfall",
    );
    this.x = x;
    this.y = y;
    this.hasGround = hasGround;
  }

  toJSON() {
    return {
      category: this.category,
      x: this.x,
      y: this.y,
      hasGround: this.hasGround,
    };
  }
}

// Collectable fact: coordinate → item type
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

// Enemy fact: coordinate → enemy type
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
  private facts = new Map<string, Fact>();

  constructor(scene: EditorScene) {
    this.extractFromScene(scene);
  }

  private extractFromScene(scene: EditorScene) {
    // 1. Ground + pitfalls
    const groundLayer = scene.map.getLayer("Ground")?.tilemapLayer;
    if (groundLayer) {
      for (let x = 0; x < groundLayer.width; x++) {
        for (let y = 0; y < groundLayer.height; y++) {
          const tile = groundLayer.getTileAt(x, y);
          const hasGround = !!tile;
          const fact = new GroundFact(x, y, hasGround);
          this.facts.set(fact.key, fact);
        }
      }
    }

    // 2. Collectables
    for (const c of scene.collectables ?? []) {
      const fact = new CollectableFact(c.x, c.y, c.type);
      this.facts.set(fact.key, fact);
    }

    // 3. Enemies
    for (const e of scene.enemies ?? []) {
      const fact = new EnemyFact(e.x, e.y, e.type);
      this.facts.set(fact.key, fact);
    }
  }

  // --- API methods ---
  setFact(fact: Fact) {
    fact.updatedAt = Date.now();
    this.facts.set(fact.key, fact);
  }

  getFact(key: string): Fact | undefined {
    return this.facts.get(key);
  }

  removeFact(key: string): boolean {
    return this.facts.delete(key);
  }

  listFacts(): Fact[] {
    return [...this.facts.values()];
  }

  listByCategory(category: FactCategory): Fact[] {
    return this.listFacts().filter((f) => f.category === category);
  }
}
