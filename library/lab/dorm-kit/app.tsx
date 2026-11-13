import {
  defineApp,
  Avatar,
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
  seedOf,
  type Ctx,
  type DrawFrame,
  type Theme,
} from "@muse/app";

// Dorm kit: someone's little sister starts in the fall with a small budget. An empty dorm room
// drawn from above, a bed and a desk and nothing else; tap a find in the tray and it drops into
// its spot in the room while the budget runs down. Friends' own leftovers come first, free.

type Slot = "lamp" | "chair" | "rug" | "fridge" | "shelf" | "mirror" | "plant" | "bins";
type Params = {
  /** Who the room is for */
  forWho: string;
  /** Where: "Larkin Hall, fall" */
  where: string;
  budgetCents: number;
  /** 3 to 12 finds: name, which spot in the room it fills, price, and the friend giving it away (free) */
  finds: { name: string; slot: Slot; priceCents: number; from?: string }[];
  /** Already in the room: find index, who added it, what they said */
  placed: { find: number; who: string; said?: string }[];
};

// @params
const P: Params = {
  forWho: "Nadia",
  where: "Will's sister · Larkin Hall · moves in Aug 24",
  budgetCents: 15000,
  finds: [
    { name: "Desk lamp", slot: "lamp", priceCents: 0, from: "Maya" },
    { name: "Pothos", slot: "plant", priceCents: 0, from: "Arun" },
    { name: "Striped rug", slot: "rug", priceCents: 2500 },
    { name: "Mini fridge", slot: "fridge", priceCents: 4000 },
    { name: "Desk chair", slot: "chair", priceCents: 2000 },
    { name: "Bookshelf", slot: "shelf", priceCents: 1800 },
    { name: "Door mirror", slot: "mirror", priceCents: 1200 },
    { name: "Under-bed bins", slot: "bins", priceCents: 1000 },
    { name: "Clip lamp", slot: "lamp", priceCents: 1500 },
  ],
  placed: [
    { find: 0, who: "Maya", said: "it lived in my closet for a year, it deserves this" },
    { find: 2, who: "Will", said: "she said no pink. this is pink-adjacent" },
  ],
};
// @end params

const SLOTS: Slot[] = ["lamp", "chair", "rug", "fridge", "shelf", "mirror", "plant", "bins"];
type Find = { name: string; slot: Slot; price: number; from: string };
type Put = { find: number; by: string; said: string; at: number };
type State = { forWho: string; where: string; budget: number; finds: Find[]; placed: Put[]; sent: { by: string; at: number } | null };
type Action = { t: "add"; find: number } | { t: "remove"; find: number } | { t: "send" };
type Local = { shake: number; shakeAt: number; toast: number; msg: string };

// The room, in its own units: 360 wide, 176 tall. Each spot is a box in the plan.
const RW = 360, RH = 176;
const SPOT: Record<Slot, [number, number, number, number]> = {
  lamp: [312, 22, 22, 22],
  chair: [276, 62, 34, 34],
  rug: [122, 70, 110, 66],
  fridge: [304, 126, 40, 38],
  shelf: [96, 14, 60, 18],
  mirror: [340, 60, 8, 54],
  plant: [184, 12, 22, 22],
  bins: [22, 140, 56, 24],
};
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => (c === 0 ? "free" : `$${Math.round(c / 100)}`);
const spent = (s: State) => s.placed.reduce((n, p) => n + s.finds[p.find]!.price, 0);
const isSlot = (v: unknown): v is Slot => typeof v === "string" && (SLOTS as string[]).includes(v);

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

function initState(ctx: Ctx): State {
  const finds: Find[] = [];
  for (const f of Array.isArray(P.finds) ? P.finds : []) {
    if (finds.length >= 12 || !f) continue;
    const name = clean(f.name, 22);
    if (!name || !isSlot(f.slot)) continue;
    const from = clean(f.from, 16);
    const price = from ? 0 : Number.isInteger(f.priceCents) && f.priceCents >= 0 && f.priceCents <= 100_000 ? f.priceCents : 0;
    finds.push({ name, slot: f.slot, price, from });
  }
  if (!finds.length) finds.push({ name: "Desk lamp", slot: "lamp", price: 1500, from: "" });
  const budget = Number.isInteger(P.budgetCents) && P.budgetCents >= 0 && P.budgetCents <= 1_000_000 ? P.budgetCents : 15000;
  const s: State = { forWho: clean(P.forWho, 32) || "the new room", where: clean(P.where, 52), budget, finds, placed: [], sent: null };
  for (const p of Array.isArray(P.placed) ? P.placed : []) {
    const f = finds[p?.find as number];
    if (!f || s.placed.some((q) => q.find === p.find || finds[q.find]!.slot === f.slot) || spent(s) + f.price > budget) continue;
    const who = clean(p.who, 20);
    const m = ctx.members.find((x) => x.id === who || x.name.trim().toLowerCase() === who.toLowerCase());
    s.placed.push({ find: p.find, by: m ? m.id : `o:${who || "Friend"}`, said: clean(p.said, 60), at: 0 });
  }
  return s;
}

/** One find drawn from above inside its box. */
function drawFind(g: CanvasRenderingContext2D, f: Find, x: number, y: number, w: number, h: number, t: Theme) {
  const p = pal(t);
  const c = t.color;
  const hues = [p.blue, p.green, p.purple, p.orange, p.red, p.yellow];
  const col = hues[seedOf(f.name) % hues.length]!;
  const cx = x + w / 2, cy = y + h / 2;
  switch (f.slot) {
    case "lamp":
      g.fillStyle = mix(p.yellow, c.card, 0.55);
      g.beginPath();
      g.arc(cx, cy, Math.min(w, h) * 0.62, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.yellow;
      g.beginPath();
      g.arc(cx, cy, Math.min(w, h) * 0.38, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(p.yellow, p.dark, 0.35);
      g.beginPath();
      g.arc(cx, cy, Math.min(w, h) * 0.12, 0, Math.PI * 2);
      g.fill();
      break;
    case "chair":
      g.fillStyle = mix(col, p.dark, 0.25);
      g.beginPath();
      g.roundRect(x + w * 0.12, y, w * 0.76, h * 0.26, 4);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.arc(cx, cy + h * 0.1, Math.min(w, h) * 0.38, 0, Math.PI * 2);
      g.fill();
      break;
    case "rug":
      g.fillStyle = mix(col, c.card, 0.35);
      g.beginPath();
      g.roundRect(x, y, w, h, 6);
      g.fill();
      g.fillStyle = mix(col, c.card, 0.05);
      g.beginPath();
      for (let i = 1; i < 6; i += 2) g.rect(x + (w * i) / 6, y + 3, w / 6, h - 6);
      g.fill();
      g.strokeStyle = mix(col, p.dark, 0.2);
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i <= 8; i++) {
        g.moveTo(x - 3, y + (h * i) / 8);
        g.lineTo(x, y + (h * i) / 8);
        g.moveTo(x + w, y + (h * i) / 8);
        g.lineTo(x + w + 3, y + (h * i) / 8);
      }
      g.stroke();
      break;
    case "fridge":
      g.fillStyle = mix(p.sky, c.secondaryText, 0.2);
      g.beginPath();
      g.roundRect(x, y, w, h, 4);
      g.fill();
      g.fillStyle = mix(p.sky, c.card, 0.4);
      g.beginPath();
      g.roundRect(x + 3, y + 3, w - 6, h - 6, 3);
      g.fill();
      g.fillStyle = p.red;
      g.beginPath();
      g.arc(x + w * 0.3, y + h * 0.35, 2.5, 0, Math.PI * 2);
      g.arc(x + w * 0.55, y + h * 0.6, 2.5, 0, Math.PI * 2);
      g.fill();
      break;
    case "shelf":
      g.fillStyle = p.brown;
      g.beginPath();
      g.roundRect(x, y, w, h, 2);
      g.fill();
      [p.blue, p.red, p.green, p.yellow, p.purple].forEach((bc, i) => {
        g.fillStyle = bc;
        g.fillRect(x + 4 + i * ((w - 8) / 5), y + 3, (w - 8) / 5 - 2, h - 6);
      });
      break;
    case "mirror":
      g.fillStyle = p.brown;
      g.beginPath();
      g.roundRect(x, y, w, h, 3);
      g.fill();
      g.fillStyle = mix(p.sky, c.card, 0.25);
      g.beginPath();
      g.roundRect(x + 2, y + 2, w - 4, h - 4, 2);
      g.fill();
      break;
    case "plant":
      g.fillStyle = mix(p.orange, p.brown, 0.3);
      g.beginPath();
      g.arc(cx, cy, Math.min(w, h) * 0.32, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.green;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const r = Math.min(w, h) * 0.5;
        g.moveTo(cx, cy);
        g.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.5, r * 0.26, a, 0, Math.PI * 2);
      }
      g.fill();
      break;
    case "bins":
      g.fillStyle = mix(col, c.card, 0.45);
      g.beginPath();
      g.roundRect(x, y, w * 0.48, h, 3);
      g.roundRect(x + w * 0.52, y, w * 0.48, h, 3);
      g.fill();
      g.strokeStyle = mix(col, p.dark, 0.2);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x + w * 0.16, y + h / 2);
      g.lineTo(x + w * 0.32, y + h / 2);
      g.moveTo(x + w * 0.68, y + h / 2);
      g.lineTo(x + w * 0.84, y + h / 2);
      g.stroke();
      break;
  }
}

export default defineApp<State, Action, Local>({
  name: "Dorm kit",
  summary: (s) =>
    s.sent
      ? `${s.forWho}'s room: ${s.placed.length} finds, ${money(spent(s))} of ${money(s.budget)} · list sent`
      : `${s.forWho}'s room: ${s.placed.length} of ${SLOTS.length} spots filled · ${money(s.budget - spent(s))} left`,

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || s.sent) return s;
    if (a.t === "add") {
      const f = s.finds[a.find];
      if (typeof a.find !== "number" || !f || s.placed.some((p) => p.find === a.find)) return s;
      const rest = s.placed.filter((p) => s.finds[p.find]!.slot !== f.slot);
      const cost = rest.reduce((n, p) => n + s.finds[p.find]!.price, 0) + f.price;
      if (cost > s.budget) return s;
      return { ...s, placed: [...rest, { find: a.find, by: m.user, said: "", at: m.time }] };
    }
    if (a.t === "remove") {
      if (typeof a.find !== "number" || !s.placed.some((p) => p.find === a.find)) return s;
      return { ...s, placed: s.placed.filter((p) => p.find !== a.find) };
    }
    if (a.t === "send") {
      if (!s.placed.length) return s;
      return { ...s, sent: { by: m.user, at: m.time } };
    }
    return s;
  },

  invariants: {
    "it stays in budget": (s) => spent(s) <= s.budget,
    "one find per spot": (s) => new Set(s.placed.map((p) => s.finds[p.find]!.slot)).size === s.placed.length,
    "everything in the room is a real find": (s) => s.placed.every((p) => Number.isInteger(p.find) && !!s.finds[p.find]),
    "a sent list has something on it": (s) => s.sent === null || s.placed.length > 0,
    "friends' leftovers are free": (s) => s.finds.every((f) => !f.from || f.price === 0),
  },

  transitions: {
    "the budget moves by the find's price": (p, n, a) =>
      a.t !== "add" || p === n || spent(n) === spent(p) - p.placed.filter((q) => p.finds[q.find]!.slot === p.finds[a.find]!.slot).reduce((x, q) => x + p.finds[q.find]!.price, 0) + p.finds[a.find]!.price,
    "removing refunds it": (p, n, a) => a.t !== "remove" || p === n || spent(n) === spent(p) - p.finds[a.find]!.price,
    "a find already in the room is not added twice": (p, n, a) => a.t !== "add" || !p.placed.some((q) => q.find === a.find) || n === p,
    "an add that busts the budget does nothing": (p, n, a) =>
      a.t !== "add" || !p.finds[a.find] || spent(p) - p.placed.filter((q) => p.finds[q.find]!.slot === p.finds[a.find]!.slot).reduce((x, q) => x + p.finds[q.find]!.price, 0) + p.finds[a.find]!.price <= p.budget || n === p,
    "adding puts it in its spot": (p, n, a, m) => a.t !== "add" || p === n || n.placed.some((q) => q.find === a.find && q.by === m.user && q.at === m.time),
    "adding only swaps the same spot": (p, n, a) =>
      a.t !== "add" || p === n || p.placed.filter((q) => !n.placed.some((r) => r.find === q.find)).every((q) => p.finds[q.find]!.slot === p.finds[a.find]!.slot),
    "removing takes out just that one": (p, n, a) => a.t !== "remove" || p === n || (!n.placed.some((q) => q.find === a.find) && n.placed.length === p.placed.length - 1),
    "a sent list is final": (p, n) => p.sent === null || n === p,
    "sending keeps the room": (p, n, a, m) => a.t !== "send" || p === n || (n.placed === p.placed && n.sent?.by === m.user),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const x = r.next();
    if (x < 0.65) return { t: "add", find: r.int(s.finds.length) };
    if (x < 0.92 && s.placed.length) return { t: "remove", find: r.pick(s.placed).find };
    return { t: "send" };
  },

  local: { shake: -1, shakeAt: 0, toast: 0, msg: "" },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const k = Math.min(W / RW, 0.94);
    const ox = (W - RW * k) / 2;
    const roomH = Math.round(RH * k);
    const TRAY = 74;
    const H = roomH + 8 + TRAY;
    const used = spent(s);
    const left = s.budget - used;
    const tray = s.finds
      .map((f, i) => ({ f, i }))
      .filter((x) => !s.placed.some((q) => q.find === x.i))
      .sort((a, b) => (b.f.from ? 1 : 0) - (a.f.from ? 1 : 0) || a.f.price - b.f.price);
    const cardW = 62, gap = 6;
    const fit = Math.max(1, Math.floor((W + gap) / (cardW + gap)));
    const shown = tray.slice(0, fit);
    const shakeK = local.shakeAt ? running(local.shakeAt, 450) : null;
    const nameOf = (id: string) => (id.startsWith("o:") ? id.slice(2) : members.find((x) => x.id === id)?.name ?? "Someone");
    const X = (x: number) => ox + x * k;
    const Y = (y: number) => y * k;

    const draw = (g: CanvasRenderingContext2D, fr: DrawFrame) => {
      const floor = dark ? mix(p.wall, c.wash, 0.6) : mix(p.wall, c.card, 0.35);
      const wall = dark ? mix(c.text, c.card, 0.55) : mix(c.secondaryText, c.text, 0.3);
      // floor and walls
      g.fillStyle = floor;
      g.beginPath();
      g.roundRect(X(8), Y(8), RW * k - 16 * k, RH * k - 16 * k, 4);
      g.fill();
      g.strokeStyle = wall;
      g.lineWidth = 6 * k;
      g.beginPath();
      g.rect(X(8), Y(8), (RW - 16) * k, (RH - 16) * k);
      g.stroke();
      // window, top
      g.strokeStyle = mix(p.sky, c.card, 0.1);
      g.lineWidth = 6 * k;
      g.beginPath();
      g.moveTo(X(170), Y(8));
      g.lineTo(X(240), Y(8));
      g.stroke();
      // door, bottom, with its swing
      g.strokeStyle = floor;
      g.lineWidth = 8 * k;
      g.beginPath();
      g.moveTo(X(232), Y(RH - 8));
      g.lineTo(X(282), Y(RH - 8));
      g.stroke();
      g.strokeStyle = c.divider;
      g.lineWidth = 1.5;
      g.setLineDash([3, 3]);
      g.beginPath();
      g.arc(X(232), Y(RH - 8), 50 * k, -Math.PI / 2, 0);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = wall;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(X(232), Y(RH - 8));
      g.lineTo(X(232), Y(RH - 58));
      g.stroke();
      // the bed and the desk come with the room
      g.fillStyle = dark ? mix(c.text, c.card, 0.7) : c.card;
      g.beginPath();
      g.roundRect(X(18), Y(16), 64 * k, 118 * k, 5);
      g.fill();
      g.fillStyle = mix(p.blue, c.card, dark ? 0.5 : 0.7);
      g.beginPath();
      g.roundRect(X(18), Y(52), 64 * k, 82 * k, [0, 0, 5, 5]);
      g.fill();
      g.fillStyle = dark ? mix(c.text, c.card, 0.5) : mix(c.wash, c.secondaryText, 0.15);
      g.beginPath();
      g.roundRect(X(26), Y(22), 48 * k, 22 * k, 6);
      g.fill();
      g.fillStyle = mix(p.brown, c.card, dark ? 0.3 : 0.25);
      g.beginPath();
      g.roundRect(X(250), Y(14), 96 * k, 40 * k, 3);
      g.fill();
      // empty spots: dashed
      g.strokeStyle = dark ? mix(c.text, floor, 0.45) : mix(c.secondaryText, floor, 0.3);
      g.lineWidth = 1.5;
      g.setLineDash([4, 3]);
      g.beginPath();
      for (const sl of SLOTS) {
        if (s.placed.some((q) => s.finds[q.find]!.slot === sl)) continue;
        const [x, y, w, h] = SPOT[sl];
        g.roundRect(X(x), Y(y), w * k, h * k, 4);
      }
      g.stroke();
      g.setLineDash([]);
      // placed finds, popping in
      let moving = shakeK !== null;
      for (const q of s.placed) {
        const f = s.finds[q.find]!;
        const [x, y, w, h] = SPOT[f.slot];
        const e = q.at ? running(q.at, 500) : null;
        if (e !== null) moving = true;
        const t = e === null ? 1 : e / 500;
        const drop = (1 - t) * (1 - t) * 60;
        const sc = 1 + Math.sin(t * Math.PI) * 0.18;
        g.save();
        g.translate(X(x + w / 2), Y(y + h / 2) + drop);
        g.scale(sc, sc);
        drawFind(g, f, (-w / 2) * k, (-h / 2) * k, w * k, h * k, theme);
        g.restore();
      }
      // the tray
      const ty = roomH + 8;
      shown.forEach(({ f, i }, j) => {
        const sx = j * (cardW + gap) + (shakeK !== null && local.shake === i ? Math.sin(shakeK / 25) * 5 * (1 - shakeK / 450) : 0);
        const over = f.price > left + (s.placed.filter((q) => s.finds[q.find]!.slot === f.slot).reduce((n, q) => n + s.finds[q.find]!.price, 0));
        g.fillStyle = c.wash;
        g.beginPath();
        g.roundRect(sx, ty, cardW, TRAY, 10);
        g.fill();
        const [, , w, h] = SPOT[f.slot];
        const sc = Math.min(40 / w, 30 / h, 1.2);
        g.globalAlpha = over ? 0.4 : 1;
        drawFind(g, f, sx + cardW / 2 - (w * sc) / 2, ty + 20 - (h * sc) / 2, w * sc, h * sc, theme);
        g.globalAlpha = 1;
        g.textAlign = "center";
        g.textBaseline = "middle";
        const nm = fitText(f.name, cardW - 8, { g, size: 11, weight: 400, min: 10, family: theme.type.family });
        g.font = nm.font;
        g.fillStyle = c.text;
        g.fillText(nm.text, sx + cardW / 2, ty + 46);
        const pr = fitText(f.from ? `free · ${f.from}` : money(f.price), cardW - 6, { g, size: 11, weight: 700, min: 10, family: theme.type.family });
        g.font = pr.font;
        g.fillStyle = f.from ? ink(p.green, c.wash) : over ? c.secondaryText : c.text;
        g.fillText(pr.text, sx + cardW / 2, ty + 61);
      });
      if (!shown.length) {
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = `600 13px ${theme.type.family}`;
        g.fillStyle = c.secondaryText;
        g.fillText("Every find is in the room", fr.width / 2, ty + TRAY / 2);
      }
      return moving;
    };
    const ink = (fg: string, bg: string) => (dark ? mix(fg, c.text, 0.35) : mix(fg, bg === c.wash ? c.text : c.text, 0.35));

    const tap = (i: number) => {
      if (s.sent) return;
      const f = s.finds[i]!;
      const freed = s.placed.filter((q) => s.finds[q.find]!.slot === f.slot).reduce((n, q) => n + s.finds[q.find]!.price, 0);
      if (f.price > left + freed) {
        setLocal({ shake: i, shakeAt: freshNow(), toast: local.toast + 1, msg: `${money(f.price)} is over what's left` });
        haptic("medium");
        return;
      }
      dispatch({ t: "add", find: i });
      haptic("light");
    };

    const latest = [...s.placed].sort((a, b) => b.at - a.at)[0];
    const quote = latest && latest.said ? latest : s.placed.find((q) => q.said);
    const barW = Math.max(0, Math.min(1, used / Math.max(1, s.budget)));

    return (
      <div>
        <CardHeader title={`${s.forWho}'s room`} subtitle={s.where || `${money(s.budget)} to fill it`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`Dorm room plan, ${s.placed.length} of ${SLOTS.length} spots filled, ${money(left)} left`} draw={draw} />
          {s.placed.map((q) => {
            const f = s.finds[q.find]!;
            const [x, y, w, h] = SPOT[f.slot];
            return (
              <button
                key={q.find}
                aria-label={`Take out ${f.name}`}
                onClick={() => !s.sent && dispatch({ t: "remove", find: q.find })}
                style={{ position: "absolute", left: X(x + w / 2) - 22, top: Y(y + h / 2) - 22, width: 44, height: 44, padding: 0, border: 0, background: "transparent", cursor: s.sent ? "default" : "pointer", display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}
              >
                <span style={{ display: "flex", borderRadius: "50%", boxShadow: `0 0 0 1.5px ${c.card}`, marginTop: 2, marginRight: 2 }}>
                  <Avatar user={q.by.startsWith("o:") ? { id: q.by, name: nameOf(q.by) } : q.by} size={16} />
                </span>
              </button>
            );
          })}
          {shown.map(({ f, i }, j) => (
            <button
              key={i}
              aria-label={`Add ${f.name}, ${f.from ? `free from ${f.from}` : money(f.price)}`}
              onClick={() => tap(i)}
              style={{ position: "absolute", left: j * (cardW + gap), top: roomH + 8, width: cardW, height: TRAY, padding: 0, border: 0, background: "transparent", cursor: s.sent ? "default" : "pointer" }}
            />
          ))}
        </div>
        <div style={{ marginTop: 8, minHeight: 18, fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {quote ? `${nameOf(quote.by)}: “${quote.said}”` : `Tap a find to put it in the room · ${tray.length > fit ? `${tray.length - fit} more after these` : "friends' leftovers first"}`}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.sent ? `List sent · ${s.placed.length} ${s.placed.length === 1 ? "find" : "finds"} for ${money(used) === "free" ? "$0" : money(used)}` : `${money(left) === "free" ? "$0" : money(left)} left of ${money(s.budget)} · ${s.placed.length} of ${SLOTS.length} spots`}
            </div>
            <div style={{ marginTop: 4, height: 6, borderRadius: 3, background: c.track, overflow: "hidden" }}>
              <div style={{ width: `${(1 - barW) * 100}%`, height: 6, borderRadius: 3, background: left < s.budget * 0.15 ? c.warning : c.positive, transition: "width 400ms" }} />
            </div>
          </div>
          {!s.sent && s.placed.length ? (
            <Button kind="primary" onClick={() => { dispatch({ t: "send" }); haptic("success"); setLocal({ toast: local.toast + 1, msg: "Sent the list with the seller links" }); }}>
              Send list
            </Button>
          ) : null}
        </div>
        {local.toast > 0 && local.msg ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
