import { defineApp, Avatar, Button, CardHeader, OptionRow } from "@muse/app";

const CHAT = {
  title: "What pizzas should we order?",
  when: "7:30 at Hana's",
  toppings: ["Margherita", "Pepperoni", "Sausage and peppers", "Buffalo chicken", "Pepperoni and jalapeno"],
  priceCents: 4500,
  codeCents: 2000,
  codeFrom: "Hana",
};

type Topping = { id: string; label: string; voters: string[] };
type State = {
  title: string;
  toppings: Topping[];
  pieVotes: { two: string[]; three: string[] };
  payer: string | null;
  priceCents: number;
  codeCents: number;
};
type Action = { t: "vote"; option: string } | { t: "pies"; count: number } | { t: "pay" };
type Local = Record<string, never>;
type CtxLike = { members: { id: string }[] };

const inChat = (ctx: CtxLike, id: string) => ctx.members.some((m) => m.id === id);
const strip = (xs: string[], u: string) => xs.filter((x) => x !== u).join();
const topKey = (s: State, u: string) => s.toppings.map((t) => `${t.id}:${t.label}:${strip(t.voters, u)}`).join("|");
const pieKey = (s: State, u: string) => `${strip(s.pieVotes.two, u)}/${strip(s.pieVotes.three, u)}`;
const votedFor = (s: State, option: unknown, u: string) => s.toppings.some((t) => t.id === option && t.voters.includes(u));
const mineOf = (s: State, u: string) => s.toppings.filter((t) => t.voters.includes(u)).map((t) => t.id);
const voterCount = (s: State) => new Set(s.toppings.flatMap((t) => t.voters)).size;
const money = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const dollars = (c: number) => (c % 100 === 0 ? `$${c / 100}` : money(c));

export default defineApp<State, Action, Local>({
  name: "Pizza order",
  summary: (s, ctx) => {
    const top = [...s.toppings].sort((a, b) => b.voters.length - a.voters.length)[0];
    const payer = s.payer ? ctx.members.find((m) => m.id === s.payer)?.name : undefined;
    const lead = top && top.voters.length > 0 ? `${top.label} leads with ${top.voters.length}.` : "No topping votes yet.";
    return `${s.title} ${lead} ${s.pieVotes.two.length} for 2 pies, ${s.pieVotes.three.length} for 3.${payer ? ` ${payer} is paying.` : " No one is paying yet."}`;
  },

  init: () => ({
    title: CHAT.title,
    toppings: CHAT.toppings.map((label, i) => ({ id: `p${i}`, label, voters: [] })),
    pieVotes: { two: [], three: [] },
    payer: null,
    priceCents: CHAT.priceCents,
    codeCents: CHAT.codeCents,
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    const u = meta.user;
    if (action.t === "vote") {
      if (typeof action.option !== "string") return state;
      const target = state.toppings.find((t) => t.id === action.option);
      if (!target) return state;
      return {
        ...state,
        toppings: state.toppings.map((t) =>
          t.id !== target.id ? t : { ...t, voters: t.voters.includes(u) ? t.voters.filter((v) => v !== u) : [...t.voters, u] },
        ),
      };
    }
    if (action.t === "pies") {
      if (action.count !== 2 && action.count !== 3) return state;
      const had = (action.count === 2 ? state.pieVotes.two : state.pieVotes.three).includes(u);
      const two = state.pieVotes.two.filter((v) => v !== u);
      const three = state.pieVotes.three.filter((v) => v !== u);
      if (had) return { ...state, pieVotes: { two, three } };
      return { ...state, pieVotes: action.count === 2 ? { two: [...two, u], three } : { two, three: [...three, u] } };
    }
    if (action.t === "pay") {
      if (state.payer === null) return { ...state, payer: u };
      if (state.payer === u) return { ...state, payer: null };
      return state;
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const ok = (v: string) => inChat(ctx, v);
    const clean =
      state.toppings.every((t) => t.voters.every(ok)) &&
      state.pieVotes.two.every(ok) &&
      state.pieVotes.three.every(ok) &&
      (state.payer === null || ok(state.payer));
    if (clean) return state;
    return {
      ...state,
      toppings: state.toppings.map((t) => ({ ...t, voters: t.voters.filter(ok) })),
      pieVotes: { two: state.pieVotes.two.filter(ok), three: state.pieVotes.three.filter(ok) },
      payer: state.payer !== null && ok(state.payer) ? state.payer : null,
    };
  },

  invariants: {
    "no one votes twice for a topping": (s) => s.toppings.every((t) => new Set(t.voters).size === t.voters.length),
    "no one is in both pie lists or twice in one": (s) => {
      const all = [...s.pieVotes.two, ...s.pieVotes.three];
      return new Set(all).size === all.length;
    },
    "voters and the payer are in the chat": (s, ctx) =>
      s.toppings.every((t) => t.voters.every((v) => inChat(ctx, v))) &&
      s.pieVotes.two.every((v) => inChat(ctx, v)) &&
      s.pieVotes.three.every((v) => inChat(ctx, v)) &&
      (s.payer === null || inChat(ctx, s.payer)),
    "there are exactly the five toppings from the chat": (s) =>
      s.toppings.length === CHAT.toppings.length &&
      s.toppings.every((t, i) => t.id === `p${i}` && t.label === CHAT.toppings[i]),
    "price and code never change": (s) => s.priceCents === CHAT.priceCents && s.codeCents === CHAT.codeCents && s.title === CHAT.title,
  },

  transitions: {
    "a vote flips the actor's vote on that topping and nothing else": (p, n, a, m) =>
      a.t !== "vote" ||
      p === n ||
      (votedFor(p, a.option, m.user) !== votedFor(n, a.option, m.user) &&
        topKey(p, m.user) === topKey(n, m.user) &&
        pieKey(p, m.user) === pieKey(n, m.user) &&
        p.payer === n.payer &&
        mineOf(p, m.user).filter((x) => x !== a.option).join() === mineOf(n, m.user).filter((x) => x !== a.option).join()),
    "a pies vote puts the actor on that count only, or clears it on a repeat": (p, n, a, m) => {
      if (a.t !== "pies" || p === n) return true;
      const had = (a.count === 2 ? p.pieVotes.two : p.pieVotes.three).includes(m.user);
      const inTwo = n.pieVotes.two.includes(m.user);
      const inThree = n.pieVotes.three.includes(m.user);
      const right = had ? !inTwo && !inThree : a.count === 2 ? inTwo && !inThree : inThree && !inTwo;
      return (
        (a.count === 2 || a.count === 3) &&
        right &&
        pieKey(p, m.user) === pieKey(n, m.user) &&
        JSON.stringify(p.toppings) === JSON.stringify(n.toppings) &&
        p.payer === n.payer
      );
    },
    "paying takes a free spot for the actor or releases the actor's own": (p, n, a, m) =>
      a.t !== "pay" ||
      p === n ||
      (((p.payer === null && n.payer === m.user) || (p.payer === m.user && n.payer === null)) &&
        JSON.stringify(p.toppings) === JSON.stringify(n.toppings) &&
        JSON.stringify(p.pieVotes) === JSON.stringify(n.pieVotes)),
    "only the current payer can clear or change the payer": (p, n, a, m) =>
      p === n || p.payer === null || n.payer === p.payer || (a.t === "pay" && p.payer === m.user),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    const k = r.next();
    if (k < 0.5) return { t: "vote", option: r.pick(s.toppings).id };
    if (k < 0.85) return { t: "pies", count: r.pick([2, 3, 3, 2, 5]) };
    return { t: "pay" };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const voted = voterCount(state);
    const total = Math.max(1, members.length);
    const nameOf = (id: string) => (id === me ? "You" : (members.find((x) => x.id === id)?.name ?? "Someone"));
    const inTwo = state.pieVotes.two.includes(me);
    const inThree = state.pieVotes.three.includes(me);
    const after = state.priceCents - state.codeCents;
    const each = members.length ? Math.floor(after / members.length) : 0;
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${voted} of ${members.length} voted · ${CHAT.when}`} />
        <div style={{ display: "grid", gap: 2 }}>
          {state.toppings.map((t) => (
            <OptionRow
              key={t.id}
              label={t.label}
              count={t.voters.length}
              total={total}
              voters={t.voters}
              selected={t.voters.includes(me)}
              onClick={() => dispatch({ t: "vote", option: t.id })}
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <Button kind={inTwo ? "secondary" : "deemphasized"} onClick={() => dispatch({ t: "pies", count: 2 })}>
            Two pies
          </Button>
          <small style={{ minWidth: 14 }}>{state.pieVotes.two.length}</small>
          <Button kind={inThree ? "secondary" : "deemphasized"} onClick={() => dispatch({ t: "pies", count: 3 })}>
            Three pies
          </Button>
          <small>{state.pieVotes.three.length}</small>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, minHeight: 44 }}>
          {state.payer ? <Avatar user={state.payer} size={28} /> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>
              {state.payer ? (state.payer === me ? "You're paying" : `${nameOf(state.payer)} is paying`) : "No one is paying yet"}
            </div>
            <small>{`${dollars(after)} after code · ${money(each)} each`}</small>
          </div>
          {state.payer === null ? (
            <Button kind="primary" onClick={() => dispatch({ t: "pay" })}>
              I pay
            </Button>
          ) : state.payer === me ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "pay" })}>
              Undo
            </Button>
          ) : null}
        </div>
      </div>
    );
  },
});
