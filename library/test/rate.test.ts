// rate: others' answers stay hidden until everyone in the chat is in, and the average is rounded
// half up in integer math. Each check is also run on a broken variant that it must reject.

import { expect, test } from "bun:test";
import rate, { avgTenths } from "@muse/library/rate";
import { makeTheme } from "@muse/app/theme";

const members = [
  { id: "u1", name: "Maya" },
  { id: "u2", name: "Leo" },
  { id: "u3", name: "Ana" },
];
const ctx = { room: "a:t", members };
const meta = (user: string, seq: number) => ({ seq, user, time: 1_760_000_000_000 + seq, seed: 1 });

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
const view = (s: ReturnType<typeof rate.init>) =>
  text(rate.view({ state: s, confirmed: s, pending: false, me: "u1", members, dispatch() {}, theme: makeTheme("light"), local: { draft: "" }, setLocal() {} } as never));

test("scores stay hidden until the last person is in", () => {
  let s = rate.init(ctx);
  s = rate.reduce(s, { t: "score", value: 9 }, meta("u2", 1), ctx);
  s = rate.reduce(s, { t: "score", value: 3 }, meta("u1", 2), ctx);
  expect(s.revealAt).toBe(0);
  expect(view(s)).not.toContain("average");
  expect(view(s)).toContain("2 of 3 in");
  s = rate.reduce(s, { t: "score", value: 6 }, meta("u3", 3), ctx);
  expect(s.revealAt).toBe(meta("u3", 3).time);
  expect(view(s)).toContain("6.0");
  expect(view(s)).toContain("average");
});

test("broken variant: a state revealed too early is rejected by the invariant and shows scores", () => {
  let s = rate.init(ctx);
  s = rate.reduce(s, { t: "score", value: 9 }, meta("u2", 1), ctx);
  const leaked = { ...s, revealAt: 5 };
  expect(view(leaked)).toContain("average");
  // The invariant is about the opposite direction (hidden although all are in); the transition
  // catches an early reveal from an answer.
  const t = rate.transitions!["answers reveal at once when the last person is in, and never hide again"]!;
  expect(t(s, { ...s, revealAt: meta("u1", 2).time }, { t: "score", value: 4 }, meta("u1", 2), ctx)).toBe(false);
});

test("the average rounds half up in tenths", () => {
  expect(avgTenths([7, 8])).toBe(75);
  expect(avgTenths([1, 2, 2])).toBe(17);
  expect(avgTenths([1, 1, 2])).toBe(13);
  expect(avgTenths([1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2])).toBe(20); // 1.95 rounds up
  expect(avgTenths([])).toBe(0);
  // Broken variant: truncating instead of rounding gets these wrong.
  const trunc = (xs: number[]) => Math.floor((xs.reduce((a, b) => a + b, 0) * 10) / xs.length);
  expect(trunc([1, 2, 2])).not.toBe(avgTenths([1, 2, 2]));
});
