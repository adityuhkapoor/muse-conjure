import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  Facepile,
  fitText,
  haptic,
  mix,
  pal,
  running,
  type Child,
  type Ctx,
  type Member,
} from "@muse/app";

// End of year: every plan the group locked, as pins on a drawn map of town with the route the year
// took between them. The most-visited place wears a crown. Tap a pin to see who went; give your
// heart to the best night of the year and watch it land on the pin.

type Params = {
  /** Card title */
  title: string;
  /** Totals for the year */
  stats: { plans: number; nights: number; dinners: number };
  /** 2 to 9 places in the order the year visited them; x and y are 0 to 1 on the map; kind is food, coffee, night, outdoor, campus or home */
  places: { name: string; kind: string; x: number; y: number; visits: number; who: string[]; note: string }[];
  /** Hearts already given: who picked which place as the best night */
  favs: { by: string; place: string }[];
};

// @params
const P: Params = {
  title: "Our year in Eastfield",
  stats: { plans: 38, nights: 21, dinners: 14 },
  places: [
    { name: "Kettle & Crumb", kind: "coffee", x: 0.24, y: 0.36, visits: 7, who: ["Calvin", "Maya", "Aditya"], note: "Calvin: 7 alarms, 1 latte" },
    { name: "Golden Lantern", kind: "food", x: 0.56, y: 0.6, visits: 9, who: ["Arun", "Tsai Lin", "Will", "Maya", "Calvin", "Aditya"], note: "Arun: the dumpling count is classified" },
    { name: "Lake Wren", kind: "outdoor", x: 0.14, y: 0.78, visits: 3, who: ["Will", "Maya", "Arun"], note: "Will: the sube survived the puddle" },
    { name: "Rook's Pizza", kind: "food", x: 0.72, y: 0.36, visits: 6, who: ["Aditya", "Will", "Calvin", "Arun"], note: "Aditya: lowkey the best slice" },
    { name: "Midtown Lanes", kind: "night", x: 0.84, y: 0.74, visits: 4, who: ["Tsai Lin", "Will", "Calvin", "Maya"], note: "Tsai Lin vetoed the bowling playlist" },
    { name: "Miller Hill", kind: "outdoor", x: 0.88, y: 0.2, visits: 2, who: ["Arun", "Will", "Tsai Lin", "Calvin"], note: "Arun brought three trays" },
  ],
  favs: [
    { by: "Maya", place: "Lake Wren" },
    { by: "Will", place: "Midtown Lanes" },
    { by: "Arun", place: "Golden Lantern" },
    { by: "Tsai Lin", place: "Golden Lantern" },
  ],
};
// @end params

const KINDS = ["food", "coffee", "night", "outdoor", "campus", "home"] as const;
type Kind = (typeof KINDS)[number];
type Place = { id: string; name: string; kind: Kind; x: number; y: number; visits: number; who: string[]; note: string };
type Fav = { user: string; place: string; at: number };
type State = { title: string; stats: { plans: number; nights: number; dinners: number }; places: Place[]; favs: Fav[] };
type Action = { t: "fav"; place: string };
type Local = { pin: string };

const MAP_H = 214;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo);
const frac = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0.06, Math.min(0.94, v)) : d);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const standIn = (u: string) => u.startsWith("~");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const r1 = (n: number) => Math.round(n * 10) / 10;
const hearts = (s: State, id: string) => s.favs.filter((f) => f.place === id).length;
const crowned = (s: State) => s.places.reduce((b, p) => (p.visits > b.visits ? p : b), s.places[0]!);

function initState(ctx: Ctx): State {
  const places: Place[] = [];
  for (const p of Array.isArray(P.places) ? P.places : []) {
    const name = clean(p?.name, 22);
    if (!name || places.length >= 9 || places.some((x) => x.name === name)) continue;
    const kind = (KINDS as readonly string[]).includes(p?.kind) ? (p.kind as Kind) : "food";
    const who = (Array.isArray(p?.who) ? p.who : []).map((w) => clean(w, 16)).filter(Boolean).slice(0, 12);
    places.push({ id: `p${places.length}`, name, kind, x: frac(p?.x, 0.5), y: frac(p?.y, 0.5), visits: num(p?.visits, 1, 999), who, note: clean(p?.note, 60) });
  }
  if (places.length === 0) places.push({ id: "p0", name: "Home", kind: "home", x: 0.5, y: 0.5, visits: 1, who: [], note: "" });
  const favs: Fav[] = [];
  for (const f of Array.isArray(P.favs) ? P.favs : []) {
    const by = clean(f?.by, 16);
    const place = places.find((p) => p.name.toLowerCase() === clean(f?.place, 22).toLowerCase());
    if (!by || !place) continue;
    const user = ctx.members.find((m) => m.name.toLowerCase() === by.toLowerCase())?.id ?? `~${by}`;
    if (favs.some((x) => x.user === user)) continue;
    favs.push({ user, place: place.id, at: 0 });
  }
  return {
    title: clean(P.title, 40) || "Our year",
    stats: { plans: num(P.stats?.plans, 0, 9999), nights: num(P.stats?.nights, 0, 9999), dinners: num(P.stats?.dinners, 0, 9999) },
    places,
    favs,
  };
}

// ---- drawing ----

type Pal = ReturnType<typeof pal>;

function glyph(kind: Kind, x: number, y: number, col: string): Child {
  const t = `translate(${r1(x)} ${r1(y)})`;
  if (kind === "food") return <g transform={t}><path d="M-6 -1 H6 Q6 5 0 5 Q-6 5 -6 -1 Z" fill={col} /><path d="M-2 -3 L1 -7 M2 -3 L5 -7" stroke={col} stroke-width={1.3} stroke-linecap="round" /></g>;
  if (kind === "coffee") return <g transform={t}><path d="M-5 -4 H4 V2 Q4 5 0 5 H-1 Q-5 5 -5 2 Z" fill={col} /><path d="M4 -2 Q7 -2 7 0.5 Q7 3 4 2.5" fill="none" stroke={col} stroke-width={1.3} /></g>;
  if (kind === "night") return <g transform={t}><path d="M0 -6 L1.8 -1.8 L6 -1.5 L2.8 1.3 L3.8 5.5 L0 3.2 L-3.8 5.5 L-2.8 1.3 L-6 -1.5 L-1.8 -1.8 Z" fill={col} /></g>;
  if (kind === "outdoor") return <g transform={t}><path d="M0 -7 L6 3 H-6 Z" fill={col} /><rect x={-1} y={3} width={2} height={3} fill={col} /></g>;
  if (kind === "campus") return <g transform={t}><path d="M-6 -4 Q-3 -6 0 -4 Q3 -6 6 -4 V4 Q3 2 0 4 Q-3 2 -6 4 Z" fill={col} /></g>;
  return <g transform={t}><path d="M-6 0 L0 -6 L6 0 V5 H-6 Z" fill={col} /></g>;
}

const CSS =
  "@keyframes pmDrop{0%{transform:translateY(-14px);opacity:0}60%{transform:translateY(2px);opacity:1}100%{transform:none}}" +
  "@keyframes pmDash{to{stroke-dashoffset:-24}}" +
  "@keyframes pmBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}" +
  ".pm-drop{animation:pmDrop .5s cubic-bezier(.34,1.56,.64,1) both}" +
  ".pm-route{animation:pmDash 2.4s linear infinite}" +
  ".pm-bob{animation:pmBob 2.2s ease-in-out infinite}" +
  "@media (prefers-reduced-motion:reduce){.pm-drop,.pm-route,.pm-bob{animation:none}}";

export default defineApp<State, Action, Local>({
  name: "Plans map",
  summary: (s) => {
    const top = crowned(s);
    const fav = [...s.places].sort((a, b) => hearts(s, b.id) - hearts(s, a.id))[0]!;
    return `${s.stats.plans} plans this year · ${top.name} ${top.visits} times${hearts(s, fav.id) ? ` · best night: ${fav.name} (${hearts(s, fav.id)})` : ""}`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user) || typeof action.place !== "string") return state;
    if (!state.places.some((p) => p.id === action.place)) return state;
    const mine = state.favs.find((f) => f.user === meta.user);
    if (mine && mine.place === action.place) return { ...state, favs: state.favs.filter((f) => f.user !== meta.user) };
    return { ...state, favs: [...state.favs.filter((f) => f.user !== meta.user), { user: meta.user, place: action.place, at: meta.time }] };
  },

  onMembers: (state, ctx) => {
    const favs = state.favs.filter((f) => standIn(f.user) || inChat(ctx, f.user));
    return favs.length === state.favs.length ? state : { ...state, favs };
  },

  invariants: {
    "one heart per person": (s) => new Set(s.favs.map((f) => f.user)).size === s.favs.length,
    "hearts land on real places": (s) => s.favs.every((f) => s.places.some((p) => p.id === f.place)),
    "hearts come from the chat or the post": (s, ctx) => s.favs.every((f) => standIn(f.user) || inChat(ctx, f.user)),
    "pins stay on the map": (s) => s.places.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && p.visits >= 1),
  },

  transitions: {
    "a heart moves only mine": (p, n, a, m) => a.t !== "fav" || p === n || same(p.favs.filter((f) => f.user !== m.user), n.favs.filter((f) => f.user !== m.user)),
    "tapping my pick again takes it back, otherwise it lands": (p, n, a, m, ctx) => {
      if (a.t !== "fav" || !inChat(ctx, m.user) || !p.places.some((x) => x.id === a.place)) return true;
      const was = p.favs.find((f) => f.user === m.user);
      const now = n.favs.find((f) => f.user === m.user);
      return was?.place === a.place ? !now : !!now && now.place === a.place && now.at === m.time;
    },
    "the map never changes": (p, n) => same(p.places, n.places) && same(p.stats, n.stats) && p.title === n.title,
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => (r.next() < 0.04 ? { t: "fav", place: "nowhere" } : { t: "fav", place: r.pick(s.places).id }),

  local: { pin: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const dark = theme.mode === "dark";
    const crown = crowned(state);
    const sel = state.places.find((x) => x.id === local.pin) ?? crown;
    const myFav = state.favs.find((f) => f.user === me);
    const here = members.some((m) => m.id === me);
    const nameToMember = (n: string): Member => members.find((m) => m.name.toLowerCase() === n.toLowerCase()) ?? { id: `n:${n}`, name: n };
    const userToMember = (u: string): Member => (standIn(u) ? { id: u, name: u.slice(1) } : members.find((m) => m.id === u)) ?? { id: u, name: "Friend" };

    const land = dark ? mix(p.grass, c.wash, 0.7) : mix(p.grass, c.card, 0.55);
    const road = dark ? mix(c.wash, c.text, 0.18) : c.card;
    const roadEdge = mix(land, c.text, 0.15);
    const water = dark ? mix(p.blue, c.wash, 0.55) : mix(p.sky, p.blue, 0.25);
    const X = (f: number) => f * W;
    const Y = (f: number) => f * MAP_H;

    const roads = [
      `M0 ${Y(0.5)} C${X(0.3)} ${Y(0.46)} ${X(0.6)} ${Y(0.56)} ${W} ${Y(0.5)}`,
      `M${X(0.42)} 0 C${X(0.4)} ${Y(0.4)} ${X(0.46)} ${Y(0.7)} ${X(0.4)} ${MAP_H}`,
      `M${X(0.62)} 0 L${X(0.7)} ${MAP_H}`,
      `M0 ${Y(0.18)} L${X(0.42)} ${Y(0.2)}`,
      `M${X(0.42)} ${Y(0.84)} L${W} ${Y(0.9)}`,
    ];
    const blocks: Child[] = [];
    const bl: [number, number, number, number][] = [[0.04, 0.24, 0.1, 0.12], [0.48, 0.06, 0.1, 0.14], [0.74, 0.56, 0.12, 0.1], [0.5, 0.66, 0.08, 0.12], [0.28, 0.58, 0.08, 0.1], [0.76, 0.06, 0.08, 0.08]];
    bl.forEach(([x, y, w, h], k) => blocks.push(<rect key={`bl${k}`} x={r1(X(x))} y={r1(Y(y))} width={r1(X(w))} height={r1(Y(h))} rx={3} fill={mix(land, c.text, 0.08)} />));

    // The year's route, place to place, as a dotted line.
    let route = "";
    state.places.forEach((pl, i) => {
      const x = X(pl.x);
      const y = Y(pl.y);
      if (i === 0) route = `M${r1(x)} ${r1(y)}`;
      else {
        const prev = state.places[i - 1]!;
        const mx = (X(prev.x) + x) / 2 + (i % 2 ? 18 : -18);
        const my = (Y(prev.y) + y) / 2 + (i % 2 ? -14 : 14);
        route += ` Q${r1(mx)} ${r1(my)} ${r1(x)} ${r1(y)}`;
      }
    });

    const pinCol = (pl: Place) => (pl.id === sel.id ? c.primary : pl.id === crown.id ? mix(p.orange, p.red, 0.3) : dark ? mix(p.purple, c.text, 0.15) : mix(p.dark, p.blue, 0.25));
    const pins = state.places.map((pl) => {
      const x = X(pl.x);
      const y = Y(pl.y);
      const big = pl.id === sel.id;
      const s = big ? 1.2 : 1;
      const col = pinCol(pl);
      const hcount = hearts(state, pl.id);
      return (
        <g key={pl.id} transform={`translate(${r1(x)} ${r1(y)}) scale(${s})`}>
          <ellipse cx={0} cy={0} rx={6} ry={2.4} fill={mix(land, c.text, 0.25)} />
          <path d="M0 0 C-3 -8 -12 -12 -12 -21 A12 12 0 1 1 12 -21 C12 -12 3 -8 0 0 Z" fill={col} />
          {glyph(pl.kind, 0, -21, c.onPrimary)}
          {pl.id === crown.id ? (
            <g class="pm-bob">
              <path d="M-8 -36 L-8 -43 L-4 -39 L0 -45 L4 -39 L8 -43 L8 -36 Z" fill={p.yellow} stroke={mix(p.yellow, p.orange, 0.6)} stroke-width={1} stroke-linejoin="round" />
            </g>
          ) : null}
          {hcount > 0 ? (
            <g transform="translate(13 -30)">
              <path d="M0 4 C-7 -1 -4 -7 0 -3.5 C4 -7 7 -1 0 4 Z" fill={p.red} stroke={c.card} stroke-width={1} />
            </g>
          ) : null}
        </g>
      );
    });

    const mineAt = myFav && myFav.at > 0 && running(myFav.at, 1200) !== null ? myFav : null;
    const favPlace = mineAt ? state.places.find((x) => x.id === mineAt.place) : null;
    const selHearts = state.favs.filter((f) => f.place === sel.id);
    const isMine = myFav?.place === sel.id;
    const nameFit = fitText(sel.name, W - 150, { size: 17, weight: 700, min: 12 });
    const noteFit = sel.note ? fitText(`"${sel.note}"`, W, { size: 13, min: 11 }) : null;

    const stat = (n: number, label: string) => (
      <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
        <div style={{ fontSize: 20, lineHeight: "24px", fontWeight: 700, color: c.text }}>{n}</div>
        <div style={{ fontSize: 12, lineHeight: "14px", color: c.secondaryText, whiteSpace: "nowrap" }}>{label}</div>
      </div>
    );

    return (
      <div>
        <style>{CSS}</style>
        <CardHeader title={state.title} subtitle={state.favs.length ? `${state.places.length} places · ${state.favs.length} hearts for the best night` : `${state.places.length} places · pick the best night of the year`} />
        <div style={{ position: "relative", height: MAP_H, borderRadius: 12, overflow: "hidden", background: land }}>
          <svg width={W} height={MAP_H} viewBox={`0 0 ${W} ${MAP_H}`} role="img" aria-label={`Map of ${state.places.length} places: ${state.places.map((x) => `${x.name} ${x.visits} times`).join(", ")}`} style={{ position: "absolute", left: 0, top: 0 }}>
            <path d={`M0 ${Y(0.66)} C${X(0.12)} ${Y(0.6)} ${X(0.3)} ${Y(0.7)} ${X(0.3)} ${Y(0.86)} C${X(0.3)} ${Y(1.02)} ${X(0.05)} ${Y(1.04)} 0 ${Y(0.98)} Z`} fill={water} />
            <path d={`M${X(0.08)} ${Y(0.74)} q8 -3 16 0 M${X(0.16)} ${Y(0.86)} q8 -3 16 0`} fill="none" stroke={mix(water, c.card, 0.5)} stroke-width={1.2} stroke-linecap="round" />
            {[38, 26, 14].map((r, k) => <ellipse key={`h${k}`} cx={X(0.9)} cy={Y(0.16)} rx={r * 1.5} ry={r} fill={mix(land, p.leaf, 0.15 + k * 0.12)} />)}
            {blocks}
            {roads.map((d, k) => <path key={`re${k}`} d={d} fill="none" stroke={roadEdge} stroke-width={9} stroke-linecap="round" />)}
            {roads.map((d, k) => <path key={`r${k}`} d={d} fill="none" stroke={road} stroke-width={7} stroke-linecap="round" />)}
            <rect x={X(0.24)} y={Y(0.04)} width={X(0.13)} height={Y(0.12)} rx={4} fill={mix(land, p.leaf, 0.35)} />
            <path d={route} fill="none" stroke={c.primary} stroke-width={2.2} stroke-dasharray="2 6" stroke-linecap="round" class="pm-route" />
            {pins}
          </svg>
          {state.places.map((pl) => (
            <button
              key={`b${pl.id}`}
              type="button"
              aria-label={`${pl.name}, ${pl.visits} times, ${hearts(state, pl.id)} hearts`}
              aria-pressed={pl.id === sel.id}
              onClick={() => setLocal({ pin: pl.id })}
              style={{ position: "absolute", left: r1(X(pl.x) - 22), top: r1(Y(pl.y) - 40), width: 44, height: 44, borderRadius: 22 }}
            />
          ))}
          {state.places.map((pl) => {
            const n = hearts(state, pl.id);
            return n > 1 ? (
              <span key={`hc${pl.id}`} aria-hidden="true" style={{ position: "absolute", left: r1(X(pl.x) + 17), top: r1(Y(pl.y) - 45), height: 16, minWidth: 16, padding: "0 4px", borderRadius: 8, background: c.card, color: c.text, fontSize: 11, fontWeight: 700, lineHeight: "16px", textAlign: "center", pointerEvents: "none" }}>{n}</span>
            ) : null;
          })}
          {favPlace ? (
            <div style={{ position: "absolute", left: r1(X(favPlace.x)), top: r1(Y(favPlace.y) - 30), pointerEvents: "none" }}>
              <Burst key={mineAt!.at} emoji="❤️" />
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", marginTop: 8, padding: "6px 0", borderRadius: 12, background: c.wash }}>
          {stat(state.stats.plans, "plans locked")}
          {stat(state.stats.nights, "nights out")}
          {stat(state.stats.dinners, "dinners")}
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: nameFit.size, lineHeight: "20px", fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>{nameFit.text}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, height: 18 }}>
                <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap" }}>{`${sel.visits} ${sel.visits === 1 ? "time" : "times"}${sel.id === crown.id ? " · most visited" : ""}`}</span>
                <Facepile users={sel.who.map(nameToMember)} max={4} size={16} />
              </div>
            </div>
            {here ? (
              <Button kind={isMine ? "secondary" : "primary"} onClick={() => { dispatch({ t: "fav", place: sel.id }); haptic("success"); }}>
                {isMine ? `Your best night` : "Best night"}
              </Button>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, height: 22, marginTop: 2 }}>
            {noteFit ? <span style={{ flex: 1, minWidth: 0, fontSize: noteFit.size, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{noteFit.text}</span> : <span style={{ flex: 1 }} />}
            {selHearts.length > 0 ? <Facepile users={selHearts.map((f) => userToMember(f.user))} max={3} size={16} /> : null}
          </div>
        </div>
      </div>
    );
  },
});
