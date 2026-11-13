import { defineApp, clock, Avatar, Burst, Button, CardHeader, Locked, fitText, haptic, mix, pal, running, spring, springs, type Ctx, type Theme } from "@muse/app";

// Focus twins: two tomatoes side by side, one per person, ticking down the same 25 minutes.
// Each ripens from green to red as the round runs. Step away and yours wilts a little until you're
// back. At the break both pop into one shared stretch. Four rounds and they're done.

type Params = {
  /** Card title: "Stats midterm focus" */
  title: string;
  /** The two studying, in the chat: ["Calvin", "Will"] */
  people: string[];
  /** What started it, in their words */
  quote: string;
  /** Who said it */
  quoteBy: string;
  /** One short line each, same order as people: what they're up to */
  notes: string[];
  /** Rounds in all */
  rounds: number;
  /** Minutes of focus per round */
  focusMin: number;
  /** Minutes of break */
  breakMin: number;
  /** Rounds already done */
  done: number;
  /** Who's already in for the next round */
  ready: string[];
  /** What's said when they finish: "go sleep" */
  doneLine: string;
};

// @params
const P: Params = {
  title: "Stats midterm focus",
  people: ["Calvin", "Will"],
  quote: "study together? i can't focus alone",
  quoteBy: "Calvin",
  notes: ["phone's in the other room. all 7 alarms off", "one sec, getting snacks"],
  rounds: 4,
  focusMin: 25,
  breakMin: 5,
  done: 1,
  ready: ["Calvin"],
  doneLine: "go sleep, midterm's at 9",
};
// @end params

type State = {
  title: string;
  a: string;
  b: string;
  names: [string, string];
  quote: string;
  quoteBy: string;
  notes: [string, string];
  rounds: number;
  focus: number;
  brk: number;
  done: number;
  ready: string[];
  startAt: number;
  away: string[];
  doneLine: string;
};
type Action = { t: "ready" } | { t: "away" } | { t: "stop" };
type Local = { bursts: number };

const MIN = 60000;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const int = (v: unknown, lo: number, hi: number, d: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : d);
const POP = spring(springs.iosBouncy);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const pair = (s: State) => [s.a, s.b].filter(Boolean);
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Where the session stands at time t: rounds finished, and the phase of the current one. */
function phaseAt(s: State, t: number) {
  if (s.startAt === 0) return { finished: s.done, running: false, phase: "idle" as const, left: s.focus * MIN, frac: 0 };
  const cycle = (s.focus + s.brk) * MIN;
  const el = Math.max(0, t - s.startAt);
  const k = Math.floor(el / cycle);
  const within = el - k * cycle;
  const inFocus = within < s.focus * MIN;
  const finished = Math.min(s.rounds, s.done + k + (inFocus ? 0 : 1));
  if (finished >= s.rounds) return { finished, running: false, phase: "over" as const, left: 0, frac: 1 };
  return inFocus
    ? { finished, running: true, phase: "focus" as const, left: s.focus * MIN - within, frac: within / (s.focus * MIN) }
    : { finished, running: true, phase: "break" as const, left: cycle - within, frac: 1 };
}

function initState(ctx: Ctx): State {
  const find = (n: unknown) => {
    const x = clean(n, 40).toLowerCase();
    return x ? ctx.members.find((m) => m.id === x || m.name.toLowerCase() === x) : undefined;
  };
  const ppl = Array.isArray(P.people) ? P.people : [];
  const ma = find(ppl[0]);
  const a = ma?.id ?? ctx.members[0]?.id ?? "";
  const mb = find(ppl[1]);
  const b = mb && mb.id !== a ? mb.id : ctx.members.find((m) => m.id !== a)?.id ?? "";
  const nm = (id: string, fb: unknown) => ctx.members.find((m) => m.id === id)?.name ?? (clean(fb, 20) || "Friend");
  const notes = Array.isArray(P.notes) ? P.notes : [];
  const rounds = int(P.rounds, 1, 8, 4);
  const done = int(P.done, 0, rounds, 0);
  const ready = (Array.isArray(P.ready) ? P.ready : []).map((x) => find(x)?.id ?? "").filter((u, i, arr) => u && (u === a || u === b) && arr.indexOf(u) === i);
  return {
    title: clean(P.title, 40) || "Focus together",
    a,
    b,
    names: [nm(a, ppl[0]), nm(b, ppl[1])],
    quote: clean(P.quote, 80),
    quoteBy: clean(P.quoteBy, 20),
    notes: [clean(notes[0], 48), clean(notes[1], 48)],
    rounds,
    focus: int(P.focusMin, 5, 90, 25),
    brk: int(P.breakMin, 1, 30, 5),
    done,
    ready: done >= rounds ? [] : ready.length === 2 ? ready.slice(0, 1) : ready,
    startAt: 0,
    away: [],
    doneLine: clean(P.doneLine, 40),
  };
}

function Tomato({ cx, cy, r, ripe, wilt, pop, theme, ring }: { cx: number; cy: number; r: number; ripe: number; wilt: boolean; pop: number; theme: Theme; ring: string }) {
  const p = pal(theme);
  const c = theme.color;
  const green = mix(p.green, p.cream, 0.15);
  const red = p.red;
  const sy = wilt ? 0.9 : 1;
  const sx = wilt ? 1.05 : 1;
  const clip = `tm-${Math.round(cx)}`;
  const body = `M ${-r} 0 C ${-r} ${-r * 0.85} ${-r * 0.45} ${-r * 0.92} 0 ${-r * 0.8} C ${r * 0.45} ${-r * 0.92} ${r} ${-r * 0.85} ${r} 0 C ${r} ${r * 0.8} ${r * 0.5} ${r * 0.95} 0 ${r * 0.95} C ${-r * 0.5} ${r * 0.95} ${-r} ${r * 0.8} ${-r} 0 Z`;
  const level = r * 0.95 - (r * 1.75 * Math.max(0, Math.min(1, ripe)));
  const leaf = (a: number) => `M 0 0 Q ${Math.cos(a - 0.4) * 14} ${Math.sin(a - 0.4) * 14} ${Math.cos(a) * 26} ${Math.sin(a) * 26} Q ${Math.cos(a + 0.4) * 14} ${Math.sin(a + 0.4) * 14} 0 0 Z`;
  const angles = wilt ? [0.5, 1.2, 1.95, 2.65] : [-0.35, -1.2, -1.95, -2.8];
  return (
    <g transform={`translate(${cx} ${cy}) scale(${(sx * (1 + pop * 0.08)).toFixed(3)} ${(sy * (1 + pop * 0.08)).toFixed(3)})`}>
      <defs>
        <clipPath id={clip}>
          <path d={body} />
        </clipPath>
      </defs>
      <ellipse cx={0} cy={r * 0.98} rx={r * 0.8} ry={6} fill={mix(c.wash, c.text, 0.08)} />
      <path d={body} fill={green} />
      <g clip-path={`url(#${clip})`}>
        <rect x={-r} y={level} width={r * 2} height={r * 2} fill={red} />
        <path d={`M ${-r} ${level} q ${r / 2} -5 ${r} 0 q ${r / 2} 5 ${r} 0`} fill={red} />
      </g>
      <path d={body} fill="none" stroke={ring} stroke-width={3} />
      <ellipse cx={-r * 0.45} cy={-r * 0.35} rx={r * 0.16} ry={r * 0.3} fill={p.paper} opacity={0.35} transform={`rotate(25 ${-r * 0.45} ${-r * 0.35})`} />
      <g transform={`translate(0 ${-r * 0.8})`}>
        {angles.map((a, i) => (
          <path key={i} d={leaf(a)} fill={wilt ? mix(p.leaf, p.brown, 0.4) : p.leaf} />
        ))}
        <rect x={-2.5} y={wilt ? -6 : -14} width={5} height={wilt ? 8 : 14} rx={2} fill={p.leaf} transform={wilt ? "rotate(35)" : undefined} />
      </g>
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Focus twins",
  summary: (s) => {
    if (s.startAt === 0)
      return s.done >= s.rounds ? `${s.names[0]} and ${s.names[1]} finished ${s.rounds} rounds` : `${s.names[0]} and ${s.names[1]} · ${s.done} of ${s.rounds} rounds · ${s.ready.length} of 2 ready`;
    return `${s.names[0]} and ${s.names[1]} are focusing · round ${Math.min(s.rounds, s.done + 1)} of ${s.rounds}`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u) || !pair(s).includes(u)) return s;
    if (a.t === "ready") {
      if (s.startAt > 0 || s.done >= s.rounds) return s;
      if (s.ready.includes(u)) return { ...s, ready: s.ready.filter((x) => x !== u) };
      const ready = [...s.ready, u];
      if (pair(s).length === 2 && pair(s).every((x) => ready.includes(x))) return { ...s, ready: [], startAt: Math.max(1, meta.time), away: [] };
      return { ...s, ready };
    }
    if (a.t === "away") {
      if (s.startAt === 0) return s;
      return { ...s, away: s.away.includes(u) ? s.away.filter((x) => x !== u) : [...s.away, u] };
    }
    if (a.t === "stop") {
      if (s.startAt === 0) return s;
      const ph = phaseAt(s, meta.time);
      return { ...s, done: ph.finished, startAt: 0, away: [], ready: [] };
    }
    return s;
  },

  invariants: {
    "rounds done fit the plan": (s) => Number.isInteger(s.done) && s.done >= 0 && s.done <= s.rounds,
    "only the two get ready": (s) => s.ready.every((u) => u === s.a || u === s.b) && new Set(s.ready).size === s.ready.length,
    "nobody waits once it runs": (s) => s.startAt === 0 || s.ready.length === 0,
    "both ready means it's running": (s) => !(s.a && s.b && s.ready.includes(s.a) && s.ready.includes(s.b)),
    "away only while running": (s) => (s.startAt > 0 || s.away.length === 0) && s.away.every((u) => u === s.a || u === s.b) && new Set(s.away).size === s.away.length,
  },

  transitions: {
    "only the two act": (p, n, _a, m, ctx) => p === n || ((m.user === p.a || m.user === p.b) && inChat(ctx, m.user)),
    "ready moves only you": (p, n, a, m) =>
      a.t !== "ready" || p === n || n.startAt > 0 || (n.ready.includes(m.user) !== p.ready.includes(m.user) && n.ready.filter((x) => x !== m.user).join() === p.ready.filter((x) => x !== m.user).join()),
    "the round starts when the second one's in": (p, n, a, m) => a.t !== "ready" || p === n || p.startAt > 0 || (n.startAt > 0) === (!p.ready.includes(m.user) && p.ready.length === 1 && !!p.a && !!p.b) && (n.startAt === 0 || n.startAt === Math.max(1, m.time)),
    "stepping away moves only you": (p, n, a, m) => a.t !== "away" || p === n || (n.away.includes(m.user) !== p.away.includes(m.user) && n.startAt === p.startAt),
    "stopping banks the rounds": (p, n, a, m) => a.t !== "stop" || p === n || (n.startAt === 0 && n.done === phaseAt(p, m.time).finished && n.done >= p.done),
    "rounds never go back": (p, n) => n.done >= p.done,
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (s.startAt > 0) return k < 0.7 ? { t: "away" } : k < 0.9 ? { t: "stop" } : { t: "ready" };
    return k < 0.9 ? { t: "ready" } : { t: "away" };
  },

  local: { bursts: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const H = 214;
    const now = state.startAt > 0 ? clock.value : 0;
    const ph = phaseAt(state, now);
    const over = state.done >= state.rounds || ph.phase === "over";
    const inPair = pair(state).includes(me);
    const r = Math.min(64, (W - 40) / 4.4);
    const cy = 112;
    const xs = [W * 0.25, W * 0.75];
    const ids = [state.a, state.b];
    const brk = ph.phase === "break";
    const popE = brk ? (now - state.startAt) % ((state.focus + state.brk) * MIN) - state.focus * MIN : null;
    const pop = popE !== null && popE < 900 ? Math.sin((popE / 900) * Math.PI) * (1 - popE / 900) * 2 : 0;
    const startPop = state.startAt > 0 ? running(state.startAt, 700) : null;
    const sp = startPop !== null ? POP(startPop) : 1;
    const ripe = over ? 1 : ph.phase === "focus" ? 0.05 + ph.frac * 0.95 : brk ? 1 : 0;
    const tick = ph.phase === "focus" ? Math.max(0, 1 - (now % 1000) / 140) * 0.25 : 0;
    const roundNo = Math.min(state.rounds, ph.finished + (over ? 0 : 1));
    const nameOf = (i: number) => (ids[i] === me ? "You" : state.names[i]!);

    const stretch = brk ? (
      <g transform={`translate(${W / 2} ${cy + 6})`}>
        <circle cx={0} cy={-34} r={9} fill={p.cream} stroke={c.text} stroke-width={2} />
        <path d={`M 0 -25 V 12 M 0 12 L -12 34 M 0 12 L 12 34 M 0 -16 L ${-16 - Math.sin(now / 300) * 3} -46 M 0 -16 L ${16 + Math.sin(now / 300) * 3} -46`} fill="none" stroke={c.text} stroke-width={3} stroke-linecap="round" />
      </g>
    ) : null;

    const art = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={over ? `Both tomatoes ripe, ${state.rounds} rounds done` : `Two tomatoes, round ${roundNo} of ${state.rounds}, ${ph.phase === "idle" ? "waiting to start" : ph.phase}`} style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} rx={14} fill={c.wash} />
        <rect x={0} y={cy + r * 0.95} width={W} height={H - cy - r * 0.95} fill={mix(p.wall, c.wash, theme.mode === "dark" ? 0.75 : 0.35)} />
        {ids.map((u, i) => (
          <Tomato
            key={i}
            cx={xs[i]!}
            cy={cy}
            r={r}
            ripe={ripe}
            wilt={state.away.includes(u)}
            pop={pop + tick + (startPop !== null ? (1 - sp) * -1 : 0)}
            theme={theme}
            ring={mix(p.leaf, c.text, 0.25)}
          />
        ))}
        {stretch}
      </svg>
    );

    const timeLabel = over ? "Ripe" : ph.phase === "idle" ? mmss(state.focus * MIN) : mmss(ph.left);

    let status = "";
    let btn: unknown = null;
    if (over) status = "";
    else if (state.startAt === 0) {
      const waiting = ids.filter((u) => u && !state.ready.includes(u));
      status = state.ready.length === 0 ? `Round ${roundNo} of ${state.rounds} · starts when you're both in` : waiting.length && waiting[0] !== me ? `Waiting on ${state.names[ids.indexOf(waiting[0]!)]}` : `${nameOf(ids.indexOf(state.ready[0]!))} ${state.ready[0] === me ? "are" : "is"} in · round ${roundNo} starts with you`;
      if (inPair)
        btn = state.ready.includes(me) ? (
          <Button kind="secondary" onClick={() => dispatch({ t: "ready" })}>
            Not yet
          </Button>
        ) : (
          <Button
            kind="primary"
            onClick={() => {
              haptic("success");
              setLocal({ bursts: local.bursts + 1 });
              dispatch({ t: "ready" });
            }}
          >
            {`Start round ${roundNo}`}
          </Button>
        );
    } else {
      status = brk ? `Break · stretch together · ${mmss(ph.left)}` : `Round ${roundNo} of ${state.rounds} · ${state.away.length ? `${state.away.map((u) => nameOf(ids.indexOf(u))).join(" and ")} stepped away` : "both here"}`;
      if (inPair)
        btn = (
          <>
            <Button kind="deemphasized" onClick={() => dispatch({ t: "stop" })}>
              Stop
            </Button>
            {state.away.includes(me) ? (
              <Button kind="primary" onClick={() => dispatch({ t: "away" })}>
                {"I'm back"}
              </Button>
            ) : (
              <Button kind="secondary" onClick={() => dispatch({ t: "away" })}>
                Step away
              </Button>
            )}
          </>
        );
    }

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.quote ? `${state.quoteBy ? `${state.quoteBy}: ` : ""}"${state.quote}"` : `${state.names[0]} and ${state.names[1]}`} />
        <div style={{ position: "relative", height: H }}>
          {art}
          {ids.map((u, i) => {
            const note = state.startAt === 0 && !over ? state.notes[i] : "";
            const ready = state.ready.includes(u);
            const away = state.away.includes(u);
            const cx = xs[i]!;
            const bw = Math.min(W / 2 - 12, 168);
            return (
              <div key={i}>
                {note ? (
                  <div style={{ position: "absolute", left: Math.max(6, Math.min(W - bw - 6, cx - bw / 2)), top: 8, width: bw, boxSizing: "border-box", padding: "3px 8px", borderRadius: 10, background: c.card, fontSize: 12, lineHeight: "15px", color: c.text, textAlign: "center", maxHeight: 36, overflow: "hidden" }}>{note}</div>
                ) : away ? (
                  <div style={{ position: "absolute", left: cx - 30, top: 14, width: 60, padding: "2px 0", borderRadius: 10, background: c.card, fontSize: 12, lineHeight: "16px", color: c.text, textAlign: "center" }}>brb</div>
                ) : null}
                <div style={{ position: "absolute", left: cx - 34, top: cy - 11, width: 68, padding: "2px 0", borderRadius: 8, background: c.card, fontSize: 17, lineHeight: "20px", fontWeight: 700, color: c.text, textAlign: "center", fontVariantNumeric: "tabular-nums", pointerEvents: "none" }}>{timeLabel}</div>
                {u ? (
                  <div style={{ position: "absolute", left: cx - 60, top: H - 34, width: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, pointerEvents: "none" }}>
                    <span style={{ display: "flex", borderRadius: 99, boxShadow: ready || (state.startAt > 0 && !away) ? `0 0 0 2px ${c.positive}` : "none" }}>
                      <Avatar user={u} size={24} />
                    </span>
                    <span style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, color: c.text, ...ell }}>{fitText(nameOf(i), 80, { size: 13 }).text}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
          {local.bursts > 0 && state.startAt > 0 ? <Burst key={local.bursts} emoji="🍅" /> : null}
        </div>
        <div role="img" aria-label={`${ph.finished} of ${state.rounds} rounds done`} style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
          {Array.from({ length: state.rounds }, (_, i) => {
            const doneR = i < ph.finished;
            const cur = !over && i === ph.finished;
            return (
              <svg key={i} width={22} height={22} viewBox="0 0 22 22" aria-hidden="true">
                <circle cx={11} cy={11} r={9} fill={doneR ? p.red : "none"} stroke={doneR ? p.red : cur ? c.primary : c.divider} stroke-width={2} stroke-dasharray={doneR || cur ? undefined : "3 3"} />
                {doneR ? <path d="M 11 3 v 16 M 3 11 h 16 M 5.5 5.5 l 11 11 M 16.5 5.5 l -11 11" stroke={mix(p.red, p.paper, 0.45)} stroke-width={1.2} /> : null}
              </svg>
            );
          })}
        </div>
        <div style={{ marginTop: 6, minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}>
          {over ? (
            <div style={{ flex: 1, minWidth: 0 }}>
              <Locked detail={state.doneLine || `${state.rounds * state.focus} minutes, together`}>{`${state.rounds} rounds done`}</Locked>
            </div>
          ) : (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>{status}</span>
              {btn as never}
            </>
          )}
        </div>
      </div>
    );
  },
});
