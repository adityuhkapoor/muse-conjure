// Comments on feed posts, the runtime half (the written threads are comments.ts). What a viewer
// writes goes into the synced feed room `t:feed-home`, the same room new posts and their likes use,
// as `comment` and `comment-like` actions (live/comments-reducer.ts). Everyone on Home folds the same
// log, so a comment is on the other phone within the room's round trip. The seeded threads are
// read-only history; likes on them are the room's `commentLikes`, keyed by the seeded comment's id.
//
// With the fake store (no server) comments stay on this phone.

import type { Person } from "../store/types";
import { viewerId } from "../lib/media";
import { store } from "../store";
import { EXTRA_PEOPLE } from "../store/extras";
import { ui } from "../lib/ui.svelte";
import { liveConfig, wsUrl } from "../live/config";
import { openSocket, rid } from "../live/socket";
import { openRoom, type Room } from "../live/rooms";
import { chatReducer, emptyChat, type ChatState } from "../live/chat-reducer";
import type { WireComment } from "../live/comments-reducer";
import { FEED_ROOM } from "../muse/compose-live.svelte";
import { who } from "./flows.svelte";
import { ago } from "./time";
import { seededFor } from "./comments";

/** What opening a post's comments needs to know. */
export type Target = { id: string; likes: number };

export type Row = {
  id: string;
  by: string;
  text: string;
  ago: string;
  likes: number;
  liked: boolean;
  /** which reaction faces the pill shows */
  faces: ("like" | "love")[];
  replies: Row[];
  pending: boolean;
  /** written by a viewer: shown exactly as typed (no mention tags); only the seeded threads carry `{@id}` tags */
  typed: boolean;
};

/** Longest comment, the same limit the feed reducer enforces (live/comments-reducer.ts). */
export const MAX_COMMENT = 1000;
/** Most line breaks a comment keeps. */
export const MAX_LINES = 8;
/** The counter shows from here on. */
export const COUNTER_FROM = 900;

/** Typed text as it will be sent: line endings unified, blank runs squeezed, line count capped, trimmed. */
export function cleanComment(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().split("\n");
  return lines.slice(0, MAX_LINES).join("\n").trim();
}

/** Top-level comments shown before "View more comments", and added by each press. */
export const PAGE = 7;

const myWire = () => (store as unknown as { myId?: string }).myId ?? viewerId();
// A comment keeps its author's wire id, seeded or typed; `who` shows the viewer's own as theirs.
const toView = (w: string) => w;
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);

/** Anyone who can write a comment: the cast, the strangers, the extras (wire ids). */
export function commenter(id: string): Person | undefined {
  return who(id) ?? EXTRA_PEOPLE.find((p) => p.id === id);
}

export type Piece = { text: string } | { tag: string };

/** A comment's text with `{@id}` shown as the person's name. */
export function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const m of text.matchAll(/\{@([\w-]+)\}/g)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push({ tag: commenter(m[1]!)?.name ?? m[1]! });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

class CommentsLive {
  /** phone: the post whose comments are in the sheet */
  sheet = $state<Target | null>(null);
  /** desktop: posts whose thread is open under them */
  inline = $state<string[]>([]);
  /** comments whose replies are showing */
  expanded = $state<Record<string, boolean>>({});
  now = $state(Date.now());

  #feed: Room<ChatState> | null = null;
  /** true once the room is open; reactive, so counts read before it opened re-read the room */
  #joined = $state(false);
  #feedState = $state.raw<ChatState>(emptyChat());
  #local = $state<WireComment[]>([]);
  #localLikes = $state<Record<string, string[]>>({});
  #localPostLikes = $state<Record<string, string[]>>({});
  #ticker = 0;

  constructor() {
    const self = this;
    (window as unknown as { __museComments: unknown }).__museComments = {
      /** comments written for a post plus the ones added since, replies included */
      size: (id: string) => seededFor(id).length + self.#added(id).length,
      get connected() {
        return !!self.#feed;
      },
    };
  }

  /** Opens the feed room once (live only). Cheap to call from every post. */
  connect() {
    if (!this.#ticker) this.#ticker = window.setInterval(() => (this.now = Date.now()), 30_000);
    if (this.#feed || !store.live || !liveConfig) return;
    const room = openRoom(openSocket(wsUrl()), FEED_ROOM, myWire(), chatReducer);
    this.#feed = room;
    this.#joined = true;
    const update = () => (this.#feedState = room.state);
    room.subscribe(update);
    update();
  }

  // ---------------------------------------------------------------- opening

  open(t: Target) {
    this.connect();
    if (ui.desktop) this.inline = this.inline.includes(t.id) ? this.inline.filter((x) => x !== t.id) : [...this.inline, t.id];
    else this.sheet = t;
  }
  close(id?: string) {
    if (id) this.inline = this.inline.filter((x) => x !== id);
    else this.sheet = null;
  }
  isInline = (id: string) => this.inline.includes(id);

  // ---------------------------------------------------------------- reading

  #wire(): WireComment[] {
    return this.#joined ? (this.#feedState.comments ?? []) : this.#local;
  }
  #likes(): Record<string, string[]> {
    return this.#joined ? (this.#feedState.commentLikes ?? {}) : this.#localLikes;
  }
  #postLikes(): Record<string, string[]> {
    return this.#joined ? (this.#feedState.postLikes ?? {}) : this.#localPostLikes;
  }
  /** A post's likes: what it says plus the people who liked it here (each person once). */
  postLikeCount(post: string, base: number): number {
    return base + (this.#postLikes()[post]?.length ?? 0);
  }
  postLiked(post: string): boolean {
    return (this.#postLikes()[post] ?? []).includes(myWire());
  }
  /** Likes the post, or takes the like back. */
  togglePostLike(post: string) {
    this.connect();
    if (this.#feed) return this.#feed.dispatch({ t: "post-like", id: post });
    const now = this.#localPostLikes[post] ?? [];
    this.#localPostLikes = { ...this.#localPostLikes, [post]: now.includes(myWire()) ? now.filter((x) => x !== myWire()) : [...now, myWire()] };
  }

  #added = (post: string) => this.#wire().filter((c) => c.post === post);

  /** The post's comment count: the written comments (replies included) plus every comment added since. Computed from the thread, never typed. */
  count(post: string): number {
    return seededFor(post).length + this.#added(post).length;
  }

  /** The thread as rows: written comments first, then new ones, replies one level under their comment. */
  thread(post: string): Row[] {
    const likes = this.#likes();
    const ok = new Set(this.#joined ? (this.#feedState.comments ?? []).map((c) => c.id) : []);
    const row = (id: string, by: string, text: string, ms: number, base: number, pending = false, typed = false): Row => {
      const l = likes[id] ?? [];
      const n = base + l.length;
      return {
        id,
        by,
        text,
        ago: ms < 60_000 ? "Just now" : ago(ms),
        likes: n,
        liked: l.includes(myWire()),
        faces: n >= 6 && hash(id) % 2 === 0 ? ["like", "love"] : ["like"],
        replies: [],
        pending,
        typed,
      };
    };
    const tops: Row[] = [];
    const byId = new Map<string, Row>();
    const parentOf = new Map<string, string>();
    for (const s of seededFor(post)) {
      const r = row(s.id, s.by, s.text, s.ago, s.likes);
      byId.set(s.id, r);
      if (s.parent) (byId.get(s.parent) ?? tops[0])!.replies.push(r);
      else tops.push(r);
      if (s.parent) parentOf.set(s.id, s.parent);
    }
    for (const c of [...this.#added(post)].sort((a, b) => a.at - b.at)) {
      const r = row(c.id, toView(c.from), c.text, Math.max(0, this.now - c.at), 0, this.#joined ? !ok.has(c.id) : false, true);
      const top = c.replyTo ? (parentOf.get(c.replyTo) ?? c.replyTo) : undefined;
      const host = top ? byId.get(top) : undefined;
      byId.set(c.id, r);
      if (host) {
        host.replies.push(r);
        parentOf.set(c.id, host.id);
      } else tops.push(r);
    }
    return tops;
  }

  // ---------------------------------------------------------------- writing

  /** Adds the viewer's comment, now. A reply opens its parent's replies. Returns the new id. */
  add(post: string, text: string, replyTo?: string): string | null {
    const body = cleanComment(text);
    if (!body || body.length > MAX_COMMENT) return null;
    if (this.#wire().length >= 500) return null; // the feed room keeps at most 500 comments (live/comments-reducer.ts)
    const id = rid("c-");
    if (this.#feed) this.#feed.dispatch({ t: "comment", id, post, text: body, ...(replyTo ? { replyTo } : {}) });
    else this.#local = [...this.#local, { id, post, from: myWire(), text: body, at: Date.now(), ...(replyTo ? { replyTo } : {}) }];
    if (replyTo) {
      const top = this.thread(post).find((r) => r.id === replyTo || r.replies.some((x) => x.id === replyTo));
      if (top) this.expanded = { ...this.expanded, [top.id]: true };
    }
    return id;
  }

  like(id: string) {
    if (this.#feed) return this.#feed.dispatch({ t: "comment-like", id });
    const now = this.#localLikes[id] ?? [];
    const next = now.includes(myWire()) ? now.filter((x) => x !== myWire()) : [...now, myWire()];
    this.#localLikes = { ...this.#localLikes, [id]: next };
  }

  toggleReplies(id: string) {
    this.expanded = { ...this.expanded, [id]: !this.expanded[id] };
  }
}

export const comments = new CommentsLive();
