// Lab tools as rich as their own examples: friends already in them (votes, claims, rides, notes,
// requests), with this page's people and facts. Each entry goes to the top of its scenario's
// tool list (pack.ts), so it is the first choice; the older entries stay below as fallbacks.
// The made-up friends talk like a college group chat.

import { castFirst } from "../store/cast";
import { factQuestion, CHAT_FACTS, EASTFIELD_MAP, EVENT_FACTS, GROUP_FACTS, LISTING_FACTS, MY_LISTINGS, ROOM_4B, SUBLET_FACTS, TRIP } from "./seed";
import type { PageContext, ToolChoice } from "./types";

const nm = (c: PageContext, id: string) => c.names[id] ?? id;
const str = (c: PageContext, k: string) => (c.facts[k] === undefined ? "" : String(c.facts[k]));
const num = (c: PageContext, k: string) => Number(c.facts[k] ?? 0);
const list = (c: PageContext, k: string) => (Array.isArray(c.facts[k]) ? (c.facts[k] as string[]) : []);
const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1).trimEnd() : s);
/** The viewer's first name, unless it is one of the friends already named (then a friend who is not). */
const me = (c: PageContext) => nm(c, "me");
const others = (c: PageContext, names: string[]) => names.filter((n) => n !== me(c));
const shortWhen = (c: PageContext) => {
  const m = /^(\w+),.*?(\d+ [AP]M)$/.exec(str(c, "when"));
  return m ? `${m[1]} ${m[2]}` : str(c, "when");
};

export const RICH: (ToolChoice & { scenario: string })[] = [
  // ---------------------------------------------------------------- Events
  {
    scenario: "event-go-together",
    tool: "lab:squad-lock",
    params: (c) => ({
      title: "Go with friends",
      sub: `${c.title} · ${str(c, "venue")} · ${num(c, "interested").toLocaleString("en-US")} interested`,
      date: str(c, "when").toUpperCase(),
      tickets: list(c, "tickets").join(" · "),
      host: me(c),
      threshold: 4,
      going: [
        { name: me(c), note: "" },
        ...others(c, ["Maya", "Arun"]).map((name) => ({ name, note: name === "Maya" ? "already asked for friday off" : "i'll drive 3 if we need" })),
      ],
      maybe: others(c, ["Will"]),
    }),
  },
  {
    scenario: "event-carpool",
    tool: "lab:event-carpool",
    params: (c) => ({
      title: `Rides to ${str(c, "venue")}`,
      place: `${str(c, "venue")} · ${shortWhen(c)}`,
      cars: [
        { driver: "Maya", model: "Civic", seats: 4, leaves: "7:00", from: "Unit 4B", costCents: 1200, costLabel: "Meridian lot", riders: ["Will"] },
        { driver: "Arun", model: "RAV4", seats: 5, leaves: "7:15", from: "Northside", costCents: 1200, costLabel: "Meridian lot", riders: ["Calvin"] },
        { driver: "Aditya", model: "Jeep", seats: 4, leaves: "7:30", from: "Clark Kerr", costCents: 0, costLabel: "Street", riders: [] },
      ],
    }),
  },
  {
    scenario: "event-setlist",
    tool: "lab:setlist-bingo",
    params: (c) => {
      const songs = EVENT_FACTS[c.object.id]?.setlist ?? [];
      const cells = [
        ...songs,
        "Crowd sings along", "Phones up", "Acoustic one", "Says Eastfield", "New song", "Encore",
        "Band intros", "Confetti", "Covers a classic", "Light show", "Slow dance", "Guitar swap",
        "Water toss", "Someone cries", "Backup vocals solo", "Shoes off", "Tour shirt toss", "Two encores",
      ].slice(0, 24);
      return {
        title: "Setlist bingo",
        sub: `${c.title.replace(/ live$/, "")} · ${str(c, "venue")} · ${shortWhen(c)}`,
        cells,
        played: [0, 6, 7],
        marks: [
          { name: "Maya", cells: [0, 6, 7] },
          { name: "Arun", cells: [0, 7] },
          { name: "Will", cells: [6] },
        ],
      };
    },
  },
  {
    scenario: "event-meet-before",
    tool: "lab:pregame-vote",
    params: (c) => ({
      title: `Before ${clip(c.title, 28)}`,
      sub: `Doors 7:00 · ${c.people.length} going`,
      venue: str(c, "venue"),
      doorsMin: 19 * 60,
      spots: list(c, "nearby").slice(0, 3).map((n, i) => ({ name: n.split(" · ")[0], walk: Number(/(\d+) min/.exec(n)?.[1] ?? 5), x: [0.22, 0.48, 0.72][i], y: [0.62, 0.36, 0.7][i], voters: [["Maya", "Arun"], ["Will"], []][i] })),
      times: [{ label: "6:00 PM", voters: ["Arun"] }, { label: "6:30 PM", voters: ["Maya", "Will"] }, { label: "7:00 PM", voters: [] }],
      streets: [{ name: "Campus Row", x: 0.4, y: 0.82 }],
    }),
  },
  {
    scenario: "event-bring-list",
    tool: "lab:bring-list",
    params: (c) => ({
      title: c.title,
      sub: `${shortWhen(c)} · ${str(c, "venue")} · ${num(c, "going")} coming`,
      items: [
        { label: "Mashed potatoes", kind: "other", by: ["Maya"] },
        { label: "Mac and cheese", kind: "mac", by: [] },
        { label: "Green beans", kind: "salad", by: ["Aditya"] },
        { label: "Pie", kind: "pie", by: ["Will"] },
        { label: "Drinks", kind: "drinks", by: ["Calvin", "Arun"] },
        { label: "Plates and cups", kind: "cups", by: [] },
      ],
    }),
  },
  {
    scenario: "event-open-spots",
    tool: "lab:open-spots",
    params: (c) => ({
      title: c.title,
      when: `${shortWhen(c)} · ${str(c, "venue")}`,
      going: c.people.slice(0, 6).map((p) => nm(c, p)),
      spots: EVENT_FACTS[c.object.id]?.spots ?? 3,
      requests: [
        { name: "Lena Ortiz", meta: "Lives on Dwight · sublets group", mutuals: ["Maya"], note: "can bring a pie, a real one" },
        { name: "Kofi Mensah", meta: "Grad student · climbing club", mutuals: ["Will", "Arun"], note: "first friendsgiving ever, very excited" },
        { name: "Cami Reyes", meta: "cami.eats on Reels", mutuals: ["Aditya"], note: "i make a mean mac and cheese" },
      ],
    }),
  },

  // ---------------------------------------------------------------- Groups
  {
    scenario: "group-sublet-finder",
    tool: "lab:sublet-finder",
    params: (c) => ({
      group: c.title,
      posts: SUBLET_FACTS.length,
      swiped: 3,
      budgets: [80000, 100000, 125000],
      listings: SUBLET_FACTS.map((x, i) => ({
        hood: x.title,
        city: "Eastfield",
        priceCents: x.cents,
        dates: x.detail.split(" · ")[0],
        perk: x.detail.split(" · ").slice(1, -1).join(" · ") || "near campus",
        via: i === 0 ? "Maya's lab partner" : i === 4 ? "Aditya's old RA" : "",
        viaWho: i === 0 ? "Maya" : i === 4 ? "Aditya" : "",
        mutuals: [2, 0, 1, 0, 3, 0, 1][i] ?? 0,
        view: i % 5,
        x: 0.15 + ((i * 0.23) % 0.7),
        y: 0.15 + ((i * 0.31) % 0.7),
      })),
      people: [
        { name: "Maya", saved: ["2br on dwight", "3br on hearst"], passed: ["studio on telegraph"] },
        { name: "Will", saved: ["2br on dwight"], passed: [] },
      ],
      labels: EASTFIELD_MAP,
    }),
  },
  {
    scenario: "group-best-of",
    tool: "lab:best-of",
    params: (c) => {
      const r = GROUP_FACTS[c.object.id]?.repeated;
      return {
        group: c.title,
        members: num(c, "members"),
        question: "Best place for used climbing shoes",
        posts: r?.times ?? 6,
        replies: 41,
        helped: 18,
        asks: [
          { who: "Kofi", text: "where do you get cheap used shoes?", ago: "2h" },
          { who: "Cami", text: "anyone selling shoes size 8", ago: "4d" },
          { who: "Sam", text: "used shoe recs?? mine have a hole", ago: "2w" },
        ],
        picks: [
          { name: "Thursday gear swap", detail: "Rec center lobby · free", mentions: 14, rating: 4.8, quotes: [{ who: "Ines", text: "got la sportivas for $40 there" }, { who: "Arun", text: "bring cash, it goes fast" }] },
          { name: "REI used", detail: "Online · ships in 3 days", mentions: 9, rating: 4.4, quotes: [{ who: "Maya", text: "returns are easy, sizing is not" }] },
          { name: "Sports Basement", detail: "Bayside · rental sale", mentions: 6, rating: 4.1, quotes: [{ who: "Will", text: "end of season rentals are like $35" }] },
          { name: "Eastfield Outdoor", detail: "Telegraph · pricey", mentions: 3, rating: 3.9, quotes: [{ who: "Calvin", text: "nice people, not cheap" }] },
        ],
        plus: [{ name: "Will", pick: "Thursday gear swap" }, { name: "Maya", pick: "Thursday gear swap" }],
      };
    },
  },
  {
    scenario: "group-signup",
    tool: "lab:signup-board",
    params: (c) => ({
      title: "Wall night setup",
      group: c.title,
      date: "Tue",
      meet: "Rec center wall",
      shifts: ["6:40 PM", "7:00 PM", "9:00 PM"],
      roles: [
        { label: "Gear room", icon: "clipboard", cap: 1, others: [["Ines"], [], ["Kofi"]] },
        { label: "Mats", icon: "cart", cap: 2, others: [["Cami"], [], []] },
        { label: "Shoes", icon: "water", cap: 2, others: [[], ["Sam"], []] },
      ],
      people: [
        { name: "Maya", role: "Mats", shift: "6:40 PM" },
        { name: "Will", role: "Shoes", shift: "7:00 PM" },
      ],
    }),
  },
  {
    scenario: "group-roommates",
    tool: "lab:roommate-match",
    params: (c) => ({
      group: c.title,
      took: 86,
      listings: [
        { name: "Ines", hood: "College Ave", note: "fall · early sleeper", answers: [0, 0, 1, 2, 1, 0] },
        { name: "Sam", hood: "Hearst", note: "3br, $890 each", answers: [2, 1, 1, 1, 2, 1] },
        { name: "Kofi", hood: "Near campus", note: "grad student from Aug", answers: [0, 1, 0, 2, 0, 1] },
        { name: "Lena", hood: "Dwight", note: "has a very loud cat", answers: [1, 2, 2, 0, 1, 2] },
        { name: "Ruth", hood: "Hearst", note: "taking over a lease", answers: [1, 0, 1, 1, 1, 1] },
      ],
      people: [{ name: "Maya", picks: [1, 0, 1, 1, 2, 1], hi: ["Ruth"] }],
    }),
  },
  {
    scenario: "group-meeting-time",
    tool: "lab:meeting-time",
    params: (c) => ({
      group: c.title,
      members: num(c, "members"),
      place: "The wall, back room",
      starts: "next week",
      days: ["Mon", "Tue", "Wed", "Thu"],
      times: ["7pm", "9pm"],
      counts: [[9, 14, 8, 11], [5, 7, 6, 9]],
      people: [
        { name: "Maya", free: ["Tue 7pm", "Thu 7pm"] },
        { name: "Arun", free: ["Tue 7pm", "Wed 7pm"] },
        { name: "Will", free: ["Thu 7pm"] },
      ],
    }),
  },
  {
    scenario: "group-dues",
    tool: "lab:club-dues",
    params: (c) => {
      const d = GROUP_FACTS[c.object.id]?.dues ?? { label: "Dues", cents: 2000, paid: 31, of: 52 };
      return {
        club: c.title,
        term: "spring",
        duesCents: d.cents,
        due: "Feb 1",
        members: d.of,
        paidOutside: d.paid - 2,
        names: ["Ines", "Kofi", "Cami", "Sam", "Lena", "Marco", "Ruth"],
        goals: [
          { label: "Chalk for the semester", amountCents: 24000 },
          { label: "Two new crash pads", amountCents: 52000 },
          { label: "Spring trip gas", amountCents: 28000 },
        ],
        paid: ["Maya", "Aditya"],
      };
    },
  },

  // ---------------------------------------------------------------- Marketplace
  {
    scenario: "mp-room-fit",
    tool: "lab:room-fit",
    params: (c) => {
      const f = LISTING_FACTS[c.object.id] ?? { w: 48, d: 24, comps: [], pickup: "" };
      return {
        room: ROOM_4B.name,
        cols: 12,
        rows: 7,
        fixed: [
          { label: "Bed", kind: "bed", x: 9, y: 0, w: 3, h: 4 },
          { label: "Closet", kind: "closet", x: 0, y: 0, w: 2, h: 1 },
        ],
        finds: [
          { name: clip(c.title, 16), priceCents: num(c, "price") * 100, w: Math.max(1, Math.min(6, Math.ceil(f.w / 12))), h: Math.max(1, Math.min(4, Math.ceil(f.d / 12))), by: me(c), at: null },
          { name: "Rug", priceCents: 4000, w: 3, h: 3, by: "Maya", at: [5, 2] },
          { name: "Desk", priceCents: 9000, w: 3, h: 1, by: "Aditya", at: null },
          { name: "Floor lamp", priceCents: 1500, w: 1, h: 1, by: "Will", at: null },
        ],
      };
    },
  },
  {
    scenario: "mp-price-check",
    tool: "lab:price-check",
    params: (c) => {
      const comps = [...(LISTING_FACTS[c.object.id]?.comps ?? [])].sort((a, b) => a - b);
      const ask = num(c, "price") * 100;
      return {
        item: c.title,
        listed: "listed 2 days ago",
        seller: str(c, "seller"),
        askCents: ask,
        comps: comps.map((x, i) => ({ label: ["Ikea one", "Same couch", "Bigger", "Like new", "Leather"][i] ?? `Sold ${i + 1}`, cents: x * 100 })),
        fairLowCents: (comps[1] ?? comps[0] ?? 0) * 100,
        fairHighCents: (comps.at(-2) ?? comps.at(-1) ?? 0) * 100,
        pins: [
          { name: "Will", cents: Math.round((ask * 0.8) / 500) * 500 },
          { name: "Aditya", cents: Math.round((ask * 0.75) / 500) * 500 },
        ],
        quote: `Aditya: “offer ${Math.round((ask * 0.75) / 100)}, they said it ${str(c, "pickup") || "has to go"}”`,
        pickup: str(c, "pickup"),
      };
    },
  },
  {
    scenario: "mp-decide",
    tool: "lab:group-buy",
    params: (c) => {
      const saved = (Array.isArray(c.facts.savedTitles) ? (c.facts.savedTitles as string[]) : []).map((t) => {
        const m = /^(.*) \$(\d+)$/.exec(t);
        return { title: m?.[1] ?? t, price: Number(m?.[2] ?? 0) };
      });
      const rows = saved.length >= 2 ? saved : [{ title: c.title, price: num(c, "price") }];
      const quotes = ["Maya: “fits all of us for movie night”", "Aditya: “velvet is rich roommate energy”", "Will: “cheap and it folds, done”"];
      return {
        title: `${str(c, "kind").replace(/^./, (x) => x.toUpperCase())} hunt · apt 4b`,
        listings: rows.map((x, i) => ({ name: clip(x.title, 24), priceCents: x.price * 100, where: `${[1.2, 2.4, 0.6][i] ?? 1} mi · ${str(c, "where")}`, style: /sectional/i.test(x.title) ? "sectional" : /velvet/i.test(x.title) ? "velvet" : "other", color: "mustard", quote: quotes[i] ?? "" })),
        votes: [{ name: "Maya", listing: 0 }, { name: "Aditya", listing: Math.min(1, rows.length - 1) }],
        wins: 3,
        pickup: `Sun 11am · Aditya's hatchback`,
      };
    },
  },
  {
    scenario: "mp-pickup",
    tool: "lab:move-in-day",
    params: (c) => ({
      title: "Couch pickup",
      sub: `Sun · from ${str(c, "seller")}'s`,
      stops: [
        { time: "10:00", label: "Car" },
        { time: "10:30", label: "Load" },
        { time: "11:00", label: "Drive" },
        { time: "11:20", label: "Carry up" },
        { time: "12:00", label: "Tacos" },
      ],
      stage: 0,
      items: [{ name: clip(c.title, 18), need: 3, note: `${num(c, "width")} in, tilt it`, cuft: 90, kind: "couch", hands: ["Aditya"] }],
      boxes: { label: "Cushions", cuft: 20 },
      truckCuft: 120,
      after: `Tacos after, on ${me(c)}`,
    }),
  },

  // ---------------------------------------------------------------- Home feed
  {
    scenario: "feed-ranking",
    tool: "lab:feed-tier-list",
    params: (c) => ({
      title: "Best boba on telegraph",
      author: str(c, "by"),
      items: list(c, "items").map((name, i) => ({ name, votes: [[18, 9, 4, 2, 1], [11, 14, 6, 3, 1], [6, 10, 12, 5, 2], [3, 6, 9, 11, 7]][i] ?? [2, 3, 4, 3, 2] })),
      people: [
        { name: "Maya", tiers: ["S", "A", "B", "C"] },
        { name: "Will", tiers: ["A", "S", "B", "D"] },
        { name: "Arun", tiers: ["S", "B", "A", "C"] },
      ],
    }),
  },
  {
    scenario: "feed-birthday",
    tool: "lab:gift-pool",
    params: (c) => ({
      recipient: str(c, "subject"),
      occasion: `turns 21 ${str(c, "when").toLowerCase()}`,
      gift: "Instax camera",
      giftNote: "she keeps stealing mine",
      quote: "i need a film camera so bad",
      quoteDate: "Oct 2",
      goalCents: 12000,
      shareCents: 2400,
      crew: ["Calvin", "Maya", "Aditya", "Arun", me(c)].filter((n, i, a) => a.indexOf(n) === i && n !== str(c, "subject")),
      paid: ["Calvin", "Maya"],
    }),
  },
  {
    scenario: "feed-move",
    tool: "lab:move-in-day",
    params: (c) => ({
      title: `${str(c, "by")}'s move`,
      sub: `${str(c, "when")} · the dorm to 4B`,
      stops: [
        { time: "9:00", label: "Van" },
        { time: "9:30", label: "Load" },
        { time: "10:30", label: "Drive" },
        { time: "11:00", label: "Unload" },
        { time: "12:30", label: "Pizza" },
      ],
      stage: 0,
      items: [
        { name: "Mattress", need: 2, note: "twin xl, very floppy", cuft: 40, kind: "mattress", hands: ["Arun"] },
        { name: "Desk", need: 2, note: "the legs come off", cuft: 30, kind: "table", hands: [] },
        { name: "TV", need: 1, note: "the careful one", cuft: 15, kind: "tv", hands: ["Calvin"] },
      ],
      boxes: { label: "14 boxes", cuft: 90 },
      truckCuft: 250,
      after: `Pizza at 12:30, on ${str(c, "by")}`,
    }),
  },

  {
    scenario: "feed-plan",
    tool: "lab:squad-lock",
    params: (c) => ({
      title: "Tahoe cabin",
      sub: `${str(c, "when")} · cabin sleeps 8 · ${num(c, "spots") || 2} spots left`,
      date: str(c, "when").toUpperCase(),
      tickets: "$85 each for the cabin · chains in Marco's car",
      host: str(c, "by"),
      threshold: 8,
      going: [
        { name: str(c, "by"), note: "booked it, no refunds lol" },
        { name: "Arun", note: "bringing the speaker" },
        { name: "Aditya", note: "can drive 3 friday" },
      ],
      maybe: ["Will"],
    }),
  },

  // ---------------------------------------------------------------- Reels
  {
    scenario: "reel-to-try",
    tool: "lab:reel-to-try",
    params: (c) => {
      const places = list(c, "places");
      return {
        reel: { from: me(c), note: "we need to go", account: str(c, "handle"), caption: clip(str(c, "caption"), 60), likes: "18K", place: places[0] ?? "", area: "Telegraph" },
        spots: [
          { name: "El Primo truck", area: "Telegraph", tried: "Oct 3", ratings: [{ by: "Maya", stars: 5 }, { by: "Aditya", stars: 4 }], want: [] },
          { name: "Tacos Lupe", area: "Shattuck", tried: "", ratings: [], want: ["Will", "Aditya"] },
          ...places.slice(1).map((name) => ({ name, area: "Telegraph", tried: "", ratings: [], want: ["Maya"] })),
        ].slice(0, 4),
        compact: true, // lands in a chat: 420 px
      };
    },
  },
  {
    scenario: "reel-cook-night",
    tool: "lab:reel-cook-night",
    params: (c) => ({
      reel: { from: me(c), note: "we're making this", account: str(c, "handle"), title: str(c, "dish"), plays: "1.2M plays" },
      host: me(c),
      time: "7pm",
      serves: Math.max(4, c.people.length),
      costCents: 2400,
      items: list(c, "ingredients").slice(0, 5).map((label, i) => ({ label, by: ["", "Maya", "", "Will", ""][i] ?? "" })),
      nights: [
        { day: "Fri", date: "Nov 14", votes: ["Maya", "Will"] },
        { day: "Sun", date: "Nov 16", votes: ["Aditya"] },
      ],
    }),
  },
  {
    scenario: "reel-hike",
    tool: "lab:event-carpool",
    params: (c) => ({
      title: `Rides to ${clip(str(c, "trail") || "the hike", 28)}`,
      place: "Sibley · Sun at sunset",
      cars: [
        { driver: "Maya", model: "Civic", seats: 4, leaves: "4:15", from: "Unit 4B", costCents: 0, costLabel: "Free lot", riders: ["Will"] },
        { driver: "Aditya", model: "Jeep", seats: 4, leaves: "4:30", from: "Clark Kerr", costCents: 0, costLabel: "Free lot", riders: [] },
      ],
    }),
  },

  // ---------------------------------------------------------------- Stories
  {
    scenario: "story-again",
    tool: "lab:date-swipe",
    params: () => ({
      place: TRIP.name,
      lockAt: TRIP.people.length,
      weekends: [
        { label: "Dec 5–7", month: "Dec", day: 5, span: "Fri–Sun", why: "dead week, lowkey perfect", free: ["Maya", "Will"] },
        { label: "Dec 12–14", month: "Dec", day: 12, span: "Fri–Sun", why: "after finals · Will flies 14th", free: ["Aditya", "Maya", "Will"] },
        { label: "Jan 9–11", month: "Jan", day: 9, span: "Fri–Sun", why: "before spring starts", free: ["Aditya"] },
      ],
    }),
  },


  // ---------------------------------------------------------------- Gaming
  {
    scenario: "game-trivia",
    tool: "lab:friend-trivia-pub",
    params: () => ({
      title: "How well do you know apt 4b?",
      by: "Maya",
      plays: 14,
      questions: [
        ...(CHAT_FACTS.apt4b ?? []).map((q) => factQuestion(q, (id) => castFirst(id) ?? id)),
        { about: "Aditya", q: "What does Aditya say every time?", options: ["i'll replace it", "not me", "idk u pick", "on my way"], answer: 0 },
        { about: "Maya", q: "What did Maya call the sink?", options: ["a crime scene", "a biohazard", "a swamp", "fine actually"], answer: 1 },
      ],
      played: [
        { who: "Will", picks: [1, 1, 0, 1], points: [180, 160, 170, 190] },
        { who: "Aditya", picks: [0, 1, 2, 0], points: [0, 150, 0, 0] },
      ],
    }),
  },
];
