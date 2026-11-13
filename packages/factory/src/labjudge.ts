// bun src/labjudge.ts [--png]
//
// Blind judging for the lab match: per tool, candidates (the lab original and Spark through the
// loop), each judged on its own by the fixed judge (muse-spark-1.3 with the
// pictures), with no hint of where it came from. The moment given to the judge is the lab's own
// brief and page context. Writes eval/out/lab-match/scores.json, report.md, contact.html and
// contact-<n>.png (original | Spark per tool).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LAB_TOOLS as LAB12, r4Tools } from "../eval/labmatch.ts";
// The twelve lab tools, then the round-4 generalization set (Spark only, no originals).
const LAB_TOOLS = [...LAB12, ...r4Tools().map((x) => ({ ...x, r4: true }))];
import { CachedClient } from "./cache.ts";
import { EVAL_CRITERIA as CRITERIA, evaluate, passes, weighted, type Evaluation as Critique } from "./evaluator.ts";
import type { Lab3Result as LabResult } from "./labloop3.ts";
import { closeShoot, sheet } from "./look/shoot.ts";
import { MuseClient } from "./models/muse.ts";
import { chatContext } from "./prompts.ts";
const meanScore = weighted;

const OUT = join(import.meta.dir, "..", "eval", "out", "lab-match");
const KINDS = ["original", "spark", "spark-specwonder", "spark-specspark", "spark-self", "spark-low"] as const;
type Kind = (typeof KINDS)[number];

function pictures(id: string, kind: Kind): { rest: string; after: string } | null {
  const pick = (a: string, b: string) => (existsSync(a) && existsSync(b) ? { rest: a, after: b } : null);
  if (kind === "original") return pick(join(OUT, "..", "..", "..", "..", "..", "library", "lab", "_shots", id, "original-rest.png"), join(OUT, "..", "..", "..", "..", "..", "library", "lab", "_shots", id, "original-after.png"));
  const k = kind === "spark" && !LAB12.some((x) => x.id === id) ? "spark-r4" : kind;
  return pick(join(OUT, k, `${id}.rest-light.png`), join(OUT, k, `${id}.played-light.png`));
}

export type LabScore = { id: string; kind: Kind; critic: number | null; judge: Critique | null; seconds?: number; tokens?: number; rounds?: string; ok: boolean; pass?: boolean };

if (import.meta.main) {
  const judge = new CachedClient(new MuseClient({ model: "muse-spark-1.3", timeoutMs: 600_000 }));
  const scores: LabScore[] = [];
  for (const t of LAB_TOOLS)
    for (const kind of KINDS) {
      const dirK = kind === "spark" && "r4" in t ? "spark-r4" : kind;
      if ("r4" in t && kind !== "spark") continue;
      const res = kind === "original" ? null : existsSync(join(OUT, dirK, `${t.id}.json`)) ? (JSON.parse(readFileSync(join(OUT, dirK, `${t.id}.json`), "utf8")) as LabResult) : null;
      const pics = pictures(t.id, kind);
      const base = { id: t.id, kind, ok: kind === "original" || !!res?.ok, ...(res ? { seconds: res.seconds, tokens: res.tokens, rounds: res.steps.map((h) => `${h.pass[0]}${h.score ?? "x"}`).join(" > ") } : {}) };
      if (!pics || (kind !== "original" && !res?.ok)) {
        // Not run: no score. Run and failed the gate: scored on its last picture if there is one, else 1.
        scores.push({ ...base, critic: res ? 1 : null, judge: null });
        continue;
      }
      const png = await sheet(
        [
          { title: "At rest", png: new Uint8Array(readFileSync(pics.rest)) },
          { title: "After taps", png: new Uint8Array(readFileSync(pics.after)) },
        ],
        { columns: 2 },
      );
      try {
        const j = await evaluate(judge, png, `${t.brief}\n\n${chatContext(t)}`, { version: Number(process.env.EVAL_VERSION ?? "3"), label: "lab-judge", exclude: t.id });
        scores.push({ ...base, critic: meanScore(j), judge: j, pass: passes(j) });
        console.error(`${t.id} ${kind}: ${meanScore(j)}`);
      } catch (e) {
        console.error(`judge failed ${t.id} ${kind}: ${(e as Error).message.slice(0, 160)}`);
        scores.push({ ...base, critic: null, judge: null });
      }
    }
  writeFileSync(join(OUT, "scores.json"), JSON.stringify(scores, null, 1));

  // Tables.
  const get = (id: string, k: Kind) => scores.find((s) => s.id === id && s.kind === k);
  const f = (x: number | null | undefined) => (x == null ? "-" : String(Math.round(x * 100) / 100));
  const rows = LAB_TOOLS.map((t) => `| ${t.id} | ${t.surface} | ${f(get(t.id, "original")?.critic)} | ${f(get(t.id, "spark")?.critic)} | ${get(t.id, "spark")?.rounds ?? "-"} | ${f((get(t.id, "spark")?.seconds ?? 0) / 60)} | ${Math.round((get(t.id, "spark")?.tokens ?? 0) / 1000)}k |`);
  const both = LAB12.filter((t) => get(t.id, "original")?.critic != null);
  const gap = (k: Kind, c?: string) => {
    const xs = both.filter((t) => get(t.id, k)?.critic != null).map((t) => {
      const a = get(t.id, k)!, o = get(t.id, "original")!;
      const v = (s: LabScore) => (c ? (s.judge ? s.judge.scores[c as keyof Critique["scores"]] : 1) : s.critic!);
      return v(a) - v(o);
    });
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const allArms = [`| tool | ${KINDS.join(" | ")} |`, `|---|${KINDS.map(() => "---|").join("")}`, ...LAB_TOOLS.map((t) => `| ${t.id} | ${KINDS.map((k) => f(get(t.id, k)?.critic)).join(" | ")} |`)];
  const md = [
    "Blind judge scores by arm (calibrated evaluator, weighted 1 to 5; - not run):",
    "",
    ...allArms,
    "",
    `| tool | surface | original | Spark via loop | Spark critic by round | Spark min | Spark tokens |`,
    `|---|---|---|---|---|---|---|`,
    ...rows,
    "",
    `Mean gap to the original, over the lab tools each arm built (judge, 1 to 5; negative is behind; a build that failed the gate scores 1):`,
    "",
    `| arm | tools | ${CRITERIA.join(" | ")} | overall | mean score | original mean on the same tools |`,
    `|---|---|${CRITERIA.map(() => "---|").join("")}---|---|---|`,
    ...KINDS.filter((k) => k !== "original").map((k) => {
      const ts = both.filter((t) => get(t.id, k)?.critic != null);
      const m = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
      return `| ${k} | ${ts.length} | ${CRITERIA.map((c) => f(gap(k, c))).join(" | ")} | ${f(gap(k))} | ${f(m(ts.map((t) => get(t.id, k)!.critic!)))} | ${f(m(ts.map((t) => get(t.id, "original")!.critic!)))} |`;
    }),
    "",
    `Round-4 briefs (no originals; generalization): ${r4Tools().map((t) => `${t.id} ${f(get(t.id, "spark")?.critic)}`).join(", ")}.`,
  ].join("\n");
  writeFileSync(join(OUT, "report.md"), md + "\n");
  console.log(md);

  // Contact sheet.
  const img = (p: string | undefined) => (p && existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString("base64")}` : "");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = [
    `<!doctype html><meta charset="utf-8"><title>Lab match</title><style>body{font:14px/20px system-ui,sans-serif;margin:24px;background:#F0F2F5;color:#080809}section{background:#fff;border-radius:12px;padding:16px;margin:0 0 24px}.g{display:grid;grid-template-columns:repeat(4,minmax(240px,1fr));gap:12px}.g img{width:100%;border-radius:12px;border:1px solid #E4E6EB;margin-top:6px}.c{font-size:12px;color:#65686C;white-space:pre-wrap}pre{white-space:pre-wrap;background:#fff;padding:12px;border-radius:12px;font-size:12px}</style>`,
    `<h1>Lab match: original | Spark via the loop</h1><pre>${esc(md)}</pre>`,
    ...LAB_TOOLS.map((t) => {
      const cell = (k: Kind) => {
        const s = get(t.id, k), p = pictures(t.id, k);
        return `<div><b>${({ original: "Lab original", spark: "A · Spark, best of 8", "spark-specwonder": "C · Wonder spec, Spark build", "spark-specspark": "D · Spark spec, Spark build", "spark-self": "Spark builds and judges itself", "spark-low": "A at low effort" } as Record<string, string>)[k]}</b><div class="c">judge ${f(s?.critic)}${s?.rounds ? ` · critic rounds ${s.rounds}` : ""}${s?.seconds ? ` · ${f(s.seconds / 60)} min` : ""}\n${esc(s?.judge?.verdict ?? (s?.ok === false ? "did not pass the gate" : ""))}</div>${p ? `<img src="${img(p.rest)}"><img src="${img(p.after)}">` : ""}</div>`;
      };
      return `<section><b>${esc(t.id)}</b> · ${esc(t.surface)}<div class="c">${esc(t.brief)}</div><div class="g">${KINDS.filter((k) => pictures(t.id, k)).map(cell).join("")}</div></section>`;
    }),
  ].join("\n");
  writeFileSync(join(OUT, "contact.html"), html);
  console.error(`wrote ${join(OUT, "contact.html")}`);
  if (process.argv.includes("--png"))
    for (let i = 0; i < LAB_TOOLS.length; i += 4) {
      const cells = LAB_TOOLS.slice(i, i + 4).flatMap((t) =>
        KINDS.filter((k) => ["original", "spark"].includes(k)).map((k) => {
          const p = pictures(t.id, k);
          return { title: `${t.id} · ${k}`, sub: `judge ${f(get(t.id, k)?.critic)}`, png: p ? new Uint8Array(readFileSync(p.rest)) : new Uint8Array() };
        }),
      );
      writeFileSync(join(OUT, `contact-${i / 4 + 1}.png`), await sheet(cells, { columns: 4, cellWidth: 320, heading: `Lab match · original | Spark A` }));
    }
  await closeShoot();
}
