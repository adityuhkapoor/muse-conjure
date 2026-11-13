// Settle up: on random IOUs between 6 people, untangle gives exactly the fewest payments (people
// with a balance minus the most groups that net to zero, by brute force over subsets), the
// payments clear every balance to the cent, and the same IOUs always give the same plan.

import { expect, test } from "bun:test";
import { rng } from "@muse/app";
import settle from "@muse/library/settle";

const members = ["u1", "u2", "u3", "u4", "u5", "u6"].map((id, i) => ({ id, name: ["Priya", "Sam", "Ana", "Leo", "Kev", "Maya"][i]! }));
const ctx = { room: "a:t", members };
type S = ReturnType<typeof settle.init>;
type T = { from: string; to: string; cents: number };

function balances(s: S): Map<string, number> {
  const b = new Map<string, number>();
  const add = (u: string, c: number) => b.set(u, (b.get(u) ?? 0) + c);
  for (const i of s.ious) {
    add(i.by, i.cents);
    const n = i.for.length;
    i.for.forEach((u, k) => add(u, -(Math.floor(i.cents / n) + (k < i.cents % n ? 1 : 0))));
  }
  return b;
}

/** Brute force: most zero-sum groups over every way to cut the people into groups. */
function fewest(b: Map<string, number>): number {
  const v = [...b.values()].filter((c) => c !== 0);
  const n = v.length;
  const memo = new Map<number, number>();
  const sum = (m: number) => v.reduce((a, c, i) => a + (m & (1 << i) ? c : 0), 0);
  const most = (m: number): number => {
    if (m === 0) return 0;
    if (memo.has(m)) return memo.get(m)!;
    const low = m & -m;
    let best = -Infinity;
    for (let sub = m; sub; sub = (sub - 1) & m) if (sub & low && sum(sub) === 0) best = Math.max(best, 1 + most(m ^ sub));
    memo.set(m, best);
    return best;
  };
  return n - most((1 << n) - 1);
}

/** True when the plan is the fewest payments and clears every balance exactly. */
function goodPlan(b: Map<string, number>, plan: T[]): boolean {
  const left = new Map(b);
  for (const t of plan) {
    if (t.cents <= 0 || t.from === t.to) return false;
    left.set(t.from, (left.get(t.from) ?? 0) + t.cents);
    left.set(t.to, (left.get(t.to) ?? 0) - t.cents);
  }
  return [...left.values()].every((c) => c === 0) && plan.length === fewest(b);
}

/** Largest debtor pays largest creditor until done: never more than n - 1, but not always the fewest. */
function greedy(b: Map<string, number>): T[] {
  const left = new Map(b);
  const out: T[] = [];
  for (;;) {
    const owe = [...left].filter(([, c]) => c < 0).sort((a, c) => a[1] - c[1])[0];
    const get = [...left].filter(([, c]) => c > 0).sort((a, c) => c[1] - a[1])[0];
    if (!owe || !get) return out;
    const cents = Math.min(-owe[1], get[1]);
    out.push({ from: owe[0], to: get[0], cents });
    left.set(owe[0], owe[1] + cents);
    left.set(get[0], get[1] - cents);
  }
}

function randomIous(seed: number): S {
  const r = rng(seed);
  let s = settle.init({ room: "a:t", members: [] });
  const n = 3 + r.int(6);
  for (let k = 0; k < n; k++) {
    const by = r.pick(members).id;
    // Round amounts make groups that net to zero common, which is where the fewest plan matters.
    const cents = (1 + r.int(12)) * 500;
    const forWho = members.filter(() => r.next() < 0.5).map((m) => m.id);
    s = settle.reduce(s, { t: "add", label: "Thing", cents, for: forWho }, { seq: k + 1, user: by, time: 1_760_000_000_000, seed: 1 }, ctx);
  }
  return s;
}

const untangled = (s: S) => settle.reduce(s, { t: "untangle" }, { seq: 99, user: "u1", time: 1_760_000_000_000, seed: 7 }, ctx);

test("untangle gives the fewest payments, clears every balance, and is the same every time", () => {
  let groupsMattered = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const s = randomIous(seed);
    const b = balances(s);
    const plan = untangled(s).plan ?? [];
    expect(goodPlan(b, plan)).toBe(true);
    expect(untangled(JSON.parse(JSON.stringify(s))).plan).toEqual(untangled(s).plan);
    if (greedy(b).length > plan.length) groupsMattered++;
  }
  // The random set includes cases where a plain greedy plan is longer, so the check above bites.
  expect(groupsMattered).toBeGreaterThan(0);
});

test("broken variant: a plain greedy plan fails the fewest-payments check on some IOUs", () => {
  let caught = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const b = balances(randomIous(seed));
    if (!goodPlan(b, greedy(b))) caught++;
  }
  expect(caught).toBeGreaterThan(0);
});

test("broken variant: a plan off by one cent fails the clears-every-balance check", () => {
  const s = randomIous(3);
  const plan = untangled(s).plan!.map((t, i) => (i === 0 ? { ...t, cents: t.cents - 1 } : t));
  expect(goodPlan(balances(s), plan)).toBe(false);
});
