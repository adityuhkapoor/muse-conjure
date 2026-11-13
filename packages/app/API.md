# @muse/app API

One TypeScript module, default export `defineApp(...)`. JSX is on (`jsxImportSource: "@muse/app"`).
Import only from `"@muse/app"`. No `Date`, `Math.random`, timers, network, storage or globals.
Money and scores are integer cents/points. State is plain JSON.

```ts
import { defineApp, Button, OptionRow, CardHeader, rng, userColor, type Member } from "@muse/app";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Member = { id: string; name: string; avatar?: string };
type Meta = { seq: number; user: string; time: number; seed: number }; // time: server ms; seed: uint32
type Ctx = { room: string; members: Member[] };                        // who is in the chat now

function defineApp<S extends Json, A extends Json, L = Record<string, Json>>(def: {
  name: string;
  summary(state: S, ctx: Ctx): string;                 // one line for the chat preview
  init(ctx: Ctx): S;                                    // pure; must also work with ctx.members = []
  reduce(state: S, action: A, meta: Meta, ctx: Ctx): S; // pure; invalid action -> return state unchanged
  onMembers?(state: S, ctx: Ctx): S;                    // the member list changed; default: unchanged
  invariants: Record<string, (state: S, ctx: Ctx) => boolean>;                        // true when valid
  transitions?: Record<string, (prev: S, next: S, action: A, meta: Meta, ctx: Ctx) => boolean>;
  arbitrary(state: S, user: string, rng: Rng, ctx: Ctx): A | null; // plausible next action, for fuzzing
  local?: L;                                            // initial per-viewer state (required if L has required keys)
  view(props: ViewProps<S, A, L>): JSX.Element;
}): AppDef<S, A, L>;

type ViewProps<S, A, L> = {
  state: S;          // confirmed state with my pending actions applied on top
  confirmed: S;      // server-ordered state only
  pending: boolean;  // true while any of my actions are unconfirmed
  me: string; members: Member[];
  dispatch(action: A): void;                            // applies at once, then syncs to everyone
  theme: Theme;
  local: L;                                             // this viewer only (drafts, open panels)
  setLocal(patch: Partial<L>): void;
};
```

## Members

Members reach the app only through its log. Until an action changes state, `init` reruns with
each new member list, so it can copy people in (`people: ctx.members.map((m) => m.id)`). After
that, changes call `onMembers(state, ctx)`: add or drop people there so every invariant holds.
Someone who left can still send an action: check `ctx.members.some((m) => m.id === meta.user)`.

## Reducer rules

- Never mutate; return new objects. Ids for new items come from `meta.seq`.
- Actions that are not an object with a string `t` never reach `reduce`. Still check every
  field's type (`typeof a.label === "string"`); a bad field must leave every invariant true.
- If `reduce` throws, the action is ignored. Actions from `arbitrary` must never make it throw.
- `arbitrary` should mostly propose actions that change state (at least 1 in 10 must).
- A pending action runs locally with `seed: 0`, then again with the server's seed. Show anything
  random (a spin, a shuffle, a draw) from `confirmed`, with a neutral "Spinning" state while
  `pending`.

## Invariants and transitions

`invariants` check one state ("shares sum to the total"). `transitions` check one step:
permissions ("only the host can close") and that a valid action did what it says ("a vote
adds the voter"). Write a transition as an implication so it holds for no-ops too:
`(p, n, a, m) => a.t !== "close" || n.closed === p.closed || m.user === p.host`.
The gate breaks `reduce` on purpose and requires your checks to notice (score 0.7 or more).

## Randomness

`rng(seed)` is Mulberry32, identical in every engine: `next()` in [0,1), `int(n)` in [0,n),
`pick(xs)`, `shuffle(xs)`. In reduce: `const who = rng(meta.seed).pick(state.people);`

## Theme

```ts
type Theme = {
  mode: "light" | "dark"; width: number /* 320-500 */; surface: "chat" | "event" | "group" | "feed" | "story" | ...;
  color: Record<ColorName, string>;      // theme.color.primary
  radius: { card: 12; richCard: 18; button: 8; input: 12; pill: 999 };
  space: { card: 12 };
  type: { family: string; body: 15; meta: 13; title: 17; headline: 20 };   // px
  motion: { fast: 200; slow: 400 };      // ms
};
type ColorName = "primary" | "onPrimary" | "link" | "text" | "secondaryText" | "disabledText" | "card"
  | "wash" | "input" | "divider" | "secondaryButton" | "secondaryButtonText" | "deemphasizedButton"
  | "deemphasizedButtonText" | "track" | "selected" | "hover" | "pressed" | "positive" | "negative"
  | "warning" | "toast" | "onToast" | "onPositive" | "onNegative" | "onWarning"
  | "series1" | "series2" | "series3" | "series4" | "series5" | "series6";
function userColor(member: string | Member, theme: Theme): string; // distinct per person in this chat (12)
```
Take every color from `theme.color` or `userColor` (inline styles and Canvas alike); CSS can use
`var(--color-primary)`. Never write hex, `rgb()` or color names. The app sits on a card
(`color.card`) with 12 px padding; text is 15/20 system font. Plain `<input>`, `<h2>`, `<small>`
are pre-styled. Height at rest: 420 px or less in a chat, 600 in a story. Text must fit its box
at width 320: let it wrap, or give it `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`.
Tap targets are at least 44 px; the components already are.

For text or an icon drawn on a filled background, pair it with that fill's own "on" color:
`onPrimary` on `primary`, `onPositive` on `positive`, `onNegative` on `negative`, `onWarning` on
`warning`. `theme.color.text` reads only on `card`, `wash` or `input`. Series colors
(`series1`-`series6`) are for a small mark, dot, avatar ring or stroke only, never the fill
behind a label or button: most of them fail AA contrast with any single text color.

## Components (props)

```tsx
<Button kind?="secondary" | "primary" | "deemphasized" onClick? disabled? wide?>Vote</Button>
  // 36 px visible, 44 px hit area, radius 8. One primary per app. Labels: 1-2 words, sentence case.
<OptionRow label count total voters?={ids} selected? onClick? />   // poll/claim row with bar and faces
<Facepile users={ids | Member[]} max?={3} size?={20} />
<Avatar user={id | Member} size?={24} />
<Progress value max label?="$250 of $300 · 6 chipped in" />
<CardHeader title subtitle? onMore? />                             // Muse mark + title; put first
<Rsvp value={"going" | "maybe" | "no" | null} onChange={(v) => ...} counts?={{ going: 4 }} />
<Toast key={n}>Saved</Toast>                                       // in the flow, last; shows 2.4 s
<SystemLine actor="Maya">spun the wheel</SystemLine>              // centered grey line
<Canvas height={220} label="Wheel with 4 names" draw={(g, { now, width, height, theme }) => boolean | void} onPointer?={(e) => ...} drag? />
  // draw runs when it changes and on each frame while it returns true. e: { type: "down" | "move" | "up", x, y }
  // vertical swipes still scroll the chat; `drag` keeps every touch (a draw pad, drag to rank)
```
Children: strings, numbers, elements, arrays (list items need a `key`), `null`/`false`. Events:
`onClick`, `onInput={(e) => e.currentTarget.value}`, `onSubmit`, `onKeyDown`, `onPointerDown`.
`style` is an object; numbers mean px (`{ gap: 8 }`). Icon-only buttons need `aria-label`.

## Time and motion

```ts
const clock: ReadonlySignal<number>;   // server-aligned ms, same base as meta.time
function running(start: number, ms: number): number | null; // ms since start while < ms, else null
type Motion = ((elapsed: number) => number) & { duration: number }; // 0 -> 1, exactly 1 after duration
function tween(o: { duration: number; easing?: "standard" | "decelerate" | "accelerate" | "enter" | "move" | "easeInOut" | "linear" | [x1, y1, x2, y2] }): Motion;
function spring(o: { stiffness: number; damping: number; mass?: number; velocity?: number }): Motion;
const springs: { ios; iosBouncy; material; materialFast };   // spring(springs.ios)
function haptic(kind?: "light" | "medium" | "success"): void;
```
Ticks are opt-in: they flow only while something reads `clock.value` or a Canvas returns true.
Animate from shared facts: store `at: meta.time` in state, then in the view
`const e = running(state.at, 3000)` (null once settled). In `Canvas.draw` use `now`.

Optional signals: `signal(v)`, `computed(fn)`, `effect(fn)`. The view re-renders when its props or any signal it read change.

## Make it look made for this moment

Lead with one picture of the thing the chat is talking about, near the top and 40 to 55 percent of
the card at rest, with the people placed in it; rows and buttons come after. Reach for a picture
when the answer is a place (seats, rooms, a route), a relation (who owes whom, picks, a bracket),
a shape over time (a price, a plan) or a crowd you can see (who's in, who's free). Stay with rows
(`OptionRow`) for a plain list of choices. To pick the one idea, ask what someone would point at to
explain it on a phone, draw only that, and fill it with the chat's specifics (names, amounts,
places). Grey for everything, primary for what is yours, people colors only on people, reaction
hues only inside drawings. Draw an empty spot as a dashed outline and say the first action in words.

Each piece below takes every color from the theme, names itself for screen readers (say what it
shows in `label`: "3 of 8 seats in 104 taken"), stays inside its box from 320 to 500 px and draws
the same subject the same way every time. A tool pays only for the pieces it imports.

```tsx
// Pictures: SVG art plus HTML overlays. x and y are fractions (0 to 1) of the picture.
<Scene height={160} label="Table for 6" art={[circle(150, 80, 60, theme.color.input)]}>{overlays}</Scene>
  // art is in px of a viewBox innerWidth() wide; circle(cx,cy,r,fill,attrs?) rect(x,y,w,h,rx,fill) ellipse(cx,cy,rx,ry,fill) line(x1,y1,x2,y2,stroke,w?) path(d,fill,{ stroke })
<Placed user={id} x={0.3} y={0.5} me={me} size?={24} badge? dim? move?={false} />  // a face in the picture; springs to a new spot
<Chip tone?="neutral" | "primary" | "positive" | "negative" | "card" maxWidth?>$145 airbnb</Chip>   <More n={3} />
<Thumb kind={thumbKind("Marufuku Ramen")} seed="Marufuku Ramen" size?={44} label?="" />  // drawn stand-in for a photo; kinds in THUMB_KINDS
// On a Canvas: a plush food character with a face, sitting on (x, y), about 2r tall; kinds in PLUSH_KINDS, plushKind(kind, label) maps anything else
drawPlush(g, plushKind("cheesesteak", "Pat's"), x, y, r, { seed: "Pat's", sx?, sy?, tilt?, mood?: "happy" | "squeeze" | "oops" | "dizzy" | "meh" })
<SeatMap zones={[{ id, label: "104", seats: [id | null] }]} me={me} layout?="arena" | "rows" stage? selected? onZone?={(id) => {}} onSeat?={(zone, i) => {}} label? height? />  // rows closer than 44 px take one tap per row
<Graph nodes={ids} me={me} label threads?={[{ from, to, label }]} edges?={[{ from, to, label, done }]} t={0} side?={(id) => -1 | 0 | 1} onEdge?={(i) => {}} tappable? edgeName? height? />
  // t = 0: a tangle of threads on a ring; t = 1: people in columns with clean arrows. An arrow whose label finds no room takes no tap
<MapStrip pins={[{ id, x, y, user?, n?, label? }]} label route? me? seed? height? />
<Clusters groups={[{ id, label, users, count? }]} label me? per?={20} height? />  // a dot crowd per group, up to 6
<Ring value max label size?={64} tone?>3/4</Ring>   <Meter value max label stops?={["Chill", "Soon", "Now"]} />
<Sparkline values label width?={120} height?={36} />   <Stars value={4.3} of?={5} size? label? />
<AvatarBars bars={[{ id, label, users, note? }]} me? max? />   <Timeline items={[{ id, when, title, detail?, users? }]} now?={1} />
<CalendarStrip days={[{ id, dow: "Fri", date: 13, users?, off? }]} selected? me? onDay? />
<HeatGrid cols={["6p", "7p"]} rows={[{ id, user?, label?, cells: [0, 1] }]} max? best? me? label />
<Ticket stub={<b>1D</b>} locked? label?>Campus to Nashville</Ticket>   <Receipt title? lines={[["Wings", "$13.00"]]} total?={["Total", "$13.00"]} />
<PlayingCard rank="Q" suit="h" down? size? />   <BingoGrid cells={[{ id, label, marked?, users?, free? }]} cols?={4} me? onCell? />
<Burst key={local.bursts} emoji?="👍" />   <Changed at={state.at}>row</Changed>   <Locked detail?="Fri, Mar 13">Locked · 4 going</Locked>
<Summary title="$148 each" detail? note? tone?="positive" aside={<Sparkline values={[3, 1]} label="Price" />} />
<Expand title summary? open={local.open} onToggle={() => setLocal({ open: !local.open })}>rows</Expand>   <Strip label>cards</Strip>
```
`fitText(label, maxWidth, { g?, size?, min?: 10, weight? })` returns `{ text, size, font }`: the label
at the largest size that fits, down to `min`, then cut with "…". Pass the Canvas context as `g` to
measure exactly (it is left set to `font`); without it the width is a safe estimate (`textWidth`).
Every Canvas or SVG label goes through it. Also: `mix(a, b, t)` blends theme colors, `pal()` gives
illustration hues, `seedOf(text)` a stable seed, `at(x, y)` an overlay style, `crowd(users, max)`
`{ shown, extra }` for a "+N", `innerWidth()` the card's inside width.

```tsx
// "Who's riding with who": the cars are the picture; open seats are dashed and a tap takes one.
<SeatMap layout="rows" me={me} label={`${taken} of ${seats} seats taken`} onSeat={(car, seat) => dispatch({ t: "sit", car, seat })}
  zones={state.cars.map((c) => ({ id: c.id, label: c.name, seats: c.seats }))} />
// "Who owes who after the trip": the tangle of IOUs untangles into the fewest payments once settled.
<Graph nodes={state.people} me={me} label={`${state.pays.length} payments settle it`} side={(u) => Math.sign(state.net[u] ?? 0)}
  t={state.at ? tween({ duration: 1400 })(running(state.at, 1400) ?? 1400) : 0} tappable={(e) => e.from === me}
  threads={state.ious.map((d) => ({ from: d.from, to: d.to, label: `$${d.cents / 100}` }))} onEdge={(i) => dispatch({ t: "paid", i })}
  edges={state.pays.map((d) => ({ from: d.from, to: d.to, label: `$${d.cents / 100}`, done: d.paid }))} />
// A wheel slice label on a Canvas: fitted to the slice, never clipped.
const f = fitText(o.label, r * 0.62, { g, size: 14, weight: 600 }); g.fillText(f.text, r * 0.92, 0);
```

## Copy

Sentence case, plain words, no exclamation marks, counts not percentages ("3 votes"), `·` as separator. People appear as `Avatar`/`Facepile` or by name, never as ids.

## Example

```tsx
type State = { options: { id: string; label: string; voters: string[] }[] };
type Action = { t: "vote"; option: string };
const voted = (s: State, o: string, u: string) => s.options.some((x) => x.id === o && x.voters.includes(u));
export default defineApp<State, Action>({
  name: "Lunch",
  summary: (s) => `${s.options.reduce((n, o) => n + o.voters.length, 0)} votes`,
  init: () => ({ options: [{ id: "a", label: "Tacos", voters: [] }, { id: "b", label: "Pho", voters: [] }] }),
  reduce: (s, a, m, ctx) =>
    a.t === "vote" && typeof a.option === "string" && s.options.some((o) => o.id === a.option) && ctx.members.some((x) => x.id === m.user)
      ? { options: s.options.map((o) => (o.id !== a.option ? o : { ...o, voters: o.voters.includes(m.user) ? o.voters.filter((v) => v !== m.user) : [...o.voters, m.user] })) }
      : s,
  onMembers: (s, ctx) => ({ options: s.options.map((o) => ({ ...o, voters: o.voters.filter((v) => ctx.members.some((m) => m.id === v)) })) }),
  invariants: {
    "one vote per person per option": (s) => s.options.every((o) => new Set(o.voters).size === o.voters.length),
    "voters are in the chat": (s, ctx) => s.options.every((o) => o.voters.every((v) => ctx.members.some((m) => m.id === v))),
  },
  transitions: {
    "a vote toggles only the voter": (p, n, a, m) => a.t !== "vote" || p === n || voted(p, a.option, m.user) !== voted(n, a.option, m.user),
  },
  arbitrary: (s, _u, r) => ({ t: "vote", option: r.pick(s.options).id }),
  view: ({ state, me, members, dispatch }) => (
    <div>
      <CardHeader title="Lunch" />
      {state.options.map((o) => (
        <OptionRow key={o.id} label={o.label} count={o.voters.length} total={members.length} voters={o.voters}
          selected={o.voters.includes(me)} onClick={() => dispatch({ t: "vote", option: o.id })} />
      ))}
    </div>
  ),
});
```

## Index

Exports: `at`, `Avatar`, `AvatarBars`, `BingoGrid`, `Burst`, `Button`, `CalendarStrip`, `Canvas`, `CardHeader`, `Changed`, `Chip`, `circle`, `clock`, `Clusters`, `color`, `computed`, `crowd`, `defineApp`, `easings`, `effect`, `ellipse`, `Expand`, `Facepile`, `fitText`, `Fragment`, `Graph`, `h`, `haptic`, `HeatGrid`, `innerWidth`, `line`, `Locked`, `MapStrip`, `Meter`, `mix`, `More`, `OptionRow`, `pal`, `path`, `Placed`, `PlayingCard`, `Progress`, `Receipt`, `rect`, `Ring`, `rng`, `Rsvp`, `running`, `Scene`, `SeatMap`, `seedOf`, `signal`, `Sparkline`, `spring`, `springs`, `Stars`, `Strip`, `Summary`, `SystemLine`, `textWidth`, `Thumb`, `THUMB_KINDS`, `thumbKind`, `drawPlush`, `plushKind`, `PLUSH_KINDS`, `Ticket`, `Timeline`, `Toast`, `tween`, `userColor`.

Types: `AppDef`, `Bezier`, `Child`, `ColorName`, `Component`, `Ctx`, `Draw`, `DrawFrame`, `Edge`, `Fit`, `InitCtx`, `Json`, `Measurer`, `Member`, `Meta`, `Motion`, `Pin`, `PlushKind`, `PlushLook`, `PlushMood`, `PointerInfo`, `ReadonlySignal`, `Rng`, `RsvpValue`, `Signal`, `Theme`, `Thread`, `ThumbKind`, `ViewProps`, `VNode`, `Zone`.
