type Stored = {
  value: unknown;
  description?: string;
  updatedAt: number; // epoch ms
};

const LS_KEY = "worldFacts:v1";

class WorldFacts {
  private facts = new Map<string, Stored>();

  constructor() {
    this.load();
  }

  setFact(key: string, value: unknown, description?: string): string {
    const entry: Stored = { value, description, updatedAt: Date.now() };
    this.facts.set(key, entry);
    this.persist();
    return `Saved fact "${key}" = ${JSON.stringify(value)}${description ? ` (${description})` : ""}.`;
  }

  getFact<T = unknown>(key: string): T | undefined {
    return this.facts.get(key)?.value as T | undefined;
  }

  describe(key: string): string | undefined {
    return this.facts.get(key)?.description;
  }

  removeFact(key: string): boolean {
    const ok = this.facts.delete(key);
    if (ok) this.persist();
    return ok;
  }

  listFacts(): Array<{
    key: string;
    value: unknown;
    description?: string;
    updatedAt: number;
  }> {
    return [...this.facts.entries()].map(([key, s]) => ({ key, ...s }));
  }

  clearAll(): void {
    this.facts.clear();
    this.persist();
  }

  // --- persistence ---
  private persist(): void {
    try {
      const obj: Record<string, Stored> = {};
      for (const [k, v] of this.facts.entries()) obj[k] = v;
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn("Failed to persist world facts:", e);
    }
  }
  private load(): void {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw) as Record<string, Stored>;
      this.facts = new Map(Object.entries(obj));
    } catch (e) {
      console.warn("Failed to load world facts:", e);
    }
  }
}

export const worldFacts = new WorldFacts();
