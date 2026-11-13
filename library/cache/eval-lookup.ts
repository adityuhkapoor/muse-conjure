// bun library/cache/eval-lookup.ts [--write]
// Measures `find` on the held-out asks and the generated ones (leave one out), at a range of confidence
// thresholds, and says which threshold keeps the false-accept rate under 5% of the tools returned.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { checkLookup, type LookupAsk } from "./checks.ts";
import { THRESHOLD } from "./lookup.ts";
import { readIndex } from "./store.ts";

const ASKS = join(import.meta.dir, "..", "..", "scripts", "pregen", "asks");
const load = (dir: string): LookupAsk[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as LookupAsk & { heldout: boolean });

export const generated = () => load(ASKS);
export const heldout = () => load(join(ASKS, "heldout"));

if (import.meta.main) {
  const index = readIndex();
  const sets: [string, LookupAsk[]][] = [["held-out", heldout()], ["generated", generated()], ["all", [...heldout(), ...generated()]]];
  console.log(`index: ${index.count} entries, ${new Set(index.entries.map((e) => e.kind)).size} kinds\n`);
  for (const [name, asks] of sets) {
    console.log(`## ${name} (${asks.length} asks)`);
    console.log("threshold | accepted | correct | false-accept (of accepted) | false-accept (of asks) | coverage | top-1 | top-3");
    for (const t of [0.3, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9]) {
      const s = checkLookup(index, asks, t);
      console.log(`${t.toFixed(2)} | ${s.accepted} | ${s.correct} | ${(s.falseAcceptRate * 100).toFixed(1)}% | ${(s.falseAcceptPerQuery * 100).toFixed(1)}% | ${(s.coverage * 100).toFixed(1)}% | ${(s.top1Rate * 100).toFixed(1)}% (${s.top1}/${s.answerable}) | ${(s.top3Rate * 100).toFixed(1)}%`);
    }
    console.log("");
  }
  console.log(`THRESHOLD in lookup.ts is ${THRESHOLD}`);
}
