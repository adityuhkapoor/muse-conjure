// Every piece passes the gate with its default and example parameters, at a mutation score of at
// least 0.7, and a person who joins the chat later can take part.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { shutdown, verify, warm } from "@muse/verify";
import { coerce, fill, paramsBlock, pieces } from "../index.ts";
import { afterJoin, joinerCanAct, NEW, U1, U2 } from "./joiner.ts";

beforeAll(() => warm());
afterAll(() => shutdown());

const MIN_SCORE = 0.7;

const IDS = ["assign", "bracket", "carpool", "claims", "draft", "list", "lock", "overlap", "poll", "rate", "recap", "reels", "settle", "shifts", "shortlist", "slots", "split", "spots", "streak", "tickets", "veto", "wheel"];

test("22 pieces with metadata", () => {
  const ps = pieces();
  expect(ps.map((p) => p.id)).toEqual(IDS);
  for (const p of ps) {
    expect(p.use_when.length).toBeGreaterThan(0);
    expect(p.dont_use_when.length).toBeGreaterThan(0);
    expect(p.guarantees.length).toBeGreaterThan(0);
    expect(paramsBlock(p.source)).toContain("const P: Params");
    // The defaults already match the schema.
    expect(coerce(p.params, p.defaults, p.defaults)).toEqual(p.defaults);
  }
});

async function passes(label: string, source: string) {
  const r = await verify(source);
  if (!r.ok) console.log(label, r.stage, JSON.stringify(r.failures).slice(0, 600));
  expect(r.ok).toBe(true);
  // The render stage ran and found nothing: it is part of `ran` and `ok`.
  expect(r.ran).toContain("render");
  const score = r.mutation?.score ?? 0;
  console.log(`${label}: mutation ${score} (${r.mutation?.killed}/${r.mutation?.total}, inert ${r.mutation?.inert})`);
  expect(score).toBeGreaterThanOrEqual(MIN_SCORE);
}

for (const p of pieces()) {
  test(`${p.id} passes the gate`, () => passes(p.id, p.source), 60_000);

  p.examples.forEach((params, i) => {
    test(`${p.id} example ${i + 1} passes the gate`, () => passes(`${p.id}#${i + 1}`, fill(p, params)), 60_000);
  });

  test(`${p.id}: a person who joins later can take part`, async () => {
    const app = (await import(`@muse/library/${p.id}`)).default;
    expect(joinerCanAct(app)).toBe(true);
  });
}

// Each check above must be seen failing on a deliberately broken variant.

test("broken variant: a reducer that only knows the first two people is caught by the joiner check", async () => {
  for (const id of ["poll", "slots", "lock"]) {
    const app = (await import(`@muse/library/${id}`)).default;
    const stale = { ...app, reduce: (s: never, a: never, m: never, ctx: { room: string; members: unknown[] }) => app.reduce(s, a, m, { ...ctx, members: [U1, U2] }) };
    expect(joinerCanAct(stale)).toBe(false);
  }
});

test("broken variant: leaving the invariants stale after a leave is caught", async () => {
  const app = (await import("@muse/library/poll")).default;
  const { s: joined, ctx } = afterJoin(app as never, 6);
  const s = joined as unknown as Parameters<NonNullable<typeof app.onMembers>>[0];
  // Someone votes, then leaves; without onMembers their vote would stay.
  const withVote = app.reduce(s, { t: "vote", option: s.options[0]!.id }, { seq: 99, user: NEW.id, time: 1, seed: 1 }, ctx);
  const left = { room: "a:test", members: [U1, U2] };
  expect(app.invariants["voters are in the chat"]!(withVote, left)).toBe(false);
  expect(app.invariants["voters are in the chat"]!(app.onMembers!(withVote, left), left)).toBe(true);
});

test("broken variant: weak checks fail the mutation threshold", async () => {
  const src = pieces().find((p) => p.id === "poll")!.source;
  const a = src.indexOf("  invariants: {");
  const b = src.indexOf("  arbitrary:");
  const weak = `${src.slice(0, a)}  invariants: { "title is text": (s) => typeof s.title === "string" },\n\n${src.slice(b)}`;
  const r = await verify(weak);
  expect(!r.ok || (r.mutation?.score ?? 0) < MIN_SCORE).toBe(true);
});
