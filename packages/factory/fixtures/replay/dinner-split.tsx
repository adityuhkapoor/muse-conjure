import { defineApp, Avatar, Button, CardHeader, Progress } from "@muse/app";

// Bill split in integer cents. Even: the total splits across everyone in the bill, and the first
// people in the list pay the leftover cents. By item: each item splits across the people who had
// it. One person paid; everyone else marks when they have paid them back.

type Params = {
  /** Card title, what the bill is for: "Dinner at Nopa" */
  title: string;
  /** Name of the person who paid, exactly as in the members list. Empty if unknown. */
  payer: string;
  /** "even" splits one total; "items" splits each item across who had it. */
  mode: "even" | "items";
  /** Even mode: the bill total in cents ($184.50 -> 18450). 0 if unknown. */
  totalCents: number;
  /** Items mode: the items from the chat, price in cents. */
  items: { label: string; cents: number }[];
};

// @params
const P: Params = {
  "title": "Dinner",
  "payer": "Bryan",
  "mode": "even",
  "totalCents": 14260,
  "items": []
};
// @end params

type Item = { id: string; label: string; cents: number; eaters: string[] };
/**
 * Even mode splits across everyone in the chat except `out` (people who opted out), so someone who
 * joins later owes a share at once. Items mode splits each item across the people who had it.
 * `paid` is everyone who has settled, and always includes the payer.
 */
type State = { title: string; payer: string; mode: "even" | "items"; total: number; out: string[]; items: Item[]; paid: string[] };
type Action =
  | { t: "total"; cents: number }
  | { t: "join"; user: string }
  | { t: "eat"; item: string }
  | { t: "add"; label: string; cents: number }
  | { t: "paid"; user: string };
type Local = { draft: string };
type Ctx = { members: { id: string }[] };

const MAX_CENTS = 10_000_000;
const MAX_ITEMS = 15;
const isCents = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_CENTS;
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ids = (ctx: Ctx) => ctx.members.map((m) => m.id);
/** True once anyone but the payer has paid back: the amounts are settled and stop moving. */
const settled = (s: State) => s.paid.some((u) => u !== s.payer);

/** Split cents across people; the first `cents % n` people pay one cent more. */
function divide(cents: number, people: string[], into: Record<string, number>) {
  const n = people.length;
  if (n === 0) return;
  const base = Math.floor(cents / n), extra = cents % n;
  people.forEach((u, i) => (into[u] = (into[u] ?? 0) + base + (i < extra ? 1 : 0)));
}

/** Who is in an even bill: the chat, minus people who opted out. */
const inBill = (s: State, ctx: Ctx) => ids(ctx).filter((u) => !s.out.includes(u));

/** What each person's part of the bill is, in cents. */
export function shares(s: State, ctx: Ctx): Record<string, number> {
  const out: Record<string, number> = {};
  if (s.mode === "even") divide(s.total, inBill(s, ctx), out);
  else for (const it of s.items) divide(it.cents, it.eaters, out);
  return out;
}

const billed = (s: State, ctx: Ctx) => (s.mode === "even" ? (inBill(s, ctx).length ? s.total : 0) : s.items.reduce((a, i) => a + (i.eaters.length ? i.cents : 0), 0));
const money = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

function parseCents(text: string): number | null {
  const m = /^\$?\s*(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ""));
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}

function reduceBill(s: State, a: Record<string, unknown>, user: string, seq: number, ctx: Ctx): State {
  switch (a.t) {
    case "total":
      if (s.mode !== "even" || user !== s.payer || !isCents(a.cents) || a.cents === s.total || settled(s)) return s;
      return { ...s, total: a.cents };
    case "join": {
      const who = a.user;
      if (s.mode !== "even" || typeof who !== "string" || !inChat(ctx, who) || who === s.payer || (user !== who && user !== s.payer) || settled(s)) return s;
      return { ...s, out: s.out.includes(who) ? s.out.filter((u) => u !== who) : [...s.out, who] };
    }
    case "eat": {
      const it = s.items.find((i) => i.id === a.item);
      if (s.mode !== "items" || !it || s.paid.includes(user)) return s;
      const eaters = it.eaters.includes(user) ? it.eaters.filter((u) => u !== user) : [...it.eaters, user];
      return { ...s, items: s.items.map((i) => (i.id === it.id ? { ...i, eaters } : i)) };
    }
    case "add": {
      if (s.mode !== "items" || user !== s.payer || typeof a.label !== "string" || !isCents(a.cents) || a.cents === 0) return s;
      const label = a.label.trim().replace(/\s+/g, " ").slice(0, 30);
      if (!label || s.items.length >= MAX_ITEMS) return s;
      return { ...s, items: [...s.items, { id: `i${seq}`, label, cents: a.cents, eaters: [] }] };
    }
    case "paid": {
      const who = a.user;
      if (typeof who !== "string" || s.paid.includes(who) || (shares(s, ctx)[who] ?? 0) === 0) return s;
      if (user !== who && user !== s.payer) return s;
      return { ...s, paid: [...s.paid, who] };
    }
  }
  return s;
}

export default defineApp<State, Action, Local>({
  name: "Bill split",
  summary: (s, ctx) => {
    const owe = shares(s, ctx);
    const owers = Object.keys(owe).filter((u) => u !== s.payer);
    const back = owers.filter((u) => s.paid.includes(u)).length;
    return `${s.title}: ${money(billed(s, ctx))}. ${back} of ${owers.length} paid back.`;
  },

  // The payer is named in the chat; the member list can arrive after the first call, so init runs
  // again with it until someone acts.
  init: (ctx) => {
    const want = P.payer.trim().toLowerCase();
    const payer = ctx.members.find((m) => m.name.toLowerCase() === want || m.id === P.payer)?.id ?? ctx.members[0]?.id ?? "";
    const items: Item[] = P.items
      .filter((i) => i.label.trim() && Number.isInteger(i.cents) && i.cents > 0 && i.cents <= MAX_CENTS)
      .slice(0, MAX_ITEMS)
      .map((i, n) => ({ id: `p${n}`, label: i.label.trim().slice(0, 30), cents: i.cents, eaters: [] }));
    const total = Number.isInteger(P.totalCents) && P.totalCents >= 0 && P.totalCents <= MAX_CENTS ? P.totalCents : 0;
    return { title: P.title.trim().slice(0, 60) || "Bill split", payer, mode: P.mode === "items" ? "items" : "even", total, out: [], items, paid: payer ? [payer] : [] };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceBill(state, action as unknown as Record<string, unknown>, meta.user, meta.seq, ctx) : state),

  // Someone left: they come off the bill, and if it was the payer, the first person left is paid.
  // Someone joined: in an even bill they owe a share at once; in an item bill they can pick items.
  onMembers: (state, ctx) => {
    const payer = inChat(ctx, state.payer) ? state.payer : (ids(ctx)[0] ?? "");
    const base: State = {
      ...state,
      payer,
      out: state.out.filter((u) => inChat(ctx, u) && u !== payer),
      items: state.items.map((i) => (i.eaters.every((u) => inChat(ctx, u)) ? i : { ...i, eaters: i.eaters.filter((u) => inChat(ctx, u)) })),
      paid: [],
    };
    const owe = shares(base, ctx);
    const paid = [...new Set([...(payer ? [payer] : []), ...state.paid.filter((u) => inChat(ctx, u) && (owe[u] ?? 0) > 0)])];
    return { ...base, paid };
  },

  invariants: {
    "shares add up to the bill": (s, ctx) => Object.values(shares(s, ctx)).reduce((a, c) => a + c, 0) === billed(s, ctx),
    "amounts are whole cents": (s) => Number.isInteger(s.total) && s.total >= 0 && s.items.every((i) => Number.isInteger(i.cents) && i.cents > 0),
    "even shares differ by at most one cent": (s, ctx) => {
      if (s.mode !== "even" || inBill(s, ctx).length === 0) return true;
      const v = Object.values(shares(s, ctx));
      return Math.max(...v) - Math.min(...v) <= 1;
    },
    "the payer is in the chat and has paid": (s, ctx) => (s.payer === "" && ctx.members.length === 0) || (inChat(ctx, s.payer) && s.paid.includes(s.payer)),
    "people who paid back owe something": (s, ctx) => {
      const owe = shares(s, ctx);
      return s.paid.every((u) => u === s.payer || (owe[u] ?? 0) > 0);
    },
    "each person appears once": (s) => new Set(s.out).size === s.out.length && new Set(s.paid).size === s.paid.length && s.items.every((i) => new Set(i.eaters).size === i.eaters.length),
    "everyone on the bill is in the chat": (s, ctx) => [...s.out, ...s.paid, ...s.items.flatMap((i) => i.eaters)].every((u) => inChat(ctx, u)),
    "the payer never opts out": (s) => !s.out.includes(s.payer),
  },

  transitions: {
    "only the payer changes the total, to the amount asked": (p, n, a, m) => a.t !== "total" || p === n || (m.user === p.payer && p.mode === "even" && !settled(p) && n.total === a.cents),
    "joining or leaving flips that one person, by themselves or the payer": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const rest = (x: State) => x.out.filter((u) => u !== a.user).join();
      return p.out.includes(a.user) !== n.out.includes(a.user) && rest(p) === rest(n) && a.user !== p.payer && (m.user === a.user || m.user === p.payer) && !settled(p);
    },
    "eating flips the actor on that one item": (p, n, a, m) => {
      if (a.t !== "eat" || p === n) return true;
      const had = (x: State) => x.items.find((i) => i.id === a.item)?.eaters.includes(m.user);
      return had(p) !== had(n) && !p.paid.includes(m.user) && p.items.every((i, j) => i.id === a.item || n.items[j] === i);
    },
    "only the payer adds an item, at the end, with the price asked": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.items.at(-1);
      return m.user === p.payer && n.items.length === p.items.length + 1 && last?.cents === a.cents && last.id === `i${m.seq}` && last.eaters.length === 0;
    },
    "a payback marks that one person, who owes, by themselves or the payer": (p, n, a, m, ctx) => {
      if (a.t !== "paid" || p === n) return true;
      return n.paid.length === p.paid.length + 1 && n.paid.at(-1) === a.user && !p.paid.includes(a.user) && (shares(p, ctx)[a.user] ?? 0) > 0 && (m.user === a.user || m.user === p.payer);
    },
    "the bill's setup never changes": (p, n) => p.title === n.title && p.payer === n.payer && p.mode === n.mode,
    "only people in the chat change the bill": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const who = r.next() < 0.7 ? user : r.pick(ctx.members)?.id ?? user;
    const k = r.next();
    if (s.mode === "even") {
      if (user === s.payer && k < 0.3) return { t: "total", cents: r.int(40_000) + 1 };
      if (k < 0.7) return { t: "join", user: who };
      return { t: "paid", user: who };
    }
    if (user === s.payer && k < 0.2) return { t: "add", label: r.pick(["Fries", "Wings", "Pitcher"]), cents: r.int(3000) + 1 };
    if (k < 0.8 && s.items.length) return { t: "eat", item: r.pick(s.items).id };
    return { t: "paid", user: who };
  },

  local: { draft: "" },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const owe = shares(state, { members });
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const isPayer = me === state.payer;
    const owers = Object.keys(owe).filter((u) => u !== state.payer);
    const back = owers.filter((u) => state.paid.includes(u)).reduce((a, u) => a + (owe[u] ?? 0), 0);
    const due = owers.reduce((a, u) => a + (owe[u] ?? 0), 0);
    const cents = parseCents(local.draft);
    const rows = state.mode === "even" ? members.map((m) => m.id) : members.map((m) => m.id).filter((u) => (owe[u] ?? 0) > 0 || u === state.payer);
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${money(billed(state, { members }))} · paid by ${nameOf(state.payer).replace("You", "you")}`} />
        <Progress value={back} max={Math.max(1, due)} label={`${money(back)} of ${money(due)} back · ${owers.filter((u) => state.paid.includes(u)).length} paid`} />
        {state.mode === "items" ? (
          <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
            {state.items.map((i) => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{i.label}</div>
                  <small>{i.eaters.length ? `${money(i.cents)} · ${i.eaters.length} had it` : `${money(i.cents)} · no one yet`}</small>
                </div>
                <Button kind={i.eaters.includes(me) ? "primary" : "secondary"} disabled={state.paid.includes(me) && !isPayer} onClick={() => dispatch({ t: "eat", item: i.id })}>
                  {i.eaters.includes(me) ? "Mine" : "Had it"}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
          {rows.map((u) => {
            const owes = owe[u] !== undefined;
            const paid = state.paid.includes(u);
            return (
              <div key={u} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44, opacity: owes || u === state.payer ? 1 : 0.6 }}>
                <Avatar user={u} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{nameOf(u)}</div>
                  <small>{u === state.payer ? `${money(owe[u] ?? 0)} · paid the bill` : owes ? money(owe[u] ?? 0) : "Not in"}</small>
                </div>
                {u === state.payer ? null : paid ? (
                  <small style={{ fontWeight: 600 }}>Paid</small>
                ) : owes && (u === me || isPayer) ? (
                  <Button kind={u === me ? "primary" : "secondary"} onClick={() => dispatch({ t: "paid", user: u })}>
                    {u === me ? "I paid" : "Mark paid"}
                  </Button>
                ) : state.mode === "even" && (u === me || isPayer) ? (
                  <Button kind="deemphasized" disabled={settled(state)} onClick={() => dispatch({ t: "join", user: u })}>
                    Add
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        {isPayer && state.mode === "even" && !settled(state) ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (cents !== null) dispatch({ t: "total", cents });
              setLocal({ draft: "" });
            }}
          >
            <input value={local.draft} inputMode="decimal" placeholder="Total, e.g. 84.50" aria-label="Bill total" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
            <Button
              disabled={cents === null}
              onClick={() => {
                if (cents !== null) dispatch({ t: "total", cents });
                setLocal({ draft: "" });
              }}
            >
              Update
            </Button>
          </form>
        ) : null}
      </div>
    );
  },
});
