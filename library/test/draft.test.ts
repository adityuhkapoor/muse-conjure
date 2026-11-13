// Draft: the order comes from the seed and is shown only once confirmed; turns snake; a leaver's
// picks go back on the board. Each check also runs on a deliberately broken variant it must reject.

import { expect, test } from "bun:test";
import { rng } from "@muse/app";
import { makeTheme } from "@muse/app/theme";
import draft from "@muse/library/draft";
import { joinerCanAct } from "./joiner.ts";

const members = [
  { id: "u1", name: "Maya" },
  { id: "u2", name: "Leo" },
  { id: "u3", name: "Ana" },
];
const ctx = { room: "a:t", members };
const meta = (user: string, seed: number, seq = 1) => ({ seq, user, time: 1_760_000_000_000 + seq * 1000, seed });
type App = typeof draft;
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

const up = (s: S) => (s.order ? (s.round % 2 === 0 ? s.order[s.idx] : s.order[s.order.length - 1 - s.idx]) : undefined);

/** Who picked, in order, over six picks: whoever is up takes the first free option. */
function pickers(app: App, seed: number): { order: string[]; seq: string[] } {
  let s = app.reduce(app.init(ctx), { t: "start" }, meta("u1", seed, 1), ctx);
  const seq: string[] = [];
  for (let i = 0; i < 6; i++) {
    const who = up(s)!;
    seq.push(who);
    s = app.reduce(s, { t: "pick", option: s.options.find((o) => o.by === null)!.id }, meta(who, 1, 2 + i), ctx);
  }
  return { order: s.order!, seq };
}

/** True when the order is the seed's shuffle and turns go 1 2 3, 3 2 1. */
function snakes(app: App): boolean {
  for (let seed = 1; seed <= 20; seed++) {
    const { order, seq } = pickers(app, seed);
    if (order.join() !== rng(seed).shuffle(members.map((m) => m.id)).join()) return false;
    if (seq.join() !== [...order, ...[...order].reverse()].join()) return false;
  }
  return true;
}

test("draft: the seed sets the order and turns snake", () => {
  expect(snakes(draft)).toBe(true);
  // Broken variant: every round runs forward.
  const forward = { ...draft, reduce: (s: S, a: never, m: never, c: never) => {
    const n = draft.reduce(s, a, m, c);
    return n.round % 2 ? { ...n, round: n.round + 1 } : n;
  } };
  expect(snakes(forward as App)).toBe(false);
});

test("draft: while my start is pending the order is not shown", () => {
  const confirmed = draft.init(ctx);
  const guess = draft.reduce(confirmed, { t: "start" }, meta("u1", 0, 1), ctx);
  const hides = (c: S) => text(draft.view(props(guess, c, true) as never)).includes("Drawing the order");
  expect(hides(confirmed)).toBe(true);
  // Broken variant: the guess handed in as confirmed.
  expect(hides(guess)).toBe(false);
});

test("draft: a leaver's picks go back on the board and the next person is up", () => {
  let s = draft.reduce(draft.init(ctx), { t: "start" }, meta("u1", 7, 1), ctx);
  const first = up(s)!;
  s = draft.reduce(s, { t: "pick", option: "o0" }, meta(first, 1, 2), ctx);
  const second = up(s)!;
  const after = draft.onMembers!(s, { room: "a:t", members: members.filter((m) => m.id !== first) });
  expect(after.options[0]!.by).toBeNull();
  expect(after.order).not.toContain(first);
  expect(up(after)).toBe(second);
  expect(joinerCanAct(draft as never)).toBe(true);
});
