// Fixture: arbitrary proposes removing an item that is not there, and reduce throws on it.
// Expect: reduce-throws, trace 1.
import { defineApp } from "@muse/app";
type S = { items: { id: string }[] };
export default defineApp<S, { t: "remove"; id: string }>({
  name: "List", summary: () => "list",
  init: () => ({ items: [{ id: "a" }] }),
  reduce: (s, a) => {
    const i = s.items.findIndex((x) => x.id === a.id);
    if (i < 0) throw new Error("no such item");
    return { items: s.items.filter((_, j) => j !== i) };
  },
  invariants: { "ids are strings": (s) => s.items.every((x) => typeof x.id === "string") },
  arbitrary: (_s, _u, r) => ({ t: "remove", id: r.pick(["a", "b"]) }),
  view: () => null,
});
