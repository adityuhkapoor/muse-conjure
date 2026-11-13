// Fixture: arbitrary picks from an empty list once everything is taken, and throws.
// Expect: arbitrary, trace 2.
import { defineApp } from "@muse/app";
type S = { left: number };
export default defineApp<S, { t: "take" }>({
  name: "Take", summary: (s) => `${s.left}`,
  init: () => ({ left: 2 }),
  reduce: (s, a) => (a.t === "take" && s.left > 0 ? { left: s.left - 1 } : s),
  invariants: { "never negative": (s) => s.left >= 0 },
  arbitrary: (s) => {
    if (s.left === 0) throw new Error("nothing left");
    return { t: "take" };
  },
  view: () => null,
});
