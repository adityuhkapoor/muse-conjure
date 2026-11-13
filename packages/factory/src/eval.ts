// bun run eval [--model muse] [--only id,id] [--limit n] [--concurrency 3] [--candidates 1]
// Runs the fixed asks in eval/asks.ts and reports per ask: path, attempts, gate result, mutation
// score, seconds and source lines. Outputs go to eval/out/<model>/ (git-ignored).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, warm } from "@muse/verify";
import { ASKS } from "../eval/asks.ts";
import { CachedClient } from "./cache.ts";
import { generate } from "./generate.ts";
import { makeModel } from "./models/index.ts";
import type { GenerateResult, ProgressEvent } from "./types.ts";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

const modelId = arg("model", process.env.MUSE_MODEL ?? "muse");
const only = arg("only", "").split(",").filter(Boolean);
const limit = Number(arg("limit", "0"));
const concurrency = Math.max(1, Number(arg("concurrency", "3")));
const candidates = Number(arg("candidates", "1"));
/** --force build: skip reuse and adapt, to measure building from scratch on every ask. */
const force = arg("force", "") as "" | "build";
let asks = only.length ? ASKS.filter((a) => only.includes(a.id)) : ASKS;
if (limit) asks = asks.slice(0, limit);

const outDir = join(import.meta.dir, "..", "eval", "out", modelId.replace(/[^a-z0-9.-]+/gi, "_") + (force ? `-${force}` : ""));
mkdirSync(outDir, { recursive: true });

export type Row = {
  id: string;
  expect: string;
  path: string;
  piece: string | null;
  ok: boolean;
  firstTry: boolean;
  attempts: number;
  score: number | null;
  seconds: number;
  lines: number;
  repairs: string[];
  failure: string;
  timings: Record<string, number>;
};

await warm();
const model = makeModel(modelId, { patient: true });
const rows: Row[] = [];
let next = 0;

async function worker() {
  while (next < asks.length) {
    const a = asks[next++]!;
    const events: ProgressEvent[] = [];
    const t0 = performance.now();
    let r: GenerateResult;
    try {
      r = await generate(a, model, { candidates, onEvent: (e) => events.push(e), ...(force ? { forcePath: { path: force } } : {}) });
    } catch (e) {
      r = { ok: false, source: "", report: null, attempts: 0, timings: {}, from: { path: "build", piece: null, model: modelId, cached: false }, error: (e as Error).message };
    }
    const seconds = Math.round((performance.now() - t0) / 100) / 10;
    const repairs = events.flatMap((e) => (e.t === "repairing" ? [`${e.rule}`] : []));
    const routed = events.find((e) => e.t === "routed") as Extract<ProgressEvent, { t: "routed" }> | undefined;
    const row: Row = {
      id: a.id,
      expect: a.expect,
      path: routed?.path ?? r.from.path,
      piece: r.from.piece,
      ok: r.ok,
      firstTry: r.ok && repairs.length === 0 && routed?.path === r.from.path,
      attempts: r.attempts,
      score: r.report?.mutation?.score ?? null,
      seconds,
      lines: r.source ? r.source.split("\n").length : 0,
      repairs,
      failure: r.ok ? "" : (r.error ?? "").slice(0, 300),
      timings: r.timings,
    };
    rows.push(row);
    if (r.source) writeFileSync(join(outDir, `${a.id}.tsx`), r.source);
    writeFileSync(join(outDir, `${a.id}.json`), JSON.stringify({ row, events, report: r.report, candidates: r.candidates }, null, 1));
    console.error(`${row.ok ? "pass" : "FAIL"} ${a.id} · ${row.path}${row.piece ? `/${row.piece}` : ""} · ${row.attempts} attempts · ${seconds}s${row.repairs.length ? ` · repaired ${row.repairs.join(", ")}` : ""}${row.failure ? ` · ${row.failure}` : ""}`);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, asks.length) }, worker));
rows.sort((a, b) => asks.findIndex((x) => x.id === a.id) - asks.findIndex((x) => x.id === b.id));
await shutdown();

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
};
const pct = (n: number) => `${n}/${rows.length}`;
const table = [
  `| ask | expect | path | ok | first try | attempts | mutation | seconds | lines | repaired / failure |`,
  `|---|---|---|---|---|---|---|---|---|---|`,
  ...rows.map(
    (r) =>
      `| ${r.id} | ${r.expect} | ${r.path}${r.piece ? ` (${r.piece})` : ""} | ${r.ok ? "pass" : "fail"} | ${r.firstTry ? "yes" : "no"} | ${r.attempts} | ${r.score ?? "-"} | ${r.seconds} | ${r.lines} | ${[r.repairs.join(", "), r.failure].filter(Boolean).join(" · ").replace(/\|/g, "/")} |`,
  ),
];
const byPath = ["reuse", "adapt", "build"].map((p) => {
  const rs = rows.filter((r) => r.path === p);
  return `${p}: ${rs.length} asks, median ${median(rs.map((r) => r.seconds)) ?? "-"} s, ${rs.filter((r) => r.ok).length} passed`;
});
const summary = [
  `model ${modelId}${model instanceof CachedClient ? ` (cache hits ${model.hits}, misses ${model.misses})` : ""}`,
  `pass first try ${pct(rows.filter((r) => r.firstTry).length)} · pass after repair ${pct(rows.filter((r) => r.ok).length)} · router matched expected path ${pct(rows.filter((r) => r.path === r.expect).length)}`,
  ...byPath,
];
const md = `${summary.join("\n\n")}\n\n${table.join("\n")}\n`;
writeFileSync(join(outDir, "results.md"), md);
writeFileSync(join(outDir, "results.json"), JSON.stringify(rows, null, 1));
console.log(md);
