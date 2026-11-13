// A separate, skeptical evaluator, calibrated on the owner's own taste data. It never builds.
//
// Five criteria, given to builder and evaluator alike, weighted toward the first two:
//   design      one coherent idea, a physical metaphor, the picture is the star         0.30
//   originality impossible as a stock feature; option rows, plain bars, generic cards
//               and empty RSVP counters score low by name                             0.30
//   craft       hierarchy, spacing, type, nothing clipped or overlapping                0.15
//   function    it does a real job for the group; obvious first action; works          0.10
//   lived_in    arrives in progress with named friends, their reasons, a joke          0.15
// Hard threshold: a round passes only when every criterion is 3 or more and the weighted score
// is 4.0 or more.
//
// Calibration: few-shot examples with full breakdowns, taken from the taste lab's votes
// (`muse/lab/merged-round1..3.json`: best-worst counts per tool), with the lab originals'
// pictures, plus tonight's owner rejections rendered from library pieces (a plain pie wheel, a
// poll with bars at zero, an RSVP card reading 0 of N in, a slot machine cut to one reel).
// `bun src/evaluator.ts --calibrate [--model muse:muse-spark-1.3] [--version 2]` scores 30 held-out
// lab tools and the rejections and reports Spearman against the vote ranking.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fill, piece } from "@muse/library";
import { labContext } from "../eval/labmatch.ts";
import { ROOT } from "./kb.ts";
import { closeShoot, sheet, shoot } from "./look/shoot.ts";
import type { ModelClient } from "./types.ts";

export const EVAL_CRITERIA = ["design", "originality", "craft", "function", "lived_in"] as const;
export type EvalCriterion = (typeof EVAL_CRITERIA)[number];
export const WEIGHTS: Record<EvalCriterion, number> = { design: 0.3, originality: 0.3, craft: 0.15, function: 0.1, lived_in: 0.15 };
export const THRESHOLD = { each: 3, weighted: 4 };

const num = { type: "number" };
const str = { type: "string" };
export const EVAL_SCHEMA = {
  type: "object",
  properties: {
    scores: { type: "object", properties: Object.fromEntries(EVAL_CRITERIA.map((c) => [c, num])), required: [...EVAL_CRITERIA], additionalProperties: false },
    why: { type: "object", properties: Object.fromEntries(EVAL_CRITERIA.map((c) => [c, str])), required: [...EVAL_CRITERIA], additionalProperties: false },
    fixes: { type: "array", items: { type: "object", properties: { scene: str, where: str, problem: str, fix: str }, required: ["scene", "where", "problem", "fix"], additionalProperties: false } },
    pivot: str,
    verdict: str,
  },
  required: ["scores", "why", "fixes", "pivot", "verdict"],
  additionalProperties: false,
};
export type Evaluation = { scores: Record<EvalCriterion, number>; why: Record<EvalCriterion, string>; fixes: { scene: string; where: string; problem: string; fix: string }[]; pivot: string; verdict: string };

export const weighted = (e: Evaluation) => Math.round(EVAL_CRITERIA.reduce((n, c) => n + WEIGHTS[c] * Math.max(1, Math.min(5, e.scores[c] ?? 1)), 0) * 100) / 100;
export const passes = (e: Evaluation) => EVAL_CRITERIA.every((c) => (e.scores[c] ?? 0) >= THRESHOLD.each) && weighted(e) >= THRESHOLD.weighted;

/** The criteria in words, shared by the builder's prompts and the evaluator. */
export const CRITERIA_TEXT = `- design (weight 0.30): one coherent idea drawn as a physical metaphor (a seat map, a corkboard, a top-down table, a boarding pass, a slot cabinet); the picture is the star and takes most of the card.
- originality (0.30): could not be a stock feature. Empty or generic option rows with bars, a plain pie wheel, a generic card with a counter ("0 of 5 in"), a bare checklist, a form: each of these scores 1 or 2 by name, however clean. Rows are not stock when every row carries this group's own words, faces and stakes.
- craft (0.15): clear hierarchy, even spacing, type in two or three sizes, nothing clipped, overlapping or ending in "…", calm Meta colors with one accent.
- function (0.10): it does a real job for this group (decide, divide, claim, settle, play to an end); the first action is obvious; it works when people tap. A toy with no job scores 2 or less.
- lived_in (0.15): it arrives part-way through, with named friends already in it, their reasons in their own words, and a running joke from the chat.`;

// ---------------------------------------------------------------------------------------------
// Votes.

export type Vote = { id: string; shown: number; best: number; worst: number; bws: number };
export function votes(): Vote[] {
  const rows = [1, 2, 3].flatMap((r) => JSON.parse(readFileSync(join(ROOT, "muse", "lab", `merged-round${r}.json`), "utf8")) as Record<string, unknown>[]);
  const s = new Map<string, { shown: number; best: number; worst: number }>();
  const at = (id: string) => s.get(id) ?? (s.set(id, { shown: 0, best: 0, worst: 0 }), s.get(id)!);
  for (const v of rows) {
    if (v.mode === "best4" && Array.isArray(v.shown)) {
      for (const id of v.shown as string[]) at(id).shown++;
      if (typeof v.best === "string") at(v.best).best++;
      if (typeof v.worst === "string") at(v.worst).worst++;
    }
  }
  return [...s.entries()].map(([id, x]) => ({ id, ...x, bws: x.shown ? (x.best - x.worst) / x.shown : 0 })).sort((a, b) => b.bws - a.bws);
}

const SHOT_DIR = join(ROOT, "library", "lab", "_shots");
export const hasPicture = (id: string) => existsSync(join(SHOT_DIR, id, "original-rest.png"));

// ---------------------------------------------------------------------------------------------
// Few-shot anchors with full breakdowns (written from the pictures and the votes).

type Anchor = { id: string; png: () => Promise<Uint8Array>; context: string; e: Evaluation };
const pngOf = (id: string) => async () => new Uint8Array(readFileSync(join(SHOT_DIR, id, "original-rest.png")));
const fx = (scene: string, where: string, problem: string, fix: string) => ({ scene, where, problem, fix });

export const REJECT_DIR = join(import.meta.dir, "..", "eval", "out", "evaluator", "rejections");
/** Tonight's owner rejections, rendered from library pieces at rest (393 px, light). */
export const REJECTIONS: { id: string; piece: string; params: (d: Record<string, unknown>) => Record<string, unknown>; context: string }[] = [
  { id: "plain-wheel", piece: "wheel", params: (d) => d, context: "Group chat: \"where are we eating\", four places named. Muse picks for them." },
  { id: "poll-zero", piece: "poll", params: (d) => d, context: "Group chat: \"where should we eat\", three places named. Muse runs a vote." },
  { id: "rsvp-zero", piece: "lock", params: (d) => ({ ...d, need: 0 }), context: "Group chat about SZA tickets on Saturday: who's actually in." },
  { id: "one-reel", piece: "reels", params: (d) => ({ ...d, reels: (d.reels as unknown[]).slice(0, 1) }), context: "Group chat: \"idk u pick\" for Saturday night, with places, budget and a leave time named." },
];
export async function rejectionPng(id: string): Promise<Uint8Array> {
  const f = join(REJECT_DIR, `${id}.png`);
  if (existsSync(f)) return new Uint8Array(readFileSync(f));
  const r = REJECTIONS.find((x) => x.id === id)!;
  const p = piece(r.piece)!;
  const src = fill(p, r.params(p.defaults as Record<string, unknown>));
  const members = ["Maya", "Leo", "Ana", "Sam", "Theo"].map((name, i) => ({ id: `u${i + 1}`, name }));
  const [s] = await shoot(src, { members, scenes: ["rest"], modes: ["light"] });
  mkdirSync(REJECT_DIR, { recursive: true });
  writeFileSync(f, s!.png);
  return s!.png;
}

const E = (scores: [number, number, number, number, number], why: [string, string, string, string, string], verdict: string, fixes: Evaluation["fixes"] = [], pivot = ""): Evaluation => ({
  scores: Object.fromEntries(EVAL_CRITERIA.map((c, i) => [c, scores[i]])) as Evaluation["scores"],
  why: Object.fromEntries(EVAL_CRITERIA.map((c, i) => [c, why[i]])) as Evaluation["why"],
  fixes,
  pivot,
  verdict,
});

export const ANCHORS: Anchor[] = [
  {
    id: "concert",
    png: pngOf("concert"),
    context: labContext("concert"),
    e: E([5, 5, 4, 5, 5], ["The arena seat map is the picture and the job at once; section 104 lights up with the friends' faces in it.", "A venue map with a price sparkline and an RSVP row could never be a stock poll.", "Clean hierarchy; the sparkline labels are small but readable.", "Who's going, where we sit and the price trend in one glance; tapping a section is obvious.", "Jess's \"if it's <$150\" and three going, two maybe: it is already mid-conversation."], "The best kind of Muse tool: a real place, real people, a real decision."),
  },
  {
    id: "chore-wheel",
    png: pngOf("chore-wheel"),
    context: labContext("chore-wheel"),
    e: E([5, 4, 4, 5, 5], ["A wheel whose slice sizes mean something (\"slice size = fights caused\").", "A wheel is common, but slices weighted by fights caused make it this apartment's.", "Curved labels read well; the facepile line is a little crowded.", "Spin to assign; nobody can argue with it.", "Marcus, Dani and Theo already spun; the fight counts are their lore."], "A familiar object made specific by one funny, true rule."),
  },
  {
    id: "grocery",
    png: pngOf("grocery"),
    context: labContext("grocery"),
    e: E([4, 4, 4, 5, 5], ["A shopping list with an urgency thermometer that climbs to \"Panic\".", "The quotes and the urgency meter turn a checklist into this apartment's list.", "Dense but ordered; quotes in grey under each item.", "One person takes the run; total in cart is clear.", "Every item carries who asked and their words (\"we have 1 egg\")."], "Lived-in detail carries a list that would otherwise be plain."),
  },
  {
    id: "face-drop",
    png: pngOf("face-drop"),
    context: labContext("face-drop"),
    e: E([3, 4, 4, 1, 2], ["A lively pile of faces, but the picture is the whole tool.", "Unusual and playful.", "Polished illustration.", "A toy with no job: nothing is decided, claimed or settled.", "Faces of friends but no reasons, no story."], "Charming to look at, pointless to use: people skipped it.", [fx("rest light", "the whole card", "nothing to do but drop faces", "give the pile a job (who's coming tonight) or do not build it")], "Pivot: tie the faces to a real decision."),
  },
  {
    id: "story-beat",
    png: pngOf("story-beat"),
    context: labContext("story-beat"),
    e: E([3, 3, 4, 2, 2], ["Stage art plus a beat grid: two ideas that do not meet.", "A step sequencer is novel but not for this group.", "Clean grid, good contrast.", "Making a beat for a story is a gimmick, not a group job.", "Names on rows, no reasons or joke."], "Well made, but nobody needed it.", [], "Pivot: a story frame people react to, not a sequencer."),
  },
  {
    id: "plain-wheel",
    png: () => rejectionPng("plain-wheel"),
    context: REJECTIONS[0]!.context,
    e: E([2, 1, 3, 3, 1], ["A pie of four colors with names; nothing about this chat in the picture.", "A plain pie wheel is a stock feature, rejected by name.", "Tidy but empty.", "It picks a place.", "Nobody is in it; no reasons, no joke."], "The owner rejected this: correct and lifeless.", [], "Pivot: draw the places themselves, weighted by what people said."),
  },
  {
    id: "poll-zero",
    png: () => rejectionPng("poll-zero"),
    context: REJECTIONS[1]!.context,
    e: E([1, 1, 3, 3, 1], ["Option rows with empty bars; there is no picture.", "A poll with bars at zero is the stock feature itself.", "Aligned rows, readable.", "You can vote.", "Arrives empty: no votes, no faces, no reasons."], "The owner rejected this: a form, not a tool.", [], "Pivot: make the choice a picture with friends already leaning."),
  },
];

/** Tools held out from the few-shot set, ranked by votes; the rejections not used as anchors join the test. */
export function heldOut(n = 30): Vote[] {
  const used = new Set(ANCHORS.map((a) => a.id));
  return votes()
    .filter((v) => v.shown >= 2 && hasPicture(v.id) && !used.has(v.id))
    .slice(0, 200)
    .sort((a, b) => b.shown - a.shown)
    .slice(0, n)
    .sort((a, b) => b.bws - a.bws);
}

// ---------------------------------------------------------------------------------------------
// Evaluate.

export const EVALUATOR_SYSTEM = (version: number) => `You are Muse's design evaluator: a separate, skeptical critic who never builds. Small live tools appear as rich cards inside Messenger and Facebook; the owner and testers keep the ones that feel made for the moment and kill the ones that look like stock features. You judge pictures of a tool against its moment.

Score each criterion 1 to 5:
${CRITERIA_TEXT}

Be stingy. A 5 is rare and means testers would pick it as the best of four. Most competent tools are 3. Clean but generic is 2 on originality, whatever its craft. A tool with no real job is 2 or less on function, however pretty.${version >= 3 ? `

What the testers' votes rewarded, learned from the lab (trust this over your own taste): compact, native-looking tools that resolve a real decision with the group already inside them. Winners: a bracket where each film carries a friend's quote; a date picker that locks with faces on each weekend; a move-in plan with a timeline and each item's owner and joke; a slot cabinet whose vetoes cite who said what. Big illustrations did not win on their own (an illustrated dating card, a coin jar, a pile of faces scored in the middle or lower). So score design and originality by how specific and alive the idea is for this group, not by how much is drawn. Lived-in detail, a clear job and Meta-native calm move a tool up; generic or empty moves it down.` : version >= 2 ? `

How the owner's votes actually fall (learned from the lab): the winners are concrete places and objects with the group already inside (seat maps, a wheel weighted by fights, a list with everyone's quotes, a boarding pass that fills). The losers are toys with no job (a pile of faces, a beat maker), and stock UI however tidy. Lived-in detail and a real job move a tool up more than illustration does.` : ""}

Then give located fixes (scene, where, problem, the concrete change), a \`pivot\` (one sentence: a different visual idea worth trying if this one is a dead end, or "" if refining is right), and a one-sentence verdict. JSON only.`;

export async function evaluate(client: ModelClient, png: Uint8Array, context: string, o: { version?: number; anchors?: boolean; label?: string; extraImages?: string[]; nonce?: number; exclude?: string } = {}): Promise<Evaluation> {
  const version = o.version ?? 2;
  // Overfitting guard: a tool being rebuilt or judged never sees its own original as an anchor.
  const anchors = (o.anchors ?? true ? ANCHORS : []).filter((a) => a.id !== o.exclude);
  const images: string[] = [];
  const shots: string[] = [];
  for (const [i, a] of anchors.entries()) {
    images.push(`data:image/png;base64,${Buffer.from(await a.png()).toString("base64")}`);
    shots.push(`Example ${i + 1} (image ${i + 1}). Moment: ${a.context}\nEvaluation: ${JSON.stringify({ scores: a.e.scores, why: a.e.why, verdict: a.e.verdict })}`);
  }
  images.push(`data:image/png;base64,${Buffer.from(png).toString("base64")}`, ...(o.extraImages ?? []));
  const content = `${shots.length ? `Calibration examples, scored by the owner's taste (the pictures are attached in order):\n\n${shots.join("\n\n")}\n\n` : ""}Now evaluate the tool in image ${shots.length + 1}${o.extraImages?.length ? ` (images after it are other views of the same tool)` : ""}.\n\nIts moment: ${context}\n\nJSON only.`;
  const reply = await client.complete({ label: o.label ?? "evaluate", system: EVALUATOR_SYSTEM(version), messages: [{ role: "user", content }], images, json: { name: "evaluation", schema: EVAL_SCHEMA }, effort: "medium", ...(o.nonce ? { nonce: o.nonce } : {}) } as Parameters<ModelClient["complete"]>[0]);
  return JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as Evaluation;
}

/** Spearman rank correlation (average ranks for ties). */
export function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const idx = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(xs.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
      for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a), rb = rank(b), n = a.length;
  const ma = ra.reduce((x, y) => x + y, 0) / n, mb = rb.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return Math.round((num / Math.sqrt(da * db)) * 1000) / 1000;
}

if (import.meta.main && process.argv.includes("--calibrate")) {
  const { makeClient } = await import("./labloop.ts");
  const arg = (k: string, d: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? (process.argv[i + 1] ?? d) : d;
  };
  const modelId = arg("model", "muse:muse-spark-1.3");
  const version = Number(arg("version", "2"));
  const anchors = !process.argv.includes("--no-anchors");
  const client = makeClient(modelId);
  const test = heldOut(30);
  const rejects = REJECTIONS.filter((r) => !ANCHORS.some((a) => a.id === r.id));
  const out: { id: string; bws: number | null; score: number | null; e?: Evaluation }[] = [];
  let next = 0;
  const items = [...test.map((v) => ({ id: v.id, bws: v.bws as number | null })), ...rejects.map((r) => ({ id: r.id, bws: null }))];
  const work = async () => {
    while (next < items.length) {
      const it = items[next++]!;
      try {
        const isReject = it.bws === null;
        const rest = isReject
          ? await rejectionPng(it.id)
          : existsSync(join(SHOT_DIR, it.id, "original-after.png")) && version >= 3
            ? await sheet([{ title: "At rest", png: new Uint8Array(readFileSync(join(SHOT_DIR, it.id, "original-rest.png"))) }, { title: "After taps", png: new Uint8Array(readFileSync(join(SHOT_DIR, it.id, "original-after.png"))) }], { columns: 2 })
            : new Uint8Array(readFileSync(join(SHOT_DIR, it.id, "original-rest.png")));
        const ctx = isReject ? REJECTIONS.find((r) => r.id === it.id)!.context : labContext(it.id);
        const e = await evaluate(client, rest, ctx, { version, anchors, label: "calibrate" });
        out.push({ ...it, score: weighted(e), e });
        console.error(`${it.id}: votes ${it.bws ?? "rejected"} · evaluator ${weighted(e)}`);
      } catch (err) {
        console.error(`${it.id}: failed ${(err as Error).message.slice(0, 120)}`);
        out.push({ ...it, score: null });
      }
    }
  };
  await Promise.all([work(), work()]);
  const scored = out.filter((x) => x.bws !== null && x.score !== null);
  const rho = spearman(scored.map((x) => x.bws!), scored.map((x) => x.score!));
  // The prompt was tuned looking at the even-ranked half; the odd half is the honest check.
  const ids = test.map((v) => v.id);
  const half = (k: number) => scored.filter((x) => ids.indexOf(x.id) % 2 === k);
  const rhoTune = spearman(half(0).map((x) => x.bws!), half(0).map((x) => x.score!));
  const rhoCheck = spearman(half(1).map((x) => x.bws!), half(1).map((x) => x.score!));
  console.log(`split: tuning half ${rhoTune} (n ${half(0).length}), check half ${rhoCheck} (n ${half(1).length})`);
  const sorted = out.filter((x) => x.score !== null).sort((a, b) => a.score! - b.score!);
  const rejRanks = rejects.map((r) => ({ id: r.id, rank: sorted.findIndex((x) => x.id === r.id) + 1, score: out.find((x) => x.id === r.id)?.score }));
  const tag = `${modelId.replace(/[^a-z0-9.-]+/gi, "_")}-v${version}${anchors ? "" : "-noanchors"}`;
  const dir = join(import.meta.dir, "..", "eval", "out", "evaluator");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `calibration-${tag}.json`), JSON.stringify({ modelId, version, anchors, rho, n: scored.length, rejRanks, out }, null, 1));
  console.log(`${tag}: Spearman ${rho} over ${scored.length} held-out lab tools · rejections ranked ${rejRanks.map((r) => `${r.id} ${r.rank}/${sorted.length} (${r.score})`).join(", ")} · mean score ${Math.round((sorted.reduce((n, x) => n + x.score!, 0) / sorted.length) * 100) / 100}`);
  await closeShoot();
}

/** One evaluator call for several candidates of the same tool, side by side: a score card for each. */
export async function evaluateBatch(client: ModelClient, pngs: Uint8Array[], context: string, o: { version?: number; label?: string; nonce?: number; exclude?: string } = {}): Promise<Evaluation[]> {
  if (pngs.length === 1) return [await evaluate(client, pngs[0]!, context, o)];
  const version = o.version ?? 3;
  const anchors = ANCHORS.filter((a) => a.id !== o.exclude);
  const images: string[] = [];
  const shots: string[] = [];
  for (const [i, a] of anchors.entries()) {
    images.push(`data:image/png;base64,${Buffer.from(await a.png()).toString("base64")}`);
    shots.push(`Example ${i + 1} (image ${i + 1}). Moment: ${a.context}\nEvaluation: ${JSON.stringify({ scores: a.e.scores, why: a.e.why, verdict: a.e.verdict })}`);
  }
  for (const p of pngs) images.push(`data:image/png;base64,${Buffer.from(p).toString("base64")}`);
  const schema = { type: "object", properties: { candidates: { type: "array", items: EVAL_SCHEMA } }, required: ["candidates"], additionalProperties: false };
  const content = `Calibration examples, scored by the owner's taste (pictures attached in order):\n\n${shots.join("\n\n")}\n\nNow evaluate ${pngs.length} candidate tools for the same moment, images ${anchors.length + 1} to ${anchors.length + pngs.length} in order. Score each on its own merits with the same scale, then return \`candidates\` in the same order (one evaluation per image).\n\nThe moment: ${context}\n\nJSON only.`;
  const reply = await client.complete({ label: o.label ?? "evaluate-batch", system: EVALUATOR_SYSTEM(version), messages: [{ role: "user", content }], images, json: { name: "evaluations", schema }, effort: "medium", ...(o.nonce ? { nonce: o.nonce } : {}) } as Parameters<ModelClient["complete"]>[0]);
  const out = (JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as { candidates: Evaluation[] }).candidates;
  if (out.length !== pngs.length) throw new Error(`batch evaluation returned ${out.length} of ${pngs.length}`);
  return out;
}
