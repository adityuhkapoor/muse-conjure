import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  More,
  Toast,
  fitText,
  haptic,
  innerWidth,
  mix,
  pal,
  running,
  textWidth,
  type Ctx,
  type Member,
  type Theme,
  type Child,
} from "@muse/app";

// "Who drives to pick up the couch": three friends' cars drawn side-on. Tap one and the green velvet
// couch drops onto it (the truck's bed swallows it, the wagon takes it on the roof rack, the hatchback
// bonks and shows a red X). Pick the time most people are free, tap your face to lift, then lock the run:
// the little car drives the route with the couch on.

type Kind = "hatch" | "wagon" | "truck";
type Params = {
  /** Card title: "Couch pickup run" */
  title: string;
  /** Item and catch: "84″ couch · 3rd floor walk-up" */
  sub: string;
  /** What is being picked up. */
  item: string;
  route: { from: string; to: string; dist: string };
  /** 1 to 3 cars. fits: 0 no, 1 roof rack, 2 in the bed. */
  cars: { driver: string; car: string; kind: Kind; fits: 0 | 1 | 2; seats: string }[];
  /** 1 to 3 times, with who is free. */
  slots: { label: string; free: string[] }[];
  /** How many people the free counts are out of. */
  crew: number;
  /** Names already lifting. */
  lifting: string[];
  /** Lifters needed, 1 to 4. */
  need: number;
};

// @params
const P: Params = {
  title: "Couch pickup run",
  sub: "84″ couch · 3rd floor walk-up",
  item: "couch",
  route: { from: "Campus", to: "Seller · Rockridge", dist: "3.4 mi · 14 min" },
  cars: [
    { driver: "Maya", car: "Civic", kind: "hatch", fits: 0, seats: "5 seats" },
    { driver: "Dev", car: "Tacoma", kind: "truck", fits: 2, seats: "2 seats + bed" },
    { driver: "Jess", car: "Outback", kind: "wagon", fits: 1, seats: "5 seats + rack" },
  ],
  slots: [
    { label: "Sat 10:00", free: ["Sam", "Theo", "Noa"] },
    { label: "Sat 11:30", free: ["Sam", "Priya", "Theo", "Maya", "Noa"] },
    { label: "Sat 2:00", free: ["Priya", "Theo", "Maya"] },
  ],
  crew: 5,
  lifting: ["Theo"],
  need: 2,
};
// @end params

type Car = { driver: string; driverId: string | null; car: string; kind: Kind; fits: 0 | 1 | 2; seats: string };
type Slot = { label: string; free: string[] };
type State = {
  title: string;
  sub: string;
  item: string;
  route: { from: string; to: string; dist: string };
  cars: Car[];
  slots: Slot[];
  crew: number;
  need: number;
  car: number;
  carAt: number;
  slot: number;
  lifters: string[];
  helpers: string[];
  lockedAt: number;
  lockedBy: string;
};
type Action =
  | { t: "car"; i: number }
  | { t: "slot"; i: number }
  | { t: "lift" }
  | { t: "lock" }
  | { t: "reopen" }
  | { t: "offer"; kind: string };
type Local = { offering: boolean };

const KINDS: Kind[] = ["hatch", "wagon", "truck"];
const OFFER: Record<Kind, { car: string; fits: 0 | 1 | 2 }> = {
  truck: { car: "Truck", fits: 2 },
  wagon: { car: "Wagon", fits: 1 },
  hatch: { car: "Hatchback", fits: 0 },
};
const DROP_MS = 500;
const DRIVE_MS = 3000;
const TOAST_MS = 2400;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const matchMember = (ctx: Ctx, name: string) => {
  const low = name.toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.toLowerCase() === low);
};
const lifting = (s: State) => s.lifters.length + s.helpers.length;
const ready = (s: State) => s.car >= 0 && !!s.cars[s.car] && s.cars[s.car]!.fits > 0 && s.slot >= 0 && lifting(s) >= s.need;
// An independent reading of "ready" for the checks.
const readyCopy = (s: State) => {
  const c = s.cars[s.car];
  return !!c && c.fits !== 0 && s.slot !== -1 && s.lifters.length + s.helpers.length >= s.need;
};
const needLine = (s: State) => {
  const c = s.cars[s.car];
  if (s.car < 0 || !c) return "Pick a car";
  if (c.fits === 0) return "Pick a bigger car";
  if (s.slot < 0) return "Pick a time";
  return `Need ${s.need} lifters`;
};

function initState(ctx: Ctx): State {
  const cars: Car[] = [];
  for (const raw of (P.cars ?? []).slice(0, 6)) {
    if (cars.length >= 3) break;
    const driver = clean(raw.driver, 16);
    if (!driver || cars.some((c) => c.driver.toLowerCase() === driver.toLowerCase())) continue;
    const kind = KINDS.includes(raw.kind) ? raw.kind : "wagon";
    const fits = raw.fits === 0 || raw.fits === 1 || raw.fits === 2 ? raw.fits : 1;
    cars.push({ driver, driverId: matchMember(ctx, driver)?.id ?? null, car: clean(raw.car, 14), kind, fits, seats: clean(raw.seats, 18) });
  }
  const slots: Slot[] = [];
  for (const raw of (P.slots ?? []).slice(0, 3)) {
    const label = clean(raw.label, 12);
    if (!label) continue;
    const free = (raw.free ?? [])
      .map((n) => clean(n, 16))
      .filter(Boolean)
      .slice(0, 12)
      .map((n) => matchMember(ctx, n)?.id ?? n);
    slots.push({ label, free });
  }
  if (!slots.length) slots.push({ label: "Sat 11:00", free: [] }, { label: "Sun 11:00", free: [] });
  const crewDefault = Math.max(1, ...slots.map((s) => s.free.length));
  const lifters: string[] = [];
  const helpers: string[] = [];
  for (const raw of (P.lifting ?? []).slice(0, 8)) {
    const n = clean(raw, 16);
    if (!n) continue;
    const m = matchMember(ctx, n);
    if (m) {
      if (!lifters.includes(m.id)) lifters.push(m.id);
    } else if (helpers.length < 6 && !helpers.includes(n)) helpers.push(n);
  }
  return {
    title: clean(P.title, 40) || "Pickup run",
    sub: clean(P.sub, 48),
    item: clean(P.item, 16) || "couch",
    route: { from: clean(P.route?.from, 20) || "Start", to: clean(P.route?.to, 24) || "Pickup", dist: clean(P.route?.dist, 20) },
    cars,
    slots,
    crew: Number.isInteger(P.crew) && P.crew >= 1 && P.crew <= 20 ? P.crew : Math.min(20, crewDefault),
    need: Number.isInteger(P.need) && P.need >= 1 && P.need <= 4 ? P.need : 2,
    car: -1,
    carAt: 0,
    slot: -1,
    lifters,
    helpers,
    lockedAt: 0,
    lockedBy: "",
  };
}

// ---------- drawing ----------

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOutBack = (x: number) => {
  const y = clamp01(x) - 1;
  return 1 + 2.70158 * y * y * y + 1.70158 * y * y;
};
const easeInOut = (x: number) => {
  const y = clamp01(x);
  return y < 0.5 ? 2 * y * y : 1 - ((2 - 2 * y) * (2 - 2 * y)) / 2;
};
const f1 = (n: number) => Math.round(n * 10) / 10;

type El = Child;

/** A car side-on in a box (L, T, W, 40). */
function carArt(th: Theme, kind: Kind, L: number, T: number, W: number, bounce: number, spin: number): El[] {
  const c = th.color;
  const pl = pal(th);
  const col = kind === "hatch" ? c.series4 : kind === "truck" ? c.series1 : c.series3;
  const lo = mix(col, c.text, 0.25);
  const steel = th.mode === "dark" ? mix(c.card, c.text, 0.12) : mix(c.text, c.card, 0.15);
  const glass = pl.sky;
  const R = T + 40;
  const b = bounce;
  const bb = R - 7.2 + b;
  const bh = kind === "hatch" ? 15.2 : 14.4;
  const bt = bb - bh;
  const out: El[] = [];
  out.push(<ellipse key="sh" cx={f1(L + W / 2)} cy={R} rx={f1(W / 2)} ry={3} fill={c.text} opacity={0.16} />);
  const pts = (list: [number, number][]) => list.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");
  const toward = (list: [number, number][], tx: number, ty: number, k: number): [number, number][] => list.map(([x, y]) => [x + (tx - x) * k, y + (ty - y) * k]);
  if (kind === "hatch") {
    out.push(<rect key="base" x={f1(L)} y={f1(bt)} width={f1(W)} height={bh} rx={8} fill={col} />);
    const cab: [number, number][] = [[L + 0.08 * W, bt + 2], [L + 0.22 * W, T + 3.2 + b], [L + 0.56 * W, T + 2 + b], [L + 0.8 * W, bt + 2]];
    out.push(<polygon key="cab" points={pts(cab)} fill={col} />);
    out.push(<polygon key="gl" points={pts(toward(cab, L + 0.44 * W, bt, 0.18))} fill={glass} />);
    out.push(<line key="pil" x1={f1(L + 0.46 * W)} y1={f1(T + 4 + b)} x2={f1(L + 0.46 * W)} y2={f1(bt)} stroke={col} stroke-width={2.5} />);
  } else if (kind === "wagon") {
    out.push(<rect key="base" x={f1(L)} y={f1(bt)} width={f1(W)} height={bh} rx={7} fill={col} />);
    const cab: [number, number][] = [[L + 0.03 * W, bt + 2], [L + 0.06 * W, T + 8.8 + b], [L + 0.62 * W, T + 8 + b], [L + 0.8 * W, bt + 2]];
    out.push(<polygon key="cab" points={pts(cab)} fill={col} />);
    out.push(<polygon key="gl" points={pts(toward(cab, L + 0.4 * W, bt, 0.16))} fill={glass} />);
    for (const k of [0.3, 0.55]) out.push(<line key={`p${k}`} x1={f1(L + k * W)} y1={f1(T + 8.8 + b)} x2={f1(L + k * W)} y2={f1(bt)} stroke={col} stroke-width={2.5} />);
    out.push(<line key="rack" x1={f1(L + 0.08 * W)} y1={f1(T + 5.2 + b)} x2={f1(L + 0.6 * W)} y2={f1(T + 5.2 + b)} stroke={steel} stroke-width={2.5} stroke-linecap="round" />);
    for (const k of [0.12, 0.55]) out.push(<line key={`l${k}`} x1={f1(L + k * W)} y1={f1(T + 5.2 + b)} x2={f1(L + k * W)} y2={f1(T + 8.4 + b)} stroke={steel} stroke-width={2} />);
  } else {
    out.push(<rect key="base" x={f1(L)} y={f1(bt)} width={f1(W)} height={bh} rx={6} fill={col} />);
    const x0 = L + 0.52 * W, x1 = L + 0.82 * W, y0 = T + 4.8 + b, y1 = bt + 3;
    out.push(<path key="cab" d={`M${f1(x0)} ${f1(y1)}V${f1(y0 + 4)}A4 4 0 0 1 ${f1(x0 + 4)} ${f1(y0)}H${f1(x1 - 12)}A12 12 0 0 1 ${f1(x1)} ${f1(y0 + 12)}V${f1(y1)}Z`} fill={col} />);
    const gx0 = x0 + 5 + 2, gx1 = x1 - 5 + 2, gy0 = y0 + 4 - 1, gy1 = gy0 + Math.max(5, (y1 - y0) * 0.5);
    const rr = Math.min(9, gy1 - gy0, gx1 - gx0);
    out.push(<path key="gl" d={`M${f1(gx0)} ${f1(gy1)}V${f1(gy0)}H${f1(gx1 - rr)}A${f1(rr)} ${f1(rr)} 0 0 1 ${f1(gx1)} ${f1(gy0 + rr)}V${f1(gy1)}Z`} fill={glass} />);
    out.push(<rect key="bed" x={f1(L)} y={f1(bt - 3)} width={f1(0.5 * W)} height={6} rx={2} fill={lo} />);
  }
  out.push(<rect key="hl" x={f1(L + W - 6)} y={f1(bb - 12)} width={6} height={5} rx={2} fill={pl.cream} />);
  out.push(<rect key="tl" x={f1(L)} y={f1(bb - 12)} width={4} height={5} rx={1} fill={pl.red} />);
  out.push(<line key="sill" x1={f1(L + 3)} y1={f1(bb - 4)} x2={f1(L + W - 3)} y2={f1(bb - 4)} stroke={lo} stroke-width={1.5} />);
  for (const k of [0.2, 0.8]) {
    const wx = L + k * W;
    out.push(<circle key={`w${k}`} cx={f1(wx)} cy={f1(R - 8)} r={8} fill={steel} />);
    out.push(<circle key={`h${k}`} cx={f1(wx)} cy={f1(R - 8)} r={4} fill={mix(steel, c.card, 0.6)} />);
    for (let s = 0; s < 3; s++) {
      const a = ((spin + s * 120) * Math.PI) / 180;
      out.push(<line key={`s${k}${s}`} x1={f1(wx)} y1={f1(R - 8)} x2={f1(wx + Math.cos(a) * 3.84)} y2={f1(R - 8 + Math.sin(a) * 3.84)} stroke={steel} stroke-width={1.2} />);
    }
  }
  return out;
}

/** The green velvet couch in a box. */
function couchArt(th: Theme, x: number, y: number, w: number, h: number, tilt = 0): El {
  const c = th.color;
  const pl = pal(th);
  const col = mix(c.series3, c.text, 0.45);
  const hi = mix(col, c.card, 0.18);
  const lo = mix(col, c.text, 0.25);
  const legs = h * 0.08;
  const bh = h - legs;
  const arm = 0.11 * w;
  const seatTop = y + 0.5 * bh;
  const seatH = y + bh - seatTop;
  const seatW = w - arm;
  const cw = (seatW - arm) / 3 - 3;
  const tr = (cx: number, cy: number) => `rotate(${f1((tilt * 180) / Math.PI)} ${f1(cx)} ${f1(cy)})`;
  return (
    <g transform={tr(x + w / 2, y + h / 2)}>
      <path d={`M${f1(x + 0.06 * w)} ${f1(y + bh)}h${f1(0.05 * w)}l-1 ${f1(legs)}h-${f1(0.03 * w)}z`} fill={pl.brown} />
      <path d={`M${f1(x + 0.89 * w)} ${f1(y + bh)}h${f1(0.05 * w)}l-1 ${f1(legs)}h-${f1(0.03 * w)}z`} fill={pl.brown} />
      <rect x={f1(x + 0.6 * arm)} y={f1(y)} width={f1(w - 1.2 * arm)} height={f1(0.62 * bh)} rx={f1(0.28 * h)} fill={lo} />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={`t${i}`} cx={f1(x + arm + ((w - 2 * arm) * (i + 0.5)) / 5)} cy={f1(y + 0.4 * bh)} r={f1(Math.max(1.2, 0.025 * h))} fill={c.text} opacity={0.3} />
      ))}
      <rect x={f1(x + 0.5 * arm)} y={f1(seatTop)} width={f1(seatW)} height={f1(seatH)} rx={f1(0.2 * h)} fill={col} />
      {[0, 1, 2].map((i) => (
        <rect key={`u${i}`} x={f1(x + arm + 1.5 + i * (cw + 3))} y={f1(seatTop - 3)} width={f1(cw)} height={f1(0.42 * seatH)} rx={f1(0.17 * h)} fill={hi} />
      ))}
      {[x, x + w - arm].map((ax, i) => (
        <g key={`a${i}`}>
          <rect x={f1(ax)} y={f1(y + 0.3 * bh)} width={f1(arm)} height={f1(0.7 * bh)} rx={f1(0.15 * h)} fill={col} />
          <rect x={f1(ax)} y={f1(y + 0.3 * bh)} width={f1(arm)} height={f1(Math.max(2, 0.14 * h))} rx={f1(0.07 * h)} fill={hi} />
        </g>
      ))}
      <rect
        x={f1(x + arm + 0.1 * w - 0.15 * h)}
        y={f1(y + 0.45 * bh - 0.1275 * h)}
        width={f1(0.3 * h)}
        height={f1(0.255 * h)}
        rx={1.5}
        fill={mix(c.series4, c.card, 0.45)}
        transform={`rotate(-14.3 ${f1(x + arm + 0.1 * w)} ${f1(y + 0.45 * bh)})`}
      />
    </g>
  );
}

const Pin = ({ x, y, fill, dot, card }: { x: number; y: number; fill: string; dot: string | null; card: string }) => (
  <g>
    <circle cx={f1(x)} cy={f1(y - 9.1)} r={5.95} fill={fill} />
    <polygon points={`${f1(x - 5.04)},${f1(y - 6)} ${f1(x + 5.04)},${f1(y - 6)} ${f1(x)},${f1(y)}`} fill={fill} />
    {dot ? <circle cx={f1(x)} cy={f1(y - 9.1)} r={2.45} fill={dot} /> : <circle cx={f1(x)} cy={f1(y - 9.1)} r={2.45} fill={card} />}
  </g>
);

const Check = ({ color }: { color: string }) => (
  <svg width={8} height={8} viewBox="0 0 8 8" aria-hidden="true" fill="none" stroke={color} stroke-width={1.5} stroke-linecap="round" stroke-linejoin="round">
    <path d="M1.5 4.2 3.3 6 6.6 2.2" />
  </svg>
);

export default defineApp<State, Action, Local>({
  name: "Pickup run",

  summary: (s, ctx) => {
    const c = s.cars[s.car];
    const slot = s.slots[s.slot]?.label;
    if (s.lockedAt > 0) return `${s.title}: locked · ${c?.driver ?? "someone"} drives · ${slot ?? "no time yet"}`;
    void ctx;
    return `${s.title}: ${c ? `${c.driver}'s ${c.car}` : "no car yet"} · ${slot ?? "no time yet"} · ${lifting(s)} of ${s.need} lifting`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "reopen") return s.lockedAt > 0 ? { ...s, lockedAt: 0, lockedBy: "" } : s;
    if (s.lockedAt > 0) return s;
    if (a.t === "car") {
      if (!Number.isInteger(a.i) || a.i < 0 || a.i >= s.cars.length || a.i === s.car) return s;
      return { ...s, car: a.i, carAt: m.time };
    }
    if (a.t === "slot") {
      if (!Number.isInteger(a.i) || a.i < 0 || a.i >= s.slots.length || a.i === s.slot) return s;
      return { ...s, slot: a.i };
    }
    if (a.t === "lift") {
      return { ...s, lifters: s.lifters.includes(m.user) ? s.lifters.filter((u) => u !== m.user) : [...s.lifters, m.user] };
    }
    if (a.t === "lock") {
      if (!ready(s)) return s;
      return { ...s, lockedAt: m.time, lockedBy: m.user };
    }
    if (a.t === "offer") {
      const kind = KINDS.find((k) => k === a.kind);
      if (!kind || s.cars.length >= 3 || s.cars.some((c) => c.driverId === m.user)) return s;
      const who = ctx.members.find((x) => x.id === m.user);
      const o = OFFER[kind];
      return { ...s, cars: [...s.cars, { driver: clean(who?.name, 16) || "Someone", driverId: m.user, car: o.car, kind, fits: o.fits, seats: "" }] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const lifters = s.lifters.filter((u) => inChat(ctx, u));
    if (lifters.length === s.lifters.length) return s;
    const next = { ...s, lifters };
    return next.lockedAt > 0 && !ready(next) ? { ...next, lockedAt: 0, lockedBy: "" } : next;
  },

  invariants: {
    "choices point at real cars and slots": (s) =>
      (s.car === -1 || (Number.isInteger(s.car) && s.car >= 0 && s.car < s.cars.length)) &&
      (s.slot === -1 || (Number.isInteger(s.slot) && s.slot >= 0 && s.slot < s.slots.length)) &&
      (s.car === -1) === (s.carAt === 0),
    "a locked run is ready": (s) => (s.lockedAt === 0 || readyCopy(s)) && (s.lockedAt === 0) === (s.lockedBy === ""),
    "lifters are in the chat, once": (s, ctx) => new Set(s.lifters).size === s.lifters.length && s.lifters.every((u) => ctx.members.some((m) => m.id === u)),
    "at most 3 cars, one per driver in the chat": (s) => {
      const ids = s.cars.map((c) => c.driverId).filter((x): x is string => x !== null);
      return s.cars.length <= 3 && new Set(ids).size === ids.length;
    },
    "need and crew are sane": (s) =>
      Number.isInteger(s.need) && s.need >= 1 && s.need <= 4 && Number.isInteger(s.crew) && s.crew >= 1 && s.crew <= 20 && s.slots.length >= 1 && s.slots.length <= 3,
  },

  transitions: {
    "nothing moves while locked": (p, n, a) => p.lockedAt === 0 || a.t === "reopen" || p === n,
    "a car tap picks that car now": (p, n, a, m) => a.t !== "car" || p === n || (n.car === a.i && n.carAt === m.time && n.slot === p.slot),
    "tapping the picked car again changes nothing": (p, n, a) => a.t !== "car" || a.i !== p.car || n.carAt === p.carAt,
    "a slot tap picks that slot": (p, n, a) => a.t !== "slot" || p === n || (n.slot === a.i && n.car === p.car),
    "lift toggles only the lifter": (p, n, a, m) => {
      if (a.t !== "lift" || p === n) return true;
      const gone = p.lifters.filter((u) => !n.lifters.includes(u));
      const added = n.lifters.filter((u) => !p.lifters.includes(u));
      const diff = [...gone, ...added];
      return diff.length === 1 && diff[0] === m.user;
    },
    "lock needs a fitting car, a time and enough lifters": (p, n, a, m) => a.t !== "lock" || p === n || (readyCopy(p) && n.lockedAt === m.time && n.lockedBy === m.user),
    "an offer adds the actor's own car": (p, n, a, m) => a.t !== "offer" || p === n || (n.cars.length === p.cars.length + 1 && n.cars[n.cars.length - 1]?.driverId === m.user),
    "the route, slots and helpers never change": (p, n) =>
      JSON.stringify(p.route) === JSON.stringify(n.route) && JSON.stringify(p.slots) === JSON.stringify(n.slots) && JSON.stringify(p.helpers) === JSON.stringify(n.helpers),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (s.lockedAt > 0) return k < 0.6 ? { t: "reopen" } : { t: "lift" };
    if (k < 0.25) return { t: "car", i: r.int(Math.max(1, s.cars.length)) };
    if (k < 0.4) return { t: "slot", i: r.int(s.slots.length) };
    if (k < 0.65) return { t: "lift" };
    if (k < 0.9) return { t: "lock" };
    return { t: "offer", kind: r.pick(["truck", "wagon", "hatch"]) };
  },

  local: { offering: false },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = innerWidth();
    const narrow = W < 360;
    const cw = (W - 16) / 3;
    const locked = confirmed.lockedAt > 0;
    const person = (id: string): Member => members.find((m) => m.id === id) ?? { id, name: id };
    const byName = (name: string): Member => members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase()) ?? { id: name.toLowerCase(), name };
    const iDrive = state.cars.some((x) => x.driverId === me);
    const ok = ready(state);
    const dropMs = confirmed.car >= 0 ? running(confirmed.carAt, DROP_MS) : null;
    const driveMs = locked ? running(confirmed.lockedAt, DRIVE_MS) : null;
    const toastMs = locked ? running(confirmed.lockedAt, TOAST_MS) : null;

    // ---- cars
    const panels: El[] = [];
    for (let i = 0; i < 3; i++) {
      const left = i * (cw + 8);
      const car = state.cars[i];
      if (!car) {
        const offering = local.offering && !iDrive;
        panels.push(
          <div
            key={`x${i}`}
            style={{
              position: "absolute", left, top: 2, width: cw, height: 126, boxSizing: "border-box", borderRadius: 12,
              border: `1.5px dashed ${c.divider}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            {offering ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {(["truck", "wagon", "hatch"] as const).map((k) => (
                  <Button key={k} kind="secondary" onClick={() => { dispatch({ t: "offer", kind: k }); setLocal({ offering: false }); }}>
                    {k === "truck" ? "Truck" : k === "wagon" ? "Wagon" : "Small"}
                  </Button>
                ))}
              </div>
            ) : (
              <>
                <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{iDrive ? "Room for one" : "Your car?"}</span>
                {iDrive ? null : (
                  <Button kind="deemphasized" onClick={() => setLocal({ offering: true })}>
                    Drive
                  </Button>
                )}
              </>
            )}
          </div>,
        );
        continue;
      }
      const sel = state.car === i;
      const k = !sel ? 1 : dropMs !== null && confirmed.car === i ? dropMs / DROP_MS : confirmed.car === i ? 1 : 0;
      const L = 10;
      const Wc = cw - 20;
      const T = 32;
      const shake = sel && car.fits === 0 && k > 0.5 && k < 1 ? Math.sin((k - 0.5) * 40) * 3 : 0;
      const bounce = sel && car.fits > 0 && k >= 0.5 && k < 1 ? 3 * (1 - smooth(0.55, 1, k)) : 0;
      const tgt = car.fits === 2 ? { x: L + 2, y: T + 4, w: 0.5 * Wc, h: 16 } : car.fits === 1 ? { x: L + 0.04 * Wc, y: T - 12, w: 0.62 * Wc, h: 16 } : { x: L - 10, y: T - 14, w: 0.95 * Wc, h: 18 };
      const fall = easeOutBack(k / 0.6);
      const cy = lerp(-20, tgt.y, fall);
      const tilt = car.fits === 0 && k > 0.5 ? 0.18 * smooth(0.5, 0.7, k) : 0;
      const label = fitText(`${car.driver}'s ${car.car}`, cw - 16, { size: 15, min: 11 });
      const fitsTxt = car.fits === 2 ? "Fits in the bed" : car.fits === 1 ? "Roof rack + straps" : "Won't fit";
      const fitsCol = car.fits === 2 ? mix(c.positive, c.text, 0.3) : car.fits === 1 ? mix(c.warning, c.text, 0.35) : mix(c.negative, c.text, 0.25);
      const second = sel ? fitsTxt : car.seats || OFFER[car.kind].car;
      const line2 = fitText(second, cw - 16, { size: 13, min: 10 });
      const aria = `${car.driver}'s ${car.car}, ${car.fits === 2 ? "fits in the bed" : car.fits === 1 ? "roof rack and straps" : "won't fit"}`;
      panels.push(
        <button
          key={`c${i}`}
          type="button"
          aria-label={aria}
          aria-pressed={sel}
          disabled={locked}
          onClick={() => dispatch({ t: "car", i })}
          style={{
            position: "absolute", left, top: 2, width: cw, height: 126, padding: 0, border: "none", borderRadius: 12, overflow: "hidden",
            background: sel ? c.selected : c.wash, display: "block", cursor: "pointer", font: "inherit",
          }}
        >
          <svg width={cw} height={126} viewBox={`0 0 ${f1(cw)} 126`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            <line x1={6} y1={72} x2={f1(cw - 6)} y2={72} stroke={mix(c.secondaryText, c.card, 0.6)} stroke-width={1} />
            <g transform={`translate(${f1(shake)} 0)`}>{carArt(theme, car.kind, L, T, Wc, bounce, 0)}</g>
            {sel ? couchArt(theme, tgt.x + shake, cy, tgt.w, tgt.h, tilt) : null}
            {sel && car.fits === 1 && k >= 1
              ? [0.25, 0.75].map((f) => (
                  <line key={f} x1={f1(tgt.x + f * tgt.w + shake)} y1={f1(tgt.y - 1)} x2={f1(tgt.x + f * tgt.w + shake)} y2={f1(tgt.y + tgt.h + 6)} stroke={c.series2} stroke-width={2} />
                ))
              : null}
            {sel && car.fits === 0 && k > 0.6 ? (
              <g>
                <circle cx={f1(L + Wc / 2)} cy={f1(T + 20 - 4)} r={11} fill={c.negative} />
                <path d={`M${f1(L + Wc / 2 - 4.5)} ${f1(T + 16 - 4.5)}l9 9M${f1(L + Wc / 2 + 4.5)} ${f1(T + 16 - 4.5)}l-9 9`} stroke={c.onPrimary} stroke-width={2.5} stroke-linecap="round" />
              </g>
            ) : null}
            <text x={8} y={93} font-size={label.size} fill={c.text} font-family={theme.type.family}>
              {label.text}
            </text>
            <text x={8} y={112} font-size={line2.size} fill={sel ? fitsCol : c.secondaryText} font-family={theme.type.family}>
              {line2.text}
            </text>
          </svg>
          <span style={{ position: "absolute", left: 7, top: 7, width: 18, height: 18, borderRadius: "50%", boxShadow: `0 0 0 2px ${c.card}`, display: "flex" }}>
            <Avatar user={car.driverId ? person(car.driverId) : byName(car.driver)} size={18} />
          </span>
        </button>,
      );
    }

    // ---- route
    const rx = (u: number) => lerp(18, W - 18, u);
    const ry = (u: number) => 26 + Math.sin(2 * Math.PI * u) * 7;
    const pathD = Array.from({ length: 51 }, (_, j) => `${j === 0 ? "M" : "L"}${f1(rx(j / 50))} ${f1(ry(j / 50))}`).join("");
    const fromT = fitText(state.route.from, Math.max(40, W / 2 - 60), { size: 13, min: 10 });
    const toT = fitText(state.route.to, Math.max(40, W / 2 - 60), { size: 13, min: 10 });
    const distT = fitText(state.route.dist, W - 60, { size: 13, min: 10 });
    const dw = textWidth(distT.text, distT.size);
    const crowded = W / 2 + dw / 2 + 2 > W - 30 - textWidth(toT.text, toT.size) || W / 2 - dw / 2 - 2 < 30 + textWidth(fromT.text, fromT.size);
    const mini = driveMs !== null || locked ? (driveMs === null ? 0.9 : easeInOut((driveMs - 300) / 2400) * 0.9) : null;
    const lockedCar = state.cars[state.car];

    // ---- slots
    const sw = (W - 16) / 3;
    const maxFree = narrow ? 3 : 5;

    // ---- lifters
    const maxFaces = locked ? 4 : narrow ? 4 : 6;
    const shownMembers = members.slice(0, maxFaces);
    const extra = members.length - shownMembers.length;
    const helperRoom = Math.max(0, maxFaces - shownMembers.length);
    const helpers = extra > 0 ? [] : state.helpers.slice(0, Math.max(helperRoom, 0));
    const lifts = state.lifters.includes(me);
    const faceX = (i: number) => 16 + 34 * i;
    const ctrlW = 128;
    const homeFit = fitText("Couch home by noon-ish", 140, { size: 13, min: 10 });
    const driveFit = fitText(`${lockedCar?.driver ?? ""} drives · ${state.slots[state.slot]?.label ?? ""}`, 140, { size: 15, min: 11, weight: 600 });

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub} />
        <div style={{ height: 132, marginTop: 4, position: "relative" }}>{panels}</div>

        <div style={{ position: "relative", height: 96, marginTop: 6 }}>
          <svg width={W} height={44} viewBox={`0 0 ${f1(W)} 44`} role="img" aria-label={`${state.route.from} to ${state.route.to}, ${state.route.dist}`} style={{ position: "absolute", left: 0, top: 0 }}>
            <path d={pathD} fill="none" stroke={c.wash} stroke-width={8} stroke-linecap="round" stroke-linejoin="round" />
            <path d={pathD} fill="none" stroke={c.secondaryText} stroke-width={2} opacity={0.8} stroke-dasharray="6 5" />
            <Pin x={18} y={30} fill={c.text} dot={c.card} card={c.card} />
            <Pin x={W - 18} y={30} fill={c.negative} dot={null} card={c.card} />
            {toastMs === null ? (
              <g>
                <text x={30} y={16.5} font-size={fromT.size} fill={c.secondaryText} font-family={theme.type.family}>
                  {fromT.text}
                </text>
                <text x={W - 30} y={16.5} text-anchor="end" font-size={toT.size} fill={c.secondaryText} font-family={theme.type.family}>
                  {toT.text}
                </text>
                <text x={W / 2} y={crowded ? 40 : 14.5} text-anchor="middle" font-size={distT.size} fill={c.text} font-family={theme.type.family}>
                  {distT.text}
                </text>
              </g>
            ) : null}
            {mini !== null && lockedCar ? (
              <g transform={`translate(${f1(rx(mini) - 17)} ${f1(ry(mini) - 6 - 16)}) scale(0.4)`}>
                {carArt(theme, lockedCar.kind, 0, 0, 85, 0, mini * 30 * 20)}
                {couchArt(theme, lockedCar.fits === 2 ? 3 : 8, lockedCar.fits === 2 ? -4 : -14, 45, 20)}
              </g>
            ) : null}
          </svg>
          <div style={{ position: "absolute", left: 0, right: 0, top: 48, display: "flex", gap: 8 }}>
            {state.slots.map((sl, i) => {
              const sel = state.slot === i;
              const fill = sel ? c.selected : c.secondaryButton;
              const free = sl.free.slice(0, maxFree);
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={sel}
                  aria-label={`${sl.label}, ${sl.free.length} of ${state.crew} free`}
                  disabled={locked}
                  onClick={() => dispatch({ t: "slot", i })}
                  style={{
                    position: "relative", flex: "none", width: sw, height: 44, padding: 0, border: "none", borderRadius: 8, background: fill,
                    color: sel ? c.link : c.text, font: "inherit", cursor: "pointer", textAlign: "left", overflow: "hidden",
                  }}
                >
                  <span style={{ position: "absolute", left: 10, top: 5, right: 6, fontSize: 13, lineHeight: "18px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sl.label}</span>
                  {free.map((f, j) => (
                    <span key={j} style={{ position: "absolute", left: 8 + 13 * j, top: 26, width: 12, height: 12, borderRadius: "50%", boxShadow: `0 0 0 1.5px ${fill}`, display: "flex" }}>
                      <Avatar user={byName(f)} size={12} />
                    </span>
                  ))}
                  <span style={{ position: "absolute", right: 8, top: 25, fontSize: 11, lineHeight: "14px" }}>{`${sl.free.length}/${state.crew}`}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ position: "relative", height: 58, marginTop: 6 }}>
          <div style={{ position: "absolute", left: 4, top: 0, right: 4, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {`Lifters ${lifting(state)} of ${state.need} · tap yours to lift`}
          </div>
          {shownMembers.map((m, i) => {
            const on = state.lifters.includes(m.id);
            const face = (
              <span style={{ position: "relative", display: "flex", width: 24, height: 24, borderRadius: "50%", boxShadow: `0 0 0 2px ${on ? c.primary : c.card}` }}>
                <Avatar user={m} size={24} />
                {on ? (
                  <span style={{ position: "absolute", left: 16, top: -8, width: 12, height: 12, borderRadius: "50%", background: c.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check color={c.onPrimary} />
                  </span>
                ) : null}
              </span>
            );
            if (m.id !== me)
              return (
                <span key={m.id} style={{ position: "absolute", left: faceX(i) - 12, top: 24 }}>
                  {face}
                </span>
              );
            return (
              <button
                key={`${m.id}-${lifts ? 1 : 0}`}
                type="button"
                class="m-hit"
                aria-label={lifts ? "Stop lifting" : "I'll lift"}
                aria-pressed={lifts}
                disabled={locked}
                onClick={() => { haptic("light"); dispatch({ t: "lift" }); }}
                ref={(el: HTMLElement | null) => el?.animate?.([{ transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 300, easing: "cubic-bezier(.34,1.56,.64,1)" })}
                style={{ position: "absolute", left: faceX(i) - 18, top: 18, width: 36, height: 36, padding: 0, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                {face}
              </button>
            );
          })}
          {extra > 0 ? (
            <span style={{ position: "absolute", left: faceX(shownMembers.length) - 12, top: 24 }}>
              <More n={extra} />
            </span>
          ) : null}
          {helpers.map((n, j) => (
            <span key={`h${n}`} style={{ position: "absolute", left: faceX(shownMembers.length + j) - 12, top: 24 }}>
              <span style={{ position: "relative", display: "flex", width: 24, height: 24, borderRadius: "50%", boxShadow: `0 0 0 2px ${c.primary}` }}>
                <Avatar user={byName(n)} size={24} />
                <span style={{ position: "absolute", left: 16, top: -8, width: 12, height: 12, borderRadius: "50%", background: c.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Check color={c.onPrimary} />
                </span>
              </span>
            </span>
          ))}
          <div style={{ position: "absolute", right: 0, top: 20, width: ctrlW, height: 36, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            {locked ? (
              <div style={{ width: 140, flex: "none", textAlign: "right", lineHeight: "18px" }}>
                <div style={{ fontSize: driveFit.size, fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{driveFit.text}</div>
                <div style={{ fontSize: homeFit.size, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{homeFit.text}</div>
              </div>
            ) : ok ? (
              <Button kind="primary" wide onClick={() => { haptic("success"); dispatch({ t: "lock" }); }}>
                Lock run
              </Button>
            ) : (
              <div style={{ width: "100%", height: 36, boxSizing: "border-box", padding: "0 6px", borderRadius: 8, background: c.secondaryButton, color: mix(c.secondaryText, c.text, 0.3), fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {needLine(state)}
              </div>
            )}
          </div>
        </div>

        {locked ? (
          <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{`Locked by ${person(state.lockedBy).name}`}</span>
            <Button kind="deemphasized" onClick={() => dispatch({ t: "reopen" })}>
              Reopen
            </Button>
          </div>
        ) : null}
        {toastMs !== null ? (
          <>
            <Toast key={`t${confirmed.lockedAt}`}>Run locked</Toast>
            <Burst key={`b${confirmed.lockedAt}`} emoji="❤️" />
          </>
        ) : null}
      </div>
    );
  },
});
