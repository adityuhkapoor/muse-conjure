// Anything decided by meta.seed is shown from `confirmed`, with a neutral state while `pending`.
// A pending action runs locally with seed 0, so `state` holds a guess the viewer must not see.

import { expect, test } from "bun:test";
import wheel from "@muse/library/wheel";
import assign from "@muse/library/assign";
import bracket from "@muse/library/bracket";
import { makeTheme } from "@muse/app/theme";

const members = [
  { id: "u1", name: "Maya" },
  { id: "u2", name: "Leo" },
  { id: "u3", name: "Ana" },
];
const ctx = { room: "a:t", members };
const meta = (user: string, seed: number, seq = 1) => ({ seq, user, time: 1_760_000_000_000, seed });
const theme = makeTheme("light");

// Plain text of a view: strings reachable in the element tree.
function text(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node === "object") {
    const n = node as { p?: Record<string, unknown>; c?: unknown };
    const own = n.p ? ["label", "title", "subtitle"].map((k) => text(n.p![k])) : [];
    return [...own, text(n.c)].join(" ");
  }
  return "";
}

function props<S>(state: S, confirmed: S, pending: boolean, extra: object = {}) {
  return { state, confirmed, pending, me: "u1", members, dispatch() {}, theme, local: { draft: "" } as never, setLocal() {}, ...extra };
}

test("wheel: while my spin is pending the pick is not shown", () => {
  const confirmed = wheel.init(ctx);
  const guess = wheel.reduce(confirmed, { t: "spin" }, meta("u1", 0), ctx);
  expect(guess).not.toBe(confirmed);
  const pick = guess.options.find((o) => o.id === guess.spins[0]!.pick)!.label;
  const waiting = text(wheel.view(props(guess, confirmed, true) as never));
  expect(waiting).toContain("Spinning");
  expect(waiting).not.toContain(`spun: ${pick}`);
  // Not pending and nothing confirmed: the neutral line is the resting one, not the guess.
  expect(text(wheel.view(props(guess, confirmed, false) as never))).not.toContain("Spinning");
});

test("assign: while my spin is pending the owner is not shown", () => {
  const confirmed = assign.init(ctx);
  const guess = assign.reduce(confirmed, { t: "spin" }, meta("u1", 0), ctx);
  expect(guess).not.toBe(confirmed);
  const owner = members.find((m) => m.id === guess.spin!.who)!.name;
  const label = guess.tasks[guess.spin!.task]!.label;
  const waiting = text(assign.view(props(guess, confirmed, true) as never));
  expect(waiting).toContain("Spinning");
  expect(waiting).not.toContain(`${label} · ${owner}`);
});

test("bracket: while my close is pending the round is not advanced", () => {
  let confirmed = bracket.init(ctx);
  // Tie every match one vote each so the seed decides.
  const round = confirmed.rounds[0]!;
  round.forEach((m, i) => {
    if (m.b === null) return;
    confirmed = bracket.reduce(confirmed, { t: "vote", match: i, side: "a" }, meta("u1", 1, 10 + i), ctx);
    confirmed = bracket.reduce(confirmed, { t: "vote", match: i, side: "b" }, meta("u2", 1, 20 + i), ctx);
  });
  const guess = bracket.reduce(confirmed, { t: "close" }, meta("u1", 0, 99), ctx);
  expect(guess.rounds.length).toBe(confirmed.rounds.length + 1);
  expect(text(bracket.view(props(guess, confirmed, true) as never))).toContain("Counting votes");
  expect(text(bracket.view(props(guess, confirmed, false) as never))).not.toContain("Counting votes");
});
