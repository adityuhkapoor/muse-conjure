// The lab recipe (skills/LAB_RECIPE.md), reproduced as three passes by separate agents:
//
//   1. creative   a short brief (two to four lines, "interpret boldly"), the conventions, the
//                 drawing kit and three finished lab tools as quality references (source and
//                 pictures). Everything drawn; illustrated stand-ins, real interaction and motion.
//                 Render before and after scripted taps, the calibrated evaluator looks, the builder
//                 refines or pivots. No gate here beyond "it compiles and renders".
//   2. Meta-native a different agent with the Meta rules and reference pictures: keep each app's
//                 core interaction and personality; change chrome and presentation, not the idea.
//                 A lint reports departures (copy rules, contrast, layout, one primary).
//   3. correctness shared state, invariants, transitions and the gate (copy lint as warnings, 600 px
//                 where needed), done without changing the picture.
//
// The evaluator (separate client, calibrated anchors) scores after each step, so the report can say
// which pass moved quality most. With --wildcards, the run also builds three tools of its own
// choosing, each a different genre, for the same chats.
//
// CLI: bun src/labloop3.ts --model muse:muse-spark-1.3 [--evaluator muse:muse-spark-1.3] [--tag spark] [--only a,b] [--wildcards]

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, verify, warm, type Report } from "@muse/verify";
import { LAB_TOOLS, r4Tools, type LabTool } from "../eval/labmatch.ts";
import { buildSystem } from "./compose.ts";
import { apiText } from "./prompts.ts";
import { repairAll } from "./compose.ts";
import { applyEdits, EDIT_INSTRUCTIONS } from "./edits.ts";
import { evaluate, evaluateBatch, passes, weighted, type Evaluation } from "./evaluator.ts";
import { extractCode } from "./generate.ts";
import { ROOT } from "./kb.ts";
import { LAB_GATE, makeClient, nearestPorts, type Exemplar } from "./labloop.ts";
import { closeShoot, sheet, shoot } from "./look/shoot.ts";
import { Meter } from "./meter.ts";
import { CachedClient } from "./cache.ts";
import { chatContext } from "./prompts.ts";
import { tasteLint } from "./tastelint.ts";
import type { CompleteRequest, Member, ModelClient } from "./types.ts";

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const b64 = (png: Uint8Array) => `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
const EVAL_VERSION = Number(process.env.EVAL_VERSION ?? "3");

export type Step = { pass: "creative" | "meta" | "correct"; round: number; kind: string; renders: boolean; score: number | null; scores?: Evaluation["scores"]; kept: boolean; seconds: number };
export type Lab3Result = { id: string; model: string; evaluator: string; ok: boolean; source: string; brief: string; steps: Step[]; byPass: Record<string, number | null>; finalScore: number | null; finalScores: Evaluation["scores"] | null; passedThresholds: boolean; gateOk: boolean; tall: boolean; copyWarnings: number; lint: string[]; seconds: number; tokens: number; exemplars: string[]; spec?: string; specSeconds?: number; specWriter?: string; tokensIn?: number; tokensOut?: number; byLabel?: Meter["byLabel"]; byModel?: Meter["byModel"]; timing?: Record<string, number>; load?: number[]; levers?: Levers; typeFixes: number; candidateScores: number[][]; pivots: number; error?: string };

/** Mount the tool and take the views the evaluator sees: at rest, after taps, as a second member, dark. Throws when it does not render. */
async function views(source: string, members: Member[]): Promise<Uint8Array> {
  const light = await shoot(source, { members, scenes: ["rest", "played"], modes: ["light"] });
  const other = [...members.slice(1), members[0]!];
  const asOther = await shoot(source, { members: other, scenes: ["played"], modes: ["light"] });
  const dark = await shoot(source, { members, scenes: ["rest"], modes: ["dark"] });
  const all = [...light, ...asOther, ...dark];
  const errs = all.flatMap((s) => s.errors);
  if (all.some((s) => !s.png.length)) throw new Error(`does not render: ${errs[0] ?? "blank"}`);
  return sheet(
    [
      { title: "At rest · light", png: light[0]!.png },
      { title: "After taps · light", png: light[1]!.png },
      { title: `As ${other[0]!.name} after taps`, png: asOther[0]!.png },
      { title: "At rest · dark", png: dark[0]!.png },
    ],
    { columns: 4 },
  );
}

export type Levers = { bestOf: number; skeleton: boolean; craft: boolean };

/** The spec writer's prompt, lean on purpose: the format, the conventions, the look rules and two exemplar specs of other tools. */
const SPEC_EXAMPLES = ["concert", "trip-lock"];
const SPEC_SYSTEM = (() => {
  const fmt = read("scripts/labport/SPEC_WRITER.md");
  const sections = fmt.slice(fmt.indexOf("1. **The moment**"), fmt.indexOf("Keep each spec under"));
  return `You write the build spec for one small live tool that a fast, less capable model will implement. It works well only from a spec that has already made every decision: make them, once, correctly. There is no original to copy: invent the picture from the brief, delightful and specific, drawn (inline SVG, Canvas, the drawing kit), with the friends already part-way through.

The spec has these sections:

${sections}
Keep it under about 220 lines. Be exact rather than long. Do not write the tool itself.

# Conventions

${read("muse/CONVENTIONS.md")}

# Meta look rules

${read("the design notes")}

# Two finished specs of other tools, for the level of detail

${SPEC_EXAMPLES.map((id) => `## ${id}\n\n${read(`scripts/labport/specs/${id}.md`)}`).join("\n\n")}`;
})();
const SKELETON = readFileSync(join(import.meta.dir, "..", "prompts", "lab", "skeleton.tsx"), "utf8");

export async function labLoop3(t: LabTool, builderClient: ModelClient, evaluatorClient: ModelClient, o: { creativeRounds?: number; log?: (s: string) => void; levers?: Levers; roundDir?: string; salt?: number; specWriter?: ModelClient; amender?: ModelClient; effort?: "low" | "medium" | "high" } = {}): Promise<Lab3Result> {
  const levers: Levers = o.levers ?? { bestOf: 1, skeleton: false, craft: false };
  const t0 = performance.now();
  const builder = builderClient instanceof Meter ? builderClient : new Meter(builderClient);
  const evaluator = new Meter(evaluatorClient, builder);
  const log = o.log ?? (() => {});
  const maxCreative = o.creativeRounds ?? 8;
  // A salt separates independent runs of the same tool in the reply cache.
  const salt = (o.salt ?? 0) * 1_000_000;
  /** Local seconds by stage: gate runs and renders (model calls are timed in the meter). */
  const timing: Record<string, number> = { gate: 0, render: 0 };
  const timed = async <T,>(k: string, p: Promise<T>): Promise<T> => {
    const s = performance.now();
    try {
      return await p;
    } finally {
      timing[k] = Math.round(((timing[k] ?? 0) + (performance.now() - s) / 1000) * 10) / 10;
    }
  };
  const call = (label: string, r: Omit<CompleteRequest, "label">, nonce = 0) => builder.complete({ ...r, label, ...(nonce + salt ? { nonce: nonce + salt } : {}) } as CompleteRequest);
  const ex: Exemplar[] = nearestPorts(t);
  const exPng = ex.flatMap((e) => (e.png ? [b64(new Uint8Array(readFileSync(e.png)))] : []));
  const moment = `${chatContext(t)}`;
  const res: Lab3Result = { id: t.id, model: builderClient.id, evaluator: evaluatorClient.id, ok: false, source: "", brief: "", steps: [], byPass: {}, finalScore: null, finalScores: null, passedThresholds: false, gateOk: false, tall: false, copyWarnings: 0, lint: [], seconds: 0, tokens: 0, exemplars: ex.map((e) => e.id), levers, typeFixes: 0, candidateScores: [], pivots: 0 };
  const done = (extra: Partial<Lab3Result> = {}) => {
    Object.assign(res, extra);
    res.seconds = Math.round((performance.now() - t0) / 100) / 10;
    res.tokens = builder.tokensIn + builder.tokensOut;
    res.tokensIn = builder.tokensIn;
    res.tokensOut = builder.tokensOut;
    res.byLabel = builder.byLabel;
    res.byModel = { ...builder.byModel, ...evaluator.byModel };
    res.timing = timing;
    res.load = (require("node:os") as typeof import("node:os")).loadavg().map((x) => Math.round(x * 10) / 10);
    return res;
  };
  const judge = async (src: string, nonce: number, name?: string): Promise<Evaluation> => {
    const png = await timed("render", views(src, t.members));
    if (o.roundDir && name) {
      mkdirSync(o.roundDir, { recursive: true });
      writeFileSync(join(o.roundDir, `${name}.png`), png);
    }
    return evaluate(evaluator, png, `${t.brief}\n\nThe short brief it was built from:\n${res.brief}\n\n${moment}`, { version: EVAL_VERSION, label: "evaluate", nonce, exclude: t.id });
  };

  // The short brief: two to four lines, the lab's way.
  const briefFile = read("muse/BRIEFS.md").split("\n").slice(0, 40).join("\n");
  res.brief = (
    await call("brief", {
      system: `You write one entry for the taste lab's brief file: two to four lines, \`id · chat or surface · the moment · what Muse builds\`, with the specific human detail in it (a quoted line, a name, a number, the joke). Interpret boldly; the description is a floor, not a ceiling. Use only the members' names. Here is the start of the real brief file:\n\n${briefFile}`,
      messages: [{ role: "user", content: `${t.brief}\n\n${moment}\n\nWrite the entry for \`${t.id}\`.` }],
      effort: "medium",
    })
  ).trim();

  // ---- The split (arms B to D): a separate model writes a detailed build spec from the short brief.
  // Leak guard: the writer sees the conventions, the look rules, two exemplar specs of other tools
  // and the brief; never this tool's port, its existing spec or its pictures.
  let spec = "";
  if (o.specWriter) {
    const ss = performance.now();
    const writer = new Meter(o.specWriter, builder);
    spec = await writer.complete({
      label: "spec",
      system: SPEC_SYSTEM,
      messages: [{ role: "user", content: `The short brief:\n${res.brief}\n\n${moment}\n\nWrite the build spec for \`${t.id}\`. Invent the picture: layout numbers, what is drawn and how, exact copy, the seeded in-progress state with names and their words, motion and actions.` }],
      effort: "medium",
    } as CompleteRequest);
    res.spec = spec;
    res.specSeconds = Math.round((performance.now() - ss) / 1000);
    res.specWriter = o.specWriter.id;
    if (o.roundDir) {
      mkdirSync(o.roundDir, { recursive: true });
      writeFileSync(join(o.roundDir, "spec.md"), spec);
    }
    log(`${t.id}: spec written by ${o.specWriter.id} (${spec.length} chars, ${res.specSeconds} s)`);
  }

  // ---- Pass 1: creative.
  const conventions = read("muse/CONVENTIONS.md");
  const refs = ex.map((e) => `### ${e.id}: ${e.summary}\n\n\`\`\`tsx\n${e.source.trim()}\n\`\`\``).join("\n\n");
  const nearestHelpers = ex[0] ? ex[0].source.slice(0, Math.max(0, ex[0].source.indexOf("export default defineApp"))).trim() : "";
  const creativeSystem = `You build small custom apps that Muse sends into a group chat. Each must look like a distinct, delightful, custom-made thing with real interaction and motion, not a template. There are no real photos: draw illustrated stand-ins (shapes, gradients, simple characters) and make them charming, not placeholder grey boxes. Everything in the picture is drawn by you (inline SVG through h(), Canvas, the drawing kit); stock components only for chrome. It lives inside the chat: a rich message, compact and glanceable at rest (about 420 px tall), expanding in place when used, with the chat's real people as the social layer, already part-way through with their reasons and jokes.

Read fully before writing.

# Conventions (written for the earlier Rust lab; the stack here is the TypeScript API below; keep the design rules)

${conventions}

# The API and the drawing kit

${apiText()}

# Finished tools, as quality references (do not copy their ideas)

${refs}
${levers.skeleton ? `
# Start from this skeleton

It compiles and renders. Replace every part for the brief (types, seeded content, actions, and above all the drawing in \`picture\`), keeping its shape:

\`\`\`tsx
${SKELETON}
\`\`\`
` : ""}${levers.craft && nearestHelpers ? `
# Drawing helpers you may reuse and change

From the finished tool ${ex[0]!.id}: its faces, shapes, easing and layout helpers. Reuse or adapt any of them; keep your own idea.

\`\`\`tsx
${nearestHelpers}
\`\`\`
` : ""}
Reply with one \`\`\`tsx block holding the whole module. It must compile and render; the logic can be simple for now (a later pass makes it robust), but it must react to taps.`;

  /** Mechanical type and static fixes: compiler message in, edits out, up to 6 tries. Not a creative round. */
  const typeFix = async (src: string, nonce: number): Promise<string> => {
    for (let k = 0; k < 6; k++) {
      const tc = await timed("gate", verify(src, { skip: ["determinism", "invariants", "mutation", "render", "copy"], ...LAB_GATE }));
      if (tc.ok || (tc.stage !== "typecheck" && tc.stage !== "static")) return src;
      res.typeFixes++;
      const msg = tc.failures.slice(0, 20).map((f) => `- line ${f.line ?? "?"}: ${f.rule}: ${f.message.slice(0, 220)}`).join("\n");
      const reply = await call("type-fix", { system: "You fix TypeScript compile errors in a small app with the smallest edits. Do not change what it draws or does.", messages: [{ role: "user", content: `Compiler errors:\n${msg}\n\n\`\`\`tsx\n${src.trim()}\n\`\`\`\n\n${EDIT_INSTRUCTIONS}` }] }, nonce * 10 + k + 1);
      src = applyEdits(src, reply) ?? src;
    }
    return src;
  };
  /** Render fixes (a view that throws or stays blank), up to 3, after the types are clean. */
  const renderable = async (src: string, nonce: number): Promise<{ src: string; png: Uint8Array | null }> => {
    for (let k = 0; k < 4; k++) {
      src = await typeFix(src, nonce * 10 + k);
      try {
        return { src, png: await timed("render", views(src, t.members)) };
      } catch (err) {
        if (k === 3) break;
        const msg = (err as Error).message.slice(0, 400);
        const fixed = await call("render-fix", { system: creativeSystem, messages: [{ role: "user", content: `Your app compiles but does not render: ${msg}\n\n\`\`\`tsx\n${src.trim()}\n\`\`\`\n\n${EDIT_INSTRUCTIONS}` }] }, nonce * 10 + k + 1);
        src = applyEdits(src, fixed) ?? src;
      }
    }
    return { src, png: null };
  };
  const ctxText = `${t.brief}\n\nThe short brief it was built from:\n${res.brief}\n\n${moment}`;
  const look = async (src: string, png: Uint8Array, name: string, nonce: number): Promise<Evaluation | null> => {
    if (o.roundDir) {
      mkdirSync(o.roundDir, { recursive: true });
      writeFileSync(join(o.roundDir, `${name}.png`), png);
    }
    try {
      return await evaluate(evaluator, png, ctxText, { version: EVAL_VERSION, label: "evaluate", nonce: nonce + salt, exclude: t.id });
    } catch {
      return null;
    }
  };
  /** n independent candidates from the same prompt, each made to render and evaluated; best first. */
  const candidates = async (n: number, user: string, images: string[], label: string, nonceBase: number) => {
    const out: { src: string; e: Evaluation; score: number; k: number }[] = [];
    // Generation is remote and cheap: ask for all candidates at once, then render and judge one by one.
    const drafts = await Promise.allSettled(
      Array.from({ length: n }, (_, k) => {
        const nudge = k === 0 ? "" : `\n\nThis is candidate ${k + 1} of ${n}: choose a different visual idea from the most obvious one.`;
        return call(label, { system: creativeSystem, messages: [{ role: "user", content: user + nudge }], images, ...(o.effort ? { effort: o.effort } : {}) }, nonceBase + k);
      }),
    );
    const ready = await Promise.all(
      drafts.map(async (d, k) => {
        if (d.status !== "fulfilled") {
          log(`${t.id}: candidate ${k + 1} failed ${String((d as PromiseRejectedResult).reason).slice(0, 80)}`);
          return null;
        }
        try {
          const r = await renderable(extractCode(d.value), nonceBase + k);
          if (!r.png) return null;
          if (o.roundDir) {
            mkdirSync(o.roundDir, { recursive: true });
            writeFileSync(join(o.roundDir, `${label}-${nonceBase}-c${k + 1}.png`), r.png);
          }
          return { src: r.src, png: r.png, k };
        } catch (err) {
          log(`${t.id}: candidate ${k + 1} failed ${(err as Error).message.slice(0, 80)}`);
          return null;
        }
      }),
    );
    const ok = ready.filter((x): x is { src: string; png: Uint8Array; k: number } => x !== null);
    // One evaluator call sees every candidate side by side.
    let evals: Evaluation[] = [];
    for (let i = 0; i < ok.length; i += 8) {
      try {
        evals.push(...(await evaluateBatch(evaluator, ok.slice(i, i + 8).map((c) => c.png), ctxText, { version: EVAL_VERSION, label: "evaluate-batch", nonce: nonceBase + i + salt, exclude: t.id })));
      } catch (err) {
        log(`${t.id}: batch evaluation failed (${(err as Error).message.slice(0, 80)}); one by one`);
        for (const c of ok.slice(i, i + 8)) {
          const e = await look(c.src, c.png, `${label}-${nonceBase}-c${c.k + 1}`, nonceBase + c.k);
          if (e) evals.push(e);
          else evals.push(null as unknown as Evaluation);
        }
      }
    }
    ok.forEach((c, i) => {
      const e = evals[i];
      if (e) out.push({ src: c.src, e, score: weighted(e), k: c.k });
    });
    out.sort((x, y) => y.score - x.score);
    res.candidateScores.push(out.map((c) => c.score));
    return out;
  };

  const step = (s: Omit<Step, "seconds">, started: number) => res.steps.push({ ...s, seconds: Math.round((performance.now() - started) / 1000) });
  let rs = performance.now();
  const first = await candidates(levers.bestOf, spec ? `Implement this build spec exactly; every decision is made in it.\n\n${spec}\n\n${moment}` : `The brief:\n${res.brief}\n\n${moment}\n\nBuild it.`, exPng, "create", 1);
  if (!first.length) return done({ error: "nothing rendered in the creative pass" });
  let best = { source: first[0]!.src, score: first[0]!.score, e: first[0]!.e };
  res.byPass.firstDraft = first.find((c) => c.k === 0)?.score ?? first[0]!.score;
  res.byPass.bestOfFirst = best.score;
  step({ pass: "creative", round: 0, kind: `create (best of ${first.length})`, renders: true, score: best.score, scores: best.e.scores, kept: true }, rs);
  log(`${t.id}: creative round 0 ${first.map((c) => c.score).join(" / ")} best ${best.score}`);
  let since = 0;
  let lastE = best.e;
  for (let round = 1; round < maxCreative; round++) {
    if ((round >= 5 && since >= 3) || (best.score >= 4.6 && round >= 3)) break;
    rs = performance.now();
    const pics = await timed("render", views(best.source, t.members)).catch(() => null);
    const ev = lastE;
    const user = `The brief:\n${res.brief}\n\n${moment}\n\nYour best version so far is below, with its pictures (at rest, after taps, as another member, dark) attached first. A separate evaluator scored it ${best.score} of 5 (${JSON.stringify(ev.scores)}):\n${Object.entries(ev.why).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\nFixes it asked for:\n${ev.fixes.map((f, i) => `${i + 1}. [${f.scene}] ${f.where}: ${f.problem}. ${f.fix}`).join("\n")}\n${ev.pivot ? `It suggests this pivot if the idea is a dead end: ${ev.pivot}\n` : ""}Rounds without a better score: ${since}.\n\nLook at the pictures. Decide: refine this idea, or throw it away and build a different visual idea for the same brief. Start your reply with one line, REFINE or PIVOT, then the whole module in one \`\`\`tsx block.\n\n\`\`\`tsx\n${best.source.trim()}\n\`\`\``;
    const images = [...(pics ? [b64(pics)] : []), ...exPng];
    let reply: string;
    if (spec && o.amender) {
      // The critique goes back as a spec amendment written by the spec side, not as free text.
      const amendment = await new Meter(o.amender, builder).complete({
        label: "amend",
        system: SPEC_SYSTEM,
        messages: [{ role: "user", content: `The build spec:\n${spec}\n\nA separate evaluator judged the implementation ${best.score} of 5 (${JSON.stringify(ev.scores)}):\n${Object.entries(ev.why).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\nFixes:\n${ev.fixes.map((f, i) => `${i + 1}. ${f.where}: ${f.problem}. ${f.fix}`).join("\n")}\n\nWrite a spec amendment: numbered, exact changes to the spec (layout numbers, drawing, copy, state) that fix these. Under 40 lines.` }],
        effort: "medium",
        nonce: round + salt,
      } as CompleteRequest);
      spec = `${spec}\n\n## Amendment ${round}\n\n${amendment}`;
      reply = "REFINE\n" + (await call("iterate", { system: creativeSystem, messages: [{ role: "user", content: `Apply this spec amendment to your tool exactly; keep everything else.\n\n${amendment}\n\nThe full spec for reference:\n${spec}\n\n\`\`\`tsx\n${best.source.trim()}\n\`\`\`\n\nReply with the whole module in one \`\`\`tsx block.` }], images }, round * 100));
    } else reply = await call("iterate", { system: creativeSystem, messages: [{ role: "user", content: user }], images }, round * 100);
    const pivot = /^\s*PIVOT/i.test(reply);
    let cands: { src: string; e: Evaluation; score: number }[] = [];
    const r0 = await renderable(extractCode(reply), round * 100);
    if (r0.png) {
      const e0 = await look(r0.src, r0.png, `round-${round}`, round * 100);
      if (e0) cands.push({ src: r0.src, e: e0, score: weighted(e0) });
    }
    // At a pivot, best of N again: more candidates for the new idea.
    if (pivot && levers.bestOf > 1) cands = [...cands, ...(await candidates(levers.bestOf - 1, user.replace("Decide: refine this idea, or throw it away and build a different visual idea for the same brief. Start your reply with one line, REFINE or PIVOT, then the whole module in one \`\`\`tsx block.", "Throw this idea away and build a different visual idea for the same brief. Reply with the whole module in one \`\`\`tsx block."), images, "pivot", round * 100 + 1))];
    cands.sort((x, y) => y.score - x.score);
    const top = cands[0];
    const better = !!top && top.score > best.score;
    if (top) lastE = top.e;
    if (better) {
      best = { source: top!.src, score: top!.score, e: top!.e };
      since = 0;
    } else since++;
    if (pivot) res.pivots++;
    step({ pass: "creative", round, kind: pivot ? `pivot (best of ${cands.length})` : "refine", renders: !!top, score: top?.score ?? null, ...(top ? { scores: top.e.scores } : {}), kept: better }, rs);
    log(`${t.id}: creative round ${round} ${pivot ? "pivot" : "refine"} ${top?.score ?? "no render"}${better ? " best" : ""}`);
  }
  res.byPass.creative = best.score;

  // ---- Pass 2: Meta-native, by a different agent.
  const metaSystem = `You make small chat apps Meta-native. Keep each app's core interaction and personality; change chrome and presentation, not the idea. Use the first-party components for chrome (Button, OptionRow, Facepile, Avatar, CardHeader, Rsvp, Toast, Progress), one blue primary per card, flat cards with no outer slab, sentence case, counts not percentages, celebration by a reaction burst and a warm line rather than confetti. The drawn picture stays.\n\n# Meta design rules\n\n${read("the design notes")}\n\n# The API\n\n${apiText()}`;
  const ms = performance.now();
  const lint = await timed("gate", verify(best.source, { skip: ["determinism", "invariants", "mutation"], rules: {}, all: true }));
  const departures = [...lint.failures, ...lint.warnings].filter((f) => /sentence|caps|exclamation|button|percent|phrase|emoji|color|literal|contrast|primary|hit-area|clipped|overlap|outside|too-tall|axe/.test(f.rule)).slice(0, 12);
  const pics = await timed("render", views(best.source, t.members)).catch(() => null);
  const metaReply = await call("meta", {
    system: metaSystem,
    messages: [{ role: "user", content: `Make this app Meta-native. Its pictures are attached first, then reference pictures of finished Meta-native tools.\n\nDepartures the lint reports:\n${departures.map((f) => `- ${f.rule}: ${f.message.slice(0, 200)}`).join("\n") || "- none"}\n\n\`\`\`tsx\n${best.source.trim()}\n\`\`\`\n\nReply with one \`\`\`tsx block holding the whole module.` }],
    images: [...(pics ? [b64(pics)] : []), ...exPng],
  });
  let metaSource = extractCode(metaReply);
  let metaEval: Evaluation | null = null;
  try {
    metaEval = await judge(metaSource, 900, "meta");
  } catch {
    metaEval = null;
  }
  const metaScore = metaEval ? weighted(metaEval) : null;
  const keepMeta = metaEval !== null && metaScore! >= best.score - 0.1;
  step({ pass: "meta", round: 0, kind: "meta-native", renders: metaEval !== null, score: metaScore, ...(metaEval ? { scores: metaEval.scores } : {}), kept: keepMeta }, ms);
  log(`${t.id}: meta-native ${metaScore ?? "no render"}${keepMeta ? " kept" : " (kept the creative version)"}`);
  let after2 = keepMeta ? { source: metaSource, score: metaScore!, e: metaEval! } : best;
  res.byPass.meta = after2.score;

  // ---- Pass 3: correctness, without changing the picture.
  const cs = performance.now();
  const correctSystem = `${buildSystem(["state-that-verifies"])}\n\nThis pass makes an app robust without changing what it looks like: shared state, invariants, transitions, arbitrary and the member rules. Do not change the picture, the layout, the copy or the idea.`;
  const budget = t.surface === "story" ? 600 : 420;
  const check = async (src: string): Promise<Report> => {
    const r = await timed("gate", verify(src, { ...LAB_GATE, heightBudget: budget }));
    if (!r.ok && budget < 600 && r.failures.every((x) => x.rule === "too-tall")) {
      const tall = await timed("gate", verify(src, { ...LAB_GATE, heightBudget: 600 }));
      if (tall.ok) res.tall = true;
      return tall;
    }
    return r;
  };
  let src = after2.source;
  let report = await check(src);
  if (!report.ok)
    src = extractCode(await call("correct", { system: correctSystem, messages: [{ role: "user", content: `Make this app pass the gate: correct shared state, strong invariants and transitions, an arbitrary that exercises every action, members from ctx.members. Keep the view exactly as it looks.\n\nThe gate says: ${report.stage}: ${report.failures.slice(0, 3).map((f) => `${f.rule}: ${f.message.slice(0, 200)}`).join("; ")}\n\n\`\`\`tsx\n${src.trim()}\n\`\`\`\n\nReply with one \`\`\`tsx block holding the whole module.` }] }));
  report = await check(src);
  for (let k = 0; !report.ok && k < 6; k++) {
    log(`${t.id}: correctness repair ${report.stage} ${report.failures[0]?.rule ?? ""}`);
    const prompt = repairAll(src, report);
    const edited = applyEdits(src, await call("correct-repair", { system: correctSystem, messages: [{ role: "user", content: prompt.replace("Reply with the whole fixed module in one ```tsx block and nothing else.", EDIT_INSTRUCTIONS) }] }, k + 1));
    src = edited ?? extractCode(await call("correct-repair-whole", { system: correctSystem, messages: [{ role: "user", content: prompt }] }, k + 1));
    report = await check(src);
  }
  res.gateOk = report.ok;
  let finalEval: Evaluation | null = null;
  try {
    finalEval = await judge(src, 990, "final");
  } catch {}
  const finalScore = finalEval ? weighted(finalEval) : null;
  step({ pass: "correct", round: 0, kind: "gate", renders: finalEval !== null, score: finalScore, ...(finalEval ? { scores: finalEval.scores } : {}), kept: report.ok }, cs);
  res.byPass.correct = finalScore;
  log(`${t.id}: correctness ${report.ok ? "gate ok" : `gate failed at ${report.stage}`} · ${finalScore}`);
  const lintNow = report.ok ? await tasteLint(src, t.members, (await shoot(src, { members: t.members, scenes: ["rest"], modes: ["light"] }).catch(() => []))[0]) : [];
  return done({
    ok: report.ok,
    source: src,
    finalScore,
    finalScores: finalEval?.scores ?? null,
    passedThresholds: finalEval ? passes(finalEval) : false,
    copyWarnings: report.warnings.filter((w) => /sentence-case|all-caps|no-exclamation|button-words|no-percent|banned-phrase|no-emoji-button/.test(w.rule)).length,
    lint: lintNow.map((l) => l.rule),
  });
}

const OUT = join(import.meta.dir, "..", "eval", "out", "lab-match");

/** A small index.html per run folder: every tool's round pictures in order, with scores. */
export function writeIndex(dir: string) {
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  const tools = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const parts = tools.map((f) => {
    const r = JSON.parse(readFileSync(join(dir, f), "utf8")) as Lab3Result;
    const sub = join(dir, r.id);
    const pngs = existsSync(sub) ? readdirSync(sub).filter((p) => p.endsWith(".png")).sort((a, b) => statTime(join(sub, a)) - statTime(join(sub, b))) : [];
    return `<section><h2>${r.id}</h2><p>${r.ok ? "gate ok" : "gate failed"} · first ${r.byPass.firstDraft ?? "-"} · best of first ${r.byPass.bestOfFirst ?? "-"} · creative ${r.byPass.creative ?? "-"} · meta ${r.byPass.meta ?? "-"} · final ${r.byPass.correct ?? "-"} · ${Math.round(r.seconds / 60)} min</p><p>${(r.brief || "").replace(/</g, "&lt;")}</p>${pngs.map((p) => `<figure><figcaption>${p}</figcaption><img src="${r.id}/${p}"></figure>`).join("")}${existsSync(join(dir, `${r.id}.rest-light.png`)) ? `<figure><figcaption>final at rest</figcaption><img src="${r.id}.rest-light.png"></figure>` : ""}</section>`;
  });
  writeFileSync(join(dir, "index.html"), `<!doctype html><meta charset="utf-8"><title>${dir.split("/").pop()}</title><style>body{font:14px system-ui;margin:24px;background:#F0F2F5}section{background:#fff;border-radius:12px;padding:16px;margin-bottom:24px}figure{display:inline-block;margin:8px;vertical-align:top}img{max-width:820px;border:1px solid #ddd;border-radius:8px}</style>${parts.join("")}`);
}
const statTime = (p: string) => (require("node:fs") as typeof import("node:fs")).statSync(p).mtimeMs;

if (import.meta.main) {
  const arg = (k: string, d: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? (process.argv[i + 1] ?? d) : d;
  };
  const modelId = arg("model", "muse:muse-spark-1.3-contributor");
  const evalId = arg("evaluator", "muse:muse-spark-1.3");
  const tag = arg("tag", "spark");
  const only = arg("only", "").split(",").filter(Boolean);
  const levers: Levers = { bestOf: Number(arg("bestof", "1")), skeleton: process.argv.includes("--skeleton"), craft: process.argv.includes("--craft") };
  // --spec wonder|spark: who writes the spec; amendments by the same writer except Wonder (spec only).
  const specArm = arg("spec", "");
  const { BudgetedMuse } = await import("./budget.ts");
  const specWriter = specArm === "wonder" ? new CachedClient(new BudgetedMuse("muse-wonder-1.0", join(OUT, "wonder-spend.json"), 5, [4, 20])) : specArm === "spark" ? makeClient("muse:muse-spark-1.3-contributor") : undefined;
  const amender = specArm === "spark" ? specWriter : undefined;
  const pool = arg("set", "lab") === "r4" ? r4Tools() : LAB_TOOLS;
  const tools = only.length ? only.map((id) => pool.find((x) => x.id === id)!).filter(Boolean) : pool;
  await warm();
  for (const t of tools) {
    const dir = join(OUT, tag);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${t.id}.json`);
    if (existsSync(file)) continue;
    try {
      writeFileSync(`${file}.claim`, String(process.pid), { flag: "wx" });
    } catch {
      continue;
    }
    let r: Lab3Result;
    try {
      r = await labLoop3(t, new Meter(makeClient(modelId)), makeClient(evalId), { levers, ...(arg("effort", "") ? { effort: arg("effort", "medium") as "low" | "medium" } : {}), ...(specWriter ? { specWriter } : {}), ...(amender ? { amender } : {}), roundDir: join(OUT, tag, t.id), salt: Number(arg("salt", "0")), creativeRounds: Number(arg("rounds", "12")), log: (s) => console.error(`${new Date().toTimeString().slice(0, 5)} ${tag} ${s}`) });
    } catch (e) {
      r = { id: t.id, model: modelId, evaluator: evalId, ok: false, source: "", brief: "", steps: [], byPass: {}, finalScore: null, finalScores: null, passedThresholds: false, gateOk: false, tall: false, copyWarnings: 0, lint: [], seconds: 0, tokens: 0, exemplars: [], typeFixes: 0, candidateScores: [], pivots: 0, error: (e as Error).message.slice(0, 300) };
    }
    if (r.source) {
      writeFileSync(join(dir, `${t.id}.tsx`), r.source);
      try {
        const shots = await shoot(r.source, { members: t.members, scenes: ["rest", "played"], modes: ["light", "dark"] });
        for (const s of shots) if (s.png.length) writeFileSync(join(dir, `${t.id}.${s.scene}-${s.mode}.png`), s.png);
      } catch {}
    }
    writeFileSync(file, JSON.stringify(r, null, 1));
    rmSync(`${file}.claim`, { force: true });
    writeIndex(join(OUT, tag));
    console.error(`${r.ok ? "pass" : "FAIL"} ${tag} ${t.id} · first ${r.byPass.firstDraft ?? "-"} > creative ${r.byPass.creative ?? "-"} > meta ${r.byPass.meta ?? "-"} > final ${r.byPass.correct ?? "-"} · ${Math.round(r.seconds / 60)} min · ~${Math.round(r.tokens / 1000)}k tok${r.error ? ` · ${r.error}` : ""}`);
  }
  await closeShoot();
  await shutdown();
}
