// How fast verifyPartial is, and how early it catches a violation while a model writes.
// - good fixtures: a prefix every 20 lines; ms per call (static and copy only, and with type-check
//   when the prefix is complete).
// - bad fixtures whose rule verifyPartial can see (static and copy rules): the first prefix length
//   (in lines) at which the expected rule is reported, against the line where the violation is.
// bun scripts/partial-bench.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, verifyPartial, warm } from "../src/index.ts";
import { fixtureSpec } from "../test/spec.ts";

const dir = join(import.meta.dir, "../fixtures");
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]!;
await warm();
await verifyPartial("import { defineApp } from \"@muse/app\";\n");

const times: number[] = [];
const typed: number[] = [];
for (const f of readdirSync(join(dir, "good")).sort()) {
  const lines = readFileSync(join(dir, "good", f), "utf8").split("\n");
  for (let n = 20; n <= lines.length + 19; n += 20) {
    const r = await verifyPartial(lines.slice(0, n).join("\n"), { typecheck: false });
    times.push(r.ms);
    if (r.findings.length) console.log(`  note: good/${f} at ${n} lines: ${r.findings.map((x) => x.rule).join(",")}`);
  }
  const t = await verifyPartial(lines.join("\n"));
  typed.push(t.ms);
}
console.log(`good prefixes (every 20 lines, ${times.length} calls): p50 ${pct(times, 0.5).toFixed(2)} ms, p95 ${pct(times, 0.95).toFixed(2)} ms, max ${Math.max(...times).toFixed(2)} ms`);
console.log(`whole file with type-check: p50 ${pct(typed, 0.5).toFixed(1)} ms, max ${Math.max(...typed).toFixed(1)} ms`);

console.log("\nbad fixture                 rule                  at line  caught at  lines early  ms");
for (const f of readdirSync(join(dir, "bad")).sort()) {
  const src = readFileSync(join(dir, "bad", f), "utf8");
  const spec = fixtureSpec(src);
  if (spec.stage !== "static" && spec.stage !== "copy" && spec.stage !== "typecheck") continue;
  const lines = src.split("\n");
  const whole = await verifyPartial(src);
  const at = whole.findings.find((x) => x.rule === spec.rule)?.line;
  let caught = -1, ms = 0;
  for (let n = 1; n <= lines.length; n++) {
    const r = await verifyPartial(lines.slice(0, n).join("\n"), { typecheck: n === lines.length });
    if (r.findings.some((x) => x.rule === spec.rule)) {
      caught = n;
      ms = r.ms;
      break;
    }
  }
  console.log(
    `${f.padEnd(27)} ${spec.rule!.padEnd(21)} ${String(at ?? "-").padStart(7)}  ${String(caught < 0 ? "never" : caught).padStart(9)}  ${caught < 0 ? "-" : String(lines.length - caught).padStart(11)}  ${ms.toFixed(2)}`,
  );
}
await shutdown();
