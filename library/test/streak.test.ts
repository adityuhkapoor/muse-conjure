// Streak board: the day boundary comes from meta.time at the piece's fixed offset and start hour,
// and streaks count days in a row. The gate's clock never crosses a day, so this is checked here.

import { expect, test } from "bun:test";
import streak from "@muse/library/streak";
import { makeTheme } from "@muse/app/theme";

const members = [
  { id: "u1", name: "Maya" },
  { id: "u2", name: "Leo" },
];
const ctx = { room: "a:t", members };
// Default params: UTC-8, the day starts at 4 AM. 2026-11-12 03:59 PST is 11:59 UTC.
const BEFORE_4AM = Date.UTC(2026, 10, 12, 11, 59);
const H = 3_600_000;
type S = ReturnType<typeof streak.init>;

function fold(s: S, steps: [string, "check" | "undo", number][]) {
  let seq = 1;
  for (const [user, t, time] of steps) s = streak.reduce(s, { t }, { seq: seq++, user, time, seed: 1 }, ctx);
  return s;
}
const daysOf = (s: S, u: string) => s.people.find((p) => p.user === u)?.days ?? [];

function text(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node === "object") {
    const n = node as { p?: Record<string, unknown>; c?: unknown };
    return [n.p ? text(n.p.subtitle) : "", text(n.c)].join(" ");
  }
  return "";
}
const view = (s: S) => text(streak.view({ state: s, confirmed: s, pending: false, me: "u1", members, dispatch() {}, theme: makeTheme("light"), local: {}, setLocal() {} } as never));

/** 3:59 AM and 4:00 AM the same night are two days; returns u1's days. */
const acrossFour = (s0: S) => daysOf(fold(s0, [["u1", "check", BEFORE_4AM], ["u1", "check", BEFORE_4AM + 60_000]]), "u1");

test("4 AM local starts a new day: 3:59 and 4:00 count as two days in a row", () => {
  const days = acrossFour(streak.init(ctx));
  expect(days.length).toBe(2);
  expect(days[1]! - days[0]!).toBe(1);
});

test("broken variant: a board that ignores the offset and start hour is caught", () => {
  // Same moments read as plain UTC days (11:59 and 12:00 UTC): one day, so the second check-in is refused.
  expect(acrossFour({ ...streak.init(ctx), shift: 0 }).length).not.toBe(2);
});

test("a second check-in the same day is refused; undo takes back only today", () => {
  const s = fold(streak.init(ctx), [["u1", "check", BEFORE_4AM + H], ["u1", "check", BEFORE_4AM + 5 * H]]);
  expect(daysOf(s, "u1").length).toBe(1);
  const next = fold(s, [["u1", "check", BEFORE_4AM + 25 * H]]);
  expect(daysOf(next, "u1").length).toBe(2);
  // An undo the day after yesterday's check-in does nothing to yesterday.
  expect(daysOf(fold(next, [["u1", "undo", BEFORE_4AM + 49 * H]]), "u1").length).toBe(2);
  expect(daysOf(fold(next, [["u1", "undo", BEFORE_4AM + 26 * H]]), "u1").length).toBe(1);
});

test("streaks: three days in a row show day 3; a missed day starts over, best stays", () => {
  const three = fold(streak.init(ctx), [1, 25, 49].map((h) => ["u1", "check", BEFORE_4AM + h * H] as [string, "check", number]));
  expect(view(three)).toContain("Day 3 done");
  expect(view(three)).toContain("your best 3");
  const again = fold(three, [["u1", "check", BEFORE_4AM + 97 * H]]);
  expect(view(again)).toContain("Checked in");
  expect(view(again)).toContain("your best 3");
});

test("broken variant: a streak that does not reset after a missed day is caught by the view check", () => {
  const three = fold(streak.init(ctx), [1, 25, 49].map((h) => ["u1", "check", BEFORE_4AM + h * H] as [string, "check", number]));
  // Fake a fourth consecutive day where there was a gap: the view must not say "Checked in" then.
  const gapless = { ...three, people: three.people.map((p) => ({ ...p, days: [...p.days, p.days.at(-1)! + 1], at: BEFORE_4AM + 73 * H })) };
  expect(view(gapless)).not.toContain("Checked in");
});
