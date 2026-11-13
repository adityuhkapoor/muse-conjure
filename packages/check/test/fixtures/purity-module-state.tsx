// Fixture: reduce reads a module-level counter, so the same input gives different states.
// Expect: purity, trace 1.
import { defineApp } from "@muse/app";
type S = { n: number };
let calls = 0;
export default defineApp<S, { t: "inc" }>({
  name: "Counter", summary: (s) => `${s.n}`,
  init: () => ({ n: 0 }),
  reduce: (s, a) => (a.t === "inc" ? { n: s.n + 1 + (calls++ % 2) } : s),
  invariants: { "count is a number": (s) => typeof s.n === "number" },
  arbitrary: () => ({ t: "inc" }),
  view: () => null,
});
