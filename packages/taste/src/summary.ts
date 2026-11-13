// Learned preferences in plain words, with how sure the model is.
//
// For each feature: how much the swipes narrowed its prior (data share), and how far its weight
// is from zero in standard deviations (z). Thresholds are set so a swiper who decides at random
// comes out as "no clear preference" (see test/sim.test.ts).

import { info } from "./features.ts";
import { copyItems } from "./items/copy.ts";
import { Fitted, type Model } from "./model.ts";

export type Confidence = "strong" | "likely" | "prior" | "none";
export type SummaryLine = { feature: string; family: string; text: string; /** The preference alone, without the confidence. */ phrase: string; confidence: Confidence; source: "data" | "prior"; mean: number; sd: number; z: number };
export type Summary = { judgments: number; trainedAt: string; lines: SummaryLine[]; best: { group: string; text: string; comparisons: number }[]; text: string };

export const THRESHOLDS = { strong: { z: 4.5, effect: 0.6 }, likely: { z: 3.2, effect: 0.4 }, dataShare: 0.3 };

export function confidenceOf(w: { mean: number; sd: number; priorMean: number; priorSd: number }): { confidence: Confidence; source: "data" | "prior"; z: number } {
  const share = 1 - (w.sd * w.sd) / (w.priorSd * w.priorSd);
  const z = Math.abs(w.mean) / w.sd;
  if (share < THRESHOLDS.dataShare) return { confidence: w.priorMean !== 0 ? "prior" : "none", source: "prior", z };
  const a = Math.abs(w.mean);
  if (z >= THRESHOLDS.strong.z && a >= THRESHOLDS.strong.effect) return { confidence: "strong", source: "data", z };
  if (z >= THRESHOLDS.likely.z && a >= THRESHOLDS.likely.effect) return { confidence: "likely", source: "data", z };
  return { confidence: "none", source: "data", z };
}

const ORDER: Record<Confidence, number> = { strong: 0, likely: 1, prior: 2, none: 3 };

export function summarize(model: Model): Summary {
  const fit = new Fitted(model);
  const lines: SummaryLine[] = [];
  const families = new Map<string, SummaryLine[]>();
  for (const name of model.names) {
    const i = info(name);
    if (i.hidden) continue;
    const w = fit.weight(name)!;
    const c = confidenceOf(model.usePriors ? w : { ...w, priorMean: 0 });
    const dir = (c.confidence === "prior" ? w.priorMean : w.mean) < 0 ? i.dislike : i.like;
    const against = c.source === "data" && w.priorMean !== 0 && Math.sign(w.mean) !== Math.sign(w.priorMean) && c.confidence !== "none";
    const text =
      c.confidence === "prior"
        ? `${dir}, prior from what you said, not tested yet`
        : c.confidence === "none"
          ? `no clear preference on ${i.family} yet`
          : `${dir}, ${c.confidence}${against ? " (overturns the prior)" : ""}`;
    const phrase = c.confidence === "none" ? `no clear preference on ${i.family} yet` : dir;
    const line: SummaryLine = { feature: name, family: i.family, text, phrase, confidence: c.confidence, source: c.source, mean: round(w.mean), sd: round(w.sd), z: round(c.z) };
    families.set(i.family, [...(families.get(i.family) ?? []), line]);
  }
  for (const [family, ls] of families) {
    const sure = ls.filter((l) => l.confidence !== "none");
    if (sure.length) lines.push(...sure);
    else lines.push({ ...ls[0]!, feature: ls.length > 1 ? family : ls[0]!.feature, text: `no clear preference on ${family} yet`, phrase: `no clear preference on ${family} yet` });
  }
  lines.sort((a, b) => ORDER[a.confidence] - ORDER[b.confidence] || b.z - a.z);

  const texts = new Map(copyItems().map((c) => [c.id, c.text]));
  const best = Object.entries(model.groups)
    .map(([group, g]) => ({ group, text: texts.get(g[0]!.id) ?? g[0]!.id, comparisons: g.reduce((n, x) => n + x.n, 0) / 2 }))
    .sort((a, b) => b.comparisons - a.comparisons)
    .slice(0, 8);

  const text = [
    `${model.n.judgments} judgments${model.usePriors ? "" : ", priors off"}`,
    ...lines.map((l) => `- ${l.text}`),
    ...(best.length ? ["", "Best line in each group so far:", ...best.map((b) => `- ${b.text} (${b.comparisons} comparisons)`)] : []),
  ].join("\n");
  return { judgments: model.n.judgments, trainedAt: model.trainedAt, lines, best, text };
}

const round = (x: number) => Math.round(x * 100) / 100;
