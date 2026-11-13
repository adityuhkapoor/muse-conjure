import { defineApp, clock, Avatar, Burst, Button, CardHeader, fitText, haptic, mix, pal, running, seedOf, spring, springs, tween, userColor, type Ctx, type Theme } from "@muse/app";

// Soup run: a paper grocery bag on the counter and a shelf of the things she's said she likes.
// The runner taps things off the shelf and they drop into the bag; "Drop it off" folds the bag
// shut and his face starts down the road to her door. She taps "Got it" when it's on the mat.

type Params = {
  /** Card title: "Soup run for Maya" */
  title: string;
  /** Who's sick: "Maya" */
  patient: string;
  /** Who's bringing it: "Aditya" */
  runner: string;
  /** What she said: "i have the flu, i'm dying" */
  quote: string;
  /** Where it comes from: "CVS on Elm" */
  store: string;
  /** Her place, the end of the road: "Maya's door" */
  door: string;
  /** When it gets there: "by 6" */
  by: string;
  /** Minutes the run takes */
  minutes: number;
  /** Things she's said she likes, up to 6; inBag: already in the bag */
  items: { label: string; inBag: boolean }[];
};

// @params
const P: Params = {
  title: "Soup run for Maya",
  patient: "Maya",
  runner: "Aditya",
  quote: "i have the flu, i'm dying",
  store: "CVS on Elm",
  door: "Maya's door",
  by: "by 6",
  minutes: 25,
  items: [
    { label: "ginger ale", inBag: true },
    { label: "the spicy ramen", inBag: false },
    { label: "orange Gatorade", inBag: false },
    { label: "the good tissues", inBag: true },
    { label: "congee from Arun's rice cooker", inBag: false },
  ],
};
// @end params

type Item = { label: string; inBag: boolean; at: number };
type State = {
  title: string;
  patient: string;
  runner: string;
  pName: string;
  rName: string;
  quote: string;
  store: string;
  door: string;
  by: string;
  minutes: number;
  items: Item[];
  goAt: number;
  gotAt: number;
};
type Action = { t: "toggle"; i: number } | { t: "go" } | { t: "cancel" } | { t: "got" };
type Local = { bursts: number };
type Kind = "can" | "bottle" | "ramen" | "tissues" | "soup" | "fruit" | "box";

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const DROP = spring(springs.iosBouncy);
const FOLD = tween({ duration: 700, easing: "standard" });
const bagged = (s: State) => s.items.filter((i) => i.inBag).length;
const isRunner = (s: State, u: string) => (s.runner ? u === s.runner : u !== s.patient);
const isPatient = (s: State, u: string) => (s.patient ? u === s.patient : u !== s.runner);

function kindOf(label: string): Kind {
  const l = label.toLowerCase();
  if (/ramen|noodle|pho|udon/.test(l)) return "ramen";
  if (/tissue|kleenex|napkin/.test(l)) return "tissues";
  if (/soup|congee|broth|stew|jook/.test(l)) return "soup";
  if (/gatorade|water|juice|bottle|tea|pedialyte|smoothie/.test(l)) return "bottle";
  if (/ale|soda|coke|sprite|can|seltzer|pop\b/.test(l)) return "can";
  if (/orange|lemon|apple|banana|fruit|clementine/.test(l)) return "fruit";
  return "box";
}

function initState(ctx: Ctx): State {
  const find = (n: string) => ctx.members.find((m) => m.id === n || m.name.toLowerCase() === n.toLowerCase());
  const pm = find(clean(P.patient, 40));
  const patient = pm?.id ?? "";
  const rm = find(clean(P.runner, 40));
  const runner = rm && rm.id !== patient ? rm.id : ctx.members.find((m) => m.id !== patient)?.id ?? "";
  const items = (Array.isArray(P.items) ? P.items : [])
    .map((i) => ({ label: clean(i?.label, 40), inBag: i?.inBag === true, at: 0 }))
    .filter((i) => i.label)
    .slice(0, 6);
  const m = Number.isInteger(P.minutes) && P.minutes >= 1 && P.minutes <= 240 ? P.minutes : 20;
  return {
    title: clean(P.title, 40) || "Soup run",
    patient,
    runner,
    pName: pm?.name ?? (clean(P.patient, 20) || "you"),
    rName: rm?.name ?? (ctx.members.find((x) => x.id === runner)?.name || clean(P.runner, 20) || "Someone"),
    quote: clean(P.quote, 80),
    store: clean(P.store, 24) || "the store",
    door: clean(P.door, 24) || "the door",
    by: clean(P.by, 16),
    minutes: m,
    items: items.length ? items : [{ label: "soup", inBag: false, at: 0 }],
    goAt: 0,
    gotAt: 0,
  };
}

function Thing({ kind, seed, theme }: { kind: Kind; seed: string; theme: Theme }) {
  const p = pal(theme);
  const c = theme.color;
  const hues = [p.red, p.orange, p.green, p.blue, p.purple, p.yellow];
  const hue = hues[seedOf(seed) % hues.length]!;
  const line = mix(c.text, hue, 0.35);
  if (kind === "can")
    return (
      <g>
        <rect x={-11} y={-30} width={22} height={30} rx={4} fill={mix(p.green, p.cream, 0.25)} stroke={line} stroke-width={1.2} />
        <rect x={-11} y={-21} width={22} height={11} fill={p.cream} />
        <ellipse cx={0} cy={-30} rx={11} ry={3} fill={p.plate} stroke={line} stroke-width={1.2} />
      </g>
    );
  if (kind === "bottle")
    return (
      <g>
        <path d="M -5 -42 h 10 v 6 q 8 4 8 12 v 22 q 0 2 -2 2 h -22 q -2 0 -2 -2 v -22 q 0 -8 8 -12 Z" fill={p.orange} stroke={line} stroke-width={1.2} />
        <rect x={-6} y={-46} width={12} height={6} rx={2} fill={p.blue} />
        <rect x={-13} y={-22} width={26} height={10} fill={p.cream} />
      </g>
    );
  if (kind === "ramen")
    return (
      <g>
        <path d="M -17 -30 h 34 l -3 30 h -28 Z" fill={p.red} stroke={line} stroke-width={1.2} />
        <path d="M -12 -20 q 3 -4 6 0 q 3 4 6 0 q 3 -4 6 0 q 3 4 6 0" fill="none" stroke={p.cream} stroke-width={2} stroke-linecap="round" />
        <path d="M -12 -12 q 3 -4 6 0 q 3 4 6 0 q 3 -4 6 0 q 3 4 6 0" fill="none" stroke={p.cream} stroke-width={2} stroke-linecap="round" />
      </g>
    );
  if (kind === "tissues")
    return (
      <g>
        <rect x={-18} y={-24} width={36} height={24} rx={3} fill={p.blue} stroke={line} stroke-width={1.2} />
        <path d="M -8 -24 q 2 -12 8 -8 q 6 -6 8 8 Z" fill={p.plate} stroke={c.divider} stroke-width={1} />
        <circle cx={-9} cy={-10} r={3} fill={p.sky} />
        <circle cx={8} cy={-8} r={4} fill={p.sky} />
      </g>
    );
  if (kind === "soup")
    return (
      <g>
        <path d="M -16 -24 h 32 l -3 24 h -26 Z" fill={p.plate} stroke={line} stroke-width={1.2} />
        <rect x={-18} y={-29} width={36} height={6} rx={3} fill={hue} />
        <path d="M -6 -34 q -3 -4 0 -8 M 4 -34 q 3 -4 0 -8" fill="none" stroke={c.secondaryText} stroke-width={1.5} stroke-linecap="round" />
      </g>
    );
  if (kind === "fruit" && /banana/i.test(seed))
    return (
      <g>
        <path d="M -16 -22 q 4 22 30 16 q -4 -4 -2 -8 q -18 4 -22 -12 Z" fill={p.yellow} stroke={line} stroke-width={1.2} />
        <rect x={-18} y={-26} width={4} height={6} rx={1} fill={p.leaf} />
      </g>
    );
  if (kind === "fruit")
    return (
      <g>
        <circle cx={0} cy={-13} r={13} fill={p.orange} stroke={line} stroke-width={1.2} />
        <path d="M 0 -26 q 6 -6 10 -2 q -6 4 -10 2" fill={p.leaf} />
      </g>
    );
  return (
    <g>
      <rect x={-15} y={-30} width={30} height={30} rx={3} fill={hue} stroke={line} stroke-width={1.2} />
      <rect x={-10} y={-20} width={20} height={9} rx={2} fill={p.cream} />
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Soup run",
  summary: (s) =>
    s.gotAt > 0
      ? `${s.pName} got the bag · ${bagged(s)} things`
      : s.goAt > 0
        ? `${s.rName} is on the way to ${s.pName} with ${bagged(s)} things${s.by ? ` · ${s.by}` : ""}`
        : `${s.rName} is packing a bag for ${s.pName} · ${bagged(s)} of ${s.items.length} in`,
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "toggle") {
      if (!isRunner(s, u) || s.goAt > 0 || !Number.isInteger(a.i) || a.i < 0 || a.i >= s.items.length) return s;
      return { ...s, items: s.items.map((it, i) => (i === a.i ? { ...it, inBag: !it.inBag, at: meta.time } : it)) };
    }
    if (a.t === "go") {
      if (!isRunner(s, u) || s.goAt > 0 || bagged(s) === 0) return s;
      return { ...s, goAt: Math.max(1, meta.time) };
    }
    if (a.t === "cancel") {
      if (!isRunner(s, u) || s.goAt === 0 || s.gotAt > 0) return s;
      return { ...s, goAt: 0 };
    }
    if (a.t === "got") {
      if (!isPatient(s, u) || s.goAt === 0 || s.gotAt > 0) return s;
      return { ...s, gotAt: Math.max(1, meta.time) };
    }
    return s;
  },

  invariants: {
    "a run starts with something in the bag": (s) => s.goAt === 0 || bagged(s) > 0,
    "it arrives only after it leaves": (s) => s.gotAt === 0 || s.goAt > 0,
    "up to six things": (s) => s.items.length >= 1 && s.items.length <= 6 && s.items.every((i) => typeof i.inBag === "boolean"),
    "runner and patient differ": (s) => s.runner === "" || s.runner !== s.patient,
  },

  transitions: {
    "only the runner packs": (p, n, a, m) => a.t !== "toggle" || p === n || (isRunner(p, m.user) && p.goAt === 0),
    "a tap moves one thing": (p, n, a) =>
      a.t !== "toggle" || p === n || (n.items.filter((it, i) => it.inBag !== p.items[i]!.inBag).length === 1 && n.items[a.i]!.inBag !== p.items[a.i]!.inBag),
    "the bag stays shut on the road": (p, n) => p.goAt === 0 || p.items.every((it, i) => it.inBag === n.items[i]!.inBag),
    "only the runner leaves or turns back": (p, n, a, m) => (a.t !== "go" && a.t !== "cancel") || p === n || isRunner(p, m.user),
    "leaving stamps the time": (p, n, a, m) => a.t !== "go" || p === n || (p.goAt === 0 && n.goAt === Math.max(1, m.time) && bagged(p) > 0),
    "only she says she got it": (p, n, a, m) => a.t !== "got" || p === n || (isPatient(p, m.user) && p.gotAt === 0 && n.gotAt === Math.max(1, m.time) && p.goAt > 0),
    "a delivered bag stays delivered": (p, n) => p.gotAt === 0 || (n.gotAt === p.gotAt && n.goAt === p.goAt),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, u, r) => {
    const k = r.next();
    if (s.goAt > 0) return k < 0.6 ? { t: "got" } : k < 0.85 ? { t: "cancel" } : { t: "toggle", i: r.int(s.items.length) };
    if (k < 0.6) return { t: "toggle", i: r.int(s.items.length) };
    if (k < 0.9) return { t: "go" };
    return { t: "got" };
  },

  local: { bursts: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const dark = theme.mode === "dark";
    const H = 196;
    const runner = isRunner(state, me);
    const patient = isPatient(state, me) && !runner;
    const going = state.goAt > 0;
    const got = state.gotAt > 0;
    const n = state.items.length;
    const perRow = 3;
    const shelfW = Math.min(250, W - 122);
    const cellW = shelfW / perRow;
    const rowY = n > 3 ? [70, 160] : [116];
    const bagW = Math.min(104, W - shelfW - 14);
    const bagX = shelfW + 10 + (W - shelfW - 10 - bagW) / 2;
    const bagTop = 92;
    const bagBot = H - 8;
    const fold = going ? FOLD(running(state.goAt, 700) ?? 700) : 0;
    const now = going && !got ? clock.value : 0;
    const prog = got ? 1 : going ? Math.min(1, Math.max(0, (now - state.goAt) / (state.minutes * 60000))) : 0;
    const left = going && !got ? Math.max(0, Math.ceil(state.minutes * (1 - prog))) : 0;
    const shelfPos = (i: number) => ({ x: (i % perRow) * cellW + cellW / 2, y: rowY[Math.floor(i / perRow)]! });
    const inBag = state.items.map((it, i) => ({ it, i })).filter((x) => x.it.inBag);
    const bagPos = (k: number) => {
      const m = inBag.length;
      const span = bagW - 60;
      return { x: bagX + 30 + (m <= 1 ? span / 2 : (span * k) / (m - 1)), y: bagTop + 10 + (k % 2) * 8 };
    };
    const bagC = dark ? p.crust : mix(p.crust, p.cream, 0.35);
    const bagLine = mix(p.brown, c.text, 0.2);
    const rName = state.runner === me ? "You" : state.rName;

    const flying = (i: number, from: { x: number; y: number }, to: { x: number; y: number }, at: number) => {
      const e = at > 0 ? running(at, 800) : null;
      if (e === null) return to;
      const t = DROP(e);
      const arc = Math.sin(Math.min(1, e / 500) * Math.PI) * 30;
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - arc };
    };

    const art = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${bagged(state)} of ${n} things in the bag for ${state.pName}`} style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} rx={14} fill={c.wash} />
        {/* shelves */}
        {rowY.slice(0, n > perRow ? 2 : 1).map((y, r) => (
          <g key={r}>
            <rect x={6} y={y} width={shelfW - 6} height={7} rx={2} fill={p.brown} />
          </g>
        ))}
        {/* empty spots on the shelf */}
        {state.items.map((it, i) => {
          const s = shelfPos(i);
          return it.inBag ? <rect key={`e${i}`} x={s.x - 20} y={s.y - 44} width={40} height={44} rx={6} fill="none" stroke={c.secondaryText} stroke-width={1.2} stroke-dasharray="3 4" /> : null;
        })}
        {/* the bag, back */}
        <path d={`M ${bagX + 6} ${bagTop} h ${bagW - 12} l -4 -10 h ${-(bagW - 20)} Z`} fill={mix(bagC, c.text, 0.18)} />
        {/* things in the bag (peeking out) */}
        <g>
          {fold >= 0.9 ? null : inBag.map(({ it, i }, k) => {
            const to = bagPos(k);
            const pos = going ? to : flying(i, shelfPos(i), to, it.at);
            return (
              <g key={`b${i}`} transform={`translate(${pos.x.toFixed(1)} ${(pos.y + fold * 26).toFixed(1)})`}>
                <g transform="scale(1.25)"><Thing kind={kindOf(it.label)} seed={it.label} theme={theme} /></g>
              </g>
            );
          })}
        </g>
        {/* the bag, front */}
        <path d={`M ${bagX} ${bagTop} L ${bagX + bagW} ${bagTop} L ${bagX + bagW - 6} ${bagBot} L ${bagX + 6} ${bagBot} Z`} fill={bagC} stroke={bagLine} stroke-width={1.5} />
        <path d={`M ${bagX + 10} ${bagTop} l 6 10 l 6 -10 l 6 10 l 6 -10 l 6 10 l 6 -10 l 6 10 l 6 -10 l 6 10 l 6 -10 l 6 10 l 6 -10 l 6 10 l 6 -10 l 6 10`} fill="none" stroke={mix(bagC, c.text, 0.2)} stroke-width={1} />
        {fold > 0 ? (
          <path d={`M ${bagX - 2} ${bagTop - 28 * (1 - fold)} L ${bagX + bagW + 2} ${bagTop - 28 * (1 - fold)} L ${bagX + bagW} ${bagTop + 18} L ${bagX} ${bagTop + 18} Z`} fill={mix(bagC, c.text, 0.1)} stroke={bagLine} stroke-width={1.5} />
        ) : null}
        {/* things on the shelf */}
        {state.items.map((it, i) => {
          if (it.inBag) return null;
          const s = shelfPos(i);
          const e = it.at > 0 ? running(it.at, 500) : null;
          const lift = e === null ? 0 : -12 * Math.sin((e / 500) * Math.PI);
          return (
            <g key={`s${i}`} transform={`translate(${s.x} ${s.y + lift})`}>
              <g transform="scale(1.25)"><Thing kind={kindOf(it.label)} seed={it.label} theme={theme} /></g>
            </g>
          );
        })}
        {got ? <path d={`M ${bagX + bagW / 2 - 9} ${bagTop + 80} c -10 -10 0 -20 9 -10 c 9 -10 19 0 9 10 l -9 9 Z`} fill={p.red} /> : null}
      </svg>
    );

    const roadY = 26;
    const x0 = 30;
    const x1 = W - 26;
    const dotX = x0 + (x1 - x0) * prog;
    const road = (
      <div style={{ position: "relative", height: 56, marginTop: 8 }}>
        <svg width={W} height={56} viewBox={`0 0 ${W} 56`} role="img" aria-label={got ? `Delivered to ${state.door}` : going ? `On the way, about ${left} minutes out` : `Not left yet`} style={{ display: "block" }}>
          <line x1={x0} y1={roadY} x2={x1} y2={roadY} stroke={c.divider} stroke-width={6} stroke-linecap="round" />
          <line x1={x0} y1={roadY} x2={dotX} y2={roadY} stroke={state.runner ? userColor(state.runner, theme) : c.primary} stroke-width={6} stroke-linecap="round" />
          <line x1={x0 + 10} y1={roadY} x2={x1 - 10} y2={roadY} stroke={c.card} stroke-width={1.2} stroke-dasharray="4 6" />
          <g transform={`translate(${x0} ${roadY})`}>
            <rect x={-14} y={-20} width={28} height={18} rx={2} fill={p.plate} stroke={c.secondaryText} stroke-width={1.2} />
            <path d="M -16 -20 h 32 l -3 -6 h -26 Z" fill={p.red} />
          </g>
          <g transform={`translate(${x1} ${roadY})`}>
            <path d="M -14 -4 v -14 l 14 -10 l 14 10 v 14 Z" fill={p.wall} stroke={c.secondaryText} stroke-width={1.2} />
            <rect x={-4} y={-14} width={8} height={10} rx={1} fill={got ? p.yellow : mix(p.brown, p.wall, 0.3)} />
          </g>
        </svg>
        <div style={{ position: "absolute", left: 0, top: 38, width: W / 2 - 4, fontSize: 12, lineHeight: "16px", color: c.secondaryText, ...ell }}>{state.store}</div>
        <div style={{ position: "absolute", right: 0, top: 38, width: W / 2 - 4, textAlign: "right", fontSize: 12, lineHeight: "16px", color: c.secondaryText, ...ell }}>{state.by ? `${state.door} · ${state.by}` : state.door}</div>
        {state.runner ? (
          <div style={{ position: "absolute", left: Math.max(0, Math.min(W - 28, dotX - 14)), top: roadY - 14, display: "flex", borderRadius: 99, boxShadow: `0 0 0 2px ${c.card}`, pointerEvents: "none" }}>
            <Avatar user={state.runner} size={28} />
          </div>
        ) : null}
      </div>
    );

    const status = got
      ? `${state.pName === "you" || state.patient === me ? "You" : state.pName} got it · feel better`
      : going
        ? prog >= 1
          ? `${rName === "You" ? "You're" : `${rName}'s`} at the door`
          : `${rName === "You" ? "You're" : `${rName}'s`} on the way · about ${left} min`
        : runner
          ? `Tap things to pack them · ${bagged(state)} in the bag`
          : `${rName} is packing your bag · ${bagged(state)} in so far`;

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.quote ? `${state.pName}: "${state.quote}"` : undefined} />
        <div style={{ position: "relative", height: H }}>
          {art}
          {state.items.map((it, i) => {
            const s = shelfPos(i);
            const f = fitText(it.label, cellW - 4, { size: 12, min: 10 });
            return (
              <button
                key={i}
                type="button"
                aria-label={it.inBag ? `Take ${it.label} out of the bag` : `Pack ${it.label}`}
                aria-pressed={it.inBag}
                onClick={() => {
                  if (!runner || going) return;
                  haptic("light");
                  dispatch({ t: "toggle", i });
                }}
                style={{ position: "absolute", left: s.x - cellW / 2 + 1, top: s.y - 50, width: cellW - 2, height: 74, padding: 0, border: 0, background: "transparent", cursor: runner && !going ? "pointer" : "default", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
              >
                <span style={{ fontSize: f.size, lineHeight: "14px", color: it.inBag ? c.secondaryText : c.text, background: c.wash, whiteSpace: "nowrap", padding: "0 2px" }}>{f.text}</span>
              </button>
            );
          })}
          <div style={{ position: "absolute", left: bagX + 10, top: bagTop + 44, width: bagW - 20, textAlign: "center", fontSize: 13, lineHeight: "16px", fontWeight: 700, fontStyle: "italic", color: dark ? c.wash : c.text, background: bagC, pointerEvents: "none", ...ell }}>{`for ${state.patient === me ? "you" : state.pName}`}</div>
          {local.bursts > 0 && got ? <Burst key={local.bursts} emoji="🫶" /> : null}
        </div>
        {road}
        <div style={{ marginTop: 6, minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>{status}</span>
          {runner && !going ? (
            <Button
              kind="primary"
              disabled={bagged(state) === 0}
              onClick={() => {
                haptic("success");
                dispatch({ t: "go" });
              }}
            >
              Drop it off
            </Button>
          ) : runner && going && !got ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "cancel" })}>
              Undo
            </Button>
          ) : patient && going && !got ? (
            <Button
              kind="primary"
              onClick={() => {
                haptic("success");
                setLocal({ bursts: local.bursts + 1 });
                dispatch({ t: "got" });
              }}
            >
              Got it
            </Button>
          ) : null}
        </div>
      </div>
    );
  },
});
