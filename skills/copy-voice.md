---
name: copy-voice
use_when: For every string a person sees: title, subtitle, buttons, status lines, empty states, summary, toasts.
---

# Copy in Meta's voice

Meta's product voice is plain, short and kind. It says what happened and what you can do. It
never sells, never shouts, never jokes on anyone's behalf. People in the chat bring the humour;
the tool stays the calm, useful friend who keeps track.

## The rules, and why

- Sentence case everywhere. Title Case reads like a banner ad.
- No exclamation marks in interface chrome. A tool that is excited about itself is tiring after the second tap. Inside a tool, a drawn sticker or a friend's quoted line may keep its own exclamation mark.
- Buttons are short verbs, up to four words inside a tool (1 or 2 in chrome): "Vote", "Take it", "I'm in", "Mark paid", "Roll".
- Counts, not percentages: "3 votes", "4 of 6 in".
- `·` joins short facts: "Sat 3/7 · doors 7 · $62 each".
- Names, not ids. "You" for the viewer.
- No hype words: awesome, let's go, lock it in, game changer, seamless, level up, boom.
- No emoji in buttons. An emoji the chat used can live in content (a title they wrote).
- Never write banter, roasts or jokes about people ("Ollie the knot thief"). Quote the chat only
  for facts a person said about themselves ("doesn't eat meat").

## Before and after

| Before | After | Why |
|---|---|---|
| Lock It In! | Lock | Title Case, hype, exclamation |
| Who's Riding With Who? 🚗 | Rides home | Say the thing; the picture shows cars |
| Spin the wheel of destiny | Spin | One verb |
| 67% voted for tacos | 4 votes for tacos | Counts |
| Ollie ate all the knots lol | Garlic knots · Ollie, Bo | Facts, not commentary |
| No one has claimed anything yet. Be the first to claim an item! | Tap an item to take it | Short, how to start |
| Congratulations, the seating chart is complete! | Everyone's seated | Warm and plain |
| Error: invalid amount | Enter an amount in dollars | Say how to fix it |
| Add New Option | Add | Two words at most |
| You have successfully marked this as paid | Paid | The state, not the event |

## Status lines

A status line says where things stand and what is next, in that order:
"2 of 5 vetoed · your turn", "You owe Sam $212 · Leo owes $66", "Tip not set".

## Summary

`summary(state, ctx)` is one line for the chat preview: the state in numbers and names.
"Dinner · Noodle bar leads with 3 votes", "Seats · 7 of 12 placed", "Nashville · 4 payments settle it".

## Warmth without jokes

Warmth comes from using their words and getting their facts right: "Ana's bday", "the minivan",
"Biscuit the dog". A warm closing line is fine when the plan is set: "It's a plan.", "Everyone's
in.", "See you at the trailhead." Keep it to one.

## Worked example: book club pages copy

- Title: "Piranesi · book club" (their book). Subtitle: "3 of 5 logged · Ana is furthest".
- Shelf detail: "120 pages" in 600, "Not started" in `secondaryText`. No "bookworm", no "slacker".
- Buttons: "+25" and "+50"; the primary is "Log".
- Empty: "Log your pages".
- Summary: "Piranesi · Ana 180, Sam 120, Leo 40, 2 not started".
