// A late joiner must be able to take part. Generic check for any app: start with two people,
// let a third join through onMembers, then ask `arbitrary` for that person's actions and require
// that at least one changes the state when the reducer runs it as them.

import { rng, type Json } from "@muse/app";

type Member = { id: string; name: string };
// Loosely typed on purpose: every piece has its own State and Action.
type App = {
  init(ctx: { room: string; members: Member[] }): Json;
  reduce(s: never, a: never, m: { seq: number; user: string; time: number; seed: number }, ctx: { room: string; members: Member[] }): Json;
  onMembers?(s: never, ctx: { room: string; members: Member[] }): Json;
  arbitrary(s: never, user: string, r: ReturnType<typeof rng>, ctx: { room: string; members: Member[] }): Json | null;
  invariants: Record<string, (s: never, ctx: { room: string; members: Member[] }) => boolean>;
};

export const U1: Member = { id: "u1", name: "Maya" };
export const U2: Member = { id: "u2", name: "Leo" };
export const NEW: Member = { id: "u9", name: "Noor" };
const room = "a:test";

/** Fold: init with two people, add a third, run `steps` actions from the others first so there is history. */
export function afterJoin(app: App, steps = 3) {
  const before = { room, members: [U1, U2] };
  const after = { room, members: [U1, U2, NEW] };
  let s = app.init(before);
  let seq = 1;
  const meta = (user: string, seed: number) => ({ seq: seq++, user, time: 1_760_000_000_000 + seq * 5000, seed });
  for (let i = 0; i < steps; i++) {
    const user = i % 2 ? U2.id : U1.id;
    const a = app.arbitrary(s as never, user, rng(100 + i), before);
    if (a) s = app.reduce(s as never, a as never, meta(user, 1000 + i), before);
  }
  s = app.onMembers ? app.onMembers(s as never, after) : s;
  return { s, ctx: after, meta };
}

/** True when some action the newcomer proposes changes the state, and every invariant still holds. */
export function joinerCanAct(app: App): boolean {
  const { s, ctx, meta } = afterJoin(app);
  for (const [name, inv] of Object.entries(app.invariants)) if (!inv(s as never, ctx)) throw new Error(`invariant "${name}" fails right after someone joins`);
  for (let seed = 1; seed <= 60; seed++) {
    const a = app.arbitrary(s as never, NEW.id, rng(seed), ctx);
    if (!a) continue;
    const next = app.reduce(s as never, a as never, meta(NEW.id, seed * 7919), ctx);
    if (JSON.stringify(next) !== JSON.stringify(s)) return true;
  }
  return false;
}
