// Shared pieces for the runtime stages: the simulated room, meta stamping, the runtime's fold
// (input guard, throw as no-op, @members, onMembers; packages/app/src/runtime.ts), input
// freezing, invariant and transition checks, and garbage actions.
//
// A room state is the runtime's fold, `{ s, members, started }`, so its canonical form matches
// what every client holds.

import { isAction, membersOf, sameMembers, type Folded } from "@muse/app/internal";
import { brief, canonical, clone, deepFreeze, findNonJson } from "../json.ts";
import type { Loaded } from "../sandbox.ts";

export const USERS = ["u1", "u2", "u3"] as const;
/** Everyone who may be in the chat; membership changes pick from these. */
export const POOL = [
  { id: "u1", name: "Maya" },
  { id: "u2", name: "Leo" },
  { id: "u3", name: "Ana" },
  { id: "u4", name: "Sam" },
];
export const MEMBERS = POOL.slice(0, 3);
export const ROOM = "a:gate";
export const T0 = 1_760_000_000_000;

/** Member list for a non-zero 4-bit mask over POOL. */
export const membersFor = (mask: number) => POOL.filter((_, i) => (mask >> i) & 1);

export type Member = { id: string; name: string };
export type Meta = { seq: number; user: string; time: number; seed: number };
export type W = Folded<unknown>;
export type Cmd =
  | { k: "act"; u: number; s: number; lag: number }
  | { k: "garbage"; u: number; g: number; s: number }
  | { k: "members"; mask: number }
  | { k: "deliver"; u: number }
  | { k: "recv"; u: number }
  | { k: "drop"; u: number }
  | { k: "rejoin"; u: number };
export type Case = { seed: number; cmds: Cmd[] };

/** How an action came to be: proposed by `arbitrary`, made up by the fuzzer, or the host's. */
export type Kind = "act" | "garbage" | "system";

export type Bad = { rule: string; message: string; detail?: Record<string, unknown> };
/** `canon` is the canonical JSON of `state`, kept so callers can hash it without re-serializing. */
export type Outcome = { ok: true; state: W; canon: string } | ({ ok: false } & Bad);

export function hash32(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function serverMeta(runSeed: number, seq: number, user: string): Meta {
  return { seq, user, time: T0 + seq * 1000 + (hash32(runSeed, seq) % 997), seed: hash32(runSeed, seq + 0x10000) };
}

export class Room {
  private ctxCache = new Map<string, unknown>();
  constructor(
    readonly L: Loaded,
    readonly maxStateBytes: number,
  ) {}

  /** Frozen, realm-local ctx for a member list. */
  ctx(members: readonly Member[]): unknown {
    const key = members.map((m) => m.id).join(",");
    let c = this.ctxCache.get(key);
    if (!c) {
      c = deepFreeze(this.L.toRealm({ room: ROOM, members }));
      this.ctxCache.set(key, c);
    }
    return c;
  }

  /** The runtime's start: init with no members. */
  initEmpty(): Outcome {
    let s: unknown;
    try {
      s = this.L.app.init(this.ctx([]));
    } catch (e) {
      return { ok: false, rule: "init-throws", message: `init threw with no members: ${errText(e)}. init runs before the member list arrives.` };
    }
    return this.wrap(s, [], false, "init");
  }

  /** The runtime's start followed by the host's first @members entry. */
  init(members: readonly Member[] = MEMBERS): Outcome {
    const e = this.initEmpty();
    if (!e.ok) return e;
    return this.reduce(e.state, { t: "@members", members }, serverMeta(0, 0, "host"), "system");
  }

  wrap(s: unknown, members: readonly Member[], started: boolean, where: string): Outcome {
    const bad = findNonJson(s);
    if (bad) return { ok: false, rule: "state-json", message: `${where} returned state that is not plain JSON: ${bad}` };
    const w = { s, members: members as Member[], started } as W;
    const canon = canonical(w);
    if (canon.length > this.maxStateBytes)
      return { ok: false, rule: "state-size", message: `${where} produced state of ${canon.length} bytes, over the ${this.maxStateBytes} byte limit` };
    return { ok: true, state: deepFreeze(w), canon };
  }

  /**
   * One step of the runtime's fold. Throws from `reduce` are no-ops for garbage and failures for
   * actions from `arbitrary`. Input mutation and non-JSON results fail either way.
   */
  reduce(w: W, action: unknown, meta: Meta, kind: Kind): Outcome {
    const members = membersOf(action);
    if (members) {
      if (sameMembers(members, w.members)) return { ok: true, state: w, canon: canonical(w) };
      const c = this.ctx(members);
      const fn = w.started ? this.L.app.onMembers : this.L.app.init;
      let s: unknown = w.s;
      try {
        if (fn) s = w.started ? this.L.app.onMembers!(w.s, c) : this.L.app.init(c);
      } catch (e) {
        return { ok: false, rule: "members-throws", message: `${w.started ? "onMembers" : "init"} threw when the member list changed: ${errText(e)}` };
      }
      return this.wrap(s, members, w.started, w.started ? "onMembers" : "init");
    }
    if (!isAction(action) || action.t.startsWith("@")) return { ok: true, state: w, canon: canonical(w) };
    const a = deepFreeze(this.L.toRealm(action));
    const m = deepFreeze(this.L.toRealm(meta));
    const c = this.ctx(w.members);
    let out: unknown;
    try {
      out = this.L.app.reduce(w.s, a, m, c);
    } catch (e) {
      // Was it a write to a frozen input? Re-run on thawed copies and look for changes.
      const s2 = this.L.toRealm(clone(w.s));
      const a2 = this.L.toRealm(action);
      const m2 = this.L.toRealm(meta);
      const before = canonical([s2, a2, m2]);
      try {
        this.L.app.reduce(s2, a2, m2, c);
      } catch {}
      if (canonical([s2, a2, m2]) !== before)
        return { ok: false, rule: "reduce-mutates-input", message: `reduce changed its input instead of returning a new state (${errText(e)})` };
      if (kind === "garbage") return { ok: true, state: w, canon: canonical(w) };
      return {
        ok: false,
        rule: "reduce-throws",
        message: `reduce threw on an action from arbitrary: ${errText(e)}. Actions arbitrary proposes must never throw; an invalid one returns the same state.`,
      };
    }
    if (out && typeof out === "object" && typeof (out as { then?: unknown }).then === "function")
      return { ok: false, rule: "state-json", message: "reduce returned a Promise; it must be synchronous" };
    if (out === w.s) return { ok: true, state: w, canon: canonical(w) };
    return this.wrap(out, w.members, true, "reduce");
  }

  /** The first failing invariant, or null. Invariants that throw or return non-booleans fail. */
  checkInvariants(w: W): { name: string; message: string } | null {
    const inv = this.L.app.invariants ?? {};
    for (const name of Object.keys(inv)) {
      const r = this.runInvariant(name, w);
      if (r !== true) return { name, message: r };
    }
    return null;
  }

  /** true when the invariant holds, else a reason. */
  runInvariant(name: string, w: W): true | string {
    try {
      return verdict(this.L.app.invariants![name]!(w.s, this.ctx(w.members)));
    } catch (e) {
      return `threw: ${errText(e)}`;
    }
  }

  transitionNames(): string[] {
    return Object.keys(this.L.app.transitions ?? {});
  }

  /** Transitions apply to app actions that reached reduce (not to @members or dropped input). */
  appliesTo(action: unknown): boolean {
    return isAction(action) && !action.t.startsWith("@");
  }

  runTransition(name: string, prev: W, next: W, action: unknown, meta: Meta): true | string {
    try {
      const fn = this.L.app.transitions![name]!;
      return verdict(fn(prev.s, next.s, this.L.toRealm(action), this.L.toRealm(meta), this.ctx(prev.members)));
    } catch (e) {
      return `threw: ${errText(e)}`;
    }
  }

  /** The first failing transition for a step, or null. */
  checkTransitions(prev: W, next: W, action: unknown, meta: Meta): { name: string; message: string } | null {
    if (!this.appliesTo(action)) return null;
    for (const name of this.transitionNames()) {
      const r = this.runTransition(name, prev, next, action, meta);
      if (r !== true) return { name, message: r };
    }
    return null;
  }

  /** A plausible action from the app, or a Bad when arbitrary misbehaves. */
  arbitrary(w: W, user: string, seed: number): { ok: true; action: unknown } | ({ ok: false } & Bad) {
    const fn = this.L.app.arbitrary;
    if (typeof fn !== "function") return { ok: false, rule: "arbitrary-missing", message: "defineApp has no `arbitrary`" };
    let a: unknown;
    try {
      a = fn(w.s, user, this.L.rng(seed), this.ctx(w.members));
    } catch (e) {
      return { ok: false, rule: "arbitrary-throws", message: `arbitrary threw: ${errText(e)}` };
    }
    if (a === undefined) a = null;
    const bad = a === null ? null : findNonJson(a, "action");
    if (bad) return { ok: false, rule: "arbitrary-json", message: `arbitrary returned an action that is not plain JSON: ${bad}` };
    return { ok: true, action: clone(a) };
  }

  summary(w: W): Bad | null {
    const sum = this.L.app.summary;
    if (typeof sum !== "function") return null;
    let text: unknown;
    try {
      text = sum(w.s, this.ctx(w.members));
    } catch (e) {
      return { rule: "summary", message: `summary threw: ${errText(e)}` };
    }
    if (typeof text !== "string" || !text.trim()) return { rule: "summary", message: `summary returned ${brief(text, 60)}, expected a non-empty string` };
    return null;
  }
}

const verdict = (v: unknown): true | string => (v === true ? true : v === false ? "returned false" : `returned ${brief(v, 40)} instead of a boolean`);

/** Garbage actions. Kinds 0-6 are never valid; 7+ mangle the type of one field of a real action. */
export const GARBAGE_KINDS = 10;
export function garbage(kind: number, seed: number, real: unknown): unknown {
  switch (kind) {
    case 0: return null;
    case 1: return 42;
    case 2: return "garbage";
    case 3: return [];
    case 4: return {};
    case 5: return { t: "__garbage__", type: "__garbage__", kind: "__garbage__" };
    case 6: return { t: ["nested"], type: { deep: true } };
  }
  if (!real || typeof real !== "object" || Array.isArray(real)) return { t: "__garbage__" };
  const obj = clone(real) as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => k !== "t").sort();
  if (!keys.length) return { ...obj, t: "__garbage__" };
  const key = keys[seed % keys.length]!;
  const v = obj[key];
  // Wrong types, and right types with values no UI would send.
  if (typeof v === "number") obj[key] = kind === 7 ? "7" : kind === 8 ? -1e9 : 0.5;
  else if (typeof v === "string") obj[key] = kind === 7 ? 7 : kind === 8 ? { x: 1 } : "";
  else if (typeof v === "boolean") obj[key] = "yes";
  else if (v === null) obj[key] = { x: 1 };
  else obj[key] = kind % 2 ? "x" : null;
  return obj;
}

export function errText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
