import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  Locked,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  userColor,
  type Ctx,
  type Member,
  type Meta,
  type Theme,
} from "@muse/app";

// Trailer couch: the trailer plays on a little TV over the living room couch. Tap a cushion to sit
// (tap it again to get up), claim a snack on the coffee table, pick a showtime, lock it. The floor
// beanbag is always there, and it is always somebody's.

type Snack = "popcorn" | "candy" | "chips" | "soda" | "pizza";
type Params = {
  /** The movie and when it opens */
  movie: string;
  opens: string;
  /** Who shared the trailer and what they said */
  from: string;
  quote: string;
  /** 3 to 6 cushions; the name sitting there, or "" for free */
  seats: string[];
  /** Whose beanbag sits on the floor */
  beanbag: string;
  /** 2 to 4 snacks on the coffee table, and who brings each ("" for nobody yet) */
  snacks: { name: string; kind: Snack; who: string }[];
  /** 2 to 4 showtimes and who already picked each */
  times: { label: string; who: string[] }[];
};

// @params
const P: Params = {
  movie: "Vault Nine",
  opens: "out Friday",
  from: "Will",
  quote: "WE ARE WATCHING THIS",
  seats: ["Will", "", "Maya", "Tsai Lin", "", "Calvin"],
  beanbag: "Arun",
  snacks: [
    { name: "Popcorn", kind: "popcorn", who: "Will" },
    { name: "The good candy", kind: "candy", who: "Maya" },
    { name: "Chips", kind: "chips", who: "" },
    { name: "Soda", kind: "soda", who: "" },
  ],
  times: [
    { label: "Fri 7:10", who: ["Will", "Calvin"] },
    { label: "Fri 9:40", who: ["Maya", "Tsai Lin"] },
    { label: "Sat 8:00", who: [] },
  ],
};
// @end params

type State = {
  movie: string;
  opens: string;
  from: string;
  quote: string;
  beanbag: string;
  seats: (string | null)[];
  snacks: { name: string; kind: Snack; who: string | null }[];
  times: { label: string; who: string[] }[];
  cast: string[];
  locked: { time: number; by: string; at: number } | null;
};
type Action = { t: "sit"; seat: number } | { t: "snack"; i: number } | { t: "time"; i: number } | { t: "lock" };
type Local = { toast: number };

const SNACKS: Snack[] = ["popcorn", "candy", "chips", "soda", "pizza"];
const H = 272;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idFor = (ctx: Ctx, name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? name;
const idx = (v: unknown, n: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < n;
/** The showtime with the most picks; the earlier one wins a tie. */
const leader = (s: State) => s.times.reduce((b, t, i) => (t.who.length > (s.times[b]?.who.length ?? -1) ? i : b), 0);

function initState(ctx: Ctx): State {
  const cast: string[] = [];
  const who = (name: unknown) => {
    const n = clean(name, 20);
    if (!n) return null;
    const id = idFor(ctx, n);
    if (!cast.includes(id)) cast.push(id);
    return id;
  };
  const seats: (string | null)[] = [];
  for (const s of (Array.isArray(P.seats) ? P.seats : []).slice(0, 6)) {
    const id = who(s);
    seats.push(id && !seats.includes(id) ? id : null);
  }
  while (seats.length < 3) seats.push(null);
  const snacks = (Array.isArray(P.snacks) ? P.snacks : []).slice(0, 4).map((x) => ({ name: clean(x?.name, 18) || "Snacks", kind: SNACKS.includes(x?.kind) ? x.kind : "chips", who: who(x?.who) }));
  const times: State["times"] = [];
  const voted = new Set<string>();
  for (const t of (Array.isArray(P.times) ? P.times : []).slice(0, 4)) {
    const label = clean(t?.label, 14);
    if (!label) continue;
    const list: string[] = [];
    for (const n of Array.isArray(t.who) ? t.who : []) {
      const id = who(n);
      if (id && !voted.has(id)) (voted.add(id), list.push(id));
    }
    times.push({ label, who: list });
  }
  return { movie: clean(P.movie, 28) || "Movie night", opens: clean(P.opens, 20), from: clean(P.from, 20), quote: clean(P.quote, 40), beanbag: clean(P.beanbag, 16), seats, snacks, times, cast, locked: null };
}

function reduceIt(s: State, a: Action, m: Meta, ctx: Ctx): State {
  const u = m.user;
  if (!inChat(ctx, u)) return s;
  if (a.t === "sit") {
    if (!idx(a.seat, s.seats.length)) return s;
    const there = s.seats[a.seat];
    if (there && there !== u) return s;
    const seats = s.seats.map((x) => (x === u ? null : x));
    if (there !== u) seats[a.seat] = u;
    return { ...s, seats };
  }
  if (a.t === "snack") {
    if (!idx(a.i, s.snacks.length)) return s;
    const sn = s.snacks[a.i]!;
    if (sn.who && sn.who !== u) return s;
    return { ...s, snacks: s.snacks.map((x, i) => (i === a.i ? { ...x, who: x.who === u ? null : u } : x)) };
  }
  if (a.t === "time") {
    if (s.locked || !idx(a.i, s.times.length)) return s;
    const had = s.times[a.i]!.who.includes(u);
    return { ...s, times: s.times.map((t, i) => ({ ...t, who: i === a.i && !had ? [...t.who.filter((x) => x !== u), u] : t.who.filter((x) => x !== u) })) };
  }
  if (a.t === "lock") {
    if (s.locked || !s.times.length || s.times.every((t) => t.who.length === 0)) return s;
    return { ...s, locked: { time: leader(s), by: u, at: Math.max(1, m.time) } };
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

/** One snack, drawn about 30 wide and 30 tall, sitting at (x, bottom). */
function snackArt(kind: Snack, x: number, b: number, theme: Theme, k: string) {
  const p = pal(theme);
  if (kind === "popcorn")
    return (
      <g key={k}>
        <polygon points={`${x - 11},${b - 22} ${x + 11},${b - 22} ${x + 8},${b} ${x - 8},${b}`} fill={p.paper} />
        {[-6, 0, 6].map((d) => <polygon key={d} points={`${x + d - 2},${b - 22} ${x + d + 2},${b - 22} ${x + d * 0.75 + 1.6},${b} ${x + d * 0.75 - 1.6},${b}`} fill={p.red} />)}
        {[-9, -4, 1, 6, 10, -2, 4].map((d, i) => <circle key={i} cx={x + d} cy={b - 24 - (i > 4 ? 5 : (i % 2) * 2)} r={4} fill={p.cream} />)}
      </g>
    );
  if (kind === "candy")
    return (
      <g key={k}>
        <rect x={x - 12} y={b - 16} width={24} height={16} rx={3} fill={p.purple} />
        <rect x={x - 12} y={b - 16} width={24} height={5} rx={2} fill={mix(p.purple, p.dark, 0.35)} />
        {[-6, 0, 6].map((d, i) => <circle key={i} cx={x + d} cy={b - 21} r={4} fill={[p.red, p.yellow, p.green][i]} />)}
      </g>
    );
  if (kind === "chips")
    return (
      <g key={k}>
        <path d={`M ${x - 11} ${b} L ${x - 12} ${b - 26} Q ${x} ${b - 30} ${x + 12} ${b - 26} L ${x + 11} ${b} Z`} fill={p.yellow} />
        <ellipse cx={x} cy={b - 13} rx={6} ry={5} fill={p.red} />
        <path d={`M ${x - 12} ${b - 26} l 3 -3 l 3 3 l 3 -3 l 3 3 l 3 -3 l 3 3 l 3 -3 l 3 3`} fill="none" stroke={mix(p.yellow, p.dark, 0.3)} stroke-width={1.2} />
      </g>
    );
  if (kind === "pizza")
    return (
      <g key={k}>
        <rect x={x - 14} y={b - 6} width={28} height={6} rx={1} fill={p.crust} />
        <polygon points={`${x - 12},${b - 6} ${x + 12},${b - 6} ${x},${b - 26}`} fill={p.yellow} />
        <circle cx={x - 3} cy={b - 12} r={2.4} fill={p.red} />
        <circle cx={x + 3} cy={b - 16} r={2.4} fill={p.red} />
      </g>
    );
  return (
    <g key={k}>
      <rect x={x - 9} y={b - 28} width={8} height={28} rx={2} fill={p.red} />
      <rect x={x + 1} y={b - 24} width={8} height={24} rx={2} fill={p.blue} />
      <rect x={x - 8} y={b - 19} width={6} height={6} rx={1} fill={p.paper} />
      <rect x={x + 2} y={b - 15} width={6} height={6} rx={1} fill={p.paper} />
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Trailer couch",
  summary: (s) => {
    const sat = s.seats.filter(Boolean).length;
    return s.locked
      ? `${s.movie}: ${s.times[s.locked.time]?.label ?? "set"} · ${sat} on the couch`
      : `${s.movie}: ${sat} of ${s.seats.length} cushions taken · showtime not set`;
  },

  init: initState,
  reduce: (s, a, m, ctx) => reduceIt(s, a, m, ctx),
  onMembers: (s, ctx) => {
    const keep = (u: string | null) => (u && (inChat(ctx, u) || s.cast.includes(u)) ? u : null);
    return { ...s, seats: s.seats.map(keep), snacks: s.snacks.map((x) => ({ ...x, who: keep(x.who) })), times: s.times.map((t) => ({ ...t, who: t.who.filter((u) => !!keep(u)) })) };
  },

  invariants: {
    "one cushion per person": (s) => {
      const on = s.seats.filter((x): x is string => !!x);
      return new Set(on).size === on.length && s.seats.length >= 3 && s.seats.length <= 6;
    },
    "one showtime pick per person": (s) => {
      const all = s.times.flatMap((t) => t.who);
      return new Set(all).size === all.length;
    },
    "everyone on the couch is here or was named": (s, ctx) => [...s.seats, ...s.snacks.map((x) => x.who), ...s.times.flatMap((t) => t.who)].every((u) => u === null || inChat(ctx, u) || s.cast.includes(u)),
    "the lock is a real showtime": (s) => s.locked === null || (Number.isInteger(s.locked.time) && s.locked.time >= 0 && s.locked.time < s.times.length && s.locked.at > 0),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "sitting moves only me": (p, n, a, m) => {
      if (a.t !== "sit" || p === n) return true;
      const mine = n.seats.indexOf(m.user);
      const was = p.seats.indexOf(m.user);
      if (was === a.seat) return mine === -1;
      return mine === a.seat && p.seats[a.seat] === null && n.seats.every((x, i) => i === a.seat || i === was || x === p.seats[i]);
    },
    "a snack toggles only for me": (p, n, a, m) => {
      if (a.t !== "snack" || p === n) return true;
      const was = p.snacks[a.i]!.who;
      const now = n.snacks[a.i]!.who;
      return (was === null && now === m.user) || (was === m.user && now === null);
    },
    "other snacks stay put": (p, n, a) => a.t !== "snack" || n.snacks.every((x, i) => i === a.i || x.who === p.snacks[i]!.who),
    "a showtime pick moves only me": (p, n, a, m) => {
      if (a.t !== "time" || p === n) return true;
      const had = p.times[a.i]!.who.includes(m.user);
      const strip = (t: State["times"]) => t.map((x) => x.who.filter((u) => u !== m.user).join()).join("|");
      return strip(p.times) === strip(n.times) && n.times[a.i]!.who.includes(m.user) === !had && n.times.filter((t) => t.who.includes(m.user)).length === (had ? 0 : 1);
    },
    "lock happens once, by me": (p, n, a, m) => a.t !== "lock" || p === n || (p.locked === null && !!n.locked && n.locked.by === m.user && n.locked.at === Math.max(1, m.time) && n.locked.time === leader(p)),
    "picks freeze after the lock": (p, n, a) => a.t !== "time" || p.locked === null || p === n,
    "only lock locks": (p, n, a) => a.t === "lock" || n.locked === p.locked,
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.35) return { t: "sit", seat: r.int(s.seats.length) };
    if (k < 0.6 && s.snacks.length) return { t: "snack", i: r.int(s.snacks.length) };
    if (k < 0.9 && s.times.length) return { t: "time", i: r.int(s.times.length) };
    return { t: "lock" };
  },

  local: { toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dk = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const n = state.seats.length;
    const cx0 = 54;
    const cx1 = W - 10;
    const cw = (cx1 - cx0 - 24) / n;
    const seatX = (i: number) => cx0 + 12 + cw * (i + 0.5);
    const sofa = dk ? mix(p.orange, c.wash, 0.45) : mix(p.orange, c.card, 0.15);
    const sofaDark = mix(sofa, p.dark, 0.3);
    const cushion = mix(sofa, c.card, dk ? 0.12 : 0.25);
    const wood = dk ? mix(p.brown, c.text, 0.15) : p.brown;
    const tvW = Math.min(196, W * 0.56);
    const tvX = (W - tvW) / 2 + 18;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id;
    const taken = state.seats.filter(Boolean).length;
    const lead = leader(state);
    const tableX = W / 2 + 14;
    const tableW = Math.min(220, W - 120);
    const ns = state.snacks.length;
    const snackX = (i: number) => tableX - tableW / 2 + (tableW / ns) * (i + 0.5);
    const iSit = state.seats.includes(me);
    const anyTime = state.times.some((x) => x.who.length > 0);
    const tvH = 104;
    return (
      <div>
        <CardHeader title={`${state.movie}, couch edition`} subtitle={`${state.opens ? `${state.opens[0]!.toUpperCase()}${state.opens.slice(1)} · ` : ""}${taken} of ${n} cushions taken`} />
        <div style={{ position: "relative", height: H, marginTop: 4 }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            <rect x={0} y={0} width={W} height={H - 34} rx={14} fill={dk ? mix(c.wash, p.wall, 0.08) : mix(p.wall, c.card, 0.4)} />
            <rect x={0} y={H - 44} width={W} height={44} rx={10} fill={dk ? mix(c.wash, p.brown, 0.25) : mix(p.brown, c.card, 0.72)} />
            {/* the TV and the trailer on it */}
            <rect x={tvX + tvW / 2 - 30} y={tvH + 8} width={60} height={6} rx={3} fill={p.dark} />
            <rect x={tvX - 5} y={4} width={tvW + 10} height={tvH + 6} rx={8} fill={p.dark} />
            <rect x={tvX} y={9} width={tvW} height={tvH - 4} rx={4} fill={mix(p.dark, p.blue, 0.25)} />
            {/* the couch */}
            <rect x={cx0} y={124} width={cx1 - cx0} height={64} rx={16} fill={sofaDark} />
            <rect x={cx0 + 10} y={130} width={cx1 - cx0 - 20} height={48} rx={12} fill={sofa} />
            {state.seats.map((_, i) => (
              <rect key={i} x={seatX(i) - cw / 2 + 2} y={168} width={cw - 4} height={28} rx={8} fill={cushion} />
            ))}
            <rect x={cx0 - 4} y={150} width={22} height={58} rx={10} fill={sofaDark} />
            <rect x={cx1 - 18} y={150} width={22} height={58} rx={10} fill={sofaDark} />
            <rect x={cx0 + 6} y={194} width={cx1 - cx0 - 12} height={14} rx={4} fill={sofaDark} />
            {/* people on the couch: shoulders, heads come from the faces */}
            {state.seats.map((u, i) =>
              u ? <path key={`b${i}${u}`} d={`M ${seatX(i) - 15} 176 Q ${seatX(i) - 15} 156 ${seatX(i)} 156 Q ${seatX(i) + 15} 156 ${seatX(i) + 15} 176 Z`} fill={userColor(u, theme)} /> : null,
            )}
            {/* the beanbag */}
            <path d={`M 6 ${H - 8} Q 0 ${H - 52} 34 ${H - 60} Q 66 ${H - 54} 62 ${H - 8} Z`} fill={dk ? mix(p.green, c.wash, 0.35) : p.green} />
            <path d={`M 14 ${H - 26} Q 34 ${H - 36} 54 ${H - 26}`} fill="none" stroke={p.leaf} stroke-width={2} />
            {/* the coffee table and the snacks on it */}
            <rect x={tableX - tableW / 2} y={H - 40} width={tableW} height={8} rx={3} fill={wood} />
            <rect x={tableX - tableW / 2 + 8} y={H - 32} width={6} height={26} fill={wood} />
            <rect x={tableX + tableW / 2 - 14} y={H - 32} width={6} height={26} fill={wood} />
            {state.snacks.map((s, i) =>
              s.who ? snackArt(s.kind, snackX(i), H - 40, theme, `s${i}${s.kind}`) : <rect key={`e${i}`} x={snackX(i) - 14} y={H - 72} width={28} height={30} rx={6} fill="none" stroke={c.secondaryText} stroke-width={1.5} stroke-dasharray="4 3" />,
            )}
          </svg>
          {/* the trailer: a vault dial turning, lasers sweeping, the title card */}
          <div style={{ position: "absolute", left: tvX, top: 9, width: tvW, height: tvH - 4, borderRadius: 4, overflow: "hidden" }}>
            <Canvas
              height={tvH - 4}
              label={`${state.movie} trailer playing`}
              draw={(g, f) => {
                const s = f.now / 1000;
                const w = f.width, h = f.height;
                g.fillStyle = mix(p.dark, p.blue, 0.25);
                g.fillRect(0, 0, w, h);
                const ox = w * 0.72, oy = h * 0.42;
                g.fillStyle = mix(p.dark, c.card, 0.35);
                g.beginPath();
                g.arc(ox, oy, 30, 0, Math.PI * 2);
                g.fill();
                g.strokeStyle = p.yellow;
                g.lineWidth = 2;
                g.beginPath();
                g.arc(ox, oy, 22, 0, Math.PI * 2);
                g.stroke();
                g.lineWidth = 3;
                g.lineCap = "round";
                g.beginPath();
                for (let k = 0; k < 3; k++) {
                  const a = s * 0.9 + (k * 2 * Math.PI) / 3;
                  g.moveTo(ox, oy);
                  g.lineTo(ox + 20 * Math.cos(a), oy + 20 * Math.sin(a));
                }
                g.stroke();
                g.strokeStyle = p.red;
                g.lineWidth = 1.5;
                g.beginPath();
                const sw = Math.sin(s * 1.6);
                for (let k = 0; k < 3; k++) {
                  g.moveTo(4, 17 + k * 24);
                  g.lineTo(w - 4, 17 + k * 24 + 16 * sw * (k % 2 ? -1 : 1));
                }
                g.stroke();
                const fit = fitText(state.movie, w - 24, { g, size: 15, min: 11, weight: 800 });
                g.fillStyle = c.onPrimary;
                g.fillText(fit.text, 12, h - 21);
                g.fillStyle = p.red;
                g.fillRect(12, h - 13, (w - 24) * ((s / 6) % 1), 3);
                return true;
              }}
            />
          </div>
          {/* the quote from the trailer's sharer */}
          {state.quote && state.from ? (
            <div style={{ position: "absolute", left: 6, top: 12, width: Math.max(60, tvX - 16), display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
              <Face id={state.from} members={members} size={22} theme={theme} />
              <span style={{ padding: "4px 8px", borderRadius: 12, background: c.card, color: c.text, fontSize: 12, lineHeight: "15px", fontWeight: 700, wordBreak: "break-word" }}>{state.quote}</span>
            </div>
          ) : null}
          {/* cushions to tap */}
          {state.seats.map((u, i) => (
            <button
              key={i}
              type="button"
              aria-label={u ? `${nameOf(u)} is on cushion ${i + 1}${u === me ? ", tap to get up" : ""}` : `Sit on cushion ${i + 1}`}
              onClick={() => { haptic("light"); dispatch({ t: "sit", seat: i }); }}
              style={{ position: "absolute", left: seatX(i) - Math.max(22, cw / 2), top: 128, width: Math.max(44, cw), height: 64, padding: 0, border: 0, background: "transparent", cursor: u && u !== me ? "default" : "pointer" }}
            >
              <span style={{ position: "absolute", left: "50%", top: 4, marginLeft: -15, pointerEvents: "none", display: u ? "flex" : "none", borderRadius: "50%", boxShadow: `0 0 0 2px ${u === me ? c.primary : c.card}` }}>
                {u ? <Face id={u} members={members} size={30} theme={theme} /> : null}
              </span>
              <span style={{ position: "absolute", left: "50%", top: 14, marginLeft: -15, pointerEvents: "none", width: 30, height: 30, borderRadius: "50%", border: `1.5px dashed ${c.secondaryText}`, boxSizing: "border-box", display: u ? "none" : "flex", alignItems: "center", justifyContent: "center", color: c.text, fontSize: 18, lineHeight: "18px", background: mix(cushion, c.card, 0.4) }}>+</span>
            </button>
          ))}
          {/* the beanbag's owner */}
          {state.beanbag ? (
            <span style={{ position: "absolute", left: 22, top: H - 74, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${c.card}` }}>
              <Face id={state.beanbag} members={members} size={24} theme={theme} />
            </span>
          ) : null}
          {/* snacks to claim */}
          {state.snacks.map((s, i) => (
            <button
              key={i}
              type="button"
              aria-label={s.who ? `${s.name}: ${nameOf(s.who)}${s.who === me ? ", tap to drop it" : ""}` : `Bring ${s.name.toLowerCase()}`}
              onClick={() => { haptic("light"); dispatch({ t: "snack", i }); }}
              style={{ position: "absolute", left: snackX(i) - 22, top: H - 74, width: 44, height: 46, padding: 0, border: 0, background: "transparent", cursor: "pointer" }}
            >
              {s.who ? (
                <span style={{ position: "absolute", right: -2, top: -2, pointerEvents: "none", display: "flex", borderRadius: "50%", boxShadow: `0 0 0 1.5px ${c.card}` }}>
                  <Face id={s.who} members={members} size={16} theme={theme} />
                </span>
              ) : null}
            </button>
          ))}
          <div style={{ position: "absolute", left: tableX - tableW / 2, width: tableW, top: H - 22, display: "flex" }}>
            {state.snacks.map((s, i) => {
              const f = fitText(s.name, tableW / ns - 4, { size: 11, min: 10 });
              return (
                <span key={i} style={{ flex: 1, textAlign: "center", fontSize: f.size, lineHeight: "14px", color: c.text, whiteSpace: "nowrap", overflow: "hidden" }}>{f.text}</span>
              );
            })}
          </div>
        </div>

        {/* showtimes */}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {state.times.map((tm, i) => {
            const mine = tm.who.includes(me);
            const won = state.locked?.time === i;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={mine}
                disabled={!!state.locked}
                onClick={() => { haptic("light"); dispatch({ t: "time", i }); }}
                style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 10, border: `1.5px solid ${mine || won ? c.primary : c.divider}`, background: mine || won ? c.selected : c.card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: 0, cursor: state.locked ? "default" : "pointer" }}
              >
                <span style={{ fontSize: 14, lineHeight: "18px", fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{tm.label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, height: 16 }}>
                  {tm.who.length ? <Facepile users={tm.who} max={3} size={14} /> : <span style={{ fontSize: 12, color: c.secondaryText }}>no picks</span>}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 10 }}>
          {state.locked ? (
            <Locked detail={`${state.times[state.locked.time]?.label ?? ""} · ${taken} on the couch${state.beanbag ? `, ${state.beanbag} on the beanbag` : ""}`}>{state.movie}</Locked>
          ) : (
            <Button kind="primary" wide disabled={!anyTime} onClick={() => { haptic("success"); setLocal({ toast: local.toast + 1 }); dispatch({ t: "lock" }); }}>
              {anyTime ? `Lock ${state.times[lead]?.label ?? "it"}` : "Pick a showtime"}
            </Button>
          )}
        </div>
        <div style={{ marginTop: 6, textAlign: "center", fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {iSit ? "Tap a snack to bring it" : taken ? "Tap a free cushion to sit" : "Tap a cushion to call your spot"}
        </div>
        {local.toast > 0 && state.locked ? <Toast key={local.toast}>{`${state.movie} · ${state.times[state.locked.time]?.label ?? ""}`}</Toast> : null}
      </div>
    );
  },
});
