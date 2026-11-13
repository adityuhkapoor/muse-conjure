`bun run e2e:demo` (from the repo root; headless, random ports, temp database, replay model)

# e2e-demo

End-to-end checks of the whole demo against the real stack: the Rust server, the factory service
on the replay model, and the gateway. Everything runs headless. A clean clone needs
`bunx playwright install chromium-headless-shell` (and `webkit` for `ENGINE=webkit`).

- `run.ts`: two friends on phone-sized contexts. Messages, typing, reactions, asking Muse (the
  building card, then the tool), a tap on one phone showing on the other within 500 ms, the pinned
  bar, activity lines in plain words, the frame port blocked (tools load from the main port, and
  that frame still cannot reach the page, cookies, storage or the network), reload, a late joiner,
  the Event flow, the factory killed mid-build, the server restarted. Then four flow files that
  `run.ts` calls: `surfaces.ts` (Home, Reels and Marketplace moments land tools in chats both people
  see), `catalysts.ts` (asks, offers and tools made on pages; every inline tool opens on first
  view), `compose.ts` (post from Home with a tool, Ask Muse, the made-up friends acting in it) and
  `comments.ts` (comment threads on Home posts). About 40 checks in all. Each check prints `ok`
  or `FAIL`; the last line gives the count; exit 1 on any failure. `ENGINE=webkit` runs `run.ts` in
  WebKit. `E2E_NO_BUILD=1` skips the builds.
- `compose.ts`, `catalysts.ts`, `comments.ts` also run alone (ports 4690, 4680 and 4710, with
  their next port for frames); `--shots` on `compose.ts` and `comments.ts` writes screenshots.
- `cast/run.ts`: the made-up friends against the real stack. One presenter phone asks Muse in the
  stuck chat; the friends type, play the tool to a pick and react. A second phone appears as one of
  the friends and the cast must step back within a second; pause holds everything.
  `CAST_SABOTAGE=no-step-back` runs it with a guard off, to see it fail.
- `seeded.ts`: opens every seeded Messenger chat as one of its members; each tool card must reach
  ready within 10 s.
- `sweep-tools.ts [tool ...] [--history N] [--shell]`: opens every tool in `library/lab` in the real
  frame runtime, with the example, with the empty skeleton, and after N valid actions from five
  people, and lists every tool that errors or never reports a size within 8 s.
- `shots.ts [dir]`: screenshots of the live states, phone size, light and dark, plus desktop.
- `timings.ts [--live "<ask>" --chat <id>]`: send-to-card and send-to-tool times per build path,
  and tap latency. `--live` adds one real Muse build and is not part of the automated suite.
- `sheet.ts` (`bun run sheet`): a contact sheet of every tool a person can reach in the demo, each
  next to the lab original, written to `library/lab/_shots/_sheet/` (git-ignored).

## Which browser

Layout-dependent bugs only show in the installed Chrome. Chrome holds back layout in a hidden
cross-origin frame; Playwright's bundled headless shell does not. A bug where every lab tool failed
to open in Chrome passed every check that ran in the bundled shell. So run the tool sweep in the
installed Chrome:

```bash
bun e2e-demo/sweep-tools.ts
```

It uses the installed Google Chrome (`channel: "chrome"`, headless) when
`/Applications/Google Chrome.app` exists and falls back to the bundled shell otherwise (`--shell`
forces the shell). The other scripts here, and the gate, launch the bundled headless shell; they
have not been switched to the installed Chrome.
