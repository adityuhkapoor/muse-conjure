# Harness changes and their measured effect

Every change to the compose harness after the first working version, why, and what it did. Changes
were tried on the development asks (`eval/asks.ts`), never tuned on the held-out asks.

| # | Change | Why | Measured effect |
|---|---|---|---|
| 1 | Muse client: up to 6 retries with waits up to 30 s on 429 and 503 | The Muse backend was overloaded during the baseline (`service_overloaded`) | One baseline job and two dev runs failed on 503 before; none after |
| 2 | Ember (`muse-ember-1.0`, low effort) for the reading and the route | Spark took 26 s and 23 s for these two small JSON calls | 4 s and 2 s with Ember on the same dev ask; readings kept every quoted item |
| 3 | Design card at low effort on Muse | Spark took 134 s on the design card | 37 to 47 s on the next two dev asks; cards still complete |
| 4 | Repair every failure of a stage at once, and up to 3 repairs | Spark spent its two repairs on one clipped label at a time and ran out (dev ask `rent-by-room`) | Next Spark dev runs passed (`secret-santa`, `bar-tab`) |
| 5 | Repairs and critic fixes as SEARCH/REPLACE edits, whole file only as a fallback | A whole-file repair on Spark took 60 to 380 s under load | Spark repairs 47 to 100 s instead of up to 380; 3 of 3 edit replies applied |
| 6 | Layout repairs ask to fix the kind of element, not the instance | The gate re-checks every element at three widths; fixing one name under a face left its neighbour clipped (dev ask `gift-pool`) | Added before the held-out run; effect below |
| 7 | Muse calls that write code get a 10-minute timeout | Spark build calls hit the 3-minute default under load | No more timeouts on dev runs |
| 8 | Normal speed deadline 15 minutes | On Muse under load the fix round was skipped because the deadline had passed | Fix rounds run on Spark |
| 9 | Compose version 2: a polish checklist for the critic, fit rules for the design card, a second critic round on Muse | Judge comments on the first after-run were clipped chips, overlaps and nested boxes | Spark dev ask `rides-needed`: critic 3.43, 3.71, 4.43 over two rounds; held-out Spark v2 judge mean 2.97 against 2.80 for version 1 (6 and 10 asks, not the same set) |
| 10 | Lab recipe as three passes, calibrated evaluator, best of 8 for Spark, written specs | Lab recipe in `skills/LAB_RECIPE.md`, scripts in `src/labloop*.ts` | Spark from 2.83 first draft to 3.8 best on the loop's evaluator; blind 2.86 (short brief) and 3.20 (Wonder spec) against originals at 3.02 |
