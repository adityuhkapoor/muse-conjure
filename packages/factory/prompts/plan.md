Plan the tool before any code is written. Answer with JSON only, matching the schema. Keep every field short: a weaker model will write the code from this plan, so be concrete and literal.

The ask, the chat and the facts already pulled from it are below.

{{CONTEXT}}

{{BASE}}

Fill the fields in this order:

1. `name`: 1 to 3 words in sentence case, what the tool is ("Chore wheel", "Bill split").
2. `title`: the card title people see, plain, sentence case, from the chat ("Where should we eat?").
3. `job`: the one job, one sentence.
4. `content`: the options, items, amounts or dates from the chat that go into the first state. Never invent any. Empty if the chat has none.
5. `state`: each shared field: `name`, `type` (a TypeScript type), and `meaning`. People appear only as member ids that `reduce` takes from `meta.user` or checks against `ctx.members`; the member list itself is never a field. For each field that holds a person, say what `onMembers` does when that person leaves.
6. `actions`: each action: `t`, its `fields`, `who` can do it, `effect` in one sentence, and `noop_when` (the cases where it changes nothing).
7. `invariants`: 3 to 6 sentences that are true of every valid state, for any member list. Include at least two strong ones: totals add up; limits hold (capacity, one per person); everyone in state is in the chat; two records of the same fact agree.
8. `transitions`: 3 to 6 sentences about a single step. One per action that says what it did ("a vote flips the voter on that option and no one else"), plus each permission ("only the payer changes the total") and "only people in the chat change anything".
9. `at_rest`: what each person sees when nothing is moving: what is decided, what they did, the one thing to do next.
10. `random`: if anything is picked at random, how (`rng(meta.seed)`) and how it is shown (from `confirmed`, a neutral "Spinning" while `pending`, the result after an animation from `meta.time`). Else "".
