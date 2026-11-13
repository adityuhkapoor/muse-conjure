// Every ask that ended without a Mini, one JSON line each: the list future Minis get built from.
// Server side only. MUSE_MISSES names the file (the demo puts it in its data dir); default
// .cache/misses.jsonl. Each one also prints a `miss:` line.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { CACHE_DIR } from "./cache.ts";
import { nearest } from "./router.ts";

export type Miss = { chat?: string; ask: string; code: string; exit: string; text?: string; candidates?: string[] };

export function missFile(): string {
  return process.env.MUSE_MISSES ?? join(CACHE_DIR, "misses.jsonl");
}

export function logMiss(m: Miss) {
  // a redirect to a change of the chat's Mini is not a miss: that Mini changes
  if (m.code === "change") return;
  const entry = { at: new Date().toISOString(), chat: m.chat ?? "", ask: m.ask.slice(0, 300), code: m.code, exit: m.exit, ...(m.text ? { text: m.text } : {}), candidates: m.candidates?.length ? m.candidates : nearest(m.ask) };
  console.log(`miss: ${entry.code} (${entry.exit}) "${entry.ask.slice(0, 80)}" near ${entry.candidates.join(", ") || "nothing"}`);
  try {
    const f = missFile();
    mkdirSync(dirname(f), { recursive: true });
    appendFileSync(f, JSON.stringify(entry) + "\n");
  } catch {
    // the log never breaks a build
  }
}
