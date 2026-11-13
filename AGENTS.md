# For coding agents

The product is Muse Conjure: Muse (Meta's agent) conjures a Mini (what lands in a chat or on a post) from the conversation. In code a Mini is a "tool"; do not rename code. It is a feature concept and a private prototype, not a Meta product.

Read `README.md`, then `docs/CONTRACTS.md`. Each folder's README starts with its check command.

## Start the demo for someone

1. `bun install` at the repo root, then `bunx playwright install chromium-headless-shell` (the gate
   renders every tool in headless Chrome). Needs Bun 1.3+ and Rust stable (`rustup`).
2. `bun run demo`. It prints one URL for this machine and one per private network (Wi-Fi,
   Tailscale). Give the user the URL that matches how their device reaches this machine. Each
   address also has `/m/` (always the mobile interface) and `/d/` (always the desktop interface).
   Use a private network only; never a public tunnel.
3. Have them open it twice as two different people (`?as=maya` and `?as=aditya`), open "senior week"
   in both, and send `muse pick for us` in one. Both should get a slot machine they can spin
   together. Then "Tell Muse what to change" under it, or `muse add pho`, changes it in place.
4. The live path runs on Meta's Muse API. Put the key in the Keychain (`security add-generic-password -s meta-muse-api-key -a "$USER" -w`) or set `MUSE_API_KEY`. Without a key the demo starts on recorded answers (`--model replay`); you can also force that.
5. Check it yourself first with `bun run e2e:demo` (headless, replay model, temp database, about 40
   checks, a few minutes). `ENGINE=webkit` also needs `bunx playwright install webkit`.
6. `bun run demo:stop` when done. The demo uses three neighbouring ports (4380 to 4382).
   Other flags: `--fresh`, `--model`, `--port`, `--no-build`, `--unprompted`.
7. Facebook screens are at `?app=facebook`. The made-up friends play along by default; start with
   `--no-cast` for a quiet demo.

On Windows, use WSL. On macOS and Linux everything runs natively.

## Rules

- Do not open or focus browser windows on the user's machine for checks; use headless Chrome.
- One owner per folder (see the layout table in `docs/CONTRACTS.md`). Change an interface in the
  contract first, then in code.
- Every checker rule keeps a fixture that must fail it.
- Interface copy (Facebook and Messenger chrome, READMEs, commit messages): sentence case, plain
  words, short button verbs, no exclamation marks, counts not percentages. Inside tools the
  content keeps its own voice: buttons up to four words, exclamation marks in drawn stickers and
  quoted lines. New tools follow `skills/LAB_RECIPE.md`.
- Five cast members are the team (Aditya, Calvin, Arun, Tsai Lin, Will Li), with their permission; everyone and everything else is made up. Private prototype, never hosted publicly. No login screen. Keep the "Prototype" label.
- Internal ids stay `dev`, `jonah`, `theo`, `noa`, `priya` for Aditya, Calvin, Arun, Tsai Lin and Will Li
  (`?as=aditya`, `calvin`, `arun`, `tsai`, `will` also work). Made-up people are drawn faces (`apps/shell/src/lib/face.ts`); never add a generated photo of a person.
- Never print, log or commit API keys. The Muse key is read from the Keychain (or `MUSE_API_KEY`) at run time.
- Muse's API is the only model provider. Do not add another provider, and do not name another
  vendor, model or coding tool in code, docs or commits.
