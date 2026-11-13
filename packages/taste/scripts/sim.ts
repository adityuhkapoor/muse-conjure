// bun run sim: how the model does against simulated swipers. Prints the numbers the README quotes.
import { copyItems } from "../src/items/index.ts";
import { train } from "../src/model.ts";
import { EXCLAIMER, falseClaims, LOUD, pairAccuracy, perFeature, PLAIN, RANDOM, RARE, recovered, run } from "../src/sim.ts";

const SEEDS = [1, 2, 3, 4, 5, 6];
const BUDGET = 800;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pool = copyItems();
console.log(`copy pool: ${pool.length} lines in ${new Set(pool.map((p) => p.group)).size} groups; ${SEEDS.length} seeds; recovered = right sign at "likely" or better`);

for (const s of [PLAIN, LOUD, RARE]) {
  const per = { active: [] as number[], random: [] as number[] };
  for (const method of ["active", "random"] as const) for (const seed of SEEDS) per[method].push(...Object.values(perFeature(s, { seed, budget: BUDGET, random: method === "random" })));
  const at = SEEDS.map((seed) => run(s, { seed, budget: 300 }));
  console.log(`\n${s.name}: planted ${Object.entries(s.planted).map(([k, w]) => `${k.slice(5)} ${w > 0 ? "+" : ""}${w}`).join(", ")}`);
  console.log(`  judgments to recover a planted preference (mean): active ${mean(per.active).toFixed(0)}, random ${mean(per.random).toFixed(0)}, factor ${(mean(per.random) / mean(per.active)).toFixed(2)}`);
  console.log(`  after 300 judgments: planted recovered ${(100 * mean(at.map((r) => recovered(r.model, s).length / Object.keys(s.planted).length))).toFixed(0)}%, held-out pair accuracy ${(100 * mean(at.map((r) => pairAccuracy(r.model, s)))).toFixed(0)}%, false claims per seed ${at.map((r) => falseClaims(r.model, s).length).join(" ")}`);
}

const rnd = SEEDS.map((seed) => run(RANDOM, { seed, budget: 300 }));
console.log(`\nrandom swiper, 300 judgments: confident claims per seed ${rnd.map((r) => falseClaims(r.model, RANDOM).length).join(" ")}`);

const over = SEEDS.map((seed) => perFeature(EXCLAIMER, { seed, budget: 400, usePriors: true })["copy.exclaim"]!);
console.log(`prior "avoids exclamation marks" overturned (likes them, likely or better) after: ${over.join(" ")} judgments (max ${Math.max(...over)})`);

const big = run(PLAIN, { seed: 1, budget: 1000, every: 1000 });
const t0 = performance.now();
const m = train(big.lines, { names: [...new Set(pool.flatMap((p) => Object.keys(p.x)))] });
console.log(`retrain on 1000 judgments: ${(performance.now() - t0).toFixed(1)} ms (${m.names.length} features)`);
