import { defineApp, Avatar, Button, CardHeader, Facepile, Toast } from "@muse/app";

// Subscription split. Each bill has one payer and is shared by everyone in the chat except people
// who skip it. Balances come from the bills and the payments already made. The card suggests the
// fewest payments to settle up, and a person marks their own payment as paid.

const CHAT = {
  title: "Who owes who for subscriptions?",
  bills: [
    { label: "Netflix", cents: 1799, payer: "Zoe" },
    { label: "Spotify family", cents: 1999, payer: "Jalen" },
    { label: "Hulu (no ads)", cents: 1199, payer: "Ty" },
    { label: "Xfinity wifi", cents: 6000, payer: "Ty" },
    { label: "HBO Max", cents: 1699, payer: "Maya" },
  ],
};

type Bill = { id: string; label: string; cents: number; payer: string; skip: string[] };
type Paid = { id: string; from: string; to: string; cents: number };
type Line = { from: string; to: string; cents: number };
type State = { bills: Bill[]; settled: Paid[] };
type Action =
  | { t: "skip"; bill: string }
  | { t: "add"; label: string; cents: number }
  | { t: "remove"; bill: string }
  | { t: "pay"; to: string; cents: number };
type Local = { tab: "pay" | "bills"; label: string; amount: string; toast: number; msg: string };
type C = { members: { id: string }[] };

const MAX_BILLS = 10;
const MAX_PAID = 12;
const MAX_LABEL = 40;
const MAX_CENTS = 1_000_000;

const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const inChat = (c: C, id: string) => c.members.some((m) => m.id === id);
const isCents = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_CENTS;
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
const money = (c: number) => {
  const a = Math.abs(c);
  return `$${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
};

function parseCents(text: string): number | null {
  const m = /^\$?\s*(\d{1,4})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ""));
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}

/** Each sharer's part of one bill; the first sharers take the leftover cents. */
function sharesOf(b: Bill, c: C): Record<string, number> {
  const out: Record<string, number> = {};
  const people = c.members.map((m) => m.id).filter((u) => !b.skip.includes(u));
  const n = people.length;
  if (n === 0) return out;
  const base = Math.floor(b.cents / n);
  const extra = b.cents % n;
  people.forEach((u, i) => {
    out[u] = base + (i < extra ? 1 : 0);
  });
  return out;
}

/** Net balance per member: positive means they are owed, negative means they owe. */
function balances(s: State, c: C): Record<string, number> {
  const bal: Record<string, number> = {};
  for (const m of c.members) bal[m.id] = 0;
  for (const b of s.bills) {
    if (!(b.payer in bal)) continue;
    const sh = sharesOf(b, c);
    if (Object.keys(sh).length === 0) continue;
    bal[b.payer] = (bal[b.payer] ?? 0) + b.cents;
    for (const [u, v] of Object.entries(sh)) bal[u] = (bal[u] ?? 0) - v;
  }
  for (const p of s.settled) {
    if (p.from in bal && p.to in bal) {
      bal[p.from] = (bal[p.from] ?? 0) + p.cents;
      bal[p.to] = (bal[p.to] ?? 0) - p.cents;
    }
  }
  return bal;
}

/** Fewest payments: the biggest debtor pays the biggest creditor, repeat. */
function plan(s: State, c: C): Line[] {
  const bal = balances(s, c);
  const ids = c.members.map((m) => m.id);
  const debt = ids.map((id) => ({ id, c: -(bal[id] ?? 0) })).filter((x) => x.c > 0).sort((a, b) => b.c - a.c);
  const cred = ids.map((id) => ({ id, c: bal[id] ?? 0 })).filter((x) => x.c > 0).sort((a, b) => b.c - a.c);
  const out: Line[] = [];
  let i = 0;
  let j = 0;
  while (i < debt.length && j < cred.length) {
    const d = debt[i]!;
    const k = cred[j]!;
    const amt = Math.min(d.c, k.c);
    if (amt > 0) out.push({ from: d.id, to: k.id, cents: amt });
    d.c -= amt;
    k.c -= amt;
    if (d.c === 0) i++;
    if (k.c === 0) j++;
  }
  return out;
}

const owedTo = (s: State, c: C, from: string, to: string) => plan(s, c).find((l) => l.from === from && l.to === to)?.cents ?? 0;

export default defineApp<State, Action, Local>({
  name: "Subscription split",
  summary: (s, ctx) => {
    if (s.bills.length === 0) return `${CHAT.title} No bills yet.`;
    const n = plan(s, ctx).length;
    return n === 0 ? `${CHAT.title} All settled.` : `${CHAT.title} ${n} ${n === 1 ? "payment" : "payments"} to settle.`;
  },

  init: (ctx) => {
    const find = (name: string) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? ctx.members[0]?.id ?? "";
    const bills: Bill[] = CHAT.bills.slice(0, MAX_BILLS).map((b, i) => ({
      id: `p${i}`,
      label: clean(b.label).slice(0, MAX_LABEL),
      cents: b.cents,
      payer: find(b.payer),
      skip: [],
    }));
    return { bills, settled: [] };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    switch (a.t) {
      case "skip": {
        if (typeof a.bill !== "string") return s;
        const b = s.bills.find((x) => x.id === a.bill);
        if (!b || b.payer === m.user || !inChat(ctx, b.payer)) return s;
        const skip = b.skip.includes(m.user) ? b.skip.filter((u) => u !== m.user) : [...b.skip, m.user];
        return { ...s, bills: s.bills.map((x) => (x.id === b.id ? { ...x, skip } : x)) };
      }
      case "add": {
        if (typeof a.label !== "string" || !isCents(a.cents)) return s;
        const label = clean(a.label);
        if (!label || label.length > MAX_LABEL || s.bills.length >= MAX_BILLS) return s;
        if (s.bills.some((x) => x.label.toLowerCase() === label.toLowerCase())) return s;
        return { ...s, bills: [...s.bills, { id: `b${m.seq}`, label, cents: a.cents, payer: m.user, skip: [] }] };
      }
      case "remove": {
        if (typeof a.bill !== "string") return s;
        const b = s.bills.find((x) => x.id === a.bill);
        if (!b || b.payer !== m.user) return s;
        return { ...s, bills: s.bills.filter((x) => x.id !== b.id) };
      }
      case "pay": {
        if (typeof a.to !== "string" || !isCents(a.cents)) return s;
        if (a.to === m.user || !inChat(ctx, a.to) || s.settled.length >= MAX_PAID) return s;
        if (a.cents > owedTo(s, ctx, m.user, a.to)) return s;
        return { ...s, settled: [...s.settled, { id: `s${m.seq}`, from: m.user, to: a.to, cents: a.cents }] };
      }
    }
    return s;
  },

  // Someone left: a bill they paid goes to the first person still here, and their skips and
  // payments go away. Someone joined: they share every bill at once.
  onMembers: (s, ctx) => {
    const ids = ctx.members.map((m) => m.id);
    if (ids.length === 0) return s;
    const bills = s.bills.map((b) => {
      const payer = ids.includes(b.payer) ? b.payer : ids[0]!;
      const skip = b.skip.filter((u) => ids.includes(u) && u !== payer);
      return payer === b.payer && skip.length === b.skip.length ? b : { ...b, payer, skip };
    });
    const settled = s.settled.filter((p) => ids.includes(p.from) && ids.includes(p.to));
    if (bills.every((b, i) => b === s.bills[i]) && settled.length === s.settled.length) return s;
    return { bills, settled };
  },

  invariants: {
    "every bill has whole cents above zero, a unique id and a label of 1 to 40 characters": (s) =>
      new Set(s.bills.map((b) => b.id)).size === s.bills.length &&
      s.bills.every((b) => isCents(b.cents) && b.label.length >= 1 && b.label.length <= MAX_LABEL && b.label === clean(b.label)),
    "every bill payer is in the chat": (s, ctx) => ctx.members.length === 0 || s.bills.every((b) => inChat(ctx, b.payer)),
    "skip lists have no duplicates, no payer, no one outside the chat, and never cover everyone": (s, ctx) =>
      s.bills.every(
        (b) =>
          new Set(b.skip).size === b.skip.length &&
          !b.skip.includes(b.payer) &&
          b.skip.every((u) => inChat(ctx, u)) &&
          (ctx.members.length === 0 || ctx.members.some((m) => !b.skip.includes(m.id))),
      ),
    "each bill's shares add up to its cents and net balances add up to zero": (s, ctx) => {
      if (ctx.members.length === 0) return true;
      const shared = s.bills.every((b) => !inChat(ctx, b.payer) || Object.values(sharesOf(b, ctx)).reduce((x, y) => x + y, 0) === b.cents);
      return shared && Object.values(balances(s, ctx)).reduce((x, y) => x + y, 0) === 0;
    },
    "every payment is whole cents between two different people in the chat": (s, ctx) =>
      new Set(s.settled.map((p) => p.id)).size === s.settled.length &&
      s.settled.every((p) => isCents(p.cents) && p.from !== p.to && inChat(ctx, p.from) && inChat(ctx, p.to)),
    "at most 10 bills and 12 payments": (s) => s.bills.length <= MAX_BILLS && s.settled.length <= MAX_PAID,
  },

  transitions: {
    "a skip flips only the actor on that bill and changes nothing else": (p, n, a, m) =>
      a.t !== "skip" ||
      p === n ||
      (same(p.settled, n.settled) &&
        p.bills.length === n.bills.length &&
        p.bills.every((b, i) => {
          const x = n.bills[i]!;
          if (b.id !== a.bill) return same(b, x);
          return (
            x.id === b.id &&
            x.label === b.label &&
            x.cents === b.cents &&
            x.payer === b.payer &&
            b.payer !== m.user &&
            b.skip.includes(m.user) !== x.skip.includes(m.user) &&
            same(b.skip.filter((u) => u !== m.user), x.skip.filter((u) => u !== m.user))
          );
        })),
    "an add appends one bill last, paid by the actor, with the cents asked": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.bills.at(-1);
      return (
        n.bills.length === p.bills.length + 1 &&
        !!last &&
        last.id === `b${m.seq}` &&
        last.label === clean(a.label) &&
        last.cents === a.cents &&
        last.payer === m.user &&
        last.skip.length === 0 &&
        same(n.bills.slice(0, -1), p.bills) &&
        same(p.settled, n.settled)
      );
    },
    "only a bill's payer removes it, and exactly that bill goes": (p, n, a, m) =>
      a.t !== "remove" ||
      p === n ||
      (p.bills.find((b) => b.id === a.bill)?.payer === m.user && same(n.bills, p.bills.filter((b) => b.id !== a.bill)) && same(p.settled, n.settled)),
    "a pay appends one payment from the actor and leaves the bills alone": (p, n, a, m) =>
      a.t !== "pay" ||
      p === n ||
      (n.settled.length === p.settled.length + 1 &&
        same(n.settled.slice(0, -1), p.settled) &&
        same(n.settled.at(-1), { id: `s${m.seq}`, from: m.user, to: a.to, cents: a.cents }) &&
        same(p.bills, n.bills)),
    "a pay never exceeds what the actor owed that person before": (p, n, a, m, ctx) =>
      a.t !== "pay" || p === n || a.cents <= owedTo(p, ctx, m.user, a.to),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const k = r.next();
    const lines = plan(s, ctx).filter((l) => l.from === user);
    const mine = s.bills.filter((b) => b.payer === user);
    if (k < 0.35 && lines.length) {
      const l = r.pick(lines);
      return { t: "pay", to: l.to, cents: r.next() < 0.8 ? (r.next() < 0.5 ? l.cents : r.int(l.cents) + 1) : l.cents + 1 };
    }
    if (k < 0.6 && s.bills.length) return { t: "skip", bill: r.pick(s.bills).id };
    if (k < 0.85 || s.bills.length === 0) {
      return {
        t: "add",
        label: r.pick(["Disney plus", "Icloud storage", "  Youtube premium ", "", "Netflix", "Hulu (no ads)", "Gym"]),
        cents: r.next() < 0.1 ? 0 : r.int(5000) + 1,
      };
    }
    if (mine.length && k < 0.95) return { t: "remove", bill: r.pick(mine).id };
    return { t: "skip", bill: r.pick(s.bills).id };
  },

  local: { tab: "pay", label: "", amount: "", toast: 0, msg: "" },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const c = { members };
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const lines = plan(state, c);
    const ordered = [...lines.filter((l) => l.from === me), ...lines.filter((l) => l.from !== me)].slice(0, 4);
    const bal = balances(state, c)[me] ?? 0;
    const balText = bal < 0 ? `You owe ${money(bal)}` : bal > 0 ? `You are owed ${money(bal)}` : "You are even";
    const subtitle = state.bills.length === 0 ? "No bills yet" : lines.length === 0 ? "All settled" : `${lines.length} ${lines.length === 1 ? "payment" : "payments"} to settle`;
    const cents = parseCents(local.amount);
    const label = clean(local.label);
    const canAdd = label.length > 0 && label.length <= MAX_LABEL && cents !== null && cents >= 1 && cents <= MAX_CENTS && state.bills.length < MAX_BILLS;
    const submit = () => {
      if (!canAdd || cents === null) return;
      dispatch({ t: "add", label, cents });
      setLocal({ label: "", amount: "", toast: local.toast + 1, msg: "Bill added" });
    };
    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={subtitle} />
        <div style={{ fontWeight: 600, minHeight: 24 }}>{balText}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <Button kind={local.tab === "pay" ? "secondary" : "deemphasized"} onClick={() => setLocal({ tab: "pay" })}>
            Payments
          </Button>
          <Button kind={local.tab === "bills" ? "secondary" : "deemphasized"} onClick={() => setLocal({ tab: "bills" })}>
            Bills
          </Button>
        </div>
        {local.tab === "pay" ? (
          <div style={{ display: "grid", gap: 4 }}>
            {ordered.length === 0 ? <small>{state.bills.length === 0 ? "Add a bill to start" : "Nothing to pay"}</small> : null}
            {ordered.map((l, i) => (
              <div key={`${l.from}-${l.to}`} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                <Avatar user={l.from} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    {l.from === me ? "You pay" : `${nameOf(l.from)} pays`} {l.to === me ? "you" : nameOf(l.to)}
                  </div>
                  <small>{money(l.cents)}</small>
                </div>
                {l.from === me ? (
                  <Button
                    kind={i === 0 ? "primary" : "secondary"}
                    onClick={() => {
                      dispatch({ t: "pay", to: l.to, cents: l.cents });
                      setLocal({ toast: local.toast + 1, msg: "Marked paid" });
                    }}
                  >
                    I paid
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div style={{ display: "grid", gap: 2 }}>
              {state.bills.map((b) => {
                const sharers = members.map((m) => m.id).filter((u) => !b.skip.includes(u));
                return (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{b.label}</div>
                      <small>
                        {money(b.cents)} · {b.payer === me ? "you" : nameOf(b.payer)}
                      </small>
                    </div>
                    <Facepile users={sharers} max={3} size={20} />
                    {b.payer === me ? (
                      <Button kind="deemphasized" onClick={() => dispatch({ t: "remove", bill: b.id })}>
                        Remove
                      </Button>
                    ) : (
                      <Button kind="secondary" onClick={() => dispatch({ t: "skip", bill: b.id })}>
                        {b.skip.includes(me) ? "Include" : "Skip"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            {state.bills.length < MAX_BILLS ? (
              <form
                style={{ display: "flex", gap: 8, marginTop: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <input
                  style={{ flex: 2, minWidth: 0 }}
                  value={local.label}
                  maxLength={MAX_LABEL}
                  placeholder="Bill name"
                  aria-label="Bill name"
                  onInput={(e) => setLocal({ label: e.currentTarget.value })}
                />
                <input
                  style={{ flex: 1, minWidth: 0 }}
                  value={local.amount}
                  inputMode="decimal"
                  placeholder="Amount"
                  aria-label="Amount"
                  onInput={(e) => setLocal({ amount: e.currentTarget.value })}
                />
                <Button kind="deemphasized" disabled={!canAdd} onClick={submit}>
                  Add
                </Button>
              </form>
            ) : null}
          </div>
        )}
        {local.toast ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
