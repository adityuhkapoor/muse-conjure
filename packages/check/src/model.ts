// The model a tool is checked in: the runtime's fold (docs/CONTRACTS.md section 3), the scope
// (users, seeds, ticks), stable hashing, and the abstraction of action payloads.
//
// A world is the runtime's fold `{ s, members, started }`, the same shape every replica holds.
// The app runs in the gate's vm sandbox (packages/verify/src/sandbox.ts, imported read-only), so
// Date and Math.random drift and intrinsics are frozen exactly as at gate time.

import { isAction, membersOf, sameMembers } from "../../app/src/runtime.ts";
import { compileModule } from "../../verify/src/compile.ts";
import { canonical, deepFreeze, findNonJson } from "../../verify/src/json.ts";
import { loadApp, type Loaded } from "../../verify/src/sandbox.ts";

export type Member = { id: string; name: string };
export type Meta = { seq: number; user: string; time: number; seed: number };
export type World = { s: unknown; members: Member[]; started: boolean };

export const NAMES = ["Maya", "Leo", "Ana", "Sam", "Noa", "Kai"];
export const ROOM = "a:check";
/** Saturday 2025-06-14 22:30 UTC, so the third tick crosses a day boundary. */
export const T0 = Date.UTC(2025, 5, 14, 22, 30, 0);

export const pool = (n: number): Member[] => Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}`, name: NAMES[i]! }));

/** Pick seeds whose first rng draw lands near each quantile, so pick/int see first, middle, last. */
export function spreadSeeds(L: Loaded, n: number): number[] {
  const want = Array.from({ length: n }, (_, i) => (i + 0.5) / n);
  const out: number[] = [];
  for (const q of want) {
    let best = 1, d = 2;
    for (let s = 1; s < 4000; s++) {
      const v = (L.rng(s * 2654435761 >>> 0) as { next(): number }).next();
      if (Math.abs(v - q) < d) (d = Math.abs(v - q)), (best = s * 2654435761 >>> 0);
    }
    out.push(best);
  }
  return out;
}

/** 64-bit FNV-1a in two 32-bit lanes over a string: the same in every JS engine. */
export function hash64(s: string): string {
  let a = 0x811c9dc5, b = 0x050c5d1f ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
    b ^= b >>> 15;
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

export type Bad = { rule: string; message: string; detail?: Record<string, unknown> };
export type Step = { ok: true; w: World; canon: string; threw?: boolean } | ({ ok: false } & Bad);

export const errText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));

export type AppDefLike = {
  name?: unknown;
  init: (ctx: unknown) => unknown;
  reduce: (s: unknown, a: unknown, m: unknown, ctx: unknown) => unknown;
  onMembers?: (s: unknown, ctx: unknown) => unknown;
  invariants?: Record<string, (s: unknown, ctx: unknown) => unknown>;
  transitions?: Record<string, (p: unknown, n: unknown, a: unknown, m: unknown, ctx: unknown) => unknown>;
  arbitrary?: (s: unknown, u: string, r: unknown, ctx: unknown) => unknown;
  /** Proposed contract addition: every action this user could take now. */
  actions?: (s: unknown, u: string, ctx: unknown) => unknown;
  /** Proposed contract addition: the tool is done; nothing but a reset should change it. */
  finished?: (s: unknown, ctx: unknown) => unknown;
  view?: (props: unknown) => unknown;
  local?: unknown;
};

export function load(input: string | { js: string }, nonce = 1): Loaded {
  let js: string;
  if (typeof input === "string") {
    const c = compileModule(input);
    if (!c.ok) throw new Error(`compile: ${c.message}`);
    js = c.js;
  } else js = input.js;
  return loadApp(js, nonce);
}

/** The runtime's fold over one app, with the gate's hygiene checks on every call. */
export class Tool {
  readonly app: AppDefLike;
  private ctxCache = new Map<string, unknown>();
  constructor(readonly L: Loaded, readonly maxStateBytes: number) {
    this.app = L.app as unknown as AppDefLike;
  }

  ctx(members: readonly Member[]): unknown {
    const key = members.map((m) => m.id).join(",");
    let c = this.ctxCache.get(key);
    if (!c) this.ctxCache.set(key, (c = deepFreeze(this.L.toRealm({ room: ROOM, members }))));
    return c;
  }

  wrap(s: unknown, members: Member[], started: boolean, where: string): Step {
    const bad = findNonJson(s);
    if (bad) return { ok: false, rule: "json", message: `${where} returned state that is not plain JSON: ${bad}` };
    const w: World = { s, members, started };
    const canon = canonical(w);
    if (canon.length > this.maxStateBytes) return { ok: false, rule: "json", message: `${where} produced ${canon.length} bytes of state, over the ${this.maxStateBytes} byte limit` };
    return { ok: true, w: deepFreeze(w), canon };
  }

  initEmpty(): Step {
    try {
      return this.wrap(this.app.init(this.ctx([])), [], false, "init");
    } catch (e) {
      return { ok: false, rule: "init-throws", message: `init threw with no members: ${errText(e)}` };
    }
  }

  /** The host's @members entry. */
  members(w: World, members: Member[]): Step {
    if (sameMembers(members, w.members)) return { ok: true, w, canon: canonical(w) };
    const c = this.ctx(members);
    let s: unknown;
    try {
      s = w.started ? (this.app.onMembers ? this.app.onMembers(w.s, c) : w.s) : this.app.init(c);
    } catch (e) {
      return { ok: false, rule: "members-throws", message: `${w.started ? "onMembers" : "init"} threw when the member list changed: ${errText(e)}` };
    }
    return this.wrap(s, members, w.started, w.started ? "onMembers" : "init");
  }

  /**
   * One app action through the runtime's rules: non-objects and `@` actions are dropped, a throw
   * is a no-op (`threw` set so callers can tell garbage from arbitrary). Purity: run twice on
   * deep-frozen inputs and compare; a write to a frozen input is found by a thawed re-run.
   */
  private realmActs = new WeakMap<object, unknown>();
  private realmMetas = new Map<string, unknown>();
  /** Frozen copy of an action in the app's realm, cached by identity (actions are reused). */
  realmAction(action: unknown): unknown {
    if (!action || typeof action !== "object") return action;
    let r = this.realmActs.get(action);
    if (r === undefined) this.realmActs.set(action, (r = deepFreeze(this.L.toRealm(action))));
    return r;
  }
  realmMeta(m: Meta): unknown {
    const k = `${m.seq}|${m.user}|${m.time}|${m.seed}`;
    let r = this.realmMetas.get(k);
    if (r === undefined) {
      if (this.realmMetas.size > 50_000) this.realmMetas.clear();
      this.realmMetas.set(k, (r = deepFreeze(this.L.toRealm(m))));
    }
    return r;
  }

  reduce(w: World, action: unknown, meta: Meta, purity = true, preCanon?: string): Step {
    if (membersOf(action)) return this.members(w, membersOf(action)!);
    const same = (): Step => ({ ok: true, w, canon: preCanon ?? canonical(w) });
    if (!isAction(action) || action.t.startsWith("@")) return same();
    const a = this.realmAction(action);
    const m = this.realmMeta(meta);
    const c = this.ctx(w.members);
    let out: unknown;
    try {
      out = this.app.reduce(w.s, a, m, c);
    } catch (e) {
      const s2 = this.L.toRealm(JSON.parse(JSON.stringify(w.s)));
      const a2 = this.L.toRealm(action), m2 = this.L.toRealm(meta);
      const before = canonical([s2, a2, m2]);
      try {
        this.app.reduce(s2, a2, m2, c);
      } catch {}
      if (canonical([s2, a2, m2]) !== before) return { ok: false, rule: "purity", message: `reduce changed its input instead of returning a new state (${errText(e)})` };
      return { ...same(), threw: true, error: errText(e) } as Step;
    }
    if (out === w.s) return same();
    const r = this.wrap(out, w.members, true, "reduce");
    if (!r.ok || !purity) return r;
    let again: unknown;
    try {
      again = this.app.reduce(w.s, a, m, c);
    } catch (e) {
      return { ok: false, rule: "purity", message: `reduce gave a state the first time and threw the second time on the same input: ${errText(e)}` };
    }
    if (!deepEqual(again, out))
      return { ok: false, rule: "purity", message: "reduce returned different states for the same input twice. Look for module-level variables, Date or Math.random.", detail: { first: r.canon.slice(0, 300), second: canonical(again).slice(0, 300) } };
    return r;
  }

  invariantNames(): string[] {
    return Object.keys(this.app.invariants ?? {});
  }
  transitionNames(): string[] {
    return Object.keys(this.app.transitions ?? {});
  }

  /** Names of invariants that do not hold (throwing or non-boolean counts as failing). */
  brokenInvariants(w: World): { name: string; why: string }[] {
    const out: { name: string; why: string }[] = [];
    const c = this.ctx(w.members);
    for (const [name, fn] of Object.entries(this.app.invariants ?? {})) {
      let v: unknown;
      try {
        v = fn(w.s, c);
      } catch (e) {
        out.push({ name, why: `threw: ${errText(e)}` });
        continue;
      }
      if (v !== true) out.push({ name, why: v === false ? "returned false" : `returned ${String(v)}` });
    }
    return out;
  }

  brokenTransitions(prev: World, next: World, action: unknown, meta: Meta): { name: string; why: string }[] {
    if (!isAction(action) || action.t.startsWith("@")) return [];
    const out: { name: string; why: string }[] = [];
    const c = this.ctx(prev.members);
    const a = this.realmAction(action), m = this.realmMeta(meta);
    for (const [name, fn] of Object.entries(this.app.transitions ?? {})) {
      let v: unknown;
      try {
        v = fn(prev.s, next.s, a, m, c);
      } catch (e) {
        out.push({ name, why: `threw: ${errText(e)}` });
        continue;
      }
      if (v !== true) out.push({ name, why: v === false ? "returned false" : `returned ${String(v)}` });
    }
    return out;
  }

  finishedDeclared(): boolean {
    return typeof this.app.finished === "function";
  }

  /** Declared `finished`, else a top-level field that reads as done (winner, lock, pick, ...). */
  finished(w: World): boolean {
    if (this.finishedDeclared()) {
      try {
        return this.app.finished!(w.s, this.ctx(w.members)) === true;
      } catch {
        return false;
      }
    }
    const s = w.s as Record<string, unknown> | null;
    if (!s || typeof s !== "object" || Array.isArray(s)) return false;
    for (const k of FINISH_KEYS) {
      const v = s[k];
      if (v !== undefined && v !== null && v !== false && v !== 0 && v !== "") return true;
    }
    return false;
  }
}

/** Heuristic markers of a finished tool when it declares no `finished`. */
export const FINISH_KEYS = ["finished", "done", "closed", "over", "complete", "winner", "champion", "lock", "locked", "bought", "settled"];

export const RESET = /^(reset|restart|again|replay|reopen|unlock|clear|new|undo|start)/i;

// ---- Payload abstraction ----

export const LONG = "L".repeat(120);

/** Every string value and key in a JSON value. */
export function stringsOf(v: unknown, into = new Set<string>()): Set<string> {
  if (typeof v === "string") into.add(v);
  else if (Array.isArray(v)) for (const x of v) stringsOf(x, into);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (into.add(k), stringsOf(x, into));
  return into;
}

/** First string value under key `key` anywhere in `v`. */
export function firstUnder(v: unknown, key: string): string | undefined {
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = firstUnder(x, key);
      if (r !== undefined) return r;
    }
  } else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o[key] === "string" && o[key]) return o[key] as string;
    for (const x of Object.values(o)) {
      const r = firstUnder(x, key);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

type Slot = { path: (string | number)[]; kind: "text" | "num" };

/**
 * Replace free payloads with placeholders: a string that is not a known value (an id, a label
 * already in state, a member) is free text; a number that is not a small integer is a free
 * number. Returns the class key and the free slots.
 */
export function classify(a: unknown, known: Set<string>): { key: string; slots: Slot[] } {
  const slots: Slot[] = [];
  const walk = (v: unknown, path: (string | number)[]): unknown => {
    if (typeof v === "string") {
      if (path.length === 1 && path[0] === "t") return v;
      if (known.has(v)) return v;
      slots.push({ path, kind: "text" });
      return "\u0000text";
    }
    if (typeof v === "number") {
      if (Number.isInteger(v) && Math.abs(v) <= 16) return v;
      slots.push({ path, kind: "num" });
      return "\u0000num";
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, [...path, i]));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, [...path, k])]));
    return v;
  };
  const shape = walk(a, []);
  return { key: canonical(shape), slots };
}

function setAt(v: unknown, path: (string | number)[], x: unknown): unknown {
  if (!path.length) return x;
  const [h, ...rest] = path;
  if (Array.isArray(v)) return v.map((y, i) => (i === h ? setAt(y, rest, x) : y));
  const o = v as Record<string, unknown>;
  return { ...o, [h as string]: setAt(o[h as string], rest, x) };
}

/**
 * The alphabet for each free slot: text is empty, short (two of them), long, or a duplicate of a
 * value already in state under the same key; a free number is the first one seen for that slot,
 * or 1. Returns every combination (capped at 32).
 */
export function expand(a: unknown, slots: Slot[], state: unknown, reps: Map<string, number>, classKey: string): unknown[] {
  let outs: unknown[] = [a];
  for (const sl of slots) {
    const cur = (() => {
      let v: unknown = a;
      for (const p of sl.path) v = (v as Record<string, unknown>)[p as string];
      return v;
    })();
    const vals: unknown[] = [];
    if (sl.kind === "text") {
      vals.push("", "Aa", "Bb", LONG);
      const key = String(sl.path[sl.path.length - 1]);
      const dup = firstUnder(state, key);
      if (dup !== undefined) vals.push(dup);
    } else {
      const rk = classKey + "|" + sl.path.join(".");
      if (!reps.has(rk)) reps.set(rk, cur as number);
      vals.push(reps.get(rk)!, 1);
    }
    const next: unknown[] = [];
    for (const o of outs) for (const v of vals) next.push(setAt(o, sl.path, v));
    outs = next.slice(0, 32);
  }
  const seen = new Set<string>();
  return outs.filter((o) => {
    const k = canonical(o);
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

/** Garbage the runtime must survive: an unknown type, and one field of a real action mangled. */
export function garbageFor(actions: unknown[]): unknown[] {
  const out: unknown[] = [{ t: "__garbage__" }];
  const byT = new Set<string>();
  for (const a of actions) {
    if (!a || typeof a !== "object" || Array.isArray(a)) continue;
    const t = String((a as { t?: unknown }).t);
    if (byT.has(t)) continue;
    byT.add(t);
    const keys = Object.keys(a).filter((k) => k !== "t").sort();
    if (!keys.length) continue;
    const k = keys[0]!;
    const v = (a as Record<string, unknown>)[k];
    out.push({ ...(a as object), [k]: typeof v === "number" ? "7" : typeof v === "string" ? 7 : null });
    if (typeof v === "number") out.push({ ...(a as object), [k]: -1e9 });
  }
  return out;
}

/** Structural equality of plain JSON (key order ignored), across realms. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const aa = Array.isArray(a), ba = Array.isArray(b);
  if (aa !== ba) return false;
  if (aa) {
    const x = a as unknown[], y = b as unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!deepEqual(x[i], y[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}
