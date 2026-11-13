`bun test` (in `packages/taste`: offline, seeded; `bun run test:broken` checks every test fails on a deliberately broken model)

# @muse/taste

The owner's taste, learned from his swipes in `apps/taste`. No UI here: the items to judge, the
model, active selection, and the small interface the rest of the system calls.

```ts
import { taste } from "@muse/taste";
taste.scoreCopy("Lock it in!", "button");   // { score, uncertainty, reasons }: does this sound like AI-written copy?
taste.scoreTool({ piece: "lock", radius: 16, celebrate: "burst" });  // { score, uncertainty }
taste.rank(["Spin", "Spin it!", "Let fate decide"]);                 // best first
taste.summary().text;                                               // plain words, with confidence
```

`score` is the chance he likes it (0 to 1). `uncertainty` is half the width of the 90% interval on
that chance: above 0.2 means the model is mostly guessing. `taste` reads `data/taste/model.json`
(or `TASTE_DIR`), or uses priors alone if there is none. `taste.reload()` rereads it.

CLI: `bun run taste:score "<text>" [role]` and `bun run taste:summary`.

## Items (`src/items/`)

- Copy: 32 meanings, each written several ways (plain, short, long, punchy, hedged, first person,
  AI-sounding, percentage) plus mechanical variations (exclamation mark, emoji, Title Case). The
  first line of each meaning is the real string from `library/`, `packages/app/examples`, the shell
  or the factory. 408 lines. Features come from the text alone (`features.ts`).
- Tools: every library piece and app example, 8 variants each along density, accent, corner radius,
  avatar size, progress bar, celebration, motion and light or dark. Theme knobs are theme
  overrides; avatar size and progress bar wrap the piece's own imports at mount (`knobs.ts`); the
  piece files are untouched. Celebration and arrival motion are drawn by the app around the frame.
  A short script of other people's actions comes from each app's own `arbitrary`.
- Motion: 4 transitions under the `@muse/app` easings and springs and the presets in
  `the design notes` (values copied with their sources). 172 clips.
- Screens: the newest `apps/shell` screenshot run in the temp dir (`bun run shots` there).
  Left out when there is none, or with `TASTE_SCREENS=off`.

## Model

- One logistic model over item features, fit to every judgment: like 1, dislike 0, love counts
  twice, skip is ignored. A pair ("which reads better") is a Bradley-Terry comparison on the
  feature difference, so pairs and swipes train the same weights. Newton's method, MAP with a
  Gaussian prior per weight; uncertainty from the Laplace approximation. 3 ms on 1000 judgments.
- A Bradley-Terry ranking inside each meaning group, from pairs.
- Priors: his stated tastes as weak prior means (`features.ts`, each with its reason). The summary
  marks them as priors until swipes narrow them.
- A preference is reported as "likely" at 3.2 standard deviations and 0.4 log-odds, "strong" at
  4.5 and 0.6. That is strict on purpose: with about 45 features, a looser bar made a random
  swiper look confident.
- Active selection (`select.ts`): pick the kind that is behind its share of the stream, then
  with 15% chance a random item, else the item expected to shrink the undecided features'
  variance the most. Never the same meaning, piece, transition or screen view twice in a row.

## Simulated swipers (`bun run sim`, 6 seeds)

| Swiper | Judgments to recover a planted preference, active / random | After 300: recovered, held-out pair accuracy |
|---|---|---|
| Plain and short | 316 / 294 (0.93x) | 58%, 96% |
| Loud | 192 / 244 (1.27x) | 79%, 98% |
| Rare features (percent, hedge, first person, questions) | 274 / 633 (2.31x) | 67%, 100% |
| Random | no confident claims on any seed | |

Active selection pays off for features few lines have and does nothing for common ones. 90%
intervals cover the planted values 95% of the time. The prior "avoids exclamation marks" is
overturned by a swiper who likes them within 50 to 90 judgments (tested at 150).
