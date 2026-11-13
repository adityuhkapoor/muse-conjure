// How long an ordinary chat ask takes on the Muse path, stage by stage, and whether the Mini it
// fills is any good. 16 asks (4 seeded chats x decide / money / schedule / game), 3 runs each, on
// the live models with every cache off, through the real generate() (router, fill with its net,
// grounding, the light check).
//
//   bun eval/speed.ts --name net --runs 3 [--conc 3] [--only 4] [--ask 7]
//
// The configuration is the environment (README, "Environment switches"): MUSE_FILL=spark is the old
// path, MUSE_FILL_EFFORT, MUSE_ONE_CALL, MUSE_CATALOG and so on. Writes eval/out/speed/<name>.json
// and prints one summary line per stage. Seconds are wall-clock per ask, measured by the model calls
// each ask made (decide, route, fill, check), not by a stopwatch around the whole pipeline.
//
// Usefulness (1 to 5) is scored by reading the filled params against the chat: `expect` lists the
// facts a useful fill has to carry (written from the seeded chats); the score is the share found,
// capped at 3 when anything in the fill is not grounded, 1 when there is no Mini. The rows keep the
// params so the scores can be read.

import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fill as fillLib, labPiece } from "@muse/library";
import { verify, warm } from "@muse/verify";
import { messages as apt4b } from "../../../services/demo/chats/apt4b.ts";
import { messages as boys } from "../../../services/demo/chats/boys.ts";
import { messages as econ140 } from "../../../services/demo/chats/econ140.ts";
import { messages as senior } from "../../../services/demo/chats/senior.ts";
import { firstName } from "../../../services/demo/seed.ts";
import { change, paramsOf } from "../src/change.ts";
import { contentAtoms } from "../src/fillnet.ts";
import { generate } from "../src/generate.ts";
import { groundOf, problems } from "../src/ground.ts";
import { labExample } from "../src/lab.ts";
import { makeModel } from "../src/models/index.ts";
import { onCall, type CallStat } from "../src/models/muse.ts";
import { routerModelFor } from "../src/router.ts";
import type { GenerateRequest } from "../src/types.ts";

type Spec = { chat: "senior" | "boys" | "apt4b" | "econ140"; kind: "decide" | "money" | "schedule" | "game"; ask: string; /** facts a useful fill carries (lowercase, found in the params JSON) */ expect: string[] };
export const SPEED_ASKS: Spec[] = [
  { chat: "senior", kind: "decide", ask: "muse settle where we eat tonight", expect: ["thai basil", "sushi ko", "taco truck"] },
  { chat: "senior", kind: "money", ask: "muse split the cayucos house deposit", expect: ["140", "cayucos"] },
  { chat: "senior", kind: "schedule", ask: "muse what time should we leave tonight", expect: ["9:45", "10:15"] },
  { chat: "senior", kind: "game", ask: "muse make us a road trip bingo", expect: ["wrong exit"] },
  { chat: "boys", kind: "decide", ask: "muse halal cart or lupe's, decide", expect: ["halal cart", "lupe", "night owl"] },
  { chat: "boys", kind: "money", ask: "muse collect $20 each for will's record player", expect: ["20", "record player"] },
  { chat: "boys", kind: "schedule", ask: "muse what time do we leave for the game friday", expect: ["friday", "game"] },
  { chat: "boys", kind: "game", ask: "muse make a bracket for food after the show", expect: ["halal cart", "lupe", "night owl"] },
  { chat: "apt4b", kind: "decide", ask: "muse decide who's on dishes this week", expect: ["dishes"] },
  { chat: "apt4b", kind: "money", ask: "muse split the electric bill", expect: ["142"] },
  { chat: "apt4b", kind: "schedule", ask: "muse make a dishes schedule for the week", expect: ["dishes"] },
  { chat: "apt4b", kind: "game", ask: "muse make a guessing game about who ate the oat milk", expect: ["oat milk", "aditya"] },
  { chat: "econ140", kind: "decide", ask: "muse vote on where we meet sunday", expect: ["union"] },
  { chat: "econ140", kind: "money", ask: "muse split the snacks cost", expect: [] },
  { chat: "econ140", kind: "schedule", ask: "muse lock in sunday 7pm", expect: ["sun", "7"] },
  { chat: "econ140", kind: "game", ask: "muse quiz us on market power", expect: ["market power"] },
];

const SEEDS = { senior, boys, apt4b, econ140 };
const MEMBERS: Record<string, string[]> = { senior: ["me", "maya", "dev", "jonah", "priya", "theo"], boys: ["me", "dev", "jonah", "theo"], apt4b: ["me", "maya", "priya", "dev"], econ140: ["me", "tess", "zoe", "kev", "ava", "omar"] };
const TITLE: Record<string, string> = { senior: "senior week", boys: "the boys", apt4b: "apt 4b", econ140: "econ 140 final" };
const wire = (id: string) => (id === "me" ? "noa" : id);

/** The chat as the shell sends it: the last 40 texts, people by first name. */
export function chatOf(id: keyof typeof SEEDS): Pick<GenerateRequest, "chat" | "members"> {
  const said = SEEDS[id].filter((m) => (m.kind === "text" || m.kind === "link") && m.from !== "system").map((m) => ({ from: m.from === "muse" ? "Muse" : firstName(wire(m.from)), text: m.text ?? m.link?.title ?? "" }));
  return { chat: { title: TITLE[id]!, messages: said.slice(-40) }, members: MEMBERS[id]!.map((m) => ({ id: wire(m), name: firstName(wire(m)) })) };
}

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1]! : d;
};

export const secs = (ms: number) => Math.round(ms) / 1000;
export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2) + (s.length % 2 ? 0 : 0)]! : 0;
};

/** One gate run at a time, as the service queues them. */
class Gates {
  tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const n = this.tail.then(fn, fn);
    this.tail = n.catch(() => {});
    return n;
  }
}

type Run = { ctx: { stats: CallStat[] } };
const als = new AsyncLocalStorage<Run>();
const all: CallStat[] = [];
onCall((s) => {
  all.push(s);
  als.getStore()?.ctx.stats.push(s);
});

/** A model as the logs name it: Muse models by name, any other provider as "local provider". */
const nm = (m: string) => (m.startsWith("muse") ? m.replace("muse-", "").replace("-1.0", "").replace("spark-1.3-contributor", "spark") : "local");
const sum = (xs: CallStat[], f: (s: CallStat) => boolean) => secs(xs.filter(f).reduce((n, s) => n + s.ms, 0));

// ---------------------------------------------------------------- change: params tier and the decision gate

type ChangeSpec = { tool: "dinner-veto" | "utilities-split"; ask: string; /** a test on the new params JSON */ ok: (p: string) => boolean };
const CHANGES: ChangeSpec[] = [
  { tool: "dinner-veto", ask: "muse add pho to the options", ok: (p) => /pho/i.test(p) && /sakura ramen/i.test(p) },
  { tool: "dinner-veto", ask: "muse take out Smoke & Barrel", ok: (p) => !/smoke & barrel/i.test(p) && /basil thai/i.test(p) },
  { tool: "dinner-veto", ask: "muse rename Golden Dumpling to Dumpling House", ok: (p) => /dumpling house/i.test(p) && !/golden dumpling/i.test(p) },
  { tool: "dinner-veto", ask: "muse change the time to 8:00", ok: (p) => /"time":\s*"8:00/.test(p) },
  { tool: "utilities-split", ask: "muse make the electric bill $150", ok: (p) => /"cents":\s*15000/.test(p) },
  { tool: "utilities-split", ask: "muse add Rae to the people", ok: (p) => /"people":\[[^\]]*Rae/.test(p) },
  { tool: "utilities-split", ask: "muse change the title to November utilities", ok: (p) => /November utilities/.test(p) },
  { tool: "utilities-split", ask: "muse remove the water bill", ok: (p) => !/"Water"/.test(p) && /"Electric"/.test(p) },
];

/** The "change a Mini" params tier on the live models: seconds and whether the new params are what the ask said. */
async function changesMode(name: string, runs: number) {
  const { fill: fillLib2 } = await import("@muse/library");
  const main = makeModel(process.env.MUSE_MODEL ?? "muse");
  const fast = routerModelFor(main)!;
  const rows: Record<string, unknown>[] = [];
  const gates = new Gates();
  const light = (s: string) => gates.run(() => verify(s, { skip: ["determinism", "invariants", "mutation"] }));
  const jobs = CHANGES.flatMap((c) => Array.from({ length: runs }, (_, r) => ({ c, r })));
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (;;) {
        const j = jobs[next++];
        if (!j) return;
        const { c, r } = j;
        const lab = labPiece(c.tool)!;
        const source = fillLib2(lab, labExample(c.tool) ?? {});
        const ctx = { stats: [] as CallStat[] };
        await als.run({ ctx }, async () => {
          const t0 = performance.now();
          const res = await change({ ask: c.ask, chat: { title: "chat", messages: [] }, members: [{ id: "a", name: "Maya" }, { id: "b", name: "Theo" }], explicit: true, tool: { name: lab.name, source, piece: c.tool }, log: [] }, { fast, main, gate: light, libraryGate: light });
          const p = res.t === "done" ? JSON.stringify(paramsOf(res.source) ?? {}) : "";
          const row = { ask: c.ask, run: r, t: res.t, tier: res.t === "done" ? res.tier : null, s: secs(performance.now() - t0), ok: res.t === "done" && c.ok(p), calls: ctx.stats.map((x) => `${x.label}:${nm(x.model)}:${x.effort}:${secs(x.ms)}`), reply: res.t === "reply" ? res.text : null };
          rows.push(row);
          console.log(`${row.ask.padEnd(50)} ${row.t} ${row.tier ?? ""} ${row.s.toFixed(1)}s ok=${row.ok}  ${row.calls.join(" ")}`);
        });
      }
    }),
  );
  const ss = rows.map((r) => r.s as number);
  const summary = { name, runs: rows.length, median: median(ss), worst: Math.max(...ss), right: rows.filter((r) => r.ok).length };
  console.log(JSON.stringify(summary));
  const out = join(import.meta.dir, "out", "speed", `${name}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ summary, rows }, null, 1));
}

/** How many plain asks skip the decision, and whether any real change would: no model calls. */
async function gateMode() {
  delete process.env.MUSE_CHANGE_SKIP;
  const { mayBeChange } = await import("../src/change-gate.ts");
  const { ASKS } = await import("./declines.ts");
  const { fill: fillLib2 } = await import("@muse/library");
  const members = ["Maya", "Aditya", "Calvin", "Will", "Tsai Lin", "Arun"];
  const tools = ["dinner-veto", "utilities-split", "chore-wheel", "road-bingo"].map((t) => {
    const lab = labPiece(t)!;
    const src = fillLib2(lab, labExample(t) ?? {});
    return { tool: { name: lab.name, piece: t }, params: paramsOf(src) };
  });
  // [the Mini in the chat, the ask]: each is a change to that Mini
  const changes: [string, string][] = [
    ["dinner-veto", "muse add pho"], ["dinner-veto", "muse add thai to the list"], ["dinner-veto", "muse remove sushi ko"], ["dinner-veto", "muse take out the taco truck"], ["dinner-veto", "muse rename it to friday dinner"],
    ["dinner-veto", "muse change the time to 8"], ["dinner-veto", "muse make it a bracket instead"], ["dinner-veto", "muse also add oat milk"], ["dinner-veto", "muse sunday not saturday"], ["dinner-veto", "muse thai too"],
    ["dinner-veto", "muse include the dive bar"], ["dinner-veto", "muse veto thai basil"], ["utilities-split", "muse can you make the bill 150"], ["utilities-split", "muse drop the water bill"], ["utilities-split", "muse put rae on the list"],
    ["utilities-split", "muse make the electric $180"], ["utilities-split", "muse update the title"], ["utilities-split", "muse split the wifi too"], ["chore-wheel", "muse add dishes"], ["chore-wheel", "muse make it weekly"],
    ["chore-wheel", "muse move it to saturday"], ["chore-wheel", "muse turn this into a bracket"], ["road-bingo", "muse add a square for wrong exit"], ["road-bingo", "muse make the board bigger"], ["road-bingo", "muse remove the sing along one"],
    ["road-bingo", "muse extend it to friday"], ["road-bingo", "muse oat milk instead of almond"], ["road-bingo", "muse fix the typo"],
  ];
  const plain = [...SPEED_ASKS.map((a) => a.ask), ...ASKS.filter((a) => a.want === "mini").map((a) => a.ask)];
  const byId = new Map(tools.map((t) => [t.tool.piece, t]));
  const kept = (ask: string) => tools.some((t) => mayBeChange(ask, t.tool, t.params, members));
  const skipped = plain.filter((a) => !kept(a));
  const lost = changes.filter(([id, a]) => !mayBeChange(a, byId.get(id)!.tool, byId.get(id)!.params, members)).map(([id, a]) => `${id}: ${a}`);
  console.log(`changes the gate would wrongly skip: ${lost.length} of ${changes.length}`, lost);
  console.log(`plain asks skipped on every tool: ${skipped.length} of ${plain.length}`);
  // per tool: how many plain asks skip
  for (const t of tools) console.log(`  ${t.tool.piece}: skips ${plain.filter((a) => !mayBeChange(a, t.tool, t.params, members)).length} of ${plain.length}`);
}

if (import.meta.main) {
  process.env.MUSE_NO_CACHE = "1";
  // the decide stage is timed as the model call itself; how often the gate skips it is measured by --gate-check
  process.env.MUSE_CHANGE_SKIP = "0";
  const name = arg("name", "run");
  const runs = Number(arg("runs", "3"));
  if (arg("mode", "ask") === "changes") {
    await warm();
    await changesMode(name, runs);
    process.exit(0);
  }
  if (arg("mode", "ask") === "gate") {
    await gateMode();
    process.exit(0);
  }
  const conc = Number(arg("conc", "3"));
  const only = Number(arg("only", "0"));
  const one = Number(arg("ask", "-1"));
  const asks = SPEED_ASKS.map((a, i) => ({ ...a, n: i })).filter((a) => (one >= 0 ? a.n === one : only ? a.n < only : true));
  await warm();
  const gates = new Gates();
  const light = (s: string) => gates.run(() => verify(s, { skip: ["determinism", "invariants", "mutation"] }));
  const main = makeModel(process.env.MUSE_MODEL ?? "muse");
  const jobs = asks.flatMap((a) => Array.from({ length: runs }, (_, r) => ({ a, r })));
  const rows: Record<string, unknown>[] = [];
  let next = 0;
  const worker = async () => {
    for (;;) {
      const j = jobs[next++];
      if (!j) return;
      const { a, r } = j;
      const c = chatOf(a.chat);
      const req: GenerateRequest = { ask: a.ask, surface: "chat", ...c };
      const ctx = { stats: [] as CallStat[] };
      await als.run({ ctx }, async () => {
        const t0 = performance.now();
        let res: Awaited<ReturnType<typeof generate>> | null = null;
        let err = "";
        try {
          res = await generate(req, main, { noBuild: true, gate: light, libraryGate: light });
        } catch (e) {
          err = (e as Error).message.slice(0, 160);
        }
        const wall = secs(performance.now() - t0);
        const piece = res?.ok ? res.from.piece : null;
        const params = res?.ok ? paramsOf(res.source) : null;
        const ps = piece && params ? problems(piece, params, groundOf(req, res?.suggested ?? [])) : [];
        const flat = JSON.stringify(params ?? {}).toLowerCase();
        const found = a.expect.filter((e) => flat.includes(e)).length;
        const atoms = params ? contentAtoms(params) : 0;
        const cov = a.expect.length ? found / a.expect.length : 1;
        let score = !res?.ok ? 1 : Math.max(1, Math.round(1 + 4 * cov));
        if (res?.ok && ps.length) score = Math.min(score, 3);
        const calls = ctx.stats;
        const row = {
          i: a.n, chat: a.chat, kind: a.kind, ask: a.ask, run: r, piece, ok: !!res?.ok, reply: res?.reply ?? null, exit: res?.exit ?? err,
          routeS: sum(calls, (s) => s.label === "router"),
          fillS: sum(calls, (s) => /fill/.test(s.label)),
          checkS: res?.timings.gate ?? 0,
          totalS: wall,
          calls: calls.map((s) => `${s.label}:${nm(s.model)}:${s.effort}:${secs(s.ms)}`),
          grounded: res?.ok ? ps.length === 0 : null, problems: ps.map((p) => p.why).slice(0, 3),
          empty: res?.ok && a.expect.length > 0 ? atoms === 0 : null, atoms, covered: `${found}/${a.expect.length}`, score,
          params,
        };
        rows.push(row);
        console.log(`${String(a.n).padStart(2)}.${r} ${a.chat.padEnd(7)} ${a.kind.padEnd(8)} ${String(piece ?? row.exit).slice(0, 18).padEnd(18)} route ${row.routeS.toFixed(1)} fill ${row.fillS.toFixed(1)} check ${row.checkS.toFixed(1)} total ${row.totalS.toFixed(1)}  cov ${row.covered} g=${row.grounded} s=${score}  ${row.calls.filter((x) => /fill/.test(x)).join(" ")}`);
      });
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));

  // the "is this a change?" decision on its own, as the shell asks it when a Mini is in the last 30 messages
  const decide: number[] = [];
  const fast = routerModelFor(main);
  if (fast && process.env.MUSE_SKIP_DECIDE !== "1") {
    const lab = labPiece("chore-wheel")!;
    const source = fillLib(lab, labExample("chore-wheel") ?? {});
    for (const a of asks) {
      const c = chatOf(a.chat);
      const ctx = { stats: [] as CallStat[] };
      await als.run({ ctx }, async () => {
        const r = await change({ ask: a.ask, ...c, explicit: false, tool: { name: "Chore wheel", source, piece: "chore-wheel" }, log: [] }, { fast, main: null, gate: async () => ({ ok: true }) as never });
        decide.push(sum(ctx.stats, (s) => s.label === "change-decide"));
        void r;
      });
    }
  }

  rows.sort((x, y) => (x.i as number) - (y.i as number) || (x.run as number) - (y.run as number));
  const n = (k: string) => rows.map((r) => r[k] as number);
  const tot = n("totalS");
  const summary = {
    name, runs: rows.length,
    decideMedian: median(decide), decideWorst: Math.max(0, ...decide),
    routeMedian: median(n("routeS")), fillMedian: median(n("fillS")), checkMedian: median(n("checkS")),
    totalMedian: median(tot), totalWorst: Math.max(0, ...tot),
    grounded: rows.filter((r) => r.grounded === true).length, notGrounded: rows.filter((r) => r.grounded === false).length,
    empty: rows.filter((r) => r.empty === true).length, noMini: rows.filter((r) => !r.ok).length,
    usefulness: Math.round((rows.reduce((s, r) => s + (r.score as number), 0) / rows.length) * 100) / 100,
    tokensByLabel: Object.fromEntries(
      [...new Set(all.map((s) => `${s.label}|${nm(s.model)}|${s.effort}`))].map((k) => {
        const xs = all.filter((s) => `${s.label}|${nm(s.model)}|${s.effort}` === k);
        const avg = (f: (s: CallStat) => number) => Math.round(xs.reduce((t, s) => t + f(s), 0) / xs.length);
        return [k, { calls: xs.length, input: avg((s) => s.input), cached: avg((s) => s.cached), output: avg((s) => s.output), reasoning: avg((s) => s.reasoning), medianS: median(xs.map((s) => s.ms / 1000)) }];
      }),
    ),
  };
  const out = join(import.meta.dir, "out", "speed", `${name}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ summary, decide, rows }, null, 1));
  console.log("\n" + JSON.stringify(summary, null, 1));
  process.exit(0);
}
