// Fixture: the roster is fixed once the tool starts; someone who leaves and comes back can never
// take part again, though the others still can.
// Expect: membership-join, trace 3.
import { defineApp } from "@muse/app";
type S = { people: string[]; taps: Record<string, number> };
export default defineApp<S, { t: "tap" }>({
  name: "Taps", summary: () => "taps",
  init: (ctx) => ({ people: ctx.members.map((m) => m.id), taps: {} }),
  reduce: (s, a, m) => (a.t === "tap" && s.people.includes(m.user) && (s.taps[m.user] ?? 0) < 3 ? { ...s, taps: { ...s.taps, [m.user]: (s.taps[m.user] ?? 0) + 1 } } : s),
  onMembers: (s, ctx) => {
    const here = (p: string) => ctx.members.some((m) => m.id === p);
    return { people: s.people.filter(here), taps: Object.fromEntries(Object.entries(s.taps).filter(([p]) => here(p))) };
  },
  invariants: { "taps are small": (s) => Object.values(s.taps).every((v) => v <= 3) },
  finished: (s: S) => s.people.length > 0 && s.people.every((p) => (s.taps[p] ?? 0) >= 3),
  arbitrary: () => ({ t: "tap" }),
  view: () => null,
} as never);
