// Print every failure and warning of one tool with its trace: `bun scripts/inspect.ts <file> [--deep]`
import { readFileSync } from "node:fs";
import { check } from "../src/index.ts";
const r = check(readFileSync(process.argv[2]!, "utf8"), { profile: process.argv.includes("--deep") ? "deep" : "default" });
for (const f of [...r.failures, ...r.warnings]) {
  console.log(`\n${f.rule}: ${f.message}`);
  for (const s of f.trace ?? []) console.log("   ", JSON.stringify(s));
  if (f.detail) console.log("    detail", JSON.stringify(f.detail).slice(0, 600));
}
