---
what: Three reels (where, drinks, leave at) that pick tonight's plan and never land on what the chat vetoed.
tags: idk u pick decide plan tonight random spin reels where drinks time vetoed ruled out
shape: choose
source: library/lab/slot-machine/app.tsx
---
# Plan slot machine

**The moment.** Four people said "idk u pick" about tonight, but the chat also ruled things out:
Jess won't do frat row, Maya is broke so nothing over $12, Sam has an 8 am lab so nothing past 11.

**The visual idea.** Three reels side by side, each a soft wash column showing the option above,
the current pick in a white window in the middle, and the option below. Options the chat vetoed
are struck through in red. Under the reels, one chip per veto with who said it ("× $12+ · Maya's
broke"), a plain line ("It can't land on anything you vetoed.") and one primary "Spin".

**Why this shape.** The night has three separate parts, and a reel per part shows all of them at
once. The strike-throughs and veto chips prove the pick respects what people said, which is what
makes a random pick acceptable to the group.

**The satisfying moment.** The reels spin and stop one by one, left to right, on the seed's pick
(shown from `confirmed`, a neutral spin while pending).

**Empty and overloaded.** With one or two parts the reels widen; long option names end in an
ellipsis inside the window.

**Watch for.** The seed never picks a vetoed option (an invariant over the pick); the veto chips
quote the chat, never invented reasons.
