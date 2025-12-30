// Enemy Factory - Creates DynamicEnemy instances from parsed CEDL
import type { EnemyDefinition as ParsedEnemyDefinition } from "../cedl/schema";
import { DynamicEnemy } from "../runtime/DynamicEnemy";

type EnemyDefinition = ParsedEnemyDefinition["enemy"];

export class EnemyFactory {
  static create(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    definition: EnemyDefinition,
    map: Phaser.Tilemaps.Tilemap,
    groundLayer: Phaser.Tilemaps.TilemapLayer,
  ): DynamicEnemy {
    const tileSize = map.tileWidth;
    const worldX = tileX * tileSize + tileSize / 2;
    const worldY = tileY * tileSize + tileSize / 2;

    const enemy = new DynamicEnemy(
      scene,
      worldX,
      worldY,
      definition,
      map,
      groundLayer,
    );

    return enemy;
  }
}
