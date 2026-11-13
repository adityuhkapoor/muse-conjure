import { defineApp, Avatar, Button, CardHeader, Progress, type Ctx } from "@muse/app";

type Share = { user: string; cents: number; paid: boolean };
type State = { title: string; payer: string; total: number; shares: Share[] };
type Action = { t: "total"; cents: number } | { t: "toggle"; user: string } | { t: "paid"; user: string };
type Local = { draft: string };

const MAX_CENTS = 10_000_000; // $100,000
const START = 18450;

const isMember = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);

// Even split in integer cents. The first `total % n` people (in bill order) pay one cent more.
function split(total: number, users: string[], old: Share[]): Share[] {
  const n = users.length;
  if (n === 0) return [];
  const base = Math.floor(total / n);
  const extra = total % n;
  return users.map((user, i) => ({ user, cents: base + (i < extra ? 1 : 0), paid: old.find((s) => s.user === user)?.paid ?? false }));
}

function fresh(users: string[], total: number): State {
  const payer = users[0] ?? "";
  return { title: "Dinner at Nopa", payer, total, shares: split(total, users, []).map((s) => ({ ...s, paid: s.user === payer })) };
}

const users = (s: State) => s.shares.map((x) => x.user);
const groups = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const money = (cents: number) => `$${groups(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, "0")}`;

function parseCents(text: string): number | null {
  const m = /^\$?\s*(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ""));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export default defineApp<State, Action, Local>({
  name: "Bill split",
  summary: (s) => {
    const paid = s.shares.filter((x) => x.paid).length;
    return `${s.title}: ${money(s.total)} split ${s.shares.length} ways. ${paid} of ${s.shares.length} paid.`;
  },

  init: (ctx) => fresh(ctx.members.map((m) => m.id), START),

  reduce: (state, action, meta, ctx) => {
    if (state.payer === "" || !ctx.members.some((m) => m.id === meta.user)) return state;
    if (action.t === "total") {
      if (meta.user !== state.payer) return state;
      const c = action.cents;
      if (typeof c !== "number" || !Number.isInteger(c) || c < 0 || c > MAX_CENTS || c === state.total) return state;
      return { ...state, total: c, shares: split(c, users(state), state.shares) };
    }
    if (typeof action.user !== "string") return state;
    if (action.t === "toggle") {
      if (action.user === state.payer || !ctx.members.some((m) => m.id === action.user)) return state;
      if (meta.user !== state.payer && meta.user !== action.user) return state;
      const inBill = state.shares.some((s) => s.user === action.user);
      const next = inBill ? users(state).filter((u) => u !== action.user) : [...users(state), action.user];
      return { ...state, shares: split(state.total, next, state.shares) };
    }
    if (action.t === "paid") {
      const share = state.shares.find((s) => s.user === action.user);
      if (!share || share.paid || (meta.user !== action.user && meta.user !== state.payer)) return state;
      return { ...state, shares: state.shares.map((s) => (s.user === action.user ? { ...s, paid: true } : s)) };
    }
    return state;
  },

  // People who left leave the bill. If the payer left, the next person in the bill pays.
  onMembers: (s, ctx) => {
    const stay = users(s).filter((u) => isMember(ctx, u));
    if (stay.length === s.shares.length) return s;
    if (isMember(ctx, s.payer)) return { ...s, shares: split(s.total, stay, s.shares) };
    const payer = stay[0] ?? "";
    return { ...s, payer, shares: split(s.total, stay, s.shares).map((x) => (x.user === payer ? { ...x, paid: true } : x)) };
  },

  invariants: {
    "shares sum to the total": (s) => s.shares.length === 0 || s.shares.reduce((a, x) => a + x.cents, 0) === s.total,
    "amounts are whole cents": (s) => Number.isInteger(s.total) && s.total >= 0 && s.shares.every((x) => Number.isInteger(x.cents) && x.cents >= 0),
    "shares differ by at most one cent": (s) =>
      s.shares.length === 0 || Math.max(...s.shares.map((x) => x.cents)) - Math.min(...s.shares.map((x) => x.cents)) <= 1,
    "the payer is in and paid": (s) => (s.payer === "" ? s.shares.length === 0 : s.shares.some((x) => x.user === s.payer && x.paid)),
    "each person appears once": (s) => new Set(users(s)).size === s.shares.length,
    "everyone in the bill is in the chat": (s, ctx) => s.shares.every((x) => isMember(ctx, x.user)),
  },

  transitions: {
    "only the payer changes the total": (p, n, _a, m) => n.total === p.total || m.user === p.payer,
    "the payer does not change": (p, n) => n.payer === p.payer,
    "a paid mark is never undone": (p, n) => p.shares.every((x) => !x.paid || !n.shares.some((y) => y.user === x.user && !y.paid)),
    "only the person or the payer marks paid": (p, n, _a, m) =>
      n.shares.every((y) => !y.paid || p.shares.some((x) => x.user === y.user && x.paid) || m.user === y.user || m.user === p.payer),
    "a toggle adds or drops only that person": (p, n, a) => {
      const changed = [...users(p).filter((u) => !users(n).includes(u)), ...users(n).filter((u) => !users(p).includes(u))];
      return changed.length === 0 || (a.t === "toggle" && changed.length === 1 && changed[0] === a.user);
    },
    "a valid paid mark lands": (p, n, a, m, ctx) =>
      a.t !== "paid" || !isMember(ctx, m.user) || !p.shares.some((x) => x.user === a.user && (m.user === a.user || m.user === p.payer)) ||
      n.shares.some((x) => x.user === a.user && x.paid),
  },

  arbitrary: (s, user, r, ctx) => {
    const k = r.int(3);
    if (k === 0) return { t: "total", cents: r.int(50_000) + 1 };
    if (k === 1 && ctx.members.length) return { t: "toggle", user: r.next() < 0.5 ? user : r.pick(ctx.members).id };
    const owing = s.shares.filter((x) => !x.paid);
    return { t: "paid", user: r.next() < 0.7 || !owing.length ? user : r.pick(owing).user };
  },

  local: { draft: "" },

  view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
    const name = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const paidCount = state.shares.filter((s) => s.paid && s.user !== state.payer).length;
    const back = state.shares.filter((s) => s.paid && s.user !== state.payer).reduce((a, s) => a + s.cents, 0);
    const owed = state.total - (state.shares.find((s) => s.user === state.payer)?.cents ?? 0);
    const draftCents = parseCents(local.draft);
    const isPayer = me === state.payer;
    const out = members.filter((m) => !state.shares.some((s) => s.user === m.id));
    const muted = { fontSize: 13, lineHeight: "16px", color: theme.color.secondaryText };
    const row = { display: "flex", alignItems: "center", gap: 12, minHeight: 44 };
    const update = () => {
      if (draftCents !== null) dispatch({ t: "total", cents: draftCents });
      setLocal({ draft: "" });
    };

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.payer ? `${money(state.total)} · paid by ${isPayer ? "you" : name(state.payer)}` : money(state.total)} />
        <Progress value={back} max={owed} label={`${money(back)} of ${money(owed)} back · ${paidCount} paid`} />
        <div style={{ display: "grid", gap: 4, marginTop: 12 }}>
          {state.shares.map((s) => (
            <div key={s.user} style={row}>
              <Avatar user={s.user} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(s.user)}</div>
                <div style={muted}>{s.user === state.payer ? `${money(s.cents)} · paid the bill` : money(s.cents)}</div>
              </div>
              {s.paid ? (
                <span style={{ ...muted, fontWeight: 600, color: theme.color.positive }}>Paid</span>
              ) : s.user === me || isPayer ? (
                <Button kind={s.user === me ? "primary" : "secondary"} onClick={() => dispatch({ t: "paid", user: s.user })}>
                  {s.user === me ? "I paid" : "Mark paid"}
                </Button>
              ) : (
                <span style={muted}>Owes</span>
              )}
            </div>
          ))}
          {out.map((m) => (
            <div key={m.id} style={row}>
              <Avatar user={m} size={32} />
              <div style={{ flex: 1, minWidth: 0, fontWeight: 600, color: theme.color.secondaryText }}>{name(m.id)}</div>
              {isPayer || m.id === me ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "toggle", user: m.id })}>
                  Add
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        {isPayer ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              update();
            }}
          >
            <input
              value={local.draft}
              inputMode="decimal"
              placeholder={`Total, e.g. ${money(state.total)}`}
              aria-label="Bill total"
              onInput={(e) => setLocal({ draft: e.currentTarget.value })}
            />
            <Button disabled={draftCents === null} onClick={update}>
              Update
            </Button>
          </form>
        ) : null}
      </div>
    );
  },
});
