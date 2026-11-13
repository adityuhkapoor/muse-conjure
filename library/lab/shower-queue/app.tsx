import {
  defineApp,
  Button,
  Canvas,
  CardHeader,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  tween,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Meta,
} from "@muse/app";

// Shower queue: one bathroom, everyone with a 9am. The hallway with the line at the bathroom door,
// and the morning as a timeline underneath, one slot per person sized by their shower. Drag your
// slot to move in the line; tap it to change your length. In the morning, "I'm out" tells the next
// person they're up.

type Params = {
  /** Card title */
  title: string;
  /** Under the title */
  sub: string;
  /** First shower, 24-hour "7:00" */
  start: string;
  /** Everyone must be out by, "8:45" */
  end: string;
  /** The line, first to last, with minutes each and a line in their words */
  queue: { who: string; minutes: number; said?: string }[];
};

// @params
const P: Params = {
  title: "Shower queue",
  sub: "One bathroom, four 9ams",
  start: "7:00",
  end: "8:45",
  queue: [
    { who: "Calvin", minutes: 15, said: "i'm up anyway. seven alarms" },
    { who: "Arun", minutes: 15 },
    { who: "Will", minutes: 30, said: "25 minutes is a normal shower" },
    { who: "Aditya", minutes: 15 },
  ],
};
// @end params

type Person = { id: string; name: string; min: number; said: string };
type State = { title: string; sub: string; start: number; end: number; people: Person[]; prev: string[]; at: number; cur: number; inAt: number };
type Action = { t: "move"; to: number } | { t: "len"; min: number } | { t: "next" } | { t: "join" } | { t: "reset" };
type Local = { drag: boolean; dx: number; x0: number; toast: number; msg: string };

const H = 226;
const LENS = [5, 10, 15, 20, 25, 30];
const ease = tween({ duration: 450, easing: "standard" });
const TL_Y = 170;
const TL_H = 30;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const first = (n: string) => n.split(" ")[0] ?? n;
const parse = (v: unknown, d: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clean(v, 5));
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : d;
};
const clock = (min: number) => `${Math.floor(min / 60) % 12 || 12}:${String(min % 60).padStart(2, "0")}`;
const startOf = (s: State, i: number) => s.start + s.people.slice(0, i).reduce((n, p) => n + p.min, 0);
const total = (s: State) => s.people.reduce((n, p) => n + p.min, 0);
const done = (s: State) => s.cur >= s.people.length && s.people.length > 0;

function initState(ctx: Ctx): State {
  const people: Person[] = [];
  for (const q of Array.isArray(P.queue) ? P.queue : []) {
    const who = clean(q?.who, 24);
    if (!who || people.length >= 6) continue;
    const m = ctx.members.find((x) => x.id === who || x.name.toLowerCase() === who.toLowerCase());
    const id = m ? m.id : `?${who.toLowerCase()}`;
    if (people.some((p) => p.id === id)) continue;
    const min = Number.isInteger(q?.minutes) ? Math.max(5, Math.min(30, Math.round(q.minutes / 5) * 5)) : 10;
    people.push({ id, name: m ? m.name : who, min, said: clean(q?.said, 48) });
  }
  const start = parse(P.start, 420);
  const end = Math.max(start + 30, parse(P.end, 525));
  return { title: clean(P.title, 30) || "Shower queue", sub: clean(P.sub, 60), start, end, people, prev: people.map((p) => p.id), at: 0, cur: -1, inAt: 0 };
}

function reduceS(s: State, a: Action, meta: Meta, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u)) return s;
  const i = s.people.findIndex((p) => p.id === u);
  if (a.t === "move") {
    if (i < 0 || s.cur >= 0 || typeof a.to !== "number" || !Number.isInteger(a.to) || a.to < 0 || a.to >= s.people.length || a.to === i) return s;
    const rest = s.people.filter((p) => p.id !== u);
    const people = [...rest.slice(0, a.to), s.people[i]!, ...rest.slice(a.to)];
    return { ...s, people, prev: s.people.map((p) => p.id), at: meta.time };
  }
  if (a.t === "len") {
    if (i < 0 || s.cur >= 0 || !LENS.includes(a.min as number) || s.people[i]!.min === a.min) return s;
    return { ...s, people: s.people.map((p) => (p.id === u ? { ...p, min: a.min } : p)) };
  }
  if (a.t === "join") {
    if (i >= 0 || s.people.length >= 6 || s.cur >= 0) return s;
    const name = ctx.members.find((m) => m.id === u)?.name ?? "";
    return { ...s, people: [...s.people, { id: u, name, min: 10, said: "" }], prev: s.people.map((p) => p.id), at: meta.time };
  }
  if (a.t === "next") {
    if (!s.people.length || done(s)) return s;
    // The morning starts with anyone's tap; after that only whoever is in can say they're out.
    if (s.cur >= 0 && s.people[s.cur]!.id !== u && inChat(ctx, s.people[s.cur]!.id)) return s;
    return { ...s, cur: s.cur + 1, inAt: meta.time };
  }
  if (a.t === "reset") {
    if (!done(s)) return s;
    return { ...s, cur: -1, inAt: 0 };
  }
  return s;
}

function drawHall(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, members: readonly Member[], ctx: Ctx, drag: { on: boolean; dx: number }) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const W = f.width;
  const now = f.now;
  const dark = t.mode === "dark";
  const nameOf = (x: Person) => members.find((m) => m.id === x.id)?.name ?? x.name;
  // hallway wall and floor
  const wall = dark ? mix(c.card, p.blue, 0.12) : mix(p.sky, c.card, 0.35);
  g.fillStyle = wall;
  g.beginPath();
  g.roundRect(0, 0, W, 150, 12);
  g.fill();
  g.fillStyle = dark ? mix(c.card, p.crust, 0.25) : mix(p.crust, c.card, 0.45);
  g.fillRect(0, 128, W, 22);
  // the door
  const dw = 74;
  const dx = W - dw - 18;
  const occupied = s.cur >= 0 && !done(s);
  g.fillStyle = dark ? mix(p.brown, c.card, 0.3) : mix(p.crust, c.text, 0.18);
  g.fillRect(dx - 5, 12, dw + 10, 120);
  g.fillStyle = dark ? mix(p.crust, c.card, 0.4) : mix(p.crust, c.card, 0.15);
  g.fillRect(dx, 17, dw, 115);
  g.fillStyle = mix(p.crust, c.text, 0.35);
  g.beginPath();
  g.arc(dx + 12, 80, 4, 0, Math.PI * 2);
  g.fill();
  // light under the door when someone's in
  if (occupied) {
    g.fillStyle = p.yellow;
    g.fillRect(dx + 2, 129, dw - 4, 3);
  }
  // the sign
  g.fillStyle = occupied ? c.negative : c.positive;
  g.beginPath();
  g.roundRect(dx + 10, 28, dw - 20, 18, 9);
  g.fill();
  g.fillStyle = c.onPrimary;
  g.font = `700 10px ${t.type.family}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(occupied ? "IN USE" : done(s) ? "ALL DONE" : "FREE", dx + dw / 2, 37.5);
  let busy = false;
  if (occupied) {
    const inside = s.people[s.cur]!;
    // their face on the door, and steam curling out
    g.beginPath();
    g.arc(dx + dw / 2, 66, 14, 0, Math.PI * 2);
    g.fillStyle = inChat(ctx, inside.id) ? userColor(inside.id, t) : c.secondaryButton;
    g.fill();
    g.fillStyle = c.onPrimary;
    g.font = `700 13px ${t.type.family}`;
    g.fillText((nameOf(inside)[0] ?? "?").toUpperCase(), dx + dw / 2, 66.5);
    g.strokeStyle = mix(c.secondaryText, wall, 0.4);
    g.lineWidth = 2.5;
    g.lineCap = "round";
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const ph = now / 400 + k * 1.3;
      const x0 = dx + 16 + k * 20;
      g.moveTo(x0, 12);
      g.bezierCurveTo(x0 + 5 * Math.sin(ph), 8, x0 - 5 * Math.sin(ph), 5, x0 + 3 * Math.sin(ph + 1), 1);
    }
    g.stroke();
    g.lineCap = "butt";
    busy = true;
  }
  // a wall clock showing whose turn it is
  const tNow = s.cur >= 0 && !done(s) ? startOf(s, s.cur) : s.start;
  const ccx = 30;
  const ccy = 34;
  g.fillStyle = c.card;
  g.beginPath();
  g.arc(ccx, ccy, 17, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = c.divider;
  g.lineWidth = 2;
  g.stroke();
  g.strokeStyle = c.text;
  g.lineCap = "round";
  g.beginPath();
  const ha = -Math.PI / 2 + ((tNow / 60) % 12) / 12 * Math.PI * 2;
  const ma = -Math.PI / 2 + (tNow % 60) / 60 * Math.PI * 2;
  g.moveTo(ccx, ccy);
  g.lineTo(ccx + Math.cos(ha) * 8, ccy + Math.sin(ha) * 8);
  g.moveTo(ccx, ccy);
  g.lineTo(ccx + Math.cos(ma) * 12, ccy + Math.sin(ma) * 12);
  g.stroke();
  g.lineCap = "butt";
  // the line in the hall, nearest the door first
  const waiting = s.people.map((x, i) => ({ x, i })).filter(({ i }) => i > s.cur);
  const gap = Math.min(54, (dx - 24) / Math.max(1, waiting.length));
  waiting.forEach(({ x, i }, k) => {
    const px = dx - 30 - k * gap;
    const py = 96;
    const col = inChat(ctx, x.id) ? userColor(x.id, t) : c.secondaryText;
    const tap = Math.sin(now / 300 + i) * (k === 0 && occupied ? 1.5 : 0);
    // body
    g.fillStyle = mix(col, c.card, 0.35);
    g.beginPath();
    g.roundRect(px - 13, py + tap, 26, 34, [12, 12, 4, 4]);
    g.fill();
    // towel over the shoulder
    g.fillStyle = dark ? c.text : c.card;
    g.beginPath();
    g.roundRect(px + 2, py + 2 + tap, 8, 26, 3);
    g.fill();
    // head
    g.beginPath();
    g.arc(px, py - 12 + tap, 13, 0, Math.PI * 2);
    g.fillStyle = col;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = x.id === me ? c.primary : wall;
    g.stroke();
    g.fillStyle = c.onPrimary;
    g.font = `700 12px ${t.type.family}`;
    g.fillText((nameOf(x)[0] ?? "?").toUpperCase(), px, py - 11.5 + tap);
    if (x.said && k < 3 && !occupied && i === s.people.findIndex((q) => q.said)) {
      const b = fitText(`“${x.said}”`, Math.min(170, dx - 20), { g, size: 12, min: 10, weight: 500 });
      g.font = b.font;
      const tw = g.measureText(b.text).width + 14;
      const bx = Math.max(54, Math.min(px - tw / 2, dx - tw - 4));
      g.fillStyle = c.card;
      g.beginPath();
      g.roundRect(bx, 18, tw, 22, 11);
      g.fill();
      g.fillStyle = c.text;
      g.fillText(b.text, bx + tw / 2, 29.5);
    }
  });
  if (occupied) busy = true;

  // the morning timeline
  const x0 = 12;
  const x1 = W - 12;
  const span = Math.max(s.end - s.start, total(s));
  const X = (m: number) => x0 + ((m - s.start) / span) * (x1 - x0);
  g.fillStyle = c.wash;
  g.beginPath();
  g.roundRect(x0, TL_Y, x1 - x0, TL_H, 8);
  g.fill();
  const shuffle = s.at ? now - s.at : 9999;
  const q = shuffle >= 0 && shuffle < 450 ? ease(shuffle) : 1;
  if (q < 1) busy = true;
  s.people.forEach((x, i) => {
    const pi = s.prev.indexOf(x.id);
    const fromStart = pi >= 0 ? s.start + s.prev.slice(0, pi).reduce((n, id) => n + (s.people.find((y) => y.id === id)?.min ?? 0), 0) : startOf(s, i);
    const st = fromStart + (startOf(s, i) - fromStart) * q;
    let bx = X(st);
    const bw = X(st + x.min) - bx;
    if (x.id === me && drag.on) bx += drag.dx;
    const col = inChat(ctx, x.id) ? userColor(x.id, t) : c.secondaryText;
    const past = i < s.cur;
    const late = startOf(s, i) + x.min > s.end;
    g.fillStyle = past ? mix(col, c.wash, 0.7) : late ? mix(c.negative, c.card, 0.2) : col;
    g.beginPath();
    g.roundRect(bx + 1, TL_Y + (x.id === me && drag.on ? -4 : 0), bw - 2, TL_H, 6);
    g.fill();
    if (x.id === me) {
      g.strokeStyle = c.primary;
      g.lineWidth = 2;
      g.stroke();
    }
    if (i === s.cur && !done(s)) {
      g.strokeStyle = c.text;
      g.lineWidth = 2;
      g.setLineDash([3, 2]);
      g.stroke();
      g.setLineDash([]);
    }
    const lab = fitText(bw > 64 ? `${first(nameOf(x))} ${x.min}m` : bw > 40 ? `${(nameOf(x)[0] ?? "").toUpperCase()} ${x.min}m` : bw > 26 ? `${x.min}m` : "", bw - 8, { g, size: 12, min: 9, weight: 600 });
    g.font = lab.font;
    g.fillStyle = past ? c.secondaryText : c.onPrimary;
    g.textAlign = "center";
    g.fillText(lab.text, bx + bw / 2, TL_Y + TL_H / 2 + 0.5 + (x.id === me && drag.on ? -4 : 0));
  });
  // ticks: start, the deadline, and the end of the line
  g.font = `500 11px ${t.type.family}`;
  g.fillStyle = c.secondaryText;
  g.textAlign = "left";
  g.fillText(clock(s.start), x0, TL_Y + TL_H + 12);
  const ex = X(s.end);
  g.strokeStyle = c.negative;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(ex, TL_Y - 6);
  g.lineTo(ex, TL_Y + TL_H + 4);
  g.stroke();
  g.fillStyle = c.negative;
  g.textAlign = "right";
  g.fillText(`out by ${clock(s.end)}`, Math.min(x1, ex + 2), TL_Y + TL_H + 12);
  const fin = s.start + total(s);
  if (fin < s.end - 15) {
    g.fillStyle = c.secondaryText;
    g.textAlign = "center";
    g.fillText(clock(fin), X(fin), TL_Y + TL_H + 12);
  }
  return busy;
}

export default defineApp<State, Action, Local>({
  name: "Shower queue",
  summary: (s) => {
    if (done(s)) return `${s.title}: everyone's out`;
    if (s.cur >= 0) return `${s.title}: ${first(s.people[s.cur]!.name || "someone")} is in · ${s.people.length - s.cur - 1} waiting`;
    return `${s.title}: ${s.people.length} in line · done by ${clock(s.start + total(s))}`;
  },
  init: initState,
  reduce: reduceS,

  invariants: {
    "one slot each": (s) => new Set(s.people.map((p) => p.id)).size === s.people.length && s.people.length <= 6,
    "lengths are 5 to 30 minutes in fives": (s) => s.people.every((p) => Number.isInteger(p.min) && p.min >= 5 && p.min <= 30 && p.min % 5 === 0),
    "whoever's in is in the line": (s) => Number.isInteger(s.cur) && s.cur >= -1 && s.cur <= s.people.length,
    "the morning window is real": (s) => Number.isInteger(s.start) && Number.isInteger(s.end) && s.end > s.start,
  },

  transitions: {
    "moving reorders only you": (p, n, a, m) => {
      if (a.t !== "move" || p === n) return true;
      const before = p.people.filter((x) => x.id !== m.user).map((x) => x.id).join();
      const after = n.people.filter((x) => x.id !== m.user).map((x) => x.id).join();
      return before === after && n.people[a.to]?.id === m.user && n.people.length === p.people.length && n.at === m.time && p.cur === -1;
    },
    "a fair move happens": (p, n, a, m, ctx) => {
      if (a.t !== "move" || !inChat(ctx, m.user) || p.cur >= 0) return true;
      const i = p.people.findIndex((x) => x.id === m.user);
      return i < 0 || !Number.isInteger(a.to) || a.to < 0 || a.to >= p.people.length || a.to === i || n.people[a.to]?.id === m.user;
    },
    "length changes only yours": (p, n, a, m) => a.t !== "len" || p === n || (n.people.find((x) => x.id === m.user)?.min === a.min && n.people.filter((x) => x.id !== m.user).every((x, k) => JSON.stringify(x) === JSON.stringify(p.people.filter((y) => y.id !== m.user)[k]))),
    "the line moves one at a time": (p, n, a, m) => a.t !== "next" || p === n || (n.cur === p.cur + 1 && n.inAt === m.time),
    "only whoever's in can say they're out": (p, n, a, m, ctx) => a.t !== "next" || p === n || p.cur === -1 || p.people[p.cur]!.id === m.user || !inChat(ctx, p.people[p.cur]!.id),
    "the order holds once the morning starts": (p, n, a) => p.cur < 0 || a.t === "reset" || p.people.map((x) => x.id).join() === n.people.map((x) => x.id).join(),
    "joining adds you at the end": (p, n, a, m) => a.t !== "join" || p === n || (n.people.length === p.people.length + 1 && n.people[n.people.length - 1]!.id === m.user),
    "a new morning only after everyone's out": (p, n, a) => a.t !== "reset" || p === n || (done(p) && n.cur === -1),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const inLine = s.people.some((p) => p.id === user);
    if (done(s)) return r.next() < 0.7 ? { t: "reset" } : { t: "next" };
    if (!inLine && s.cur < 0 && r.next() < 0.5) return { t: "join" };
    const x = r.next();
    if (s.cur >= 0 || x < 0.25) return { t: "next" };
    if (x < 0.7) return { t: "move", to: r.int(Math.max(1, s.people.length)) };
    return { t: "len", min: r.pick(LENS) };
  },

  local: { drag: false, dx: 0, x0: 0, toast: 0, msg: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const ctx: Ctx = { room: "", members };
    const W = theme.width - 2 * theme.space.card;
    const mi = state.people.findIndex((p) => p.id === me);
    const nm = (i: number) => {
      const x = state.people[i];
      return x ? (x.id === me ? "You" : first(members.find((m) => m.id === x.id)?.name ?? x.name)) : "";
    };
    const span = Math.max(state.end - state.start, total(state));
    const X = (m: number) => 12 + ((m - state.start) / span) * (W - 24);

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (mi < 0 || state.cur >= 0) return;
      const bx = X(startOf(state, mi));
      const bw = X(startOf(state, mi) + state.people[mi]!.min) - bx;
      if (e.type === "down") {
        if (e.y >= TL_Y - 10 && e.y <= TL_Y + TL_H + 10 && e.x >= bx - 6 && e.x <= bx + bw + 6) setLocal({ drag: true, x0: e.x, dx: 0 });
        return;
      }
      if (!local.drag) return;
      if (e.type === "move") {
        setLocal({ dx: e.x - local.x0 });
        return;
      }
      const moved = Math.abs(e.x - local.x0);
      setLocal({ drag: false, dx: 0 });
      if (moved < 6) {
        // a tap: next length
        const k = (LENS.indexOf(state.people[mi]!.min) + 1) % LENS.length;
        dispatch({ t: "len", min: LENS[k]! });
        setLocal({ drag: false, dx: 0, toast: local.toast + 1, msg: `Your shower: ${LENS[k]} min` });
        return;
      }
      const center = bx + bw / 2 + (e.x - local.x0);
      let to = 0;
      state.people.forEach((x, i) => {
        if (i === mi) return;
        const mid = X(startOf(state, i) + x.min / 2);
        if (center > mid) to++;
      });
      if (to !== mi) {
        haptic("medium");
        dispatch({ t: "move", to });
        setLocal({ drag: false, dx: 0, toast: local.toast + 1, msg: `You're ${to === 0 ? "first" : `number ${to + 1}`} · in at ${clock(startOf({ ...state, people: [...state.people.filter((p) => p.id !== me).slice(0, to), state.people[mi]!] }, to))}` });
      }
    };

    let line: string;
    let action = null;
    if (done(state)) {
      line = "Everyone's out · bathroom's free";
      action = <Button kind="secondary" onClick={() => dispatch({ t: "reset" })}>New morning</Button>;
    } else if (state.cur >= 0) {
      const inside = state.people[state.cur]!;
      const next = state.cur + 1 < state.people.length ? nm(state.cur + 1) : "";
      line = inside.id === me ? (next ? `${next}'s up after you` : "You're last") : `${nm(state.cur)} is in${next ? ` · ${next === "You" ? "you're" : `${next}'s`} next` : ""}`;
      if (inside.id === me || !inChat(ctx, inside.id))
        action = (
          <Button kind="primary" onClick={() => { haptic("success"); dispatch({ t: "next" }); setLocal({ toast: local.toast + 1, msg: next ? `Told ${next} they're up` : "Bathroom's free" }); }}>
            {inside.id === me ? "I'm out" : "Next up"}
          </Button>
        );
    } else {
      const fin = state.start + total(state);
      line = mi >= 0 ? `In at ${clock(startOf(state, mi))} · drag or tap your slot` : `${state.people.length} in line · done by ${clock(fin)}`;
      action =
        mi < 0 ? (
          <Button kind="primary" onClick={() => dispatch({ t: "join" })}>Get in line</Button>
        ) : (
          <Button kind="primary" onClick={() => { haptic("light"); dispatch({ t: "next" }); setLocal({ toast: local.toast + 1, msg: nm(0) === "You" ? "You are up" : `${nm(0)} is up` }); }}>
            Start morning
          </Button>
        );
    }

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub || `Out by ${clock(state.end)}`} />
        <Canvas
          height={H}
          drag
          label={`Bathroom line: ${state.people.map((p, i) => `${nm(i)} ${clock(startOf(state, i))} for ${p.min} minutes`).join(", ")}`}
          draw={(g, f) => drawHall(g, f, state, me, members, ctx, { on: local.drag, dx: local.dx })}
          onPointer={onPointer}
        />
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
          {action}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
