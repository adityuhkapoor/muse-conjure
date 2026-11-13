import { expect, test } from "bun:test";
import { retrievalRate } from "../src/retrieval-report.ts";

test("retrieval ranks the right piece first for at least 27 of 30 asks, and in the top 3 for all", () => {
  const r = retrievalRate();
  console.log(`retrieval: top-1 ${r.top1}/${r.n}, top-3 ${r.top3}/${r.n}`);
  expect(r.n).toBe(30);
  expect(r.top1).toBeGreaterThanOrEqual(27);
  expect(r.top3).toBe(30);
});
