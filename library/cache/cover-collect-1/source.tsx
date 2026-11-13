import { defineApp, Avatar, Button, CardHeader } from "@muse/app";

// Who has paid the Venmo for the house show, and who still owes. Each person marks their own
// spots paid. Lily covers two spots (herself and her roommate).

const P = {
  title: "Pink house show · who paid",
  priceCents: 800,
  venmo: "@pinkhouse-tix",
  deadline: "Thursday night",
  spots: [{ name: "Lily", spots: 2 }],
  paid: ["Wren", "Owen"],
};

type State = {
  title: string;
  price: number;
  venmo: string;
  deadline: string;
  spots: Record<string, number>;
  paid: string[];
};
type Action = { t: "markPaid" } | { t: "markUnpaid" } | { t: "setSpots"; n: number };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name: string }[] };

const MAX_SPOTS = 4;
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const spotsOf = (s: State, id: string) => s.spots[id] ?? 1;
const owedBy = (s: State, id: string) => spotsOf(s, id) * s.price;
const total = (s: State, ctx: Ctx) => ctx.members.reduce((n, m) => n + owedBy(s, m.id), 0);
const collected = (s: State, ctx: Ctx) => ctx.members.filter((m) => s.paid.includes(m.id)).reduce((n, m) => n + owedBy(s, m.id), 0);
const stillOwed = (s: State, ctx: Ctx) => ctx.members.filter((m) => !s.paid.includes(m.id)).reduce((n, m) => n + owedBy(s, m.id), 0);
const paidCount = (s: State, ctx: Ctx) => ctx.members.filter((m) => s.paid.includes(m.id)).length;
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);

const sameSpots = (a: Record<string, number>, b: Record<string, number>) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const without = (r: Record<string, number>, id: string) => {
  const out: Record<string, number> = {};
  for (const k of Object.keys(r)) if (k !== id) out[k] = r[k]!;
  return out;
};
const byName = (ctx: Ctx, name: string) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;

export default defineApp<State, Action, Local>({
  name: "Paid list",
  summary: (s, ctx) => `${s.title}: ${paidCount(s, ctx)} of ${ctx.members.length} paid, ${money(stillOwed(s, ctx))} still owed.`,

  init: (ctx) => {
    const spots: Record<string, number> = {};
    for (const e of P.spots) {
      const id = byName(ctx, e.name);
      if (id && Number.isInteger(e.spots) && e.spots >= 1 && e.spots <= MAX_SPOTS) spots[id] = e.spots;
    }
    const paid: string[] = [];
    for (const name of P.paid) {
      const id = byName(ctx, name);
      if (id && !paid.includes(id)) paid.push(id);
    }
    return { title: P.title, price: P.priceCents, venmo: P.venmo, deadline: P.deadline, spots, paid };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "markPaid") {
      if (state.paid.includes(meta.user)) return state;
      return { ...state, paid: [...state.paid, meta.user] };
    }
    if (action.t === "markUnpaid") {
      if (!state.paid.includes(meta.user)) return state;
      return { ...state, paid: state.paid.filter((x) => x !== meta.user) };
    }
    if (action.t === "setSpots") {
      const n = action.n;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_SPOTS) return state;
      if (state.paid.includes(meta.user) || n === spotsOf(state, meta.user)) return state;
      return { ...state, spots: { ...state.spots, [meta.user]: n } };
    }
    return state;
  },

  // Someone left: their payment and spots go with them.
  onMembers: (state, ctx) => {
    const spotsOk = Object.keys(state.spots).every((k) => inChat(ctx, k));
    const paidOk = state.paid.every((x) => inChat(ctx, x));
    if (spotsOk && paidOk) return state;
    const spots: Record<string, number> = {};
    for (const k of Object.keys(state.spots)) if (inChat(ctx, k)) spots[k] = state.spots[k]!;
    return { ...state, spots, paid: state.paid.filter((x) => inChat(ctx, x)) };
  },

  invariants: {
    "no one is in the paid list twice": (s) => new Set(s.paid).size === s.paid.length,
    "everyone who paid is in the chat": (s, ctx) => s.paid.every((x) => inChat(ctx, x)),
    "spots belong to people in the chat, each 1 to 4": (s, ctx) =>
      Object.keys(s.spots).every((k) => inChat(ctx, k) && Number.isInteger(s.spots[k]) && s.spots[k]! >= 1 && s.spots[k]! <= MAX_SPOTS),
    "paid plus still owed equals every spot times the price": (s, ctx) =>
      collected(s, ctx) + stillOwed(s, ctx) === total(s, ctx) &&
      total(s, ctx) === ctx.members.reduce((n, m) => n + spotsOf(s, m.id), 0) * s.price,
    "the price is a positive whole number of cents": (s) => Number.isInteger(s.price) && s.price > 0,
  },

  transitions: {
    "marking paid adds the actor to the paid list and changes nothing else": (p, n, a, m) =>
      a.t !== "markPaid" ||
      p === n ||
      (!p.paid.includes(m.user) && n.paid.join() === [...p.paid, m.user].join() && sameSpots(p.spots, n.spots) && p.price === n.price),
    "undoing removes only the actor from the paid list": (p, n, a, m) =>
      a.t !== "markUnpaid" ||
      p === n ||
      (p.paid.includes(m.user) && n.paid.join() === p.paid.filter((x) => x !== m.user).join() && sameSpots(p.spots, n.spots)),
    "setting spots changes only the actor's own spots, and only before they paid": (p, n, a, m) =>
      a.t !== "setSpots" ||
      p === n ||
      (!p.paid.includes(m.user) &&
        n.spots[m.user] === a.n &&
        sameSpots(without(p.spots, m.user), without(n.spots, m.user)) &&
        p.paid.join() === n.paid.join()),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "the price and the Venmo handle never change": (p, n) => p.price === n.price && p.venmo === n.venmo && p.deadline === n.deadline,
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (k < 0.45) return s.paid.includes(user) ? { t: "markUnpaid" } : { t: "markPaid" };
    if (k < 0.55) return s.paid.includes(user) ? { t: "markPaid" } : { t: "markUnpaid" };
    return { t: "setSpots", n: r.pick([1, 2, 3, 4, 2, 0, 5]) };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const ctx = { members };
    const owing = members.filter((m) => !state.paid.includes(m.id));
    const done = members.filter((m) => state.paid.includes(m.id));
    const rows = [...owing, ...done];
    const mine = spotsOf(state, me);
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${paidCount(state, ctx)} of ${members.length} paid · ${money(stillOwed(state, ctx))} still owed`} />
        <small>{`Venmo ${state.venmo} by ${state.deadline}`}</small>
        <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
          {rows.map((m) => {
            const paid = state.paid.includes(m.id);
            const n = spotsOf(state, m.id);
            const isMe = m.id === me;
            return (
              <div key={m.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44 }}>
                  <Avatar user={m} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isMe ? "You" : m.name}</div>
                    <small>{n > 1 ? `${n} spots · ${money(n * state.price)}` : money(state.price)}</small>
                  </div>
                  <small style={{ fontWeight: 600 }}>{paid ? "Paid" : "Owes"}</small>
                </div>
                {isMe ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginLeft: 44, marginBottom: 4 }}>
                    {paid ? (
                      <Button kind="deemphasized" onClick={() => dispatch({ t: "markUnpaid" })}>
                        Undo
                      </Button>
                    ) : (
                      <Button kind="primary" onClick={() => dispatch({ t: "markPaid" })}>
                        I paid
                      </Button>
                    )}
                    {paid ? null : (
                      <Button kind="secondary" onClick={() => dispatch({ t: "setSpots", n: (mine % MAX_SPOTS) + 1 })}>
                        {`${mine} ${mine === 1 ? "spot" : "spots"}`}
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
