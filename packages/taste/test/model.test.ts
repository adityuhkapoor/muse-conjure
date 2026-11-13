// The model against simulated swipers (offline, seeded). Numbers quoted in README.md come from
// `bun run sim`, which runs the same code with more seeds.
import { expect, test } from "bun:test";
import { info } from "../src/features.ts";
import { copyItems } from "../src/items/index.ts";
import { diff, Fitted, train } from "../src/model.ts";
import { EXCLAIMER, falseClaims, LOUD, pairAccuracy, perFeature, PLAIN, RANDOM, RARE, recovered, run, type Swiper } from "../src/sim.ts";

const T = 120_000;

function recovers(s: Swiper) {
  for (const seed of [1, 2]) {
    const r = run(s, { seed, budget: 400 });
    const got = recovered(r.model, s);
    // Most planted preferences are claimed, none wrongly, and the ranking is right on held-out pairs.
    expect(got.length / Object.keys(s.planted).length).toBeGreaterThanOrEqual(0.6);
    expect(falseClaims(r.model, s)).toEqual([]);
    expect(pairAccuracy(r.model, s)).toBeGreaterThan(0.9);
  }
}

test("recovers a swiper who likes plain, short copy", () => recovers(PLAIN), T);
test("recovers a swiper who likes loud copy", () => recovers(LOUD), T);

test("a swiper who decides at random comes out as no clear preference", () => {
  for (const seed of [1, 2, 3]) {
    const r = run(RANDOM, { seed, budget: 300 });
    expect(falseClaims(r.model, RANDOM)).toEqual([]);
    // And it knows it: which line of a pair reads better stays close to a coin flip.
    const fit = new Fitted(r.model);
    const items = copyItems();
    let worst = 0;
    for (const a of items)
      for (const b of items)
        if (a.group === b.group && a.id < b.id) {
          const { mean, variance } = fit.logit(diff(a.x, b.x));
          worst = Math.max(worst, Math.abs(1 / (1 + Math.exp(-mean / Math.sqrt(1 + (Math.PI * variance) / 8))) - 0.5));
        }
    expect(worst).toBeLessThan(0.3);
  }
}, T);

// Active selection pays off where it should: planted preferences on features few lines have.
export const ACTIVE_FACTOR_MIN = 1.5;
test(`active selection needs at least ${ACTIVE_FACTOR_MIN}x fewer judgments than random to recover a planted preference`, () => {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const n = (random: boolean) => mean([1, 2, 3].flatMap((seed) => Object.values(perFeature(RARE, { seed, budget: 800, random }))));
  const active = n(false), random = n(true);
  console.log(`rare features: active ${active.toFixed(0)}, random ${random.toFixed(0)}, factor ${(random / active).toFixed(2)}`);
  expect(random / active).toBeGreaterThanOrEqual(ACTIVE_FACTOR_MIN);
}, T);

export const OVERTURN_WITHIN = 150;
test(`a prior is overturned by contrary swipes within ${OVERTURN_WITHIN} judgments`, () => {
  for (const seed of [1, 2, 3]) {
    const at = perFeature(EXCLAIMER, { seed, budget: OVERTURN_WITHIN, usePriors: true })["copy.exclaim"]!;
    expect(at).toBeLessThanOrEqual(OVERTURN_WITHIN);
  }
}, T);

test("calibrated uncertainty: 90% intervals on the weights cover the planted values about 90% of the time", () => {
  let covered = 0, n = 0;
  for (const s of [PLAIN, LOUD, RANDOM])
    for (const seed of [1, 2]) {
      const fit = new Fitted(run(s, { seed, budget: 300 }).model);
      for (const name of fit.m.names) {
        if (!name.startsWith("copy.") || info(name).hidden) continue;
        const w = fit.weight(name)!;
        if (w.sd > 0.9) continue; // barely seen: the prior speaks, not the data
        n++;
        if (Math.abs(w.mean - (s.planted[name] ?? 0)) <= 1.645 * w.sd) covered++;
      }
    }
  console.log(`90% interval coverage: ${(covered / n).toFixed(2)} of ${n} weights`);
  expect(covered / n).toBeGreaterThanOrEqual(0.8);
}, T);

test("retrains on 1000 judgments in under 100 ms", () => {
  const r = run(PLAIN, { seed: 5, budget: 1000, every: 1000 });
  const names = [...new Set(copyItems().flatMap((c) => Object.keys(c.x)))];
  train(r.lines, { names });
  const t0 = performance.now();
  const m = train(r.lines, { names });
  expect(performance.now() - t0).toBeLessThan(100);
  expect(m.n.judgments).toBe(1000);
}, T);
