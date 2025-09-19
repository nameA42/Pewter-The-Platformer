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
  });

  toolCall = tool(
    async (args: z.infer<typeof WorldFactsTool.argsSchema>) => {
      const { category } = args;
      const scene = this.sceneGetter();

      const facts = scene.worldFacts.getFact(category);
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
