`bun run check` (in `packages/verify`: type-checks this package, then `bun test` runs every fixture through the gate)

# @muse/verify

The gate every generated app passes before anyone sees it. Contract: `docs/CONTRACTS.md`
section 5. The render stage launches Playwright's headless Chrome shell (`chromium.launch({ headless: true })`), so a clean clone needs `bunx playwright install chromium-headless-shell` after `bun install`.

```sh
bun run verify path/to/app.tsx            # JSON report on stdout, timings on stderr, exit 1 on failure
bun run verify app.tsx --all              # run every stage, list failures from all of them
bun run verify app.tsx --skip static      # skip stages (proves a later stage catches the same bug)
bun run verify app.tsx --strict           # every rule blocks, and the data-shape states are rendered
bun run verify app.tsx --budget 600      # height budget at rest in px; default: 600 when meta.json beside it says surface story or reel, else 420
bun run verify --watch app.tsx            # warm once, re-run on save, print what appeared or went away
bun run verify --partial app.tsx          # the streaming subset on a file that may be cut off
bun run verify --rules                    # every rule as JSON: meaning, usual fix, failing and passing example
bun run bench                             # p50 of 10 runs, cold and warm, on fixtures/good/poll.tsx
bun scripts/timings.ts                    # warm stage timings for both profiles
bun scripts/survey.ts                     # the strict profile over every tool in the repo (read-only)
```

```ts
import { verify, verifyPartial, warm, shutdown } from "@muse/verify";
await warm();                    // start tsc, the worker threads and the browser ahead of time
const report = await verify(source);                       // default profile
const strict = await verify(source, { profile: "strict" });
const early = await verifyPartial(sourceSoFar);            // never throws; a few ms
```

The report is `{ ok, stage, failures: [{ rule, message, fix, trace?, line?, detail?, image? }],
warnings, timings, mutation, weak, ran }`. `stage` is the first stage, in contract order, that
failed, or `"done"`. Every failure and warning has a `fix`: the smallest concrete change, naming
the text, sizes and state involved. Runtime failures carry the shortest failing trace fast-check
could shrink to; render failures in a data-shape state carry the trace that builds that state and
`detail.state`; render failures with a box carry `image`, a cropped PNG with the box outlined
(`artifacts: "<dir>"` to choose the folder, `images: true` for data URLs too).

Profiles: `default` blocks on what the gate has always blocked on and reports newer rules as
warnings, so a long run calling the gate never breaks mid-way. `strict` blocks on every rule and
also renders each tool empty, minimal, overloaded (12 people with long names, every list grown),
finished and locked, at 320, 393 and 500, light and dark. `rules: { "<id>": "error" | "warn" |
"off" }` overrides one rule. `BUG_CLASSES.md` maps the lab's bug register onto the rules;
`BY_CONSTRUCTION.md` lists the API changes that would make each class impossible.

`verifyPartial(sourceSoFar, { typecheck? })` runs the static and copy rules on the longest prefix
that parses once the open brackets are closed, scans the rest for banned names, imports and
colors, and checks the defineApp parts once its object closes. It returns `{ findings: [{ rule,
message, line, fix }], parsedLines, complete, ms }`.

## Stages

1. `typecheck`: native TypeScript 7.1 API (`typescript/async`), one long-lived tsc process; each
   check swaps one virtual file into a snapshot and reconfigures the program (about 4 ms warm).
2. `static`: oxc-parser AST rules: banned globals and members (time, randomness, timers, network,
   storage, host globals, eval, dynamic import), imports only from `@muse/app` and
   `@muse/library/*`, no color literals outside `userColor(...)`, source size; warnings for
   division in reduce without rounding and `for...in`.
3. `determinism`: compiles with oxc-transform, loads into a vm context with frozen intrinsics and
   drifting `Date`/`Math.random`, runs each sequence twice and compares state hashes; also
   catches throws, input mutation (inputs are deep-frozen), non-JSON state and the size limit.
4. `invariants`: 200 sequences from the app's `arbitrary` across 3 users through the real
   `@muse/sync` replica and `Sequencer`, with a stepwise network, a disconnect and reconnect,
   stale actions, garbage and member changes (`@members`). The fold is the runtime's: input that
   is not an object with a string `t` is dropped, garbage that throws is a no-op, an action from
   `arbitrary` that throws fails (`reduce-throws`). Every invariant on every state, every
   transition on every step; garbage that breaks an invariant fails `garbage-breaks-invariant`;
   at the end every replica equals a fold of the server log.
5. `mutation`: up to 20 AST mutants of `reduce`, `onMembers` and their helpers, each fuzzed on
   workers. Score = mutants caught by an invariant or transition / mutants that produced a wrong
   state (a mutant that only ignores actions counts once a transition catches it). Score under
   0.5 fails; a check that catches nothing is listed in `weak`. `arbitrary-weak` fails when
   fewer than 10 in 100 of its actions change state.
6. `render`: the compiled app is mounted through the real sandbox (warm pool, frame runtime,
   replica, an in-page Sequencer) in chrome-headless-shell, one browser per process, at widths
   320, 393 and 500 in light and dark. Per width and mode one frame rests and one gets taps
   driven by `arbitrary` (through the control that dispatches that action, found by probing),
   other people's actions and raw pointer events. Layout lint from DOM geometry, sampled twice
   0.6 s apart, reporting only issues in both: `clipped-text`, `text-overlap`, `outside-app`,
   `contrast` (WCAG AA from computed colors), `hit-area` (44 px, counting `::after`), `too-tall`
   (at rest), `blank-render`, plus `render-error` and `axe` (axe-core, serious and critical).
   Badges on avatars, rotated stamps, marquees and mid-animation frames are not flagged
   (`fixtures/good/legit-layout.tsx`). About 0.9 s warm.
7. `copy`: strings that reach the view or `summary`, checked against `src/copy/rules.ts`.
   Rules: sentence case; no capitals; buttons are 1-4 words (5 or more fails); no exclamation marks
   in interface labels, buttons, headings and hints (user-made content may have them: text inside
   `<text>`/`<tspan>` drawings, strings passed through `userContent(...)`, and quoted lines); a
   percentage is a warning in the default profile (fine when the number is the tool's subject: odds,
   a rating, a progress share) and blocks in strict; banned phrases are corporate filler and
   AI-sounding copy only (playful verbs such as "Lock it in" are the tool's voice and allowed); no
   emoji in buttons. Fixtures: `fixtures/bad/` for the failures, `fixtures/warn/percent-votes.tsx`
   for the warning, `fixtures/good/copy-voice.tsx` for a 4-word button and a drawn sticker with `!`.

Stages 1, 2 and 7 run on the main thread and in the tsc process; 3, 4 and 5 run at the same time
on a pool of worker threads, which also bounds runaway loops (`timeout`); 6 runs alongside in the browser. Runtime stages are
skipped when static rules fail.

## Adding a rule

1. Add the check where it belongs: `src/stages/static.ts` for code shape, `src/copy/rules.ts`
   for copy (each copy rule carries a `fail` and a `pass` example that the tests run),
   `src/sim/*` for runtime behaviour. Give it a short kebab-case `rule` id.
2. Add `fixtures/bad/<name>.tsx`: the smallest change to a good fixture that breaks only this
   rule, starting with
   `// Bad fixture: <what is wrong>.` and `// Expect: stage <stage>, rule <rule>.`
3. `bun test` runs every bad fixture and requires exactly that stage and rule, and a short trace
   for runtime rules. A rule with no failing fixture does not count as checked.

`bun scripts/check-fixtures.ts` prints one line per fixture; `bun scripts/mutants.ts <app>` lists
each mutant and whether it was killed, inert or survived.

## Fixtures

`fixtures/good/`: a poll, a seat map, a bill split in integer cents, garbage that throws (allowed),
and the legitimate layouts. `fixtures/bad/`: one app per rule (58), including a seat double-claim that only shows under concurrent claims, shares that
lose leftover cents, an always-true invariant, and `Math.random` reached through a computed key
that only the determinism stage catches.
