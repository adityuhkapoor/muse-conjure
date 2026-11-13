import {
  defineApp,
  Burst,
  Button,
  CardHeader,
  Facepile,
  Placed,
  Scene,
  Strip,
  Toast,
  fitText,
  haptic,
  innerWidth,
  mix,
  pal,
  running,
  spring,
  springs,
  type Child,
  type Theme,
} from "@muse/app";

// Will it fit: roommates drop Marketplace finds onto a top-down floor plan of the room, see what
// fits, then share the plan. Money is integer cents; sizes are whole feet.

type Kind = "couch" | "desk" | "shelf" | "chair" | "rug" | "box";
type FixedKind = "bed" | "closet" | "counter";
type Fixed = { label: string; kind: FixedKind; x: number; y: number; w: number; h: number };
type Params = {
  room: string;
  cols: number;
  rows: number;
  fixed: Fixed[];
  finds: { name: string; priceCents: number; w: number; h: number; by: string; at: number[] | null }[];
};
type Spot = { x: number; y: number; rot: boolean; at: number };
type Find = { id: string; name: string; kind: Kind; price: number; w: number; h: number; by: string | null; spot: Spot | null };
type State = {
  room: string;
  cols: number;
  rows: number;
  fixed: Fixed[];
  finds: Find[];
  shared: { by: string; at: number } | null;
  loves: string[];
};
type Action =
  | { t: "place"; find: string; x: number; y: number }
  | { t: "rotate"; find: string }
  | { t: "remove"; find: string }
  | { t: "share" }
  | { t: "love" }
  | { t: "edit" }
  | { t: "add"; name: string; priceCents: number; w: number; h: number };
type Local = {
  held: string | null;
  ghost: { x: number; y: number; ok: boolean } | null;
  adding: boolean;
  name: string;
  price: string;
  w: number;
  h: number;
  hint: string;
  bonk: { find: string; n: number } | null;
  bursts: number;
};
type Ctx = { members: { id: string; name?: string }[] };
type Pal = ReturnType<typeof pal>;

// @params
const P: Params = {
  room: "Unit 4B",
  cols: 12,
  rows: 7,
  fixed: [
    { label: "Bed", kind: "bed", x: 9, y: 0, w: 3, h: 4 },
    { label: "Closet", kind: "closet", x: 0, y: 0, w: 2, h: 1 },
  ],
  finds: [
    { name: "Couch", priceCents: 18000, w: 4, h: 2, by: "Noa", at: null },
    { name: "Desk", priceCents: 9000, w: 3, h: 1, by: "Dev", at: null },
    { name: "Shelf", priceCents: 4000, w: 2, h: 1, by: "Maya", at: null },
    { name: "Chair", priceCents: 3500, w: 1, h: 1, by: "Dev", at: null },
    { name: "Rug", priceCents: 3000, w: 3, h: 3, by: "Maya", at: [5, 2] },
  ],
};
// @end params

const MAX_FINDS = 8;
const MAX_PRICE = 1_000_000;
const POP_MS = 450;
const pop = spring(springs.iosBouncy);

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);
const dims = (f: { w: number; h: number }, rot: boolean): [number, number] => (rot ? [f.h, f.w] : [f.w, f.h]);
const hit = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) => ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;

function kindOf(name: string): Kind {
  const s = name.toLowerCase();
  if (/couch|sofa|loveseat/.test(s)) return "couch";
  if (/desk|table/.test(s)) return "desk";
  if (/shelf|bookcase|dresser/.test(s)) return "shelf";
  if (/chair|stool|ottoman/.test(s)) return "chair";
  if (/rug|mat/.test(s)) return "rug";
  return "box";
}

/** Can find `id` stand at (x, y), turned or not? Rugs only need the floor; the rest need free floor. */
function fits(s: State, id: string, x: number, y: number, rot: boolean): boolean {
  const f = s.finds.find((o) => o.id === id);
  if (!f || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  const [w, h] = dims(f, rot);
  if (x < 0 || y < 0 || x + w > s.cols || y + h > s.rows) return false;
  if (f.kind === "rug") return true;
  if (s.fixed.some((p) => hit(x, y, w, h, p.x, p.y, p.w, p.h))) return false;
  if (hit(x, y, w, h, 0, s.rows - 2, 2, 2)) return false;
  return !s.finds.some((o) => {
    if (o.id === id || !o.spot || o.kind === "rug") return false;
    const [ow, oh] = dims(o, o.spot.rot);
    return hit(x, y, w, h, o.spot.x, o.spot.y, ow, oh);
  });
}

const placedOf = (s: State) => s.finds.filter((f) => f.spot);
const total = (s: State) => placedOf(s).reduce((t, f) => t + f.price, 0);
const spots = (s: State) => JSON.stringify(s.finds.map((f) => [f.id, f.spot ? [f.spot.x, f.spot.y, f.spot.rot] : null]));
const spotOf = (s: State, id: string) => {
  const f = s.finds.find((o) => o.id === id);
  return f?.spot ? [f.spot.x, f.spot.y, f.spot.rot] : null;
};
const othersSpots = (s: State, id: string) => JSON.stringify(s.finds.filter((f) => f.id !== id).map((f) => [f.id, f.spot ? [f.spot.x, f.spot.y, f.spot.rot] : null]));

function firstFit(s: State, f: Find): { x: number; y: number; ok: boolean } {
  const rot = f.spot?.rot ?? false;
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++) if (fits(s, f.id, x, y, rot)) return { x, y, ok: true };
  return { x: 0, y: 0, ok: false };
}

export default defineApp<State, Action, Local>({
  name: "Will it fit",
  summary: (s) => {
    const n = placedOf(s).length;
    return s.shared ? `${s.room} plan shared · ${n} finds fit` : `${s.room}: ${n} of ${s.finds.length} finds fit · ${money(total(s))}`;
  },

  init: (ctx) => {
    const cols = clamp(Math.floor(P.cols) || 12, 6, 16);
    const rows = clamp(Math.floor(P.rows) || 7, 4, 10);
    const fixed: Fixed[] = [];
    for (const f of P.fixed.slice(0, 3)) {
      if (f.kind !== "bed" && f.kind !== "closet" && f.kind !== "counter") continue;
      const w = clamp(Math.floor(f.w) || 1, 1, cols);
      const h = clamp(Math.floor(f.h) || 1, 1, rows);
      const x = clamp(Math.floor(f.x) || 0, 0, cols - w);
      const y = clamp(Math.floor(f.y) || 0, 0, rows - h);
      if (hit(x, y, w, h, 0, rows - 2, 2, 2) || fixed.some((o) => hit(x, y, w, h, o.x, o.y, o.w, o.h))) continue;
      fixed.push({ label: String(f.label).trim().slice(0, 12), kind: f.kind, x, y, w, h });
    }
    const finds: Find[] = [];
    P.finds.slice(0, MAX_FINDS).forEach((f, i) => {
      const name = String(f.name).trim().slice(0, 24);
      if (!name) return;
      const want = String(f.by).trim().toLowerCase();
      const by = want ? (ctx.members.find((m) => m.id === f.by || (m.name ?? "").toLowerCase() === want)?.id ?? null) : null;
      finds.push({
        id: `f${i}`,
        name,
        kind: kindOf(name),
        price: Number.isInteger(f.priceCents) && f.priceCents >= 0 && f.priceCents <= MAX_PRICE ? f.priceCents : 0,
        w: clamp(Math.floor(f.w) || 1, 1, 6),
        h: clamp(Math.floor(f.h) || 1, 1, 4),
        by,
        spot: null,
      });
    });
    let s: State = { room: P.room.trim().slice(0, 24) || "Room", cols, rows, fixed, finds, shared: null, loves: [] };
    P.finds.slice(0, MAX_FINDS).forEach((f, i) => {
      const id = `f${i}`;
      if (!Array.isArray(f.at) || f.at.length < 2 || !s.finds.some((o) => o.id === id)) return;
      const [x, y] = f.at;
      if (!fits(s, id, x!, y!, false)) return;
      s = { ...s, finds: s.finds.map((o) => (o.id === id ? { ...o, spot: { x: x!, y: y!, rot: false, at: 0 } } : o)) };
    });
    return s;
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "love") {
      if (!s.shared || s.shared.by === m.user) return s;
      return { ...s, loves: s.loves.includes(m.user) ? s.loves.filter((u) => u !== m.user) : [...s.loves, m.user] };
    }
    if (a.t === "edit") return s.shared ? { ...s, shared: null, loves: [] } : s;
    if (s.shared) return s;
    if (a.t === "add") {
      const name = typeof a.name === "string" ? a.name.trim() : "";
      if (s.finds.length >= MAX_FINDS || name.length < 1 || name.length > 24) return s;
      if (!Number.isInteger(a.priceCents) || a.priceCents < 0 || a.priceCents > MAX_PRICE) return s;
      if (!Number.isInteger(a.w) || a.w < 1 || a.w > 6 || !Number.isInteger(a.h) || a.h < 1 || a.h > 4) return s;
      const f: Find = { id: `f${m.seq}`, name, kind: kindOf(name), price: a.priceCents, w: a.w, h: a.h, by: m.user, spot: null };
      return s.finds.some((o) => o.id === f.id) ? s : { ...s, finds: [...s.finds, f] };
    }
    if (a.t === "share") {
      return placedOf(s).length >= 2 ? { ...s, shared: { by: m.user, at: m.time }, loves: [] } : s;
    }
    if (typeof a.find !== "string") return s;
    const id = a.find;
    const f = s.finds.find((o) => o.id === id);
    if (!f) return s;
    if (a.t === "place") {
      if (!Number.isInteger(a.x) || !Number.isInteger(a.y) || !fits(s, id, a.x, a.y, f.spot?.rot ?? false)) return s;
      const spot = { x: a.x, y: a.y, rot: f.spot?.rot ?? false, at: m.time };
      return { ...s, finds: s.finds.map((o) => (o.id === id ? { ...o, spot } : o)) };
    }
    if (a.t === "rotate") {
      if (!f.spot || f.kind === "rug" || !fits(s, id, f.spot.x, f.spot.y, !f.spot.rot)) return s;
      const spot = { ...f.spot, rot: !f.spot.rot, at: m.time };
      return { ...s, finds: s.finds.map((o) => (o.id === id ? { ...o, spot } : o)) };
    }
    if (a.t === "remove") {
      if (!f.spot) return s;
      return { ...s, finds: s.finds.map((o) => (o.id === id ? { ...o, spot: null } : o)) };
    }
    return s;
  },

  // Leavers stop loving the plan and stop being the finder; a shared plan stays shared.
  onMembers: (s, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    if (s.loves.every(here) && s.finds.every((f) => f.by === null || here(f.by))) return s;
    return { ...s, loves: s.loves.filter(here), finds: s.finds.map((f) => (f.by === null || here(f.by) ? f : { ...f, by: null })) };
  },

  invariants: {
    "every placed find fits": (s) => s.finds.every((f) => !f.spot || fits(s, f.id, f.spot.x, f.spot.y, f.spot.rot)),
    "room size in range": (s) => s.cols >= 6 && s.cols <= 16 && s.rows >= 4 && s.rows <= 10,
    "finds are well formed": (s) =>
      s.finds.length <= MAX_FINDS &&
      new Set(s.finds.map((f) => f.id)).size === s.finds.length &&
      s.finds.every((f) => Number.isInteger(f.price) && f.price >= 0 && f.w >= 1 && f.w <= 6 && f.h >= 1 && f.h <= 4),
    "a shared plan has two pieces placed": (s) => !s.shared || placedOf(s).length >= 2,
    "loves only on a shared plan, once each, from the chat, never the sharer": (s, ctx) =>
      (s.loves.length === 0 || !!s.shared) && new Set(s.loves).size === s.loves.length && s.loves.every((u) => inChat(ctx, u) && u !== s.shared?.by),
    "finders are in the chat": (s, ctx) => s.finds.every((f) => f.by === null || inChat(ctx, f.by)),
  },

  transitions: {
    "a shared plan does not move": (p, n) => !p.shared || !n.shared || spots(p) === spots(n),
    "place lands the find exactly there and moves nothing else": (p, n, a) => {
      if (a.t !== "place" || p === n) return true;
      const s = spotOf(n, a.find);
      return !!s && s[0] === a.x && s[1] === a.y && othersSpots(p, a.find) === othersSpots(n, a.find);
    },
    "rotate keeps the corner and flips only that find": (p, n, a) => {
      if (a.t !== "rotate" || p === n) return true;
      const before = spotOf(p, a.find);
      const after = spotOf(n, a.find);
      return !!before && !!after && before[0] === after[0] && before[1] === after[1] && before[2] !== after[2] && othersSpots(p, a.find) === othersSpots(n, a.find);
    },
    "remove empties one spot": (p, n, a) => {
      if (a.t !== "remove" || p === n) return true;
      return !!spotOf(p, a.find) && spotOf(n, a.find) === null && othersSpots(p, a.find) === othersSpots(n, a.find);
    },
    "share stamps the actor and time": (p, n, a, m) => a.t !== "share" || p === n || (n.shared?.by === m.user && n.shared.at === m.time && !p.shared),
    "love toggles only the actor": (p, n, a, m) => {
      if (a.t !== "love" || p === n) return true;
      const diff = [...p.loves.filter((u) => !n.loves.includes(u)), ...n.loves.filter((u) => !p.loves.includes(u))];
      return diff.length === 1 && diff[0] === m.user;
    },
    "edit reopens the plan and clears the loves": (p, n, a) => a.t !== "edit" || p === n || (!!p.shared && !n.shared && n.loves.length === 0 && spots(p) === spots(n)),
    "add appends one unplaced find by the actor": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.finds.at(-1);
      return n.finds.length === p.finds.length + 1 && !!last && last.by === m.user && last.spot === null && last.name === a.name.trim() && last.price === a.priceCents && JSON.stringify(n.finds.slice(0, -1)) === JSON.stringify(p.finds);
    },
    "only people in the chat change the plan": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (s.shared) {
      if (k < 0.6) return { t: "love" };
      if (k < 0.85) return { t: "edit" };
      return { t: "place", find: s.finds.length ? r.pick(s.finds).id : "f0", x: r.int(s.cols), y: r.int(s.rows) };
    }
    if (!s.finds.length || k < 0.08) {
      return { t: "add", name: r.pick(["Couch", "Desk", "Lamp", "Rug"]), priceCents: 500 * (1 + r.int(40)), w: 1 + r.int(4), h: 1 + r.int(2) };
    }
    const f = r.pick(s.finds);
    const j = r.next();
    if (j < 0.55) return { t: "place", find: f.id, x: r.int(s.cols), y: r.int(s.rows) };
    const placed = placedOf(s);
    if (j < 0.67 && placed.length) return { t: "rotate", find: r.pick(placed).id };
    if (j < 0.75 && placed.length) return { t: "remove", find: r.pick(placed).id };
    if (j < 0.83) return { t: "place", find: f.id, x: r.int(s.cols), y: r.int(s.rows) };
    return { t: "share" };
  },

  local: { held: null, ghost: null, adding: false, name: "", price: "", w: 2, h: 1, hint: "", bonk: null, bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const lab = theme.mode === "dark" ? c.wash : p.brown;
    const W = innerWidth();
    const { cols, rows } = state;
    const cell = Math.min(28, Math.floor((W - 12) / cols));
    const d = cell / 28;
    const ox = (W - cols * cell) / 2;
    const oy = 8;
    const ph = rows * cell + 20;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const placed = placedOf(state);
    const held = local.held ? state.finds.find((f) => f.id === local.held) : undefined;
    const shared = state.shared;

    const toCell = (e: PointerEvent, f: Find, rot: boolean) => {
      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const k = box.width > 0 ? W / box.width : 1;
      const px = (e.clientX - box.left) * k;
      const py = (e.clientY - box.top) * k;
      const [w, h] = dims(f, rot);
      return { px, py, x: clamp(Math.round((px - ox) / cell - w / 2), 0, cols - w), y: clamp(Math.round((py - oy) / cell - h / 2), 0, rows - h) };
    };

    const onDown = (e: PointerEvent) => {
      if (shared) return;
      if (held) {
        const rot = held.spot?.rot ?? false;
        const t = toCell(e, held, rot);
        if (fits(state, held.id, t.x, t.y, rot)) {
          dispatch({ t: "place", find: held.id, x: t.x, y: t.y });
          setLocal({ held: null, ghost: null, hint: "" });
        } else {
          setLocal({ ghost: { x: t.x, y: t.y, ok: false }, hint: "Doesn't fit there" });
        }
        return;
      }
      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const k = box.width > 0 ? W / box.width : 1;
      const cx = ((e.clientX - box.left) * k - ox) / cell;
      const cy = ((e.clientY - box.top) * k - oy) / cell;
      const hitFind = [...placed].reverse().find((f) => {
        if (f.kind === "rug" || !f.spot) return false;
        const [w, h] = dims(f, f.spot.rot);
        return cx >= f.spot.x && cx < f.spot.x + w && cy >= f.spot.y && cy < f.spot.y + h;
      });
      if (!hitFind || !hitFind.spot) return;
      if (fits(state, hitFind.id, hitFind.spot.x, hitFind.spot.y, !hitFind.spot.rot)) {
        dispatch({ t: "rotate", find: hitFind.id });
        setLocal({ hint: "" });
      } else {
        setLocal({ bonk: { find: hitFind.id, n: (local.bonk?.n ?? 0) + 1 }, hint: "No room to turn it" });
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!held || shared) return;
      const rot = held.spot?.rot ?? false;
      const t = toCell(e, held, rot);
      if (local.ghost && local.ghost.x === t.x && local.ghost.y === t.y) return;
      setLocal({ ghost: { x: t.x, y: t.y, ok: fits(state, held.id, t.x, t.y, rot) } });
    };

    const tapTile = (f: Find) => {
      if (shared) return;
      if (local.held === f.id) {
        setLocal({ held: null, ghost: null, hint: "" });
        return;
      }
      setLocal({ held: f.id, ghost: firstFit(state, f), hint: `Tap the floor to drop the ${f.name}`, adding: false });
    };

    // ---- Plan ----
    const art: Child[] = [];
    art.push(<rect key="frame" x={ox - 5} y={oy - 5} width={cols * cell + 10} height={rows * cell + 10} rx={10} fill={c.secondaryText} />);
    art.push(<rect key="floor" x={ox} y={oy} width={cols * cell} height={rows * cell} rx={4} fill={p.wall} />);
    for (let i = 1; i < cols; i++) art.push(<line key={`gx${i}`} x1={ox + i * cell} y1={oy} x2={ox + i * cell} y2={oy + rows * cell} stroke={p.rim} stroke-width={0.6} />);
    for (let j = 1; j < rows; j++) art.push(<line key={`gy${j}`} x1={ox} y1={oy + j * cell} x2={ox + cols * cell} y2={oy + j * cell} stroke={p.rim} stroke-width={0.6} />);
    art.push(<rect key="win" x={ox + 3 * cell} y={oy - 6} width={3 * cell} height={6} fill={p.sky} />);
    const doorTop = oy + (rows - 2) * cell;
    const doorBottom = oy + rows * cell;
    art.push(<rect key="gap" x={ox - 5} y={doorTop} width={6} height={2 * cell} fill={p.wall} />);
    art.push(<path key="swing" d={`M${ox} ${doorTop} A${2 * cell} ${2 * cell} 0 0 1 ${ox + 2 * cell} ${doorBottom}`} fill="none" stroke={p.brown} stroke-width={1} opacity={0.6} />);
    art.push(<line key="leaf" x1={ox} y1={doorBottom} x2={ox} y2={doorTop} stroke={p.brown} stroke-width={2.5} />);
    {
      const f = fitText("Door", 2 * cell - 8, { size: 11, min: 9 });
      art.push(<text key="door" x={ox + cell + 6} y={oy + (rows - 1) * cell + 6} text-anchor="middle" font-size={f.size} fill={lab}>{f.text}</text>);
    }
    for (const fx of state.fixed) {
      const X = ox + fx.x * cell;
      const Y = oy + fx.y * cell;
      const Wd = fx.w * cell;
      const Ht = fx.h * cell;
      const i = 2 * d;
      const parts: Child[] = [];
      if (fx.kind === "bed") {
        parts.push(<rect key="b" x={X + i} y={Y + i} width={Wd - 2 * i} height={Ht - 2 * i} rx={6 * d} fill={p.paper} stroke={p.rim} />);
        parts.push(<rect key="pi" x={X + 6 * d} y={Y + 6 * d} width={Wd - 12 * d} height={16 * d} rx={5 * d} fill={c.card} />);
        parts.push(<rect key="bl" x={X + i} y={Y + 40 * d} width={Wd - 2 * i} height={Math.max(2, Ht - 40 * d - i)} rx={6 * d} fill={p.sky} />);
      } else if (fx.kind === "closet") {
        parts.push(<rect key="c" x={X + i} y={Y + i} width={Wd - 2 * i} height={Ht - 2 * i} rx={2 * d} fill={p.shade} />);
        parts.push(<line key="cl" x1={X + Wd / 2} y1={Y + i} x2={X + Wd / 2} y2={Y + Ht - i} stroke={p.rim} stroke-width={1} />);
      } else {
        parts.push(<rect key="c" x={X + i} y={Y + i} width={Wd - 2 * i} height={Ht - 2 * i} rx={3 * d} fill={p.shade} />);
      }
      const lf = fitText(fx.label, Wd - 8, { size: 11, min: 9 });
      parts.push(<text key="t" x={X + Wd / 2} y={Y + Ht - 9} text-anchor="middle" font-size={lf.size} fill={fx.kind === "bed" ? lab : theme.mode === "dark" ? c.text : p.brown}>{lf.text}</text>);
      art.push(<g key={`fx${fx.x}-${fx.y}`}>{parts}</g>);
    }
    const order = [...placed.filter((f) => f.kind === "rug"), ...placed.filter((f) => f.kind !== "rug")];
    for (const f of order) {
      const sp = f.spot!;
      const [w, h] = dims(f, sp.rot);
      const X = ox + sp.x * cell;
      const Y = oy + sp.y * cell;
      const e = sp.at ? running(sp.at, POP_MS) : null;
      const sc = e === null ? 1 : 0.6 + 0.4 * pop(e);
      const cx = X + (w * cell) / 2;
      const cy = Y + (h * cell) / 2;
      const bonk = local.bonk && local.bonk.find === f.id && local.bonk.n > 0 ? local.bonk.n : 0;
      art.push(
        <g
          key={`${f.id}-${bonk}`}
          transform={sc === 1 ? undefined : `translate(${cx} ${cy}) scale(${sc}) translate(${-cx} ${-cy})`}
          {...(bonk ? { ref: (el: Element) => void (el as SVGElement).animate?.([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(0)" }], { duration: 350 }) } : {})}
        >
          {drawPiece(f.kind, X, Y, w * cell, h * cell, sp.rot, d, p, theme, true)}
        </g>,
      );
    }
    if (held && local.ghost) {
      const gs = local.ghost;
      const rot = held.spot?.rot ?? false;
      const [w, h] = dims(held, rot);
      const X = ox + gs.x * cell;
      const Y = oy + gs.y * cell;
      art.push(
        <g key="ghost" pointer-events="none">
          <g opacity={0.5}>{drawPiece(held.kind, X, Y, w * cell, h * cell, rot, d, p, theme, false)}</g>
          <rect x={X} y={Y} width={w * cell} height={h * cell} rx={4} fill={gs.ok ? c.positive : c.negative} fill-opacity={0.25} stroke={gs.ok ? c.positive : c.negative} stroke-width={1.5} />
        </g>,
      );
    }

    // ---- Tray ----
    const tiles = [...state.finds.filter((f) => !f.spot), ...state.finds.filter((f) => f.spot)];
    const strip = tiles.length + 1 > 4;
    const tileW = strip ? 86 : (W - 18) / 4;
    const tile = (f: Find) => {
      const on = !!f.spot;
      const sub = on ? "Placed" : `${money(f.price)} · ${f.w}×${f.h}`;
      const s = Math.min(13, (tileW - 10) / f.w, 36 / f.h);
      const nf = fitText(f.name, tileW - 12, { size: 13, min: 13 });
      return (
        <button
          key={f.id}
          type="button"
          aria-label={`${f.name}, ${f.w} by ${f.h} ft, ${money(f.price)}`}
          aria-pressed={local.held === f.id}
          onClick={() => tapTile(f)}
          style={{ flex: strip ? "none" : undefined, width: strip ? tileW : undefined, minWidth: 0, height: 84, borderRadius: 12, background: local.held === f.id ? c.selected : c.wash, display: "flex", flexDirection: "column", alignItems: "center", padding: 0, scrollSnapAlign: "start" }}
        >
          <svg width={tileW} height={44} viewBox={`0 0 ${tileW} 44`} aria-hidden="true" style={{ display: "block", marginTop: 0 }} opacity={on ? 0.35 : 1}>
            {drawPiece(f.kind, (tileW - f.w * s) / 2, 22 - (f.h * s) / 2, f.w * s, f.h * s, false, s / 28, p, theme, false)}
          </svg>
          <span style={{ maxWidth: "100%", padding: "0 6px", fontSize: 13, lineHeight: "16px", color: on ? c.secondaryText : c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nf.text}</span>
          <span style={{ maxWidth: "100%", padding: "0 6px", fontSize: 11, lineHeight: "15px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
        </button>
      );
    };
    const addTile = (
      <button
        key="add"
        type="button"
        disabled={!!shared || state.finds.length >= MAX_FINDS}
        onClick={() => setLocal({ adding: true, held: null, ghost: null })}
        style={{ flex: tiles.length === 0 ? 1 : strip ? "none" : undefined, width: strip ? tileW : undefined, minWidth: 0, height: 84, borderRadius: 12, border: `1.5px dashed ${c.divider}`, background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: 0, scrollSnapAlign: "start" }}
      >
        <span style={{ fontSize: 22, lineHeight: "24px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>+</span>
        <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>Add find</span>
      </button>
    );
    const narrow = theme.width < 380;
    const submit = () => {
      const dollars = Number(local.price.replace(/[^0-9.]/g, ""));
      dispatch({ t: "add", name: local.name.trim().slice(0, 24), priceCents: Number.isFinite(dollars) ? Math.round(dollars * 100) : 0, w: local.w, h: local.h });
      setLocal({ adding: false, name: "", price: "" });
    };

    const tray = local.adding ? (
      <form
        style={{ display: "grid", gridTemplateColumns: narrow ? "72px 1fr 1fr auto" : "1fr 72px 56px 56px auto", gap: 6, minHeight: 84, alignContent: "center" }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input {...(narrow ? { style: { gridColumn: "1 / -1" } } : {})} value={local.name} placeholder="Name" aria-label="Find name" onInput={(e) => setLocal({ name: e.currentTarget.value })} />
        <input value={local.price} placeholder="Price" aria-label="Price in dollars" inputMode="decimal" onInput={(e) => setLocal({ price: e.currentTarget.value })} />
        <select aria-label="Width in feet" value={String(local.w)} onInput={(e) => setLocal({ w: Number(e.currentTarget.value) || 2 })}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={String(n)}>{`${n} ft`}</option>
          ))}
        </select>
        <select aria-label="Depth in feet" value={String(local.h)} onInput={(e) => setLocal({ h: Number(e.currentTarget.value) || 1 })}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={String(n)}>{`${n} ft`}</option>
          ))}
        </select>
        <Button kind="primary" onClick={submit}>
          Add
        </Button>
      </form>
    ) : strip ? (
      <Strip label="Finds to place" gap={6}>
        {tiles.map(tile)}
        {addTile}
      </Strip>
    ) : (
      <div style={{ display: "flex", gap: 6 }}>
        {tiles.map((f) => (
          <div key={f.id} style={{ flex: 1, minWidth: 0, display: "flex" }}>
            {tile(f)}
          </div>
        ))}
        {tiles.length ? <div style={{ flex: 1, minWidth: 0, display: "flex" }}>{addTile}</div> : addTile}
      </div>
    );

    // ---- Footer ----
    const hint = local.hint
      ? local.hint
      : shared
        ? state.loves.length
          ? `${state.loves.length} love it`
          : `Shared by ${shared.by === me ? "you" : nameOf(shared.by)}`
        : held
          ? `Tap the floor to drop the ${held.name}`
          : state.finds.length
            ? "Pick a find, tap a piece to rotate"
            : "Add what you found on Marketplace";
    const iLove = state.loves.includes(me);
    const action = shared ? (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {state.loves.length ? <Facepile users={state.loves} size={24} /> : null}
        {shared.by === me ? (
          <Button kind="deemphasized" onClick={() => dispatch({ t: "edit" })}>
            Edit
          </Button>
        ) : (
          <Button kind="secondary" onClick={() => dispatch({ t: "love" })}>
            {iLove ? "Loved" : "Love it"}
          </Button>
        )}
      </div>
    ) : held && held.spot ? (
      <Button
        kind="secondary"
        onClick={() => {
          dispatch({ t: "remove", find: held.id });
          setLocal({ held: null, ghost: null, hint: "" });
        }}
      >
        Remove
      </Button>
    ) : (
      <Button
        kind={placed.length >= 2 && !local.adding ? "primary" : "secondary"}
        onClick={() => {
          if (placed.length < 2) {
            setLocal({ hint: "Place one more find first" });
            return;
          }
          dispatch({ t: "share" });
          setLocal({ bursts: local.bursts + 1, held: null, ghost: null, hint: "" });
          haptic("success");
        }}
      >
        Share plan
      </Button>
    );

    return (
      <div>
        <CardHeader title={`Will it fit? · ${state.room}`} subtitle={`${cols} × ${rows} ft · 1 sq = 1 ft`} />
        <Scene height={ph} label={`Floor plan of ${state.room} with ${placed.length} of ${state.finds.length} finds placed`} art={<g>{art}</g>}>
          <div style={{ position: "absolute", inset: 0, touchAction: "pan-y" }} onPointerDown={onDown} onPointerMove={onMove} />
          {order.map((f) => {
            const sp = f.spot!;
            const [w] = dims(f, sp.rot);
            return f.by ? <Placed key={f.id} user={f.by} me={me} size={16} x={(ox + (sp.x + w) * cell - 8) / W} y={(oy + sp.y * cell + 8) / ph} /> : null;
          })}
        </Scene>
        {tray}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 46 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, lineHeight: "20px", fontWeight: 600 }}>{`${money(total(state))} of finds`}</div>
            <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</small>
          </div>
          <div style={{ flex: "none" }}>{action}</div>
        </div>
        {local.bursts > 0 && shared?.by === me ? <Burst key={local.bursts} emoji="❤️" /> : null}
        {shared ? <Toast key={shared.at}>It fits. Plan shared</Toast> : null}
      </div>
    );
  },
});

// ---- Drawing ----

/** One piece of furniture inside the pixel box (X, Y, W, H). `d` scales details (1 at 28 px per foot). */
function drawPiece(kind: Kind, X: number, Y: number, W: number, H: number, rot: boolean, d: number, p: Pal, t: Theme, shadow: boolean): Child {
  const c = t.color;
  const i = 2 * d;
  const x = X + i;
  const y = Y + i;
  const w = Math.max(2, W - 2 * i);
  const hh = Math.max(2, H - 2 * i);
  const parts: Child[] = [];
  if (shadow) parts.push(<rect key="sh" x={x} y={y + 2} width={w} height={hh} rx={kind === "rug" ? 6 * d : 8 * d} fill={p.shade} opacity={0.4} />);
  if (kind === "couch") {
    const back = 10 * d;
    const cush = mix(p.green, c.card, 0.25);
    parts.push(<rect key="body" x={x} y={y} width={w} height={hh} rx={8 * d} fill={p.green} />);
    parts.push(rot ? <rect key="back" x={x} y={y} width={back} height={hh} rx={5 * d} fill={p.leaf} /> : <rect key="back" x={x} y={y} width={w} height={back} rx={5 * d} fill={p.leaf} />);
    for (let k = 0; k < 3; k++) {
      if (rot) {
        const ah = hh - 6 * d;
        const ch = (ah - 4 * d) / 3;
        parts.push(<rect key={`c${k}`} x={x + back + 2 * d} y={y + 3 * d + k * (ch + 2 * d)} width={Math.max(1, w - back - 5 * d)} height={Math.max(1, ch)} rx={5 * d} fill={cush} />);
      } else {
        const aw = w - 6 * d;
        const cw = (aw - 4 * d) / 3;
        parts.push(<rect key={`c${k}`} x={x + 3 * d + k * (cw + 2 * d)} y={y + back + 2 * d} width={Math.max(1, cw)} height={Math.max(1, hh - back - 5 * d)} rx={5 * d} fill={cush} />);
      }
    }
  } else if (kind === "desk") {
    parts.push(<rect key="body" x={x} y={y} width={w} height={hh} rx={3 * d} fill={p.crust} />);
    const long = w >= hh;
    const mw = Math.min(28 * d, (long ? w : hh) - 8 * d);
    parts.push(long ? <rect key="mon" x={x + (w - mw) / 2} y={y + (hh - 5 * d) / 2} width={Math.max(1, mw)} height={5 * d} rx={1} fill={p.dark} /> : <rect key="mon" x={x + (w - 5 * d) / 2} y={y + (hh - mw) / 2} width={5 * d} height={Math.max(1, mw)} rx={1} fill={p.dark} />);
    parts.push(<circle key="lamp" cx={x + 8 * d} cy={y + 8 * d} r={3 * d} fill={p.yellow} />);
  } else if (kind === "shelf") {
    parts.push(<rect key="body" x={x} y={y} width={w} height={hh} rx={2 * d} fill={p.brown} />);
    const hues = [p.red, p.green, p.yellow, p.blue];
    const long = w >= hh;
    const span = (long ? w : hh) - 3 * d;
    for (let k = 0; 3 * d + k * 7.5 * d + 5 * d <= span; k++) {
      const o = 3 * d + k * 7.5 * d;
      parts.push(long ? <rect key={`b${k}`} x={x + o} y={y + 3 * d} width={5 * d} height={Math.max(1, hh - 6 * d)} fill={hues[k % 4]} /> : <rect key={`b${k}`} x={x + 3 * d} y={y + o} width={Math.max(1, w - 6 * d)} height={5 * d} fill={hues[k % 4]} />);
    }
  } else if (kind === "chair") {
    const cx = X + W * 0.14;
    const cy = Y + H * 0.14;
    const cw = W * 0.72;
    const ch = H * 0.72;
    parts.push(<rect key="body" x={cx} y={cy} width={cw} height={ch} rx={6 * d} fill={p.yellow} />);
    parts.push(rot ? <rect key="back" x={cx} y={cy} width={cw * 0.22} height={ch} rx={3 * d} fill={p.crust} /> : <rect key="back" x={cx} y={cy} width={cw} height={ch * 0.22} rx={3 * d} fill={p.crust} />);
  } else if (kind === "rug") {
    parts.push(<rect key="body" x={x} y={y} width={w} height={hh} rx={6 * d} fill={p.red} opacity={0.55} />);
    parts.push(<rect key="ring" x={X + 6 * d} y={Y + 6 * d} width={Math.max(1, W - 12 * d)} height={Math.max(1, H - 12 * d)} rx={3 * d} fill="none" stroke={c.card} stroke-width={1.5} opacity={0.6} />);
    for (let k = -1; k <= 1; k++) parts.push(<circle key={`d${k}`} cx={W >= H ? X + W / 2 + k * 16 * d : X + W / 2} cy={W >= H ? Y + H / 2 : Y + H / 2 + k * 16 * d} r={3 * d} fill={c.card} opacity={0.5} />);
  } else {
    parts.push(<rect key="body" x={x} y={y} width={w} height={hh} rx={4 * d} fill={p.cream} stroke={p.rim} />);
    parts.push(rot ? <line key="tape" x1={x} y1={y + hh / 2} x2={x + w} y2={y + hh / 2} stroke={p.crust} stroke-width={Math.max(1, 3 * d)} /> : <line key="tape" x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + hh} stroke={p.crust} stroke-width={Math.max(1, 3 * d)} />);
  }
  return <g>{parts}</g>;
}
