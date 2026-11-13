// More lab tools as rich as their own examples, for the scenarios that had none (or only a plain
// piece). Same shape as rich.ts; these go above rich.ts's entries for the same scenario. Display
// names come from the cast (`F`), so a rename in store/fake-data.ts follows here.

import { CHAT_MEMBERS, PEOPLE } from "../store/fake-data";
import { CAST_IDS } from "../store/cast";
import { viewerId } from "../lib/media";
import { DEV_POLL, REELS, STRANGERS } from "../surfaces/data";
import { EVENT_FACTS, FRIEND_SCORE, MY_LISTINGS, TRIP } from "./seed";
import type { PageContext, ToolChoice } from "./types";

/** A cast member's first name as the shell shows it ("me" is the viewer). */
export const F = (id: string) => [...PEOPLE, ...STRANGERS].find((p) => p.id === id)?.first ?? id;
const nm = (c: PageContext, id: string) => c.names[id] ?? F(id);
const me = (c: PageContext) => nm(c, "me");
const str = (c: PageContext, k: string) => (c.facts[k] === undefined ? "" : String(c.facts[k]));
const num = (c: PageContext, k: string) => Number(c.facts[k] ?? 0);
const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1).trimEnd() : s);
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
/** "Fri, Nov 21, 9 PM" -> "Fri 9pm" */
const dayTime = (w: string) => {
  const m = /^(\w+),.*?(\d+) ([AP]M)$/.exec(w);
  return m ? `${m[1]} ${m[2]}${m[3]!.toLowerCase()}` : "";
};

const saleKind = (name: string) => {
  const n = name.toLowerCase();
  return /couch|sofa/.test(n) ? "couch" : /desk|table/.test(n) ? "desk" : /lamp|light/.test(n) ? "lamp" : /bike/.test(n) ? "bike" : /fridge/.test(n) ? "fridge" : /plant/.test(n) ? "plant" : "other";
};

export const RICH_LAB: (ToolChoice & { scenario: string })[] = [
  // ---------------------------------------------------------------- Groups
  {
    scenario: "group-welcome",
    tool: "lab:member-galaxy",
    params: (c) => ({
      title: `Welcome to ${clip(c.title.replace(/^Eastfield /, ""), 26)}`,
      group: c.title,
      members: num(c, "members") || 312,
      lenses: [
        {
          label: "By level",
          noun: "level",
          groups: [
            { label: "New to it", count: 96, suggest: [{ name: F("kofi"), mutual: 3 }, { name: F("cami"), mutual: 2 }, { name: "Jae", mutual: 1 }] },
            { label: "V2 to V4", count: 112, suggest: [{ name: F("ines"), mutual: 4 }, { name: F("sam"), mutual: 2 }, { name: "Nadia", mutual: 1 }] },
            { label: "V5 and up", count: 48, suggest: [{ name: F("marco"), mutual: 3 }, { name: "Bo", mutual: 2 }, { name: "Tomas", mutual: 1 }] },
            { label: "Ropes only", count: 56, suggest: [{ name: F("ruth"), mutual: 2 }, { name: F("lena"), mutual: 2 }, { name: "Iris", mutual: 1 }] },
          ],
        },
        {
          label: "By wall night",
          noun: "wall night",
          groups: [
            { label: "Tue nights", count: 120, suggest: [{ name: F("ines"), mutual: 4 }, { name: F("kofi"), mutual: 3 }, { name: "Jae", mutual: 1 }] },
            { label: "Thu nights", count: 98, suggest: [{ name: F("marco"), mutual: 3 }, { name: F("cami"), mutual: 2 }, { name: "Bo", mutual: 1 }] },
            { label: "Sat mornings", count: 94, suggest: [{ name: F("sam"), mutual: 2 }, { name: F("ruth"), mutual: 2 }, { name: "Iris", mutual: 1 }] },
          ],
        },
      ],
      people: [
        { name: F("maya"), at: ["V2 to V4", "Tue nights"] },
        { name: F("theo"), at: ["V5 and up", "Thu nights"] },
        { name: F("priya"), at: ["New to it", "Tue nights"] },
        { name: F("jonah"), at: ["Ropes only", "Sat mornings"] },
        { name: F("dev"), at: ["V2 to V4", "Sat mornings"] },
      ],
    }),
  },

  // ---------------------------------------------------------------- Events
  {
    scenario: "event-setlist",
    tool: "lab:over-under",
    params: (c) => {
      const songs = EVENT_FACTS[c.object.id]?.setlist ?? [];
      return {
        title: `${clip(c.title.replace(/ live$/, ""), 24)} night book`,
        sub: clip(`at ${str(c, "venue")}`, 30),
        props: [
          { who: F("maya"), title: clip(`Opens with ${songs[0] ?? "the hit"}`, 40), context: `${F("maya")} has called it every day since Tuesday.`, kind: "call", line: "", short: clip(`${songs[0] ?? "Hit"} opens`, 16), lean: 560, trend: [500, 520, 545, 530] },
          { who: F("theo"), title: "On stage by", context: `Doors 7, opener 7:30. ${F("theo")} swears she's never late.`, kind: "line", line: "9:10 PM", short: "Stage 9:10", lean: 610, trend: [520, 560, 585, 600] },
          { who: F("priya"), title: "Songs before the encore", context: `Last night's setlist had 18. ${F("priya")} counted twice.`, kind: "line", line: "17.5", short: "Songs 17.5", lean: 470, trend: [500, 480, 490] },
        ],
        book: [
          { who: F("kofi"), prop: 0, side: 1, pts: 100 },
          { who: F("maya"), prop: 0, side: 0, pts: 250 },
          { who: F("theo"), prop: 1, side: 0, pts: 200 },
          { who: F("priya"), prop: 2, side: 1, pts: 50 },
        ],
      };
    },
  },
  {
    scenario: "event-host",
    tool: "lab:host-board",
    params: (c) => ({
      title: clip(c.title, 24),
      when: dayTime(str(c, "when")) || "Fri 9pm",
      host: me(c),
      cap: 45,
      door: F("maya"),
      going: [me(c), F("maya"), F("dev"), F("theo")],
      maybe: [F("jonah")],
      othersGoing: 19,
      othersMaybe: 12,
      guests: [F("ines"), F("kofi"), F("cami"), F("sam"), F("lena")],
      plus: 1,
      rate: 1,
    }),
  },
  {
    scenario: "event-who-knows",
    tool: "lab:squad-constellation",
    params: (c) => ({
      title: "Who you know here",
      show: "the show",
      total: Math.max(20, num(c, "going") || 84),
      knows: [
        { name: F("maya"), people: [F("lena"), F("ines"), "Bea", "Chris", "Hana", "Rob"] },
        { name: F("theo"), people: [F("kofi"), "Raj", "Tom", "Uma"] },
        { name: F("priya"), people: [F("cami"), "Ben", "Zoe", "Max", "Eli"] },
        { name: F("dev"), people: ["Ray", "Gus"] },
        { name: F("jonah"), people: [F("sam")] },
      ],
      asks: [{ from: F("dev"), via: F("priya") }],
    }),
  },
  {
    scenario: "event-after",
    tool: "lab:after-vote",
    params: (c) => ({
      title: "After the show?",
      when: `${str(c, "venue")} ends 11:00`,
      clock: "10:41",
      ends: "11:00",
      meetAt: "11:05",
      options: [
        { name: "Lupe's Tacos", meta: "0.2 mi · til 2am", plan: `Walk 4 min · first round on ${F("theo")}`, icon: "tacos", voters: [F("theo"), F("dev")] },
        { name: "Copper Room karaoke", meta: "0.3 mi · room for 8", plan: "Room booked 11:30 · walk 6 min", icon: "mic", voters: [F("priya")] },
        { name: `${F("maya")}'s roof`, meta: "1.1 mi · BYO snacks", plan: `${F("maya")} has the key · 1 Uber`, icon: "roof", voters: [F("maya")] },
      ],
    }),
  },

  // ---------------------------------------------------------------- Marketplace
  {
    scenario: "mp-move-out",
    tool: "lab:move-out-sale",
    params: (c) => ({
      seller: me(c),
      items: MY_LISTINGS.map((x, i) => ({ name: x.title, priceCents: x.price * 100, kind: saleKind(x.title), claimedBy: [F("maya"), "", F("priya"), ""][i] ?? "" })),
      publicWhen: "Sun 9am",
      pickup: "Sat 10–12 · Apt 4B",
      note: "",
    }),
  },
  {
    scenario: "mp-pickup",
    tool: "lab:pickup-run",
    params: (c) => ({
      title: "Couch pickup run",
      sub: clip(`${str(c, "width") ? `${str(c, "width")}″ ` : ""}${str(c, "kind") || "couch"} · to Apt 4B`, 40),
      item: "couch",
      route: { from: "Apt 4B", to: clip(`${str(c, "seller") || "Seller"} · ${str(c, "where") || "Eastfield"}`, 28), dist: "2.1 mi · 9 min" },
      cars: [
        { driver: F("maya"), car: "Civic", kind: "hatch", fits: 0, seats: "5 seats" },
        { driver: F("dev"), car: "Tacoma", kind: "truck", fits: 2, seats: "2 seats + bed" },
        { driver: F("theo"), car: "RAV4", kind: "wagon", fits: 1, seats: "5 seats + rack" },
      ],
      slots: [
        { label: "Sun 10:00", free: [F("priya"), F("theo")] },
        { label: "Sun 11:30", free: [F("priya"), F("theo"), F("maya"), F("dev")] },
        { label: "Sun 2:00", free: [F("maya")] },
      ],
      crew: 4,
      lifting: [F("theo")],
      need: 2,
    }),
  },
  {
    scenario: "mp-pickup",
    tool: "lab:signup-board",
    params: (c) => ({
      title: "Couch pickup",
      group: "apt 4b",
      date: "Sun",
      meet: clip(`${str(c, "seller") || "Seller"}'s, ${str(c, "where") || "Eastfield"}`, 30),
      shifts: ["10:00 AM", "10:30 AM", "11:15 AM"],
      roles: [
        { label: "Drive", icon: "cart", cap: 1, others: [[F("dev")], [], []] },
        { label: "Carry", icon: "clipboard", cap: 2, others: [[], [F("theo")], [F("maya")]] },
      ],
      people: [],
    }),
  },
  {
    scenario: "mp-lineage",
    tool: "lab:couch-lineage",
    params: (c) => ({
      title: "This couch has lore",
      item: c.title.toLowerCase(),
      eras: [
        { who: F("marco"), year: 2020, paidCents: 64000, place: "bought new", lore: "carried up 3 floors by 5 people" },
        { who: F("jonah"), year: 2022, paidCents: 30000, place: "the den", lore: "survived the den's halloween party" },
        { who: F("maya"), year: 2024, paidCents: 18000, place: "Apt 4B", lore: "movie night HQ, 40 films" },
        { who: F("ruth"), year: 2025, paidCents: (num(c, "price") || 150) * 100, place: "listed now", lore: "moving out, it can't come" },
      ],
      next: 2026,
    }),
  },

  // ---------------------------------------------------------------- Home feed
  {
    scenario: "feed-challenge",
    tool: "lab:public-challenge",
    params: (c) => ({
      title: `${str(c, "by")}'s 30 days of climbing`,
      host: str(c, "by"),
      hostLine: "the wall is open at 7, no excuses",
      today: 12,
      of: 30,
      others: 23,
      crew: [
        { name: str(c, "by"), days: "xxxxxxxxxxxx" },
        { name: F("theo"), days: "xxx.xxxxxxxx" },
        { name: F("priya"), days: "xx.xxxxx.xxx" },
        { name: F("dev"), days: "    xx.xxxxx" },
        { name: F("ines"), days: "xxxxxxxx...." },
      ].filter((r, i, a) => a.findIndex((x) => x.name === r.name) === i),
    }),
  },
  {
    scenario: "feed-plan",
    tool: "lab:friends-plans",
    params: (c) => ({
      sub: "This weekend",
      days: [{ day: "Fri", date: "14" }, { day: "Sat", date: "15" }, { day: "Sun", date: "16" }],
      plans: [
        { day: 0, title: "Taco crawl on Telegraph", meta: `8 PM · 4 stops · ${F("maya")}'s plan`, icon: "taco", host: F("maya"), going: [F("theo"), F("priya")], cap: 6, seat: "spot", reply: "yesss come hungry" },
        { day: 1, title: "Sibley sunrise hike", meta: `6 AM · ${F("dev")} driving`, icon: "hike", host: F("dev"), going: [F("jonah")], cap: 4, seat: "seat", reply: "last seat is yours" },
        { day: 2, title: "Picnic to plan Tahoe", meta: `1 PM · the quad · ${F("jonah")}'s plan`, icon: "picnic", host: F("jonah"), going: [F("theo"), F("maya"), F("ines"), F("kofi")], cap: 0, seat: "spot", reply: "bring chips pls" },
      ],
    }),
  },
  {
    scenario: "feed-birthday",
    tool: "lab:bday-pool",
    params: (c) => {
      const who = str(c, "subject") || F("priya");
      return {
        who,
        heading: `Happy 21st, ${who}`,
        candles: "21",
        when: str(c, "when") ? `${str(c, "when").toLowerCase()} at 9pm` : "at 9pm",
        notes: [
          { by: F("jonah"), text: "21 and thriving" },
          { by: F("maya"), text: "best roomie ever" },
          { by: F("theo"), text: "u still owe me boba" },
          { by: F("dev"), text: "karaoke friday" },
        ],
        lines: ["happy 21st, love u", "first round is on me", "u never age, rude"],
        gift: { name: "Headphones", goalCents: 12000, buyer: F("maya") },
        pot: [
          { by: F("jonah"), cents: 2500 },
          { by: F("maya"), cents: 2500 },
          { by: F("theo"), cents: 2000 },
        ],
        amounts: [1000, 2000],
      };
    },
  },
  {
    scenario: "feed-remix",
    tool: "lab:remix-card",
    params: () => ({
      chores: ["Dishes", "Trash", "Bathroom", "Floors"],
      groups: [
        { name: "The den", short: "Original", badge: "DN", members: [F("jonah"), F("theo"), F("dev")], note: `${F("jonah")}, ${F("theo")} +1 spin it weekly` },
        // Apt 4B is whoever is in the apt 4b chat; "Your apartment" only for someone who lives there
        { name: "Apt 4B", short: "Apt 4B", badge: "4B", members: CHAT_MEMBERS.apt4b!.map(F), note: `${CHAT_MEMBERS.apt4b!.includes(viewerId()) ? "Your apartment" : "Apartment"} · ${CHAT_MEMBERS.apt4b!.length} people` },
        { name: "Climbing house", short: "Climb house", badge: "CH", members: [F("ines"), F("kofi"), F("cami")], note: "Club house · 3 people" },
      ],
      base: 46,
      remixers: [F("dev"), F("maya"), F("kofi")],
    }),
  },
  {
    scenario: "feed-bracket",
    tool: "lab:bracket-post",
    params: () => ({
      title: "Best late night food near campus",
      left: "2h left",
      teams: [
        { name: "Halal cart", food: "curry" },
        { name: "Top Dog", food: "burger" },
        { name: "Insomnia", food: "donut" },
        { name: "Taco Bell", food: "taco" },
        { name: "Dollar pizza", food: "pizza" },
        { name: "Fat Slice", food: "fries" },
        { name: "Shake shack run", food: "shake" },
        { name: "Burrito spot", food: "burrito" },
      ],
      quarters: [0, 1, 0, 1],
      semis: [[24, 19], [17, 21]],
      final: [0, 0],
      people: [
        { name: F("theo"), picks: ["Halal cart", "Burrito spot"] },
        { name: F("jonah"), picks: ["Halal cart"] },
        { name: F("dev"), picks: ["Taco Bell", "Burrito spot"] },
        { name: F("maya"), picks: ["Dollar pizza"] },
      ],
    }),
  },
  {
    scenario: "feed-event",
    tool: "lab:squad-constellation",
    params: () => ({
      title: "Who you know going",
      show: "Juniper Hale",
      total: 84,
      knows: [
        { name: F("maya"), people: [F("lena"), F("ines"), "Bea", "Chris", "Hana", "Rob"] },
        { name: F("theo"), people: [F("kofi"), "Raj", "Tom", "Uma"] },
        { name: F("priya"), people: [F("cami"), "Ben", "Zoe", "Max", "Eli"] },
        { name: F("dev"), people: ["Ray", "Gus"] },
        { name: F("jonah"), people: [F("sam")] },
      ],
      asks: [{ from: F("dev"), via: F("maya") }],
    }),
  },

  // ---------------------------------------------------------------- Reels
  {
    scenario: "reel-rank",
    tool: "lab:reel-rank",
    params: (c) => ({
      title: "This week's reels, ranked",
      chat: str(c, "chatName") || "apt 4b",
      reels: REELS.slice(0, 5).map((r, i) => ({
        title: ({ "r-dumplings": "3 dumpling spots worth the line", "r-hike": "sunset hike under an hour", "r-tacos": "every taco truck on telegraph", "r-noodles": "chili crisp noodles in 15 min" } as Record<string, string>)[r.id] ?? clip(r.caption, 34),
        by: [F("priya"), F("maya"), F("dev"), F("maya")][i] ?? F("maya"),
        kind: /noodle|pasta/.test(r.caption) ? "pasta" : "plain",
        count: [41, 37, 25, 46][i] ?? 12,
        last: [F("maya"), "", F("priya"), F("dev")][i] ?? "",
      })),
      party: { when: "9pm Fri", where: "Apt 4B couch", treat: `Dumplings on ${F("priya")}` },
    }),
  },

  {
    scenario: "reel-hike",
    tool: "lab:reel-hike-plan",
    params: (c) => ({
      reel: { from: F("maya"), note: "can we do this", account: str(c, "handle") || "kofi.outside", quote: clip(str(c, "caption") || "sunset hike under an hour from campus", 44), title: clip(cap(str(c, "trail")) || "Sibley ridge trail", 34) },
      ridge: { name: "Ridge trail to the top", stats: "4.1 mi · 900 ft · ~2 hrs" },
      flat: { name: "Lake loop (flat version)", stats: "2.6 mi · 150 ft · ~1 hr" },
      to: "Sibley",
      when: { day: "Sun, Nov 16", time: "3:30 pm", word: "Sunday" },
      weather: "clear till sunset at 4:55",
      comfort: [{ name: F("maya"), level: 2 }, { name: F("priya"), level: 1 }, { name: F("theo"), level: 2 }],
      cars: [
        { name: `${F("maya")}'s Civic`, driver: F("maya"), seats: 4, riders: [F("priya")] },
        { name: `${F("dev")}'s Jeep`, driver: F("dev"), seats: 4, riders: [] },
      ],
    }),
  },

  // ---------------------------------------------------------------- Stories
  {
    scenario: "story-plan",
    tool: "lab:story-poll-plan",
    params: (c) => {
      const voters = (label: string) => (DEV_POLL.options.find((o) => o.label === label)?.voters ?? []).map((id) => nm(c, id));
      return {
        author: str(c, "by") || me(c), // the poll's author, whoever makes the plan
        ago: "20h",
        caption: "",
        question: cap(DEV_POLL.question),
        closeAt: 6,
        options: [
          {
            label: "Hike",
            art: "hike",
            title: "Hike it is",
            when: DEV_POLL.when.replace(/^Sat /, "Sat · "),
            place: DEV_POLL.place,
            rows: [["Trail", "3.2 mi loop · 1.5 hrs"], ["Carpool", `${F("dev")}'s car, 4 seats · 8:30`], ["After", "Brunch on College Ave"]],
            alt: "beach next weekend?",
            voters: voters("hike"),
          },
          {
            label: "Beach",
            art: "beach",
            title: "Beach day it is",
            when: "Sat · 1 PM",
            place: "Eastfield shore · fire pit 3",
            rows: [["Getting there", "Bus 51, 35 min · meet 12:20"], ["Bringing", `${F("jonah")}: speaker`], ["Tides", "Low tide 2:10, sunset 4:58"]],
            alt: "sunset hike after?",
            voters: voters("beach"),
          },
        ],
      };
    },
  },
  {
    scenario: "story-face-drop",
    tool: "lab:face-drop",
    params: () => ({ names: CAST_IDS.map(F) }),
  },
  {
    scenario: "story-recap",
    tool: "lab:wrapped",
    params: () => ({
      chat: `${TRIP.name} trip`,
      year: "2025",
      tagline: `${TRIP.people.length} friends · 3 days · 1 car`,
      total: 1842,
      perDay: "That's 614 a day. Highway 1 had no signal.",
      people: [
        { name: F("priya"), sent: 611 },
        { name: F("maya"), sent: 540 },
        { name: F("dev"), sent: 402 },
        { name: F("noa"), sent: 289 },
      ],
      top: { kind: "skull", emoji: "💀", count: 214, note: `Mostly replying to ${F("dev")}'s driving` },
      runners: [{ kind: "sob", emoji: "😭", count: 96, label: "96" }, { kind: "other", emoji: "🌊", count: 71, label: "71" }],
      hour: 23,
      hist: [6, 4, 2, 1, 0, 0, 0, 1, 3, 4, 5, 4, 3, 3, 2, 3, 4, 5, 6, 7, 8, 8, 9, 10],
      hourNote: "Peak motel discourse hours",
      hourQuote: `${F("maya")}: "one more episode" (11:52pm)`,
      sagaTitle: "Nepenthe",
      saga: [
        { date: "Nov 10", text: "312 miles start" },
        { date: "Nov 10", text: `${F("maya")} finds Nepenthe` },
        { date: "Nov 11", text: "McWay Falls, twice" },
        { date: "Nov 12", text: `${F("priya")} posts story 11` },
      ],
      status: "Status: going back (as of this message)",
      mvp: { name: F("priya"), line: "Most messages · 11 of 27 stories · found the motel" },
      quote: { who: F("maya"), text: "frame this" },
      watched: [F("maya"), F("dev")],
    }),
  },
  {
    scenario: "story-recap",
    tool: "lab:semester-wrapped",
    params: () => ({
      term: `${TRIP.name} '25`,
      cards: [
        { kind: "squad", title: "Days away", big: "3", unit: "days", who: `${TRIP.people.length} of us`, detail: "Nov 10 to 12" },
        { kind: "night", title: "Miles", big: "312", unit: "mi", who: `${F("dev")}'s car`, detail: "Highway 1 both ways" },
        { kind: "food", title: "Best dinner", big: "1", unit: "table", who: "Nepenthe", detail: `${F("maya")} picked it` },
        { kind: "chat", title: "Stories posted", big: "27", unit: "stories", who: F("priya"), detail: "11 of them" },
      ],
      opened: [F("maya"), F("dev")],
    }),
  },

  // ---------------------------------------------------------------- Gaming
  {
    scenario: "game-challenge",
    tool: "lab:challenge-friend",
    params: (c) => ({
      title: "Apt 4b ladder",
      from: nm(c, FRIEND_SCORE.by),
      when: "2h ago",
      tried: [F("maya"), F("dev")],
      joinAt: 2,
      ladder: [
        { name: F("maya"), cs: 999, w: 4, l: 0, note: "the final boss" },
        { name: nm(c, FRIEND_SCORE.by), cs: 987, w: 3, l: 2, note: "2h ago" },
        { name: F("priya"), cs: 1004, w: 2, l: 2, note: "you're up next" },
        { name: F("dev"), cs: 1031, w: 1, l: 3, note: "" },
        { name: F("jonah"), cs: 958, w: 0, l: 2, note: "" },
      ],
    }),
  },
  {
    scenario: "game-challenge",
    tool: "lab:gym",
    params: () => ({
      title: "Daily puzzle streaks",
      today: 4,
      roast: `${F("theo")} has a 9 day streak and will mention it`,
      cheer: { name: F("maya"), text: "ok who are you" },
      people: [
        { name: F("theo"), week: [1, 1, 1, 1, 1], before: 4 },
        { name: F("maya"), week: [1, 0, 1, 1, 0], before: 0 },
        { name: F("jonah"), week: [1, 1, 0, 1, 1], before: 0 },
        { name: F("dev"), week: [0, 1, 0, 0, 0], before: 0, nudge: `get up ${F("dev")}` },
      ],
    }),
  },
];
