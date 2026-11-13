import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  rng,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// Slow pong: two friends, one table, one hit a day. The ball creeps across the table in real time;
// you have until it reaches your side to hit it back and aim it. Miss your day and you lose. The
// rally zigzags across the table behind the ball, and the rest of the chat picks a side.

type Params = {
  /** Card title: "Slow pong" */
  title: string;
  /** The bet, short: "loser buys Tío's" */
  stakes: string;
  /** The two players (names in the chat). Leave a name empty for an open paddle. */
  left: string;
  right: string;
  /** Hours for the ball to cross the table. */
  hours: number;
  /** Hits so far in this rally. */
  rally: number;
  /** Who hit last: "left" or "right". */
  lastBy: "left" | "right";
  /** Minutes left before the ball reaches the other side, right now. */
  minutesLeft: number;
  /** Friends backing a side, with a line. */
  backers: { name: string; side: "left" | "right"; said?: string }[];
  /** What each player said. */
  leftSaid: string;
  rightSaid: string;
};

// @params
const P: Params = {
  title: "Slow pong",
  stakes: "loser buys Tío's",
  left: "Calvin",
  right: "Will",
  hours: 24,
  rally: 10,
  lastBy: "left",
  minutesLeft: 552,
  backers: [
    { name: "Maya", side: "left", said: "calvin set an alarm for this one" },
    { name: "Arun", side: "right" },
    { name: "Tsai Lin", side: "right", said: "will hit it from the shower yesterday" },
  ],
  leftSaid: "7 alarms. i will not miss",
  rightSaid: "the sube has a paddle in it now",
};
// @end params

type Seat = { who: string; name: string; said: string } | null;
type State = {
  title: string;
  stakes: string;
  seats: [Seat, Seat];
  day: number;
  rally: number;
  lastBy: number;
  lastAt: number;
  left0: number;
  aims: number[];
  winner: number;
  backers: Record<string, { side: number; name: string; said: string }>;
};
type Action = { t: "join"; side: number } | { t: "hit"; aim: number } | { t: "back"; side: number } | { t: "call" } | { t: "rematch" };
type Local = { aim: number; toast: number; msg: string };

const MAXA = 14;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const side01 = (v: unknown): number => (v === 0 || v === 1 ? v : -1);
/** ms left before the ball lands on the receiver's side; the seeded rally counts down from its own number. */
const leftAt = (s: State, now: number) => (s.lastAt ? Math.max(0, s.lastAt + s.day - now) : s.left0);
const receiver = (s: State) => 1 - s.lastBy;
const hm = (ms: number) => {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

function initState(ctx: Ctx): State {
  const seat = (name: string, said: string): Seat => {
    const n = clean(name, 20);
    if (!n) return null;
    const m = ctx.members.find((x) => x.name.toLowerCase() === n.toLowerCase());
    return { who: m ? m.id : `~${n}`, name: n, said: clean(said, 50) };
  };
  const seats: [Seat, Seat] = [seat(P.left, P.leftSaid), seat(P.right, P.rightSaid)];
  if (seats[0] && seats[1] && seats[0].who === seats[1].who) seats[1] = null;
  const day = Math.round(Math.max(1, Math.min(72, typeof P.hours === "number" ? P.hours : 24)) * 3600000);
  const full = !!seats[0] && !!seats[1];
  const rally = full && typeof P.rally === "number" ? Math.max(0, Math.min(999, Math.round(P.rally))) : 0;
  const r = rng(rally + 7);
  const aims: number[] = [];
  for (let i = 0; i < Math.min(rally, MAXA); i++) aims.push(150 + r.int(700));
  const backers: State["backers"] = {};
  for (const b of Array.isArray(P.backers) ? P.backers : []) {
    const n = clean(b?.name, 20);
    if (!n || (b.side !== "left" && b.side !== "right")) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === n.toLowerCase());
    backers[m ? m.id : `~${n}`] = { side: b.side === "left" ? 0 : 1, name: n, said: clean(b.said, 50) };
  }
  const minutes = typeof P.minutesLeft === "number" ? Math.max(1, Math.round(P.minutesLeft)) : 600;
  return {
    title: clean(P.title, 40) || "Slow pong",
    stakes: clean(P.stakes, 40),
    seats,
    day,
    rally,
    lastBy: rally ? (P.lastBy === "right" ? 1 : 0) : 1,
    lastAt: 0,
    left0: Math.min(day, minutes * 60000),
    aims,
    winner: -1,
    backers,
  };
}

export default defineApp<State, Action, Local>({
  name: "Slow pong",
  summary: (s) => {
    const [a, b] = s.seats;
    if (!a || !b) return `${s.title}: ${a || b ? "one paddle open" : "two paddles open"}`;
    if (s.winner >= 0) return `${s.title}: ${first(s.seats[s.winner]!.name)} won a ${s.rally}-hit rally`;
    return `${s.title}: ${first(a.name)} vs ${first(b.name)} · rally ${s.rally} · ${first(s.seats[receiver(s)]!.name)} to hit`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
    const mySide = s.seats.findIndex((x) => x?.who === m.user);
    if (a.t === "join") {
      const side = side01(a.side);
      if (side < 0 || mySide >= 0 || (s.seats[side] && inChat(ctx, s.seats[side]!.who))) return s;
      const seats: [Seat, Seat] = [...s.seats];
      seats[side] = { who: m.user, name, said: "" };
      const backers = { ...s.backers };
      delete backers[m.user];
      // the first serve starts the clock once both paddles are taken
      const full = !!seats[0] && !!seats[1];
      return { ...s, seats, backers, lastAt: full ? m.time : s.lastAt, lastBy: full ? side : s.lastBy, rally: 0, aims: [], winner: -1 };
    }
    if (a.t === "hit") {
      if (s.winner >= 0 || !s.seats[0] || !s.seats[1] || mySide !== receiver(s)) return s;
      if (typeof a.aim !== "number" || !Number.isInteger(a.aim) || a.aim < 0 || a.aim > 1000) return s;
      if (s.lastAt && m.time > s.lastAt + s.day) return s;
      return { ...s, rally: s.rally + 1, lastBy: mySide, lastAt: m.time, aims: [...s.aims, a.aim].slice(-MAXA) };
    }
    if (a.t === "back") {
      const side = side01(a.side);
      if (side < 0 || mySide >= 0 || s.backers[m.user]?.side === side) return s;
      return { ...s, backers: { ...s.backers, [m.user]: { side, name, said: "" } } };
    }
    if (a.t === "call") {
      if (s.winner >= 0 || !s.lastAt || !s.seats[0] || !s.seats[1] || m.time <= s.lastAt + s.day) return s;
      return { ...s, winner: s.lastBy };
    }
    if (a.t === "rematch") {
      if (s.winner < 0 || mySide < 0) return s;
      return { ...s, winner: -1, rally: 0, aims: [], lastBy: 1 - mySide, lastAt: m.time };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const keep = (x: Seat) => (x && (x.who.startsWith("~") || inChat(ctx, x.who)) ? x : null);
    const seats: [Seat, Seat] = [keep(s.seats[0]), keep(s.seats[1])];
    if (seats[0] === s.seats[0] && seats[1] === s.seats[1]) return s;
    return { ...s, seats, rally: 0, aims: [], winner: -1, lastAt: 0 };
  },

  invariants: {
    "players are in the chat or named by Muse": (s, ctx) => s.seats.every((x) => !x || x.who.startsWith("~") || inChat(ctx, x.who)),
    "two different players": (s) => !s.seats[0] || !s.seats[1] || s.seats[0].who !== s.seats[1].who,
    "players don't back a side": (s) => s.seats.every((x) => !x || !s.backers[x.who]),
    "the trail matches the rally": (s) => s.aims.length === Math.min(s.rally, MAXA) && s.aims.every((a) => Number.isInteger(a) && a >= 0 && a <= 1000),
    "a winner needs two players": (s) => s.winner < 0 || (!!s.seats[0] && !!s.seats[1] && (s.winner === 0 || s.winner === 1)),
    "sides are left or right": (s) => (s.lastBy === 0 || s.lastBy === 1) && Object.values(s.backers).every((b) => b.side === 0 || b.side === 1),
  },

  transitions: {
    "names come from the chat": (p, n, a, m, ctx) => {
      const nm = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
      if (a.t === "join" && p !== n) return n.seats[a.side]?.name === nm;
      if (a.t === "back" && p !== n) return n.backers[m.user]?.name === nm;
      return true;
    },
    "a full table starts the clock": (p, n, a, m) => a.t !== "join" || p === n || !n.seats[0] || !n.seats[1] || (n.lastAt === m.time && n.lastBy === a.side),
    "a hit needs an open game": (p, n, a) => a.t !== "hit" || p === n || (p.winner < 0 && !!p.seats[0] && !!p.seats[1] && Number.isInteger(a.aim) && a.aim >= 0 && a.aim <= 1000),
    "only the receiver hits": (p, n, a, m) => a.t !== "hit" || p === n || p.seats[receiver(p)]?.who === m.user,
    "a hit adds one to the rally and turns it over": (p, n, a) => a.t !== "hit" || p === n || (n.rally === p.rally + 1 && n.lastBy === receiver(p)),
    "a hit restarts the clock": (p, n, a, m) => a.t !== "hit" || p === n || (n.lastAt === m.time && n.aims[n.aims.length - 1] === a.aim),
    "no hits after the ball lands": (p, n, a, m) => a.t !== "hit" || p === n || !p.lastAt || m.time <= p.lastAt + p.day,
    "a miss means the hitter wins": (p, n, a, m) => a.t !== "call" || p === n || (n.winner === p.lastBy && m.time > p.lastAt + p.day),
    "backing changes only your side": (p, n, a, m) => a.t !== "back" || p === n || (n.backers[m.user]?.side === a.side && Object.keys(n.backers).every((k) => k === m.user || n.backers[k] === p.backers[k])),
    "joining takes a free paddle": (p, n, a, m, ctx) => a.t !== "join" || p === n || ((!p.seats[a.side] || !inChat(ctx, p.seats[a.side]!.who)) && n.seats[a.side]?.who === m.user && n.rally === 0 && n.winner < 0),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const mine = s.seats.findIndex((x) => x?.who === user);
    if (mine < 0) {
      const free = [0, 1].filter((i) => !s.seats[i] || !ctx.members.some((m) => m.id === s.seats[i]!.who));
      if (free.length && r.next() < 0.6) return { t: "join", side: r.pick(free) };
    }
    if (s.winner >= 0 && mine >= 0) return { t: "rematch" };
    if (mine === receiver(s) && r.next() < 0.85) return { t: "hit", aim: r.int(1001) };
    if (mine < 0) return { t: "back", side: r.int(2) };
    return r.next() < 0.5 ? { t: "call" } : { t: "hit", aim: r.int(1001) };
  },

  local: { aim: 500, toast: 0, msg: "" },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dk = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const H = 178;
    const now = clock.value;
    const full = !!s.seats[0] && !!s.seats[1];
    const left = full ? leftAt(s, now) : s.day;
    const overdue = full && s.winner < 0 && s.lastAt > 0 && left <= 0;
    const mySide = s.seats.findIndex((x) => x?.who === me);
    const recv = receiver(s);
    const myTurn = full && s.winner < 0 && mySide === recv && !overdue;
    const nameOf = (id: string, fb: string) => members.find((m) => m.id === id)?.name ?? fb;
    const seatName = (i: number) => (s.seats[i] ? first(nameOf(s.seats[i]!.who, s.seats[i]!.name)) : "open");
    const back = Object.entries(s.backers).map(([id, b]) => ({ id, ...b }));
    const side = (i: number) => back.filter((b) => b.side === i);
    const myBack = s.backers[me]?.side ?? -1;
    const PADX = 22;
    const tx = (i: number) => (i === 0 ? PADX + 12 : W - PADX - 12);
    const ty = (aim: number) => 22 + (aim / 1000) * (H - 44);

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      // table
      g.fillStyle = dk ? mix(pl.blue, c.card, 0.55) : mix(pl.blue, c.card, 0.3);
      g.beginPath();
      g.roundRect(PADX, 8, W - 2 * PADX, H - 16, 8);
      g.fill();
      g.strokeStyle = dk ? mix(c.text, c.card, 0.3) : c.card;
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(PADX + 4, 12, W - 2 * PADX - 8, H - 24, 6);
      g.moveTo(PADX + 4, H / 2);
      g.lineTo(W - PADX - 4, H / 2);
      g.stroke();
      // the net, with day ticks along the table
      g.fillStyle = dk ? c.text : c.card;
      g.fillRect(W / 2 - 2, 4, 4, H - 8);
      g.fillStyle = mix(c.text, c.card, 0.5);
      for (let y = 8; y < H - 8; y += 6) g.fillRect(W / 2 - 1, y, 2, 3);
      // the rally so far: a zigzag behind the ball
      const pts: [number, number][] = [];
      let sideNow = s.lastBy;
      for (let i = s.aims.length - 1; i >= 0; i--) {
        pts.unshift([tx(sideNow === 0 ? 1 : 0), ty(s.aims[i]!)]);
        sideNow = 1 - sideNow;
      }
      // older hits fade into the table; the leg in flight is drawn with the ball
      const tableCol = dk ? mix(pl.blue, c.card, 0.55) : mix(pl.blue, c.card, 0.3);
      const legs = Math.min(6, pts.length - 1);
      g.lineWidth = 2;
      g.lineCap = "round";
      for (let k = 1; k < legs; k++) {
        const a = pts[pts.length - 2 - k]!;
        const b = pts[pts.length - 1 - k]!;
        g.strokeStyle = mix(dk ? c.text : c.card, tableCol, 0.25 + (k / legs) * 0.6);
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
      }
      // a day ruler along the bottom: one tick an hour, filled as the ball travels
      const hours = Math.round(s.day / 3600000);
      const pDone = s.winner >= 0 || !full ? 0 : Math.max(0, Math.min(1, 1 - leftAt(s, f.now) / s.day));
      for (let k = 0; k <= hours; k++) {
        const fx = recv === 1 ? k / hours : 1 - k / hours;
        const x = PADX + 10 + fx * (W - 2 * PADX - 20);
        g.fillStyle = k / hours <= pDone ? pl.orange : mix(c.card, tableCol, 0.45);
        g.fillRect(x - 1, H - 15, 2, k % 6 === 0 ? 7 : 4);
      }
      // paddles
      for (const i of [0, 1]) {
        const seat = s.seats[i];
        const px = i === 0 ? 8 : W - 18;
        const aimY = i === recv && s.aims.length ? ty(s.aims[s.aims.length - 1]!) : H / 2;
        g.beginPath();
        g.roundRect(px, aimY - 22, 10, 44, 5);
        if (seat) {
          g.fillStyle = userColor(seat.who, theme);
          g.fill();
        }
        else {
          g.strokeStyle = c.secondaryText;
          g.setLineDash([4, 3]);
          g.stroke();
          g.setLineDash([]);
        }
      }
      // the ball, creeping toward the receiver
      if (full) {
        const from = s.aims.length > 1 ? ty(s.aims[s.aims.length - 2]!) : H / 2;
        const to = s.aims.length ? ty(s.aims[s.aims.length - 1]!) : H / 2;
        const p = s.winner >= 0 ? 1 : Math.max(0, Math.min(1, 1 - leftAt(s, f.now) / s.day));
        const x0 = tx(s.lastBy);
        const x1 = tx(recv);
        const bx = x0 + (x1 - x0) * p;
        const by = from + (to - from) * p;
        g.fillStyle = mix(c.text, c.card, 0.75);
        g.beginPath();
        g.ellipse(bx + 3, by + 5, 7, 3, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = pl.orange;
        g.beginPath();
        g.arc(bx, by, 7, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = mix(pl.orange, c.card, 0.6);
        g.beginPath();
        g.arc(bx - 2, by - 2, 2.5, 0, Math.PI * 2);
        g.fill();
        g.setLineDash([2, 5]);
        g.strokeStyle = dk ? c.text : c.card;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(x1, to);
        g.stroke();
        g.setLineDash([]);
        // landing spot on the receiver's side
        g.strokeStyle = c.negative;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x1, to, 9, 0, Math.PI * 2);
        g.stroke();
      }
      // rally count, big on the table
      const t = fitText(`${s.rally} hits`, 120, { g, size: 24, min: 14, weight: 700 });
      g.font = t.font;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = dk ? c.text : c.card;
      g.fillText(t.text, W / 2 + (recv === 0 ? 1 : -1) * (W / 4), H - 40);
      return full && s.winner < 0;
    };

    const onPointer = (e: { type: string; x: number; y: number }) => {
      if (e.type !== "down" || !myTurn) return;
      setLocal({ aim: Math.max(0, Math.min(1000, Math.round(((e.y - 22) / (H - 44)) * 1000))) });
    };

    const label = full
      ? `Table: ${seatName(0)} vs ${seatName(1)}, rally ${s.rally}, ball heading to ${seatName(recv)}, ${hm(left)} left`
      : "Table with an open paddle";
    const recvSeat = s.seats[recv];
    const status = !full
      ? "Take a paddle · one hit a day, miss and you lose"
      : s.winner >= 0
        ? `${seatName(s.winner)} wins a ${s.rally}-hit rally · ${s.stakes ? `${seatName(1 - s.winner)} ${s.stakes.replace(/^loser /, "")}` : ""}`
        : overdue
          ? `${seatName(recv)} missed the day`
          : myTurn
            ? `Your day · ${hm(left)} to hit it back · tap the table to aim`
            : `${seatName(recv)} has ${hm(left)} to hit it back`;
    const quote = recvSeat?.said ? `${seatName(recv)}: “${recvSeat.said}”` : back.find((b) => b.said) ? `${first(nameOf(back.find((b) => b.said)!.id, back.find((b) => b.said)!.name))}: “${back.find((b) => b.said)!.said}”` : "";

    return (
      <div>
        <CardHeader title={s.title} subtitle={`${seatName(0)} vs ${seatName(1)}${s.stakes ? ` · ${s.stakes}` : ""}`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={label} draw={draw} onPointer={onPointer} />
          {[0, 1].map((i) =>
            s.seats[i] ? (
              <div key={`p${i}`} style={{ position: "absolute", top: 14, [i === 0 ? "left" : "right"]: PADX + 10, display: "flex", alignItems: "center", gap: 4, padding: "2px 8px 2px 2px", borderRadius: 14, background: c.card, pointerEvents: "none" }}>
                <Avatar user={{ id: s.seats[i]!.who, name: nameOf(s.seats[i]!.who, s.seats[i]!.name) } as Member} size={20} />
                <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{seatName(i)}</span>
              </div>
            ) : null,
          )}
          {myTurn ? (
            <div style={{ position: "absolute", left: tx(1 - mySide) - 9, top: ty(local.aim) - 9, width: 18, height: 18, borderRadius: 9, boxShadow: `0 0 0 2px ${c.primary}`, pointerEvents: "none" }} />
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minHeight: 28 }}>
          {[0, 1].map((i) => (
            <div key={`b${i}`} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, justifyContent: i === 0 ? "flex-start" : "flex-end" }}>
              {i === 1 ? <span style={{ fontSize: 13, color: c.secondaryText }}>{`${side(i).length} back ${seatName(i)}`}</span> : null}
              {side(i).length ? <Facepile users={side(i).map((b): Member => ({ id: b.id, name: nameOf(b.id, b.name) }))} max={4} size={22} /> : null}
              {i === 0 ? <span style={{ fontSize: 13, color: c.secondaryText }}>{`${side(i).length} back ${seatName(i)}`}</span> : null}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{status}</div>
        {quote && s.winner < 0 && !myTurn ? <div style={{ marginTop: 2, fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{quote}</div> : null}
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          {!full && mySide < 0 ? (
            [0, 1]
              .filter((i) => !s.seats[i])
              .map((i, k) => (
                <Button key={`j${i}`} kind={k === 0 ? "primary" : "secondary"} wide onClick={() => dispatch({ t: "join", side: i })}>
                  {i === 0 ? "Take left paddle" : "Take right paddle"}
                </Button>
              ))
          ) : s.winner >= 0 && mySide >= 0 ? (
            <Button kind="primary" wide onClick={() => dispatch({ t: "rematch" })}>
              Rematch
            </Button>
          ) : overdue ? (
            <Button kind="primary" wide onClick={() => dispatch({ t: "call" })}>
              Call it
            </Button>
          ) : myTurn ? (
            <Button
              kind="primary"
              wide
              onClick={() => {
                haptic("success");
                dispatch({ t: "hit", aim: local.aim });
                setLocal({ toast: local.toast + 1, msg: `Rally ${s.rally + 1} · see you tomorrow` });
              }}
            >
              Hit it back
            </Button>
          ) : mySide < 0 && full ? (
            [0, 1].map((i) => (
              <Button
                key={`k${i}`}
                kind={myBack === i ? "deemphasized" : "secondary"}
                wide
                onClick={() => {
                  haptic("light");
                  dispatch({ t: "back", side: i });
                }}
              >
                {`Back ${seatName(i)}`}
              </Button>
            ))
          ) : (
            <Button kind="secondary" wide disabled>
              {`Waiting on ${seatName(recv)}`}
            </Button>
          )}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
