---
what: Rent split as a floor plan: each room a tile with its person, size and price; sliders weight size, bath and parking; locks when all agree.
tags: rent split room size bigger room pays more floor plan apartment bath parking agree lock money
shape: divide
source: library/lab/rent-split/app.tsx
---
# Rent split on a floor plan

**The moment.** Four roommates on one lease, rooms of different sizes, one with its own bath, one
with the parking spot, and an argument about what "fair" means.

**The visual idea.** The apartment as a floor plan: four room tiles around the living room and
kitchen, each with the person's face, square footage, the big monthly price and "+$264 vs even".
Under it, three sliders (room size, private bath, parking) that move every price at once, and a
row of faces that each tap "Agree".

**Why this shape.** Rent fairness is about rooms, so the rooms are the picture. "vs even" makes
the trade visible without percentages, and the sliders turn the argument into one shared knob.

**The satisfying moment.** Moving a slider: all four prices tick to new values together; the last
"Agree" locks the plan.

**Empty and overloaded.** Unclaimed rooms show "Open" with a dashed face; long names end in an
ellipsis inside the tile.

**Watch for.** Shares must add up to the rent exactly in cents (leftover cents to one named room);
any slider change clears agreements, which is a transition worth stating.
