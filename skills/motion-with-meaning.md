---
name: motion-with-meaning
use_when: When something changes on the card and you want people to notice it, or when a result is decided by chance.
---

# Motion with meaning

Motion here has one job: show what just changed and who did it. A face springs into the seat it
took. A receipt line flashes when someone joins it. A die tumbles before it lands. Motion that runs
for its own sake (bouncing idle icons, pulsing buttons, looping gradients) is noise, and it makes
the card look like an ad.

## The tools

- `running(at, ms)`: elapsed ms since a shared time while under `ms`, else null. Store
  `at: meta.time` in state when the thing happens; every phone animates the same moment.
- `tween({ duration, easing })` and `spring(springs.ios)`: turn elapsed ms into 0 to 1.
- `Placed`: a face that springs in and moves to new coordinates on its own.
- `Changed`: wraps something that just changed and fades a tint from it over about a second.
- `Burst`: a few of the viewer's reaction emoji rise from their own tap, once. Keep a counter in
  `local` and use it as the key.
- `Canvas` with `draw` returning true while it animates, using `now`.
- `haptic("light")` on the viewer's own tap, `"success"` when the plan locks.

## Rules that keep it honest

- Animate from shared facts (`meta.time` in state), never from the clock alone, so two phones see
  the same moment.
- Anything decided by `meta.seed` is shown from `confirmed`. While `pending`, show a neutral
  in-progress state ("Rolling"), then animate to the confirmed result. Never animate to a local
  guess and jump.
- Durations: 200 ms for a tint, 300 to 500 for a move, 1.2 to 2.5 s for a reveal (a spin, a flip,
  an untangle). Nothing over 3 s.
- Ease out (decelerate) for arrivals, ease in for exits. Springs for faces and pieces you can grab.
- The resting frame is what people see most. Make sure the end state is complete and calm.

## The one satisfying moment

Each tool should have one moment that feels good, and it should come from the job itself:

| Tool | The moment |
|---|---|
| Seat map | your face drops into the seat with a small spring |
| Receipt split | your total under your face counts to the new amount when you tap a line |
| Settle up | the tangle of arrows untangles into the few payments that clear it |
| Veto | the struck option slides out and the rest close up; the last one grows |
| Boarding pass | the stub tears off when everyone is in |
| Dice roll | the die tumbles and lands; the order slides into place |
| Streak | today's cell fills from the bottom |

Name it in the design card before writing code, and build it once, well.

## Worked example: who goes first at board game night

State keeps `{ rolls: { by, order: string[], at }[] }`. The reducer shuffles the members with
`rng(meta.seed)`. The view reads `confirmed.rolls.at(-1)`; `const e = running(last.at, 1600)`;
while `e !== null` it draws a die tumbling (rotation from a `tween`, pips changing every 120 ms
of `e`), and at null shows the faces in order with "Sam goes first". While `pending` the die
wobbles in place with "Rolling".
