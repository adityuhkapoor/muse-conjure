// Fixture: the seat double-claim race. A claim does not check the seat is still free (the UI
// only offers free seats), so two people claiming the same seat at once both think they hold it.
// Expect: race, trace 6.
import { defineApp } from "@muse/app";
type S = { seats: (string | null)[]; held: Record<string, number> };
export default defineApp<S, { t: "claim"; seat: number }>({
  name: "Seats", summary: () => "seats",
  init: () => ({ seats: [null, null], held: {} }),
  reduce: (s, a, m) => {
    if (a.t !== "claim" || typeof a.seat !== "number" || a.seat < 0 || a.seat > 1 || s.held[m.user] !== undefined) return s;
    return { seats: s.seats.map((x, i) => (i === a.seat ? m.user : x)), held: { ...s.held, [m.user]: a.seat } };
  },
  invariants: { "held seats match the grid": (s) => Object.entries(s.held).every(([u, i]) => s.seats[i] === u) },
  arbitrary: (s, u, r) => {
    const free = s.seats.flatMap((x, i) => (x === null ? [i] : []));
    return free.length && s.held[u] === undefined ? { t: "claim", seat: r.pick(free) } : null;
  },
  view: () => null,
});
