// Optional (--cast-model): replies to a presenter's free-form message from a model, under the
// same voice rules as the hand-written lines and a hard length cap. Uses a Muse model if the
// key is set; anything slow, long or assistant-like is dropped and a bank line is used.

import { clip, MAX_LINE, voiceOk } from "./lines.ts";
import type { ModelReply } from "./director.ts";
import { MuseClient } from "../../../packages/factory/src/models/muse.ts";

const SYSTEM = (first: string) =>
  `You are ${first}, a college student texting friends in a group chat. Reply with one short text message, ` +
  `at most 8 words, all lowercase, no exclamation marks, no emoji unless it is one, clipped like real texting. ` +
  `Never sound helpful or polite like an assistant. Never mention muse, ai or being a bot. Output only the message.`;

export function museModel(model: string, timeoutMs = 8000): ModelReply {
  return async (p, tail, text) => {
    const prompt = `Recent chat:\n${tail.map((m) => `${m.from}: ${m.text}`).join("\n")}\n\nReply to: ${text}`;
    try {
      const out = await new MuseClient({ model, effort: "low", timeoutMs, retries: 0 }).complete({ label: "cast-reply", system: SYSTEM(p.first), messages: [{ role: "user", content: prompt }] });
      return clean(out);
    } catch {
      return null;
    }
  };
}

/** One line, lowercase, quotes and trailing dots off, inside the cap; null if it breaks a rule. */
export function clean(raw: string): string | null {
  const first = raw.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const s = clip(first.replace(/^["'“”]+|["'“”]+$/g, "").replace(/^[a-z]+:\s*/i, "").replace(/\.+$/, "").replace(/!/g, "").toLowerCase());
  return s.length <= MAX_LINE && voiceOk(s) ? s : null;
}
