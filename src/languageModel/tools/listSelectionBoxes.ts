import { tool } from "@langchain/core/tools";
import type { EditorScene } from "../../phaser/editorScene.ts";

export class ListSelectionBoxes {
  sceneGetter: () => EditorScene;

  constructor(sceneGetter: () => EditorScene) {
    this.sceneGetter = sceneGetter;
  }

  toolCall = tool(
    async () => {
      const scene = this.sceneGetter();
      if (!scene) return "Tool Failed: no scene reference.";
      const boxes = (scene as any).selectionBoxes ?? [];
      const out = boxes.map((b: any) => ({ id: b.getId?.(), bounds: b.getBounds?.(), z: b.getZLevel?.() }));
      return JSON.stringify(out);
    },
    {
      name: "listSelectionBoxes",
      description: "Return list of active selection boxes with their id and bounds.",
    },
  );
}
