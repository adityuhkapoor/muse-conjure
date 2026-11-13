// Runtime context the frame fills in: who is here, the host clock, canvases to draw, haptics.

import type { Member } from "@muse/protocol";
import { signal, watched } from "./signal.ts";
import type { Theme } from "./theme.ts";

/**
 * Server-aligned clock in ms, same base as meta.time. Opt-in: the host sends ticks only while
 * something reads `clock.value` or a Canvas asks for another frame, so read it only while
 * something moves (see `running`).
 */
export const clock = signal(0);

export const ctx = {
  members: [] as Member[],
  theme: undefined as Theme | undefined,
  /** Server-aligned now, between ticks too. The frame sets it. */
  now: () => clock.peek(),
  haptic: (_kind: "light" | "medium" | "success") => {},
};

/** Ask the host for a haptic tap (phones only; a no-op elsewhere). */
export function haptic(kind: "light" | "medium" | "success" = "light"): void {
  ctx.haptic(kind);
}

/**
 * Ms since `start` while that is under `ms` (the view re-renders every frame meanwhile),
 * otherwise null without subscribing to the clock. `start` is a server time such as meta.time.
 */
export function running(start: number, ms: number): number | null {
  if (ctx.now() - start >= ms) return null;
  return Math.min(ms - 1, Math.max(0, clock.value - start));
}

export type DrawFrame = { now: number; width: number; height: number; theme: Theme };
export type Draw = (c: CanvasRenderingContext2D, f: DrawFrame) => boolean | void;
type Cv = HTMLCanvasElement & { _d?: Draw; _done?: Draw; _live?: boolean };

const canvases = new Set<Cv>();
export const addCanvas = (c: Element) => void canvases.add(c as Cv);

/** True while the frame needs ticks: the clock is read, or a canvas is animating. */
export function wantsClock(): boolean {
  if (watched(clock)) return true;
  for (const c of canvases) if (c._live && c.isConnected) return true;
  return false;
}

/** Draw canvases whose `draw` changed, or that asked for another frame by returning true. */
export function paintCanvases(now = clock.peek()): void {
  for (const c of canvases) {
    if (!c.isConnected) {
      if (c._done) canvases.delete(c);
      continue;
    }
    if (!c._live && c._done === c._d) continue;
    const r = window.devicePixelRatio || 1, w = c.clientWidth, hgt = c.clientHeight;
    // Not laid out yet (its frame is not rendered, or it has no room): nothing would show, and a
    // drawing scaled to a 0 size goes negative (an arc's radius) and throws. It draws once it has a size.
    if (w === 0 || hgt === 0) continue;
    if (c.width !== Math.round(w * r) || c.height !== Math.round(hgt * r)) {
      c.width = Math.round(w * r);
      c.height = Math.round(hgt * r);
    }
    const g = c.getContext("2d");
    if (!g || !c._d || !ctx.theme) continue;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, w, hgt);
    c._done = c._d;
    c._live = c._d(g, { now, width: w, height: hgt, theme: ctx.theme }) === true;
  }
}

export function memberOf(user: string | Member): Member {
  if (typeof user !== "string") {
    // a Mini that builds `{ id, name }` itself still gets the member's photo the host passed
    if (user.avatar) return user;
    const known = ctx.members.find((m) => m.id === user.id);
    return known?.avatar ? { ...user, avatar: known.avatar } : user;
  }
  return ctx.members.find((m) => m.id === user) ?? { id: user, name: user };
}
