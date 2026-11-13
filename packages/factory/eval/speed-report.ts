// bun eval/speed-report.ts <name> [--params]: the rows of one eval/speed.ts run, one line per run, for reading
// the fills against the chat; with --params the filled params follow each line.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2]!;
const withParams = process.argv.includes("--params");
const j = JSON.parse(readFileSync(join(import.meta.dir, "out", "speed", `${name}.json`), "utf8")) as { summary: Record<string, unknown>; rows: Record<string, any>[] };
for (const r of j.rows) {
  const calls = (r.calls as string[]).filter((c) => /fill/.test(c)).map((c) => c.replace(/^(router-)?/, "")).join(" ");
  console.log(`${String(r.i).padStart(2)}.${r.run} ${String(r.chat).padEnd(7)} ${String(r.kind).padEnd(8)} ${String(r.piece ?? r.exit).slice(0, 20).padEnd(20)} ${Number(r.totalS).toFixed(1).padStart(5)}s cov ${r.covered} g=${r.grounded} e=${r.empty} s=${r.score} ${calls}`);
  if (withParams && r.params) console.log("    " + JSON.stringify(r.params).slice(0, 420));
}
const { tokensByLabel, ...rest } = j.summary as any;
console.log(JSON.stringify(rest));
