// The four replay fixtures in packages/factory/fixtures/replay are version 2 apps: each passes
// the full gate at a mutation score of 0.7 or more, and one with its member handling removed does not.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { shutdown, verify, warm } from "@muse/verify";

const DIR = join(import.meta.dir, "..", "..", "packages", "factory", "fixtures", "replay");
const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx")).sort();

beforeAll(() => warm());
afterAll(() => shutdown());

test("there are four fixtures", () => {
  expect(files).toEqual(["chore-wheel-apt4b.tsx", "dinner-split.tsx", "sza-whos-in.tsx", "where-eating.tsx"]);
});

for (const f of files) {
  test(`fixture ${f} passes the gate`, async () => {
    const r = await verify(readFileSync(join(DIR, f), "utf8"));
    if (!r.ok) console.log(f, r.stage, JSON.stringify(r.failures).slice(0, 500));
    expect(r.ok).toBe(true);
    expect(r.ran).toContain("render");
    console.log(`${f}: mutation ${r.mutation?.score}`);
    expect(r.mutation?.score ?? 0).toBeGreaterThanOrEqual(0.7);
  }, 60_000);
}

test("broken variant: a fixture whose onMembers is removed fails the gate", async () => {
  const src = readFileSync(join(DIR, "chore-wheel-apt4b.tsx"), "utf8");
  const a = src.indexOf("  onMembers:");
  const b = src.indexOf("  invariants:");
  expect(a).toBeGreaterThan(0);
  const r = await verify(src.slice(0, a) + src.slice(b));
  expect(r.ok).toBe(false);
  expect(r.stage).toBe("invariants");
}, 60_000);
