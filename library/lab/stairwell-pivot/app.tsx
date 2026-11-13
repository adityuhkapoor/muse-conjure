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
  clock,
  type Ctx,
  type DrawFrame,
} from "@muse/app";

// Stairwell pivot: "will this even fit up our stairs". The turn at the landing of a 3rd floor
// walk-up, drawn from above. Drag the couch up the first flight, grab its round handle to twist it
// through the turn; it scrapes red where it hits. Make it to the top and it fits (buy it); get
// stuck and try the smaller one. Everyone's last try stays on the stairs as a ghost with a face.

type Params = {
  /** Card title */
  title: string;
  /** Where the stairs are: "412 Pine · 3rd floor walk-up" */
  place: string;
  /** 1 to 3 listings to try, inches long and deep */
  items: { name: string; priceCents: number; lengthIn: number; depthIn: number }[];
  /** Tries already made: item index, final spot (x 0-360, y 0-200, angle 0-179) and what they said */
  tries: { who: string; item: number; x: number; y: number; angle: number; scrapes: number; said?: string }[];
  /** Someone in the chat yelling from the landing */
  yell: { who: string; said: string };
};

// @params
const P: Params = {
  title: "Will it make the turn",
  place: "412 Pine · 3rd floor walk-up",
  items: [
    { name: "Green sectional", priceCents: 18000, lengthIn: 92, depthIn: 34 },
    { name: "Loveseat", priceCents: 9000, lengthIn: 68, depthIn: 32 },
  ],
  tries: [
    { who: "Will", item: 0, x: 230, y: 168, angle: 0, scrapes: 3, said: "pivot. PIVOT." },
    { who: "Calvin", item: 0, x: 150, y: 168, angle: 2, scrapes: 1, said: "we could take the legs off??" },
  ],
  yell: { who: "Will", said: "pivot!" },
};
// @end params

type Item = { name: string; price: number; len: number; dep: number };
type Try = { user: string; name: string; item: number; made: boolean; scrapes: number; x: number; y: number; a: number; marks: number[][]; said: string; at: number };
type State = { title: string; place: string; items: Item[]; tries: Try[]; buy: { item: number; user: string; at: number } | null; yell: { name: string; said: string } };
type Action =
  | { t: "try"; item: number; poses: number[][]; scrapes: number; marks: number[][] }
  | { t: "buy"; item: number };
type Local = { item: number; x: number; y: number; a: number; mode: "" | "move" | "turn"; gx: number; gy: number; path: number[][]; scrapes: number; marks: number[][]; hitAt: number; toast: number };

// The stairwell, in inches. Flight one runs right, the landing, flight two runs up to your door.
const RECTS = [
  [0, 146, 300, 190],
  [252, 126, 316, 190],
  [262, -120, 306, 190],
];
const REFLEX = [
  [262, 126],
  [252, 146],
  [306, 126],
];
const WORLD_W = 360;
const WORLD_H = 200;
const START = [60, 168, 0];
const GOAL_Y = 56;
const MAX_POSES = 100;
const STEP = 24;
const TURN = 20;

/** Server-aligned now; the clock only ticks while read, so narrow it down with running(). */
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
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const money = (c: number) => `$${Math.round(c / 100)}`;
const inU = (x: number, y: number) => RECTS.some(([a, b, c, d]) => x >= a! && x <= c! && y >= b! && y <= d!);

/** True when a couch of len x dep centered at (x, y) turned `deg` degrees touches a wall. */
function hits(x: number, y: number, deg: number, len: number, dep: number): boolean {
  const t = (deg * Math.PI) / 180;
  const ux = Math.cos(t), uy = Math.sin(t), hl = len / 2, hd = dep / 2;
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    if (!inU(x + ux * hl * sx - uy * hd * sy, y + uy * hl * sx + ux * hd * sy)) return true;
  }
  for (const [px, py] of REFLEX) {
    const dx = px! - x, dy = py! - y;
    if (Math.abs(dx * ux + dy * uy) < hl && Math.abs(-dx * uy + dy * ux) < hd) return true;
  }
  return false;
}
/** Where it scraped: the wall corner it hit, or the couch corner that left the stairs. */
function contact(x: number, y: number, deg: number, len: number, dep: number): number[] {
  const t = (deg * Math.PI) / 180;
  const ux = Math.cos(t), uy = Math.sin(t), hl = len / 2, hd = dep / 2;
  for (const [px, py] of REFLEX) {
    const dx = px! - x, dy = py! - y;
    if (Math.abs(dx * ux + dy * uy) < hl + 2 && Math.abs(-dx * uy + dy * ux) < hd + 2) return [px!, py!];
  }
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const cx = x + ux * hl * sx - uy * hd * sy, cy = y + uy * hl * sx + ux * hd * sy;
    if (!inU(cx, cy)) return [Math.round(Math.max(0, Math.min(WORLD_W, cx))), Math.round(Math.max(0, Math.min(WORLD_H, cy)))];
  }
  return [Math.round(x), Math.round(y)];
}
const angDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
};
const goodPose = (p: unknown, it: Item): p is number[] =>
  Array.isArray(p) && p.length === 3 && isInt(p[0], 0, WORLD_W) && isInt(p[1], -120, WORLD_H) && isInt(p[2], 0, 179) && !hits(p[0], p[1], p[2], it.len, it.dep);
const madeAt = (y: number) => y < GOAL_Y;
const goodMark = (m: unknown): m is number[] => Array.isArray(m) && m.length === 2 && isInt(m[0], 0, WORLD_W) && isInt(m[1], 0, WORLD_H);

function initState(ctx: Ctx): State {
  const items: Item[] = [];
  for (const it of Array.isArray(P.items) ? P.items : []) {
    if (items.length >= 3 || !it) continue;
    const name = clean(it.name, 24);
    if (!name || !isInt(it.lengthIn, 30, 120) || !isInt(it.depthIn, 18, 44)) continue;
    items.push({ name, price: isInt(it.priceCents, 0, 1_000_000) ? it.priceCents : 0, len: it.lengthIn, dep: it.depthIn });
  }
  if (!items.length) items.push({ name: "Couch", price: 0, len: 84, dep: 34 });
  const tries: Try[] = [];
  for (const t of Array.isArray(P.tries) ? P.tries : []) {
    const name = clean(t?.who, 20);
    if (!name || !isInt(t.item, 0, items.length - 1) || tries.length >= 8) continue;
    const it = items[t.item]!;
    const m = ctx.members.find((x) => x.id === name || x.name.trim().toLowerCase() === name.toLowerCase());
    const user = m ? m.id : `o:${name}`;
    if (tries.some((q) => q.user === user && q.item === t.item)) continue;
    const pose = [t.x, t.y, t.angle];
    const ok = goodPose(pose, it);
    const [x, y, a] = ok ? pose : START;
    const scrapes = isInt(t.scrapes, 0, 99) ? t.scrapes : 0;
    const marks = ok && scrapes > 0 ? [contact(x!, y!, a!, it.len + 6, it.dep + 6)] : [];
    tries.push({ user, name, item: t.item, made: madeAt(y!), scrapes, x: x!, y: y!, a: a!, marks, said: clean(t.said, 40), at: 0 });
  }
  return {
    title: clean(P.title, 40) || "Will it fit up the stairs",
    place: clean(P.place, 40),
    items,
    tries,
    buy: null,
    yell: { name: clean(P.yell?.who, 20), said: clean(P.yell?.said, 24) },
  };
}

export default defineApp<State, Action, Local>({
  name: "Stairwell pivot",
  summary: (s) => {
    if (s.buy) return `${s.items[s.buy.item]!.name} fits up the stairs · buying it for ${money(s.items[s.buy.item]!.price)}`;
    const made = s.items.filter((_, i) => s.tries.some((t) => t.item === i && t.made));
    return made.length ? `${made[0]!.name} makes the turn · ${s.tries.length} tries` : `${s.tries.length} tries up the stairs · nothing has made the turn yet`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "try") {
      if (!isInt(a.item, 0, s.items.length - 1) || !Array.isArray(a.poses) || a.poses.length < 1 || a.poses.length > MAX_POSES) return s;
      if (!isInt(a.scrapes, 0, 99) || !Array.isArray(a.marks) || a.marks.length > 8 || !a.marks.every(goodMark)) return s;
      const it = s.items[a.item]!;
      const ps = a.poses;
      if (!ps.every((p) => goodPose(p, it))) return s;
      if (ps[0]![0] !== START[0] || ps[0]![1] !== START[1] || ps[0]![2] !== START[2]) return s;
      for (let i = 1; i < ps.length; i++) {
        const p = ps[i - 1]!, q = ps[i]!;
        if (Math.abs(p[0]! - q[0]!) > STEP || Math.abs(p[1]! - q[1]!) > STEP || angDiff(p[2]!, q[2]!) > TURN) return s;
      }
      const end = ps[ps.length - 1]!;
      const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
      const t: Try = { user: m.user, name, item: a.item, made: madeAt(end[1]!), scrapes: a.scrapes, x: end[0]!, y: end[1]!, a: end[2]!, marks: a.marks.map((k) => [k[0]!, k[1]!]), said: "", at: m.time };
      return { ...s, tries: [...s.tries.filter((q) => !(q.user === m.user && q.item === a.item)), t].slice(-12) };
    }
    if (a.t === "buy") {
      if (!isInt(a.item, 0, s.items.length - 1)) return s;
      if (s.buy && s.buy.item === a.item && s.buy.user === m.user) return { ...s, buy: null };
      if (s.buy || !s.tries.some((t) => t.item === a.item && t.made)) return s;
      return { ...s, buy: { item: a.item, user: m.user, at: m.time } };
    }
    return s;
  },

  onMembers: (s, ctx) => (s.buy && !inChat(ctx, s.buy.user) ? { ...s, buy: null } : s),

  invariants: {
    "every couch on the stairs is clear of the walls": (s) => s.tries.every((t) => goodPose([t.x, t.y, t.a], s.items[t.item]!)),
    "made it means it reached the top": (s) => s.tries.every((t) => t.made === madeAt(t.y)),
    "one try per person per couch": (s) => new Set(s.tries.map((t) => `${t.user}|${t.item}`)).size === s.tries.length && s.tries.length <= 12,
    "you only buy what made the turn": (s) => s.buy === null || s.tries.some((t) => t.item === s.buy!.item && t.made),
    "the buyer is in the chat": (s, ctx) => s.buy === null || inChat(ctx, s.buy.user),
    "scrape marks are on the drawing": (s) => s.tries.every((t) => isInt(t.scrapes, 0, 99) && t.marks.length <= 8 && t.marks.every(goodMark)),
  },

  transitions: {
    "a try lands where the couch stopped": (p, n, a, m) => {
      if (a.t !== "try" || p === n) return true;
      const t = n.tries.find((q) => q.user === m.user && q.item === a.item);
      const end = a.poses[a.poses.length - 1]!;
      return !!t && t.x === end[0] && t.y === end[1] && t.a === end[2] && t.at === m.time && t.scrapes === a.scrapes;
    },
    "a try starts at the street door": (p, n, a) => a.t !== "try" || p === n || (a.poses[0]![0] === START[0] && a.poses[0]![1] === START[1] && a.poses[0]![2] === START[2]),
    "a try never jumps": (p, n, a) =>
      a.t !== "try" || p === n || a.poses.every((q, i) => i === 0 || (Math.abs(q[0]! - a.poses[i - 1]![0]!) <= STEP && Math.abs(q[1]! - a.poses[i - 1]![1]!) <= STEP && angDiff(q[2]!, a.poses[i - 1]![2]!) <= TURN)),
    "a try changes only your couch": (p, n, a, m) =>
      a.t !== "try" || p === n || n.tries.filter((t) => !(t.user === m.user && t.item === a.item)).every((t) => p.tries.some((q) => q.user === t.user && q.item === t.item && q.x === t.x && q.y === t.y)),
    "buying is yours to undo": (p, n, a, m) => a.t !== "buy" || p === n || (n.buy === null ? p.buy?.user === m.user : p.buy === null && n.buy.user === m.user && n.buy.item === a.item && n.buy.at === m.time),
    "tries leave the purchase alone": (p, n, a) => a.t !== "try" || n.buy === p.buy,
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const item = r.int(s.items.length);
    if (r.next() < 0.25) return { t: "buy", item };
    // walk up the first flight a little, or replay a clean route for a short couch
    const it = s.items[item]!;
    const poses: number[][] = [[...START]];
    const n = 1 + r.int(8);
    for (let i = 0; i < n; i++) {
      const last = poses[poses.length - 1]!;
      const next = [Math.min(WORLD_W, last[0]! + r.int(STEP)), last[1]!, last[2]!];
      if (hits(next[0]!, next[1]!, next[2]!, it.len, it.dep)) break;
      poses.push(next);
    }
    return { t: "try", item, poses, scrapes: r.int(4), marks: r.next() < 0.5 ? [[262, 126]] : [] };
  },

  local: { item: 0, x: START[0]!, y: START[1]!, a: 0, mode: "", gx: 0, gy: 0, path: [], scrapes: 0, marks: [], hitAt: 0, toast: 0 },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const k = Math.min(W / WORLD_W, 1.04);
    const H = Math.round(WORLD_H * k);
    const ox = (W - WORLD_W * k) / 2;
    const X = (x: number) => ox + x * k;
    const Y = (y: number) => y * k;
    const sel = Math.min(local.item, s.items.length - 1);
    const it = s.items[sel]!;
    const mineTry = s.tries.find((t) => t.user === me && t.item === sel) ?? null;
    const moved = local.path.length > 0;
    const pose = moved ? [local.x, local.y, local.a] : mineTry && !mineTry.made ? START : START;
    const made = (i: number) => s.tries.some((t) => t.item === i && t.made);
    const nameOf = (t: Try) => members.find((x) => x.id === t.user)?.name ?? t.name;
    const hitK = local.hitAt ? running(local.hitAt, 450) : null;
    const lastMine = s.tries.filter((t) => t.user === me).sort((a, b) => b.at - a.at)[0];
    const bodyCol = (i: number) => (i === 0 ? p.leaf : i === 1 ? mix(p.orange, p.dark, 0.15) : p.purple);

    const drawCouch = (g: CanvasRenderingContext2D, x: number, y: number, deg: number, item: Item, col: string, red: boolean, ghost: boolean, handle: boolean) => {
      g.save();
      g.translate(X(x), Y(y));
      g.rotate((deg * Math.PI) / 180);
      const L = item.len * k, D = item.dep * k;
      if (ghost) {
        g.setLineDash([4, 3]);
        g.strokeStyle = mix(col, c.card, dark ? 0.1 : 0.2);
        g.lineWidth = 1.5;
        g.beginPath();
        g.roundRect(-L / 2, -D / 2, L, D, 6);
        g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 0.18;
        g.fillStyle = col;
        g.fill();
        g.globalAlpha = 1;
        g.restore();
        return;
      }
      g.fillStyle = mix(p.dark, c.card, 0.6);
      g.globalAlpha = 0.25;
      g.beginPath();
      g.roundRect(-L / 2 + 2, -D / 2 + 3, L, D, 7);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = red ? p.red : col;
      g.beginPath();
      g.roundRect(-L / 2, -D / 2, L, D, 7);
      g.fill();
      // back and arms
      const lo = mix(red ? p.red : col, p.dark, 0.3);
      g.fillStyle = lo;
      g.beginPath();
      g.roundRect(-L / 2, -D / 2, L, D * 0.3, [7, 7, 2, 2]);
      g.roundRect(-L / 2, -D / 2, L * 0.1, D, [7, 2, 2, 7]);
      g.roundRect(L / 2 - L * 0.1, -D / 2, L * 0.1, D, [2, 7, 7, 2]);
      g.fill();
      // cushions
      const n = item.len > 80 ? 3 : 2;
      const cw = (L * 0.8) / n;
      g.fillStyle = mix(red ? p.red : col, c.card, 0.22);
      g.beginPath();
      for (let i = 0; i < n; i++) g.roundRect(-L * 0.4 + i * cw + 1.5, -D / 2 + D * 0.34, cw - 3, D * 0.58, 4);
      g.fill();
      if (handle) {
        g.fillStyle = c.card;
        g.strokeStyle = c.primary;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(L / 2 + 6, 0, 8, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.strokeStyle = c.primary;
        g.lineWidth = 1.6;
        g.beginPath();
        g.arc(L / 2 + 6, 0, 4, -2.2, 1.4);
        g.stroke();
      }
      g.restore();
    };

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const wall = dark ? mix(p.wall, c.wash, 0.55) : p.wall;
      const floor = dark ? mix(c.card, c.text, 0.06) : c.card;
      g.fillStyle = wall;
      g.beginPath();
      g.roundRect(0, 0, f.width, H, 12);
      g.fill();
      // brick hint on the walls
      g.strokeStyle = mix(wall, p.brown, dark ? 0.25 : 0.15);
      g.lineWidth = 1;
      g.beginPath();
      for (let yy = 8, row = 0; yy < H; yy += 10, row++) {
        g.moveTo(0, yy);
        g.lineTo(f.width, yy);
        for (let xx = (row % 2) * 12; xx < f.width; xx += 24) {
          g.moveTo(xx, yy);
          g.lineTo(xx, yy + 10);
        }
      }
      g.stroke();
      // the stairs
      g.fillStyle = floor;
      g.beginPath();
      for (const [a, b, cc, d] of RECTS) g.rect(X(a!), Y(Math.max(b!, 0)), (cc! - a!) * k, (d! - Math.max(b!, 0)) * k);
      g.fill();
      // treads, darker as they climb
      g.strokeStyle = c.divider;
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 100; x < 252; x += 11) {
        g.moveTo(X(x), Y(146));
        g.lineTo(X(x), Y(190));
      }
      for (let y = 18; y < 126; y += 11) {
        g.moveTo(X(262), Y(y));
        g.lineTo(X(306), Y(y));
      }
      g.stroke();
      // which way is up
      g.strokeStyle = mix(c.secondaryText, floor, 0.35);
      g.lineWidth = 2;
      g.lineCap = "round";
      g.beginPath();
      for (const x of [118, 186]) {
        g.moveTo(X(x) - 4, Y(160));
        g.lineTo(X(x) + 3, Y(168));
        g.lineTo(X(x) - 4, Y(176));
      }
      for (const y of [96, 30]) {
        g.moveTo(X(276), Y(y) + 4);
        g.lineTo(X(284), Y(y) - 3);
        g.lineTo(X(292), Y(y) + 4);
      }
      g.stroke();
      // the landing mat and the door
      g.fillStyle = mix(p.red, floor, 0.75);
      g.beginPath();
      g.roundRect(X(268), Y(150), 34 * k, 26 * k, 3);
      g.fill();
      g.fillStyle = p.brown;
      g.beginPath();
      g.roundRect(X(266), 0, 36 * k, 5, [0, 0, 3, 3]);
      g.fill();
      // goal line
      g.setLineDash([5, 4]);
      g.strokeStyle = p.green;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(X(262), Y(GOAL_Y));
      g.lineTo(X(306), Y(GOAL_Y));
      g.stroke();
      g.setLineDash([]);
      // scrape marks: everyone's, then mine
      g.strokeStyle = p.red;
      g.lineWidth = 2;
      g.lineCap = "round";
      g.beginPath();
      const scratch = (mx: number, my: number, seed: number) => {
        for (let i = 0; i < 3; i++) {
          const dx = ((seed * 7 + i * 5) % 9) - 4, dy = ((seed * 3 + i * 7) % 9) - 4;
          g.moveTo(X(mx) + dx - 3, Y(my) + dy - 1);
          g.lineTo(X(mx) + dx + 3, Y(my) + dy + 1);
        }
      };
      s.tries.forEach((t, i) => t.marks.forEach((mk, j) => scratch(mk[0]!, mk[1]!, i * 3 + j)));
      local.marks.forEach((mk, j) => scratch(mk[0]!, mk[1]!, 40 + j));
      g.stroke();
      // labels
      g.textBaseline = "middle";
      g.textAlign = "left";
      const lab = (text: string, x: number, y: number, w: number) => {
        const ft = fitText(text, w, { g, size: 11, min: 9, weight: 600, family: theme.type.family });
        g.font = ft.font;
        g.fillStyle = c.text;
        g.fillText(ft.text, x, y);
      };
      lab("Street door", X(6), Y(140) - 7, 120 * k);
      lab("Your door", X(200), 10, 60 * k);
      // nobody has tried this one: show the route
      if (!moved && !s.tries.some((t) => t.item === sel)) {
        g.strokeStyle = c.primary;
        g.lineWidth = 2;
        g.setLineDash([6, 5]);
        g.beginPath();
        g.moveTo(X(120), Y(168));
        g.lineTo(X(250), Y(168));
        g.quadraticCurveTo(X(284), Y(168), X(284), Y(136));
        g.lineTo(X(284), Y(30));
        g.stroke();
        g.setLineDash([]);
        g.beginPath();
        g.moveTo(X(278), Y(36));
        g.lineTo(X(284), Y(26));
        g.lineTo(X(290), Y(36));
        g.stroke();
      }
      // ghosts of everyone else's last try with this couch
      for (const t of s.tries) if (t.item === sel && t.user !== me) drawCouch(g, t.x, t.y, t.a, it, t.made ? p.green : c.secondaryText, false, true, false);
      const shake = hitK !== null ? Math.sin(hitK / 18) * 2.5 * (1 - hitK / 450) : 0;
      if (!s.buy || s.buy.item === sel) drawCouch(g, pose[0]! + shake / k, pose[1]!, pose[2]!, it, bodyCol(sel), hitK !== null, false, !s.buy);
      return hitK !== null;
    };

    const toWorld = (e: { x: number; y: number }) => [(e.x - ox) / k, e.y / k];
    /** Move toward the target in small steps; stop at the wall and leave a scrape. */
    const slide = (tx: number, ty: number, ta: number) => {
      let x = local.x, y = local.y, a = local.a;
      const path = local.path.length ? [...local.path] : [[...START]];
      let scr = local.scrapes;
      let marks = local.marks;
      let hitAt = local.hitAt;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(tx - x), Math.abs(ty - y)) / 4), Math.ceil(angDiff(ta, a) / 4));
      let da = ta - a;
      if (da > 90) da -= 180;
      if (da < -90) da += 180;
      const sx = (tx - x) / n, sy = (ty - y) / n, sa = da / n;
      for (let i = 0; i < n; i++) {
        const nx = Math.round(x + sx), ny = Math.round(y + sy), na = Math.round((((a + sa) % 180) + 180) % 180) % 180;
        const cand = [nx, ny, na];
        if (!goodPose(cand, it)) {
          // try sliding along the wall
          const alt = [[nx, Math.round(y), Math.round(a) % 180], [Math.round(x), ny, Math.round(a) % 180]].find((q) => goodPose(q, it));
          if (alt) {
            x = alt[0]!;
            y = alt[1]!;
          } else {
            const ct = contact(nx, ny, na, it.len, it.dep);
            const fresh = !marks.some((mk) => Math.abs(mk[0]! - ct[0]!) < 10 && Math.abs(mk[1]! - ct[1]!) < 10);
            if (fresh && marks.length < 8) marks = [...marks, ct];
            if (fresh || !hitAt) scr += 1;
            hitAt = freshNow();
            haptic("medium");
            break;
          }
        } else {
          x = nx;
          y = ny;
          a = na;
        }
        const last = path[path.length - 1]!;
        if (Math.abs(last[0]! - x) >= 12 || Math.abs(last[1]! - y) >= 12 || angDiff(last[2]!, a) >= 10) {
          const prev = path[path.length - 2];
          if (prev && Math.abs(prev[0]! - x) <= STEP && Math.abs(prev[1]! - y) <= STEP && angDiff(prev[2]!, a) <= TURN && path.length > 1) path[path.length - 1] = [x, y, Math.round(a) % 180];
          else if (path.length < MAX_POSES) path.push([x, y, Math.round(a) % 180]);
        }
      }
      return { x, y, a: Math.round(a) % 180, path, scrapes: scr, marks, hitAt };
    };

    const finish = (st: { x: number; y: number; a: number; path: number[][]; scrapes: number; marks: number[][] }) => {
      const end = st.path[st.path.length - 1]!;
      const poses = end[0] === st.x && end[1] === st.y && end[2] === st.a ? st.path : [...st.path, [st.x, st.y, st.a]];
      dispatch({ t: "try", item: sel, poses: poses.slice(0, MAX_POSES), scrapes: st.scrapes, marks: st.marks });
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (s.buy) return;
      const [wx, wy] = toWorld(e) as [number, number];
      const cx = moved ? local.x : START[0]!, cy = moved ? local.y : START[1]!, ca = moved ? local.a : START[2]!;
      if (e.type === "down") {
        const t = (ca * Math.PI) / 180;
        const hx = cx + Math.cos(t) * (it.len / 2 + 6 / k), hy = cy + Math.sin(t) * (it.len / 2 + 6 / k);
        const hx2 = cx - Math.cos(t) * (it.len / 2 + 6 / k), hy2 = cy - Math.sin(t) * (it.len / 2 + 6 / k);
        const base = moved ? {} : { x: START[0]!, y: START[1]!, a: START[2]!, path: [[...START]], scrapes: 0, marks: [] };
        if (Math.hypot(wx - hx, wy - hy) < 22 || Math.hypot(wx - hx2, wy - hy2) < 16) setLocal({ ...base, mode: "turn", gx: wx, gy: wy });
        else if (Math.hypot(wx - cx, wy - cy) < it.len / 2 + 14) setLocal({ ...base, mode: "move", gx: wx - cx, gy: wy - cy });
        return;
      }
      if (e.type === "move" && local.mode) {
        if (local.mode === "move") {
          const st = slide(Math.round(wx - local.gx), Math.round(wy - local.gy), local.a);
          setLocal(st);
          if (madeAt(st.y)) {
            setLocal({ ...st, mode: "", toast: local.toast + 1 });
            haptic("success");
            finish(st);
          }
        } else {
          const ang = Math.round((((Math.atan2(wy - local.y, wx - local.x) * 180) / Math.PI) % 180 + 180) % 180) % 180;
          setLocal(slide(local.x, local.y, ang));
        }
        return;
      }
      if (e.type === "up") setLocal({ mode: "" });
    };

    const reset = () => setLocal({ x: START[0]!, y: START[1]!, a: 0, path: [], scrapes: 0, marks: [], mode: "" });
    const giveUp = () => {
      finish({ x: local.x, y: local.y, a: local.a, path: local.path, scrapes: local.scrapes, marks: local.marks });
      setLocal({ toast: local.toast + 1 });
    };

    const faces = s.tries
      .filter((t) => t.item === sel && t.user !== me)
      .map((t) => (
        <div key={t.user} style={{ position: "absolute", left: X(t.x) - 10, top: Y(t.y) - 10, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${c.card}`, pointerEvents: "none" }}>
          <Avatar user={{ id: t.user, name: nameOf(t) }} size={20} />
        </div>
      ));
    const yeller = s.yell.name && s.yell.said ? members.find((x) => x.name.trim().toLowerCase() === s.yell.name.toLowerCase()) : undefined;
    const quote = s.tries.filter((t) => t.item === sel && t.said).slice(-1)[0];
    const buyer = s.buy ? (s.buy.user === me ? "You" : members.find((x) => x.id === s.buy!.user)?.name ?? "Someone") : "";
    const other = s.items.findIndex((_, i) => i !== sel);
    const stuckHere = s.tries.some((t) => t.item === sel && !t.made);

    let status = "";
    if (s.buy) status = `${buyer} ${s.buy.user === me ? "are" : "is"} buying the ${s.items[s.buy.item]!.name.toLowerCase()} · ${money(s.items[s.buy.item]!.price)}`;
    else if (made(sel)) status = `It makes the turn · ${s.tries.filter((t) => t.item === sel && t.made).length} got it up`;
    else if (moved) status = local.scrapes ? `${local.scrapes} ${local.scrapes === 1 ? "scrape" : "scrapes"} so far · twist with the handle` : "Grab the round handle to twist it";
    else if (stuckHere) status = `Stuck ${s.tries.filter((t) => t.item === sel && !t.made).length} of ${s.tries.filter((t) => t.item === sel).length} tries · drag it up`;
    else status = "Drag the couch up the stairs";

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.place || `${s.items.length} couches to try`} />
        <div style={{ display: "flex", gap: 6, marginTop: -6, marginBottom: 2, height: 44, overflow: "hidden", alignItems: "center" }}>
          {s.items.map((x, i) => (
            <button
              key={i}
              aria-label={`${x.name}, ${money(x.price)}, ${x.len} inches`}
              onClick={() => setLocal({ item: i, x: START[0]!, y: START[1]!, a: 0, path: [], scrapes: 0, marks: [], mode: "" })}
              style={{
                flex: "0 1 auto",
                minWidth: 0,
                height: 44,
                padding: 0,
                border: 0,
                background: "transparent",
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  display: "block",
                  minWidth: 0,
                  height: 32,
                  lineHeight: "32px",
                  padding: "0 10px",
                  borderRadius: 16,
                  background: i === sel ? c.selected : c.wash,
                  color: i === sel ? c.link : c.text,
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {`${x.name} · ${money(x.price)}${made(i) ? " · fits" : s.tries.some((t) => t.item === i) ? " · stuck" : ""}`}
              </span>
            </button>
          ))}
        </div>
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} drag label={`Stairwell turn from above; ${it.name} ${it.len} inches; ${s.tries.filter((t) => t.item === sel).length} tries`} draw={draw} onPointer={onPointer} />
          {faces}
          {yeller ? (
            <div style={{ position: "absolute", left: X(250), top: Y(104), display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, pointerEvents: "none", transform: "translateX(-100%)" }}>
              <span style={{ padding: "2px 8px", borderRadius: 10, background: c.card, color: c.text, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", transform: "rotate(-4deg)" }}>{`“${s.yell.said}”`}</span>
            </div>
          ) : null}
          {yeller ? (
            <div style={{ position: "absolute", left: X(250) + 4, top: Y(100), display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${c.card}`, pointerEvents: "none" }}>
              <Avatar user={yeller} size={22} />
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 18, fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {quote ? `${nameOf(quote)}: “${quote.said}”` : lastMine ? (lastMine.made ? `You got the ${s.items[lastMine.item]!.name.toLowerCase()} up` : `You got stuck with ${lastMine.scrapes} ${lastMine.scrapes === 1 ? "scrape" : "scrapes"}`) : `${it.len}″ long, ${it.dep}″ deep · the turn is 44″ wide`}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: s.buy || made(sel) ? c.text : c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{status}</span>
          {moved && !s.buy ? (
            <Button kind="secondary" onClick={reset}>
              Reset
            </Button>
          ) : null}
          {s.buy ? (
            s.buy.user === me ? (
              <Button kind="deemphasized" onClick={() => dispatch({ t: "buy", item: s.buy!.item })}>
                Undo
              </Button>
            ) : null
          ) : made(sel) ? (
            <Button kind="primary" onClick={() => { dispatch({ t: "buy", item: sel }); haptic("success"); }}>
              Buy it
            </Button>
          ) : moved ? (
            <Button kind="primary" onClick={giveUp}>
              It's stuck
            </Button>
          ) : stuckHere && other >= 0 && !made(sel) ? (
            <Button kind="primary" onClick={() => setLocal({ item: other, x: START[0]!, y: START[1]!, a: 0, path: [], scrapes: 0, marks: [], mode: "" })}>
              {`Try the ${s.items[other]!.name.toLowerCase().split(" ").slice(-1)[0]}`}
            </Button>
          ) : null}
        </div>
        {local.toast > 0 && lastMine && lastMine.at > 0 ? <Toast key={local.toast}>{lastMine.made ? "It made the turn" : "Logged as stuck"}</Toast> : null}
      </div>
    );
  },
});
