// The fast profile: a live build someone is waiting for.
//
//   brief      Ember writes a two-to-four-line lab brief from the chat
//   scaffold   the nearest lab tool's source is the starting file (never a blank file)
//   draft      Spark (contributor) writes SEARCH/REPLACE edits to the scaffold, 4 candidates at
//              once; Ember fixes compile errors with edits; the first candidate that renders and
//              passes the picture checks is streamed to the caller (`onDraft`) and wins
//   improve    one round: the gate and the evaluator run at the same time; Spark applies the
//              evaluator's fixes and Ember the gate's, as edits; the result replaces the draft
//
// Snapshots at 60, 120 and 240 s record the best version available at that moment, so speed
// and quality can be read off one table (scored later by the calibrated evaluator).
//
// CLI: bun src/fast.ts [--only id,id] [--evaluator muse:muse-spark-1.3-contributor]

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, verify, warm, type Report } from "@muse/verify";
import { HELDOUT } from "../eval/heldout.ts";
import { repairAll } from "./compose.ts";
import { applyEdits, EDIT_INSTRUCTIONS } from "./edits.ts";
import { evaluate, weighted, type Evaluation } from "./evaluator.ts";
import { LAB_GATE, makeClient, nearestPorts } from "./labloop.ts";
import { closeShoot, sheet, shoot } from "./look/shoot.ts";
import { Meter } from "./meter.ts";
import { apiText, chatContext } from "./prompts.ts";
import { tasteLint } from "./tastelint.ts";
import type { GenerateRequest, ModelClient } from "./types.ts";

export type FastSnap = { at: number; stage: string; source: string; gateOk: boolean };
export type FastResult = { id: string; seconds: number; firstDraftAt: number | null; gateOkAt: number | null; snaps: FastSnap[]; source: string; gateOk: boolean; evaluation: Evaluation | null; byLabel: Meter["byLabel"]; byModel: Meter["byModel"]; scaffold: string; load: number[]; error?: string };

export async function fastBuild(req: GenerateRequest, o: { spark: ModelClient; ember: ModelClient; evaluator: ModelClient; onDraft?: (source: string, at: number) => void; deadlineMs?: number }): Promise<FastResult> {
  const t0 = performance.now();
  const at = () => Math.round((performance.now() - t0) / 100) / 10;
  const spark = new Meter(o.spark);
  const ember = new Meter(o.ember, spark);
  const evaluator = new Meter(o.evaluator, spark);
  const res: FastResult = { id: "", seconds: 0, firstDraftAt: null, gateOkAt: null, snaps: [], source: "", gateOk: false, evaluation: null, byLabel: {}, byModel: {}, scaffold: "", load: (require("node:os") as typeof import("node:os")).loadavg().map((x) => Math.round(x * 10) / 10) };
  const snap = (stage: string, source: string, gateOk: boolean) => res.snaps.push({ at: at(), stage, source, gateOk });

  // Brief with Ember; scaffold from the nearest lab tool.
  const brief = (await ember.complete({ label: "brief", system: "Write one lab brief entry, two to four lines: the moment, the named friends and their words, the one visual idea as a physical thing, who already did what. Interpret boldly. Only the members' names.", messages: [{ role: "user", content: chatContext(req) }], effort: "low" })).trim();
  const lt = { ...req, id: "fast", expect: "build" as const, brief, original: { rest: "", after: "" } };
  const scaffold = nearestPorts(lt, 1)[0];
  if (!scaffold) return { ...res, error: "no scaffold" };
  res.scaffold = scaffold.id;
  const system = `You change an existing small chat app into a new one for this moment, with SEARCH/REPLACE edits to its source. Keep its drawing craft and structure; change the content, the seeded friends and their words, the labels, and the picture where the moment needs a different object. Only the members' names. Copy each SEARCH block exactly from the source.\n\n# The API\n\n${apiText()}`;
  const user = `${chatContext(req)}\n\nThe brief:\n${brief}\n\nThe app to change (${scaffold.id}: ${scaffold.summary}):\n\n\`\`\`tsx\n${scaffold.source.trim()}\n\`\`\`\n\n${EDIT_INSTRUCTIONS}`;

  const typeFix = async (src: string, k: number): Promise<string> => {
    for (let i = 0; i < 3; i++) {
      const r = await verify(src, { skip: ["determinism", "invariants", "mutation", "render", "copy"], ...LAB_GATE });
      if (r.ok || (r.stage !== "typecheck" && r.stage !== "static")) return src;
      const msg = r.failures.slice(0, 5).map((f) => `- line ${f.line ?? "?"}: ${f.message.slice(0, 200)}`).join("\n");
      src = applyEdits(src, await ember.complete({ label: "type-fix", system: "Fix compile errors with the smallest edits.", messages: [{ role: "user", content: `${msg}\n\n\`\`\`tsx\n${src.trim()}\n\`\`\`\n\n${EDIT_INSTRUCTIONS}` }], effort: "low", nonce: k * 10 + i + 1 } as Parameters<ModelClient["complete"]>[0])) ?? src;
    }
    return src;
  };

  // Four candidates at once; the first that renders and passes the picture checks wins.
  let winner: string | null = null;
  await new Promise<void>((resolve) => {
    let left = 4;
    for (let k = 0; k < 4; k++) {
      (async () => {
        try {
          const reply = await spark.complete({ label: "draft", system, messages: [{ role: "user", content: user + (k ? `\n\nCandidate ${k + 1}: take a different visual angle from the obvious one.` : "") }], nonce: k + 1 } as Parameters<ModelClient["complete"]>[0]);
          if (winner) return;
          let src = applyEdits(scaffold.source, reply);
          if (!src) return;
          src = await typeFix(src, k);
          if (winner) return;
          const [rest] = await shoot(src, { members: req.members, scenes: ["rest"], modes: ["light"] });
          if (!rest || !rest.png.length || rest.errors.length) return;
          const lint = await tasteLint(src, req.members, rest);
          if (lint.some((l) => l.rule === "form-not-picture") || winner) return;
          winner = src;
          res.firstDraftAt = at();
          snap("first draft", src, false);
          o.onDraft?.(src, res.firstDraftAt);
          resolve();
        } catch {
        } finally {
          if (--left === 0) resolve();
        }
      })();
    }
  });
  if (!winner) return { ...res, seconds: at(), error: "no candidate rendered" };
  let src: string = winner;

  // One round: the gate and the evaluator at the same time.
  const look = async (s: string) => {
    const shots = await shoot(s, { members: req.members, scenes: ["rest", "played"], modes: ["light"] });
    return sheet(shots.map((x) => ({ title: x.scene, png: x.png })), { columns: 2 });
  };
  const [report, ev] = await Promise.all([verify(src, LAB_GATE), look(src).then((png) => evaluate(evaluator, png, `${brief}\n\n${chatContext(req)}`, { version: 3, label: "evaluate" })).catch(() => null)]);
  let gate: Report = report;
  if (gate.ok) {
    res.gateOkAt = at();
    snap("draft passes the gate", src, true);
  }
  if (ev && ev.fixes.length) {
    const fixes = ev.fixes.slice(0, 4).map((f, i) => `${i + 1}. ${f.where}: ${f.problem}. ${f.fix}`).join("\n");
    const edited = applyEdits(src, await spark.complete({ label: "improve", system, messages: [{ role: "user", content: `Apply these design fixes:\n${fixes}\n\n\`\`\`tsx\n${src.trim()}\n\`\`\`\n\n${EDIT_INSTRUCTIONS}` }] }));
    if (edited) {
      const fixed = await typeFix(edited, 9);
      const g2 = await verify(fixed, LAB_GATE);
      if (g2.ok || !gate.ok) {
        src = fixed;
        gate = g2;
        snap("after the evaluator's fixes", src, g2.ok);
      }
    }
  }
  for (let i = 0; !gate.ok && i < 3; i++) {
    const edited = applyEdits(src, await ember.complete({ label: "repair", system: "Fix the failing check with the smallest edits.", messages: [{ role: "user", content: repairAll(src, gate).replace("Reply with the whole fixed module in one ```tsx block and nothing else.", EDIT_INSTRUCTIONS) }], effort: "low", nonce: 100 + i } as Parameters<ModelClient["complete"]>[0]));
    if (!edited) continue;
    src = edited;
    gate = await verify(src, LAB_GATE);
    if (gate.ok) {
      res.gateOkAt ??= at();
      snap("repaired", src, true);
    }
  }
  return { ...res, seconds: at(), source: src, gateOk: gate.ok, evaluation: ev, byLabel: spark.byLabel, byModel: { ...spark.byModel, ...ember.byModel, ...evaluator.byModel } };
}

/** The version available at `t` seconds: the latest snapshot at or before it. */
export const at = (r: FastResult, t: number) => [...r.snaps].reverse().find((s) => s.at <= t) ?? null;

if (import.meta.main) {
  const arg = (k: string, d: string) => {
    const i = process.argv.indexOf(`--${k}`);
    return i >= 0 ? (process.argv[i + 1] ?? d) : d;
  };
  const ids = arg("only", "formal-seats,roadtrip-pass,brunch-spots,cabo-iou,dress-shopping,airport-rides").split(",");
  const out = join(import.meta.dir, "..", "eval", "out", "fast");
  mkdirSync(out, { recursive: true });
  await warm();
  const judge = makeClient("muse:muse-spark-1.3");
  const rows: string[] = [];
  for (const id of ids) {
    const req = HELDOUT.find((a) => a.id === id)!;
    const r = await fastBuild(req, { spark: makeClient("muse:muse-spark-1.3-contributor"), ember: makeClient("muse:muse-ember-1.0"), evaluator: makeClient(arg("evaluator", "muse:muse-spark-1.3-contributor")) });
    r.id = id;
    // Score each checkpoint with the calibrated evaluator, the same one used everywhere.
    const scores: Record<string, number | null> = {};
    for (const t of [60, 120, 240]) {
      const s = at(r, t);
      if (!s) {
        scores[t] = null;
        continue;
      }
      try {
        const shots = await shoot(s.source, { members: req.members, scenes: ["rest", "played"], modes: ["light"] });
        const png = await sheet(shots.map((x) => ({ title: x.scene, png: x.png })), { columns: 2 });
        writeFileSync(join(out, `${id}.${t}s.png`), png);
        scores[t] = weighted(await evaluate(judge, png, `${req.ask}\n\n${chatContext(req)}`, { version: 3, label: "fast-judge" }));
      } catch {
        scores[t] = null;
      }
    }
    writeFileSync(join(out, `${id}.json`), JSON.stringify({ ...r, scores }, null, 1));
    if (r.source) writeFileSync(join(out, `${id}.tsx`), r.source);
    const line = `${id}: first draft ${r.firstDraftAt ?? "-"} s · gate ok ${r.gateOkAt ?? "-"} s · done ${r.seconds} s · scaffold ${r.scaffold} · score at 60/120/240 s ${scores[60] ?? "-"} / ${scores[120] ?? "-"} / ${scores[240] ?? "-"} · load ${r.load.join(" ")}${r.error ? ` · ${r.error}` : ""}`;
    rows.push(line);
    console.error(line);
  }
  writeFileSync(join(out, "results.txt"), rows.join("\n") + "\n");
  await closeShoot();
  await shutdown();
}
