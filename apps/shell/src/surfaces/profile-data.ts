// Profiles and the Friends tab: who someone is (a one-line bio from docs/FEED_SPEC.md, an intro),
// who their friends are, what they made with Muse, and the one thing Muse could make for the viewer
// and them. Profile ids are wire ids ("noa" is Tsai Lin, "dev" is Aditya, strangers keep theirs);
// "me" is whoever holds the phone. Everyone is made up except the five teammates, whose intros stay
// generic ("Studies at Eastfield", class year) on purpose.

import { store } from "../store";
import { ME, type Chat, type Person } from "../store/types";
import { EVENT, PEOPLE } from "../store/fake-data";
import { knownAs, viewerId } from "../lib/media";
import { names } from "../lib/format";
import { ALIASES } from "../live/config";
import { nav } from "../lib/nav.svelte";
import { fb } from "./fbnav.svelte";
import { who } from "./flows.svelte";
import { backing } from "./backing";
import { GROUPS, LISTINGS, POSTS, REELS, STORIES, type Post } from "./data";
import { withFeedPosts } from "../muse/feed";
import { say } from "./say";
import { BDAY21, FEED_POSTS, POTLUCK } from "../muse/seed";
import type { LandSpec } from "./types";
import type { PathRecord } from "../muse/types";

// ---------------------------------------------------------------- ids

/** The five teammates, by wire id. */
export const REAL = ["noa", "dev", "jonah", "theo", "priya"];

/** `?id=` or a tapped id to a profile id: "me" is the viewer, first names of the team work too. */
export function profileKey(raw: string): string {
  const r = raw.toLowerCase();
  if (r === "me") return viewerId();
  return ALIASES[r] ?? r;
}
/** The id components and the store use for this person ("me" for the viewer). */
export const compId = (key: string) => (key === viewerId() ? ME : key);
/** The id the seeded surface data uses ("me" there is Tsai Lin). */
const seedId = (key: string) => (key === "noa" ? ME : key);
export const isViewer = (key: string) => key === viewerId();

/** People from the spec's extras who are not in the shared people list yet. */
const extra = (id: string, name: string, tone: number): Person => ({ id, name, first: name.split(" ")[0]!, initials: name.split(" ").map((w) => w[0]).join(""), tone, active: false });
const EXTRAS: Person[] = [
  extra("jules", "Jules Moreau", 2),
  extra("omar", "Omar Haddad", 3),
  extra("hana", "Hana Ito", 4),
  extra("bea", "Bea Santos", 5),
  extra("wes", "Wes Duarte", 6),
  extra("tess", "Tess Yamamoto", 1),
  extra("leo", "Leo Brandt", 2),
  extra("dani", "Dani Flores", 3),
  extra("rae", "Rae Whitfield", 4),
  extra("kev", "Kev Tran", 5),
  extra("zoe", "Zoe Achebe", 6),
  extra("nico", "Nico Bauer", 1),
  extra("ava", "Ava Lindqvist", 2),
];

/** Anyone with a profile, by profile id. */
export function personOf(key: string): Person | undefined {
  if (isViewer(key)) return store.me;
  const c = compId(key);
  const tsai = key === "noa" ? PEOPLE.find((p) => p.id === ME) : undefined;
  return store.person(c) ?? who(c) ?? (tsai ? { ...tsai, id: "noa" } : undefined) ?? EXTRAS.find((p) => p.id === key);
}

/** Opens anyone's profile from a name or avatar (a component id: "me", "maya", "lena"...). */
export function openProfile(id: string) {
  if (!id || id === "muse" || id === "system") return;
  const key = knownAs(id);
  // already on that profile (a name in one of its own posts): stay
  const top = nav.layers.filter((l) => !l.leaving).at(-1)?.route;
  const cur = document.documentElement.dataset.layout === "desktop" ? nav.desktopFb : top?.kind === "fb" ? top.page : !top && nav.app === "facebook" && fb.tab === "profile" ? { name: "profile" as const, id: "me" } : null;
  if (cur?.name === "profile" && profileKey(cur.id) === key) return;
  nav.go({ kind: "fb", page: { name: "profile", id: key } });
}

// ---------------------------------------------------------------- who they are

/** One line under the name, from the spec's personality line (kind, and short, for the team). */
const BIO: Record<string, string> = {
  noa: "Climbing club admin. Plans everything, says \"ok fine\" before agreeing",
  maya: "Thesis due. Lives in the library, drives the Civic everyone fits in",
  dev: "Booked the senior week house. Cooks with too many pans",
  jonah: "Hosting Will's 21st. Has the pickup truck, says \"legend\"",
  priya: "Turns 21 at midnight tonight",
  theo: "Gym at 9 AM (dont ask). Made the late night bracket",
  lena: "Sublets group admin. Answers every DM in 4 minutes",
  ines: "Climbing club president. Runs ines.cooks",
  sam: "Reviews every taco truck on samtries",
  marco: "Moving to Portland on Sunday",
  kofi: "Grad student. Posts kofi.outside hikes, has a car with 3 seats",
  cami: "cami.eats dumpling reels. First outdoor climb this Sunday",
  ruth: "Has opinions about upholstery",
  jules: "The den's fourth roommate. Owns Gerald the plant",
  omar: "Runs at 6 AM. Arun's lab partner",
  hana: "Photo club. Shoots film at everything",
  bea: "Climbing club treasurer. Spreadsheets for fun",
  wes: "Foothill RA. Moving into apt 2C on Sunday",
  tess: "Dining hall critic. Writes 300 words about soup",
  leo: "14 hot sauces. Dani's cook night regular",
  dani: "Cooks for the whole floor. \"we're making this\"",
  rae: "Will's best friend from home",
  kev: "\"i'm not even tired\"",
  zoe: "Class of '27 president. Posts every event first",
  nico: "Juniper Hale superfan. Friday is his 7th show",
  ava: "40-day Chatdle streak",
};

export type IntroRow = { icon: string; html: string };

/** Made-up places for made-up people; the team gets school and class year only. */
const PLACE: Record<string, { lives?: string; from?: string; year?: string; studies?: string }> = {
  maya: { lives: "Apt 4B, Dwight Way", from: "Sacramento, California" },
  lena: { lives: "Dwight Way, Eastfield", from: "San Diego, California", year: "2028" },
  ines: { lives: "College Ave, Eastfield", from: "Seoul, South Korea" },
  sam: { lives: "Channing Way, Eastfield", from: "Houston, Texas", year: "2028" },
  marco: { lives: "Eastfield", from: "Lisbon, Portugal" },
  kofi: { lives: "North Eastfield", from: "Accra, Ghana", studies: "Grad student at Eastfield", year: "" },
  cami: { lives: "Derby St, Eastfield", from: "Tucson, Arizona", year: "2028" },
  ruth: { lives: "Hearst Ave, Eastfield", from: "Portland, Oregon" },
  jules: { lives: "The den, Ellis St", from: "Lyon, France" },
  omar: { lives: "The den, Ellis St", from: "Dearborn, Michigan" },
  hana: { lives: "Eastfield", from: "Honolulu, Hawaii", year: "2028" },
  bea: { lives: "Eastfield", from: "Manila, Philippines" },
  wes: { lives: "Foothill, Eastfield", from: "Fresno, California", year: "2028" },
  tess: { lives: "Eastfield", from: "Seattle, Washington", year: "2029" },
  leo: { lives: "Eastfield", from: "Denver, Colorado" },
  dani: { lives: "Eastfield", from: "El Paso, Texas", year: "2028" },
  rae: { from: "", studies: "" },
  kev: { lives: "Eastfield", from: "San Jose, California" },
  zoe: { lives: "Eastfield", from: "Atlanta, Georgia" },
  nico: { lives: "Eastfield", from: "Munich, Germany", year: "2029" },
  ava: { lives: "Eastfield", from: "Minneapolis, Minnesota", year: "2028" },
};

export type Profile = { key: string; person: Person; bio: string; intro: IntroRow[]; friends: number; real: boolean; cover: string };

const b = (s: string) => `<strong>${s}</strong>`;


export function profile(key: string): Profile | undefined {
  const person = personOf(key);
  if (!person) return undefined;
  const real = REAL.includes(key);
  const pl = PLACE[key] ?? {};
  const intro: IntroRow[] = [];
  const studies = pl.studies ?? "Studies at Eastfield";
  if (studies) intro.push({ icon: "pf_school", html: studies.replace("Eastfield", b("Eastfield")) });
  const year = pl.year ?? "2027";
  if (year) intro.push({ icon: "calendar", html: `Class of ${b(year)}` });
  if (!real && pl.lives) intro.push({ icon: "pf_home", html: `Lives in ${b(pl.lives)}` });
  if (!real && pl.from) intro.push({ icon: "location_pin", html: `From ${b(pl.from)}` });
  return { key, person, bio: BIO[key] ?? "", intro, friends: friendsOf(key).length, real, cover: COVER[key] ?? `profile-${key}` };
}

/** Cover: the person's own story picture where they have one, else a drawn cover from the id. */
const COVER: Record<string, string> = Object.fromEntries(STORIES.filter((s) => s.asset).map((s) => [s.by === ME ? "noa" : s.by, s.asset!]));

// ---------------------------------------------------------------- friends

/** Who knows whom (both ways), from the spec's places and threads. */
const EDGES: [string, string[]][] = [
  ["noa", ["maya", "dev", "priya", "jonah", "theo", "ines", "bea", "kofi", "cami", "hana", "lena", "sam", "kev", "ava", "leo", "ruth"]],
  ["maya", ["dev", "priya", "jonah", "theo", "hana", "bea", "kofi", "ines", "cami", "zoe", "tess", "kev"]],
  ["dev", ["priya", "jonah", "theo", "omar", "jules", "kev", "sam", "marco", "dani"]],
  ["jonah", ["theo", "jules", "omar", "priya", "kev", "rae", "leo", "zoe"]],
  ["priya", ["theo", "rae", "kev", "nico", "ava", "tess", "zoe"]],
  ["theo", ["jules", "omar", "hana", "bea", "kofi", "nico"]],
  ["ines", ["bea", "kofi", "cami", "sam", "lena"]],
  ["bea", ["kofi", "hana", "cami"]],
  ["kofi", ["hana", "cami"]],
  ["lena", ["sam", "marco", "ruth"]],
  ["dani", ["leo", "tess"]],
  ["wes", ["tess", "zoe"]],
  ["nico", ["zoe", "ava"]],
];
const GRAPH = new Map<string, Set<string>>();
for (const [a, list] of EDGES)
  for (const x of list) {
    (GRAPH.get(a) ?? GRAPH.set(a, new Set()).get(a)!).add(x);
    (GRAPH.get(x) ?? GRAPH.set(x, new Set()).get(x)!).add(a);
  }

/** The friends we know of, cast first. */
export function friendsOf(key: string): string[] {
  const all = [...(GRAPH.get(key) ?? [])];
  return [...all.filter((x) => REAL.includes(x) || x === "maya"), ...all.filter((x) => !REAL.includes(x) && x !== "maya")];
}
export const areFriends = (a: string, b: string) => GRAPH.get(a)?.has(b) ?? false;
export const mutual = (a: string, b: string) => friendsOf(a).filter((x) => x !== b && areFriends(b, x));
/** "1 friend", "12 friends": the count shown next to a list of people is the list's length. */
export const friendsText = (n: number) => `${n} friend${n === 1 ? "" : "s"}`;
/** The one line every screen shows under a person for the friends you share ("" when none), from the two friend lists. */
export const mutualText = (a: string, b: string) => {
  const n = mutual(a, b).length;
  return n ? `${n} mutual friend${n === 1 ? "" : "s"}` : "";
};

/** Friend requests to the viewer: three people they do not know yet. */
const REQUESTS = ["rae", "wes", "nico", "jules", "tess", "omar", "dani", "zoe"];
const MAY_KNOW = ["jules", "omar", "hana", "zoe", "dani", "tess", "leo", "wes", "ava", "marco", "ruth", "kev", "bea", "kofi", "cami", "sam", "lena", "ines"];
const strangerTo = (v: string) => (x: string) => x !== v && !areFriends(v, x);
export function requestsFor(v: string): string[] {
  return REQUESTS.filter(strangerTo(v)).slice(0, 3);
}
export function mayKnowFor(v: string): string[] {
  const req = requestsFor(v);
  return MAY_KNOW.filter(strangerTo(v))
    .filter((x) => !req.includes(x))
    .sort((a, b) => mutual(v, b).length - mutual(v, a).length)
    .slice(0, 6);
}

/** Birthdays this week (the spec's one: Will turns 21, midnight tonight, so Friday). */
export const BIRTHDAYS: { key: string; when: string; turning: number }[] = [{ key: "priya", when: "Friday", turning: 21 }];

// ---------------------------------------------------------------- posts and photos

/** The person's own posts from the feed, in feed order (tool posts included). */
export function postsBy(key: string): Post[] {
  const id = isViewer(key) && key !== "noa" ? [key] : [seedId(key)];
  return withFeedPosts(POSTS).filter((p) => id.includes(p.by));
}

/** Pictures for the Photos tab: their posts' and stories' pictures. */
export function photosOf(key: string): { id: string; label: string }[] {
  const by = seedId(key);
  const out: { id: string; label: string }[] = [];
  for (const p of POSTS) if (p.by === by && p.kind === "text" && p.media?.asset) out.push({ id: p.media.asset, label: p.media.label });
  for (const g of GROUPS) for (const p of g.posts) if (p.by === by && p.media?.asset) out.push({ id: p.media.asset, label: p.media.label });
  for (const s of STORIES) if (s.by === by && s.asset) out.push({ id: s.asset, label: s.caption || "Story" });
  return out;
}
export const reelsBy = (key: string) => REELS.filter((r) => r.by === seedId(key));

// ---------------------------------------------------------------- Made with Muse

export type MuseItem = { id: string; backingKey: string; toolId?: string; name: string; role: "made" | "joined"; where: string; open: () => void };

const openPost = (id: string) => {
  nav.toFacebook("home");
  fb.focusPost = id;
};
const goFb = (page: Parameters<typeof nav.go>[0]) => () => nav.go(page);

/** The pages friends make tools on (catalyst rooms), and how to get back to each. */
function pages(): { key: string; where: string; open: () => void }[] {
  const pk = (kind: string, id: string) => `surface:page:${kind}:${id}`;
  return [
    ...FEED_POSTS.map((p) => ({ key: pk("post", p.id), where: `On ${personOf(p.by === ME ? "noa" : p.by)?.first ?? "a friend"}'s post`, open: () => openPost(p.id) })),
    ...LISTINGS.map((l) => ({ key: pk("listing", l.id), where: `On ${l.title.toLowerCase()}`, open: goFb({ kind: "fb", page: { name: "listing", id: l.id } }) })),
    ...[EVENT.id, POTLUCK.id, BDAY21.id].map((id) => ({ key: pk("event", id), where: `On ${store.event(id)?.title ?? "an event"}`, open: goFb({ kind: "event", id }) })),
    ...STORIES.map((s) => ({ key: pk("story", s.id), where: "On a story", open: goFb({ kind: "fb", page: { name: "story", id: s.id } }) })),
    ...REELS.map((r) => ({ key: pk("reel", r.id), where: `On ${r.handle}'s reel`, open: goFb({ kind: "fb", page: { name: "reels", id: r.id } }) })),
    { key: pk("gaming", "gaming"), where: "In Gaming", open: goFb({ kind: "fb", page: { name: "gaming" } }) },
  ];
}

/** Tools this person made or took part in, live where the store has them. Read inside a $derived. */
export function museItems(key: string): MuseItem[] {
  const sid = seedId(key);
  const ids = new Set([key, sid, compId(key)]);
  const out: MuseItem[] = [];
  const push = (x: MuseItem) => {
    if (!out.some((o) => o.backingKey === x.backingKey && (o.toolId ?? o.name) === (x.toolId ?? x.name))) out.push(x);
  };
  // friends' tool posts and bracket posts on Home
  for (const p of POSTS) {
    if (!("backingKey" in p)) continue; // posts with a tool (surfaces/data.ts FEED)
    const tool = backing(p.backingKey)?.tools.find((t) => t.id === p.toolId);
    const joined = (tool?.acts ?? []).some((a) => ids.has(a.user)) || (p.kind === "bracket" && p.voters.includes(sid));
    if (p.by === sid || joined) push({ id: `${p.backingKey}/${p.toolId}`, backingKey: p.backingKey, toolId: p.toolId, name: tool?.name ?? (p.kind === "tool" || p.kind === "live" ? say(p.headline) : "Bracket"), role: p.by === sid ? "made" : "joined", where: `On ${p.by === sid ? "their" : `${personOf(p.by)?.first}'s`} post`, open: () => openPost(p.id) });
  }
  // groups: pinned tools, posts that became tools, and tools friends used there
  for (const g of GROUPS) {
    const tools = backing(g.backingKey)?.tools ?? [];
    const open = goFb({ kind: "fb", page: { name: "group", id: g.id } });
    for (const pin of g.pinned) if (pin.by === sid) push({ id: `${g.backingKey}/${pin.toolId}`, backingKey: g.backingKey, toolId: pin.toolId, name: tools.find((t) => t.id === pin.toolId)?.name ?? "Pinned Mini", role: "made", where: `In ${g.name}`, open });
    for (const p of g.posts) if (p.toolId && p.by === sid) push({ id: `${g.backingKey}/${p.toolId}`, backingKey: g.backingKey, toolId: p.toolId, name: tools.find((t) => t.id === p.toolId)?.name ?? "Mini", role: "made", where: `In ${g.name}`, open });
    for (const t of tools) if (t.acts.some((a) => ids.has(a.user))) push({ id: `${g.backingKey}/${t.id}`, backingKey: g.backingKey, toolId: t.id, name: t.name, role: "joined", where: `In ${g.name}`, open });
  }
  // tools made on pages (live: seeded by services/demo/seed-catalysts.ts, credited with who made them)
  for (const pg of pages())
    for (const t of store.surfaceTools(pg.key))
      if (t.by && ids.has(t.by) && !t.building) push({ id: `${pg.key}/${t.id}`, backingKey: pg.key, toolId: t.id, name: t.name, role: "made", where: pg.where, open: pg.open });
  return [...out.filter((x) => x.role === "made"), ...out.filter((x) => x.role === "joined")].slice(0, 8);
}

// ---------------------------------------------------------------- Muse for the two of you

export type Offer = { id: string; label: string; detail: string; faces: string[]; title: string; summary: string; tool: string; params: Record<string, unknown> };

const APT_4B = ["noa", "maya", "priya", "dev"];
const BOYS = ["noa", "dev", "jonah", "theo"];
const CLIMB = ["noa", "ines", "bea", "kofi", "cami", "maya", "theo"];
const firstOf = (k: string) => personOf(k)?.first ?? k;
const concertDay = () => new Date(EVENT.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** Every offer that fits the two of them, best first. All are lab tools, filled so they open in progress. */
export function offersFor(v: string, k: string): Offer[] {
  const V = firstOf(v);
  const K = firstOf(k);
  const out: Offer[] = [];
  if (BIRTHDAYS.some((x) => x.key === k)) {
    // who signed is the notes list: the detail line, the count and the faces are all read from it, and someone who signed is not asked to
    const signed = [
      { id: "jonah", text: "21 and thriving" },
      { id: "maya", text: "best roomie ever" },
      { id: "theo", text: "roof at midnight" },
    ].filter((n) => n.id !== k);
    const notes = signed.map((n) => ({ by: firstOf(n.id), text: n.text }));
    const youSigned = signed.some((n) => n.id === v);
    out.push({
      id: `bday-${k}`,
      label: `Make ${K} a birthday card`,
      detail: `${K} turns 21 Friday · ${names(notes.map((n) => n.by))} signed`,
      faces: signed.map((n) => n.id),
      title: `Happy 21st, ${K}`,
      summary: `${notes.length} signed${youSigned ? "" : " · add yours"}`,
      tool: "lab:bday-pool",
      params: {
        who: K,
        heading: `Happy 21st, ${K}`,
        candles: "21",
        when: "friday at 9pm",
        notes,
        lines: ["happy 21st, love u", "first round is on me", "see u on the roof"],
        gift: { name: "Birthday dinner", goalCents: 12000, buyer: firstOf("maya") },
        pot: [
          { by: firstOf("jonah"), cents: 2500 },
          { by: firstOf("maya"), cents: 2500 },
        ].filter((n) => n.by !== V),
        amounts: [1000, 2000],
      },
    });
  }
  if (APT_4B.includes(v) && APT_4B.includes(k)) {
    const third = APT_4B.find((x) => x !== v && x !== k)!;
    out.push({
      id: `tab-${k}`,
      label: `Settle up with ${K}`,
      detail: "October utilities in Apt 4B · 1 of 3 paid",
      faces: [k],
      title: `Apt 4B tab · ${V} and ${K}`,
      summary: "$286 utilities · 1 of 3 paid",
      tool: "lab:settle-up",
      params: {
        title: "Apt 4B tab",
        ious: [
          { from: V, to: K, cents: 7150, why: "Oct utilities" },
          { from: firstOf(third), to: K, cents: 7150, why: "Oct utilities" },
          { from: K, to: V, cents: 1840, why: "groceries" },
          { from: V, to: K, cents: 900, why: "Gino's pizza" },
        ],
      },
    });
  }
  const going = [...new Set([...EVENT.friends, ...BOYS.filter((x) => x !== "noa"), "noa"])];
  if (going.includes(v) && going.includes(k)) {
    out.push({
      id: `seats-${k}`,
      label: `Sit together at Juniper Hale`,
      detail: `Fri 8 PM · Meridian Hall · you're both going`,
      faces: [k],
      title: `Juniper Hale seats`,
      summary: `${K} picked Floor GA`,
      tool: "lab:ticket-split",
      params: {
        venue: "Meridian Hall",
        date: concertDay(),
        tiers: [
          { name: "Balcony", kind: "rows", priceCents: 3800, feeCents: 650, left: 64, together: "Row C · seats side by side", row: "C" },
          { name: "Floor GA", kind: "lawn", priceCents: 5200, feeCents: 850, left: 140, together: "Standing · stay together" },
          { name: "Front rows", kind: "pit", priceCents: 7400, feeCents: 1100, left: 12, together: "Rows A to D · near the stage" },
        ],
        tier: 1,
        people: [V, K],
        payer: K,
      },
    });
  }
  if (CLIMB.includes(v) && CLIMB.includes(k)) {
    out.push({
      id: `rides-${k}`,
      label: `Ride to Castle Rock together`,
      detail: "Crag day Sun 8 AM · climbing club",
      faces: [k],
      title: "Rides to Castle Rock",
      summary: `${firstOf("kofi")} has 1 seat left`,
      tool: "lab:event-carpool",
      params: {
        title: "Rides to Castle Rock",
        place: "Castle Rock · Sun 8 AM",
        cars: [
          { driver: firstOf("kofi"), model: `${firstOf("kofi")}'s car`, seats: 3, leaves: "7:15", from: "North Eastfield", costCents: 1200, costLabel: "Gas", riders: [firstOf("cami")] },
          { driver: firstOf("maya"), model: `${firstOf("maya")}'s Civic`, seats: 4, leaves: "7:30", from: "Apt 4B", costCents: 1200, costLabel: "Gas", riders: [] },
        ],
      },
    });
  }
  // nothing shared yet: the concert, which most of Eastfield is going to
  if (!out.length)
    out.push({
      id: `seats-${k}`,
      label: `Go to Juniper Hale together`,
      detail: "Fri 8 PM · Meridian Hall",
      faces: [k],
      title: "Juniper Hale seats",
      summary: "pick a section",
      tool: "lab:ticket-split",
      params: { venue: "Meridian Hall", date: concertDay(), tier: 0, people: [V, K], payer: V },
    });
  return out;
}

/** The one-to-one chat with this person: a DM if there is one, else the one Muse made from their profile. */
export function chatWith(key: string): Chat | undefined {
  const c = compId(key);
  return store.chats.find((x) => x.kind === "dm" && x.members.includes(c)) ?? store.chats.find((x) => x.key === dmKey(key));
}
const dmKey = (key: string) => `profile:${[viewerId(), key].sort().join(":")}`;

/** Lands the offer in the one-to-one chat (the gateway's /premade path) and opens it. */
export function landOffer(key: string, o: Offer, ask: string): string {
  const existing = chatWith(key);
  const p = personOf(key)!;
  const spec: LandSpec = {
    ...(existing ? { chatId: existing.id } : { newChat: { key: dmKey(key), name: p.name, members: [ME, compId(key)] } }),
    piece: "",
    params: {},
    title: o.title.slice(0, 80),
    ask: `muse ${ask}`.slice(0, 300),
    templateId: "poll",
    summary: o.summary,
    premade: { scenario: `profile-${o.id.split("-")[0]}`, choices: [{ tool: o.tool, params: o.params }] },
    source: { surface: "Home", text: `**${store.me.first}** made this from **${p.first}'s profile**` },
  };
  const rec: PathRecord = { at: Date.now(), surface: "feed", object: `profile:${key}`, ask, via: "suggestion", path: "premade", scenario: spec.premade!.scenario, tool: o.tool, confidence: 1, why: o.detail, land: "chat" };
  (window as unknown as { __musePaths?: PathRecord[] }).__musePaths?.push(rec);
  const chatId = store.landPiece(spec);
  nav.openChat(chatId);
  return chatId;
}

/**
 * A typed ask on a profile goes with the one offer shown (its lab tool, filled from what the two
 * share), the ask as its words. SWITCH TO readPage: when apps/shell/src/muse/reader.ts lands, this
 * is the single call site to replace with `readPage(context, "ask", text)` and its pick.
 */
export function offerForAsk(offers: Offer[], _text: string): Offer {
  return offers[0]!;
}
