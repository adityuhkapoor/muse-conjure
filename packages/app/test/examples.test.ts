// The samples under the real runtime fold (appReducer): random play from four people with
// members joining and leaving, garbage actions, invariants and transitions after every step.
// Each invariant is also shown to reject a broken state.
import { expect, test } from "bun:test";
import { rng, type AppDef, type Ctx, type Member } from "../src/index.ts";
import { appReducer, type Folded } from "../src/internal.ts";
import choreWheel from "../examples/chore-wheel.tsx";
import dinnerPoll from "../examples/dinner-poll.tsx";
import billSplit from "../examples/bill-split.tsx";

const ALL: Member[] = [
  { id: "maya", name: "Maya" },
  { id: "theo", name: "Theo" },
  { id: "dani", name: "Dani" },
  { id: "priya", name: "Priya" },
];
const ctx: Ctx = { room: "a:test", members: ALL.slice(0, 3) };
const GARBAGE = [null, 7, "x", [], {}, { t: 5 }, { t: "vote", option: 3 }, { t: "add", label: null }, { t: "toggle", user: 9 }, { t: "total", cents: "1" }, { t: "paid", user: {} }, { t: "@nope" }];

const freeze = <T>(v: T): T => {
  if (v && typeof v === "object") {
    Object.freeze(v);
    for (const k of Object.keys(v)) freeze((v as any)[k]);
  }
  return v;
};

function play(app: AppDef<any, any, any>, seed: number, steps: number) {
  const red = appReducer(app, ctx.room, (e) => {
    throw e;
  });
  const r = rng(seed);
  const meta = (i: number, user: string) => ({ seq: i, user, time: 1_000_000 + i * 4000, seed: r.int(2 ** 32) });
  let f: Folded<any> = freeze(red.reduce(red.init(ctx), { t: "@members", members: ctx.members }, meta(0, "host")));
  const log: string[] = [];
  for (let i = 1; i <= steps; i++) {
    const c: Ctx = { room: ctx.room, members: f.members };
    const user = r.pick(ALL).id;
    const k = r.int(10);
    let a: unknown;
    if (k === 0) a = { t: "@members", members: ALL.filter(() => r.next() < 0.75) };
    else if (k === 1) a = r.pick(GARBAGE);
    else a = app.arbitrary(f.s, user, r, c);
    if (a === null) continue;
    const m = meta(i, user);
    const prev = f;
    // Garbage may throw inside reduce (the runtime ignores it); real actions must not.
    const strict = k > 1 ? red : appReducer(app, ctx.room);
    f = freeze(strict.reduce(f, a, m));
    const now: Ctx = { room: ctx.room, members: f.members };
    for (const [name, inv] of Object.entries(app.invariants))
      if (!inv(f.s, now)) throw new Error(`${app.name}: "${name}" broke at step ${i} after ${JSON.stringify(a)}`);
    if (k > 1 || (k === 1 && a && typeof a === "object" && typeof (a as any).t === "string" && !(a as any).t.startsWith("@")))
      for (const [name, tr] of Object.entries(app.transitions ?? {}))
        if (!tr(prev.s, f.s, a, m, now)) throw new Error(`${app.name}: transition "${name}" broke at step ${i} after ${JSON.stringify(a)}`);
    expect(app.summary(f.s, now).length).toBeGreaterThan(0);
    log.push(JSON.stringify(f));
  }
  return log;
}

const apps = { choreWheel, dinnerPoll, billSplit } as Record<string, AppDef<any, any, any>>;

for (const [key, app] of Object.entries(apps)) {
  test(`${key}: invariants and transitions hold under play, joins, leaves and garbage; deterministic`, () => {
    for (let seed = 1; seed <= 200; seed++) {
      const a = play(app, seed, 40);
      expect(play(app, seed, 40)).toEqual(a);
    }
  });
  test(`${key}: init works with no members`, () => {
    expect(() => app.init({ room: "a", members: [] })).not.toThrow();
  });
}

// Each invariant must reject at least one broken state.
const broken: Record<string, Record<string, (s: any) => any>> = {
  choreWheel: {
    "owners are on the wheel": (s) => ({ ...s, chores: [{ name: "Dishes", owner: "ghost" }, ...s.chores.slice(1)] }),
    "everyone on the wheel is in the chat": (s) => ({ ...s, people: [...s.people, "ghost"] }),
    "chores are assigned in order": (s) => ({ ...s, chores: s.chores.map((c: any, i: number) => (i === 1 ? { ...c, owner: "maya" } : c)) }),
    "load differs by at most one": (s) => ({ ...s, chores: s.chores.map((c: any, i: number) => (i < 2 ? { ...c, owner: "maya" } : c)) }),
    "last spin matches its chore": (s) => ({ ...s, last: { chore: 0, who: "theo", by: "maya", time: 0, from: null } }),
    "the chore list is fixed": (s) => ({ ...s, chores: s.chores.slice(1) }),
  },
  dinnerPoll: {
    "no one votes twice for an option": (s) => ({ options: [{ ...s.options[0], voters: ["maya", "maya"] }] }),
    "voters are in the chat": (s) => ({ options: [{ ...s.options[0], voters: ["ghost"] }] }),
    "option labels are unique": (s) => ({ options: [...s.options, { ...s.options[0], id: "x", label: "THAI BASIL" }] }),
    "option ids are unique": (s) => ({ options: [...s.options, { ...s.options[0], label: "Other" }] }),
    "at most 8 options, each 1 to 40 characters": (s) => ({ options: [{ ...s.options[0], label: "" }] }),
  },
  billSplit: {
    "shares sum to the total": (s) => ({ ...s, total: s.total + 1 }),
    "amounts are whole cents": (s) => ({ ...s, shares: s.shares.map((x: any, i: number) => (i === 0 ? { ...x, cents: x.cents + 0.5 } : i === 1 ? { ...x, cents: x.cents - 0.5 } : x)) }),
    "shares differ by at most one cent": (s) => ({ ...s, shares: s.shares.map((x: any, i: number) => (i === 0 ? { ...x, cents: x.cents + 2 } : i === 1 ? { ...x, cents: x.cents - 2 } : x)) }),
    "the payer is in and paid": (s) => ({ ...s, shares: s.shares.map((x: any) => ({ ...x, paid: false })) }),
    "each person appears once": (s) => ({ ...s, shares: [...s.shares, s.shares[0]], total: s.total + s.shares[0].cents }),
    "everyone in the bill is in the chat": (s) => ({ ...s, shares: s.shares.map((x: any, i: number) => (i === 2 ? { ...x, user: "ghost" } : x)) }),
  },
};

test("every invariant rejects a broken state", () => {
  for (const [key, app] of Object.entries(apps)) {
    const s = app.init(ctx);
    expect(Object.keys(broken[key]!).sort()).toEqual(Object.keys(app.invariants).sort());
    for (const [name, inv] of Object.entries(app.invariants)) {
      expect(inv(s, ctx)).toBe(true);
      expect({ name, ok: inv(broken[key]![name]!(s), ctx) }).toEqual({ name, ok: false });
    }
  }
});

test("bill split: odd totals spread the extra cents; the payer leaving hands the bill on", () => {
  const red = appReducer(billSplit, "a");
  let f = red.reduce(red.init(ctx), { t: "@members", members: ctx.members }, { seq: 1, user: "h", time: 0, seed: 0 });
  f = red.reduce(f, { t: "total", cents: 1001 }, { seq: 2, user: "maya", time: 0, seed: 0 });
  expect(f.s.shares.map((x: any) => x.cents)).toEqual([334, 334, 333]);
  f = red.reduce(f, { t: "@members", members: ALL.slice(1, 3) }, { seq: 3, user: "h", time: 0, seed: 0 });
  expect([f.s.payer, f.s.shares.map((x: any) => x.cents)]).toEqual(["theo", [501, 500]]);
});

test("chore wheel: the result comes from the seed", () => {
  const s = choreWheel.init(ctx);
  const spin = (seed: number) => choreWheel.reduce(s, { t: "spin" }, { seq: 1, user: "maya", time: 0, seed }, ctx).last!.who;
  expect(spin(5)).toBe(spin(5));
  const winners = new Set(Array.from({ length: 50 }, (_, i) => spin(i * 7919)));
  expect(winners.size).toBe(3);
});
