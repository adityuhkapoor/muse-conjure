import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Facepile,
  Locked,
  Thumb,
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
  type ThumbKind,
} from "@muse/app";

// Reel map: the trip reel somebody shared, pulled apart into its spots and pinned on a drawn map of
// the city. Tap the pins you want; once enough of the chat wants a spot, the route reaches it and
// draws itself across the map. When the route looks right, put the long weekend to a vote.

type Params = {
  /** The city: "Montreal" */
  city: string;
  /** Who shared the reel, and what they said */
  from: string;
  quote: string;
  /** 3 to 6 spots from the reel, in the order the reel visits them. x and y in thousandths of the map. */
  spots: { name: string; kind: ThumbKind; x: number; y: number }[];
  /** Spots people already tapped (indexes into spots), with an optional line in their words */
  wants: { who: string; spots: number[]; note?: string }[];
  /** The weekend that goes to a vote: "Oct 10–13, the long weekend" */
  weekend: string;
};

// @params
const P: Params = {
  city: "Montreal",
  from: "Tsai Lin",
  quote: "we need to do this exact trip",
  spots: [
    { name: "Bagels on Fairmount", kind: "bread", x: 300, y: 250 },
    { name: "Mount Royal lookout", kind: "park", x: 130, y: 470 },
    { name: "Jean-Talon market", kind: "storefront", x: 640, y: 170 },
    { name: "The tiny bookstore", kind: "book", x: 560, y: 520 },
    { name: "Poutine at 2am", kind: "curry", x: 820, y: 640 },
  ],
  wants: [
    { who: "Tsai Lin", spots: [0, 1, 2, 3, 4] },
    { who: "Maya", spots: [0, 2, 3], note: "i made a tab for the bookstore already" },
    { who: "Will", spots: [1, 4] },
    { who: "Calvin", spots: [4], note: "2am poutine is the only reason i'm going" },
    { who: "Arun", spots: [2], note: "can the rice cooker come" },
  ],
  weekend: "Oct 10–13, the long weekend",
};
// @end params

type Spot = { name: string; kind: ThumbKind; x: number; y: number };
type State = {
  city: string;
  from: string;
  quote: string;
  weekend: string;
  spots: Spot[];
  /** spot index to who wants it (member ids, or names for people from the reel's comments) */
  wants: string[][];
  /** people named in the params, who count even when not in the chat */
  cast: string[];
  notes: { who: string; spot: number; text: string }[];
  at: number;
  vote: { at: number; by: string; yes: string[]; no: string[] } | null;
};
type Action = { t: "want"; spot: number } | { t: "vote" } | { t: "yes" } | { t: "no" };
type Local = { toast: number };

const KINDS: ThumbKind[] = ["pizza", "burger", "ramen", "sushi", "taco", "salad", "pasta", "cake", "icecream", "coffee", "boba", "cocktail", "bread", "curry", "donut", "storefront", "house", "venue", "park", "campus", "couch", "ticket", "car", "gift", "suitcase", "book"];
const MAP_H = 248;
const DRAW = tween({ duration: 900, easing: "decelerate" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idFor = (ctx: Ctx, name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? name;
const ok = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000;
/** Everyone who tapped at least one pin. */
const pickers = (s: State) => new Set(s.wants.flat());
/** A spot makes the route once half the people picking (at least two) want it. */
const need = (s: State) => Math.max(2, Math.ceil(pickers(s).size / 2));
const route = (s: State) => s.spots.map((_, i) => i).filter((i) => (s.wants[i]?.length ?? 0) >= need(s));

function initState(ctx: Ctx): State {
  const spots: Spot[] = [];
  for (const sp of Array.isArray(P.spots) ? P.spots : []) {
    const name = clean(sp?.name, 32);
    if (!name || spots.length >= 6) continue;
    spots.push({ name, kind: KINDS.includes(sp.kind) ? sp.kind : "storefront", x: ok(sp.x) ? Math.min(900, Math.max(100, sp.x)) : 500, y: ok(sp.y) ? Math.min(800, Math.max(120, sp.y)) : 500 });
  }
  const wants: string[][] = spots.map(() => []);
  const cast: string[] = [];
  const notes: State["notes"] = [];
  for (const w of Array.isArray(P.wants) ? P.wants : []) {
    const name = clean(w?.who, 20);
    if (!name) continue;
    const id = idFor(ctx, name);
    if (cast.includes(id)) continue;
    cast.push(id);
    const list = Array.isArray(w.spots) ? w.spots : [];
    for (const i of list) if (Number.isInteger(i) && i >= 0 && i < spots.length && !wants[i]!.includes(id)) wants[i]!.push(id);
    const text = clean(w.note, 60);
    const first = list.find((i) => Number.isInteger(i) && i >= 0 && i < spots.length);
    if (text && first !== undefined) notes.push({ who: id, spot: first, text });
  }
  return { city: clean(P.city, 24) || "the city", from: clean(P.from, 20), quote: clean(P.quote, 60), weekend: clean(P.weekend, 40) || "the weekend", spots, wants, cast, notes, at: 0, vote: null };
}

function reduceIt(s: State, a: Action, m: Meta, ctx: Ctx): State {
  if (!inChat(ctx, m.user)) return s;
  const u = m.user;
  if (a.t === "want") {
    if (typeof a.spot !== "number" || !Number.isInteger(a.spot) || a.spot < 0 || a.spot >= s.spots.length) return s;
    const list = s.wants[a.spot] ?? [];
    const next = list.includes(u) ? list.filter((x) => x !== u) : [...list, u];
    return { ...s, wants: s.wants.map((w, i) => (i === a.spot ? next : w)), at: Math.max(1, m.time) };
  }
  if (a.t === "vote") {
    if (s.vote || route(s).length === 0) return s;
    return { ...s, vote: { at: Math.max(1, m.time), by: u, yes: [u], no: [] } };
  }
  if (a.t === "yes" || a.t === "no") {
    if (!s.vote) return s;
    const yes = s.vote.yes.filter((x) => x !== u);
    const no = s.vote.no.filter((x) => x !== u);
    return { ...s, vote: { ...s.vote, yes: a.t === "yes" ? [...yes, u] : yes, no: a.t === "no" ? [...no, u] : no } };
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

/** The city, drawn: a tilted street grid, the mountain with its cross, the river, a park. */
function CityArt({ W, theme, label }: { W: number; theme: Theme; label: string }) {
  const c = theme.color;
  const p = pal(theme);
  const dk = theme.mode === "dark";
  const land = dk ? mix(c.wash, p.wall, 0.12) : mix(p.wall, c.card, 0.35);
  const street = dk ? mix(c.wash, c.text, 0.12) : c.card;
  const water = dk ? mix(p.blue, c.wash, 0.55) : mix(p.blue, c.card, 0.55);
  const H = MAP_H;
  const streets = [];
  for (let k = -6; k < 14; k++) {
    const x = k * 46;
    streets.push(<line key={`s${k}`} x1={x} y1={0} x2={x + 90} y2={H} stroke={street} stroke-width={k % 3 === 0 ? 5 : 2} />);
  }
  for (let k = 0; k < 9; k++) {
    const y = k * 34 - 10;
    streets.push(<line key={`a${k}`} x1={0} y1={y + 40} x2={W} y2={y - 40} stroke={street} stroke-width={k % 3 === 1 ? 5 : 2} />);
  }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ position: "absolute", left: 0, top: 0, display: "block" }}>
      <rect x={0} y={0} width={W} height={H} fill={land} />
      {streets}
      {/* the mountain */}
      <path d={`M ${-10} ${H * 0.62} C ${W * 0.02} ${H * 0.2}, ${W * 0.3} ${H * 0.22}, ${W * 0.33} ${H * 0.5} C ${W * 0.36} ${H * 0.78}, ${W * 0.1} ${H * 0.9}, ${-10} ${H * 0.82} Z`} fill={dk ? mix(p.green, c.wash, 0.5) : mix(p.green, c.card, 0.45)} />
      <path d={`M ${W * 0.04} ${H * 0.62} C ${W * 0.08} ${H * 0.38}, ${W * 0.24} ${H * 0.36}, ${W * 0.26} ${H * 0.52}`} fill="none" stroke={p.leaf} stroke-width={1.2} opacity={0.6} />
      <path d={`M ${W * 0.08} ${H * 0.6} C ${W * 0.11} ${H * 0.46}, ${W * 0.2} ${H * 0.45}, ${W * 0.21} ${H * 0.55}`} fill="none" stroke={p.leaf} stroke-width={1.2} opacity={0.6} />
      <line x1={W * 0.155} y1={H * 0.3} x2={W * 0.155} y2={H * 0.4} stroke={p.ink} stroke-width={2} />
      <line x1={W * 0.135} y1={H * 0.33} x2={W * 0.175} y2={H * 0.33} stroke={p.ink} stroke-width={2} />
      {/* a park */}
      <rect x={W * 0.42} y={H * 0.04} width={W * 0.12} height={H * 0.14} rx={6} fill={dk ? mix(p.green, c.wash, 0.6) : mix(p.green, c.card, 0.6)} transform={`rotate(-10 ${W * 0.48} ${H * 0.11})`} />
      {/* the river */}
      <path d={`M ${W * 0.38} ${H + 10} C ${W * 0.55} ${H * 0.86}, ${W * 0.8} ${H * 0.95}, ${W + 10} ${H * 0.6} L ${W + 10} ${H + 10} Z`} fill={water} />
      <path d={`M ${W * 0.62} ${H * 0.95} q 8 -4 16 0 q 8 4 16 0`} fill="none" stroke={c.card} stroke-width={1.5} opacity={0.7} />
      <path d={`M ${W * 0.84} ${H * 0.86} q 8 -4 16 0 q 8 4 16 0`} fill="none" stroke={c.card} stroke-width={1.5} opacity={0.7} />
    </svg>
  );
}

export default defineApp<State, Action, Local>({
  name: "Reel map",
  summary: (s) => {
    const r = route(s);
    const base = `${s.city} from the reel: ${r.length} of ${s.spots.length} spots on the route`;
    return s.vote ? `${base} · ${s.weekend}: ${s.vote.yes.length} in` : base;
  },

  init: initState,
  reduce: (s, a, m, ctx) => reduceIt(s, a, m, ctx),
  onMembers: (s, ctx) => {
    const keep = (u: string) => inChat(ctx, u) || s.cast.includes(u);
    const wants = s.wants.map((w) => w.filter(keep));
    const vote = s.vote ? { ...s.vote, yes: s.vote.yes.filter((u) => inChat(ctx, u)), no: s.vote.no.filter((u) => inChat(ctx, u)) } : null;
    return { ...s, wants, vote };
  },

  invariants: {
    "one want per person per spot": (s) => s.wants.length === s.spots.length && s.wants.every((w) => new Set(w).size === w.length),
    "wants come from the chat or the reel's comments": (s, ctx) => s.wants.every((w) => w.every((u) => inChat(ctx, u) || s.cast.includes(u))),
    "nobody is both in and out": (s) => s.vote === null || (s.vote.yes.every((u) => !s.vote!.no.includes(u)) && new Set(s.vote.yes).size === s.vote.yes.length && new Set(s.vote.no).size === s.vote.no.length),
    "voters are in the chat": (s, ctx) => s.vote === null || [...s.vote.yes, ...s.vote.no].every((u) => inChat(ctx, u)),
    "the vote has a time": (s) => s.vote === null || (Number.isInteger(s.vote.at) && s.vote.at > 0),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a tap toggles only my pin on that spot": (p, n, a, m) => {
      if (a.t !== "want" || p === n) return true;
      const was = p.wants[a.spot]!.includes(m.user);
      if (n.wants[a.spot]!.includes(m.user) === was) return false;
      if (n.wants[a.spot]!.length !== p.wants[a.spot]!.length + (was ? -1 : 1)) return false;
      return n.wants.every((w, i) => i === a.spot || w === p.wants[i]) && n.at === Math.max(1, m.time);
    },
    "the vote starts once, with its starter in": (p, n, a, m) =>
      a.t !== "vote" || p === n || (p.vote === null && route(p).length > 0 && !!n.vote && n.vote.by === m.user && n.vote.yes.join() === m.user && n.vote.no.length === 0),
    "an answer moves only me": (p, n, a, m) => {
      if ((a.t !== "yes" && a.t !== "no") || p === n) return true;
      if (!p.vote || !n.vote) return false;
      const mine = a.t === "yes" ? n.vote.yes : n.vote.no;
      const other = a.t === "yes" ? n.vote.no : n.vote.yes;
      const others = (l: string[]) => l.filter((u) => u !== m.user).join();
      return mine.includes(m.user) && !other.includes(m.user) && others(n.vote.yes) === others(p.vote.yes) && others(n.vote.no) === others(p.vote.no);
    },
    "pins only change by tapping": (p, n, a) => a.t === "want" || n.wants === p.wants,
    "the vote only changes by voting": (p, n, a) => a.t !== "want" || n.vote === p.vote,
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (s.vote && k < 0.4) return { t: k < 0.25 ? "yes" : "no" };
    if (!s.vote && k < 0.12) return { t: "vote" };
    if (!s.spots.length) return { t: "vote" };
    return { t: "want", spot: r.int(s.spots.length) };
  },

  local: { toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const r = route(state);
    const needN = need(state);
    const prog = state.at > 0 ? DRAW(running(state.at, 900) ?? 900) : 1;
    if (state.at > 0 && prog < 1) void clock.value;
    const X = (x: number) => (x / 1000) * W;
    const Y = (y: number) => (y / 1000) * MAP_H;
    const d = r.map((i, k) => `${k ? "L" : "M"} ${X(state.spots[i]!.x).toFixed(1)} ${Y(state.spots[i]!.y).toFixed(1)}`).join(" ");
    const note = state.notes.length ? state.notes[state.notes.length - 1] : null;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id;
    const mineCount = state.wants.filter((w) => w.includes(me)).length;
    const yes = state.vote?.yes ?? [];
    const no = state.vote?.no ?? [];
    const locked = !!state.vote && yes.length >= Math.max(2, Math.ceil(members.length / 2));
    const sub = `From ${state.from ? `${state.from}'s` : "the"} reel · ${state.spots.length} spots · ${r.length} on the route`;

    return (
      <div>
        <CardHeader title={`${state.city}, the exact trip`} subtitle={sub} />
        {state.quote && state.from ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, marginBottom: 8, fontSize: 13, lineHeight: "18px", color: c.text, whiteSpace: "nowrap", overflow: "hidden" }}>
            <Face id={state.from} members={members} size={20} theme={theme} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{`${state.from}: “${state.quote}”`}</span>
          </div>
        ) : null}
        <div style={{ position: "relative", height: MAP_H, borderRadius: 14, overflow: "hidden" }}>
          <CityArt W={W} theme={theme} label={`Map of ${state.city} with ${state.spots.length} spots, ${r.length} on the route`} />
          <svg width={W} height={MAP_H} viewBox={`0 0 ${W} ${MAP_H}`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            {r.length > 1 ? (
              <>
                <path d={d} fill="none" stroke={c.card} stroke-width={8} stroke-linecap="round" stroke-linejoin="round" pathLength={100} stroke-dasharray="100 100" stroke-dashoffset={100 * (1 - prog)} />
                <path d={d} fill="none" stroke={c.primary} stroke-width={4} stroke-linecap="round" stroke-linejoin="round" pathLength={100} stroke-dasharray="100 100" stroke-dashoffset={100 * (1 - prog)} />
              </>
            ) : null}
          </svg>
          {state.spots.map((s, i) => {
            const w = state.wants[i] ?? [];
            const on = r.includes(i);
            const mine = w.includes(me);
            const x = X(s.x);
            const y = Y(s.y);
            const faces = w.slice(0, 3);
            return (
              <button
                key={i}
                type="button"
                aria-label={`${s.name}, ${w.length} want it${mine ? ", you too" : ""}`}
                aria-pressed={mine}
                onClick={() => { haptic("light"); dispatch({ t: "want", spot: i }); }}
                style={{ position: "absolute", left: x - 24, top: y - 30, width: 48, height: 52, padding: 0, border: 0, background: "transparent", cursor: "pointer" }}
              >
                <span style={{ position: "absolute", left: 4, top: 0, width: 40, height: 40, borderRadius: "50%", background: c.card, boxShadow: `0 0 0 ${on ? 3 : 1.5}px ${on ? c.primary : c.divider}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <Thumb kind={s.kind} seed={s.name} size={34} label="" />
                </span>
                <span style={{ position: "absolute", left: 18, top: 38, width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `7px solid ${on ? c.primary : c.card}` }} />
                <span style={{ position: "absolute", left: -2, top: -4, minWidth: 18, height: 18, borderRadius: 9, background: mine ? c.primary : c.card, color: mine ? c.onPrimary : c.text, fontSize: 11, fontWeight: 700, lineHeight: "18px", textAlign: "center", boxShadow: `0 0 0 1px ${c.divider}` }}>{w.length}</span>
                {faces.length ? (
                  <span style={{ position: "absolute", left: 24 - (faces.length * 11 + 5) / 2, top: 44, display: "flex" }}>
                    {faces.map((u, k) => (
                      <span key={u} style={{ marginLeft: k ? -5 : 0, borderRadius: "50%", boxShadow: `0 0 0 1.5px ${c.card}`, display: "flex" }}>
                        <Face id={u} members={members} size={16} theme={theme} />
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* the route, in reel order */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 10, height: 28, overflow: "hidden" }}>
          {r.length ? (
            r.map((i, k) => {
              const f = fitText(state.spots[i]!.name, r.length > 3 ? 70 : 104, { size: 13, min: 11 });
              return (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, flex: "0 1 auto", minWidth: 0 }}>
                  {k ? <span style={{ color: c.secondaryText, fontSize: 13 }}>›</span> : null}
                  <span style={{ padding: "4px 8px", borderRadius: 999, background: c.selected, color: c.text, fontSize: f.size, lineHeight: "18px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{f.text}</span>
                </span>
              );
            })
          ) : (
            <span style={{ flex: 1, height: 26, borderRadius: 999, border: `1.5px dashed ${c.divider}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: c.secondaryText }}>
              {`Tap the spots you want · ${needN} picks puts one on the route`}
            </span>
          )}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {mineCount
            ? `You picked ${mineCount} · a spot needs ${needN} picks to make the route`
            : note
              ? `${nameOf(note.who)}: “${note.text}”`
              : `A spot needs ${needN} picks to make the route`}
        </div>

        <div style={{ marginTop: 10 }}>
          {state.vote ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {locked ? (
                  <Locked detail={`${yes.length} in`}>{state.weekend}</Locked>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <Facepile users={yes} max={3} size={20} />
                    <span style={{ fontSize: 13, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${yes.length} in${no.length ? ` · ${no.length} out` : ""} · ${state.weekend}`}</span>
                  </div>
                )}
              </div>
              {yes.includes(me) ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "no" })}>Can't go</Button>
              ) : (
                <Button kind="secondary" onClick={() => { haptic("success"); dispatch({ t: "yes" }); }}>I'm in</Button>
              )}
            </div>
          ) : (
            <Button kind="primary" wide disabled={!r.length} onClick={() => { haptic("success"); setLocal({ toast: local.toast + 1 }); dispatch({ t: "vote" }); }}>
              Vote on the weekend
            </Button>
          )}
        </div>
        {local.toast > 0 && state.vote ? <Toast key={local.toast}>{`Vote is up · ${state.weekend}`}</Toast> : null}
      </div>
    );
  },
});
