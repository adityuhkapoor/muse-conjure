// The strict profile over every tool we have (read-only): library pieces, the app examples, lab ports and,
// when present, library/cache entries. Prints failures per rule and per tool, and writes the
// whole result as JSON for BY_CONSTRUCTION.md.
// bun scripts/survey.ts [out.json]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, verify, warm } from "../src/index.ts";

const root = join(import.meta.dir, "../../..");
const tools: { id: string; file: string }[] = [];
const pieces = join(root, "library/pieces");
for (const d of readdirSync(pieces).sort()) if (existsSync(join(pieces, d, "piece.tsx"))) tools.push({ id: `piece/${d}`, file: join(pieces, d, "piece.tsx") });
const ex = join(root, "packages/app/examples");
for (const f of readdirSync(ex).sort()) if (f.endsWith(".tsx")) tools.push({ id: `example/${f.replace(".tsx", "")}`, file: join(ex, f) });
const lab = join(root, "library/lab");
if (existsSync(lab))
  for (const d of readdirSync(lab).sort()) if (existsSync(join(lab, d, "app.tsx"))) tools.push({ id: `lab/${d}`, file: join(lab, d, "app.tsx") });
const cache = join(root, "library/cache");
if (existsSync(cache))
  for (const d of readdirSync(cache).sort()) if (existsSync(join(cache, d, "source.tsx"))) tools.push({ id: `cache/${d}`, file: join(cache, d, "source.tsx") });

await warm({ profile: "strict" });
type Row = { id: string; ok: boolean; okDefault: boolean; rules: Record<string, number>; failures: { rule: string; message: string; state?: unknown; fix?: string }[]; ms: number };
const rows: Row[] = [];
for (const t of tools) {
  const src = readFileSync(t.file, "utf8");
  const d = await verify(src, { all: true, artifacts: false });
  const r = await verify(src, { profile: "strict", all: true, artifacts: false });
  const rules: Record<string, number> = {};
  for (const f of r.failures) rules[f.rule] = (rules[f.rule] ?? 0) + 1;
  rows.push({ id: t.id, ok: r.ok, okDefault: d.ok, rules, failures: r.failures.map((f) => ({ rule: f.rule, message: f.message.slice(0, 240), state: f.detail?.state, ...(f.fix ? { fix: f.fix } : {}) })), ms: r.timings.total! });
  console.log(`${r.ok ? "pass" : "FAIL"} ${t.id.padEnd(32)} default ${d.ok ? "pass" : "FAIL"}  ${Object.entries(rules).map(([k, v]) => `${k}×${v}`).join(" ")}  ${r.timings.total} ms`);
}
await shutdown();
const per: Record<string, { failures: number; tools: string[] }> = {};
for (const r of rows) for (const [k, v] of Object.entries(r.rules)) ((per[k] ??= { failures: 0, tools: [] }).failures += v), per[k]!.tools.push(r.id);
console.log("\nper rule (failures, tools):");
for (const [k, v] of Object.entries(per).sort((a, b) => b[1].failures - a[1].failures)) console.log(`  ${k.padEnd(24)} ${String(v.failures).padStart(3)}  ${v.tools.length} tools`);
console.log(`\n${rows.filter((r) => r.ok).length} of ${rows.length} pass strict; ${rows.filter((r) => r.okDefault).length} pass default`);
const worst = [...rows].sort((a, b) => b.failures.length - a.failures.length).slice(0, 5);
console.log("worst:", worst.map((w) => `${w.id} (${w.failures.length})`).join(", "));
writeFileSync(process.argv[2] ?? "/tmp/muse-verify-survey.json", JSON.stringify({ rows, per }, null, 2));
