// Debug: list the mutants of an app and how each fared.
import { readFileSync } from "node:fs";
import { compileModule } from "../src/compile.ts";
import { mutants } from "../src/runtime/tasks.ts";
import { makeMutants } from "../src/stages/mutation.ts";
const src = readFileSync(process.argv[2]!, "utf8");
const runs = Number(process.argv[3] ?? 40);
const ms = makeMutants(src, 20);
const js = (compileModule(src) as any).js;
const t = performance.now();
const out = mutants(js, ms.map((m) => ({ id: m.id, js: (compileModule(m.source) as any).js })), { runs, seed: 0x5eed ^ 0x3c3c, maxStateBytes: 65536 });
console.log(`ms ${(performance.now() - t).toFixed(0)} acts ${out.acts} changed ${out.changed}`, out.original ?? "");
for (const r of out.results) {
  const m = ms[r.id]!;
  console.log(`${r.killedBy.length ? "KILL" : r.crashed ? "CRSH" : !r.observable ? "SAME" : r.wrong ? "LIVE" : "INRT"} L${m.line} ${m.op}: ${m.before.slice(0, 60)} -> ${m.after.slice(0, 40)} ${r.killedBy.join(" | ")}`);
}
