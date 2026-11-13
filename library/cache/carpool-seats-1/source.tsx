import { defineApp, Avatar, Button, CardHeader } from "@muse/app";

const CHAT = {
  title: "Who's riding to Columbus?",
  leaving: "8am from the quad",
  cars: [
    { name: "Rhea's Subaru", driver: "rhea", seats: 4 },
    { name: "Sam's Civic", driver: "sam", seats: 3 },
    { name: "Jake's minivan", driver: "jake", seats: 6 },
  ],
};

type Car = { id: string; name: string; driver: string | null; seats: (string | null)[] };
type State = { title: string; total: number; cars: Car[] };
type Action = { t: "take"; car: string; seat: number } | { t: "leave"; car: string; seat: number };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const flat = (s: State) => s.cars.flatMap((c) => c.seats.map((who, i) => ({ at: `${c.id}:${i}`, who })));
const holders = (s: State) => flat(s).filter((x) => x.who !== null).map((x) => x.who);
const drivers = (s: State) => s.cars.map((c) => c.id + "=" + (c.driver ?? "")).join("|");
const fixed = (s: State) => s.title + "|" + s.total + "|" + s.cars.map((c) => c.id + c.name + c.seats.length).join("|") + "|" + drivers(s);
const isDriver = (s: State, user: string) => s.cars.some((c) => c.driver === user);

function take(s: State, user: string, cid: unknown, seat: unknown): State {
  if (isDriver(s, user)) return s;
  const car = s.cars.find((c) => c.id === cid);
  if (!car || typeof seat !== "number" || !Number.isInteger(seat) || seat < 0 || seat >= car.seats.length) return s;
  if (car.seats[seat] !== null) return s;
  return {
    ...s,
    cars: s.cars.map((c) => ({
      ...c,
      seats: c.seats.map((who, i) => (c.id === car.id && i === seat ? user : who === user ? null : who)),
    })),
  };
}

function leave(s: State, user: string, cid: unknown, seat: unknown): State {
  const car = s.cars.find((c) => c.id === cid);
  if (!car || typeof seat !== "number" || !Number.isInteger(seat) || seat < 0 || seat >= car.seats.length) return s;
  if (car.seats[seat] !== user) return s;
  if (seat === 0 && car.driver !== null) return s;
  return { ...s, cars: s.cars.map((c) => (c.id === car.id ? { ...c, seats: c.seats.map((who, i) => (i === seat ? null : who)) } : c)) };
}

export default defineApp<State, Action, Local>({
  name: "Car seats",
  summary: (s) => `${s.title} ${holders(s).length} of ${s.total} seats taken.`,

  init: (ctx) => {
    const cars: Car[] = CHAT.cars.map((c, i) => {
      const driver = ctx.members.find((m) => m.name.trim().toLowerCase().split(" ")[0] === c.driver)?.id ?? null;
      const n = Math.max(1, Math.min(8, Math.floor(c.seats)));
      return { id: `c${i}`, name: c.name, driver, seats: Array.from({ length: n }, (_, k) => (k === 0 ? driver : null)) };
    });
    return { title: CHAT.title, total: cars.reduce((n, c) => n + c.seats.length, 0), cars };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "take") return take(state, meta.user, action.car, action.seat);
    if (action.t === "leave") return leave(state, meta.user, action.car, action.seat);
    return state;
  },

  onMembers: (state, ctx) => {
    const ok = state.cars.every((c) => (c.driver === null || inChat(ctx, c.driver)) && c.seats.every((x) => x === null || inChat(ctx, x)));
    if (ok) return state;
    return {
      ...state,
      cars: state.cars.map((c) => ({
        ...c,
        driver: c.driver !== null && !inChat(ctx, c.driver) ? null : c.driver,
        seats: c.seats.map((x) => (x !== null && !inChat(ctx, x) ? null : x)),
      })),
    };
  },

  invariants: {
    "each person holds at most one seat": (s) => new Set(holders(s)).size === holders(s).length,
    "the number of seats never changes": (s) => s.cars.reduce((n, c) => n + c.seats.length, 0) === s.total,
    "seat holders are in the chat": (s, ctx) => s.cars.every((c) => c.seats.every((x) => x === null || inChat(ctx, x))),
    "a driver is in the chat and holds seat 0 of their car": (s, ctx) =>
      s.cars.every((c) => c.driver === null || (inChat(ctx, c.driver) && c.seats[0] === c.driver)),
    "car ids are unique and each car has 1 to 8 seats": (s) =>
      new Set(s.cars.map((c) => c.id)).size === s.cars.length && s.cars.every((c) => c.seats.length >= 1 && c.seats.length <= 8),
  },

  transitions: {
    "a take fills the chosen open seat with the actor and frees only the actor's old seat": (p, n, a, m) => {
      if (a.t !== "take" || p === n) return true;
      const before = flat(p);
      const after = flat(n);
      const key = `${a.car}:${a.seat}`;
      return (
        !isDriver(p, m.user) &&
        before.find((x) => x.at === key)?.who === null &&
        after.find((x) => x.at === key)?.who === m.user &&
        before.every((x, i) => x.at === key || after[i]!.who === x.who || (x.who === m.user && after[i]!.who === null))
      );
    },
    "a leave empties only the actor's own seat": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      const before = flat(p);
      const after = flat(n);
      const key = `${a.car}:${a.seat}`;
      return (
        before.find((x) => x.at === key)?.who === m.user &&
        after.find((x) => x.at === key)?.who === null &&
        before.every((x, i) => x.at === key || after[i]!.who === x.who)
      );
    },
    "a driver never loses their own seat": (p, n, a) =>
      (a.t !== "take" && a.t !== "leave") || n.cars.every((c) => c.driver === null || c.seats[0] === c.driver),
    "take and leave never change cars, drivers, title or total": (p, n, a) =>
      (a.t !== "take" && a.t !== "leave") || fixed(p) === fixed(n),
    "only people in the chat change a seat": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const c = r.pick(s.cars);
    const mine = c.seats.indexOf(user);
    if (mine >= 0 && r.next() < 0.3) return { t: "leave", car: c.id, seat: mine };
    if (r.next() < 0.05) return { t: "take", car: c.id, seat: c.seats.length + 2 };
    return { t: "take", car: c.id, seat: r.int(c.seats.length) };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((x) => x.id === id)?.name ?? "Someone").split(" ")[0]!);
    const open = state.cars.reduce((n, c) => n + c.seats.filter((x) => x === null).length, 0);
    const unseated = members.filter((x) => !state.cars.some((c) => c.seats.includes(x.id)));
    const shown = unseated.slice(0, 3).map((x) => (x.id === me ? "you" : x.name.split(" ")[0]!));
    const more = unseated.length - shown.length;
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${open} open · ${CHAT.leaving}`} />
        <div style={{ display: "grid", gap: 8 }}>
          {state.cars.map((c) => (
            <div key={c.id}>
              <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name} <small>· {c.seats.filter((x) => x === null).length} open</small>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 4 }}>
                {c.seats.map((who, i) =>
                  who === null ? (
                    <Button key={i} kind="deemphasized" wide onClick={() => dispatch({ t: "take", car: c.id, seat: i })}>
                      Open
                    </Button>
                  ) : who === me && !(i === 0 && c.driver !== null) ? (
                    <Button key={i} kind="primary" wide onClick={() => dispatch({ t: "leave", car: c.id, seat: i })}>
                      You
                    </Button>
                  ) : (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, minHeight: 44, minWidth: 0, overflow: "hidden" }}>
                      <Avatar user={who} size={24} />
                      <small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{nameOf(who)}</small>
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 4 }}>
          <small>
            {unseated.length === 0 ? "Everyone has a seat" : `No seat yet: ${shown.join(", ")}${more > 0 ? ` +${more}` : ""}`}
          </small>
        </div>
      </div>
    );
  },
});
