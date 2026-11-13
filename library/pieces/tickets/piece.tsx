import { defineApp, Avatar, Button, CardHeader, OptionRow, SystemLine, running, spring, springs } from "@muse/app";

// Group ticket buy: the group votes on a tier, people say they're in, and one person covers the
// order. When they buy, everyone who's in gets a seat in one block together, and each owes the
// buyer their seat: the ticket, its fees and a share of the order fee, in integer cents. The order
// fee splits evenly across the seats; the first seats in the block pay the leftover cents.

type Params = {
  /** Card title, the show or game: "SZA at Chase Center" */
  title: string;
  /** Who is covering the order, exactly as in the members list. Empty: the first person in the chat. */
  buyer: string;
  /** Tiers from the chat. cents: face price per ticket; feeCents: fees per ticket ($16.75 -> 1675). */
  tiers: { name: string; cents: number; feeCents: number }[];
  /** One fee per order, split across the seats ($8.50 -> 850). 0 if none. */
  orderFeeCents: number;
  /** Most tickets one order can hold (the site's limit), 1 to 10. */
  limit: number;
};

// @params
const P: Params = {
  title: "SZA at Chase Center",
  buyer: "Priya",
  tiers: [
    { name: "Upper 200s", cents: 8900, feeCents: 1675 },
    { name: "Lower bowl", cents: 12900, feeCents: 2240 },
    { name: "Floor", cents: 18900, feeCents: 3150 },
  ],
  orderFeeCents: 850,
  limit: 6,
};
// @end params

type Tier = { id: string; name: string; cents: number; fee: number; votes: string[] };
/** wait: after the buy, people who would take a seat if one frees up. */
/** seats: who holds each ticket in the block, null for a spare the buyer covers. at: when it was bought. */
type Bought = { tier: string; seats: (string | null)[]; at: number };
type State = { title: string; buyer: string; tiers: Tier[]; orderFee: number; limit: number; in: string[]; bought: Bought | null; paid: string[]; wait: string[] };
type Action = { t: "vote"; tier: string } | { t: "in" } | { t: "buy" } | { t: "paid"; user: string } | { t: "claim" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name?: string }[] };

const MAX_CENTS = 1_000_000;
const MAX_TIERS = 4;
const POP_MS = 900;
const pop = spring(springs.iosBouncy);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

// ---- Reducer side ----

/** The tier with the most votes; ties go to the cheaper one, then the first listed. */
function leading(s: State): Tier | undefined {
  let best: Tier | undefined;
  for (const t of s.tiers) if (!best || t.votes.length > best.votes.length || (t.votes.length === best.votes.length && t.cents + t.fee < best.cents + best.fee)) best = t;
  return best;
}

function reduceTickets(s: State, a: Record<string, unknown>, user: string, time: number): State {
  switch (a.t) {
    case "vote": {
      const tier = s.tiers.find((t) => t.id === a.tier);
      if (!tier || s.bought) return s;
      const had = tier.votes.includes(user);
      return { ...s, tiers: s.tiers.map((t) => ({ ...t, votes: t.id === tier.id ? (had ? t.votes.filter((u) => u !== user) : [...t.votes, user]) : t.votes.filter((u) => u !== user) })) };
    }
    case "in": {
      if (s.bought) {
        if (s.bought.seats.includes(user) || s.bought.seats.includes(null)) return s;
        return { ...s, wait: s.wait.includes(user) ? s.wait.filter((u) => u !== user) : [...s.wait, user] };
      }
      if (user === s.buyer) return s;
      if (s.in.includes(user)) return { ...s, in: s.in.filter((u) => u !== user) };
      if (s.in.length >= s.limit) return s;
      return { ...s, in: [...s.in, user] };
    }
    case "buy": {
      const tier = leading(s);
      if (s.bought || user !== s.buyer || !tier || s.in.length === 0) return s;
      return { ...s, bought: { tier: tier.id, seats: [...s.in], at: time } };
    }
    case "paid": {
      const who = a.user;
      if (!s.bought || typeof who !== "string" || who === s.buyer || s.paid.includes(who) || !s.bought.seats.includes(who)) return s;
      if (user !== who && user !== s.buyer) return s;
      return { ...s, paid: [...s.paid, who] };
    }
    case "claim": {
      if (!s.bought || s.bought.seats.includes(user)) return s;
      const i = s.bought.seats.indexOf(null);
      if (i < 0) return s;
      return { ...s, bought: { ...s.bought, seats: s.bought.seats.map((x, j) => (j === i ? user : x)) }, wait: s.wait.filter((u) => u !== user) };
    }
  }
  return s;
}

// ---- Check side ----

const tierOf = (s: State) => s.tiers.find((t) => t.id === s.bought?.tier);
/** What each seat costs in the bought block: ticket, fees, and its part of the order fee. */
function seatCosts(s: State): number[] {
  const t = tierOf(s);
  if (!s.bought || !t) return [];
  const n = s.bought.seats.length;
  return s.bought.seats.map((_, i) => t.cents + t.fee + Math.floor(s.orderFee / n) + (i < s.orderFee % n ? 1 : 0));
}
const orderTotal = (s: State) => {
  const t = tierOf(s);
  return s.bought && t ? s.bought.seats.length * (t.cents + t.fee) + s.orderFee : 0;
};
/** What each person owes the buyer; the buyer's own seat and the spares are on them. */
function owes(s: State): Record<string, number> {
  const out: Record<string, number> = {};
  const cost = seatCosts(s);
  s.bought?.seats.forEach((u, i) => {
    const who = u === null ? s.buyer : u;
    out[who] = (out[who] ?? 0) + cost[i]!;
  });
  return out;
}
const voteOf = (s: State, u: string) => s.tiers.find((t) => t.votes.includes(u))?.id ?? null;

export default defineApp<State, Action, Local>({
  name: "Tickets",
  summary: (s) => {
    const t = tierOf(s);
    if (s.bought && t) return `${s.title}: ${s.bought.seats.length} ${t.name} seats together, ${s.paid.length} paid back.`;
    return `${s.title}: ${s.in.length + 1} in.`;
  },

  init: (ctx) => {
    const want = P.buyer.trim().toLowerCase();
    const buyer = ctx.members.find((m) => m.id === P.buyer || m.name.toLowerCase() === want)?.id ?? ctx.members[0]?.id ?? "";
    const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_CENTS;
    const tiers: Tier[] = P.tiers
      .filter((t) => t.name.trim() && ok(t.cents) && t.cents > 0 && ok(t.feeCents))
      .slice(0, MAX_TIERS)
      .map((t, i) => ({ id: `t${i}`, name: t.name.trim().slice(0, 24), cents: t.cents, fee: t.feeCents, votes: [] }));
    return {
      title: P.title.trim().slice(0, 60) || "Tickets",
      buyer,
      tiers: tiers.length ? tiers : [{ id: "t0", name: "General", cents: 5000, fee: 0, votes: [] }],
      orderFee: ok(P.orderFeeCents) ? P.orderFeeCents : 0,
      limit: Math.max(1, Math.min(10, Math.floor(P.limit) || 4)),
      in: buyer ? [buyer] : [],
      bought: null,
      paid: [],
      wait: [],
    };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceTickets(state, action as unknown as Record<string, unknown>, meta.user, meta.time) : state),

  // Someone left: their vote goes, and they are out; after the buy their seat becomes a spare the
  // buyer covers, which someone who joins later can claim. If the buyer left, the first person
  // in the chat covers the order.
  onMembers: (state, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    const buyer = here(state.buyer) ? state.buyer : (ctx.members[0]?.id ?? "");
    const tiers = state.tiers.map((t) => (t.votes.every(here) ? t : { ...t, votes: t.votes.filter(here) }));
    const kept = state.in.filter(here);
    const inList = state.bought || !buyer || kept.includes(buyer) ? kept : [buyer, ...kept].slice(0, state.limit);
    // Freed seats go to the people waiting, in the order they asked.
    const wait = state.wait.filter(here);
    const bought = state.bought && { ...state.bought, seats: state.bought.seats.map((u) => (u !== null && here(u) ? u : (wait.shift() ?? null))) };
    return { ...state, buyer, tiers, in: inList, bought, paid: state.paid.filter((u) => here(u) && u !== buyer), wait };
  },

  invariants: {
    "seat costs add up to the order total": (s) => seatCosts(s).reduce((a, c) => a + c, 0) === orderTotal(s),
    "what people owe adds up to the order total": (s) => Object.values(owes(s)).reduce((a, c) => a + c, 0) === orderTotal(s),
    "seat costs differ by at most one cent": (s) => {
      const c = seatCosts(s);
      return c.length === 0 || Math.max(...c) - Math.min(...c) <= 1;
    },
    "one vote per person": (s) => {
      const all = s.tiers.flatMap((t) => t.votes);
      return new Set(all).size === all.length;
    },
    "before the buy, the buyer is in and the order fits": (s) => s.bought !== null || ((s.buyer === "" || s.in.includes(s.buyer)) && s.in.length <= s.limit && new Set(s.in).size === s.in.length),
    "a bought block has a seat for each person who was in, each person once": (s) => {
      if (!s.bought) return s.paid.length === 0;
      const held = s.bought.seats.filter((u) => u !== null);
      return s.bought.seats.length >= 1 && s.bought.seats.length <= s.limit && new Set(held).size === held.length && !!tierOf(s);
    },
    "people wait only after the buy, when there is no spare, without a seat": (s) =>
      new Set(s.wait).size === s.wait.length && (s.wait.length === 0 || (!!s.bought && !s.bought.seats.includes(null) && s.wait.every((u) => !s.bought!.seats.includes(u)))),
    "people who paid back hold a seat and are not the buyer": (s) => s.paid.every((u) => u !== s.buyer && !!s.bought?.seats.includes(u)) && new Set(s.paid).size === s.paid.length,
    "everyone in it is in the chat": (s, ctx) =>
      (s.buyer === "" ? ctx.members.length === 0 : inChat(ctx, s.buyer)) &&
      [...s.in, ...s.paid, ...s.wait, ...s.tiers.flatMap((t) => t.votes), ...(s.bought?.seats ?? []).filter((u): u is string => u !== null)].every((u) => inChat(ctx, u)),
  },

  transitions: {
    "a vote moves only the voter's vote": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const before = voteOf(p, m.user), after = voteOf(n, m.user);
      return !p.bought && (after === a.tier ? before !== a.tier : before === a.tier && after === null) && p.tiers.every((t, i) => JSON.stringify(t.votes.filter((u) => u !== m.user)) === JSON.stringify(n.tiers[i]!.votes.filter((u) => u !== m.user)));
    },
    "after the buy, asking for a seat flips only the actor on the wait list": (p, n, a, m) => {
      if (a.t !== "in" || p === n || !p.bought) return true;
      const rest = (x: State) => x.wait.filter((u) => u !== m.user).join();
      return p.wait.includes(m.user) !== n.wait.includes(m.user) && rest(p) === rest(n) && JSON.stringify(p.bought) === JSON.stringify(n.bought);
    },
    "in or out flips only the actor, never the buyer, before the buy": (p, n, a, m) => {
      if (a.t !== "in" || p === n || p.bought) return true;
      const rest = (x: State) => x.in.filter((u) => u !== m.user).join();
      return !p.bought && m.user !== p.buyer && p.in.includes(m.user) !== n.in.includes(m.user) && rest(p) === rest(n) && n.in.length <= p.limit;
    },
    "only the buyer buys, the leading tier, a seat for everyone in": (p, n, a, m) => {
      if (a.t !== "buy" || p === n) return true;
      const top = Math.max(...p.tiers.map((t) => t.votes.length));
      const tier = p.tiers.find((t) => t.id === n.bought?.tier);
      const cheapest = Math.min(...p.tiers.filter((t) => t.votes.length === top).map((t) => t.cents + t.fee));
      return !p.bought && m.user === p.buyer && !!tier && tier.votes.length === top && tier.cents + tier.fee === cheapest && JSON.stringify(n.bought!.seats) === JSON.stringify(p.in) && n.bought!.at === m.time;
    },
    "a payback marks that one seat holder, by themselves or the buyer": (p, n, a, m) => {
      if (a.t !== "paid" || p === n) return true;
      return n.paid.length === p.paid.length + 1 && n.paid.at(-1) === a.user && !!p.bought?.seats.includes(a.user) && (m.user === a.user || m.user === p.buyer);
    },
    "a claim puts the actor in the first spare seat": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const i = p.bought?.seats.indexOf(null) ?? -1;
      return i >= 0 && !p.bought!.seats.includes(m.user) && n.bought?.seats[i] === m.user && n.bought.seats.every((u, j) => j === i || u === p.bought!.seats[j]);
    },
    "the order setup never changes": (p, n) => p.title === n.title && p.orderFee === n.orderFee && p.limit === n.limit && p.tiers.map((t) => t.id + t.cents + t.fee).join() === n.tiers.map((t) => t.id + t.cents + t.fee).join(),
    "only people in the chat change the order": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const k = r.next();
    if (!s.bought) {
      if (user === s.buyer && k < 0.25) return { t: "buy" };
      if (k < 0.6) return { t: "vote", tier: r.pick(s.tiers).id };
      return { t: "in" };
    }
    if (k < 0.3) return { t: "claim" };
    if (k < 0.45) return { t: "in" };
    return { t: "paid", user: r.next() < 0.7 ? user : (r.pick(ctx.members)?.id ?? user) };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const isBuyer = me === state.buyer;
    const top = leading(state);
    const n = state.bought ? state.bought.seats.length : state.in.length;
    const each = (t: Tier | undefined, k: number) => (t && k ? t.cents + t.fee + Math.ceil(state.orderFee / k) : 0);
    const seats = state.bought ? state.bought.seats : [...state.in, ...Array.from({ length: Math.max(0, state.limit - state.in.length) }, () => null)];
    const e = state.bought ? running(state.bought.at, POP_MS + seats.length * 90) : null;
    const tier = tierOf(state);
    const unpaid = state.bought ? state.bought.seats.filter((u): u is string => u !== null && u !== state.buyer && !state.paid.includes(u)) : [];

    const seat = (u: string | null, i: number) => {
      const scale = e === null ? 1 : 0.4 + 0.6 * pop(Math.max(0, e - i * 90));
      const filled = u !== null;
      const label = filled ? nameOf(u) : state.bought ? "Spare" : "Open";
      const done = filled && state.bought !== null && state.paid.includes(u);
      return (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 40,
              height: 34,
              borderRadius: "10px 10px 6px 6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: filled ? theme.color.selected : theme.color.input,
              boxShadow: `inset 0 -4px 0 ${filled && state.bought ? (done ? theme.color.positive : theme.color.primary) : theme.color.divider}`,
              transform: `scale(${scale})`,
            }}
          >
            {filled ? <Avatar user={u} size={24} /> : null}
            {done ? (
              <svg width="14" height="14" viewBox="0 0 14 14" aria-label="Paid" style={{ position: "absolute", top: -4, right: -4 }}>
                <circle cx="7" cy="7" r="7" fill={theme.color.positive} />
                <path d="M4 7.2 6.1 9.2 10 5" fill="none" stroke={theme.color.onPrimary} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            ) : null}
          </div>
          <small style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</small>
        </div>
      );
    };

    return (
      <div>
        <CardHeader
          title={state.title}
          subtitle={state.bought && tier ? `${tier.name} · ${money(orderTotal(state))} on ${nameOf(state.buyer).replace("You", "your")}${state.buyer === me ? "" : "'s"} card` : `${nameOf(state.buyer)} ${isBuyer ? "are" : "is"} covering the order`}
        />
        {state.bought ? null : (
          <div>
            {state.tiers.map((t) => (
              <OptionRow
                key={t.id}
                label={`${t.name} · ${money(t.cents + t.fee)}`}
                count={t.votes.length}
                total={Math.max(1, members.length)}
                voters={t.votes}
                selected={t.votes.includes(me)}
                onClick={() => dispatch({ t: "vote", tier: t.id })}
              />
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${seats.length}, minmax(0, 56px))`, justifyContent: "center", gap: 4, margin: "10px 0 4px" }} aria-label={n === 1 ? "1 seat" : `${n} seats together`}>
          {seats.map(seat)}
        </div>
        <SystemLine>
          {state.bought && tier
            ? e !== null
              ? (n === 1 ? "1 seat" : `${n} seats together`)
              : `${n === 1 ? "1 seat" : `${n} seats together`} · ${money(seatCosts(state)[0] ?? 0)} each${state.wait.length ? ` · ${state.wait.length} waiting` : ""}`
            : top
              ? `${n} in · about ${money(each(top, n))} each for ${top.name}`
              : `${n} in`}
        </SystemLine>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {!state.bought ? (
            isBuyer ? (
              <Button kind="primary" wide disabled={!top} onClick={() => dispatch({ t: "buy" })}>
                {`Buy ${n}`}
              </Button>
            ) : (
              <Button kind={state.in.includes(me) ? "secondary" : "primary"} wide disabled={!state.in.includes(me) && state.in.length >= state.limit} onClick={() => dispatch({ t: "in" })}>
                {state.in.includes(me) ? "I'm out" : "I'm in"}
              </Button>
            )
          ) : !state.bought.seats.includes(me) && state.bought.seats.includes(null) ? (
            <Button kind="primary" wide onClick={() => dispatch({ t: "claim" })}>
              Take spare
            </Button>
          ) : !state.bought.seats.includes(me) ? (
            <Button kind={state.wait.includes(me) ? "secondary" : "primary"} wide onClick={() => dispatch({ t: "in" })}>
              {state.wait.includes(me) ? "Stop waiting" : "Want one"}
            </Button>
          ) : unpaid.includes(me) ? (
            <Button kind="primary" wide onClick={() => dispatch({ t: "paid", user: me })}>
              I paid
            </Button>
          ) : isBuyer && unpaid.length ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
              <small style={{ flex: 1 }}>{`${unpaid.length} to pay you back`}</small>
              <Button onClick={() => dispatch({ t: "paid", user: unpaid[0]! })}>{`${nameOf(unpaid[0]!)} paid`}</Button>
            </div>
          ) : (
            <SystemLine>{unpaid.length ? `${unpaid.length} still to pay ${nameOf(state.buyer)}` : state.bought.seats.some((u) => u !== null && u !== state.buyer) ? "Everyone paid back" : "Only one ticket so far"}</SystemLine>
          )}
        </div>
      </div>
    );
  },
});
