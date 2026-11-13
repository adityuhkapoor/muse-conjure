// bun src/labreport.ts
// Tables for LAB_MATCH.md from the run records in eval/out/lab-match/<arm>/<tool>.json: per arm and
// tool, the first candidate's score, the best creative score, the score after the Meta pass and after
// the gate, minutes, tokens and estimated dollars, the curve by round, and timing by stage.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Lab3Result } from "./labloop3.ts";
import { PRICES } from "./models/index.ts";

const OUT = join(import.meta.dir, "..", "eval", "out", "lab-match");
const ARMS: [string, string][] = [
  ["spark", "A · Spark from the short brief, best of 8"],
  ["spark-specwonder", "C · Wonder writes the spec, Spark builds"],
  ["spark-specspark", "D · Spark writes the spec, Spark builds"],
  ["spark-self", "Spark builds and evaluates itself"],
  ["spark-r4", "A on round-4 briefs (generalization)"],
  ["spark-low", "A at low reasoning effort"],
];
const f = (x: number | null | undefined, d = 2) => (x == null ? "-" : String(Math.round(x * 10 ** d) / 10 ** d));
const median = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : null;
};

/** Dollars for the Muse calls in a record (evaluator calls are not billed per token here). */
function dollars(r: Lab3Result): number | null {
  if (!r.byModel) return null;
  let usd = 0;
  for (const [id, m] of Object.entries(r.byModel)) {
    const model = id.split(":")[1] ?? "";
    const p = PRICES[model];
    if (!p) continue;
    // Input tokens per model are not split out; take this model's share of output to apportion input.
    const share = r.tokensOut ? m.out / r.tokensOut : 0;
    usd += ((r.tokensIn ?? 0) * share * p[0] + m.out * p[1]) / 1e6;
  }
  return usd;
}

const rows: string[] = [];
const summary: string[] = ["| arm | tools | first (median) | best creative (median) | after gate (median) | gate ok | minutes (median) | tokens (median) | dollars per tool (median) |", "|---|---|---|---|---|---|---|---|---|"];
const curves: string[] = [];
const timing: string[] = ["| arm | tool | create/iterate s | evaluator s | type and render fixes s | gate s | render s | Spark out tok/s | load |", "|---|---|---|---|---|---|---|---|---|"];
for (const [arm, label] of ARMS) {
  const dir = join(OUT, arm);
  if (!existsSync(dir)) continue;
  const recs = readdirSync(dir).filter((x) => x.endsWith(".json")).map((x) => JSON.parse(readFileSync(join(dir, x), "utf8")) as Lab3Result);
  if (!recs.length) continue;
  rows.push(`\n### ${label}\n`, "| tool | first | best creative | after Meta pass | after gate | gate | minutes | tokens | dollars |", "|---|---|---|---|---|---|---|---|---|");
  for (const r of recs) {
    rows.push(`| ${r.id} | ${f(r.byPass.firstDraft)} | ${f(r.byPass.creative)} | ${f(r.byPass.meta)} | ${f(r.byPass.correct)} | ${r.gateOk ? "ok" : "failed"} | ${f(r.seconds / 60, 1)} | ${Math.round(r.tokens / 1000)}k | ${f(dollars(r), 3)} |`);
    curves.push(`- ${label.split(" · ")[0]} ${r.id}: ${r.steps.map((s) => `${s.pass === "creative" ? s.kind.split(" ")[0] : s.pass} ${s.score ?? "x"}`).join(" > ")}${r.candidateScores?.[0]?.length ? ` · first round candidates ${r.candidateScores[0].join(" / ")}` : ""}`);
    const lab = r.byLabel ?? {};
    const sum = (re: RegExp) => Object.entries(lab).filter(([k]) => re.test(k)).reduce((n, [, v]) => n + v.seconds, 0);
    const spark = Object.entries(r.byModel ?? {}).find(([k]) => k.includes("spark"))?.[1];
    timing.push(`| ${arm} | ${r.id} | ${f(sum(/^(create|iterate|pivot|spec|amend|meta|brief)/), 0)} | ${f(sum(/^evaluate/), 0)} | ${f(sum(/fix/), 0)} | ${f(r.timing?.gate, 0)} | ${f(r.timing?.render, 0)} | ${spark && spark.seconds ? f(spark.out / spark.seconds, 0) : "-"} | ${r.load?.join(" ") ?? "-"} |`);
  }
  summary.push(`| ${label} | ${recs.length} | ${f(median(recs.map((r) => r.byPass.firstDraft ?? NaN)))} | ${f(median(recs.map((r) => r.byPass.creative ?? NaN)))} | ${f(median(recs.map((r) => r.byPass.correct ?? NaN)))} | ${recs.filter((r) => r.gateOk).length}/${recs.length} | ${f(median(recs.map((r) => r.seconds / 60)), 1)} | ${Math.round((median(recs.map((r) => r.tokens)) ?? 0) / 1000)}k | ${f(median(recs.map((r) => dollars(r) ?? NaN)), 3)} |`);
}
const wonder = existsSync(join(OUT, "wonder-spend.json")) ? JSON.parse(readFileSync(join(OUT, "wonder-spend.json"), "utf8")) : null;
const md = [
  "## Arms (scores are the calibrated evaluator's weighted score, 1 to 5)",
  "",
  ...summary,
  wonder ? `\nWonder spend (from API usage, $4 in and $20 out per million): $${wonder.usd} over ${wonder.calls} calls (${wonder.in} in, ${wonder.out} out).` : "",
  ...rows,
  "\n## Score by round\n",
  ...curves,
  "\n## Time by stage (seconds) and Spark output speed\n",
  ...timing,
].join("\n");
writeFileSync(join(OUT, "arms.md"), md + "\n");
console.log(md);
