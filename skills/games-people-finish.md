---
name: games-people-finish
use_when: When the ask is to play: a board game, a party game, a quiz, a drawing game, a challenge with a winner.
---

# Games people can finish

A game in a chat is played in short visits: someone taps, puts the phone down, someone else taps
an hour later. Games that work here are turn-based or simultaneous, end in a few minutes of total
play, and always show whose turn it is and how close the end is.

## What makes a chat game finishable

- **A clear end.** Four in a row, ten questions, three rounds, first to five. Show progress to the
  end ("Round 2 of 3", "6 of 10").
- **A visible turn.** "Your turn" or "Ollie's turn" in the status line, the board tappable only for
  the person whose turn it is, their face highlighted.
- **Moves in one tap.** Drop a disc in a column, pick an answer, place a piece. No drag-only
  input; drag can be an extra.
- **The board is the card.** Full width, drawn properly: discs in a grid with holes, cards that look
  like cards, a drawing surface with a pencil feel. Rows of buttons are not a game.
- **Who plays.** If the chat named players ("me vs ollie"), only they move; others watch with their
  faces in the audience row. Otherwise anyone in the chat joins.
- **A stake from the chat.** "Loser buys coffee" goes on the card as the stake line and on the
  result: "Ollie wins · Jun buys coffee".
- **Rematch.** One button after the end resets the board and keeps a tally ("Jun 1 · Ollie 2").

## Fairness and chance

Turn order and any shuffles come from `rng(meta.seed)`. Hidden information (the word to draw, the
lie in two truths) is a real problem in a shared log: everyone's phone has the state. Either keep
it honest-by-design (the drawer sees the word, others are asked not to peek, and the card says so
plainly), or make the secret part something the person types and only reveals later. Say which.

## Real-time feel without timers

There are no timers. A "round" ends on an action (everyone answered, the drawer taps Done), not on
a clock. Show live progress instead: faces of who has answered.

## Drawing games

A shared `Canvas` with `onPointer` collects strokes as short point lists in state (bounded: at
most about 40 strokes of 32 points, coordinates rounded to integers). The drawer draws; others
guess by tapping one of four choices or typing. Keep it light: one word per round, three rounds.

## Worked example: dots and boxes, Jun vs Ollie, loser buys coffee

- State: `lines: string[]` of drawn edges ("h:2:3", "v:1:0") on a 4 by 4 dot grid, `boxes` as
  owner ids, `players: [jun, ollie]` found by name, `turn`, `tally`, `at`.
- Move: `draw {edge}`; only the player whose turn it is; the edge is not drawn; the game is not
  over. Closing a box keeps the turn.
- Invariants: every box owner is a player; a box is owned only if its four edges are drawn; the
  game is over exactly when all edges are drawn; only the two players have boxes.
- View: dots in `secondaryText`, drawn lines in the drawer's `userColor`, owned boxes filled
  with a soft tint of the owner's colour and their initial. Edge tap areas are 44 px wide strips
  along each gap. Status: "Your turn" or "Ollie's turn · loser buys coffee". The newest line draws
  itself in with a 250 ms tween. At the end, the score and "Rematch".

## Worked example: who said it

Ten questions at most, from facts in the chat only. Each person answers each question once;
answers are hidden until they answer, then the question shows everyone's faces on the option they
chose and the correct one in `positive`. A score row of faces at the top. The end shows the order
by score with "4 of 5" style counts, no trophies.
