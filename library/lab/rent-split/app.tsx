import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Changed,
  Locked,
  haptic,
  mix,
  running,
  type Child,
  type Meta,
  type Theme,
} from "@muse/app";

// Rent split: a floor plan whose rooms carry the live rent. Three fairness sliders (size, private
// bath, parking) move the numbers; each person taps their face to agree, and the split locks when
// every room has said yes. Money is integer cents and every share is exact: the cents left over
// after flooring go one each to the rooms with the largest remainder.

type Params = {
  /** The place, e.g. "14 Linden Ave" */
  title: string;
  /** Monthly rent in cents, 10000 to 2000000 */
  rentCents: number;
  /** 2 to 8 rooms; name is who has the room as in the chat, empty while open */
  rooms: { name: string; sqft: number; bath: boolean; parking: boolean }[];
  /** How much size counts, 0 to 100 in steps of 5; default 60 */
  weight: number;
  /** Extra for a private bath, 0 to 30000; 0 until a person gives an amount */
  bathCents: number;
  /** Extra for parking, 0 to 15000; 0 until a person gives an amount */
  parkingCents: number;
  /** Names who already said yes */
  agreed: string[];
};

// @params
const P: Params = {
  title: "14 Linden Ave",
  rentCents: 420000,
  weight: 60,
  bathCents: 12000,
  parkingCents: 7500,
  rooms: [
    { name: "Maya", sqft: 180, bath: true, parking: false },
    { name: "Jordan", sqft: 140, bath: false, parking: false },
    { name: "Chris", sqft: 120, bath: false, parking: true },
    { name: "Bea", sqft: 105, bath: false, parking: false },
  ],
  agreed: ["Maya", "Jordan"],
};
// @end params

type Room = { id: string; name: string; user: string | null; sqft: number; bath: boolean; parking: boolean };
type Terms = { weight: number; bath: number; parking: number };
type State = { title: string; rent: number; rooms: Room[]; terms: Terms; agreed: string[]; lockedAt: number };
type Action = { t: "set"; term: "weight" | "bath" | "parking"; value: number } | { t: "agree" } | { t: "take"; room: string };
type Local = { drag: { term: string; value: number } | null };

type TermKey = keyof Terms;
type Rec = Record<string, unknown>;
type CtxT = { members: { id: string; name?: string }[] };

const MAX_ROOMS = 8;
const MIN_SQFT = 40;
const MAX_SQFT = 2000;
const MIN_RENT = 10000;
const MAX_RENT = 2000000;
const DEFAULT_RENT = 200000;
const DEFAULT_WEIGHT = 60;
const DEFAULT_BATH = 0;
const DEFAULT_PARKING = 0;

const LIMITS: Record<TermKey, { lo: number; hi: number; step: number; def: number }> = {
  weight: { lo: 0, hi: 100, step: 5, def: DEFAULT_WEIGHT },
  bath: { lo: 0, hi: 30000, step: 500, def: DEFAULT_BATH },
  parking: { lo: 0, hi: 15000, step: 500, def: DEFAULT_PARKING },
};
const TERM_KEYS: TermKey[] = ["weight", "bath", "parking"];

const clean = (s: unknown, n: number) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, n) : "");
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const inChat = (ctx: CtxT, id: string) => ctx.members.some((m) => m.id === id);

const commas = (n: number): string => {
  const s = String(Math.max(0, Math.floor(n)));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s[i];
  }
  return out;
};

/** Dollars from cents; cents only when there are some. */
const money = (cents: number): string => {
  const c = Math.abs(Math.round(Number.isFinite(cents) ? cents : 0));
  const whole = Math.floor(c / 100);
  const rest = c % 100;
  return `${cents < 0 ? "-" : ""}$${commas(whole)}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
};
/** Whole dollars from cents, for a big share or the vs-even line. */
const moneyWhole = (cents: number): string => money(Math.round(cents / 100) * 100);

const weightWord = (v: number): string => (v >= 70 ? "Mostly size" : v <= 30 ? "Mostly even" : "Some size");
const valueWord = (key: TermKey, v: number): string => (key === "weight" ? weightWord(v) : v === 0 ? "$0" : `+${money(v)}`);

/** A finite number clamped and snapped to a term's step; anything else takes the default. */
function termValue(v: unknown, key: TermKey): number {
  const l = LIMITS[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return l.def;
  return clamp(Math.round(v / l.step) * l.step, l.lo, l.hi);
}

const validTerm = (v: unknown, key: TermKey): boolean => {
  const l = LIMITS[key];
  return typeof v === "number" && Number.isInteger(v) && v >= l.lo && v <= l.hi && v % l.step === 0;
};

/** Extra rent a room carries for its own bath and parking spot. */
const extraFor = (r: Room, t: Terms): number => (r.bath ? t.bath : 0) + (r.parking ? t.parking : 0);
const extrasTotal = (rooms: Room[], t: Terms): number => rooms.reduce((n, r) => n + extraFor(r, t), 0);
const baseRent = (rent: number, rooms: Room[], t: Terms): number => rent - extrasTotal(rooms, t);

const roomSqft = (r: Room): number => (Number.isFinite(r.sqft) && r.sqft > 0 ? r.sqft : MIN_SQFT);

/**
 * The integer shares. `base` is split by size weight plus an even part, then the leftover cents
 * after flooring go one each to the rooms with the largest remainder (ties keep room order).
 */
function shares(s: State): number[] {
  const n = s.rooms.length;
  if (!n) return [];
  const S = s.rooms.reduce((a, r) => a + roomSqft(r), 0);
  const extras = s.rooms.map((r) => extraFor(r, s.terms));
  const base = s.rent - extras.reduce((a, x) => a + x, 0);
  const t = s.terms;
  if (S <= 0) return extras;
  const den = 100 * n * S;
  const nums = s.rooms.map((r) => base * (t.weight * roomSqft(r) * n + (100 - t.weight) * S));
  const parts = nums.map((x) => Math.floor(x / den));
  let left = base - parts.reduce((a, x) => a + x, 0);
  const order = nums.map((x, i) => i).sort((a, b) => {
    const ra = nums[a]! - parts[a]! * den;
    const rb = nums[b]! - parts[b]! * den;
    return rb - ra || a - b;
  });
  for (let k = 0; k < left && k < n; k++) parts[order[k]!] = parts[order[k]!]! + 1;
  return parts.map((x, i) => x + extras[i]!);
}

/** The exact numerator and denominator behind each floor, for the fairness invariant. */
function basis(s: State): { nums: number[]; den: number; extras: number[] } {
  const n = s.rooms.length;
  const S = s.rooms.reduce((a, r) => a + roomSqft(r), 0);
  const extras = s.rooms.map((r) => extraFor(r, s.terms));
  const base = s.rent - extras.reduce((a, x) => a + x, 0);
  const den = 100 * n * S;
  const t = s.terms;
  const nums = s.rooms.map((r) => base * (t.weight * roomSqft(r) * n + (100 - t.weight) * S));
  return { nums, den, extras };
}

const holderRoom = (s: State, id: string) => s.rooms.find((r) => r.user === id);

// ---- Reducer ----

function reduceRent(s: State, a: Rec, meta: Meta, ctx: CtxT): State {
  if (s.lockedAt > 0 || !inChat(ctx, meta.user)) return s;
  if (a.t === "set") {
    const term = a.term;
    const value = a.value;
    if (term !== "weight" && term !== "bath" && term !== "parking") return s;
    if (!validTerm(value, term) || value === s.terms[term]) return s;
    const terms: Terms = { ...s.terms, [term]: value };
    if (baseRent(s.rent, s.rooms, terms) < 0) return s;
    return { ...s, terms, agreed: [] };
  }
  if (a.t === "take") {
    const id = a.room;
    if (typeof id !== "string") return s;
    const room = s.rooms.find((r) => r.id === id);
    if (!room || room.user !== null || holderRoom(s, meta.user)) return s;
    return { ...s, rooms: s.rooms.map((r) => (r.id === id ? { ...r, user: meta.user } : r)) };
  }
  if (a.t === "agree") {
    if (!holderRoom(s, meta.user)) return s;
    const has = s.agreed.includes(meta.user);
    const agreed = has ? s.agreed.filter((u) => u !== meta.user) : [...s.agreed, meta.user];
    const locks = !has && s.rooms.every((r) => r.user !== null) && agreed.length === s.rooms.length;
    return { ...s, agreed, lockedAt: locks ? meta.time : s.lockedAt };
  }
  return s;
}

function dropGone(s: State, ctx: CtxT): State {
  if (s.lockedAt > 0) return s;
  const here = new Set(ctx.members.map((m) => m.id));
  const gone = new Set<string>();
  const rooms = s.rooms.map((r) => {
    if (r.user === null || here.has(r.user)) return r;
    gone.add(r.user);
    return { ...r, user: null };
  });
  if (!gone.size) return s;
  return { ...s, rooms, agreed: s.agreed.filter((u) => !gone.has(u)) };
}

function reduceTyped(s: State, action: Action, meta: Meta, ctx: CtxT): State {
  return reduceRent(s, action as unknown as Rec, meta, ctx);
}

// ---- Init ----

function initRent(ctx: CtxT): State {
  const raw = Array.isArray(P.rooms) ? P.rooms.slice(0, MAX_ROOMS) : [];
  const present = raw.filter((r): r is { name: string; sqft: number; bath: boolean; parking: boolean } => !!r && typeof r === "object");
  const empty = present.length < 2;
  const wanted = empty
    ? [
        { name: "", sqft: 120, bath: false, parking: false },
        { name: "", sqft: 120, bath: false, parking: false },
      ]
    : present;
  const rent = typeof P.rentCents === "number" && Number.isInteger(P.rentCents) && P.rentCents >= MIN_RENT && P.rentCents <= MAX_RENT ? P.rentCents : DEFAULT_RENT;
  const used = new Set<string>();
  const rooms: Room[] = wanted.map((r, i) => {
    const name = clean(r.name, 28);
    // 0 means the chat gave no size: weighted as the smallest room, shown as nothing
    const sqft = empty ? 120 : typeof r.sqft === "number" && Number.isInteger(r.sqft) && r.sqft > 0 ? clamp(r.sqft, MIN_SQFT, MAX_SQFT) : 0;
    const want = name.toLowerCase();
    const member = name
      ? ctx.members.find((m) => !used.has(m.id) && (m.id === name || clean(m.name, 40).toLowerCase() === want))
      : undefined;
    if (member) used.add(member.id);
    return { id: `r${i}`, name, user: member ? member.id : null, sqft, bath: r.bath === true, parking: r.parking === true };
  });
  let weight = termValue(P.weight, "weight");
  let bath = termValue(P.bathCents, "bath");
  let parking = termValue(P.parkingCents, "parking");
  if (baseRent(rent, rooms, { weight, bath, parking }) < 0) {
    bath = 0;
    parking = 0;
    weight = termValue(P.weight, "weight");
  }
  const yes = new Set<string>();
  const wants = Array.isArray(P.agreed) ? P.agreed : [];
  for (const x of wants) if (typeof x === "string" && x.trim()) yes.add(x.trim().toLowerCase());
  const agreed: string[] = [];
  for (const r of rooms) {
    if (!r.user) continue;
    const member = ctx.members.find((m) => m.id === r.user);
    const names = [r.name.toLowerCase(), member ? clean(member.name, 40).toLowerCase() : "", r.user.toLowerCase()];
    if (names.some((x) => x && yes.has(x)) && !agreed.includes(r.user)) agreed.push(r.user);
  }
  return {
    title: clean(P.title, 60) || "Rent split",
    rent,
    rooms,
    terms: { weight, bath, parking },
    agreed,
    lockedAt: 0,
  };
}

// ---- View helpers ----

type PlanGeo = { room: Room; index: number; x: number; y: number; w: number; h: number; side: "left" | "right" };

/** Heights proportional to square feet inside a column, with a 46 unit floor. */
function columnHeights(rooms: Room[], total: number): number[] {
  const raw = rooms.map((r) => roomSqft(r));
  const sum = raw.reduce((a, x) => a + x, 0);
  const min = 46;
  let heights = raw.map((x) => (sum > 0 ? (total * x) / sum : total / Math.max(1, rooms.length)));
  for (let round = 0; round < 5; round++) {
    const low = heights.map((h) => h < min);
    const count = low.filter(Boolean).length;
    if (!count) break;
    const fixed = count * min;
    let free = 0;
    for (let i = 0; i < raw.length; i++) if (!low[i]) free += raw[i]!;
    const remain = Math.max(0, total - fixed);
    heights = heights.map((h, i) => (low[i] ? min : free > 0 ? (remain * raw[i]!) / free : 0));
    if (free <= 0) break;
  }
  return heights;
}

function planGeometry(rooms: Room[]): PlanGeo[] {
  const leftCount = Math.ceil(rooms.length / 2);
  const left = rooms.slice(0, leftCount);
  const right = rooms.slice(leftCount);
  const out: PlanGeo[] = [];
  let y = 0;
  const lh = columnHeights(left, 200);
  left.forEach((room, i) => {
    out.push({ room, index: i, x: 0, y, w: 146, h: lh[i]!, side: "left" });
    y += lh[i]!;
  });
  y = 0;
  const rh = columnHeights(right, 200);
  right.forEach((room, i) => {
    const idx = leftCount + i;
    out.push({ room, index: idx, x: 246, y, w: 134, h: rh[i]!, side: "right" });
    y += rh[i]!;
  });
  return out;
}

export default defineApp<State, Action, Local>({
  name: "Rent split",

  summary: (s) => {
    const n = s.rooms.length;
    return s.lockedAt > 0 ? `${s.title}: rent set, ${n} of ${n} agree` : `${s.title}: ${s.agreed.length} of ${n} agree`;
  },

  init: (ctx) => initRent(ctx as unknown as CtxT),

  reduce: (state, action, meta, ctx) => reduceTyped(state, action, meta, ctx as unknown as CtxT),

  onMembers: (state, ctx) => dropGone(state, ctx as unknown as CtxT),

  invariants: {
    "shares add up to the rent": (s) => shares(s).reduce((a, x) => a + x, 0) === s.rent,
    "shares are fair to the cent": (s) => {
      const { nums, den, extras } = basis(s);
      if (den <= 0) return false;
      const got = shares(s);
      return got.every((v, i) => Math.abs((v - extras[i]!) * den - nums[i]!) < den);
    },
    "terms are on their steps and leave rent to share": (s) =>
      TERM_KEYS.every((k) => validTerm(s.terms[k], k)) && baseRent(s.rent, s.rooms, s.terms) >= 0,
    "one room per person": (s) => {
      const users = s.rooms.map((r) => r.user).filter((u): u is string => u !== null);
      return new Set(users).size === users.length;
    },
    "only room holders agree": (s) => new Set(s.agreed).size === s.agreed.length && s.agreed.every((u) => s.rooms.some((r) => r.user === u)),
    "locked exactly when every room agreed": (s) => {
      const all = s.rooms.length > 0 && s.rooms.every((r) => r.user !== null) && s.agreed.length === s.rooms.length;
      return Number.isInteger(s.lockedAt) && s.lockedAt >= 0 && (s.lockedAt > 0 ? all : !all);
    },
    "room holders are in the chat while open": (s, ctx) => s.lockedAt > 0 || s.rooms.every((r) => r.user === null || inChat(ctx as unknown as CtxT, r.user)),
    "rooms are two to eight with one id each": (s) =>
      s.rooms.length >= 2 &&
      s.rooms.length <= MAX_ROOMS &&
      new Set(s.rooms.map((r) => r.id)).size === s.rooms.length &&
      s.rooms.every((r) => typeof r.id === "string" && r.id.length > 0),
    "room facts stay in range": (s) =>
      s.rooms.every(
        (r) =>
          typeof r.name === "string" &&
          r.name.length <= 28 &&
          Number.isInteger(r.sqft) &&
          (r.sqft === 0 || r.sqft >= MIN_SQFT) &&
          r.sqft <= MAX_SQFT &&
          typeof r.bath === "boolean" &&
          typeof r.parking === "boolean" &&
          (r.user === null || typeof r.user === "string"),
      ),
    "the title and rent are whole facts": (s) => typeof s.title === "string" && s.title.length > 0 && Number.isInteger(s.rent) && s.rent >= 0,
  },

  transitions: {
    "a locked split never changes": (p, n) => p.lockedAt === 0 || JSON.stringify(p) === JSON.stringify(n),
    "changing a term clears every yes": (p, n, a) => {
      if (a.t !== "set" || p === n) return true;
      if (a.term !== "weight" && a.term !== "bath" && a.term !== "parking") return false;
      return n.agreed.length === 0 && n.terms[a.term] === a.value;
    },
    "only the term named changes": (p, n, a) => {
      if (a.t !== "set" || p === n) return true;
      if (a.term !== "weight" && a.term !== "bath" && a.term !== "parking") return false;
      return TERM_KEYS.every((k) => k === a.term || n.terms[k] === p.terms[k]);
    },
    "agreeing toggles only the actor": (p, n, a, m) => {
      if (a.t !== "agree" || p === n) return true;
      const diff = [...p.agreed.filter((u) => !n.agreed.includes(u)), ...n.agreed.filter((u) => !p.agreed.includes(u))];
      return diff.length === 1 && diff[0] === m.user;
    },
    "an agree appends at the end and moves nothing else": (p, n, a, m) => {
      if (a.t !== "agree" || p === n) return true;
      const added = n.agreed.length > p.agreed.length;
      const tail = added ? n.agreed[n.agreed.length - 1] === m.user && p.agreed.every((u, i) => n.agreed[i] === u) : true;
      return tail && JSON.stringify(p.rooms) === JSON.stringify(n.rooms) && JSON.stringify(p.terms) === JSON.stringify(n.terms) && p.rent === n.rent && p.title === n.title;
    },
    "the lock lands on the last yes": (p, n, a, m) => p.lockedAt !== 0 || n.lockedAt === 0 || (a.t === "agree" && n.lockedAt === m.time),
    "taking fills one open room with the actor": (p, n, a, m) => {
      if (a.t !== "take" || p === n) return true;
      const before = p.rooms.find((r) => r.id === a.room);
      const after = n.rooms.find((r) => r.id === a.room);
      if (!before || !after || typeof a.room !== "string") return false;
      if (before.user !== null || after.user !== m.user) return false;
      if (before.name !== after.name || before.sqft !== after.sqft || before.bath !== after.bath || before.parking !== after.parking) return false;
      return JSON.stringify(p.rooms.filter((r) => r.id !== a.room)) === JSON.stringify(n.rooms.filter((r) => r.id !== a.room));
    },
    "taking leaves every agreement alone": (p, n, a) => a.t !== "take" || p === n || JSON.stringify(n.agreed) === JSON.stringify(p.agreed),
    "a set moves nothing but the terms and the yeses": (p, n, a) => {
      if (a.t !== "set" || p === n) return true;
      return JSON.stringify(p.rooms) === JSON.stringify(n.rooms) && p.rent === n.rent && p.title === n.title && p.lockedAt === n.lockedAt;
    },
    "rent and sizes never change": (p, n) =>
      p.rent === n.rent &&
      JSON.stringify(p.rooms.map((r) => [r.id, r.sqft, r.bath, r.parking])) === JSON.stringify(n.rooms.map((r) => [r.id, r.sqft, r.bath, r.parking])),
    "the title never changes": (p, n) => p.title === n.title,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx as unknown as CtxT, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.lockedAt > 0) return { t: "agree" };
    const mine = s.rooms.some((x) => x.user === user);
    const open = s.rooms.filter((x) => x.user === null);
    if (!mine && open.length) {
      if (r.next() < 0.7) return { t: "take", room: r.pick(open).id };
      return { t: "agree" };
    }
    const k = r.next();
    if (k < 0.55) return { t: "agree" };
    if (k < 0.85) {
      const term = r.pick(["weight", "bath", "parking"] as const);
      const value = term === "weight" ? 5 * r.int(21) : term === "bath" ? 500 * r.int(61) : 500 * r.int(31);
      return { t: "set", term, value };
    }
    return { t: "take", room: r.pick(s.rooms).id };
  },

  local: { drag: null },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const inner = theme.width - theme.space.card * 2;
    const planH = Math.max(170, Math.min(186, (inner * 200) / 380));
    const sx = inner / 380;
    const sy = planH / 200;
    const N = state.rooms.length;
    const sh = shares(state);
    const min = sh.length ? Math.min(...sh) : 0;
    const max = sh.length ? Math.max(...sh) : 0;
    const locked = state.lockedAt > 0;
    const myRoom = state.rooms.find((r) => r.user === me);
    const agreedSet = new Set(state.agreed);
    const flash = state.lockedAt > 0 ? running(state.lockedAt, 1200) : null;
    const nowMs = flash === null ? 1 : flash / 1200;
    const nameOf = (room: Room): string => {
      if (!room.user) return room.name || "Open";
      const m = members.find((x) => x.id === room.user);
      return clean(m?.name, 40) || room.name || "Someone";
    };
    const holderOf = (room: Room): string => {
      if (!room.user) return room.name;
      const m = members.find((x) => x.id === room.user);
      return clean(m?.name, 40) || room.name || "Someone";
    };
    const vsEven = (i: number): string => {
      const diff = sh[i]! - state.rent / Math.max(1, N);
      if (Math.abs(diff) < 100) return "even split";
      return `${diff > 0 ? "+" : "-"}${moneyWhole(Math.abs(diff))} vs even`;
    };

    const geos = planGeometry(state.rooms);

    // Walls, with the 22 unit door gap facing the living strip and the swing arc into it.
    const wallStroke = c.divider;
    const arcs: Child[] = [];
    const lines: Child[] = [];
    const line = (key: string, x1: number, y1: number, x2: number, y2: number) => {
      lines.push(<line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={wallStroke} strokeWidth={1} vectorEffect="non-scaling-stroke" />);
    };
    line("top", 0, 0, 380, 0);
    line("bottom", 0, 200, 380, 200);
    line("left", 0, 0, 0, 200);
    line("right", 380, 0, 380, 200);
    for (const side of ["left", "right"] as const) {
      const x = side === "left" ? 146 : 246;
      const xs = side === "left" ? 0 : 246;
      const xe = side === "left" ? 146 : 380;
      let cur = 0;
      const col = geos.filter((g) => g.side === side);
      for (const g of col) {
        const gap = Math.min(g.y + 20, g.y + g.h - 1);
        const end = Math.min(gap + 22, g.y + g.h - 1);
        line(`${side}-wall-${g.room.id}-a`, x, cur, x, gap);
        cur = end;
        const hx = x;
        const hy = g.y + 20;
        arcs.push(
          <path
            key={`${side}-arc-${g.room.id}`}
            d={side === "left" ? `M ${hx} ${hy + 22} A 22 22 0 0 1 ${hx + 22} ${hy}` : `M ${hx} ${hy + 22} A 22 22 0 0 1 ${hx - 22} ${hy}`}
            fill="none"
            stroke={c.secondaryText}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />,
        );
      }
      line(`${side}-wall-end`, x, cur, x, 200);
      const tops = new Set(col.map((g) => g.y).filter((y) => y > 0));
      for (const y of tops) line(`${side}-div-${y}`, xs, y, xe, y);
    }

    const roomFill = (i: number): string => {
      const heat = max > min ? (sh[i]! - min) / (max - min) : 0.5;
      const fill = mix(c.card, c.primary, 0.03 + heat * 0.08);
      return flash === null ? fill : mix(c.selected, fill, nowMs);
    };

    const roomEls = geos.map((g) => {
      const i = g.index;
      const room = g.room;
      const roomH = g.h * sy;
      const isMine = room.user === me;
      const showAvatar = roomH >= 52;
      const showFine = roomH >= 70;
      const showTags = roomH >= 58;
      const shareSize = roomH < 58 ? 20 : 26;
      const label = room.user ? nameOf(room) : room.name ? `${room.name} · Open` : "Open";
      const water = Math.min(1, sh[i]! / ((state.rent / Math.max(1, N)) * 1.33)) * 0.5;
      const tagged = room.bath || room.parking;
      const shareTop = showFine ? Math.min(tagged ? 62 : 60, roomH - (tagged ? 40 : 23)) : Math.min(roomH - 11, roomH / 2 + 10);
      return (
        <div
          key={room.id}
          style={{
            position: "absolute",
            left: g.x * sx,
            top: g.y * sy,
            width: g.w * sx,
            height: roomH,
            background: roomFill(i),
            overflow: "hidden",
            borderRadius: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: roomH * water,
              background: mix(c.card, c.primary, 0.12),
              transition: `height ${theme.motion.slow}ms ease`,
            }}
          />
          <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
            <div style={{ position: "absolute", left: 8, right: 8, top: showAvatar ? 6 : 4, display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              {showAvatar ? (
                room.user ? (
                  <Avatar user={room.user} size={20} />
                ) : (
                  <span aria-hidden="true" style={{ flex: "none", width: 20, height: 20, borderRadius: 10, border: `1px dashed ${c.divider}` }} />
                )
              ) : null}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 13,
                  lineHeight: showAvatar ? "18px" : "16px",
                  fontWeight: room.user ? 600 : 400,
                  color: room.user ? c.text : c.secondaryText,
                }}
              >
                {label}
              </span>
              {showFine && room.sqft > 0 ? (
                <span style={{ flex: "none", fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>{`${room.sqft} ft²`}</span>
              ) : null}
            </div>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: shareTop,
                transform: "translateY(-50%)",
                textAlign: "center",
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: shareSize, lineHeight: `${shareSize + 2}px`, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: c.text }}>
                {moneyWhole(sh[i]!)}
              </div>
              {showFine ? <div style={{ fontSize: 12, lineHeight: "14px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vsEven(i)}</div> : null}
            </div>
            {showTags ? (
              <div style={{ position: "absolute", right: 7, bottom: 2, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0 }}>
                {room.bath ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, lineHeight: "15px", color: c.secondaryText }}>
                    own bath
                    <span aria-hidden="true" style={{ width: 16, height: 9, borderRadius: 5, border: `1px solid ${c.divider}`, display: "inline-flex", alignItems: "center", paddingLeft: 3 }}>
                      <span style={{ width: 3, height: 3, borderRadius: 2, background: c.primary }} />
                    </span>
                  </span>
                ) : null}
                {room.parking ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, lineHeight: "15px", color: c.secondaryText }}>
                    parking
                    <span style={{ width: 16, height: 16, borderRadius: 3, background: c.positive, color: c.card, fontSize: 11, lineHeight: "16px", fontWeight: 600, textAlign: "center" }}>P</span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          {isMine ? <span aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 3, boxShadow: `inset 0 0 0 1.5px ${c.primary}`, pointerEvents: "none" }} /> : null}
        </div>
      );
    });

    // Sliders: the canvas is the track; the label and value sit either side.
    const trackW = Math.max(1, inner - 96 - 56 - 16);
    const slider = (key: TermKey, label: string) => {
      const l = LIMITS[key];
      const dragging = local.drag && local.drag.term === key ? local.drag.value : null;
      const value = locked ? state.terms[key] : dragging ?? state.terms[key];
      const shown = clamp(value, l.lo, l.hi);
      const frac = (shown - l.lo) / (l.hi - l.lo);
      // a bath or a spot someone has, with no amount set yet: the group sets it
      const unset = key !== "weight" && shown === 0 && state.rooms.some((r) => r[key]);
      const valueText = unset ? "Add amount" : valueWord(key, shown);
      const draw = (g: CanvasRenderingContext2D, o: { width: number; height: number; theme: Theme }) => {
        g.clearRect(0, 0, o.width, o.height);
        const cy = o.height / 2;
        const k = 9;
        const x0 = k;
        const x1 = Math.max(k + 1, o.width - k);
        const x = x0 + (x1 - x0) * frac;
        g.fillStyle = o.theme.color.track;
        g.beginPath();
        g.roundRect(x0, cy - 3, x1 - x0, 6, 3);
        g.fill();
        if (frac > 0) {
          g.fillStyle = locked ? o.theme.color.secondaryText : o.theme.color.primary;
          g.beginPath();
          g.roundRect(x0, cy - 3, Math.max(0.01, (x1 - x0) * frac), 6, 3);
          g.fill();
        }
        g.beginPath();
        g.arc(x, cy, k, 0, Math.PI * 2);
        g.fillStyle = o.theme.color.card;
        g.fill();
        g.strokeStyle = o.theme.color.divider;
        g.lineWidth = 1;
        g.stroke();
      };
      const onPointer = locked
        ? undefined
        : (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
            if (e.type === "move" && (!local.drag || local.drag.term !== key)) return;
            if (e.type === "up") {
              if (local.drag && local.drag.term === key) {
                dispatch({ t: "set", term: key, value: local.drag.value });
                setLocal({ drag: null });
              }
              return;
            }
            const f = clamp((e.x - 9) / Math.max(1, trackW - 18), 0, 1);
            const next = clamp(Math.round((l.lo + f * (l.hi - l.lo)) / l.step) * l.step, l.lo, l.hi);
            if (!local.drag || local.drag.term !== key || local.drag.value !== next) setLocal({ drag: { term: key, value: next } });
          };
      return (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, height: 32 }}>
          <span style={{ flex: "none", width: 96, fontSize: 13, lineHeight: "18px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          <div style={{ flex: 1, minWidth: 0, height: 32 }}>
            <Canvas
              height={32}
              label={key === "weight" ? `Room size: ${weightWord(shown).toLowerCase()}` : `${label}: ${money(shown)} extra`}
              draw={draw}
              {...(onPointer ? { onPointer } : {})}
            />
          </div>
          <span
            style={{
              flex: "none",
              width: 78,
              textAlign: "right",
              fontSize: key === "weight" || unset ? 13 : 15,
              lineHeight: "20px",
              fontWeight: 600,
              color: c.text,
              whiteSpace: "nowrap",
              overflow: "visible",
            }}
          >
            {valueText}
          </span>
        </div>
      );
    };

    const willLock = (room: Room): boolean =>
      room.user === me && !agreedSet.has(me) && state.rooms.every((r) => r.user !== null && (r.user === me || agreedSet.has(r.user)));

    const face = (room: Room, size: number, agreed: boolean) => {
      if (!room.user) {
        return <span aria-hidden="true" style={{ flex: "none", width: size, height: size, borderRadius: size / 2, border: `2px dashed ${c.divider}` }} />;
      }
      return (
        <span
          style={{
            position: "relative",
            display: "flex",
            flex: "none",
            width: size,
            height: size,
            borderRadius: size / 2,
            boxShadow: agreed ? `0 0 0 2px ${c.card}, 0 0 0 4px ${c.primary}` : undefined,
          }}
        >
          <span style={{ display: "flex", borderRadius: "50%" }}>
            <Avatar user={room.user} size={size} />
          </span>
          {agreed ? null : <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: c.card, opacity: 0.45 }} />}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: -1,
              bottom: -1,
              width: 16,
              height: 16,
              borderRadius: 8,
              background: c.primary,
              boxShadow: `0 0 0 2px ${c.card}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `scale(${agreed ? 1 : 0})`,
              opacity: agreed ? 1 : 0,
              transition: `transform ${theme.motion.fast}ms ease, opacity ${theme.motion.fast}ms ease`,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={c.onPrimary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 6.2 5 8.6l4.5-5" />
            </svg>
          </span>
        </span>
      );
    };

    const roomColumn = (room: Room, size: number, colW: number) => {
      const agreed = !!room.user && agreedSet.has(room.user);
      const open = room.user === null;
      const mine = room.user === me;
      let below: Child;
      if (open) {
        below = canTake() ? (
          <Button kind="deemphasized" onClick={() => dispatch({ t: "take", room: room.id })}>
            Take
          </Button>
        ) : (
          <span style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>Open</span>
        );
      } else if (mine && agreed) {
        below = (
          <Button kind="deemphasized" onClick={() => dispatch({ t: "agree" })}>
            Undo
          </Button>
        );
      } else if (mine) {
        below = (
          <Button
            kind="primary"
            onClick={() => {
              dispatch({ t: "agree" });
              if (willLock(room)) haptic("success");
            }}
          >
            Agree
          </Button>
        );
      } else if (agreed) {
        below = <span style={{ fontSize: 12, lineHeight: "16px", color: c.text }}>{holderOf(room)}</span>;
      } else {
        below = <span style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>Waiting</span>;
      }
      return (
        <div key={room.id} style={{ flex: "0 0 auto", width: colW, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", minWidth: 0 }}>
          {face(room, size, agreed)}
          <div style={{ marginTop: 1, minWidth: 0, maxWidth: "100%", overflow: "visible" }}>{below}</div>
        </div>
      );
    };

    const canTake = () => !myRoom;

    const openRow = () => {
      const small = N > 4;
      const size = small ? 28 : 40;
      const colW = small ? inner / Math.max(1, N) : 48;
      return (
        <div style={{ height: 88, display: "flex", justifyContent: "space-around", alignItems: "flex-start", paddingTop: 2, overflow: "visible" }}>
          {state.rooms.map((room) => roomColumn(room, size, colW))}
        </div>
      );
    };

    const lockedRow = () => {
      const size = inner >= 340 && N <= 4 ? 40 : 28;
      const colW = size + 8;
      const showFaces = N <= 5;
      const groupW = showFaces ? N * colW : 0;
      return (
        <div style={{ height: 66, display: "flex", alignItems: "center", gap: showFaces ? 6 : 0, overflow: "visible" }}>
          {showFaces ? (
            <div style={{ flex: "0 0 auto", width: groupW, display: "flex", justifyContent: "space-around", alignItems: "flex-start", paddingTop: 2 }}>
              {state.rooms.map((room) => (
                <div key={room.id} style={{ flex: "0 0 auto", width: colW, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
                  {face(room, size, true)}
                  <span style={{ marginTop: 1, maxWidth: "100%", fontSize: 12, lineHeight: "16px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{holderOf(room)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Locked detail={`${N} of ${N} agree`}>Rent's set</Locked>
          </div>
        </div>
      );
    };

    const roomNames = state.rooms
      .map((room) => `${room.user ? nameOf(room) : room.name || "Open"} ${moneyWhole(sh[state.rooms.indexOf(room)] ?? 0)}`)
      .join(", ");

    return (
      <div>
        <CardHeader title="Rent split" subtitle={locked ? `${state.title} · locked · ${N} agree` : `${state.title} · ${money(state.rent)}/mo`} />

        <Changed at={state.lockedAt} radius={0}>
          <div
            role="group"
            aria-label={`Floor plan, ${N} rooms: ${roomNames}`}
            style={{ position: "relative", height: planH, background: c.card, overflow: "hidden" }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 146 * sx,
                top: 0,
                width: 100 * sx,
                height: planH,
                background: c.wash,
                overflow: "hidden",
              }}
            >
              {Array.from({ length: 9 }, (_, q) => (
                <span
                  key={`board${q}`}
                  style={{ position: "absolute", left: 6 * sx, right: 6 * sx, top: (12 + q * 22) * sy, height: 1, background: mix(c.wash, c.divider, 0.5) }}
                />
              ))}
              <div style={{ position: "absolute", left: 0, right: 0, top: "40%", transform: "translateY(-50%)", textAlign: "center", fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>
                <div>living</div>
                <div>+ kitchen</div>
              </div>
              <div
                aria-hidden="true"
                style={{ position: "absolute", left: "50%", top: "65%", width: 56 * sx, height: 20 * sy, marginLeft: -28 * sx, marginTop: -10 * sy, borderRadius: 6, background: c.track }}
              >
                <span style={{ position: "absolute", left: 5 * sx, top: 5 * sy, right: 5 * sx, bottom: 5 * sy, borderRadius: 3, background: mix(c.track, c.card, 0.3) }} />
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 7, textAlign: "center", fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>{`split ${N} ways`}</div>
            </div>

            {roomEls}

            <svg
              aria-hidden="true"
              width={inner}
              height={planH}
              viewBox="0 0 380 200"
              preserveAspectRatio="none"
              style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "hidden" }}
            >
              {lines}
              {arcs}
            </svg>
          </div>
        </Changed>

        {slider("weight", "Room size")}
        {slider("bath", "Private bath")}
        {slider("parking", "Parking spot")}

        {locked ? lockedRow() : openRow()}
      </div>
    );
  },
});
