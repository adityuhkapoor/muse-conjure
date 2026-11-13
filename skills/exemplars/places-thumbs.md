---
what: Four dinner spots from the chat as tiles with drawn thumbnails, price and distance; tap all you'd go to, the asker picks.
tags: where eat dinner restaurant pick place vote thumbnails food price distance choose
shape: choose
source: skills/exemplars/places-thumbs/app.tsx
---
# Places with thumbnails

**The moment.** Finals are done and six friends want a celebration dinner Friday at 7:30. Four
places came up, each with a price and a distance, plus a few constraints (Bella Notte is a drive
and takes no walk-ins on Fridays; Caleb can drive four).

**The visual idea.** A two-by-two grid of place tiles. Each tile has a drawn thumbnail (`Thumb`
with `thumbKind` from the name: ramen, taco, pasta, dumplings), the name, "$16 · 10 min walk",
who suggested it, and the faces of who would go.

**Why this shape.** Places are things you picture, and the thumbnails make four names instantly
different. Tiles hold the chat's facts (price, distance) that a bare option row would drop.
Multi-select fits the chat ("ramen or dumplings").

**The satisfying moment.** Zoe picks: the winning tile turns primary with "Fri 7:30", the others
fade back.

**Empty and overloaded.** People who already said a preference in the chat start on their tiles.
With twelve people the face row on each tile caps at three plus "+N".

**Watch for.** A tie is broken by the seed and shown from `confirmed`; the notes on tiles quote the
chat, never invented ratings or hours.
