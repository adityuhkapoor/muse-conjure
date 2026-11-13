// The lab match loop, rebuilt on the published harness findings ("Harness design for
// long-running application development": generator and a separate calibrated evaluator, four
// weighted criteria with hard thresholds, the evaluator using the live page, 5 to 15 rounds with a
// refine-or-pivot decision; "Harness engineering": taste as mechanical lints whose messages
// carry the fix, and an app the agent can boot, screenshot and inspect itself).
//
//   plan       a lab-style brief (moment, visual idea as a physical metaphor, seeded state), then a
//              contract: what will be on screen and how done is judged; the evaluator amends it
//   design     a card committing to one drawn idea; a list of rows with a button is rejected
//   build      from brief, contract, card, full conventions and the 3 nearest lab ports (source,
//              example, pictures)
//   gate       correctness stages required; copy lint as warnings; 600 px where the idea needs it
//   taste lint hollow state, form not a picture, stripped voice: each message is the fix
//   evaluate   a separate evaluator (never the builder's context), calibrated with scored lab
//              anchors, looks at the live tool: at rest, after taps, as a second member, dark
//   decide     the builder reads the evaluation, may call tools (render, gate, read an exemplar),
//              then refines with edits or pivots to a new idea; the best version is kept
//
// Rounds: at least 5, at most 10, stopping after 3 rounds without a better score once past 5.
//
// CLI: bun src/labloop2.ts --model muse:muse-spark-1.3 [--evaluator muse:muse-spark-1.3] [--tag spark2] [--only a,b]

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, verify, warm, type Report } from "@muse/verify";
import { LAB_TOOLS, type LabTool } from "../eval/labmatch.ts";
import { buildSystem, CARD_SCHEMA, repairAll, type Card } from "./compose.ts";
import { applyEdits, EDIT_INSTRUCTIONS } from "./edits.ts";
import { CRITERIA_TEXT, evaluate, passes, weighted, type Evaluation } from "./evaluator.ts";
import { extractCode } from "./generate.ts";
import { exampleBriefs, LAB_GATE, lookRules, makeClient, nearestPorts, rowsOnly, type Exemplar } from "./labloop.ts";
import { closeShoot, sheet, shoot, type Shot } from "./look/shoot.ts";
import { Meter } from "./meter.ts";
import { chatContext } from "./prompts.ts";
import { tasteLint, type TasteFinding } from "./tastelint.ts";
import type { CompleteRequest, Member, ModelClient } from "./types.ts";

const parseJson = <T>(t: string): T => JSON.parse(t.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
const b64 = (png: Uint8Array) => `data:image/png;base64,${Buffer.from(png).toString("base64")}`;

export type Round = { round: number; kind: "build" | "refine" | "pivot"; ok: boolean; lint: string[]; score: number | null; scores?: Evaluation["scores"]; pass: boolean; kept: boolean; tools: string[]; seconds: number };
export type Lab2Result = {
  id: string;
  model: string;
  evaluator: string;
  ok: boolean;
  source: string;
  best: number | null;
  bestScores: Evaluation["scores"] | null;
  passed: boolean;
  rounds: Round[];
  brief: string;
  contract: string;
  card: Card | null;
  exemplars: string[];
  rejectedCards: number;
  pivots: number;
  tall: boolean;
  copyWarnings: number;
  seconds: number;
  tokens: number;
  error?: string;
  present: Record<string, boolean>;
};

const DECIDE_SCHEMA = {
  type: "object",
  properties: { decision: { type: "string", enum: ["refine", "pivot"] }, reason: { type: "string" }, tools: { type: "array", items: { type: "string" } }, new_idea: { type: "string" } },
  required: ["decision", "reason", "tools", "new_idea"],
  additionalProperties: false,
};

/** The views the evaluator sees: the live tool at rest, after taps, as a second member, and dark. */
async function views(source: string, members: Member[]): Promise<{ png: Uint8Array; rest: Shot | undefined; errors: string[] }> {
  const light = await shoot(source, { members, scenes: ["rest", "played"], modes: ["light"] });
  const other = [...members.slice(1), members[0]!];
  const asOther = await shoot(source, { members: other, scenes: ["played"], modes: ["light"] });
  const dark = await shoot(source, { members, scenes: ["rest"], modes: ["dark"] });
  const cells = [
    { title: "At rest · light", png: light[0]!.png },
    { title: "After taps · light", png: light[1]!.png },
    { title: `As ${other[0]!.name} after taps`, png: asOther[0]!.png },
    { title: "At rest · dark", png: dark[0]!.png },
  ];
  const png = await sheet(cells, { columns: 4 });
  return { png, rest: light[0], errors: [...light, ...asOther, ...dark].flatMap((s) => s.errors) };
}

export async function labLoop2(t: LabTool, builderClient: ModelClient, evaluatorClient: ModelClient, o: { minRounds?: number; maxRounds?: number; log?: (s: string) => void } = {}): Promise<Lab2Result> {
  const t0 = performance.now();
  const builder = builderClient instanceof Meter ? builderClient : new Meter(builderClient);
  const evaluator = evaluatorClient instanceof Meter ? evaluatorClient : new Meter(evaluatorClient, builder);
  const log = o.log ?? (() => {});
  const minR = o.minRounds ?? 5, maxR = o.maxRounds ?? 10;
  const call = (label: string, r: Omit<CompleteRequest, "label">, nonce = 0) => builder.complete({ ...r, label, ...(nonce ? { nonce } : {}) } as CompleteRequest);
  const rules = lookRules();
  const moment = `${t.brief}\n\n${chatContext(t)}`;
  const ex: Exemplar[] = nearestPorts(t);
  const exPng = ex.flatMap((e) => (e.png ? [b64(new Uint8Array(readFileSync(e.png)))] : []));
  const res: Lab2Result = {
    id: t.id, model: builderClient.id, evaluator: evaluatorClient.id, ok: false, source: "", best: null, bestScores: null, passed: false, rounds: [], brief: "", contract: "", card: null,
    exemplars: ex.map((e) => e.id), rejectedCards: 0, pivots: 0, tall: false, copyWarnings: 0, seconds: 0, tokens: 0,
    present: { brief: true, fullConventions: true, exemplars: ex.length > 0, exemplarPictures: exPng.length > 0, drawnOnly: true, eyes: true, copyLintWarnOnly: true, tallBudget: true, calibratedEvaluator: true, separateEvaluator: evaluatorClient !== builderClient, weightedCriteria: true, liveViews: true, refineOrPivot: true, tasteLints: true, builderTools: true },
  };
  const done = (extra: Partial<Lab2Result> = {}) => {
    Object.assign(res, extra);
    res.seconds = Math.round((performance.now() - t0) / 100) / 10;
    res.tokens = builder.tokensIn + builder.tokensOut;
    return res;
  };

  // Plan: the brief, then the contract the evaluator amends.
  res.brief = await call("plan-brief", {
    system: `You write the brief for one small live tool that Muse will build for a group, the way the taste lab's briefs were written: a specific moment, the named friends and what each said or did and why, a running joke, the one visual idea as a physical metaphor, the seeded in-progress state (who already did what, with reasons in their own words), and the one satisfying moment. Invented human detail is wanted when it fits the chat and uses only the members' names. 120 to 220 words, plain text.\n\nReal lab briefs, for the voice and density:\n\n${exampleBriefs()}`,
    messages: [{ role: "user", content: `${moment}\n\nWrite the brief.` }],
    effort: "medium",
  });
  const contract0 = await call("plan-contract", {
    system: `You write a short contract for a tool before code: 5 to 8 lines saying exactly what will be on screen at rest (the picture, who is in it, what text), what one tap does, and how "done" will be judged against these criteria:\n${CRITERIA_TEXT}`,
    messages: [{ role: "user", content: `${moment}\n\nThe brief:\n${res.brief}\n\nWrite the contract.` }],
    effort: "low",
  });
  res.contract = await evaluator.complete({
    label: "contract-review",
    system: `You are the evaluator who will judge this tool later. Read the contract and return it amended so it is specific enough to judge: name the picture, the seeded friends, the first action and what would make you fail it. Plain text, under 10 lines.\n\nCriteria:\n${CRITERIA_TEXT}`,
    messages: [{ role: "user", content: `${moment}\n\nThe contract:\n${contract0}` }],
    effort: "low",
  });

  const designUser = (pivot: string) =>
    `${moment}\n\nThe brief:\n${res.brief}\n\nThe agreed contract:\n${res.contract}\n\nThree finished lab tools for the drawing density and craft to match (pictures attached; do not copy their ideas):\n${ex.map((e) => `- ${e.id}: ${e.summary}`).join("\n")}\n\n${pivot ? `Pivot: the last idea was thrown away. Design a different visual idea: ${pivot}\n\n` : ""}Write the design card. JSON only.`;
  const designSystem = `You design one small live tool for Muse inside Messenger and Facebook, for a taste test. Commit to one visual idea drawn freely (inline SVG through h(), Canvas, the art kit), with people placed inside the picture, and the seeded in-progress state from the brief. A list of option rows with a button is rejected. Judged on:\n${CRITERIA_TEXT}\n\nIn \`content\`, every seeded item with \`from\` set to the brief line it grows from. Labels in sentence case.\n\n${rules}`;
  const design = async (pivot: string, nonce: number): Promise<Card | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const c = parseJson<Card>(await call("design", { system: designSystem, messages: [{ role: "user", content: (attempt ? "Your last card was a list of rows with a button; that is rejected. Draw the moment.\n\n" : "") + designUser(pivot) }], images: exPng, json: { name: "card", schema: CARD_SCHEMA }, effort: "medium" }, nonce * 10 + attempt));
      if (!rowsOnly(c)) return c;
      res.rejectedCards++;
    }
    return null;
  };

  const system = `${buildSystem(["state-that-verifies"])}\n\n# How it is judged\n\n${CRITERIA_TEXT}\n\n# Rules for the look\n\n${rules}`;
  const exCode = ex.map((e) => `### ${e.id}: ${e.summary}\n\n\`\`\`tsx\n${e.source.trim()}\n\`\`\`${e.example ? `\n\nExample parameters:\n\n\`\`\`ts\n${e.example.trim()}\n\`\`\`` : ""}`).join("\n\n");
  const build = async (card: Card, nonce: number) =>
    extractCode(
      await call("build", {
        system,
        messages: [{ role: "user", content: `Build the tool from this design card. Seed the in-progress state from the brief in init (find each friend in ctx.members by name). Put the brief's facts and the seeded content in one const near the top.\n\n${moment}\n\nThe brief:\n${res.brief}\n\nThe contract:\n${res.contract}\n\nThe design card:\n\`\`\`json\n${JSON.stringify(card, null, 1)}\n\`\`\`\n\nThree finished lab tools that pass the gate, for the drawing density and craft to match. Do not copy their idea, layout or content:\n\n${exCode}\n\nReply with one \`\`\`tsx block and nothing else.` }],
        images: exPng,
      }, nonce),
    );

  const budget = t.surface === "story" ? 600 : 420;
  const check = async (src: string): Promise<Report> => {
    const r = await verify(src, { ...LAB_GATE, heightBudget: budget });
    if (!r.ok && budget < 600 && r.failures.every((x) => x.rule === "too-tall")) {
      const tall = await verify(src, { ...LAB_GATE, heightBudget: 600 });
      if (tall.ok) res.tall = true;
      return tall;
    }
    return r;
  };
  const patch = async (label: string, prompt: string, current: string, nonce: number): Promise<string> => {
    const WHOLE = "Reply with the whole fixed module in one ```tsx block and nothing else.";
    try {
      const edited = applyEdits(current, await call(label, { system, messages: [{ role: "user", content: prompt.replace(WHOLE, EDIT_INSTRUCTIONS) }] }, nonce));
      if (edited) return edited;
    } catch {}
    return extractCode(await call(`${label}-whole`, { system, messages: [{ role: "user", content: prompt }] }, nonce));
  };
  /** Gate, then taste lints; repairs with each message as the remediation, up to 4 times. */
  const harden = async (src: string, nonce: number): Promise<{ source: string; report: Report; lint: TasteFinding[]; rest?: Shot }> => {
    let report = await check(src);
    let lint: TasteFinding[] = [];
    let rest: Shot | undefined;
    for (let k = 0; k < 5; k++) {
      if (report.ok) {
        try {
          rest = (await shoot(src, { members: t.members, scenes: ["rest"], modes: ["light"] }))[0];
        } catch {}
        lint = await tasteLint(src, t.members, rest);
        if (!lint.length || k === 4) break;
        log(`${t.id}: taste lint ${lint.map((l) => l.rule).join(", ")}`);
        src = await patch("lint-fix", `Your tool passes the gate but fails these taste checks. Each message says how to fix it:\n\n${lint.map((l) => `- ${l.message}`).join("\n")}\n\nThe tool:\n\n\`\`\`tsx\n${src.trim()}\n\`\`\`\n\nReply with the whole fixed module in one \`\`\`tsx block and nothing else.`, src, nonce * 100 + k);
      } else {
        if (k === 4) break;
        log(`${t.id}: repair ${report.stage} ${report.failures[0]?.rule ?? ""}`);
        src = await patch("repair", repairAll(src, report), src, nonce * 100 + 50 + k);
      }
      report = await check(src);
    }
    return { source: src, report, lint, ...(rest ? { rest } : {}) };
  };

  // Builder tools, callable by name in the decide step.
  const tool = async (name: string, src: string): Promise<{ text: string; images: string[] }> => {
    if (name === "gate") {
      const r = await check(src);
      return { text: `Gate: ${r.ok ? "pass" : `fail at ${r.stage}: ${r.failures.slice(0, 4).map((f) => `${f.rule}: ${f.message.slice(0, 160)}`).join("; ")}`}${r.warnings.length ? `; warnings: ${r.warnings.slice(0, 6).map((w) => w.rule).join(", ")}` : ""}`, images: [] };
    }
    if (name.startsWith("render")) {
      const mode = name.includes("dark") ? "dark" : "light";
      const shots = await shoot(src, { members: t.members, scenes: ["rest", "crowded"], modes: [mode] });
      const seen = shots[0]!.seen.slice(0, 40).map((s) => `${s.role} "${s.text}" ${s.x},${s.y} ${s.w}x${s.h}`).join("\n");
      return { text: `Render (${mode}, at rest and with 12 people): ${shots.map((s) => `${s.scene} ${s.height}px`).join(", ")}\nAt rest, element by element:\n${seen}`, images: [b64(await sheet(shots.map((s) => ({ title: s.scene, png: s.png })), { columns: 2 }))] };
    }
    if (name.startsWith("read:")) {
      const e = ex.find((x) => x.id === name.slice(5).trim());
      return e ? { text: `Source of ${e.id}:\n\`\`\`tsx\n${e.source}\n\`\`\``, images: [] } : { text: `No exemplar ${name.slice(5)}; available: ${ex.map((x) => x.id).join(", ")}`, images: [] };
    }
    return { text: `Unknown tool ${name}. Tools: gate, render, render-dark, read:<id> (${ex.map((x) => x.id).join(", ")}).`, images: [] };
  };

  let best: { source: string; score: number; e: Evaluation | null; card: Card; report: Report } | null = null;
  let current: { source: string; card: Card } | null = null;
  let lastEval: Evaluation | null = null;
  let since = 0;
  for (let round = 0; round < maxR; round++) {
    const rs = performance.now();
    let kind: Round["kind"] = round === 0 ? "build" : "refine";
    const used: string[] = [];
    let src: string;
    let card: Card;
    if (round === 0 || !current || !lastEval) {
      const c = await design("", round);
      if (!c) return done({ error: "every design card was a list of rows" });
      card = c;
      src = await build(card, round);
    } else {
      // Decide: refine or pivot, and which tools to look at first.
      const d = parseJson<{ decision: "refine" | "pivot"; reason: string; tools: string[]; new_idea: string }>(
        await call("decide", {
          system: `You are the builder. A separate evaluator just judged your tool. Decide: refine this idea, or pivot to a different visual idea when the evaluation says the idea itself is weak (design or originality under 3, or no progress for two rounds). You may ask for tools before editing: "gate", "render", "render-dark", "read:<exemplar id>" (${ex.map((e) => e.id).join(", ")}). JSON only.`,
          messages: [{ role: "user", content: `The evaluation (weighted ${weighted(lastEval)}; scores ${JSON.stringify(lastEval.scores)}):\n${JSON.stringify(lastEval, null, 1)}\n\nRounds without a better score: ${since}.` }],
          json: { name: "decision", schema: DECIDE_SCHEMA },
          effort: "low",
        }, round),
      );
      if (d.decision === "pivot") {
        kind = "pivot";
        res.pivots++;
        const c = await design(d.new_idea || lastEval.pivot || "a different physical metaphor for the same moment", round);
        if (!c) break;
        card = c;
        src = await build(card, round);
      } else {
        card = current.card;
        const results: string[] = [];
        const imgs: string[] = [];
        for (const name of d.tools.slice(0, 3)) {
          used.push(name);
          try {
            const r = await tool(name, current.source);
            results.push(r.text);
            imgs.push(...r.images);
          } catch (e) {
            results.push(`${name} failed: ${(e as Error).message.slice(0, 120)}`);
          }
        }
        const fixes = lastEval.fixes.map((f, i) => `${i + 1}. [${f.scene}] ${f.where}: ${f.problem}. Fix: ${f.fix}`).join("\n");
        const prompt = `The evaluator's fixes, most important first:\n${fixes}\n\nWhy each criterion scored as it did:\n${Object.entries(lastEval.why).map(([k, v]) => `- ${k} ${lastEval!.scores[k as keyof Evaluation["scores"]]}: ${v}`).join("\n")}\n\n${results.length ? `What your tools showed:\n${results.join("\n\n")}\n\n` : ""}Fix the tool. Keep what works; the state and checks pass the gate, so change them only when a fix needs it.\n\nThe tool:\n\n\`\`\`tsx\n${current.source.trim()}\n\`\`\`\n\nReply with the whole fixed module in one \`\`\`tsx block and nothing else.`;
        src = imgs.length
          ? (applyEdits(current.source, await call("refine", { system, messages: [{ role: "user", content: prompt.replace("Reply with the whole fixed module in one ```tsx block and nothing else.", EDIT_INSTRUCTIONS) }], images: imgs }, round)) ?? (await patch("refine", prompt, current.source, round)))
          : await patch("refine", prompt, current.source, round);
      }
    }
    const h = await harden(src, round + 1);
    if (!h.report.ok) {
      res.rounds.push({ round, kind, ok: false, lint: [], score: null, pass: false, kept: false, tools: used, seconds: Math.round((performance.now() - rs) / 1000) });
      log(`${t.id}: round ${round} (${kind}) did not pass the gate`);
      since++;
      if (round + 1 >= minR && since >= 3) break;
      continue;
    }
    current = { source: h.source, card };
    let e: Evaluation | null = null;
    try {
      const v = await views(h.source, t.members);
      e = await evaluate(evaluator, v.png, `${moment}\n\nThe agreed contract:\n${res.contract}${h.lint.length ? `\n\nTaste checks still failing: ${h.lint.map((l) => l.rule).join(", ")}` : ""}${v.errors.length ? `\n\nRender errors: ${v.errors.slice(0, 2).join("; ")}` : ""}`, { label: "evaluate", nonce: round + 1 });
    } catch (err) {
      log(`${t.id}: evaluation failed ${(err as Error).message.slice(0, 120)}`);
    }
    lastEval = e;
    const score = e ? weighted(e) : null;
    const better = score !== null && (!best || score > best.score);
    if (better) {
      best = { source: h.source, score: score!, e, card, report: h.report };
      since = 0;
    } else since++;
    res.rounds.push({ round, kind, ok: true, lint: h.lint.map((l) => l.rule), score, ...(e ? { scores: e.scores } : {}), pass: e ? passes(e) : false, kept: better, tools: used, seconds: Math.round((performance.now() - rs) / 1000) });
    log(`${t.id}: round ${round} (${kind}) weighted ${score}${e && passes(e) ? " pass" : ""}${better ? " best" : ""}${used.length ? ` · tools ${used.join(", ")}` : ""}`);
    if (round + 1 >= minR && since >= 3) break;
  }
  if (!best) return done({ error: "no version passed the gate" });
  const copyWarnings = best.report.warnings.filter((w) => /sentence-case|all-caps|no-exclamation|button-words|no-percent|banned-phrase|no-emoji-button/.test(w.rule)).length;
  return done({ ok: true, source: best.source, best: best.score, bestScores: best.e?.scores ?? null, passed: best.e ? passes(best.e) : false, card: best.card, copyWarnings });
}

const OUT = join(import.meta.dir, "..", "eval", "out", "lab-match");

if (import.meta.main) {
  const arg = (k: string, d: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? (process.argv[i + 1] ?? d) : d;
  };
  const modelId = arg("model", "muse:muse-spark-1.3");
  const evalId = arg("evaluator", modelId);
  const tag = arg("tag", "spark");
  const only = arg("only", "").split(",").filter(Boolean);
  const tools = only.length ? only.map((id) => LAB_TOOLS.find((x) => x.id === id)!).filter(Boolean) : LAB_TOOLS;
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
    let r: Lab2Result;
    try {
      // The evaluator is a separate client and context; for the same model it is a fresh client.
      r = await labLoop2(t, new Meter(makeClient(modelId)), makeClient(evalId), { log: (s) => console.error(`${new Date().toTimeString().slice(0, 5)} ${tag} ${s}`) });
    } catch (e) {
      r = { id: t.id, model: modelId, evaluator: evalId, ok: false, source: "", best: null, bestScores: null, passed: false, rounds: [], brief: "", contract: "", card: null, exemplars: [], rejectedCards: 0, pivots: 0, tall: false, copyWarnings: 0, seconds: 0, tokens: 0, present: {}, error: (e as Error).message.slice(0, 300) };
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
    console.error(`${r.ok ? "pass" : "FAIL"} ${tag} ${t.id} · best ${r.best}${r.passed ? " (passes thresholds)" : ""} · ${Math.round(r.seconds / 60)} min · ~${Math.round(r.tokens / 1000)}k tok · curve ${r.rounds.map((x) => x.score ?? "x").join(" > ")}${r.error ? ` · ${r.error}` : ""}`);
  }
  await closeShoot();
  await shutdown();
}
