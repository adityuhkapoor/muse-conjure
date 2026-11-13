import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileApp } from "@muse/sandbox/compile";
import { buildStack } from "../src/items/index.ts";
import { shim, uses } from "../src/items/knobs.ts";
import { toolItems, toolPayload, toolSources } from "../src/items/tools.ts";
import { train, type Judgment } from "../src/model.ts";
import { appendLine, loadModel, readLines, saveModel } from "../src/store.ts";
import { createTaste, priorsOnly } from "../src/taste.ts";
import { judgment } from "../src/sim.ts";
import { copyItems } from "../src/items/copy.ts";

test("from priors alone: copy that sounds AI-written scores below Meta's plain voice, and the summary says these are priors", () => {
  const t = createTaste(priorsOnly());
  const slop = t.scoreCopy("Unlock seamless group planning! ✨");
  const plain = t.scoreCopy("Pick a time");
  expect(slop.score).toBeLessThan(plain.score);
  expect(slop.reasons.join(" ")).toContain("prior");
  // Mostly guessing before any swipes, and it says so.
  expect(plain.uncertainty).toBeGreaterThan(0.2);
  const ranked = t.rank(["Lock it in!", "Going", "Count me in 🙌"], { role: "button" });
  expect(ranked[0]!.candidate).toBe("Going");
  const s = t.summary();
  expect(s.judgments).toBe(0);
  expect(s.lines.filter((l) => l.confidence === "strong" || l.confidence === "likely")).toEqual([]);
  expect(s.text).toContain("avoids exclamation marks, prior from what you said, not tested yet");
  expect(t.scoreTool({ accent: "full" }).score).toBeLessThan(t.scoreTool({}).score);
});

test("swipes persist as JSON lines, an undo cancels its judgment, and the model round-trips", () => {
  const dir = mkdtempSync(join(tmpdir(), "taste-test-"));
  try {
    const items = copyItems();
    const j1 = judgment({ mode: "single", item: items[0]! }, "like", 1);
    const j2 = { ...judgment({ mode: "pair", a: items[1]!, b: items[2]! }, "a", 2), id: "two" } as Judgment;
    appendLine(j1, dir);
    appendLine(j2, dir);
    appendLine({ v: 1, type: "undo", id: "u1", target: "two", at: "" }, dir);
    const lines = readLines(dir);
    expect(lines.length).toBe(3);
    const m = train(lines);
    expect(m.n).toEqual({ judgments: 1, singles: 1, pairs: 0, skips: 0 });
    saveModel(m, dir);
    expect(loadModel(dir)!.mean).toEqual(m.mean);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the stack: a few hundred copy lines, every tool in variants, motion clips", () => {
  const s = buildStack({ screens: false });
  const n = (k: string) => s.filter((i) => i.kind === k).length;
  expect(n("copy")).toBeGreaterThan(300);
  expect(n("tool")).toBe(toolSources().length * 8);
  expect(n("motion")).toBeGreaterThan(100);
  expect(new Set(s.map((i) => i.id)).size).toBe(s.length);
});

test("tool variants compile through the sandbox compiler and mount mid-flow", async () => {
  for (const it of toolItems().filter((t) => t.id.endsWith(":1") || t.id.endsWith(":2"))) {
    const p = await toolPayload(it, compileApp);
    expect(p.code.length).toBeGreaterThan(1000);
    expect(p.script.length).toBeGreaterThan(0);
  }
  // The prop shim wraps Facepile and Progress without touching the piece.
  const lock = toolSources().find((s) => s.piece === "lock")!;
  expect(uses(lock.source)).toEqual({ progress: true, avatars: true });
  const out = shim(lock.source, { density: "standard", accent: "standard", radius: 8, avatar: 32, progress: false, celebrate: "none", motion: "standard", mode: "light" });
  expect(out).toContain("Facepile as __Facepile");
  expect(out).toContain("const Progress = (_p: any) => null;");
  expect(() => compileApp(out)).not.toThrow();
}, 60_000);
