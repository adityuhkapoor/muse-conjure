// Lab first: the tools in library/lab look far better than the plain pieces in library/pieces, so
// when the route lands on a piece, the lab tool that supersedes it is filled from the same params
// and the chat, and used instead. The piece is the fallback when the lab tool's essential fields
// cannot be filled from this chat (never another group's sample names). No model call: the
// mapping is the same for muse and replay. The table lives in library/SUPERSEDED.md.

import { labPiece, type Piece } from "@muse/library";
import type { GenerateRequest } from "./types.ts";

type Ctx = Pick<GenerateRequest, "ask" | "chat" | "members">;
/** Lab params from the piece's params and the chat, or null when the essential fields are not there. */
type Adapter = (params: Record<string, unknown>, ctx: Ctx) => Record<string, unknown> | null;

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : []);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A place name short enough for a reel: "Taco truck on College Ave (open til 11)" -> "Taco truck". */
export function shortLabel(label: string, max = 24): string {
  let s = label.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (s.length > max) s = s.split(/\s+(?:on|at|in|near|by|from|with)\s+|\s+[-–—·,]\s+|,\s*/i)[0]!.trim();
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, "").trim() || s.slice(0, max);
  return s;
}

const FOOD = /\b(eat|eating|dinner|lunch|brunch|breakfast|food|hungry|restaurant|sushi|thai|taco|tacos|pizza|ramen|burger|burgers|bbq|pho|curry|dumpling|dumplings|noodles|cafe|takeout|order|grab)\b/i;

function aboutFood(params: Record<string, unknown>, ctx: Ctx): boolean {
  const text = [str(params.title), ctx.ask, ...ctx.chat.messages.slice(-12).map((m) => m.text)].join(" ");
  return FOOD.test(text);
}

const isMember = (label: string, ctx: Ctx) => {
  const l = label.toLowerCase();
  return ctx.members.some((m) => m.name.toLowerCase() === l || m.name.split(/\s+/)[0]!.toLowerCase() === l);
};

// --- Reading a "what are we doing tonight" chat: places, drinks, when to leave, who ruled what out.

type Kind = "where" | "drinks" | "leave";
const TIME = /^\d{1,2}(?::\d\d)?\s?(?:am|pm)?$/i;
const DRINK = /\$|\b(byob|beers?|pbr|wells?|drafts?|cocktails?|shots?|wine|seltzers?|pregame|margs?|pitchers?)\b/i;
const ACRONYM: Record<string, string> = { byob: "BYOB", pbr: "PBR", ipa: "IPA" };
const DEFER = /\b(idk|dunno|u pick|you pick|no u|anything works|whatever works|up to you|ur call)\b/i;
const TAIL = /\s+(?:lol|lmao|tbh|ngl|haha|again|then|tho|pls)$/i;

const kindOf = (label: string): Kind => (TIME.test(label) ? "leave" : DRINK.test(label) ? "drinks" : "where");

/** One option as written in the chat -> a reel label, or "" when it is not an option. */
function optionLabel(raw: string): string {
  let s = raw.toLowerCase().replace(/[?!…]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.split(/[,;]|\s+[-–—]\s+/)[0]!.trim();
  s = s.replace(/^(?:the|maybe|what about|how about|leave|head out|back|home)\s+(?:at|by\s+)?/i, "").replace(/^(?:the|at|by)\s+/i, "");
  while (TAIL.test(s)) s = s.replace(TAIL, "");
  if (!s || VERBY.test(s) || s.split(" ").length > 6 || /muse/i.test(s)) return "";
  const k = kindOf(s);
  if (k === "leave") return s.replace(/\s+/g, "");
  if (k === "drinks") {
    s = s.split(/\s+(?:at|on|from|in)\s+/)[0]!;
    return s.replace(/\b[a-z]+\b/g, (w) => ACRONYM[w] ?? w).slice(0, 24);
  }
  return title(shortLabel(s));
}

/** "im broke" from Jonah -> "Jonah's broke"; anything longer -> just the name. */
function because(name: string, reason: string): string {
  const r = reason.toLowerCase().replace(/[.!?]+$/, "").trim();
  const m = /^(?:im|i'm|i am)\s+(.+)$/.exec(r);
  const line = m ? `${name}'s ${m[1]}` : r && r.split(" ").length <= 3 ? `${name} ${r}` : name;
  return line.length <= 20 ? line : name;
}

export type NightPlan = { title: string; why: string; reels: { name: string; options: { label: string; vetoed: boolean }[] }[]; rules: { text: string; who: string }[]; rest: number[] };

/** The slot machine's whole params from the chat, or null when it names fewer than two places. */
export function nightPlan(ctx: Ctx, placesHint: string[] = []): NightPlan | null {
  const msgs = ctx.chat.messages.slice(-24);
  const reels: Record<Kind, { label: string; vetoed: boolean }[]> = { where: [], drinks: [], leave: [] };
  const rules: { text: string; who: string }[] = [];
  const add = (label: string, vetoed = false) => {
    if (!label) return;
    const r = reels[kindOf(label)];
    const hit = r.find((o) => o.label.toLowerCase() === label.toLowerCase());
    if (hit) hit.vetoed ||= vetoed;
    else if (r.length < 8) r.push({ label, vetoed });
  };
  for (const h of placesHint) add(title(shortLabel(h.toLowerCase())));
  let defers = 0;
  for (const m of msgs) {
    if (DEFER.test(m.text)) defers++;
    // one message can hold a question and an answer: "drinks after? $3 wells or byob"
    for (const seg of m.text.split(/[?.]\s+/)) {
      const text = seg.trim();
      const veto = /^(?:not|no|anything but|skip|never)\s+(?:the\s+)?([^,]+?)(?:\s+again)?(?:,\s*(.+))?$/i.exec(text);
      if (veto) {
        const label = optionLabel(veto[1]!);
        if (label) {
          add(label, true);
          const who = ctx.members.find((x) => x.name.toLowerCase() === m.from.toLowerCase() || x.id === m.from)?.name ?? m.from;
          if (rules.length < 4) rules.push({ text: veto[1]!.toLowerCase().replace(/\s+again$/, "").slice(0, 20), who: because(who, veto[2] ?? "") });
          continue;
        }
      }
      if (!/(^|\s)or\s/i.test(text)) continue;
      for (const part of text.split(/(?:^|\s+)or\s+/i)) add(optionLabel(part));
    }
  }
  const allowed = (r: { vetoed: boolean }[]) => r.filter((o) => !o.vetoed).length;
  if (reels.where.length < 2 || allowed(reels.where) < 1) return null;
  if (reels.where.filter((o) => isMember(o.label, ctx)).length >= 2) return null;
  const out: NightPlan["reels"] = [{ name: "Where", options: reels.where }];
  if (reels.drinks.length >= 2 && allowed(reels.drinks)) out.push({ name: "Drinks", options: reels.drinks });
  if (reels.leave.length >= 2 && allowed(reels.leave)) out.push({ name: "Leave at", options: reels.leave });
  const food = aboutFood({}, ctx);
  return {
    title: out.length > 1 ? "Tonight's plan" : food ? "Where are we eating?" : "Muse picks",
    why: defers >= 2 ? `“idk u pick” ×${defers} · rigged by the chat` : rules.length ? "Rigged by the chat" : `${reels.where.length} from the chat · Muse spins it`,
    reels: out,
    rules,
    // rest on a place nobody ruled out, one down from the top so the reel reads as a reel
    rest: out.map((r) => {
      const ok = r.options.map((o, i) => (o.vetoed ? -1 : i)).filter((i) => i >= 0);
      return ok[Math.min(1, ok.length - 1)] ?? 0;
    }),
  };
}

/** wheel -> slot-machine: the chat's places (and drinks and times when it has them). Not for people or turn order. */
const wheelToSlot: Adapter = (p, ctx) => {
  if (p.noRepeat === true) return null;
  const plan = nightPlan(ctx, strs(p.options));
  if (!plan) return null;
  return str(p.title) && plan.reels.length === 1 ? { ...plan, title: str(p.title) } : plan;
};

/** veto -> dinner-veto: places to eat, one veto each. Distance, price and stars stay unknown (not shown). */
const vetoToDinner: Adapter = (p, ctx) => {
  const options = strs(p.options).map((o) => shortLabel(o, 32));
  if (options.length < 2 || options.length > 6 || (typeof p.vetoesEach === "number" && p.vetoesEach !== 1)) return null;
  if (!aboutFood(p, ctx)) return null;
  return {
    title: str(p.title) || "Where are we eating?",
    time: "",
    leaveBy: "",
    spots: options.map((name) => ({ name, kind: "", price: "", miles: 0, stars: 0 })),
    vetoes: [],
    passed: [],
  };
};

/** settle -> settle-up: each shared cost becomes one IOU per person who owes the payer. */
const settleToSettleUp: Adapter = (p, ctx) => {
  const ious: { from: string; to: string; cents: number; why: string }[] = [];
  const everyone = ctx.members.map((m) => m.name);
  for (const raw of Array.isArray(p.ious) ? p.ious : []) {
    const i = raw as { paidBy?: unknown; label?: unknown; cents?: unknown; forWho?: unknown };
    const payer = str(i.paidBy);
    const cents = typeof i.cents === "number" ? Math.round(i.cents) : 0;
    if (!payer || cents <= 0) continue;
    const who = strs(i.forWho).length ? strs(i.forWho) : everyone;
    const share = Math.round(cents / Math.max(1, who.length));
    for (const w of who) if (w.toLowerCase() !== payer.toLowerCase() && share > 0) ious.push({ from: w, to: payer, cents: share, why: str(i.label).slice(0, 20) || "shared" });
  }
  if (!ious.length || ious.length > 20) return null;
  return { title: str(p.title) || "Settle up", ious };
};

/** assign -> chore-draft: the chat's chores, drafted in turn by everyone in the chat, equal points. */
const assignToDraft: Adapter = (p, ctx) => {
  const chores = strs(p.tasks).map((t) => shortLabel(t, 20));
  if (chores.length < 2 || chores.length > 8 || ctx.members.length < 2) return null;
  return {
    title: str(p.title) || "Chore draft",
    sub: `${chores.length} chores · ${ctx.members.length} people`,
    chores: chores.map((name) => ({ name, pts: 3, note: "" })),
    order: ctx.members.map((m) => m.name),
    picks: [],
  };
};

const dollars = (s: string) => [...s.matchAll(/\$\s?(\d[\d,]*(?:\.\d\d)?)/g)].map((m) => Math.round(Number(m[1]!.replace(/,/g, "")) * 100));

/** rate -> price-check: "Is $120 fair for the green velvet loveseat?" with a sold range in the detail. */
const rateToPrice: Adapter = (p) => {
  const title = str(p.title);
  const detail = str(p.detail);
  if (!/fair|worth|price|offer|overpriced|deal/i.test(title)) return null;
  const ask = dollars(title)[0];
  const sold = dollars(detail);
  if (!ask || sold.length < 2) return null;
  const item = /\bfor (?:the |a |an |this |that )?(.+?)\??$/i.exec(title)?.[1]?.trim();
  if (!item) return null;
  const lo = Math.min(...sold);
  const hi = Math.max(...sold);
  const near = /\bnear ([^.,;]+)/i.exec(detail)?.[1]?.trim();
  return {
    item: item.charAt(0).toUpperCase() + item.slice(1),
    listed: near ? `listed in ${near}` : "",
    seller: "",
    askCents: ask,
    comps: [
      { label: "Lowest sold", cents: lo },
      { label: "Highest sold", cents: hi },
    ],
    fairLowCents: lo,
    fairHighCents: hi,
    pins: [],
    quote: "",
    pickup: "",
  };
};

/** Who in the chat said something like this item, and what they said: the item's "who" and "quote". */
function saidBy(label: string, ctx: Ctx): { who: string; quote: string } {
  const w = label.toLowerCase().split(/\s+/)[0] ?? "";
  const m = [...ctx.chat.messages].reverse().find((x) => w.length > 2 && x.text.toLowerCase().includes(w));
  const who = m ? (ctx.members.find((x) => x.name.toLowerCase() === m.from.toLowerCase() || x.id === m.from)?.name ?? "") : "";
  return { who, quote: m && who ? m.text.toLowerCase().slice(0, 30) : "" };
}

/** list -> grocery: the chat's items, who asked and how they put it. */
const listToGrocery: Adapter = (p, ctx) => {
  const items = (Array.isArray(p.items) ? p.items : []).map((x) => x as { label?: unknown; urgent?: unknown }).filter((x) => str(x.label));
  if (items.length < 2) return null;
  return {
    title: str(p.title) || ctx.chat.title || "Groceries",
    messages: ctx.chat.messages.length,
    begging: saidBy(str(items[0]!.label), ctx).who || ctx.members[0]?.name || "",
    items: items.slice(0, 8).map((x) => ({ name: str(x.label).slice(0, 24), qty: "", ...saidBy(str(x.label), ctx), urgency: x.urgent === true ? 3 : 1, priceCents: 0 })),
  };
};

const KINDS = ["turkey", "mac", "chips", "drinks", "pie", "salad", "ice", "cups"];
/** claims -> bring-list: the chat's items, nobody on them yet. */
const claimsToBring: Adapter = (p, ctx) => {
  const items = (Array.isArray(p.items) ? p.items : []).map((x) => str((x as { label?: unknown }).label)).filter(Boolean);
  if (items.length < 2) return null;
  const kind = (l: string) => KINDS.find((k) => l.toLowerCase().includes(k === "mac" ? "mac" : k.replace(/s$/, ""))) ?? "other";
  return { title: str(p.title) || "Bring list", sub: `${ctx.members.length} in the chat`, items: items.slice(0, 10).map((label) => ({ label: label.slice(0, 24), kind: kind(label), by: [] })) };
};

/** bracket -> movie-bracket: 4 or 8 entries, each with who brought it up in the chat. */
const bracketToMovies: Adapter = (p, ctx) => {
  const entries = strs(p.entries);
  if (entries.length !== 4 && entries.length !== 8) return null;
  return { when: "", where: str(p.title), movies: entries.map((title) => ({ title: title.slice(0, 28), by: saidBy(title, ctx).who, quote: saidBy(title, ctx).quote })), picks: [] };
};

/** bracket -> bracket-post: the neutral 8-spot bracket (initials, no food art) for anything that is not a film pick. */
const bracketToPost: Adapter = (p) => {
  const entries = strs(p.entries);
  if (entries.length !== 8 || /\b(movies?|films?|watch|trailers?)\b/i.test(`${str(p.title)} ${entries.join(" ")}`)) return null;
  return { title: (str(p.title) || "Bracket").slice(0, 48), left: "", kind: "initials", teams: entries.map((name) => ({ name: name.slice(0, 20) })), quarters: [0, 0, 0, 0], semis: [[0, 0], [0, 0]], final: [0, 0], people: [] };
};

/** poll -> after-vote as a plain poll: 2 to 4 options, no clock. */
const pollToAfter: Adapter = (p) => {
  const options = strs(p.options);
  if (options.length < 2 || options.length > 4) return null;
  // an option Muse proposed (the fill's "suggested" list) says so in its meta line
  const said = new Set(strs(p.suggested).map((x) => x.toLowerCase()));
  return { title: str(p.title) || "Vote", when: "", clock: "", ends: "", meetAt: "", options: options.map((name) => ({ name: name.slice(0, 28), meta: said.has(name.toLowerCase()) ? "Suggested" : "", plan: "", icon: "", voters: [] })) };
};

/** split -> tab-claim: the bill's items with prices, the payer from the chat. */
const splitToTab: Adapter = (p, ctx) => {
  const items = (Array.isArray(p.items) ? p.items : []).map((x) => x as { label?: unknown; cents?: unknown }).filter((x) => str(x.label) && typeof x.cents === "number" && x.cents > 0);
  const payer = ctx.members.find((m) => m.name.toLowerCase() === str(p.payer).toLowerCase())?.name;
  if (items.length < 2 || !payer) return null;
  return { place: str(p.title) || "The bill", payer, tipBps: 2000, items: items.slice(0, 12).map((x) => ({ label: str(x.label).slice(0, 24), priceCents: Math.round(x.cents as number), claimedBy: "" })) };
};

/** lock -> squad-lock: the chat's own title and detail, nobody going yet, locking at the chat's number (else everyone, 2 to 12). */
const lockToSquad: Adapter = (p, ctx) => {
  const title = str(p.title) || "Who's in";
  const need = typeof p.need === "number" && p.need > 0 ? p.need : ctx.members.length;
  return { title: title.slice(0, 40), sub: str(p.detail).slice(0, 60), date: "", tickets: "", host: "", threshold: Math.max(2, Math.min(12, Math.round(need))), going: [], maybe: [] };
};

/** piece id -> lab tools to try, best first. The full table, with pieces no lab tool covers yet: library/SUPERSEDED.md. */
export const SUPERSEDES: Record<string, { lab: string; adapt: Adapter }[]> = {
  wheel: [{ lab: "slot-machine", adapt: wheelToSlot }],
  veto: [{ lab: "dinner-veto", adapt: vetoToDinner }],
  settle: [{ lab: "settle-up", adapt: settleToSettleUp }],
  assign: [{ lab: "chore-draft", adapt: assignToDraft }],
  rate: [{ lab: "price-check", adapt: rateToPrice }],
  list: [{ lab: "grocery", adapt: listToGrocery }],
  claims: [{ lab: "bring-list", adapt: claimsToBring }],
  bracket: [{ lab: "bracket-post", adapt: bracketToPost }, { lab: "movie-bracket", adapt: bracketToMovies }],
  poll: [{ lab: "after-vote", adapt: pollToAfter }],
  split: [{ lab: "tab-claim", adapt: splitToTab }],
  lock: [{ lab: "squad-lock", adapt: lockToSquad }],
};

// No example fallback: a lab tool is only ever shown filled from this chat. Its example.ts is a
// shape reference (leak.ts `overShape`, `emptyShape`), never content with this chat's names.

/** A lab tool's example.ts (a shape reference only), or null. */
export function labExample(id: string): Record<string, unknown> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(`../../../library/lab/${id}/example.ts`) as { default?: Record<string, unknown> };
    return mod.default ? (JSON.parse(JSON.stringify(mod.default)) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type LabPick = { lab: Piece; params: Record<string, unknown> };

/** The lab tool that takes over from this piece for this chat, filled from the chat, or null. */
export function supersede(pieceId: string, params: unknown, ctx: Ctx): LabPick | null {
  return labChoices(pieceId, params, ctx)[0] ?? null;
}

/** Every lab tool to try for this piece, best first, each filled from the chat. None when the chat lacks the essentials. */
export function labChoices(pieceId: string, params: unknown, ctx: Ctx): LabPick[] {
  const picks: LabPick[] = [];
  const p = (typeof params === "object" && params !== null ? params : {}) as Record<string, unknown>;
  for (const s of SUPERSEDES[pieceId] ?? []) {
    const lab = labPiece(s.lab);
    if (!lab) continue;
    let out: Record<string, unknown> | null = null;
    try {
      out = s.adapt(p, ctx);
    } catch {
      out = null;
    }
    // loose params: the tool's own example shape, not a schema coercion that can drop fields
    if (out) picks.push({ lab: { ...lab, params: {} }, params: out });
  }
  return picks;
}

// Fast lane: asks that a lab tool answers with params read straight from the chat, before any
// model call (about a second instead of five). Only when the essential fields are in the chat;
// otherwise the model routes as before and the supersede table above still applies.

const PICK_ASK = /\b(pick for us|pick one for us|(?:u|you) (?:pick|choose|decide)|choose for us|decide for us|spin (?:for it|the wheel)|just pick)\b/i;
const VERBY = /\b(is|are|was|were|have|has|do|does|dont|don't|cant|can't|im|i'm|not|we|you|u|i|it|that|this|they|should|would|could|will|need|want|think|had|been)\b/i;

const title = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** "thai basil or sushi ko", "or the taco truck on college ave, open til 11" -> place names, in order. */
export function orOptions(messages: { text: string }[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of messages.slice(-8)) {
    const text = m.text.trim();
    if (!/(^|\s)or\s/i.test(text)) continue;
    for (let part of text.split(/(?:^|\s+)or\s+/i)) {
      part = part.split(/[,;]|\s+[-–—]\s+/)[0]!.replace(/[?!.…]+/g, " ").replace(/^\s*(?:the|maybe|what about|how about)\s+/i, "").replace(/\s+/g, " ").trim();
      if (!part || VERBY.test(part) || part.split(" ").length > 5 || /muse/i.test(part)) continue;
      const label = title(shortLabel(part.toLowerCase()));
      if (label.length < 3 || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      out.push(label);
    }
  }
  return out;
}

/**
 * The keyword lane: tools filled entirely from the chat's own words, no model. Today that is the
 * slot machine for "pick for us" over "x or y" lines. Nothing else answers here: a tool the chat
 * cannot fill by itself goes to the router, or offline to a plain reply.
 */
export function fastLabs(req: Pick<GenerateRequest, "ask" | "chat" | "members">): (LabPick & { why: string })[] {
  if (!PICK_ASK.test(req.ask)) return [];
  const plan = nightPlan(req);
  const lab = labPiece("slot-machine");
  if (!plan || !lab) return [];
  return [{ lab, params: plan, why: `${plan.reels.map((r) => `${r.options.length} ${r.name.toLowerCase()}`).join(", ")} and ${plan.rules.length} vetoes from the chat` }];
}

/** The keyword lane's first choice for this ask, or null. */
export function fastLab(req: Pick<GenerateRequest, "ask" | "chat" | "members">): (LabPick & { why: string }) | null {
  return fastLabs(req)[0] ?? null;
}
