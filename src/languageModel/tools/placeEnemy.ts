import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { Slime } from "../../phaser/ExternalClasses/Slime.ts";
import { UltraSlime } from "../../phaser/ExternalClasses/UltraSlime.ts";
import { z } from "zod";

export class PlaceEnemy {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  // Improved schema: restricts enemyType to known classes
  static argsSchema = z.object({
    enemyType: z
      .enum(["Slime", "UltraSlime"])
      .describe("Type of enemy to place. Valid values: 'Slime', 'UltraSlime'."),
    x: z.number().int().min(0).describe("X coordinate in the scene."),
    y: z.number().int().min(0).describe("Y coordinate in the scene."),
  });

  toolCall = tool(
    async (args: z.infer<typeof PlaceEnemy.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) {
        console.log("getSceneFailed");
        return "❌ Tool Failed: no reference to scene.";
      }

      const { enemyType, x, y } = args;
      const enemies = scene.enemies;

      try {
        if (enemyType === "Slime") {
          const spawnX = x * scene.map.tileWidth + scene.map.tileWidth / 2;
          const spawnY = y * scene.map.tileWidth + scene.map.tileWidth / 2;
          const slime = new Slime(
            scene,
            spawnX,
            spawnY,
            scene.map,
            scene.groundLayer,
          );
          // Store spawn position for reset when exiting play mode
          slime.setData("spawnX", spawnX);
          slime.setData("spawnY", spawnY);
          enemies.push(slime);
          scene.worldFacts.setFact("Enemy", x, y, "Slime");
          return `✅ Placed Slime at (${x}, ${y}).`;
        } else if (enemyType === "UltraSlime") {
          const spawnX = x * scene.map.tileWidth + scene.map.tileWidth / 2;
          const spawnY = y * scene.map.tileWidth + scene.map.tileWidth / 2;
          const ultraSlime = new UltraSlime(
            scene,
            spawnX,
            spawnY,
            scene.map,
            scene.groundLayer,
          );
          // Store spawn position for reset when exiting play mode
          ultraSlime.setData("spawnX", spawnX);
          ultraSlime.setData("spawnY", spawnY);
          enemies.push(ultraSlime);
          scene.worldFacts.setFact("Enemy", x, y, "UltraSlime");
          return `✅ Placed UltraSlime at (${x}, ${y}).`;
        }
      } catch (e) {
        console.error("Enemy placement failed:", e);
        return "❌ Tool Failed: error while placing enemy.";
      }
    },
    {
      name: "placeEnemy",
      schema: PlaceEnemy.argsSchema,
      description: `
Places an enemy at the given (x, y) coordinates in the scene.

- enemyType: must be one of ["Slime", "UltraSlime"].
- x, y: integer coordinates (starting at 0).
- The enemy will be added to the scene's active enemies list.
`,
    },
  );
}
