// The Muse moments on the Facebook surfaces. Each rides on something the person already did
// (tapped "Use for my group", saved a second couch, shared a reel, ended a story poll) and lands
// as a live tool in a chat through store.landPiece: the same building card as a chat ask, and the
// same store, so everyone else in that chat sees it.

import { store } from "../store";
import { ME, type Chat, type Message, type Person } from "../store/types";
import { nav } from "../lib/nav.svelte";
import { names } from "../lib/format";
import { fb } from "./fbnav.svelte";
import { GROUPS, LISTINGS, STRANGERS, SUBLET_ITEMS, money, type Game, type Listing, type Reel } from "./data";
import { SOURCE_PREFIX, type LandSpec, type SurfaceName } from "./types";
import { MOMENTS } from "./moments";
import { EASTFIELD_MAP } from "../muse/seed";
import { castWithViewerFirst } from "../store/cast";
import { viewerId } from "../lib/media";

/** Anyone on a surface: the cast first, then strangers who post in groups and on Marketplace. */
export function who(id: string): Person | undefined {
  return store.person(id) ?? STRANGERS.find((p) => p.id === id);
}

const me = () => store.me.first;

/** The first names of a chat's members, the viewer first (the people a split or a vote is between). */
const firstsIn = (chatId: string) => [ME, ...(store.chat(chatId)?.members ?? []).filter((m) => m !== ME)].map((m) => who(m)?.first).filter((x): x is string => !!x);

/** Who brings it home: Aditya has the car, when he is in the chat. */
function pickupIn(chatId: string): string {
  if (viewerId() === "dev") return "Sun · your hatchback";
  if (store.chat(chatId)?.members.includes("dev")) return `Sun · ${who("dev")?.first}'s hatchback`;
  return "Sun · pickup";
}

// ---------------------------------------------------------------- the chat picker

export type Pick = {
  title: string;
  sub: string;
  /** chats offered first (the likely one) */
  prefer?: string[];
  onpick: (chatId: string) => void;
};

class Picker {
  open = $state<Pick | null>(null);
  ask(p: Pick) {
    this.open = p;
  }
  close() {
    this.open = null;
  }
}
export const picker = new Picker();

/** Group chats, the preferred ones first. */
export function groupChats(prefer: string[] = []): Chat[] {
  const groups = store.chats.filter((c) => c.kind === "group");
  return [...groups.filter((c) => prefer.includes(c.id)), ...groups.filter((c) => !prefer.includes(c.id))];
}

/** Lands the tool and opens the chat, where the building card is already showing. */
function landInChat(spec: LandSpec) {
  const chatId = store.landPiece(spec);
  nav.openChat(chatId);
  return chatId;
}

// ---------------------------------------------------------------- Home

/** A friend's tool post: "Use for my group" rebuilds it for the chosen chat's members. */
export function useForGroup(post: { by: string; piece: string; params: Record<string, unknown>; templateId: string; summary: string; headline: string; lab?: boolean }) {
  const title = String(post.params.title ?? "Mini");
  picker.ask({
    title: "Choose a chat",
    sub: `Muse will make ${title.toLowerCase()} for the people in it.`,
    onpick: (chatId) =>
      landInChat({
        chatId,
        piece: post.lab ? "" : post.piece,
        params: post.lab ? {} : post.params,
        title,
        ask: `muse make a ${title.toLowerCase()} like ${who(post.by)?.first}'s`,
        templateId: post.templateId,
        summary: post.summary,
        // a lab tool is refilled from the chosen chat, starting empty (services/demo/reader.ts)
        ...(post.lab ? { premade: { scenario: "use-for-group", choices: [{ tool: `lab:${post.piece}`, params: post.params }], refill: { idea: title } } } : {}),
        source: { surface: "Home", text: `**${me()}** got this from **${who(post.by)?.first}**'s post` },
      }),
  });
}

// ---------------------------------------------------------------- Groups

/** The sublet group: the posts a new post would repeat, as a pinned finder the whole group shares. */
export function openFinder(groupId: string) {
  const g = GROUPS.find((x) => x.id === groupId);
  if (!g?.match) return;
  store.landPiece({
    newChat: { key: g.backingKey, name: g.name, members: castWithViewerFirst() },
    ...MOMENTS.groupFinder,
    // lab sublet-finder (MOMENTS.groupFinder): the group's sublet posts on its map, budgets from them
    params: { group: g.name, posts: SUBLET_ITEMS.length, swiped: 3, budgets: [80000, 100000, 125000], listings: SUBLET_ITEMS.map((x, i) => ({ hood: x.title, city: "Eastfield", priceCents: x.cents, dates: x.detail.split(" · ")[0] ?? "", perk: x.detail.split(" · ")[1] ?? "", via: "", viaWho: "", mutuals: i % 3, view: i % 5, x: 0.15 + ((i * 0.23) % 0.7), y: 0.15 + ((i * 0.31) % 0.7) })), people: [{ name: "Maya", saved: [SUBLET_ITEMS[0]?.title ?? ""], passed: [] }], labels: EASTFIELD_MAP },
    title: g.match.title,
    ask: "muse make a shortlist of the sublets that match",
    summary: `${SUBLET_ITEMS.length} places · save or skip`,
    source: null,
  });
}

// ---------------------------------------------------------------- Marketplace

class Saved {
  ids = $state<string[]>([]);
  toggle(id: string) {
    this.ids = this.ids.includes(id) ? this.ids.filter((x) => x !== id) : [...this.ids, id];
  }
  has(id: string) {
    return this.ids.includes(id);
  }
  /** saved listings of the same kind as this one, this one included if saved */
  sameKind(l: Listing): Listing[] {
    return LISTINGS.filter((x) => x.kind === l.kind && this.ids.includes(x.id));
  }
}
export const saved = new Saved();

/** A listing as a shortlist candidate. */
const candidate = (l: Listing) => ({ title: l.title, cents: l.price * 100, detail: `${l.condition} · ${l.where} · ${who(l.seller)?.first ?? ""}`.replace(/ · $/, "") });

/** The listings to decide between: what they saved of this kind, else this one and the nearest of its kind. */
export function shortlistFor(l: Listing): Listing[] {
  const mine = saved.sameKind(l);
  const base = mine.some((x) => x.id === l.id) ? mine : [l, ...mine];
  if (base.length >= 2) return base;
  return [l, ...LISTINGS.filter((x) => x.kind === l.kind && x.id !== l.id)].slice(0, 3);
}

export function decideWithRoommates(l: Listing) {
  const list = shortlistFor(l);
  const title = `Which ${l.kind}?`;
  picker.ask({
    title: "Decide with roommates",
    sub: `Muse will make a shortlist of ${list.length} ${l.kinds} for the chat.`,
    prefer: ["apt4b"],
    onpick: (chatId) =>
      landInChat({
        chatId,
        ...MOMENTS.marketplaceDecide,
        // lab group-buy (MOMENTS.marketplaceDecide): the saved listings, and a first vote from me
        params: { title: `${l.kind[0]!.toUpperCase()}${l.kind.slice(1)} hunt · ${store.chat(chatId)?.name ?? "the chat"}`, listings: list.map((x) => ({ name: x.title.slice(0, 24), priceCents: x.price * 100, where: x.where, style: /sectional/i.test(x.title) ? "sectional" : /velvet/i.test(x.title) ? "velvet" : "other", color: "mustard", quote: "" })), votes: [{ name: me(), listing: 0 }], wins: 3, pickup: pickupIn(chatId) },
        title,
        ask: `muse make a shortlist of the ${l.kinds} to decide which to get`,
        summary: `${list.length} ${l.kinds} · save or skip`,
        source: { surface: "Marketplace", text: `**${me()}** shared ${list.length} ${l.kinds} from **Marketplace**` },
      }),
  });
}

export function splitIt(l: Listing) {
  const title = `${l.title} split`.slice(0, 60);
  picker.ask({
    title: "Split it",
    sub: `Muse will split ${money(l.price)} across the chat.`,
    prefer: ["apt4b"],
    onpick: (chatId) =>
      landInChat({
        chatId,
        ...MOMENTS.marketplaceSplit,
        // lab split-purchase (MOMENTS.marketplaceSplit)
        params: { title: `Split the ${l.title.toLowerCase()}`.slice(0, 40), item: l.title, priceCents: l.price * 100, seller: `from ${who(l.seller)?.first ?? "the seller"} · ${l.where}`, owners: firstsIn(chatId), weeks: [], holders: [], pickup: pickupIn(chatId), note: "" },
        title,
        ask: `muse split ${money(l.price)} for the ${l.title.toLowerCase()}`,
        summary: "add what you paid",
        source: { surface: "Marketplace", text: `**${me()}** shared a listing from **Marketplace**: ${l.title}, ${money(l.price)}` },
      }),
  });
}

/** Sends a listing to a chat as a link, like Share does. */
export function sendListing(chatId: string, l: Listing) {
  store.sendLink(chatId, { site: `Marketplace · ${l.where}`, title: `${money(l.price)} · ${l.title}`, description: l.condition, shared: { kind: "listing", id: l.id } });
  const name = store.chat(chatId)?.name ?? "chat";
  fb.say(`Sent to ${name}`, { label: "View", run: () => nav.openChat(chatId) });
}

// ---------------------------------------------------------------- Reels

export function sendReel(chatId: string, r: Reel) {
  store.sendLink(chatId, { site: `Reel · ${r.handle}`, title: r.caption, description: "Reels", shared: { kind: "reel", id: r.id } });
  const name = store.chat(chatId)?.name ?? "chat";
  fb.say(`Sent to ${name}`, { label: "View", run: () => nav.openChat(chatId) });
}

export const TRY_TITLE = "To try";
export const addedId = (msgId: string) => `tt-${msgId}`;
/** The source line of a to-try list made from this reel message. */
export const madeId = (msgId: string) => `${SOURCE_PREFIX}reels-tt-${msgId}`;

/** The chat's to-try list, if it has one. */
export function tryList(chatId: string) {
  return store.toolsFor(chatId).find((t) => t.name === TRY_TITLE);
}

/** Under a shared reel: adds its places to the chat's to-try list, making the list the first time. */
export function addToTry(chatId: string, msg: Message, r: Reel) {
  const list = tryList(chatId);
  const places = r.places;
  const what = places.length === 1 ? places[0]! : `${places.length} places`;
  if (list) {
    store.sendSystem(chatId, addedId(msg.id), `**${me()}** added ${what} to **${TRY_TITLE}**`);
    for (const label of places) store.toolAct(list.id, { t: "add", label }, { summary: `${places.length} more places · vote` });
    nav.focusTool(list.id);
    return;
  }
  store.landPiece({
    chatId,
    ...MOMENTS.reelToTry,
    // lab reel-to-try (MOMENTS.reelToTry): this reel's first place is its own row (tap Add), the rest are wanted by me; later reels add theirs with { t: "add", label }
    params: {
      reel: { from: me(), note: "", account: r.handle, caption: r.caption, likes: `${Math.round(r.likes / 1000)}K`, place: places[0] ?? "", area: "" },
      spots: places.slice(1).map((name) => ({ name, area: "", tried: "", ratings: [], want: [me()] })),
      compact: true, // a chat holds 420 px
    },
    title: TRY_TITLE,
    ask: `muse make a to-try list with ${names(places)}`,
    summary: `${places.length} ${places.length === 1 ? "place" : "places"} · vote`,
    source: { surface: "Reels", id: madeId(msg.id), text: `**${me()}** added ${what} to **${TRY_TITLE}**` },
  });
}

// ---------------------------------------------------------------- Gaming

export function playWithGroup(g: Game) {
  picker.ask({
    title: "Play with a group",
    sub: `Muse will start ${g.title.toLowerCase()} in the chat.`,
    onpick: (chatId) =>
      landInChat({
        chatId,
        piece: g.piece,
        params: g.params,
        title: g.title,
        ask: `muse start ${g.title.toLowerCase()}`,
        templateId: g.templateId,
        summary: g.summary,
        source: { surface: "Gaming", text: `**${me()}** started a game from **Gaming**` },
      }),
  });
}

// ---------------------------------------------------------------- needs you

export type Waiting = { toolId: string; chatId: string; chat: string; name: string; summary: string; surface: SurfaceName; at: number };

const SURFACES: SurfaceName[] = ["Home", "Groups", "Marketplace", "Reels", "Stories", "Gaming", "Events"]; // Events: catalysts

/** Tools made from a surface, waiting on me: the card right after a `src-` line, needing me. */
export function waitingOnMe(): Waiting[] {
  const out: Waiting[] = [];
  for (const chat of store.chats) {
    const msgs = chat.messages.filter((m) => m.kind !== "activity");
    msgs.forEach((m, i) => {
      const prev = msgs[i - 1];
      if (m.kind !== "muse" || !m.muse?.toolId || !prev?.id.startsWith(SOURCE_PREFIX)) return;
      const tool = store.tool(m.muse.toolId);
      if (!tool?.needsMe || tool.last?.by === ME) return;
      const key = prev.id.slice(SOURCE_PREFIX.length).split("-")[0] ?? "";
      const surface = SURFACES.find((s) => s.toLowerCase() === key) ?? "Home";
      out.push({ toolId: tool.id, chatId: chat.id, chat: chat.name, name: tool.name, summary: tool.summary, surface, at: tool.last?.at ?? m.at });
    });
  }
  return out.sort((a, b) => b.at - a.at);
}
