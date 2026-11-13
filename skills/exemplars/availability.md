---
what: A study group's free time as a heat grid prefilled from the chat; paint your own blocks, the best block is ringed.
tags: when free availability schedule time grid heatmap study week days hours find a time
shape: schedule
source: skills/exemplars/availability/app.tsx
---
# Availability heat grid

**The moment.** An orgo study group with a Friday final needs one session before then. Everyone
already described their week in the chat in different shapes ("free every night after 6 except
tues", "lab mon and wed till 6", "only thursday after 8"). The library closes at midnight.

**The visual idea.** A grid of Monday to Thursday by two-hour blocks from 4 pm to midnight, each
block as blue as the number of people free then, prefilled from what each person said. The
block where the most people are free gets a ring. You paint your own time on or off by tapping or
dragging.

**Why this shape.** A poll per day would ask people to repeat themselves and hide the overlap.
The grid shows the answer (where the colour is darkest) before anyone taps, and correcting your
own row is one drag.

**The satisfying moment.** Setting the session: the chosen block stays bright and the rest of the
grid fades back around it.

**Empty and overloaded.** The grid never starts blank here: the chat described everyone's week.
(A chat that said nothing would get a pale grid and one line on how to paint.) With twelve people
the blocks stay the same size; colour depth carries the count.

**Watch for.** Hours from the chat are stored as spans and expanded in the view, not stored per
cell; only the person whose row it is can paint it; the ring is computed, never stored.
