---
what: Many IOUs from a trip drawn as a tangle of arrows between faces; Untangle turns them into the fewest payments, tap yours to mark paid.
tags: who owes who iou settle up trip expenses many payers debts graph arrows untangle paid venmo
shape: divide
source: library/lab/settle-up/app.tsx
---
# Settle up

**The moment.** After a trip, six people paid for different things (Airbnb, gas, groceries, the
bar) and everyone owes everyone a little. The chat is a mess of numbers.

**The visual idea.** A `Graph` of faces in a ring with every IOU as an arrow with its amount on a
chip: honestly tangled. One primary "Untangle" turns it into the few payments that clear it all,
drawn as clean dashed arrows that turn into green "✓ $212" chips as people pay.

**Why this shape.** The tangle is the feeling of the chat; untangling it is the relief. The graph
shows the whole web, and each person finds their own arrow without reading a table.

**The satisfying moment.** The untangle: the arrows animate from many to few ("4 payments instead
of 9"), then a progress bar fills as payments are marked.

**Empty and overloaded.** Before any IOU: the faces in a ring and "Add" as the one action. Many
IOUs: the summary line ("9 IOUs · $958 between 6 people") carries the count; the arrows thin.

**Watch for.** The settlement is computed in integer cents and must clear every balance (an
invariant); only the payer or payee marks a payment; an "Add" stays secondary.
