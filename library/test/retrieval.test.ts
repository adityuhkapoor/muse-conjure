// Retrieval over the whole set: the factory's 30 asks, the asks for the newer pieces, and the
// confusable asks that must still route to one of the first nine pieces.

import { expect, test } from "bun:test";
import { RETRIEVAL_SET } from "../../packages/factory/test/retrieval-set.ts";
import { retrieve } from "../../packages/factory/src/retrieve.ts";
import { CONFUSABLE, NEW_ASKS } from "./retrieval-set.ts";

type Case = { ask: string; chat: string[]; want: string };

function rate(cases: Case[]) {
  let top1 = 0, top3 = 0;
  const misses: string[] = [];
  for (const c of cases) {
    const r = retrieve({ ask: c.ask, chat: { messages: c.chat.map((text) => ({ from: "x", text })) } });
    const rank = r.findIndex((s) => s.piece.id === c.want);
    if (rank === 0) top1++;
    else misses.push(`"${c.ask}": want ${c.want}, got ${r.slice(0, 3).map((s) => `${s.piece.id} ${s.score}`).join(", ")}`);
    if (rank >= 0 && rank < 3) top3++;
  }
  return { n: cases.length, top1, top3, misses };
}

test("every new ask names a piece that exists, three or more asks per new piece", async () => {
  const { pieces } = await import("../index.ts");
  const ids = new Set(pieces().map((p) => p.id));
  for (const c of [...NEW_ASKS, ...CONFUSABLE]) expect(ids.has(c.want)).toBe(true);
  const per = new Map<string, number>();
  for (const c of NEW_ASKS) per.set(c.want, (per.get(c.want) ?? 0) + 1);
  for (const n of per.values()) expect(n).toBeGreaterThanOrEqual(3);
  expect(CONFUSABLE.length).toBe(10);
});

test("retrieval on the whole set", () => {
  const parts = { original: rate(RETRIEVAL_SET), new: rate(NEW_ASKS), confusable: rate(CONFUSABLE) };
  const all = rate([...RETRIEVAL_SET, ...NEW_ASKS, ...CONFUSABLE]);
  for (const [k, r] of Object.entries(parts)) console.log(`retrieval ${k}: top-1 ${r.top1}/${r.n}, top-3 ${r.top3}/${r.n}`);
  console.log(`retrieval whole set: top-1 ${all.top1}/${all.n}, top-3 ${all.top3}/${all.n}`);
  for (const m of all.misses) console.log(`  miss ${m}`);
  // The factory's own bar on its 30 asks still holds with the new pieces in the library.
  expect(parts.original.top1).toBeGreaterThanOrEqual(27);
  expect(parts.original.top3).toBe(30);
  expect(parts.confusable.top1).toBeGreaterThanOrEqual(9);
  expect(parts.new.top1 / parts.new.n).toBeGreaterThanOrEqual(0.85);
  expect(all.top3).toBeGreaterThanOrEqual(all.n - 2);
});
