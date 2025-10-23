export type BoxIntent = "current_contents" | "placement_history" | "none";

export function detectBoxIntent(utterance: string): BoxIntent {
  const s = (utterance || "").toLowerCase();

  // “what’s in the box now / show contents / visible / topmost”
  const wantsNow =
    /(what('?| i)?s|show|tell me|list|display).*(in(side)?|inside|content|contents|in the box)/.test(s) ||
    /\b(current|currently|right now|visible|topmost|what is there now)\b/.test(s);

  if (wantsNow) return "current_contents";

  // “what did this box place / history / previous placements / audit”
  const wantsHistory =
    /(what|which).*(did|has).*(box|selection).*(place|put|write)/.test(s) ||
    /\b(history|previous placements|placed before|audit|undo scope|what i placed)\b/.test(s);

  if (wantsHistory) return "placement_history";

  return "none";
}
