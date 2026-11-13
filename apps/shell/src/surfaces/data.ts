// Made-up content for the Facebook surfaces. People are the cast from store/fake-data.ts plus a few
// strangers who post in groups and on Marketplace. Written the way college students post.
//
// The rule for every seed file (this one, comments.ts, backing.ts, profile-data.ts, muse/seed.ts,
// store/fake-data.ts, services/demo): people are wire ids only (dev is Aditya, the seeded world's
// main character; jonah, theo, noa, priya, maya). "me" never appears in seed data: it is only the
// store's name for whoever is viewing, at render time. "Everyone" and "everyone but the viewer"
// come from store/cast.ts (CAST_IDS, othersOf, castWithViewerFirst), never a literal list.
// `bun run check` fails on a "me" here.

import type { Person } from "../store/types";
import { DINING_TIERS } from "./backing";
import { EXTRA_PEOPLE } from "../store/extras";
import { CHAT_MEMBERS, PEOPLE } from "../store/fake-data";
import { othersOf } from "../store/cast";
import { MOMENTS } from "./moments";
import { captionTile, dayOf, lobbyTile, movieTile, nightTile, puzzleTile, quizTile, tierTile, truthsTile } from "./game-lines";

import { FEED_POSTS, RECIPE_REEL, TRIP } from "../muse/seed"; // catalysts

/** FEED_SPEC "Extras" that post on the surfaces. */
/** A person's first name as the shell shows it, so renames follow. */
const first = (id: string) => [...PEOPLE, ...EXTRA_PEOPLE].find((x) => x.id === id)?.first ?? id;

const FEED_EXTRAS = ["jules", "omar", "hana", "bea", "wes", "tess", "leo", "dani", "rae", "kev", "zoe", "nico", "ava"];

const p = (id: string, name: string, tone: number): Person => ({ id, name, first: name.split(" ")[0]!, initials: name.split(" ").map((w) => w[0]).join(""), tone, active: false });

/** People who are not in the cast (no chats with them): the seven who post in groups and on Marketplace, then FEED_SPEC's extras (store/extras.ts names them in chats too). */
export const STRANGERS: Person[] = [
  p("lena", "Lena Ortiz", 3),
  p("ines", "Ines Park", 2),
  p("sam", "Sam Okafor", 6),
  p("marco", "Marco Silva", 4),
  p("kofi", "Kofi Mensah", 1),
  p("cami", "Cami Reyes", 5),
  p("ruth", "Ruth Adler", 2),
  ...EXTRA_PEOPLE.filter((x) => FEED_EXTRAS.includes(x.id)),
];

const H = 60 * 60_000;
const D = 24 * H;
const M = 60_000;

// ---------------------------------------------------------------- Home feed

/** A photo: `asset` is an assets/manifest.json id; tone is the tint shown while it loads or if it is missing. */
export type Media = { tone: 1 | 2 | 3; label: string; asset?: string };
/** Which reactions show in the stack, most first. */
export type Rx = "like" | "love" | "haha" | "wow" | "care" | "sad";
/** A page that posts (a campus office, a venue, an advertiser). */
export type FbPage = { name: string; tone: 1 | 2 | 3; /** "Sponsored" posts carry a button */ sponsored?: { cta: string } };
/** A reel shown inside a post, above the tool made from it. */
export type SharedReel = { asset?: string; handle: string; caption: string; tone: 1 | 2 | 3 | 4; plays: string };

/**
 * Post text, headlines and lines may name people as `{id}` (their first name) or `{@id}` (the same,
 * but "You" for the viewer, "Your" before 's); surfaces/say.ts reads them.
 */
type Base = { id: string; by: string; ago: number; text: string; likes: number; shares: number; rx?: Rx[]; media?: Media; group?: string };

export type Post =
  | (Base & { kind: "text" })
  | (Base & {
      kind: "tool";
      /** "Calvin's apartment made a chore wheel" */
      headline: string;
      backingKey: string;
      toolId: string;
      usedBy: number;
      /** for "Use for my group" */
      piece: string;
      /** after "Made with Muse · ": who it is for */
      credit: string;
      params: Record<string, unknown>;
      templateId: string;
      summary: string;
    })
  | (Base & { kind: "bracket"; backingKey: string; toolId: string; voters: string[]; /** after "Made with Muse · ": who it is for */ credit: string })
  /**
   * A friend's post that carries a live tool (FEED_SPEC A): the tool lives in `backingKey`'s room,
   * seeded with friends' moves in services/demo/seed-catalysts.ts. Credit is either Muse's ("Made
   * with Muse · for the den") or the person's ("Ines made this · 19 used it").
   */
  | (Base & {
      kind: "live";
      headline: string;
      backingKey: string;
      toolId: string;
      credit: { muse: string } | { usedBy: number };
      reel?: SharedReel;
      /** "Use for my group" rebuilds it from these (lab id and params) */
      use?: { piece: string; params: Record<string, unknown>; title: string };
    })
  | (Base & { kind: "memory"; years: number; original: string; with: string[] })
  | (Base & { kind: "activity"; /** the friend whose comment brought it here */ actor: string; said: string })
  | (Base & { kind: "link"; link: { host: string; title: string; blurb: string; tone: 1 | 2 | 3; asset?: string } })
  | (Base & { kind: "page"; page: FbPage })
  | (Base & { kind: "event"; event: { id: string; title: string; when: string; where: string; going: number } })
  | (Base & { kind: "listing"; listing: string })
  | (Base & { kind: "life"; life: { title: string; sub: string } })
  | (Base & { kind: "share"; inner: { by: string; ago: number; text: string; media?: Media } });

/** Feed modules that are not posts: a birthday row, people you may know, a suggested group. */
export type Module =
  | { kind: "birthday"; id: string; who: string; when: string }
  /** the people are the viewer's own suggestions (profile-data.ts mayKnowFor), counts from the friend lists; `notes` is a line under a person */
  | { kind: "pymk"; id: string; notes?: Record<string, string> }
  | { kind: "suggest"; id: string; group: string };

export type FeedItem = Post | Module;
export const isModule = (x: FeedItem): x is Module => x.kind === "birthday" || x.kind === "pymk" || x.kind === "suggest";

const muse = (who: string) => ({ muse: who });
const used = (n: number) => ({ usedBy: n });
const live = (id: string, room = `surface:page:post:${id}`) => ({ kind: "live" as const, id, backingKey: room });
const n0 = { shares: 0 };
/** Who wrote a post, when and what it says, for the posts the catalysts also read facts about (muse/seed.ts FEED_POSTS): one source. */
const said = (id: string) => {
  const f = FEED_POSTS.find((x) => x.id === id);
  if (!f) throw new Error(`no feed facts for ${id}`);
  return { by: f.by, ago: f.ago, text: f.text };
};

/** Home, top to bottom (FEED_SPEC A F01-F41 in order, with the furniture between, voice per docs/FEED_REALISM.md). */
export const FEED: FeedItem[] = [
  { ...live("p-den"), toolId: "t-f-den", by: "jonah", ago: 3 * H, text: "no more fighting about the bathroom. we draft chores now", headline: "{@jonah}'s apartment conjured a chore draft", credit: muse("for the den"), likes: 21, ...n0, rx: ["like", "haha", "love"], use: { piece: "chore-draft", title: "Chore draft", params: { title: "Chore draft", sub: "This week", chores: [{ name: "Bathroom", pts: 5, note: "Both. Yes both" }, { name: "Dishes", pts: 4, note: "Pans included" }, { name: "Trash", pts: 3, note: "+ curb on Tue" }, { name: "Vacuum", pts: 3, note: "Whole apt" }], order: [], picks: [] } } },
  { kind: "text", id: "p-maya", by: "maya", ago: 1 * H, text: "THESIS DRAFT SUBMITTED 😭😭😭", media: { tone: 3, label: "Laptop and a highlighted printout on a library table at night", asset: "post-library-night" }, likes: 48, ...n0, rx: ["love", "like", "wow"] },
  { kind: "birthday", id: "m-bday", who: "priya", when: "Friday" },
  { ...live("p-dining"), toolId: "t-f-dining", by: "theo", ago: 7 * H, text: "settle this. vote", headline: "{@theo} conjured a bracket", credit: used(41), likes: 33, shares: 2, rx: ["haha", "like", "love"] },
  { ...live("p-21st", "surface:page:event:will21"), toolId: "t-f-21st", by: "jonah", ago: 2 * H, text: "{priya} turns 21 tonight 🥳 den, 9ish. roof at midnight. byob", headline: "{@jonah} is hosting {priya}'s 21st", credit: used(24), likes: 64, shares: 1, rx: ["love", "like", "wow"] },
  { kind: "text", id: "p-lena", by: "lena", ago: 5 * H, group: "sublets", text: "SUMMER SUBLET 🌞 1 room in a 2br on dwight, jun 1 - aug 31, $950/mo utilities incl. fully furnished (loft bed + desk stay). roommate is a quiet grad student. 8 min walk to campus. comment or dm if interested!!", media: { tone: 1, label: "Room with a lofted bed and a desk", asset: "place-dorm" }, likes: 6, shares: 2, rx: ["like"] },
  { kind: "pymk", id: "m-pymk", notes: { leo: "TA for bio lab" } },
  { ...live("p-boba"), toolId: "t-cat-feed-ranking", ...said("p-boba"), headline: "{@maya} conjured a tier list", credit: used(112), likes: 41, shares: 3, rx: ["haha", "like", "love"] },
  { kind: "text", id: "p-hana", by: "hana", ago: 4 * H, text: "fog", media: { tone: 2, label: "Fog over the quad at sunrise", asset: "post-quad-fog" }, likes: 37, ...n0, rx: ["love", "like"] },
  { kind: "event", id: "p-zoe", by: "zoe", ago: 6 * H, text: "student tickets for juniper hale at the box office today, bring your id!! see you friday 🎶", event: { id: "juniper", title: "Juniper Hale live", when: "Fri at 8:00 PM", where: "Meridian Hall", going: 84 }, likes: 52, shares: 9, rx: ["like", "love"] },
  { kind: "page", id: "p-dining-hall", by: "pg-dining", ago: 20 * H, page: { name: "Eastfield Dining", tone: 1 }, text: "Thanksgiving dinner at Crossroads is Thursday, November 26, 4 to 8 PM. Open to every student staying on campus over break, no swipe needed. Vegetarian and gluten free plates at the far counter.", media: { tone: 1, label: "Long tables set for dinner in a dining hall", asset: "post-dining-tray" }, likes: 86, shares: 4, rx: ["like", "love"] },
  { ...live("p-rides", "surface:page:event:juniper"), toolId: "t-cat-event-carpool", by: "maya", ago: 5 * H, text: "driving to juniper hale tmrw. 2 seats left in mine, {jonah} has the truck", headline: "{@maya} shared rides to Juniper Hale live", credit: used(6), likes: 18, ...n0, rx: ["like", "love"] },
  { ...live("p-rent"), toolId: "t-f-rent", by: "jules", ago: 8 * H, text: "rent for the den, sorted in 4 minutes. omar gets the parking spot and pays for it", headline: "The den conjured a rent split", credit: muse("for the den"), likes: 5, ...n0, rx: ["like", "haha"], use: { piece: "rent-split", title: "Rent split", params: { title: "Apt 4B", rentCents: 420000 } } },
  { kind: "text", id: "p-tess", by: "tess", ago: 9 * H, text: "pesto pasta is back at crossroads fyi", likes: 8, ...n0, rx: ["like", "love"] },
  { kind: "text", id: "p-kev", by: "kev", ago: 8 * H + 29 * M, text: "i'm not even tired", likes: 44, ...n0, rx: ["haha", "like"] },
  { kind: "text", id: "p-wes", by: "wes", ago: 12 * M, text: "does anyone know if the 3rd floor laundry room is fixed yet", likes: 2, ...n0, rx: ["like"] },
  { ...live("p-cook"), toolId: "t-f-cook", by: "dani", ago: 10 * H, text: "we're making this. friday after everyone's back from juniper? or thursday", reel: { asset: "reel-cooking", handle: "ines.cooks", caption: "15 minute chili crisp noodles. 6 things, one pan", tone: 2, plays: "12.8K" }, headline: "{@dani} is hosting a cook night", credit: used(5), likes: 26, shares: 1, rx: ["love", "like"] },
  { ...live("p-wrapped", "surface:page:story:s-priya"), toolId: "t-f-wrapped", by: "priya", ago: 11 * H, text: "lol accurate", headline: "{@priya} shared a story", credit: muse("for apt 4b and the den"), likes: 58, shares: 4, rx: ["haha", "love", "like"] },
  { kind: "text", id: "p-dev", by: "dev", ago: 9 * H, text: "Anyone selling a mini fridge? need one asap", likes: 3, ...n0, rx: ["like"] },
  { kind: "activity", id: "p-gym", by: "theo", ago: 50 * M, actor: "jonah", text: "gym at 9. dont ask", said: "9am club 💪", likes: 15, ...n0, rx: ["haha", "like"] },
  { ...live("p-ines-sale", "surface:page:listing:l-desk"), toolId: "t-f-sale", by: "ines", ago: 12 * H, text: "MOVING SALE 📦 everything has to go before dec 15. friends get first dibs till tmrw 9am, then it goes on marketplace. pick up only, 2nd floor no elevator sorry", headline: "{@ines} is selling to friends first", credit: used(19), likes: 33, shares: 2, rx: ["wow", "love", "like"] },
  { ...live("p-chatdle", "surface:page:gaming:gm-chatdle"), toolId: "t-g-chatdle", by: "dev", ago: 1 * H, text: "chatdle #213 in 3. the first guess was a cry for help", headline: "{@dev} shared Chatdle", credit: muse("for apt 4b"), likes: 12, ...n0, rx: ["haha", "like"] },
  { kind: "memory", id: "p-memory", by: "noa", ago: 2 * H, years: 1, text: "take me back", original: "big sur w the best people 🌊❤️", with: ["dev", "maya", "priya"], media: { tone: 1, label: "Bixby Bridge over the ocean at golden hour", asset: "story-big-sur-road" }, likes: 61, ...n0, rx: ["love", "like"] },
  { kind: "listing", id: "p-ruth", by: "ruth", ago: 5 * H, text: "selling this!! $120 obo, need it gone before thanksgiving", listing: "l-loveseat", likes: 4, shares: 1, rx: ["like", "love"] },
  { kind: "page", id: "p-donuts", by: "pg-donuts", ago: 0, page: { name: "Dough Bros Donuts", tone: 3, sponsored: { cta: "Order now" } }, text: "Finals week hours: open till 2 AM, Sunday to Thursday. Show your student ID for a free glazed with any half dozen 🍩", media: { tone: 3, label: "A box of glazed donuts on a counter", asset: "post-donuts" }, likes: 128, shares: 6, rx: ["like", "love", "wow"] },
  { ...live("p-trip-story", "surface:page:story:s-trip"), toolId: "t-cat-story-trip", by: "dev", ago: 13 * H, text: "1 year ago today. made us a recap", headline: "{@dev} shared a trip story", credit: muse("for big sur"), likes: 47, shares: 1, rx: ["love", "like"] },
  { ...live("p-jt"), toolId: "t-f-jt", by: "hana", ago: 1 * D, text: "joshua tree tab. 9 iou's became 4 payments. {theo} is somehow square", headline: "{@hana} settled the Joshua Tree tab", credit: muse("for joshua tree"), likes: 8, ...n0, rx: ["haha", "like"] },
  { kind: "text", id: "p-priya", by: "priya", ago: 1 * D, text: "brunch 🥞", media: { tone: 2, label: "Brunch table with six plates of french toast and eggs", asset: "post-brunch-table" }, likes: 112, shares: 1, rx: ["love", "like"] },
  { kind: "life", id: "p-omar", by: "omar", ago: 1 * D + 3 * H, life: { title: "Accepted a job offer", sub: "Lakeside Labs · starts July" }, text: "excited to share i'll be joining lakeside labs after graduation!! so grateful for everyone who helped me along the way 🙏", likes: 236, ...n0, rx: ["love", "like", "care"] },
  { kind: "text", id: "p-pastry", by: "dev", ago: 1 * D + 11 * H, text: "", media: { tone: 3, label: "A half-eaten chocolate pastry on a paper plate", asset: "own-pastry" }, likes: 23, ...n0, rx: ["love", "like"] },
  { ...live("p-trivia", "surface:page:gaming:gaming"), toolId: "t-cat-game-trivia", by: "maya", ago: 14 * H, text: "made a quiz about senior week. {dev} got 850. nobody is beating that", headline: "{@maya} conjured a quiz", credit: used(38), likes: 24, ...n0, rx: ["haha", "like"] },
  { ...live("p-couch", "surface:page:listing:l-sectional"), toolId: "t-f-couch", by: "dev", ago: 6 * H, text: "the old couch lost a spring and a little of its dignity. apt 4b is voting", headline: "Apt 4B is picking a couch", credit: muse("for apt 4b"), likes: 31, ...n0, rx: ["haha", "like"] },
  { ...live("p-setlist"), toolId: "t-f-setlist", by: "nico", ago: 15 * H, text: "setlist bingo from wednesday's show in riverside. 6 called. friday is mine", headline: "{@nico} conjured setlist bingo", credit: used(212), likes: 70, shares: 11, rx: ["love", "like", "wow"] },
  { kind: "text", id: "p-jonah", by: "jonah", ago: 2 * D, text: "tailgate szn", media: { tone: 1, label: "Charcoal grill next to folding chairs and a cooler in a stadium lot", asset: "post-tailgate" }, likes: 64, ...n0, rx: ["like", "haha", "love"] },
  { kind: "link", id: "p-bea-link", by: "bea", ago: 1 * D, text: "", link: { host: "rec.eastfield.example", title: "Rec center wall: finals hours", blurb: "Tue and Thu 7 to 10 PM from Nov 30. Gear room open Mon and Wed.", tone: 2, asset: "gen-climbing-holds" }, likes: 19, shares: 2, rx: ["like", "love"] },
  { kind: "suggest", id: "m-suggest", group: "class27" },
  { ...live("p-tahoe"), toolId: "t-f-tahoe", ...said("p-plan"), headline: "{@jonah} has 2 open spots", credit: used(5), likes: 9, shares: 1, rx: ["like", "love"] },
  { ...live("p-beat", "surface:page:story:s-theo"), toolId: "t-f-beat", by: "theo", ago: 16 * H, text: "the den has a theme song now 💀", headline: "{@theo} shared a story", credit: muse("for the den"), likes: 27, ...n0, rx: ["haha", "love"] },
  { ...live("p-move"), toolId: "t-f-move", ...said("p-move"), headline: "{@wes} is moving Sunday", credit: used(7), likes: 3, ...n0, rx: ["like"] },
  { kind: "text", id: "p-challenge", ...said("p-challenge"), likes: 27, ...n0, rx: ["like", "love"] },
  { kind: "share", id: "p-leo-share", by: "leo", ago: 7 * H, text: "", inner: { by: "dani", ago: 2 * D, text: "cook night #9. fed 14 people out of one pot", media: { tone: 1, label: "A big pot of noodles on a stove", asset: "gen-noodles-lift" } }, likes: 3, ...n0, rx: ["like"] },
  { ...live("p-faces"), toolId: "t-f-faces", by: "jules", ago: 18 * H, text: "the den at 1am", headline: "{@jules} shared a toy", credit: muse("for the den"), likes: 35, ...n0, rx: ["haha", "love"] },
  { ...live("p-ramen"), toolId: "t-f-ramen", by: "maya", ago: 4 * H, text: "friday?? (after juniper, they're open till 1)", reel: { asset: "reel-ramen", handle: "eastfield.bites", caption: "the $13 tonkotsu on shattuck that ended me", tone: 3, plays: "48K" }, headline: "{@maya} added this to apt 4b's to try list", credit: muse("for apt 4b"), likes: 20, ...n0, rx: ["wow", "love", "like"] },
  { ...live("p-tab"), toolId: "t-f-tab", by: "bea", ago: 2 * D, text: "wall night dinner. i paid, claim your stuff before i forget who had the ribs", headline: "{@bea} is collecting for Smoke & Barrel", credit: muse("for wall night"), likes: 6, ...n0, rx: ["haha", "like"] },
  { kind: "text", id: "p-zoe-portraits", by: "zoe", ago: 1 * D, group: "class27", text: "REMINDER senior portraits are this week!! 📸 Union 2nd floor, 10am-4pm Mon-Fri. sign up link in comments. gowns provided. you do need an appointment, please stop emailing me 🙂", likes: 40, shares: 6, rx: ["like", "love"] },
  { kind: "page", id: "p-meridian", by: "pg-meridian", ago: 3 * H, page: { name: "Meridian Hall", tone: 2 }, text: "Juniper Hale, tomorrow night. Doors at 7, show at 8. Floor GA is sold out. A few balcony seats are left at the box office.", media: { tone: 2, label: "An empty stage with blue lights before a show", asset: "post-empty-stage" }, likes: 412, shares: 31, rx: ["like", "love", "wow"] },
  { ...live("p-potluck"), toolId: "t-f-potluck", by: "tess", ago: 2 * D, text: "my family's thanksgiving has a muse table now. uncle t is still bringing a 'surprise'", headline: "{@tess}'s family conjured a potluck table", credit: muse("for the yamamotos"), likes: 46, shares: 3, rx: ["haha", "love"], use: { piece: "potluck", title: "Potluck", params: { title: "Friendsgiving potluck", coming: 11, host: "Apt 4B's turkey" } } },
  { ...live("p-spinner"), toolId: "t-f-spinner", by: "kev", ago: 1 * D, text: "we said idk 4 times so muse spun it. bowling, hot pot, karaoke. saturday is locked", headline: "{@kev}'s floor spun a Saturday plan", credit: muse("for the 4th floor"), likes: 23, ...n0, rx: ["haha", "like"], use: { piece: "plan-spinner", title: "Saturday plan", params: { title: "Saturday plan", date: "Sat" } } },
  { kind: "text", id: "p-kofi", by: "kofi", ago: 1 * D, text: "cold one this morning", media: { tone: 3, label: "Frost on dry grass beside a dirt trail at sunrise", asset: "post-frost-trail" }, likes: 12, ...n0, rx: ["love", "like"] },
  { kind: "text", id: "p-sam", by: "sam", ago: 3 * D, text: "lost a grey beanie somewhere between the union and dwight. no logo. thats all ive got", likes: 2, ...n0, rx: ["like"] },
  { ...live("p-veto"), toolId: "t-f-veto", by: "leo", ago: 1 * D, text: "lab group dinner. 6 of us, 6 places, everyone kills one", headline: "{@leo}'s lab group conjured a dinner veto", credit: muse("for bio lab section 4"), likes: 4, ...n0, rx: ["haha", "like"], use: { piece: "dinner-veto", title: "Dinner veto", params: { title: "Dinner", time: "7:30" } } },
  { ...live("p-formal"), toolId: "t-f-formal", by: "zoe", ago: 2 * D, text: "class council can't pick a weekend for winter formal so muse is picking. say free or not", headline: "The class council is picking a weekend", credit: muse("for class council"), likes: 57, shares: 4, rx: ["like", "love"], use: { piece: "date-swipe", title: "Pick a weekend", params: { place: "Senior week" } } },
];

/** The posts in the feed (modules left out), for profiles and lookups. */
export const POSTS: Post[] = FEED.filter((x): x is Post => !isModule(x));

/** Pages that post (not people): their id is `pg-<x>`. */
export const isPage = (id: string) => id.startsWith("pg-");

export type Story = { id: string; by: string; caption: string; tone: 1 | 2 | 3; /** background photo (assets/manifest.json id) */ asset?: string; poll?: StoryPoll; /** a story that is a live Muse tool (its page room, seeded in services/demo/seed-catalysts.ts) */ tool?: boolean; /** posted this long ago, as the header says it (3h when not set) */ ago?: string };
export type StoryPoll = { question: string; options: { label: string; voters: string[]; others: number }[]; ended: boolean; place: string; when: string };

/** Aditya's story poll (s-dev-poll). It ended: hike won 9 to 5. Voters are his friends, never Aditya. */
export const DEV_POLL: StoryPoll = {
  question: "beach or hike sat?",
  options: [
    { label: "hike", voters: ["maya", "noa", "priya", "theo"], others: 5 },
    { label: "beach", voters: ["jonah"], others: 4 },
  ],
  ended: true,
  place: "Sibley ridge trail",
  when: "Sat 9 AM",
};

/** A poll's result as every view of it says it: the winner, who voted for it by name, and its count. */
export function pollResult(poll: StoryPoll) {
  const count = (o: StoryPoll["options"][number]) => o.voters.length + o.others;
  const win = [...poll.options].sort((a, b) => count(b) - count(a))[0]!;
  return { question: poll.question, winner: win.label, voters: win.voters, votes: count(win), total: poll.options.reduce((n, o) => n + count(o), 0), place: poll.place, when: poll.when, ended: poll.ended };
}

/** Each person's stories sit together, oldest first: one chain and one card in the tray. */
export const STORIES: Story[] = [
  { id: "s-muse", by: "muse", caption: "", tone: 1, tool: true }, // catalysts: a Muse story, the live face drop fills the viewer
  { id: "s-maya", by: "maya", caption: "library szn", tone: 3, asset: "story-library-lamp" },
  { id: "s-dev-poll", by: "dev", caption: "", tone: 2, asset: "story-trail-sign", poll: DEV_POLL, ago: "20h" },
  { id: TRIP.storyId, by: TRIP.by, caption: TRIP.caption, tone: 2, asset: "gen-coast-road", ago: "13h" }, // catalysts: a trip a year ago (trip-story, the feed's p-trip-story room)
  { id: "s-dev", by: "dev", caption: "up at 6 for no reason", tone: 1, asset: "story-sunrise-street" },
  { id: "s-theo", by: "theo", caption: "the den has a theme song now", tone: 2, asset: "story-record-player" }, // story-beat t-f-beat (feed p-beat)
  { id: "s-priya", by: "priya", caption: "fall '26 so far", tone: 3, asset: "gen-campus-autumn" }, // semester-wrapped t-f-wrapped (feed p-wrapped)
  { id: "s-jonah", by: "jonah", caption: "🫡", tone: 1, asset: "story-rooftop-lights" },
  { id: "s-nico", by: "nico", caption: "7th juniper hale show tomorrow. rail or nothing", tone: 3, asset: "story-concert" },
];

/** One person's stories, oldest first. */
export const storiesBy = (by: string) => STORIES.filter((s) => s.by === by);

/**
 * The tray's chains, in the story viewer's order: the viewer's own first ("Your story"), when they
 * have one, then each other person once. Nobody's story is hidden from anyone else.
 */
export function storyChains(viewer: string): Story[][] {
  const people = [...new Set(STORIES.map((s) => s.by))];
  return [viewer, ...people.filter((b) => b !== viewer)].map(storiesBy).filter((c) => c.length > 0);
}

// ---------------------------------------------------------------- Groups

export type GroupPost = { id: string; by: string; ago: number; text: string; media?: Media; likes: number; comments: number; /** a post that became a tool */ toolId?: string; madeFrom?: string; /** shown at the top, "Pinned by admins" */ pinned?: boolean };
export type Group = {
  id: string;
  name: string;
  backingKey: string;
  members: number;
  privacy: "Private group" | "Public group";
  tone: 1 | 2 | 3;
  /** cover photo (assets/manifest.json id) */
  cover?: string;
  /** member faces shown in the header */
  faces: string[];
  pinned: { toolId: string; by: string }[];
  posts: GroupPost[];
  /** words that make a new post look like the earlier ones */
  match?: { words: RegExp; title: string };
};

export const SUBLETS: GroupPost[] = [
  { id: "g1", by: "lena", ago: 5 * H, text: "subletting my room jun-aug, 2br on dwight, $950 furnished", likes: 6, comments: 11 },
  { id: "g2", by: "sam", ago: 9 * H, text: "summer sublet 1br on channing, $1,100, may 20 to aug 15", media: { tone: 2, label: "Small living room with a grey couch by a big window", asset: "place-apt-living" }, likes: 3, comments: 4 },
  { id: "g3", by: "marco", ago: 1 * D, text: "room in a 4br house near campus, $780, june and july only", likes: 2, comments: 7 },
  { id: "g4", by: "kofi", ago: 2 * D, text: "studio on telegraph for the summer, $1,250 utilities incl", likes: 9, comments: 3 },
  { id: "g5", by: "ruth", ago: 2 * D, text: "need someone to take over my lease jun-aug, 3br on hearst, $890", likes: 4, comments: 12 },
  { id: "g6", by: "ines", ago: 3 * D, text: "shared room on college ave for summer, $600, girls only", likes: 1, comments: 2 },
  { id: "g7", by: "cami", ago: 4 * D, text: "subletting 1br on derby jun to aug, $1,050, parking spot", likes: 5, comments: 6 },
];

/** The sublet posts as shortlist candidates for the group's finder. */
export const SUBLET_ITEMS = [
  { title: "2br on Dwight", cents: 95000, detail: "Jun-Aug · furnished · Lena posted" },
  { title: "1br on Channing", cents: 110000, detail: "May 20-Aug 15 · Sam posted" },
  { title: "Room in a 4br house", cents: 78000, detail: "June and July only · near campus · Marco posted" },
  { title: "Studio on Telegraph", cents: 125000, detail: "Summer · utilities included · Kofi posted" },
  { title: "3br on Hearst", cents: 89000, detail: "Lease takeover Jun-Aug · Ruth posted" },
  { title: "Shared room on College Ave", cents: 60000, detail: "Summer · Ines posted" },
  { title: "1br on Derby", cents: 105000, detail: "Jun-Aug · parking spot · Cami posted" },
];

export const GROUPS: Group[] = [
  {
    id: "sublets",
    name: "Eastfield sublets and housing",
    backingKey: "surface:group:sublets",
    members: 4212,
    privacy: "Private group",
    tone: 1,
    cover: "cover-sublet-group",
    faces: ["lena", "sam", "maya", "kofi"],
    pinned: [],
    posts: SUBLETS,
    match: { words: /\b(sublet|subletting|summer|lease|room|br|studio|jun|june|aug)\b/i, title: "Sublets that match" },
  },
  {
    id: "climb",
    name: "Eastfield climbing club",
    backingKey: "surface:group:climb",
    members: 312,
    privacy: "Private group",
    tone: 3,
    cover: "cover-club",
    faces: ["ines", "maya", "priya", "theo"],
    pinned: [{ toolId: "t-s-gear-signup", by: "ines" }],
    posts: [
      { id: "c0", by: "maya", ago: 3 * H, text: "make a flyer for friday social", toolId: "t-s-flyer", madeFrom: "this post", pinned: true, likes: 18, comments: 6 },
      { id: "c1", by: "ines", ago: 6 * H, text: "when works for weekly meetings this semester? tap what works", toolId: "t-s-meet", madeFrom: "14 replies", likes: 12, comments: 14 },
      { id: "c2", by: "theo", ago: 1 * D, text: "lost a chalk bag at the wall on tuesday. blue, has a carabiner on it", likes: 3, comments: 2 },
      { id: "c3", by: "maya", ago: 2 * D, text: "ridge hike after the wall was so fun. same time next week?", media: { tone: 3, label: "Trail through pine trees at sunset", asset: "post-trail-sunset" }, likes: 27, comments: 5 },
    ],
  },
  {
    id: "class27",
    name: "Eastfield class of '27",
    backingKey: "surface:group:class27",
    members: 5800,
    privacy: "Private group",
    tone: 1,
    cover: "cover-class27",
    faces: ["zoe", "priya", "jonah", "tess"],
    pinned: [],
    posts: [
      { id: "k1", by: "zoe", ago: 1 * D, text: "REMINDER senior portraits are this week!! 📸 Union 2nd floor, 10am-4pm Mon-Fri. sign up link in comments. gowns provided. you do need an appointment, please stop emailing me 🙂", likes: 40, comments: 12 },
      { id: "k2", by: "zoe", ago: 2 * D, text: "grad fair is dec 3 in the union. caps and gowns, $40 for the set", likes: 18, comments: 4 },
      { id: "k3", by: "jonah", ago: 3 * D, text: "anyone have a ride to the airport sunday at 5am? will pay in breakfast burritos", likes: 6, comments: 3 },
    ],
  },
];

// ---------------------------------------------------------------- Marketplace

export type Listing = { id: string; title: string; price: number; kind: string; kinds: string; tone: 1 | 2 | 3; /** photo (assets/manifest.json id) */ asset: string; where: string; ago: string; seller: string; condition: string; description: string };

export const LISTINGS: Listing[] = [
  { id: "l-sectional", title: "Grey sectional couch", price: 180, kind: "couch", kinds: "couches", tone: 1, asset: "listing-couch", where: "Eastfield", ago: "2 days ago", seller: "marco", condition: "Used - good", description: "grey sectional $180 obo. NEED GONE BY SUNDAY, moving. no stains no pets no smoking. one cushion is a lil flat. you pick up (3rd floor, i'll help carry). first come first serve, no holds" },
  { id: "l-loveseat", title: "Green velvet loveseat", price: 120, kind: "couch", kinds: "couches", tone: 3, asset: "listing-loveseat", where: "Eastfield", ago: "5 hours ago", seller: "ruth", condition: "Used - like new", description: "fits 2, super comfy. got it last year, cat free home. 58 in wide" },
  { id: "l-futon", title: "Futon, folds flat", price: 60, kind: "couch", kinds: "couches", tone: 2, asset: "listing-futon", where: "North Eastfield", ago: "1 week ago", seller: "kofi", condition: "Used - fair", description: "futon. works. $60" },
  { id: "l-fridge", title: "Mini fridge", price: 45, kind: "fridge", kinds: "fridges", tone: 2, asset: "listing-mini-fridge", where: "Eastfield", ago: "3 days ago", seller: "sam", condition: "Used - good", description: "3.1 cu ft, freezer box works. dorm size" },
  { id: "l-desk", title: "Standing desk", price: 150, kind: "desk", kinds: "desks", tone: 1, asset: "listing-desk", where: "Eastfield", ago: "1 day ago", seller: "ines", condition: "Used - like new", description: "standing desk!! electric, goes up and down, 48 in wide. $90 for friends in my move out sale till tmrw 9am. pick up only, 2nd floor no elevator" },
  { id: "l-bike", title: "Road bike, 54cm", price: 220, kind: "bike", kinds: "bikes", tone: 3, asset: "listing-bike", where: "South Eastfield", ago: "4 days ago", seller: "marco", condition: "Used - good", description: "new tires in march. lock included" },
  { id: "l-lamp", title: "Floor lamp", price: 15, kind: "lamp", kinds: "lamps", tone: 2, asset: "listing-lamp", where: "Eastfield", ago: "6 hours ago", seller: "cami", condition: "Used - good", description: "warm light, tall. bulb included" },
  { id: "l-books", title: "Intro econ textbooks", price: 30, kind: "book", kinds: "books", tone: 1, asset: "listing-textbooks", where: "Eastfield", ago: "2 weeks ago", seller: "lena", condition: "Used - good", description: "4 books, some highlighting. the course still uses them" },
  { id: "l-projector", title: "Projector and 100 in screen", price: 240, kind: "projector", kinds: "projectors", tone: 1, asset: "listing-projector", where: "Eastfield", ago: "1 day ago", seller: "sam", condition: "Used - like new", description: "1080p, screen pulls down from a stand. selling bc my wall is too small lol" },
  { id: "l-harness", title: "Climbing harness, size M", price: 35, kind: "harness", kinds: "harnesses", tone: 2, asset: "listing-harness", where: "Eastfield", ago: "3 days ago", seller: "bea", condition: "Used - good", description: "2 seasons, no falls on it worth mentioning. club inspected" },
  { id: "l-bookshelf", title: "Bookshelf", price: 25, kind: "shelf", kinds: "shelves", tone: 1, asset: "listing-bookshelf", where: "Eastfield", ago: "1 day ago", seller: "dev", condition: "Used - good", description: "5 shelves, white, a little wobbly if you lean on it" },
  { id: "l-mirror", title: "Full length mirror", price: 15, kind: "mirror", kinds: "mirrors", tone: 3, asset: "listing-mirror", where: "Eastfield", ago: "1 day ago", seller: "dev", condition: "Used - good", description: "no cracks. comes with a hook" },
  // kit: camping and party things, so a plan can be priced on Marketplace (services/demo/kit.ts). Photos are the owner's.
  { id: "l-tent", title: "4-person dome tent, Black Diamond", price: 120, kind: "tent", kinds: "tents", tone: 1, asset: "listing-tent", where: "Eastfield", ago: "2 days ago", seller: "marco", condition: "Used - good", description: "sleeps 4, rainfly and stakes included. used it twice, no holes" },
  { id: "l-camp-table", title: "Folding camp table with cup holders", price: 25, kind: "table", kinds: "tables", tone: 2, asset: "listing-camp-table", where: "North Eastfield", ago: "4 days ago", seller: "kofi", condition: "Used - good", description: "round folding table, 4 cup holders, packs into its own bag" },
  { id: "l-sleeping-bag", title: "Flannel-lined sleeping bag", price: 35, kind: "sleeping bag", kinds: "sleeping bags", tone: 3, asset: "listing-sleeping-bag", where: "Eastfield", ago: "1 week ago", seller: "cami", condition: "Used - like new", description: "cabela's, rated to 30F, washed. selling 1" },
  { id: "l-cookware", title: "Camp cookware set for 4", price: 40, kind: "cookware", kinds: "cookware", tone: 1, asset: "listing-cookware", where: "Eastfield", ago: "3 days ago", seller: "sam", condition: "Used - good", description: "2 pots, a pan, lids, all nest together. feeds 4" },
  { id: "l-camp-pillow", title: "Camp pillow, forest print", price: 15, kind: "pillow", kinds: "pillows", tone: 2, asset: "listing-camp-pillow", where: "Eastfield", ago: "5 days ago", seller: "lena", condition: "Used - like new", description: "squishes small, owl print. selling 1" },
  { id: "l-megaphone", title: "Gold party megaphone", price: 12, kind: "megaphone", kinds: "megaphones", tone: 3, asset: "listing-megaphone", where: "Eastfield", ago: "2 days ago", seller: "ines", condition: "Used - like new", description: "for announcements, birthdays, being annoying" },
  { id: "l-tableware", title: "Red party tableware kit (serves 20)", price: 18, kind: "tableware", kinds: "tableware", tone: 1, asset: "listing-tableware", where: "Eastfield", ago: "1 day ago", seller: "ruth", condition: "New", description: "plates, cups, napkins and forks for 20. never opened" },
  { id: "l-party-hats", title: "Rainbow party hats (4)", price: 5, kind: "party hats", kinds: "party hats", tone: 2, asset: "listing-party-hats", where: "Eastfield", ago: "6 hours ago", seller: "cami", condition: "New", description: "4-pack, elastic straps" },
  { id: "l-balloons", title: "Gold HAPPY BIRTHDAY balloons", price: 10, kind: "balloons", kinds: "balloons", tone: 3, asset: "listing-balloons", where: "Eastfield", ago: "3 days ago", seller: "ines", condition: "Used - like new", description: "foil letter banner, reusable, comes with a straw to fill it" },
];

export const listing = (id: string) => LISTINGS.find((l) => l.id === id);
export const money = (n: number) => `$${n.toLocaleString("en-US")}`;

// ---------------------------------------------------------------- Reels

export type Reel = { id: string; by: string; handle: string; caption: string; places: string[]; tone: 1 | 2 | 3 | 4; /** frame (assets/manifest.json id, 9:16) */ asset: string; likes: number; comments: number; shares: number };

export const REELS: Reel[] = [
  { id: "r-dumplings", by: "cami", handle: "cami.eats", caption: "3 dumpling spots worth the line. the last one is cash only", places: ["Golden Fold", "Mr. Bao", "Dumpling Alley"], tone: 2, asset: "reel-dumplings", likes: 18400, comments: 412, shares: 2100 },
  { id: "r-hike", by: "kofi", handle: "kofi.outside", caption: "sunset hike under an hour from campus", places: ["Sibley ridge trail"], tone: 4, asset: "reel-hike", likes: 6200, comments: 88, shares: 540 },
  { id: "r-tacos", by: "sam", handle: "samtries", caption: "every taco truck on telegraph pt 2 🌮 which one should i try next?? #eastfield #tacos", places: ["El Primo truck", "Tacos Lupe"], tone: 1, asset: "reel-tacos", likes: 9100, comments: 230, shares: 870 },
  RECIPE_REEL, // catalysts: a recipe reel
  { id: "r-juniper", by: "nico", handle: "nico.hears", caption: "juniper hale played northbound in the alley after the riverside show", places: ["Meridian Hall"], tone: 3, asset: "reel-juniper", likes: 31200, comments: 980, shares: 4100 },
  { id: "r-crag", by: "bea", handle: "bea.climbs", caption: "first outdoor v4 at castle rock. 2 years of trying", places: ["Castle Rock"], tone: 4, asset: "reel-crag", likes: 4800, comments: 96, shares: 120 },
  { id: "r-couch", by: "ruth", handle: "ruth.makes", caption: "reupholstered a $40 couch in green velvet. 3 weekends", places: [], tone: 2, asset: "reel-couch", likes: 22100, comments: 640, shares: 2900 },
  { id: "r-ramen", by: "sam", handle: "eastfield.bites", caption: "the $13 tonkotsu on shattuck that ended me", places: ["Menya Kuro"], tone: 1, asset: "reel-ramen", likes: 48000, comments: 1200, shares: 6300 },
];
export const reel = (id: string) => REELS.find((r) => r.id === id);

/** The places Will's to-try list was seeded with (his share in the priya chat). */
export const PRIYA_TRY = ["Golden Fold", "Mr. Bao", "Dumpling Alley"];

// ---------------------------------------------------------------- Gaming

export type Game = { id: string; /** tile art (assets/manifest.json id) */ art: string; title: string; piece: string; params: Record<string, unknown>; templateId: string; summary: string; group: string; line: string; players: string[]; color: 1 | 2 | 3 };

/** The late night group's food bracket (lab bracket-post): round 1 done, semis voting. */
export const LATE_NIGHT_BRACKET = {
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
  semis: [
    [24, 19],
    [17, 21],
  ],
  final: [0, 0],
  people: [
    { name: "Arun", picks: ["Halal cart", "Burrito spot"] },
    { name: "Calvin", picks: ["Halal cart"] },
    { name: "Aditya", picks: ["Taco Bell", "Burrito spot"] },
  ],
};

/** Apt 4b's movie night (lab movie-bracket): everyone's pick, with what they said for it. */
export const MOVIE_NIGHT = {
  when: "Fri 9 PM",
  where: "Apt 4b couch",
  movies: [
    { title: "Paddington 2", by: "Maya", quote: "a perfect film, i will not be taking questions" },
    { title: "Dune: Part Two", by: "Aditya", quote: "needs the big screen. our tv counts" },
    { title: "Past Lives", by: "Will", quote: "bring tissues" },
    { title: "Shrek 2", by: "Tsai Lin", quote: "holding out for a hero" },
    { title: "Spider-Verse", by: "Aditya", quote: "the animation tho" },
    { title: "Mean Girls", by: "Maya", quote: "it's a wednesday" },
    { title: "Interstellar", by: "Will", quote: "the docking scene. that's it" },
    { title: "The Notebook", by: "Tsai Lin", quote: "ironically. mostly" },
  ],
  picks: [
    { name: "Maya", side: 0 },
    { name: "Will", side: 0 },
    { name: "Aditya", side: 1 },
  ],
};

// Each Gaming tile starts a Mini from `params`; its line, summary and faces are worked out from those
// params (game-lines.ts), never typed next to them.
const CHATDLE = { word: "DRAFT", said: 41, chat: "apt 4b", no: 213, day: "Thu", played: [{ who: first("dev"), marks: ["01000", "10102", "22222"] }, { who: first("priya"), marks: ["00100", "01010", "10201", "20222", "22222"] }] };
const SENIOR_QUIZ = {
  title: "How well do you know senior week?",
  by: first("maya"),
  plays: 3,
  questions: [
    { about: first("dev"), q: "Who ate Will's oat milk?", options: ["Maya", "Aditya", "Tsai Lin"], answer: 1 },
    { about: "the group", q: "How much was everyone's share of the groceries?", options: ["$12", "$18", "$24"], answer: 1 },
    { about: "the house", q: "How many does the beach house sleep?", options: ["6", "8", "10"], answer: 1 },
    { about: "the house", q: "Which town is the beach house in?", options: ["Pismo", "Cayucos", "Morro Bay"], answer: 1 },
    { about: "the group", q: "How many nights is senior week?", options: ["3", "4", "5"], answer: 0 },
  ],
  played: [
    { who: first("dev"), picks: [1, 1, 1, 1, 0], points: [180, 170, 160, 190, 150] },
    { who: "Tsai Lin", picks: [1, 1, 0, 1, 0], points: [180, 170, 0, 190, 160] },
    { who: first("jonah"), picks: [1, 0, 1, 0, 0], points: [130, 0, 120, 0, 140] },
  ],
};
const TRIVIA_NIGHT = { teams: [{ name: "Aux Cords", people: [first("maya"), "Tsai Lin", first("dev")] }, { name: "Late Again", people: [first("jonah"), first("priya"), first("theo")] }], stake: "the wings", where: "Sunday at Lupe's" };
const TWO_TRUTHS = {
  chat: "senior week",
  rounds: [
    {
      about: first("maya"),
      lie: 0,
      facts: [
        { claim: "Has never missed a 9 am", receipt: "Maya, Oct 3: \u201calarm did not go off. again\u201d" },
        { claim: "Read her whole thesis out loud to a library plant", receipt: "Maya, Nov 9: \u201cthe plant has opinions on chapter 3\u201d" },
        { claim: "Brought her own kettle to the library", receipt: "Maya, Nov 2: \u201cdo not ask about the kettle\u201d" },
      ],
      guesses: [
        { name: first("jonah"), fact: 0 },
        { name: first("theo"), fact: 2 },
        { name: first("priya"), fact: 1 },
      ],
    },
  ],
};
const CAPTIONS = {
  photos: [
    {
      place: "Gulf Shores, day 2",
      scene: "beach",
      captions: [
        { by: first("maya"), text: "low tide, high hopes", voters: [first("priya")] },
        { by: first("priya"), text: "we were promised shade", voters: [first("maya")] },
        { by: first("dev"), text: "the tide has other plans", voters: [] },
      ],
    },
  ],
};
const LOBBY = {
  title: "Who's on tonight",
  people: [
    { name: first("maya"), reply: "on all night after 7", from: 2, to: 14, maybe: false },
    { name: first("kev"), reply: "maybe after 10", from: 8, to: 14, maybe: true },
    { name: first("omar"), reply: "9-11 then im out", from: 6, to: 10, maybe: false },
    { name: first("zoe"), reply: "after dinner ~8, done by 12", from: 4, to: 12, maybe: false },
  ],
};

export const GAMES: Game[] = [
  { id: "gm-chatdle", art: "game-chatdle", title: `Chatdle #${CHATDLE.no}`, piece: "daily-puzzle", templateId: "poll", params: CHATDLE, ...puzzleTile(CHATDLE), group: "apt 4b", color: 1 },
  { id: "gm-trivia", art: "game-trivia", title: SENIOR_QUIZ.title, piece: "friend-trivia-pub", templateId: "poll", params: SENIOR_QUIZ, ...quizTile(SENIOR_QUIZ), group: "senior week", color: 2 },
  { id: "gm-trivianight", art: "game-trivia-night", title: "Trivia night", piece: "trivia-night", templateId: "poll", params: TRIVIA_NIGHT, ...nightTile(TRIVIA_NIGHT), group: "senior week", color: 3 },
  { id: "gm-twotruths", art: "game-two-truths", title: "Two truths and a lie", piece: "two-truths", templateId: "poll", params: TWO_TRUTHS, ...truthsTile(TWO_TRUTHS), group: "senior week", color: 1 },
  { id: "gm-dining", art: "post-dining-tray", title: "Dining hall tier list", ...MOMENTS.gameTier, params: DINING_TIERS, ...tierTile(DINING_TIERS), group: `${first("theo")}'s friends`, color: 2 },
  { id: "gm-captions", art: "game-captions", title: "Caption this", piece: "caption-contest", templateId: "poll", params: CAPTIONS, ...captionTile(CAPTIONS), group: "senior week", color: 3 },
  { id: "gm-lobby", art: "game-lobby", title: "Who's on tonight", piece: "lobby", templateId: "poll", params: LOBBY, ...lobbyTile(LOBBY), group: "late night", color: 2 },
  { id: "gm-movie", art: "place-apt-living", title: `${dayOf(MOVIE_NIGHT.when)} movie bracket`, ...MOMENTS.gameWheel, params: MOVIE_NIGHT, ...movieTile(MOVIE_NIGHT), group: "apt 4b", color: 1 },
];

// ---------------------------------------------------------------- Notifications

export type Notif = {
  id: string;
  by: string;
  html: string;
  ago: number;
  unread: boolean;
  badge: "comment" | "event" | "group" | "share" | "story";
  /** what tapping it opens; a chat Mini opens in its chat */
  go: { kind: "post" | "event" | "group" | "story"; id: string } | { kind: "chat"; id: string; tool: string };
  /** who it is true for (wire ids). Never its own actor (`by`). */
  for: string[];
};

const full = (id: string) => PEOPLE.find((x) => x.id === id)?.name ?? id;
const MEMORY = FEED.find((x) => x.id === "p-memory") as Extract<Post, { kind: "memory" }>;
const POLL_END = pollResult(DEV_POLL);

/** Tsai Lin's big sur memory, as each person tagged in it hears about it. */
const memory = (viewer: string): Notif => {
  const [a, b] = MEMORY.with.filter((x) => x !== viewer).map(full);
  return { id: `nt-memory-${viewer}`, by: MEMORY.by, html: `**${full(MEMORY.by)}** shared a memory with you, **${a}** and **${b}** from 1 year ago`, ago: 3 * H, unread: false, badge: "story", go: { kind: "post", id: MEMORY.id }, for: [viewer] };
};

/**
 * Notifications, written from seeded events: who commented on whose post, who is up in which Mini,
 * whose poll ended. Each says who it is for; Aditya's (dev) are the seeded world's main set, and every
 * other cast member gets 4 to 6 that are true for them. `notifsFor` is the only way to read them.
 */
export const NOTIFS: Notif[] = [
  { id: "nt-veto", by: "theo", html: "**Arun Vaithianathan** vetoed **Pier Pizza** in **After Juniper food**", ago: 7 * M, unread: true, badge: "share", go: { kind: "chat", id: "boys", tool: "t-veto" }, for: ["dev", "jonah", "noa"] },
  { id: "nt-draft", by: "priya", html: "**Will Li** took **Fridge** in **Chore draft**. Tsai Lin is up", ago: 10 * M, unread: true, badge: "share", go: { kind: "chat", id: "apt4b", tool: "t-wheel" }, for: ["dev", "maya"] },
  { id: "nt-draft-noa", by: "priya", html: "**Will Li** took **Fridge** in **Chore draft**. You're up", ago: 10 * M, unread: true, badge: "share", go: { kind: "chat", id: "apt4b", tool: "t-wheel" }, for: ["noa"] },
  { id: "nt-door", by: "jonah", html: "**Calvin Karthik** added you to the door list for **Will's 21st**", ago: 2 * H, unread: true, badge: "event", go: { kind: "post", id: "p-21st" }, for: ["dev", "noa"] },
  { id: "nt-story", by: POLL_END.voters[0]!, html: `**${full(POLL_END.voters[0]!)}** and ${POLL_END.total - 1} others voted on your story poll. **${POLL_END.winner}** won ${POLL_END.votes} to ${POLL_END.total - POLL_END.votes}`, ago: 2 * H, unread: true, badge: "story", go: { kind: "story", id: "s-dev-poll" }, for: ["dev"] },
  { id: "nt-seat", by: "maya", html: "**Maya Chen** has 2 seats left in her car for **Juniper Hale live**", ago: 5 * H, unread: false, badge: "event", go: { kind: "event", id: "juniper" }, for: othersOf("maya") },
  { id: "nt-tab", by: "hana", html: "**Hana Ito** settled **Joshua Tree tab**", ago: 1 * D, unread: false, badge: "share", go: { kind: "post", id: "p-jt" }, for: ["noa", "theo", "maya"] },
  ...MEMORY.with.map(memory),
  { id: "nt-lena", by: "lena", html: "**Lena Ortiz** posted in **Eastfield sublets and housing**: SUMMER SUBLET 🌞 1 room in a 2br on dwight", ago: 5 * H, unread: false, badge: "group", go: { kind: "group", id: "sublets" }, for: ["maya"] },
  { id: "nt-crag", by: "zoe", html: "**Zoe Achebe** invited you to **Castle Rock crag day**", ago: 1 * D, unread: false, badge: "event", go: { kind: "group", id: "climb" }, for: ["noa", "theo", "maya"] },
  { id: "nt-event", by: "maya", html: "**Juniper Hale live** is tomorrow. **Maya** and 2 friends are going", ago: 1 * D, unread: false, badge: "event", go: { kind: "event", id: "juniper" }, for: ["jonah"] },
  // comments on their own posts (surfaces/comments.ts), and a Mini in their own chat
  { id: "nt-den", by: "maya", html: "**Maya Chen** commented on your post: arun took bathrooms first. a hero", ago: 2 * H, unread: true, badge: "comment", go: { kind: "post", id: "p-den" }, for: ["jonah"] },
  { id: "nt-tahoe", by: "wes", html: "**Wes Duarte** commented on your post: asked. i can cook", ago: 9 * H, unread: false, badge: "comment", go: { kind: "post", id: "p-tahoe" }, for: ["jonah"] },
  { id: "nt-dining", by: "jonah", html: "**Calvin Karthik** commented on your post: lupe's at 1am is a religious experience", ago: 6 * H, unread: true, badge: "comment", go: { kind: "post", id: "p-dining" }, for: ["theo"] },
  { id: "nt-brunch", by: "maya", html: "**Maya Chen** commented on your post: the french toast changed me", ago: 22 * H, unread: false, badge: "comment", go: { kind: "post", id: "p-priya" }, for: ["priya"] },
  { id: "nt-wrapped", by: "jonah", html: "**Calvin Karthik** commented on your post: they're called podcasts", ago: 10 * H, unread: true, badge: "comment", go: { kind: "post", id: "p-wrapped" }, for: ["priya"] },
  { id: "nt-truths", by: "noa", html: "**Tsai Lin** started a round in **Two truths**", ago: 1 * H, unread: true, badge: "share", go: { kind: "chat", id: "priya", tool: "t-truths" }, for: ["priya"] },
];

/** The viewer's notifications, newest first: only the ones true for them, never one they did themselves. */
export const notifsFor = (viewer: string) => NOTIFS.filter((n) => n.for.includes(viewer) && n.by !== viewer).sort((a, b) => a.ago - b.ago);
