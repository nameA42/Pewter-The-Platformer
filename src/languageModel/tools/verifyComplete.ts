import { tool } from "@langchain/core/tools";
import { z } from "zod";

export class VerifyComplete {
  static argsSchema = z.object({
    summary: z
      .string()
      .describe("Your friendly, conversational reply to the player. This is the final message the player will see — keep it short and avoid dumping raw coordinates or tile IDs."),
  });

  toolCall = tool(
    async (_args: z.infer<typeof VerifyComplete.argsSchema>) => {
      return "✅ Verification confirmed.";
    },
    {
      name: "verifyComplete",
      schema: VerifyComplete.argsSchema,
      description:
        "REQUIRED: Call this tool ALONE in its own message — never alongside other tools. " +
        "Only call it after all other tools have been called and their results have been returned to you. " +
        "Pass your player-facing reply as 'summary' — this is the only text the player will see, so make it friendly and useful. " +
        "Every response must include exactly one call to this tool, in a dedicated final message with no other tool calls.",
    },
  );
}
