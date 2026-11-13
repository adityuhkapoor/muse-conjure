import { afterAll, describe, expect, test } from "bun:test";
import { choose, type ToolMemory } from "../src/choose.ts";
import { PERSONAS } from "../src/personas.ts";
import { mulberry } from "../src/rand.ts";
import { ToolRealm } from "../src/realm.ts";
import { pieceCode } from "./world.ts";

const members = ["noa", "maya", "dev", "jonah", "priya", "theo"];
const realms: ToolRealm[] = [];
afterAll(() => realms.forEach((r) => r.close()));

/** Five friends take turns on a tool until nobody has a sensible move. */
function play(piece: string) {
  const realm = new ToolRealm(pieceCode(piece), `a:${piece}`);
  realms.push(realm);
  let f = realm.reduce(realm.init(), { t: "@members", members: members.map((id) => ({ id, name: id })) }, { seq: 1, user: "noa", time: 0, seed: 1 });
  const acts: { who: string; a: { t: string; [k: string]: unknown } }[] = [];
  const recent: string[] = [JSON.stringify(JSON.parse(f).s)];
  let now = 100_000;
  for (let round = 0; round < 12; round++)
    for (const who of members.slice(1)) {
      now += 20_000;
      const mem: ToolMemory = { recent, mine: acts.filter((x) => x.who === who).map((x) => ({ t: x.a.t, at: 0 })), others: acts.filter((x) => x.who !== who).length, age: now - 100_000, holdMs: 16_000, lastRandomAt: -Infinity, now, head: acts.length + 1, members, food: true };
      const c = choose(realm, f, PERSONAS[who]!, mulberry(round * 10 + who.length), mem);
      if (!c?.action) continue;
      acts.push({ who, a: c.action as { t: string } });
      f = realm.reduce(f, c.action, { seq: acts.length + 1, user: who, time: now, seed: 99 + acts.length });
      recent.push(JSON.stringify(JSON.parse(f).s));
    }
  return { acts, summary: realm.summary(f) };
}

describe("choosing like a person", () => {
  test("who's in: each friend answers once and the plan locks", () => {
    const { acts, summary } = play("lock");
    const per = new Map<string, number>();
    for (const x of acts) per.set(x.who, (per.get(x.who) ?? 0) + 1);
    expect([...per.values()].every((n) => n === 1)).toBe(true);
    expect(acts.filter((x) => x.a.answer === "going").length).toBeGreaterThanOrEqual(3);
    expect(summary).toMatch(/going|in/);
  });
  test("wheel: no reset, no removal, one spin", () => {
    const { acts } = play("wheel");
    expect(acts.some((x) => /reset|remove/.test(x.a.t))).toBe(false);
    expect(acts.filter((x) => x.a.t === "spin").length).toBe(1);
  });
  test("veto: at most one veto each, never everything", () => {
    const { acts } = play("veto");
    const vetoes = acts.filter((x) => x.a.t === "veto");
    expect(new Set(vetoes.map((x) => x.who)).size).toBe(vetoes.length);
    expect(acts.some((x) => x.a.t === "reset" || x.a.t === "undo")).toBe(false);
  });
  test("poll: one vote each", () => {
    const { acts } = play("poll");
    const votes = acts.filter((x) => x.a.t === "vote");
    expect(new Set(votes.map((x) => x.who)).size).toBe(votes.length);
    expect(votes.length).toBeGreaterThanOrEqual(3);
  });
});
