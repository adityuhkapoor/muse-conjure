import {
  defineApp,
  Button,
  Burst,
  Canvas,
  CardHeader,
  Facepile,
  Toast,
  fitText,
  haptic,
  mix,
  running,
  tween,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// "saturday lake day real or fake": a roller coaster train with everyone's seat. Each "in" drops a
// lap bar and clicks the train one notch up the lift hill. At the target it crests, drops, and
// turns into the event with the riders as hosts.

type Params = {
  /** Card title: "Lake day" */
  title: string;
  /** Under the title: Will's line */
  sub: string;
  /** Bars down it takes to crest (2 to 8). */
  need: number;
  /** What it becomes: place, time, short weekday and day of month. */
  event: { place: string; when: string; dow: string; date: number };
  /** The forecast the thermometer shows (°F). */
  forecast: number;
  /** Riders. in: lap bar already down. said: their line. above: only if it's above this many degrees (0 for no condition). */
  riders: { name: string; in: boolean; said: string; above: number }[];
};

// @params
const P: Params = {
  title: "Lake day",
  sub: "Will: “saturday lake day real or fake”",
  need: 4,
  event: { place: "Lake Wren", when: "Sat 11am", dow: "Sat", date: 14 },
  forecast: 73,
  riders: [
    { name: "Will", in: true, said: "the Sube fits 5 and a cooler", above: 0 },
    { name: "Arun", in: true, said: "bringing rice cooker onigiri, obviously", above: 0 },
    { name: "Aditya", in: true, said: "lowkey in", above: 0 },
    { name: "Maya", in: false, said: "if it's above 70", above: 70 },
    { name: "Tsai Lin", in: false, said: "in if i get aux in the Sube", above: 0 },
    { name: "Calvin", in: false, said: "alarm one is still 5:50 on saturdays", above: 0 },
  ],
};
// @end params

type Seat = { who: string; name: string; on: boolean; said: string; above: number; at: number };
type State = {
  title: string;
  sub: string;
  need: number;
  place: string;
  when: string;
  dow: string;
  date: number;
  forecast: number;
  seats: Seat[];
  /** Notch the train sat on before the last bar change, for the climb. */
  from: number;
  movedAt: number;
  crest: { at: number; hosts: string[] } | null;
  going: string[];
};
type Action = { t: "bar" } | { t: "going" };
type Local = { burst: number };

const MAX = 8;
const TAU = Math.PI * 2;
const CH = 214;
const CLIMB = 700;
const RIDE = 2200;
const climb = tween({ duration: CLIMB, easing: "decelerate" });
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seeded = (who: string) => who.startsWith("~");
const downs = (s: State) => s.seats.filter((x) => x.on).length;
const memberOf = (x: Seat): Member => ({ id: x.who, name: x.name });
const firstName = (n: string) => n.split(" ")[0] ?? n;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

function initState(ctx: Ctx): State {
  const seats: Seat[] = [];
  for (const raw of P.riders) {
    if (seats.length >= MAX) break;
    const name = clean(raw.name, 20);
    if (!name) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (seats.some((x) => x.who === who)) continue;
    const above = Number.isInteger(raw.above) ? Math.min(120, Math.max(0, raw.above)) : 0;
    seats.push({ who, name, on: !!raw.in, said: clean(raw.said, 60), above, at: 0 });
  }
  for (const m of ctx.members) {
    if (seats.length >= MAX || seats.some((x) => x.who === m.id)) continue;
    seats.push({ who: m.id, name: clean(m.name, 20) || "Friend", on: false, said: "", above: 0, at: 0 });
  }
  const need = Math.max(1, Math.min(seats.length || 1, Number.isInteger(P.need) ? Math.min(8, Math.max(2, P.need)) : 4));
  // Seeded bars never reach the crest on their own: one seat is left for the chat.
  let on = 0;
  for (const x of seats) if (x.on && ++on >= need) x.on = false;
  const ev = P.event ?? { place: "", when: "", dow: "", date: 0 };
  const forecast = Number.isInteger(P.forecast) ? Math.min(130, Math.max(-40, P.forecast)) : 70;
  return {
    title: clean(P.title, 40) || "Lake day",
    sub: clean(P.sub, 60),
    need,
    place: clean(ev.place, 30) || "The plan",
    when: clean(ev.when, 24),
    dow: clean(ev.dow, 3),
    date: Number.isInteger(ev.date) ? Math.min(31, Math.max(1, ev.date)) : 1,
    forecast,
    seats,
    from: seats.filter((x) => x.on).length,
    movedAt: 0,
    crest: null,
    going: [],
  };
}

// The track: keyframes joined with cosine easing, sampled into a polyline with arc lengths.
type Track = { pts: { x: number; y: number }[]; len: number[] };
const tracks = new Map<string, Track>();
function trackFor(W: number): Track {
  const key = `${W}`;
  const hit = tracks.get(key);
  if (hit) return hit;
  const base = CH - 46;
  const keys = [
    [0, base],
    [0.04 * W, base],
    [0.6 * W, 30],
    [0.66 * W, 30],
    [0.84 * W, CH - 32],
    [W + 40, CH - 74],
  ];
  const pts: { x: number; y: number }[] = [];
  for (let x = -60; x <= W + 60; x += 3) {
    let y = base;
    if (x >= keys[keys.length - 1]![0]!) y = keys[keys.length - 1]![1]!;
    for (let k = 0; k < keys.length - 1; k++) {
      const [x0, y0] = keys[k]!;
      const [x1, y1] = keys[k + 1]!;
      if (x >= x0! && x <= x1!) {
        const u = (x - x0!) / (x1! - x0!);
        const e = k === 1 ? u * u * (1.6 - 0.6 * u) : (1 - Math.cos(u * Math.PI)) / 2;
        y = y0! + (y1! - y0!) * e;
      }
    }
    pts.push({ x, y });
  }
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const t = { pts, len };
  tracks.set(key, t);
  return t;
}
function at(tr: Track, s: number) {
  let i = 1;
  while (i < tr.len.length - 1 && tr.len[i]! < s) i++;
  const a = tr.pts[i - 1]!;
  const b = tr.pts[i]!;
  const u = Math.max(0, Math.min(1, (s - tr.len[i - 1]!) / Math.max(0.001, tr.len[i]! - tr.len[i - 1]!)));
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}
const lenAtX = (tr: Track, x: number) => tr.len[Math.max(0, tr.pts.findIndex((p) => p.x >= x))] ?? 0;

function drawCoaster(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string) {
  const t: Theme = f.theme;
  const c = t.color;
  const dk = t.mode === "dark";
  const ink = dk ? c.wash : c.text;
  const W = f.width;
  const tr = trackFor(W);
  let anim = false;

  // Sky, lake, grass.
  g.beginPath();
  g.roundRect(0, 0, W, CH, 14);
  g.fillStyle = mix(c.series1, c.card, dk ? 0.75 : 0.85);
  g.fill();
  g.save();
  g.beginPath();
  g.roundRect(0, 0, W, CH, 14);
  g.clip();
  g.beginPath();
  g.arc(W * 0.86, 36, 15, 0, TAU);
  g.fillStyle = c.series2;
  g.fill();
  g.beginPath();
  g.ellipse(W * 0.84, CH - 4, W * 0.3, 26, 0, Math.PI, 0);
  g.fillStyle = mix(c.series1, c.card, dk ? 0.35 : 0.45);
  g.fill();
  g.beginPath();
  g.rect(0, CH - 14, W, 14);
  g.fillStyle = mix(c.series3, c.card, dk ? 0.5 : 0.55);
  g.fill();
  const lake = fitText(s.place, W * 0.3, { g, size: 11, min: 10, weight: 600 });
  g.font = lake.font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = c.text;
  g.fillText(lake.text, W * 0.84, CH - 8);

  // Supports: one stroke.
  g.beginPath();
  for (let i = 0; i < tr.pts.length; i += 6) {
    const p = tr.pts[i]!;
    if (p.x < 4 || p.x > W - 4 || p.y > CH - 30) continue;
    g.moveTo(p.x, p.y + 4);
    g.lineTo(p.x, CH - 14);
  }
  g.lineWidth = 1.5;
  g.strokeStyle = mix(c.secondaryText, c.card, 0.45);
  g.stroke();
  // Rails.
  g.beginPath();
  tr.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.lineWidth = 4;
  g.strokeStyle = c.negative;
  g.stroke();

  // Lift hill notches, one per bar needed.
  const s0 = lenAtX(tr, 0.04 * W) + s.seats.length * 24;
  const sTop = lenAtX(tr, 0.6 * W);
  const notch = (k: number) => s0 + ((sTop - s0) * k) / s.need;
  g.beginPath();
  for (let k = 1; k <= s.need; k++) {
    const p = at(tr, notch(k));
    g.moveTo(p.x - 4 * Math.sin(p.ang), p.y + 4 * Math.cos(p.ang));
    g.arc(p.x, p.y, 3.2, 0, TAU);
  }
  g.fillStyle = mix(c.secondaryText, c.card, 0.2);
  g.fill();

  // Where the train's front is.
  let front: number;
  let thrill = 0;
  if (s.crest) {
    const e = f.now - s.crest.at;
    const end = lenAtX(tr, W * 0.97);
    if (e < RIDE) {
      anim = true;
      const u = e / RIDE;
      front = sTop + (end - sTop) * (u * u * (3 - 2 * u) * 0.4 + 0.6 * u * u);
      thrill = 1;
    } else front = end;
    thrill = 1;
  } else {
    const k = Math.min(s.need, downs(s));
    const e = s.movedAt ? running(s.movedAt, CLIMB) : null;
    if (e !== null) {
      anim = true;
      front = notch(s.from) + (notch(k) - notch(s.from)) * climb(e);
    } else front = notch(k);
  }

  // Cars, back to front, faces in seats.
  const n = s.seats.length;
  for (let i = n - 1; i >= 0; i--) {
    const seat = s.seats[i]!;
    const p = at(tr, front - i * 24);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.ang);
    // Car body.
    g.beginPath();
    g.roundRect(-10, -14, 20, 12, [3, 3, 5, 5]);
    g.fillStyle = i === 0 ? c.primary : mix(c.primary, c.card, 0.3);
    g.fill();
    g.beginPath();
    g.arc(-6, -1, 2, 0, TAU);
    g.moveTo(8, -1);
    g.arc(6, -1, 2, 0, TAU);
    g.fillStyle = mix(c.secondaryText, ink, 0.3);
    g.fill();
    g.restore();
    // Rider: upright regardless of slope.
    const hx = p.x + 3 * Math.sin(p.ang);
    const hy = p.y - 22;
    const col = userColor(memberOf(seat), t);
    const arms = thrill && seat.on;
    if (arms) {
      g.beginPath();
      g.moveTo(hx - 4, hy + 4);
      g.lineTo(hx - 9, hy - 12);
      g.moveTo(hx + 4, hy + 4);
      g.lineTo(hx + 9, hy - 12);
      g.lineWidth = 3;
      g.lineCap = "round";
      g.strokeStyle = col;
      g.stroke();
    }
    g.beginPath();
    g.arc(hx, hy, 8.5, 0, TAU);
    g.fillStyle = seat.on || thrill ? col : mix(col, c.card, 0.45);
    g.fill();
    if (seat.who === me) {
      g.lineWidth = 2;
      g.strokeStyle = c.primary;
      g.stroke();
    }
    g.beginPath();
    g.arc(hx - 3, hy - 1.5, 1.2, 0, TAU);
    g.moveTo(hx + 4.2, hy - 1.5);
    g.arc(hx + 3, hy - 1.5, 1.2, 0, TAU);
    g.fillStyle = ink;
    g.fill();
    g.beginPath();
    if (thrill && seat.on) g.ellipse(hx, hy + 3, 2.4, 2.8, 0, 0, TAU);
    else if (seat.on) g.arc(hx, hy + 1, 3, 0.15 * Math.PI, 0.85 * Math.PI);
    else g.moveTo(hx - 2.5, hy + 3.5), g.lineTo(hx + 2.5, hy + 3.5);
    g.lineWidth = 1.3;
    g.strokeStyle = ink;
    if (thrill && seat.on) g.fill();
    else g.stroke();
    // Lap bar: down when in, up when not.
    const e = seat.at ? running(seat.at, 350) : null;
    if (e !== null) anim = true;
    const k = seat.on ? (e === null ? 1 : e / 350) : e === null ? 0 : 1 - e / 350;
    g.save();
    g.translate(p.x - 9 * Math.cos(p.ang), p.y - 9 * Math.sin(p.ang) - 13);
    g.rotate(p.ang - (1 - k) * 1.4);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(16, 0);
    g.lineWidth = 2.5;
    g.lineCap = "round";
    g.strokeStyle = k > 0.5 ? c.series2 : mix(c.secondaryText, c.card, 0.3);
    g.stroke();
    g.restore();
    // A thermometer for a rider with a condition.
    if (seat.above > 0 && !s.crest) {
      const tx = hx - 1;
      const ty = hy - 22;
      const ok = s.forecast >= seat.above;
      g.beginPath();
      g.roundRect(tx - 3, ty - 12, 6, 16, 3);
      g.arc(tx, ty + 5, 4.5, 0, TAU);
      g.fillStyle = c.card;
      g.fill();
      g.beginPath();
      g.rect(tx - 1.2, ty - (ok ? 9 : 2), 2.4, ok ? 13 : 6);
      g.arc(tx, ty + 5, 3, 0, TAU);
      g.fillStyle = ok ? c.negative : c.series1;
      g.fill();
    }
  }

  // Click-clack sparks while climbing.
  g.restore();
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Coaster lock",
  summary: (s) => {
    if (s.crest) return `${s.place}${s.when ? ` · ${s.when}` : ""} · ${s.going.length} going`;
    return `${s.title}: ${downs(s)} of ${s.need} bars down`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "bar") {
      if (s.crest) return s;
      const i = s.seats.findIndex((x) => x.who === m.user);
      if (i < 0) return s;
      const before = Math.min(s.need, downs(s));
      const seats = s.seats.map((x, k) => (k === i ? { ...x, on: !x.on, at: m.time } : x));
      const next: State = { ...s, seats, from: before, movedAt: m.time };
      if (downs(next) >= s.need) {
        const hosts = seats.filter((x) => x.on).map((x) => x.who);
        return { ...next, crest: { at: m.time, hosts }, going: hosts.filter((u) => inChat(ctx, u)) };
      }
      return next;
    }
    if (a.t === "going") {
      if (!s.crest) return s;
      return { ...s, going: s.going.includes(m.user) ? s.going.filter((u) => u !== m.user) : [...s.going, m.user] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    let seats = s.seats.map((x) => (seeded(x.who) || inChat(ctx, x.who) ? x : { ...x, who: `~${x.name}` }));
    seats = seats.filter((x, i) => seats.findIndex((y) => y.who === x.who) === i);
    for (const m of ctx.members) {
      if (seats.some((x) => x.who === m.id)) continue;
      const k = seats.findIndex((x) => seeded(x.who) && x.name.toLowerCase() === m.name.toLowerCase());
      if (k >= 0) seats = seats.map((x, j) => (j === k ? { ...x, who: m.id } : x));
      else if (seats.length < MAX) seats = [...seats, { who: m.id, name: clean(m.name, 20) || "Friend", on: false, said: "", above: 0, at: 0 }];
    }
    // Hosts follow their seat: same name, whoever holds it now.
    const hostOf = (u: string) => {
      const name = s.seats.find((x) => x.who === u)?.name;
      return seats.find((x) => x.who === u)?.who ?? seats.find((x) => x.name === name)?.who ?? null;
    };
    const crest = s.crest ? { ...s.crest, hosts: s.crest.hosts.map(hostOf).filter((u): u is string => u !== null).filter((u, i, xs) => xs.indexOf(u) === i) } : null;
    const going = s.going.filter((u) => inChat(ctx, u));
    // Without a crest the bars can't add up to the target from membership changes alone.
    if (!crest && seats.filter((x) => x.on).length >= s.need) {
      let left = s.need - 1;
      seats = seats.map((x) => (x.on && left-- <= 0 ? { ...x, on: false } : x));
    }
    return { ...s, seats, crest, going, from: Math.min(s.from, s.need) };
  },

  invariants: {
    "everyone in the chat has a seat": (s, ctx) => s.seats.length >= MAX || ctx.members.every((m) => s.seats.some((x) => x.who === m.id)),
    "hosts have seats": (s) => s.crest === null || s.crest.hosts.every((u) => s.seats.some((x) => x.who === u)),
    "one seat per person": (s) => s.seats.length >= 1 && s.seats.length <= MAX && new Set(s.seats.map((x) => x.who)).size === s.seats.length,
    "live seats are in the chat": (s, ctx) => s.seats.every((x) => seeded(x.who) || inChat(ctx, x.who)),
    "it crests exactly when enough bars are down": (s) => (s.crest !== null) === (s.crest !== null || downs(s) >= s.need) && (s.crest !== null || downs(s) < s.need),
    "hosts rode over the top": (s) => s.crest === null || (s.crest.hosts.length >= 1 && new Set(s.crest.hosts).size === s.crest.hosts.length),
    "going only after the crest, once each": (s, ctx) => (s.crest !== null || s.going.length === 0) && new Set(s.going).size === s.going.length && s.going.every((u) => inChat(ctx, u)),
    "the climb starts on a notch": (s) => Number.isInteger(s.from) && s.from >= 0 && s.from <= s.need,
  },

  transitions: {
    "the crest puts the riders in the chat on the going list": (p, n, a, _m, ctx) => a.t !== "bar" || p.crest !== null || n.crest === null || n.going.join() === n.crest.hosts.filter((u) => ctx.members.some((x) => x.id === u)).join(),
    "a bar flips only the sender's seat": (p, n, a, m) => {
      if (a.t !== "bar" || p === n) return true;
      const changed = n.seats.filter((x, i) => x.on !== p.seats[i]?.on);
      return changed.length === 1 && changed[0]!.who === m.user && changed[0]!.at === m.time && n.movedAt === m.time && n.from === Math.min(p.need, downs(p));
    },
    "bars lock once it crests": (p, n) => p.crest === null || (JSON.stringify(n.crest) === JSON.stringify(p.crest) && n.seats.every((x, i) => x.on === p.seats[i]?.on || x.who !== p.seats[i]?.who)),
    "the crest makes everyone with a bar down a host": (p, n, a, m) => {
      if (a.t !== "bar" || p.crest !== null || n.crest === null) return true;
      return n.crest.at === m.time && n.crest.hosts.join() === n.seats.filter((x) => x.on).map((x) => x.who).join();
    },
    "going toggles only the sender": (p, n, a, m) => {
      if (a.t !== "going" || p === n) return true;
      const diff = [...p.going.filter((u) => !n.going.includes(u)), ...n.going.filter((u) => !p.going.includes(u))];
      return diff.length === 1 && diff[0] === m.user;
    },
    "unknown actions change nothing": (p, n, a) => a.t === "bar" || a.t === "going" || JSON.stringify(p) === JSON.stringify(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => (s.crest ? { t: "going" } : r.next() < 0.9 ? { t: "bar" } : { t: "going" }),

  local: { burst: 0 },

  view: ({ state, confirmed, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = state;
    const crest = confirmed.crest;
    const mine = s.seats.find((x) => x.who === me);
    const n = downs(s);
    const riding = crest ? running(crest.at, RIDE) : null;
    const cond = s.seats.find((x) => x.above > 0);
    const quote = mine && !mine.on ? (s.seats.filter((x) => x.said && x.who !== me && !x.on)[0] ?? null) : (s.seats.filter((x) => x.said && x.on && x.who !== me).pop() ?? null);
    const label = `Roller coaster: ${n} of ${s.need} lap bars down. ${s.seats.map((x) => `${x.name} ${x.on ? "in" : "not yet"}`).join(", ")}`;
    const bar = () => {
      haptic(mine?.on ? "light" : "medium");
      if (!mine?.on && n + 1 >= s.need) setLocal({ burst: local.burst + 1 });
      dispatch({ t: "bar" });
    };

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={CH} label={label} draw={(g, f) => drawCoaster(g, f, confirmed, me)} />
        {crest && riding === null ? (
          <div style={{ position: "relative", marginTop: 8 }}>
            {local.burst > 0 ? (
              <div style={{ position: "absolute", left: "50%", top: 0, pointerEvents: "none" }}>
                <Burst key={local.burst} emoji="🎢" />
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
              <div style={{ flex: "none", width: 48, height: 52, borderRadius: 10, overflow: "hidden", background: c.input, textAlign: "center" }}>
                <div style={{ background: c.negative, color: c.onPrimary, fontSize: 12, lineHeight: "18px", fontWeight: 700 }}>{s.dow.toUpperCase() || "DAY"}</div>
                <div style={{ fontSize: 20, lineHeight: "32px", fontWeight: 700, color: c.text }}>{s.date}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 700, color: c.text, ...ell }}>{`${s.place}${s.when ? ` · ${s.when}` : ""}`}</div>
                <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, ...ell }}>{`Event · hosted by ${crest.hosts.map((u) => firstName(s.seats.find((x) => x.who === u)?.name ?? "Friend")).join(", ")}`}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minWidth: 0 }}>
              <Facepile users={crest.hosts.map((u) => ({ id: u, name: s.seats.find((x) => x.who === u)?.name ?? "Friend" }))} max={5} size={24} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>{`${crest.hosts.length} riders · ${confirmed.going.length} going`}</span>
              <Button kind={confirmed.going.includes(me) ? "secondary" : "primary"} onClick={() => dispatch({ t: "going" })}>
                {confirmed.going.includes(me) ? "Going" : "Hop on"}
              </Button>
            </div>
            {local.burst > 0 ? <Toast key={local.burst}>{`${s.place} is on the calendar`}</Toast> : null}
          </div>
        ) : crest ? (
          <div style={{ height: 96, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 600, color: c.text }}>Here we go…</div>
        ) : (
          <div>
            <div style={{ minHeight: 40, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Facepile users={s.seats.filter((x) => x.on).map(memberOf)} max={4} size={20} />
              <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>
                {`${n} of ${s.need} bars down${cond ? ` · ${s.forecast}° Sat, ${firstName(cond.name)} said ${cond.above}+` : ""}`}
              </span>
            </div>
            {quote ? (
              <div style={{ fontSize: 15, lineHeight: "20px", color: c.text, marginBottom: 8, ...ell }}>
                <b>{quote.name}</b>
                <span style={{ color: c.secondaryText }}>{` · “${quote.said}”`}</span>
              </div>
            ) : null}
            <Button kind={mine?.on ? "secondary" : "primary"} wide disabled={!mine} onClick={bar}>
              {mine?.on ? "Lift my bar" : n + 1 >= s.need ? "I'm in, send it" : "I'm in"}
            </Button>
          </div>
        )}
      </div>
    );
  },
});
