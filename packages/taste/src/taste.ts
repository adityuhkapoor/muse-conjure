// What the rest of the system calls. Small on purpose.
//
//   taste.scoreCopy("Lock it in!")       -> { score, uncertainty, reasons }
//   taste.scoreTool({ radius: 16 })     -> { score, uncertainty }
//   taste.rank(["Spin", "Spin it!"])    -> best first
//   taste.summary()                     -> learned preferences in plain words
//
// `score` is the chance he likes it (0 to 1). `uncertainty` is half the width of the 90% interval
// on that chance: near 0 means the model is sure, above 0.2 means it is mostly guessing.

import { BASE_KNOBS, copyFeatures, info, toolKnobFeatures, type Feats, type Role, type ToolKnobs } from "./features.ts";
import { Fitted, sigmoid, train, type Model } from "./model.ts";
import { loadModel } from "./store.ts";
import { summarize, type Summary } from "./summary.ts";

export type Score = { score: number; uncertainty: number };
export type CopyScore = Score & { reasons: string[] };
/** Tool knobs; leave any out for Meta's default. `piece` is a library piece or example id. */
export type ToolSpec = Partial<ToolKnobs> & { piece?: string };
export type Ranked<T> = { candidate: T; score: number; uncertainty: number };

export interface Taste {
  readonly model: Model;
  scoreCopy(text: string, role?: Role): CopyScore;
  scoreTool(features: ToolSpec): Score;
  rank<T extends string | ToolSpec>(candidates: readonly T[], o?: { role?: Role }): Ranked<T>[];
  summary(): Summary;
}

function score(fit: Fitted, f: Feats): Score {
  const { mean, variance } = fit.logit(f);
  const s = Math.sqrt(variance);
  return { score: round(fit.prob(f)), uncertainty: round((sigmoid(mean + 1.645 * s) - sigmoid(mean - 1.645 * s)) / 2) };
}

export function createTaste(model: Model): Taste {
  const fit = new Fitted(model);
  const copyX = (text: string, role?: Role): Feats => ({ "type.copy": 1, ...copyFeatures(text, role) });
  const toolX = (t: ToolSpec): Feats => ({ "type.tool": 1, ...toolKnobFeatures({ ...BASE_KNOBS, ...t }, t.piece ?? "", { progress: true, avatars: true }) });
  const self: Taste = {
    model,
    scoreCopy(text, role) {
      const x = copyX(text, role);
      const reasons = Object.keys(x)
        .map((k) => ({ k, w: fit.weight(k), i: info(k) }))
        .filter((r) => r.w && !r.i.hidden && Math.abs(r.w.mean) >= 0.05)
        .sort((a, b) => Math.abs(b.w!.mean) - Math.abs(a.w!.mean))
        .map(({ w, i }) => {
          const tested = w!.sd * w!.sd < 0.7 * w!.priorSd * w!.priorSd;
          return `${w!.mean < 0 ? i.dislike : i.like} (${tested ? "learned" : "prior"}, ${w!.mean > 0 ? "+" : ""}${w!.mean.toFixed(2)})`;
        });
      return { ...score(fit, x), reasons };
    },
    scoreTool: (t) => score(fit, toolX(t)),
    rank(cs, o = {}) {
      return cs
        .map((c) => ({ candidate: c, ...(typeof c === "string" ? score(fit, copyX(c, o.role)) : score(fit, toolX(c as ToolSpec))) }))
        .sort((a, b) => b.score - a.score);
    },
    summary: () => summarize(model),
  };
  return self;
}

/** The model from priors alone: what he said, before any swipes. */
export const priorsOnly = (): Model => train([]);

let current: Taste | null = null;
/** His taste: data/taste/model.json if it exists, else priors only. `reload()` rereads the file. */
export const taste: Taste & { reload(): Taste } = {
  get model() {
    return get().model;
  },
  scoreCopy: (t, r) => get().scoreCopy(t, r),
  scoreTool: (f) => get().scoreTool(f),
  rank: (c, o) => get().rank(c, o),
  summary: () => get().summary(),
  reload() {
    current = null;
    return get();
  },
};
function get(): Taste {
  return (current ??= createTaste(loadModel() ?? priorsOnly()));
}

const round = (x: number) => Math.round(x * 1000) / 1000;
