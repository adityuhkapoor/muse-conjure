// bun run check <file> [--deep] [--json]: exhaustive check of one tool within a bound.
import { readFileSync } from "node:fs";
import { check } from "./check.ts";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: bun run check <file.tsx> [--deep] [--json]");
  process.exit(2);
}
const r = check(readFileSync(file, "utf8"), { profile: args.includes("--deep") ? "deep" : "default" });
if (args.includes("--json")) console.log(JSON.stringify(r, null, 1));
else {
  console.log(`${r.name}: ${r.verdict} · ${r.stats.states} states · ${r.stats.transitions} transitions · depth ${r.stats.depth} · ${r.stats.exhausted ? "exhausted" : "bound hit"} · ${r.stats.ms} ms`);
  for (const p of r.properties) if (p.status === "fail" || p.status === "warn") console.log(`  ${p.status} ${p.id}: ${p.failure!.message}\n    trace (${p.failure!.trace?.length ?? 0}): ${JSON.stringify(p.failure!.trace)}`);
  console.log(`  ${r.guarantee}`);
}
process.exit(r.ok ? 0 : 1);
