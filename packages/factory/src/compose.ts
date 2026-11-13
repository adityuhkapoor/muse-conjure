// compose(request, model, options): the taste-first pipeline. `generate()` stays as it was.
//
//   understand  a small structured reading of the moment, every fact quoted from its message
//   route       reuse a cached tool or library piece that truly fits, adapt the nearest one, or build
//   design      a design card before code (visual idea, at-rest summary, the one satisfying moment,
//               empty and overloaded states, every label), checked cheaply (copy rules, taste,
//               grounding, sameness against recent tools) and revised once as a card
//   build       from the card, with only the relevant skills and one or two nearest exemplars
//   gate        verifyPartial first, then the full gate with up to two repairs
//   see and fix headless pictures at 393 px light and dark, a critic against the card and the
//               visual-language skill, located fixes, at most two rounds
//   choose      among candidates by gate, critic score, taste rank, then size
//
// Every model call goes through the caller's client (cached on disk by request hash when it is a
// CachedClient). There are no unbounded loops: repairs, fix rounds and candidates are capped, and a
// deadline stops optional steps.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coerce, fill, piece as getPiece } from "@muse/library";
import { verify, verifyPartial, type Report } from "@muse/verify";
import { best as cacheBest, find as cacheFind, refill as cacheRefill } from "../../../library/cache/lookup.ts";
import { RULES as COPY_RULES } from "../../verify/src/copy/rules.ts";
import { extractCopy } from "../../verify/src/stages/copy.ts";
import { taste } from "../../taste/src/index.ts";
import { appName, extractCode } from "./generate.ts";
import { exemplarDocs, labDocs, pieceDocs, rank, skill, words, type Doc } from "./kb.ts";
import { closeShoot, SCENE_LABEL, sheet, shoot, type Shot } from "./look/shoot.ts";
import { applyEdits, EDIT_INSTRUCTIONS } from "./edits.ts";
import { estTokens } from "./meter.ts";
import { apiText, chatContext, fillSlots, PROMPTS_DIR, repairUser } from "./prompts.ts";
import type { CompleteRequest, GenerateRequest, GenerateResult, ModelClient, Path, ProgressEvent } from "./types.ts";

export { closeShoot };

export type Speed = "fast" | "normal" | "best";

export type ComposeEvent =
  | ProgressEvent
  | { t: "step"; step: number; of: number; label: string; seconds: number }
  | { t: "designed"; visualIdea: string; issues: string[] }
  | { t: "critic"; candidate: number; round: number; score: number; fixes: number }
  | { t: "chosen"; candidate: number; why: string };

export type ComposeOptions = {
  speed?: Speed;
  /** A small, fast model for the cheap steps (understand, route, design checks). Defaults to `model`. */
  fast?: ModelClient;
  /** Override the speed's candidate count (1 to 3). */
  candidates?: number;
  /** Override the speed's critic rounds (0 to 2). */
  criticRounds?: number;
  onEvent?: (e: ComposeEvent) => void;
  gate?: (source: string) => Promise<Report>;
  /** Visual ideas of recent tools, for the sameness check. Defaults to this process's own. */
  recent?: string[];
  /** Hard ceiling in ms; optional steps stop when it is near. */
  deadlineMs?: number;
  /** Turn off pictures (tests). */
  look?: boolean;
  /** Prompt version: 1 is the first held-out run; 2 adds the polish checklist to the critic and the fit rules to the design card. */
  version?: 1 | 2;
};

/** What each speed does, and the honest target it is measured against . */
export const SPEEDS: Record<Speed, { candidates: number; criticRounds: number; reuse: boolean; deadlineMs: number; target: string }> = {
  fast: { candidates: 1, criticRounds: 0, reuse: true, deadlineMs: 240_000, target: "reuse in seconds; a new tool in 1 to 3 minutes" },
  normal: { candidates: 1, criticRounds: 1, reuse: false, deadlineMs: 900_000, target: "8 to 14 minutes on Muse under load" },
  best: { candidates: 2, criticRounds: 2, reuse: false, deadlineMs: 1_200_000, target: "6 to 15 minutes" },
};

// ---------------------------------------------------------------------------------------------
// Schemas (strict-mode compatible: every property required, no extras).

const str = { type: "string" };
const num = { type: "number" };
const strs = { type: "array", items: str };
const obj = (props: Record<string, unknown>) => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false });
const SHAPES = ["choose", "divide", "match", "schedule", "track", "play", "remember", "gather", "queue"];

export const READING_SCHEMA = obj({
  job: str,
  shape: { type: "string", enum: SHAPES },
  tone: str,
  stake: str,
  people: { type: "array", items: obj({ name: str, role: str, from: str }) },
  items: { type: "array", items: obj({ label: str, detail: str, cents: num, from: str }) },
  facts: { type: "array", items: obj({ text: str, from: str }) },
  missing: strs,
  keywords: strs,
});
export type Reading = {
  job: string;
  shape: string;
  tone: string;
  stake: string;
  people: { name: string; role: string; from: string }[];
  items: { label: string; detail: string; cents: number; from: string }[];
  facts: { text: string; from: string }[];
  missing: string[];
  keywords: string[];
};

const ROUTE_SCHEMA = obj({ path: { type: "string", enum: ["reuse", "adapt", "build"] }, id: str, why: str, change: str });
type RouteChoice = { path: Path; id: string; why: string; change: string };

export const CARD_SCHEMA = obj({
  name: str,
  title: str,
  visual_idea: str,
  why_this_shape: str,
  picture: str,
  interaction: str,
  satisfying_moment: str,
  at_rest: str,
  empty_state: str,
  overloaded_state: str,
  content: { type: "array", items: obj({ label: str, detail: str, cents: num, from: str }) },
  state: { type: "array", items: obj({ name: str, type: str, meaning: str }) },
  actions: { type: "array", items: obj({ t: str, fields: str, who: str, effect: str, noop_when: str }) },
  invariants: strs,
  transitions: strs,
  random: str,
  labels: obj({ buttons: strs, status: strs, empty: str, summary: str, other: strs }),
});
export type Card = {
  name: string;
  title: string;
  visual_idea: string;
  why_this_shape: string;
  picture: string;
  interaction: string;
  satisfying_moment: string;
  at_rest: string;
  empty_state: string;
  overloaded_state: string;
  content: { label: string; detail: string; cents: number; from: string }[];
  state: { name: string; type: string; meaning: string }[];
  actions: { t: string; fields: string; who: string; effect: string; noop_when: string }[];
  invariants: string[];
  transitions: string[];
  random: string;
  labels: { buttons: string[]; status: string[]; empty: string; summary: string; other: string[] };
};

export const CRITERIA = ["made_for_moment", "visual_idea", "hierarchy", "density", "empty_state", "copy_voice", "meta_native"] as const;
export type Criterion = (typeof CRITERIA)[number];
export const CRITIC_SCHEMA = obj({
  scores: obj(Object.fromEntries(CRITERIA.map((c) => [c, num]))),
  fixes: { type: "array", items: obj({ scene: str, where: str, problem: str, fix: str }) },
  verdict: str,
});
export type Critique = { scores: Record<Criterion, number>; fixes: { scene: string; where: string; problem: string; fix: string }[]; verdict: string };
export const meanScore = (c: Critique) => Math.round((CRITERIA.reduce((n, k) => n + clamp(c.scores[k] ?? 0, 1, 5), 0) / CRITERIA.length) * 100) / 100;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));

// ---------------------------------------------------------------------------------------------
// Prompts.

const P = (name: string) => readFileSync(join(PROMPTS_DIR, "compose", name), "utf8");
const parseJson = <T>(text: string): T => JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;

/** Sections of the existing build system prompt that carry the gate's rules. */
function gateRules(): string {
  const text = readFileSync(join(PROMPTS_DIR, "system.md"), "utf8");
  const keep = ["# How the app is checked", "# Rules for `reduce`, and why", "# Rules for `arbitrary`", "# Invariants and transitions: the part that decides whether the app passes", "# Before you answer, check"];
  const parts = text.split(/\n(?=# )/);
  return parts.filter((p) => keep.some((k) => p.startsWith(k))).join("\n\n").trim();
}

/** The build system prompt: what Muse is, the API, the gate's rules and only the skills this tool needs. */
export function buildSystem(skillNames: string[]): string {
  return [
    "You write small live apps for Muse. Muse lives in group chats on Messenger and on Facebook (events, groups, Marketplace). Someone asks for help and you build a small tool for that moment; everyone in the chat uses it together, live, on their phones. A designer already decided what it looks like: follow the design card you are given. The tool should feel made for this group: their names, their options, a picture that fits, inside Meta's calm visual language.",
    "# Your output\n\nReply with exactly one ```tsx code block that holds the whole module. No text before or after it.",
    `# The API\n\nThis is the complete API. Use nothing that is not in it.\n\n${apiText()}`,
    gateRules(),
    ...skillNames.map((n) => `# Skill: ${n}\n\n${skill(n).replace(/^# .*\n/, "")}`),
  ].join("\n\n");
}

function readingText(r: Reading): string {
  return [
    `Job: ${r.job} (shape: ${r.shape}). Tone: ${r.tone}.${r.stake ? ` Stake: ${r.stake}.` : ""}`,
    r.people.length ? `People: ${r.people.map((p) => `${p.name}${p.role ? ` (${p.role})` : ""}`).join(", ")}.` : "",
    r.items.length ? `Items:\n${r.items.map((i) => `- ${i.label}${i.detail ? ` · ${i.detail}` : ""}${i.cents ? ` · ${i.cents} cents` : ""}  [from: "${i.from}"]`).join("\n")}` : "Items: none in the chat.",
    r.facts.length ? `Facts:\n${r.facts.map((f) => `- ${f.text}  [from: "${f.from}"]`).join("\n")}` : "",
    r.missing.length ? `Missing: ${r.missing.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------------------------
// Cheap checks.

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9$]+/g, " ").trim();

/** True when `from` is a quote (or near quote) of one chat message. */
export function grounded(from: string, req: GenerateRequest): boolean {
  const f = norm(from);
  if (!f) return false;
  const msgs = [req.ask, req.chat.title ?? "", ...req.chat.messages.map((m) => m.text)].map(norm);
  if (msgs.some((m) => m.includes(f) || (f.length > 12 && f.includes(m) && m.length > 8))) return true;
  const fw = f.split(" ").filter((w) => w.length > 2);
  if (!fw.length) return msgs.some((m) => m.split(" ").includes(f));
  return msgs.some((m) => {
    const mw = new Set(m.split(" "));
    return fw.filter((w) => mw.has(w)).length / fw.length >= 0.7;
  });
}

/** Drop items and facts that do not quote the chat. Returns what was dropped. */
export function groundReading(r: Reading, req: GenerateRequest): string[] {
  const dropped: string[] = [];
  r.items = r.items.filter((i) => grounded(i.from, req) || (dropped.push(`item "${i.label}"`), false));
  r.facts = r.facts.filter((f) => grounded(f.from, req) || (dropped.push(`fact "${f.text}"`), false));
  const names = new Set(req.members.map((m) => m.name.toLowerCase()));
  r.people = r.people.filter((p) => names.has(p.name.toLowerCase()) || (dropped.push(`person "${p.name}"`), false));
  return dropped;
}

const recentIdeas: string[] = [];

/** Located problems with a design card, found without a model. */
export function checkCard(card: Card, req: GenerateRequest, recent: string[]): string[] {
  const issues: string[] = [];
  const labels: { text: string; button: boolean; where: string }[] = [
    { text: card.title, button: false, where: "title" },
    ...card.labels.buttons.map((t, i) => ({ text: t, button: true, where: `labels.buttons[${i}]` })),
    ...card.labels.status.map((t, i) => ({ text: t, button: false, where: `labels.status[${i}]` })),
    { text: card.labels.empty, button: false, where: "labels.empty" },
    { text: card.labels.summary, button: false, where: "labels.summary" },
    ...card.labels.other.map((t, i) => ({ text: t, button: false, where: `labels.other[${i}]` })),
  ].filter((l) => l.text && l.text.trim());
  // Names from the chat keep their capitals (the gate exempts the CHAT const the same way).
  const proper = new Set(
    [...card.content.map((c) => c.label), ...req.members.map((m) => m.name), req.chat.title ?? ""]
      .flatMap((s) => s.split(/[\s·/,()-]+/))
      .filter((w) => /^[A-Z]/.test(w))
      .map((w) => w.replace(/[^A-Za-z']/g, "")),
  );
  const mask = (t: string) => t.split(" ").map((w) => (proper.has(w.replace(/[^A-Za-z']/g, "")) ? "x" : w)).join(" ");
  for (const l of labels) {
    for (const rule of COPY_RULES) {
      const why = rule.check({ text: mask(l.text), button: l.button, line: 0 });
      if (why) issues.push(`${l.where}: ${why} (rule ${rule.id})`);
    }
    const s = taste.scoreCopy(l.text, l.button ? "button" : l.where === "labels.summary" ? "summary" : l.where === "labels.empty" ? "empty" : "title");
    if (s.score < 0.35 && s.uncertainty < 0.25) issues.push(`${l.where}: "${l.text}" reads like AI-written copy to the owner's taste model (score ${s.score} ± ${s.uncertainty}: ${s.reasons.slice(0, 2).join("; ")})`);
  }
  if (card.labels.buttons.length > 6) issues.push(`labels.buttons: ${card.labels.buttons.length} buttons; a chat card wants 1 to 3 kinds of button`);
  card.content.forEach((c, i) => {
    if (!grounded(c.from, req) && !/starter|general|anyone can add/i.test(c.detail)) issues.push(`content[${i}] "${c.label}": not found in the chat ("${c.from.slice(0, 60)}"); remove it or quote the message`);
  });
  const mine = new Set(words(`${card.visual_idea} ${card.picture}`));
  for (const r of recent) {
    const other = new Set(words(r));
    const inter = [...mine].filter((w) => other.has(w)).length;
    const j = inter / Math.max(1, new Set([...mine, ...other]).size);
    if (j > 0.55) {
      issues.push(`visual_idea: too close to a recent tool ("${r.slice(0, 80)}"); find a different picture that still fits`);
      break;
    }
  }
  return issues;
}

/** The first failure in full (rule, trace, hint), plus the other failures of the same stage in one line each, so one repair can fix them all. */
export function repairAll(source: string, report: Report): string {
  const [first, ...rest] = report.failures;
  let base = repairUser(source, report.stage, first ?? { rule: report.stage, message: "failed" });
  // Layout failures name one element, but the gate re-checks every element at three widths: fix the kind, not the instance.
  if (report.stage === "render" && first && /clipped|overlap|hit-area|outside|contrast|too-tall/.test(first.rule))
    base = base.replace("The app that failed:", "The gate checks every element at 320, 393 and 500 px wide, light and dark. Fix the cause for every element of the same kind (every name under a face, every label in a fixed-width box, every small tap target), not only the one quoted, or the next check fails on its neighbour.\n\nThe app that failed:");
  const others = rest.filter((x) => x.rule !== first?.rule || x.message !== first?.message).slice(0, 5);
  if (!others.length) return base;
  return base.replace("The app that failed:", `The same check also found these; fix them in the same pass:\n${others.map((x) => `- ${x.rule}: ${x.message.slice(0, 240)}`).join("\n")}\n\nThe app that failed:`);
}

// ---------------------------------------------------------------------------------------------
// Taste: copy and tool knobs read from the source.

export function tasteOf(source: string): { score: number; uncertainty: number; copy: number; tool: number } {
  const texts = extractCopy(source).slice(0, 40);
  const copy = texts.length ? texts.map((t) => taste.scoreCopy(t.text, t.button ? "button" : undefined)) : [{ score: 0.5, uncertainty: 0.5 }];
  const copyMean = copy.reduce((n, s) => n + s.score, 0) / copy.length;
  const copyUnc = copy.reduce((n, s) => n + s.uncertainty, 0) / copy.length;
  const tool = taste.scoreTool({
    radius: /radius:\s*(1[6-9]|2\d)\b/.test(source) ? 16 : /radius:\s*[0-4]\b/.test(source) ? 4 : 8,
    celebrate: /\bBurst\b/.test(source) ? "burst" : /\bChanged\b|\bLocked\b/.test(source) ? "color" : "none",
    motion: /\bspring\(|\bPlaced\b/.test(source) ? "springy" : /\btween\(|\brunning\(/.test(source) ? "standard" : "none",
    avatar: /size=\{3\d\}/.test(source) ? 32 : /size=\{2[0-3]\}|size=\{1\d\}/.test(source) ? 20 : 24,
    progress: /\bProgress\b|\bRing\b|\bMeter\b/.test(source),
  });
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { score: r((copyMean + tool.score) / 2), uncertainty: r(Math.max(copyUnc, tool.uncertainty)), copy: r(copyMean), tool: r(tool.score) };
}

// ---------------------------------------------------------------------------------------------
// The pipeline.

type Cand = { k: number; source: string; report: Report; ok: boolean; attempts: number; critique?: Critique; score?: number; rounds: number; history: { round: number; score: number; kept: boolean }[]; shots?: Shot[] };

export type ComposeExtra = {
  speed: Speed;
  reading: Reading | null;
  dropped: string[];
  route: RouteChoice & { base: string | null };
  card: Card | null;
  cardIssues: string[];
  cardRevised: boolean;
  skills: string[];
  exemplars: string[];
  buildPromptTokens: number;
  candidates: { k: number; ok: boolean; mutation: number | null; critic: number | null; rounds: number; history: Cand["history"]; lines: number }[];
  critic: Critique | null;
  criticMode: "image" | "none";
  taste: ReturnType<typeof tasteOf> | null;
  chosenWhy: string;
  /** Repairs and fixes done as small edits, and those that fell back to a whole file. */
  edits: { applied: number; fallback: number };
};

export async function compose(req: GenerateRequest, model: ModelClient, opts: ComposeOptions = {}): Promise<GenerateResult & { extra: ComposeExtra }> {
  const speed = opts.speed ?? "normal";
  const cfg = SPEEDS[speed];
  const fast = opts.fast ?? model;
  const emit = opts.onEvent ?? (() => {});
  const gate = opts.gate ?? ((s: string) => verify(s));
  const nCands = Math.max(1, Math.min(3, opts.candidates ?? cfg.candidates));
  const version = opts.version ?? 2;
  /** The Muse models get a smaller, sharper prompt and, from version 2, one more critic round at normal speed. */
  const big = !/^muse:muse-(spark|ember)/.test(model.id);
  const rounds = Math.max(0, Math.min(2, opts.criticRounds ?? (version >= 2 && !big && speed === "normal" ? 2 : cfg.criticRounds)));
  const deadline = performance.now() + (opts.deadlineMs ?? cfg.deadlineMs);
  const left = () => deadline - performance.now();
  const recent = opts.recent ?? recentIdeas;
  const timings: Record<string, number> = {};
  const t0 = performance.now();
  // Steps: understand, route, design, build per candidate, look per round, choose.
  const totalSteps = 3 + nCands * (1 + rounds) + 1;
  let step = 0;
  const progress = (label: string) => emit({ t: "step", step: ++step, of: totalSteps, label, seconds: Math.round((performance.now() - t0) / 100) / 10 });
  const call = async (label: string, client: ModelClient, r: Omit<CompleteRequest, "label">, nonce = 0) => {
    const s = performance.now();
    try {
      return await client.complete({ ...r, label, ...(nonce ? { nonce } : {}) } as CompleteRequest);
    } finally {
      timings[label] = Math.round(((timings[label] ?? 0) * 1000 + performance.now() - s) / 10) / 100;
    }
  };
  const editStats = { applied: 0, fallback: 0 };
  const extra: ComposeExtra = {
    speed,
    reading: null,
    dropped: [],
    route: { path: "build", id: "", why: "", change: "", base: null },
    card: null,
    cardIssues: [],
    cardRevised: false,
    skills: [],
    exemplars: [],
    buildPromptTokens: 0,
    candidates: [],
    critic: null,
    criticMode: "none",
    taste: null,
    chosenWhy: "",
    edits: editStats,
  };
  const fail = (error: string, c?: Cand): GenerateResult & { extra: ComposeExtra } => {
    emit({ t: "failed", message: error });
    timings.total = Math.round(performance.now() - t0) / 1000;
    return { ok: false, source: c?.source ?? "", report: c?.report ?? null, attempts: c?.attempts ?? 0, timings, from: { path: extra.route.path, piece: extra.route.base, model: model.id, cached: false }, error, extra };
  };

  // 1. Understand.
  emit({ t: "understanding" });
  progress("Reading the chat");
  let reading: Reading;
  try {
    reading = parseJson<Reading>(
      await call("understand", fast, {
        system: fillSlots(P("understand.md"), { SKILL: skill("reading-the-moment") }),
        messages: [{ role: "user", content: `${chatContext(req)}\n\nWrite the reading. JSON only.` }],
        json: { name: "reading", schema: READING_SCHEMA },
        effort: "low",
      }),
    );
  } catch (e) {
    return fail(`could not read the moment: ${(e as Error).message}`);
  }
  extra.dropped = groundReading(reading, req);
  extra.reading = reading;

  // 2. Route: cached tools, library pieces, lab ports, exemplars, scored by the reading.
  progress("Finding similar tools");
  const query = [req.ask, reading.job, reading.shape, reading.keywords.join(" "), reading.items.map((i) => i.label).join(" ")].join(" ");
  const cache = cacheFind(req.ask, req.chat, req.members, { limit: 3 }).filter((c) => c.reusable);
  const docs: Doc[] = [...pieceDocs(), ...labDocs(), ...exemplarDocs().filter((d) => d.source)];
  const ranked = rank(docs, query, 5);
  const cands = [
    ...cache.map((c) => ({ id: `cache:${c.id}`, line: `cache:${c.id} · ${c.kind} · confidence ${c.confidence.toFixed(2)} · ${c.why.slice(0, 3).join(", ")}` })),
    ...ranked.map((r) => ({ id: r.doc.id, line: `${r.doc.id} · ${r.doc.kind} · ${r.doc.what.slice(0, 140)} · match ${r.score}` })),
  ];
  let route: RouteChoice = { path: "build", id: "", why: "nothing close", change: "" };
  if (cands.length) {
    try {
      route = parseJson<RouteChoice>(
        await call("route", fast, {
          system: fillSlots(P("route.md"), { READING: readingText(reading), CANDIDATES: cands.map((c) => c.line).join("\n") }),
          messages: [{ role: "user", content: `The ask: "${req.ask}". Decide. JSON only.` }],
          json: { name: "route", schema: ROUTE_SCHEMA },
          effort: "low",
        }),
      );
    } catch {
      route = { path: "build", id: "", why: "route call failed", change: "" };
    }
  }
  if (route.path !== "build" && !cands.some((c) => c.id === route.id)) route = { ...route, path: "build", id: "" };
  // Reuse is the fast path; at other speeds a fitting tool becomes the base of an adapted one.
  if (route.path === "reuse" && !cfg.reuse) route = { ...route, path: "adapt", change: route.change || "Fill it for this moment and restyle it to the design card." };
  let baseSource: string | null = null;
  if (route.id.startsWith("cache:")) {
    try {
      baseSource = cacheRefill(route.id.slice(6), req.chat, req.members, { ask: req.ask });
    } catch {
      baseSource = null;
    }
  } else if (route.id.startsWith("piece:")) {
    const p = getPiece(route.id.slice(6));
    if (p) baseSource = p.source;
  } else if (route.id) baseSource = docs.find((d) => d.id === route.id)?.source ?? null;
  if (route.path !== "build" && !baseSource) route = { ...route, path: "build" };
  extra.route = { ...route, base: route.path === "build" ? null : route.id };
  emit({ t: "routed", path: route.path, piece: extra.route.base, why: route.why });

  // Reuse: a cached tool refilled for this chat goes straight to the gate.
  if (route.path === "reuse" && route.id.startsWith("cache:") && baseSource) {
    emit({ t: "checking", candidate: 0, attempt: 0 });
    const report = await gate(baseSource);
    if (report.ok) return finish([{ k: 0, source: baseSource, report, ok: true, attempts: 0, rounds: 0, history: [] }], "a cached tool fits and passed the gate");
    route = { ...route, path: "adapt" };
    extra.route.path = "adapt";
  }
  if (route.path === "reuse" && route.id.startsWith("piece:")) {
    const p = getPiece(route.id.slice(6))!;
    try {
      const reply = await call("params", fast, {
        system: `Fill the parameters of the library piece "${p.id}" (${p.name}) from the chat. Use only what the chat gave; never invent amounts. Prefer options people said in the chat; if you propose one nobody said, keep it to a few, and where the schema has a "suggested" list put its label there. Money is integer cents. Titles are plain sentence case. JSON matching the schema only.`,
        messages: [{ role: "user", content: `${chatContext(req)}\n\nThe reading:\n${readingText(reading)}` }],
        json: { name: "params", schema: p.params as Record<string, unknown> },
        effort: "low",
      });
      const filled = fill(p, coerce(p.params, JSON.parse(reply), p.defaults));
      const report = await gate(filled);
      if (report.ok) return finish([{ k: 0, source: filled, report, ok: true, attempts: 0, rounds: 0, history: [] }], "a library piece fits as it is");
    } catch {}
    route = { ...route, path: "adapt" };
    extra.route.path = "adapt";
  }

  // 3. Design card, checked and revised once.
  emit({ t: "drafting", candidate: -1 });
  progress("Designing the card");
  const noteDocs = rank(exemplarDocs().filter((d) => d.note), query, 3).map((r) => r.doc);
  let card: Card;
  try {
    card = parseJson<Card>(
      await call("design", model, {
        system: fillSlots(P(version >= 2 ? "design2.md" : "design.md"), {
          SKILLS: ["one-visual-idea", "chat-card-layout", "people-in-the-picture", "meta-visual-language", "copy-voice"].map((n) => `## ${n}\n\n${skill(n).replace(/^# .*\n/, "")}`).join("\n\n"),
          EXEMPLARS: noteDocs.length ? noteDocs.map((d) => `### ${d.title}\n${(d.note ?? "").slice(0, 1400)}`).join("\n\n") : "(none yet)",
          READING: `${chatContext(req)}\n\nThe reading:\n${readingText(reading)}`,
          ROUTE: route.path === "adapt" ? `This adapts an existing tool (${route.id}): ${route.why} Change: ${route.change}` : "This is a new tool.",
        }),
        messages: [{ role: "user", content: "Write the design card. JSON only." }],
        json: { name: "card", schema: CARD_SCHEMA },
        effort: big ? "medium" : "low",
      }),
    );
  } catch (e) {
    return fail(`design failed: ${(e as Error).message}`);
  }
  let issues = checkCard(card, req, recent);
  extra.cardIssues = issues;
  if (issues.length && left() > 60_000) {
    try {
      card = parseJson<Card>(
        await call("revise", model, {
          system: "You revise a design card for a small group tool. JSON only, the same schema.",
          messages: [{ role: "user", content: fillSlots(P("revise.md"), { ISSUES: issues.map((i) => `- ${i}`).join("\n"), CARD: JSON.stringify(card, null, 1) }) }],
          json: { name: "card", schema: CARD_SCHEMA },
          effort: "low",
        }),
      );
      extra.cardRevised = true;
      issues = checkCard(card, req, recent);
    } catch {}
  }
  extra.card = card;
  emit({ t: "designed", visualIdea: card.visual_idea, issues });

  // 4. Build: only the relevant skills and the nearest one or two exemplars with code.
  const pic = `${card.visual_idea} ${card.picture} ${card.interaction} ${card.satisfying_moment}`;
  const skillNames = ["state-that-verifies"];
  if (/Scene|Placed|SeatMap|Graph|Ticket|Receipt|Thumb|Strip|Heat|Calendar|AvatarBars|Timeline|Ring|Meter|Sparkline|MapStrip|Canvas|svg|draw/i.test(pic)) skillNames.push("drawing-primitives");
  if (reading.shape === "play" || /game|board|turn|quiz|round/i.test(pic)) skillNames.push("games-people-finish");
  if (card.random || /spring|tween|animate|motion|slides|drops|flips|pops/i.test(pic)) skillNames.push("motion-with-meaning");
  extra.skills = skillNames;
  const system = buildSystem(skillNames);
  const codeDocs = rank(docs.filter((d) => d.source && d.kind !== "piece"), `${query} ${pic}`, big ? 2 : 1)
    .map((r) => r.doc)
    .filter((d) => d.id !== route.id);
  if (!codeDocs.length) {
    const p = rank(pieceDocs(), query, 1)[0];
    if (p) codeDocs.push(p.doc);
  }
  extra.exemplars = codeDocs.map((d) => d.id);
  const trim = (s: string, n: number) => (s.split("\n").length > n ? s.split("\n").slice(0, n).join("\n") + "\n// ... (rest of the file omitted)" : s);
  const buildUser = fillSlots(P("build.md"), {
    CONTEXT: chatContext(req),
    CARD: JSON.stringify(card, null, 1),
    BASE:
      route.path === "adapt" && baseSource
        ? `Start from this tool. It already passes the gate. Keep its proven state and checks where they fit; change its content, labels and look to match the card. ${route.change}\n\n\`\`\`tsx\n${baseSource.trim()}\n\`\`\``
        : "",
    EXEMPLARS: codeDocs.length
      ? `A finished tool that passes the gate and shows the look to aim for (a different moment; borrow its patterns, not its content):\n\n${codeDocs.map((d) => `\`\`\`tsx\n${trim(d.source!, big ? 320 : 260)}\n\`\`\``).join("\n\n")}`
      : "",
  });
  extra.buildPromptTokens = estTokens(system) + estTokens(buildUser);

  /**
   * A change to a working file: ask for SEARCH/REPLACE edits (a few lines instead of the whole
   * module, which is most of the wait on a slow model); if they do not apply, ask for the whole file.
   */
  const patch = async (label: string, prompt: string, current: string, nonce: number): Promise<string> => {
    const WHOLE = /Reply with the whole fixed module in one ```tsx block(?: and nothing else)?\./;
    if (WHOLE.test(prompt)) {
      try {
        const reply = await call(label, model, { system, messages: [{ role: "user", content: prompt.replace(WHOLE, EDIT_INSTRUCTIONS) }] }, nonce);
        const edited = applyEdits(current, reply);
        if (edited) {
          editStats.applied++;
          return edited;
        }
        editStats.fallback++;
      } catch {}
    }
    return extractCode(await call(`${label}-whole`, model, { system, messages: [{ role: "user", content: prompt }] }, nonce));
  };

  const runCandidate = async (k: number): Promise<Cand> => {
    emit({ t: "drafting", candidate: k });
    progress(`Building${nCands > 1 ? ` option ${k + 1}` : ""}`);
    let source = extractCode(await call("build", model, { system, messages: [{ role: "user", content: buildUser }] }, k));
    let attempts = 1;
    // Cheap pre-check: static and copy rules on the draft, all findings fixed at once.
    try {
      const pr = await verifyPartial(source);
      const found = pr.findings.filter((f) => f.from !== "types").slice(0, 8);
      if (found.length) {
        emit({ t: "repairing", candidate: k, attempt: 0, rule: found[0]!.rule, message: found[0]!.message });
        const list = found.map((f) => `- line ${f.line}: ${f.rule}: ${f.message}${f.fix ? ` (fix: ${f.fix})` : ""}`).join("\n");
        source = await patch("precheck", `A quick check of your app found these problems. Fix each one with the smallest change; keep everything else.\n\n${list}\n\nThe app:\n\n\`\`\`tsx\n${source.trim()}\n\`\`\`\n\nReply with the whole fixed module in one \`\`\`tsx block.`, source, k);
        attempts++;
      }
    } catch {}
    for (let tries = 0; ; tries++) {
      emit({ t: "checking", candidate: k, attempt: attempts });
      const s = performance.now();
      const report = await gate(source);
      timings.gate = Math.round(((timings.gate ?? 0) * 1000 + performance.now() - s) / 10) / 100;
      if (report.ok || tries >= 3 || left() < 30_000) return { k, source, report, ok: report.ok, attempts, rounds: 0, history: [] };
      const f = report.failures[0] ?? { rule: report.stage, message: "failed" };
      emit({ t: "repairing", candidate: k, attempt: attempts, rule: f.rule, message: f.message });
      source = await patch("repair", repairAll(source, report), source, k * 10 + tries + 1);
      attempts++;
    }
  };

  // 5. See and fix.
  const look = async (c: Cand, round: number): Promise<void> => {
    if (opts.look === false || !c.ok) return;
    progress(`Looking${nCands > 1 ? ` at option ${c.k + 1}` : ""}`);
    const scenes = ["rest", "played", "two", "crowded"] as const;
    let shots: Shot[];
    try {
      shots = await shoot(c.source, { members: req.members, scenes: [...scenes], modes: ["light", "dark"] });
    } catch {
      return;
    }
    c.shots = shots;
    const pick = shots.filter((s) => s.mode === "light" || s.scene === "rest" || s.scene === "played");
    const png = await sheet(pick.map((s) => ({ title: `${SCENE_LABEL[s.scene]} · ${s.mode}`, sub: `${s.height} px${s.errors.length ? ` · errors: ${s.errors[0]!.slice(0, 80)}` : ""}`, png: s.png })), { columns: 3 });
    const rest = shots.find((s) => s.scene === "rest" && s.mode === "light");
    const seen = (rest?.seen ?? []).slice(0, 45).map((s) => `${s.role}${s.primary ? " (primary)" : ""} "${s.text}" at ${s.x},${s.y} ${s.w}x${s.h}${s.size ? ` ${s.size}px/${s.weight}` : ""}`).join("\n");
    try {
      const crit = parseJson<Critique>(
        await call("critic", model, {
          system: "You are a careful product design critic. JSON only.",
          messages: [{ role: "user", content: fillSlots(P(version >= 2 ? "critic2.md" : "critic.md"), { SCENES: pick.map((s) => `${SCENE_LABEL[s.scene]} (${s.mode})`).join(", "), CONTEXT: chatContext(req), CARD: JSON.stringify({ ...card, state: undefined, actions: undefined, invariants: undefined, transitions: undefined }, null, 1), SEEN: seen || "(nothing)", SKILL: skill("meta-visual-language").slice(0, 3500) }) }],
          images: [`data:image/png;base64,${Buffer.from(png).toString("base64")}`],
          json: { name: "critique", schema: CRITIC_SCHEMA },
          effort: "low",
        }, c.k * 10 + round),
      );
      const errs = shots.flatMap((s) => s.errors.map((e) => ({ scene: `${s.scene} ${s.mode}`, where: "render", problem: e.slice(0, 200), fix: "fix the error so the view renders" })));
      crit.fixes = [...errs.slice(0, 2), ...(crit.fixes ?? [])].slice(0, 6);
      c.critique = crit;
      c.score = meanScore(crit);
      extra.criticMode = "image";
      emit({ t: "critic", candidate: c.k, round, score: c.score, fixes: crit.fixes.length });
    } catch {}
  };

  const improve = async (c: Cand): Promise<Cand> => {
    await look(c, 0);
    c.history.push({ round: 0, score: c.score ?? 0, kept: true });
    for (let round = 1; round <= rounds; round++) {
      if (!c.ok || !c.critique || !c.critique.fixes.length || (c.score ?? 0) >= 4.5 || left() < 150_000) break;
      emit({ t: "repairing", candidate: c.k, attempt: c.attempts, rule: "critic", message: c.critique.fixes[0]!.problem });
      const fixes = c.critique.fixes.map((f, i) => `${i + 1}. [${f.scene}] ${f.where}: ${f.problem}. Fix: ${f.fix}`).join("\n");
      let source = await patch("fix", fillSlots(P("fix.md"), { FIXES: fixes, CARD: JSON.stringify(card, null, 1), SOURCE: c.source.trim() }), c.source, c.k * 10 + round);
      let report = await gate(source);
      for (let tries = 0; !report.ok && tries < 2 && left() > 90_000; tries++) {
        source = await patch("repair", repairAll(source, report), source, c.k * 100 + round * 10 + tries);
        report = await gate(source);
      }
      c.rounds = round;
      if (!report.ok) {
        c.history.push({ round, score: 0, kept: false });
        break;
      }
      const next: Cand = { ...c, source, report, attempts: c.attempts + 1, history: c.history };
      await look(next, round);
      const kept = (next.score ?? 0) >= (c.score ?? 0) - 0.05;
      c.history.push({ round, score: next.score ?? 0, kept });
      if (!kept) break;
      c = next;
    }
    return c;
  };

  const settled = await Promise.allSettled(
    Array.from({ length: nCands }, async (_, k) => {
      if (k > 0 && left() < 240_000) throw new Error("no time for another candidate");
      const c = await runCandidate(k);
      return rounds > 0 ? improve(c) : c;
    }),
  );
  const built = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!built.some((c) => c.ok)) {
    const last = built[0];
    const why = last ? `${last.report.stage}: ${last.report.failures[0]?.rule ?? ""} ${last.report.failures[0]?.message ?? ""}`.trim() : settled.find((r) => r.status === "rejected")?.status === "rejected" ? String((settled.find((r) => r.status === "rejected") as PromiseRejectedResult).reason) : "no candidate";
    extra.candidates = built.map(summ);
    return fail(`no candidate passed the gate (${why})`, last);
  }
  return finish(built, "");

  function summ(c: Cand) {
    return { k: c.k, ok: c.ok, mutation: c.report.mutation?.score ?? null, critic: c.score ?? null, rounds: c.rounds, history: c.history, lines: c.source.split("\n").length };
  }

  function finish(cs: Cand[], why: string): GenerateResult & { extra: ComposeExtra } {
    progress("Choosing");
    const passing = cs.filter((c) => c.ok);
    const withTaste = passing.map((c) => ({ c, t: tasteOf(c.source) }));
    // Gate first (all passing), then the critic, then taste when the critic cannot tell them apart,
    // then the stronger checks, then the smaller source.
    withTaste.sort((a, b) => {
      const ds = (b.c.score ?? 0) - (a.c.score ?? 0);
      if (Math.abs(ds) >= 0.25) return ds;
      const dt = b.t.score - a.t.score;
      if (Math.abs(dt) > Math.max(a.t.uncertainty, b.t.uncertainty) / 2) return dt;
      return (b.c.report.mutation?.score ?? 0) - (a.c.report.mutation?.score ?? 0) || a.c.source.length - b.c.source.length;
    });
    const top = withTaste[0]!;
    extra.candidates = cs.map(summ);
    extra.critic = top.c.critique ?? null;
    extra.taste = top.t;
    extra.chosenWhy = why || (passing.length > 1 ? `best of ${passing.length}: critic ${top.c.score ?? "-"}, taste ${top.t.score} ± ${top.t.uncertainty}` : "the only passing candidate");
    if (card) recent.push(`${card.visual_idea} ${card.picture}`.slice(0, 300));
    if (recent.length > 12) recent.splice(0, recent.length - 12);
    emit({ t: "chosen", candidate: top.c.k, why: extra.chosenWhy });
    timings.total = Math.round(performance.now() - t0) / 1000;
    const name = appName(top.c.source);
    const summary = (card?.title ?? reading.job).trim();
    emit({ t: "ready", name, summary });
    return {
      ok: true,
      source: top.c.source,
      report: top.c.report,
      attempts: top.c.attempts,
      timings,
      from: { path: extra.route.path, piece: extra.route.base, model: model.id, cached: false },
      name,
      summary,
      candidates: cs.map((c) => ({ attempts: c.attempts, ok: c.ok, stage: c.report.stage, score: c.report.mutation?.score ?? null, lines: c.source.split("\n").length })),
      extra,
    };
  }
}
