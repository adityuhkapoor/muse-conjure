import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Locked,
  Thumb,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  rng,
  running,
  tween,
  userColor,
  type Ctx,
  type Member,
  type Meta,
  type Theme,
  type ThumbKind,
} from "@muse/app";

// Reel roulette: every "we should do this" reel the chat saved runs as a film strip through a little
// projector. Spin and the strip whirs, slows and stops one frame in the gate; that frame is thrown up
// on the screen. Don't like it? Spending your one veto stamps it and spins again. Lock it and it is
// Saturday's plan.

type Params = {
  /** Card title */
  title: string;
  /** The group chat's name */
  chat: string;
  /** How many reels were saved in total, and since when: 23, "September" */
  saved: number;
  since: string;
  /** The day the landed reel becomes the plan for: "Saturday" */
  day: string;
  /** Vetoes each person gets */
  vetoes: number;
  /** 3 to 10 reels on the strip. kind picks the drawing; mins is how far away. */
  reels: { title: string; where: string; mins: number; by: string; kind: ThumbKind }[];
  /** Spins that already happened, oldest first: who spun, which reel (index), and a veto if it got one. */
  history: { by: string; reel: number; vetoBy?: string; note?: string }[];
};

// @params
const P: Params = {
  title: "Saturday reel roulette",
  chat: "the six",
  saved: 23,
  since: "September",
  day: "Saturday",
  vetoes: 1,
  reels: [
    { title: "The dumpling place in Millbrook", where: "Millbrook", mins: 25, by: "Tsai Lin", kind: "ramen" },
    { title: "Axe throwing at Split Oak", where: "Split Oak", mins: 15, by: "Will", kind: "venue" },
    { title: "Sunrise on Miller Hill", where: "Miller Hill", mins: 10, by: "Maya", kind: "park" },
    { title: "Rice cooker cheesecake", where: "412 Pine", mins: 0, by: "Arun", kind: "cake" },
    { title: "Midnight bowling", where: "Midtown Lanes", mins: 8, by: "Calvin", kind: "venue" },
    { title: "Boba flight", where: "Midtown", mins: 12, by: "Aditya", kind: "boba" },
    { title: "Kayaks on Lake Wren", where: "Lake Wren", mins: 20, by: "Will", kind: "park" },
    { title: "Five-dollar thrift fits", where: "Second Chapter", mins: 6, by: "Tsai Lin", kind: "storefront" },
  ],
  history: [{ by: "Will", reel: 1, vetoBy: "Calvin", note: "my arms are for orgo" }],
};
// @end params

type Reel = { title: string; where: string; mins: number; by: string; kind: ThumbKind };
type Spin = { by: string; reel: number; at: number; veto: { by: string; note: string } | null };
type State = {
  title: string;
  chat: string;
  saved: number;
  since: string;
  day: string;
  limit: number;
  reels: Reel[];
  spins: Spin[];
  plan: { reel: number; by: string; at: number; going: string[] } | null;
};
type Action = { t: "spin" } | { t: "veto" } | { t: "lock" } | { t: "in" };
type Local = { toast: number };

const KINDS: ThumbKind[] = ["pizza", "burger", "ramen", "sushi", "taco", "salad", "pasta", "cake", "icecream", "coffee", "boba", "cocktail", "bread", "curry", "donut", "storefront", "house", "venue", "park", "campus", "couch", "ticket", "car", "gift", "suitcase", "book"];
const FW = 66; // frame pitch on the strip
const SPIN_MS = 2600;
const EASE = tween({ duration: SPIN_MS, easing: [0.12, 0.7, 0.2, 1] });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idFor = (ctx: Ctx, name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? name;
const last = (s: State) => s.spins[s.spins.length - 1] ?? null;
const vetoesUsed = (s: State, u: string) => s.spins.filter((x) => x.veto?.by === u).length;
const banned = (s: State) => new Set(s.spins.filter((x) => x.veto).map((x) => x.reel));
/** The reel a spin lands on: any reel nobody vetoed yet, picked by the server's seed. */
function pick(s: State, seed: number): number {
  const out = banned(s);
  const ok = s.reels.map((_, i) => i).filter((i) => !out.has(i));
  const pool = ok.length ? ok : s.reels.map((_, i) => i);
  return pool[rng(seed).int(pool.length)] ?? 0;
}
const canSpin = (s: State) => !s.plan && s.reels.length > 0 && (s.spins.length === 0 || !!last(s)!.veto);

function initState(ctx: Ctx): State {
  const reels: Reel[] = [];
  for (const r of Array.isArray(P.reels) ? P.reels : []) {
    const title = clean(r?.title, 44);
    if (!title || reels.length >= 10) continue;
    const mins = Number.isInteger(r.mins) && r.mins >= 0 && r.mins <= 600 ? r.mins : 0;
    reels.push({ title, where: clean(r.where, 24), mins, by: clean(r.by, 20), kind: KINDS.includes(r.kind) ? r.kind : "storefront" });
  }
  const spins: Spin[] = [];
  for (const h of Array.isArray(P.history) ? P.history : []) {
    if (!Number.isInteger(h?.reel) || h.reel < 0 || h.reel >= reels.length) continue;
    const prev = spins[spins.length - 1];
    if (prev && !prev.veto) break; // only the latest spin may still stand
    const vb = clean(h.vetoBy, 20);
    spins.push({ by: idFor(ctx, clean(h.by, 20) || "Someone"), reel: h.reel, at: 0, veto: vb ? { by: idFor(ctx, vb), note: clean(h.note, 48) } : null });
  }
  const limit = Number.isInteger(P.vetoes) && P.vetoes >= 0 && P.vetoes <= 3 ? P.vetoes : 1;
  return {
    title: clean(P.title, 40) || "Reel roulette",
    chat: clean(P.chat, 24),
    saved: Number.isInteger(P.saved) && P.saved >= reels.length ? P.saved : reels.length,
    since: clean(P.since, 20),
    day: clean(P.day, 16) || "Saturday",
    limit,
    reels,
    spins,
    plan: null,
  };
}

function reduceIt(s: State, a: Action, m: Meta, ctx: Ctx): State {
  if (!inChat(ctx, m.user)) return s;
  const at = Math.max(1, m.time);
  if (a.t === "spin") {
    if (!canSpin(s)) return s;
    return { ...s, spins: [...s.spins, { by: m.user, reel: pick(s, m.seed), at, veto: null }] };
  }
  if (a.t === "veto") {
    const l = last(s);
    if (s.plan || !l || l.veto || vetoesUsed(s, m.user) >= s.limit) return s;
    const spins = [...s.spins.slice(0, -1), { ...l, veto: { by: m.user, note: "" } }];
    const vetoed = { ...s, spins };
    return { ...vetoed, spins: [...spins, { by: m.user, reel: pick(vetoed, m.seed), at, veto: null }] };
  }
  if (a.t === "lock") {
    const l = last(s);
    if (s.plan || !l || l.veto) return s;
    return { ...s, plan: { reel: l.reel, by: m.user, at, going: [m.user] } };
  }
  if (a.t === "in") {
    if (!s.plan) return s;
    const g = s.plan.going;
    return { ...s, plan: { ...s.plan, going: g.includes(m.user) ? g.filter((u) => u !== m.user) : [...g, m.user] } };
  }
  return s;
}

function Face({ id, members, size, theme }: { id: string; members: Member[]; size: number; theme: Theme }) {
  const m = members.find((x) => x.id === id || x.name.toLowerCase() === id.toLowerCase());
  if (m) return <Avatar user={m} size={size} />;
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: "50%", background: userColor(id || "?", theme), color: theme.color.onPrimary, fontSize: Math.round(size * 0.5), fontWeight: 600 }}>
      {(id.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** The projector: two spoked reels, a body with a lens, and the beam up to the screen. */
function Projector({ W, spinT, theme, lit }: { W: number; spinT: number; theme: Theme; lit: boolean }) {
  const c = theme.color;
  const p = pal(theme);
  const cx = W / 2;
  const body = theme.mode === "dark" ? mix(c.text, c.card, 0.62) : mix(p.dark, c.card, 0.15);
  const reel = (x: number, k: number) => (
    <g transform={`translate(${x} 214) rotate(${(spinT * 360 * k) % 360})`}>
      <circle cx={0} cy={0} r={30} fill={body} />
      <circle cx={0} cy={0} r={24} fill={mix(body, c.card, 0.25)} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={14 * Math.cos((i * 2 * Math.PI) / 3)} cy={14 * Math.sin((i * 2 * Math.PI) / 3)} r={6.5} fill={body} />
      ))}
      <circle cx={0} cy={0} r={4} fill={p.yellow} />
    </g>
  );
  return (
    <svg width={W} height={330} viewBox={`0 0 ${W} 330`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
      <defs>
        <linearGradient id="rr-beam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color={p.yellow} stop-opacity={lit ? 0.55 : 0.25} />
          <stop offset="1" stop-color={p.yellow} stop-opacity={0.04} />
        </linearGradient>
      </defs>
      <polygon points={`${cx - 8},206 ${cx + 8},206 ${W - 18},164 18,164`} fill="url(#rr-beam)" />
      <path d={`M ${cx - 104} 214 C ${cx - 104} 262, ${cx - 70} 268, ${cx - 40} 268`} fill="none" stroke={body} stroke-width={3} />
      <path d={`M ${cx + 104} 214 C ${cx + 104} 262, ${cx + 70} 268, ${cx + 40} 268`} fill="none" stroke={body} stroke-width={3} />
      {reel(cx - 104, 1)}
      {reel(cx + 104, -1)}
      <rect x={cx - 56} y={206} width={112} height={62} rx={14} fill={body} />
      <rect x={cx - 44} y={216} width={30} height={8} rx={4} fill={mix(body, c.card, 0.35)} />
      <rect x={cx - 44} y={230} width={20} height={8} rx={4} fill={mix(body, c.card, 0.35)} />
      <circle cx={cx + 26} cy={234} r={16} fill={mix(body, c.card, 0.3)} />
      <circle cx={cx + 26} cy={234} r={10} fill={lit ? p.yellow : mix(body, p.yellow, 0.4)} />
      <rect x={cx - 10} y={196} width={20} height={14} rx={4} fill={body} />
    </svg>
  );
}

export default defineApp<State, Action, Local>({
  name: "Reel roulette",
  summary: (s) => {
    const l = last(s);
    if (s.plan) return `${s.day}: ${s.reels[s.plan.reel]?.title ?? "plan"} · ${s.plan.going.length} going`;
    if (l && !l.veto) return `Reel roulette landed on ${s.reels[l.reel]?.title ?? "a reel"} · lock it or veto`;
    return `Reel roulette · ${s.reels.length} saved reels, spin to pick ${s.day}`;
  },

  init: initState,
  reduce: (s, a, m, ctx) => reduceIt(s, a, m, ctx),
  onMembers: (s, ctx) => (s.plan && !s.plan.going.every((u) => inChat(ctx, u)) ? { ...s, plan: { ...s.plan, going: s.plan.going.filter((u) => inChat(ctx, u)) } } : s),

  invariants: {
    "spins land on real reels": (s) => s.spins.every((x) => Number.isInteger(x.reel) && x.reel >= 0 && x.reel < s.reels.length && Number.isInteger(x.at) && x.at >= 0),
    "only the latest spin can stand": (s) => s.spins.every((x, i) => i === s.spins.length - 1 || !!x.veto),
    "nobody spends more vetoes than they have": (s) => s.spins.every((x) => x.at === 0 || !x.veto || vetoesUsed(s, x.veto.by) <= s.limit),
    "a vetoed reel never lands again while others remain": (s) =>
      s.spins.every((x, i) => {
        const before = new Set(s.spins.slice(0, i).filter((y) => y.veto).map((y) => y.reel));
        return x.at === 0 || !before.has(x.reel) || before.size >= s.reels.length;
      }),
    "the plan is the reel that stands": (s) => s.plan === null || (!!last(s) && !last(s)!.veto && last(s)!.reel === s.plan.reel && s.plan.at > 0),
    "going is unique and here": (s, ctx) => s.plan === null || (new Set(s.plan.going).size === s.plan.going.length && s.plan.going.every((u) => inChat(ctx, u))),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a spin adds one standing spin by me from the seed": (p, n, a, m) =>
      a.t !== "spin" || p === n || (n.spins.length === p.spins.length + 1 && last(n)!.by === m.user && !last(n)!.veto && last(n)!.reel === pick(p, m.seed) && last(n)!.at === Math.max(1, m.time)),
    "a veto stamps the standing spin and spins again": (p, n, a, m) => {
      if (a.t !== "veto" || p === n) return true;
      const vetoed = n.spins[n.spins.length - 2];
      return n.spins.length === p.spins.length + 1 && !!vetoed && vetoed.veto?.by === m.user && vetoed.reel === last(p)!.reel && vetoesUsed(n, m.user) === vetoesUsed(p, m.user) + 1 && last(n)!.by === m.user && !last(n)!.veto;
    },
    "a veto needs one left": (p, n, a, m) => a.t !== "veto" || p === n || vetoesUsed(p, m.user) < p.limit,
    "lock makes the standing reel the plan": (p, n, a, m) => a.t !== "lock" || p === n || (p.plan === null && !!n.plan && n.plan.reel === last(p)!.reel && n.plan.by === m.user && n.plan.going.join() === m.user),
    "in toggles only me": (p, n, a, m) => {
      if (a.t !== "in" || p === n) return true;
      if (!p.plan || !n.plan) return false;
      const was = p.plan.going.includes(m.user);
      return n.plan.going.includes(m.user) !== was && n.plan.going.length === p.plan.going.length + (was ? -1 : 1);
    },
    "spins only grow by spin and veto": (p, n, a) => a.t === "spin" || a.t === "veto" || n.spins === p.spins,
    "the plan only moves by lock and in": (p, n, a) => a.t === "lock" || a.t === "in" || n.plan === p.plan,
    "the reels never change": (p, n) => n.reels === p.reels,
  },

  arbitrary: (s, _u, r) => {
    if (s.plan) return { t: "in" };
    const l = last(s);
    if (!l || l.veto) return { t: "spin" };
    const k = r.next();
    return k < 0.15 ? { t: "lock" } : k < 0.6 ? { t: "veto" } : { t: "spin" };
  },

  local: { toast: 0 },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const n = state.reels.length;
    const spins = confirmed.spins;
    const cl = spins[spins.length - 1] ?? null;
    const prev = spins[spins.length - 2] ?? null;
    const e = cl && cl.at > 0 ? running(cl.at, SPIN_MS) : null;
    const now = clock.value;
    // Strip position, in frames: from the previous landing to this one, three laps around.
    const to = cl ? cl.reel : 0;
    const from = prev ? prev.reel : 0;
    const spinning = pending || e !== null;
    let pos = to;
    if (e !== null && n) pos = from + (to - from + 3 * n) * EASE(e);
    else if (pending && n) pos = to + (now / 90) % n;
    const settled = !spinning && !!cl;
    const reel = cl ? state.reels[cl.reel] : undefined;
    const vetoed = settled && !!cl?.veto && !state.plan;
    const mine = vetoesUsed(state, me);
    const left = Math.max(0, state.limit - mine);
    const lit = settled && !vetoed;
    const scrH = 156;

    // Film frames around the gate.
    const frames = [];
    const boxes = [];
    const base = Math.floor(pos);
    const half = Math.ceil(W / 2 / FW) + 1;
    for (let k = base - half; k <= base + half && n; k++) {
      const i = ((k % n) + n) % n;
      const x = W / 2 + (k - pos) * FW - (FW - 6) / 2;
      const r = state.reels[i]!;
      const out = spins.some((s) => s.veto && s.reel === i);
      boxes.push(<rect key={k} x={x} y={286} width={FW - 6} height={40} rx={3} fill={mix(p.dark, c.card, 0.1)} />);
      if (x < 0 || x + FW - 6 > W) continue;
      frames.push(
        <span key={k} style={{ position: "absolute", left: x, top: 286, width: FW - 6, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Thumb kind={r.kind} seed={r.title} size={38} label="" />
          {out ? <span style={{ position: "absolute", left: 10, right: 10, top: 18, height: 3, background: p.red, transform: "rotate(-24deg)" }} /> : null}
        </span>,
      );
    }
    const holes = [];
    const shift = ((pos * FW) % 16 + 16) % 16;
    for (let x = -shift; x < W; x += 16) {
      holes.push(<rect key={`a${x}`} x={x + 4} y={278} width={8} height={5} rx={1.5} fill={c.card} />);
      holes.push(<rect key={`b${x}`} x={x + 4} y={329} width={8} height={5} rx={1.5} fill={c.card} />);
    }

    const vetoNote = spins.filter((s) => s.veto).slice(-1)[0];
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id;
    const fit = reel ? fitText(reel.title, W - 150, { size: 20, min: 14, weight: 700 }) : null;
    const going = state.plan?.going ?? [];
    const sub = `${state.saved} saved in “${state.chat}”${state.since ? ` since ${state.since}` : ""} · ${spins.length ? `${spins.length} ${spins.length === 1 ? "spin" : "spins"}` : "none done yet"}`;

    return (
      <div>
        <CardHeader title={state.title} subtitle={sub} />
        <div style={{ position: "relative", height: 340, marginTop: 4, overflow: "hidden" }} role="img" aria-label={reel && settled ? `The projector shows ${reel.title}${vetoed ? ", vetoed" : ""}` : `A film strip of ${n} saved reels`}>
          {/* the screen */}
          <div style={{ position: "absolute", left: 18, right: 18, top: 4, height: scrH, borderRadius: 10, background: lit ? mix(p.cream, c.card, 0.35) : mix(p.dark, c.card, theme.mode === "dark" ? 0.05 : 0.12), overflow: "hidden" }}>
            {n === 0 ? (
              <div style={{ position: "absolute", inset: 12, border: `1.5px dashed ${c.divider}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: c.onPrimary, fontSize: 13 }}>Saved reels show up here</div>
            ) : settled && reel ? (
              <>
                <span style={{ position: "absolute", left: 14, top: 18 }}>
                  <Thumb kind={reel.kind} seed={reel.title} size={104} label={reel.title} />
                </span>
                <span style={{ position: "absolute", left: 130, right: 12, top: 22, fontSize: fit!.size, lineHeight: "25px", fontWeight: 700, color: lit ? c.text : c.onPrimary, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{reel.title}</span>
                <span style={{ position: "absolute", left: 130, right: 12, top: 78, fontSize: 13, lineHeight: "16px", color: lit ? c.secondaryText : c.onPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {reel.mins ? `${reel.where} · ${reel.mins} min away` : `${reel.where} · no drive`}
                </span>
                {reel.by ? (
                  <span style={{ position: "absolute", left: 130, right: 12, top: 100, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: lit ? c.secondaryText : c.onPrimary, whiteSpace: "nowrap", overflow: "hidden" }}>
                    <Face id={reel.by} members={members} size={18} theme={theme} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{`${reel.by} saved it`}</span>
                  </span>
                ) : null}
                {vetoed ? (
                  <span style={{ position: "absolute", right: 14, bottom: 12, padding: "2px 10px", border: `2.5px solid ${p.red}`, borderRadius: 6, color: c.onPrimary, background: mix(p.red, p.dark, 0.35), fontWeight: 800, fontSize: 18, lineHeight: "24px", letterSpacing: 1, transform: "rotate(-8deg)" }}>Vetoed</span>
                ) : null}
              </>
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width={110} height={110} viewBox="0 0 110 110" aria-hidden="true">
                  <circle cx={55} cy={55} r={46} fill="none" stroke={c.onPrimary} stroke-width={2} />
                  <circle cx={55} cy={55} r={36} fill="none" stroke={c.onPrimary} stroke-width={1} />
                  <line x1={55} y1={0} x2={55} y2={110} stroke={c.onPrimary} stroke-width={1} />
                  <line x1={0} y1={55} x2={110} y2={55} stroke={c.onPrimary} stroke-width={1} />
                  <path d={`M 55 55 L 55 9 A 46 46 0 ${((now / 700) % 1) > 0.5 ? 1 : 0} 1 ${55 + 46 * Math.sin(((now / 700) % 1) * 2 * Math.PI)} ${55 - 46 * Math.cos(((now / 700) % 1) * 2 * Math.PI)} Z`} fill={c.onPrimary} opacity={0.3} />
                  <text x={55} y={68} text-anchor="middle" font-size={38} font-weight={700} fill={c.onPrimary}>{String(3 - (Math.floor(now / 700) % 3))}</text>
                </svg>
              </div>
            )}
          </div>
          <Projector W={W} spinT={spinning ? now / 900 : 0} theme={theme} lit={lit} />
          {/* the film strip */}
          <svg width={W} height={340} viewBox={`0 0 ${W} 340`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            <rect x={0} y={274} width={W} height={64} fill={mix(p.dark, c.text, theme.mode === "dark" ? 0.25 : 0)} />
            {boxes}
            {holes}
          </svg>
          {frames}
          <span style={{ position: "absolute", left: W / 2 - FW / 2, top: 280, width: FW, height: 52, boxSizing: "border-box", border: `3px solid ${p.yellow}`, borderRadius: 5 }} />
        </div>

        {/* who has used their veto */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, minHeight: 36 }}>
          <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap" }}>Vetoes</span>
          <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 0, overflow: "hidden" }}>
            {members.slice(0, 8).map((m) => {
              const used = vetoesUsed(state, m.id) >= state.limit;
              return (
                <span key={m.id} style={{ position: "relative", display: "flex", padding: 3, borderRadius: 8, border: `1.5px ${used ? "solid" : "dashed"} ${used ? p.red : c.divider}`, background: used ? mix(c.card, p.red, 0.12) : c.card }}>
                  <Avatar user={m} size={22} />
                  {used ? <span style={{ position: "absolute", left: 2, right: 2, top: 14, height: 2, background: p.red, transform: "rotate(-30deg)" }} /> : null}
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 4, minHeight: 20, fontSize: 13, lineHeight: "20px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {spinning
            ? "Spinning"
            : state.plan
              ? `${nameOf(state.plan.by)} locked it for ${state.day}`
              : vetoNote && vetoNote.veto
                ? `${nameOf(vetoNote.veto.by)} vetoed ${state.reels[vetoNote.reel]?.title ?? "it"}${vetoNote.veto.note ? `: “${vetoNote.veto.note}”` : ""}`
                : n
                  ? `${n} reels on the strip, nobody has done one`
                  : "Nothing saved yet"}
        </div>

        <div style={{ marginTop: 8 }}>
          {state.plan ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Locked detail={`${state.day} · ${going.length} going`}>{state.reels[state.plan.reel]?.title ?? "Plan"}</Locked>
              </div>
              <Button kind="secondary" onClick={() => { haptic("light"); dispatch({ t: "in" }); }}>{going.includes(me) ? "Out" : "I'm in"}</Button>
            </div>
          ) : !cl || cl.veto || spinning ? (
            <Button kind="primary" wide disabled={spinning || !n} onClick={() => { haptic("medium"); dispatch({ t: "spin" }); }}>
              {spinning ? "Spinning" : "Spin"}
            </Button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Button kind="primary" wide onClick={() => { haptic("success"); setLocal({ toast: local.toast + 1 }); dispatch({ t: "lock" }); }}>{`Make it ${state.day}`}</Button>
              </div>
              <Button kind="secondary" disabled={left === 0} onClick={() => { haptic("medium"); dispatch({ t: "veto" }); }}>{left ? "Veto it" : "Veto used"}</Button>
            </div>
          )}
        </div>
        {local.toast > 0 && state.plan ? <Toast key={local.toast}>{`${state.day} is ${state.reels[state.plan.reel]?.title ?? "set"}`}</Toast> : null}
      </div>
    );
  },
});
