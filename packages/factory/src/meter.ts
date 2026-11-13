// Counts calls and tokens through any model client. Tokens are estimated from characters (4 per
// token), the same way for every model, so the numbers compare across configs; cache hits count
// too, because they stand for what a live run would send. Images count 1,000 tokens each.

import type { CompleteRequest, ModelClient } from "./types.ts";

export const estTokens = (s: string) => Math.ceil(s.length / 4);

export class Meter implements ModelClient {
  calls = 0;
  tokensIn = 0;
  tokensOut = 0;
  byLabel: Record<string, { calls: number; in: number; out: number; seconds: number }> = {};
  /** Per model id: calls, output tokens and wall seconds, for output tokens per second. Cache hits are not timed. */
  byModel: Record<string, { calls: number; out: number; seconds: number; cached: number }> = {};
  constructor(
    readonly inner: ModelClient,
    /** A parent meter that also counts these calls (the fast model inside one run). */
    readonly parent?: Meter,
  ) {}
  get id() {
    return this.inner.id;
  }
  add(label: string, tin: number, tout: number, seconds = 0, model = "", cached = false) {
    const mm = model ? (this.byModel[model] ??= { calls: 0, out: 0, seconds: 0, cached: 0 }) : null;
    if (mm) {
      if (cached) mm.cached++;
      else {
        mm.calls++;
        mm.out += tout;
        mm.seconds = Math.round((mm.seconds + seconds) * 10) / 10;
      }
    }
    this.calls++;
    this.tokensIn += tin;
    this.tokensOut += tout;
    const b = (this.byLabel[label] ??= { calls: 0, in: 0, out: 0, seconds: 0 });
    b.calls++;
    b.in += tin;
    b.out += tout;
    b.seconds = Math.round((b.seconds + seconds) * 10) / 10;
    this.parent?.add(`${label}@fast`, tin, tout, seconds, model, cached);
  }
  async complete(req: CompleteRequest): Promise<string> {
    const s = performance.now();
    const hits = (this.inner as { hits?: number }).hits ?? 0;
    const reply = await this.inner.complete(req);
    const cached = ((this.inner as { hits?: number }).hits ?? 0) > hits;
    const seconds = (performance.now() - s) / 1000;
    const tin = estTokens(req.system) + req.messages.reduce((n, m) => n + estTokens(m.content), 0) + (req.images?.length ?? 0) * 1000 + (req.json ? estTokens(JSON.stringify(req.json.schema)) : 0);
    this.add(req.label ?? "call", tin, estTokens(reply), seconds, this.inner.id, cached);
    return reply;
  }
}
