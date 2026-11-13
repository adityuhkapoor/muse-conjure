// Posting from Home, the runtime half (the reading is compose.ts). The feed of new posts is one
// synced room, `t:feed-home`, folded by the trusted chat reducer: a post is a `msg`, a like a
// `react`. A post's tool is landed through store.landPiece in the chat keyed by the post
// (`surface:page:post:<id>`), with the same pre-made path as every catalyst, so everyone on Home
// sees the same live tool. The friends' likes and taps come from the cast (services/demo/posts.ts).
//
// With the fake store (no server), posts stay on this phone and previews are the placeholder card.

import { store } from "../store";
import { ME, type PersonId } from "../store/types";
import { liveConfig, wsUrl } from "../live/config";
import { openSocket, rid, type Socket } from "../live/socket";
import { openRoom, type Room } from "../live/rooms";
import { chatReducer, emptyChat, type ChatState } from "../live/chat-reducer";
import type { C2S, Entry, S2C } from "@muse/protocol";
import type { Transport, TransportHandlers } from "@muse/sync";
import { picker } from "../surfaces/flows.svelte";
import { nav } from "../lib/nav.svelte";
import { readDraft, type DraftCtx, type DraftRead, type Offer } from "./compose";

/** A new tool taking longer than this says so. */
export const SLOW_S = 40;
export const FEED_ROOM = "t:feed-home";
export const postKey = (id: string) => `surface:page:post:${id}`;
const EVERYONE: PersonId[] = [ME, "maya", "dev", "jonah", "priya", "theo"];

/** Lab tools a page served without the gateway treats as there (screenshots, checks). */
const FAKE_LAB = ["bracket-post", "feed-tier-list", "tier-list", "after-vote", "pregame-vote", "friends-plans", "squad-lock", "gift-pool", "move-out-sale", "move-in-day", "public-challenge", "gym", "daily-puzzle", "trip-story", "semester-wrapped", "wrapped", "hinge-rate", "setlist-bingo", "squad-constellation"];

export type HomePost = { id: string; by: PersonId; text: string; at: number; likes: PersonId[]; pending: boolean };

/** The viewer's wire id. */
const myWire = () => (store as unknown as { myId?: string }).myId ?? "noa";
const toView = (w: string) => (w === myWire() ? ME : w);

class Compose {
  /** the draft, kept while the composer is closed */
  text = $state("");
  /** the tool attached to the draft */
  attached = $state<Offer | null>(null);
  /** scenarios put away for this draft (the row's cross, "Post without") */
  dismissed = $state<string[]>([]);
  /** lab tool id -> its own name, from the gateway (null until heard) */
  #tools = $state<Record<string, string> | null>(null);
  #feed: Room<ChatState> | null = null;
  #feedState = $state.raw<{ state: ChatState; confirmed: ChatState }>({ state: emptyChat(), confirmed: emptyChat() });
  #local = $state<HomePost[]>([]);
  /** posts made on this phone, for the presenter log and the checks */
  made: { id: string; tool: string | null; at: number }[] = [];

  constructor() {
    (window as unknown as { __museCompose: unknown }).__museCompose = this;
    // The draft survives a reload (the demo restarting reloads the page), kept per viewer on this device.
    const key = `muse.draft.${myWire()}`;
    try {
      this.text = localStorage.getItem(key) ?? "";
    } catch {}
    $effect.root(() => {
      $effect(() => {
        const t = this.text;
        try {
          if (t.trim()) localStorage.setItem(key, t);
          else localStorage.removeItem(key);
        } catch {}
      });
    });
  }

  /** Opens the feed room once (live only), on a socket of its own. */
  connect() {
    if (this.#feed || !store.live || !liveConfig) return;
    const room = openRoom(openSocket(wsUrl()), FEED_ROOM, myWire(), chatReducer);
    this.#feed = room;
    void this.refreshTools(); // "Use for my group" on a friend's post reads it with the tools there now
    const update = () => (this.#feedState = { state: room.state, confirmed: room.confirmed });
    room.subscribe(update);
    update();
  }

  /** Asks the gateway which lab tools are there now (new ports land while the demo runs). */
  async refreshTools() {
    if (!store.live) {
      this.#tools ??= Object.fromEntries(FAKE_LAB.map((id) => [id, id]));
      return;
    }
    try {
      const r = await fetch(`${location.origin}/compose/tools`, { cache: "no-store" });
      const body = (await r.json()) as { tools: { id: string; name: string }[] };
      this.#tools = Object.fromEntries(body.tools.map((t) => [t.id, t.name]));
    } catch {
      this.#tools ??= {};
    }
  }

  get ready() {
    return this.#tools !== null;
  }

  ctx(): DraftCtx {
    const tools = this.#tools ?? {};
    const friends = EVERYONE.filter((p) => p !== ME).map((id) => ({ id, first: store.person(id)?.first ?? id }));
    return { me: store.me.first, friends, has: (t) => t.startsWith("lab:") && t.slice(4) in tools, nameOf: (id) => tools[id] };
  }

  /** What Muse reads in a draft, minus what was put away for this draft. */
  read(text: string): DraftRead | null {
    if (!this.#tools) return null;
    const r = readDraft(text, this.ctx());
    if (!r || this.dismissed.includes(r.scenario)) return null;
    return r;
  }

  /**
   * The model's reading of a post (the factory's post router through the gateway): `onpicks` with
   * the tools it chose (or nothing fits), then `onfilled` for each one filled for this post. Each
   * filled tool is an Offer from the model. Resolves when it is done, fails or is aborted;
   * `available` is false when no model is configured (replay) or the factory cannot be reached.
   */
  async route(text: string, o: { fill?: number; signal?: AbortSignal; onpicks?: (picks: { id: string; name: string; reason: string }[], nothingFits: boolean, reply: string) => void; onfilled?: (offer: Offer) => void; onunfilled?: (id: string) => void }): Promise<{ available: boolean; nothingFits: boolean; offers: Offer[] }> {
    const out = { available: false, nothingFits: false, offers: [] as Offer[] };
    if (!store.live || !text.trim()) return out;
    const friends = EVERYONE.filter((p) => p !== ME).map((id) => store.person(id)?.first ?? id);
    try {
      const r = await fetch(`${location.origin}/compose/route`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, me: store.me.first, friends, fill: o.fill ?? 3 }), ...(o.signal ? { signal: o.signal } : {}) });
      if (!r.body || !(r.headers.get("content-type") ?? "").includes("event-stream")) return out;
      out.available = true;
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(chunk)?.[1];
          const data = JSON.parse(/^data: (.*)$/m.exec(chunk)?.[1] ?? "{}");
          if (event === "picks") {
            out.nothingFits = !!data.nothingFits;
            o.onpicks?.(data.picks ?? [], out.nothingFits, String(data.reply ?? ""));
          } else if (event === "filled") {
            const c = data.candidate as { id: string; name: string; title: string; read: string; params: Record<string, unknown>; suggested: string[] };
            if (!this.ctx().has(`lab:${c.id}`)) continue;
            const lower = c.name[0]!.toLowerCase() + c.name.slice(1);
            const offer: Offer = { scenario: "compose-model", tool: `lab:${c.id}`, label: `Add ${/^[aeiou]/i.test(lower) ? "an" : "a"} ${lower}`, chip: `${c.name} instead`, title: c.title || c.name, read: c.read || "your post", params: c.params, source: "model", suggested: c.suggested ?? [] };
            out.offers.push(offer);
            o.onfilled?.(offer);
          } else if (event === "unfilled") o.onunfilled?.(data.id);
          else if (event === "error") break;
        }
      }
    } catch {
      // aborted or unreachable: whatever arrived stands
    }
    return out;
  }

  // ---------------------------------------------------------------- something new for this post

  /** A new tool being made for the draft, into the chat of the post it will become. */
  making = $state<Making | null>(null);
  #now = $state(Date.now());
  #clock: ReturnType<typeof setInterval> | null = null;

  /** Seconds since the new tool was asked for (ticks once a second while it is being made). */
  get makingSeconds(): number {
    return this.making ? Math.max(0, Math.round((this.#now - this.making.startedAt) / 1000)) : 0;
  }

  /** What is going on, in plain words: it says so when it is taking longer than usual. */
  get makingNote(): string {
    return this.makingSeconds < SLOW_S
      ? "Muse is conjuring a Mini for this post. Keep editing, or post now and it lands on your post."
      : "Still making it. This one is taking a few minutes. Keep editing your post; it lands on the post when it is ready.";
  }

  #tick(on: boolean) {
    if (on && !this.#clock) this.#clock = setInterval(() => (this.#now = Date.now()), 1000);
    if (!on && this.#clock) clearInterval(this.#clock), (this.#clock = null);
  }

  /** Starts making something new for this draft (minutes). Posting meanwhile keeps it: it lands on the post when ready. */
  async makeNew(text: string) {
    if (this.making && !this.making.error) return;
    const postId = rid("p-");
    this.attached = null;
    this.#now = Date.now();
    this.making = { postId, stage: "Reading your post", done: false, error: null, startedAt: Date.now() };
    this.#tick(true);
    const friends = EVERYONE.filter((p) => p !== ME).map((id) => store.person(id)?.first ?? id);
    const members = EVERYONE.map((id) => (id === ME ? myWire() : id));
    try {
      const r = await fetch(`${location.origin}/compose/new`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ postId, text, me: store.me.first, friends, viewer: myWire(), members }) });
      if (!r.body) throw new Error("no answer");
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(chunk)?.[1];
          const data = JSON.parse(/^data: (.*)$/m.exec(chunk)?.[1] ?? "{}");
          const m: Making | null = this.making;
          if (!m || m.postId !== postId) return;
          if (event === "stage") this.making = { ...m, stage: data.stage };
          else if (event === "done") this.making = { ...m, stage: "Ready", done: true };
          else if (event === "error") this.making = { ...m, error: data.message ?? "Muse couldn't make it" };
        }
      }
    } catch (e) {
      const m = this.making;
      if (m?.postId === postId && !m.done) this.making = { ...m, error: (e as Error).message };
    } finally {
      if (!this.making || this.making.done || this.making.error) this.#tick(false);
    }
  }

  cancelNew() {
    this.making = null;
    this.#tick(false);
  }

  dismiss(scenario: string) {
    if (!this.dismissed.includes(scenario)) this.dismissed = [...this.dismissed, scenario];
  }

  /** A fresh composer. */
  opened() {
    this.connect();
    void this.refreshTools();
  }

  // ---------------------------------------------------------------- posts

  /** New posts on Home, newest first. */
  get posts(): HomePost[] {
    if (!store.live) return [...this.#local].reverse();
    const { state, confirmed } = this.#feedState;
    const ok = new Set(confirmed.messages.map((m) => m.id));
    return state.messages
      .filter((m) => m.kind === "text" && m.text)
      .map((m) => ({ id: m.id, by: toView(m.from), text: m.text!, at: m.at, likes: m.reactions.flatMap((r) => r.by).map(toView), pending: !ok.has(m.id) }))
      .reverse();
  }

  like(id: string) {
    if (this.#feed) {
      this.#feed.dispatch({ t: "react", msg: id, emoji: "👍" });
      return;
    }
    this.#local = this.#local.map((p) => (p.id === id ? { ...p, likes: p.likes.includes(ME) ? p.likes.filter((x) => x !== ME) : [...p.likes, ME] } : p));
  }

  /** Posts the draft, with its tool when one is attached (or `offer`). Returns the post id. */
  post(offer: Offer | null = this.attached): string | null {
    const text = this.text.trim();
    if (!text) return null;
    // Something new is being made for this draft: the post takes the id its tool is being built for.
    const making = this.making && !this.making.error ? this.making : null;
    const id = making?.postId ?? rid("p-");
    if (making) offer = null;
    if (this.#feed) this.#feed.dispatch({ t: "msg", id, text });
    else this.#local = [...this.#local, { id, by: ME, text, at: Date.now(), likes: [], pending: false }];
    if (offer) this.#land(id, offer);
    this.made.push({ id, tool: offer?.tool ?? null, at: Date.now() });
    if (offer) this.#offers.set(id, offer);
    this.text = "";
    this.attached = null;
    this.making = null;
    this.dismissed = [];
    return id;
  }

  #land(postId: string, offer: Offer) {
    const leave = offer.leaveOut ?? [];
    store.landPiece({
      newChat: { key: postKey(postId), name: `${store.me.first}'s post`, members: EVERYONE.filter((p) => !leave.includes(p)) },
      piece: "",
      params: {},
      title: offer.title,
      ask: `muse ${offer.label.toLowerCase()} to my post`,
      templateId: "poll",
      summary: offer.read,
      premade: { scenario: offer.scenario, choices: [{ tool: offer.tool, params: offer.params }] },
      source: null,
    });
  }

  /** Tools posted from this phone, by post id, so "Use for my group" rebuilds the same one. */
  #offers = new Map<string, Offer>();

  /** The tool a post was made with, as far as this phone can tell (its own posts, or the patterns). */
  offerFor(post: HomePost, toolName: string): Offer | null {
    const own = this.#offers.get(post.id);
    if (own) return own;
    const r = readDraft(post.text, this.ctx());
    return r?.offers.find((o) => o.title === toolName) ?? null;
  }

  /** "Use for my group": the same tool, in a chat the viewer picks. */
  useForGroup(post: HomePost, toolName: string) {
    const offer = this.offerFor(post, toolName);
    if (offer) this.useInChat(offer, "a post on Home");
  }

  /**
   * The tool in one of the viewer's chats. Muse refills it from that chat's members and messages
   * (services/demo/reader.ts, from the empty skeleton) and the chat shows a building card at once.
   */
  useInChat(offer: Offer, from = "your draft") {
    picker.ask({
      title: "Choose a chat",
      sub: "Muse will fill it in from that chat's people and messages.",
      onpick: (chatId) => {
        const id = store.landPiece({
          chatId,
          piece: "",
          params: {},
          title: offer.title,
          ask: `muse ${offer.label.toLowerCase()} for my group`,
          templateId: "poll",
          summary: offer.read,
          premade: { scenario: offer.scenario, choices: [{ tool: offer.tool, params: offer.params }], refill: { idea: offer.title } },
          source: { surface: "Home", text: `**${store.me.first}** made this from ${from}` },
        });
        nav.openChat(id);
      },
    });
  }

  // ---------------------------------------------------------------- previews

  #built = new Map<string, Promise<string>>();

  /** Compiled code for an offer (live only), cached per filled tool. */
  build(offer: Offer): Promise<string> {
    const key = offer.tool + JSON.stringify(offer.params);
    let p = this.#built.get(key);
    if (!p) {
      // A build that never answers would leave its preview waiting for good: give up after 20 s.
      p = fetch(`${location.origin}/compose/build`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ choices: [{ tool: offer.tool, params: offer.params }] }), signal: AbortSignal.timeout(20_000) })
        .then((r) => r.json())
        .then((b: { code?: string; error?: string }) => {
          if (!b.code) throw new Error(b.error ?? "no code");
          return b.code;
        });
      p.catch(() => this.#built.delete(key));
      this.#built.set(key, p);
    }
    return p;
  }

  /** Members for a preview frame, with wire ids. */
  previewMembers() {
    return EVERYONE.map((id) => ({ id: id === ME ? myWire() : id, name: store.person(id)?.first ?? id }));
  }
  get me() {
    return myWire();
  }
}

type Making = { postId: string; stage: string; done: boolean; error: string | null; startedAt: number };

export const compose = new Compose();

/**
 * A socket that never leaves the phone, for previews: one room, its log in memory. The preview's
 * frame says hello, folds, and dispatches exactly as it would on the server, and nothing is stored.
 */
export function localSocket(user: string): Socket {
  const transport = (room: string): Transport => {
    let h: TransportHandlers | null = null;
    let client = "";
    const log: Entry[] = [];
    const deliver = (m: S2C) => queueMicrotask(() => h?.message(m));
    return {
      start(handlers) {
        h = handlers;
        queueMicrotask(() => h?.open());
      },
      send(m: C2S) {
        if (m.t === "hello") {
          client = m.client;
          deliver({ t: "welcome", room, epoch: "preview", head: log.length, entries: log.filter((e) => e.seq > m.have) });
        } else if (m.t === "act") {
          const entry: Entry = { seq: log.length + 1, client, cseq: m.cseq, user, time: Date.now(), seed: (Math.random() * 2 ** 32) >>> 0, action: m.action };
          log.push(entry);
          deliver({ t: "entry", room, entry });
        }
      },
      stop() {
        h = null;
      },
    };
  };
  return { transport, open: true, close() {} } as Socket;
}
