// A check never seen failing proves nothing: each broken variant must be caught.

import { expect, test } from "bun:test";
import fc from "fast-check";
import { arrivalOrder, ignoresEpoch, noDedupe, noReplay, noResend } from "./fixtures/broken.ts";
import { counter, seats } from "./reducers.ts";
import { syncProperty, type PropertyOptions, type Variant } from "./sim.ts";
import type { Spec } from "./reducers.ts";

async function mustFail<S>(spec: Spec<S>, variant: Variant, expectMessage: RegExp, po: PropertyOptions = {}) {
  const out = await fc.check(syncProperty(spec, variant, po), { numRuns: 300 });
  expect(out.failed).toBe(true);
  expect(String((out.errorInstance as Error | undefined)?.message ?? out.errorInstance)).toMatch(expectMessage);
}

test("a replica that does not replay pending actions is caught", async () => {
  await mustFail(counter, noReplay, /not confirmed \+ pending replay/);
}, 60_000);

test("a replica that applies entries in arrival order is caught", async () => {
  await mustFail(seats, arrivalOrder, /differs from a fold of the log|pending queue did not empty|: head/);
}, 60_000);

test("a sequencer that skips dedupe is caught", async () => {
  await mustFail(counter, noDedupe, /more than once|exactly the dispatched/);
}, 60_000);

test("a replica that ignores an epoch change is caught", async () => {
  await mustFail(counter, ignoresEpoch, /differs from a fold of the log|: head|never dispatched|pending queue did not empty/, { wipes: true });
}, 60_000);

test("a replica that never resends is caught", async () => {
  await mustFail(counter, noResend, /pending queue did not empty|exactly the dispatched/, { failures: true });
}, 60_000);
