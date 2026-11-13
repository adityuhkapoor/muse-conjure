A hackathon prototype. Not affiliated with or endorsed by Meta.

Check a folder with the command at the top of its README. Start the demo with `bun install`, then `bun run demo`.

# Muse Conjure: your group chat makes the app it needs

Muse is personal. Conjure makes it social.

Muse Conjure is a feature concept for Meta's Muse agent, built as a private prototype: a working
copy of Messenger and Facebook with Conjure inside. It is not a Meta product. Five cast members
are the team (Aditya, Calvin, Arun, Tsai Lin, Will Li), with their permission; everyone and
everything else is made up. There is no login screen, and a small
"Prototype" label stays on screen.

Words used here:

| Word | Meaning |
|---|---|
| Muse | Meta's agent. It reads, picks, fills and builds. |
| Conjure | The feature, and the verb for making a Mini. |
| Mini | The small live thing that lands in a chat or on a post. Reels is the model for the capital: a Mini, two Minis. |
| Idea | An offer from Muse on a page ("Idea from Muse"): a Mini it could conjure from what you just did. Nothing is made until you tap. |

In code and contracts a Mini is still a "tool" (`library/lab`, `tool-update`, the gate).

## What it does

In a chat, a message that addresses Muse ("muse pick for us", "@muse who owes who") gets a Mini
that everyone in the chat uses together. Nobody sees code. Muse picks from a library of 224
hand-finished tools (`library/lab`), reads the conversation, and fills the one that fits with
what people said: names, options, amounts. A Mini is never filled from its own example. If nothing
fits, Muse says so in one plain line. If someone asks for something new, Muse conjures it: it
writes the code, the gate checks it, and then it is shown.

A Mini can be changed by talking: "Tell Muse what to change" under a Mini, or a plain "muse ..."
message about the latest one. Muse changes the Mini's settings (state stays where the items still
exist), swaps it for a different one from the library, or edits a copy of its code made for that
one message. If it cannot, it says so in one line.

Five things to try. Use two browser windows, one as `?as=maya` and one as `?as=aditya`. Items 1
and 2 work on recorded answers; items 3 and 4 need a Muse key.

1. Open "senior week" in both. Send `muse pick for us`. The chat names places, drinks and leave
   times, so Muse fills the slot machine from it without a model call. Spin it in one window and
   watch the other.
2. Under that Mini, tap "Tell Muse what to change" and send `add pho`. Muse adds the option to
   the reels in place, for everyone in the chat.
3. Open "apt 4b" and send `muse split the rent`. The chat says rent goes to 4200, Maya wants the
   big room and Aditya pays for parking. Muse picks a rent Mini and fills it from that.
4. Open Facebook (`?app=facebook`), tap Create post, tap the "ranking the dining halls" example,
   then Ask Muse. Muse reads the draft and offers up to three Minis with editable fields, or
   "Make something new for this post". "Use in a chat" refills an attached Mini for a chat you
   choose.
5. In "the boys" (Aditya, Calvin, Arun and Tsai Lin; use `?as=aditya` and `?as=calvin`), open the
   Juniper Hale event link, tap Interested, then Go together. A new group chat opens with a
   who's-in Mini. Taps in one window show in the other.

Which model does what (Meta's Muse API; no other provider is in the tree):

| Job | Model |
|---|---|
| Pick a library tool, decide how to change a Mini, read a page for an Idea | `muse-ember-1.0` (router at minimal effort) |
| Fill a tool from the chat, a post or a page; write the new params of a change | `muse-ember-1.0` at minimal effort first, then low, then `muse-spark-1.3-contributor` at minimal when a fill does not hold up |
| Build a new tool, edit a tool's code | `muse-spark-1.3-contributor` |
| No key on the machine | `replay`: recorded answers, no model |

An ordinary ask in a chat, measured on 16 asks in four seeded chats, 3 runs each, no cache
(`bun packages/factory/eval/speed.ts`): about 5.0 s from the ask to a checked Mini (median; worst
26.7 s when a fill falls through to the larger model), against 19.9 s (worst 57.8 s) when the larger
model filled every ask. A post draft in the composer fills three tools in about 4 s, against 23 to 32 s.
Stage by stage: router 1.9 s, fill 1.6 s, check 1.1 s; the "is this a change?" decision (1.3 s) runs
beside routing and is skipped for asks that plainly do not touch the Mini in the chat.

Without a key the demo still starts. The keyword lane (like "pick for us") and every seeded chat
work; other asks get one line saying Muse needs a connection.

## Status

| Part | Folder | State |
|---|---|---|
| Messenger, Events and Facebook screens (phone and desktop, light and dark) | `apps/shell` | Live |
| Sync server: one ordered log per room, so phones cannot disagree | `server` | Done, with race tests |
| Client that shows your tap at once and reconciles with the server | `packages/sync` | Done |
| The API a generated tool is written against, and its small runtime | `packages/app` | Done |
| Sandbox: each tool runs in an isolated frame | `packages/sandbox` | Done |
| The gate: every generated or filled tool is checked before anyone sees it | `packages/verify` | Done |
| Factory: picks and fills library tools, builds new ones, changes tools in a chat | `packages/factory` | Live on Muse |
| Library: 224 lab tools that Muse picks from (each becomes a Mini) | `library/lab` | Live |
| Made-up friends who chat, react and tap tools | `services/cast` | On by default |
| Gateway, seed data, reader, post composer and one-command start | `services/demo` | Done |
| End-to-end suite: two phones, Messenger, Events, Facebook | `e2e-demo` | About 40 checks |

Facebook screens (`?app=facebook`): Home with a feed of 49 posts and real photos, stories, Reels,
Marketplace, Events, Groups, Friends, Gaming, Notifications and profiles. Muse reads a page
with a model and offers an Idea (`services/demo/reader.ts`); what it makes lands as a live Mini in
a chat. Controls that are not wired draw at full strength, with the title "Not in this prototype".

## Try it

Needs [Bun](https://bun.sh) 1.3 or later, Rust (stable) and a Playwright browser. The gate renders
every tool in headless Chrome, so a clean clone needs:

```bash
bun install
bunx playwright install chromium-headless-shell
```

```bash
bun run demo
```

It builds the shell and the Rust server, starts the sync server, the factory service and the
gateway, and prints a URL for this machine and one for each private network it finds (Wi-Fi,
Tailscale). It listens on loopback and private addresses only. Add `/m/` to a URL for the mobile
interface (a phone-sized frame on a wide window, full screen on a phone) or `/d/` for the desktop
interface. Query strings carry over, for example `/m/?as=maya`.

Pick who you are with "Continue as" or `?as=aditya`, `calvin`, `arun`, `tsai`, `will` or `maya`.
The first five are the team; Maya is made up. Add `?app=facebook` for the Facebook screens.

Flags (`services/demo/start.ts`): `--model auto|replay|muse[:model]`, `--port 4380`, `--db <file>`,
`--fresh` (start a new database), `--no-build`, `--no-cast`, `--unprompted`, and for the cast
`--cast-seed`, `--cast-speed calm|normal|lively`, `--cast-crowd`, `--cast-model`.

The demo uses three neighbouring ports: 4380 (gateway), 4381 (tool frames) and 4382 (cast
controls). `--port` moves all three. Tools load from the second port; if a browser blocks it,
they load from the first port after 1.5 s instead (same sandbox, same rules). A tab left open
across a restart reloads itself.

```bash
bun run demo:stop
```

### Models and the key

The live path is Meta's Muse API. Add the key once on macOS:
`security add-generic-password -s meta-muse-api-key -a "$USER" -w` (it prompts for the key), or set
`MUSE_API_KEY` on Linux. The key is read at run time and never printed, logged or committed.
A model call gets 45 s and one retry; a build or a change gets 90 s in all, then one line says it
took too long. Model notes and the environment switches are in `packages/factory/README.md`.

## Checks

Each folder's README starts with the one command that checks it. Run them per folder:

```bash
cd packages/verify && bun run check
```

`bun run e2e:demo` runs the two-phone suite on a temp database and the replay model.
`bun e2e-demo/sweep-tools.ts` opens every lab tool; run it in the installed Google Chrome (see
`e2e-demo/README.md`).

## How it fits together

`docs/CONTRACTS.md` is the source of truth for the interfaces: the sync protocol, the app API, the
sandbox bridge, the gate and the factory and gateway routes. `skills/LAB_RECIPE.md` is how the
library tools were made.
