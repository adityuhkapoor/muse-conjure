`bun test` (in `library/cache`: offline, no model; re-runs the whole gate on every cached tool, so it takes a few minutes)

# Tool cache

Tools made ahead of time by `scripts/pregen/`, checked, and kept. 143 entries are in `index.json`.
The live path in a chat picks from `library/lab` and does not read this cache. It is used by the
`compose` build pipeline (`packages/factory/src/compose.ts`, to reuse or adapt a near match), by the
demo's seeded scenarios (`services/demo/premade.ts`, which can name a `cache:<id>` tool) and by the
routing eval. `STATUS.md` shows the state of the last batch run.

```ts
import { find, best, refill } from "./lookup.ts";

const candidates = find(ask, chatSample, members);   // ranked, each with a confidence 0..1 and why
const hit = best(ask, chatSample, members);          // the top one if confident and reusable, else null
const source = refill(hit.id, chatSample, members);  // that tool with this chat's people and options
```

`find` calls no model and takes about 1 ms. A candidate is accepted at `THRESHOLD` (in
`lookup.ts`, chosen so that under 5% of what is accepted is the wrong kind of tool; the measured
numbers are below). `reusable: false` marks a tool whose content is another chat's facts.

## What is in an entry

`library/cache/<id>/` holds:

- `source.tsx`: the tool. `compiled.js`: the same compiled for the sandbox.
- `gate.json`: the gate report it passed (mutation score 0.8 or more, copy lint clean).
- `meta.json`: the ask, the kind, what it does in one sentence, `use_when`, `dont_use_when`,
  keywords, the member count range, mutation score, height, the parameters (below), the
  second-look results, and the chat it was made from.
- `screenshot-rest.png` and `screenshot-played.png`: 393 px, light, at rest and after a scripted
  run. The people are made up.

`index.json` lists every entry (rebuilt from the folders by `store.ts`, so it cannot drift).

## What gets in

1. The whole gate with mutation score 0.8 or more (the factory's repair loop works toward 0.8) and a
   clean copy lint.
2. The second look (`second-look.ts`), which the builder never sees. It mounts the compiled tool
   through the real sandbox in headless Chrome at 393 px, light and dark, at rest and after 14
   actions taken from its own `arbitrary`. Rejected for: height at rest over 420 px; a blank or
   near-blank render; no tappable control at rest (for the first person, the next two when the
   first has none, like the payer of a split); text running past its box or the tool; a render
   error. For games: a simulated game has to reach an end state through `arbitrary` (an end-looking
   field turns on, a result is recorded, or the summary says so), and the result has to wait for the
   server: the winning move is held back from the server and the view must not show the result
   until it is confirmed (if that cannot be observed, the view has to read `confirmed`).
3. Not looking like a tool already cached for a different kind of ask: the 64 bit perceptual hash
   of the rest screenshot differs from every other kind's by more than 6 bits.

## Parameters and refill

A tool's chat-derived content lives in a data block above `defineApp`. `params.ts` finds it
without a model: member names anywhere in the source; strings in that block that appear in the chat
under a naming key (`label`, `name`, `text`, `item`...) or as list items are options; descriptive
strings (`note`, `desc`...) are blanked; numbers or other strings copied from the chat make the tool
fact-bound (a quote game, a split with a real total). `refill` replaces names by member position,
fills options from short lists in the new chat ("x or y", comma lists), and uses "Option 1" for any
slot it cannot fill, so nothing from the old chat is left. A fact-bound tool is not offered for a
different chat; it can still be reused for the same chat (lookup detects that by text overlap).

## Tests

`test/cache.test.ts`: index integrity, every entry re-passes the gate, refill leaves no name from the
original chat (all entries, and the gate on a sample of refilled tools), lookup thresholds on a
frozen copy of the index and asks (`test/fixtures/lookup-frozen.json`, rewritten on purpose by
`bun library/cache/freeze.ts`). `test/second-look.test.ts` shows each rejection reason on a small
broken tool. `test/params.test.ts` covers refill. Each check is also run against a broken fixture
and must fail there.

`bun library/cache/eval-lookup.ts` prints hit and false-accept rates at a range of thresholds.
