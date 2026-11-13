# Bugs made impossible by the API

For each bug class in `BUG_CLASSES.md`, the change to `@muse/app` that would stop a tool from
writing the bug at all, so the gate no longer has to catch it. Ordered by how many failures the
strict profile finds today that the change would remove.

Measured with `bun scripts/survey.ts` (strict profile, read-only) over 124 tools: 22
`library/pieces`, 3 `packages/app/examples`, 7 `library/lab` ports in progress and 92
`library/cache` entries. 66 pass strict and 122 pass default. 126 failures in all.

| Rank | Change | Classes | Failures removed | Tools |
|---|---|---|---|---|
| 1 | The runtime holds the card to its height budget: content past 420 px (600 in a story) folds behind a built-in "Show all" row, and a `List` piece caps rows with "and N more". `overload-overflow` and `state-layout` height failures, `too-tall` | C07, C24 | 49 | 41 |
| 2 | The runtime's root stylesheet makes width overflow impossible: every element in `.m-root` gets `min-width: 0` and `overflow-wrap: anywhere`, single-line text comes from a `Text` piece that ends in an ellipsis, and the root clips at its edge. Width failures in data-shape states (clipped, past the edge, overlapping), `outside-app` | C01, C02, C03 | 39 | 20 |
| 3 | `count(n, "vote")` gives "1 vote" or "3 votes"; the copy lint requires it wherever a number meets a noun in a literal | C09 | 11 | 10 |
| 4 | Ink chosen for its fill: `theme.on(fill)` for DOM and `label(...)` on the Canvas frame (rank 5) pick onPrimary or text by contrast, and `userColor` comes with a readable ink | C04 | 11 | 5 |
| 5 | Canvas labels as a layer: the draw frame gets `label(text, x, y, { room, angle })`, which fits with `fitText`, draws after every shape, skips a label that would collide and never goes under 10 px. `canvas-text-clipped`, `canvas-text-overlap`, `painted-over`, `canvas-text-tiny` | C18, C21, C25 | 4 | 4 |
| 6 | Raw `<button>` and `[role=button]` get a 44 px hit area from the runtime stylesheet, as `Button` already does | C10 | 5 | 2 |
| 7 | An `empty` part in `defineApp` (`{ when(state), line, action }`): the runtime draws the standard empty card, and a `Scene` with nothing to draw renders nothing | C24 | 3 | 2 |
| 8 | Overlays only through `Scene` and `at()`: decoration there never takes pointer events (as `Placed` now does), and absolute positioning elsewhere is a type error | C16, C23 | 3 | 2 |
| 9 | `CardHeader` and `Button` fall back to words when a label has no letters | C15 | 1 | 1 |

Already by construction in this round: a `Canvas` with `onPointer` lets vertical swipes scroll the
chat (C22); art pieces keep their width in grid layouts (`min-width: 0`, shrinkable columns),
placed faces let taps through, crowded seat rows take one tap, and every art label is fitted or
ellipsized. These removed the failures the drawing kit itself caused in the art gallery check
(`test/art-gallery.tsx`).

Worst tools now: `lab/trivia-night` (10, a port in progress), `cache/table-reservation-1` (6),
`lab/concert` (5), `lab/slot-machine` (5), `cache/split-by-item-1` (4).
