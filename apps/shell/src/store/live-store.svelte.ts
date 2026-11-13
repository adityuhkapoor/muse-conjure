import type { ChatStore, MountedTool } from "./chat-store";
import { chatTheme, EVENT, MUSE, seedEvents, seedNotes } from "./fake-data";
import { isMention, labChips, labItem, LAB_FOR_PLAIN, LAB_MENU, template } from "../lib/muse";
import type { Chat, ChatSpec, EventInfo, Message, Note, Person, PersonId, Rsvp, Suggestion, Tool } from "./types";
import { ME } from "./types";
import { EXTRA_PEOPLE } from "./extras";
import { looksStuck } from "../lib/muse";
import {
  chatIdForKey,
  chatReducer,
  chatRoom,
  FAILED_TEXT,
  INDEX_ROOM,
  indexReducer,
  roomOfTool,
  toolRoom,
  type ChatAction,
  type ChatState,
  type IndexState,
  type WireMsg,
} from "../live/chat-reducer";
import { CAST, frameUrls, generateUrl, liveConfig, reloadOnRestart, wireId, wsUrl } from "../live/config";
import { BuildError, generate, LINES, type GenerateBody } from "../live/factory";
import { initFrames, mountTool, type Mounted } from "../live/frames";
import { openRoom, type Room } from "../live/rooms";
import { openSocket, rid, type Socket } from "../live/socket";
import { toolAvatar, whenPhotosReady } from "../lib/tool-avatar";
// surfaces (src/surfaces)
import { isSurfaceKey } from "../surfaces/backing";
import type { ContextWire, PremadeWire } from "../muse/types"; // catalysts
import { SOURCE_PREFIX, type LandSpec, type SurfaceTool } from "../surfaces/types";

const SYSTEM: Person = { id: "system", name: "System", first: "System", initials: "", tone: 1, active: false };

/** How long a typing or presence signal counts without a refresh. */
const TYPING_MS = 4500;
const HERE_MS = 9000;
const HEARTBEAT_MS = 3000;
/** A building card with no word from its builder for this long is called failed by anyone. */
const STALE_BUILD_MS = 45_000;
const STALE_CHANGE_MS = 120_000;

const STAGES: Record<string, string> = {
  queued: "Waiting for a turn",
  understanding: "Reading the chat",
  routed: "Choosing a starting point",
  drafting: "Writing it",
  checking: "Checking it",
  repairing: "Fixing a problem",
  ready: "Almost there",
};
const NEW_STAGE = "This one is new. About a minute";

/** Which chat a friend's tool note lives in (seeded by services/demo). */
const NOTE_CHATS: Record<string, { chat: string; tool: string }> = { "n-theo": { chat: "latenight", tool: "t-bracket" } };

/** Templates the shell can fill straight from the library, with no model call. */
const PIECE_FOR: Record<string, { piece: string; params: (title: string) => Record<string, unknown> }> = {
  bracket: { piece: "bracket", params: (title) => ({ title }) },
  "whos-in": { piece: "lock", params: (title) => ({ title, detail: "", need: 0 }) },
  poll: { piece: "poll", params: (title) => ({ title, options: [], multi: false, allowAdd: true }) },
};

/** Made from the menu rather than from the conversation: the piece starts empty and asks the chat. */
const BLANK_PIECE: Record<string, { piece: string; params: (title: string) => Record<string, unknown> }> = {
  "pick-for-us": { piece: "wheel", params: (title) => ({ title, options: [], noRepeat: false }) },
  "chore-wheel": { piece: "assign", params: (title) => ({ title, tasks: [] }) },
};

type Live = { state: ChatState; confirmed: ChatState };

/**
 * ChatStore backed by the server. Each chat is a `@muse/sync` replica of room `t:<id>` folding
 * the trusted chat reducer; `t:index` lists the chats. On the wire people have real ids (noa,
 * maya...); to components the viewer is always "me", so no component changes for live mode.
 */
export class LiveStore implements ChatStore {
  readonly live = true;
  readonly myId: string;
  #socket!: Socket;
  #index!: Room<IndexState>;
  #rooms = new Map<string, Room<ChatState>>();
  /** mounted frames by tool id */
  #mounted = new Map<string, Mounted>();

  #indexState = $state.raw<IndexState>({ chats: [], seeded: false });
  #chatStates = $state.raw<Record<string, Live>>({});
  #typing = $state.raw<Record<string, Record<string, number>>>({});
  #here = $state.raw<Record<string, number>>({});
  /** tool id -> latest building stage heard (eph) and when */
  #building = $state.raw<Record<string, { stage: string; at: number }>>({});
  #tick = $state(Date.now());
  #dismissed = $state<string[]>([]);
  #rsvp = $state<Record<string, Rsvp | null>>({});
  #inflight = new Set<string>();
  #typingSent: Record<string, number> = {};
  #summaryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  #orphansChecked = new Set<string>();

  readonly #people: Map<string, Person>;

  constructor(myId: string) {
    this.myId = myId;
    this.#people = new Map([...CAST, ...EXTRA_PEOPLE].map((p) => [p.id, p]));
    try {
      this.#rsvp = JSON.parse(localStorage.getItem(`muse.rsvp.${myId}`) ?? "{}");
    } catch {}
  }

  /** Connects, waits for the directory and every chat (or a timeout), then resolves. */
  async start(): Promise<void> {
    initFrames(frameUrls(liveConfig!), liveConfig!.start);
    this.#socket = openSocket(wsUrl());
    reloadOnRestart(liveConfig!, this.#socket);
    // Phones drop sockets in the background; the shared socket retries with backoff on its own.
    this.#index = openRoom(this.#socket, INDEX_ROOM, this.myId, indexReducer, (user, key) => {
      if (key === "here") this.#here = { ...this.#here, [user]: Date.now() };
    });
    this.#index.subscribe((s) => {
      this.#indexState = s;
      for (const c of s.chats) this.#open(c.id);
    });
    setInterval(() => this.#heartbeat(), HEARTBEAT_MS);
    setInterval(() => (this.#tick = Date.now()), 1000);
    await until(() => this.#index.live, 5000);
    await until(() => [...this.#rooms.values()].every((r) => r.live), 4000);
    this.#heartbeat();
    (window as unknown as { __museLive: unknown }).__museLive = this;
  }

  #open(chatId: string): Room<ChatState> {
    let r = this.#rooms.get(chatId);
    if (r) return r;
    r = openRoom(this.#socket, chatRoom(chatId), this.myId, chatReducer, (user, key, value) => this.#onEph(chatId, user, key, value));
    this.#rooms.set(chatId, r);
    const room = r;
    const update = () => {
      this.#chatStates = { ...this.#chatStates, [chatId]: { state: room.state, confirmed: room.confirmed } };
      if (room.live && !this.#orphansChecked.has(chatId)) {
        this.#orphansChecked.add(chatId);
        this.#failOrphans(chatId);
      }
    };
    r.subscribe(update);
    update();
    // `subscribe` fires on change only; catch the first welcome of an empty or unchanged room too.
    until(() => room.live, 10_000).then(update);
    return r;
  }

  #onEph(chatId: string, user: string, key: string, value: unknown) {
    // My own typing on another tab is not news; my own build on another tab is (it keeps it alive).
    if (key === "typing") {
      if (user === this.myId) return;
      const cur = { ...(this.#typing[chatId] ?? {}) };
      if (value) cur[user] = Date.now() + TYPING_MS;
      else delete cur[user];
      this.#typing = { ...this.#typing, [chatId]: cur };
    } else if (key === "building" && value && typeof value === "object") {
      const v = value as { id?: string; stage?: string };
      if (typeof v.id === "string") this.#building = { ...this.#building, [v.id]: { stage: String(v.stage ?? ""), at: Date.now() } };
    }
  }

  #heartbeat() {
    if (!this.#index?.live) return;
    this.#index.eph("here", 1);
    for (const id of this.#inflight) {
      const chatId = this.#chatOfPending(id);
      const stage = this.#building[id]?.stage ?? "";
      if (chatId) this.#rooms.get(chatId)?.eph("building", { id, stage });
    }
    this.#failStale();
  }

  // --- identity mapping -------------------------------------------------------------------

  /** wire id -> the id components see */
  #v = (w: string) => (w === this.myId ? ME : w);
  /** component id -> wire id */
  #w = (v: string) => (v === ME ? this.myId : v);

  get me(): Person {
    return this.person(ME)!;
  }

  person(id: PersonId): Person | undefined {
    if (id === "muse") return MUSE;
    if (id === "system") return SYSTEM;
    const wire = this.#w(id);
    const p = this.#people.get(wire);
    if (!p) return undefined;
    void this.#tick;
    const active = wire === this.myId || Date.now() - (this.#here[wire] ?? 0) < HERE_MS;
    return { ...p, id: id === ME ? ME : p.id, active };
  }

  now(): number {
    return Date.now();
  }

  // --- chats ------------------------------------------------------------------------------

  #views = $derived.by(() => {
    const out: Chat[] = [];
    void this.#tick;
    for (const entry of this.#indexState.chats) {
      const live = this.#chatStates[entry.id];
      if (!live || !live.state.created || !live.state.members.includes(this.myId)) continue;
      if (isSurfaceKey(live.state.key)) continue; // surfaces: a chat behind a post or group, not a Messenger chat
      out.push(this.#toChat(entry.id, live));
    }
    return out;
  });

  #toolViews = $derived.by(() => {
    const out: Tool[] = [];
    for (const c of this.#views) {
      const st = this.#chatStates[c.id]!.state;
      const myRead = st.reads[this.myId]?.at ?? 0;
      for (const m of st.messages) {
        if (m.kind !== "muse" || !m.tool?.code) continue;
        const live = st.tools[m.tool.id];
        const last = live?.last ?? null;
        out.push({
          id: m.tool.id,
          chat: c.id,
          appId: "live",
          name: m.tool.name,
          summary: stripName(live?.summary ?? "", m.tool.name),
          last: last ? { by: this.#v(last.by), did: last.at === m.at ? "made it" : "used it", at: last.at } : null,
          needsMe: !!last && last.by !== this.myId && last.at > myRead,
          cardId: m.id,
        });
      }
    }
    return out;
  });

  #toChat(id: string, live: Live): Chat {
    const st = live.state;
    const confirmedIds = new Set(live.confirmed.messages.map((m) => m.id));
    const messages: Message[] = st.messages.map((m) => this.#toMessage(m, !confirmedIds.has(m.id)))
      .map((m) => (m.kind === "system" && m.id.startsWith("sent-") ? { ...m, kind: "activity" as const, activity: { toolId: m.id.slice(5) } } : m));
    // Tappable activity lines: one per action in the tool's log (the reducer already folded a
    // person's quick repeats into one line), in plain words from the tool's own summary.
    for (const m of st.messages) {
      const t = m.tool;
      if (!t?.code) continue;
      for (const e of st.tools[t.id]?.log ?? []) {
        const first = this.#people.get(e.by)?.first ?? "Someone";
        const text = activityLine(e.text, t.name, first, e.by === this.myId);
        const act: Message = { id: `act-${t.id}-${e.at}-${e.by}`, from: "system", kind: "activity", text, at: e.at, reactions: [], activity: { toolId: t.id } };
        const i = messages.findIndex((x) => x.at > e.at);
        messages.splice(i < 0 ? messages.length : i, 0, act);
      }
    }
    const members = st.members.map(this.#v);
    const others = st.members.filter((m) => m !== this.myId);
    const lastReal = [...st.messages].reverse().find((m) => m.kind !== "system");
    const myRead = st.reads[this.myId]?.msg;
    const idx = (mid: string | undefined) => (mid ? st.messages.findIndex((m) => m.id === mid) : -1);
    const unread = !!lastReal && lastReal.from !== this.myId && idx(myRead) < idx(lastReal.id);
    const lastMine = [...st.messages].reverse().find((m) => m.from === this.myId);
    const seenBy =
      lastReal && lastReal.from === this.myId && lastMine
        ? others.filter((o) => idx(st.reads[o]?.msg) >= idx(lastMine.id)).map(this.#v)
        : [];
    const now = Date.now();
    const typing = Object.entries(this.#typing[id] ?? {})
      .filter(([u, until]) => until > now && st.members.includes(u))
      .map(([u]) => this.#v(u));
    const name = st.kind === "dm" ? (this.#people.get(others[0] ?? "")?.name ?? st.name) : st.name;
    const activeNow = st.kind === "dm" && !!others[0] && now - (this.#here[others[0]] ?? 0) < HERE_MS;
    return { id, name, kind: st.kind, members, messages, unread, typing, seenBy, activeNow, theme: chatTheme(id), ...(st.key ? { key: st.key } : {}) };
  }

  #toMessage(m: WireMsg, pending: boolean): Message {
    const base: Message = { id: m.id, from: m.from === "muse" || m.from === "system" ? m.from : this.#v(m.from), kind: m.kind, at: m.at, reactions: m.reactions.map((r) => ({ emoji: r.emoji, by: r.by.map(this.#v) })) };
    if (m.text !== undefined) base.text = m.text;
    if (m.replyTo) base.replyTo = m.replyTo;
    if (m.photo) base.photo = m.photo;
    if (m.link) base.link = m.link;
    if (m.chip) base.chip = m.chip;
    if (pending && m.from === this.myId) base.pending = true;
    if (m.tool) {
      const t = m.tool;
      const stage = this.#building[t.id]?.stage;
      base.muse = t.building
        ? { appId: "live", title: t.name, subtitle: stage || "Made with Muse", building: true }
        : { appId: "live", title: t.name, subtitle: "Made with Muse", toolId: t.id, live: true, rev: t.rev ?? 0, ...(t.changing ? { changing: true } : {}) };
    }
    return base;
  }

  get chats(): readonly Chat[] {
    return [...this.#views].sort((a, b) => lastAt(b) - lastAt(a));
  }

  chat(id: string): Chat | undefined {
    return this.#views.find((c) => c.id === id);
  }

  #room(chatId: string): Room<ChatState> | undefined {
    return this.#rooms.get(chatId);
  }

  #dispatch(chatId: string, a: ChatAction) {
    this.#room(chatId)?.dispatch(a);
  }

  send(chatId: string, text: string, opts: { changeTool?: string } = {}): void {
    const body = text.trim();
    if (!body || !this.#room(chatId)) return;
    const all = this.#chatStates[chatId]?.state.messages ?? [];
    const target = opts.changeTool ? all.find((m) => m.tool?.id === opts.changeTool && !!m.tool?.code) : undefined;
    this.#dispatch(chatId, { t: "msg", id: rid("m-"), text: body, ...(target ? { replyTo: target.id } : {}) });
    this.setTyping(chatId, false);
    // a change for a tool that is still being built: say so in one line instead of nothing
    if (opts.changeTool && !target && all.some((m) => m.tool?.id === opts.changeTool && m.tool?.building)) return void this.#dispatch(chatId, { t: "msg", id: rid("m-"), kind: "system", text: "Still conjuring that one. Try again in a moment" });
    if (target) return void this.#change(chatId, body, target.tool!.id);
    if (!isMention(body)) return;
    // A "muse ..." in a chat that has a tool may be about that tool: Muse decides, else builds anew.
    const st = this.#chatStates[chatId]?.state;
    // a second ask while Muse is still making the first waits its turn, then goes through the same way
    if (st?.messages.some((m) => m.tool?.building)) {
      void until(() => !this.#chatStates[chatId]?.state.messages.some((m) => m.tool?.building), 120_000)
        .then(() => this.#ask(chatId, body))
        .catch(() => this.#dispatch(chatId, { t: "msg", id: rid("m-"), kind: "system", text: LINES.busy }));
      return;
    }
    this.#ask(chatId, body);
  }

  /** A typed "muse ..." with no Mini being made: maybe a change to the chat's Mini, else a new one. */
  #ask(chatId: string, body: string) {
    const st = this.#chatStates[chatId]?.state;
    const recent = st?.messages.slice(-30).some((m) => m.kind === "muse" && m.tool?.code && !m.tool.building);
    if (!recent) return void this.#build(chatId, { ask: body, title: titleFromAsk(body) });
    // the building card shows at once; if Muse decides the ask is a change to the tool, the card becomes one line
    this.#build(chatId, { ask: body, title: titleFromAsk(body), decide: this.#change(chatId, body, null) });
  }

  /** Ask Muse to change a tool in place (services/demo/change.ts). False when the ask is not about a tool. */
  async #change(chatId: string, ask: string, toolId: string | null): Promise<boolean> {
    try {
      const res = await fetch(generateUrl().replace(/\/generate$/, "/change"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        // tz: minutes east of UTC here, so a code change that names a clock time ("noon") means this one
        body: JSON.stringify({ chatId, ask, explicit: !!toolId, as: this.myId, tz: -new Date().getTimezoneOffset(), ...(toolId ? { toolId } : {}), ...(liveConfig?.model ? { model: liveConfig.model } : {}) }),
      });
      if (!res.ok) throw new Error(`change answered ${res.status}`);
      const r = (await res.json()) as { t?: unknown };
      if (typeof r?.t !== "string") throw new Error("change answered with something unreadable");
      if (r.t === "error" && toolId) return this.#changeFailed(chatId, toolId), true;
      return r.t === "changing" || (!!toolId && r.t !== "new");
    } catch (e) {
      console.warn("change failed", e);
      // an explicit change to a Mini: one line in the chat and the "changing" marker off; an open ask just goes on to a build
      if (toolId) this.#changeFailed(chatId, toolId);
      return !!toolId;
    }
  }

  /** The person asked to change a Mini and it did not happen: one line, and the card stops saying it is changing. */
  #changeFailed(chatId: string, toolId: string) {
    this.#dispatch(chatId, { t: "msg", id: rid("m-"), kind: "system", text: LINES.change_failed });
    if (this.#chatStates[chatId]?.state.messages.some((m) => m.tool?.id === toolId && m.tool.changing)) this.#dispatch(chatId, { t: "tool-change-end", id: toolId });
  }

  react(chatId: string, messageId: string, emoji: string): void {
    this.#dispatch(chatId, { t: "react", msg: messageId, emoji });
  }

  reactOnce(chatId: string, messageId: string, emoji: string): void {
    this.#dispatch(chatId, { t: "react", msg: messageId, emoji, once: true });
  }

  markRead(chatId: string): void {
    const live = this.#chatStates[chatId];
    if (!live) return;
    const st = live.state;
    const last = [...st.messages].reverse().find((m) => m.kind !== "system");
    if (!last || st.reads[this.myId]?.msg === last.id) return;
    // Read receipts only for what the server has; a pending id would be dropped by the reducer.
    if (!live.confirmed.messages.some((m) => m.id === last.id)) return;
    this.#dispatch(chatId, { t: "read", msg: last.id });
  }

  setTyping(chatId: string, typing: boolean): void {
    const r = this.#room(chatId);
    if (!r) return;
    const now = Date.now();
    const sent = this.#typingSent[chatId] ?? 0;
    if (typing && now - sent < 2000) return;
    if (!typing && !sent) return;
    this.#typingSent[chatId] = typing ? now : 0;
    r.eph("typing", typing);
  }

  // --- tools ------------------------------------------------------------------------------

  get tools(): readonly Tool[] {
    return [...this.#toolViews].sort((a, b) => Number(b.needsMe) - Number(a.needsMe) || (b.last?.at ?? 0) - (a.last?.at ?? 0));
  }
  tool(id: string): Tool | undefined {
    return this.#toolViews.find((t) => t.id === id);
  }
  toolsFor(chatId: string): readonly Tool[] {
    return this.tools.filter((t) => t.chat === chatId);
  }
  /** The tool menu: lab tools only. The plain templates stay behind for events and notes, never shown. */
  get templates() {
    return LAB_MENU;
  }
  template(id: string) {
    return labItem(id) ?? labItem(LAB_FOR_PLAIN[id] ?? "") ?? template(id);
  }
  get notes(): readonly Note[] {
    return seedNotes()
      .filter((n) => wireId(n.by) !== this.myId)
      .map((n) => ({ ...n, by: this.#v(wireId(n.by)) }));
  }

  suggestion(chatId: string): Suggestion | null {
    const chat = this.chat(chatId);
    if (!chat || this.#dismissed.includes(chatId) || !looksStuck(chat.messages)) return null;
    if (chat.messages.some((m) => m.kind === "muse")) return null;
    const first = LAB_MENU[0]!;
    return { chatId, templateId: first.id, label: first.name };
  }
  suggestions(chatId: string): Suggestion[] {
    const chat = this.chat(chatId);
    if (!chat || this.#dismissed.includes(chatId)) return [];
    return labChips(chat.messages).map((t) => ({ chatId, templateId: t.id, label: t.name }));
  }
  dismissSuggestion(chatId: string): void {
    if (!this.#dismissed.includes(chatId)) this.#dismissed.push(chatId);
  }

  buildTool(chatId: string, templateId: string, opts: { title?: string; blank?: boolean; lab?: boolean } = {}): void {
    // a chip Muse offered names any lab Mini by id, not only the menu's
    const lab = labItem(templateId) ?? (opts.lab ? { id: templateId, name: opts.title ?? templateId } : undefined);
    if (lab) {
      // A lab tool from the menu or a chip: the ask goes through the same build a typed one does, naming the tool.
      this.#build(chatId, { ask: `muse make ${lab.name.toLowerCase()} for us`, title: lab.name, piece: lab.id, params: {} });
      return;
    }
    const t = template(templateId);
    const title = opts.title ?? t.name;
    const direct = (opts.blank ? BLANK_PIECE[templateId] : undefined) ?? PIECE_FOR[templateId];
    const ask = templateId === "pick-for-us" ? "muse pick for us" : `muse make a ${title.toLowerCase()}`;
    this.#build(chatId, { ask, title, ...(direct ? { piece: direct.piece, params: direct.params(title) } : {}) });
  }

  addTool(chatId: string, templateId: string, opts: { title?: string; systemLine?: boolean } = {}): Tool {
    const id = this.#build(chatId, { ask: `muse make a ${(opts.title ?? template(templateId).name).toLowerCase()}`, title: opts.title ?? template(templateId).name, ...(PIECE_FOR[templateId] ? { piece: PIECE_FOR[templateId]!.piece, params: PIECE_FOR[templateId]!.params(opts.title ?? template(templateId).name) } : {}) });
    return { id: id ?? "", chat: chatId, appId: "live", name: opts.title ?? template(templateId).name, summary: "", last: null, needsMe: false, cardId: id ?? "" };
  }

  joinNote(noteId: string): string {
    const n = NOTE_CHATS[noteId];
    if (!n) throw new Error(`note ${noteId} has no tool chat`);
    const room = this.#open(n.chat);
    const st = room.state;
    if (!st.members.includes(this.myId)) {
      room.dispatch({ t: "join", who: [this.myId] } satisfies ChatAction);
      // Tools hear about the new member through their own log: a mounted frame records `@members`
      // now; any other tool does when it is next mounted (with the chat's current members).
      for (const m of st.messages) if (m.tool?.code) this.#mounted.get(m.tool.id)?.setMembers(this.#membersOf(n.chat, [this.myId]));
    }
    return n.chat;
  }

  createChat(spec: ChatSpec): string {
    const found = this.#indexState.chats.find((c) => c.key === spec.key);
    if (found) return found.id;
    const id = chatIdForKey(spec.key);
    this.#index.dispatch({ t: "chat", id, key: spec.key });
    const room = this.#open(id);
    room.dispatch({ t: "create", name: spec.name, kind: "group", members: spec.members.map(this.#w), key: spec.key } satisfies ChatAction);
    // Two phones can tap at once; only the one whose create the server took first builds.
    until(() => room.confirmed.created, 20_000).then(() => {
      if (room.confirmed.members[0] !== this.myId) return;
      if (room.confirmed.messages.some((m) => m.kind === "muse")) return;
      const tpl = template(spec.templateId);
      const direct = PIECE_FOR[spec.templateId];
      this.#build(id, {
        ask: spec.ask ?? `muse make a ${tpl.name.toLowerCase()}`,
        title: spec.toolName ?? tpl.name,
        surface: "event",
        ...(spec.piece ? { piece: spec.piece, params: spec.params ?? {} } : direct ? { piece: direct.piece, params: direct.params(spec.toolName ?? tpl.name) } : {}),
      });
    });
    return id;
  }

  /** Asks the factory for a tool. The chat log holds a building card until it lands or fails. */
  /** catalysts: pre-made builds this session, so a tool that does not open can fall to the next lab choice. */
  #premades = new Map<string, { chatId: string; body: GenerateBody & { premade?: PremadeWire }; name: string; tried: string[] }>();

  /** A tool that did not open: rebuild it in place from the next of its scenario's choices it has not tried. False when there is none. */
  async retryTool(toolId: string): Promise<boolean> {
    const r = this.#premades.get(toolId);
    const room = r ? this.#room(r.chatId) : undefined;
    const rest = r?.body.premade?.choices.filter((c) => !r.tried.includes(c.tool)) ?? [];
    if (!r || !room || !rest.length) return false;
    try {
      const body: GenerateBody & { premade?: PremadeWire } = { ...r.body, premade: { ...r.body.premade!, choices: rest } };
      const b = await generate(generateUrl().replace(/\/generate$/, "/premade"), body, () => {});
      r.tried.push(b.piece ?? rest[0]!.tool);
      room.dispatch({ t: "tool", id: toolId, name: r.name, summary: b.summary, code: b.code, by: this.myId } satisfies ChatAction);
      await until(() => this.#chatStates[r.chatId]?.state.messages.find((m) => m.tool?.id === toolId)?.tool?.code === b.code, 5000);
      return true;
    } catch (e) {
      console.warn("retry failed", e);
      return false;
    }
  }

  #build(chatId: string, o: { decide?: Promise<boolean>; sent?: string; ask: string; title: string; piece?: string; params?: Record<string, unknown>; surface?: GenerateBody["surface"]; premade?: PremadeWire; context?: ContextWire }): string | null {
    const live = this.#chatStates[chatId];
    const room = this.#room(chatId);
    if (!live || !room) return null;
    // One build per chat at a time: a second one says so instead of vanishing.
    if (live.state.messages.some((m) => m.tool?.building)) {
      room.dispatch({ t: "msg", id: rid("m-"), kind: "system", text: "Muse is still making the last one. Try again when it lands" });
      return null;
    }
    const id = rid("t-");
    if (o.sent) room.dispatch({ t: "msg", id: `sent-${id}`, kind: "system", text: o.sent } satisfies ChatAction);
    room.dispatch({ t: "tool-pending", id, title: o.title, ask: o.ask } satisfies ChatAction);
    this.#inflight.add(id);
    this.#building = { ...this.#building, [id]: { stage: STAGES.understanding!, at: Date.now() } };
    room.eph("building", { id, stage: STAGES.understanding });
    const st = live.state;
    const name = (w: string) => this.#people.get(w)?.first ?? w;
    const said = st.messages
      .filter((m) => (m.kind === "text" || m.kind === "link") && m.from !== "system")
      .map((m) => ({ from: m.from === "muse" ? "Muse" : name(m.from), text: m.text ?? m.link?.title ?? "" }));
    const body: GenerateBody & { premade?: PremadeWire } = {
      ask: o.ask,
      // catalysts: the page's facts come first, as structured lines from "Facebook"
      chat: { title: o.context?.title ?? st.name, messages: [...(o.context?.lines ?? []), ...said].slice(-40) },
      members: st.members.map((m) => ({ id: m, name: name(m) })),
      ...(o.premade ? { premade: o.premade } : {}),
      surface: o.surface ?? "chat",
      chatId,
      toolId: id,
      as: this.myId,
      ...(o.piece ? { piece: o.piece, params: o.params ?? {} } : {}),
      ...(liveConfig?.model ? { model: liveConfig.model } : {}),
    };
    let isNew = false;
    const once = () =>
      generate(o.premade ? generateUrl().replace(/\/generate$/, "/premade") : generateUrl(), body, (p) => {
        // a new Mini (not one from the library) takes about a minute: say so while it is made
        if (p.t === "routed" && p.path === "build") isNew = true;
        const stage = isNew && p.t !== "ready" ? NEW_STAGE : (STAGES[p.t] ?? this.#building[id]?.stage ?? "");
        this.#building = { ...this.#building, [id]: { stage, at: Date.now() } };
        room.eph("building", { id, stage });
      });
    // two asks at once (someone else's build in this chat): wait a moment and try once more, silently
    const run = () => once().catch(async (e) => {
      if (!(e instanceof BuildError) || e.code !== "busy") throw e;
      await new Promise((r) => setTimeout(r, 8000));
      return once();
    });
    (o.decide ? o.decide.then((changed) => (changed ? null : run())) : run())
      .then((b) => {
        if (!b) {
          room.dispatch({ t: "tool-failed", id, text: "Changing that Mini" } satisfies ChatAction);
          return;
        }
        if (b.reply !== undefined) {
          // no Mini on purpose: the building card becomes Muse's line, with the Mini it offers if any
          room.dispatch({ t: "tool-failed", id, text: b.reply || LINES.failed, code: b.why ?? "failed", ...(b.chip ? { chip: b.chip } : {}) } satisfies ChatAction);
          return;
        }
        room.dispatch({ t: "tool", id, name: b.name || o.title, summary: b.summary, code: b.code, by: this.myId } satisfies ChatAction);
        if (o.premade) this.#premades.set(id, { chatId, body, name: b.name || o.title, tried: [b.piece ?? o.premade.choices[0]?.tool ?? ""] }); // catalysts: for a retry
        (window as unknown as { __museBuilt?: unknown[] }).__museBuilt?.push({ id, path: b.path, ms: b.ms });
      })
      .catch((e) => {
        console.warn("build failed", e);
        // every way a build ends says why in its own line (factory.ts LINES), never a bare failure
        room.dispatch({ t: "tool-failed", id, text: e instanceof BuildError ? e.line : LINES.failed, code: e instanceof BuildError ? e.code : "failed" } satisfies ChatAction);
      })
      .finally(() => {
        this.#inflight.delete(id);
        room.eph("building", null);
      });
    return id;
  }

  #chatOfPending(id: string): string | undefined {
    for (const [chatId, live] of Object.entries(this.#chatStates)) if (live.state.messages.some((m) => m.id === id)) return chatId;
    return undefined;
  }

  /** My own building cards left over from before a reload can never finish: say so. */
  #failOrphans(chatId: string) {
    const live = this.#chatStates[chatId];
    for (const m of live?.confirmed.messages ?? []) {
      if (m.tool?.building && m.tool.by === this.myId && !this.#inflight.has(m.id)) this.#dispatch(chatId, { t: "tool-failed", id: m.id, text: LINES.orphan });
    }
  }

  /** Anyone's building card whose builder went quiet. */
  #failStale() {
    const now = Date.now();
    for (const [chatId, live] of Object.entries(this.#chatStates)) {
      if (!live.state.members.includes(this.myId)) continue;
      for (const m of live.confirmed.messages) {
        // a change that never finished: the marker comes off
        if (m.tool?.changing && now - m.tool.changing.at > STALE_CHANGE_MS) this.#dispatch(chatId, { t: "tool-change-end", id: m.id });
        if (!m.tool?.building || this.#inflight.has(m.id)) continue;
        const heard = this.#building[m.id]?.at ?? 0;
        if (now - m.at > STALE_BUILD_MS && now - heard > STALE_BUILD_MS / 3) this.#dispatch(chatId, { t: "tool-failed", id: m.id, text: LINES.too_slow, code: "too_slow" });
      }
    }
  }

  #membersOf(chatId: string, plus: string[] = []) {
    const st = this.#chatStates[chatId]?.state;
    const ids = [...new Set([...(st?.members ?? []), ...plus])];
    return ids.map((m) => {
      const name = this.#people.get(m)?.first ?? m;
      const avatar = toolAvatar(m, name);
      return avatar ? { id: m, name, avatar } : { id: m, name };
    });
  }

  /** Real people's photos arrive late: send every mounted tool its members again. */
  #refreshToolFaces() {
    void whenPhotosReady().then((got) => {
      if (!got) return;
      for (const [id, mounted] of this.#mounted) {
        const chat = this.tool(id)?.chat ?? this.#chatOfPending(id);
        if (chat) mounted.setMembers(this.#membersOf(chat));
      }
    });
  }

  mountTool(el: HTMLElement, toolId: string, opts: { dark: boolean; width: number; onSize: (h: number) => void; onError?: (m: string, fatal: boolean) => void; onEvicted?: (wait: (cb: () => void, visible?: () => boolean) => () => void) => void; visible?: () => boolean }): MountedTool {
    const chatId = this.tool(toolId)?.chat ?? this.#chatOfPending(toolId);
    const msg = chatId ? this.#chatStates[chatId]?.state.messages.find((m) => m.tool?.id === toolId) : undefined;
    if (!chatId || !msg?.tool?.code) throw new Error(`no tool ${toolId}`);
    let latest = "";
    let m: Mounted | null = null;
    const reconcile = () => {
      this.#summaryTimers.delete(toolId);
      if (!m) return;
      // Wait for our own actions to be confirmed, so "who acted last" is the server's answer.
      if (m.unconfirmed > 0) return void this.#summaryTimers.set(toolId, setTimeout(reconcile, 150));
      const stored = this.#chatStates[chatId]?.state.tools[toolId];
      const last = m.last;
      const by = last?.user ?? null;
      const at = last?.time ?? null;
      if (stored && stored.summary === latest && (by === null || (stored.last?.by === by && stored.last?.at === at))) return;
      // Everyone computes the same summary from the same log, so a race only repeats it.
      this.#dispatch(chatId, { t: "tool-summary", id: toolId, text: latest, by, at });
    };
    const schedule = () => {
      clearTimeout(this.#summaryTimers.get(toolId));
      this.#summaryTimers.set(toolId, setTimeout(reconcile, 250));
    };
    m = mountTool({
      el,
      code: msg.tool.code,
      socket: this.#socket,
      room: roomOfTool(msg.tool),
      me: this.myId,
      members: this.#membersOf(chatId),
      dark: opts.dark,
      width: opts.width,
      onSize: opts.onSize,
      onSummary: (text) => {
        latest = text;
        schedule();
      },
      onEntry: () => latest && schedule(),
      ...(opts.onError ? { onError: opts.onError } : {}),
      ...(opts.onEvicted ? { onEvicted: opts.onEvicted } : {}),
      ...(opts.visible ? { visible: opts.visible } : {}),
    });
    const mounted = m;
    this.#mounted.set(toolId, mounted);
    this.#refreshToolFaces();
    return {
      setTheme: (dark, width) => mounted.setTheme(dark, width),
      destroy: () => {
        clearTimeout(this.#summaryTimers.get(toolId));
        if (this.#mounted.get(toolId) === mounted) this.#mounted.delete(toolId);
        mounted.destroy();
      },
    };
  }

  // ==== surfaces (src/surfaces): Facebook Home, Groups, Marketplace, Reels, Gaming. Additive block. ====

  landPiece(spec: LandSpec): string {
    let chatId = spec.chatId;
    if (!chatId && spec.newChat) {
      const nc = spec.newChat;
      const found = this.#indexState.chats.find((c) => c.key === nc.key);
      chatId = found?.id ?? chatIdForKey(nc.key);
      if (!found) {
        this.#index.dispatch({ t: "chat", id: chatId, key: nc.key });
        this.#open(chatId).dispatch({ t: "create", name: nc.name, kind: "group", members: nc.members.map(this.#w), key: nc.key } satisfies ChatAction);
      }
    }
    if (!chatId) throw new Error("landPiece: no chat");
    const id = chatId;
    const room = this.#open(id);
    const go = () => {
      if (spec.source && !spec.premade?.refill) room.dispatch({ t: "msg", id: spec.source.id ?? rid(`${SOURCE_PREFIX}${spec.source.surface.toLowerCase()}-`), kind: "system", text: spec.source.text } satisfies ChatAction);
      this.#build(id, { ask: spec.ask, title: spec.title, ...(spec.premade?.refill ? { sent: `**${this.#people.get(this.myId)?.first ?? "Someone"}** sent a Mini · ${spec.title}` } : {}), piece: spec.piece, params: spec.params, ...(spec.premade ? { premade: spec.premade } : {}), ...(spec.context ? { context: spec.context } : {}), ...(spec.surface ? { surface: spec.surface } : {}) }); // catalysts: premade and context
    };
    if (this.#chatStates[id]?.state.created) go();
    else until(() => !!this.#chatStates[id]?.state.created, 20_000).then(go);
    return id;
  }

  surfaceTools(key: string): readonly SurfaceTool[] {
    for (const [chatId, live] of Object.entries(this.#chatStates)) {
      if (live.state.key !== key) continue;
      return live.state.messages
        .filter((m) => m.kind === "muse" && m.tool)
        .map((m) => ({ id: m.tool!.id, chatId, name: m.tool!.name, building: !!m.tool!.building, summary: stripName(live.state.tools[m.tool!.id]?.summary ?? "", m.tool!.name), by: this.#v(m.tool!.by ?? ""), users: new Set((live.state.tools[m.tool!.id]?.log ?? []).map((e) => e.by)).size })); // catalysts: by, users
    }
    return [];
  }

  /** On a socket of its own: the tool's frame may hold this room on the shared one (one subscription per room per socket). */
  toolAct(toolId: string, action: unknown): void {
    const sock = openSocket(wsUrl());
    const counter = { init: () => 0, reduce: (n: number) => n + 1 };
    const wire = Object.values(this.#chatStates).flatMap((l) => l.state.messages).find((m) => m.tool?.id === toolId)?.tool;
    const r = openRoom(sock, wire ? roomOfTool(wire) : toolRoom(toolId), this.myId, counter);
    r.dispatch(action);
    until(() => r.live && r.state === r.confirmed, 15_000).then(() => {
      r.close();
      sock.close();
    });
  }

  sendLink(chatId: string, link: NonNullable<Message["link"]>): string {
    const id = rid("m-");
    const wire = { ...link } as WireMsg["link"];
    this.#dispatch(chatId, { t: "msg", id, kind: "link", link: wire });
    return id;
  }

  sendSystem(chatId: string, id: string, text: string): void {
    if (this.#chatStates[chatId]?.state.messages.some((m) => m.id === id)) return;
    this.#dispatch(chatId, { t: "msg", id, kind: "system", text });
  }
  // ==== end surfaces ====

  // --- events -----------------------------------------------------------------------------

  get events(): readonly EventInfo[] {
    return seedEvents().map((e) => this.#eventView(e));
  }
  event(id: string): EventInfo | undefined {
    return this.events.find((e) => e.id === id);
  }
  #eventView(e: EventInfo): EventInfo {
    const all = ["noa", ...e.friends.map(wireId)];
    return { ...e, friends: all.filter((w) => w !== this.myId).slice(0, 3).map(this.#v) };
  }
  rsvp(id: string): Rsvp | null {
    return this.#rsvp[id] ?? null;
  }
  setRsvp(id: string, value: Rsvp | null): void {
    this.#rsvp[id] = value;
    try {
      localStorage.setItem(`muse.rsvp.${this.myId}`, JSON.stringify(this.#rsvp));
    } catch {}
  }
}

export const EVENT_ASK = (e: EventInfo = EVENT) => `muse make a who's in for ${e.title}`;

const lastAt = (c: Chat) => c.messages.filter((m) => m.kind !== "system" && m.kind !== "activity").at(-1)?.at ?? 0;

/** "Chore wheel: Dishes: Maya." -> "Dishes: Maya." when it starts with the tool's own name. */
function stripName(summary: string, name: string): string {
  const s = summary.trim();
  const pres = [name + ": ", name + " · ", name + ". ", name + " "];
  for (const pre of pres) if (s.toLowerCase().startsWith(pre.toLowerCase())) return s.slice(pre.length);
  return s;
}

/**
 * An activity line in plain words. The tool's summary is used when its first sentence is about the
 * person who acted ("Tsai Lin spun the wheel: Sushi Ko"); otherwise "Tsai Lin updated Where are we eating?".
 * The viewer's own actions read "You".
 */
export function activityLine(summary: string, toolName: string, first: string, mine: boolean): string {
  const who = mine ? "You" : first;
  const lead = stripName(summary, toolName).split(/(?<=[.!?])\s+/)[0]!.replace(/[.!?]+$/, "").trim();
  if (lead.toLowerCase().startsWith(first.toLowerCase() + " ") && lead.length > first.length + 1) return `**${who}** ${lead.slice(first.length + 1)}`;
  return `**${who}** updated **${toolName}**`;
}

/** "muse pick for us" -> "Pick for us" for the building card. */
function titleFromAsk(ask: string): string {
  const rest = ask.replace(/^\s*@?muse\b[\s,:]*/i, "").trim();
  if (!rest) return "Something for this chat";
  const t = rest.length > 40 ? rest.slice(0, 39) + "…" : rest;
  return t[0]!.toUpperCase() + t.slice(1);
}

function until(pred: () => boolean, ms: number): Promise<void> {
  return new Promise((res) => {
    const t0 = Date.now();
    const loop = () => (pred() || Date.now() - t0 > ms ? res() : setTimeout(loop, 25));
    loop();
  });
}

export { FAILED_TEXT };
