import { describe, test } from "bun:test";
import fc from "fast-check";
import { counter, lww, seats, type Spec } from "./reducers.ts";
import { syncProperty } from "./sim.ts";

const numRuns = Number(process.env.SYNC_RUNS ?? 300);
const specs: Spec<any>[] = [counter, lww, seats];

describe("replicas over a faulty network converge on the sequencer's log", () => {
  for (const spec of specs) {
    test(spec.name, async () => {
      await fc.assert(syncProperty(spec), { numRuns });
    }, 60_000);
  }
});

describe("they also converge when writes fail and the database is replaced", () => {
  for (const spec of specs) {
    test(spec.name, async () => {
      await fc.assert(syncProperty(spec, undefined, { wipes: true, failures: true }), { numRuns });
    }, 60_000);
  }
});
