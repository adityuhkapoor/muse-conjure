import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  fitText,
  haptic,
  mix,
  pal,
  running,
  textWidth,
  tween,
  type Child,
  type Ctx,
  type Member,
  type Theme,
} from "@muse/app";

// Friends' plans this weekend: a Fri-Sat-Sun strip with a drawn icon per plan friends locked, and a
// card per plan with who is going and how many spots are left. Ask to join and a paper plane flies to
// the host, their reply pops up, your face slides into the row and your weekend lights up.

type Icon = "taco" | "hike" | "picnic";
type Params = {
  /** Under the title: "This weekend" */
  sub: string;
  /** Exactly three days: Fri, Sat, Sun with their dates. */
  days: { day: string; date: string }[];
  /** 1 to 3 plans, one per day (day 0 to 2). cap 0 means no cap; the host counts as going. */
  plans: { day: number; title: string; meta: string; icon: Icon; host: string; going: string[]; cap: number; seat: "spot" | "seat"; reply: string }[];
};

// @params
const P: Params = {
  sub: "This weekend",
  days: [{ day: "Fri", date: "14" }, { day: "Sat", date: "15" }, { day: "Sun", date: "16" }],
  plans: [
    { day: 0, title: "Taco crawl, the Mission", meta: "8 PM · 4 stops · Maya's plan", icon: "taco", host: "Maya",
      going: ["Leo", "Ava", "Kai"], cap: 6, seat: "spot", reply: "yesss come hungry" },
    { day: 1, title: "Mt Tam sunrise hike", meta: "5:30 AM · Jordan driving", icon: "hike", host: "Jordan",
      going: ["Priya", "Sam"], cap: 4, seat: "seat", reply: "last seat is yours!" },
    { day: 2, title: "Dolores Park picnic", meta: "1 PM · bring a snack · Zoe's plan", icon: "picnic", host: "Zoe",
      going: ["Nico", "Dev", "Omar", "Jess", "Max", "Mia"], cap: 0, seat: "spot", reply: "bring chips pls" },
  ],
};
// @end params

type Plan = {
  id: string;
  day: number;
  title: string;
  meta: string;
  icon: Icon;
  /** The host's display name (always counted as going). */
  host: string;
  /** The host's member id when the host is in the chat. */
  hostId: string | null;
  /** Names going who are not in the chat, host excluded. */
  others: string[];
  /** Chat members going, in order; at 0 means seeded. */
  joined: { user: string; at: number }[];
  /** 0 = no cap, else 2 to 20 going including the host. */
  cap: number;
  seat: "spot" | "seat";
  reply: string;
};
type State = { sub: string; days: { day: string; date: string }[]; plans: Plan[] };
type Action = { t: "ask"; plan: string } | { t: "drop"; plan: string } | { t: "start"; day: number; title: string };
type Local = { leaving: string; draft: string; day: number };

const ICONS: Icon[] = ["taco", "hike", "picnic"];
const going = (p: Plan) => 1 + p.others.length + p.joined.length;
const left = (p: Plan) => (p.cap === 0 ? Infinity : p.cap - going(p));
const isIn = (p: Plan, u: string) => p.joined.some((j) => j.user === u);

const PLANE_MS = 700;
const BUBBLE_AT = 1100;
const IN_AT = 1600;
const ALL_MS = 3900;
const flight = tween({ duration: PLANE_MS, easing: "easeInOut" });
const grow = tween({ duration: 300, easing: [0.34, 1.56, 0.64, 1] });
const slide = tween({ duration: 450, easing: [0.34, 1.56, 0.64, 1] });
const popFace = tween({ duration: 400, easing: [0.34, 1.56, 0.64, 1] });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const isMember = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const match = (ctx: Ctx, name: string): Member | undefined => {
  const k = name.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === name || m.id.toLowerCase() === k || m.name.trim().toLowerCase() === k) : undefined;
};

function initState(ctx: Ctx): State {
  const fallback = ["Fri", "Sat", "Sun"];
  const given = Array.isArray(P.days) ? P.days : [];
  const days = [0, 1, 2].map((i) => ({ day: clean(given[i]?.day, 3) || fallback[i]!, date: clean(given[i]?.date, 2) }));
  const plans: Plan[] = [];
  for (const raw of Array.isArray(P.plans) ? P.plans : []) {
    const day = raw?.day;
    if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 2 || plans.some((p) => p.day === day)) continue;
    const title = clean(raw.title, 40);
    const host = clean(raw.host, 20);
    if (!title || !host) continue;
    const hostMember = match(ctx, host);
    const plan: Plan = {
      id: `p${day}`,
      day,
      title,
      meta: clean(raw.meta, 48),
      icon: ICONS.includes(raw.icon) ? raw.icon : ICONS[day]!,
      host,
      hostId: hostMember?.id ?? null,
      others: [],
      joined: [],
      cap: 0,
      seat: raw.seat === "seat" ? "seat" : "spot",
      reply: clean(raw.reply, 32),
    };
    for (const n of (Array.isArray(raw.going) ? raw.going : []).slice(0, 30)) {
      const name = clean(n, 20);
      if (!name || name.toLowerCase() === host.toLowerCase()) continue;
      const m = match(ctx, name);
      if (m) {
        if (m.id === plan.hostId || isIn(plan, m.id)) continue;
        plan.joined.push({ user: m.id, at: 0 });
      } else if (!plan.others.includes(name)) plan.others.push(name);
    }
    plan.cap = Number.isInteger(raw.cap) && raw.cap > 0 ? Math.min(20, Math.max(2, raw.cap, going(plan))) : 0;
    if (plan.cap > 0 && plan.cap < going(plan)) plan.cap = Math.min(20, going(plan));
    plans.push(plan);
    if (plans.length >= 3) break;
  }
  plans.sort((a, b) => a.day - b.day);
  return { sub: clean(P.sub, 30), days, plans };
}

const iconFor = (title: string): Icon => (/taco|food|dinner|brunch|pizza|eat/i.test(title) ? "taco" : /hike|run|climb|beach|trail|sunrise/i.test(title) ? "hike" : "picnic");
const mapPlan = (s: State, id: string, fn: (p: Plan) => Plan): State => ({ ...s, plans: s.plans.map((p) => (p.id === id ? fn(p) : p)) });
const sameDetails = (a: Plan, b: Plan) =>
  a.title === b.title && a.meta === b.meta && a.icon === b.icon && a.host === b.host && JSON.stringify(a.others) === JSON.stringify(b.others) && a.cap === b.cap && a.seat === b.seat && a.reply === b.reply;

// ---- Drawn pieces ------------------------------------------------------------------------------

function PlanIcon(a: { icon: Icon; theme: Theme }): Child {
  const p = pal(a.theme);
  if (a.icon === "taco") {
    const shell = Array.from({ length: 13 }, (_, i) => {
      const t = (i / 12) * Math.PI;
      return `${(Math.cos(t) * 10).toFixed(2)},${(Math.sin(t) * 9 - 1).toFixed(2)}`;
    }).join(" ");
    return (
      <g>
        <circle cx={-5} cy={-1} r={3.2} fill={p.green} />
        <circle cx={0} cy={-2} r={3.2} fill={p.red} />
        <circle cx={5} cy={-1} r={3} fill={p.green} />
        <polygon points={shell} fill={p.yellow} stroke={mix(p.yellow, p.ink, 0.4)} stroke-width={1.5} stroke-linejoin="round" />
      </g>
    );
  }
  if (a.icon === "hike")
    return (
      <g>
        <polygon points="-10,7 -2,-7 6,7" fill={p.brown} />
        <polygon points="0,7 5,-2 10,7" fill={mix(p.brown, p.ink, 0.3)} />
        <polygon points="-4.5,-2.5 -2,-7 0.5,-2.5" fill={p.paper} />
      </g>
    );
  return (
    <g>
      <rect x={-10} y={-4} width={20} height={12} rx={2} fill={p.paper} />
      {[0, 1, 2, 3].flatMap((k) =>
        [0, 1].map((j) => ((k + j) % 2 === 0 ? <rect key={`${k}${j}`} x={-10 + 5 * k} y={-4 + 6 * j} width={5} height={6} fill={p.leaf} /> : null)),
      )}
      <circle cx={5} cy={-7} r={3.5} fill={p.red} />
      <line x1={5} y1={-10.5} x2={6.5} y2={-12} stroke={p.leaf} stroke-width={1.2} stroke-linecap="round" />
    </g>
  );
}

function Star(a: { cx: number; cy: number; r: number; fill: string }): Child {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? a.r : a.r * 0.42;
    const t = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(a.cx + r * Math.cos(t)).toFixed(2)},${(a.cy + r * Math.sin(t)).toFixed(2)}`;
  }).join(" ");
  return <polygon points={pts} fill={a.fill} />;
}

const ring = (card: string) => ({ boxShadow: `0 0 0 1.5px ${card}`, borderRadius: "50%", display: "inline-flex", flex: "none" as const });
const stranger = (name: string): Member => ({ id: `o:${name}`, name });

/** Faces on a card: host first, then the others, then chat members who joined. */
function faceList(p: Plan, members: readonly Member[]): { m: Member; host: boolean }[] {
  const host = members.find((m) => m.id === p.hostId) ?? stranger(p.host);
  const out = [{ m: host, host: true }];
  for (const n of p.others) out.push({ m: stranger(n), host: false });
  for (const j of p.joined) {
    const m = members.find((x) => x.id === j.user);
    if (m) out.push({ m, host: false });
  }
  return out;
}

export default defineApp<State, Action, Local>({
  name: "Friends' plans",
  summary: (s) => {
    if (!s.plans.length) return "No plans from friends this weekend";
    const joined = s.plans.reduce((n, p) => n + p.joined.length, 0);
    return `${s.plans.length} ${s.plans.length === 1 ? "plan" : "plans"} this weekend · ${joined} joined`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    const u = meta.user;
    if (!isMember(ctx, u)) return state;
    if (action.t === "ask") {
      const plan = typeof action.plan === "string" ? state.plans.find((p) => p.id === action.plan) : undefined;
      if (!plan || plan.hostId === u || isIn(plan, u) || left(plan) <= 0) return state;
      return mapPlan(state, plan.id, (p) => ({ ...p, joined: [...p.joined, { user: u, at: meta.time }] }));
    }
    if (action.t === "drop") {
      const plan = typeof action.plan === "string" ? state.plans.find((p) => p.id === action.plan) : undefined;
      if (!plan || !isIn(plan, u)) return state;
      return mapPlan(state, plan.id, (p) => ({ ...p, joined: p.joined.filter((j) => j.user !== u) }));
    }
    if (action.t === "start") {
      const day = action.day;
      const title = typeof action.title === "string" ? action.title.trim() : "";
      if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 2 || state.plans.some((p) => p.day === day) || state.plans.length >= 3) return state;
      if (title.length < 1 || title.length > 40) return state;
      const me = ctx.members.find((m) => m.id === u);
      const plan: Plan = { id: `s${meta.seq}`, day, title, meta: "", icon: iconFor(title), host: me?.name ?? u, hostId: u, others: [], joined: [], cap: 0, seat: "spot", reply: "see you there" };
      return { ...state, plans: [...state.plans, plan].sort((a, b) => a.day - b.day) };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const fine = state.plans.every((p) => p.joined.every((j) => isMember(ctx, j.user)) && (p.hostId === null || isMember(ctx, p.hostId)));
    if (fine) return state;
    return {
      ...state,
      plans: state.plans.map((p) => ({ ...p, joined: p.joined.filter((j) => isMember(ctx, j.user)), hostId: p.hostId !== null && !isMember(ctx, p.hostId) ? null : p.hostId })),
    };
  },

  invariants: {
    "at most 3 plans, one per day, in day order": (s) =>
      s.plans.length <= 3 &&
      s.days.length === 3 &&
      s.plans.every((p, i) => Number.isInteger(p.day) && p.day >= 0 && p.day <= 2 && (i === 0 || p.day > s.plans[i - 1]!.day)) &&
      new Set(s.plans.map((p) => p.id)).size === s.plans.length,
    "joined people are in the chat, once, and never the host": (s, ctx) =>
      s.plans.every((p) => new Set(p.joined.map((j) => j.user)).size === p.joined.length && p.joined.every((j) => isMember(ctx, j.user) && j.user !== p.hostId)),
    "plans never overfill": (s) => s.plans.every((p) => (p.cap === 0 || (p.cap >= 2 && p.cap <= 20)) && (p.cap === 0 || going(p) <= p.cap)),
    "a host in the chat is a member": (s, ctx) => s.plans.every((p) => p.hostId === null || isMember(ctx, p.hostId)),
    "join times are real": (s) => s.plans.every((p) => p.joined.every((j) => Number.isInteger(j.at) && j.at >= 0)),
  },

  transitions: {
    "asking adds only the asker, at the end, when there was room": (p, n, a, m) => {
      if (a.t !== "ask" || p === n) return true;
      const before = p.plans.find((x) => x.id === a.plan);
      const after = n.plans.find((x) => x.id === a.plan);
      if (!before || !after) return false;
      const room = (before.cap === 0 ? 1 : before.cap - (1 + before.others.length + before.joined.length)) > 0;
      const mine = JSON.stringify(after.joined) === JSON.stringify([...before.joined, { user: m.user, at: m.time }]);
      const others = p.plans.every((x) => x.id === a.plan || JSON.stringify(x) === JSON.stringify(n.plans.find((y) => y.id === x.id)));
      return room && !before.joined.some((j) => j.user === m.user) && before.hostId !== m.user && mine && others && n.plans.length === p.plans.length;
    },
    "dropping removes only the dropper": (p, n, a, m) => {
      if (a.t !== "drop" || p === n) return true;
      const before = p.plans.find((x) => x.id === a.plan);
      const after = n.plans.find((x) => x.id === a.plan);
      if (!before || !after) return false;
      return (
        before.joined.some((j) => j.user === m.user) &&
        JSON.stringify(after.joined) === JSON.stringify(before.joined.filter((j) => j.user !== m.user)) &&
        p.plans.every((x) => x.id === a.plan || JSON.stringify(x) === JSON.stringify(n.plans.find((y) => y.id === x.id)))
      );
    },
    "starting adds one plan the starter hosts on a free day": (p, n, a, m) => {
      if (a.t !== "start" || p === n) return true;
      const added = n.plans.find((x) => x.id === `s${m.seq}`);
      return n.plans.length === p.plans.length + 1 && !!added && added.day === a.day && added.hostId === m.user && added.joined.length === 0 && !p.plans.some((x) => x.day === a.day);
    },
    "plans keep their details": (p, n) => p.plans.every((x) => { const y = n.plans.find((z) => z.id === x.id); return !!y && sameDetails(x, y); }),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || isMember(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (!s.plans.length || k >= 0.85) return { t: "start", day: r.int(3), title: r.pick(["Taco night", "Beach run", "Board games"]) };
    if (k < 0.6) return { t: "ask", plan: r.pick(s.plans).id };
    return { t: "drop", plan: r.pick(s.plans).id };
  },

  local: { leaving: "", draft: "", day: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const n = state.plans.length;
    const dayPlan = [0, 1, 2].map((d) => state.plans.find((x) => x.day === d) ?? null);
    const mine = dayPlan.map((x) => (x && isIn(x, me) ? x : null));
    const mineCount = mine.filter(Boolean).length;
    const tints = [c.series1, c.series2, c.series3];
    const nodeX = (i: number) => 40 + ((W - 80) * i) / 2;

    // Timing of my latest join, shared by the strip and its card.
    const sinceOf = (x: Plan | null): number | null => {
      const j = x?.joined.find((y) => y.user === me);
      return j && j.at > 0 ? running(j.at, ALL_MS) : null;
    };

    const weekend =
      mineCount === 0 ? "Your weekend: wide open" : mineCount === n && n > 0 && n === 3 ? "Your weekend: fully booked" : `Your weekend: ${mineCount} of ${n} ${n === 1 ? "plan" : "plans"}`;
    const weekendLabel = `Your weekend: ${state.days.map((d, i) => (dayPlan[i] ? `${d.day} ${dayPlan[i]!.icon}` : `${d.day} free`)).join(", ")}`;
    const mePerson = members.find((m) => m.id === me);

    const strip = (
      <div style={{ position: "relative", width: W, height: 66 }}>
        <svg width={W} height={66} viewBox={`0 0 ${W} 66`} role="img" aria-label={weekendLabel} style={{ display: "block" }}>
          <line x1={40} y1={30} x2={W - 40} y2={30} stroke={mix(c.secondaryText, c.card, 0.75)} stroke-width={3} stroke-linecap="round" />
          {[0, 1].map((i) =>
            mine[i] && mine[i + 1] ? <line key={i} x1={nodeX(i)} y1={30} x2={nodeX(i + 1)} y2={30} stroke={c.primary} stroke-width={3} opacity={0.6} /> : null,
          )}
          {state.days.map((d, i) => {
            const x = nodeX(i);
            const plan = dayPlan[i] ?? null;
            const e = sinceOf(plan);
            const k = e === null ? 1 : Math.min(1, Math.max(0, (e - IN_AT) / 500));
            const halo = mine[i] ? (e === null ? 18 : 18 + 4 * (1 - k) * Math.sin(k * Math.PI)) : 0;
            return (
              <g key={i}>
                <text x={x} y={12} text-anchor="middle" font-size={11} fill={c.secondaryText} style={{ textTransform: "uppercase" }}>
                  {d.day}
                </text>
                {plan ? (
                  <>
                    {mine[i] ? <circle cx={x} cy={30} r={halo} fill={c.primary} opacity={0.18} /> : null}
                    <circle cx={x} cy={30} r={15} fill={mix(c.card, tints[ICONS.indexOf(plan.icon)]!, 0.25)} stroke={mine[i] ? c.primary : mix(c.text, c.card, 0.85)} stroke-width={mine[i] ? 1.5 : 1} />
                    <g transform={`translate(${x} 30)`}>
                      <PlanIcon icon={plan.icon} theme={theme} />
                    </g>
                    {mine[i] ? <circle cx={x + 12} cy={40} r={8} fill={c.card} /> : null}
                  </>
                ) : (
                  <circle cx={x} cy={30} r={15} fill="none" stroke={c.divider} stroke-width={1.5} stroke-dasharray="3 3" />
                )}
              </g>
            );
          })}
          <text x={W / 2} y={61} text-anchor="middle" font-size={13} fill={mineCount ? (theme.mode === "dark" ? mix(c.primary, c.text, 0.45) : c.primary) : c.secondaryText}>
            {weekend}
          </text>
        </svg>
        {mePerson
          ? dayPlan.map((plan, i) => {
              if (!plan || !mine[i]) return null;
              const e = sinceOf(plan);
              const k = e === null ? 1 : popFace(Math.max(0, e - IN_AT));
              return (
                <span key={i} style={{ position: "absolute", left: nodeX(i) + 12 - 6.5, top: 40 - 6.5, width: 13, height: 13, display: "block", transform: `scale(${Math.max(0, k)})`, pointerEvents: "none" }}>
                  <Avatar user={mePerson} size={13} />
                </span>
              );
            })
          : null}
      </div>
    );

    const narrow = W < 340;
    const maxFaces = narrow ? 2 : W < 360 ? 3 : 5;

    const card = (x: Plan) => {
      const list = faceList(x, members);
      const total = going(x);
      const inIt = isIn(x, me);
      const hosting = x.hostId === me;
      const room = left(x);
      const e = sinceOf(x);
      const reqd = e !== null && e < IN_AT;
      const day = state.days[x.day] ?? { day: "", date: "" };

      // Faces: up to maxFaces, always me when I am in.
      let shown = list.slice(0, maxFaces);
      if (inIt && !shown.some((f) => f.m.id === me)) {
        const mm = list.find((f) => f.m.id === me);
        if (mm) shown = [...list.slice(0, maxFaces - 1), mm];
      }
      const extra = total - shown.length;
      const status =
        (extra > 0 && !narrow ? `+${extra} · ` : "") +
        (x.cap === 0 ? `${total} going` : room > 0 ? `${room} ${x.seat}${room === 1 ? "" : "s"} left` : "Full") +
        (hosting ? " · your plan" : "");

      const meter = x.cap >= 1 && x.cap <= 8;
      const meterW = meter ? x.cap * 9 - 3 : 0;
      const mySeat = inIt ? 1 + x.others.length + x.joined.findIndex((j) => j.user === me) : -1;
      const titleRight = meter ? W - 24 - meterW : W - 14;
      const metaText = x.meta || (hosting ? "Your plan" : `${x.host}'s plan`);
      const replyOn = e !== null && e >= BUBBLE_AT;
      const replyText = `${x.host}: ${x.reply}`;
      const availBubble = W - 64 - 14;
      const target = Math.min(availBubble, 15 + 6 + textWidth(replyText, 13, 400) + 14);
      const bw = replyOn ? Math.min(availBubble, Math.max(0.05 * target, target * (0.05 + 0.95 * grow(e! - BUBBLE_AT)))) : 0;
      const hostMember = list[0]!.m;

      // Paper plane: button centre to the host's face along a quadratic bezier.
      let plane: Child = null;
      if (e !== null && e < PLANE_MS) {
        const A = { x: W - 12 - 56, y: 68 };
        const B = { x: 68 + 10, y: 68 };
        const C = { x: (A.x + B.x) / 2, y: -4 };
        const t = flight(e);
        const px = (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * C.x + t * t * B.x;
        const py = (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * C.y + t * t * B.y;
        const dx = 2 * (1 - t) * (C.x - A.x) + 2 * t * (B.x - C.x);
        const dy = 2 * (1 - t) * (C.y - A.y) + 2 * t * (B.y - C.y);
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        const s = 8;
        plane = (
          <svg width={30} height={30} viewBox="-15 -15 30 30" aria-hidden="true" style={{ position: "absolute", left: px - 15, top: py - 15, pointerEvents: "none", transform: `rotate(${ang}deg)` }}>
            <polygon points={`${s},0 ${-s},${-0.7 * s} ${-0.4 * s},0`} fill={c.primary} />
            <polygon points={`${s},0 ${-0.4 * s},0 ${-0.7 * s},${0.7 * s}`} fill={mix(c.primary, c.text, 0.2)} />
          </svg>
        );
      }

      let action: Child;
      if (hosting || (!inIt && room <= 0)) action = null;
      else if (!inIt)
        action = (
          <Button
            kind="primary"
            wide
            onClick={() => {
              haptic("light");
              dispatch({ t: "ask", plan: x.id });
            }}
          >
            Join
          </Button>
        );
      else if (reqd)
        action = (
          <Button kind="secondary" wide>
            Requested…
          </Button>
        );
      else if (local.leaving === x.id)
        action = (
          <Button
            kind="deemphasized"
            wide
            onClick={() => {
              dispatch({ t: "drop", plan: x.id });
              setLocal({ leaving: "" });
            }}
          >
            Leave
          </Button>
        );
      else
        action = (
          <Button kind="secondary" wide onClick={() => setLocal({ leaving: x.id })}>
            <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke={c.primary} stroke-width={2} stroke-linecap="round" stroke-linejoin="round" style={{ marginRight: 6 }}>
              <path d="M1 5.5 4 8.5 9 1.5" />
            </svg>
            You're in
          </Button>
        );

      return (
        <div key={x.id} style={{ position: "relative", height: 90, boxSizing: "border-box", background: c.wash, border: `1px solid ${c.divider}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 11, top: 9, width: 44, height: 50, boxSizing: "border-box", background: c.card, border: `1px solid ${c.divider}`, borderRadius: 8 }}>
            {day.date ? (
              <>
                <div style={{ position: "absolute", left: 0, right: 0, top: 4, textAlign: "center", fontSize: 12, fontWeight: 600, lineHeight: "16px", color: c.negative, textTransform: "uppercase" }}>{day.day}</div>
                <div style={{ position: "absolute", left: 0, right: 0, top: 21, textAlign: "center", fontSize: 20, fontWeight: 700, lineHeight: "24px", color: c.text }}>{day.date}</div>
              </>
            ) : (
              <div style={{ position: "absolute", left: 0, right: 0, top: 15, textAlign: "center", fontSize: 15, fontWeight: 700, lineHeight: "18px", color: c.text, textTransform: "uppercase" }}>{day.day}</div>
            )}
          </div>
          <div style={{ position: "absolute", left: 67, top: 9, width: titleRight - 68, fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.title}</div>
          {meter ? (
            <div style={{ position: "absolute", left: W - 14 - meterW - 2, top: 14, width: meterW, height: 8 }} aria-hidden="true">
              {Array.from({ length: x.cap }, (_, i) => (
                <span key={i} style={{ position: "absolute", left: i * 9, top: 0, width: 6, height: 8, borderRadius: 2, background: i === mySeat ? c.primary : i < total ? mix(c.text, c.card, 0.55) : mix(c.text, c.card, 0.88) }} />
              ))}
            </div>
          ) : null}
          {replyOn ? (
            <div style={{ position: "absolute", left: 63, top: 28, height: 21, width: bw, borderRadius: 10.5, background: c.secondaryButton, display: "flex", alignItems: "center", gap: 6, padding: "0 0 0 3px", boxSizing: "border-box", overflow: "hidden" }}>
              <span style={{ display: "inline-flex", flex: "none" }}>
                <Avatar user={hostMember} size={15} />
              </span>
              <span style={{ fontSize: 13, lineHeight: "18px", color: c.text, whiteSpace: "nowrap" }}>{replyText}</span>
            </div>
          ) : (
            <div style={{ position: "absolute", left: 67, top: 29, right: 14, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{metaText}</div>
          )}
          <div style={{ position: "absolute", left: 67, right: 12, top: 49, height: 36, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ position: "relative", flex: "none", width: 20 + 15 * (shown.length - 1) + 2, height: 20 }}>
              {shown.map((f, i) => {
                const mineFace = f.m.id === me && inIt;
                const k = mineFace && e !== null ? slide(Math.max(0, e - IN_AT)) : 1;
                const before = mineFace && e !== null && e < IN_AT;
                return (
                  <span
                    key={f.m.id}
                    style={{
                      position: "absolute",
                      left: i * 15,
                      top: 0,
                      ...ring(c.card),
                      transform: before ? "scale(0)" : `translateX(${30 * (1 - k)}px) scale(${Math.max(0, k)})`,
                    }}
                  >
                    <Avatar user={f.m} size={20} />
                    {f.host ? (
                      <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" style={{ position: "absolute", left: 11, top: -4, overflow: "visible" }}>
                        <circle cx={5} cy={5} r={4} fill={c.series2} />
                        <Star cx={5} cy={5} r={3} fill={c.card} />
                      </svg>
                    ) : null}
                  </span>
                );
              })}
            </div>
            <span style={{ flex: 1, minWidth: 0, fontSize: narrow ? 12 : 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{status}</span>
            {action ? <div style={{ flex: "none", width: narrow ? 100 : 112 }}>{action}</div> : null}
          </div>
          {plane}
          {e !== null && e >= IN_AT ? (
            <div style={{ position: "absolute", left: W - 12 - 56, top: 60, pointerEvents: "none" }}>
              <Burst key={x.joined.find((j) => j.user === me)?.at ?? 0} emoji="❤️" />
            </div>
          ) : null}
        </div>
      );
    };

    const draftOk = local.draft.trim().length >= 1 && local.draft.trim().length <= 40;
    const empty = (
      <div style={{ border: `1.5px dashed ${c.divider}`, borderRadius: 12, padding: 12, display: "grid", gap: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text }}>No plans from friends yet</div>
        <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>Post one and friends can ask to join</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, minWidth: 0 }}>
          {state.days.map((d, i) => (
            <div key={i} style={{ flex: "none" }}>
              <Button kind={local.day === i ? "secondary" : "deemphasized"} onClick={() => setLocal({ day: i })}>
                {d.day}
              </Button>
            </div>
          ))}
          <input
            placeholder="Taco night at 8"
            aria-label="What is the plan"
            value={local.draft}
            maxLength={40}
            onInput={(e) => setLocal({ draft: e.currentTarget.value })}
            style={{ flex: 1, minWidth: 0 }}
          />
          <div style={{ flex: "none" }}>
            <Button
              kind="primary"
              onClick={() => {
                haptic("light");
                dispatch({ t: "start", day: local.day, title: draftOk ? local.draft.trim() : "Taco night" });
                setLocal({ draft: "" });
              }}
            >
              Post
            </Button>
          </div>
        </div>
      </div>
    );

    return (
      <div>
        <CardHeader title={n ? `Your friends locked ${n} ${n === 1 ? "plan" : "plans"}` : "No plans from friends yet"} subtitle={state.sub} />
        {strip}
        <div style={{ display: "grid", gap: 6, marginTop: 0 }}>{n ? state.plans.map(card) : empty}</div>
      </div>
    );
  },
});
