import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Week weather: Will's story on the Monday of finals asks everyone to rate their week. Each friend
// sets a weather for theirs, and the story becomes the group's forecast: one strip of sky per friend,
// sun to storm. Tap someone's storm and send them an umbrella, which is a coffee on you.

type Params = {
  /** Whose story: "Will" */
  author: string;
  /** How long ago: "3h" */
  ago: string;
  /** The prompt on the story */
  question: string;
  /** What an umbrella means: "a Kettle & Crumb coffee" */
  gift: string;
  /** Weather already set: 0 sunny, 1 sun and cloud, 2 cloudy, 3 rain, 4 storm, with a line */
  ratings: { who: string; weather: number; note?: string }[];
  /** Umbrellas already sent */
  umbrellas: { from: string; to: string }[];
};

// @params
const P: Params = {
  author: "Will",
  ago: "3h",
  question: "rate your week",
  gift: "a Kettle & Crumb coffee",
  ratings: [
    { who: "Will", weather: 3, note: "3 finals and the Sube needs an oil change" },
    { who: "Calvin", weather: 4, note: "slept through all 7 alarms. orgo at 9" },
    { who: "Arun", weather: 0, note: "rice cooker made breakfast, lunch and dinner" },
    { who: "Maya", weather: 1, note: "color-coded my panic" },
    { who: "Tsai Lin", weather: 2, note: "lost aux privileges at Fenwick" },
  ],
  umbrellas: [{ from: "Maya", to: "Calvin" }],
};
// @end params

type Rating = { w: number; note: string; at: number };
type Umb = { from: string; to: string; at: number };
type State = { author: string; ago: string; question: string; gift: string; ratings: Record<string, Rating>; umbrellas: Umb[] };
type Action = { t: "rate"; w: number } | { t: "umbrella"; to: string };
type Local = { sel: string; cheers: number };

const PANEL = 556;
const SKY_TOP = 160;
const SKY_H = 236;
const NAMES = ["Sunny", "Sun and clouds", "Cloudy", "Rain", "Storm"];
const FORECAST = ["Clear skies all week", "Mostly sunny", "Overcast", "Rain likely", "Scattered storms"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const findMember = (ctx: Ctx, name: string): Member | undefined => {
  const k = name.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k) : undefined;
};
const okW = (w: unknown): w is number => typeof w === "number" && Number.isInteger(w) && w >= 0 && w <= 4;

function initState(ctx: Ctx): State {
  const ratings: Record<string, Rating> = {};
  for (const r of Array.isArray(P.ratings) ? P.ratings : []) {
    const m = findMember(ctx, clean(r?.who, 20));
    if (!m || ratings[m.id] || !okW(r.weather)) continue;
    ratings[m.id] = { w: r.weather, note: clean(r.note, 60), at: 0 };
  }
  const umbrellas: Umb[] = [];
  for (const u of Array.isArray(P.umbrellas) ? P.umbrellas : []) {
    const a = findMember(ctx, clean(u?.from, 20));
    const b = findMember(ctx, clean(u?.to, 20));
    if (!a || !b || a.id === b.id || (ratings[b.id]?.w ?? 0) < 3 || umbrellas.some((x) => x.from === a.id && x.to === b.id)) continue;
    umbrellas.push({ from: a.id, to: b.id, at: 0 });
  }
  return { author: clean(P.author, 20), ago: clean(P.ago, 6), question: clean(P.question, 40) || "rate your week", gift: clean(P.gift, 40) || "a coffee", ratings, umbrellas };
}

const forecastOf = (s: State) => {
  const ws = Object.values(s.ratings).map((r) => r.w);
  if (!ws.length) return -1;
  return Math.round(ws.reduce((a, b) => a + b, 0) / ws.length);
};

// ---- Weather drawings --------------------------------------------------------------------------

type Pal = ReturnType<typeof pal>;
function skyFor(w: number, p: Pal): [string, string] {
  if (w === 0) return [mix(p.blue, p.sky, 0.35), p.sky];
  if (w === 1) return [mix(p.blue, p.sky, 0.55), mix(p.sky, p.paper, 0.3)];
  if (w === 2) return [mix(p.shade, p.blue, 0.25), mix(p.shade, p.paper, 0.3)];
  if (w === 3) return [mix(p.blue, p.dark, 0.45), mix(p.shade, p.blue, 0.3)];
  if (w === 4) return [mix(p.purple, p.dark, 0.7), mix(p.purple, p.dark, 0.35)];
  return [mix(p.dark, p.blue, 0.25), mix(p.dark, p.blue, 0.35)];
}
function cloud(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.moveTo(x - 18 * s, y + 8 * s);
  g.arc(x - 12 * s, y + 2 * s, 9 * s, Math.PI * 0.5, Math.PI * 1.5);
  g.arc(x - 2 * s, y - 6 * s, 12 * s, Math.PI, Math.PI * 1.9);
  g.arc(x + 12 * s, y + 1 * s, 9 * s, Math.PI * 1.3, Math.PI * 0.5);
  g.closePath();
}
function drawWeather(g: CanvasRenderingContext2D, w: number, x: number, y: number, s: number, t: number, i: number, p: Pal, fall = SKY_H * 0.55) {
  if (w === 0 || w === 1) {
    const sx = w === 0 ? x : x - 7 * s;
    const sy = w === 0 ? y : y - 6 * s;
    g.strokeStyle = p.yellow;
    g.lineWidth = 2.5 * s;
    g.lineCap = "round";
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = t * 0.6 + (k * Math.PI) / 4;
      g.moveTo(sx + 14 * s * Math.cos(a), sy + 14 * s * Math.sin(a));
      g.lineTo(sx + 19 * s * Math.cos(a), sy + 19 * s * Math.sin(a));
    }
    g.stroke();
    g.fillStyle = p.yellow;
    g.beginPath();
    g.arc(sx, sy, 10 * s, 0, Math.PI * 2);
    g.fill();
    if (w === 1) {
      g.fillStyle = p.paper;
      g.beginPath();
      cloud(g, x + 5 * s + 2 * Math.sin(t + i), y + 7 * s, 0.9 * s);
      g.fill();
    }
    return;
  }
  const drift = 3 * Math.sin(t * 0.8 + i);
  if (w === 2) {
    g.fillStyle = mix(p.paper, p.shade, 0.25);
    g.beginPath();
    cloud(g, x - 6 * s + drift, y - 6 * s, 0.75 * s);
    g.fill();
    g.fillStyle = p.paper;
    g.beginPath();
    cloud(g, x + 4 * s - drift, y + 4 * s, s);
    g.fill();
    return;
  }
  // Rain and storm: a heavy cloud, falling drops, and for a storm a bolt now and then.
  const ys = y + fall;
  g.strokeStyle = w === 4 ? mix(p.sky, p.paper, 0.4) : p.sky;
  g.lineWidth = 1.6 * s;
  g.lineCap = "round";
  g.beginPath();
  for (let k = 0; k < 7; k++) {
    const dx = -16 * s + ((k * 37) % 32) * s;
    const ph = (t * (w === 4 ? 1.6 : 1.1) + k * 0.37 + i * 0.21) % 1;
    const dy = y + 14 * s + ph * (ys - y);
    g.moveTo(x + dx - 2 * s, dy);
    g.lineTo(x + dx - 4 * s, dy + 7 * s);
  }
  g.stroke();
  g.fillStyle = w === 4 ? mix(p.shade, p.dark, 0.55) : mix(p.paper, p.shade, 0.45);
  g.beginPath();
  cloud(g, x + drift, y, 1.05 * s);
  g.fill();
  if (w === 4) {
    const flash = (t * 0.7 + i * 0.31) % 1 < 0.12;
    g.fillStyle = flash ? p.paper : p.yellow;
    g.beginPath();
    g.moveTo(x + 2 * s, y + 6 * s);
    g.lineTo(x - 6 * s, y + 22 * s);
    g.lineTo(x, y + 21 * s);
    g.lineTo(x - 4 * s, y + 34 * s);
    g.lineTo(x + 8 * s, y + 16 * s);
    g.lineTo(x + 2 * s, y + 17 * s);
    g.closePath();
    g.fill();
  }
}
function umbrella(g: CanvasRenderingContext2D, x: number, y: number, s: number, open: number, p: Pal) {
  g.strokeStyle = p.ink;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y + 18 * s);
  g.arc(x - 3 * s, y + 18 * s, 3 * s, 0, Math.PI);
  g.stroke();
  const r = 15 * s * open;
  if (r < 1) return;
  g.fillStyle = p.red;
  g.beginPath();
  g.moveTo(x - r, y);
  g.arc(x, y, r, Math.PI, 0);
  g.closePath();
  g.fill();
  g.fillStyle = p.paper;
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, r, Math.PI * 1.36, Math.PI * 1.64);
  g.closePath();
  g.fill();
}

type Col = { id: string; w: number };
function drawSky(g: CanvasRenderingContext2D, f: DrawFrame, cols: Col[], s: State, me: string, sel: string, theme: Theme): boolean {
  const p = pal(theme);
  const w = f.width;
  const t = f.now / 1000;
  const n = Math.max(1, cols.length);
  const cw = w / n;
  cols.forEach((c, i) => {
    const x0 = i * cw;
    const [top, bot] = skyFor(c.w, p);
    const gr = g.createLinearGradient(0, 0, 0, SKY_H);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bot);
    g.fillStyle = gr;
    g.fillRect(x0, 0, cw + 0.5, SKY_H);
  });
  // Rolling hills along the bottom, one shape across every column.
  g.fillStyle = p.grass;
  g.beginPath();
  g.moveTo(0, SKY_H);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, SKY_H - 58 + 7 * Math.sin(x / 37) + 4 * Math.sin(x / 13));
  g.lineTo(w, SKY_H);
  g.fill();
  g.fillStyle = p.leaf;
  g.beginPath();
  g.moveTo(0, SKY_H);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, SKY_H - 34 + 6 * Math.sin(x / 29 + 1));
  g.lineTo(w, SKY_H);
  g.fill();
  const sc = Math.min(1.1, cw / 58);
  cols.forEach((c, i) => {
    const cx = (i + 0.5) * cw;
    const at0 = s.ratings[c.id]?.at ?? 0;
    const fresh = at0 > 0 && f.now - at0 < 700 ? Math.max(0, f.now - at0) : null;
    const k = fresh === null ? 1 : 0.4 + 0.6 * Math.min(1, fresh / 500);
    if (c.w >= 0) drawWeather(g, c.w, cx, 54, sc * k, t, i, p);
    else {
      g.strokeStyle = p.paper;
      g.lineWidth = 1.5;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.arc(cx, 54, 20 * sc, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    const got = s.umbrellas.filter((u) => u.to === c.id);
    if (got.length) {
      const last = Math.max(...got.map((u) => u.at));
      const e = last > 0 && f.now - last < 900 ? Math.max(0, f.now - last) : null;
      const shown = Math.min(3, got.length);
      for (let k = 0; k < shown; k++) umbrella(g, cx + (k - (shown - 1) / 2) * 16 * sc, SKY_H - 96 - (k % 2) * 8, sc, k === shown - 1 && e !== null ? Math.min(1, e / 600) : 1, p);
    }
  });
  // Dividers and the selected column's outline.
  g.strokeStyle = mix(p.paper, p.dark, 0.2);
  g.globalAlpha = 0.35;
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < n; i++) {
    g.moveTo(i * cw, 0);
    g.lineTo(i * cw, SKY_H - 60);
  }
  g.stroke();
  g.globalAlpha = 1;
  const si = cols.findIndex((c) => c.id === sel);
  if (si >= 0) {
    g.strokeStyle = p.primary;
    g.lineWidth = 3;
    g.strokeRect(si * cw + 1.5, 1.5, cw - 3, SKY_H - 3);
  }
  return true;
}

function Sticker(a: { w: number; size: number; theme: Theme }) {
  return (
    <Canvas
      height={a.size}
      label={NAMES[a.w]!}
      draw={(g, f) => {
        const p = pal(a.theme);
        drawWeather(g, a.w, f.width / 2, a.size * 0.36, a.size / 62, f.now / 1000, a.w, p, a.size * 0.5);
        return a.w === 4 || a.w === 3;
      }}
    />
  );
}

export default defineApp<State, Action, Local>({
  name: "Week weather",
  summary: (s) => {
    const f = forecastOf(s);
    const n = Object.keys(s.ratings).length;
    return f < 0 ? `${s.author || "A friend"}'s story: ${s.question} · no forecast yet` : `Group forecast: ${FORECAST[f]!.toLowerCase()} · ${n} rated · ${s.umbrellas.length} umbrellas sent`;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "rate") {
      if (!okW(a.w) || s.ratings[meta.user]?.w === a.w) return s;
      const prev = s.ratings[meta.user];
      const ratings = { ...s.ratings, [meta.user]: { w: a.w, note: prev?.note ?? "", at: meta.time } };
      // Clearing up takes back the umbrellas you were given; they go to people still under a cloud.
      const umbrellas = a.w >= 3 ? s.umbrellas : s.umbrellas.filter((u) => u.to !== meta.user);
      return { ...s, ratings, umbrellas };
    }
    if (a.t === "umbrella") {
      const to = a.to;
      if (typeof to !== "string" || to === meta.user || !inChat(ctx, to)) return s;
      if ((s.ratings[to]?.w ?? 0) < 3) return s;
      if (s.umbrellas.some((u) => u.from === meta.user && u.to === to)) return s;
      return { ...s, umbrellas: [...s.umbrellas, { from: meta.user, to, at: meta.time }] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const ok = (id: string) => inChat(ctx, id);
    if (Object.keys(s.ratings).every(ok) && s.umbrellas.every((u) => ok(u.from) && ok(u.to))) return s;
    const ratings: Record<string, Rating> = {};
    for (const id of Object.keys(s.ratings).filter(ok)) ratings[id] = s.ratings[id]!;
    return { ...s, ratings, umbrellas: s.umbrellas.filter((u) => ok(u.from) && ok(u.to)) };
  },

  invariants: {
    "weather is one of five": (s) => Object.values(s.ratings).every((r) => okW(r.w) && r.at >= 0),
    "raters are in the chat": (s, ctx) => Object.keys(s.ratings).every((id) => inChat(ctx, id)),
    "umbrellas go to rain or storm, never to yourself": (s) => s.umbrellas.every((u) => u.from !== u.to && (s.ratings[u.to]?.w ?? 0) >= 3),
    "one umbrella per friend from each person": (s) => new Set(s.umbrellas.map((u) => `${u.from}>${u.to}`)).size === s.umbrellas.length,
    "umbrella people are in the chat": (s, ctx) => s.umbrellas.every((u) => inChat(ctx, u.from) && inChat(ctx, u.to)),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "rating sets only my weather, now": (p, n, a, m) => {
      if (a.t !== "rate" || p === n) return true;
      const mine = n.ratings[m.user];
      if (!mine || mine.w !== a.w || mine.at !== m.time || mine.note !== (p.ratings[m.user]?.note ?? "")) return false;
      const ids = new Set([...Object.keys(p.ratings), ...Object.keys(n.ratings)]);
      for (const id of ids) if (id !== m.user && p.ratings[id] !== n.ratings[id]) return false;
      return true;
    },
    "clearing up hands back only my umbrellas": (p, n, a, m) => {
      if (a.t !== "rate" || p === n) return true;
      const want = a.w >= 3 ? p.umbrellas : p.umbrellas.filter((u) => u.to !== m.user);
      return JSON.stringify(want) === JSON.stringify(n.umbrellas);
    },
    "an umbrella adds exactly mine": (p, n, a, m) => {
      if (a.t !== "umbrella" || p === n) return true;
      const x = n.umbrellas[n.umbrellas.length - 1];
      return n.umbrellas.length === p.umbrellas.length + 1 && p.umbrellas.every((u, i) => n.umbrellas[i] === u) && !!x && x.from === m.user && x.to === a.to && x.at === m.time && n.ratings === p.ratings;
    },
    "umbrellas only for rain or storm": (p, n, a) => a.t !== "umbrella" || p === n || (p.ratings[a.to]?.w ?? 0) >= 3,
  },

  arbitrary: (s, u, r, ctx) => {
    const wet = Object.keys(s.ratings).filter((id) => id !== u && s.ratings[id]!.w >= 3);
    if (wet.length && r.next() < 0.4) return { t: "umbrella", to: r.pick(wet) };
    if (r.next() < 0.1) return { t: "umbrella", to: r.pick(ctx.members.length ? ctx.members.map((m) => m.id) : [u]) };
    return { t: "rate", w: r.int(5) };
  },

  local: { sel: "", cheers: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const SW = W - 24;
    const cols: Col[] = members.slice(0, 8).map((m) => ({ id: m.id, w: state.ratings[m.id]?.w ?? -1 }));
    if (!cols.some((x) => x.id === me) && members.some((m) => m.id === me)) cols[cols.length - 1] = { id: me, w: state.ratings[me]?.w ?? -1 };
    const cw = SW / Math.max(1, cols.length);
    const f = forecastOf(state);
    const rated = Object.keys(state.ratings).filter((id) => members.some((m) => m.id === id)).length;
    const mine = state.ratings[me];
    const mem = (id: string): Member => members.find((m) => m.id === id) ?? { id, name: "?" };
    const author = members.find((m) => m.name.trim().toLowerCase() === state.author.toLowerCase()) ?? { id: `o:${state.author || "?"}`, name: state.author || "?" };
    const selR = local.sel ? state.ratings[local.sel] : undefined;
    const canSend = !!local.sel && local.sel !== me && (selR?.w ?? 0) >= 3 && !state.umbrellas.some((u) => u.from === me && u.to === local.sel);
    const sent = !!local.sel && state.umbrellas.some((u) => u.from === me && u.to === local.sel);
    const stormiest = [...cols].filter((x) => x.w >= 0 && x.id !== me).sort((a, b) => b.w - a.w)[0];
    const quoteId = local.sel || stormiest?.id || "";
    const quote = quoteId && state.ratings[quoteId]?.note ? { name: mem(quoteId).name, text: state.ratings[quoteId]!.note } : null;
    const lastMine = [...state.umbrellas].filter((u) => u.from === me).sort((a, b) => b.at - a.at)[0];
    const justSent = !!lastMine && lastMine.at > 0 && running(lastMine.at, 2400) !== null;
    const q = fitText(state.question, W - 40, { size: 28, weight: 800, min: 16 });

    const onSky = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "up") return;
      const i = Math.floor(e.x / cw);
      const col = cols[i];
      if (!col) return;
      setLocal({ sel: local.sel === col.id ? "" : col.id });
    };

    return (
      <div>
        <div style={{ position: "relative", height: PANEL, borderRadius: 12, overflow: "hidden", background: mix(p.blue, p.dark, 0.62), color: p.on }}>
          <div aria-hidden="true" style={{ position: "absolute", left: 8, right: 8, top: 8, height: 3, borderRadius: 2, background: mix(p.on, p.dark, 0.55) }}>
            <div style={{ width: "40%", height: 3, borderRadius: 2, background: p.on }} />
          </div>
          <div style={{ position: "absolute", left: 11, right: 12, top: 18, height: 32, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
            <span style={{ width: 32, height: 32, flex: "none", borderRadius: 16, background: p.on, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Avatar user={author} size={28} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: p.on, flex: "none" }}>{state.author || "Story"}</span>
            <span style={{ fontSize: 15, color: p.on, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.ago}</span>
          </div>
          <div style={{ position: "absolute", left: 16, right: 16, top: 56, fontSize: q.size, fontWeight: 800, lineHeight: "36px", color: p.on, whiteSpace: "nowrap", transform: "rotate(-2deg)", transformOrigin: "left", pointerEvents: "none" }}>{q.text}</div>
          <div style={{ position: "absolute", left: 16, right: 16, top: 98, height: 52, display: "flex", alignItems: "center", gap: 10, pointerEvents: "none" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, lineHeight: "18px", color: p.on }}>{`Group forecast · ${rated} of ${members.length} rated`}</div>
              <div style={{ fontSize: 20, lineHeight: "26px", fontWeight: 700, color: p.on, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f < 0 ? "Waiting on the first sky" : FORECAST[f]}</div>
            </div>
            <div style={{ fontSize: 13, lineHeight: "18px", color: p.on, textAlign: "right", flex: "none" }}>{`${state.umbrellas.length} ${state.umbrellas.length === 1 ? "umbrella" : "umbrellas"}`}</div>
          </div>

          <div style={{ position: "absolute", left: 12, top: SKY_TOP, width: SW, height: SKY_H, borderRadius: 14, overflow: "hidden" }}>
            <Canvas height={SKY_H} label={`Forecast strip: ${cols.map((x) => `${mem(x.id).name} ${x.w >= 0 ? NAMES[x.w]!.toLowerCase() : "not rated"}`).join(", ")}`} draw={(g, fr) => drawSky(g, fr, cols, state, me, local.sel, theme)} onPointer={onSky} />
            {cols.map((col, i) => {
              const m = mem(col.id);
              const nm = fitText(col.id === me ? "You" : m.name, cw - 6, { size: 12, weight: 600, min: 9 });
              return (
                <div key={col.id} style={{ position: "absolute", left: i * cw, width: cw, top: SKY_H - 62, height: 58, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, pointerEvents: "none" }}>
                  <span style={{ display: "flex", borderRadius: 15, boxShadow: `0 0 0 2px ${col.id === me ? c.primary : c.card}` }}>
                    <Avatar user={m} size={28} />
                  </span>
                  <span style={{ maxWidth: cw - 4, padding: "0 5px", borderRadius: 8, background: c.card, color: c.text, fontSize: nm.size, fontWeight: 600, lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden" }}>{nm.text}</span>
                </div>
              );
            })}
          </div>

          <div style={{ position: "absolute", left: 16, right: 16, top: SKY_TOP + SKY_H + 6, height: 20, display: "flex", gap: 6, fontSize: 13, lineHeight: "20px", color: p.on, pointerEvents: "none" }}>
            {quote ? (
              <>
                <span style={{ fontWeight: 700, flex: "none" }}>{quote.name}</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`"${quote.text}"`}</span>
              </>
            ) : (
              <span>Tap a sky to read how their week is going</span>
            )}
          </div>

          <div style={{ position: "absolute", left: 12, right: 12, top: 432, borderRadius: 16, background: c.card, color: c.text, padding: "8px 10px 10px", boxSizing: "border-box" }}>
            {local.sel && local.sel !== me && (selR?.w ?? 0) >= 3 ? (
              <div style={{ height: 94, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
                <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sent ? `You sent ${mem(local.sel).name} an umbrella` : `Send ${mem(local.sel).name} an umbrella`}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${state.gift} on you`}</span>
                  <Button kind="secondary" onClick={() => setLocal({ sel: "" })}>
                    Back
                  </Button>
                  <Button
                    kind="primary"
                    disabled={!canSend}
                    onClick={() => {
                      haptic("success");
                      dispatch({ t: "umbrella", to: local.sel });
                      setLocal({ cheers: local.cheers + 1 });
                    }}
                  >
                    {sent ? "Sent" : "Send"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {mine ? `Your week: ${NAMES[mine.w]!.toLowerCase()} · tap a storm to send an umbrella` : "How's your week looking?"}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {[0, 1, 2, 3, 4].map((w) => {
                    const on = mine?.w === w;
                    return (
                      <button
                        key={w}
                        type="button"
                        aria-label={NAMES[w]}
                        aria-pressed={on}
                        onClick={() => {
                          haptic("light");
                          dispatch({ t: "rate", w });
                        }}
                        style={{ flex: 1, height: 70, padding: 0, border: 0, borderRadius: 12, cursor: "pointer", background: on ? c.selected : c.wash, boxShadow: on ? `inset 0 0 0 2px ${c.primary}` : undefined, display: "block", overflow: "hidden" }}
                      >
                        <Sticker w={w} size={70} theme={theme} />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {justSent ? (
            <div style={{ position: "absolute", left: "50%", top: SKY_TOP + 60, pointerEvents: "none" }}>
              <Burst key={local.cheers} emoji="☂️" />
            </div>
          ) : null}
        </div>
        {justSent && lastMine ? <Toast key={local.cheers}>{`Umbrella sent to ${mem(lastMine.to).name}`}</Toast> : null}
      </div>
    );
  },
});
