import { defineApp, Avatar, Button, CardHeader, Toast } from "@muse/app";

// Friendsgiving split: everyone's receipts, split evenly across the chat, and the fewest payments
// that settle it. Payments are marked sent by the person paying or the person receiving.

const CHAT = {
  title: "Friendsgiving split",
  items: [
    { payer: "Gabe", label: "Turkey, Trader Joe's", cents: 4780 },
    { payer: "Amir", label: "Drinks", cents: 3245 },
    { payer: "Jess", label: "Sides", cents: 3815 },
    { payer: "Dani", label: "Pie from the bakery on 5th", cents: 2400 },
    { payer: "Gabe", label: "Paper plates and cups, Target", cents: 1160 },
    { payer: "Jess", label: "Stuffing mix", cents: 625 },
    { payer: "Amir", label: "Ice", cents: 599 },
    { payer: "Dani", label: "Candles and napkins", cents: 940 },
    { payer: "Gabe", label: "Cranberry sauce", cents: 350 },
  ],
};

type Item = { id: string; label: string; cents: number; payer: string };
type State = { items: Item[]; settled: string[] };
type Action =
  | { t: "add"; label: string; cents: number }
  | { t: "remove"; item: string }
  | { t: "sent"; from: string; to: string };
type Local = { panel: "none" | "items" | "add"; label: string; amount: string; toast: number; page: number };
type C = { members: { id: string }[] };
type Pay = { from: string; to: string; cents: number };

const MAX_ITEMS = 20;
const MAX_LABEL = 40;
const MAX_CENTS = 10_000_000;
const PAGE = 4;

const inChat = (ctx: C, id: string) => ctx.members.some((m) => m.id === id);
const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const isCents = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_CENTS;
const money = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const payKey = (p: { from: string; to: string }) => `${p.from}>${p.to}`;
const itemKey = (i: Item) => `${i.id}|${i.label}|${i.cents}|${i.payer}`;
const itemsKey = (s: State) => s.items.map(itemKey).join(";");
const totalOf = (s: State) => s.items.reduce((a, i) => a + i.cents, 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function parseCents(text: string): number | null {
  const m = /^\$?\s*(\d{1,5})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ""));
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}

/** Even shares in member order; the first `total % n` people carry one extra cent. */
function shares(total: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));
}

/** Paid minus fair share, per member, in member order. */
function balances(s: State, ctx: C): number[] {
  const sh = shares(totalOf(s), ctx.members.length);
  return ctx.members.map((m, i) => s.items.filter((it) => it.payer === m.id).reduce((a, it) => a + it.cents, 0) - (sh[i] ?? 0));
}

/** Greedy: the biggest debtor pays the biggest creditor the smaller of the two; ties by member order. */
function plan(s: State, ctx: C): Pay[] {
  const b = balances(s, ctx);
  const debt = ctx.members.map((m, i) => ({ id: m.id, i, c: -(b[i] ?? 0) })).filter((x) => x.c > 0);
  const cred = ctx.members.map((m, i) => ({ id: m.id, i, c: b[i] ?? 0 })).filter((x) => x.c > 0);
  const by = (x: { i: number; c: number }, y: { i: number; c: number }) => y.c - x.c || x.i - y.i;
  const out: Pay[] = [];
  while (debt.length && cred.length) {
    debt.sort(by);
    cred.sort(by);
    const d = debt[0]!;
    const c = cred[0]!;
    const x = Math.min(d.c, c.c);
    out.push({ from: d.id, to: c.id, cents: x });
    d.c -= x;
    c.c -= x;
    if (d.c === 0) debt.shift();
    if (c.c === 0) cred.shift();
  }
  return out;
}

const payersInChat = (s: State, ctx: C) => s.items.every((i) => inChat(ctx, i.payer));

export default defineApp<State, Action, Local>({
  name: "Bill split",
  summary: (s, ctx) => {
    const pays = plan(s, ctx);
    const done = pays.filter((p) => s.settled.includes(payKey(p))).length;
    if (!s.items.length) return `${CHAT.title}. No items yet.`;
    return `${CHAT.title}: ${money(totalOf(s))} total · ${done} of ${pays.length} payments sent`;
  },

  init: (ctx) => {
    if (!ctx.members.length) return { items: [], settled: [] };
    const items: Item[] = CHAT.items.slice(0, MAX_ITEMS).map((it, n) => ({
      id: `i${n}`,
      label: clean(it.label).slice(0, MAX_LABEL),
      cents: it.cents,
      payer: ctx.members.find((m) => m.name.toLowerCase() === it.payer.toLowerCase())?.id ?? ctx.members[0]!.id,
    }));
    return { items, settled: [] };
  },

  reduce: (s, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    const a = action as unknown as Record<string, unknown>;
    if (a.t === "add") {
      if (typeof a.label !== "string" || !isCents(a.cents) || s.items.length >= MAX_ITEMS) return s;
      const label = clean(a.label);
      if (!label || label.length > MAX_LABEL) return s;
      return { items: [...s.items, { id: `e${meta.seq}`, label, cents: a.cents, payer: meta.user }], settled: [] };
    }
    if (a.t === "remove") {
      if (typeof a.item !== "string") return s;
      const it = s.items.find((i) => i.id === a.item);
      if (!it || it.payer !== meta.user) return s;
      return { items: s.items.filter((i) => i.id !== it.id), settled: [] };
    }
    if (a.t === "sent") {
      if (typeof a.from !== "string" || typeof a.to !== "string") return s;
      if (meta.user !== a.from && meta.user !== a.to) return s;
      const from = a.from;
      const to = a.to;
      if (!plan(s, ctx).some((p) => p.from === from && p.to === to)) return s;
      const k = `${from}>${to}`;
      return { ...s, settled: s.settled.includes(k) ? s.settled.filter((x) => x !== k) : [...s.settled, k] };
    }
    return s;
  },

  // Someone left: their items go to the first person still here, and the payments are worked out
  // again. Settled marks that no longer match a payment are dropped.
  onMembers: (s, ctx) => {
    const first = ctx.members[0]?.id;
    if (!first) return s;
    const moved = s.items.some((i) => !inChat(ctx, i.payer));
    const items = moved ? s.items.map((i) => (inChat(ctx, i.payer) ? i : { ...i, payer: first })) : s.items;
    const base: State = { items, settled: moved ? [] : s.settled };
    const keys = plan(base, ctx).map(payKey);
    const settled = base.settled.filter((k) => keys.includes(k));
    if (!moved && settled.length === s.settled.length) return s;
    return { items, settled };
  },

  invariants: {
    "items have whole positive cents, a 1 to 40 character label and a unique id, at most 20": (s) =>
      s.items.length <= MAX_ITEMS &&
      new Set(s.items.map((i) => i.id)).size === s.items.length &&
      s.items.every((i) => Number.isInteger(i.cents) && i.cents > 0 && i.label.length > 0 && i.label.length <= MAX_LABEL),
    "every payer is in the chat": (s, ctx) => ctx.members.length === 0 || payersInChat(s, ctx),
    "every settled mark is a payment in the plan, once": (s, ctx) => {
      const keys = plan(s, ctx).map(payKey);
      return new Set(s.settled).size === s.settled.length && s.settled.every((k) => keys.includes(k));
    },
    "shares add up to the total and balances add up to zero": (s, ctx) => {
      if (ctx.members.length === 0) return true;
      const sh = shares(totalOf(s), ctx.members.length);
      return sum(sh) === totalOf(s) && Math.max(...sh) - Math.min(...sh) <= 1 && (!payersInChat(s, ctx) || sum(balances(s, ctx)) === 0);
    },
    "the plan has at most one fewer payments than people and settles every balance": (s, ctx) => {
      const pays = plan(s, ctx);
      if (pays.length > Math.max(0, ctx.members.length - 1)) return false;
      if (!pays.every((p) => Number.isInteger(p.cents) && p.cents > 0 && p.from !== p.to)) return false;
      if (!payersInChat(s, ctx)) return true;
      const b = balances(s, ctx);
      const left: Record<string, number> = {};
      ctx.members.forEach((m, i) => (left[m.id] = b[i] ?? 0));
      for (const p of pays) {
        left[p.from] = (left[p.from] ?? 0) + p.cents;
        left[p.to] = (left[p.to] ?? 0) - p.cents;
      }
      return Object.values(left).every((v) => v === 0);
    },
  },

  transitions: {
    "an add puts one item last, paid by the actor, and clears the sent marks": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.items.at(-1);
      return (
        typeof a.label === "string" &&
        n.items.length === p.items.length + 1 &&
        !!last &&
        last.label === clean(a.label) &&
        last.cents === a.cents &&
        last.payer === m.user &&
        last.id === `e${m.seq}` &&
        n.items.slice(0, -1).map(itemKey).join(";") === itemsKey(p) &&
        n.settled.length === 0
      );
    },
    "a remove deletes exactly that item, only for its payer, and clears the sent marks": (p, n, a, m) => {
      if (a.t !== "remove" || p === n) return true;
      return (
        p.items.some((i) => i.id === a.item && i.payer === m.user) &&
        n.items.map(itemKey).join(";") === p.items.filter((i) => i.id !== a.item).map(itemKey).join(";") &&
        n.settled.length === 0
      );
    },
    "a sent toggles one payment's mark, only for the person paying or receiving, and leaves items alone": (p, n, a, m, ctx) => {
      if (a.t !== "sent" || p === n) return true;
      if (typeof a.from !== "string" || typeof a.to !== "string") return false;
      const k = `${a.from}>${a.to}`;
      return (
        (m.user === a.from || m.user === a.to) &&
        plan(p, ctx).some((x) => x.from === a.from && x.to === a.to) &&
        p.settled.includes(k) !== n.settled.includes(k) &&
        p.settled.filter((x) => x !== k).join() === n.settled.filter((x) => x !== k).join() &&
        itemsKey(p) === itemsKey(n)
      );
    },
    "items change only through add and remove": (p, n, a) => p === n || a.t === "add" || a.t === "remove" || itemsKey(p) === itemsKey(n),
    "sent marks change only through add, remove and sent": (p, n, a) => p === n || a.t !== "sent" ? true : itemsKey(p) === itemsKey(n),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const k = r.next();
    const pays = plan(s, ctx);
    if (k < 0.4 || (!pays.length && !s.items.length)) {
      return { t: "add", label: r.pick(["Wine", "Rolls", "  Gravy ", "", "Ice cream"]), cents: r.int(6000) + (r.next() < 0.1 ? 0 : 1) };
    }
    if (k < 0.55 && s.items.length) {
      const mine = s.items.filter((i) => i.payer === user);
      return { t: "remove", item: r.pick(mine.length ? mine : s.items).id };
    }
    if (pays.length) {
      const p = r.pick(pays);
      return { t: "sent", from: p.from, to: p.to };
    }
    return { t: "add", label: "Wine", cents: 1200 };
  },

  local: { panel: "none", label: "", amount: "", toast: 0, page: 0 },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const c = { members };
    const pays = plan(state, c);
    const bal = balances(state, c);
    const total = totalOf(state);
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const done = pays.filter((p) => state.settled.includes(payKey(p))).length;
    const sub = !state.items.length
      ? "No items yet"
      : !pays.length
        ? `${money(total)} total · nothing to settle`
        : done === pays.length
          ? `${money(total)} total · all settled`
          : `${money(total)} total · ${done} of ${pays.length} sent`;
    const cents = parseCents(local.amount);
    const canSave = clean(local.label).length > 0 && cents !== null && cents > 0 && state.items.length < MAX_ITEMS;
    const save = () => {
      if (!canSave || cents === null) return;
      dispatch({ t: "add", label: clean(local.label).slice(0, MAX_LABEL), cents });
      setLocal({ panel: "none", label: "", amount: "", toast: local.toast + 1 });
    };
    const pages = Math.max(1, Math.ceil(state.items.length / PAGE));
    const page = Math.min(local.page, pages - 1);
    const shown = state.items.slice(page * PAGE, page * PAGE + PAGE);

    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={sub} />

        {local.panel === "items" ? (
          <div style={{ display: "grid", gap: 4 }}>
            {shown.map((i) => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                <Avatar user={i.payer} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{i.label}</div>
                  <small>{`${nameOf(i.payer)} · ${money(i.cents)}`}</small>
                </div>
                {i.payer === me ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "remove", item: i.id })}>
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 4 }}>
            {pays.map((p) => {
              const isDone = state.settled.includes(payKey(p));
              const mine = p.from === me || p.to === me;
              return (
                <div key={payKey(p)} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                  <Avatar user={p.from} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {`${nameOf(p.from)} ${p.from === me ? "pay" : "pays"} ${nameOf(p.to)} ${money(p.cents)}`}
                    {isDone ? <small>{" · sent"}</small> : null}
                  </div>
                  {mine ? (
                    <Button kind={isDone ? "deemphasized" : "secondary"} onClick={() => dispatch({ t: "sent", from: p.from, to: p.to })}>
                      {isDone ? "Undo" : "Sent"}
                    </Button>
                  ) : null}
                </div>
              );
            })}
            {pays.length > 0 && done === pays.length ? <small>All settled</small> : null}
          </div>
        )}

        {local.panel === "none" ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 8 }}>
            {members.map((m, i) => {
              const b = bal[i] ?? 0;
              return (
                <small key={m.id}>{`${nameOf(m.id)} ${b > 0 ? "up" : b < 0 ? "down" : "even"} ${money(Math.abs(b))}`}</small>
              );
            })}
          </div>
        ) : null}

        {local.panel === "add" ? (
          <form
            style={{ display: "grid", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ flex: 1, minWidth: 0 }}
                value={local.label}
                maxLength={MAX_LABEL}
                placeholder="What you paid for"
                aria-label="Item"
                onInput={(e) => setLocal({ label: e.currentTarget.value })}
              />
              <input
                style={{ width: 96 }}
                value={local.amount}
                inputMode="decimal"
                placeholder="12.50"
                aria-label="Amount"
                onInput={(e) => setLocal({ amount: e.currentTarget.value })}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button kind="secondary" disabled={!canSave} onClick={save}>
                Save
              </Button>
              <Button kind="deemphasized" onClick={() => setLocal({ panel: "none", label: "", amount: "" })}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button kind="primary" disabled={state.items.length >= MAX_ITEMS} onClick={() => setLocal({ panel: "add" })}>
              Add
            </Button>
            <Button kind="deemphasized" onClick={() => setLocal({ panel: local.panel === "items" ? "none" : "items", page: 0 })}>
              {local.panel === "items" ? "Back" : `${state.items.length} items`}
            </Button>
            {local.panel === "items" && pages > 1 ? (
              <Button kind="deemphasized" onClick={() => setLocal({ page: (page + 1) % pages })}>
                More
              </Button>
            ) : null}
          </div>
        )}
        {local.toast ? <Toast key={local.toast}>Item added</Toast> : null}
      </div>
    );
  },
});
