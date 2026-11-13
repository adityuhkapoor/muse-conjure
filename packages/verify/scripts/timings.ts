// Warm stage timings, p50 of 5 runs, for both profiles, on the given files (default: the three
// good fixtures that are whole apps, and three library pieces).
// bun scripts/timings.ts [files...]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, verify, warm } from "../src/index.ts";

const here = join(import.meta.dir, "..");
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["fixtures/good/poll.tsx", "fixtures/good/bill.tsx", "fixtures/good/seats.tsx", "../../library/pieces/wheel/piece.tsx", "../../library/pieces/split/piece.tsx", "../../library/pieces/claims/piece.tsx"].map((f) => join(here, f));
const KEYS = ["typecheck", "static", "determinism", "invariants", "mutation", "render", "copy", "total", "render.states", "render.mount", "render.lint"];
const p50 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
await warm({ profile: "strict" });
for (const profile of ["default", "strict"] as const) {
  console.log(`\n${profile}`);
  console.log("file".padEnd(22) + KEYS.map((k) => k.replace("render.", "r.").padStart(12)).join(""));
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    await verify(src, { profile, artifacts: false });
    const runs: Record<string, number>[] = [];
    for (let i = 0; i < 5; i++) runs.push((await verify(src + `\n// run ${i}`, { profile, artifacts: false })).timings);
    console.log(f.split("/").slice(-2).join("/").padEnd(22) + KEYS.map((k) => (runs[0]![k] === undefined ? "-" : p50(runs.map((r) => r[k]!)).toFixed(0)).padStart(12)).join(""));
  }
}
await shutdown();
