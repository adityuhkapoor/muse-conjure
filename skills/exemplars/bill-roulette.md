---
what: A small wheel picks who covers tonight's bill, with bigger slices for whoever paid least lately.
tags: wheel spin who pays random pick fair weighted small tiny dinner bill
shape: choose
source: library/lab/bill-roulette/app.tsx
---
# Bill roulette

**The moment.** Five friends at dinner take turns covering; someone always "forgets".

**The visual idea.** A pie wheel coloured by person with their faces on their slices, a pointer on
top and "Spin" in the hub, next to a short table "Paid, last 30 days" with amounts. One primary
"Spin" and the rule in grey ("no take-backs").

**Why this shape.** The weighting is the fairness, and slice size shows it without explaining it.
The whole tool is one picture and one button: small is right for this moment.

**The satisfying moment.** The wheel spins and lands (from `confirmed`, "Spinning" while pending).

**Empty and overloaded.** Equal slices when nobody has paid; with twelve people, slices thin and
the table caps with "+N".

**Watch for.** "No money moves here": it decides who pays, it does not pay.
