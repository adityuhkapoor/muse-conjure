// Embedding-free retrieval: keyword and metadata scoring over the ask and the recent chat.
// Measured by test/retrieval.test.ts (30 asks mapped to the piece that should come first).

import { pieces, type Piece } from "@muse/library";
import type { GenerateRequest } from "./types.ts";

const STOP = new Set(["the", "a", "an", "to", "for", "of", "and", "or", "is", "it", "we", "us", "you", "i", "me", "my", "our", "on", "in", "at", "be", "do", "can", "this", "that", "with", "so", "lol", "lmao", "muse", "pls", "please", "make", "just", "like", "rn", "ok", "okay", "yeah", "ya", "u", "im", "its", "all"]);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9$]+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

function stem(w: string) {
  return w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
}

export type Scored = { piece: Piece; score: number; hits: string[] };

/** Rank every piece. The ask counts three times as much as the chat; money signs count for split. */
export function retrieve(req: Pick<GenerateRequest, "ask" | "chat">): Scored[] {
  const ask = tokens(req.ask);
  const chat = tokens(req.chat.messages.slice(-12).map((m) => m.text).join(" "));
  const money = /\$\s?\d|\d+\.\d\d\b/.test(req.ask + " " + req.chat.messages.slice(-12).map((m) => m.text).join(" "));
  return pieces()
    .map((p) => {
      const kw = new Set(p.keywords.map((k) => stem(k.toLowerCase())));
      const useWords = new Set(tokens(p.use_when.join(" ")));
      const dontWords = new Set(tokens(p.dont_use_when.join(" ")));
      const hits: string[] = [];
      let score = 0;
      for (const w of ask) {
        if (kw.has(w)) (score += 3), hits.push(w);
        else if (useWords.has(w)) score += 1;
        if (dontWords.has(w) && !kw.has(w)) score -= 0.5;
      }
      for (const w of chat) if (kw.has(w)) score += 0.5;
      if (p.id === "split" && money) score += 3;
      return { piece: p, score, hits };
    })
    .sort((a, b) => b.score - a.score || a.piece.id.localeCompare(b.piece.id));
}
