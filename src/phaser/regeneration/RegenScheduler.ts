import Phaser from "phaser";
import type { EditorScene } from "../editorScene";
import type { SelectionBox } from "../selectionBox";

export interface RegenJob {
  selection: SelectionBox;
  z: number;
  bounds: Phaser.Geom.Rectangle;
}

export interface OverlapInfo {
  a: SelectionBox;
  b: SelectionBox;
  intersection: Phaser.Geom.Rectangle;
  low: SelectionBox;
  high: SelectionBox;
}

export interface ScheduledRegenStep {
  job: RegenJob;
  /** Selections with higher z that overlap this job (informational only) */
  overlappingHigher: SelectionBox[];
  /** Selections with lower z that overlap this job (informational only) */
  overlappingLower: SelectionBox[];
  /** Rectangles that must be treated as read-only for this job (higher-z ownership in overlaps). */
  protectedRects: Phaser.Geom.Rectangle[];
  /** Fresh overlap snapshot context text to include in prompts. */
  overlapContextText: string;
}

/**
 * Computes overlap intersections (different z-levels only).
 */
export function computeOverlaps(selections: SelectionBox[]): OverlapInfo[] {
  const overlaps: OverlapInfo[] = [];
  for (let i = 0; i < selections.length; i++) {
    for (let j = i + 1; j < selections.length; j++) {
      const a = selections[i];
      const b = selections[j];
      if (a.getZLevel() === b.getZLevel()) continue;
      const ra = a.getBounds();
      const rb = b.getBounds();
      if (!Phaser.Geom.Intersects.RectangleToRectangle(ra, rb)) continue;
      const intersection = Phaser.Geom.Rectangle.Intersection(ra, rb);
      const low = a.getZLevel() < b.getZLevel() ? a : b;
      const high = low === a ? b : a;
      overlaps.push({ a, b, intersection, low, high });
    }
  }
  return overlaps;
}

/**
 * Priority-aware topo scheduler:
 * - base priority: higher z earlier
 * - dependency constraint: for overlaps, high-z depends on low-z (low must run first)
 */
export function scheduleRegenerationSteps(
  scene: EditorScene,
  selections: SelectionBox[],
): ScheduledRegenStep[] {
  // Build jobs
  const jobs: RegenJob[] = selections.map((selection) => ({
    selection,
    z: selection.getZLevel(),
    bounds: selection.getBounds(),
  }));

  // Compute overlap edges low -> high
  const overlaps = computeOverlaps(selections);
  const deps = new Map<SelectionBox, Set<SelectionBox>>(); // node -> prerequisites
  const rev = new Map<SelectionBox, Set<SelectionBox>>();
  for (const j of jobs) {
    deps.set(j.selection, new Set());
    rev.set(j.selection, new Set());
  }
  for (const o of overlaps) {
    deps.get(o.high)!.add(o.low);
    rev.get(o.low)!.add(o.high);
  }

  // in-degree
  const indeg = new Map<SelectionBox, number>();
  for (const [node, ps] of deps.entries()) indeg.set(node, ps.size);

  // ready list (we'll repeatedly pick highest z)
  const ready: SelectionBox[] = [];
  for (const [node, deg] of indeg.entries()) if (deg === 0) ready.push(node);

  const pickNextReady = () => {
    ready.sort((a, b) => b.getZLevel() - a.getZLevel());
    return ready.shift();
  };

  const order: SelectionBox[] = [];
  while (ready.length) {
    const next = pickNextReady();
    if (!next) break;
    order.push(next);
    for (const dependent of rev.get(next) ?? []) {
      indeg.set(dependent, (indeg.get(dependent) ?? 0) - 1);
      if ((indeg.get(dependent) ?? 0) === 0) ready.push(dependent);
    }
  }

  // If cycles (shouldn't happen with strict low->high), append remaining by z.
  if (order.length !== selections.length) {
    const remaining = selections.filter((s) => !order.includes(s));
    remaining.sort((a, b) => b.getZLevel() - a.getZLevel());
    order.push(...remaining);
  }

  // Build per-step protection rects: for a job (selection S), protect intersections with any HIGHER z selection.
  // That means: lower-z steps cannot edit overlap area that belongs to higher-z selections.
  const steps: ScheduledRegenStep[] = [];
  for (const sel of order) {
    const z = sel.getZLevel();
    const bounds = sel.getBounds();

    const overlappingHigher: SelectionBox[] = [];
    const overlappingLower: SelectionBox[] = [];
    const protectedRects: Phaser.Geom.Rectangle[] = [];

    for (const o of overlaps) {
      if (o.a !== sel && o.b !== sel) continue;
      const other = o.a === sel ? o.b : o.a;
      if (other.getZLevel() > z) overlappingHigher.push(other);
      if (other.getZLevel() < z) overlappingLower.push(other);
      if (other.getZLevel() > z) protectedRects.push(o.intersection);
    }

    // Very lightweight overlap context text for now: snapshot the *current* world tiles in overlap.
    // This is intentionally minimal to avoid touching the system prompt too much.
    let overlapContextText = "";
    if (overlappingLower.length || overlappingHigher.length) {
      overlapContextText +=
        "Overlaps with other selections (different z-levels). ";
      overlapContextText +=
        "Lower z-levels must treat higher-z overlap regions as read-only.\n";
      overlapContextText +=
        "Overlapping selections: " +
        [
          ...overlappingLower.map(
            (s) =>
              `LOW(z=${s.getZLevel()}) id=${(s as any).localContext?.id ?? "?"}`,
          ),
          ...overlappingHigher.map(
            (s) =>
              `HIGH(z=${s.getZLevel()}) id=${(s as any).localContext?.id ?? "?"}`,
          ),
        ].join(", ") +
        "\n";
      if (protectedRects.length) {
        overlapContextText +=
          "Protected overlap rectangles (tile coords): " +
          JSON.stringify(
            protectedRects.map((r) => ({
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
            })),
            null,
            2,
          ) +
          "\n";
      }
    }

    steps.push({
      job: { selection: sel, z, bounds },
      overlappingHigher,
      overlappingLower,
      protectedRects,
      overlapContextText,
    });
  }

  return steps;
}
