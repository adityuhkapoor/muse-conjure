// Disk cache for model replies, keyed by a hash of everything that shapes the reply. Reruns of
// the same request cost nothing. Lives in packages/factory/.cache (git-ignored).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CompleteRequest, ModelClient } from "./types.ts";

export const CACHE_DIR = process.env.MUSE_FACTORY_CACHE ?? join(import.meta.dir, "..", ".cache");

export function hashOf(value: unknown): string {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

/** Wraps a client so identical requests are answered from disk. `hits` counts cache answers. */
export class CachedClient implements ModelClient {
  hits = 0;
  misses = 0;
  constructor(
    readonly inner: ModelClient,
    readonly dir = CACHE_DIR,
  ) {}
  get id() {
    return this.inner.id;
  }
  async complete(req: CompleteRequest & { nonce?: number }): Promise<string> {
    const key = hashOf({ model: this.inner.id, system: req.system, messages: req.messages, json: req.json ?? null, images: req.images ?? [], effort: req.effort ?? null, nonce: req.nonce ?? 0 });
    const file = join(this.dir, `${key}.json`);
    if (existsSync(file)) {
      this.hits++;
      return (JSON.parse(readFileSync(file, "utf8")) as { reply: string }).reply;
    }
    this.misses++;
    const reply = await this.inner.complete(req);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ model: this.inner.id, label: req.label ?? "", reply }));
    return reply;
  }
}
