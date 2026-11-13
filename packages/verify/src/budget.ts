// The height budget at rest (px). A chat shows a tool in a bubble: 420. A story or reel frame is
// 9:16 and allows 600 (docs/CONTRACTS.md section 3). The surface comes from the meta.json next
// to the source file; anything else, or no meta.json, is a chat tool.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CHAT_BUDGET = 420;
export const STORY_BUDGET = 600;

export function budgetForSurface(surface: unknown): number {
  return surface === "story" || surface === "reel" ? STORY_BUDGET : CHAT_BUDGET;
}

/** The budget for the tool at `file`, from `surface` in the meta.json beside it. */
export function budgetForFile(file: string): number {
  const meta = join(dirname(file), "meta.json");
  if (!existsSync(meta)) return CHAT_BUDGET;
  try {
    return budgetForSurface((JSON.parse(readFileSync(meta, "utf8")) as { surface?: unknown }).surface);
  } catch {
    return CHAT_BUDGET;
  }
}
