import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  clock,
  haptic,
  mix,
  pal,
  rng,
  running,
  seedOf,
  spring,
  springs,
  textWidth,
  tween,
  userColor,
  type Child,
} from "@muse/app";

// Pizza run: one group pizza cut into a slice-group per person with their toppings, a price each
// (even share of the pie, their toppings, an optional wings add-on, then tip), and one order.

type Params = {
  place: string;
  messages: number;
  crew: { name: string; quote: string; toppings: string[]; whatever: boolean }[];
  baseCents: number;
  toppingCents: number;
  tipPercent: number;
  wings: { label: string; cents: number; note: string };
};

// @params
const P: Params = {
  place: "Tony's on 9th",
  messages: 23,
  baseCents: 2200,
  toppingCents: 125,
  tipPercent: 20,
  wings: { label: "10 wings", cents: 1300, note: "Marcus asked twice" },
  crew: [
    { name: "Marcus", quote: "pepperoni or i riot", toppings: ["pepperoni"], whatever: false },
    { name: "Dani", quote: "mush + olive. no pepp", toppings: ["mushroom", "olive"], whatever: false },
    { name: "Theo", quote: "whatever", toppings: [], whatever: true },
    { name: "Jess", quote: "pineapple. don't @ me", toppings: ["pineapple"], whatever: false },
  ],
};
// @end params

const TOPS = ["pepperoni", "mushroom", "olive", "pineapple", "peppers"] as const;
const SHORT = ["Pepp", "Shroom", "Olive", "Pineapple", "Pepper"];

/** tops: bitmask over TOPS. member: id is a chat member id (else it is the name, a stand-in). */
type Person = { id: string; name: string; member: boolean; quote: string; whatever: boolean; tops: number; at: number[] };
/** at[k]: meta.time topping k was last added on this slice (0 = from the chat). */
type Wings = { label: string; cents: number; note: string; on: boolean; at: number };
type State = { place: string; messages: number; people: Person[]; base: number; topping: number; tip: number; wings: Wings; orderedAt: number; orderedBy: string | null; door: string | null };
type Action = { t: "top"; who: string; k: number } | { t: "wings" } | { t: "join" } | { t: "leave" } | { t: "order" };
type Local = { sel: string | null };
type Ctx = { members: { id: string; name?: string }[] };

const MAX_PEOPLE = 8;
const LID_MS = 800;
const PIECE_MS = 900;
const DELIVERY_MS = 2_100_000;
const lid = tween({ duration: LID_MS, easing: "easeInOut" });
const bounce = spring(springs.iosBouncy);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);

// ---- Costs (integer cents) ----

const popcount = (n: number) => [0, 1, 2, 3, 4].filter((k) => n & (1 << k)).length;
const share = (total: number, i: number, n: number) => Math.floor(total / n) + (i < total % n ? 1 : 0);
const subs = (s: State) => s.people.map((p, i) => share(s.base, i, s.people.length) + popcount(p.tops) * s.topping + (s.wings.on ? share(s.wings.cents, i, s.people.length) : 0));
const tipOf = (sub: number, s: State) => Math.floor((sub * s.tip) / 100);
const costs = (s: State) => subs(s).map((x) => x + tipOf(x, s));
const total = (s: State) => costs(s).reduce((a, x) => a + x, 0);
const money = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const whole = (c: number) => (c % 100 === 0 ? `$${c / 100}` : money(c));
const cleanName = (t: string) => t.trim().slice(0, 20);
const topList = (p: Person) => TOPS.filter((_, k) => p.tops & (1 << k));
const mineOf = (s: State, u: string) => s.people.find((p) => p.id === u);
const editable = (p: Person, me: string) => p.id === me || !p.member;
const noSlice = (id: string): Pick<Person, "quote" | "whatever" | "tops" | "at"> & { id: string } => ({ id, quote: "", whatever: false, tops: 0, at: [0, 0, 0, 0, 0] });

function reducePizza(s: State, a: Record<string, unknown>, meta: { time: number; user: string; seed: number }, ctx: Ctx): State {
  const me = ctx.members.find((m) => m.id === meta.user);
  if (!me || s.orderedAt > 0) return s;
  const N = s.people.length;
  if (a.t === "top") {
    const k = a.k;
    if (typeof k !== "number" || !Number.isInteger(k) || k < 0 || k > 4 || typeof a.who !== "string") return s;
    const person = s.people.find((p) => p.id === a.who);
    if (!person || !(person.id === meta.user || !person.member)) return s;
    const on = !(person.tops & (1 << k));
    return {
      ...s,
      people: s.people.map((p) =>
        p.id !== person.id ? p : { ...p, tops: p.tops ^ (1 << k), whatever: on ? false : p.whatever, at: p.at.map((t, j) => (j === k && on ? meta.time : t)) },
      ),
    };
  }
  if (a.t === "wings") {
    if (s.wings.cents === 0) return s;
    const on = !s.wings.on;
    return { ...s, wings: { ...s.wings, on, at: on ? meta.time : s.wings.at } };
  }
  if (a.t === "join") {
    if (mineOf(s, meta.user) || N >= MAX_PEOPLE) return s;
    return { ...s, people: [...s.people, { ...noSlice(meta.user), name: cleanName(me.name ?? meta.user), member: true }] };
  }
  if (a.t === "leave") {
    if (!mineOf(s, meta.user) || N <= 1) return s;
    return { ...s, people: s.people.filter((p) => p.id !== meta.user) };
  }
  if (a.t === "order") {
    if (N === 0) return s;
    const pool = s.people.filter((p) => p.member).map((p) => p.id);
    const ids = pool.length ? pool : s.people.map((p) => p.id);
    return { ...s, orderedAt: meta.time, orderedBy: meta.user, door: rng(meta.seed).pick(ids) };
  }
  return s;
}

// ---- Drawing ----

type Pal = ReturnType<typeof pal>;
const n1 = (x: number) => Math.round(x * 10) / 10;
const pt = (cx: number, cy: number, r: number, a: number) => `${n1(cx + r * Math.cos(a))} ${n1(cy + r * Math.sin(a))}`;
const FULL = Math.PI * 2 - 1e-6;
const sectorPath = (cx: number, cy: number, r: number, a0: number, a1: number) =>
  a1 - a0 >= FULL
    ? `M${n1(cx - r)} ${n1(cy)} A${r} ${r} 0 1 1 ${n1(cx + r)} ${n1(cy)} A${r} ${r} 0 1 1 ${n1(cx - r)} ${n1(cy)} Z`
    : `M${n1(cx)} ${n1(cy)} L${pt(cx, cy, r, a0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(cx, cy, r, a1)} Z`;
const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number) => `M${pt(cx, cy, r, a0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(cx, cy, r, a1)}`;

/** One topping piece, centered on (0, 0), about 15 px across. */
function toppingArt(k: number, c: Pal): Child {
  if (k === 0)
    return (
      <g>
        <circle r="7.5" fill={c.red} stroke={c.dark} stroke-width="1" />
        <circle cx="-2.5" cy="-2" r="1" fill={c.dark} opacity="0.5" />
        <circle cx="2.5" cy="-1" r="1" fill={c.dark} opacity="0.5" />
        <circle cx="0" cy="3" r="1" fill={c.dark} opacity="0.5" />
      </g>
    );
  if (k === 1)
    return (
      <g>
        <rect x="-2.2" y="0" width="4.4" height="5" rx="1" fill={c.cream} />
        <path d="M-6 1 A6 5 0 0 1 6 1 Z" fill={mix(c.brown, c.cream, 0.5)} stroke={c.brown} stroke-width="0.8" />
      </g>
    );
  if (k === 2) return <circle r="4.2" fill="none" stroke={c.dark} stroke-width="2.6" />;
  if (k === 3) return <path d="M-4.5 -3.2 L4.5 -3.2 L3 3.2 L-3 3.2 Z" fill={c.yellow} stroke={c.crust} stroke-width="1" stroke-linejoin="round" />;
  return <path d="M-5.6 2.5 A6 6 0 0 1 5.6 2.5" fill="none" stroke={c.green} stroke-width="2.4" stroke-linecap="round" />;
}

const drumstick = (c: Pal, key: string, x: number, y: number) => (
  <g key={key} transform={`translate(${x} ${y}) rotate(-30)`}>
    <line x1="4" y1="0" x2="11" y2="0" stroke={c.cream} stroke-width="2.4" stroke-linecap="round" />
    <ellipse rx="7" ry="5" fill={c.orange} stroke={c.brown} stroke-width="1" />
  </g>
);

const clipLine = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (s: string) => s.split(" ")[0] ?? s;

export default defineApp<State, Action, Local>({
  name: "Pizza run",
  summary: (s) => {
    if (!s.people.length) return "Pizza run: nobody yet";
    if (s.orderedAt > 0) return `${s.place}: ordered, ${money(total(s))} · ${s.people.find((p) => p.id === s.door)?.name ?? "someone"} on door duty`;
    return `${s.place}: ${s.people.length} people, ${money(total(s))} with tip`;
  },

  init: (ctx) => {
    const used = new Set<string>();
    const people: Person[] = [];
    for (const c of P.crew.slice(0, MAX_PEOPLE)) {
      const name = cleanName(c.name);
      if (!name) continue;
      const m = ctx.members.find((x) => !used.has(x.id) && (x.id === name || (x.name ?? "").toLowerCase() === name.toLowerCase()));
      const id = m ? m.id : name;
      if (people.some((p) => p.id === id)) continue;
      if (m) used.add(m.id);
      const whatever = c.whatever === true;
      const tops = whatever ? 0 : TOPS.reduce((acc, t, k) => (c.toppings.includes(t) ? acc | (1 << k) : acc), 0);
      people.push({ id, name: m ? cleanName(m.name ?? name) : name, member: !!m, quote: c.quote.replace(/!/g, "").trim().slice(0, 40), whatever, tops, at: [0, 0, 0, 0, 0] });
    }
    if (!people.length) for (const m of ctx.members.slice(0, MAX_PEOPLE)) people.push({ ...noSlice(m.id), name: cleanName(m.name ?? m.id), member: true });
    const cents = Number.isInteger(P.wings?.cents) && P.wings.cents >= 0 && P.wings.cents <= 5000 ? P.wings.cents : 0;
    return {
      place: P.place.trim().slice(0, 30) || "Pizza",
      messages: Number.isInteger(P.messages) && P.messages > 0 ? P.messages : 0,
      people,
      base: Number.isInteger(P.baseCents) && P.baseCents >= 500 && P.baseCents <= 10000 ? P.baseCents : 2200,
      topping: Number.isInteger(P.toppingCents) && P.toppingCents >= 0 && P.toppingCents <= 1000 ? P.toppingCents : 125,
      tip: Number.isInteger(P.tipPercent) && P.tipPercent >= 0 && P.tipPercent <= 30 ? P.tipPercent : 20,
      wings: { label: (P.wings?.label ?? "").trim().slice(0, 28) || "Wings", cents, note: (P.wings?.note ?? "").trim().slice(0, 40), on: false, at: 0 },
      orderedAt: 0,
      orderedBy: null,
      door: null,
    };
  },

  reduce: (state, action, meta, ctx) => reducePizza(state, action as unknown as Record<string, unknown>, meta, ctx),

  onMembers: (state, ctx) => {
    if (state.orderedAt > 0 || state.people.every((p) => !p.member || inChat(ctx, p.id))) return state;
    const keep = state.people.filter((p) => !p.member || inChat(ctx, p.id));
    if (keep.length) return { ...state, people: keep };
    const p = state.people[0]!;
    return { ...state, people: [{ ...p, id: p.name, member: false }] };
  },

  invariants: {
    "costs add up": (s) => {
      const sb = subs(s);
      return s.people.length === 0 || (total(s) === sb.reduce((a, x) => a + x, 0) + sb.reduce((a, x) => a + tipOf(x, s), 0) && costs(s).every((c, i) => c >= sb[i]!));
    },
    "shared costs split to the cent": (s) => {
      const n = s.people.length;
      if (!n) return true;
      const ok = (t: number) => {
        const v = s.people.map((_, i) => share(t, i, n));
        return v.reduce((a, x) => a + x, 0) === t && Math.max(...v) - Math.min(...v) <= 1;
      };
      return ok(s.base) && (!s.wings.on || ok(s.wings.cents));
    },
    "toppings are known": (s) => s.people.every((p) => Number.isInteger(p.tops) && p.tops >= 0 && p.tops <= 31 && (!p.whatever || p.tops === 0)),
    "one slice per person, at most 8": (s, ctx) => new Set(s.people.map((p) => p.id)).size === s.people.length && s.people.length <= MAX_PEOPLE && (s.people.length > 0 || ctx.members.length === 0),
    "ordered exactly when stamped": (s) => (s.orderedAt === 0) === (s.orderedBy === null) && (s.orderedAt === 0) === (s.door === null),
    "the door person is on the order": (s) => s.door === null || s.people.some((p) => p.id === s.door),
    "members on the pie are in the chat": (s, ctx) => s.orderedAt > 0 || s.people.every((p) => !p.member || inChat(ctx, p.id)),
  },

  transitions: {
    "a topping tap flips one bit on one slice": (p, n, a) => {
      if (a.t !== "top" || p === n) return true;
      const changed = p.people.filter((x, i) => JSON.stringify(x) !== JSON.stringify(n.people[i]));
      return changed.length === 1 && changed[0]!.id === a.who && (changed[0]!.tops ^ n.people.find((x) => x.id === a.who)!.tops) === 1 << a.k;
    },
    "only your own slice or a stand-in's": (p, n, a, m) => a.t !== "top" || p === n || a.who === m.user || !p.people.find((x) => x.id === a.who)!.member,
    "an order is final": (p, n) => p.orderedAt === 0 || JSON.stringify(p) === JSON.stringify(n),
    "ordering stamps the time and the sender": (_p, n, a, m) => a.t !== "order" || _p === n || (n.orderedAt === m.time && n.orderedBy === m.user),
    "wings only toggle": (p, n, a) => a.t !== "wings" || p === n || n.wings.on !== p.wings.on,
    "prices never change": (p, n) => p.base === n.base && p.topping === n.topping && p.tip === n.tip && p.wings.cents === n.wings.cents,
  },

  arbitrary: (s, user, r) => {
    if (s.orderedAt > 0) return { t: "wings" };
    const k = r.next();
    if (k < 0.6) {
      const stand = s.people.filter((p) => !p.member);
      const who = mineOf(s, user) ? user : stand.length ? r.pick(stand).id : s.people.length ? r.pick(s.people).id : user;
      return { t: "top", who, k: r.int(5) };
    }
    if (k < 0.72) return { t: "wings" };
    if (k < 0.82) return { t: "join" };
    if (k < 0.88) return { t: "leave" };
    return { t: "order" };
  },

  local: { sel: null },

  view: ({ state, confirmed, pending, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const q = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const N = state.people.length;
    const r = Math.min(90, (W - 160) / 2 - 8);
    const pw = 2 * r + 28;
    const cx = r + 14, cy = 98;
    const ordered = state.orderedAt > 0;
    const sel = local.sel && state.people.find((p) => p.id === local.sel) ? local.sel : null;
    const cost = costs(state);
    const mine = mineOf(state, me);
    const grand = total(state);
    const pieces = r < 75 || N >= MAX_PEOPLE ? 3 : 5;
    const doorName = confirmed.door ? (confirmed.people.find((p) => p.id === confirmed.door)?.name ?? null) : null;

    const act = (a: Action) => {
      if (a.t === "order") haptic("success");
      dispatch(a);
    };
    const toggleSel = (id: string) => setLocal({ sel: sel === id ? null : id });
    const topsText = (p: Person) => (topList(p).length ? topList(p).join(" + ") : "plain cheese");

    // ---- Pie ----
    const slices: Child[] = [];
    const span = N ? (Math.PI * 2) / N : Math.PI * 2;
    (N ? state.people : [null]).forEach((p, i) => {
      const a0 = -Math.PI / 2 + i * span;
      const a1 = a0 + span;
      const mid = (a0 + a1) / 2;
      const isSel = !!p && p.id === sel;
      const ox = isSel ? Math.cos(mid) * 14 : 0;
      const oy = isSel ? Math.sin(mid) * 14 : 0;
      const id = p?.id ?? "empty";
      const full = N <= 1;
      const g0 = full ? a0 : a0 + 0.04, g1 = full ? a1 : a1 - 0.04;
      const ring = p ? (
        full ? (
          <circle cx={cx} cy={cy} r={r + 3.5} fill="none" stroke={userColor(p.id, theme)} stroke-width="4" />
        ) : (
          <path d={arcPath(cx, cy, r + 3.5, g0, g1)} fill="none" stroke={userColor(p.id, theme)} stroke-width="4" />
        )
      ) : (
        <circle cx={cx} cy={cy} r={r + 3.5} fill="none" stroke={c.divider} stroke-width="2" stroke-dasharray="6 5" />
      );
      const g = rng(seedOf(id));
      const blisters = Array.from({ length: 5 }, (_, j) => {
        const a = a0 + 0.2 + g.next() * (span - 0.4);
        const rr = 14 + g.next() * (r - 34);
        return <circle key={`b${j}`} cx={n1(cx + Math.cos(a) * rr)} cy={n1(cy + Math.sin(a) * rr)} r={n1(3 + g.next() * 3)} fill={q.yellow} opacity="0.55" />;
      });
      const cuts = (full ? [a0] : [a0, mid, a1]).map((a, j) => <line key={`k${j}`} x1={cx} y1={cy} x2={n1(cx + Math.cos(a) * (r - 4))} y2={n1(cy + Math.sin(a) * (r - 4))} stroke={q.brown} stroke-width="1.5" opacity="0.55" />);
      const tops: Child[] = [];
      if (p) {
        TOPS.forEach((_, k) => {
          if (!(p.tops & (1 << k))) return;
          const tg = rng(seedOf(p.id + k));
          const rel = running(p.at[k]!, PIECE_MS);
          for (let j = 0; j < 5; j++) {
            const x = tg.next(), y = tg.next(), rot = tg.next() * 360;
            if (j >= pieces) continue;
            const ang = a0 + 0.18 + x * (span - 0.36);
            const rad = 22 + y * (r - 42);
            const t = rel === null ? 1 : bounce(Math.max(0, rel - j * 60));
            const dy = rel === null ? 0 : -30 * (1 - Math.min(1.2, t));
            tops.push(
              <g key={`t${k}-${j}`} opacity={rel !== null && rel < j * 60 ? 0 : 1} transform={`translate(${n1(cx + Math.cos(ang) * rad)} ${n1(cy + Math.sin(ang) * rad + dy)}) rotate(${Math.round(rot)})`}>
                {toppingArt(k, q)}
              </g>,
            );
          }
        });
      }
      const label = p ? `${p.id === me ? "Your" : `${p.name}'s`} slice: ${topsText(p)}` : "Empty pie";
      const can = !!p && !ordered && editable(p, me);
      slices.push(
        <g key={id} style={{ transform: `translate(${n1(ox)}px, ${n1(oy)}px)`, transition: "transform .25s" }}>
          <g pointer-events="none">
            {ring}
            <path d={sectorPath(cx, cy, r, a0, a1)} fill={q.crust} />
            <path d={sectorPath(cx, cy, r - 8, a0, a1)} fill={q.red} />
            <path d={sectorPath(cx, cy, r - 12, a0, a1)} fill={mix(q.yellow, q.cream, 0.6)} />
            {blisters}
            {cuts}
            {tops}
          </g>
          {p ? (
            <path
              d={sectorPath(cx, cy, r + 7, a0, a1)}
              fill="none"
              pointer-events="all"
              aria-label={label}
              {...(can
                ? {
                    role: "radio",
                    "aria-checked": isSel,
                    tabindex: "0",
                    style: { cursor: "pointer" },
                    onClick: () => toggleSel(p.id),
                    onKeyDown: (e: { key: string; preventDefault(): void }) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSel(p.id);
                      }
                    },
                  }
                : { role: "img" })}
            />
          ) : null}
        </g>,
      );
    });

    const lidK = (() => {
      if (!ordered) return 0;
      const e = running(state.orderedAt, LID_MS);
      return e === null ? 1 : lid(e / LID_MS);
    })();
    const boxSize = 2 * r + 22;
    const closed = ordered && running(state.orderedAt, LID_MS) === null;
    const pie = (
      <svg viewBox={`0 0 ${pw} 194`} width={pw} height={194} style={{ flex: "none", display: "block", overflow: "visible" }} role="group" aria-label={`Pizza for ${N} people, ${money(grand)} with tip`}>
        {slices}
        {state.wings.on && !ordered ? (
          <g>
            <rect x={pw - 48} y={2 * r - 6} width="48" height="26" rx="6" fill={c.card} stroke={q.red} stroke-width="1.5" />
            {drumstick(q, "w1", pw - 36, 2 * r + 7)}
            {drumstick(q, "w2", pw - 24, 2 * r + 7)}
            {drumstick(q, "w3", pw - 12, 2 * r + 7)}
          </g>
        ) : null}
        {ordered ? (
          <g pointer-events="none">
            <rect x={cx - boxSize / 2} y={cy - boxSize / 2} width={boxSize} height={n1(boxSize * lidK)} rx="6" fill={mix(q.crust, c.card, 0.6)} stroke={q.brown} stroke-width="1" />
            {closed ? (
              <g>
                <circle cx={cx} cy={cy} r="52" fill="none" stroke={q.red} stroke-width="3" />
                <text x={cx} y={cy + 6} text-anchor="middle" font-size="22" font-weight="700" fill={q.red}>
                  {first(state.place).replace(/[^\w']/g, "") || "Pizza"}
                </text>
                <text x={cx} y={cy + 24} text-anchor="middle" font-size="12" fill={q.brown}>
                  hot · fresh
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>
    );

    // ---- Roster ----
    const rosterW = W - pw;
    const shown = N > 4 ? state.people.slice(0, 3) : state.people;
    const roster = (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {shown.map((p) => {
          const i = state.people.indexOf(p);
          const list = topsText(p);
          const fits = textWidth(list, 13) <= rosterW - 40;
          const body = (
            <>
              <span style={{ flex: "none", marginTop: 4 }}>
                <Avatar user={{ id: p.id, name: p.name }} size={24} />
              </span>
              <span style={{ flex: 1, minWidth: 0, display: "block", textAlign: "left" }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 4, lineHeight: "18px" }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: c.text, ...clipLine }}>{p.id === me ? "You" : p.name}</span>
                  <span style={{ fontSize: 13, color: c.text, flex: "none" }}>{money(cost[i]!)}</span>
                </span>
                {p.quote ? (
                  <span style={{ display: "flex", gap: 4, fontSize: 12, lineHeight: "14px", color: c.secondaryText }}>
                    <span style={{ minWidth: 0, ...clipLine, ...(p.whatever ? { textDecoration: "line-through", textDecorationColor: c.negative } : {}) }}>{`"${p.quote}"`}</span>
                    {p.whatever ? <span style={{ flex: "none", color: c.link }}>→ plain</span> : null}
                  </span>
                ) : null}
                <span style={{ display: "block", fontSize: 13, lineHeight: "16px", color: c.text, ...clipLine }}>{fits ? list : `${topList(p).length} toppings`}</span>
              </span>
            </>
          );
          const style = { display: "flex", gap: 10, alignItems: "flex-start", padding: "0 8px", borderRadius: 8, height: 49, overflow: "hidden", background: p.id === sel ? c.selected : "transparent", border: 0, width: "100%", boxSizing: "border-box" as const, font: "inherit", color: "inherit" };
          return !ordered && editable(p, me) ? (
            <button key={p.id} aria-label={`${p.id === me ? "Your" : `${p.name}'s`} slice: ${list}`} aria-pressed={p.id === sel} style={{ ...style, cursor: "pointer" }} onClick={() => toggleSel(p.id)}>
              {body}
            </button>
          ) : (
            <div key={p.id} style={style}>
              {body}
            </div>
          );
        })}
        {N > 4 ? (
          <div style={{ fontSize: 13, color: c.secondaryText, padding: "6px 8px", lineHeight: "18px", ...clipLine }}>{`+${N - 3} more · tap the pie`}</div>
        ) : null}
        {N === 0 ? <div style={{ fontSize: 13, color: c.secondaryText, padding: "6px 8px" }}>Nobody on the pie yet</div> : null}
      </div>
    );

    // ---- Chips / hint ----
    const person = sel ? state.people.find((p) => p.id === sel) : undefined;
    const joinBtn = !mine && !ordered && N < MAX_PEOPLE ? (
      <Button kind={N === 0 ? "primary" : "deemphasized"} onClick={() => act({ t: "join" })}>
        Join
      </Button>
    ) : null;
    const leaveBtn = mine && !ordered && N > 1 ? (
      <Button kind="deemphasized" onClick={() => act({ t: "leave" })}>
        Leave
      </Button>
    ) : null;
    const hint = (text: string) => <div style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 13, color: c.secondaryText, ...clipLine }}>{text}</div>;
    const middle = ordered
      ? hint(doorName ? `Order sent · ${doorName} is on door duty` : pending ? "Order sent" : "Order sent")
      : person && editable(person, me) ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div role="group" aria-label="Toppings" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {SHORT.map((label, k) => {
                const on = !!(person.tops & (1 << k));
                return (
                  <button
                    key={label}
                    className="m-hit"
                    aria-pressed={on}
                    aria-label={`${label} on ${person.id === me ? "your" : `${person.name}'s`} slice`}
                    onClick={() => act({ t: "top", who: person.id, k })}
                    style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 10px 0 6px", borderRadius: 18, border: 0, font: "inherit", fontSize: 13, fontWeight: 600, background: on ? c.selected : c.secondaryButton, color: on ? c.link : c.secondaryButtonText, scrollSnapAlign: "start" }}
                  >
                    <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">
                      {toppingArt(k, q)}
                    </svg>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : person ? (
          hint(`${person.name}'s slice · only ${person.name} can change it`)
        ) : (
          hint(N === 0 ? "Join to pick your toppings" : "Tap a slice to change toppings")
        );

    // ---- Wings ----
    const w = state.wings;
    const wingsRow =
      w.cents > 0 ? (
        <button
          role="switch"
          aria-checked={w.on}
          aria-label={`${w.label} for ${whole(w.cents)}`}
          disabled={ordered}
          onClick={() => act({ t: "wings" })}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44, padding: "0 12px 0 10px", border: 0, borderRadius: 8, background: c.wash, font: "inherit", color: "inherit", textAlign: "left", marginTop: 4 }}
        >
          <svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true" style={{ flex: "none" }}>
            <g transform="rotate(-30)">
              <line x1="4" y1="0" x2="11" y2="0" stroke={q.cream} stroke-width="2.4" stroke-linecap="round" />
              <ellipse cx="-1" rx="8" ry="6" fill={q.orange} stroke={q.brown} stroke-width="1" />
            </g>
          </svg>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 600, lineHeight: "17px", color: c.text, ...clipLine }}>{`${w.label} · ${whole(w.cents)}`}</span>
            <span style={{ display: "block", fontSize: 12, lineHeight: "15px", color: c.secondaryText, ...clipLine }}>{[w.note, `split ${N} ways`].filter(Boolean).join(" · ")}</span>
          </span>
          <span aria-hidden="true" style={{ flex: "none", position: "relative", width: 44, height: 24, borderRadius: 12, background: w.on ? c.primary : c.track, transition: "background .25s" }}>
            <span style={{ position: "absolute", top: 3, left: w.on ? 23 : 3, width: 18, height: 18, borderRadius: 9, background: c.card, transition: "left .25s" }} />
          </span>
        </button>
      ) : null;

    // ---- Order / tracker ----
    let bottom: Child;
    if (ordered) {
      const k = Math.min(1, Math.max(0, (clock.value - state.orderedAt) / DELIVERY_MS));
      const x0 = 24, x1 = W - 24;
      const sx = x0 + 14 + (x1 - 20 - (x0 + 14)) * k;
      bottom = (
        <div style={{ marginTop: 6, minHeight: 52 }}>
          <div style={{ textAlign: "center", fontSize: 13, lineHeight: "18px", color: c.text, ...clipLine }}>
            {k >= 1 ? `At the door · ${doorName ?? "someone"}, go` : `Ordered · ${money(grand)} · about ${Math.ceil(35 * (1 - k))} min`}
          </div>
          <svg viewBox={`0 0 ${W} 34`} width={W} height={34} style={{ display: "block" }} role="img" aria-label={k >= 1 ? "The pizza is at the door" : "The pizza is on its way"}>
            <line x1={x0} y1="20" x2={x1} y2="20" stroke={c.divider} stroke-width="2" stroke-dasharray="6 5" />
            <rect x={x0 - 8} y="6" width="16" height="14" rx="2" fill={q.red} />
            <rect x={x1 - 8} y="4" width="16" height="16" rx="2" fill={c.primary} />
            <g transform={`translate(${n1(sx)} 20)`}>
              <circle cx="-8" cy="0" r="4" fill={c.text} />
              <circle cx="8" cy="0" r="4" fill={c.text} />
              <rect x="-10" y="-8" width="20" height="7" rx="2" fill={c.primary} />
              <rect x="-4" y="-17" width="10" height="9" rx="1" fill={q.crust} />
            </g>
          </svg>
        </div>
      );
    } else {
      bottom = (
        <div style={{ marginTop: 4 }}>
          {N > 0 ? (
            <Button kind="primary" wide onClick={() => act({ t: "order" })}>
              {`Send to ${first(state.place).replace(/[^\w']/g, "") || "Pizza"} · ${money(grand)}`}
            </Button>
          ) : null}
        </div>
      );
    }

    return (
      <div>
        <CardHeader title="Pizza run" subtitle={state.messages ? `${state.place} · from ${state.messages} messages` : `${state.place} · group order`} />
        <div style={{ display: "flex", alignItems: "flex-start", minHeight: 194 }}>
          {pie}
          {roster}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36 }}>
          {middle}
          {joinBtn}
          {leaveBtn}
        </div>
        {wingsRow}
        {bottom}
      </div>
    );
  },
});
