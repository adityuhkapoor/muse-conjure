// Fixture: an invariant that only holds at depth less than 4 (the fourth tap breaks it).
// Expect: invariant:count stays under 4, trace 4.
import { defineApp } from "@muse/app";
type S = { n: number };
export default defineApp<S, { t: "inc" }>({
  name: "Counter", summary: (s) => `${s.n} taps`,
  init: () => ({ n: 0 }),
  reduce: (s, a) => (a.t === "inc" && s.n < 9 ? { n: s.n + 1 } : s),
  invariants: { "count stays under 4": (s) => s.n < 4 },
  arbitrary: () => ({ t: "inc" }),
  view: () => null,
});
