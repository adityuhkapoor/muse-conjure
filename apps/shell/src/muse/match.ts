// Matching a typed ask to a scenario: surface first, then a small, transparent word match over
// the scenario's own phrases (the same token rules as library/cache/lookup.ts: lowercase, stop
// words out, a light stem). A suggestion the reader is showing right now counts a little extra.
// Confidence is the share of the best phrase's words the ask covers; below THRESHOLD the ask goes
// to the factory with the page's context.

import { PACK } from "./pack";
import type { CatSurface, Scenario } from "./types";

export const THRESHOLD = 0.6;

const STOP = new Set(
  "the a an to for of and or is it we us you i me my our on in at be do can this that with so lol muse pls please make just like ok okay yeah u im its all are was were have has had not but if then what who when where how why there here they them will would could should about up out get got go want wanna need one more some any too very really also tn tbh rn hey thing stuff something someone guys everyone sure thanks let lets whos whats wheres hows".split(" "),
);

const stem = (w: string) => (w.length > 5 && w.endsWith("ing") ? w.slice(0, -3) : w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

export type Match = { scenario: Scenario; confidence: number; why: string };

/** Ranked scenarios for an ask on this surface. `boost`: scenarios the reader is offering now. */
export function rank(ask: string, surface: CatSurface, boost: string[] = []): Match[] {
  const words = new Set(tokens(ask));
  if (!words.size) return [];
  const out: Match[] = [];
  for (const s of PACK) {
    if (s.surface !== surface) continue;
    let best = 0;
    let bestPhrase = "";
    for (const phrase of s.asks) {
      const p = [...new Set(tokens(phrase))];
      if (!p.length) continue;
      const hit = p.filter((w) => words.has(w)).length;
      // Cover the phrase, and do not drown it in unrelated words.
      const score = (hit / p.length) * Math.min(1, (hit + 1) / Math.max(1, words.size * 0.6));
      if (score > best) (best = score), (bestPhrase = phrase);
    }
    if (!best) continue;
    const boosted = boost.includes(s.id) ? Math.min(1, best + 0.15) : best;
    out.push({ scenario: s, confidence: Math.round(boosted * 100) / 100, why: `"${bestPhrase}"${boosted > best ? " + offered here" : ""}` });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** The confident match, if any. */
export function match(ask: string, surface: CatSurface, boost: string[] = []): Match | null {
  const [top] = rank(ask, surface, boost);
  return top && top.confidence >= THRESHOLD ? top : null;
}
