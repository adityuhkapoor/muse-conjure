// The second look, shown failing once per reason on a small broken tool, and passing on a good one.

import { afterAll, describe, expect, test } from "bun:test";
import { closeLook, distance, secondLook } from "../second-look.ts";

afterAll(() => closeLook());

const app = (o: { view: string; arbitrary?: string; reduce?: string; init?: string; summary?: string }) => `
import { defineApp, Button } from "@muse/app";
type S = { n: number; over: boolean };
type A = { t: "tap" };
export default defineApp<S, A>({
  name: "T",
  summary: (s) => ${o.summary ?? '`${s.n} taps`'},
  init: () => (${o.init ?? "{ n: 0, over: false }"}),
  reduce: (s, a) => ${o.reduce ?? "a.t === \"tap\" ? { n: s.n + 1, over: s.n + 1 >= 5 } : s"},
  invariants: { ok: (s) => s.n >= 0 },
  arbitrary: ${o.arbitrary ?? '() => ({ t: "tap" })'},
  view: ({ state, confirmed, dispatch }) => (${o.view}),
});
`;

const GOOD = app({ view: `<div><h2>Tap counter</h2><p>{confirmed.n} taps so far</p><Button kind="primary" onClick={() => dispatch({ t: "tap" })}>Tap</Button></div>` });

describe("second look", () => {
  test("passes a good tool and returns two screenshots and hashes", async () => {
    const l = await secondLook(GOOD, { game: true });
    expect(l.reasons).toEqual([]);
    expect(l.ok).toBe(true);
    expect(l.restPng!.length).toBeGreaterThan(500);
    expect(l.playedPng!.length).toBeGreaterThan(500);
    expect(l.restHash).toMatch(/^[0-9a-f]{16}$/);
    expect(l.endStep).not.toBeNull();
    expect(distance(l.restHash, l.restHash)).toBe(0);
  }, 60_000);

  const cases: [string, string, boolean?][] = [
    ["too-tall", app({ view: `<div style={{ height: 700 }}><p>Tall tool</p><Button onClick={() => dispatch({ t: "tap" })}>Tap</Button></div>` })],
    ["blank", app({ view: `<div />` })],
    ["no-action", app({ view: `<div><h2>Just a label</h2><p>{state.n} taps recorded here for display</p></div>` })],
    ["overflow", app({ view: `<div><p style={{ whiteSpace: "nowrap", width: 700 }}>this line is far too long to fit inside a phone sized card and just keeps going on</p><Button onClick={() => dispatch({ t: "tap" })}>Tap</Button></div>` })],
    ["game-never-ends", app({ reduce: `a.t === "tap" ? { n: (s.n + 1) % 3, over: false } : s`, view: `<div><h2>Endless</h2><p>{confirmed.n}</p><Button onClick={() => dispatch({ t: "tap" })}>Tap</Button></div>` }), true],
    ["game-result-not-confirmed", app({ view: `<div><h2>Race</h2><p>{state.over ? "Done" : state.n}</p><Button onClick={() => dispatch({ t: "tap" })}>Tap</Button></div>` }), true],
    ["render-error", app({ view: `<div>{(null as any).boom}</div>` })],
  ];
  for (const [rule, source, game] of cases) {
    test(`rejects: ${rule}`, async () => {
      const l = await secondLook(source, { game: !!game });
      expect(l.ok).toBe(false);
      expect(l.reasons.map((r) => r.rule)).toContain(rule);
    }, 60_000);
  }

  test("a tool that looks like another is close in hash distance, a different one is not", async () => {
    const a = await secondLook(GOOD);
    const b = await secondLook(GOOD.replace("Tap counter", "Tap counter"));
    const c = await secondLook(app({ view: `<div><h2>Wheel</h2><p>spin it</p><p>again</p><p>and again</p><p>once more</p><Button kind="primary" onClick={() => dispatch({ t: "tap" })}>Spin</Button><Button onClick={() => dispatch({ t: "tap" })}>Reset</Button></div>` }));
    expect(distance(a.restHash, b.restHash)).toBeLessThanOrEqual(6);
    expect(distance(a.restHash, c.restHash)).toBeGreaterThan(6);
  }, 60_000);
});
