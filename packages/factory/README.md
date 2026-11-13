`bun test` (in `packages/factory`: offline, uses replay recordings and scripted models; never calls a live model)

# @muse/factory

Turns an ask in a chat into a tool that passed the gate. It picks a hand-finished tool from
`library/lab`, fills it from the conversation, changes a tool that is already in a chat, and
writes a new tool when nothing fits. Routes and events: `docs/CONTRACTS.md`.

```sh
bun run serve                          # the factory service, default port 8788 (PORT); the demo starts it for you
bun run eval                           # fixed asks, table in eval/out/<model>/results.md
bun run eval --model muse:muse-spark-1.3-contributor --limit 5
bun run retrieval                      # hit rate of keyword retrieval on 30 asks
bun run probe                          # one-off Muse API probe
bun run look <app.tsx>                 # headless pictures of one tool (src/look/cli.ts)
bun src/record.ts                      # re-record the replay fixtures from a live model
```

## Models

Meta's Muse API is the only provider (`src/models/muse.ts`, Responses API at
`https://api.meta.ai/v1`, strict JSON schema output). `replay` plays back recorded answers.

| Model | Job |
|---|---|
| `muse-ember-1.0` | pick a lab tool, decide how to change a tool, read a page (router, change decision, reader) |
| `muse-spark-1.3-contributor` | fill a tool from the chat, build a new tool, edit a tool's code (the default main model, `MUSE_DEFAULT` in `src/models/index.ts`) |
| `replay` | recordings in `fixtures/replay/`; used when there is no key |

The key comes from `MUSE_API_KEY` or the macOS Keychain item `meta-muse-api-key`, at run time. It is
kept in memory and scrubbed from errors. Live path: 45 s and one retry per model call
(`makeModel`), 90 s for one build or change (`DEADLINE_MS` in `src/serve.ts`). Scripts that run by
hand pass `patient: true` for long timeouts. Live replies are cached on disk by request hash in
`.cache/` (git-ignored; `MUSE_FACTORY_CACHE` moves it).

Environment switches the code reads:

- `MUSE_MODEL`: the live model config (default `muse`); `MUSE_DEFAULT`: `auto` or `replay`, the
  service default.
- `MUSE_ROUTER_MODEL`: the router model (default `muse:muse-ember-1.0`).
- `MUSE_POST_MODEL`, `MUSE_POST_ROUTER`, `MUSE_POST_FILL`: models for Home posts.
- `MUSE_CHANGE_PARAMS=fast` and `MUSE_CHANGE_EFFORT=medium`: change decisions on the fast model, or
  at medium effort.
- `MUSE_LOG_CALLS`: print one line per model call. `MUSE_DELAY_MS`: add a delay (demos of slow
  paths). `PORT`, `HOST`: where the service listens (loopback by default).

## Flow: an ask in a chat (`src/generate.ts`)

1. Keyword lane (`src/lab.ts`): a message like "pick for us" in a chat that names places, drinks and
   times is filled from the chat's own words. No model call.
2. Router (`src/router.ts`): the fast model reads one card per lab tool, the ask, the surface, the
   last 30 messages and the members, and goes down a ladder where a Mini is the default: `mini` (up
   to three picks), `new_mini`, then replies that each name a reason: `answer` (one or two
   sentences, maybe a chip), `cant_act`, `wont`, `greet` (a mention with no ask, decided without a
   model).
3. Fill: the main model fills the first pick's parameters from the chat only. No person, amount,
   date or place may come from anywhere else; the tool's example is a shape, never content. Options
   the model made up are marked as suggested.
4. Checks: `src/ground.ts` and `src/leak.ts` reject anything the chat did not say; the gate checks
   the tool. One repair with the reasons named, then the same tool with only the grounded parts,
   then its empty skeleton, then the next pick, then a new tool. A refusal is never the fallback.
5. When the ask wants something new, the build path writes one (see below). Every reply carries a
   reason code (`ReplyCode` in `src/types.ts`); no two causes share a line.

Misses: every ask that ends without a Mini is one line in `MUSE_MISSES` (`data/misses.jsonl` in the
demo; `src/misses.ts`) with its reason code, exit and nearest catalog Minis. Build new Minis from it.
`bun eval/declines.ts` runs 139 asks across four seeded chats and counts outcomes by exit.

With no router model (under `replay`), or when a request names a piece, an older path runs: one
route call over the 22 plain pieces in `library/pieces` (`src/retrieve.ts` ranks them), then reuse
(the lab tool that replaces the piece, via `library/SUPERSEDED.md`), adapt or build.

Progress events: `understanding`, `routed`, `drafting`, `checking`, `repairing`, `ready`, `failed`.

## Change: a tool already in a chat (`src/change.ts`)

`POST /change` takes the ask, the chat, the tool's source and its room's log. One fast call
(Ember) decides:

- `params`: new parameters over the current ones, same code.
- `swap`: the router picks another lab tool, filled from the current tool's content.
- `code`: the main model edits a copy of the source with SEARCH/REPLACE edits (`src/edits.ts`);
  the gate checks it, with one retry. The copy lives under the demo data directory, never in
  `library/lab`.
- `cant`: one honest line.
- `new`: the ask is not about this tool.

After a params change, state for items that still exist is kept: the same room when ids hold, else a
replay of the log with ids remapped by label. Under `replay`, only add, remove and rename of an
option work, by pattern.

## Build: a new tool

`src/compose.ts` is the design-first pipeline: understand the moment, route (reuse, adapt or build),
write a design card checked without a model, build with the skills it needs and the nearest
exemplar, run the gate with repairs, then look at pictures at 393 px in light and dark and fix. Speeds:
`fast` (1 candidate, no critic), `normal` (1 candidate, 1 critic round), `best` (2 candidates, 2
rounds). `src/fast.ts` is the profile for a build someone is waiting for. Posts on Home use
`src/post.ts` (pick up to three tools, fill each; build only when asked).

`bun src/compose-cli.ts --ask <development ask>` runs one ask.

## Generalise: a built tool becomes a library candidate (`src/generalise.ts`)

A script run by hand, not automatic. For a tool that was built new and scored well, the model moves
every fact from the chat into a `// @params` block and writes the metadata, then writes a second
filling for a different made-up chat. The gate must pass both. The result goes to
`library/candidates/<id>/` with a `REVIEW.md`; a person promotes it.

```sh
bun src/generalise.ts --run after [--config spark-c] [--min 4] [--limit 3] [--model muse:muse-spark-1.3]
```

## Offline tooling

Held-out asks (`eval/heldout.ts`) and the scripts that score a build run: `src/bench.ts`,
`src/judge.ts`, `src/report.ts`, `src/evaluator.ts`, `src/labloop*.ts`, `eval/routing.ts`,
`eval/labmatch.ts`. They call live models and are not part of `bun test`. `eval/CHANGES.md` lists
the harness changes and their measured effect.

## HTTP (`src/serve.ts`)

`GET /health`; `POST /generate` (server-sent events: `progress`, then `done` or `error`);
`POST /change`; `POST /post/route` and `POST /post/build`. A request can name `piece` and `params`
to fill a tool directly with no model call, and `chatId` (at most one build per chat at a time).
Binds to 127.0.0.1 unless `HOST` is set. No auth.

## Layout

- `src/`: flow files above; `src/models/` (`muse.ts`, `replay.ts`, `index.ts`).
- `prompts/`: every prompt is a file. `system.md` is filled at run time with the current
  `packages/app/API.md`.
- `eval/`: asks and scripts. `test/`: offline tests. `fixtures/replay/`: recorded answers.

## Bring your own model

Muse is the provider that ships. The factory only needs something with `id` and
`complete(request): Promise<string>` (`ModelClient` in `src/types.ts`), so any provider plugs in
without changing this repo:

1. Write a module that exports `providers`, a map from a kind to a function that returns a client:
   `export const providers = { acme: (name) => new AcmeClient(name) }`.
2. Point `MUSE_LOCAL_MODELS` at that file.
3. Choose it per job: `MUSE_MODEL="acme:big"` builds and fills, `MUSE_ROUTER_MODEL="acme:small"`
   picks, and `MUSE_POST_*` and `MUSE_READER_*` cover the composer and the page reader.

Nothing sent to the browser names a provider or a model, so the product looks the same whichever
one is plugged in.
