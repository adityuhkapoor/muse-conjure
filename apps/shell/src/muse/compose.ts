// Composing a post on Home: Muse reads the draft and offers one piece of software to go with it.
// Pure: the composer, the demo server and the checks all call `readDraft`.
//
// Lab tools only (library/lab/<id>): no library piece is ever offered here. Each scenario lists its
// tools in order of preference; the first one the gateway says is available (`has`, the same check
// as services/demo/premade.ts) is offered, and a tool that lands in library/lab later is picked up
// without a code change. Every tool is filled from the draft; what the draft does not say is left
// to the tool's own example (the server merges these params over example.ts), with the poster's
// friends' names where the example names people.
//
// Parsing is deterministic: lists split on commas, numbers, "or", "and" and line breaks; names
// are matched against the poster's friends.

export type Friend = { id: string; first: string };

export type DraftCtx = {
  /** the poster's first name */
  me: string;
  /** the poster's friends (not the poster) */
  friends: Friend[];
  /** is `lab:<id>` available on this server */
  has: (tool: string) => boolean;
  /** a lab tool's own name from its meta.json, for tools this file does not know yet */
  nameOf?: (id: string) => string | undefined;
};

export type Offer = {
  scenario: string;
  /** `lab:<id>` */
  tool: string;
  /** "Add a bracket" */
  label: string;
  /** "Bracket instead" */
  chip: string;
  /** the tool card's title */
  title: string;
  /** what Muse read, one line: "8 places in your post" */
  read: string;
  params: Record<string, unknown>;
  /** friend ids to leave out of the tool's members (the person a surprise is for) */
  leaveOut?: string[];
  /** where it came from: the instant patterns here, or the model's reading of the post */
  source?: "pattern" | "model";
  /** what the model made up (not in the post), exactly as in params, so the author can change it */
  suggested?: string[];
};

export type DraftRead = { scenario: string; strength: number; offers: Offer[] };

/** A suggestion shows only after a pause with at least this many words. */
export const MIN_WORDS = 3;
/** At Post with nothing attached, a read at least this strong asks once. */
export const STRONG = 0.8;

/** The composer's "try this" drafts: each fills the text area with a post that gets a suggestion. */
export const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "ranking the dining halls",
    text: "ranking the dining halls before i graduate. crossroads, cafe 3, foothill, clark kerr, gbc late night, pat brown's. fight me in the comments",
  },
  {
    label: "maya's 21st is friday",
    text: "maya's 21st is friday. we're getting her the le labo candle she keeps talking about, $15 each. comment if you're in so i know how many",
  },
  {
    label: "selling everything before i move out",
    text: "selling everything before i move out on the 20th. couch $80, desk $40, mini fridge $30, lamp $10, bike $60. friends get first dibs, then it all goes on marketplace",
  },
];

// ---------------------------------------------------------------- reading text

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const SHORT_DAYS: Record<string, string> = { mon: "monday", tue: "tuesday", tues: "tuesday", wed: "wednesday", thu: "thursday", thur: "thursday", thurs: "thursday", fri: "friday", sat: "saturday", sun: "sunday" };

export const wordCount = (t: string) => (t.trim().match(/\S+/g) ?? []).length;
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** "gbc late night" -> "GBC Late Night", "pat brown's" -> "Pat Brown's", "cafe 3" -> "Cafe 3" */
export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^[bcdfghjklmnpqrstvwxz]{2,4}$/i.test(w) ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

function day(t: string): string | null {
  const l = t.toLowerCase();
  if (/\btonight\b/.test(l)) return "tonight";
  if (/\btomorrow\b/.test(l)) return "tomorrow";
  if (/\bthis weekend\b/.test(l)) return "this weekend";
  for (const d of DAYS) if (new RegExp(`\\b${d}\\b`).test(l)) return d;
  for (const [k, d] of Object.entries(SHORT_DAYS)) if (new RegExp(`\\b${k}\\b`).test(l)) return d;
  return null;
}

/** Friends named in the text, in the order they appear. */
function named(t: string, friends: Friend[]): Friend[] {
  const l = t.toLowerCase();
  return friends
    .map((f) => ({ f, at: l.search(new RegExp(`\\b${f.first.toLowerCase()}\\b`)) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.f);
}

const cleanItem = (s: string) =>
  s
    .trim()
    .replace(/^(\d+[.)]|[-*•]|#\d+)\s*/, "")
    .replace(/^(and|or|vs\.?|then|also|plus)\s+/i, "")
    .replace(/[.!?;:]+$/, "")
    .trim();

/**
 * The longest list in the text: numbered or bulleted lines first, else the sentence with the most
 * parts split on commas, "or", "and" and "vs". Items are short (at most 5 words).
 */
export function listIn(t: string): string[] {
  const lines = t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const marked = lines.filter((x) => /^(\d+[.)]|[-*•]|#\d+)\s*\S/.test(x)).map(cleanItem).filter(Boolean);
  if (marked.length >= 2) return marked.slice(0, 12);
  const short = lines.length >= 3 ? lines.slice(1).map(cleanItem).filter((x) => x && wordCount(x) <= 5) : [];
  if (short.length >= 3 && short.length === lines.length - 1) return short.slice(0, 12);
  let best: string[] = [];
  // Sentences end at a full stop followed by a space (keeps "st. louis" and "3.5" mostly whole), "?" or "!".
  for (const sentence of t.split(/(?<=[.!?])\s+|\n+/)) {
    const body = sentence.includes(":") ? sentence.slice(sentence.lastIndexOf(":") + 1) : sentence;
    const parts = body
      .split(/,\s*|\s+(?:or|and|vs\.?|versus)\s+|\s*\/\s*/i)
      .map(cleanItem)
      .filter(Boolean);
    if (parts.length < 2) continue;
    // A list's parts are short; a leading "ranking the dining halls" part is not an item.
    const items = parts.filter((p) => wordCount(p) <= 5 && p.length <= 32);
    if (items.length < 2 || items.length < parts.length - 1) continue;
    const kept = items.length === parts.length ? items : parts.slice(1);
    if (kept.length > best.length && kept.every((p) => wordCount(p) <= 5)) best = kept;
  }
  return best.slice(0, 12);
}

/** "couch $80" -> { name: "couch", cents: 8000 } */
function priced(item: string): { name: string; cents: number | null } {
  const m = /^(.*?)\s*[(]?\s*\$\s?(\d+(?:\.\d{1,2})?)\s*[)]?\s*(?:obo)?$/i.exec(item) ?? /^\$\s?(\d+)\s+(.*)$/.exec(item);
  if (!m) return { name: item, cents: null };
  const [name, num] = m[1] && /\d/.test(m[1]) && !m[2]?.match(/\d/) ? [m[2]!, m[1]] : [m[1]!, m[2]!];
  return { name: name.replace(/^(my|the|a|an)\s+/i, "").trim() || item, cents: Math.round(Number(num) * 100) };
}

/** The thing being ranked: "ranking the dining halls" -> "dining halls". */
function topic(t: string): string | null {
  const l = t.toLowerCase();
  const m =
    /\b(?:rank(?:ing|ed)?|tier list(?: of)?|power rankings?(?: of)?|top \d+|best|worst|goat)\s+(?:of\s+|all\s+)?(?:the\s+|my\s+|our\s+|all\s+the\s+)?([a-z][a-z' -]{2,40}?)(?=\s+(?:before|after|in|at|on|near|around|from|for|this|ever|of all|according|i|imo|tbh|ranked)\b|[.,:!?\n]|$)/.exec(l);
  return m ? m[1]!.trim() : null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- tools

/** How each known lab tool is named in the row and the chip. */
const NAMES: Record<string, { add: string; short: string }> = {
  "bracket-post": { add: "Add a bracket", short: "Bracket" },
  "feed-tier-list": { add: "Add a tier list", short: "Tier list" },
  "tier-list": { add: "Add a ranking", short: "Ranking" },
  "after-vote": { add: "Add a vote", short: "Vote" },
  "pregame-vote": { add: "Add a vote", short: "Vote" },
  "friends-plans": { add: "Add a plan", short: "Plan" },
  "squad-lock": { add: "Add a headcount", short: "Headcount" },
  "bday-pool": { add: "Add a gift pool", short: "Gift pool" },
  "gift-pool": { add: "Add a gift pool", short: "Gift pool" },
  "move-out-sale": { add: "Add a move-out sale", short: "Sale" },
  "move-in-day": { add: "Add a moving crew", short: "Moving crew" },
  "public-challenge": { add: "Add a challenge", short: "Challenge" },
  gym: { add: "Add a streak", short: "Streak" },
  "daily-puzzle": { add: "Add a daily puzzle", short: "Puzzle" },
  "trip-story": { add: "Add a trip story", short: "Trip story" },
  album: { add: "Add an album", short: "Album" },
  "semester-wrapped": { add: "Add a semester wrapped", short: "Wrapped" },
  wrapped: { add: "Add a wrapped", short: "Wrapped" },
  "hinge-rate": { add: "Add a rating", short: "Rating" },
  "setlist-bingo": { add: "Add setlist bingo", short: "Bingo" },
  "squad-constellation": { add: "Add who you know", short: "Who you know" },
};

type Parsed = { text: string; items: string[]; day: string | null; named: Friend[]; ctx: DraftCtx };
type Candidate = { id: string; title: string; read: string; params: Record<string, unknown>; leaveOut?: string[] };

type Scenario = {
  id: string;
  /** 0 when it does not apply */
  strength: (p: Parsed) => number;
  /** in order of preference; `alt` ones may also show as chips */
  tools: (p: Parsed) => (Candidate & { alt?: boolean })[];
};

const names = (p: Parsed) => [p.ctx.me, ...p.ctx.friends.map((f) => f.first)];
const has = (t: string, re: RegExp) => re.test(t.toLowerCase());

// Bracket foods, the nearest one for an entry, else in turn.
const FOODS = ["burrito", "taco", "donut", "shake", "pizza", "burger", "curry", "fries"] as const;
const foodFor = (name: string, i: number) => {
  const l = name.toLowerCase();
  const hit: [RegExp, (typeof FOODS)[number]][] = [
    [/burrito|chipotle|mission/, "burrito"],
    [/taco|taqueria|mexican/, "taco"],
    [/donut|bakery|cafe|café|coffee|boba|tea|crepe/, "donut"],
    [/shake|ice cream|gelato|froyo|smoothie/, "shake"],
    [/pizza|slice/, "pizza"],
    [/burger|grill|diner|shack/, "burger"],
    [/curry|thai|indian|ramen|pho|noodle|sushi|halal/, "curry"],
    [/fries|late night|wings|chicken/, "fries"],
  ];
  return hit.find(([re]) => re.test(l))?.[1] ?? FOODS[i % FOODS.length]!;
};

/** Example votes from the feed for a tier list (the lab example's own numbers), per item. */
const FEED_VOTES = [
  [9, 15, 9, 3, 1],
  [2, 7, 14, 9, 4],
  [17, 13, 5, 2, 0],
  [4, 10, 11, 8, 4],
  [12, 6, 6, 8, 5],
  [1, 4, 9, 13, 10],
];

function rankTitle(p: Parsed, kind: "rank" | "best"): string {
  const t = topic(p.text);
  if (!t) return kind === "rank" ? "Rank these" : "Best of these";
  return kind === "rank" ? `Rank the ${t}` : `Best ${t}`;
}

const MOVE_KINDS: [RegExp, string][] = [
  [/couch|sofa|sectional|futon|loveseat/, "couch"],
  [/desk|table/, "desk"],
  [/lamp|light/, "lamp"],
  [/bike|scooter/, "bike"],
  [/fridge|freezer/, "fridge"],
  [/plant|monstera|pothos/, "plant"],
];

const SCENARIOS: Scenario[] = [
  // "best/ranking/top N of X" with a list
  {
    id: "compose-ranking",
    strength: (p) => (has(p.text, /\b(rank|ranking|ranked|best|worst|top \d+|tier ?list|power rankings?|goat)\b/) && p.items.length >= 2 ? (p.items.length >= 3 ? 0.92 : 0.7) : 0),
    tools: (p) => {
      const n = p.items.length;
      const noun = topic(p.text) ?? "places";
      const read = `${n} ${noun} in your post`;
      const items = p.items.map(titleCase);
      const bracket: Candidate & { alt?: boolean } = {
        id: "bracket-post",
        title: rankTitle(p, "best"),
        read: n >= 8 ? `${noun === "places" ? "8 places" : `8 ${noun}`} in your post` : read,
        params: { title: clip(rankTitle(p, "best"), 48), left: "1 day left", teams: items.slice(0, 8).map((name, i) => ({ name: name.slice(0, 20), food: foodFor(name, i) })), people: [] },
        alt: true,
      };
      const tier: Candidate & { alt?: boolean } = {
        id: "feed-tier-list",
        title: rankTitle(p, "rank"),
        read: n > 6 ? `${n} ${noun} in your post, the first 6` : read,
        params: { title: rankTitle(p, "rank"), author: p.ctx.me, items: items.slice(0, 6).map((name, i) => ({ name, votes: FEED_VOTES[i % 6] })), people: [] },
        alt: true,
      };
      const plain: Candidate & { alt?: boolean } = {
        id: "tier-list",
        title: rankTitle(p, "rank"),
        read,
        params: { title: rankTitle(p, "rank"), noun: noun.replace(/s$/, "").split(" ").at(-1) ?? "pick", items: items.slice(0, 6), ranked: [] },
        alt: true,
      };
      const vote: Candidate & { alt?: boolean } = {
        id: "after-vote",
        title: rankTitle(p, "best"),
        read,
        params: { title: clip(rankTitle(p, "best"), 40), when: "", clock: "", ends: "", meetAt: "", options: items.slice(0, 4).map((name) => ({ name, meta: "", plan: "", icon: "", voters: [] })) },
        alt: true,
      };
      if (n >= 7) return [bracket, tier, plain];
      return n <= 4 ? [tier, plain, vote] : [tier, plain];
    },
  },
  // a friend's birthday
  {
    id: "compose-birthday",
    strength: (p) => {
      const bday = has(p.text, /\b(birthday|bday|b-day|turns \d+|turning \d+)\b|\b\d{1,2}(st|nd|rd|th)\b/);
      if (!bday) return 0;
      return p.named.length ? 0.92 : has(p.text, /\b(birthday|bday)\b/) ? 0.6 : 0;
    },
    tools: (p) => {
      const who = p.named[0];
      const recipient = who?.first ?? "them";
      const age = /\b(\d{1,2})(?:st|nd|rd|th)\b/.exec(p.text)?.[1] ?? /\bturn(?:s|ing) (\d+)/.exec(p.text.toLowerCase())?.[1] ?? null;
      const when = p.day ? cap(p.day) : "";
      const occasion = [age ? `turns ${age}` : "birthday", when].filter(Boolean).join(" ");
      const each = /\$\s?(\d+)\s*(?:each|a person|per person|pp|apiece)/i.exec(p.text)?.[1];
      const shareCents = each ? Number(each) * 100 : 1500;
      const crew = names(p).filter((n) => n !== who?.first);
      const giftM = /\b(?:getting|get|buying|buy|got)\s+(?:her|him|them)\s+(?:a |an |the |some )?([a-z0-9' -]{3,30}?)(?=\s+(?:she|he|they|that|which|for)\b|[.,!?]|$)/i.exec(p.text);
      const gift = giftM ? titleCase(giftM[1]!) : "";
      const params = { recipient, occasion, gift, giftNote: "", quote: "", quoteDate: "", goalCents: shareCents * crew.length, shareCents, crew, paid: [] };
      const read = `${recipient}'s ${age ? `${age}${ordinal(Number(age))}` : "birthday"}${when ? ` on ${when}` : ""} · $${shareCents / 100} each`;
      const leaveOut = who ? [who.id] : [];
      return [
        {
          id: "bday-pool",
          title: `${recipient}'s ${age ? `${age}${ordinal(Number(age))}` : "birthday"}`,
          read,
          params: {
            who: recipient,
            heading: age ? `Happy ${age}${ordinal(Number(age))}, ${recipient}` : `Happy birthday, ${recipient}`,
            ...(age ? { candles: age } : {}),
            ...(when ? { when: when.toLowerCase() } : {}),
            notes: [],
            lines: [age ? `happy ${age}${ordinal(Number(age))}` : "happy birthday", when ? `see you ${when.toLowerCase()}` : "see you soon", `love you ${recipient.toLowerCase()}`],
            gift: { name: gift || "A gift from all of us", goalCents: shareCents * crew.length, buyer: p.ctx.me },
            pot: [],
            amounts: [shareCents, shareCents * 2],
          },
          leaveOut,
        },
        { id: "gift-pool", title: `${recipient}'s ${age ? `${age}${ordinal(Number(age))}` : "birthday"}`, read, params, leaveOut },
      ];
    },
  },
  // moving out and selling stuff
  {
    id: "compose-move-out",
    strength: (p) => (has(p.text, /\b(sell|selling)\b.*\b(everything|my stuff|stuff|things|it all|furniture)\b|\bmove.?out sale\b|\bmoving out\b.*(\$|\bsell)|\b(sell|selling)\b.*\bmov(e|ing) out\b/) ? 0.9 : 0),
    tools: (p) => {
      const things = p.items.map(priced).filter((x) => x.name);
      const items = things.slice(0, 6).map((x) => {
        const l = x.name.toLowerCase();
        return { name: titleCase(x.name).slice(0, 24), priceCents: x.cents ?? 2000, kind: MOVE_KINDS.find(([re]) => re.test(l))?.[1] ?? "other", claimedBy: "" };
      });
      const when = /\bmov(?:e|ing) out (on the \d+(?:st|nd|rd|th)|\w+day)/i.exec(p.text)?.[1];
      if (items.length < 2) return [];
      const params: Record<string, unknown> = { seller: p.ctx.me, items, note: "", pickup: `At ${p.ctx.me}'s${when ? ` before ${when.replace(/^on /, "")}` : ""}`, publicWhen: has(p.text, /marketplace/) ? (when ? `after ${when.replace(/^on /, "")}` : "this weekend") : "after friends" };
      return [{ id: "move-out-sale", title: "Move-out sale", read: items.length >= 2 ? `${plural(items.length, "thing")} for sale in your post` : "Selling before you move", params }];
    },
  },
  // need people to help me move
  {
    id: "compose-move-help",
    strength: (p) => (has(p.text, /\b(help (me )?move|need (people|hands|help|muscle|a few people)\b.*\bmov|moving day|carry (a |my |the )?(couch|mattress))\b/) ? 0.88 : 0),
    tools: (p) => {
      const l = p.text.toLowerCase();
      const items = (
        [
          [/couch|sofa/, { name: "Couch", need: 3, note: "Tilt it through the door", cuft: 110, kind: "couch" }],
          [/mattress|bed/, { name: "Mattress", need: 2, note: "", cuft: 60, kind: "mattress" }],
          [/\btv\b/, { name: "TV", need: 1, note: "The careful one", cuft: 30, kind: "tv" }],
          [/table|desk/, { name: "Table", need: 2, note: "", cuft: 40, kind: "table" }],
        ] as const
      )
        .filter(([re]) => re.test(l))
        .map(([, it]) => ({ ...it, hands: [] as string[] }))
        .slice(0, 3);
      const when = p.day ? cap(p.day) : "Sat";
      return [{ id: "move-in-day", title: `${p.ctx.me}'s move`, read: `Moving ${p.day ?? "day"}${items.length ? ` · ${plural(items.length, "big thing")}` : ""}`, params: { title: `${p.ctx.me}'s move`, sub: when, stage: 0, ...(items.length ? { items } : {}), after: `Pizza after, on ${p.ctx.me}` } }];
    },
  },
  // a challenge or a streak
  {
    id: "compose-challenge",
    strength: (p) => (has(p.text, /\b\d+\s*days? of\b|\bbet i can\b|\bchallenge\b|\bstreak\b|\bevery (single )?day (for|this|until)\b/) ? 0.88 : 0),
    tools: (p) => {
      const l = p.text.toLowerCase();
      const n = Number(/\b(\d+)\s*days?\b/.exec(l)?.[1] ?? 30);
      const of = Math.max(7, Math.min(60, n));
      const what = /\b\d+\s*days? of ([a-z][a-z' -]{2,30}?)(?=[.,!?]|\s+(?:starting|from|who|with|let|if|and|tomorrow|today|tonight|this|next|on|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|$)/.exec(l)?.[1];
      const title = what ? `${of} days of ${what}` : `${p.ctx.me}'s ${of}-day challenge`;
      const first = p.text.split(/(?<=[.!?])\s+|\n/)[0] ?? "";
      const params = { title: clip(cap(title), 40), host: p.ctx.me, hostLine: clip(first, 40), today: 1, of, others: 0, crew: [{ name: p.ctx.me, days: "x" }] };
      return [
        { id: "public-challenge", title: cap(title), read: `A ${of}-day challenge`, params },
        { id: "gym", title: cap(title), read: `A ${of}-day challenge`, params: {} },
        { id: "daily-puzzle", title: cap(title), read: "A daily challenge", params: {} },
      ];
    },
  },
  // roast my / rate my
  {
    id: "compose-rate",
    strength: (p) => (has(p.text, /\b(roast|rate) my\b|\bred flag or green flag\b|\bshould i text (him|her|them) back\b/) ? 0.85 : 0),
    tools: (p) => [
      { id: "hinge-rate", title: `Rate ${p.ctx.me}'s matches`, read: "You asked friends to rate", params: { subject: p.ctx.me } },
      { id: "tier-list", title: "Rate these", read: "You asked friends to rate", params: p.items.length >= 2 ? { title: "Rate these", items: p.items.slice(0, 6).map(titleCase), ranked: [] } : {} },
    ],
  },
  // who's down / who's coming / anyone want to
  {
    id: "compose-plan",
    strength: (p) => (has(p.text, /\b(who'?s (down|coming|in|free|around)|anyone (want|wanna|down|free|coming|tryna|up for)|who wants to|lmk if (you'?re|ur) (in|down)|down to)\b/) ? 0.86 : 0),
    tools: (p) => {
      const l = p.text.toLowerCase();
      const what = /\b(?:down|coming|in|free|up) (?:for|to)\s+(?:a |an |the |some )?([a-z0-9' -]{3,32}?)(?=[.,!?]|\s+(?:this|on|at|tonight|tomorrow|before|after|lmk|if)\b|$)/.exec(l)?.[1] ?? /\b(?:want|wanna|tryna) (?:to )?(?:go )?(?:get )?([a-z0-9' -]{3,32}?)(?=[.,!?]|\s+(?:this|on|at|tonight|tomorrow|before|after|lmk|if)\b|$)/.exec(l)?.[1];
      if (!what) return [];
      const title = cap(what.replace(/\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tonight|tomorrow|this weekend)$/, ""));
      const when = p.day ? (p.day.startsWith("t") ? cap(p.day) : p.day.slice(0, 3).toUpperCase()) : "";
      const sub = [`${p.ctx.me}'s plan`, when].filter(Boolean).join(" · ");
      const read = `A plan${p.day ? ` for ${p.day}` : ""} in your post`;
      return [
        { id: "friends-plans", title, read, params: weekendPlan(p, title) },
        { id: "squad-lock", title, read, params: { title: clip(title, 40), sub, date: when ? when.toUpperCase() : "THIS WEEK", tickets: "Locks at 4 going", host: p.ctx.me, threshold: 4, going: [{ name: p.ctx.me, note: "I'm in" }], maybe: [] } },
      ];
    },
  },
  // end of semester
  {
    id: "compose-semester",
    strength: (p) => (has(p.text, /\b(end of (the )?semester|semester('s| is)? (over|done)|last day of (classes|class|finals)|finals (are )?(over|done)|semester wrapped)\b/) ? 0.84 : 0),
    tools: (p) => {
      const l = p.text.toLowerCase();
      const term = /\b(fall|spring|summer|winter)\b/.exec(l)?.[1];
      const f = p.ctx.friends.map((x) => x.first);
      const params = {
        ...(term ? { term: `${cap(term)} '26` } : {}),
        cards: [
          { kind: "study", title: "Library hours", big: "212", unit: "hrs at Doe", who: f[0] ?? p.ctx.me, detail: "Mostly the 3rd floor" },
          { kind: "food", title: "Dining loyalty", big: "87", unit: "group visits", who: "Crossroads", detail: "Pesto pasta on Tuesdays" },
          { kind: "chat", title: "Chat MVP", big: "3,402", unit: "messages", who: f[1] ?? p.ctx.me, detail: "1,395 of them voice memos" },
          { kind: "night", title: "Latest night", big: "4:12", unit: "am, finals week", who: f[2] ?? p.ctx.me, detail: "Dec 12, Moffitt" },
        ],
        opened: [],
      };
      return [
        { id: "semester-wrapped", title: "Semester wrapped", read: "The end of the semester", params },
        { id: "wrapped", title: "Wrapped", read: "The end of the semester", params: {} },
      ];
    },
  },
  // a trip recap or a photo dump
  {
    id: "compose-trip",
    strength: (p) => (has(p.text, /\b(photo dump|recap|back from|we went to|best trip|trip (to|was)|weekend in|road trip)\b/) ? 0.82 : 0),
    tools: (p) => {
      const l = p.text.toLowerCase();
      const city = /\b(?:back from|went to|trip to|weekend in|days in|nights in)\s+([a-z][a-z]+(?: [a-z]+)?)/.exec(l)?.[1]?.replace(/\s+(with|and|was|is)$/, "");
      const mvp = p.named[0]?.first ?? p.ctx.friends[0]?.first ?? p.ctx.me;
      const params = { ...(city ? { city: titleCase(city) } : {}), mvp: { who: mvp, facts: ["Booked all 3 nights", "Found the $4 tacos", "0 missed flights"] }, next: city ? `${titleCase(city)} '27` : "Next year" };
      const read = city ? `A trip to ${titleCase(city)}` : "A trip recap";
      return [
        { id: "trip-story", title: city ? titleCase(city) : "Trip story", read, params, alt: true },
        { id: "album", title: city ? titleCase(city) : "Album", read, params: {}, alt: true },
      ];
    },
  },
  // a concert or event share
  {
    id: "compose-concert",
    strength: (p) => (has(p.text, /\b(concert|show tonight|the show|setlist|festival|gig|on tour|tickets? (for|to)|(going to|gonna|get to) see)\b/) ? 0.78 : 0),
    tools: (p) => {
      const l = p.text.toLowerCase();
      const artist = /\b(?:seeing|see|saw)\s+([a-z][a-z.'& ]{2,28}?)(?=\s+(?:at|on|tonight|tomorrow|this|live|in|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|[.,!?]|$)/.exec(l)?.[1] ?? /\b(?:tickets? (?:for|to)|concert|show)\s+([a-z][a-z.'& ]{2,28}?)(?=\s+(?:at|on|tonight|tomorrow|this|live|in|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|[.,!?]|$)/.exec(l)?.[1];
      const name = artist ? titleCase(artist) : null;
      const f = p.ctx.friends.map((x) => x.first);
      return [
        { id: "setlist-bingo", title: "Setlist bingo", read: name ? `${name}${p.day ? ` ${p.day}` : ""}` : "A show in your post", params: { ...(name ? { sub: `${name}${p.day ? ` · ${p.day}` : ""}` } : {}), marks: [] }, alt: true },
        {
          id: "squad-constellation",
          title: "Who you know here",
          read: name ? `${name}${p.day ? ` ${p.day}` : ""}` : "A show in your post",
          params: { show: name ?? "the show", knows: [{ name: p.ctx.me, people: ["Sam", "Ana", "Leo"] }, ...f.slice(0, 4).map((n, i) => ({ name: n, people: [["Lena", "Omar", "Bea"], ["Ivy", "Raj"], ["Lia", "Ben", "Zoe"], ["Ray"]][i]! }))], asks: [] },
          alt: true,
        },
      ];
    },
  },
  // a question with 2 to 4 options
  {
    id: "compose-question",
    strength: (p) => (p.text.includes("?") && p.items.length >= 2 && p.items.length <= 4 ? 0.83 : 0),
    tools: (p) => {
      const q = p.text.split(/(?<=[?])\s+/).find((s) => s.includes("?")) ?? "";
      const head = q.includes(":") ? q.slice(0, q.indexOf(":")) + "?" : p.items.length && q.toLowerCase().startsWith(p.items[0]!.toLowerCase()) ? "Which one?" : q;
      const title = clip(cap(head.trim()), 40);
      const options = p.items.slice(0, 4).map((x) => titleCase(x.replace(/\s+(?:after|before|at|on|tonight|tomorrow|later|this|then)\b.*$/i, "")).slice(0, 24));
      return [
        { id: "after-vote", title, read: `${p.items.length} options in your post`, params: { title, when: "", clock: "", ends: "", meetAt: "", options: options.map((name) => ({ name, meta: "", plan: "", icon: /taco/i.test(name) ? "tacos" : /karaoke|sing/i.test(name) ? "mic" : /roof/i.test(name) ? "roof" : "", voters: [] })) } },
        { id: "pregame-vote", title, read: `${p.items.length} options in your post`, params: {} },
      ];
    },
  },
];

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** friends-plans: three days from the plan's day, the post's plan on the first. */
function weekendPlan(p: Parsed, title: string): Record<string, unknown> {
  const now = new Date();
  const want = p.day && DAYS.includes(p.day) ? (DAYS.indexOf(p.day) + 1) % 7 : p.day === "tomorrow" ? (now.getDay() + 1) % 7 : now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() + ((want - now.getDay() + 7) % 7));
  const days = [0, 1, 2].map((i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { day: SHORT[d.getDay()]!, date: String(d.getDate()) };
  });
  const l = p.text.toLowerCase();
  const icon = /taco|food|eat|dinner|crawl|brunch/.test(l) ? "taco" : /hike|trail|climb|walk/.test(l) ? "hike" : "picnic";
  const at = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})\b/.exec(l)?.[1];
  const meta = [at ? at.toUpperCase().replace(/\s+/g, " ") : null, `${p.ctx.me}'s plan`].filter(Boolean).join(" · ");
  return { sub: p.day === "this weekend" || !p.day ? "This weekend" : cap(p.day), days, plans: [{ day: 0, title: clip(title, 32), meta, icon, host: p.ctx.me, going: [], cap: 0, seat: "spot", reply: "" }] };
}

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/** Names a lab tool this file has no entry for, from its own meta name. */
function labels(id: string, ctx: DraftCtx): { add: string; short: string } {
  const known = NAMES[id];
  if (known) return known;
  const name = ctx.nameOf?.(id) ?? id.replace(/-/g, " ");
  const lower = name[0]!.toLowerCase() + name.slice(1);
  return { add: `Add ${/^[aeiou]/i.test(lower) ? "an" : "a"} ${lower}`, short: cap(name) };
}

/**
 * Reads a draft. Null when nothing fits (or the draft is too short). The strongest scenario wins;
 * its first available tool is the offer, and up to two other available tools of the same scenario
 * are alternatives (only where the scenario marks them so).
 */
export function readDraft(text: string, ctx: DraftCtx): DraftRead | null {
  const t = text.trim();
  if (wordCount(t) < MIN_WORDS) return null;
  const p: Parsed = { text: t, items: listIn(t), day: day(t), named: named(t, ctx.friends), ctx };
  const ranked = SCENARIOS.map((s, i) => {
    let strength = 0;
    try {
      strength = s.strength(p);
    } catch {}
    return { s, strength, i };
  })
    .filter((x) => x.strength > 0)
    .sort((a, b) => b.strength - a.strength || a.i - b.i);
  for (const { s, strength } of ranked) {
    let cands: (Candidate & { alt?: boolean })[] = [];
    try {
      cands = s.tools(p);
    } catch {
      continue;
    }
    const live = cands.filter((c) => ctx.has(`lab:${c.id}`) && Object.keys(c.params).length > 0);
    if (!live.length) continue;
    const [first, ...rest] = live;
    const seen = new Set([labels(first!.id, ctx).short]);
    const alts = rest.filter((c) => {
      const short = labels(c.id, ctx).short;
      if (!c.alt || seen.has(short)) return false;
      seen.add(short);
      return true;
    });
    const offers = [first!, ...alts.slice(0, 2)].map((c): Offer => {
      const l = labels(c.id, ctx);
      return { scenario: s.id, tool: `lab:${c.id}`, label: l.add, chip: `${l.short} instead`, title: clip(c.title, 80), read: c.read, params: c.params, source: "pattern", ...(c.leaveOut?.length ? { leaveOut: c.leaveOut } : {}) };
    });
    return { scenario: s.id, strength, offers };
  }
  return null;
}

/** Every scenario id, for the presenter log and the checks. */
export const COMPOSE_SCENARIOS = SCENARIOS.map((s) => s.id);

export type Candidates = { read: string; matched: boolean; offers: Offer[] };

/** The instant answer for the Ask Muse sheet: the patterns' offers (up to three), or none. Never a tool filled from someone else's example. */
export function candidates(text: string, ctx: DraftCtx): Candidates {
  const r = readDraft(text, ctx);
  if (r) return { read: `Read ${readLine(r.offers[0]!.read)}`, matched: true, offers: r.offers.slice(0, 3) };
  return { read: "Reading your post", matched: false, offers: [] };
}

/** "6 dining halls in your post" stays, "A plan for saturday" -> "a plan for saturday", names keep their capital. */
/** Cuts at a word boundary with an ellipsis; a closing quote the cut left behind goes with it. */
export function clipWords(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const at = cut.lastIndexOf(" ");
  return (at > n * 0.4 ? cut.slice(0, at) : cut).replace(/[\s,;:.'"“”]+$/, "") + "…";
}

export const readLine = (s: string) => (/^[A-Z][a-z]+'s\b/.test(s) || /^[A-Z]{2}/.test(s) ? s : s.replace(/^[A-Z]/, (m) => m.toLowerCase()));

/** "Use tier list" for an offer's button. */
export const kindOf = (o: Offer) => o.label.replace(/^Add (an? )?/, "");
export const useLabel = (_o: Offer) => "Add this Mini";
