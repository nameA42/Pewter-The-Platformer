// // LLM Tool for modifying existing enemies
// import { tool } from "@langchain/core/tools";
// import type { EditorScene } from "../../phaser/editorScene.ts";
// import { z } from "zod";
// import { parseCEDL } from "../../enemySystem/cedl/parser";
// import { EnemyRegistry } from "../../enemySystem/EnemyRegistry.ts";
// import { EnemyFactory } from "../../enemySystem/factory/EnemyFactory";
// import { DynamicEnemy } from "../../enemySystem/runtime/DynamicEnemy.ts";
// import type { EnemyDefinition as ParsedEnemyDefinition } from "../../enemySystem/cedl/schema";

// type EnemyDefinition = ParsedEnemyDefinition["enemy"];

// export class ModifyEnemy {
//   sceneGetter: () => EditorScene;

//   constructor(sceneGetter: () => EditorScene) {
//     this.sceneGetter = sceneGetter;
//   }

//   static argsSchema = z.object({
//     enemyName: z
//       .string()
//       .min(1)
//       .describe(
//         "The unique name of the enemy to modify (e.g., 'Turret', 'Slime 1', 'Sniper'). Use the exact name as it appears in the game.",
//       ),
//     cedl_updates: z
//       .string()
//       .describe(
//         "Partial CEDL code containing only the fields you want to update. This should be a YAML object under 'enemy:' with the fields to modify (stats, looks, projectiles, behavior, etc.). Only include the fields that need to change.",
//       ),
//   });

//   toolCall = tool(
//     async (args: z.infer<typeof ModifyEnemy.argsSchema>) => {
//       const scene = this.sceneGetter();
//       if (!scene) {
//         return "❌ Tool Failed: no reference to scene.";
//       }

//       const { enemyName, cedl_updates } = args;

//       // Find the enemy by name
//       const enemy = EnemyRegistry.findEnemyByName(scene, enemyName);
//       if (!enemy) {
//         const allNames = EnemyRegistry.getAllEnemyNames(scene);
//         return `❌ Enemy "${enemyName}" not found.\n\nAvailable enemies: ${allNames.join(", ") || "(none)"}`;
//       }

//       // Only DynamicEnemy can be modified (Slime/UltraSlime are legacy enemies)
//       if (!(enemy instanceof DynamicEnemy)) {
//         return `❌ Cannot modify enemy "${enemyName}" - it is a legacy enemy type (Slime/UltraSlime). Only custom enemies created with generateEnemy can be modified.`;
//       }

//       // Parse the update CEDL
//       const wrappedCedl = `enemy:\n${cedl_updates}`;
//       const parseResult = parseCEDL(wrappedCedl);

//       if (!parseResult.success) {
//         const errorMsg =
//           parseResult.errors?.join("\n") || "Unknown parsing error";
//         return `❌ CEDL Validation Error in updates:\n${errorMsg}\n\nPlease check your CEDL syntax.`;
//       }

//       if (!parseResult.data) {
//         return "❌ Tool Failed: parsed update data is missing.";
//       }

//       // Merge updates with existing definition
//       const currentDef = enemy.getDefinition();
//       const mergedDefinition = this.mergeDefinitions(
//         currentDef,
//         parseResult.data,
//       );

//       // Handle name changes - ensure uniqueness if name is being changed
//       if (parseResult.data.name && parseResult.data.name !== enemy.type) {
//         // Exclude current enemy from uniqueness check
//         const uniqueName = EnemyRegistry.generateUniqueName(
//           scene,
//           parseResult.data.name,
//           enemy,
//         );
//         if (uniqueName !== parseResult.data.name) {
//           // Name conflict - use unique name instead
//           mergedDefinition.name = uniqueName;
//           parseResult.data.name = uniqueName;
//         }
//       }

//       // Check if recreation is needed
//       const needsRecreation = enemy.needsRecreation(parseResult.data);

//       if (needsRecreation) {
//         // Recreate the enemy with new definition
//         return this.recreateEnemy(scene, enemy, mergedDefinition);
//       } else {
//         // Update in-place
//         return this.updateEnemyInPlace(enemy, parseResult.data);
//       }
//     },
//     {
//       name: "modifyEnemy",
//       schema: ModifyEnemy.argsSchema,
//       description: `Modify an existing enemy's properties using partial CEDL code.

// EXAMPLE USAGE:
// 1. Change health: cedl_updates: "stats:\\n  health: 25"
// 2. Change speed: cedl_updates: "stats:\\n  speed: 80"
// 3. Change tint: cedl_updates: "looks:\\n  tint: 0xff0000"
// 4. Change multiple stats: cedl_updates: "stats:\\n  health: 30\\n  speed: 100\\n  damage_on_contact: 3"

// IMPORTANT:
// - Only include fields you want to change
// - Behavior and projectile changes require enemy recreation (will be handled automatically)
// - Use the exact enemy name as it appears (may include numbers like "Slime 1")
// - For natural language requests, convert to CEDL format before calling this tool

// AVAILABLE FIELDS TO MODIFY:
// - stats: { health, speed, damage_on_contact }
// - looks: { base_sprite, tint, scale, shape_overlay, custom_texture }
// - projectiles: (array of projectile definitions - requires recreation)
// - behavior: (state machine definition - requires recreation)
// - effects: (trail, death effects)`,
//     },
//   );

//   private mergeDefinitions(
//     current: EnemyDefinition,
//     updates: EnemyDefinition,
//   ): EnemyDefinition {
//     // Deep merge updates into current definition
//     const merged: EnemyDefinition = {
//       name: updates.name || current.name,
//       stats: { ...current.stats, ...updates.stats },
//       behavior: updates.behavior || current.behavior,
//     };

//     // Merge looks if provided
//     if (updates.looks || current.looks) {
//       merged.looks = { ...current.looks, ...updates.looks };
//     }

//     // Merge projectiles if provided
//     if (updates.projectiles !== undefined) {
//       merged.projectiles = updates.projectiles;
//     } else if (current.projectiles !== undefined) {
//       merged.projectiles = current.projectiles;
//     }

//     // Merge effects if provided
//     if (updates.effects || current.effects) {
//       merged.effects = { ...current.effects, ...updates.effects };
//     }

//     return merged;
//   }

//   private updateEnemyInPlace(
//     enemy: DynamicEnemy,
//     updates: EnemyDefinition,
//   ): string {
//     const changes: string[] = [];

//     // Update stats if provided
//     if (updates.stats) {
//       enemy.updateStats(updates.stats);
//       if (updates.stats.health !== undefined)
//         changes.push(`health=${updates.stats.health}`);
//       if (updates.stats.speed !== undefined)
//         changes.push(`speed=${updates.stats.speed}`);
//       if (updates.stats.damage_on_contact !== undefined)
//         changes.push(`damage_on_contact=${updates.stats.damage_on_contact}`);
//     }

//     // Update looks if provided
//     if (updates.looks) {
//       enemy.updateLooks(updates.looks);
//       if (updates.looks.tint !== undefined) changes.push("tint updated");
//       if (updates.looks.scale !== undefined) changes.push("scale updated");
//       if (updates.looks.base_sprite !== undefined)
//         changes.push("sprite updated");
//     }

//     // Update name if provided
//     if (updates.name && updates.name !== enemy.type) {
//       enemy.updateName(updates.name);
//       changes.push(`name changed to "${updates.name}"`);
//     }

//     const changesList = changes.length > 0 ? changes.join(", ") : "no changes";
//     return `✅ Successfully updated enemy "${enemy.type}". Changes: ${changesList}`;
//   }

//   private recreateEnemy(
//     scene: EditorScene,
//     oldEnemy: DynamicEnemy,
//     newDefinition: EnemyDefinition,
//   ): string {
//     // Store position
//     const tileX = Math.floor(oldEnemy.x / scene.map.tileWidth);
//     const tileY = Math.floor(oldEnemy.y / scene.map.tileHeight);

//     // Remove old enemy from array
//     const enemyIndex = scene.enemies.indexOf(oldEnemy);
//     if (enemyIndex !== -1) {
//       scene.enemies.splice(enemyIndex, 1);
//     }

//     // Destroy old enemy
//     oldEnemy.destroy();

//     try {
//       // Create new enemy with merged definition
//       const newEnemy = EnemyFactory.create(
//         scene,
//         tileX,
//         tileY,
//         newDefinition,
//         scene.map,
//         scene.groundLayer,
//       );

//       // Store spawn position
//       const spawnX = tileX * scene.map.tileWidth + scene.map.tileWidth / 2;
//       const spawnY = tileY * scene.map.tileHeight + scene.map.tileHeight / 2;
//       newEnemy.setData("spawnX", spawnX);
//       newEnemy.setData("spawnY", spawnY);

//       // Add to enemies array (at end since old one was removed)
//       scene.enemies.push(newEnemy);

//       // Update world facts
//       scene.worldFacts.setFact("Enemy", tileX, tileY, newDefinition.name);

//       return `✅ Successfully recreated enemy "${newDefinition.name}" at (${tileX}, ${tileY}).\nStats: HP=${newDefinition.stats.health}, Speed=${newDefinition.stats.speed}`;
//     } catch (error) {
//       const errorMsg = error instanceof Error ? error.message : String(error);
//       console.error("Enemy recreation failed:", error);
//       return `❌ Tool Failed: Error recreating enemy - ${errorMsg}`;
//     }
//   }
// }
