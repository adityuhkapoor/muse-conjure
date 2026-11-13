// Grounding for a lab tool filled live from a chat. Builds on the leak check (leak.ts): that one
// catches the example's own content; this one catches content nobody in this chat said.
//
//   problems(id, params, g)  what in a fill is not from this chat: people who are not members,
//                            amounts that are not in the chat or a sum, split or multiple of one,
//                            places, options and dates nobody wrote, and the example's leftovers.
//                            Strings the model listed as `suggested` may be new options (never
//                            new people).
//   strip(params, problems)  the fill with those parts taken out (the list entry that holds one,
//                            else the string emptied).
//   honestStart(id, params)  the true starting state of a live answer: nobody has voted, claimed,
//                            paid, joined, ranked, bet or spun unless their own message says so.
//
// Seeded demo pages and pre-written chats are not run through this; they arrive in progress on
// purpose (services/demo/seed-catalysts.ts, rich.ts).

import { emptyShape, leaks, strings } from "./leak.ts";
import type { GenerateRequest } from "./types.ts";

export type Ground = { members: string[]; context: string; suggested?: string[]; messages?: { from: string; text: string }[]; title?: string; ask?: string; loose?: boolean };
export type Problem = { path: (string | number)[]; value: string; why: string };

/** Everything a live fill may draw on: the ask, the chat's title and lines, the members. */
export function groundOf(req: Pick<GenerateRequest, "ask" | "chat" | "members">, suggested: string[] = []): Ground {
  return {
    members: req.members.map((m) => m.name),
    context: [req.ask, req.chat.title ?? "", ...req.chat.messages.map((m) => `${m.from}: ${m.text}`), ...req.members.map((m) => m.name)].join("\n"),
    suggested,
    messages: req.chat.messages,
    title: req.chat.title ?? "",
    ask: req.ask,
  };
}

const PERSON_KEY = /^(name|names|by|who|from|to|payer|host|buyer|seller|recipient|driver|claimedBy|user|people|crew|paid|agree|maybe|want|going|passed|riders|opened|holders|owners|voters|players|members|author|owner|guest|guests|begging|order|captain|lead|assignee|owes|winner)$/i;
const SKIP_KEY = /^(icon|kind|cat|emoji|color|colour|tone|theme|mode|style|shape|seat|side|id|key|type|unit|noun|surface|tier|tiers|tag|tags|font|accent|bg|image|img|photo|url|href|src)$/i;
const MONEY_KEY = /(cents|price|amount|cost|rent|total|fee|budget|dollars|usd|owed|share)$/i;
const TIMES_KEY = /^(times|slots|hours|days|day|weekdays)$/i;
const STARTERS = new Set(
  "The A An And But Or So If When Where What Who Why How This That These Those It Its We You I My Our Your Their His Her Not No Yes Just Only Also All Every Each Any Some One Two Three Four Five Six Seven Eight Nine Ten Next Last First Best Most More Less Then Now Today Tonight Tomorrow Mon Tue Wed Thu Fri Sat Sun Monday Tuesday Wednesday Thursday Friday Saturday Sunday Jan Feb Mar Apr May Jun Jul Aug Sep Sept Oct Nov Dec January February March April June July August September October November December AM PM Muse Vote Pick Split Spin Draw Add Who Done Total Round Team Week Day Night".split(" "),
);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const low = (s: string) => s.toLowerCase();
const words = (s: string) => low(s).match(/[a-zÀ-ɏ][a-zÀ-ɏ'’]*/g) ?? [];

function memberOf(name: string, members: string[]): boolean {
  const n = low(name.replace(/[’']s\b.*$/, "").trim());
  if (!n) return true;
  return members.some((m) => low(m) === n || low(m).split(/\s+/)[0] === n || n.split(/\s+/)[0] === low(m).split(/\s+/)[0]);
}

/** Numbers written in the chat, as plain values ("$1,240" -> 1240, "1.2k" -> 1200, "45" -> 45). */
function chatNumbers(ctx: string): number[] {
  const out: number[] = [];
  for (const m of ctx.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/gi)) {
    const v = Number(m[1]!.replace(/,/g, "")) * (m[2] ? 1000 : 1);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return [...new Set(out)].slice(0, 60);
}

/** Every amount the chat's numbers lead to, loosely (a change works from the tool's own numbers too): each one, their sum, and either split or multiplied by 1 to 12 or the head count. */
function derivable(nums: number[], heads: number): number[] {
  const base = [...nums, nums.reduce((a, b) => a + b, 0)];
  for (let i = 0; i < nums.length && i < 20; i++) for (let j = i + 1; j < nums.length && j < 20; j++) base.push(nums[i]! + nums[j]!, Math.abs(nums[i]! - nums[j]!));
  const ks = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, heads, heads + 1, Math.max(1, heads - 1)]);
  const out: number[] = [];
  for (const b of base) for (const k of ks) out.push(b / k, b * k);
  return out;
}

const near = (x: number, set: number[]) => set.some((d) => Math.abs(x - d) <= Math.max(1, Math.abs(d) * 0.02));

const MONEY_TAIL = /(cents|price|amount|cost|fee|total|dollars|usd|owed|share|budget)$/i;
const LABEL_KEYS = /^(name|label|title|item|what|why|for|note|desc|description|text|place|option|reason)$/i;
const FILLER = new Set("the and for each per with from this that your our into over than then also just have has had are was were not you all one two".split(" "));

/** The key words an amount hangs on: "bathCents" gives "bath", plus the words of the item's own name ("airbnb"). */
function amountWords(key: string, owner: Record<string, unknown> | null): string[] {
  let k = key;
  for (let i = 0; i < 3; i++) k = k.replace(MONEY_TAIL, "");
  const out = (k.replace(/([a-z])([A-Z])/g, "$1 $2").match(/[A-Za-z]+/g) ?? []).map(low);
  for (const [name, x] of Object.entries(owner ?? {})) if (LABEL_KEYS.test(name) && typeof x === "string") out.push(...words(x));
  return [...new Set(out.filter((w) => w.length >= 3 && !FILLER.has(w)).map((w) => w.slice(0, 4)))];
}

/**
 * Why a money amount in a first fill is not from the chat; null when it is. The amount is a number
 * somebody wrote (in a message, the title or the ask), or an equal split of one among 2 to the
 * group's head count; and that number sits in a message about the same item (the item's key word is
 * in the same message or the one before). Nothing else: no sums, differences or multiples.
 */
function amountProblem(dollars: number, shown: string, key: string, owner: Record<string, unknown> | null, g: Ground): string | null {
  const lines = [...(g.title ? [g.title] : []), ...(g.messages ?? []).map((m) => `${m.from}: ${m.text}`), ...(g.ask ? [g.ask] : [])].map(low);
  const heads = Math.max(2, g.members.length);
  const hits: number[] = [];
  lines.forEach((t, i) => {
    for (const n of chatNumbers(t)) {
      const exact = Math.abs(dollars - n) <= 0.01;
      const split = n > dollars && Array.from({ length: heads - 1 }, (_, j) => j + 2).some((k) => Math.abs(dollars - n / k) <= 0.51);
      if (exact || split) hits.push(i);
    }
  });
  if (!hits.length) return `the amount ${shown} is not in the chat or an equal split of an amount in it`;
  const ws = amountWords(key, owner);
  if (ws.length && !hits.some((i) => [lines[i]!, lines[i - 1] ?? ""].some((t) => ws.some((w) => t.includes(w))))) return `the amount ${shown} is not in a message about ${ws[0]}`;
  return null;
}

/** Proper-noun runs in a string, skipping the sentence's first word ("Split at Thai Basil" -> "Thai Basil"). */
function properNouns(s: string): string[] {
  const out: string[] = [];
  for (const sentence of s.split(/(?<=[.!?·:;|—–])\s+|\s+[·|]\s+/)) {
    const ws = sentence.split(/\s+/).map((w) => w.replace(/[^A-Za-zÀ-ɏ'’&]/g, ""));
    const cap = (w: string | undefined) => !!w && /^[A-ZÀ-Þ][a-zß-ÿ][A-Za-zÀ-ɏ’']*$/.test(w) && !STARTERS.has(w);
    for (let i = 0; i < ws.length; i++) {
      if (!cap(ws[i])) continue;
      const start = i;
      const run = [ws[i]!];
      while (cap(ws[i + 1])) run.push(ws[++i]!);
      if (run.length >= 2 || (start > 0 && run[0]!.length >= 4)) out.push(run.join(" "));
    }
  }
  return out;
}

/** True when every word of 3+ letters in `phrase` is somewhere in the context. */
function wordsIn(phrase: string, ctxWords: Set<string>): boolean {
  return words(phrase)
    .map((w) => w.replace(/[’']s$/, ""))
    .filter((w) => w.length >= 3)
    .every((w) => ctxWords.has(w) || ctxWords.has(w.replace(/s$/, "")) || ctxWords.has(`${w}s`));
}

function dateIn(s: string, ctx: string): string | null {
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(s);
  if (!m) return null;
  const mon = low(m[1]!).slice(0, 3);
  const day = Number(m[2]);
  const c = low(ctx);
  const monthNamed = MONTHS.some((x) => x === mon) && new RegExp(`\\b${mon}[a-z]*\\.?,?\\s+${day}(?:st|nd|rd|th)?\\b`).test(c);
  const numeric = new RegExp(`\\b${MONTHS.indexOf(mon) + 1}/${day}\\b`).test(c);
  return monthNamed || numeric ? null : m[0];
}

function timeIn(s: string, ctx: string): string | null {
  const m = /\b(\d{1,2})(?::(\d\d))?\s?(am|pm)\b|\b(\d{1,2}):(\d\d)\b/i.exec(s);
  if (!m) return null;
  const h = m[1] ?? m[4]!;
  const mm = m[2] ?? m[5];
  const c = low(ctx);
  const ok = mm ? new RegExp(`\\b${h}:${mm}\\b`).test(c) || (mm === "00" && new RegExp(`\\b${h}\\s?(am|pm)?\\b`).test(c)) : new RegExp(`\\b${h}(:\\d\\d)?\\s?(am|pm|ish)?\\b`).test(c);
  return ok ? null : m[0];
}

/** What in a live fill is not from this chat. */
export function problems(id: string, params: Record<string, unknown>, g: Ground): Problem[] {
  const out: Problem[] = [];
  const ctx = g.context;
  const ctxWords = new Set(words(ctx).map((w) => w.replace(/[’']s$/, "")));
  // a suggested entry is the whole string, case and punctuation aside; a string that merely contains one is not
  const flat = (s: string) => low(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const sug = new Set((g.suggested ?? []).map(flat).filter(Boolean));
  const isSuggested = (s: string) => sug.has(flat(s));
  const amounts = derivable(chatNumbers(ctx), g.members.length);
  const leaked = new Set(leaks(id, params, ctx).map(low));

  const walk = (v: unknown, path: (string | number)[], key: string, under: string, owner: Record<string, unknown> | null = null): void => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, [...path, i], key, under, owner));
    if (v && typeof v === "object") return Object.entries(v).forEach(([k, x]) => walk(x, [...path, k], k, key || under, v as Record<string, unknown>));
    if (SKIP_KEY.test(key)) return;
    if (typeof v === "number") {
      if (MONEY_KEY.test(key) && v > 0) {
        const dollars = /cents$/i.test(key) ? v / 100 : v;
        const shown = /cents$/i.test(key) ? `$${(v / 100).toFixed(2)}` : String(v);
        const why = g.loose ? (near(dollars, amounts) ? null : `the amount ${shown} is not in the chat or worked out from it`) : amountProblem(dollars, shown, key, owner, g);
        if (why) out.push({ path, value: String(v), why });
      }
      return;
    }
    if (typeof v !== "string") return;
    const s = v.trim();
    if (!s) return;
    for (const l of leaked) if (low(s).includes(l)) out.push({ path, value: s, why: `"${s}" comes from another group's example` });
    // people: a person field names a member of this chat, or nobody
    // "name" is a person only inside a list of people (players, going, people), not a chore or a reel
    const personish = /^(name|names)$/i.test(key) ? PERSON_KEY.test(under) && !/^(name|names)$/i.test(under) : PERSON_KEY.test(key) || (PERSON_KEY.test(under) && !/^(name|names)$/i.test(under) && typeof path.at(-1) === "number");
    // a day or a clock time in a list under people ("Sun 7pm" free cells) is a time, not a person;
    // its time was checked above and its day is a weekday name, which "sunday" in the chat grounds
    const dayTime = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?(\s|$)|\d\s?(am|pm)\b|^\d{1,2}:\d\d/i.test(s);
    if (personish && !dayTime) {
      const first = s.split(/[\s,·]+/)[0]!;
      // from, to, with and for can be places too: those only when nobody in the chat wrote the word
      const loose = /^(from|to|with|for|order|about)$/i.test(key) && wordsIn(s, ctxWords);
      if (!loose && /^[A-Z]/.test(first) && s.split(/\s+/).length <= 4 && !memberOf(first, g.members) && !memberOf(s, g.members) && !/^(you|everyone|all|anyone|nobody|someone|muse|the group|us)$/i.test(first)) {
        out.push({ path, value: s, why: `${first} is not in this chat` });
        return;
      }
    }
    // a line that says the whole group is in or agreed is a fact about people: only when the chat says it
    const all = /\b(all (\d+|of us|of you)( of us)? (are |is )?(in|going|coming|down|agreed)|every(one|body)('s| is)? (in|going|coming|down|agreed)|we'?re all (in|going|down))\b/i.exec(s);
    if (all && !low(ctx).includes(low(all[0]))) return void out.push({ path, value: s, why: `"${all[0]}" is not something the chat says` });
    // dates and times must come from the chat even in a suggested string
    const d = dateIn(s, ctx);
    if (d) return void out.push({ path, value: s, why: `the date "${d}" is not in the chat` });
    if (!TIMES_KEY.test(key) && !TIMES_KEY.test(under)) {
      const t = timeIn(s, ctx);
      if (t) return void out.push({ path, value: s, why: `the time "${t}" is not in the chat` });
    }
    if (isSuggested(s)) return;
    if (dayTime && s.length <= 16) {
      // a short day-and-time cell: its day must be one the chat names ("Sun" for "sunday"), when it names any
      const d = /^(mon|tue|wed|thu|fri|sat|sun)/i.exec(s)?.[1]?.toLowerCase();
      if (!d || [...ctxWords].some((w) => w.startsWith(d))) return;
    }
    // places, options, names of things: every proper noun's words were written in the chat
    for (const n of properNouns(s)) {
      if (n.split(/\s+/).every((w) => memberOf(w, g.members))) continue;
      if (!wordsIn(n, ctxWords)) {
        out.push({ path, value: s, why: `"${n}" is not in the chat` });
        return;
      }
    }
    // a whole short label in a list of options is the chat's own words
    if (typeof path.at(-1) === "number" || /^(label|option|place|spot|dish|item|title|name|where|plan|entry|choice)$/i.test(key)) {
      if (/^(label|option|place|spot|dish|item|choice|entry)$/i.test(key) || (typeof path.at(-1) === "number" && !TIMES_KEY.test(key))) {
        if (s.length <= 32 && !/^[\d\s.:$%,/-]+$/.test(s) && !wordsIn(s, ctxWords) && !memberOf(s, g.members)) {
          out.push({ path, value: s, why: `"${s}" is not something anyone in the chat said (list it as suggested if it is your idea)` });
          return;
        }
      }
    }
  };
  walk(params, [], "", "");
  return out;
}

/** The fill with each problem taken out: the list entry holding it, else the string emptied (numbers zeroed). */
export function strip(params: Record<string, unknown>, ps: Problem[]): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
  const drops = new Map<unknown[], Set<number>>();
  for (const p of ps) {
    // an amount nobody gave is emptied in place (0), never the row that holds it
    if (/^the amount /.test(p.why)) {
      let o: unknown = out;
      for (const k of p.path.slice(0, -1)) o = o && typeof o === "object" ? (o as Record<string | number, unknown>)[k] : undefined;
      if (o && typeof o === "object") (o as Record<string | number, unknown>)[p.path.at(-1)!] = 0;
      continue;
    }
    // the outermost list entry under a top-level list (an IOU, an option) goes as a whole
    let parent: unknown = out;
    let listAt = -1;
    for (let i = 0; i < p.path.length - 1; i++) {
      if (Array.isArray(parent) && listAt < 0) listAt = i;
      parent = (parent as Record<string | number, unknown>)[p.path[i]!];
    }
    if (Array.isArray(parent)) listAt = p.path.length - 1;
    if (listAt >= 0) {
      let list: unknown = out;
      for (let i = 0; i < listAt; i++) list = (list as Record<string | number, unknown>)[p.path[i]!];
      if (Array.isArray(list)) {
        const set = drops.get(list) ?? new Set<number>();
        set.add(p.path[listAt] as number);
        drops.set(list, set);
        continue;
      }
    }
    const last = p.path.at(-1)!;
    if (parent && typeof parent === "object") (parent as Record<string | number, unknown>)[last] = emptyShape((parent as Record<string | number, unknown>)[last]) === "" ? "" : typeof (parent as Record<string | number, unknown>)[last] === "number" ? 0 : emptyShape((parent as Record<string | number, unknown>)[last]);
  }
  for (const [list, set] of drops) {
    const keep = list.filter((_, i) => !set.has(i));
    list.length = 0;
    list.push(...keep);
  }
  return out;
}

// --- The true starting state.

const SAID_IN = /\b(i'?m in|im in|i'?m down|im down|count me in|i'?ll come|i'?m coming|im coming|i'?ll be there|i'?m going|im going|down for|i'?m there|yes|yep|yeah|bet|in!)\b/i;
const SAID_PAID = /\b(paid|venmo'?d|venmoed|sent (?:it|you|u)|zelle'?d|transferred|covered it|squared up)\b/i;
const SAID_MAYBE = /\b(maybe|might|not sure|tbd|depends)\b/i;
/** Lists of people who have done something (voted, joined, claimed) and lists of moves (bets, spins, picks). */
const VOTE_KEY = /^(voters|votes|picked|agree|want|yes|no|backers|fans|likes)$/i;
const JOIN_KEY = /^(going|in|joined|riders|coming|attending|crew)$/i;
const MAYBE_KEY = /^(maybe|maybes)$/i;
const PAID_KEY = /^(paid|settled|done|squared)$/i;
const CLAIM_KEY = /^(claimedBy|by|takenBy|holder|owner)$/i;
const MOVES_KEY = /^(book|bets|spun|spins|ranked|picks|moves|log|history|draws|vetoes|passed|scores|votesCast|ballots|rolls|guesses|answers|checked|claims)$/i;
const TALLY_KEY = /^(votes|tally|points|streak|coming)$/i;

/** Each member's own lines, lowercased. */
function linesBy(req: Pick<GenerateRequest, "chat" | "members">): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of req.chat.messages) {
    const who = req.members.find((x) => low(x.name) === low(m.from) || x.id === m.from || low(x.name.split(/\s+/)[0]!) === low(m.from))?.name;
    if (!who) continue;
    out.set(who, [...(out.get(who) ?? []), low(m.text)]);
  }
  return out;
}

const labelOf = (o: unknown): string => {
  if (!o || typeof o !== "object") return "";
  const r = o as Record<string, unknown>;
  return String(r.name ?? r.label ?? r.title ?? r.option ?? "");
};

/** Did `who` say, in their own words, something about `label` (a vote or claim for it)? */
function mentioned(who: string, label: string, lines: Map<string, string[]>): boolean {
  const ws = words(label).filter((w) => w.length >= 4);
  return !!ws.length && (lines.get(who) ?? []).some((t) => ws.some((w) => t.includes(w)));
}

/**
 * A live answer's starting state: activity only where the chat says so in words. Votes and claims
 * stay for a person whose own message names that option; joins and payments for a person who said
 * so; bets, spins, rankings and draft picks never (nobody has made a move in a tool that did not
 * exist a second ago). Counts that stand for activity start at 0.
 */
export function honestStart(id: string, params: Record<string, unknown>, req: Pick<GenerateRequest, "chat" | "members">): Record<string, unknown> {
  const lines = linesBy(req);
  const saidMatch = (who: string, re: RegExp) => (lines.get(who) ?? []).some((t) => re.test(t));
  const asName = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" ? String((v as Record<string, unknown>).name ?? (v as Record<string, unknown>).who ?? "") : "");
  const fix = (v: unknown, key: string, parent: unknown, under = ""): unknown => {
    if (Array.isArray(v)) {
      if (MOVES_KEY.test(key)) return [];
      if (VOTE_KEY.test(key)) return v.filter((x) => mentioned(asName(x), labelOf(parent), lines));
      if (JOIN_KEY.test(key)) return v.filter((x, i) => saidMatch(asName(x), SAID_IN) || (i === 0 && id === "squad-lock" && asName(x) === asName((parent as Record<string, unknown>)?.host)));
      if (MAYBE_KEY.test(key)) return v.filter((x) => saidMatch(asName(x), SAID_MAYBE));
      if (PAID_KEY.test(key)) return v.filter((x) => saidMatch(asName(x), SAID_PAID));
      return v.map((x) => fix(x, key, parent, key));
    }
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x, k, v, under)]));
    if (typeof v === "string" && CLAIM_KEY.test(key) && v && labelOf(parent)) return mentioned(v, labelOf(parent), lines) ? v : "";
    // a seat or slot with someone in it: only when they said they are in
    if (typeof v === "string" && /^(who|by|name)$/i.test(key) && v && /^(seats|slots|spots|shifts|places)$/i.test(under)) {
      const code = low(String((parent as Record<string, unknown>)?.code ?? (parent as Record<string, unknown>)?.label ?? "")).trim();
      const named = !!code && /^[a-z0-9 ]+$/.test(code) && (lines.get(v) ?? []).some((t) => new RegExp(`(^|[^a-z0-9])${code}([^a-z0-9]|$)`).test(t));
      return named || saidMatch(v, SAID_IN) ? v : "";
    }
    if (typeof v === "boolean" && PAID_KEY.test(key)) return v && saidMatch(asName(parent), SAID_PAID);
    if (typeof v === "number" && TALLY_KEY.test(key) && key !== "pts") return 0;
    return v;
  };
  let out = fix(params, "", null) as Record<string, unknown>;
  out = SPECIAL[id]?.(out, req) ?? out;
  return out;
}

/** Tools whose starting state is a computed picture of the activity. */
const SPECIAL: Record<string, (p: Record<string, unknown>, req: Pick<GenerateRequest, "chat" | "members">) => Record<string, unknown>> = {
  // the group is this chat; the only free times are the ones people wrote (the tool marks them
  // from `people`), and nobody outside the chat is counted
  "meeting-time": (p, req) => {
    const lines = linesBy(req);
    // the tool names days short ("Sun") and marks people by "Sun 7pm" cells: a fill that wrote "sunday" or "Sunday 7 pm" is said the tool's way
    const day = (d: string) => d.replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/gi, (_, x: string) => x[0]!.toUpperCase() + x.slice(1, 3).toLowerCase());
    const time = (t: string) => t.replace(/(\d)\s+(am|pm)\b/gi, "$1$2").toLowerCase();
    const cell = (c: string) => time(day(c)).replace(/^([a-z]{3})/i, (x) => x[0]!.toUpperCase() + x.slice(1));
    const days = Array.isArray(p.days) ? (p.days as string[]).map(day) : [];
    const times = Array.isArray(p.times) ? (p.times as string[]).map(time) : [];
    const people = (Array.isArray(p.people) ? (p.people as { name: string; free: string[] }[]) : [])
      .filter((x) => x && Array.isArray(x.free) && x.free.length)
      .map((x) => ({ ...x, free: x.free.map(cell) }))
      .filter((x) => (lines.get(x.name) ?? []).some((t) => x.free.some((f) => words(f).some((w) => w.length >= 3 && t.includes(w)) || /\d/.test(f) && t.includes(f.replace(/\D/g, "")))));
    return { ...p, ...(Array.isArray(p.days) ? { days } : {}), ...(Array.isArray(p.times) ? { times } : {}), members: req.members.length, people, counts: times.map(() => days.map(() => 0)) };
  },
  // the book's lines lean nowhere until someone bets
  "over-under": (p) => ({ ...p, book: [], props: (Array.isArray(p.props) ? p.props : []).map((x) => ({ ...(x as object), lean: 500, trend: [500, 500] })) }),
  "trip-draft": (p) => ({ ...p, picks: [], players: (Array.isArray(p.players) ? p.players : []).map((x) => ({ ...(x as object), prefs: [] })) }),
  "tier-list": (p) => ({ ...p, ranked: [] }),
  "chore-wheel": (p) => ({ ...p, spun: [] }),
};

export { strings };
