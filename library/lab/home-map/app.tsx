import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  Facepile,
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

// Home map: winter break, and everyone's stories are from home. The country drawn flat with each
// friend's face on their hometown; friends close enough to meet pulse between their pins with the
// drive time and the first day they are both home. Tap a pulse (or "Meet halfway") and Muse puts a
// pin on the town in the middle; anyone can say they're in.

type Params = {
  /** Story title: "Winter break" */
  title: string;
  /** Where everyone is: lat and lon of their hometown, and the days they are home ("Dec 20") */
  homes: { who: string; town: string; lat: number; lon: number; from: string; to: string; said?: string }[];
  /** Towns Muse can suggest as a halfway point */
  stops: { name: string; lat: number; lon: number }[];
  /** Friends this close (miles) get a pulse */
  near: number;
  /** Meetups already suggested: the two names, and who else is in */
  meetups: { a: string; b: string; by: string; inn: string[] }[];
};

// @params
const P: Params = {
  title: "Winter break",
  homes: [
    { who: "Arun", town: "Edison, NJ", lat: 40.52, lon: -74.41, from: "Dec 19", to: "Jan 10", said: "rice cooker came home with me" },
    { who: "Calvin", town: "Philadelphia", lat: 39.95, lon: -75.17, from: "Dec 22", to: "Jan 8", said: "home. alarms set to vacation mode (5 of them)" },
    { who: "Maya", town: "Denver", lat: 39.74, lon: -104.99, from: "Dec 18", to: "Jan 12" },
    { who: "Tsai Lin", town: "Fremont, CA", lat: 37.55, lon: -121.99, from: "Dec 20", to: "Jan 9" },
    { who: "Will", town: "Burlington, VT", lat: 44.48, lon: -73.21, from: "Dec 21", to: "Jan 7", said: "drove the Sube 6 hours, zero showers" },
    { who: "Aditya", town: "Austin", lat: 30.27, lon: -97.74, from: "Dec 20", to: "Jan 9" },
  ],
  stops: [
    { name: "Princeton, NJ", lat: 40.35, lon: -74.66 },
    { name: "Albany, NY", lat: 42.65, lon: -73.75 },
    { name: "Kansas City", lat: 39.1, lon: -94.58 },
    { name: "Salt Lake City", lat: 40.76, lon: -111.89 },
  ],
  near: 300,
  meetups: [],
};
// @end params

type Home = { id: string; name: string; town: string; lat: number; lon: number; from: number; to: number; said: string };
type Meet = { a: string; b: string; place: string; day: number; by: string; at: number; inn: string[] };
type State = { title: string; homes: Home[]; stops: { name: string; lat: number; lon: number }[]; near: number; meets: Meet[] };
type Action = { t: "suggest"; a: string; b: string } | { t: "join"; i: number };
type Local = { cheers: number; pick: string };

const PANEL = 556;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const findMember = (ctx: Ctx, name: string): Member | undefined => {
  const k = name.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k) : undefined;
};
/** "Dec 20" -> a day number where Jan follows Dec (break wraps the new year). */
function dayOf(s: unknown): number {
  const m = clean(s, 12).match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})$/);
  if (!m) return -1;
  const mi = MONTHS.findIndex((x) => x.toLowerCase() === m[1]!.toLowerCase());
  if (mi < 0) return -1;
  const d = Math.min(31, Math.max(1, Number(m[2])));
  return (mi < 6 ? mi + 12 : mi) * 31 + d;
}
const dayName = (n: number) => (n < 0 ? "" : `${MONTHS[Math.floor(n / 31) % 12]} ${n % 31 || 31}`);
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

function miles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3959;
  const r = Math.PI / 180;
  const dl = (b.lat - a.lat) * r;
  const dn = (b.lon - a.lon) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Driving time, roughly: 1.2 x the straight line at 55 mph, to the nearest 10 minutes. */
const driveMin = (mi: number) => Math.max(10, Math.round((mi * 1.2 * 60) / 55 / 10) * 10);
const driveText = (min: number) => (min < 60 ? `${min} min` : min % 60 === 0 ? `${min / 60} hr` : min < 120 ? `${min} min` : `${Math.floor(min / 60)} hr ${min % 60}`);

type Pair = { a: Home; b: Home; mi: number; min: number; day: number };
function pairsOf(s: State): Pair[] {
  const out: Pair[] = [];
  for (let i = 0; i < s.homes.length; i++)
    for (let j = i + 1; j < s.homes.length; j++) {
      const a = s.homes[i]!;
      const b = s.homes[j]!;
      const mi = miles(a, b);
      const day = Math.max(a.from, b.from);
      if (mi <= s.near && day <= Math.min(a.to, b.to)) out.push({ a, b, mi, min: driveMin(mi), day });
    }
  return out.sort((x, y) => x.mi - y.mi);
}
function halfway(s: State, a: Home, b: Home): string {
  const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
  let best = "";
  let bd = Infinity;
  for (const st of s.stops) {
    const d = miles(st, mid);
    if (d < bd) {
      bd = d;
      best = st.name;
    }
  }
  return best && bd <= Math.max(60, miles(a, b) / 2) ? best : "halfway";
}
const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function initState(ctx: Ctx): State {
  const homes: Home[] = [];
  for (const h of Array.isArray(P.homes) ? P.homes : []) {
    if (homes.length >= 12) break;
    const name = clean(h?.who, 20);
    const lat = num(h?.lat, 24, 50);
    const lon = num(h?.lon, -125, -66);
    if (!name || lat === null || lon === null) continue;
    const m = findMember(ctx, name);
    const id = m ? m.id : `o:${name}`;
    if (homes.some((x) => x.id === id)) continue;
    let from = dayOf(h.from);
    let to = dayOf(h.to);
    if (from < 0) from = dayOf("Dec 20");
    if (to < from) to = from + 14;
    homes.push({ id, name: m ? m.name : name, town: clean(h.town, 22) || "home", lat, lon, from, to, said: clean(h.said, 60) });
  }
  const stops: State["stops"] = [];
  for (const st of Array.isArray(P.stops) ? P.stops : []) {
    const name = clean(st?.name, 22);
    const lat = num(st?.lat, 20, 55);
    const lon = num(st?.lon, -130, -60);
    if (name && lat !== null && lon !== null && stops.length < 16) stops.push({ name, lat, lon });
  }
  const near = num(P.near, 20, 1500) ?? 300;
  const s: State = { title: clean(P.title, 24) || "Home for the break", homes, stops, near: Math.round(near), meets: [] };
  const pairs = pairsOf(s);
  for (const mt of Array.isArray(P.meetups) ? P.meetups : []) {
    const ida = homes.find((x) => x.name.toLowerCase() === clean(mt?.a, 20).toLowerCase())?.id;
    const idb = homes.find((x) => x.name.toLowerCase() === clean(mt?.b, 20).toLowerCase())?.id;
    const by = findMember(ctx, clean(mt?.by, 20))?.id;
    const pr = ida && idb ? pairs.find((q) => key(q.a.id, q.b.id) === key(ida, idb)) : undefined;
    if (!pr || !by || s.meets.some((x) => key(x.a, x.b) === key(pr.a.id, pr.b.id))) continue;
    const inn = [by];
    for (const n of Array.isArray(mt.inn) ? mt.inn : []) {
      const id = findMember(ctx, clean(n, 20))?.id;
      if (id && !inn.includes(id)) inn.push(id);
    }
    s.meets.push({ a: pr.a.id, b: pr.b.id, place: halfway(s, pr.a, pr.b), day: pr.day, by, at: 0, inn });
  }
  return s;
}

// ---- The country -------------------------------------------------------------------------------

const US: [number, number][] = [
  [-124.7, 48.4], [-122.8, 49], [-95.2, 49], [-94.8, 49.4], [-89.6, 48], [-84.8, 46.6], [-82.5, 45.3], [-82.4, 43], [-79, 43.4], [-76.5, 44], [-75, 45], [-71.5, 45],
  [-69.2, 47.4], [-67.8, 47.1], [-67, 44.8], [-70, 43.6], [-70.6, 42.6], [-70, 41.7], [-71.9, 41.3], [-74, 40.6], [-74.2, 39.6], [-75.5, 38.5], [-76, 37], [-75.6, 35.6],
  [-77, 34.6], [-79, 33.5], [-81, 31.8], [-81.4, 30.3], [-80.1, 26.9], [-80.4, 25.2], [-81.8, 25.9], [-82.8, 27.9], [-83.7, 29.9], [-85.3, 29.7], [-86.5, 30.4], [-89.6, 30.2],
  [-89.4, 29], [-90.9, 29.1], [-93.8, 29.7], [-95.3, 28.9], [-97.2, 27.6], [-97.4, 25.9], [-99.2, 26.5], [-101.4, 29.8], [-103.3, 29], [-104.5, 29.6], [-106.5, 31.8],
  [-108.2, 31.3], [-111.1, 31.3], [-114.8, 32.5], [-117.1, 32.5], [-118.5, 34], [-120.6, 34.6], [-121.9, 36.6], [-122.5, 37.8], [-123.8, 39.8], [-124.2, 41.9], [-124, 44], [-124, 46.3],
];
const LAKES: [number, number, number, number][] = [[-87.0, 43.8, 1.0, 2.6], [-88.2, 47.6, 3.2, 0.7], [-82.4, 44.6, 1.2, 1.3], [-81.2, 42.2, 2.4, 0.6]];
const COS = Math.cos((39 * Math.PI) / 180);
function proj(w: number, h: number) {
  const sx = w / ((125.5 - 66.5) * COS);
  const sy = h / 26;
  const s = Math.min(sx, sy);
  const ox = (w - 59 * COS * s) / 2;
  const oy = (h - 26 * s) / 2;
  return (lat: number, lon: number) => ({ x: ox + (lon + 125.5) * COS * s, y: oy + (49.8 - lat) * s });
}

type Proj = (lat: number, lon: number) => { x: number; y: number };
type Inset = { cx: number; cy: number; ix: number; iy: number; r: number; z: number; ids: string[]; zat: Proj };
/** Friends too close to tell apart on the country get a round loupe in a corner of the map. */
function insetOf(s: State, w: number, h: number): Inset | null {
  const at = proj(w, h);
  let best: [Home, Home, number] | null = null;
  for (let i = 0; i < s.homes.length; i++)
    for (let j = i + 1; j < s.homes.length; j++) {
      const a = at(s.homes[i]!.lat, s.homes[i]!.lon);
      const b = at(s.homes[j]!.lat, s.homes[j]!.lon);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 36 && (!best || d < best[2])) best = [s.homes[i]!, s.homes[j]!, d];
    }
  if (!best) return null;
  const a = at(best[0].lat, best[0].lon);
  const b = at(best[1].lat, best[1].lon);
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const r = Math.min(62, h * 0.26);
  const z = Math.min(10, Math.max(2.5, (r * 1.1) / Math.max(4, best[2])));
  const spots = s.homes.map((x) => at(x.lat, x.lon));
  const right = { ix: w - r - 10, iy: h - r - 10 };
  const left = { ix: r + 10, iy: h - r - 10 };
  const clear = (o: { ix: number; iy: number }) => spots.every((q) => Math.hypot(q.x - o.ix, q.y - o.iy) > r + 14);
  const o = clear(right) || !clear(left) ? right : left;
  const zat: Proj = (lat, lon) => {
    const q = at(lat, lon);
    return { x: o.ix + (q.x - cx) * z, y: o.iy + (q.y - cy) * z };
  };
  const ids = s.homes.filter((x) => {
    const q = zat(x.lat, x.lon);
    return Math.hypot(q.x - o.ix, q.y - o.iy) < r - 12;
  }).map((x) => x.id);
  return { cx, cy, ix: o.ix, iy: o.iy, r, z, ids, zat };
}

function drawWorld(g: CanvasRenderingContext2D, at: Proj, s: State, pairs: Pair[], pick: string, p: ReturnType<typeof pal>, t: number, k: number) {
  g.fillStyle = mix(p.grass, p.paper, 0.35);
  g.strokeStyle = mix(p.leaf, p.paper, 0.25);
  g.lineWidth = 1.5;
  g.beginPath();
  US.forEach(([lon, lat], i) => {
    const q = at(lat, lon);
    if (i === 0) g.moveTo(q.x, q.y);
    else g.lineTo(q.x, q.y);
  });
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = mix(p.sky, p.blue, 0.15);
  g.beginPath();
  for (const [lon, lat, rx, ry] of LAKES) {
    const q = at(lat, lon);
    const r = at(lat - ry, lon + rx);
    g.moveTo(q.x + Math.abs(r.x - q.x), q.y);
    g.ellipse(q.x, q.y, Math.abs(r.x - q.x), Math.abs(r.y - q.y), 0, 0, Math.PI * 2);
  }
  g.fill();
  const peaks = [[-113, 46], [-110.5, 43.6], [-107.5, 40.5], [-106, 37.8], [-116, 41], [-120.5, 40.5]] as const;
  for (const [fill, top] of [[mix(p.leaf, p.paper, 0.3), 0], [p.paper, 1]] as const) {
    g.fillStyle = fill;
    g.beginPath();
    for (const [lon, lat] of peaks) {
      const q = at(lat, lon);
      if (top) {
        g.moveTo(q.x - 3, q.y - 2.5);
        g.lineTo(q.x, q.y - 7);
        g.lineTo(q.x + 3, q.y - 2.5);
      } else {
        g.moveTo(q.x - 9, q.y + 6);
        g.lineTo(q.x, q.y - 7);
        g.lineTo(q.x + 9, q.y + 6);
      }
    }
    g.fill();
  }
  for (const pr of pairs) {
    const a = at(pr.a.lat, pr.a.lon);
    const b = at(pr.b.lat, pr.b.lon);
    const kk = key(pr.a.id, pr.b.id);
    const m = s.meets.find((x) => key(x.a, x.b) === kk);
    g.strokeStyle = m ? p.primary : p.orange;
    g.lineWidth = kk === pick ? 4 : 3;
    g.setLineDash([5, 5]);
    g.lineDashOffset = -t * 18;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    g.setLineDash([]);
    const ph = (t * 0.9 + pr.mi / 97) % 1;
    g.globalAlpha = 1 - ph;
    g.lineWidth = 2;
    g.beginPath();
    for (const q of [a, b]) {
      g.moveTo(q.x + 10 + 16 * ph * k, q.y);
      g.arc(q.x, q.y, 10 + 16 * ph * k, 0, Math.PI * 2);
    }
    g.stroke();
    g.globalAlpha = 1;
    if (m) {
      const st = s.stops.find((x) => x.name === m.place);
      const q = st ? at(st.lat, st.lon) : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      g.fillStyle = p.primary;
      g.beginPath();
      g.arc(q.x, q.y - 11, 7, Math.PI, 0);
      g.lineTo(q.x, q.y);
      g.closePath();
      g.fill();
      g.fillStyle = p.on;
      g.beginPath();
      g.arc(q.x, q.y - 11, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function drawMap(g: CanvasRenderingContext2D, f: DrawFrame, s: State, pairs: Pair[], pick: string, theme: Theme): boolean {
  const p = pal(theme);
  const w = f.width;
  const h = f.height;
  const t = f.now / 1000;
  const at = proj(w, h);
  g.fillStyle = mix(p.sky, p.blue, 0.15);
  g.fillRect(0, 0, w, h);
  g.fillStyle = p.paper;
  g.globalAlpha = 0.7;
  g.beginPath();
  for (let k = 0; k < 26; k++) {
    const x = (k * 97.3) % w;
    const y = (k * 53.1 + t * (8 + (k % 5) * 3)) % h;
    g.moveTo(x + 1.6, y);
    g.arc(x, y, 1.6, 0, Math.PI * 2);
  }
  g.fill();
  g.globalAlpha = 1;
  const ins = insetOf(s, w, h);
  drawWorld(g, at, s, ins ? pairs.filter((q) => !(ins.ids.includes(q.a.id) && ins.ids.includes(q.b.id))) : pairs, pick, p, t, 1);
  if (ins) {
    // Friends inside the loupe show as dots on the country.
    g.fillStyle = p.ink;
    g.beginPath();
    for (const x of s.homes) if (ins.ids.includes(x.id)) {
      const q = at(x.lat, x.lon);
      g.moveTo(q.x + 3, q.y);
      g.arc(q.x, q.y, 3, 0, Math.PI * 2);
    }
    g.fill();
    const rr = ins.r / ins.z;
    g.strokeStyle = p.ink;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(ins.cx, ins.cy, rr, 0, Math.PI * 2);
    const ang = Math.atan2(ins.iy - ins.cy, ins.ix - ins.cx);
    g.moveTo(ins.cx + rr * Math.cos(ang), ins.cy + rr * Math.sin(ang));
    g.lineTo(ins.ix - ins.r * Math.cos(ang), ins.iy - ins.r * Math.sin(ang));
    g.stroke();
    g.save();
    g.beginPath();
    g.arc(ins.ix, ins.iy, ins.r, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = mix(p.sky, p.blue, 0.15);
    g.fillRect(ins.ix - ins.r, ins.iy - ins.r, ins.r * 2, ins.r * 2);
    drawWorld(g, ins.zat, s, pairs, pick, p, t, 1);
    g.restore();
    g.strokeStyle = p.card;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(ins.ix, ins.iy, ins.r, 0, Math.PI * 2);
    g.stroke();
  }
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Home map",
  summary: (s) => {
    const pairs = pairsOf(s);
    if (s.meets.length) {
      const m = s.meets[s.meets.length - 1]!;
      return `${s.title}: meetup in ${m.place} ${dayName(m.day)} · ${m.inn.length} in`;
    }
    return `${s.title}: ${s.homes.length} friends home · ${pairs.length} ${pairs.length === 1 ? "pair" : "pairs"} close enough to meet`;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "suggest") {
      if (typeof a.a !== "string" || typeof a.b !== "string") return s;
      const k = key(a.a, a.b);
      if (s.meets.some((m) => key(m.a, m.b) === k)) return s;
      const pr = pairsOf(s).find((q) => key(q.a.id, q.b.id) === k);
      if (!pr) return s;
      return { ...s, meets: [...s.meets, { a: pr.a.id, b: pr.b.id, place: halfway(s, pr.a, pr.b), day: pr.day, by: meta.user, at: meta.time, inn: [meta.user] }] };
    }
    if (a.t === "join") {
      const i = a.i;
      if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= s.meets.length) return s;
      const m = s.meets[i]!;
      const inn = m.inn.includes(meta.user) ? m.inn.filter((u) => u !== meta.user) : [...m.inn, meta.user];
      return { ...s, meets: s.meets.map((x, j) => (j === i ? { ...x, inn } : x)) };
    }
    return s;
  },

  onMembers: (s, ctx) => (s.meets.every((m) => m.inn.every((u) => inChat(ctx, u))) ? s : { ...s, meets: s.meets.map((m) => ({ ...m, inn: m.inn.filter((u) => inChat(ctx, u)) })) }),

  invariants: {
    "one meetup per pair": (s) => new Set(s.meets.map((m) => key(m.a, m.b))).size === s.meets.length,
    "meetups join two friends on the map": (s) => s.meets.every((m) => m.a !== m.b && s.homes.some((h) => h.id === m.a) && s.homes.some((h) => h.id === m.b)),
    "people in once each, all in the chat": (s, ctx) => s.meets.every((m) => new Set(m.inn).size === m.inn.length && m.inn.every((u) => inChat(ctx, u))),
    "homes are on the map with real days": (s) => s.homes.every((h) => h.lat >= 24 && h.lat <= 50 && h.lon >= -125 && h.lon <= -66 && h.from <= h.to),
    "meetup days are when both are home": (s) =>
      s.meets.every((m) => {
        const a = s.homes.find((h) => h.id === m.a);
        const b = s.homes.find((h) => h.id === m.b);
        return !!a && !!b && m.day === Math.max(a.from, b.from) && m.day <= Math.min(a.to, b.to);
      }),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "a suggestion adds one meetup with me in it": (p, n, a, m) => {
      if (a.t !== "suggest" || p === n) return true;
      const x = n.meets[n.meets.length - 1];
      return n.meets.length === p.meets.length + 1 && p.meets.every((q, i) => n.meets[i] === q) && !!x && x.by === m.user && x.at === m.time && x.inn.length === 1 && x.inn[0] === m.user && (a.a < a.b ? `${a.a}|${a.b}` : `${a.b}|${a.a}`) === (x.a < x.b ? `${x.a}|${x.b}` : `${x.b}|${x.a}`);
    },
    "a suggestion goes to the nearest town": (p, n, a) => {
      if (a.t !== "suggest" || p === n) return true;
      const x = n.meets[n.meets.length - 1]!;
      const A = n.homes.find((h) => h.id === x.a)!;
      const B = n.homes.find((h) => h.id === x.b)!;
      const mid = { lat: (A.lat + B.lat) / 2, lon: (A.lon + B.lon) / 2 };
      const d = (q: { lat: number; lon: number }) => (q.lat - mid.lat) ** 2 + ((q.lon - mid.lon) * Math.cos((mid.lat * Math.PI) / 180)) ** 2;
      const near = [...n.stops].sort((u, v) => d(u) - d(v))[0];
      return x.place === "halfway" || x.place === near?.name;
    },
    "joining toggles only me on one meetup": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      if (n.meets.length !== p.meets.length) return false;
      return n.meets.every((q, i) => {
        const o = p.meets[i]!;
        if (i !== a.i) return q === o;
        const was = o.inn.includes(m.user);
        const now = q.inn.includes(m.user);
        return was !== now && q.inn.filter((u) => u !== m.user).join() === o.inn.filter((u) => u !== m.user).join() && q.place === o.place && q.day === o.day;
      });
    },
    "the map never moves": (p, n) => p.homes === n.homes && p.stops === n.stops && p.near === n.near,
  },

  arbitrary: (s, _u, r) => {
    const pairs = pairsOf(s);
    if (s.meets.length && r.next() < 0.5) return { t: "join", i: r.int(s.meets.length) };
    if (pairs.length) {
      const q = r.pick(pairs);
      return r.next() < 0.5 ? { t: "suggest", a: q.a.id, b: q.b.id } : { t: "suggest", a: q.b.id, b: q.a.id };
    }
    return { t: "join", i: 0 };
  },

  local: { cheers: 0, pick: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const MW = W - 24;
    const MAP_TOP = 100;
    const MH = Math.round(Math.min(280, MW * 0.74));
    const at = proj(MW, MH);
    const pairs = pairsOf(state);
    const face = (h: Home): Member => members.find((m) => m.id === h.id) ?? { id: h.id, name: h.name };
    const meetOf = (pr: Pair) => state.meets.findIndex((m) => key(m.a, m.b) === key(pr.a.id, pr.b.id));
    const suggest = (pr: Pair) => {
      haptic("success");
      setLocal({ pick: key(pr.a.id, pr.b.id), cheers: local.cheers + 1 });
      dispatch({ t: "suggest", a: pr.a.id, b: pr.b.id });
    };
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "up") return;
      const zi = insetOf(state, MW, MH);
      let best: Pair | null = null;
      let bd = 18;
      for (const pr of pairs) {
        const inZ = !!zi && zi.ids.includes(pr.a.id) && zi.ids.includes(pr.b.id);
        const a = inZ ? zi!.zat(pr.a.lat, pr.a.lon) : at(pr.a.lat, pr.a.lon);
        const b = inZ ? zi!.zat(pr.b.lat, pr.b.lon) : at(pr.b.lat, pr.b.lon);
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const L = vx * vx + vy * vy || 1;
        const u = Math.max(0, Math.min(1, ((e.x - a.x) * vx + (e.y - a.y) * vy) / L));
        const d = Math.hypot(a.x + u * vx - e.x, a.y + u * vy - e.y);
        if (d < bd) {
          bd = d;
          best = pr;
        }
      }
      if (best) setLocal({ pick: key(best.a.id, best.b.id) });
    };
    const shownPairs = (() => {
      const picked = pairs.find((q) => key(q.a.id, q.b.id) === local.pick);
      const rest = pairs.filter((q) => q !== picked);
      return (picked ? [picked, ...rest] : rest).slice(0, 2);
    })();
    const said = state.homes.filter((h) => h.said && members.some((m) => m.id === h.id));
    const quote = said[said.length - 1];
    const latest = [...state.meets].sort((a, b) => b.at - a.at)[0];
    const fresh = latest && latest.at > 0 && latest.by === me && running(latest.at, 2400) !== null;

    // Faces sit on their towns; labels go below unless that runs off the map.
    const ins = insetOf(state, MW, MH);
    const pins = state.homes.map((h) => {
      const zoomed = !!ins && ins.ids.includes(h.id);
      const q = zoomed ? ins!.zat(h.lat, h.lon) : at(h.lat, h.lon);
      return { h, x: q.x, y: q.y, zoomed };
    });

    return (
      <div>
        <style>{"@keyframes hmIn{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}"}</style>
        <div style={{ position: "relative", height: PANEL, borderRadius: 12, overflow: "hidden", background: mix(p.blue, p.dark, 0.6), color: p.on }}>
          <div aria-hidden="true" style={{ position: "absolute", left: 8, right: 8, top: 8, height: 3, display: "flex", gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < 2 ? p.on : mix(p.on, p.dark, 0.55) }} />
            ))}
          </div>
          <div style={{ position: "absolute", left: 11, right: 12, top: 18, height: 32, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
            <span style={{ width: 32, height: 32, flex: "none", borderRadius: 16, background: p.on, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none" stroke={c.primary} stroke-width="4">
                <circle cx="11" cy="11" r="8" />
              </svg>
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: p.on, flex: "none" }}>Muse</span>
            <span style={{ fontSize: 15, color: p.on, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`from ${state.homes.length} stories`}</span>
          </div>
          <div style={{ position: "absolute", left: 16, right: 16, top: 56, fontSize: 26, fontWeight: 800, lineHeight: "34px", color: p.on, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>{state.title}</div>

          <div style={{ position: "absolute", left: 12, top: MAP_TOP, width: MW, height: MH, borderRadius: 14, overflow: "hidden" }}>
            <Canvas height={MH} label={`Map with ${state.homes.length} hometowns and ${pairs.length} pairs close enough to meet`} draw={(g, f) => drawMap(g, f, state, pairs, local.pick, theme)} onPointer={onPointer} />
            {pins.map(({ h, x, y, zoomed }) => {
              const lbl = fitText(zoomed ? h.name : h.town, zoomed ? 70 : 92, { size: 11, weight: 600, min: 9 });
              const below = zoomed ? y < ins!.iy : y + 34 < MH;
              const lx = Math.min(MW - 48, Math.max(48, x));
              return (
                <div key={h.id} style={{ pointerEvents: "none" }}>
                  <span style={{ position: "absolute", left: x - 13, top: y - 13, display: "flex", borderRadius: 14, boxShadow: `0 0 0 2px ${h.id === me ? c.primary : c.card}` }}>
                    <Avatar user={face(h)} size={26} />
                  </span>
                  <span style={{ position: "absolute", left: lx - 46, width: 92, top: below ? y + 15 : y - 33, textAlign: "center" }}>
                    <span style={{ padding: "1px 6px", borderRadius: 8, background: c.card, color: c.text, fontSize: lbl.size, fontWeight: 600, lineHeight: "16px", whiteSpace: "nowrap" }}>{lbl.text}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ position: "absolute", left: 12, right: 12, top: MAP_TOP + MH + 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {shownPairs.length === 0 ? (
              <div style={{ borderRadius: 14, background: c.card, color: c.text, padding: "12px 14px", fontSize: 14, lineHeight: "20px" }}>
                {state.homes.length < 2 ? "Post a story from home and your pin shows up here" : "Nobody is close enough to meet this break"}
              </div>
            ) : null}
            {shownPairs.map((pr, idx) => {
              const mi = meetOf(pr);
              const m = mi >= 0 ? state.meets[mi]! : null;
              const iIn = !!m && m.inn.includes(me);
              const primary = idx === 0;
              const line1 = `${pr.a.name} and ${pr.b.name}`;
              const line2 = m ? `${m.place === "halfway" ? "Halfway" : m.place} · ${dayName(m.day)} · ${m.inn.length} in` : `${driveText(pr.min)} drive · ${dayName(pr.day)}`;
              return (
                <div key={key(pr.a.id, pr.b.id)} style={{ borderRadius: 14, background: c.card, color: c.text, padding: "8px 8px 8px 12px", display: "flex", alignItems: "center", gap: 10, boxShadow: key(pr.a.id, pr.b.id) === local.pick ? `0 0 0 2px ${p.orange}` : undefined, animation: m && m.at > 0 && running(m.at, 600) !== null ? "hmIn 400ms ease-out both" : undefined }}>
                  <Facepile users={[face(pr.a), face(pr.b)]} max={2} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, lineHeight: "20px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line1}</div>
                    <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line2}</div>
                  </div>
                  {m ? (
                    <Button kind={iIn ? "secondary" : primary ? "primary" : "secondary"} onClick={() => dispatch({ t: "join", i: mi })}>
                      {iIn ? "You're in" : "I'm in"}
                    </Button>
                  ) : (
                    <Button kind={primary ? "primary" : "secondary"} onClick={() => suggest(pr)}>
                      Meet halfway
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ position: "absolute", left: 16, right: 16, top: 528, height: 20, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: p.on, pointerEvents: "none" }}>
            {quote ? (
              <>
                <span style={{ fontWeight: 700, flex: "none" }}>{quote.name}</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`"${quote.said}"`}</span>
              </>
            ) : (
              <span>Tap a dotted line to see who can meet</span>
            )}
          </div>
          {fresh ? (
            <div style={{ position: "absolute", left: "50%", top: MAP_TOP + MH / 2, pointerEvents: "none" }}>
              <Burst key={local.cheers} emoji="📍" />
            </div>
          ) : null}
        </div>
        {fresh && latest ? <Toast key={local.cheers}>{`Suggested ${latest.place === "halfway" ? "a halfway spot" : latest.place}`}</Toast> : null}
      </div>
    );
  },
});
