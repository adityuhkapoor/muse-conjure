// The lab's process as a loop: one specific moment with a brief full of human detail, rules for the
// look, free drawing, a seeded in-progress state with named friends, then render, look, fix, until
// it is good. Time per tool does not matter here; rounds are capped (4) and every version must pass
// the gate to be kept.
//
//   design   a card that commits to one visual idea and the specific seeded content
//   build    from the card, the brief, the conventions and the API (no library or lab source)
//   gate     with up to 4 repairs (small edits first)
//   look     393 px, light and dark, at rest, after taps, two people, twelve people
//   critic   sees the pictures (the same model, or `critic` when given), names located fixes
//   revise   small edits, gate again; keep the best passing version by critic score
//
// CLI: bun src/labloop.ts --model muse:muse-spark-1.3 [--only id,id] [--concurrency 2]

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, verify, warm, type Report, type VerifyOptions } from "@muse/verify";
import { RULES as COPY_RULES } from "../../verify/src/copy/rules.ts";
import { LAB_TOOLS, type LabTool } from "../eval/labmatch.ts";
import { CachedClient } from "./cache.ts";
import { buildSystem, CARD_SCHEMA, CRITIC_SCHEMA, meanScore, repairAll, type Card, type Critique } from "./compose.ts";
import { applyEdits, EDIT_INSTRUCTIONS } from "./edits.ts";
import { extractCode } from "./generate.ts";
import { labOk, ROOT, words } from "./kb.ts";
import { closeShoot, SCENE_LABEL, sheet, shoot, type Shot } from "./look/shoot.ts";
import { Meter } from "./meter.ts";
import { MuseClient } from "./models/muse.ts";
import { chatContext } from "./prompts.ts";
import type { CompleteRequest, ModelClient } from "./types.ts";

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const parseJson = <T>(t: string): T => JSON.parse(t.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;

/** The lab's rules for the look, as its authors had them. The Rust specifics are flagged as not applying. */
export function lookRules(): string {
  return [
    "## The lab's conventions (written for the earlier Rust lab; the stack here is the TypeScript API below, so ignore anything about Rust, egui or crates and keep the design rules)",
    read("muse/CONVENTIONS.md"),
    "## Meta design rules",
    read("the design notes"),
  ].join("\n\n");
}

/** Six real lab briefs, none of them one of the twelve tools, as examples of the voice and detail wanted. */
export const BRIEF_EXAMPLES = ["capper-receipts", "hot-take-court", "trip-lock", "gift-pool", "gym", "wrapped"];
export function exampleBriefs(): string {
  const all = ["BRIEFS.md", "BRIEFS-R2.md", "BRIEFS-R3.md"].map((f) => read(`muse/${f}`)).join("\n").split("\n");
  return BRIEF_EXAMPLES.flatMap((id) => {
    const i = all.findIndex((l) => l.startsWith(`- **${id}**`));
    if (i < 0) return [];
    const out = [all[i]!];
    for (let k = i + 1; k < all.length && all[k]!.startsWith("  "); k++) out.push(all[k]!);
    return [out.join("\n")];
  }).join("\n");
}

const SURFACE_OF: Record<string, string[]> = { chat: ["messenger"], event: ["event"], group: ["group"], story: ["story", "reel"], gaming: ["gaming"], marketplace: ["marketplace"], feed: ["feed"] };

export type Exemplar = { id: string; source: string; example: string; png: string | null; summary: string };
/** The 3 nearest ported lab tools (gate ok), same surface first, then by overlap with the brief; never the tool itself. */
export function nearestPorts(t: LabTool, n = 3): Exemplar[] {
  const dir = join(ROOT, "library", "lab");
  const ok = labOk();
  const docs = readdirSync(dir)
    .filter((id) => !id.startsWith("_") && id !== t.id && ok.has(id) && existsSync(join(dir, id, "meta.json")) && existsSync(join(dir, id, "app.tsx")))
    .map((id) => {
      const m = JSON.parse(readFileSync(join(dir, id, "meta.json"), "utf8")) as { surface?: string; summary?: string; useWhen?: string[]; name?: string };
      return { id, m, text: [id, m.name, m.summary, ...(m.useWhen ?? [])].join(" ") };
    });
  const q = new Set(words(`${t.brief} ${t.ask}`));
  const surf = SURFACE_OF[t.surface] ?? [];
  return docs
    .map((d) => ({ d, score: (surf.includes(d.m.surface ?? "") ? 2 : 0) + words(d.text).filter((w) => q.has(w)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ d }) => {
      const png = join(dir, "_shots", d.id, "original-rest.png");
      const ex = join(dir, d.id, "example.ts");
      return { id: d.id, source: readFileSync(join(dir, d.id, "app.tsx"), "utf8"), example: existsSync(ex) ? readFileSync(ex, "utf8") : "", png: existsSync(png) ? png : null, summary: d.m.summary ?? "" };
    });
}

/** Copy lint as warnings only; correctness stages stay required. */
export const LAB_GATE: VerifyOptions = { rules: Object.fromEntries(COPY_RULES.map((r) => [r.id, "warn" as const])) };

/** A design that is a list of option rows with a button: rejected before code. */
export function rowsOnly(card: Card): boolean {
  const pic = `${card.visual_idea} ${card.picture}`;
  const drawn = /canvas|svg|scene|placed|draw|seat|ticket|receipt|graph|map|board|grid|table|wheel|reel|card stack|pile|corkboard|flyer|plate|shelf|bingo|tile|thumb|illustrat/i.test(pic);
  return !drawn && /\b(rows?|list|option ?rows?|optionrow)\b/i.test(pic);
}

function moment(t: LabTool): string {
  return `${t.brief}\n\n${chatContext(t)}`;
}

const DESIGN = `You design one small live tool for Muse, an assistant inside Messenger and Facebook that builds a tool for a group's moment. This is for a taste test: it must feel made for this group and this moment, with whimsy and real interaction, inside Meta's visual language. Interpret the brief boldly; it is a floor, not a ceiling.

Commit to one visual idea, drawn freely (SVG shapes, Canvas, the drawing kit) rather than assembled from stock rows. Decide the specific seeded in-progress state the tool arrives with, as the lab did: named friends from the members list already part-way through (who already claimed, voted, played, paid), with their reasons and the small jokes and lore of this group in their own words. That seeded content may be invented in the spirit of the brief, but it must fit the brief's world and use only the members' names.

Write the design card as JSON. In \`content\`, list every seeded item and fact with \`from\` set to the brief line or chat message it grows from (or "seed" when you invented it for the brief). In \`state\`, \`actions\`, \`invariants\`, \`transitions\`: the shared logic, kept small. In \`labels\`: every string, sentence case, buttons up to four words; exclamation marks only in drawn stickers and quoted lines.`;

const CRITIC = `You are a demanding design critic in a taste lab. The image is a sheet of one small live tool at 393 px wide, light and dark: {{SCENES}}. Judge it against the brief, its design card and the rules for the look. Find what keeps it from being great.

First the polish defects people notice at once, each a fix: text cut off or ending in "…", things overlapping, boxes inside boxes or thick outlines, more than one primary button, a state that contradicts itself after taps, empty or dead areas, controls that do not serve the moment. Then the biggest design gap: is the picture specific and delightful for this moment, is the seeded state alive with the friends and their lore, is there one satisfying moment of motion?

Score each criterion 1 to 5 (made_for_moment, visual_idea, hierarchy, density, empty_state for the at-rest picture, copy_voice, meta_native), then up to 5 fixes, most important first, each with scene, where, problem and a concrete code-level fix. No fixes if it is already excellent.`;

export type LabResult = { id: string; model: string; ok: boolean; source: string; report: Report | null; card: Card | null; history: { round: number; score: number | null; ok: boolean; kept: boolean; fixes: number }[]; best: number | null; seconds: number; tokens: number; calls: number; criticModel: string; brief?: string; exemplars?: string[]; rejectedCards: number; tall?: boolean; copyWarnings?: number; error?: string };

export async function labLoop(t: LabTool, model: ModelClient, o: { rounds?: number; critic?: ModelClient; log?: (s: string) => void } = {}): Promise<LabResult> {
  const t0 = performance.now();
  const meter = model instanceof Meter ? model : new Meter(model);
  const critic = o.critic ?? meter;
  const log = o.log ?? (() => {});
  const rounds = o.rounds ?? 4;
  const big = !/^muse:/.test(model.id);
  const call = (label: string, r: Omit<CompleteRequest, "label">, nonce = 0, client: ModelClient = meter) => client.complete({ ...r, label, ...(nonce ? { nonce } : {}) } as CompleteRequest);
  const rules = lookRules();
  const res: LabResult = { id: t.id, model: model.id, ok: false, source: "", report: null, card: null, history: [], best: null, seconds: 0, tokens: 0, calls: 0, criticModel: critic.id, rejectedCards: 0 };
  const done = (extra: Partial<LabResult> = {}) => {
    Object.assign(res, extra);
    res.seconds = Math.round((performance.now() - t0) / 100) / 10;
    res.tokens = meter.tokensIn + meter.tokensOut;
    res.calls = meter.calls;
    return res;
  };

  // 1. A lab-style brief, written first.
  const ex = nearestPorts(t);
  const exPng = ex.flatMap((e) => (e.png ? [`data:image/png;base64,${readFileSync(e.png).toString("base64")}`] : []));
  res.exemplars = ex.map((e) => e.id);
  const brief = await call("lab-brief", {
    system: `You write the brief for one small live tool that Muse will build for a group, the way the taste lab's briefs were written: a specific moment, the named friends and what each said or did and why, a running joke, the one visual idea as a physical metaphor (a courtroom exhibit, a boarding pass, a corkboard, a top-down table), the seeded in-progress state (who already did what, with their reasons in their own words), and the one satisfying moment. Invented human detail is wanted as long as it fits the chat and uses only the members' names. 120 to 220 words, plain text.\n\nReal lab briefs, for the voice and the density of detail:\n\n${exampleBriefs()}`,
    messages: [{ role: "user", content: `${moment(t)}\n\nWrite the brief.` }],
    effort: "medium",
  });
  res.brief = brief;

  // 2. Design card: one drawn visual idea and the seeded content; a list of rows is rejected.
  const exText = ex.map((e) => `- ${e.id}: ${e.summary}`).join("\n");
  let card: Card | null = null;
  for (let attempt = 0; attempt < 2 && !card; attempt++) {
    const c = parseJson<Card>(
      await call("lab-design", {
        system: `${DESIGN}\n\n${rules}`,
        messages: [{ role: "user", content: `${moment(t)}\n\nThe brief:\n${brief}\n\nThree finished lab tools for the level of drawing and craft to match (their pictures are attached; do not copy their ideas):\n${exText}\n\n${attempt ? "Your last card was a list of rows with a button. That is rejected: draw the moment (Canvas, inline SVG, the art kit), with people placed in the picture. " : ""}Write the design card. JSON only.` }],
        images: exPng,
        json: { name: "card", schema: CARD_SCHEMA },
        effort: "medium",
      }, attempt),
    );
    if (rowsOnly(c)) {
      res.rejectedCards++;
      log(`${t.id}: design card rejected (rows only)`);
    } else card = c;
  }
  if (!card) return done({ error: "every design card was a list of rows" });
  res.card = card;
  log(`${t.id}: designed "${card.visual_idea}"`);

  // Build.
  const system = `${buildSystem(["state-that-verifies"])}\n\n# Rules for the look\n\n${rules}`;
  const buildUser = `Build the tool from this design card. It is for a taste test: make it look made for this moment, drawn freely, with the seeded in-progress state from the card in \`init\` (find each named friend in \`ctx.members\` by name; skip anyone not in the chat). Put the seeded content and the brief's facts in one \`const\` near the top.\n\n${moment(t)}\n\nThe brief:\n${brief}\n\nThe design card:\n\n\`\`\`json\n${JSON.stringify(card, null, 1)}\n\`\`\`\n\nReply with one \`\`\`tsx block and nothing else.`;
  const exCode = ex.map((e) => `### ${e.id}: ${e.summary}\n\n\`\`\`tsx\n${e.source.trim()}\n\`\`\`${e.example ? `\n\nIts example parameters:\n\n\`\`\`ts\n${e.example.trim()}\n\`\`\`` : ""}`).join("\n\n");
  const buildFull = buildUser.replace("Reply with one", `Three finished lab tools that pass the gate, for the drawing density and craft to match. Do not copy their idea, layout or content:\n\n${exCode}\n\nReply with one`);
  let source = extractCode(await call("lab-build", { system, messages: [{ role: "user", content: buildFull }], images: exPng }));

  const patch = async (label: string, prompt: string, current: string, nonce: number): Promise<string> => {
    const WHOLE = "Reply with the whole fixed module in one ```tsx block and nothing else.";
    try {
      const edited = applyEdits(current, await call(label, { system, messages: [{ role: "user", content: prompt.replace(WHOLE, EDIT_INSTRUCTIONS) }] }, nonce));
      if (edited) return edited;
    } catch {}
    return extractCode(await call(`${label}-whole`, { system, messages: [{ role: "user", content: prompt }] }, nonce));
  };
  const budget = t.surface === "story" ? 600 : 420;
  const check = async (src: string): Promise<Report> => {
    const r = await verify(src, { ...LAB_GATE, heightBudget: budget });
    // The idea may need the story budget: allow 600 when height is the only failure, and say so.
    if (!r.ok && budget < 600 && r.failures.every((x) => x.rule === "too-tall")) {
      const tall = await verify(src, { ...LAB_GATE, heightBudget: 600 });
      if (tall.ok) res.tall = true;
      return tall;
    }
    return r;
  };
  const gated = async (src: string, nonce: number): Promise<{ source: string; report: Report }> => {
    let report = await check(src);
    for (let k = 0; !report.ok && k < 4; k++) {
      log(`${t.id}: repair ${report.stage} ${report.failures[0]?.rule ?? ""}`);
      src = await patch("lab-repair", repairAll(src, report), src, nonce * 10 + k + 1);
      report = await check(src);
    }
    return { source: src, report };
  };

  const look = async (src: string, round: number): Promise<{ crit: Critique | null; shots: Shot[] }> => {
    let shots: Shot[] = [];
    try {
      shots = await shoot(src, { members: t.members, scenes: ["rest", "played", "two", "crowded"], modes: ["light", "dark"] });
    } catch {
      return { crit: null, shots };
    }
    const pick = shots.filter((s) => s.mode === "light" || s.scene === "rest" || s.scene === "played");
    const png = await sheet(pick.map((s) => ({ title: `${SCENE_LABEL[s.scene]} · ${s.mode}`, sub: `${s.height} px${s.errors.length ? ` · error: ${s.errors[0]!.slice(0, 80)}` : ""}`, png: s.png })), { columns: 3 });
    try {
      const crit = parseJson<Critique>(
        await call(
          "lab-critic",
          {
            system: `${CRITIC.replace("{{SCENES}}", pick.map((s) => `${SCENE_LABEL[s.scene]} (${s.mode})`).join(", "))}\n\n${rules}`,
            messages: [{ role: "user", content: `${moment(t)}\n\nIts design card:\n\n\`\`\`json\n${JSON.stringify({ ...card, state: undefined, actions: undefined, invariants: undefined, transitions: undefined }, null, 1)}\n\`\`\`\n\nThe first image is this tool. The others are finished lab tools (${ex.map((e) => e.id).join(", ")}) for the level of craft to hold it to; do not ask it to copy them. Critique the first image. JSON only.` }],
            images: [`data:image/png;base64,${Buffer.from(png).toString("base64")}`, ...exPng],
            json: { name: "critique", schema: CRITIC_SCHEMA },
            effort: "medium",
          },
          round,
          critic,
        ),
      );
      const errs = shots.flatMap((s) => s.errors.map((e) => ({ scene: `${s.scene} ${s.mode}`, where: "render", problem: e.slice(0, 200), fix: "fix the error so the view renders" })));
      crit.fixes = [...errs.slice(0, 2), ...(crit.fixes ?? [])].slice(0, 6);
      return { crit, shots };
    } catch {
      return { crit: null, shots };
    }
  };

  let g = await gated(source, 0);
  if (!g.report.ok) return done({ source: g.source, report: g.report, error: `first build never passed the gate: ${g.report.failures[0]?.rule}` });
  let best = { source: g.source, report: g.report, score: 0, crit: null as Critique | null };
  {
    const l = await look(best.source, 0);
    best.crit = l.crit;
    best.score = l.crit ? meanScore(l.crit) : 0;
    res.history.push({ round: 0, score: l.crit ? best.score : null, ok: true, kept: true, fixes: l.crit?.fixes.length ?? 0 });
    log(`${t.id}: round 0 critic ${best.score}`);
  }
  for (let round = 1; round <= rounds; round++) {
    if (!best.crit || !best.crit.fixes.length || best.score >= 4.85) break;
    const fixes = best.crit.fixes.map((f, i) => `${i + 1}. [${f.scene}] ${f.where}: ${f.problem}. Fix: ${f.fix}`).join("\n");
    const prompt = `A design critic looked at pictures of your tool and found these problems. Fix each one in the code. Keep everything else; the state, actions and checks already pass the gate, so change them only if a fix needs it.\n\n${fixes}\n\nThe design card:\n\n\`\`\`json\n${JSON.stringify(card, null, 1)}\n\`\`\`\n\nThe tool:\n\n\`\`\`tsx\n${best.source.trim()}\n\`\`\`\n\nReply with the whole fixed module in one \`\`\`tsx block and nothing else.`;
    const fixed = await patch("lab-fix", prompt, best.source, round);
    g = await gated(fixed, round);
    if (!g.report.ok) {
      res.history.push({ round, score: null, ok: false, kept: false, fixes: 0 });
      log(`${t.id}: round ${round} did not pass the gate`);
      continue;
    }
    const l = await look(g.source, round);
    const score = l.crit ? meanScore(l.crit) : 0;
    const kept = score >= best.score - 0.05;
    res.history.push({ round, score: l.crit ? score : null, ok: true, kept, fixes: l.crit?.fixes.length ?? 0 });
    log(`${t.id}: round ${round} critic ${score}${kept ? "" : " (kept the earlier version)"}`);
    if (kept) best = { source: g.source, report: g.report, score, crit: l.crit };
  }
  // What the copy lint would have blocked under the normal gate.
  const copyWarnings = best.report.warnings.filter((w) => COPY_RULES.some((r) => r.id === w.rule)).length;
  return done({ ok: true, source: best.source, report: best.report, best: best.score, copyWarnings });
}

const OUT = join(import.meta.dir, "..", "eval", "out", "lab-match");

export function makeClient(id: string): ModelClient {
  if (id.startsWith("muse:")) return new CachedClient(new MuseClient({ model: id.slice(5), timeoutMs: 600_000 }));
  throw new Error(`unknown model "${id}"; use muse:<model>`);
}

if (import.meta.main) {
  const arg = (k: string, d: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? (process.argv[i + 1] ?? d) : d;
  };
  const modelId = arg("model", "muse:muse-spark-1.3");
  const tag = arg("tag", "spark");
  const criticId = arg("critic", "");
  const only = arg("only", "").split(",").filter(Boolean);
  const conc = Math.min(2, Number(arg("concurrency", "1")));
  const tools = only.length ? LAB_TOOLS.filter((x) => only.includes(x.id)) : LAB_TOOLS;
  await warm();
  let next = 0;
  const work = async () => {
    while (next < tools.length) {
      const t = tools[next++]!;
      const dir = join(OUT, tag);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${t.id}.json`);
      if (existsSync(file)) continue;
      try {
        writeFileSync(`${file}.claim`, String(process.pid), { flag: "wx" });
      } catch {
        continue;
      }
      let r: LabResult;
      try {
        r = await labLoop(t, new Meter(makeClient(modelId)), { ...(criticId ? { critic: new Meter(makeClient(criticId)) } : {}), log: (s) => console.error(`${new Date().toTimeString().slice(0, 5)} ${tag} ${s}`) });
      } catch (e) {
        r = { id: t.id, model: modelId, ok: false, source: "", report: null, card: null, history: [], best: null, seconds: 0, tokens: 0, calls: 0, criticModel: criticId || modelId, rejectedCards: 0, error: (e as Error).message.slice(0, 300) };
      }
      if (r.source) {
        writeFileSync(join(dir, `${t.id}.tsx`), r.source);
        try {
          const shots = await shoot(r.source, { members: t.members, scenes: ["rest", "played"], modes: ["light", "dark"] });
          for (const s of shots) if (s.png.length) writeFileSync(join(dir, `${t.id}.${s.scene}-${s.mode}.png`), s.png);
        } catch {}
      }
      writeFileSync(file, JSON.stringify(r, null, 1));
      try {
        (await import("node:fs")).rmSync(`${file}.claim`, { force: true });
      } catch {}
      console.error(`${r.ok ? "pass" : "FAIL"} ${tag} ${t.id} · best ${r.best} · ${r.seconds}s · ~${Math.round(r.tokens / 1000)}k tok · ${r.history.map((h) => h.score ?? "x").join(" > ")}${r.error ? ` · ${r.error}` : ""}`);
    }
  };
  await Promise.all(Array.from({ length: conc }, work));
  await closeShoot();
  await shutdown();
}
