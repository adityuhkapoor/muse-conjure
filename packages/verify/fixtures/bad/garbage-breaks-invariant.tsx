// Bad fixture: the total is checked for range but not for whole cents, so a malformed 0.5 gets in.
// Expect: stage invariants, rule garbage-breaks-invariant.
import { defineApp, Button, CardHeader, Facepile, SystemLine } from "@muse/app";

// Split a bill in whole cents. The payer sets the total; people join or leave the split; anyone
// can fix their own share. Everyone else shares the rest evenly, and leftover cents go one each
// to the first people by id, so shares always add up to the total exactly.

type State = {
  payer: string;
  totalCents: number;
  people: string[];
  members: string[];
  fixed: Record<string, number>;
  shares: Record<string, number>;
  paid: string[];
};
type Action =
  | { t: "total"; cents: number }
  | { t: "join" }
  | { t: "leave" }
  | { t: "fix"; cents: number }
  | { t: "unfix" }
  | { t: "paid" };

const MAX_CENTS = 100_000_00;

const isObj = (a: unknown): a is Record<string, unknown> => typeof a === "object" && a !== null && !Array.isArray(a);
const isCents = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_CENTS;
const money = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

/** Shares for everyone in the split, or null when the fixed shares do not fit the total. */
function split(total: number, people: string[], fixed: Record<string, number>): Record<string, number> | null {
  const sorted = [...people].sort();
  const flex = sorted.filter((p) => !(p in fixed));
  let rest = total;
  for (const p of sorted) if (p in fixed) rest -= fixed[p]!;
  if (rest < 0) return null;
  if (flex.length === 0 && rest !== 0) return null;
  const out: Record<string, number> = {};
  const each = flex.length ? Math.floor(rest / flex.length) : 0;
  let extra = flex.length ? rest - each * flex.length : 0;
  for (const p of sorted) {
    if (p in fixed) out[p] = fixed[p]!;
    else {
      out[p] = each + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
    }
  }
  return out;
}

function withSplit(s: State, next: Pick<State, "totalCents" | "people" | "fixed">): State {
  const shares = split(next.totalCents, next.people, next.fixed);
  if (!shares) return s;
  return { ...s, ...next, shares, paid: s.paid.filter((p) => next.people.includes(p)) };
}

function dropKey(r: Record<string, number>, key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(r).sort()) if (k !== key) out[k] = r[k]!;
  return out;
}

export default defineApp<State, Action>({
  name: "Split the bill",

  summary: (s) => {
    if (s.people.length === 0) return `${money(s.totalCents)} bill. No one in the split yet.`;
    const open = s.people.filter((p) => p !== s.payer && !s.paid.includes(p)).length;
    return `${money(s.totalCents)} split ${s.people.length} ways. ${open} still to pay.`;
  },

  init: (ctx) => {
    const people = ctx.members.map((m) => m.id).sort();
    return {
      payer: ctx.members[0]?.id ?? "",
      totalCents: 0,
      people,
      members: people,
      fixed: {},
      shares: Object.fromEntries(people.map((p) => [p, 0])),
      paid: [],
    };
  },

  reduce: (s, action, meta) => {
    const a: unknown = action;
    const u = meta.user;
    if (!isObj(a) || !s.members.includes(u)) return s;
    switch (a.t) {
      case "total":
        if (u !== s.payer || typeof a.cents !== "number" || a.cents < 0 || a.cents > MAX_CENTS) return s;
        return withSplit(s, { totalCents: a.cents, people: s.people, fixed: s.fixed });
      case "join":
        if (s.people.includes(u)) return s;
        return withSplit(s, { totalCents: s.totalCents, people: [...s.people, u].sort(), fixed: s.fixed });
      case "leave":
        if (!s.people.includes(u) || u === s.payer) return s;
        return withSplit(s, { totalCents: s.totalCents, people: s.people.filter((p) => p !== u), fixed: dropKey(s.fixed, u) });
      case "fix":
        if (!s.people.includes(u) || !isCents(a.cents)) return s;
        return withSplit(s, { totalCents: s.totalCents, people: s.people, fixed: { ...s.fixed, [u]: a.cents } });
      case "unfix":
        if (!(u in s.fixed)) return s;
        return withSplit(s, { totalCents: s.totalCents, people: s.people, fixed: dropKey(s.fixed, u) });
      case "paid":
        if (!s.people.includes(u) || u === s.payer || s.paid.includes(u)) return s;
        return { ...s, paid: [...s.paid, u].sort() };
      default:
        return s;
    }
  },

  invariants: {
    "shares add up to the total": (s) =>
      s.people.length === 0 || s.people.reduce((sum, p) => sum + (s.shares[p] ?? 0), 0) === s.totalCents,
    "shares are whole cents, not negative": (s) => Object.values(s.shares).every((c) => Number.isInteger(c) && c >= 0),
    "the total is whole cents in range": (s) => Number.isInteger(s.totalCents) && s.totalCents >= 0 && s.totalCents <= MAX_CENTS,
    "everyone in the split has a share and no one else does": (s) =>
      Object.keys(s.shares).sort().join() === [...s.people].sort().join(),
    "even shares differ by at most a cent": (s) => {
      const flex = s.people.filter((p) => !(p in s.fixed)).map((p) => s.shares[p] ?? 0);
      return flex.length === 0 || Math.max(...flex) - Math.min(...flex) <= 1;
    },
    "fixed shares are kept": (s) => Object.keys(s.fixed).every((p) => s.people.includes(p) && s.shares[p] === s.fixed[p]),
    "the payer stays in the split": (s) => s.people.includes(s.payer),
    "only people in the split mark paid, never the payer": (s) => s.paid.every((p) => s.people.includes(p) && p !== s.payer),
    "people are sorted and unique": (s) => s.people.every((p, i) => i === 0 || p > s.people[i - 1]!),
  },

  arbitrary: (s, user, r) => {
    const roll = r.int(100);
    if (roll < 25) return { t: "total", cents: r.pick([0, 1, 99, 1000, 4999, 12345, 100_000_00, 100_000_01]) };
    if (roll < 40) return { t: "join" };
    if (roll < 52) return { t: "leave" };
    if (roll < 70) return { t: "fix", cents: r.pick([0, 1, 250, 1000, Math.floor(s.totalCents / 2), s.totalCents + 1]) };
    if (roll < 80) return { t: "unfix" };
    return { t: "paid" };
  },

  view: ({ state, me, members, dispatch }) => {
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const mine = state.shares[me];
    const inSplit = state.people.includes(me);
    return (
      <div>
        <CardHeader title={`${money(state.totalCents)} bill`} subtitle={`Paid by ${nameOf(state.payer)}`} />
        <div style={{ display: "grid", gap: 4 }}>
          {state.people.map((p) => (
            <div key={p} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{nameOf(p)}</span>
              <span>
                {money(state.shares[p] ?? 0)}
                {state.paid.includes(p) ? " · paid" : ""}
              </span>
            </div>
          ))}
        </div>
        <Facepile users={state.paid} max={5} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {inSplit ? (
            me !== state.payer ? (
              <Button kind="secondary" onClick={() => dispatch({ t: "leave" })}>
                Leave
              </Button>
            ) : null
          ) : (
            <Button onClick={() => dispatch({ t: "join" })}>Join</Button>
          )}
          {inSplit && me !== state.payer && !state.paid.includes(me) ? (
            <Button onClick={() => dispatch({ t: "paid" })}>Mark paid</Button>
          ) : null}
        </div>
        {mine !== undefined && me in state.fixed ? (
          <SystemLine actor={nameOf(me)}>fixed their share at {money(mine)}</SystemLine>
        ) : null}
      </div>
    );
  },
});
