import {
  defineApp,
  Avatar,
  Button,
  Burst,
  Canvas,
  CardHeader,
  Facepile,
  haptic,
  mix,
  rng,
  running,
  seedOf,
  textWidth,
  drawPlush,
  type PlushKind,
  type PlushMood,
  fitText,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// "we're gonna eat today": a little arcade claw machine heaped with plush food, one plush per place
// the chat floated, puffed up by how many friends pushed for it. A vetoed place is glued to the floor
// with the vetoer's words on a paper tag. Anyone steers the claw and drops it; a grab can slip
// (aim and plush size decide, from the shared seed); whatever lands in the chute is where we eat.

type Kind = PlushKind;
type Params = {
  /** Card title: the chat's word for the meal ("dinner") */
  title: string;
  /** The chat's own line, lit up on the marquee: "we're gonna eat today" */
  sub: string;
  /** Dinner time on the result, or "": "7:30" */
  when: string;
  /** Everyone in on dinner, by name. */
  crew: string[];
  /** 2 to 6 places. kind: the food it is known for. voters: names who pushed for it. glued: a veto line ("anything but ramen · Will"), or "". */
  prizes: { label: string; kind: string; voters: string[]; glued: string }[];
  /** A drop that already happened: who dropped and which plush slipped (empty for none). */
  tried: { name: string; slipped: string };
};

// @params
const P: Params = {
  title: "dinner",
  sub: "we're gonna eat today",
  when: "",
  crew: ["Aditya", "Calvin", "Will"],
  prizes: [
    { label: "philly cheesesteak", kind: "sandwich", voters: ["Aditya", "Will"], glued: "" },
    { label: "royals", kind: "pizza", voters: ["Aditya"], glued: "" },
    { label: "queens", kind: "mystery", voters: ["Calvin"], glued: "" },
    { label: "ramen", kind: "ramen", voters: [], glued: "anything but ramen · Will" },
  ],
  tried: { name: "", slipped: "" },
};
// @end params

type Prize = { id: string; label: string; kind: Kind; voters: string[]; glued: string; vetoer: string };
type Drop = { x: number; from: number; target: string; ok: boolean; at: number; by: string; n: number };
type State = {
  title: string;
  sub: string;
  when: string;
  crew: string[];
  names: Record<string, string>;
  prizes: Prize[];
  clawX: number;
  drop: Drop | null;
  drops: number;
  slips: { by: string; target: string }[];
  won: string | null;
  going: string[];
  last: { label: string; by: string; n: number } | null;
};
type Action = { t: "drop"; x: number } | { t: "push"; p: string } | { t: "in" } | { t: "again" };
type Local = { x: number; at: number; down: boolean; sx: number; sy: number; s0: number; moved: boolean };

const EMOJI: Record<Kind, string> = { dumpling: "🥟", taco: "🌮", burrito: "🌯", ramen: "🍜", pizza: "🍕", burger: "🍔", sandwich: "🥪", sushi: "🍣", onigiri: "🍙", noodles: "🍜", curry: "🍛", chicken: "🍗", salad: "🥗", bagel: "🥯", icecream: "🍦", boba: "🧋", fries: "🍟", hotdog: "🌭", mystery: "🍽️" };

// Drop timeline (ms after the drop): move over, lower, grip, lift, then carry and release or slip.
const T = { move: 700, down: 1600, grip: 2000, lift: 3000, slip: 2450, carry: 3800, open: 3950, thunk: 4150, end: 4700, endMiss: 3700 };
const lockOf = (d: Drop) => (d.ok ? T.end : T.endMiss);
const TAU = Math.PI * 2;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seeded = (who: string) => who.startsWith("~");
const slotX = (n: number, i: number) => (i + 0.5) / n;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const nearestI = (s: State, x: number) => {
  let best = 0;
  for (let i = 1; i < s.prizes.length; i++) if (Math.abs(slotX(s.prizes.length, i) - x) < Math.abs(slotX(s.prizes.length, best) - x)) best = i;
  return best;
};
const nearest = (s: State, x: number) => s.prizes[nearestI(s, x)]!;
/** How likely a grab holds: bigger (more pushed) plush hold better, off-center aim slips, every slip this round warms the claw up. */
const chance = (s: State, p: Prize, x: number) => {
  if (p.glued) return 0;
  const off = Math.abs(x - slotX(s.prizes.length, s.prizes.indexOf(p))) * s.prizes.length; // 0 dead center, 0.5 between two
  const base = [0.32, 0.46, 0.6, 0.72][Math.min(3, p.voters.length)]!;
  return r3(Math.max(0.05, Math.min(0.9, base - 0.9 * Math.max(0, off - 0.12) + 0.08 * Math.min(4, s.slips.length))));
};
const nameOf = (s: State, who: string) => s.names[who] ?? (seeded(who) ? who.slice(1) : "Someone");
const firstName = (n: string) => n.split(" ")[0] ?? n;
// The fold runs without the drawing kit, so the kind is settled here (the same names as PLUSH_KINDS).
const KINDS: Kind[] = ["dumpling", "taco", "burrito", "ramen", "pizza", "burger", "sandwich", "sushi", "onigiri", "noodles", "curry", "chicken", "salad", "bagel", "icecream", "boba", "fries", "hotdog", "mystery"];
const ALIAS: Record<string, Kind> = { slice: "pizza", cup: "boba", sub: "sandwich", hoagie: "sandwich", pastry: "bagel", donut: "bagel", rice: "curry", wings: "chicken", "hot dog": "hotdog", "ice cream": "icecream", tea: "boba", pho: "noodles" };
const GUESS: [RegExp, Kind][] = [
  [/pizz|slice/, "pizza"], [/taco|taqueri/, "taco"], [/burrito/, "burrito"], [/ramen/, "ramen"], [/dumpling|dim sum|\bbao\b|gyoza|momo/, "dumpling"],
  [/burger|shack/, "burger"], [/cheesesteak|hoagie|\bsub\b|sandwich|\bdeli\b|banh mi/, "sandwich"], [/sushi|omakase|nigiri/, "sushi"], [/onigiri/, "onigiri"],
  [/\bpho\b|noodle|lo mein|pad thai|udon|\bwok\b/, "noodles"], [/curry|biryani|\bthai\b|indian|\brice\b/, "curry"], [/chicken|\bwings?\b/, "chicken"], [/salad|greens|poke/, "salad"],
  [/bagel|bakery|croissant|pastr|donut/, "bagel"], [/ice cream|gelato|froyo|creamery|scoop/, "icecream"], [/boba|bubble tea|\btea\b/, "boba"],
  [/fries|frites/, "fries"], [/hot ?dog/, "hotdog"],
];
const kindOf = (raw: unknown, label: string): Kind => {
  const k = clean(raw, 20).toLowerCase();
  if ((KINDS as string[]).includes(k)) return k as Kind;
  if (ALIAS[k]) return ALIAS[k]!;
  const l = `${label} ${k}`.toLowerCase();
  for (const [re, kind] of GUESS) if (re.test(l)) return kind;
  return "mystery";
};
/** "anything but ramen · Will" or "Will: not ramen" -> words and who said them. */
const vetoOf = (g: string) => {
  const dot = g.lastIndexOf(" · ");
  if (dot > 0) return { words: g.slice(0, dot), who: g.slice(dot + 3) };
  const colon = g.indexOf(": ");
  if (colon > 0 && colon < 16) return { words: g.slice(colon + 2), who: g.slice(0, colon) };
  return { words: g, who: "" };
};

function initState(ctx: Ctx): State {
  const names: Record<string, string> = {};
  const bind = (raw: unknown) => {
    const name = clean(raw, 28);
    if (!name) return "";
    const lo = name.toLowerCase();
    const firsts = ctx.members.filter((x) => firstName(x.name).toLowerCase() === lo);
    const m = ctx.members.find((x) => x.name.toLowerCase() === lo) ?? (firsts.length === 1 ? firsts[0] : undefined);
    const who = m ? m.id : `~${name}`;
    names[who] = m ? m.name : name;
    return who;
  };
  const crew: string[] = [];
  for (const n of (P.crew ?? []).slice(0, 12)) {
    const w = bind(n);
    if (w && !crew.includes(w)) crew.push(w);
  }
  for (const m of ctx.members) {
    if (crew.length >= 16 || crew.includes(m.id)) continue;
    names[m.id] = m.name;
    crew.push(m.id);
  }
  const prizes: Prize[] = [];
  const voted = new Set<string>();
  for (const raw of P.prizes ?? []) {
    if (prizes.length >= 6) break;
    const label = clean(raw?.label, 40);
    if (!label) continue;
    const voters: string[] = [];
    for (const v of raw.voters ?? []) {
      const w = bind(v);
      if (w && !voted.has(w)) (voted.add(w), voters.push(w));
    }
    const glued = clean(raw.glued, 48);
    const veto = vetoOf(glued);
    prizes.push({ id: `p${prizes.length}`, label, kind: kindOf(raw.kind, label), voters, glued: glued ? veto.words || glued : "", vetoer: glued ? (bind(veto.who) ? names[bind(veto.who)]! : clean(veto.who, 20)) : "" });
  }
  if (prizes.length < 2) {
    prizes.length = 0;
    prizes.push({ id: "p0", label: "Dumplings", kind: "dumpling", voters: [], glued: "", vetoer: "" }, { id: "p1", label: "Tacos", kind: "taco", voters: [], glued: "", vetoer: "" });
  }
  if (prizes.every((p) => p.glued)) prizes[0] = { ...prizes[0]!, glued: "", vetoer: "" };
  const slips: State["slips"] = [];
  const by = bind(P.tried?.name);
  const sl = prizes.find((p) => p.label.toLowerCase() === clean(P.tried?.slipped, 40).toLowerCase());
  if (by && sl) slips.push({ by, target: sl.id });
  return { title: clean(P.title, 40) || "Claw pick", sub: clean(P.sub, 60), when: clean(P.when, 10), crew, names, prizes, clawX: 0.5, drop: null, drops: slips.length, slips, won: null, going: [], last: null };
}

// ---------- Colors ----------

type Pal = Record<"ink" | "white" | "red" | "yellow" | "green" | "blue" | "orange" | "purple" | "cream" | "bread" | "crust" | "brown" | "pink" | "blush" | "rice" | "metal" | "metalDk" | "cab" | "cabDk" | "cabLt" | "navy" | "glass" | "wall" | "side" | "floor" | "paper", string>;
function palette(t: Theme): Pal {
  const c = t.color, dk = t.mode === "dark";
  const ink = dk ? c.wash : c.text, white = c.onPrimary;
  const cab = dk ? mix(c.primary, c.card, 0.42) : c.primary;
  const glass = dk ? mix(c.primary, c.card, 0.84) : mix(c.primary, white, 0.9);
  return {
    ink, white, red: c.series4, yellow: c.series2, green: c.series3, blue: c.series1, orange: c.series5, purple: c.series6,
    cream: mix(c.series2, white, 0.74), bread: mix(c.series2, c.series5, 0.42), crust: mix(mix(c.series2, c.series5, 0.6), ink, 0.12),
    brown: mix(c.series5, ink, 0.5), pink: mix(c.series4, white, 0.52), blush: mix(c.series4, white, 0.35), rice: mix(white, c.series2, 0.06),
    metal: mix(white, ink, 0.16), metalDk: mix(white, ink, 0.42), cab, cabDk: mix(cab, ink, 0.32), cabLt: mix(cab, white, 0.18), navy: mix(c.primary, ink, 0.66),
    glass, wall: mix(glass, c.primary, dk ? 0.1 : 0.07), side: mix(glass, c.primary, dk ? 0.18 : 0.13), floor: mix(glass, white, dk ? 0.04 : 0.45), paper: dk ? mix(white, c.card, 0.06) : white,
  };
}

type Mood = PlushMood;
const TAU2 = Math.PI * 2;
function pen(g: CanvasRenderingContext2D) {
  const shape = (f: string) => ((g.fillStyle = f), g.fill());
  return {
    fill: (d: string, f: string) => ((g.fillStyle = f), g.fill(new Path2D(d))),
    line(d: string, f: string, w: number) {
      g.strokeStyle = f;
      g.lineWidth = w;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.stroke(new Path2D(d));
    },
    c: (x: number, y: number, r: number, f: string) => (g.beginPath(), g.arc(x, y, r, 0, TAU2), shape(f)),
    e: (x: number, y: number, rx: number, ry: number, f: string) => (g.beginPath(), g.ellipse(x, y, rx, ry, 0, 0, TAU2), shape(f)),
    rr: (x: number, y: number, w: number, h: number, rad: number, f: string) => (g.beginPath(), g.roundRect(x, y, w, h, rad), shape(f)),
  };
}
const plush = (g: CanvasRenderingContext2D, _P: Pal, p: Prize, x: number, y: number, r: number, o: { sx?: number; sy?: number; tilt?: number; mood?: Mood } = {}) =>
  drawPlush(g, p.kind, x, y, r, { ...o, seed: p.label, mood: o.mood ?? (p.glued ? "meh" : "happy") });

// ---------- Layout ----------

type Tag = { lines: string[]; size: number; w: number; h: number; x: number; y: number };
type Item = { x: number; floor: number; r: number; tag: Tag };
type Geo = ReturnType<typeof geo>;
const MQ = 44, DECK = 52;
/** Two lines at the largest size that fits; three only as a last resort; never cut. */
function wrap(label: string, maxW: number): { lines: string[]; size: number } {
  const words = label.split(" ");
  const fit = (size: number) => {
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (!cur || textWidth(t, size, 700) * 0.9 <= maxW) cur = t;
      else (lines.push(cur), (cur = w));
    }
    lines.push(cur);
    return lines;
  };
  for (const [size, max] of [[11, 2], [10, 2], [9, 2], [9, 3], [8, 4]] as const) {
    const l = fit(size);
    if (l.length <= max && l.every((x) => textWidth(x, size, 700) * 0.9 <= maxW)) return { lines: l, size };
  }
  // A single word wider than the tag: break it by letters.
  const out: string[] = [];
  for (const w of fit(8)) {
    let cur = "";
    for (const ch of w) {
      if (cur && textWidth(cur + ch, 8, 700) * 0.9 > maxW) (out.push(cur), (cur = ""));
      cur += ch;
    }
    out.push(cur);
  }
  return { lines: out, size: 8 };
}
function geo(W: number, s: State) {
  const n = s.prizes.length;
  const gl = 8, gr = W - 8, chw = 48, chx = gr - 30;
  const ax0 = gl + 16, ax1 = chx - chw / 2 - 8;
  const slot = (ax1 - ax0) / n;
  const rows = n >= 5 ? 2 : 1;
  const lanes = rows === 2 || slot < 62 ? 2 : 1;
  const tagMax = Math.min(132, (lanes === 2 ? 2 * slot : slot) - 6);
  const tags = s.prizes.map((p) => {
    const t = wrap(p.label, tagMax - 12);
    const w = Math.min(tagMax, Math.max(...t.lines.map((l) => textWidth(l, t.size, 700) * 0.9)) + 16);
    return { ...t, w, h: t.lines.length * (t.size + 2) + 8 };
  });
  const laneH = [0, 1].map((k) => Math.max(0, ...tags.filter((_, i) => (lanes === 2 ? i % 2 : 0) === k).map((t) => t.h)));
  const lip = lanes === 2 ? laneH[0]! + laneH[1]! + 14 : laneH[0]! + 12;
  const GH = rows === 2 ? 148 : lanes === 2 ? 148 : 164;
  const gt = MQ, gb = gt + GH;
  const base = rows === 2 ? Math.min(20, slot * 0.6) : Math.min(23, slot * 0.36);
  const items: Item[] = s.prizes.map((p, i) => {
    const x = ax0 + slot * (i + 0.5);
    const back = rows === 2 && i % 2 === 1;
    const t = tags[i]!;
    const lane = lanes === 2 ? i % 2 : 0;
    const tx = Math.max(gl + t.w / 2, Math.min(gr - t.w / 2, x));
    return { x, floor: back ? gb - 46 : gb - 9, r: base * [1, 1.16, 1.32, 1.46][Math.min(3, p.voters.length)]!, tag: { ...t, x: tx, y: gb + 6 + (lane ? laneH[0]! + 4 : 0) } };
  });
  const deckY = gb + lip;
  return { W, H: deckY + DECK, gl, gr, gt, gb, chx, chw, ax0, ax1, slot, items, deckY, railY: gt + 13, rx: (f: number) => ax0 + f * (ax1 - ax0), fx: (px: number) => Math.max(0, Math.min(1, (px - ax0) / (ax1 - ax0))), btnX: chx - chw / 2 - 42, chuteTop: gb - 58 };
}

// ---------- The machine ----------

/** Per-viewer motion that is not shared: the trolley's lag and the claw's swing. */
const SIM = { x: -1, v: 0, ang: 0, av: 0, t: 0, joy: 0, r: {} as Record<string, number> };

type View = { s: State; aim: number; waiting: boolean; steering: boolean; P: Pal };
function drawMachine(g: CanvasRenderingContext2D, f: DrawFrame, v: View): boolean {
  const { s, P } = v;
  const t = f.theme, c = t.color;
  const G = geo(f.width, s);
  const { W, gl, gr, gt, gb, chx, chw } = G;
  const d = s.drop;
  const e = d ? f.now - d.at : 1e9;
  const live = !!d && e < lockOf(d) + 200;
  const dt = SIM.t ? Math.max(0, Math.min(0.05, (f.now - SIM.t) / 1000)) : 0;
  SIM.t = f.now;
  let moving = false;

  // Cabinet, marquee.
  const shake = d && d.ok && e > T.thunk && e < T.thunk + 220 ? Math.sin((e - T.thunk) / 18) * 1.6 * (1 - (e - T.thunk) / 220) : 0;
  g.clearRect(0, 0, W, G.H);
  const D = pen(g);
  D.rr(0, 0, W, G.H, 18, P.cab);
  D.rr(6, 5, W - 12, MQ - 8, 11, P.navy);
  const won = s.prizes.find((p) => p.id === s.won);
  const settled = won && (!d || e >= T.end);
  const chase = live || (won && d && e < T.end + 2400);
  const nb = Math.floor((W - 36) / 13);
  for (let i = 0; i <= nb; i++) {
    const on = chase ? (i + Math.floor(f.now / 110)) % 3 === 0 : i % 2 === 0;
    for (const by of [11, MQ - 9]) D.c(18 + i * 13, by, 2.1, on ? P.yellow : mix(P.yellow, P.navy, 0.62));
  }
  const mq = settled ? `${won!.label} it is.` : s.sub || s.title;
  const ft = fitText(mq, W - 44, { g, size: 14, min: 10, weight: 800 });
  g.font = ft.font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = settled ? P.yellow : mix(P.yellow, P.white, 0.72);
  g.fillText(ft.text, W / 2, MQ / 2 + 0.5);

  // Glass box: back wall, sides, floor.
  g.save();
  g.beginPath();
  g.roundRect(gl, gt, gr - gl, gb - gt, 8);
  g.clip();
  D.rr(gl, gt, gr - gl, gb - gt, 0, P.wall);
  const inset = 14;
  D.fill(`M${gl} ${gt}L${gl + inset} ${gt + 8}V${gb - 58}L${gl} ${gb}Z`, P.side);
  D.fill(`M${gr} ${gt}L${gr - inset} ${gt + 8}V${gb - 58}L${gr} ${gb}Z`, P.side);
  D.fill(`M${gl + inset} ${gb - 58}H${gr - inset}L${gr} ${gb}H${gl}Z`, P.floor);
  // A heap of little generic plush, so the box feels full; the back row sits on its ridge.
  const hues = [P.red, P.yellow, P.green, P.blue, P.orange, P.purple];
  const rr = rng(seedOf(s.title + s.prizes.length));
  const ridge = s.prizes.length >= 5 ? gb - 50 : gb - 30;
  const heapR = chx - chw / 2 - 4;
  const fade = t.mode === "dark" ? 0.6 : 0.58;
  D.fill(`M${gl} ${gb}V${ridge + 6}Q${(gl + heapR) / 2} ${ridge - 8} ${heapR} ${ridge + 4}V${gb}Z`, mix(P.side, P.ink, 0.04));
  for (let row = 0; row < 3; row++)
    for (let x = gl + 2 + row * 7; x < heapR - 4; x += 15 + rr.int(6)) {
      const arc = 1 - ((x - (gl + heapR) / 2) / ((heapR - gl) / 2)) ** 2;
      const y = ridge + 2 - arc * 8 + row * 13 + rr.int(5);
      const col = mix(hues[rr.int(6)]!, P.glass, fade + row * 0.04);
      D.c(x, y, 8 + rr.int(3), col);
      if (row === 0 && rr.next() < 0.5) (D.c(x - 2.4, y - 1, 1, mix(P.ink, col, 0.55)), D.c(x + 2.4, y - 1, 1, mix(P.ink, col, 0.55)));
    }
  // Rail.
  D.rr(gl + 6, G.railY - 3, gr - gl - 12, 6, 3, P.metalDk);
  D.rr(gl + 6, G.railY - 3, gr - gl - 12, 2, 1, P.metal);

  // Where the claw goes.
  const ti = d ? s.prizes.findIndex((p) => p.id === d.target) : -1;
  const tp = ti >= 0 ? s.prizes[ti] : undefined;
  const it = ti >= 0 ? G.items[ti] : undefined;
  const REST = 30, PRONG = 32, HOLD = 13;
  const grabL = it ? it.floor - it.r * 1.95 - HOLD - G.railY - 8 : 60;
  const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  let cx: number, L = REST, open = 0, held = false, grip = 0, extraAng = 0;
  let mood: Mood = "happy";
  let free: { x: number; y: number; sx: number; sy: number; tilt: number; mood: Mood } | null = null;
  const home = it ? { x: it.x, y: it.floor } : { x: 0, y: 0 };
  if (d && it && tp && live) {
    const tx = G.rx(d.x), from = G.rx(d.from);
    cx = tx;
    if (e < T.move) cx = from + (tx - from) * ease(e / T.move);
    else if (e < T.down) ((L = REST + (grabL - REST) * ease((e - T.move) / (T.down - T.move)) ** 1.4), (open = Math.min(1, (e - T.move) / 200)));
    else if (e < T.grip) {
      const u = (e - T.down) / (T.grip - T.down);
      L = grabL;
      open = 1 - ease(u * 1.6);
      grip = u;
      free = { x: home.x + (tx - home.x) * 0.7 * ease(u), y: home.y, sx: 1 - 0.14 * Math.sin(u * Math.PI * 0.5), sy: 1 + 0.1 * Math.sin(u * Math.PI * 0.5), tilt: 0, mood: "squeeze" };
    } else if (tp.glued) {
      const k = e - T.grip;
      if (k < 600) {
        const u = k / 600;
        L = grabL - 26 * ease(u);
        free = { x: home.x + (tx - home.x) * 0.7, y: home.y, sx: 1 - 0.18 * u, sy: 1 + (26 / (it.r * 2)) * ease(u) * 1.1, tilt: Math.sin(k / 40) * 0.03, mood: "squeeze" };
      } else {
        const u = (k - 600) / 1100;
        const sp = Math.exp(-u * 5) * Math.cos(u * 22);
        L = REST + (grabL - 26 - REST) * Math.max(0, Math.exp(-u * 8) * Math.cos(u * 9));
        open = Math.min(1, (k - 600) / 120);
        free = { x: home.x + (tx - home.x) * 0.7 * Math.max(0, 1 - u * 3), y: home.y, sx: 1 + 0.12 * sp, sy: 1 - 0.2 * sp, tilt: 0, mood: u < 0.6 ? "dizzy" : "meh" };
        if (k < 700) extraAng = Math.sin(k / 15) * 0.1;
      }
    } else if (!d.ok && e >= T.slip) {
      const k = e - T.slip;
      L = Math.max(REST, grabL - (grabL - REST) * ease((e - T.grip) / (T.lift - T.grip)));
      open = Math.min(0.55, k / 160);
      // Where it let go, then a fall, a squash and two hops home.
      const L0 = grabL - (grabL - REST) * ease((T.slip - T.grip) / (T.lift - T.grip));
      const y0 = G.railY + 8 + L0 + HOLD + it.r * 1.95;
      const x0 = tx;
      const fall = 330;
      if (k < fall) {
        const u = k / fall;
        free = { x: x0 + (home.x - x0) * u * 0.6, y: y0 + (home.y - y0) * u * u, sx: 0.92, sy: 1.1, tilt: u * 0.5 * Math.sign(home.x - x0 || 1), mood: "oops" };
      } else {
        const k2 = k - fall;
        const hops = [[0, 140, 0], [140, 420, 16], [420, 640, 6]] as const;
        let y = home.y, sx = 1, sy = 1;
        for (const [a, b, h] of hops)
          if (k2 >= a && k2 < b) {
            const u = (k2 - a) / (b - a);
            if (!h) ((sx = 1 + 0.28 * Math.sin(u * Math.PI)), (sy = 1 - 0.25 * Math.sin(u * Math.PI)));
            else y = home.y - h * Math.sin(u * Math.PI);
          }
        const u = Math.min(1, k2 / 640);
        free = { x: x0 + (home.x - x0) * (0.6 + 0.4 * u), y, sx, sy, tilt: 0.5 * (1 - u) * Math.cos(k2 / 60) * Math.sign(home.x - x0 || 1), mood: k2 < 900 ? "dizzy" : "happy" };
      }
      if (k < 140) extraAng = Math.sin(k / 20) * 0.12;
    } else if (e < T.lift) {
      const u = (e - T.grip) / (T.lift - T.grip);
      L = grabL - (grabL - REST) * ease(u);
      held = true;
      mood = "squeeze";
      extraAng = Math.sin((e - T.grip) / 70) * 0.09 * (1 - u);
    } else if (d.ok && e < T.carry) {
      cx = tx + (chx - tx) * ease((e - T.lift) / (T.carry - T.lift));
      held = true;
      mood = "happy";
    } else if (d.ok) {
      cx = chx;
      open = Math.min(1, (e - T.carry) / 150);
      held = e < T.carry + 60;
    } else cx = tx;
  } else if (won && d) cx = chx;
  else {
    const target = G.rx(v.aim);
    if (SIM.x < 0) SIM.x = target;
    const a = 140 * (target - SIM.x) - 22 * SIM.v;
    SIM.v += a * dt;
    SIM.x += SIM.v * dt;
    if (Math.abs(target - SIM.x) < 0.2 && Math.abs(SIM.v) < 2) ((SIM.x = target), (SIM.v = 0));
    else moving = true;
    cx = SIM.x;
    if (v.waiting) L = REST + 3 * Math.sin(f.now / 60);
  }
  // Swing: the claw lags behind the trolley's acceleration.
  if (live || moving) {
    const prevX = SIM.x;
    if (live) SIM.x = cx;
    const vel = dt ? (SIM.x - prevX) / dt : 0;
    const acc = dt ? (vel - SIM.v) / dt : 0;
    if (live) SIM.v = vel;
    SIM.av += (-55 * SIM.ang - 4.5 * SIM.av - Math.max(-4000, Math.min(4000, acc)) * 0.004) * dt;
    SIM.ang = Math.max(-0.4, Math.min(0.4, SIM.ang + SIM.av * dt));
    SIM.joy += ((v.steering ? Math.max(-1, Math.min(1, vel / 250)) : 0) - SIM.joy) * Math.min(1, dt * 12);
  } else {
    SIM.av += (-55 * SIM.ang - 4.5 * SIM.av) * dt;
    SIM.ang += SIM.av * dt;
    SIM.joy *= 1 - Math.min(1, dt * 10);
  }
  const swinging = Math.abs(SIM.ang) > 0.002 || Math.abs(SIM.av) > 0.01 || Math.abs(SIM.joy) > 0.01;
  const ang = SIM.ang + extraAng;

  // Shadow on the floor under the claw: where it will land.
  const shadowY = it && d && live ? it.floor : G.items.reduce((m, q) => Math.max(m, q.floor), 0);
  const near = Math.min(1, L / Math.max(40, grabL));
  g.globalAlpha = 0.12 + 0.16 * near;
  D.e(cx + Math.sin(ang) * L, shadowY + 2, 15 + 6 * near, 4, P.ink);
  g.globalAlpha = 1;

  // Plush on the floor: back row first, puffing to their size.
  const order = G.items.map((_, i) => i).sort((a, b) => G.items[a]!.floor - G.items[b]!.floor);
  for (const i of order) {
    const p = s.prizes[i]!, q = G.items[i]!;
    const cur = SIM.r[p.id] ?? q.r;
    const nr = cur + (q.r - cur) * Math.min(1, dt * 10);
    SIM.r[p.id] = Math.abs(nr - q.r) < 0.05 ? q.r : nr;
    if (SIM.r[p.id] !== q.r) moving = true;
    const r = SIM.r[p.id]!;
    const pop = q.r > r ? 1 + (q.r - r) / q.r : 1;
    if (p.id === s.won && (!d || e >= T.carry + 60 || !live)) continue;
    if (d && live && p.id === d.target && (held || (e >= T.lift && d.ok))) continue;
    const at = d && live && p.id === d.target && free ? free : null;
    if (p.glued) {
      g.globalAlpha = 0.55;
      D.e(q.x, q.floor + 1, r * 1.45, 5, mix(P.yellow, P.white, 0.4));
      D.c(q.x - r * 1.2, q.floor + 4, 3, mix(P.yellow, P.white, 0.4));
      g.globalAlpha = 1;
    }
    g.globalAlpha = 0.16;
    D.e(at ? at.x : q.x, q.floor + 1, r * 1.05 * (at ? at.sx : 1), 3.5, P.ink);
    g.globalAlpha = 1;
    plush(g, P, p, at ? at.x : q.x, at ? at.y : q.floor, r, at ? { sx: at.sx, sy: at.sy, tilt: at.tilt, mood: at.mood } : { sx: 1 / pop, sy: pop });
    if (p.glued) {
      // Two strips of tape over its feet.
      for (const k of [-1, 1]) {
        g.save();
        g.translate(q.x + k * r * 0.55, q.floor - 3);
        g.rotate(k * 0.55);
        g.globalAlpha = 0.85;
        D.rr(-r * 0.55, -3.5, r * 1.1, 7, 1.5, mix(P.paper, P.yellow, 0.18));
        g.restore();
      }
      g.globalAlpha = 1;
    }
  }

  // The veto tag, tied to the glued plush.
  s.prizes.forEach((p, i) => {
    if (!p.glued) return;
    const q = G.items[i]!;
    const words = p.glued;
    const hand = `"Bradley Hand", "Noteworthy", "Chalkboard SE", "Segoe Print", "Comic Sans MS", cursive`;
    const tw = Math.min(96, Math.max(60, G.slot * 1.3));
    const lines = wrapHand(words, tw - 12, g, hand);
    const th = lines.length * 12 + (p.vetoer ? 13 : 0) + 8;
    const x = Math.max(gl + tw / 2 + 4, Math.min(chx - chw / 2 - tw / 2 - 2, q.x - 6));
    const y = Math.max(gt + 22, q.floor - q.r * 2.05 - th - 10);
    D.line(`M${q.x + q.r * 0.2} ${q.floor - q.r * 1.6}Q${(x + q.x) / 2} ${y + th + 8} ${x + 4} ${y + th - 4}`, P.metalDk, 1);
    g.save();
    g.translate(x, y + th / 2);
    g.rotate(-0.06);
    D.rr(-tw / 2, -th / 2, tw, th, 3, mix(P.paper, P.yellow, 0.22));
    D.c(-tw / 2 + 5, -th / 2 + 5, 1.6, P.metalDk);
    g.font = `600 11px ${hand}`;
    g.fillStyle = P.navy;
    g.textAlign = "center";
    g.textBaseline = "middle";
    lines.forEach((l, k) => g.fillText(l, 0, -th / 2 + 10 + k * 12));
    if (p.vetoer) {
      g.font = `600 10px ${hand}`;
      g.fillStyle = mix(P.navy, P.paper, 0.3);
      g.fillText(`· ${firstName(p.vetoer)}`, 0, -th / 2 + 10 + lines.length * 12 + 1);
    }
    g.restore();
  });

  // The chute: a clear box with a yellow rim, a dark mouth and an arrow.
  const cl = chx - chw / 2, ct = G.chuteTop;
  D.rr(cl, ct, chw, gb - ct + 2, 3, mix(P.wall, P.ink, 0.08));
  D.e(chx, ct + 3, chw / 2 - 3, 6, P.navy);
  g.globalAlpha = t.mode === "dark" ? 0.18 : 0.42;
  D.rr(cl, ct + 6, chw, gb - ct - 4, 3, P.white);
  g.globalAlpha = 1;
  D.line(`M${cl + 1} ${ct + 2}V${gb}M${cl + chw - 1} ${ct + 2}V${gb}`, mix(P.white, P.wall, 0.2), 1.5);
  D.rr(cl - 1, ct - 2, chw + 2, 5, 2.5, P.yellow);
  D.line(`M${chx - 6} ${(ct + gb) / 2 - 2}l6 6 6-6`, P.yellow, 3);

  // The claw: trolley, cable, hub, three chunky prongs, and whatever it holds.
  D.rr(cx - 21, G.railY - 8, 42, 16, 6, P.navy);
  D.c(cx - 12, G.railY, 2.4, live ? P.yellow : mix(P.yellow, P.navy, 0.5));
  D.c(cx + 12, G.railY, 2.4, mix(P.white, P.navy, 0.6));
  g.save();
  g.translate(cx, G.railY + 8);
  g.rotate(ang);
  D.line(`M0 0V${L}`, P.metalDk, 2.5);
  g.translate(0, L);
  const k = Math.max(0, Math.min(1, held ? 0.12 : open));
  const prong = (side: number, back: boolean) => {
    const len = back ? 22 : PRONG;
    const a1 = side * (0.22 + 0.7 * k);
    const x0 = side * (back ? 3 : 9), y0 = 12;
    const x1 = x0 + Math.sin(a1) * len * 0.5, y1 = y0 + Math.cos(a1) * len * 0.5;
    const a2 = a1 - side * (0.75 + 0.35 * (1 - k));
    const x2 = x1 + Math.sin(a2) * len * 0.5, y2 = y1 + Math.cos(a2) * len * 0.5;
    const col = back ? P.metalDk : P.metal;
    D.line(`M${x0} ${y0}L${x1} ${y1}L${x2} ${y2}`, mix(col, P.ink, 0.25), back ? 7 : 8);
    D.line(`M${x0} ${y0}L${x1} ${y1}L${x2} ${y2}`, col, back ? 4.5 : 5.5);
    D.c(x1, y1, 3.6, P.metalDk);
    D.c(x1, y1, 1.6, P.metal);
  };
  prong(0.3, true);
  if (held && tp && it) {
    const sq = d && e < T.grip + 320 ? 1 + 0.1 * Math.sin(((e - T.grip) / 320) * Math.PI) : 1;
    plush(g, P, tp, 0, HOLD + it.r * 1.95, it.r, { sx: 1 / sq, sy: sq, mood });
  }
  prong(-1, false);
  prong(1, false);
  D.fill("M-15 14V4Q-15-6 0-6T15 4V14Z", P.metal);
  D.rr(-15, 8, 30, 4, 2, P.yellow);
  D.rr(-15, 12, 30, 3, 1.5, P.metalDk);
  g.globalAlpha = 0.5;
  D.e(-6, -1, 4, 2, P.white);
  g.globalAlpha = 1;
  g.restore();

  // A dropped plush falling into the chute.
  if (d && d.ok && tp && it && live && e >= T.carry + 60 && e < T.thunk) {
    const u = (e - T.carry - 60) / (T.thunk - T.carry - 60);
    const y0 = G.railY + 8 + REST + HOLD + it.r * 1.95;
    g.save();
    g.beginPath();
    g.rect(gl, gt, gr - gl, G.chuteTop + 2 - gt);
    g.clip();
    plush(g, P, tp, chx, y0 + (G.chuteTop + it.r * 2.4 - y0) * u * u, Math.min(it.r, chw * 0.42), { sx: 0.9, sy: 1.12, mood: "oops" });
    g.restore();
  }

  // Glass reflection: soft bands across the upper glass only.
  const gw = gr - gl;
  g.globalAlpha = t.mode === "dark" ? 0.07 : 0.32;
  D.fill(`M${gl + gw * 0.58} ${gt}h${gw * 0.12}L${gl + gw * 0.5} ${gt + (gb - gt) * 0.5}h${-gw * 0.06}Z`, P.white);
  D.fill(`M${gl + gw * 0.74} ${gt}h${gw * 0.035}L${gl + gw * 0.64} ${gt + (gb - gt) * 0.42}h${-gw * 0.02}Z`, P.white);
  g.globalAlpha = 1;
  g.restore();

  // Price tags along the lip: a pointed paper tag with a punched hole.
  s.prizes.forEach((p, i) => {
    const tg = G.items[i]!.tag;
    const x0 = tg.x - tg.w / 2, x1 = tg.x + tg.w / 2, y0 = tg.y, y1 = tg.y + tg.h, ym = (y0 + y1) / 2;
    D.fill(`M${x0 + 8} ${y0}H${x1 - 4}Q${x1} ${y0} ${x1} ${y0 + 4}V${y1 - 4}Q${x1} ${y1} ${x1 - 4} ${y1}H${x0 + 8}L${x0} ${ym}Z`, P.paper);
    D.c(x0 + 7, ym, 1.6, mix(P.paper, P.ink, 0.35));
    g.font = `700 ${tg.size}px ${t.type.family}`;
    g.fillStyle = P.ink;
    g.textAlign = "center";
    g.textBaseline = "middle";
    tg.lines.forEach((l, k) => g.fillText(l, tg.x + 4, tg.y + 4 + (tg.size + 2) * (k + 0.5)));
  });

  // Control deck: bevel, joystick, coin slot, prize door.
  const dy = G.deckY + shake;
  D.rr(4, dy, W - 8, 4, 2, P.cabLt);
  D.rr(4, dy + 4, W - 8, DECK - 10, 10, P.cabDk);
  const jx = 34, jy = dy + DECK / 2;
  D.e(jx, jy + 9, 15, 5.5, P.navy);
  const ja = SIM.joy * 0.5;
  D.line(`M${jx} ${jy + 8}L${jx + Math.sin(ja) * 18} ${jy + 8 - Math.cos(ja) * 18}`, P.metalDk, 4);
  D.c(jx + Math.sin(ja) * 18, jy + 8 - Math.cos(ja) * 18, 8, P.red);
  D.c(jx + Math.sin(ja) * 18 - 2.5, jy + 5 - Math.cos(ja) * 18, 2.5, mix(P.red, P.white, 0.5));
  D.rr(64, dy + 14, 18, 26, 4, P.navy);
  D.rr(71.5, dy + 19, 3, 16, 1.5, P.ink);
  D.c(91, dy + 27, 4, P.yellow);
  const door = { x: chx - chw / 2, y: dy + 9, w: chw, h: DECK - 20 };
  D.rr(door.x, door.y, door.w, door.h, 6, P.ink);
  const flap = d && d.ok && live ? Math.max(0, Math.min(1, (e - T.thunk + 60) / 140)) : won ? 1 : 0;
  if (won && tp && it && (!live || e >= T.thunk - 60)) {
    const pu = live ? Math.min(1, (e - T.thunk + 60) / 260) : 1;
    const sq = 1 + 0.25 * Math.sin(pu * Math.PI) * (live ? 1 : 0);
    g.save();
    g.beginPath();
    g.roundRect(door.x, door.y, door.w, door.h, 6);
    g.clip();
    plush(g, P, tp, chx, door.y + door.h + 2, Math.min(15, door.h * 0.48), { sx: sq, sy: 1 / sq, mood: "happy" });
    g.restore();
  }
  D.rr(door.x, door.y, door.w, door.h * (1 - flap * 0.82), 6, mix(P.cabDk, P.white, 0.12));
  if (flap < 1) D.rr(chx - 8, door.y + door.h * (1 - flap * 0.82) - 8, 16, 3, 1.5, P.cab);

  return live || moving || swinging || v.waiting;
}

function wrapHand(text: string, maxW: number, g: CanvasRenderingContext2D, family: string): string[] {
  g.font = `600 11px ${family}`;
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const t = cur ? `${cur} ${w}` : w;
    if (!cur || g.measureText(t).width <= maxW) cur = t;
    else (out.push(cur), (cur = w));
  }
  out.push(cur);
  return out.slice(0, 3);
}

// ---------- App ----------

export default defineApp<State, Action, Local>({
  name: "Claw pick",
  summary: (s) => {
    const won = s.prizes.find((p) => p.id === s.won);
    if (won && s.drop) return `${won.label} it is${s.when ? ` · ${s.when}` : ""} · ${firstName(nameOf(s, s.drop.by))} grabbed it on drop ${s.drop.n}`;
    if (s.drops) return `${s.title}: ${s.drops} ${s.drops === 1 ? "drop" : "drops"}, nothing grabbed yet`;
    return `${s.title}: ${s.prizes.length} places in the claw machine`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "drop") {
      if (s.won || typeof a.x !== "number" || !Number.isFinite(a.x) || a.x < 0 || a.x > 1) return s;
      if (s.drop && m.time >= s.drop.at && m.time - s.drop.at < lockOf(s.drop)) return s;
      const p = nearest(s, a.x);
      const ok = rng(m.seed).next() < chance(s, p, a.x);
      const drop: Drop = { x: a.x, from: s.clawX, target: p.id, ok, at: m.time, by: m.user, n: s.drops + 1 };
      return { ...s, clawX: a.x, drop, drops: s.drops + 1, slips: ok ? s.slips : [...s.slips.slice(-5), { by: m.user, target: p.id }], won: ok ? p.id : null, going: ok ? [m.user] : [] };
    }
    if (a.t === "push") {
      if (s.won || typeof a.p !== "string" || !s.prizes.some((p) => p.id === a.p)) return s;
      const had = s.prizes.some((p) => p.id === a.p && p.voters.includes(m.user));
      return { ...s, prizes: s.prizes.map((p) => ({ ...p, voters: p.voters.filter((v) => v !== m.user).concat(p.id === a.p && !had ? [m.user] : []) })) };
    }
    if (a.t === "in") {
      if (!s.won) return s;
      return { ...s, going: s.going.includes(m.user) ? s.going.filter((u) => u !== m.user) : [...s.going, m.user] };
    }
    if (a.t === "again") {
      const won = s.prizes.find((p) => p.id === s.won);
      if (!won || !s.drop || (m.time >= s.drop.at && m.time - s.drop.at < lockOf(s.drop))) return s;
      return { ...s, clawX: 0.5, drop: null, drops: 0, slips: [], won: null, going: [], last: { label: won.label, by: s.drop.by, n: s.drop.n } };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const keep = (u: string) => seeded(u) || inChat(ctx, u);
    const names = { ...s.names };
    const crew = s.crew.filter(keep);
    for (const m of ctx.members) {
      if (crew.length >= 16 || crew.includes(m.id)) continue;
      names[m.id] = m.name;
      crew.push(m.id);
    }
    return { ...s, names, crew, prizes: s.prizes.map((p) => ({ ...p, voters: p.voters.filter(keep) })), going: s.going.filter((u) => inChat(ctx, u)) };
  },

  invariants: {
    "everyone in the chat is in the crew": (s, ctx) => s.crew.length >= 16 || ctx.members.every((m) => s.crew.includes(m.id)),
    "the claw stays inside the machine": (s) => typeof s.clawX === "number" && s.clawX >= 0 && s.clawX <= 1,
    "everyone pushes for one plush at most": (s) => {
      const all = s.prizes.flatMap((p) => p.voters);
      return new Set(all).size === all.length;
    },
    "voters are seeded friends or in the chat": (s, ctx) => s.prizes.every((p) => p.voters.every((v) => seeded(v) || inChat(ctx, v))),
    "a glued plush is never won": (s) => s.won === null || s.prizes.some((p) => p.id === s.won && !p.glued),
    "the last drop decides the win": (s) => (s.won === null ? s.drop === null || !s.drop.ok : s.drop !== null && s.drop.ok && s.drop.target === s.won),
    "going only after a win, once each": (s, ctx) => (s.won !== null || s.going.length === 0) && new Set(s.going).size === s.going.length && s.going.every((u) => inChat(ctx, u)),
    "drops count up and the last one is numbered": (s) => Number.isInteger(s.drops) && s.drops >= 0 && s.slips.length <= Math.max(1, s.drops) && s.slips.length <= 6 && (s.drop === null || s.drop.n === s.drops),
    "every slip and drop names a plush": (s) => s.slips.every((x) => s.prizes.some((p) => p.id === x.target)) && (s.drop === null || s.prizes.some((p) => p.id === s.drop!.target)),
    "there are 2 to 6 plush": (s) => s.prizes.length >= 2 && s.prizes.length <= 6 && s.prizes.every((p) => KINDS.includes(p.kind)),
  },

  transitions: {
    "a slip is logged, a grab is not": (p, n, a, m) =>
      a.t !== "drop" || p === n || !n.drop || (n.drop.ok ? JSON.stringify(n.slips) === JSON.stringify(p.slips) : n.slips.length === Math.min(6, p.slips.length + 1) && n.slips[n.slips.length - 1]!.by === m.user && n.slips[n.slips.length - 1]!.target === n.drop.target),
    "the claw ends where it was aimed": (p, n, a) => a.t !== "drop" || p === n || n.clawX === a.x,
    "a grab puts the dropper in": (p, n, a, m) => a.t !== "drop" || p === n || !n.drop || (n.drop.ok ? n.going.join() === m.user : n.going.length === 0),
    "no pushes after a win": (p, n) => p.won === null || JSON.stringify(p.prizes) === JSON.stringify(n.prizes),
    "a push toggles the sender on that plush": (p, n, a, m) => {
      if (a.t !== "push" || p === n) return true;
      const on = (s: State) => s.prizes.some((x) => x.id === a.p && x.voters.includes(m.user));
      return on(n) !== on(p);
    },
    "unknown actions change nothing": (p, n, a) => a.t === "drop" || a.t === "push" || a.t === "in" || a.t === "again" || JSON.stringify(p) === JSON.stringify(n),
    "a drop takes the plush under the claw and the seed decides": (p, n, a, m) => {
      if (a.t !== "drop" || p === n) return true;
      const t = nearest(p, a.x);
      return !!n.drop && n.drop.target === t.id && n.drop.ok === rng(m.seed).next() < chance(p, t, a.x) && n.drop.at === m.time && n.drop.by === m.user && n.drop.from === p.clawX && n.drops === p.drops + 1 && n.drop.n === n.drops;
    },
    "one drop at a time": (p, n, a, m) => a.t !== "drop" || p === n || !p.drop || m.time < p.drop.at || m.time - p.drop.at >= lockOf(p.drop),
    "nothing drops after a win": (p, n, a) => p.won === null || a.t === "again" || (n.won === p.won && n.drops === p.drops),
    "go again only after a win, and it keeps the last result": (p, n, a) =>
      a.t !== "again" || p === n || (p.won !== null && n.won === null && n.drop === null && n.drops === 0 && n.going.length === 0 && n.last !== null && n.last.label === p.prizes.find((x) => x.id === p.won)!.label),
    "a push moves only the sender's vote": (p, n, a, m) => {
      if (a.t !== "push" || p === n) return true;
      const before = p.prizes.map((x) => x.voters.filter((v) => v !== m.user).join());
      const after = n.prizes.map((x) => x.voters.filter((v) => v !== m.user).join());
      return before.join("|") === after.join("|") && n.prizes.filter((x) => x.voters.includes(m.user)).length <= 1;
    },
    "only a push changes votes": (p, n, a) => a.t === "push" || JSON.stringify(p.prizes) === JSON.stringify(n.prizes),
    "going toggles only the sender": (p, n, a, m) => {
      if (a.t !== "in" || p === n) return true;
      const diff = [...p.going.filter((u) => !n.going.includes(u)), ...n.going.filter((u) => !p.going.includes(u))];
      return diff.length === 1 && diff[0] === m.user;
    },
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => {
    if (s.won) return r.next() < 0.6 ? { t: "in" } : { t: "again" };
    if (r.next() < 0.35) return { t: "push", p: r.pick(s.prizes).id };
    return { t: "drop", x: Math.round(r.next() * 100) / 100 };
  },

  local: { x: -1, at: -1, down: false, sx: 0, sy: 0, s0: 0, moved: false },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = confirmed;
    const P = palette(theme);
    const waiting = pending && state.drops !== confirmed.drops;
    const d = s.drop;
    const e = d ? running(d.at, lockOf(d)) : null;
    const busy = waiting || e !== null;
    const won = s.prizes.find((p) => p.id === s.won);
    const W = theme.width - 2 * theme.space.card;
    const G = geo(W, s);
    const aim = local.x >= 0 && local.at === s.drops ? local.x : s.clawX;
    const under = nearest(s, aim);
    const mem = (who: string): Member => members.find((m) => m.id === who) ?? { id: who, name: nameOf(s, who) };
    const label = `Claw machine: ${s.prizes.map((p) => `${p.label} ${p.voters.length} ${p.voters.length === 1 ? "push" : "pushes"}${p.glued ? ", glued down" : ""}`).join(", ")}`;
    const tp = d ? s.prizes.find((p) => p.id === d.target) : undefined;

    const hit = (x: number, y: number) =>
      s.prizes.findIndex((_, i) => {
        const q = G.items[i]!;
        const inPlush = Math.abs(x - q.x) < q.r * 1.25 && y > q.floor - q.r * 2.2 && y < q.floor + 4;
        const inTag = Math.abs(x - q.tag.x) < q.tag.w / 2 && y > q.tag.y && y < q.tag.y + q.tag.h;
        return inPlush || inTag;
      });
    const onPointer = (ev: { type: string; x: number; y: number }) => {
      if (busy || won) return;
      const inDeck = ev.y > G.deckY;
      if (ev.type === "down") return setLocal({ down: true, sx: ev.x, sy: ev.y, s0: aim, moved: false });
      if (!local.down) return;
      const dx = ev.x - local.sx;
      const moved = local.moved || Math.abs(dx) > 6 || Math.abs(ev.y - local.sy) > 6;
      const joy = local.sy > G.deckY && local.sx < 110;
      const x = joy ? Math.max(0, Math.min(1, local.s0 + dx / (G.ax1 - G.ax0))) : G.fx(ev.x);
      if (ev.type === "move") return moved ? setLocal({ x, at: s.drops, moved: true }) : undefined;
      if (ev.type === "up") {
        if (!moved) {
          const i = hit(ev.x, ev.y);
          if (i >= 0) {
            haptic("light");
            dispatch({ t: "push", p: s.prizes[i]!.id });
            return setLocal({ down: false, x: slotX(s.prizes.length, i), at: s.drops });
          }
          if (!inDeck && ev.y > G.gt) return setLocal({ down: false, x: G.fx(ev.x), at: s.drops });
        }
        setLocal({ down: false, ...(moved ? { x, at: s.drops } : {}) });
      }
    };
    const drop = () => {
      if (busy || won) return;
      haptic("medium");
      setLocal({ x: -1, at: -1, down: false });
      dispatch({ t: "drop", x: Math.round(aim * 1000) / 1000 });
    };

    const who = (u: string) => (u === me ? "Your" : `${firstName(nameOf(s, u))}'s`);
    let line: string;
    let strong = false;
    if (waiting) line = `Your drop · ${s.drops + 1}`;
    else if (e !== null && d && tp) {
      line = `${who(d.by)} drop · ${d.n}`;
      if (e >= T.grip && tp.glued) line = `It's glued. ${tp.vetoer ? `${firstName(tp.vetoer)} said no.` : "Somebody said no."}`;
      else if (e >= T.slip && !d.ok) line = `Slipped. ${tp.label} wiggled free`;
      else if (e >= T.lift && d.ok) line = `${who(d.by)} drop · ${d.n} · holding…`;
    } else if (won && d) {
      line = `${won.label} it is${s.when ? ` · ${s.when}` : ""} · ${d.by === me ? "you" : firstName(nameOf(s, d.by))} grabbed it on drop ${d.n}`;
      strong = true;
    } else if (d && tp && !d.ok) line = tp.glued ? `It's glued. ${tp.vetoer ? `${firstName(tp.vetoer)} said no.` : "Somebody said no."} · ${s.drops} ${s.drops === 1 ? "drop" : "drops"}` : `Slipped off ${tp.label} · ${s.drops} ${s.drops === 1 ? "drop" : "drops"} so far`;
    else if (local.x >= 0 && local.at === s.drops) line = `Over ${under.label}${under.glued ? " · it's glued" : ""}`;
    else line = "Drag to aim · tap a plush to push for it";
    const last = s.last && !won ? `Last round: ${s.last.label} · ${firstName(nameOf(s, s.last.by))} on drop ${s.last.n}` : "";

    const ink = theme.mode === "dark" ? c.wash : c.text;
    return (
      <div>
        <CardHeader title={s.title} subtitle={`${s.prizes.length} places from the chat${s.prizes.some((p) => p.glued) ? ` · ${s.prizes.filter((p) => p.glued).length} glued down` : ""}`} />
        <div style={{ position: "relative", height: G.H }}>
          <Canvas height={G.H} label={label} drag draw={(g, f) => drawMachine(g, f, { s, aim, waiting, steering: local.down, P })} onPointer={onPointer} />
          {s.prizes.map((p, i) => {
            if (!p.voters.length || p.id === s.won || (e !== null && d && p.id === d.target)) return null;
            const q = G.items[i]!;
            const shown = p.voters.slice(0, 3);
            return shown.map((u, k) => (
              <span
                key={`${p.id}-${u}`}
                style={{
                  position: "absolute",
                  left: q.x + q.r * 0.55 + k * 11 - 9,
                  top: q.floor - q.r * 1.85 - 9 + k * 3,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  boxShadow: `0 0 0 2px ${u === me ? c.primary : c.card}`,
                  pointerEvents: "none",
                  display: "flex",
                }}
              >
                <Avatar user={mem(u)} size={18} />
              </span>
            ));
          })}
          {e !== null && d && d.ok && tp && e >= T.thunk - 100 ? (
            <div style={{ position: "absolute", left: G.chx, top: G.deckY + 10, pointerEvents: "none" }}>
              <Burst key={d.at} emoji={EMOJI[tp.kind]} />
            </div>
          ) : null}
          <button
            type="button"
            aria-label={won ? "Dropped" : busy ? "Claw is busy" : `Drop the claw over ${under.label}`}
            disabled={busy || !!won}
            onClick={drop}
            style={{
              position: "absolute",
              left: G.btnX - 26,
              top: G.deckY + DECK / 2 - 24,
              width: 52,
              height: 48,
              border: "none",
              borderRadius: 999,
              padding: 0,
              cursor: busy || won ? "default" : "pointer",
              background: busy || won ? P.cabLt : c.series2,
              boxShadow: `inset 0 -4px 0 ${busy || won ? P.cab : mix(c.series2, ink, 0.28)}, 0 0 0 3px ${P.navy}`,
              color: busy || won ? P.navy : ink,
              font: `800 13px ${theme.type.family}`,
            }}
          >
            Drop
          </button>
        </div>
        <div style={{ minHeight: 24, marginTop: 8, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: strong ? 15 : 13, lineHeight: strong ? "20px" : "17px", fontWeight: strong ? 600 : 400, color: busy || strong ? c.text : c.secondaryText, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
        </div>
        {last ? <div style={{ fontSize: 13, lineHeight: "17px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{last}</div> : null}
        {won && e === null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minWidth: 0 }}>
            <Facepile users={s.going.map(mem)} max={4} size={24} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${s.going.length} in`}</span>
            <Button kind="secondary" onClick={() => dispatch({ t: "again" })}>
              Go again
            </Button>
            <Button kind={s.going.includes(me) ? "secondary" : "primary"} onClick={() => dispatch({ t: "in" })}>
              {s.going.includes(me) ? "Can't make it" : "I'm in"}
            </Button>
          </div>
        ) : null}
      </div>
    );
  },
});
