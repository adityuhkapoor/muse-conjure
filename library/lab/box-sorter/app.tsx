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
  type Ctx,
  type DrawFrame,
  type Theme,
} from "@muse/app";

// Box sorter: a friend's move-out, two weeks left. Their stuff rides a conveyor belt as drawn
// things; drag the one at the front down into Keep, Sell or Give. Whatever lands in Sell turns into
// a drafted listing with a price. Some things cannot be sold: drop one in Sell and the box shakes.

type Kind = "lamp" | "fridge" | "hangers" | "cooker" | "chair" | "books" | "plant" | "mirror" | "fan" | "box";
type Params = {
  /** Whose move-out */
  owner: string;
  /** When: "moves out in 14 days" */
  when: string;
  /** 3 to 14 things, in belt order. kind picks the drawing; noSell marks what the owner will never sell */
  items: { name: string; kind: Kind; priceCents: number; noSell?: boolean }[];
  /** Already sorted: item index, the box, who, and what they said */
  sorted: { item: number; box: "keep" | "sell" | "give"; who: string; said?: string }[];
};

// @params
const P: Params = {
  owner: "Arun",
  when: "moves out in 14 days",
  items: [
    { name: "40 hangers", kind: "hangers", priceCents: 0 },
    { name: "Mini fridge", kind: "fridge", priceCents: 4000 },
    { name: "Rice cooker", kind: "cooker", priceCents: 3000, noSell: true },
    { name: "Desk lamp", kind: "lamp", priceCents: 1200 },
    { name: "Desk chair", kind: "chair", priceCents: 2500 },
    { name: "Orgo textbooks", kind: "books", priceCents: 6000 },
    { name: "Pothos plant", kind: "plant", priceCents: 800 },
    { name: "Box fan", kind: "fan", priceCents: 1500 },
    { name: "Full mirror", kind: "mirror", priceCents: 2000 },
  ],
  sorted: [
    { item: 0, box: "give", who: "Calvin", said: "nobody needs 40 hangers" },
    { item: 1, box: "sell", who: "Maya", said: "$40 firm, i've seen the comps" },
    { item: 2, box: "keep", who: "Arun", said: "obviously" },
  ],
};
// @end params

const BOXES = ["keep", "sell", "give"] as const;
type Box = (typeof BOXES)[number];
type Item = { name: string; kind: Kind; price: number; noSell: boolean; box: Box | ""; by: string; said: string; at: number };
type State = { owner: string; when: string; items: Item[]; posted: { by: string; at: number } | null };
type Action = { t: "sort"; item: number; box: Box } | { t: "unsort"; item: number } | { t: "post" };
type Local = { drag: boolean; dx: number; dy: number; shakeAt: number; toast: number; msg: string };

const KINDS: Kind[] = ["lamp", "fridge", "hangers", "cooker", "chair", "books", "plant", "mirror", "fan", "box"];
const H = 214;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => (c === 0 ? "free" : `$${Math.round(c / 100)}`);
const isBox = (v: unknown): v is Box => typeof v === "string" && (BOXES as readonly string[]).includes(v);
const front = (s: State) => s.items.findIndex((i) => i.box === "");
const selling = (s: State) => s.items.filter((i) => i.box === "sell");

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
  const items: Item[] = [];
  for (const it of Array.isArray(P.items) ? P.items : []) {
    if (items.length >= 14 || !it) continue;
    const name = clean(it.name, 22);
    if (!name) continue;
    items.push({
      name,
      kind: KINDS.includes(it.kind) ? it.kind : "box",
      price: Number.isInteger(it.priceCents) && it.priceCents >= 0 && it.priceCents <= 500_000 ? it.priceCents : 0,
      noSell: it.noSell === true,
      box: "",
      by: "",
      said: "",
      at: 0,
    });
  }
  if (!items.length) items.push({ name: "Mystery box", kind: "box", price: 0, noSell: false, box: "", by: "", said: "", at: 0 });
  for (const so of Array.isArray(P.sorted) ? P.sorted : []) {
    const it = items[so?.item as number];
    if (!it || it.box || !isBox(so.box) || (so.box === "sell" && it.noSell)) continue;
    const who = clean(so.who, 20);
    const m = ctx.members.find((x) => x.id === who || x.name.trim().toLowerCase() === who.toLowerCase());
    it.box = so.box;
    it.by = m ? m.id : `o:${who || "Friend"}`;
    it.said = clean(so.said, 44);
  }
  return { owner: clean(P.owner, 20) || "Your friend", when: clean(P.when, 32), items, posted: null };
}

// ---- drawings: each thing fits a box of size s centered on (x, y) ----

function thing(g: CanvasRenderingContext2D, kind: Kind, x: number, y: number, s: number, t: Theme) {
  const p = pal(t);
  const c = t.color;
  const u = s / 40;
  g.save();
  g.translate(x, y);
  g.scale(u, u);
  g.lineCap = "round";
  g.lineJoin = "round";
  const metal = mix(c.secondaryText, c.card, 0.35);
  switch (kind) {
    case "lamp":
      g.fillStyle = metal;
      g.beginPath();
      g.roundRect(-10, 15, 20, 4, 2);
      g.fill();
      g.strokeStyle = metal;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(-2, 15);
      g.lineTo(-8, -2);
      g.lineTo(6, -12);
      g.stroke();
      g.fillStyle = p.yellow;
      g.beginPath();
      g.moveTo(0, -18);
      g.lineTo(16, -8);
      g.lineTo(8, 0);
      g.closePath();
      g.fill();
      break;
    case "fridge":
      g.fillStyle = mix(p.blue, c.card, 0.55);
      g.beginPath();
      g.roundRect(-13, -18, 26, 37, 4);
      g.fill();
      g.strokeStyle = mix(p.blue, p.dark, 0.2);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-13, -6);
      g.lineTo(13, -6);
      g.moveTo(8, -14);
      g.lineTo(8, -9);
      g.moveTo(8, -2);
      g.lineTo(8, 6);
      g.stroke();
      g.fillStyle = p.red;
      g.beginPath();
      g.arc(-5, 4, 2.5, 0, Math.PI * 2);
      g.fill();
      break;
    case "hangers":
      g.strokeStyle = t.mode === "dark" ? mix(p.brown, c.text, 0.35) : mix(p.brown, c.card, 0.1);
      g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const oy = -6 + i * 6;
        g.beginPath();
        g.moveTo(-16, oy + 8);
        g.lineTo(0, oy - 2);
        g.lineTo(16, oy + 8);
        g.closePath();
        g.stroke();
      }
      g.beginPath();
      g.arc(0, -12, 4, Math.PI, Math.PI * 2.4);
      g.stroke();
      break;
    case "cooker":
      g.fillStyle = mix(p.cream, c.card, 0.2);
      g.beginPath();
      g.ellipse(0, 4, 17, 14, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(p.red, c.card, 0.25);
      g.beginPath();
      g.ellipse(0, -7, 15, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.dark;
      g.beginPath();
      g.roundRect(-4, -15, 8, 4, 2);
      g.fill();
      g.fillStyle = p.green;
      g.beginPath();
      g.arc(-7, 9, 2, 0, Math.PI * 2);
      g.fill();
      break;
    case "chair":
      g.fillStyle = mix(p.purple, p.dark, 0.45);
      g.beginPath();
      g.roundRect(-11, -19, 22, 18, 5);
      g.roundRect(-13, 0, 26, 6, 3);
      g.fill();
      g.strokeStyle = metal;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(0, 6);
      g.lineTo(0, 13);
      g.moveTo(-12, 18);
      g.lineTo(0, 13);
      g.lineTo(12, 18);
      g.stroke();
      break;
    case "books":
      [p.purple, p.green, p.orange].forEach((col, i) => {
        g.fillStyle = col;
        g.beginPath();
        g.roundRect(-16 + i * 2, 8 - i * 9, 30 - i * 4, 8, 2);
        g.fill();
      });
      g.fillStyle = c.card;
      g.globalAlpha = 0.7;
      g.fillRect(-12, 10, 18, 2);
      g.globalAlpha = 1;
      break;
    case "plant":
      g.fillStyle = p.green;
      g.beginPath();
      for (const [lx, ly, r] of [[-8, -6, 7], [7, -9, 7], [0, -15, 6], [-12, 2, 5], [12, 1, 5]] as const) {
        g.moveTo(lx + r, ly);
        g.ellipse(lx, ly, r, r * 0.7, 0.3, 0, Math.PI * 2);
      }
      g.fill();
      g.fillStyle = mix(p.orange, p.brown, 0.3);
      g.beginPath();
      g.moveTo(-10, 6);
      g.lineTo(10, 6);
      g.lineTo(7, 19);
      g.lineTo(-7, 19);
      g.closePath();
      g.fill();
      break;
    case "mirror":
      g.fillStyle = p.brown;
      g.beginPath();
      g.roundRect(-9, -20, 18, 40, 9);
      g.fill();
      g.fillStyle = mix(p.sky, c.card, 0.2);
      g.beginPath();
      g.roundRect(-6, -17, 12, 34, 6);
      g.fill();
      g.strokeStyle = c.card;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-3, -8);
      g.lineTo(3, -14);
      g.stroke();
      break;
    case "fan":
      g.fillStyle = metal;
      g.beginPath();
      g.roundRect(-17, -17, 34, 34, 5);
      g.fill();
      g.fillStyle = c.card;
      g.beginPath();
      g.arc(0, 0, 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(p.blue, c.card, 0.3);
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        g.moveTo(0, 0);
        g.ellipse(Math.cos(a) * 6, Math.sin(a) * 6, 7, 3.5, a, 0, Math.PI * 2);
      }
      g.fill();
      break;
    default:
      g.fillStyle = p.crust;
      g.beginPath();
      g.roundRect(-16, -12, 32, 28, 3);
      g.fill();
      g.fillStyle = mix(p.crust, c.card, 0.4);
      g.fillRect(-4, -12, 8, 28);
  }
  g.restore();
}

export default defineApp<State, Action, Local>({
  name: "Box sorter",
  summary: (s) => {
    const left = s.items.filter((i) => !i.box).length;
    if (s.posted) return `${s.owner}'s move-out · ${selling(s).length} listings posted`;
    return `${s.owner}'s move-out · ${s.items.length - left} of ${s.items.length} sorted · ${selling(s).length} to sell`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "sort") {
      if (s.posted || !isBox(a.box) || typeof a.item !== "number" || a.item !== front(s)) return s;
      const it = s.items[a.item]!;
      if (a.box === "sell" && it.noSell) return s;
      return { ...s, items: s.items.map((x, i) => (i === a.item ? { ...x, box: a.box, by: m.user, said: "", at: m.time } : x)) };
    }
    if (a.t === "unsort") {
      if (s.posted || typeof a.item !== "number") return s;
      const it = s.items[a.item];
      if (!it || !it.box || it.by !== m.user) return s;
      return { ...s, items: s.items.map((x, i) => (i === a.item ? { ...x, box: "", by: "", said: "", at: 0 } : x)) };
    }
    if (a.t === "post") {
      if (s.posted || !selling(s).length) return s;
      return { ...s, posted: { by: m.user, at: m.time } };
    }
    return s;
  },

  invariants: {
    "nothing the owner keeps is for sale": (s) => s.items.every((i) => !(i.noSell && i.box === "sell")),
    "a sorted thing has a sorter": (s) => s.items.every((i) => (i.box === "") === (i.by === "")),
    "unsorted things have no time": (s) => s.items.every((i) => i.box !== "" || i.at === 0),
    "listings only go up with something to sell": (s) => s.posted === null || selling(s).length > 0,
    "prices are whole cents": (s) => s.items.every((i) => Number.isInteger(i.price) && i.price >= 0),
  },

  transitions: {
    "sorting takes the front of the belt": (p, n, a, m) =>
      a.t !== "sort" || p === n || (a.item === front(p) && n.items[a.item]!.box === a.box && n.items[a.item]!.by === m.user && n.items[a.item]!.at === m.time),
    "sorting touches one thing": (p, n, a) => a.t !== "sort" || p === n || n.items.filter((x, i) => x !== p.items[i]).length === 1,
    "only the sorter puts it back": (p, n, a, m) => a.t !== "unsort" || p === n || (p.items[a.item]!.by === m.user && n.items[a.item]!.box === "" && n.items.filter((x, i) => x !== p.items[i]).length === 1),
    "posted listings stay posted": (p, n) => p.posted === null || (n.posted === p.posted && JSON.stringify(n.items) === JSON.stringify(p.items)),
    "posting changes nothing else": (p, n, a, m) => a.t !== "post" || p === n || (n.items === p.items && n.posted?.by === m.user && n.posted.at === m.time),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const f = front(s);
    const x = r.next();
    if (x < 0.65 && f >= 0) return { t: "sort", item: f, box: r.pick([...BOXES]) };
    if (x < 0.85) {
      const mine = s.items.map((it, i) => (it.by === user ? i : -1)).filter((i) => i >= 0);
      if (mine.length) return { t: "unsort", item: r.pick(mine) };
    }
    if (f < 0 || r.next() < 0.15) return { t: "post" };
    return f >= 0 ? { t: "sort", item: f, box: r.pick([...BOXES]) } : { t: "post" };
  },

  local: { drag: false, dx: 0, dy: 0, shakeAt: 0, toast: 0, msg: "" },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const f = front(s);
    const belt = s.items.map((it, i) => ({ it, i })).filter((x) => !x.it.box);
    const lastAt = Math.max(0, ...s.items.map((i) => i.at));
    const adv = lastAt ? running(lastAt, 450) : null;
    const shake = local.shakeAt ? running(local.shakeAt, 500) : null;
    const binW = (W - 16) / 3;
    const binX = (b: number) => b * (binW + 8);
    const binTop = 118;
    const FRONT_X = 46, FRONT_Y = 52;
    const nameOf = (id: string) => (id.startsWith("o:") ? id.slice(2) : members.find((x) => x.id === id)?.name ?? "Someone");
    const boxLabel: Record<Box, string> = { keep: "Keep", sell: "Sell", give: "Give" };

    const draw = (g: CanvasRenderingContext2D, fr: DrawFrame) => {
      const w = fr.width;
      // the belt
      g.fillStyle = dark ? mix(c.wash, c.text, 0.1) : mix(c.secondaryText, c.card, 0.78);
      g.beginPath();
      g.roundRect(0, 78, w, 14, 7);
      g.fill();
      g.fillStyle = dark ? mix(c.wash, c.text, 0.22) : mix(c.secondaryText, c.card, 0.55);
      g.beginPath();
      const roll = ((adv ?? 450) / 450) * 26;
      for (let x = 7 - (roll % 26); x < w; x += 26) {
        g.moveTo(x + 4, 85);
        g.arc(x, 85, 4, 0, Math.PI * 2);
      }
      g.fill();
      // things on the belt; the front one is bigger and sits on a spot
      const slide = adv !== null ? (1 - adv / 450) * 62 : 0;
      g.fillStyle = mix(c.primary, c.card, dark ? 0.75 : 0.88);
      g.beginPath();
      g.arc(FRONT_X, FRONT_Y, 34, 0, Math.PI * 2);
      g.fill();
      belt.slice(0, 6).forEach((b, k) => {
        if (k === 0) return;
        const x = FRONT_X + 32 + k * 56 + slide;
        if (x > w + 20) return;
        thing(g, b.it.kind, x, 56, 36, theme);
      });
      if (f >= 0) {
        const it = s.items[f]!;
        const sx = shake !== null ? Math.sin(shake / 22) * 6 * (1 - shake / 500) : 0;
        const fx = local.drag ? local.dx : FRONT_X + slide + sx;
        const fy = local.drag ? local.dy : FRONT_Y;
        thing(g, it.kind, fx, fy, local.drag ? 58 : 52, theme);
      }
      // the three boxes, open at the top
      let moving = adv !== null || shake !== null;
      BOXES.forEach((b, k) => {
        const x = binX(k);
        const inside = s.items.filter((i) => i.box === b);
        const bs = b === "sell" && shake !== null ? Math.sin(shake / 20) * 4 * (1 - shake / 500) : 0;
        const col = mix(p.crust, c.card, dark ? 0.4 : 0.22);
        // things peeking out
        inside.slice(-4).forEach((it, j) => {
          const fly = it.at ? running(it.at, 450) : null;
          if (fly !== null) moving = true;
          const tx = x + binW / 2 - 24 + (j % 4) * 16 + bs;
          const ty = binTop + 6 - (j % 2) * 6;
          if (fly !== null) {
            const e = 1 - (1 - fly / 450) ** 3;
            thing(g, it.kind, FRONT_X + (tx - FRONT_X) * e, FRONT_Y + (ty - FRONT_Y) * e - Math.sin(e * Math.PI) * 30, 30, theme);
          } else thing(g, it.kind, tx, ty, 30, theme);
        });
        // flaps and body
        g.fillStyle = mix(col, p.dark, 0.18);
        g.beginPath();
        g.moveTo(x + bs, binTop + 14);
        g.lineTo(x - 6 + bs, binTop + 2);
        g.lineTo(x + 16 + bs, binTop + 2);
        g.lineTo(x + 22 + bs, binTop + 14);
        g.moveTo(x + binW + bs, binTop + 14);
        g.lineTo(x + binW + 6 + bs, binTop + 2);
        g.lineTo(x + binW - 16 + bs, binTop + 2);
        g.lineTo(x + binW - 22 + bs, binTop + 14);
        g.fill();
        g.fillStyle = col;
        g.beginPath();
        g.roundRect(x + bs, binTop + 14, binW, H - binTop - 16, [2, 2, 8, 8]);
        g.fill();
        g.fillStyle = mix(col, c.card, 0.35);
        g.fillRect(x + binW / 2 - 6 + bs, binTop + 14, 12, H - binTop - 16);
        // label on a strip of tape
        g.fillStyle = c.card;
        g.beginPath();
        g.roundRect(x + 8 + bs, binTop + 34, binW - 16, 40, 6);
        g.fill();
        g.textAlign = "center";
        g.textBaseline = "middle";
        const lab = fitText(boxLabel[b], binW - 24, { g, size: 15, weight: 700, min: 11, family: theme.type.family });
        g.font = lab.font;
        g.fillStyle = c.text;
        g.fillText(lab.text, x + binW / 2 + bs, binTop + 47);
        const cnt = fitText(`${inside.length} ${inside.length === 1 ? "thing" : "things"}`, binW - 24, { g, size: 11, weight: 400, min: 9, family: theme.type.family });
        g.font = cnt.font;
        g.fillStyle = c.secondaryText;
        g.fillText(cnt.text, x + binW / 2 + bs, binTop + 64);
      });
      if (!local.drag && f === 0 && !s.items.some((i) => i.box)) {
        g.strokeStyle = c.primary;
        g.lineWidth = 2;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.moveTo(FRONT_X, FRONT_Y + 40);
        g.quadraticCurveTo(FRONT_X + 10, binTop, binX(1) + binW / 2 - 10, binTop + 26);
        g.stroke();
        g.setLineDash([]);
      }
      // drag target hint
      if (local.drag) {
        const k = Math.max(0, Math.min(2, Math.floor(local.dx / (binW + 8))));
        g.strokeStyle = c.primary;
        g.lineWidth = 2;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.roundRect(binX(k) - 3, binTop - 2, binW + 6, H - binTop, 10);
        g.stroke();
        g.setLineDash([]);
      }
      return moving;
    };

    const sortInto = (b: Box) => {
      if (f < 0 || s.posted) return;
      const it = s.items[f]!;
      if (b === "sell" && it.noSell) {
        setLocal({ shakeAt: freshNow(), drag: false, toast: local.toast + 1, msg: `${s.owner} will never sell the ${it.name.toLowerCase()}` });
        haptic("medium");
        return;
      }
      dispatch({ t: "sort", item: f, box: b });
      setLocal({ drag: false, msg: "" });
      haptic("light");
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (f < 0 || s.posted) return;
      if (e.type === "down") {
        if (Math.hypot(e.x - FRONT_X, e.y - FRONT_Y) < 40) setLocal({ drag: true, dx: e.x, dy: e.y });
      } else if (e.type === "move") {
        if (local.drag) setLocal({ dx: e.x, dy: e.y });
      } else if (local.drag) {
        if (e.y > binTop - 20) sortInto(BOXES[Math.max(0, Math.min(2, Math.floor(e.x / (binW + 8))))]!);
        else setLocal({ drag: false });
      }
    };

    const sells = selling(s);
    const latest = [...s.items].filter((i) => i.box).sort((a, b) => b.at - a.at)[0];
    const quote = latest?.said ? latest : s.items.find((i) => i.said);
    const frontItem = f >= 0 ? s.items[f]! : null;
    const mineLast = [...s.items.map((it, i) => ({ it, i }))].filter((x) => x.it.by === me).sort((a, b) => b.it.at - a.it.at)[0];

    return (
      <div>
        <CardHeader title={`${s.owner}'s move-out`} subtitle={`${s.when ? `${s.when} · ` : ""}${s.items.length - belt.length} of ${s.items.length} sorted`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} drag label={`Conveyor belt with ${belt.length} things left; keep ${s.items.filter((i) => i.box === "keep").length}, sell ${sells.length}, give ${s.items.filter((i) => i.box === "give").length}`} draw={draw} onPointer={onPointer} />
          {frontItem && !local.drag ? (
            <div style={{ position: "absolute", left: FRONT_X + 40, top: 6, maxWidth: W - FRONT_X - 52, padding: "1px 8px", borderRadius: 10, background: c.card, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>
              {`${frontItem.name}${frontItem.noSell ? "" : ` · ${money(frontItem.price)}`} · drag it into a box`}
            </div>
          ) : null}
          {!frontItem ? (
            <div style={{ position: "absolute", left: 0, right: 0, top: 40, textAlign: "center", fontSize: 14, fontWeight: 600, color: c.text, pointerEvents: "none" }}>Belt's empty · everything has a box</div>
          ) : null}
          {BOXES.map((b, k) => (
            <button
              key={b}
              aria-label={frontItem ? `${boxLabel[b]}: ${frontItem.name}` : boxLabel[b]}
              onClick={() => sortInto(b)}
              style={{ position: "absolute", left: binX(k), top: binTop + 14, width: binW, height: H - binTop - 16, background: "transparent", border: 0, padding: 0, cursor: frontItem ? "pointer" : "default" }}
            />
          ))}
          {BOXES.map((b, k) => {
            const who = [...new Set(s.items.filter((i) => i.box === b).map((i) => i.by))].slice(-2);
            return (
              <div key={`f${b}`} style={{ position: "absolute", left: binX(k) + binW - 4 - who.length * 14 - 6, top: H - 26, display: "flex", pointerEvents: "none" }}>
                {who.map((u) => (
                  <span key={u} style={{ display: "flex", marginLeft: -4, borderRadius: "50%", boxShadow: `0 0 0 2px ${c.card}` }}>
                    <Avatar user={u.startsWith("o:") ? { id: u, name: nameOf(u) } : u} size={18} />
                  </span>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, height: 30, overflow: "hidden" }}>
          {sells.length ? (
            sells.slice(0, 3).map((it) => (
              <div key={it.name} style={{ flex: "0 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 4, padding: "0 10px", borderRadius: 15, background: c.wash, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden" }}>
                <span style={{ color: c.text, overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</span>
                <span style={{ color: c.text, fontWeight: 700 }}>{money(it.price)}</span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 13, lineHeight: "30px", color: c.secondaryText }}>Things in Sell turn into listings here</div>
          )}
          {sells.length > 3 ? <div style={{ flex: "none", fontSize: 13, lineHeight: "30px", color: c.secondaryText }}>{`+${sells.length - 3}`}</div> : null}
        </div>
        <div style={{ marginTop: 6, minHeight: 18, fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {quote ? `${nameOf(quote.by)} on the ${quote.name.toLowerCase()}: “${quote.said}”` : `${s.owner}'s stuff, ${s.items.length} things · start with the ${s.items[0]!.name.toLowerCase()}`}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: s.posted ? c.text : c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.posted ? `${sells.length} ${sells.length === 1 ? "listing" : "listings"} posted · ${money(sells.reduce((n, i) => n + i.price, 0))} if it all sells` : sells.length ? `${sells.length} to sell · ${money(sells.reduce((n, i) => n + i.price, 0))} in drafts` : "Nothing to sell yet"}
          </span>
          {!s.posted && mineLast ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "unsort", item: mineLast.i })}>
              Undo
            </Button>
          ) : null}
          {!s.posted && sells.length ? (
            <Button kind="primary" onClick={() => { dispatch({ t: "post" }); haptic("success"); setLocal({ toast: local.toast + 1, msg: "Listings posted to Marketplace" }); }}>
              {`Post ${sells.length}`}
            </Button>
          ) : null}
        </div>
        {local.toast > 0 && local.msg ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
