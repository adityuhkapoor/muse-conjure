import { defineApp, Avatar, Button, CardHeader, clock } from "@muse/app";

// Presale countdown plus who buys a ticket for whom.

const C = {
  title: "Mitski presale · who buys for who",
  maxPerBuyer: 4,
  note: "Max 4 per buyer · code may expire at noon",
  // [buyer name, person name]
  seed: [
    ["Kev", "Kev"],
    ["Kev", "Hugo"],
    ["Sam", "Sam"],
    ["Sam", "June"],
    ["Maya", "Maya"],
    ["Maya", "Mia"],
    ["Wren", "Wren"],
    ["Wren", "Marcus"],
  ] as [string, string][],
};

type Ticket = { person: string; buyer: string };
type State = { startAt: number | null; setBy: string | null; tickets: Ticket[] };
type Action =
  | { t: "setStart"; minutes: number }
  | { t: "buy"; person: string }
  | { t: "drop"; person: string };
type Local = { minutes: string; edit: boolean };

const MAX_MINUTES = 10080;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const countFor = (s: State, buyer: string) => s.tickets.filter((t) => t.buyer === buyer).length;
const sameTicket = (a: Ticket, b: Ticket) => a.person === b.person && a.buyer === b.buyer;
const sameList = (a: Ticket[], b: Ticket[]) => a.length === b.length && a.every((t, i) => sameTicket(t, b[i]!));

export default defineApp<State, Action, Local>({
  name: "Presale plan",
  summary: (s, ctx) => {
    const covered = ctx.members.filter((m) => s.tickets.some((t) => t.person === m.id)).length;
    return `Mitski presale · ${covered} of ${ctx.members.length} covered`;
  },

  init: (ctx) => {
    const idOf = (name: string) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
    const tickets: Ticket[] = [];
    for (const [b, p] of C.seed) {
      const buyer = idOf(b);
      const person = idOf(p);
      if (!buyer || !person) continue;
      if (tickets.some((t) => t.person === person)) continue;
      if (tickets.filter((t) => t.buyer === buyer).length >= C.maxPerBuyer) continue;
      tickets.push({ person, buyer });
    }
    return { startAt: null, setBy: null, tickets };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "setStart") {
      const m = action.minutes;
      if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > MAX_MINUTES) return state;
      return { ...state, startAt: meta.time + m * 60000, setBy: meta.user };
    }
    if (action.t === "buy") {
      const p = action.person;
      if (typeof p !== "string" || !inChat(ctx, p)) return state;
      if (state.tickets.some((t) => t.person === p)) return state;
      if (countFor(state, meta.user) >= C.maxPerBuyer) return state;
      return { ...state, tickets: [...state.tickets, { person: p, buyer: meta.user }] };
    }
    if (action.t === "drop") {
      const p = action.person;
      if (typeof p !== "string") return state;
      const entry = state.tickets.find((t) => t.person === p);
      if (!entry || entry.buyer !== meta.user) return state;
      return { ...state, tickets: state.tickets.filter((t) => t.person !== p) };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const keep = state.tickets.filter((t) => inChat(ctx, t.person) && inChat(ctx, t.buyer));
    const setByGone = state.setBy !== null && !inChat(ctx, state.setBy);
    if (keep.length === state.tickets.length && !setByGone) return state;
    return { ...state, tickets: keep, setBy: setByGone ? null : state.setBy };
  },

  invariants: {
    "no buyer has more than 4 tickets": (s) => s.tickets.every((t) => countFor(s, t.buyer) <= C.maxPerBuyer),
    "each person has at most one ticket arranged": (s) => new Set(s.tickets.map((t) => t.person)).size === s.tickets.length,
    "people and buyers in tickets are in the chat": (s, ctx) => s.tickets.every((t) => inChat(ctx, t.person) && inChat(ctx, t.buyer)),
    "start time is null or a positive whole number": (s) => s.startAt === null || (Number.isInteger(s.startAt) && s.startAt > 0),
    "no start time means no one set it, and setter is in the chat": (s, ctx) =>
      (s.startAt !== null || s.setBy === null) && (s.setBy === null || inChat(ctx, s.setBy)),
  },

  transitions: {
    "a buy adds one ticket for the asked person with the actor as buyer and keeps the rest": (p, n, a, m) => {
      if (a.t !== "buy" || p === n) return true;
      const last = n.tickets[n.tickets.length - 1];
      return (
        n.tickets.length === p.tickets.length + 1 &&
        !!last &&
        last.person === a.person &&
        last.buyer === m.user &&
        p.tickets.every((t, i) => sameTicket(t, n.tickets[i]!))
      );
    },
    "a drop removes one ticket and only when the actor was its buyer": (p, n, a, m) => {
      if (a.t !== "drop" || p === n) return true;
      const entry = p.tickets.find((t) => t.person === a.person);
      return (
        !!entry &&
        entry.buyer === m.user &&
        n.tickets.length === p.tickets.length - 1 &&
        !n.tickets.some((t) => t.person === a.person) &&
        p.tickets.every((t) => t.person === a.person || n.tickets.some((x) => sameTicket(x, t)))
      );
    },
    "a set start sets the time from now and the setter, and leaves tickets alone": (p, n, a, m) =>
      a.t !== "setStart" || p === n || (n.startAt === m.time + a.minutes * 60000 && n.setBy === m.user && sameList(p.tickets, n.tickets)),
    "a buy or drop never changes the start time": (p, n, a) =>
      (a.t !== "buy" && a.t !== "drop") || (p.startAt === n.startAt && p.setBy === n.setBy),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const mine = s.tickets.filter((t) => t.buyer === user);
    const x = r.next();
    if (x < 0.5) return { t: "buy", person: r.pick(ctx.members).id };
    if (x < 0.65 && mine.length) return { t: "drop", person: r.pick(mine).person };
    if (x < 0.85) return { t: "setStart", minutes: r.int(500) };
    const other = s.tickets.find((t) => t.buyer !== user);
    return { t: "drop", person: other ? other.person : "nobody" };
  },

  local: { minutes: "", edit: false },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const covered = members.filter((m) => state.tickets.some((t) => t.person === m.id)).length;
    const uncovered = members.filter((m) => !state.tickets.some((t) => t.person === m.id));
    const meUncovered = uncovered.some((m) => m.id === me);
    const mineCount = countFor(state, me);
    const canBuy = mineCount < C.maxPerBuyer;
    const buyers: string[] = [];
    for (const t of state.tickets) if (!buyers.includes(t.buyer)) buyers.push(t.buyer);

    let big = "Start time not set";
    if (state.startAt !== null) {
      const left = state.startAt - clock.value;
      if (left <= 0) big = "Presale is open";
      else {
        const total = Math.floor(left / 1000);
        const d = Math.floor(total / 86400);
        const h = Math.floor((total % 86400) / 3600);
        const mi = Math.floor((total % 3600) / 60);
        const sec = total % 60;
        big = d > 0 ? `${d}d ${h}h ${mi}m` : h > 0 ? `${h}h ${mi}m` : `${mi}m ${sec}s`;
      }
    }

    const mins = Number(local.minutes);
    const minsOk = local.minutes.trim() !== "" && Number.isInteger(mins) && mins >= 1 && mins <= MAX_MINUTES;
    const submit = () => {
      if (!minsOk) return;
      dispatch({ t: "setStart", minutes: mins });
      setLocal({ minutes: "", edit: false });
    };
    const showForm = state.startAt === null || local.edit;

    return (
      <div>
        <CardHeader title={C.title} subtitle={`${covered} of ${members.length} covered`} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "4px 0 8px" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>{big}</h2>
            {state.startAt !== null && state.setBy !== null ? <small>{`Set by ${nameOf(state.setBy)}`}</small> : null}
          </div>
          {state.startAt !== null && !local.edit ? (
            <Button kind="deemphasized" onClick={() => setLocal({ edit: true })}>
              Change
            </Button>
          ) : null}
        </div>
        {showForm ? (
          <form
            style={{ display: "flex", gap: 8, marginBottom: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              value={local.minutes}
              placeholder="Minutes from now"
              aria-label="Minutes from now"
              onInput={(e) => setLocal({ minutes: e.currentTarget.value })}
            />
            <Button kind="secondary" disabled={!minsOk} onClick={submit}>
              Set time
            </Button>
          </form>
        ) : null}
        <div style={{ display: "grid", gap: 4 }}>
          {buyers.map((b) => {
            const people = state.tickets.filter((t) => t.buyer === b).map((t) => t.person);
            return (
              <div key={b} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: 36 }}>
                <Avatar user={b} size={24} />
                <span style={{ fontWeight: 600 }}>{nameOf(b)}</span>
                {b === me ? (
                  people.map((p) => (
                    <Button key={p} kind="deemphasized" onClick={() => dispatch({ t: "drop", person: p })}>
                      {`Drop ${p === me ? "me" : nameOf(p)}`}
                    </Button>
                  ))
                ) : (
                  <small>{`for ${people.map((p) => nameOf(p)).join(", ")}`}</small>
                )}
              </div>
            );
          })}
        </div>
        {uncovered.length ? (
          <div style={{ marginTop: 8 }}>
            <small>{`No ticket yet: ${uncovered.map((m) => (m.id === me ? "you" : m.name)).slice(0, 6).join(", ")}`}</small>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              {meUncovered && canBuy ? (
                <Button kind="primary" onClick={() => dispatch({ t: "buy", person: me })}>
                  Buy mine
                </Button>
              ) : null}
              {canBuy
                ? uncovered
                    .filter((m) => m.id !== me)
                    .slice(0, 5)
                    .map((m) => (
                      <Button key={m.id} kind="deemphasized" onClick={() => dispatch({ t: "buy", person: m.id })}>
                        {m.name}
                      </Button>
                    ))
                : null}
            </div>
          </div>
        ) : null}
        <div style={{ marginTop: 8 }}>
          <small>{C.note}</small>
        </div>
      </div>
    );
  },
});
