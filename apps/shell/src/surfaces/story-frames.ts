import type { Story } from "./data";

/**
 * More than one picture for a few people, so their bar has two or three segments. The extra frames
 * are photos; the first frame is always the story's own picture.
 * Content in data.ts is untouched: this only says how many frames a story has.
 */
const EXTRA: Record<string, string[]> = {
  "s-maya": ["gen-study-aerial", "gen-campus-path"],
  "s-dev": ["gen-campus-trees"],
  "s-jonah": ["story-rooftop-dusk"],
};

/** The pictures of a story, in order. A story with no entry has one. */
export const framesOf = (s: Story): (string | undefined)[] => [s.asset, ...(EXTRA[s.id] ?? [])];
