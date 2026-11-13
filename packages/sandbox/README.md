`bun run check` (type-check, then tests: compile, and a headless Chrome bridge test; `ENGINE=webkit bun test` runs the bridge test in Playwright's headless WebKit)

`@muse/sandbox` runs generated apps in sandboxed frames and pipes wire messages to them.
`createPool({ size })` keeps warm frames with the runtime already evaluated; `pool.mount(el, opts)` posts the code.
Each frame runs the real `@muse/sync` replica on the app's fold. Give `mount` a `transport` for the app room
(`sharedSocket(url).transport(room)`) and the handle pipes hello, acts and entries both ways; or pipe by hand
with `receive`, `reconnect` and `onSend`. `setMembers` makes the frame record the chat's members in the log.
The handle also has `setTheme`, `onSize`, `onError`, `onSummary`, `onHaptic`, `destroy`.
Clock ticks (server-aligned) go only to frames that ask for them.
With `Element.moveBefore` a warm frame moves into the slot. Without it (Safari, WKWebView) it stays in a
positioned layer and is laid over a placeholder in the slot, clipped to its scroll containers, every frame.
The host never evaluates app code. Frames use `sandbox="allow-scripts"` and the contract CSP.
`frameUrls: [a, b]` (with `fallbackMs`, default 1500, and `onFallback`) loads a frame from `b` when `a` does not
report ready in time, for browsers that block the frame's port; the frame keeps the same sandbox and CSP.
`compileApp(source)` (from `@muse/sandbox/compile`, server side) strips types and JSX with oxc-transform.
`src/harness.ts` is a minimal host page with an in-page Sequencer as the server; tests, `measure` and the gate use it.
`bun run build` regenerates `src/frame-js.gen.ts` (the inlined frame script) and prints sizes.
`bun run measure` prints compile, cold mount, warm mount and entry-to-paint times (`ENGINE=webkit` too).
Browsers always run headless; nothing opens on screen.
`createPool({ build })` checks the build id the frame document reports: a frame from another start of the server is not mounted and `onStale` is called (the shell reloads once). An `onError` with `fatal: true` means the tool has nothing to show (it did not load, or its first render threw or drew nothing); other errors keep the last good render. The frame waits until it has layout (width above 0) before judging its first render or reporting a size.
