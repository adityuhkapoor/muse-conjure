// Fixture: an average of nothing is NaN, which is not plain JSON.
// Expect: json, trace 1.
import { defineApp } from "@muse/app";
type S = { scores: number[]; avg: number };
export default defineApp<S, { t: "clear" } | { t: "score"; v: number }>({
  name: "Scores", summary: () => "scores",
  init: () => ({ scores: [3], avg: 3 }),
  reduce: (s, a) => {
    if (a.t === "clear") return { scores: [], avg: 0 / 0 };
    return s;
  },
  invariants: { "few scores": (s) => s.scores.length < 9 },
  arbitrary: () => ({ t: "clear" }),
  view: () => null,
});
