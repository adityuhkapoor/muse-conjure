// bun test (in library/cache): offline, no model. Each check is shown passing on the real cache and
// failing on a broken fixture, so a check that cannot fail would be noticed.

import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkGate, checkIndex, checkLookup, type LookupAsk } from "../checks.ts";
import { shutdown } from "../deps.ts";
import { find, refill, THRESHOLD } from "../lookup.ts";
import { leaks } from "../params.ts";
import { CACHE_DIR, entryIds, readIndex, readMeta, readSource } from "../store.ts";
import type { Index } from "../types.ts";

afterAll(async () => {
  await shutdown();
});

const ids = entryIds();
const tmp = mkdtempSync(join(tmpdir(), "cache-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("index integrity", () => {
  test("the real cache has no problems and some entries", () => {
    expect(ids.length).toBeGreaterThan(0);
    expect(checkIndex(CACHE_DIR)).toEqual([]);
  });

  test("a broken fixture fails each check", () => {
    const root = join(tmp, "broken");
    mkdirSync(root);
    const id = ids[0]!;
    cpSync(join(CACHE_DIR, id), join(root, id), { recursive: true });
    cpSync(join(CACHE_DIR, id), join(root, "ghost"), { recursive: true }); // a folder the index does not list
    rmSync(join(root, id, "screenshot-played.png")); // a missing file
    writeFileSync(join(root, id, "screenshot-rest.png"), "not a png"); // a bad screenshot
    const index = readIndex();
    const e = index.entries.find((x) => x.id === id)!;
    const stale = { ...e, sentence: "something else" }; // index differs from meta
    writeFileSync(join(root, "index.json"), JSON.stringify({ version: 1, count: 3, entries: [stale, stale, { ...e, id: "nope" }] }));
    const codes = new Set(checkIndex(root).map((p) => p.code));
    for (const c of ["duplicate-id", "missing-folder", "bad-count", "unlisted", "missing-file", "stale-index", "bad-screenshot"]) expect(codes.has(c)).toBe(true);
  });

  test("every entry meets the bar recorded in its meta", () => {
    for (const id of ids) {
      const m = readMeta(id);
      expect(m.mutation_score).toBeGreaterThanOrEqual(0.8);
      expect(m.height).toBeLessThanOrEqual(420);
      expect(existsSync(join(CACHE_DIR, id, "screenshot-rest.png"))).toBe(true);
    }
  });
});

describe("the gate", () => {
  test("every cached entry passes the whole gate again", async () => {
    const problems: unknown[] = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < ids.length) {
          const id = ids[next++]!;
          problems.push(...(await checkGate(id, readSource(id))));
        }
      }),
    );
    expect(problems).toEqual([]);
  }, 1_800_000);

  test("a broken fixture fails it", async () => {
    const bad = readSource(ids[0]!).replace("export default defineApp", "const r = Math.random();\nexport default defineApp");
    const problems = await checkGate("broken", bad);
    expect(problems.map((p) => p.code)).toContain("gate-failed");
  });
});

describe("refill", () => {
  const CAST_POOL = ["Zara", "Quinn", "Idris", "Petra", "Soren", "Lucía", "Tavi", "Odette", "Rafi"];
  const chat = {
    title: "other crew",
    messages: [
      { from: "Zara", text: "ok where are we going friday" },
      { from: "Quinn", text: "tacos or ramen or the dumpling place" },
      { from: "Idris", text: "ramen" },
      { from: "Petra", text: "muse pick for us" },
    ],
  };
  const castFor = (n: number) => CAST_POOL.slice(0, Math.max(2, n)).map((name) => ({ id: `m_${name.toLowerCase()}`, name }));

  test("no name from the original chat is left, for every entry", () => {
    const bad: string[] = [];
    for (const id of ids) {
      const m = readMeta(id);
      const out = refill(id, chat, castFor(m.members.original));
      const left = leaks(out, m.origin.members);
      if (left.length) bad.push(`${id}: ${left.join(", ")}`);
    }
    expect(bad).toEqual([]);
  });

  test("the leak check sees a leaky refill", () => {
    const id = ids.find((i) => readMeta(i).params.names.length > 0) ?? ids[0]!;
    const m = readMeta(id);
    const untouched = readSource(id); // what a refill that did nothing would return
    if (m.params.names.length) expect(leaks(untouched, m.origin.members).length).toBeGreaterThan(0);
    expect(leaks("const x = 1;", ["Maya"])).toEqual([]);
    expect(leaks("const who = 'maya';", ["Maya"])).toEqual(["Maya"]);
  });

  test("refilled tools still pass the gate (a sample)", async () => {
    const sample = ids.filter((_, i) => i % Math.max(1, Math.floor(ids.length / 8)) === 0).slice(0, 8);
    const problems = [];
    for (const id of sample) problems.push(...(await checkGate(id, refill(id, chat, castFor(readMeta(id).members.original)))));
    expect(problems).toEqual([]);
  }, 600_000);
});

describe("lookup on the frozen set", () => {
  const frozen = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "lookup-frozen.json"), "utf8")) as { threshold: number; stats: ReturnType<typeof checkLookup>; index: Index; asks: LookupAsk[] };

  test("the threshold in lookup.ts is the frozen one", () => {
    expect(THRESHOLD).toBe(frozen.threshold);
  });

  test("false accepts stay under 5% of what is returned, and coverage holds", () => {
    const s = checkLookup(frozen.index, frozen.asks, THRESHOLD);
    expect(s.accepted).toBeGreaterThan(0);
    expect(s.falseAcceptRate).toBeLessThan(0.05);
    expect(s.coverage).toBeGreaterThanOrEqual(frozen.stats.coverage - 0.02);
    expect(s.top3Rate).toBeGreaterThanOrEqual(frozen.stats.top3Rate - 0.02);
  });

  test("a threshold that is too low fails the false-accept bound", () => {
    expect(checkLookup(frozen.index, frozen.asks, 0.05).falseAcceptRate).toBeGreaterThan(0.05);
  });

  test("find is fast and returns ranked candidates", () => {
    const a = frozen.asks[0]!;
    find(a.ask, a.chat, a.members, { index: frozen.index });
    const t = performance.now();
    for (let i = 0; i < 50; i++) find(a.ask, a.chat, a.members, { index: frozen.index });
    expect((performance.now() - t) / 50).toBeLessThan(5);
    const r = find(a.ask, a.chat, a.members, { index: frozen.index, limit: 3 });
    expect(r.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < r.length; i++) expect(r[i - 1]!.confidence).toBeGreaterThanOrEqual(r[i]!.confidence);
  });

  test("a fact-bound tool is not offered for a different chat", () => {
    const e = frozen.index.entries.find((x) => x.fact_bound);
    if (!e) return;
    const other = frozen.asks.find((a) => a.kind === e.kind && a.id !== e.id) ?? frozen.asks[0]!;
    const r = find(other.ask, other.chat, other.members, { index: { ...frozen.index, entries: [e] } });
    if (r[0]) expect(r[0].reusable).toBe(false);
  });
});
