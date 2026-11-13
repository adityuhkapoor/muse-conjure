// Offline: replay fixtures and scripted models only. No live model is called.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { paramsBlock, piece } from "@muse/library";
import { shutdown, warm } from "@muse/verify";
import { ASKS } from "../eval/asks.ts";
import { CachedClient } from "../src/cache.ts";
import { appName, extractCode, generate, pickBest } from "../src/generate.ts";
import { ReplayClient } from "../src/models/replay.ts";
import type { CompleteRequest, ModelClient, ProgressEvent } from "../src/types.ts";

beforeAll(() => warm());
afterAll(() => shutdown());

const DEMO = ["chore-wheel-apt4b", "where-eating", "sza-whos-in"];
/** Recorded asks whose answer used to be a lab tool from its example: offline they now get a plain reply. */
const OFFLINE_ASKS = ["dinner-split"];

for (const id of OFFLINE_ASKS) {
  test(`replay ${id}: no tool from an example, Muse says it needs a connection`, async () => {
    const r = await generate(ASKS.find((a) => a.id === id)!, new ReplayClient());
    expect(r.ok).toBe(false);
    expect(r.reply).toBe("Muse needs a connection to make this");
  }, 60_000);
}

for (const id of DEMO) {
  test(`replay fixture ${id} passes the gate`, async () => {
    const ask = ASKS.find((a) => a.id === id)!;
    const events: ProgressEvent[] = [];
    const r = await generate(ask, new ReplayClient(), { onEvent: (e) => events.push(e) });
    expect(r.ok).toBe(true);
    expect(r.report?.ok).toBe(true);
    expect(events[0]).toEqual({ t: "understanding" });
    expect(events.at(-1)?.t).toBe("ready");
    // Real names and content from the chat, never the piece's sample content.
    const block = paramsBlock(r.source);
    for (const sample of ["Dinner at Nopa", "Pizza place on 5th", "SZA on Saturday", "Thai Basil\", \"Sushi Ko\", \"Taco truck"]) expect(block).not.toContain(sample);
  }, 60_000);
}

test("demo fixtures carry the chat's content", () => {
  const read = (id: string) => readFileSync(join(import.meta.dir, "..", "fixtures", "replay", `${id}.tsx`), "utf8");
  expect(read("chore-wheel-apt4b").toLowerCase()).toContain("dishes");
  expect(read("where-eating")).toContain("Sushi Ko");
  expect(read("dinner-split")).toContain("14260");
});

/** A scripted model: answers by label from a queue. */
function scripted(replies: Record<string, string[]>): ModelClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: "scripted",
    calls,
    async complete(req: CompleteRequest) {
      calls.push(req.label ?? "");
      const q = replies[req.label ?? ""];
      if (!q?.length) throw new Error(`no scripted reply for ${req.label}`);
      return q.length > 1 ? q.shift()! : q[0]!;
    },
  };
}

const ROUTE_BUILD = JSON.stringify({ people: [], content: ["Thai"], job: "Vote on dinner", path: "build", piece: "", why: "test", params_json: "{}", change: "" });
const PLAN = JSON.stringify({ name: "Poll", title: "Dinner", job: "Vote", content: [], state: [], actions: [], invariants: [], transitions: [], at_rest: "", random: "" });
const good = "```tsx\n" + piece("poll")!.source + "```";
const bad = "```tsx\n" + piece("poll")!.source.replace("const clean = (label: string) =>", "const noise = Math.random();\nconst clean = (label: string) =>") + "```";

test("repairs from the gate's failure and passes on the second attempt", async () => {
  const m = scripted({ route: [ROUTE_BUILD], plan: [PLAN], draft: [bad], repair: [good] });
  const events: ProgressEvent[] = [];
  const r = await generate(ASKS[0]!, m, { onEvent: (e) => events.push(e), fastLane: false });
  expect(r.ok).toBe(true);
  expect(r.attempts).toBe(2);
  expect(m.calls).toEqual(["route", "plan", "draft", "repair"]);
  const rep = events.find((e) => e.t === "repairing") as Extract<ProgressEvent, { t: "repairing" }>;
  expect(rep.rule).toBe("no-random");
}, 60_000);

test("gives up after two repairs with a clear failure", async () => {
  const m = scripted({ route: [ROUTE_BUILD], plan: [PLAN], draft: [bad], repair: [bad] });
  const r = await generate(ASKS[0]!, m, { fastLane: false });
  expect(r.ok).toBe(false);
  expect(r.attempts).toBe(3);
  expect(m.calls.filter((c) => c === "repair").length).toBe(2);
  expect(r.error).toContain("no-random");
}, 60_000);

test("runs N candidates and keeps a passing one", async () => {
  const m = scripted({ route: [ROUTE_BUILD], plan: [PLAN], draft: [bad, good, good], repair: [bad] });
  const r = await generate(ASKS[0]!, m, { candidates: 3, maxRepairs: 0, fastLane: false });
  expect(r.ok).toBe(true);
  expect(r.candidates?.length).toBe(3);
  expect(r.candidates?.filter((c) => c.ok).length).toBe(2);
}, 60_000);

test("pickBest prefers the higher mutation score, then the smaller source", () => {
  const rep = (score: number) => ({ ok: true, mutation: { score } }) as never;
  const a = { ok: true, source: "x".repeat(10), report: rep(0.7) };
  const b = { ok: true, source: "x".repeat(20), report: rep(0.9) };
  const c = { ok: true, source: "x".repeat(5), report: rep(0.9) };
  expect(pickBest([a, b, c])).toBe(c);
  expect(pickBest([{ ok: false, source: "", report: rep(1) }, a])).toBe(a);
});

test("extractCode takes the longest fenced block", () => {
  expect(extractCode("hi\n```tsx\nshort\n```\n```tsx\nlonger one\n```")).toBe("longer one\n");
  expect(extractCode("import x")).toBe("import x\n");
  expect(appName('defineApp({ name: "Chore wheel",')).toBe("Chore wheel");
});

test("cache answers a repeated request from disk", async () => {
  let n = 0;
  const inner: ModelClient = { id: "count", complete: async () => `reply ${++n}` };
  const c = new CachedClient(inner, mkdtempSync(join(tmpdir(), "factory-cache-")));
  const req = { system: "s", messages: [{ role: "user" as const, content: "u" }] };
  expect(await c.complete(req)).toBe("reply 1");
  expect(await c.complete(req)).toBe("reply 1");
  expect(await c.complete({ ...req, nonce: 2 })).toBe("reply 2");
  expect(c.hits).toBe(1);
});

