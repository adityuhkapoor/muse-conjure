---
what: Six dinner places as rows with drawn thumbnails; each person strikes one with their face on it; the last one standing is dinner.
tags: veto strike knock out last one standing where eat dinner restaurant places thumbnails
shape: choose
source: library/lab/dinner-veto/app.tsx
---
# Dinner veto

**The moment.** Six people, six places, and everyone knows what they don't want more than what
they do.

**The visual idea.** One row per place: a drawn thumbnail, the name, a detail line, and on the
right either "Still in" or "Vetoed" with the vetoer's face. A struck row is crossed out and keeps
the reason as a quote ("Sam: 1.2 mi in the rain??"). When it is decided, the winner row tints
selected with a check, and a `Locked`-style bar reads "Table held · 7:30 PM · 5 people".

**Why this shape.** Striking is the action, so the strike is drawn on the row itself with the face
of who did it. The quotes keep it about the friends and stop silent vetoes.

**The satisfying moment.** The last strike: the remaining row lights up and the plan line
appears ("Golden Dumpling it is. Leave by 7:15.").

**Empty and overloaded.** "Waiting on 3" with a secondary "Decide" so a slow friend can't block it.

**Watch for.** Details on rows must come from the chat (this port's ratings came from its sample
example; a live tool must not invent them); a veto can never strike the last option.
