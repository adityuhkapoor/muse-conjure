import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  Toast,
  clock,
  haptic,
  mix,
  pal,
  running,
  tween,
  userColor,
  type Ctx,
  type Member,
  type Theme,
} from "@muse/app";

// Trip snake draft: six lanes of friends and a board of real plans. Whoever is on the clock taps a
// tile and it flies, arcing, into their lane; the order snakes back for round two; when every pick
// is in, the itinerary is done and the leftovers are struck.

type Params = {
  /** Card title: "Nashville snake draft" */
  title: string;
  /** One line under the title: "Senior yr or never · Mar 13–16 · 2 picks each" */
  why: string;
  /** 1 to 6 friends in draft order; prefs are plan indices an auto pick takes first */
  players: { name: string; prefs: number[] }[];
  /** Up to 14 plans: cat 0 music, 1 food, 2 sights, 3 nightlife; suggested: Muse's idea, nobody in the chat said it */
  plans: { label: string; cat: number; suggested?: boolean }[];
  /** Picks already made, in order: plan indices */
  picks: number[];
};

// @params
const P: Params = {
  title: "Nashville snake draft", why: "Senior yr or never · Mar 13–16 · 2 picks each",
  players: [ { name: "Priya", prefs: [3, 4, 2] }, { name: "Sam", prefs: [10, 13, 1] }, { name: "Ana", prefs: [2, 4, 3] },
             { name: "Maya", prefs: [] }, { name: "Jules", prefs: [5, 11, 0] }, { name: "Dev", prefs: [8, 1, 10, 13] } ],
  plans: [ { label: "Honky tonks", cat: 3 }, { label: "Hattie B's", cat: 1 }, { label: "Grand Ole Opry", cat: 0 },
    { label: "Ryman tour", cat: 0 }, { label: "Bluebird Cafe", cat: 0 }, { label: "Pedal tavern", cat: 3 },
    { label: "The Parthenon", cat: 2 }, { label: "Wings mural", cat: 2 }, { label: "Robert's $6 meal", cat: 1 },
    { label: "Cash Museum", cat: 2 }, { label: "Pancake Pantry", cat: 1 }, { label: "Printer's Alley", cat: 3 },
    { label: "Country Music HOF", cat: 2 }, { label: "Assembly Hall", cat: 1 } ],
  picks: [0, 1, 2],
};
// @end params

type Seat = { name: string; user: string | null; prefs: number[] };
type Plan = { label: string; cat: number; suggested?: boolean };
type Pick = { seat: number; plan: number; at: number };
type State = { title: string; why: string; seats: Seat[]; plans: Plan[]; picks: Pick[]; turnAt: number };
type Action = { t: "pick"; plan: number } | { t: "auto" } | { t: "add"; label: string; cat: number };
type Local = { draft: string };

const MAX_SEATS = 6;
const MAX_PLANS = 14;
const CLOCK_MS = 20000;
const FLY_MS = 550;
const BURST_MS = 2400;
const LANE_Y = 4;
const MAX_LABEL = 30;
const MAX_H = 416;
const NAME_W = 58;
const SLOT_X = 30 + NAME_W + 4;

/** A label that may need a second line: tiles and lane chips are about 20 characters wide (the Suggested tag runs on after the label). */
const wraps = (p: Plan | undefined) => !!p && p.label.length + (p.suggested ? 10 : 0) > 19;

/** Where everything sits: lanes grow to two lines when a label may wrap; each board row is as tall as its tallest tile. */
function layoutOf(plans: Plan[], S: number) {
  const wrapLane = plans.some(wraps);
  const laneH = wrapLane ? 30 : 26;
  const statusY = LANE_Y + laneH * Math.max(1, S) + 4;
  const boardY = statusY + 32;
  const n = Math.max(S, plans.length);
  const rowY: number[] = [];
  const rowH: number[] = [];
  let y = 0;
  for (let r = 0; r < Math.ceil(n / 2); r++) {
    const h = wraps(plans[2 * r]) || wraps(plans[2 * r + 1]) ? 34 : 20;
    rowY.push(y);
    rowH.push(h);
    y += h + 2;
  }
  const boardH = Math.max(0, y - 2);
  return { wrapLane, laneH, chipH: wrapLane ? 26 : 21, statusY, boardY, rowY, rowH, boardH, height: boardY + boardH + (plans.length < S ? 44 : 0) };
}
const fly = tween({ duration: FLY_MS, easing: "easeInOut" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const total = (s: State) => (s.plans.length >= s.seats.length ? Math.min(2 * s.seats.length, s.plans.length) : 0);
const done = (s: State) => total(s) > 0 && s.picks.length >= total(s);
const live = (s: State) => total(s) > 0 && s.picks.length < total(s);
const seatOf = (n: number, S: number) => (Math.floor(n / S) % 2 === 0 ? n % S : S - 1 - (n % S));
const cur = (s: State) => (done(s) || s.seats.length === 0 ? -1 : seatOf(s.picks.length, s.seats.length));
const taken = (s: State, k: number) => s.picks.some((p) => p.plan === k);
const autoPlan = (s: State) => {
  const seat = s.seats[cur(s)];
  const pref = seat?.prefs.find((k) => !taken(s, k));
  if (pref !== undefined) return pref;
  for (let k = 0; k < s.plans.length; k++) if (!taken(s, k)) return k;
  return -1;
};
const clockOk = (s: State, time: number) => {
  const seat = s.seats[cur(s)];
  return !!seat && (seat.user === null || (s.turnAt > 0 && time >= s.turnAt + CLOCK_MS));
};

/** Give each member a seat: by name first, then the next free seat in member order. */
function bind(seats: Seat[], members: Member[]): Seat[] {
  const out = seats.map((s) => ({ ...s }));
  const used = new Set(out.map((s) => s.user).filter((u): u is string => u !== null));
  for (const m of members) {
    if (used.has(m.id)) continue;
    const i = out.findIndex((s) => s.user === null && s.name.toLowerCase() === m.name.trim().toLowerCase());
    if (i >= 0) {
      out[i]!.user = m.id;
      used.add(m.id);
    }
  }
  for (const m of members) {
    if (used.has(m.id)) continue;
    const i = out.findIndex((s) => s.user === null);
    if (i < 0) break;
    out[i]!.user = m.id;
    out[i]!.name = clean(m.name, 12) || out[i]!.name;
    used.add(m.id);
  }
  return out;
}

function initState(ctx: Ctx): State {
  const plans: Plan[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(P.plans) ? P.plans : []) {
    if (plans.length >= MAX_PLANS) break;
    const label = clean(raw.label, MAX_LABEL);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    plans.push({ label, cat: Number.isInteger(raw.cat) && raw.cat >= 0 && raw.cat <= 3 ? raw.cat : 0, ...(raw.suggested === true ? { suggested: true } : {}) });
  }
  const prefsOf = (v: unknown) => {
    const out: number[] = [];
    for (const k of Array.isArray(v) ? v : []) if (Number.isInteger(k) && k >= 0 && k < plans.length && !out.includes(k) && out.length < 6) out.push(k);
    return out;
  };
  let seats: Seat[] = [];
  for (const raw of Array.isArray(P.players) ? P.players : []) {
    if (seats.length >= MAX_SEATS) break;
    const name = clean(raw.name, 12);
    if (name) seats.push({ name, user: null, prefs: prefsOf(raw.prefs) });
  }
  if (!seats.length) {
    seats = ctx.members.slice(0, MAX_SEATS).map((m) => ({ name: clean(m.name, 12) || "Friend", user: null, prefs: [] }));
    if (!seats.length) seats = [{ name: "Friend", user: null, prefs: [] }];
  }
  // wrapped labels take room: the board keeps only the plans that fit the card
  while (plans.length > seats.length && layoutOf(plans, seats.length).height > MAX_H) plans.pop();
  for (const st of seats) st.prefs = st.prefs.filter((k) => k < plans.length);
  const base: State = { title: clean(P.title, 32) || "Trip draft", why: clean(P.why, 60), seats: bind(seats, ctx.members), plans, picks: [], turnAt: 0 };
  const picks: Pick[] = [];
  const cap = total(base);
  for (const k of Array.isArray(P.picks) ? P.picks : []) {
    if (picks.length >= cap || !Number.isInteger(k) || k < 0 || k >= plans.length || picks.some((p) => p.plan === k)) break;
    picks.push({ seat: seatOf(picks.length, base.seats.length), plan: k, at: 0 });
  }
  return { ...base, picks };
}

// ---- drawing ----

function Face({ seat, members, size, theme }: { seat: Seat; members: Member[]; size: number; theme: Theme }) {
  const member = seat.user ? members.find((m) => m.id === seat.user) : undefined;
  if (member) return <Avatar user={member} size={size} />;
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        width: size,
        height: size,
        borderRadius: "50%",
        background: userColor(seat.name, theme),
        color: theme.color.onPrimary,
        fontSize: Math.round(size * 0.55),
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {(seat.name[0] ?? "?").toUpperCase()}
    </span>
  );
}

const rgbOf = (col: string): number[] => {
  if (/^#/.test(col)) {
    const n = parseInt(col.slice(1, 7), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  return (col.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
};
const lum = (col: string) => {
  const [r, g, b] = rgbOf(col).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

/** A chip's fill and ink for a plan category, nudged until the label reads at 4.5:1. */
function chipColors(th: Theme, cat: number): { fill: string; ink: string } {
  const c = th.color;
  const base = [c.series1, c.series2, c.series3, c.series4][cat] ?? c.series1;
  const inks = [c.onPrimary, pal(th).dark, c.card, c.text];
  const ink = inks.reduce((best, x) => (ratio(x, base) > ratio(best, base) ? x : best), inks[0]!);
  const toward = lum(ink) < lum(base) ? (th.mode === "dark" ? c.text : c.card) : th.mode === "dark" ? c.card : c.text;
  let fill = base;
  for (let k = 0.05; ratio(ink, fill) < 4.6 && k <= 0.7; k += 0.05) fill = mix(base, toward, k);
  return { fill, ink };
}
const catFill = (th: Theme, cat: number) => chipColors(th, cat).fill;
const catInk = (th: Theme, cat: number) => chipColors(th, cat).ink;

const CSS =
  ".td-tile{position:absolute;border:0;padding:0;margin:0;font:inherit;text-align:left;cursor:pointer;transition:transform .15s,background .15s}" +
  ".td-tile::after{content:'';position:absolute;left:0;right:0;top:-12px;bottom:-12px;z-index:-1}" +
  ".td-free:hover{transform:translateY(-2px)}" +
  ".td-lab{position:absolute;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
  ".td-two{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:normal;text-overflow:ellipsis}" +
  "@media (prefers-reduced-motion:reduce){.td-tile{transition:none}.td-free:hover{transform:none}}";

function Ring({ left, theme }: { left: number; theme: Theme }) {
  const c = theme.color;
  const r = 9;
  const len = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, left / 20));
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" role="img" aria-label={`${Math.ceil(left)} seconds left`} style={{ display: "block" }}>
      <circle cx={12} cy={12} r={12} fill={c.card} />
      <circle cx={12} cy={12} r={r} fill="none" stroke={c.track} stroke-width={2} />
      <circle cx={12} cy={12} r={r} fill="none" stroke={left < 6 ? c.negative : c.primary} stroke-width={2} stroke-linecap="round" stroke-dasharray={`${len * frac} ${len}`} transform="rotate(-90 12 12)" />
      <text x={12} y={15.5} text-anchor="middle" font-size={11} font-weight={600} fill={c.text}>
        {Math.ceil(left)}
      </text>
    </svg>
  );
}

export default defineApp<State, Action, Local>({
  name: "Trip snake draft",
  summary: (s) => {
    if (!s.plans.length || total(s) === 0) return `${s.title}: add plans to start`;
    if (done(s)) return `${s.title}: ${total(s)} plans picked, ${s.plans.length - total(s)} didn't make the cut`;
    return `${s.title}: pick ${s.picks.length + 1} of ${total(s)}, ${s.seats[cur(s)]?.name ?? ""} on the clock`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "pick") {
      if (!live(s) || typeof a.plan !== "number" || !Number.isInteger(a.plan) || a.plan < 0 || a.plan >= s.plans.length || taken(s, a.plan)) return s;
      const seat = cur(s);
      if (s.seats[seat]?.user !== meta.user) return s;
      return { ...s, picks: [...s.picks, { seat, plan: a.plan, at: meta.time }], turnAt: meta.time };
    }
    if (a.t === "auto") {
      if (!live(s) || !clockOk(s, meta.time)) return s;
      const plan = autoPlan(s);
      if (plan < 0) return s;
      return { ...s, picks: [...s.picks, { seat: cur(s), plan, at: meta.time }], turnAt: meta.time };
    }
    if (a.t === "add") {
      if (s.picks.length > 0 || s.plans.length >= MAX_PLANS) return s;
      const label = clean(a.label, MAX_LABEL);
      if (!label || s.plans.some((p) => p.label.toLowerCase() === label.toLowerCase())) return s;
      if (typeof a.cat !== "number" || !Number.isInteger(a.cat) || a.cat < 0 || a.cat > 3) return s;
      const plans = [...s.plans, { label, cat: a.cat }];
      if (layoutOf(plans, s.seats.length).height > MAX_H) return s;
      return { ...s, plans };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const kept = s.seats.map((x) => (x.user !== null && !inChat(ctx, x.user) ? { ...x, user: null } : x));
    const seats = bind(kept, ctx.members);
    return JSON.stringify(seats) === JSON.stringify(s.seats) ? s : { ...s, seats };
  },

  invariants: {
    "picks follow the snake": (s) => s.picks.every((p, k) => p.seat === (Math.floor(k / s.seats.length) % 2 === 0 ? k % s.seats.length : s.seats.length - 1 - (k % s.seats.length))),
    "a plan is picked once": (s) => new Set(s.picks.map((p) => p.plan)).size === s.picks.length && s.picks.every((p) => Number.isInteger(p.plan) && p.plan >= 0 && p.plan < s.plans.length),
    "never more picks than the draft has": (s) => {
      const cap = s.plans.length >= s.seats.length ? Math.min(2 * s.seats.length, s.plans.length) : 0;
      return s.picks.length <= cap && (s.picks.length === 0 || s.plans.length >= s.seats.length);
    },
    "the clock starts at the last pick": (s) => s.turnAt === (s.picks.length ? s.picks[s.picks.length - 1]!.at : 0),
    "seats are people in the chat, each once": (s, ctx) => {
      const users = s.seats.map((x) => x.user).filter((u): u is string => u !== null);
      return s.seats.length >= 1 && s.seats.length <= 6 && new Set(users).size === users.length && users.every((u) => ctx.members.some((m) => m.id === u));
    },
    "plans fit the board": (s) =>
      s.plans.length <= 14 &&
      new Set(s.plans.map((p) => p.label.toLowerCase())).size === s.plans.length &&
      s.plans.every((p) => p.label.length > 0 && p.label.length <= MAX_LABEL && Number.isInteger(p.cat) && p.cat >= 0 && p.cat <= 3),
  },

  transitions: {
    "only the seat on the clock picks": (p, n, a, m) => a.t !== "pick" || p === n || p.seats[cur(p)]?.user === m.user,
    "a pick takes exactly the tapped plan": (p, n, a, m) =>
      a.t !== "pick" || p === n || (n.picks.length === p.picks.length + 1 && n.picks[n.picks.length - 1]!.plan === a.plan && n.picks[n.picks.length - 1]!.at === m.time),
    "auto waits for the clock and takes the first free pref": (p, n, a, m) => {
      if (a.t !== "auto" || p === n) return true;
      const seat = p.seats[cur(p)];
      if (!seat) return false;
      const expired = seat.user === null || (p.turnAt > 0 && m.time >= p.turnAt + 20000);
      const free = (k: number) => !p.picks.some((x) => x.plan === k);
      let want = seat.prefs.find(free);
      for (let k = 0; want === undefined && k < p.plans.length; k++) if (free(k)) want = k;
      return expired && n.picks[n.picks.length - 1]!.plan === want;
    },
    "picks are never undone": (p, n) => JSON.stringify(n.picks.slice(0, p.picks.length)) === JSON.stringify(p.picks),
    "the board is fixed once drafting starts": (p, n) => p.picks.length === 0 || JSON.stringify(n.plans) === JSON.stringify(p.plans),
    "add only grows the board by one": (p, n, a) => a.t !== "add" || p === n || (p.picks.length === 0 && n.plans.length === p.plans.length + 1),
    "a free plan on my turn lands": (p, n, a, m) =>
      a.t !== "pick" || !live(p) || !Number.isInteger(a.plan) || a.plan < 0 || a.plan >= p.plans.length || taken(p, a.plan) || p.seats[cur(p)]?.user !== m.user || n.picks.length === p.picks.length + 1,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r) => {
    if (done(s)) return { t: "pick", plan: 0 };
    if (s.plans.length < s.seats.length) return { t: "add", label: `${r.pick(["Tacos", "Lake day", "Karaoke", "Thrift run"])} ${r.int(99)}`, cat: r.int(4) };
    const seat = s.seats[cur(s)];
    if (seat && seat.user === user) {
      const free = s.plans.map((_p, k) => k).filter((k) => !taken(s, k));
      if (r.next() < 0.1 || !free.length) return { t: "pick", plan: r.int(s.plans.length) };
      return { t: "pick", plan: r.pick(free) };
    }
    return { t: "auto" };
  },

  local: { draft: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const S = state.seats.length;
    const tot = total(state);
    const finished = done(state);
    const drafting = live(state);
    const seat = cur(state);
    const onClock = drafting ? state.seats[seat] : undefined;
    const mySeat = state.seats.findIndex((x) => x.user === me);
    const myTurn = !!onClock && onClock.user === me;
    const lastPick = state.picks[state.picks.length - 1];

    // the clock is read only when something on screen moves with it
    const needClock = drafting && (!myTurn || state.turnAt > 0);
    const now = needClock ? clock.value : 0;
    const left = state.turnAt > 0 ? Math.max(0, CLOCK_MS / 1000 - (now - state.turnAt) / 1000) : CLOCK_MS / 1000;
    const canAuto = drafting && !myTurn && clockOk(state, now);

    const L = layoutOf(state.plans, S);
    const slotW = Math.max(40, (W - SLOT_X - 6) / 2);
    const slotX = (round: number) => SLOT_X + round * (slotW + 6);
    const laneY = (k: number) => LANE_Y + L.laneH * k;
    const tw = (W - 6) / 2;
    const tileH = (k: number) => L.rowH[Math.floor(k / 2)] ?? 20;
    const tileXY = (k: number) => ({ x: (k % 2) * (tw + 6), y: L.boardY + (L.rowY[Math.floor(k / 2)] ?? 0) });
    const pickNo = (k: number, round: number) => (round === 0 ? k + 1 : S + (S - 1 - k) + 1);

    const dots = ".".repeat(1 + (Math.floor(now / 333) % 3));
    const cut = state.plans.length - tot;
    const status = (() => {
      if (!state.plans.length || tot === 0) return { text: "Add a plan to start", color: c.secondaryText };
      if (finished) return { text: cut > 0 ? `It's a plan · ${cut} didn't make the cut` : "It's a plan", color: c.text };
      if (myTurn) return { text: "You're on the clock · tap a plan", color: c.link };
      return { text: `${onClock?.name ?? ""} is picking${dots}`, color: c.secondaryText };
    })();

    // ghost: a stand-in or another friend browsing the board
    const avail = state.plans.map((_p, k) => k).filter((k) => !taken(state, k));
    const ghost = drafting && !myTurn && avail.length ? avail[(Math.floor((now - state.turnAt) / 200) * 7 + seat * 3) % avail.length] : undefined;

    // the flight of the latest pick
    const e = lastPick && lastPick.at > 0 ? running(lastPick.at, FLY_MS) : null;
    const flightRound = lastPick ? Math.floor((state.picks.length - 1) / S) : 0;
    const celebrate = finished && lastPick && lastPick.at > 0 && running(lastPick.at, BURST_MS) !== null;

    const tap = (k: number) => {
      if (!myTurn || taken(state, k)) return;
      dispatch({ t: "pick", plan: k });
      if (state.picks.length + 1 >= tot) haptic("success");
    };

    const empty = state.plans.length < S;
    const addDraft = clean(local.draft, MAX_LABEL);

    const chip = (label: string, cat: number, w: number, h: number, extra: Record<string, unknown> = {}) => (
      <span
        style={{
          position: "absolute",
          width: w,
          height: h,
          borderRadius: 7,
          background: catFill(theme, cat),
          color: catInk(theme, cat),
          fontSize: 11,
          lineHeight: L.wrapLane ? "12px" : `${h}px`,
          fontWeight: 600,
          padding: "0 7px",
          display: L.wrapLane ? "flex" : undefined,
          alignItems: L.wrapLane ? "center" : undefined,
          boxSizing: "border-box",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          ...extra,
        }}
      >
        {L.wrapLane ? <span className="td-two" style={{ minWidth: 0 }}>{label}</span> : label}
      </span>
    );

    const boardH = L.boardH;
    const boxH = L.height;

    return (
      <div>
        <style>{CSS}</style>
        <CardHeader title={state.title} subtitle={state.why} />
        <div style={{ position: "relative", height: boxH }}>
          <div role="group" aria-label={`Draft lanes: ${state.picks.length} of ${tot} picked`}>
            {state.seats.map((st, k) => {
              const hot = seat === k && drafting;
              const mine = st.user === me;
              return (
                <div key={k} style={{ position: "absolute", left: 0, top: laneY(k), width: W, height: L.laneH }}>
                  {hot ? <div style={{ position: "absolute", left: -4, top: 0, width: W + 8, height: L.laneH, borderRadius: 8, background: c.selected }} /> : null}
                  <span
                    style={{
                      position: "absolute",
                      left: 2,
                      top: (L.laneH - 24) / 2,
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      boxSizing: "border-box",
                      boxShadow: mine ? `0 0 0 2px ${c.primary}` : "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Face seat={st} members={members} size={20} theme={theme} />
                  </span>
                  <span className="td-lab" style={{ left: 30, top: 0, width: NAME_W, lineHeight: `${L.laneH}px`, fontSize: 13, fontWeight: hot ? 600 : 400, color: hot ? c.text : c.secondaryText }}>
                    {mine ? "You" : st.name}
                  </span>
                  {[0, 1].map((round) => {
                    const no = pickNo(k, round);
                    if (tot > 0 && no > tot) return null;
                    const idx = state.picks.findIndex((p) => p.seat === k && Math.floor(state.picks.indexOf(p) / S) === round);
                    const pk = idx >= 0 ? state.picks[idx] : undefined;
                    const flying = pk && pk.at > 0 && running(pk.at, FLY_MS) !== null;
                    const plan = pk ? state.plans[pk.plan] : undefined;
                    return (
                      <div key={round} style={{ position: "absolute", left: slotX(round), top: 2, width: slotW, height: L.chipH, borderRadius: 7, background: hot ? c.card : c.wash }}>
                        {plan && !flying ? (
                          chip(plan.label, plan.cat, slotW, L.chipH, { left: 0, top: 0 })
                        ) : !plan ? (
                          <span style={{ position: "absolute", right: 8, top: 0, fontSize: 11, lineHeight: `${L.chipH}px`, color: c.secondaryText }}>{`#${no}`}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div style={{ position: "absolute", left: 0, top: L.statusY, width: W, height: 32 }}>
            <span
              style={{ position: "absolute", left: 2, top: 0, right: canAuto ? 100 : 34, lineHeight: "32px", fontSize: 14, fontWeight: 600, color: status.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {status.text}
            </span>
            <div style={{ position: "absolute", right: 0, top: 4, height: 24, display: "flex", alignItems: "center" }}>
              {canAuto ? (
                <div style={{ marginTop: -2 }}>
                  <Button kind="secondary" onClick={() => dispatch({ t: "auto" })}>
                    Auto pick
                  </Button>
                </div>
              ) : myTurn ? (
                <Ring left={left} theme={theme} />
              ) : onClock ? (
                <Face seat={onClock} members={members} size={20} theme={theme} />
              ) : null}
            </div>
          </div>

          {state.plans.map((pl, k) => {
            const { x, y } = tileXY(k);
            const pk = state.picks.find((p) => p.plan === k);
            const picker = pk ? state.seats[pk.seat] : undefined;
            const ghosted = ghost === k && onClock;
            const th = tileH(k);
            const two = wraps(pl);
            const tag = pl.suggested === true && !pk && !ghosted;
            return (
              <button
                key={k}
                type="button"
                aria-label={pl.label}
                className={pk ? "td-tile" : "td-tile td-free"}
                onClick={() => tap(k)}
                style={{
                  left: x,
                  top: y,
                  width: tw,
                  height: tileH(k),
                  borderRadius: 7,
                  background: pk ? mix(c.wash, c.text, 0.04) : c.wash,
                  boxShadow: ghosted ? `inset 0 0 0 1px ${userColor(onClock.user ?? onClock.name, theme)}` : "none",
                  color: pk ? c.secondaryText : c.text,
                }}
              >
                {!pk ? <span aria-hidden="true" style={{ position: "absolute", left: 5, top: (th - 11) / 2, width: 4, height: 11, borderRadius: 2, background: catFill(theme, pl.cat) }} /> : null}
                <span
                  className={two ? "td-lab td-two" : "td-lab"}
                  style={{ left: pk ? 12 : 15, top: two ? (th - 28) / 2 : 0, width: tw - (pk ? 12 : 15) - (pk || ghosted ? 28 : 6), lineHeight: two ? "14px" : `${th}px`, fontSize: pk ? 12 : 13 }}
                >
                  {pl.label}
                  {tag ? <span style={{ marginLeft: 5, fontSize: 11, color: c.secondaryText }}>Suggested</span> : null}
                </span>
                {pk ? <span aria-hidden="true" style={{ position: "absolute", left: 12, top: th / 2, width: tw - 12 - 26, height: 1, background: c.secondaryText, opacity: 0.5 }} /> : null}
                {picker || ghosted ? (
                  <span aria-hidden="true" style={{ position: "absolute", right: 6, top: 3, display: "flex" }}>
                    <Face seat={(picker ?? onClock)!} members={members} size={14} theme={theme} />
                  </span>
                ) : null}
              </button>
            );
          })}

          {empty
            ? Array.from({ length: S - state.plans.length }, (_x, i) => {
                const { x, y } = tileXY(state.plans.length + i);
                return <div key={`m${i}`} aria-hidden="true" style={{ position: "absolute", left: x, top: y, width: tw, height: tileH(state.plans.length + i), borderRadius: 7, border: `1px dashed ${c.divider}`, boxSizing: "border-box" }} />;
              })
            : null}

          {empty ? (
            <div style={{ position: "absolute", left: 0, top: L.boardY + boardH + 6, width: W, height: 36, display: "flex", gap: 8, alignItems: "center" }}>
              <input
                aria-label="Add a plan"
                placeholder="Add a plan"
                maxLength={MAX_LABEL}
                value={local.draft}
                onInput={(ev) => setLocal({ draft: ev.currentTarget.value })}
                style={{ flex: 1, minWidth: 0, height: 36, boxSizing: "border-box" }}
              />
              <Button
                kind="primary"
                onClick={() => {
                  if (!addDraft) return;
                  dispatch({ t: "add", label: addDraft, cat: 0 });
                  setLocal({ draft: "" });
                }}
              >
                Add
              </Button>
            </div>
          ) : null}

          {e !== null && lastPick ? (
            (() => {
              const plan = state.plans[lastPick.plan];
              if (!plan) return null;
              const from = tileXY(lastPick.plan);
              const sx = slotX(flightRound);
              const sy = laneY(lastPick.seat) + 2;
              const k = fly(e);
              const arc = Math.sin((Math.PI * e) / FLY_MS);
              const w = lerp(tw, slotW, k) * (1 + 0.12 * arc);
              const h = lerp(tileH(lastPick.plan), L.chipH, k) * (1 + 0.12 * arc);
              const cx = lerp(from.x + tw / 2, sx + slotW / 2, k);
              const cy = lerp(from.y + tileH(lastPick.plan) / 2, sy + L.chipH / 2, k) - arc * 40;
              return chip(plan.label, plan.cat, w, h, { left: cx - w / 2, top: cy - h / 2, zIndex: 5, pointerEvents: "none" });
            })()
          ) : null}

          {celebrate && lastPick ? (
            <div style={{ position: "absolute", left: 0, right: 0, top: LANE_Y + 110, pointerEvents: "none" }}>
              <Burst key={lastPick.at} emoji={"❤️"} count={8} />
            </div>
          ) : null}
        </div>
        {celebrate && lastPick ? <Toast key={lastPick.at}>It's a plan</Toast> : null}
        {mySeat < 0 ? null : null}
      </div>
    );
  },
});
