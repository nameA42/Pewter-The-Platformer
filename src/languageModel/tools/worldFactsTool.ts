import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GroundFact, CollectableFact, EnemyFact } from "../../worldFacts.ts";
import { EditorScene } from "../../phaser/editorScene.ts";

export class WorldFactsTool {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  static argsSchema = z.object({
    action: z
      .enum(["get", "set", "list", "remove"])
      .describe("The operation to perform: 'get', 'set', 'list', or 'remove'."),

    key: z
      .string()
      .optional()
      .describe("Identifier for the fact (used in 'get' and 'remove')."),

    factType: z
      .enum(["Ground", "Pitfall", "Collectable", "Enemy"])
      .optional()
      .describe("When setting a fact, specify its type."),

    x: z
      .number()
      .optional()
      .describe("X-coordinate (required for most facts)."),
    y: z
      .number()
      .optional()
      .describe("Y-coordinate (required for most facts)."),

    itemType: z.string().optional().describe("Type of collectable item."),

    enemyId: z.string().optional().describe("Unique ID for enemy."),
    enemyType: z.string().optional().describe("Enemy type or class."),
  });

  toolCall = tool(
    async (args: z.infer<typeof WorldFactsTool.argsSchema>) => {
      const { action, key, factType, x, y, itemType, enemyId, enemyType } =
        args;
      const scene = this.sceneGetter();

      switch (action) {
        case "set": {
          if (!factType)
            return "❌ Tool Failed: 'factType' is required for action 'set'.";

          let fact;

          switch (factType) {
            case "Ground":
            case "Pitfall": {
              if (typeof x !== "number" || typeof y !== "number")
                return "❌ Tool Failed: 'x' and 'y' are required for Ground/Pitfall.";
              fact = new GroundFact(x, y, factType === "Ground");
              break;
            }

            case "Collectable": {
              if (typeof x !== "number" || typeof y !== "number" || !itemType)
                return "❌ Tool Failed: 'x', 'y', and 'itemType' are required for Collectable.";
              fact = new CollectableFact(x, y, itemType);
              break;
            }

            case "Enemy": {
              if (
                !enemyId ||
                typeof x !== "number" ||
                typeof y !== "number" ||
                !enemyType
              )
                return "❌ Tool Failed: 'enemyId', 'x', 'y', and 'enemyType' are required for Enemy.";
              fact = new EnemyFact(x, y, enemyType);
              break;
            }
          }

          // Always refresh after change
          scene.worldFacts.refresh();
          return `✅ ${fact.category} fact set: ${JSON.stringify(fact.toJSON())}`;
        }

        case "get": {
          if (!key)
            return "❌ Tool Failed: 'key' is required for action 'get'.";
          const f = scene.worldFacts.getFact(key);
          if (!f) return `ℹ️ No fact found for "${key}".`;
          return `📖 FACT: ${f.key} → ${JSON.stringify(f.toJSON())}`;
        }

        case "list": {
          const rows = scene.worldFacts.listFacts();
          if (rows.length === 0) return "ℹ️ No facts saved yet.";
          return rows
            .map(
              (f) =>
                `📖 FACT: ${f.key} (${f.category}) = ${JSON.stringify(f.toJSON())}`,
            )
            .join("\n");
        }

        case "remove": {
          if (!key)
            return "❌ Tool Failed: 'key' is required for action 'remove'.";

          const exists = !!scene.worldFacts.getFact(key);
          if (!exists) return `ℹ️ No fact found for "${key}".`;

          scene.worldFacts.removeFact(key);

          // Always refresh after change
          scene.worldFacts.refresh();
          return `🗑️ Removed fact "${key}".`;
        }

        default:
          return "❌ Tool Failed: Invalid action.";
      }
    },
    {
      name: "manageWorldFacts",
      schema: WorldFactsTool.argsSchema,
      description: `
Manages persistent facts about the game world. Facts are typed into categories: Ground, Pitfall, Collectable, Enemy.

Actions:
- 'set': Create or update a fact. Requires 'factType' plus fact-specific fields.
- 'get': Retrieve a fact (requires 'key').
- 'list': Show all stored facts with details.
- 'remove': Delete a fact (requires 'key').

The tool always refreshes world facts from the scene whenever a change is made ('set' or 'remove').
`,
    },
  );
}
