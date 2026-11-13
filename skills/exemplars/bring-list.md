---
what: A potluck list with drawn food icons; each person claims one thing, doubles are flagged and fixed, gaps stand out.
tags: potluck bring list who brings what claim items party friendsgiving doubles gaps sign up
shape: match
source: library/lab/bring-list/app.tsx
---
# Bring list

**The moment.** Friendsgiving at Maya's for eleven people; two people both said turkey and nobody
said ice.

**The visual idea.** Rows of dishes, each with a small drawn icon, the name, and who is bringing
it ("Nobody yet" in grey) with a "Bring" button or their face. A double is a red line on the row
("Sam and Ana both said turkey") with a "Fix" button. A bar at the bottom fills as the table is
covered: "2 of 8 covered · 6 gaps".

**Why this shape.** The useful facts are the gaps and the doubles, so the card makes both loud and
everything else quiet.

**The satisfying moment.** Claiming the last gap: the bar fills and the footer reads the table is
covered.

**Empty and overloaded.** Rows from the chat start filled where people already called a dish;
with twelve rows the list stays one line each.

**Watch for.** One item per person is an invariant; a double is computed from claims, never
stored.
