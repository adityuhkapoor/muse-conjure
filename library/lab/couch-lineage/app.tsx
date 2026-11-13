import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  CardHeader,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  running,
  tween,
  type Ctx,
  type DrawFrame,
  type Theme,
} from "@muse/app";

// Couch lineage: a listing's life inside the friend group as a price curve, one face per owner.
// Tap an owner (or Play) and the drawn couch hops back to their era and its lore; "Keep it" extends
// the curve to you, and a line forms for the next owner if you let go.

type Params = {
  /** Card title: "This couch has lore" */
  title: string;
  /** What it is: "green velvet couch" */
  item: string;
  /** 2 to 8 owners, oldest first; the last is the current seller. Years run forward. */
  eras: { who: string; year: number; paidCents: number; place: string; lore: string }[];
  /** The year the next owner would take it */
  next: number;
};

// @params
const P: Params = {
  title: "This couch has lore",
  item: "green velvet couch",
  eras: [
    { who: "Theo", year: 2019, paidCents: 90000, place: "bought new", lore: "carried up 4 floors by 6 people" },
    { who: "Dani", year: 2021, paidCents: 40000, place: "Northside apt", lore: "survived the flood party" },
    { who: "Sam", year: 2022, paidCents: 25000, place: "Unit 2, Haste", lore: "movie marathon HQ: 41 films" },
    { who: "Maya", year: 2024, paidCents: 18000, place: "Apt 4B", lore: "the soy sauce incident (barely visible)" },
    { who: "Jules", year: 2026, paidCents: 15000, place: "listed now", lore: "moving to NYC, couch can't come" },
  ],
  next: 2027,
};
// @end params

type Era = { who: string; user: string | null; year: number; paid: number; place: string; lore: string };
type State = {
  title: string;
  item: string;
  eras: Era[];
  next: number;
  keeper: string | null;
  keptAt: number;
  line: string[];
};
type Action = { t: "keep" } | { t: "line" } | { t: "release" };
/** sel -1 = the default owner; selAt and playAt are clock ms; from is where the couch was (an owner index, may be fractional), -1 = on the seller. */
type Local = { sel: number; selAt: number; playAt: number; from: number };

const FALLBACK = [
  { who: "Theo", year: 2019, paidCents: 90000, place: "bought new", lore: "carried up 4 floors by 6 people" },
  { who: "Dani", year: 2021, paidCents: 40000, place: "Northside apt", lore: "survived the flood party" },
  { who: "Sam", year: 2022, paidCents: 25000, place: "Unit 2, Haste", lore: "movie marathon HQ: 41 films" },
  { who: "Maya", year: 2024, paidCents: 18000, place: "Apt 4B", lore: "the soy sauce incident (barely visible)" },
  { who: "Jules", year: 2026, paidCents: 15000, place: "listed now", lore: "moving to NYC, couch can't come" },
];
const MAX_LINE = 11;
const RIDE = 700;
const EXTEND = 600;
const STEP = 1100;
const PLOT_H = 196;
const ride = tween({ duration: RIDE, easing: "standard" });

/** Server-aligned now. The clock signal only advances while something reads it, so a tap after a quiet spell would stamp a stale time: ask `running` (which checks the live time) to narrow it down. */
function freshNow(): number {
  let lo = clock.value - 1;
  let hi = lo + 3_600_000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (running(mid, 1) === null) lo = mid;
    else hi = mid;
  }
  return hi;
}
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seller = (s: State) => s.eras[s.eras.length - 1]!;
const price = (s: State) => seller(s).paid;
const owners = (s: State) => s.eras.length + (s.keeper ? 1 : 0);
const money = (c: number) => (c % 100 === 0 ? `$${Math.round(c / 100)}` : `$${(c / 100).toFixed(2)}`);
const nameOf = (ctx: { members: { id: string; name: string }[] }, id: string) => ctx.members.find((m) => m.id === id)?.name ?? "Someone";
const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? `${n}th` : `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`);
const easeOut = (k: number) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
const easeBack = (k: number) => {
  const x = Math.min(1, Math.max(0, k)) - 1;
  return 1 + 2.70158 * x * x * x + 1.70158 * x * x;
};

function buildEras(raw: unknown, ctx: Ctx): Era[] {
  const out: Era[] = [];
  let prev = 0;
  for (const e of Array.isArray(raw) ? raw : []) {
    if (out.length >= 8) break;
    if (!e || typeof e !== "object") continue;
    const who = clean(e.who, 16);
    const year = e.year;
    if (!who || !Number.isInteger(year) || year < 1990 || year > 2100 || year < prev) continue;
    const paid = Number.isInteger(e.paidCents) && e.paidCents >= 0 && e.paidCents <= 10_000_000 ? e.paidCents : 0;
    const want = who.toLowerCase();
    const m = ctx.members.find((x) => x.id === who || (x.name ?? "").trim().toLowerCase() === want);
    out.push({ who, user: m ? m.id : null, year, paid, place: clean(e.place, 20), lore: clean(e.lore, 48) });
    prev = year;
  }
  return out;
}

function initState(ctx: Ctx): State {
  let eras = buildEras(P.eras, ctx);
  if (eras.length < 2) eras = buildEras(FALLBACK, ctx);
  const last = eras[eras.length - 1]!.year;
  return {
    title: clean(P.title, 40) || "This couch has lore",
    item: clean(P.item, 32) || "couch",
    eras,
    next: Number.isInteger(P.next) ? Math.max(P.next, last + 1) : last + 1,
    keeper: null,
    keptAt: 0,
    line: [],
  };
}

// ---- the picture ----

type Pt = { x: number; y: number };
type Geo = { W: number; left: number; right: number; top: number; bottom: number; maxV: number; x0: number; pts: Pt[]; xof(y: number): number; yof(v: number): number };

function geo(s: State, W: number): Geo {
  const left = 44, right = W - 26, top = 36, bottom = 162;
  const maxV = Math.max(30000, Math.ceil(Math.max(...s.eras.map((e) => e.paid)) / 30000) * 30000);
  const x0 = s.eras[0]!.year - 0.4;
  const xof = (y: number) => left + ((y - x0) / (s.next - x0)) * (right - left);
  const yof = (v: number) => bottom - (v / maxV) * (bottom - top);
  const pts = s.eras.map((e) => ({ x: xof(e.year), y: yof(e.paid) }));
  if (s.keeper) pts.push({ x: xof(s.next), y: yof(price(s)) });
  return { W, left, right, top, bottom, maxV, x0, pts, xof, yof };
}

/** Uniform Catmull-Rom through the points, endpoints clamped; s is a fractional point index. */
function cr(pts: Pt[], s: number): Pt {
  const last = pts.length - 1;
  const q = Math.min(Math.max(s, 0), last);
  const i = Math.min(Math.floor(q), last - 1);
  const t = q - i;
  const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? pts[last]!;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

/** Where the couch is: easing from `from` to `to` over RIDE ms from `at`. */
function rideAt(from: number, to: number, at: number, now: number): number {
  const e = now - at;
  if (e >= RIDE) return to;
  if (e <= 0) return from;
  return from + (to - from) * ride(e);
}

type Focus = { sel: number; at: number; from: number; touring: boolean; loreAt: number };

function focusOf(s: State, local: Local, tour: number | null): Focus {
  const n = s.eras.length;
  const dflt = s.keeper ? n : n - 1;
  const clampFrom = (v: number) => (v < 0 ? n - 1 : Math.min(v, dflt));
  if (local.playAt > 0) {
    if (tour !== null) {
      const step = Math.floor(tour / STEP);
      const at = local.playAt + step * STEP;
      return { sel: step, at, from: step === 0 ? clampFrom(local.from) : step - 1, touring: true, loreAt: at };
    }
    const at = local.playAt + n * STEP;
    return { sel: dflt, at, from: n - 1, touring: false, loreAt: at };
  }
  if (local.sel >= 0) return { sel: Math.min(local.sel, dflt), at: local.selAt, from: clampFrom(local.from), touring: false, loreAt: local.selAt };
  const kept = s.keeper !== null && s.keptAt > 0;
  return {
    sel: dflt,
    at: kept ? Math.max(local.selAt, s.keptAt + 300) : local.selAt,
    from: clampFrom(local.from),
    touring: false,
    loreAt: kept ? Math.max(local.selAt, s.keptAt) : local.selAt,
  };
}

function drawCouch(g: CanvasRenderingContext2D, cx: number, cy: number, t: Theme, time: number) {
  const p = pal(t);
  const c = t.color;
  const w = 40, h = 20;
  const left = cx - w / 2, top = cy - h / 2, right = left + w, bottom = top + h;
  const col = p.leaf, hi = mix(col, c.card, 0.18), lo = mix(col, p.dark, 0.25);
  const legH = h * 0.08;
  const bodyH = h - legH;
  const bodyBottom = top + bodyH;
  const rad = h * 0.28, arm = w * 0.11;

  g.globalAlpha = 0.16;
  g.fillStyle = p.dark;
  g.beginPath();
  g.ellipse(cx, bottom, 20.8, 3.2, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;

  g.fillStyle = p.brown;
  g.beginPath();
  for (const fx of [0.08, 0.92]) {
    const x = left + w * fx;
    g.moveTo(x - 2.5, bodyBottom - 0.5);
    g.lineTo(x + 2.5, bodyBottom - 0.5);
    g.lineTo(x + 1.5, bottom);
    g.lineTo(x - 1.5, bottom);
    g.closePath();
  }
  g.fill();

  const backH = bodyH * 0.62;
  g.fillStyle = lo;
  g.beginPath();
  g.roundRect(left + arm * 0.6, top, w - arm * 1.2, backH, rad);
  g.fill();

  g.globalAlpha = 0.3;
  g.fillStyle = p.dark;
  g.beginPath();
  const tr = Math.max(h * 0.025, 1.2);
  for (let k = 0; k < 5; k++) {
    const x = left + arm * 0.6 + ((w - arm * 1.2) * (k + 1)) / 6;
    const y = top + backH * 0.4;
    g.moveTo(x + tr, y);
    g.arc(x, y, tr, 0, Math.PI * 2);
  }
  g.fill();
  g.globalAlpha = 1;

  const seatL = left + arm * 0.5, seatT = top + bodyH * 0.5, seatW = right - seatL, seatH = bodyBottom - seatT;
  g.fillStyle = col;
  g.beginPath();
  g.roundRect(seatL, seatT, seatW, seatH, rad * 0.7);
  g.fill();

  const cw = (seatW - arm) / 3;
  g.fillStyle = hi;
  g.beginPath();
  for (let k = 0; k < 3; k++) g.roundRect(seatL + arm * 0.5 + k * cw + 1.5, seatT - 3, cw - 3, seatH * 0.42, rad * 0.6);
  g.fill();

  const armT = top + bodyH * 0.3, armH = bodyH * 0.7, cap = Math.max(bodyH * 0.14, 3);
  g.fillStyle = col;
  g.beginPath();
  g.roundRect(left, armT, arm, armH, rad * 0.6);
  g.roundRect(right - arm, armT, arm, armH, rad * 0.6);
  g.fill();
  g.fillStyle = hi;
  g.beginPath();
  g.roundRect(left, armT, arm, cap, rad * 0.5);
  g.roundRect(right - arm, armT, arm, cap, rad * 0.5);
  g.fill();

  g.save();
  g.translate(left + arm + w * 0.1, top + bodyH * 0.45);
  g.rotate(-0.25);
  const br = 1 + Math.sin(1.5 * (time / 1000)) * 0.02;
  g.scale(br, br);
  g.fillStyle = mix(c.series4, c.card, 0.45);
  g.beginPath();
  g.roundRect(-3, -2.55, 6, 5.1, 1.2);
  g.fill();
  g.restore();
}

type Paint = { s: State; focus: Focus; now: number };

function drawPlot(g: CanvasRenderingContext2D, f: DrawFrame, a: Paint): boolean {
  const { s, focus } = a;
  const t = f.theme, c = t.color;
  const W = f.width;
  const G = geo(s, W);
  const n = s.eras.length;
  g.textBaseline = "middle";

  g.beginPath();
  g.roundRect(0, 2, W, 192, 12);
  g.fillStyle = c.wash;
  g.fill();

  g.textAlign = "left";
  const head = fitText("What each friend paid", W - 24, { g, size: 12, weight: 400, min: 10, family: t.type.family });
  g.font = head.font;
  g.fillStyle = c.secondaryText;
  g.fillText(head.text, 12, 16);

  // grid and dollar labels
  g.strokeStyle = c.divider;
  g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k < 4; k++) {
    const y = Math.round(G.yof((G.maxV * k) / 3)) + 0.5;
    g.moveTo(G.left, y);
    g.lineTo(W - 14, y);
  }
  g.stroke();
  g.textAlign = "right";
  for (let k = 0; k < 4; k++) {
    const l = fitText(`$${Math.round((G.maxV * k) / 3 / 100)}`, G.left - 12, { g, size: 10, weight: 400, min: 8, family: t.type.family });
    g.font = l.font;
    g.fillStyle = c.secondaryText;
    g.fillText(l.text, G.left - 8, G.yof((G.maxV * k) / 3));
  }

  // year ticks
  g.textAlign = "center";
  const y0 = s.eras[0]!.year;
  const span = s.next - y0;
  const stride = Math.max(2, Math.ceil(span / 4 / 2) * 2);
  for (let y = y0; y <= s.next; y += stride) {
    const l = fitText(`’${String(y).slice(-2)}`, 28, { g, size: 10.5, weight: 400, min: 8, family: t.type.family });
    g.font = l.font;
    g.fillStyle = c.secondaryText;
    g.fillText(l.text, G.xof(y), G.bottom + 14);
  }

  // the curve through every owner, up to the seller
  const curve: Pt[] = [];
  for (let i = 0; i < n - 1; i++) for (let j = i === 0 ? 0 : 1; j <= 16; j++) curve.push(cr(G.pts, i + j / 16));
  const lastPt = curve[curve.length - 1]!;
  g.globalAlpha = 0.14;
  g.fillStyle = c.series3;
  g.beginPath();
  g.moveTo(curve[0]!.x, G.bottom);
  for (const q of curve) g.lineTo(q.x, q.y);
  g.lineTo(lastPt.x, G.bottom);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = c.series3;
  g.lineWidth = 3;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  curve.forEach((q, k) => (k ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  g.stroke();

  // the extension to the keeper, drawn from keptAt
  let moving = false;
  if (s.keeper && G.pts.length > n) {
    const k = s.keptAt > 0 ? (f.now - s.keptAt) / EXTEND : 1;
    if (k < 1) moving = true;
    const e = easeOut(k);
    const steps = Math.max(1, Math.ceil(16 * e));
    g.strokeStyle = c.primary;
    g.lineWidth = 3;
    g.setLineDash([6, 4]);
    g.beginPath();
    for (let j = 0; j <= steps; j++) {
      const q = cr(G.pts, n - 1 + Math.min(e, (j / steps) * e));
      if (j) g.lineTo(q.x, q.y);
      else g.moveTo(q.x, q.y);
    }
    g.stroke();
    g.setLineDash([]);
  }

  // the couch rides the curve
  const to = focus.sel;
  const sPos = rideAt(focus.from, to, focus.at, f.now);
  if (f.now - focus.at < RIDE || focus.touring) moving = true;
  const hop = Math.abs(Math.sin((sPos % 1) * Math.PI)) * 8;
  const at = cr(G.pts, sPos);
  drawCouch(g, at.x, at.y - 20 - hop, t, f.now);
  return moving;
}

export default defineApp<State, Action, Local>({
  name: "Couch lineage",
  summary: (s, ctx) => {
    if (!s.keeper) return `${s.title}: ${s.item}, ${s.eras.length} owners since ${s.eras[0]!.year} · ${money(price(s))} from ${seller(s).who}`;
    return `${nameOf(ctx, s.keeper)} is keeping the ${s.item} in the family · owner #${owners(s)}${s.line.length ? ` · ${s.line.length} in line` : ""}`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || seller(s).user === m.user) return s;
    if (a.t === "keep") {
      if (s.keeper !== null) return s;
      return { ...s, keeper: m.user, keptAt: m.time, line: s.line.filter((u) => u !== m.user) };
    }
    if (a.t === "line") {
      if (s.keeper === null || s.keeper === m.user) return s;
      if (s.line.includes(m.user)) return { ...s, line: s.line.filter((u) => u !== m.user) };
      if (s.line.length >= MAX_LINE) return s;
      return { ...s, line: [...s.line, m.user] };
    }
    if (a.t === "release") {
      if (s.keeper !== m.user) return s;
      const keeper = s.line[0] ?? null;
      return { ...s, keeper, line: s.line.slice(1), keptAt: keeper ? m.time : 0 };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const line = s.line.filter((u) => inChat(ctx, u));
    if (s.keeper !== null && !inChat(ctx, s.keeper)) {
      const keeper = line[0] ?? null;
      return { ...s, keeper, line: line.slice(1), keptAt: keeper ? s.keptAt : 0 };
    }
    return line.length === s.line.length ? s : { ...s, line };
  },

  invariants: {
    "a keeper has a time": (s) => (s.keeper === null) === (s.keptAt === 0),
    "nobody waits for an unclaimed couch": (s) => s.keeper !== null || s.line.length === 0,
    "the keeper is not in line, and nobody twice": (s) =>
      (s.keeper === null || !s.line.includes(s.keeper)) && new Set(s.line).size === s.line.length && s.line.length <= MAX_LINE,
    "everyone holding or waiting is in the chat": (s, ctx) => (s.keeper === null || inChat(ctx, s.keeper)) && s.line.every((u) => inChat(ctx, u)),
    "the seller never buys their own couch": (s) => {
      const u = seller(s).user;
      return u === null || (s.keeper !== u && !s.line.includes(u));
    },
    "history runs forward": (s) =>
      s.eras.length >= 2 &&
      s.eras.length <= 8 &&
      s.eras.every((e, i) => Number.isInteger(e.paid) && e.paid >= 0 && (i === 0 || e.year >= s.eras[i - 1]!.year)) &&
      s.next > seller(s).year,
  },

  transitions: {
    "keep goes to the first who asks": (p, n, a, m) => a.t !== "keep" || p === n || (p.keeper === null && n.keeper === m.user && n.keptAt === m.time),
    "a claimed couch stays claimed until let go": (p, n, a) => a.t === "release" || p.keeper === null || n.keeper === p.keeper,
    "line toggles only the actor": (p, n, a, m) => {
      if (a.t !== "line" || p === n) return true;
      if (p.keeper === null) return false;
      const diff = [...p.line.filter((u) => !n.line.includes(u)), ...n.line.filter((u) => !p.line.includes(u))];
      return diff.length === 1 && diff[0] === m.user;
    },
    "letting go hands it to the next in line": (p, n, a, m) =>
      a.t !== "release" ||
      p === n ||
      (p.keeper === m.user && n.keeper === (p.line[0] ?? null) && JSON.stringify(n.line) === JSON.stringify(p.line.slice(1)) && n.keptAt === (n.keeper ? m.time : 0)),
    "history never changes": (p, n) => JSON.stringify(n.eras) === JSON.stringify(p.eras) && n.next === p.next,
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.keeper === null) return r.next() < 0.85 ? { t: "keep" } : { t: "line" };
    if (s.keeper === user) return r.next() < 0.5 ? { t: "release" } : { t: "line" };
    return r.next() < 0.8 ? { t: "line" } : { t: "release" };
  },

  local: { sel: -1, selAt: 0, playAt: 0, from: -1 },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const n = s.eras.length;
    const G = geo(s, W);
    const tourMs = n * STEP;
    const tour = local.playAt > 0 ? running(local.playAt, tourMs) : null;
    const focus = focusOf(s, local, tour);
    const sel = focus.sel;
    const mine = s.keeper === me;
    const sold = seller(s).user === me;
    const keeperName = s.keeper ? (mine ? "you" : nameOf({ members }, s.keeper)) : "";
    const count = owners(s);
    const sinceYear = s.eras[0]!.year;

    // where the couch is right now, so the next tap starts from there
    const here = () => rideAt(focus.from, sel, focus.at, freshNow());
    const pick = (i: number) => setLocal({ sel: i, selAt: freshNow(), playAt: 0, from: here() });

    // the new owner's face pops in, then hearts for everyone, then the toast for the keeper
    const sinceKeep = s.keeper && s.keptAt > 0 ? running(s.keptAt, 3600) : null;
    const pop = s.keeper && s.keptAt > 0 ? running(s.keptAt + 500, 350) : null;
    const popScale = pop === null ? 1 : easeBack(pop / 350);
    const hearts = sinceKeep !== null && sinceKeep >= 900;
    const loreK = running(focus.loreAt, 300);
    const slide = (1 - easeOut(loreK === null ? 1 : loreK / 300)) * 16;

    // lore card contents
    const e = sel < n ? s.eras[sel]! : null;
    const head = e ? `${e.year} · ${e.who}'s · ${e.place}` : `${s.next} · ${keeperName} · owner #${count}`;
    const quote = e ? `“${e.lore}”` : mine ? "“next chapter: yours”" : `“next chapter: ${keeperName}'s”`;
    const shownPrice = e ? e.paid : price(s);
    const faceUser = (i: number) => (i < n ? (s.eras[i]!.user ?? { id: `o:${s.eras[i]!.who}`, name: s.eras[i]!.who }) : s.keeper!);
    const loreFace = faceUser(sel);

    // price labels go above a node when its neighbour's label would touch
    const labelAbove = (i: number) =>
      i % 2 === 1 && [i - 1, i + 1].some((j) => G.pts[j] && Math.abs(G.pts[j]!.x - G.pts[i]!.x) < 32 && Math.abs(G.pts[j]!.y - G.pts[i]!.y) < 15);

    // footer
    const btnW = s.keeper === null ? 84 : mine ? 84 : s.line.includes(me) ? 100 : 104;
    const avail = W - 80 - 10 - (sold ? 0 : btnW) - 10;
    const fit = (text: string, size: number) => fitText(text, avail, { size, min: 10, weight: 400 });
    const lineIdx = s.line.indexOf(me);
    let line1 = "", line2 = "";
    if (sold) {
      line1 = `${s.line.length + (s.keeper ? 1 : 0)} want it`;
      line2 = "Your listing";
    } else if (s.keeper === null) {
      line1 = `${money(price(s))} from ${seller(s).who}`;
    } else if (mine) {
      line1 = `Asked ${seller(s).who} to hold it for you`;
      line2 = `Owner #${count} · the lore continues`;
    } else {
      line1 = `${keeperName}'s keeping it`;
      line2 = lineIdx >= 0 ? `${ordinal(lineIdx + 1)} in line` : `Owner #${count} · the lore continues`;
    }
    const f1 = fit(line1, 13);
    const f2 = line2 ? fit(line2, 12) : null;
    const playing = tour !== null;

    return (
      <div>
        <CardHeader title={s.title} subtitle={`${count} owners · since ${sinceYear}`} />
        <div style={{ height: 2 }} />
        <div style={{ position: "relative", height: PLOT_H }}>
          <Canvas
            height={PLOT_H}
            label={`${s.item}: ${count} owners, from ${money(s.eras[0]!.paid)} in ${sinceYear} to ${money(price(s))} now`}
            draw={(g, f) => drawPlot(g, f, { s, focus, now: f.now })}
          />
          {G.pts.map((pt, i) => {
            const on = i === sel;
            const size = on ? 24 : 18;
            const isKeep = i >= n;
            const who = isKeep ? (mine ? "You" : keeperName) : s.eras[i]!.who;
            const paid = isKeep ? price(s) : s.eras[i]!.paid;
            const yr = isKeep ? s.next : s.eras[i]!.year;
            const above = labelAbove(i);
            return (
              <button
                key={i}
                aria-label={`${yr} · ${who} · ${money(paid)}`}
                onClick={() => pick(i)}
                style={{
                  position: "absolute",
                  left: pt.x - 22,
                  top: pt.y - 22,
                  width: 44,
                  height: 44,
                  padding: 0,
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: on ? 2 : 1,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    borderRadius: "50%",
                    boxShadow: `0 0 0 2px ${on ? c.primary : c.card}`,
                    transform: isKeep ? `scale(${popScale})` : undefined,
                    opacity: isKeep && popScale <= 0 ? 0 : 1,
                  }}
                >
                  <Avatar user={faceUser(i)} size={size} />
                </span>
                {on ? null : (
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: above ? 22 - size / 2 - 17 : 22 + size / 2 + 3,
                      textAlign: "center",
                      fontSize: 10.5,
                      lineHeight: "14px",
                      color: c.text,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {money(paid)}
                  </span>
                )}
              </button>
            );
          })}
          {hearts && G.pts.length > n ? (
            <div style={{ position: "absolute", left: G.pts[n]!.x - 40, width: 80, top: G.pts[n]!.y, pointerEvents: "none", zIndex: 3 }}>
              <Burst key={s.keptAt} emoji="❤️" />
            </div>
          ) : null}
          {mine && hearts ? (
            <div style={{ position: "absolute", left: 0, right: 0, top: 6, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 4 }}>
              <Toast key={s.keptAt}>It stays in the family</Toast>
            </div>
          ) : null}
        </div>
        <div style={{ height: 6 }} />
        <div
          style={{
            position: "relative",
            height: 70,
            borderRadius: 12,
            background: c.secondaryButton,
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", inset: 0, transform: `translateX(${slide}px)` }}>
            <span style={{ position: "absolute", left: 10, top: 19, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${c.card}` }}>
              <Avatar user={loreFace} size={32} />
            </span>
            <div
              style={{
                position: "absolute",
                left: 52,
                top: 10,
                width: W - 120,
                height: 20,
                fontSize: fitText(head, W - 120, { size: 14, min: 10, weight: 400 }).size,
                lineHeight: "20px",
                color: c.text,
                whiteSpace: "nowrap",
              }}
            >
              {fitText(head, W - 120, { size: 14, min: 10, weight: 400 }).text}
            </div>
            <div
              style={{
                position: "absolute",
                left: 52,
                top: 36,
                width: W - 64,
                height: 16,
                fontSize: fitText(quote, W - 64, { size: 13, min: 10, weight: 400 }).size,
                lineHeight: "16px",
                color: c.secondaryButtonText,
                whiteSpace: "nowrap",
              }}
            >
              {fitText(quote, W - 64, { size: 13, min: 10, weight: 400 }).text}
            </div>
            <div style={{ position: "absolute", right: 12, top: 10, height: 20, fontSize: 18, lineHeight: "20px", fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>
              {money(shownPrice)}
            </div>
          </div>
        </div>
        <div style={{ height: 4 }} />
        <div style={{ height: 46, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 80, flex: "none" }}>
            <Button kind="secondary" wide onClick={() => setLocal({ playAt: freshNow(), sel: -1, selAt: freshNow(), from: here() })}>
              {playing ? "Touring" : "Play"}
            </Button>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
              <div style={{ fontSize: f1.size, lineHeight: "17px", color: s.keeper === null && !sold ? c.secondaryText : c.text, whiteSpace: "nowrap" }}>{f1.text}</div>
              {f2 ? <div style={{ fontSize: f2.size, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap" }}>{f2.text}</div> : null}
            </div>
            {sold ? null : s.keeper === null ? (
              <div style={{ width: btnW, flex: "none" }}>
                <Button
                  kind="primary"
                  wide
                  onClick={() => {
                    dispatch({ t: "keep" });
                    haptic("success");
                    setLocal({ sel: -1, selAt: freshNow(), playAt: 0, from: here() });
                  }}
                >
                  Keep it
                </Button>
              </div>
            ) : mine ? (
              <div style={{ width: btnW, flex: "none" }}>
                <Button kind="deemphasized" wide onClick={() => dispatch({ t: "release" })}>
                  Let go
                </Button>
              </div>
            ) : (
              <div style={{ width: btnW, flex: "none" }}>
                <Button kind="secondary" wide onClick={() => dispatch({ t: "line" })}>
                  {lineIdx >= 0 ? "Leave line" : "Get in line"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
});
