---
what: A spring break trip as a boarding pass that fills seats; the price drops as people commit and it locks at four.
tags: trip commit who's in threshold lock boarding pass ticket flight airbnb price per person spring break
shape: gather
source: skills/exemplars/boarding-pass/app.tsx
---
# Boarding pass

**The moment.** Nia proposed NOLA for spring break with real numbers (flights $128, the Airbnb
$342 for four nights, sleeps six) and said she books once four people commit. The group needs to
move from "in" messages to a commitment that triggers a booking.

**The visual idea.** A boarding pass (`Ticket` frame): PIT to MSY in big codes, the dates, a row
of six seats that fill with faces as people tap "I'm in", the per-person price on the stub, and a
barcode that prints when the pass locks.

**Why this shape.** A trip is already imagined as a ticket, and a ticket implies commitment. The
price on the pass follows the number of seats filled, which turns the chat's arithmetic ("$185 if
six, $213.50 if four") into something everyone sees move.

**The satisfying moment.** The fourth "in" locks the pass: the band turns primary, the barcode
prints. The lock holds after that; people can still join or drop out and the price follows.

**Empty and overloaded.** Empty is not empty: Marcus and Hana said "in" in the chat, so they start
seated, and the line says "2 of 4 to lock". More people than seats: the pass holds six (the
Airbnb sleeps six), so the join stops there.

**Watch for.** Money per person is computed in integer cents with the leftover going to the
booker; the lock is a one-way fact with its own invariant; the price is computed from state, never
stored twice.
