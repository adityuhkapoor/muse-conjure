// Fixture: a silent lost update. Anyone can rename the plan; the last rename wins and the other
// person's rename vanishes with no record.
// Expect: silent-conflict, trace 8.
import { defineApp } from "@muse/app";
type S = { title: string };
export default defineApp<S, { t: "rename"; title: string }>({
  name: "Plan", summary: (s) => s.title,
  init: () => ({ title: "Plan" }),
  reduce: (s, a) => (a.t === "rename" && typeof a.title === "string" && a.title.trim() && a.title.length <= 40 ? { title: a.title.trim() } : s),
  invariants: { "title is short": (s) => s.title.length <= 40 },
  arbitrary: (_s, u) => ({ t: "rename", title: u === "u1" ? "Beach" : u === "u2" ? "Hike" : "Movie" }),
  view: () => null,
});
