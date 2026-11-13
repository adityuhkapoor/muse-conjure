// Simulated swipers, for tests and for `bun run sim`. Each has a planted utility over features and
// decides like a person would: noisily, by a logistic choice on that utility.

import type { Feats } from "./features.ts";
import { copyItems, featuresOf, type CopyItem } from "./items/index.ts";
import { Fitted, sigmoid, train, type Judgment, type Line, type Model } from "./model.ts";
import { rand, type Rand } from "./rng.ts";
import { selectNext, newHistory, noteShown, noteDone, keyOf, type Candidate, type Slot } from "./select.ts";
import { summarize } from "./summary.ts";

export type Swiper = { name: string; planted: Record<string, number>; random?: boolean };

export const PLAIN: Swiper = { name: "plain and short", planted: { "copy.exclaim": -2, "copy.emoji": -1.5, "copy.title_case": -1.5, "copy.punchy": -1.5, "copy.ai_phrase": -2, "copy.long": -1 } };
export const LOUD: Swiper = { name: "loud", planted: { "copy.exclaim": 2, "copy.emoji": 1.5, "copy.punchy": 1.5, "copy.title_case": 1 } };
export const RANDOM: Swiper = { name: "random", planted: {}, random: true };

const utility = (s: Swiper, f: Feats) => Object.entries(s.planted).reduce((u, [k, w]) => u + w * (f[k] ?? 0), 0);

export function decide(s: Swiper, c: Candidate, r: Rand): Judgment["decision"] {
  if (c.mode === "pair") {
    const p = s.random ? 0.5 : sigmoid(utility(s, featuresOf(c.a)) - utility(s, featuresOf(c.b)));
    return r.next() < p ? "a" : "b";
  }
  const p = s.random ? 0.5 : sigmoid(utility(s, featuresOf(c.item)));
  return r.next() < p ? "like" : "dislike";
}

export function judgment(c: Candidate, decision: Judgment["decision"], order: number): Judgment {
  const base = { v: 1 as const, type: "judge" as const, id: `sim-${order}`, at: "", session: "sim", order, decision, ms: 0, interacted: false };
  return c.mode === "pair"
    ? { ...base, mode: "pair", kind: "copy", item: `${c.a.id}|${c.b.id}`, a: c.a.id, b: c.b.id, group: c.a.group, xa: featuresOf(c.a), xb: featuresOf(c.b) }
    : { ...base, mode: "single", kind: c.item.kind, item: c.item.id, group: c.item.group, x: featuresOf(c.item) };
}

/** Planted features the summary reports with the right sign at "likely" or "strong". */
export function recovered(m: Model, s: Swiper): string[] {
  const lines = summarize(m).lines;
  return Object.entries(s.planted)
    .filter(([k, w]) => lines.some((l) => l.feature === k && (l.confidence === "strong" || l.confidence === "likely") && Math.sign(l.mean) === Math.sign(w)))
    .map(([k]) => k);
}
/** Features the summary is sure about that were not planted, or have the wrong sign. */
export function falseClaims(m: Model, s: Swiper): string[] {
  return summarize(m)
    .lines.filter((l) => l.confidence === "strong" || l.confidence === "likely")
    .filter((l) => !(l.feature in s.planted) || Math.sign(s.planted[l.feature]!) !== Math.sign(l.mean))
    .map((l) => l.feature);
}

export type RunOpts = { seed: number; budget: number; random?: boolean; usePriors?: boolean; pool?: CopyItem[]; every?: number; mix?: Partial<Record<Slot, number>>; stop?: (m: Model, n: number) => boolean };
export type Run = { model: Model; lines: Line[]; n: number; stoppedAt: number | null; trainMs: number[] };

/** Swipe through copy (pairs and single lines) with active or random selection, retraining every 10. */
export function run(s: Swiper, o: RunOpts): Run {
  const pool = o.pool ?? copyItems();
  const r = rand(o.seed), dr = rand(o.seed ^ 0x9e3779b9);
  const h = newHistory();
  const lines: Line[] = [];
  const every = o.every ?? 10;
  const names = [...new Set(pool.flatMap((p) => Object.keys(featuresOf(p))))];
  let model = train([], { usePriors: o.usePriors ?? false, names });
  let fit = new Fitted(model);
  const trainMs: number[] = [];
  let stoppedAt: number | null = null;
  for (let n = 1; n <= o.budget; n++) {
    const c = selectNext(fit, pool, h, { rng: r, random: o.random ?? false, mix: o.mix ?? { pair: 0.75, copy: 0.25, tool: 0, motion: 0, screen: 0 } });
    if (!c) break;
    noteShown(h, c);
    noteDone(h, keyOf(c));
    lines.push(judgment(c, decide(s, c, dr), n));
    if (n % every === 0) {
      model = train(lines, { usePriors: o.usePriors ?? false, names });
      trainMs.push(model.ms);
      fit = new Fitted(model);
      if (o.stop?.(model, n)) {
        stoppedAt = n;
        break;
      }
    }
  }
  return { model, lines, n: lines.length, stoppedAt, trainMs };
}

/** Judgments until every planted feature is recovered (checked every 10), or null within the budget. */
export function judgmentsToRecover(s: Swiper, o: Omit<RunOpts, "stop">): number | null {
  const want = Object.keys(s.planted).length;
  return run(s, { ...o, stop: (m) => recovered(m, s).length === want }).stoppedAt;
}

/** Share of held-out pairs whose winner (by the planted utility) the model predicts. */
export function pairAccuracy(m: Model, s: Swiper, seed = 99, n = 400): number {
  const fit = new Fitted(m);
  const r = rand(seed);
  const pool = copyItems();
  let right = 0, total = 0;
  for (let i = 0; i < n * 4 && total < n; i++) {
    const a = r.pick(pool), b = r.pick(pool.filter((x) => x.group === a.group && x.id !== a.id));
    const ua = utility(s, featuresOf(a)), ub = utility(s, featuresOf(b));
    if (ua === ub) continue;
    total++;
    if (fit.logit(featuresOf(a)).mean - fit.logit(featuresOf(b)).mean > 0 === ua > ub) right++;
  }
  return right / Math.max(1, total);
}

/** Planted preferences on features that only a few lines have: where choosing well matters most. */
export const RARE: Swiper = { name: "rare features", planted: { "copy.percent": -2, "copy.hedge": -1.5, "copy.first_person": -1.5, "copy.question": 1.5 } };
/** Likes exclamation marks: the opposite of the prior. */
export const EXCLAIMER: Swiper = { name: "likes exclamation marks", planted: { "copy.exclaim": 2 } };

/** Judgments until each planted feature is first recovered (checked every 10); `budget + 10` if never. */
export function perFeature(s: Swiper, o: Omit<RunOpts, "stop">): Record<string, number> {
  const first: Record<string, number> = {};
  const want = Object.keys(s.planted).length;
  run(s, {
    ...o,
    stop: (m, n) => {
      for (const k of recovered(m, s)) first[k] ??= n;
      return Object.keys(first).length === want;
    },
  });
  for (const k of Object.keys(s.planted)) first[k] ??= o.budget + 10;
  return first;
}
