import fc from "fast-check";
import type { Reducer } from "@muse/protocol";

export type Spec<S> = { name: string; reducer: Reducer<S>; action: fc.Arbitrary<unknown> };

export const counter: Spec<number> = {
  name: "counter",
  reducer: {
    init: () => 0,
    reduce: (s, a) => {
      const add = (a as { add?: unknown })?.add;
      return typeof add === "number" ? s + add : s;
    },
  },
  action: fc.record({ add: fc.integer({ min: -5, max: 5 }) }),
};

type Lww = Record<string, { v: number; by: string }>;
export const lww: Spec<Lww> = {
  name: "last-writer map",
  reducer: {
    init: () => ({}),
    reduce: (s, a, meta) => {
      const { k, v } = (a ?? {}) as { k?: unknown; v?: unknown };
      if (typeof k !== "string" || typeof v !== "number") return s;
      return { ...s, [k]: { v, by: meta.user } };
    },
  },
  action: fc.record({ k: fc.constantFrom("a", "b", "c"), v: fc.integer({ min: 0, max: 99 }) }),
};

type Seats = { seats: (string | null)[]; spins: number[] };
/** Order-sensitive: a claim on a taken seat is a no-op, so applying entries out of order shows. */
export const seats: Spec<Seats> = {
  name: "seat claims",
  reducer: {
    init: () => ({ seats: [null, null, null, null], spins: [] }),
    reduce: (s, a, meta) => {
      const act = (a ?? {}) as { claim?: number; release?: number; spin?: boolean };
      if (typeof act.claim === "number") {
        if (s.seats[act.claim] !== null || s.seats.includes(meta.user)) return s;
        const seats = s.seats.slice();
        seats[act.claim] = meta.user;
        return { ...s, seats };
      }
      if (typeof act.release === "number") {
        if (s.seats[act.release] !== meta.user) return s;
        const seats = s.seats.slice();
        seats[act.release] = null;
        return { ...s, seats };
      }
      if (act.spin) return { ...s, spins: [...s.spins, meta.seed % 4] };
      return s;
    },
  },
  action: fc.oneof(
    fc.record({ claim: fc.integer({ min: 0, max: 3 }) }),
    fc.record({ release: fc.integer({ min: 0, max: 3 }) }),
    fc.constant({ spin: true }),
  ),
};
