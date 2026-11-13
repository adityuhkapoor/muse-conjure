import { defineApp, Avatar, Burst, Button, Canvas, CardHeader, fitText, haptic, mix, pal, running, spring, springs, type Ctx, type DrawFrame } from "@muse/app";

// Date forecast: a weather dial from storm to sunshine for a friend's first date. Everyone except
// the person on the date taps the dial to set a forecast and their face lands on the arc. Afterwards
// she sets the real weather with one tap: the needle swings over and the faces near it called it.
// Kind by design, and she can hide the whole thing any time.

type Params = {
  /** Card title */
  title: string;
  /** Whose date it is */
  who: string;
  /** Where and when, as the chat said it: "Kettle & Crumb at 4" */
  plan: string;
  /** When she'll call it: "6" */
  callAt: string;
  /** Forecasts already in: who, where on the dial (0 stormy to 100 sunny), and what they said */
  forecasts: { who: string; value: number; said?: string }[];
};

// @params
const P: Params = {
  title: "Date forecast",
  who: "Maya",
  plan: "Kettle & Crumb at 4",
  callAt: "6",
  forecasts: [
    { who: "Tsai Lin", value: 88, said: "kettle & crumb is a green flag" },
    { who: "Calvin", value: 74, said: "she's been smiling at her phone all day" },
    { who: "Arun", value: 55 },
    { who: "Will", value: 38, said: "first dates are always a little weird" },
  ],
};
// @end params

type Cast = { u: string; value: number; said: string; at: number };
type State = { title: string; subject: string; subjectName: string; plan: string; callAt: string; forecasts: Cast[]; actual: number; actualAt: number; hidden: boolean };
type Action = { t: "cast"; value: number } | { t: "call"; value: number } | { t: "hide" };
type Local = { bursts: number };

const H = 196;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okVal = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100;
const zone = (v: number) => (v < 34 ? 0 : v < 67 ? 1 : 2);
const ZONES = ["Stormy", "Partly cloudy", "Sunny"];
const SUBS = ["not the one", "maybe", "second date"];
const called = (s: State, f: Cast) => s.actual >= 0 && Math.abs(f.value - s.actual) <= 15;
const swing = spring({ ...springs.iosBouncy });

function initState(ctx: Ctx): State {
  const find = (who: unknown) => {
    const n = clean(who, 40).toLowerCase();
    return n ? ctx.members.find((m) => m.id === n || m.name.toLowerCase() === n) : undefined;
  };
  const sub = find(P.who);
  const subject = sub?.id ?? "";
  const forecasts: Cast[] = [];
  for (const f of Array.isArray(P.forecasts) ? P.forecasts : []) {
    const m = find(f?.who);
    if (!m || m.id === subject || !okVal(f.value) || forecasts.some((x) => x.u === m.id)) continue;
    forecasts.push({ u: m.id, value: f.value, said: clean(f.said, 60), at: 0 });
  }
  return { title: clean(P.title, 40) || "Date forecast", subject, subjectName: sub?.name ?? clean(P.who, 20), plan: clean(P.plan, 40), callAt: clean(P.callAt, 12), forecasts, actual: -1, actualAt: 0, hidden: false };
}

function sun(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) {
  g.fillStyle = c;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = c;
  g.lineWidth = 2;
  g.lineCap = "round";
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    g.moveTo(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3));
    g.lineTo(x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7));
  }
  g.stroke();
}
function cloud(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  g.fillStyle = c;
  g.beginPath();
  g.arc(x - 8 * s, y, 7 * s, 0, Math.PI * 2);
  g.arc(x, y - 5 * s, 9 * s, 0, Math.PI * 2);
  g.arc(x + 9 * s, y, 7 * s, 0, Math.PI * 2);
  g.roundRect(x - 15 * s, y - 2 * s, 31 * s, 9 * s, 4 * s);
  g.fill();
}

export default defineApp<State, Action, Local>({
  name: "Date forecast",
  summary: (s) => {
    if (s.hidden) return `${s.subjectName} hid the forecast`;
    if (s.actual >= 0) return `${s.subjectName}'s date: ${ZONES[zone(s.actual)]!.toLowerCase()} · ${s.forecasts.filter((f) => called(s, f)).length} called it`;
    return `${s.subjectName}'s date forecast · ${s.forecasts.length} in`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "hide") {
      if (u !== s.subject) return s;
      return { ...s, hidden: !s.hidden };
    }
    if (a.t === "cast") {
      if (u === s.subject || s.actual >= 0 || s.hidden || !okVal(a.value)) return s;
      const old = s.forecasts.find((f) => f.u === u);
      const said = old?.said ?? "";
      return { ...s, forecasts: [...s.forecasts.filter((f) => f.u !== u), { u, value: a.value, said, at: meta.time }] };
    }
    if (a.t === "call") {
      if (u !== s.subject || s.actual >= 0 || !okVal(a.value)) return s;
      return { ...s, actual: a.value, actualAt: meta.time };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const forecasts = s.forecasts.filter((f) => inChat(ctx, f.u) || s.actual >= 0);
    return forecasts.length === s.forecasts.length ? s : { ...s, forecasts };
  },

  invariants: {
    "one forecast each, on the dial": (s) => new Set(s.forecasts.map((f) => f.u)).size === s.forecasts.length && s.forecasts.every((f) => okVal(f.value)),
    "she doesn't forecast her own date": (s) => s.forecasts.every((f) => f.u !== s.subject),
    "the real weather is set once, with a time": (s) => (s.actual === -1 ? s.actualAt === 0 : okVal(s.actual) && s.actualAt > 0),
    "forecasters are in the chat until it's called": (s, ctx) => s.actual >= 0 || s.forecasts.every((f) => inChat(ctx, f.u)),
  },

  transitions: {
    "hide flips the curtain for her": (p, n, a, m, ctx) => a.t !== "hide" || m.user !== p.subject || !inChat(ctx, m.user) || n.hidden === !p.hidden,
    "a forecast moves only yours": (p, n, a, m) =>
      a.t !== "cast" || p === n || (n.forecasts.find((f) => f.u === m.user)?.value === a.value && n.forecasts.filter((f) => f.u !== m.user).length === p.forecasts.filter((f) => f.u !== m.user).length && m.user !== p.subject),
    "forecasts lock once she calls it": (p, n) => p.actual < 0 || JSON.stringify(p.forecasts) === JSON.stringify(n.forecasts),
    "only she sets the weather, once": (p, n, a, m) => n.actual === p.actual || (a.t === "call" && m.user === p.subject && p.actual === -1 && n.actualAt === m.time),
    "only she hides it": (p, n, _a, m) => n.hidden === p.hidden || m.user === p.subject,
    "hidden means no new forecasts": (p, n, a) => a.t !== "cast" || !p.hidden || p === n,
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    const k = r.next();
    if (u === s.subject) return k < 0.6 ? { t: "call", value: r.int(101) } : { t: "hide" };
    if (k < 0.85) return { t: "cast", value: r.int(101) };
    return k < 0.93 ? { t: "hide" } : { t: "call", value: r.int(101) };
  },

  local: { bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const isHer = me === state.subject;
    const done = state.actual >= 0;
    const mine = state.forecasts.find((f) => f.u === me);
    const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
    const nameOf = (u: string) => (u === me ? "You" : members.find((m) => m.id === u)?.name ?? "Someone");
    const cx = W / 2;
    const cy = H - 24;
    const R = Math.min(W / 2 - 40, 124);
    const angOf = (v: number) => Math.PI + (v / 100) * Math.PI;
    const ptOf = (v: number, r: number) => ({ x: cx + r * Math.cos(angOf(v)), y: cy + r * Math.sin(angOf(v)) });
    const e = done ? running(state.actualAt, 1400) : null;
    const needleV = done ? 50 + (state.actual - 50) * (e === null ? 1 : swing(e)) : -1;

    if (state.hidden && !isHer) {
      return (
        <div>
          <CardHeader title={state.title} subtitle={`${state.subjectName} hid this one`} />
          <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, background: c.wash, color: c.secondaryText, fontSize: 15 }}>Forecast hidden · no peeking</div>
        </div>
      );
    }

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      // three bands of the arc
      const bands = [mix(pl.purple, c.card, 0.55), mix(pl.sky, c.card, 0.1), mix(pl.yellow, c.card, 0.45)];
      for (let i = 0; i < 3; i++) {
        g.fillStyle = bands[i]!;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, R, angOf((i * 100) / 3), angOf(((i + 1) * 100) / 3));
        g.closePath();
        g.fill();
      }
      g.fillStyle = c.card;
      g.beginPath();
      g.arc(cx, cy, R * 0.52, Math.PI, 0);
      g.closePath();
      g.fill();
      // weather icons in each band
      const ic = (v: number) => ptOf(v, R * 0.77);
      const a = ic(16);
      cloud(g, a.x, a.y, 0.9, mix(pl.purple, c.text, 0.35));
      g.fillStyle = pl.yellow;
      g.beginPath();
      g.moveTo(a.x + 1, a.y + 6);
      g.lineTo(a.x - 5, a.y + 15);
      g.lineTo(a.x, a.y + 15);
      g.lineTo(a.x - 3, a.y + 23);
      g.lineTo(a.x + 6, a.y + 12);
      g.lineTo(a.x + 1, a.y + 12);
      g.closePath();
      g.fill();
      const b = ic(50);
      sun(g, b.x + 7, b.y - 6, 7, pl.yellow);
      cloud(g, b.x - 2, b.y + 3, 0.85, mix(c.card, pl.sky, 0.2));
      const d = ic(84);
      sun(g, d.x, d.y, 9 + Math.sin(f.now / 400), pl.orange);
      // ticks
      g.strokeStyle = c.card;
      g.lineWidth = 3;
      g.beginPath();
      for (const v of [100 / 3, 200 / 3]) {
        const p0 = ptOf(v, R * 0.52);
        const p1 = ptOf(v, R + 1);
        g.moveTo(p0.x, p0.y);
        g.lineTo(p1.x, p1.y);
      }
      g.stroke();
      // needle
      if (done) {
        const tip = ptOf(needleV, R - 6);
        g.strokeStyle = c.text;
        g.lineWidth = 4;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(tip.x, tip.y);
        g.stroke();
      }
      g.fillStyle = c.text;
      g.beginPath();
      g.arc(cx, cy, 7, 0, Math.PI * 2);
      g.fill();
      // verdict in the middle
      const label = done ? ZONES[zone(state.actual)]! : `${state.forecasts.length} ${state.forecasts.length === 1 ? "forecast" : "forecasts"}`;
      const lf = fitText(label, R * 0.95, { g, size: 15, weight: 700 });
      g.font = lf.font;
      g.textAlign = "center";
      g.textBaseline = "alphabetic";
      g.fillStyle = c.text;
      g.fillText(lf.text, cx, cy - 16);
      return e !== null || true;
    };

    const onPointer = (ev: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (ev.type !== "down" || done || state.hidden) return;
      const dx = ev.x - cx;
      const dy = ev.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dy > 8 || dist < R * 0.3 || dist > R + 26) return;
      const ang = Math.atan2(Math.min(0, dy), dx);
      const v = Math.max(0, Math.min(100, Math.round(((ang < 0 ? ang + 2 * Math.PI : ang) - Math.PI) / Math.PI * 100)));
      haptic("light");
      if (isHer) return;
      setLocal({ bursts: local.bursts });
      dispatch({ t: "cast", value: v });
    };

    const placed: { x: number; y: number }[] = [];
    const spots = new Map<string, { x: number; y: number }>();
    for (const f of [...state.forecasts].sort((a, b) => a.value - b.value)) {
      let p = ptOf(f.value, R + 16);
      for (let k = 1; k < 3 && placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 27); k++) p = ptOf(f.value, R + 16 - k * 30);
      placed.push(p);
      spots.set(f.u, p);
    }
    const faces = state.forecasts.map((f) => {
      const p = spots.get(f.u)!;
      const hit = called(state, f);
      return (
        <div key={f.u} style={{ position: "absolute", left: p.x - 14, top: p.y - 14, display: "flex", borderRadius: 99, pointerEvents: "none", boxShadow: hit ? `0 0 0 3px ${c.positive}` : f.u === me ? `0 0 0 2px ${c.primary}` : `0 0 0 2px ${c.card}`, transition: "left 300ms, top 300ms" }}>
          <Avatar user={f.u} size={28} />
        </div>
      );
    });
    const quote = [...state.forecasts].reverse().find((f) => f.said);
    const hits = state.forecasts.filter((f) => called(state, f));

    return (
      <div>
        <CardHeader title={`${state.subjectName}'s ${state.title.toLowerCase().startsWith("date") ? "date forecast" : state.title}`} subtitle={`${state.plan}${state.callAt ? ` · ${isHer ? "you call" : `${state.subjectName} calls`} it at ${state.callAt}` : ""}`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={done ? `Weather dial set to ${ZONES[zone(state.actual)]}, ${hits.length} called it` : `Weather dial with ${state.forecasts.length} forecasts`} draw={draw} onPointer={onPointer} />
          {faces}
          {state.subject ? (
            <div style={{ position: "absolute", left: cx - 15, top: cy - 54 - 30, display: "flex", pointerEvents: "none", opacity: done ? 0 : 1 }}>
              <Avatar user={state.subject} size={30} />
            </div>
          ) : null}
          {local.bursts > 0 && done && isHer ? <Burst key={local.bursts} emoji="☀️" /> : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, lineHeight: "16px", color: c.secondaryText, marginTop: 2 }}>
          {ZONES.map((z, i) => (
            <span key={z} style={{ flex: 1, textAlign: i === 0 ? "left" : i === 1 ? "center" : "right", color: done && zone(state.actual) === i ? c.text : c.secondaryText }}>
              <span style={{ display: "block", fontWeight: 600 }}>{z}</span>
              <span style={{ display: "block" }}>{SUBS[i]}</span>
            </span>
          ))}
        </div>
        <div style={{ marginTop: 8, minHeight: 20, fontSize: 13, lineHeight: "18px", color: c.text, ...ell }}>
          {done
            ? hits.length
              ? `${hits.map((f) => nameOf(f.u)).join(", ")} called it`
              : "Nobody saw that coming"
            : quote
              ? `${nameOf(quote.u)}: "${quote.said}"`
              : isHer
                ? "Your friends are forecasting. Be nice."
                : "Nobody has forecast yet · tap the dial"}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>
            {done ? `${state.subjectName} set it` : isHer ? "Tap the real weather when you're back" : mine ? `You said ${ZONES[zone(mine.value)]!.toLowerCase()} · tap to move` : "Tap the dial to forecast"}
          </span>
          {isHer ? (
            <>
              <Button kind="secondary" onClick={() => dispatch({ t: "hide" })}>
                {state.hidden ? "Show it" : "Hide"}
              </Button>
              {!done
                ? [0, 1, 2].map((z) => (
                    <Button
                      key={z}
                      kind={z === 2 ? "primary" : "deemphasized"}
                      onClick={() => {
                        haptic("success");
                        setLocal({ bursts: local.bursts + 1 });
                        dispatch({ t: "call", value: [12, 50, 88][z]! });
                      }}
                    >
                      {["Storm", "Cloudy", "Sunny"][z]}
                    </Button>
                  ))
                : null}
            </>
          ) : null}
        </div>
      </div>
    );
  },
});
