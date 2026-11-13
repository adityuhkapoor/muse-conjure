// Choosing what a friend does with a tool. Candidates come from the tool's own `arbitrary`
// (a plausible next action for this user); each is folded on the current state to see what it
// would really do, then filtered to what a sensible person would do now and scored by person.
//
// Out: no-ops; resets, removals and undos (a result that equals a recent state); changing your
// own answer or vote (your mentions in the state do not grow); taking from someone else; acting
// for someone else; random amounts of money. Held back: finishing moves (a spin, closing a vote)
// until someone has added something or a while has passed. Preferred: moves toward done.

import type { Persona } from "./personas.ts";
import type { Rand } from "./rand.ts";
import type { FoldJson, ToolRealm } from "./realm.ts";

export type ToolMemory = {
  /** recent confirmed app states (the `s` part, JSON), newest last */
  recent: string[];
  /** actions this person already took here: t and whether it grew their part */
  mine: { t: string; at: number }[];
  /** app actions by anyone after the tool appeared, not counting this person */
  others: number;
  /** ms since the tool appeared */
  age: number;
  /** finishing moves wait this long when nobody has added anything */
  holdMs: number;
  /** last time anyone made a seed-driven move (a spin) */
  lastRandomAt: number;
  now: number;
  head: number;
  members: string[];
  /** the tool is about food (title or summary) */
  food: boolean;
};

export type Verb = "spin" | "add" | "in" | "maybe" | "vote" | "take" | "paid" | null;
export type Choice = { action: unknown; score: number; verb: Verb; finishes: boolean; idea?: string; why: string };

const REJECT_T = /^(reset|undo|clear|restart|remove|delete|unclaim|leave|kick|unvote|cancel|rename|edit|title|total|drop|out)$/i;
const FINISH_T = /^(close|decide|lock|finish|end|done|untangle|settle|reveal|draw|shuffle)$/i;
const VETOISH = /^(veto|strike|no|block|skip)$/i;
const POSITIVE = /^(going|yes|in|y|up|like|love)$/i;
const NEGATIVE = /^(no|out|nope|pass|skip|decline|cant|can't|down)$/i;
const HEDGE = /^(maybe|unsure|later|idk|tentative)$/i;
const TEXT_KEYS = ["label", "text", "name", "item", "option", "title"];
const MONEY_KEYS = /^(cents|amount|total|price|cost|owed)$/i;
const MAX_PER_PERSON = 3;

export const DONE_TEXT = /\b(spun the wheel|picked|winner|won|locked|everyone is square|all set|settled|decided|goes to|champion)\b/i;

/** A tool's progress from its own summary: "3 of 4 in" and whether it reads as finished. */
export function progress(summary: string): { done: number; total: number; finished: boolean } {
  const m = /(\d+) of (\d+)/.exec(summary);
  const done = m ? Number(m[1]) : 0;
  const total = m ? Number(m[2]) : 0;
  const finished = DONE_TEXT.test(summary) ? !(m && done < total && !/locked|square/.test(summary)) : total > 0 && done >= total;
  return { done, total, finished };
}

/** The result a finished tool settled on, from its summary ("...spun the wheel: Sushi Ko."). */
export function resultOf(summary: string): string | null {
  const m = /(?:spun the wheel|picked|winner|won|goes to|champion)[^:]*:\s*([^.:]{1,40})/i.exec(summary);
  return m ? m[1]!.trim() : null;
}

const countOf = (json: string, id: string) => json.split(`"${id}"`).length - 1;
const sOf = (f: FoldJson) => {
  const i = f.indexOf('"s":');
  try {
    return JSON.stringify(JSON.parse(f).s);
  } catch {
    return f.slice(i);
  }
};

function values(a: unknown): unknown[] {
  if (!a || typeof a !== "object") return [];
  return Object.entries(a as Record<string, unknown>)
    .filter(([k]) => k !== "t")
    .map(([, v]) => v);
}

export function choose(realm: ToolRealm, f: FoldJson, p: Persona, r: Rand, mem: ToolMemory): Choice | null {
  if (mem.mine.length >= MAX_PER_PERSON || realm.dead) return null;
  const before = realm.summary(f);
  const prog0 = progress(before);
  const s0 = sOf(f);
  const me0 = countOf(s0, p.id);
  const seen = new Set<string>();
  const cands: { a: unknown; idea?: string }[] = [];
  for (let i = 0; i < 24 && !realm.dead; i++) {
    const a = realm.arbitrary(f, p.id, r.int(2 ** 32));
    if (!a || typeof a !== "object" || Array.isArray(a)) continue;
    const k = JSON.stringify(a);
    if (seen.has(k)) continue;
    seen.add(k);
    cands.push({ a });
    // A person with ideas puts their own on a food wheel instead of the tool's sample one.
    const key = TEXT_KEYS.find((x) => typeof (a as Record<string, unknown>)[x] === "string");
    if (key && mem.food && p.food.length) {
      const idea = p.food.find((x) => !s0.toLowerCase().includes(x.toLowerCase()));
      if (idea) {
        const v = { ...(a as Record<string, unknown>), [key]: idea };
        const kv = JSON.stringify(v);
        if (!seen.has(kv)) {
          seen.add(kv);
          cands.push({ a: v, idea });
        }
      }
    }
  }
  const meta = (seed: number) => ({ seq: mem.head + 1, user: p.id, time: mem.now, seed });
  let best: Choice | null = null;
  const held: string[] = [];
  for (const { a, idea } of cands) {
    const t = String((a as { t?: unknown }).t ?? "");
    if (REJECT_T.test(t)) continue;
    const vals = values(a);
    if (Object.entries(a as Record<string, unknown>).some(([k, v]) => MONEY_KEYS.test(k) && typeof v === "number")) continue;
    const next = realm.reduce(f, a, meta(0x9e3779b9));
    if (next === f) continue;
    const s1 = sOf(next);
    if (s1 === s0 || mem.recent.slice(-12).includes(s1)) continue; // a no-op, or an undo
    const random = realm.reduce(f, a, meta(0x2545f491)) !== next;
    const me1 = countOf(s1, p.id);
    if (me1 < me0) continue; // un-claiming, un-voting
    if (mem.members.some((m) => m !== p.id && countOf(s1, m) < countOf(s0, m)) && !random) continue; // taking from someone
    if (mem.mine.some((x) => x.t === t) && me1 <= me0 && !random) continue; // changing an answer
    if (VETOISH.test(t) && mem.mine.some((x) => VETOISH.test(x.t))) continue; // one veto each
    const after = realm.summary(next);
    const prog1 = progress(after);
    if (random && prog0.finished && prog1.done <= prog0.done) continue; // re-spinning a result
    if (random && mem.now - mem.lastRandomAt < 45_000 && prog1.done <= prog0.done) continue;
    const finishes = random || FINISH_T.test(t) || (prog1.finished && !prog0.finished);
    if (finishes && mem.others === 0 && mem.mine.length === 0 && mem.age < mem.holdMs) {
      held.push(t);
      continue;
    }
    let score = 1 + 2 * Math.min(2, me1 - me0) + 4 * Math.max(0, prog1.done - prog0.done);
    if (finishes && prog1.finished) score += 3 + 2 * p.decisive;
    if (vals.some((v) => typeof v === "string" && v !== p.id && mem.members.includes(v))) score -= 3; // for someone else
    for (const v of vals) {
      if (typeof v !== "string") continue;
      if (POSITIVE.test(v)) score += 1;
      if (NEGATIVE.test(v)) score -= p.decisive < 0.4 && r.chance(0.3) ? 0 : 2.5;
      if (HEDGE.test(v)) score += p.decisive > 0.6 ? -1.5 : 0.5;
    }
    if (/^(add|suggest|new|propose)$/i.test(t)) score += 2 * p.ideas - (longest(s1) >= 4 ? 2 : 0) + (idea ? 1 : 0);
    if (VETOISH.test(t)) score -= 1;
    score += r.next() * 0.8;
    const verb = verbOf(t, vals, random);
    const why = `${t}${random ? " (random)" : ""}${finishes ? " finishes" : ""} score ${score.toFixed(1)}`;
    if (!best || score > best.score) best = { action: a, score, verb, finishes, ...(idea ? { idea } : {}), why };
  }
  if (best && best.score > 0.5) return best;
  return held.length ? { action: null, score: 0, verb: null, finishes: true, why: `held ${held.join(",")}` } : null;
}

function longest(json: string): number {
  let n = 0;
  try {
    const walk = (v: unknown) => {
      if (Array.isArray(v)) {
        n = Math.max(n, v.length);
        v.forEach(walk);
      } else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(JSON.parse(json));
  } catch {}
  return n;
}

function verbOf(t: string, vals: unknown[], random: boolean): Verb {
  if (random) return "spin";
  if (/^(add|suggest|new|propose)$/i.test(t)) return "add";
  if (vals.some((v) => typeof v === "string" && POSITIVE.test(v))) return "in";
  if (vals.some((v) => typeof v === "string" && HEDGE.test(v))) return "maybe";
  if (/vote|rank|pick|like/i.test(t)) return "vote";
  if (/take|claim|grab|eat|join/i.test(t)) return "take";
  if (/paid|pay/i.test(t)) return "paid";
  return null;
}
