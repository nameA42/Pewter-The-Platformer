import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { EditorScene } from "../../phaser/editorScene.ts";

export class WorldFactsTool {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  static argsSchema = z.object({
    category: z
      .enum(["Structure", "Collectable", "Enemy"])
      .describe("The category of facts to retrieve."),

    xMin: z
      .number()
      .int()
      .min(0)
      .describe("Minimum X (leftmost column index, inclusive)."),

    xMax: z
      .number()
      .int()
      .min(0)
      .describe("Maximum X (rightmost column index, inclusive)."),

    yMin: z
      .number()
      .int()
      .min(0)
      .describe("Minimum Y (topmost row index, inclusive)."),

    yMax: z
      .number()
      .int()
      .min(0)
      .describe("Maximum Y (bottommost row index, inclusive)."),
  });

  toolCall = tool(
    async (args: z.infer<typeof WorldFactsTool.argsSchema>) => {
      const { category, xMin, xMax, yMin, yMax } = args;
      const scene = this.sceneGetter();

      const facts = scene.worldFacts.getFact(category, xMin, xMax, yMin, yMax);
      if (!facts || facts.length === 0) {
        return `ℹ️ No facts found in category "${category}".`;
      }

      return facts
        .map((f) => `📖 FACT: ${f.key} → ${JSON.stringify(f.toString())}`)
        .join("\n");
    },
    {
      name: "getWorldFacts",
      schema: WorldFactsTool.argsSchema,
      description: `
Retrieve stored facts about the game world, grouped by category.

Categories:
- 'Structure': Information about ground height map.
- 'Collectable': Items that can be collected.
- 'Enemy': Enemy positions and types.
`,
    },
  );
}
