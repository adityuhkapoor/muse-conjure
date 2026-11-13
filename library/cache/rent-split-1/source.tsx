import { defineApp, Avatar, Button, CardHeader, Toast } from "@muse/app";

// Rent split: each room has a rent in cents that must add up to the rent total.
// Utilities are split evenly. Everyone sees one monthly total per person.

const C = {
  title: "Unit 4b monthly rent",
  rentTotal: 240000,
  utilsTotal: 18000,
  rooms: [
    { name: "Tyler", label: "Attached bathroom", rent: 80000 },
    { name: "Mina", label: "Middle room", rent: 65000 },
    { name: "Maya", label: "", rent: 47500 },
    { name: "Abby", label: "", rent: 47500 },
  ],
};

type Room = { id: string; label: string; name: string; rent: number; owner: string | null };
type State = { title: string; rentTotal: number; utilsTotal: number; rooms: Room[] };
type Action =
  | { t: "swap"; from: string; to: string; amount: number }
  | { t: "setUtils"; total: number };
type Local = { open: boolean; from: string; to: string; amount: string; utils: string; toast: number };

const MAX_UTILS = 100000;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const ownerFor = (ctx: { members: { id: string; name: string }[] }, name: string): string | null =>
  ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null;

const fmt = (cents: number) => {
  const d = Math.floor(cents / 100);
  const r = cents % 100;
  const head = String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return "$" + head + (r ? "." + (r < 10 ? "0" : "") + r : "");
};

/** Utilities share per room, leftover cents go to the first rooms. */
const utilShares = (s: State): number[] => {
  const n = Math.max(1, s.rooms.length);
  const base = Math.floor(s.utilsTotal / n);
  const rem = s.utilsTotal - base * n;
  return s.rooms.map((_, i) => base + (i < rem ? 1 : 0));
};
const totals = (s: State): number[] => {
  const u = utilShares(s);
  return s.rooms.map((r, i) => r.rent + u[i]!);
};

function swap(s: State, from: unknown, to: unknown, amount: unknown): State {
  if (typeof from !== "string" || typeof to !== "string" || typeof amount !== "number") return s;
  if (from === to || !Number.isInteger(amount) || amount <= 0) return s;
  const a = s.rooms.find((r) => r.id === from);
  const b = s.rooms.find((r) => r.id === to);
  if (!a || !b || amount > a.rent) return s;
  return {
    ...s,
    rooms: s.rooms.map((r) => (r.id === a.id ? { ...r, rent: r.rent - amount } : r.id === b.id ? { ...r, rent: r.rent + amount } : r)),
  };
}

function setUtils(s: State, total: unknown): State {
  if (typeof total !== "number" || !Number.isInteger(total) || total < 0 || total > MAX_UTILS || total === s.utilsTotal) return s;
  return { ...s, utilsTotal: total };
}

export default defineApp<State, Action, Local>({
  name: "Rent split",
  summary: (s) => `${s.title} · ${fmt(s.rentTotal)} rent + ${fmt(s.utilsTotal)} utilities`,

  init: (ctx) => ({
    title: C.title,
    rentTotal: C.rentTotal,
    utilsTotal: C.utilsTotal,
    rooms: C.rooms.map((r, i) => ({ id: `r${i}`, label: r.label, name: r.name, rent: r.rent, owner: ownerFor(ctx, r.name) })),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "swap") return swap(state, action.from, action.to, action.amount);
    if (action.t === "setUtils") return setUtils(state, action.total);
    return state;
  },

  onMembers: (state, ctx) => {
    const rooms = state.rooms.map((r) => {
      const o = ownerFor(ctx, r.name);
      return o === r.owner ? r : { ...r, owner: o };
    });
    return rooms.some((r, i) => r !== state.rooms[i]) ? { ...state, rooms } : state;
  },

  invariants: {
    "room rents add up to the rent total": (s) => s.rooms.reduce((n, r) => n + r.rent, 0) === s.rentTotal,
    "every rent is a whole number of cents, zero or more": (s) => s.rooms.every((r) => Number.isInteger(r.rent) && r.rent >= 0),
    "room ids are unique": (s) => new Set(s.rooms.map((r) => r.id)).size === s.rooms.length,
    "owners are in the chat and own one room each": (s, ctx) => {
      const owners = s.rooms.map((r) => r.owner).filter((o): o is string => o !== null);
      return owners.every((o) => inChat(ctx, o)) && new Set(owners).size === owners.length;
    },
    "utilities are a whole number from 0 to 100000": (s) => Number.isInteger(s.utilsTotal) && s.utilsTotal >= 0 && s.utilsTotal <= MAX_UTILS,
    "monthly totals add up to rent plus utilities": (s) => totals(s).reduce((n, x) => n + x, 0) === s.rentTotal + s.utilsTotal,
  },

  transitions: {
    "a swap lowers one room and raises another by the same amount": (p, n, a) =>
      a.t !== "swap" ||
      p === n ||
      (p.rooms.length === n.rooms.length &&
        p.utilsTotal === n.utilsTotal &&
        p.rooms.every((r, i) => {
          const x = n.rooms[i];
          return !!x && x.id === r.id && x.owner === r.owner && x.name === r.name && x.label === r.label && x.rent === r.rent + (r.id === a.to ? a.amount : 0) - (r.id === a.from ? a.amount : 0);
        })),
    "a swap never takes more than the room's rent": (p, n, a) =>
      a.t !== "swap" || p === n || p.rooms.some((r) => r.id === a.from && a.amount > 0 && a.amount <= r.rent && a.from !== a.to),
    "setting utilities changes only the utilities total": (p, n, a) =>
      a.t !== "setUtils" || p === n || (n.utilsTotal === a.total && JSON.stringify(p.rooms) === JSON.stringify(n.rooms) && p.rentTotal === n.rentTotal),
    "the rent total, names and labels never change": (p, n) =>
      p.rentTotal === n.rentTotal && p.title === n.title && p.rooms.length === n.rooms.length && p.rooms.every((r, i) => n.rooms[i]!.name === r.name && n.rooms[i]!.label === r.label && n.rooms[i]!.id === r.id),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    const k = r.next();
    if (k < 0.25) return { t: "setUtils", total: r.pick([18000, 20000, 15000, 0, 18001, 200000]) };
    const from = r.pick(s.rooms);
    const to = r.pick(s.rooms);
    return { t: "swap", from: from.id, to: to.id, amount: r.pick([5000, 2500, 100, 1, 10000, 500000, 0]) };
  },

  local: { open: false, from: "", to: "", amount: "", utils: "", toast: 0 },

  view: ({ state, me, dispatch, local, setLocal }) => {
    const sums = totals(state);
    const shares = utilShares(state);
    const idx = state.rooms.map((_, i) => i).sort((a, b) => Number(state.rooms[b]!.owner === me) - Number(state.rooms[a]!.owner === me));

    const dollars = Number(local.amount);
    const amountOk = local.amount.trim() !== "" && Number.isInteger(dollars) && dollars > 0;
    const canMove = amountOk && local.from !== "" && local.to !== "" && local.from !== local.to;
    const utilsNum = Number(local.utils);
    const canUtils = local.utils.trim() !== "" && Number.isInteger(utilsNum) && utilsNum >= 0 && utilsNum * 100 <= MAX_UTILS && utilsNum * 100 !== state.utilsTotal;

    const move = () => {
      if (!canMove) return;
      dispatch({ t: "swap", from: local.from, to: local.to, amount: dollars * 100 });
      setLocal({ amount: "", toast: local.toast + 1 });
    };
    const setU = () => {
      if (!canUtils) return;
      dispatch({ t: "setUtils", total: utilsNum * 100 });
      setLocal({ utils: "", toast: local.toast + 1 });
    };

    const chips = (value: string, pick: (id: string) => void) => (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {state.rooms.map((r) => (
          <Button key={r.id} kind={value === r.id ? "secondary" : "deemphasized"} onClick={() => pick(r.id)}>
            {r.name}
          </Button>
        ))}
      </div>
    );

    return (
      <div>
        <CardHeader title={state.title} subtitle={`Rent ${fmt(state.rentTotal)} · utilities ${fmt(state.utilsTotal)}`} />
        {local.open ? (
          <div style={{ display: "grid", gap: 6 }}>
            <small>Move rent from</small>
            {chips(local.from, (id) => setLocal({ from: id }))}
            <small>to</small>
            {chips(local.to, (id) => setLocal({ to: id }))}
            <form
              style={{ display: "flex", gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                move();
              }}
            >
              <input value={local.amount} inputMode="numeric" placeholder="Dollars" aria-label="Dollars to move" onInput={(e) => setLocal({ amount: e.currentTarget.value })} />
              <Button kind="primary" disabled={!canMove} onClick={move}>
                Move
              </Button>
            </form>
            <form
              style={{ display: "flex", gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                setU();
              }}
            >
              <input value={local.utils} inputMode="numeric" placeholder="Utilities in dollars" aria-label="Utilities in dollars" onInput={(e) => setLocal({ utils: e.currentTarget.value })} />
              <Button kind="secondary" disabled={!canUtils} onClick={setU}>
                Set
              </Button>
            </form>
            <div>
              <Button kind="deemphasized" onClick={() => setLocal({ open: false })}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "grid", gap: 2 }}>
              {idx.map((i) => {
                const r = state.rooms[i]!;
                const mine = r.owner === me;
                const detail = [r.label, `rent ${fmt(r.rent)}`, `utils ${fmt(shares[i]!)}`].filter((x) => x).join(" · ");
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                    {r.owner ? <Avatar user={r.owner} size={24} /> : null}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{mine ? `${r.name} · you` : r.name}</div>
                      <small>{detail}</small>
                    </div>
                    <div style={{ fontWeight: 700, flexShrink: 0 }}>{fmt(sums[i]!)}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 8 }}>
              <small>{`${fmt(state.rentTotal)} rent + ${fmt(state.utilsTotal)} utilities = ${fmt(state.rentTotal + state.utilsTotal)}`}</small>
            </div>
            <div style={{ marginTop: 8 }}>
              <Button kind="secondary" onClick={() => setLocal({ open: true })}>
                Adjust
              </Button>
            </div>
          </div>
        )}
        {local.toast ? <Toast key={local.toast}>Split updated</Toast> : null}
      </div>
    );
  },
});
