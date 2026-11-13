import type { Chat, ChatTheme, EventInfo, Message, Note, Person, Tool } from "./types";
import { BDAY21, POTLUCK } from "../muse/seed"; // catalysts

/** Fixed morning so screenshots do not drift: "now" is 9:41 am local today. */
const midnight = new Date();
midnight.setHours(0, 0, 0, 0);
export const CLOCK_BASE = midnight.getTime() + (9 * 60 + 41) * 60_000;

/** day: 0 today, -1 yesterday... */
const at = (day: number, h: number, m: number) => {
  const d = new Date(midnight);
  d.setDate(d.getDate() + day);
  return d.getTime() + (h * 60 + m) * 60_000;
};

const p = (id: string, name: string, tone: number, active = false, first = name.split(" ")[0] ?? name): Person => ({
  id,
  name,
  first,
  initials: name.split(" ").map((w) => w[0]).join(""),
  tone,
  active,
});

export const PEOPLE: Person[] = [
  p("noa", "Tsai Lin", 5, true, "Tsai Lin"),
  p("maya", "Maya Chen", 3, true),
  p("dev", "Aditya Kapoor", 2),
  p("jonah", "Calvin Karthik", 6),
  p("priya", "Will Li", 1, true),
  p("theo", "Arun Vaithianathan", 4),
];

export const MUSE: Person = {
  id: "muse",
  name: "Muse",
  first: "Muse",
  initials: "M",
  tone: 1,
  active: false,
};

export const EVENT: EventInfo = {
  id: "juniper",
  title: "Juniper Hale live",
  start: (() => {
    const d = new Date(midnight);
    d.setDate(d.getDate() + (((5 - d.getDay() + 7) % 7) || 7));
    return d.getTime() + 20 * 60 * 60_000;
  })(),
  venue: "Meridian Hall",
  address: "40 Campus Row, Eastfield",
  host: "Meridian Hall",
  interested: 1403,
  going: 84,
  description: "One night only. Doors at 7, music at 8. Student tickets at the box office with a valid ID.",
  friends: ["maya", "theo", "priya"],
};

/** Who is in each seeded chat (wire ids). The chat's own member list: read it here, never retype it. */
export const CHAT_MEMBERS: Record<string, readonly string[]> = {
  apt4b: ["noa", "maya", "priya", "dev"],
  boys: ["noa", "dev", "jonah", "theo"],
  maya: ["noa", "maya"],
  senior: ["noa", "maya", "dev", "jonah", "priya", "theo"],
  priya: ["noa", "priya"],
};

let n = 0;
const m = (
  from: string,
  time: number,
  text: string | undefined,
  extra: Partial<Message> = {},
): Message => ({
  id: `m${++n}`,
  from,
  kind: "text",
  at: time,
  reactions: [],
  ...(text !== undefined ? { text } : {}),
  ...extra,
});

function apt4b(): Chat {
  const ua = m("maya", at(-1, 21, 2), "electric bill came. $142??");
  const ub = m("dev", at(-1, 21, 3), "who is running the ac 24/7");
  const uc = m("priya", at(-1, 21, 4), "its 90 degrees in my room ok", { reactions: [{ emoji: "😆", by: ["dev"] }] });
  const ud = m("noa", at(-1, 21, 5), "then you get the overage lol");
  const us0 = m("system", at(-1, 21, 6), "**Muse** conjured **October utilities** for this chat", { kind: "system" });
  const us1 = m("muse", at(-1, 21, 6), undefined, {
    kind: "muse",
    muse: { appId: "utilities-split", title: "October utilities", subtitle: "Made with Muse", toolId: "t-utilities" },
  });
  const a = m("priya", at(-1, 23, 20), "who ate my oat milk");
  const b = m("priya", at(-1, 23, 20), "i swear to god");
  const c = m("maya", at(-1, 23, 21), "not me i literally cant have it");
  const d = m("dev", at(-1, 23, 23), "ok it was me");
  const e = m("dev", at(-1, 23, 23), "i'll replace it");
  const f = m("noa", at(-1, 23, 24), "he says that every time", {
    reactions: [{ emoji: "😆", by: ["priya", "maya"] }],
  });
  const g = m("priya", at(-1, 23, 26), "you said that about the tupperware", {
    replyTo: e.id,
    reactions: [{ emoji: "😆", by: ["dev", "noa"] }],
  });
  const gx = m("priya", at(-1, 23, 38), "also we have 1 egg and no tp. we need a real run");
  const bs0 = m("system", at(-1, 23, 40), "**Muse** conjured **Groceries** for this chat", { kind: "system" });
  const bs1 = m("muse", at(-1, 23, 40), undefined, {
    kind: "muse",
    muse: { appId: "grocery", title: "Groceries", subtitle: "Made with Muse", toolId: "t-groceries" },
  });
  const h = m("maya", at(0, 9, 12), "ok who's on dishes this week");
  const i = m("maya", at(0, 9, 12), "the sink is a biohazard");
  const j = m("maya", at(0, 9, 13), undefined, {
    kind: "photo",
    photo: { tone: 1, label: "Photo of the kitchen sink piled with dirty dishes", asset: "place-apt-sink" },
    reactions: [{ emoji: "😮", by: ["noa", "dev"] }],
  });
  const k = m("noa", at(0, 9, 15), "thats not even mine");
  const l = m("noa", at(0, 9, 15), "thats adityas pan from sunday");
  const o = m("dev", at(0, 9, 16), "allegedly", { reactions: [{ emoji: "😆", by: ["maya"] }] });
  const q = m("priya", at(0, 9, 20), "lease says shared stuff is on all of us btw");
  const r = m("priya", at(0, 9, 20), undefined, {
    kind: "link",
    link: {
      site: "housing.example",
      title: "Shared spaces: what you owe your roommates",
      description: "Dishes, fridge space and quiet hours in plain words.",
    },
  });
  const s = m("system", at(0, 9, 28), "**Muse** conjured **Chore draft** for this chat", { kind: "system" });
  const t = m("muse", at(0, 9, 28), undefined, {
    kind: "muse",
    muse: { appId: "chore-draft", title: "Chore draft", subtitle: "Made with Muse", toolId: "t-wheel" },
  });
  const u = m("noa", at(0, 9, 30), "ok fine draft it", { reactions: [{ emoji: "❤️", by: ["maya"] }] });
  const v = m("system", at(0, 9, 31), "**Will** took Fridge", { kind: "activity", activity: { toolId: "t-wheel" } });
  return {
    id: "apt4b",
    name: "apt 4b",
    kind: "group",
    members: [...CHAT_MEMBERS.apt4b!],
    messages: [ua, ub, uc, ud, us0, us1, a, b, c, d, e, f, g, gx, bs0, bs1, h, i, j, k, l, o, q, r, s, t, u, v],
    unread: false,
    typing: ["priya"],
    seenBy: ["maya", "priya"],
    activeNow: false,
  };
}

/** Arun shares the event, someone makes a who's in, Arun is in. */
function boysTool(): Message[] {
  const link = m("theo", at(0, 9, 24), undefined, {
    kind: "link",
    link: {
      site: fmtEventDate(EVENT.start),
      title: EVENT.title,
      description: `${EVENT.venue} · ${EVENT.going} going`,
      eventId: EVENT.id,
    },
  });
  const sys = m("system", at(0, 9, 25), "**Muse** conjured **Juniper Hale live** for this chat", { kind: "system" });
  const card = m("muse", at(0, 9, 25), undefined, {
    kind: "muse",
    muse: { appId: "concert", title: "Juniper Hale live", subtitle: "Made with Muse", toolId: "t-juniper" },
  });
  const act = m("system", at(0, 9, 27), "**Arun** is in", { kind: "activity", activity: { toolId: "t-juniper" } });
  return [link, sys, card, act];
}

function boys(): Chat {
  return {
    id: "boys",
    name: "the boys",
    kind: "group",
    members: [...CHAT_MEMBERS.boys!],
    messages: [
      m("jonah", at(-1, 18, 2), "anyone going to the game friday"),
      m("theo", at(-1, 18, 3), "depends who's driving"),
      m("theo", at(-1, 18, 3), "not me"),
      m("dev", at(-1, 18, 5), "i can drive if someone covers gas"),
      m("noa", at(-1, 18, 6), "ill cover gas"),
      m("jonah", at(-1, 18, 6), "legend"),
      m("jonah", at(-1, 21, 40), "whos on tonight, new season dropped"),
      m("dev", at(-1, 21, 41), "9 to 11 then im out"),
      m("system", at(-1, 21, 42), "**Muse** conjured **Who's on tonight** for this chat", { kind: "system" }),
      m("muse", at(-1, 21, 42), undefined, { kind: "muse", muse: { appId: "lobby", title: "Who's on tonight", subtitle: "Made with Muse", toolId: "t-lobby" } }),
      m("jonah", at(0, 9, 22), "bro its 9am why are you all awake"),
      m("theo", at(0, 9, 22), "gym"),
      m("theo", at(0, 9, 23), "dont ask"),
      ...boysTool(),
    ],
    unread: true,
    typing: [],
    seenBy: [],
    activeNow: false,
  };
}

function mayaDm(): Chat {
  return {
    id: "maya",
    name: "Maya Chen",
    kind: "dm",
    members: [...CHAT_MEMBERS.maya!],
    messages: [
      m("maya", at(-1, 20, 40), "did u finish the bio problem set"),
      m("noa", at(-1, 20, 44), "half. stuck on 4"),
      m("maya", at(-1, 20, 44), "same lol. library tmrw?"),
      m("noa", at(-1, 20, 50), "yeah 2?"),
      m("maya", at(0, 8, 55), "see you at 2"),
      m("maya", at(0, 8, 55), "bring the charger pls"),
      m("maya", at(0, 8, 57), "movie after? i have dune, paddington 2, past lives, shrek 2..."),
      m("noa", at(0, 8, 58), "bracket it"),
      m("system", at(0, 8, 58), "**Muse** conjured **Movie night** for this chat", { kind: "system" }),
      m("muse", at(0, 8, 58), undefined, { kind: "muse", muse: { appId: "movie-bracket", title: "Movie night", subtitle: "Made with Muse", toolId: "t-movies" } }),
      m("maya", at(0, 9, 2), "also wills bday is sat. the headphones he keeps sending?"),
      m("noa", at(0, 9, 3), "yes. split it with the boys"),
      m("system", at(0, 9, 3), "**Muse** conjured **Will's birthday** for this chat", { kind: "system" }),
      m("muse", at(0, 9, 3), undefined, { kind: "muse", muse: { appId: "gift-pool", title: "Will's birthday", subtitle: "Made with Muse", toolId: "t-gift" } }),
    ],
    unread: false,
    typing: [],
    seenBy: [],
    activeNow: true,
  };
}

function priyaDm(): Chat {
  return {
    id: "priya",
    name: "Will Li",
    kind: "dm",
    members: [...CHAT_MEMBERS.priya!],
    messages: [
      m("noa", at(-5, 21, 10), "did you get the email from the registrar"),
      m("priya", at(-5, 21, 12), "ya its fine, just a form"),
      m("priya", at(-5, 21, 12), "ill send it"),
      m("noa", at(-5, 21, 20), "ok bring the charger tmrw"),
      m("priya", at(-1, 22, 10), "ok i made a two truths about the senior week people"),
      m("priya", at(-1, 22, 10), "you will never get calvins"),
      m("system", at(-1, 22, 11), "**Muse** conjured **Two truths** for this chat", { kind: "system" }),
      m("muse", at(-1, 22, 11), undefined, { kind: "muse", muse: { appId: "two-truths", title: "Two truths", subtitle: "Made with Muse", toolId: "t-truths" } }),
    ],
    unread: false,
    typing: [],
    seenBy: ["priya"],
    activeNow: true,
  };
}

function seniorWeek(): Chat {
  return {
    id: "senior",
    name: "senior week",
    kind: "group",
    members: [...CHAT_MEMBERS.senior!],
    messages: [
      m("maya", at(-3, 14, 5), "ok so are we actually doing the beach thing"),
      m("jonah", at(-3, 14, 9), "if there is a house yes"),
      m("dev", at(-3, 14, 31), "i booked the house"),
      m("dev", at(-3, 14, 31), "sleeps 8, 4 bedrooms"),
      m("priya", at(-3, 14, 40), "aditya you are carrying this trip"),
      m("jonah", at(-3, 14, 42), "road trip bingo or im not getting in the car"),
      m("system", at(-3, 14, 43), "**Muse** conjured **Road trip bingo** for this chat", { kind: "system" }),
      m("muse", at(-3, 14, 43), undefined, { kind: "muse", muse: { appId: "road-bingo", title: "Road trip bingo", subtitle: "Made with Muse", toolId: "t-bingo" } }),
      m("priya", at(-2, 20, 10), "found the pics from gulf shores and the smokies"),
      m("priya", at(-2, 20, 10), "caption them, loser buys first round"),
      m("system", at(-2, 20, 12), "**Muse** conjured **Caption this** for this chat", { kind: "system" }),
      m("muse", at(-2, 20, 12), undefined, { kind: "muse", muse: { appId: "caption-contest", title: "Caption this", subtitle: "Made with Muse", toolId: "t-captions" } }),
      m("theo", at(-2, 20, 15), "the tent one is a hate crime"),
      m("maya", at(0, 9, 31), "where are we eating tonight"),
      m("dev", at(0, 9, 32), "thai basil or sushi ko"),
      m("priya", at(0, 9, 33), "or the taco truck on college ave, open til 11"),
      m("theo", at(0, 9, 33), "not pier pizza again, im so over it"),
      m("maya", at(0, 9, 34), "drinks after?"),
      m("jonah", at(0, 9, 34), "$3 wells at the dive or byob on the deck"),
      m("priya", at(0, 9, 35), "or $2 pbr at lucky's"),
      m("jonah", at(0, 9, 35), "not $14 cocktails, im broke"),
      m("dev", at(0, 9, 36), "leave at 9:45 or 10:15"),
      m("theo", at(0, 9, 36), "or 1am lol"),
      m("dev", at(0, 9, 37), "not 1am, im driving"),
      m("maya", at(0, 9, 37), "ok so which one"),
      m("theo", at(0, 9, 38), "idk anything works"),
      m("dev", at(0, 9, 38), "idk u pick"),
      m("priya", at(0, 9, 39), "no u pick"),
    ],
    unread: true,
    typing: [],
    seenBy: [],
    activeNow: false,
  };
}

/** Most chats keep the default theme, as most real chats do; two have one set. */
const THEMES: Record<string, ChatTheme> = { senior: "berry", boys: "dune" };
export const chatTheme = (chatId: string): ChatTheme => THEMES[chatId] ?? "default";

export const seedChats = (): Chat[] => [apt4b(), boys(), mayaDm(), seniorWeek(), priyaDm()].map((c) => ({ ...c, theme: chatTheme(c.id) }));

export const fmtEventDate = (ms: number) => {
  const d = new Date(ms);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const h = d.getHours();
  return `${day} at ${h % 12 === 0 ? 12 : h % 12}:${d.getMinutes().toString().padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export const seedEvents = (): EventInfo[] => [EVENT, potluckEvent(), partyEvent()]; // catalysts: Tsai Lin's potluck, a page Tsai Lin hosts

/** catalysts: the potluck from muse/seed.ts, the day after the concert at 6 PM. */
function potluckEvent(): EventInfo {
  const d = new Date(EVENT.start);
  d.setDate(d.getDate() + POTLUCK.daysFromConcert);
  d.setHours(POTLUCK.hour, 0, 0, 0);
  const { id, title, venue, address, host, interested, going, description, friends } = POTLUCK;
  return { id, title, start: d.getTime(), venue, address, host, interested, going, description, friends };
}

/** catalysts: a friend's 21st at Apt 4B, a page the viewer's apartment hosts (muse/seed.ts BDAY21). */
function partyEvent(): EventInfo {
  const d = new Date(EVENT.start);
  d.setDate(d.getDate() + BDAY21.daysFromConcert);
  d.setHours(BDAY21.hour, 0, 0, 0);
  const { id, venue, address, host, interested, going, description, friends } = BDAY21;
  return { id, title: `${PEOPLE.find((x) => x.id === "priya")!.first}'s 21st`, start: d.getTime(), venue, address, host, interested, going, description, friends };
}

export const seedTools = (chats: Chat[]): Tool[] => {
  const card = (chat: string, toolId: string) => chats.find((c) => c.id === chat)!.messages.find((x) => x.muse?.toolId === toolId)!.id;
  return [
    {
      id: "t-wheel",
      chat: "apt4b",
      appId: "chore-draft",
      name: "Chore draft",
      summary: "your pick",
      last: { by: "priya", did: "took Fridge", at: at(0, 9, 31) },
      needsMe: true,
      cardId: card("apt4b", "t-wheel"),
    },
    {
      id: "t-groceries",
      chat: "apt4b",
      appId: "grocery",
      name: "Groceries",
      summary: "Aditya is going",
      last: { by: "dev", did: "took the run", at: at(-1, 23, 52) },
      needsMe: false,
      cardId: card("apt4b", "t-groceries"),
    },
    {
      id: "t-utilities",
      chat: "apt4b",
      appId: "utilities-split",
      name: "October utilities",
      summary: "1 of 3 paid",
      last: { by: "dev", did: "agreed", at: at(-1, 21, 20) },
      needsMe: false,
      cardId: card("apt4b", "t-utilities"),
    },
    {
      id: "t-juniper",
      chat: "boys",
      appId: "concert",
      name: "Juniper Hale live",
      summary: "3 of 4 in",
      last: { by: "theo", did: "is in", at: at(0, 9, 27) },
      needsMe: true,
      cardId: card("boys", "t-juniper"),
    },
  ];
};

export const seedNotes = (): Note[] => [
  { id: "n-maya", by: "maya", text: "library till 8" },
  { id: "n-dev", by: "dev", text: "up before 9, send help" },
  { id: "n-theo", by: "theo", text: "made a tier list · rank", tool: { templateId: "bracket", title: "Late-night food tier list" } },
  { id: "n-priya", by: "priya", text: "need a charger" },
];
