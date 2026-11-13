import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  Changed,
  Facepile,
  Toast,
  clock,
  haptic,
  mix,
  pal,
  seedOf,
  textWidth,
  type Child,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// Group chat Wrapped: six story cards you tap through (a bar race of messages, a drawn skull emoji,
// a radial clock, the saga as a timeline, the MVP under a spotlight with a crown). Whoever reaches
// the end pins it to the chat. Which card you are on is yours alone; only watching and pinning are
// shared.

type Kind = "skull" | "sob" | "pan" | "other";
type Emo = { kind: Kind; emoji: string; count: number };
type Params = {
  /** Chat name: "Apt 4B" */
  chat: string;
  /** "2026" */
  year: string;
  /** One line on the cover: "4 roommates · 1 sink · 0 regrets" */
  tagline: string;
  /** Messages sent in all */
  total: number;
  /** One line under the bar race */
  perDay: string;
  /** 1 to 6 people with their message counts */
  people: { name: string; sent: number }[];
  /** The top emoji: kind draws it (skull, sob, pan) or "other" shows the character */
  top: Emo & { note: string };
  /** Up to two runners-up */
  runners: (Emo & { label: string })[];
  /** Most active hour, 0 to 23 */
  hour: number;
  /** Activity per hour, 24 counts from 0 to 10 */
  hist: number[];
  hourNote: string;
  hourQuote: string;
  sagaTitle: string;
  /** 2 to 5 events */
  saga: { date: string; text: string }[];
  status: string;
  mvp: { name: string; line: string };
  /** A reaction shown once pinned */
  quote: { who: string; text: string };
  /** Names who already watched */
  watched: string[];
};

// @params
const P: Params = {
  chat: "Apt 4B", year: "2026", tagline: "4 roommates · 1 sink · 0 regrets",
  total: 12483, perDay: "That's 34 a day. The sink got zero.",
  people: [{ name: "Marcus", sent: 4102 }, { name: "Dani", sent: 3550 }, { name: "Theo", sent: 2911 }, { name: "Maya", sent: 1920 }],
  top: { kind: "skull", emoji: "💀", count: 1204, note: "Mostly replying to Theo's cooking" },
  runners: [{ kind: "sob", emoji: "😭", count: 641, label: "641" }, { kind: "pan", emoji: "🍳", count: 312, label: "312 (custom)" }],
  hour: 2, hist: [9, 6, 10, 4, 1, 0, 0, 1, 2, 2, 3, 4, 5, 4, 3, 4, 5, 6, 6, 7, 8, 8, 7, 8],
  hourNote: "Peak pans discourse hours", hourQuote: "Marcus: \"its not even late\" (2:47am)",
  sagaTitle: "The pans",
  saga: [{ date: "Oct 3", text: "pans enter the sink" }, { date: "Oct 5", text: "Marcus: \"they're soaking\"" },
    { date: "Oct 8", text: "Dani's ultimatum (14 msgs)" }, { date: "Oct 9", text: "Muse builds a chore wheel" },
    { date: "Oct 10", text: "still soaking. day 5." }],
  status: "Status: unresolved (as of this message)",
  mvp: { name: "Dani", line: "Most replies · started the chore wheel · 0 pans left soaking" },
  quote: { who: "Dani", text: "frame this" }, watched: ["Dani", "Theo", "Marcus"],
};
// @end params

type Person = { id: string; name: string; sent: number };
type State = Omit<Params, "people" | "watched" | "mvp"> & {
  people: Person[];
  mvp: { id: string; name: string; line: string };
  watched: string[];
  pinned: { by: string; at: number } | null;
};
type Action = { t: "watch" } | { t: "pin" } | { t: "unpin" };
type Local = { card: number; at: number; paused: boolean; held: number; dir: number; prev: number; burst: number };

const TAU = 2 * Math.PI;
const CARD_MS = 5000;
const SLIDE_MS = 450;
const KINDS = ["skull", "sob", "pan", "other"];

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isOut = (id: string) => id.startsWith("o:");
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOutCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const easeOutBack = (x: number) => {
  const k = clamp01(x);
  return 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;
};
const frac = (x: number) => x - Math.floor(x);
const hourText = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

const cardsOf = (s: State) => {
  const list = [0];
  if (s.people.length >= 1) list.push(1);
  if (s.top.count > 0) list.push(2);
  if (s.hist.reduce((a, v) => a + v, 0) > 0) list.push(3);
  if (s.saga.length >= 2) list.push(4);
  if (s.mvp.name) list.push(5);
  return list;
};

function kindOf(v: unknown): Kind {
  return typeof v === "string" && KINDS.includes(v) ? (v as Kind) : "other";
}

function initState(ctx: Ctx): State {
  const find = (name: string) => {
    const n = name.toLowerCase();
    return ctx.members.find((m) => m.id === name || m.name.toLowerCase() === n);
  };
  const idFor = (name: string) => find(name)?.id ?? `o:${name}`;
  const seen = new Set<string>();
  const people: Person[] = [];
  for (const raw of P.people) {
    const name = clean(raw.name, 24);
    if (!name) continue;
    const id = idFor(name);
    if (seen.has(id) || people.length >= 6) continue;
    seen.add(id);
    people.push({ id, name: find(name)?.name ?? name, sent: int(raw.sent, 0, 1e9, 0) });
  }
  people.sort((a, b) => b.sent - a.sent);
  const hist = Array.isArray(P.hist) && P.hist.length === 24 ? P.hist.map((v) => int(v, 0, 10, 0)) : new Array<number>(24).fill(0);
  const peak = hist.indexOf(Math.max(...hist));
  const watched: string[] = [];
  for (const name of P.watched) {
    const id = idFor(clean(name, 24));
    if (clean(name, 24) && !watched.includes(id)) watched.push(id);
  }
  const mvpName = clean(P.mvp.name, 24);
  const emo = (e: Emo & { note?: string; label?: string }) => ({ kind: kindOf(e.kind), emoji: clean(e.emoji, 4), count: int(e.count, 0, 1e9, 0) });
  const hasStats = people.length > 0;
  return {
    chat: clean(P.chat, 20) || "This chat",
    year: clean(P.year, 8),
    tagline: clean(P.tagline, 60) || (hasStats ? "" : `${ctx.members.length} of us`),
    total: int(P.total, 0, 1e12, 0),
    perDay: clean(P.perDay, 60),
    people,
    top: { ...emo(P.top), note: clean(P.top.note, 60) },
    runners: P.runners.slice(0, 2).map((r) => ({ ...emo(r), label: clean(r.label, 20) })),
    hour: int(P.hour, 0, 23, peak < 0 ? 0 : peak),
    hist,
    hourNote: clean(P.hourNote, 60),
    hourQuote: clean(P.hourQuote, 60),
    sagaTitle: clean(P.sagaTitle, 24),
    saga: P.saga.slice(0, 5).map((e) => ({ date: clean(e.date, 8), text: clean(e.text, 32) })).filter((e) => e.text),
    status: clean(P.status, 60),
    mvp: { id: mvpName ? idFor(mvpName) : "", name: mvpName ? (find(mvpName)?.name ?? mvpName) : "", line: clean(P.mvp.line, 80) },
    quote: { who: clean(P.quote.who, 24), text: clean(P.quote.text, 60) },
    watched,
    pinned: null,
  };
}

// ---- Drawing -------------------------------------------------------------------------------------

type Pal = ReturnType<typeof pal>;

function blobs(g: CanvasRenderingContext2D, p: Pal, W: number, card: number, t: number) {
  g.fillStyle = p.on;
  g.globalAlpha = 0.06;
  for (let k = 0; k < 3; k++) {
    const cx = ((k * 131 + card * 57) % W) + Math.sin(t * 0.4 + k) * 12;
    const cy = 80 + ((k * 97 + card * 31) % 404) + Math.cos(t * 0.3 + k) * 10;
    const R = 46 + 14 * k;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const th = (i / 16) * TAU;
      const r = R * (1 + 0.1 * Math.sin(3 * th + k + card + t * 0.8));
      if (i === 0) g.moveTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r);
      else g.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r);
    }
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
}

function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, alpha = 1) {
  g.globalAlpha = alpha;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = fill;
  g.fill();
  g.globalAlpha = 1;
}

function pan(g: CanvasRenderingContext2D, p: Pal, x: number, y: number, r: number, ang: number) {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const nx = -dy;
  const ny = dx;
  g.beginPath();
  g.moveTo(x + dx * 0.9 * r + nx * 0.16 * r, y + dy * 0.9 * r + ny * 0.16 * r);
  g.lineTo(x + dx * 2.1 * r + nx * 0.13 * r, y + dy * 2.1 * r + ny * 0.13 * r);
  g.lineTo(x + dx * 2.1 * r - nx * 0.13 * r, y + dy * 2.1 * r - ny * 0.13 * r);
  g.lineTo(x + dx * 0.9 * r - nx * 0.16 * r, y + dy * 0.9 * r - ny * 0.16 * r);
  g.closePath();
  g.fillStyle = p.dark;
  g.fill();
  disc(g, x, y, r, p.dark);
  disc(g, x, y, 0.84 * r, mix(p.soft, p.card, 0.3));
  disc(g, x - 0.25 * r, y - 0.25 * r, 0.22 * r, p.on, 0.18);
}

function sob(g: CanvasRenderingContext2D, p: Pal, x: number, y: number, r: number, t: number) {
  const u = r / 13;
  disc(g, x, y, r, p.yellow);
  g.strokeStyle = p.brown;
  g.lineWidth = 2 * u;
  g.lineCap = "round";
  g.beginPath();
  g.arc(x, y + 8 * u, 5 * u, Math.PI + 0.4, TAU - 0.4);
  g.moveTo(x - 9 * u, y - 3 * u);
  g.lineTo(x - 3 * u, y - 3 * u);
  g.moveTo(x + 3 * u, y - 3 * u);
  g.lineTo(x + 9 * u, y - 3 * u);
  g.stroke();
  g.fillStyle = mix(p.blue, p.on, 0.5);
  g.beginPath();
  for (const sx of [-1, 1]) {
    const ty = y + (4 + frac(t * 2) * 6) * u;
    g.moveTo(x + sx * 6 * u + 2 * u, ty);
    g.ellipse(x + sx * 6 * u, ty, 2 * u, 3.5 * u, 0, 0, TAU);
  }
  g.fill();
}

function face(g: CanvasRenderingContext2D, p: Pal, x: number, y: number, r: number, seed: number) {
  const skins = [mix(p.cream, p.orange, 0.3), mix(p.orange, p.brown, 0.35), mix(p.brown, p.cream, 0.2), mix(p.cream, p.orange, 0.55)];
  const hairs = [p.dark, p.brown, mix(p.orange, p.brown, 0.45), p.dark];
  const skin = skins[seed % 4]!;
  const hair = hairs[(seed >>> 3) % 4]!;
  const style = (seed >>> 6) % 3;
  if (style === 1) {
    g.beginPath();
    g.roundRect(x - 1.1 * r, y - 1.02 * r, 2.2 * r, 2.2 * r, 0.9 * r);
    g.fillStyle = hair;
    g.fill();
  }
  disc(g, x - r, y + 0.05 * r, 0.14 * r, skin);
  disc(g, x + r, y + 0.05 * r, 0.14 * r, skin);
  disc(g, x, y, r, skin);
  g.fillStyle = hair;
  g.beginPath();
  g.arc(x, y, 1.04 * r, Math.PI * 1.04, Math.PI * 1.96);
  g.closePath();
  g.fill();
  if (style === 2) {
    g.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * (1.08 + (k / 6) * 0.84);
      g.moveTo(x + Math.cos(a) * r + 0.26 * r, y + Math.sin(a) * r);
      g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 0.26 * r, 0, TAU);
    }
    g.fill();
  } else {
    g.beginPath();
    g.roundRect(x - 0.98 * r, y - 0.98 * r, 1.96 * r, 0.5 * r, 0.22 * r);
    g.fill();
  }
  disc(g, x - 0.3 * r, y - 0.02 * r, 0.075 * r, p.dark);
  disc(g, x + 0.3 * r, y - 0.02 * r, 0.075 * r, p.dark);
  disc(g, x - 0.52 * r, y + 0.3 * r, 0.15 * r, p.red, 0.35);
  disc(g, x + 0.52 * r, y + 0.3 * r, 0.15 * r, p.red, 0.35);
  g.beginPath();
  g.arc(x, y + 0.22 * r, 0.3 * r, 0, Math.PI);
  g.closePath();
  g.fillStyle = p.dark;
  g.fill();
  g.fillStyle = p.on;
  g.fillRect(x - 0.22 * r, y + 0.22 * r, 0.44 * r, 0.08 * r);
}

function skull(g: CanvasRenderingContext2D, p: Pal, cx: number, cy: number, s: number, t: number) {
  disc(g, cx, cy - 0.12 * s, 0.62 * s, p.paper);
  g.beginPath();
  g.roundRect(cx - 0.36 * s, cy + 0.21 * s, 0.72 * s, 0.42 * s, 0.12 * s);
  g.fillStyle = p.paper;
  g.fill();
  const blink = frac(t * 0.7) < 0.06;
  g.fillStyle = p.dark;
  g.strokeStyle = p.dark;
  if (blink) {
    g.lineWidth = 0.05 * s;
    g.lineCap = "round";
    g.beginPath();
    for (const sx of [-1, 1]) {
      g.moveTo(cx + sx * 0.24 * s - 0.14 * s, cy - 0.05 * s);
      g.lineTo(cx + sx * 0.24 * s + 0.14 * s, cy - 0.05 * s);
    }
    g.stroke();
  } else {
    g.beginPath();
    for (const sx of [-1, 1]) {
      g.moveTo(cx + sx * 0.24 * s + 0.16 * s, cy - 0.05 * s);
      g.ellipse(cx + sx * 0.24 * s, cy - 0.05 * s, 0.16 * s, 0.18 * s, 0, 0, TAU);
    }
    g.fill();
  }
  g.beginPath();
  g.moveTo(cx, cy + 0.14 * s);
  g.lineTo(cx - 0.07 * s, cy + 0.28 * s);
  g.lineTo(cx + 0.07 * s, cy + 0.28 * s);
  g.closePath();
  g.fill();
  g.globalAlpha = 0.6;
  g.lineWidth = 0.04 * s;
  g.lineCap = "butt";
  g.beginPath();
  for (let k = 0; k < 3; k++) {
    g.moveTo(cx + (k - 1) * 0.18 * s, cy + 0.42 * s);
    g.lineTo(cx + (k - 1) * 0.18 * s, cy + 0.62 * s);
  }
  g.stroke();
  g.globalAlpha = 1;
  for (const sx of [-1, 1]) {
    const ph = frac(t * 1.3 + sx);
    g.globalAlpha = 1 - ph;
    g.beginPath();
    g.ellipse(cx + sx * s * (0.62 + 0.25 * ph), cy - 0.05 * s + 0.5 * s * ph, 0.06 * s, 0.1 * s, 0, 0, TAU);
    g.fillStyle = mix(p.blue, p.on, 0.5);
    g.fill();
  }
  g.globalAlpha = 1;
}

type Art = { s: State; lt: number; t: number; W: number; hasPin: boolean };

function drawArt(g: CanvasRenderingContext2D, f: DrawFrame, card: number, a: Art) {
  const p = pal(f.theme);
  const { s, lt, t, W } = a;
  const appear = (d: number) => easeOutBack((lt - d) / 450);
  blobs(g, p, W, card, t);
  if (card === 0) {
    const cx = W / 2 + 0.16 * W;
    pan(g, p, cx, 350, 34, t * 0.8);
    const n = Math.min(4, s.people.length);
    const rx = Math.min(110, W - cx - 22);
    s.people.slice(0, 4).forEach((x, k) => {
      if (!x.id.startsWith("o:")) return;
      const ang = t * 0.6 + (k * TAU) / n;
      face(g, p, cx + Math.cos(ang) * rx, 350 + Math.sin(ang) * 46, 18, seedOf(x.id));
    });
  } else if (card === 1) {
    const pitch = s.people.length <= 4 ? 54 : 44;
    s.people.forEach((x, j) => {
      if (x.id.startsWith("o:")) face(g, p, 34, 200 + pitch * j + 12, 12, seedOf(x.id));
    });
  } else if (card === 2) {
    const big = s.top;
    const ap = Math.max(0.01, appear(100));
    const cy = 236 + Math.sin(t * 3) * 5;
    if (big.kind === "skull") skull(g, p, W / 2, cy, 70 * ap, t);
    else if (big.kind === "sob") sob(g, p, W / 2, cy, 60 * ap, t);
    else if (big.kind === "pan") pan(g, p, W / 2 - 30, cy, 50 * ap, 0.3);
    const shift = Math.max(0, Math.min(40, (369 - W) / 2));
    s.runners.forEach((r, i) => {
      const x = i === 0 ? W / 2 - 70 - shift : W / 2 + 40 - shift;
      if (r.kind === "sob") sob(g, p, x, 490, 13, t);
      else if (r.kind === "pan") pan(g, p, x - 6, 490, 11, 0.3);
    });
  } else if (card === 3) {
    const k = easeOutCubic(lt / 1200);
    const cx = Math.min(W / 2 + 50, W - 126);
    const cy = 300;
    disc(g, cx, cy, 48, p.on, 0.1);
    g.lineCap = "butt";
    g.strokeStyle = p.on;
    g.globalAlpha = 0.55;
    g.lineWidth = 5;
    g.beginPath();
    for (let h = 0; h < 24; h++) {
      if (h === s.hour) continue;
      const ang = -Math.PI / 2 + (h / 24) * TAU;
      g.moveTo(cx + Math.cos(ang) * 54, cy + Math.sin(ang) * 54);
      g.lineTo(cx + Math.cos(ang) * (56 + ((s.hist[h] ?? 0) / 10) * 62 * k), cy + Math.sin(ang) * (56 + ((s.hist[h] ?? 0) / 10) * 62 * k));
    }
    g.stroke();
    g.globalAlpha = 1;
    const pa = -Math.PI / 2 + (s.hour / 24) * TAU;
    g.strokeStyle = p.yellow;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(cx + Math.cos(pa) * 54, cy + Math.sin(pa) * 54);
    g.lineTo(cx + Math.cos(pa) * (56 + ((s.hist[s.hour] ?? 0) / 10) * 62 * k), cy + Math.sin(pa) * (56 + ((s.hist[s.hour] ?? 0) / 10) * 62 * k));
    g.stroke();
    const ha = -Math.PI / 2 + (s.hour / 24) * TAU * k - (1 - k) * TAU;
    g.strokeStyle = p.on;
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(ha) * 40, cy + Math.sin(ha) * 40);
    g.stroke();
    disc(g, cx, cy, 5, p.on);
    g.fillStyle = p.on;
    g.font = `400 11px ${f.theme.type.family}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    [0, 6, 12, 18].forEach((h) => {
      const ang = -Math.PI / 2 + (h / 24) * TAU;
      g.fillText(h % 12 === 0 ? "12" : "6", cx + Math.cos(ang) * 30, cy + Math.sin(ang) * 30);
    });
  } else if (card === 4) {
    const n = s.saga.length;
    const lx = 82;
    const prog = clamp01(lt / 2400) * (n - 1);
    const y0 = 150;
    const y1 = 150 + 56 * (n - 1);
    g.lineCap = "round";
    g.strokeStyle = p.on;
    g.lineWidth = 3;
    g.globalAlpha = 0.3;
    g.beginPath();
    g.moveTo(lx, y0);
    g.lineTo(lx, y1);
    g.stroke();
    g.globalAlpha = 1;
    g.beginPath();
    g.moveTo(lx, y0);
    g.lineTo(lx, 150 + 56 * prog);
    g.stroke();
    let last = 0;
    s.saga.forEach((_, j) => {
      if (prog >= j - 0.05) last = j;
    });
    s.saga.forEach((_, j) => {
      const reached = prog >= j - 0.05;
      disc(g, lx, 150 + 56 * j, reached ? 7 : 5, reached && j === last ? p.yellow : p.on, reached ? 1 : 0.35);
    });
    const px = W - 48;
    const py = 150 + 56 * prog + Math.sin(t * 4) * 2;
    pan(g, p, px, py, 14, Math.PI + 0.4);
    g.strokeStyle = p.on;
    g.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const ph = frac(t * 0.8 + k / 3);
      g.globalAlpha = 1 - ph;
      g.beginPath();
      g.arc(px - 6 + k * 6, py - 18 - 20 * ph, 2 + 2 * ph, 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (card === 5) {
    const ap = clamp01(appear(300));
    const cx = W / 2;
    const cy = 216;
    g.fillStyle = p.on;
    g.globalAlpha = 0.06 * ap;
    g.beginPath();
    for (let k = 0; k < 14; k++) {
      const ang = (k / 14) * TAU + t * 0.25;
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(ang - 0.12) * 300, cy + Math.sin(ang - 0.12) * 300);
      g.lineTo(cx + Math.cos(ang + 0.12) * 300, cy + Math.sin(ang + 0.12) * 300);
      g.closePath();
    }
    g.fill();
    for (let k = 0; k < 14; k++) disc(g, cx, cy, 90 - k * 5.5, p.yellow, (0.34 * ap) / 14);
    if (s.mvp.id.startsWith("o:")) face(g, p, cx, cy, 40 * ap, seedOf(s.mvp.id));
    g.globalAlpha = ap;
    g.beginPath();
    const oy = cy - 50 * ap;
    g.moveTo(cx - 20, oy + 6);
    g.lineTo(cx - 20, oy - 12);
    g.lineTo(cx - 10, oy - 3);
    g.lineTo(cx, oy - 16);
    g.lineTo(cx + 10, oy - 3);
    g.lineTo(cx + 20, oy - 12);
    g.lineTo(cx + 20, oy + 6);
    g.closePath();
    g.fillStyle = p.yellow;
    g.fill();
    g.globalAlpha = 1;
  }
}

const gradient = (p: Pal, card: number) => {
  const acc = [p.blue, p.red, p.green, p.blue, p.red, p.blue][card] ?? p.blue;
  return `linear-gradient(${mix(acc, p.dark, 0.35)}, ${mix(acc, p.dark, 0.75)})`;
};

export default defineApp<State, Action, Local>({
  name: "Group chat wrapped",
  summary: (s, ctx) => {
    const total = new Set([...s.people.map((x) => x.id), ...ctx.members.map((m) => m.id)]).size;
    if (s.pinned) {
      const by = ctx.members.find((m) => m.id === s.pinned!.by)?.name ?? "Someone";
      return `${s.chat} wrapped: pinned by ${by} · ${s.watched.length} of ${total} watched`;
    }
    return `${s.chat} wrapped: ${s.watched.length} of ${total} watched`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    const u = meta.user;
    if (a.t === "watch") {
      if (s.watched.includes(u)) return s;
      return { ...s, watched: [...s.watched, u] };
    }
    if (a.t === "pin") {
      if (s.pinned !== null) return s;
      return { ...s, pinned: { by: u, at: Math.max(1, meta.time) }, watched: s.watched.includes(u) ? s.watched : [...s.watched, u] };
    }
    if (a.t === "unpin") {
      if (s.pinned === null || s.pinned.by !== u) return s;
      return { ...s, pinned: null };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const left = (id: string) => !isOut(id) && !inChat(ctx, id);
    const mvpLeft = s.mvp.id !== "" && left(s.mvp.id);
    if (!s.watched.some(left) && !(s.pinned && left(s.pinned.by)) && !s.people.some((p) => left(p.id)) && !mvpLeft) return s;
    const taken = new Set(s.people.filter((p) => !left(p.id)).map((p) => p.id));
    const people = s.people.map((p) => {
      if (!left(p.id)) return p;
      let id = `o:${p.name}`;
      for (let k = 2; taken.has(id); k++) id = `o:${p.name} ${k}`;
      taken.add(id);
      return { ...p, id };
    });
    const mvp = mvpLeft ? { ...s.mvp, id: `o:${s.mvp.name}` } : s.mvp;
    return { ...s, people, mvp, watched: s.watched.filter((u) => !left(u)), pinned: s.pinned && left(s.pinned.by) ? null : s.pinned };
  },

  invariants: {
    "watched is unique, members or outsiders": (s, ctx) => new Set(s.watched).size === s.watched.length && s.watched.every((u) => u.startsWith("o:") || ctx.members.some((m) => m.id === u)),
    "a pin is by someone in the chat who watched": (s, ctx) => !s.pinned || (ctx.members.some((m) => m.id === s.pinned!.by) && s.watched.includes(s.pinned.by) && s.pinned.at >= 1),
    "bars are whole and sorted": (s) => s.people.length <= 6 && s.people.every((p, i) => Number.isInteger(p.sent) && p.sent >= 0 && (i === 0 || s.people[i - 1]!.sent >= p.sent)),
    "the clock has 24 hours": (s) => s.hist.length === 24 && s.hist.every((v) => Number.isInteger(v) && v >= 0 && v <= 10) && Number.isInteger(s.hour) && s.hour >= 0 && s.hour <= 23,
    "people ids are unique": (s) => new Set(s.people.map((p) => p.id)).size === s.people.length,
    "bars and the MVP belong to people in the chat or outsiders": (s, ctx) =>
      s.people.every((p) => p.id.startsWith("o:") || ctx.members.some((m) => m.id === p.id)) && (s.mvp.id === "" || s.mvp.id.startsWith("o:") || ctx.members.some((m) => m.id === s.mvp.id)),
  },

  transitions: {
    "watching adds only the actor, at the end": (p, n, a, m) => a.t !== "watch" || p === n || (!p.watched.includes(m.user) && same(n.watched, [...p.watched, m.user])),
    "a pin stamps the actor now": (p, n, a, m) => a.t !== "pin" || p === n || (p.pinned === null && n.pinned !== null && n.pinned.by === m.user && n.pinned.at === Math.max(1, m.time)),
    "only the pinner unpins": (p, n, a, m) => a.t !== "unpin" || p === n || (p.pinned !== null && p.pinned.by === m.user && n.pinned === null),
    "nobody is un-watched by an action": (p, n) => p.watched.every((u) => n.watched.includes(u)),
    "the recap never changes": (p, n) => same({ ...p, watched: 0, pinned: 0 }, { ...n, watched: 0, pinned: 0 }),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.pinned?.by === user && r.next() < 0.5) return { t: "unpin" };
    if (!s.pinned && r.next() < 0.6) return { t: "pin" };
    return { t: "watch" };
  },

  local: { card: 0, at: 0, paused: false, held: 0, dir: 1, prev: -1, burst: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const H = 524;
    const now = clock.value;
    if (local.at === 0 && born === 0 && now > 0) born = now;
    const at = local.at || born;

    const cards = cardsOf(state);
    const last = cards[cards.length - 1]!;
    const pillCard = cards.includes(5) ? 5 : last;
    const basePos = Math.max(0, cards.indexOf(local.card));
    const elapsed = local.paused ? local.held : Math.max(0, now - at);
    const steps = local.paused ? 0 : Math.floor(elapsed / CARD_MS);
    const pos = Math.min(cards.length - 1, basePos + steps);
    const shown = cards[pos]!;
    const lt = local.paused ? local.held : elapsed - (pos - basePos) * CARD_MS;
    const autoMoved = !local.paused && steps > 0 && pos > basePos;
    const lastTap = !local.paused && steps === 0;
    const slideK = lt < SLIDE_MS && (autoMoved || (lastTap && local.prev >= 0 && local.prev !== shown)) ? easeOutCubic(lt / SLIDE_MS) : 1;
    const prevCard = slideK < 1 ? (autoMoved ? (cards[pos - 1] ?? 0) : local.prev) : -1;
    const dir = autoMoved ? 1 : local.dir;
    const t = now / 1000;
    const start = local.paused ? null : now - lt;

    const nameOf = (id: string) => (isOut(id) ? id.slice(2) : (members.find((m) => m.id === id)?.name ?? state.people.find((x) => x.id === id)?.name ?? "Someone"));
    const person = (id: string): Member => members.find((m) => m.id === id) ?? { id, name: nameOf(id) };
    const total = new Set([...state.people.map((x) => x.id), ...members.map((m) => m.id)]).size;
    const mine = state.watched.includes(me);
    const pinnedMine = state.pinned?.by === me;

    const shiftF = Math.max(0, Math.min(40, (369 - W) / 2));
    const big = (text: string, size: number, weight = 700) => Math.min(size, Math.floor((size * (W - 44)) / Math.max(1, textWidth(text, size, weight))));
    const row = (top: number, size: number, extra: Record<string, unknown> = {}) => ({
      position: "absolute" as const,
      left: 22,
      top,
      fontSize: size,
      lineHeight: size >= 40 ? 1.1 : size >= 24 ? "30px" : size >= 16 ? "20px" : "16px",
      color: p.on,
      whiteSpace: "nowrap" as const,
      ...extra,
    });
    const mid = (top: number, size: number, extra: Record<string, unknown> = {}) => row(top, size, { left: 0, right: 0, textAlign: "center", ...extra });
    const bottom = (extra: Record<string, unknown> = {}) => ({ position: "absolute" as const, left: 22, right: 22, bottom: H - 502, fontSize: 13, lineHeight: "16px", color: p.on, ...extra });
    const appear = (l: number, d: number) => easeOutBack((l - d) / 450);
    const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

    const body = (card: number, l: number) => {
      const ap = (d: number) => clamp01(appear(l, d));
      if (card === 0) {
        const n = Math.min(4, state.people.length);
        const cx = W / 2 + 0.16 * W;
        const rx = Math.min(110, W - cx - 22);
        const ap0 = appear(l, 0);
        const size = big("Wrapped", 64);
        return (
          <>
            <div style={row(66, 16)}>Your group chat's</div>
            <div style={row(88, size, { fontWeight: 700, transform: `scale(${0.8 + 0.2 * ap0})`, transformOrigin: "left center" })}>Wrapped</div>
            <div style={row(88 + Math.round(size * 1.1), 24, { fontWeight: 700, opacity: ap(300), right: 22, ...ell })}>{`${state.chat}${state.year ? " · " + state.year : ""}`}</div>
            {state.people.slice(0, 4).map((x, k) => {
              const ang = t * 0.6 + (k * TAU) / n;
              const px = cx + Math.cos(ang) * rx;
              const py = 350 + Math.sin(ang) * 46;
              return x.id === me ? (
                <span key={x.id} style={{ position: "absolute", left: px - 18, top: py - 18, width: 36, height: 36, borderRadius: 18, background: p.on, color: p.dark, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  you
                </span>
              ) : isOut(x.id) ? null : (
                <span key={x.id} style={{ position: "absolute", left: px - 18, top: py - 18, display: "flex" }}>
                  <Avatar user={person(x.id)} size={36} />
                </span>
              );
            })}
            {state.tagline ? <div style={bottom({ ...ell, opacity: 1 })}>{state.tagline}</div> : null}
          </>
        );
      }
      if (card === 1) {
        const max = Math.max(1, state.people[0]?.sent ?? 1);
        const pitch = state.people.length <= 4 ? 54 : 44;
        const count = Math.round(state.total * easeOutCubic(l / 1300));
        return (
          <>
            <div style={row(56, 16)}>You all sent</div>
            <div style={row(76, big(fmt(state.total), 64), { fontWeight: 700 })}>{fmt(count)}</div>
            <div style={row(148, 24, { fontWeight: 600 })}>messages</div>
            {state.people.map((x, j) => {
              const y = 200 + pitch * j;
              const kk = easeOutCubic((l - 200 - 120 * j) / 1000);
              const w = Math.max(4, (W - 80) * (x.sent / max) * kk);
              return (
                <div key={x.id}>
                  {isOut(x.id) ? null : (
                    <span style={{ position: "absolute", left: 22, top: y, display: "flex" }}>
                      <Avatar user={person(x.id)} size={24} />
                    </span>
                  )}
                  <div style={{ position: "absolute", left: 54, top: y + 2, height: 20, width: w, borderRadius: 10, background: mix(mix(p.red, p.dark, 0.55), p.on, j === 0 ? 0.26 : 0.16) }} />
                  <span style={{ position: "absolute", left: 64, top: y + 2, height: 20, lineHeight: "20px", fontSize: 13, color: p.on, maxWidth: Math.max(0, w - 70), ...ell }}>{x.id === me ? "You" : x.name}</span>
                  <span style={{ position: "absolute", left: 54 + w - 8 - 60, width: 60, top: y + 2, height: 20, lineHeight: "20px", fontSize: 12, color: p.on, textAlign: "right", fontFamily: "ui-monospace, Menlo, monospace" }}>{String(Math.round(x.sent * kk))}</span>
                </div>
              );
            })}
            {state.perDay ? <div style={bottom({ opacity: ap(1200) > 0.02 ? 1 : 0 })}>{state.perDay}</div> : null}
          </>
        );
      }
      if (card === 2) {
        const c1 = W / 2 - 70 - shiftF;
        const c2 = W / 2 + 40 - shiftF;
        const runner = (r: (typeof state.runners)[number], x: number, i: number) => (
          <div key={i}>
            {r.kind === "other" ? <span style={{ position: "absolute", left: x - 11, top: 490 - 15, fontSize: 22, lineHeight: "30px" }}>{r.emoji}</span> : null}
            <div style={{ position: "absolute", left: x + (i === 1 ? 34 : 20) - (r.kind === "pan" ? 6 : 0), top: 482, fontSize: 13, lineHeight: "16px", color: p.on, maxWidth: Math.max(30, W - x - 50), ...ell }}>{r.label || fmt(r.count)}</div>
          </div>
        );
        return (
          <>
            <div style={row(56, 16)}>Your top emoji</div>
            {state.top.kind === "other" ? <div style={mid(196, 72, { lineHeight: "80px", transform: `scale(${Math.max(0.01, appear(l, 100))})` })}>{state.top.emoji}</div> : null}
            <div style={mid(330, big(`Used ${fmt(state.top.count)} times`, 26), { fontWeight: 700, lineHeight: "30px", opacity: 1 })}>{`Used ${fmt(state.top.count)} times`}</div>
            {state.top.note ? <div style={mid(368, 13, { whiteSpace: "normal", padding: "0 20px" })}>{state.top.note}</div> : null}
            {state.runners.map((r, i) => runner(r, i === 0 ? c1 : c2, i))}
          </>
        );
      }
      if (card === 3) {
        const cx = Math.min(W / 2 + 50, W - 126);
        return (
          <>
            <div style={row(56, 16)}>Most active hour</div>
            <div style={row(76, 64, { fontWeight: 700 })}>{hourText(state.hour)}</div>
            {state.hourNote ? <div style={row(216, 13, { whiteSpace: "normal", width: Math.max(90, Math.min(150, cx - 112)) })}>{state.hourNote}</div> : null}
            {state.hourQuote ? <div style={bottom({ opacity: ap(1000) > 0.02 ? 1 : 0, ...ell })}>{state.hourQuote}</div> : null}
          </>
        );
      }
      if (card === 4) {
        const n = state.saga.length;
        const prog = clamp01(l / 2400) * (n - 1);
        const lx = 82;
        return (
          <>
            <div style={row(56, 16)}>The saga</div>
            {state.sagaTitle ? <div style={row(74, big(state.sagaTitle, 44), { fontWeight: 700 })}>{state.sagaTitle}</div> : null}
            {state.saga.map((e, j) => {
              const reached = prog >= j - 0.05;
              const y = 150 + 56 * j;
              return (
                <div key={j} style={{ opacity: reached ? 1 : 0 }}>
                  <div style={{ position: "absolute", left: 0, width: lx - 14, top: y - 8, textAlign: "right", fontSize: 13, lineHeight: "16px", fontWeight: 600, color: p.on, whiteSpace: "nowrap" }}>{e.date}</div>
                  <div style={{ position: "absolute", left: lx + 16, top: y - 10, maxWidth: W - lx - 40 - 16 + 16, fontSize: 14, lineHeight: "20px", color: p.on, ...ell }}>{e.text}</div>
                </div>
              );
            })}
            {state.status ? <div style={bottom({ opacity: ap(2400) > 0.02 ? 1 : 0 })}>{state.status}</div> : null}
          </>
        );
      }
      const a = clamp01(appear(l, 300));
      const nm = state.mvp.name;
      return (
        <>
          <div style={mid(56, 16)}>And your chat MVP is</div>
          {isOut(state.mvp.id) ? null : (
            <span style={{ position: "absolute", left: W / 2 - 40, top: 176, display: "flex", transform: `scale(${a})` }}>
              <Avatar user={person(state.mvp.id)} size={80} />
            </span>
          )}
          <div style={mid(292, big(nm, 48), { fontWeight: 700, lineHeight: "54px", transform: `scale(${0.7 + 0.3 * a})` })}>{nm}</div>
          {state.mvp.line ? (
            <div style={mid(352, 13, { whiteSpace: "normal", padding: "0 20px", opacity: ap(700) > 0.02 ? 1 : 0 })}>{state.mvp.line}</div>
          ) : null}
        </>
      );
    };

    const labels = [
      `${state.chat} wrapped, card 1 of ${cards.length}: cover`,
      `Bar race: ${state.people[0]?.name ?? "nobody"} ${fmt(state.people[0]?.sent ?? 0)} messages`,
      `Top emoji, used ${fmt(state.top.count)} times`,
      `Most active hour ${hourText(state.hour)}`,
      `${state.sagaTitle || "The saga"}, ${state.saga.length} events`,
      `Chat MVP ${state.mvp.name}`,
    ];

    const layer = (card: number, l: number, startAt: number | null, style: Record<string, unknown>, key: string, extra?: Child) => (
      <div key={key} style={{ position: "absolute", inset: 0, background: gradient(p, card), overflow: "hidden", ...style }}>
        <Canvas
          height={H}
          label={labels[card] ?? ""}
          draw={(g, f) => {
            const ltNow = startAt === null ? l : f.now - startAt;
            drawArt(g, f, card, { s: state, lt: ltNow, t: f.now / 1000, W: f.width, hasPin: false });
            return true;
          }}
        />
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{body(card, l)}</div>
        {extra}
      </div>
    );

    const go = (to: number, d: number) => setLocal({ card: to, at: clock.value, dir: d, prev: shown, paused: false, held: 0 });
    const next = () => {
      const i = cards.indexOf(shown);
      if (i < cards.length - 1) {
        const to = cards[i + 1]!;
        go(to, 1);
        if (to === last && !mine) dispatch({ t: "watch" });
      } else go(cards[0]!, 1);
    };
    const back = () => {
      const i = cards.indexOf(shown);
      go(i > 0 ? cards[i - 1]! : cards[0]!, -1);
    };
    const togglePause = () => {
      if (local.paused) setLocal({ paused: false, at: clock.value - local.held });
      else setLocal({ paused: true, card: shown, held: lt });
    };

    const showPill = shown === pillCard;
    const pillTop = cards.includes(5) ? 454 : 424;

    return (
      <div>
        <div style={{ position: "relative", height: H, borderRadius: 18, overflow: "hidden", background: p.dark }}>
          {prevCard >= 0
            ? layer(
                prevCard,
                CARD_MS,
                null,
                { transform: `translateX(${-0.35 * dir * W * slideK}px)` },
                "old",
                <div style={{ position: "absolute", inset: 0, background: p.dark, opacity: 0.47 * slideK, pointerEvents: "none" }} />,
              )
            : null}
          {layer(
            shown,
            lt,
            start,
            { transform: slideK < 1 ? `translateX(${dir * W * (1 - slideK)}px)` : "none" },
            "cur",
            slideK < 1 ? <div style={{ position: "absolute", top: 0, bottom: 0, [dir > 0 ? "left" : "right"]: 0, width: 8, background: p.dark, opacity: 0.2, pointerEvents: "none" }} /> : null,
          )}

          <div style={{ position: "absolute", left: 12, right: 12, top: 10, display: "flex", gap: 4, pointerEvents: "none" }}>
            {cards.map((cd, i) => {
              const fill = i < pos ? 1 : i === pos ? (cd === last ? 1 : clamp01(lt / CARD_MS)) : 0;
              return (
                <div key={cd} style={{ flex: 1, height: 3, borderRadius: 2, background: mix(p.on, p.dark, 0.7), overflow: "hidden" }}>
                  <div style={{ width: `${fill * 100}%`, height: 3, background: p.on }} />
                </div>
              );
            })}
          </div>
          <div style={{ position: "absolute", left: 12, top: 19, height: 22, display: "flex", alignItems: "center", gap: 6, color: p.on, fontSize: 13, lineHeight: "16px", maxWidth: W - 80, pointerEvents: "none" }}>
            <span style={{ flex: "none", width: 22, height: 22, borderRadius: 11, background: p.on, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 17, height: 17, borderRadius: 9, border: `3px solid ${c.primary}`, boxSizing: "border-box" }} />
            </span>
            <span style={{ fontWeight: 600, ...ell }}>{`${state.chat} wrapped`}</span>
            {state.year ? <span style={{ flex: "none" }}>{`Muse · ${state.year}`}</span> : null}
          </div>

          <button
            type="button"
            aria-label="Previous"
            onClick={back}
            style={{ position: "absolute", left: 0, top: 52, width: "33%", bottom: 0, border: "none", background: "none", padding: 0, cursor: "pointer" }}
          />
          <button
            type="button"
            aria-label="Next"
            onClick={next}
            style={{ position: "absolute", left: "33%", top: 52, right: 0, bottom: 0, border: "none", background: "none", padding: 0, cursor: "pointer" }}
          />
          <button
            type="button"
            aria-label={local.paused ? "Play" : "Pause"}
            onClick={togglePause}
            style={{ position: "absolute", right: 2, top: 8, width: 44, height: 44, border: "none", background: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 3, cursor: "pointer", zIndex: 1 }}
          >
            {local.paused ? (
              <span style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: `10px solid ${p.on}` }} />
            ) : (
              <>
                <span style={{ width: 3, height: 11, borderRadius: 1, background: p.on }} />
                <span style={{ width: 3, height: 11, borderRadius: 1, background: p.on }} />
              </>
            )}
          </button>

          {showPill ? (
            <div style={{ position: "absolute", left: W / 2 - 88, top: pillTop, width: 176, height: 44, zIndex: 1 }}>
              {state.pinned ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 176, height: 44, borderRadius: 22, background: p.on, color: p.dark, fontSize: 15, fontWeight: 600, padding: "0 12px", ...ell }}>{`Pinned to ${state.chat}`}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    haptic("success");
                    setLocal({ burst: local.burst + 1 });
                    dispatch({ t: "pin" });
                  }}
                  style={{ width: 176, height: 44, borderRadius: 22, border: "none", background: p.on, color: p.dark, font: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
                >
                  Pin to chat
                </button>
              )}
              {local.burst > 0 && pinnedMine ? (
                <div style={{ position: "absolute", left: "50%", right: 0, top: 0, pointerEvents: "none" }}>
                  <Burst key={local.burst} emoji="❤️" />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <Changed at={state.pinned?.at ?? 0}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 28, marginTop: 6, minWidth: 0 }}>
            {state.watched.length ? <Facepile users={state.watched.map(person)} max={3} size={20} /> : null}
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>
              {state.pinned
                ? state.quote.text
                  ? `Pinned · ${state.quote.who || nameOf(state.pinned.by)}: "${state.quote.text}"`
                  : `Pinned by ${nameOf(state.pinned.by)}`
                : `${state.watched.length} of ${total} watched · tap right for next`}
            </span>
            {pinnedMine ? (
              <Button kind="deemphasized" onClick={() => dispatch({ t: "unpin" })}>
                Unpin
              </Button>
            ) : null}
          </div>
        </Changed>
        {local.burst > 0 && pinnedMine ? <Toast key={local.burst}>{`Pinned · It's official, ${state.mvp.name || state.chat}`}</Toast> : null}
      </div>
    );
  },
});

let born = 0;
