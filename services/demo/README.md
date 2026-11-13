`bun run demo` (from the repo root; `bun run demo:stop` kills leftovers). Seed and tool checks: `bun services/demo/check-seed.ts` and `bun services/demo/check-pack.ts`.

# services/demo

Starts the live demo: builds the shell and the Rust server (release), starts the sync server
(`data/demo.sqlite`), the factory service, the gateway and the cast, seeds the fake chats once, and
prints the local, Wi-Fi and Tailscale URLs. Ctrl-C stops everything. A clean clone needs Bun, Rust
and `bunx playwright install chromium-headless-shell` (the gate renders tools in headless Chrome).

`start.ts` flags:

- `--model auto|replay|muse[:model]` (default `auto`, or `MUSE_DEFAULT`). `auto` is library tools
  first, then Muse, then the recorded replays. Without a Muse key the demo starts on `replay`.
- `--port 4380`: the gateway; tool frames use port + 1 and the cast controls port + 2.
- `--db <file>` (default `data/demo.sqlite`), `--fresh` (new database), `--no-build` (skip the shell
  and server builds).
- `--no-cast`: the made-up friends stay quiet. Otherwise also `--cast-seed n`,
  `--cast-speed calm|normal|lively`, `--cast-crowd`, `--cast-model <muse model>`.
- `--unprompted`: timed offers nobody asked for (off by default).

Files:

- `stack.ts`: the same stack as functions, for the end-to-end suite.
- `gateway.ts`: serves `apps/shell/dist`, proxies `/ws` and `/generate`, serves the sandbox frame
  document from the second port and at `/__frame/frame.html` on the main port (the shell falls
  back to it after 1.5 s), takes `/client-log` (printed as `client: tool error ...`) and answers
  `/health` with `{ ok, start }` so a tab can tell the demo restarted. The frame document carries
  Muse Sans inline (`@font-face` as data URLs, 400/600/700, since the frame CSP allows
  `font-src data:` only). Binds to loopback and private addresses only (10/8, 172.16/12,
  192.168/16, 100.64/10), never 0.0.0.0. Nothing is made public. Routes are listed in
  `docs/CONTRACTS.md` section 6.
- `change.ts`: "Tell Muse what to change". `POST /change` reads the chat and the tool's room, asks
  the factory's `/change`, and writes `tool-changing`, then `tool-update` on the same message and
  one line from Muse. Each tool's source is kept per message in `data/tools/<id>.json`
  (git-ignored), written by taps on `/generate` and `/premade` and after each change; seeded tools
  start from their seed. A code change edits that copy; nothing is written into `library/lab`. When
  item ids move, the old room's actions are replayed into `a:<id>~<rev>` with ids remapped, so votes
  on items that still exist stay.
- `reader.ts`: Muse reads a page (a post, listing, event, group, story, reel or chat) with a model
  and offers up to two tools, or nothing. `reader-seed.ts` stores the answers for every seeded page
  in `reader-answers.json`, so the first paint works without a model.
- `posts.ts`: the Home composer's three routes (`/compose/*`) and the cast's part in posts.
- `premade.ts`: `/premade`, a scenario's tool choices filled from the page and compiled without a
  model.
- `seed.ts`: the fake chats through the normal protocol, with real tools from `library/lab`.
  Idempotent (fixed client ids and cseqs, a `seeded` marker in `t:index`). `SEED_VERSION` is written
  next to the database; when the fake chats change, `bun run demo` starts a new database once.
  "senior week" names places, drinks and leave times, so asking Muse to pick fills the slot
  machine from the chat; a tool made from search ("Pick for us") starts empty and asks the group to
  add options. `seed-surfaces.ts`, `seed-catalysts.ts` and `feed-tools.ts` seed the chats and tools
  behind the Facebook screens.
- `chats/`: the Messenger histories, one file per chat (three weeks, FEED_SPEC section F), loaded by
  `seed.ts` through `chats/index.ts`: apt 4b, the boys, Maya, senior week, Priya and ten more.
  `build.ts` documents the one-line-per-message format. Tool lines name a key of `TOOLS` in
  `seed.ts`. Bump `SEED_VERSION` after changing any of them.
- `check-seed.ts`: gates every seeded tool and replays the friends' moves through its reducer.
  `check-pack.ts` gates every scenario in the shell's pack. `mount-check.ts` mounts tools the way
  the shell does.
- `links.ts`: the `/m/` (always mobile) and `/d/` (always desktop) pages.

On a phone: open the printed URL, add `?as=maya` (or `aditya`, `calvin`, `arun`, `tsai`, `will`) or
pick from "Continue as". `?live=0` gives the fake store.
