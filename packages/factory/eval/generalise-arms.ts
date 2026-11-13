// Which model arrangement can do the generalise step (src/generalise.ts)?
//
//   bun eval/generalise-arms.ts --arm B [--only slot-machine,room-fit] [--force] [--concurrency 2]
//   bun eval/generalise-arms.ts --summary
//
// Arms:  B contributor Spark, one try · C Spark, best of 4 · D Wonder, one try
//        E Wonder writes the spec (meta, Params type, schema); Spark refactors and writes the second filling
//
// Per tool and arm: both fillings through the gate, three size fillings (2, 6, 15 people) through the
// gate and a headless picture, a leak check on the generalised code, 4 router asks, seconds and
// dollars. Everything lands under eval/out/generalise-arms/<arm>/<tool>/ and results.json.
// Wonder (muse-wonder-1.0) is built here and nowhere else: makeModel() refuses it by design.
// Its spend is metered from the API's usage and capped (WONDER_CAP_USD); see Budget.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, verify, warm } from "@muse/verify";
import { catalog, route, type Card } from "../src/router.ts";
import { generaliseCode, generaliseMeta, the design notes, PARAMS_END, PARAMS_START, refillParams, type Meta } from "../src/generalise.ts";
import { LAB_GATE } from "../src/labloop.ts";
import { closeShoot, sheet, shoot } from "../src/look/shoot.ts";
import { MuseClient, museKey } from "../src/models/muse.ts";
import { makeModel } from "../src/models/index.ts";
import type { CompleteRequest, GenerateRequest, ModelClient } from "../src/types.ts";
import { ASKS } from "./asks.ts";
import { HELDOUT } from "./heldout.ts";
import { LAB_TOOLS } from "./labmatch.ts";
import { ROUTER_ASKS } from "./generalise-arms-asks.ts";

const OUT = join(import.meta.dir, "out", "generalise-arms");
const ROOT = join(import.meta.dir, "..", "..", "..");
const WONDER_CAP_USD = 2.0;
const PRICE = { spark: [0.1, 0.2], wonder: [4, 20] } as const;

const arg = (k: string, d = "") => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? (process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? "1" : process.argv[i + 1]!) : d;
};
const flag = (k: string) => process.argv.includes(`--${k}`);
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]! : 0);
const log = (...a: unknown[]) => console.error(new Date().toISOString().slice(11, 19), ...a);

// ------------------------------------------------------------------------------------ tools

export const TOOLS = ["bake-sale-shifts", "slot-machine", "tailgate-draft", "room-fit", "friend-trivia-pub"] as const;
type ToolId = (typeof TOOLS)[number];
const TWIN: Partial<Record<ToolId, string>> = { "slot-machine": "slot-machine", "room-fit": "room-fit", "friend-trivia-pub": "friend-trivia-pub", "bake-sale-shifts": "signup-board" };

type ToolDef = { id: ToolId; source: string; req: GenerateRequest };
function toolDef(id: ToolId): ToolDef {
  const found = LAB_TOOLS.find((t) => t.id === id) ?? HELDOUT.find((t) => t.id === id) ?? ASKS.find((t) => t.id === id);
  if (!found) throw new Error(`no ask for ${id}`);
  return { id, source: readFileSync(join(OUT, "inputs", `${id}.tsx`), "utf8"), req: { ask: found.ask, chat: found.chat, members: found.members, surface: found.surface } };
}

// ------------------------------------------------------------------------------------ metered models

export type Usage = { calls: number; inTok: number; outTok: number; reasoningTok: number; ms: number; usd: number };
const zero = (): Usage => ({ calls: 0, inTok: 0, outTok: 0, reasoningTok: 0, ms: 0, usd: 0 });
const add = (a: Usage, b: Usage): Usage => ({ calls: a.calls + b.calls, inTok: a.inTok + b.inTok, outTok: a.outTok + b.outTok, reasoningTok: a.reasoningTok + b.reasoningTok, ms: a.ms + b.ms, usd: a.usd + b.usd });

class BudgetStop extends Error {}

/** Wonder spend, persisted after every call. A call is only sent if its worst case still fits under the cap. */
class Budget {
  file = join(OUT, "wonder-spend.json");
  spent = { usd: 0, calls: 0, in: 0, out: 0 };
  reserved = 0;
  constructor(readonly cap: number) {
    if (existsSync(this.file)) this.spent = JSON.parse(readFileSync(this.file, "utf8"));
  }
  reserve(worst: number) {
    if (this.spent.usd + this.reserved + worst > this.cap) throw new BudgetStop(`Wonder budget: spent $${this.spent.usd.toFixed(3)}, next call could cost $${worst.toFixed(3)}, cap $${this.cap.toFixed(2)}`);
    this.reserved += worst;
  }
  settle(worst: number, inTok: number, outTok: number) {
    this.reserved -= worst;
    this.spent.usd += (inTok * PRICE.wonder[0] + outTok * PRICE.wonder[1]) / 1e6;
    this.spent.calls++;
    this.spent.in += inTok;
    this.spent.out += outTok;
    mkdirSync(OUT, { recursive: true });
    writeFileSync(this.file, JSON.stringify({ ...this.spent, usd: Math.round(this.spent.usd * 1e4) / 1e4 }));
  }
}
let budget: Budget | null = null;

/** Output ceilings by step. Reasoning tokens count against them. */
const MAX_OUT: Record<string, number> = { generalise: 16000, "generalise-meta": 6000, "gen-spec": 6000, "gen-second": 4000, "gen-stretch": 12000 };

/** A Muse model that reports real token usage, retries like MuseClient, and (for Wonder) respects the budget. */
class MuseMeter implements ModelClient {
  readonly id: string;
  usage = zero();
  readonly client: MuseClient;
  constructor(readonly model: string, readonly price: readonly [number, number], opts: { effort?: "low" | "medium" | "high"; wonder?: boolean } = {}) {
    this.client = new MuseClient({ model, effort: opts.effort, timeoutMs: 600_000 });
    this.id = `meter:${model}:${opts.effort ?? "medium"}`;
    this.wonder = !!opts.wonder;
  }
  wonder: boolean;
  async complete(req: CompleteRequest): Promise<string> {
    const maxOut = this.wonder ? (MAX_OUT[req.label ?? ""] ?? 8000) : 32000;
    const body = { ...this.client.body(req), max_output_tokens: maxOut };
    let worst = 0;
    if (this.wonder) {
      worst = (JSON.stringify(body).length / 3) * (PRICE.wonder[0] / 1e6) + maxOut * (PRICE.wonder[1] / 1e6);
      budget!.reserve(worst);
    }
    try {
      for (let attempt = 0; ; attempt++) {
        const r = await this.client.raw(body).catch((e: Error) => ({ status: -1, json: null as unknown, text: e.message, ms: 0 }));
        if (r.status === 200) {
          const j = r.json as { status?: string; usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } } };
          const inT = j.usage?.input_tokens ?? 0, outT = j.usage?.output_tokens ?? 0;
          this.usage = add(this.usage, { calls: 1, inTok: inT, outTok: outT, reasoningTok: j.usage?.output_tokens_details?.reasoning_tokens ?? 0, ms: r.ms, usd: (inT * this.price[0] + outT * this.price[1]) / 1e6 });
          if (this.wonder) {
            budget!.settle(worst, inT, outT);
            worst = 0;
          }
          if (j.status === "incomplete") throw new Error(`reply cut off at ${maxOut} output tokens (${j.usage?.output_tokens_details?.reasoning_tokens ?? "?"} of them reasoning)`);
          return (await import("../src/models/muse.ts")).outputText(r.json);
        }
        const retryable = r.status === -1 || r.status === 429 || r.status >= 500;
        if (!retryable || attempt >= (r.status === 429 || r.status === 503 ? 6 : 2)) throw new Error(`Muse ${r.status}: ${r.text.slice(0, 300)}`);
        await Bun.sleep(r.status === 429 || r.status === 503 ? Math.min(30_000, 2000 * 2 ** attempt) : 800 * 2 ** attempt);
      }
    } finally {
      if (worst) budget!.reserved -= worst;
    }
  }
}

type Meter = MuseMeter;
type Arm = "B" | "C" | "D" | "E";
const ARM_NAME: Record<Arm, string> = { B: "Spark, one try", C: "Spark, best of 4", D: "Wonder, one try", E: "Wonder spec, Spark code" };

type Models = { spec?: Meter; code: Meter; meta: Meter; stretch: Meter; all: Meter[] };
function modelsFor(arm: Arm): Models {
  const spark = () => new MuseMeter("muse-spark-1.3-contributor", PRICE.spark);
  const wonder = () => new MuseMeter("muse-wonder-1.0", PRICE.wonder, { effort: "low", wonder: true });
  if (arm === "D") {
    const w = wonder();
    return { code: w, meta: w, stretch: w, all: [w] };
  }
  if (arm === "E") {
    const w = wonder(), s = spark();
    return { spec: w, code: s, meta: s, stretch: s, all: [w, s] };
  }
  const s = spark();
  return { code: s, meta: s, stretch: s, all: [s] };
}

// ------------------------------------------------------------------------------------ the gate

const LAYOUT_RULES = new Set(["clipped-text", "text-overlap", "outside-app", "too-tall", "canvas-text-clipped", "canvas-text-overlap", "painted-over", "overlay-covers-control", "overload-overflow", "state-layout", "hit-area", "hit-misaligned", "tiny-text", "canvas-text-tiny"]);

export type Check = { ok: boolean; stage: string; rules: string[]; message: string; warnings: string[]; layout: string[]; mutation: number | null; budget: number; ms: number };

async function check(src: string, heightBudget: number): Promise<Check> {
  const t0 = performance.now();
  const r = await verify(src, { ...LAB_GATE, heightBudget });
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    ok: r.ok,
    stage: r.stage,
    rules: uniq(r.failures.map((f) => f.rule)),
    message: (r.failures[0]?.message ?? "").slice(0, 240),
    warnings: uniq(r.warnings.map((f) => f.rule)).filter((x) => x !== "weak-invariant"),
    layout: uniq([...r.failures, ...r.warnings].map((f) => f.rule).filter((x) => LAYOUT_RULES.has(x))),
    mutation: r.mutation?.score ?? null,
    budget: heightBudget,
    ms: Math.round(performance.now() - t0),
  };
}

/** The height budget the original tool passes at: 420, or 600 when height is its only failure. */
async function budgetOf(source: string): Promise<number> {
  const r = await verify(source, { ...LAB_GATE, heightBudget: 420 });
  if (r.ok) return 420;
  if (r.failures.every((f) => f.rule === "too-tall") && (await verify(source, { ...LAB_GATE, heightBudget: 600 })).ok) return 600;
  return 420;
}

// ------------------------------------------------------------------------------------ pieces of code

export const paramsBlock = (code: string) => {
  const i = code.indexOf(PARAMS_START), j = code.indexOf(PARAMS_END);
  return i >= 0 && j > i ? code.slice(i, j + PARAMS_END.length) : "";
};
export const outsideParams = (code: string) => {
  const i = code.indexOf(PARAMS_START), j = code.indexOf(PARAMS_END);
  return i >= 0 && j > i ? code.slice(0, i) + code.slice(j + PARAMS_END.length) : code;
};
/** `type Params ...` through the end of the params block. */
const typeAndBlock = (code: string) => {
  const t = code.search(/\btype Params\b/), j = code.indexOf(PARAMS_END);
  return t >= 0 && j > t ? code.slice(t, j + PARAMS_END.length) : paramsBlock(code);
};

// ------------------------------------------------------------------------------------ leaks

let corpusCache: { text: string; words: Set<string>; nums: Set<string> } | null = null;
function* walk(dir: string, exts: RegExp): Generator<string> {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === "out" || f.startsWith(".")) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p, exts);
    else if (exts.test(f)) yield p;
  }
}
/** Words and numbers that appear in shared code: the library, the lab and the app kit. Chat facts are what is not in here. */
function corpus() {
  if (corpusCache) return corpusCache;
  let text = "";
  for (const d of [join(ROOT, "library", "pieces"), join(ROOT, "library", "lab"), join(ROOT, "packages", "app", "src")])
    for (const f of walk(d, /\.(tsx?|json)$/)) text += readFileSync(f, "utf8") + "\n";
  const words = new Set(text.toLowerCase().match(/[a-z][a-z'’-]{2,}/g) ?? []);
  const nums = new Set(text.match(/\b\d{3,}\b/g) ?? []);
  return (corpusCache = { text, words, nums });
}

const STOP = new Set("the and for with from that this you your are not can will but tap mon tue wed thu fri sat sun jan feb mar apr may jun jul aug sep oct nov dec monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december".split(" "));
const stringsAndComments = (src: string) => {
  const out: string[] = [];
  for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\$]|\\.)*)`/g)) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  for (const m of src.matchAll(/\/\/([^\n]*)|\/\*([\s\S]*?)\*\//g)) out.push(m[1] ?? m[2] ?? "");
  return out;
};

/** Distinctive facts of the original chat: names, title words, capitalised words found nowhere in shared code, and odd numbers. */
export function leakTerms(tool: ToolDef): { words: string[]; nums: string[] } {
  const c = corpus();
  const words = new Set<string>();
  for (const m of tool.req.members) words.add(m.name);
  for (const w of (tool.req.chat.title ?? "").match(/[A-Za-z][A-Za-z']{3,}/g) ?? []) if (!STOP.has(w.toLowerCase())) words.add(w);
  for (const s of stringsAndComments(tool.source))
    for (const w of s.match(/\b[A-Z][a-z][A-Za-z'’-]{2,}\b/g) ?? []) if (!c.words.has(w.toLowerCase()) && !STOP.has(w.toLowerCase())) words.add(w);
  // words that are lower-case in the source (a name written as an id, like "sully") but are cast or title names
  const nums = new Set<string>();
  for (const n of tool.source.match(/\b\d{3,}\b/g) ?? []) if (!c.nums.has(n)) nums.add(n);
  return { words: [...words], nums: [...nums] };
}
export function leakHits(code: string, terms: { words: string[]; nums: string[] }): { words: string[]; nums: string[] } {
  const body = outsideParams(code);
  const lower = body.toLowerCase();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    words: terms.words.filter((w) => new RegExp(`(^|[^A-Za-z])${esc(w.toLowerCase())}([^A-Za-z]|$)`).test(lower)),
    nums: terms.nums.filter((n) => new RegExp(`(^|[^0-9.])${n}([^0-9]|$)`).test(body)),
  };
}

// ------------------------------------------------------------------------------------ one try

type Meta2 = Meta & { example_params_json?: string; example_chat?: string; params_type?: string };
type Try = {
  n: number;
  ok: boolean;
  failure: string;
  seconds: number;
  stepSeconds: Record<string, number>;
  id?: string;
  original?: Check;
  second?: Check;
  note?: string;
};

const SPEC_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    use_when: { type: "array", items: { type: "string" } },
    dont_use_when: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    guarantees: { type: "array", items: { type: "string" } },
    params_type: { type: "string" },
    params_schema_json: { type: "string" },
  },
  required: ["id", "name", "use_when", "dont_use_when", "keywords", "guarantees", "params_type", "params_schema_json"],
  additionalProperties: false,
};
const SECOND_SCHEMA = { type: "object", properties: { example_params_json: { type: "string" }, example_chat: { type: "string" } }, required: ["example_params_json", "example_chat"], additionalProperties: false };

async function timed<T>(steps: Record<string, number>, name: string, f: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    return await f();
  } finally {
    steps[name] = Math.round((performance.now() - t0) / 100) / 10;
  }
}

/** Wonder's job in arm E: the meta, the Params type and its schema, from the original app and chat. */
async function writeSpec(tool: ToolDef, model: ModelClient): Promise<Meta2> {
  const reply = await model.complete({
    label: "gen-spec",
    system: "You describe a reusable library piece and specify its parameters. JSON only, matching the schema.",
    messages: [
      {
        role: "user",
        content: `This small live app was written for the one group chat below. A different model will turn it into a reusable piece, so you write the spec it works from:

- \`id\` short kebab-case, \`name\` a plain title.
- \`use_when\` and \`dont_use_when\`: 3 or 4 plain sentences each, naming the closest other kinds of tool.
- \`keywords\`, \`guarantees\` (what the app always keeps true).
- \`params_type\`: the TypeScript source of \`type Params = { ... }\` with a doc comment per field. Every fact from this chat (title, options, items, amounts, names used to find roles, places, times) is a field of it. Arrays work from 0 to their sensible maximum; amounts stay integer cents.
- \`params_schema_json\`: a strict JSON schema (every property required, additionalProperties false) for Params, as a string.

${chatContextText(tool.req)}

\`\`\`tsx
${tool.source.trim()}
\`\`\``,
      },
    ],
    json: { name: "spec", schema: SPEC_SCHEMA },
  });
  return JSON.parse(reply) as Meta2;
}
import { chatContext } from "../src/prompts.ts";
const chatContextText = chatContext;

async function writeSecond(code: string, schema: string, model: ModelClient): Promise<{ example_params_json: string; example_chat: string }> {
  const reply = await model.complete({
    label: "gen-second",
    system: "You write a second example for a reusable library piece. JSON only, matching the schema.",
    messages: [
      {
        role: "user",
        content: `Below are a piece's Params type with the values of its first chat, and the strict JSON schema of Params. \`example_params_json\` is a second parameter set for a different, made-up college group chat of the same kind (different names, options and amounts), as a JSON string that fits the schema. \`example_chat\` is that chat in 3 to 6 lines.\n\n\`\`\`ts\n${typeAndBlock(code)}\n\`\`\`\n\nSchema:\n${schema}`,
      },
    ],
    json: { name: "second", schema: SECOND_SCHEMA },
  });
  return JSON.parse(reply);
}

type TryOut = { t: Try; code?: string; meta?: Meta2; second?: string; example?: unknown; schema?: unknown };

async function attempt(arm: Arm, tool: ToolDef, n: number, M: Models, dir: string, heightBudget: number): Promise<TryOut> {
  const steps: Record<string, number> = {};
  const t0 = performance.now();
  const t: Try = { n, ok: false, failure: "", seconds: 0, stepSeconds: steps };
  const out: TryOut = { t };
  const tdir = join(dir, `try${n}`);
  mkdirSync(tdir, { recursive: true });
  const done = (failure: string) => {
    t.failure = failure;
    t.seconds = Math.round((performance.now() - t0) / 100) / 10;
    writeFileSync(join(tdir, "try.json"), JSON.stringify(t, null, 1));
    return out;
  };
  try {
    let spec: Meta2 | undefined;
    if (M.spec) {
      spec = await timed(steps, "spec", () => writeSpec(tool, M.spec!));
      writeFileSync(join(tdir, "spec.json"), JSON.stringify(spec, null, 1));
      out.meta = spec;
    }
    const code = await timed(steps, "code", () => generaliseCode(tool.req, tool.source, M.code, spec?.params_type));
    out.code = code;
    writeFileSync(join(tdir, "piece.tsx"), code);
    if (!code.includes(PARAMS_START) || !code.includes(PARAMS_END)) return done("no @params block in the generalised code");
    let meta: Meta2;
    if (spec) {
      const sec = await timed(steps, "second", () => writeSecond(code, spec!.params_schema_json as string, M.meta));
      meta = { ...spec, ...sec };
    } else meta = await timed(steps, "meta", () => generaliseMeta(code, M.meta));
    out.meta = meta;
    writeFileSync(join(tdir, "meta.json"), JSON.stringify(meta, null, 1));
    let example: unknown, schema: unknown;
    try {
      example = JSON.parse(String(meta.example_params_json));
      schema = JSON.parse(String(meta.params_schema_json));
    } catch {
      return done("meta JSON did not parse");
    }
    out.example = example;
    out.schema = schema;
    t.id = String(meta.id).toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40) || "candidate";
    let second: string;
    try {
      second = refillParams(code, example);
    } catch (e) {
      return done((e as Error).message);
    }
    out.second = second;
    writeFileSync(join(tdir, "second.tsx"), second);
    const [a, b] = await timed(steps, "gate", async () => [await check(code, heightBudget), await check(second, heightBudget)] as const);
    t.original = a;
    t.second = b;
    if (!a.ok) return done(`gate failed on the original filling: ${a.rules[0] ?? a.stage}`);
    if (!b.ok) return done(`gate failed on the second filling: ${b.rules[0] ?? b.stage}`);
    t.ok = true;
    return done("");
  } catch (e) {
    if (e instanceof BudgetStop) {
      t.note = "budget";
      return done(e.message);
    }
    return done(`error: ${(e as Error).message.slice(0, 200)}`);
  }
}

// ------------------------------------------------------------------------------------ size stretch

const STRETCH_SCHEMA = {
  type: "object",
  properties: {
    fillings: {
      type: "array",
      items: {
        type: "object",
        properties: { people: { type: "integer" }, chat: { type: "string" }, members: { type: "array", items: { type: "string" } }, params_json: { type: "string" } },
        required: ["people", "chat", "members", "params_json"],
        additionalProperties: false,
      },
    },
  },
  required: ["fillings"],
  additionalProperties: false,
};

export type SizeResult = { people: number; ok: boolean; failure: string; check?: Check; layout: string[]; overflow: string[]; heightPx: number; errors: string[]; png?: string; members?: number };

async function stretch(tool: ToolDef, win: TryOut, model: ModelClient, dir: string, heightBudget: number): Promise<{ sizes: SizeResult[]; seconds: number; failure?: string }> {
  const t0 = performance.now();
  const code = win.code!;
  const meta = win.meta!;
  let fillings: { people: number; chat: string; members: string[]; params_json: string }[] = [];
  try {
    const reply = await model.complete({
      label: "gen-stretch",
      system: "You write parameter sets for a reusable group-chat tool. JSON only, matching the schema.",
      messages: [
        {
          role: "user",
          content: `Tool: ${meta.name}. ${(meta.use_when as string[])?.slice(0, 2).join(" ")}\n\nIts Params type, with the values of the chat it was first made for (for the shape only):\n\n\`\`\`ts\n${typeAndBlock(code)}\n\`\`\`\n\nStrict JSON schema of Params:\n${meta.params_schema_json}\n\nWrite three fillings for three new, made-up college group chats (different from the one above): the first with exactly 2 people, the second with exactly 6, the third with exactly 15. For each: \`people\` (2, 6 or 15), \`chat\` (the chat in 3 to 6 lines), \`members\` (the first names of all N people, unique, exactly N), and \`params_json\` (the whole Params object as a JSON string that fits the schema; use those names wherever the tool needs people).`,
        },
      ],
      json: { name: "stretch", schema: STRETCH_SCHEMA },
    });
    fillings = (JSON.parse(reply) as { fillings: typeof fillings }).fillings;
  } catch (e) {
    const failure = e instanceof BudgetStop ? e.message : `stretch call failed: ${(e as Error).message.slice(0, 160)}`;
    return { sizes: [2, 6, 15].map((p) => ({ people: p, ok: false, failure, layout: [], overflow: [], heightPx: 0, errors: [] })), seconds: (performance.now() - t0) / 1000, failure };
  }
  const sizes: SizeResult[] = [];
  for (const people of [2, 6, 15]) {
    const f = fillings.find((x) => x.people === people) ?? fillings[[2, 6, 15].indexOf(people)];
    const res: SizeResult = { people, ok: false, failure: "", layout: [], overflow: [], heightPx: 0, errors: [] };
    sizes.push(res);
    if (!f) {
      res.failure = "no filling written";
      continue;
    }
    res.members = f.members?.length;
    writeFileSync(join(dir, `size-${people}.params.json`), JSON.stringify(f, null, 1));
    let src: string;
    try {
      src = refillParams(code, JSON.parse(f.params_json));
    } catch (e) {
      res.failure = `filling did not parse: ${(e as Error).message.slice(0, 100)}`;
      continue;
    }
    writeFileSync(join(dir, `size-${people}.tsx`), src);
    const c = await check(src, heightBudget);
    res.check = c;
    res.ok = c.ok;
    res.failure = c.ok ? "" : `${c.rules[0] ?? c.stage}: ${c.message.slice(0, 120)}`;
    res.layout = c.layout;
    // picture: the filling's own people in the chat, at rest, light mode
    try {
      const names = (f.members?.length ? f.members : []).slice(0, people);
      const members = names.map((name, i) => ({ id: `m_${i}_${name.toLowerCase().replace(/[^a-z]/g, "")}`, name }));
      const shots = await shoot(src, { members: members.length ? members : undefined, scenes: ["rest"], modes: ["light"], max: 15 });
      const s = shots[0];
      if (s) {
        res.errors = s.errors;
        res.heightPx = s.height;
        res.overflow = s.seen.filter((e) => e.x < -1 || e.x + e.w > 394).map((e) => `${e.tag} "${e.text.slice(0, 24)}" x${e.x} w${e.w}`).slice(0, 5);
        if (s.png.length) {
          writeFileSync(join(dir, `size-${people}.png`), s.png);
          res.png = `size-${people}.png`;
        }
      }
    } catch (e) {
      res.errors = [`shot failed: ${(e as Error).message.slice(0, 100)}`];
    }
  }
  return { sizes, seconds: Math.round((performance.now() - t0) / 100) / 10 };
}

// ------------------------------------------------------------------------------------ router

type RouterRow = { ask: string; should: boolean; picked: string[]; nothingFits: boolean; right: boolean };
let routerModel: ModelClient | null = null;
async function routerTest(tool: ToolDef, meta: Meta2, example: unknown): Promise<{ right: number; of: number; rows: RouterRow[] }> {
  routerModel ??= makeModel("muse:muse-ember-1.0");
  const id = `cand-${String(meta.id).slice(0, 30)}`;
  const twin = TWIN[tool.id];
  const first = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const exWords: string[] = [];
  const walkV = (v: unknown) => {
    if (exWords.join(" · ").length > 90) return;
    if (typeof v === "string" && v.length > 1 && v.length < 40) exWords.push(v);
    else if (Array.isArray(v)) v.slice(0, 3).forEach(walkV);
    else if (v && typeof v === "object") Object.values(v).slice(0, 6).forEach(walkV);
  };
  walkV(example);
  const card: Card = {
    id,
    name: first(meta.name, 40),
    surface: SURFACE_OF[tool.req.surface] ?? "messenger",
    summary: `${first(meta.name, 40)}. Keywords: ${((meta.keywords as string[]) ?? []).slice(0, 8).join(", ")}`.slice(0, 160),
    use: ((meta.use_when as string[]) ?? []).slice(0, 3).map((s) => first(s, 90)),
    dont: ((meta.dont_use_when as string[]) ?? []).slice(0, 2).map((s) => first(s, 70)),
    example: exWords.join(" · ").slice(0, 110),
    height: 0,
  };
  const cards = [...catalog().filter((c) => c.id !== twin), card];
  const rows: RouterRow[] = [];
  for (const a of ROUTER_ASKS[tool.id]) {
    const d = await route({ ask: a.ask, chat: a.chat, members: tool.req.members, surface: tool.req.surface }, routerModel, { fill: false, cards });
    const picked = d.picks.map((p) => p.id);
    const isMine = picked[0] === id;
    rows.push({ ask: a.ask, should: a.should, picked: picked.map((p) => (p === id ? "CANDIDATE" : p)), nothingFits: d.nothingFits, right: a.should ? isMine : !isMine });
  }
  return { right: rows.filter((r) => r.right).length, of: rows.length, rows };
}
const SURFACE_OF: Record<string, string> = { chat: "messenger", event: "event", group: "group", feed: "feed", marketplace: "marketplace", gaming: "gaming", story: "story" };

// ------------------------------------------------------------------------------------ one tool, one arm

export type ToolResult = {
  arm: Arm;
  tool: ToolId;
  tries: Try[];
  passed: boolean;
  triesUsed: number;
  id?: string;
  size: SizeResult[];
  sizePasses: number;
  leak: { words: string[]; nums: string[]; terms: number } | null;
  router: { right: number; of: number; rows: RouterRow[] } | null;
  seconds: number;
  sizeSeconds: number;
  usage: Usage;
  usd: number;
  skipped?: string;
  models: string[];
};

async function runTool(arm: Arm, tool: ToolDef, maxTries: number): Promise<ToolResult> {
  const dir = join(OUT, arm, tool.id);
  mkdirSync(dir, { recursive: true });
  const M = modelsFor(arm);
  const heightBudget = await budgetOf(tool.source);
  const tries: Try[] = [];
  let last: TryOut | null = null;
  let winner: TryOut | null = null;
  const t0 = performance.now();
  for (let n = 1; n <= maxTries; n++) {
    log(`${arm} ${tool.id}: try ${n}`);
    const o = await attempt(arm, tool, n, M, dir, heightBudget);
    tries.push(o.t);
    last = o;
    log(`${arm} ${tool.id}: try ${n} ${o.t.ok ? "PASS" : "fail"} ${o.t.failure} (${o.t.seconds}s)`);
    if (o.t.ok) {
      winner = o;
      break;
    }
    if (o.t.note === "budget") break;
  }
  const seconds = Math.round((performance.now() - t0) / 100) / 10;
  const keep = winner ?? last;
  if (keep?.code) {
    writeFileSync(join(dir, "piece.tsx"), keep.code);
    if (keep.meta) writeFileSync(join(dir, "meta.json"), JSON.stringify(keep.meta, null, 1));
  }
  let size: SizeResult[] = [];
  let sizeSeconds = 0;
  if (winner) {
    const s = await stretch(tool, winner, M.stretch, dir, heightBudget);
    size = s.sizes;
    sizeSeconds = s.seconds;
    log(`${arm} ${tool.id}: sizes ${size.map((x) => `${x.people}:${x.ok ? "ok" : "no"}`).join(" ")}`);
  }
  let leak: ToolResult["leak"] = null;
  if (keep?.code && keep.code.includes(PARAMS_START)) {
    const terms = leakTerms(tool);
    const hits = leakHits(keep.code, terms);
    leak = { ...hits, terms: terms.words.length + terms.nums.length };
  }
  let router: ToolResult["router"] = null;
  if (keep?.meta && Array.isArray(keep.meta.use_when)) {
    try {
      router = await routerTest(tool, keep.meta, keep.example);
    } catch (e) {
      log(`${arm} ${tool.id}: router failed ${(e as Error).message.slice(0, 120)}`);
    }
  }
  const usage = M.all.reduce((u, m) => add(u, m.usage), zero());
  const skipped = tries.at(-1)?.note === "budget" ? tries.at(-1)!.failure : undefined;
  const res: ToolResult = {
    arm, tool: tool.id, tries, passed: !!winner, triesUsed: tries.length, id: keep?.t.id, size,
    sizePasses: size.filter((s) => s.ok).length, leak, router, seconds, sizeSeconds, usage, usd: Math.round(usage.usd * 1e4) / 1e4, skipped,
    models: M.all.map((m) => m.id),
  };
  writeFileSync(join(dir, "result.json"), JSON.stringify(res, null, 1));
  return res;
}

// ------------------------------------------------------------------------------------ summary

function loadAll(): ToolResult[] {
  const out: ToolResult[] = [];
  for (const arm of ["B", "C", "D", "E"] as Arm[])
    for (const t of TOOLS) {
      const f = join(OUT, arm, t, "result.json");
      if (existsSync(f)) out.push(JSON.parse(readFileSync(f, "utf8")));
    }
  return out;
}

function summary() {
  const all = loadAll();
  writeFileSync(join(OUT, "results.json"), JSON.stringify({ tools: TOOLS, wonder: existsSync(join(OUT, "wonder-spend.json")) ? JSON.parse(readFileSync(join(OUT, "wonder-spend.json"), "utf8")) : null, results: all }, null, 1));
  const rows = ["| arm | tools run | both fillings pass | size stretch passes | layout flags | leaks (tools / terms) | router right | median seconds | mean tries | dollars per tool |", "|---|---|---|---|---|---|---|---|---|---|"];
  for (const arm of ["B", "C", "D", "E"] as Arm[]) {
    const rs = all.filter((r) => r.arm === arm);
    if (!rs.length) continue;
    const ran = rs.filter((r) => !r.skipped);
    const layout = rs.reduce((n, r) => n + r.size.filter((s) => s.layout.length || s.overflow.length).length, 0);
    const leakTools = rs.filter((r) => r.leak && (r.leak.words.length || r.leak.nums.length)).length;
    const leakTerms = rs.reduce((n, r) => n + (r.leak ? r.leak.words.length + r.leak.nums.length : 0), 0);
    const rr = rs.reduce((n, r) => n + (r.router?.right ?? 0), 0), ro = rs.reduce((n, r) => n + (r.router?.of ?? 0), 0);
    rows.push(
      `| ${arm} ${ARM_NAME[arm]} | ${ran.length}${rs.length > ran.length ? ` (+${rs.length - ran.length} skipped for budget)` : ""} | ${rs.filter((r) => r.passed).length} of ${ran.length} | ${rs.reduce((n, r) => n + r.sizePasses, 0)} of ${ran.length * 3} | ${layout} | ${leakTools} / ${leakTerms} | ${rr} of ${ro} | ${median(ran.map((r) => r.seconds + r.sizeSeconds))} | ${(ran.reduce((n, r) => n + r.triesUsed, 0) / Math.max(1, ran.length)).toFixed(1)} | ${arm === "A" ? "plan (not metered)" : "$" + (ran.reduce((n, r) => n + r.usd, 0) / Math.max(1, ran.length)).toFixed(3)} |`,
    );
  }
  console.log(rows.join("\n"));
  const w = existsSync(join(OUT, "wonder-spend.json")) ? JSON.parse(readFileSync(join(OUT, "wonder-spend.json"), "utf8")) : null;
  if (w) console.log(`\nWonder spend: $${w.usd} over ${w.calls} calls (${w.in} in, ${w.out} out), cap $${WONDER_CAP_USD.toFixed(2)}`);
  console.log("\n| arm | tool | tries | both pass | failure | sizes 2/6/15 | layout flags | leaked words | leaked numbers | router | seconds | dollars |\n|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of all)
    console.log(
      `| ${r.arm} | ${r.tool} | ${r.triesUsed} | ${r.passed ? "yes" : "no"} | ${(r.skipped ?? r.tries.at(-1)?.failure ?? "").slice(0, 70)} | ${r.size.length ? r.size.map((s) => (s.ok ? "ok" : "no")).join("/") : "-"} | ${r.size.map((s) => [...s.layout, ...(s.overflow.length ? ["overflow"] : [])].join("+") || "-").join("/") || "-"} | ${r.leak?.words.join(", ") || "-"} | ${r.leak?.nums.join(", ") || "-"} | ${r.router ? `${r.router.right}/${r.router.of}` : "-"} | ${(r.seconds + r.sizeSeconds).toFixed(0)} | ${r.arm === "A" ? "plan" : "$" + r.usd.toFixed(3)} |`,
    );
}

// ------------------------------------------------------------------------------------ main

if (import.meta.main) {
  mkdirSync(OUT, { recursive: true });
  if (flag("summary")) {
    summary();
    process.exit(0);
  }
  const arm = arg("arm") as Arm;
  if (!["B", "C", "D", "E"].includes(arm)) throw new Error("--arm B|C|D|E");
  museKey(); // fail early if the Keychain item is missing (the key itself is never printed)
  const only = arg("only") ? arg("only").split(",") : null;
  // Smallest first, so a budget stop costs the biggest tools.
  const ids = TOOLS.filter((t) => !only || only.includes(t));
  if (arm === "D" || arm === "E") budget = new Budget(WONDER_CAP_USD);
  const maxTries = arm === "C" ? 4 : 1;
  await warm();
  const queue = ids.filter((id) => flag("force") || !existsSync(join(OUT, arm, id, "result.json")));
  const conc = Number(arg("concurrency", "2"));
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift()!;
      try {
        const r = await runTool(arm, toolDef(id), maxTries);
        log(`${arm} ${id}: done · passed ${r.passed} · sizes ${r.sizePasses}/3 · router ${r.router?.right ?? "-"}/${r.router?.of ?? "-"} · ${r.seconds + r.sizeSeconds}s · $${r.usd}`);
      } catch (e) {
        log(`${arm} ${id}: FAILED ${(e as Error).message.slice(0, 300)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
  if (budget) log(`Wonder spend so far: $${budget.spent.usd.toFixed(4)} over ${budget.spent.calls} calls`);
  summary();
  await closeShoot();
  await shutdown();
  // contact sheet of the 15-person fillings
  void sheet;
  process.exit(0);
}
