// Fixture: a bracket that only advances a round with an even number left, started with three
// entries. People can still cheer, so nothing deadlocks, but it can never finish.
// Expect: goal, trace 0.
import { defineApp } from "@muse/app";
type S = { alive: string[]; picked: (string | null)[]; cheers: number };
export default defineApp<S, { t: "pick"; match: number; side: number } | { t: "cheer" }>({
  name: "Bracket", summary: (s) => `${s.alive.length} left`,
  init: () => ({ alive: ["Tacos", "Pho", "Ramen"], picked: [null], cheers: 0 }),
  reduce: (s, a) => {
    if (a.t === "cheer") return { ...s, cheers: (s.cheers + 1) % 2 };
    if (a.t !== "pick" || s.alive.length % 2 || s.picked[a.match] !== null) return s;
    const picked = s.picked.map((p, i) => (i === a.match ? s.alive[a.match * 2 + a.side]! : p));
    if (picked.some((p) => p === null)) return { ...s, picked };
    return { ...s, alive: picked as string[], picked: Array(picked.length / 2).fill(null) };
  },
  invariants: { "someone is left": (s) => s.alive.length >= 1 },
  finished: (s: S) => s.alive.length === 1,
  arbitrary: (s, _u, r) => (r.next() < 0.5 ? { t: "cheer" } : { t: "pick", match: 0, side: r.int(2) }),
  view: () => null,
} as never);
