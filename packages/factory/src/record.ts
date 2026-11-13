// bun src/record.ts [--model muse]
// Records the four demo fixtures as replay files: runs each ask through the live (cached) model,
// keeps it only if it passes the gate, and saves the model calls to fixtures/replay/<id>.json.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, warm } from "@muse/verify";
import { ASKS } from "../eval/asks.ts";
import { generate } from "./generate.ts";
import { makeModel } from "./models/index.ts";
import { Recorder, REPLAY_DIR } from "./models/replay.ts";

export const DEMO_IDS = ["chore-wheel-apt4b", "where-eating", "sza-whos-in", "dinner-split"];

const i = process.argv.indexOf("--model");
const modelId = i >= 0 ? process.argv[i + 1]! : "muse";
await warm();
for (const id of DEMO_IDS) {
  const ask = ASKS.find((a) => a.id === id)!;
  const rec = new Recorder(makeModel(modelId, { patient: true }));
  const r = await generate(ask, rec);
  if (!r.ok) {
    console.error(`skip ${id}: ${r.error}`);
    continue;
  }
  rec.save(join(REPLAY_DIR, `${id}.json`), () => `The ask: "${ask.ask}"`);
  writeFileSync(join(REPLAY_DIR, `${id}.tsx`), r.source);
  console.log(`recorded ${id}: ${r.from.path}${r.from.piece ? `/${r.from.piece}` : ""}, ${rec.calls.length} calls, mutation ${r.report?.mutation?.score}`);
}
await shutdown();
