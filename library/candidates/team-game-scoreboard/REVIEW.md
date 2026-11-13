# Team Game Scoreboard

Candidate for `library/pieces/team-game-scoreboard`. Built new for the ask "muse keep score for beer pong tonight", then generalised.

Gate: original filling pass (mutation 0.95), second example pass (mutation 0.95).

Second example chat:

> Priya: ok darts at the common room, me and Jon vs Tessa
> Tessa: you're on, 2v1 is fair since I'm a menace
> Jon: first to 5 games?
> Priya: yep, someone set up a scoreboard so we stop arguing
> Tessa: and keep a tally if we do rematches

To promote: move the folder to `library/pieces/`, add 3 retrieval asks to `library/test/retrieval-set.ts`, and run `bun test` in `library/`.

Original parameters:

```ts
const P: Params = {
  appName: "Pong score",
  title: "Beer pong · rematch tonight",
  activity: "Beer pong",
  seriesLabel: "Tonight",
  teamA: ["Kev", "Bryan"],
  teamB: ["Dev", "Marcus"],
  target: 3,
};
```
