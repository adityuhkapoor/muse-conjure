// One config value picks the generator: "muse[:model]" (the default) or "replay".

import { CachedClient } from "../cache.ts";
import type { ModelClient } from "../types.ts";
import { MuseClient, reportCall } from "./muse.ts";
import { ReplayClient } from "./replay.ts";

export { MuseClient, ReplayClient };

export const DEFAULT_MODEL = "muse";
export const MUSE_DEFAULT = "muse-spark-1.3-contributor";
/** Dollars per million tokens, in and out. */
export const PRICES: Record<string, [number, number]> = { "muse-spark-1.3-contributor": [0.1, 0.2], "muse-spark-1.3": [1.25, 4.25] };

/** e.g. "muse", "muse:muse-ember-1.0", "replay". */
export function makeModel(config: string = process.env.MUSE_MODEL ?? DEFAULT_MODEL, opts: { cache?: boolean; /** offline scripts: long timeouts and many retries (the live path gives up after 45 s and one retry) */ patient?: boolean } = {}): ModelClient {
  const [kind, name] = config.split(/:(.*)/s) as [string, string | undefined];
  if (/wonder/i.test(config)) throw new Error("muse-wonder-1.0 is not used; pick another Muse model");
  if (kind === "replay") return new ReplayClient();
  // The contributor tier is the default Muse build model; plain muse-spark-1.3 stays selectable.
  let client: ModelClient;
  if (kind === "muse") client = new MuseClient({ model: name || MUSE_DEFAULT, ...(opts.patient ? {} : { timeoutMs: 45_000, retries: 1 }) });
  else {
    // Any other provider plugs in here: MUSE_LOCAL_MODELS names a module that exports `providers`,
    // a map from a kind ("acme") to (name) => ModelClient. Then MUSE_MODEL="acme:some-model" uses it.
    const path = process.env.MUSE_LOCAL_MODELS;
    const make = path ? (require(path) as { providers?: Record<string, (name?: string) => ModelClient> }).providers?.[kind] : undefined;
    if (!make) throw new Error(`unknown model config "${config}"; use muse or replay`);
    const inner = make(name);
    // timed here so measurements see every provider the same way
    client = {
      get id() {
        return inner.id;
      },
      async complete(req) {
        const t0 = performance.now();
        try {
          return await inner.complete(req);
        } finally {
          reportCall({ label: req.label ?? "-", model: inner.id, effort: req.effort ?? "-", ms: Math.round(performance.now() - t0), input: 0, cached: 0, output: 0, reasoning: 0 });
        }
      },
    };
  }
  // MUSE_NO_CACHE=1: every call goes to the model (speed measurements)
  return opts.cache === false || process.env.MUSE_NO_CACHE ? client : new CachedClient(client);
}
