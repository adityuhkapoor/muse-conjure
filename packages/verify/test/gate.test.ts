import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RULES } from "../src/copy/rules.ts";
import { type Report, shutdown, verify, warm } from "../src/index.ts";
import { replay } from "../src/replay.ts";
import { copyLint, extractCopy } from "../src/stages/copy.ts";
import { makeMutants } from "../src/stages/mutation.ts";
import { staticRules } from "../src/stages/static.ts";
import { getChecker } from "../src/stages/typecheck.ts";
import { fixtureSpec } from "./spec.ts";
import { RULE_INDEX } from "../src/rules.ts";
import { budgetForFile, budgetForSurface } from "../src/budget.ts";
import { verifyPartial } from "../src/partial.ts";
import { existsSync } from "node:fs";

const FIX = join(import.meta.dir, "../fixtures");
const read = (kind: string, f: string) => readFileSync(join(FIX, kind, f), "utf8");
const list = (kind: string) => readdirSync(join(FIX, kind)).filter((f) => f.endsWith(".tsx")).sort();
const expectOf = (src: string) => {
  const s = fixtureSpec(src);
  if (!s.rule) throw new Error("bad fixture without an Expect line");
  return { stage: s.stage!, rule: s.rule, also: s.also, profile: s.profile };
};
// Short timeout so the infinite-loop fixture does not slow the suite down.
const OPTS = { stageTimeoutMs: 1500 };
const RUNTIME = new Set(["determinism", "invariants"]);

beforeAll(async () => {
  await warm({ profile: "strict" });
});
afterAll(async () => {
  await shutdown();
});

describe("good fixtures pass", () => {
  for (const f of list("good")) {
    test(f, async () => {
      const src = read("good", f);
      const r = await verify(src, { ...OPTS, profile: fixtureSpec(src).profile });
      expect(r.failures).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.stage).toBe("done");
      expect(r.mutation!.score).toBeGreaterThanOrEqual(r.mutation!.threshold);
      expect(r.ran).toEqual(["typecheck", "static", "determinism", "invariants", "mutation", "render", "copy"]);
    });
  }
});

describe("bad fixtures fail exactly their rule", () => {
  for (const f of list("bad")) {
    test(f, async () => {
      const src = read("bad", f);
      const want = expectOf(src);
      const r: Report = await verify(src, { ...OPTS, profile: want.profile });
      expect(r.ok).toBe(false);
      expect(r.stage as string).toBe(want.stage);
      const rules = [...new Set(r.failures.map((x) => x.rule))];
      if (want.profile === "strict") {
        expect(rules).toContain(want.rule);
        for (const x of rules) expect([want.rule, ...want.also]).toContain(x);
      } else expect(rules).toEqual([want.rule]);
      // Every failure says how to fix it.
      for (const x of r.failures) expect(typeof x.fix).toBe("string");
      const fail = r.failures[0]!;
      expect(fail.message.length).toBeGreaterThan(10);
      if (RUNTIME.has(want.stage) && want.rule !== "timeout" && want.rule !== "init-throws") {
        // A usable trace: short, every step named, actions are plain JSON.
        expect(fail.trace?.length).toBeGreaterThan(0);
        expect(fail.trace!.length).toBeLessThanOrEqual(25);
        for (const s of fail.trace!) {
          expect(typeof s.step).toBe("string");
          if (s.step === "act" || s.step === "garbage") expect(JSON.parse(JSON.stringify(s.action))).toEqual(s.action);
        }
      }
      if (want.stage === "static" || want.stage === "copy" || want.stage === "typecheck") expect(fail.line).toBeGreaterThan(0);
    }, 20_000);
  }
});

describe("rules added for the strict profile do not block the default profile", () => {
  for (const f of list("bad").filter((f) => fixtureSpec(read("bad", f)).profile === "strict")) {
    test(f, async () => {
      const r = await verify(read("bad", f), OPTS);
      const blocking = r.failures.filter((x) => RULE_INDEX.find((i) => i.id === x.rule)?.default !== "error");
      expect(blocking).toEqual([]);
    }, 20_000);
  }
});

describe("rule index", () => {
  test("every rule a bad fixture expects is in the index, and every fixture the index names exists", () => {
    const ids = new Set(RULE_INDEX.map((r) => r.id));
    for (const f of list("bad")) expect(ids).toContain(expectOf(read("bad", f)).rule);
    for (const r of RULE_INDEX)
      for (const ex of [r.fail, r.pass]) if (ex.startsWith("fixtures/")) expect(existsSync(join(import.meta.dir, "..", ex.split(" ")[0]!))).toBe(true);
  });
  test("a rule whose failing example is a bad fixture is that fixture's expected rule", () => {
    for (const r of RULE_INDEX)
      if (r.fail.startsWith("fixtures/bad/") && !r.fail.includes(" ")) {
        const src = readFileSync(join(import.meta.dir, "..", r.fail), "utf8");
        const m = fixtureSpec(src);
        if (m.rule !== r.id) expect(`${r.id} -> ${m.rule}`).toBe(`${r.id} -> ${r.id}`);
      }
  });
});

describe("verifyPartial", () => {
  test("never throws on any cut of any fixture, and finds each static violation", async () => {
    for (const kind of ["good", "bad"])
      for (const f of list(kind)) {
        const src = read(kind, f);
        const lines = src.split("\n");
        for (let n = 1; n <= lines.length; n += 13) {
          const r = await verifyPartial(lines.slice(0, n).join("\n") + (n % 2 ? "" : lines[n]?.slice(0, 7) ?? ""), { typecheck: false });
          expect(Array.isArray(r.findings)).toBe(true);
        }
      }
    for (const f of ["date-now.tsx", "math-random.tsx", "hex-color.tsx", "named-color.tsx", "forbidden-import.tsx", "exclamation.tsx", "title-case.tsx"]) {
      const want = expectOf(read("bad", f)).rule;
      const r = await verifyPartial(read("bad", f), { typecheck: false });
      expect(r.findings.map((x) => x.rule)).toContain(want);
    }
  });
  test("good fixtures have no findings", async () => {
    for (const f of list("good")) expect((await verifyPartial(read("good", f), { typecheck: false })).findings).toEqual([]);
  });
  test("a closed defineApp without arbitrary is reported", async () => {
    const src = read("good", "poll.tsx").replace(/\n  arbitrary: [\s\S]*?\n  },\n/, "\n");
    const r = await verifyPartial(src, { typecheck: false });
    expect(r.findings.map((x) => x.rule)).toContain("missing-part");
  });
});

describe("the samples and the API.md example pass the whole gate", () => {
  const apps: [string, string][] = ["chore-wheel", "dinner-poll", "bill-split"].map((n) => [n, readFileSync(join(import.meta.dir, `../../app/examples/${n}.tsx`), "utf8")]);
  const api = readFileSync(join(import.meta.dir, "../../app/API.md"), "utf8");
  const example = api.slice(api.indexOf("## Example")).match(/```tsx\n([\s\S]*?)```/)![1]!;
  apps.push(["API.md example", `import { defineApp, CardHeader, OptionRow } from "@muse/app";\n${example}`]);
  for (const [name, src] of apps)
    test(name, async () => {
      const r = await verify(src);
      expect(r.failures).toEqual([]);
      expect(r.ran).toContain("render");
      if (name !== "API.md example") expect(r.mutation!.score).toBeGreaterThanOrEqual(0.7);
      // The report additions.
      expect(Object.keys(r.mutation!).sort()).toEqual(expect.arrayContaining(["inert", "killed", "score", "total"]));
      expect(Array.isArray(r.weak)).toBe(true);
      expect(r.timings.render).toBeGreaterThan(0);
    }, 20_000);

  test("transitions count in the mutation score", async () => {
    const src = apps[1]![1];
    const without = src.replace(/\n  transitions: \{[\s\S]*?\n  \},\n/, "\n");
    expect(without).not.toContain("transitions:");
    const [a, b] = [await verify(src, { skip: ["render"] }), await verify(without, { skip: ["render"] })];
    expect(a.mutation!.killed).toBeGreaterThan(b.mutation!.killed);
  }, 20_000);
});

describe("the @muse/app drawing kit", () => {
  test("every piece passes the render lints in Chrome at 320, 393 and 500, light and dark, in every data shape", async () => {
    const src = readFileSync(join(import.meta.dir, "art-gallery.tsx"), "utf8");
    const r = await verify(src, { profile: "strict", all: true, skip: ["mutation"], rules: { "too-tall": "off" }, artifacts: false });
    // The gallery is tall on purpose; everything else must be clean.
    const real = r.failures.filter((f) => (f.detail as { lint?: string } | undefined)?.lint !== "too-tall");
    expect(real.map((f) => `${f.rule}: ${f.message}`)).toEqual([]);
    expect(r.ran).toContain("render");
  }, 30_000);
});

describe("the gate folds like the runtime", () => {
  test("Room and @muse/app appReducer agree on the samples, with garbage and member changes", async () => {
    const { appReducer } = await import("@muse/app/internal");
    const { compileModule } = await import("../src/compile.ts");
    const { loadApp } = await import("../src/sandbox.ts");
    const { Room, serverMeta, garbage, membersFor, MEMBERS } = await import("../src/sim/core.ts");
    const { canonical } = await import("../src/json.ts");
    for (const n of ["chore-wheel", "dinner-poll", "bill-split"]) {
      const src = readFileSync(join(import.meta.dir, `../../app/examples/${n}.tsx`), "utf8");
      const c = compileModule(src);
      if (!c.ok) throw new Error(c.message);
      const room = new Room(loadApp(c.js), 1 << 20);
      const def = (await import(`../../app/examples/${n}.tsx`)).default;
      const red = appReducer(def, "a:gate");
      const rng = (await import("@muse/app")).rng(7);
      let w = room.init().ok ? (room.init() as { state: any }).state : null;
      let f = red.reduce(red.init({ room: "a:gate", members: [] }), { t: "@members", members: MEMBERS }, serverMeta(0, 0, "host"));
      expect(canonical(f)).toBe(canonical(w));
      for (let i = 1; i <= 300; i++) {
        const k = rng.int(10);
        const user = ["u1", "u2", "u3"][rng.int(3)]!;
        const a = room.arbitrary(w, user, rng.int(2 ** 32));
        const action = k === 0 ? { t: "@members", members: membersFor(1 + rng.int(15)) } : k === 1 ? garbage(rng.int(10), i, a.ok ? a.action : null) : a.ok ? a.action : null;
        if (action === null) continue;
        const m = serverMeta(3, i, user);
        const r = room.reduce(w, action, m, k === 0 ? "system" : k === 1 ? "garbage" : "act");
        if (!r.ok) throw new Error(r.message);
        w = r.state;
        f = red.reduce(f, action, m);
        expect(canonical(f)).toBe(canonical(w));
      }
    }
  });
});

describe("traces reproduce", () => {
  for (const f of ["mutates-state.tsx", "throws-on-bad-action.tsx", "non-json-state.tsx", "shares-dont-sum.tsx", "state-too-big.tsx"]) {
    test(f, async () => {
      const src = read("bad", f);
      const r = await verify(src, OPTS);
      const out = replay(src, r.failures[0]!.trace!);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.rule).toBe(r.failures[0]!.rule);
    });
  }

  test("seat race needs two people claiming the same seat", async () => {
    const r = await verify(read("bad", "seat-race.tsx"), OPTS);
    const claims = r.failures[0]!.trace!.filter((s) => s.step === "act") as { user: string; action: { seat: number } }[];
    const bySeat = new Map<number, Set<string>>();
    for (const c of claims) bySeat.set(c.action.seat, (bySeat.get(c.action.seat) ?? new Set()).add(c.user));
    expect([...bySeat.values()].some((users) => users.size >= 2)).toBe(true);
    // arbitrary only offers seats that look free, so the second claim was made before its
    // sender saw the first: a race that only the replica and sequencer model can produce.
    const t = r.failures[0]!.trace!;
    const second = t.findIndex((s, i) => s.step === "act" && t.slice(0, i).some((x) => x.step === "act" && x.user !== s.user));
    const who = (t[second] as { user: string }).user;
    expect(second).toBeGreaterThan(0);
    expect(t.slice(0, second).some((s) => s.step === "receive" && s.user === who)).toBe(false);
  });
});

describe("later stages catch what earlier ones would", () => {
  const cases: [string, string[], string, string][] = [
    ["math-random.tsx", ["static"], "determinism", "nondeterministic"],
    ["date-now.tsx", ["static"], "determinism", "nondeterministic"],
    ["module-state.tsx", ["determinism"], "invariants", "convergence"],
    ["throws-on-bad-action.tsx", ["determinism"], "invariants", "reduce-throws"],
    ["mutates-state.tsx", ["determinism"], "invariants", "reduce-mutates-input"],
    ["forbidden-import.tsx", ["static", "typecheck"], "determinism", "module-load"],
  ];
  for (const [f, skip, stage, rule] of cases) {
    test(`${f} without ${skip.join(",")}`, async () => {
      const r = await verify(read("bad", f), { ...OPTS, skip: skip as never });
      expect(r.stage as string).toBe(stage);
      expect(r.failures.map((x) => x.rule)).toContain(rule);
    });
  }
});

describe("static rules", () => {
  const app = (body: string) => `import { defineApp } from "@muse/app";\n${body}\nexport default defineApp({ name: "x", reduce: (s: any) => s } as any);`;
  const cases: [string, string][] = [
    ["setTimeout(() => {}, 1);", "no-timers"],
    ["requestAnimationFrame(() => {});", "no-timers"],
    ["fetch('/x');", "no-network"],
    ["new WebSocket('ws://x');", "no-network"],
    ["new XMLHttpRequest();", "no-network"],
    ["localStorage.getItem('a');", "no-storage"],
    ["new Intl.NumberFormat();", "no-intl"],
    ["eval('1');", "no-eval"],
    ["new Function('return 1');", "no-eval"],
    ["(() => 1).constructor('return 1');", "no-eval"],
    ["import('x');", "no-dynamic-import"],
    ["const u = import.meta.url;", "no-dynamic-import"],
    ["window.x = 1;", "no-host-globals"],
    ["document.body;", "no-host-globals"],
    ["globalThis.y = 2;", "no-host-globals"],
    ["const p = performance.now();", "no-time"],
    ["const d = new Date();", "no-time"],
    ["crypto.getRandomValues(new Uint8Array(4));", "no-random"],
    ["const r = Math['random']();", "no-random"],
    ["const c = 'rgb(1, 2, 3)';", "no-hex-color"],
    ["import x from 'lodash';", "imports-allowed"],
  ];
  for (const [code, rule] of cases)
    test(`${rule}: ${code}`, () => {
      const r = staticRules(app(code), { maxSourceBytes: 1 << 20 });
      expect(r.failures.map((f) => f.rule)).toContain(rule);
    });

  test("source-size", () => {
    expect(staticRules(app("const a = 1;"), { maxSourceBytes: 50 }).failures.map((f) => f.rule)).toContain("source-size");
  });
  test("locals named like host globals are fine", () => {
    expect(staticRules(app("const top = [1][0]; const parent = top; const self = parent;"), { maxSourceBytes: 1 << 20 }).failures).toEqual([]);
  });
  test("Date in a type position is fine", () => {
    expect(staticRules(app("type T = { at: Date };"), { maxSourceBytes: 1 << 20 }).failures).toEqual([]);
  });
  test("colors inside userContent(...) are allowed", () => {
    expect(staticRules(app("const userContent = (c: string) => c; const c = userContent('#ff0000');"), { maxSourceBytes: 1 << 20 }).failures).toEqual([]);
  });
  test("color names in color positions fail; the same words elsewhere do not", () => {
    for (const code of ["const s = { color: 'white' };", "declare const g: any; g.fillStyle = 'black';", "const s = { backgroundColor: 'Red' };"])
      expect(staticRules(app(code), { maxSourceBytes: 1 << 20 }).failures.map((f) => f.rule)).toContain("no-hex-color");
    expect(staticRules(app("const t = 'white'; const s = { label: 'red', color: 'currentColor' };"), { maxSourceBytes: 1 << 20 }).failures).toEqual([]);
  });
  test("float money is a warning", () => {
    const src = `import { defineApp } from "@muse/app";\nexport default defineApp({ reduce: (s: any, a: any) => ({ ...s, each: s.total / 3 }) } as any);`;
    const r = staticRules(src, { maxSourceBytes: 1 << 20 });
    expect(r.failures).toEqual([]);
    expect(r.warnings.map((w) => w.rule)).toContain("float-money");
    const ok = staticRules(src.replace("s.total / 3", "Math.floor(s.total / 3)"), { maxSourceBytes: 1 << 20 });
    expect(ok.warnings).toEqual([]);
  });
});

describe("copy rules", () => {
  for (const r of RULES) {
    test(`${r.id} fails its failing example and passes its passing one`, () => {
      expect(r.check({ ...r.examples.fail, line: 1 })).not.toBeNull();
      expect(r.check({ ...r.examples.pass, line: 1 })).toBeNull();
    });
  }
  test("a stylesheet string is code, not copy; a percentage in words still is", () => {
    const src = `import { defineApp } from "@muse/app";\nexport default defineApp({ view: () => <div><style>{"@keyframes pulse { 0%, 100% { opacity: .3 } 50% { opacity: .9 } }"}</style><p>{"50% of votes"}</p></div> } as any);`;
    expect(extractCopy(src).map((t) => t.text)).toEqual(["50% of votes"]);
  });
  test("button labels: 4 words pass, 5 fail", () => {
    const word = RULES.find((r) => r.id === "button-words")!;
    expect(word.check({ text: "Pin it to chat", button: true, line: 1 })).toBeNull();
    expect(word.check({ text: "Pin it to the chat", button: true, line: 1 })).not.toBeNull();
  });
  test("exclamation marks: fail in buttons, headings and hints; pass in stickers, userContent and quoted lines", () => {
    const src = (jsx: string) => `import { defineApp, Button, userContent } from "@muse/app";\nexport default defineApp({ view: () => <div>${jsx}</div> } as any);`;
    const bang = (jsx: string) => copyLint(src(jsx)).failures.filter((f) => f.rule === "no-exclamation").length;
    expect(bang("<Button>Pin it!</Button>")).toBe(1);
    expect(bang("<h1>Big news!</h1>")).toBe(1);
    expect(bang(`<p hint="Tap to vote!">x</p>`)).toBe(1);
    expect(bang("<svg><text>YES!</text></svg>")).toBe(0);
    expect(bang("<p>{userContent(\"Nice one!\")}</p>")).toBe(0);
    expect(bang("<p>Maya said \u201cwe did it!\u201d</p>")).toBe(0);
  });
  test("a percentage is a warning in the default profile and blocks in strict", async () => {
    const src = read("warn", "percent-votes.tsx");
    const d = await verify(src, { ...OPTS, skip: ["render", "mutation", "invariants", "determinism"] });
    expect(d.failures.map((f) => f.rule)).not.toContain("no-percent");
    expect(d.warnings.map((f) => f.rule)).toContain("no-percent");
    const s = await verify(src, { ...OPTS, profile: "strict", skip: ["render", "mutation", "invariants", "determinism"] });
    expect(s.failures.map((f) => f.rule)).toContain("no-percent");
  });
  test("extraction finds view text, button labels and summary strings", () => {
    const texts = extractCopy(read("good", "poll.tsx"));
    const buttons = texts.filter((t) => t.button).map((t) => t.text);
    expect(buttons).toEqual(expect.arrayContaining(["Add", "Reopen", "Close poll"]));
    expect(texts.map((t) => t.text)).toEqual(expect.arrayContaining(["Dinner poll", "{} No votes yet.", "closed the poll", "Add an option"]));
    // Action payloads and comparisons are not copy.
    expect(texts.map((t) => t.text)).not.toContain("vote");
  });
});

describe("mutation", () => {
  test("mutants stay inside reduce and its helpers", () => {
    const src = read("good", "bill.tsx");
    const ms = makeMutants(src, 20);
    expect(ms.length).toBeGreaterThan(10);
    expect(ms.length).toBeLessThanOrEqual(20);
    expect(new Set(ms.map((m) => m.op)).size).toBeGreaterThanOrEqual(5);
    const lines = src.split("\n");
    const invStart = lines.findIndex((l) => l.includes("invariants: {")) + 1;
    const arbStart = lines.findIndex((l) => l.includes("arbitrary: (")) + 1;
    expect(ms.every((m) => m.line < invStart || m.line > arbStart + 10)).toBe(true);
  });
  test("an always-true invariant is reported weak", async () => {
    const r = await verify(read("bad", "always-true-invariant.tsx"), OPTS);
    expect(r.weak).toEqual(["the poll is valid", "options is a list"]);
    expect(r.mutation!.score).toBe(0);
  });
});

test("type-check uses the TypeScript 7 API process", async () => {
  expect((await getChecker()).kind).toBe("api");
});

test("the sandbox uses the same rng as @muse/app", async () => {
  const { rng } = await import("@muse/app");
  const { loadApp } = await import("../src/sandbox.ts");
  const { compileModule } = await import("../src/compile.ts");
  const c = compileModule(read("good", "poll.tsx"));
  if (!c.ok) throw new Error(c.message);
  const L = loadApp(c.js);
  for (const seed of [0, 1, 42, 0xffffffff]) {
    const a = L.rng(seed) as { next(): number; int(n: number): number };
    const b = rng(seed);
    for (let i = 0; i < 20; i++) expect([a.next(), a.int(7)]).toEqual([b.next(), b.int(7)]);
  }
});

describe("height budget follows the tool's surface", () => {
  const dir = (s: string) => join(FIX, "surface", s);
  const run = (s: string, extra: object = {}) =>
    verify(readFileSync(join(dir(s), "app.tsx"), "utf8"), { ...OPTS, heightBudget: budgetForFile(join(dir(s), "app.tsx")), ...extra });
  test("budgets: story and reel 600, anything else 420", () => {
    expect(budgetForFile(join(dir("story"), "app.tsx"))).toBe(600);
    expect(budgetForFile(join(dir("messenger"), "app.tsx"))).toBe(420);
    expect(budgetForFile(join(FIX, "good", "poll.tsx"))).toBe(420);
    expect(budgetForSurface("reel")).toBe(600);
    expect(budgetForSurface(undefined)).toBe(420);
  });
  test("a 560 px tool with surface story passes", async () => {
    const r = await run("story");
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });
  test("the same tool with surface messenger fails too-tall", async () => {
    const r = await run("messenger");
    expect(r.ok).toBe(false);
    expect(r.stage).toBe("render");
    expect(r.failures.map((f) => f.rule)).toContain("too-tall");
  });
  test("an explicit budget overrides the surface", async () => {
    const r = await run("messenger", { heightBudget: 600 });
    expect(r.ok).toBe(true);
  });
  test("the strict profile applies the same budget to its states", async () => {
    const r = await run("story", { profile: "strict", skip: ["mutation"], artifacts: false });
    // The fixture grows past 600 in its overloaded and finished states; what matters is that the
    // states are judged against 600 (the surface), never 420.
    const tall = r.failures.filter((f) => f.rule === "too-tall" || (f.detail as { lint?: string } | undefined)?.lint === "too-tall");
    expect(tall.length).toBeGreaterThan(0);
    for (const f of tall) expect(f.message).toContain("the budget is 600");
  });
});
