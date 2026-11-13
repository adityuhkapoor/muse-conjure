import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine, rng, running } from "@muse/app";

// Shotgun rotation: 4 front seats across two legs (there and back). Anyone can join the draw,
// anyone in it can run it once. Nobody gets a seat in a car they drive, and nobody gets two.

const CHAT = {
  title: "Who gets shotgun?",
  seats: [
    { id: "civic-there", leg: "there", car: "Civic", driver: "jake" },
    { id: "rav4-there", leg: "there", car: "Rav4", driver: "priya" },
    { id: "civic-back", leg: "back", car: "Civic", driver: "felix" },
    { id: "rav4-back", leg: "back", car: "Rav4", driver: "omar" },
  ] as { id: string; leg: "there" | "back"; car: string; driver: string }[],
  pool: ["jake", "priya", "felix", "omar", "noor", "wren", "ravi"],
};

type Seat = { id: string; leg: "there" | "back"; car: string; driver: string | null; holder: string | null };
type State = { title: string; seats: Seat[]; pool: string[]; drawnAt: number | null; round: number };
type Action = { t: "join" } | { t: "draw" } | { t: "reset" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name: string }[] };

const SPIN_MS = 2000;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);

function drawSeats(seats: Seat[], pool: string[], seed: number, ctx: { members: { id: string }[] }): Seat[] {
  const r = rng(seed);
  const live = pool.filter((id) => inChat(ctx, id));
  const taken: string[] = [];
  return seats.map((s) => {
    const candidates = live.filter((id) => id !== s.driver && !taken.includes(id));
    if (candidates.length === 0) return { ...s, holder: null };
    const who = r.shuffle([...candidates])[0] ?? null;
    if (who !== null) taken.push(who);
    return { ...s, holder: who };
  });
}

const holds = (s: State, id: string) => s.seats.filter((x) => x.holder === id).length;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const driversOf = (s: State) => s.seats.map((x) => x.driver).join();

export default defineApp<State, Action, Local>({
  name: "Shotgun rotation",
  summary: (s) => {
    const filled = s.seats.filter((x) => x.holder !== null).length;
    return s.drawnAt === null ? `${s.title} ${s.pool.length} in the draw.` : `${s.title} ${filled} of ${s.seats.length} seats assigned.`;
  },

  init: (ctx) => {
    const find = (name: string) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null;
    const pool: string[] = [];
    for (const name of CHAT.pool) {
      const id = find(name);
      if (id !== null && !pool.includes(id)) pool.push(id);
    }
    return {
      title: CHAT.title,
      seats: CHAT.seats.map((s) => ({ id: s.id, leg: s.leg, car: s.car, driver: find(s.driver), holder: null })),
      pool,
      drawnAt: null,
      round: 0,
    };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "join") {
      if (state.drawnAt !== null) return state;
      return {
        ...state,
        pool: state.pool.includes(meta.user) ? state.pool.filter((x) => x !== meta.user) : [...state.pool, meta.user],
      };
    }
    if (action.t === "draw") {
      if (state.drawnAt !== null || !state.pool.includes(meta.user)) return state;
      const seats = drawSeats(state.seats, state.pool, meta.seed, ctx);
      if (seats.every((s) => s.holder === null)) return state;
      return { ...state, seats, drawnAt: meta.time, round: 1 };
    }
    if (action.t === "reset") {
      if (state.drawnAt === null) return state;
      return { ...state, seats: state.seats.map((s) => ({ ...s, holder: null })), drawnAt: null, round: 0 };
    }
    return state;
  },

  // Someone left: they drop out of the pool, lose any seat, and stop being a driver.
  onMembers: (state, ctx) => {
    const poolOk = state.pool.every((id) => inChat(ctx, id));
    const seatsOk = state.seats.every((s) => (s.driver === null || inChat(ctx, s.driver)) && (s.holder === null || inChat(ctx, s.holder)));
    if (poolOk && seatsOk) return state;
    return {
      ...state,
      pool: state.pool.filter((id) => inChat(ctx, id)),
      seats: state.seats.map((s) => ({
        ...s,
        driver: s.driver !== null && inChat(ctx, s.driver) ? s.driver : null,
        holder: s.holder !== null && inChat(ctx, s.holder) ? s.holder : null,
      })),
    };
  },

  invariants: {
    "each person holds at most one front seat": (s) => s.seats.every((x) => x.holder === null || holds(s, x.holder) === 1),
    "no one holds a seat in a car they drive": (s) => s.seats.every((x) => x.holder === null || x.holder !== x.driver),
    "holders, drivers and the pool are in the chat": (s, ctx) =>
      s.pool.every((id) => inChat(ctx, id)) && s.seats.every((x) => (x.holder === null || inChat(ctx, x.holder)) && (x.driver === null || inChat(ctx, x.driver))),
    "every holder is in the pool": (s) => s.seats.every((x) => x.holder === null || s.pool.includes(x.holder)),
    "there are 4 seats with unique ids and the pool has no duplicates": (s) =>
      s.seats.length === 4 && new Set(s.seats.map((x) => x.id)).size === 4 && new Set(s.pool).size === s.pool.length,
    "drawn time and round agree, and nothing is held before the draw": (s) =>
      (s.drawnAt === null) === (s.round === 0) && (s.drawnAt !== null || s.seats.every((x) => x.holder === null)),
  },

  transitions: {
    "a join toggles only the actor in the pool and changes nothing else": (p, n, a, m) =>
      a.t !== "join" ||
      p === n ||
      (p.pool.includes(m.user) !== n.pool.includes(m.user) &&
        same(p.pool.filter((x) => x !== m.user), n.pool.filter((x) => x !== m.user)) &&
        same(p.seats, n.seats) &&
        p.drawnAt === n.drawnAt &&
        p.round === n.round),
    "a join changes nothing once the draw has happened": (p, n, a) => a.t !== "join" || p === n || p.drawnAt === null,
    "a draw gives seats in the order the seed gives and stamps the time": (p, n, a, m, ctx) =>
      a.t !== "draw" ||
      p === n ||
      (p.drawnAt === null && same(n.seats, drawSeats(p.seats, p.pool, m.seed, ctx)) && n.drawnAt === m.time && n.round === 1 && same(p.pool, n.pool)),
    "only a person in the pool can draw": (p, n, a, m) => a.t !== "draw" || p === n || p.pool.includes(m.user),
    "a reset clears every holder and the draw time and keeps the pool and drivers": (p, n, a) =>
      a.t !== "reset" ||
      p === n ||
      (p.drawnAt !== null && n.drawnAt === null && n.round === 0 && n.seats.every((x) => x.holder === null) && same(p.pool, n.pool) && driversOf(p) === driversOf(n)),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    const k = r.next();
    if (s.drawnAt === null) return k < 0.35 ? { t: "join" } : { t: "draw" };
    return k < 0.5 ? { t: "reset" } : { t: "join" };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const drawn = confirmed.drawnAt !== null;
    const spinning =
      (pending && confirmed.drawnAt === null && state.drawnAt !== null) ||
      (confirmed.drawnAt !== null && running(confirmed.drawnAt, SPIN_MS) !== null);
    const inPool = state.pool.includes(me);
    const mine = confirmed.seats.find((x) => x.holder === me);
    const filled = confirmed.seats.filter((x) => x.holder !== null).length;

    const subtitle = spinning ? "Spinning" : drawn ? `Drawn · ${filled} of ${confirmed.seats.length} seats` : `${state.pool.length} in the draw`;
    const status = spinning
      ? "Spinning"
      : drawn
        ? mine
          ? `You got the ${mine.car} ${mine.leg}`
          : "No seat yet"
        : inPool
          ? "You are in the draw"
          : "Join to be in the draw";

    const leg = (which: "there" | "back", label: string) => (
      <div key={which}>
        <small style={{ display: "block", marginTop: 4 }}>{label}</small>
        {confirmed.seats
          .filter((x) => x.leg === which)
          .map((x) => (
            <div
              key={x.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                minHeight: 44,
                borderTop: `1px solid ${theme.color.divider}`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{x.car}</div>
                <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {x.driver ? `${nameOf(x.driver)} drives` : "Front seat"}
                </small>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, justifyContent: "flex-end" }}>
                {spinning ? (
                  <small>Spinning</small>
                ) : x.holder ? (
                  <>
                    <Avatar user={x.holder} size={24} />
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{nameOf(x.holder)}</span>
                  </>
                ) : (
                  <small>Open</small>
                )}
              </div>
            </div>
          ))}
      </div>
    );

    return (
      <div>
        <CardHeader title={state.title} subtitle={subtitle} />
        <div>
          {leg("there", "There")}
          {leg("back", "Back")}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8, minHeight: 44 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            {state.pool.length ? <Facepile users={state.pool} max={3} size={20} /> : null}
            <small>{`${state.pool.length} in`}</small>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!drawn && !spinning ? (
              <Button kind="deemphasized" onClick={() => dispatch({ t: "join" })}>
                {inPool ? "Leave" : "Join"}
              </Button>
            ) : null}
            {!drawn && !(pending && state.drawnAt !== null) ? (
              <Button kind="primary" disabled={!inPool} onClick={() => dispatch({ t: "draw" })}>
                Draw
              </Button>
            ) : (
              <Button kind="deemphasized" disabled={spinning} onClick={() => dispatch({ t: "reset" })}>
                Redo
              </Button>
            )}
          </div>
        </div>
        <div style={{ minHeight: 24, marginTop: 4 }}>
          <SystemLine>{status}</SystemLine>
        </div>
      </div>
    );
  },
});
