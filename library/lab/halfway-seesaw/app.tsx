import { defineApp, Avatar, Burst, Button, CardHeader, Locked, fitText, haptic, mix, pal, running, seedOf, spring, springs, userColor, type Ctx } from "@muse/app";

// Halfway seesaw: where two friends should meet, drawn as a little town map with each of you at
// your end and walking rings around you. Every spot sits where it really is; under the map a
// seesaw weighs your two walks for the spot in play and tips toward whoever walks further. Tap a
// spot to suggest it; when you both pick the same one, it's set.

type Params = {
  /** Card title: "Meet in the middle" */
  title: string;
  /** What started it */
  quote: string;
  /** Who said it */
  quoteBy: string;
  /** The two of you: name, where you are, and where that is on the map (0 to 1) */
  people: { name: string; at: string; x: number; y: number }[];
  /** 2 to 5 spots: name, map position, and walking minutes for each of you */
  spots: { name: string; x: number; y: number; minA: number; minB: number }[];
  /** Spot names already suggested, same order as people ("" for none) */
  picked: string[];
};

// @params
const P: Params = {
  title: "Meet in the middle",
  quote: "you're at Larkin, i'm at Second Chapter. where do we meet",
  quoteBy: "Arun",
  people: [
    { name: "Arun", at: "Larkin Hall", x: 0.1, y: 0.78 },
    { name: "Calvin", at: "Second Chapter", x: 0.9, y: 0.2 },
  ],
  spots: [
    { name: "Kettle & Crumb", x: 0.47, y: 0.52, minA: 9, minB: 8 },
    { name: "Rook's Pizza", x: 0.28, y: 0.3, minA: 6, minB: 14 },
    { name: "Tío's Tacos", x: 0.7, y: 0.72, minA: 13, minB: 7 },
    { name: "The Quad", x: 0.55, y: 0.18, minA: 12, minB: 5 },
  ],
  picked: ["Rook's Pizza", ""],
};
// @end params

type Spot = { name: string; x: number; y: number; ma: number; mb: number };
type State = {
  title: string;
  quote: string;
  quoteBy: string;
  a: string;
  b: string;
  names: [string, string];
  places: { at: string; x: number; y: number }[];
  spots: Spot[];
  picks: Record<string, number>;
  setAt: number;
};
type Action = { t: "pick"; i: number };
type Local = { bursts: number };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const frac = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(0.94, Math.max(0.06, v)) : d);
const mins = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 120 ? (v as number) : 10);
const TIP = spring(springs.iosBouncy);
const pair = (s: State) => [s.a, s.b].filter(Boolean);
const agreed = (s: State) => (s.a && s.b && s.picks[s.a] !== undefined && s.picks[s.a] === s.picks[s.b] ? s.picks[s.a]! : -1);
const fairest = (s: State) => s.spots.reduce((best, sp, i) => (Math.abs(sp.ma - sp.mb) < Math.abs(s.spots[best]!.ma - s.spots[best]!.mb) || (Math.abs(sp.ma - sp.mb) === Math.abs(s.spots[best]!.ma - s.spots[best]!.mb) && sp.ma + sp.mb < s.spots[best]!.ma + s.spots[best]!.mb) ? i : best), 0);

function initState(ctx: Ctx): State {
  const find = (n: unknown) => {
    const x = clean(n, 40).toLowerCase();
    return x ? ctx.members.find((m) => m.id === x || m.name.toLowerCase() === x) : undefined;
  };
  const ps = Array.isArray(P.people) ? P.people : [];
  const ma = find(ps[0]?.name);
  const a = ma?.id ?? ctx.members[0]?.id ?? "";
  const mb = find(ps[1]?.name);
  const b = mb && mb.id !== a ? mb.id : ctx.members.find((m) => m.id !== a)?.id ?? "";
  const nm = (id: string, fb: unknown) => ctx.members.find((m) => m.id === id)?.name ?? (clean(fb, 20) || "Friend");
  let spots = (Array.isArray(P.spots) ? P.spots : [])
    .map((sp, i) => ({ name: clean(sp?.name, 28), x: frac(sp?.x, 0.3 + i * 0.1), y: frac(sp?.y, 0.5), ma: mins(sp?.minA), mb: mins(sp?.minB) }))
    .filter((sp) => sp.name)
    .slice(0, 5);
  if (spots.length < 2) spots = [{ name: "Halfway", x: 0.5, y: 0.5, ma: 10, mb: 10 }, { name: "Coffee", x: 0.4, y: 0.4, ma: 8, mb: 12 }];
  const picks: Record<string, number> = {};
  const pk = Array.isArray(P.picked) ? P.picked : [];
  [a, b].forEach((u, k) => {
    const i = spots.findIndex((sp) => sp.name.toLowerCase() === clean(pk[k], 28).toLowerCase());
    if (u && i >= 0) picks[u] = i;
  });
  const s: State = {
    title: clean(P.title, 40) || "Meet in the middle",
    quote: clean(P.quote, 90),
    quoteBy: clean(P.quoteBy, 20),
    a,
    b,
    names: [nm(a, ps[0]?.name), nm(b, ps[1]?.name)],
    places: [0, 1].map((k) => ({ at: clean(ps[k]?.at, 24), x: frac(ps[k]?.x, k ? 0.88 : 0.12), y: frac(ps[k]?.y, k ? 0.2 : 0.8) })),
    spots,
    picks,
    setAt: 0,
  };
  return agreed(s) >= 0 ? { ...s, setAt: 1 } : s;
}

export default defineApp<State, Action, Local>({
  name: "Halfway seesaw",
  summary: (s) => {
    const g = agreed(s);
    if (g >= 0) return `${s.names[0]} and ${s.names[1]} meet at ${s.spots[g]!.name} · ${s.spots[g]!.ma} and ${s.spots[g]!.mb} min`;
    const f = s.spots[fairest(s)]!;
    return `${s.title}: fairest is ${f.name} · ${f.ma} vs ${f.mb} min`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u) || !pair(s).includes(u)) return s;
    if (a.t === "pick") {
      if (!Number.isInteger(a.i) || a.i < 0 || a.i >= s.spots.length) return s;
      const picks = { ...s.picks };
      if (picks[u] === a.i) delete picks[u];
      else picks[u] = a.i;
      const next = { ...s, picks };
      const g = agreed(next);
      return { ...next, setAt: g < 0 ? 0 : agreed(s) === g ? s.setAt : Math.max(1, meta.time) };
    }
    return s;
  },

  invariants: {
    "picks are spots, by the two of you": (s) => Object.entries(s.picks).every(([u, i]) => (u === s.a || u === s.b) && Number.isInteger(i) && i >= 0 && i < s.spots.length),
    "set exactly when you agree": (s) => (agreed(s) >= 0) === (s.setAt > 0),
    "two to five spots": (s) => s.spots.length >= 2 && s.spots.length <= 5,
  },

  transitions: {
    "a tap moves only your pick": (p, n, a, m) =>
      a.t !== "pick" || p === n || ((n.picks[m.user] === a.i) !== (p.picks[m.user] === a.i) && Object.keys({ ...p.picks, ...n.picks }).every((u) => u === m.user || p.picks[u] === n.picks[u])),
    "agreeing sets it now": (p, n, a, m) => a.t !== "pick" || agreed(n) < 0 || agreed(n) === agreed(p) || n.setAt === Math.max(1, m.time),
    "only the two act": (p, n, _a, m, ctx) => p === n || (pair(p).includes(m.user) && inChat(ctx, m.user)),
  },

  arbitrary: (s, _u, r) => ({ t: "pick", i: r.next() < 0.9 ? r.int(s.spots.length) : 9 }),

  local: { bursts: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const H = 172;
    const dark = theme.mode === "dark";
    const ids = [state.a, state.b];
    const g = agreed(state);
    const mine = pair(state).includes(me);
    const other = me === state.a ? state.b : state.a;
    const focus = g >= 0 ? g : state.picks[me] ?? state.picks[other] ?? fairest(state);
    const spot = state.spots[focus]!;
    const fair = fairest(state);
    const X = (f: number) => 14 + f * (W - 28);
    const Y = (f: number) => 12 + f * (H - 24);
    const homes = state.places.map((pl) => ({ x: X(pl.x), y: Y(pl.y) }));
    const ratio = state.spots.reduce((acc, sp) => acc + (Math.hypot(X(sp.x) - homes[0]!.x, Y(sp.y) - homes[0]!.y) / Math.max(1, sp.ma) + Math.hypot(X(sp.x) - homes[1]!.x, Y(sp.y) - homes[1]!.y) / Math.max(1, sp.mb)) / 2, 0) / state.spots.length;
    const rnd = seedOf(state.spots.map((s) => s.name).join());
    const land = dark ? mix(p.grass, c.wash, 0.7) : mix(p.grass, c.card, 0.45);
    const road = dark ? mix(c.wash, c.text, 0.12) : c.card;
    const nameOf = (u: string) => (u === me ? "You" : u === state.a ? state.names[0] : state.names[1]);
    const setE = g >= 0 && state.setAt > 1 ? running(state.setAt, 900) : null;

    const map = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map with ${state.spots.length} spots between ${state.names[0]} and ${state.names[1]}`} style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} rx={14} fill={land} />
        <path d={`M ${W * 0.62} 0 C ${W * 0.55} ${H * 0.35} ${W * 0.85} ${H * 0.55} ${W * 0.78} ${H}`} fill="none" stroke={mix(p.sky, p.blue, 0.25)} stroke-width={10} stroke-linecap="round" />
        {[0.25, 0.5, 0.75].map((f, i) => (
          <line key={`h${i}`} x1={0} y1={H * f + ((rnd >> i) % 9) - 4} x2={W} y2={H * f - ((rnd >> (i + 3)) % 9) + 4} stroke={road} stroke-width={5} />
        ))}
        {[0.2, 0.42, 0.66, 0.86].map((f, i) => (
          <line key={`v${i}`} x1={W * f} y1={0} x2={W * f + ((rnd >> (i + 5)) % 13) - 6} y2={H} stroke={road} stroke-width={5} />
        ))}
        {[0, 1].map((k) =>
          [5, 10, 15].map((m) => <circle key={`r${k}${m}`} cx={homes[k]!.x} cy={homes[k]!.y} r={m * ratio} fill="none" stroke={ids[k] ? userColor(ids[k]!, theme) : c.secondaryText} stroke-width={1.2} stroke-dasharray="3 5" opacity={0.8} />),
        )}
        <line x1={homes[0]!.x} y1={homes[0]!.y} x2={X(spot.x)} y2={Y(spot.y)} stroke={ids[0] ? userColor(ids[0]!, theme) : c.text} stroke-width={3} stroke-linecap="round" />
        <line x1={homes[1]!.x} y1={homes[1]!.y} x2={X(spot.x)} y2={Y(spot.y)} stroke={ids[1] ? userColor(ids[1]!, theme) : c.text} stroke-width={3} stroke-linecap="round" />
      </svg>
    );

    // seesaw: tips down toward whoever walks further
    const diff = spot.ma - spot.mb;
    const target = Math.max(-0.12, Math.min(0.12, diff * 0.02));
    const ang = setE !== null ? target * TIP(setE) : target;
    const beam = Math.min(W - 60, 300);
    const sy = 58;
    const sx = W / 2;
    const end = (k: number) => ({ x: sx + (k ? 1 : -1) * (beam / 2) * Math.cos(ang), y: sy + (k ? -1 : 1) * (beam / 2) * Math.sin(ang) });

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.quote ? `${state.quoteBy ? `${state.quoteBy}: ` : ""}"${state.quote}"` : `${state.names[0]} and ${state.names[1]}`} />
        <div style={{ position: "relative", height: H }}>
          {map}
          {[0, 1].map((k) => (
            <div key={`home${k}`} style={{ position: "absolute", left: homes[k]!.x - 16, top: homes[k]!.y - 16, display: "flex", borderRadius: 99, boxShadow: `0 0 0 3px ${c.card}`, pointerEvents: "none" }}>
              {ids[k] ? <Avatar user={ids[k]!} size={32} /> : null}
            </div>
          ))}
          {state.spots.map((sp, i) => {
            const x = X(sp.x);
            const y = Y(sp.y);
            const who = ids.filter((u) => u && state.picks[u] === i);
            const on = i === focus;
            const f = fitText(sp.name, 96, { size: 12, min: 10, weight: 600 });
            const bw = Math.min(110, f.text.length * 6.6 + 22 + who.length * 14);
            const left = Math.max(2, Math.min(W - bw - 2, x - bw / 2));
            return (
              <button
                key={`s${i}-${on}-${who.join()}`}
                type="button"
                aria-label={`${sp.name}: ${nameOf(state.a)} ${sp.ma} min, ${nameOf(state.b)} ${sp.mb} min${who.length ? `, picked by ${who.map(nameOf).join(" and ")}` : ""}`}
                aria-pressed={state.picks[me] === i}
                onClick={() => {
                  if (!mine) return;
                  haptic("light");
                  setLocal({ bursts: local.bursts + 1 });
                  dispatch({ t: "pick", i });
                }}
                style={{ position: "absolute", left, top: y - 22, width: bw, height: 44, padding: 0, border: 0, background: "transparent", cursor: mine ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", zIndex: on ? 3 : 2 }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 7px", borderRadius: 12, background: g === i ? c.primary : c.card, color: g === i ? c.onPrimary : c.text, boxShadow: on ? `0 0 0 2px ${c.primary}` : `0 1px 3px ${mix(c.text, c.wash, 0.7)}`, fontSize: f.size, lineHeight: "16px", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {i === fair ? <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: g === i ? c.onPrimary : c.positive }} /> : null}
                  {f.text}
                  {who.map((u) => (
                    <span key={u} style={{ display: "flex", marginLeft: 1 }}>
                      <Avatar user={u} size={14} />
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
          {local.bursts > 0 && g >= 0 ? <Burst key={local.bursts} emoji="📍" /> : null}
        </div>
        <div style={{ position: "relative", height: 84, marginTop: 4 }} role="img" aria-label={`${spot.name}: ${state.names[0]} walks ${spot.ma} minutes, ${state.names[1]} walks ${spot.mb}`}>
          <svg width={W} height={84} viewBox={`0 0 ${W} 84`} aria-hidden="true" style={{ display: "block" }}>
            <path d={`M ${sx - 12} 82 L ${sx} ${sy + 2} L ${sx + 12} 82 Z`} fill={mix(p.brown, c.wash, 0.2)} />
            <line x1={end(0).x} y1={end(0).y} x2={end(1).x} y2={end(1).y} stroke={p.brown} stroke-width={7} stroke-linecap="round" />
          </svg>
          {[0, 1].map((k) => {
            const e = end(k);
            const m = k ? spot.mb : spot.ma;
            return (
              <div key={k} style={{ position: "absolute", left: e.x - 30, top: e.y - 48, width: 60, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
                {ids[k] ? <Avatar user={ids[k]!} size={26} /> : null}
                <span style={{ marginTop: 2, fontSize: 12, lineHeight: "14px", fontWeight: 700, color: c.text }}>{`${m} min`}</span>
              </div>
            );
          })}
          <div style={{ position: "absolute", left: sx - 80, top: 0, width: 160, textAlign: "center", fontSize: 12, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: c.card }}>
            {Math.abs(diff) <= 1 ? "Even walk" : `${nameOf(diff > 0 ? state.a : state.b)} ${nameOf(diff > 0 ? state.a : state.b) === "You" ? "walk" : "walks"} ${Math.abs(diff)} min more`}
          </div>
        </div>
        <div style={{ marginTop: 6, minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}>
          {g >= 0 ? (
            <div style={{ flex: 1, minWidth: 0 }}>
              <Locked detail={`${spot.ma} and ${spot.mb} min walks`}>{`Meet at ${spot.name}`}</Locked>
            </div>
          ) : (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>
                {!mine ? "Two friends picking a spot" : state.picks[me] === undefined ? `Tap a spot · green dot is the fairest walk` : state.picks[other] === undefined ? `Waiting on ${nameOf(other)}` : `${nameOf(other)} picked ${state.spots[state.picks[other]!]!.name}`}
              </span>
              {mine && state.picks[other] !== undefined && state.picks[me] !== state.picks[other] ? (
                <Button
                  kind="primary"
                  onClick={() => {
                    haptic("success");
                    setLocal({ bursts: local.bursts + 1 });
                    dispatch({ t: "pick", i: state.picks[other]! });
                  }}
                >
                  Go with it
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  },
});
