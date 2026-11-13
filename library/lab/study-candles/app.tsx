import { defineApp, Button, Canvas, CardHeader, Toast, fitText, haptic, mix, pal, running, userColor, type Ctx, type DrawFrame } from "@muse/app";

// Study candles: something ambient to leave open during finals week. A shelf with a candle for
// each friend. Light yours for as long as you plan to study and it burns down in real time; the
// room glows warmer the more candles are lit. Blow it out when you stop, or add wax to keep
// going. Burned-out candles leave a stub and a curl of smoke with how long they lasted.

type Params = {
  /** Card title */
  title: string;
  /** Under the title */
  sub: string;
  /** Friends' candles: who, how long they planned in minutes, minutes left now, what they're studying, done (blown out), and a line */
  candles: { who: string; mins: number; left: number; what?: string; done?: boolean; said?: string }[];
};

// @params
const P: Params = {
  title: "Study candles",
  sub: "the six · finals week",
  candles: [
    { who: "Maya", mins: 240, left: 150, what: "stats", said: "lit at 6. color-coded break at 8" },
    { who: "Calvin", mins: 180, left: 25, what: "orgo", said: "alarm 3 of 7 says break soon" },
    { who: "Tsai Lin", mins: 120, left: 95, what: "bio" },
    { who: "Arun", mins: 150, left: 0, what: "physics", done: true, said: "done. rice cooker break" },
  ],
};
// @end params

type Candle = { who: string; name: string; mins: number; left: number; at: number; what: string; out: number; said: string };
type State = { title: string; sub: string; candles: Candle[] };
type Action = { t: "light"; mins: number } | { t: "blow" } | { t: "more" };
type Local = { mins: number; toast: number; msg: string };

const CH = 206;
const MAX = 360;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);
/** Minutes of wax left at a server time. Seeded candles hold still at their story value. */
const leftAt = (c: Candle, now: number) => {
  if (c.out > 0 || c.mins === 0) return 0;
  if (!c.at) return c.left;
  return Math.max(0, c.mins - (now - c.at) / 60000);
};
const clockish = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : `${m}m`);
const lit = (c: Candle) => c.mins > 0 && c.out === 0 && (c.at > 0 || c.left > 0);

function initState(ctx: Ctx): State {
  const candles: Candle[] = [];
  for (const x of Array.isArray(P.candles) ? P.candles : []) {
    const nm = clean(x?.who, 20);
    if (!nm || candles.length >= 8) continue;
    const m = ctx.members.find((y) => y.id === nm || y.name.toLowerCase() === nm.toLowerCase());
    const who = m ? m.id : `~${nm}`;
    if (candles.some((c) => c.who === who)) continue;
    const mins = isInt(x.mins, 30, MAX) ? x.mins : 120;
    const left = x.done ? 0 : isInt(x.left, 0, mins) ? x.left : mins;
    candles.push({ who, name: m ? clean(m.name, 20) || nm : nm, mins, left, at: 0, what: clean(x.what, 16), out: x.done || left === 0 ? 1 : 0, said: clean(x.said, 60) });
  }
  for (const m of ctx.members) {
    if (candles.length >= 8 || candles.some((c) => c.who === m.id)) continue;
    candles.push({ who: m.id, name: clean(m.name, 20) || "Friend", mins: 0, left: 0, at: 0, what: "", out: 0, said: "" });
  }
  return { title: clean(P.title, 40) || "Study candles", sub: clean(P.sub, 60), candles };
}

function drawRoom(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string) {
  const t = f.theme;
  const c = t.color;
  const pl = pal(t);
  const W = f.width;
  const n = Math.max(1, s.candles.length);
  const burning = s.candles.filter((x) => leftAt(x, f.now) > 0).length;
  const warmth = Math.min(1, burning / Math.max(3, n * 0.7));
  // A dark room that warms up with every lit candle.
  g.beginPath();
  g.roundRect(0, 0, W, CH, 14);
  g.fillStyle = mix(mix(c.text, pl.blue, 0.25), mix(pl.orange, c.text, 0.55), warmth * 0.7);
  if (t.mode === "dark") g.fillStyle = mix(mix(c.wash, pl.blue, 0.12), mix(pl.orange, c.wash, 0.75), warmth * 0.8);
  g.fill();
  // A night window with a moon.
  g.fillStyle = t.mode === "dark" ? mix(pl.blue, c.wash, 0.6) : mix(pl.blue, c.text, 0.55);
  g.beginPath();
  g.roundRect(W - 86, 14, 66, 52, 4);
  g.fill();
  g.fillStyle = mix(pl.yellow, c.card, 0.4);
  g.beginPath();
  g.arc(W - 40, 32, 8, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = mix(pl.brown, c.text, 0.3);
  g.lineWidth = 3;
  g.strokeRect(W - 86, 14, 66, 52);
  g.beginPath();
  g.moveTo(W - 53, 14);
  g.lineTo(W - 53, 66);
  g.stroke();
  // The shelf.
  const shelfY = CH - 40;
  g.fillStyle = pl.brown;
  g.fillRect(8, shelfY, W - 16, 8);
  g.fillStyle = mix(pl.brown, c.text, 0.35);
  g.fillRect(8, shelfY + 8, W - 16, 3);

  const slot = (W - 24) / n;
  // Soft light first, so it sits behind the candles: stacked faint rings around each flame.
  s.candles.forEach((x, i) => {
    const left = leftAt(x, f.now);
    if (x.mins === 0 || left <= 0) return;
    const cx = 12 + slot * i + slot / 2;
    const y = shelfY - (10 + 116 * (left / MAX)) - 12;
    const r = 50 + 3 * Math.sin(f.now / 300 + i);
    g.fillStyle = pl.yellow;
    g.globalAlpha = 0.035;
    for (let k = 1; k <= 8; k++) {
      g.beginPath();
      g.arc(cx, y, (r * k) / 8, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  });
  s.candles.forEach((x, i) => {
    const cx = 12 + slot * i + slot / 2;
    const left = leftAt(x, f.now);
    const cw = Math.min(30, slot * 0.5);
    const col = userColor(x.who, t);
    const wax = mix(col, c.card, 0.45);
    if (x.mins === 0) {
      // Not lit yet: a dashed outline where their candle goes.
      g.setLineDash([3, 3]);
      g.strokeStyle = mix(c.card, c.text, 0.45);
      g.lineWidth = 1.5;
      g.strokeRect(cx - cw / 2, shelfY - 60, cw, 60);
      g.setLineDash([]);
    } else {
      const h = left > 0 ? 10 + 116 * (left / MAX) : 8;
      const top = shelfY - h;
      g.fillStyle = wax;
      g.beginPath();
      g.roundRect(cx - cw / 2, top, cw, h, [5, 5, 2, 2]);
      g.fill();
      // Drips down the side.
      g.fillStyle = mix(wax, c.card, 0.35);
      g.beginPath();
      g.roundRect(cx - cw / 2 + 3, top, 4, Math.min(h, 10 + (i % 3) * 6), 2);
      g.roundRect(cx + cw / 2 - 8, top, 4, Math.min(h, 6 + ((i + 1) % 3) * 5), 2);
      g.fill();
      // Wick.
      g.strokeStyle = mix(c.text, pl.brown, 0.3);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(cx, top);
      g.lineTo(cx, top - 5);
      g.stroke();
      if (left > 0) {
        const fl = 1 + 0.12 * Math.sin(f.now / 90 + i * 2) + 0.06 * Math.sin(f.now / 37 + i);
        g.fillStyle = pl.orange;
        g.beginPath();
        g.ellipse(cx, top - 13, 5 * fl, 10 * fl, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = pl.yellow;
        g.beginPath();
        g.ellipse(cx, top - 11, 2.6, 5.5 * fl, 0, 0, Math.PI * 2);
        g.fill();
      } else {
        // A curl of smoke over the stub.
        g.strokeStyle = mix(c.card, c.text, 0.4);
        g.lineWidth = 1.5;
        g.beginPath();
        const ph = f.now / 700 + i;
        g.moveTo(cx, top - 6);
        g.bezierCurveTo(cx + 6 * Math.sin(ph), top - 16, cx - 6 * Math.sin(ph), top - 26, cx + 3 * Math.sin(ph * 1.4), top - 36);
        g.stroke();
      }
    }
    // Name and time under the shelf.
    const nm = fitText(x.who === me ? "You" : first(x.name), slot - 4, { g, size: 11, min: 10, weight: 700 });
    g.font = nm.font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = t.mode === "dark" ? c.text : c.card;
    g.fillText(nm.text, cx, shelfY + 20);
    const sub = x.mins === 0 ? "not lit" : left > 0 ? `${clockish(Math.ceil(left))} left` : `done ${clockish(x.out > 0 && x.at ? Math.min(x.mins, Math.round((x.out - x.at) / 60000)) : x.mins - x.left)}`;
    const st = fitText(sub, slot - 4, { g, size: 10, min: 10, weight: 500 });
    g.font = st.font;
    g.fillStyle = t.mode === "dark" ? mix(c.text, c.wash, 0.2) : mix(c.card, c.text, 0.15);
    g.fillText(st.text, cx, shelfY + 32);
    if (x.what && x.mins > 0) {
      const w = fitText(x.what, Math.min(cw + 14, slot - 2), { g, size: 10, min: 10, weight: 700 });
      g.font = w.font;
      g.fillStyle = c.text;
      const label = w.text;
      const lw = Math.min(g.measureText(label).width + 8, slot - 2);
      g.fillStyle = mix(pl.cream, wax, 0.3);
      g.beginPath();
      g.roundRect(cx - lw / 2, shelfY - 18, lw, 13, 3);
      g.fill();
      g.fillStyle = c.text;
      if (t.mode === "dark") g.fillStyle = c.wash;
      g.fillText(label, cx, shelfY - 11);
    }
  });
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Study candles",
  summary: (s) => {
    const on = s.candles.filter(lit);
    return on.length ? `${s.title}: ${on.length} lit · ${on.map((c) => `${first(c.name)}${c.what ? ` (${c.what})` : ""}`).join(", ")}` : `${s.title}: every candle is out`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    const u = m.user;
    if (!inChat(ctx, u)) return s;
    const i = s.candles.findIndex((c) => c.who === u);
    if (i < 0) return s;
    const x = s.candles[i]!;
    const put = (y: Candle) => ({ ...s, candles: s.candles.map((c, k) => (k === i ? y : c)) });
    const burning = leftAt(x, m.time) > 0;
    if (a.t === "light") {
      if (!isInt(a.mins, 30, MAX) || a.mins % 30 !== 0 || burning) return s;
      return put({ ...x, mins: a.mins, left: a.mins, at: m.time, out: 0, said: "" });
    }
    if (a.t === "blow") {
      if (!burning) return s;
      return put({ ...x, out: x.at ? Math.max(m.time, x.at) : 1, left: x.at ? x.left : 0 });
    }
    if (a.t === "more") {
      if (!burning || x.mins + 30 > MAX) return s;
      return put({ ...x, mins: x.mins + 30, left: Math.min(MAX, x.left + 30) });
    }
    return s;
  },

  onMembers: (s, ctx) => {
    let candles = s.candles;
    for (const m of ctx.members) {
      if (candles.length >= 8 || candles.some((c) => c.who === m.id)) continue;
      candles = [...candles, { who: m.id, name: clean(m.name, 20) || "Friend", mins: 0, left: 0, at: 0, what: "", out: 0, said: "" }];
    }
    return candles === s.candles ? s : { ...s, candles };
  },

  invariants: {
    "one candle per person": (s) => new Set(s.candles.map((c) => c.who)).size === s.candles.length && s.candles.length <= 8,
    "wax is between none and six hours": (s) => s.candles.every((c) => isInt(c.mins, 0, MAX) && c.left >= 0 && c.left <= c.mins && (c.mins === 0 || c.mins >= 30)),
    "an unlit candle has no flame": (s) => s.candles.every((c) => c.mins > 0 || (c.at === 0 && c.out === 0 && c.left === 0)),
    "a blown-out candle went out after it was lit": (s) => s.candles.every((c) => c.out === 0 || c.out === 1 || c.out >= c.at),
  },

  transitions: {
    "lighting starts only your candle, now": (p, n, a, m) => {
      if (a.t !== "light" || p === n) return true;
      const c = n.candles.find((x) => x.who === m.user)!;
      return c.at === m.time && c.mins === a.mins && c.out === 0 && leftAt(p.candles.find((x) => x.who === m.user)!, m.time) === 0;
    },
    "blowing out stops your flame": (p, n, a, m) => a.t !== "blow" || p === n || leftAt(n.candles.find((x) => x.who === m.user)!, m.time) === 0,
    "more wax adds half an hour": (p, n, a, m) => a.t !== "more" || p === n || n.candles.find((x) => x.who === m.user)!.mins === p.candles.find((x) => x.who === m.user)!.mins + 30,
    "blowing out keeps the wax record": (p, n, a, m) => {
      if (a.t !== "blow" || p === n) return true;
      const was = p.candles.find((x) => x.who === m.user)!;
      const now = n.candles.find((x) => x.who === m.user)!;
      if (was.at === 0) return now.out === 1 && now.left === 0 && now.mins === was.mins;
      return now.at === was.at && now.mins === was.mins && now.left === was.left && now.out >= was.at && now.out > 1;
    },
    "more wax never relights or puts out": (p, n, a, m) => a.t !== "more" || p === n || (n.candles.find((x) => x.who === m.user)!.at === p.candles.find((x) => x.who === m.user)!.at && n.candles.find((x) => x.who === m.user)!.out === 0),
    "nothing else changes a candle": (p, n, a) => a.t === "light" || a.t === "blow" || a.t === "more" || p === n,
    "other candles are untouched": (p, n, _a, m) => n.candles.every((c) => c.who === m.user || JSON.stringify(c) === JSON.stringify(p.candles.find((x) => x.who === c.who))),
    "only the chat lights candles": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    const k = r.next();
    if (k < 0.45) return { t: "light", mins: 30 * (1 + r.int(8)) };
    if (k < 0.75) return { t: "more" };
    return { t: "blow" };
  },

  local: { mins: 120, toast: 0, msg: "" },

  view: ({ state: s, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const mine = s.candles.find((x) => x.who === me);
    const on = s.candles.filter(lit);
    // My candle's flame is a shared fact: lit and not blown out. Its wax runs on the clock in the picture.
    const burning = !!mine && mine.mins > 0 && mine.out === 0 && mine.at > 0 && running(mine.at, mine.mins * 60000) !== null;
    const quote = s.candles.find((x) => x.said);
    const mins = Math.max(30, Math.min(MAX, local.mins));
    const label = `A shelf of candles: ${s.candles.map((x) => `${x.name} ${x.mins === 0 ? "not lit" : lit(x) ? `burning${x.what ? ` for ${x.what}` : ""}` : "burned out"}`).join(", ")}`;
    return (
      <div>
        <CardHeader title={s.title} subtitle={`${s.sub}${s.sub ? " · " : ""}${on.length} lit`} />
        <Canvas height={CH} label={label} draw={(g, f) => drawRoom(g, f, s, me)} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 36, marginTop: 4, minWidth: 0 }}>
          {burning ? (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{`Your candle is burning · ${hm(mine!.mins)} of wax`}</span>
          ) : quote ? (
            <>
              <b style={{ fontSize: 13, lineHeight: "16px", color: c.text, flexShrink: 0 }}>{first(quote.name)}</b>
              <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>{`“${quote.said}”`}</span>
            </>
          ) : (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>Light a candle for as long as you plan to study</span>
          )}
        </div>
        {mine ? (
          burning ? (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Button kind="secondary" wide onClick={() => { haptic("light"); setLocal({ toast: local.toast + 1, msg: "Blown out. Nice session" }); dispatch({ t: "blow" }); }}>
                Blow it out
              </Button>
              <Button kind="primary" wide disabled={mine!.mins + 30 > MAX} onClick={() => { haptic("light"); dispatch({ t: "more" }); }}>
                Add 30 min
              </Button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Button kind="secondary" onClick={() => setLocal({ mins: Math.max(30, mins - 30) })}>
                Less
              </Button>
              <Button kind="primary" wide onClick={() => { haptic("success"); setLocal({ toast: local.toast + 1, msg: `Lit for ${hm(mins)}` }); dispatch({ t: "light", mins }); }}>
                {`Light for ${hm(mins)}`}
              </Button>
              <Button kind="secondary" onClick={() => setLocal({ mins: Math.min(MAX, mins + 30) })}>
                More
              </Button>
            </div>
          )
        ) : null}
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
