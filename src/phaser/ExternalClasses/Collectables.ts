import { CollectableFact } from "../../worldFacts.ts"; // <-- from the Fact hierarchy we defined earlier

export type CollectableData = {
  x: number;
  y: number;
  type: string; // e.g. "GoldCoin", "HealthPotion"
};

export class Collectables {
  private items = new Map<string, CollectableFact>();

  constructor(initial?: CollectableData[]) {
    if (initial) {
      for (const data of initial) {
        this.add(data);
      }
    }
  }

  // Add a new collectable
  add(data: CollectableData): CollectableFact {
    const fact = new CollectableFact(data.x, data.y, data.type);
    this.items.set(fact.key, fact);
    return fact;
  }

  // Get a collectable fact by ID
  get(id: string): CollectableFact | undefined {
    return this.items.get(id);
  }

  // Remove a collectable by ID
  remove(id: string): boolean {
    return this.items.delete(id);
  }

  // List all collectables
  list(): CollectableFact[] {
    return [...this.items.values()];
  }

  // Check if a collectable exists at a specific position
  findAt(x: number, y: number): CollectableFact | undefined {
    return this.list().find((c) => c.x === x && c.y === y);
  }

  // Update position or type of a collectable
  update(
    id: string,
    data: Partial<Omit<CollectableData, "id">>,
  ): CollectableFact | undefined {
    const existing = this.items.get(id);
    if (!existing) return undefined;

    if (typeof data.x === "number") existing.x = data.x;
    if (typeof data.y === "number") existing.y = data.y;
    if (data.type) existing.itemType = data.type;
    existing.updatedAt = Date.now();

    return existing;
  }
}
