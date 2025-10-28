import { SelectionBox } from "../selectionBox.ts";
import { WorldFacts } from "./worldFacts.ts";
import {
  BaseMessage,
  SystemMessage,
  HumanMessage,
} from "@langchain/core/messages";
import {
  getChatResponse,
  initializeLLM,
} from "../../languageModel/modelConnector.ts";

class SelectionInfo {
  worldFacts: WorldFacts;
  placedTiles: { tileIndex: number; x: number; y: number; layerName: string }[];
  convoHistory: any[];
  zLevel: number;

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
  ) {
    this.worldFacts = worldFacts;
    this.placedTiles = placedTiles;
    this.convoHistory = convoHistory;
    this.zLevel = zLevel;
  }
}

export class RegenerationRequest {
  private selection: SelectionBox;
  private priority: number;
  private info: SelectionInfo;

  constructor(
    selection: SelectionBox,
    priority: number,
    worldFacts: WorldFacts,
  ) {
    this.selection = selection;
    this.priority = priority;
    this.info = new SelectionInfo(
      worldFacts,
      selection.getPlacedTiles(),
      selection.getChatHistory(),
      selection.getZLevel(),
    );
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

  setSelection(selection: SelectionBox): void {
    this.selection = selection;
  }

  setPriority(priority: number): void {
    this.priority = priority;
  }

  setInfo(info: SelectionInfo): void {
    this.info = info;
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
  const normZ = (z - zMin) / Math.max(1, zMax - zMin);
  return Z_WEIGHT * normZ + DEP_WEIGHT * (1 - dep); // Lower = higher priority
}

/* ---------------- Prompt Construction ---------------- */

function createGuidePrompt(info: any): string {
  const { worldFacts, placedTiles, convoHistory } = info;
  console.log(worldFacts.toString());

  let summary = "";
  for (let i = 0; i < convoHistory.length; i++) {
    if (convoHistory[i].getType() == "human") {
      summary += convoHistory[i].content + "\n\n";
    }
  }

  return `
You are an intelligent world builder regenerating a visual layer in a Phaser scene.

Your job requires you to use multiple different tools at once so use each tool multiple times and use all the tools if necessary to process each request/prompt.

### Local Context
World facts: ${worldFacts.toString()}
Placed tiles: ${JSON.stringify(placedTiles, null, 2)}

### Full history of recent discussion
${summary}

For each of the prompt within the full history of recent discussion, just redo what is mentioned within the prompt. Do not ask questions. Make assumptions and just do it. Do not question anything and just regenerate for each of the prompts.

You are in an asynchornous mode with the user. You cannot ask any clarification questions and you must just complete the tasks. You have full control over what you need to do. Just do it. Never ask any clarification questions and do not tell the user that you will do something as this is not the point of regeneration. Your goal is to just use tool calls and present the changes for the regeneration. 

Before processing any requests, always clear tiles. 

Here are some steps with an example: 
 • Clear selection fully (only clear the selection please. Do not clear outside the selection)
 • For each prompt, do the actions mentioned in the prompt
    • Ex: Human Prompt - Place a platform of length _ and height _ at _ and _ coordinates.
        • For that prompt, place the platform using any or one of the tools provided (placeSingleTile, placeGridofTiles, placeEnemy, clearTile) with that length and with that height at those coordinates. 
        • If the coordinates are not specified, assume that it is random. Simply assume. 

Use this information to guide your regeneration. Simply do the regeneration by doing each prompt.
  `;
}

/* ---------------- Main Regeneration Function ---------------- */

export async function regenerate(
  allSelections: SelectionBox[],
  dependencies: Map<SelectionBox, number>,
) {
  const queue = new RegenerationQueue();
  let zMin = Infinity;
  let zMax = -Infinity;

  // Step 1: Compute z range & enqueue regeneration requests
  for (const selection of allSelections) {
    const z = selection.getZLevel();
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);

    const priority = computePriority(selection, zMin, zMax, dependencies);
    const request = new RegenerationRequest(
      selection,
      priority,
      selection.worldFacts,
    );
    queue.push(request);
  }

  // Step 2: Process the priority queue
  while (!queue.isEmpty()) {
    const req = queue.pop();
    if (!req) continue;

    const selection = req.getSelection();
    const info = req.getInfo();

    // Step 2a: Create the guide prompt for the selection
    const guidePrompt = createGuidePrompt(info);
    console.log(guidePrompt);

    // Step 2b: Prepare chat history for LangChain
    const chatMessageHistory: BaseMessage[] = [];

    // Inject your system prompt properly
    //await initializeLLM(chatMessageHistory); // assumes this pushes a SystemMessage

    // Add conversation history
    chatMessageHistory.push(
      new SystemMessage({ content: String(guidePrompt) }),
    );
    for (let i = 1; i < selection.getChatHistory().length; i++) {
      if (selection.getChatHistory()[i].getType() == "human") {
        chatMessageHistory.push(selection.getChatHistory()[i]);
      }
    }

    // Debug output to verify structure
    console.log(
      "chatMessageHistory before LLM call:",
      chatMessageHistory.map((msg) => ({
        role: msg._getType?.() ?? msg.constructor.name,
        content: msg.content,
      })),
    );

    // Step 2c: Call LLM with tools
    const llmResult = await getChatResponse(chatMessageHistory);

    console.log(`[Regeneration] Completed selection`);
    console.log("[LLM Output Text]:", llmResult.text.join("\n"));
    console.log("[Tool Calls]:", llmResult.toolCalls);
    console.log("[Errors]:", llmResult.errors);
  }

  console.log("[Regeneration] Scene regeneration complete.");
}
