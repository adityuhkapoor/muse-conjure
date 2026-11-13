import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  Facepile,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  running,
  type Child,
  type Ctx,
  type Member,
} from "@muse/app";

// Freshman year and senior year of the same six, drawn as two panels with a wipe handle between
// them. Drag the handle and each friend changes from then to now, with their own then-and-now
// lines. Play runs it as a short reel that lands on a soft beat at the end.

type Params = {
  /** Reel title */
  title: string;
  /** The two years on the stamps */
  then: string;
  now: string;
  /** Where each photo was taken */
  thenPlace: string;
  nowPlace: string;
  /** 2 to 6 friends, each with a then line and a now line in their words */
  people: { name: string; then: string; now: string }[];
  /** Who already watched it to the end */
  watched: string[];
  /** Reactions already left: kind is cry, heart or laugh */
  reacts: { by: string; kind: string }[];
};

// @params
const P: Params = {
  title: "Then and now",
  then: "2023",
  now: "2027",
  thenPlace: "Hollis Dining Hall · orientation",
  nowPlace: "the Quad · last week",
  people: [
    { name: "Calvin", then: "1 alarm", now: "7 alarms" },
    { name: "Maya", then: "one notebook", now: "color-coded life" },
    { name: "Arun", then: "microwave ramen", now: "rice cooker chef" },
    { name: "Tsai Lin", then: "shared the aux", now: "aux veto" },
    { name: "Will", then: "bus pass", now: "the sube" },
    { name: "Aditya", then: "said yes", now: "says lowkey" },
  ],
  watched: ["Maya", "Will", "Tsai Lin"],
  reacts: [
    { by: "Maya", kind: "cry" },
    { by: "Will", kind: "laugh" },
    { by: "Tsai Lin", kind: "cry" },
  ],
};
// @end params

const KINDS = ["cry", "heart", "laugh"] as const;
type Person = { name: string; then: string; now: string };
type React = { user: string; kind: number; at: number };
type State = { title: string; then: string; now: string; thenPlace: string; nowPlace: string; people: Person[]; watched: string[]; reacts: React[] };
type Action = { t: "watched" } | { t: "react"; kind: number };
type Local = { wipe: number; playAt: number; endAt: number };

const REEL_H = 478;
const PLAY_MS = 3200;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const standIn = (u: string) => u.startsWith("~");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const r1 = (n: number) => Math.round(n * 10) / 10;

function initState(ctx: Ctx): State {
  const idFor = (name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? `~${name}`;
  const people: Person[] = [];
  for (const x of Array.isArray(P.people) ? P.people : []) {
    const name = clean(x?.name, 16);
    if (!name || people.length >= 6 || people.some((p) => p.name === name)) continue;
    people.push({ name, then: clean(x?.then, 22), now: clean(x?.now, 22) });
  }
  if (people.length === 0) for (const m of ctx.members.slice(0, 6)) people.push({ name: clean(m.name, 16) || "Friend", then: "", now: "" });
  const watched: string[] = [];
  for (const w of Array.isArray(P.watched) ? P.watched : []) {
    const u = idFor(clean(w, 16));
    if (u !== "~" && !watched.includes(u)) watched.push(u);
  }
  const reacts: React[] = [];
  for (const r of Array.isArray(P.reacts) ? P.reacts : []) {
    const u = idFor(clean(r?.by, 16));
    const k = KINDS.indexOf(r?.kind as (typeof KINDS)[number]);
    if (u === "~" || k < 0 || reacts.some((x) => x.user === u)) continue;
    reacts.push({ user: u, kind: k, at: 0 });
    if (!watched.includes(u)) watched.push(u);
  }
  return {
    title: clean(P.title, 30) || "Then and now",
    then: clean(P.then, 6) || "Then",
    now: clean(P.now, 6) || "Now",
    thenPlace: clean(P.thenPlace, 40),
    nowPlace: clean(P.nowPlace, 40),
    people,
    watched,
    reacts,
  };
}

// ---- drawing ----

type Pal = ReturnType<typeof pal>;

/** A head and shoulders at (x, y) with head radius r: freshman look or senior look. */
function bust(i: number, x: number, y: number, r: number, p: Pal, senior: boolean, key: string): Child {
  const skin = [mix(p.cream, p.brown, 0.2), mix(p.cream, p.brown, 0.45), mix(p.brown, p.cream, 0.35), mix(p.cream, p.brown, 0.1), mix(p.cream, p.brown, 0.3), mix(p.brown, p.cream, 0.5)][i % 6]!;
  const hair = [p.dark, mix(p.brown, p.dark, 0.4), p.dark, mix(p.dark, p.brown, 0.2), mix(p.orange, p.brown, 0.5), p.dark][i % 6]!;
  const shirtThen = [p.blue, p.yellow, p.green, p.red, p.orange, p.purple].map((c) => mix(c, p.paper, 0.35))[i % 6]!;
  const shirtNow = [mix(p.dark, p.blue, 0.3), p.purple, mix(p.green, p.dark, 0.4), p.dark, mix(p.red, p.dark, 0.3), mix(p.blue, p.dark, 0.2)][i % 6]!;
  const o: Child[] = [];
  const f = (n: number) => r1(n);
  // shoulders
  o.push(<rect key="sh" x={f(x - 1.5 * r)} y={f(y + 1.0 * r)} width={f(3 * r)} height={f(2 * r)} rx={f(0.9 * r)} fill={senior ? shirtNow : shirtThen} />);
  if (senior && i % 2 === 0) o.push(<path key="hood" d={`M${f(x - 0.8 * r)} ${f(y + 1.05 * r)} Q${f(x)} ${f(y + 1.7 * r)} ${f(x + 0.8 * r)} ${f(y + 1.05 * r)}`} fill="none" stroke={mix(shirtNow, p.paper, 0.3)} stroke-width={f(0.18 * r)} />);
  if (!senior) {
    o.push(<path key="lan" d={`M${f(x - 0.55 * r)} ${f(y + 1.0 * r)} L${f(x)} ${f(y + 1.9 * r)} L${f(x + 0.55 * r)} ${f(y + 1.0 * r)}`} fill="none" stroke={p.red} stroke-width={f(0.12 * r)} />);
    o.push(<rect key="badge" x={f(x - 0.28 * r)} y={f(y + 1.85 * r)} width={f(0.56 * r)} height={f(0.42 * r)} rx={2} fill={p.paper} stroke={p.soft} stroke-width={0.8} />);
  }
  o.push(<rect key="nk" x={f(x - 0.25 * r)} y={f(y + 0.7 * r)} width={f(0.5 * r)} height={f(0.45 * r)} fill={skin} />);
  // hair behind
  if (senior ? i === 1 || i === 3 : i === 1) o.push(<rect key="hb" x={f(x - 1.1 * r)} y={f(y - 0.5 * r)} width={f(2.2 * r)} height={f(senior ? 1.9 * r : 1.4 * r)} rx={f(0.6 * r)} fill={hair} />);
  o.push(<circle key="face" cx={f(x)} cy={f(y)} r={f(r)} fill={skin} />);
  // hair on top
  const capHair = (h: number) => `M${f(x - 1.04 * r)} ${f(y - 0.05 * r)} A${f(1.04 * r)} ${f(1.04 * r)} 0 0 1 ${f(x + 1.04 * r)} ${f(y - 0.05 * r)} L${f(x + 0.98 * r)} ${f(y - h * r)} L${f(x - 0.98 * r)} ${f(y - h * r)} Z`;
  if (!senior && i === 0) o.push(<path key="bowl" d={`M${f(x - 1.1 * r)} ${f(y - 0.1 * r)} A${f(1.1 * r)} ${f(1.1 * r)} 0 0 1 ${f(x + 1.1 * r)} ${f(y - 0.1 * r)} Z`} fill={hair} />);
  else if (senior && i === 5) {
    o.push(<path key="beanie" d={capHair(0.3)} fill={p.red} />);
    o.push(<rect key="cuff" x={f(x - 1.06 * r)} y={f(y - 0.42 * r)} width={f(2.12 * r)} height={f(0.32 * r)} rx={f(0.12 * r)} fill={mix(p.red, p.dark, 0.25)} />);
    o.push(<circle key="pom" cx={f(x)} cy={f(y - 1.1 * r)} r={f(0.22 * r)} fill={p.paper} />);
  } else if (senior && i === 4) o.push(<path key="swoop" d={`${capHair(0.4)} M${f(x - 0.9 * r)} ${f(y - 0.5 * r)} L${f(x + 0.7 * r)} ${f(y - 1.25 * r)} L${f(x + 0.5 * r)} ${f(y - 0.25 * r)} Z`} fill={hair} />);
  else o.push(<path key="hair" d={capHair(senior ? 0.32 : 0.4)} fill={hair} />);
  if (!senior && i === 3) o.push(<circle key="bun" cx={f(x)} cy={f(y - 1.05 * r)} r={f(0.35 * r)} fill={hair} />);
  // eyes and glasses
  const ey = y + 0.08 * r;
  o.push(<circle key="e1" cx={f(x - 0.36 * r)} cy={f(ey)} r={f(0.11 * r)} fill={p.dark} />);
  o.push(<circle key="e2" cx={f(x + 0.36 * r)} cy={f(ey)} r={f(0.11 * r)} fill={p.dark} />);
  if (senior && (i === 1 || i === 2)) o.push(<path key="gl" d={`M${f(x - 0.66 * r)} ${f(ey)} a${f(0.28 * r)} ${f(0.28 * r)} 0 1 0 ${f(0.56 * r)} 0 a${f(0.28 * r)} ${f(0.28 * r)} 0 1 0 ${f(-0.56 * r)} 0 M${f(x + 0.1 * r)} ${f(ey)} a${f(0.28 * r)} ${f(0.28 * r)} 0 1 0 ${f(0.56 * r)} 0 a${f(0.28 * r)} ${f(0.28 * r)} 0 1 0 ${f(-0.56 * r)} 0 M${f(x - 0.1 * r)} ${f(ey)} h${f(0.2 * r)}`} fill="none" stroke={p.dark} stroke-width={f(0.07 * r)} />);
  if (senior && i === 2) o.push(<path key="beard" d={`M${f(x - 0.8 * r)} ${f(y + 0.2 * r)} Q${f(x - 0.7 * r)} ${f(y + 1.05 * r)} ${f(x)} ${f(y + 1.05 * r)} Q${f(x + 0.7 * r)} ${f(y + 1.05 * r)} ${f(x + 0.8 * r)} ${f(y + 0.2 * r)} Q${f(x)} ${f(y + 0.6 * r)} ${f(x - 0.8 * r)} ${f(y + 0.2 * r)} Z`} fill={hair} />);
  // mouth: freshman grin with braces, senior easy smile
  if (!senior) {
    o.push(<path key="m" d={`M${f(x - 0.34 * r)} ${f(y + 0.36 * r)} A${f(0.34 * r)} ${f(0.34 * r)} 0 0 0 ${f(x + 0.34 * r)} ${f(y + 0.36 * r)} Z`} fill={mix(p.red, p.dark, 0.55)} />);
    if (i === 2 || i === 4) o.push(<line key="br" x1={f(x - 0.28 * r)} y1={f(y + 0.42 * r)} x2={f(x + 0.28 * r)} y2={f(y + 0.42 * r)} stroke={p.soft} stroke-width={f(0.08 * r)} />);
  } else if (i !== 2) o.push(<path key="m" d={`M${f(x - 0.28 * r)} ${f(y + 0.38 * r)} Q${f(x)} ${f(y + 0.6 * r)} ${f(x + 0.28 * r)} ${f(y + 0.38 * r)}`} fill="none" stroke={p.dark} stroke-width={f(0.08 * r)} stroke-linecap="round" />);
  o.push(<circle key="c1" cx={f(x - 0.6 * r)} cy={f(y + 0.35 * r)} r={f(0.15 * r)} fill={p.red} opacity={0.3} />);
  o.push(<circle key="c2" cx={f(x + 0.6 * r)} cy={f(y + 0.35 * r)} r={f(0.15 * r)} fill={p.red} opacity={0.3} />);
  return <g key={key}>{o}</g>;
}

function face(kind: number, size: number, p: Pal): Child {
  const s = size / 2;
  const base = <circle cx={s} cy={s} r={s - 1} fill={p.yellow} />;
  if (kind === 1)
    return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true"><path d={`M${s} ${size * 0.86} C${size * 0.05} ${size * 0.5} ${size * 0.2} ${size * 0.08} ${s} ${size * 0.3} C${size * 0.8} ${size * 0.08} ${size * 0.95} ${size * 0.5} ${s} ${size * 0.86} Z`} fill={p.red} /></svg>;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {base}
      {kind === 0 ? (
        <g>
          <path d={`M${size * 0.28} ${size * 0.42} q${size * 0.08} -${size * 0.08} ${size * 0.16} 0 M${size * 0.56} ${size * 0.42} q${size * 0.08} -${size * 0.08} ${size * 0.16} 0`} fill="none" stroke={p.dark} stroke-width={1.6} stroke-linecap="round" />
          <path d={`M${size * 0.38} ${size * 0.7} q${size * 0.12} -${size * 0.1} ${size * 0.24} 0`} fill="none" stroke={p.dark} stroke-width={1.6} stroke-linecap="round" />
          <ellipse cx={size * 0.3} cy={size * 0.6} rx={size * 0.06} ry={size * 0.12} fill={p.blue} />
        </g>
      ) : (
        <g>
          <path d={`M${size * 0.26} ${size * 0.4} l${size * 0.14} ${size * 0.06} l-${size * 0.14} ${size * 0.06} M${size * 0.74} ${size * 0.4} l-${size * 0.14} ${size * 0.06} l${size * 0.14} ${size * 0.06}`} fill="none" stroke={p.dark} stroke-width={1.6} stroke-linecap="round" />
          <path d={`M${size * 0.28} ${size * 0.6} H${size * 0.72} Q${size * 0.7} ${size * 0.86} ${s} ${size * 0.86} Q${size * 0.3} ${size * 0.86} ${size * 0.28} ${size * 0.6} Z`} fill={p.dark} />
        </g>
      )}
    </svg>
  );
}

const CSS =
  "@keyframes tnRing{from{transform:scale(.4);opacity:.8}to{transform:scale(2.4);opacity:0}}" +
  "@keyframes tnStamp{0%{transform:scale(1.8) rotate(-8deg);opacity:0}60%{transform:scale(.92) rotate(-8deg);opacity:1}100%{transform:scale(1) rotate(-8deg)}}" +
  "@keyframes tnNudge{0%,100%{transform:translateX(0)}50%{transform:translateX(6px)}}" +
  ".tn-ring{position:absolute;border-radius:50%;animation:tnRing 1.1s ease-out both}" +
  ".tn-stamp{animation:tnStamp .5s cubic-bezier(.34,1.56,.64,1) both}" +
  ".tn-nudge{animation:tnNudge 1.4s ease-in-out infinite}" +
  "@media (prefers-reduced-motion:reduce){.tn-ring,.tn-stamp,.tn-nudge{animation:none}}";

export default defineApp<State, Action, Local>({
  name: "Then and now",
  summary: (s) => `${s.title}: ${s.then} to ${s.now} · ${s.watched.length} watched · ${s.reacts.length} reactions`,

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "watched") {
      if (state.watched.includes(meta.user)) return state;
      return { ...state, watched: [...state.watched, meta.user] };
    }
    if (action.t === "react") {
      const k = action.kind;
      if (typeof k !== "number" || !Number.isInteger(k) || k < 0 || k >= KINDS.length) return state;
      const mine = state.reacts.find((r) => r.user === meta.user);
      const rest = state.reacts.filter((r) => r.user !== meta.user);
      if (mine && mine.kind === k) return { ...state, reacts: rest };
      return { ...state, reacts: [...rest, { user: meta.user, kind: k, at: meta.time }], watched: state.watched.includes(meta.user) ? state.watched : [...state.watched, meta.user] };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const watched = state.watched.filter((u) => standIn(u) || inChat(ctx, u));
    const reacts = state.reacts.filter((r) => standIn(r.user) || inChat(ctx, r.user));
    return watched.length === state.watched.length && reacts.length === state.reacts.length ? state : { ...state, watched, reacts };
  },

  invariants: {
    "watched once each": (s) => new Set(s.watched).size === s.watched.length,
    "one reaction each, of a known kind": (s) => new Set(s.reacts.map((r) => r.user)).size === s.reacts.length && s.reacts.every((r) => Number.isInteger(r.kind) && r.kind >= 0 && r.kind < KINDS.length),
    "people who react have watched": (s) => s.reacts.every((r) => s.watched.includes(r.user)),
    "everyone counted is in the chat or the post": (s, ctx) => s.watched.every((u) => standIn(u) || inChat(ctx, u)),
  },

  transitions: {
    "watching adds only me": (p, n, a, m) => a.t !== "watched" || p === n || (n.watched.length === p.watched.length + 1 && n.watched[n.watched.length - 1] === m.user && same(p.reacts, n.reacts)),
    "a reaction changes only mine": (p, n, a, m) => a.t !== "react" || p === n || same(p.reacts.filter((r) => r.user !== m.user), n.reacts.filter((r) => r.user !== m.user)),
    "the same reaction twice takes it back, a new one lands": (p, n, a, m, ctx) => {
      if (a.t !== "react" || !inChat(ctx, m.user) || !Number.isInteger(a.kind) || a.kind < 0 || a.kind > 2) return true;
      const was = p.reacts.find((r) => r.user === m.user);
      const now = n.reacts.find((r) => r.user === m.user);
      return was?.kind === a.kind ? !now : !!now && now.kind === a.kind && now.at === m.time;
    },
    "nobody unwatches": (p, n, _a, _m, ctx) => p.watched.every((u) => n.watched.includes(u) || (!standIn(u) && !inChat(ctx, u))),
    "the reel never changes": (p, n) => same(p.people, n.people) && p.then === n.then && p.now === n.now && p.title === n.title,
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _u, r) => (r.next() < 0.3 ? { t: "watched" } : r.next() < 0.05 ? { t: "react", kind: 5 } : { t: "react", kind: r.int(3) }),

  local: { wipe: 0.38, playAt: 0, endAt: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const H = REEL_H;
    const person = (u: string): Member => (standIn(u) ? { id: u, name: u.slice(1) } : members.find((m) => m.id === u)) ?? { id: u, name: "Friend" };
    const here = members.some((m) => m.id === me);
    const watchedMe = state.watched.includes(me);
    const myReact = state.reacts.find((r) => r.user === me);

    const playE = local.playAt > 0 ? running(local.playAt, PLAY_MS) : null;
    const playing = playE !== null;
    const k = playing ? Math.min(1, (playE / PLAY_MS) ** 1.2) : local.wipe;
    const wipeX = Math.max(0, Math.min(W, k * W));
    const ended = k >= 0.995;
    const beat = local.endAt > 0 ? running(local.endAt, 1400) : null;
    const beatOn = beat !== null || (local.playAt > 0 && running(local.playAt, PLAY_MS + 1400) !== null);

    // Two rows of busts.
    const n = state.people.length;
    const back = Math.ceil(n / 2);
    const front = n - back;
    const r = Math.min(36, W / (Math.max(back, 1) * 3.5));
    const spots = state.people.map((_, i) => {
      const row = i < back ? 0 : 1;
      const cnt = row === 0 ? back : front;
      const kk = row === 0 ? i : i - back;
      const gap = W / (cnt + 0.4);
      return { x: W / 2 + (kk - (cnt - 1) / 2) * gap + (row === 1 ? gap * 0.15 : -gap * 0.1), y: row === 0 ? H * 0.28 : H * 0.6 };
    });

    const thenBg = mix(p.orange, p.cream, 0.55);
    const nowBg = mix(p.blue, p.dark, 0.55);
    const scene = (senior: boolean) => (
      <g>
        <rect x={0} y={0} width={W} height={H} fill={senior ? nowBg : thenBg} />
        {senior ? (
          <g>
            <circle cx={W * 0.8} cy={H * 0.12} r={22} fill={mix(p.yellow, p.orange, 0.3)} />
            <path d={`M0 ${H * 0.5} Q${W * 0.3} ${H * 0.42} ${W * 0.55} ${H * 0.48} T${W} ${H * 0.44} V${H} H0 Z`} fill={mix(p.green, p.dark, 0.45)} />
            <path d={`M${W * 0.1} ${H * 0.47} v-40 l-12 40 M${W * 0.1} ${H * 0.36} l12 10`} stroke={mix(p.brown, p.dark, 0.3)} stroke-width={3} />
            <circle cx={W * 0.1} cy={H * 0.32} r={22} fill={mix(p.green, p.dark, 0.3)} />
            <rect x={W * 0.62} y={H * 0.26} width={W * 0.3} height={H * 0.2} fill={mix(p.red, p.dark, 0.45)} />
            <path d={`M${W * 0.6} ${H * 0.26} L${W * 0.77} ${H * 0.18} L${W * 0.94} ${H * 0.26} Z`} fill={mix(p.red, p.dark, 0.6)} />
          </g>
        ) : (
          <g>
            <rect x={0} y={H * 0.46} width={W} height={H * 0.54} fill={mix(thenBg, p.brown, 0.25)} />
            {[0, 1, 2, 3].map((q) => <rect key={q} x={W * (0.06 + q * 0.24)} y={H * 0.08} width={W * 0.16} height={H * 0.18} rx={4} fill={mix(thenBg, p.paper, 0.5)} />)}
            <rect x={W * 0.18} y={H * 0.04} width={W * 0.64} height={20} rx={3} fill={mix(p.red, thenBg, 0.3)} />
          </g>
        )}
        {state.people.map((_, i) => bust(i, spots[i]!.x, spots[i]!.y, r, p, senior, `b${i}`))}
        {!senior ? <rect x={0} y={0} width={W} height={H} fill={p.yellow} opacity={0.12} /> : null}
      </g>
    );
    const clipId = `tn${Math.round(W)}${theme.mode}`;

    const onPointer = (e: { type: string; x: number; y: number }) => {
      if (local.playAt > 0 && playing) return;
      const v = Math.max(0, Math.min(1, e.x / W));
      const patch: Partial<Local> = { wipe: v, playAt: 0 };
      if (e.type === "up" && v >= 0.97) {
        patch.wipe = 1;
        patch.endAt = clock.peek();
        if (here && !watchedMe) dispatch({ t: "watched" });
        haptic("success");
      }
      setLocal(patch);
    };

    const captions = state.people.map((pp, i) => {
      const s = spots[i]!;
      const isNow = wipeX > s.x;
      const text = isNow ? pp.now : pp.then;
      const w = Math.min(W / Math.max(back, 1) - 8, 120);
      const fit = fitText(text, w - 12, { size: 13, weight: 600, min: 10 });
      const nm = fitText(pp.name, w - 12, { size: 11, min: 10 });
      return (
        <div key={`cap${i}`} style={{ position: "absolute", left: r1(s.x - w / 2), top: r1(s.y + r * 2.1), width: w, textAlign: "center", pointerEvents: "none" }}>
          <span style={{ display: "inline-block", maxWidth: w, padding: "2px 8px", borderRadius: 10, background: isNow ? c.card : mix(c.card, p.orange, 0.18), color: c.text, whiteSpace: "nowrap" }}>
            <span style={{ display: "block", fontSize: nm.size, lineHeight: "13px", color: c.secondaryText }}>{nm.text}</span>
            <span style={{ display: "block", fontSize: fit.size, lineHeight: "17px", fontWeight: 600 }}>{fit.text || "·"}</span>
          </span>
        </div>
      );
    });

    const counts = KINDS.map((_, kk) => state.reacts.filter((x) => x.kind === kk).length);
    const reactLabel = ["Crying", "Love it", "Laughing"];

    return (
      <div>
        <style>{CSS}</style>
        <div style={{ position: "relative", height: H, borderRadius: 12, overflow: "hidden", background: nowBg }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${state.title}: ${state.people.map((x) => `${x.name}, ${x.then} then, ${x.now} now`).join("; ")}`} style={{ position: "absolute", left: 0, top: 0 }}>
            <defs>
              <clipPath id={clipId}>
                <rect x={0} y={0} width={r1(wipeX)} height={H} />
              </clipPath>
            </defs>
            {scene(false)}
            <g clip-path={`url(#${clipId})`}>{scene(true)}</g>
          </svg>
          {captions}
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H }}>
            <Canvas
              height={H}
              label="Wipe handle: drag right to go from then to now"
              drag
              onPointer={onPointer}
              draw={(g, f) => {
                g.clearRect(0, 0, f.width, f.height);
                const x = Math.max(2, Math.min(f.width - 2, wipeX));
                g.fillStyle = c.onPrimary;
                g.fillRect(x - 1.5, 0, 3, f.height);
                g.beginPath();
                g.arc(x, f.height * 0.88, 20, 0, Math.PI * 2);
                g.fill();
                g.fillStyle = c.primary;
                g.beginPath();
                const y = f.height * 0.88;
                g.moveTo(x - 12, y);
                g.lineTo(x - 5, y - 6);
                g.lineTo(x - 5, y + 6);
                g.closePath();
                g.moveTo(x + 12, y);
                g.lineTo(x + 5, y - 6);
                g.lineTo(x + 5, y + 6);
                g.closePath();
                g.fill();
                return playing;
              }}
            />
          </div>
          <div style={{ position: "absolute", left: 10, right: 10, top: 10, height: 40, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
            <span class="m-mark" aria-hidden="true" style={{ width: 24, height: 24 }} />
            <div style={{ flex: 1, minWidth: 0, padding: "2px 8px", borderRadius: 8, background: mix(nowBg, p.dark, 0.3) }}>
              <div style={{ fontSize: 15, lineHeight: "18px", fontWeight: 600, color: c.onPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.title}</div>
              <div style={{ fontSize: 12, lineHeight: "16px", color: c.onPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wipeX > W / 2 ? state.nowPlace : state.thenPlace}</div>
            </div>
          </div>
          <div style={{ position: "absolute", left: 12, top: 60, padding: "0 8px", height: 26, borderRadius: 6, background: p.paper, color: p.dark, fontSize: 15, fontWeight: 800, lineHeight: "26px", pointerEvents: "none", transform: "rotate(-4deg)" }}>{state.then}</div>
          <div style={{ position: "absolute", right: 12, top: 60, padding: "0 8px", height: 26, borderRadius: 6, background: c.primary, color: c.onPrimary, fontSize: 15, fontWeight: 800, lineHeight: "26px", pointerEvents: "none", transform: "rotate(4deg)" }}>{state.now}</div>
          {k < 0.6 && !playing ? (
            <div class="tn-nudge" style={{ position: "absolute", left: r1(Math.min(W - 130, wipeX + 26)), top: r1(H * 0.88 - 12), height: 24, padding: "0 10px", borderRadius: 12, background: c.card, color: c.text, fontSize: 13, lineHeight: "24px", whiteSpace: "nowrap", pointerEvents: "none" }}>{`Drag to ${state.now}`}</div>
          ) : null}
          {ended && beatOn ? (
            <div aria-hidden="true" style={{ position: "absolute", left: W / 2 - 60, top: H * 0.88 - 60, width: 120, height: 120, pointerEvents: "none" }}>
              <div class="tn-ring" style={{ inset: 0, border: `3px solid ${c.onPrimary}` }} />
              <div class="tn-ring" style={{ inset: 0, border: `3px solid ${c.onPrimary}`, animationDelay: ".35s" }} />
            </div>
          ) : null}
          {ended ? (
            <div class="tn-stamp" style={{ position: "absolute", left: "50%", marginLeft: -78, top: H * 0.88 - 20, width: 156, height: 40, borderRadius: 8, border: `3px solid ${c.onPrimary}`, color: c.onPrimary, background: mix(nowBg, p.dark, 0.3), fontSize: 18, fontWeight: 800, lineHeight: "34px", textAlign: "center", pointerEvents: "none" }}>{`class of ${state.now}`}</div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, height: 44 }}>
          {state.watched.length ? <Facepile users={state.watched.map(person)} max={3} size={20} /> : null}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.watched.length ? `${state.watched.length} watched` : "Be the first to watch"}</span>
          {KINDS.map((kind, kk) => (
            <button
              key={kind}
              type="button"
              class="m-hit"
              aria-label={`${reactLabel[kk]}, ${counts[kk]}`}
              aria-pressed={myReact?.kind === kk}
              disabled={!here}
              onClick={() => {
                dispatch({ t: "react", kind: kk });
                haptic("light");
              }}
              style={{ position: "relative", height: 40, minWidth: 44, padding: "0 6px", borderRadius: 20, display: "flex", alignItems: "center", gap: 3, background: myReact?.kind === kk ? c.selected : c.secondaryButton, boxShadow: myReact?.kind === kk ? `inset 0 0 0 2px ${c.primary}` : "none" }}
            >
              {face(kk, 22, p)}
              {counts[kk]! > 0 ? <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{counts[kk]}</span> : null}
            </button>
          ))}
          <Button
            kind="primary"
            onClick={() => {
              setLocal({ playAt: clock.peek(), wipe: 1, endAt: 0 });
              if (here && !watchedMe) dispatch({ t: "watched" });
            }}
          >
            Play
          </Button>
        </div>
      </div>
    );
  },
});
