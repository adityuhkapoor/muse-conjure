// The runtime fold: input guard, throw as no-op, @members, init rerun, onMembers, userColor.
import { expect, test } from "bun:test";
import { defineApp, userColor } from "../src/index.ts";
import { appReducer, ctx, makeTheme, membersOf, peopleSlots } from "../src/internal.ts";

const meta = { seq: 1, user: "a", time: 0, seed: 0 };
const app = defineApp<{ n: number; people: string[] }, { t: "add"; by: number } | { t: "boom" }>({
  name: "t",
  summary: () => "t",
  init: (c) => ({ n: 0, people: c.members.map((m) => m.id) }),
  reduce: (s, a) => {
    if (a.t === "boom") throw new Error("boom");
    return { ...s, n: s.n + a.by };
  },
  onMembers: (s, c) => ({ ...s, people: c.members.map((m) => m.id).filter((id) => s.people.includes(id)) }),
  invariants: {},
  arbitrary: () => null,
  view: () => null,
});

test("garbage never reaches reduce; a throw is a no-op", () => {
  const r = appReducer(app, "a:1");
  const f = r.init({ room: "a:1", members: [] });
  for (const g of [null, 1, "x", [], {}, { t: 1 }, { t: "@other" }, { t: "boom" }]) expect(r.reduce(f, g, meta)).toBe(f);
  expect(r.reduce(f, { t: "add", by: 2 }, meta).s.n).toBe(2);
});

test("@members reruns init until an action changes state, then calls onMembers", () => {
  const r = appReducer(app, "a:1");
  const two = { t: "@members", members: [{ id: "a", name: "A" }, { id: "b", name: "B" }] };
  let f = r.reduce(r.init({ room: "a:1", members: [] }), two, meta);
  expect(f.s.people).toEqual(["a", "b"]);
  expect(r.reduce(f, two, meta)).toBe(f);
  f = r.reduce(f, { t: "add", by: 1 }, meta);
  f = r.reduce(f, { t: "@members", members: [{ id: "b", name: "B" }, { id: "c", name: "C" }] }, meta);
  expect([f.s.n, f.s.people, f.members.map((m) => m.id)]).toEqual([1, ["b"], ["b", "c"]]);
});

test("invalid @members lists are ignored", () => {
  for (const bad of [{ t: "@members" }, { t: "@members", members: [{ id: 1, name: "x" }] }, { t: "@members", members: [{ id: "a", name: "A" }, { id: "a", name: "B" }] }])
    expect(membersOf(bad)).toBeNull();
  expect(membersOf({ t: "@members", members: [{ id: "a", name: "A", extra: 1 }] })).toEqual([{ id: "a", name: "A" }]);
});

test("userColor gives 12 people 12 colors, in both modes", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `user-${i * 37}`);
  expect(new Set(peopleSlots(ids).values()).size).toBe(12);
  ctx.members = ids.map((id) => ({ id, name: id }));
  for (const mode of ["light", "dark"] as const) {
    const t = makeTheme(mode);
    expect(new Set(ids.map((id) => userColor(id, t))).size).toBe(12);
  }
});
