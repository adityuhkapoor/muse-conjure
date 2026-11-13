---
name: state-that-verifies
use_when: When designing state, actions, invariants, transitions and arbitrary. This is what decides whether the gate passes on the first try.
---

# State design that verifies

The gate runs about 200 random histories through your reducer with three people, garbage
actions, a disconnect and people leaving, then breaks your reducer on purpose and checks that
your invariants and transitions notice. Tools that pass first time share one habit: the state is
small and every action has a sentence that says exactly what it did.

## Small state

- Store facts, not views. Keep `seats: { id, holder }[]`; compute "who has no seat" in the view.
- One record per fact. If the total lives in two places, they will disagree.
- People are member ids in fields that hold a person; the member list itself is never state.
- Content from the chat stays in the `CHAT` const, not in state, unless people can change it.
- Bound everything: at most 12 options, labels at most 40 characters, history at most 12 entries.
- Money in integer cents; split with `Math.floor` and give the leftover cents to someone named.

## One sentence per action

Write each action as `t`, its fields, who may do it, what it does, and when it does nothing:

| Action | Who | Effect | No-op when |
|---|---|---|---|
| `sit {seat}` | anyone in the chat | takes that free seat, leaves their old one | locked, seat taken, bad id |
| `lock` | the buyer | locks the map | not the buyer, not everyone seated |

That table becomes the reducer, the transitions and `arbitrary` almost mechanically.

## Invariants: what is always true

Strong invariants are about relations: "nobody holds two seats", "shares add up to the bill",
"everyone in a seat is in the chat", "the winner is one of the options", "a locked plan has a lock
time". Weak ones restate types ("seats is an array") and catch nothing.

## Transitions: what each step did

One per action, written as an implication so no-ops and garbage pass:

```ts
"a sit moves only the actor": (p, n, a, m) =>
  a.t !== "sit" || p === n || (seatOf(n, m.user) === a.seat && othersSame(p, n, m.user)),
"only the buyer locks": (p, n, a, m) => a.t !== "lock" || p === n || m.user === p.buyer,
"only people in the chat change anything": (p, n, a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
```

Add one "is never refused" transition for the main action ("a free seat is never refused while
open"): it catches mutants that make the reducer ignore valid actions. Keep helper functions for
checks separate from the reducer, so one broken helper cannot break both.

## arbitrary

Propose mostly valid actions for the current state (pick a free seat 85% of the time), some
invalid on purpose, never something that throws. Return exactly the fields of the action type.
Give someone who just joined something to do.

## Random results

Pick with `rng(meta.seed)` in the reducer; store the result and `at: meta.time`. A transition can
recompute the pick from the seed and require it matches. Show it from `confirmed`.

## Worked example: veto

```ts
type State = { out: { option: string; by: string }[]; at: number };
type Action = { t: "strike"; option: string } | { t: "undo" };
```

- `strike`: anyone in the chat with strikes left; the option is still in and is not the last one.
- `undo`: removes the actor's own latest strike.
- Invariants: every struck option is a real option; no option struck twice; at least one option
  is always left; nobody has more strikes than allowed; every striker is in the chat.
- Transitions: a strike adds exactly one entry by the actor; undo removes only the actor's own
  latest; only people in the chat change anything; a valid strike is never refused.
- `onMembers`: drop strikes by people who left (their options come back).
