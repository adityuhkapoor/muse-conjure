// Fixture: a vote only the host can close. Everyone votes once; when the host leaves after the
// others have voted, no one left can do anything and the vote never closes.
// Expect: deadlock, trace 3.
import { defineApp } from "@muse/app";
type S = { host: string; votes: string[]; closed: boolean };
const has = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
export default defineApp<S, { t: "vote" } | { t: "close" }>({
  name: "Vote", summary: (s) => `${s.votes.length} votes`,
  init: (ctx) => ({ host: ctx.members[0]?.id ?? "", votes: [], closed: false }),
  reduce: (s, a, m, ctx) => {
    if (s.closed || !has(ctx, m.user)) return s;
    if (a.t === "vote" && !s.votes.includes(m.user)) return { ...s, votes: [...s.votes, m.user] };
    if (a.t === "close" && m.user === s.host) return { ...s, closed: true };
    return s;
  },
  invariants: { "one vote each": (s) => new Set(s.votes).size === s.votes.length },
  finished: (s: S) => s.closed,
  arbitrary: (s, u, r) => (u === s.host && r.next() < 0.5 ? { t: "close" } : { t: "vote" }),
  view: () => null,
} as never);
