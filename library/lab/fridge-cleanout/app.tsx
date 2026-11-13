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
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Meta,
} from "@muse/app";

// Fridge cleanout: "something in the fridge is alive". The fridge stands open on three shelves of
// leftovers; the old ones grow fuzz, then eyes, then little arms. Each owner taps theirs: eat
// tonight or toss. Tossed things drop into the bag; anything unclaimed goes at the deadline.

type Params = {
  /** Card title: "Fridge cleanout" */
  title: string;
  /** When unclaimed things get tossed: "Sun 9pm" */
  deadline: string;
  /** Up to 12 leftovers. kind: takeout, tub, cup, foil, jar, carton, slice, bowl. owner: a name or "" if nobody knows. days: how old. fate: "eat" or "toss" if already decided. */
  items: { owner: string; label: string; kind: string; days: number; fate?: string }[];
  /** The chat's lines about it, newest last */
  said: { who: string; said: string }[];
};

// @params
const P: Params = {
  title: "Fridge cleanout",
  deadline: "Sun 9pm",
  items: [
    { owner: "Will", label: "pad thai", kind: "takeout", days: 9 },
    { owner: "Arun", label: "rice cooker biryani", kind: "tub", days: 6 },
    { owner: "Calvin", label: "yogurt", kind: "cup", days: 3 },
    { owner: "Aditya", label: "half a burrito", kind: "foil", days: 5 },
    { owner: "Maya", label: "meal prep (blue lid)", kind: "tub", days: 2, fate: "eat" },
    { owner: "Tsai Lin", label: "Golden Lantern dumplings", kind: "takeout", days: 4, fate: "eat" },
    { owner: "", label: "the jar", kind: "jar", days: 14 },
    { owner: "Will", label: "milk", kind: "carton", days: 11 },
    { owner: "Calvin", label: "Rook's slice", kind: "slice", days: 7, fate: "toss" },
    { owner: "Arun", label: "more rice", kind: "bowl", days: 8 },
  ],
  said: [
    { who: "Maya", said: "something in the fridge is alive" },
    { who: "Will", said: "the pad thai is fine. it's aging" },
  ],
};
// @end params

const KINDS = ["takeout", "tub", "cup", "foil", "jar", "carton", "slice", "bowl"] as const;
type Kind = (typeof KINDS)[number];
type Fate = "" | "eat" | "toss";
type Item = { id: string; kind: Kind; label: string; owner: string; name: string; days: number; fate: Fate; by: string; at: number };
type State = { title: string; deadline: string; said: { name: string; said: string }[]; items: Item[]; swept: boolean; sweptAt: number };
type Action = { t: "fate"; id: string; fate: string } | { t: "claim"; id: string } | { t: "undo"; id: string } | { t: "sweep" };
type Local = { sel: string; toast: number; msg: string };

const H = 250;
const PER = 4;
const DROP = 800;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isKind = (k: unknown): k is Kind => typeof k === "string" && (KINDS as readonly string[]).includes(k);
const nobody = (o: string) => o === "" || o.startsWith("?");
const first = (n: string) => n.split(" ")[0] ?? n;
const nameIn = (members: readonly Member[], id: string, fb: string) => members.find((m) => m.id === id)?.name ?? fb;
const open = (s: State) => s.items.filter((i) => i.fate === "");
const tossed = (s: State) => s.items.filter((i) => i.fate === "toss");

function initState(ctx: Ctx): State {
  const items: Item[] = [];
  for (const raw of Array.isArray(P.items) ? P.items : []) {
    if (items.length >= 12) break;
    const label = clean(raw?.label, 28);
    if (!label) continue;
    const who = clean(raw?.owner, 24);
    const m = who ? ctx.members.find((x) => x.id === who || x.name.toLowerCase() === who.toLowerCase()) : undefined;
    const owner = m ? m.id : who ? `?${who.toLowerCase()}` : "";
    const days = Number.isInteger(raw?.days) ? Math.max(0, Math.min(99, raw.days)) : 1;
    const fate: Fate = raw?.fate === "eat" || raw?.fate === "toss" ? raw.fate : "";
    items.push({ id: `f${items.length}`, kind: isKind(raw?.kind) ? raw.kind : "tub", label, owner, name: m ? m.name : who, days, fate, by: fate ? owner : "", at: 0 });
  }
  const said = (Array.isArray(P.said) ? P.said : []).map((x) => ({ name: clean(x?.who, 20), said: clean(x?.said, 60) })).filter((x) => x.name && x.said).slice(-3);
  return { title: clean(P.title, 30) || "Fridge cleanout", deadline: clean(P.deadline, 16) || "Sunday", said, items, swept: false, sweptAt: 0 };
}

function reduceFridge(s: State, a: Action, meta: Meta, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u)) return s;
  const find = (id: unknown) => (typeof id === "string" ? s.items.find((x) => x.id === id) : undefined);
  const put = (id: string, f: (i: Item) => Item) => ({ ...s, items: s.items.map((x) => (x.id === id ? f(x) : x)) });
  if (a.t === "fate") {
    const it = find(a.id);
    if (!it || it.owner !== u || it.fate !== "" || (a.fate !== "eat" && a.fate !== "toss")) return s;
    const fate = a.fate;
    return put(it.id, (x) => ({ ...x, fate, by: u, at: meta.time }));
  }
  if (a.t === "claim") {
    const it = find(a.id);
    if (!it || !nobody(it.owner) || it.fate !== "") return s;
    const name = ctx.members.find((m) => m.id === u)?.name ?? "";
    return put(it.id, (x) => ({ ...x, owner: u, name }));
  }
  if (a.t === "undo") {
    const it = find(a.id);
    if (!it || it.owner !== u || it.fate === "" || it.by !== u || s.swept) return s;
    return put(it.id, (x) => ({ ...x, fate: "", by: "", at: 0 }));
  }
  if (a.t === "sweep") {
    if (s.swept || !open(s).length) return s;
    return { ...s, swept: true, sweptAt: meta.time, items: s.items.map((x) => (x.fate === "" ? { ...x, fate: "toss", by: "", at: meta.time } : x)) };
  }
  return s;
}

type Spot = { it: Item; x: number; y: number; w: number; h: number };

function spots(s: State, W: number): Spot[] {
  const fw = W * 0.72;
  const sw = (fw - 20) / PER;
  return s.items.map((it, i) => {
    const shelf = Math.floor(i / PER);
    const col = i % PER;
    const base = 84 + shelf * 80;
    return { it, x: 10 + sw * col + sw / 2, y: base, w: Math.min(58, sw - 6), h: 44 };
  });
}

function drawItem(g: CanvasRenderingContext2D, sp: Spot, f: DrawFrame, lid: string) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const { w } = sp;
  const k = sp.it.kind;
  const ink = mix(c.text, c.card, t.mode === "dark" ? 0.3 : 0.35);
  g.lineWidth = 1.5;
  g.strokeStyle = ink;
  g.beginPath();
  let top = -30;
  if (k === "takeout") {
    g.moveTo(-w * 0.42, -34);
    g.lineTo(w * 0.42, -34);
    g.lineTo(w * 0.32, 0);
    g.lineTo(-w * 0.32, 0);
    g.closePath();
    g.fillStyle = p.paper;
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-w * 0.2, -34);
    g.quadraticCurveTo(0, -48, w * 0.2, -34);
    g.stroke();
    g.fillStyle = p.red;
    g.beginPath();
    g.ellipse(0, -18, 6, 6, 0, 0, Math.PI * 2);
    g.fill();
    top = -34;
  } else if (k === "tub" || k === "bowl") {
    const hh = k === "tub" ? 26 : 20;
    g.roundRect(-w / 2, -hh, w, hh, k === "tub" ? 4 : [2, 2, 12, 12]);
    g.fillStyle = mix(p.sky, c.card, 0.35);
    g.fill();
    g.stroke();
    g.fillStyle = k === "tub" ? lid : p.cream;
    g.beginPath();
    g.roundRect(-w / 2 - 2, -hh - 6, w + 4, 7, 3);
    g.fill();
    g.stroke();
    top = -hh - 6;
  } else if (k === "cup") {
    g.moveTo(-w * 0.3, -32);
    g.lineTo(w * 0.3, -32);
    g.lineTo(w * 0.24, 0);
    g.lineTo(-w * 0.24, 0);
    g.closePath();
    g.fillStyle = p.paper;
    g.fill();
    g.stroke();
    g.fillStyle = p.purple;
    g.fillRect(-w * 0.27, -22, w * 0.53, 8);
    top = -32;
  } else if (k === "foil") {
    g.moveTo(-w / 2, 0);
    g.lineTo(-w / 2 + 4, -14);
    g.quadraticCurveTo(-w / 4, -26, 0, -20);
    g.quadraticCurveTo(w / 4, -28, w / 2 - 4, -14);
    g.lineTo(w / 2, 0);
    g.closePath();
    g.fillStyle = mix(c.secondaryText, c.card, 0.55);
    g.fill();
    g.stroke();
    g.strokeStyle = c.card;
    g.beginPath();
    g.moveTo(-w / 4, -8);
    g.lineTo(-w / 8, -16);
    g.moveTo(w / 6, -6);
    g.lineTo(w / 4, -15);
    g.stroke();
    top = -24;
  } else if (k === "jar") {
    g.roundRect(-w * 0.28, -36, w * 0.56, 36, 6);
    g.fillStyle = mix(p.leaf, c.card, 0.35);
    g.fill();
    g.stroke();
    g.fillStyle = p.brown;
    g.beginPath();
    g.roundRect(-w * 0.3, -42, w * 0.6, 8, 2);
    g.fill();
    top = -42;
  } else if (k === "carton") {
    g.moveTo(-w * 0.26, 0);
    g.lineTo(-w * 0.26, -32);
    g.lineTo(0, -44);
    g.lineTo(w * 0.26, -32);
    g.lineTo(w * 0.26, 0);
    g.closePath();
    g.fillStyle = p.paper;
    g.fill();
    g.stroke();
    g.fillStyle = p.blue;
    g.fillRect(-w * 0.26, -22, w * 0.52, 9);
    top = -44;
  } else {
    // slice
    g.moveTo(-w / 2, 0);
    g.lineTo(w / 2, 0);
    g.lineTo(w / 2 - 6, -10);
    g.closePath();
    g.fillStyle = p.yellow;
    g.fill();
    g.stroke();
    g.fillStyle = p.crust;
    g.fillRect(w / 2 - 6, -10, 6, 10);
    g.fillStyle = p.red;
    g.beginPath();
    g.arc(-4, -3, 2.5, 0, Math.PI * 2);
    g.arc(10, -4, 2.5, 0, Math.PI * 2);
    g.fill();
    top = -12;
  }
  return top;
}

function drawLife(g: CanvasRenderingContext2D, days: number, top: number, w: number, now: number, seed: number, f: DrawFrame) {
  const c = f.theme.color;
  const p = pal(f.theme);
  if (days < 4) return;
  // fuzz: more blobs, older food
  const n = Math.min(9, days - 2);
  g.fillStyle = mix(p.green, c.card, f.theme.mode === "dark" ? 0.1 : 0.25);
  g.beginPath();
  for (let k = 0; k < n; k++) {
    const fx = (((k * 37 + seed) % 100) / 100 - 0.5) * w * 0.8;
    const fy = top + 2 - ((k * 13 + seed) % 7);
    const r = 3 + ((k + seed) % 3);
    g.moveTo(fx + r, fy);
    g.arc(fx, fy, r, 0, Math.PI * 2);
  }
  g.fill();
  if (days < 7) return;
  // eyes, with a slow blink
  const blink = Math.sin(now / 900 + seed) > 0.96 ? 0.2 : 1;
  const ey = top + 14;
  g.fillStyle = c.card;
  g.beginPath();
  g.ellipse(-6, ey, 4.5, 5 * blink, 0, 0, Math.PI * 2);
  g.ellipse(6, ey, 4.5, 5 * blink, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.text;
  g.beginPath();
  g.arc(-5.5, ey + 0.5, 2, 0, Math.PI * 2);
  g.arc(6.5, ey + 0.5, 2, 0, Math.PI * 2);
  g.fill();
  if (days < 9) return;
  // little arms, waving
  const wave = Math.sin(now / 220 + seed) * 0.5;
  g.strokeStyle = mix(p.green, c.text, 0.25);
  g.lineWidth = 2.5;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(-w * 0.36, top + 18);
  g.lineTo(-w * 0.36 - 9 * Math.cos(0.6 + wave), top + 18 - 11 * Math.sin(0.9 + wave));
  g.moveTo(w * 0.36, top + 18);
  g.lineTo(w * 0.36 + 8, top + 10);
  g.stroke();
  g.lineCap = "butt";
}

function drawFridge(g: CanvasRenderingContext2D, f: DrawFrame, s: State, sel: string, me: string, members: readonly Member[], ctx: Ctx) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const W = f.width;
  const now = f.now;
  const dark = t.mode === "dark";
  const fw = W * 0.72;
  const body = dark ? mix(c.card, c.text, 0.16) : mix(c.secondaryText, c.card, 0.78);
  const inside = dark ? mix(c.wash, p.sky, 0.12) : mix(p.sky, c.card, 0.55);
  g.fillStyle = body;
  g.beginPath();
  g.roundRect(0, 0, fw, H, 14);
  g.fill();
  g.fillStyle = inside;
  g.beginPath();
  g.roundRect(6, 6, fw - 12, H - 12, 9);
  g.fill();
  // fridge light glow
  g.fillStyle = mix(inside, c.card, 0.5);
  g.beginPath();
  g.ellipse(fw / 2, 10, fw * 0.3, 6, 0, 0, Math.PI * 2);
  g.fill();
  // shelves
  g.fillStyle = mix(inside, c.primary, 0.18);
  for (let k = 0; k < 3; k++) g.fillRect(6, 84 + k * 80, fw - 12, 4);
  // the open door, angled
  const dx = fw + 8;
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(dx, 4);
  g.lineTo(W - 2, 18);
  g.lineTo(W - 2, H * 0.62);
  g.lineTo(dx, H * 0.7);
  g.closePath();
  g.fill();
  g.fillStyle = inside;
  g.beginPath();
  g.moveTo(dx + 6, 12);
  g.lineTo(W - 8, 24);
  g.lineTo(W - 8, H * 0.6);
  g.lineTo(dx + 6, H * 0.66);
  g.closePath();
  g.fill();
  // door bottles
  const dw = W - dx;
  for (const [k, col] of [[0, p.red], [1, p.yellow], [2, p.green]] as const) {
    const bx = dx + 10 + k * (dw - 20) / 3 + 4;
    g.fillStyle = col;
    g.beginPath();
    g.roundRect(bx, 50 - k * 1.5, 10, 26, 3);
    g.roundRect(bx + 2.5, 42 - k * 1.5, 5, 9, 1);
    g.fill();
  }
  g.fillStyle = mix(inside, c.primary, 0.18);
  g.fillRect(dx + 6, 78, dw - 14, 3);
  // deadline magnet note
  g.save();
  g.translate(dx + dw / 2, 112);
  g.rotate(0.06);
  g.fillStyle = p.cream;
  g.fillRect(-dw * 0.38, -15, dw * 0.76, 30);
  g.fillStyle = p.red;
  g.beginPath();
  g.arc(0, -15, 3.5, 0, Math.PI * 2);
  g.fill();
  const dl = fitText(s.deadline, dw * 0.7, { g, size: 13, min: 9, weight: 700 });
  g.font = dl.font;
  g.fillStyle = dark ? c.card : c.text;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(dl.text, 0, 2);
  g.restore();
  // trash bag, swelling with every toss
  const bagN = tossed(s).filter((i) => !(i.at > 0 && now - i.at < DROP)).length;
  const bw = Math.min(dw - 6, 34 + bagN * 4);
  const bcx = dx + dw / 2;
  const bt = H - 8 - Math.min(64, 36 + bagN * 4);
  g.fillStyle = dark ? mix(c.text, c.card, 0.65) : mix(c.text, c.card, 0.18);
  g.beginPath();
  g.moveTo(bcx - 6, bt);
  g.quadraticCurveTo(bcx - bw / 2 - 6, bt + 12, bcx - bw / 2, H - 10);
  g.quadraticCurveTo(bcx, H - 2, bcx + bw / 2, H - 10);
  g.quadraticCurveTo(bcx + bw / 2 + 6, bt + 12, bcx + 6, bt);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(bcx - 6, bt);
  g.lineTo(bcx - 9, bt - 8);
  g.lineTo(bcx, bt - 3);
  g.lineTo(bcx + 9, bt - 8);
  g.lineTo(bcx + 6, bt);
  g.fill();
  if (bagN > 0) {
    g.fillStyle = dark ? c.text : c.card;
    g.font = `700 13px ${t.type.family}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(bagN), bcx, (bt + H - 6) / 2 + 2);
  }

  // containers
  let busy = false;
  for (const sp of spots(s, W)) {
    const it = sp.it;
    const falling = it.fate === "toss" && it.at > 0 && now - it.at < DROP && now >= it.at;
    if (it.fate === "toss" && !falling) {
      g.strokeStyle = mix(inside, c.text, 0.18);
      g.setLineDash([4, 3]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.roundRect(sp.x - sp.w / 2, sp.y - 30, sp.w, 30, 5);
      g.stroke();
      g.setLineDash([]);
      continue;
    }
    let x = sp.x;
    let y = sp.y;
    let rot = 0;
    let alpha = 1;
    if (falling) {
      busy = true;
      const q = (now - it.at) / DROP;
      x = sp.x + (bcx - sp.x) * q;
      y = sp.y - 40 * Math.sin(q * Math.PI) + (bt + 20 - sp.y) * q * q;
      rot = q * 2.4;
      alpha = 1 - q * q;
    }
    const seed = (Number(it.id.replace(/\D/g, "")) * 17) % 97;
    const wob = it.days >= 9 && !falling ? Math.sin(now / 260 + seed) * 0.05 : 0;
    if (it.days >= 9) busy = true;
    g.save();
    g.translate(x, y);
    g.rotate(rot + wob);
    g.globalAlpha = alpha;
    const lid = nobody(it.owner) ? c.secondaryText : userColor(it.owner, t);
    const top = drawItem(g, sp, f, lid);
    if (it.fate !== "eat") drawLife(g, it.days, top, sp.w, now, seed, f);
    if (it.fate === "eat") {
      // a fork stuck in it: dinner tonight
      g.strokeStyle = c.text;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(sp.w * 0.18, top + 4);
      g.lineTo(sp.w * 0.32, top - 16);
      g.moveTo(sp.w * 0.29, top - 14);
      g.lineTo(sp.w * 0.27, top - 22);
      g.moveTo(sp.w * 0.35, top - 12);
      g.lineTo(sp.w * 0.37, top - 20);
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
    if (falling) continue;
    // selection
    if (it.id === sel) {
      g.strokeStyle = c.primary;
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(sp.x - sp.w / 2 - 3, sp.y - 52, sp.w + 6, 56, 7);
      g.stroke();
    }
    // day badge
    const old = it.days >= 7 && it.fate !== "eat";
    const label = it.fate === "eat" ? "tonight" : `day ${it.days}`;
    g.font = `600 10px ${t.type.family}`;
    const tw = g.measureText(label).width + 10;
    g.fillStyle = old ? c.negative : it.fate === "eat" ? c.positive : c.card;
    g.beginPath();
    g.roundRect(sp.x - tw / 2, sp.y - 76 + 6, tw, 15, 7.5);
    g.fill();
    g.fillStyle = old || it.fate === "eat" ? (dark ? c.wash : c.onPrimary) : c.text;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, sp.x, sp.y - 62.5 + 0.5);
    // owner face at the foot
    const fx = sp.x - sp.w / 2 + 6;
    const fy = sp.y - 6;
    g.beginPath();
    g.arc(fx, fy, 8, 0, Math.PI * 2);
    g.fillStyle = nobody(it.owner) ? c.secondaryButton : userColor(it.owner, t);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = c.card;
    g.stroke();
    g.fillStyle = nobody(it.owner) ? c.secondaryButtonText : c.onPrimary;
    g.font = `700 9px ${t.type.family}`;
    g.fillText(nobody(it.owner) ? "?" : (nameIn(members, it.owner, it.name)[0] ?? "?").toUpperCase(), fx, fy + 0.5);
    void me;
    void ctx;
  }
  return busy;
}

export default defineApp<State, Action, Local>({
  name: "Fridge cleanout",
  summary: (s) => {
    const left = open(s).length;
    if (s.swept || !left) return `${s.title}: fridge clear · ${tossed(s).length} tossed`;
    return `${s.title}: ${left} unclaimed · tossed at ${s.deadline}`;
  },
  init: initState,
  reduce: reduceFridge,

  invariants: {
    "item ids are unique": (s) => new Set(s.items.map((i) => i.id)).size === s.items.length,
    "fates are eat, toss or open": (s) => s.items.every((i) => i.fate === "" || i.fate === "eat" || i.fate === "toss"),
    "an open item has no decider": (s) => s.items.every((i) => i.fate !== "" || (i.by === "" && i.at === 0)),
    "a swept fridge has nothing open": (s) => !s.swept || open(s).length === 0,
    "days are whole": (s) => s.items.every((i) => Number.isInteger(i.days) && i.days >= 0),
  },

  transitions: {
    "only the owner decides, once": (p, n, a, m) => {
      if (a.t !== "fate" || p === n) return true;
      const b = p.items.find((i) => i.id === a.id);
      const x = n.items.find((i) => i.id === a.id);
      return !!b && !!x && b.owner === m.user && b.fate === "" && x.fate === a.fate && x.by === m.user && x.at === m.time;
    },
    "a decision changes one item": (p, n, a) =>
      (a.t !== "fate" && a.t !== "claim" && a.t !== "undo") || p === n || n.items.filter((x, i) => JSON.stringify(x) !== JSON.stringify(p.items[i])).length === 1,
    "claiming takes a nobody's item": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const b = p.items.find((i) => i.id === a.id);
      const x = n.items.find((i) => i.id === a.id);
      return !!b && !!x && nobody(b.owner) && x.owner === m.user && x.fate === "";
    },
    "undo reopens your own decision": (p, n, a, m) => {
      if (a.t !== "undo" || p === n) return true;
      const b = p.items.find((i) => i.id === a.id);
      const x = n.items.find((i) => i.id === a.id);
      return !!b && !!x && b.by === m.user && b.fate !== "" && x.fate === "" && !p.swept;
    },
    "the sweep tosses only what's open": (p, n, a, m) =>
      a.t !== "sweep" || p === n || (n.swept && n.sweptAt === m.time && n.items.every((x, i) => (p.items[i]!.fate === "" ? x.fate === "toss" && x.at === m.time : JSON.stringify(x) === JSON.stringify(p.items[i])))),
    "the sweep is final": (p, n) => !p.swept || (n.swept && n.sweptAt === p.sweptAt),
    "items never vanish": (p, n) => n.items.length === p.items.length,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const mine = s.items.filter((i) => i.owner === user && i.fate === "");
    const orphans = s.items.filter((i) => nobody(i.owner) && i.fate === "");
    const decided = s.items.filter((i) => i.by === user && i.fate !== "");
    const x = r.next();
    if (mine.length && x < 0.55) return { t: "fate", id: r.pick(mine).id, fate: r.next() < 0.5 ? "eat" : "toss" };
    if (orphans.length && x < 0.7) return { t: "claim", id: r.pick(orphans).id };
    if (decided.length && x < 0.85) return { t: "undo", id: r.pick(decided).id };
    if (x < 0.93) return { t: "sweep" };
    return s.items.length ? { t: "fate", id: r.pick(s.items).id, fate: "toss" } : null;
  },

  local: { sel: "", toast: 0, msg: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const ctx: Ctx = { room: "", members };
    const W = theme.width - 2 * theme.space.card;
    const mineOpen = state.items.filter((i) => i.owner === me && i.fate === "");
    const picked = state.items.find((i) => i.id === local.sel && (i.fate === "" || i.by === me)) ?? mineOpen[0] ?? null;
    const left = open(state);
    const owner = (i: Item) => (nobody(i.owner) ? "Nobody's" : i.owner === me ? "Your" : `${first(nameIn(members, i.owner, i.name))}'s`);
    const lastSaid = state.said[state.said.length - 1];

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "up") return;
      const hit = spots(state, W).find((sp) => Math.abs(e.x - sp.x) <= sp.w / 2 + 4 && e.y <= sp.y + 4 && e.y >= sp.y - 70 && sp.it.fate !== "toss");
      if (hit) setLocal({ sel: hit.it.id });
    };
    const decide = (it: Item, fate: "eat" | "toss") => {
      haptic(fate === "toss" ? "medium" : "light");
      dispatch({ t: "fate", id: it.id, fate });
      setLocal({ sel: "", toast: local.toast + 1, msg: fate === "toss" ? `Tossed: ${it.label}` : `Dinner tonight: ${it.label}` });
    };

    let bar;
    if (state.swept || !left.length) {
      bar = (
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: c.positive, flex: "none" }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`Fridge clear · ${tossed(state).length} tossed`}</span>
        </div>
      );
    } else if (picked && picked.owner === me && picked.fate === "") {
      bar = [
        <span key="l" style={{ flex: 1, minWidth: 0, fontSize: 15, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <b>{picked.label}</b>
          <span style={{ color: c.secondaryText }}>{` · day ${picked.days}`}</span>
        </span>,
        <Button key="e" kind="secondary" onClick={() => decide(picked, "eat")}>Eat tonight</Button>,
        <Button key="t" kind="primary" onClick={() => decide(picked, "toss")}>Toss</Button>,
      ];
    } else if (picked && picked.by === me && picked.fate !== "") {
      bar = [
        <span key="l" style={{ flex: 1, minWidth: 0, fontSize: 15, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${picked.label} · ${picked.fate === "eat" ? "tonight" : "tossed"}`}</span>,
        <Button key="u" kind="secondary" onClick={() => { dispatch({ t: "undo", id: picked.id }); setLocal({ sel: "" }); }}>Undo</Button>,
      ];
    } else if (picked && nobody(picked.owner) && picked.fate === "") {
      bar = [
        <span key="l" style={{ flex: 1, minWidth: 0, fontSize: 15, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <b>{picked.label}</b>
          <span style={{ color: c.secondaryText }}>{` · day ${picked.days} · whose?`}</span>
        </span>,
        <Button key="c" kind="primary" onClick={() => { dispatch({ t: "claim", id: picked.id }); setLocal({ sel: picked.id }); }}>It's mine</Button>,
      ];
    } else {
      bar = [
        <span key="l" style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {picked ? `${owner(picked)} ${picked.label} · day ${picked.days}` : `${left.length} unclaimed · gone ${state.deadline}`}
        </span>,
        <Button key="s" kind="secondary" onClick={() => { haptic("medium"); dispatch({ t: "sweep" }); setLocal({ toast: local.toast + 1, msg: `Tossed ${left.length}` }); }}>Toss the rest</Button>,
      ];
    }

    const waiting = [...new Set(left.filter((i) => !nobody(i.owner)).map((i) => i.owner))];
    const ancient = [...state.items].filter((i) => i.fate === "").sort((a, b) => b.days - a.days)[0];

    return (
      <div>
        <CardHeader title={state.title} subtitle={lastSaid ? `${lastSaid.name}: “${lastSaid.said}”` : `Unclaimed gets tossed ${state.deadline}`} />
        <Canvas
          height={H}
          label={`Open fridge with ${state.items.length} leftovers; ${left.length} undecided${ancient ? `, oldest is ${owner(ancient).toLowerCase()} ${ancient.label} at day ${ancient.days}` : ""}`}
          draw={(g, f) => drawFridge(g, f, state, picked ? picked.id : "", me, members, ctx)}
          onPointer={onPointer}
        />
        <div style={{ marginTop: 8, height: 22, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: c.secondaryText, overflow: "hidden", whiteSpace: "nowrap" }}>
          {waiting.length ? waiting.slice(0, 5).map((u) => (inChat(ctx, u) ? <Avatar key={u} user={u} size={20} /> : null)) : null}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {state.swept || !left.length ? `Cleaned out · ${state.items.filter((i) => i.fate === "eat").length} saved for dinner` : waiting.length ? `still deciding · the rest goes ${state.deadline}` : `Unclaimed goes ${state.deadline}`}
          </span>
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>{bar}</div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
