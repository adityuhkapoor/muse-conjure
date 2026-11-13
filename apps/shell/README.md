
# apps/shell

A look-and-feel mock of Messenger inside Facebook. Phone web first (393x852, iPhone 16 Pro), desktop web
(>= 1100 px) second. Svelte 5 (runes), Vite 8, TypeScript 7, plain CSS custom properties. No UI library.
Five cast members are the team (Aditya, Calvin, Arun, Tsai Lin, Will Li), with their permission; everyone and everything else is made up. Private prototype, never hosted publicly. No login. A small "Prototype" label is always fixed in the corner.

Install from the repo root: `bun install`.

## Commands

| Command | What it does |
|---|---|
| `bun run shots` | builds, serves on a random localhost port, writes PNGs (every Messenger, Event and Facebook state on phone light and dark, the main ones on desktop) to a temp dir and prints it |
| `bun run check:phone` | installed-app behaviour in headless Chromium (Pixel 7) and WebKit (iPhone 15 Pro): manifest and icons, standalone, no document scroll, composer on the keyboard (simulated visual viewport), safe areas, swipe back, long-press, hint, restore, landscape, axe. Each check is also run on a sabotaged page and must fail there. `--only <name>`, `--engine webkit`, `--shots <dir>` |
| `bun run perf:phone` | first paint, time to interactive and inbox-to-thread frames under 4x CPU throttling |
| `bun run build` | production build to `dist/` |
| `bun run lint:tokens` | the token lint alone (`--self-test` runs the fixtures) |

All browsers are headless (`chrome-headless-shell` through Playwright). Nothing opens a window and no server is left running.
One-time browser install: `bunx playwright install chromium-headless-shell`.

## What exists

- `src/tokens/tokens.css`: hand-maintained from `design/tokens.json` (`bun design/build.ts` writes `design/out/shell-tokens.css` as a proposal and lists the differences in `design/out/shell-changes.md`; it is not copied over), with a
  marked block of local overrides at the end, each with its reason. Every value carries its source and
  `[data-layout="desktop"]`.
- Chat themes: each chat has a theme (`default`, `berry`, `dune`; `chatTheme` in `src/store/fake-data.ts`). The
  theme is one vertical gradient, fixed to the screen on a phone (the thread page, so Chrome and Safari's frame
  layer, where the list starts under the header, show the same colour at the same height) and carried by the
  scroller on desktop; outgoing bubbles are windows onto it (a scroll-driven animation places each bubble's
  gradient from `--scroll-h`, `--grad-h` and `--grad-off`, so nothing runs while scrolling). Header icons
  (`#2F6DF8` to `#4A5DF9`); `berry` is the web's `#AA00FF` to `#0070F6`; `dune` is the public red-orange theme.
- Typeface: Muse Sans (`design/fonts/`, metric-compatible with Optimistic) on the phone looks, imported first in
  waits up to 800 ms for the four weights before the first render, so text does not move when the face arrives.
  Tool frames get it from the demo gateway (inline `@font-face`, 400/600/700, see `services/demo`).
- Token lint (`scripts/lint-tokens.ts`): fails on raw hex, rgb(a), px (except 0 and 1px) and ms/s literals in any
  `.css` or `.svelte` file outside the token file. `@media` lines are exempt. Fixtures live in `scripts/fixtures/`;
  `bad-component.svelte` must fail, `ok-component.svelte` must pass.
- Phone: inbox (header, search field, notes, All / Unread / Groups filters, chat rows, tab bar), group thread with translucent blurred header,
  grouped bubbles, sender labels, 28 px avatars, centred timestamps, reaction pills, seen facepile, reply quote,
  photo bubble, link preview, typing dots, composer that folds its icons once there is text, 200 ms page fade, edge swipe,
  browser back, long-press or right-click reaction bar, double-tap to heart, native overflow scrolling.
- Theme: `prefers-color-scheme`, `?theme=dark|light`, and the "Dark/Light" control next to the Prototype label.
- Query flags: `?chat=<id>` opens a chat (add `&tool=<id>` to scroll to a tool), `?event=<id>` opens the event page,
  `?screen=search` opens search, `?safe=1` simulates iPhone 16 Pro insets (59 top, 34 bottom).
- Cast: Tsai Lin (`noa`, you in the fake store), Maya (made up), Aditya (`dev`), Calvin (`jonah`), Will Li (`priya`), Arun (`theo`). The five team members show their own photos; everyone else is a drawn face (see Pictures). The fake store has five chats: apt 4b, the boys, Maya, senior week, Will. The live demo seeds 15 (`services/demo/chats/`).
- Facebook: `?app=facebook` or the Facebook button in the inbox header (see Facebook surfaces below).

### Where tools show up (Part 2)

All driven by `tools` on the store (each has chat, name, one-line summary, who acted last, needsMe). Nothing is a tab or an ad.

1. Inbox rows: a chat with a tool that needs you shows "Chore wheel · your turn" with a small Muse mark in place of the last message. Tap opens the thread scrolled to the tool.
2. Pinned bar under the thread header: mark, name, summary, chevron. One tool scrolls to the card; two or more show a count and open a sheet.
3. Activity line: centred, tappable, in plain words from the tool's own summary ("Noa spun the wheel: Sushi Ko"), else "Noa updated Chore wheel"; "You" for your own. A person's taps within 3 minutes are one line. Jumps to the card.
4. Notes row: a friend's shared tool is their note. Tap opens a sheet with a preview card, "Join" (lands in a chat with them) and "Use for my group" (chat picker, then "Muse is building", then the chat with the card).
5. Suggestion chip: "Pick for us" above the composer when the last messages look stuck (`looksStuck` in `src/lib/muse.ts`: a question, then two hand-backs like "idk u pick" and "no u pick"). Seeded in senior week. Dismiss or taking it means it does not come back for that chat.
6. Asking by name: a leading "muse" or "@Muse" is highlighted in the composer and the bubble; sending it builds a card. In the live demo the ask goes to the gateway's `/generate`, where Muse picks a lab tool and fills it from the chat. In the fake store (no server) the tool is picked by keyword (`inferTemplate`) from a few templates.
7. Search: the pill opens a screen whose empty state has "In your chats" and "Make something".

The building state is the same `MuseCard` with `building` set, mutated in place by the store, so it has exactly the final card's size.

### Event page (Part 3)

`EventPage.svelte`, phone and desktop (the design notes section 2). Tap Interested or Going and a card appears in the page flow with a facepile, "Maya, Theo and Priya are interested too" and "Go together". That makes a group chat named after the event (once; a second tap reopens it), opens it, and its first message is the who's in card from Muse. Entry points: the event link bubble in the boys chat and `?event=juniper` (no Events slot in the desktop top bar).


## Live mode

Served by the demo gateway (`bun run demo` at the root), the shell runs on the real server:
`src/store/live-store.svelte.ts` implements `ChatStore` over `@muse/sync` replicas of `t:<chatId>`
(the trusted chat reducer in `src/live/chat-reducer.ts`) and `t:index`; typing and presence are
ephemeral. A tool is a chat message `{ t: "tool", id, name, summary, code }`; its state is the app
room `a:<id>`, mounted through `@muse/sandbox`. All package calls go through `src/live/`
(socket, rooms, frames, factory). `?as=<id>` picks who you are; `?live=0` forces the fake store.
A plain static server (checks, screenshots, the Vite dev server) always gets the fake store.

## The two seams

1. `ChatStore` (`src/store/chat-store.ts`). The only interface components use for data. Today
   `src/store/fake-store.svelte.ts` implements it with in-memory `$state`. The sync-backed store goes behind the
   same interface and is chosen in `src/store/index.ts`. `send`, `react` and `reactOnce` become dispatched actions.
2. `MuseCard` (`src/components/MuseCard.svelte`). The slot where a sandboxed app frame mounts, at
   `[data-muse-mount]`. It renders a placeholder: Muse mark, title, subtitle, 300 px body (`--muse-body-h`).
   The host should set `--muse-body-h` from the frame's reported height.



3. Header glass alpha (0.94 light, 0.9 dark) and blur (20 px, saturate 1.8): the iPhone header was black on black.
5. The `dune` theme's stops (two samples, direction only); the default theme's end stops are extended from samples at 13% and 92%.
7. Photo and link preview sizes; Muse card radius 20.
8. Avatar palette (our initials avatars, darkened for contrast).
9. Placeholder text "Message" (iOS shows "Aa").
10. Our own icon drawings (send, plus, camera, chats, stories, menu).
11. Info panel contents and the desktop top bar badge count.
12. Spacing steps not tied to a measurement (3, 5, 18, 32, 48).
13. Active-status text for groups.
15. Muse Sans on the iPhone look: the iPhone face was never identified; the line boxes point to Optimistic
    (design/fonts/README.md, Platform plan). Tool frames carry only 400, 600 and 700; canvas text in tools
    (wheel labels) still draws in the theme's system stack.
16. Muse surfaces: pinned bar (44 phone, 40 desktop), sheet sizes, building timings, facepile 32, fake summaries.

Where `design/tokens.json` is overridden locally (end of `tokens.css`): body text 17/22 on phone (tokens.json has
15/19, rejected), bubble max width 70% (public images; a gap in tokens.json), grouped inner radius 4.5 and gap 2.5
(tokens.json has 4 and no gap), reaction pill geometry (a gap), tool card and bubble caps at 588, web timestamp
row 40, a dark Facebook header, and `--font` (Muse Sans on a phone, system stack on desktop).

## Conflicts between sources and what was chosen

- Outgoing bubble: no longer a flat colour on either; a per-chat gradient (see Chat themes).
- Composer icon color: iOS #0068FF, web #0070F6. Same split.
- Facebook tab bar order differs between DF sources; not built here (Messenger tabs only: Chats, Stories, Menu).


17. Pinned bar height (44 phone, 40 desktop), suggestion chip height (32), sheet width (420), grabber (36x5), sheet max height (86%), sheet backdrop blur (8 px), sheet shadow.
18. Note column width (96, bubbles at most 88) and bubble shadow; notes now sit in flow above the avatar.
19. Facepile size (32 on the event card, overlap 4) and the 20 px small size from the design doc.
21. Soft button colors (FB deemphasized: #E7F3FF light, #263951 dark), event red darkened to #C81E2F on the grey link bubble and #FF6B81 on dark so it reaches 4.5:1, filled primary button #0866FF in both themes.
22. Building state: spin 900 ms, shown 1600 ms (`BUILD_MS`), Muse answers a mention 500 ms after it is sent.
23. Group avatar faces are 54 percent of the box (was 64) so the front ring never covers the back initials.
24. Fake content: the performer is made up (Juniper Hale at Meridian Hall); tool summaries ("your turn", "3 of 4 in", "$18 each"); template blurbs.

## Facebook surfaces (Part 5)

Everything is in `src/surfaces/` (components, data, flows); shared files only carry small hooks marked `surfaces`.
Messenger stays the landing screen. `?app=facebook` opens Facebook Home; `&fb=marketplace|reels|notifications|gaming|menu|groups`, `&fb=group:sublets|group:climb`, `&fb=listing:<id>`, `&fb=story:s-me` open a screen directly. `&fb=friends` opens Friends; `&fb=profile&id=<person>` (wire id or a teammate's first name, `fb=profile:<id>` too; no id is your own) opens a profile.

- Phone: the Facebook header (52 tall, menu, wordmark, search, Messenger) scrolls with Home; the floating frosted tab bar (366 x 52, 21 above the bottom) has Home, Reels, Friends, Marketplace, Notifications, Profile, all working. The header's Messenger button goes to Messenger; the inbox's Facebook button comes back. Menu leads to Groups, Gaming and Events.
- Desktop: the top bar's Home, Friends, Reels, Marketplace, Groups and Gaming slots work; the avatar and the rail's name open your profile; the logo opens Home; the bell opens Notifications; Messenger returns to the three panes.

The rule: Muse never builds while you scroll. A moment rides on something the person already did and lands as a live tool in a chat through `store.landPiece` (a lab tool filled from what they did, the same building card as a chat ask, the live store so everyone in that chat sees it). Which moments offer a tool is decided by a model reading the page (`services/demo/reader.ts`); the table lists the seeded moments and the tool each one lands. A system line above the card says where it came from (`src-<surface>-...`).

| Surface | Muse moment | Lab tool, filled from |
|---|---|---|
| Home | Jonah's apartment's chore wheel as a post: live read-only preview, one button, "Use for my group" (chat picker, then the chat) | `chore-wheel`, the post's tasks; the chat's members |
| Home | Theo's bracket post: you vote in the post | `feed-tier-list`, in a hidden chat everyone is in |
| Groups | A draft that repeats earlier posts shows "See 7 that match" under the composer: a pinned finder instead of a post | `sublet-finder`, the 7 matching sublet posts (save or skip) |
| Groups | Club: a sign-up "Pinned by admins"; a meeting-time post that became a tool | `signup-board`; `meeting-time`; `flyer-wall` for the flyer post |
| Marketplace | Second saved listing of a kind: "Decide with roommates"; Share: the same, or "Split it" when there is nothing to choose between | `group-buy` of the saved listings; `split-purchase` of the price |
| Reels | Share a reel to a chat; under it in the thread, "Add to our to-try list" makes the chat's list or adds to it | `reel-to-try`, the reel's places; later reels add through the tool's own room (`store.toolAct`) |
| Stories | Your ended story poll: "Make it a plan" makes a chat with the people who voted for the winner | `trip-lock` |
| Gaming | Games groups made with Muse, each group's standing, "Play with a group" | `bracket-post`, `feed-tier-list`, `movie-bracket` |
| Notifications, inbox | "Needs you": a tool made from a surface that waits on you | from the chat log |
| Profile | "Made with Muse" row of the person's live tools; on a friend's profile a Muse field and one offer from what you share, in your one-to-one chat | `settle-up`, `bday-pool`, `ticket-split`, `event-carpool` (lab) |
| Friends | "Plan something for Will" under his birthday, in a new group chat | `bday-pool` else `gift-pool` (lab) |

The tool for each moment is picked by id in one map, `src/surfaces/moments.ts`. Every id is a lab tool in `library/lab/`
(`scripts/lab-only.ts` fails on a plain piece). Swap one there; where the params differ, the builder in `flows.svelte.ts` or
`backing.ts` already branches on the id (story plan, meeting time).

### Pictures

Faces: `src/components/Avatar.svelte` draws everyone. Aditya, Calvin, Arun, Tsai Lin and Will Li (ids `dev`, `jonah`, `theo`, `noa`, `priya`) show their own
photos from `assets/people/` (`src/lib/media.ts` `realPerson`), with their permission. Everyone else, strangers included,
is a drawn face from `src/lib/face.ts`, ported from the taste lab's `bust`: a round cartoon head on a tinted disc, a fixed
look per cast member and one from a hash of the id for anyone else, heavier eyes and mouth at 32 px and below. It is an
SVG data URL, so the same face works anywhere, tool frames included. Skin, hair, shirt and cover colours live in one
place, `src/lib/art-palette.ts`; interface chrome stays on the design tokens.

Covers and photos: `src/components/Cover.svelte` fills a picture slot with a real photo when the id is one in
`src/lib/photos.ts` (real photos from Unsplash, Pexels and the owner, credited in `assets/CREDITS.md`), drawn over a 16 px
blurred placeholder while it loads. Any other id is a drawn cover (`src/lib/cover.ts`: a soft two-stop gradient, three
translucent circles and one line icon of the thing, per-item colour), and so is a photo that fails to load. A photo of a
made-up person cannot come back: people are only ever the five team photos or a drawn face. `assets/` is served at
`/media/` (year-long caching, each URL carries the manifest version; `vite dev` proxies `/media` to 4380).

Tools: `Member.avatar` exists in the app API and the frame CSP allows `img-src data:`, so drawn faces could be passed in
`setMembers`; the team's photos would need `<gateway origin>/media/` in the sandbox CSP (`docs/CONTRACTS.md` section 4).

Menu, listings, the Event page) put `data-dark="meta"` on the root while they are on top, which selects the Meta dark

Chats behind posts and groups have keys starting `surface:` and never show in Messenger (`src/surfaces/backing.ts`, seeded live by `services/demo/seed-surfaces.ts`).


### Values assumed for the surfaces (no measurement)

25. Facebook dark mode on every surface (no Facebook dark pixels exist): the Meta dark palette through `data-dark="meta"`, the Event page included; the tab bar's dark fill, and its darker fill over a reel; the header follows the page.
26. Floating tab bar blur radius (20) and shadow; its fill alpha (0.9); badge position.
29. Phone group cover 180, desktop 360; phone marketplace grid of two columns with an 8 gap; listing photo square.
30. Reel and story placeholder colours (now only while a picture loads), play button, side action sizes; desktop reel width 393; text shadows on captions over photos.
31. Game tile art height 140 and two of the three tile colours.
32. Muse option row (field fill, 20 mark, chevron) and the toast pill colour and position.
33. Notification copy and badge icons; desktop bell panel offset.
34. Which picture goes where: photos matched by subject; post captions were adjusted to fit them.

### Profiles and Friends

`src/surfaces/profile-data.ts` (who people are, friends, offers), `components/ProfilePage.svelte`, `ProfileMuse.svelte`, `Friends.svelte`. A profile opens from any name or avatar on a post, a comment, a group post or member face, and the Friends grid; the Profile tab, the desktop rail and the top bar avatar open your own. Cover, picture, name, a one-line bio from `docs/FEED_SPEC.md`, friends and mutual friends, the action row (yours: Add to story, Edit profile, both dimmed; others: Friends, and Message when a chat with them exists), Posts / About / Photos / Reels, the intro (the five teammates get "Studies at Eastfield" and the class year only), six friends, their own feed posts with tools live.

- Made with Muse: a row of small live previews of the tools the person made or took part in (tool and bracket posts, group pins, tools made on pages, credited in the seed); each opens the tool where it lives.
- On a friend's profile: "Ask Muse about you and <first name>" and one offer from what you share (Apt 4B tab: `lab:settle-up`; Will's 21st: `lab:bday-pool`; the concert: `lab:ticket-split`; the crag day: `lab:event-carpool`), landed in your one-to-one chat through `/premade`, filled to open in progress. A typed ask takes the same offer for now; `offerForAsk` is the one place to switch to the shared reader (`readPage`).
- Friends: three requests (Confirm, Delete), Birthdays (Will's is Friday, with "Plan something for Will": the feed's `feed-birthday` scenario, `lab:bday-pool` else `lab:gift-pool`, in a new group chat without him), six people you may know (Add friend), your friends with search. Changes stay on the device.


## Phone feel (installed-app behaviour)

`src/phone/` holds it all; `phone.css` is scoped to `html[data-phone]` (set on phones and tablets, or `?phone=1`). Shared files carry
small hooks marked `phone:` (main.ts, nav.svelte.ts, live/socket.ts, App.svelte edge swipe, Thread.svelte jump button, Bubble.svelte long-press).
New tokens sit in a marked block at the end of `tokens.css`. Manifest, icons and launch images are in `public/` (`scripts/make-icons.ts`).
The web cannot do: haptics on iPhone, push notifications unless installed and served over https, badge counts, a keyboard that animates in step with the composer (iOS reports the final size only), the status bar text color choice in light mode, background sync.

## Catalysts (Part 6)

Everything is in `src/muse/`; surface components carry one marked hook each (`catalysts`). The same three ways in, on Events, Groups, Marketplace, Home, Reels, Stories and Gaming, and the same build path as Messenger:

1. You ask: a Muse field on the page (`MuseAsk`), sent with the page's context.
2. Muse suggests: a model reads the page (`context.ts` builds it, `reader.ts` calls the gateway's `/reader/read`) together with what you just did, and offers up to two tools or nothing (`MuseSuggest`). Seeded pages are answered from `services/demo/reader-answers.json`. `readers.ts` holds the rules that give the instant first answer and the offline one (`--model replay`). Each offer is dismissible for good on that page.
3. Someone already made it: tools that live on the page, in a room keyed by the page object (`surface:page:<kind>:<id>`, groups keep `surface:group:<id>`), credited "Made with Muse · for this event" with who made it, used in place, or "Use for my group" (`PageTools`).

How a request is built (`catalyst.svelte.ts`): a tapped offer uses the scenario pack (`pack.ts`): the first available of its tools (`lab:`, `piece:`, `cache:`), filled from the page's data, built by the gateway's `/premade` in about a second. A typed ask goes to the reader first; when the reader finds nothing that fits, the ask offers "Make something new", and the keyword matcher (`match.ts`, word overlap with each scenario's phrases, threshold 0.6) is the offline path. A new build goes to the factory's `/generate` with the page's facts as structured lines from "Facebook" in `chat.messages`, the page's title as `chat.title`, and the factory surface (`event`, `group`, `marketplace`, `feed`, `story`, `gaming`). Each request's path is in `window.__musePaths` and in Presenter options (the "Options" link by the Prototype label).

Timed, unprompted offers (`timed.ts`: an event this week, a trip a year ago, a poll that ended) are off by default; `?unprompted=1`, the Presenter options switch or `bun run demo --unprompted` turns them on. They show as a card on Home and rows in Notifications only.

Checks: `scripts/check-catalysts.ts` (run by `bun run check`), `services/demo/check-pack.ts` (every scenario through the whole gate), `e2e-demo/catalysts.ts` (two people, live; `bun e2e-demo/catalysts.ts` alone uses ports 4680 and 4681).

