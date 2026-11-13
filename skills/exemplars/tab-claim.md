---
what: One person's receipt in two columns; everyone taps what they ate, the rest splits evenly, per-person totals update live.
tags: receipt bill split by item what i ate claim dinner tab tax tip request money restaurant
shape: divide
source: library/lab/tab-claim/app.tsx
---
# Receipt claim

**The moment.** One friend covered a barbecue dinner ($189.10) and pasted the receipt. People had
different things; tax and tip are on top.

**The visual idea.** The receipt as two columns of items with prices and a round tick per line;
tapping a line puts it on you. Under it, the arithmetic in one grey line ("12 unclaimed · $155
split 5 ways · $31 each · +$34.10 tax and tip"), then a row of faces with each person's total, mine
tinted. The payer's one primary action is "Request $151.28".

**Why this shape.** People remember what they ate, not what they owe. Claiming lines is the
natural act, and the totals follow. Two columns keep twelve items inside the height budget.

**The satisfying moment.** Tap a line: the tick fills and every total under the faces changes at
once.

**Empty and overloaded.** Nothing claimed yet still shows even shares, so the card is useful at
once. Many items: two columns, names end in an ellipsis.

**Watch for.** Totals in cents must add to the bill exactly, tax and tip spread by share; only the
payer requests; requested and paid are separate states.
