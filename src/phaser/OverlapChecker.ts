import type { EditorScene } from "./editorScene.ts";

export type PlacementType = "ground" | "collectable" | "enemy";

export interface OverlapResult {
  canPlace: boolean;
  reason?: string;
}

export class OverlapChecker {
  /**
   * Check if a tile position is available for placement
   * @param scene - The editor scene
   * @param tileX - Tile X coordinate
   * @param tileY - Tile Y coordinate
   * @param placingType - Type of object being placed ('ground', 'collectable', or 'enemy')
   * @returns Object with canPlace boolean and optional reason string
   */
  static checkTileOverlap(
    scene: EditorScene,
    tileX: number,
    tileY: number,
    placingType: PlacementType,
  ): OverlapResult {
    // Bounds checking
    if (tileX < 0 || tileY < 0) {
      return {
        canPlace: false,
        reason: `Position (${tileX}, ${tileY}) is out of bounds`,
      };
    }

    const groundLayer = scene.groundLayer;
    const collectablesLayer = scene.collectablesLayer;
    const tileSize = scene.map.tileWidth;

    // Check ground layer (only if NOT placing a ground tile)
    if (placingType !== "ground") {
      const groundTile = groundLayer.getTileAt(tileX, tileY);
      if (groundTile && groundTile.index !== -1) {
        return {
          canPlace: false,
          reason: `Ground tile exists at (${tileX}, ${tileY})`,
        };
      }
    }

    // Check collectables layer (only if NOT placing a collectable)
    if (placingType !== "collectable") {
      const collectableTile = collectablesLayer.getTileAt(tileX, tileY);
      if (collectableTile && collectableTile.index !== -1) {
        return {
          canPlace: false,
          reason: `Collectable exists at (${tileX}, ${tileY})`,
        };
      }
    }

    // Check enemies - enemies cannot overlap each other or with other objects
    for (const enemy of scene.enemies) {
      const enemyTileX = Math.floor(enemy.x / tileSize);
      const enemyTileY = Math.floor(enemy.y / tileSize);
      if (enemyTileX === tileX && enemyTileY === tileY) {
        return {
          canPlace: false,
          reason:
            placingType === "enemy"
              ? `Enemy "${enemy.type}" already exists at (${tileX}, ${tileY})`
              : `Enemy "${enemy.type}" exists at (${tileX}, ${tileY})`,
        };
      }
    }

    return { canPlace: true };
  }
}
