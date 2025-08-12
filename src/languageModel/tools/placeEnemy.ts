import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { Slime } from "../../phaser/EnemyClasses/Slime.ts";
import { UltraSlime } from "../../phaser/EnemyClasses/UltraSlime.ts";
import { z } from "zod";

export class PlaceEnemy {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  // New schema: enemy type + coordinates
  static argsSchema = z.object({
    enemyType: z.string(),
    x: z.number().int().min(0),
    y: z.number().int().min(0),
  });

  toolCall = tool(
    async (args: z.infer<typeof PlaceEnemy.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        console.log("getSceneFailed");
        return "Tool Failed: no reference to scene.";
      }

      const { enemyType, x, y } = args;

      const enemies = scene.enemies;

      if (enemyType == "Slime") {
        const slime = new Slime(scene, x, y);
        enemies.push(slime);
        return `Placed Slime Enemy at (${x}, ${y})'.`;
      } else if (enemyType == "UltraSlime") {
        const ultraSlime = new UltraSlime(scene, x, y);
        enemies.push(ultraSlime);
        return `Placed Ultra Slime Enemy at (${x}, ${y})'.`;
      } else {
        return "Tool Failed: not a valid enemy type";
      }
    },
    {
      name: "placeEnemy",
      schema: PlaceEnemy.argsSchema,
      description: "Places an enemy at a coordinate (x, y) in the scene.",
    },
  );
}
