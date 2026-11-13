// p50 over 10 runs, cold (fresh process each run) and warm (one process, tsc and workers up).
// bun scripts/bench.ts [fixture]   (default fixtures/good/poll.tsx)
import { readFileSync } from "node:fs";
import { join } from "node:path";

const file = process.argv[2] ?? join(import.meta.dir, "../fixtures/good/poll.tsx");
const STAGES = ["typecheck", "static", "determinism", "invariants", "mutation", "copy", "total"];
const p50 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

if (process.argv[3] === "--one") {
  // Child: one cold verify, timings on stdout.
  const t0 = performance.now();
  const { verify, shutdown } = await import("../src/index.ts");
  const r = await verify(readFileSync(file, "utf8"));
  const wall = performance.now() - t0;
  await shutdown();
  console.log(JSON.stringify({ ...r.timings, wall, ok: r.ok }));
  process.exit(0);
}

const cold: Record<string, number>[] = [];
for (let i = 0; i < 10; i++) {
  const p = Bun.spawnSync(["bun", import.meta.path, file, "--one"]);
  cold.push(JSON.parse(p.stdout.toString().trim().split("\n").at(-1)!));
}
const { verify, warm, shutdown } = await import("../src/index.ts");
const { typecheck } = await import("../src/stages/typecheck.ts");
const src = readFileSync(file, "utf8");
await warm();
await verify(src);
const hot: Record<string, number>[] = [];
for (let i = 0; i < 10; i++) hot.push((await verify(src + `\n// run ${i}`)).timings);
const tc: number[] = [];
for (let i = 0; i < 10; i++) {
  const t = performance.now();
  await typecheck(src + `\n// tc ${i}`, new Set());
  tc.push(performance.now() - t);
}
await shutdown();

console.log(`${file.split("/").at(-1)} (${src.split("\n").length} lines), p50 of 10 runs, ms`);
console.log("stage".padEnd(12), "cold".padStart(8), "warm".padStart(8));
for (const s of [...STAGES, "wall"]) {
  const c = p50(cold.map((x) => x[s] ?? NaN));
  const w = s === "wall" ? NaN : p50(hot.map((x) => x[s]!));
  console.log(s.padEnd(12), c.toFixed(1).padStart(8), (Number.isNaN(w) ? "-" : w.toFixed(1)).padStart(8));
}
console.log("typecheck alone, warm p50:", p50(tc).toFixed(1));
console.log("cold 'wall' = import + tsc start + workers + verify, inside a fresh bun process");
