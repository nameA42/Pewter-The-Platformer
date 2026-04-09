import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";
import { z } from "zod";

export class UndoRedoTool {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  static argsSchema = z.object({
    action: z
      .enum(["undo", "redo"])
      .describe("'undo' to revert changes, 'redo' to re-apply them."),
    times: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(1)
      .describe("Number of steps to undo or redo (default: 1)."),
  });

  toolCall = tool(
    async (args: z.infer<typeof UndoRedoTool.argsSchema>) => {
      const scene = this.sceneGetter();
      if (!scene) return "Tool Failed: no reference to scene.";

      const { action, times } = args;
      let performed = 0;
      for (let i = 0; i < times; i++) {
        const ok =
          action === "undo" ? scene.undoLastAction() : scene.redoLastAction();
        if (!ok) break;
        performed++;
      }

      if (performed === 0) {
        return `❌ Nothing to ${action}.`;
      }
      return `✅ ${action === "undo" ? "Undid" : "Redid"} ${performed} step(s).`;
    },
    {
      name: "undoRedo",
      schema: UndoRedoTool.argsSchema,
      description:
        "Undo or redo tile placement changes on the map. " +
        "Use 'undo' to revert recent changes (yours or the player's), 'redo' to re-apply them. " +
        "Specify 'times' to step back or forward multiple snapshots at once.",
    },
  );
}
