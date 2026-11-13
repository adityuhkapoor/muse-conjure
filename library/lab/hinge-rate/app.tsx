import {
  defineApp,
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
  spring,
  springs,
  tween,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Rate the matches: a drawn profile card on a little stack, the friends' one-word takes pop onto
// its edges as stickers and swing a red-to-green meter. Whoever taps (or swipes) casts the deciding
// flag, the card flies off and the next slides up. After the third card, a board of three verdicts.

type Look = { skin: number; hair: number; style: number; shirt: number; bg: number };
type Take = { who: string; text: string; w: number; at: number };
type Profile = { name: string; age: number; info: string; prompt: string; answer: string; look: Look; takes: Take[] };
type Params = {
  /** Whose matches, first name */
  subject: string;
  /** 1 to 3 profiles. look: skin 0-2, hair 0-3, style 0-2, shirt 0-5, bg 0-3. takes: up to 4 one-word takes, w -20..20 moves the meter, at = ms after the card shows */
  profiles: Profile[];
};

// @params
const P: Params = {
  subject: "Ana",
  profiles: [
    { name: "Jordan", age: 29, info: "product designer · 5'11 · Williamsburg", prompt: "I'll fall for you if...", answer: "you can beat me at Mario Kart",
      look: { skin: 1, hair: 0, style: 0, shirt: 0, bg: 2 },
      takes: [ { who: "Lily", text: "golden retriever", w: 14, at: 0 }, { who: "Priya", text: "ick: the vest", w: -12, at: 0 },
               { who: "Maya", text: "MARRY", w: 16, at: 900 }, { who: "Jess", text: "the dog is carrying", w: 8, at: 2200 } ] },
    { name: "Chase", age: 31, info: "finance · 6'2 (allegedly) · Murray Hill", prompt: "My simple pleasures", answer: "crypto, gym, sunsets",
      look: { skin: 0, hair: 1, style: 2, shirt: 1, bg: 0 },
      takes: [ { who: "Maya", text: "6'2 is a lie", w: -14, at: 300 }, { who: "Lily", text: "nope", w: -12, at: 800 },
               { who: "Jess", text: "jawline tho", w: 8, at: 1400 }, { who: "Priya", text: "fish pic incoming", w: -12, at: 2000 } ] },
    { name: "Theo", age: 27, info: "bass in a band · Bushwick", prompt: "Together we could...", answer: "argue about the best taco truck",
      look: { skin: 2, hair: 2, style: 1, shirt: 2, bg: 3 },
      takes: [ { who: "Lily", text: "cute??", w: 10, at: 300 }, { who: "Maya", text: "musician = red", w: -14, at: 900 },
               { who: "Priya", text: "the taco truck tho", w: 10, at: 1500 }, { who: "Jess", text: "he texts back", w: 14, at: 2100 } ] },
  ],
};
// @end params

type Verdict = { green: boolean; by: string };
type State = {
  subject: string;
  profiles: Profile[];
  idx: number;
  verdicts: Verdict[];
  shownAt: number;
  flewAt: number;
  flewDir: number;
  rounds: number;
};
type Action = { t: "flag"; green: boolean } | { t: "again" };
type Local = { drag: number; downX: number | null; relAt: number; relFrom: number };

const MAX_PROFILES = 3;
const MAX_TAKES = 4;
const FLY_MS = 550;
const POP_MS = 350;
const SINCE_MS = 6000;
const TOAST_MS = 2400;
const ease400 = tween({ duration: 400, easing: "decelerate" });
const easeFly = tween({ duration: 1000, easing: "easeInOut" });
const rise = tween({ duration: 500, easing: "decelerate" });
const settle = spring(springs.ios);

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const done = (s: State) => s.idx >= s.profiles.length;
const easeBack = (t: number) => {
  const u = t - 1;
  return 1 + 2.70158 * u * u * u + 1.70158 * u * u;
};
const pick = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : 0);

function cleanProfile(raw: Profile): Profile {
  const takes: Take[] = [];
  for (const t of Array.isArray(raw.takes) ? raw.takes : []) {
    if (takes.length >= MAX_TAKES) break;
    const text = clean(t.text, 22);
    const who = clean(t.who, 12);
    if (!text || !who) continue;
    takes.push({
      who,
      text,
      w: typeof t.w === "number" && Number.isInteger(t.w) ? clamp(t.w, -20, 20) : 0,
      at: typeof t.at === "number" && Number.isInteger(t.at) ? clamp(t.at, 0, 5000) : 0,
    });
  }
  const look = raw.look ?? { skin: 0, hair: 0, style: 0, shirt: 0, bg: 0 };
  return {
    name: clean(raw.name, 16) || "Your match",
    age: typeof raw.age === "number" && Number.isInteger(raw.age) && raw.age >= 18 && raw.age <= 99 ? raw.age : 0,
    info: clean(raw.info, 44),
    prompt: clean(raw.prompt, 32),
    answer: clean(raw.answer, 40),
    look: { skin: pick(look.skin, 2), hair: pick(look.hair, 3), style: pick(look.style, 2), shirt: pick(look.shirt, 5), bg: pick(look.bg, 3) },
    takes,
  };
}

function initState(): State {
  const raw = Array.isArray(P.profiles) ? P.profiles.slice(0, MAX_PROFILES) : [];
  const profiles = raw.map(cleanProfile);
  if (!profiles.length) {
    profiles.push({ name: "Your match", age: 0, info: "", prompt: "Ask the chat", answer: "red flag or green flag?", look: { skin: 0, hair: 0, style: 0, shirt: 0, bg: 0 }, takes: [] });
  }
  return { subject: clean(P.subject, 16) || "your friend", profiles, idx: 0, verdicts: [], shownAt: 0, flewAt: 0, flewDir: 0, rounds: 0 };
}

/** Meter value 0 to 100: 50 plus each take's weight as it lands, plus a lean while a flag is dragged. */
function meterAt(p: Profile, since: number, dir: number) {
  let v = 50 + 18 * dir;
  for (const t of p.takes) v += t.w * ease400(clamp(since - t.at, 0, 400));
  return clamp(v, 0, 100);
}
const seenAt = (p: Profile, since: number) => p.takes.filter((t) => since >= t.at).length;
const whoNames = (p: Profile) => [...new Set(p.takes.map((t) => t.who))];
const leanWord = (m: number) => (m > 55 ? "leaning green" : m < 45 ? "leaning red" : "split");

// ---- drawing ----

type Face = { skin: string; hair: string; shirt: string };
function faceColors(th: Theme, look: Look): Face {
  const p = pal(th);
  return {
    skin: [mix(p.cream, p.brown, 0.15), mix(p.cream, p.brown, 0.45), mix(p.brown, p.cream, 0.15)][look.skin] ?? p.cream,
    hair: [mix(p.brown, p.dark, 0.5), p.crust, p.dark, mix(p.orange, p.brown, 0.4)][look.hair] ?? p.dark,
    shirt: [p.blue, mix(p.dark, p.blue, 0.15), p.orange, p.green, p.purple, p.red][look.shirt] ?? p.blue,
  };
}

function poly(g: CanvasRenderingContext2D, ox: number, oy: number, pts: number[][], fill: string) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(ox + x!, oy + y!) : g.moveTo(ox + x!, oy + y!)));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}
function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

/** A drawn portrait: background, sun and a bust, inside the box (x, y, w, h). The caller clips. */
function portrait(g: CanvasRenderingContext2D, th: Theme, look: Look, x: number, y: number, w: number, h: number, t: number) {
  const p = pal(th);
  const col = faceColors(th, look);
  const bgc = [p.blue, p.yellow, p.green, p.red][look.bg] ?? p.blue;
  g.fillStyle = mix(bgc, th.color.card, 0.35);
  g.fillRect(x, y, w, h);
  g.globalAlpha = 0.35;
  dot(g, x + w - 40, y + 34, 26, p.on);
  g.globalAlpha = 1;

  const cx = x + w / 2;
  const cy = y + h - 58;
  poly(g, cx, cy, [[-62, 64], [-52, 30], [-20, 20], [20, 20], [52, 30], [62, 64]], col.shirt);
  if (look.style === 0) {
    const vest = mix(col.shirt, p.dark, 0.45);
    poly(g, cx, cy, [[-46, 64], [-40, 30], [-16, 22], [-6, 64]], vest);
    poly(g, cx, cy, [[46, 64], [40, 30], [16, 22], [6, 64]], vest);
  }
  g.fillStyle = mix(col.skin, p.dark, 0.1);
  g.beginPath();
  g.roundRect(cx - 9, cy + 8, 18, 16, 4);
  g.fill();

  const hx = cx;
  const hy = cy - 14 + Math.sin(t * 1.6) * 1.2;
  if (look.style === 1) {
    g.fillStyle = col.hair;
    g.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = Math.PI + (k / 8) * Math.PI;
      const px = hx + Math.cos(a) * 26;
      const py = hy + Math.sin(a) * 26 + 2;
      g.moveTo(px + 11, py);
      g.arc(px, py, 11, 0, Math.PI * 2);
    }
    g.fill();
  } else dot(g, hx, hy - 6, 29, col.hair);
  g.beginPath();
  g.ellipse(hx, hy + 4, 25, 30, 0, 0, Math.PI * 2);
  g.fillStyle = col.skin;
  g.fill();
  if (look.style === 0) poly(g, hx, hy, [[-26, -6], [-18, -28], [10, -32], [26, -10], [8, -18], [-10, -14]], col.hair);
  if (look.style === 2) poly(g, hx, hy, [[-26, -4], [-20, -30], [20, -32], [27, -6], [10, -22]], col.hair);

  const blink = (t * 0.7) % 1 > 0.96;
  g.fillStyle = p.dark;
  g.strokeStyle = p.dark;
  g.lineWidth = 2;
  for (const s of [-1, 1]) {
    if (blink) {
      g.beginPath();
      g.moveTo(hx + s * 10 - 3, hy + 2);
      g.lineTo(hx + s * 10 + 3, hy + 2);
      g.stroke();
    } else dot(g, hx + s * 10, hy + 2, 3, p.dark);
  }
  g.globalAlpha = 0.35;
  dot(g, hx - 16, hy + 12, 4.5, p.red);
  dot(g, hx + 16, hy + 12, 4.5, p.red);
  g.globalAlpha = 1;
  if (look.style === 2) {
    g.fillStyle = p.dark;
    g.beginPath();
    g.roundRect(hx - 18, hy - 24, 16, 8, 3);
    g.roundRect(hx + 2, hy - 24, 16, 8, 3);
    g.fill();
  }
  g.strokeStyle = p.dark;
  g.lineWidth = 2;
  g.lineCap = "round";
  g.beginPath();
  for (let i = 0; i < 9; i++) {
    const mx = (i / 8 - 0.5) * 14;
    const my = 14 + (1 - (mx / 7) ** 2) * 4;
    if (i) g.lineTo(hx + mx, hy + my);
    else g.moveTo(hx + mx, hy + my);
  }
  g.stroke();
}

type Geo = { cw: number; left: number; top: number };

/** The live card and its stickers. `since` is ms since the card showed (Infinity when all takes are in). */
function drawCard(g: CanvasRenderingContext2D, f: DrawFrame, geo: Geo, prof: Profile, since: number, members: Member[], t: number) {
  const th = f.theme;
  const c = th.color;
  const { cw, left, top } = geo;
  const fam = th.type.family;
  g.fillStyle = c.wash;
  g.beginPath();
  g.roundRect(left, top, cw, 250, 12);
  g.fill();

  g.save();
  g.beginPath();
  g.roundRect(left, top, cw, 132, [12, 12, 0, 0]);
  g.clip();
  portrait(g, th, prof.look, left, top, cw, 132, t);
  g.restore();

  g.textAlign = "left";
  g.textBaseline = "middle";
  const title = prof.age ? `${prof.name}, ${prof.age}` : prof.name;
  const nf = fitText(title, cw - 28, { g, size: 20, weight: 700, min: 14, family: fam });
  g.font = nf.font;
  g.fillStyle = c.text;
  g.fillText(nf.text, left + 14, top + 159);
  if (prof.info) {
    const inf = fitText(prof.info, cw - 28, { g, size: 13, min: 11, family: fam });
    g.font = inf.font;
    g.fillStyle = c.secondaryText;
    g.fillText(inf.text, left + 14, top + 181);
  }
  g.fillStyle = c.card;
  g.beginPath();
  g.roundRect(left + 10, top + 192, cw - 20, 48, 10);
  g.fill();
  const pf = fitText(prof.prompt, cw - 40, { g, size: 13, min: 11, family: fam });
  g.font = pf.font;
  g.fillStyle = c.secondaryText;
  g.fillText(pf.text, left + 20, top + 206);
  const af = fitText(prof.answer, cw - 40, { g, size: 15, weight: 600, min: 12, family: fam });
  g.font = af.font;
  g.fillStyle = c.text;
  g.fillText(af.text, left + 20, top + 226);

  // take stickers, popping on one by one
  const ccx = left + cw / 2;
  const ccy = top + 125;
  const spots = [
    [-cw / 2 + 8, -96, 0],
    [cw / 2 - 8, -60, 1],
    [-cw / 2 + 4, -20, 0],
    [cw / 2 - 4, 16, 1],
  ] as const;
  prof.takes.forEach((tk, k) => {
    if (since < tk.at) return;
    const pop = easeBack(clamp01((since - tk.at) / POP_MS));
    const spot = spots[k]!;
    const tf = fitText(tk.text, f.width - 40 - 26, { g, size: 13, min: 11, family: fam });
    g.font = tf.font;
    const pw = Math.ceil(g.measureText(tf.text).width) + 36;
    const ax = ccx + spot[0];
    let px = spot[2] === 0 ? ax - 30 : ax + 30 - pw;
    px = clamp(px, 2, f.width - 2 - pw);
    const py = ccy + spot[1] - 13;
    g.save();
    g.translate(px + pw / 2, py + 13);
    g.scale(Math.max(0.01, pop), Math.max(0.01, pop));
    g.fillStyle = mix(c.card, tk.w > 0 ? c.positive : c.negative, 0.16);
    g.beginPath();
    g.roundRect(-pw / 2, -13, pw, 26, 13);
    g.fill();
    if (pop > 0.6) {
      const m = members.find((x) => x.name.trim().toLowerCase() === tk.who.toLowerCase());
      dot(g, -pw / 2 + 13, 0, 9, userColor(m ?? tk.who, th));
      g.font = fitText(tk.who[0]?.toUpperCase() ?? "?", 12, { g, size: 11, weight: 700, family: fam }).font;
      g.textAlign = "center";
      g.fillStyle = c.onPrimary;
      g.fillText(tk.who[0]?.toUpperCase() ?? "?", -pw / 2 + 13, 0.5);
      g.textAlign = "left";
      g.font = tf.font;
      g.fillStyle = c.text;
      g.fillText(tf.text, -pw / 2 + 26, 0.5);
    }
    g.restore();
  });
}

function drawStack(g: CanvasRenderingContext2D, f: DrawFrame, s: State, since: number, members: Member[], drag: number, fly: number | null, active: boolean) {
  const th = f.theme;
  const c = th.color;
  const cw = Math.min(262, f.width - 40);
  const geo: Geo = { cw, left: (f.width - cw) / 2, top: 4 };
  const ccx = geo.left + cw / 2;
  const ccy = geo.top + 125;
  const t = f.now / 1000;
  const lean = clamp(drag / 120, -1, 1);

  for (const k of [2, 1]) {
    if (s.idx + k >= s.profiles.length) continue;
    g.save();
    g.translate(7 * k, 5 * k);
    g.translate(ccx, ccy);
    g.rotate(0.03 * k);
    g.translate(-ccx, -ccy);
    g.fillStyle = mix(c.wash, c.divider, 0.3 * k);
    g.beginPath();
    g.roundRect(geo.left, geo.top, cw, 250, 12);
    g.fill();
    g.restore();
  }

  const prof = s.profiles[s.idx];
  if (prof) {
    g.save();
    g.translate(drag, Math.abs(drag) * 0.05);
    drawCard(g, f, geo, prof, since, members, t);
    if (active && Math.abs(lean) > 0.08) {
      const green = lean > 0;
      const label = green ? "Green flag" : "Red flag";
      g.font = fitText(label, 120, { g, size: 15, weight: 600, family: th.type.family }).font;
      const pw = g.measureText(label).width + 24;
      const px = green ? geo.left + 70 : geo.left + cw - 66;
      g.globalAlpha = clamp01(Math.abs(lean) * 1.4);
      g.fillStyle = green ? c.positive : c.negative;
      g.beginPath();
      g.roundRect(px - pw / 2, geo.top + 40 - 15, pw, 30, 15);
      g.fill();
      g.fillStyle = c.onPrimary;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, px, geo.top + 40.5);
      g.textAlign = "left";
      g.globalAlpha = 1;
    }
    g.restore();
  }

  // the card just rated flies off
  const gone = s.profiles[s.idx - 1];
  if (fly !== null && gone && s.flewDir !== 0) {
    const k2 = easeFly(clamp01((fly / FLY_MS - 0.35) / 0.65) * 1000);
    const off = s.flewDir * 480 * k2;
    g.save();
    g.translate(off, Math.abs(off) * 0.05);
    g.translate(ccx, ccy);
    g.rotate(off * 0.0011);
    g.translate(-ccx, -ccy);
    drawCard(g, f, geo, gone, Infinity, members, t);
    g.restore();
  }
}

function drawMeter(g: CanvasRenderingContext2D, f: DrawFrame, p: Profile, since: number, dir: number) {
  const th = f.theme;
  const c = th.color;
  const W = f.width;
  const t = f.now / 1000;
  const meter = meterAt(p, since, dir);
  const left = 34;
  const bw = W - 68;

  // bar: one fill per segment colour
  const segs = 24;
  const sw = bw / segs;
  for (let i = 0; i < segs; i++) {
    g.fillStyle = mix(c.negative, c.positive, i / (segs - 1));
    g.fillRect(left + i * sw, 11, sw + 0.5, 6);
  }
  dot(g, left, 14, 3, c.negative);
  dot(g, left + bw, 14, 3, c.positive);

  // flags on poles
  g.strokeStyle = c.secondaryText;
  g.lineWidth = 1.5;
  for (const x of [14, W - 20]) {
    g.beginPath();
    g.moveTo(x, 2);
    g.lineTo(x, 24);
    g.stroke();
    const wv = Math.sin(t * 5 + x) * 2;
    g.beginPath();
    g.moveTo(x, 2);
    g.lineTo(x + 13, 6 + wv);
    g.lineTo(x, 11);
    g.closePath();
    g.fillStyle = x < W / 2 ? c.negative : c.positive;
    g.fill();
  }

  // thumb
  const tx = left + (bw * meter) / 100;
  g.globalAlpha = 0.1;
  dot(g, tx, 15, 11, c.text);
  g.globalAlpha = 1;
  dot(g, tx, 14, 11, c.card);
  dot(g, tx, 14, 7, mix(c.negative, c.positive, meter / 100));

  const seen = seenAt(p, since);
  const text = !p.takes.length ? "No takes yet · you go first" : `${seen} ${seen === 1 ? "friend" : "friends"} answered · ${leanWord(meter)}`;
  const tf = fitText(text, W - 20, { g, size: 13, min: 11, family: th.type.family });
  g.font = tf.font;
  g.fillStyle = c.secondaryText;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillText(tf.text, W / 2, 42);
  g.textAlign = "left";
}

function drawBoard(g: CanvasRenderingContext2D, f: DrawFrame, s: State) {
  const th = f.theme;
  const c = th.color;
  const W = f.width;
  const fam = th.type.family;
  const n = s.profiles.length;
  const w = (W - 24) / 3;
  const x0 = (W - (n * w + (n - 1) * 12)) / 2;
  const t = f.now / 1000;
  s.profiles.forEach((p, i) => {
    const k = easeBack(clamp01((f.now - s.flewAt - 150 * i) / 500));
    const x = x0 + i * (w + 12);
    const y = 10 + (1 - Math.min(1, k)) * 40;
    g.save();
    g.globalAlpha = clamp01(k * 1.5);
    g.fillStyle = c.wash;
    g.beginPath();
    g.roundRect(x, y, w, 200, 12);
    g.fill();
    g.save();
    g.beginPath();
    g.roundRect(x, y, w, 130, [12, 12, 0, 0]);
    g.clip();
    portrait(g, th, p.look, x, y, w, 130, t);
    g.restore();
    const nf = fitText(p.name, w - 12, { g, size: 17, weight: 600, min: 12, family: fam });
    g.font = nf.font;
    g.fillStyle = c.text;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(nf.text, x + w / 2, y + 146);
    const green = s.verdicts[i]?.green === true;
    g.fillStyle = green ? c.positive : c.negative;
    g.beginPath();
    g.roundRect(x + 10, y + 162, w - 20, 28, 14);
    g.fill();
    const lf = fitText(green ? "Go out" : "Unmatch", w - 28, { g, size: 13, weight: 600, min: 11, family: fam });
    g.font = lf.font;
    g.fillStyle = c.onPrimary;
    g.fillText(lf.text, x + w / 2, y + 176.5);
    g.restore();
  });
  g.globalAlpha = 1;

  const firstGreen = s.verdicts.findIndex((v) => v.green);
  const line = firstGreen >= 0 ? `Group verdict: ${s.subject}, text ${s.profiles[firstGreen]?.name ?? ""} back` : `Group verdict: delete the app, ${s.subject}`;
  const lf = fitText(line, W, { g, size: 16, weight: 700, min: 12, family: fam });
  g.font = lf.font;
  g.fillStyle = c.text;
  g.textAlign = "left";
  g.fillText(lf.text, 0, 238);
  const who = whoNames(s.profiles[s.profiles.length - 1]!);
  if (who.length) {
    const wf = fitText(`Rated with ${who.join(", ")}`, W, { g, size: 13, min: 11, family: fam });
    g.font = wf.font;
    g.fillStyle = c.secondaryText;
    g.fillText(wf.text, 0, 260);
  }
}

export default defineApp<State, Action, Local>({
  name: "Rate the matches",
  summary: (s) => {
    if (done(s)) {
      const g = s.verdicts.findIndex((v) => v.green);
      return g >= 0 ? `Group verdict: ${s.subject}, text ${s.profiles[g]?.name ?? ""} back` : `Group verdict: delete the app, ${s.subject}`;
    }
    return `Rating ${s.subject}'s matches: ${s.profiles[s.idx]?.name ?? ""} is up, ${s.idx} of ${s.profiles.length} done`;
  },

  init: () => initState(),

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "flag") {
      if (typeof a.green !== "boolean" || done(s)) return s;
      return {
        ...s,
        verdicts: [...s.verdicts, { green: a.green, by: meta.user }],
        idx: s.idx + 1,
        shownAt: meta.time,
        flewAt: meta.time,
        flewDir: a.green ? 1 : -1,
      };
    }
    if (a.t === "again") {
      if (!done(s)) return s;
      return { ...s, idx: 0, verdicts: [], shownAt: meta.time, flewAt: 0, flewDir: 0, rounds: s.rounds + 1 };
    }
    return s;
  },

  invariants: {
    "one verdict per rated card": (s) => Number.isInteger(s.idx) && s.idx >= 0 && s.idx <= s.profiles.length && s.verdicts.length === s.idx,
    "verdicts are flags with a flagger": (s) => s.verdicts.every((v) => typeof v.green === "boolean" && typeof v.by === "string" && v.by !== ""),
    "1 to 3 profiles, takes in range": (s) =>
      s.profiles.length >= 1 &&
      s.profiles.length <= 3 &&
      s.profiles.every((p) => p.takes.length <= 4 && p.takes.every((t) => Number.isInteger(t.w) && t.w >= -20 && t.w <= 20 && Number.isInteger(t.at) && t.at >= 0 && t.at <= 5000)),
    "the last flight matches the last verdict": (s) =>
      s.idx === 0 ? s.flewDir === 0 && s.flewAt === 0 : s.flewDir === (s.verdicts[s.idx - 1]!.green ? 1 : -1) && s.shownAt === s.flewAt,
    "rounds count up": (s) => Number.isInteger(s.rounds) && s.rounds >= 0,
  },

  transitions: {
    "a flag rates the current card for the sender": (p, n, a, m) => {
      if (a.t !== "flag" || p === n) return true;
      const last = n.verdicts[n.verdicts.length - 1];
      return (
        p.idx < p.profiles.length &&
        n.idx === p.idx + 1 &&
        last !== undefined &&
        last.by === m.user &&
        last.green === a.green &&
        JSON.stringify(n.verdicts.slice(0, -1)) === JSON.stringify(p.verdicts) &&
        n.shownAt === m.time
      );
    },
    "again only after the last card, and it clears": (p, n, a, m) =>
      a.t !== "again" || p === n || (p.idx >= p.profiles.length && n.idx === 0 && n.verdicts.length === 0 && n.rounds === p.rounds + 1 && n.shownAt === m.time),
    "the card moves one step forward or back to the start": (p, n) => n.idx === p.idx || n.idx === p.idx + 1 || (n.idx === 0 && p.idx >= p.profiles.length),
    "a flag lands": (p, n, a, m, ctx) =>
      a.t !== "flag" || typeof a.green !== "boolean" || p.idx >= p.profiles.length || !ctx.members.some((x) => x.id === m.user) || n.idx === p.idx + 1,
    "profiles and subject never change": (p, n) => n.subject === p.subject && JSON.stringify(n.profiles) === JSON.stringify(p.profiles),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => {
    if (done(s)) return r.next() < 0.9 ? { t: "again" } : { t: "flag", green: true };
    if (r.next() < 0.05) return { t: "again" };
    return { t: "flag", green: r.next() < 0.5 };
  },

  local: { drag: 0, downX: null, relAt: 0, relFrom: 0 },

  view: ({ state, me, members, dispatch, pending, theme, local, setLocal }) => {
    const W = theme.width - 2 * theme.space.card;
    const n = state.profiles.length;
    const finished = done(state);
    const cur = state.profiles[Math.min(state.idx, n - 1)]!;
    const rated = whoNames(finished ? state.profiles[n - 1]! : cur).length;
    const subtitle = `${Math.min(state.idx + 1, n)} of ${n} · ${rated} ${rated === 1 ? "friend" : "friends"} rated`;
    const sinceNow = (now: number) => (state.shownAt > 0 ? Math.max(0, now - state.shownAt) : Infinity);
    const fly = state.flewAt > 0 ? running(state.flewAt, FLY_MS) : null;
    const flagging = (green: boolean) => {
      if (pending || finished) return;
      dispatch({ t: "flag", green });
      setLocal({ drag: 0, downX: null, relAt: 0, relFrom: 0 });
      haptic("medium");
    };
    const toastOn = finished && state.flewAt > 0 && running(state.flewAt, TOAST_MS) !== null;
    const anyGreen = state.verdicts.some((v) => v.green);

    if (finished) {
      const names = state.profiles.map((p, i) => `${p.name} ${state.verdicts[i]?.green ? "go out" : "unmatch"}`).join(", ");
      return (
        <div>
          <CardHeader title={`Rate ${state.subject}'s matches`} subtitle={subtitle} />
          <div style={{ marginTop: 2 }}>
            <Canvas
              height={280}
              label={`Verdicts: ${names}`}
              draw={(g, f) => {
                drawBoard(g, f, state);
                return state.flewAt > 0 && f.now - state.flewAt < 1200;
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", height: 48 }}>
            <div style={{ width: 150 }}>
              <Button kind="primary" wide disabled={pending} onClick={() => dispatch({ t: "again" })}>
                Rate again
              </Button>
            </div>
          </div>
          {toastOn ? <Toast key={state.flewAt}>{anyGreen ? `It's a date, ${state.subject}` : `Verdict sent to ${state.subject}`}</Toast> : null}
        </div>
      );
    }

    const active = !pending;
    const takes = cur.takes.length;
    const bw = Math.min(128, Math.floor((W - 64) / 2));

    return (
      <div>
        <CardHeader title={`Rate ${state.subject}'s matches`} subtitle={subtitle} />
        <div style={{ marginTop: 2 }}>
          <Canvas
            height={262}
            drag
            label={`${cur.name}${cur.age ? `, ${cur.age}` : ""}: ${takes} ${takes === 1 ? "take" : "takes"}, ${leanWord(meterAt(cur, Infinity, 0))}`}
            onPointer={(ev) => {
              if (!active) return;
              if (ev.type === "down") setLocal({ downX: ev.x, drag: 0, relAt: 0 });
              else if (ev.type === "move") {
                if (local.downX !== null) setLocal({ drag: ev.x - local.downX });
              } else if (ev.type === "up") {
                const d = local.drag;
                if (Math.abs(d) > 80) flagging(d > 0);
                else setLocal({ drag: 0, downX: null, relAt: clock.value, relFrom: d });
              }
            }}
            draw={(g, f) => {
              const held = local.downX !== null;
              const back = !held && local.relAt > 0 ? f.now - local.relAt : Infinity;
              const springing = back < 900;
              const drag = held ? local.drag : springing ? local.relFrom * (1 - settle(Math.min(back, settle.duration))) : 0;
              const since = sinceNow(f.now);
              drawStack(g, f, state, since, members, drag, fly === null ? null : f.now - state.flewAt, active);
              return held || springing || since < 3000 || fly !== null;
            }}
          />
        </div>
        <Canvas
          height={44}
          label={`Flag meter: ${leanWord(meterAt(cur, Infinity, 0))}`}
          draw={(g, f) => {
            const since = sinceNow(f.now);
            const held = local.downX !== null && Math.abs(local.drag) / 120 > 0.08;
            drawMeter(g, f, cur, since, held ? Math.sign(local.drag) : 0);
            return since < 3000 || held;
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 40 }}>
          <div style={{ width: bw }}>
            <Button kind="secondary" wide disabled={pending} onClick={() => flagging(false)}>
              Red flag
            </Button>
          </div>
          <span style={{ fontSize: 13, lineHeight: "16px", color: theme.color.secondaryText }}>or swipe</span>
          <div style={{ width: bw }}>
            <Button kind="secondary" wide disabled={pending} onClick={() => flagging(true)}>
              Green flag
            </Button>
          </div>
        </div>
        <span hidden>{me}</span>
      </div>
    );
  },
});
