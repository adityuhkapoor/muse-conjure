// The scenario pack: for each surface, the situations Muse is ready for and the tool to use for
// each, filled from the page's own data so it arrives full and specific.
//
// `tools` is in order of preference. The first one that exists and passed the gate is used, and
// every one is a lab tool: `lab:<id>` is a ported lab tool (library/lab, only once
// scripts/labport/out/RESULTS.txt says ok). No plain library piece is reachable from here;
// check-pack and the shell check fail on one. Rich, friends-already-in versions sit in
// rich-lab.ts and rich.ts and go first.
//
// Facts only: titles, items and numbers come from the page (muse/seed.ts, surfaces/data.ts).
// Muse writes no jokes or banter for anyone.

import { castFirst } from "../store/cast";
import { viewerId } from "../lib/media";
import { factQuestion, CHAT_FACTS, EASTFIELD_MAP, EVENT_FACTS, FEED_POSTS, FRIEND_SCORE, GROUP_FACTS, LISTING_FACTS, MY_LISTINGS, REEL_FACTS, ROOM_4B, SUBLET_FACTS, TRIP } from "./seed";
import type { PageContext, Scenario } from "./types";
import { RICH } from "./rich";
import { RICH_LAB } from "./rich-lab";

// ---------------------------------------------------------------- helpers

const nm = (c: PageContext, id: string) => c.names[id] ?? id;
const others = (c: PageContext) => c.people.filter((p) => p !== "me");
const list = (c: PageContext, k: string) => (Array.isArray(c.facts[k]) ? (c.facts[k] as string[]) : []);
const str = (c: PageContext, k: string) => (c.facts[k] === undefined ? "" : String(c.facts[k]));
const num = (c: PageContext, k: string) => Number(c.facts[k] ?? 0);
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1).trimEnd() : s);
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;
const eventFacts = (c: PageContext) => EVENT_FACTS[c.object.id] ?? { kind: "concert" as const };
/** "Fri, Nov 14, 8 PM" -> "Fri 8 PM" */
const shortWhen = (c: PageContext) => {
  const w = str(c, "when");
  const m = /^(\w+),.*?(\d+ [AP]M)$/.exec(w);
  return m ? `${m[1]} ${m[2]}` : w;
};
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "find me a june sublet under 1400" -> { month: "jun", max: 140000 } */
export function subletWants(text: string): { month: string | null; max: number | null } {
  const t = text.toLowerCase();
  const month = MONTHS.find((m) => new RegExp(`\\b${m}`).test(t)) ?? null;
  const k = /under\s*\$?\s*(\d+(?:\.\d+)?)\s*k\b/.exec(t);
  const n = /(?:under|below|max|less than|up to)\s*\$?\s*(\d[\d,]*)/.exec(t);
  const max = k ? Math.round(Number(k[1]) * 100_000) : n ? Number(n[1]!.replace(/,/g, "")) * 100 : null;
  return { month, max };
}

export function subletMatches(text: string) {
  const w = subletWants(text);
  return SUBLET_FACTS.filter((s) => (!w.month || s.months.includes(w.month)) && (!w.max || s.cents <= w.max));
}

function subletTitle(text: string): string {
  const w = subletWants(text);
  const month = w.month ? { may: "May", jun: "June", jul: "July", aug: "August" }[w.month] ?? cap(w.month) : "";
  if (month && w.max) return `${month} sublets under ${money(w.max)}`;
  if (month) return `${month} sublets`;
  if (w.max) return `Sublets under ${money(w.max)}`;
  return "Sublets that match";
}

/** bring-list's drawings: the nearest one for a dish, else a plain one. */
const dishKind = (label: string) => {
  const t = label.toLowerCase();
  return /mac/.test(t) ? "mac" : /pie/.test(t) ? "pie" : /drink|soda|juice/.test(t) ? "drinks" : /salad|bean|green/.test(t) ? "salad" : /cup|plate/.test(t) ? "cups" : /chip/.test(t) ? "chips" : /ice/.test(t) ? "ice" : /turkey/.test(t) ? "turkey" : "other";
};

/** The saved listings of this kind (from the page's facts), or just this one. */
const savedOrThis = (c: PageContext) => {
  const saved = list(c, "savedTitles").map((t) => {
    const m = /^(.*) \$(\d+)$/.exec(t);
    return { title: m?.[1] ?? t, price: Number(m?.[2] ?? 0), where: str(c, "where") };
  });
  return saved.length >= 2 ? saved : [{ title: c.title, price: num(c, "price"), where: str(c, "where") }];
};

const askOrDraft = (c: PageContext) => `${str(c, "ask")} ${str(c, "typing")}`.trim();

// ---------------------------------------------------------------- the pack

export const PACK: Scenario[] = [
  // ============================================================ Events
  {
    id: "event-go-together",
    surface: "event",
    land: "chat",
    title: () => "Who's in",
    summary: (c) => `1 of ${c.people.length} in`,
    template: "whos-in",
    asks: ["go together", "who is going", "who's in", "lock the plan", "go with friends", "squad"],
    chat: (c) => ({ key: `event:${c.object.id}`, name: c.title, members: others(c) }),
    tools: [
      {
        tool: "lab:squad-lock",
        params: (c) => ({
          title: "Go with friends",
          sub: `${c.title} · ${str(c, "venue")} · ${num(c, "interested").toLocaleString("en-US")} interested`,
          date: str(c, "when").toUpperCase(),
          tickets: list(c, "tickets").join(" · "),
          host: nm(c, "me"),
          threshold: Math.min(4, c.people.length),
          going: [{ name: nm(c, "me"), note: "" }],
          maybe: [],
        }),
      },
    ],
  },
  {
    id: "event-tickets",
    surface: "event",
    land: "chat",
    title: () => "Sit together",
    summary: () => "pick a section",
    template: "poll",
    asks: ["split tickets", "sit together", "buy tickets", "who is buying tickets", "seats together", "ticket split", "floor or balcony"],
    chat: (c) => ({ key: `event:${c.object.id}`, name: c.title, members: others(c) }),
    tools: [
      {
        tool: "lab:ticket-split",
        params: (c) => ({
          venue: str(c, "venue"),
          date: shortWhen(c),
          tiers: eventFacts(c).tiers ?? [],
          tier: 1,
          people: c.people.map((p) => nm(c, p)),
          payer: nm(c, "me"),
        }),
      },
    ],
  },
  {
    id: "event-carpool",
    surface: "event",
    land: "page",
    title: (c) => `Rides to ${str(c, "venue")}`,
    summary: () => "2 cars · 0 have a ride",
    template: "poll",
    asks: ["who's driving", "who is driving", "carpool", "rides", "need a ride", "drive us", "car", "get there"],
    tools: [
      {
        tool: "lab:event-carpool",
        params: (c) => ({
          title: `Rides to ${str(c, "venue")}`,
          place: `${str(c, "venue")} · ${shortWhen(c)}`,
          cars: [
            { driver: "", model: "Car 1", seats: 4, leaves: "7:15", from: "Campus", costCents: 1200, costLabel: "Parking", riders: [] },
            { driver: "", model: "Car 2", seats: 4, leaves: "7:30", from: "Campus", costCents: 1200, costLabel: "Parking", riders: [] },
          ],
        }),
      },
    ],
  },
  {
    id: "event-setlist",
    surface: "event",
    land: "page",
    title: () => "Setlist bingo",
    summary: () => "no votes yet",
    template: "poll",
    asks: ["setlist", "bingo", "which song", "what songs", "opener", "setlist bingo", "songs tonight"],
    tools: [],
  },
  {
    id: "event-meet-before",
    surface: "event",
    land: "chat",
    title: () => "Where to meet before",
    summary: () => "no votes yet",
    template: "poll",
    asks: ["meet before", "pregame", "where to meet", "dinner before", "eat before", "meet up before the show"],
    chat: (c) => ({ key: `event:${c.object.id}`, name: c.title, members: others(c) }),
    tools: [
      {
        tool: "lab:pregame-vote",
        params: (c) => ({
          title: `Before ${clip(c.title, 28)}`,
          sub: `Doors 7:00 · ${c.people.length} of you`,
          venue: str(c, "venue"),
          doorsMin: 19 * 60,
          spots: list(c, "nearby").slice(0, 3).map((n, i) => ({ name: n.split(" · ")[0], walk: Number(/(\d+) min/.exec(n)?.[1] ?? 5), x: [0.22, 0.48, 0.72][i], y: [0.62, 0.36, 0.7][i], voters: [] })),
          times: [{ label: "6:00 PM", voters: [] }, { label: "6:30 PM", voters: [] }, { label: "7:00 PM", voters: [] }],
          streets: [],
        }),
      },
    ],
  },
  {
    id: "event-bring-list",
    surface: "event",
    land: "page",
    title: () => "What's everyone bringing?",
    summary: (c) => `${list(c, "bring").length} things · 0 taken`,
    template: "poll",
    asks: ["what is everyone bringing", "bring list", "potluck", "who brings what", "sign up for dishes", "what should i bring"],
    tools: [
      { tool: "lab:bring-list", params: (c) => ({ title: c.title, sub: `${shortWhen(c)} · ${str(c, "venue")} · ${num(c, "going")} coming`, items: list(c, "bring").slice(0, 6).map((label) => ({ label, kind: dishKind(label), by: [] })) }) },
    ],
  },
  {
    id: "event-open-spots",
    surface: "event",
    land: "page",
    title: () => "Open spots",
    summary: (c) => `${eventFacts(c).spots ?? 3} spots open`,
    template: "whos-in",
    asks: ["open spots", "invite more people", "friends of friends", "room for more", "plus ones", "let people ask to join"],
    tools: [],
  },
  {
    id: "event-host",
    surface: "event",
    land: "page",
    title: () => "Door list",
    summary: () => "4 going · 1 maybe",
    template: "whos-in",
    asks: ["guest list", "door list", "headcount", "who is coming", "plus ones", "how many people", "host the party"],
    tools: [], // rich-lab.ts: lab:host-board
  },
  {
    id: "event-who-knows",
    surface: "event",
    land: "page",
    title: () => "Who you know here",
    summary: () => "5 friends · 18 people",
    template: "whos-in",
    asks: ["who do i know here", "who else is going", "who do i know", "friends going", "anyone i know", "introduce me"],
    tools: [], // rich-lab.ts: lab:squad-constellation
  },
  {
    id: "event-after",
    surface: "event",
    land: "chat",
    title: () => "After the show?",
    summary: () => "3 places · vote",
    template: "poll",
    asks: ["after the show", "what after", "after party", "where after", "food after", "afterwards"],
    chat: (c) => ({ key: `event:${c.object.id}`, name: c.title, members: others(c) }),
    tools: [], // rich-lab.ts: lab:after-vote
  },

  // ============================================================ Groups
  {
    id: "group-sublet-finder",
    surface: "group",
    land: "page",
    title: (c) => subletTitle(str(c, "ask")),
    summary: (c) => `${subletMatches(askOrDraft(c)).length} places · save or skip`,
    template: "poll",
    asks: ["find me a sublet", "june sublet", "sublet under", "summer sublet", "place for the summer", "room for june", "find a place", "sublets that match"],
    tools: [
      {
        tool: "lab:sublet-finder",
        params: (c) => {
          const hits = subletMatches(askOrDraft(c));
          const w = subletWants(askOrDraft(c));
          return {
            group: c.title,
            posts: SUBLET_FACTS.length,
            swiped: 0,
            budgets: w.max ? [w.max] : [80000, 100000, 125000],
            listings: (hits.length ? hits : SUBLET_FACTS).map((x, i) => ({ hood: x.title, city: "Eastfield", priceCents: x.cents, dates: x.detail.split(" · ")[0], perk: x.detail.split(" · ").slice(1, -1).join(" · "), via: "", viaWho: "", mutuals: 0, view: i % 5, x: 0.15 + ((i * 0.23) % 0.7), y: 0.15 + ((i * 0.31) % 0.7) })),
            people: [],
            labels: EASTFIELD_MAP,
          };
        },
      },
    ],
  },
  {
    id: "group-roommates",
    surface: "group",
    land: "page",
    title: () => "Looking for roommates",
    summary: () => "3 posts · vote",
    template: "poll",
    asks: ["roommate", "find a roommate", "roommate match", "who wants to live together", "need a roommate"],
    tools: [],
  },
  {
    id: "group-best-of",
    surface: "group",
    land: "page",
    title: () => "Best place for used shoes",
    summary: () => "4 answers · vote",
    template: "poll",
    asks: ["cheap used shoes", "where do you get shoes", "best place for", "everyone keeps asking", "one answer", "recommendations"],
    tools: [
      {
        tool: "lab:best-of",
        params: (c) => {
          const r = GROUP_FACTS[c.object.id]?.repeated;
          return { group: c.title, members: num(c, "members"), question: "Best place for used shoes", posts: r?.times ?? 0, replies: 0, helped: 0, asks: [{ who: nm(c, "me"), text: r?.question ?? "", ago: "now" }], picks: (r?.answers ?? []).map((name) => ({ name, detail: "", mentions: 0, rating: 0, quotes: [] })), plus: [] };
        },
      },
    ],
  },
  {
    id: "group-meeting-time",
    surface: "group",
    land: "page",
    title: () => "When works for meetings",
    summary: () => "tap what works",
    template: "poll",
    asks: ["meeting time", "when works", "when should we meet", "weekly meeting", "find a time"],
    tools: [
      { tool: "lab:meeting-time", params: (c) => ({ group: c.title, members: num(c, "members"), place: "The wall, back room", starts: "next week", days: ["Mon", "Tue", "Wed", "Thu"], times: ["7pm", "9pm"], counts: [[9, 14, 8, 11], [5, 7, 6, 9]], people: [] }) },
    ],
  },
  {
    id: "group-signup",
    surface: "group",
    land: "page",
    title: () => "Wall night setup",
    summary: () => "0 of 6 taken",
    template: "poll",
    asks: ["sign up", "signup sheet", "volunteers", "shifts", "who can help", "sign-up board"],
    tools: [
      {
        tool: "lab:signup-board",
        params: (c) => ({
          title: "Wall night setup",
          group: c.title,
          date: "Tue",
          meet: "Rec center wall",
          shifts: ["6:40 PM", "7:00 PM", "9:00 PM"],
          roles: [
            { label: "Gear room", icon: "clipboard", cap: 1, others: [[], [], []] },
            { label: "Mats", icon: "cart", cap: 2, others: [[], [], []] },
            { label: "Shoes", icon: "water", cap: 2, others: [[], [], []] },
          ],
          people: [],
        }),
      },
    ],
  },
  {
    id: "group-dues",
    surface: "group",
    land: "page",
    title: (c) => GROUP_FACTS[c.object.id]?.dues?.label ?? "Dues",
    summary: (c) => {
      const d = GROUP_FACTS[c.object.id]?.dues;
      return d ? `${money(d.cents)} each · ${d.paid} of ${d.of} paid` : "add what you paid";
    },
    template: "bill-split",
    asks: ["dues", "collect dues", "who paid dues", "club dues", "membership fee"],
    tools: [
      {
        tool: "lab:club-dues",
        params: (c) => {
          const d = GROUP_FACTS[c.object.id]?.dues ?? { label: "Dues", cents: 2000, paid: 0, of: 1 };
          return { club: c.title, term: "spring", duesCents: d.cents, due: "Feb 1", members: d.of, paidOutside: d.paid, names: [], goals: [{ label: "Chalk and the gear room", amountCents: d.cents * d.of }], paid: [] };
        },
      },
    ],
  },
  {
    id: "group-welcome",
    surface: "group",
    land: "page",
    title: (c) => `Welcome to ${clip(c.title, 30)}`,
    summary: () => "4 cards",
    template: "poll",
    asks: ["welcome new members", "welcome", "new members", "intro for new people", "rules for new members"],
    tools: [],
  },

  // ============================================================ Marketplace
  {
    id: "mp-room-fit",
    surface: "marketplace",
    land: "page",
    title: (c) => `Will it fit in ${ROOM_4B.name.replace("Unit ", "")}?`,
    summary: () => "3 walls · vote",
    template: "poll",
    asks: ["will this fit", "will it fit", "fit in 4b", "measure", "how big", "fit in my room", "will it fit in our place"],
    tools: [
      {
        tool: "lab:room-fit",
        params: (c) => {
          const f = LISTING_FACTS[c.object.id] ?? { w: 48, d: 24, comps: [], pickup: "" };
          return {
            room: ROOM_4B.name,
            cols: 9,
            rows: 7,
            fixed: [{ label: "Door", kind: "closet", x: 0, y: 0, w: 1, h: 1 }],
            finds: [{ name: clip(c.title, 16), priceCents: num(c, "price") * 100, w: Math.max(1, Math.min(6, Math.ceil(f.w / 12))), h: Math.max(1, Math.min(4, Math.ceil(f.d / 12))), by: nm(c, "me"), at: null }],
          };
        },
      },
    ],
  },
  {
    id: "mp-price-check",
    surface: "marketplace",
    land: "page",
    title: (c) => `Is $${num(c, "price")} fair?`,
    summary: () => "rate it",
    template: "poll",
    asks: ["is this a good price", "is the price fair", "price check", "fair price", "too much", "overpriced", "worth it", "what should i offer"],
    tools: [
      {
        tool: "lab:price-check",
        params: (c) => {
          const comps = LISTING_FACTS[c.object.id]?.comps ?? [];
          const sorted = [...comps].sort((a, b) => a - b);
          return {
            item: c.title,
            listed: `listed in ${str(c, "where")}`,
            seller: str(c, "seller"),
            askCents: num(c, "price") * 100,
            comps: sorted.map((x, i) => ({ label: `Sold ${i + 1}`, cents: x * 100 })),
            fairLowCents: (sorted[1] ?? sorted[0] ?? 0) * 100,
            fairHighCents: (sorted.at(-2) ?? sorted.at(-1) ?? 0) * 100,
            pins: [],
            quote: "",
            pickup: str(c, "pickup"),
          };
        },
      },
    ],
  },
  {
    id: "mp-decide",
    surface: "marketplace",
    land: "chat",
    title: (c) => `Which ${str(c, "kind")}?`,
    summary: (c) => `${Math.max(2, list(c, "savedTitles").length)} · vote`,
    template: "poll",
    source: (c) => `**${nm(c, "me")}** shared ${Math.max(2, list(c, "savedTitles").length)} ${str(c, "kind")}${Math.max(2, list(c, "savedTitles").length) > 1 ? (str(c, "kind").endsWith("ch") ? "es" : "s") : ""} from **Marketplace**`,
    asks: ["decide with roommates", "which one should we get", "help us choose", "vote on these", "compare"],
    chat: () => ({ prefer: ["apt4b"] }),
    tools: [
      {
        tool: "lab:group-buy",
        params: (c) => ({
          title: `${cap(str(c, "kind"))} hunt · apt 4b`,
          listings: savedOrThis(c).map((x) => ({ name: clip(x.title, 24), priceCents: x.price * 100, where: x.where, style: /sectional/i.test(x.title) ? "sectional" : /velvet/i.test(x.title) ? "velvet" : "other", color: "mustard", quote: "" })),
          votes: [],
          wins: Math.min(3, c.people.length),
          pickup: str(c, "pickup"),
        }),
      },
    ],
  },
  {
    id: "mp-split",
    surface: "marketplace",
    land: "chat",
    title: (c) => clip(`${c.title} split`, 60),
    summary: () => "add what you paid",
    template: "bill-split",
    asks: ["split it", "split the cost", "split this", "share the cost", "chip in", "go halves"],
    chat: () => ({ prefer: ["apt4b"] }),
    tools: [
      {
        tool: "lab:split-purchase",
        params: (c) => ({ title: clip(`Split the ${c.title.toLowerCase()}`, 40), item: c.title, priceCents: num(c, "price") * 100, seller: `from ${str(c, "seller")} · ${str(c, "where")}`, owners: c.people.map((p) => nm(c, p)), weeks: [], holders: [], pickup: str(c, "pickup"), note: "" }),
      },
    ],
  },
  {
    id: "mp-pickup",
    surface: "marketplace",
    land: "chat",
    title: () => "Pickup plan",
    summary: () => "0 of 4 taken",
    template: "poll",
    asks: ["plan the pickup", "pick it up", "who can help carry", "pickup", "move it", "need a truck", "who has a car"],
    chat: () => ({ prefer: ["apt4b"] }),
    tools: [],
  },
  {
    id: "mp-move-out",
    surface: "marketplace",
    land: "chat",
    title: () => "Move-out sale",
    summary: () => `${MY_LISTINGS.length} things · claim`,
    template: "poll",
    asks: ["move out sale", "move-out sale", "selling my stuff", "sell everything", "friends first", "selling a few things"],
    tools: [],
  },
  {
    id: "mp-lineage",
    surface: "marketplace",
    land: "page",
    title: () => "This couch has lore",
    summary: () => "4 owners since 2020",
    template: "poll",
    asks: ["who owned this", "history of this", "has anyone had this", "where has it been", "owners", "lore"],
    tools: [], // rich-lab.ts: lab:couch-lineage
  },

  // ============================================================ Home feed
  {
    id: "feed-ranking",
    surface: "feed",
    land: "page",
    title: () => "Best boba on telegraph",
    summary: () => "round 1 · vote",
    template: "bracket",
    asks: ["add my ranking", "rank these", "my ranking", "tier list", "vote on this ranking", "head to head"],
    tools: [
      { tool: "lab:feed-tier-list", params: (c) => ({ title: "Best boba on telegraph", author: str(c, "by"), items: list(c, "items").map((name) => ({ name, votes: [0, 0, 0, 0, 0] })), people: [] }) },
    ],
  },
  {
    id: "feed-birthday",
    surface: "feed",
    land: "chat",
    title: (c) => `${str(c, "subject")}'s 21st`,
    summary: () => "4 things · 0 taken",
    template: "poll",
    asks: ["birthday", "sign the card", "chip in", "gift", "plan the birthday", "surprise"],
    chat: (c) => {
      const p = FEED_POSTS.find((x) => x.id === c.object.id);
      if (!p?.subject) return null;
      return { key: `feed:${p.id}`, name: `${str(c, "subject")}'s 21st`, members: c.people.filter((x) => x !== "me" && x !== p.subject) };
    },
    tools: [
      {
        tool: "lab:gift-pool",
        params: (c) => ({ recipient: str(c, "subject"), occasion: `turns 21 ${str(c, "when")}`, gift: "", giftNote: "", quote: "", quoteDate: "", goalCents: 1500 * Math.max(2, c.people.length - 2), shareCents: 1500, crew: c.people.filter((p) => nm(c, p) !== str(c, "subject")).map((p) => nm(c, p)), paid: [] }),
      },
    ],
  },
  {
    id: "feed-move",
    surface: "feed",
    land: "page",
    title: (c) => `Help ${str(c, "by")} move`,
    summary: () => "0 of 4 filled",
    template: "poll",
    asks: ["help move", "help them move", "carry boxes", "moving help", "sign up to help"],
    tools: [],
  },
  {
    id: "feed-challenge",
    surface: "feed",
    land: "page",
    title: () => "30 days of climbing",
    summary: () => "day 1",
    template: "poll",
    asks: ["join the challenge", "challenge", "streak", "30 days", "track it together"],
    tools: [],
  },
  {
    id: "feed-plan",
    surface: "feed",
    land: "page",
    title: (c) => (str(c, "when") ? "Tahoe cabin" : "Plans this weekend"),
    summary: (c) => `${num(c, "spots") || 2} spots left`,
    template: "whos-in",
    asks: ["ask to join", "can i come", "join their plan", "spots left", "join the trip"],
    tools: [],
  },
  {
    id: "feed-remix",
    surface: "feed",
    land: "chat",
    title: () => "Chore wheel remix",
    summary: () => "3 groups use it",
    template: "poll",
    asks: ["remix this", "use this for us", "our own chore wheel", "make one for my place", "copy this tool", "copy this mini"],
    chat: () => ({ prefer: ["apt4b"] }),
    tools: [], // rich-lab.ts: lab:remix-card
  },
  {
    id: "feed-bracket",
    surface: "feed",
    land: "page",
    title: () => "Late night food bracket",
    summary: () => "semis · vote",
    template: "bracket",
    asks: ["bracket", "vote in the bracket", "head to head", "make a bracket", "semis"],
    tools: [], // rich-lab.ts: lab:bracket-post
  },
  {
    id: "feed-event",
    surface: "feed",
    land: "page",
    title: () => "Who you know going",
    summary: () => "5 friends · 18 people",
    template: "whos-in",
    asks: ["who else is going", "who do i know going", "anyone i know", "who's going", "friends going"],
    tools: [], // rich-lab.ts: lab:squad-constellation
  },

  // ============================================================ Reels
  {
    id: "reel-to-try",
    surface: "reel",
    land: "chat",
    title: () => "To try",
    summary: (c) => `${list(c, "places").length} places · vote`,
    template: "poll",
    asks: ["to try list", "add to our list", "we should go", "try this place", "save this restaurant", "food list"],
    tools: [],
  },
  {
    id: "reel-cook-night",
    surface: "reel",
    land: "chat",
    title: (c) => clip(`Cook night: ${str(c, "dish").toLowerCase()}`, 60),
    summary: (c) => `${list(c, "ingredients").length} things to bring`,
    template: "poll",
    asks: ["cook night", "let's make this", "make this recipe", "cook this", "who brings what", "ingredients"],
    tools: [
      // lab:reel-cook-night is 514 px tall at rest with this reel's 6 ingredients (budget 420); it waits below.
      {
        tool: "lab:reel-cook-night",
        params: (c) => ({
          reel: { from: nm(c, "me"), note: "", account: str(c, "handle"), title: str(c, "dish"), plays: "12.8K likes" },
          host: nm(c, "me"),
          time: "7pm",
          serves: Math.max(2, c.people.length),
          costCents: 0,
          items: list(c, "ingredients").map((label) => ({ label, by: "" })),
          nights: [
            { day: "Fri", date: "this week", votes: [] },
            { day: "Sun", date: "this week", votes: [] },
          ],
        }),
      },
    ],
  },
  {
    id: "reel-hike",
    surface: "reel",
    land: "chat",
    title: (c) => clip(str(c, "trail") ? cap(str(c, "trail")) : "Hike", 60),
    summary: () => "tap what works",
    template: "poll",
    asks: ["hike plan", "let's do this hike", "go on this hike", "when can we hike", "plan the hike", "hike"],
    tools: [],
  },
  {
    id: "reel-rank",
    surface: "reel",
    land: "chat",
    title: () => "This week's reels",
    summary: () => "round 1 · vote",
    template: "bracket",
    asks: ["rank the reels", "best reel", "rank this week's reels", "which reel wins"],
    tools: [],
  },

  // ============================================================ Stories
  {
    id: "story-plan",
    surface: "story",
    land: "chat",
    title: (c) => `${cap(str(c, "winner"))} sat`,
    summary: (c) => `1 of ${c.people.length} in`,
    template: "whos-in",
    asks: ["make it a plan", "make this a plan", "let's actually do it", "plan it", "who's in"],
    chat: (c) => ({ key: `story:${str(c, "poll")}`, name: `${str(c, "winner")} sat`, members: others(c) }),
    tools: [
      {
        tool: "lab:trip-lock",
        params: (c) => ({
          title: `${cap(str(c, "winner"))} sat`,
          sub: `Muse plan · ${num(c, "votes")} voted ${str(c, "winner")}`,
          date: str(c, "when"),
          from: "Campus",
          to: str(c, "place"),
          details: `${str(c, "when")} · ${str(c, "place")}`,
          deadline: "Headcount Fri at 9:00 PM",
          seats: c.people.slice(0, 6).map((id, k) => ({ code: `1${"ABCDEF"[k]}`, who: id === "me" ? nm(c, "me") : "" })),
          lockAt: Math.min(4, c.people.length),
        }),
      },
    ],
  },
  {
    id: "story-again",
    surface: "story",
    land: "chat",
    title: () => `${TRIP.name} again`,
    summary: () => "tap what works",
    template: "poll",
    asks: ["do it again", "let's go back", "same trip again", "again this year", "plan it again"],
    chat: () => ({ key: `story:${TRIP.storyId}:again`, name: `${TRIP.name} again`, members: TRIP.people.filter((p) => p !== viewerId()) }),
    tools: [
      {
        tool: "lab:date-swipe",
        params: () => ({
          place: TRIP.name,
          lockAt: TRIP.people.length,
          weekends: [
            { label: "Dec 5–7", month: "Dec", day: 5, span: "Fri–Sun", why: "", free: [] },
            { label: "Dec 12–14", month: "Dec", day: 12, span: "Fri–Sun", why: "", free: [] },
            { label: "Jan 9–11", month: "Jan", day: 9, span: "Fri–Sun", why: "", free: [] },
          ],
        }),
      },
    ],
  },
  {
    id: "story-recap",
    surface: "story",
    land: "chat",
    title: () => `${TRIP.name} · 1 year ago`,
    summary: () => `${TRIP.facts.length} cards`,
    template: "poll",
    asks: ["recap", "make a recap", "trip recap", "remember this trip", "wrapped"],
    chat: () => ({ key: `story:${TRIP.storyId}:recap`, name: TRIP.name, members: TRIP.people.filter((p) => p !== viewerId()) }),
    tools: [],
  },

  {
    id: "story-trip",
    surface: "story",
    land: "page",
    title: () => `${TRIP.name} · a year ago`,
    summary: () => "3 days · tap through",
    template: "poll",
    asks: ["trip story", "story of the trip", "map of the trip"],
    tools: [
      {
        tool: "lab:trip-story",
        params: () => ({
          city: TRIP.name,
          days: 3,
          dates: "Nov 10-12",
          stops: [
            { label: "Eastfield", x: 0.78, y: 0.12 },
            { label: "Highway 1", x: 0.55, y: 0.42 },
            { label: "Nepenthe", x: 0.38, y: 0.68 },
            { label: "McWay Falls", x: 0.3, y: 0.86 },
          ],
          miles: "312 mi",
          milesNote: "Eastfield to Big Sur and back",
          moment: "Nepenthe · Maya picked it",
          mvp: { who: "Will", facts: ["Posted 11 of the 27 stories"] },
          costs: [],
          next: "Big Sur again",
        }),
      },
    ],
  },
  {
    id: "story-face-drop",
    surface: "story",
    land: "page",
    title: () => "Face drop",
    summary: () => "tap to drop a face",
    template: "poll",
    asks: ["face drop", "drop faces", "a story to poke", "something silly for my story"],
    tools: [], // rich-lab.ts: lab:face-drop
  },

  // ============================================================ Gaming
  {
    id: "game-trivia",
    surface: "gaming",
    land: "chat",
    title: () => "Apt 4b trivia",
    summary: () => "2 questions",
    template: "poll",
    asks: ["trivia", "trivia from our chat", "quiz", "how well do you know", "trivia night"],
    chat: () => ({ prefer: ["apt4b"] }),
    tools: [
      {
        tool: "lab:friend-trivia-pub",
        params: (c) => ({
          title: "How well do you know apt 4b?",
          by: nm(c, "me"),
          plays: 0,
          questions: (CHAT_FACTS.apt4b ?? []).map((q) => factQuestion(q, (id) => castFirst(id) ?? id)),
          played: [],
        }),
      },
    ],
  },
  {
    id: "game-challenge",
    surface: "gaming",
    land: "chat",
    title: () => "Daily puzzle",
    summary: () => "check in today",
    template: "poll",
    asks: ["challenge back", "beat their score", "daily puzzle", "challenge arun", "rematch"],
    chat: () => ({ chatId: FRIEND_SCORE.chatId }),
    tools: [],
  },
];

// Rich lab tools first (rich-lab.ts, then rich.ts), in their files' order, above the scenario's own list.
for (const s of PACK) s.tools.unshift(...[...RICH_LAB, ...RICH].filter((r) => r.scenario === s.id).map((r) => ({ tool: r.tool, params: r.params })));

export const scenario = (id: string) => PACK.find((s) => s.id === id);

/** Reel facts by id, for readers that only have the reel. */
export const reelKind = (id: string) => REEL_FACTS[id]?.kind ?? null;
