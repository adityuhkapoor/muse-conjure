---
what: A daily five-letter word game made from the group chat, with a full keyboard, friends' mini grids and streaks side by side.
tags: game word puzzle daily guess keyboard grid streak gaming play finish
shape: play
source: library/lab/daily-puzzle/app.tsx
---
# Chatdle

**The moment.** A gaming surface for a friend group: a word game they already know, with today's
word taken from their own chat.

**The visual idea.** The board is the card: a five by six letter grid and a full on-card keyboard,
next to a panel of friends with their streaks and tiny coloured mini-grids that unlock once you
finish. A streak chip sits in the header. After solving: "Solved in 2/6" and the chat message the
word came from.

**Why this shape.** A game people can finish in a chat needs a clear end (six guesses), one-tap
moves (keys), and the friends visible beside you. Hiding grids until you finish keeps it fair in a
shared log.

**The satisfying moment.** The row flips to green and yellow letters and the source message
appears.

**Empty and overloaded.** Before playing, friends show "Hasn't played"; the friend panel caps at
four rows.

**Watch for.** The answer lives in state everyone's phone has, so reveals are gated in the view;
guesses are bounded and validated in `reduce`.
