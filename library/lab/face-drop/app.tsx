import { defineApp, Avatar, Button, Canvas, fitText, haptic, mix, pal, rng, seedOf, userColor, type Ctx, type Member, type Theme } from "@muse/app";

// Face drop: a story you can't stop poking. Tap anywhere to drop a friend's face onto a shared
// pile, tap a face to boop it, shake to rain the whole pile down again. The pile is computed from
// the shared drops, so every phone shows the same one.

type Params = {
  /** First names whose faces fall when the chat has no members to use, up to 8. */
  names: string[];
};

// @params
const P: Params = { names: ["Ana", "Leo", "Maya", "Kev", "Priya", "Sam", "Jess", "Theo"] };
// @end params

type Kind = "face" | "star" | "heart" | "lol";
type Drop = {
  id: number;
  by: string;
  who: string;
  name: string;
  kind: Kind;
  x: number;
  y: number;
  r: number;
  at: number;
  boop: { by: string; at: number } | null;
};
type State = { drops: Drop[]; dropped: number; counts: Record<string, number>; boops: number; shake: { n: number; at: number } };
type Action = { t: "drop"; x: number; y: number } | { t: "boop"; id: number } | { t: "shake" };
type Local = Record<string, never>;

const MAX = 40;
const SEEDED = 31;
const STAGE = 548;
const SHELF = 62;
const FLOOR = STAGE - SHELF;
const KINDS: Kind[] = ["face", "star", "heart", "lol"];
const SEED_STICKERS: Kind[] = ["heart", "star", "lol", "heart", "star"];

type Cast = { who: string; name: string };
const castOf = (ctx: Ctx): Cast[] => {
  if (ctx.members.length > 0) return ctx.members.map((m) => ({ who: m.id, name: m.name }));
  const names = P.names.map((n) => (typeof n === "string" ? n.trim() : "")).filter(Boolean).slice(0, 8);
  return names.length ? names.map((n) => ({ who: `guest:${n}`, name: n })) : [{ who: "guest:Maya", name: "Maya" }];
};

const radiusOf = (kind: Kind, r: { int(n: number): number }) => (kind === "face" ? 24 + r.int(10) : kind === "lol" ? 24 : 17 + r.int(5));
const rOk = (d: Drop) => Number.isInteger(d.r) && (d.kind === "face" ? d.r >= 24 && d.r <= 33 : d.kind === "lol" ? d.r === 24 : d.r >= 17 && d.r <= 21);

/** What a drop with this seed turns out to be: kind, whose face, size. */
function roll(seed: number, ctx: Ctx): { kind: Kind; who: string; name: string; r: number } {
  const r = rng(seed);
  const u = r.int(10);
  const kind: Kind = u === 0 ? "star" : u === 1 ? "heart" : u === 2 ? "lol" : "face";
  const cast = castOf(ctx);
  const face = kind === "face" ? cast[r.int(cast.length)]! : { who: "", name: "" };
  return { kind, who: face.who, name: face.name, r: radiusOf(kind, r) };
}

/** Shake: the pile in a seeded new order, each drop nudged sideways. */
function shaken(drops: Drop[], seed: number): Drop[] {
  const r = rng(seed);
  const out = drops.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = r.int(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out.map((d) => ({ ...d, x: Math.min(1000, Math.max(0, Math.round(d.x + (r.next() - 0.5) * 300))) }));
}

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const sum = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);
const sameIds = (a: Drop[], b: Drop[]) => a.length === b.length && a.every((d, i) => d.id === b[i]!.id);

// ---------- the pile: deterministic placement from the drops ----------

type Body = { d: Drop; x: number; y: number; rr: number; R: number; i: number };
const scaleOf = (W: number) => Math.min(1.1, Math.max(0.84, W / 380));

function place(bodies: Body[], x0: number, rr: number, W: number): [number, number] {
  const L = 4, Rw = W - 4;
  let x = Math.min(Rw - rr, Math.max(L + rr, x0));
  let y = -1e9;
  const free = (px: number, py: number, skip: Body | null) => {
    if (px - rr < L - 0.01 || px + rr > Rw + 0.01 || py + rr > FLOOR + 0.01) return false;
    for (const c of bodies) {
      if (c === skip) continue;
      const dx = px - c.x, dy = py - c.y, D = rr + c.rr - 0.01;
      if (dx * dx + dy * dy < D * D) return false;
    }
    return true;
  };
  for (let guard = 0; guard < 30; guard++) {
    let ny = FLOOR - rr;
    let hit: Body | null = null;
    for (const b of bodies) {
      const dx = x - b.x, D = rr + b.rr;
      if (Math.abs(dx) >= D) continue;
      const yc = b.y - Math.sqrt(D * D - dx * dx);
      if (yc >= y - 0.5 && yc < ny) {
        ny = yc;
        hit = b;
      }
    }
    y = ny;
    if (!hit) return [x, y];
    const B = hit;
    const D = rr + B.rr;
    const dir = x > B.x + 0.01 ? 1 : x < B.x - 0.01 ? -1 : bodies.length % 2 ? 1 : -1;
    let a = Math.atan2(y - B.y, x - B.x);
    const target = dir > 0 ? 0 : -Math.PI;
    let fell = false;
    for (let s = 0; s < 90; s++) {
      let na = a + dir * 0.04;
      if (dir > 0 ? na >= target : na <= target) na = target;
      const nx = B.x + D * Math.cos(na), ny2 = B.y + D * Math.sin(na);
      if (!free(nx, ny2, B)) {
        let lo = a, hi = na;
        for (let k = 0; k < 6; k++) {
          const m = (lo + hi) / 2;
          if (free(B.x + D * Math.cos(m), B.y + D * Math.sin(m), B)) lo = m;
          else hi = m;
        }
        return [B.x + D * Math.cos(lo), B.y + D * Math.sin(lo)];
      }
      a = na;
      if (na === target) {
        x = nx + dir * 0.6;
        y = ny2;
        fell = true;
        break;
      }
    }
    if (!fell) return [B.x + D * Math.cos(a), B.y + D * Math.sin(a)];
  }
  return [x, y];
}

let memoKey = "";
let memo: Body[] = [];
function pile(drops: Drop[], W: number): Body[] {
  const key = W + "|" + drops.map((d) => `${d.id}:${d.x}:${d.r}`).join(",");
  if (key === memoKey) return memo.map((b, i) => (b.d === drops[i] ? b : { ...b, d: drops[i]! }));
  const s = scaleOf(W);
  const out: Body[] = [];
  drops.forEach((d, i) => {
    const R = d.r * s;
    const rr = (d.r + 1.5) * s;
    const [x, y] = place(out, (d.x / 1000) * W, rr, W);
    out.push({ d, x, y, rr, R, i });
  });
  memoKey = key;
  memo = out;
  return out;
}

// ---------- motion ----------

const G = 0.0014; // px per ms²
/** A fall from y0 to y1 with two small bounces, e ms in. */
function fall(e: number, y0: number, y1: number): { y: number; t1: number; done: boolean } {
  const d = Math.max(0, y1 - y0);
  const t1 = Math.sqrt((2 * d) / G);
  if (e < t1) return { y: y0 + 0.5 * G * e * e, t1, done: false };
  let v = G * t1 * 0.35;
  let t = e - t1;
  for (let b = 0; b < 2; b++) {
    const tb = (2 * v) / G;
    if (t < tb) return { y: y1 - (v * t - 0.5 * G * t * t), t1, done: false };
    t -= tb;
    v *= 0.35;
  }
  return { y: y1, t1, done: true };
}
const backOut = (k: number) => {
  const c = 1.70158;
  const x = Math.min(1, Math.max(0, k)) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
const smooth = (k: number) => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};

// ---------- drawing: one Path2D per colour per layer ----------

const NL = 12;
type Layers = Map<string, Path2D>[];
const layers = (): Layers => Array.from({ length: NL }, () => new Map<string, Path2D>());
const pathOf = (L: Layers, k: number, c: string) => {
  let p = L[k]!.get(c);
  if (!p) {
    p = new Path2D();
    L[k]!.set(c, p);
  }
  return p;
};
const disc = (p: Path2D, x: number, y: number, r: number) => {
  p.moveTo(x + r, y);
  p.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
};
// layer ids
const SHADOW = 0, RING = 1, DISK = 2, SHIRT = 3, BACK = 4, NECK = 5, HEAD = 6, HAIR = 7, CHEEK = 8, EYE = 9, MOUTH = 10, TOP = 11;

type Look = { skin: string; hair: string; style: number; shirt: string; bg: string };
type Pal = ReturnType<typeof pal>;
function lookOf(d: Drop, q: Pal, t: Theme): Look {
  const r = rng(seedOf(d.name || d.who));
  const skins = [mix(q.orange, q.on, 0.7), mix(q.orange, q.on, 0.56), mix(q.orange, q.brown, 0.4), mix(q.brown, q.orange, 0.15)];
  const hairs = [q.dark, q.brown, mix(q.orange, q.brown, 0.3), mix(q.yellow, q.on, 0.2)];
  const shirt = userColor(d.who || d.name, t);
  return { skin: skins[r.int(4)]!, hair: hairs[r.int(4)]!, style: r.int(5), shirt, bg: mix(shirt, q.on, 0.35) };
}

type Mood = "smile" | "grin" | "shock";
function face(L: Layers, x: number, y: number, R: number, lk: Look, mood: Mood, q: Pal) {
  disc(pathOf(L, SHADOW, q.dark), x, y + 3, R + 2.5);
  disc(pathOf(L, RING, q.on), x, y, R + 3);
  disc(pathOf(L, DISK, lk.bg), x, y, R);
  // shirt: the disk below a chord, with rounded shoulders
  const th = Math.asin(0.56);
  const sp = pathOf(L, SHIRT, lk.shirt);
  sp.moveTo(x - R * Math.cos(th), y + 0.56 * R);
  sp.quadraticCurveTo(x - 0.55 * R, y + 0.38 * R, x - 0.3 * R, y + 0.38 * R);
  sp.lineTo(x + 0.3 * R, y + 0.38 * R);
  sp.quadraticCurveTo(x + 0.55 * R, y + 0.38 * R, x + R * Math.cos(th), y + 0.56 * R);
  sp.arc(x, y, R, th, Math.PI - th);
  sp.closePath();
  const Q = R * 1.1;
  const hx = x, hy = y - 0.07 * R, hr = 0.4 * Q;
  if (lk.style === 1) {
    const b = pathOf(L, BACK, lk.hair);
    b.moveTo(hx - hr * 1.1, hy);
    b.arc(hx, hy, hr * 1.1, Math.PI, 0);
    b.lineTo(hx + hr * 1.1, hy + 0.55 * Q);
    b.lineTo(hx - hr * 1.1, hy + 0.55 * Q);
    b.closePath();
  }
  const n = pathOf(L, NECK, lk.skin);
  n.rect(hx - 0.12 * Q, hy + 0.25 * Q, 0.24 * Q, 0.25 * Q);
  disc(pathOf(L, HEAD, lk.skin), hx, hy, hr);
  const h = pathOf(L, HAIR, lk.style === 4 ? q.green : lk.hair);
  const cap = (rad: number, fringe: number) => {
    h.moveTo(hx - rad, hy - fringe);
    h.arc(hx, hy, rad, Math.PI + 0.05, -0.05);
    h.quadraticCurveTo(hx + rad * 0.2, hy - hr * 0.55, hx - rad, hy - fringe);
    h.closePath();
  };
  if (lk.style === 0) {
    cap(hr * 1.06, hr * 0.12);
    disc(h, hx, hy - hr * 1.15, hr * 0.38);
  } else if (lk.style === 1) {
    cap(hr * 1.08, hr * 0.05);
  } else if (lk.style === 2) {
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.92 + (k / 8) * 1.16);
      disc(h, hx + Math.cos(a) * hr * 0.98, hy + Math.sin(a) * hr * 0.98, hr * 0.3);
    }
  } else if (lk.style === 3) {
    cap(hr * 1.04, hr * 0.28);
  } else {
    cap(hr * 1.08, hr * 0.2);
    h.rect(hx - hr * 0.2, hy - hr * 0.42, hr * 1.4, hr * 0.2);
  }
  const ch = pathOf(L, CHEEK, q.red);
  disc(ch, hx - 0.24 * Q, hy + 0.12 * Q, 0.07 * Q);
  disc(ch, hx + 0.24 * Q, hy + 0.12 * Q, 0.07 * Q);
  const e = pathOf(L, EYE, q.dark);
  disc(e, hx - 0.14 * Q, hy + 0.01 * Q, 0.045 * Q);
  disc(e, hx + 0.14 * Q, hy + 0.01 * Q, 0.045 * Q);
  const m = pathOf(L, MOUTH, q.dark);
  if (mood === "shock") disc(m, hx, hy + 0.2 * Q, 0.07 * Q);
  else if (mood === "grin") {
    m.moveTo(hx - 0.12 * Q, hy + 0.11 * Q);
    m.arc(hx, hy + 0.11 * Q, 0.12 * Q, 0, Math.PI);
    m.closePath();
  } else {
    m.moveTo(hx - 0.1 * Q, hy + 0.12 * Q);
    m.quadraticCurveTo(hx, hy + 0.24 * Q, hx + 0.1 * Q, hy + 0.12 * Q);
    m.quadraticCurveTo(hx, hy + 0.19 * Q, hx - 0.1 * Q, hy + 0.12 * Q);
    m.closePath();
  }
}

function star(p: Path2D, x: number, y: number, r: number, rot: number) {
  for (let k = 0; k < 10; k++) {
    const a = rot - Math.PI / 2 + (k * Math.PI) / 5;
    const rad = k % 2 ? r * 0.5 : r;
    if (k === 0) p.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    else p.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  p.closePath();
}
function heart(p: Path2D, x: number, y: number, s: number) {
  const w = s * 0.62;
  p.moveTo(x, y + w * 0.75);
  p.bezierCurveTo(x - w * 1.25, y - w * 0.05, x - w * 0.55, y - w * 0.95, x, y - w * 0.35);
  p.bezierCurveTo(x + w * 0.55, y - w * 0.95, x + w * 1.25, y - w * 0.05, x, y + w * 0.75);
  p.closePath();
}
function blob(p: Path2D, x: number, y: number, r: number, seed: number) {
  const g = rng(seed);
  const k = Array.from({ length: 7 }, () => 1 + (g.next() - 0.5) * 0.16);
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const f = i / 4;
    const j = Math.floor(f) % 7;
    const rad = r * (k[j]! + (k[(j + 1) % 7]! - k[j]!) * (f - Math.floor(f)));
    if (i === 0) p.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    else p.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  p.closePath();
}

type Text = { x: number; y: number; text: string; size: number; color: string; alpha: number; rot: number; max: number };
function sticker(L: Layers, texts: Text[], d: Drop, x: number, y: number, R: number, mood: Mood, rot: number, q: Pal, t: Theme) {
  if (d.kind === "face") return face(L, x, y, R, lookOf(d, q, t), mood, q);
  if (d.kind === "star") {
    star(pathOf(L, SHADOW, q.dark), x, y + 3, R + 4, rot);
    star(pathOf(L, RING, q.on), x, y, R + 3, rot);
    star(pathOf(L, DISK, q.yellow), x, y, R, rot);
  } else if (d.kind === "heart") {
    heart(pathOf(L, SHADOW, q.dark), x, y + 3, (R + 4.5) * 1.8);
    heart(pathOf(L, RING, q.on), x, y, (R + 3.5) * 1.8);
    heart(pathOf(L, DISK, q.red), x, y, R * 1.8);
  } else {
    blob(pathOf(L, SHADOW, q.dark), x, y + 3, R + 2.5, d.id >>> 0);
    blob(pathOf(L, RING, q.on), x, y, R + 3, d.id >>> 0);
    blob(pathOf(L, DISK, mix(q.purple, q.dark, 0.35)), x, y, R, d.id >>> 0);
    texts.push({ x, y, text: "lol", size: R * 0.8, color: q.on, alpha: 1, rot, max: R * 1.5 });
  }
}

function paint(g: CanvasRenderingContext2D, L: Layers) {
  L.forEach((m, k) => {
    g.globalAlpha = k === SHADOW ? 0.35 : k === CHEEK ? 0.35 : 1;
    m.forEach((p, c) => {
      g.fillStyle = c;
      g.fill(p);
    });
  });
  g.globalAlpha = 1;
}
function paintTexts(g: CanvasRenderingContext2D, texts: Text[]) {
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const tx of texts) {
    const f = fitText(tx.text, tx.max, { g, size: Math.max(10, tx.size), weight: 800 });
    g.save();
    g.translate(tx.x, tx.y);
    g.rotate(tx.rot);
    g.globalAlpha = tx.alpha;
    g.fillStyle = tx.color;
    g.font = f.font;
    g.fillText(f.text, 0, 1);
    g.restore();
  }
  g.textAlign = "start";
}

// Per-viewer glides when the pile reflows (the oldest drop left): positions stay shared, only the slide is local.
const prev = new Map<number, [number, number]>();
const glides = new Map<number, { fx: number; fy: number; t0: number }>();
let prevW = 0;

// ---------- the app ----------

export default defineApp<State, Action, Local>({
  name: "Face drop",
  summary: (s) => `Face drop · ${s.dropped} dropped${s.boops > 0 ? ` · ${s.boops} ${s.boops === 1 ? "boop" : "boops"}` : ""}`,

  init: (ctx) => {
    const cast = castOf(ctx);
    const r = rng(7);
    const drops: Drop[] = [];
    for (let k = 0; k < 26; k++) {
      const kind: Kind = k % 5 === 3 ? SEED_STICKERS[(k - 3) / 5]! : "face";
      const c = cast[k % cast.length]!;
      drops.push({
        id: k - 26,
        by: c.who,
        who: kind === "face" ? c.who : "",
        name: kind === "face" ? c.name : "",
        kind,
        x: Math.round(((30 + ((k * 61) % 320)) / 380) * 1000),
        y: 300,
        r: radiusOf(kind, r),
        at: 0,
        boop: null,
      });
    }
    return { drops, dropped: SEEDED, counts: {}, boops: 0, shake: { n: 0, at: 0 } };
  },

  reduce: (s, a, meta, ctx) => {
    if (!ctx.members.some((m) => m.id === meta.user)) return s;
    if (a.t === "drop") {
      if (!isInt(a.x, 0, 1000) || !isInt(a.y, 0, 1000) || s.drops.some((d) => d.id === meta.seq)) return s;
      const got = roll(meta.seed, ctx);
      const d: Drop = { id: meta.seq, by: meta.user, ...got, x: a.x, y: a.y, at: meta.time, boop: null };
      const drops = [...s.drops, d];
      if (drops.length > MAX) drops.shift();
      return { ...s, drops, dropped: s.dropped + 1, counts: { ...s.counts, [meta.user]: (s.counts[meta.user] ?? 0) + 1 } };
    }
    if (a.t === "boop") {
      if (!s.drops.some((d) => d.id === a.id)) return s;
      return { ...s, drops: s.drops.map((d) => (d.id === a.id ? { ...d, boop: { by: meta.user, at: meta.time } } : d)), boops: s.boops + 1 };
    }
    if (a.t === "shake") {
      if (s.drops.length === 0) return s;
      return { ...s, drops: shaken(s.drops, meta.seed), shake: { n: s.shake.n + 1, at: meta.time } };
    }
    return s;
  },

  onMembers: (s) => s,

  invariants: {
    "at most 40 in the pile": (s) => s.drops.length <= MAX,
    "drop ids unique": (s) => new Set(s.drops.map((d) => d.id)).size === s.drops.length,
    "drops well formed": (s) =>
      s.drops.every(
        (d) =>
          KINDS.includes(d.kind) &&
          isInt(d.x, 0, 1000) &&
          isInt(d.y, 0, 1000) &&
          rOk(d) &&
          (d.kind === "face" ? d.who !== "" && d.name !== "" : d.who === "" && d.name === ""),
      ),
    "count adds up": (s) => s.dropped === SEEDED + sum(s.counts) && Object.values(s.counts).every((n) => Number.isInteger(n) && n > 0),
    "boops cover booped faces": (s) => Number.isInteger(s.boops) && s.boops >= s.drops.filter((d) => d.boop !== null).length,
    "shakes count up": (s) => Number.isInteger(s.shake.n) && s.shake.n >= 0,
  },

  transitions: {
    "drop lands where tapped": (p, n, a, m) => {
      if (a.t !== "drop" || n === p) return true;
      const d = n.drops[n.drops.length - 1]!;
      return d.x === a.x && d.y === a.y && d.by === m.user && d.at === m.time && d.id === m.seq && d.boop === null;
    },
    "drop is seeded": (p, n, a, m, ctx) => {
      if (a.t !== "drop" || n === p) return true;
      const d = n.drops[n.drops.length - 1]!;
      const want = roll(m.seed, ctx);
      return d.kind === want.kind && d.who === want.who && d.name === want.name && d.r === want.r;
    },
    "drop counts once": (p, n, a, m) => {
      if (a.t !== "drop" || n === p) return true;
      const others = Object.keys({ ...p.counts, ...n.counts }).every((u) => u === m.user || p.counts[u] === n.counts[u]);
      return n.dropped === p.dropped + 1 && n.counts[m.user] === (p.counts[m.user] ?? 0) + 1 && others;
    },
    "only drops count": (p, n, a) => a.t === "drop" || (n.dropped === p.dropped && JSON.stringify(n.counts) === JSON.stringify(p.counts)),
    "oldest leaves first": (p, n, a) => {
      if (a.t !== "drop" || n === p) return true;
      return sameIds(n.drops.slice(0, -1), p.drops.length >= MAX ? p.drops.slice(1) : p.drops);
    },
    "boop marks one face": (p, n, a, m) => {
      if (a.t !== "boop" || n === p) return true;
      if (!sameIds(n.drops, p.drops) || n.boops !== p.boops + 1) return false;
      return n.drops.every((d, i) =>
        d.id === a.id ? d.boop?.by === m.user && d.boop.at === m.time && JSON.stringify({ ...d, boop: null }) === JSON.stringify({ ...p.drops[i]!, boop: null }) : d === p.drops[i],
      );
    },
    "only boops boop": (p, n, a) => a.t === "boop" || n.boops === p.boops,
    "shake is seeded": (p, n, a, m) =>
      a.t !== "shake" || n === p || (JSON.stringify(n.drops) === JSON.stringify(shaken(p.drops, m.seed)) && n.shake.n === p.shake.n + 1 && n.shake.at === m.time),
    "only shake shakes": (p, n, a) => a.t === "shake" || (n.shake.n === p.shake.n && n.shake.at === p.shake.at),
    "members act": (p, n, _a, m, ctx) => n === p || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _user, r) => {
    if (s.drops.length === 0) return { t: "drop", x: r.int(1001), y: r.int(800) };
    const v = r.next();
    if (v < 0.62) return { t: "drop", x: r.int(1001), y: r.int(800) };
    if (v < 0.92) return { t: "boop", id: r.pick(s.drops).id };
    return { t: "shake" };
  },

  local: {},

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const drops = confirmed.drops;
    const bodies = pile(drops, W);
    const known = new Set(drops.map((d) => d.id));
    const ghosts = state.drops.filter((d) => !known.has(d.id));
    const booped = new Map(state.drops.filter((d) => d.boop).map((d) => [d.id, d.boop!.at]));
    const shake = confirmed.shake;
    const mine = state.counts[me] ?? 0;
    const last = [...state.drops].reverse().find((d) => d.by !== me);
    const lastUser: Member | null = last ? (members.find((m) => m.id === last.by) ?? { id: last.by, name: last.by.startsWith("guest:") ? last.by.slice(6) : "Someone" }) : null;
    const faces = drops.filter((d) => d.kind === "face").length;
    const s = scaleOf(W);
    let down: [number, number] | null = null;

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number; theme: Theme }) => {
      const q = pal(f.theme);
      const now = f.now;
      const Wd = f.width;
      const H = f.height;
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, mix(q.blue, q.dark, 0.75));
      grad.addColorStop(0.16, mix(q.blue, q.dark, 0.2));
      grad.addColorStop(1, mix(q.blue, q.dark, 0.45));
      g.fillStyle = grad;
      g.fillRect(0, 0, Wd, H);
      const bub = new Path2D();
      for (let k = 0; k < 18; k++) disc(bub, (k * 83) % Wd, 20 + ((k * 47) % 300) + Math.sin((now / 1000) * 0.7 + k) * 4, 2 + (k % 3));
      g.globalAlpha = 0.12;
      g.fillStyle = q.on;
      g.fill(bub);
      g.globalAlpha = 0.45;
      g.fillStyle = q.dark;
      g.fillRect(0, FLOOR, Wd, H - FLOOR);
      g.globalAlpha = 1;

      if (prevW !== Wd) {
        prev.clear();
        glides.clear();
        prevW = Wd;
      }
      const shakeE = shake.n > 0 ? now - shake.at : Infinity;
      let live = false;
      const rest = layers();
      const restTexts: Text[] = [];
      const moving: (() => void)[] = [];
      for (const b of bodies) {
        const d = b.d;
        let x = b.x, y = b.y, scale = 1, rot = 0, mood: Mood = d.r % 3 === 0 ? "grin" : "smile";
        let animated = false;
        let ring: number | null = null;
        // shake: rain in from above, staggered
        if (shakeE >= 0 && shakeE < 2600) {
          const e = shakeE - b.i * 22;
          const y0 = -b.rr - 40 - (b.i % 5) * 30;
          const fl = fall(Math.max(0, e), y0, b.y);
          if (!fl.done) {
            y = e < 0 ? y0 : fl.y;
            rot = (1 - smooth(e / 900)) * ((b.i % 2 ? 1 : -1) * 0.8);
            animated = true;
          }
        }
        // a fresh drop: pop at the tap point, fall, bounce, slide to rest
        const de = now - d.at;
        if (d.at > 0 && de >= 0 && de < 2600) {
          const tapX = Math.min(Wd - b.rr - 4, Math.max(b.rr + 4, (d.x / 1000) * Wd));
          const y0 = Math.min((d.y / 1000) * H, b.y - 40);
          const fl = fall(de, y0, b.y);
          if (!fl.done) {
            y = fl.y;
            x = tapX + (b.x - tapX) * smooth((de - fl.t1) / 260);
            scale = backOut(de / 250);
            rot = (1 - smooth(de / 1200)) * (((d.id % 3) - 1) * 0.5);
            animated = true;
          }
        }
        // reflow glide (local)
        const pv = prev.get(d.id);
        if (!animated && pv && (Math.abs(pv[0] - b.x) > 1 || Math.abs(pv[1] - b.y) > 1)) glides.set(d.id, { fx: pv[0], fy: pv[1], t0: now });
        prev.set(d.id, [b.x, b.y]);
        const gl = glides.get(d.id);
        if (gl && !animated) {
          const k = (now - gl.t0) / 300;
          if (k < 1) {
            x = gl.fx + (b.x - gl.fx) * smooth(k);
            y = gl.fy + (b.y - gl.fy) * smooth(k);
            animated = true;
          } else glides.delete(d.id);
        }
        // boop: jump, full turn, shocked face
        const bt = booped.get(d.id);
        if (bt !== undefined && now - bt >= 0 && now - bt < 700) {
          const k = (now - bt) / 700;
          y -= Math.sin(Math.PI * k) * 60;
          rot += Math.PI * 2 * smooth(k) * (d.id % 2 ? 1 : -1);
          mood = "shock";
          ring = k;
          animated = true;
        }
        if (!animated) {
          sticker(rest, restTexts, d, x, y, b.R, mood, 0, q, f.theme);
          continue;
        }
        live = true;
        const R = b.R * Math.max(0.05, scale);
        moving.push(() => {
          const L = layers();
          const tx: Text[] = [];
          sticker(L, tx, d, 0, 0, R, mood, 0, q, f.theme);
          g.save();
          g.translate(x, y);
          g.rotate(rot);
          paint(g, L);
          paintTexts(g, tx);
          g.restore();
          if (ring !== null) {
            g.globalAlpha = 1 - ring;
            g.strokeStyle = q.on;
            g.lineWidth = 2;
            g.beginPath();
            g.arc(x, y, R + 6 + ring * 16, 0, Math.PI * 2);
            g.stroke();
            g.globalAlpha = 1;
            paintTexts(g, [{ x, y: y - R - 14 - ring * 10, text: "boop", size: 15, color: q.on, alpha: 1 - ring, rot: -0.15, max: 60 }]);
          }
        });
      }
      paint(g, rest);
      paintTexts(g, restTexts);
      for (const m of moving) m();
      // my drops not yet confirmed: a neutral disk at the tap point
      if (ghosts.length) {
        const L = layers();
        for (const d of ghosts) {
          const R = 26 * s;
          const x = Math.min(Wd - R - 7, Math.max(R + 7, (d.x / 1000) * Wd));
          const y = Math.min(FLOOR - R - 3, (d.y / 1000) * H);
          disc(pathOf(L, SHADOW, q.dark), x, y + 3, R + 2.5);
          disc(pathOf(L, RING, q.on), x, y, R + 3);
          disc(pathOf(L, DISK, q.shade), x, y, R);
        }
        paint(g, L);
        live = true;
      }
      return live;
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type === "down") {
        down = [e.x, e.y];
        return;
      }
      if (e.type !== "up" || !down) return;
      const moved = Math.hypot(e.x - down[0], e.y - down[1]);
      down = null;
      if (moved > 12) return;
      for (let i = bodies.length - 1; i >= 0; i--) {
        const b = bodies[i]!;
        if (Math.hypot(e.x - b.x, e.y - b.y) < b.rr) {
          dispatch({ t: "boop", id: b.d.id });
          haptic("light");
          return;
        }
      }
      if (e.y >= FLOOR || e.y < 0) return;
      dispatch({ t: "drop", x: Math.max(0, Math.min(1000, Math.round((e.x / W) * 1000))), y: Math.max(0, Math.min(1000, Math.round((e.y / STAGE) * 1000))) });
      haptic("light");
    };

    return (
      <div role="region" aria-label="Face drop" style={{ position: "relative", height: STAGE, borderRadius: 12, overflow: "hidden", background: mix(p.blue, p.dark, 0.45) }}>
        <Canvas height={STAGE} label={`Pile of ${drops.length} stickers, ${faces} faces`} draw={draw} onPointer={onPointer} />
        <div aria-hidden="true" style={{ position: "absolute", left: 8, right: 8, top: 8, height: 3, borderRadius: 2, background: mix(p.on, p.dark, 0.55), pointerEvents: "none" }}>
          <div style={{ width: "13%", height: 3, borderRadius: 2, background: p.on }} />
        </div>
        <div style={{ position: "absolute", left: 11, right: 12, top: 19, height: 32, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
          <span style={{ width: 32, height: 32, flex: "none", borderRadius: 16, background: p.on, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none" stroke={theme.color.primary} stroke-width="4">
              <circle cx="11" cy="11" r="8" />
            </svg>
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: p.on, flex: "none" }}>Muse</span>
          <span style={{ fontSize: 15, color: p.on, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Face drop · 1m</span>
          <svg width="18" height="4" viewBox="0 0 18 4" aria-hidden="true" fill={p.on} style={{ flex: "none" }}>
            <circle cx="2" cy="2" r="2" />
            <circle cx="9" cy="2" r="2" />
            <circle cx="16" cy="2" r="2" />
          </svg>
        </div>
        <div style={{ position: "absolute", left: 16, right: 16, top: 62, fontSize: 13, lineHeight: "17px", color: p.on, pointerEvents: "none" }}>
          Tap anywhere to drop a friend · tap a face to boop
        </div>
        <div style={{ position: "absolute", left: 16, right: 128, top: FLOOR + 8, pointerEvents: "none" }}>
          <div style={{ fontSize: 15, lineHeight: "20px", color: p.on, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {state.dropped} dropped · you: {mine}
          </div>
          {lastUser ? (
            <div style={{ marginTop: 4, height: 18, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: "none", display: "flex" }}>
                <Avatar user={lastUser} size={16} />
              </span>
              <span style={{ fontSize: 13, color: p.on, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastUser.name} dropped one</span>
            </div>
          ) : null}
        </div>
        <div style={{ position: "absolute", right: 16, top: FLOOR + (SHELF - 44) / 2, width: 100, height: 44, display: "flex", alignItems: "center" }}>
          <Button kind="secondary" wide onClick={() => dispatch({ t: "shake" })}>
            Shake
          </Button>
        </div>
      </div>
    );
  },
});
