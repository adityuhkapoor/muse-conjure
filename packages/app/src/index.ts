// @muse/app: the API generated apps are written against. See ../API.md.

import type { AppDef, Json } from "./types.ts";

export type { AppDef, Ctx, Json, Rng, Theme, ViewProps, VNode } from "./types.ts";
export type { InitCtx, Member, Meta } from "@muse/protocol";
export type { Child, Component } from "./h.ts";
export type { Motion, Bezier } from "./motion.ts";
export type { Draw, DrawFrame } from "./ctx.ts";
export type { PointerInfo, RsvpValue } from "./components.ts";
export type { ColorName } from "./theme.ts";
export type { Signal, ReadonlySignal } from "./signal.ts";

export { h, Fragment } from "./h.ts";
export { signal, computed, effect } from "./signal.ts";
export { rng } from "./rng.ts";
export { spring, tween, springs, easings } from "./motion.ts";
export { clock, haptic, running } from "./ctx.ts";
export { color, userColor } from "./theme.ts";
export { Button, OptionRow, Facepile, Avatar, Progress, CardHeader, Rsvp, Toast, SystemLine, Canvas } from "./components.ts";
// The art kit (see API.md, "Make it look made for this moment").
export {
  Scene, Placed, More, Chip, at, crowd, mix, pal, seedOf, innerWidth, circle, rect, ellipse, line, path, fitText, textWidth,
  Thumb, thumbKind, THUMB_KINDS, SeatMap, Graph, MapStrip, Clusters,
  Ring, Meter, Sparkline, Stars, AvatarBars, Timeline, CalendarStrip, HeatGrid,
  Ticket, Receipt, PlayingCard, BingoGrid, Burst, Changed, Locked, Summary, Expand, Strip,
} from "./art/index.ts";
export type { ThumbKind, Zone, Edge, Thread, Pin, Fit, Measurer } from "./art/index.ts";

/** Declare an app. Returns `def` unchanged; the type parameters check every part against State, Action and Local. */
export function defineApp<S extends Json, A extends Json, L extends object = Record<string, Json>>(def: AppDef<S, A, L>): AppDef<S, A, L> {
  return def;
}
