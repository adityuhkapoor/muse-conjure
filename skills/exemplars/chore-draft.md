---
what: Roommates draft chores in snake order; heavier chores are worth more points and a load row shows whether it came out even.
tags: chores draft snake order roommates fair points load turn pick apartment
shape: match
source: library/lab/chore-draft/app.tsx
---
# Chore draft

**The moment.** Roommates splitting the apartment's chores, and nobody wants bathrooms.

**The visual idea.** The chores as a two-column board, each with a short detail from the chat
("Pans included", "Keep Gerald alive") and its weight in points. A taken chore shows the
drafter's face. Under it, a "Load" row: one tile per person with points so far and a bar, against
the line "Fair is 11–13 pts each".

**Why this shape.** A draft turns a fight into turns, and points make "fair" checkable. The load
row answers the only question people really have: am I doing more than you?

**The satisfying moment.** Your pick: the chore takes your face and your load bar grows.

**Empty and overloaded.** "Theo is picking" at the top makes whose turn it is obvious; "Auto-pick"
is the escape hatch for the person who is up.

**Watch for.** Snake order from the seed, a chore drafted once, only the person up may pick;
points per person add up to the total.
