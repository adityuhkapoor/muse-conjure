// 24 held-out asks for the before and after comparison. None of them is in eval/asks.ts or
// test/retrieval-set.ts, and nobody tunes the harness on them: change skills and prompts, never
// these asks. Chat samples are written the way college friends text. All people are made up.

import type { Member } from "../src/types.ts";
import type { EvalAsk } from "./asks.ts";

const m = (...names: string[]): Member[] => names.map((name) => ({ id: `m_${name.toLowerCase()}`, name }));
const chat = (title: string, lines: string[]) => ({
  title,
  messages: lines.map((l) => {
    const i = l.indexOf(": ");
    return { from: l.slice(0, i), text: l.slice(i + 2) };
  }),
});

const HOUSE = m("Rina", "Cole", "Imani", "Tobi");
const SUITE = m("Dani", "Wren", "Kiara", "Mei", "Lola");
const LADS = m("Arjun", "Pete", "Diego", "Sully");
const CLUB = m("Hazel", "Femi", "Grace", "Nico", "Yusuf", "Bea");

export const HELDOUT: EvalAsk[] = [
  {
    id: "formal-seats", expect: "build", surface: "event", members: CLUB, ask: "muse make a seating chart, 2 tables of 6",
    chat: chat("Spring formal · The Loft · Sat Apr 18, 7 PM", [
      "Hazel: tables are rounds of 6 btw, we have 2",
      "Femi: i need to sit near the dance floor or i'll never get up",
      "Grace: put me w nico pls",
      "Yusuf: anywhere but next to the speaker lol",
      "Bea: i'm bringing my roommate marisol so thats one more",
      "Hazel: muse make a seating chart, 2 tables of 6",
    ]),
  },
  {
    id: "roadtrip-pass", expect: "build", surface: "chat", members: LADS, ask: "muse make us boarding passes for the road trip",
    chat: chat("marfa or bust", [
      "Arjun: leaving fri 7am sharp from my place",
      "Pete: 7am is a crime",
      "Diego: austin to marfa is like 6.5 hrs",
      "Sully: i call shotgun for the first leg",
      "Arjun: we're taking the civic, pete's car has no ac",
      "Pete: muse make us boarding passes for the road trip",
    ]),
  },
  {
    id: "brunch-spots", expect: "reuse", surface: "chat", members: SUITE, ask: "muse pick brunch",
    chat: chat("suite 302 🍳", [
      "Wren: brunch sunday?? i need hashbrowns",
      "Kiara: sunny's diner is cheap but the wait is 45 min",
      "Mei: the bakery on 5th does the cardamom buns",
      "Lola: or le petit, bottomless mimosas $18",
      "Dani: i can't do le petit again my card is crying",
      "Wren: muse pick brunch",
    ]),
  },
  {
    id: "cabo-iou", expect: "build", surface: "chat", members: SUITE, ask: "muse who owes who from cabo",
    chat: chat("CABO 2026 ☀️", [
      "Dani: ok the airbnb was 1200, i put it on my card",
      "Kiara: i paid the boat thing, 300",
      "Mei: groceries day 1 were 86, me",
      "Lola: i got the uber from the airport, 54",
      "Wren: i paid nothing i'm so sorry i'll venmo",
      "Dani: muse who owes who from cabo",
    ]),
  },
  {
    id: "dress-shopping", expect: "reuse", surface: "chat", members: SUITE, ask: "muse when can everyone go dress shopping",
    chat: chat("suite 302 🍳", [
      "Lola: formal is in 2 weeks and i have nothing",
      "Mei: i can do tues or thurs after 4",
      "Kiara: weekends only, i work weekdays",
      "Wren: sat morning works, sunday i'm dead",
      "Dani: muse when can everyone go dress shopping",
    ]),
  },
  {
    id: "airport-rides", expect: "build", surface: "event", members: CLUB, ask: "who's driving who to the airport",
    chat: chat("Thanksgiving break move-out · Tue Nov 24", [
      "Femi: my flight is 6:10am out of ORD 💀",
      "Grace: mine's 11:40 MDW",
      "Nico: i have my car, can take 3 people + bags",
      "Bea: 2:15 ORD",
      "Yusuf: i can drive too but only after my 9am final",
      "Hazel: who's driving who to the airport",
    ]),
  },
  {
    id: "pixar-bracket", expect: "reuse", surface: "chat", members: HOUSE, ask: "muse bracket it",
    chat: chat("the house", [
      "Cole: ratatouille is the best pixar movie and it's not close",
      "Imani: up. the first 10 minutes alone",
      "Tobi: wall-e, toy story 3, inside out, coco, finding nemo",
      "Rina: monsters inc deserves better",
      "Cole: that's 8, muse bracket it",
    ]),
  },
  {
    id: "tailgate-draft", expect: "build", surface: "event", members: LADS, ask: "muse draft who brings what, snake order",
    chat: chat("Homecoming tailgate · Lot C · Sat Oct 10, 9 AM", [
      "Diego: we need grill, charcoal, burgers, buns, ice, cooler, chairs, speaker, cornhole",
      "Sully: i have the cornhole set",
      "Pete: not it for ice",
      "Arjun: let's draft it, snake order so it's fair",
      "Diego: muse draft who brings what, snake order",
    ]),
  },
  {
    id: "bday-veto", expect: "reuse", surface: "chat", members: m("Rina", "Cole", "Imani", "Tobi", "Mei"), ask: "muse let us veto till one's left",
    chat: chat("rina bday planning (no rina)", [
      "Cole: options for rina's bday: karaoke, escape room, pottery class, hot pot, bowling",
      "Imani: pottery is 45 each tho",
      "Tobi: escape room she did last year",
      "Mei: she loves hot pot fr",
      "Cole: muse let us veto till one's left",
    ]),
  },
  {
    id: "bake-sale-shifts", expect: "reuse", surface: "group", members: CLUB, ask: "muse make a sign up for shifts",
    chat: chat("Pre-Health Society", [
      "Hazel: bake sale is thursday 10 to 2 in the student center",
      "Hazel: need 2 people per hour at the table",
      "Femi: i can do 10-11",
      "Grace: i have class til 12",
      "Nico: i'll bake brownies but can't table",
      "Hazel: muse make a sign up for shifts",
    ]),
  },
  {
    id: "airbnb-rooms", expect: "build", surface: "chat", members: m("Arjun", "Pete", "Diego", "Sully", "Kiara"), ask: "muse split it by room",
    chat: chat("tahoe ski weekend", [
      "Kiara: airbnb is $1,500 for the weekend",
      "Arjun: it's one king, one queen, a bunk room and a pull out couch",
      "Pete: whoever gets the king should pay more",
      "Diego: i'll take the couch if it's cheap",
      "Sully: bunk is fine for me and arjun",
      "Kiara: muse split it by room",
    ]),
  },
  {
    id: "karaoke-receipt", expect: "reuse", surface: "chat", members: HOUSE, ask: "muse split the receipt",
    chat: chat("the house", [
      "Rina: karaoke receipt: room 2hrs $80, nachos $14, wings $18, 2 pitchers $36, imani's mocktail $9",
      "Cole: i didn't drink so i shouldn't pay for pitchers",
      "Tobi: i had like all the wings ngl",
      "Imani: tax and tip was 28",
      "Rina: muse split the receipt",
    ]),
  },
  {
    id: "friend-trivia", expect: "build", surface: "chat", members: SUITE, ask: "muse make a quiz about us",
    chat: chat("suite 302 🍳", [
      "Mei: remember when wren locked herself out in a towel",
      "Kiara: lola has been to 4 taylor shows. FOUR",
      "Dani: i still can't believe kiara's middle name is june",
      "Wren: dani has never seen star wars",
      "Lola: mei ate a whole lemon on a dare",
      "Kiara: muse make a quiz about us",
    ]),
  },
  {
    id: "connect-four", expect: "build", surface: "chat", members: LADS, ask: "muse connect four, me vs diego, loser does dishes",
    chat: chat("apt 12", [
      "Diego: whose turn is dishes",
      "Pete: yours",
      "Diego: no way, i did them sunday",
      "Pete: muse connect four, me vs diego, loser does dishes",
    ]),
  },
  {
    id: "doodle-guess", expect: "build", surface: "chat", members: HOUSE, ask: "muse let's play pictionary",
    chat: chat("the house", [
      "Imani: power's out on our street and i'm bored",
      "Tobi: phones at 40%",
      "Cole: pictionary? we have no paper",
      "Rina: muse let's play pictionary",
    ]),
  },
  {
    id: "semester-wrapped", expect: "build", surface: "chat", members: HOUSE, ask: "muse do a wrapped for this semester",
    chat: chat("the house", [
      "Tobi: we got the fire alarm going 3 times this semester",
      "Rina: cole made pancakes every sunday, like 14 sundays",
      "Imani: we adopted the plant. his name is gerald",
      "Cole: rina pulled 2 all nighters for orgo",
      "Tobi: and we finally got the couch up the stairs",
      "Imani: muse do a wrapped for this semester",
    ]),
  },
  {
    id: "flip-drive", expect: "build", surface: "chat", members: m("Pete", "Diego"), ask: "muse flip for who drives",
    chat: chat("pete & diego", [
      "Pete: i drove last time",
      "Diego: you drove to the gas station that doesn't count",
      "Pete: muse flip for who drives",
    ]),
  },
  {
    id: "couch-line", expect: "build", surface: "marketplace", members: m("Grace", "Owen", "Talia", "Ravi"), ask: "muse keep a line for who gets it",
    chat: chat("Grey sectional · $150 · pickup only", [
      "Owen: is this still available? can come tonight",
      "Talia: i can do tomorrow at noon, would pay 160",
      "Ravi: interested! do you deliver",
      "Grace: no delivery sorry",
      "Grace: muse keep a line for who gets it",
    ]),
  },
  {
    id: "run-club-pace", expect: "reuse", surface: "group", members: CLUB, ask: "muse sign up for pace groups",
    chat: chat("Lakefront Run Club", [
      "Nico: saturday long run, 8 miles, meet at the boathouse 7:30",
      "Nico: pace groups 8:00, 9:00, 10:00 per mile",
      "Bea: 10 min group gang",
      "Yusuf: i'll pace the 9s",
      "Nico: muse sign up for pace groups",
    ]),
  },
  {
    id: "boba-orders", expect: "build", surface: "chat", members: SUITE, ask: "muse take everyone's boba order, i'm going",
    chat: chat("suite 302 🍳", [
      "Lola: going to boba guys in 20, who wants",
      "Mei: taro 50% sugar pls",
      "Dani: brown sugar milk tea, less ice",
      "Kiara: matcha!!",
      "Lola: muse take everyone's boba order, i'm going",
    ]),
  },
  {
    id: "scooby-costumes", expect: "build", surface: "event", members: m("Rina", "Cole", "Imani", "Tobi", "Wren"), ask: "muse who's dressing as who",
    chat: chat("Halloween at Imani's · Sat Oct 31, 9 PM", [
      "Imani: group costume is scooby doo gang, final answer",
      "Cole: i have a green shirt so shaggy",
      "Wren: i want to be velma so bad",
      "Tobi: someone has to be scooby and it's not me",
      "Rina: what about the mystery machine lol",
      "Imani: muse who's dressing as who",
    ]),
  },
  {
    id: "gym-week", expect: "reuse", surface: "chat", members: LADS, ask: "muse keep track of who actually goes this week",
    chat: chat("gym rats (allegedly)", [
      "Sully: ok new rule 4 gym days this week or you buy wings",
      "Arjun: bet",
      "Pete: does walking to class count",
      "Diego: no",
      "Sully: muse keep track of who actually goes this week",
    ]),
  },
  {
    id: "wordle-board", expect: "build", surface: "chat", members: HOUSE, ask: "muse keep a wordle leaderboard",
    chat: chat("the house", [
      "Cole: wordle 1,612 3/6",
      "Rina: 1,612 5/6 rough one",
      "Imani: 2/6 don't talk to me",
      "Tobi: X/6 i'm done with this game",
      "Cole: muse keep a wordle leaderboard",
    ]),
  },
  {
    id: "two-truths", expect: "build", surface: "event", members: CLUB, ask: "muse run two truths and a lie",
    chat: chat("Floor 3 welcome night · Lounge · Fri Sep 4, 8 PM", [
      "Grace: icebreaker idea for tonight?",
      "Femi: two truths and a lie",
      "Bea: half of us don't know each other yet so that's perfect",
      "Hazel: muse run two truths and a lie",
    ]),
  },
];
