import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  Locked,
  More,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  textWidth,
  tween,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// A hike reel somebody shared ("can we do this") becomes the plan: a little hiker walks the trail's
// elevation profile, everyone says how much climb they are up for (one "Chill" reroutes the group to
// the flat beach version), you hop in a car, and locking sends the hiker sprinting to the summit flag.

type Params = {
  /** The reel: who shared it, their note, the account, a quote from it and its title. */
  reel: { from: string; note: string; account: string; quote: string; title: string };
  /** The full route: name and stats line. */
  ridge: { name: string; stats: string };
  /** The easy version: name and stats line. */
  flat: { name: string; stats: string };
  /** Where the trail ends: "Muir Beach" */
  to: string;
  /** When: day, time and the word used in the toast. */
  when: { day: string; time: string; word: string };
  /** A short weather note. */
  weather: string;
  /** Comfort already said in the chat: level 0 Chill, 1 Some climb, 2 Send it. */
  comfort: { name: string; level: number }[];
  /** 0 to 3 cars: seats counts the driver; riders are names. */
  cars: { name: string; driver: string; seats: number; riders: string[] }[];
};

// @params
const P: Params = {
  reel: { from: "Jess", note: "can we do this", account: "bayareatrails", quote: "easiest ocean views in the Bay", title: "Tennessee Valley to Muir Beach" },
  ridge: { name: "Coastal ridge route", stats: "5.6 mi · 1,150 ft · ~3 hrs" },
  flat: { name: "Beach loop (flat version)", stats: "3.4 mi · 250 ft · ~1.5 hrs" },
  to: "Muir Beach",
  when: { day: "Sun, Nov 22", time: "8:30 am", word: "Sunday" },
  weather: "fog clears by 10",
  comfort: [{ name: "Jess", level: 2 }, { name: "Sam", level: 1 }, { name: "Priya", level: 1 }, { name: "Leo", level: 2 }],
  cars: [
    { name: "Sam's Corolla", driver: "Sam", seats: 4, riders: ["Jess"] },
    { name: "Leo's Jeep", driver: "Leo", seats: 5, riders: ["Priya", "Ana"] },
  ],
};
// @end params

type Level = 0 | 1 | 2;
type Car = { id: string; name: string; driver: string | null; others: string[]; seats: (string | null)[] };
type Route = { name: string; stats: string };
type State = {
  reel: Params["reel"];
  ridge: Route;
  flat: Route;
  to: string;
  when: Params["when"];
  weather: string;
  comfort: Record<string, Level>;
  others: { name: string; level: Level }[];
  cars: Car[];
  short: boolean;
  routeAt: number;
  lockedAt: number;
};
type Action = { t: "comfort"; level: number } | { t: "seat"; car: string } | { t: "unseat" } | { t: "lock" };
type Local = { toast: number };

const LEVELS = ["Chill", "Some climb", "Send it"];
const FLIP_MS = 800;
const RUN_MS = 1000;
const slide = tween({ duration: FLIP_MS, easing: "easeInOut" });
const sprint = tween({ duration: RUN_MS, easing: "easeInOut" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const drives = (s: State, u: string) => s.cars.some((c) => c.driver === u);
const inCar = (s: State, u: string) => s.cars.some((c) => c.driver === u || c.seats.includes(u));
const anyChill = (s: State) => Object.values(s.comfort).includes(0) || s.others.some((o) => o.level === 0);
const route = (s: State) => (s.short ? s.flat : s.ridge);
const hikers = (s: State) => s.cars.reduce((n, c) => n + (c.driver ? 1 : 0) + c.others.length + c.seats.filter((x) => x !== null).length, 0);
const capacity = (c: Car) => (c.driver ? 1 : 0) + c.others.length + c.seats.length;
const lvl = (v: unknown): Level => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 1;
  return (n < 0 ? 0 : n > 2 ? 2 : n) as Level;
};
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function initState(ctx: Ctx): State {
  const match = (name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.trim().toLowerCase());
  const reel = {
    from: clean(P.reel.from, 24),
    note: clean(P.reel.note, 30),
    account: clean(P.reel.account, 24),
    quote: clean(P.reel.quote, 60),
    title: clean(P.reel.title, 40) || "Hike",
  };
  const comfort: Record<string, Level> = {};
  const others: { name: string; level: Level }[] = [];
  for (const row of P.comfort) {
    const name = clean(row.name, 24);
    if (!name) continue;
    const m = match(name);
    if (m) {
      if (comfort[m.id] === undefined) comfort[m.id] = lvl(row.level);
    } else if (!others.some((o) => o.name.toLowerCase() === name.toLowerCase())) others.push({ name, level: lvl(row.level) });
  }
  const used = new Set<string>();
  const cars: Car[] = [];
  for (const raw of P.cars.slice(0, 3)) {
    const cap = Math.max(2, Math.min(7, Math.round(typeof raw.seats === "number" && Number.isFinite(raw.seats) ? raw.seats : 4)));
    const dm = match(clean(raw.driver, 24));
    const driver = dm && !used.has(dm.id) ? dm.id : null;
    if (driver) used.add(driver);
    const outside: string[] = [];
    const inside: string[] = [];
    if (!driver && clean(raw.driver, 24)) outside.push(clean(raw.driver, 24));
    for (const r of raw.riders) {
      const name = clean(r, 24);
      if (!name) continue;
      const m = match(name);
      if (m && !used.has(m.id)) {
        used.add(m.id);
        inside.push(m.id);
      } else if (!m) outside.push(name);
    }
    const free = cap - (driver ? 1 : 0);
    const oth = outside.slice(0, free);
    const seatCount = free - oth.length;
    cars.push({
      id: `c${cars.length}`,
      name: clean(raw.name, 24) || `Car ${cars.length + 1}`,
      driver,
      others: oth,
      seats: Array.from({ length: seatCount }, (_, i) => inside[i] ?? null),
    });
  }
  if (!cars.length) cars.push({ id: "c0", name: "Car 1", driver: null, others: [], seats: [null, null, null, null] });
  const base: State = {
    reel,
    ridge: { name: clean(P.ridge.name, 32) || "The route", stats: clean(P.ridge.stats, 32) },
    flat: { name: clean(P.flat.name, 32) || "The easy version", stats: clean(P.flat.stats, 32) },
    to: clean(P.to, 24),
    when: { day: clean(P.when.day, 16), time: clean(P.when.time, 16), word: clean(P.when.word, 16) },
    weather: clean(P.weather, 24),
    comfort,
    others,
    cars,
    short: false,
    routeAt: 0,
    lockedAt: 0,
  };
  return { ...base, short: anyChill(base) };
}

// ---- drawing ----

const eio = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const modp = (x: number, m: number) => ((x % m) + m) % m;

const elev = (u: number, sh: number) => {
  const long = (u < 0.45 ? eio(u / 0.45) : 1 - eio((u - 0.45) / 0.55) * 0.95) + Math.sin(30 * u) * 0.03;
  const flat = 0.12 + Math.sin(u * Math.PI) * 0.12 + Math.sin(22 * u) * 0.02;
  return lerp(long, flat, sh);
};

/** How flat the route is at `now`: 0 the ridge, 1 the beach loop, eased over 800 ms after a flip. */
const flatness = (s: State, now: number) => {
  if (s.routeAt === 0) return s.short ? 1 : 0;
  const e = Math.max(0, Math.min(FLIP_MS, now - s.routeAt));
  const k = slide(e);
  return s.short ? k : 1 - k;
};

function curve(x0: number, x1: number, y0: number, y1: number, bump: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    pts.push([lerp(x0, x1, u), lerp(y0, y1, eio(u)) - Math.sin(u * Math.PI) * bump]);
  }
  return pts;
}
const fillCurve = (pts: [number, number][], bottom: number) => {
  const p = new Path2D();
  p.moveTo(pts[0]![0], bottom);
  for (const [x, y] of pts) p.lineTo(x, y);
  p.lineTo(pts[pts.length - 1]![0], bottom);
  p.closePath();
  return p;
};

function drawReel(g: CanvasRenderingContext2D, f: DrawFrame) {
  const th = f.theme;
  const c = th.color;
  const p = pal(th);
  const W = f.width;
  const t = f.now / 1000;
  g.clearRect(0, 0, W, 150);
  g.globalAlpha = 1;

  const sky = g.createLinearGradient(0, 0, 0, 150);
  sky.addColorStop(0, p.sky);
  sky.addColorStop(1, mix(p.sky, c.card, 0.6));
  g.fillStyle = sky;
  g.fillRect(0, 0, W, 150);

  // sun: a glow of soft rings, then the disc
  g.fillStyle = p.cream;
  for (let i = 0; i < 12; i++) {
    g.globalAlpha = 0.055;
    g.beginPath();
    g.arc(W - 70, 34, 50 - i * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.beginPath();
  g.arc(W - 70, 34, 14, 0, Math.PI * 2);
  g.fill();

  // the sea between the hills
  g.fillStyle = p.blue;
  g.fillRect(0, 62, W, 88);
  const waves = new Path2D();
  for (let k = 0; k < 5; k++) {
    const x = modp(t * 10 + k * 80, W + 40) - 20;
    waves.moveTo(x, 68 + 3 * k);
    waves.lineTo(x + 20, 68 + 3 * k);
  }
  g.strokeStyle = p.on;
  g.lineWidth = 1.2;
  g.globalAlpha = 0.5;
  g.stroke(waves);
  g.globalAlpha = 1;

  // hills, beach, grass
  g.fillStyle = p.grass;
  g.fill(fillCurve(curve(0, W / 2 + 10, 44, 120, 10), 150));
  g.fillStyle = p.green;
  g.fill(fillCurve(curve(W / 2 - 20, W, 116, 50, 12), 150));
  g.fillStyle = p.cream;
  g.beginPath();
  g.ellipse(W / 2 - 4, 120, 46, 8, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = p.leaf;
  g.fill(fillCurve(curve(0, W, 132, 136, 6), 150));

  // the trail down to the beach
  const trail: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    trail.push([30 + u * (W / 2 - 40), 62 + u * 54 + Math.sin(14 * u) * 5]);
  }
  const line = new Path2D();
  trail.forEach(([x, y], i) => (i ? line.lineTo(x, y) : line.moveTo(x, y)));
  g.setLineDash([5, 4]);
  g.strokeStyle = p.cream;
  g.lineWidth = 2;
  g.stroke(line);
  g.setLineDash([]);

  // fog
  g.fillStyle = p.on;
  g.globalAlpha = 0.45;
  const fog = new Path2D();
  for (let k = 0; k < 3; k++) {
    const x = modp(t * 8 + k * 150, W + 160) - 80;
    fog.moveTo(x + 70, 60 + 3 * k);
    fog.ellipse(x, 60 + 3 * k, 70, 6, 0, 0, Math.PI * 2);
  }
  g.fill(fog);
  g.globalAlpha = 1;

  // three walkers on the trail
  const walkers = new Path2D();
  for (let k = 0; k < 3; k++) {
    const u = Math.min(0.99, modp(t * 0.03 + k * 0.06, 1));
    const q = trail[Math.floor(u * 24)]!;
    walkers.moveTo(q[0] + 2.3, q[1] - 10);
    walkers.arc(q[0], q[1] - 10, 2.3, 0, Math.PI * 2);
  }
  g.fillStyle = p.dark;
  g.fill(walkers);
  const bodies = new Path2D();
  for (let k = 0; k < 3; k++) {
    const u = Math.min(0.99, modp(t * 0.03 + k * 0.06, 1));
    const q = trail[Math.floor(u * 24)]!;
    bodies.moveTo(q[0], q[1] - 8);
    bodies.lineTo(q[0], q[1]);
  }
  g.strokeStyle = p.dark;
  g.lineWidth = 2;
  g.stroke(bodies);

  // the fade under the caption band
  g.fillStyle = p.dark;
  for (let i = 0; i < 10; i++) {
    g.globalAlpha = 0.07;
    const y = 46 + (i * 52) / 10;
    g.fillRect(0, y, W, 150 - y);
  }
  g.globalAlpha = 1;
  return true;
}

function drawProfile(g: CanvasRenderingContext2D, f: DrawFrame, s: State) {
  const th = f.theme;
  const c = th.color;
  const W = f.width;
  const t = f.now / 1000;
  const gw = W - 24;
  const sh = flatness(s, f.now);
  g.clearRect(0, 0, W, 128);
  g.globalAlpha = 1;
  g.save();
  g.translate(0, 44);

  const line = new Path2D();
  const area = new Path2D();
  area.moveTo(12, 72);
  for (let i = 0; i <= 60; i++) {
    const u = i / 60;
    const x = 12 + u * gw;
    const y = 72 - elev(u, sh) * 66;
    if (i) line.lineTo(x, y);
    else line.moveTo(x, y);
    area.lineTo(x, y);
  }
  area.lineTo(12 + gw, 72);
  area.closePath();
  const fill = g.createLinearGradient(0, 6, 0, 72);
  fill.addColorStop(0, mix(c.series3, c.wash, 0.55));
  fill.addColorStop(1, mix(c.series3, c.wash, 0.95));
  g.fillStyle = fill;
  g.fill(area);
  g.strokeStyle = mix(c.series3, c.text, 0.3);
  g.lineWidth = 2.5;
  g.lineJoin = "round";
  g.stroke(line);

  // the flag on the summit
  const peak = sh > 0.5 ? 0.5 : 0.45;
  const px = 12 + peak * gw;
  const py = 72 - elev(peak, sh) * 66;
  g.strokeStyle = c.text;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(px, py);
  g.lineTo(px, py - 24);
  g.stroke();
  g.fillStyle = c.primary;
  g.beginPath();
  g.moveTo(px, py - 24);
  g.lineTo(px + 14, py - 19 + 2 * Math.sin(5 * t));
  g.lineTo(px, py - 14);
  g.closePath();
  g.fill();

  // the hiker: strolls while the plan is open, sprints to the flag when it locks
  const locked = s.lockedAt > 0;
  let walk = Math.min(0.98, modp(t * 0.06, 1));
  let sprinting = false;
  if (locked) {
    const e = Math.max(0, f.now - s.lockedAt);
    const from = Math.min(0.95, modp((s.lockedAt / 1000) * 0.06, 1));
    walk = lerp(from, peak, sprint(Math.min(RUN_MS, e)));
    sprinting = e < RUN_MS;
  }
  const ax = 12 + walk * gw;
  const ay = 72 - elev(walk, sh) * 66;
  const cx = ax;
  const cy = ay - 14;
  const step = Math.sin(8 * t) * (sprinting || !locked ? 1 : 0);
  g.strokeStyle = c.text;
  g.lineCap = "round";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, cy + 6);
  g.lineTo(ax - 3 + 3 * step, ay);
  g.moveTo(cx, cy + 6);
  g.lineTo(ax + 3 - 3 * step, ay);
  g.stroke();
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(cx, cy - 2);
  g.lineTo(cx, cy + 6);
  g.stroke();
  g.fillStyle = c.primary;
  g.beginPath();
  g.roundRect(cx - 3.5 - 2.5, cy + 1 - 4, 5, 8, 1.5);
  g.fill();
  g.strokeStyle = c.text;
  g.lineWidth = 1.8;
  g.beginPath();
  if (locked) {
    g.moveTo(cx, cy);
    g.lineTo(cx - 5, cy - 8);
    g.moveTo(cx, cy);
    g.lineTo(cx + 5, cy - 8);
  } else {
    g.moveTo(cx, cy);
    g.lineTo(cx + 6, cy + 4 + 2 * step);
  }
  g.stroke();
  g.fillStyle = c.text;
  g.beginPath();
  g.arc(cx, cy - 6, 4, 0, Math.PI * 2);
  g.fill();
  g.lineCap = "butt";
  g.restore();
  return true;
}

const boots = (n: number, color: string) => (
  <svg viewBox="0 0 64 34" width={64} height={34} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
    {Array.from({ length: n }, (_, b) => (
      <g key={b} transform={`translate(${16 + 14 * b} 17)`} fill={color}>
        <rect x={-3} y={-6} width={6} height={7.8} rx={1.5} />
        <rect x={-3} y={0.6} width={9.6} height={4.2} rx={2} />
      </g>
    ))}
  </svg>
);

const carIcon = (color: string, wheel: string) => (
  <svg viewBox="0 0 36 28" width={36} height={28} aria-hidden="true" style={{ position: "absolute", left: 4, top: 3 }}>
    <g transform="translate(18 14)">
      <rect x={-13} y={-2.5} width={26} height={9} rx={3} fill={color} />
      <rect x={-8.5} y={-8} width={15} height={8} rx={3} fill={color} />
      <circle cx={-7} cy={7} r={3.2} fill={wheel} />
      <circle cx={7} cy={7} r={3.2} fill={wheel} />
    </g>
  </svg>
);

const CSS =
  "@keyframes hkPop{from{transform:scale(.2);opacity:0}to{transform:scale(1);opacity:1}}" +
  ".hk-pop{animation:hkPop .3s cubic-bezier(.34,1.56,.64,1) both}" +
  "@media (prefers-reduced-motion:reduce){.hk-pop{animation:none}}";

const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

export default defineApp<State, Action, Local>({
  name: "Hike plan from a reel",
  summary: (s) => {
    const r = route(s);
    if (s.lockedAt > 0) return `Locked: ${s.reel.title} · ${r.name} · ${hikers(s)} hiking · ${s.when.day} · ${s.when.time}`;
    return `${s.reel.title}: ${r.name} · ${hikers(s)} hiking · ${s.when.day}`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    const me = meta.user;
    if (action.t === "comfort") {
      const level = action.level;
      if (state.lockedAt > 0 || !Number.isInteger(level) || level < 0 || level > 2 || state.comfort[me] === level) return state;
      const next: State = { ...state, comfort: { ...state.comfort, [me]: level as Level } };
      const short = anyChill(next);
      return short === state.short ? next : { ...next, short, routeAt: meta.time };
    }
    if (action.t === "seat") {
      const car = state.cars.find((x) => x.id === action.car);
      if (!car || drives(state, me) || car.seats.includes(me) || !car.seats.some((x) => x === null)) return state;
      if (state.lockedAt > 0 && inCar(state, me)) return state;
      const cars = state.cars.map((x) => {
        const seats = x.seats.map((u) => (u === me ? null : u));
        if (x.id !== car.id) return { ...x, seats };
        const at = seats.findIndex((u) => u === null);
        return { ...x, seats: seats.map((u, i) => (i === at ? me : u)) };
      });
      return { ...state, cars };
    }
    if (action.t === "unseat") {
      if (state.lockedAt > 0 || !state.cars.some((x) => x.seats.includes(me))) return state;
      return { ...state, cars: state.cars.map((x) => ({ ...x, seats: x.seats.map((u) => (u === me ? null : u)) })) };
    }
    if (action.t === "lock") {
      if (state.lockedAt > 0 || state.comfort[me] === undefined || !inCar(state, me)) return state;
      return { ...state, lockedAt: meta.time };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const comfort: Record<string, Level> = {};
    for (const [u, l] of Object.entries(state.comfort)) if (inChat(ctx, u)) comfort[u] = l;
    const cars = state.cars.map((x) => {
      const gone = x.driver !== null && !inChat(ctx, x.driver);
      const seats = x.seats.map((u) => (u !== null && !inChat(ctx, u) ? null : u));
      return gone ? { ...x, driver: null, seats: [...seats, null] } : { ...x, seats };
    });
    let next: State = { ...state, comfort, cars };
    if (state.lockedAt === 0) next = { ...next, short: anyChill(next) };
    return sameJson(next, state) ? state : next;
  },

  invariants: {
    "a person is in one car at most": (s) => {
      const ids = s.cars.flatMap((x) => [...(x.driver ? [x.driver] : []), ...x.seats.filter((u): u is string => u !== null)]);
      return new Set(ids).size === ids.length;
    },
    "everyone placed is in the chat": (s, ctx) =>
      Object.keys(s.comfort).every((u) => inChat(ctx, u)) && s.cars.every((x) => (x.driver === null || inChat(ctx, x.driver)) && x.seats.every((u) => u === null || inChat(ctx, u))),
    "levels are 0, 1 or 2": (s) => [...Object.values(s.comfort), ...s.others.map((o) => o.level)].every((l) => l === 0 || l === 1 || l === 2),
    "an open plan follows the chill vote": (s) => s.lockedAt > 0 || s.short === anyChill(s),
    "cars hold 2 to 7": (s) => new Set(s.cars.map((x) => x.id)).size === s.cars.length && s.cars.every((x) => capacity(x) >= 2 && capacity(x) <= 7),
    "a flip has a time": (s) => s.routeAt >= 0 && (s.routeAt === 0 || Number.isInteger(s.routeAt)),
  },

  transitions: {
    "comfort sets only the actor's level": (p, n, a, m) =>
      a.t !== "comfort" ||
      p === n ||
      (n.comfort[m.user] === a.level && sameJson(Object.entries(p.comfort).filter(([u]) => u !== m.user), Object.entries(n.comfort).filter(([u]) => u !== m.user))),
    "a flip is stamped": (p, n, a, m) => a.t !== "comfort" || p === n || (n.short === p.short ? n.routeAt === p.routeAt : n.routeAt === m.time),
    "a seat puts only the actor in that car": (p, n, a, m) => {
      if (a.t !== "seat" || p === n) return true;
      const car = n.cars.find((x) => x.id === a.car);
      const strip = (s: State) => s.cars.map((x) => x.seats.map((u) => (u === m.user ? null : u)));
      return !!car && car.seats.includes(m.user) && sameJson(strip(p), strip(n)) && !drives(p, m.user);
    },
    "a seat takes an open spot": (p, n, a) => a.t !== "seat" || p === n || !!p.cars.find((x) => x.id === a.car)?.seats.some((u) => u === null),
    "after the lock only riderless people hop in": (p, n, a, m) => p.lockedAt === 0 || a.t !== "seat" || p === n || !inCar(p, m.user),
    "unseat frees only the actor, before the lock": (p, n, a, m) =>
      a.t !== "unseat" || p === n || (p.lockedAt === 0 && inCar(p, m.user) && !inCar(n, m.user) && sameJson(p.cars.map((x) => x.others), n.cars.map((x) => x.others))),
    "lock needs your comfort and a seat": (p, n, a, m) => a.t !== "lock" || p === n || (p.lockedAt === 0 && p.comfort[m.user] !== undefined && inCar(p, m.user) && n.lockedAt === m.time),
    "a locked plan keeps its route and comfort": (p, n) => p.lockedAt === 0 || (n.short === p.short && sameJson(n.comfort, p.comfort)),
    "capacities never change": (p, n) => p.cars.every((x) => { const y = n.cars.find((z) => z.id === x.id); return !!y && capacity(y) === capacity(x); }),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.35) return { t: "comfort", level: r.int(3) };
    if (k < 0.75) return { t: "seat", car: r.pick(s.cars).id };
    if (k < 0.85) return { t: "unseat" };
    return { t: "lock" };
  },

  local: { toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const locked = state.lockedAt > 0;
    const r = route(state);
    const mine = state.comfort[me];
    const here = members.some((m) => m.id === me);
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id;
    const member = (name: string) => members.find((m) => m.name.toLowerCase() === name.toLowerCase());
    const sharer = member(state.reel.from);
    const swapAt = state.routeAt > 0 ? running(state.routeAt, FLIP_MS) : null;
    const nameShort = swapAt !== null ? (swapAt < FLIP_MS / 2 ? !state.short : state.short) : state.short;
    const shown = nameShort ? state.flat : state.ridge;
    const nowIn = inCar(state, me);

    // ---- the reel ----
    const title = fitText(state.reel.title, W - 28, { size: 19, weight: 700, min: 13 });
    const sub = fitText(`${state.reel.account} · "${state.reel.quote}"`, W - 28, { size: 13, min: 10 });
    const noteLine = `${state.reel.from}: ${state.reel.note}`;
    const pillText = fitText(noteLine, W * 0.7 - 50, { size: 13, min: 10 });

    // ---- the difficulty check ----
    const firstChill = (() => {
      for (const m of members) if (state.comfort[m.id] === 0) return m.name;
      return state.others.find((o) => o.level === 0)?.name ?? "";
    })();
    const verdicts =
      mine === undefined
        ? ["How much climb are you up for?", "How much climb?"]
        : state.short
          ? mine === 0
            ? ["Switched to the flat version for you", "Flat version for you"]
            : [`Switched to flat for ${firstChill}`, `Flat for ${firstChill}`]
          : ["Everyone's good with the ridge", "Good with the ridge"];
    const verdictMax = W - 24 - 112;
    const verdictFit = fitText(verdicts.find((v) => textWidth(v, 13, 400) <= verdictMax) ?? verdicts[verdicts.length - 1]!, verdictMax, { size: 13, min: 11 });
    const levelW = (W - 16) / 3;
    const positiveInk = mix(c.positive, c.text, 0.3);

    const levelCards = [0, 1, 2].map((i) => {
      const faces = [
        ...members.filter((m) => state.comfort[m.id] === i).map((m) => ({ key: m.id, member: m as Member | null, name: m.name, mine: m.id === me })),
        ...state.others.filter((o) => o.level === i).map((o) => ({ key: `o:${o.name}`, member: null as Member | null, name: o.name, mine: false })),
      ];
      const total = faces.length;
      const shownFaces = faces.slice(0, 4);
      const extra = total - shownFaces.length;
      const on = mine === i;
      const fill = on ? mix(c.card, c.primary, 0.12) : c.card;
      const inner = (
        <>
          {boots(i + 1, c.text)}
          <span style={{ position: "absolute", left: 10, top: 29, fontSize: 13, lineHeight: "16px", color: c.text, whiteSpace: "nowrap" }}>{LEVELS[i]}</span>
          <span style={{ position: "absolute", right: 12, top: 7, display: "flex", flexDirection: "row-reverse", alignItems: "center" }}>
            {extra > 0 ? (
              <span style={{ marginRight: -4 }}>
                <More n={extra} size={20} />
              </span>
            ) : null}
            {[...shownFaces].reverse().map((fc) => (
              <span key={fc.key} {...(fc.mine ? { class: "hk-pop" } : {})} style={{ display: "inline-flex", flex: "none", padding: 1, borderRadius: "50%", background: fill, marginRight: -9 }}>
                {fc.member ? (
                  <Avatar user={fc.member} size={20} />
                ) : (
                  <span class="m-av" aria-hidden="true" style={{ width: 20, height: 20, fontSize: 10, background: userColor(fc.name, theme) }}>
                    {initial(fc.name)}
                  </span>
                )}
              </span>
            ))}
          </span>
        </>
      );
      const box = { position: "relative" as const, display: "block", width: levelW, height: 50, padding: 0, borderRadius: 12, border: `1px solid ${on ? c.primary : c.divider}`, background: fill, textAlign: "left" as const, color: c.text, boxSizing: "border-box" as const };
      return locked || !here ? (
        <div key={i} role="group" aria-label={`${LEVELS[i]}, ${total} people`} style={box}>
          {inner}
        </div>
      ) : (
        <button key={i} type="button" aria-label={`${LEVELS[i]}, ${total} people`} onClick={() => dispatch({ t: "comfort", level: i })} style={box}>
          {inner}
        </button>
      );
    });

    // ---- the cars ----
    const carColors = [c.series4, c.series3, c.series1];
    const cw = (W - 8 * (state.cars.length - 1)) / state.cars.length;
    const carCards = state.cars.map((car, ci) => {
      const cap = capacity(car);
      const pitch = Math.min(30, (cw - 32) / Math.max(1, cap - 1));
      const sz = pitch >= 26 ? 24 : Math.max(18, Math.round(pitch) + 6);
      const mineHere = car.seats.includes(me) || car.driver === me;
      const full = !car.seats.some((u) => u === null);
      const label = mineHere ? `Leave ${car.name}` : full ? car.name : `Take a seat in ${car.name}`;
      const nameFit = fitText(car.name, cw - 52, { size: 13, min: 10 });
      const spots: { key: string; node: unknown }[] = [];
      const face = (key: string, who: string | null, display: string) => {
        const m = who ? members.find((x) => x.id === who) : undefined;
        return m ? (
          <Avatar key={key} user={m} size={sz} />
        ) : (
          <span key={key} class="m-av" aria-hidden="true" style={{ width: sz, height: sz, fontSize: Math.max(10, Math.round(sz * 0.45)), background: userColor(display, theme) }}>
            {initial(display)}
          </span>
        );
      };
      if (car.driver) spots.push({ key: "d", node: face("d", car.driver, nameOf(car.driver)) });
      car.others.forEach((o, i) => spots.push({ key: `o${i}`, node: face(`o${i}`, null, o) }));
      car.seats.forEach((u, i) =>
        spots.push({
          key: `s${i}`,
          node: u ? (
            face(`s${i}`, u, nameOf(u))
          ) : (
            <span key={`s${i}`} aria-hidden="true" style={{ width: sz, height: sz, borderRadius: "50%", boxSizing: "border-box", border: `1.5px solid ${c.secondaryText}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: "14px", color: c.secondaryText }}>
              {nowIn ? "" : "+"}
            </span>
          ),
        }),
      );
      const inner = (
        <>
          {carIcon(carColors[ci % 3]!, p.dark)}
          <span style={{ position: "absolute", left: 44, top: 8, right: 8, fontSize: nameFit.size, lineHeight: "18px", color: c.text, whiteSpace: "nowrap" }}>{nameFit.text}</span>
          {spots.map((sp, i) => (
            <span key={sp.key} style={{ position: "absolute", left: 20 + i * pitch - sz / 2, top: 50 - sz / 2, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${c.wash}` }}>
              {sp.node as never}
            </span>
          ))}
        </>
      );
      const box = { position: "relative" as const, display: "block", width: cw, height: 74, padding: 0, borderRadius: 12, background: c.wash, textAlign: "left" as const, color: c.text };
      const idle = !here || car.driver === me || (full && !mineHere) || (locked && nowIn && !mineHere) || (locked && mineHere);
      return idle ? (
        <div key={car.id} role="group" aria-label={label} style={box}>
          {inner}
        </div>
      ) : (
        <button key={car.id} type="button" aria-label={label} onClick={() => dispatch({ t: mineHere ? "unseat" : "seat", car: car.id })} style={box}>
          {inner}
        </button>
      );
    });

    const canLock = !locked && mine !== undefined && nowIn;
    const hint = mine === undefined && !nowIn ? "Set your comfort level, then grab a seat" : mine === undefined ? "Set your comfort level to lock it" : "Grab a seat to lock it";
    const stat = fitText(r.stats, W - 24, { size: 13, min: 11 });
    const nameFit = fitText(shown.name, W - 24 - 96, { size: 15, min: 12 });
    const dayLine = fitText(`${state.when.day} · ${state.when.time}`, W - 100, { size: 15, min: 12 });
    const weather = fitText(state.weather, Math.max(60, W - dayLine.text.length * 8.4 - 16), { size: 13, min: 11 });

    return (
      <div>
        <style>{CSS}</style>
        <div style={{ position: "relative", height: 150, borderRadius: 12, overflow: "hidden" }}>
          <Canvas height={150} label={`Reel from ${state.reel.account}: ${state.reel.title}`} draw={(g, f) => drawReel(g, f)} />
          <div style={{ position: "absolute", left: 12, top: 12, height: 28, maxWidth: "70%", borderRadius: 14, padding: "0 10px 0 4px", background: p.dark, display: "flex", alignItems: "center", gap: 6 }}>
            {sharer ? (
              <Avatar user={sharer} size={20} />
            ) : (
              <span aria-hidden="true" style={{ width: 20, height: 20, flex: "none", borderRadius: 10, background: p.orange, color: p.dark, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {initial(state.reel.from)}
              </span>
            )}
            <span style={{ fontSize: pillText.size, lineHeight: "18px", color: p.on, whiteSpace: "nowrap" }}>{pillText.text}</span>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 52, background: p.dark, padding: "6px 14px", boxSizing: "border-box" }}>
            <div style={{ fontSize: title.size, fontWeight: 700, lineHeight: "24px", color: p.on, whiteSpace: "nowrap" }}>{title.text}</div>
            <div style={{ fontSize: sub.size, lineHeight: "16px", color: p.on, whiteSpace: "nowrap" }}>{sub.text}</div>
          </div>
        </div>

        <div style={{ marginTop: 12, height: 128, borderRadius: 12, background: c.wash, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0 }}>
            <Canvas height={128} label={`${shown.name}: ${shown.stats}`} draw={(g, f) => drawProfile(g, f, state)} />
          </div>
          <div style={{ position: "absolute", left: 12, top: 5, fontSize: nameFit.size, lineHeight: "20px", color: c.text, whiteSpace: "nowrap" }}>{nameFit.text}</div>
          <div style={{ position: "absolute", left: 12, top: 28, fontSize: stat.size, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap" }}>{stat.text}</div>
          {state.to ? <div style={{ position: "absolute", right: 12, top: 8, fontSize: 12, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap" }}>{`to ${state.to}`}</div> : null}
        </div>

        <div style={{ marginTop: 14, height: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 15, lineHeight: "16px", color: c.text, whiteSpace: "nowrap" }}>Difficulty check</span>
          <span style={{ fontSize: verdictFit.size, lineHeight: "16px", color: mine === undefined ? c.secondaryText : positiveInk, whiteSpace: "nowrap" }}>{verdictFit.text}</span>
        </div>
        <div style={{ marginTop: 6, display: "flex", gap: 8 }}>{levelCards}</div>

        <div style={{ marginTop: 12, height: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: dayLine.size, lineHeight: "16px", color: c.text, whiteSpace: "nowrap" }}>{dayLine.text}</span>
          <span style={{ fontSize: weather.size, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap" }}>{weather.text}</span>
        </div>
        <div style={{ marginTop: 6, display: "flex", gap: 8 }}>{carCards}</div>

        <div style={{ marginTop: 10, minHeight: 44 }}>
          {locked ? (
            <>
              <Locked detail="Trail map sent to the chat">{`Locked · ${hikers(state)} hiking`}</Locked>
              {local.toast > 0 ? <Toast key={local.toast}>{`You're in. ${state.when.word}, ${state.when.time}.`}</Toast> : null}
            </>
          ) : canLock && here ? (
            <Button
              kind="primary"
              wide
              onClick={() => {
                haptic("success");
                dispatch({ t: "lock" });
                setLocal({ toast: local.toast + 1 });
              }}
            >
              Lock it
            </Button>
          ) : (
            <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: c.secondaryText, textAlign: "center" }}>{hint}</div>
          )}
        </div>
      </div>
    );
  },
});
