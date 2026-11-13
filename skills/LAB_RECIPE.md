# How the taste lab tools were made

Recovered from the session that built the first 163 lab tools the owner and testers liked (the library now holds 224). New tools
follow this recipe. It replaces the long field-by-field specs and the correctness-first briefs.

## The recipe

1. Short briefs. Two to four lines each: `id · chat or surface · the moment · what Muse builds`,
   with the specific human detail in it (a quoted line, a name, a number, the joke). The brief
   file opens with: "Interpret boldly; the one-line description is a floor, not a ceiling. Make
   each one distinct in concept, layout and motion." See `muse/BRIEFS.md`, `BRIEFS-R2.md`,
   `BRIEFS-R3.md`.
2. One strong builder per batch of about nine tools, in its own folder, told what the others are
   building only by the brief file. Batches run in parallel.
3. The builder reads fully before writing: the conventions (`muse/CONVENTIONS.md`), the drawing
   kit, and two or three finished tools named as quality references. It is not given a template.
4. The quality bar, verbatim from the prompts: "each must look like a distinct, delightful,
   custom-made thing with real interaction and motion — not a template." And: "There are no real
   photos: draw illustrated stand-ins with the painter (shapes, gradients, simple characters) —
   make them charming, not placeholder grey boxes."
5. Everything is drawn. Custom painter drawing for the picture; stock components only for chrome.
6. The builder looks. "Verify every app via the screenshot harness … after scripted clicks, read
   the PNGs, and iterate until good." Before and after the main interaction, every time.
7. Explore, don't assume. Every batch also includes three wildcards of the builder's own choosing,
   each a different genre (a toy, a creative tool, a visualization, a game, something ambient,
   something weird). "Variety > coherence."
8. It lives inside the chat. A rich message, not a poster: no outer card or banner, compact and
   glanceable at rest (about 420 tall), expanding in place when used, with the chat's real people
   as the social layer.
9. A second, separate pass makes it Meta-native. A different agent, with the Meta look rules
   (`the design notes`), first-party components for chrome (buttons, option
   rows with bars and faces, facepile, RSVP row, card header, toast), a lint that reports
   departures, and reference pictures to compare against. Its instruction: "Keep each app's core
   interaction and personality; change chrome/presentation, not the idea." One blue primary per
   card, flat cards, sentence case, counts not percentages, celebration by reaction burst and a
   warm line rather than confetti.

## What the new runtime adds, and when

Shared state, invariants, the gate and filling from context are a third pass, after the picture
is good, done without changing the picture. They are not part of the creative brief.

## What went wrong when this was not followed

Briefs that listed mechanisms ("a poll", "a list", "a wheel") produced mechanisms. Specs with ten
required fields and a checker in the loop from the first line produced forms that pass checks.
Copy rules written for interface chrome, applied to tool content, removed the voice.
