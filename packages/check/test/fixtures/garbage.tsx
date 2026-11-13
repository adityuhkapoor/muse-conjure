// Fixture: a score is stored without checking its type, so a string score breaks the sum.
// Expect: garbage-breaks-invariant, trace 1.
import { defineApp } from "@muse/app";
type S = { scores: Record<string, number> };
export default defineApp<S, { t: "score"; v: number }>({
  name: "Scores", summary: () => "scores",
  init: () => ({ scores: {} }),
  reduce: (s, a, m) => (a.t === "score" ? { scores: { ...s.scores, [m.user]: a.v } } : s),
  invariants: { "scores are whole numbers": (s) => Object.values(s.scores).every((v) => Number.isInteger(v)) },
  arbitrary: (_s, _u, r) => ({ t: "score", v: r.int(3) }),
  view: () => null,
});
