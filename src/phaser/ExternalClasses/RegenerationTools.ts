import { SelectionBox } from "../selectionBox.ts";
import { WorldFacts } from "./worldFacts.ts";
import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { getChatResponse } from "../../languageModel/modelConnector.ts";
import type { EditorScene } from "../editorScene.ts";

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

export class RegenerationRequest {
  private selection: SelectionBox;
  private priority: number;
  private info: SelectionInfo;
  private contextCollaboration: string;

  constructor(
    selection: SelectionBox,
    priority: number,
    worldFacts: WorldFacts,
    contextCollaboration: string,
  ) {
    this.selection = selection;
    this.priority = priority;
    this.info = new SelectionInfo(
      worldFacts,
      selection.getPlacedTiles(),
      selection.getChatHistory(),
      selection.getZLevel(),
      selection.getStart().x,
      selection.getStart().y,
      selection.getEnd().x,
      selection.getEnd().y,
    );
    this.contextCollaboration = contextCollaboration;
  }

  getSelection(): SelectionBox {
    return this.selection;
  }

  getPriority(): number {
    return this.priority;
  }

  getInfo(): SelectionInfo {
    return this.info;
  }

  getContextCollaboration(): string {
    return this.contextCollaboration;
  }

  setSelection(selection: SelectionBox): void {
    this.selection = selection;
  }

  setPriority(priority: number): void {
    this.priority = priority;
  }

  setInfo(info: SelectionInfo): void {
    this.info = info;
  }

  setContextCollaboration(contextCollaboration: string): void {
    this.contextCollaboration = contextCollaboration;
  }
}

export class RegenerationQueue<SelectionBox = any> {
  private queue: RegenerationRequest[] = [];
  push(request: RegenerationRequest) {
    this.queue.push(request);
    this.sortQueue();
  }

  pop(): RegenerationRequest | undefined {
    return this.queue.shift();
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  override(layer: SelectionBox, newPriority: number, newInfo: any) {
    const reqIndex = this.queue.findIndex((r) => r.getSelection() === layer);
    if (reqIndex >= 0) {
      const req = this.queue[reqIndex];
      req.setPriority(newPriority);
      req.setInfo(newInfo);
      this.sortQueue();
    } else {
      console.warn(
        "[RegenerationQueue] Layer not found in queue for override.",
      );
    }
  }

  contains(layer: SelectionBox): boolean {
    return this.queue.some((r) => r.getSelection() === layer);
  }

  private sortQueue() {
    this.queue.sort((a, b) => a.getPriority() - b.getPriority());
  }
}

/* ---------------- Priority Computation ---------------- */

function computePriority(
  selection: SelectionBox,
  zMin: number,
  zMax: number,
  dependencies: Map<SelectionBox, number>,
  Z_WEIGHT = 0.4,
  DEP_WEIGHT = 0.6,
): number {
  const z = selection.getZLevel();
  const dep = dependencies.get(selection) ?? 0;
  const normZ = Math.max(1, zMax - zMin) / (z - zMin);
  return Z_WEIGHT * normZ + DEP_WEIGHT * (1 - dep); // Lower = higher priority
}

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

Here are some steps with an example: 
 • Clear selection fully (only clear the selection please. Do not clear outside the selection). 
 • For each prompt, do the actions mentioned in the prompt
    • Ex: Human Prompt - Place a platform of length _ and height _ at _ and _ coordinates.
        • For that prompt, place the platform using any or one of the tools provided (placeSingleTile, placeGridofTiles, placeEnemy, clearTile) with that length and with that height at those coordinates. 
        • If the coordinates are not specified, assume that it is random. Simply assume. 

Read through each prompt, and complile a list of tool calls that need to be processed in the order they might have been called before regeneration. Based on each prompt, use a similar thought process as provided in the example to decide on a series of tool calls to them be called. 
Ex: 
 • Human Prompt - Place a platform of length 5 and height 1 at a random location. 
 • Human Prompt - Place coins on top of that platform just placed. 
 • Human Prompt - Place an enemy on top of the platform. 
 • Human Prompt - Place an additional platform at a different location closer to the right of the selection. 

 In this example, you should first create a tool call to place the initial platform of length 5 and height 1 at a random location. Then, place coins on top of that platform using an additional tool call. Next, place an enemy via another tool call. Lastly, create another tool call for the platform to be placed at the right of the platform. 
 So, your list of tool calls should look like this: 
  • Tool Call - placeGridofTiles with specific platform information and random location.
  • Tool Call - placeGridofTiles with specific coin locations along the very top of the platform.
  • Tool Call - placeEnemy with a default Slime information and a random location on the top of the platform.
  • Tool Call - placeGridofTiles with right-side focused coordinates for a platform of any length and any height as it was not specified. 

NEVER PLACE OBJECTS WITHIN ANOTHER SELECTION. THIS IS A RULE YOU SHOULD NEVER BREAK. 

Use this information to guide your regeneration. Simply do the regeneration by doing each prompt.
  `;
}

/* ---------------- Dependency Graph Construction ---------------- */

export interface DependencyGraph {
  deps: Map<SelectionBox, Set<SelectionBox>>;
  revDeps: Map<SelectionBox, Set<SelectionBox>>;
}

function buildDependencyMap(allSelections: SelectionBox[]): DependencyGraph {
  const deps = new Map<SelectionBox, Set<SelectionBox>>();
  const revDeps = new Map<SelectionBox, Set<SelectionBox>>();

  // Initialize empty sets
  for (const sel of allSelections) {
    deps.set(sel, new Set());
    revDeps.set(sel, new Set());
  }

  // Basic dependency rule:
  // A depends on B if they overlap/touch and A.z >= B.z
  for (const a of allSelections) {
    for (const b of allSelections) {
      if (a === b) continue;

      const aStart = a.getStart();
      const aEnd = a.getEnd();
      const bStart = b.getStart();
      const bEnd = b.getEnd();

      const overlap =
        aStart.x <= bEnd.x &&
        aEnd.x >= bStart.x &&
        aStart.y <= bEnd.y &&
        aEnd.y >= bStart.y;

      if (overlap && a.getZLevel() >= b.getZLevel()) {
        deps.get(a)!.add(b);
        revDeps.get(b)!.add(a);
      }
    }
  }

  return { deps, revDeps };
}

function topologicalSort<T>(deps: Map<T, Set<T>>): T[] {
  const visited = new Set<T>();
  const temp = new Set<T>();
  const result: T[] = [];

  function visit(node: T) {
    if (temp.has(node)) {
      console.warn("[DependencyMap] Cycle detected involving", node);
      return;
    }
    if (visited.has(node)) return;
    temp.add(node);

    for (const dep of deps.get(node) || []) {
      visit(dep);
    }

    temp.delete(node);
    visited.add(node);
    result.push(node);
  }

  for (const node of deps.keys()) {
    visit(node);
  }

  return result.reverse(); // topological order
}

/* ---------------- Main Regeneration Function ---------------- */

export async function regenerate(
  allSelections: SelectionBox[],
  _dependencies: Map<SelectionBox, number>, // old param, not needed anymore
  worldFacts: WorldFacts,
  scene: EditorScene,
) {
  // Step 0: Build dependency map
  const { deps } = buildDependencyMap(allSelections);
  const topoOrder = topologicalSort(deps);
  console.log(
    "[DependencyMap] Topological order:",
    topoOrder.map((sel) => sel.getZLevel()),
  );

  const queue = new RegenerationQueue();
  let zMin = Infinity;
  let zMax = -Infinity;

  // Step 1: Compute z range and enqueue following topo order
  for (const selection of topoOrder) {
    const z = selection.getZLevel();
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);

    // Use dependency count as “depth”
    const depCount = deps.get(selection)?.size ?? 0;
    const fakeDepMap = new Map<SelectionBox, number>([[selection, depCount]]);
    const priority = computePriority(selection, zMin, zMax, fakeDepMap);

    const contextCollaboration = selection.getCollaborativeContextForChat();

    const request = new RegenerationRequest(
      selection,
      priority,
      worldFacts,
      contextCollaboration,
    );
    queue.push(request);
  }

  // Step 2: Process the queue (unchanged from your code)
  while (!queue.isEmpty()) {
    const req = queue.pop();
    if (!req) continue;
    const selection = req.getSelection();
    selection.setActive(true);
    const info = req.getInfo();
    const bounds = {
      x: info.selectionStartX,
      y: info.selectionStartY,
      width: info.selectionEndX - info.selectionStartX,
      height: info.selectionEndY - info.selectionStartY,
    };

    const contextCollaboration = req.getContextCollaboration();

    const snapshot = captureSnapshot(scene, bounds);
    let neighbors = [];
    for (let i = 0; i < selection.getNeighbors().length; i++) {
      let neighbor = selection.getNeighbors()[i];
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

    console.log(guidePrompt);

    const chatMessageHistory: BaseMessage[] = [];
    chatMessageHistory.push(
      new SystemMessage({ content: String(guidePrompt) }),
    );
    for (let i = 1; i < selection.getChatHistory().length; i++) {
      if (selection.getChatHistory()[i].getType() === "human") {
        chatMessageHistory.push(selection.getChatHistory()[i]);
      }
    }

    const llmResult = await getChatResponse(chatMessageHistory);
    console.log(`[Regeneration] Completed selection`);
    console.log("[LLM Output Text]:", llmResult.text.join("\n"));
    console.log("[Tool Calls]:", llmResult.toolCalls);
    selection.setActive(false);
  }

  console.log("[Regeneration] Scene regeneration complete.");
}

// export async function regenerate(
//   allSelections: SelectionBox[],
//   dependencies: Map<SelectionBox, number>,
//   worldFacts: WorldFacts,
//   scene: EditorScene,
// ) {
//   const queue = new RegenerationQueue();
//   let zMin = Infinity;
//   let zMax = -Infinity;

//   // Step 1: Compute z range & enqueue regeneration requests
//   for (const selection of allSelections) {
//     const z = selection.getZLevel();
//     zMin = Math.min(zMin, z);
//     zMax = Math.max(zMax, z);

//     const priority = computePriority(selection, zMin, zMax, dependencies);
//     const request = new RegenerationRequest(selection, priority, worldFacts);
//     console.log(selection.getStart(), selection.getEnd());
//     queue.push(request);
//   }

//   // Step 2: Process the priority queue
//   while (!queue.isEmpty()) {
//     const req = queue.pop();
//     if (!req) continue;

//     const selection = req.getSelection();
//     const info = req.getInfo();
//     let bounds = {x: info.selectionStartX, y: info.selectionStartY, width: (info.selectionEndX - info.selectionStartX), height: (info.selectionEndY - info.selectionStartY) }

//     const snapshot = captureSnapshot(scene, bounds)

//     // Step 2a: Create the guide prompt for the selection
//     const guidePrompt = createGuidePrompt(info, snapshot);
//     console.log(guidePrompt);

//     // Step 2b: Prepare chat history for LangChain
//     const chatMessageHistory: BaseMessage[] = [];

//     // Inject your system prompt properly
//     //await initializeLLM(chatMessageHistory); // assumes this pushes a SystemMessage

//     // Add conversation history
//     chatMessageHistory.push(
//       new SystemMessage({ content: String(guidePrompt) }),
//     );
//     for (let i = 1; i < selection.getChatHistory().length; i++) {
//       if (selection.getChatHistory()[i].getType() == "human") {
//         chatMessageHistory.push(selection.getChatHistory()[i]);
//       }
//     }

//     // Debug output to verify structure
//     console.log(
//       "chatMessageHistory before LLM call:",
//       chatMessageHistory.map((msg) => ({
//         role: msg._getType?.() ?? msg.constructor.name,
//         content: msg.content,
//       })),
//     );

//     // Step 2c: Call LLM with tools
//     const llmResult = await getChatResponse(chatMessageHistory);

//     console.log(`[Regeneration] Completed selection`);
//     console.log("[LLM Output Text]:", llmResult.text.join("\n"));
//     console.log("[Tool Calls]:", llmResult.toolCalls);
//     console.log("[Errors]:", llmResult.errors);
//   }

//   console.log("[Regeneration] Scene regeneration complete.");
// }
