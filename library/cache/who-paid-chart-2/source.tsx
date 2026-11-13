import { defineApp, Avatar, Button, CardHeader } from "@muse/app";

// Trip settle up: every expense is split among the people who shared it, then the fewest
// payments settle everyone. Settling freezes the plan.

const TRIP = {
  title: "Settle up the game trip",
  // split: null means everyone in the chat; otherwise member names looked up in init.
  expenses: [
    { label: "Gas, Shell in Toledo", payer: "Leo", cents: 6400, split: null as string[] | null },
    { label: "Hotel", payer: "Dani", cents: 21800, split: ["Leo", "Dani", "Rohan", "Maya", "Marcus"] as string[] | null },
    { label: "Tickets, 7 x $35", payer: "Rohan", cents: 24500, split: null as string[] | null },
    { label: "Waffle House", payer: "Maya", cents: 5230, split: null as string[] | null },
    { label: "Tolls", payer: "Dre", cents: 1150, split: null as string[] | null },
    { label: "Gas station snacks", payer: "Cleo", cents: 2375, split: null as string[] | null },
    { label: "Parking", payer: "Marcus", cents: 2000, split: null as string[] | null },
    { label: "Gas, second fill", payer: "Leo", cents: 4800, split: null as string[] | null },
  ],
};

type Expense = { id: string; label: string; payer: string; cents: number; split: string[] };
type Pay = { from: string; to: string; cents: number };
type State = { expenses: Expense[]; paid: string[]; at: number; settled: boolean; plan: Pay[] };
type Action = { t: "settle" } | { t: "paid"; i: number } | { t: "add"; label: string; cents: number } | { t: "reopen" } ;
type Local = Record<string, never>;

const MAX_EXPENSES = 12;
const MAX_LABEL = 40;
const MAX_CENTS = 10_000_000;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const keyOf = (p: Pay) => `${p.from}>${p.to}`;

/** Each person's share of one expense; the first people in the split pay the leftover cents. */
function sharesOf(e: Expense): [string, number][] {
  const n = e.split.length;
  if (n === 0) return [];
  const base = Math.floor(e.cents / n);
  const extra = e.cents % n;
  return e.split.map((u, i) => [u, base + (i < extra ? 1 : 0)] as [string, number]);
}

function nets(ex: Expense[]): Record<string, number> {
  const n: Record<string, number> = {};
  for (const e of ex) {
    n[e.payer] = (n[e.payer] ?? 0) + e.cents;
    for (const [u, c] of sharesOf(e)) n[u] = (n[u] ?? 0) - c;
  }
  return n;
}

const byAmount = (a: [string, number], b: [string, number]) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/** Greedy: the biggest debtor pays the biggest creditor until everyone is square. */
function planOf(ex: Expense[]): Pay[] {
  const net = nets(ex);
  const cred = Object.entries(net).filter(([, v]) => v > 0).sort(byAmount);
  const debt = Object.entries(net).filter(([, v]) => v < 0).map(([u, v]) => [u, -v] as [string, number]).sort(byAmount);
  const out: Pay[] = [];
  let i = 0;
  let j = 0;
  while (i < cred.length && j < debt.length) {
    const c = cred[i]!;
    const d = debt[j]!;
    const amt = Math.min(c[1], d[1]);
    if (amt > 0) out.push({ from: d[0], to: c[0], cents: amt });
    c[1] -= amt;
    d[1] -= amt;
    if (c[1] === 0) i++;
    if (d[1] === 0) j++;
  }
  return out;
}

const total = (ex: Expense[]) => ex.reduce((a, e) => a + e.cents, 0);
const isCents = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= MAX_CENTS;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default defineApp<State, Action, Local>({
  name: "Trip settle up",
  summary: (s) =>
    s.settled
      ? `${s.plan.length} payments settle it · ${s.paid.length} of ${s.plan.length} sent`
      : `${TRIP.title}: ${s.expenses.length} expenses · ${money(total(s.expenses))} total`,

  init: (ctx) => {
    const ids = ctx.members.map((m) => m.id);
    if (ids.length === 0) return { expenses: [], paid: [], at: 0, settled: false, plan: [] };
    const find = (name: string) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
    const expenses: Expense[] = TRIP.expenses.slice(0, MAX_EXPENSES).map((e, i) => {
      const named = e.split ? [...new Set(e.split.map(find).filter((x): x is string => typeof x === "string"))] : ids;
      return { id: `x${i}`, label: e.label.slice(0, MAX_LABEL), payer: find(e.payer) ?? ids[0]!, cents: e.cents, split: named.length ? named : ids };
    });
    return { expenses, paid: [], at: 0, settled: false, plan: [] };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    switch (action.t) {
      case "settle": {
        if (state.settled || state.expenses.length === 0) return state;
        return { ...state, settled: true, at: meta.time, plan: planOf(state.expenses), paid: [] };
      }
      case "paid": {
        const i = action.i;
        if (!state.settled || typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= state.plan.length) return state;
        const pay = state.plan[i]!;
        if (state.paid.includes(keyOf(pay))) return state;
        if (meta.user !== pay.from && meta.user !== pay.to) return state;
        return { ...state, paid: [...state.paid, keyOf(pay)] };
      }
      case "add": {
        if (state.settled || typeof action.label !== "string" || !isCents(action.cents)) return state;
        const label = action.label.trim();
        if (!label || label.length > MAX_LABEL || state.expenses.length >= MAX_EXPENSES) return state;
        const split = ctx.members.map((m) => m.id);
        return { ...state, expenses: [...state.expenses, { id: `e${meta.seq}`, label, payer: meta.user, cents: action.cents, split }] };
      }
      case "reopen": {
        if (!state.settled || state.paid.length > 0) return state;
        return { ...state, settled: false, at: 0, plan: [], paid: [] };
      }
    }
    return state;
  },

  // Someone left: their expenses go, they come out of shared splits, and a settled plan is redone.
  onMembers: (state, ctx) => {
    const next = state.expenses
      .filter((e) => inChat(ctx, e.payer))
      .map((e) => (e.split.every((u) => inChat(ctx, u)) ? e : { ...e, split: e.split.filter((u) => inChat(ctx, u)) }))
      .filter((e) => e.split.length > 0);
    const changed = next.length !== state.expenses.length || next.some((e, i) => e !== state.expenses[i]);
    if (!changed) return state;
    if (!state.settled) return { ...state, expenses: next };
    if (next.length === 0) return { expenses: [], paid: [], at: 0, settled: false, plan: [] };
    const plan = planOf(next);
    const keys = plan.map(keyOf);
    return { ...state, expenses: next, plan, paid: state.paid.filter((k) => keys.includes(k)) };
  },

  invariants: {
    "every expense has positive whole cents and a split with no repeats": (s) =>
      s.expenses.every((e) => Number.isInteger(e.cents) && e.cents > 0 && e.split.length > 0 && new Set(e.split).size === e.split.length && e.label.length > 0 && e.label.length <= MAX_LABEL),
    "payers and sharers are in the chat": (s, ctx) => s.expenses.every((e) => inChat(ctx, e.payer) && e.split.every((u) => inChat(ctx, u))),
    "when settled, payments move each person to their balance": (s) => {
      if (!s.settled) return true;
      const net = nets(s.expenses);
      const flow: Record<string, number> = {};
      for (const p of s.plan) {
        flow[p.to] = (flow[p.to] ?? 0) + p.cents;
        flow[p.from] = (flow[p.from] ?? 0) - p.cents;
      }
      return [...new Set([...Object.keys(net), ...Object.keys(flow)])].every((u) => (flow[u] ?? 0) === (net[u] ?? 0));
    },
    "payments are positive, between two people, and few": (s, ctx) =>
      s.plan.every((p) => Number.isInteger(p.cents) && p.cents > 0 && p.from !== p.to) && s.plan.length <= Math.max(0, ctx.members.length - 1),
    "paid keys match the plan, and nothing is planned before settling": (s) =>
      s.paid.every((k) => s.plan.some((p) => keyOf(p) === k)) && new Set(s.paid).size === s.paid.length && (s.settled || (s.plan.length === 0 && s.paid.length === 0 && s.at === 0)),
    "at most 12 expenses with unique ids": (s) => s.expenses.length <= MAX_EXPENSES && new Set(s.expenses.map((e) => e.id)).size === s.expenses.length,
  },

  transitions: {
    "settle freezes the plan from the expenses at that moment": (p, n, a, m) =>
      a.t !== "settle" || p === n || (!p.settled && n.settled && n.at === m.time && n.expenses === p.expenses && same(n.plan, planOf(p.expenses)) && n.paid.length === 0),
    "paid adds exactly that payment, by one of its two people": (p, n, a, m) => {
      if (a.t !== "paid" || p === n) return true;
      const pay = p.plan[a.i];
      return !!pay && (m.user === pay.from || m.user === pay.to) && n.paid.length === p.paid.length + 1 && n.paid.at(-1) === keyOf(pay) && !p.paid.includes(keyOf(pay)) && n.plan === p.plan;
    },
    "add appends one expense paid by the actor and changes nothing else": (p, n, a, m, ctx) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.expenses.at(-1);
      return (
        !p.settled && n.expenses.length === p.expenses.length + 1 && p.expenses.every((e, i) => n.expenses[i] === e) &&
        !!last && last.id === `e${m.seq}` && last.payer === m.user && last.cents === a.cents && last.label === a.label.trim() &&
        same(last.split, ctx.members.map((x) => x.id)) && n.settled === p.settled && n.paid === p.paid
      );
    },
    "reopen works only when nothing is paid, and clears the plan": (p, n, a) =>
      a.t !== "reopen" || p === n || (p.settled && p.paid.length === 0 && !n.settled && n.plan.length === 0 && n.paid.length === 0 && n.at === 0 && n.expenses === p.expenses),
    "expenses never change while settled": (p, n) => !p.settled || n.expenses === p.expenses,
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    const k = r.next();
    if (s.settled) {
      if (s.paid.length === 0 && k < 0.2) return { t: "reopen" };
      if (k < 0.85) return { t: "paid", i: r.int(Math.max(1, s.plan.length)) };
      return { t: "settle" };
    }
    if (k < 0.45) return { t: "add", label: r.pick(["Snacks", "Parking", "Coffee", ""]), cents: r.pick([0, 1250, 3999, 800, 15000]) };
    if (k < 0.85) return { t: "settle" };
    return { t: "reopen" };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const net = nets(state.expenses);
    const sent = state.paid.length;
    const subtitle = state.settled
      ? `${state.plan.length} payments settle it · ${sent} of ${state.plan.length} sent`
      : `${state.expenses.length} expenses · ${money(total(state.expenses))} total`;
    const own = state.plan.map((p, i) => ({ p, i })).filter((x) => (x.p.from === me || x.p.to === me) && !state.paid.includes(keyOf(x.p)));
    const partial = state.expenses.find((e) => e.split.length < members.length);
    const out = partial ? members.filter((m) => !partial.split.includes(m.id)).map((m) => m.name).slice(0, 3).join(", ") : "";
    const columns = [
      { title: "Owes", list: members.filter((m) => (net[m.id] ?? 0) < 0) },
      { title: "Gets back", list: members.filter((m) => (net[m.id] ?? 0) > 0) },
    ];
    return (
      <div>
        <CardHeader title={TRIP.title} subtitle={subtitle} />
        <div
          role="group"
          aria-label={state.settled ? `${state.plan.length} payments settle the trip` : `${state.expenses.length} expenses, who owes and who gets back`}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          {columns.map((col) => (
            <div key={col.title} style={{ minWidth: 0 }}>
              <small style={{ color: theme.color.secondaryText }}>{col.title}</small>
              {col.list.slice(0, 5).map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 28 }}>
                  <Avatar user={m} size={24} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(m.id)}</span>
                  <small>{money(Math.abs(net[m.id] ?? 0))}</small>
                </div>
              ))}
              {col.list.length === 0 ? <div><small style={{ color: theme.color.secondaryText }}>No one</small></div> : null}
              {col.list.length > 5 ? <small style={{ color: theme.color.secondaryText }}>{`+${col.list.length - 5} more`}</small> : null}
            </div>
          ))}
        </div>
        {!state.settled ? (
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {partial ? (
              <small style={{ color: theme.color.secondaryText }}>{`${partial.label} · ${partial.split.length} ways${out ? ` · not in: ${out}` : ""}`}</small>
            ) : null}
            <Button kind="primary" wide disabled={state.expenses.length === 0} onClick={() => dispatch({ t: "settle" })}>
              Settle up
            </Button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
            {own.length === 0 ? <small style={{ color: theme.color.secondaryText }}>Nothing left for you to send or get</small> : null}
            {own.slice(0, 2).map(({ p, i }) => (
              <div key={keyOf(p)} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {p.from === me ? `You pay ${nameOf(p.to)} ${money(p.cents)}` : `${nameOf(p.from)} pays you ${money(p.cents)}`}
                </div>
                <Button kind="secondary" onClick={() => dispatch({ t: "paid", i })}>
                  {p.from === me ? "I paid" : "Got it"}
                </Button>
              </div>
            ))}
            {own.length > 2 ? <small style={{ color: theme.color.secondaryText }}>{`${own.length - 2} more to settle`}</small> : null}
            {state.paid.length === 0 ? (
              <Button kind="deemphasized" onClick={() => dispatch({ t: "reopen" })}>
                Reopen
              </Button>
            ) : null}
          </div>
        )}
      </div>
    );
  },
});
