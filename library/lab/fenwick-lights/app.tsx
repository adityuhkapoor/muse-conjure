import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  haptic,
  mix,
  pal,
  rng,
  running,
  seedOf,
  tween,
  type Child,
  type Ctx,
  type Meta,
} from "@muse/app";

// Fenwick lights: who's at the library tonight, as the building itself. The library at night, four
// floors of windows; a friend studying there is a lit window with their face at the desk and a
// lamp that says how it's going (locked in, on a break, come say hi). Tap a dark window to sit
// there; tap your own window to change your lamp; leave and it goes dark.

type Params = {
  /** The building: "Fenwick Library" */
  place: string;
  /** "closes 2am" */
  hours: string;
  /** Floor names, ground floor first */
  floors: string[];
  /** Friends already there: floor (0 is ground), window (0 is leftmost), status 0 locked in, 1 on a break, 2 come say hi */
  here: { who: string; floor: number; window: number; status: number; said?: string }[];
};

// @params
const P: Params = {
  place: "Fenwick Library",
  hours: "closes 2am",
  floors: ["café", "stacks", "group rooms", "quiet floor"],
  here: [
    { who: "Calvin", floor: 3, window: 1, status: 0, said: "orgo pset 6 is evil" },
    { who: "Maya", floor: 2, window: 3, status: 2, said: "room 2B, color-coded the whiteboard" },
    { who: "Tsai Lin", floor: 0, window: 4, status: 1, said: "café run, taking orders" },
  ],
};
// @end params

type Seat = { id: string; name: string; floor: number; col: number; status: number; at: number; said: string };
type State = { place: string; hours: string; floors: string[]; seats: Seat[] };
type Action = { t: "sit"; floor: number; col: number } | { t: "status"; status: number } | { t: "leave" };

const COLS = 5;
const STATUS = ["locked in", "on a break", "come say hi"];
const ON = tween({ duration: 700, easing: "decelerate" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const int = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const taken = (s: State, f: number, c: number) => s.seats.some((x) => x.floor === f && x.col === c);

function initState(ctx: Ctx): State {
  const floors = (Array.isArray(P.floors) ? P.floors : []).map((f) => clean(f, 14)).filter(Boolean).slice(0, 5);
  while (floors.length < 3) floors.push(`floor ${floors.length + 1}`);
  const seats: Seat[] = [];
  for (const h of Array.isArray(P.here) ? P.here : []) {
    const name = clean(h?.who, 20);
    if (!name || !int(h.floor, 0, floors.length - 1) || !int(h.window, 0, COLS - 1)) continue;
    const m = ctx.members.find((x) => x.id === name || same(x.name, name));
    const id = m ? m.id : name;
    if (seats.some((x) => x.id === id) || seats.some((x) => x.floor === h.floor && x.col === h.window)) continue;
    seats.push({ id, name: m ? clean(m.name, 20) || name : name, floor: h.floor, col: h.window, status: int(h.status, 0, 2) ? h.status : 0, at: 0, said: clean(h.said, 48) });
  }
  return { place: clean(P.place, 28) || "the library", hours: clean(P.hours, 20), floors, seats };
}

function reduceLights(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;
  const u = meta.user;
  if (a.t === "sit") {
    if (!int(a.floor, 0, s.floors.length - 1) || !int(a.col, 0, COLS - 1)) return s;
    const f = a.floor as number;
    const c = a.col as number;
    if (taken(s, f, c)) return s;
    const name = clean(ctx.members.find((m) => m.id === u)?.name, 20) || "Friend";
    const old = s.seats.find((x) => x.id === u);
    return { ...s, seats: [...s.seats.filter((x) => x.id !== u), { id: u, name, floor: f, col: c, status: old?.status ?? 0, at: meta.time, said: "" }] };
  }
  if (a.t === "status") {
    if (!int(a.status, 0, 2) || !s.seats.some((x) => x.id === u)) return s;
    return { ...s, seats: s.seats.map((x) => (x.id === u ? { ...x, status: a.status as number, said: "" } : x)) };
  }
  if (a.t === "leave") {
    if (!s.seats.some((x) => x.id === u)) return s;
    return { ...s, seats: s.seats.filter((x) => x.id !== u) };
  }
  return s;
}

export default defineApp<State, Action>({
  name: "Library lights",
  summary: (s) => (s.seats.length ? `${s.place}: ${s.seats.length} lit · ${s.seats.map((x) => `${x.name} on ${s.floors[x.floor]}`).join(", ")}` : `${s.place}: nobody's there yet`),

  init: initState,
  reduce: (s, a, meta, ctx) => reduceLights(s, a as unknown as Record<string, unknown>, meta, ctx),

  invariants: {
    "one window per person": (s) => new Set(s.seats.map((x) => x.id)).size === s.seats.length,
    "one person per window": (s) => new Set(s.seats.map((x) => `${x.floor}:${x.col}`)).size === s.seats.length,
    "windows are on the building": (s) => s.seats.every((x) => int(x.floor, 0, s.floors.length - 1) && int(x.col, 0, COLS - 1) && int(x.status, 0, 2)),
  },

  transitions: {
    "sitting lights exactly your window": (p, n, a, m) => {
      if (a.t !== "sit" || p === n) return true;
      const me = n.seats.find((x) => x.id === m.user);
      return !taken(p, a.floor, a.col) && !!me && me.floor === a.floor && me.col === a.col && me.at === m.time && n.seats.filter((x) => x.id !== m.user).length === p.seats.filter((x) => x.id !== m.user).length;
    },
    "moving keeps your lamp": (p, n, a, m) => a.t !== "sit" || p === n || (p.seats.find((x) => x.id === m.user)?.status ?? 0) === n.seats.find((x) => x.id === m.user)!.status,
    "a lamp change touches only your lamp": (p, n, a, m) =>
      a.t !== "status" || p === n || (n.seats.find((x) => x.id === m.user)?.status === a.status && n.seats.every((x) => x.id === m.user || p.seats.some((q) => q.id === x.id && q.status === x.status && q.floor === x.floor && q.col === x.col))),
    "leaving darkens only your window": (p, n, a, m) => a.t !== "leave" || p === n || (!n.seats.some((x) => x.id === m.user) && n.seats.length === p.seats.length - 1),
    "others stay where they are": (p, n, _a, m) => n.seats.every((x) => x.id === m.user || p.seats.some((q) => q.id === x.id && q.floor === x.floor && q.col === x.col)),
    "unknown actions change nothing": (p, n, a) => a.t === "sit" || a.t === "status" || a.t === "leave" || p === n,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.6) return { t: "sit", floor: r.int(s.floors.length), col: r.int(COLS) };
    if (k < 0.85) return { t: "status", status: r.int(3) };
    return { t: "leave" };
  },

  view: ({ state, me, members, dispatch, theme }) => {
    const c = theme.color;
    const pl = pal();
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const H = 232;
    const font = theme.type.family;
    const nF = state.floors.length;
    const mine = state.seats.find((x) => x.id === me) ?? null;

    const bx = 34;
    const bw = W - 44;
    const roofH = 40;
    const stepsH = 18;
    const floorH = (H - roofH - stepsH - 12) / nF;
    const colW = bw / COLS;
    const winW = Math.min(46, colW - 12);
    const winH = Math.min(30, floorH - 8);
    const wx = (col: number) => bx + colW * col + (colW - winW) / 2;
    const wy = (floor: number) => roofH + 12 + (nF - 1 - floor) * floorH + (floorH - winH) / 2;
    const night = dark ? c.wash : mix(pl.blue, c.text, 0.72);
    const stone = dark ? mix(c.text, c.wash, 0.72) : mix(pl.wall, c.secondaryText, 0.35);
    const warm = pl.yellow;
    const dim = dark ? mix(c.wash, c.text, 0.12) : mix(night, c.card, 0.12);
    // strangers studying: the same windows every time for this building
    const r = rng(seedOf(state.place));
    const strangers = new Set<string>();
    for (let k = 0; k < 6; k++) strangers.add(`${r.int(nF)}:${r.int(COLS)}`);

    const art: Child[] = [];
    const over: Child[] = [];
    art.push(<rect key="sky" x={0} y={0} width={W} height={H} rx={14} fill={night} />);
    art.push(<circle key="moon" cx={W - 22} cy={20} r={9} fill={mix(pl.yellow, c.card, 0.5)} />);
    [12, 48, 140, 210, 260].forEach((sx, k) => art.push(<circle key={`st${k}`} cx={(sx * W) / 300} cy={8 + ((k * 7) % 22)} r={1.2} fill={c.card} opacity={0.7} />));
    // pediment and columns
    art.push(<path key="roof" d={`M ${bx - 8} ${roofH + 8} L ${bx + bw / 2} 8 L ${bx + bw + 8} ${roofH + 8} Z`} fill={stone} />);
    art.push(<rect key="body" x={bx} y={roofH + 6} width={bw} height={H - roofH - stepsH - 6} fill={stone} />);
    art.push(
      <text key="name" x={bx + bw / 2} y={roofH + 2} text-anchor="middle" font-size={11} font-weight={700} fill={dark ? c.text : c.text} font-family={font}>
        {state.place}
      </text>,
    );
    for (let k = 0; k < 3; k++) art.push(<rect key={`stp${k}`} x={bx - 6 - k * 6} y={H - stepsH + k * 6} width={bw + 12 + k * 12} height={6} fill={mix(stone, night, 0.15 + k * 0.1)} />);

    for (let f = 0; f < nF; f++) {
      for (let col = 0; col < COLS; col++) {
        const seat = state.seats.find((x) => x.floor === f && x.col === col);
        const x = wx(col);
        const y = wy(f);
        const stranger = !seat && strangers.has(`${f}:${col}`);
        const on = seat ? (seat.at > 0 ? ON(running(seat.at, 700) ?? 700) : 1) : 0;
        art.push(<rect key={`w${f}-${col}`} x={x} y={y} width={winW} height={winH} rx={3} fill={seat ? mix(dim, warm, on) : stranger ? mix(dim, warm, 0.35) : dim} />);
        art.push(<path key={`m${f}-${col}`} d={`M ${x + winW / 2} ${y} V ${y + winH}`} stroke={stone} stroke-width={1.5} />);
        if (seat) {
          if (seat.status === 1) art.push(<rect key={`bl${f}-${col}`} x={x} y={y} width={winW} height={winH * 0.5} rx={2} fill={mix(stone, c.card, 0.3)} />);
          if (seat.status === 2) art.push(<circle key={`gl${f}-${col}`} cx={x + winW / 2} cy={y + winH / 2} r={winW * 0.75} fill={warm} opacity={0.18} />);
          const isMe = seat.id === me;
          over.push(
            <button
              key={`b${f}-${col}`}
              type="button"
              aria-label={isMe ? `Your window, ${STATUS[seat.status]}. Change your lamp` : `${seat.name}, ${STATUS[seat.status]}, ${state.floors[f]}`}
              {...(isMe ? { onClick: () => { dispatch({ t: "status", status: (seat.status + 1) % 3 }); haptic("light"); } } : {})}
              style={{ position: "absolute", left: x + winW / 2 - 22, top: y + winH / 2 - 22, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: isMe ? "pointer" : "default" }}
            >
              <span style={{ display: "flex", borderRadius: 99, boxShadow: isMe ? `0 0 0 2px ${c.primary}` : "none", transform: `translateY(${seat.status === 1 ? 3 : 0}px)` }}>
                <Avatar user={{ id: seat.id, name: members.find((m) => m.id === seat.id)?.name ?? seat.name }} size={Math.min(22, winH - 4)} />
              </span>
            </button>,
          );
        } else {
          over.push(
            <button
              key={`b${f}-${col}`}
              type="button"
              aria-label={`Sit by window ${col + 1} on ${state.floors[f]}`}
              onClick={() => { dispatch({ t: "sit", floor: f, col }); haptic("light"); }}
              style={{ position: "absolute", left: x + winW / 2 - 22, top: y + winH / 2 - 22, width: 44, height: 44 }}
            />,
          );
        }
      }
    }
    // a lamp post by the steps
    art.push(<rect key="post" x={14} y={H - 70} width={3} height={60} fill={dark ? c.text : c.card} />);
    art.push(<circle key="lamp" cx={15.5} cy={H - 74} r={6} fill={warm} />);
    art.push(<circle key="lampg" cx={15.5} cy={H - 74} r={16} fill={warm} opacity={0.18} />);

    const latest = [...state.seats].sort((a, b) => b.at - a.at)[0];
    const said = state.seats.find((x) => x.said && x.status === 2) ?? state.seats.find((x) => x.said);
    // "I'm here" sits you next to whoever is already on the busiest floor.
    const busiest = [...Array(nF).keys()].sort((a, b) => state.seats.filter((x) => x.floor === b && x.id !== me).length - state.seats.filter((x) => x.floor === a && x.id !== me).length || b - a)[0]!;
    const freeCol = [...Array(COLS).keys()].find((col) => !taken(state, busiest, col));

    return (
      <div>
        <CardHeader title={`${state.place} tonight`} subtitle={`${state.hours ? state.hours + " · " : ""}${state.seats.length} ${state.seats.length === 1 ? "friend" : "friends"} here`} />
        <div style={{ position: "relative", height: H }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${state.place} at night, ${state.seats.length} friends' windows lit`} style={{ display: "block" }}>
            {art}
          </svg>
          {over}
        </div>
        <div style={{ marginTop: 8, minHeight: 20, display: "flex", alignItems: "center", gap: 6, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden" }}>
          {latest && latest.at > 0 ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${latest.id === me ? "You" : latest.name} · ${state.floors[latest.floor]} · ${STATUS[latest.status]}`}</span>
          ) : said ? (
            <>
              <Avatar user={{ id: said.id, name: said.name }} size={20} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${state.floors[said.floor]}: "${said.said}"`}</span>
            </>
          ) : (
            <span>Tap a window to sit there</span>
          )}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {mine ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Your lamp</span>
              <Button kind="secondary" onClick={() => dispatch({ t: "status", status: (mine.status + 1) % 3 })}>
                {STATUS[(mine.status + 1) % 3]![0]!.toUpperCase() + STATUS[(mine.status + 1) % 3]!.slice(1)}
              </Button>
              <Button kind="deemphasized" onClick={() => dispatch({ t: "leave" })}>
                Leave
              </Button>
            </>
          ) : (
            <Button
              kind="primary"
              wide
              disabled={freeCol === undefined}
              onClick={() => {
                if (freeCol === undefined) return;
                dispatch({ t: "sit", floor: busiest, col: freeCol });
                haptic("success");
              }}
            >
              I'm here
            </Button>
          )}
        </div>
      </div>
    );
  },
});
