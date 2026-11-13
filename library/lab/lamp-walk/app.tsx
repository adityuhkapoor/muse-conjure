import { defineApp, clock, Avatar, Burst, Button, CardHeader, haptic, mix, pal, running, spring, springs, tween, userColor, type Ctx, type Theme } from "@muse/app";

// Lamp walk: a night street from the library to her place with a row of lamp posts. Each lamp
// lights as she passes it, so the friend on the other end sees how far she is without a map.
// "I'm home" lights her window and ends it. If a stretch takes much longer than usual, it quietly
// offers him a "You ok?" and her an "I'm ok".

type Params = {
  /** Card title: "Walking home" */
  title: string;
  /** Who's walking: "Maya" */
  walker: string;
  /** Who's keeping her company: "Aditya" */
  watcher: string;
  /** What she said, in her words */
  quote: string;
  /** What he said back, in his words */
  reply: string;
  /** Where it starts: "Fenwick" */
  from: string;
  /** Where it ends: "Maya's place" */
  to: string;
  /** The time it started, as said: "1:05am" */
  time: string;
  /** Lamp posts on the way, 4 to 14 */
  lamps: number;
  /** How many minutes the walk usually takes */
  usualMin: number;
  /** Lamps already passed */
  passed: number;
};

// @params
const P: Params = {
  title: "Walking home",
  walker: "Maya",
  watcher: "Aditya",
  quote: "leaving fenwick, walking home, talk to me",
  reply: "lowkey here. tell me about the orgo set",
  from: "Fenwick",
  to: "Maya's place",
  time: "1:05am",
  lamps: 11,
  usualMin: 12,
  passed: 4,
};
// @end params

type State = {
  title: string;
  walker: string;
  watcher: string;
  wName: string;
  hName: string;
  quote: string;
  reply: string;
  from: string;
  to: string;
  time: string;
  lamps: number;
  usual: number;
  passed: number;
  stepAt: number;
  homeAt: number;
  pingAt: number;
  okAt: number;
};
type Action = { t: "step" } | { t: "home" } | { t: "ping" } | { t: "ok" };
type Local = { bursts: number };

const MIN = 60000;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const WALK = tween({ duration: 900, easing: "easeInOut" });
const GLOW = spring(springs.iosBouncy);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const isWalker = (s: State, u: string) => (s.walker ? u === s.walker : u !== s.watcher);
const isWatcher = (s: State, u: string) => !isWalker(s, u);
const pinged = (s: State) => s.pingAt > 0 && s.okAt < s.pingAt;

function initState(ctx: Ctx): State {
  const find = (n: unknown) => {
    const x = clean(n, 40).toLowerCase();
    return x ? ctx.members.find((m) => m.id === x || m.name.toLowerCase() === x) : undefined;
  };
  const wm = find(P.walker);
  const walker = wm?.id ?? ctx.members[0]?.id ?? "";
  const hm = find(P.watcher);
  const watcher = hm && hm.id !== walker ? hm.id : ctx.members.find((m) => m.id !== walker)?.id ?? "";
  const lamps = Number.isInteger(P.lamps) && P.lamps >= 4 && P.lamps <= 14 ? P.lamps : 10;
  const passed = Number.isInteger(P.passed) && P.passed >= 0 && P.passed < lamps ? P.passed : 0;
  return {
    title: clean(P.title, 40) || "Walking home",
    walker,
    watcher,
    wName: wm?.name ?? ctx.members.find((m) => m.id === walker)?.name ?? (clean(P.walker, 20) || "Her"),
    hName: hm?.name ?? ctx.members.find((m) => m.id === watcher)?.name ?? (clean(P.watcher, 20) || "Him"),
    quote: clean(P.quote, 70),
    reply: clean(P.reply, 70),
    from: clean(P.from, 20) || "Here",
    to: clean(P.to, 24) || "Home",
    time: clean(P.time, 10),
    lamps,
    usual: Number.isInteger(P.usualMin) && P.usualMin >= 2 && P.usualMin <= 120 ? P.usualMin : 12,
    passed,
    stepAt: 0,
    homeAt: 0,
    pingAt: 0,
    okAt: 0,
  };
}

function Lamp({ x, ground, lit, glow, theme }: { x: number; ground: number; lit: boolean; glow: number; theme: Theme }) {
  const p = pal(theme);
  const c = theme.color;
  const top = ground - 64;
  const post = theme.mode === "dark" ? mix(c.secondaryText, c.wash, 0.3) : mix(p.dark, c.secondaryText, 0.3);
  return (
    <g>
      {lit ? <path d={`M ${x - 4} ${top + 6} L ${x - 22 * glow} ${ground} L ${x + 22 * glow} ${ground} L ${x + 4} ${top + 6} Z`} fill={p.yellow} opacity={0.28} /> : null}
      {lit ? <ellipse cx={x} cy={ground} rx={24 * glow} ry={4} fill={p.yellow} opacity={0.4} /> : null}
      <rect x={x - 1.5} y={top} width={3} height={64} fill={post} />
      <rect x={x - 5} y={ground - 3} width={10} height={4} rx={1} fill={post} />
      <path d={`M ${x - 6} ${top + 6} L ${x - 4} ${top - 4} L ${x + 4} ${top - 4} L ${x + 6} ${top + 6} Z`} fill={lit ? p.yellow : mix(post, p.paper, 0.25)} stroke={post} stroke-width={1} />
      {lit ? <circle cx={x} cy={top + 1} r={9 * glow} fill={p.yellow} opacity={0.3} /> : null}
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Lamp walk",
  summary: (s) =>
    s.homeAt > 0 ? `${s.wName} is home` : `${s.wName} is walking to ${s.to} · ${s.passed} of ${s.lamps} lamps${pinged(s) ? ` · ${s.hName} asked if she's ok` : ""}`,
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u) || s.homeAt > 0) return s;
    if (a.t === "step") {
      if (!isWalker(s, u) || s.passed >= s.lamps - 1) return s;
      return { ...s, passed: s.passed + 1, stepAt: meta.time, okAt: pinged(s) ? Math.max(s.pingAt, meta.time) : s.okAt };
    }
    if (a.t === "home") {
      if (!isWalker(s, u)) return s;
      return { ...s, passed: s.lamps, stepAt: meta.time, homeAt: Math.max(1, meta.time), okAt: pinged(s) ? Math.max(s.pingAt, meta.time) : s.okAt };
    }
    if (a.t === "ping") {
      if (!isWatcher(s, u) || pinged(s)) return s;
      return { ...s, pingAt: Math.max(1, meta.time, s.okAt + 1) };
    }
    if (a.t === "ok") {
      if (!isWalker(s, u) || !pinged(s)) return s;
      return { ...s, okAt: Math.max(s.pingAt, meta.time) };
    }
    return s;
  },

  invariants: {
    "lamps light in order, up to home": (s) => Number.isInteger(s.passed) && s.passed >= 0 && s.passed <= s.lamps,
    "all lamps lit means home": (s) => (s.passed === s.lamps) === (s.homeAt > 0),
    "an answer comes after the question": (s) => s.okAt === 0 || s.pingAt > 0,
    "walker and watcher differ": (s) => s.walker === "" || s.walker !== s.watcher,
  },

  transitions: {
    "only the walker moves": (p, n, _a, m) => n.passed === p.passed || isWalker(p, m.user),
    "a step lights the next lamp": (p, n, a, m) => a.t !== "step" || p === n || (n.passed === p.passed + 1 && n.stepAt === m.time && n.homeAt === 0),
    "home lights them all": (p, n, a, m) => a.t !== "home" || p === n || (n.passed === n.lamps && n.homeAt === Math.max(1, m.time)),
    "only the watcher asks": (p, n, a, m) => a.t !== "ping" || p === n || (isWatcher(p, m.user) && !pinged(p) && n.pingAt === Math.max(1, m.time, p.okAt + 1) && pinged(n)),
    "only the walker answers": (p, n, a, m) => a.t !== "ok" || p === n || (isWalker(p, m.user) && pinged(p) && !pinged(n)),
    "home is the end": (p, n) => p.homeAt === 0 || p === n,
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.55) return { t: "step" };
    if (k < 0.75) return { t: "ping" };
    if (k < 0.92) return { t: "ok" };
    return { t: "home" };
  },

  local: { bursts: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const H = 206;
    const dark = theme.mode === "dark";
    const home = state.homeAt > 0;
    const walker = isWalker(state, me);
    const now = !home && state.stepAt > 0 ? clock.value : 0;
    const per = (state.usual * MIN) / state.lamps;
    const late = !home && state.stepAt > 0 && now - state.stepAt > Math.max(3 * MIN, per * 3);
    const asked = pinged(state);
    const night = dark ? mix(p.blue, c.wash, 0.74) : mix(p.blue, c.text, 0.66);
    const ground = 168;
    const x0 = 64;
    const x1 = W - 56;
    const lx = (i: number) => x0 + ((x1 - x0) * (i + 0.5)) / state.lamps;
    const e = state.stepAt > 0 ? running(state.stepAt, 900) : null;
    const walkT = e === null ? 1 : WALK(e);
    const posOf = (n: number) => (n <= 0 ? x0 - 6 : n >= state.lamps ? x1 + 16 : lx(n - 1) + 10);
    const fx = posOf(state.passed - 1) + (posOf(state.passed) - posOf(state.passed - 1)) * walkT;
    const bob = e !== null ? Math.abs(Math.sin(e / 110)) * 3 : 0;
    const left = Math.max(0, Math.round(((state.lamps - state.passed) * state.usual) / state.lamps));
    const glowE = state.stepAt > 0 ? running(state.stepAt, 800) : null;
    const wName = state.walker === me ? "You" : state.wName;
    const winLit = home ? Math.min(1, GLOW(running(state.homeAt, 900) ?? 900)) : 0;

    const stars = Array.from({ length: 18 }, (_, i) => {
      const sx = ((i * 97) % 100) / 100;
      const sy = ((i * 53) % 60) / 100;
      return <circle key={i} cx={(sx * W).toFixed(1)} cy={(10 + sy * 90).toFixed(1)} r={i % 3 === 0 ? 1.4 : 0.9} fill={p.cream} />;
    });

    const art = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={home ? `${state.wName} is home, all ${state.lamps} lamps lit` : `${state.passed} of ${state.lamps} lamps lit between ${state.from} and ${state.to}`} style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} rx={14} fill={night} />
        {stars}
        <circle cx={W - 84} cy={76} r={12} fill={p.cream} />
        <circle cx={W - 78} cy={72} r={10} fill={night} />
        {/* library */}
        <path d={`M 4 ${ground} V 92 L 32 76 L 60 92 V ${ground} Z`} fill={mix(p.wall, night, 0.45)} />
        {[12, 24, 36, 48].map((x) => (
          <rect key={x} x={x} y={100} width={5} height={ground - 104} fill={mix(p.paper, night, 0.35)} />
        ))}
        <rect x={20} y={110} width={20} height={14} rx={2} fill={p.yellow} />
        {/* her place */}
        <path d={`M ${W - 52} ${ground} V 112 L ${W - 28} 92 L ${W - 4} 112 V ${ground} Z`} fill={mix(p.red, night, 0.45)} />
        <rect x={W - 38} y={120} width={20} height={16} rx={2} fill={home ? mix(night, p.yellow, winLit) : mix(night, p.dark, 0.3)} stroke={mix(p.paper, night, 0.5)} stroke-width={1.5} />
        <rect x={W - 33} y={ground - 22} width={11} height={22} rx={1} fill={mix(p.brown, night, 0.3)} />
        {/* street */}
        <rect x={0} y={ground} width={W} height={H - ground} fill={mix(night, dark ? c.wash : c.text, 0.35)} />
        <path d={`M 0 ${ground} H ${W} V ${H - 14} q 0 14 -14 14 H 14 q -14 0 -14 -14 Z`} fill={mix(night, dark ? c.wash : c.text, 0.35)} />
        <line x1={6} y1={ground + 18} x2={W - 6} y2={ground + 18} stroke={mix(p.paper, night, 0.6)} stroke-width={2} stroke-dasharray="10 10" />
        {Array.from({ length: state.lamps }, (_, i) => {
          const lit = i < state.passed;
          const fresh = i === state.passed - 1 && glowE !== null;
          return <Lamp key={i} x={lx(i)} ground={ground} lit={lit} glow={fresh ? GLOW(glowE!) : 1} theme={theme} />;
        })}
        {/* her */}
        {!home ? (
          <g transform={`translate(${fx.toFixed(1)} ${(ground - bob).toFixed(1)})`}>
            <path d={`M -5 -2 L ${(-3 + bob).toFixed(1)} -16 M 5 -2 L ${(3 - bob).toFixed(1)} -16`} stroke={p.cream} stroke-width={3} stroke-linecap="round" />
            <path d="M -9 -14 Q -10 -34 0 -34 Q 10 -34 9 -14 Z" fill={state.walker ? userColor(state.walker, theme) : p.cream} stroke={p.cream} stroke-width={1} />
          </g>
        ) : null}
      </svg>
    );

    const bubble = (who: string, text: string, side: "l" | "r") =>
      text ? (
        <div style={{ position: "absolute", top: side === "l" ? 50 : 8, [side === "l" ? "left" : "right"]: 8, maxWidth: W * 0.62, display: "flex", gap: 6, alignItems: "flex-start", flexDirection: side === "l" ? "row" : "row-reverse", pointerEvents: "none" }}>
          {who ? <Avatar user={who} size={22} /> : null}
          <span style={{ minWidth: 0, padding: "4px 9px", borderRadius: 14, background: side === "l" ? c.card : c.primary, color: side === "l" ? c.text : c.onPrimary, fontSize: 12, lineHeight: "16px", maxHeight: 40, overflow: "hidden" }}>{text}</span>
        </div>
      ) : null;

    let status = "";
    let btns: unknown = null;
    if (home) {
      status = `${wName === "You" ? "You're" : `${state.wName}'s`} home · window's on`;
    } else if (walker) {
      status = asked ? `${state.hName} asked if you're ok` : `${state.passed} of ${state.lamps} lamps · about ${left} min to go`;
      btns = asked ? (
        <>
          <Button kind="secondary" onClick={() => dispatch({ t: "home" })}>
            {"I'm home"}
          </Button>
          <Button kind="primary" onClick={() => dispatch({ t: "ok" })}>
            {"I'm ok"}
          </Button>
        </>
      ) : (
        <>
          <Button
            kind={state.passed >= state.lamps - 1 ? "primary" : "secondary"}
            onClick={() => {
              haptic("success");
              setLocal({ bursts: local.bursts + 1 });
              dispatch({ t: "home" });
            }}
          >
            {"I'm home"}
          </Button>
          {state.passed < state.lamps - 1 ? (
            <Button
              kind="primary"
              onClick={() => {
                haptic("light");
                dispatch({ t: "step" });
              }}
            >
              Passed a lamp
            </Button>
          ) : null}
        </>
      );
    } else {
      status = asked ? `Asked · waiting on ${state.wName}` : late ? "Taking longer than usual" : `${state.wName} is ${state.passed} lamps along · about ${left} min to go`;
      btns = asked ? null : (
        <Button kind={late ? "primary" : "secondary"} onClick={() => dispatch({ t: "ping" })}>
          You ok?
        </Button>
      );
    }

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${state.from} to ${state.to}${state.time ? ` · ${state.time}` : ""}`} />
        <div style={{ position: "relative", height: H }}>
          {art}
          {bubble(state.watcher, state.reply, "r")}
          {bubble(state.walker, state.quote, "l")}
          {!home && state.walker ? (
            <div style={{ position: "absolute", left: fx - 12, top: ground - bob - 56, display: "flex", borderRadius: 99, boxShadow: `0 0 0 2px ${p.cream}`, pointerEvents: "none" }}>
              <Avatar user={state.walker} size={24} />
            </div>
          ) : null}
          {asked && !home ? (
            <div style={{ position: "absolute", left: Math.max(4, Math.min(W - 124, fx + 14)), top: ground - 74, width: 120, textAlign: "left", pointerEvents: "none" }}>
              <span style={{ padding: "3px 8px", borderRadius: 12, background: c.card, color: c.text, fontSize: 12, lineHeight: "16px", fontWeight: 600 }}>You ok?</span>
            </div>
          ) : null}
          <div style={{ position: "absolute", left: 4, top: ground + 24, fontSize: 12, lineHeight: "14px", fontWeight: 600, color: c.text, background: c.card, padding: "1px 6px", borderRadius: 6, maxWidth: W / 2 - 12, ...ell }}>{state.from}</div>
          <div style={{ position: "absolute", right: 4, top: ground + 24, fontSize: 12, lineHeight: "14px", fontWeight: 600, color: c.text, background: c.card, padding: "1px 6px", borderRadius: 6, maxWidth: W / 2 - 12, ...ell }}>{state.to}</div>
          {home && state.walker ? (
            <div style={{ position: "absolute", left: W - 37, top: 119, display: "flex", borderRadius: 99, transform: `scale(${winLit.toFixed(2)})`, pointerEvents: "none" }}>
              <Avatar user={state.walker} size={18} />
            </div>
          ) : null}
          {local.bursts > 0 && home ? <Burst key={local.bursts} emoji="🏠" /> : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>{status}</span>
          {btns as never}
        </div>
      </div>
    );
  },
});
