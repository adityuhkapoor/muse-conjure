# Pregeneration status

Updated 2026-11-13T05:14:16.557Z. Run time so far 169 min. Concurrency 4, load 7.6, 3 running.

This is the snapshot written by the last batch, which stopped before it finished. The cache now
holds 143 entries (`index.json`).

- tasks done: 242 of 330
- entered the cache: 142
- passed the gate but not cached: 74 rejected by the second look, 19 passed the gate and were not kept
- failed the gate after 2 attempts: 7
- median seconds per task (wall, all attempts): 144.4
- estimated time left: 53 min

## Not cached, by reason

- 34 x second look: game-result-not-confirmed
- 18 x second look: game-never-ends+game-result-not-confirmed
- 8 x second look: game-never-ends
- 7 x second look: no-action
- 4 x second look: no-action+game-result-not-confirmed
- 4 x gate typecheck: type-error
- 2 x gate render: clipped-text
- 2 x second look: no-action+game-never-ends+game-result-not-confirmed
- 1 x second look: overflow+game-result-not-confirmed
- 1 x gate mutation: mutation-score

## Cached by kind family

- coord: 107
- recap: 19
- game: 16
