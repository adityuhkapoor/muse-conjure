// generate(request, model): understand -> retrieve -> route (reuse / adapt / build) -> plan ->
// draft N candidates -> gate -> repair (2 tries at most) -> pick the best passing candidate.

import { coerce, fill, labPiece, piece as getPiece, type Piece } from "@muse/library";
import { verify, type Report } from "@muse/verify";
import { adaptUser, draftUser, type Facts, planUser, repairUser, routeSystem, routeUser, systemPrompt } from "./prompts.ts";
import { fastLabs, labChoices } from "./lab.ts";
import { fillNet, fillSpec, judge, netOn } from "./fillnet.ts";
import { fillLab, logChosen, route as routeLab, routerChoices, routerModelFor, type Decision, shaped } from "./router.ts";
import { retrieve } from "./retrieve.ts";
import { groundOf, honestStart, problems, strip, type Problem } from "./ground.ts";

/** Muse's lines when it makes no Mini for a reason of its own (the router's replies carry theirs). One per reason code. */
export const OFFLINE = "Muse needs a connection to make this"; // needs_model
export const NEEDS_MODEL = "I can only add, remove or rename options right now. Ask again when I'm back online"; // needs_model (a change)
export const MODEL_DOWN ="Muse couldn't reach its model just now. Try again in a moment"; // failed
import type { CompleteRequest, GenerateRequest, GenerateResult, ModelClient, Path, ProgressEvent, ReplyCode } from "./types.ts";

export type GenerateOptions = {
  /** Parallel candidates for adapt and build (1 to 4). */
  candidates?: number;
  /** Repair tries per candidate (0 to 2). */
  maxRepairs?: number;
  onEvent?: (e: ProgressEvent) => void;
  /** Skip the route call and take this path (eval and tests). */
  forcePath?: { path: Path; piece?: string; change?: string };
  /** A lab tool the shell asked for by id with nothing to fill it: the router's only pick (no router: the empty skeleton). */
  onlyPick?: string;
  /** The router model (a fast one); null turns it off. Default: the fast model of the main model's provider, none for replay. */
  router?: ModelClient | null;
  /** The model-free keyword lane before the route (default on; tests of the build loop turn it off). */
  fastLane?: boolean;
  /** Stop where a new tool would be written (eval: route, fill and grounding only). */
  noBuild?: boolean;
  /** Lab ids of the chat's Minis in its last 30 messages: picking one again means the ask is a change to it. */
  recentPieces?: string[];
  /** The gate; injectable for tests. */
  gate?: (source: string) => Promise<Report>;
  /** The check for a fill of an already-approved library tool: params shape and a render, no fuzzing. Default: the gate. */
  libraryGate?: (source: string) => Promise<Report>;
};

const ROUTE_SCHEMA = {
  type: "object",
  properties: {
    people: { type: "array", items: { type: "string" } },
    content: { type: "array", items: { type: "string" } },
    job: { type: "string" },
    path: { type: "string", enum: ["reuse", "adapt", "build"] },
    piece: { type: "string" },
    why: { type: "string" },
    params_json: { type: "string" },
    change: { type: "string" },
  },
  required: ["people", "content", "job", "path", "piece", "why", "params_json", "change"],
  additionalProperties: false,
};

const str = { type: "string" };
const strs = { type: "array", items: str };
const obj = (props: Record<string, unknown>) => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false });
const PLAN_SCHEMA = obj({
  name: str,
  title: str,
  job: str,
  content: strs,
  state: { type: "array", items: obj({ name: str, type: str, meaning: str }) },
  actions: { type: "array", items: obj({ t: str, fields: str, who: str, effect: str, noop_when: str }) },
  invariants: strs,
  transitions: strs,
  at_rest: str,
  random: str,
});

export type Route = { people: string[]; content: string[]; job: string; path: Path; piece: string; why: string; params_json: string; change: string };

/** Pull the module out of a model reply: the longest ```tsx block, else the whole reply. */
export function extractCode(reply: string): string {
  const blocks = [...reply.matchAll(/```(?:tsx|typescript|ts|jsx)?[ \t]*\n([\s\S]*?)```/g)].map((m) => m[1]!);
  const code = blocks.sort((a, b) => b.length - a.length)[0] ?? reply;
  return code.trim() + "\n";
}

export function appName(source: string): string {
  // A filled library piece: its title parameter is what people called it in the chat.
  const params = /\/\/ @params\n([\s\S]*?)\/\/ @end params/.exec(source)?.[1];
  const title = params && /"title":\s*"((?:[^"\\]|\\.){1,60})"/.exec(params)?.[1];
  if (title) return JSON.parse(`"${title}"`) as string;
  return /defineApp\b[^(]*\(\s*\{[\s\S]{0,200}?\bname:\s*"([^"]{1,40})"/.exec(source)?.[1] ?? /\bname:\s*"([^"]{1,40})"/.exec(source)?.[1] ?? "App";
}

const now = () => performance.now();
const secs = (ms: number) => Math.round(ms) / 1000;

function parseJson<T>(text: string): T {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(t) as T;
}

type Candidate = { source: string; report: Report; attempts: number; ok: boolean };

export async function generate(req: GenerateRequest, model: ModelClient, opts: GenerateOptions = {}): Promise<GenerateResult> {
  const emit = opts.onEvent ?? (() => {});
  const gateOnce = opts.gate ?? ((s: string) => verify(s));
  // the gate itself failing (a browser that died) is not the model's fault: once more, not a repair
  const gate = async (s: string) => {
    const r = await gateOnce(s);
    return !r.ok && r.failures.some((f) => f.rule === "gate-error") ? gateOnce(s) : r;
  };
  const timings: Record<string, number> = {};
  const t0 = now();
  const call = async (label: string, r: Omit<CompleteRequest, "label">, nonce = 0) => {
    const s = now();
    try {
      return await model.complete({ ...r, label, ...(nonce ? { nonce } : {}) } as CompleteRequest);
    } finally {
      timings[label] = secs((timings[label] ?? 0) * 1000 + now() - s);
    }
  };
  const failed = (path: Path, pieceId: string | null, error: string, extra: Partial<GenerateResult> = {}): GenerateResult => {
    // offline (replay with nothing recorded for this ask): say so, never show something made up
    if (model.id === "replay") return replied(OFFLINE, error, "needs_model");
    emit({ t: "failed", message: error });
    timings.total = secs(now() - t0);
    return { ok: false, source: "", report: null, attempts: 0, timings, from: { path, piece: pieceId, model: model.id, cached: false }, error, ...extra };
  };

  // 1. Understand and route.
  emit({ t: "understanding" });
  const replied = (text: string, why: string, code: ReplyCode, chip?: { id: string; name: string }): GenerateResult => {
    emit({ t: "ready", name: "", summary: text });
    timings.total = secs(now() - t0);
    return { ok: false, source: "", report: null, attempts: 0, timings, from: { path: "reuse", piece: null, model: model.id, cached: false }, error: `reply: ${why}`, reply: text, exit: why, code, ...(chip ? { chip } : {}) };
  };

  // 1a. Lab tools before any code: the keyword lane (a tool filled entirely from the chat's own
  // words, no model), then the router over the whole lab catalog. A tool is only ever shown filled
  // from this chat: never from its example. A model fill is checked (ground.ts: people, amounts,
  // places, dates, the example's leftovers; then the gate), repaired once with the reasons named,
  // and then the router's next pick is tried. When nothing passes, Muse answers in one line.
  type Tried = { result: GenerateResult } | { errors: string[]; params: Record<string, unknown>; ps: Problem[]; gateOk: boolean };
  const tryLab = async (lab: Piece, raw: Record<string, unknown>, why: string, job: string, o: { trusted?: boolean; suggested?: string[]; attempt?: number } = {}): Promise<Tried> => {
    // the same Mini as one already in the chat: this ask is a change to that one, never a second copy
    if (opts.recentPieces?.includes(lab.id)) {
      logChosen(req.ask, lab.id, "same Mini as one in the chat: a change instead");
      // offline nothing can change code: the offline line, never a duplicate
      if (model.id === "replay") return { result: replied(NEEDS_MODEL, "same Mini as one in the chat, offline", "needs_model") };
      return { result: { ...replied(`Changing the ${lab.name.toLowerCase()} Mini instead of making a second one`, "same Mini as one in the chat", "change"), from: { path: "reuse", piece: lab.id, model: model.id, cached: false } } };
    }
    // a live answer starts at the true state; the keyword lane's fill is the chat's own words already
    const params = o.trusted ? raw : honestStart(lab.id, raw, req);
    const ps = o.trusted ? [] : problems(lab.id, params, groundOf(req, o.suggested));
    markSuggested(params, o.suggested ?? [], lab.id);
    emit({ t: "routed", path: "reuse", piece: lab.id, why, name: lab.name });
    emit({ t: "checking", candidate: 0, attempt: o.attempt ?? 0 });
    const source = fill(lab, params);
    const s = now();
    const report = await (opts.libraryGate ?? gate)(source);
    timings.gate = secs((timings.gate ?? 0) * 1000 + now() - s);
    const errors = [...new Set(ps.map((p) => p.why))];
    // an approved library Mini a few pixels over the height budget at rest is the Mini's own size, not
    // this fill's fault: it is shown (and logged) rather than turned down
    const sizeOnly = !report.ok && report.failures.length > 0 && report.failures.every((f) => f.rule === "too-tall");
    if (sizeOnly) console.warn(`factory: ${lab.id} is over its height budget (${report.failures[0]?.message?.slice(0, 80) ?? ""}); shown anyway`);
    if (!report.ok && !sizeOnly) errors.push(`the tool did not pass its check (${report.stage}: ${report.failures[0]?.rule ?? ""} ${report.failures[0]?.message ?? ""})`.slice(0, 300));
    if (!errors.length) return { result: done({ source, report, attempts: 0, ok: true }, "reuse", lab.id, [], { people: [], content: [], job }, undefined, o.suggested) };
    console.warn(`factory: ${lab.id} turned down: ${errors.slice(0, 3).join("; ").slice(0, 300)}`);
    return { errors, params, ps, gateOk: report.ok || sizeOnly };
  };
  if (!opts.forcePath && opts.fastLane !== false) {
    for (const f of opts.onlyPick ? [] : fastLabs(req)) {
      const r = await tryLab(f.lab, f.params, f.why, "Spun from the chat", { trusted: true });
      if ("result" in r) return r.result;
    }
    const router = opts.router === undefined ? routerModelFor(model) : opts.router;
    if (router || opts.onlyPick) {
      // routing on the fast model, filling on the main one (contributor Spark under Muse)
      const filler = router ? (model.id === "replay" ? router : model) : null;
      // the fast model fills first with a safety net (fillnet.ts); routing then does not fill
      const net = !opts.onlyPick && !!router && netOn(router, model);
      const s = now();
      const d: Decision =
        opts.onlyPick || !router
          ? { picks: [{ id: opts.onlyPick ?? "", reason: "Spun from the chat" }], nothingFits: false, wantsNew: false, reply: "", confidence: 1, params: filler ? null : {}, suggested: [], ms: 0, cached: false, model: model.id }
          : await routeLab(req, router, { filler: filler!, fill: !net });
      timings.router = secs(now() - s);
      // The ladder (router.ts): a Mini is the default. A reply needs a named reason.
      if (d.outcome && d.outcome !== "mini" && d.outcome !== "new_mini") {
        logChosen(req.ask, null, `reply: ${d.outcome}`);
        const chip = d.chip ? labPiece(d.chip) : null;
        return replied(d.reply, `router: ${d.outcome}`, d.outcome, chip ? { id: chip.id, name: chip.name } : undefined);
      }
      // the router call itself failed (no outcome, no picks): say so; never a menu
      if (!d.outcome && !d.picks.length && !opts.onlyPick && router) {
        logChosen(req.ask, null, "router call failed");
        return replied(MODEL_DOWN, "router call failed", "failed");
      }
      if (d.wantsNew) opts = { ...opts, forcePath: { path: "build" } };
      let buildExit = "build";
      for (const c of routerChoices(d)) {
        let last: Record<string, unknown> | null = null;
        let netStep = 0;
        // the router's own fill (one call) is taken when it holds up; otherwise the fill goes on as if it had not filled
        const inline = c.params && (!net || judge(req, c.id, { params: shaped(c.id, c.params), suggested: d.suggested }, d.hasContent === true).ok) ? { params: c.params, suggested: d.suggested } : null;
        const first = inline
          ? inline
          : net
            ? await (async () => {
                const n = await fillNet(req, c.id, { fast: router!, main: model }, { expectContent: d.hasContent === true });
                netStep = n.step;
                if (n.step) console.log(`factory: fill ${c.id}: ${n.tried.join(" > ")}`);
                return n.fill;
              })()
            : filler
              ? await fillLab(req, c.id, filler)
              : null;
        if (first) {
          const firstParams = shaped(c.id, first.params);
          let r = await tryLab(c.lab, firstParams, c.why, c.why, { suggested: first.suggested });
          if ("result" in r) {
            logChosen(req.ask, c.id, c.why);
            return r.result;
          }
          last = strip(r.params, r.ps);
          // one repair, with the reasons named
          // (the net has already tried the main model once: a fill it could not mend goes straight to stripping)
          const again =
            filler && !(net && netStep === 3)
              ? net
                ? (await fillNet(req, c.id, { fast: router!, main: model }, { expectContent: d.hasContent === true, repair: { params: r.params, errors: r.errors } })).fill
                : await fillLab(req, c.id, filler, { params: r.params, errors: r.errors })
              : null;
          if (again) {
            r = await tryLab(c.lab, shaped(c.id, again.params), c.why, c.why, { suggested: again.suggested, attempt: 1 });
            if ("result" in r) {
              logChosen(req.ask, c.id, `${c.why} (repaired)`);
              return r.result;
            }
            last = strip(r.params, r.ps);
          }
          // the same Mini with only what is from this chat: the rest starts empty and the Mini collects it
          if (r.ps.length && r.gateOk) {
            const rest = await tryLab(c.lab, last, c.why, c.why, { suggested: again?.suggested ?? first.suggested, attempt: 2 });
            if ("result" in rest) {
              logChosen(req.ask, c.id, `${c.why} (${r.ps.length} parts not from the chat taken out)`);
              return rest.result;
            }
          }
        }
        // the Mini's empty skeleton (a title from the chat at most): an honest empty state, never a refusal
        const skel = skeleton(c.id, last);
        const empty = await tryLab(c.lab, skel, c.why, c.why, { attempt: 3 });
        if ("result" in empty) {
          logChosen(req.ask, c.id, `${c.why} (empty start)`);
          return empty.result;
        }
      }
      if (d.picks.length) {
        // no pick held up even empty: make a new one rather than refuse
        logChosen(req.ask, null, "no pick held up even empty: a new Mini");
        opts = { ...opts, forcePath: { path: "build" } };
        buildExit = "build after picks failed";
      }
      if (opts.noBuild && opts.forcePath?.path === "build") {
        timings.total = secs(now() - t0);
        return { ok: false, source: "", report: null, attempts: 0, timings, from: { path: "build", piece: null, model: model.id, cached: false }, error: "new: build requested", exit: buildExit };
      }
    }
  }
  if (opts.noBuild) {
    timings.total = secs(now() - t0);
    return { ok: false, source: "", report: null, attempts: 0, timings, from: { path: "build", piece: null, model: model.id, cached: false }, error: "new: build requested", exit: "build" };
  }
  const ranked = retrieve(req).map((s) => s.piece);
  let route: Route;
  try {
    const reply = await call("route", { system: routeSystem(ranked), messages: [{ role: "user", content: routeUser(req) }], json: { name: "route", schema: ROUTE_SCHEMA }, effort: "low" });
    route = parseJson<Route>(reply);
  } catch (e) {
    return failed("build", null, `could not understand the ask: ${(e as Error).message}`);
  }
  if (opts.forcePath) {
    route = { ...route, path: opts.forcePath.path, piece: opts.forcePath.piece ?? route.piece, change: opts.forcePath.change ?? route.change };
  }
  let base: Piece | undefined = route.piece ? getPiece(route.piece) : undefined;
  if (route.path !== "build" && !base) route = { ...route, path: "build", piece: "" };
  const facts: Facts = { people: route.people ?? [], content: route.content ?? [], job: route.job ?? req.ask };
  emit({ t: "routed", path: route.path, piece: base?.id ?? null, why: route.why });

  let params: unknown = {};
  try {
    params = JSON.parse(route.params_json || "{}");
  } catch {
    params = {};
  }
  const filled = base ? fill(base, coerce(base.params, params, emptyLike(base))) : "";

  // 2. Reuse: no code generation, straight to the gate. Reuse hands out lab tools only, filled
  // from the chat by the supersede table's adapters and checked like any live fill. The piece is never shown.
  if (route.path === "reuse" && base) {
    for (const lab of labChoices(base.id, coerce(base.params, params, emptyLike(base)), req)) {
      const r = await tryLab(lab.lab, lab.params, `${lab.lab.name} in place of ${base.id}`, facts.job);
      if ("result" in r) return r.result;
    }
    // No lab tool passed: adapt the piece like any other app (a model writes it; the plain piece is not shown).
    route = { ...route, path: "adapt", change: route.change || "Keep the behavior; only fix the failure." };
  }

  // 3. Plan.
  const system = systemPrompt();
  let plan: unknown;
  try {
    const reply = await call("plan", {
      system,
      messages: [{ role: "user", content: planUser(req, facts, route.path === "adapt" && base ? { piece: base, change: route.change } : undefined) }],
      json: { name: "plan", schema: PLAN_SCHEMA },
      effort: "low",
    });
    plan = parseJson(reply);
  } catch (e) {
    return failed(route.path, base?.id ?? null, `planning failed: ${(e as Error).message}`);
  }

  // 4. Draft N candidates, each with its own gate and repair loop.
  const n = Math.max(1, Math.min(4, opts.candidates ?? 1));
  const maxRepairs = Math.max(0, Math.min(2, opts.maxRepairs ?? 2));
  const reference = route.path === "build" ? (ranked[0] ?? null) : null;
  const firstUser =
    route.path === "adapt" && base ? adaptUser(req, facts, plan, base, filled, route.change || route.job) : draftUser(req, facts, plan, reference);

  const runCandidate = async (k: number): Promise<Candidate> => {
    emit({ t: "drafting", candidate: k });
    let source = extractCode(await call(`draft`, { system, messages: [{ role: "user", content: firstUser }] }, k));
    let attempts = 1;
    for (;;) {
      emit({ t: "checking", candidate: k, attempt: attempts });
      const s = now();
      const report = await gate(source);
      timings.gate = secs((timings.gate ?? 0) * 1000 + now() - s);
      if (report.ok || attempts > maxRepairs) return { source, report, attempts, ok: report.ok };
      const f = report.failures[0] ?? { rule: report.stage, message: "failed" };
      emit({ t: "repairing", candidate: k, attempt: attempts, rule: f.rule, message: f.message });
      source = extractCode(await call(`repair`, { system, messages: [{ role: "user", content: repairUser(source, report.stage, f) }] }, k * 10 + attempts));
      attempts++;
    }
  };

  const settled = await Promise.allSettled(Array.from({ length: n }, (_, k) => runCandidate(k)));
  const cands = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const errors = settled.flatMap((r) => (r.status === "rejected" ? [String((r.reason as Error)?.message ?? r.reason)] : []));
  const summary = cands.map((c) => ({ attempts: c.attempts, ok: c.ok, stage: c.report.stage, score: c.report.mutation?.score ?? null, lines: c.source.split("\n").length }));
  const best = pickBest(cands);
  if (!best || !best.ok) {
    const last = best ?? cands[0];
    const why = last ? `${last.report.stage}: ${last.report.failures[0]?.rule ?? ""} ${last.report.failures[0]?.message ?? ""}`.trim() : errors[0] ?? "no candidate";
    return failed(route.path, base?.id ?? null, `no candidate passed the gate (${why})`, {
      source: last?.source ?? "",
      report: last?.report ?? null,
      attempts: last?.attempts ?? 0,
      candidates: summary,
    });
  }
  return done(best, route.path, base?.id ?? null, summary, facts, plan);

  function done(c: Candidate, path: Path, pieceId: string | null, candidates: GenerateResult["candidates"], f: Facts, p?: unknown, suggested?: string[]): GenerateResult {
    timings.total = secs(now() - t0);
    const name = appName(c.source);
    const summaryLine = ((p as { title?: string } | undefined)?.title ?? f.job).trim();
    emit({ t: "ready", name, summary: summaryLine });
    return {
      ok: true,
      source: c.source,
      report: c.report,
      attempts: c.attempts,
      timings,
      from: { path, piece: pieceId, model: model.id, cached: false },
      name,
      summary: summaryLine,
      ...(suggested?.length ? { suggested } : {}),
      candidates: candidates?.length ? candidates : [{ attempts: c.attempts, ok: true, stage: "done", score: c.report.mutation?.score ?? null, lines: c.source.split("\n").length }],
    };
  }
}

/** Best passing candidate: highest mutation score, then smallest source. Falls back to the first. */
export function pickBest<T extends { ok: boolean; source: string; report: Report }>(cands: T[]): T | undefined {
  const passing = cands.filter((c) => c.ok);
  if (!passing.length) return cands[0];
  return passing.sort((a, b) => (b.report.mutation?.score ?? 0) - (a.report.mutation?.score ?? 0) || a.source.length - b.source.length)[0];
}

/**
 * Options Muse proposed (not from the chat) are said to be Muse's, inside the Mini. A Mini with a
 * per-item `suggested` flag (trip plans, bring-list items) gets it on each such item, and its
 * subtitle says "Muse suggested these. Change any" only when every item is suggested. Any other
 * Mini says it in its subtitle when it has one. Never attributed to a person; a Mini with neither
 * shows them unmarked.
 */
const PER_ITEM: Record<string, string> = { "trip-draft": "plans", "bring-list": "items" };
export function markSuggested(params: Record<string, unknown>, suggested: string[], id = "") {
  const flat = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const sug = new Set(suggested.map(flat).filter(Boolean));
  const key = ["why", "sub", "subtitle", "tagline", "note"].find((k) => typeof params[k] === "string");
  const list = PER_ITEM[id] ? params[PER_ITEM[id]!] : undefined;
  if (Array.isArray(list)) {
    const items = list.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
    for (const it of items) {
      const name = typeof it.label === "string" ? it.label : "";
      if (name && sug.has(flat(name))) it.suggested = true;
    }
    const all = items.length > 0 && items.every((it) => it.suggested === true);
    if (key) {
      const was = String(params[key]).trim().replace(/\s*·?\s*Muse suggested (these|some)\. Change any$/, "");
      params[key] = all ? (was ? `${was} · Muse suggested these. Change any` : "Muse suggested these. Change any") : was;
    }
    return;
  }
  if (!sug.size) return;
  let used = false;
  const walk = (v: unknown): void => {
    if (typeof v === "string") used ||= sug.has(flat(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(params);
  if (!used || !key) return;
  const was = String(params[key]).trim();
  params[key] = was ? `${was} · Muse suggested some. Change any` : "Muse suggested these. Change any";
}

/** A lab Mini's empty start: its shape with nothing in it, keeping only a title that held up. */
function skeleton(id: string, grounded: Record<string, unknown> | null): Record<string, unknown> {
  const title = grounded && typeof grounded.title === "string" ? grounded.title : "";
  return shaped(id, title ? { title } : {});
}

/** Fallback params when the model gave none: empty content, never the piece's sample content. */
function emptyLike(p: Piece): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p.defaults)) out[k] = Array.isArray(v) ? [] : v;
  return out;
}
