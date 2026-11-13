`bun test` (in `packages/factory`: `test/lab.test.ts` puts every lab replacement through the gate)

# Pieces and the lab tools that replace them

`library/lab` is the library. The factory's main path (the keyword lane, then the router over the
lab catalog) never touches a plain piece. The table below is used only by the older path, which
runs when there is no router model (under `replay`) and by a request that names a piece: the route
names a piece, then `labChoices()` in `packages/factory/src/lab.ts` fills the lab tool that
replaces it from the piece's params and the chat when an adapter can. A lab tool's `example.ts` is a
shape reference and is never shown as content. The plain piece is never shown; if no lab tool
passes the gate the factory adapts the piece with a model.

| Piece | Lab replacement | Filled from the chat |
| --- | --- | --- |
| wheel | slot-machine | yes: places, drinks, leave times, vetoes with who and why, idk count (also the fast lane for "pick for us", "u pick") |
| reels | slot-machine | not yet |
| veto | dinner-veto | yes: food places, 1 veto each |
| settle | settle-up | yes: IOUs |
| assign | chore-draft | yes: 2 to 8 chores |
| rate | price-check | yes: a price question with a sold range |
| split | tab-claim | not yet |
| poll | after-vote | not yet |
| bracket | movie-bracket | not yet |
| lock | squad-lock | not yet |
| claims | bring-list | not yet |
| list | grocery | not yet |
| overlap | meeting-time | not yet |
| slots | meeting-time | not yet |
| carpool | event-carpool | not yet |
| tickets | ticket-split | not yet |
| spots | open-spots | not yet |
| shifts | signup-board | not yet |
| shortlist | tier-list (reel-rank is a reel, too tall for a chat) | not yet |
| draft | chore-draft (trip-draft once it has an example) | not yet |
| recap | trivia-night (album and wrapped once ported; semester-wrapped is a story, too tall) | not yet |
| streak | gym | not yet |

The seeded Messenger chats (`services/demo/seed.ts`) are lab tools only, each from its example
with the cast's names and the cast's moves replayed: `bun services/demo/check-seed.ts` gates each
one and checks every move changes something; `bun e2e-demo/seeded.ts` checks every card reaches
ready in a headless browser.
