# Contracts

The fixed interfaces between the parts of this repo. If you need to change one, stop and say so in
your report; do not change it locally.

## What this is

A working copy of Facebook and Messenger (desktop web and phone web) with Muse built in. In a
chat, a message that addresses Muse ("muse ..." or "@muse ...") gets a small live tool that
everyone in the chat uses together. Muse first picks from a library of hand-finished tools
(`library/lab`) and fills the chosen one from the conversation; if nothing fits it says so in one
line, and if someone asks for something new it writes a tool. Every tool is checked in about a
second by the gate and shown in a sandbox. A tool can be changed by talking (section 6).

## Repo layout (one owner per folder)

| Path | What | Stack |
|---|---|---|
| `server/` | Sequencer: orders, stores and broadcasts actions | Rust, axum, tokio, rusqlite |
| `packages/protocol/` | Wire types shared by server tests and clients | TypeScript, no deps |
| `packages/sync/` | Client: confirmed state + pending queue + replay | TypeScript |
| `packages/app/` | `@muse/app`: the API generated apps are written against, and its tiny UI runtime | TypeScript |
| `packages/sandbox/` | Host side: warm frame pool, bridge, mounting an app | TypeScript |
| `packages/verify/` | The gate every generated or filled app passes before it is shown | TypeScript (+ tsgo, oxc) |
| `packages/check/` | Explicit-state check of one tool within a bound (`bun run check <file>`); not part of the demo | TypeScript |
| `packages/factory/` | Picks and fills library tools, builds and changes tools, on the Muse API | TypeScript |
| `packages/taste/`, `apps/taste/` | The owner's swipe app and the model it trains (not part of the demo) | TypeScript, Svelte |
| `apps/shell/` | The Facebook/Messenger mock | Svelte 5, Vite 8 |
| `services/demo/` | Gateway, seed data, reader, post composer, `bun run demo` | TypeScript (Bun) |
| `services/cast/` | The made-up friends who chat, react and tap tools | TypeScript (Bun) |
| `e2e-demo/` | Two-phone end-to-end suite and the tool sweep | TypeScript, Playwright |
| `library/lab/` | The library: 224 hand-finished tools, each `app.tsx` + `meta.json` + `example.ts` | TypeScript |
| `library/pieces/` | 22 plain pieces from the first library; reference for the build path, never shown | TypeScript |
| `library/cache/`, `library/candidates/` | Pre-generated tools (used by `compose`) and generalised tools waiting for review | TypeScript |
| `skills/` | Craft notes the build path reads; `LAB_RECIPE.md` is how the lab tools were made | Markdown |
| `scripts/` | Asset build, lab porting notes, pre-generation | TypeScript |
| `muse/` | The earlier egui taste lab. Frozen; read for app ideas and vote data only | Rust |

Workspace: Bun workspaces at the root (`bun install`). TypeScript 7 for the gate and the root
`bun run check` (`tsc -b`). Tests: `bun test` with `fast-check`. No Python in shipped code;
Python is fine in `tools/` for analysis.

## Rule zero for every part

- Nothing opens or focuses a window on this machine. Browsers run headless
  (`chrome-headless-shell` via Playwright; install it with
  `bunx playwright install chromium-headless-shell`). `e2e-demo/sweep-tools.ts` uses the installed
  Google Chrome, also headless. No `open`, no GUI binaries, no simulators brought to the front.
- Fast feedback: each package has one command that checks it in seconds and exits non-zero on
  failure. State it at the top of the package README.
- A check you have never seen fail proves nothing. For every checker rule, keep a fixture that
  must fail it.
- Product copy follows Meta's voice: sentence case, plain words, buttons of 1-4 words, no
  exclamation marks in interface text, no taglines. This also applies to READMEs and commit
  messages. The small tools in `library/lab/` keep their own voice inside these limits (see
  section 5, copy lint). No AI attribution anywhere.

## 1. Sync protocol

One ordered log per room. A room is a chat thread (`t:<id>`) or an app instance (`a:<id>`).
The server never interprets actions. It dedupes, stamps and orders them. Every client folds the
same log through the same deterministic reducer, so all clients reach the same state.

Transport: WebSocket at `/ws`, one JSON object per text frame (binary encoding is a later
optimisation; keep encode/decode behind one module). One socket carries many rooms, multiplexed
by `room`; one subscription per room per socket (a second `hello` for a room replaces the
first). A client id is fresh per session.

Client to server:

```ts
type C2S =
  | { t: "hello"; room: string; client: string; user: string; have: number }  // have = last seq held, 0 if none
  | { t: "act"; room: string; cseq: number; action: unknown }                 // cseq: per-client counter from 1
  | { t: "eph"; room: string; key: string; value: unknown }                   // typing, presence, cursors: never stored
```

Server to client:

```ts
type Entry = {
  seq: number;        // per-room, starts at 1, no gaps
  client: string;     // sender's client id
  cseq: number;       // sender's counter, for matching pending actions
  user: string;       // actor
  time: number;       // server ms since epoch, non-decreasing per room
  seed: number;       // uint32 chosen by the server, the only source of randomness
  action: unknown;
};
type S2C =
  | { t: "welcome"; room: string; epoch: string; head: number; entries: Entry[] } // entries with seq > have
  | { t: "entry"; room: string; entry: Entry }
  | { t: "eph"; room: string; user: string; key: string; value: unknown }
  | { t: "error"; room?: string; code: "not_joined" | "bad_message" | "store_failed"; message: string };
```

`epoch` is a random id the server creates with its database and keeps in it. A `have` above the
room's head (a client from another database) gets every entry from seq 1.

Server guarantees:
- `(room, client, cseq)` is applied at most once; a resend returns the original entry.
- `seq` is gap-free and each client receives entries for a room in `seq` order.
- An entry is durable (SQLite, WAL) before it is broadcast.
- `eph` messages are fanned out to the room, last value wins per `(user, key)`, expire after 5 s,
  and are never stored.
- Idle rooms are unloaded from memory and reloaded from SQLite on demand; whole logs are not
  kept in memory.
- A failed write is reported to the room as `store_failed`; the unwritten entries are forgotten
  (their senders still hold them as pending) and the room recovers on the next successful write,
  without a restart and without a gap.

Storage: SQLite, `log(room, seq, client, cseq, user, time, seed, action)` with primary key
`(room, seq)` and a unique index on `(room, client, cseq)`, plus a `meta` table holding the epoch.

## 2. Client sync (`packages/sync`)

```ts
interface Reducer<S> { init(ctx: InitCtx): S; reduce(state: S, action: unknown, meta: Meta): S }
type Meta = { seq: number; user: string; time: number; seed: number };   // predicted locally for pending actions
type InitCtx = { room: string; members: Member[] };
type Member = { id: string; name: string; avatar?: string };  // avatar: a data: URI picture, never logged (see section 4)

interface Replica<S> {
  readonly state: S;            // confirmed state with pending actions replayed on top
  readonly confirmed: S;
  dispatch(action: unknown): void;        // applies locally at once, sends, resends after reconnect
  subscribe(fn: (state: S) => void): () => void;
}
```

On each incoming entry: apply it to `confirmed`; drop the matching pending action if it is ours;
replay the remaining pending actions on top. Pending actions are replayed with predicted `Meta`
(`seq = head + i`, local time, seed 0); the confirmed pass uses the server's values. Entries are
folded only after the current connection's welcome. A welcome with an epoch different from the
last one seen discards confirmed state and the pending queue for that room and starts from that
welcome (asking again from seq 1 if needed). After `store_failed` the replica resends pending
actions after a short wait. `sharedSocket(url).transport(room)` is the multiplexed transport.

## 3. The app contract (`packages/app`, imported as `@muse/app`)

A generated app is one TypeScript module with a default export. `packages/app/API.md` is the
complete reference a model writes from.

```ts
import { defineApp, h, type Rng } from "@muse/app";

export default defineApp<State, Action, Local>({
  name: "Chore wheel",
  summary: (s, ctx) => "Dishes: Maya. 3 of 4 spun.",  // one line for the chat preview and screen readers

  init: (ctx) => ({ ... }),                           // pure; ctx = { room, members }
  reduce: (state, action, meta, ctx) => state,        // pure and deterministic; see rules
  onMembers: (state, ctx) => state,                   // optional: the member list changed
  invariants: {                                       // each returns true when the state is valid
    "every chore has at most one owner": (s, ctx) => ...,
  },
  transitions: {                                      // optional: each checks one step
    "only the host closes": (prev, next, action, meta, ctx) => ...,
  },
  arbitrary: (state, user, rng, ctx) => action | null, // a plausible next action for this user, for fuzzing
  local: { open: false },                             // initial per-viewer state (required if Local has required keys)
  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => h(...),
});
```

Membership: members reach an app only through its log. The host records the chat's members as
a system action `{ t: "@members", members: Member[] }` in the app room when the app is created
and whenever membership changes. The runtime handles it (apps never see it in `reduce`), keeps
the current list and passes it as `ctx.members` to `reduce`, `onMembers`, `invariants`,
`transitions`, `arbitrary`, `summary` and the view. Avatars are the exception: the host sends `avatar` (a `data:` URI, because the frame's CSP allows no remote images) in `mount` and `members`, but the frame keeps it out of the logged `@members` and lays it back over the members the view and `memberOf` see (`props.members`, `Avatar`, `Facepile`). Reducers and `ctx.members` in the fold never carry one. With no `avatar`, components draw the initial. `init` first runs with no members; until an
app action changes state, each `@members` reruns `init` with the new list; after that it calls
`onMembers` (default: state unchanged). Invalid `@members` payloads and other `@` actions are
ignored.

Reducer rules (checked by the gate):
- No `Date`, `Math.random`, `performance`, `crypto`, `Intl`, timers, network, storage, globals.
  Time comes from `meta.time`. Randomness comes from `rng(meta.seed)`, a seeded generator exported
  by `@muse/app`.
- Money and scores are integers (cents, points). No floating-point accumulation in state.
- State is plain JSON: objects, arrays, strings, finite numbers, booleans, null. Iterate arrays or
  sorted keys only.
- Before calling `reduce`, the runtime drops any action that is not a plain object with a string
  `t`. If `reduce` throws, the action is a no-op; this is deterministic, so replicas still agree.
  Actions produced by `arbitrary` must never throw, and garbage actions must never change state
  in a way that breaks an invariant. An invalid action should return the same state.
- `reduce` must not mutate its inputs and must return plain JSON.
- `invariants` check one state; `transitions` check one step (permissions, "the action did what
  it says") and must hold for no-ops too. The mutation score counts both.
- `arbitrary` must change state on at least 10% of the actions it proposes.

View rules:
- The view is a pure function of its props plus `local` (per-viewer UI state that is not shared:
  an open drawer, a draft). Shared facts live in `state` only. `pending` is true while any of
  this viewer's actions are unconfirmed; `confirmed` is the server-ordered state. Anything driven
  by `meta.seed` (a spin result, a shuffle) is shown from `confirmed`, with a neutral in-progress
  state while pending.
- Width is given by the host (`theme.width`, 320-420 on phone, up to 500 in a desktop thread).
  The app reports its own height. Target at rest: 420 px or less in a chat, 600 in a story frame.
- Theme tokens are a typed object (`theme.color.primary`, `theme.radius.card`, `theme.type.body`)
  in light and dark. Every color, in inline styles and Canvas drawing alike, comes from
  `theme.color` or `userColor(member, theme)`, which gives each member a distinct color within a
  chat (up to 12). No literal colors except user-made content wrapped in `userContent(...)`.
- Visible buttons are 36 px high as in Meta's UI; every hit area is at least 44 px.
- People are shown with `Avatar`/`Facepile` from `@muse/app`. Counts, not percentages, on votes (a percentage elsewhere is a warning).
- No external URLs, no imports other than `@muse/app` and `@muse/library/*`.

`@muse/app` exports: `defineApp`, `h`, `Fragment`, signals (`signal`, `computed`, `effect`),
`rng`, `clock` (server-aligned, opt-in: the host ticks a frame only while something reads it),
`running`, motion helpers (`spring`, `tween`), `haptic`, `userColor`, `color`, and the Meta-native
components (`Button`, `OptionRow`, `Facepile`, `Avatar`, `Progress`, `CardHeader`, `Rsvp`, `Toast`,
`SystemLine`, `Canvas`) and an art kit (`Scene`, `SeatMap`, `Graph`, `Ticket`, `Receipt`, `Thumb`, charts and
more; `API.md` lists it).

## 4. Sandbox bridge (`packages/sandbox`)

Each app instance runs in its own frame: `sandbox="allow-scripts"`, a different origin from the
shell, CSP `default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline';
img-src data: blob:; font-src data:; connect-src 'none'`. Frames are created ahead of time with
the `@muse/app` runtime already evaluated; mounting an app is posting its compiled code. A warm
frame is never reloaded: where `Element.moveBefore` exists it is moved into the slot; where it is
missing (Safari, WKWebView) the pool keeps warm frames in a positioned layer and lays each mounted
frame over a placeholder in its slot, clipped to the slot's scroll containers.

The reducer and the `@muse/sync` replica both run inside the frame. The shell is a pipe between
the frame and the server (one shared socket, the app's room) and never runs generated code.

Over a `MessageChannel` port handed to the frame at warm-up:

```ts
type HostToFrame =
  | { t: "mount"; code: string; room: string; client: string; me: string; theme: Theme; now: number; members?: Member[] }
  | { t: "recv"; m: S2C }                  // a server message for this room
  | { t: "reconnect" }                     // the socket is (again) open: say hello, resend pending
  | { t: "members"; members: Member[] }    // the chat's members changed
  | { t: "theme"; theme: Theme }
  | { t: "tick"; now: number };            // server-aligned epoch ms, only while the frame asked
type FrameToHost =
  | { t: "ready"; build?: string }        // build: the server start that served the frame document
  | { t: "send"; m: C2S }                  // hello, act or eph for this room
  | { t: "size"; height: number }
  | { t: "summary"; text: string }
  | { t: "error"; message: string; stack?: string; fatal?: boolean }
  | { t: "haptic"; kind: "light" | "medium" | "success" }
  | { t: "clock"; on: boolean };
```

A pool made with `build` checks `ready.build`: a frame from another start of the server (a tab left
open across a restart) is not mounted; the pool calls `onStale` and the shell reloads once.

An `error` with `fatal` means the tool has nothing to show: its module did not load, it is not an
app, its first render threw, or it drew nothing once laid out (the host also reports a frame that
never got ready as fatal). Any other error (a later render, a summary, an event handler) leaves
the last good render on screen; hosts log it and keep the tool open. The frame judges "drew
nothing" and reports sizes only after it has been laid out with a width above 0: a frame whose slot
has no layout yet waits for one instead of failing.

Once welcomed, the frame dispatches `@members` itself when the host's member list differs from
the one in its log, and only when the log has no members yet or the host gave it a list it has
not recorded on this mount. It never answers another client's `@members` with its own: two clients
that disagree (a tab on older code) write once each, and the last one stands, instead of taking
turns forever. Actions an app dispatches with a `t` starting with `@` are dropped.

## 5. The gate (`packages/verify`)

`verify(source: string, opts): Promise<Report>` runs, in contract order (independent stages run at
the same time; the report names the first stage that failed):

1. Type-check against `@muse/app` (warm native TypeScript process; target under 300 ms).
2. Static rules: banned globals and imports, no color literals or color names outside allowed
   spots, size limit.
3. Determinism: run each generated action sequence twice and compare canonical state hashes.
4. Invariants: about 200 random action sequences from `arbitrary` across 3 simulated users with
   interleavings, a reconnect, garbage actions and member changes, folded the way the runtime
   folds; every invariant after every step, every transition on every step, and replica state
   equals a straight replay of the server log.
5. Invariant strength: mutate the reducer (drop a branch, flip a comparison, skip a guard) and
   score the share of mutants an invariant or transition catches; a check that catches none is
   reported as weak. `arbitrary` must change state often enough (`arbitrary-weak`).
6. Render: mount through the real sandbox in headless Chrome at widths 320, 393 and 500, light
   and dark; taps driven by `arbitrary` through the DOM plus raw pointer events; layout lint
   from DOM geometry (clipped text, text overlap, outside the app, contrast under WCAG AA, hit
   area under 44 px, height over budget at rest, blank render), sampled twice 0.6 s apart and
   reported only when both samples show it; axe-core.
7. Copy lint: Meta voice rules for interface text, relaxed for what a tool or person says.
   Sentence case, no ALL CAPS; button labels of 1-4 words (5 or more fails); no exclamation
   marks in labels, buttons, headings and hints, but allowed in user-made content and drawn
   stickers (SVG/canvas text, `userContent(...)`, quoted chat lines, example data); a percentage
   is a warning (fine when the number is the tool's subject: odds, a rating, a progress share);
   banned phrases cover corporate filler and AI-sounding copy only, not playful verbs; no emoji
   in buttons.

`Report` is JSON: `{ ok, stage, failures: [{ rule, message, trace? }], warnings, timings,
mutation: { score, killed, total, inert }, weak: string[] }`. A failure carries the shortest
failing action sequence so the model can repair from it. Whole gate target: 3 s; steps 1-5
under 1 s.

## 6. Factory and gateway

Two services sit between the shell and the models. The factory (`packages/factory`, port 8788 by
default, 127.0.0.1) holds the models and the gate. The gateway (`services/demo`, port 4380 by
default) serves the shell, proxies the sync socket and the factory, and does the work that needs the
chat log. A model is one config value: `muse[:model]` (the Muse Responses API; key from
`MUSE_API_KEY` or the macOS Keychain item `meta-muse-api-key`, read at run time, never printed or
written to disk) or `replay` (recorded answers, no model). Muse is the only provider.

```ts
interface ModelClient { complete(req: { system: string; messages: Msg[]; json?: JsonSchema; images?: string[] }): Promise<string> }
```

### Factory routes

`GET /health` answers `{ ok, model: "auto" | "replay", queued, building }`.

`POST /generate` takes `{ ask, chat: { title?, messages: [{ from, text }] }, members: [{ id, name }],
surface, chatId?, model?, piece?, params?, recentPieces? }` and answers `text/event-stream`: `progress`
events (`routed` carries the lab Mini's `name` once it is picked, before its check ends, so the card
can say which one it is setting up), then one of `done` (the tool: `source`, `code`, `name`, `summary`, `path`, `piece`,
`attempts`, `timings`, `ms`, and `suggested` when a fill made options up), `reply` `{ text, code,
chip? }` (no Mini, with a reason code: `answer`, `cant_act`, `wont`, `greet`, `needs_model`,
`too_slow`, `failed`, or `change` for a redirect, below; `chip` `{ id, name }` is a lab Mini offered
with the line) or `error` `{ message, code: "failed" }`. A second request for a chat that is already
building gets 409 `{ error, code: "busy" }`. `recentPieces` are the lab ids of the chat's Minis in its last
30 messages (the gateway adds them). `surface` is one of `chat`, `event`, `group`, `feed`, `marketplace`,
`gaming`, `story`. Every ask that ends without a Mini is logged to `MUSE_MISSES` (the demo:
`data/misses.jsonl`). The flow, a ladder where a Mini is the default:

1. Library first. A keyword lane without a model fills the slot machine for "pick for us" when the
   chat has "x or y" lines. A mention with no ask ("muse", hi, thanks, lol) gets one friendly line
   (`greet`) and nothing is made. Otherwise the router (Ember) reads the lab catalog (one short card
   per tool), the ask, the surface, the last 30 messages and the members, and decides an outcome:
   `mini` (up to three picks), `new_mini`, `answer` (a fact, advice, a feeling or writing: one or two
   sentences, maybe a chip), `cant_act` (an action in the world: one line and the Mini that gets the
   group there), `wont` (harm or watching a person: a plain refusal with the reason) or `greet`. The
   filler (contributor Spark) writes the first pick's `// @params` block from the chat only, over
   the tool's empty skeleton. A lab tool's `example.ts` is a shape and is never shown as content. The
   fill is checked for grounding (no person, amount, date or place the chat did not give; no
   leftovers from the example) and by the library gate (params shape and a render, no fuzzing),
   repaired once with the reasons named. Options Muse proposed are listed in `suggested` and said to
   be Muse's in the Mini's subtitle when it has one.
2. A fill that does not hold up degrades, never refuses: the same Mini with only the grounded parts,
   then its empty skeleton (the Mini collects the rest), then the next pick, then a new Mini. A pick
   that is already in the chat (`recentPieces`) is a change to it: `reply` with code `change` and `piece`,
   and the gateway changes that Mini in place (offline: the offline line, never a second copy).
   A `reply` is shown as a text message from Muse in place of the building card (`tool-failed` with
   `text`, `code` and `chip`; the chip makes that Mini when tapped).
3. The ask wants something new: the build path. Understand and route (the 22 plain pieces in
   `library/pieces` are references and are never shown), plan, draft candidates in parallel, the full
   gate, repair with the failing trace (two tries at most), and pick the best passing candidate.
4. With `piece` (and `params`) the shell names a lab tool itself and no model is asked.
5. A build or a change has 90 s in all; after that the factory sends `reply` with "That took too
   long. Try again in a moment" (`too_slow`). A model call has 45 s and one retry; a live build that
   failed in its first 35 s runs once more, silently. Each other way a build ends has its own line
   (the shell's `LINES` in `apps/shell/src/live/factory.ts`: busy, model unreachable, dropped
   stream, page reloaded, stale). A second "muse ..." while a build runs waits for it, then goes.
6. Under `replay`, anything that needs a model answers "Muse needs a connection to make this".

`POST /change` changes a tool that is already in a chat: `{ ask, chat, members, explicit, tz?, tool:
{ name, source, piece }, log: [{ user, action }] }` (the tool's source, its room's log, and the
asker's UTC offset in minutes for clock times in the ask) streams `progress` (`{ t: "decided", tier }`
first) and ends with `done` `{ tier, source, code, name, summary, note, room: "same" | "new", replay? }`,
`reply` `{ text, code }` (Muse cannot do it, `cant_act`, with what this Mini can change; or an amount
nobody gave, `ask`: "How much more?"; the tool stays as it was; a change that moves nothing a person
could see is this reply, never a success note, and a params change's `note` is worded from the
diff, not by the model), `new` (not about this tool: build a
new one), or `error`. `explicit` is true when the person pointed at the tool ("Tell Muse what to
change") and false for a plain "muse ..." message. There are three tiers, decided by one fast call:

- `params`: new parameters over the current ones, same code. Votes stay where the items still exist.
- `swap`: a different library tool, picked by the router and filled from the current tool's content
  and the chat. State starts over in a new room.
- `code`: the main model edits a copy of the tool's source with SEARCH/REPLACE edits. The copy passes
  the gate (one retry with the failure) and runs in the same room where the state shape matches.
  The copy lives in the demo's data directory, `<data>/tools/<message id>.json`; nothing is ever
  written into `library/lab`.

With `room: "new"` the tool runs in a fresh app room (`a:<id>~<rev>`); `replay` lists the old room's
actions (users kept, item ids remapped) to post there first, so state for items that still exist
survives. In the chat room, a change is three actions on the tool's message: `tool-changing { id,
ask }`, `tool-update { id, name, summary, code, room? }` (bumps `tool.rev`; `tool.room` names the app
room when it is not `a:<id>`), and `tool-change-end { id }` when nothing changed. Under `replay`
only adding, removing and renaming an option work, by pattern.

`POST /post/route` `{ text, me, friends, photo?, fill? }` streams `picks`, then `filled` or
`unfilled` per pick, then `done`: a model reads a draft post and picks up to three library tools,
each filled with editable `suggested` fields. `POST /post/build` `{ text, me, friends, photo? }`
streams `stage` events and ends with `done { code }`: "Make something new for this post", which runs
the compose pipeline (`packages/factory/src/compose.ts`: design card, build, gate, a look at pictures).
With `replay` as the default model, `/post/*` answers `{ available: false }`.

### Gateway routes

| Route | What |
|---|---|
| `/ws` | Proxy to the sync server (section 1) |
| `/generate` | Proxy to the factory; when the body names the tool's message (`toolId`), the source that lands is kept for later changes |
| `/premade` | A scenario's tool choices, each already filled from the page; the first available is compiled and answered in the same event stream as `/generate`. No model, except the refill for "Use for my group" |
| `/change` | `{ chatId, toolId?, ask, explicit, as, tz?, model? }`: reads the chat and the tool's room, asks the factory's `/change`, writes `tool-changing`, then `tool-update` and one line from Muse into the chat for everyone |
| `/reader/read` | `{ surface, object, page, did, people, ask?, unprompted? }`: Muse reads one page object with a model (Ember picks, contributor Spark fills) and offers up to two tools (three for a typed ask), or nothing. Seeded pages are answered from `reader-answers.json` |
| `/reader/refill` | `{ tool, params, idea, chat, members }`: a tool refilled for another chat |
| `/compose/tools`, `/compose/build`, `/compose/route`, `/compose/new` | The Home composer: available lab tools; a filled tool compiled for the preview; the post router (`/post/route`, streamed); something new built into the post's own chat |
| `/client-log` | A browser reports why a tool did not open; the gateway prints `client: tool error room=... msg=...` in the demo log |
| `/health` | `{ ok: true, start }`. `start` changes with every start of the demo; a tab that sees a new value reloads itself |
| `/__frame/frame.html` | The sandbox frame document, also served from the second port; the shell falls back to this path after 1.5 s |

Environment switches the code reads: `MUSE_API_KEY`, `MUSE_MODEL` (live model, default `muse`),
`MUSE_DEFAULT` (`auto`, `replay`, or a model; `--model` sets it), `MUSE_ROUTER_MODEL`,
`MUSE_POST_MODEL`, `MUSE_POST_ROUTER`, `MUSE_POST_FILL`, `MUSE_READER` (`off` turns the reader off),
`MUSE_READER_PICK`, `MUSE_READER_FILL`, `MUSE_CHANGE_PARAMS` (`fast` keeps the fast model's new parameters instead of asking the main model), `MUSE_CHANGE_EFFORT` (`medium`), `MUSE_LOG_CALLS`,
`MUSE_FACTORY_CACHE`, `MUSE_DELAY_MS` (tests), `PORT` and `HOST` (the factory).

## 7. Shell (`apps/shell`)

`design/build.ts` from `design/tokens.json`; components never hard-code a value that has a token. The
shell talks to the server through `packages/sync` and shows apps through `packages/sandbox`. Five
cast members are the team, with their permission, and show real photos; everyone and everything else
is made up and drawn. There is no login screen; a small "Prototype" label is always present. Controls
that are not wired are drawn at full strength with the title "Not in this prototype".

### Feed room actions (`t:feed-home`)

The Home feed room is folded by the shell's chat reducer (`apps/shell/src/live/chat-reducer.ts`). Besides
`msg` and `react` (new posts and their likes), it takes `comment { id, post, text, replyTo? }` (text up
to 1,000 characters, at most 500 comments in the room), `comment-like { id }` (a toggle per person), and
`post-like { id }`: a toggle per person on a seeded Home post, keyed by the post's id. State is
`postLikes: Record<postId, personId[]>`. A post's count is its written count plus the people in that
list; invalid ids and other garbage leave the state unchanged.

People in seed data (shell surfaces, `muse/seed.ts`, `store/fake-data.ts`, `services/demo`) are wire ids only; the seeded world's main character is Aditya (`dev`), the default viewer.
`"me"` exists only as the store's name for whoever is viewing, at render time; it never appears in seed data.
"Everyone" and "everyone but the viewer" come from `src/store/cast.ts` (`CAST_IDS`, `othersOf`, `castWithViewerFirst`), never a literal list; `scripts/seed-ids.ts` (in `bun run check`) enforces both.

