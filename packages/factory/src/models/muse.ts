// Muse: a Responses-style API at api.meta.ai. The key is read from the macOS Keychain
// at run time, held in memory only, and scrubbed from every error message.

import type { CompleteRequest, ModelClient } from "../types.ts";

export const MUSE_BASE = "https://api.meta.ai/v1";
export const MUSE_MODELS = ["muse-spark-1.3-contributor", "muse-spark-1.3", "muse-ember-1.0"] as const;

let key: string | null = null;
/** The key: the MUSE_API_KEY variable (Linux, CI), else the macOS Keychain item meta-muse-api-key. Never logged. */
export function museKey(): string {
  if (key) return key;
  const env = process.env.MUSE_API_KEY?.trim();
  if (env) return (key = env);
  const r = Bun.spawnSync(["security", "find-generic-password", "-s", "meta-muse-api-key", "-w"], { stdout: "pipe", stderr: "pipe" });
  const k = r.stdout.toString().trim();
  if (r.exitCode !== 0 || !k) throw new Error("Muse key not found: set MUSE_API_KEY or add the Keychain item meta-muse-api-key");
  key = k;
  return k;
}

/** True when a Muse key can be read (the key itself is not returned). */
export function museKeyAvailable(): boolean {
  try {
    return !!museKey();
  } catch {
    return false;
  }
}

export const MUSE_KEY_HELP = 'Muse key not found, so the demo runs on recorded answers only. Add it with: security add-generic-password -s meta-muse-api-key -a "$USER" -w   (or set MUSE_API_KEY)';

/** Remove the key from any text before it reaches a log or an error. */
export function scrub(text: string): string {
  return key ? text.split(key).join("[key]") : text;
}

export type MuseOptions = { model?: string; effort?: "low" | "medium" | "high"; timeoutMs?: number; retries?: number };

export class MuseError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(scrub(message));
  }
}

export class MuseClient implements ModelClient {
  readonly id: string;
  constructor(readonly opts: MuseOptions = {}) {
    this.id = `muse:${opts.model ?? "muse-spark-1.3"}:${opts.effort ?? "medium"}`;
  }

  body(req: CompleteRequest): Record<string, unknown> {
    const input = req.messages.map((m) => ({
      role: m.role,
      content: [
        { type: m.role === "assistant" ? "output_text" : "input_text", text: m.content },
        ...(m.role === "user" && req.images ? req.images.map((url) => ({ type: "input_image", image_url: url, detail: "auto" })) : []),
      ],
    }));
    return {
      model: this.opts.model ?? "muse-spark-1.3",
      instructions: req.system,
      input,
      reasoning: { effort: req.effort ?? this.opts.effort ?? "medium" },
      ...(req.json ? { text: { format: { type: "json_schema", name: req.json.name, schema: req.json.schema, strict: true } } } : {}),
    };
  }

  async raw(body: Record<string, unknown>, timeoutMs = this.opts.timeoutMs ?? 180_000): Promise<{ status: number; json: unknown; text: string; ms: number }> {
    const t0 = performance.now();
    const res = await fetch(`${MUSE_BASE}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${museKey()}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch((e: unknown) => {
      throw new MuseError(`Muse request failed: ${e instanceof Error ? e.message : String(e)}`, null);
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text: scrub(text), ms: Math.round(performance.now() - t0) };
  }

  async complete(req: CompleteRequest): Promise<string> {
    const retries = this.opts.retries ?? 2;
    for (let attempt = 0; ; attempt++) {
      const r = await this.raw(this.body(req)).catch((e: MuseError) => ({ status: -1, json: null, text: e.message, ms: 0 }));
      if (r.status === 200) {
        if (process.env.MUSE_LOG_CALLS) console.log(`factory: muse-call ${req.label ?? "-"} ${this.opts.model ?? "muse-spark-1.3"} ${req.effort ?? this.opts.effort ?? "medium"} ${r.ms} ms`);
        return outputText(r.json);
      }
      const retryable = r.status === -1 || r.status === 429 || r.status >= 500;
      // An overloaded backend (429, 503) gets more and longer waits than other errors: up to about
      // two minutes in all, then it gives up.
      const busy = r.status === 429 || r.status === 503;
      if (!retryable || attempt >= (busy && this.opts.retries === undefined ? 6 : retries)) throw new MuseError(`Muse ${r.status}: ${r.text.slice(0, 400)}`, r.status);
      await Bun.sleep(busy ? Math.min(30_000, 2000 * 2 ** attempt) : 800 * 2 ** attempt);
    }
  }
}

/** The text of the last message item in a Responses API reply. */
export function outputText(json: unknown): string {
  const r = json as { output?: { type: string; content?: { type?: string; text?: string }[] }[]; output_text?: string };
  if (typeof r?.output_text === "string" && r.output_text) return r.output_text;
  const last = (r?.output ?? []).filter((o) => o.type === "message").at(-1);
  return (last?.content ?? []).map((c) => c.text ?? "").join("");
}
