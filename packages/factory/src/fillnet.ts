// The fill with a safety net. The fast model (Ember) fills first at minimal effort, which takes
// 1 to 4 s but is not always careful. A fill that does not hold up is tried again, with the reasons
// named, one step slower each time:
//   1. fast model, minimal effort, the short prompt (fillprompt.ts)
//   2. fast model, low effort, the same prompt plus the reasons
//   3. the main model (contributor Spark), minimal effort, the full prompt plus the reasons
// A fill "does not hold up" when it is malformed, when grounding (ground.ts) finds something the
// chat did not say, or when it is empty although the router said the chat has the content.
// When no step holds up, the best of them goes on (fewest problems, most content) and generate.ts
// repairs or strips it as before. Set MUSE_FILL=spark for the old single fill on the main model.

import { groundOf, honestStart, problems, type Problem } from "./ground.ts";
import { fillLab, shaped, type Fill } from "./router.ts";
import type { Effort, GenerateRequest, ModelClient } from "./types.ts";

type Req = Pick<GenerateRequest, "ask" | "chat" | "members" | "surface">;

export type FillSpec = { mode: "net" | "spark"; firstEffort: Effort; retryEffort: Effort; fallbackEffort: Effort; sparkEffort: Effort };

/** The fill settings; every one has an environment override (README: Environment switches). */
export function fillSpec(): FillSpec {
  const eff = (k: string, d: Effort) => (["minimal", "low", "medium", "high"].includes(process.env[k] ?? "") ? (process.env[k] as Effort) : d);
  return {
    mode: process.env.MUSE_FILL === "spark" ? "spark" : "net",
    firstEffort: eff("MUSE_FILL_EFFORT", "minimal"),
    retryEffort: eff("MUSE_FILL_RETRY_EFFORT", "low"),
    fallbackEffort: eff("MUSE_FILL_FALLBACK_EFFORT", "minimal"),
    sparkEffort: eff("MUSE_FILL_SPARK_EFFORT", "low"),
  };
}

/** True when the net should run: both models are Muse models and MUSE_FILL is not "spark". */
export const netOn = (fast: ModelClient | null, main: ModelClient): boolean => !!fast && fast !== main && fast.id.startsWith("muse") && main.id.startsWith("muse") && fillSpec().mode === "net";

const TITLE_KEY = /^(title|name|group|sub|subtitle|why|tagline|note|rule|rules|id|kind|theme|color|icon|seed)$/i;

/** How much a fill says beyond a title: non-empty strings, list entries and non-zero numbers. */
export function contentAtoms(params: Record<string, unknown>): number {
  // a title-like field at the top says nothing about the content; inside a list every string counts
  const walk = (v: unknown, skip: boolean): number => {
    if (typeof v === "string") return v.trim() && !skip ? 1 : 0;
    if (typeof v === "number") return v !== 0 && !skip ? 1 : 0;
    if (Array.isArray(v)) return v.reduce<number>((n, x) => n + walk(x, false), 0);
    if (v && typeof v === "object") return Object.values(v).reduce<number>((n, x) => n + walk(x, false), 0);
    return 0;
  };
  return Object.entries(params).reduce((n, [k, x]) => n + walk(x, TITLE_KEY.test(k)), 0);
}

export type Verdict = { ok: boolean; reasons: string[]; problems: Problem[]; atoms: number };

/** Does this fill hold up? Grounding as generate.ts will check it, plus malformed and empty-where-full. */
export function judge(req: Req, id: string, f: Fill | null, expectContent: boolean): Verdict {
  if (!f) return { ok: false, reasons: ["the reply was not a usable params object"], problems: [], atoms: 0 };
  const honest = honestStart(id, shaped(id, f.params), req);
  const ps = problems(id, honest, groundOf(req, f.suggested));
  const atoms = contentAtoms(honest);
  const reasons = [...new Set(ps.map((p) => p.why))];
  if (expectContent && atoms === 0) reasons.push("it is empty, but the chat names options, people, times or amounts for this tool: list every one of them");
  return { ok: reasons.length === 0, reasons, problems: ps, atoms };
}

export type NetResult = { fill: Fill | null; /** 0: the first try held up; 1: the retry; 2: the main model; 3: none did (the best one goes on) */ step: number; tried: string[] };

/**
 * Fill `id` from the chat. `models.fast` is Ember, `models.main` contributor Spark. `expectContent`:
 * the router said the chat has what this tool needs.
 */
export async function fillNet(req: Req, id: string, models: { fast: ModelClient; main: ModelClient }, o: { expectContent?: boolean; /** a fill that was turned down (the check, say) and why: start from the second step with it */ repair?: { params: Record<string, unknown>; errors: string[] } } = {}): Promise<NetResult> {
  const spec = fillSpec();
  const expect = o.expectContent === true;
  const tried: string[] = [];
  let best: { fill: Fill | null; score: number } = { fill: null, score: -1e9 };
  let repair = o.repair;
  const steps: { model: ModelClient; effort: Effort; compact: boolean; label: string }[] = [
    { model: models.fast, effort: spec.firstEffort, compact: true, label: "fill-1" },
    { model: models.fast, effort: spec.retryEffort, compact: true, label: "fill-2" },
    { model: models.main, effort: spec.fallbackEffort, compact: false, label: "fill-3" },
  ];
  // MUSE_FILL_NET=0: the first step alone, no retry and no fallback (to measure what the net adds)
  if (process.env.MUSE_FILL_NET === "0") steps.length = o.repair ? 2 : 1;
  for (const [i, s] of steps.entries()) {
    if (o.repair && i === 0) continue;
    const f = await fillLab(req, id, s.model, repair, { effort: s.effort, compact: s.compact, label: s.label });
    const v = judge(req, id, f, expect);
    tried.push(`${s.label}:${v.ok ? "ok" : v.reasons[0]?.slice(0, 60) ?? "bad"}`);
    if (v.ok) return { fill: f, step: i, tried };
    // the best so far: grounded problems cost more than emptiness, a null reply is worst
    const score = f ? v.atoms - 10 * v.problems.length : -1e9;
    if (f && score > best.score) best = { fill: f, score };
    if (f) repair = { params: f.params, errors: v.reasons };
  }
  return { fill: best.fill, step: 3, tried };
}
