// bun src/report.ts --runs baseline[,after] [--png]
//
// Tables and contact sheets from eval/out/<run>/ (bench rows plus judge scores when present).
//   eval/out/<last run>/report.md          per config: pass rate, judge score per criterion, taste
//                                          with uncertainty, seconds, tokens, sameness; gap to the reference
//   eval/out/<last run>/contact.html       self-contained: per ask, the chat and each run x config
//                                          picture with gate result, mutation score, seconds, judge
//   eval/out/<last run>/contact-<n>.png    the same as PNG sheets, 6 asks each (with --png)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { askSet, CONFIGS, loadRows, type BenchRow } from "./bench.ts";

const HELDOUT = askSet();
import { CRITERIA } from "./compose.ts";
import { loadScores, type Scored } from "./judge.ts";
import { closeShoot, sheet } from "./look/shoot.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const OUT = join(import.meta.dir, "..", "eval", "out");
const median = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const f = (x: number | null, d = 2) => (x == null ? "-" : String(Math.round(x * 10 ** d) / 10 ** d));

export type Agg = {
  run: string;
  config: string;
  n: number;
  pass: number;
  critic: number | null;
  criticMean: number | null;
  per: Record<string, number | null>;
  taste: number | null;
  tasteUnc: number | null;
  seconds: number | null;
  tokens: number | null;
  mutation: number | null;
  distinct: number | null;
  paths: string;
};

export function aggregate(run: string): Agg[] {
  const scored = loadScores(run);
  const rows: Scored[] = scored.length ? scored : loadRows(run).map((r) => ({ ...r, judge: null, critic: null, taste: null, distinct: null }));
  return Object.keys(CONFIGS)
    .map((config) => {
      const rs = rows.filter((r) => r.config === config);
      const ok = rs.filter((r) => r.ok);
      // A failed tool scores 1 on every criterion: the person got nothing.
      const crit = (k?: string) => median(rs.map((r) => (r.ok && r.judge ? (k ? r.judge.scores[k as keyof typeof r.judge.scores] : r.critic!) : r.ok ? NaN : 1)));
      const paths = ["reuse", "adapt", "build"].map((p) => `${p} ${rs.filter((r) => r.path === p).length}`).join(", ");
      return {
        run,
        config,
        n: rs.length,
        pass: ok.length,
        critic: crit(),
        criticMean: mean(rs.map((r) => (r.ok ? (r.critic ?? NaN) : 1)).filter((x) => Number.isFinite(x))),
        per: Object.fromEntries(CRITERIA.map((c) => [c, crit(c)])),
        taste: mean(ok.flatMap((r) => (r.taste ? [r.taste.score] : []))),
        tasteUnc: mean(ok.flatMap((r) => (r.taste ? [r.taste.uncertainty] : []))),
        seconds: median(rs.map((r) => r.seconds)),
        tokens: median(rs.map((r) => r.tokensIn + r.tokensOut)),
        mutation: median(ok.flatMap((r) => (r.mutation != null ? [r.mutation] : []))),
        distinct: median(ok.flatMap((r) => (r.distinct != null ? [r.distinct] : []))),
        paths,
      };
    })
    .filter((a) => a.n > 0);
}

export function tables(runs: string[]): string {
  const aggs = runs.flatMap(aggregate);
  const lines = [
    "| run | config | pass | judge median / mean (1-5, failed = 1) | taste (mean ± unc) | mutation | seconds (median) | tokens (median) | distinct | paths |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...aggs.map((a) => `| ${a.run} | ${CONFIGS[a.config]!.label} | ${a.pass}/${a.n} | ${f(a.critic)} / ${f(a.criticMean)} | ${f(a.taste)} ± ${f(a.tasteUnc)} | ${f(a.mutation)} | ${f(a.seconds, 0)} | ${a.tokens == null ? "-" : `${Math.round(a.tokens / 1000)}k`} | ${f(a.distinct)} | ${a.paths} |`),
    "",
    "Gap to the muse-spark-1.3 reference of the same run, per criterion (negative is behind it):",
    "",
    `| run | config | ${CRITERIA.join(" | ")} | judge |`,
    `|---|---|${CRITERIA.map(() => "---|").join("")}---|`,
  ];
  for (const run of runs) {
    const ref = aggs.find((a) => a.run === run && a.config === "spark");
    const refBase = aggs.find((a) => a.run === runs[0] && a.config === "spark");
    for (const a of aggs.filter((x) => x.run === run)) {
      const r = ref ?? refBase;
      if (!r) continue;
      lines.push(`| ${run} | ${CONFIGS[a.config]!.label} | ${CRITERIA.map((c) => f(a.per[c] != null && r.per[c] != null ? a.per[c]! - r.per[c]! : null)).join(" | ")} | ${f(a.critic != null && r.critic != null ? a.critic - r.critic : null)} |`);
    }
  }
  if (runs.length > 1) {
    const base = runs[0]!;
    lines.push("", `Gap to the ${base} muse-spark-1.3 reference (the fixed bar):`, "", `| run | config | ${CRITERIA.join(" | ")} | judge |`, `|---|---|${CRITERIA.map(() => "---|").join("")}---|`);
    const r = aggs.find((a) => a.run === base && a.config === "spark");
    if (r) for (const a of aggs) lines.push(`| ${a.run} | ${CONFIGS[a.config]!.label} | ${CRITERIA.map((c) => f(a.per[c] != null && r.per[c] != null ? a.per[c]! - r.per[c]! : null)).join(" | ")} | ${f(a.critic != null && r.critic != null ? a.critic - r.critic : null)} |`);
  }
  return lines.join("\n");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function rowsOf(run: string): Map<string, Scored> {
  const s = loadScores(run);
  const rows: Scored[] = s.length ? s : loadRows(run).map((r) => ({ ...r, judge: null, critic: null, taste: null, distinct: null }));
  return new Map(rows.map((r) => [`${r.config}/${r.ask}`, r]));
}

function cellLabel(run: string, r: BenchRow & Partial<Scored>): string {
  const gate = r.ok ? `pass · mutation ${r.mutation ?? "-"}` : `fail · ${r.stage}`;
  return `${run} · ${CONFIGS[r.config]!.label}\n${gate} · ${r.seconds}s${r.critic != null ? ` · judge ${r.critic}` : ""}${r.path !== "build" ? ` · ${r.path}` : ""}`;
}

if (import.meta.main) {
  const runs = arg("runs", "baseline").split(",");
  const last = runs.at(-1)!;
  const dir = join(OUT, last);
  const md = tables(runs);
  writeFileSync(join(dir, "report.md"), md + "\n");
  console.log(md);

  const maps = runs.map((r) => ({ run: r, rows: rowsOf(r) }));
  const configs = Object.keys(CONFIGS);
  const img = (run: string, r: BenchRow | undefined, scene: "rest" | "played") => {
    const file = r?.shots.find((x) => x.includes(`.${scene}.`));
    if (!r || !file) return "";
    const p = join(OUT, run, r.config, file);
    return existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString("base64")}` : "";
  };
  const html = [
    `<!doctype html><meta charset="utf-8"><title>Muse eval · ${esc(runs.join(" vs "))}</title>`,
    `<style>body{font:14px/20px system-ui,-apple-system,sans-serif;margin:24px;background:#F0F2F5;color:#080809}h1{font-size:20px}section{background:#fff;border-radius:12px;padding:16px;margin:0 0 24px}
    .chat{white-space:pre-wrap;color:#65686C;font-size:13px;max-width:560px}.grid{display:grid;grid-template-columns:repeat(${configs.length * runs.length},minmax(260px,1fr));gap:12px;margin-top:12px}
    .cell img{width:100%;border-radius:12px;display:block;margin-top:6px;border:1px solid #E4E6EB}.cap{white-space:pre-wrap;font-size:12px;color:#65686C}.fail{color:#DD2334}pre{white-space:pre-wrap;background:#fff;padding:12px;border-radius:12px;font-size:12px}</style>`,
    `<h1>Held-out asks · ${esc(runs.join(" vs "))}</h1><pre>${esc(md)}</pre>`,
    ...HELDOUT.map((a) => {
      const cells = configs.flatMap((c) =>
        maps.map(({ run, rows }) => {
          const r = rows.get(`${c}/${a.id}`);
          if (!r) return `<div class="cell"><div class="cap">${esc(run)} · ${esc(CONFIGS[c]!.label)}\nnot run</div></div>`;
          const rest = img(run, r, "rest"), played = img(run, r, "played");
          return `<div class="cell"><div class="cap${r.ok ? "" : " fail"}">${esc(cellLabel(run, r))}${r.failure ? `\n${esc(r.failure.slice(0, 160))}` : ""}</div>${rest ? `<img src="${rest}" alt="at rest">` : ""}${played ? `<img src="${played}" alt="after taps">` : ""}${r.judge ? `<div class="cap">${esc(r.judge.verdict)}</div>` : ""}</div>`;
        }),
      );
      return `<section><b>${esc(a.id)}</b> · ${esc(a.surface)} · “${esc(a.ask)}”<div class="chat">${esc(a.chat.title ?? "")}\n${esc(a.chat.messages.map((m) => `${m.from}: ${m.text}`).join("\n"))}</div><div class="grid">${cells.join("")}</div></section>`;
    }),
  ].join("\n");
  writeFileSync(join(dir, "contact.html"), html);
  console.error(`wrote ${join(dir, "contact.html")}`);

  if (process.argv.includes("--png")) {
    for (let i = 0; i < HELDOUT.length; i += 6) {
      const cells = HELDOUT.slice(i, i + 6).flatMap((a) =>
        configs.flatMap((c) =>
          maps.map(({ run, rows }) => {
            const r = rows.get(`${c}/${a.id}`);
            const src = img(run, r, "rest");
            return { title: `${a.id}`, sub: r ? cellLabel(run, r) : `${run} · ${c}: not run`, png: src ? new Uint8Array(Buffer.from(src.split(",")[1]!, "base64")) : new Uint8Array() };
          }),
        ),
      );
      const png = await sheet(cells, { columns: configs.length * runs.length, heading: `${runs.join(" vs ")} · asks ${i + 1} to ${Math.min(i + 6, HELDOUT.length)}`, cellWidth: 300 });
      writeFileSync(join(dir, `contact-${i / 6 + 1}.png`), png);
      console.error(`wrote ${join(dir, `contact-${i / 6 + 1}.png`)}`);
    }
    await closeShoot();
  }
}
