// Fixture: once the poll is closed, votes still change it.
// Expect: finished-frozen, trace 2.
import { defineApp } from "@muse/app";
type S = { closed: boolean; yes: string[] };
export default defineApp<S, { t: "close" } | { t: "vote" }>({
  name: "Poll", summary: (s) => `${s.yes.length} yes`,
  init: () => ({ closed: false, yes: [] }),
  reduce: (s, a, m) => {
    if (a.t === "close") return s.closed ? s : { ...s, closed: true };
    if (a.t === "vote") return { ...s, yes: s.yes.includes(m.user) ? s.yes.filter((x) => x !== m.user) : [...s.yes, m.user] };
    return s;
  },
  invariants: { "one vote each": (s) => new Set(s.yes).size === s.yes.length },
  finished: (s: S) => s.closed,
  arbitrary: (_s, _u, r) => (r.next() < 0.5 ? { t: "close" } : { t: "vote" }),
  view: () => null,
} as never);
