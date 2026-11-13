`bun test` (in `library/`: every plain piece passes the gate with its default and example parameters)

# @muse/library

## lab: the tools Muse picks from

`lab/` holds 224 hand-finished tools. This is the library the product uses: Muse picks one, fills
it from the chat and shows it. Each tool is a folder `lab/<id>/` with:

- `app.tsx`: the tool.
- `meta.json`: name, surface, summary, `useWhen`, `dontUseWhen`, the parameter description and the
  height at rest. The router builds its one-card-per-tool catalog from these
  (`packages/factory/src/router.ts`).
- `example.ts`: a sample parameter set. It shows the shape; Muse never shows it as content.

`labPiece(id)` in `index.ts` loads a lab tool as a `Piece`. New tools are written by the recipe in
`skills/LAB_RECIPE.md`. Tools built by the factory and generalised wait in `candidates/` for a
person to promote them. `SUPERSEDED.md` maps each plain piece to the lab tool that replaces it.
`cache/` holds tools made ahead of time (see its README).

The seeded chats use lab tools only: `bun services/demo/check-seed.ts` gates each one, and
`bun e2e-demo/sweep-tools.ts` opens every lab tool.

## pieces: 22 plain pieces

`pieces/` is the first, smaller library. Muse does not show these. The factory keeps them as the
reference for the build path and as the fallback behind a lab tool, and the tests in this folder
cover them. Each is a whole app that passes the gate, for a kind of moment: getting something
done together.

| Piece | For |
|---|---|
| `poll` | Vote between options from the chat; anyone can add one |
| `wheel` | Let the server's seed pick one; optional no-repeat for turn order |
| `assign` | Chore wheel: each spin gives the next task to someone with the fewest |
| `lock` | "3 of 4 in": going, maybe, no; the plan locks at the threshold |
| `claims` | Bring lists, chores, packing: each item needs n people; optional done |
| `slots` | Seats, beds, shifts: first claim wins, one per person |
| `overlap` | Days by times; tap what works; pick the best cell |
| `split` | Bill split in integer cents, even or by item; who paid back |
| `bracket` | Head to head rounds until one is left; ties go to the seed |
| `tickets` | Group ticket buy: tier vote, one buyer covers, cost per seat in cents, a block of seats together |
| `carpool` | Cars with a driver, seats and a time they leave; riders join; optional gas or parking split |
| `spots` | A plan with a few open spots: people ask, a host accepts or declines, spots fill |
| `settle` | Many IOUs between many people, the fewest payments that clear them, mark paid |
| `draft` | Snake draft of options between people; the seed draws the order |
| `veto` | Every option starts in; each person strikes a few; the last one standing wins |
| `shortlist` | Each person saves or skips candidates card by card; the shortlist ranks by saves |
| `list` | Shared shopping list: anyone adds, urgent first, one person takes the run, check off |
| `streak` | One check-in a day per person; current and best streaks; a weekly stake line |
| `rate` | Everyone gives one score or one word; hidden until everyone is in, then average and spread |
| `reels` | Up to three reels ("where, budget, leave at"), options ruled out by the chat; one pull |
| `shifts` | Tasks or shifts by time, each needing some people; sign up for any; gaps stand out |
| `recap` | Tap-through fact cards about a trip or a semester; facts are parameters only |

Close pairs, and what tells them apart: `slots` (named seats, one each) vs `shifts` (time rows
that need n people, sign up for several) vs `carpool` (drivers and leave times); `wheel` (pick one
at random) vs `reels` (one pick from each of up to three reels, with ruled-out options) vs `veto`
(people strike options until one is left); `split` (one payer, one bill) vs `settle` (many payers,
many IOUs) vs `tickets` (one buyer, tiers, seats); `claims` (each item needs a person) vs `list`
(one person does the whole run); `lock` (everyone in the chat, a threshold) vs `spots` (a host
picks who fills a few spots); `poll` (vote on options) vs `shortlist` (each person goes through
candidates) vs `rate` (one score or word each).

Each piece lives in `pieces/<id>/`:

- `piece.tsx`: the app. Its `// @params` ... `// @end params` block holds everything that comes
  from the chat (title, options, items, amounts). Reuse replaces only that block.
- `meta.json`: `use_when`, `dont_use_when`, `keywords` for retrieval, `guarantees`, the
  parameter JSON schema (strict-mode compatible), and example parameter sets the tests run.

```ts
import { pieces, piece, fill } from "@muse/library";
const source = fill(piece("wheel")!, { title: "Who drives?", options: ["Maya", "Leo"], noRepeat: true });
```

## What makes a piece pass the mutation stage

The gate breaks `reduce` and `onMembers` on purpose and needs the checks to notice. Habits that
do most of the work in these pieces (version 2 of the app API):

- One `transitions` entry per action that says what it did and nothing else changed ("a vote
  flips the voter's vote on that option and touches no one else"), written as an implication
  (`a.t !== "vote" || p === n || ...`) so refused actions and garbage pass. Permissions are
  transitions too ("only the payer changes the total").
- Invariants for facts that hold in every state: no duplicates, limits, conservation (shares add
  up to the bill), and "everyone in state is in the chat".
- A transition can call `rng(m.seed)` and require that the pick is what the seed gives.

Measured on the pieces: with transitions the mutation scores are 0.91 to 1.0; with the same
invariants and no transitions they are 0.53 to 0.88. The older `last` field (what the latest
action did, plus an invariant) still works, but it must be cleared in `onMembers` or it points at
a vote that left with its voter; a `last` version of `poll` scored 0.92 where the transitions
version scored 1.0. No piece keeps `last`. `assign` and `wheel` keep the newest spin because the
view animates from it.

Invariants that only restate types, or check fields the reducer never touches, catch nothing.

## Members

Pieces never copy the chat into state. `reduce`, `invariants`, `transitions`, `arbitrary`,
`summary` and `view` read `ctx.members`; `reduce` first checks the actor is in it, so someone who
joins later can vote, claim, take a seat, answer or be put on the wheel at once. `onMembers` drops
what belongs to someone who left (votes, claims, seats, answers, a pick they changed). Where the
result depends on who is in the chat, it is computed from `ctx.members`: the chore wheel is the
people there now, an even bill covers everyone in the chat except people who opted out, and a
lock that needs "everyone" follows the chat. `test/joiner.ts` checks this for every piece.

Anything decided by `meta.seed` (a spin, a draw, a tie in `bracket`) is shown from `confirmed`,
with a neutral line while `pending`.

## Adding a piece

1. Write `pieces/<id>/piece.tsx` with a `type Params`, a filled `// @params` block, and the app.
2. Write `pieces/<id>/meta.json` (copy one and edit).
3. `bun test ./test` (every piece must score 0.7 or more and pass the late-joiner check;
   `bun scripts/score.ts <id>` prints one piece's gate result). Then add 3 or more asks for it to
   `test/retrieval-set.ts` (`NEW_ASKS`). `test/retrieval.test.ts` runs them with the factory's 30
   asks and the fixed `CONFUSABLE` asks, which must keep routing to the older pieces; never tune
   keywords against `CONFUSABLE`.
