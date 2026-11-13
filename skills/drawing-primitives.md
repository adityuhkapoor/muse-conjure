---
name: drawing-primitives
use_when: When the visual idea needs a picture (a map, seats, a ticket, a graph, a board, a chart). Lists the drawing kit in @muse/app and how to combine it.
---

# Using the drawing primitives

`@muse/app` ships an art kit so a picture takes ten lines, not two hundred, and stays inside
Meta's look in light and dark. Prefer a kit piece over drawing by hand; draw by hand only what the
kit does not have. Import only what you use; `packages/app/API.md` is the full reference.

## The kit at a glance

| Need | Use | Notes |
|---|---|---|
| A picture with people placed on it | `Scene` + `Placed` + `at(x, y)` | `art` is SVG children in a box of `innerWidth()` by `height`; overlays are placed by fractions |
| SVG shapes | `circle`, `rect`, `ellipse`, `line`, `path` | colours from `theme.color`, `pal()` or `userColor` only |
| Illustration colours | `pal()` | reaction hues shaded for the theme: `red`, `blue`, `green`, `yellow`, `orange`, `purple`, `sky`, `grass`, `leaf`, `crust`... |
| A small drawn thumbnail | `Thumb` + `thumbKind(name)` | food, places, couch, ticket, car, gift, suitcase, book; the same name always draws the same |
| Seats in a venue or rows | `SeatMap` | zones of seats holding member ids or null; `layout="rows"` for a theatre or a table |
| Who owes who, who links to who | `Graph` | nodes are member ids; `edges` with labels and `done`; `t` animates an untangle |
| Where people are | `MapStrip`, `Clusters` | pins by fraction; clusters for big groups |
| Progress and levels | `Ring`, `Meter`, `Progress` | a ring with a count or a face in the middle |
| Values over time | `Sparkline`, `HeatGrid`, `CalendarStrip`, `Timeline` | heat grid for who is free when; timeline for an itinerary |
| Votes with faces | `AvatarBars` | a bar per option filled with the voters' faces |
| Frames people recognise | `Ticket`, `Receipt`, `PlayingCard`, `BingoGrid` | the content is yours; the frame is the kit's |
| Feedback | `Burst`, `Changed`, `Locked` | see `motion-with-meaning.md` |
| Fitting into the card | `Summary`, `Expand`, `Strip`, `crowd`, `More`, `Chip`, `fitText` | see `chat-card-layout.md` |
| A live board or drawing | `Canvas` with `draw` and `onPointer` | for games and anything that animates every frame |

## How to combine them

1. Start from the frame people recognise (a `Ticket`, a `Receipt`, a `SeatMap`). Put real content
   in it.
2. Put people on it with `Placed`, `Avatar` or the kit's own `users` props.
3. Make the frame the control: `SeatMap` takes `onSeat`, `Graph` takes `onEdge`,
   `CalendarStrip` takes `onDay`, `BingoGrid` takes `onCell`. A button under the picture is the
   fallback, not the default.
4. Label the picture for screen readers in words that state the facts ("3 of 8 seats taken").
5. Size it: the picture sits near the top and takes 40 to 55 percent of the card at rest; rows and
   buttons come after. An empty spot is a dashed outline, and a line of words says the first action.
6. Reuse a kit piece for a neighbouring idea: cars are `SeatMap layout="rows"` with one zone per
   car; a tangle of IOUs is `Graph` with `threads` at `t = 0` and settled `edges` at `t = 1`.
7. Every text drawn on a Canvas or in SVG goes through `fitText` so it never clips.

## Drawing by hand

When the kit has no shape for it (a round table, a car seen from above, a shelf, a board), draw
it with the SVG shorthands inside a `Scene`:

```tsx
const W = innerWidth(), H = 150, p = pal();
const table = (cx: number, n: number) => [
  circle(cx, H / 2, 38, theme.color.wash),
  ...Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return circle(cx + Math.cos(a) * 56, H / 2 + Math.sin(a) * 56, 15, theme.color.track);
  }),
];
<Scene height={H} label={`2 tables · ${seated} of 12 seated`} art={[...table(W * 0.27, 6), ...table(W * 0.73, 6)]}>
  {seats.map((s) => s.holder && <Placed key={s.id} user={s.holder} x={s.x} y={s.y} me={me} size={26} />)}
</Scene>
```

Keep shapes flat and soft: big areas in `wash`, `track` or `input`; small marks in `pal()` hues;
the viewer's own mark in `primary`. Round every coordinate (the kit's helpers do). No text inside
SVG at small sizes; put labels as `Chip`s in the overlay so contrast is checked.

## Canvas

Use `Canvas` when something moves every frame or is drawn by a finger. `draw(g, { now, width,
height, theme })` returns true while it needs another frame. Every colour still comes from
`theme.color` or `userColor`. Pointer input arrives as `{ type, x, y }`; turn it into actions with
integer coordinates. Give the Canvas a `label` that states the facts.

## Worked example: a receipt split in twelve lines

```tsx
<Receipt
  title={`${CHAT.place} · paid by ${nameOf(state.payer)}`}
  lines={CHAT.items.map((it) => [<span>{it.label} <Facepile users={sharers(it.id)} size={16} /></span>, money(it.cents)])}
  total={["Total", money(total)]}
/>
```

Each line becomes a button that toggles the viewer on that line; under the receipt, an
`AvatarBars` or a row of faces with each person's share.
