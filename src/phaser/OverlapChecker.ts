import type { EditorScene } from "./editorScene.ts";
import { findHighestSolidBlockZLevel } from "./selectionBox.ts";

export type PlacementType = "ground" | "collectable" | "enemy";

export interface OverlapResult {
  canPlace: boolean;
  reason?: string;
}

export class OverlapChecker {
  static checkTileOverlap(
    scene: EditorScene,
    tileX: number,
    tileY: number,
    placingType: PlacementType,
    currentZLevel: number = Infinity,
  ): OverlapResult {
    if (tileX < 0 || tileY < 0) {
      return {
        canPlace: false,
        reason: `Position (${tileX}, ${tileY}) is out of bounds`,
      };
    }

    // Only enforce solid-block check for collectables and enemies
    if (placingType === "collectable" || placingType === "enemy") {
      const solidZ = findHighestSolidBlockZLevel(tileX, tileY);
      if (solidZ !== null && solidZ > currentZLevel) {
        return {
          canPlace: false,
          reason: `a solid terrain block occupies (${tileX}, ${tileY}) on Ground_Layer`,
        };
      }
    }

    return { canPlace: true };
  }
}
