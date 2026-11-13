`bun run check` (in `apps/taste`: svelte-check, then a headless Chrome test at phone and desktop size)

# Taste

His swipe app. One thing at a time: a copy pair, a copy line, a live tool, a motion clip or a
shell screen. Right or → likes, left or ← dislikes, up or ↑ loves, down or ↓ skips. For a pair,
tap the better one (← first, → second). Undo with the toast, Backspace or Cmd-Z. The number in
the corner opens what the model has learned.

```bash
bun run taste
```

Builds the app, starts the server and prints the local, LAN and Tailscale URLs (port 5180,
`TASTE_PORT` to change). It listens on 127.0.0.1 and this machine's private addresses only and
refuses public ones. No tunnel. Stop it with Ctrl-C.

Every judgment is appended to `data/taste/swipes.jsonl` the moment it is made: decision, time to
decide, whether he tapped or replayed it, order shown, and a snapshot of its features. Undo appends
an undo line. The model retrains after every 10 judgments and is saved to `data/taste/model.json`.
`data/taste/` is git-ignored; never commit it.

- `bun run shots`: headless screenshots into a temp dir, using throwaway data.
- `TASTE_SCREENS=off`: leave shell screens out.
- `TASTE_BREAK=1 bun test`: the end-to-end test must fail (swipes are not written).

The model and items live in `packages/taste`.
