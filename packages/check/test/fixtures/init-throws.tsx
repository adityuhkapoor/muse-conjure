// Fixture: init reads the first member, which does not exist before the member list arrives.
// Expect: init, trace 0.
import { defineApp } from "@muse/app";
type S = { host: string };
export default defineApp<S, { t: "noop" }>({
  name: "Host", summary: (s) => s.host,
  init: (ctx) => ({ host: ctx.members[0]!.id }),
  reduce: (s) => s,
  invariants: { "host is a string": (s) => typeof s.host === "string" },
  arbitrary: () => ({ t: "noop" }),
  view: () => null,
});
