import { defineApp, Avatar, Button, CardHeader, SystemLine, Toast } from "@muse/app";

// Trip split. Everyone puts in what they paid; the app shows the fewest payments that settle up.
// People mark their own payments as sent. Amounts are integer cents.

// Chat content: who paid what. An empty `only` means everyone in the chat shares it.
const TRIP = {
  title: "Nashville weekend breakdown",
  expenses: [
    { label: "Airbnb", cents: 64000, payer: "Maya", only: [] as string[] },
    { label: "Van gas there", cents: 8500, payer: "Paige", only: [] as string[] },
    { label: "Van gas back", cents: 4000, payer: "Paige", only: [] as string[] },
    { label: "Hattie B's lunch", cents: 6200, payer: "Dev", only: [] as string[] },
    { label: "Friday drinks", cents: 11800, payer: "Rohan", only: [] as string[] },
    { label: "Saturday bar", cents: 7600, payer: "Rohan", only: [] as string[] },
    { label: "Uber from Broadway", cents: 2300, payer: "Mia", only: [] as string[] },
    { label: "Uber Friday", cents: 1900, payer: "Mia", only: [] as string[] },
    { label: "Airbnb parking", cents: 3000, payer: "Mina", only: [] as string[] },
    { label: "Brunch at Biscuit Love", cents: 9700, payer: "Amir", only: [] as string[] },
    { label: "Groceries", cents: 5400, payer: "Maya", only: [] as string[] },
    { label: "Ryman tickets", cents: 9000, payer: "Paige", only: ["Paige", "Dev"] },
    { label: "Pedal tavern", cents: 14000, payer: "Paige", only: [] as string[] },
    { label: "Pizza dinner Saturday", cents: 13400, payer: "Dev", only: [] as string[] },
    { label: "Airbnb cleaner tip", cents: 2000, payer: "Amir", only: [] as string[] },
    { label: "Uber to airport", cents: 3100, payer: "Mina", only: [] as string[] },
  ],
};

type Expense = { id: string; label: string; cents: number; payer: string; only: string[] | null };
type Payment = { id: string; from: string; to: string; cents: number };
type State = { expenses: Expense[]; payments: Payment[] };
type Action =
  | { t: "add"; label: string; cents: number }
  | { t: "remove"; id: string }
  | { t: "paid"; to: string; cents: number }
  | { t: "undo"; id: string };
type Local = { open: boolean; label: string; amount: string; toast: number };
type Ctx = { members: { id: string }[] };

const MAX_ITEMS = 24;
const MAX_LABEL = 40;
const MAX_CENTS = 10_000_000;
const LISTED = 4;

const isCents = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= MAX_CENTS;
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ids = (ctx: Ctx) => ctx.members.map((m) => m.id);
const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const money = (c: number) => `$${String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${String(c % 100).padStart(2, "0")}`;

function parseCents(text: string): number | null {
  const m = /^\$?\s*(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ""));
  if (!m) return null;
  const c = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return c > 0 && c <= MAX_CENTS ? c : null;
}

/** Who shares an expense, in member order. */
function people(e: Expense, ctx: Ctx): string[] {
  const all = ids(ctx);
  const only = e.only;
  return only ? all.filter((id) => only.includes(id)) : all;
}

/** One expense split in whole cents; the first people in the list take the leftover cents. */
function shareOf(e: Expense, ctx: Ctx): Record<string, number> {
  const who = people(e, ctx);
  const out: Record<string, number> = {};
  if (who.length === 0) return out;
  const base = Math.floor(e.cents / who.length);
  const extra = e.cents % who.length;
  who.forEach((u, i) => (out[u] = base + (i < extra ? 1 : 0)));
  return out;
}

/** Paid minus share, adjusted by payments sent. Positive: is owed. Negative: owes. */
function balances(s: State, ctx: Ctx): Record<string, number> {
  const bal: Record<string, number> = {};
  for (const id of ids(ctx)) bal[id] = 0;
  for (const e of s.expenses) {
    const sh = shareOf(e, ctx);
    if (bal[e.payer] === undefined || Object.keys(sh).length === 0) continue;
    bal[e.payer] = (bal[e.payer] ?? 0) + e.cents;
    for (const u of Object.keys(sh)) bal[u] = (bal[u] ?? 0) - (sh[u] ?? 0);
  }
  for (const p of s.payments) {
    if (bal[p.from] === undefined || bal[p.to] === undefined) continue;
    bal[p.from] = (bal[p.from] ?? 0) + p.cents;
    bal[p.to] = (bal[p.to] ?? 0) - p.cents;
  }
  return bal;
}

type Move = { from: string; to: string; cents: number };

/** Greedy: the biggest debtor pays the biggest creditor. */
function settle(s: State, ctx: Ctx): Move[] {
  const bal = balances(s, ctx);
  const all = ids(ctx);
  const cred = all.filter((u) => (bal[u] ?? 0) > 0).map((u) => ({ u, c: bal[u] ?? 0 }));
  const debt = all.filter((u) => (bal[u] ?? 0) < 0).map((u) => ({ u, c: -(bal[u] ?? 0) }));
  cred.sort((a, b) => b.c - a.c);
  debt.sort((a, b) => b.c - a.c);
  const moves: Move[] = [];
  let i = 0;
  let j = 0;
  while (i < debt.length && j < cred.length) {
    const d = debt[i]!;
    const c = cred[j]!;
    const amt = Math.min(d.c, c.c);
    if (amt > 0) moves.push({ from: d.u, to: c.u, cents: amt });
    d.c -= amt;
    c.c -= amt;
    if (d.c === 0) i++;
    if (c.c === 0) j++;
  }
  return moves;
}

export default defineApp<State, Action, Local>({
  name: "Trip split",
  summary: (s, ctx) => {
    const total = s.expenses.reduce((n, e) => n + e.cents, 0);
    const left = settle(s, ctx).length;
    return `${TRIP.title}: ${money(total)} · ${s.expenses.length} expenses · ${left === 0 ? "settled" : `${left} payments left`}`;
  },

  init: (ctx) => {
    const byName = (name: string) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
    const fallback = ctx.members[0]?.id ?? "";
    const expenses: Expense[] = TRIP.expenses.slice(0, MAX_ITEMS).map((e, i) => {
      const found = e.only.map(byName).filter((x): x is string => typeof x === "string");
      return {
        id: `x${i}`,
        label: e.label.slice(0, MAX_LABEL),
        cents: e.cents,
        payer: byName(e.payer) ?? fallback,
        only: found.length > 0 ? found : null,
      };
    });
    return { expenses, payments: [] };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    switch (action.t) {
      case "add": {
        if (typeof action.label !== "string" || !isCents(action.cents) || state.expenses.length >= MAX_ITEMS) return state;
        const label = clean(action.label);
        if (!label || label.length > MAX_LABEL) return state;
        return { ...state, expenses: [...state.expenses, { id: `e${meta.seq}`, label, cents: action.cents, payer: meta.user, only: null }] };
      }
      case "remove": {
        if (typeof action.id !== "string") return state;
        const e = state.expenses.find((x) => x.id === action.id);
        if (!e || e.payer !== meta.user) return state;
        return { ...state, expenses: state.expenses.filter((x) => x.id !== e.id) };
      }
      case "paid": {
        if (typeof action.to !== "string" || !inChat(ctx, action.to) || action.to === meta.user) return state;
        if (!isCents(action.cents) || state.payments.length >= MAX_ITEMS) return state;
        return { ...state, payments: [...state.payments, { id: `p${meta.seq}`, from: meta.user, to: action.to, cents: action.cents }] };
      }
      case "undo": {
        if (typeof action.id !== "string") return state;
        const p = state.payments.find((x) => x.id === action.id);
        if (!p || p.from !== meta.user) return state;
        return { ...state, payments: state.payments.filter((x) => x.id !== p.id) };
      }
    }
    return state;
  },

  // Someone left: a payer who left hands the expense to the first person still here, they come off
  // shared lists, and payments to or from them are dropped.
  onMembers: (state, ctx) => {
    const all = ids(ctx);
    if (all.length === 0) return state;
    const expenses = state.expenses.map((e) => {
      const payer = all.includes(e.payer) ? e.payer : (all[0] ?? e.payer);
      let only = e.only;
      if (only) {
        const kept = only.filter((u) => all.includes(u));
        only = kept.length === 0 ? null : kept.length === only.length ? only : kept;
      }
      return payer === e.payer && only === e.only ? e : { ...e, payer, only };
    });
    const payments = state.payments.filter((p) => all.includes(p.from) && all.includes(p.to));
    if (expenses.every((e, i) => e === state.expenses[i]) && payments.length === state.payments.length) return state;
    return { expenses, payments };
  },

  invariants: {
    "every expense is a positive whole amount paid by someone in the chat": (s, ctx) =>
      s.expenses.every((e) => Number.isInteger(e.cents) && e.cents > 0 && (ctx.members.length === 0 || inChat(ctx, e.payer))),
    "a shared list is null or has only people in the chat": (s, ctx) =>
      s.expenses.every((e) => e.only === null || (e.only.length > 0 && new Set(e.only).size === e.only.length && e.only.every((u) => inChat(ctx, u)))),
    "every payment is between two different people in the chat for a positive amount": (s, ctx) =>
      s.payments.every((p) => Number.isInteger(p.cents) && p.cents > 0 && p.from !== p.to && inChat(ctx, p.from) && inChat(ctx, p.to)),
    "ids are unique": (s) =>
      new Set(s.expenses.map((e) => e.id)).size === s.expenses.length && new Set(s.payments.map((p) => p.id)).size === s.payments.length,
    "balances add up to zero": (s, ctx) => Object.values(balances(s, ctx)).reduce((a, c) => a + c, 0) === 0,
    "the settle-up payments clear every balance with no extra cents": (s, ctx) => {
      const bal = balances(s, ctx);
      const moves = settle(s, ctx);
      const owed = Object.values(bal).reduce((a, c) => a + (c > 0 ? c : 0), 0);
      const after: Record<string, number> = { ...bal };
      for (const m of moves) {
        after[m.from] = (after[m.from] ?? 0) + m.cents;
        after[m.to] = (after[m.to] ?? 0) - m.cents;
      }
      return moves.reduce((a, m) => a + m.cents, 0) === owed && Object.values(after).every((c) => c === 0) && moves.every((m) => m.from !== m.to && m.cents > 0);
    },
    "at most 24 expenses and 24 payments, labels 1 to 40 characters": (s) =>
      s.expenses.length <= MAX_ITEMS && s.payments.length <= MAX_ITEMS && s.expenses.every((e) => e.label.length > 0 && e.label.length <= MAX_LABEL),
  },

  transitions: {
    "an add appends one expense paid by the actor, shared by everyone, and changes nothing else": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.expenses.at(-1);
      return (
        typeof a.label === "string" &&
        n.expenses.length === p.expenses.length + 1 &&
        !!last &&
        last.label === clean(a.label) &&
        last.cents === a.cents &&
        last.payer === m.user &&
        last.only === null &&
        last.id === `e${m.seq}` &&
        same(p.expenses, n.expenses.slice(0, -1)) &&
        same(p.payments, n.payments)
      );
    },
    "a remove deletes one expense, only when the actor paid it": (p, n, a, m) => {
      if (a.t !== "remove" || p === n) return true;
      const gone = p.expenses.find((e) => e.id === a.id);
      return (
        !!gone &&
        gone.payer === m.user &&
        n.expenses.length === p.expenses.length - 1 &&
        same(
          p.expenses.filter((e) => e.id !== a.id),
          n.expenses,
        ) &&
        same(p.payments, n.payments)
      );
    },
    "a paid appends one payment from the actor to the named person for the amount asked": (p, n, a, m) => {
      if (a.t !== "paid" || p === n) return true;
      const last = n.payments.at(-1);
      return (
        n.payments.length === p.payments.length + 1 &&
        !!last &&
        last.from === m.user &&
        last.to === a.to &&
        last.cents === a.cents &&
        last.id === `p${m.seq}` &&
        same(p.payments, n.payments.slice(0, -1)) &&
        same(p.expenses, n.expenses)
      );
    },
    "an undo deletes one payment, only when the actor sent it": (p, n, a, m) => {
      if (a.t !== "undo" || p === n) return true;
      const gone = p.payments.find((x) => x.id === a.id);
      return (
        !!gone &&
        gone.from === m.user &&
        n.payments.length === p.payments.length - 1 &&
        same(
          p.payments.filter((x) => x.id !== a.id),
          n.payments,
        ) &&
        same(p.expenses, n.expenses)
      );
    },
    "no action changes an existing expense's amount, payer or shared list": (p, n) =>
      p.expenses.every((e) => {
        const x = n.expenses.find((y) => y.id === e.id);
        return !x || (x.cents === e.cents && x.payer === e.payer && same(x.only, e.only) && x.label === e.label);
      }),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const add = (): Action => ({ t: "add", label: r.pick(["Coffee", "Tolls", "Late snacks", "  Parking ", "", "Boots"]), cents: r.int(20000) + 1 });
    const k = r.next();
    if (k < 0.4) return add();
    if (k < 0.65) {
      const others = ctx.members.filter((m) => m.id !== user);
      return { t: "paid", to: others.length ? r.pick(others).id : user, cents: r.int(5000) + 1 };
    }
    if (k < 0.8) {
      const mine = s.expenses.filter((e) => e.payer === user);
      const pool = mine.length ? mine : s.expenses;
      return pool.length ? { t: "remove", id: r.pick(pool).id } : add();
    }
    const mine = s.payments.filter((p) => p.from === user);
    const pool = mine.length ? mine : s.payments;
    return pool.length ? { t: "undo", id: r.pick(pool).id } : add();
  },

  local: { open: false, label: "", amount: "", toast: 0 },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const ctx = { members };
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const total = state.expenses.reduce((n, e) => n + e.cents, 0);
    const header = (
      <CardHeader
        title={TRIP.title}
        subtitle={`${money(total)} total · ${state.expenses.length} ${state.expenses.length === 1 ? "expense" : "expenses"}`}
      />
    );

    if (local.open) {
      const cents = parseCents(local.amount);
      const label = clean(local.label);
      const canAdd = cents !== null && label.length > 0 && label.length <= MAX_LABEL && state.expenses.length < MAX_ITEMS;
      const submit = () => {
        if (!canAdd || cents === null) return;
        dispatch({ t: "add", label, cents });
        setLocal({ label: "", amount: "", toast: local.toast + 1 });
      };
      const listed = state.expenses.slice(-LISTED);
      const earlier = state.expenses.length - listed.length;
      return (
        <div>
          {header}
          <div style={{ display: "grid", gap: 2 }}>
            {earlier > 0 ? <small>{`${earlier} earlier`}</small> : null}
            {listed.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                <Avatar user={e.payer} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</div>
                  <small>{`${money(e.cents)} · ${nameOf(e.payer)}${e.only ? ` · ${e.only.length} sharing` : ""}`}</small>
                </div>
                {e.payer === me ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "remove", id: e.id })}>
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(ev) => {
              ev.preventDefault();
              submit();
            }}
          >
            <input value={local.label} maxLength={MAX_LABEL} placeholder="What for" aria-label="What for" onInput={(ev) => setLocal({ label: ev.currentTarget.value })} />
            <input value={local.amount} inputMode="decimal" placeholder="Amount" aria-label="Amount in dollars" onInput={(ev) => setLocal({ amount: ev.currentTarget.value })} />
            <Button kind="primary" disabled={!canAdd} onClick={submit}>
              Add
            </Button>
          </form>
          <div style={{ marginTop: 4 }}>
            <Button kind="deemphasized" onClick={() => setLocal({ open: false })}>
              Back
            </Button>
          </div>
          {local.toast ? <Toast key={local.toast}>Expense added</Toast> : null}
        </div>
      );
    }

    const moves = settle(state, ctx);
    const ordered = [...moves.filter((t) => t.from === me), ...moves.filter((t) => t.from !== me)];
    const shown = ordered.slice(0, 4);
    const more = ordered.length - shown.length;
    const paidByMe = state.expenses.reduce((n, e) => n + (e.payer === me ? e.cents : 0), 0);
    const myShare = state.expenses.reduce((n, e) => n + (shareOf(e, ctx)[me] ?? 0), 0);

    return (
      <div>
        {header}
        {moves.length === 0 ? (
          <SystemLine>Everyone is settled</SystemLine>
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            {shown.map((t) => (
              <div key={`${t.from}-${t.to}`} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                <Avatar user={t.from} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {`${t.from === me ? "You pay" : `${nameOf(t.from)} pays`} ${t.to === me ? "you" : nameOf(t.to)} · ${money(t.cents)}`}
                </div>
                {t.from === me ? (
                  <Button kind="secondary" onClick={() => dispatch({ t: "paid", to: t.to, cents: t.cents })}>
                    Paid
                  </Button>
                ) : null}
              </div>
            ))}
            {more > 0 ? <small>{`and ${more} more`}</small> : null}
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <small>{`You paid ${money(paidByMe)} · your share ${money(myShare)}`}</small>
        </div>
        <div style={{ marginTop: 4 }}>
          <Button kind="deemphasized" onClick={() => setLocal({ open: true })}>
            See expenses
          </Button>
        </div>
      </div>
    );
  },
});
