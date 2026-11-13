// Fixture: a correct counter. Used with a broken sequencer that forgets dedupe, so the duplicate
// resend check has a case that must fail; with the real sequencer it passes.
// Expect: none.
import { defineApp } from "@muse/app";
type S = { taps: Record<string, number> };
export default defineApp<S, { t: "tap" }>({
  name: "Taps", summary: () => "taps",
  init: () => ({ taps: {} }),
  reduce: (s, a, m) => (a.t === "tap" && (s.taps[m.user] ?? 0) < 2 ? { taps: { ...s.taps, [m.user]: (s.taps[m.user] ?? 0) + 1 } } : s),
  invariants: { "at most two each": (s) => Object.values(s.taps).every((v) => v <= 2) },
  arbitrary: () => ({ t: "tap" }),
  view: () => null,
});
