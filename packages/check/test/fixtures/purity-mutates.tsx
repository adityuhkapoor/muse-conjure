// Fixture: reduce pushes into the state it was given instead of returning a new one.
// Expect: purity, trace 1.
import { defineApp } from "@muse/app";
type S = { items: string[] };
export default defineApp<S, { t: "add" }>({
  name: "List", summary: (s) => `${s.items.length}`,
  init: () => ({ items: [] }),
  reduce: (s, a, m) => {
    if (a.t !== "add") return s;
    s.items.push(m.user);
    return { items: s.items };
  },
  invariants: { "at most 9": (s) => s.items.length <= 9 },
  arbitrary: () => ({ t: "add" }),
  view: () => null,
});
