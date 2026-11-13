`bun run check` (type-check, then tests: rng golden values, signals, renderer, component snapshots, the runtime fold, sample-app fuzzing)

`@muse/app` is the API generated apps are written against, plus its small UI runtime.
The whole reference a model needs is `API.md`.
Apps are one module: `export default defineApp({ name, summary, init, reduce, onMembers?, invariants, transitions?, arbitrary, local?, view })`.
`src/runtime.ts` is how every client folds an app's log: the input guard, a throwing reduce as a no-op, and the `@members` system action.
The runtime is signals, a keyed DOM renderer, `rng` (Mulberry32), motion (`tween`, `spring`) and Meta-native components.
Theme tokens are a typed object (`src/theme.ts`); components read them through CSS variables, so a light/dark switch does not re-render.
Samples a model might write live in `examples/` and are fuzzed by `test/examples.test.ts`.
`bun run size` prints the runtime size and fails above 8 KB min+gzip (now 5.4 KB).
The frame and host side live in `packages/sandbox`.

