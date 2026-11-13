import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  clock,
  fitText,
  haptic,
  innerWidth,
  mix,
  pal,
  rng,
  running,
  tween,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// "5 min away": the chat's running joke becomes a 25 second whack-a-mole. Theo pops up in every window
// of the block except the brunch place; bonk him, build a combo, never bonk Maya, then land on the board.
// Every pop comes from the run's server seed, so every phone sees the same round.

type Params = {
  /** Card title: "5 min away" */
  title: string;
  /** The joke, under the title: "Theo has said “omw” 38×" */
  joke: string;
  /** The friend who pops up. */
  target: string;
  /** The friend who is already there (do not bonk). */
  early: string;
  /** 6 short lines the target says. */
  says: string[];
  /** 2 lines the early friend says. */
  earlySays: string[];
  /** Sign on the awning. */
  place: string;
  /** Group name for the strip. */
  group: string;
  /** Plays so far. */
  tries: number;
  /** Banked bests. */
  board: { name: string; best: number; note: string }[];
};

// @params
const P: Params = {
  title: "5 min away",
  joke: "Theo has said “omw” 38×",
  target: "Theo",
  early: "Maya",
  says: ["omw!", "5 min", "parking", "2 min fr", "leaving now", "almost"],
  earlySays: ["I'm here", "been here 20m"],
  place: "Brunch 11:00",
  group: "Unit 7",
  tries: 14,
  board: [
    { name: "Maya", best: 410, note: "" },
    { name: "Jonah", best: 330, note: "" },
    { name: "Dev", best: 260, note: "" },
    { name: "Theo", best: 40, note: "from the Uber" },
  ],
};
// @end params

type Run = { seed: number; at: number; taps: [number, number][] };
type State = {
  title: string;
  joke: string;
  target: string;
  early: string;
  says: string[];
  earlySays: string[];
  place: string;
  group: string;
  tries: number;
  board: Record<string, number>;
  notes: Record<string, string>;
  runs: Record<string, Run>;
};
type Action = { t: "play" } | { t: "tap"; ms: number; h: number };
type Kind = "target" | "early" | "gold";
type Pop = { h: number; kind: Kind; at: number; life: number; line: number };
type Fx = { tau: number; h: number; text: string; good: boolean };
type Res = { score: number; bonks: number; combo: number; hits: Map<number, number>; fx: Fx[] };

const ROUND = 25;
const COLS = [76, 190, 304];
const ROWS = [96, 206];
const MAX_TAPS = 120;
const MAX_BEST = 6000;
const KMAX = 0.93;
const DEFAULT_SAYS = ["omw!", "5 min", "parking", "2 min fr", "leaving now", "almost"];
const DEFAULT_EARLY = ["I'm here", "been here 20m"];
const rise_in = tween({ duration: 400, easing: "decelerate" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOutBack = (x: number) => {
  const y = clamp01(x) - 1;
  return 1 + 2.70158 * y * y * y + 1.70158 * y * y;
};
const easeInOut = (x: number) => {
  const y = clamp01(x);
  return y < 0.5 ? 2 * y * y : 1 - (2 - 2 * y) * (2 - 2 * y) / 2;
};

/** Every pop of a round, decided by the seed alone. */
function schedule(seed: number): Pop[] {
  const g = rng(seed);
  const pops: Pop[] = [];
  let t = 0.35;
  while (t < 24.4) {
    const now = t;
    const free = [0, 1, 2, 3, 4, 5].filter((h) => !pops.some((p) => p.h === h && now < p.at + p.life));
    if (free.length) {
      const h = g.pick(free);
      const roll = g.next();
      const kind: Kind = roll < 0.07 && t > 4 ? "gold" : roll < 0.27 && t > 2 ? "early" : "target";
      const life = (1.35 - 0.55 * Math.min(1, t / 25)) * (kind === "gold" ? 0.75 : 1);
      pops.push({ h, kind, at: t, life, line: g.int(6) });
    }
    t += 0.72 - 0.3 * Math.min(1, t / 25);
  }
  return pops;
}

/** How far a pop is up (0 to 1) at time tau; `hit` is when it was bonked. */
function rise(p: Pop, tau: number, hit?: number): number {
  const e = tau - p.at;
  if (hit !== undefined) return (Math.min(e, 0.14) / 0.14) * (1 - easeInOut((tau - hit) / 0.28));
  return Math.max(0, easeOutBack(e / 0.16) * (1 - easeInOut((e - (p.life - 0.16)) / 0.16)));
}

/** Score a run from its seed and taps. */
function play(run: Run): Res {
  const pops = schedule(run.seed);
  const hits = new Map<number, number>();
  const escaped = new Set<number>();
  const fx: Fx[] = [];
  let score = 0;
  let bonks = 0;
  let combo = 0;
  for (const [ms, h] of run.taps) {
    const tau = ms / 1000;
    if (!(tau < ROUND)) continue;
    pops.forEach((p, i) => {
      if (p.kind === "target" && !hits.has(i) && !escaped.has(i) && p.at + p.life <= tau) {
        escaped.add(i);
        combo = Math.max(0, combo - 2);
      }
    });
    const idx = h < 0 ? -1 : pops.findIndex((p, i) => p.h === h && p.at <= tau && tau < p.at + p.life && !hits.has(i) && rise(p, tau) > 0.35);
    const p = pops[idx];
    if (!p) {
      combo = 0;
      continue;
    }
    hits.set(idx, tau);
    if (p.kind === "target") {
      combo += 1;
      const pts = 10 * (1 + Math.min(3, Math.floor(combo / 4)));
      score += pts;
      bonks += 1;
      fx.push({ tau, h, text: `+${pts}`, good: true });
    } else if (p.kind === "gold") {
      combo += 2;
      score += 50;
      bonks += 1;
      fx.push({ tau, h, text: "+50 on time?!", good: true });
    } else {
      combo = 0;
      score = Math.max(0, score - 20);
      fx.push({ tau, h, text: "−20 not her", good: false });
    }
  }
  return { score, bonks, combo, hits, fx };
}

// Independent copies for the checks (so a mutated game rule cannot also bend its own check).
function scheduleCopy(seed: number): Pop[] {
  const r = rng(seed);
  const out: Pop[] = [];
  for (let t = 0.35; t < 24.4; t += 0.72 - 0.3 * Math.min(1, t / 25)) {
    const open = [0, 1, 2, 3, 4, 5].filter((h) => out.every((p) => p.h !== h || t >= p.at + p.life));
    if (open.length === 0) continue;
    const h = r.pick(open);
    const roll = r.next();
    const kind: Kind = t > 4 && roll < 0.07 ? "gold" : t > 2 && roll < 0.27 ? "early" : "target";
    const life = (1.35 - 0.55 * Math.min(1, t / 25)) * (kind === "gold" ? 0.75 : 1);
    out.push({ h, kind, at: t, life, line: r.int(6) });
  }
  return out;
}
function scoreCopy(run: Run): number {
  const pops = scheduleCopy(run.seed);
  const done = new Set<number>();
  const gone = new Set<number>();
  let s = 0;
  let c = 0;
  for (const [ms, h] of run.taps) {
    const tau = ms / 1000;
    if (tau >= ROUND) continue;
    for (let i = 0; i < pops.length; i++) {
      const p = pops[i]!;
      if (p.kind === "target" && !done.has(i) && !gone.has(i) && p.at + p.life <= tau) {
        gone.add(i);
        c = Math.max(0, c - 2);
      }
    }
    let hit = -1;
    for (let i = 0; i < pops.length; i++) {
      const p = pops[i]!;
      if (p.h === h && p.at <= tau && tau < p.at + p.life && !done.has(i) && rise(p, tau) > 0.35) hit = i;
    }
    if (hit < 0) {
      c = 0;
      continue;
    }
    done.add(hit);
    const kind = pops[hit]!.kind;
    if (kind === "target") {
      c++;
      s += 10 * (1 + Math.min(3, Math.floor(c / 4)));
    } else if (kind === "gold") {
      c += 2;
      s += 50;
    } else {
      c = 0;
      s = Math.max(0, s - 20);
    }
  }
  return s;
}

const strs = (v: unknown, n: number, len: number, fallback: string[]) => {
  const list = Array.isArray(v) ? v.map((x) => clean(x, len)).filter(Boolean) : [];
  const base = list.length ? list : fallback;
  return Array.from({ length: n }, (_, i) => base[i % base.length]!);
};

function initState(ctx: Ctx): State {
  const board: Record<string, number> = {};
  const notes: Record<string, string> = {};
  for (const b of P.board ?? []) {
    const name = clean(b.name, 30).toLowerCase();
    const m = ctx.members.find((x) => x.id === b.name || x.name.toLowerCase() === name);
    if (!m || !Number.isFinite(b.best)) continue;
    board[m.id] = Math.max(0, Math.min(MAX_BEST, Math.round(b.best)));
    const note = clean(b.note, 20);
    if (note) notes[m.id] = note;
  }
  return {
    title: clean(P.title, 24) || "5 min away",
    joke: clean(P.joke, 40),
    target: clean(P.target, 16) || "Theo",
    early: clean(P.early, 16) || "Maya",
    says: strs(P.says, 6, 16, DEFAULT_SAYS),
    earlySays: strs(P.earlySays, 2, 16, DEFAULT_EARLY),
    place: clean(P.place, 16),
    group: clean(P.group, 16) || "the group",
    tries: Number.isFinite(P.tries) ? Math.max(0, Math.min(9999, Math.round(P.tries))) : 0,
    board,
    notes,
    runs: {},
  };
}

const bestOf = (s: State): { id: string; best: number } | null => {
  let top: { id: string; best: number } | null = null;
  for (const [id, best] of Object.entries(s.board)) if (!top || best > top.best) top = { id, best };
  return top;
};

/** Draw one character; everything is a theme color. */
function paintPerson(g: CanvasRenderingContext2D, T: DrawFrame["theme"], cx: number, bottom: number, kind: Kind, up: number, hit: boolean, t: number, idx: number) {
  const c = T.color;
  const P2 = pal(T);
  const ink = P2.dark;
  const white = P2.paper;
  const r = 21;
  const x = cx;
  const y = bottom + 26 - up * 58;
  const gold = kind === "gold";
  const early = kind === "early";
  const body = mix(gold ? c.series2 : early ? c.series4 : c.series3, ink, 0.12);
  const skin = early ? mix(P2.brown, P2.crust, 0.4) : mix(P2.crust, P2.cream, 0.5);
  const cap = gold ? c.series5 : c.series1;
  if (gold) {
    g.globalAlpha = 0.35 * up;
    g.fillStyle = c.series2;
    g.beginPath();
    g.arc(x, y, 34 + 3 * Math.sin(8 * t), 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  // hoodie
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(x, y + r + 22, r + 13, 22, 0, 0, Math.PI * 2);
  g.fill();
  if (early) {
    g.fillStyle = mix(P2.brown, ink, 0.6);
    g.beginPath();
    g.ellipse(x, y + 6, r + 5, r + 12, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = skin;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  if (!early) {
    g.fillStyle = cap;
    g.beginPath();
    g.ellipse(x, y - 3, r + 1.5, r + 3, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = mix(cap, white, 0.25);
    g.beginPath();
    g.roundRect(x - r - 2, y - 6 - 3.5, 2 * r + 4, 7, 3);
    g.fill();
    g.fillStyle = mix(cap, white, 0.45);
    g.beginPath();
    g.arc(x, y - r - 5, 5, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = mix(P2.brown, ink, 0.6);
    g.beginPath();
    g.moveTo(x - r, y - 2);
    g.lineTo(x - 0.7 * r, y - 0.85 * r);
    g.lineTo(x, y - r - 2);
    g.lineTo(x + 0.8 * r, y - 0.8 * r);
    g.lineTo(x + r, y - 2);
    g.lineTo(x + 0.3 * r, y - 0.45 * r);
    g.closePath();
    g.fill();
  }
  // cheeks
  g.globalAlpha = 0.45;
  g.fillStyle = c.series4;
  g.beginPath();
  g.arc(x - 13, y + 9, 3.2, 0, Math.PI * 2);
  g.arc(x + 13, y + 9, 3.2, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineCap = "round";
  if (hit) {
    g.lineWidth = 2.2;
    g.beginPath();
    for (const s of [-7, 7]) {
      g.moveTo(x + s - 3.2, y + 2 - 3.2);
      g.lineTo(x + s + 3.2, y + 2 + 3.2);
      g.moveTo(x + s + 3.2, y + 2 - 3.2);
      g.lineTo(x + s - 3.2, y + 2 + 3.2);
    }
    g.stroke();
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y + 11, 3.5, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = c.series2;
    for (let s = 0; s < 3; s++) {
      const a = 7 * t + s * 2.1;
      const sx = x + Math.cos(a) * 24;
      const sy = y - r - 4 + Math.sin(a) * 6;
      g.beginPath();
      for (let p = 0; p < 10; p++) {
        const rr = p % 2 === 0 ? 5 : 2.2;
        const aa = -Math.PI / 2 + (p * Math.PI) / 5;
        g.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
      }
      g.closePath();
      g.fill();
    }
  } else {
    const blink = (0.9 * t + x / 100) % 1 > 0.95;
    for (const s of [-7, 7]) {
      if (blink) {
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(x + s - 3, y + 2);
        g.lineTo(x + s + 3, y + 2);
        g.stroke();
      } else {
        g.fillStyle = ink;
        g.beginPath();
        g.arc(x + s, y + 2, 3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = white;
        g.beginPath();
        g.arc(x + s + 1, y + 1, 1, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.lineWidth = 2;
    g.beginPath();
    if (early) {
      g.moveTo(x - 5, y + 11);
      g.lineTo(x + 5, y + 11);
      g.moveTo(x + 3, y - 6);
      g.lineTo(x + 11, y - 8);
    } else g.arc(x, y + 7, 6.5, 0.35, 2.8);
    g.stroke();
  }
  // prop in hand
  const hx = x + r + 4;
  const hy = y + 16;
  if (early) {
    g.fillStyle = white;
    g.beginPath();
    g.roundRect(hx - 6, hy - 8, 12, 16, 2);
    g.fill();
    g.fillStyle = P2.brown;
    g.fillRect(hx - 6, hy - 3, 12, 5);
    g.fillStyle = white;
    g.beginPath();
    g.roundRect(hx - 7, hy - 12, 14, 4, 1.5);
    g.fill();
  } else if (gold) {
    g.fillStyle = white;
    g.beginPath();
    g.arc(hx, hy - 2, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = ink;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(hx, hy - 2, 9, 0, Math.PI * 2);
    g.moveTo(hx, hy - 2);
    g.lineTo(hx + Math.cos(3 * t) * 7, hy - 2 + Math.sin(3 * t) * 7);
    g.stroke();
  } else {
    g.fillStyle = ink;
    g.beginPath();
    g.roundRect(hx - 5.5, hy - 12, 11, 19, 2.5);
    g.fill();
    g.fillStyle = mix(c.series1, white, 0.5);
    g.beginPath();
    g.roundRect(hx - 4, hy - 10, 8, 14, 1.5);
    g.fill();
  }
  g.fillStyle = skin;
  g.beginPath();
  g.arc(hx, hy + 5, 5, 0, Math.PI * 2);
  g.fill();
  void idx;
}

type Scene = {
  phase: "ready" | "play" | "over";
  pops: Pop[];
  res: Res | null;
  start: number;
  target: string;
  early: string;
  says: string[];
  earlySays: string[];
  place: string;
  table: Member[];
  label: string;
};

function drawScene(g: CanvasRenderingContext2D, f: DrawFrame, S: Scene): boolean {
  const T = f.theme;
  const c = T.color;
  const pl = pal(T);
  const ink = pl.dark;
  const white = pl.paper;
  const W = f.width;
  const H = f.height;
  const k = Math.min(KMAX, W / 380);
  const ox = (W - 380 * k) / 2;
  const px = (n: number) => Math.max(n, 10.2 / k);
  const t = f.now / 1000;
  const tau = S.phase === "play" ? Math.max(0, (f.now - S.start) / 1000) : S.phase === "over" ? ROUND : 0;
  const res = S.res;

  // active occupants per window
  const occ: ({ kind: Kind; up: number; hit: boolean; line: number; hitAt: number } | undefined)[] = [];
  if (S.phase === "ready") occ[4] = { kind: "target", up: 0.55 + 0.1 * Math.sin(2.5 * t), hit: false, line: 0, hitAt: 0 };
  else if (S.phase === "play")
    S.pops.forEach((p, i) => {
      const hitAt = res?.hits.get(i);
      if (tau < p.at) return;
      if (hitAt !== undefined && tau < hitAt) return;
      const live = hitAt !== undefined ? tau < hitAt + 0.5 : tau < p.at + p.life;
      if (!live) return;
      const up = rise(p, tau, hitAt);
      if (up > 0) occ[p.h] = { kind: p.kind, up, hit: hitAt !== undefined, line: p.line, hitAt: hitAt ?? 0 };
    });

  // early hit: shake and flash
  let shake = 0;
  let flash = 0;
  if (res) {
    const lastBad = [...res.fx].reverse().find((x) => !x.good);
    if (lastBad && tau - lastBad.tau >= 0 && tau - lastBad.tau < 0.4) {
      const e = tau - lastBad.tau;
      shake = 7 * Math.sin(60 * e) * (1 - e / 0.4);
      flash = 0.18 * (1 - e / 0.4);
    }
  }

  g.save();
  g.beginPath();
  g.roundRect(0, 0, W, H, 12);
  g.clip();
  g.textBaseline = "middle";
  g.textAlign = "left";

  // sky
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, mix(c.series4, c.card, 0.55));
  sky.addColorStop(1, mix(c.series2, c.card, 0.55));
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  g.translate(ox + shake, 0);
  g.scale(k, k);

  g.globalAlpha = 0.8;
  g.fillStyle = mix(c.series2, white, 0.4);
  g.beginPath();
  g.arc(330, 20, 30, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;

  // building
  const brick = mix(mix(c.series1, c.series6, 0.6), ink, 0.3);
  g.globalAlpha = 0.2;
  g.fillStyle = ink;
  g.beginPath();
  g.roundRect(17, 37, 352, 270, [10, 10, 0, 0]);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = brick;
  g.beginPath();
  g.roundRect(14, 34, 352, 270, [10, 10, 0, 0]);
  g.fill();
  const joints = new Path2D();
  for (let y = 46; y < 300; y += 12) {
    joints.moveTo(14, y);
    joints.lineTo(366, y);
  }
  for (let row = 0, y = 34; y < 300; row++, y += 12) {
    for (let x = 14 + (row % 2 ? 14 : 0) + 28; x < 366; x += 28) {
      joints.moveTo(x, y);
      joints.lineTo(x, Math.min(300, y + 12));
    }
  }
  g.globalAlpha = 0.12;
  g.strokeStyle = ink;
  g.lineWidth = 1;
  g.stroke(joints);
  g.globalAlpha = 1;
  g.fillStyle = mix(brick, ink, 0.35);
  g.beginPath();
  g.roundRect(10, 28, 360, 10, 4);
  g.fill();

  // windows
  for (let i = 0; i < 6; i++) {
    const cx = COLS[i % 3]!;
    const cy = ROWS[Math.floor(i / 3)]!;
    const left = cx - 46;
    const top = cy - 42;
    const bottom = cy + 42;
    g.fillStyle = mix(c.card, c.wash, 0.2);
    g.beginPath();
    g.roundRect(left - 5, top - 5, 102, 94, 6);
    g.fill();
    g.save();
    g.beginPath();
    g.roundRect(left, top, 92, 84, 3);
    g.clip();
    const room = g.createLinearGradient(0, top, 0, bottom);
    room.addColorStop(0, mix(ink, c.series4, 0.3));
    room.addColorStop(1, mix(ink, c.series2, 0.2));
    g.fillStyle = room;
    g.fillRect(left, top, 92, 84);
    // lamp
    g.globalAlpha = 0.3;
    g.strokeStyle = white;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx, top);
    g.lineTo(cx, top + 14);
    g.stroke();
    g.globalAlpha = 0.1;
    g.fillStyle = c.series2;
    g.beginPath();
    g.arc(cx, top + 18, 16, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = mix(c.series2, white, 0.3);
    g.beginPath();
    g.moveTo(cx - 4, top + 14);
    g.lineTo(cx + 4, top + 14);
    g.lineTo(cx + 8, top + 20);
    g.lineTo(cx - 8, top + 20);
    g.closePath();
    g.fill();
    // curtains
    g.fillStyle = mix(c.series3, c.card, 0.25);
    g.beginPath();
    g.moveTo(left, top);
    g.lineTo(left + 18, top);
    g.lineTo(left + 10, top + 44);
    g.lineTo(left, top + 52);
    g.closePath();
    g.moveTo(left + 92, top);
    g.lineTo(left + 74, top);
    g.lineTo(left + 82, top + 44);
    g.lineTo(left + 92, top + 52);
    g.closePath();
    g.fill();
    const o = occ[i];
    if (o) paintPerson(g, T, cx, bottom, o.kind, o.up, o.hit, t, i);
    g.restore();
    // sill
    g.globalAlpha = 0.2;
    g.fillStyle = ink;
    g.beginPath();
    g.roundRect(left - 9, bottom, 110, 9, 3);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = mix(c.card, c.secondaryText, 0.25);
    g.beginPath();
    g.roundRect(left - 9, bottom - 2, 110, 9, 3);
    g.fill();
    if (i === 1 || i === 3) {
      g.fillStyle = pl.brown;
      g.fillRect(left - 9 + 30, bottom - 9, 10, 8);
      g.strokeStyle = c.series3;
      g.lineWidth = 2.5;
      g.beginPath();
      const px = left - 9 + 35;
      for (const dx of [-Math.sin(0.6) * 8, 0, Math.sin(0.6) * 8]) {
        g.moveTo(px, bottom - 9);
        g.lineTo(px + dx, bottom - 18);
      }
      g.stroke();
    }
  }

  // bubbles
  g.textBaseline = "middle";
  for (let i = 0; i < 6; i++) {
    const o = occ[i];
    if (!o || o.up < 0.8) continue;
    const text =
      o.kind === "gold" ? "I'm here" : o.kind === "early" ? (o.hit ? "ow?? why" : S.earlySays[o.line % 2]!) : o.hit ? "ok ok omw!" : S.says[o.line]!;
    const fit = fitText(text, 84, { g, size: px(11), weight: 600, min: px(10), family: T.type.family });
    const w = fit.width + 14;
    const bx = COLS[i % 3]! - 46 - 6;
    const by = ROWS[Math.floor(i / 3)]! - 42 - 14;
    g.fillStyle = o.kind === "gold" ? c.series2 : white;
    g.beginPath();
    g.roundRect(bx, by, w, 20, 10);
    g.moveTo(bx + 8, by + 19);
    g.lineTo(bx + 16, by + 19);
    g.lineTo(bx + 7, by + 27);
    g.closePath();
    g.fill();
    g.font = fit.font;
    g.fillStyle = ink;
    g.fillText(fit.text, bx + 7, by + 10.5);
  }

  // street
  const sx0 = -ox / k - 6;
  const sw = W / k + 12;
  g.fillStyle = mix(c.secondaryText, c.card, 0.55);
  g.beginPath();
  g.roundRect(sx0, 300, sw, 40, [0, 0, 14, 14]);
  g.fill();
  g.globalAlpha = 0.25;
  g.fillStyle = ink;
  g.fillRect(sx0, 299, sw, 2);
  g.globalAlpha = 1;
  // awning
  for (let s = 0; s < 6; s++) {
    g.fillStyle = s % 2 === 0 ? c.primary : c.card;
    g.fillRect(24 + s * 25, 286, 25, 14);
  }
  g.fillStyle = c.text;
  g.beginPath();
  g.roundRect(53, 285, 92, 15, 4);
  g.fill();
  const plate = fitText(S.place, 84, { g, size: px(11.5), weight: 600, min: px(10), family: T.type.family });
  g.font = plate.font;
  g.fillStyle = c.card;
  g.textAlign = "center";
  g.fillText(plate.text, 99, 292.5);
  // table of friends
  g.fillStyle = c.text;
  g.beginPath();
  g.roundRect(22, 332, 118, 5, 2);
  g.fill();
  S.table.forEach((m, j) => {
    const fx = 34 + 30 * j;
    const fy = 322 + 1.2 * Math.sin(2 * t + j);
    g.fillStyle = userColor(m, T);
    g.beginPath();
    g.arc(fx, fy, 11, 0, Math.PI * 2);
    g.fill();
    g.font = `600 ${px(12)}px ${T.type.family}`;
    g.fillStyle = c.onPrimary;
    g.fillText((m.name.trim()[0] ?? "?").toUpperCase(), fx, fy + 0.5);
  });
  g.globalAlpha = 0.5;
  g.strokeStyle = ink;
  g.lineWidth = 1.5;
  g.setLineDash([3, 3]);
  g.beginPath();
  g.arc(160, 322, 11, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;
  g.font = `700 ${px(12)}px ${T.type.family}`;
  g.fillStyle = c.text;
  g.fillText("?", 160, 322.5);
  const late = S.phase === "ready" ? 12 : S.phase === "over" ? 57 : 12 + Math.floor(1.8 * tau);
  g.fillStyle = c.card;
  g.beginPath();
  g.arc(200, 321, 10, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = c.text;
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(200, 321, 10, 0, Math.PI * 2);
  const am = (late / 60) * Math.PI * 2 - Math.PI / 2;
  g.moveTo(200, 321);
  g.lineTo(200 + Math.cos(am) * 7, 321 + Math.sin(am) * 7);
  g.moveTo(200, 321);
  g.lineTo(200 + Math.cos(am / 12 - Math.PI / 2 + 0.9) * 4.5, 321 + Math.sin(am / 12 - Math.PI / 2 + 0.9) * 4.5);
  g.stroke();
  const lateText = fitText(`${S.target} is ${late} min late`, 150, { g, size: px(11), min: px(10), family: T.type.family });
  g.font = lateText.font;
  g.textAlign = "left";
  g.fillStyle = c.text;
  g.fillText(lateText.text, 216, 321.5);

  // flash on an early hit
  if (flash > 0) {
    g.globalAlpha = flash;
    g.fillStyle = c.negative;
    g.fillRect(sx0, 0, sw, 340);
    g.globalAlpha = 1;
  }

  // score pops
  if (res) {
    for (const x of res.fx) {
      const e = tau - x.tau;
      if (e < 0 || e > 0.9) continue;
      const hx = COLS[x.h % 3]!;
      const hy = ROWS[Math.floor(x.h / 3)]! - 20 - 30 * (e / 0.9);
      const fit = fitText(x.text, 100, { g, size: px(18), weight: 700, min: px(12), family: T.type.family });
      g.font = fit.font;
      g.textAlign = "center";
      g.globalAlpha = e > 0.6 ? 1 - (e - 0.6) / 0.3 : 1;
      g.lineWidth = 3;
      g.lineJoin = "round";
      g.strokeStyle = ink;
      g.strokeText(fit.text, hx, hy);
      g.fillStyle = x.good ? c.series2 : c.negative;
      g.fillText(fit.text, hx, hy);
      g.globalAlpha = 1;
    }
  }

  if (S.phase === "over") {
    g.globalAlpha = 0.2;
    g.fillStyle = ink;
    g.fillRect(sx0, 0, sw, 340);
    g.globalAlpha = 1;
  }

  // HUD
  if (S.phase !== "ready" && res) {
    const lastGood = [...res.fx].reverse().find((x) => x.good);
    const pop = lastGood && S.phase === "play" ? 1 + 0.3 * (1 - clamp01((tau - lastGood.tau) / 0.25)) : 1;
    g.save();
    g.translate(20, 17);
    g.scale(pop, pop);
    g.font = `700 24px ${T.type.family}`;
    g.textAlign = "left";
    g.fillStyle = c.text;
    g.fillText(String(res.score), 0, 0);
    g.restore();
    const m = 1 + Math.min(3, Math.floor(res.combo / 4));
    if (S.phase === "play" && res.combo >= 2) {
      g.fillStyle = m > 1 ? c.primary : c.card;
      g.beginPath();
      g.roundRect(138, 6, 104, 22, 11);
      g.fill();
      const fit = fitText(`${res.combo} combo · x${m}`, 92, { g, size: px(12), weight: 600, min: px(10), family: T.type.family });
      g.font = fit.font;
      g.textAlign = "center";
      g.fillStyle = m > 1 ? c.onPrimary : c.text;
      g.fillText(fit.text, 190, 17.5);
    }
    const left = Math.max(0, ROUND - tau);
    g.globalAlpha = 0.85;
    g.fillStyle = c.card;
    g.beginPath();
    g.arc(356, 17, 13, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.15;
    g.strokeStyle = ink;
    g.lineWidth = 3.5;
    g.beginPath();
    g.arc(356, 17, 10, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
    g.strokeStyle = left < ROUND * 0.2 ? c.negative : c.series3;
    g.lineCap = "round";
    g.beginPath();
    g.arc(356, 17, 10, -Math.PI / 2, -Math.PI / 2 + (left / ROUND) * Math.PI * 2);
    g.stroke();
    g.font = `600 ${px(10.5)}px ${T.type.family}`;
    g.textAlign = "center";
    g.fillStyle = c.text;
    g.fillText(String(Math.ceil(left)), 356, 17.5);
  }
  g.restore();
  return true;
}

const Trophy = ({ color }: { color: string }) => (
  <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" style={{ flex: "none" }}>
    <path d="M3 1h6v3.2a3 3 0 0 1-6 0z" fill={color} />
    <path d="M3 2H1.3c0 2 .8 3 2 3M9 2h1.7c0 2-.8 3-2 3" fill="none" stroke={color} stroke-width="1" />
    <rect x="5.2" y="7" width="1.6" height="2" fill={color} />
    <rect x="3.5" y="9" width="5" height="1.6" rx="0.6" fill={color} />
  </svg>
);

export default defineApp<State, Action>({
  name: "5 min away",

  summary: (s, ctx) => {
    const top = bestOf(s);
    if (!top) return `${s.title}: nobody's played yet`;
    const who = ctx.members.find((m) => m.id === top.id)?.name ?? "Someone";
    return `${s.title}: ${who} leads with ${top.best} · ${s.tries} tries`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const u = m.user;
    if (a.t === "play") {
      const last = s.runs[u];
      const board = last ? { ...s.board, [u]: Math.min(MAX_BEST, Math.max(s.board[u] ?? 0, play(last).score)) } : s.board;
      return { ...s, board, runs: { ...s.runs, [u]: { seed: m.seed, at: m.time, taps: [] } }, tries: s.tries + 1 };
    }
    if (a.t === "tap") {
      const run = s.runs[u];
      if (!run || !Number.isInteger(a.ms) || !Number.isInteger(a.h)) return s;
      if (a.ms < 0 || a.ms >= ROUND * 1000 || a.h < -1 || a.h > 5) return s;
      if (run.taps.length >= MAX_TAPS) return s;
      const lastMs = run.taps.length ? run.taps[run.taps.length - 1]![0] : 0;
      if (a.ms < lastMs) return s;
      return { ...s, runs: { ...s.runs, [u]: { ...run, taps: [...run.taps, [a.ms, a.h]] } } };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const keep = (id: string) => inChat(ctx, id);
    const stays = [...Object.keys(s.board), ...Object.keys(s.notes), ...Object.keys(s.runs)].every(keep);
    if (stays) return s;
    const pick = <V,>(o: Record<string, V>) => Object.fromEntries(Object.entries(o).filter(([id]) => keep(id))) as Record<string, V>;
    return { ...s, board: pick(s.board), notes: pick(s.notes), runs: pick(s.runs) };
  },

  invariants: {
    "the board and runs hold people in the chat": (s, ctx) =>
      [...Object.keys(s.board), ...Object.keys(s.notes), ...Object.keys(s.runs)].every((id) => ctx.members.some((m) => m.id === id)),
    "bests are whole points in range": (s) => Object.values(s.board).every((b) => Number.isInteger(b) && b >= 0 && b <= MAX_BEST),
    "taps are in order, inside the round, on real holes": (s) =>
      Object.values(s.runs).every(
        (r) =>
          r.taps.length <= MAX_TAPS &&
          r.taps.every(([ms, h], i) => Number.isInteger(ms) && Number.isInteger(h) && ms >= 0 && ms < 25000 && h >= -1 && h <= 5 && (i === 0 || ms >= r.taps[i - 1]![0])),
      ),
    "every run was a counted try": (s) => Number.isInteger(s.tries) && s.tries >= Object.keys(s.runs).length,
    "a run is stamped": (s) => Object.values(s.runs).every((r) => Number.isInteger(r.seed) && r.seed >= 0 && Number.isFinite(r.at)),
  },

  transitions: {
    "play opens a fresh run seeded by the server": (p, n, a, m) =>
      a.t !== "play" ||
      p === n ||
      (n.runs[m.user]?.seed === m.seed && n.runs[m.user]?.at === m.time && n.runs[m.user]?.taps.length === 0 && n.tries === p.tries + 1),
    "play banks the last run": (p, n, a, m) => {
      if (a.t !== "play" || p === n) return true;
      const last = p.runs[m.user];
      if (!last) return n.board[m.user] === p.board[m.user];
      return n.board[m.user] === Math.min(MAX_BEST, Math.max(p.board[m.user] ?? 0, scoreCopy(last)));
    },
    "a tap adds one tap to the sender's own run": (p, n, a, m) => {
      if (a.t !== "tap" || p === n) return true;
      const before = p.runs[m.user];
      const after = n.runs[m.user];
      if (!before || !after) return false;
      const lastTap = after.taps[after.taps.length - 1];
      return (
        after.taps.length === before.taps.length + 1 &&
        !!lastTap &&
        lastTap[0] === a.ms &&
        lastTap[1] === a.h &&
        after.seed === before.seed &&
        Object.keys(n.runs).every((id) => id === m.user || n.runs[id] === p.runs[id])
      );
    },
    "taps never touch the board or tries": (p, n, a) => a.t !== "tap" || (JSON.stringify(n.board) === JSON.stringify(p.board) && n.tries === p.tries),
    "bests only go up": (p, n) => Object.keys(p.board).every((u) => n.board[u] === undefined || n.board[u]! >= p.board[u]!),
    "the joke never changes": (p, n) =>
      p.title === n.title &&
      p.joke === n.joke &&
      p.target === n.target &&
      p.early === n.early &&
      p.place === n.place &&
      p.group === n.group &&
      JSON.stringify(p.says) === JSON.stringify(n.says) &&
      JSON.stringify(p.earlySays) === JSON.stringify(n.earlySays) &&
      JSON.stringify(p.notes) === JSON.stringify(n.notes),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r) => {
    const run = s.runs[user];
    if (!run || r.next() < 0.08) return { t: "play" };
    const last = run.taps.length ? run.taps[run.taps.length - 1]![0] : 0;
    if (r.next() < 0.7) {
      const pop = schedule(run.seed).find((p) => (p.at + 0.2) * 1000 > last);
      if (!pop) return { t: "play" };
      return { t: "tap", ms: Math.round((pop.at + 0.2) * 1000), h: pop.h };
    }
    const ms = last + 150 + r.int(500);
    return ms >= ROUND * 1000 ? { t: "play" } : { t: "tap", ms, h: r.int(7) - 1 };
  },

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const c = theme.color;
    const pl = pal(theme);
    const W = innerWidth();
    const k = Math.min(KMAX, W / 380);
    const H = Math.round(340 * k);
    const narrow = W < 360;
    const run = confirmed.runs[me];
    const e = run ? running(run.at, ROUND * 1000) : null;
    const phase: "ready" | "play" | "over" = !run ? "ready" : e !== null ? "play" : "over";
    const waiting = pending && state.tries !== confirmed.tries;
    const mine = state.runs[me];
    const live = run && mine && mine.seed === run.seed && mine.at === run.at ? mine : run;
    const res = live ? play(live) : null;
    const pops = run ? schedule(run.seed) : [];

    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? id));
    const crew: Member[] = members.length ? members : P.board.map((b) => ({ id: b.name.toLowerCase(), name: b.name }));
    const table = crew.filter((m) => m.name.toLowerCase() !== state.target.toLowerCase()).slice(0, 4);
    const nowMs = clock.peek();

    // bests, with finished runs counted
    const bests: Record<string, number> = { ...confirmed.board };
    for (const [id, r] of Object.entries(confirmed.runs)) {
      if (nowMs - r.at >= ROUND * 1000) bests[id] = Math.max(bests[id] ?? 0, play(r).score);
    }
    const ranked = Object.entries(bests)
      .filter(([id]) => members.some((m) => m.id === id) || confirmed.board[id] !== undefined)
      .sort((x, y) => y[1] - x[1] || nameOf(x[0]).localeCompare(nameOf(y[0])));
    const played = new Set([...Object.keys(confirmed.board), ...Object.keys(confirmed.runs)]).size;
    const myBest = confirmed.board[me];

    const canvasLabel =
      phase === "play" && res
        ? `Whack-a-${state.target}: ${res.score} points, ${Math.max(0, Math.ceil(ROUND - (e ?? 0) / 1000))} seconds left`
        : `Whack-a-${state.target}: a brick block with six lit windows`;

    const scene: Scene = {
      phase,
      pops,
      res,
      start: run?.at ?? 0,
      target: state.target,
      early: state.early,
      says: state.says,
      earlySays: state.earlySays,
      place: state.place,
      table,
      label: canvasLabel,
    };

    const onPointer = (ev: { type: string; x: number; y: number }) => {
      if (ev.type !== "down" || phase !== "play" || !run) return;
      const kk = Math.min(KMAX, W / 380);
      const ox = (W - 380 * kk) / 2;
      const gx = (ev.x - ox) / kk;
      const gy = ev.y / kk;
      let h = -1;
      for (let i = 0; i < 6; i++) {
        const cx = COLS[i % 3]!;
        const cy = ROWS[Math.floor(i / 3)]!;
        if (gx >= cx - 52 && gx <= cx + 52 && gy >= cy - 48 && gy <= cy + 48) h = i;
      }
      const before = mine ?? run;
      const lastMs = before.taps.length ? before.taps[before.taps.length - 1]![0] : 0;
      const ms = Math.max(lastMs, Math.round(clock.peek() - run.at));
      if (ms < 0 || ms >= ROUND * 1000) return;
      const was = play(before);
      const next = play({ ...before, taps: [...before.taps, [ms, h]] });
      if (next.bonks > was.bonks) haptic("light");
      else if (next.score < was.score) haptic("medium");
      dispatch({ t: "tap", ms, h });
    };

    const shadow = `0 4px 18px ${mix(c.text, c.card, 0.8)}`;
    const readyCard = (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: Math.round(84 * k),
          transform: "translateX(-50%)",
          width: Math.min(260, W - 24),
          boxSizing: "border-box",
          padding: 12,
          background: c.card,
          borderRadius: 12,
          boxShadow: shadow,
        }}
      >
        <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 700, color: c.text }}>{`Bonk ${state.target} back on his way`}</div>
        <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, marginTop: 2 }}>25 seconds · faster bonks score more</div>
        <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>{`Don't bonk ${state.early}. She's been here.`}</div>
        <div style={{ marginTop: 8 }}>
          <Button kind="primary" wide disabled={waiting} onClick={() => dispatch({ t: "play" })}>
            {waiting ? "Starting" : "Play"}
          </Button>
        </div>
      </div>
    );

    const rowH = narrow ? 26 : 30;
    const shown = ranked.slice(0, 5);
    const meRank = ranked.findIndex(([id]) => id === me);
    const board = shown.some(([id]) => id === me) || meRank < 0 ? shown.map(([id, b], i) => ({ id, b, rank: i + 1 })) : [...shown.slice(0, 4).map(([id, b], i) => ({ id, b, rank: i + 1 })), { id: me, b: ranked[meRank]![1], rank: meRank + 1 }];
    const rise40 = phase === "over" && run ? running(run.at + ROUND * 1000, 400) : null;
    const lift = rise40 === null ? 0 : 40 * (1 - rise_in(rise40));
    const overCard =
      phase === "over" && res ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: Math.round(37 * k),
            transform: `translate(-50%, ${lift}px)`,
            width: Math.min(290, W - 16),
            boxSizing: "border-box",
            padding: narrow ? "8px 8px 10px" : "10px 10px 12px",
            background: c.card,
            borderRadius: 12,
            boxShadow: shadow,
          }}
        >
          <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 700, color: c.text, padding: "0 4px" }}>{`Still 5 min away`}</div>
          <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, padding: "0 4px", marginBottom: 4 }}>{`You bonked ${state.target} ${res.bonks}× · ${res.score} points`}</div>
          {board.map((row) => {
            const isMe = row.id === me;
            const note = state.notes[row.id];
            return (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: rowH,
                  padding: "0 6px",
                  borderRadius: 8,
                  background: isMe ? c.selected : "transparent",
                  minWidth: 0,
                }}
              >
                <Avatar user={members.find((m) => m.id === row.id) ?? row.id} size={21} />
                <span style={{ fontSize: 14, fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{nameOf(row.id)}</span>
                {row.rank === 1 ? <Trophy color={c.series2} /> : null}
                {note && !narrow ? (
                  <span style={{ fontSize: 12, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{note}</span>
                ) : null}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 14, color: c.text, fontWeight: 400 }}>{row.b}</span>
                <span style={{ fontSize: 15, width: 16, textAlign: "right", color: isMe ? c.primary : c.secondaryText }}>{row.rank}</span>
              </div>
            );
          })}
          <div style={{ marginTop: 6 }}>
            <Button kind="primary" wide disabled={waiting} onClick={() => dispatch({ t: "play" })}>
              {waiting ? "Starting" : "Play again"}
            </Button>
          </div>
        </div>
      ) : null;

    const topThree = ranked.filter(([, b]) => b > 0).slice(0, narrow ? 2 : 3);
    void pl;

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${state.joke} · ${state.tries} tries`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={canvasLabel} draw={(g, f) => drawScene(g, f, scene)} onPointer={onPointer} />
          {phase === "ready" ? readyCard : overCard}
        </div>
        <div style={{ height: 30, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap" }}>Crew best</span>
          {topThree.length ? (
            topThree.map(([id, b]) => (
              <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                <Avatar user={members.find((m) => m.id === id) ?? id} size={18} />
                <span style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{b}</span>
              </span>
            ))
          ) : (
            <span style={{ fontSize: 13, color: c.secondaryText }}>Nobody's played yet</span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {myBest !== undefined ? `your best ${myBest}` : `${played} of ${state.group} played`}
          </span>
        </div>
      </div>
    );
  },
});
