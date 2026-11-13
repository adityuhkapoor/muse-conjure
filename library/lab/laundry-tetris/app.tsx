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
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Larkin laundry: Sunday night, six loads, four washers, two dryers, everyone dry by 10. Tap the
// bags in the order they go in; each load drops into the first free washer, then slides on into the
// first free dryer, like blocks falling sideways. The dryers are the squeeze, so the order is the
// puzzle. Post your finish time; the earliest clean finish tops the board.

type Params = {
  /** Card title: "Larkin laundry" */
  title: string;
  /** Under the title: "everyone dry by 10 · tap bags in order" */
  sub: string;
  /** Minutes after noon the room opens, e.g. 410 for 6:50pm. */
  opens: number;
  /** Minutes after noon everything must be dry, e.g. 600 for 10:00pm. */
  due: number;
  /** Washer count (2 to 5). */
  washers: number;
  /** Dryer count (1 to 3). */
  dryers: number;
  /** The loads: whose, what it is, wash and dry minutes. */
  loads: { who: string; what: string; wash: number; dry: number }[];
  /** Friends who already solved it: their load order (by owner name) and a line. */
  board: { name: string; order: string[]; said?: string }[];
};

// @params
const P: Params = {
  title: "Larkin laundry",
  sub: "everyone dry by 10 · tap bags in order",
  opens: 410,
  due: 600,
  washers: 4,
  dryers: 2,
  loads: [
    { who: "Will", what: "the comforter", wash: 50, dry: 80 },
    { who: "Calvin", what: "7 hoodies", wash: 35, dry: 50 },
    { who: "Maya", what: "darks, sorted", wash: 30, dry: 40 },
    { who: "Arun", what: "rice apron", wash: 30, dry: 45 },
    { who: "Tsai Lin", what: "gym stuff", wash: 35, dry: 35 },
    { who: "Aditya", what: "lowkey all of it", wash: 40, dry: 55 },
  ],
  board: [
    { name: "Maya", order: ["Calvin", "Maya", "Will", "Arun", "Aditya", "Tsai Lin"], said: "i made a sheet for this" },
    { name: "Arun", order: ["Calvin", "Maya", "Will", "Tsai Lin", "Aditya", "Arun"], said: "apron last, it needs to think" },
    { name: "Will", order: ["Will", "Calvin", "Maya", "Tsai Lin", "Arun", "Aditya"], said: "the comforter goes first. always." },
  ],
};
// @end params

type Load = { who: string; name: string; what: string; wash: number; dry: number };
type Post = { who: string; name: string; order: number[]; end: number; tries: number; said: string; at: number };
type State = { title: string; sub: string; opens: number; due: number; washers: number; dryers: number; loads: Load[]; board: Post[] };
type Action = { t: "post"; order: number[] } | { t: "clear" };
type Local = { order: number[]; at: number; toast: number };
type Block = { load: number; lane: number; from: number; to: number; dry: boolean };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const chan = (c: string) => {
  if (c.startsWith("#")) {
    const h = c.length === 4 ? c.slice(1).split("").map((x) => x + x).join("") : c.slice(1, 7);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = c.match(/[\d.]+/g) ?? [];
  return [0, 1, 2].map((i) => Number(m[i] ?? 0));
};
const lum = (c: string) => {
  const [r, g, b] = chan(c).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
/** Text color for a fill: whichever of two theme colors reads better on it. */
const onFill = (bg: string, a: string, b: string) => (ratio(a, bg) >= ratio(b, bg) ? a : b);

/** The whole schedule for an order: each load to the first free washer, then the first free dryer. */
function schedule(s: Pick<State, "washers" | "dryers" | "loads">, order: number[]): { blocks: Block[]; end: number } {
  const w = Array.from({ length: s.washers }, () => 0);
  const d = Array.from({ length: s.dryers }, () => 0);
  const blocks: Block[] = [];
  let end = 0;
  for (const i of order) {
    const l = s.loads[i];
    if (!l) continue;
    let k = 0;
    for (let j = 1; j < w.length; j++) if (w[j]! < w[k]!) k = j;
    const ws = w[k]!;
    w[k] = ws + l.wash;
    blocks.push({ load: i, lane: k, from: ws, to: ws + l.wash, dry: false });
    let q = 0;
    for (let j = 1; j < d.length; j++) if (Math.max(d[j]!, w[k]!) < Math.max(d[q]!, w[k]!)) q = j;
    const ds = Math.max(d[q]!, w[k]!);
    d[q] = ds + l.dry;
    blocks.push({ load: i, lane: s.washers + q, from: ds, to: ds + l.dry, dry: true });
    end = Math.max(end, ds + l.dry);
  }
  return { blocks, end };
}
const isPerm = (o: unknown, n: number): o is number[] =>
  Array.isArray(o) && o.length === n && o.every((x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x < n) && new Set(o).size === n;
const clockOf = (s: State, m: number) => {
  const t = s.opens + m;
  const h = Math.floor(t / 60) % 12 || 12;
  return `${h}:${String(t % 60).padStart(2, "0")}`;
};
/** Clean finishes first (earliest), then late ones; ties go to whoever posted first. */
const ranked = (s: State) => [...s.board].sort((a, b) => a.end - b.end || a.at - b.at);
const okFinish = (s: State, end: number) => end <= s.due - s.opens;

function initState(ctx: Ctx): State {
  const loads: Load[] = [];
  for (const l of Array.isArray(P.loads) ? P.loads : []) {
    const name = clean(l?.who, 20);
    if (!name || loads.length >= 8) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    loads.push({ who: m ? m.id : `~${name}`, name, what: clean(l.what, 22) || "a load", wash: int(l.wash, 10, 90, 30), dry: int(l.dry, 10, 120, 45) });
  }
  const base = { washers: int(P.washers, 2, 5, 4), dryers: int(P.dryers, 1, 3, 2), loads };
  const board: Post[] = [];
  for (const b of Array.isArray(P.board) ? P.board : []) {
    const name = clean(b?.name, 20);
    if (!name || !Array.isArray(b.order)) continue;
    const order = b.order.map((w) => loads.findIndex((l) => l.name.toLowerCase() === clean(w, 20).toLowerCase()));
    if (!isPerm(order, loads.length)) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (board.some((p) => p.who === who)) continue;
    board.push({ who, name, order, end: schedule(base, order).end, tries: 1, said: clean(b.said, 48), at: 0 });
  }
  const opens = int(P.opens, 0, 700, 410);
  return { title: clean(P.title, 40) || "Laundry", sub: clean(P.sub, 60), opens, due: Math.max(opens + 30, int(P.due, 0, 900, 600)), ...base, board };
}

function basket(c: Theme["color"], col: string, done: boolean) {
  const rim = mix(col, c.text, 0.35);
  return (
    <svg width="46" height="34" viewBox="0 0 46 34" aria-hidden="true">
      {done ? (
        <path d="M6 13 L40 13 L36 32 L10 32 Z" fill="none" stroke={c.divider} stroke-width="2" stroke-dasharray="4 3" stroke-linejoin="round" />
      ) : (
        <g>
          <path d="M9 14 Q11 4 18 8 Q22 1 28 7 Q35 3 37 14 Z" fill={mix(col, c.card, 0.35)} />
          <path d="M14 11 Q17 6 21 10" fill="none" stroke={col} stroke-width="2" stroke-linecap="round" />
          <path d="M5 13 L41 13 L37 32 L9 32 Z" fill={col} stroke-linejoin="round" />
          <path d="M8 19 L38 19 M9 25 L37 25" stroke={rim} stroke-width="1.5" />
          <path d="M4 12 L42 12" stroke={rim} stroke-width="3" stroke-linecap="round" />
        </g>
      )}
    </svg>
  );
}

function washerIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number, body: string, glass: string, dial: string) {
  g.fillStyle = body;
  g.beginPath();
  g.roundRect(x - s / 2, y - s / 2, s, s, 3);
  g.fill();
  g.fillStyle = glass;
  g.beginPath();
  g.arc(x, y + 1.5, s * 0.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = dial;
  g.beginPath();
  g.arc(x + s * 0.3, y - s * 0.32, 1.6, 0, Math.PI * 2);
  g.fill();
}

const LANE = 23;
const TOP = 20;
const LEFT = 30;

export default defineApp<State, Action, Local>({
  name: "Laundry tetris",
  summary: (s) => {
    const r = ranked(s)[0];
    return r ? `${s.title}: ${first(r.name)} leads, dry by ${clockOf(s, r.end)} · ${s.board.length} solved` : `${s.title}: nobody has solved it yet`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "post") {
      if (!isPerm(a.order, s.loads.length)) return s;
      const order = [...a.order];
      const end = schedule(s, order).end;
      const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
      const old = s.board.find((p) => p.who === m.user);
      const tries = (old?.tries ?? 0) + 1;
      const post: Post = old && old.end <= end ? { ...old, tries } : { who: m.user, name, order, end, tries, said: "", at: m.time };
      return { ...s, board: old ? s.board.map((p) => (p.who === m.user ? post : p)) : [...s.board, post].slice(-12) };
    }
    if (a.t === "clear") {
      if (!s.board.some((p) => p.who === m.user)) return s;
      return { ...s, board: s.board.filter((p) => p.who !== m.user) };
    }
    return s;
  },

  invariants: {
    "finish times come from the order": (s) => s.board.every((p) => isPerm(p.order, s.loads.length) && p.end === schedule(s, p.order).end),
    "one row per person": (s) => new Set(s.board.map((p) => p.who)).size === s.board.length,
    "everyone on the board tried": (s) => s.board.every((p) => Number.isInteger(p.tries) && p.tries >= 1),
    "the machines exist": (s) => s.washers >= 2 && s.dryers >= 1 && s.loads.every((l) => l.wash > 0 && l.dry > 0),
  },

  transitions: {
    "a post counts one try": (p, n, a, m) => a.t !== "post" || p === n || (n.board.find((x) => x.who === m.user)?.tries ?? 0) === (p.board.find((x) => x.who === m.user)?.tries ?? 0) + 1,
    "your best never gets worse": (p, n, a, m) => {
      if (a.t !== "post" || p === n) return true;
      const was = p.board.find((x) => x.who === m.user)?.end ?? Infinity;
      const now = n.board.find((x) => x.who === m.user)?.end ?? Infinity;
      return now <= was && now <= schedule(p, a.order).end;
    },
    "a better order is the one you posted": (p, n, a, m) => {
      if (a.t !== "post" || p === n) return true;
      const was = p.board.find((x) => x.who === m.user)?.end ?? Infinity;
      const mine = n.board.find((x) => x.who === m.user)!;
      return schedule(p, a.order).end >= was || (mine.order.join() === a.order.join() && mine.at === m.time);
    },
    "a post touches only your row": (p, n, a, m) => a.t !== "post" || p === n || n.board.filter((x) => x.who !== m.user).every((x) => p.board.some((y) => y.who === x.who && y.end === x.end && y.tries === x.tries)),
    "clear removes only yours": (p, n, a, m) => a.t !== "clear" || p === n || (!n.board.some((x) => x.who === m.user) && n.board.length === p.board.length - 1),
    "unknown actions change nothing": (p, n, a) => a.t === "post" || a.t === "clear" || p === n,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => (r.next() < 0.9 ? { t: "post", order: r.shuffle(s.loads.map((_, i) => i)) } : { t: "clear" }),

  local: { order: [], at: 0, toast: 0 },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dk = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const lanes = s.washers + s.dryers;
    const H = TOP + lanes * LANE + 10;
    const span = Math.max(60, Math.ceil((Math.max(s.due - s.opens, ...s.board.map((p) => p.end), schedule(s, local.order).end) + 15) / 30) * 30);
    const X = (m: number) => LEFT + 4 + (m / span) * (W - LEFT - 8);
    const mine = s.board.find((p) => p.who === me) ?? null;
    const top = ranked(s);
    const leader = top[0] ?? null;
    const showing = local.order.length ? local.order : mine ? mine.order : [];
    const ghost = !local.order.length && !mine && leader ? leader : null;
    const plan = schedule(s, showing);
    const ghostPlan = ghost ? schedule(s, ghost.order) : null;
    const full = local.order.length === s.loads.length;
    const colOf = (l: Load) => {
      const m = members.find((x) => x.id === l.who || x.name.toLowerCase() === l.name.toLowerCase());
      return userColor(m ? m.id : l.who, theme);
    };
    const nameOf = (p: Post) => members.find((m) => m.id === p.who)?.name ?? p.name;
    const memberOfPost = (p: Post): Member => ({ id: p.who, name: nameOf(p) });
    const maxLoad = Math.max(1, ...s.loads.map((l) => l.wash + l.dry));
    const animAt = local.order.length ? local.at : 0;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const ink = dk ? c.text : c.text;
      const floor = dk ? mix(c.wash, c.card, 0.4) : mix(pl.sky, c.card, 0.55);
      g.fillStyle = floor;
      g.beginPath();
      g.roundRect(0, 0, W, H, 12);
      g.fill();
      // hour ticks
      g.font = `600 11px ${theme.type.family}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.strokeStyle = mix(c.divider, floor, 0.2);
      g.lineWidth = 1;
      g.beginPath();
      for (let m = 0; m <= span; m++) {
        if ((s.opens + m) % 60 !== 0) continue;
        g.moveTo(X(m), TOP - 2);
        g.lineTo(X(m), H - 6);
      }
      g.stroke();
      g.fillStyle = c.secondaryText;
      for (let m = 0; m <= span; m++) if ((s.opens + m) % 60 === 0 && X(m) > LEFT + 10 && X(m) < W - 10 && Math.abs(m - (s.due - s.opens)) > 20) g.fillText(clockOf(s, m).replace(":00", ""), X(m), 10);
      // lanes with machines
      for (let i = 0; i < lanes; i++) {
        const y = TOP + i * LANE;
        g.fillStyle = dk ? mix(c.card, c.wash, 0.3) : c.card;
        g.beginPath();
        g.roundRect(LEFT, y + 2, W - LEFT - 4, LANE - 4, 5);
        g.fill();
        const dry = i >= s.washers;
        washerIcon(g, LEFT / 2 + 1, y + LANE / 2, 18, dry ? mix(pl.orange, c.card, 0.25) : mix(pl.blue, c.card, 0.2), dk ? c.wash : mix(pl.sky, c.card, 0.2), ink);
      }
      if (s.dryers) {
        g.strokeStyle = c.divider;
        g.setLineDash([3, 3]);
        g.beginPath();
        g.moveTo(LEFT, TOP + s.washers * LANE);
        g.lineTo(W - 4, TOP + s.washers * LANE);
        g.stroke();
        g.setLineDash([]);
      }
      // ghost of the leader's run
      if (ghostPlan) {
        g.strokeStyle = mix(c.secondaryText, floor, 0.35);
        g.setLineDash([4, 3]);
        g.lineWidth = 1.5;
        g.beginPath();
        for (const b of ghostPlan.blocks) g.roundRect(X(b.from) + 1, TOP + b.lane * LANE + 4, X(b.to) - X(b.from) - 2, LANE - 8, 4);
        g.stroke();
        g.setLineDash([]);
      }
      // blocks, the newest sliding in from the right
      const e = f.now - animAt;
      let moving = false;
      plan.blocks.forEach((b, k) => {
        const l = s.loads[b.load]!;
        const newest = local.order.length > 0 && b.load === local.order[local.order.length - 1];
        const t = newest ? Math.min(1, Math.max(0, (e - (b.dry ? 160 : 0)) / 340)) : 1;
        if (t < 1) moving = true;
        const ease = 1 - Math.pow(1 - t, 3);
        const off = (1 - ease) * (W - X(b.from));
        const x0 = X(b.from) + 1 + off;
        const w = X(b.to) - X(b.from) - 2;
        const y = TOP + b.lane * LANE + 3;
        const col = colOf(l);
        g.fillStyle = b.dry ? col : mix(col, c.card, 0.55);
        g.beginPath();
        g.roundRect(x0, y, w, LANE - 6, 5);
        g.fill();
        const late = b.dry && b.to > s.due - s.opens;
        if (late && t === 1) {
          const lx = X(s.due - s.opens);
          g.save();
          g.beginPath();
          g.roundRect(x0, y, w, LANE - 6, 5);
          g.clip();
          g.strokeStyle = c.negative;
          g.lineWidth = 2;
          g.beginPath();
          for (let hx = lx - 20; hx < x0 + w + 20; hx += 6) {
            g.moveTo(hx, y + LANE);
            g.lineTo(hx + 14, y - 6);
          }
          g.stroke();
          g.restore();
        }
        const label = b.dry ? first(l.name) : l.what;
        const fit = fitText(label, w - 8, { g, size: 11, min: 10, weight: 600 });
        if (w > 22) {
          g.font = fit.font;
          g.textAlign = "left";
          g.fillStyle = onFill(b.dry ? col : mix(col, c.card, 0.55), c.text, c.card);
          g.fillText(fit.text, x0 + 4, y + (LANE - 6) / 2 + 0.5);
        }
        void k;
      });
      // the deadline
      const dx = X(s.due - s.opens);
      g.strokeStyle = c.negative;
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.beginPath();
      g.moveTo(dx, TOP - 4);
      g.lineTo(dx, H - 4);
      g.stroke();
      g.setLineDash([]);
      const due = clockOf(s, s.due - s.opens);
      g.font = `700 11px ${theme.type.family}`;
      const tw = g.measureText(due).width + 10;
      g.fillStyle = c.negative;
      g.beginPath();
      g.roundRect(Math.min(W - tw - 2, dx - tw / 2), 1, tw, 16, 8);
      g.fill();
      g.fillStyle = c.onPrimary;
      g.textAlign = "center";
      g.fillText(due, Math.min(W - tw / 2 - 2, dx), 9.5);
      return moving;
    };

    const tap = (i: number) => {
      if (local.order.includes(i) || local.order.length >= s.loads.length) return;
      haptic("light");
      setLocal({ order: [...local.order, i], at: clock.peek() });
    };
    const finish = plan.end;
    const status = local.order.length
      ? full
        ? okFinish(s, finish)
          ? `All dry by ${clockOf(s, finish)} · ${s.due - s.opens - finish} min to spare`
          : `Last load dry at ${clockOf(s, finish)} · ${finish - (s.due - s.opens)} min late`
        : `${local.order.length} of ${s.loads.length} loaded · next bag`
      : mine
        ? `Your best ${clockOf(s, mine.end)} · tap bags to go again`
        : ghost
          ? `Dashed: ${first(nameOf(ghost))}'s run · ${ghost.said ? `“${ghost.said}”` : `dry by ${clockOf(s, ghost.end)}`}`
          : "Tap the bags in the order they go in";
    const label = `Laundry room timeline, ${s.washers} washers and ${s.dryers} dryers, due ${clockOf(s, s.due - s.opens)}. ${local.order.length || (mine ? s.loads.length : 0)} loads placed.`;

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={H} label={label} draw={draw} />
        <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
          {s.loads.map((l, i) => {
            const used = local.order.includes(i);
            const col = colOf(l);
            return (
              <button
                key={`b${i}`}
                type="button"
                aria-label={`${l.name}: ${l.what}, wash ${l.wash}, dry ${l.dry}`}
                disabled={used}
                onClick={() => tap(i)}
                style={{ flex: 1, minWidth: 0, height: 66, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", position: "relative", borderRadius: 8 }}
              >
                {basket(c, col, used)}
                <span style={{ position: "absolute", top: 15, left: "50%", marginLeft: -8, display: used ? "none" : "flex" }}>
                  <Avatar user={{ id: l.who, name: l.name }} size={16} />
                </span>
                <span style={{ fontSize: 12, lineHeight: "14px", color: used ? c.secondaryText : c.text, fontWeight: 600, maxWidth: "100%", ...ell }}>{first(l.name)}</span>
                <span aria-hidden="true" style={{ display: "flex", height: 4, marginTop: 3, width: Math.round(((l.wash + l.dry) / maxLoad) * 44), borderRadius: 2, overflow: "hidden" }}>
                  <i style={{ flex: l.wash, background: used ? c.divider : mix(col, c.card, 0.55) }} />
                  <i style={{ flex: l.dry, background: used ? c.divider : col }} />
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, height: 28, marginTop: 6, overflow: "hidden", alignItems: "center" }}>
          {top.slice(0, theme.width < 360 ? 3 : 4).map((p) => (
            <div key={p.who} style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 8px 0 3px", height: 26, borderRadius: 13, background: p.who === me ? c.selected : c.wash, fontSize: 13 }}>
              <Avatar user={memberOfPost(p)} size={20} />
              <span style={{ fontWeight: 600, color: c.text }}>{clockOf(s, p.end)}</span>
              {okFinish(s, p.end) ? null : <i role="img" aria-label="late" style={{ width: 7, height: 7, borderRadius: 4, background: c.negative }} />}
            </div>
          ))}
          {!top.length ? <span style={{ fontSize: 13, color: c.secondaryText }}>Nobody's solved it yet · be first</span> : null}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: full && !okFinish(s, finish) ? c.negative : c.secondaryText, ...ell }}>{status}</span>
          {local.order.length ? (
            <Button kind="secondary" onClick={() => setLocal({ order: local.order.slice(0, -1), at: 0 })}>
              Undo
            </Button>
          ) : null}
          {full ? (
            <Button
              kind="primary"
              onClick={() => {
                haptic(okFinish(s, finish) ? "success" : "medium");
                dispatch({ t: "post", order: local.order });
                setLocal({ order: [], at: 0, toast: local.toast + 1 });
              }}
            >
              {`Post ${clockOf(s, finish)}`}
            </Button>
          ) : null}
        </div>
        {local.toast > 0 && mine ? <Toast key={local.toast}>{okFinish(s, mine.end) ? `Dry by ${clockOf(s, mine.end)} · on the board` : `Dry by ${clockOf(s, mine.end)} · late, try again`}</Toast> : null}
      </div>
    );
  },
});
