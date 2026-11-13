---
what: Eight bought concert seats as a two-row map; tap a seat to sit, the buyer locks it.
tags: seats seat map concert tickets rows section aisle venue claim one each lock
shape: match
source: skills/exemplars/seat-map/app.tsx
---
# Seat map

**The moment.** Jess bought eight seats for a show (section 214, rows K and L, seats 5 to 8) and
the chat is negotiating who sits where: Omar needs the aisle, Priya and Dani sit together, Lily
wants the front row. It is a matching problem with a real layout behind it.

**The visual idea.** The seats themselves, in their real rows, under a "Stage" bar, with a tiny
bowl drawing that lights up section 214 so the block reads as a place. Each seat is a button: an
empty seat shows its id ("K6"), a taken seat shows the person's face with their colour as a strip
on the seat back, and mine tints `selected` with "You" under it.

**Why this shape.** People already talk in seat ids, and "the aisle" and "the front" only mean
something on a map. Rows of names with a dropdown would lose both. The interaction lives on the
picture: tap a free seat to sit or move, tap your own to stand.

**The satisfying moment.** Your face drops into the seat with a small scale-up; when Jess locks,
the seats pop in sequence from left to right (a 55 ms stagger).

**Empty and overloaded.** Empty: every seat drawn with its id, Omar pre-seated in L8 because he
asked in the chat, and "Tap a seat to sit · 7 without a seat" with a facepile of who is standing.
Twelve people for eight seats: the standing facepile caps at three faces plus "+4"; the map does
not change size.

**Watch for.** The buyer is found by name in `init` and falls back to the first member; the lock
needs every seat full or everyone seated; one seat per person is an invariant, and "a free seat is
never refused while open" is a transition that kills lazy mutants.
