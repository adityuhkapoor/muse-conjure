---
what: A group ticket buy for an event: tier cards, the block of seats side by side with faces, who's in, and the share each.
tags: tickets ticket tier buy group event concert seats row together price fees fronts pay share money
shape: divide
source: library/lab/ticket-split/app.tsx
---
# Group ticket buy

**The moment.** An event page where friends are buying tickets together: the venue sells a few
tiers (lawn, reserved, pit) with different prices and how many are left, one person will front the
money, and the group wants to sit together.

**The visual idea.** Three tier cards across the top (name, big price, "40 left"; a red chip when
few are left), the chosen tier outlined in primary with a check. Under it, the block of seats in
that tier ("Row K · seats side by side") with each person's face in a seat. Then who's in as large
faces with a word under each ("in", "fronts", "out"), and a wash panel with the big number: the
share each, how it adds up ("5 × $96 + $14.50 fees · $552.50") and who you owe.

**Why this shape.** A ticket buy has three questions (which tier, who's in, what do I owe) and the
card answers all three top to bottom without a tap. The seat row makes "together" visible, which
is why people buy as a group in the first place.

**The satisfying moment.** Tapping in drops your face into the next seat of the row and the share
in the panel drops as the cost spreads.

**Empty and overloaded.** At 320 px the tier cards stay three across with smaller prices; with
more people than the block holds, the row shows the block and the rest wait as faces in "Who's in".

**Watch for.** Prices and fees in integer cents; the payer is a role with its own badge; "Drop out"
is secondary, "I'll pay" is the deemphasized action for the one person who fronts it.
