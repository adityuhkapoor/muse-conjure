// A Muse client that counts real spend from the API's usage numbers and refuses calls past a cap.
// Spend is kept in a file, so separate processes share one cap. Used for muse-wonder-1.0, which the
// owner approved for spec writing only, with a hard cap.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MuseClient, outputText } from "./models/muse.ts";
import type { CompleteRequest, ModelClient } from "./types.ts";

export type Spend = { usd: number; calls: number; in: number; out: number };

export class BudgetedMuse implements ModelClient {
  readonly id: string;
  private inner: MuseClient;
  constructor(
    model: string,
    readonly ledger: string,
    readonly capUsd: number,
    /** Dollars per million tokens, in and out (reasoning tokens bill as output). */
    readonly price: [number, number],
  ) {
    this.inner = new MuseClient({ model, timeoutMs: 600_000 });
    this.id = this.inner.id;
  }
  spent(): Spend {
    return existsSync(this.ledger) ? (JSON.parse(readFileSync(this.ledger, "utf8")) as Spend) : { usd: 0, calls: 0, in: 0, out: 0 };
  }
  async complete(req: CompleteRequest): Promise<string> {
    // Stop before the cap: refuse when a typical spec call (20k in, 8k out) would cross it.
    const next = (20_000 * this.price[0] + 8_000 * this.price[1]) / 1e6;
    const s = this.spent();
    if (s.usd + next > this.capUsd) throw new Error(`budget: ${this.id} has spent $${s.usd.toFixed(2)} of $${this.capUsd}; refusing`);
    for (let attempt = 0; ; attempt++) {
      const r = await this.inner.raw(this.inner.body(req));
      if (r.status === 200) {
        const u = (r.json as { usage?: { input_tokens?: number; output_tokens?: number } }).usage ?? {};
        const now = this.spent();
        const tin = u.input_tokens ?? 0;
        const tout = u.output_tokens ?? 0;
        const usd = now.usd + (tin * this.price[0] + tout * this.price[1]) / 1e6;
        mkdirSync(dirname(this.ledger), { recursive: true });
        writeFileSync(this.ledger, JSON.stringify({ usd: Math.round(usd * 10000) / 10000, calls: now.calls + 1, in: now.in + tin, out: now.out + tout }));
        return outputText(r.json);
      }
      if (attempt >= 4 || !(r.status === -1 || r.status === 429 || r.status >= 500)) throw new Error(`Muse ${r.status}: ${r.text.slice(0, 300)}`);
      await Bun.sleep(3000 * 2 ** attempt);
    }
  }
}
