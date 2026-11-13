// The gate. docs/CONTRACTS.md section 5.
//
// Stages run concurrently where independent (type-check in the tsc process, static and copy on
// this thread, determinism, fuzz and mutants on worker threads), and the report names the first
// stage in contract order that failed, with that stage's failures.

import { compileModule } from "./compile.ts";
import { DEFAULTS, type Failure, type MutationSummary, type Report, STAGES, type StageName, type VerifyOptions } from "./report.ts";
import { closeSharedPool, sharedPool, TimeoutError } from "./runtime/pool.ts";
import type { MutantsOut, RunOpts } from "./runtime/tasks.ts";
import { copyLint } from "./stages/copy.ts";
import { makeMutants } from "./stages/mutation.ts";
import { closeRender, render, warmRender, warmStrict } from "./stages/render.ts";
import type { Coverage } from "./coverage/states.ts";
import { fixFor, severity } from "./rules.ts";
import { staticRules } from "./stages/static.ts";
import { closeChecker, getChecker, typecheck } from "./stages/typecheck.ts";

export type { Failure, MutationSummary, Report, StageName, TraceStep, VerifyOptions } from "./report.ts";
export { STAGES } from "./report.ts";
export { RULE_INDEX, ruleInfo, severity, fixFor, type RuleInfo } from "./rules.ts";
export { verifyPartial, type PartialReport, type PartialFinding } from "./partial.ts";
export { budgetForFile, budgetForSurface, CHAT_BUDGET, STORY_BUDGET } from "./budget.ts";

type StageResult = { failures: Failure[]; warnings: Failure[]; ms: number; ran: boolean };

const FUZZ_SPLIT = 4;
const MUTANT_SPLIT = 5;

/** Start the tsc process, the worker threads and the headless browser ahead of the first call. */
export async function warm(o: { profile?: "default" | "strict" } = {}): Promise<void> {
  sharedPool();
  await Promise.all([getChecker(), warmRender(), ...(o.profile === "strict" ? [warmStrict()] : [])]);
}

/** Stop the tsc process, the worker threads and the browser. */
export async function shutdown(): Promise<void> {
  closeSharedPool();
  await Promise.all([closeChecker(), closeRender()]);
}

export async function verify(source: string, opts: VerifyOptions = {}): Promise<Report> {
  const o = { ...DEFAULTS, ...opts };
  const profile = o.profile ?? "default";
  const strict = profile === "strict";
  const skip = new Set(o.skip ?? []);
  const t0 = performance.now();
  const results = new Map<StageName, StageResult>();
  // Each failure goes where its rule's severity in this profile says: blocking, a warning, or off.
  const sort = (failures: Failure[], warnings: Failure[]) => {
    const f: Failure[] = [];
    const w: Failure[] = [];
    for (const x of failures) {
      const sev = severity(x.rule, profile, o.rules);
      if (sev === "error") f.push(x);
      else if (sev === "warn") w.push(x);
    }
    for (const x of warnings) if (o.rules?.[x.rule] !== "off") w.push(x);
    return { f, w };
  };
  const done = (name: StageName, started: number, failures: Failure[], warnings: Failure[] = [], ran = true) => {
    const { f, w } = sort(failures, warnings);
    results.set(name, { failures: f, warnings: w, ms: round(performance.now() - started), ran });
  };

  // 1. Type-check starts first: it runs in its own process.
  const tcStart = performance.now();
  let tcMs = 0;
  const tcRaw = skip.has("typecheck")
    ? null
    : typecheck(source, new Set())
        .catch((e) => ({ failures: [gateError(e)], via: "error" }))
        .finally(() => (tcMs = round(performance.now() - tcStart)));

  // 2. Static rules and 7. copy lint: synchronous, a few ms.
  let started = performance.now();
  const st = skip.has("static") ? { failures: [], warnings: [] } : staticRules(source, { maxSourceBytes: o.maxSourceBytes });
  done("static", started, st.failures, st.warnings, !skip.has("static"));
  started = performance.now();
  const cp = skip.has("copy") ? { failures: [], warnings: [] } : copyLint(source);
  done("copy", started, cp.failures, cp.warnings, !skip.has("copy"));

  // Compile once for the runtime stages.
  started = performance.now();
  const compiled = compileModule(source);
  const compileMs = round(performance.now() - started);

  // 3-5. Runtime stages on workers. Skipped when static rules failed: the code may loop forever
  // or touch the host, and the report would stop at stage 2 anyway.
  const runtimeOk = compiled.ok && (st.failures.length === 0 || o.all);
  const runOpts: RunOpts = { runs: o.runs, seed: o.seed, maxStateBytes: o.maxStateBytes, budgetMs: Math.floor(o.stageTimeoutMs * 0.6) };
  const pool = sharedPool();
  const timed = <T>(task: string, args: unknown[]) => pool.run<T>(task, args, o.stageTimeoutMs);
  const runtime: Promise<void>[] = [];
  const notCompiled = compiled.ok ? null : { rule: "compile", message: compiled.message, ...(compiled.line ? { line: compiled.line } : {}) };

  const stage = (name: StageName, body: () => Promise<{ failures: Failure[]; warnings?: Failure[] }>) => {
    if (skip.has(name)) return done(name, performance.now(), [], [], false);
    if (notCompiled) return done(name, performance.now(), [notCompiled]);
    if (!runtimeOk) return done(name, performance.now(), [], [], false);
    const s = performance.now();
    runtime.push(
      body().then(
        (r) => void done(name, s, r.failures, r.warnings ?? []),
        (e) => void done(name, s, [e instanceof TimeoutError ? timeoutFailure(name, e) : gateError(e)]),
      ),
    );
  };

  stage("determinism", async () => {
    const js = (compiled as { js: string }).js;
    return { failures: await timed<Failure[]>("determinism", [js, { ...runOpts, runs: Math.ceil(o.runs / 2) }]) };
  });

  stage("invariants", async () => {
    const js = (compiled as { js: string }).js;
    const per = Math.ceil(o.runs / FUZZ_SPLIT);
    const parts = await Promise.all(
      Array.from({ length: FUZZ_SPLIT }, (_, i) => timed<Failure[]>("fuzz", [js, { ...runOpts, runs: per, seed: o.seed + i * 7919 }])),
    );
    const all = parts.flat();
    // Shortest trace first: it is the easiest to repair from.
    all.sort((a, b) => (a.trace?.length ?? 0) - (b.trace?.length ?? 0));
    return { failures: all.slice(0, 1) };
  });

  let mutation: MutationSummary | undefined;
  let weak: string[] | undefined;
  stage("mutation", async () => {
    const js = (compiled as { js: string }).js;
    const ms = makeMutants(source, o.maxMutants);
    const compiledMutants = ms.map((m) => {
      const c = compileModule(m.source);
      return { id: m.id, js: c.ok ? c.js : "" };
    });
    const chunks: (typeof compiledMutants)[] = Array.from({ length: MUTANT_SPLIT }, () => []);
    compiledMutants.forEach((m, i) => chunks[i % MUTANT_SPLIT]!.push(m));
    const outs = await Promise.all(
      chunks.map((c) => timed<MutantsOut>("mutants", [js, c, { ...runOpts, runs: o.mutantRuns, seed: o.seed ^ 0x3c3c }])),
    );
    const failures: Failure[] = [];
    const warnings: Failure[] = [];
    const original = outs.find((x) => x.original)?.original;
    if (original) return { failures: [original] };
    const { acts, changed } = outs[0]!;
    const live = acts ? changed / acts : 0;
    if (live < 0.1)
      failures.push({
        rule: "arbitrary-weak",
        message: `only ${Math.round(live * 100)} in 100 actions from arbitrary changed the state, so fuzzing explores almost nothing. arbitrary should mostly propose actions that are valid in the given state.`,
      });
    else if (live < 0.3)
      warnings.push({ rule: "arbitrary-weak", message: `only ${Math.round(live * 100)} in 100 actions from arbitrary changed the state` });

    const results = outs.flatMap((x) => x.results);
    const names = outs[0]!.names;
    const kills: Record<string, number> = Object.fromEntries(names.map((n) => [n, 0]));
    let observable = 0;
    let killed = 0;
    const survivors: MutationSummary["survivors"] = [];
    let inert = 0;
    for (const r of results) {
      if (r.crashed || !r.observable) continue;
      if (!r.wrong) {
        inert++;
        continue;
      }
      observable++;
      if (r.killedBy.length) killed++;
      else {
        const m = ms[r.id]!;
        survivors.push({ op: m.op, line: m.line, before: m.before, after: m.after });
      }
      for (const n of r.killedBy) kills[n] = (kills[n] ?? 0) + 1;
    }
    const score = observable ? killed / observable : 1;
    mutation = {
      total: ms.length,
      observable,
      inert,
      killed,
      score: Math.round(score * 100) / 100,
      threshold: o.mutationThreshold,
      kills,
      survivors,
    };
    weak = names.filter((n) => !kills[n]);
    for (const n of weak)
      warnings.push({ rule: "weak-invariant", message: `"${n}" caught none of ${observable} reducer mutants. It may be always true, or guard a field reduce never changes.` });
    if (!names.length) failures.push({ rule: "mutation-score", message: "the app declares no invariants or transitions" });
    else if (score < o.mutationThreshold)
      failures.push({
        rule: "mutation-score",
        message: `invariants and transitions caught ${killed} of ${observable} reducer mutants (score ${score.toFixed(2)}, need ${o.mutationThreshold}). Add invariants that state what reduce must keep true, and transitions that say what each action must do; mutants that survived are in detail.survivors.`,
        detail: { survivors: survivors.slice(0, 8), weak },
      });
    return { failures, warnings };
  });

  // 6. Render in headless Chrome, at the same time as the worker stages.
  let renderMs: Record<string, number> | undefined;
  stage("render", async () => {
    let cov: Coverage | undefined;
    let covMs = 0;
    if (strict) {
      const c0 = performance.now();
      cov = await timed<Coverage>("coverage", [(compiled as { js: string }).js, { seed: o.seed, maxStateBytes: o.maxStateBytes, budgetMs: 600 }]).catch(() => ({ states: [], typicalFinished: false }));
      covMs = round(performance.now() - c0);
    }
    const r = await render(source, {
      seed: o.seed,
      timeoutMs: o.stageTimeoutMs * (strict ? 3 : 2),
      ...(o.heightBudget !== undefined ? { budget: o.heightBudget } : {}),
      ...(cov ? { states: cov.states, typicalFinished: cov.typicalFinished } : {}),
      ...(o.artifacts !== undefined ? { artifacts: o.artifacts } : {}),
      ...(o.images ? { images: true } : {}),
    });
    renderMs = { ...r.ms, ...(strict ? { states: covMs, stateCount: cov?.states.length ?? 0 } : {}) };
    return { failures: [...r.failures, ...(r.more ?? [])], warnings: r.warnings };
  });

  await Promise.all(runtime);
  if (tcRaw) {
    const tc = await tcRaw;
    const staticLines = new Set(st.failures.map((f) => f.line).filter((l): l is number => l !== undefined));
    // Drop "cannot find name/module" where the static stage already explains the line.
    const failures = tc.failures.filter((f) => !(staticLines.has(f.line ?? -1) && /^TS(2304|2307|2792|2580|2591|2582|2867|2868):/.test(f.message)));
    const sorted = sort(failures, []);
    results.set("typecheck", { failures: sorted.f, warnings: sorted.w, ms: tcMs, ran: true });
  } else results.set("typecheck", { failures: [], warnings: [], ms: 0, ran: false });

  const timings: Record<string, number> = { compile: compileMs };
  const failing = STAGES.find((s) => results.get(s)?.failures.length);
  const failures: Failure[] = [];
  const warnings: Failure[] = [];
  for (const s of STAGES) {
    const r = results.get(s)!;
    timings[s] = r.ms;
    warnings.push(...r.warnings);
    if (o.all || s === failing) failures.push(...r.failures.map((f) => (o.all ? { ...f, detail: { ...f.detail, stage: s } } : f)));
  }
  if (renderMs) for (const [k, v] of Object.entries(renderMs)) timings[`render.${k}`] = v;
  for (const f of [...failures, ...warnings]) if (f.fix === undefined) {
    const fx = fixFor(f);
    if (fx) f.fix = fx;
  }
  timings.total = round(performance.now() - t0);
  return {
    ok: !failing,
    stage: failing ?? "done",
    failures,
    warnings,
    timings,
    ...(mutation ? { mutation } : {}),
    ...(weak ? { weak } : {}),
    ran: STAGES.filter((s) => results.get(s)?.ran),
  };
}

function timeoutFailure(stage: StageName, e: Error): Failure {
  const ms = e.message.match(/within (\d+) ms/)?.[1] ?? "?";
  return { rule: "timeout", message: `the ${stage} stage did not finish within ${ms} ms. Look for loops that never end in init, reduce, arbitrary or invariants.` };
}

function gateError(e: unknown): Failure {
  return { rule: "gate-error", message: `the gate itself failed: ${e instanceof Error ? e.message : String(e)}` };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
