// Change a tool that is already in a chat, by what someone asked ("muse add thai", "make it out
// of 5", "make it a bracket instead", "add a countdown to 8pm"). One fast call decides how:
//
//   params   new params over the current ones (same code); state for items that still exist is
//            kept: same room when every kept item keeps its id, else a new room with the old
//            log replayed and item ids remapped (matched by id, else by label)
//   swap     a different lab tool, picked by the router and filled from the current tool's
//            content and the chat; state starts over in a new room
//   code     the main model edits a copy of the tool's source; it passes the gate (one retry with
//            the failure fed back) and runs in the same room, so state survives where shapes match
//   cant     one honest line; the tool stays as it was
//   new      (only when the ask did not point at the tool) not about this tool: build a new one
//
// Offline (replay), only add, remove and rename of options are understood, by pattern.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fill, LAB_DIR, labPiece, paramsBlock } from "@muse/library";
import { compileModule } from "../../verify/src/compile.ts";
import { loadApp } from "../../verify/src/sandbox.ts";
import type { Report } from "@muse/verify";
import { repairAll } from "./compose.ts";
import { applyEdits, EDIT_INSTRUCTIONS } from "./edits.ts";
import { appName, extractCode, NEEDS_MODEL } from "./generate.ts";
import { miniName } from "../../protocol/src/mini-name.ts";
import { groundOf, honestStart, problems } from "./ground.ts";
import { apiText } from "./prompts.ts";
import { mayBeChange } from "./change-gate.ts";
import { catalog, fillLab, pickLab, route, shaped } from "./router.ts";
import type { Effort, GenerateRequest, Member, ModelClient, ReplyCode } from "./types.ts";

export type LogEntry = { user: string; action: unknown };
export type ChangeRequest = {
  ask: string;
  chat: GenerateRequest["chat"];
  members: Member[];
  /** true when the person pointed at the tool ("Tell Muse what to change"); false for a plain "muse ..." */
  explicit: boolean;
  tool: { name: string; source: string; piece: string | null };
  log: LogEntry[];
  /** the asker's offset from UTC in minutes (east positive): clock times in the ask are in it */
  tz?: number;
};
export type Tier = "params" | "swap" | "code";
export type ChangeResult =
  | { t: "done"; tier: Tier; source: string; name: string; summary: string; note: string; room: "same" | "new"; replay?: LogEntry[]; piece: string | null; ms: number }
  | { t: "reply"; text: string; /** why there was no change (types.ts ReplyCode) */ code?: ReplyCode; ms: number }
  | { t: "new"; ms: number };
export type ChangeEvent = { t: "decided"; tier: Tier | "cant" | "new"; why: string } | { t: "checking"; attempt: number } | { t: "editing"; attempt: number };

export { NEEDS_MODEL };
export const CANT_CHANGE = "I couldn't get that change to work. The Mini is as it was";
export const CHANGE_DOWN = "Muse couldn't reach its model just now. The Mini is as it was";

const START = "// @params\n";
const END = "// @end params";

// --- reading a tool -----------------------------------------------------------------------------

/** The current params of a tool's source (its @params block), or null when it has none. */
export function paramsOf(source: string): Record<string, unknown> | null {
  try {
    const body = paramsBlock(source).replace(/^const P(?::\s*Params)?\s*=\s*/, "return ").trim();
    const v = new Function(body)() as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : null;
  } catch {
    return null;
  }
}

/** The source with its @params block replaced. No other code changes. */
export function withParams(source: string, params: Record<string, unknown>): string {
  const a = source.indexOf(START) + START.length;
  const b = source.indexOf(END);
  if (a < START.length || b < a) throw new Error("tool has no // @params block");
  return `${source.slice(0, a)}const P: Params = ${JSON.stringify(params, null, 2)};\n${source.slice(b)}`;
}

/** `type Params = ...` as written in the source, for the model. */
function paramsType(source: string): string {
  const i = source.indexOf("type Params");
  const j = source.indexOf(START);
  return i >= 0 && j > i ? source.slice(i, j).trim().slice(0, 2500) : "";
}

function labSchema(piece: string | null): string {
  if (!piece || !/^[a-z0-9-]+$/.test(piece)) return "";
  try {
    const m = JSON.parse(readFileSync(join(LAB_DIR, piece, "meta.json"), "utf8")) as { params?: unknown };
    return m.params ? JSON.stringify(m.params).slice(0, 3000) : "";
  } catch {
    return "";
  }
}

type Folded = { state: unknown; summary: string; members: Member[] };

/** Fold a log through a tool's source the way the runtime does (docs/CONTRACTS.md section 3). */
export function fold(source: string, log: LogEntry[], room = "a:change"): Folded {
  const c = compileModule(source);
  if (!c.ok) throw new Error(`does not compile: ${c.message}`);
  const { app, toRealm } = loadApp(c.js);
  const out = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  let members: Member[] = [];
  const ctx = () => toRealm({ room, members });
  let s = out(app.init(ctx()));
  let started = false;
  let seq = 0;
  for (const e of log) {
    seq++;
    const a = e.action as { t?: unknown; members?: unknown } | null;
    if (!a || typeof a !== "object" || typeof a.t !== "string") continue;
    if (a.t === "@members") {
      if (!Array.isArray(a.members)) continue;
      members = (a.members as Member[]).map((m) => ({ id: String(m.id), name: String(m.name) }));
      try {
        s = out(started ? (app.onMembers ? app.onMembers(toRealm(s), ctx()) : s) : app.init(ctx()));
      } catch {}
      continue;
    }
    if (a.t.startsWith("@")) continue;
    try {
      const next = out(app.reduce(toRealm(s), toRealm(a), toRealm({ seq, user: e.user, time: seq * 1000, seed: seq }), ctx()));
      if (JSON.stringify(next) !== JSON.stringify(s)) started = true;
      s = next;
    } catch {}
  }
  let summary = "";
  try {
    summary = String(app.summary?.(toRealm(s), ctx()) ?? "");
  } catch {}
  return { state: s, summary, members };
}

// --- keeping state across a params change -------------------------------------------------------

type Item = { id: string; label: string };
const LABEL_KEYS = ["name", "label", "title", "text", "option", "place", "item", "what"];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Every list of `{ id, ... }` objects in a state, by its path. */
function itemLists(v: unknown, path = "", out = new Map<string, Item[]>()): Map<string, Item[]> {
  if (Array.isArray(v)) {
    if (v.length && v.every((x) => x && typeof x === "object" && !Array.isArray(x) && typeof (x as { id?: unknown }).id === "string")) {
      out.set(
        path,
        v.map((x) => {
          const o = x as Record<string, unknown>;
          const key = LABEL_KEYS.find((k) => typeof o[k] === "string" && o[k]);
          return { id: String(o.id), label: key ? norm(String(o[key])) : "" };
        }),
      );
    }
    v.forEach((x, i) => itemLists(x, `${path}[${i}]`, out));
  } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) itemLists(x, `${path}.${k}`, out);
  return out;
}

/**
 * How old item ids map to new ones: by label first, else the same id when that id's new label is not
 * another old item's. null = the item was removed.
 */
export function idMap(oldState: unknown, newState: unknown): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const before = itemLists(oldState);
  const after = itemLists(newState);
  for (const [path, olds] of before) {
    const news = after.get(path);
    if (!news) continue;
    const taken = new Set<string>();
    const oldLabels = new Set(olds.map((o) => o.label).filter(Boolean));
    for (const o of olds) {
      const byLabel = o.label ? news.find((n) => n.label === o.label && !taken.has(n.id)) : undefined;
      const sameId = news.find((n) => n.id === o.id && !taken.has(n.id) && (!n.label || !oldLabels.has(n.label) || n.label === o.label));
      const hit = byLabel ?? sameId;
      if (hit) taken.add(hit.id);
      if (!map.has(o.id)) map.set(o.id, hit ? hit.id : null);
    }
  }
  return map;
}

/** Rewrite every id in an action through the map; null when the action points at a removed item. */
function remap(action: unknown, map: Map<string, string | null>): unknown | null {
  let dropped = false;
  const walk = (v: unknown, key: string): unknown => {
    if (typeof v === "string" && key !== "t" && map.has(v)) {
      const to = map.get(v)!;
      if (to === null) dropped = true;
      return to ?? v;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  const out = walk(action, "");
  return dropped ? null : out;
}

/**
 * Same room when every kept item keeps its id and no removed item's id is reused; otherwise a new
 * room with the log replayed through the id map (actions on removed items left out).
 */
export function roomPlan(oldSource: string, newSource: string, log: LogEntry[]): { room: "same" | "new"; replay?: LogEntry[]; kept: number; dropped: number } {
  const members = [...log].reverse().find((e) => (e.action as { t?: string })?.t === "@members");
  const start = members ? [members] : [];
  const map = idMap(fold(oldSource, start).state, fold(newSource, start).state);
  const newIds = new Set([...itemLists(fold(newSource, start).state).values()].flatMap((l) => l.map((x) => x.id)));
  const same = [...map].every(([from, to]) => (to === null ? !newIds.has(from) : to === from));
  const acts = log.filter((e) => !String((e.action as { t?: string })?.t ?? "").startsWith("@"));
  if (same) {
    const dropped = acts.filter((e) => remap(e.action, map) === null).length;
    return { room: "same", kept: acts.length - dropped, dropped };
  }
  const replay: LogEntry[] = [...start];
  let dropped = 0;
  for (const e of acts) {
    const a = remap(e.action, map);
    if (a === null) dropped++;
    else replay.push({ user: e.user, action: a });
  }
  return { room: "new", replay, kept: replay.length - start.length, dropped };
}

// --- the decision -------------------------------------------------------------------------------

const DECIDE_SCHEMA = {
  type: "object",
  properties: {
    tier: { type: "string", enum: ["params", "swap", "code", "cant", "new"] },
    params_json: { type: "string" },
    note: { type: "string" },
    reply: { type: "string" },
    why: { type: "string" },
  },
  required: ["tier", "params_json", "note", "reply", "why"],
  additionalProperties: false,
};

function decideSystem(explicit: boolean): string {
  return [
    "A group chat has a small live tool in it that Muse made. Someone asked Muse to change it. Decide how, in one step.",
    "- params: the ask can be met by changing the tool's parameters: add, remove or rename options or items, change the title, a day, a date, a time, an amount, a limit, the people. Put the whole new parameter object in params_json: start from the current params, change only what the ask says, keep existing items in the same order and add new ones at the end. Never add votes, claims, picks or other activity that is not already there. Keep the shape of the current params exactly.",
    "- swap: the ask wants this same content in a different kind of tool and says so (\"make it a bracket instead\", \"turn this into a wheel\", \"can it be a poll\"). Not when the ask is about a different subject than the tool.",
    "- code: the ask needs something no parameter covers and that a small change to this tool's code can add (a countdown, a new field, a new button, a new rule). Not for asks no app could do.",
    "- cant: the tool cannot do this (it needs live data from outside, payments, messages to people, or makes no sense for this tool). Put one short honest line from Muse in reply, saying what it can't do, and nothing else.",
    explicit
      ? "The person pointed at this tool, so the ask is about it. Never answer new."
      : "- new: the message is not a change to this tool; it asks Muse for something about another subject (this tool splits a bill and the ask is to pick a movie: new). The person did not point at the tool, so choose new unless the message plainly refers to this tool: it says it, this, the options, the list, the vote, names the tool or something in it, or asks to add, remove or rename something the tool holds.",
    "note: one short line Muse posts after the change, saying what changed and what was kept, for example \"Added Thai. Votes kept.\" or \"Moved it to Saturday.\" For code, say what was added. For swap, say only what kind of tool it becomes, in plain words (\"Made it a bracket.\"); its votes start over, so never say they were kept. Sentence case, plain words, no exclamation marks, under 80 characters.",
    "why: a few words on why this tier. params_json is \"{}\" unless the tier is params; reply is empty unless the tier is cant.",
  ].join("\n");
}

function decideUser(req: ChangeRequest, params: Record<string, unknown> | null, folded: Folded | null): string {
  const state = folded ? JSON.stringify(folded.state).slice(0, 2500) : "";
  return [
    `Tool: ${req.tool.name}${req.tool.piece ? ` (${req.tool.piece})` : ""}`,
    req.tool.piece && catalog().find((c) => c.id === req.tool.piece) ? `What it is: ${catalog().find((c) => c.id === req.tool.piece)!.summary}` : "",
    `Params type:\n${paramsType(req.tool.source) || "(none)"}`,
    labSchema(req.tool.piece) ? `Params schema: ${labSchema(req.tool.piece)}` : "",
    `Current params: ${params ? JSON.stringify(params) : "(this tool has no params)"}`,
    folded ? `Shared state now: ${folded.summary ? `"${folded.summary}" ` : ""}${state}` : "",
    `Members: ${req.members.map((m) => m.name).join(", ")}`,
    "",
    "Recent chat:",
    ...req.chat.messages.slice(-30).map((m) => `${m.from}: ${m.text}`),
    "",
    `The ask: "${req.ask}"`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/** The Mini's name after a change: the same one name everywhere (the Mini's own title, sentence case; packages/protocol/src/mini-name.ts). */
export function nameOf(source: string, fallback: string): string {
  return miniName(source, fallback).trim().slice(0, 80);
}

const parse = <T>(text: string): T => JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;

// --- offline: add, remove, rename by pattern ----------------------------------------------------

/** The params list that holds the options: the first array of strings, or of objects with a label. */
function optionList(p: Record<string, unknown>): { key: string; labelKey: string | null } | null {
  for (const [k, v] of Object.entries(p)) {
    if (!Array.isArray(v) || !v.length) continue;
    if (v.every((x) => typeof x === "string")) return { key: k, labelKey: null };
    const first = v[0];
    if (first && typeof first === "object") {
      const lk = LABEL_KEYS.find((x) => typeof (first as Record<string, unknown>)[x] === "string");
      if (lk) return { key: k, labelKey: lk };
    }
  }
  return null;
}

const clean = (s: string) => s.replace(/^["'“”]+|["'“”.!?]+$/g, "").replace(/^(the|a|an)\s+/i, "").trim();
const titled = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Offline lane: add, remove or rename one option. Null when the ask is anything else. */
export function offlineChange(params: Record<string, unknown>, ask: string): { params: Record<string, unknown>; note: string } | null {
  const list = optionList(params);
  if (!list) return null;
  const text = ask.replace(/^\s*@?muse\b[\s,:]*/i, "").trim();
  const items = params[list.key] as unknown[];
  const labelOf = (x: unknown) => (list.labelKey ? String((x as Record<string, unknown>)[list.labelKey] ?? "") : String(x));
  const find = (name: string) => items.findIndex((x) => norm(labelOf(x)) === norm(name));
  const blank = (label: string): unknown => {
    if (!list.labelKey) return label;
    const empty = (v: unknown): unknown => (typeof v === "string" ? "" : typeof v === "number" ? 0 : typeof v === "boolean" ? false : Array.isArray(v) ? [] : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, empty(x)])) : v);
    return { ...(empty(items[0]) as Record<string, unknown>), [list.labelKey]: label };
  };
  let m = /^(?:can you\s+|pls\s+|please\s+)?rename\s+(.+?)\s+to\s+(.+)$/i.exec(text);
  if (m) {
    const i = find(clean(m[1]!));
    if (i < 0) return null;
    const label = titled(clean(m[2]!));
    const next = items.map((x, k) => (k !== i ? x : list.labelKey ? { ...(x as object), [list.labelKey]: label } : label));
    return { params: { ...params, [list.key]: next }, note: `Renamed ${labelOf(items[i])} to ${label}. Votes kept.` };
  }
  m = /^(?:can you\s+|pls\s+|please\s+)?(?:remove|drop|delete|take out|take off|get rid of)\s+(.+?)(?:\s+(?:from|off)\s+(?:the\s+)?(?:list|options|it|this))?$/i.exec(text);
  if (m) {
    const i = find(clean(m[1]!));
    if (i < 0) return null;
    return { params: { ...params, [list.key]: items.filter((_, k) => k !== i) }, note: `Took out ${labelOf(items[i])}. Other votes kept.` };
  }
  m = /^(?:can you\s+|pls\s+|please\s+)?(?:add|put|throw in|include)\s+(.+?)(?:\s+(?:to|in|on|into)\s+(?:the\s+)?(?:list|options|it|this|wheel|poll|vote))?$/i.exec(text);
  if (m) {
    const label = titled(clean(m[1]!));
    if (!label || label.split(/\s+/).length > 5 || find(label) >= 0) return null;
    return { params: { ...params, [list.key]: [...items, blank(label)] }, note: `Added ${label}. Votes kept.` };
  }
  return null;
}

// --- the change -----------------------------------------------------------------------------

export type ChangeDeps = {
  /** decides the tier (Ember-class); null offline */
  fast: ModelClient | null;
  /** fills the params, edits code and fills a swapped tool (contributor Spark); null offline */
  main: ModelClient | null;
  gate: (source: string) => Promise<Report>;
  /** The lighter check for a fill of a library tool (params shape and a render). Default: the gate. */
  libraryGate?: (source: string) => Promise<Report>;
  onEvent?: (e: ChangeEvent) => void;
};

const short = (s: string, n = 80) => s.replace(/!/g, ".").replace(/\s+/g, " ").trim().slice(0, n);

export async function change(req: ChangeRequest, deps: ChangeDeps): Promise<ChangeResult> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  const emit = deps.onEvent ?? (() => {});
  const params = paramsOf(req.tool.source);
  let folded: Folded | null = null;
  try {
    folded = fold(req.tool.source, req.log);
  } catch {}

  /** null: did not hold up (try code); "same": nothing a person could see changed; a reply: a question back (an amount nobody gave). */
  const finishParams = async (next: Record<string, unknown>, note: string): Promise<ChangeResult | null | "same"> => {
    const merged = { ...(params ?? {}), ...next };
    const diff = describeDiff(params ?? {}, merged);
    if (!diff.changed) return "same";
    // the change's own numbers and people come from the chat, the ask or the Mini as it was
    const invented = inventedAmount(req, params ?? {}, merged);
    if (invented) return { t: "reply", text: invented, code: "ask", ms: ms() };
    note = diff.note || note;
    const source = withParams(req.tool.source, merged);
    emit({ t: "checking", attempt: 0 });
    const report = await (req.tool.piece ? (deps.libraryGate ?? deps.gate) : deps.gate)(source);
    // a library Mini a few pixels over its height budget is its own size, not this change's fault
    const sizeOnly = !!req.tool.piece && !report.ok && report.failures.length > 0 && report.failures.every((f) => f.rule === "too-tall");
    if (!report.ok && !sizeOnly) {
      console.warn(`change: params failed the gate: ${report.stage} ${report.failures[0]?.rule ?? ""} ${report.failures[0]?.message?.slice(0, 200) ?? ""}`);
      return null;
    }
    const plan = roomPlan(req.tool.source, source, req.log);
    const lost = plan.dropped ? ` ${plan.dropped === 1 ? "One vote" : `${plan.dropped} votes`} on removed options went with them.` : "";
    return { t: "done", tier: "params", source, name: nameOf(source, req.tool.name), summary: folded?.summary ?? "", note: short(note || "Changed it.", 120) + (lost && !/went/.test(note) ? lost : ""), room: plan.room, ...(plan.replay ? { replay: plan.replay } : {}), piece: req.tool.piece, ms: ms() };
  };

  // nothing a person could see changed: say so, and what this Mini can change
  const cantHere = (): ChangeResult => ({ t: "reply", text: cantLine(params), code: "cant_act", ms: ms() });

  // Offline: only the pattern lane.
  if (!deps.fast) {
    const off = params ? offlineChange(params, req.ask) : null;
    if (!off) return req.explicit ? { t: "reply", text: NEEDS_MODEL, code: "needs_model", ms: ms() } : { t: "new", ms: ms() };
    emit({ t: "decided", tier: "params", why: "offline pattern" });
    const r = await finishParams(off.params, off.note);
    return r === "same" ? cantHere() : (r ?? { t: "reply", text: CANT_CHANGE, code: "failed", ms: ms() });
  }

  // a plain ask that plainly does not touch this Mini is a new one: no model call to say so (change-gate.ts)
  if (!req.explicit && !mayBeChange(req.ask, { name: req.tool.name, piece: req.tool.piece }, params, req.members.map((m) => m.name))) {
    emit({ t: "decided", tier: "new", why: "the ask does not touch this Mini" });
    return { t: "new", ms: ms() };
  }

  type D = { tier: Tier | "cant" | "new"; params_json: string; note: string; reply: string; why: string };
  let d: D;
  try {
    d = parse<D>(await deps.fast.complete({ label: "change-decide", system: decideSystem(req.explicit), messages: [{ role: "user", content: decideUser(req, params, folded) }], json: { name: "change", schema: DECIDE_SCHEMA }, effort: "low" }));
  } catch (e) {
    console.warn(`change: decide failed (${(e as Error).message.slice(0, 200)}); offline lane`);
    const off = params ? offlineChange(params, req.ask) : null;
    // a plain typed ask that could not be decided is not a change: it is a new tool
    const unsure = (): ChangeResult => (req.explicit ? { t: "reply", text: CHANGE_DOWN, code: "failed", ms: ms() } : { t: "new", ms: ms() });
    if (!off) return unsure();
    emit({ t: "decided", tier: "params", why: "offline pattern" });
    const r = await finishParams(off.params, off.note);
    return r === "same" ? cantHere() : (r ?? unsure());
  }
  if (d.tier === "new" && req.explicit) d.tier = "cant";
  // a plain "muse ..." this Mini can't do is not a change at all: the router's ladder answers it
  // (an answer, a new Mini, or a refusal with its reason), never "Changing that Mini" then "I can't"
  if (d.tier === "cant" && !req.explicit) d.tier = "new";
  if (d.tier === "params" && !params) d.tier = "code";
  emit({ t: "decided", tier: d.tier, why: d.why });
  console.log(`change: "${req.ask.slice(0, 60)}" -> ${d.tier} (${d.why.slice(0, 80)})`);

  if (d.tier === "new") return { t: "new", ms: ms() };
  if (d.tier === "cant") return { t: "reply", text: short(d.reply || cantLine(params), 160), code: "cant_act", ms: ms() };

  let sameParams = false;
  if (d.tier === "params") {
    let next: Record<string, unknown> | null = null;
    try {
      const v = JSON.parse(d.params_json) as unknown;
      if (v && typeof v === "object" && !Array.isArray(v)) next = v as Record<string, unknown>;
    } catch {}
    // MUSE_CHANGE_PARAMS: "net" (default) takes the fast model's own params from the decision and, when they
    // do not hold up, asks the fast model again at low effort and then the main model at minimal effort;
    // "fast" takes the fast model's params with no second try; "main" has the main model write them (the old way).
    const mode = process.env.MUSE_CHANGE_PARAMS === "fast" ? "fast" : process.env.MUSE_CHANGE_PARAMS === "main" ? "main" : "net";
    const askParams = async (m: ModelClient, effort: Effort, again?: string): Promise<{ next: Record<string, unknown>; note: string } | null> => {
      try {
        const user = decideUser(req, params, folded) + (again ? `\n\nYour last answer ${again}. Answer again with the whole new params.` : "");
        const out = parse<D>(await m.complete({ label: "change-params", system: decideSystem(req.explicit), messages: [{ role: "user", content: user }], json: { name: "change", schema: DECIDE_SCHEMA }, effort }));
        const v = out.tier === "params" ? (JSON.parse(out.params_json) as unknown) : null;
        return v && typeof v === "object" && !Array.isArray(v) ? { next: v as Record<string, unknown>, note: out.note } : null;
      } catch (e) {
        console.warn(`change: params on ${m.id} failed (${(e as Error).message.slice(0, 120)})`);
        return null;
      }
    };
    if (mode === "main" && deps.main && deps.main !== deps.fast) {
      const m = await askParams(deps.main, process.env.MUSE_CHANGE_EFFORT === "medium" ? "medium" : "low");
      if (m) {
        next = m.next;
        d.note = m.note || d.note;
      }
    }
    let r: Awaited<ReturnType<typeof finishParams>> = null;
    if (next) {
      r = await finishParams(next, d.note);
      if (r && r !== "same") return r;
      sameParams = r === "same";
    }
    if (mode === "net") {
      const why = !next ? "was not usable" : r === "same" ? "changed nothing a person could see" : "did not pass its check";
      for (const [m, effort] of [[deps.fast, "low"], [deps.main, "minimal"]] as [ModelClient | null, Effort][]) {
        if (!m) continue;
        const a = await askParams(m, m.id.startsWith("muse") ? effort : "low", why);
        if (!a) continue;
        const rr = await finishParams(a.next, a.note || d.note);
        if (rr && rr !== "same") return rr;
        sameParams ||= rr === "same";
      }
    }
    // params that did not hold up or changed nothing: try the code path, which can still do it
    d.tier = "code";
  }

  if (d.tier === "swap") {
    const r = await swap(req, params, folded, deps, emit, d.note);
    if (r) return { ...r, ms: ms() };
    return { t: "reply", text: "I couldn't find another kind of Mini for that. This one stays", code: "failed", ms: ms() };
  }

  // code
  if (!deps.main) return { t: "reply", text: NEEDS_MODEL, code: "needs_model", ms: ms() };
  const r = await editCode(req, deps, emit, d.note);
  // the params said nothing new and the code edit did not land either: nothing a person sees changed
  if (r === "same" || (!r && sameParams)) return cantHere();
  if (r) return { ...r, ms: ms() };
  return { t: "reply", text: CANT_CHANGE, code: "failed", ms: ms() };
}

// --- what a change really did ------------------------------------------------------------------

const humanKey = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
const human = humanKey;
const itemLabel = (x: unknown): string => (typeof x === "string" ? x : x && typeof x === "object" ? String(LABEL_KEYS.map((k) => (x as Record<string, unknown>)[k]).find((v) => typeof v === "string" && v) ?? "") : String(x));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** What changed between two params, in words a person reads, derived from the values (never the model's own note). */
export function describeDiff(before: Record<string, unknown>, after: Record<string, unknown>): { changed: boolean; note: string } {
  const parts: string[] = [];
  let changed = false;
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[k];
    const b = after[k];
    if (same(a, b)) continue;
    changed = true;
    if (Array.isArray(a) || Array.isArray(b)) {
      const A = (Array.isArray(a) ? a : []).map(itemLabel).filter(Boolean);
      const B = (Array.isArray(b) ? b : []).map(itemLabel).filter(Boolean);
      const added = B.filter((x) => !A.includes(x));
      const gone = A.filter((x) => !B.includes(x));
      if (!A.length && added.length > 3) parts.push(`Filled in the ${human(k)} (${added.length})`);
      else if (added.length) parts.push(`Added ${list(added.slice(0, 3))}${added.length > 3 ? ` and ${added.length - 3} more` : ""}`);
      if (gone.length) parts.push(`Took out ${list(gone.slice(0, 3))}${gone.length > 3 ? ` and ${gone.length - 3} more` : ""}`);
      if (!added.length && !gone.length) parts.push(`Changed the ${human(k)}`);
    } else if (typeof b === "string") parts.push(b ? `Changed the ${human(k)} to "${b.slice(0, 40)}"` : `Cleared the ${human(k)}`);
    else if (typeof b === "number") parts.push(/cents$/i.test(k) ? `Set the ${human(k.replace(/cents$/i, ""))} to $${(b / 100).toFixed(2).replace(/\.00$/, "")}` : `Set the ${human(k)} to ${b}`);
    else if (typeof b === "boolean") parts.push(`Turned ${b ? "on" : "off"} the ${human(k)}`);
    else parts.push(`Changed the ${human(k)}`);
  }
  return { changed, note: parts.length ? `${parts.slice(0, 3).join(". ")}.` : "" };
}

/** "I couldn't do that on this Mini. I can change the title, the options and the rules here." */
export function cantLine(params: Record<string, unknown> | null): string {
  const alias: Record<string, string> = { sub: "subtitle", why: "subtitle", when: "time", meetAt: "meeting time", weight: "split by room size" };
  const human = (k: string) => humanKey(k.replace(/Cents$/, ""));
  // what a person would call a part of the Mini; activity (draws, picks, votes) is not something to change
  const keys = Object.keys(params ?? {}).filter((k) => !/^(id|ids|seed|room|kind|cat|theme|color|tone|icon|picks|votes|log|history|members|counts|drawn|spun|ranked|book|bets|clock|lock|state)$/i.test(k)).slice(0, 4);
  return keys.length ? `I couldn't do that on this Mini. Here I can change the ${list([...new Set(keys.map((k) => alias[k] ?? human(k)))])}` : "I couldn't do that on this Mini. It is as it was";
}

/** A question back when a change sets an amount nobody gave ("How much more?"); null when every new amount is grounded. */
export function inventedAmount(req: ChangeRequest, before: Record<string, unknown>, after: Record<string, unknown>): string | null {
  const g = groundOf({ ask: req.ask, chat: req.chat, members: req.members });
  g.loose = true;
  g.context += `\n${JSON.stringify(before)}`;
  const at = (o: unknown, path: (string | number)[]) => path.reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string | number, unknown>)[k] : undefined), o);
  const bad = problems(req.tool.piece ?? "", after, g).filter((p) => /amount/.test(p.why) && !same(at(before, p.path), at(after, p.path)));
  // an ask with no number in it ("make Maya pay more") never sets a money amount: a figure the chat
  // happens to hold elsewhere (a couch at $120) is not the one the group meant
  if (!bad.length && !/\d/.test(req.ask)) {
    const moved = (a: unknown, b: unknown, key = ""): boolean => {
      if (typeof b === "number") return MONEY.test(key) && a !== b;
      if (Array.isArray(b)) return b.some((x, i) => moved(Array.isArray(a) ? a[i] : undefined, x, key));
      if (b && typeof b === "object") return Object.entries(b).some(([k, x]) => moved(a && typeof a === "object" ? (a as Record<string, unknown>)[k] : undefined, x, k));
      return false;
    };
    if (moved(before, after)) bad.push({ path: [], value: "", why: "an amount the ask did not give" });
  }
  if (!bad.length) return null;
  const t = req.ask.toLowerCase();
  return `${/\bmore\b/.test(t) ? "How much more" : /\bless\b/.test(t) ? "How much less" : "What amount"}? Say a number and I'll change it`;
}

const MONEY = /(cents|price|amount|cost|rent|total|fee|budget|dollars|usd|owed|share)$/i;

/** Source without comments and whitespace: two that match draw and behave the same. */
const bare = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1").replace(/\s+/g, "");

async function swap(req: ChangeRequest, params: Record<string, unknown> | null, folded: Folded | null, deps: ChangeDeps, emit: (e: ChangeEvent) => void, note = ""): Promise<Omit<Extract<ChangeResult, { t: "done" }>, "ms"> | null> {
  if (!deps.fast) return null;
  const filler = deps.main ?? deps.fast;
  // The current tool's content goes in as a line from Muse, so the new tool is filled from it and the chat.
  const content = `The current ${req.tool.name}: ${JSON.stringify(params ?? {}).slice(0, 1200)}${folded?.summary ? ` (${folded.summary})` : ""}`;
  const sub = { ask: `${req.ask} (instead of the current ${req.tool.name}${req.tool.piece ? `, a ${req.tool.piece}` : ""})`, chat: { ...req.chat, messages: [...req.chat.messages.slice(-29), { from: "Muse", text: content }] }, members: req.members, surface: "chat" as const };
  const d = await route(sub, deps.fast, { fill: false });
  const picks = d.picks.filter((p) => p.id !== req.tool.piece);
  for (const p of picks) {
    const lab = pickLab(p.id);
    if (!lab) continue;
    let f = await fillLab(sub, p.id, filler);
    let source = "";
    let report: Report | null = null;
    // the fill, then one refill with the gate's reason named (as generate.ts does)
    for (let attempt = 0; f && attempt < 2; attempt++) {
      const filled = honestStart(p.id, shaped(p.id, f.params), sub);
      source = fill(lab, filled);
      emit({ t: "checking", attempt });
      report = await (deps.libraryGate ?? deps.gate)(source);
      if (report.ok) break;
      const why = `the tool did not pass its check (${report.stage}: ${report.failures[0]?.rule ?? ""} ${report.failures[0]?.message ?? ""})`.slice(0, 300);
      console.warn(`change: swap to ${p.id} failed the gate (${attempt}): ${why}`);
      if (attempt === 0) f = await fillLab(sub, p.id, filler, { params: filled, errors: [why] });
    }
    if (!report?.ok) continue;
    // the card keeps a name people know: the new tool's own top-level title, else the old name
    const name = nameOf(source, req.tool.name);
    const kind = labPiece(p.id)?.name ?? appName(source);
    const said = note && !/kept|stay/i.test(note) ? note : `Made it a ${kind.toLowerCase()}.`;
    return { t: "done", tier: "swap", source, name, summary: "", note: short(`${said.replace(/\.?$/, ".")} It starts fresh.`, 100), room: "new", piece: p.id };
  }
  return null;
}

function editSystem(): string {
  return [
    "You change one small live group-chat app on request, with SEARCH/REPLACE edits to its source. Change only what the ask needs; keep everything else as it is: the state shape, the action names, the ids, the drawing, the labels. Add to the state only when the ask needs it, as optional fields with a default in init, so state already in the room still folds.",
    "Every rule of the API holds: pure reducer, no Date or timers in reduce (time comes from meta.time; a live clock in the view uses `clock`), colors from theme.color, buttons of 1 to 4 words, sentence case, no exclamation marks in labels.",
    "",
    "# The API",
    "",
    apiText(),
  ].join("\n");
}

async function editCode(req: ChangeRequest, deps: ChangeDeps, emit: (e: ChangeEvent) => void, note: string): Promise<Omit<Extract<ChangeResult, { t: "done" }>, "ms"> | null | "same"> {
  const main = deps.main!;
  const chat = req.chat.messages.slice(-20).map((m) => `${m.from}: ${m.text}`).join("\n");
  // The app has no time zone (no Date, no Intl): a clock time the chat names is the group's local time, a fixed offset from `clock`/meta.time (UTC ms).
  const tz = req.tz ?? 0;
  const zone = `The group's local time is UTC${tz >= 0 ? "+" : "-"}${Math.floor(Math.abs(tz) / 60)}${Math.abs(tz) % 60 ? `:${String(Math.abs(tz) % 60).padStart(2, "0")}` : ""}: local ms = UTC ms ${tz >= 0 ? "+" : "-"} ${Math.abs(tz) * 60_000}. A clock time in the ask ("noon", "8pm") is local: put this offset in the code as a constant.`;
  const user = `The chat (members: ${req.members.map((m) => m.name).join(", ")}):\n${chat}\n\nThe ask: "${req.ask}"\n\n${zone}\n\nThe app:\n\n\`\`\`tsx\n${req.tool.source.trim()}\n\`\`\`\n\n${EDIT_INSTRUCTIONS}`;
  let source: string | null = null;
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    emit({ t: "editing", attempt });
    const content = attempt === 0 ? user : feedback;
    const reply = await main.complete({ label: attempt ? "change-repair" : "change-edit", system: editSystem(), messages: [{ role: "user", content }], effort: "low", nonce: attempt + 1 } as Parameters<ModelClient["complete"]>[0]);
    const base = attempt === 0 ? req.tool.source : (source ?? req.tool.source);
    let next = applyEdits(base, reply);
    if (!next && /defineApp/.test(reply)) next = extractCode(reply);
    if (!next) {
      feedback = `Your edits did not apply: a SEARCH block was not found exactly once in the app. Copy SEARCH lines exactly.\n\nThe ask: "${req.ask}"\n\nThe app:\n\n\`\`\`tsx\n${base.trim()}\n\`\`\`\n\n${EDIT_INSTRUCTIONS}`;
      continue;
    }
    // an edit that changes nothing but comments or spacing changes nothing anyone sees
    if (bare(next) === bare(req.tool.source)) return "same";
    source = next;
    emit({ t: "checking", attempt });
    const report = await deps.gate(source);
    if (report.ok) {
      const plan = roomPlan(req.tool.source, source, req.log);
      // only the params moved: the note comes from what moved, not from the model
      const p0 = paramsOf(req.tool.source);
      const p1 = paramsOf(source);
      const onlyParams = p0 && p1 && bare(withParams(req.tool.source, p1)) === bare(source);
      if (onlyParams) {
        const diff = describeDiff(p0, p1);
        if (!diff.changed) return "same";
        if (inventedAmount(req, p0, p1)) return null;
        note = diff.note;
      }
      return { t: "done", tier: "code", source, name: nameOf(source, req.tool.name), summary: "", note: short(note || "Changed it.", 120), room: plan.room, ...(plan.replay ? { replay: plan.replay } : {}), piece: req.tool.piece };
    }
    console.warn(`change: code edit failed the gate (${attempt}): ${report.stage} ${report.failures[0]?.rule ?? ""} ${report.failures[0]?.message?.slice(0, 200) ?? ""}`);
    feedback = `The ask was: "${req.ask}"\n\n${repairAll(source, report).replace("Reply with the whole fixed module in one ```tsx block and nothing else.", EDIT_INSTRUCTIONS)}`;
  }
  return null;
}
