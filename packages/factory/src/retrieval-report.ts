// Prints the retrieval hit rate on the 30-ask set: top-1 and top-3, and each miss.
import { RETRIEVAL_SET } from "../test/retrieval-set.ts";
import { retrieve } from "./retrieve.ts";

export function retrievalRate() {
  let top1 = 0, top3 = 0;
  const misses: string[] = [];
  for (const c of RETRIEVAL_SET) {
    const r = retrieve({ ask: c.ask, chat: { messages: c.chat.map((text) => ({ from: "x", text })) } });
    const rank = r.findIndex((s) => s.piece.id === c.want);
    if (rank === 0) top1++;
    else misses.push(`"${c.ask}": want ${c.want}, got ${r.slice(0, 3).map((s) => `${s.piece.id} ${s.score}`).join(", ")}`);
    if (rank < 3) top3++;
  }
  return { n: RETRIEVAL_SET.length, top1, top3, misses };
}

if (import.meta.main) {
  const r = retrievalRate();
  console.log(`retrieval: top-1 ${r.top1}/${r.n}, top-3 ${r.top3}/${r.n}`);
  for (const m of r.misses) console.log(`  miss ${m}`);
}
