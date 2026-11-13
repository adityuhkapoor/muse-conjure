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
  userColor,
  type Ctx,
  type Member,
  type Meta,
  type Theme,
} from "@muse/app";

// Thrift rack: the haul reel becomes a rack at the thrift store. Everyone hangs a wishlist tag on it
// in their own words, and the thing they want is drawn on the hanger. The car below is Saturday's
// ride; tap in to grab a seat. When you're back, tap each tag found or not found.

type Kind = "jacket" | "lamp" | "sweater" | "jeans" | "hat" | "mug" | "dress" | "shoes" | "mystery";
type Params = {
  /** The store and the day */
  store: string;
  day: string;
  /** Who posted the haul reel */
  from: string;
  /** The car, its driver and how many seats besides the driver */
  car: string;
  driver: string;
  seats: number;
  /** Tags already on the rack: who, in their words */
  tags: { who: string; text: string }[];
  /** Who already called a seat */
  riders: string[];
};

// @params
const P: Params = {
  store: "Second Chapter",
  day: "Saturday",
  from: "Tsai Lin",
  car: "the Sube",
  driver: "Will",
  seats: 4,
  tags: [
    { who: "Calvin", text: "a corduroy jacket" },
    { who: "Maya", text: "a lamp for the spreadsheet desk" },
    { who: "Arun", text: "literally anything green" },
    { who: "Tsai Lin", text: "a hat that says something weird" },
  ],
  riders: ["Tsai Lin", "Maya"],
};
// @end params

type Tag = { id: string; who: string; text: string; kind: Kind; at: number; found: boolean | null };
type State = { store: string; day: string; from: string; car: string; driver: string; seats: number; tags: Tag[]; riders: string[]; cast: string[]; back: { at: number; by: string } | null };
type Action = { t: "hang"; text: string } | { t: "ride" } | { t: "back" } | { t: "found"; tag: string };
type Local = { draft: string; toast: number };

const RACK_H = 196;
const CAR_H = 86;
const WORDS: [Kind, RegExp][] = [
  ["jacket", /jacket|coat|blazer|corduroy|denim jacket|parka/],
  ["lamp", /lamp|light/],
  ["jeans", /jean|pants|trouser|cargo|skirt/],
  ["hat", /hat|cap|beanie/],
  ["mug", /mug|cup|plate|bowl|glass/],
  ["dress", /dress|gown/],
  ["shoes", /shoe|boot|sneaker|loafer/],
  ["sweater", /sweater|hoodie|shirt|tee|cardigan|top|knit|green/],
];
const kindOf = (text: string): Kind => WORDS.find(([, re]) => re.test(text.toLowerCase()))?.[0] ?? "mystery";

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idFor = (ctx: Ctx, name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? name;

function initState(ctx: Ctx): State {
  const cast: string[] = [];
  const tags: Tag[] = [];
  for (const t of Array.isArray(P.tags) ? P.tags : []) {
    const name = clean(t?.who, 20);
    const text = clean(t?.text, 40);
    if (!name || !text || tags.length >= 6) continue;
    const id = idFor(ctx, name);
    if (tags.some((x) => x.who === id)) continue;
    if (!cast.includes(id)) cast.push(id);
    tags.push({ id: `p${tags.length}`, who: id, text, kind: kindOf(text), at: 0, found: null });
  }
  const seats = Number.isInteger(P.seats) && P.seats >= 1 && P.seats <= 6 ? P.seats : 4;
  const driver = clean(P.driver, 20);
  const driverId = driver ? idFor(ctx, driver) : "";
  const riders: string[] = [];
  for (const r of Array.isArray(P.riders) ? P.riders : []) {
    const n = clean(r, 20);
    if (!n) continue;
    const id = idFor(ctx, n);
    if (id === driverId || riders.includes(id) || riders.length >= seats) continue;
    if (!cast.includes(id)) cast.push(id);
    riders.push(id);
  }
  return { store: clean(P.store, 28) || "the thrift store", day: clean(P.day, 16) || "Saturday", from: clean(P.from, 20), car: clean(P.car, 20) || "the car", driver: driverId, seats, tags, riders, cast, back: null };
}

function reduceIt(s: State, a: Action, m: Meta, ctx: Ctx): State {
  const u = m.user;
  if (!inChat(ctx, u)) return s;
  if (a.t === "hang") {
    const text = clean(a.text, 40);
    if (!text || s.back) return s;
    const mine = s.tags.find((x) => x.who === u);
    if (!mine && s.tags.length >= 6) return s;
    const tag: Tag = { id: mine ? mine.id : `t${m.seq}`, who: u, text, kind: kindOf(text), at: Math.max(1, m.time), found: null };
    return { ...s, tags: mine ? s.tags.map((x) => (x.who === u ? tag : x)) : [...s.tags, tag] };
  }
  if (a.t === "ride") {
    if (s.back || u === s.driver) return s;
    if (s.riders.includes(u)) return { ...s, riders: s.riders.filter((x) => x !== u) };
    if (s.riders.length >= s.seats) return s;
    return { ...s, riders: [...s.riders, u] };
  }
  if (a.t === "back") {
    if (s.back || !s.tags.length) return s;
    return { ...s, back: { at: Math.max(1, m.time), by: u } };
  }
  if (a.t === "found") {
    if (!s.back || typeof a.tag !== "string") return s;
    const t = s.tags.find((x) => x.id === a.tag);
    if (!t) return s;
    const next = t.found === null ? true : t.found ? false : null;
    return { ...s, tags: s.tags.map((x) => (x.id === a.tag ? { ...x, found: next } : x)) };
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

/** The wished-for thing on a hanger hooked at (x, 30), about 56 wide. */
function itemArt(kind: Kind, x: number, color: string, theme: Theme) {
  const p = pal(theme);
  const dk = mix(color, p.dark, 0.3);
  const hook = (
    <path d={`M ${x} 30 q 0 -7 5 -7 q 5 0 5 5 M ${x} 30 L ${x - 20} 42 L ${x + 20} 42 Z`} fill="none" stroke={p.soft} stroke-width={1.8} stroke-linejoin="round" />
  );
  if (kind === "jacket")
    return (
      <g>
        {hook}
        <path d={`M ${x - 20} 42 L ${x - 27} 50 L ${x - 27} 100 L ${x - 18} 100 L ${x - 18} 104 L ${x + 18} 104 L ${x + 18} 100 L ${x + 27} 100 L ${x + 27} 50 L ${x + 20} 42 L ${x + 6} 42 L ${x} 56 L ${x - 6} 42 Z`} fill={color} />
        {[-14, -8, 8, 14].map((d) => <line key={d} x1={x + d} y1={50} x2={x + d} y2={102} stroke={dk} stroke-width={1} />)}
        <line x1={x} y1={56} x2={x} y2={104} stroke={dk} stroke-width={1.5} />
        <rect x={x - 16} y={74} width={9} height={7} rx={1} fill={dk} />
      </g>
    );
  if (kind === "lamp")
    return (
      <g>
        <line x1={x} y1={18} x2={x} y2={36} stroke={p.soft} stroke-width={1.5} />
        <path d={`M ${x - 18} 62 L ${x - 10} 36 L ${x + 10} 36 L ${x + 18} 62 Z`} fill={color} />
        <rect x={x - 2} y={62} width={4} height={30} fill={p.brown} />
        <ellipse cx={x} cy={96} rx={14} ry={5} fill={p.brown} />
        <ellipse cx={x} cy={66} rx={10} ry={3} fill={p.yellow} opacity={0.6} />
      </g>
    );
  if (kind === "jeans")
    return (
      <g>
        {hook}
        <path d={`M ${x - 17} 42 L ${x + 17} 42 L ${x + 20} 106 L ${x + 5} 106 L ${x} 62 L ${x - 5} 106 L ${x - 20} 106 Z`} fill={color} />
        <line x1={x - 17} y1={48} x2={x + 17} y2={48} stroke={dk} stroke-width={1.5} />
      </g>
    );
  if (kind === "hat")
    return (
      <g>
        <line x1={x} y1={18} x2={x} y2={40} stroke={p.soft} stroke-width={1.5} />
        <path d={`M ${x - 16} 62 Q ${x - 16} 40 ${x} 40 Q ${x + 16} 40 ${x + 16} 62 Z`} fill={color} />
        <ellipse cx={x} cy={63} rx={26} ry={6} fill={dk} />
        <rect x={x - 16} y={54} width={32} height={5} fill={p.cream} />
      </g>
    );
  if (kind === "mug")
    return (
      <g>
        <line x1={x} y1={18} x2={x} y2={44} stroke={p.soft} stroke-width={1.5} />
        <rect x={x - 13} y={44} width={26} height={30} rx={4} fill={color} />
        <path d={`M ${x + 13} 50 q 10 0 10 9 q 0 9 -10 9`} fill="none" stroke={color} stroke-width={4} />
        <circle cx={x} cy={58} r={5} fill={p.cream} />
      </g>
    );
  if (kind === "dress")
    return (
      <g>
        {hook}
        <path d={`M ${x - 12} 42 L ${x + 12} 42 L ${x + 10} 62 L ${x + 24} 108 L ${x - 24} 108 L ${x - 10} 62 Z`} fill={color} />
        <line x1={x - 10} y1={62} x2={x + 10} y2={62} stroke={dk} stroke-width={2} />
      </g>
    );
  if (kind === "shoes")
    return (
      <g>
        <line x1={x - 8} y1={18} x2={x - 8} y2={52} stroke={p.soft} stroke-width={1.5} />
        <line x1={x + 8} y1={18} x2={x + 8} y2={56} stroke={p.soft} stroke-width={1.5} />
        <path d={`M ${x - 22} 74 L ${x - 22} 54 L ${x - 10} 54 L ${x - 4} 66 L ${x - 4} 74 Z`} fill={color} />
        <path d={`M ${x + 2} 78 L ${x + 2} 58 L ${x + 14} 58 L ${x + 20} 70 L ${x + 20} 78 Z`} fill={dk} />
      </g>
    );
  if (kind === "sweater")
    return (
      <g>
        {hook}
        <path d={`M ${x - 20} 42 L ${x - 32} 66 L ${x - 24} 70 L ${x - 18} 58 L ${x - 18} 100 L ${x + 18} 100 L ${x + 18} 58 L ${x + 24} 70 L ${x + 32} 66 L ${x + 20} 42 L ${x + 7} 42 Q ${x} 50 ${x - 7} 42 Z`} fill={color} />
        {[64, 76, 88].map((y) => <path key={y} d={`M ${x - 18} ${y} l 6 -4 l 6 4 l 6 -4 l 6 4 l 6 -4 l 6 4`} fill="none" stroke={dk} stroke-width={1.3} />)}
      </g>
    );
  return (
    <g>
      <line x1={x} y1={18} x2={x} y2={44} stroke={p.soft} stroke-width={1.5} />
      <rect x={x - 16} y={44} width={32} height={30} rx={3} fill={color} />
      <path d={`M ${x - 16} 54 L ${x + 16} 54 M ${x} 44 L ${x} 74`} stroke={dk} stroke-width={2} />
      <path d={`M ${x - 4} 62 q 4 -5 8 0 q 0 3 -4 4 l 0 2`} fill="none" stroke={p.cream} stroke-width={1.6} />
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Thrift rack",
  summary: (s) => {
    if (s.back) return `${s.store}: ${s.tags.filter((t) => t.found).length} of ${s.tags.length} found`;
    return `${s.store} ${s.day}: ${s.tags.length} wishlist tags · ${s.riders.length} riding in ${s.car}`;
  },

  init: initState,
  reduce: (s, a, m, ctx) => reduceIt(s, a, m, ctx),
  onMembers: (s, ctx) => {
    const keep = (u: string) => inChat(ctx, u) || s.cast.includes(u);
    const tags = s.tags.filter((t) => keep(t.who));
    const riders = s.riders.filter(keep);
    return tags.length === s.tags.length && riders.length === s.riders.length ? s : { ...s, tags, riders };
  },

  invariants: {
    "one tag per person, six at most": (s) => new Set(s.tags.map((t) => t.who)).size === s.tags.length && s.tags.length <= 6 && new Set(s.tags.map((t) => t.id)).size === s.tags.length,
    "tags say something and draw what they say": (s) => s.tags.every((t) => t.text.length > 0 && t.text.length <= 40 && t.kind === kindOf(t.text)),
    "the car is never over full": (s) => s.riders.length <= s.seats && new Set(s.riders).size === s.riders.length && !s.riders.includes(s.driver),
    "nothing is found before the trip": (s) => s.back !== null || s.tags.every((t) => t.found === null),
    "people on the rack are here or named": (s, ctx) => [...s.riders, ...s.tags.map((t) => t.who)].every((u) => inChat(ctx, u) || s.cast.includes(u)),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "hanging puts up my tag with my words": (p, n, a, m) => {
      if (a.t !== "hang" || p === n) return true;
      const t = n.tags.find((x) => x.who === m.user);
      return !!t && t.text === clean(a.text, 40) && t.at === Math.max(1, m.time) && n.tags.filter((x) => x.who !== m.user).every((x) => p.tags.some((y) => y.id === x.id && y.text === x.text));
    },
    "riding moves only me": (p, n, a, m) => {
      if (a.t !== "ride" || p === n) return true;
      const was = p.riders.includes(m.user);
      return n.riders.includes(m.user) !== was && n.riders.filter((u) => u !== m.user).join() === p.riders.filter((u) => u !== m.user).join();
    },
    "back happens once": (p, n, a, m) => a.t !== "back" || p === n || (p.back === null && n.back?.by === m.user),
    "a found tap steps one tag": (p, n, a) => {
      if (a.t !== "found" || p === n) return true;
      const was = p.tags.find((x) => x.id === a.tag)!;
      const now = n.tags.find((x) => x.id === a.tag)!;
      const step = was.found === null ? true : was.found ? false : null;
      return now.found === step && n.tags.every((x) => x.id === a.tag || p.tags.find((y) => y.id === x.id)?.found === x.found);
    },
    "the car only changes by riding": (p, n, a) => a.t === "ride" || n.riders === p.riders,
    "after the trip only found taps change things": (p, n, a) => p.back === null || a.t === "found" || p === n,
    "riding and coming back leave the tags alone": (p, n, a) => (a.t !== "ride" && a.t !== "back") || n.tags === p.tags,
    "found taps only come after the trip": (p, n, a) => a.t !== "found" || p === n || p.back !== null,
    "a new tag keeps my old spot on the rack": (p, n, a, m) => {
      if (a.t !== "hang" || p === n) return true;
      const i = p.tags.findIndex((x) => x.who === m.user);
      return i < 0 ? n.tags.length === p.tags.length + 1 && n.tags[n.tags.length - 1]!.who === m.user : n.tags.length === p.tags.length && n.tags[i]!.who === m.user && n.tags[i]!.id === p.tags[i]!.id;
    },
    "the driver never takes a seat": (p, n, a, m) => a.t !== "ride" || p === n || m.user !== p.driver,
  },

  arbitrary: (s, u, r) => {
    const k = r.next();
    if (s.back) return s.tags.length && k < 0.85 ? { t: "found", tag: r.pick(s.tags).id } : { t: "ride" };
    if (k < 0.35) return { t: "hang", text: r.pick(["a corduroy jacket", "a lamp", "anything green", "boots", "a weird mug", "?"]) };
    if (k < 0.8) return { t: "ride" };
    return { t: "back" };
  },

  local: { draft: "", toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const now = clock.value;
    const n = state.tags.length;
    const slotW = (W - 24) / Math.max(4, n);
    const tx = (i: number) => 12 + slotW * (i + 0.5) + (Math.max(4, n) - n) * slotW * 0.5;
    const mine = state.tags.find((t) => t.who === me);
    const riding = state.riders.includes(me);
    const iDrive = me === state.driver;
    const full = state.riders.length >= state.seats;
    const hues = [p.orange, p.yellow, p.green, p.purple, p.blue, p.red];
    const colorOf = (t: Tag) => (t.kind === "sweater" && /green/.test(t.text.toLowerCase()) ? p.green : hues[t.text.length % 6]!);
    const steel = theme.mode === "dark" ? mix(c.text, c.card, 0.35) : mix(p.dark, c.card, 0.25);
    const found = state.tags.filter((t) => t.found).length;
    const send = () => {
      const text = clean(local.draft, 40);
      if (!text) return;
      haptic("success");
      dispatch({ t: "hang", text });
      setLocal({ draft: "", toast: local.toast + 1 });
    };
    const sube = theme.mode === "dark" ? mix(p.green, c.wash, 0.25) : p.green;
    const carW = Math.min(250, W - 90);
    const carX = 4;
    const seatPos = (i: number) => carX + 52 + i * Math.min(28, 96 / Math.max(1, state.seats - 1));
    const sub = `${state.from ? `${state.from}'s haul reel · ` : ""}${n} ${n === 1 ? "tag" : "tags"} on the rack`;

    return (
      <div>
        <CardHeader title={`${state.store}, ${state.day}`} subtitle={sub} />
        {/* the rack */}
        <div style={{ position: "relative", height: RACK_H, marginTop: 4 }}>
          <svg width={W} height={RACK_H} viewBox={`0 0 ${W} ${RACK_H}`} role="img" aria-label={`Clothes rack with ${n} wishlist tags`} style={{ position: "absolute", left: 0, top: 0 }}>
            <rect x={0} y={0} width={W} height={RACK_H} rx={14} fill={theme.mode === "dark" ? mix(c.wash, p.wall, 0.08) : mix(p.wall, c.card, 0.45)} />
            <line x1={6} y1={18} x2={W - 6} y2={18} stroke={steel} stroke-width={4} />
            <line x1={10} y1={18} x2={10} y2={RACK_H - 12} stroke={steel} stroke-width={3} />
            <line x1={W - 10} y1={18} x2={W - 10} y2={RACK_H - 12} stroke={steel} stroke-width={3} />
            <circle cx={10} cy={RACK_H - 8} r={4} fill={steel} />
            <circle cx={W - 10} cy={RACK_H - 8} r={4} fill={steel} />
            {state.tags.map((t, i) => {
              const e = t.at > 0 ? running(t.at, 1600) : null;
              const swing = e === null ? Math.sin(now / 900 + i * 1.7) * 1.2 : 18 * Math.exp(-e / 380) * Math.cos(e / 120);
              const slide = e === null ? 0 : Math.max(0, 1 - e / 400) * 60;
              return (
                <g key={t.id} transform={`translate(${slide} 0) rotate(${swing.toFixed(2)} ${tx(i)} 18)`}>
                  {itemArt(t.kind, tx(i), colorOf(t), theme)}
                  <line x1={tx(i) + 10} y1={92} x2={tx(i) + 12} y2={114} stroke={p.soft} stroke-width={1} />
                </g>
              );
            })}
            {n === 0 ? <rect x={W / 2 - 40} y={40} width={80} height={70} rx={8} fill="none" stroke={c.secondaryText} stroke-width={1.5} stroke-dasharray="5 4" /> : null}
          </svg>
          {n === 0 ? (
            <span style={{ position: "absolute", left: 0, right: 0, top: 124, textAlign: "center", fontSize: 13, color: c.secondaryText }}>Hang the first tag: what are you hunting for</span>
          ) : null}
          {/* the paper tags, in people's words */}
          {state.tags.map((t, i) => {
            const w = Math.min(84, slotW - 4);
            const stamp = t.found === null ? null : t.found ? "Found" : "Not found";
            const Tg = state.back ? "button" : "span";
            return (
              <Tg
                key={t.id}
                {...(state.back ? { type: "button", "aria-label": `${t.text}, ${stamp ?? "not checked yet"}`, onClick: () => { haptic("light"); dispatch({ t: "found", tag: t.id }); } } : {})}
                style={{ position: "absolute", left: tx(i) - w / 2 + 8, top: 112, width: w, minHeight: 44, padding: "16px 2px 4px", boxSizing: "border-box", border: 0, borderRadius: 4, background: p.cream, color: c.text, transform: `rotate(${i % 2 ? 3 : -3}deg)`, textAlign: "center", fontSize: 10.5, lineHeight: "13px", cursor: state.back ? "pointer" : "default", fontFamily: "inherit" }}
              >
                <span style={{ position: "absolute", left: "50%", top: 3, marginLeft: -7, display: "flex", pointerEvents: "none" }}>
                  <Face id={t.who} members={members} size={14} theme={theme} />
                </span>
                <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word", color: theme.mode === "dark" ? c.card : c.text }}>{t.text}</span>
                {stamp ? (
                  <span style={{ position: "absolute", left: 4, right: 4, top: 18, padding: "1px 0", border: `2px solid ${t.found ? p.green : p.red}`, borderRadius: 4, background: t.found ? mix(p.green, p.dark, 0.35) : mix(p.red, p.dark, 0.35), color: c.onPrimary, fontSize: 11, fontWeight: 800, lineHeight: "14px", transform: "rotate(-10deg)", pointerEvents: "none" }}>{stamp}</span>
                ) : null}
              </Tg>
            );
          })}
        </div>

        {/* the ride */}
        <div style={{ position: "relative", height: CAR_H, marginTop: 8 }}>
          <svg width={W} height={CAR_H} viewBox={`0 0 ${W} ${CAR_H}`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            <rect x={carX + 30} y={6} width={carW - 60} height={5} rx={2} fill={mix(sube, p.dark, 0.4)} />
            <path d={`M ${carX + 6} 62 L ${carX + 6} 40 Q ${carX + 8} 30 ${carX + 30} 28 L ${carX + 40} 12 L ${carX + carW - 36} 12 Q ${carX + carW - 22} 14 ${carX + carW - 14} 30 L ${carX + carW - 4} 40 L ${carX + carW - 4} 62 Z`} fill={sube} />
            <rect x={carX + 44} y={16} width={carW - 86} height={20} rx={4} fill={mix(p.sky, c.card, 0.2)} />
            <circle cx={carX + 46} cy={64} r={13} fill={p.dark} />
            <circle cx={carX + 46} cy={64} r={5} fill={steel} />
            <circle cx={carX + carW - 44} cy={64} r={13} fill={p.dark} />
            <circle cx={carX + carW - 44} cy={64} r={5} fill={steel} />
            <rect x={carX + carW - 10} y={42} width={6} height={6} rx={2} fill={p.yellow} />
            {state.back ? <path d={`M ${carX + carW + 10} 40 l 10 0 m -4 -5 l 5 5 l -5 5`} fill="none" stroke={c.secondaryText} stroke-width={2} /> : null}
          </svg>
          {state.driver ? (
            <span style={{ position: "absolute", left: carX + carW - 80, top: 16, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 1.5px ${c.card}` }}>
              <Face id={state.driver} members={members} size={20} theme={theme} />
            </span>
          ) : null}
          {Array.from({ length: state.seats }, (_, i) => {
            const u = state.riders[i];
            return (
              <span key={i} style={{ position: "absolute", left: seatPos(i), top: 16, width: 20, height: 20 }}>
                {u ? (
                  <span style={{ display: "flex", borderRadius: "50%", boxShadow: `0 0 0 1.5px ${u === me ? c.primary : c.card}` }}>
                    <Face id={u} members={members} size={20} theme={theme} />
                  </span>
                ) : (
                  <span style={{ display: "block", width: 20, height: 20, boxSizing: "border-box", borderRadius: "50%", border: `1.5px dashed ${c.secondaryText}` }} />
                )}
              </span>
            );
          })}
          <div style={{ position: "absolute", left: carX + carW + 12, right: 0, top: 18 }}>
            <div style={{ fontSize: 14, lineHeight: "18px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.car}</div>
            <div style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>{state.back ? "back home" : `${state.riders.length + (state.driver ? 1 : 0)} riding · ${state.seats - state.riders.length} free`}</div>
          </div>
        </div>

        {/* actions */}
        {state.back ? (
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: "20px", color: c.text }}>
            {`${found} of ${n} found · tap a tag to mark it`}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                value={local.draft}
                placeholder={mine ? `Your tag: ${mine.text}` : "What are you hunting for"}
                aria-label="Your wishlist tag"
                maxLength={40}
                onInput={(e: { currentTarget: { value: string } }) => setLocal({ draft: e.currentTarget.value })}
                onKeyDown={(e: { key: string }) => { if (e.key === "Enter") send(); }}
                style={{ flex: 1, minWidth: 0 }}
              />
              <Button kind={mine ? "secondary" : "primary"} disabled={!clean(local.draft, 40)} onClick={send}>{mine ? "Swap tag" : "Hang tag"}</Button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <Button kind={mine && !riding ? "primary" : "secondary"} wide disabled={iDrive || (!riding && full)} onClick={() => { haptic("light"); dispatch({ t: "ride" }); }}>
                  {iDrive ? "You're driving" : riding ? "Give up my seat" : full ? "Car's full" : "Ride along"}
                </Button>
              </div>
              <Button kind="secondary" disabled={!n} onClick={() => dispatch({ t: "back" })}>We're back</Button>
            </div>
          </>
        )}
        {local.toast > 0 && mine ? <Toast key={local.toast}>{`Tag's on the rack · ${mine.text}`}</Toast> : null}
      </div>
    );
  },
});
