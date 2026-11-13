import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  More,
  Thumb,
  Toast,
  clock,
  crowd,
  fitText,
  haptic,
  mix,
  pal,
  running,
  spring,
  springs,
  textWidth,
  thumbKind,
  tween,
  userColor,
  type Ctx,
  type Member,
  type Theme,
} from "@muse/app";

// "Where do we go after?": two to four tall cards fill like tubes with friends' faces as votes land.
// Once everyone is in and one card leads, a 3-2-1 ring runs on it and it locks into the plan.

type Icon = "tacos" | "mic" | "roof" | "";
type Params = {
  /** Question: "After the show?" */
  title: string;
  /** Context line: "Greek ends 11:00" */
  when: string;
  /** Time now as H:MM, or empty for a plain poll */
  clock: string;
  /** H:MM the thing ends, or empty */
  ends: string;
  /** H:MM shown on the result, or empty */
  meetAt: string;
  /** 2 to 4 cards. voters: names of friends who already picked it. */
  options: { name: string; meta: string; plan: string; icon: Icon; voters: string[] }[];
};

// @params
const P: Params = {
  title: "After the show?", when: "Greek ends 11:00", clock: "10:41", ends: "11:00", meetAt: "11:05",
  options: [
    { name: "Tacos El Gordo", meta: "0.4 mi · til 2am", plan: "Walk 8 min · al pastor on Theo", icon: "tacos", voters: ["Theo", "Kev"] },
    { name: "Pandora Karaoke", meta: "1.1 mi · room for 8", plan: "Room booked 11:30 · 2 Ubers", icon: "mic", voters: ["Jess", "Priya"] },
    { name: "Maya's roof", meta: "0.8 mi · BYO snacks", plan: "Maya has the key · walk 15 min", icon: "roof", voters: ["Maya"] },
  ],
};
// @end params

type Opt = { id: string; name: string; meta: string; plan: string; icon: Icon };
type State = {
  title: string;
  when: string;
  clock: string;
  ends: string;
  meetAt: string;
  options: Opt[];
  /** Seeded voters who are not in the chat; fixed forever. */
  outside: { name: string; o: string }[];
  /** Member id to option id and the server time of the vote (0 when seeded). */
  votes: Record<string, { o: string; at: number }>;
  /** 0 while open, else the time of the lock. */
  lockedAt: number;
  winner: string | null;
};
type Action = { t: "vote"; o: string } | { t: "lock" } | { t: "reopen" };

const COUNTDOWN = 2400;
const TUBE = 136;
const ICONS: Icon[] = ["tacos", "mic", "roof", ""];
const HM = /^\d{1,2}:\d{2}$/;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const cleanTime = (v: unknown) => {
  const s = clean(v, 5);
  return HM.test(s) ? s : "";
};
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);

const countOf = (s: State, o: string) => s.outside.filter((x) => x.o === o).length + Object.values(s.votes).filter((v) => v.o === o).length;
const totalOf = (s: State, ctx: Ctx) => ctx.members.length + s.outside.length;
const votedOf = (s: State) => s.outside.length + Object.keys(s.votes).length;
const leaderOf = (s: State): string | null => {
  const counts = s.options.map((o) => ({ id: o.id, n: countOf(s, o.id) }));
  const top = Math.max(...counts.map((c) => c.n));
  const lead = counts.filter((c) => c.n === top);
  return lead.length === 1 ? lead[0]!.id : null;
};
const allIn = (s: State, ctx: Ctx) => ctx.members.length > 0 && ctx.members.every((m) => !!s.votes[m.id]);
const minutesOf = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return ((h ?? 0) % 24) * 60 + (m ?? 0);
};

function initState(ctx: Ctx): State {
  const options: Opt[] = [];
  const raw: Params["options"] = [];
  for (const o of P.options) {
    if (options.length >= 4) break;
    const name = clean(o.name, 40);
    if (!name) continue;
    options.push({ id: `o${options.length}`, name, meta: clean(o.meta, 40), plan: clean(o.plan, 40), icon: ICONS.includes(o.icon) ? o.icon : "" });
    raw.push(o);
  }
  let voters: string[][] = raw.map((o) => (Array.isArray(o.voters) ? o.voters : []));
  if (options.length < 2) {
    options.length = 0;
    options.push({ id: "o0", name: "Tacos", meta: "", plan: "", icon: "" }, { id: "o1", name: "Pizza", meta: "", plan: "", icon: "" });
    voters = [[], []];
  }
  const votes: State["votes"] = {};
  const outside: State["outside"] = [];
  const seen = new Set<string>();
  options.forEach((o, i) => {
    for (const v of voters[i] ?? []) {
      const name = clean(v, 28);
      if (!name) continue;
      const m = ctx.members.find((x) => x.id === name || x.name.toLowerCase() === name.toLowerCase());
      if (m) {
        if (!votes[m.id]) votes[m.id] = { o: o.id, at: 0 };
      } else if (outside.length < 12 && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        outside.push({ name, o: o.id });
      }
    }
  });
  return {
    title: clean(P.title, 40),
    when: clean(P.when, 40),
    clock: cleanTime(P.clock),
    ends: cleanTime(P.ends),
    meetAt: cleanTime(P.meetAt),
    options,
    outside,
    votes,
    lockedAt: 0,
    winner: null,
  };
}

/** What a vote from `user` for `o` would do to the lock, for the haptic. */
const locksOn = (s: State, ctx: Ctx, user: string, o: string) => {
  if (s.lockedAt > 0 || s.votes[user]?.o === o) return false;
  const next = { ...s, votes: { ...s.votes, [user]: { o, at: 1 } } };
  return allIn(next, ctx) && leaderOf(next) !== null;
};

function Mini({ icon, s, fill, size, theme }: { icon: Icon; s: number; fill: string; size: number; theme: Theme }) {
  const p = pal(theme);
  const c = size / 2;
  const x = (k: number) => c + k * s;
  const sw = 1.5;
  if (icon === "tacos") {
    const shell = Array.from({ length: 15 }, (_, k) => `${x(Math.cos((Math.PI * k) / 14) * 0.7).toFixed(2)},${x(Math.sin((Math.PI * k) / 14) * 0.5 - 0.05).toFixed(2)}`).join(" ");
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {[0, 1, 2, 3].map((k) => (
          <circle key={k} cx={x(-0.45 + k * 0.3)} cy={x(-0.12)} r={0.17 * s} fill={k % 2 ? p.red : p.green} />
        ))}
        <polygon points={shell} fill={p.yellow} stroke={p.ink} stroke-width={sw} stroke-linejoin="round" />
      </svg>
    );
  }
  if (icon === "mic") {
    const hx = x(0.18), hy = x(-0.25);
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <line x1={hx} y1={hy} x2={x(-0.45)} y2={x(0.55)} stroke={p.ink} stroke-width={0.18 * s} stroke-linecap="round" />
        <circle cx={hx} cy={hy} r={0.32 * s} fill={mix(p.soft, p.card, 0.45)} stroke={p.ink} stroke-width={sw} />
        {[-0.9, -0.4, 0.1].map((a, k) => (
          <circle key={k} cx={hx + Math.cos(a) * s * 0.64} cy={hy + Math.sin(a) * s * 0.64} r={0.06 * s + 0.4} fill={p.ink} />
        ))}
      </svg>
    );
  }
  if (icon === "roof") {
    const pts = (a: [number, number][]) => a.map(([px, py]) => `${x(px).toFixed(2)},${x(py).toFixed(2)}`).join(" ");
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={x(0.25)} cy={x(-0.3)} r={0.3 * s} fill={p.cream} />
        <circle cx={x(0.38)} cy={x(-0.4)} r={0.24 * s} fill={fill} />
        <polygon points={pts([[-0.7, 0.6], [-0.7, 0.05], [-0.35, -0.2], [0, 0.05], [0, 0.6]])} fill={p.ink} />
        <rect x={x(0)} y={x(0.2)} width={0.7 * s} height={0.4 * s} fill={mix(p.ink, p.card, 0.25)} />
        {[0, 1].map((k) => (
          <rect key={k} x={x(-0.48 + k * 0.26) - 0.06 * s} y={x(0.25) - 0.07 * s} width={0.12 * s} height={0.14 * s} fill={p.cream} />
        ))}
      </svg>
    );
  }
  return null;
}

function Face({ voter, members, me, theme, size = 24 }: { voter: { id?: string | undefined; name: string }; members: Member[]; me: string; theme: Theme; size?: number }) {
  const c = theme.color;
  const mine = voter.id !== undefined && voter.id === me;
  const ring = mine ? `0 0 0 2px ${c.primary}` : `0 0 0 2px ${c.card}`;
  if (voter.id !== undefined) {
    const m = members.find((x) => x.id === voter.id);
    if (m) {
      return (
        <span style={{ display: "flex", borderRadius: "50%", boxShadow: ring }}>
          <Avatar user={m} size={size} />
        </span>
      );
    }
  }
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        boxShadow: ring,
        background: userColor(voter.name, theme),
        color: c.onPrimary,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {(voter.name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function Ring({ e, theme }: { e: number; theme: Theme }) {
  const c = theme.color;
  const sweep = Math.max(0.001, Math.min(Math.PI * 2 - 0.001, Math.PI * 2 * (1 - e / COUNTDOWN)));
  const r = 11;
  const ex = 14 + r * Math.cos(-Math.PI / 2 + sweep);
  const ey = 14 + r * Math.sin(-Math.PI / 2 + sweep);
  return (
    <span
      style={{ position: "absolute", right: 5, top: 5, width: 28, height: 28, borderRadius: "50%", background: c.card, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 2 }}
      aria-hidden="true"
    >
      <svg width={28} height={28} viewBox="0 0 28 28" style={{ position: "absolute", left: 0, top: 0 }}>
        <circle cx={14} cy={14} r={r} fill="none" stroke={c.divider} stroke-width={2.5} />
        <path d={`M 14 ${14 - r} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`} fill="none" stroke={c.primary} stroke-width={2.5} stroke-linecap="round" />
      </svg>
      <span style={{ fontSize: 12, fontWeight: 600, lineHeight: "16px", color: c.text }}>{Math.max(1, Math.ceil((COUNTDOWN - e) / 800))}</span>
    </span>
  );
}

const backOut = tween({ duration: 450, easing: [0.34, 1.56, 0.64, 1] });
const rise = tween({ duration: 400, easing: [0.34, 1.56, 0.64, 1] });
const bounce = spring(springs.iosBouncy);

export default defineApp<State, Action>({
  name: "After vote",
  summary: (s, ctx) => {
    const name = (id: string | null) => s.options.find((o) => o.id === id)?.name ?? "";
    if (s.winner !== null) return `${s.title}: ${name(s.winner)} · locked · ${countOf(s, s.winner)} votes`;
    return `${s.title}: ${s.options.map((o) => `${o.name} ${countOf(s, o.id)}`).join(" · ")} · ${votedOf(s)} of ${totalOf(s, ctx)} voted`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "vote") {
      if (state.lockedAt > 0 || typeof action.o !== "string" || !state.options.some((o) => o.id === action.o)) return state;
      if (state.votes[meta.user]?.o === action.o) return state;
      const next: State = { ...state, votes: { ...state.votes, [meta.user]: { o: action.o, at: meta.time } } };
      const lead = leaderOf(next);
      if (allIn(next, ctx) && lead !== null) return { ...next, lockedAt: Math.max(1, meta.time), winner: lead };
      return next;
    }
    if (action.t === "lock") {
      const lead = leaderOf(state);
      if (state.lockedAt > 0 || !state.votes[meta.user] || lead === null) return state;
      return { ...state, lockedAt: Math.max(1, meta.time), winner: lead };
    }
    if (action.t === "reopen") {
      if (state.lockedAt === 0 || !state.votes[meta.user]) return state;
      return { ...state, lockedAt: 0, winner: null };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const keep = Object.entries(state.votes).filter(([u]) => inChat(ctx, u));
    if (keep.length === Object.keys(state.votes).length) return state;
    return { ...state, votes: Object.fromEntries(keep) };
  },

  invariants: {
    "2 to 4 options, unique ids": (s) => s.options.length >= 2 && s.options.length <= 4 && new Set(s.options.map((o) => o.id)).size === s.options.length,
    "votes point at options": (s) => {
      const ids = s.options.map((o) => o.id);
      return Object.values(s.votes).every((v) => ids.includes(v.o) && Number.isInteger(v.at) && v.at >= 0) && s.outside.every((x) => ids.includes(x.o));
    },
    "voters are in the chat": (s, ctx) => Object.keys(s.votes).every((u) => ctx.members.some((m) => m.id === u)),
    "locked exactly when there is a winner": (s) => (s.lockedAt === 0) === (s.winner === null) && (s.winner === null || s.options.some((o) => o.id === s.winner)),
    "outside is capped": (s) => s.outside.length <= 12,
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "votes only while open": (p, n, a) => a.t !== "vote" || p.lockedAt === 0 || p === n,
    "a vote moves only the voter, to that option, now": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const mine = n.votes[m.user];
      if (!mine || mine.o !== a.o || mine.at !== m.time || p.votes[m.user]?.o === a.o) return false;
      const keys = new Set([...Object.keys(p.votes), ...Object.keys(n.votes)]);
      for (const k of keys) if (k !== m.user && JSON.stringify(p.votes[k]) !== JSON.stringify(n.votes[k])) return false;
      return true;
    },
    "all in with a clear leader locks on that vote": (p, n, a, m, ctx) => {
      if (a.t !== "vote" || p === n) return true;
      const tally = n.options.map((o) => ({ id: o.id, c: n.outside.filter((x) => x.o === o.id).length + Object.values(n.votes).filter((v) => v.o === o.id).length }));
      const top = Math.max(...tally.map((x) => x.c));
      const best = tally.filter((x) => x.c === top);
      const lead = best.length === 1 ? best[0]!.id : null;
      const everyone = ctx.members.length > 0 && ctx.members.every((x) => !!n.votes[x.id]);
      return (everyone && lead !== null) === (n.lockedAt === Math.max(1, m.time) && n.winner === lead);
    },
    "a lock takes the outright leader": (p, n, a, m) => {
      if (a.t !== "lock" || p === n) return true;
      const tally = p.options.map((o) => ({ id: o.id, c: p.outside.filter((x) => x.o === o.id).length + Object.values(p.votes).filter((v) => v.o === o.id).length }));
      const top = Math.max(...tally.map((x) => x.c));
      const best = tally.filter((x) => x.c === top);
      const lead = best.length === 1 ? best[0]!.id : null;
      return p.lockedAt === 0 && !!p.votes[m.user] && lead !== null && n.winner === lead && n.lockedAt === Math.max(1, m.time) && JSON.stringify(n.votes) === JSON.stringify(p.votes);
    },
    "reopen only clears the lock": (p, n, a, m) =>
      a.t !== "reopen" || p === n || (p.lockedAt > 0 && !!p.votes[m.user] && n.lockedAt === 0 && n.winner === null && JSON.stringify(n.votes) === JSON.stringify(p.votes)),
    "options and outside votes never change": (p, n) => JSON.stringify(p.options) === JSON.stringify(n.options) && JSON.stringify(p.outside) === JSON.stringify(n.outside),
  },

  arbitrary: (s, user, r) => {
    const ids = s.options.map((o) => o.id);
    const k = r.next();
    if (s.lockedAt > 0) return k < 0.5 ? { t: "reopen" } : { t: "vote", o: r.pick(ids) };
    if (k < 0.15) return { t: "lock" };
    const other = ids.filter((id) => id !== s.votes[user]?.o);
    return { t: "vote", o: r.pick(other.length ? other : ids) };
  },

  view: ({ state, me, members, dispatch, theme }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const n = state.options.length;
    const colW = (W - 8 * (n - 1)) / n;
    const total = state.outside.length + members.length;
    const voted = votedOf(state);
    const lead = leaderOf(state);
    const maxCount = Math.max(...state.options.map((o) => countOf(state, o.id)));
    const locked = state.lockedAt > 0;
    const t = clock.value / 1000;
    const e = locked ? running(state.lockedAt, COUNTDOWN) : null;
    const counting = e !== null;
    const reveal = locked && !counting;
    const settle = reveal ? running(state.lockedAt + COUNTDOWN, bounce.duration) : null;
    const lift = reveal ? 4 * bounce(settle ?? bounce.duration) : 0;
    const cardUp = reveal ? rise(running(state.lockedAt + COUNTDOWN, 400) ?? 400) : 1;
    const toast = reveal && running(state.lockedAt + COUNTDOWN, 2600) !== null;
    const winnerOpt = state.options.find((o) => o.id === state.winner);
    const deciding = members.filter((m) => !state.votes[m.id]);
    const myVote = state.votes[me];
    const accs = [c.series2, c.series1, c.series4, c.series3];

    // Strip: clock and the people still deciding.
    const hasClock = state.clock !== "";
    const [ch, cm] = hasClock ? state.clock.split(":").map(Number) : [0, 0];
    const hourA = (((ch! % 12) + cm! / 60) / 12) * Math.PI * 2 - Math.PI / 2;
    const minA = (cm! / 60) * Math.PI * 2 - Math.PI / 2;
    const secA = ((t % 60) / 60) * Math.PI * 2 - Math.PI / 2;
    const left = state.ends && hasClock ? (minutesOf(state.ends) - minutesOf(state.clock) + 1440) % 1440 : null;
    const shownDeciding = crowd(deciding, 3);
    const slots = shownDeciding.shown.length + (shownDeciding.extra > 0 ? 1 : 0);
    const facesLeft = W - 12 - 20 - 26 * Math.max(0, slots - 1);
    const labelW = textWidth("Deciding", 13, 400);
    const textEnd = hasClock ? 56 + Math.max(textWidth(state.clock, 15, 600), left !== null ? textWidth(`Show ends in ${left} min`, 12, 400) : 0) : 12 + textWidth(`${voted} of ${total} voted`, 15, 600);
    const showLabel = facesLeft - 16 - labelW > textEnd + 8;
    const done = mix(c.positive, c.text, 0.15);
    const doneText = !locked ? "" : deciding.length === 0 ? (counting ? `All ${total} voted · locking…` : "Everyone's in") : `Locked · ${voted} of ${total} voted`;

    const prompt = counting
      ? "Locking in…"
      : !myVote
        ? total > 1
          ? `${voted === 0 ? "Be the first to vote" : "Tap a card to vote"} · locks when all ${total} are in`
          : "Tap a card to vote"
        : lead === null
          ? `Tied at ${maxCount} · switch to break it`
          : "Tap another card to switch";

    const vote = (o: string) => {
      if (locked) return;
      if (locksOn(state, { room: "", members }, me, o)) haptic("success");
      else haptic("light");
      dispatch({ t: "vote", o });
    };

    const nameOf = (id: string) => state.options.find((o) => o.id === id)?.name ?? "";

    return (
      <div style={{ position: "relative" }}>
        <CardHeader title={state.title} subtitle={state.when ? `${state.when}${total > 0 ? ` · ${total} of us` : ""}` : total > 0 ? `${total} of us` : undefined} />

        <div style={{ position: "relative", height: 48, marginTop: 4, borderRadius: 12, background: c.wash }}>
          {hasClock ? (
            <>
              <svg width={56} height={48} viewBox="0 0 56 48" style={{ position: "absolute", left: 0, top: 0 }} role="img" aria-label={`Clock at ${state.clock}`}>
                <circle cx={28} cy={24} r={18} fill={c.card} stroke={c.text} stroke-width={1.5} />
                <line x1={28} y1={24} x2={28 + 9 * Math.cos(hourA)} y2={24 + 9 * Math.sin(hourA)} stroke={c.text} stroke-width={2.5} stroke-linecap="round" />
                <line x1={28} y1={24} x2={28 + 13 * Math.cos(minA)} y2={24 + 13 * Math.sin(minA)} stroke={c.text} stroke-width={2} stroke-linecap="round" />
                <line x1={28} y1={24} x2={28 + 14 * Math.cos(secA)} y2={24 + 14 * Math.sin(secA)} stroke={c.negative} stroke-width={1} stroke-linecap="round" />
                <circle cx={28} cy={24} r={1.6} fill={c.text} />
              </svg>
              <span style={{ position: "absolute", left: 56, top: 5, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text }}>{state.clock}</span>
              {left !== null ? (
                <span style={{ position: "absolute", left: 56, top: 25, fontSize: 12, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap" }}>{`Show ends in ${left} min`}</span>
              ) : null}
            </>
          ) : (
            <span style={{ position: "absolute", left: 12, top: 14, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text }}>{`${voted} of ${total} voted`}</span>
          )}

          {locked && doneText ? (
            <span style={{ position: "absolute", right: 12, top: 14, fontSize: 13, lineHeight: "20px", color: done, whiteSpace: "nowrap" }}>{doneText}</span>
          ) : deciding.length > 0 ? (
            <>
              {showLabel ? (
                <span style={{ position: "absolute", left: facesLeft - 16 - labelW, top: 10, fontSize: 13, lineHeight: "20px", color: c.secondaryText, whiteSpace: "nowrap" }}>Deciding</span>
              ) : null}
              {shownDeciding.shown.map((m, k) => {
                const cx = W - 12 - 10 - 26 * (slots - 1 - k);
                return (
                  <span key={m.id}>
                    <span style={{ position: "absolute", left: cx - 10, top: 10, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${m.id === me ? c.primary : c.card}` }}>
                      <Avatar user={m} size={20} />
                    </span>
                    <svg width={20} height={8} viewBox="0 0 20 8" style={{ position: "absolute", left: cx - 10, top: 32 }} aria-hidden="true">
                      {[-5, 0, 5].map((dx, d) => (
                        <circle key={d} cx={10 + dx} cy={4 - Math.max(0, Math.sin(t * 6 - d - k)) * 2} r={1.6} fill={c.secondaryText} />
                      ))}
                    </svg>
                  </span>
                );
              })}
              {shownDeciding.extra > 0 ? (
                <span style={{ position: "absolute", left: W - 12 - 20, top: 10 }}>
                  <More n={shownDeciding.extra} size={20} />
                </span>
              ) : null}
            </>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, height: 236, marginTop: 8 }}>
          {state.options.map((o, i) => {
            const acc = accs[i]!;
            const cnt = countOf(state, o.id);
            const mine = myVote?.o === o.id;
            const isWin = reveal && state.winner === o.id;
            const loser = reveal && state.winner !== o.id;
            const tubeW = colW - 24;
            const narrow = tubeW < 56;
            const perRow = narrow ? 1 : 2;
            const cap = perRow * 3;
            const voters = [
              ...state.outside.filter((x) => x.o === o.id).map((x) => ({ name: x.name, id: undefined as string | undefined, at: 0 })),
              ...members
                .map((m, idx) => ({ m, idx, v: state.votes[m.id] }))
                .filter((x) => x.v?.o === o.id)
                .sort((a, b) => a.v!.at - b.v!.at || a.idx - b.idx)
                .map((x) => ({ name: x.m.name, id: x.m.id as string | undefined, at: x.v!.at })),
            ];
            const overflow = voters.length > cap;
            const faces = overflow ? voters.slice(0, cap - 1) : voters;
            const fill = (TUBE * cnt) / Math.max(1, state.outside.length + members.length);
            const nameFit = fitText(o.name, colW - 14, { size: 14, min: 10, weight: 600 });
            const metaFit = fitText(o.meta, colW - 12, { size: 12, min: 10 });
            const shadows: string[] = [];
            if (mine && !locked) shadows.push(`inset 0 0 0 2.5px ${c.primary}`);
            if (isWin) shadows.push(`inset 0 0 0 2.5px ${c.primary}`, `0 0 0 5px ${mix(c.card, acc, 0.35)}`);
            const inner = (
              <>
                <span style={{ position: "absolute", left: colW / 2 - 20, top: 10, width: 40, height: 40, borderRadius: "50%", background: mix(c.card, acc, 0.3), display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {o.icon ? <Mini icon={o.icon} s={22} fill={mix(c.card, acc, 0.3)} size={40} theme={theme} /> : <Thumb kind={thumbKind(o.name)} seed={o.name} size={32} label="" />}
                </span>
                <span style={{ position: "absolute", left: 7, right: 7, top: 50, height: 20, textAlign: "center", fontSize: nameFit.size, lineHeight: "20px", fontWeight: 600, color: loser ? c.secondaryText : c.text, whiteSpace: "nowrap" }}>{nameFit.text}</span>
                {colW >= 90 && o.meta ? (
                  <span style={{ position: "absolute", left: 6, right: 6, top: 69, height: 16, textAlign: "center", fontSize: metaFit.size, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap" }}>{metaFit.text}</span>
                ) : null}
                <span style={{ position: "absolute", left: 12, top: 90, width: tubeW, height: TUBE, borderRadius: 10, background: c.card, overflow: "hidden" }}>
                  <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: fill, borderRadius: 10, background: mix(c.card, acc, loser ? 0.12 : 0.35), transition: "height 400ms" }} />
                  <span style={{ position: "absolute", left: 0, right: 0, top: 2, textAlign: "center", fontSize: 24, lineHeight: "28px", fontWeight: 700, color: c.text }}>{cnt}</span>
                </span>
                <span style={{ position: "absolute", left: 12, top: 90, width: tubeW, height: TUBE, opacity: loser ? 0.45 : 1 }} aria-hidden={loser ? "true" : undefined}>
                  {[...faces, ...(overflow ? [null] : [])].map((v, k) => {
                    const col = narrow ? 0 : k % 2;
                    const row = narrow ? k : Math.floor(k / 2);
                    const cx = narrow ? tubeW / 2 : tubeW / 2 + (col ? 16 : -16);
                    const cy = TUBE - 16 - row * 28;
                    const el = v && v.at > 0 ? running(v.at, 450) : null;
                    const drop = el === null ? 0 : -(cy + 90 + 20 + 12) * (1 - backOut(el));
                    return (
                      <span key={v ? (v.id ?? `x:${v.name}`) : "more"} style={{ position: "absolute", left: cx - 12, top: cy - 12, display: "flex", transform: drop ? `translateY(${drop.toFixed(1)}px)` : undefined, zIndex: 1 }}>
                        {v ? <Face voter={v} members={members} me={me} theme={theme} /> : <More n={voters.length - (cap - 1)} size={24} />}
                      </span>
                    );
                  })}
                </span>
                {counting && state.winner === o.id ? <Ring e={e!} theme={theme} /> : null}
              </>
            );
            const style = {
              position: "relative" as const,
              display: "block",
              flex: "1 1 0",
              minWidth: 0,
              height: 236,
              padding: 0,
              border: 0,
              borderRadius: 12,
              background: c.wash,
              textAlign: "left" as const,
              font: "inherit",
              color: "inherit",
              boxShadow: shadows.length ? shadows.join(",") : undefined,
              transform: isWin ? `translateY(${(-lift).toFixed(2)}px)` : undefined,
              zIndex: isWin ? 3 : undefined,
              cursor: locked ? "default" : "pointer",
            };
            return locked ? (
              <div key={o.id} style={style}>
                {inner}
              </div>
            ) : (
              <button key={o.id} type="button" aria-label={`${o.name}, ${cnt} votes`} aria-pressed={mine} style={style} onClick={() => vote(o.id)}>
                {inner}
              </button>
            );
          })}
        </div>

        <div style={{ height: 44, marginTop: 8 }}>
          {reveal && winnerOpt ? (
            <div
              style={{ position: "relative", height: 44, borderRadius: 12, background: c.wash, display: "flex", alignItems: "center", gap: 10, padding: "0 8px 0 9px", transform: `translateY(${(12 * (1 - cardUp)).toFixed(1)}px)` }}
            >
              <span style={{ flex: "none", width: 30, height: 30, borderRadius: "50%", background: mix(c.card, accs[state.options.indexOf(winnerOpt)]!, 0.3), display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {winnerOpt.icon ? <Mini icon={winnerOpt.icon} s={15} fill={mix(c.card, accs[state.options.indexOf(winnerOpt)]!, 0.3)} size={30} theme={theme} /> : <Thumb kind={thumbKind(winnerOpt.name)} seed={winnerOpt.name} size={22} label="" />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, lineHeight: "18px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.meetAt ? `${state.meetAt} · ${winnerOpt.name}` : winnerOpt.name}</span>
                {winnerOpt.plan ? (
                  <span style={{ display: "block", fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{winnerOpt.plan}</span>
                ) : null}
              </span>
              {myVote ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "reopen" })}>
                  Reopen
                </Button>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText, maxHeight: 32, overflow: "hidden" }}>{prompt}</span>
              {!locked && myVote && lead !== null ? (
                <Button kind="primary" onClick={() => dispatch({ t: "lock" })}>
                  Lock it
                </Button>
              ) : null}
            </div>
          )}
        </div>
        {toast ? <Toast key={state.lockedAt}>{`It's a plan · ${nameOf(state.winner ?? "")}`}</Toast> : null}
      </div>
    );
  },
});
