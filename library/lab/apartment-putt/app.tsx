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
  type Theme,
} from "@muse/app";

// Apartment putt: this week's mini-golf hole is the apartment itself, drawn as a floor plan. Putt
// from the front door, around the couch, under the table, past the rice cooker and into the
// bathroom. Drag back from your ball to aim and set power, then putt. Every ball in the apartment
// is a friend's, with their face on it; fewest strokes to sink it wins the week.

type Kind = "wall" | "couch" | "table" | "cooker" | "rug" | "plant" | "bed";
type Params = {
  /** Card title: "412 Pine mini golf" */
  title: string;
  /** This week's hole: "hole 3 · front door to the bathroom" */
  hole: string;
  /** Par for the hole. */
  par: number;
  /** The floor plan, in a 1000 by 640 world: kind, rectangle (x, y, w, h; a rice cooker uses x, y as centre and w as size), optional label. */
  things: { kind: Kind; x: number; y: number; w: number; h: number; label?: string }[];
  /** Where the ball starts. */
  start: { x: number; y: number };
  /** Where the cup is. */
  cup: { x: number; y: number; label?: string };
  /** Friends already playing: strokes so far, where their ball sits, whether it's in, and a line. */
  players: { name: string; strokes: number; x: number; y: number; holed?: boolean; said?: string }[];
};

// @params
const P: Params = {
  title: "412 Pine mini golf",
  hole: "hole 3 · front door to the bathroom",
  par: 4,
  things: [
    { kind: "wall", x: 0, y: 220, w: 230, h: 16 },
    { kind: "wall", x: 330, y: 220, w: 270, h: 16 },
    { kind: "wall", x: 600, y: 0, w: 16, h: 316 },
    { kind: "wall", x: 616, y: 300, w: 150, h: 16 },
    { kind: "wall", x: 866, y: 300, w: 134, h: 16 },
    { kind: "rug", x: 120, y: 330, w: 260, h: 200 },
    { kind: "couch", x: 150, y: 420, w: 200, h: 64, label: "the couch" },
    { kind: "table", x: 420, y: 330, w: 140, h: 110, label: "table" },
    { kind: "cooker", x: 720, y: 430, w: 64, h: 64, label: "rice cooker" },
    { kind: "plant", x: 940, y: 580, w: 40, h: 40 },
    { kind: "bed", x: 30, y: 30, w: 170, h: 150, label: "Calvin's room" },
  ],
  start: { x: 70, y: 580 },
  cup: { x: 880, y: 130, label: "bathroom" },
  players: [
    { name: "Arun", strokes: 3, x: 880, y: 130, holed: true, said: "bounced it off the rice cooker on purpose" },
    { name: "Will", strokes: 2, x: 812, y: 360, said: "24 minutes in that bathroom, i know the line" },
    { name: "Maya", strokes: 2, x: 520, y: 560 },
    { name: "Calvin", strokes: 1, x: 300, y: 600, said: "the couch moved" },
  ],
};
// @end params

type Thing = { kind: Kind; x: number; y: number; w: number; h: number; label: string };
type Shot = { fx: number; fy: number; dx: number; dy: number; at: number };
type Player = { who: string; name: string; x: number; y: number; strokes: number; holed: boolean; best: number; said: string; shot: Shot | null };
type State = { title: string; hole: string; par: number; things: Thing[]; start: { x: number; y: number }; cup: { x: number; y: number }; cupLabel: string; players: Player[] };
type Action = { t: "putt"; dx: number; dy: number } | { t: "again" };
type Local = { aiming: boolean; ax: number; ay: number; toast: number; msg: string };

const WW = 1000;
const WH = 640;
const R = 11;
const MAXP = 320;
const STEP_MS = 16;
const KINDS: Kind[] = ["wall", "couch", "table", "cooker", "rug", "plant", "bed"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
const okShot = (dx: unknown, dy: unknown): boolean =>
  typeof dx === "number" && typeof dy === "number" && Number.isInteger(dx) && Number.isInteger(dy) && (dx !== 0 || dy !== 0) && dx * dx + dy * dy <= MAXP * MAXP;

/** Things the ball bounces off: walls, the couch, table legs, the rice cooker, the plant, the bed. */
function solids(s: Pick<State, "things">): { rects: [number, number, number, number][]; circles: [number, number, number][] } {
  const rects: [number, number, number, number][] = [];
  const circles: [number, number, number][] = [];
  for (const t of s.things) {
    if (t.kind === "wall" || t.kind === "couch" || t.kind === "bed") rects.push([t.x, t.y, t.w, t.h]);
    else if (t.kind === "table") {
      const L = 12;
      for (const [x, y] of [
        [t.x, t.y],
        [t.x + t.w - L, t.y],
        [t.x, t.y + t.h - L],
        [t.x + t.w - L, t.y + t.h - L],
      ] as const)
        rects.push([x, y, L, L]);
    } else if (t.kind === "cooker" || t.kind === "plant") circles.push([t.x, t.y, t.w / 2]);
  }
  return { rects, circles };
}

/** Roll the ball. Plain arithmetic only, so every phone gets the same path. */
function roll(s: Pick<State, "things" | "cup">, fx: number, fy: number, dx: number, dy: number, path?: number[]): { x: number; y: number; holed: boolean } {
  const { rects, circles } = solids(s);
  let x = fx;
  let y = fy;
  let vx = dx * 0.07;
  let vy = dy * 0.07;
  for (let i = 0; i < 900; i++) {
    x += vx;
    y += vy;
    // the room's outer walls
    if (x < R) {
      x = R;
      vx = -vx * 0.7;
    } else if (x > WW - R) {
      x = WW - R;
      vx = -vx * 0.7;
    }
    if (y < R) {
      y = R;
      vy = -vy * 0.7;
    } else if (y > WH - R) {
      y = WH - R;
      vy = -vy * 0.7;
    }
    for (const [rx, ry, rw, rh] of rects) {
      if (x + R <= rx || x - R >= rx + rw || y + R <= ry || y - R >= ry + rh) continue;
      const pl = x + R - rx;
      const pr = rx + rw - (x - R);
      const pt = y + R - ry;
      const pb = ry + rh - (y - R);
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) {
        x -= pl;
        vx = -Math.abs(vx) * 0.7;
      } else if (m === pr) {
        x += pr;
        vx = Math.abs(vx) * 0.7;
      } else if (m === pt) {
        y -= pt;
        vy = -Math.abs(vy) * 0.7;
      } else {
        y += pb;
        vy = Math.abs(vy) * 0.7;
      }
    }
    for (const [cx, cy, cr] of circles) {
      const ex = x - cx;
      const ey = y - cy;
      const d2 = ex * ex + ey * ey;
      const rr = cr + R;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = ex / d;
      const ny = ey / d;
      x = cx + nx * rr;
      y = cy + ny * rr;
      const dot = vx * nx + vy * ny;
      if (dot < 0) {
        vx = (vx - 2 * dot * nx) * 0.8;
        vy = (vy - 2 * dot * ny) * 0.8;
      }
    }
    vx *= 0.986;
    vy *= 0.986;
    const sp2 = vx * vx + vy * vy;
    const cx = x - s.cup.x;
    const cy = y - s.cup.y;
    if (path && i % 2 === 0) path.push(Math.round(x), Math.round(y));
    if (cx * cx + cy * cy < 15 * 15 && sp2 < 100) {
      if (path) path.push(s.cup.x, s.cup.y);
      return { x: s.cup.x, y: s.cup.y, holed: true };
    }
    if (sp2 < 0.03) break;
  }
  const out = { x: Math.max(R, Math.min(WW - R, Math.round(x))), y: Math.max(R, Math.min(WH - R, Math.round(y))), holed: false };
  if (path) path.push(out.x, out.y);
  return out;
}
const pathMemo = new Map<string, number[]>();
function pathOf(s: State, sh: Shot): number[] {
  const k = `${sh.fx},${sh.fy},${sh.dx},${sh.dy}`;
  const hit = pathMemo.get(k);
  if (hit) return hit;
  const p: number[] = [];
  roll(s, sh.fx, sh.fy, sh.dx, sh.dy, p);
  if (pathMemo.size > 200) pathMemo.clear();
  pathMemo.set(k, p);
  return p;
}

function initState(ctx: Ctx): State {
  const things: Thing[] = [];
  for (const t of Array.isArray(P.things) ? P.things : []) {
    if (things.length >= 16 || !KINDS.includes(t?.kind)) continue;
    things.push({ kind: t.kind, x: num(t.x, 0, WW, 0), y: num(t.y, 0, WH, 0), w: num(t.w, 4, WW, 40), h: num(t.h, 4, WH, 40), label: clean(t.label, 18) });
  }
  const start = { x: num(P.start?.x, R, WW - R, 60), y: num(P.start?.y, R, WH - R, 580) };
  const cup = { x: num(P.cup?.x, R, WW - R, 900), y: num(P.cup?.y, R, WH - R, 100) };
  const players: Player[] = [];
  for (const p of Array.isArray(P.players) ? P.players : []) {
    const name = clean(p?.name, 20);
    if (!name || players.length >= 8) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (players.some((q) => q.who === who)) continue;
    const holed = !!p.holed;
    const strokes = num(p.strokes, 0, 30, 0);
    players.push({ who, name, x: holed ? cup.x : num(p.x, R, WW - R, start.x), y: holed ? cup.y : num(p.y, R, WH - R, start.y), strokes, holed, best: holed ? strokes : 0, said: clean(p.said, 60), shot: null });
  }
  return { title: clean(P.title, 40) || "Mini golf", hole: clean(P.hole, 50), par: num(P.par, 1, 12, 4), things, start, cup, cupLabel: clean(P.cup?.label, 16), players };
}

function drawPlan(g: CanvasRenderingContext2D, t: Theme, s: State, sx: number, sy: number) {
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const W = WW * sx;
  const H = WH * sy;
  // wood floor with planks
  g.fillStyle = dk ? mix(pl.crust, c.card, 0.72) : mix(pl.crust, c.card, 0.6);
  g.beginPath();
  g.roundRect(0, 0, W, H, 10);
  g.fill();
  g.fillStyle = dk ? mix(pl.crust, c.card, 0.66) : mix(pl.crust, c.card, 0.52);
  for (let y = 0; y < H; y += 14) g.fillRect(0, y, W, 1);
  // bathroom tile around the cup
  g.fillStyle = dk ? mix(pl.sky, c.card, 0.55) : mix(pl.sky, c.card, 0.3);
  g.fillRect(616 * sx, 0, (WW - 616) * sx, 300 * sy);
  g.strokeStyle = dk ? mix(pl.sky, c.card, 0.45) : c.card;
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 616; x < WW; x += 40) {
    g.moveTo(x * sx, 0);
    g.lineTo(x * sx, 300 * sy);
  }
  for (let y = 0; y < 300; y += 40) {
    g.moveTo(616 * sx, y * sy);
    g.lineTo(W, y * sy);
  }
  g.stroke();
  for (const th of s.things) {
    const x = th.x * sx;
    const y = th.y * sy;
    const w = th.w * sx;
    const h = th.h * sy;
    if (th.kind === "rug") {
      g.fillStyle = dk ? mix(pl.purple, c.card, 0.6) : mix(pl.purple, c.card, 0.65);
      g.beginPath();
      g.roundRect(x, y, w, h, 6);
      g.fill();
    } else if (th.kind === "wall") {
      g.fillStyle = dk ? mix(c.text, c.card, 0.25) : mix(c.text, c.card, 0.15);
      g.fillRect(x, y, w, h);
    } else if (th.kind === "couch") {
      g.fillStyle = mix(pl.blue, c.text, 0.2);
      g.beginPath();
      g.roundRect(x, y, w, h, 8);
      g.fill();
      g.fillStyle = mix(pl.blue, c.card, 0.25);
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.roundRect(x + 6 + (k * (w - 12)) / 3, y + h * 0.3, (w - 12) / 3 - 4, h * 0.6, 5);
        g.fill();
      }
    } else if (th.kind === "bed") {
      g.fillStyle = mix(pl.paper, pl.shade, 0.3);
      g.beginPath();
      g.roundRect(x, y, w, h, 6);
      g.fill();
      g.fillStyle = mix(pl.orange, c.card, 0.35);
      g.beginPath();
      g.roundRect(x, y + h * 0.35, w, h * 0.65, 6);
      g.fill();
      g.fillStyle = pl.paper;
      g.beginPath();
      g.roundRect(x + 8, y + 6, w * 0.4, h * 0.22, 5);
      g.fill();
    } else if (th.kind === "table") {
      // a see-through top: the ball rolls under it between the legs
      g.fillStyle = mix(pl.brown, c.card, dk ? 0.45 : 0.55);
      g.beginPath();
      g.roundRect(x, y, w, h, 6);
      g.fill();
      g.strokeStyle = pl.brown;
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = pl.brown;
      const L = 12 * sx;
      for (const [lx, ly] of [
        [x, y],
        [x + w - L, y],
        [x, y + h - L],
        [x + w - L, y + h - L],
      ] as const)
        g.fillRect(lx, ly, L, L);
    } else if (th.kind === "plant") {
      g.fillStyle = pl.leaf;
      g.beginPath();
      g.arc(x, y, w / 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pl.green;
      g.beginPath();
      g.arc(x - 3, y - 3, w / 3, 0, Math.PI * 2);
      g.fill();
    } else if (th.kind === "cooker") {
      g.fillStyle = pl.paper;
      g.beginPath();
      g.arc(x, y, w / 2, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = mix(c.text, c.card, 0.5);
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = mix(pl.paper, pl.shade, 0.5);
      g.beginPath();
      g.arc(x, y, w / 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pl.red;
      g.beginPath();
      g.arc(x + w / 3.2, y + w / 3.2, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // the cup and its flag
  const cx = s.cup.x * sx;
  const cy = s.cup.y * sy;
  g.fillStyle = dk ? c.wash : c.text;
  g.beginPath();
  g.arc(cx, cy, 8, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = dk ? c.text : c.text;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx, cy - 26);
  g.stroke();
  g.fillStyle = pl.red;
  g.beginPath();
  g.moveTo(cx, cy - 26);
  g.lineTo(cx + 16, cy - 21);
  g.lineTo(cx, cy - 16);
  g.fill();
  // labels last, on the floor
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const th of s.things) {
    if (!th.label) continue;
    const cxl = th.kind === "cooker" ? th.x * sx : (th.x + th.w / 2) * sx;
    const cyl = th.kind === "cooker" ? (th.y + th.w / 2) * sy + 9 : th.kind === "table" ? (th.y + th.h / 2) * sy : (th.y + th.h) * sy + 8;
    const f = fitText(th.label, Math.max(84, th.w * sx + 20), { g, size: 10, min: 10, weight: 600 });
    g.font = f.font;
    g.fillStyle = c.text;
    g.fillText(f.text, cxl, cyl);
  }
}

export default defineApp<State, Action, Local>({
  name: "Apartment putt",
  summary: (s) => {
    const sunk = s.players.filter((p) => p.best > 0).sort((a, b) => a.best - b.best);
    return sunk[0] ? `${s.title}: ${first(sunk[0].name)} sank it in ${sunk[0].best} · par ${s.par}` : `${s.title}: nobody's sunk it yet · par ${s.par}`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
    const me = s.players.find((p) => p.who === m.user);
    if (a.t === "putt") {
      if (!okShot(a.dx, a.dy) || me?.holed) return s;
      const from = me ? { x: me.x, y: me.y } : s.start;
      const end = roll(s, from.x, from.y, a.dx, a.dy);
      const strokes = (me?.strokes ?? 0) + 1;
      const best = end.holed ? (me?.best ? Math.min(me.best, strokes) : strokes) : (me?.best ?? 0);
      const row: Player = { who: m.user, name, x: end.x, y: end.y, strokes, holed: end.holed, best, said: me?.said ?? "", shot: { fx: from.x, fy: from.y, dx: a.dx, dy: a.dy, at: m.time } };
      return { ...s, players: me ? s.players.map((p) => (p === me ? row : p)) : [...s.players, row].slice(-8) };
    }
    if (a.t === "again") {
      if (!me || !me.holed) return s;
      return { ...s, players: s.players.map((p) => (p === me ? { ...p, x: s.start.x, y: s.start.y, strokes: 0, holed: false, shot: null } : p)) };
    }
    return s;
  },

  invariants: {
    "a sunk ball sits in the cup": (s) => s.players.every((p) => !p.holed || (p.x === s.cup.x && p.y === s.cup.y)),
    "one ball per person": (s) => new Set(s.players.map((p) => p.who)).size === s.players.length,
    "balls stay in the apartment": (s) => s.players.every((p) => p.x >= R && p.x <= WW - R && p.y >= R && p.y <= WH - R),
    "a best is a real round": (s) => s.players.every((p) => Number.isInteger(p.best) && p.best >= 0 && (!p.holed || (p.best > 0 && p.best <= p.strokes))),
  },

  transitions: {
    "a putt is a real shot": (p, n, a) => a.t !== "putt" || p === n || okShot(a.dx, a.dy),
    "your ball carries your chat name": (p, n, a, m, ctx) => a.t !== "putt" || p === n || n.players.find((x) => x.who === m.user)?.name === (clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend"),
    "unknown actions change nothing": (p, n, a) => a.t === "putt" || a.t === "again" || p === n,
    "a putt is one stroke": (p, n, a, m) => a.t !== "putt" || p === n || (n.players.find((x) => x.who === m.user)?.strokes ?? 0) === (p.players.find((x) => x.who === m.user)?.strokes ?? 0) + 1,
    "the ball ends where it rolls": (p, n, a, m) => {
      if (a.t !== "putt" || p === n) return true;
      const was = p.players.find((x) => x.who === m.user);
      const from = was ? { x: was.x, y: was.y } : p.start;
      const end = roll(p, from.x, from.y, a.dx, a.dy);
      const now = n.players.find((x) => x.who === m.user)!;
      return now.x === end.x && now.y === end.y && now.holed === end.holed && now.shot?.at === m.time && now.shot.dx === a.dx;
    },
    "no putting once it's in": (p, n, a, m) => a.t !== "putt" || p === n || !p.players.find((x) => x.who === m.user)?.holed,
    "again puts you back at the door": (p, n, a, m) => {
      if (a.t !== "again" || p === n) return true;
      const now = n.players.find((x) => x.who === m.user)!;
      return now.strokes === 0 && !now.holed && now.x === p.start.x && now.y === p.start.y;
    },
    "your best never gets worse": (p, n, _a, m) => {
      const was = p.players.find((x) => x.who === m.user)?.best ?? 0;
      const now = n.players.find((x) => x.who === m.user)?.best ?? 0;
      return !was || (now > 0 && now <= was);
    },
    "others' balls don't move": (p, n, _a, m) => n.players.filter((x) => x.who !== m.user).every((x) => p.players.some((y) => y.who === x.who && y.x === x.x && y.y === x.y && y.strokes === x.strokes)),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const me = s.players.find((p) => p.who === user);
    if (me?.holed) return r.next() < 0.7 ? { t: "again" } : { t: "putt", dx: 50, dy: 0 };
    const from = me ?? s.start;
    // mostly aim at the cup, sometimes anywhere
    const tx = r.next() < 0.6 ? s.cup.x - from.x : r.int(600) - 300;
    const ty = r.next() < 0.6 ? s.cup.y - from.y : r.int(600) - 300;
    const k = Math.sqrt(tx * tx + ty * ty) || 1;
    const p = 60 + r.int(MAXP - 70);
    return { t: "putt", dx: Math.round((tx / k) * p) || 1, dy: Math.round((ty / k) * p) };
  },

  local: { aiming: false, ax: 0, ay: 0, toast: 0, msg: "" },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const W = theme.width - 2 * theme.space.card;
    const sx = Math.min(W / WW, 240 / WH);
    const sy = sx;
    const H = Math.round(WH * sy);
    const ox = Math.round((W - WW * sx) / 2);
    const mine = s.players.find((p) => p.who === me) ?? null;
    const ball = mine ? { x: mine.x, y: mine.y } : s.start;
    const nameOf = (p: Player) => members.find((m) => m.id === p.who)?.name ?? p.name;
    const latest = s.players.reduce<Player | null>((x, p) => (p.shot && (!x || (x.shot?.at ?? 0) < p.shot.at) ? p : x), null);
    const anim = latest?.shot ? running(latest.shot.at, (pathOf(s, latest.shot).length / 2) * STEP_MS * 2 + 200) : null;
    const pos = (p: Player): { x: number; y: number } => {
      if (anim !== null && p === latest && p.shot) {
        const path = pathOf(s, p.shot);
        const i = Math.min(path.length / 2 - 1, Math.floor(anim / (STEP_MS * 2)));
        return { x: path[i * 2]!, y: path[i * 2 + 1]! };
      }
      return { x: p.x, y: p.y };
    };
    const power = Math.min(MAXP, Math.sqrt(local.ax * local.ax + local.ay * local.ay));
    const aimed = !mine?.holed && power > 12;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      void f;
      g.save();
      g.translate(ox, 0);
      drawPlan(g, theme, s, sx, sy);
      // start mat at the front door
      g.strokeStyle = c.secondaryText;
      g.setLineDash([3, 3]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(s.start.x * sx, s.start.y * sy, 12, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      // balls
      for (const p of s.players) {
        if (p.holed && !(anim !== null && p === latest)) continue;
        const q = pos(p);
        g.fillStyle = userColor(p.who, theme);
        g.beginPath();
        g.arc(q.x * sx, q.y * sy, R * sx + 3, 0, Math.PI * 2);
        g.fill();
        if (p.who === me) {
          g.strokeStyle = c.primary;
          g.lineWidth = 2.5;
          g.stroke();
        }
      }
      if (!mine) {
        g.fillStyle = pl.paper;
        g.beginPath();
        g.arc(ball.x * sx, ball.y * sy, R * sx + 3, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = c.primary;
        g.lineWidth = 2.5;
        g.stroke();
      }
      // aim: dots in the shot direction, longer with power
      if (aimed) {
        const ux = local.ax / power;
        const uy = local.ay / power;
        g.fillStyle = c.primary;
        const n = Math.round(4 + (power / MAXP) * 10);
        for (let k = 1; k <= n; k++) {
          g.beginPath();
          g.arc((ball.x + ux * k * 16) * sx, (ball.y + uy * k * 16) * sy, Math.max(1.2, 3 - k * 0.12), 0, Math.PI * 2);
          g.fill();
        }
        // the pull-back band
        g.strokeStyle = mix(c.primary, c.card, 0.4);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(ball.x * sx, ball.y * sy);
        g.lineTo((ball.x - ux * power * 0.35) * sx, (ball.y - uy * power * 0.35) * sy);
        g.stroke();
      }
      g.restore();
      return anim !== null;
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (mine?.holed) return;
      const wx = (e.x - ox) / sx;
      const wy = e.y / sy;
      if (e.type === "down") {
        if ((wx - ball.x) ** 2 + (wy - ball.y) ** 2 < 90 * 90) setLocal({ aiming: true, ax: 0, ay: 0 });
        return;
      }
      if (!local.aiming) return;
      // pull back: the shot goes the other way, three times the pull
      let ax = Math.round((ball.x - wx) * 2.2);
      let ay = Math.round((ball.y - wy) * 2.2);
      const p = Math.sqrt(ax * ax + ay * ay);
      if (p > MAXP) {
        ax = Math.round((ax / p) * MAXP);
        ay = Math.round((ay / p) * MAXP);
      }
      setLocal({ ax, ay, aiming: e.type === "move" });
    };

    const sunk = s.players.filter((p) => p.best > 0).sort((a, b) => a.best - b.best);
    const rows = [...s.players].sort((a, b) => (a.best || 99) - (b.best || 99) || a.strokes - b.strokes);
    const said = s.players.find((p) => p.said);
    const label = `Floor plan, ${s.hole}. ${s.players.length} balls; ${sunk.length} sunk.`;
    const status = mine?.holed
      ? `Sunk in ${mine.strokes} · par ${s.par}`
      : aimed
        ? `Power ${Math.round((power / MAXP) * 10)} of 10 · putt when it looks right`
        : mine
          ? `${mine.strokes} ${mine.strokes === 1 ? "stroke" : "strokes"} · drag back from your ball`
          : said
            ? `${first(nameOf(said))}: “${said.said}”`
            : "Drag back from the ball at the door to aim";

    return (
      <div>
        <CardHeader title={s.title} subtitle={`${s.hole} · par ${s.par}`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} drag label={label} draw={draw} onPointer={onPointer} />
          {!aimed && !mine?.holed && !local.aiming ? (
            <div style={{ position: "absolute", left: ox + ball.x * sx + (ball.x * sx > WW * sx - 100 ? -96 : 16), top: ball.y * sy - 10, padding: "1px 8px", borderRadius: 99, background: c.card, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, pointerEvents: "none", whiteSpace: "nowrap" }}>
              Drag back
            </div>
          ) : null}
          {s.players.filter((p) => !p.holed || (anim !== null && p === latest)).map((p) => {
            const q = pos(p);
            return (
              <div key={p.who} style={{ position: "absolute", left: ox + q.x * sx - 9, top: q.y * sy - 9, display: "flex", pointerEvents: "none" }}>
                <Avatar user={{ id: p.who, name: nameOf(p) } as Member} size={18} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, height: 28, overflow: "hidden" }}>
          {rows.slice(0, theme.width < 360 ? 3 : 4).map((p) => (
            <span key={p.who} style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 8px 0 3px", height: 26, borderRadius: 13, background: p.who === me ? c.selected : c.wash, fontSize: 13, color: c.text }}>
              <Avatar user={{ id: p.who, name: nameOf(p) } as Member} size={20} />
              <b style={{ fontWeight: 600 }}>{p.best ? String(p.best) : String(p.strokes)}</b>
              <span style={{ color: c.secondaryText }}>{p.best ? "in" : "so far"}</span>
            </span>
          ))}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>{status}</span>
          {mine?.holed ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "again" })}>
              Play again
            </Button>
          ) : (
            <Button
              kind="primary"
              disabled={!aimed}
              onClick={() => {
                const before = mine?.strokes ?? 0;
                const end = roll(s, ball.x, ball.y, local.ax, local.ay);
                haptic(end.holed ? "success" : "light");
                dispatch({ t: "putt", dx: local.ax, dy: local.ay });
                setLocal({ ax: 0, ay: 0, aiming: false, toast: local.toast + 1, msg: end.holed ? `In the cup in ${before + 1}` : `Stroke ${before + 1}` });
              }}
            >
              Putt
            </Button>
          )}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
