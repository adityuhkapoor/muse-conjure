// The reader: Muse reads one page object (a post, a listing, an event, a group, a story, a reel, a
// chat) the way a person sees it, plus what the viewer just did, and decides whether a lab tool is
// worth offering. Most things get nothing. Two model calls, both through the factory's clients:
//   1. pick (fast model, Ember): the whole lab catalog (the factory router's cards), the page text,
//      the act and the people; up to two offers (three for a typed ask), each with a label in the
//      page's voice, one line on what was read, a confidence and a lab tool id; or nothing.
//   2. fill (contributor Spark), per offer, in parallel: the tool's whole params for this page, the example
//      as a shape only. Then the leak check (packages/factory/src/leak.ts): no example string may
//      survive unless the page has it; one retry naming the leaked strings, then the offer is dropped.
//
// Answers are cached by a hash of the page with people's names replaced by their ids, so the same
// page reads once for every viewer; names go back in on the way out. Seeded pages are answered
// from reader-answers.json (written by reader-seed.ts, loaded at seed time), so the demo's first
// paint needs no model and works with --model replay. Every decision is logged to
// packages/factory/.cache/reader.jsonl.
//
//   POST /reader/read    ReadInput                                  SSE: picks, offer, done
//   POST /reader/refill  { tool, params, idea, chat, members }       JSON { params } or { error }
//
// Models: Muse (muse-ember-1.0 picks, muse-spark-1.3-contributor fills); MUSE_READER_PICK and
// MUSE_READER_FILL name either one exactly. muse-wonder-1.0 is never used.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LAB_DIR } from "@muse/library";
import { CACHE_DIR, hashOf } from "../../packages/factory/src/cache.ts";
import { labExample } from "../../packages/factory/src/lab.ts";
import { GROUNDING_RULE, groundQuotes, leaks, overShape, strings } from "../../packages/factory/src/leak.ts";
import { makeModel } from "../../packages/factory/src/models/index.ts";
import { catalog, catalogText } from "../../packages/factory/src/router.ts";
import type { ModelClient } from "../../packages/factory/src/types.ts";
import { available } from "./premade.ts";

export type Person = { id: string; name: string };

export type ReadInput = {
  surface: string;
  object: { kind: string; id: string };
  /** the page as a person sees it, one fact a line */
  page: string;
  /** what the viewer just did, newest last: "opened", "liked", "saved", "interested", "typing", "shared" */
  did: string[];
  /** the viewer first, then the friends on the page */
  people: Person[];
  ask?: string;
  /** a higher confidence bar (timed offers nobody asked for) */
  unprompted?: boolean;
};

export type Offer = { tool: string; label: string; read: string; confidence: number; params: Record<string, unknown>; leakRetry: boolean };
export type Answer = { key: string; offers: Offer[]; nothing: boolean; ms: number; model: string; source: "seed" | "live" | "cache" | "off"; error?: string };

const ANSWERS = join(import.meta.dir, "reader-answers.json");
const LOG = join(CACHE_DIR, "reader.jsonl");

/** Suggestions below this are not shown; unprompted ones need more. Asks take any pick. */
export const BAR = { suggest: 0.55, unprompted: 0.8 };

// ---------------------------------------------------------------- models

type Models = { pick: ModelClient; fill: ModelClient } | null;
let models: Models | undefined;
let mainConfig = process.env.MUSE_DEFAULT ?? "auto";

/** The gateway tells the reader which model the demo runs on ("replay" turns live reading off). */
let configured: Promise<void> = Promise.resolve();
export function configureReader(o: { model?: string | Promise<string | undefined> }) {
  models = undefined;
  if (typeof o.model === "string") mainConfig = o.model;
  else if (o.model)
    configured = o.model.then(
      (m) => {
        if (m) mainConfig = m;
        models = undefined;
      },
      () => {},
    );
}

const noWonder = (c: string) => {
  if (/wonder/i.test(c)) throw new Error("muse-wonder-1.0 is not used by the reader");
  return c;
};

export function readerConfigs(): { pick: string; fill: string } | null {
  const fam = process.env.MUSE_READER ?? (mainConfig === "replay" ? "off" : "muse");
  if (fam === "off" || fam === "replay") return null;
  return {
    pick: noWonder(process.env.MUSE_READER_PICK ?? "muse:muse-ember-1.0"),
    fill: noWonder(process.env.MUSE_READER_FILL ?? "muse:muse-spark-1.3-contributor"),
  };
}

function getModels(): Models {
  if (models !== undefined) return models;
  const c = readerConfigs();
  models = c ? { pick: makeModel(c.pick), fill: makeModel(c.fill) } : null;
  return models;
}

// ---------------------------------------------------------------- names <-> ids

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Names to ⟨id⟩, longest first, whole words only. */
export function canon(text: string, people: Person[]): string {
  let out = text;
  for (const p of [...people].filter((p) => p.name.trim().length >= 2).sort((a, b) => b.name.length - a.name.length)) {
    out = out.replace(new RegExp(`(^|[^A-Za-z⟨])${esc(p.name)}(?=[^A-Za-z]|$)`, "g"), `$1⟨${p.id}⟩`);
    const first = p.name.split(/\s+/)[0]!;
    if (first !== p.name && first.length >= 3 && !people.some((q) => q !== p && q.name.split(/\s+/)[0] === first)) out = out.replace(new RegExp(`(^|[^A-Za-z⟨])${esc(first)}(?=[^A-Za-z]|$)`, "g"), `$1⟨${p.id}⟩`);
  }
  return out;
}

export function uncanon(text: string, people: Person[]): string {
  const by = new Map(people.map((p) => [p.id, p.name]));
  return text.replace(/⟨([^⟩]+)⟩/g, (m, id: string) => by.get(id) ?? (id === "me" ? "You" : id));
}

const mapStrings = (v: unknown, f: (s: string) => string): unknown =>
  typeof v === "string" ? f(v) : Array.isArray(v) ? v.map((x) => mapStrings(x, f)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, f)])) : v;

/** The cache key: the page with names as ids, so every viewer shares one read. */
export function readKey(i: ReadInput): string {
  const ids = i.people.map((p) => p.id);
  return hashOf({ v: 1, s: i.surface, k: i.object.kind, page: canon(i.page, i.people), did: [...new Set(i.did)].sort(), ask: canon(i.ask?.trim() ?? "", i.people), ids, u: !!i.unprompted });
}

// ---------------------------------------------------------------- stored answers

type Stored = { offers: Offer[]; nothing: boolean; model: string; at: string };
const memory = new Map<string, Stored>();
let seeded: Record<string, Stored> | null = null;

function seedAnswers(): Record<string, Stored> {
  if (seeded) return seeded;
  try {
    seeded = existsSync(ANSWERS) ? (JSON.parse(readFileSync(ANSWERS, "utf8")) as Record<string, Stored>) : {};
  } catch {
    seeded = {};
  }
  return seeded;
}

/** Loaded at seed time (seed-catalysts.ts): how many seeded pages already have an answer. */
export function loadSeedAnswers(): number {
  seeded = null;
  return Object.keys(seedAnswers()).length;
}

export const storedKeys = () => new Set(Object.keys(seedAnswers()));

/** reader-seed.ts: write the precomputed answers. */
export function saveSeedAnswers(entries: Record<string, Stored>) {
  const all = { ...seedAnswers(), ...entries };
  writeFileSync(ANSWERS, JSON.stringify(Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b))), null, 1) + "\n");
  seeded = all;
}

const out = (s: Stored, people: Person[]): Offer[] => s.offers.map((o) => ({ ...o, label: uncanon(o.label, people), read: uncanon(o.read, people), params: mapStrings(o.params, (x) => uncanon(x, people)) as Record<string, unknown> }));

// ---------------------------------------------------------------- prompts

const PICK_SCHEMA = {
  type: "object",
  properties: {
    nothing_worth_offering: { type: "boolean" },
    why: { type: "string" },
    offers: {
      type: "array",
      items: { type: "object", properties: { tool: { type: "string" }, label: { type: "string" }, read: { type: "string" }, confidence: { type: "number" } }, required: ["tool", "label", "read", "confidence"], additionalProperties: false },
    },
  },
  required: ["nothing_worth_offering", "why", "offers"],
  additionalProperties: false,
};

let pickSystemText: string | null = null;
export function pickSystem(): string {
  return (pickSystemText ??= [
    "You are the reader for Muse inside Facebook. You see one thing on a page the way the viewer sees it (a post, a listing, an event, a group, a story, a reel or a chat), what the viewer just did there, and the viewer's friends. Muse can attach a small live tool from the catalog below that the viewer and friends use together. You decide whether one is worth offering, and which.",
    "",
    "Most things deserve nothing. Offer only when this page has a concrete hook a group of friends would act on together right now: a plan or outing with people, a choice between named options, something to split, pay back, bring or claim, a date or time to settle, an item to decide on or fit or price, a game or contest, a ranking, a trip, a recipe to cook, a list to build, people to coordinate.",
    "What the viewer just did counts. Saving a listing (is the price fair, will it fit, how to pick it up, decide with roommates), saying interested or going to an event with friends (who's going, rides, where to meet), liking a friend's plan, ranking or ask, sharing a reel to a chat, or typing a question in a group are the moments a tool most often helps.",
    "Offer nothing for: an ordinary update, a mood or a feeling, a photo or view with no plan, a joke, news, an opinion, a complaint about something only the poster can fix, a question for a fact, an ad. Never offer anything on grief, death or a memorial, illness or injury, a breakup, mental health, politics, religion, money trouble, a rant, an argument, or anything where a playful tool would be tactless. Congratulations on big personal news (an engagement, a new job, a baby) get nothing unless the post itself asks friends to plan something.",
    "A broken thing (a phone, a car) gets nothing unless the post asks friends to choose, split or plan something.",
    "",
    "When you offer:",
    "- At most 2 offers, best first, each a different idea. One good offer is better than two.",
    "- tool: a catalog id whose Use lines describe this situation and none of whose Not lines do. Prefer a tool made for this surface, but a tool from another surface is fine when it fits the moment.",
    "- label: 2 to 5 words in the page's own voice, a verb first, sentence case, no exclamation marks, no emoji, no tool names (\"Split it with roommates\", \"See who else is going\", \"Claim a dish\").",
    "- read: one short line, lowercase start, naming what on the page you used (\"the $240 drum kit and your 3 roommates\").",
    "- confidence: 0 to 1, how likely the viewer would tap it here. Below 0.55 is not shown.",
    "If nothing fits, set nothing_worth_offering to true, offers empty, and say why in a few words.",
    "",
    "When the viewer typed an ask: give up to 3 tools that do what the ask needs for this page, best first (labels name what each would do), or nothing_worth_offering when no catalog tool does it. Small talk and questions for facts get nothing.",
    "",
    "Catalog:",
    catalogText(),
  ].join("\n"));
}

const peopleLine = (i: ReadInput) => `Viewer: ${i.people[0]?.name ?? "You"}\nFriends: ${i.people.slice(1).map((p) => p.name).join(", ") || "none on this page"}`;

export function pickUser(i: ReadInput): string {
  return [`Surface: ${i.surface}`, peopleLine(i), `What the viewer just did: ${i.did.length ? i.did.join(", ") : "opened it"}`, "", "The page:", i.page.slice(0, 4000), ...(i.ask ? ["", `The viewer typed: "${i.ask}"`] : [])].join("\n");
}

const FILL_SCHEMA = { type: "object", properties: { params_json: { type: "string" } }, required: ["params_json"], additionalProperties: false };

function fillSystem(fresh = false): string {
  return [
    "You fill the parameters of a ready-made tool Muse is offering on one Facebook page. Reply with params_json: the whole parameter object as a JSON string with every key the example has, the same shape and types.",
    "Rules:",
    "- The example belongs to someone else. Reuse none of its names, places, titles, items, quotes, notes or numbers. Keep only its shape. Every string is written fresh for this page.",
    "- Take what the page says first: its title, items, prices, times, places and people. Where the page does not say, write content that fits this page and this moment, the kind a friend would write.",
    "- People are the viewer and the friends by the names given, never any other names. The viewer is the host, buyer, payer or poster where the tool has one, unless the page says someone else is.",
    "- Activity from friends (votes, claims, notes) is fine when it fits the page; keep counts small and plausible. Counts of strangers start at 0 unless the page gives them.",
    "- Plain words, sentence case, no exclamation marks.",
    `- ${GROUNDING_RULE} Here the context is the page text below, what the viewer typed, and the names given.`,
    ...(fresh ? ["- This tool starts fresh in this chat. Nobody has used it: who voted, joined, paid, signed, claimed, rated, ranked or posted starts empty, and every count starts at 0. Take only the options, places, times and people this chat has talked about; where the chat has none, leave the list empty so the group adds its own."] : []),
  ].join("\n");
}

function fillUser(i: ReadInput, o: { tool: string; label: string; read: string; fresh?: boolean }, leaked: string[] = []): string {
  const id = o.tool.replace(/^lab:/, "");
  const meta = readFileSync(join(LAB_DIR, id, "meta.json"), "utf8");
  return [
    `Tool: ${id}`,
    `Offered as: "${o.label}" (${o.read})`,
    `meta.json:\n${meta}`,
    "",
    `example params (shape only, someone else's content):\n${JSON.stringify(labExample(id))}`,
    "",
    pickUser(i),
    ...(leaked.length ? ["", `Your last answer kept these from the example, which this page does not have: ${leaked.map((s) => `"${s}"`).join(", ")}. Write them fresh for this page.`] : []),
  ].join("\n");
}

const parse = <T>(text: string): T => JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;

/** Everything a filled tool may draw from. */
export const contextText = (i: Pick<ReadInput, "page" | "people" | "ask">) => [i.page, i.ask ?? "", ...i.people.map((p) => p.name)].join("\n");

/** Fill one tool for a page: one retry when example strings leak, then null. */
export async function fillTool(model: ModelClient, i: ReadInput, o: { tool: string; label: string; read: string; fresh?: boolean }): Promise<{ params: Record<string, unknown>; retried: boolean; leaked: string[] } | { why: string; leaked: string[] }> {
  const id = o.tool.replace(/^lab:/, "");
  const example = labExample(id);
  const ctx = contextText(i);
  let leaked: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let obj: unknown;
    try {
      const r = parse<{ params_json: string }>(await model.complete({ label: "reader-fill", system: fillSystem(o.fresh), messages: [{ role: "user", content: fillUser(i, o, leaked) }], json: { name: "reader_fill", schema: FILL_SCHEMA }, effort: "low", ...(attempt ? { nonce: 1 } : {}) } as Parameters<ModelClient["complete"]>[0]));
      obj = JSON.parse(r.params_json);
    } catch (e) {
      return { why: `fill failed: ${(e as Error).message.slice(0, 160)}`, leaked };
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { why: "params_json is not an object", leaked };
    const params = groundQuotes(overShape(example, obj as Record<string, unknown>), ctx).params;
    const now = leaks(id, params, ctx);
    if (!now.length) return { params, retried: attempt > 0, leaked };
    leaked = now;
  }
  return { why: `kept the example's ${leaked.slice(0, 4).map((s) => `"${s}"`).join(", ")}`, leaked };
}

// ---------------------------------------------------------------- reading

const inflight = new Map<string, Promise<Answer>>();

function log(entry: Record<string, unknown>) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch {}
}

/** Read a page. `onPicks` hears the picks before the fills finish. Never throws. */
export async function readPage(i: ReadInput, o: { onPicks?: (p: { tool: string; label: string; read: string; confidence: number }[]) => void; live?: boolean; fresh?: boolean } = {}): Promise<Answer> {
  const key = readKey(i);
  const stored = o.fresh ? undefined : (memory.get(key) ?? seedAnswers()[key]);
  if (stored) return { key, offers: out(stored, i.people), nothing: stored.nothing, ms: 0, model: stored.model, source: memory.has(key) ? "cache" : "seed" };
  await configured;
  const m = o.live === false ? null : getModels();
  if (!m) return { key, offers: [], nothing: false, ms: 0, model: "off", source: "off" };
  const running = inflight.get(key);
  if (running) return running;
  const p = readLive(i, key, m, o.onPicks).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function readLive(i: ReadInput, key: string, m: NonNullable<Models>, onPicks?: (p: { tool: string; label: string; read: string; confidence: number }[]) => void): Promise<Answer> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  const known = new Set(catalog().map((c) => c.id));
  const max = i.ask ? 3 : 2;
  const bar = i.ask ? 0 : i.unprompted ? BAR.unprompted : BAR.suggest;
  let picks: { tool: string; label: string; read: string; confidence: number }[] = [];
  let nothing = false;
  let why = "";
  try {
    const r = parse<{ nothing_worth_offering: boolean; why: string; offers: { tool: string; label: string; read: string; confidence: number }[] }>(
      await m.pick.complete({ label: "reader-pick", system: pickSystem(), messages: [{ role: "user", content: pickUser(i) }], json: { name: "reader_pick", schema: PICK_SCHEMA }, effort: "low" }),
    );
    why = String(r.why ?? "").slice(0, 160);
    picks = (r.offers ?? [])
      .map((x) => ({ tool: String(x.tool).replace(/^lab:/, ""), label: String(x.label ?? "").replace(/[!]+/g, "").trim().slice(0, 48), read: String(x.read ?? "").slice(0, 120), confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0)) }))
      .filter((x) => known.has(x.tool) && available(`lab:${x.tool}`) && x.label && x.confidence >= bar)
      .filter((x, n, a) => a.findIndex((y) => y.tool === x.tool) === n)
      .slice(0, max);
    nothing = !picks.length;
  } catch (e) {
    const error = (e as Error).message.slice(0, 200);
    log({ key, surface: i.surface, object: `${i.object.kind}:${i.object.id}`, did: i.did, ask: i.ask ?? null, error, ms: ms(), model: m.pick.id });
    return { key, offers: [], nothing: false, ms: ms(), model: m.pick.id, source: "off", error };
  }
  const pickMs = ms();
  onPicks?.(picks);
  const fills = await Promise.all(picks.map((p) => fillTool(m.fill, i, p)));
  const offers: Offer[] = [];
  const leakLog: { tool: string; leaked: string[]; retried: boolean; dropped: boolean }[] = [];
  for (const [n, p] of picks.entries()) {
    const f = fills[n]!;
    leakLog.push({ tool: p.tool, leaked: f.leaked, retried: f.leaked.length > 0, dropped: "why" in f });
    if ("why" in f) continue;
    offers.push({ ...p, params: f.params, leakRetry: f.retried });
  }
  const answer: Answer = { key, offers, nothing: !offers.length, ms: ms(), model: `${m.pick.id} + ${m.fill.id}`, source: "live" };
  // Stored with names as ids, so the next viewer of this page gets it at once.
  memory.set(key, { offers: offers.map((x) => ({ ...x, label: canon(x.label, i.people), read: canon(x.read, i.people), params: mapStrings(x.params, (s) => canon(s, i.people)) as Record<string, unknown> })), nothing: answer.nothing, model: answer.model, at: new Date().toISOString() });
  log({ key, surface: i.surface, object: `${i.object.kind}:${i.object.id}`, did: i.did, ask: i.ask ?? null, picks: picks.map((p) => ({ tool: p.tool, label: p.label, confidence: p.confidence, read: p.read })), why, chosen: offers.map((x) => x.tool), nothing: answer.nothing, pickMs, ms: answer.ms, leak: leakLog, model: answer.model });
  return answer;
}

/** The stored form of an answer (for reader-seed.ts). */
export function storedOf(i: ReadInput, a: Answer): Stored {
  return { offers: a.offers.map((x) => ({ ...x, label: canon(x.label, i.people), read: canon(x.read, i.people), params: mapStrings(x.params, (s) => canon(s, i.people)) as Record<string, unknown> })), nothing: a.nothing, model: a.model, at: new Date().toISOString() };
}

// ---------------------------------------------------------------- "Use for my group"

/** Refill a tool for a chat: same tool and idea, this chat's members and messages. */
export async function refillForChat(b: { tool: string; idea: string; chat: { title?: string; messages: { from: string; text: string }[] }; members: Person[] }): Promise<{ params: Record<string, unknown>; ms: number } | { error: string }> {
  await configured;
  const m = getModels();
  if (!m) return { error: "the reader is off" };
  const t0 = performance.now();
  const id = b.tool.replace(/^lab:/, "");
  if (!available(`lab:${id}`)) return { error: `no lab tool ${id}` };
  const page = [`Group chat: ${b.chat.title ?? "a group chat"}`, `Members: ${b.members.map((x) => x.name).join(", ")}`, "Recent messages:", ...b.chat.messages.slice(-30).map((x) => `${x.from}: ${x.text}`)].join("\n");
  const i: ReadInput = { surface: "chat", object: { kind: "chat", id: "chat" }, page, did: ["use for my group"], people: b.members };
  const f = await fillTool(m.fill, i, { tool: id, label: b.idea, read: `the same idea, made for ${b.chat.title ?? "this chat"}`, fresh: true });
  const ms = Math.round(performance.now() - t0);
  log({ refill: id, idea: b.idea, chat: b.chat.title ?? null, ok: !("why" in f), leak: f.leaked, ms, model: m.fill.id });
  return "why" in f ? { error: f.why } : { params: f.params, ms };
}

// ---------------------------------------------------------------- HTTP

function parseInput(b: Record<string, unknown>): ReadInput | null {
  const page = typeof b.page === "string" ? b.page.slice(0, 6000) : "";
  const obj = b.object as { kind?: unknown; id?: unknown } | undefined;
  if (!page.trim() || !obj || typeof obj.kind !== "string" || typeof obj.id !== "string") return null;
  const people = (Array.isArray(b.people) ? b.people : []).filter((p): p is Person => !!p && typeof (p as Person).id === "string" && typeof (p as Person).name === "string").slice(0, 40);
  return {
    surface: String(b.surface ?? "feed").slice(0, 20),
    object: { kind: obj.kind.slice(0, 20), id: obj.id.slice(0, 120) },
    page,
    did: (Array.isArray(b.did) ? b.did : []).filter((x): x is string => typeof x === "string").slice(-6).map((x) => x.slice(0, 120)),
    people: people.length ? people : [{ id: "me", name: "You" }],
    ...(typeof b.ask === "string" && b.ask.trim() ? { ask: b.ask.trim().slice(0, 300) } : {}),
    ...(b.unprompted === true ? { unprompted: true } : {}),
  };
}

export async function readerResponse(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "body is not JSON" }, { status: 400 });
  }
  if (path === "/reader/refill") {
    const members = (Array.isArray(body.members) ? body.members : []).filter((p): p is Person => !!p && typeof (p as Person).name === "string");
    const chat = (body.chat ?? { messages: [] }) as { title?: string; messages: { from: string; text: string }[] };
    if (typeof body.tool !== "string" || !Array.isArray(chat.messages)) return Response.json({ error: "tool and chat are required" }, { status: 400 });
    return Response.json(await refillForChat({ tool: body.tool, idea: String(body.idea ?? "").slice(0, 120), chat, members }), { headers: { "cache-control": "no-cache" } });
  }
  if (path !== "/reader/read") return Response.json({ error: "not found" }, { status: 404 });
  const i = parseInput(body);
  if (!i) return Response.json({ error: "page and object are required" }, { status: 400 });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (event: string, data: unknown) => {
        try {
          ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };
      const a = await readPage(i, { onPicks: (picks) => send("picks", { picks }) });
      send("done", { ...(({ model: _m, ...rest }) => rest)(a), available: a.source !== "off" || !!getModels() });
      try {
        ctl.close();
      } catch {}
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
}
