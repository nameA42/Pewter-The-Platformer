////////////////////////////////////////////////////////////////////////////////
//////////////////////////////  Tile Definitions  //////////////////////////////
/////////////////////  Modify this to tell Pewter stuff!   /////////////////////
////////////////////////////////////////////////////////////////////////////////

export interface Blocks {
  name: string;
  index: number;
  layer: "collectable" | "ground" | "other";
}

export const tileDictionary: Blocks[] = [
  { name: "Empty Tile", index: 1, layer: "other" },
  { name: "coin", index: 2, layer: "collectable" },
  { name: "fruit", index: 4, layer: "collectable" },
  { name: "platform block", index: 5, layer: "ground" },
  { name: "dirt block", index: 6, layer: "ground" },
  { name: "item (question mark) block", index: 7, layer: "ground" },
];
