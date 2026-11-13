import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  type Child,
  type Ctx,
  type Member,
} from "@muse/app";

// New Year's Eve, three parties, one roof. The evening is a clock face from the first stop to
// midnight: each party is an arc as long as you stay, the walks are dotted, and the roof deadline
// sits at 11:50. Drag a stop around the dial to change the order; the times reflow, the faces walk
// the new route, and once it makes the roof in time anyone can save it to the event.

type Params = {
  /** Card title */
  title: string;
  /** When the night starts, 24-hour "21:00" */
  start: string;
  /** Where everyone must be, and by when ("23:50") */
  roof: { name: string; by: string };
  /** Exactly 3 parties in the current order, with how long to stay (minutes), whose it is, and the walk to the roof (minutes) */
  stops: { name: string; host: string; stay: number; toRoof: number }[];
  /** Walking minutes between the parties: [first-second, first-third, second-third] */
  walks: number[];
  /** Who is going, by first name */
  going: string[];
};

// @params
const P: Params = {
  title: "New Year's Eve · three parties",
  start: "21:00",
  roof: { name: "Larkin roof", by: "23:50" },
  stops: [
    { name: "Kettle & Crumb", host: "Calvin's work thing", stay: 30, toRoof: 12 },
    { name: "Larkin 4B", host: "Arun's lab", stay: 45, toRoof: 2 },
    { name: "412 Pine 2B", host: "Maya & Tsai Lin", stay: 70, toRoof: 15 },
  ],
  walks: [10, 8, 12],
  going: ["Maya", "Tsai Lin", "Arun", "Will", "Calvin"],
};
// @end params

type Stop = { id: string; name: string; host: string; stay: number; toRoof: number };
type State = {
  title: string;
  start: number;
  roofName: string;
  roofBy: number;
  stops: Stop[];
  walk: number[];
  order: string[];
  going: string[];
  movedAt: number;
  savedAt: number;
  savedBy: string;
};
type Action = { t: "move"; stop: string; to: number } | { t: "save" } | { t: "in" };
type Local = { drag: string; ang: number };

const DIAL_H = 262;
const SPAN = 180;
const WALK_MS = 4200;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const mins = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
const hhmm = (v: unknown, d: number) => {
  const m = typeof v === "string" ? v.match(/^(\d{1,2}):(\d{2})$/) : null;
  return m ? Math.min(23 * 60 + 59, Number(m[1]) * 60 + Number(m[2])) : d;
};
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const standIn = (u: string) => u.startsWith("~");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const r1 = (n: number) => Math.round(n * 10) / 10;
const clockText = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")}`;
};
const pairIdx = (a: number, b: number) => (Math.min(a, b) === 0 ? Math.max(a, b) - 1 : 2);

type Leg = { stop: Stop; arrive: number; leave: number; walk: number };
function schedule(s: State): { legs: Leg[]; roofAt: number } {
  const legs: Leg[] = [];
  let t = s.start;
  s.order.forEach((id, i) => {
    const stop = s.stops.find((x) => x.id === id)!;
    const nextId = s.order[i + 1];
    const a = s.stops.indexOf(stop);
    const walk = nextId ? s.walk[pairIdx(a, s.stops.findIndex((x) => x.id === nextId))]! : stop.toRoof;
    legs.push({ stop, arrive: t, leave: t + stop.stay, walk });
    t += stop.stay + walk;
  });
  return { legs, roofAt: t };
}
const onTime = (s: State) => schedule(s).roofAt <= s.roofBy;

function initState(ctx: Ctx): State {
  const raw = Array.isArray(P.stops) ? P.stops.slice(0, 3) : [];
  const stops: Stop[] = raw.map((x, i) => ({ id: `s${i}`, name: clean(x?.name, 20) || `Party ${i + 1}`, host: clean(x?.host, 24), stay: mins(x?.stay, 10, 120, 30), toRoof: mins(x?.toRoof, 0, 60, 10) }));
  while (stops.length < 3) stops.push({ id: `s${stops.length}`, name: `Party ${stops.length + 1}`, host: "", stay: 30, toRoof: 10 });
  const w = Array.isArray(P.walks) ? P.walks : [];
  const going: string[] = [];
  for (const n of Array.isArray(P.going) ? P.going : []) {
    const name = clean(n, 16);
    if (!name) continue;
    const u = ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? `~${name}`;
    if (!going.includes(u)) going.push(u);
  }
  const start = hhmm(P.start, 21 * 60);
  return {
    title: clean(P.title, 40) || "Tonight",
    start,
    roofName: clean(P.roof?.name, 20) || "the roof",
    roofBy: Math.max(start + 30, Math.min(start + SPAN, hhmm(P.roof?.by, 23 * 60 + 50) < start ? hhmm(P.roof?.by, 23 * 60 + 50) + 24 * 60 : hhmm(P.roof?.by, 23 * 60 + 50))),
    stops,
    walk: [0, 1, 2].map((i) => mins(w[i], 0, 60, 10)),
    order: stops.map((s) => s.id),
    going,
    movedAt: 0,
    savedAt: 0,
    savedBy: "",
  };
}

const CSS =
  "@keyframes mrPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}" +
  ".mr-pulse{transform-box:fill-box;transform-origin:center;animation:mrPulse 1.6s ease-in-out infinite}" +
  "@media (prefers-reduced-motion:reduce){.mr-pulse{animation:none}}";

export default defineApp<State, Action, Local>({
  name: "Midnight route",
  summary: (s) => {
    const { legs, roofAt } = schedule(s);
    const route = legs.map((l) => l.stop.name).join(" → ");
    if (s.savedAt > 0) return `Saved: ${route} → ${s.roofName} by ${clockText(roofAt)}`;
    return roofAt <= s.roofBy ? `${route} makes ${s.roofName} at ${clockText(roofAt)}` : `${route} is ${roofAt - s.roofBy} min late for ${s.roofName}`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "move") {
      if (state.savedAt > 0 || typeof action.stop !== "string" || !Number.isInteger(action.to) || action.to < 0 || action.to >= state.order.length) return state;
      const from = state.order.indexOf(action.stop);
      if (from < 0 || from === action.to) return state;
      const rest = state.order.filter((id) => id !== action.stop);
      const order = [...rest.slice(0, action.to), action.stop, ...rest.slice(action.to)];
      return { ...state, order, movedAt: meta.time };
    }
    if (action.t === "save") {
      if (state.savedAt > 0 || !onTime(state)) return state;
      return { ...state, savedAt: meta.time, savedBy: meta.user };
    }
    if (action.t === "in") {
      return { ...state, going: state.going.includes(meta.user) ? state.going.filter((u) => u !== meta.user) : [...state.going, meta.user] };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const going = state.going.filter((u) => standIn(u) || inChat(ctx, u));
    return going.length === state.going.length ? state : { ...state, going };
  },

  invariants: {
    "the order is the three stops, once each": (s) => s.order.length === s.stops.length && new Set(s.order).size === s.order.length && s.order.every((id) => s.stops.some((x) => x.id === id)),
    "a saved plan makes the roof in time": (s) => s.savedAt === 0 || onTime(s),
    "saving names who saved": (s) => (s.savedAt === 0) === (s.savedBy === ""),
    "going once each, from the chat or the post": (s, ctx) => new Set(s.going).size === s.going.length && s.going.every((u) => standIn(u) || inChat(ctx, u)),
  },

  transitions: {
    "a move puts that stop where it was dropped": (p, n, a, m) => {
      if (a.t !== "move" || p === n) return true;
      const rest = p.order.filter((id) => id !== a.stop);
      return n.order[a.to] === a.stop && same(n.order.filter((id) => id !== a.stop), rest) && n.movedAt === m.time;
    },
    "an open plan can be reordered": (p, n, a, m, ctx) => {
      if (a.t !== "move" || !inChat(ctx, m.user) || p.savedAt > 0 || !Number.isInteger(a.to) || a.to < 0 || a.to > 2) return true;
      const from = p.order.indexOf(a.stop);
      return from < 0 || from === a.to || p !== n;
    },
    "a saved plan stays put": (p, n) => p.savedAt === 0 || (same(p.order, n.order) && p.savedAt === n.savedAt),
    "saving happens once, on time, by the sender": (p, n, a, m) => n.savedAt === p.savedAt || (a.t === "save" && p.savedAt === 0 && onTime(p) && n.savedAt === m.time && n.savedBy === m.user),
    "an on-time plan can be saved": (p, n, a, m, ctx) => a.t !== "save" || !inChat(ctx, m.user) || p.savedAt > 0 || !onTime(p) || n.savedAt === m.time,
    "in toggles only me": (p, n, a, m, ctx) => a.t !== "in" || !inChat(ctx, m.user) || (p.going.includes(m.user) !== n.going.includes(m.user) && same(p.going.filter((u) => u !== m.user), n.going.filter((u) => u !== m.user))),
    "the parties never change": (p, n) => same(p.stops, n.stops) && same(p.walk, n.walk) && p.start === n.start && p.roofBy === n.roofBy,
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.15) return { t: "save" };
    if (k < 0.3) return { t: "in" };
    if (k < 0.33) return { t: "move", stop: "s9", to: 0 };
    return { t: "move", stop: r.pick(s.order), to: r.int(s.order.length) };
  },

  local: { drag: "", ang: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const person = (u: string): Member => (standIn(u) ? { id: u, name: u.slice(1) } : members.find((m) => m.id === u)) ?? { id: u, name: "Friend" };
    const { legs, roofAt } = schedule(state);
    const late = roofAt - state.roofBy;
    const saved = state.savedAt > 0;
    const here = members.some((m) => m.id === me);
    const imIn = state.going.includes(me);

    const cx = W / 2;
    const cy = DIAL_H / 2;
    const R = Math.min(88, W / 2 - 84);
    const GAP = (50 * Math.PI) / 180;
    const ang = (m: number) => -Math.PI / 2 + GAP / 2 + ((m - state.start) / SPAN) * (Math.PI * 2 - GAP);
    const pt = (m: number, rr: number) => ({ x: cx + rr * Math.cos(ang(m)), y: cy + rr * Math.sin(ang(m)) });
    const arc = (a: number, b: number, rr: number) => {
      const s0 = pt(a, rr);
      const s1 = pt(b, rr);
      const large = ((b - a) / SPAN) * (Math.PI * 2 - GAP) > Math.PI ? 1 : 0;
      return `M${r1(s0.x)} ${r1(s0.y)} A${rr} ${rr} 0 ${large} 1 ${r1(s1.x)} ${r1(s1.y)}`;
    };
    const hues = [p.blue, p.purple, p.orange];
    const hueOf = (st: Stop) => hues[state.stops.indexOf(st) % 3]!;

    const art: Child[] = [
      <circle key="face" cx={cx} cy={cy} r={R + 22} fill={mix(c.card, p.dark, theme.mode === "dark" ? 0.4 : 0.9)} />,
      <circle key="track" cx={cx} cy={cy} r={R} fill="none" stroke={mix(p.dark, c.card, 0.25)} stroke-width={14} />,
    ];
    for (let k = 0; k <= 12; k++) {
      if (k % 4 === 0) continue;
      const m = state.start + k * 15;
      const a = pt(m, R + 14);
      const b = pt(m, R + (k % 4 === 0 ? 14 : 10));
      art.push(<line key={`t${k}`} x1={r1(a.x)} y1={r1(a.y)} x2={r1(b.x)} y2={r1(b.y)} stroke={mix(p.dark, c.card, 0.5)} stroke-width={k % 4 === 0 ? 2 : 1} />);
    }
    // parties and walks
    legs.forEach((l, i) => {
      const a0 = Math.min(l.arrive, state.start + SPAN - 0.5);
      const a1 = Math.min(l.leave, state.start + SPAN - 0.5);
      if (a1 > a0) art.push(<path key={`p${i}`} d={arc(a0, a1, R)} fill="none" stroke={hueOf(l.stop)} stroke-width={14} stroke-linecap="butt" />);
      const w0 = Math.min(l.leave, state.start + SPAN - 0.5);
      const w1 = Math.min(l.leave + l.walk, state.start + SPAN - 0.5);
      if (w1 > w0 + 0.5) art.push(<path key={`w${i}`} d={arc(w0, w1, R)} fill="none" stroke={p.paper} stroke-width={3} stroke-dasharray="2 4" stroke-linecap="round" />);
      if (w1 > w0 + 0.5 && l.walk >= 4) {
        const q = pt((w0 + w1) / 2, R - 19);
        art.push(<text key={`wt${i}`} x={r1(q.x)} y={r1(q.y + 4)} font-size={11} font-weight={600} text-anchor="middle" fill={p.paper}>{`${l.walk}m`}</text>);
      }
    });
    // the roof deadline flag and the arrival
    const flag = pt(state.roofBy, R);
    const flagOut = pt(state.roofBy, R + 26);
    art.push(<line key="fl" x1={r1(flag.x)} y1={r1(flag.y)} x2={r1(flagOut.x)} y2={r1(flagOut.y)} stroke={late > 0 ? c.negative : p.yellow} stroke-width={2.5} />);
    art.push(<path key="ff" d={`M${r1(flagOut.x)} ${r1(flagOut.y)} l12 3 l-12 5 Z`} fill={late > 0 ? c.negative : p.yellow} />);
    const arr = pt(Math.min(roofAt, state.start + SPAN), R);
    art.push(<circle key="arr" cx={r1(arr.x)} cy={r1(arr.y)} r={7} fill={late > 0 ? c.negative : c.positive} stroke={c.card} stroke-width={2} class="mr-pulse" />);
    // midnight star at the top
    const top = { x: cx, y: cy - R - 2 };
    art.push(<path key="star" d={`M${r1(top.x)} ${r1(top.y - 7)} l2 5 5 0.5 -4 3.5 1.5 5 -4.5 -3 -4.5 3 1.5 -5 -4 -3.5 5 -0.5 Z`} fill={p.yellow} />);

    // Hour labels inside the rim.
    const hourLabels = [0, 60, 120, 180].map((d) => {
      const q = pt(state.start + d, R + 15);
      return { x: q.x, y: q.y, t: clockText(state.start + d).replace(":00", "") };
    });

    // Stop nodes at the middle of each party arc (or where the drag is).
    const nodes = legs.map((l, i) => {
      const mid = (Math.min(l.arrive, state.start + SPAN) + Math.min(l.leave, state.start + SPAN)) / 2;
      let q = pt(mid, R);
      if (local.drag === l.stop.id) q = { x: cx + R * Math.cos(local.ang), y: cy + R * Math.sin(local.ang) };
      return { l, i, x: q.x, y: q.y };
    });

    // Faces walk the route after each change, then wait on the roof.
    const walkE = state.movedAt > 0 ? running(state.movedAt, WALK_MS) : null;
    const tNow = walkE === null ? roofAt : state.start + (roofAt - state.start) * (walkE / WALK_MS);
    const caravan = walkE === null ? { x: cx, y: cy - 50 } : pt(Math.min(tNow, state.start + SPAN), R - 44);
    const crew = state.going.slice(0, 3);

    const toAngle = (x: number, y: number) => Math.atan2(y - cy, x - cx);
    const angToMin = (a: number) => {
      let d = a + Math.PI / 2 - GAP / 2;
      while (d < 0) d += Math.PI * 2;
      return state.start + Math.min(1, d / (Math.PI * 2 - GAP)) * SPAN;
    };
    const onPointer = (e: { type: string; x: number; y: number }) => {
      if (saved) return;
      if (e.type === "down") {
        const hit = nodes.find((nd) => Math.hypot(nd.x - e.x, nd.y - e.y) < 26);
        if (hit) setLocal({ drag: hit.l.stop.id, ang: toAngle(e.x, e.y) });
        return;
      }
      if (!local.drag) return;
      if (e.type === "move") {
        setLocal({ ang: toAngle(e.x, e.y) });
        return;
      }
      const dropMin = angToMin(toAngle(e.x, e.y));
      const others = nodes.filter((nd) => nd.l.stop.id !== local.drag).map((nd) => (nd.l.arrive + nd.l.leave) / 2);
      const to = others.filter((m) => m < dropMin).length;
      const id = local.drag;
      setLocal({ drag: "" });
      if (state.order.indexOf(id) !== to) {
        dispatch({ t: "move", stop: id, to });
        haptic("light");
      }
    };

    const savedNow = saved && running(state.savedAt, 2400) !== null;
    const status = late > 0 ? `${late} min late` : late === 0 ? "right on time" : `${-late} min to spare`;

    return (
      <div>
        <style>{CSS}</style>
        <CardHeader title={state.title} subtitle={`${state.roofName} by ${clockText(state.roofBy)} · ${state.going.length} going`} />
        <div style={{ position: "relative", height: DIAL_H, borderRadius: 12, background: c.wash, overflow: "hidden" }}>
          <svg width={W} height={DIAL_H} viewBox={`0 0 ${W} ${DIAL_H}`} role="img" aria-label={`Route: ${legs.map((l) => `${l.stop.name} ${clockText(l.arrive)} to ${clockText(l.leave)}`).join(", ")}, ${state.roofName} at ${clockText(roofAt)}, ${status}`} style={{ position: "absolute", left: 0, top: 0 }}>
            {art}
          </svg>
          {hourLabels.map((h, k) => (
            <div key={`h${k}`} style={{ position: "absolute", left: r1(h.x - 12), top: r1(h.y - 7), width: 24, textAlign: "center", fontSize: 10, lineHeight: "14px", fontWeight: 700, color: c.onPrimary, pointerEvents: "none", background: mix(c.card, p.dark, theme.mode === "dark" ? 0.4 : 0.9), borderRadius: 9 }}>{h.t}</div>
          ))}
          <div style={{ position: "absolute", left: cx - 60, top: cy - 30, width: 120, textAlign: "center", pointerEvents: "none" }}>
            <div style={{ fontSize: 30, lineHeight: "34px", fontWeight: 800, color: c.onPrimary, background: mix(c.card, p.dark, theme.mode === "dark" ? 0.4 : 0.9) }}>{clockText(roofAt)}</div>
            <div style={{ fontSize: 12, lineHeight: "14px", color: c.onPrimary, background: mix(c.card, p.dark, theme.mode === "dark" ? 0.4 : 0.9) }}>{`on ${state.roofName}`}</div>
            <div style={{ display: "inline-block", marginTop: 4, padding: "0 8px", height: 20, borderRadius: 10, fontSize: 12, fontWeight: 700, lineHeight: "20px", background: mix(late > 0 ? c.negative : c.positive, p.dark, theme.mode === "dark" ? 0.5 : 0.35), color: c.onPrimary }}>{status}</div>
          </div>
          {crew.length ? (
            <div style={{ position: "absolute", left: r1(caravan.x - 8 - crew.length * 6), top: r1(caravan.y - 10), display: "flex", pointerEvents: "none" }}>
              {crew.map((u, k) => (
                <span key={u} style={{ marginLeft: k ? -8 : 0, borderRadius: 10, boxShadow: `0 0 0 1.5px ${c.card}`, display: "inline-flex" }}>
                  <Avatar user={person(u)} size={20} />
                </span>
              ))}
            </div>
          ) : null}
          {nodes.map((nd) => {
            const out = { x: cx + (R + 30) * Math.cos(toAngle(nd.x, nd.y)), y: cy + (R + 30) * Math.sin(toAngle(nd.x, nd.y)) };
            const vertical = Math.abs(out.x - cx) < 60;
            const times = `${clockText(nd.l.arrive)}–${clockText(nd.l.leave)}`;
            const node = <div style={{ position: "absolute", left: r1(nd.x - 15), top: r1(nd.y - 15), width: 30, height: 30, borderRadius: 15, background: mix(hueOf(nd.l.stop), p.dark, 0.35), color: c.onPrimary, boxShadow: `0 0 0 3px ${c.card}${local.drag === nd.l.stop.id ? `, 0 0 0 6px ${c.primary}` : ""}`, fontSize: 14, fontWeight: 800, lineHeight: "30px", textAlign: "center" }}>{nd.i + 1}</div>;
            if (vertical) {
              const one = fitText(`${nd.l.stop.name} · ${clockText(nd.l.arrive)}`, W - 24, { size: 12, weight: 600, min: 10 });
              return (
                <div key={`n${nd.l.stop.id}`} style={{ pointerEvents: "none" }}>
                  {node}
                  <div style={{ position: "absolute", left: 0, right: 0, top: nd.y > cy ? DIAL_H - 20 : 2, textAlign: "center" }}>
                    <span style={{ display: "inline-block", height: 18, padding: "0 8px", borderRadius: 9, background: c.card, color: c.text, fontSize: one.size, fontWeight: 600, lineHeight: "18px", whiteSpace: "nowrap" }}>{one.text}</span>
                  </div>
                </div>
              );
            }
            const left = out.x < cx;
            const ax = out.x;
            const ay = Math.max(2, Math.min(DIAL_H - 34, out.y - 16));
            const label = fitText(nd.l.stop.name, Math.max(56, left ? ax - 8 : W - ax - 8), { size: 12, weight: 600, min: 10 });
            return (
              <div key={`n${nd.l.stop.id}`} style={{ pointerEvents: "none" }}>
                {node}
                <div style={{ position: "absolute", top: r1(ay), ...(left ? { right: r1(W - ax) } : { left: r1(ax) }), textAlign: left ? "right" : "left", whiteSpace: "nowrap", maxWidth: Math.max(56, left ? ax - 8 : W - ax - 8), overflow: "hidden" }}>
                  <div style={{ fontSize: label.size, lineHeight: "16px", fontWeight: 600, color: c.text }}>{label.text}</div>
                  <div style={{ fontSize: 11, lineHeight: "14px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis" }}>{times}</div>
                </div>
              </div>
            );
          })}
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: DIAL_H }}>
            <Canvas height={DIAL_H} label="Drag a numbered stop around the dial to change the order" drag={!saved} onPointer={onPointer} draw={() => false} />
          </div>
          {savedNow ? (
            <div style={{ position: "absolute", left: r1(arr.x), top: r1(arr.y), pointerEvents: "none" }}>
              <Burst key={state.savedAt} emoji="🎆" />
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, height: 44 }}>
          {state.going.length ? <Facepile users={state.going.map(person)} max={3} size={22} /> : null}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: saved ? c.text : c.secondaryText, fontWeight: saved ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {saved ? "Saved to the event" : late > 0 ? "Drag to fix it" : `${state.going.length} going`}
          </span>
          {here ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "in" })}>
              {imIn ? "I'm out" : "I'm in"}
            </Button>
          ) : null}
          {!saved && here ? (
            <Button
              kind="primary"
              disabled={late > 0}
              onClick={() => {
                dispatch({ t: "save" });
                haptic("success");
              }}
            >
              Save route
            </Button>
          ) : null}
        </div>
        {savedNow ? <Toast key={state.savedAt}>{`Saved · ${state.roofName} by ${clockText(roofAt)}`}</Toast> : null}
      </div>
    );
  },
});
