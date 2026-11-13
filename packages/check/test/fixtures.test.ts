// Every property has a fixture that must fail it, with a trace of the expected minimal length
// (from the fixture's `// Expect: <property>, trace <n>.` line). A check never seen failing
// proves nothing.
import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Sequencer } from "../../sync/src/index.ts";
import { check } from "../src/index.ts";
import { setSequencer } from "../src/concurrency.ts";

const DIR = join(import.meta.dir, "fixtures");
const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx")).sort();

describe("each property catches its fixture with a shortest trace", () => {
  for (const f of files) {
    const src = readFileSync(join(DIR, f), "utf8");
    const m = /\/\/ Expect: ([^,\n]+), trace (\d+)\./.exec(src);
    if (!m) continue;
    const [, prop, len] = m;
    test(`${f}: ${prop} in ${len} steps`, () => {
      const r = check(src);
      const hit = r.properties.find((p) => p.id === prop || (prop === "invariant:count stays under 4" && p.id === prop));
      expect(hit?.status).toBe(prop === "silent-conflict" ? "warn" : "fail");
      expect(hit!.failure!.trace!.length).toBe(Number(len));
      if (prop !== "silent-conflict") expect(r.verdict).toBe("failed");
    });
  }
});

describe("sync-level properties, with a broken sequencer", () => {
  afterEach(() => setSequencer(null));

  test("duplicate: a sequencer that forgets (client, cseq) dedupe applies a resend twice", () => {
    const src = readFileSync(join(DIR, "silent-lost-update.tsx"), "utf8");
    expect(check(src).properties.find((p) => p.id === "duplicate")!.status).toBe("pass");
    class Forgetful extends Sequencer {
      protected override findDuplicate(): number | undefined {
        return undefined;
      }
    }
    setSequencer((o) => new Forgetful(o));
    const p = check(src).properties.find((p) => p.id === "duplicate")!;
    expect(p.status).toBe("fail");
    expect(p.failure!.trace!.length).toBeGreaterThanOrEqual(4);
  });

  test("convergence: a sequencer that sends one client a different action splits the replicas", () => {
    const src = readFileSync(join(DIR, "silent-lost-update.tsx"), "utf8");
    expect(check(src).properties.find((p) => p.id === "convergence")!.status).toBe("pass");
    class TwoFaced extends Sequencer {
      protected override to(conn: number, m: Parameters<Sequencer["to"]>[1]) {
        if (conn % 2 === 0 && m.t === "entry") m = { ...m, entry: { ...m.entry, action: { t: "rename", title: "Other" } } };
        super.to(conn, m);
      }
    }
    setSequencer((o) => new TwoFaced(o));
    const p = check(src).properties.find((p) => p.id === "convergence")!;
    expect(p.status).toBe("fail");
  });
});

describe("verdicts", () => {
  test("a bounded pass never says complete", () => {
    const r = check(readFileSync(join(DIR, "good-counter.tsx"), "utf8"));
    expect(r.verdict).toBe("bounded");
    expect(r.bounded.join(" ")).toContain("derived from arbitrary");
    expect(r.guarantee).toContain("Bounded pass");
  });
  test("a declared enumerator on a small space gives complete", () => {
    const src = readFileSync(join(DIR, "good-counter.tsx"), "utf8").replace("arbitrary: () => ({ t: \"tap\" }),", "arbitrary: () => ({ t: \"tap\" }),\n  actions: () => [{ t: \"tap\" }],");
    const r = check(src, { concurrencyDepth: 99, maxDepth: 99, maxCombos: 1_000_000, budgetMs: 60_000 });
    expect(r.stats.exhausted).toBe(true);
    expect(r.verdict).toBe("complete");
  });
  test("reports are plain JSON", () => {
    const r = check(readFileSync(join(DIR, "seat-race.tsx"), "utf8"));
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
