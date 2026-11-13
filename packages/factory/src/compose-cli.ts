// bun src/compose-cli.ts --ask <id from eval/asks.ts> [--model muse:muse-spark-1.3] [--fast muse:muse-ember-1.0]
//   [--speed fast|normal|best]
// Runs compose() on one development ask (never the held-out set) and prints each event. Writes the
// tool, the reading, the design card and the critic's notes to eval/out/dev/<model>/<ask>/.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, warm } from "@muse/verify";
import { ASKS } from "../eval/asks.ts";
import { closeShoot, compose, type Speed } from "./compose.ts";
import { Meter } from "./meter.ts";
import { CachedClient } from "./cache.ts";
import { makeModel, MuseClient } from "./models/index.ts";

/** Muse calls that write a whole tool can take minutes under load: give them 10. */
const client = (id: string) => (id.startsWith("muse:") ? new CachedClient(new MuseClient({ model: id.slice(5), timeoutMs: 600_000 })) : makeModel(id));

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
};
const ask = ASKS.find((a) => a.id === arg("ask", ""));
if (!ask) {
  console.error(`usage: --ask one of ${ASKS.map((a) => a.id).join(", ")}`);
  process.exit(2);
}
const modelId = arg("model", "muse:muse-spark-1.3");
const fastId = arg("fast", "");
const meter = new Meter(client(modelId));
const fast = fastId ? new Meter(client(fastId), meter) : undefined;
await warm();
const t0 = performance.now();
const r = await compose(ask, meter, {
  speed: arg("speed", "normal") as Speed,
  ...(fast ? { fast } : {}),
  onEvent: (e) => console.error(`${((performance.now() - t0) / 1000).toFixed(1)}s ${JSON.stringify(e).slice(0, 220)}`),
});
const dir = join(import.meta.dir, "..", "eval", "out", "dev", modelId.replace(/[^a-z0-9.-]+/gi, "_"), ask.id);
mkdirSync(dir, { recursive: true });
if (r.source) writeFileSync(join(dir, "app.tsx"), r.source);
writeFileSync(join(dir, "result.json"), JSON.stringify({ ok: r.ok, error: r.error, timings: r.timings, extra: r.extra, tokens: { in: meter.tokensIn, out: meter.tokensOut, byLabel: meter.byLabel } }, null, 1));
console.log(`${r.ok ? "pass" : "FAIL"} · ${r.extra.route.path} ${r.extra.route.base ?? ""} · critic ${r.extra.critic ? JSON.stringify(r.extra.critic.scores) : "-"} · taste ${JSON.stringify(r.extra.taste)} · ${r.timings.total}s · ~${Math.round((meter.tokensIn + meter.tokensOut) / 1000)}k tokens · build prompt ~${r.extra.buildPromptTokens} · ${dir}`);
if (r.error) console.log(r.error);
await closeShoot();
await shutdown();
