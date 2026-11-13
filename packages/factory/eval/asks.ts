// 20 fixed asks with chat samples, across Messenger chats and Facebook events, written the way
// college friends text. `expect` is the path a good router would take; the eval reports it but
// does not fail on it.

import type { GenerateRequest, Member, Path } from "../src/types.ts";

export type EvalAsk = GenerateRequest & { id: string; expect: Path };

const m = (...names: string[]): Member[] => names.map((name) => ({ id: `m_${name.toLowerCase()}`, name }));
const chat = (title: string, lines: string[]) => ({
  title,
  messages: lines.map((l) => {
    const i = l.indexOf(": ");
    return { from: l.slice(0, i), text: l.slice(i + 2) };
  }),
});

const APT = m("Maya", "Leo", "Ana", "Theo");
const GIRLIES = m("Priya", "Jess", "Lily", "Sam", "Nora");
const BOYS = m("Bryan", "Kev", "Marcus", "Dev");
const CREW = m("Sofia", "Jake", "Omar", "Hana", "Luis", "Mia");

export const ASKS: EvalAsk[] = [
  {
    id: "chore-wheel-apt4b", expect: "reuse", surface: "chat", members: APT, ask: "muse make a chore wheel",
    chat: chat("apt 4b", [
      "Theo: whoever left the pan in the sink im begging",
      "Ana: not me",
      "Leo: ok we need a system fr",
      "Maya: dishes trash bathroom vacuuming, thats the list",
      "Theo: and someone has to do the fridge it smells",
      "Ana: spin for it",
      "Maya: muse make a chore wheel",
    ]),
  },
  {
    id: "where-eating", expect: "reuse", surface: "chat", members: GIRLIES, ask: "muse pick for us",
    chat: chat("girlies 💌", [
      "Jess: where are we eating tn",
      "Priya: thai basil?? or sushi ko",
      "Lily: ive had sushi 3x this week lol",
      "Sam: the taco truck on college ave is open til 11",
      "Nora: honestly anything",
      "Jess: ok im starving someone decide",
      "Priya: muse pick for us",
    ]),
  },
  {
    id: "sza-whos-in", expect: "reuse", surface: "event", members: GIRLIES, ask: "whos actually in, need 4 to get the group tix",
    chat: chat("SZA · Kia Forum · Sat Mar 14, 8 PM", [
      "Priya: presale is friday 10am",
      "Lily: how much",
      "Priya: like 95 each if we get 4 together",
      "Sam: im so down",
      "Nora: maybe i have a midterm that monday",
      "Priya: whos actually in, need 4 to get the group tix",
    ]),
  },
  {
    id: "dinner-split", expect: "reuse", surface: "chat", members: BOYS, ask: "muse who owes who",
    chat: chat("the boys", [
      "Kev: that was a crazy dinner",
      "Bryan: i got the whole thing, 142.60 with tip",
      "Marcus: goat",
      "Dev: venmo u now",
      "Bryan: muse who owes who",
    ]),
  },
  {
    id: "friendsgiving-potluck", expect: "reuse", surface: "event", members: CREW, ask: "muse who's bringing what",
    chat: chat("Friendsgiving · Sofia's place · Sat Nov 22", [
      "Sofia: i got the turkey",
      "Jake: i can do mashed potatoes",
      "Hana: we need stuffing, mac and cheese, a pie, and drinks",
      "Omar: and like plates and stuff",
      "Mia: i'll bring wine but not sure what else",
      "Sofia: muse who's bringing what",
    ]),
  },
  {
    id: "ski-carpool", expect: "reuse", surface: "event", members: CREW, ask: "ok who's riding with who",
    chat: chat("Big Bear ski trip · Jan 17-19", [
      "Jake: i can drive, my car fits 4 plus me",
      "Luis: i can drive too but only 3 more",
      "Omar: shotgun in jakes car",
      "Hana: lol you can't call shotgun on the event page",
      "Sofia: ok who's riding with who",
    ]),
  },
  {
    id: "study-time", expect: "reuse", surface: "chat", members: m("Ava", "Noah", "Zoe", "Eli", "Ruby"), ask: "muse find a time that works",
    chat: chat("orgo study 🧪", [
      "Ava: exam is next friday we need to meet",
      "Noah: i can do mon or wed",
      "Zoe: tue works too, evenings only",
      "Eli: mornings are bad for me",
      "Ruby: same evenings",
      "Ava: muse find a time that works",
    ]),
  },
  {
    id: "movie-poll", expect: "reuse", surface: "chat", members: APT, ask: "vote, i'm not arguing about this again",
    chat: chat("apt 4b", [
      "Leo: movie night tonight",
      "Ana: dune 2",
      "Theo: we watched that last week??",
      "Maya: past lives or the holdovers",
      "Theo: barbie is right there",
      "Leo: vote, i'm not arguing about this again",
    ]),
  },
  {
    id: "dining-hall-bracket", expect: "reuse", surface: "chat", members: BOYS, ask: "muse make a bracket and settle this",
    chat: chat("the boys", [
      "Marcus: crossroads is the best dining hall and its not close",
      "Kev: cafe 3 clears",
      "Dev: clark kerr brunch tho",
      "Bryan: foothill sleeper pick",
      "Marcus: muse make a bracket and settle this",
    ]),
  },
  {
    id: "grocery-by-item", expect: "reuse", surface: "chat", members: APT, ask: "split it by what everyone actually gets",
    chat: chat("apt 4b", [
      "Ana: i did the costco run",
      "Ana: oat milk 8.99, eggs 6.49, chicken 14.99, coffee 17.99, tp 21.99",
      "Theo: i dont drink coffee",
      "Leo: i'm vegetarian no chicken for me",
      "Ana: split it by what everyone actually gets",
    ]),
  },
  {
    id: "secret-ballot", expect: "adapt", surface: "chat", members: GIRLIES, ask: "muse do a poll but hide the votes until everyone's voted",
    chat: chat("girlies 💌", [
      "Lily: formal theme ideas",
      "Jess: masquerade",
      "Sam: casino night",
      "Nora: under the sea lol",
      "Priya: people always just vote for whatever is winning",
      "Priya: muse do a poll but hide the votes until everyone's voted",
    ]),
  },
  {
    id: "beer-pong-scores", expect: "build", surface: "chat", members: BOYS, ask: "muse keep score for beer pong tonight",
    chat: chat("the boys", [
      "Dev: rematch tonight",
      "Kev: me and bryan vs you and marcus",
      "Marcus: first to 3 games",
      "Bryan: muse keep score for beer pong tonight",
    ]),
  },
  {
    id: "secret-santa", expect: "build", surface: "chat", members: CREW, ask: "muse do secret santa, $25 limit",
    chat: chat("roommates + co", [
      "Hana: secret santa this year?",
      "Luis: yes but nobody can get themselves obviously",
      "Mia: $25 max",
      "Sofia: muse do secret santa, $25 limit",
    ]),
  },
  {
    id: "gift-pool", expect: "adapt", surface: "chat", members: m("Priya", "Jess", "Lily", "Sam"), ask: "muse track who chipped in for jake's gift",
    chat: chat("jake bday (NO JAKE)", [
      "Priya: we're getting him the 120 headphones",
      "Jess: so 30 each",
      "Lily: i can venmo whoever orders",
      "Priya: i'll order. muse track who chipped in for jake's gift",
    ]),
  },
  {
    id: "rides-needed", expect: "adapt", surface: "event", members: CREW, ask: "who needs a ride and who can drive",
    chat: chat("Lake day · Sun Jun 8 · Lake Berryessa", [
      "Omar: i don't have a car this time",
      "Mia: same",
      "Jake: i can take 3",
      "Hana: who needs a ride and who can drive",
    ]),
  },
  {
    id: "bar-tab", expect: "build", surface: "chat", members: BOYS, ask: "muse keep a tab of who bought rounds",
    chat: chat("the boys", [
      "Kev: i got the first round",
      "Dev: i'll get the next one",
      "Bryan: we always forget who bought what",
      "Marcus: muse keep a tab of who bought rounds",
    ]),
  },
  {
    id: "potluck-theme", expect: "reuse", surface: "event", members: CREW, ask: "let's vote on a theme",
    chat: chat("Potluck · Omar's backyard · Sat", [
      "Omar: theme ideas?",
      "Sofia: taco bar",
      "Luis: bbq",
      "Mia: breakfast for dinner",
      "Omar: let's vote on a theme",
    ]),
  },
  {
    id: "rent-by-room", expect: "build", surface: "chat", members: APT, ask: "muse split rent, big room pays more",
    chat: chat("apt 4b", [
      "Maya: rent is 3200 total",
      "Leo: my room is way smaller tho",
      "Ana: big room is like 30% bigger",
      "Theo: maya has the big room",
      "Leo: muse split rent, big room pays more",
    ]),
  },
  {
    id: "game-night-lock", expect: "reuse", surface: "chat", members: m("Ava", "Noah", "Zoe", "Eli"), ask: "only doing it if 3 of us are in",
    chat: chat("board game gang", [
      "Noah: catan friday?",
      "Zoe: maybe, i have a thing at 7",
      "Eli: down",
      "Noah: only doing it if 3 of us are in",
    ]),
  },
  {
    id: "packing-trip", expect: "reuse", surface: "event", members: m("Sofia", "Jake", "Omar", "Hana"), ask: "muse make a packing list we can split",
    chat: chat("Joshua Tree camping · Apr 4-6", [
      "Jake: i have a tent for 4",
      "Hana: we need a cooler, firewood, lantern, and a speaker",
      "Omar: stove too",
      "Sofia: muse make a packing list we can split",
    ]),
  },
];
