// bun src/bench.ts --pipeline generate|compose --out <name> [--configs spark-c,spark] [--only id,id]
//   [--concurrency 3] [--speed fast|normal|best]
//
// Runs the 24 held-out asks (eval/heldout.ts) through one pipeline on several model configs and
// keeps, per ask and config: the source, the gate report, seconds, estimated tokens, and a 393 px
// picture at rest (light) and after taps (light). Results land in eval/out/<name>/ (git-ignored).
// A job whose result file exists is skipped, so a restart resumes; model replies are cached on
// disk, so a rerun of the same prompts is free.
//
// `generate` is always forced to build new (the baseline). `compose` routes on its own.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, warm } from "@muse/verify";
import { ASKS } from "../eval/asks.ts";
import { HELDOUT } from "../eval/heldout.ts";
import { CachedClient } from "./cache.ts";
import { generate } from "./generate.ts";
import { MuseClient } from "./models/muse.ts";
import { closeShoot, shoot } from "./look/shoot.ts";
import { Meter } from "./meter.ts";
import type { GenerateResult, ModelClient, ProgressEvent } from "./types.ts";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

export const CONFIGS: Record<string, { label: string; make: () => ModelClient; fast?: () => ModelClient }> = {
  "spark-c": {
    label: "muse-spark-1.3-contributor",
    make: () => new CachedClient(new MuseClient({ model: "muse-spark-1.3-contributor", timeoutMs: 600_000 })),
    fast: () => new CachedClient(new MuseClient({ model: "muse-ember-1.0", effort: "low", timeoutMs: 240_000 })),
  },
  spark: {
    label: "muse-spark-1.3",
    make: () => new CachedClient(new MuseClient({ model: "muse-spark-1.3", timeoutMs: 600_000 })),
    fast: () => new CachedClient(new MuseClient({ model: "muse-ember-1.0", effort: "low", timeoutMs: 240_000 })),
  },
};

export type BenchRow = {
  ask: string;
  config: string;
  pipeline: string;
  ok: boolean;
  stage: string;
  failure: string;
  path: string;
  piece: string | null;
  mutation: number | null;
  seconds: number;
  tokensIn: number;
  tokensOut: number;
  calls: number;
  lines: number;
  shots: string[];
  extra?: Record<string, unknown>;
};

/** "heldout" for before and after; "dev" (eval/asks.ts) for iterating on the harness. */
export const askSet = (name = arg("set", "heldout")) => (name === "dev" ? ASKS : HELDOUT);
const pipeline = arg("pipeline", "generate");
const outName = arg("out", pipeline === "generate" ? "baseline" : "after");
const configs = arg("configs", "spark-c,spark").split(",").filter(Boolean);
const only = arg("only", "").split(",").filter(Boolean);
const concurrency = Math.min(3, Math.max(1, Number(arg("concurrency", "3"))));
const speed = arg("speed", "normal");
/** Hard ceiling per job, whatever the pipeline does. */
const JOB_CEILING_MS = Number(arg("ceiling", String(20 * 60_000)));

if (import.meta.main) await main();

async function main() {
  const outDir = join(import.meta.dir, "..", "eval", "out", outName);
  mkdirSync(outDir, { recursive: true });
  const all = askSet();
  const asks = only.length ? all.filter((a) => only.includes(a.id)) : all;
  const jobs = configs.flatMap((c) => asks.map((a) => ({ a, c })));
  // Interleave configs so a slow one does not hold the others back.
  jobs.sort((x, y) => asks.indexOf(x.a) - asks.indexOf(y.a) || configs.indexOf(x.c) - configs.indexOf(y.c));
  await warm();
  const compose = pipeline === "compose" ? (await import("./compose.ts")).compose : null;
  // Sameness is judged against the same config's recent tools.
  const recent = new Map<string, string[]>();
  const recentOf = (c: string) => recent.get(c) ?? (recent.set(c, []), recent.get(c)!);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { a, c } = jobs[next++]!;
      const dir = join(outDir, c);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${a.id}.json`);
      if (existsSync(file)) continue;
      // A claim file lets a second bench process share the queue without running the same job.
      try {
        writeFileSync(`${file}.claim`, String(process.pid), { flag: "wx" });
      } catch {
        continue;
      }
      const cfg = CONFIGS[c];
      if (!cfg) throw new Error(`unknown config ${c}`);
      const meter = new Meter(cfg.make());
      const fastMeter = cfg.fast ? new Meter(cfg.fast(), meter) : undefined;
      const events: ProgressEvent[] = [];
      const t0 = performance.now();
      let r: GenerateResult & { extra?: Record<string, unknown> };
      try {
        const run =
          compose != null
            ? compose(a, meter, { speed: speed as "fast" | "normal" | "best", ...(fastMeter ? { fast: fastMeter } : {}), recent: recentOf(c), onEvent: (e) => events.push(e as ProgressEvent) })
            : generate(a, meter, { forcePath: { path: "build" }, onEvent: (e) => events.push(e) });
        r = await Promise.race([run, Bun.sleep(JOB_CEILING_MS).then(() => Promise.reject(new Error("hit the job ceiling")))]);
      } catch (e) {
        r = { ok: false, source: "", report: null, attempts: 0, timings: {}, from: { path: "build", piece: null, model: meter.id, cached: false }, error: (e as Error).message };
      }
      const seconds = Math.round((performance.now() - t0) / 100) / 10;
      const shots: string[] = [];
      if (r.source) {
        writeFileSync(join(dir, `${a.id}.tsx`), r.source);
        try {
          const pics = await shoot(r.source, { members: a.members, scenes: ["rest", "played"], modes: ["light"] });
          for (const s of pics)
            if (s.png.length) {
              const f = `${a.id}.${s.scene}.png`;
              writeFileSync(join(dir, f), s.png);
              shots.push(f);
            }
        } catch (e) {
          console.error(`  shot failed for ${c}/${a.id}: ${(e as Error).message.slice(0, 160)}`);
        }
      }
      const f0 = r.report?.failures[0];
      const row: BenchRow = {
        ask: a.id,
        config: c,
        pipeline,
        ok: r.ok,
        stage: r.report?.stage ?? "none",
        failure: r.ok ? "" : (r.error ?? (f0 ? `${f0.rule}: ${f0.message}` : "")).slice(0, 300),
        path: r.from.path,
        piece: r.from.piece,
        mutation: r.report?.mutation?.score ?? null,
        seconds,
        tokensIn: meter.tokensIn,
        tokensOut: meter.tokensOut,
        calls: meter.calls,
        lines: r.source ? r.source.split("\n").length : 0,
        shots,
        ...(r.extra ? { extra: r.extra } : {}),
      };
      rmSync(`${file}.claim`, { force: true });
      writeFileSync(file, JSON.stringify({ row, events, report: r.report, candidates: r.candidates, timings: r.timings, byLabel: meter.byLabel }, null, 1));
      console.error(`${row.ok ? "pass" : "FAIL"} ${c} ${a.id} · ${row.path} · ${seconds}s · ~${Math.round((row.tokensIn + row.tokensOut) / 1000)}k tok${row.failure ? ` · ${row.failure.slice(0, 140)}` : ""}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  await closeShoot();
  await shutdown();
  console.error(`done: ${jobs.length} jobs in ${outDir}`);
}

/** Every row under eval/out/<name>/, for the sheet and the report. */
export function loadRows(name: string): BenchRow[] {
  const outDir = join(import.meta.dir, "..", "eval", "out", name);
  const rows: BenchRow[] = [];
  for (const c of Object.keys(CONFIGS))
    for (const a of askSet()) {
      const f = join(outDir, c, `${a.id}.json`);
      if (existsSync(f)) rows.push((JSON.parse(readFileSync(f, "utf8")) as { row: BenchRow }).row);
    }
  return rows;
}
