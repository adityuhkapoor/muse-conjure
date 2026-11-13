// Reels: a pull never lands on a crossed-out option, its result comes from the seed, and it is shown
// only from `confirmed`. Each check also runs on a deliberately broken variant that it must reject.

import { expect, test } from "bun:test";
import { clock, rng } from "@muse/app";
import { makeTheme } from "@muse/app/theme";
import reels from "@muse/library/reels";
import { joinerCanAct } from "./joiner.ts";

const members = [
  { id: "u1", name: "Maya" },
  { id: "u2", name: "Leo" },
  { id: "u3", name: "Ana" },
];
const ctx = { room: "a:t", members };
const T = 1_760_000_000_000;
const meta = (user: string, seed: number, seq = 1) => ({ seq, user, time: T + seq * 10_000, seed });
type App = typeof reels;
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
const props = (state: S, confirmed: S, pending: boolean) => ({ state, confirmed, pending, me: "u1", members, dispatch() {}, theme: makeTheme("light"), local: { edit: false }, setLocal() {} });

/** True when, with one more option crossed out by a person, 200 pulls land only on allowed options, as the seed says. */
function landsAllowed(app: App): boolean {
  let s = app.init(ctx);
  s = app.reduce(s, { t: "cross", reel: 0, option: 0 }, meta("u2", 1, 1), ctx);
  if (s.reels[0]!.options[0]!.by !== "u2") return false;
  for (let seed = 1; seed <= 200; seed++) {
    const n = app.reduce(s, { t: "pull" }, meta("u1", seed, 2), ctx);
    const picks = n.pull?.picks ?? [];
    const g = rng(seed);
    const want = s.reels.map((r) => g.pick(r.options.map((o, i) => (o.why || o.by ? -1 : i)).filter((i) => i >= 0)));
    if (picks.join() !== want.join()) return false;
    if (picks.some((k, i) => { const o = n.reels[i]!.options[k]!; return o.why !== "" || o.by !== null; })) return false;
  }
  return true;
}

test("reels: a pull lands only on allowed options, where the seed says", () => {
  expect(landsAllowed(reels)).toBe(true);
  // Broken variant: a reducer that ignores what the chat ruled out.
  const ignoresRules = { ...reels, reduce: (s: S, a: never, m: never, c: never) => {
    const open = { ...s, reels: s.reels.map((r) => ({ ...r, options: r.options.map((o) => ({ ...o, why: "", by: null })) })) };
    const n = reels.reduce(open, a, m, c);
    return { ...n, reels: s.reels };
  } };
  expect(landsAllowed(ignoresRules as App)).toBe(false);
});

test("reels: while my pull is pending the result is not shown", () => {
  const confirmed = reels.init(ctx);
  const guess = reels.reduce(confirmed, { t: "pull" }, meta("u1", 0, 1), ctx);
  const result = guess.reels.map((r, i) => r.options[guess.pull!.picks[i]!]!.label).join(" · ");
  clock.value = T + 60_000; // long after the reels would have stopped
  const shows = (v: unknown) => text(v).includes(result);
  const waiting = text(reels.view(props(guess, confirmed, true) as never));
  expect(waiting).toContain("Pulling");
  expect(shows(reels.view(props(guess, confirmed, true) as never))).toBe(false);
  // Broken variant: the guess handed in as confirmed is shown, so the check above can fail.
  expect(shows(reels.view(props(guess, guess, true) as never))).toBe(true);
  clock.value = 0;
});

test("reels: a leaver's cross-outs come back and a late joiner can pull", () => {
  let s = reels.init(ctx);
  s = reels.reduce(s, { t: "cross", reel: 1, option: 0 }, meta("u3", 1, 1), ctx);
  expect(s.reels[1]!.options[0]!.by).toBe("u3");
  const back = reels.onMembers!(s, { room: "a:t", members: members.slice(0, 2) });
  expect(back.reels[1]!.options[0]!.by).toBeNull();
  expect(joinerCanAct(reels as never)).toBe(true);
});
