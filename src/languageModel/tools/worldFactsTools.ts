import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { worldFacts } from "../../worldFacts.ts";

export class WorldFactsTool {
  static argsSchema = z.object({
    action: z.enum(["get", "set", "list", "remove"]),
    key: z.string().optional(),
    value: z.any().optional(),
    description: z.string().optional(),
  });

  toolCall = tool(
    async (args: z.infer<typeof WorldFactsTool.argsSchema>) => {
      const { action, key, value, description } = args;

      switch (action) {
        case "set": {
          if (!key) return "Error: 'key' is required for action 'set'.";
          if (typeof value === "undefined")
            return "Error: 'value' is required for action 'set'.";
          return worldFacts.setFact(key, value, description);
        }
        case "get": {
          if (!key) return "Error: 'key' is required for action 'get'.";
          const v = worldFacts.getFact(key);
          if (typeof v === "undefined") return `No fact found for "${key}".`;
          const d = worldFacts.describe(key);
          return `FACT: ${key} = ${JSON.stringify(v)}${d ? ` // ${d}` : ""}`;
        }
        case "list": {
          const rows = worldFacts.listFacts();
          if (rows.length === 0) return "No facts saved yet.";
          return rows
            .map(
              (r) =>
                `FACT: ${r.key} = ${JSON.stringify(r.value)}${r.description ? ` // ${r.description}` : ""} (updated ${new Date(r.updatedAt).toLocaleString()})`,
            )
            .join("\n");
        }
        case "remove": {
          if (!key) return "Error: 'key' is required for action 'remove'.";
          const ok = worldFacts.removeFact(key);
          return ok ? `Removed fact "${key}".` : `No fact found for "${key}".`;
        }
        default:
          return "Invalid action.";
      }
    },
    {
      name: "manage_world_facts",
      description:
        "Add, update, query, list, or remove facts about the game world. Use this to remember persistent details like counts, positions, or rules.",
      schema: WorldFactsTool.argsSchema,
    },
  );
}
