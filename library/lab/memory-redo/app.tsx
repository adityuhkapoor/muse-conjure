import {
  defineApp,
  Avatar,
  Burst,
  Button,
  More,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  textWidth,
  tween,
  userColor,
  type Child,
  type Ctx,
  type Member,
} from "@muse/app";

// "1 year ago today": a trip memory develops like a polaroid in the story, friends comment, and
// one tap flips the photo into a re-plan. The crew votes on a weekend; when everyone has voted
// (or a majority leads and someone locks it) the plan locks with a countdown.

type Params = {
  /** Where the trip was: "Nashville" */
  place: string;
  /** When it was: "Nov 12, 2025" */
  date: string;
  /** Words on the wall in the photo: "What lifts you" */
  mural: string;
  /** Who shared the memory: "Priya" */
  sharedBy: string;
  /** 1 to 4 names in the photo; the first is the big face in the middle. */
  crew: string[];
  /** Up to 2 comments under the photo: { who, text } */
  comments: { who: string; text: string }[];
  /** Flights then and now, in cents: { was: 14000, now: 16200 } */
  price: { was: number; now: number };
  /** Right side of the price strip: "Airbnb still open" */
  note: string;
  /** 2 to 4 weekends to redo it: { dates, why, days until it } */
  weekends: { dates: string; why: string; days: number }[];
  /** Who is on the Airbnb: "Priya" */
  booker: string;
  /** Votes already in the chat: { name, weekend index } */
  votes: { name: string; wk: number }[];
};

// @params
const P: Params = {
  place: "Nashville", date: "Nov 12, 2025", mural: "What lifts you", sharedBy: "Priya", crew: ["Priya", "Sam", "Ana", "Maya"],
  comments: [ { who: "Sam", text: "we HAVE to" }, { who: "Ana", text: "still my pfp tbh" } ],
  price: { was: 14000, now: 16200 }, note: "Airbnb still open",
  weekends: [ { dates: "Mar 12-15", why: "spring break", days: 120 }, { dates: "Apr 9-12", why: "after midterms", days: 148 },
              { dates: "Apr 23-26", why: "dead week (bold)", days: 162 } ],
  booker: "Priya",
  votes: [ { name: "Priya", wk: 1 }, { name: "Sam", wk: 1 }, { name: "Ana", wk: 0 } ],
};
// @end params

type Weekend = { dates: string; why: string; days: number };
/** user: a member id, or "~Name" for a crew stand-in who is not in this chat. */
type Vote = { user: string; wk: number; at: number };
type State = {
  place: string;
  date: string;
  mural: string;
  sharedBy: string;
  crew: string[];
  comments: { who: string; text: string }[];
  price: { was: number; now: number };
  note: string;
  weekends: Weekend[];
  booker: string;
  flippedAt: number;
  votes: Vote[];
  lockedAt: number;
  winner: number;
  going: string[];
};
type Action = { t: "again" } | { t: "vote"; wk: number } | { t: "lock" } | { t: "in" };

const FLIP_MS = 600;
const POP_MS = 350;
const flip = tween({ duration: FLIP_MS, easing: "easeInOut" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const cents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(10_000_000, Math.round(v))) : 0);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const dollars = (c: number) => `$${Math.round(c / 100)}`;
const standIn = (u: string) => u.startsWith("~");

const tally = (s: State, k: number) => s.votes.filter((v) => v.wk === k).length;
function leader(s: State): number {
  let best = 0;
  let top = -1;
  for (let k = 0; k < s.weekends.length; k++) {
    const t = tally(s, k);
    if (t > top) {
      top = t;
      best = k;
    }
  }
  return best;
}
const count = (s: State, ctx: Ctx) => ctx.members.length + s.votes.filter((v) => standIn(v.user)).length;
const everyone = (s: State, ctx: Ctx) => ctx.members.length > 0 && ctx.members.every((m) => s.votes.some((v) => v.user === m.id));
const majority = (s: State, ctx: Ctx) => tally(s, leader(s)) * 2 > count(s, ctx);
const lockedOn = (s: State, ctx: Ctx, at: number): State => {
  const w = leader(s);
  return { ...s, lockedAt: at, winner: w, going: s.votes.filter((v) => v.wk === w).map((v) => v.user) };
};

const DEFAULT_WEEKENDS: Weekend[] = [
  { dates: "This month", why: "soon", days: 30 },
  { dates: "Next month", why: "later", days: 60 },
];

function initState(ctx: Ctx): State {
  const crew = P.crew.map((n) => clean(n, 12)).filter(Boolean).slice(0, 4);
  const names = crew.length ? crew : ctx.members.length ? ctx.members.slice(0, 4).map((m) => clean(m.name, 12) || "You") : ["You"];
  const weekends: Weekend[] = [];
  for (const w of P.weekends) {
    if (weekends.length >= 4) break;
    const dates = clean(w.dates, 12);
    if (!dates) continue;
    const days = typeof w.days === "number" && Number.isFinite(w.days) ? Math.max(0, Math.min(999, Math.round(w.days))) : 0;
    weekends.push({ dates, why: clean(w.why, 20), days });
  }
  const wk = weekends.length >= 2 ? weekends : DEFAULT_WEEKENDS;
  const votes: Vote[] = [];
  for (const v of P.votes) {
    if (typeof v.name !== "string" || !Number.isInteger(v.wk) || v.wk < 0 || v.wk >= wk.length) continue;
    const member = ctx.members.find((m) => m.id === v.name || same(m.name, v.name));
    const stand = names.find((n) => same(n, v.name));
    const user = member ? member.id : stand ? `~${stand}` : "";
    if (!user || votes.some((x) => x.user === user)) continue;
    votes.push({ user, wk: v.wk, at: 0 });
  }
  return {
    place: clean(P.place, 20) || "Nashville",
    date: clean(P.date, 20),
    mural: clean(P.mural, 20),
    sharedBy: clean(P.sharedBy, 12),
    crew: names,
    comments: P.comments
      .slice(0, 2)
      .map((c) => ({ who: clean(c.who, 12), text: clean(c.text, 24) }))
      .filter((c) => c.who && c.text),
    price: { was: cents(P.price.was), now: cents(P.price.now) },
    note: clean(P.note, 24),
    weekends: wk.map((w) => ({ ...w })),
    booker: clean(P.booker, 12),
    flippedAt: 0,
    votes,
    lockedAt: 0,
    winner: -1,
    going: [],
  };
}

const sameDeep = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const frozenPart = (s: State) => [s.place, s.date, s.crew, s.comments, s.price, s.weekends];

// ---- the picture ----

type Pal = ReturnType<typeof pal>;
const f1 = (n: number) => Math.round(n * 10) / 10;

/** A head and shoulders, drawn from `c` (head center) and `r` (head radius). i picks the look. */
function bust(i: number, cx: number, cy: number, r: number, p: Pal, face: "grin" | "smile" | "smug") {
  const skin = [mix(p.brown, p.cream, 0.35), mix(p.cream, p.brown, 0.1), mix(p.cream, p.brown, 0.4), mix(p.cream, p.brown, 0.25)][i % 4]!;
  const hair = [p.dark, p.brown, mix(p.brown, p.dark, 0.5), mix(p.brown, p.dark, 0.6)][i % 4]!;
  const shirt = [p.yellow, p.blue, p.purple, mix(p.dark, p.blue, 0.1)][i % 4]!;
  const style = (["long", "cap", "bun", "swoop"] as const)[i % 4]!;
  const capColor = mix(p.green, p.blue, 0.3);
  const cap = (R: number, close: number) => {
    const a0 = Math.PI - 0.122;
    const a1 = 2 * Math.PI + 0.122;
    const oy = cy - 0.04 * r;
    return (
      `M${f1(cx + R * Math.cos(a0))} ${f1(oy + R * Math.sin(a0))} A${f1(R)} ${f1(R)} 0 1 1 ${f1(cx + R * Math.cos(a1))} ${f1(oy + R * Math.sin(a1))} ` +
      `L${f1(cx + 0.98 * r)} ${f1(cy + close * r)} L${f1(cx - 0.98 * r)} ${f1(cy + close * r)} Z`
    );
  };
  const er = Math.max(0.11 * r, 1.2);
  const sw = Math.max(0.08 * r, 1);
  const my = 0.45 * r;
  const out: Child[] = [];
  if (style === "long") out.push(<rect key="lh" x={f1(cx - 1.08 * r)} y={f1(cy - 0.4 * r)} width={f1(2.16 * r)} height={f1(1.55 * r)} rx={f1(0.5 * r)} fill={hair} />);
  if (style === "bun") out.push(<circle key="bun" cx={cx} cy={f1(cy - 1.05 * r)} r={f1(0.42 * r)} fill={hair} />);
  out.push(<rect key="sh" x={f1(cx - 1.35 * r)} y={f1(cy + 1.75 * r - 0.8 * r)} width={f1(2.7 * r)} height={f1(1.6 * r)} rx={f1(0.8 * r)} fill={shirt} />);
  out.push(<rect key="nk" x={f1(cx - 0.25 * r)} y={f1(cy + 0.95 * r - 0.25 * r)} width={f1(0.5 * r)} height={f1(0.5 * r)} fill={skin} />);
  out.push(<circle key="e1" cx={f1(cx - 0.95 * r)} cy={f1(cy + 0.08 * r)} r={f1(0.2 * r)} fill={skin} />);
  out.push(<circle key="e2" cx={f1(cx + 0.95 * r)} cy={f1(cy + 0.08 * r)} r={f1(0.2 * r)} fill={skin} />);
  out.push(<circle key="face" cx={cx} cy={cy} r={r} fill={skin} />);
  if (style === "cap") {
    out.push(<path key="hat" d={cap(1.13 * r, -0.3)} fill={capColor} />);
    out.push(<rect key="brim" x={f1(cx - 0.2 * r)} y={f1(cy - 0.42 * r)} width={f1(1.5 * r)} height={f1(0.26 * r)} rx={f1(0.13 * r)} fill={mix(capColor, p.dark, 0.25)} />);
    out.push(<circle key="btn" cx={cx} cy={f1(cy - 1.02 * r)} r={f1(0.1 * r)} fill={mix(capColor, p.dark, 0.25)} />);
  } else {
    out.push(<path key="hair" d={cap(1.06 * r, style === "swoop" ? -0.38 : -0.32)} fill={hair} />);
    if (style === "swoop") out.push(<path key="sw" d={`M${f1(cx - 0.9 * r)} ${f1(cy - 0.55 * r)} L${f1(cx + 0.6 * r)} ${f1(cy - 1.25 * r)} L${f1(cx + 0.3 * r)} ${f1(cy - 0.2 * r)} Z`} fill={hair} />);
  }
  if (face === "smug") {
    out.push(<path key="eyes" d={`M${f1(cx - 0.36 * r - 1.3 * er)} ${f1(cy + 0.08 * r)} h${f1(2.6 * er)} M${f1(cx + 0.36 * r - 1.3 * er)} ${f1(cy + 0.08 * r)} h${f1(2.6 * er)}`} fill="none" stroke={p.dark} stroke-width={f1(er)} stroke-linecap="round" />);
  } else {
    out.push(<circle key="ey1" cx={f1(cx - 0.36 * r)} cy={f1(cy + 0.08 * r)} r={f1(er)} fill={p.dark} />);
    out.push(<circle key="ey2" cx={f1(cx + 0.36 * r)} cy={f1(cy + 0.08 * r)} r={f1(er)} fill={p.dark} />);
  }
  out.push(<circle key="ch1" cx={f1(cx - 0.58 * r)} cy={f1(cy + 0.38 * r)} r={f1(0.16 * r)} fill={p.red} opacity={0.35} />);
  out.push(<circle key="ch2" cx={f1(cx + 0.58 * r)} cy={f1(cy + 0.38 * r)} r={f1(0.16 * r)} fill={p.red} opacity={0.35} />);
  if (face === "smile") {
    const ay = cy + my - 0.18 * r;
    const R = 0.3 * r;
    out.push(<path key="mo" d={`M${f1(cx + R * Math.cos(0.45))} ${f1(ay + R * Math.sin(0.45))} A${f1(R)} ${f1(R)} 0 0 1 ${f1(cx + R * Math.cos(Math.PI - 0.45))} ${f1(ay + R * Math.sin(Math.PI - 0.45))}`} fill="none" stroke={p.dark} stroke-width={f1(sw)} stroke-linecap="round" />);
  } else if (face === "grin") {
    const R = 0.36 * r;
    const ay = cy + my - 0.1 * r;
    out.push(<path key="mo" d={`M${f1(cx - R)} ${f1(ay)} A${f1(R)} ${f1(R)} 0 0 0 ${f1(cx + R)} ${f1(ay)} Z`} fill={mix(p.red, p.dark, 0.6)} />);
    out.push(<rect key="teeth" x={f1(cx - 0.26 * r)} y={f1(ay)} width={f1(0.52 * r)} height={f1(0.1 * r)} fill={p.paper} />);
  } else {
    out.push(<path key="mo" d={`M${f1(cx - 0.25 * r)} ${f1(cy + my)} L${f1(cx + 0.1 * r)} ${f1(cy + my)} L${f1(cx + 0.3 * r)} ${f1(cy + my - 0.12 * r)}`} fill="none" stroke={p.dark} stroke-width={f1(sw)} stroke-linecap="round" stroke-linejoin="round" />);
  }
  return out;
}

const WING_FILL = (p: Pal) => [mix(p.blue, p.paper, 0.45), mix(p.red, p.paper, 0.4), p.yellow, mix(p.green, p.paper, 0.3), mix(p.purple, p.paper, 0.4)];

/** The photo: brick wall, a mural with rainbow wings, the crew in front. */
function scene(s: State, p: Pal, mural: string) {
  const wings: Child[] = [];
  const fills = WING_FILL(p);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const len = 92 - 10 * k;
      const y = 74 + 21 * k;
      const bx = 146 + side * 24;
      const tx = 146 + side * (24 + len);
      wings.push(<path key={`w${side}${k}`} d={`M${bx} ${y - 10} L${tx} ${y - 18 + 4 * k} L${bx} ${y + 12} Z`} fill={fills[k]!} stroke={p.dark} stroke-width={1.5} stroke-linejoin="round" />);
    }
  }
  let hz = "";
  let vt = "";
  for (let r = 0; r < 21; r++) {
    hz += `M0 ${14 * r}H292`;
    for (let x = r % 2 ? 14 : 0; x < 292; x += 28) vt += `M${x} ${14 * r}v14`;
  }
  const mortar = mix(p.orange, p.brown, 0.7);
  const crew = s.crew;
  const heads = [
    { r: 22, x: 146, y: 130, face: "grin" as const, cls: "mr-bob" },
    { r: 20, x: 50, y: 240, face: "smile" as const, cls: "mr-hop" },
    { r: 22, x: 242, y: 240, face: "grin" as const, cls: "mr-hop2" },
    { r: 20, x: 186, y: 240, face: "smug" as const, cls: "mr-hop3" },
  ];
  const fm = fitText(mural, 236, { size: 14, weight: 600 });
  return (
    <svg viewBox="0 0 292 286" preserveAspectRatio="xMidYMid slice" class="mr-dev" role="img" aria-label={`${s.place} photo: ${crew.join(", ")} at the ${mural || "wall"} mural`} style={{ display: "block", width: "100%", height: "100%", color: p.dark }}>
      <rect x={0} y={0} width={292} height={286} fill={mix(p.orange, p.brown, 0.35)} />
      <path d={hz} stroke={mortar} stroke-width={1} fill="none" />
      <path d={vt} stroke={mortar} stroke-width={1} fill="none" />
      <rect x={13} y={28} width={266} height={168} rx={6} fill={mix(p.cream, p.paper, 0.6)} />
      {mural ? (
        <text x={146} y={45} text-anchor="middle" font-size={fm.size} font-weight={600} fill={p.dark}>
          {fm.text}
        </text>
      ) : null}
      {wings}
      {crew.slice(0, 4).map((_, i) => (
        <g key={`c${i}`} class={heads[i]!.cls}>
          {i === 3 ? (
            <g>
              <circle cx={102} cy={212} r={6} fill={mix(p.cream, p.brown, 0.25)} />
              <path d="M102 212 L98 200 M102 212 L105 200" stroke={mix(p.cream, p.brown, 0.25)} stroke-width={3} stroke-linecap="round" />
            </g>
          ) : null}
          {bust(i, heads[i]!.x, heads[i]!.y, heads[i]!.r, p, heads[i]!.face)}
        </g>
      ))}
      <rect x={0} y={272} width={292} height={14} fill={mix(p.soft, p.brown, 0.2)} />
    </svg>
  );
}

const CSS =
  "@keyframes mrDevelop{from{filter:brightness(.1) sepia(.4)}to{filter:brightness(1) sepia(0)}}" +
  "@keyframes mrPop{from{transform:scale(.2);opacity:0}to{transform:scale(1);opacity:1}}" +
  "@keyframes mrBub{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}" +
  "@keyframes mrBob{0%,100%{transform:translateY(-2px)}50%{transform:translateY(2px)}}" +
  "@keyframes mrHop{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}" +
  "@keyframes mrSpin{to{transform:rotate(-360deg)}}" +
  ".mr-bob{animation:mrBob 3.1s ease-in-out infinite}" +
  ".mr-hop{animation:mrHop 1.3s ease-in-out infinite}" +
  ".mr-hop2{animation:mrHop 1.3s ease-in-out infinite .4s}" +
  ".mr-hop3{animation:mrHop 1.3s ease-in-out infinite .8s}" +
  ".mr-min{animation:mrSpin 5.2s linear infinite}" +
  ".mr-dev{animation:mrDevelop 3.2s ease-in-out both}" +
  ".mr-b1{animation:mrBub .35s cubic-bezier(.34,1.56,.64,1) 1.2s backwards}" +
  ".mr-b2{animation:mrBub .35s cubic-bezier(.34,1.56,.64,1) 2.3s backwards}" +
  ".mr-face{animation:mrPop .35s cubic-bezier(.34,1.56,.64,1) both}" +
  "@media (prefers-reduced-motion:reduce){.mr-bob,.mr-hop,.mr-hop2,.mr-hop3,.mr-min,.mr-dev,.mr-b1,.mr-b2,.mr-face{animation:none}}";

const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();
const memberNamed = (members: readonly Member[], name: string) => members.find((m) => same(m.name, name));

export default defineApp<State, Action>({
  name: "Memory redo",
  summary: (s, ctx) => {
    if (s.flippedAt === 0) return `1 year ago today: ${s.place} · ${s.comments.length} comments`;
    const w = s.weekends;
    if (s.lockedAt > 0) return `${s.place}, again: ${w[s.winner]?.dates ?? ""} locked · ${s.going.length} going`;
    return `${s.place}, again: ${s.votes.length} of ${count(s, ctx)} voted, ${w[leader(s)]?.dates ?? ""} leads`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "again") {
      if (state.flippedAt > 0) return state;
      return { ...state, flippedAt: meta.time };
    }
    if (action.t === "vote") {
      const wk = action.wk;
      if (state.flippedAt === 0 || state.lockedAt > 0 || !Number.isInteger(wk) || wk < 0 || wk >= state.weekends.length) return state;
      if (state.votes.some((v) => v.user === meta.user && v.wk === wk)) return state;
      const mine = state.votes.some((v) => v.user === meta.user);
      const vote: Vote = { user: meta.user, wk, at: meta.time };
      const next: State = { ...state, votes: mine ? state.votes.map((v) => (v.user === meta.user ? vote : v)) : [...state.votes, vote] };
      return everyone(next, ctx) ? lockedOn(next, ctx, meta.time) : next;
    }
    if (action.t === "lock") {
      if (state.flippedAt === 0 || state.lockedAt > 0) return state;
      if (!state.votes.some((v) => v.user === meta.user)) return state;
      if (!majority(state, ctx)) return state;
      return lockedOn(state, ctx, meta.time);
    }
    if (action.t === "in") {
      if (state.lockedAt === 0) return state;
      const going = state.going.includes(meta.user) ? state.going.filter((u) => u !== meta.user) : [...state.going, meta.user];
      return { ...state, going };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const swapped = new Map<string, string>();
    const votes: Vote[] = [];
    for (const v of state.votes) {
      const m = standIn(v.user) ? memberNamed(ctx.members, v.user.slice(1)) : undefined;
      if (m) swapped.set(v.user, m.id);
      const user = m ? m.id : v.user;
      if ((standIn(user) || inChat(ctx, user)) && !votes.some((x) => x.user === user)) votes.push({ ...v, user });
    }
    const going: string[] = [];
    for (const u of state.going) {
      const id = swapped.get(u) ?? u;
      if ((standIn(id) || inChat(ctx, id)) && !going.includes(id)) going.push(id);
    }
    if (sameDeep(votes, state.votes) && sameDeep(going, state.going)) return state;
    return { ...state, votes, going };
  },

  invariants: {
    "one vote per voter, on a real weekend": (s, ctx) =>
      new Set(s.votes.map((v) => v.user)).size === s.votes.length &&
      s.votes.every(
        (v) =>
          Number.isInteger(v.wk) &&
          v.wk >= 0 &&
          v.wk < s.weekends.length &&
          (standIn(v.user) ? s.crew.includes(v.user.slice(1)) : ctx.members.some((m) => m.id === v.user)),
      ),
    "a stand-in is not in the chat": (s, ctx) => s.votes.every((v) => !standIn(v.user) || !ctx.members.some((m) => same(m.name, v.user.slice(1)))),
    "votes come after the flip": (s) => s.flippedAt > 0 || s.votes.every((v) => v.at === 0),
    "a lock names a winner": (s) =>
      (s.lockedAt === 0) === (s.winner === -1) &&
      (s.lockedAt === 0 || (s.flippedAt > 0 && Number.isInteger(s.winner) && s.winner >= 0 && s.winner < s.weekends.length)),
    "going only after the lock, once each": (s, ctx) =>
      (s.lockedAt > 0 || s.going.length === 0) && new Set(s.going).size === s.going.length && s.going.every((u) => standIn(u) || ctx.members.some((m) => m.id === u)),
    "the memory is whole": (s) =>
      s.weekends.length >= 2 &&
      s.weekends.length <= 4 &&
      s.crew.length >= 1 &&
      s.crew.length <= 4 &&
      Number.isInteger(s.price.was) &&
      Number.isInteger(s.price.now) &&
      s.price.was >= 0 &&
      s.price.now >= 0,
  },

  transitions: {
    "voting the same weekend again does nothing": (p, n, a, m) => a.t !== "vote" || p === n || !p.votes.some((v) => v.user === m.user && v.wk === a.wk),
    "the photo flips once": (p, n, a, m) => (a.t !== "again" || p === n || (p.flippedAt === 0 && n.flippedAt === m.time)) && (p.flippedAt === 0 || n.flippedAt === p.flippedAt),
    "a vote moves only the voter": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const mine = n.votes.find((v) => v.user === m.user);
      if (!mine || mine.wk !== a.wk || mine.at !== m.time) return false;
      return sameDeep(p.votes.filter((v) => v.user !== m.user), n.votes.filter((v) => v.user !== m.user));
    },
    "no votes before the flip or after the lock": (p, n, a) => a.t !== "vote" || p === n || (p.flippedAt > 0 && p.lockedAt === 0),
    "the last vote locks it": (p, n, a, m, ctx) => {
      if (a.t !== "vote" || p === n) return true;
      const all = ctx.members.length > 0 && ctx.members.every((x) => n.votes.some((v) => v.user === x.id));
      return all ? n.lockedAt === m.time : n.lockedAt === 0;
    },
    "a lock picks the leader": (p, n, a, m) => {
      if (n.lockedAt === p.lockedAt) return true;
      if (p.lockedAt !== 0 || n.lockedAt !== m.time) return false;
      const after = a.t === "vote" ? { ...p, votes: [...p.votes.filter((v) => v.user !== m.user), { user: m.user, wk: a.wk, at: m.time }] } : p;
      const counts = p.weekends.map((_, k) => after.votes.filter((v) => v.wk === k).length);
      const top = Math.max(...counts);
      return n.winner === counts.indexOf(top) && after.votes.filter((v) => v.wk === n.winner).every((v) => n.going.includes(v.user));
    },
    "lock needs a majority or everyone": (p, n, a, m, ctx) => {
      if (a.t !== "lock" || p === n) return true;
      if (!p.votes.some((v) => v.user === m.user)) return false;
      const counts = p.weekends.map((_, k) => p.votes.filter((v) => v.wk === k).length);
      return Math.max(...counts) * 2 > ctx.members.length + p.votes.filter((v) => v.user.startsWith("~")).length;
    },
    "in toggles only the sender": (p, n, a, m) => {
      if (a.t !== "in" || p === n) return true;
      return p.going.includes(m.user) !== n.going.includes(m.user) && sameDeep(p.going.filter((u) => u !== m.user), n.going.filter((u) => u !== m.user));
    },
    "the memory never changes": (p, n) => sameDeep(frozenPart(p), frozenPart(n)),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => {
    if (s.flippedAt === 0) return r.next() < 0.9 ? { t: "again" } : { t: "vote", wk: 0 };
    if (s.lockedAt > 0) return r.next() < 0.9 ? { t: "in" } : { t: "vote", wk: 0 };
    return r.next() < 0.7 ? { t: "vote", wk: r.int(s.weekends.length) } : { t: "lock" };
  },

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const cw = Math.min(320, W - 24);
    const top = mix(p.red, p.dark, 0.35);
    const bot = mix(p.red, p.dark, 0.8);
    const ctx: Ctx = { room: "", members: [...members] };
    const n = count(state, ctx);
    const flipped = confirmed.flippedAt > 0;
    const k = flipped ? (running(confirmed.flippedAt, FLIP_MS) ?? FLIP_MS) / FLIP_MS : 0;
    const e = flip(k * FLIP_MS);
    const flipping = flipped && k < 1;
    const showBack = flipped && e >= 0.5;
    const sn = Math.sin(Math.PI * e);
    const sx = flipping ? Math.max(0.02, Math.abs(Math.cos(Math.PI * e))) : 1;
    const locked = state.lockedAt > 0;
    const w = state.weekends;
    const lead = leader(state);
    const myVote = state.votes.find((v) => v.user === me);
    const here = members.some((m) => m.id === me);
    const myName = members.find((m) => m.id === me)?.name ?? "";
    const going = state.going;
    const mineGoing = going.includes(me);
    const lockedAge = locked ? running(confirmed.lockedAt, 2400) : null;

    // who is on the poster line: me last, as "you"
    const others = state.crew.filter((x) => !same(x, myName));
    const crewNames = myName && state.crew.some((x) => same(x, myName)) ? [...others, "you"] : state.crew;
    const crewLine = crewNames.length > 1 ? `${crewNames.slice(0, -1).join(", ")} and ${crewNames[crewNames.length - 1]}` : (crewNames[0] ?? "");

    const face = (u: string, size: number, key: string, at: number, ring: string) => {
      const m = standIn(u) ? undefined : members.find((x) => x.id === u);
      const nm = standIn(u) ? u.slice(1) : (m?.name ?? u);
      const pop = at > 0 && running(at, POP_MS) !== null;
      return (
        <span key={key} {...(pop ? { class: "mr-face" } : {})} style={{ display: "inline-flex", flex: "none", padding: 1.5, borderRadius: "50%", background: ring, marginLeft: -10 }}>
          {m ? (
            <Avatar user={m} size={size} />
          ) : (
            <span class="m-av" title={nm} aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.45), background: userColor(nm, theme) }}>
              {initial(nm)}
            </span>
          )}
        </span>
      );
    };

    const header = (
      <div style={{ position: "absolute", left: 0, right: 0, top: 10, height: 40 }}>
        <svg viewBox="0 0 30 30" width={30} height={30} aria-hidden="true" style={{ position: "absolute", left: 15, top: 5 }}>
          <circle cx={15} cy={15} r={15} fill={p.on} opacity={0.95} />
          <circle cx={15} cy={15} r={9} fill="none" stroke={p.dark} stroke-width={2} />
          <g transform="translate(15 15)">
            <line x1={0} y1={0} x2={0} y2={-5.4} stroke={p.dark} stroke-width={2} stroke-linecap="round" />
            <g class="mr-min">
              <line x1={0} y1={0} x2={0} y2={-6.3} stroke={p.dark} stroke-width={1.5} stroke-linecap="round" />
            </g>
          </g>
        </svg>
        <div style={{ position: "absolute", left: 52, top: 1, right: 12, fontSize: 15, lineHeight: "20px", color: p.on, whiteSpace: "nowrap" }}>Memories</div>
        <div style={{ position: "absolute", left: 52, top: 21, right: 12, fontSize: 13, lineHeight: "18px", color: p.on, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {`1 year ago today · shared by ${state.sharedBy || "a friend"}`}
        </div>
      </div>
    );

    const caption = fitText(`${state.place}${state.date ? ` · ${state.date}` : ""}`, cw - 28, { size: 15, weight: 600, min: 12 });
    const front = (
      <div style={{ position: "relative", width: cw, height: 372 }}>
        <div style={{ position: "absolute", left: 2, top: 8, right: -2, bottom: -8, background: p.dark, opacity: 0.35 }} />
        <div style={{ position: "absolute", inset: 0, background: p.paper }}>
          <div style={{ position: "absolute", left: 14, top: 14, width: cw - 28, height: 286, overflow: "hidden" }}>
            {scene(state, p, state.mural)}
          </div>
          <div style={{ position: "absolute", left: 14, right: 14, top: 312, height: 24, textAlign: "center", fontSize: caption.size, fontWeight: 600, lineHeight: "24px", color: p.dark, whiteSpace: "nowrap" }}>{caption.text}</div>
          <div style={{ position: "absolute", left: 14, right: 14, top: 336, height: 20, textAlign: "center", fontSize: 13, lineHeight: "20px", color: mix(p.dark, p.paper, 0.15), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{crewLine}</div>
        </div>
      </div>
    );

    // the re-plan side
    const rowH = w.length >= 4 ? 46 : 54;
    const pitch = rowH + 8;
    const title = fitText(`${state.place}, again`, cw - 32, { size: 30, weight: 700, min: 20 });
    const stripLeft = `flights ~${dollars(state.price.now)} (was ${dollars(state.price.was)})`;
    const stripInner = cw - 32 - 20;
    const stripSize = [13, 12, 11].find((sz) => textWidth(stripLeft, sz, 400) + textWidth(state.note, sz, 400) + 12 <= stripInner) ?? 11;
    const positiveInk = mix(c.positive, c.text, 0.3);
    const voted = state.votes.length;
    const back = (
      <div style={{ position: "relative", width: cw, height: 372 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 8, bottom: -8, background: p.dark, opacity: 0.35, borderRadius: 12 }} />
        <div style={{ position: "absolute", inset: 0, background: c.card, borderRadius: 12 }}>
          <div style={{ position: "absolute", left: 16, top: 12, fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>The redo</div>
          <div style={{ position: "absolute", left: 16, right: 16, top: 30, fontSize: title.size, fontWeight: 700, lineHeight: "40px", color: c.text, whiteSpace: "nowrap" }}>{title.text}</div>
          <div style={{ position: "absolute", left: 16, right: 16, top: 80, height: 30, borderRadius: 8, background: c.wash, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", fontSize: stripSize, whiteSpace: "nowrap" }}>
            <span style={{ color: c.text }}>{stripLeft}</span>
            <span style={{ color: positiveInk }}>{state.note}</span>
          </div>
          {w.map((wk, i) => {
            const t = tally(state, i);
            const mine = myVote?.wk === i;
            const win = locked && state.winner === i;
            const fill = win ? mix(c.card, c.positive, 0.18) : mine ? mix(c.card, c.primary, 0.1) : c.card;
            const edge = win ? c.positive : mine ? c.primary : c.divider;
            const voters = state.votes.filter((v) => v.wk === i);
            const shown = voters.slice(0, 4);
            const extra = voters.length - shown.length;
            const rowW = cw - 32;
            return (
              <button
                key={i}
                type="button"
                aria-label={`${wk.dates}, ${wk.why}, ${t} votes`}
                disabled={!here || locked || flipping}
                onClick={() => {
                  if (!here || locked || mine) return;
                  if (n > 0 && voted + (myVote ? 0 : 1) >= n) haptic("success");
                  dispatch({ t: "vote", wk: i });
                }}
                style={{ position: "absolute", left: 16, top: 118 + pitch * i, width: rowW, height: rowH, padding: 0, borderRadius: 12, border: `1px solid ${edge}`, background: fill, color: c.text, textAlign: "left", cursor: "pointer", transition: "background-color .35s, border-color .35s", overflow: "hidden" }}
              >
                <span style={{ position: "absolute", left: 12, top: rowH === 54 ? 5 : 3, fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text, whiteSpace: "nowrap" }}>{wk.dates}</span>
                <span style={{ position: "absolute", left: 12, top: rowH === 54 ? 24 : 21, right: 120, fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wk.why}</span>
                <span style={{ position: "absolute", left: 12, right: 12, top: rowH - 9, height: 4, borderRadius: 2, background: c.track, overflow: "hidden" }}>
                  <span style={{ display: "block", height: 4, width: `${n > 0 ? Math.min(100, (t / n) * 100) : 0}%`, background: win ? c.positive : c.primary, transition: "width .35s" }} />
                </span>
                <span style={{ position: "absolute", right: 44, top: Math.round((rowH - 10) / 2 - 14), display: "flex", alignItems: "center", paddingLeft: 10 }}>
                  {shown.map((v) => face(v.user, 24, v.user, v.at, fill))}
                  {extra > 0 ? (
                    <span style={{ marginLeft: 4 }}>
                      <More n={extra} size={24} />
                    </span>
                  ) : null}
                </span>
                <span style={{ position: "absolute", right: 10, top: Math.round((rowH - 10) / 2 - 11), width: 28, textAlign: "right", fontSize: 16, fontWeight: 700, lineHeight: "22px", color: win ? positiveInk : c.secondaryText }}>{t}</span>
              </button>
            );
          })}
          <div style={{ position: "absolute", left: 16, right: 16, top: 372 - 26 - 11, height: 22, textAlign: "center", fontSize: locked ? 15 : 13, fontWeight: locked ? 600 : 400, lineHeight: "22px", color: locked ? positiveInk : c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {locked ? `Locked · ${w[state.winner]?.dates ?? ""} · ${going.length} going` : myVote ? `${voted} of ${n} voted` : "Tap a weekend to vote"}
          </div>
        </div>
      </div>
    );

    const bubbleMax = Math.max(60, Math.min(150, W / 2 - 4 - 16 - 30));
    const bubbles = state.comments.map((cm, i) => {
      const m = memberNamed(members, cm.who);
      const fit = fitText(cm.text, bubbleMax - 20, { size: 13, min: 10 });
      return (
        <div key={i} class={i === 0 ? "mr-b1" : "mr-b2"} style={{ position: "absolute", left: i === 0 ? 16 : W / 2 + 4, top: 4, height: 30, display: "flex", alignItems: "center", gap: 4 }}>
          {m ? (
            <Avatar user={m} size={22} />
          ) : (
            <span class="m-av" aria-hidden="true" style={{ width: 22, height: 22, fontSize: 10, background: userColor(cm.who, theme) }}>
              {initial(cm.who)}
            </span>
          )}
          <span style={{ height: 30, padding: "0 10px", borderRadius: 15, background: p.paper, color: p.dark, fontSize: fit.size, lineHeight: "30px", whiteSpace: "nowrap" }}>{fit.text}</span>
        </div>
      );
    });

    const days = w[state.winner]?.days ?? 0;
    const showLock = !locked && flipped && !flipping && !!myVote && majority(state, ctx);

    return (
      <div>
        <style>{CSS}</style>
        <div style={{ position: "relative", height: 556, borderRadius: 12, overflow: "hidden", backgroundColor: bot, backgroundImage: `linear-gradient(180deg, ${top}, ${bot})`, color: p.on }}>
          {header}
          <div style={{ position: "absolute", left: (W - cw) / 2, top: 66, width: cw, height: 372, transform: flipping ? `translateY(${f1(-sn * 16)}px) scale(${f1(sx * 1000) / 1000}, ${1 + 0.04 * sn})` : undefined, pointerEvents: flipping ? "none" : "auto" }}>
            <div style={{ transform: !flipped ? "rotate(-2deg)" : undefined, width: cw, height: 372 }}>{showBack ? back : front}</div>
          </div>

          <div style={{ position: "absolute", left: 0, right: 0, top: 444, height: 40 }}>
            {!flipped ? (
              bubbles
            ) : !locked ? (
              <div style={{ textAlign: "center", fontSize: 14, lineHeight: "40px", color: p.on }}>It locks when everyone votes</div>
            ) : null}
          </div>

          <div style={{ position: "absolute", left: 16, right: 16, top: 498, height: 44 }}>
            {!flipped ? (
              <Button kind="primary" wide onClick={() => dispatch({ t: "again" })}>
                Do it again
              </Button>
            ) : locked ? (
              <div style={{ height: 44, borderRadius: 8, background: mix(bot, p.dark, 0.5), display: "flex", alignItems: "center", gap: 8, padding: "0 4px 0 14px" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: p.on }}>{`${days} days to go · ${state.booker || "Someone"}'s on the Airbnb`}</span>
                {here ? (
                  <Button kind="secondary" onClick={() => dispatch({ t: "in" })}>
                    {mineGoing ? "I'm out" : "I'm in"}
                  </Button>
                ) : null}
              </div>
            ) : showLock ? (
              <Button kind="primary" wide onClick={() => dispatch({ t: "lock" })}>
                Lock it
              </Button>
            ) : null}
          </div>
          {locked && lockedAge !== null ? (
            <div style={{ position: "absolute", left: "50%", top: 200, zIndex: 3, pointerEvents: "none" }}>
              <Burst key={state.lockedAt} emoji="❤️" />
            </div>
          ) : null}
        </div>
        {locked && lockedAge !== null ? <Toast key={state.lockedAt}>It's a plan</Toast> : null}
      </div>
    );
  },
});
