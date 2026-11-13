// Seeds the fake chats into the server through the normal protocol, so the live inbox looks
// like the fake one. Idempotent: fixed client ids and cseqs, so a rerun is deduped by the
// server, and a `seeded` marker in `t:index` skips the whole thing once it finished.
//
// The seeded tool cards are real: lab tools (library/lab) as rich as their examples, with this
// chat's people and facts, compiled, and friends' moves replayed into each tool room so the
// activity lines have someone behind them. Loaded the way the pre-made path loads them.

import { sourceOf } from "./premade.ts";
import { compileApp } from "@muse/sandbox/compile";
import type { Member } from "@muse/protocol";
import { seedChats } from "../../apps/shell/src/store/fake-data.ts";
import type { Chat } from "../../apps/shell/src/store/types.ts";
import { chatRoom, INDEX_ROOM, SEED_USER, toolRoom, type ChatAction } from "../../apps/shell/src/live/chat-reducer.ts";
import { EXTRA_PEOPLE } from "../../apps/shell/src/store/extras.ts";
import { REELS } from "../../apps/shell/src/surfaces/data.ts";
import { historyChats, UNREAD } from "./chats/index.ts";
import { priyaTry } from "./seed-surfaces.ts";
import { RoomClient } from "./proto.ts";

const CLIENT = "seed-v1";
/** Bump when the fake chats change: `bun run demo` then starts a new database instead of mixing them. */
export const SEED_VERSION = "5";
const wire = (id: string) => (id === "me" ? "noa" : id);
const FIRST: Record<string, string> = { noa: "Tsai Lin", maya: "Maya", dev: "Aditya", jonah: "Calvin", priya: "Will", theo: "Arun", ...Object.fromEntries(EXTRA_PEOPLE.map((p) => [p.id, p.first])) };

/**
 * `tool`: "lab:<id>". The tool starts from its example.ts with `renames` applied (the example's
 * people become this chat's), then `params` over that. `acts`: friends' moves replayed into the
 * tool room, in order. `line`: the activity line for the last move, in plain words.
 */
type SeedTool = { tool: string; /** the system line before the card, when it is not "Muse conjured ..." (id, text) */ sys?: { id: string; text: string }; renames?: Record<string, string>; params?: Record<string, unknown>; /** last edits to the renamed example (drop a vote so a move is left for Tsai Lin) */ tweak?: (p: any) => void; name: string; summary: string; line?: string; acts: { user: string; action: unknown }[] };

export const TOOLS: Record<string, SeedTool> = {
  // apt 4b: Tsai Lin, Maya, Will, Aditya
  "t-groceries": {
    tool: "lab:grocery",
    name: "Groceries",
    summary: "Apt 4B: Aditya is going, 0 of 7 in the cart",
    line: "Aditya took the grocery run",
    renames: { Theo: "Aditya", Dani: "Maya", Marcus: "Tsai Lin", Jess: "Will" },
    params: { title: "Apt 4B" },
    acts: [{ user: "dev", action: { t: "go" } }],
  },
  "t-utilities": {
    tool: "lab:utilities-split",
    name: "October utilities",
    summary: "October utilities: $286.00 · 1 of 3 paid",
    line: "Aditya agreed to the split",
    renames: { Theo: "Will", Dev: "Aditya" },
    params: { agree: ["Tsai Lin"] },
    acts: [{ user: "dev", action: { t: "agree" } }],
  },
  "t-wheel": {
    tool: "lab:chore-draft",
    name: "Chore draft",
    summary: "Chore draft: 2 of 8 picked · Tsai Lin is up",
    line: "Will took Fridge",
    renames: { Theo: "Will", Dev: "Aditya" },
    params: { sub: "Apt 4B · this week", order: ["Maya", "Will", "Tsai Lin", "Aditya"], picks: [] },
    acts: [
      { user: "maya", action: { t: "pick", chore: 1 } },
      { user: "priya", action: { t: "pick", chore: 2 } },
    ],
  },
  // senior week: Tsai Lin, Maya, Aditya, Calvin, Will, Arun ("pick for us" builds the night's slot machine live)
  "t-captions": {
    tool: "lab:caption-contest",
    name: "Caption this",
    summary: "Caption this · photo 1 of 2 · 5 of 6 voted",
    line: "Maya voted",
    // the two photos the chat found; Tsai Lin and Maya still to vote on the first one, Maya does, Tsai Lin is left
    params: {
      photos: [
        { place: "Big Sur, last November", scene: "beach", captions: [
          { by: "Will", text: "Maya's final form: low maintenance", voters: [] },
          { by: "Tsai Lin", text: "She said she wanted to ‘ground herself’", voters: ["Will", "Arun"] },
          { by: "Aditya", text: "Sunscreen: 0. Maya: also 0.", voters: ["Calvin"] },
          { by: "Calvin", text: "Tide comes in at 4. We leave at 3:55", voters: ["Aditya"] },
        ] },
        { place: "Joshua Tree, night 1", scene: "camp", captions: [
          { by: "Arun", text: "Hana set up the tent. Hana is now the tent.", voters: ["Maya"] },
          { by: "Aditya", text: "5-star glamping, 0-star engineering", voters: ["Will", "Arun"] },
          { by: "Maya", text: "We asked if she needed help. “I got it”", voters: ["Calvin"] },
          { by: "Will", text: "The coyotes are not the threat here", voters: ["Aditya"] },
        ] },
      ],
    },
    acts: [{ user: "maya", action: { t: "vote", caption: "p0c3" } }],
  },
  "t-bingo": {
    tool: "lab:road-bingo",
    name: "Road trip bingo",
    summary: "Road trip bingo: 8 of 24 spotted",
    line: "Arun spotted wrong exit (blame Maps)",
    renames: { Leo: "Calvin", Sam: "Aditya", Kev: "Arun", Ana: "Maya" },
    params: { to: "the beach house", miles: 212 },
    tweak: (p) => {
      const swap: Record<string, string> = {
        "Aditya drives w/ one knee": "Aditya does the dad wave at every truck",
        "Arun asleep, mouth open": "Arun DJs the whole first hour",
        "Arun: “I'm not even tired”": "Arun: “one more song”",
      };
      p.squares = p.squares.map((q: string) => swap[q] ?? q);
    },
    acts: [{ user: "theo", action: { t: "mark", cell: 2 } }],
  },
  "t-trip": {
    tool: "lab:trip-lock",
    name: "Senior week or never",
    summary: "Senior week or never: 4 of 6 seats · deposit Fri 5 PM",
    line: "Calvin took seat 1D",
    params: {
      title: "Senior week or never",
      sub: "Muse Air · trip for 6",
      date: "Mon, May 17 at 9:00 AM",
      from: "Apt 4B",
      to: "Cayucos",
      details: "May 17–21 · ~$140 each · gate: the chat",
      deadline: "Deposit due Fri at 5:00 PM",
      seats: ["1A", "1B", "1C", "1D", "1E", "1F"].map((code) => ({ code, who: "" })),
      lockAt: 6,
    },
    // the seats fill in the order the chat took them
    acts: [
      { user: "dev", action: { t: "in" } },
      { user: "priya", action: { t: "in" } },
      { user: "maya", action: { t: "in" } },
      { user: "jonah", action: { t: "in" } },
    ],
  },
  // the boys: Tsai Lin, Aditya, Calvin, Arun
  "t-juniper": {
    tool: "lab:concert",
    name: "Juniper Hale live",
    summary: "Juniper Hale live: 3 going, sitting in Section 104",
    line: "Arun is in",
    params: {
      title: "Juniper Hale live",
      when: "Fri, 8 PM",
      venue: "Meridian Hall",
    },
    renames: { Maya: "Calvin", Ana: "Aditya", Jess: "Aditya" },
    // Arun is the one who says yes, below
    tweak: (p) => {
      p.people = p.people.filter((x: { name: string }) => x.name !== "Leo" && !(x.name === "Aditya" && x.status === "maybe"));
    },
    acts: [{ user: "theo", action: { t: "rsvp", value: "in" } }],
  },
  "t-lobby": {
    tool: "lab:lobby",
    name: "Who's on tonight",
    summary: "Who's on tonight: best 9:00–11:00 · 3 on",
    line: "Arun is on till late",
    renames: { Bryan: "Calvin", Kev: "Arun", Dev: "Aditya" },
    tweak: (p) => {
      p.people = p.people.filter((x: { name: string }) => x.name !== "Omar");
    },
    acts: [{ user: "theo", action: { t: "paint", from: 4, to: 14, value: 2 } }],
  },
  "t-veto": {
    tool: "lab:dinner-veto",
    name: "After Juniper food",
    summary: "After Juniper food: 3 left · Calvin and Tsai Lin to veto",
    line: "Aditya vetoed Smash Shack",
    params: {
      title: "After Juniper food",
      time: "10:45",
      leaveBy: "10:30",
      spots: [
        { name: "Pier Pizza", kind: "pizza", price: "$", miles: 0.4, stars: 4.1 },
        { name: "Night Owl Diner", kind: "diner", price: "$", miles: 0.6, stars: 4.5 },
        { name: "Lupe's Tacos", kind: "tacos", price: "$", miles: 0.3, stars: 4.7 },
        { name: "Halal cart on Bancroft", kind: "halal", price: "$", miles: 0.2, stars: 4.6 },
        { name: "Smash Shack", kind: "burgers", price: "$$", miles: 0.9, stars: 4.4 },
      ],
      vetoes: [],
      passed: [],
    },
    acts: [
      { user: "theo", action: { t: "veto", spot: "s0", why: "so over it" } },
      { user: "dev", action: { t: "veto", spot: "s4", why: "0.9 mi after standing 3 hrs??" } },
    ],
  },
  // Maya Chen (DM): Tsai Lin, Maya
  "t-study": {
    tool: "lab:tier-list",
    name: "Study spot tier list",
    summary: "Study spot tier list · Maya ranked, your turn",
    params: {
      title: "Study spot tier list",
      noun: "spot",
      items: ["Main stacks 3rd floor", "Physics library", "Union cafe", "Campus Row Cafe", "Our kitchen table", "Night reading room"],
      ranked: [{ name: "Maya", tiers: "SACBDA" }],
    },
    acts: [],
  },
  "t-movies": {
    tool: "lab:movie-bracket",
    name: "Movie night",
    summary: "Movie night: match 1 of 7, Dune: Part Two vs Paddington 2",
    line: "Maya voted",
    renames: { Theo: "Maya", Dani: "Tsai Lin", Marcus: "Maya" },
    params: { when: "Sat 9 PM", where: "Apt 4B, on the wall", picks: [] },
    acts: [{ user: "maya", action: { t: "vote", side: 0 } }],
  },
  "t-gift": {
    tool: "lab:gift-pool",
    name: "Will's birthday",
    summary: "Gift for Will: $120 of $180, 6 of 9 in",
    line: "Aditya chipped in",
    params: {
      recipient: "Will",
      occasion: "he turns 21 at midnight",
      gift: "Record player",
      giftNote: "the teal one",
      quote: "i would die for a record player tbh",
      quoteDate: "Sep 14",
      goalCents: 18000,
      shareCents: 2000,
      crew: ["Tsai Lin", "Aditya", "Calvin", "Arun", "Maya", "Rae", "Jules", "Hana", "Omar"],
      paid: ["Maya", "Rae", "Jules"],
    },
    acts: [
      { user: "jonah", action: { t: "chip" } },
      { user: "theo", action: { t: "chip" } },
      { user: "dev", action: { t: "chip" } },
    ],
  },
  // Will Li (DM): Tsai Lin, Will
  "t-truths": {
    tool: "lab:two-truths",
    name: "Two truths",
    summary: "Two truths and a lie · Tsai Lin's round · 1 of 1 guessed",
    line: "Will guessed",
    renames: { Theo: "Arun", Dev: "Aditya", Jonah: "Calvin" },
    params: { chat: "senior week" },
    // the first round waits on the two of you
    tweak: (p) => {
      p.rounds[0].guesses = p.rounds[0].guesses.filter((g: { name: string }) => g.name !== "Will" && g.name !== "Tsai Lin");
    },
    acts: [{ user: "priya", action: { t: "guess", fact: 1 } }],
  },
  // late night: Arun, Calvin, Aditya (Tsai Lin joins from Arun's note); the lobby is below
  "t-bracket": {
    tool: "lab:tier-list",
    name: "Late-night food tier list",
    summary: "Late-night food tier list · 2 of 3 locked in",
    line: "Arun put Halal in S",
    params: {
      title: "Late-night food tier list",
      noun: "spot",
      items: ["Halal", "Insomnia", "Taco Bell", "$1 pizza", "Wawa", "Ramen"],
      ranked: [
        { name: "Calvin", tiers: "SACBAD" },
        { name: "Aditya", tiers: "SBACAD" },
      ],
    },
    acts: [
      { user: "theo", action: { t: "place", item: 1, tier: 1 } },
      { user: "theo", action: { t: "place", item: 0, tier: 0 } },
    ],
  },
  "t-sx-try": {
    tool: "lab:reel-to-try",
    sys: { id: "src-reels-tt-sx-reel", text: "**Will** added 3 places to **To try**" },
    name: "To try",
    summary: "To try: 3 spots · Golden Fold just added",
    params: priyaTry(REELS[0]!),
    acts: [], // seed-surfaces.ts replays Will's first move into this room
  },
  "t-kings": {
    tool: "lab:kings-cup",
    name: "King's cup",
    summary: "King's cup · Den rules v2 · 3 drawn",
    params: {
      title: "King's cup",
      sub: "The den rules v2",
      rules: [
        { title: "Waterfall", rule: "Arun starts. Nobody stops before Arun." },
        { title: "You", rule: "Pick someone to sip." },
        { title: "Me", rule: "You sip. Sorry." },
        { title: "Floor", rule: "Last to touch the (sticky) floor sips." },
        { title: "Guys", rule: "Guys sip." },
        { title: "Girls", rule: "Girls sip." },
        { title: "Pans", rule: "Whoever left pans out sips. (Jules.)" },
        { title: "Mate", rule: "Pick a mate. Tsai Lin picks Calvin, every time." },
        { title: "Rhyme", rule: "Rhyme with “roof”. Go." },
        { title: "Categories", rule: "Things on the den's roof right now." },
        { title: "New rule", rule: "Make a rule. Not “no phones” again." },
        { title: "Questions", rule: "Only answer with a question." },
        { title: "King's cup", rule: "Pour a splash in. 4th king drinks it. Lemonade counts, no pressure." },
      ],
      drawn: [
        { card: "3s", name: "Arun" },
        { card: "Kh", name: "Calvin" },
        { card: "9d", name: "Aditya" },
      ],
    },
    acts: [],
  },
  "t-pizza": {
    tool: "lab:pizza",
    name: "Pizza run",
    summary: "Pizza run: 3 of 4 picked · $8.05 each so far",
    line: "Will added mushroom and olive",
    params: {
      place: "Gino's on Channing",
      messages: 9,
      baseCents: 2200,
      toppingCents: 125,
      tipPercent: 20,
      wings: { label: "10 wings", cents: 1300, note: "Rae asked twice" },
      crew: [
        { name: "Will", quote: "mush + olive. no pepp", toppings: [], whatever: false },
        { name: "Rae", quote: "pineapple. don't @ me", toppings: ["pineapple"], whatever: false },
        { name: "Maya", quote: "whatever", toppings: [], whatever: true },
        { name: "Tsai Lin", quote: "", toppings: [], whatever: false },
      ],
    },
    acts: [
      { user: "priya", action: { t: "top", who: "priya", k: 1 } },
      { user: "priya", action: { t: "top", who: "priya", k: 2 } },
    ],
  },
};

/** A lab tool's example with the chat's people swapped in, then the seed's own params over it. */
export async function paramsOf(t: SeedTool): Promise<Record<string, unknown>> {
  const [kind, id] = t.tool.split(":") as [string, string];
  // lab tools only: a plain library piece is never seeded into a chat
  if (kind !== "lab") throw new Error(`seed: ${t.tool} is not a lab tool; seeded chats get lab tools only`);
  const example = ((await import(`../../library/lab/${id}/example.ts`)) as { default: Record<string, unknown> }).default;
  let json = JSON.stringify(example);
  // the lab examples use the cast's old first names (Noa, Priya, Dev, Jonah, Theo): today's names, unless the tool says otherwise
  const old: Record<string, string> = { Noa: FIRST.noa!, Priya: FIRST.priya!, Dev: FIRST.dev!, Jonah: FIRST.jonah!, Theo: FIRST.theo! };
  const r: Record<string, string> = { ...Object.fromEntries(Object.entries(old).filter(([a, b]) => a !== b)), ...(t.renames ?? {}) };
  // one pass, so a swap (Arun -> Aditya, Aditya -> Calvin) does not chain
  if (Object.keys(r).length) json = json.replace(new RegExp(`\\b(${Object.keys(r).join("|")})\\b`, "g"), (w) => r[w] ?? w);
  const out = { ...(JSON.parse(json) as Record<string, unknown>), ...(t.params ?? {}) };
  t.tweak?.(out);
  return out;
}

/** The chats as the inbox loads them: three weeks of history each (services/demo/chats). */
const allChats = (): Chat[] => historyChats(seedChats());

export async function seed(wsUrl: string, log: (s: string) => void = console.log): Promise<"seeded" | "already"> {
  const index = await new RoomClient(wsUrl, INDEX_ROOM, CLIENT, SEED_USER).join();
  if (index.entries.some((e) => (e.action as { t?: string })?.t === "seeded")) {
    index.close();
    return "already";
  }
  const t0 = performance.now();
  const chats = allChats();

  // 1. The directory.
  await index.sendAll(chats.map((c) => ({ t: "chat", id: c.id })));

  const clients: RoomClient[] = [index];
  for (const c of chats) {
    const members = c.members.map(wire);
    const memberList: Member[] = members.map((m) => ({ id: m, name: FIRST[m] ?? m }));
    const actions: ChatAction[] = [{ t: "create", name: c.name, kind: c.kind, members }];
    const toolIds: string[] = [];
    // an id that starts with "!" is used as is (another seeder writes the same message and dedupes by id)
    const idOf = (mid: string) => (mid.startsWith("!") ? mid.slice(1) : `${c.id}-${mid}`);
    for (const [i, m] of c.messages.entries()) {
      const id = idOf(m.id);
      const as = wire(m.from);
      if (m.kind === "activity") continue; // derived live from the tool's own log
      if (m.kind === "muse") {
        const t = m.muse?.toolId ? TOOLS[m.muse.toolId] : undefined;
        if (!t || !m.muse?.toolId) continue;
        // the line before the card, unless the history wrote one
        if (c.messages[i - 1]?.kind !== "system") {
          const sys = t.sys ?? { id: `${c.id}-${m.id}-built`, text: `**Muse** conjured **${t.name}** for this chat` };
          actions.push({ t: "msg", id: sys.id, kind: "system", at: m.at, text: sys.text });
        }
        const code = compileApp(await sourceOf({ tool: t.tool, params: await paramsOf(t) })).code;
        actions.push({ t: "tool", id: m.muse.toolId, name: t.name, summary: t.summary, code, by: "muse", at: m.at } as ChatAction);
        toolIds.push(m.muse.toolId);
        continue;
      }
      const base = { id, as, at: m.at, ...(m.replyTo ? { replyTo: idOf(m.replyTo) } : {}) };
      if (m.kind === "system") actions.push({ ...base, t: "msg", kind: "system", text: m.text ?? "" });
      else if (m.kind === "photo") actions.push({ ...base, t: "msg", kind: "photo", photo: m.photo! });
      else if (m.kind === "link") actions.push({ ...base, t: "msg", kind: "link", link: m.link!.site.startsWith("Reel ·") ? { ...m.link!, description: "Reels", shared: { kind: "reel", id: REELS[0]!.id } } : m.link! });
      else actions.push({ ...base, t: "msg", text: m.text ?? "" });
      for (const r of m.reactions) for (const who of r.by) actions.push({ t: "react", msg: id, emoji: r.emoji, once: true, as: wire(who) });
    }
    // Read receipts: who has seen the end of the chat.
    const last = [...c.messages].reverse().find((m) => m.kind !== "system" && m.kind !== "activity");
    if (last) {
      // everyone has read the end of the chat except the ones with an unread dot (UNREAD), who wrote it or not
      const readers = members.filter((m) => m === wire(last.from) || !(UNREAD[c.id] ?? []).includes(m));
      const lastId = last.kind === "muse" ? last.muse!.toolId! : idOf(last.id);
      for (const r of readers) actions.push({ t: "read", msg: lastId, as: r, at: last.at });
    }
    const room = await new RoomClient(wsUrl, chatRoom(c.id), CLIENT, SEED_USER).join();
    clients.push(room);
    await room.sendAll(actions);

    // 2. Each tool's own room: members first, then a friend's first move.
    const summaries: ChatAction[] = [];
    for (const toolId of toolIds) {
      const t = TOOLS[toolId]!;
      const sys = await new RoomClient(wsUrl, toolRoom(toolId), CLIENT, SEED_USER).join();
      clients.push(sys);
      await sys.sendAll([{ t: "@members", members: memberList }]);
      let lastEntry: { user: string; time: number } | null = null;
      for (const [i, a] of t.acts.entries()) {
        const rc = await new RoomClient(wsUrl, toolRoom(toolId), `${CLIENT}-${a.user}`, a.user).join();
        clients.push(rc);
        const [e] = await rc.sendAll([a.action]);
        void i;
        if (e) lastEntry = { user: e.user, time: e.time };
      }
      if (lastEntry) summaries.push({ t: "tool-summary", id: toolId, text: t.summary, by: lastEntry.user, at: lastEntry.time, ...(t.line ? { line: t.line } : {}) });
    }
    if (summaries.length) {
      // Continue this room's cseqs after the seed actions.
      summaries.forEach((a, i) => room.act(actions.length + 1 + i, a));
      await room.until(() => summaries.every((_, i) => room.mine(actions.length + 1 + i)));
    }
  }

  // 3. Done: later starts skip all of this.
  index.act(chats.length + 1, { t: "seeded" });
  await index.until(() => !!index.mine(chats.length + 1));
  for (const c of clients) c.close();
  log(`seeded ${chats.length} chats and ${Object.keys(TOOLS).length} tools in ${Math.round(performance.now() - t0)} ms`);
  return "seeded";
}

if (import.meta.main) {
  const url = process.argv[2] ?? "ws://127.0.0.1:8787/ws";
  console.log(await seed(url));
}

/** A person's first name as the seeded chats show it (change.ts: the chat Muse reads). */
export const firstName = (id: string) => FIRST[id] ?? id;

/** A seeded tool's source, the same one the seed compiled (change.ts: changing a seeded tool). */
export async function seededSource(toolId: string): Promise<{ source: string; piece: string; name: string } | null> {
  const t = TOOLS[toolId];
  if (!t) return null;
  return { source: await sourceOf({ tool: t.tool, params: await paramsOf(t) }), piece: t.tool.replace(/^lab:/, ""), name: t.name };
}

/** The members of the chat a seeded tool lives in, as its tool room sees them (checks). */
export function chatMembers(toolId: string): Member[] {
  const chats = allChats();
  const c = chats.find((x) => x.messages.some((m) => m.muse?.toolId === toolId));
  return (c?.members ?? []).map(wire).map((m) => ({ id: m, name: FIRST[m] ?? m }));
}
