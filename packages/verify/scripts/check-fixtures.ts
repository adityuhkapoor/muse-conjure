// Runs the gate on every fixture and prints stage, rules and timing. Used while writing rules.
// A fixture with `// Profile: strict.` runs in the strict profile (and, if bad, must also pass
// the default profile unless its rule is one the default profile blocks).
// bun scripts/check-fixtures.ts [name-filter]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, verify, warm } from "../src/index.ts";
import { fixtureSpec } from "../test/spec.ts";

const dir = join(import.meta.dir, "../fixtures");
const only = process.argv[2];
await warm({ profile: "strict" });
let bad = 0;
for (const kind of ["good", "bad"]) {
  for (const f of readdirSync(join(dir, kind)).sort()) {
    if (only && !f.includes(only)) continue;
    const src = readFileSync(join(dir, kind, f), "utf8");
    const spec = fixtureSpec(src);
    const r = await verify(src, { stageTimeoutMs: 1500, profile: spec.profile });
    const rules = [...new Set(r.failures.map((x) => x.rule))];
    const ok = kind === "good" ? r.ok : r.stage === spec.stage && rules.includes(spec.rule!) && rules.every((x) => x === spec.rule || spec.also.includes(x));
    if (!ok) bad++;
    const tr = r.failures[0]?.trace?.length;
    console.log(
      `${ok ? "OK  " : "BAD "} ${kind}/${f.padEnd(28)} ${spec.profile.padEnd(7)} ${r.stage.padEnd(11)} ${rules.join(",").padEnd(28)} ${spec.rule ? `want ${spec.stage}/${spec.rule}` : ""} trace=${tr ?? "-"} total=${r.timings.total}ms`,
    );
  }
}
await shutdown();
process.exit(bad ? 1 : 0);
