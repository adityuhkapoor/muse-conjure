// Taste as mechanical rules. Each owner complaint is a lint whose message tells the builder how to
// fix it, so a failing check is also the remediation. They run on a tool that already passed the
// gate, on its initial state and its headless pictures. (The gate in packages/verify is owned by
// another folder; these live here until they move into its strict profile.)
//
//   hollow-state       fewer than three members appear in the state the tool arrives with
//   form-not-picture   the drawn picture covers less than 40 percent of the card at rest
//   stripped-voice     fewer than two friends' reasons or quotes are visible at rest

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Shot } from "./look/shoot.ts";
import type { Member } from "./types.ts";

export type TasteFinding = { rule: "hollow-state" | "form-not-picture" | "stripped-voice"; message: string };

const TMP = join(import.meta.dir, "..", "eval", "out", "tmp-lint");

/** Members whose id appears in the state `init` returns for this member list. */
export async function seededMembers(source: string, members: Member[]): Promise<number> {
  mkdirSync(TMP, { recursive: true });
  const f = join(TMP, `t${Math.random().toString(36).slice(2, 10)}.tsx`);
  writeFileSync(f, source);
  try {
    const mod = (await import(f)) as { default: { init: (ctx: { room: string; members: Member[] }) => unknown } };
    const s = JSON.stringify(mod.default.init({ room: "lint", members }));
    return members.filter((m) => s.includes(`"${m.id}"`) || s.includes(m.name)).length;
  } catch {
    return -1;
  } finally {
    rmSync(f, { force: true });
  }
}

/** Share of the card's height covered by drawn pictures (svg, canvas, img at least 120 px wide). */
export function pictureShare(shot: Shot): number {
  const spans = shot.seen.filter((s) => s.role === "picture" && s.w >= 120).map((s) => [s.y, s.y + s.h] as const).sort((a, b) => a[0] - b[0]);
  let covered = 0, end = -1;
  for (const [a, b] of spans) {
    if (b <= end) continue;
    covered += b - Math.max(a, end);
    end = b;
  }
  return shot.height ? covered / shot.height : 0;
}

/** Visible lines that carry a friend's own words: a quote, or a member's name in a sentence of four words or more. */
export function voiceLines(shot: Shot, members: Member[]): number {
  const names = members.map((m) => m.name.toLowerCase());
  return shot.seen.filter((s) => s.role === "text" && (/["“”‘’]/.test(s.text) || (s.text.split(/\s+/).length >= 4 && names.some((n) => s.text.toLowerCase().includes(n))))).length;
}

export async function tasteLint(source: string, members: Member[], rest: Shot | undefined): Promise<TasteFinding[]> {
  const out: TasteFinding[] = [];
  const need = Math.min(3, members.length);
  const seeded = await seededMembers(source, members);
  if (seeded >= 0 && seeded < need)
    out.push({ rule: "hollow-state", message: `hollow state: the tool arrives with ${seeded} of the chat's members in it. Seed at least ${need} members' actions from the brief in init (find each friend by name in ctx.members), with what they did and why.` });
  if (rest) {
    const share = pictureShare(rest);
    if (share < 0.4)
      out.push({ rule: "form-not-picture", message: `form, not a picture: drawn pictures cover ${Math.round(share * 100)} percent of the card at rest. Make the picture (inline SVG, Canvas or the art kit) the largest element, at least 40 percent of the height, and put people and the action inside it rather than in rows and buttons under it.` });
    const voice = voiceLines(rest, members);
    if (voice < 2)
      out.push({ rule: "stripped-voice", message: `stripped voice: ${voice} line${voice === 1 ? "" : "s"} at rest carry a friend's own words. Show at least two friends' reasons or quotes from the brief on the card (a note on the picture, a line under a face), in their words.` });
  }
  return out;
}
