// bun fixtures/regen.ts
// Rebuilds the four demo fixtures from their recorded model replies: replays each ask, checks the
// result through the gate, writes the app to fixtures/replay/<id>.tsx and refreshes the request
// keys in <id>.json to match the current prompts. Offline; no live model is called.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, warm } from "@muse/verify";
import { ASKS } from "../eval/asks.ts";
import { generate } from "../src/generate.ts";
import { ReplayClient, requestKey, REPLAY_DIR, type Recording } from "../src/models/replay.ts";
import type { CompleteRequest, ModelClient } from "../src/types.ts";

const IDS = ["chore-wheel-apt4b", "where-eating", "sza-whos-in", "dinner-split"];
await warm();
let failed = 0;
for (const id of IDS) {
  const ask = ASKS.find((a) => a.id === id)!;
  const replay = new ReplayClient();
  const calls: Recording[] = [];
  const spy: ModelClient = {
    id: "replay",
    async complete(req: CompleteRequest) {
      const reply = await replay.complete(req);
      calls.push({ key: requestKey(req), label: req.label ?? "", reply, match: `The ask: "${ask.ask}"` });
      return reply;
    },
  };
  const r = await generate(ask, spy);
  if (!r.ok || !r.report?.ok) {
    console.error(`FAIL ${id}: ${r.error ?? JSON.stringify(r.report?.failures).slice(0, 400)}`);
    failed++;
    continue;
  }
  writeFileSync(join(REPLAY_DIR, `${id}.tsx`), r.source);
  writeFileSync(join(REPLAY_DIR, `${id}.json`), JSON.stringify({ calls }, null, 1));
  console.log(`ok ${id}: ${r.from.path}${r.from.piece ? `/${r.from.piece}` : ""}, ${calls.length} calls, mutation ${r.report.mutation?.score}`);
}
await shutdown();
process.exit(failed ? 1 : 0);
