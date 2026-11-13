import { defineApp, Avatar, Button, CardHeader, SystemLine } from "@muse/app";

// Seat or slot grid: car seats, tables, shifts, time slots. Groups of seats; tap an open seat to
// take it. With onePerPerson, taking a new seat frees your old one. Two people racing for the
// same seat: the first claim in the log wins, the second is a no-op.

type Params = {
  /** Card title: "Who's riding with who?" */
  title: string;
  /** Groups of seats from the chat: cars, tables, shifts. seats = how many spots, 1 to 8. */
  groups: { name: string; seats: number }[];
  /** true: each person holds one seat at most. */
  onePerPerson: boolean;
};

// @params
const P: Params = {
  title: "Who's riding with who?",
  groups: [
    { name: "Maya's car", seats: 4 },
    { name: "Leo's car", seats: 3 },
  ],
  onePerPerson: true,
};
// @end params

type Group = { id: string; name: string; seats: (string | null)[] };
type State = { title: string; onePerPerson: boolean; total: number; groups: Group[] };
type Action = { t: "take"; group: string; seat: number } | { t: "leave"; group: string; seat: number };
type Local = Record<string, never>;

const MAX_GROUPS = 6;
const MAX_SEATS = 8;
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const seatsOf = (s: State, user: string) => s.groups.reduce((n, g) => n + g.seats.filter((x) => x === user).length, 0);
/** Every seat as "group:index=holder", so two states can be compared seat by seat. */
const flat = (s: State) => s.groups.flatMap((g) => g.seats.map((who, i) => ({ at: `${g.id}:${i}`, who })));

function take(s: State, user: string, gid: unknown, seat: unknown): State {
  const g = s.groups.find((x) => x.id === gid);
  if (!g || typeof seat !== "number" || !Number.isInteger(seat) || seat < 0 || seat >= g.seats.length) return s;
  if (g.seats[seat] !== null) return s; // taken: the first claim wins
  return {
    ...s,
    groups: s.groups.map((x) => ({
      ...x,
      seats: x.seats.map((who, i) => (x.id === g.id && i === seat ? user : s.onePerPerson && who === user ? null : who)),
    })),
  };
}

function leave(s: State, user: string, gid: unknown, seat: unknown): State {
  const g = s.groups.find((x) => x.id === gid);
  if (!g || typeof seat !== "number" || g.seats[seat] !== user) return s;
  return { ...s, groups: s.groups.map((x) => (x.id === g.id ? { ...x, seats: x.seats.map((who, i) => (i === seat ? null : who)) } : x)) };
}

export default defineApp<State, Action, Local>({
  name: "Seats",
  summary: (s) => {
    const taken = s.groups.reduce((n, g) => n + g.seats.filter((x) => x !== null).length, 0);
    return `${s.title} ${taken} of ${s.total} seats taken.`;
  },

  init: () => {
    const groups: Group[] = P.groups
      .filter((g) => g.name.trim())
      .slice(0, MAX_GROUPS)
      .map((g, i) => ({ id: `g${i}`, name: g.name.trim().slice(0, 30), seats: Array.from({ length: Math.max(1, Math.min(MAX_SEATS, Math.floor(g.seats) || 1)) }, () => null) }));
    const safe = groups.length ? groups : [{ id: "g0", name: "Seats", seats: [null, null, null, null] }];
    return { title: P.title.trim().slice(0, 60) || "Seats", onePerPerson: P.onePerPerson, total: safe.reduce((n, g) => n + g.seats.length, 0), groups: safe };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "take") return take(state, meta.user, action.group, action.seat);
    if (action.t === "leave") return leave(state, meta.user, action.group, action.seat);
    return state;
  },

  // Someone left: their seats open up. Someone joined: any open seat is theirs to take.
  onMembers: (state, ctx) => {
    if (state.groups.every((g) => g.seats.every((x) => x === null || inChat(ctx, x)))) return state;
    return { ...state, groups: state.groups.map((g) => ({ ...g, seats: g.seats.map((x) => (x !== null && !inChat(ctx, x) ? null : x)) })) };
  },

  invariants: {
    "one seat per person": (s, ctx) => !s.onePerPerson || ctx.members.every((m) => seatsOf(s, m.id) <= 1),
    "the number of seats never changes": (s) => s.groups.reduce((n, g) => n + g.seats.length, 0) === s.total,
    "seat holders are in the chat": (s, ctx) => s.groups.every((g) => g.seats.every((x) => x === null || inChat(ctx, x))),
  },

  transitions: {
    "a take fills one open seat with the actor and moves no one else": (p, n, a, m) => {
      if (a.t !== "take" || p === n) return true;
      const before = flat(p), after = flat(n);
      const key = `${a.group}:${a.seat}`;
      return (
        before.find((x) => x.at === key)?.who === null &&
        after.find((x) => x.at === key)?.who === m.user &&
        before.every((x, i) => x.at === key || after[i]!.who === x.who || (p.onePerPerson && x.who === m.user && after[i]!.who === null))
      );
    },
    "a leave empties the actor's own seat and nothing else": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      const before = flat(p), after = flat(n);
      const key = `${a.group}:${a.seat}`;
      return before.find((x) => x.at === key)?.who === m.user && after.find((x) => x.at === key)?.who === null && before.every((x, i) => x.at === key || after[i]!.who === x.who);
    },
    "only people in the chat change a seat": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const g = r.pick(s.groups);
    const mine = g.seats.indexOf(user);
    if (mine >= 0 && r.next() < 0.3) return { t: "leave", group: g.id, seat: mine };
    return { t: "take", group: g.id, seat: r.int(g.seats.length) };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const mineCount = seatsOf(state, me);
    const unseated = members.filter((m) => seatsOf(state, m.id) === 0);
    return (
      <div>
        <CardHeader title={state.title} subtitle={mineCount ? "Tap your seat to leave it" : "Tap an open seat"} />
        <div style={{ display: "grid", gap: 12 }}>
          {state.groups.map((g) => (
            <div key={g.id}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {g.name} <small>· {g.seats.filter((x) => x === null).length} open</small>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {g.seats.map((who, i) =>
                  who === null ? (
                    <Button key={i} kind="deemphasized" onClick={() => dispatch({ t: "take", group: g.id, seat: i })}>
                      Open
                    </Button>
                  ) : who === me ? (
                    <Button key={i} kind="primary" onClick={() => dispatch({ t: "leave", group: g.id, seat: i })}>
                      You
                    </Button>
                  ) : (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, minHeight: 44, padding: "0 4px" }}>
                      <Avatar user={who} size={24} />
                      <small>{nameOf(who)}</small>
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ minHeight: 24, marginTop: 8 }}>
          {unseated.length ? <SystemLine>{`No seat yet: ${unseated.map((m) => (m.id === me ? "you" : m.name)).slice(0, 4).join(", ")}`}</SystemLine> : <SystemLine>Everyone has a seat</SystemLine>}
        </div>
      </div>
    );
  },
});
