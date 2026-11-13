// Fixture: a roll treats seed 0 as "no result", which only happens on the local, pending replay,
// so the roll shows as 0 for a moment on the roller's screen.
// Expect: optimistic-glitch, trace 2.
import { defineApp, rng } from "@muse/app";
type S = { rolls: Record<string, number> };
export default defineApp<S, { t: "roll" }>({
  name: "Dice", summary: () => "dice",
  init: () => ({ rolls: {} }),
  reduce: (s, a, m) => (a.t === "roll" && s.rolls[m.user] === undefined ? { rolls: { ...s.rolls, [m.user]: m.seed ? rng(m.seed).int(6) + 1 : 0 } } : s),
  invariants: { "a roll is 1 to 6": (s) => Object.values(s.rolls).every((v) => v >= 1 && v <= 6) },
  arbitrary: () => ({ t: "roll" }),
  view: () => null,
});
