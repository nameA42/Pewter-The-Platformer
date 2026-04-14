import { SelectionBox } from "../selectionBox.ts";
import { WorldFacts } from "./worldFacts.ts";
import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { getChatResponse } from "../../languageModel/modelConnector.ts";
import type { EditorScene } from "../editorScene.ts";
import { scheduleRegenerationSteps } from "../regeneration/RegenScheduler.ts";

class SelectionInfo {
  worldFacts: WorldFacts;
  placedTiles: { tileIndex: number; x: number; y: number; layerName: string }[];
  convoHistory: any[];
  zLevel: number;
  selectionStartX: number;
  selectionStartY: number;
  selectionEndX: number;
  selectionEndY: number;

  constructor(
    worldFacts: WorldFacts,
    placedTiles: {
      tileIndex: number;
      x: number;
      y: number;
      layerName: string;
    }[],
    convoHistory: any[],
    zLevel: number,
    selectionStartX: number,
    selectionStartY: number,
    selectionEndX: number,
    selectionEndY: number,
  ) {
    this.worldFacts = worldFacts;
    this.placedTiles = placedTiles;
    this.convoHistory = convoHistory;
    this.zLevel = zLevel;
    this.selectionStartX = selectionStartX;
    this.selectionStartY = selectionStartY;
    this.selectionEndX = selectionEndX;
    this.selectionEndY = selectionEndY;
  }
}

export interface MapSnapshot {
  timestamp: number;
  worldFacts: { structures: any[]; collectables: any[]; enemies: any[] };
  tileData: {
    layer: string;
    tiles: { x: number; y: number; index: number }[];
  }[];
  bounds: { x: number; y: number; width: number; height: number };
}

/* ---------------- Snapshot Capture ---------------- */

function captureSnapshot(
  scene: EditorScene,
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
): MapSnapshot {
  const mapBounds = bounds || {
    x: 0,
    y: 0,
    width: scene.map.width,
    height: scene.map.height,
  };

  console.log(`Capturing snapshot for bounds:`, mapBounds);

  // Capture WorldFacts
  const structures = scene.worldFacts.getFact("Structure");
  const collectables = scene.worldFacts.getFact("Collectable");
  const enemies = scene.worldFacts.getFact("Enemy");

  // Capture raw tile data from layers
  const tileData: {
    layer: string;
    tiles: { x: number; y: number; index: number }[];
  }[] = [];

  // Capture Ground Layer
  const groundLayer = scene.map.getLayer("Ground_Layer")?.tilemapLayer;
  if (groundLayer) {
    const tiles: { x: number; y: number; index: number }[] = [];
    for (let x = mapBounds.x; x < mapBounds.x + mapBounds.width; x++) {
      for (let y = mapBounds.y; y < mapBounds.y + mapBounds.height; y++) {
        const tile = groundLayer.getTileAt(x, y);
        if (tile && tile.index !== -1) {
          tiles.push({ x, y, index: tile.index });
        }
      }
    }
    tileData.push({ layer: "Ground_Layer", tiles });
  }

  // Capture Collectables Layer
  const collectablesLayer =
    scene.map.getLayer("Collectables_Layer")?.tilemapLayer;
  if (collectablesLayer) {
    const tiles: { x: number; y: number; index: number }[] = [];
    for (let x = mapBounds.x; x < mapBounds.x + mapBounds.width; x++) {
      for (let y = mapBounds.y; y < mapBounds.y + mapBounds.height; y++) {
        const tile = collectablesLayer.getTileAt(x, y);
        if (tile && tile.index !== -1) {
          tiles.push({ x, y, index: tile.index });
        }
      }
    }
    tileData.push({ layer: "Collectables_Layer", tiles });
  }

  return {
    timestamp: Date.now(),
    worldFacts: { structures, collectables, enemies },
    tileData,
    bounds: mapBounds,
  };
}

/* ---------------- Prompt Construction ---------------- */

function createGuidePrompt(
  info: SelectionInfo,
  snapshot: MapSnapshot,
  contextCollaboration: string,
  neighbors: number[][],
): string {
  const {
    placedTiles,
    convoHistory,
    selectionStartX,
    selectionStartY,
    selectionEndX,
    selectionEndY,
  } = info;

  let summary = "";
  for (let i = 0; i < convoHistory.length; i++) {
    if (convoHistory[i].getType() == "human") {
      summary += "Human Prompt - " + convoHistory[i].content + "\n\n";
    }
  }

  // Structures summary
  let structureSummary = "";
  if (snapshot.worldFacts.structures.length > 0) {
    structureSummary += `Structures in this area:\n`;
    snapshot.worldFacts.structures.forEach((fact) => {
      structureSummary += `- ${fact.toString()}\n`;
    });
    structureSummary += `\n`;
  }

  let collectablesSummary = "";
  if (snapshot.worldFacts.structures.length > 0) {
    collectablesSummary += `Collectables in this area:\n`;
    snapshot.worldFacts.collectables.forEach((fact) => {
      collectablesSummary += `- ${fact.toString()}\n`;
    });
    collectablesSummary += `\n`;
  }

  let enemiesSummary = "";
  if (snapshot.worldFacts.structures.length > 0) {
    enemiesSummary += `Enemies in this area:\n`;
    snapshot.worldFacts.enemies.forEach((fact) => {
      enemiesSummary += `- ${fact.toString()}\n`;
    });
    enemiesSummary += `\n`;
  }

  let neighborsInfo = "";
  for (let i = 0; i < neighbors.length; i++) {
    let neighbor = neighbors[i];
    neighborsInfo += i + "th neighbor: \n";
    neighborsInfo += "  Start: (" + neighbor[0] + ", " + neighbor[1] + ")\n";
    neighborsInfo += "  End: (" + neighbor[2] + ", " + neighbor[3] + ")\n";
  }

  return `
You are an intelligent world builder regenerating a visual layer in a Phaser scene.

Your job requires you to use multiple different tools at once so use each tool multiple times and use all the tools if necessary to process each request/prompt.

### Local Context
World facts:  
${structureSummary}
${enemiesSummary}
${collectablesSummary}

### Context from Neighbors
${contextCollaboration}

### Location of Neighbors
${neighborsInfo}

Placed tiles: ${JSON.stringify(placedTiles, null, 2)}

### Full history of recent discussion
${summary}

For each of the prompt within the full history of recent discussion, just redo what is mentioned within the prompt. Do not ask questions. Make assumptions and just do it. Do not question anything and just regenerate for each of the prompts.

You are in an asynchornous mode with the user. You cannot ask any clarification questions and you must just complete the tasks. You have full control over what you need to do. Just do it. Never ask any clarification questions and do not tell the user that you will do something as this is not the point of regeneration. Your goal is to just use tool calls and present the changes for the regeneration. 

Send a message stating "Completed Regeneration" as your final message. 

Always work only within the selection box. Never edit anything outside of the selection box (Start Coordinates of (${selectionStartX}, ${selectionStartY}) and End Coordinates of (${selectionEndX}, ${selectionEndY})). Your knowledge should only be limited to the selection box. You will explode otherwise. 

You are only allowed to touch the Ground_Layer and the Collectables_Layer. 

Before processing any requests, always clear tiles. 

### IMPORTANT: Tool Selection Rules
- **Enemies (Slime, UltraSlime)**: MUST use the 'placeEnemy' tool. NEVER use placeSingleTile or placeGridofTiles for enemies.
- **Collectables (Coins - tile index 2, Fruits - tile index 3)**: Use placeSingleTile or placeGridofTiles with layerName='Collectables_Layer'.
- **Structures (platforms, blocks)**: Use placeSingleTile or placeGridofTiles with layerName='Ground_Layer'.

Here are some steps with an example: 
 • Clear selection fully (only clear the selection please. Do not clear outside the selection). 
 • For each prompt, do the actions mentioned in the prompt
    • Ex: Human Prompt - Place a platform of length _ and height _ at _ and _ coordinates.
        • For that prompt, place the platform using placeSingleTile or placeGridofTiles with layerName='Ground_Layer' with that length and with that height at those coordinates. 
        • If the coordinates are not specified, assume that it is random. Simply assume. 

Read through each prompt, and complile a list of tool calls that need to be processed in the order they might have been called before regeneration. Based on each prompt, use a similar thought process as provided in the example to decide on a series of tool calls to them be called. 
Ex: 
 • Human Prompt - Place a platform of length 5 and height 1 at a random location. 
 • Human Prompt - Place coins on top of that platform just placed. 
 • Human Prompt - Place an enemy on top of the platform. 
 • Human Prompt - Place an additional platform at a different location closer to the right of the selection. 

 In this example, you should first create a tool call to place the initial platform of length 5 and height 1 at a random location. Then, place coins on top of that platform using an additional tool call. Next, place an enemy via another tool call. Lastly, create another tool call for the platform to be placed at the right of the platform. 
 So, your list of tool calls should look like this: 
  • Tool Call - placeGridofTiles with tileIndex for platform (e.g., 5 for Dirt Block), layerName='Ground_Layer', and random location.
  • Tool Call - placeGridofTiles with tileIndex=2 (Coin), layerName='Collectables_Layer', along the very top of the platform.
  • Tool Call - placeEnemy with enemyType='Slime' and a random location on the top of the platform.
  • Tool Call - placeGridofTiles with tileIndex for platform, layerName='Ground_Layer', right-side focused coordinates for a platform of any length and any height as it was not specified. 

NEVER PLACE OBJECTS WITHIN ANOTHER SELECTION. THIS IS A RULE YOU SHOULD NEVER BREAK. 

Use this information to guide your regeneration. Simply do the regeneration by doing each prompt.
  `;
}

/* ---------------- Main Regeneration Function ---------------- */

export async function regenerate(
  allSelections: SelectionBox[],
  _dependencies: Map<SelectionBox, number>, // old param, not needed anymore
  worldFacts: WorldFacts,
  scene: EditorScene,
) {
  // Queue all selections into a priority/dependency schedule.
  // Priority: higher z first (within ready set)
  // Dependency: if two selections overlap and have different z, lower-z MUST run before higher-z.
  const steps = scheduleRegenerationSteps(scene, allSelections);
  console.log(
    "[RegenerationScheduler] Execution order (z):",
    steps.map((s) => s.job.z),
  );

  for (const step of steps) {
    const selection = step.job.selection;
    selection.setActive(true);

    // Expose protected overlap rectangles to tools during this regeneration step.
    // Tools consult OverlapChecker.checkRegenProtection(scene, x, y).
    (scene as any).regenProtectedRects = step.protectedRects.map((r) => ({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
    }));

    // Recompute info at time-of-execution so context passes smoothly between steps
    // (previous steps may have placed tiles/enemies).
    const contextCollaboration =
      selection.getCollaborativeContextForChat() +
      (step.overlapContextText
        ? `\n\n=== Overlap Context ===\n${step.overlapContextText}`
        : "");

    const info = new SelectionInfo(
      worldFacts,
      selection.getPlacedTiles(),
      selection.getChatHistory(),
      selection.getZLevel(),
      selection.getStart().x,
      selection.getStart().y,
      selection.getEnd().x,
      selection.getEnd().y,
    );

    const bounds = {
      x: Math.min(info.selectionStartX, info.selectionEndX),
      y: Math.min(info.selectionStartY, info.selectionEndY),
      width: Math.abs(info.selectionEndX - info.selectionStartX),
      height: Math.abs(info.selectionEndY - info.selectionStartY),
    };

    const snapshot = captureSnapshot(scene, bounds);

    const neighbors: number[][] = [];
    for (const neighbor of selection.getNeighbors()) {
      neighbors.push([
        neighbor.getStart().x,
        neighbor.getStart().y,
        neighbor.getEnd().x,
        neighbor.getEnd().y,
      ]);
    }

    const guidePrompt = createGuidePrompt(
      info,
      snapshot,
      contextCollaboration,
      neighbors,
    );

    const chatMessageHistory: BaseMessage[] = [];
    chatMessageHistory.push(
      new SystemMessage({ content: String(guidePrompt) }),
    );

    // HARD RESET behavior: only replay human prompts.
    // (We intentionally do not include any previous assistant/tool messages.)
    for (const msg of selection.getChatHistory()) {
      try {
        if (msg?.getType?.() === "human") chatMessageHistory.push(msg);
      } catch (e) {
        // ignore
      }
    }

    const llmResult = await getChatResponse(chatMessageHistory);
    console.log(
      `[Regeneration] Completed selection z=${selection.getZLevel()}`,
    );
    console.log("[LLM Output Text]:", llmResult.text.join("\n"));
    console.log("[Tool Calls]:", llmResult.toolCalls);

    // Clear regen protection so normal editing is unaffected.
    (scene as any).regenProtectedRects = [];
    selection.setActive(false);
  }

  console.log("[Regeneration] Scene regeneration complete.");
}
