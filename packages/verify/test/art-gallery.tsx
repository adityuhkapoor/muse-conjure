// Every piece of the @muse/app drawing kit in one tall app, with ordinary and overloaded data, so
// the render lints (clipped text, overlap, outside the app, contrast, hit areas, canvas text) check
// the kit in Chrome at 320, 393 and 500, light and dark. test/art.test.ts runs it with too-tall off.
import {
  defineApp, AvatarBars, BingoGrid, CalendarStrip, CardHeader, Chip, Clusters, Expand, Graph, HeatGrid, Locked, MapStrip, Meter,
  More, PlayingCard, Receipt, Ring, Scene, Placed, SeatMap, Sparkline, Stars, Strip, Summary, Thumb, Ticket, Timeline, thumbKind, circle,
} from "@muse/app";

type State = { taps: number };
type Action = { t: "tap" };
const long = "A very long name for a place that keeps going on";

export default defineApp<State, Action>({
  name: "Art kit",
  summary: (s) => `${s.taps} taps`,
  init: () => ({ taps: 0 }),
  reduce: (s, a) => (a.t === "tap" ? { taps: Math.min(s.taps + 1, 99) } : s),
  invariants: { "taps stay between 0 and 99": (s) => s.taps >= 0 && s.taps <= 99 },
  transitions: { "a tap adds one up to 99": (p, n, a) => a.t !== "tap" || n.taps === Math.min(p.taps + 1, 99) },
  arbitrary: () => ({ t: "tap" }),
  view: ({ state, me, members, dispatch, theme }) => {
    const ids = members.map((m) => m.id);
    const tap = () => dispatch({ t: "tap" });
    const zones = [
      { id: "a", label: "105", seats: [ids[0] ?? null, null, null] },
      { id: "b", label: long, seats: [...ids, null, null] },
      { id: "c", label: "103", seats: [null, null] },
      { id: "d", label: "204", seats: [null, null, null, null] },
      { id: "e", label: "203", seats: [null] },
    ];
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <CardHeader title="Art kit" subtitle={`${state.taps} taps`} />
        <Summary title="$148 each" detail={long} note="Down $28 since Mon" tone="positive" aside={<Sparkline values={[176, 179, 172, 161, 154, 148]} label="Price fell to $148" />} />
        <SeatMap zones={zones} me={me} selected="b" onZone={tap} />
        <SeatMap layout="rows" me={me} onSeat={tap} zones={[{ id: "car", label: long, seats: [...ids, null, null, null, null, null, null, null, null, null] }, { id: "van", label: "Van", seats: [null, null] }]} />
        <Graph nodes={ids} me={me} label="Who owes who" threads={ids.map((u, i) => ({ from: u, to: ids[(i + 1) % ids.length]!, label: `$${i + 1}0 gas` }))} />
        <Graph nodes={ids} me={me} label="Payments" t={1} side={(u) => (u === ids[0] ? 1 : -1)} edges={ids.slice(1).map((u) => ({ from: u, to: ids[0]!, label: "$45" }))} onEdge={tap} />
        <MapStrip label="Route with stops" route me={me} pins={ids.map((u, i) => ({ id: u, x: i / Math.max(1, ids.length - 1), y: 0.5 + (i % 2) * 0.3, user: u, label: i ? "Stop" : long }))} />
        <Clusters label="Members by dorm" me={me} per={20} groups={[{ id: "u1", label: long, users: ids, count: 1300 }, { id: "u2", label: "Unit 2", users: [], count: 400 }]} />
        <Scene height={64} label="A table with the first person" art={[circle(40, 32, 26, theme.color.input)]}>
          <Placed user={ids[0] ?? me} x={0.1} y={0.5} me={me} badge={<More n={2} size={14} />} />
        </Scene>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Ring value={3} max={4} label="3 of 4 in">3/4</Ring>
          <Ring value={11} max={12} label="11 of 12 in" size={44}>11 of 12 people</Ring>
          <Thumb kind={thumbKind("Marufuku Ramen")} seed="Marufuku" />
          <Thumb kind="pizza" seed="Tony's" label="" />
          <Stars value={4.3} />
          <Chip tone="primary">$148</Chip>
          <Chip maxWidth={120}>{long}</Chip>
        </div>
        <Meter value={10} max={10} label="Urgency 10 of 10" stops={["Chill", "Soon", "Now"]} />
        <AvatarBars me={me} bars={[{ id: "a", label: long, users: ids }, { id: "b", label: "Tacos", users: [] }]} />
        <Timeline now={1} items={[{ id: "a", when: "9:00 am", title: long, users: ids }, { id: "b", when: "1:30", title: "Lunch", detail: "Hattie B's" }]} />
        <CalendarStrip me={me} selected="f" onDay={tap} days={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => ({ id: i === 4 ? "f" : d, dow: d, date: 9 + i, users: ids, off: i === 6 }))} />
        <HeatGrid label="Who is free" me={me} best={2} cols={Array.from({ length: 12 }, (_, i) => `${i + 1}p`)} rows={ids.map((u, i) => ({ id: u, user: u, cells: Array.from({ length: 12 }, (_, k) => (k + i) % 3) }))} max={2} />
        <Ticket label="Boarding pass" stub={<b>1D</b>} locked>
          <b>{long}</b>
        </Ticket>
        <Receipt title="Tony's on 9th" lines={[["10 wings", "$13.00"], [long, "$19.40"]]} total={["Total", "$32.40"]} />
        <div style={{ display: "flex", gap: 6 }}>
          <PlayingCard rank="Q" suit="h" />
          <PlayingCard rank="10" suit="s" />
          <PlayingCard rank="A" suit="d" down />
        </div>
        <BingoGrid me={me} onCell={tap} cells={[{ id: "a", label: "Encore", marked: true, users: ids }, { id: "b", label: "Free", free: true }, { id: "c", label: long }, { id: "d", label: "Rules" }]} />
        <Expand title={long} summary="4 of 7 covered" open={false} onToggle={tap}>
          Rows
        </Expand>
        <Strip label="Listings">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ width: 120, flex: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${long} ${i}`}</div>
          ))}
        </Strip>
        <Locked detail="Fri, Mar 13">Locked · 4 going</Locked>
      </div>
    );
  },
});
