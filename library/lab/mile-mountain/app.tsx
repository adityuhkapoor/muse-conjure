import { defineApp, Avatar, Burst, Button, CardHeader, fitText, haptic, mix, pal, running, spring, springs, userColor, type Ctx, type Theme } from "@muse/app";

// Mile mountain: two runners training for the same race climb one mountain, one switchback trail
// each. Every logged run moves your climber up your trail; flags mark the long runs; race day is the
// summit. Whoever's ahead can send the one behind a gentle "Sat long run?" from the trail.

type Params = {
  /** Card title: "Road to the Eastfield half" */
  title: string;
  /** Race day, at the summit: "Sun Apr 12" */
  race: string;
  /** Plan miles from start to summit */
  goal: number;
  /** The two runners, left trail first: name, miles logged so far, their last log in their words */
  runners: { name: string; miles: number; note: string }[];
  /** Long runs flagged on both trails, at a total miles mark */
  flags: { label: string; miles: number }[];
  /** The nudge the one ahead can send */
  nudge: string;
  /** Who already got the nudge, or "" */
  nudged: string;
};

// @params
const P: Params = {
  title: "Road to the Eastfield half",
  race: "Sun Apr 12",
  goal: 120,
  runners: [
    { name: "Arun", miles: 41, note: "5 easy. rice cooker oatmeal powered" },
    { name: "Maya", miles: 53, note: "8 at Lake Wren. spreadsheet updated" },
  ],
  flags: [
    { label: "6", miles: 30 },
    { label: "8", miles: 55 },
    { label: "10", miles: 80 },
    { label: "12", miles: 100 },
  ],
  nudge: "Sat long run?",
  nudged: "Arun",
};
// @end params

type Log = { u: string; tenths: number; at: number };
type State = {
  title: string;
  race: string;
  goal: number;
  a: string;
  b: string;
  names: [string, string];
  base: [number, number];
  notes: [string, string];
  flags: { label: string; tenths: number }[];
  logs: Log[];
  nudgeText: string;
  nudged: string;
  nudgeAt: number;
};
type Action = { t: "log"; tenths: number } | { t: "undo" } | { t: "nudge" };
type Local = { miles: number; bursts: number };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const CLIMB = spring(springs.ios);
const GAP = 50;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const sideOf = (s: State, u: string) => (u && u === s.a ? 0 : u && u === s.b ? 1 : -1);
const total = (s: State, i: number) => s.base[i]! + s.logs.filter((l) => sideOf(s, l.u) === i).reduce((n, l) => n + l.tenths, 0);
const mi = (t: number) => (t % 10 === 0 ? `${t / 10}` : (t / 10).toFixed(1));
const behind = (s: State) => {
  const x = total(s, 0);
  const y = total(s, 1);
  return x + GAP <= y ? 0 : y + GAP <= x ? 1 : -1;
};

function initState(ctx: Ctx): State {
  const rs = Array.isArray(P.runners) ? P.runners : [];
  const find = (n: unknown) => {
    const x = clean(n, 40).toLowerCase();
    return x ? ctx.members.find((m) => m.id === x || m.name.toLowerCase() === x) : undefined;
  };
  const ma = find(rs[0]?.name);
  const a = ma?.id ?? ctx.members[0]?.id ?? "";
  const mb = find(rs[1]?.name);
  const b = mb && mb.id !== a ? mb.id : ctx.members.find((m) => m.id !== a)?.id ?? "";
  const goal = Number.isFinite(P.goal) && P.goal >= 5 && P.goal <= 2000 ? Math.round(P.goal * 10) : 1000;
  const tenths = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(goal, Math.round(v * 10)) : 0);
  const nm = (id: string, fb: unknown) => ctx.members.find((m) => m.id === id)?.name ?? (clean(fb, 20) || "Runner");
  const flags = (Array.isArray(P.flags) ? P.flags : [])
    .map((f) => ({ label: clean(f?.label, 8), tenths: tenths(f?.miles) }))
    .filter((f) => f.label && f.tenths > 0 && f.tenths < goal)
    .slice(0, 6);
  const s: State = {
    title: clean(P.title, 40) || "Mile mountain",
    race: clean(P.race, 24) || "Race day",
    goal,
    a,
    b,
    names: [nm(a, rs[0]?.name), nm(b, rs[1]?.name)],
    base: [tenths(rs[0]?.miles), tenths(rs[1]?.miles)],
    notes: [clean(rs[0]?.note, 60), clean(rs[1]?.note, 60)],
    flags,
    logs: [],
    nudgeText: clean(P.nudge, 24) || "Run this weekend?",
    nudged: "",
    nudgeAt: 0,
  };
  const n = find(P.nudged)?.id ?? "";
  const lag = behind(s);
  return lag >= 0 && n !== "" && n === [a, b][lag] ? { ...s, nudged: n, nudgeAt: 1 } : s;
}

/** The trail on one face: a zigzag inside the mountain, from the foot to the summit. */
function trail(side: 0 | 1, W: number, H: number) {
  const top = 30;
  const foot = H - 16;
  const edge = (y: number) => 12 + ((W / 2 - 12) * (foot - y)) / (foot - top);
  const pts: [number, number][] = [];
  const n = 6;
  for (let k = 0; k <= n; k++) {
    const y = foot - 6 - ((foot - 6 - top) * k) / n;
    const outer = edge(y) + 10 + (k === 0 ? 14 : 0);
    const inner = W / 2 - 14;
    const x = k === n ? W / 2 - 3 : k % 2 === 0 ? outer : Math.max(outer + 8, inner);
    pts.push([side === 0 ? x : W - x, y]);
  }
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const L = lens[lens.length - 1]!;
  const at = (f: number): [number, number] => {
    const d = Math.max(0, Math.min(1, f)) * L;
    let i = 1;
    while (i < lens.length - 1 && lens[i]! < d) i++;
    const t = (d - lens[i - 1]!) / Math.max(1e-6, lens[i]! - lens[i - 1]!);
    return [pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * t, pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * t];
  };
  const upTo = (f: number) => {
    const d = Math.max(0, Math.min(1, f)) * L;
    const out = [pts[0]!];
    for (let i = 1; i < pts.length && lens[i]! <= d; i++) out.push(pts[i]!);
    out.push(at(f));
    return out.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  };
  return { pts, at, upTo, all: pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") };
}

function Mountain({ W, H, theme }: { W: number; H: number; theme: Theme }) {
  const p = pal(theme);
  const c = theme.color;
  const foot = H - 16;
  return (
    <g>
      <rect x={0} y={0} width={W} height={H} rx={14} fill={p.sky} />
      <circle cx={W - 40} cy={34} r={14} fill={mix(p.yellow, p.sky, 0.15)} />
      <path d={`M 30 40 q 8 -10 18 -2 q 8 -8 16 2 Z`} fill={p.paper} />
      <path d={`M ${W - 110} 70 q 6 -8 14 -2 q 6 -6 12 2 Z`} fill={p.paper} />
      <path d={`M 12 ${foot} L ${W / 2} 22 L ${W - 12} ${foot} Z`} fill={mix(p.grass, p.leaf, 0.35)} />
      <path d={`M ${W / 2} 22 L ${W - 12} ${foot} L ${W / 2 + 30} ${foot} Z`} fill={mix(p.leaf, p.grass, 0.35)} opacity={0.5} />
      <path d={`M ${W / 2 - 34} 52 L ${W / 2} 22 L ${W / 2 + 34} 52 l -10 -6 l -8 7 l -8 -8 l -8 8 l -8 -7 l -8 6 l -8 -7 Z`} fill={p.paper} />
      <rect x={0} y={foot} width={W} height={H - foot} fill={mix(p.grass, c.wash, 0.2)} />
      <path d={`M 0 ${foot} H ${W} V ${H - 14} q 0 14 -14 14 H 14 q -14 0 -14 -14 Z`} fill={mix(p.grass, c.wash, 0.2)} />
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Mile mountain",
  summary: (s) => `${s.names[0]} ${mi(total(s, 0))} mi · ${s.names[1]} ${mi(total(s, 1))} mi of ${mi(s.goal)} · ${s.race}`,
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    const side = sideOf(s, u);
    if (!inChat(ctx, u) || side < 0) return s;
    if (a.t === "log") {
      if (!Number.isInteger(a.tenths) || a.tenths < 1 || a.tenths > 400 || s.logs.length >= 200) return s;
      if (total(s, side) >= s.goal) return s;
      const logs = [...s.logs, { u, tenths: a.tenths, at: meta.time }];
      return { ...s, logs, nudged: s.nudged === u ? "" : s.nudged, nudgeAt: s.nudged === u ? 0 : s.nudgeAt };
    }
    if (a.t === "undo") {
      const i = s.logs.map((l) => l.u).lastIndexOf(u);
      if (i < 0) return s;
      const next = { ...s, logs: s.logs.filter((_, k) => k !== i) };
      const lag = behind(next);
      return lag >= 0 && next.nudged === [s.a, s.b][lag] ? next : { ...next, nudged: "", nudgeAt: 0 };
    }
    if (a.t === "nudge") {
      const lag = behind(s);
      if (lag < 0 || lag === side || s.nudged !== "") return s;
      return { ...s, nudged: [s.a, s.b][lag]!, nudgeAt: Math.max(1, meta.time) };
    }
    return s;
  },

  invariants: {
    "only the two runners log": (s) => s.logs.every((l) => sideOf(s, l.u) >= 0 && Number.isInteger(l.tenths) && l.tenths >= 1 && l.tenths <= 400),
    "a nudge goes to the one behind": (s) => s.nudged === "" || (behind(s) >= 0 && s.nudged === [s.a, s.b][behind(s)]),
    "a nudge has a time": (s) => (s.nudged === "") === (s.nudgeAt === 0),
    "the runners differ": (s) => s.a === "" || s.a !== s.b,
  },

  transitions: {
    "only runners in the chat act": (p, n, _a, m, ctx) => p === n || (sideOf(p, m.user) >= 0 && inChat(ctx, m.user)),
    "a log adds one run, yours": (p, n, a, m) => a.t !== "log" || p === n || (n.logs.length === p.logs.length + 1 && n.logs.at(-1)!.u === m.user && n.logs.at(-1)!.tenths === a.tenths && n.logs.at(-1)!.at === m.time),
    "logging answers a nudge to you": (p, n, a, m) => a.t !== "log" || p === n || p.nudged !== m.user || n.nudged === "",
    "undo takes back only your last run": (p, n, a, m) => a.t !== "undo" || p === n || (n.logs.length === p.logs.length - 1 && n.logs.filter((l) => l.u !== m.user).length === p.logs.filter((l) => l.u !== m.user).length),
    "only the one ahead nudges": (p, n, a, m) => a.t !== "nudge" || p === n || (p.nudged === "" && n.nudged !== "" && n.nudged !== m.user && n.nudgeAt === Math.max(1, m.time)),
  },

  arbitrary: (s, u, r) => {
    const k = r.next();
    if (k < 0.6) return { t: "log", tenths: 10 + r.int(9) * 10 };
    if (k < 0.8) return { t: "nudge" };
    return { t: "undo" };
  },

  local: { miles: 4, bursts: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const H = 214;
    const ids = [state.a, state.b];
    const mySide = sideOf(state, me);
    const trails = [trail(0, W, H), trail(1, W, H)];
    const lag = behind(state);
    const lastFor = (i: number) => {
      for (let k = state.logs.length - 1; k >= 0; k--) if (sideOf(state, state.logs[k]!.u) === i) return state.logs[k]!;
      return null;
    };
    const pos = (i: number) => {
      const now = total(state, i) / state.goal;
      const last = lastFor(i);
      if (!last) return now;
      const e = running(last.at, 1400);
      if (e === null) return now;
      const before = (total(state, i) - last.tenths) / state.goal;
      return before + (now - before) * Math.min(1, CLIMB(e));
    };
    const fr = [pos(0), pos(1)];
    const atTop = (i: number) => total(state, i) >= state.goal;
    const miles = Math.max(1, Math.min(26, local.miles));
    const nameOf = (i: number) => (ids[i] === me ? "You" : state.names[i]!);
    const nudgeE = state.nudgeAt > 1 ? running(state.nudgeAt, 600) : null;

    const art = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${state.names[0]} at ${mi(total(state, 0))} miles and ${state.names[1]} at ${mi(total(state, 1))} of ${mi(state.goal)}`} style={{ display: "block" }}>
        <Mountain W={W} H={H} theme={theme} />
        {trails.map((t, i) => {
          const col = ids[i] ? userColor(ids[i]!, theme) : c.secondaryText;
          return (
            <g key={i}>
              <polyline points={t.all} fill="none" stroke={p.paper} stroke-width={5} stroke-linejoin="round" stroke-linecap="round" />
              <polyline points={t.all} fill="none" stroke={mix(c.secondaryText, p.paper, 0.2)} stroke-width={1.5} stroke-dasharray="3 5" stroke-linejoin="round" />
              <polyline points={t.upTo(fr[i]!)} fill="none" stroke={col} stroke-width={4} stroke-linejoin="round" stroke-linecap="round" />
              {state.flags.map((f, k) => {
                const [fx, fy] = t.at(f.tenths / state.goal);
                const passed = total(state, i) >= f.tenths;
                return (
                  <g key={k} transform={`translate(${fx.toFixed(1)} ${fy.toFixed(1)})`}>
                    <line x1={0} y1={0} x2={0} y2={-16} stroke={c.text} stroke-width={1.5} />
                    <path d={i === 0 ? "M 0 -16 L -11 -12 L 0 -8 Z" : "M 0 -16 L 11 -12 L 0 -8 Z"} fill={passed ? col : p.paper} stroke={col} stroke-width={1} />
                  </g>
                );
              })}
            </g>
          );
        })}
        <g transform={`translate(${W / 2} 22)`}>
          <line x1={0} y1={0} x2={0} y2={-18} stroke={c.text} stroke-width={1.8} />
          <path d="M 0 -18 h 14 l -4 4 l 4 4 h -14 Z" fill={p.red} />
        </g>
      </svg>
    );

    const labelFor = (i: number) => {
      const [x, y] = trails[i]!.at(fr[i]!);
      return { x, y };
    };

    return (
      <div>
        <CardHeader title={state.title} subtitle={`Summit is race day · ${state.race}`} />
        <div style={{ position: "relative", height: H }}>
          {art}
          {state.flags.map((f, k) => {
            const [fx, fy] = trails[0]!.at(f.tenths / state.goal);
            return (
              <div key={k} style={{ position: "absolute", left: fx - 40, top: fy - 22, width: 26, textAlign: "right", fontSize: 11, lineHeight: "14px", fontWeight: 700, color: theme.mode === "dark" ? c.wash : c.text, pointerEvents: "none" }}>
                <span style={{ background: p.paper, padding: "0 2px", borderRadius: 3 }}>{f.label}</span>
              </div>
            );
          })}
          {ids.map((u, i) => {
            if (!u) return null;
            const { x, y } = labelFor(i);
            return (
              <div key={u} style={{ position: "absolute", left: x - 15, top: y - 15, display: "flex", borderRadius: 99, boxShadow: `0 0 0 2px ${p.paper}`, pointerEvents: "none", zIndex: 2 }}>
                <Avatar user={u} size={30} />
              </div>
            );
          })}
          {lag >= 0 && ids[lag]
            ? (() => {
                const { x, y } = labelFor(lag);
                const sent = state.nudged === ids[lag];
                const canSend = !sent && mySide >= 0 && mySide !== lag;
                if (!sent && !canSend) return null;
                const bw = Math.min(150, fitText(state.nudgeText, 140, { size: 13, weight: 600 }).text.length * 7.5 + 24);
                const left = Math.max(4, Math.min(W - bw - 4, x - bw / 2));
                const top = Math.max(4, y - 58) - (nudgeE !== null ? (1 - nudgeE / 600) * 8 : 0);
                return (
                  <button
                    type="button"
                    aria-label={sent ? `${nameOf(lag)} got: ${state.nudgeText}` : `Send ${state.names[lag as 0 | 1]}: ${state.nudgeText}`}
                    onClick={() => {
                      if (!canSend) return;
                      haptic("light");
                      dispatch({ t: "nudge" });
                    }}
                    style={{ position: "absolute", left, top, width: bw, height: 44, padding: 0, border: 0, background: "transparent", cursor: canSend ? "pointer" : "default", zIndex: 3 }}
                  >
                    <span style={{ display: "block", margin: "6px 0", padding: "4px 10px", borderRadius: 14, border: sent ? "none" : `1.5px dashed ${c.primary}`, background: sent ? c.primary : c.card, color: sent ? c.onPrimary : c.primary, fontSize: 13, lineHeight: "16px", fontWeight: 600, ...ell }}>{state.nudgeText}</span>
                  </button>
                );
              })()
            : null}
          {local.bursts > 0 && mySide >= 0 && atTop(mySide) ? <Burst key={local.bursts} emoji="🏁" /> : null}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {ids.map((u, i) => {
            const last = lastFor(i);
            const note = last ? `${mi(last.tenths)} mi logged` : state.notes[i];
            return (
              <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, alignItems: "flex-start" }}>
                <span style={{ flex: "none", width: 4, alignSelf: "stretch", borderRadius: 2, background: u ? userColor(u, theme) : c.divider }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: "17px", fontWeight: 600, color: c.text, ...ell }}>{`${nameOf(i)} · ${mi(total(state, i))} of ${mi(state.goal)}`}</div>
                  <div style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, ...ell }}>{note ? (last ? note : `"${note}"`) : "No runs yet"}</div>
                </div>
              </div>
            );
          })}
        </div>
        {mySide >= 0 ? (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            {atTop(mySide) ? (
              <span style={{ flex: 1, fontSize: 13, color: c.secondaryText }}>{`You're at the summit · see you ${state.race}`}</span>
            ) : (
              <>
                <button type="button" class="m-btn" aria-label="One mile less" style={{ width: 44, padding: 0 }} onClick={() => setLocal({ miles: Math.max(1, miles - 1) })}>−</button>
                <span style={{ width: 44, textAlign: "center", fontSize: 15, fontWeight: 600, color: c.text }}>{`${miles} mi`}</span>
                <button type="button" class="m-btn" aria-label="One mile more" style={{ width: 44, padding: 0 }} onClick={() => setLocal({ miles: Math.min(26, miles + 1) })}>+</button>
                <span style={{ flex: 1 }} />
                {lastFor(mySide) && running(lastFor(mySide)!.at, 8000) !== null ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "undo" })}>
                    Undo
                  </Button>
                ) : null}
                <Button
                  kind="primary"
                  onClick={() => {
                    haptic("success");
                    setLocal({ bursts: local.bursts + 1 });
                    dispatch({ t: "log", tenths: miles * 10 });
                  }}
                >
                  {`Log ${miles} mi`}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
    );
  },
});
