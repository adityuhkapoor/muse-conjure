// What gets into the cache. An entry needs: the whole gate (mutation score 0.8 or more, copy lint
// clean), then the second look (second-look.ts), then not to look like an entry already cached for a
// different kind of ask. Only then are its files written.

import { MuseClient } from "../../packages/factory/src/models/muse.ts";
import { compileApp, type Report } from "./deps.ts";
import { extractParams } from "./params.ts";
import { distance, secondLook, type Look } from "./second-look.ts";
import { GATE_OPTIONS, rebuildIndex, readIndex, writeEntry } from "./store.ts";
import type { ChatSample, Family, Member, Meta, Surface } from "./types.ts";

/** Two tools look "almost identical" when their rest screenshots' 64 bit hashes differ by this many bits or fewer. */
export const SAME_LOOK_BITS = 6;
export const MIN_SCORE = GATE_OPTIONS.mutationThreshold;

export type AskInfo = { id: string; ask: string; kind: string; family: Family; surface: Surface; chat: ChatSample; members: Member[] };
export type Admission = { status: "cached" | "rejected"; reasons: { rule: string; message: string }[]; look?: Look; meta?: Meta };

/** Gate criteria that do not need a browser: the whole gate passed and the score is high enough. */
export function gateReasons(report: Report | null): { rule: string; message: string }[] {
  const out: { rule: string; message: string }[] = [];
  if (!report) return [{ rule: "gate-missing", message: "no gate report" }];
  if (!report.ok) out.push({ rule: "gate-failed", message: `${report.stage}: ${report.failures[0]?.rule ?? ""}` });
  for (const s of ["static", "mutation", "render", "copy"] as const) if (!report.ran.includes(s)) out.push({ rule: "gate-incomplete", message: `stage ${s} did not run` });
  const score = report.mutation?.score ?? 0;
  if (score < MIN_SCORE) out.push({ rule: "low-score", message: `mutation score ${score} is under ${MIN_SCORE}` });
  if (report.failures.some((f) => f.rule.startsWith("copy") || report.stage === "copy")) out.push({ rule: "copy-lint", message: "copy lint failed" });
  return out;
}

const DESCRIBE = {
  type: "object",
  properties: {
    sentence: { type: "string" },
    use_when: { type: "array", items: { type: "string" } },
    dont_use_when: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    members_min: { type: "integer" },
    members_max: { type: "integer" },
  },
  required: ["sentence", "use_when", "dont_use_when", "keywords", "members_min", "members_max"],
  additionalProperties: false,
};

async function describe(a: AskInfo, source: string): Promise<{ sentence: string; use_when: string[]; dont_use_when: string[]; keywords: string[]; min: number; max: number }> {
  const fallback = { sentence: a.ask, use_when: [a.ask], dont_use_when: [], keywords: [a.kind], min: 2, max: 12 };
  try {
    const reply = await new MuseClient({ model: "muse-spark-1.3-contributor", timeoutMs: 120_000 }).complete({
      system:
        "You write short catalogue entries for small group tools in a cache, so a lookup can find the right tool for a new request. Plain words, no hype, no jokes. Lowercase keywords of one or two words that a person asking for this tool might use (and the tool's kind of job). Reply with JSON only.",
      messages: [
        {
          role: "user",
          content: `Request that produced the tool: "${a.ask}"\nKind: ${a.kind}\n\nThe tool's source:\n${source.slice(0, 16000)}\n\nWrite: sentence (what it does, one plain sentence, no names of people), use_when (2 to 4 short situations), dont_use_when (2 to 3 situations that need a different tool), keywords (8 to 14), members_min and members_max (how many people the tool really works for; for example a two player board game is 2 and 2, a poll is 2 and 12).`,
        },
      ],
      json: { name: "describe", schema: DESCRIBE },
      effort: "low",
    });
    const d = JSON.parse(reply) as { sentence: string; use_when: string[]; dont_use_when: string[]; keywords: string[]; members_min: number; members_max: number };
    return { sentence: d.sentence.trim(), use_when: d.use_when.slice(0, 5), dont_use_when: d.dont_use_when.slice(0, 4), keywords: [...new Set(d.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))].slice(0, 16), min: Math.max(1, d.members_min), max: Math.max(d.members_min, d.members_max) };
  } catch {
    return fallback;
  }
}

async function admitInner(a: AskInfo, source: string, report: Report | null, run: { model: string; seconds: number; attempts: number }, root?: string): Promise<Admission> {
  const reasons = gateReasons(report);
  if (reasons.length) return { status: "rejected", reasons };
  const look = await secondLook(source, { game: a.family === "game", members: a.members });
  if (!look.ok) return { status: "rejected", reasons: look.reasons, look };
  // Visual sameness against what is already cached for a different kind of ask.
  const index = readIndex(root);
  for (const e of index.entries) {
    if (e.kind !== a.kind && e.id !== a.id && distance(e.hash, look.restHash) <= SAME_LOOK_BITS) {
      return { status: "rejected", reasons: [{ rule: "same-look", message: `looks almost identical to ${e.id} (${e.kind}), ${distance(e.hash, look.restHash)} bits apart` }], look };
    }
  }
  const [d, params] = await Promise.all([describe(a, source), Promise.resolve(extractParams(source, a.chat, a.members, a.kind))]);
  const meta: Meta = {
    id: a.id,
    ask: a.ask,
    kind: a.kind,
    family: a.family,
    surface: a.surface,
    sentence: d.sentence,
    use_when: d.use_when,
    dont_use_when: d.dont_use_when,
    keywords: d.keywords,
    members: { min: d.min, max: d.max, original: a.members.length },
    mutation_score: report!.mutation!.score,
    height: look.height,
    params: { names: params.names, options: params.options, blanks: params.blanks, numbers: params.numbers },
    fact_bound: params.factBound,
    origin: { title: a.chat.title ?? "", members: a.members.map((m) => m.name), text: a.chat.messages.map((m) => m.text).join("\n") },
    model: run.model,
    seconds: run.seconds,
    attempts: run.attempts,
    created: new Date().toISOString(),
    second_look: { endStep: look.endStep, endReason: look.endReason, controls: look.controls, restHash: look.restHash, playedHash: look.playedHash },
  };
  writeEntry(meta, { source, compiled: compileApp(source).code, gate: report, restPng: look.restPng!, playedPng: look.playedPng! }, root);
  rebuildIndex(root);
  return { status: "cached", reasons: [], look, meta };
}

let lock: Promise<unknown> = Promise.resolve();
/** Admissions run one at a time: they share one browser page and compare against what is already cached. */
export function admit(a: AskInfo, source: string, report: Report | null, run: { model: string; seconds: number; attempts: number }, root?: string): Promise<Admission> {
  const r = lock.then(() => admitInner(a, source, report, run, root));
  lock = r.catch(() => {});
  return r;
}
