// Data-shape coverage: the states a tool must look right in, found by driving its own
// `arbitrary` (and membership) from `init`, never from its filled example alone.
//
// - emptied:    init with three people, then the actions that remove the most, until nothing
//               more can be removed (a wheel with no options, a list with no items).
// - minimal:    one person in the chat, and the main list cut down to one item (or grown to one
//               when init has none).
// - overloaded: twelve people with long names, the lists grown as far as arbitrary goes, and
//               every text the tool accepts replaced with the longest realistic text it keeps.
// - finished:   a state where no one can change anything any more (arbitrary has nothing that
//               changes state), or `locked` where the set of live actions has shrunk to a third.
//
// Each state is an action trace (members, then who did what), so the render stage can replay it
// through the real server and the report can name it.

import { canonical } from "../json.ts";
import { loadApp } from "../sandbox.ts";
import { hash32, MEMBERS, Room, T0, type Member, type Meta, type W } from "../sim/core.ts";

export type StateName = "emptied" | "minimal" | "overloaded" | "finished" | "locked";
export type Step = { user: string; action: unknown };
export type CoverageState = {
  name: StateName;
  members: Member[];
  steps: Step[];
  /** No action from the viewer (u1) changes anything here. */
  finishedForMe: boolean;
  /** Nobody can change anything. */
  finished: boolean;
  items: number;
  note: string;
};

export const STEP_MS = 4000;
export const CROWD: Member[] = [
  { id: "u1", name: "Maya" },
  { id: "u2", name: "Leo" },
  { id: "u3", name: "Ana" },
  { id: "u4", name: "Priyanka Venkataraman" },
  { id: "u5", name: "Jonathan Oyelaran-Whitfield" },
  { id: "u6", name: "Sam" },
  { id: "u7", name: "Ximena Castellanos" },
  { id: "u8", name: "Bo" },
  { id: "u9", name: "Hannah Kowalczyk" },
  { id: "u10", name: "Dmitri" },
  { id: "u11", name: "Aaliyah Montgomery-Hughes" },
  { id: "u12", name: "Theo" },
];
const LONG = [
  "Taco truck on Cortez and 5th street by the old cinema",
  "Saturday brunch at the place with the very long line outside",
  "Grandma's eightieth birthday dinner in the back room upstairs",
  "Picking up the rental van from the airport before noon",
  "Whoever has the biggest car and lives closest to the station",
];
const CUTS = [64, 52, 44, 36, 30, 26, 22, 18, 14, 10];

/** Arrays and per-person maps, counted: a rough "how much is in this state". */
export function itemCount(v: unknown, ids: Set<string>, depth = 0): number {
  if (Array.isArray(v)) return v.length + v.reduce((s: number, x) => s + itemCount(x, ids, depth + 1), 0);
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    const perPerson = depth > 0 && keys.length > 0 && keys.every((k) => ids.has(k));
    return (perPerson ? keys.length : 0) + keys.reduce((s, k) => s + itemCount((v as Record<string, unknown>)[k], ids, depth + 1), 0);
  }
  return 0;
}

/** The longest array in the state, by path. */
function mainList(v: unknown, at = ""): { path: string; len: number } | null {
  let best: { path: string; len: number } | null = null;
  const visit = (x: unknown, p: string, d: number) => {
    if (d > 3) return;
    if (Array.isArray(x)) {
      if (!best || x.length > best.len) best = { path: p, len: x.length };
      return;
    }
    if (x && typeof x === "object") for (const k of Object.keys(x).sort()) visit((x as Record<string, unknown>)[k], p ? `${p}.${k}` : k, d + 1);
  };
  visit(v, at, 0);
  return best;
}
function getPath(v: unknown, p: string): unknown {
  return p.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), v);
}

function cut(s: string, n: number): string {
  if (s.length <= n) return s;
  const c = s.slice(0, n + 1);
  const sp = c.lastIndexOf(" ");
  return (sp > n * 0.6 ? c.slice(0, sp) : s.slice(0, n)).trim();
}

export type CoverageOpts = { seed: number; maxStateBytes: number; budgetMs?: number };

export type Coverage = { states: CoverageState[]; typicalFinished: boolean };

export function coverageStates(js: string, o: CoverageOpts): Coverage {
  const t0 = performance.now();
  const late = () => performance.now() - t0 > (o.budgetMs ?? 600);
  let room: Room;
  try {
    room = new Room(loadApp(js, 3), o.maxStateBytes);
  } catch {
    return { states: [], typicalFinished: false };
  }
  if (typeof room.L.app.arbitrary !== "function") return { states: [], typicalFinished: false };
  const ids = new Set(CROWD.map((m) => m.id));
  type Path = { w: W; canon: string; steps: Step[]; members: Member[] };
  const meta = (i: number, user: string): Meta => ({ seq: i + 2, user, time: T0 + (i + 1) * STEP_MS, seed: hash32(o.seed, i + 77) });
  const start = (members: Member[]): Path | null => {
    const r = room.init(members);
    return r.ok ? { w: r.state, canon: r.canon, steps: [], members } : null;
  };
  /** Proposals from arbitrary that change state, applied. */
  const proposals = (p: Path, users: string[], n: number, salt: number) => {
    const out: { step: Step; w: W; canon: string }[] = [];
    const seen = new Set<string>();
    for (let k = 0; k < n; k++) {
      const user = users[hash32(salt, k) % users.length]!;
      const a = room.arbitrary(p.w, user, hash32(salt ^ 0x51, k));
      if (!a.ok || a.action === null) continue;
      const key = user + JSON.stringify(a.action);
      if (seen.has(key)) continue;
      seen.add(key);
      const r = room.reduce(p.w, a.action, meta(p.steps.length, user), "act");
      if (!r.ok || r.canon === p.canon) continue;
      out.push({ step: { user, action: a.action }, w: r.state, canon: r.canon });
    }
    return out;
  };
  const push = (p: Path, x: { step: Step; w: W; canon: string }): Path => ({ ...p, w: x.w, canon: x.canon, steps: [...p.steps, x.step] });
  const size = (w: W) => itemCount(w.s, ids);
  const live = (p: Path, users: string[], n = 6) => proposals(p, users, n * users.length, 0xa11 + p.steps.length);
  const usersOf = (ms: Member[]) => ms.map((m) => m.id);

  const out: CoverageState[] = [];
  const add = (name: StateName, p: Path, note: string) => {
    const me = live(p, ["u1"], 12).length;
    const anyone = me ? 1 : live(p, usersOf(p.members), 6).length;
    out.push({ name, members: p.members, steps: p.steps, finishedForMe: me === 0, finished: anyone === 0, items: size(p.w), note });
  };

  // Emptied: remove as much as arbitrary lets us.
  const base = start(MEMBERS);
  if (!base) return { states: [], typicalFinished: false };
  const typicalFinished = live(base, ["u1"], 12).length === 0;
  {
    let p = base;
    for (let i = 0; i < 40 && !late(); i++) {
      const c = proposals(p, usersOf(p.members), 16, 0xe0 + i).filter((x) => size(x.w) < size(p.w));
      if (!c.length) break;
      c.sort((a, b) => size(a.w) - size(b.w));
      p = push(p, c[0]!);
    }
    add("emptied", p, p.steps.length ? `init, then ${p.steps.length} actions that remove things, until none removes more` : "init gives the emptiest state arbitrary can reach");
  }

  // Minimal: one person, one item.
  const solo = start(CROWD.slice(0, 1));
  if (solo) {
    let p = solo;
    const list = mainList(p.w.s);
    if (list && list.len > 1) {
      for (let i = 0; i < 30 && !late(); i++) {
        const len = (getPath(p.w.s, list.path) as unknown[] | undefined)?.length ?? 0;
        if (len <= 1) break;
        const c = proposals(p, ["u1"], 16, 0x31 + i).filter((x) => {
          const l = (getPath(x.w.s, list.path) as unknown[] | undefined)?.length ?? -1;
          return l >= 1 && l < len;
        });
        if (!c.length) break;
        p = push(p, c[0]!);
      }
    } else if (list && list.len === 0) {
      const c = proposals(p, ["u1"], 16, 0x32).filter((x) => ((getPath(x.w.s, list.path) as unknown[] | undefined)?.length ?? 0) === 1);
      if (c.length) p = push(p, c[0]!);
    }
    add("minimal", p, `one person in the chat${list ? `, ${list.path || "the main list"} cut to one` : ""}`);
  }

  // Overloaded: twelve people, lists grown, the longest text each field keeps.
  const crowd = start(CROWD);
  if (crowd) {
    let p = crowd;
    let top = crowd;
    let flat = 0;
    for (let i = 0; i < 48 && flat < 8 && !late(); i++) {
      const c = proposals(p, usersOf(CROWD), 12, 0x0f + i * 13);
      if (!c.length) break;
      c.sort((a, b) => size(b.w) - size(a.w) || b.canon.length - a.canon.length);
      let pick = c[0]!;
      flat = size(pick.w) > size(p.w) ? 0 : flat + 1;
      // Longest realistic text in each string field the reducer keeps.
      const a = pick.step.action;
      if (a && typeof a === "object" && !Array.isArray(a)) {
        for (const k of Object.keys(a).sort()) {
          if (k === "t" || typeof (a as Record<string, unknown>)[k] !== "string") continue;
          const long = LONG[(i + k.length) % LONG.length]!;
          for (const n of CUTS) {
            const text = cut(long, n);
            const act = { ...(pick.step.action as Record<string, unknown>), [k]: text };
            const r = room.reduce(p.w, act, meta(p.steps.length, pick.step.user), "act");
            if (r.ok && r.canon !== p.canon && r.canon.includes(JSON.stringify(text).slice(1, -1))) {
              pick = { step: { user: pick.step.user, action: act }, w: r.state, canon: r.canon };
              break;
            }
          }
        }
      }
      p = push(p, pick);
      if (size(p.w) > size(top.w) || (size(p.w) === size(top.w) && p.canon.length > top.canon.length)) top = p;
    }
    p = top;
    add("overloaded", p, `12 people with long names, ${p.steps.length} actions that add the most, long texts where accepted`);
  }

  // Finished or locked: walk until nothing (or much less) can be done.
  {
    const users = usersOf(MEMBERS);
    const live0 = live(base, users).length;
    let best: { p: Path; n: number } | null = null;
    outer: for (let walk = 0; walk < 6 && !late(); walk++) {
      let p = base;
      for (let i = 0; i < 30 && !late(); i++) {
        const c = proposals(p, users, 6, 0x7a1 + walk * 977 + i);
        if (!c.length) break;
        p = push(p, c[hash32(walk, i) % c.length]!);
        const n = live(p, users, 4).length;
        if (n === 0) {
          best = { p, n };
          break outer;
        }
        if (n * 3 <= live0 && (!best || n < best.n || (n === best.n && p.steps.length < best.p.steps.length))) best = { p, n };
      }
    }
    if (best) add(best.n === 0 ? "finished" : "locked", best.p, best.n === 0 ? `after ${best.p.steps.length} actions nothing anyone does changes the state` : `after ${best.p.steps.length} actions only ${best.n} of ${live0} kinds of action still change anything`);
  }

  // Drop states that equal one already kept.
  const keep = new Set<string>([canonical(base.w)]);
  const states = out.filter((s) => {
    let w = room.init(s.members);
    if (!w.ok) return false;
    let st = w.state;
    s.steps.forEach((x, i) => {
      const r = room.reduce(st, x.action, meta(i, x.user), "act");
      if (r.ok) st = r.state;
    });
    const k = canonical(st);
    if (keep.has(k)) return false;
    keep.add(k);
    return true;
  });
  return { states, typicalFinished };
}
