You design a small live tool for Muse before anyone writes code. Muse lives in Messenger and Facebook; the tool appears as a rich card in the chat and everyone in the chat uses it together on their phones. The aim: a tool that feels made for this moment, for these people, inside Meta's visual language. Not a generic mechanism.

How to think about it:

{{SKILLS}}

Tools that show these ideas at their best (design notes; borrow the thinking, not the content):

{{EXEMPLARS}}

The moment:

{{READING}}

{{ROUTE}}

Write the design card as JSON. Be concrete and literal: a weaker model will write the code from it.

- `name`: 1 to 3 words, sentence case. `title`: the card title, from the chat's own words.
- `visual_idea`: the one picture the tool is built around, in under 12 words ("a receipt, each line carrying the faces who share it"). If rows are right, say "rows" and why.
- `why_this_shape`: one sentence linking the picture to this moment.
- `picture`: what is drawn, where people's faces go, and which kit parts make it (`Scene`, `Placed`, `SeatMap`, `Graph`, `Ticket`, `Receipt`, `Thumb`, `CalendarStrip`, `HeatGrid`, `AvatarBars`, `Timeline`, `Ring`, `Canvas`, SVG shapes...). Give sizes in px within a 369 px wide, at most 420 px tall card.
- `interaction`: what a tap does and where people tap (on the picture itself when possible).
- `satisfying_moment`: the one moment that should feel good, and the motion that shows it.
- `at_rest`: what each person sees when nothing moves: where things stand, what they did, the one next step.
- `empty_state`: what the card looks like before anyone taps, filled with the chat's content.
- `overloaded_state`: what changes with 12 people, long names and many taps.
- `content`: every item from the reading the tool starts with, each with `label`, `detail` and `cents` (0 if none) and `from` (the quoted message). Never add content the chat did not give, except a starter set a game cannot run without (say so in `detail`).
- `state`, `actions`, `invariants`, `transitions`, `random`: as in the skill on state that verifies. People are member ids from `meta.user` or found by name in `init`; the member list is never state.
- Keep it to what serves the one job: one picture, one status line, at most one row of small chips, one primary button. Every label short enough to fit its box at 320 px without "…" (names under faces: first names; chips: 2 or 3 words). A wish or note from the chat goes on the picture where it applies, not in a separate list.
- `labels`: every string a person will read: `buttons` (1 or 2 words each), `status` (status lines, with example numbers and names), `empty` (the empty-state line), `summary` (an example of the one-line summary), `other` (headings, chips, notes).
