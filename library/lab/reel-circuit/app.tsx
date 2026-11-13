import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  running,
  tween,
  userColor,
  type Ctx,
  type Member,
  type Meta,
  type Theme,
} from "@muse/app";

// Reel circuit: the workout reel's moves drawn as stations around a ring, with a little runner going
// round them. Join and you get a lane inside the ring; every session you log fills a third of your
// lane. When every lane is full the ring closes for the week.

type Move = "squat" | "pushup" | "plank" | "jack" | "lunge" | "burpee" | "crunch" | "highknee";
type Params = {
  /** Card title */
  title: string;
  /** Who shared the reel, how long it is, and what they said */
  from: string;
  mins: number;
  quote: string;
  /** Sessions each person does this week */
  target: number;
  /** 4 to 8 moves around the ring */
  moves: { name: string; move: Move }[];
  /** People already in, with sessions done and an optional line */
  people: { who: string; done: number; note?: string }[];
};

// @params
const P: Params = {
  title: "Dorm circuit, 3x this week",
  from: "Maya",
  mins: 20,
  quote: "doing this 3x a week, who's in",
  target: 3,
  moves: [
    { name: "Squats", move: "squat" },
    { name: "Push-ups", move: "pushup" },
    { name: "Jacks", move: "jack" },
    { name: "Lunges", move: "lunge" },
    { name: "Plank", move: "plank" },
    { name: "Burpees", move: "burpee" },
  ],
  people: [
    { who: "Maya", done: 2, note: "did it at 7am, who are you people" },
    { who: "Tsai Lin", done: 2 },
    { who: "Arun", done: 2, note: "rice cooker timer is my rest timer" },
    { who: "Will", done: 1, note: "did it, then a 25 minute shower" },
  ],
};
// @end params

type Person = { id: string; done: number; at: number; note: string };
type State = { title: string; from: string; mins: number; quote: string; target: number; moves: { name: string; move: Move }[]; people: Person[]; cast: string[] };
type Action = { t: "join" } | { t: "log" } | { t: "leave" };
type Local = { toast: number };

const MOVES: Move[] = ["squat", "pushup", "plank", "jack", "lunge", "burpee", "crunch", "highknee"];
const H = 262;
const FILL = tween({ duration: 700, easing: "decelerate" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idFor = (ctx: Ctx, name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? name;
const doneAll = (s: State) => s.people.reduce((n, p) => n + p.done, 0);
const closed = (s: State) => s.people.length >= 2 && s.people.every((p) => p.done >= s.target);

function initState(ctx: Ctx): State {
  const target = Number.isInteger(P.target) && P.target >= 1 && P.target <= 7 ? P.target : 3;
  const moves = (Array.isArray(P.moves) ? P.moves : []).slice(0, 8).map((m, i) => ({ name: clean(m?.name, 14) || `Move ${i + 1}`, move: MOVES.includes(m?.move) ? m.move : MOVES[i % MOVES.length]! }));
  while (moves.length < 4) moves.push({ name: `Move ${moves.length + 1}`, move: MOVES[moves.length]! });
  const people: Person[] = [];
  const cast: string[] = [];
  for (const p of Array.isArray(P.people) ? P.people : []) {
    const name = clean(p?.who, 20);
    if (!name || people.length >= 6) continue;
    const id = idFor(ctx, name);
    if (people.some((x) => x.id === id)) continue;
    cast.push(id);
    people.push({ id, done: Number.isInteger(p.done) ? Math.max(0, Math.min(target, p.done)) : 0, at: 0, note: clean(p.note, 50) });
  }
  return { title: clean(P.title, 40) || "Workout circuit", from: clean(P.from, 20), mins: Number.isInteger(P.mins) && P.mins > 0 && P.mins < 240 ? P.mins : 20, quote: clean(P.quote, 50), target, moves, people, cast };
}

function reduceIt(s: State, a: Action, m: Meta, ctx: Ctx): State {
  const u = m.user;
  if (!inChat(ctx, u)) return s;
  const mine = s.people.find((p) => p.id === u);
  if (a.t === "join") {
    if (mine || s.people.length >= 6) return s;
    return { ...s, people: [...s.people, { id: u, done: 0, at: 0, note: "" }] };
  }
  if (a.t === "log") {
    if (!mine || mine.done >= s.target) return s;
    return { ...s, people: s.people.map((p) => (p.id === u ? { ...p, done: p.done + 1, at: Math.max(1, m.time) } : p)) };
  }
  if (a.t === "leave") {
    if (!mine) return s;
    return { ...s, people: s.people.filter((p) => p.id !== u) };
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

/** A little figure doing the move, in a 32 x 32 box centered on (x, y). `k` bobs it. */
function moveArt(mv: Move, x: number, y: number, ink: string, k: number) {
  const b = Math.sin(k) * 1.5;
  const L = (x1: number, y1: number, x2: number, y2: number) => `M ${(x + x1).toFixed(1)} ${(y + y1).toFixed(1)} L ${(x + x2).toFixed(1)} ${(y + y2).toFixed(1)}`;
  let d = "";
  let hx = 0, hy = -9;
  if (mv === "squat") { d = [L(0, -5 + b, 0, 3 + b), L(0, 3 + b, 6, 5), L(6, 5, 2, 11), L(0, -3 + b, 9, -3 + b)].join(" "); hy = -9 + b; }
  else if (mv === "pushup") { d = [L(-10, 2 + b, 10, 6), L(-8, 2 + b, -8, 9), L(10, 6, 12, 9)].join(" "); hx = -13; hy = 1 + b; }
  else if (mv === "plank") { d = [L(-9, 3, 11, 7), L(-7, 3, -9, 9), L(-9, 9, -4, 9), L(11, 7, 12, 9)].join(" "); hx = -12; hy = 1; }
  else if (mv === "jack") { const o = 4 + 3 * Math.sin(k); d = [L(0, -5, 0, 4), L(0, 4, -o, 11), L(0, 4, o, 11), L(0, -3, -o - 3, -9 + o * 0.4), L(0, -3, o + 3, -9 + o * 0.4)].join(" "); }
  else if (mv === "lunge") { d = [L(0, -5 + b, 0, 3 + b), L(0, 3 + b, 7, 5), L(7, 5, 7, 11), L(0, 3 + b, -6, 8), L(-6, 8, -11, 10), L(0, -3 + b, 0, 2 + b)].join(" "); hy = -9 + b; }
  else if (mv === "burpee") { const up = Math.sin(k) > 0; d = up ? [L(0, -7, 0, 2), L(0, 2, -3, 10), L(0, 2, 3, 10), L(0, -5, -4, -13), L(0, -5, 4, -13)].join(" ") : [L(-6, 4, 8, 4), L(8, 4, 3, 10), L(-6, 4, -6, 10)].join(" "); hx = up ? 0 : -9; hy = up ? -11 : 1; }
  else if (mv === "crunch") { d = [L(-2, 6, 8, 6), L(8, 6, 10, 0), L(10, 0, 12, 6), L(-2, 6, -6, -1 + b)].join(" "); hx = -8; hy = -4 + b; }
  else { d = [L(0, -5, 0, 3), L(0, 3, 0, 11), L(0, 3, 6, 3 + 2 * Math.sin(k)), L(6, 3 + 2 * Math.sin(k), 6, 9), L(0, -3, -5, 2), L(0, -3, 5, -6)].join(" "); }
  return (
    <g>
      <path d={d} fill="none" stroke={ink} stroke-width={2.2} stroke-linecap="round" stroke-linejoin="round" />
      <circle cx={x + hx} cy={y + hy} r={3.4} fill={ink} />
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Reel circuit",
  summary: (s) => (closed(s) ? `${s.title}: ring closed · ${s.people.length} people, ${doneAll(s)} sessions` : `${s.title}: ${doneAll(s)} of ${s.people.length * s.target} sessions · ${s.people.length} in`),

  init: initState,
  reduce: (s, a, m, ctx) => reduceIt(s, a, m, ctx),
  onMembers: (s, ctx) => {
    const people = s.people.filter((p) => inChat(ctx, p.id) || s.cast.includes(p.id));
    return people.length === s.people.length ? s : { ...s, people };
  },

  invariants: {
    "sessions are whole and capped": (s) => s.people.every((p) => Number.isInteger(p.done) && p.done >= 0 && p.done <= s.target),
    "one lane per person, six at most": (s) => new Set(s.people.map((p) => p.id)).size === s.people.length && s.people.length <= 6,
    "lanes belong to the chat or the people named": (s, ctx) => s.people.every((p) => inChat(ctx, p.id) || s.cast.includes(p.id)),
    "a logged session has a time": (s) => s.people.every((p) => p.at === 0 || p.at > 0),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a log adds one session, mine": (p, n, a, m) => {
      if (a.t !== "log" || p === n) return true;
      const was = p.people.find((x) => x.id === m.user);
      const now = n.people.find((x) => x.id === m.user);
      return !!was && !!now && now.done === was.done + 1 && now.at === Math.max(1, m.time) && n.people.every((x) => x.id === m.user || p.people.some((y) => y.id === x.id && y.done === x.done));
    },
    "joining adds my empty lane at the end": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const last = n.people[n.people.length - 1];
      return !p.people.some((x) => x.id === m.user) && n.people.length === p.people.length + 1 && !!last && last.id === m.user && last.done === 0;
    },
    "leaving removes only my lane": (p, n, a, m) => a.t !== "leave" || p === n || (!n.people.some((x) => x.id === m.user) && n.people.length === p.people.length - 1),
    "lanes only move by join, log and leave": (p, n, a) => a.t === "join" || a.t === "log" || a.t === "leave" || n.people === p.people,
  },

  arbitrary: (s, u, r) => {
    const mine = s.people.find((p) => p.id === u);
    if (!mine) return { t: "join" };
    const k = r.next();
    return k < 0.08 ? { t: "leave" } : k < 0.15 ? { t: "join" } : { t: "log" };
  },

  local: { toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const now = clock.value;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(92, W / 2 - 34);
    const nm = state.moves.length;
    const lap = (now / 1000 / (state.mins * 3)) % 1; // the runner: a lap every few seconds per reel minute
    const station = Math.round(lap * nm) % nm;
    const mine = state.people.find((x) => x.id === me);
    const isClosed = closed(state);
    const total = state.people.length * state.target;
    const done = doneAll(state);
    const lanes = state.people.slice(0, 6);
    const laneR = (i: number) => R - 26 - i * 7;
    const ang = (f: number) => -Math.PI / 2 + f * 2 * Math.PI;
    const arc = (r: number, f0: number, f1: number) => {
      const a0 = ang(f0), a1 = ang(f1);
      const large = f1 - f0 > 0.5 ? 1 : 0;
      return `M ${(cx + r * Math.cos(a0)).toFixed(1)} ${(cy + r * Math.sin(a0)).toFixed(1)} A ${r} ${r} 0 ${large} 1 ${(cx + r * Math.cos(a1)).toFixed(1)} ${(cy + r * Math.sin(a1)).toFixed(1)}`;
    };
    const ink = c.text;
    const runnerA = ang(lap);
    const note = [...state.people].reverse().find((x) => x.note);
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id;
    const gap = 0.012;
    const label = `${state.moves.length} moves in a ring; ${done} of ${total} sessions done`;
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${state.from ? `${state.from}'s ${state.mins}-minute reel · ` : ""}${state.people.length} in · ${done} of ${total} sessions`} />
        <div style={{ position: "relative", height: H, marginTop: 2 }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ position: "absolute", left: 0, top: 0 }}>
            {/* the track */}
            <circle cx={cx} cy={cy} r={R} fill="none" stroke={isClosed ? p.green : c.wash} stroke-width={isClosed ? 10 : 8} />
            <circle cx={cx} cy={cy} r={R} fill="none" stroke={c.card} stroke-width={1.5} stroke-dasharray="3 7" />
            {/* lanes: a third of the ring per session */}
            {lanes.map((pp, i) => {
              const r = laneR(i);
              const segs = [];
              for (let k = 0; k < state.target; k++) {
                const f0 = k / state.target + gap, f1 = (k + 1) / state.target - gap;
                segs.push(<path key={`t${k}`} d={arc(r, f0, f1)} fill="none" stroke={c.wash} stroke-width={5} stroke-linecap="round" />);
                if (k < pp.done) {
                  const fresh = k === pp.done - 1 && pp.at > 0 ? running(pp.at, 700) : null;
                  const e = fresh === null ? 1 : FILL(fresh);
                  segs.push(<path key={`f${k}`} d={arc(r, f0, f0 + (f1 - f0) * Math.max(0.02, e))} fill="none" stroke={userColor(pp.id, theme)} stroke-width={5} stroke-linecap="round" />);
                }
              }
              return <g key={pp.id}>{segs}</g>;
            })}
            {/* stations */}
            {state.moves.map((mv, i) => {
              const a = ang(i / nm);
              const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
              const on = i === station;
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r={19} fill={on ? mix(p.yellow, c.card, 0.35) : c.card} stroke={on ? p.yellow : c.divider} stroke-width={on ? 2.5 : 1.5} />
                  {moveArt(mv.move, x, y + 1, ink, on ? now / 160 : 0)}
                </g>
              );
            })}
            {/* the runner */}
            <circle cx={cx + R * Math.cos(runnerA)} cy={cy + R * Math.sin(runnerA)} r={5} fill={c.primary} stroke={c.card} stroke-width={2} />
          </svg>
          {/* station names */}
          {state.moves.map((mv, i) => {
            const a = ang(i / nm);
            const x = cx + (R + 0) * Math.cos(a);
            const y = cy + (R + 0) * Math.sin(a);
            const right = Math.cos(a) > 0.3, left = Math.cos(a) < -0.3;
            const f = fitText(mv.name, 64, { size: 12, min: 10 });
            const top = Math.sin(a) < -0.9 ? y - 36 : Math.sin(a) > 0.9 ? y + 20 : y - 8;
            const lx = right ? x + 22 : left ? x - 22 - 64 : x - 32;
            return (
              <span key={i} style={{ position: "absolute", left: Math.max(0, Math.min(W - 64, lx)), top, width: 64, textAlign: right ? "left" : left ? "right" : "center", fontSize: f.size, lineHeight: "16px", color: i === station ? c.text : c.secondaryText, fontWeight: i === station ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.text}</span>
            );
          })}
          {/* the middle */}
          <div style={{ position: "absolute", left: cx - 34, top: cy - 20, width: 68, textAlign: "center" }}>
            <div style={{ fontSize: 19, lineHeight: "22px", fontWeight: 800, color: isClosed ? c.text : c.text }}>{state.people.length ? `${done}/${total}` : "0"}</div>
            <div style={{ fontSize: 11, lineHeight: "14px", color: c.secondaryText }}>{isClosed ? "ring closed" : state.people.length ? "sessions" : "nobody yet"}</div>
          </div>
          {isClosed ? (
            <span style={{ position: "absolute", right: 0, top: 6, padding: "2px 10px", borderRadius: 999, background: p.green, color: c.onPrimary, fontSize: 13, fontWeight: 700, lineHeight: "20px", transform: "rotate(6deg)" }}>Week done</span>
          ) : null}
        </div>
        {/* whose lane is whose */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 4, minHeight: 28 }}>
          {lanes.length ? (
            lanes.map((pp) => (
              <span key={pp.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px 2px 2px", borderRadius: 999, background: pp.id === me ? c.selected : c.wash, fontSize: 12, lineHeight: "16px", color: c.text, fontVariantNumeric: "tabular-nums" }}>
                <Face id={pp.id} members={members} size={22} theme={theme} />
                {`${pp.done}/${state.target}`}
              </span>
            ))
          ) : (
            <span style={{ padding: "4px 12px", borderRadius: 999, border: `1.5px dashed ${c.divider}`, fontSize: 12, color: c.secondaryText }}>Lanes appear here</span>
          )}
        </div>
        <div style={{ marginTop: 6, minHeight: 18, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {mine
            ? mine.done >= state.target
              ? `You did all ${state.target} · ${state.people.filter((x) => x.done < state.target).length} still going`
              : `You: ${mine.done} of ${state.target} · each session fills a third of your lane`
            : note
              ? `${nameOf(note.id)}: “${note.note}”`
              : state.quote && state.from
                ? `${state.from}: “${state.quote}”`
                : "Join and your lane appears inside the ring"}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            {mine ? (
              <Button kind="primary" wide disabled={mine.done >= state.target} onClick={() => { haptic("success"); setLocal({ toast: local.toast + 1 }); dispatch({ t: "log" }); }}>
                {mine.done >= state.target ? "Done this week" : "Log a session"}
              </Button>
            ) : (
              <Button kind="primary" wide disabled={state.people.length >= 6} onClick={() => { haptic("success"); dispatch({ t: "join" }); }}>
                I'm in
              </Button>
            )}
          </div>
          {mine ? <Button kind="secondary" onClick={() => dispatch({ t: "leave" })}>Leave</Button> : null}
        </div>
        {local.toast > 0 && mine && mine.at > 0 ? <Toast key={local.toast}>{isClosed ? "Ring closed for the week" : `Session ${mine.done} of ${state.target} logged`}</Toast> : null}
      </div>
    );
  },
});
