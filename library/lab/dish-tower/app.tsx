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

// Dish tower: the sink drawn as a leaning tower of dishes, each tagged with its owner. Tap your own
// to wash them off the stack; the tower straightens as it shrinks. An empty sink gets a faucet
// sparkle. Tap someone else's to nudge them.

type Params = {
  /** Card title: "The sink" */
  title: string;
  /** Under the title: the chat's own line about it */
  sub: string;
  /** The pile, bottom first. kind: pot, pan, plate, bowl, mug, glass. owner: a name, or "" for nobody's. */
  dishes: { owner: string; kind: string; label?: string; done?: boolean }[];
  /** What people said about it, newest last */
  said: { who: string; said: string }[];
};

// @params
const P: Params = {
  title: "The sink",
  sub: "“whose bowl is this” ×5 since Sunday",
  dishes: [
    { owner: "Arun", kind: "pot", label: "rice cooker pot" },
    { owner: "Will", kind: "pan", label: "egg pan" },
    { owner: "Calvin", kind: "plate" },
    { owner: "Aditya", kind: "bowl", label: "cereal bowl" },
    { owner: "Arun", kind: "plate" },
    { owner: "Will", kind: "mug" },
    { owner: "Calvin", kind: "bowl" },
    { owner: "Aditya", kind: "glass" },
    { owner: "Arun", kind: "bowl", label: "the bowl" },
    { owner: "", kind: "mug", label: "mystery mug" },
    { owner: "Maya", kind: "bowl", label: "tupperware", done: true },
  ],
  said: [
    { who: "Calvin", said: "whose bowl is this" },
    { who: "Arun", said: "the pot is soaking. it's a process" },
  ],
};
// @end params

const KINDS = ["pot", "pan", "plate", "bowl", "mug", "glass"] as const;
type Kind = (typeof KINDS)[number];
type Dish = { id: string; kind: Kind; owner: string; name: string; label: string; washed: string; at: number };
type State = { title: string; sub: string; said: { name: string; said: string }[]; dishes: Dish[]; nudges: Record<string, number>; adds: number };
type Action = { t: "wash"; id: string } | { t: "washMine" } | { t: "nudge"; id: string } | { t: "add"; kind: string };
type Local = { toast: number; msg: string };

const MAX = 14;
const H = 236;
const FLOOR = 214;
const LEAVE = 760;
const SIZE: Record<Kind, [number, number]> = { pot: [118, 40], pan: [104, 15], plate: [112, 9], bowl: [84, 24], mug: [46, 28], glass: [34, 34] };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isKind = (k: unknown): k is Kind => typeof k === "string" && (KINDS as readonly string[]).includes(k);
const pile = (s: State) => s.dishes.filter((d) => d.washed === "");
const canWash = (d: Dish, user: string, ctx: Ctx) => d.washed === "" && (d.owner === user || !inChat(ctx, d.owner));
const nameIn = (members: readonly Member[], id: string, fallback: string) => members.find((m) => m.id === id)?.name ?? fallback;
const first = (n: string) => n.split(" ")[0] ?? n;

function initState(ctx: Ctx): State {
  const dishes: Dish[] = [];
  for (const raw of Array.isArray(P.dishes) ? P.dishes : []) {
    if (dishes.length >= MAX + 4) break;
    const kind = isKind(raw?.kind) ? raw.kind : "plate";
    const who = clean(raw?.owner, 24);
    const m = who ? ctx.members.find((x) => x.id === who || x.name.toLowerCase() === who.toLowerCase()) : undefined;
    const owner = m ? m.id : who ? `?${who.toLowerCase()}` : "?";
    const done = raw?.done === true;
    if (!done && pile({ dishes } as State).length >= MAX) continue;
    dishes.push({ id: `d${dishes.length}`, kind, owner, name: m ? m.name : who || "Nobody", label: clean(raw?.label, 22) || kind, washed: done ? owner : "", at: 0 });
  }
  const said = (Array.isArray(P.said) ? P.said : []).map((x) => ({ name: clean(x?.who, 20), said: clean(x?.said, 60) })).filter((x) => x.name && x.said).slice(-3);
  return { title: clean(P.title, 30) || "The sink", sub: clean(P.sub, 60), said, dishes, nudges: {}, adds: 0 };
}

function reduceSink(s: State, a: Action, meta: Meta, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u)) return s;
  if (a.t === "wash") {
    if (typeof a.id !== "string") return s;
    const d = s.dishes.find((x) => x.id === a.id);
    if (!d || !canWash(d, u, ctx)) return s;
    return { ...s, dishes: s.dishes.map((x) => (x.id === d.id ? { ...x, washed: u, at: meta.time } : x)) };
  }
  if (a.t === "washMine") {
    if (!s.dishes.some((x) => x.washed === "" && x.owner === u)) return s;
    return { ...s, dishes: s.dishes.map((x) => (x.washed === "" && x.owner === u ? { ...x, washed: u, at: meta.time } : x)) };
  }
  if (a.t === "nudge") {
    if (typeof a.id !== "string") return s;
    const d = s.dishes.find((x) => x.id === a.id);
    if (!d || d.washed !== "" || d.owner === u || !inChat(ctx, d.owner)) return s;
    return { ...s, nudges: { ...s.nudges, [d.owner]: (s.nudges[d.owner] ?? 0) + 1 } };
  }
  if (a.t === "add") {
    if (!isKind(a.kind) || pile(s).length >= MAX) return s;
    const name = ctx.members.find((m) => m.id === u)?.name ?? "Someone";
    // Washed dishes leave the record once the pile turns over, so the state stays small.
    const kept = s.dishes.filter((d) => d.washed === "" || d.at === 0 || s.dishes.length < 24);
    return { ...s, adds: s.adds + 1, dishes: [...kept, { id: `n${meta.seq}`, kind: a.kind, owner: u, name, label: a.kind, washed: "", at: 0 }] };
  }
  return s;
}

type Slot = { d: Dish; x: number; y: number; w: number; h: number; rot: number; leave: number };

function layout(s: State, now: number, width: number): Slot[] {
  const stack = s.dishes.filter((d) => d.washed === "" || (d.at > 0 && now - d.at < LEAVE && now >= d.at));
  const left = pile(s).length;
  const lean = Math.min(1, left / 10);
  const cx = width * 0.44;
  const raw = stack.map((d) => SIZE[d.kind]);
  const total = raw.reduce((n, r) => n + r[1] + 2, 0);
  const k = total > FLOOR - 24 ? (FLOOR - 24) / total : 1;
  let y = FLOOR;
  const out: Slot[] = [];
  stack.forEach((d, i) => {
    const leave = d.washed === "" ? 0 : Math.min(1, (now - d.at) / LEAVE);
    const shrink = 1 - leave * leave * (3 - 2 * leave);
    const [w0, h0] = raw[i]!;
    const h = h0 * k;
    const hh = (h + 2) * shrink;
    const f = (FLOOR - y) / (FLOOR - 24);
    const jit = (((i * 7919) % 13) / 13 - 0.5) * 8 * lean;
    out.push({ d, x: cx + lean * 70 * Math.pow(f, 1.5) + jit, y: y - h / 2, w: w0 * (0.86 + 0.14 * k), h, rot: lean * (0.09 * f + jit * 0.004), leave });
    y -= hh;
  });
  return out;
}

function drawDish(g: CanvasRenderingContext2D, sl: Slot, tone: string, ink: string, card: string) {
  const { w, h } = sl;
  g.fillStyle = tone;
  g.strokeStyle = ink;
  g.lineWidth = 1.5;
  g.beginPath();
  switch (sl.d.kind) {
    case "pot":
      g.roundRect(-w / 2 + 8, -h / 2 + 4, w - 16, h - 4, 6);
      g.fill();
      g.stroke();
      g.beginPath();
      g.roundRect(-w / 2, -h / 2 + 8, 10, 6, 3);
      g.roundRect(w / 2 - 10, -h / 2 + 8, 10, 6, 3);
      g.fill();
      g.stroke();
      g.beginPath();
      g.ellipse(0, -h / 2 + 4, w / 2 - 8, 4, 0, 0, Math.PI * 2);
      g.fillStyle = card;
      g.fill();
      g.stroke();
      // rice, crusted on
      g.fillStyle = mix(card, ink, 0.12);
      g.beginPath();
      for (let k = 0; k < 7; k++) g.ellipse(-w / 2 + 20 + k * ((w - 40) / 6), -h / 2 + 4, 3, 1.4, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case "pan":
      g.roundRect(-w / 2 + 22, -h / 2, w - 22, h, [2, 2, h / 2, h / 2]);
      g.fill();
      g.stroke();
      g.beginPath();
      g.roundRect(-w / 2, -3, 26, 6, 3);
      g.fillStyle = ink;
      g.fill();
      break;
    case "plate":
      g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.ellipse(0, -h * 0.1, Math.max(1, w / 2 - 14), Math.max(0.5, h / 2 - 2.5), 0, 0, Math.PI * 2);
      g.strokeStyle = mix(tone, ink, 0.3);
      g.stroke();
      break;
    case "bowl":
      g.moveTo(-w / 2, -h / 2);
      g.lineTo(w / 2, -h / 2);
      g.quadraticCurveTo(w / 2 - 4, h / 2, 0, h / 2);
      g.quadraticCurveTo(-w / 2 + 4, h / 2, -w / 2, -h / 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.ellipse(0, -h / 2, w / 2, 3.5, 0, 0, Math.PI * 2);
      g.fillStyle = mix(tone, card, 0.4);
      g.fill();
      g.stroke();
      break;
    case "mug":
      g.roundRect(-w / 2, -h / 2, w - 10, h, [2, 2, 6, 6]);
      g.fill();
      g.stroke();
      g.beginPath();
      g.arc(w / 2 - 10, 0, h * 0.26, -Math.PI / 2, Math.PI / 2);
      g.lineWidth = 4;
      g.strokeStyle = tone;
      g.stroke();
      break;
    case "glass":
      g.moveTo(-w / 2, -h / 2);
      g.lineTo(w / 2, -h / 2);
      g.lineTo(w / 2 - 4, h / 2);
      g.lineTo(-w / 2 + 4, h / 2);
      g.closePath();
      g.globalAlpha = 0.75;
      g.fill();
      g.globalAlpha = 1;
      g.stroke();
      break;
  }
}

function drawSink(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, members: readonly Member[], ctx: Ctx) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const W = f.width;
  const now = f.now;
  const dark = t.mode === "dark";
  // backsplash tiles
  const wall = dark ? mix(c.card, p.orange, 0.22) : p.wall;
  g.fillStyle = wall;
  g.fillRect(0, 0, W, 150);
  g.strokeStyle = dark ? mix(wall, c.wash, 0.6) : mix(wall, c.card, 0.6);
  g.lineWidth = 2;
  g.beginPath();
  for (let y = 26; y < 150; y += 26) {
    g.moveTo(0, y);
    g.lineTo(W, y);
  }
  for (let r = 0; r < 6; r++) for (let x = (r % 2) * 22; x < W; x += 44) {
    g.moveTo(x, r * 26);
    g.lineTo(x, r * 26 + 26);
  }
  g.stroke();
  // counter and basin
  g.fillStyle = dark ? mix(c.card, c.text, 0.18) : mix(c.secondaryText, c.card, 0.72);
  g.fillRect(0, 146, W, 12);
  const bx = W * 0.07;
  const bw = W * 0.86;
  g.fillStyle = dark ? mix(c.wash, c.text, 0.1) : mix(c.secondaryText, c.card, 0.5);
  g.beginPath();
  g.roundRect(bx, 156, bw, H - 160, [0, 0, 18, 18]);
  g.fill();
  g.fillStyle = dark ? mix(c.wash, c.text, 0.04) : mix(c.secondaryText, c.card, 0.62);
  g.beginPath();
  g.roundRect(bx + 8, 156, bw - 16, H - 168, [0, 0, 12, 12]);
  g.fill();
  // faucet
  const fx = W * 0.86;
  g.strokeStyle = dark ? mix(c.text, c.wash, 0.35) : mix(c.secondaryText, c.text, 0.2);
  g.lineWidth = 9;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(fx, 150);
  g.lineTo(fx, 74);
  g.arc(fx - 26, 74, 26, 0, Math.PI, true);
  g.lineTo(fx - 52, 92);
  g.stroke();
  g.lineCap = "butt";

  const slots = layout(s, now, W);
  const left = pile(s);
  let busy = slots.some((x) => x.leave > 0);
  const lastWash = Math.max(0, ...s.dishes.map((d) => d.at));

  if (!left.length) {
    // empty sink: water drip and a sparkle
    const e = lastWash ? now - lastWash : 99999;
    const drip = (now / 900) % 1;
    g.fillStyle = mix(p.sky, c.primary, 0.3);
    g.beginPath();
    g.ellipse(fx - 52, 100 + drip * 90, 3, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.yellow;
    const tw = (k: number) => 0.6 + 0.4 * Math.sin(now / 300 + k * 2);
    g.beginPath();
    for (const [k, sx, sy, r] of [[0, W * 0.38, 182, 9], [1, W * 0.55, 170, 6], [2, W * 0.67, 192, 7]] as const) {
      const rr = r * tw(k);
      g.moveTo(sx, sy - rr);
      g.quadraticCurveTo(sx, sy, sx + rr, sy);
      g.quadraticCurveTo(sx, sy, sx, sy + rr);
      g.quadraticCurveTo(sx, sy, sx - rr, sy);
      g.quadraticCurveTo(sx, sy, sx, sy - rr);
    }
    g.fill();
    return busy || e < 8000;
  }

  for (const sl of slots) {
    const mine = sl.d.owner === me;
    const known = inChat(ctx, sl.d.owner);
    const tone = mix(known ? userColor(sl.d.owner, t) : c.secondaryText, c.card, dark ? 0.35 : 0.55);
    g.save();
    const fly = sl.leave;
    g.translate(sl.x + fly * fly * 140, sl.y - fly * 90);
    g.rotate(sl.rot + fly * 0.9);
    g.globalAlpha = 1 - fly;
    drawDish(g, sl, tone, dark ? mix(c.text, c.card, 0.25) : mix(c.text, tone, 0.45), c.card);
    if (mine && fly === 0) {
      g.strokeStyle = c.primary;
      g.lineWidth = 2;
      g.setLineDash([4, 3]);
      g.beginPath();
      g.roundRect(-sl.w / 2 - 4, -sl.h / 2 - 5, sl.w + 8, sl.h + 10, 6);
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
    if (fly > 0) {
      // bubbles
      g.fillStyle = p.sky;
      g.globalAlpha = 1 - fly;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const bx2 = sl.x + Math.cos(k * 1.7) * 30 * (0.4 + fly) + fly * 60;
        const by2 = sl.y - fly * 60 - k * 6;
        g.moveTo(bx2 + 4, by2);
        g.arc(bx2, by2, 3 + (k % 3), 0, Math.PI * 2);
      }
      g.fill();
      g.globalAlpha = 1;
    }
  }
  // owner tags, alternating sides, after the dishes so no dish paints over a face
  g.textAlign = "center";
  g.textBaseline = "middle";
  slots.forEach((sl, i) => {
    if (sl.leave > 0) return;
    const side = i % 2 === 0 ? -1 : 1;
    const tx = Math.max(12, Math.min(W - 12, sl.x + side * (sl.w / 2 + 16)));
    const ty = sl.y;
    const known = inChat(ctx, sl.d.owner);
    g.strokeStyle = c.divider;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(sl.x + side * (sl.w / 2 - 2), ty);
    g.lineTo(tx - side * 10, ty);
    g.stroke();
    g.beginPath();
    g.arc(tx, ty, 10, 0, Math.PI * 2);
    g.fillStyle = known ? userColor(sl.d.owner, t) : c.secondaryButton;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = c.card;
    g.stroke();
    g.fillStyle = known ? c.onPrimary : c.secondaryButtonText;
    g.font = `600 11px ${t.type.family}`;
    g.fillText(known ? (nameIn(members, sl.d.owner, sl.d.name)[0] ?? "?").toUpperCase() : "?", tx, ty + 0.5);
  });
  // the bottom dish's label, the running joke
  const base = slots[0];
  if (base && base.leave === 0 && base.d.label !== base.d.kind) {
    const lab = fitText(`${first(nameIn(members, base.d.owner, base.d.name))}'s ${base.d.label}, again`, W * 0.5, { g, size: 12, min: 10, weight: 600 });
    g.font = lab.font;
    const lw = g.measureText(lab.text).width;
    g.fillStyle = c.card;
    g.beginPath();
    g.roundRect(6, 3, lw + 14, 20, 10);
    g.fill();
    g.fillStyle = c.secondaryText;
    g.textAlign = "left";
    g.fillText(lab.text, 13, 13.5);
  }
  return busy;
}

export default defineApp<State, Action, Local>({
  name: "Dish tower",
  summary: (s) => {
    const left = pile(s);
    if (!left.length) return `${s.title}: sink clear`;
    const counts = new Map<string, { n: number; name: string }>();
    for (const d of left) counts.set(d.owner, { n: (counts.get(d.owner)?.n ?? 0) + 1, name: d.name });
    const top = [...counts.values()].sort((a, b) => b.n - a.n)[0]!;
    return `${s.title}: ${left.length} dishes in the sink · ${first(top.name)} has ${top.n}`;
  },
  init: initState,
  reduce: reduceSink,

  invariants: {
    "dish ids are unique": (s) => new Set(s.dishes.map((d) => d.id)).size === s.dishes.length,
    "the pile is at most 14": (s) => pile(s).length <= MAX,
    "every dish is a known kind": (s) => s.dishes.every((d) => isKind(d.kind)),
    "washed dishes keep a time": (s) => s.dishes.every((d) => Number.isFinite(d.at) && d.at >= 0 && (d.washed !== "" || d.at === 0)),
    "nudges are whole and positive": (s) => Object.values(s.nudges).every((n) => Number.isInteger(n) && n > 0),
  },

  transitions: {
    "a wash washes one dish, yours or nobody's": (p, n, a, m, ctx) => {
      if (a.t !== "wash" || p === n) return true;
      const before = p.dishes.find((d) => d.id === a.id);
      const after = n.dishes.find((d) => d.id === a.id);
      return !!before && !!after && before.washed === "" && after.washed === m.user && after.at === m.time && (before.owner === m.user || !inChat(ctx, before.owner)) && pile(n).length === pile(p).length - 1;
    },
    "wash mine washes exactly mine": (p, n, a, m) =>
      a.t !== "washMine" || p === n || (n.dishes.every((d) => d.washed !== "" || d.owner !== m.user) && pile(n).length === pile(p).filter((d) => d.owner !== m.user).length && n.dishes.every((d) => { const o = p.dishes.find((x) => x.id === d.id); return !o || o.washed !== "" || d.washed === "" || (d.washed === m.user && d.at === m.time); })),
    "a nudge adds one to the owner": (p, n, a, m) => {
      if (a.t !== "nudge" || p === n) return true;
      const d = p.dishes.find((x) => x.id === a.id);
      return !!d && d.owner !== m.user && (n.nudges[d.owner] ?? 0) === (p.nudges[d.owner] ?? 0) + 1 && JSON.stringify(n.dishes) === JSON.stringify(p.dishes);
    },
    "adding puts one of yours on top": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const top = n.dishes[n.dishes.length - 1];
      return !!top && top.owner === m.user && top.washed === "" && top.kind === a.kind && pile(n).length === pile(p).length + 1 && n.adds === p.adds + 1;
    },
    "washed stays washed": (p, n) => p.dishes.every((d) => d.washed === "" || !n.dishes.some((x) => x.id === d.id && x.washed !== d.washed)),
    "only nudges change nudges": (p, n, a) => a.t === "nudge" || JSON.stringify(p.nudges) === JSON.stringify(n.nudges),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const left = pile(s);
    const mine = left.filter((d) => canWash(d, user, ctx));
    const x = r.next();
    if (!left.length || x < 0.12) return { t: "add", kind: r.pick([...KINDS]) };
    if (mine.length && x < 0.6) return { t: "wash", id: r.pick(mine).id };
    if (x < 0.72) return { t: "washMine" };
    return { t: "nudge", id: r.pick(left).id };
  },

  local: { toast: 0, msg: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const ctx: Ctx = { room: "", members };
    const W = theme.width - 2 * theme.space.card;
    const left = pile(state);
    const mine = left.filter((d) => d.owner === me);
    const counts = new Map<string, number>();
    for (const d of left) counts.set(d.owner, (counts.get(d.owner) ?? 0) + 1);
    const owners = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const washers = [...new Set(state.dishes.filter((d) => d.washed !== "" && d.at > 0).map((d) => d.washed))];
    const lastSaid = state.said[state.said.length - 1];
    const nameOf = (id: string) => {
      const d = state.dishes.find((x) => x.owner === id);
      return nameIn(members, id, d ? d.name : "Someone");
    };
    const top = owners.find(([id]) => id !== me && inChat(ctx, id));

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "up") return;
      const slots = layout(state, 0, W).filter((s) => s.leave === 0).reverse();
      const hit = slots.find((s) => Math.abs(e.x - s.x) <= s.w / 2 + 6 && Math.abs(e.y - s.y) <= Math.max(10, s.h / 2 + 3));
      if (!hit) return;
      if (canWash(hit.d, me, ctx)) {
        haptic("light");
        dispatch({ t: "wash", id: hit.d.id });
        setLocal({ toast: local.toast + 1, msg: hit.d.owner === me ? `Washed your ${hit.d.label}` : `Washed the ${hit.d.label}` });
      } else {
        dispatch({ t: "nudge", id: hit.d.id });
        setLocal({ toast: local.toast + 1, msg: `Nudged ${first(nameOf(hit.d.owner))} about the ${hit.d.label}` });
      }
    };

    const line = !left.length
      ? washers.length
        ? `Sink clear · washed by ${washers.slice(0, 3).map((u) => first(nameOf(u))).join(", ")}`
        : "Sink clear · nothing to wash"
      : mine.length
        ? `Tap yours to wash it · ${mine.length} of ${left.length} are yours`
        : lastSaid
          ? `${lastSaid.name}: “${lastSaid.said}”`
          : "Tap a dish to nudge its owner";

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub || `${left.length} in the sink`} />
        <Canvas
          height={H}
          label={left.length ? `Sink with a tower of ${left.length} dishes; ${owners.map(([id, n]) => `${first(nameOf(id))} ${n}`).join(", ")}` : "Empty sink, all clear"}
          draw={(g, f) => drawSink(g, f, state, me, members, ctx)}
          onPointer={onPointer}
        />
        <div style={{ marginTop: 8, display: "flex", gap: 6, height: 30, overflow: "hidden" }}>
          {left.length
            ? owners.slice(0, theme.width < 360 ? 3 : 4).map(([id, n]) => (
                <div key={id} style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 10px 0 4px", borderRadius: 15, background: id === me ? c.selected : c.wash, fontSize: 13, lineHeight: "16px", whiteSpace: "nowrap" }}>
                  {inChat(ctx, id) ? <Avatar user={id} size={22} /> : <span style={{ width: 22, height: 22, borderRadius: 11, background: c.secondaryButton, color: c.secondaryButtonText, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>?</span>}
                  <span style={{ fontWeight: 600, color: c.text }}>{String(n)}</span>
                  {(state.nudges[id] ?? 0) > 0 ? <span style={{ color: c.secondaryText }}>{`· nudged ${state.nudges[id]}`}</span> : null}
                </div>
              ))
            : washers.map((u) => (inChat(ctx, u) ? <Avatar key={u} user={u} size={26} /> : null))}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
          {mine.length ? (
            <Button kind="primary" onClick={() => { haptic("success"); dispatch({ t: "washMine" }); setLocal({ toast: local.toast + 1, msg: `${mine.length} washed` }); }}>
              {`Wash my ${mine.length}`}
            </Button>
          ) : left.length && top ? (
            <Button kind="secondary" onClick={() => { const d = left.find((x) => x.owner === top[0])!; dispatch({ t: "nudge", id: d.id }); setLocal({ toast: local.toast + 1, msg: `Nudged ${first(nameOf(top[0]))}` }); }}>
              {`Nudge ${first(nameOf(top[0]))}`}
            </Button>
          ) : (
            <Button kind="secondary" onClick={() => dispatch({ t: "add", kind: KINDS[(state.adds + 2) % KINDS.length]! })}>
              Add a dish
            </Button>
          )}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
