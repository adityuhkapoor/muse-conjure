import { defineApp, Avatar, Button, CardHeader, Facepile, Toast, fitText, haptic, mix, running, tween, type Child, type Member } from "@muse/app";

// Host board: the host's view of a house party. The apartment is a house that fills with heads
// (going, plus-ones, the maybes likely to show); over the cap the extra heads spill out the door.
// Flip the plus-one policy or the maybe show rate and the heads and snack math re-roll; once it
// fits, lock the door list for whoever is on the door. Friends in the chat are faces in the house.

type Params = {
  /** Event name: "Theo's 21st" */
  title: string;
  /** Day and time: "Fri 9pm" */
  when: string;
  /** Host, name as in the members list */
  host: string;
  /** Rough capacity in heads, 20 to 60 */
  cap: number;
  /** Who checks the list at the door */
  door: string;
  /** Chat names already going */
  going: string[];
  /** Chat names who said maybe */
  maybe: string[];
  /** Guests outside the chat going */
  othersGoing: number;
  /** Guests outside the chat who said maybe */
  othersMaybe: number;
  /** Names of outside guests, for the door list faces */
  guests: string[];
  /** Plus-one policy: 0 none, 1 one each, 2 anyone */
  plus: number;
  /** Maybes show: 0 one in 4, 1 one in 2, 2 three in 4 */
  rate: number;
};

// @params
const P: Params = {
  title: "Theo's 21st",
  when: "Fri 9pm",
  host: "Theo",
  cap: 45,
  door: "Kev",
  going: ["Theo", "Maya", "Priya"],
  maybe: ["Dev"],
  othersGoing: 21,
  othersMaybe: 17,
  guests: ["Jess", "Kev", "Nico", "Sam", "Ana"],
  plus: 1,
  rate: 1,
};
// @end params

type V = "going" | "maybe" | "no";
type Lvl = 0 | 1 | 2;
type State = {
  title: string;
  when: string;
  door: string;
  cap: number;
  host: string | null;
  rsvp: Record<string, V>;
  othersGoing: number;
  othersMaybe: number;
  guests: string[];
  plus: Lvl;
  rate: Lvl;
  lockedAt: number;
  changedAt: number;
  from: number;
};
type Action = { t: "rsvp"; v: V } | { t: "plus"; i: number } | { t: "rate"; i: number } | { t: "trim" } | { t: "lock" } | { t: "reopen" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name: string }[] };

const PLUS = ["none", "1 each", "anyone"];
const RATE = ["25%", "50%", "75%"];
const ANSWERS: [V, string][] = [
  ["going", "Going"],
  ["maybe", "Maybe"],
  ["no", "Can't go"],
];
const COLS = 9;

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : d);
const isV = (v: unknown): v is V => v === "going" || v === "maybe" || v === "no";
const isLvl = (v: unknown): v is Lvl => v === 0 || v === 1 || v === 2;

/** The head math the reducer and the view use. */
function tally(s: State, plus: Lvl = s.plus, rate: Lvl = s.rate) {
  let going = s.othersGoing;
  let maybe = s.othersMaybe;
  for (const k of Object.keys(s.rsvp)) {
    if (s.rsvp[k] === "going") going += 1;
    else if (s.rsvp[k] === "maybe") maybe += 1;
  }
  const plusOnes = plus === 0 ? 0 : Math.round((going * (plus === 1 ? 14 : 22)) / 24);
  const shows = Math.round((maybe * (rate + 1)) / 4);
  return { going, maybe, plusOnes, shows, heads: going + plusOnes + shows, names: going + plusOnes };
}
const coHost = (s: State, u: string) => s.rsvp[u] === "going";

/** The checks' own copy of the head count, so a broken tally cannot hide from them. */
function headsOf(s: State, plus: number = s.plus, rate: number = s.rate): number {
  const vals = Object.values(s.rsvp);
  const g = s.othersGoing + vals.filter((v) => v === "going").length;
  const m = s.othersMaybe + vals.filter((v) => v === "maybe").length;
  return g + [0, Math.round((g * 14) / 24), Math.round((g * 22) / 24)][plus]! + Math.round((m * [1, 2, 3][rate]!) / 4);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const withoutUser = (r: Record<string, V>, u: string) => Object.keys(r).filter((k) => k !== u).sort().map((k) => k + ":" + r[k]).join();

function trimTarget(s: State): [Lvl, Lvl] | null {
  for (let p = s.plus; p >= 0; p--) if (tally(s, p as Lvl, s.rate).heads <= s.cap) return [p as Lvl, s.rate];
  for (let r = s.rate - 1; r >= 0; r--) if (tally(s, 0, r as Lvl).heads <= s.cap) return [0, r as Lvl];
  return null;
}

const stamp = (prev: State, next: State, time: number): State => ({ ...next, changedAt: time, from: tally(prev).heads });

export default defineApp<State, Action, Local>({
  name: "Host board",
  summary: (s) => {
    const t = tally(s);
    if (s.lockedAt > 0) return `${s.title}: door list locked · ${t.names} names`;
    return `${s.title}: ${t.heads} heads, cap ${s.cap}${t.heads > s.cap ? ` · ${t.heads - s.cap} over` : ""}`;
  },

  init: (ctx) => {
    const find = (name: unknown) => {
      if (typeof name !== "string") return undefined;
      const want = name.trim().toLowerCase();
      return want ? ctx.members.find((m) => m.id === name || m.name.toLowerCase() === want)?.id : undefined;
    };
    const rsvp: Record<string, V> = {};
    for (const n of P.maybe) {
      const id = find(n);
      if (id) rsvp[id] = "maybe";
    }
    for (const n of P.going) {
      const id = find(n);
      if (id) rsvp[id] = "going";
    }
    const host = find(P.host) ?? ctx.members[0]?.id ?? null;
    if (host) rsvp[host] = "going";
    const s: State = {
      title: clip(P.title, 40) || "House party",
      when: clip(P.when, 24),
      door: clip(P.door, 20) || "the host",
      cap: int(P.cap, 20, 60, 45),
      host,
      rsvp,
      othersGoing: int(P.othersGoing, 0, 200, 0),
      othersMaybe: int(P.othersMaybe, 0, 200, 0),
      guests: (Array.isArray(P.guests) ? P.guests : []).map((g) => clip(g, 16)).filter(Boolean).slice(0, 12),
      plus: isLvl(P.plus) ? P.plus : 1,
      rate: isLvl(P.rate) ? P.rate : 1,
      lockedAt: 0,
      changedAt: 0,
      from: 0,
    };
    return { ...s, from: tally(s).heads };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const open = s.lockedAt === 0;
    if (a.t === "rsvp") {
      if (!isV(a.v) || !open || m.user === s.host || s.rsvp[m.user] === a.v) return s;
      return stamp(s, { ...s, rsvp: { ...s.rsvp, [m.user]: a.v } }, m.time);
    }
    if (a.t === "plus" || a.t === "rate") {
      if (!isLvl(a.i) || !open || !coHost(s, m.user) || s[a.t] === a.i) return s;
      return stamp(s, { ...s, [a.t]: a.i }, m.time);
    }
    if (a.t === "trim") {
      if (!open || !coHost(s, m.user) || tally(s).heads <= s.cap) return s;
      const to = trimTarget(s);
      if (!to) return s;
      return stamp(s, { ...s, plus: to[0], rate: to[1] }, m.time);
    }
    if (a.t === "lock") {
      if (!open || !coHost(s, m.user) || tally(s).heads > s.cap) return s;
      return { ...s, lockedAt: m.time };
    }
    if (a.t === "reopen") {
      if (open || !coHost(s, m.user)) return s;
      return { ...s, lockedAt: 0 };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const keep = Object.keys(s.rsvp).filter((u) => inChat(ctx, u));
    const hostHere = s.host !== null && inChat(ctx, s.host);
    if (keep.length === Object.keys(s.rsvp).length && (hostHere || (s.host === null && ctx.members.length === 0))) return s;
    const rsvp: Record<string, V> = {};
    for (const u of keep) rsvp[u] = s.rsvp[u]!;
    const host = hostHere ? s.host : (ctx.members[0]?.id ?? null);
    if (host) rsvp[host] = "going";
    const next: State = { ...s, rsvp, host };
    return next.lockedAt > 0 && tally(next).heads > next.cap ? { ...next, lockedAt: 0 } : next;
  },

  invariants: {
    "answers come from people in the chat": (s, ctx) => Object.keys(s.rsvp).every((u) => inChat(ctx, u) && isV(s.rsvp[u])),
    "the host is in the chat and going": (s, ctx) => (s.host === null ? ctx.members.length === 0 : inChat(ctx, s.host) && s.rsvp[s.host] === "going"),
    "policy is one of three": (s) => isLvl(s.plus) && isLvl(s.rate),
    "counts are whole and in range": (s) =>
      Number.isInteger(s.cap) && s.cap >= 20 && s.cap <= 60 && Number.isInteger(s.othersGoing) && s.othersGoing >= 0 && Number.isInteger(s.othersMaybe) && s.othersMaybe >= 0,
    "a locked list fits": (s) => s.lockedAt === 0 || headsOf(s) <= s.cap,
    "the last change starts from a head count": (s) => Number.isInteger(s.from) && s.from >= 0 && s.lockedAt >= 0,
  },

  transitions: {
    "only people going change the plan": (p, n, _a, m) => (p.plus === n.plus && p.rate === n.rate && (p.lockedAt > 0) === (n.lockedAt > 0)) || p.rsvp[m.user] === "going",
    "a locked list keeps its answers and policy": (p, n) => p.lockedAt === 0 || (same(p.rsvp, n.rsvp) && p.plus === n.plus && p.rate === n.rate),
    "an answer moves only the actor": (p, n, a, m) => a.t !== "rsvp" || p === n || (n.rsvp[m.user] === a.v && withoutUser(p.rsvp, m.user) === withoutUser(n.rsvp, m.user) && p.plus === n.plus && p.rate === n.rate),
    "the host stays going": (p, n, a, m) => a.t !== "rsvp" || m.user !== p.host || same(p.rsvp, n.rsvp),
    "a policy tap sets exactly that": (p, n, a) =>
      (a.t !== "plus" && a.t !== "rate") || p === n || (n[a.t] === a.i && (a.t === "plus" ? n.rate === p.rate : n.plus === p.plus) && same(p.rsvp, n.rsvp)),
    "trim fits and keeps the most it can": (p, n, a) =>
      a.t !== "trim" ||
      p === n ||
      (headsOf(p) > p.cap &&
        headsOf(n) <= n.cap &&
        n.plus <= p.plus &&
        n.rate <= p.rate &&
        (n.rate === p.rate ? !(n.plus + 1 <= p.plus && headsOf(n, n.plus + 1, n.rate) <= n.cap) : n.plus === 0 && (n.rate + 1 === p.rate || headsOf(n, 0, n.rate + 1) > n.cap))),
    "a lock is stamped now, only when it fits": (p, n, a, m) => a.t !== "lock" || p === n || (p.lockedAt === 0 && n.lockedAt === m.time && headsOf(p) <= p.cap),
    "a head change is stamped": (p, n, a, m) =>
      (a.t !== "rsvp" && a.t !== "plus" && a.t !== "rate" && a.t !== "trim") || p === n || (n.changedAt === m.time && n.from === headsOf(p)),
    "a good answer lands": (p, n, a, m, ctx) => a.t !== "rsvp" || !inChat(ctx, m.user) || !isV(a.v) || p.lockedAt > 0 || m.user === p.host || p.rsvp[m.user] === a.v || n.rsvp[m.user] === a.v,
    "a good policy tap lands": (p, n, a, m, ctx) =>
      (a.t !== "plus" && a.t !== "rate") || !inChat(ctx, m.user) || !isLvl(a.i) || p.lockedAt > 0 || p.rsvp[m.user] !== "going" || n[a.t] === a.i,
    "a good trim lands": (p, n, a, m, ctx) =>
      a.t !== "trim" || !inChat(ctx, m.user) || p.lockedAt > 0 || p.rsvp[m.user] !== "going" || headsOf(p) <= p.cap || headsOf(p, 0, 0) > p.cap || headsOf(n) <= n.cap,
    "a good lock lands": (p, n, a, m, ctx) => a.t !== "lock" || !inChat(ctx, m.user) || p.lockedAt > 0 || p.rsvp[m.user] !== "going" || headsOf(p) > p.cap || n.lockedAt === m.time,
    "reopen opens": (p, n, a, m, ctx) => a.t !== "reopen" || (p === n ? p.lockedAt === 0 || !inChat(ctx, m.user) || p.rsvp[m.user] !== "going" : n.lockedAt === 0 && p.lockedAt > 0),
  },

  arbitrary: (s, _user, r) => {
    const k = r.next();
    if (k < 0.3) {
      const v = r.next();
      return { t: "rsvp", v: v < 0.5 ? "going" : v < 0.75 ? "maybe" : "no" };
    }
    if (k < 0.5) return { t: "plus", i: r.int(3) };
    if (k < 0.7) return { t: "rate", i: r.int(3) };
    if (k < 0.8) return { t: "trim" };
    if (k < 0.9) return { t: "lock" };
    return s.lockedAt > 0 ? { t: "reopen" } : { t: "lock" };
  },

  local: {},

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const c = theme.color;
    const W = theme.width - 24;
    const narrow = W < 336;
    const t = tally(state);
    const locked = state.lockedAt > 0;
    const mine = state.rsvp[me] ?? null;
    const isCo = mine === "going";
    const canEdit = isCo && !locked;
    const nameOf = (id: string) => members.find((x) => x.id === id)?.name ?? "Someone";

    // Animated head count: from the head count before the last change to now.
    const el = running(state.changedAt, 500);
    const shown = el === null ? t.heads : Math.round(state.from + (t.heads - state.from) * tween({ duration: 500, easing: "decelerate" })(el));
    const over = t.heads > state.cap;

    // ---- house geometry (px inside the panel)
    const H = 150;
    const bw = Math.min(170, Math.round(W * (narrow ? 0.4 : 0.42)));
    const bx = 16;
    const top = 46;
    const bottom = 140;
    const rows = Math.ceil(state.cap / COLS);
    const cx = (bw - 16) / COLS;
    const cy = (bottom - top - 14) / rows;
    const r = Math.min(5, cx * 0.36, cy * 0.36);
    const spillCols = narrow ? 2 : 3;
    const sx = bx + bw + (narrow ? 10 : 12) + spillCols * 11 + (narrow ? 4 : 8);
    const fs = narrow ? 12 : 13;
    const slot = (i: number): [number, number] => {
      if (i < state.cap) return [bx + 8 + ((i % COLS) + 0.5) * cx, bottom - 7 - (Math.floor(i / COLS) + 0.5) * cy];
      const k = i - state.cap;
      return [bx + bw + 12 + (k % spillCols) * 11, bottom - 6 - Math.floor(k / spillCols) * 11];
    };
    const kindCol = [c.series3, c.series4, c.series2];
    const kind = (i: number) => (i < t.going ? 0 : i < t.going + t.plusOnes ? 1 : 2);
    const drawn = Math.min(shown, state.cap + spillCols * 4);
    const fill = over ? mix(c.card, c.negative, 0.12) : mix(c.card, c.series3, 0.1);

    const art: Child[] = [];
    art.push(<polygon points={`${bx - 8},${top} ${bx + bw / 2},8 ${bx + bw + 8},${top}`} fill={mix(fill, c.text, 0.06)} stroke={c.divider} stroke-width="1" />);
    art.push(<rect x={bx} y={top} width={bw} height={bottom - top} rx="4" fill={fill} stroke={c.divider} stroke-width="1" />);
    art.push(<circle cx={bx + bw / 2} cy="30" r="7" fill="none" stroke={c.text} stroke-width="1.5" />);
    art.push(<rect x={bx + bw - 2} y={bottom - 32} width="4" height="32" fill={c.text} />);
    for (let i = 0; i < drawn; i++) {
      const [x, y] = slot(i);
      art.push(<circle key={`d${i}`} cx={x} cy={y} r={r} fill={i >= state.cap ? c.negative : kindCol[kind(i)]} />);
      art.push(<circle key={`h${i}`} cx={x} cy={y - 1.5} r={Math.min(1.6, r * 0.32)} fill={c.onPrimary} fill-opacity="0.55" />);
    }

    // Friends in the chat as faces: going ones in the first going slots, maybes in the first maybe slots.
    const chatGoing = members.filter((x) => state.rsvp[x.id] === "going").sort((a, b) => (a.id === state.host ? -1 : b.id === state.host ? 1 : 0));
    const chatMaybe = members.filter((x) => state.rsvp[x.id] === "maybe");
    const faces: { m: Member; i: number }[] = [];
    chatGoing.slice(0, Math.min(t.going, state.cap)).forEach((m, i) => faces.push({ m, i }));
    chatMaybe.slice(0, t.shows).forEach((m, j) => faces.push({ m, i: t.going + t.plusOnes + j }));
    const av = Math.min(16, Math.round(cx + 1));

    // ---- snacks from the animated head count
    const snacks: [number, string][] = [
      [Math.ceil((shown * 3) / 8), "pizzas"],
      [Math.ceil(shown / 6), "bags chips"],
      [shown * 3, "cups"],
      [Math.ceil(shown / 5), "bags ice"],
    ];
    const cardW = (W - 18) / 4;
    const icon = (k: number) => {
      const s = { width: 20, height: 22, viewBox: "-11 -11 22 22", "aria-hidden": "true", style: { position: "absolute", left: 8, top: 6 } };
      if (k === 0)
        return (
          <svg {...s}>
            <polygon points="-9,-8 9,-8 0,10" fill={c.series2} stroke={c.text} stroke-width="1.2" stroke-linejoin="round" />
            <rect x="-10" y="-10" width="20" height="3" rx="1.5" fill={c.series5} />
            <circle cx="-3" cy="-4" r="1.8" fill={c.negative} />
            <circle cx="2.5" cy="-3" r="1.8" fill={c.negative} />
            <circle cx="0" cy="2" r="1.8" fill={c.negative} />
          </svg>
        );
      if (k === 1)
        return (
          <svg {...s}>
            <rect x="-7.4" y="-9.4" width="14.8" height="18.8" rx="3" fill={c.series1} stroke={c.text} stroke-width="1.2" />
            <circle cx="0" cy="2" r="4" fill={c.series2} />
          </svg>
        );
      if (k === 2)
        return (
          <svg {...s}>
            <polygon points="-8,-9 8,-9 5,10 -5,10" fill={c.series4} stroke={c.text} stroke-width="1.2" stroke-linejoin="round" />
            <line x1="-7.5" y1="-5" x2="7.5" y2="-5" stroke={c.onPrimary} stroke-width="2" />
          </svg>
        );
      return (
        <svg {...s}>
          <rect x="-7.4" y="-7.4" width="14.8" height="14.8" rx="4" fill={mix(c.series1, c.onPrimary, 0.72)} stroke={c.text} stroke-width="1.2" />
          <line x1="-3" y1="-4" x2="2" y2="-4" stroke={c.onPrimary} stroke-width="2" stroke-linecap="round" />
        </svg>
      );
    };

    const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
    const lw = narrow ? 90 : 96;
    const seg = (label: string, opts: string[], sel: number, on: ((i: number) => void) | null) => (
      <div style={{ display: "flex", alignItems: "center", height: 36, width: "100%" }}>
        <span style={{ width: lw, flex: "none", paddingRight: 6, boxSizing: "border-box", fontSize: fs, lineHeight: "16px", color: c.secondaryText, ...ell }}>{label}</span>
        <div role="group" aria-label={label} style={{ flex: 1, minWidth: 0, display: "flex", height: 36, padding: 3, boxSizing: "border-box", borderRadius: 8, background: c.secondaryButton }}>
          {opts.map((o, i) => {
            const st = {
              flex: 1,
              minWidth: 0,
              height: 30,
              border: 0,
              margin: 0,
              padding: "0 4px",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              background: i === sel ? c.card : "transparent",
              boxShadow: i === sel ? `0 1px 1px ${c.divider}` : "none",
              color: i === sel ? c.text : mix(c.secondaryText, c.text, 0.4),
              fontSize: 13,
              lineHeight: "16px",
              fontWeight: 600,
              transition: "background 200ms, color 200ms",
            } as const;
            return on ? (
              <button key={o} type="button" class="hb-seg" aria-pressed={i === sel} style={st} onClick={() => i !== sel && on(i)}>
                <span style={ell}>{o}</span>
              </button>
            ) : (
              <span key={o} style={st}>
                <span style={ell}>{o}</span>
              </span>
            );
          })}
        </div>
      </div>
    );

    // ---- bottom row
    const guestFaces: Member[] = state.guests.map((g) => ({ id: `guest:${g}`, name: g }));
    const doorFaces = [...chatGoing, ...guestFaces].slice(0, Math.min(narrow ? 4 : 8, t.names));
    const rest = t.names - doorFaces.length;
    const trimTo = !locked && over ? trimTarget(state) : null;
    let bottomRow;
    if (locked) {
      bottomRow = (
        <div key={`l${state.lockedAt}`} class="hb-rise" style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 6px 0 12px", borderRadius: 12, background: c.wash }}>
          <Facepile users={doorFaces} max={doorFaces.length} size={22} />
          {rest > 0 ? <span style={{ flex: "none", fontSize: 13, fontWeight: 600, color: c.secondaryText }}>{`+${rest}`}</span> : null}
          <span style={{ flex: 1, minWidth: 0, textAlign: "right", fontSize: 13, lineHeight: "16px", color: mix(c.positive, c.text, 0.15), ...ell }}>
            {isCo ? `Sent to ${state.door}` : `Sent to ${state.door} on the door`}
          </span>
          {isCo ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "reopen" })}>
              Reopen
            </Button>
          ) : null}
        </div>
      );
    } else if (!isCo) {
      bottomRow = <div style={{ height: 44, display: "flex", alignItems: "center" }}>{seg("You", ANSWERS.map((x) => x[1]), ANSWERS.findIndex((x) => x[0] === mine), (i) => dispatch({ t: "rsvp", v: ANSWERS[i]![0] }))}</div>;
    } else if (!over) {
      bottomRow = (
        <div style={{ height: 44, display: "flex", alignItems: "center" }}>
          <Button
            kind="primary"
            wide
            onClick={() => {
              haptic("success");
              dispatch({ t: "lock" });
            }}
          >
            {`Lock ${t.names} names`}
          </Button>
        </div>
      );
    } else if (trimTo) {
      bottomRow = (
        <div style={{ height: 44, display: "flex", alignItems: "center" }}>
          <Button kind="secondary" wide onClick={() => dispatch({ t: "trim" })}>
            {`Trim ${t.heads - state.cap} heads`}
          </Button>
        </div>
      );
    } else {
      bottomRow = (
        <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: c.secondaryButton }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: c.text, ...ell }}>{`${t.heads - state.cap} over cap even with no plus-ones`}</span>
        </div>
      );
    }

    const confirmedNames = tally(confirmed).names;
    const toast = confirmed.lockedAt > 1 && running(confirmed.lockedAt, 2400) !== null ? `Door list locked · ${confirmedNames} names` : null;
    const hostLine = state.host === null ? state.title : state.host === me ? `${state.title} · you're hosting` : `${state.title} · ${nameOf(state.host)} is hosting`;
    const legend: [string, string][] = [
      [`${t.going} going`, kindCol[0]!],
      [`${t.plusOnes} plus-ones`, kindCol[1]!],
      [`${t.shows} maybes show`, kindCol[2]!],
    ];
    const verdict = over ? `${t.heads - state.cap} spill out the door` : `Fits · ${state.cap - t.heads} to spare`;
    const pictureLabel = `House with ${t.heads} heads, cap ${state.cap}: ${t.going} going, ${t.plusOnes} plus-ones, ${t.shows} maybes${over ? `, ${t.heads - state.cap} spill out the door` : ""}`;

    return (
      <div>
        <style>
          {".hb-seg::after{content:'';position:absolute;left:0;right:0;top:-7px;bottom:-7px}" +
            "@keyframes hbBump{0%{transform:scale(1.08)}100%{transform:scale(1)}}" +
            "@keyframes hbRise{0%{transform:translateY(12px);opacity:0}100%{transform:none;opacity:1}}" +
            ".hb-bump{animation:hbBump 300ms cubic-bezier(.34,1.56,.64,1) both}.hb-rise{animation:hbRise 400ms cubic-bezier(.34,1.56,.64,1) both}" +
            "@media (prefers-reduced-motion:reduce){.hb-bump,.hb-rise{animation:none}}"}
        </style>
        <div style={{ height: 44, overflow: "hidden" }}>
          <CardHeader title={hostLine} subtitle={`${state.when ? state.when + " · " : ""}${t.going} going · ${t.maybe} maybe`} />
        </div>
        <div style={{ height: 6 }} />
        <div role="img" aria-label={pictureLabel} style={{ position: "relative", height: H, borderRadius: 12, background: c.wash, overflow: "hidden" }}>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, display: "block" }}>
            {art}
          </svg>
          {faces
            .filter((f) => f.i < shown)
            .map((f) => {
              const [x, y] = slot(f.i);
              return (
                <span key={f.m.id} aria-hidden="true" style={{ position: "absolute", left: x - av / 2, top: y - av / 2, width: av, height: av, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 1.5px ${f.i < t.going ? c.series3 : c.series2}` }}>
                  <Avatar user={f.m} size={av} />
                </span>
              );
            })}
          <div aria-hidden="true" style={{ position: "absolute", left: sx, right: 8, top: 0, bottom: 0 }}>
            <div style={{ position: "absolute", top: 8, left: 0, right: 0, fontSize: 36, lineHeight: "40px", fontWeight: 700, color: over ? mix(c.negative, c.text, 0.1) : c.text, fontVariantNumeric: "tabular-nums" }}>{shown}</div>
            <div style={{ position: "absolute", top: 50, left: 0, right: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{`Heads · cap ~${state.cap}`}</div>
            {legend.map(([txt, col], k) => (
              <div key={k} style={{ position: "absolute", top: 69 + k * 19, left: 0, right: 0, height: 18, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: "none", width: 10, height: 10, borderRadius: 5, background: col }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: fs, lineHeight: "16px", color: c.text, ...ell }}>{txt}</span>
              </div>
            ))}
            <div style={{ position: "absolute", top: 130, left: 0, right: 0, fontSize: fs, lineHeight: "16px", fontWeight: 600, color: mix(over ? c.negative : c.positive, c.text, 0.15), ...ell }}>{verdict}</div>
          </div>
        </div>
        <div style={{ height: 8 }} />
        {seg("Plus-ones", PLUS, state.plus, canEdit ? (i) => dispatch({ t: "plus", i }) : null)}
        <div style={{ height: 6 }} />
        {seg("Maybes show", RATE, state.rate, canEdit ? (i) => dispatch({ t: "rate", i }) : null)}
        <div style={{ height: 8 }} />
        <div style={{ display: "flex", gap: 6, height: 50 }}>
          {snacks.map(([n, lbl], k) => {
            const f = fitText(lbl, cardW - 16, { size: 13, min: 10 });
            return (
              <div
                key={`${state.changedAt}-${k}`}
                class={state.changedAt > 0 ? "hb-bump" : ""}
                style={{ position: "relative", flex: 1, minWidth: 0, height: 50, borderRadius: 12, background: c.wash, animationDelay: `${k * 50}ms` }}
              >
                {icon(k)}
                <span style={{ position: "absolute", left: 32, right: 4, top: 4, fontSize: 20, lineHeight: "26px", fontWeight: 600, color: c.text, ...ell }}>{n}</span>
                <span style={{ position: "absolute", left: 8, right: 4, top: 30, fontSize: f.size, lineHeight: "16px", color: c.secondaryText, ...ell }}>{f.text}</span>
              </div>
            );
          })}
        </div>
        <div style={{ height: 6 }} />
        {bottomRow}
        {toast ? <Toast key={confirmed.lockedAt}>{toast}</Toast> : null}
      </div>
    );
  },
});
