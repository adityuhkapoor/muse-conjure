// The router: a fast model reads the whole lab catalog (one short card per tool, built once from
// library/lab/<id>/meta.json and example.ts), the ask, the surface, the last 30 messages and the
// members, and picks up to 3 lab tools with a reason each, or says nothing fits (then a one-line
// reply, or the new-build path when the ask wants something made). The fill model (the main one:
// contributor Spark under Muse) fills the first pick's params from the chat only, grounded: no person,
// amount, date or place the chat did not give; made-up options are listed as suggested. The
// example is a shape, never content. generate.ts checks each fill (gate, ground.ts), repairs it
// once, then tries the next pick. Decisions are cached by a hash of ask and context and logged to
// .cache/router.jsonl for review.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LAB_DIR, labPiece, type Piece } from "@muse/library";
import { CACHE_DIR, hashOf } from "./cache.ts";
import { labExample } from "./lab.ts";
import { GROUNDING_RULE, groundQuotes, overShape } from "./leak.ts";
import { makeModel } from "./models/index.ts";
import { compactFillSystem, compactFillUser, FILL_RULES, shapeOf } from "./fillprompt.ts";
import type { Effort, GenerateRequest, ModelClient } from "./types.ts";

export type Card = { id: string; name: string; surface: string; summary: string; use: string[]; dont: string[]; example: string; height: number; /** the params as an empty skeleton, one line (one-call routing, fillprompt.ts) */ skeleton: string; /** the top-level param names */ keys: string[] };

const short = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** One line about what the example shows: its title and a few of its first words. */
function exampleLine(ex: Record<string, unknown> | null): string {
  if (!ex) return "";
  const words: string[] = [];
  const walk = (v: unknown) => {
    if (words.join(" · ").length > 90) return;
    if (typeof v === "string" && v.length > 1 && v.length < 40) words.push(v);
    else if (Array.isArray(v)) v.slice(0, 3).forEach(walk);
    else if (v && typeof v === "object") Object.values(v).slice(0, 6).forEach(walk);
  };
  walk(ex);
  return words.join(" · ").slice(0, 110);
}

let catalogCache: Card[] | null = null;

/** Every lab tool with a meta.json and an example.ts, as a router card. Built once. */
export function catalog(): Card[] {
  if (catalogCache) return catalogCache;
  const out: Card[] = [];
  for (const id of readdirSync(LAB_DIR).sort()) {
    const dir = join(LAB_DIR, id);
    if (id.startsWith("_") || !existsSync(join(dir, "meta.json")) || !existsSync(join(dir, "app.tsx")) || !existsSync(join(dir, "example.ts"))) continue;
    try {
      const m = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as Record<string, unknown>;
      out.push({
        id,
        name: short(m.name, 40) || id,
        surface: short(m.surface, 16) || "messenger",
        summary: short(m.summary, 160),
        use: ((m.useWhen ?? m.use_when ?? []) as string[]).slice(0, 3).map((s) => short(s, 90)),
        dont: ((m.dontUseWhen ?? m.dont_use_when ?? []) as string[]).slice(0, 2).map((s) => short(s, 70)),
        example: exampleLine(labExample(id)),
        height: Number(m.height) || 0,
        skeleton: JSON.stringify(shapeOf(labExample(id) ?? {})),
        keys: Object.keys(labExample(id) ?? {}).slice(0, 8),
      });
    } catch {
      // a half-written port: leave it out
    }
  }
  catalogCache = out;
  return out;
}

const SURFACE: Record<string, string> = { chat: "messenger", event: "event", group: "group", feed: "feed", marketplace: "marketplace", gaming: "gaming", story: "story" };

/** MUSE_CATALOG=compact: one short card per Mini (summary, first use-when line, param names); full: the whole card (default). */
export const catalogMode = (): "full" | "compact" => (process.env.MUSE_CATALOG === "compact" ? "compact" : "full");
/** A Mini whose params are a few plain fields: the router may fill it in the same call (MUSE_ONE_CALL=1). */
export const SIMPLE_MAX = 170;
export const oneCall = () => process.env.MUSE_ONE_CALL === "1";
/** The router effort: minimal by default (routing accuracy 99 of 104 vs 98 at low); MUSE_ROUTER_EFFORT=low is the slower setting. */
export const routerEffort = (model?: ModelClient): Effort => (["minimal", "low", "medium"].includes(process.env.MUSE_ROUTER_EFFORT ?? "") ? (process.env.MUSE_ROUTER_EFFORT as Effort) : model && !model.id.startsWith("muse") ? "low" : "minimal"); // minimal is a Muse setting; another provider keeps low

export function catalogText(cards = catalog(), mode = catalogMode()): string {
  const params = (c: Card) => (oneCall() && c.skeleton.length <= SIMPLE_MAX ? ` Params: ${c.skeleton}` : "");
  if (mode === "compact") return cards.map((c) => `- ${c.id} [${c.surface}] ${c.summary.slice(0, 120)} Use: ${c.use[0] ?? ""}.${oneCall() ? params(c) : ` Params: ${c.keys.join(", ")}`}`).join("\n");
  return cards.map((c) => `- ${c.id} [${c.surface}] ${c.summary} Use: ${c.use.join("; ")}. Not: ${c.dont.join("; ")}. Example: ${c.example}${params(c)}`).join("\n");
}

/** What the router can decide. A Mini is the default; every other outcome names its reason. */
export const OUTCOMES = ["mini", "new_mini", "answer", "cant_act", "wont", "greet"] as const;
export type Outcome = (typeof OUTCOMES)[number];

const PICK_PROPS = {
  outcome: { type: "string", enum: [...OUTCOMES] },
  reply: { type: "string" },
  chip: { type: "string" },
  confidence: { type: "number" },
  chat_has_content: { type: "boolean" },
  picks: { type: "array", items: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"], additionalProperties: false } },
};
const PICK_REQUIRED = ["outcome", "reply", "chip", "confidence", "chat_has_content", "picks"];
/** One-call routing (MUSE_ONE_CALL=1) adds the first pick's params and what was made up in them. */
const pickSchema = () =>
  oneCall()
    ? { type: "object", properties: { ...PICK_PROPS, params_json: { type: "string" }, suggested: { type: "array", items: { type: "string" } } }, required: [...PICK_REQUIRED, "params_json", "suggested"], additionalProperties: false }
    : { type: "object", properties: PICK_PROPS, required: PICK_REQUIRED, additionalProperties: false };
const FILL_SCHEMA = {
  type: "object",
  properties: { params_json: { type: "string" }, suggested: { type: "array", items: { type: "string" } } },
  required: ["params_json", "suggested"],
  additionalProperties: false,
};

export function routerSystem(cards: Card[] = catalog()): string {
  return [
    "You are Muse in a group chat. Someone addressed you. Muse makes Minis: small live things the group uses together (a vote, a wheel, a split, a list, a plan, a tracker, a game, a schedule, a board). You decide what this message gets. Making a Mini is the default; anything else needs one of the reasons below.",
    "Go down this ladder and stop at the first step that holds:",
    "1. mini: a catalog Mini can carry the ask, even loosely, even when the chat lacks some details (the Mini starts with what is known and collects the rest). Pick up to 3 ids, best first, each with a one-line reason. Prefer a Mini made for the surface (chat means messenger) whose Use lines describe the situation and whose Not lines do not. An ask to make, create, build, plan, organise, list, track, schedule, split, settle, vote, rank, pick, assign, sign up, bet, count down or play is a Mini ask, even when the chat already discussed it. When the chat already holds the answer (several people agreed to one time or place), pick a Mini that shows it with who agreed and lets the rest join in.",
    "2. new_mini: nothing in the catalog carries it, even loosely, but the group would use a shared thing for it (a custom game, a tracker, a board, a checklist). No picks; Muse makes a new one, which takes about a minute, so when a catalog Mini is close (a trip plan for an itinerary, a bring list for a packing list, a vote for a choice) choose mini with it instead. Never decline a request to make something for the group.",
    "3. answer: the ask wants an answer, not a thing: a fact, an explanation, advice, a feeling, or a piece of writing. Reply with the answer itself in one or two short sentences. Warm and plain for feelings (no therapy voice, no lists, no menu of Minis). For writing, give a short version. Never state facts about the people in this chat that the chat does not say; for a question about someone the chat does not answer, say you don't know and suggest asking them. If one catalog Mini would genuinely help, put its id in chip, else an empty string.",
    "4. cant_act: the ask is an action in the world Muse cannot take (book, buy, order, pay or request money, call a ride, message or call someone, reserve). Reply in one line saying Muse can't do that from here, and put in chip the id of the catalog Mini that gets the group to the point of doing it (a pick, a split, a sign-up), if one fits.",
    "5. wont: harm to someone, tracking, locating or watching a person, finding where someone lives, reading someone's private messages, cruelty about real people, or anything unsafe. Reply in one plain line that says what Muse won't do and why in a few words (for example: \"I won't look up where someone lives or track them\"). No menu, no chip.",
    "6. greet: a mention with no ask (just \"muse\", hi, thanks, lol, are you there). Reply in one short friendly line; nothing is made.",
    "When content is missing (top 5 moments, best quotes, things to fix), it is still a Mini: the group fills it in. Answer only when no shared thing would help. Muse has no memory and cannot act later: an ask to remember, remind or keep track is a Mini (a note, a countdown, a tracker), never a promise to remember.",
    "reply: empty for mini and new_mini. Otherwise one or two short sentences, sentence case, plain words, no exclamation marks, no apology padding, under 220 characters. Never list what Muse can make as a fallback.",
    "chip: a catalog id or an empty string. Only for answer and cant_act.",
    "confidence is 0 to 1: how sure you are of the outcome (and of the first pick, for mini).",
    "chat_has_content: true when the recent chat already names things the first pick needs (options, places, people, times, amounts); false when it names none or the outcome is not mini.",
    ...(oneCall()
      ? [
          "params_json and suggested: only when the outcome is mini, your confidence in the first pick is at least 0.8 and its catalog line shows a Params skeleton: fill the first pick's params from the chat as a JSON string with the skeleton's keys and shapes, and list in suggested what you made up. Otherwise params_json is an empty string and suggested is empty.",
          ...FILL_RULES,
        ]
      : []),
    "",
    "Catalog:",
    catalogText(cards),
  ].join("\n");
}

const lines = (req: Pick<GenerateRequest, "chat">) => req.chat.messages.slice(-30).map((m) => `${m.from}: ${m.text}`).join("\n");

export function routerUser(req: Pick<GenerateRequest, "ask" | "chat" | "members" | "surface">): string {
  return `Surface: ${req.surface}\nChat: ${req.chat.title ?? ""}\nMembers: ${req.members.map((m) => m.name).join(", ")}\n\nRecent chat:\n${lines(req)}\n\nThe ask: "${req.ask}"`;
}

export function fillSystem(): string {
  return [
    "You fill the parameters of a ready-made group-chat tool for one chat. Reply with params_json (the whole parameter object as a JSON string, the shape of the example) and suggested.",
    "The example shows the SHAPE and the types only. It belongs to another group: never copy its names, places, items, amounts, dates or wording.",
    "Do not invent facts about these people. Every person you name is a member of this chat, by the name given. Every amount, date, time, place and option comes from the chat's messages, or is worked out directly from them (a sum, a split, a count).",
    "Where the tool needs options the chat did not give, you may propose a few plain, generic ones that fit; list each of them, exactly as written in params_json, in suggested. When the ask asks Muse for ideas (an itinerary, things to do, a packing list), propose plain, well-known ones the same way. Never propose people, amounts or dates, and never say a person suggested something they did not. Name each proposed stop, place or thing in 3 or 4 words (\"Machu Picchu\", \"Lima old town\", \"Ceviche in Barranco\"), never a sentence. Where the tool has a suggested flag on an item (a trip plan, a bring-list item), set it true on the items you proposed and leave it off the ones the chat named.",
    "Read the chat for what the group already said first: options people named, and who agreed to which (\"sunday 7pm union\", then \"sunday 7\", \"sunday works\"). Those are the tool's options, days, times and places, and each person who said yes to one is marked on it (their free time, their vote, their claim). Only propose your own options when the chat named none.",
    "When the chat lacks a part, leave it empty: the tool starts with what is known and the group fills in the rest. An empty list is fine.",
    "Leave out a part the chat does not give: an empty string, an empty list, or 0. Leave out descriptive extras (distances, ratings, prices, notes, quotes) unless the chat says them.",
    "Start at the true state: nobody has voted, claimed, paid, joined, ranked, bet, picked or spun anything unless their own message says so in words (\"i already venmo'd\" marks that person paid; \"i'm in\" marks them going). Lists of votes, claims, bets, picks and moves start empty otherwise. Clocks and timers are empty unless the chat gives the time.",
    "Titles and short lines use the chat's own words. Plain words, sentence case, no exclamation marks.",
    GROUNDING_RULE,
  ].join("\n");
}

function fillUser(req: Pick<GenerateRequest, "ask" | "chat" | "members" | "surface">, id: string, repair?: { params: Record<string, unknown>; errors: string[] }): string {
  const meta = readFileSync(join(LAB_DIR, id, "meta.json"), "utf8");
  const example = JSON.stringify(labExample(id));
  const base = `Tool: ${id}\nmeta.json:\n${meta}\n\nexample params (shape only, another group's content):\n${example}\n\n${routerUser(req)}`;
  if (!repair) return base;
  return `${base}\n\nYour last fill was:\n${JSON.stringify(repair.params)}\n\nIt was turned down for these reasons. Fix every one (take the part out, or use what the chat says) and reply with the whole fill again:\n${repair.errors.map((e) => `- ${e}`).join("\n")}`;
}

export type Fill = { params: Record<string, unknown>; suggested: string[] };

/** A fill whose list of things to pick among has exactly one entry ("0 of 1 ranked"): not a tool, a question. An empty list stays (the group adds options). */
const LIST_KEYS = /^(items|options|entries|places|spots|choices|teams|chores|movies|prizes|captions|weekends|rooms|dishes|tasks)$/;
export const oneItemList = (p: Record<string, unknown>): boolean => Object.entries(p).some(([k, v]) => LIST_KEYS.test(k) && Array.isArray(v) && v.length === 1);

/**
 * Fill one lab tool's params from the chat (the fill model: the main model, not the router's fast
 * one). With `repair`, the last fill and why it was turned down. Null when the model gives nothing usable.
 */
export async function fillLab(req: Pick<GenerateRequest, "ask" | "chat" | "members" | "surface">, id: string, model: ModelClient, repair?: { params: Record<string, unknown>; errors: string[] }, o: { effort?: Effort; /** the short prompt for the fast model (fillprompt.ts) */ compact?: boolean; label?: string } = {}): Promise<Fill | null> {
  try {
    const f = parse<{ params_json: string; suggested?: string[] }>(
      await model.complete({
        label: o.label ?? (repair ? "router-refill" : "router-fill"),
        system: o.compact ? compactFillSystem() : fillSystem(),
        messages: [{ role: "user", content: o.compact ? compactFillUser(req, id, repair) : fillUser(req, id, repair) }],
        json: { name: "fill", schema: FILL_SCHEMA },
        effort: o.effort ?? "low",
      }),
    );
    const p = JSON.parse(f.params_json) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) return null;
    // one chip looks broken: that list starts empty and the Mini collects the options
    if (oneItemList(p as Record<string, unknown>)) for (const [k, v] of Object.entries(p)) if (LIST_KEYS.test(k) && Array.isArray(v) && v.length === 1) (p as Record<string, unknown>)[k] = [];
    const grounded = groundQuotes(p as Record<string, unknown>, `${req.chat.title ?? ""}\n${lines(req)}\n${req.ask}\n${req.members.map((m) => m.name).join("\n")}`);
    return { params: grounded.params, suggested: (f.suggested ?? []).filter((s) => typeof s === "string" && s.trim()).slice(0, 12) };
  } catch {
    return null;
  }
}

export type RouterPick = { id: string; reason: string };
export type Decision = {
  /** the router's outcome (mini is the default) */
  outcome?: Outcome;
  /** a Mini offered next to a reply */
  chip?: string;
  picks: RouterPick[];
  nothingFits: boolean;
  /** nothing fits and the ask wants something made: the new-build path */
  wantsNew: boolean;
  /** nothing fits: Muse's one-line reply */
  reply: string;
  confidence: number;
  /** the router said the recent chat names what the first pick needs (a fill that comes back empty is then suspect) */
  hasContent?: boolean;
  /** the router filled the first pick's params in the same call (MUSE_ONE_CALL=1) */
  inline?: boolean;
  params: Record<string, unknown> | null;
  suggested: string[];
  ms: number;
  cached: boolean;
  model: string;
};

/** The router model for a main model: MUSE_ROUTER_MODEL, else the fast one of the same provider. Null for replay. */
export function routerModelFor(main: ModelClient): ModelClient | null {
  const cfg = process.env.MUSE_ROUTER_MODEL ?? (main.id.startsWith("muse") ? "muse:muse-ember-1.0" : "");
  if (!cfg || cfg === "replay" || cfg === "off") return null;
  return makeModel(cfg);
}

const decisions = new Map<string, Decision>();
const LOG = join(CACHE_DIR, "router.jsonl");

function parse<T>(text: string): T {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
}

/** Ask the router. Never throws: a failed call is "no decision" (picks empty). */
export async function route(req: Pick<GenerateRequest, "ask" | "chat" | "members" | "surface">, model: ModelClient, opts: { fill?: boolean; filler?: ModelClient; cards?: Card[] } = {}): Promise<Decision> {
  const filler = opts.filler ?? model;
  const cards = opts.cards ?? catalog();
  const key = hashOf({ cards: opts.cards ? opts.cards.map((c) => `${c.id}:${c.use.join("|")}:${c.dont.join("|")}:${c.summary}`) : undefined, ask: req.ask, chat: req.chat.messages.slice(-30), members: req.members.map((m) => m.name), surface: req.surface, model: model.id, filler: filler.id, fill: opts.fill !== false });
  const hit = process.env.MUSE_NO_CACHE ? undefined : decisions.get(key);
  if (hit) return { ...hit, cached: true, ms: 0 };
  const t0 = performance.now();
  const known = new Set(cards.map((c) => c.id));
  let d: Decision = { picks: [], nothingFits: false, wantsNew: false, reply: "", confidence: 0, params: null, suggested: [], ms: 0, cached: false, model: model.id };
  // a mention with no ask never reaches the model, and never makes anything
  const bare = greeting(req.ask);
  if (bare !== null) {
    d = { ...d, outcome: "greet", nothingFits: true, reply: bare, confidence: 1 };
    d.ms = Math.round(performance.now() - t0);
    log({ ask: req.ask, outcome: "greet", ms: d.ms });
    return d;
  }
  try {
    const r = parse<{ outcome: Outcome; reply?: string; chip?: string; confidence: number; chat_has_content?: boolean; params_json?: string; suggested?: string[]; picks: RouterPick[] }>(
      await model.complete({ label: "router", system: routerSystem(cards), messages: [{ role: "user", content: routerUser(req) }], json: { name: "router", schema: pickSchema() }, effort: routerEffort(model) }),
    );
    let outcome: Outcome = OUTCOMES.includes(r.outcome) ? r.outcome : "mini";
    const picks = (r.picks ?? []).filter((p) => known.has(p.id)).slice(0, 3);
    // a Mini with no usable pick is a new Mini, never a decline
    if (outcome === "mini" && !picks.length) outcome = "new_mini";
    d.outcome = outcome;
    d.picks = outcome === "mini" ? picks : [];
    d.nothingFits = outcome !== "mini";
    d.wantsNew = outcome === "new_mini";
    // a reply outcome with no words falls back to that outcome's own line
    d.reply = outcome === "mini" || outcome === "new_mini" ? "" : cleanReply(String(r.reply ?? "")) || REPLY_LINE[outcome];
    d.chip = (outcome === "answer" || outcome === "cant_act") && r.chip && known.has(r.chip) ? r.chip : "";
    d.confidence = Number(r.confidence) || 0;
    d.hasContent = r.chat_has_content === true;
    // one call: the router filled the first pick's params itself (a simple Mini, high confidence)
    const first = cards.find((c) => c.id === d.picks[0]?.id);
    if (oneCall() && d.picks[0] && first && first.skeleton.length <= SIMPLE_MAX && d.confidence >= 0.8 && r.params_json?.trim()) {
      try {
        const p = JSON.parse(r.params_json) as unknown;
        if (p && typeof p === "object" && !Array.isArray(p)) {
          d.params = groundQuotes(p as Record<string, unknown>, `${req.chat.title ?? ""}\n${lines(req)}\n${req.ask}\n${req.members.map((m) => m.name).join("\n")}`).params;
          d.suggested = (r.suggested ?? []).filter((x) => typeof x === "string" && x.trim()).slice(0, 12);
          d.inline = true;
        }
      } catch {}
    }
    if (d.picks[0] && opts.fill !== false && !d.params) {
      const f = await fillLab(req, d.picks[0].id, filler);
      d.params = f?.params ?? null;
      d.suggested = f?.suggested ?? [];
    }
  } catch (e) {
    d = { ...d, picks: [], nothingFits: false, wantsNew: false, reply: "" };
    log({ ask: req.ask, error: (e as Error).message.slice(0, 200), model: model.id });
  }
  d.ms = Math.round(performance.now() - t0);
  if (d.picks.length || d.nothingFits) decisions.set(key, d);
  log({ ask: req.ask, surface: req.surface, outcome: d.outcome, picks: d.picks, nothingFits: d.nothingFits, confidence: d.confidence, filled: !!d.params, ms: d.ms, model: model.id });
  return d;
}

/** A reply outcome's own line, when the model gave none. One per reason; no two reasons share one. */
export const REPLY_LINE: Record<Exclude<Outcome, "mini" | "new_mini">, string> = {
  answer: "I don't know that one",
  cant_act: "I can't do that from here",
  wont: "I won't do that one",
  greet: "Hey. Ask me to make something for the group, like a vote or a plan",
};

const cleanReply = (s: string) => s.replace(/!+/g, ".").replace(/\s+/g, " ").trim().slice(0, 240);

/** A mention with no ask (bare "muse", hi, thanks, lol): one friendly line. Null when there is an ask. */
export function greeting(ask: string): string | null {
  const t = ask.toLowerCase().replace(/^\s*@?muse\b[\s,:.!?]*/, "").replace(/[\s.!?,…]+$/g, "").trim();
  if (!t || /^[?.!…]+$/.test(t)) return "I'm here. Ask me to make something for the group, like a vote or a plan";
  if (/^(hi+|hey+|hello|yo+|sup|good (morning|night|evening|afternoon)|morning|gm|gn)( muse)?$/.test(t)) return "Hey. Ask me when the group needs something made";
  if (/^(thanks|thank you|thx|ty|appreciate it)( muse)?$/.test(t)) return "Anytime";
  if (/^(lol|lmao|lmfao|haha+|ok|okay|k|nice|cool|😂+|💀+|😭+)$/.test(t)) return "I'm here when you need something made";
  if (/^(you there|are you there|u there|you up|are you awake)$/.test(t)) return "I'm here. What should I make?";
  if (/^(help|help me|help pls|help please)$/.test(t)) return "Tell me what the group needs and I'll make it";
  return null;
}

/** The catalog Minis whose words overlap the ask most (no model): for the misses log. */
export function nearest(ask: string, n = 3, cards = catalog()): string[] {
  const stop = new Set("muse the a an and or for us to of in on me my we our it this that make can you please what who how is are".split(" "));
  const ws = (s: string) => new Set((s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !stop.has(w)).map((w) => w.replace(/s$/, "")));
  const q = ws(ask);
  return cards
    .map((c) => {
      const cw = ws(`${c.id.replace(/-/g, " ")} ${c.name} ${c.summary} ${c.use.join(" ")}`);
      return { id: c.id, score: [...q].filter((w) => cw.has(w)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.id);
}

/** Record which pick was used (or that none passed) next to the decision. */
export function logChosen(ask: string, chosen: string | null, why: string) {
  log({ ask, chosen, why });
}

function log(entry: Record<string, unknown>) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    // logging never breaks a build
  }
}

/** A pick as a lab tool with loose params (the tool's own shape, not a schema coercion that drops fields). */
export function pickLab(id: string): Piece | null {
  const lab = labPiece(id);
  return lab ? { ...lab, params: {} } : null;
}

/** A fill over the tool's empty shape: a key the fill left out arrives empty, never with the example's content. */
export function shaped(id: string, params: Record<string, unknown>): Record<string, unknown> {
  return overShape(labExample(id), params);
}

/** The router's picks as lab tools, in order, with the first one's fill. Later picks are filled when tried (generate.ts). Never an example. */
export function routerChoices(d: Decision): { lab: Piece; id: string; params: Record<string, unknown> | null; why: string }[] {
  const out: { lab: Piece; id: string; params: Record<string, unknown> | null; why: string }[] = [];
  for (const [i, p] of d.picks.entries()) {
    const lab = pickLab(p.id);
    if (lab) out.push({ lab, id: p.id, params: i === 0 && d.params && !oneItemList(d.params) ? shaped(p.id, d.params) : null, why: p.reason });
  }
  return out;
}

export { SURFACE };
