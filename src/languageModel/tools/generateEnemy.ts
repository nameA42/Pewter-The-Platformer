// // LLM Tool for generating custom enemies using CEDL
// import { tool } from "@langchain/core/tools";
// import type { EditorScene } from "../../phaser/editorScene.ts";
// import { z } from "zod";
// import { parseCEDL } from "../../enemySystem/cedl/parser";
// import { EnemyFactory } from "../../enemySystem/factory/EnemyFactory";
// import {
//   getTemplate,
//   getTemplateSummary,
// } from "../../enemySystem/cedl/templates";
// import { getSpriteGenerator } from "../../enemySystem/sprite/SpriteGenerator";
// import { OverlapChecker } from "../../phaser/OverlapChecker.ts";
// import { EnemyRegistry } from "../../enemySystem/EnemyRegistry.ts";

// export class GenerateEnemy {
//   sceneGetter: () => EditorScene;

//   constructor(sceneGetter: () => EditorScene) {
//     this.sceneGetter = sceneGetter;
//   }

//   static argsSchema = z.object({
//     cedl_code: z
//       .string()
//       .describe(
//         "CEDL (Custom Enemy Definition Language) YAML code defining the enemy. Required if no template is specified. Can be partial CEDL to override template values.",
//       )
//       .optional(),
//     template: z
//       .string()
//       .describe(
//         "Name of a pre-built template to use. Available: 'Patrol Guard', 'Turret', 'Charger', 'Flyer', 'Sniper', 'Shotgunner', 'Bullet Hell', 'Homing Drone', 'Berserker', 'Teleporter'. If provided, cedl_code can contain overrides.",
//       )
//       .optional(),
//     x: z
//       .number()
//       .int()
//       .min(0)
//       .describe("X tile coordinate where enemy will be placed"),
//     y: z
//       .number()
//       .int()
//       .min(0)
//       .describe("Y tile coordinate where enemy will be placed"),
//   });

//   toolCall = tool(
//     async (args: z.infer<typeof GenerateEnemy.argsSchema>) => {
//       const scene = this.sceneGetter();
//       if (!scene) {
//         return "❌ Tool Failed: no reference to scene.";
//       }

//       const { cedl_code, template, x, y } = args;

//       let finalCedl: string;

//       // Handle template-based creation
//       if (template) {
//         const templateData = getTemplate(template);
//         if (!templateData) {
//           const availableTemplates =
//             "Patrol Guard, Turret, Charger, Flyer, Sniper, Shotgunner, Bullet Hell, Homing Drone, Berserker, Teleporter";
//           return `❌ Template "${template}" not found.\n\nAvailable templates: ${availableTemplates}`;
//         }

//         if (cedl_code) {
//           // Merge template with overrides
//           finalCedl = mergeTemplateCedl(templateData.cedl, cedl_code);
//         } else {
//           finalCedl = templateData.cedl;
//         }
//       } else if (cedl_code) {
//         finalCedl = cedl_code;
//       } else {
//         return "❌ Tool Failed: Either 'cedl_code' or 'template' must be provided.";
//       }

//       // Parse and validate CEDL
//       const parseResult = parseCEDL(finalCedl);

//       if (!parseResult.success) {
//         const errorMsg =
//           parseResult.errors?.join("\n") || "Unknown parsing error";
//         return `❌ CEDL Validation Error:\n${errorMsg}\n\nPlease check your CEDL code syntax and try again. Make sure all required fields (name, stats, behavior) are present.`;
//       }

//       if (!parseResult.data) {
//         return "❌ Tool Failed: parsed data is missing.";
//       }

//       // Generate unique name for the enemy
//       const uniqueName = EnemyRegistry.generateUniqueName(
//         scene,
//         parseResult.data.name,
//       );
//       if (uniqueName !== parseResult.data.name) {
//         // Update the name in the parsed data
//         parseResult.data.name = uniqueName;
//       }

//       // Generate sprite if needed
//       let spriteGenerationNote = "";
//       try {
//         const spriteGenerator = getSpriteGenerator();
//         spriteGenerator.initialize(scene);

//         if (spriteGenerator.isAvailable()) {
//           // Determine sprite description from enemy name or template
//           const spriteDescription = template || parseResult.data.name;

//           // Only generate if not already using a custom texture
//           if (!parseResult.data.looks?.custom_texture) {
//             console.log(
//               `🎨 Attempting to generate sprite for: ${spriteDescription}`,
//             );

//             const spriteResult =
//               await spriteGenerator.generateSprite(spriteDescription);

//             if (spriteResult.textureKey && !spriteResult.error) {
//               // Add custom texture to definition
//               if (!parseResult.data.looks) {
//                 parseResult.data.looks = {};
//               }
//               parseResult.data.looks.custom_texture = spriteResult.textureKey;

//               spriteGenerationNote = spriteResult.cached
//                 ? ` [Using cached sprite]`
//                 : ` [Generated new sprite]`;

//               console.log(
//                 `✅ Sprite generated successfully: ${spriteResult.textureKey}`,
//               );
//             } else if (spriteResult.error) {
//               console.warn(
//                 `⚠️ Sprite generation failed: ${spriteResult.error}. Using default sprite.`,
//               );
//               spriteGenerationNote = ` [Using default sprite - generation failed]`;
//             }
//           }
//         }
//       } catch (spriteError) {
//         console.warn("Sprite generation error (non-fatal):", spriteError);
//         spriteGenerationNote = ` [Using default sprite]`;
//       }

//       try {
//         // Check for overlaps before creating enemy
//         const overlapCheck = OverlapChecker.checkTileOverlap(
//           scene,
//           x,
//           y,
//           "enemy",
//         );
//         if (!overlapCheck.canPlace) {
//           return `❌ Cannot place enemy "${parseResult.data.name}" at (${x}, ${y}): ${overlapCheck.reason}`;
//         }

//         // Create enemy via factory
//         const enemy = EnemyFactory.create(
//           scene,
//           x,
//           y,
//           parseResult.data,
//           scene.map,
//           scene.groundLayer,
//         );

//         // Store spawn position for reset when exiting play mode
//         const spawnX = x * scene.map.tileWidth + scene.map.tileWidth / 2;
//         const spawnY = y * scene.map.tileHeight + scene.map.tileHeight / 2;
//         enemy.setData("spawnX", spawnX);
//         enemy.setData("spawnY", spawnY);

//         // Add to enemies array
//         scene.enemies.push(enemy);

//         // Update world facts
//         scene.worldFacts.setFact("Enemy", x, y, parseResult.data.name);

//         const templateNote = template
//           ? ` (based on "${template}" template)`
//           : "";
//         return `✅ Successfully created enemy "${parseResult.data.name}"${templateNote}${spriteGenerationNote} at tile (${x}, ${y}).\nStats: HP=${parseResult.data.stats.health}, Speed=${parseResult.data.stats.speed}`;
//       } catch (error) {
//         const errorMsg = error instanceof Error ? error.message : String(error);
//         console.error("Enemy creation failed:", error);
//         return `❌ Tool Failed: Error creating enemy - ${errorMsg}`;
//       }
//     },
//     {
//       name: "generateEnemy",
//       schema: GenerateEnemy.argsSchema,
//       description: `Generate a custom enemy using pre-built templates or custom CEDL code.

// TEMPLATES (recommended - just use the name):
// • "Patrol Guard" - Patrols, chases player
// • "Turret" - Stationary shooter
// • "Charger" - Fast rush attack
// • "Flyer" - Swoops down to attack
// • "Sniper" - Long-range shooter
// • "Shotgunner" - Spread shot attack
// • "Bullet Hell" - Circular projectile waves
// • "Homing Drone" - Launches homing missiles
// • "Berserker" - Stronger when damaged
// • "Teleporter" - Blinks near player

// EXAMPLES:
// 1. Simple: template: "Turret", x: 10, y: 5
// 2. Custom stats: template: "Charger", cedl_code: "enemy:\\n  name: Fast Charger\\n  stats:\\n    health: 20"

// CUSTOM CEDL (if needed):
// enemy:
//   name: "Name"
//   stats: { health: 10, speed: 60 }
//   behavior:
//     initial_state: "patrol"
//     states:
//       - name: "patrol"
//         actions: [{ type: "patrol", distance: 3 }]
//         transitions: [{ condition: "player_distance < 100", target: "chase" }]

// KEY ACTIONS: patrol, move_toward_player, move_away_from_player, shoot, jump, tint, scale, wait
// KEY CONDITIONS: player_distance < N, health < N, timer > N`,
//     },
//   );
// }

// // Helper function to merge template CEDL with user overrides
// function mergeTemplateCedl(templateCedl: string, overrideCedl: string): string {
//   // Simple approach: parse both as YAML-like objects and merge
//   // For now, we'll use a line-based merge that prioritizes overrides

//   const templateLines = templateCedl.split("\n");
//   const overrideLines = overrideCedl.split("\n");

//   // Extract override sections
//   const overrideSections = new Map<string, string[]>();
//   let currentSection = "";
//   let currentIndent = 0;

//   for (const line of overrideLines) {
//     const trimmed = line.trim();
//     if (!trimmed || trimmed.startsWith("#")) continue;

//     const indent = line.search(/\S/);

//     // Check for top-level keys under 'enemy:'
//     if (indent === 2 && trimmed.includes(":")) {
//       const key = trimmed.split(":")[0].trim();
//       currentSection = key;
//       currentIndent = indent;
//       overrideSections.set(key, [line]);
//     } else if (currentSection && indent > currentIndent) {
//       const sectionLines = overrideSections.get(currentSection);
//       if (sectionLines) {
//         sectionLines.push(line);
//       }
//     }
//   }

//   // Build merged output
//   const result: string[] = [];
//   let skipUntilIndent = -1;
//   let lastSectionKey = "";

//   for (let i = 0; i < templateLines.length; i++) {
//     const line = templateLines[i];
//     const trimmed = line.trim();
//     const indent = line.search(/\S/);

//     // Check if we should skip this line
//     if (skipUntilIndent >= 0) {
//       if (indent <= skipUntilIndent && trimmed) {
//         skipUntilIndent = -1;
//       } else {
//         continue;
//       }
//     }

//     // Check for section replacement
//     if (indent === 2 && trimmed.includes(":")) {
//       const key = trimmed.split(":")[0].trim();
//       lastSectionKey = key;

//       if (overrideSections.has(key)) {
//         // Replace entire section with override
//         const overrideSection = overrideSections.get(key)!;
//         result.push(...overrideSection);
//         skipUntilIndent = indent;
//         continue;
//       }
//     }

//     result.push(line);
//   }

//   // Add any override sections that weren't in template
//   for (const [key, lines] of overrideSections) {
//     // Check if this section was already added
//     const alreadyAdded = result.some((line) => {
//       const trimmed = line.trim();
//       return trimmed.startsWith(key + ":");
//     });

//     if (!alreadyAdded) {
//       result.push(...lines);
//     }
//   }

//   return result.join("\n");
// }
