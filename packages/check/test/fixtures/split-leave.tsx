// Fixture: shares are stored per person; when someone leaves after the split started, their
// share is dropped and not spread over the rest, so shares stop summing to the total.
// Expect: membership-leave, trace 2.
import { defineApp } from "@muse/app";
type S = { total: number; shares: Record<string, number>; paid: string[] };
const even = (total: number, ids: string[]) => Object.fromEntries(ids.map((id, i) => [id, Math.floor(total / ids.length) + (i < total % ids.length ? 1 : 0)]));
export default defineApp<S, { t: "paid" }>({
  name: "Split", summary: (s) => `${s.paid.length} paid`,
  init: (ctx) => ({ total: 9000, shares: even(9000, ctx.members.map((m) => m.id)), paid: [] }),
  reduce: (s, a, m) => (a.t === "paid" && s.shares[m.user] !== undefined && !s.paid.includes(m.user) ? { ...s, paid: [...s.paid, m.user] } : s),
  onMembers: (s, ctx) => ({ ...s, shares: Object.fromEntries(Object.entries(s.shares).filter(([id]) => ctx.members.some((m) => m.id === id))), paid: s.paid.filter((id) => ctx.members.some((m) => m.id === id)) }),
  invariants: { "shares sum to the total": (s, ctx) => ctx.members.length === 0 || Object.values(s.shares).reduce((a, b) => a + b, 0) === s.total },
  arbitrary: () => ({ t: "paid" }),
  view: () => null,
});
