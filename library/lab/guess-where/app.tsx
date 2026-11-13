import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// Guess where: a friend posts from somewhere and hides it. A world map; they drop clues one at a
// time like cards on the table; friends drag a pin where they think they are. The reveal drops a
// star, dotted lines run from every pin and the closest face gets a crown.

type Params = {
  /** Who posted: "Tsai Lin" */
  author: string;
  /** The post line, shown in quotes: "guess where i am" */
  line: string;
  /** Clues in the order they are dropped, 2 to 5, a few words each */
  clues: string[];
  /** How many clues are already out, 1 or more */
  shown: number;
  /** The real place, shown at the reveal: "Cusco, Peru" */
  place: string;
  /** Where it is: longitude and latitude */
  lon: number;
  lat: number;
  /** Friends who already guessed: map position as longitude, latitude, and what they said */
  guesses: { who: string; lon: number; lat: number; said?: string }[];
};

// @params
const P: Params = {
  author: "Tsai Lin",
  line: "guess where i am 👀 (hint: tostadas)",
  clues: ["tostadas for breakfast", "it's 28° in November", "the bus had a goat on it", "11,000 ft up, can't breathe"],
  shown: 2,
  place: "Cusco, Peru",
  lon: -72,
  lat: -13.5,
  guesses: [
    { who: "Calvin", lon: -102, lat: 21, said: "mexico. final answer. again" },
    { who: "Maya", lon: -74, lat: 4.6, said: "bogotá, color-coded my reasoning" },
    { who: "Arun", lon: -58, lat: -34, said: "buenos aires bc steak" },
    { who: "Will", lon: -90, lat: 15, said: "guatemala?? lowkey" },
  ],
};
// @end params

type Guess = { who: string; name: string; x: number; y: number; said: string; at: number; n: number };
type State = { author: string; authorName: string; line: string; clues: string[]; shown: number; place: string; ax: number; ay: number; revealedAt: number; guesses: Guess[] };
type Action = { t: "guess"; x: number; y: number } | { t: "clue" } | { t: "reveal" };
type Local = { px: number; py: number; moved: boolean; toast: number };

const MAP_H = 176;
const LAT_TOP = 80;
const LAT_SPAN = 140;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okXY = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000;
const toX = (lon: number) => Math.round(((Math.max(-180, Math.min(180, lon)) + 180) / 360) * 1000);
const toY = (lat: number) => Math.round(((LAT_TOP - Math.max(LAT_TOP - LAT_SPAN, Math.min(LAT_TOP, lat))) / LAT_SPAN) * 1000);
const lonOf = (x: number) => (x / 1000) * 360 - 180;
const latOf = (y: number) => LAT_TOP - (y / 1000) * LAT_SPAN;
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Great-circle distance in km between two map points. */
function km(x1: number, y1: number, x2: number, y2: number): number {
  const r = Math.PI / 180;
  const a1 = latOf(y1) * r, a2 = latOf(y2) * r, dl = (lonOf(x2) - lonOf(x1)) * r;
  const h = Math.sin((a2 - a1) / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dl / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.min(1, Math.sqrt(h))));
}
const ranked = (s: State) => [...s.guesses].sort((a, b) => km(a.x, a.y, s.ax, s.ay) - km(b.x, b.y, s.ax, s.ay) || a.at - b.at);
const fmtKm = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k km` : `${n} km`);

function memberFor(ctx: Ctx, name: string): Member | undefined {
  const k = name.trim().toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k);
}

function initState(ctx: Ctx): State {
  const clues = (Array.isArray(P.clues) ? P.clues : []).map((c) => clean(c, 40)).filter(Boolean).slice(0, 5);
  const authorName = clean(P.author, 20) || "Someone";
  const am = memberFor(ctx, authorName);
  const author = am ? am.id : `name:${authorName}`;
  const guesses: Guess[] = [];
  for (const g of Array.isArray(P.guesses) ? P.guesses.slice(0, 8) : []) {
    const name = clean(g?.who, 20);
    if (!name) continue;
    const m = memberFor(ctx, name);
    const who = m ? m.id : `name:${name}`;
    if (who === author || guesses.some((q) => q.who === who)) continue;
    guesses.push({ who, name: m ? clean(m.name, 20) || name : name, x: toX(num(g.lon, 0)), y: toY(num(g.lat, 0)), said: clean(g.said, 44), at: 0, n: 1 });
  }
  return {
    author,
    authorName,
    line: clean(P.line, 60),
    clues: clues.length ? clues : ["somewhere warm"],
    shown: Math.max(1, Math.min(clues.length || 1, Math.round(num(P.shown, 1)))),
    place: clean(P.place, 28) || "Somewhere",
    ax: toX(num(P.lon, 0)),
    ay: toY(num(P.lat, 0)),
    revealedAt: 0,
    guesses,
  };
}

// Continents, rough, as longitude/latitude rings.
const LAND: number[][] = [
  [-165, 65, -140, 70, -95, 72, -80, 65, -62, 58, -55, 48, -70, 43, -76, 35, -81, 25, -97, 26, -97, 18, -88, 15, -83, 9, -79, 8, -90, 14, -105, 20, -112, 28, -118, 33, -124, 40, -125, 49, -135, 58, -150, 60, -165, 60],
  [-55, 78, -20, 79, -20, 70, -42, 60, -52, 66],
  [-79, 8, -72, 12, -60, 10, -50, 0, -35, -6, -40, -22, -48, -27, -58, -38, -65, -42, -68, -54, -74, -52, -72, -40, -73, -30, -71, -18, -77, -10, -81, -4, -80, 2],
  [-10, 36, -9, 43, -1, 44, -5, 48, 2, 51, 8, 54, 10, 58, 5, 62, 15, 69, 28, 71, 40, 67, 70, 73, 100, 77, 140, 72, 180, 68, 170, 60, 160, 58, 142, 52, 140, 40, 127, 38, 122, 30, 110, 20, 105, 10, 100, 13, 97, 17, 92, 22, 80, 15, 77, 8, 73, 20, 66, 25, 57, 25, 59, 22, 52, 15, 43, 13, 39, 22, 35, 29, 36, 35, 28, 40, 23, 38, 15, 40, 12, 44, 8, 44, 3, 43],
  [-17, 21, -10, 30, -5, 36, 10, 37, 20, 32, 32, 31, 35, 28, 43, 12, 51, 12, 42, -2, 40, -15, 35, -25, 20, -35, 17, -29, 12, -17, 14, -8, 9, 0, 8, 5, -8, 5, -15, 11],
  [113, -22, 122, -17, 131, -12, 142, -11, 146, -19, 153, -27, 150, -37, 141, -38, 131, -31, 115, -34],
];
const ISLES: [number, number, number, number][] = [
  [-3, 54, 4, 6], [138, 37, 3, 7], [47, -19, 3, 6], [114, 0, 5, 4], [101, 0, 3, 5], [172, -42, 3, 5], [122, 12, 3, 5], [-77, 21, 6, 2],
];

function drawMap(g: CanvasRenderingContext2D, f: DrawFrame, s: State, pins: { x: number; y: number; col: string; mine: boolean }[], crown: number) {
  const c = f.theme.color;
  const pl = pal(f.theme);
  const dark = f.theme.mode === "dark";
  const W = f.width, H = MAP_H;
  const X = (x: number) => (x / 1000) * W, Y = (y: number) => (y / 1000) * H;
  const tt = f.now / 1000;
  g.fillStyle = dark ? mix(c.wash, pl.blue, 0.18) : mix(c.card, pl.blue, 0.13);
  g.beginPath();
  g.roundRect(0, 0, W, H, 12);
  g.fill();
  // latitude lines and the equator
  g.strokeStyle = dark ? mix(c.wash, pl.blue, 0.35) : mix(c.card, pl.blue, 0.3);
  g.lineWidth = 1;
  g.setLineDash([2, 5]);
  g.beginPath();
  for (const lat of [60, 30, -30]) {
    g.moveTo(8, Y(toY(lat)));
    g.lineTo(W - 8, Y(toY(lat)));
  }
  g.stroke();
  g.setLineDash([6, 4]);
  g.beginPath();
  g.moveTo(8, Y(toY(0)));
  g.lineTo(W - 8, Y(toY(0)));
  g.stroke();
  g.setLineDash([]);
  // little waves
  g.strokeStyle = dark ? mix(c.wash, pl.blue, 0.45) : mix(c.card, pl.blue, 0.4);
  g.lineWidth = 1.2;
  g.beginPath();
  for (const [lon, lat] of [[-140, 20], [-30, 35], [-120, -30], [70, -20], [-25, -40], [160, 20]] as const) {
    const x = X(toX(lon)) + Math.sin(tt + lon) * 2, y = Y(toY(lat));
    g.moveTo(x - 7, y);
    g.quadraticCurveTo(x - 3.5, y - 3, x, y);
    g.quadraticCurveTo(x + 3.5, y + 3, x + 7, y);
  }
  g.stroke();
  // land
  const land = new Path2D();
  for (const ring of LAND) {
    for (let i = 0; i < ring.length; i += 2) {
      const x = X(toX(ring[i]!)), y = Y(toY(ring[i + 1]!));
      if (i === 0) land.moveTo(x, y);
      else land.lineTo(x, y);
    }
    land.closePath();
  }
  for (const [lon, lat, rx, ry] of ISLES) {
    land.moveTo(X(toX(lon)) + rx, Y(toY(lat)));
    land.ellipse(X(toX(lon)), Y(toY(lat)), rx, ry, 0, 0, Math.PI * 2);
  }
  g.lineJoin = "round";
  g.fillStyle = dark ? mix(pl.green, c.wash, 0.45) : mix(pl.green, c.card, 0.55);
  g.fill(land);
  g.strokeStyle = dark ? mix(pl.green, c.wash, 0.2) : mix(pl.green, c.text, 0.15);
  g.lineWidth = 1.2;
  g.stroke(land);

  // reveal: dotted lines from each pin to the star
  const rev = s.revealedAt > 0;
  const k = rev ? Math.min(1, (running(s.revealedAt, 900) ?? 900) / 900) : 0;
  if (rev) {
    g.strokeStyle = dark ? c.text : mix(c.text, c.card, 0.25);
    g.lineWidth = 1.5;
    g.setLineDash([3, 4]);
    g.beginPath();
    for (const p of pins) {
      g.moveTo(X(p.x), Y(p.y));
      g.lineTo(X(p.x) + (X(s.ax) - X(p.x)) * k, Y(p.y) + (Y(s.ay) - Y(p.y)) * k);
    }
    g.stroke();
    g.setLineDash([]);
  }
  // pins: a stick and a head in the person's colour (faces sit on the heads as HTML)
  for (const p of pins) {
    const x = X(p.x), y = Y(p.y);
    g.fillStyle = p.col;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - 5, y - 12);
    g.lineTo(x + 5, y - 12);
    g.closePath();
    g.fill();
    g.fillStyle = mix(c.text, c.card, 0.4);
    g.beginPath();
    g.ellipse(x, y, 3, 1.5, 0, 0, Math.PI * 2);
    g.fill();
    if (p.mine && !rev) {
      const q = 0.5 + 0.5 * Math.sin(tt * 5);
      g.strokeStyle = c.primary;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y - 22, 13 + 2 * q, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // crown on the winner
  if (rev && crown >= 0 && k >= 1) {
    const p = pins[crown]!;
    const x = X(p.x), y = Y(p.y) - 40;
    g.fillStyle = pl.yellow;
    g.strokeStyle = mix(pl.yellow, c.text, 0.4);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x - 8, y + 5);
    g.lineTo(x - 8, y - 3);
    g.lineTo(x - 4, y + 1);
    g.lineTo(x, y - 5);
    g.lineTo(x + 4, y + 1);
    g.lineTo(x + 8, y - 3);
    g.lineTo(x + 8, y + 5);
    g.closePath();
    g.fill();
    g.stroke();
  }
  // the star
  if (rev) {
    const sk = Math.min(1, (running(s.revealedAt, 500) ?? 500) / 500);
    const r = 9 * (sk < 1 ? 0.3 + 0.9 * sk : 1);
    const x = X(s.ax), y = Y(s.ay);
    g.fillStyle = pl.yellow;
    g.strokeStyle = mix(pl.yellow, c.text, 0.5);
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      if (i === 0) g.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
      else g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    g.closePath();
    g.fill();
    g.stroke();
    if (k >= 1) {
      const ft = fitText(s.place, 140, { g, size: 12, weight: 700 });
      const tw = g.measureText(ft.text).width + 12;
      const lx = Math.max(4, Math.min(W - tw - 4, x - tw / 2));
      const ly = y + 12 + 18 > H - 2 ? y - 34 : y + 12;
      g.fillStyle = c.card;
      g.beginPath();
      g.roundRect(lx, ly, tw, 18, 9);
      g.fill();
      g.fillStyle = c.text;
      g.textBaseline = "middle";
      g.textAlign = "left";
      g.fillText(ft.text, lx + 6, ly + 9);
    }
  }
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Guess where",
  summary: (s) =>
    s.revealedAt
      ? `${s.authorName} was in ${s.place} · ${ranked(s)[0] ? `${ranked(s)[0]!.name} was closest` : "nobody guessed"}`
      : `Guess where ${s.authorName} is · ${s.guesses.length} ${s.guesses.length === 1 ? "guess" : "guesses"} · clue ${s.shown} of ${s.clues.length}`,

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    const u = meta.user;
    if (a.t === "guess") {
      if (s.revealedAt || u === s.author || !okXY(a.x) || !okXY(a.y)) return s;
      const old = s.guesses.find((g) => g.who === u);
      const name = clean(ctx.members.find((m) => m.id === u)?.name, 20) || "Friend";
      const g: Guess = { who: u, name, x: a.x, y: a.y, said: "", at: meta.time, n: (old?.n ?? 0) + 1 };
      return { ...s, guesses: old ? s.guesses.map((q) => (q.who === u ? g : q)) : [...s.guesses, g] };
    }
    if (a.t === "clue") {
      if (u !== s.author || s.revealedAt || s.shown >= s.clues.length) return s;
      return { ...s, shown: s.shown + 1 };
    }
    if (a.t === "reveal") {
      if (u !== s.author || s.revealedAt) return s;
      return { ...s, revealedAt: Math.max(1, meta.time), shown: s.clues.length };
    }
    return s;
  },

  invariants: {
    "clues out are between one and all": (s) => Number.isInteger(s.shown) && s.shown >= 1 && s.shown <= s.clues.length,
    "a reveal shows every clue": (s) => !s.revealedAt || s.shown === s.clues.length,
    "one pin per person, never the poster": (s) => new Set(s.guesses.map((g) => g.who)).size === s.guesses.length && s.guesses.every((g) => g.who !== s.author),
    "pins sit on the map": (s) => s.guesses.every((g) => okXY(g.x) && okXY(g.y)) && okXY(s.ax) && okXY(s.ay),
    "every pin was placed at least once": (s) => s.guesses.every((g) => Number.isInteger(g.n) && g.n >= 1),
  },

  transitions: {
    "a guess moves only my pin to where I let go": (p, n, a, m) => {
      if (a.t !== "guess" || p === n) return true;
      const g = n.guesses.find((q) => q.who === m.user);
      const others = n.guesses.filter((q) => q.who !== m.user);
      return !!g && g.x === a.x && g.y === a.y && g.at === m.time && g.n === (p.guesses.find((q) => q.who === m.user)?.n ?? 0) + 1 && others.length === p.guesses.filter((q) => q.who !== m.user).length && others.every((q) => p.guesses.includes(q));
    },
    "a fresh guess lands before the reveal": (p, n, a, m, ctx) => a.t !== "guess" || p.revealedAt > 0 || m.user === p.author || !okXY(a.x) || !okXY(a.y) || !inChat(ctx, m.user) || p !== n,
    "no guesses after the reveal": (p, n, a) => a.t !== "guess" || !p.revealedAt || p === n,
    "only the poster drops clues, one at a time": (p, n, a, m) => a.t !== "clue" || p === n || (m.user === p.author && n.shown === p.shown + 1 && n.guesses === p.guesses),
    "the poster's clue lands while some are hidden": (p, n, a, m, ctx) => a.t !== "clue" || m.user !== p.author || !inChat(ctx, m.user) || p.revealedAt > 0 || p.shown >= p.clues.length || n.shown === p.shown + 1,
    "only the poster reveals, once": (p, n, a, m) => a.t !== "reveal" || p === n || (m.user === p.author && !p.revealedAt && n.revealedAt > 0),
    "the poster's reveal lands": (p, n, a, m, ctx) => a.t !== "reveal" || m.user !== p.author || !inChat(ctx, m.user) || p.revealedAt > 0 || n.revealedAt > 0,
    "a reveal never comes undone": (p, n) => !p.revealedAt || n.revealedAt === p.revealedAt,
    "the post never changes": (p, n) => p.author === n.author && p.place === n.place && p.ax === n.ax && p.ay === n.ay && p.clues === n.clues && p.line === n.line,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (user === s.author) return r.next() < 0.7 ? { t: "clue" } : { t: "reveal" };
    return r.next() < 0.95 ? { t: "guess", x: r.int(1001), y: r.int(1001) } : { t: "clue" };
  },

  local: { px: 500, py: 400, moved: false, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const isAuthor = me === state.author;
    const rev = state.revealedAt > 0;
    const mine = state.guesses.find((g) => g.who === me);
    const person = (g: Guess): Member => members.find((m) => m.id === g.who) ?? { id: g.who, name: g.name };
    const myX = local.moved ? local.px : mine?.x ?? -1;
    const myY = local.moved ? local.py : mine?.y ?? -1;
    const order = rev ? ranked(state) : state.guesses;
    const crownWho = rev ? ranked(state)[0]?.who ?? "" : "";
    const pinList = state.guesses.filter((g) => g.who !== me).map((g) => ({ g, x: g.x, y: g.y, mine: false }));
    if (myX >= 0 && !isAuthor) pinList.push({ g: mine ?? { who: me, name: "You", x: myX, y: myY, said: "", at: 0, n: 0 }, x: myX, y: myY, mine: true });
    const pins = pinList.map((p) => ({ x: p.x, y: p.y, col: p.mine ? c.primary : userColor(p.g.who, theme), mine: p.mine }));
    const crown = pinList.findIndex((p) => p.g.who === crownWho);
    const latest = state.guesses.find((g) => g.said);
    const canGuess = !rev && !isAuthor;
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (!canGuess) return;
      const x = Math.max(0, Math.min(1000, Math.round((e.x / W) * 1000)));
      const y = Math.max(0, Math.min(1000, Math.round((e.y / MAP_H) * 1000)));
      setLocal({ px: x, py: y, moved: true });
    };
    const clueW = Math.floor((W - 6 * (state.clues.length - 1)) / state.clues.length);
    const top = rev ? ranked(state)[0] : undefined;
    const myKm = mine ? km(mine.x, mine.y, state.ax, state.ay) : 0;
    const status = rev
      ? top
        ? `${top.who === me ? "You were" : `${top.name} was`} closest · ${fmtKm(km(top.x, top.y, state.ax, state.ay))} off${mine && top.who !== me ? ` · you ${fmtKm(myKm)}` : ""}`
        : "Nobody guessed this time"
      : local.moved
        ? "Happy with it? Drop your pin"
        : mine
          ? `Your pin is in · ${mine.n === 1 ? "move it any time before the reveal" : `moved ${mine.n - 1} ${mine.n === 2 ? "time" : "times"}`}`
          : isAuthor
            ? `${state.guesses.length} ${state.guesses.length === 1 ? "friend has" : "friends have"} guessed · drop a clue or reveal`
            : latest
              ? `${latest.name}: "${latest.said}"`
              : "Tap the map where you think they are";

    return (
      <div>
        <style>{"@keyframes gwFlip { from { transform: rotateY(90deg) } to { transform: rotateY(0) } } @keyframes gwDrop { 0% { transform: translateY(-16px) } 70% { transform: translateY(2px) } 100% { transform: translateY(0) } }"}</style>
        <CardHeader title={`Where's ${state.authorName}?`} subtitle={state.line ? `“${state.line}”` : `${state.guesses.length} guesses so far`} />
        <div style={{ display: "flex", gap: 6, margin: "2px 0 10px", minHeight: 58, alignItems: "stretch" }}>
          {state.clues.map((cl, i) => {
            const open = i < state.shown;
            return (
              <div
                key={`${i}-${open ? 1 : 0}`}
                style={{
                  width: clueW,
                  flex: "none",
                  boxSizing: "border-box",
                  borderRadius: 8,
                  padding: "5px 6px",
                  transform: `rotate(${((i * 37) % 5) - 2}deg)`,
                  background: open ? mix(c.card, pal(theme).yellow, 0.28) : c.card,
                  border: open ? `1px solid ${mix(c.divider, pal(theme).yellow, 0.4)}` : `1.5px dashed ${c.divider}`,
                  animation: open && i === state.shown - 1 ? "gwFlip .45s ease-out" : undefined,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: open ? "flex-start" : "center",
                  alignItems: open ? "stretch" : "center",
                }}
              >
                {open ? (
                  <>
                    <span style={{ fontSize: 10, lineHeight: "12px", fontWeight: 700, color: c.text }}>{`Clue ${i + 1}`}</span>
                    <span style={{ fontSize: 11, lineHeight: "13px", color: c.text, overflowWrap: "anywhere" }}>{cl}</span>
                  </>
                ) : (
                  <span style={{ fontSize: 17, fontWeight: 700, color: c.secondaryText }}>?</span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ position: "relative", height: MAP_H }}>
          <Canvas
            height={MAP_H}
            drag={canGuess}
            label={rev ? `World map: ${state.authorName} was in ${state.place}; ${state.guesses.length} pins` : `World map with ${state.guesses.length} guesses; tap to place your pin`}
            draw={(g, f) => drawMap(g, f, state, pins, crown)}
            onPointer={onPointer}
          />
          {pinList.map((p) => (
            <div key={p.g.who} style={{ position: "absolute", left: (p.x / 1000) * W - 10, top: (p.y / 1000) * MAP_H - 32, pointerEvents: "none", animation: p.mine ? undefined : "gwDrop .4s ease-out" }}>
              <Avatar user={p.mine ? me : person(p.g)} size={20} />
            </div>
          ))}
          {!mine && !local.moved && canGuess ? (
            <div style={{ position: "absolute", right: 8, bottom: 8, padding: "2px 10px", borderRadius: 999, background: c.card, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, pointerEvents: "none" }}>Tap to drop your pin</div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, height: 22, overflow: "hidden" }}>
          {order.slice(0, Math.max(2, Math.floor(W / 74))).map((g) => (
            <div key={g.who} style={{ flex: "none", display: "flex", alignItems: "center", gap: 3, padding: "0 6px 0 2px", height: 22, borderRadius: 11, background: g.who === crownWho ? mix(c.card, pal(theme).yellow, 0.35) : c.wash }}>
              <Avatar user={person(g)} size={18} />
              <span style={{ fontSize: 12, color: c.text, whiteSpace: "nowrap", maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis" }}>{rev ? fmtKm(km(g.x, g.y, state.ax, state.ay)) : g.who === me ? "You" : g.name.split(" ")[0]}</span>
            </div>
          ))}
          {order.length === 0 ? <span style={{ fontSize: 13, color: c.secondaryText }}>No pins yet · be the first</span> : null}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{status}</div>
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          {isAuthor && !rev ? (
            <>
              {state.shown < state.clues.length ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "clue" })}>
                  Next clue
                </Button>
              ) : null}
              <div style={{ flex: 1 }}>
                <Button kind="primary" wide onClick={() => { dispatch({ t: "reveal" }); haptic("success"); }}>
                  Reveal
                </Button>
              </div>
            </>
          ) : canGuess ? (
            <div style={{ flex: 1 }}>
              <Button
                kind="primary"
                wide
                disabled={!local.moved}
                onClick={() => {
                  dispatch({ t: "guess", x: local.px, y: local.py });
                  setLocal({ moved: false, toast: local.toast + 1 });
                  haptic("light");
                }}
              >
                {mine ? "Move my pin" : "Drop my pin"}
              </Button>
            </div>
          ) : null}
        </div>
        {local.toast > 0 && mine && !rev ? <Toast key={local.toast}>{`Pinned · ${state.clues.length - state.shown} clues to go`}</Toast> : null}
      </div>
    );
  },
});
