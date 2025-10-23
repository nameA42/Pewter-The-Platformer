export type BBox = { x: number; y: number; w: number; h: number };

export type TileDiffCell = {
  dx: number;
  dy: number;
  before: number;
  after: number;
};

export type PlacementOp = {
  id: string;
  ts: number;
  actor: "chat" | "user";
  selectionId?: string;
  bbox: BBox;
  diffs: TileDiffCell[];
  note?: string;
  layerName?: string;
};
