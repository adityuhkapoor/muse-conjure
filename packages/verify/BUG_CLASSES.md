# UI bug classes

The register carried over from the lab (`muse/qa/BUG_CLASSES.md`), mapped onto this gate. Each
class says whether the gate catches it, with which rule, the fixture that must fail it and the
look-alikes a fixture keeps unflagged. A rule never forbids a legitimate layout; when a class has
no rule yet, it says why. `bun run verify --rules` has every rule with its usual fix.

Profiles: rules marked (default) block in the default profile; the others are warnings there and
block only in `--strict`, which also renders the empty, minimal, overloaded, finished and locked
states. Every render rule is sampled twice 0.6 s apart and reported only when both samples show
it, so mid-animation frames are never judged; state frames are taken 8 s after their last action.

| ID | Class | Caught | Rules | Failing fixture (`fixtures/bad/`) | Look-alikes kept unflagged (`fixtures/good/`) |
|---|---|---|---|---|---|
| C01 | Clipped text | yes | `clipped-text` (default), `canvas-text-clipped` | `render-clipped`, `canvas-label-clipped`, `svg-label-overflow` | marquee through a clipped strip (`legit-layout`, `canvas-marquee`); text ending in an ellipsis; canvas cards scrolled wholly out of view (`look-alikes`) |
| C02 | Escapes container | yes | `outside-app` (default) | `render-outside` | count badge overhanging an avatar, rotated stamp (`legit-layout`) |
| C03 | Text collision | yes | `text-overlap` (default), `canvas-text-overlap` | `render-overlap`, `canvas-text-overlap` | badge on avatar, stamp over the card, a label sliding in over another for a moment (`legit-layout`) |
| C04 | Low contrast | yes | `contrast` (default), `canvas-text-contrast` | `render-contrast`, `canvas-text-contrast` | text in disabled controls; labels on series colors in onPrimary (`canvas-wheel`) |
| C05 | Missing glyph | partly | `render-error` when a glyph crashes the view | `render-throws` | not detected: a missing glyph draws a box in Chrome without an error. Low risk with system fonts |
| C06 | Font drift | no | | | the gate renders with one font stack. Prevented in pictures by measuring (`fitText` with the Canvas context) instead of hard-coded widths |
| C07 | Height overrun | yes | `too-tall` (default), `overload-overflow`, `state-layout` | `render-tall`, `overload-long-label`, `empty-tall` | an expanded section after a tap (budget applies at rest); many items capped with "and N more" (`empty-states`) |
| C08 | Tiny text | yes | `tiny-text`, `canvas-text-tiny` | `tiny-text`, `canvas-text-tiny` | avatar initials and one- or two-character badges down to 6 px (`look-alikes`); numbers at 8 px |
| C09 | Bad plural | yes | `bad-plural` | `plural` | "Round 1 winners" and other numbers used as names (`look-alikes`); "1 pass", "$1 bills" |
| C10 | Hit target off the visual | yes | `hit-area` (default), `hit-misaligned` | `render-hit`, `hit-misaligned` | a 36 px button with a 44 px `::after` hit area (`poll`) |
| C11 | Frame-coupled timing | yes | `frame-coupled-timing` | `frame-coupled` | motion computed from `now` (`canvas-marquee`) |
| C12 | Racing automation | yes | `acts-before-person` | `acts-on-own` | a countdown that waits for a person's tap (`empty-states`) |
| C13 | Untestable drag | partly | `render-error` under raw pointer down, move and up at random points | `render-throws` | not a rule: drags are exercised for crashes, not judged |
| C14 | Layout leakage | n/a | | | egui-specific; DOM flow layout has no shared layout direction |
| C15 | Blank or emoji-only label | yes | `blank-label` | `blank-label` | icon-only buttons with an `aria-label` |
| C16 | Overlay occlusion | yes | `overlay-covers-control` | `overlay` | toasts and bursts that fade within 2 s; a stamp beside the controls (`legit-layout`) |
| C17 | Meta non-conformance | partly | `no-hex-color` (default), copy rules (stylesheet strings are skipped) `sentence-case`, `all-caps`, `no-percent`, `no-exclamation`, `button-words`, `banned-phrase`, `no-emoji-button` (default) | `hex-color`, `named-color`, `title-case`, `shouting`, `percent-votes` (fixtures/warn), `exclamation`, `long-button`, `banned-phrase`, `emoji-button` | colors inside `userContent(...)`; quoted user text; exclamation marks in `userContent(...)`, SVG text and quoted lines; percentages are a warning by default. Not detected: outlines over 1 px, a second accent color |
| C18 | Painted over | yes | `painted-over` | `painted-over` | a strike-through drawn over a vetoed label (`look-alikes`); a full sheet or slice bigger than the label |
| C19 | Runaway spin | yes | `runaway-spin` | `runaway-spin` | a spin that starts fast and settles (`canvas-wheel`) |
| C20 | Jitter | yes | `jitter` | `jitter` | a marquee moving one way (`canvas-marquee`) |
| C21 | Rotated text overflow | yes | `canvas-text-clipped` measures the rotated box | `canvas-label-clipped` (45° labels) | rotated wheel labels whose axis-aligned box pokes out but whose rotated box fits (`canvas-wheel`) |
| C22 | Scroll captured | by construction | none needed: a `Canvas` with `onPointer` lets vertical swipes scroll the chat (`touch-action: pan-y`); only `drag` keeps every touch | | a draw pad or drag-to-rank (`drag`) |
| C23 | Chrome covers controls | yes | `overlay-covers-control` | `overlay` | the shell's own toasts are outside an app's frame |
| C24 | Breaks in another data shape | yes, strict | `empty-state-blank`, `no-enabled-action`, `orphan-decoration`, `overload-overflow`, `state-layout`, `state-render-error` | `empty-blank`, `no-action`, `orphan-pointer`, `overload-long-label`, `empty-tall`, `empty-throws` | a short empty card with one line and an input; a finished card with no buttons (`empty-states`, `reveal`); a result card with no controls at all; a locked plan that says so (`look-alikes`) |
| C25 | Canvas and SVG text | yes | `canvas-text-clipped`, `canvas-text-overlap`, `canvas-text-contrast`, `canvas-text-tiny` (text draws are recorded with their transform, clip and colors before the tool mounts) | `canvas-label-clipped`, `canvas-text-overlap`, `canvas-text-contrast`, `canvas-text-tiny`, `svg-label-overflow` | fitted wheel labels (`canvas-wheel`); marquees (`canvas-marquee`); clipped-away cards (`look-alikes`) |

C24 and C25 are new here: the lab only rendered each tool's filled example, and drew text through
egui, which measured it. Every rule in the table is in `src/rules.ts` with a failing and a passing
example; `test/gate.test.ts` runs every bad fixture and requires exactly its rule.
