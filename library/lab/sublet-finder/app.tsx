import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Facepile,
  Toast,
  at,
  clock,
  fitText,
  haptic,
  innerWidth,
  mix,
  pal,
  running,
  textWidth,
  tween,
  type Child,
  type Theme,
} from "@muse/app";

// Sublet finder: a big sublets group collapses to "6 for you" on a little Bay map. You swipe a stack
// of room cards (drag or tap); saves land in a shortlist the whole chat shares, where a place two of
// you saved lights up. Budget and friends-of-friends filters are per viewer (local); decisions and
// saves are shared state.

type Params = {
  group: string;
  posts: number;
  swiped: number;
  budgets: number[];
  listings: { hood: string; city: string; priceCents: number; dates: string; perk: string; via: string; viaWho: string; mutuals: number; view: number; x: number; y: number }[];
  people: { name: string; saved: string[]; passed: string[] }[]; // hoods
  /** Up to 4 place names drawn on the map, x and y from 0 to 1 */
  labels: { name: string; x: number; y: number }[];
};

// @params
const P: Params = {
  group: "Bay Area Sublets", posts: 1083, swiped: 38, budgets: [120000, 160000, 220000],
  listings: [
    { hood: "Rockridge", city: "Oakland", priceCents: 135000, dates: "Jun 1 – Aug 15", perk: "2 blocks to BART · bay window", via: "Priya's lab partner", viaWho: "Priya", mutuals: 3, view: 2, x: 0.68, y: 0.27 },
    { hood: "Mission", city: "SF", priceCents: 155000, dates: "Jun 1 – Aug 31", perk: "taqueria downstairs", via: "Theo's cousin", viaWho: "Theo", mutuals: 2, view: 3, x: 0.2, y: 0.47 },
    { hood: "Northside", city: "Berkeley", priceCents: 110000, dates: "May 20 – Aug 10", perk: "walk to campus · loft bed", via: "", viaWho: "", mutuals: 0, view: 2, x: 0.6, y: 0.11 },
    { hood: "Inner Sunset", city: "SF", priceCents: 145000, dates: "Jun 5 – Aug 20", perk: "fog included · N-Judah outside", via: "Noa's teammate", viaWho: "Noa", mutuals: 4, view: 1, x: 0.09, y: 0.45 },
    { hood: "Palo Alto", city: "", priceCents: 180000, dates: "Jun 1 – Sep 1", perk: "bike to Caltrain · garden", via: "Jonah's old RA", viaWho: "Jonah", mutuals: 1, view: 3, x: 0.55, y: 0.94 },
    { hood: "Temescal", city: "Oakland", priceCents: 125000, dates: "Jun 1 – Aug 15", perk: "backyard and a lemon tree", via: "Dev's roommate's sister", viaWho: "Dev", mutuals: 2, view: 4, x: 0.63, y: 0.33 },
    { hood: "Downtown", city: "Berkeley", priceCents: 170000, dates: "Jun 15 – Aug 15", perk: "rooftop · 1 min to BART", via: "", viaWho: "", mutuals: 0, view: 0, x: 0.64, y: 0.17 },
    { hood: "SoMa", city: "SF", priceCents: 210000, dates: "Jun 1 – Aug 31", perk: "gym in building, tiny but shiny", via: "Maya's coworker", viaWho: "Maya", mutuals: 1, view: 0, x: 0.25, y: 0.4 },
    { hood: "Alameda", city: "", priceCents: 99000, dates: "Jun 1 – Aug 20", perk: "ferry to SF · very quiet street", via: "Priya's aunt", viaWho: "Priya", mutuals: 5, view: 4, x: 0.58, y: 0.52 },
  ],
  people: [
    { name: "Maya", saved: ["Rockridge", "Mission"], passed: [] },
    { name: "Noa", saved: ["Rockridge", "Alameda"], passed: ["Northside"] },
    { name: "Dev", saved: [], passed: ["Inner Sunset"] },
  ],
  labels: [{ name: "SF", x: 0.18, y: 0.6 }, { name: "Berk", x: 0.84, y: 0.18 }, { name: "Oak", x: 0.82, y: 0.48 }, { name: "Palo Alto", x: 0.4, y: 0.92 }],
};
// @end params

type Listing = { id: string; hood: string; city: string; price: number; dates: string; perk: string; via: string; viaWho: string; mutuals: number; view: number; x: number; y: number };
type Save = { id: string; by: string; at: number };
type State = { group: string; posts: number; swiped: number; budgets: number[]; listings: Listing[]; seen: { [user: string]: string[] }; saves: Save[]; labels: { name: string; x: number; y: number }[] };
type Action = { t: "swipe"; id: string; save: boolean } | { t: "unsave"; id: string } | { t: "reshuffle" };
/** budget: index into budgets. fof: friends-of-friends filter. dragX: live drag. gone: the card flying out. */
type Local = { budget: number; fof: boolean; dragX: number; dragFrom: number; gone: { id: string; dir: number; at: number } | null };
type Ctx = { members: { id: string; name?: string }[] };
type Cols = Theme["color"];

const MAX_LISTINGS = 9;
const FLY_MS = 380;
const TOAST_MS = 2400;
const fly = tween({ duration: FLY_MS, easing: "decelerate" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const clampInt = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo);
const frac = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0.05, Math.min(0.95, v)) : 0.5);
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (cents: number) => `$${fmt(Math.round(cents / 100))}`;
const kfmt = (cents: number) => `$${(cents / 100000).toFixed(1).replace(/\.0$/, "")}K`;
const matches = (l: Listing, budget: number, fof: boolean) => l.price <= budget && (!fof || l.viaWho !== "");
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- Reducer side ----

const savedBy = (s: State, user: string) => [...new Set(s.saves.filter((x) => x.by === user).map((x) => x.id))];

function reduceFinder(s: State, a: Record<string, unknown>, user: string, time: number): State {
  if (a.t === "reshuffle") {
    const keep = savedBy(s, user);
    const old = s.seen[user] ?? [];
    if (!old.some((id) => !keep.includes(id))) return s;
    const seen = { ...s.seen };
    if (keep.length) seen[user] = keep;
    else delete seen[user];
    return { ...s, seen };
  }
  const id = a.id;
  if (typeof id !== "string" || !s.listings.some((l) => l.id === id)) return s;
  if (a.t === "swipe") {
    if (typeof a.save !== "boolean" || (s.seen[user] ?? []).includes(id)) return s;
    const next = { ...s, seen: { ...s.seen, [user]: [...(s.seen[user] ?? []), id] } };
    return a.save ? { ...next, saves: [...s.saves, { id, by: user, at: time }] } : next;
  }
  if (a.t === "unsave") {
    if (!s.saves.some((x) => x.id === id && x.by === user)) return s;
    return { ...s, saves: s.saves.filter((x) => !(x.id === id && x.by === user)) };
  }
  return s;
}

// ---- Check side ----

const seenOthersEqual = (p: State, n: State, user: string) => {
  const rest = (x: State) => JSON.stringify(Object.entries(x.seen).filter(([k]) => k !== user).sort(([a], [b]) => (a < b ? -1 : 1)));
  return rest(p) === rest(n);
};

// ---- Drawing ----

/** Heart centered at (0,0), 2.2 wide and 1.9 tall: scale it with a transform. */
const HEART = "M0 .9C-1.2 .1-1.1-.8-.5-.85-.2-.88 0-.65 0-.5 0-.65.2-.88.5-.85 1.1-.8 1.2 .1 0 .9Z";
const Heart = (p: { x: number; y: number; w: number; fill: string }) => <path d={HEART} fill={p.fill} transform={`translate(${p.x} ${p.y}) scale(${p.w / 2.2})`} />;
const pulse = (el: Element | null) => void el?.animate?.([{ opacity: 0.3 }, { opacity: 0.08 }], { duration: 900, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
const popEl = (el: Element | null) => void (el as HTMLElement | null)?.animate?.([{ transform: "scale(.8)" }, { transform: "scale(1)" }], { duration: 300, easing: "cubic-bezier(.2,0,0,1)" });

function Room(p: { view: number; c: Cols; t: Theme }): Child {
  const c = p.c;
  const q = pal(p.t);
  const v = p.view;
  const fy = 102;
  const wall = [mix(q.tile, c.card, 0.3), mix(q.grass, c.card, 0.5), q.cream, q.wall, mix(q.sky, c.card, 0.6)][v]!;
  const glass = v === 1 ? mix(q.tile, c.card, 0.3) : v === 3 ? q.cream : q.sky;
  const blanket = [q.purple, q.red, q.green, q.orange, q.blue][v]!;
  const scene = (): Child => {
    if (v === 0)
      return (
        <g>
          {Array.from({ length: 6 }, (_, k) => {
            const x = 16 + 14 * k, h = 22 + ((k * 37) % 30);
            return (
              <g key={k}>
                <rect x={x} y={76 - h} width={12} height={h} fill={mix(q.ink, q.sky, 0.5)} />
                {Array.from({ length: Math.floor((h - 4) / 8) }, (_, r) => (
                  <g key={r}>
                    <rect x={x + 3} y={76 - h + 4 + 8 * r} width={2} height={3} fill={q.yellow} />
                    <rect x={x + 7} y={76 - h + 4 + 8 * r} width={2} height={3} fill={q.yellow} />
                  </g>
                ))}
              </g>
            );
          })}
        </g>
      );
    if (v === 1)
      return (
        <g>
          {Array.from({ length: 5 }, (_, k) => {
            const x = 16 + 16 * k;
            return (
              <g key={k}>
                <rect x={x} y={54} width={14} height={22} fill={[q.plate, q.wall, q.grass, q.sky][k % 4]!} />
                <polygon points={`${x},54 ${x + 7},47 ${x + 14},54`} fill={q.soft} />
              </g>
            );
          })}
          {Array.from({ length: 4 }, (_, k) => (
            <ellipse key={k} cx={26 + 24 * k} cy={34 + 6 * k} rx={14} ry={6} fill={q.plate} opacity={0.85} />
          ))}
        </g>
      );
    if (v === 2)
      return (
        <g>
          <polygon points="16,76 16,50 50,36 104,54 104,76" fill={q.green} />
          <rect x={74} y={24} width={7} height={52} fill={q.plate} />
          <polygon points="74,24 77.5,16 81,24" fill={q.grass} />
        </g>
      );
    if (v === 3)
      return (
        <g>
          <circle cx={46} cy={64} r={14} fill={q.yellow} />
          <line x1={80} y1={76} x2={74} y2={30} stroke={q.brown} stroke-width={3} />
          {Array.from({ length: 5 }, (_, k) => {
            const a = -2.6 + 0.55 * k;
            return <path key={k} d={`M74 30Q${(74 + Math.cos(a) * 7).toFixed(1)} ${(30 + Math.sin(a) * 7 - 5).toFixed(1)} ${(74 + Math.cos(a) * 14).toFixed(1)} ${(30 + Math.sin(a) * 14).toFixed(1)}`} fill="none" stroke={q.leaf} stroke-width={3} stroke-linecap="round" />;
          })}
        </g>
      );
    return (
      <g>
        <rect x={16} y={62} width={88} height={14} fill={q.blue} />
        <rect x={36} y={24} width={4} height={42} fill={q.orange} />
        <rect x={80} y={24} width={4} height={42} fill={q.orange} />
        <line x1={16} y1={56} x2={104} y2={56} stroke={q.orange} stroke-width={3} />
        <path d="M38 26Q60 60 82 26" fill="none" stroke={q.orange} stroke-width={1.5} />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 120 142" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: "block" }}>
      <rect x={0} y={0} width={120} height={142} fill={wall} />
      <rect x={0} y={fy} width={120} height={40} fill={q.brown} />
      {Array.from({ length: 5 }, (_, i) => (
        <line key={i} x1={0} y1={fy + 6 + 8 * i} x2={120} y2={fy + 6 + 8 * i} stroke={q.shade} stroke-width={1} />
      ))}
      <rect x={12} y={10} width={96} height={70} rx={3} fill={q.plate} />
      <rect x={16} y={14} width={88} height={62} fill={glass} />
      {scene()}
      <line x1={60} y1={14} x2={60} y2={76} stroke={q.plate} stroke-width={3} />
      <rect x={8} y={88} width={64} height={22} rx={6} fill={q.plate} />
      <rect x={8} y={100} width={64} height={10} rx={4} fill={blanket} />
      <rect x={90} y={86} width={16} height={18} rx={3} fill={q.crust} />
      <circle cx={98} cy={76} r={11} fill={q.green} />
    </svg>
  );
}

function BayMap(p: { size: number; labels: State["labels"]; listings: Listing[]; saved: Set<string>; ok: (l: Listing) => boolean; current: string | null; c: Cols; t: Theme; n: number }): Child {
  const { c } = p;
  const q = pal(p.t);
  const water = mix(c.input, q.sky, 0.7), land = mix(c.input, q.wall, 0.35), green = mix(c.input, q.grass, 0.6);
  const cur = p.listings.find((l) => l.id === p.current);
  return (
    <div style={{ position: "relative", width: p.size, height: p.size, borderRadius: 12, overflow: "hidden", flex: "0 0 auto" }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none" role="img" aria-label={`Map with ${p.n} places for you`} style={{ display: "block" }}>
        <rect x={0} y={0} width={100} height={100} fill={water} />
        <polygon points="-10,-10 36,-10 32,12 20,25 -10,30" fill={green} />
        <polygon points="-10,33 25,31 31,44 36,60 62,90 68,110 -10,110" fill={land} />
        <polygon points="44,-10 110,-10 110,110 80,110 66,78 54,50 50,26" fill={land} />
        <polygon points="80,-10 110,-10 110,60 86,50" fill={green} />
        <rect x={0} y={42} width={14} height={4} fill={green} />
        <line x1={26} y1={38} x2={53} y2={36} stroke={c.secondaryText} stroke-width={1.6} />
        <line x1={42} y1={75} x2={62} y2={70} stroke={c.secondaryText} stroke-width={1.6} />
        <line x1={14} y1={33} x2={15} y2={20} stroke={q.orange} stroke-width={2} />
        {p.listings.map((l) => {
          const x = l.x * 100, y = l.y * 100;
          if (l.id === p.current) return null;
          if (p.saved.has(l.id))
            return (
              <g key={l.id}>
                <circle cx={x} cy={y} r={6} fill={c.card} />
                <Heart x={x} y={y + 0.3} w={9} fill={c.primary} />
              </g>
            );
          if (p.ok(l))
            return (
              <g key={l.id}>
                <circle cx={x} cy={y} r={4.5} fill={c.card} />
                <circle cx={x} cy={y} r={3.2} fill={mix(c.primary, c.secondaryText, 0.35)} />
              </g>
            );
          return <circle key={l.id} cx={x} cy={y} r={2} fill={c.secondaryText} opacity={0.35} />;
        })}
        {cur ? (
          <g key={cur.id}>
            <circle ref={pulse} cx={cur.x * 100} cy={cur.y * 100} r={8} fill={c.primary} opacity={0.3} />
            <circle cx={cur.x * 100} cy={cur.y * 100} r={5} fill={c.primary} stroke={c.card} stroke-width={1.5} />
          </g>
        ) : null}
      </svg>
      {p.labels.map((l) => (
        <span key={l.name} style={{ ...at(l.x, l.y), fontSize: 10, lineHeight: "12px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", pointerEvents: "none" }}>{l.name}</span>
      ))}
    </div>
  );
}

const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const CARD_H = 138;

export default defineApp<State, Action, Local>({
  name: "Sublet finder",
  summary: (s) => {
    const ids = new Map<string, Set<string>>();
    for (const x of s.saves) ids.set(x.id, (ids.get(x.id) ?? new Set()).add(x.by));
    const j = [...ids.values()].filter((v) => v.size >= 2).length;
    return ids.size ? `${s.group}: ${ids.size} places saved${j ? `, ${j} by two or more` : ""}` : `${s.group}: nothing saved yet`;
  },

  init: (ctx) => {
    const listings: Listing[] = [];
    for (const l of Array.isArray(P.listings) ? P.listings : []) {
      const hood = clean(l?.hood, 20);
      if (!hood || listings.length >= MAX_LISTINGS) continue;
      listings.push({
        id: `l${listings.length}`,
        hood,
        city: clean(l.city, 16),
        price: clampInt(l.priceCents, 0, 10_000_000),
        dates: clean(l.dates, 20),
        perk: clean(l.perk, 40),
        via: clean(l.via, 32),
        viaWho: clean(l.viaWho, 16),
        mutuals: clampInt(l.mutuals, 0, 99),
        view: typeof l.view === "number" && Number.isInteger(l.view) && l.view >= 0 && l.view <= 4 ? l.view : 0,
        x: frac(l.x),
        y: frac(l.y),
      });
    }
    const goods = (Array.isArray(P.budgets) ? P.budgets : []).filter((b) => typeof b === "number" && Number.isInteger(b) && b > 0 && b <= 10_000_000).slice(0, 3).sort((a, b) => a - b);
    const budgets = goods.length ? goods : [120000, 160000, 220000];
    const seen: { [user: string]: string[] } = {};
    const saves: Save[] = [];
    const used = new Set<string>();
    const idOf = (hood: string) => listings.find((l) => l.hood.toLowerCase() === clean(hood, 20).toLowerCase())?.id;
    for (const person of Array.isArray(P.people) ? P.people : []) {
      const want = clean(person?.name, 60).toLowerCase();
      if (!want) continue;
      const m = ctx.members.find((x) => !used.has(x.id) && (x.id === person.name || (x.name ?? "").toLowerCase() === want));
      if (!m) continue;
      used.add(m.id);
      const ids: string[] = [];
      for (const h of Array.isArray(person.saved) ? person.saved : []) {
        const id = idOf(h);
        if (id && !ids.includes(id)) {
          ids.push(id);
          saves.push({ id, by: m.id, at: 0 });
        }
      }
      for (const h of Array.isArray(person.passed) ? person.passed : []) {
        const id = idOf(h);
        if (id && !ids.includes(id)) ids.push(id);
      }
      if (ids.length) seen[m.id] = ids;
    }
    const labels = (Array.isArray(P.labels) ? P.labels : [])
      .filter((l) => l && clean(l.name, 16) && typeof l.x === "number" && typeof l.y === "number" && Number.isFinite(l.x) && Number.isFinite(l.y))
      .slice(0, 4)
      .map((l) => ({ name: clean(l.name, 16), x: Math.min(0.95, Math.max(0.05, l.x)), y: Math.min(0.95, Math.max(0.05, l.y)) }))
      .filter((l, i, a) => a.findIndex((m) => m.name === l.name) === i);
    return { group: clean(P.group, 40) || "This group", posts: clampInt(P.posts, 0, 1_000_000), swiped: clampInt(P.swiped, 0, 1_000_000), budgets, listings, seen, saves, labels };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceFinder(state, action as unknown as Record<string, unknown>, meta.user, meta.time) : state),

  onMembers: (state, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    if (Object.keys(state.seen).every(here) && state.saves.every((x) => here(x.by))) return state;
    const seen: { [user: string]: string[] } = {};
    for (const k of Object.keys(state.seen)) if (here(k)) seen[k] = state.seen[k]!;
    return { ...state, seen, saves: state.saves.filter((x) => here(x.by)) };
  },

  invariants: {
    "decisions point at real listings, once each": (s) => Object.values(s.seen).every((ids) => ids.length > 0 && new Set(ids).size === ids.length && ids.every((id) => s.listings.some((l) => l.id === id))),
    "only chat members have decisions or saves": (s, ctx) => Object.keys(s.seen).every((u) => inChat(ctx, u)) && s.saves.every((x) => inChat(ctx, x.by)),
    "a save is a decision": (s) => s.saves.every((x) => (s.seen[x.by] ?? []).includes(x.id)),
    "one save per person per place": (s) => new Set(s.saves.map((x) => `${x.id}|${x.by}`)).size === s.saves.length,
  },

  transitions: {
    "a swipe records one decision by the actor and saves only on save": (p, n, a, m) => {
      if (a.t !== "swipe" || p === n) return true;
      const last = n.saves[n.saves.length - 1];
      return (
        sameJson(n.seen[m.user], [...(p.seen[m.user] ?? []), a.id]) &&
        seenOthersEqual(p, n, m.user) &&
        n.saves.length === p.saves.length + (a.save ? 1 : 0) &&
        sameJson(n.saves.slice(0, p.saves.length), p.saves) &&
        (!a.save || (!!last && last.id === a.id && last.by === m.user && last.at === m.time))
      );
    },
    "unsave removes exactly the actor's save": (p, n, a, m) =>
      a.t !== "unsave" || p === n || (n.saves.length === p.saves.length - 1 && !n.saves.some((x) => x.id === a.id && x.by === m.user) && sameJson(n.seen, p.seen)),
    "reshuffle keeps saves and the actor's saved places": (p, n, a, m) =>
      a.t !== "reshuffle" || p === n || (n.saves === p.saves && sameJson([...(n.seen[m.user] ?? [])].sort(), savedBy(p, m.user).sort()) && seenOthersEqual(p, n, m.user)),
    "listings never change": (p, n) => sameJson([p.listings, p.budgets, p.posts, p.swiped], [n.listings, n.budgets, n.posts, n.swiped]),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (!s.listings.length) return { t: "reshuffle" };
    const k = r.next();
    const unseen = s.listings.filter((l) => !(s.seen[user] ?? []).includes(l.id));
    if (k < 0.7 && unseen.length) return { t: "swipe", id: r.pick(unseen).id, save: r.next() < 0.5 };
    if (k < 0.8) {
      const mine = s.saves.filter((x) => x.by === user);
      return { t: "unsave", id: mine.length ? r.pick(mine).id : r.pick(s.listings).id };
    }
    if (k < 0.9) return { t: "reshuffle" };
    return { t: "swipe", id: r.pick(s.listings).id, save: r.next() < 0.5 };
  },

  local: { budget: 1, fof: false, dragX: 0, dragFrom: -1, gone: null },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = innerWidth();
    const budget = state.budgets[Math.max(0, Math.min(state.budgets.length - 1, local.budget))]!;
    const ok = (l: Listing) => matches(l, budget, local.fof);
    const mySeen = state.seen[me] ?? [];
    const deck = state.listings.filter((l) => ok(l) && !mySeen.includes(l.id));
    const count = state.listings.filter(ok).length;
    const front = deck[0];
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const saved = new Set(state.saves.map((x) => x.id));
    const mySaves = state.saves.filter((x) => x.by === me).map((x) => x.id);
    const canReshuffle = mySeen.some((id) => !mySaves.includes(id));

    const mapW = Math.min(120, Math.round(0.34 * W));
    const x0 = mapW + 12;
    const R = W - x0;
    const pillW = (R - 8) / 3;

    const dx = local.dragX;
    const dragging = local.dragFrom >= 0;
    const gone = local.gone ? running(local.gone.at, FLY_MS) : null;

    const decide = (save: boolean) => {
      if (!front) return;
      setLocal({ gone: { id: front.id, dir: save ? 1 : -1, at: clock.value }, dragX: 0, dragFrom: -1 });
      dispatch({ t: "swipe", id: front.id, save });
      if (save) haptic("light");
    };

    // ---- cards ----
    const person = (l: Listing) => members.find((m) => m.name?.toLowerCase() === l.viaWho.toLowerCase()) ?? { id: "v:" + l.viaWho, name: l.viaWho };
    const face = (l: Listing, extra: Record<string, string | number> = {}, handlers = {}) => (
      <div
        style={{ position: "absolute", left: 0, right: 0, top: 8, height: CARD_H, borderRadius: 12, background: c.input, overflow: "hidden", display: "flex", ...extra }}
        {...handlers}
      >
        <div style={{ width: 120, height: CARD_H, flex: "0 0 auto", overflow: "hidden", borderRadius: "12px 0 0 12px" }}>
          <Room view={l.view} c={c} t={theme} />
        </div>
        <div style={{ position: "relative", flex: 1, minWidth: 0, padding: "8px 10px 0 12px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, height: 32, minWidth: 0 }}>
            <span style={{ fontSize: 27, lineHeight: "32px", fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>{money(l.price)}</span>
            <span style={{ fontSize: 13, color: c.secondaryText }}>/mo</span>
          </div>
          <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.link, ...ellipsis }}>{l.city ? `${l.hood} · ${l.city}` : l.hood}</div>
          <div style={{ fontSize: 12, lineHeight: "16px", color: c.text, ...ellipsis }}>{l.dates}</div>
          <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, ...ellipsis }}>{l.perk}</div>
          {l.viaWho ? (
            <div style={{ position: "absolute", left: 8, right: 10, bottom: 8, height: 28, borderRadius: 14, background: mix(c.card, c.primary, 0.12), display: "flex", alignItems: "center", gap: 6, padding: "0 5px" }}>
              <Avatar user={person(l)} size={19} />
              <span style={{ minWidth: 0, fontSize: 13, color: c.link, ...ellipsis }}>{`${l.via} · ${l.mutuals} mutual`}</span>
            </div>
          ) : (
            <div style={{ position: "absolute", left: 8, right: 10, bottom: 8, height: 28, borderRadius: 14, background: c.secondaryButton, display: "flex", alignItems: "center", padding: "0 12px" }}>
              <span style={{ fontSize: 13, color: c.secondaryButtonText, ...ellipsis }}>Posted in this group</span>
            </div>
          )}
        </div>
      </div>
    );

    const lift = Math.min(1, Math.abs(dx) / 160);
    const back = (depth: number) => {
      const k = depth === 1 ? lift : 0;
      const up = 6 * depth * (1 - k);
      const narrow = 0.04 * depth * (1 - k);
      return <div key={depth} style={{ position: "absolute", left: 0, right: 0, top: 8 - up, height: CARD_H, borderRadius: 12, background: c.input, transform: `scaleX(${1 - narrow})`, opacity: 1, boxShadow: `0 0 0 1px ${c.card}` }} />;
    };

    const ghost = gone !== null && local.gone ? state.listings.find((l) => l.id === local.gone!.id) : undefined;
    const lean = Math.abs(dx) > 5;

    const stack = (
      <div style={{ position: "relative", height: 146 }}>
        {deck.length >= 3 ? back(2) : null}
        {deck.length >= 2 ? back(1) : null}
        {front ? (
          <>
            {face(
              front,
              { transform: `translate(${dx}px, ${Math.abs(dx) * 0.04}px) rotate(${dx * 0.03}deg)`, transition: dragging ? "none" : "transform 200ms", touchAction: "pan-y", cursor: "grab" },
              {
                onPointerDown: (e: PointerEvent & { currentTarget: HTMLElement }) => {
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  setLocal({ dragFrom: e.clientX, dragX: 0 });
                },
                onPointerMove: (e: PointerEvent) => {
                  if (local.dragFrom >= 0) setLocal({ dragX: e.clientX - local.dragFrom });
                },
                onPointerUp: () => {
                  if (local.dragFrom < 0) return;
                  if (Math.abs(local.dragX) > 80) decide(local.dragX > 0);
                  else setLocal({ dragX: 0, dragFrom: -1 });
                },
              },
            )}
            {lean ? (
              <span
                style={{
                  position: "absolute",
                  top: 26,
                  ...(dx > 0 ? { left: 48, background: c.primary, color: c.onPrimary } : { right: 10, background: c.toast, color: c.onToast }),
                  padding: "4px 12px",
                  borderRadius: 999,
                  fontSize: 15,
                  lineHeight: "20px",
                  fontWeight: 600,
                  opacity: Math.min(1, Math.abs(dx) / 100),
                  pointerEvents: "none",
                }}
              >
                {dx > 0 ? "Save" : "Pass"}
              </span>
            ) : null}
          </>
        ) : (
          <div style={{ position: "absolute", left: 0, right: 0, top: 8, height: CARD_H, borderRadius: 12, background: c.input, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: "0 12px", textAlign: "center" }}>
            <div style={{ fontSize: 20, lineHeight: "26px", fontWeight: 700, color: c.text }}>You've seen every match</div>
            <div style={{ fontSize: 13, color: c.secondaryText }}>{mySaves.length ? "Your shortlist is below." : "Nothing saved yet. Try a higher budget."}</div>
            {canReshuffle ? <Button kind="secondary" onClick={() => dispatch({ t: "reshuffle" })}>Reshuffle</Button> : null}
          </div>
        )}
        {ghost && gone !== null ? (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", transform: `translateX(${local.gone!.dir * 460 * fly(gone)}px)` }} aria-hidden="true">
            {face(ghost)}
          </div>
        ) : null}
      </div>
    );

    // ---- buttons ----
    const circle = (kind: "pass" | "save") => {
      const lean2 = kind === "save" ? dx > 20 : dx < -20;
      const s = 46 + (lean2 ? 3 : 0);
      return (
        <button
          aria-label={kind === "save" ? "Save" : "Pass"}
          onClick={() => decide(kind === "save")}
          style={{ width: s, height: s, borderRadius: s / 2, border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", background: kind === "save" ? c.primary : c.secondaryButton, cursor: "pointer", flex: "0 0 auto" }}
        >
          {kind === "save" ? (
            <svg viewBox="-1.3 -1.05 2.6 2.1" width={20} height={17} aria-hidden="true"><path d={HEART} fill={c.onPrimary} /></svg>
          ) : (
            <svg viewBox="0 0 20 20" width={20} height={20} aria-hidden="true">
              <line x1={3} y1={3} x2={17} y2={17} stroke={c.negative} stroke-width={3.5} stroke-linecap="round" />
              <line x1={17} y1={3} x2={3} y2={17} stroke={c.negative} stroke-width={3.5} stroke-linecap="round" />
            </svg>
          )}
        </button>
      );
    };
    const row = (
      <div style={{ position: "relative", height: 44, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {front ? (
          <>
            <span style={{ fontSize: 16, fontWeight: 700, color: c.text, minWidth: 0 }}>{`${deck.length} left`}</span>
            <span style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: "flex", alignItems: "center", gap: 46 }}>
              {circle("pass")}
              {circle("save")}
            </span>
            {theme.width >= 360 ? <span style={{ fontSize: 13, color: c.secondaryText }}>Drag or tap</span> : <span />}
          </>
        ) : null}
      </div>
    );

    // ---- filters ----
    const fofIds = members.filter((m) => state.listings.some((l) => l.viaWho && l.viaWho.toLowerCase() === (m.name ?? "").toLowerCase())).map((m) => m.id);
    const pill = (cents: number, k: number) => {
      const withSign = `≤ ${kfmt(cents)}`;
      const label = textWidth(withSign, 13, 600) * (11 / 13) > pillW - 8 ? kfmt(cents) : withSign;
      const f = fitText(label, pillW - 8, { size: 13, min: 11, weight: 600 });
      const on = local.budget === k;
      return (
        <button key={k} onClick={() => setLocal({ budget: k })} aria-pressed={on} aria-label={`Up to ${kfmt(cents)} a month`} style={{ flex: 1, minWidth: 0, height: 44, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 28, borderRadius: 999, fontSize: f.size, fontWeight: 600, whiteSpace: "nowrap", background: on ? c.primary : c.secondaryButton, color: on ? c.onPrimary : c.secondaryButtonText }}>{f.text}</span>
        </button>
      );
    };
    const top = (
      <div style={{ display: "flex", gap: 12, height: 120 }}>
        <BayMap size={mapW} labels={state.labels ?? []} listings={state.listings} saved={saved} ok={ok} current={front?.id ?? null} c={c} t={theme} n={count} />
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, height: 36, minWidth: 0 }}>
            <span key={count} ref={popEl} style={{ display: "block", fontSize: 36, lineHeight: "36px", fontWeight: 700, color: c.text }}>{count}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, lineHeight: "18px", fontWeight: 600, color: c.text }}>for you</div>
              <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ellipsis }}>{`of ${fmt(state.posts)} posts`}</div>
            </div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: 32, display: "flex", gap: 4 }}>{state.budgets.map(pill)}</div>
          <button
            aria-pressed={local.fof}
            aria-label="Friends of friends only"
            onClick={() => setLocal({ fof: !local.fof })}
            style={{ position: "absolute", left: 0, right: 0, top: 76, height: 44, padding: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6, height: 28, borderRadius: 999, padding: "0 6px 0 6px", background: mix(c.input, c.selected, local.fof ? 1 : 0), minWidth: 0 }}>
              <svg viewBox="0 0 28 16" width={28} height={16} aria-hidden="true" style={{ flex: "0 0 auto" }}>
                <rect x={0} y={0} width={28} height={16} rx={8} fill={local.fof ? c.primary : c.disabledText} />
                <circle cx={local.fof ? 20 : 8} cy={8} r={6} fill={c.card} />
              </svg>
              {fofIds.length ? <Facepile users={fofIds} max={3} size={14} /> : null}
              <span style={{ fontSize: 13, color: c.text, minWidth: 0, ...ellipsis }}>Friends of friends only</span>
            </span>
          </button>
        </div>
      </div>
    );

    // ---- tray ----
    const placeIds = [...new Set(state.saves.map((x) => x.id))];
    const deciders = members.filter((m) => (state.seen[m.id]?.length ?? 0) > 0).map((m) => m.id);
    const tray = !placeIds.length ? (
      <div style={{ height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 4px", minWidth: 0 }}>
        {deciders.length ? <Facepile users={deciders} max={4} size={22} /> : null}
        <span style={{ fontSize: 12, color: c.secondaryText, minWidth: 0, ...ellipsis }}>{`${fmt(state.swiped + deciders.length)} members swiped today · save one`}</span>
      </div>
    ) : (
      (() => {
        const avail = W - 14 - 34;
        let used = 0;
        const shown: string[] = [];
        for (const id of placeIds) {
          const l = state.listings.find((x) => x.id === id)!;
          const who = state.saves.filter((x) => x.id === id).length;
          const w = 8 + 9 + 5 + textWidth(l.hood, 12) + 5 + Math.min(2, who) * 10 + 6 + 8 + 5;
          if (used + w > avail && shown.length < placeIds.length) break;
          used += w;
          shown.push(id);
        }
        const more = placeIds.length - shown.length;
        return (
          <div style={{ height: 36, borderRadius: 20, background: c.selected, display: "flex", alignItems: "center", gap: 5, padding: "0 7px", overflow: "hidden" }}>
            {shown.map((id) => {
              const l = state.listings.find((x) => x.id === id)!;
              const savers = [...new Set(state.saves.filter((x) => x.id === id).map((x) => x.by))].filter((u) => members.some((m) => m.id === u));
              const mineHere = savers.includes(me);
              const inner = (
                <span style={{ display: "flex", alignItems: "center", gap: 5, height: 26, borderRadius: 13, padding: "0 8px", background: savers.length >= 2 ? mix(c.card, c.positive, 0.2) : c.card, whiteSpace: "nowrap" }}>
                  <svg viewBox="-1.3 -1.05 2.6 2.1" width={9} height={8} aria-hidden="true"><path d={HEART} fill={c.primary} /></svg>
                  <span style={{ fontSize: 12, color: c.text }}>{l.hood}</span>
                  {savers.length ? <Facepile users={savers} max={2} size={14} /> : null}
                </span>
              );
              return mineHere ? (
                <button key={id} aria-label={`Remove ${l.hood}`} onClick={() => dispatch({ t: "unsave", id })} style={{ height: 44, margin: "-4px 0", padding: 0, border: "none", background: "transparent", cursor: "pointer", flex: "0 0 auto" }}>
                  {inner}
                </button>
              ) : (
                <span key={id} style={{ flex: "0 0 auto" }}>{inner}</span>
              );
            })}
            {more > 0 ? <span style={{ fontSize: 14, fontWeight: 700, color: c.link, whiteSpace: "nowrap" }}>{`+${more}`}</span> : null}
          </div>
        );
      })()
    );

    // A save that made a place saved by two people, still fresh in the confirmed state.
    const fresh = [...confirmed.saves].reverse().find((x) => x.at && running(x.at, TOAST_MS) !== null && confirmed.saves.some((o) => o.id === x.id && o.by !== x.by));
    const freshPlace = fresh ? confirmed.listings.find((l) => l.id === fresh.id) : undefined;

    return (
      <div>
        <div style={{ height: 40 }}>
          <CardHeader title="Sublet finder" subtitle={`${state.group} · ${fmt(state.posts)} posts`} />
        </div>
        {top}
        <div style={{ height: 4 }} />
        {stack}
        <div style={{ height: 2 }} />
        {row}
        <div style={{ height: 4 }} />
        {tray}
        {fresh && freshPlace ? <Toast key={fresh.at}>{`${nameOf(fresh.by)} saved ${freshPlace.hood} too`}</Toast> : null}
      </div>
    );
  },
});
