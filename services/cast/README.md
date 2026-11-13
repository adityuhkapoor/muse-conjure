`bun test` (in `services/cast`: fake clock and the in-memory Sequencer, about 5 s; the browser test is `bun e2e-demo/cast/run.ts` from the repo root)

# services/cast

The made-up friends, played for real. When the person showing the demo is alone with one phone,
the cast connects to the sync server as each friend who is not on a real phone and types, reads,
reacts, votes, adds and spins with human timing. Every one of those is an ordinary entry in the
real log, through the real `@muse/sync` replica and the shell's chat reducer.

- Presence: a friend steps back the moment a real phone shows up as them (the shell's `here`
  heartbeat, typing, or anything it sends) and comes back about 25 s after it leaves. The cast's
  own heartbeat carries `{ cast: 1 }`, so it is never taken for a phone.
- Tools: each tool's compiled code runs in its own vm context on a worker thread (only the
  intrinsics and a DOM-free `@muse/app` stub, strings in and out, a time limit per call). Moves
  come from the tool's `arbitrary`, folded first to see what they do, then filtered: no resets,
  removals or undos, no changing your answer, no taking from others, no random amounts, one veto
  each, finishing moves held until someone has added something. `src/choose.ts`.
- Timing and manner: a persona per friend (`src/personas.ts`), notice delays, typing that fits the
  line, bursts, quiet when a chat is busy, one visible action at a time across the cast.
  Seeded: one seed, one run.
- Words: a hand-written bank (`src/lines.ts`), lowercase and clipped, filled with facts from the
  tool's own summary. No model calls unless `--cast-model <name>` (a Muse model, for example `muse-ember-1.0`), held to the
  same rules and 60 characters. The friends never write as Muse and never ask Muse.
- Posts: on Facebook Home the friends like a new post within about 20 s and act in its tool
  (`startPosts` in `services/demo/posts.ts`).
- Off switch: `bun run demo --no-cast`. Flags: `--cast-seed n`, `--cast-speed calm|normal|lively`,
  `--cast-crowd`, `--cast-model <muse model>`.
- Rails: nothing in a chat with no real person or with two or more (unless crowd is on), no tools
  made or failed, per-chat message and reaction limits, per-tool limits, pause, stop all, and
  every action in `data/cast.log` (JSON lines, `simulated: true`).

## Controls

`bun run demo` starts the cast and prints the controls URL (gateway port + 2, loopback and
private addresses only): pause and resume, who is in the cast, speed (calm, normal, lively), next
beat, scenes, stop all, reset to the seeded chats. Keys: space, N, 1 to 4 for scenes, [ and ], shift and an
initial, esc, S, R.

Scenes, each in a new chat, stopping just before the presenter's move:

1. Where are we eating: the stuck exchange. Next: "muse pick for us".
2. Concert plan: Juniper Hale, three people interested. Next: the event, Interested, Go together.
3. Roommates and chores. Next: "muse make a chore wheel".
4. Trip money. Next: "muse who owes who".

## Files

`index.ts` (`startCast`), `src/director.ts` (presence, scheduling, the outbox), `src/realm.ts`
and `src/realm-worker.ts`, `src/choose.ts`, `src/scenes.ts`, `src/control.ts` and `src/page.ts`,
`test/checks.ts` (each check returns what went wrong; `test/sabotage.test.ts` turns each guard
off and requires its check to fail).
