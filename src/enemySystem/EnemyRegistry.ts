// Enemy Registry - Tracks enemies by unique name for modification
import type { EditorScene } from "../phaser/editorScene.ts";
import type { DynamicEnemy } from "./runtime/DynamicEnemy.ts";
import type { Slime } from "../phaser/ExternalClasses/Slime.ts";
import type { UltraSlime } from "../phaser/ExternalClasses/UltraSlime.ts";

type EnemyInstance = DynamicEnemy | Slime | UltraSlime;

export class EnemyRegistry {
  /**
   * Generate a unique enemy name by checking existing enemies
   * If name already exists, append a number (e.g., "Slime", "Slime 1", "Slime 2")
   * @param excludeEnemy - Optional enemy to exclude from uniqueness check (for renaming)
   */
  static generateUniqueName(
    scene: EditorScene,
    requestedName: string,
    excludeEnemy?: EnemyInstance,
  ): string {
    const existingNames = new Set<string>();

    // Collect all existing enemy names/types (excluding the enemy being renamed)
    for (const enemy of scene.enemies) {
      if (enemy !== excludeEnemy) {
        existingNames.add(enemy.type || "Unknown");
      }
    }

    // If name is unique, return it
    if (!existingNames.has(requestedName)) {
      return requestedName;
    }

    // Find the next available number
    let counter = 1;
    let uniqueName = `${requestedName} ${counter}`;

    while (existingNames.has(uniqueName)) {
      counter++;
      uniqueName = `${requestedName} ${counter}`;
    }

    return uniqueName;
  }

  /**
   * Find an enemy by its unique name
   * Returns the enemy instance or null if not found
   */
  static findEnemyByName(
    scene: EditorScene,
    name: string,
  ): EnemyInstance | null {
    for (const enemy of scene.enemies) {
      if (enemy.type === name) {
        return enemy as EnemyInstance;
      }
    }
    return null;
  }

  /**
   * Get all enemy names in the scene
   */
  static getAllEnemyNames(scene: EditorScene): string[] {
    return scene.enemies.map((e) => e.type || "Unknown");
  }

  /**
   * Check if an enemy name exists
   */
  static enemyExists(scene: EditorScene, name: string): boolean {
    return this.findEnemyByName(scene, name) !== null;
  }
}
