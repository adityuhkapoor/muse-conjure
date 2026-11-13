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

// Late cart: a 12:48am group delivery order as a scooter with a crate on the back. Everyone drops
// their items in as little boxes; the road under it fills toward the free delivery minimum and the
// headlight comes on when it's met. One person places it and the split appears under each face.

type Params = {
  /** Card title */
  title: string;
  /** The place that's open: "Golden Lantern" */
  shop: string;
  /** Free delivery minimum, in cents */
  minCents: number;
  /** Delivery fee under the minimum, in cents */
  feeCents: number;
  /** What you can add. kind: box, cup, bag, tray. */
  menu: { label: string; cents: number; kind: string }[];
  /** Already in the cart: who and which menu item */
  cart: { who: string; item: string }[];
  /** The line that started it */
  said: { who: string; said: string };
};

// @params
const P: Params = {
  title: "Late night order",
  shop: "Golden Lantern",
  minCents: 2500,
  feeCents: 399,
  menu: [
    { label: "egg tarts", cents: 450, kind: "box" },
    { label: "shrimp chips", cents: 300, kind: "bag" },
    { label: "pork dumplings", cents: 850, kind: "tray" },
    { label: "bubble tea", cents: 575, kind: "cup" },
    { label: "fried rice", cents: 925, kind: "box" },
    { label: "scallion pancake", cents: 600, kind: "tray" },
  ],
  cart: [
    { who: "Arun", item: "pork dumplings" },
    { who: "Tsai Lin", item: "bubble tea" },
    { who: "Will", item: "fried rice" },
  ],
  said: { who: "Arun", said: "i'm so hungry i could cry" },
};
// @end params

const KINDS = ["box", "cup", "bag", "tray"] as const;
type Kind = (typeof KINDS)[number];
type Menu = { label: string; cents: number; kind: Kind };
type Line = { id: string; by: string; name: string; item: number; at: number };
type State = { title: string; shop: string; min: number; fee: number; menu: Menu[]; lines: Line[]; placed: { by: string; at: number } | null; said: { name: string; said: string } | null };
type Action = { t: "add"; item: number } | { t: "remove"; id: string } | { t: "place" };
type Local = { toast: number; msg: string; page: number };

const H = 182;
const CAP = 9;
const PILE_COLS = 3;
const PILE_W = 34;
const PILE_H = 26;
const REAR = 112;
const WHEEL_Y = 138;
/** Where the i-th item sits in the pile: rows of three from the crate up. */
const pileSlot = (i: number, ox = 0) => ({ x: REAR - 102 + ox + (i % PILE_COLS) * PILE_W, y: WHEEL_Y - 50 - (Math.floor(i / PILE_COLS) + 1) * PILE_H, w: PILE_W - 4, h: PILE_H - 2 });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const first = (n: string) => n.split(" ")[0] ?? n;
const usd = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const sub = (s: State) => s.lines.reduce((n, l) => n + (s.menu[l.item]?.cents ?? 0), 0);
const feeOf = (s: State) => (s.lines.length && sub(s) < s.min ? s.fee : 0);
const people = (s: State) => [...new Set(s.lines.map((l) => l.by))];
/** Each person's food plus an even share of the fee; leftover cents go to the first people. */
function split(s: State): { id: string; cents: number }[] {
  const ps = people(s);
  const fee = feeOf(s);
  const base = ps.length ? Math.floor(fee / ps.length) : 0;
  const extra = ps.length ? fee - base * ps.length : 0;
  return ps.map((id, i) => ({ id, cents: s.lines.filter((l) => l.by === id).reduce((n, l) => n + (s.menu[l.item]?.cents ?? 0), 0) + base + (i < extra ? 1 : 0) }));
}

function initState(ctx: Ctx): State {
  const menu: Menu[] = [];
  for (const m of Array.isArray(P.menu) ? P.menu : []) {
    const label = clean(m?.label, 22);
    if (!label || menu.length >= 8) continue;
    const cents = Number.isInteger(m?.cents) ? Math.max(50, Math.min(10000, m.cents)) : 500;
    menu.push({ label, cents, kind: (KINDS as readonly string[]).includes(m?.kind) ? (m.kind as Kind) : "box" });
  }
  if (!menu.length) menu.push({ label: "something", cents: 800, kind: "box" });
  const lines: Line[] = [];
  for (const c of Array.isArray(P.cart) ? P.cart : []) {
    const who = clean(c?.who, 24);
    const item = menu.findIndex((m) => m.label.toLowerCase() === clean(c?.item, 22).toLowerCase());
    if (!who || item < 0 || lines.length >= CAP) continue;
    const m = ctx.members.find((x) => x.id === who || x.name.toLowerCase() === who.toLowerCase());
    lines.push({ id: `c${lines.length}`, by: m ? m.id : `?${who.toLowerCase()}`, name: m ? m.name : who, item, at: 0 });
  }
  const sw = clean(P.said?.who, 20);
  const ss = clean(P.said?.said, 60);
  return {
    title: clean(P.title, 30) || "Late night order",
    shop: clean(P.shop, 24) || "the place",
    min: Number.isInteger(P.minCents) ? Math.max(0, Math.min(10000, P.minCents)) : 2500,
    fee: Number.isInteger(P.feeCents) ? Math.max(0, Math.min(2000, P.feeCents)) : 399,
    menu,
    lines,
    placed: null,
    said: sw && ss ? { name: sw, said: ss } : null,
  };
}

function reduceCart(s: State, a: Action, meta: Meta, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u) || s.placed) return s;
  if (a.t === "add") {
    if (typeof a.item !== "number" || !Number.isInteger(a.item) || !s.menu[a.item] || s.lines.length >= CAP) return s;
    const name = ctx.members.find((m) => m.id === u)?.name ?? "";
    return { ...s, lines: [...s.lines, { id: `n${meta.seq}`, by: u, name, item: a.item, at: meta.time }] };
  }
  if (a.t === "remove") {
    const l = typeof a.id === "string" ? s.lines.find((x) => x.id === a.id) : undefined;
    if (!l || l.by !== u) return s;
    return { ...s, lines: s.lines.filter((x) => x.id !== l.id) };
  }
  if (a.t === "place") {
    if (!s.lines.length) return s;
    return { ...s, placed: { by: u, at: meta.time } };
  }
  return s;
}

function drawItem(g: CanvasRenderingContext2D, kind: Kind, x: number, y: number, w: number, h: number, kraft: string, ink: string, accent: string, card: string) {
  g.fillStyle = kraft;
  g.strokeStyle = ink;
  g.lineWidth = 1.2;
  g.beginPath();
  if (kind === "cup") {
    g.moveTo(x + w * 0.22, y + 4);
    g.lineTo(x + w * 0.78, y + 4);
    g.lineTo(x + w * 0.7, y + h);
    g.lineTo(x + w * 0.3, y + h);
    g.closePath();
    g.fillStyle = mix(kraft, card, 0.4);
    g.fill();
    g.stroke();
    g.strokeStyle = accent;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + w * 0.56, y + 6);
    g.lineTo(x + w * 0.66, y - 3);
    g.stroke();
    g.fillStyle = mix(ink, kraft, 0.4);
    g.beginPath();
    for (const k of [0.4, 0.5, 0.6]) {
      g.moveTo(x + w * k + 2, y + h - 4);
      g.arc(x + w * k, y + h - 4, 2, 0, Math.PI * 2);
    }
    g.fill();
  } else if (kind === "bag") {
    g.moveTo(x + 3, y + 3);
    g.lineTo(x + w - 3, y + 3);
    g.lineTo(x + w - 1, y + h);
    g.lineTo(x + 1, y + h);
    g.closePath();
    g.fillStyle = accent;
    g.fill();
    g.stroke();
  } else if (kind === "tray") {
    g.roundRect(x + 1, y + h * 0.45, w - 2, h * 0.55, 3);
    g.fill();
    g.stroke();
    g.fillStyle = mix(card, kraft, 0.2);
    g.beginPath();
    for (const k of [0.25, 0.5, 0.75]) g.ellipse(x + w * k, y + h * 0.45, w * 0.11, h * 0.18, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    g.roundRect(x + 1, y + 3, w - 2, h - 3, 2);
    g.fill();
    g.stroke();
    g.strokeStyle = mix(ink, kraft, 0.5);
    g.beginPath();
    g.moveTo(x + 1, y + h * 0.42);
    g.lineTo(x + w - 1, y + h * 0.42);
    g.stroke();
  }
}

function drawScene(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, ctx: Ctx) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const W = f.width;
  const now = f.now;
  const dark = t.mode === "dark";
  const total = sub(s);
  const met = total >= s.min && s.lines.length > 0;
  const lite = dark ? c.text : c.card;
  // night sky band
  const night = dark ? mix(c.wash, p.blue, 0.18) : mix(p.blue, c.text, 0.72);
  g.fillStyle = night;
  g.beginPath();
  g.roundRect(0, 0, W, 150, [14, 14, 0, 0]);
  g.fill();
  g.fillStyle = mix(night, lite, 0.8);
  g.beginPath();
  for (const [sx, sy] of [[0.62, 0.16], [0.7, 0.32], [0.84, 0.12], [0.9, 0.4], [0.55, 0.3], [0.96, 0.22]] as const) {
    g.moveTo(W * sx + 1.6, 150 * sy);
    g.arc(W * sx, 150 * sy, 1.6, 0, Math.PI * 2);
  }
  g.fill();
  g.fillStyle = p.cream;
  g.beginPath();
  g.arc(W - 30, 28, 13, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = night;
  g.beginPath();
  g.arc(W - 24, 24, 11, 0, Math.PI * 2);
  g.fill();
  // road
  g.fillStyle = dark ? mix(c.wash, c.text, 0.05) : mix(c.text, c.card, 0.3);
  g.fillRect(0, 150, W, 32);
  // the scooter
  const go = s.placed ? Math.min(1, Math.max(0, (now - s.placed.at) / 1600)) : 0;
  const ox = go * go * (W * 0.24);
  const wy = WHEEL_Y;
  const rx = REAR + ox;
  const fx = REAR + 138 + ox;
  const body = p.red;
  const ink = dark ? c.wash : mix(c.text, c.card, 0.1);
  if (met) {
    g.fillStyle = mix(p.yellow, night, 0.3);
    g.beginPath();
    g.moveTo(fx + 20, 96);
    g.lineTo(W, 70);
    g.lineTo(W, 150);
    g.closePath();
    g.fill();
  }
  if (s.placed) {
    g.strokeStyle = mix(night, lite, 0.5);
    g.lineWidth = 2;
    g.lineCap = "round";
    g.beginPath();
    for (const [k, y] of [[0, 84], [1, 104], [2, 124]] as const) {
      g.moveTo(rx - 70 - k * 8, y);
      g.lineTo(rx - 40 - k * 8, y);
    }
    g.stroke();
    g.lineCap = "butt";
  }
  // wheels
  g.fillStyle = ink;
  g.beginPath();
  g.arc(rx, wy, 17, 0, Math.PI * 2);
  g.arc(fx, wy, 17, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = mix(c.secondaryText, lite, 0.3);
  g.beginPath();
  g.arc(rx, wy, 6, 0, Math.PI * 2);
  g.arc(fx, wy, 6, 0, Math.PI * 2);
  g.fill();
  // body: deck, seat, steering column
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(rx - 22, wy - 18);
  g.quadraticCurveTo(rx - 26, wy - 44, rx + 10, wy - 46);
  g.lineTo(rx + 52, wy - 46);
  g.lineTo(rx + 60, wy - 20);
  g.lineTo(fx - 22, wy - 20);
  g.lineTo(fx - 4, wy - 64);
  g.lineTo(fx + 10, wy - 60);
  g.lineTo(fx + 4, wy - 10);
  g.lineTo(rx + 20, wy - 8);
  g.closePath();
  g.fill();
  g.fillStyle = ink;
  g.beginPath();
  g.roundRect(rx - 6, wy - 54, 58, 9, 4);
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = 4;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(fx - 2, wy - 66);
  g.lineTo(fx - 14, wy - 76);
  g.stroke();
  g.lineCap = "butt";
  // headlight
  g.fillStyle = met ? p.yellow : mix(c.secondaryText, c.card, 0.4);
  g.beginPath();
  g.ellipse(fx + 12, wy - 42, 6, 8, 0, 0, Math.PI * 2);
  g.fill();
  // the order, piled in a crate on the rear rack
  const kraft = mix(p.crust, c.card, 0.3);
  const lineInk = mix(c.text, kraft, 0.5);
  const crate = mix(p.brown, c.card, dark ? 0.25 : 0.05);
  s.lines.forEach((l, i) => {
    const m = s.menu[l.item];
    if (!m) return;
    const r = pileSlot(i, ox);
    let y = r.y;
    const age = now - l.at;
    if (l.at && age < 500 && age >= 0) y -= (1 - (age / 500) ** 2) * 70;
    drawItem(g, m.kind, r.x, y, r.w, r.h, kraft, lineInk, p.orange, c.card);
    const known = inChat(ctx, l.by);
    g.fillStyle = known ? userColor(l.by, t) : c.secondaryText;
    g.beginPath();
    g.arc(r.x + r.w - 4, y + 4, 4.5, 0, Math.PI * 2);
    g.fill();
    if (l.by === me) {
      g.strokeStyle = c.primary;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(r.x + r.w - 4, y + 4, 7, 0, Math.PI * 2);
      g.stroke();
    }
  });
  const base = pileSlot(0, ox);
  g.fillStyle = crate;
  g.beginPath();
  g.roundRect(base.x - 4, base.y + base.h - 8, PILE_COLS * PILE_W + 6, 16, 3);
  g.fill();
  g.strokeStyle = mix(crate, c.card, 0.35);
  g.lineWidth = 1.5;
  g.beginPath();
  for (let k = 1; k < PILE_COLS; k++) {
    g.moveTo(base.x - 2 + k * PILE_W, base.y + base.h - 6);
    g.lineTo(base.x - 2 + k * PILE_W, base.y + base.h + 6);
  }
  g.stroke();
  if (!s.lines.length) {
    g.strokeStyle = mix(night, lite, 0.6);
    g.setLineDash([4, 3]);
    g.lineWidth = 1.5;
    g.strokeRect(base.x, base.y - 2, PILE_COLS * PILE_W - 4, base.h - 4);
    g.setLineDash([]);
  }
  // road meter toward the minimum
  const y = 166;
  const x0 = 12;
  const x1 = W - 12;
  const scale = Math.max(s.min * 1.3, total, 1);
  const fill = Math.min(1, total / scale);
  const minX = x0 + (x1 - x0) * (s.min / scale);
  g.fillStyle = dark ? mix(c.wash, c.text, 0.22) : mix(c.card, c.text, 0.15);
  g.beginPath();
  g.roundRect(x0, y - 4, x1 - x0, 8, 4);
  g.fill();
  g.fillStyle = met ? p.yellow : lite;
  g.beginPath();
  g.roundRect(x0, y - 4, Math.max(8, (x1 - x0) * fill), 8, 4);
  g.fill();
  // the flag at the minimum
  g.strokeStyle = lite;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(minX, y + 6);
  g.lineTo(minX, y - 12);
  g.stroke();
  g.fillStyle = met ? p.yellow : lite;
  g.beginPath();
  g.moveTo(minX, y - 12);
  g.lineTo(minX + 10, y - 9);
  g.lineTo(minX, y - 6);
  g.fill();
  // sign: the shop
  const tag = fitText(s.shop, 120, { g, size: 12, min: 10, weight: 700 });
  g.font = tag.font;
  g.fillStyle = mix(night, lite, 0.85);
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(tag.text, 12, 16);
  return s.placed && now - s.placed.at < 1700 ? true : s.lines.some((l) => l.at && now - l.at < 520 && now >= l.at);
}

export default defineApp<State, Action, Local>({
  name: "Late cart",
  summary: (s) => {
    const total = sub(s);
    if (s.placed) return `${s.title}: placed · ${usd(total + feeOf(s))} from ${s.shop}`;
    const left = s.min - total;
    return `${s.title}: ${usd(total)} in the cart${left > 0 ? ` · ${usd(left)} to free delivery` : " · free delivery"}`;
  },
  init: initState,
  reduce: reduceCart,

  invariants: {
    "lines point at the menu": (s) => s.lines.every((l) => Number.isInteger(l.item) && l.item >= 0 && l.item < s.menu.length),
    "line ids are unique": (s) => new Set(s.lines.map((l) => l.id)).size === s.lines.length,
    "the crate holds at most 9": (s) => s.lines.length <= CAP,
    "the split adds up to the order": (s) => split(s).reduce((n, x) => n + x.cents, 0) === sub(s) + feeOf(s),
    "a placed order has food in it": (s) => !s.placed || s.lines.length > 0,
    "prices are whole cents": (s) => s.menu.every((m) => Number.isInteger(m.cents) && m.cents > 0) && Number.isInteger(s.min) && Number.isInteger(s.fee),
  },

  transitions: {
    "adding drops one of yours in": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const l = n.lines[n.lines.length - 1];
      return !p.placed && !!l && l.by === m.user && l.item === a.item && l.at === m.time && n.lines.length === p.lines.length + 1;
    },
    "you can only take out your own": (p, n, a, m) => {
      if (a.t !== "remove" || p === n) return true;
      const gone = p.lines.filter((l) => !n.lines.some((x) => x.id === l.id));
      return gone.length === 1 && gone[0]!.by === m.user && gone[0]!.id === a.id && n.lines.length === p.lines.length - 1;
    },
    "placing locks it once": (p, n, a, m) => a.t !== "place" || p === n || (!p.placed && !!n.placed && n.placed.by === m.user && n.placed.at === m.time && JSON.stringify(n.lines) === JSON.stringify(p.lines)),
    "a placed order never changes": (p, n) => !p.placed || JSON.stringify(p) === JSON.stringify(n),
    "the menu never changes": (p, n) => JSON.stringify(p.menu) === JSON.stringify(n.menu),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const mine = s.lines.filter((l) => l.by === user);
    const x = r.next();
    if (x < 0.55) return { t: "add", item: r.int(s.menu.length) };
    if (mine.length && x < 0.85) return { t: "remove", id: r.pick(mine).id };
    if (x < 0.88) return { t: "add", item: r.int(s.menu.length) };
    if (x < 0.91) return { t: "place" };
    return { t: "add", item: r.int(s.menu.length + 1) };
  },

  local: { toast: 0, msg: "", page: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const ctx: Ctx = { room: "", members };
    const W = theme.width - 2 * theme.space.card;
    const total = sub(state);
    const fee = feeOf(state);
    const left = state.min - total;
    const shares = split(state);
    const mine = state.lines.filter((l) => l.by === me);
    const placed = state.placed;
    // Menu chips in pages that fit the width; a More chip turns the page.
    const chipW = (m: Menu) => Math.ceil((m.label.length + 2 + usd(m.cents).length) * 6.8) + 30;
    const pages: number[][] = [[]];
    let used = 0;
    state.menu.forEach((m, i) => {
      const w = chipW(m) + 6;
      if (used + w > W - 56 && pages[pages.length - 1]!.length) {
        pages.push([]);
        used = 0;
      }
      pages[pages.length - 1]!.push(i);
      used += w;
    });
    const page = pages[local.page % pages.length]!;
    const nm = (id: string) => (id === me ? "You" : first(members.find((m) => m.id === id)?.name ?? state.lines.find((l) => l.by === id)?.name ?? "Someone"));

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "up" || placed) return;
      const l = state.lines.find((_, i) => {
        const r = pileSlot(i);
        return e.x >= r.x - 2 && e.x <= r.x + r.w + 2 && e.y >= r.y - 2 && e.y <= r.y + r.h + 2;
      });
      if (l && l.by === me) {
        dispatch({ t: "remove", id: l.id });
        setLocal({ toast: local.toast + 1, msg: `Took out the ${state.menu[l.item]?.label ?? "item"}` });
      }
    };

    const line = placed
      ? `${nm(placed.by)} placed it · ${usd(total + fee)}${fee ? ` with ${usd(fee)} delivery` : " · free delivery"}`
      : !state.lines.length
        ? `Add something · ${usd(state.min)} gets free delivery`
        : left > 0
          ? `${usd(total)} · ${usd(left)} more for free delivery`
          : `${usd(total)} · free delivery unlocked`;

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.said ? `${state.said.name}: “${state.said.said}”` : `From ${state.shop}`} />
        <Canvas
          height={H}
          label={`Delivery scooter with ${state.lines.length} items in its crate, ${usd(total)} of ${usd(state.min)} for free delivery${placed ? ", order placed" : ""}`}
          draw={(g, f) => drawScene(g, f, state, me, ctx)}
          onPointer={onPointer}
        />
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: "18px", color: left > 0 || placed ? c.secondaryText : c.text, fontWeight: left > 0 || placed ? 400 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</div>
        {placed ? null : (
          <div style={{ display: "flex", gap: 6, height: 44, overflow: "hidden", marginTop: 2 }}>
            {page.map((i) => state.menu[i]!).map((m, k) => ({ m, i: page[k]! })).map(({ m, i }) => (
              <button
                key={i}
                type="button"
                aria-label={`Add ${m.label}, ${usd(m.cents)}`}
                disabled={state.lines.length >= CAP}
                onClick={() => { haptic("light"); dispatch({ t: "add", item: i }); setLocal({ toast: local.toast + 1, msg: `Added ${m.label}` }); }}
                style={{ height: 44, minWidth: 44, padding: 0, border: "none", background: "transparent", font: "inherit", cursor: "pointer", flex: "none", display: "flex", alignItems: "center" }}
              >
                <span style={{ height: 32, lineHeight: "32px", padding: "0 12px", borderRadius: 16, background: c.wash, color: c.text, fontSize: 13, whiteSpace: "nowrap", display: "block" }}>
                  {`+ ${m.label} `}
                  <span style={{ color: c.secondaryText }}>{usd(m.cents)}</span>
                </span>
              </button>
            ))}
            {pages.length > 1 ? (
              <button type="button" aria-label="More dishes" onClick={() => setLocal({ page: local.page + 1 })} style={{ height: 44, minWidth: 44, padding: 0, border: "none", background: "transparent", font: "inherit", cursor: "pointer", flex: "none", display: "flex", alignItems: "center" }}>
                <span style={{ height: 32, lineHeight: "32px", padding: "0 12px", borderRadius: 16, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 15, fontWeight: 600, display: "block" }}>{"\u2026"}</span>
              </button>
            ) : null}
          </div>
        )}
        <div style={{ marginTop: placed ? 8 : 2, display: "flex", gap: 6, height: 30, overflow: "hidden" }}>
          {shares.slice(0, theme.width < 360 ? 3 : 4).map((x) => (
            <div key={x.id} style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 10px 0 4px", borderRadius: 15, background: x.id === me ? c.selected : c.wash, fontSize: 13, whiteSpace: "nowrap" }}>
              {inChat(ctx, x.id) ? <Avatar user={x.id} size={22} /> : null}
              <span style={{ fontWeight: 600, color: c.text }}>{usd(x.cents)}</span>
            </div>
          ))}
          {shares.length > (theme.width < 360 ? 3 : 4) ? <span style={{ alignSelf: "center", fontSize: 13, color: c.secondaryText }}>{`+${shares.length - (theme.width < 360 ? 3 : 4)}`}</span> : null}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {placed ? "On the way" : mine.length ? `Yours: ${mine.map((l) => state.menu[l.item]?.label).join(", ")}` : `${people(state).length} in · tap a dish to add`}
          </span>
          {placed ? null : (
            <Button kind="primary" disabled={!state.lines.length} onClick={() => { haptic("success"); dispatch({ t: "place" }); setLocal({ toast: local.toast + 1, msg: "Order placed" }); }}>
              Place order
            </Button>
          )}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
