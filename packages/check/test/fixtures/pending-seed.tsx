// Fixture: a spin whose result differs between replicas: the view shows the result from state,
// which while pending was folded with the local seed 0, not the server's seed.
// Expect: pending-seed, trace 1.
import { defineApp, rng } from "@muse/app";
type S = { names: string[]; pick: string | null };
export default defineApp<S, { t: "spin" }>({
  name: "Spin", summary: (s) => s.pick ?? "not spun",
  init: () => ({ names: ["Maya", "Leo", "Ana", "Sam"], pick: null }),
  reduce: (s, a, m) => (a.t === "spin" ? { ...s, pick: rng(m.seed).pick(s.names) } : s),
  invariants: { "the pick is a name": (s) => s.pick === null || s.names.includes(s.pick) },
  arbitrary: () => ({ t: "spin" }),
  view: ({ state, pending }) => ({ type: "div", props: {}, children: [state.pick ?? "Spin", pending ? "…" : ""] }) as never,
});
