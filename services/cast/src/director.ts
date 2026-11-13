// The cast director. Watches every chat as an observer, decides what the made-up friends do,
// and does it through one real `@muse/sync` replica per person per room, so every message,
// reaction, read and tool tap is an ordinary entry in the real log.
//
// Who is simulated: a friend is played by the cast unless a real phone is here as them. Real
// presence comes from the ephemeral channel (the shell's `here` heartbeat on t:index, typing)
// and from log entries sent by clients that are not the cast's. The cast's own heartbeat carries
// a marker so it is never mistaken for a real phone. A friend steps back the moment a real
// phone shows up as them and comes back a while after it leaves.
//
// Safety rails, all in `#outbox`: nothing while paused or stopped; nothing as someone who is
// real; nothing in a chat with no real person, or with two or more unless `crowd` is on; never a
// tool, a build or a message to Muse; per-chat and per-tool rate limits; one action at a time
// across the whole cast; every action written to the cast's own log.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createReplica, type SyncReplica } from "../../../packages/sync/src/index.ts";
import type { Entry, Member, Reducer, S2C } from "../../../packages/protocol/src/index.ts";
import type { SharedSocket, Transport } from "../../../packages/sync/src/transport.ts";
import { chatReducer, chatRoom, INDEX_ROOM, indexReducer, toolRoom, type ChatState, type IndexState } from "../../../apps/shell/src/live/chat-reducer.ts";
import { realClock, type Clock } from "./clock.ts";
import { choose, progress, resultOf } from "./choose.ts";
import { intent, line, voiceOk, type Facts, type Situation } from "./lines.ts";
import type { Net } from "./net.ts";
import { PEOPLE_IDS, persona, SPEEDS, type Speed } from "./personas.ts";
import { skewed, stream, type Rand } from "./rand.ts";
import { RealmError, ToolRealm, type FoldJson } from "./realm.ts";
import { castRoles, scene as findScene, SCENES } from "./scenes.ts";

export const CAST_MARK = { cast: 1 };
/** The shell counts someone active for 9 s after a `here`; a real phone sends one every 3 s. */
export const HERE_MS = 9500;
const HEARTBEAT_MS = 3000;
const TYPING_REFRESH_MS = 2000;

export type Limits = {
  /** messages per chat: at most `msgBurst` in `burstMs`, `msgLong` in `longMs` */
  msgBurst: number;
  msgLong: number;
  burstMs: number;
  longMs: number;
  /** reactions per chat in `burstMs` */
  reactBurst: number;
  /** tool actions per tool in `burstMs` */
  toolBurst: number;
  /** quiet time between any two visible cast actions, across everyone */
  gapMs: number;
};
export const LIMITS: Limits = { msgBurst: 7, msgLong: 30, burstMs: 20_000, longMs: 300_000, reactBurst: 6, toolBurst: 6, gapMs: 700 };

export type ModelReply = (p: { id: string; first: string }, tail: { from: string; text: string }[], text: string) => Promise<string | null>;

export type CastOptions = {
  net: Net;
  seed?: number;
  clock?: Clock;
  /** makes message and client ids unique to this run */
  runId?: string;
  /** who the cast may play (default: everyone) */
  people?: string[];
  speed?: Speed;
  /** act in chats with two or more real people */
  crowd?: boolean;
  /** how long after a real phone leaves before the cast plays that person again */
  resumeMs?: number;
  limits?: Partial<Limits>;
  /** one line per event, for the console */
  log?: (line: string) => void;
  /** every simulated action as a JSON line */
  logFile?: string;
  /** starts the database over and seeds it again (the stack provides it) */
  reset?: () => Promise<void>;
  model?: ModelReply | null;
  /** where the presenter opens chats, for links in the controls */
  appUrl?: string;
  /** tests only: turn one guard off to prove a test catches it */
  sabotage?: string[];
};

export type CastEvent = { at: number; who: string; room: string; kind: string; text: string; cast: boolean };
export type Mode = "cast" | "real" | "resting" | "off";

type Task = { id: number; at: number; who: string; chat: string | null; kind: string; run: () => void; act: boolean; scene?: boolean };

type Tool = {
  id: string;
  chat: string;
  realm: ToolRealm | null;
  broken?: string;
  /** Muse changed the tool in place (new code, maybe a new room): the cast leaves it alone from then on */
  changed?: boolean;
  replica: SyncReplica<FoldJson> | null;
  landedAt: number;
  recent: string[];
  acts: { who: string; t: string; at: number; cast: boolean }[];
  lastApp: { user: string; time: number } | null;
  lastRandomAt: number;
  summary: string;
  finished: boolean;
  done: number;
  planned: Set<string>;
  /** someone is about to act (said "spinning", tap coming): others wait */
  busy: { who: string; until: number } | null;
};

type Actor = {
  id: string;
  socket: SharedSocket;
  index: SyncReplica<IndexState>;
  chats: Map<string, SyncReplica<ChatState>>;
  tools: Map<string, SyncReplica<FoldJson>>;
};

export class Director {
  readonly o: CastOptions;
  readonly clock: Clock;
  readonly seed: number;
  readonly runId: string;
  readonly limits: Limits;
  readonly people: string[];
  events: CastEvent[] = [];
  /** everything the cast sent, for tests: [ms since start, who, room, action] */
  sent: [number, string, string, unknown][] = [];
  paused = false;
  stopped = false;
  speed: Speed;
  crowd: boolean;
  enabled: Set<string>;
  lastScene: { id: string; chat: string; next: string; ask?: string; url?: string } | null = null;

  #t0: number;
  #watch!: SharedSocket;
  #index!: SyncReplica<IndexState>;
  #chats = new Map<string, SyncReplica<ChatState>>();
  #tools = new Map<string, Tool>();
  #actors = new Map<string, Actor>();
  #ours = new Set<string>();
  #real = new Map<string, number>();
  #modes = new Map<string, Mode>();
  #queue: Task[] = [];
  #timer: number | null = null;
  #heart: number | null = null;
  #nextTask = 1;
  #lastActAt = -Infinity;
  /** Minis a friend already reacted to landing, and failed builds a friend already reacted to: once each */
  #landedSaid = new Set<string>();
  #failedSaid = new Set<string>();
  #pausedAt = 0;
  #windows = new Map<string, number[]>();
  #typing = new Map<string, { chat: string; refresh: number | null; since: number }>();
  #n = 0;
  #sceneN = 0;
  #running = false;
  #sab: Set<string>;

  constructor(o: CastOptions) {
    this.o = o;
    this.clock = o.clock ?? realClock;
    this.seed = (o.seed ?? 1) >>> 0;
    this.runId = o.runId ?? Date.now().toString(36);
    this.limits = { ...LIMITS, ...(o.limits ?? {}) };
    this.people = o.people ?? PEOPLE_IDS;
    this.speed = o.speed ?? "normal";
    this.crowd = o.crowd ?? false;
    this.enabled = new Set(this.people);
    this.#t0 = this.clock.now();
    this.#sab = new Set(o.sabotage ?? []);
    if (o.logFile) mkdirSync(dirname(o.logFile), { recursive: true });
  }

  // --- lifecycle --------------------------------------------------------------------------

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#watch = this.o.net("watch");
    this.#index = this.#open(this.#watch, INDEX_ROOM, "@cast", indexReducer, (user, key, value) => this.#onEph(null, user, key, value));
    this.#index.subscribe((s) => this.#onIndex(s));
    for (const id of this.people) this.#actor(id);
    this.#heart = this.clock.set(() => this.#beat(), HEARTBEAT_MS);
    this.#note("@cast", "", "start", `cast started, seed ${this.seed}, ${this.speed}`);
  }

  /** Closes every socket and forgets every room. */
  close() {
    if (!this.#running) return;
    this.#running = false;
    this.#cancel(() => true);
    for (const who of [...this.#typing.keys()]) this.#stopTyping(who);
    if (this.#heart !== null) this.clock.clear(this.#heart);
    if (this.#timer !== null) this.clock.clear(this.#timer);
    this.#timer = this.#heart = null;
    for (const a of this.#actors.values()) {
      a.index.close();
      a.chats.forEach((r) => r.close());
      a.tools.forEach((r) => r.close());
      a.socket.close();
    }
    this.#index.close();
    this.#chats.forEach((r) => r.close());
    this.#tools.forEach((t) => {
      t.replica?.close();
      t.realm?.close();
    });
    this.#watch.close();
    this.#actors.clear();
    this.#chats.clear();
    this.#tools.clear();
    this.#ours.clear();
    this.#windows.clear();
  }

  /** Starts the database over (when the stack allows it) and the cast with it. */
  async reset() {
    this.#note("@cast", "", "reset", "reset to the seeded chats");
    this.close();
    this.#real.clear();
    this.#modes.clear();
    this.lastScene = null;
    if (this.o.reset) await this.o.reset();
    this.start();
  }

  // --- presenter controls -------------------------------------------------------------------

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.#pausedAt = this.clock.now();
    for (const who of [...this.#typing.keys()]) this.#stopTyping(who);
    this.#note("@cast", "", "pause", "paused");
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    const d = this.clock.now() - this.#pausedAt;
    for (const t of this.#queue) t.at += d;
    this.#note("@cast", "", "resume", "resumed");
    this.#arm();
  }

  /** The one switch: drops every plan, stops typing and presence, refuses everything after. */
  stopAll() {
    this.stopped = true;
    if (!this.#sab.has("stop")) this.#cancel(() => true);
    for (const who of [...this.#typing.keys()]) this.#stopTyping(who);
    this.#note("@cast", "", "stop", "stopped everything");
  }

  startAgain() {
    this.stopped = false;
    this.paused = false;
    this.#note("@cast", "", "start", "started again");
  }

  setSpeed(s: Speed) {
    this.speed = s;
    this.#note("@cast", "", "speed", `speed ${s}`);
  }

  setPerson(id: string, on: boolean) {
    if (!this.people.includes(id)) return;
    if (on) this.enabled.add(id);
    else {
      this.enabled.delete(id);
      this.#stepBack(id, "turned off");
    }
    this.#note(id, "", "person", on ? "on" : "off");
  }

  /** Brings the next planned thing forward to now; with nothing planned, someone makes a move. */
  nextBeat() {
    if (this.stopped && !this.#sab.has("stop")) return;
    const t = [...this.#queue].sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (t) {
      t.at = this.clock.now();
      this.#arm();
      this.#note(t.who, "", "beat", `next beat: ${t.kind}`);
      return;
    }
    // Nothing planned: the newest unfinished tool in a watched chat gets a move.
    const tools = [...this.#tools.values()].filter((x) => !x.finished && x.realm && this.#watched(x.chat)).sort((a, b) => b.landedAt - a.landedAt);
    for (const tool of tools) {
      const who = this.#simIn(tool.chat).find((p) => tool.acts.filter((a) => a.who === p).length < 3);
      if (who) {
        this.#toolTurn(who, tool.id, 0, 0);
        this.#note(who, "", "beat", "next beat: a move on the tool");
        return;
      }
    }
    const chat = [...this.#chats.keys()].filter((c) => this.#watched(c)).sort((a, b) => this.#lastAt(b) - this.#lastAt(a))[0];
    const who = chat ? this.#simIn(chat)[0] : undefined;
    if (chat && who) {
      const text = line("nudge", persona(who), {}, this.#r(`${who}:nudge:${this.#n++}`));
      if (text) this.#say(who, chat, text, 0);
      this.#note(who, "", "beat", "next beat: a nudge");
    }
  }

  /** Sets up a named scene in a new chat. Returns where it is and what the presenter does next. */
  runScene(id: string, presenterHint?: string) {
    const s = findScene(id);
    if (!s) throw new Error(`no scene ${id}`);
    const presenter = presenterHint && PEOPLE_IDS.includes(presenterHint) ? presenterHint : (this.#realNow().find((u) => PEOPLE_IDS.includes(u)) ?? "noa");
    const available = this.people.filter((p) => p !== presenter && this.mode(p) === "cast");
    const roles = castRoles(s, available);
    if (!roles) throw new Error("not enough people in the cast for this scene");
    const chat = `cast-${s.id}-${this.runId}-${++this.#sceneN}`;
    const creator = roles[0]!;
    const a = this.#actor(creator);
    this.#ensureChat(a, chat);
    this.#outbox(creator, INDEX_ROOM, "scene", { t: "chat", id: chat }, () => a.index.dispatch({ t: "chat", id: chat }), { scene: true, gap: false });
    this.#outbox(creator, chatRoom(chat), "scene", { t: "create", name: s.chat, kind: "group", members: [presenter, ...roles] }, () =>
      a.chats.get(chat)!.dispatch({ t: "create", name: s.chat, kind: "group", members: [presenter, ...roles] }),
      { scene: true, gap: false },
    );
    // The lines, one after another, quick but typed.
    let at = 900;
    const r = this.#r(`scene:${chat}`);
    for (const [i, l] of s.lines.entries()) {
      const who = roles[l.role]!;
      const text = l.text;
      const typed = text ? Math.min(2600, 500 + (text.length / persona(who).cps) * 450) : 0;
      const start = at;
      at += typed + r.range(350, 900);
      const fire = at;
      if (text) this.#push({ at: this.clock.now() + start, who, chat, kind: "typing", act: false, scene: true, run: () => this.#startTyping(who, chat) });
      this.#push({
        at: this.clock.now() + fire,
        who,
        chat,
        kind: "scene-line",
        act: true,
        scene: true,
        run: () => {
          const msgId = this.#id(who, `s${i}`);
          const action = l.link ? { t: "msg", id: msgId, kind: "link", link: l.link } : { t: "msg", id: msgId, text };
          this.#sendMsg(who, chat, action, { scene: true });
          if (l.react) {
            const rw = roles[l.react.role]!;
            const emoji = l.react.emoji;
            this.#push({ at: this.clock.now() + 900 + r.int(700), who: rw, chat, kind: "react", act: true, scene: true, run: () => this.#sendReact(rw, chat, msgId, emoji, { scene: true }) });
          }
        },
      });
    }
    const url = this.o.appUrl ? `${this.o.appUrl}?as=${presenter}&chat=${chat}` : undefined;
    this.lastScene = { id: s.id, chat, next: s.next, ...(s.ask ? { ask: s.ask } : {}), ...(url ? { url } : {}) };
    this.#note(creator, chatRoom(chat), "scene", `scene "${s.label}" in ${chat} for ${presenter}`);
    this.#arm();
    return { chat, presenter, roles, next: s.next, ask: s.ask, url, ms: at };
  }

  // --- what the presenter sees ------------------------------------------------------------

  mode(user: string): Mode {
    if (!this.people.includes(user) || !this.enabled.has(user)) return "off";
    const last = this.#real.get(user);
    if (last === undefined) return "cast";
    const ago = this.clock.now() - last;
    if (ago < HERE_MS) return "real";
    if (ago < HERE_MS + (this.o.resumeMs ?? 25_000)) return "resting";
    return "cast";
  }

  status() {
    return {
      paused: this.paused,
      stopped: this.stopped,
      speed: this.speed,
      crowd: this.crowd,
      seed: this.seed,
      people: this.people.map((id) => ({ id, name: persona(id).first, on: this.enabled.has(id), mode: this.mode(id) })),
      planned: this.#queue.length,
      scene: this.lastScene,
      scenes: SCENES.map((s) => ({ id: s.id, key: s.key, label: s.label })),
      log: this.events.slice(-40).map((e) => ({ ...e, who: e.who === "@cast" ? "Cast" : persona(e.who).first, ago: Math.round((this.clock.now() - e.at) / 1000) })),
    };
  }

  // --- rooms --------------------------------------------------------------------------------

  #open<S>(socket: SharedSocket, room: string, user: string, reducer: Reducer<S>, onEph?: (user: string, key: string, value: unknown) => void, onEntry?: (e: Entry, live: boolean) => void): SyncReplica<S> {
    const inner = socket.transport(room);
    let r: SyncReplica<S> | null = null;
    const transport: Transport = {
      start: (h) =>
        inner.start({
          open: () => h.open(),
          close: () => h.close(),
          message: (m: S2C) => {
            const was = r?.live ?? false;
            h.message(m);
            if (!onEntry) return;
            if (m.t === "entry") onEntry(m.entry, was);
            else if (m.t === "welcome") for (const e of m.entries) onEntry(e, false);
          },
        }),
      send: (m) => inner.send(m),
      stop: () => inner.stop(),
    };
    r = createReplica(reducer, transport, { room, user, client: `cast-${this.runId}-${user.replace(/\W/g, "")}-${room.replace(/\W/g, "")}`, now: () => this.clock.now(), ...(onEph ? { onEph } : {}) });
    this.#ours.add(r.client);
    return r;
  }

  #actor(id: string): Actor {
    let a = this.#actors.get(id);
    if (a) return a;
    const socket = this.o.net(id);
    a = { id, socket, index: this.#open(socket, INDEX_ROOM, id, indexReducer), chats: new Map(), tools: new Map() };
    this.#actors.set(id, a);
    return a;
  }

  #ensureChat(a: Actor, chat: string) {
    if (!a.chats.has(chat)) a.chats.set(chat, this.#open(this.#actor(a.id).socket, chatRoom(chat), a.id, chatReducer));
    return a.chats.get(chat)!;
  }

  #onIndex(s: IndexState) {
    for (const c of s.chats) {
      if (this.#chats.has(c.id)) continue;
      const r = this.#open(this.#watch, chatRoom(c.id), "@cast", chatReducer, (user, key, value) => this.#onEph(c.id, user, key, value), (e, live) => this.#onChatEntry(c.id, e, live));
      this.#chats.set(c.id, r);
      r.subscribe((st) => {
        for (const m of st.members) if (this.people.includes(m)) this.#ensureChat(this.#actor(m), c.id);
        for (const msg of st.messages) if (msg.tool?.code && !this.#tools.has(msg.tool.id)) this.#trackTool(c.id, msg.tool.id, msg.tool.code, msg.at);
        // a tool Muse changed in place: its old code would act and summarise wrongly, so step back
        for (const msg of st.messages) {
          const t = msg.tool?.rev ? this.#tools.get(msg.tool.id) : undefined;
          if (t && !t.changed) {
            t.changed = true;
            t.finished = true;
          }
        }
      });
    }
  }

  #chat(chat: string): ChatState | undefined {
    return this.#chats.get(chat)?.state;
  }

  #members(chat: string): string[] {
    return this.#chat(chat)?.members ?? [];
  }

  #lastAt(chat: string) {
    return this.#chat(chat)?.messages.at(-1)?.at ?? 0;
  }

  // --- presence ---------------------------------------------------------------------------

  #isOurs(client: string) {
    return this.#ours.has(client) || client.startsWith("seed-");
  }

  /** Anyone who could be a person on a phone (not the seeder, the cast's watcher or Muse). */
  #human(user: string) {
    return !!user && !user.startsWith("@") && user !== "muse" && user !== "system";
  }

  #onEph(chat: string | null, user: string, key: string, value: unknown) {
    if (!this.#human(user)) return;
    const marked = typeof value === "object" && value !== null && (value as { cast?: unknown }).cast === 1;
    if (marked) return;
    if ((key === "here" && chat === null) || (key === "typing" && value === true)) this.#markReal(user, `${key}`);
  }

  #markReal(user: string, how: string) {
    if (this.#sab.has("no-step-back")) return;
    const before = this.mode(user);
    this.#real.set(user, this.clock.now());
    if (before === "cast" && this.people.includes(user)) this.#stepBack(user, `a real phone is here as ${persona(user).first} (${how})`);
  }

  #stepBack(user: string, why: string) {
    this.#cancel((t) => t.who === user);
    this.#stopTyping(user);
    this.#note(user, "", "step-back", `${persona(user).first} stepped back: ${why}`);
  }

  #beat() {
    this.#heart = this.clock.set(() => this.#beat(), HEARTBEAT_MS);
    if (this.stopped) return;
    for (const id of this.people) {
      const m = this.mode(id);
      const prev = this.#modes.get(id);
      this.#modes.set(id, m);
      if (prev && prev !== "cast" && m === "cast") this.#note(id, "", "back", `${persona(id).first} is back in the cast`);
      if (m === "cast") this.#actors.get(id)?.index.eph("here", CAST_MARK);
    }
  }

  /** Real people who are in the app now. */
  #realNow(): string[] {
    return [...this.#real.keys()].filter((u) => this.clock.now() - this.#real.get(u)! < HERE_MS);
  }

  /** The cast acts in a chat only while someone real is around, and not in a crowd unless allowed. */
  #watched(chat: string) {
    const members = this.#members(chat);
    const real = this.#realNow().filter((u) => members.includes(u)).length;
    return real >= 1 && (real <= 1 || this.crowd || this.#public.has(chat) || this.#sab.has("crowd"));
  }

  /** Public: a post's tool on Home (services/demo/posts.ts). The crowd rule does not apply there. */
  #public = new Set<string>();
  allowCrowd(chat: string) {
    this.#public.add(chat);
  }

  /** Simulated people in a chat, in a seeded order per chat. */
  #simIn(chat: string): string[] {
    return this.#members(chat).filter((m) => this.mode(m) === "cast");
  }

  // --- scheduling -------------------------------------------------------------------------

  #r(name: string): Rand {
    if (this.#sab.has("random")) return stream((Math.random() * 2 ** 32) >>> 0, name);
    return stream(this.seed, name);
  }

  #d(ms: number) {
    return ms * SPEEDS[this.speed].delay;
  }

  #talk(p: number) {
    return Math.min(1, p * SPEEDS[this.speed].talk);
  }

  #push(t: Omit<Task, "id">) {
    this.#queue.push({ ...t, id: this.#nextTask++ });
    this.#arm();
  }

  #at(who: string, chat: string | null, kind: string, delay: number, run: () => void, act = true) {
    this.#push({ at: this.clock.now() + delay, who, chat, kind, act, run });
  }

  #cancel(pred: (t: Task) => boolean) {
    this.#queue = this.#queue.filter((t) => !pred(t));
    this.#arm();
  }

  #arm() {
    if (this.#timer !== null) this.clock.clear(this.#timer);
    this.#timer = null;
    if ((this.paused && !this.#sab.has("pause")) || (this.stopped && !this.#sab.has("stop")) || !this.#queue.length || !this.#running) return;
    const next = Math.min(...this.#queue.map((t) => t.at));
    this.#timer = this.clock.set(() => {
      this.#timer = null;
      this.#tick();
    }, next - this.clock.now());
  }

  #tick() {
    if (this.paused && !this.#sab.has("pause")) return;
    const now = this.clock.now();
    const due = this.#queue.filter((t) => t.at <= now).sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (due) {
      // One visible action at a time across the whole cast, with a human gap between.
      if (due.act && now < this.#lastActAt + this.limits.gapMs && !this.#sab.has("gap")) {
        due.at = this.#lastActAt + this.limits.gapMs + this.#r(`gap:${due.id}`).int(500);
      } else {
        this.#queue = this.#queue.filter((t) => t !== due);
        const ok = this.stopped && !this.#sab.has("stop") ? false : this.mode(due.who) === "cast" && (due.scene || due.chat === null || this.#watched(due.chat));
        if (ok) {
          try {
            due.run();
          } catch (e) {
            if (this.#sab.has("unguarded")) throw e;
            this.#note(due.who, "", "error", `${due.kind} failed: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
          }
        }
      }
    }
    this.#arm();
  }

  // --- the outbox: every action passes here -----------------------------------------------

  #window(key: string, ms: number, max: number): boolean {
    const now = this.clock.now();
    const list = (this.#windows.get(key) ?? []).filter((t) => now - t < ms);
    this.#windows.set(key, list);
    if (list.length >= max && !this.#sab.has("rate")) return false;
    list.push(now);
    return true;
  }

  #outbox(who: string, room: string, kind: string, action: Record<string, unknown>, send: () => void, o: { scene?: boolean; gap?: boolean } = {}): boolean {
    const refuse = (why: string) => {
      this.#note(who, room, "held", `${kind} held: ${why}`);
      return false;
    };
    if (this.stopped && !this.#sab.has("stop")) return refuse("stopped");
    if (this.paused && !this.#sab.has("pause")) return refuse("paused");
    if (this.mode(who) !== "cast") return refuse(`${who} is real or off`);
    const t = String(action.t ?? "");
    // Never build, fail or replace a tool, and never ask Muse for anything.
    if (["tool", "tool-pending", "tool-failed"].includes(t)) return refuse("the cast never makes tools");
    if (t === "msg" && (action.kind === "system" || (typeof action.text === "string" && /^\s*@?muse\b/i.test(action.text)))) return refuse("the cast never asks Muse");
    const chat = room.startsWith("t:") ? room.slice(2) : null;
    if (chat && chat !== "index" && !o.scene && !this.#watched(chat)) return refuse("no real person here, or more than one");
    if (kind === "msg" && chat && !(this.#window(`m:${chat}`, this.limits.burstMs, this.limits.msgBurst) && this.#window(`M:${chat}`, this.limits.longMs, this.limits.msgLong))) return refuse("message rate limit");
    if (kind === "react" && chat && !this.#window(`r:${chat}`, this.limits.burstMs, this.limits.reactBurst)) return refuse("reaction rate limit");
    if (kind === "tool" && !this.#window(`t:${room}`, this.limits.burstMs, this.limits.toolBurst)) return refuse("tool rate limit");
    send();
    if (o.gap !== false && ["msg", "react", "tool", "scene"].includes(kind)) this.#lastActAt = this.clock.now();
    this.sent.push([this.clock.now() - this.#t0, who, room, action]);
    this.#note(who, room, kind, describe(action), true);
    return true;
  }

  #note(who: string, room: string, kind: string, text: string, cast = false) {
    const e: CastEvent = { at: this.clock.now(), who, room, kind, text, cast };
    this.events.push(e);
    if (this.events.length > 1000) this.events.splice(0, this.events.length - 1000);
    this.o.log?.(`cast: ${who === "@cast" ? "" : persona(who).first.toLowerCase() + " "}${kind}${room ? " " + room : ""}: ${text}`);
    if (this.o.logFile) {
      try {
        appendFileSync(this.o.logFile, JSON.stringify({ ...e, time: new Date(e.at).toISOString(), simulated: cast }) + "\n");
      } catch {}
    }
  }

  #id(who: string, tag: string) {
    return `m-cast-${this.runId}-${who}-${tag}-${++this.#n}`;
  }

  // --- chat actions -----------------------------------------------------------------------

  #startTyping(who: string, chat: string) {
    const a = this.#actors.get(who);
    if (!a || this.paused || this.stopped) return;
    this.#stopTyping(who);
    const room = this.#ensureChat(a, chat);
    room.eph("typing", CAST_MARK);
    const entry = { chat, refresh: null as number | null, since: this.clock.now() };
    const again = () => {
      entry.refresh = this.clock.set(() => {
        if (this.#typing.get(who) !== entry) return;
        room.eph("typing", CAST_MARK);
        again();
      }, TYPING_REFRESH_MS);
    };
    again();
    this.#typing.set(who, entry);
  }

  #stopTyping(who: string) {
    const t = this.#typing.get(who);
    if (!t) return;
    this.#typing.delete(who);
    if (t.refresh !== null) this.clock.clear(t.refresh);
    this.#actors.get(who)?.chats.get(t.chat)?.eph("typing", false);
  }

  /** A friend already said this (or a one-typo version of it) in the chat's last 20 messages. */
  #repeat(chat: string, text: string): boolean {
    const t = flat(text);
    if (!t) return false;
    const sims = new Set(this.#simIn(chat));
    return (this.#chat(chat)?.messages ?? []).slice(-20).some((m) => sims.has(m.from) && typeof m.text === "string" && near1(flat(m.text), t));
  }

  /** Types for a while that fits the text, then sends it. Never a line a friend said a moment ago. */
  #say(who: string, chat: string, text: string, delay: number, then?: (msgId: string) => void) {
    if (this.#repeat(chat, text)) return void this.#note(who, chatRoom(chat), "held", `said held: "${text}" was said in the last 20 messages`);
    const p = persona(who);
    const r = this.#r(`${who}:type:${text}:${this.#n}`);
    const typing = this.#d(Math.min(7000, Math.max(900, 400 + (text.length / p.cps) * 1000 + r.range(0, 900))));
    this.#at(who, chat, "typing", delay, () => this.#startTyping(who, chat), false);
    this.#at(who, chat, "say", delay + typing, () => {
      // Paused and resumed mid-message: type again for a moment first.
      if (!this.#typing.has(who)) {
        this.#startTyping(who, chat);
        this.#at(who, chat, "say", this.#d(1200), () => this.#sendSay(who, chat, text, then));
        return;
      }
      this.#sendSay(who, chat, text, then);
    });
  }

  #sendSay(who: string, chat: string, text: string, then?: (msgId: string) => void) {
    // someone said it while this friend was typing
    if (this.#repeat(chat, text)) {
      this.#stopTyping(who);
      return void this.#note(who, chatRoom(chat), "held", `said held: "${text}" was said in the last 20 messages`);
    }
    const id = this.#id(who, "say");
    if (this.#sendMsg(who, chat, { t: "msg", id, text })) then?.(id);
    else this.#stopTyping(who);
  }

  #sendMsg(who: string, chat: string, action: Record<string, unknown>, o: { scene?: boolean } = {}): boolean {
    const a = this.#actors.get(who);
    if (!a) return false;
    const room = this.#ensureChat(a, chat);
    const ok = this.#outbox(who, chatRoom(chat), "msg", action, () => {
      this.#stopTyping(who);
      room.dispatch(action);
    }, o);
    if (!ok) this.#stopTyping(who);
    return ok;
  }

  #sendReact(who: string, chat: string, msg: string, emoji: string, o: { scene?: boolean } = {}) {
    const a = this.#actors.get(who);
    if (!a) return;
    const room = this.#ensureChat(a, chat);
    if (!room.state.messages.some((m) => m.id === msg)) return;
    const action = { t: "react", msg, emoji, once: true };
    this.#outbox(who, chatRoom(chat), "react", action, () => room.dispatch(action), o);
  }

  #read(who: string, chat: string, delay: number) {
    this.#cancel((t) => t.who === who && t.chat === chat && t.kind === "read");
    this.#at(
      who,
      chat,
      "read",
      delay,
      () => {
        const a = this.#actors.get(who);
        const room = a?.chats.get(chat);
        if (!room) return;
        const last = [...room.confirmed.messages].reverse().find((m) => m.kind !== "system");
        if (!last || last.from === who || room.confirmed.reads[who]?.msg === last.id) return;
        const action = { t: "read", msg: last.id };
        this.#outbox(who, chatRoom(chat), "read", action, () => room.dispatch(action));
      },
      false,
    );
  }

  // --- reacting to the log ----------------------------------------------------------------

  #onChatEntry(chat: string, e: Entry, live: boolean) {
    if (!live) return;
    const real = this.#human(e.user) && !this.#isOurs(e.client);
    if (real) this.#markReal(e.user, "sent something");
    const a = e.action as Record<string, unknown> | null;
    if (!a || typeof a !== "object") return;
    if (a.t === "msg" && real && a.kind !== "system") this.#onRealMessage(chat, String(a.id), typeof a.text === "string" ? a.text : "", e.user, a.kind === "photo");
    // a build that failed (not a reply Muse chose): at most one friend reacts, once
    if (a.t === "tool-failed" && (a.code === "failed" || a.code === "too_slow" || a.code === undefined && a.text === undefined)) this.#onFailed(chat, String(a.id));
  }

  #onFailed(chat: string, id: string) {
    if (this.#failedSaid.has(id) || !this.#watched(chat)) return;
    this.#failedSaid.add(id);
    const r = this.#r(`failed:${id}`);
    const sims = this.#simIn(chat);
    if (!sims.length || !r.chance(this.#talk(0.5))) return;
    const who = r.pick(sims);
    let said: string | null = null;
    for (let i = 0; i < 4 && (!said || this.#repeat(chat, said)); i++) said = line("failed", persona(who), {}, r);
    if (said) this.#say(who, chat, said, this.#d(r.range(2000, 4500)));
  }

  #onRealMessage(chat: string, msgId: string, text: string, from: string, photo: boolean) {
    if (!this.#watched(chat)) return;
    const st = this.#chat(chat);
    const sims = this.#simIn(chat);
    if (!st || !sims.length) return;
    const dm = st.kind === "dm";
    const r = this.#r(`real:${chat}:${msgId}`);
    for (const who of sims) if (r.chance(0.9)) this.#read(who, chat, this.#d(skewed(r, ...persona(who).notice)));
    const sit: Situation | null = photo ? "laugh" : intent(text, dm);
    if (sit === null) {
      // An ask to Muse: someone might give it a thumbs up while it builds.
      const who = r.pick(sims);
      if (r.chance(this.#talk(0.3))) this.#at(who, chat, "react", this.#d(r.range(1500, 4000)), () => this.#sendReact(who, chat, msgId, "👍"));
      return;
    }
    // Quiet when the chat has been busy: friends do not answer every line.
    const busy = (this.#windows.get(`m:${chat}`) ?? []).filter((t) => this.clock.now() - t < 60_000).length;
    const order = r.pick([sims, [...sims].reverse()]);
    let replies = 0;
    let at = 0;
    for (const who of order) {
      const p = persona(who);
      const want = dm ? 0.85 : this.#talk(p.chatty * 0.6) * (busy >= 4 ? 0.3 : 1);
      if (replies >= (dm ? 1 : 2) || !r.chance(want)) continue;
      replies++;
      at = Math.max(at + this.#d(r.range(1500, 4000)), this.#d(skewed(r, ...p.notice)));
      const delay = at;
      if (this.o.model && (sit === "other" || sit === "question" || sit === "dm")) {
        const tail = st.messages.filter((m) => m.kind === "text").slice(-8).map((m) => ({ from: persona(m.from).first, text: m.text ?? "" }));
        this.o.model(p, tail, text).then(
          (out) => {
            const said = out && voiceOk(out) ? out : line(sit, p, {}, r);
            if (said) this.#say(who, chat, said, Math.max(0, delay - 2000));
          },
          () => {},
        );
      } else {
        const said = line(sit, p, {}, r);
        if (said) this.#say(who, chat, said, delay);
      }
      // Burst: a second short line now and then.
      if (!dm && r.chance(0.15 * SPEEDS[this.speed].talk)) {
        const more = line(sit === "laugh" ? "laugh" : "other", p, {}, r);
        if (more) this.#say(who, chat, more, delay + this.#d(r.range(2500, 4500)));
      }
    }
    if (sit === "laugh" || photo || r.chance(0.12)) {
      const fan = r.pick(sims);
      this.#at(fan, chat, "react", this.#d(r.range(1200, 4500)), () => this.#sendReact(fan, chat, msgId, persona(fan).react[r.chance(0.7) ? 0 : 1]));
    }
  }

  // --- tools ------------------------------------------------------------------------------

  #trackTool(chat: string, id: string, code: string, at: number) {
    const tool: Tool = { id, chat, realm: null, replica: null, landedAt: at, recent: [], acts: [], lastApp: null, lastRandomAt: -Infinity, summary: "", finished: false, done: 0, planned: new Set(), busy: null };
    this.#tools.set(id, tool);
    try {
      tool.realm = new ToolRealm(code, toolRoom(id));
    } catch (e) {
      if (this.#sab.has("unguarded")) throw e;
      tool.broken = e instanceof RealmError ? e.message : String(e);
      this.#note("@cast", toolRoom(id), "tool-broken", `left alone: ${tool.broken}`);
      return;
    }
    const realm = tool.realm;
    const reducer: Reducer<FoldJson> = { init: () => realm.init(), reduce: (f, a, m) => realm.reduce(f, a, m) };
    let first = true;
    tool.replica = this.#open(this.#watch, toolRoom(id), "@cast", reducer, undefined, (e, live) => this.#onToolEntry(tool, e, live));
    tool.replica.subscribe(() => {
      const f = tool.replica!.confirmed;
      try {
        tool.recent.push(JSON.stringify(JSON.parse(f).s));
      } catch {}
      if (tool.recent.length > 20) tool.recent.shift();
      const summary = realm.summary(f);
      const prog = progress(summary);
      const was = tool.finished;
      tool.summary = summary;
      tool.finished = prog.finished;
      if (first) {
        first = false;
        tool.done = prog.done;
        return;
      }
      if (!was && prog.finished) this.#celebrate(tool);
      else if (prog.done > tool.done && !prog.finished) this.#progressLine(tool, prog.done, prog.total);
      tool.done = prog.done;
    });
    // A tool that just landed (not one from the seeded history) gets the friends' attention.
    // Tools seeded before the cast started are history, even when their timestamp is recent or (a
    // seeded line written for later today) in the future.
    const age = this.clock.now() - at;
    if (age >= 0 && age < 120_000 && at >= this.#t0) this.#plan(tool, "landed");
  }

  #onToolEntry(tool: Tool, e: Entry, live: boolean) {
    const a = e.action as Record<string, unknown> | null;
    const t = a && typeof a === "object" && typeof a.t === "string" ? a.t : "";
    if (!t || t.startsWith("@")) return;
    const ours = this.#isOurs(e.client);
    tool.acts.push({ who: e.user, t, at: e.time, cast: ours });
    tool.lastApp = { user: e.user, time: e.time };
    if (/spin|roll|draw|shuffle|flip/i.test(t)) tool.lastRandomAt = e.time;
    if (!live) return;
    const real = this.#human(e.user) && !ours;
    if (real) {
      this.#markReal(e.user, "used a tool");
      // Someone real used it: the others take a look too.
      this.#plan(tool, "real");
    }
  }

  /** Who looks at the tool and when. */
  #plan(tool: Tool, why: "landed" | "real") {
    if (!tool.realm || tool.finished) return;
    const r = this.#r(`plan:${tool.id}:${why}:${tool.acts.length}`);
    const sims = this.#simIn(tool.chat).filter((p) => !tool.planned.has(p));
    if (!sims.length) return;
    const order = r.chance(0.5) ? sims : [...sims].reverse();
    const keen = order.filter((p) => r.chance(this.#talk(persona(p).keen)));
    for (const p of order) if (keen.length < Math.min(2, order.length) && !keen.includes(p)) keen.push(p);
    let at = this.#d(skewed(r, 4000, 11000));
    for (const who of keen) {
      tool.planned.add(who);
      this.#toolTurn(who, tool.id, at, 0);
      at += this.#d(r.range(4500, 9000));
    }
    // one line per Mini landing (never per update, retry or change), and not one said a moment ago
    if (why === "landed" && !this.#landedSaid.has(tool.id) && r.chance(this.#talk(0.55))) {
      this.#landedSaid.add(tool.id);
      const who = r.pick(order);
      let said: string | null = null;
      for (let i = 0; i < 6 && (!said || this.#repeat(tool.chat, said)); i++) said = line("landed", persona(who), {}, r);
      if (said && !this.#repeat(tool.chat, said)) this.#say(who, tool.chat, said, this.#d(r.range(1500, 3500)));
    }
    // Members reach a tool through its log; if no phone has recorded them yet, the cast does.
    this.#at(order[0]!, tool.chat, "members", 2500, () => this.#members_(tool, order[0]!), false);
  }

  #members_(tool: Tool, who: string) {
    const f = tool.replica?.confirmed;
    if (!f || !tool.replica?.live) return;
    try {
      if ((JSON.parse(f).members as unknown[]).length > 0) return;
    } catch {
      return;
    }
    const members: Member[] = this.#members(tool.chat).map((m) => ({ id: m, name: persona(m).first }));
    const room = this.#toolReplica(who, tool);
    if (room) this.#outbox(who, toolRoom(tool.id), "members", { t: "@members", members }, () => room.dispatch({ t: "@members", members }));
  }

  #toolReplica(who: string, tool: Tool): SyncReplica<FoldJson> | null {
    const a = this.#actors.get(who);
    if (!a || !tool.realm) return null;
    let r = a.tools.get(tool.id);
    if (!r) {
      const realm = tool.realm;
      r = this.#open(a.socket, toolRoom(tool.id), who, { init: () => realm.init(), reduce: (f, x, m) => realm.reduce(f, x, m) });
      a.tools.set(tool.id, r);
    }
    return r;
  }

  /** One look at the tool by one person: act, wait if it is too early to finish, or leave it. */
  #toolTurn(who: string, toolId: string, delay: number, tries: number) {
    // Open the room ahead, so the action is not waiting on a welcome.
    const tool = this.#tools.get(toolId);
    if (tool) this.#toolReplica(who, tool);
    this.#at(who, tool?.chat ?? null, "tool", delay, () => {
      const tool = this.#tools.get(toolId);
      if (!tool?.realm || !tool.replica?.live || tool.finished) return;
      if (!this.#watched(tool.chat)) return;
      const p = persona(who);
      const now = this.clock.now();
      // Someone else is mid-move: look again once they are done.
      if (tool.busy && tool.busy.who !== who && now < tool.busy.until) {
        if (tries < 8) this.#toolTurn(who, toolId, tool.busy.until - now + this.#d(2500), tries + 1);
        return;
      }
      const r = this.#r(`${who}:tool:${toolId}:${tool.acts.length}:${tries}`);
      const st = this.#chat(tool.chat);
      const name = st?.messages.find((m) => m.tool?.id === toolId)?.tool?.name ?? "";
      const choice = this.#sab.has("reckless") ? { action: tool.realm.arbitrary(tool.replica.confirmed, who, r.int(2 ** 32)), score: 1, verb: null, finishes: false, why: "raw" } : choose(tool.realm, tool.replica.confirmed, p, r, {
        recent: tool.recent,
        mine: tool.acts.filter((a) => a.who === who),
        others: tool.acts.filter((a) => a.who !== who && a.at >= tool.landedAt).length,
        age: now - tool.landedAt,
        holdMs: this.#d(16_000),
        lastRandomAt: tool.lastRandomAt,
        now,
        head: tool.replica.head,
        members: this.#members(tool.chat),
        food: /eat|food|dinner|lunch|where|hungry/i.test(name + " " + tool.summary),
      });
      if (!choice) return;
      if (!choice.action) {
        if (tries < 6) this.#toolTurn(who, toolId, this.#d(r.range(3500, 6500)), tries + 1);
        return;
      }
      const room = this.#toolReplica(who, tool);
      if (!room) return;
      const seen = tool.acts.length;
      const act = () => {
        tool.busy = null;
        // The tool moved on while they were typing: think again instead of tapping blind.
        if (tool.acts.length !== seen || tool.finished) {
          if (!tool.finished && tries < 8) this.#toolTurn(who, toolId, this.#d(r.range(2000, 4000)), tries + 1);
          return;
        }
        const sent = this.#outbox(who, toolRoom(toolId), "tool", choice.action as Record<string, unknown>, () => room.dispatch(choice.action));
        if (!sent) return;
        if (/spin|random/.test(choice.why)) tool.lastRandomAt = this.clock.now();
        this.#at(who, tool.chat, "summary", 900, () => this.#summary(who, tool), false);
        // Some people come back for a second go (an idea, then a vote).
        if (r.chance(p.ideas * 0.6)) this.#toolTurn(who, toolId, this.#d(r.range(9000, 20000)), 0);
      };
      // Now and then a few words first ("spinning", "adding ramen"), then the tap.
      const verb = choice.verb;
      const sit = verb === "spin" ? "spin" : verb === "add" ? "add" : verb === "in" ? "in" : verb === "maybe" ? "maybe" : null;
      const say = sit && r.chance(this.#talk(p.chatty * (sit === "spin" ? 0.9 : 0.5))) ? line(sit, p, choice.idea ? { idea: choice.idea } : {}, r) : null;
      if (say) {
        tool.busy = { who, until: now + this.#d(12_000) };
        this.#say(who, tool.chat, say, 0, () => this.#at(who, tool.chat, "tool", this.#d(r.range(900, 2000)), act));
      } else act();
    });
  }

  /** The chat's activity line for a tool, as the shell writes it after a tap. */
  #summary(who: string, tool: Tool) {
    const a = this.#actors.get(who);
    const room = a?.chats.get(tool.chat);
    if (!room || !tool.realm || !tool.replica || !tool.lastApp || tool.changed) return;
    const text = tool.realm.summary(tool.replica.confirmed);
    const stored = room.state.tools[tool.id];
    const { user: by, time: at } = tool.lastApp;
    if (stored && stored.summary === text && stored.last?.by === by && stored.last?.at === at) return;
    const action = { t: "tool-summary", id: tool.id, text, by, at };
    this.#outbox(who, chatRoom(tool.chat), "summary", action, () => room.dispatch(action));
  }

  /** The tool settled on something: one friend says so, another reacts to it. */
  #celebrate(tool: Tool) {
    if (!this.#watched(tool.chat)) return;
    const r = this.#r(`done:${tool.id}`);
    const sims = this.#simIn(tool.chat);
    if (!sims.length) return;
    const pick = resultOf(tool.summary);
    const who = r.pick(sims);
    const facts: Facts = pick ? { pick } : {};
    const said = line(pick ? "result" : "done", persona(who), facts, r);
    const fan = sims.find((s) => s !== who);
    if (said)
      this.#say(who, tool.chat, said, this.#d(r.range(3200, 5500)), (msgId) => {
        if (fan) this.#at(fan, tool.chat, "react", this.#d(r.range(1200, 3500)), () => this.#sendReact(fan, tool.chat, msgId, persona(fan).react[0]));
      });
  }

  #progressLine(tool: Tool, done: number, total: number) {
    const r = this.#r(`progress:${tool.id}:${done}`);
    if (!this.#watched(tool.chat) || !r.chance(this.#talk(0.25))) return;
    const who = r.pick(this.#simIn(tool.chat));
    if (!who) return;
    const said = line("progress", persona(who), { done: String(done), total: String(total) }, r);
    if (said) this.#say(who, tool.chat, said, this.#d(r.range(2500, 6000)));
  }
}

/** A line as letters only, for spotting a repeat under a typo or an apostrophe. */
const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();

/** Equal, or one letter apart (the cast's typos change one letter). */
export function near1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1);
}

function describe(a: Record<string, unknown>): string {
  switch (a.t) {
    case "msg":
      return a.kind === "link" ? `shared a link` : `said "${String(a.text ?? "")}"`;
    case "react":
      return `reacted ${a.emoji}`;
    case "read":
      return "read the chat";
    case "tool-summary":
      return `activity line "${String(a.text ?? "").slice(0, 60)}"`;
    case "@members":
      return "recorded the chat's members in the tool";
    case "chat":
      return "listed a new chat";
    case "create":
      return `made the group "${String(a.name ?? "")}"`;
    default: {
      const rest = Object.entries(a).filter(([k]) => k !== "t").map(([k, v]) => `${k} ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
      return `tool: ${String(a.t)}${rest ? ` (${rest.slice(0, 80)})` : ""}`;
    }
  }
}
