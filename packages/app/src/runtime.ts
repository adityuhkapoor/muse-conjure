// How the runtime folds an app's log (docs/CONTRACTS.md section 3, membership and reducer input).
// Pure and DOM-free: the frame and tests use it, and packages/verify mirrors it.
//
// - `{ t: "@members", members }` is a system action: the runtime keeps the list and passes it as
//   ctx.members. Until the first app action changes state, each one re-runs `init` with the new
//   list; after that it calls `onMembers` (default: state unchanged).
// - Any other action that is not a plain object with a string `t`, or whose `t` starts with "@",
//   is dropped. If `reduce` (or `onMembers`) throws, the step is a no-op.

import type { Member, Meta, Reducer } from "@muse/protocol";
import type { AppDef, Ctx, Json } from "./types.ts";

export type Folded<S> = {
  /** The app's state. */
  s: S;
  members: Member[];
  /** True once an app action changed `s`; from then on member changes go to onMembers. */
  started: boolean;
};

export const MEMBERS = "@members";
const MAX_MEMBERS = 250;

/** The runtime's input guard: a plain object with a string `t`. */
export function isAction(a: unknown): a is { t: string } {
  return typeof a === "object" && a !== null && !Array.isArray(a) && typeof (a as { t?: unknown }).t === "string";
}

/** The member list carried by a valid `@members` action, normalized; null when invalid. */
export function membersOf(a: unknown): Member[] | null {
  if (!isAction(a) || a.t !== MEMBERS) return null;
  const list = (a as { members?: unknown }).members;
  if (!Array.isArray(list) || list.length > MAX_MEMBERS) return null;
  const out: Member[] = [];
  const seen = new Set<string>();
  for (const m of list) {
    if (typeof m !== "object" || m === null) return null;
    const { id, name, avatar } = m as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof name !== "string" || seen.has(id)) return null;
    if (avatar !== undefined && typeof avatar !== "string") return null;
    seen.add(id);
    out.push(avatar === undefined ? { id, name } : { id, name, avatar });
  }
  return out;
}

export function sameMembers(a: readonly Member[], b: readonly Member[]): boolean {
  return a.length === b.length && a.every((m, i) => m.id === b[i]!.id && m.name === b[i]!.name && m.avatar === b[i]!.avatar);
}

type AnyApp = AppDef<Json, Json, object>;

/** The sync reducer for an app instance in `room`. */
export function appReducer<S extends Json>(def: AppDef<S, any, any>, room: string, onError?: (e: unknown) => void): Reducer<Folded<S>> {
  const app = def as unknown as AnyApp;
  const ctxOf = (members: Member[]): Ctx => ({ room, members });
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (e) {
      onError?.(e);
      return fallback;
    }
  };
  return {
    init: () => ({ s: app.init(ctxOf([])) as S, members: [], started: false }),
    reduce(f, action, meta: Meta) {
      const members = membersOf(action);
      if (members) {
        if (sameMembers(members, f.members)) return f;
        const ctx = ctxOf(members);
        const s = f.started ? safe(() => (app.onMembers ? (app.onMembers(f.s, ctx) as S) : f.s), f.s) : safe(() => app.init(ctx) as S, f.s);
        return { s, members, started: f.started };
      }
      if (!isAction(action) || action.t.startsWith("@")) return f;
      const s = safe(() => app.reduce(f.s, action as Json, meta, ctxOf(f.members)) as S, f.s);
      return s === f.s ? f : { s, members: f.members, started: true };
    },
  };
}
