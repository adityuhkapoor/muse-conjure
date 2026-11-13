// Run the checker over every tool in the repo: library pieces, app examples, the factory's replay
// fixtures and (read-only) the tool cache. `bun scripts/survey.ts [--deep] [--json out.json] [filter]`
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check, type CheckReport } from "../src/index.ts";

const ROOT = join(import.meta.dir, "../../..");
export function tools(): { group: string; id: string; file: string }[] {
  const out: { group: string; id: string; file: string }[] = [];
  const lib = join(ROOT, "library/pieces");
  for (const d of readdirSync(lib).sort()) if (existsSync(join(lib, d, "piece.tsx"))) out.push({ group: "piece", id: d, file: join(lib, d, "piece.tsx") });
  const ex = join(ROOT, "packages/app/examples");
  for (const f of readdirSync(ex).sort()) if (f.endsWith(".tsx")) out.push({ group: "example", id: f.replace(".tsx", ""), file: join(ex, f) });
  const rp = join(ROOT, "packages/factory/fixtures/replay");
  for (const f of readdirSync(rp).sort()) if (f.endsWith(".tsx")) out.push({ group: "replay", id: f.replace(".tsx", ""), file: join(rp, f) });
  const cache = join(ROOT, "library/cache");
  if (existsSync(cache))
    for (const d of readdirSync(cache).sort()) if (existsSync(join(cache, d, "source.tsx"))) out.push({ group: "cache", id: d, file: join(cache, d, "source.tsx") });
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const deep = args.includes("--deep");
  const ji = args.indexOf("--json");
  const jsonOut = ji >= 0 ? args[ji + 1] : undefined;
  const filter = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--json");
  const rows: { group: string; id: string; r: CheckReport }[] = [];
  for (const t of tools()) {
    if (filter && !`${t.group}/${t.id}`.includes(filter)) continue;
    const r = check(readFileSync(t.file, "utf8"), { profile: deep ? "deep" : "default", name: t.id });
    rows.push({ group: t.group, id: t.id, r });
    const fails = r.failures.map((f) => `${f.rule}(${f.trace?.length ?? 0})`).join(" ");
    const warns = r.warnings.map((f) => `${f.rule}(${f.trace?.length ?? 0})`).join(" ");
    console.log(
      `${t.group.padEnd(7)} ${t.id.padEnd(22)} ${r.verdict.padEnd(8)} ${String(r.stats.states).padStart(6)} st ${String(r.stats.ms).padStart(6)} ms d${r.stats.depth} ${r.stats.exhausted ? "exh" : "BND"} ${r.model.seedSensitive ? "S" : "-"}${r.model.timeSensitive ? "T" : "-"} gt=${r.model.actions.missingMass.mean} cap=${r.model.actions.capped} conc=${r.concurrency.orders}${r.concurrency.capped ? "!" : ""} ${fails}${warns ? " | warn " + warns : ""}`,
    );
  }
  const ms = rows.filter((x) => x.group === "piece").map((x) => x.r.stats.ms).sort((a, b) => a - b);
  if (ms.length) console.log(`pieces: median ${ms[Math.floor(ms.length / 2)]} ms, worst ${ms[ms.length - 1]} ms`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows.map((x) => ({ group: x.group, id: x.id, ...x.r })), null, 1));
}
