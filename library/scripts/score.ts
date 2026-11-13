// Usage: bun scripts/score.ts [id ...] [--file path]. Prints stage, mutation score and failures per piece.
import { readFileSync } from "node:fs";
import { shutdown, verify, warm } from "@muse/verify";
import { fill, pieces } from "../index.ts";

const args = process.argv.slice(2);
const ids = args.filter((a) => !a.startsWith("--"));
await warm();
const jobs: [string, string][] = [];
const fi = args.indexOf("--file");
if (fi >= 0) jobs.push([args[fi + 1]!, readFileSync(args[fi + 1]!, "utf8")]);
else
  for (const p of pieces().filter((p) => !ids.length || ids.includes(p.id))) {
    jobs.push([p.id, p.source]);
    p.examples.forEach((e, i) => jobs.push([`${p.id}#${i + 1}`, fill(p, e)]));
  }
for (const [name, src] of jobs) {
  const r = await verify(src, args.includes("--all") ? { all: true } : undefined);
  const m = r.mutation;
  console.log(`${name}: ok=${r.ok} stage=${r.stage} mutation=${m ? `${m.score} (${m.killed}/${m.total}, inert ${m.inert})` : "-"} weak=${JSON.stringify(r.weak ?? [])} ran=${JSON.stringify(r.ran)}`);
  for (const f of r.failures) console.log("   FAIL", f.rule, f.message.slice(0, 300), JSON.stringify(f.trace ?? "").slice(0, 300));
  for (const w of r.warnings ?? []) console.log("   warn", JSON.stringify(w).slice(0, 200));
}
await shutdown();
