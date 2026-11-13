// Veto: a tie among the options still in goes to the server's seed, and the winner is shown only
// from `confirmed`. Each check also runs on a deliberately broken variant that it must reject.

import { expect, test } from "bun:test";
import { rng } from "@muse/app";
import { makeTheme } from "@muse/app/theme";
import veto from "@muse/library/veto";
import { joinerCanAct } from "./joiner.ts";

const members = [
  { id: "u1", name: "Maya" },
  { id: "u2", name: "Leo" },
  { id: "u3", name: "Ana" },
];
const ctx = { room: "a:t", members };
const meta = (user: string, seed: number, seq = 1) => ({ seq, user, time: 1_760_000_000_000 + seq * 1000, seed });
type App = typeof veto;
type S = ReturnType<App["init"]>;

function text(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node === "object") {
    const n = node as { p?: Record<string, unknown>; c?: unknown };
    const own = n.p ? ["label", "title", "subtitle", "actor"].map((k) => text(n.p![k])) : [];
    return [...own, text(n.c)].join(" ");
  }
  return "";
}
const props = (state: S, confirmed: S, pending: boolean) => ({ state, confirmed, pending, me: "u1", members, dispatch() {}, theme: makeTheme("light"), local: {} as never, setLocal() {} });

/** Two of five struck, then the third person's veto leaves three in with every veto used. */
function toTie(app: App, seed: number): S {
  let s = app.init(ctx);
  s = app.reduce(s, { t: "veto", option: "o0" }, meta("u1", 1, 1), ctx);
  s = app.reduce(s, { t: "veto", option: "o1" }, meta("u2", 1, 2), ctx);
  return app.reduce(s, { t: "veto", option: "o2" }, meta("u3", seed, 3), ctx);
}

/** True when every tie goes to rng(seed) over those still in, and different seeds give different winners. */
function seedBreaksTies(app: App): boolean {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const s = toTie(app, seed);
    const left = s.options.filter((o) => o.by === null);
    if (s.winner?.how !== "seed" || s.winner.id !== rng(seed).pick(left).id) return false;
    seen.add(s.winner.id);
  }
  return seen.size > 1;
}

/** True when the view, while my last veto is pending, shows a neutral line and not the local guess. */
function hidesGuess(view: (p: never) => unknown, guess: S, confirmed: S): boolean {
  const waiting = text(view(props(guess, confirmed, true) as never));
  return waiting.includes("Deciding") && !waiting.includes("it is");
}

test("veto: the seed breaks a tie once everyone has used their veto", () => {
  expect(seedBreaksTies(veto)).toBe(true);
  const firstAlways = { ...veto, reduce: (s: S, a: never, m: never, c: never) => {
    const n = veto.reduce(s, a, m, c);
    return n.winner?.how === "seed" ? { ...n, winner: { ...n.winner, id: n.options.find((o) => o.by === null)!.id } } : n;
  } };
  expect(seedBreaksTies(firstAlways as App)).toBe(false);
});

test("veto: while my deciding veto is pending the winner is not shown", () => {
  let confirmed = veto.init(ctx);
  confirmed = veto.reduce(confirmed, { t: "veto", option: "o0" }, meta("u2", 1, 1), ctx);
  confirmed = veto.reduce(confirmed, { t: "veto", option: "o1" }, meta("u3", 1, 2), ctx);
  const guess = veto.reduce(confirmed, { t: "veto", option: "o2" }, meta("u1", 0, 3), ctx);
  expect(guess.winner).not.toBeNull();
  expect(hidesGuess(veto.view as never, guess, confirmed)).toBe(true);
  // Broken variant: a view handed the guess as confirmed shows it.
  expect(hidesGuess(veto.view as never, guess, guess)).toBe(false);
  // Once confirmed, the winner line shows.
  expect(text(veto.view(props(guess, guess, false) as never))).toContain("it is");
});

test("veto: a leaver's veto is lifted and a late joiner can veto", () => {
  let s = veto.init(ctx);
  s = veto.reduce(s, { t: "veto", option: "o0" }, meta("u3", 1, 1), ctx);
  const left = { room: "a:t", members: members.slice(0, 2) };
  expect(veto.invariants["vetoers are in the chat"]!(s, left)).toBe(false);
  expect(veto.onMembers!(s, left).options[0]!.by).toBeNull();
  expect(joinerCanAct(veto as never)).toBe(true);
});
