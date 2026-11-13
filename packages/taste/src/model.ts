// The preference model.
//
// 1. One regularised logistic model over item features, fit to every judgment:
//    - a like is 1, a dislike 0, a love is a like counted twice, a skip is ignored;
//    - a pair ("which reads better") is a Bradley-Terry comparison on the feature difference
//      xa - xb, so pairs and single swipes train the same weights.
//    Each weight has a Gaussian prior: mean 0, or a weak mean from what the owner said (features.ts).
//    Fit by Newton's method (MAP). Uncertainty is the Laplace approximation: the posterior
//    covariance is the inverse Hessian at the optimum.
// 2. A Bradley-Terry ranking inside each "same meaning" group, from pairs only, same solver,
//    one strength per line with a N(0, 1) prior.

import { broken } from "./break.ts";
import { KNOWN_FEATURES, priorOf, type Feats } from "./features.ts";
import { cholesky, cholInverse, cholSolve } from "./linalg.ts";

export type Decision = "like" | "dislike" | "love" | "skip" | "a" | "b";

/** One line of swipes.jsonl. Feature snapshots are stored so the model never depends on the catalog. */
export type Judgment = {
  v: 1;
  type: "judge";
  id: string;
  at: string;
  session: string;
  /** Position in the session, from 1. */
  order: number;
  mode: "single" | "pair";
  kind: "copy" | "tool" | "motion" | "screen";
  /** Single: the item id. Pair: the two ids, a then b. */
  item: string;
  a?: string;
  b?: string;
  group?: string;
  decision: Decision;
  /** Time from shown to decided. */
  ms: number;
  /** Tapped or played with it before deciding. */
  interacted: boolean;
  x?: Feats;
  xa?: Feats;
  xb?: Feats;
};
export type Undo = { v: 1; type: "undo"; id: string; target: string; at: string };
export type Line = Judgment | Undo;

export type Model = {
  version: 1;
  trainedAt: string;
  /** Training time in ms. */
  ms: number;
  n: { judgments: number; singles: number; pairs: number; skips: number };
  usePriors: boolean;
  names: string[];
  mean: number[];
  /** Posterior covariance, row-major d x d. */
  cov: number[];
  priorMean: number[];
  priorSd: number[];
  /** Bradley-Terry strengths inside each meaning group, best first. */
  groups: Record<string, { id: string; s: number; sd: number; n: number }[]>;
};

/** Judgments still in force: undone ones removed (an undo cancels its target). */
export function effective(lines: Line[]): Judgment[] {
  const undone = new Set(lines.filter((l): l is Undo => l.type === "undo").map((l) => l.target));
  return lines.filter((l): l is Judgment => l.type === "judge" && !undone.has(l.id));
}

type Row = { idx: number[]; val: number[]; y: number; w: number };
const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

/** MAP logistic regression with a diagonal Gaussian prior; returns mean and Laplace covariance. */
export function fitLogistic(rows: Row[], d: number, mu: Float64Array, sd: Float64Array): { w: Float64Array; cov: Float64Array } {
  const prec = sd.map((s) => 1 / (s * s));
  const w = Float64Array.from(mu);
  const hessian = () => {
    const H = new Float64Array(d * d);
    const g = new Float64Array(d);
    for (let j = 0; j < d; j++) {
      H[j * d + j] = prec[j]!;
      g[j] = prec[j]! * (w[j]! - mu[j]!);
    }
    const slow = broken();
    for (const r of rows) {
      let z = 0;
      for (let a = 0; a < r.idx.length; a++) z += w[r.idx[a]!]! * r.val[a]!;
      const p = sigmoid(z);
      const e = r.w * (p - r.y);
      const c = r.w * p * (1 - p);
      for (let a = 0; a < r.idx.length; a++) {
        const i = r.idx[a]!, vi = r.val[a]!;
        g[i] = g[i]! + e * vi;
        for (let b = 0; b < r.idx.length; b++) {
          const k = i * d + r.idx[b]!;
          H[k] = H[k]! + c * vi * r.val[b]!;
        }
      }
      // Broken on purpose (TASTE_BREAK=1): re-invert the Hessian after every row.
      if (slow) cholInverse(cholesky(H, d), d);
    }
    return { H, g };
  };
  for (let it = 0; it < 50; it++) {
    const { H, g } = hessian();
    const step = cholSolve(cholesky(H, d), d, g);
    let max = 0;
    for (let j = 0; j < d; j++) {
      // Damp big steps; logistic Newton can overshoot on separable data.
      const s = Math.max(-2, Math.min(2, step[j]!));
      w[j] = w[j]! - s;
      max = Math.max(max, Math.abs(s));
    }
    if (max < 1e-7) break;
  }
  const cov = cholInverse(cholesky(hessian().H, d), d);
  return { w, cov };
}

function toRow(f: Feats, index: Map<string, number>, y: number, w: number): Row {
  const idx: number[] = [], val: number[] = [];
  for (const [k, v] of Object.entries(f)) {
    const i = index.get(k);
    if (i !== undefined && v !== 0) idx.push(i), val.push(v);
  }
  return { idx, val, y, w };
}

export function diff(a: Feats, b: Feats): Feats {
  const o: Feats = { ...a };
  for (const [k, v] of Object.entries(b)) o[k] = (o[k] ?? 0) - v;
  return o;
}

export type TrainOpts = { usePriors?: boolean; names?: string[] };

export function train(input: Line[], o: TrainOpts = {}): Model {
  const t0 = performance.now();
  const js = effective(input);
  const usePriors = o.usePriors ?? true;
  const names = [...new Set([...KNOWN_FEATURES, "type.copy", "type.tool", "type.motion", "type.screen", ...(o.names ?? [])])];
  for (const j of js) for (const f of [j.x, j.xa, j.xb]) if (f) for (const k of Object.keys(f)) if (!names.includes(k)) names.push(k);
  const index = new Map(names.map((n, i) => [n, i]));
  const d = names.length;
  const mu = new Float64Array(d), sd = new Float64Array(d);
  names.forEach((n, i) => {
    const p = priorOf(n);
    mu[i] = usePriors ? p.mean : 0;
    sd[i] = p.sd;
  });
  const flip = broken();
  const rows: Row[] = [];
  let singles = 0, pairs = 0, skips = 0;
  for (const j of js) {
    if (j.decision === "skip") {
      skips++;
      continue;
    }
    if (j.mode === "pair" && j.xa && j.xb && (j.decision === "a" || j.decision === "b")) {
      pairs++;
      const y = j.decision === "a" ? 1 : 0;
      rows.push(toRow(diff(j.xa, j.xb), index, flip ? 1 - y : y, 1));
    } else if (j.mode === "single" && j.x && j.decision !== "a" && j.decision !== "b") {
      singles++;
      const y = j.decision === "dislike" ? 0 : 1;
      rows.push(toRow(j.x, index, flip ? 1 - y : y, j.decision === "love" ? 2 : 1));
    }
  }
  const { w, cov } = fitLogistic(rows, d, mu, sd);
  if (flip) for (let i = 0; i < cov.length; i++) cov[i] = cov[i]! * 0.01;

  // Bradley-Terry inside each group, from pairs.
  const groups: Model["groups"] = {};
  const byGroup = new Map<string, Judgment[]>();
  for (const j of js) if (j.mode === "pair" && j.group && j.a && j.b && (j.decision === "a" || j.decision === "b")) byGroup.set(j.group, [...(byGroup.get(j.group) ?? []), j]);
  for (const [g, list] of byGroup) {
    const ids = [...new Set(list.flatMap((j) => [j.a!, j.b!]))];
    const gi = new Map(ids.map((id, i) => [id, i]));
    const count = new Map<string, number>();
    const r: Row[] = list.map((j) => {
      count.set(j.a!, (count.get(j.a!) ?? 0) + 1);
      count.set(j.b!, (count.get(j.b!) ?? 0) + 1);
      return { idx: [gi.get(j.a!)!, gi.get(j.b!)!], val: [1, -1], y: j.decision === "a" ? 1 : 0, w: 1 };
    });
    const k = ids.length;
    const fit = fitLogistic(r, k, new Float64Array(k), new Float64Array(k).fill(1));
    groups[g] = ids.map((id, i) => ({ id, s: fit.w[i]!, sd: Math.sqrt(fit.cov[i * k + i]!), n: count.get(id) ?? 0 })).sort((a, b) => b.s - a.s);
  }

  return {
    version: 1,
    trainedAt: new Date().toISOString(),
    ms: Math.round((performance.now() - t0) * 10) / 10,
    n: { judgments: js.length, singles, pairs, skips },
    usePriors,
    names,
    mean: [...w],
    cov: [...cov],
    priorMean: [...mu],
    priorSd: [...sd],
    groups,
  };
}

/** Fast lookups on a trained model. */
export class Fitted {
  readonly index: Map<string, number>;
  readonly d: number;
  constructor(readonly m: Model) {
    this.index = new Map(m.names.map((n, i) => [n, i]));
    this.d = m.names.length;
  }
  /**
   * Mean and variance of the log-odds for a feature vector (unknown features are ignored).
   * With `focus` (one scale per feature), the variance weighs features by it: 0 leaves one out.
   */
  logit(f: Feats, focus?: Float64Array): { mean: number; variance: number } {
    const idx: number[] = [], val: number[] = [];
    for (const [k, v] of Object.entries(f)) {
      const i = this.index.get(k);
      if (i !== undefined && v) idx.push(i), val.push(v);
    }
    let mean = 0, variance = 0;
    for (let a = 0; a < idx.length; a++) {
      mean += this.m.mean[idx[a]!]! * val[a]!;
      const sa = focus ? focus[idx[a]!]! : 1;
      if (!sa) continue;
      for (let b = 0; b < idx.length; b++) variance += sa * (focus ? focus[idx[b]!]! : 1) * val[a]! * val[b]! * this.m.cov[idx[a]! * this.d + idx[b]!]!;
    }
    return { mean, variance: Math.max(0, variance) };
  }
  /** Probability of a like, with the logit uncertainty folded in (probit approximation). */
  prob(f: Feats): number {
    const { mean, variance } = this.logit(f);
    return sigmoid(mean / Math.sqrt(1 + (Math.PI * variance) / 8));
  }
  weight(name: string): { mean: number; sd: number; priorMean: number; priorSd: number } | null {
    const i = this.index.get(name);
    if (i === undefined) return null;
    return { mean: this.m.mean[i]!, sd: Math.sqrt(this.m.cov[i * this.d + i]!), priorMean: this.m.priorMean[i]!, priorSd: this.m.priorSd[i]! };
  }
}

export { sigmoid };
