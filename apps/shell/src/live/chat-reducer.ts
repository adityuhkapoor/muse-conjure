// The trusted chat reducer: one per chat room `t:<chatId>`, plus the directory room `t:index`.
// Pure and deterministic (time from meta.time, no randomness), so every phone folds the same log
// to the same chat. Shared by the shell (live store) and the seeder (services/demo).

import type { Meta, Reducer } from "@muse/protocol";
import { addComment, toggleCommentLike, togglePostLike, type WireComment } from "./comments-reducer";

/** The seeder posts as this user and may set `as` and `at` on its actions. Nobody else can. */
export const SEED_USER = "@seed";

export type WireReaction = { emoji: string; by: string[] };

export type WireTool = {
  id: string;
  name: string;
  /** set while Muse is building; the card shows the building state */
  building?: boolean;
  /** compiled app module; absent while building */
  code?: string;
  /** who asked */
  by: string;
  /** what was asked, for the building card */
  ask?: string;
  /** bumped by each change in place ("tool-update"); frames remount when it moves */
  rev?: number;
  /** the app room when it is not `a:<id>` (a change that started the tool's state over) */
  room?: string;
  /** set while Muse is changing the tool; people can keep using it */
  changing?: { by: string; ask: string; at: number };
};

export type WireMsg = {
  id: string;
  from: string;
  kind: "text" | "photo" | "link" | "muse" | "system";
  text?: string;
  at: number;
  replyTo?: string;
  photo?: { tone: 1 | 2 | 3; label: string; asset?: string };
  link?: { site: string; title: string; description: string; eventId?: string };
  reactions: WireReaction[];
  tool?: WireTool;
  /** a Mini Muse offers with a reply (tool-failed with chip): tapping it makes that Mini */
  chip?: { id: string; name: string };
};

/** One activity line: who acted, when, and the app's summary right after (or a line the seeder wrote). */
export type ToolActivity = { by: string; at: number; text: string; /** a line written by the seeder: kept as is */ fixed?: boolean };
export type ToolLive = { summary: string; last: { by: string; at: number } | null; log?: ToolActivity[] };

/** Within this window a second action by the same person replaces their line instead of adding one. */
export const ACTIVITY_WINDOW_MS = 3 * 60_000;
const MAX_ACTIVITY = 20;

export type ChatState = {
  created: boolean;
  name: string;
  kind: "group" | "dm";
  key?: string;
  members: string[];
  messages: WireMsg[];
  /** user -> id of the last message they read, and when */
  reads: Record<string, { msg: string; at: number }>;
  /** per tool id: the app's own one-line summary and who acted last */
  tools: Record<string, ToolLive>;
  /** feed room only: comments on posts, and who liked which comment (comments-reducer.ts) */
  comments?: WireComment[];
  commentLikes?: Record<string, string[]>;
  /** feed room only: who liked which seeded Home post */
  postLikes?: Record<string, string[]>;
};

export type ChatAction =
  | { t: "create"; name: string; kind: "group" | "dm"; members: string[]; key?: string }
  | { t: "msg"; id: string; kind?: "text" | "photo" | "link" | "system"; text?: string; replyTo?: string; photo?: WireMsg["photo"]; link?: WireMsg["link"]; as?: string; at?: number }
  | { t: "react"; msg: string; emoji: string; once?: boolean; as?: string }
  | { t: "read"; msg: string; as?: string; at?: number }
  | { t: "join"; who: string[] }
  | { t: "tool-pending"; id: string; title: string; ask: string }
  | { t: "tool"; id: string; name: string; summary: string; code: string; by?: string; as?: string; at?: number }
  | { t: "tool-failed"; id: string; /** Muse's one-line reply when it made no tool on purpose */ text?: string; /** a Mini offered with the reply */ chip?: { id: string; name: string }; /** why (the factory's reason code; the cast reacts to failed builds) */ code?: string }
  | { t: "tool-changing"; id: string; ask: string; as?: string }
  | { t: "tool-update"; id: string; name: string; summary: string; code: string; room?: string }
  | { t: "tool-change-end"; id: string }
  | { t: "tool-summary"; id: string; text: string; by: string | null; at: number | null; line?: string }
  | { t: "comment"; id: string; post: string; text: string; replyTo?: string; as?: string; at?: number }
  | { t: "comment-like"; id: string; as?: string }
  | { t: "post-like"; id: string; as?: string };

export const FAILED_TEXT = "Muse couldn't make that. Try again";

const MAX_TEXT = 4000;
const isObj = (a: unknown): a is Record<string, unknown> => typeof a === "object" && a !== null && !Array.isArray(a);
const str = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

export function emptyChat(): ChatState {
  return { created: false, name: "", kind: "group", members: [], messages: [], reads: {}, tools: {} };
}

function who(a: Record<string, unknown>, meta: Meta): string {
  return meta.user === SEED_USER && str(a.as) ? a.as : meta.user;
}
function when(a: Record<string, unknown>, meta: Meta): number {
  return meta.user === SEED_USER && typeof a.at === "number" && Number.isFinite(a.at) ? a.at : meta.time;
}
const mapMsg = (s: ChatState, id: string, fn: (m: WireMsg) => WireMsg): ChatState => ({ ...s, messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) });

export function reduceChat(s: ChatState, action: unknown, meta: Meta): ChatState {
  if (!isObj(action) || typeof action.t !== "string") return s;
  const a = action;
  switch (a.t) {
    case "create": {
      if (s.created || !str(a.name) || (a.kind !== "group" && a.kind !== "dm") || !Array.isArray(a.members)) return s;
      const members = [...new Set([meta.user === SEED_USER ? null : meta.user, ...a.members].filter((m): m is string => str(m)))];
      return { ...s, created: true, name: a.name, kind: a.kind, members, ...(str(a.key) ? { key: a.key } : {}) };
    }
    case "join": {
      if (!Array.isArray(a.who)) return s;
      const add = a.who.filter((m): m is string => str(m) && !s.members.includes(m));
      return add.length ? { ...s, members: [...s.members, ...new Set(add)] } : s;
    }
    case "msg": {
      if (!str(a.id) || s.messages.some((m) => m.id === a.id)) return s;
      const kind = a.kind === "photo" || a.kind === "link" || a.kind === "system" ? a.kind : "text";
      if (kind === "text" && !str(a.text, MAX_TEXT)) return s;
      const m: WireMsg = { id: a.id, from: kind === "system" ? "system" : who(a, meta), kind, at: when(a, meta), reactions: [] };
      if (str(a.text, MAX_TEXT)) m.text = a.text;
      if (str(a.replyTo) && s.messages.some((x) => x.id === a.replyTo)) m.replyTo = a.replyTo;
      if (kind === "photo" && isObj(a.photo)) m.photo = a.photo as WireMsg["photo"];
      if (kind === "link" && isObj(a.link)) m.link = a.link as WireMsg["link"];
      return { ...s, messages: [...s.messages, m] };
    }
    case "react": {
      if (!str(a.msg) || !str(a.emoji, 16)) return s;
      const me = who(a, meta);
      const emoji = a.emoji;
      const once = a.once === true;
      return mapMsg(s, a.msg, (m) => {
        const mine = m.reactions.find((r) => r.by.includes(me));
        if (mine?.emoji === emoji && once) return m;
        // One reaction per person, like Messenger: drop my other emoji first.
        let reactions = m.reactions.map((r) => (r.by.includes(me) ? { ...r, by: r.by.filter((x) => x !== me) } : r));
        if (mine?.emoji !== emoji) {
          const slot = reactions.find((r) => r.emoji === emoji);
          reactions = slot ? reactions.map((r) => (r === slot ? { ...r, by: [...r.by, me] } : r)) : [...reactions, { emoji, by: [me] }];
        }
        return { ...m, reactions: reactions.filter((r) => r.by.length > 0) };
      });
    }
    case "read": {
      if (!str(a.msg) || !s.messages.some((m) => m.id === a.msg)) return s;
      const me = who(a, meta);
      const prev = s.reads[me];
      const idx = (id: string) => s.messages.findIndex((m) => m.id === id);
      if (prev && idx(prev.msg) >= idx(a.msg)) return s;
      return { ...s, reads: { ...s.reads, [me]: { msg: a.msg, at: when(a, meta) } } };
    }
    case "comment":
      return addComment(s, a, who(a, meta), when(a, meta));
    case "comment-like":
      return toggleCommentLike(s, a, who(a, meta));
    case "post-like":
      return togglePostLike(s, a, who(a, meta));
    case "tool-pending": {
      if (!str(a.id) || s.messages.some((m) => m.id === a.id)) return s;
      const tool: WireTool = { id: a.id, name: str(a.title) ? a.title : "Something", building: true, by: meta.user, ...(str(a.ask, 500) ? { ask: a.ask } : {}) };
      return { ...s, messages: [...s.messages, { id: a.id, from: "muse", kind: "muse", at: meta.time, reactions: [], tool }] };
    }
    case "tool": {
      if (!str(a.id) || !str(a.name, 80) || typeof a.code !== "string" || !a.code) return s;
      const existing = s.messages.find((m) => m.id === a.id);
      // A finished tool is final: a second "tool" or a late failure never replaces it.
      if (existing && !existing.tool?.building) return s;
      const by = existing?.tool?.by ?? (str(a.by) ? a.by : who(a, meta));
      const tool: WireTool = { id: a.id, name: a.name, code: a.code, by };
      const at = existing?.at ?? when(a, meta);
      const msg: WireMsg = { id: a.id, from: "muse", kind: "muse", at, reactions: existing?.reactions ?? [], tool };
      const tools = { ...s.tools, [a.id]: { summary: typeof a.summary === "string" ? a.summary.slice(0, 200) : "", last: { by, at } } };
      return { ...s, tools, messages: existing ? s.messages.map((m) => (m.id === a.id ? msg : m)) : [...s.messages, msg] };
    }
    case "tool-changing": {
      if (!str(a.id)) return s;
      const existing = s.messages.find((m) => m.id === a.id);
      if (!existing?.tool || existing.tool.building) return s;
      const changing = { by: who(a, meta), ask: str(a.ask, 500) ? a.ask : "", at: meta.time };
      return mapMsg(s, a.id, (m) => ({ ...m, tool: { ...m.tool!, changing } }));
    }
    case "tool-update": {
      // A change in place: same message, new code (and a fresh app room when state started over).
      if (!str(a.id) || !str(a.name, 80) || typeof a.code !== "string" || !a.code) return s;
      const existing = s.messages.find((m) => m.id === a.id);
      if (!existing?.tool || existing.tool.building) return s;
      const prev = existing.tool;
      const tool: WireTool = { id: prev.id, name: a.name, code: a.code, by: prev.by, rev: (prev.rev ?? 0) + 1 };
      const room = str(a.room) ? a.room : prev.room;
      if (room) tool.room = room;
      const live = s.tools[a.id];
      const summary = typeof a.summary === "string" && a.summary ? a.summary.slice(0, 200) : (live?.summary ?? "");
      return { ...mapMsg(s, a.id, (m) => ({ ...m, tool })), tools: { ...s.tools, [a.id]: { ...(live ?? { last: null }), summary } } };
    }
    case "tool-change-end": {
      if (!str(a.id)) return s;
      const existing = s.messages.find((m) => m.id === a.id);
      if (!existing?.tool?.changing) return s;
      return mapMsg(s, a.id, (m) => {
        const { changing: _, ...tool } = m.tool!;
        return { ...m, tool };
      });
    }
    case "tool-failed": {
      if (!str(a.id)) return s;
      const existing = s.messages.find((m) => m.id === a.id);
      if (!existing?.tool?.building) return s;
      if (str(a.text, 300)) {
        const chip = isObj(a.chip) && str(a.chip.id, 60) && str(a.chip.name, 60) ? { id: a.chip.id, name: a.chip.name } : null;
        return mapMsg(s, a.id, (m) => ({ id: m.id, from: "muse", kind: "text", text: a.text as string, at: m.at, reactions: [], ...(chip ? { chip } : {}) }));
      }
      return mapMsg(s, a.id, (m) => ({ id: m.id, from: "system", kind: "system", text: FAILED_TEXT, at: m.at, reactions: [] }));
    }
    case "tool-summary": {
      if (!str(a.id) || typeof a.text !== "string" || !s.tools[a.id]) return s;
      const prev = s.tools[a.id]!;
      const last = str(a.by) && typeof a.at === "number" ? { by: a.by, at: a.at } : prev.last;
      if (prev.summary === a.text && prev.last?.by === last?.by && prev.last?.at === last?.at) return s;
      const text = (str(a.line) ? a.line : a.text).slice(0, 200);
      let log = prev.log ?? [];
      // A new action (not the summary catching up on the same one) adds a line, or replaces the
      // same person's line from a moment ago, so a burst of taps reads as one line.
      if (last && (last.by !== prev.last?.by || last.at !== prev.last?.at)) {
        const top = log.at(-1);
        const entry: ToolActivity = { by: last.by, at: last.at, text, ...(str(a.line) ? { fixed: true } : {}) };
        log = top && top.by === last.by && last.at >= top.at && last.at - top.at < ACTIVITY_WINDOW_MS ? [...log.slice(0, -1), entry] : [...log, entry].slice(-MAX_ACTIVITY);
      } else if (last && log.at(-1)?.by === last.by && log.at(-1)?.at === last.at && !log.at(-1)!.fixed) {
        log = [...log.slice(0, -1), { ...log.at(-1)!, text }];
      }
      return { ...s, tools: { ...s.tools, [a.id]: { summary: a.text.slice(0, 200), last, log } } };
    }
  }
  return s;
}

export const chatReducer: Reducer<ChatState> = { init: () => emptyChat(), reduce: reduceChat };

// --- directory room `t:index`: which chats exist ------------------------------------------------

export type IndexEntry = { id: string; key?: string };
export type IndexState = { chats: IndexEntry[]; seeded: boolean };
export type IndexAction = { t: "chat"; id: string; key?: string } | { t: "seeded" };

export function reduceIndex(s: IndexState, action: unknown, _meta: Meta): IndexState {
  if (!isObj(action)) return s;
  if (action.t === "seeded") return s.seeded ? s : { ...s, seeded: true };
  if (action.t !== "chat" || !str(action.id, 80)) return s;
  const id = action.id;
  if (s.chats.some((c) => c.id === id || (str(action.key) && c.key === action.key))) return s;
  return { ...s, chats: [...s.chats, { id, ...(str(action.key) ? { key: action.key } : {}) }] };
}

export const indexReducer: Reducer<IndexState> = { init: () => ({ chats: [], seeded: false }), reduce: reduceIndex };

export const INDEX_ROOM = "t:index";
export const chatRoom = (id: string) => `t:${id}`;
export const toolRoom = (id: string) => `a:${id}`;
/** The app room a tool message runs in: its own `a:<id>` unless a change started it over in another. */
export const roomOfTool = (t: Pick<WireTool, "id" | "room">) => t.room ?? toolRoom(t.id);
/** A chat made from something else ("event:juniper") gets an id from its key, so two phones agree. */
export const chatIdForKey = (key: string) => "k-" + key.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
