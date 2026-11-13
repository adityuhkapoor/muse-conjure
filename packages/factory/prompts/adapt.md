Change a working app so it does this job. The app below already passes the gate. Keep everything that still applies, and change as little as you can.

{{CONTEXT}}

The change: {{CHANGE}}

The plan:

```json
{{PLAN}}
```

The working app (piece `{{PIECE}}`). Its `// @params` block is already filled from the chat; keep the block, and add fields to `Params` and `P` if the change needs them.

```tsx
{{SOURCE}}
```

Steps:
1. Find the parts the change touches: types, the action union, `reduce`, `arbitrary`, the view.
2. Make the change. Every new action gets a transition that says what it did and who may do it. If state now holds a person's id, `onMembers` drops it when that person leaves; members are read from `ctx.members`, never copied into state.
3. Add or update invariants and transitions so the new behavior is checked. Keep the old ones that still hold.
4. Keep the reducer guards: the `ctx.members` check on `meta.user` and a type check on each field.
5. Anything decided by `meta.seed` stays shown from `confirmed`, with a neutral state while `pending`. Colors stay `theme.color.*` or `userColor`.

Reply with the whole changed module in one ```tsx block and nothing else.
