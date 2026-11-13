---
what: The movies the chat mentioned seeded into a bracket; each matchup is a quick vote with poster art and the friend's quote.
tags: bracket tournament head to head best movie rank vote matchups rounds quarterfinal final champion
shape: choose
source: library/lab/movie-bracket/app.tsx
---
# Movie bracket

**The moment.** Movie night, eight films floated in the chat, each with someone's case for it
("needs the big screen", "a perfect film, fight me").

**The visual idea.** Tabs for the rounds (Quarterfinals, Semifinals, Final) and one matchup at a
time: two rows, each with a drawn poster thumbnail, the title, the friend's quote in grey and a
thin bar of votes with the voters' faces. "Close match" moves on; a grey line keeps the history
("Moved on: Past Lives · Mean Girls").

**Why this shape.** A bracket is many small decisions; showing one matchup at a time keeps the
card short, and the quotes make each pick about the friends, not the films.

**The satisfying moment.** Closing a match: the winner slides on and the next matchup arrives.

**Empty and overloaded.** "Match 1 of 7" from the start; ties flip a coin by seed, shown from
`confirmed`.

**Watch for.** Quotes come from the chat only; the bracket's shape is an invariant (each round has
the winners of the last).
