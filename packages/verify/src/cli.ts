#!/usr/bin/env bun
// bun run verify <file> [--all] [--skip stage,stage] [--runs n] [--seed n] [--strict] [--images] [--budget px]
// bun run verify --watch <file> [--strict]   re-run on save, print only what changed
// bun run verify --rules                      the rule index as JSON
// bun run verify --partial <file>            the streaming subset on the file as it is
// Prints the JSON report; exits 1 when the gate fails, 2 on bad usage.

import { readFileSync, watch } from "node:fs";
import { budgetForFile } from "./budget.ts";
import { shutdown, verify, verifyPartial, warm, RULE_INDEX } from "./index.ts";
import type { Failure, Report, StageName, VerifyOptions } from "./report.ts";

const args = process.argv.slice(2);
const VALUED = /^--(skip|runs|seed|profile|artifacts|budget)$/;
if (args.includes("--rules")) {
  console.log(JSON.stringify(RULE_INDEX, null, 2));
  process.exit(0);
}
const file = args.find((a, i) => !a.startsWith("--") && !/^\d+$/.test(a) && !VALUED.test(args[i - 1] ?? ""));
if (!file) {
  console.error("usage: bun run verify <app.tsx> [--all] [--skip typecheck,static,...] [--runs 200] [--seed 1] [--strict] [--images] [--budget px] | --watch <app.tsx> | --rules | --partial <app.tsx>");
  process.exit(2);
}
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const o: VerifyOptions = {};
o.heightBudget = budgetForFile(file);
if (opt("budget")) o.heightBudget = Number(opt("budget"));
if (args.includes("--all")) o.all = true;
if (opt("skip")) o.skip = opt("skip")!.split(",") as StageName[];
if (opt("runs")) o.runs = Number(opt("runs"));
if (opt("seed")) o.seed = Number(opt("seed"));
if (args.includes("--strict") || opt("profile") === "strict") o.profile = "strict";
if (args.includes("--images")) o.images = true;
if (opt("artifacts")) o.artifacts = opt("artifacts")!;

const line = (r: Report) => {
  const t = r.timings;
  return (
    `${r.ok ? "pass" : `fail at ${r.stage}`} · ` +
    ["typecheck", "static", "determinism", "invariants", "mutation", "render", "copy"].map((s) => `${s} ${t[s]} ms`).join(" · ") +
    ` · total ${t.total} ms` +
    (r.mutation ? ` · mutation score ${r.mutation.score}` : "")
  );
};

if (args.includes("--partial")) {
  const r = await verifyPartial(readFileSync(file, "utf8"));
  console.log(JSON.stringify(r, null, 2));
  await shutdown();
  process.exit(r.findings.length ? 1 : 0);
}

if (args.includes("--watch")) {
  // Warm once, then re-run on every save and print only the findings that appeared or went away.
  await warm({ profile: o.profile ?? "default" });
  const key = (f: Failure) => `${f.rule}|${f.message}`;
  const show = (f: Failure) => `${f.rule}${f.line ? ` (line ${f.line})` : ""}: ${f.message}${f.fix ? `\n      fix: ${f.fix}` : ""}${f.image ? `\n      picture: ${f.image}` : ""}`;
  let prev = new Map<string, Failure>();
  let running = false, again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (running) return void (again = true);
    running = true;
    try {
      const src = readFileSync(file, "utf8");
      const r = await verify(src, o);
      const now = new Map<string, Failure>([...r.failures, ...r.warnings.filter((w) => w.rule !== "weak-invariant")].map((f) => [key(f), f]));
      const added = [...now].filter(([k]) => !prev.has(k)).map(([, f]) => f);
      const gone = [...prev].filter(([k]) => !now.has(k)).map(([, f]) => f);
      const stamp = new Date().toTimeString().slice(0, 8);
      console.log(`\n${stamp} ${line(r)}`);
      for (const f of added) console.log(`  + ${r.failures.includes(f) ? "" : "warning "}${show(f)}`);
      for (const f of gone) console.log(`  - fixed ${f.rule}: ${f.message.slice(0, 100)}`);
      if (!added.length && !gone.length) console.log(`  no change (${now.size} open)`);
      prev = now;
    } catch (e) {
      console.log(`  could not run: ${(e as Error).message}`);
    } finally {
      running = false;
      if (again) {
        again = false;
        void run();
      }
    }
  };
  await run();
  watch(file, () => {
    clearTimeout(timer);
    timer = setTimeout(run, 40);
  });
  process.on("SIGINT", async () => {
    await shutdown();
    process.exit(0);
  });
} else {
  const report = await verify(readFileSync(file, "utf8"), o);
  console.log(JSON.stringify(report, null, 2));
  console.error(line(report));
  await shutdown();
  process.exit(report.ok ? 0 : 1);
}
