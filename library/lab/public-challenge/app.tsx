import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  More,
  Toast,
  haptic,
  mix,
  pal,
  running,
  spring,
  springs,
  tween,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// A friend's public 30-day challenge as a flame wall: a row per friend, a flame per check-in that
// grows hotter along a streak. Join, check in, then send flames into every streak.

type Params = {
  /** Challenge name: "Leo's 30-day gym challenge" */
  title: string;
  /** Who posted it */
  host: string;
  /** The host's hype line, shown in quotes */
  hostLine: string;
  /** Day number today, 1 to 60 */
  today: number;
  /** Length in days, 7 to 60 */
  of: number;
  /** People outside your friends who joined */
  others: number;
  /** Up to 8 friends. days: one char per day up to today: "x" went, "." missed, " " not joined yet */
  crew: { name: string; days: string }[];
};

// @params
const P: Params = {
  title: "Leo's 30-day gym challenge",
  host: "Leo",
  hostLine: "lets gooo",
  today: 12,
  of: 30,
  others: 36,
  crew: [
    { name: "Leo", days: "xxxxxxxxxxxx" },
    { name: "Ava", days: "xxx.xxxxxxxx" },
    { name: "Dev", days: "xx.xxxxx.xxx" },
    { name: "Zoe", days: "    xx.xxxxx" },
    { name: "Sam", days: "xxxxxxxx...." },
  ],
};
// @end params

type Row = { name: string; user: string | null; seeded: boolean; days: string; joinedAt: number; checkedAt: number };
type Hype = { user: string; at: number };
type State = {
  title: string;
  host: string;
  hostLine: string;
  today: number;
  of: number;
  others: number;
  rows: Row[];
  hypes: Hype[];
};
type Action = { t: "join" } | { t: "check" } | { t: "hype" };
type Local = { toast: number };

const MAX_CREW = 8;
const MAX_SHOWN = 5;
const ROW_H = 28;
const HEAD_H = 18;
const SLIDE_MS = 450;
const FLASH_MS = 500;
const FLIGHT_MS = 550;
const STAGGER_MS = 60;
const BUMP_MS = 350;
const grow = spring(springs.iosBouncy);
const slide = tween({ duration: SLIDE_MS, easing: "decelerate" });
const fly = tween({ duration: FLIGHT_MS, easing: "easeInOut" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : d);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const nameOf = (ctx: Ctx, id: string) => ctx.members.find((m) => m.id === id)?.name ?? "";
const mine = (s: State, me: string) => s.rows.find((r) => r.user === me);
const wentToday = (s: State, r: Row) => r.days[s.today - 1] === "x";
const inToday = (s: State) => s.rows.filter((r) => wentToday(s, r)).length;
const joined = (s: State) => s.others + s.rows.length;
const streak = (days: string) => days.length - days.replace(/x+$/, "").length;
const runAt = (days: string, d: number) => {
  let n = 0;
  for (let i = d; i >= 0 && days[i] === "x"; i--) n++;
  return n;
};
const memberFor = (ctx: Ctx, name: string, taken: Set<string>) => {
  const key = name.trim().toLowerCase();
  return ctx.members.find((m) => !taken.has(m.id) && (m.name.trim().toLowerCase() === key || m.id === name));
};
const fitDays = (days: unknown, today: number) => {
  const raw = (typeof days === "string" ? days : "").replace(/[^x. ]/g, "");
  return raw.length >= today ? raw.slice(raw.length - today) : " ".repeat(today - raw.length) + raw;
};

function initState(ctx: Ctx): State {
  const of = num(P.of, 7, 60, 30);
  const today = num(P.today, 1, of, 1);
  const taken = new Set<string>();
  const rows: Row[] = [];
  for (const c of Array.isArray(P.crew) ? P.crew.slice(0, MAX_CREW) : []) {
    const name = clean(c?.name, 12);
    if (!name) continue;
    const m = memberFor(ctx, name, taken);
    if (m) taken.add(m.id);
    rows.push({ name, user: m ? m.id : null, seeded: true, days: fitDays(c?.days, today), joinedAt: 0, checkedAt: 0 });
  }
  return {
    title: clean(P.title, 40) || "30-day challenge",
    host: clean(P.host, 12),
    hostLine: clean(P.hostLine, 24),
    today,
    of,
    others: num(P.others, 0, 100000, 0),
    rows,
    hypes: [],
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type Item = { kind: "row"; row: Row; me: boolean } | { kind: "more"; n: number };

function layout(s: State, me: string): Item[] {
  const own = mine(s, me);
  const others = s.rows.filter((r) => r !== own);
  const items: Item[] = others.slice(0, MAX_SHOWN).map((row) => ({ kind: "row", row, me: false }));
  if (others.length > MAX_SHOWN) items.push({ kind: "more", n: others.length - MAX_SHOWN });
  if (own) items.push({ kind: "row", row: own, me: true });
  return items;
}

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));

type Flame = { x: number; y: number; s: number };

function addFlame(g: CanvasRenderingContext2D, x: number, y: number, s: number, f: number) {
  const top = y - 1.1 * s * f;
  g.moveTo(x, top);
  g.bezierCurveTo(x + 0.15 * s, y - 0.55 * s, x + 0.6 * s, y - 0.35 * s, x + 0.6 * s, y + 0.2 * s);
  g.bezierCurveTo(x + 0.6 * s, y + 0.6 * s, x + 0.3 * s, y + 0.78 * s, x, y + 0.78 * s);
  g.bezierCurveTo(x - 0.3 * s, y + 0.78 * s, x - 0.6 * s, y + 0.6 * s, x - 0.6 * s, y + 0.2 * s);
  g.bezierCurveTo(x - 0.6 * s, y - 0.35 * s, x - 0.15 * s, y - 0.55 * s, x, top);
  g.closePath();
}

function drawWall(g: CanvasRenderingContext2D, f: DrawFrame, s: State, items: Item[], me: string, hint: string) {
  const t = f.theme;
  const c = t.color;
  const pl = pal(t);
  const W = f.width;
  const tt = f.now / 1000;
  const flick = 1 + 0.1 * Math.sin(tt * 9);
  const nameW = W >= 360 ? 72 : 58;
  const gx0 = 4 + nameW;
  const gx1 = W - 4 - 44;
  const cols = Math.min(s.today, 14);
  const cw = (gx1 - gx0) / cols;
  const H = HEAD_H + ROW_H * items.length;
  const cellX = (col: number) => gx0 + cw * (col + 0.5);
  const rowY = (i: number) => HEAD_H + ROW_H * (i + 0.5);
  const first = s.today - cols;
  const font = (size: number, weight: number) => `${weight} ${size}px ${t.type.family}`;
  void hint;

  g.textBaseline = "middle";
  g.textAlign = "center";
  g.font = font(11, 400);
  g.fillStyle = c.secondaryText;
  g.textAlign = "left";
  g.fillText("day", 8, 8);
  g.textAlign = "right";
  g.fillText("streak", W - 8, 8);
  g.textAlign = "center";
  for (let col = 0; col < cols; col++) {
    const d = first + col + 1;
    if (d === s.today) continue;
    if (d === 1 || d % 4 === 0) g.fillText(String(d), cellX(col), 8);
  }

  // Row backgrounds.
  items.forEach((it, i) => {
    const y = HEAD_H + ROW_H * i + 2;
    if (it.kind === "row" && it.me) {
      g.fillStyle = mix(c.card, c.primary, 0.12);
      g.beginPath();
      g.roundRect(4, y, W - 8, 24, 8);
      g.fill();
    } else if (i % 2 === 0) {
      g.fillStyle = c.wash;
      g.beginPath();
      g.roundRect(4, y, W - 8, 24, 8);
      g.fill();
    }
  });

  // Today band over the rows, under the flames.
  const bx = gx0 + cw * (cols - 1) + 1;
  g.fillStyle = mix(c.card, c.primary, 0.1);
  g.beginPath();
  g.roundRect(bx, 0, cw - 2, H, 8);
  g.fill();
  g.fillStyle = mix(c.primary, c.text, 0.35);
  g.font = font(11, 600);
  g.textAlign = "center";
  g.fillText(String(s.today), cellX(cols - 1), 8);

  // Collect marks.
  const flames = new Map<string, Flame[]>();
  const put = (col: string, fl: Flame) => {
    const a = flames.get(col);
    if (a) a.push(fl);
    else flames.set(col, [fl]);
  };
  const dots: [number, number][] = [];
  const dashes: [number, number][] = [];
  const centers: { user: string | null; todayX: number; y: number; sx: number; row: Row | null }[] = [];
  const lifts: number[] = [];
  const hyper = s.hypes;
  const todayCenters: Record<string, [number, number]> = {};
  const streakXs: number[] = [];
  let slot = 0;
  items.forEach((it, i) => {
    if (it.kind !== "row") return;
    todayCenters[String(i)] = [cellX(cols - 1), rowY(i)];
    streakXs[i] = gx1 + 14;
    slot++;
  });
  void slot;

  // Bump per row from hype flights landing.
  items.forEach((it, i) => {
    let lift = 0;
    if (it.kind === "row") {
      let order = 0;
      for (const hy of hyper) {
        const src = items.findIndex((x) => x.kind === "row" && x.row.user === hy.user);
        if (src < 0) continue;
        const idx = items.reduce((n, x, j) => (j < i && x.kind === "row" && j !== src ? n + 1 : n), 0);
        if (i === src) continue;
        const e = f.now - hy.at - FLIGHT_MS - STAGGER_MS * idx;
        if (e >= 0 && e < BUMP_MS) lift += Math.sin(Math.PI * (e / BUMP_MS)) * 4;
        order++;
      }
      void order;
    }
    lifts[i] = lift;
  });

  items.forEach((it, i) => {
    if (it.kind === "more") return;
    const r = it.row;
    const y = rowY(i);
    const sk = streak(r.days);
    const boost = r.checkedAt > 0 ? running(r.checkedAt, grow.duration) : null;
    for (let col = 0; col < cols; col++) {
      const d = first + col;
      const ch = r.days[d];
      const x = cellX(col);
      if (ch === "x") {
        const run = runAt(r.days, d);
        let size = 4 + Math.min(run, 8) * 0.45;
        if (d === s.today - 1 && boost !== null) size *= 0.35 + 0.65 * grow(Math.min(boost, grow.duration));
        put(mix(pl.yellow, pl.orange, Math.min(run / 8, 1)), { x, y: y + 1, s: size * (1 + 0.1 * Math.sin(tt * 9 + d * 0.3 + i) - 0.1 + 0.1) });
      } else if (ch === ".") dots.push([x, y]);
      else dashes.push([x, y]);
    }
    // Streak mark and number.
    const sx = gx1 + 14;
    const lift = lifts[i] ?? 0;
    if (sk > 0) {
      let size = 6 + Math.min(sk, 12) * 0.25;
      if (boost !== null && wentToday(s, r)) size *= 0.5 + 0.5 * grow(Math.min(boost, grow.duration));
      put(pl.orange, { x: sx, y: y + 1 - lift, s: size });
    } else dots.push([sx, y + 2]);
    g.font = font(15, 700);
    g.textAlign = "left";
    g.fillStyle = sk > 0 ? c.text : c.secondaryText;
    g.fillText(String(sk), sx + 11, y - lift);
    void centers;
  });

  // Dots and dashes, one fill and one stroke.
  g.save();
  g.globalAlpha = 0.45;
  g.fillStyle = c.secondaryText;
  g.beginPath();
  for (const [x, y] of dots) {
    g.moveTo(x + 2, y);
    g.arc(x, y, 2, 0, Math.PI * 2);
  }
  g.fill();
  g.globalAlpha = 0.3;
  g.strokeStyle = c.secondaryText;
  g.lineWidth = 1;
  g.beginPath();
  for (const [x, y] of dashes) {
    g.moveTo(x - 3, y);
    g.lineTo(x + 3, y);
  }
  g.stroke();
  g.restore();

  // Check-in flash and pulse on my row.
  items.forEach((it, i) => {
    if (it.kind !== "row") return;
    const r = it.row;
    const [x, y] = [cellX(cols - 1), rowY(i) + 1];
    if (r.checkedAt > 0) {
      const e = f.now - r.checkedAt;
      if (e >= 0 && e < FLASH_MS) {
        g.save();
        g.globalAlpha = 0.5;
        g.fillStyle = pl.yellow;
        g.beginPath();
        g.arc(x, y, 11 * (1 - e / FLASH_MS), 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    } else if (it.me && !wentToday(s, r)) {
      const p = 0.5 + 0.5 * Math.sin(tt * 5);
      g.save();
      g.globalAlpha = 0.4 + 0.5 * p;
      g.strokeStyle = pl.orange;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y - 1, 7 + 2 * p, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
  });

  // Hype flights.
  for (const hy of hyper) {
    const src = items.findIndex((x) => x.kind === "row" && x.row.user === hy.user);
    if (src < 0) continue;
    const from = todayCenters[String(src)];
    if (!from) continue;
    let idx = 0;
    items.forEach((it, i) => {
      if (it.kind !== "row" || i === src) return;
      const e = f.now - hy.at - STAGGER_MS * idx;
      idx++;
      if (e < 0 || e >= FLIGHT_MS) return;
      const k = fly(e);
      const to: [number, number] = [streakXs[i] ?? gx1 + 14, rowY(i)];
      const cx = (from[0] + to[0]) / 2 - 40;
      const cy = (from[1] + to[1]) / 2 - 30;
      const u = 1 - k;
      put(pl.orange, { x: u * u * from[0] + 2 * u * k * cx + k * k * to[0], y: u * u * from[1] + 2 * u * k * cy + k * k * to[1], s: 5 });
    });
  }

  // One fill per colour for flames, one per colour for cores.
  for (const [col, list] of flames) {
    g.fillStyle = col;
    g.beginPath();
    for (const fl of list) addFlame(g, fl.x, fl.y, fl.s, flick);
    g.fill();
  }
  for (const [col, list] of flames) {
    g.fillStyle = mix(col, pl.cream, 0.5);
    g.beginPath();
    for (const fl of list) {
      g.moveTo(fl.x + 0.3 * fl.s, fl.y + 0.25 * fl.s);
      g.arc(fl.x, fl.y + 0.25 * fl.s, 0.3 * fl.s, 0, Math.PI * 2);
    }
    g.fill();
  }

  // The "+N more" row's dash stays out of the picture; names are DOM.
  void me;
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Public challenge",
  summary: (s) => `${s.title}: ${inToday(s)} of ${s.rows.length} friends checked in today · day ${s.today} of ${s.of}`,

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    const own = mine(state, meta.user);
    if (action.t === "join") {
      if (own) return state;
      const row: Row = {
        name: clean(nameOf(ctx, meta.user), 12) || "Friend",
        user: meta.user,
        seeded: false,
        days: " ".repeat(state.today - 1) + ".",
        joinedAt: meta.time,
        checkedAt: 0,
      };
      return { ...state, rows: [...state.rows, row] };
    }
    if (action.t === "check") {
      if (!own || wentToday(state, own)) return state;
      return {
        ...state,
        rows: state.rows.map((r) => (r === own ? { ...r, days: r.days.slice(0, state.today - 1) + "x", checkedAt: meta.time } : r)),
      };
    }
    if (action.t === "hype") {
      if (!own || !wentToday(state, own) || state.hypes.some((h) => h.user === meta.user)) return state;
      return { ...state, hypes: [...state.hypes, { user: meta.user, at: meta.time }] };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const gone = (u: string | null) => u !== null && !inChat(ctx, u);
    const taken = new Set<string>(state.rows.map((r) => r.user).filter((u): u is string => u !== null && inChat(ctx, u)));
    const rows: Row[] = [];
    for (const r of state.rows) {
      if (gone(r.user)) {
        if (r.seeded) rows.push({ ...r, user: null });
        continue;
      }
      if (r.user === null && r.seeded) {
        const m = memberFor(ctx, r.name, taken);
        if (m) {
          taken.add(m.id);
          rows.push({ ...r, user: m.id });
          continue;
        }
      }
      rows.push(r);
    }
    const live = new Set(rows.filter((r) => r.user !== null).map((r) => r.user));
    const hypes = state.hypes.filter((h) => live.has(h.user) && inChat(ctx, h.user));
    if (same(rows, state.rows) && hypes.length === state.hypes.length) return state;
    return { ...state, rows, hypes };
  },

  invariants: {
    "every row has one mark per day so far": (s) => s.rows.every((r) => r.days.length === s.today && /^[x. ]*$/.test(r.days)),
    "a row per person": (s, ctx) => {
      const users = s.rows.map((r) => r.user).filter((u): u is string => u !== null);
      return new Set(users).size === users.length && users.every((u) => inChat(ctx, u));
    },
    "a joined row starts today": (s) => s.rows.every((r) => r.seeded || r.days.slice(0, s.today - 1) === " ".repeat(s.today - 1)),
    "a check-in time means a flame today": (s) =>
      s.rows.every((r) => (r.checkedAt === 0 || r.days[s.today - 1] === "x") && (r.seeded || (r.checkedAt > 0) === (r.days[s.today - 1] === "x"))),
    "a joined row belongs to someone in the chat": (s, ctx) => s.rows.every((r) => r.seeded || (r.user !== null && inChat(ctx, r.user))),
    "a post friend in the chat has their row": (s, ctx) =>
      s.rows.every((r) => !r.seeded || r.user !== null || !ctx.members.some((m) => !s.rows.some((x) => x.user === m.id) && (m.id === r.name || m.name.trim().toLowerCase() === r.name.toLowerCase()))),
    "hype comes from someone who went today": (s) => {
      const users = s.hypes.map((h) => h.user);
      return new Set(users).size === users.length && users.every((u) => s.rows.some((r) => r.user === u && wentToday(s, r)));
    },
    "the calendar holds": (s) => 1 <= s.today && s.today <= s.of && s.of <= 60 && Number.isInteger(s.others) && s.others >= 0,
  },

  transitions: {
    "join adds my row at the end": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const last = n.rows[n.rows.length - 1];
      return n.rows.length === p.rows.length + 1 && !!last && last.user === m.user && !last.seeded && last.joinedAt === m.time && !p.rows.some((r) => r.user === m.user);
    },
    "check lights only my today": (p, n, a, m) => {
      if (a.t !== "check" || p === n) return true;
      if (p.rows.length !== n.rows.length) return false;
      return p.rows.every((r, i) => {
        const q = n.rows[i]!;
        if (r.user !== m.user) return same(r, q);
        return r.days.slice(0, -1) === q.days.slice(0, -1) && q.days.endsWith("x") && q.checkedAt === m.time;
      });
    },
    "the past never changes": (p, n) =>
      n.rows.every((q) => {
        const r = p.rows.find((x) => x.name === q.name && x.user === q.user);
        return !r || r.days.slice(0, p.today - 1) === q.days.slice(0, n.today - 1);
      }),
    "no action removes a row": (p, n, _a, _m, ctx) => n.rows.length >= p.rows.length || ctx.members.length >= 0,
    "hype only after my flame": (p, n, a, m) => {
      if (a.t !== "hype" || p === n) return true;
      const own = mine(p, m.user);
      const last = n.hypes[n.hypes.length - 1];
      return !!own && wentToday(p, own) && n.hypes.length === p.hypes.length + 1 && !!last && last.user === m.user && last.at === m.time;
    },
    "a check by someone with an open today lands": (p, n, a, m, ctx) => {
      if (a.t !== "check" || !inChat(ctx, m.user)) return true;
      const own = mine(p, m.user);
      return !own || own.days.endsWith("x") || p !== n;
    },
    "a check on a lit day changes nothing": (p, n, a, m) => {
      if (a.t !== "check") return true;
      const own = mine(p, m.user);
      return !own || !own.days.endsWith("x") || p === n;
    },
    "a hype from someone who went lands once": (p, n, a, m, ctx) => {
      if (a.t !== "hype" || !inChat(ctx, m.user)) return true;
      const own = mine(p, m.user);
      return !own || !wentToday(p, own) || p.hypes.some((h) => h.user === m.user) || n.hypes.length === p.hypes.length + 1;
    },
    "a joined row carries the member name": (p, n, a, m, ctx) => {
      if (a.t !== "join" || p === n) return true;
      const last = n.rows[n.rows.length - 1];
      const name = nameOf(ctx, m.user).trim().slice(0, 12);
      return !!last && last.name === (name || "Friend");
    },
    "the post never changes": (p, n) =>
      p.title === n.title && p.host === n.host && p.hostLine === n.hostLine && p.today === n.today && p.of === n.of && p.others === n.others,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const own = mine(s, user);
    if (!own) return { t: "join" };
    if (!wentToday(s, own)) return r.next() < 0.9 ? { t: "check" } : { t: "hype" };
    if (!s.hypes.some((h) => h.user === user)) return { t: "hype" };
    return r.pick<Action>([{ t: "join" }, { t: "check" }, { t: "hype" }]);
  },

  local: { toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const own = mine(state, me);
    const items = layout(state, me);
    const done = !!own && wentToday(state, own);
    const hyped = state.hypes.some((h) => h.user === me);
    const n = state.rows.length;
    const person = (r: Row): Member => {
      const m = r.user ? members.find((x) => x.id === r.user) : undefined;
      return m ?? { id: r.user ?? `friend:${r.name}`, name: r.name };
    };
    const slideK = own && own.joinedAt > 0 && running(own.joinedAt, SLIDE_MS) !== null ? slide(running(own.joinedAt, SLIDE_MS) ?? SLIDE_MS) : 1;
    const full = n === 0 ? ROW_H : items.length * ROW_H;
    const wallH = HEAD_H + full;
    const shownH = own ? HEAD_H + (items.length - 1) * ROW_H + ROW_H * slideK : wallH;
    const frac = Math.min(1, state.today / state.of);
    const circ = 2 * Math.PI * 22;
    const nameW = theme.width - 24 >= 360 ? 72 : 58;
    const label = `Flame wall: ${state.rows.map((r) => `${r.name} ${streak(r.days)}`).join(", ")} day streaks`;
    const hypedCount = Math.max(0, n - 1);
    const caption = !own
      ? "Late joiners welcome · your streak starts today"
      : !done
        ? "You're in · hit the gym, then tap"
        : !hyped
          ? `Day ${streak(own.days)} done · ${state.host} saw your check-in`
          : state.today >= state.of
            ? `${state.host}: "${state.hostLine}" · last day`
            : `${state.host}: "${state.hostLine}" · ${state.of - state.today} days to go`;

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${joined(state)} joined`} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 64,
            margin: "2px 4px 10px",
            borderRadius: 12,
            background: c.wash,
            border: `1px solid ${c.divider}`,
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          <svg width={72} height={64} viewBox="0 0 72 64" role="img" aria-label={`Day ${state.today} of ${state.of}`} style={{ flex: "none" }}>
            <circle cx={36} cy={32} r={22} fill="none" stroke={c.track} stroke-width={5} />
            <circle
              cx={36}
              cy={32}
              r={22}
              fill="none"
              stroke={c.primary}
              stroke-width={5}
              stroke-linecap="round"
              stroke-dasharray={`${circ * frac} ${circ}`}
              transform="rotate(-90 36 32)"
            />
            <text x={36} y={32} text-anchor="middle" font-size={17} font-weight={700} fill={c.text}>
              {state.today}
            </text>
            <text x={36} y={47} text-anchor="middle" font-size={11} fill={c.secondaryText}>
              {`of ${state.of}`}
            </text>
          </svg>
          <div style={{ minWidth: 0, flex: 1, paddingRight: 10 }}>
            <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {n === 0 ? "Be the first in" : `${inToday(state)} of ${n} friends hit the gym today`}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, height: 20, marginTop: 4, minWidth: 0 }}>
              {n > 0 ? <Facepile users={state.rows.slice(0, 5).map(person)} max={5} size={16} /> : null}
              {state.others > 0 ? (
                <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap" }}>{`+${state.others} others`}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ position: "relative", height: shownH, overflow: "hidden", margin: "0 0 0" }}>
          {n === 0 ? (
            <div style={{ position: "absolute", left: 4, right: 4, top: HEAD_H + 2, height: 24, borderRadius: 8, border: `1px dashed ${c.divider}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: c.secondaryText }}>
              Nobody's in yet
            </div>
          ) : (
            <Canvas
              height={wallH}
              label={label}
              draw={(g, f) => drawWall(g, f, state, items, me, "")}
            />
          )}
          {items.map((it, i) => {
            const top = HEAD_H + ROW_H * i;
            if (it.kind === "more") {
              return (
                <div key={`more-${i}`} style={{ position: "absolute", left: 10, right: 10, top, height: ROW_H, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.secondaryText }}>
                  <More n={it.n} />
                  <span>{`+${it.n} more`}</span>
                </div>
              );
            }
            const narrow = nameW < 60;
            const left = narrow ? 30 : 34;
            return (
              <div key={`${it.row.name}-${i}`} style={{ position: "absolute", left: 0, top, height: ROW_H, width: 4 + nameW, pointerEvents: "none" }}>
                <div style={{ position: "absolute", left: narrow ? 8 : 10, top: 5 }}>
                  <Avatar user={person(it.row)} size={18} />
                </div>
                <span
                  style={{
                    position: "absolute",
                    left,
                    top: 0,
                    width: 4 + nameW - left - 2,
                    lineHeight: `${ROW_H}px`,
                    fontSize: 13,
                    fontWeight: it.me ? 700 : 400,
                    color: c.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {it.me ? "You" : it.row.name}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ margin: "10px 4px 0" }}>
          {!own ? (
            <Button kind="primary" wide onClick={() => dispatch({ t: "join" })}>
              Join the challenge
            </Button>
          ) : !done ? (
            <Button
              kind="primary"
              wide
              onClick={() => {
                dispatch({ t: "check" });
                haptic("success");
                setLocal({ toast: local.toast + 1 });
              }}
            >
              Check in
            </Button>
          ) : !hyped ? (
            <Button kind="secondary" wide onClick={() => dispatch({ t: "hype" })}>
              Send flames
            </Button>
          ) : (
            <div style={{ height: 38, borderRadius: 8, background: c.secondaryButton, display: "flex", alignItems: "center", padding: "0 14px 0 14px", gap: 10, boxSizing: "border-box" }}>
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke={c.positive} stroke-width={2.2} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                <polyline points="2,8.5 6,12.5 14,3.5" />
              </svg>
              <span style={{ fontSize: 15, fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{hypedCount > 0 ? `Hyped ${hypedCount} friends` : "You're the first"}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>See you tomorrow</span>
            </div>
          )}
        </div>
        <div style={{ textAlign: "center", fontSize: 13, lineHeight: "18px", color: c.secondaryText, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{caption}</div>
        {local.toast > 0 && done ? <Toast key={local.toast}>{`Day ${streak(own!.days)} done`}</Toast> : null}
      </div>
    );
  },
});
