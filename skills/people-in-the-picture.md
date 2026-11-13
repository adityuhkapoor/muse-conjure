---
name: people-in-the-picture
use_when: Whenever the tool shows who did what: votes, claims, seats, payments, turns, scores.
---

# People in the picture

These tools are social. The reason a group tool beats a spreadsheet is that you can see your
friends in it: Sam took the cooler, Ana is in seat K6, three faces are on tacos. Put people
where the action is, as faces, not as a list of names somewhere else.

## Faces, placed

- Use `Avatar` (one person) and `Facepile` (several) from `@muse/app`, or `Placed` to put a face
  at a point in a picture (it springs in and moves smoothly).
- The face sits on the thing it belongs to: in the seat, on the receipt line, at the end of the
  arrow, in the car, on the cell of the day they can make.
- The viewer is always findable: their face gets the primary ring (`Placed` with `me`), their row
  or cell tints `color.selected`, and text says "You" instead of their name.
- `userColor(id, theme)` gives each person a stable colour in this chat. Use it for their pieces
  in a game, their line in a chart, the strip on their seat. Not for text.

## Names

- First names only, from `members`, never ids. "You" for the viewer.
- Name next to a face when there is room and the face alone is ambiguous; drop it when space is
  short and the face carries the meaning.
- Never write words on someone's behalf ("Leo is broke lol"). Their chat line may appear as a
  quoted note only when it is a fact they stated ("doesn't eat meat").

## Counts with faces

"4 going" next to four faces beats "4 going" alone and beats four faces alone. Counts, not
percentages. Past five faces, `More` with "+N".

## Members change

People join and leave the chat after the tool is made. Read people from `ctx.members` and
`members`; never copy the list into state. When someone leaves, `onMembers` frees what was theirs
(their seat opens, their claim drops). Someone who joined late can act at once.

## Roles

When the chat gave someone a role (paid the bill, has the car, is the seller, is hosting), show it
on their face as a small badge or a word under it: "Paid", "Driver", "Seller". The role also
decides permissions (`meta.user === state.payer`). Find the person by name in `init`, which reruns
with the member list until the first action, and fall back to the first member.

## Worked example: trip activity draft

Six friends draft Nashville activities (honky tonks on Broadway, hot chicken, the Opry, a Ryman
tour, a brewery, a pedal tavern). The board is a grid: columns are the people (face on top, name
under), rows are draft rounds. Activities not yet picked sit in a pool of chips under the board.
When it is my turn my column header gets the primary ring and the pool chips become tappable. A
pick moves from the pool into my column with `Placed`-style motion. Everyone sees at a glance who
has what and who is up. The picture is the people.

## Worked example: what goes wrong

A settle-up tool that lists "Ana owes Priya $188.00" in rows: correct and dead. Same data as a
ring of faces with arrows labelled "$188", where my arrows are primary and tapping one marks it
paid (the arrow turns `positive` and fades): the group sees the whole web, and I see mine first.
