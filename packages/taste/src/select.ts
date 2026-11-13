// Active selection: which item to show next.
//
// 1. Pick a kind (copy pair, copy line, tool, motion clip, screen) by how far each is behind a
//    target mix, so the stream stays varied.
// 2. Inside that kind, with probability `explore` pick at random (a floor of pure exploration);
//    otherwise pick the candidate expected to shrink the undecided features' uncertainty the
//    most (each relative to its own variance; a rank-one Laplace update on x, the item's features,
//    or xa - xb for a pair), plus a small bonus for a feature combination not shown yet.
//    p(1-p) is fixed at 1/4 on purpose: weighing by the current prediction makes the design
//    depend on outcomes, and in simulation that inflated a random swiper's z-scores by about 40%.
// 3. Never a near-duplicate of the previous item: not the same meaning group, piece, transition or
//    screen view, and feature sets less than 80% alike.

import { broken } from "./break.ts";
import { info, type Feats } from "./features.ts";
import { featuresOf, type CopyItem, type Item } from "./items/index.ts";
import { diff, Fitted } from "./model.ts";
import type { Rand } from "./rng.ts";
import { confidenceOf } from "./summary.ts";

export type Candidate = { mode: "single"; item: Item } | { mode: "pair"; a: CopyItem; b: CopyItem };
export type Slot = "pair" | "copy" | "tool" | "motion" | "screen";
export const DEFAULT_MIX: Record<Slot, number> = { pair: 0.35, copy: 0.1, tool: 0.25, motion: 0.2, screen: 0.1 };

export type History = {
  /** Item ids judged as singles, and pair keys judged as pairs. */
  done: Set<string>;
  shown: Record<Slot, number>;
  signatures: Map<string, number>;
  last: Candidate | null;
};
export const newHistory = (): History => ({ done: new Set(), shown: { pair: 0, copy: 0, tool: 0, motion: 0, screen: 0 }, signatures: new Map(), last: null });

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const keyOf = (c: Candidate) => (c.mode === "pair" ? pairKey(c.a.id, c.b.id) : c.item.id);
const slotOf = (c: Candidate): Slot => (c.mode === "pair" ? "pair" : c.item.kind);
const featsOf = (c: Candidate): Feats => (c.mode === "pair" ? diff(featuresOf(c.a), featuresOf(c.b)) : featuresOf(c.item));
const groupOf = (c: Candidate) => (c.mode === "pair" ? c.a.group : c.item.group);
const keysOf = (c: Candidate) => new Set(c.mode === "pair" ? [...Object.keys(c.a.x), ...Object.keys(c.b.x)] : Object.keys(c.item.x));
/** Feature combination without the identity features (piece, view, transition, role). */
const signature = (c: Candidate) =>
  [...keysOf(c)]
    .filter((k) => !/^(tool\.piece|screen\.view|motion\.transition|copy\.role)=/.test(k))
    .sort()
    .join(",");

export function nearDuplicate(a: Candidate | null, b: Candidate): boolean {
  if (!a) return false;
  if (groupOf(a) === groupOf(b)) return true;
  const ka = keysOf(a), kb = keysOf(b);
  let inter = 0;
  for (const k of ka) if (kb.has(k)) inter++;
  return inter / (ka.size + kb.size - inter || 1) >= 0.8;
}

export function candidates(pool: Item[], slot: Slot, h: History, exclude: Set<string>): Candidate[] {
  const ok = (c: Candidate) => !h.done.has(keyOf(c)) && !exclude.has(keyOf(c)) && !nearDuplicate(h.last, c);
  if (slot === "pair") {
    const groups = new Map<string, CopyItem[]>();
    for (const it of pool) if (it.kind === "copy") groups.set(it.group, [...(groups.get(it.group) ?? []), it]);
    const out: Candidate[] = [];
    for (const g of groups.values())
      for (let i = 0; i < g.length; i++)
        for (let j = i + 1; j < g.length; j++) {
          const c: Candidate = { mode: "pair", a: g[i]!, b: g[j]! };
          if (ok(c)) out.push(c);
        }
    return out;
  }
  return pool.filter((it) => it.kind === slot).map((item): Candidate => ({ mode: "single", item })).filter(ok);
}

const focusCache = new WeakMap<Fitted, Float64Array>();
/**
 * How much each feature's uncertainty counts when choosing: 1 while undecided, 0.5 once decided
 * (keep checking it, so a preference that crossed the line by chance gets more data), 0 for
 * intercepts (base rates are not the goal).
 */
export function focus(fit: Fitted): Float64Array {
  let s = focusCache.get(fit);
  if (s) return s;
  s = new Float64Array(fit.d);
  for (const [name, i] of fit.index) {
    if (info(name).hidden) continue;
    const c = confidenceOf(fit.weight(name)!).confidence;
    s[i] = c === "none" || c === "prior" ? 1 : Math.SQRT1_2;
  }
  focusCache.set(fit, s);
  return s;
}

export function information(fit: Fitted, c: Candidate): number {
  return aopt(fit, c);
}

export type SelectOpts = { rng: Rand; explore?: number; exclude?: Set<string>; mix?: Partial<Record<Slot, number>>; random?: boolean };

export function selectNext(fit: Fitted, pool: Item[], h: History, o: SelectOpts): Candidate | null {
  const mix = { ...DEFAULT_MIX, ...o.mix };
  const exclude = o.exclude ?? new Set<string>();
  const total = Object.values(h.shown).reduce((a, b) => a + b, 0) + 1;
  const slots = (Object.keys(mix) as Slot[])
    .filter((s) => mix[s] > 0)
    .sort((a, b) => mix[b] - h.shown[b] / total - (mix[a] - h.shown[a] / total));
  for (const slot of slots) {
    const cs = candidates(pool, slot, h, exclude);
    if (!cs.length) continue;
    if (o.random || o.rng.next() < (o.explore ?? 0.15)) return o.rng.pick(cs);
    let best = cs[0]!, bestV = -Infinity;
    const worst = broken();
    for (const c of cs) {
      const v = information(fit, c) + 0.02 / (1 + (h.signatures.get(signature(c)) ?? 0)) + o.rng.next() * 1e-6;
      if (worst ? -v > bestV : v > bestV) (bestV = worst ? -v : v), (best = c);
    }
    return best;
  }
  return null;
}

/** Record that a candidate was shown (and, once judged, done). */
export function noteShown(h: History, c: Candidate): void {
  h.shown[slotOf(c)]++;
  const s = signature(c);
  h.signatures.set(s, (h.signatures.get(s) ?? 0) + 1);
  h.last = c;
}
export function noteDone(h: History, key: string): void {
  h.done.add(key);
}

/**
 * Expected drop in the undecided features' variances, each relative to its own variance, after one
 * more judgment on this candidate (rank-one Laplace update with p(1-p) = 1/4).
 */
export function aopt(fit: Fitted, c: Candidate): number {
  const f = featsOf(c);
  const fw = focus(fit);
  const d = fit.d, cov = fit.m.cov;
  const idx: number[] = [], val: number[] = [];
  for (const [k, v] of Object.entries(f)) {
    const i = fit.index.get(k);
    if (i !== undefined && v) idx.push(i), val.push(v);
  }
  let quad = 0;
  const sd = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    let s = 0;
    for (let a = 0; a < idx.length; a++) s += cov[j * d + idx[a]!]! * val[a]!;
    sd[j] = s;
  }
  for (let a = 0; a < idx.length; a++) quad += val[a]! * sd[idx[a]!]!;
  let gain = 0;
  for (let j = 0; j < d; j++) if (fw[j]) gain += (fw[j]! * fw[j]! * sd[j]! * sd[j]!) / cov[j * d + j]!;
  return (0.25 * gain) / (1 + 0.25 * quad);
}
