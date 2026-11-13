---
name: chat-card-layout
use_when: When arranging the card: what shows at rest, the height budget, and how the empty and overloaded states look.
---

# Layout in a chat card

The card lives between chat bubbles on a phone 320 to 420 px wide. People glance at it as they
scroll and tap it once or twice. It must say where things stand in one look, and stay that size
when nothing happens.

## The height budget

- At rest: 420 px or less in a chat, 600 in a story. The gate fails anything taller.
- Aim for 260 to 360. A taller card pushes the conversation off screen.
- Budget it before drawing: header 44, picture 150 to 220, status line 36, action row 52.
  Whatever does not fit goes behind an `Expand` or into the picture as a count.

## Summary at rest

Every card answers three questions without a tap:

1. What is decided or where it stands ("Tacos · 3 vetoes left", "You owe Sam $212").
2. What I did (my seat, my vote, my claim), shown on the picture in my primary tint.
3. The one thing to do next, as the one primary button or a tappable spot in the picture.

The `summary` function says the same in one line for the chat preview and screen readers.

## The empty state is designed, not blank

Empty is the first thing everyone sees. It should already look like the tool, filled with what
the chat gave, with clear places for what is missing.

- Seats exist and are open; tables are drawn; the receipt lines are there with no faces yet.
- One short line says how to start: "Tap a seat to sit", "Tap the lines you had".
- Missing facts have a visible slot: "Tip not set · Add" rather than a silent zero.
- When the chat gave nothing to fill with, the empty state invites one quick add, with a
  sensible starter the asker can replace (see `filling-from-chat.md`).

## The overloaded state still fits

Test the card with 12 people, long names and 40 taps.

- Faces: show three to five, then a `More` chip ("+7"). Use `crowd(users, max)`.
- Names: `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` on every name and label
  in a fixed box. Let sentences wrap.
- Lists over 6 items: show the top 5 and "4 more" behind `Expand`, or a `Strip` that scrolls.
- Numbers grow: "$1,500.00" must fit at 320 px. Measure with `textWidth` if unsure.
- History grows: keep the last 3 events on the card at most.

## Width

Design at 393, check at 320 and 500. Fractions and flex, not fixed px widths, for anything wider
than 120. `innerWidth()` gives the usable width inside the 12 px padding.

## Worked example: rides home after a concert

- Header: "Rides home · Sat" / "2 cars · 5 of 7 placed".
- Picture (190 px): a short time line from 10 pm to 1 am with each car as a pill at its leave
  time ("11:15 · before the encore", "12:30 · after"), faces in its seats.
- Status: "You're in Bo's car · leaves 11:15".
- Action: "Drive" (secondary) and the primary "Ride" on the car that fits me.
- Empty: cars drawn with open seats, leave times marked, the line "Pick a car".
- Overloaded: 12 people, 4 cars: car pills shrink to faces with a seat count, names move into
  `Expand`.

## Worked example: the tiny tool

A pancake counter for one person at a pancake breakfast, with a goal of 12 from the chat. The
whole card is about 200 px: the header, a stack of drawn pancakes that grows with the count (one
svg, 100 px), one line ("7 of 12"), one primary "+1". Others can tap "+1" too and their face shows
as the counter of that pancake. No list, no settings. Small is a feature.
