// Made-up page facts the catalysts read: what the surfaces' own data does not carry (ticket tiers,
// a listing's size, a group's repeated question, a trip that ended). All people and places are
// invented. No imports from the surfaces' data, so the shell, the seed and the checks can all
// read this file without cycles.

import type { PersonId } from "../store/types";
import { CHAT_MEMBERS } from "../store/fake-data";

const H = 60 * 60_000;
const D = 24 * H;

// ---------------------------------------------------------------- Events

export type Tier = { name: string; kind: "lawn" | "rows" | "pit"; priceCents: number; feeCents: number; left: number; together: string; row?: string };

export type EventFacts = {
  kind: "concert" | "potluck" | "party";
  /** who hosts it, if it is one of us (a wire id: "noa", "maya"...) */
  hostedBy?: string;
  tiers?: Tier[];
  setlist?: string[];
  /** places near the venue, for where to meet before */
  nearby?: string[];
  bring?: string[];
  /** spots a host can open to friends of friends */
  spots?: number;
  fromCampus?: string;
  parking?: string;
};

export const EVENT_FACTS: Record<string, EventFacts> = {
  juniper: {
    kind: "concert",
    tiers: [
      { name: "Balcony", kind: "lawn", priceCents: 3800, feeCents: 600, left: 120, together: "Balcony · sit anywhere" },
      { name: "Floor GA", kind: "pit", priceCents: 5200, feeCents: 800, left: 40, together: "Standing · near the stage" },
      { name: "Front rows", kind: "rows", priceCents: 7400, feeCents: 1100, left: 12, together: "Row C · seats side by side", row: "C" },
    ],
    setlist: ["Paper Lanterns", "Northbound", "Glasshouse", "Slow Tide", "Ferris Wheel", "Rooftops"],
    nearby: ["Lupe's Tacos · 4 min walk", "The Copper Room · 6 min walk", "Campus Row Cafe · 2 min walk"],
    fromCampus: "2.5 mi from campus",
    parking: "Parking is $12",
  },
  potluck: {
    kind: "potluck",
    hostedBy: "noa",
    bring: ["Mashed potatoes", "Mac and cheese", "Green beans", "Pie", "Drinks", "Rolls", "Plates and cups"],
    spots: 3,
  },
  bday21: { kind: "party", hostedBy: "noa" },
};

/** The second event: Tsai Lin's potluck, so a host's page has its own offers. */
export const POTLUCK = {
  id: "potluck",
  title: "Friendsgiving potluck",
  venue: "Apt 4B",
  address: "1820 Dwight Way, Eastfield",
  host: "Tsai Lin",
  interested: 9,
  going: 6,
  description: "Bring a dish. The turkey is covered. Doors at 6, food at 7.",
  friends: ["maya", "dev", "jonah", "priya", "theo"] as PersonId[],
  /** Saturday after the concert, 6 PM */
  daysFromConcert: 1,
  hour: 18,
};

/** The third event: a friend's 21st at Apt 4B, hosted by the viewer's apartment (the title is made from the cast in store/fake-data.ts). */
export const BDAY21 = {
  id: "bday21",
  venue: "Apt 4B",
  address: "1820 Dwight Way, Eastfield",
  host: "Apt 4B",
  interested: 12,
  going: 23,
  description: "Roof at 9. One plus one each. Cake at midnight.",
  friends: ["maya", "dev", "jonah", "theo"] as PersonId[],
  /** the Friday after the concert, 9 PM */
  daysFromConcert: 7,
  hour: 21,
};

// ---------------------------------------------------------------- Groups

export type GroupFacts = {
  kind: "sublets" | "club";
  /** a question members keep asking, with how often, and the answers people gave */
  repeated?: { question: string; times: number; answers: string[] };
  admins: PersonId[];
  /** members who joined this week */
  newMembers?: string[];
  dues?: { label: string; cents: number; paid: number; of: number };
  /** facts for a welcome: the club's own rules and times */
  welcome?: { label: string; value: string; line: string }[];
  /** posts from people looking for a roommate */
  roommates?: { by: string; text: string }[];
};

export const GROUP_FACTS: Record<string, GroupFacts> = {
  sublets: {
    kind: "sublets",
    repeated: { question: "any june sublets under $1,000?", times: 23, answers: [] },
    admins: ["lena"],
    roommates: [
      { by: "ines", text: "looking for a roommate for fall, quiet, early sleeper" },
      { by: "sam", text: "need 1 more for a 3br on hearst, $890 each" },
      { by: "kofi", text: "grad student, looking for a room near campus from aug" },
    ],
  },
  climb: {
    kind: "club",
    repeated: { question: "where do you get cheap used shoes?", times: 6, answers: ["Thursday gear swap", "REI used", "Sports Basement", "Eastfield Outdoor"] },
    admins: ["ines", "noa"],
    newMembers: ["kofi", "cami"],
    dues: { label: "Spring dues", cents: 2000, paid: 31, of: 52 },
    welcome: [
      { label: "Wall nights", value: "Tue and Thu", line: "7 to 9 PM at the rec center wall" },
      { label: "Gear room", value: "3 shifts", line: "Mon and Wed 6 to 8 PM, Sat 10 to 12" },
      { label: "Dues", value: "$20", line: "Once a semester, covers chalk and the gear room" },
      { label: "Rides", value: "6:40 PM", line: "From the Union steps on wall nights" },
    ],
  },
};

/** Eastfield's neighbourhoods as the sublet finder's map labels (x and y 0 to 1 on its map). */
export const EASTFIELD_MAP = [
  { name: "Northside", x: 0.55, y: 0.12 },
  { name: "Campus", x: 0.72, y: 0.36 },
  { name: "Southside", x: 0.66, y: 0.62 },
  { name: "Elmwood", x: 0.34, y: 0.9 },
];

/** "2br on dwight · $950" -> facts a finder can rank. Mirrors the sublet group's posts. */
export const SUBLET_FACTS: { id: string; title: string; cents: number; months: string[]; detail: string }[] = [
  { id: "g1", title: "2br on dwight", cents: 95000, months: ["jun", "jul", "aug"], detail: "Jun to Aug · furnished · Lena" },
  { id: "g2", title: "1br on channing", cents: 110000, months: ["may", "jun", "jul", "aug"], detail: "May 20 to Aug 15 · Sam" },
  { id: "g3", title: "4br house room", cents: 78000, months: ["jun", "jul"], detail: "June and July only · near campus · Marco" },
  { id: "g4", title: "studio on telegraph", cents: 125000, months: ["jun", "jul", "aug"], detail: "Summer · utilities included · Kofi" },
  { id: "g5", title: "3br on hearst", cents: 89000, months: ["jun", "jul", "aug"], detail: "Jun to Aug · lease takeover · Ruth" },
  { id: "g6", title: "college ave shared", cents: 60000, months: ["jun", "jul", "aug"], detail: "Summer · shared room · Ines" },
  { id: "g7", title: "1br on derby", cents: 105000, months: ["jun", "jul", "aug"], detail: "Jun to Aug · parking spot · Cami" },
];

// ---------------------------------------------------------------- Marketplace

/** A listing's size in inches and what similar things sold for near Eastfield. */
export type ListingFacts = { w: number; d: number; comps: number[]; pickup: string };

export const LISTING_FACTS: Record<string, ListingFacts> = {
  "l-sectional": { w: 92, d: 36, comps: [95, 150, 160, 210, 240], pickup: "has to go by Sunday" },
  "l-loveseat": { w: 58, d: 32, comps: [80, 110, 120, 150], pickup: "pickup any evening" },
  "l-futon": { w: 78, d: 34, comps: [40, 55, 70, 90], pickup: "pickup this week" },
  "l-fridge": { w: 19, d: 18, comps: [30, 40, 50, 60], pickup: "pickup any time" },
  "l-desk": { w: 48, d: 24, comps: [110, 140, 160, 200], pickup: "pickup on weekends" },
  "l-bike": { w: 68, d: 20, comps: [150, 180, 240, 300], pickup: "pickup any evening" },
  "l-lamp": { w: 12, d: 12, comps: [10, 15, 20, 25], pickup: "pickup today" },
  "l-rug": { w: 60, d: 96, comps: [30, 45, 60, 80], pickup: "pickup any time" },
};

/** Apt 4B, where the roommates live: the walls a find could go against, in inches. */
export const ROOM_4B = {
  name: "Unit 4B",
  walls: [
    { name: "Long wall", inches: 104 },
    { name: "Window wall", inches: 80 },
    { name: "By the door", inches: 62 },
  ],
  /** who lives there: the apt 4b chat's own member list */
  get members(): readonly string[] {
    return CHAT_MEMBERS.apt4b!;
  },
};

/** What Aditya is selling, for a move-out sale. */
export const MY_LISTINGS = [
  { title: "Bookshelf", price: 25 },
  { title: "Desk lamp", price: 10 },
  { title: "Full length mirror", price: 15 },
  { title: "Shower caddy", price: 5 },
];

// ---------------------------------------------------------------- Home feed

/** Facts the catalysts read about feed posts (a ranking, a birthday, a move, a challenge, a plan). The posts themselves are surfaces/data.ts FEED, and where a post is shown there it takes its author, age and text from here (one source); likes and comments are not facts, the post and its thread own them; an entry whose id is not there (p-bday, p-plan shown as p-tahoe) is facts only. */
export type FeedPost = {
  id: string;
  by: PersonId;
  ago: number;
  text: string;
  kind: "ranking" | "birthday" | "move" | "challenge" | "plan" | "remix" | "bracket" | "event";
  /** what the post is about, as facts */
  items?: string[];
  subject?: PersonId;
  when?: string;
  spots?: number;
  /** where in POSTS it goes: after the post with this id, or "" for the top of the feed */
  after: string;
  /** who the tool on it is for, after "Made with Muse · ": {by} and {subject} are first names */
  credit?: string;
};

export const FEED_POSTS: FeedPost[] = [
  { id: "p-weekend", by: "maya", ago: 40 * 60_000, kind: "plan", text: "3 plans this weekend and you're in none of them. fix that", after: "", credit: "for this weekend" },
  { id: "p-juniper", by: "maya", ago: 90 * 60_000, kind: "event", text: "juniper hale friday. who else is going", after: "p-maya", credit: "for Juniper Hale live" },
  { id: "p-boba", by: "maya", ago: 2 * H, kind: "ranking", text: "rank them. wrong answers only", items: ["Tea Hut", "Boba Bliss", "Milk & Moon", "Bubble Lab", "Union cafe boba", "Kiki's Tea Truck"], after: "p-maya", credit: "for telegraph boba" },
  { id: "p-bday", by: "jonah", ago: 4 * H, kind: "birthday", text: "will turns 21 on friday. we have to do something", subject: "priya", when: "Friday", after: "p-den", credit: "for {subject}'s 21st" },
  { id: "p-move", by: "wes", ago: 6 * H, kind: "move", text: "anyone free sunday morning to help me move?? its literally 2 blocks. will pay in pizza 🍕", when: "Sunday", items: ["Truck at 9", "Couch needs 3", "Mattress needs 2", "TV needs someone careful"], after: "p-lena", credit: "for {by}'s move" },
  { id: "p-challenge", by: "maya", ago: 8 * H, kind: "challenge", text: "30 days of climbing in december. who's in", after: "p-dining", credit: "for the climbing crew" },
  { id: "p-remix", by: "dev", ago: 9 * H, kind: "remix", text: "stole the den's chore wheel for our place. it works", after: "p-dining", credit: "for apt 4b" },
  { id: "p-plan", by: "jonah", ago: 10 * H, kind: "plan", text: "tahoe the weekend of feb 7. cabin sleeps 8, 2 spots left", when: "Feb 7 to 9", spots: 2, after: "p-dev", credit: "for the Tahoe trip" },
  { id: "p-latenight", by: "theo", ago: 11 * H, kind: "bracket", text: "late night food bracket. semis are live, vote", after: "p-dev", credit: "for the late night chat" },
];

// ---------------------------------------------------------------- Reels

export type ReelFacts =
  | { kind: "restaurants"; places: string[] }
  | { kind: "hike"; trail: string; miles: number; when: string }
  | { kind: "recipe"; dish: string; ingredients: string[] };

export const REEL_FACTS: Record<string, ReelFacts> = {
  "r-dumplings": { kind: "restaurants", places: ["Golden Fold", "Mr. Bao", "Dumpling Alley"] },
  "r-hike": { kind: "hike", trail: "Sibley ridge trail", miles: 3, when: "Sunset" },
  "r-tacos": { kind: "restaurants", places: ["El Primo truck", "Tacos Lupe"] },
  "r-noodles": { kind: "recipe", dish: "Chili crisp noodles", ingredients: ["Wide noodles", "Chili crisp", "Garlic", "Scallions", "Soy sauce", "Peanuts"] },
};

/** The recipe reel, added to the Reels list (surfaces/data.ts REELS). */
export const RECIPE_REEL = { id: "r-noodles", by: "ines", handle: "ines.cooks", caption: "15 minute chili crisp noodles. 6 things, one pan", places: [] as string[], tone: 3 as const, asset: "reel-cooking", likes: 12800, comments: 301, shares: 1500 };

// ---------------------------------------------------------------- Stories

/** A trip that ended a year ago, in Aditya's story, and the facts a recap may use. */
export const TRIP = {
  storyId: "s-trip",
  by: "dev" as PersonId,
  caption: "1 year ago today: big sur",
  name: "Big Sur",
  people: ["dev", "maya", "priya", "noa"] as PersonId[],
  facts: [
    { label: "Days away", value: "3", line: "4 of us in Aditya's car, Nov 10 to 12" },
    { label: "Miles", value: "312", line: "Eastfield to Big Sur and back on Highway 1" },
    { label: "Best dinner", value: "Nepenthe", line: "Maya picked it, everyone agreed" },
    { label: "Stories posted", value: "27", line: "Will posted 11 of them" },
    { label: "Hike", value: "McWay Falls", line: "The short one, twice" },
  ],
  ago: 365 * D,
};

// ---------------------------------------------------------------- Gaming

/** Facts from a chat that trivia may use: each one is in that chat's seeded messages or tools. */
/** `people`: the options and answer are wire ids, named where they are shown. */
export const CHAT_FACTS: Record<string, { question: string; answer: string; options: string[]; people?: boolean }[]> = {
  apt4b: [
    { question: "Who ate Will's oat milk?", answer: "dev", options: ["maya", "dev", "noa"], people: true },
    { question: "How much was everyone's share of the groceries?", answer: "$18", options: ["$12", "$18", "$24"] },
  ],
  senior: [{ question: "How many does Aditya's beach house sleep?", answer: "8", options: ["6", "8", "10"] }],
};

/** A chat fact as a trivia question: people options shown by first name. */
export const factQuestion = (q: (typeof CHAT_FACTS)[string][number], nameOf: (id: string) => string) => ({ about: "the chat", q: q.question, options: q.people ? q.options.map(nameOf) : q.options, answer: q.options.indexOf(q.answer) });

/** A friend's score to answer. */
export const FRIEND_SCORE = { by: "theo" as PersonId, game: "Daily puzzle", score: "3 guesses", chatId: "boys" };
