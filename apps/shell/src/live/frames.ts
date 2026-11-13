// ADAPTER: the sandbox. Owns the warm frame pool and turns "show tool X here" into a mounted
// frame. The shell never evaluates app code: it posts the compiled module to a frame on another
// origin and pipes the app room's wire messages between that frame and the shared socket. The
// frame runs its own @muse/sync replica (it says hello, folds, resends).
//
// The pipe is tapped, read only, so the shell knows who acted last and whether our own actions
// are still waiting for the server (for the summary line in the chat).

import { reloadFor } from "./config";
import { createPool, type AppHandle, type Pool } from "@muse/sandbox";
import { makeTheme } from "@muse/app/theme";
import type { Theme } from "@muse/app";
import type { C2S, Entry, Member, S2C } from "@muse/protocol";
import type { Transport } from "@muse/sync";
import type { Socket } from "./socket";
import { rid } from "./socket";

let pool: Pool | null = null;

/**
 * Frames load from the first URL that answers (the frame port, then this origin's fallback path).
 * Frames are sandboxed without allow-same-origin, so a frame from this origin is still opaque.
 */
/** `build`: the demo start this page was served by; a frame from another start reloads the page. */
export function initFrames(frameUrls: string[], build?: string, size = 2) {
  pool ??= createPool({
    size,
    frameUrls,
    ...(build ? { build, onStale: (other: string) => reloadFor(other, "tool frames come from a newer start of the demo") } : {}),
    fallbackMs: 3000,
    onFallback: (url) => {
      document.documentElement.dataset.frameFallback = "1";
      console.info(`Tool frames: the frame port did not answer, so frames load from ${url} instead.`);
    },
  });
  // "layer" where Element.moveBefore is missing (Safari, WKWebView): frames sit in a layer over
  // their slots. The shell's CSS and cards adapt to it (see Thread.svelte, MuseCard.svelte, app.css).
  document.documentElement.dataset.frames = pool.mode;
}

export const frameMode = () => pool?.mode ?? null;

export const themeFor = (dark: boolean, width: number): Theme => makeTheme(dark ? "dark" : "light", Math.round(width), "chat");

export type Mounted = {
  setTheme(dark: boolean, width: number): void;
  setMembers(members: Member[]): void;
  /** Our actions sent and not yet in the log. */
  readonly unconfirmed: number;
  /** The last app action in the log (system actions such as @members left out). */
  readonly last: Entry | undefined;
  destroy(): void;
};

export type MountArgs = {
  el: HTMLElement;
  code: string;
  socket: Socket;
  room: string;
  me: string;
  members: Member[];
  dark: boolean;
  width: number;
  onSize(h: number): void;
  onSummary(text: string): void;
  /** a new entry reached this room */
  onEntry?(): void;
  /** `fatal`: the tool has nothing to show; otherwise it keeps its last good render. */
  onError?(message: string, fatal: boolean): void;
  /**
   * Another mount of the same room took over (the server keeps one subscription per room per
   * socket, so two frames cannot share a room in one tab). `wait(cb)` queues this mount: `cb`
   * runs when the room is free again and this mount is the newest visible waiter. Returns a
   * function that leaves the queue.
   */
  onEvicted?(wait: (cb: () => void, visible?: () => boolean) => () => void): void;
  /**
   * Can the person see this card now (not covered by another page, not display: none, not scrolled
   * out of view)? The room's frame goes to a card they can see: a card they cannot see lets go of
   * it when a visible one wants it, and takes it back when it becomes the visible one.
   */
  visible?(): boolean;
};

type Owner = { evict: () => void; visible: () => boolean };

const active = new Map<string, Owner>();
/** Mounts that lost their room, oldest first. The newest visible one gets the room back when its owner lets go. */
const waiting = new Map<string, { cb: () => void; visible: () => boolean }[]>();

function release(room: string) {
  if (active.has(room)) return;
  const q = waiting.get(room);
  if (!q?.length) return;
  const i = q.findLastIndex((w) => w.visible());
  if (i < 0) return;
  const [w] = q.splice(i, 1);
  w!.cb();
}

let watcher: ReturnType<typeof setInterval> | undefined;

/** The room's frame follows visibility: with no owner, the newest visible waiter takes it; an owner nobody can see lets go to a visible waiter. */
function rebalance(room: string) {
  const q = waiting.get(room);
  if (!q?.some((w) => w.visible())) return;
  const owner = active.get(room);
  if (!owner) return release(room);
  if (!owner.visible()) owner.evict();
}

/** Visibility changes (a page opening over another, a scroll) have no event that reaches every card, so while any card waits for a frame it is looked at four times a second. */
function watch() {
  if (watcher) return;
  watcher = setInterval(() => {
    let any = false;
    for (const [room, q] of waiting) {
      if (!q.length) continue;
      any = true;
      rebalance(room);
    }
    if (!any) {
      clearInterval(watcher);
      watcher = undefined;
    }
  }, 250);
}

const isSystem = (a: unknown) => typeof a === "object" && a !== null && typeof (a as { t?: unknown }).t === "string" && (a as { t: string }).t.startsWith("@");

function queue(room: string, cb: () => void, visible: () => boolean): () => void {
  const w = { cb, visible };
  waiting.set(room, [...(waiting.get(room) ?? []), w]);
  watch();
  return () => waiting.set(room, (waiting.get(room) ?? []).filter((x) => x !== w));
}

export function mountTool(a: MountArgs): Mounted {
  if (!pool) throw new Error("frames not initialised");
  const prev = active.get(a.room);
  // a card nobody can see does not take the room from one they can: it waits like an evicted one
  if (prev && a.visible && a.onEvicted && prev.visible() && !a.visible()) {
    const stub: Mounted = { setTheme() {}, setMembers() {}, unconfirmed: 0, last: undefined, destroy() {} };
    queueMicrotask(() => a.onEvicted?.((cb, visible = () => true) => queue(a.room, cb, visible)));
    return stub;
  }
  active.delete(a.room);
  prev?.evict();
  const client = rid("f-");
  const sent = new Set<number>();
  let last: Entry | undefined;
  const inner = a.socket.transport(a.room);
  // The tap: everything passes through unchanged.
  const transport: Transport = {
    start: (h) =>
      inner.start({
        open: () => h.open(),
        close: () => h.close(),
        message: (m: S2C) => {
          const seen = m.t === "welcome" ? m.entries : m.t === "entry" ? [m.entry] : [];
          for (const e of seen) {
            if (e.client === client) sent.delete(e.cseq);
            if (!isSystem(e.action) && (!last || e.seq > last.seq)) last = e;
          }
          h.message(m);
          if (seen.length) a.onEntry?.();
        },
      }),
    send: (m: C2S) => {
      if (m.t === "act" && !isSystem(m.action)) sent.add(m.cseq);
      inner.send(m);
    },
    stop: () => inner.stop(),
  };
  const handle: AppHandle = pool.mount(a.el, { code: a.code, room: a.room, me: a.me, client, members: a.members, theme: themeFor(a.dark, a.width), transport });
  handle.frame.setAttribute("scrolling", "no");
  const offs = [
    handle.onSize((h) => a.onSize(h)),
    handle.onSummary((t) => a.onSummary(t)),
    handle.onError((e) => {
      console.warn("tool error", a.room, e.message);
      try {
        navigator.sendBeacon?.("/client-log", `tool error room=${a.room}${e.fatal ? " fatal" : ""} msg=${e.message.slice(0, 300)} hidden=${document.hidden} frames=${document.querySelectorAll("iframe").length} ua=${navigator.userAgent.slice(-60)}`);
      } catch {}
      a.onError?.(e.message, !!e.fatal);
    }),
  ];
  let alive = true;
  const destroy = () => {
    if (!alive) return;
    alive = false;
    offs.forEach((f) => f());
    handle.destroy();
    if (active.get(a.room) === me) {
      active.delete(a.room);
      release(a.room);
    }
  };
  const me = {
    evict: () => {
      destroy();
      a.onEvicted?.((cb, visible = () => true) => queue(a.room, cb, visible));
    },
    visible: () => {
      try {
        return a.visible ? a.visible() : true;
      } catch {
        return false;
      }
    },
  };
  active.set(a.room, me);
  return {
    setTheme: (dark, width) => alive && handle.setTheme(themeFor(dark, width)),
    setMembers: (members) => alive && handle.setMembers(members),
    get unconfirmed() {
      return sent.size;
    },
    get last() {
      return last;
    },
    destroy,
  };
}
