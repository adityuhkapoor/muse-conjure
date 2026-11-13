// Replay: answers from recordings on disk. Used by tests and as the guaranteed demo path.
//
// A recording is { requestKey, label, reply }. Lookup is by the hash of the request first, then
// by the "match" field (a label plus a substring of the last user message), so recordings keep
// working after small prompt edits.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashOf } from "../cache.ts";
import type { CompleteRequest, ModelClient } from "../types.ts";

export type Recording = { key: string; label: string; match?: string; reply: string };

export const REPLAY_DIR = join(import.meta.dir, "..", "..", "fixtures", "replay");

export function requestKey(req: CompleteRequest): string {
  return hashOf({ system: req.system, messages: req.messages, json: req.json?.name ?? null });
}

export class ReplayClient implements ModelClient {
  readonly id = "replay";
  private byKey = new Map<string, Recording>();
  private all: Recording[] = [];
  constructor(readonly dirs: string[] = [REPLAY_DIR]) {
    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
        const file = JSON.parse(readFileSync(join(dir, f), "utf8")) as { calls: Recording[] };
        for (const r of file.calls) {
          this.byKey.set(r.key, r);
          this.all.push(r);
        }
      }
    }
  }
  async complete(req: CompleteRequest): Promise<string> {
    const hit = this.byKey.get(requestKey(req));
    if (hit) return hit.reply;
    const last = req.messages.at(-1)?.content ?? "";
    const loose = this.all.find((r) => r.label === (req.label ?? "") && r.match && last.includes(r.match));
    if (loose) return loose.reply;
    throw new Error(`replay: no recording for ${req.label ?? "call"} (${requestKey(req)})`);
  }
}

/** Wraps a live client and keeps every call, so a good run can be saved as a fixture. */
export class Recorder implements ModelClient {
  calls: Recording[] = [];
  constructor(readonly inner: ModelClient) {}
  get id() {
    return this.inner.id;
  }
  async complete(req: CompleteRequest): Promise<string> {
    const reply = await this.inner.complete(req);
    this.calls.push({ key: requestKey(req), label: req.label ?? "", reply });
    return reply;
  }
  save(file: string, match?: (r: Recording) => string | undefined, keep?: (r: Recording) => boolean) {
    mkdirSync(join(file, ".."), { recursive: true });
    const calls = this.calls.filter((r) => (keep ? keep(r) : true)).map((r) => ({ ...r, ...(match ? { match: match(r) } : {}) }));
    writeFileSync(file, JSON.stringify({ calls }, null, 1));
  }
}
