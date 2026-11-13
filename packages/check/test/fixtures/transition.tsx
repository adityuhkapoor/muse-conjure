// Fixture: a tap is meant to add one but adds two.
// Expect: transition:a tap adds one, trace 1.
import { defineApp } from "@muse/app";
type S = { n: number };
export default defineApp<S, { t: "inc" }>({
  name: "Counter", summary: (s) => `${s.n}`,
  init: () => ({ n: 0 }),
  reduce: (s, a) => (a.t === "inc" && s.n < 6 ? { n: s.n + 2 } : s),
  invariants: { "count is small": (s) => s.n <= 8 },
  transitions: { "a tap adds one": (p, n) => p === n || n.n === p.n + 1 },
  arbitrary: () => ({ t: "inc" }),
  view: () => null,
});
