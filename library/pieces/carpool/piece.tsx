import { defineApp, Avatar, Button, CardHeader, SystemLine, running, tween } from "@muse/app";

// Carpool: cars with a driver, a number of rider seats and a time they leave. Riders tap a car to
// join (one car each); anyone can offer their own car. Optional costs per car (gas, parking) split
// evenly across everyone in the car, driver included, in integer cents: the driver takes the
// leftover cents, so the riders' shares plus the driver's add up to the cost.

type Params = {
  /** Card title, where everyone is going: "Away game at Stanford" */
  title: string;
  /**
   * Cars from the chat. driver: name exactly as in the members list (empty if a car still needs a
   * driver). seats: rider seats, not counting the driver, 1 to 7. leaves: "5:30 PM". costCents:
   * gas and parking for that car ($24 -> 2400), 0 if nobody mentioned money.
   */
  cars: { driver: string; seats: number; leaves: string; costCents: number }[];
};

// @params
const P: Params = {
  title: "Away game at Stanford",
  cars: [
    { driver: "Kev", seats: 4, leaves: "5:15 PM", costCents: 3200 },
    { driver: "Ana", seats: 3, leaves: "5:30 PM", costCents: 2400 },
  ],
};
// @end params

/** full: when the last seat filled (server time), 0 while seats are open. */
type Car = { id: string; driver: string | null; seats: number; leaves: string; cost: number; riders: string[]; full: number };
type State = { title: string; cars: Car[] };
type Action = { t: "join"; car: string } | { t: "leave" } | { t: "drive"; seats: number; leaves: string } | { t: "wheel"; car: string };
type Local = { offering: boolean; seats: number; leaves: string };
type Ctx = { members: { id: string; name?: string }[] };

const MAX_CARS = 5;
const MAX_SEATS = 7;
const PULL_MS = 1100;
const pull = tween({ duration: PULL_MS, easing: "decelerate" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const cleanTime = (t: string) => t.trim().replace(/\s+/g, " ").slice(0, 12);

// ---- Reducer side ----

/** The actor out of every car: off a rider seat, or out of the driver's seat. */
function vacate(cars: Car[], user: string): Car[] {
  return cars.map((c) => {
    if (c.driver === user) return { ...c, driver: null };
    if (!c.riders.includes(user)) return c;
    return { ...c, riders: c.riders.filter((u) => u !== user), full: 0 };
  });
}

function reduceCarpool(s: State, a: Record<string, unknown>, user: string, meta: { seq: number; time: number }): State {
  if (a.t === "join") {
    const car = s.cars.find((c) => c.id === a.car);
    if (!car || car.riders.includes(user) || s.cars.some((c) => c.driver === user) || car.riders.length >= car.seats) return s;
    const cars = vacate(s.cars, user).map((c) => {
      if (c.id !== car.id) return c;
      const riders = [...c.riders, user];
      return { ...c, riders, full: riders.length === c.seats ? meta.time : 0 };
    });
    return { ...s, cars };
  }
  if (a.t === "leave") {
    if (!s.cars.some((c) => c.driver === user || c.riders.includes(user))) return s;
    return { ...s, cars: vacate(s.cars, user) };
  }
  if (a.t === "drive") {
    const seats = a.seats;
    if (typeof seats !== "number" || !Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS || typeof a.leaves !== "string") return s;
    if (s.cars.length >= MAX_CARS || s.cars.some((c) => c.driver === user)) return s;
    const car: Car = { id: `c${meta.seq}`, driver: user, seats, leaves: cleanTime(a.leaves), cost: 0, riders: [], full: 0 };
    return { ...s, cars: [...vacate(s.cars, user), car] };
  }
  if (a.t === "wheel") {
    const car = s.cars.find((c) => c.id === a.car);
    if (!car || car.driver !== null || s.cars.some((c) => c.driver === user)) return s;
    return { ...s, cars: vacate(s.cars, user).map((c) => (c.id === car.id ? { ...c, driver: user } : c)) };
  }
  return s;
}

// ---- Check side ----

const where = (s: State, u: string) => s.cars.filter((c) => c.driver === u || c.riders.includes(u)).map((c) => c.id);
/** Each person's part of a car's cost: even across everyone in it; the driver takes the leftover cents. */
function shares(c: Car): Record<string, number> {
  const people = [...(c.driver ? [c.driver] : []), ...c.riders];
  const out: Record<string, number> = {};
  if (!people.length || !c.cost) return out;
  const each = Math.floor(c.cost / people.length);
  people.forEach((u) => (out[u] = each));
  out[people[0]!] = out[people[0]!]! + c.cost - each * people.length;
  return out;
}
const seatMap = (s: State) => JSON.stringify(s.cars.map((c) => [c.id, c.driver, c.riders]));

export default defineApp<State, Action, Local>({
  name: "Carpool",
  summary: (s, ctx) => {
    const placed = ctx.members.filter((m) => where(s, m.id).length).length;
    return `${s.title}: ${s.cars.length} cars, ${placed} of ${ctx.members.length} have a ride.`;
  },

  // Drivers are matched to the chat; init reruns with the member list until someone acts.
  init: (ctx) => {
    const used = new Set<string>();
    const cars: Car[] = [];
    P.cars.slice(0, MAX_CARS).forEach((c, i) => {
      const want = c.driver.trim().toLowerCase();
      const d = want ? ctx.members.find((m) => m.id === c.driver || m.name.toLowerCase() === want)?.id : undefined;
      const driver = d && !used.has(d) ? d : null;
      if (driver) used.add(driver);
      const cost = Number.isInteger(c.costCents) && c.costCents >= 0 && c.costCents <= 100_000 ? c.costCents : 0;
      cars.push({ id: `p${i}`, driver, seats: Math.max(1, Math.min(MAX_SEATS, Math.floor(c.seats) || 3)), leaves: cleanTime(c.leaves), cost, riders: [], full: 0 });
    });
    return { title: P.title.trim().slice(0, 60) || "Carpool", cars };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceCarpool(state, action as unknown as Record<string, unknown>, meta.user, meta) : state),

  // Someone left: their seat opens, or their car needs a new driver. Someone joined: any open
  // seat or driverless car is theirs to take.
  onMembers: (state, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    if (state.cars.every((c) => (c.driver === null || here(c.driver)) && c.riders.every(here))) return state;
    return {
      ...state,
      cars: state.cars.map((c) => {
        const riders = c.riders.filter(here);
        return { ...c, driver: c.driver !== null && here(c.driver) ? c.driver : null, riders, full: riders.length === c.riders.length ? c.full : 0 };
      }),
    };
  },

  invariants: {
    "everyone is in one car at most": (s, ctx) => ctx.members.every((m) => where(s, m.id).length <= 1),
    "riders fit the seats": (s) => s.cars.every((c) => c.riders.length <= c.seats && c.seats >= 1 && c.seats <= MAX_SEATS),
    "a car is marked full exactly when every seat is taken": (s) => s.cars.every((c) => (c.full > 0) === (c.riders.length === c.seats)),
    "cost shares add up to each car's cost": (s) => s.cars.every((c) => Object.keys(shares(c)).length === 0 || Object.values(shares(c)).reduce((a, x) => a + x, 0) === c.cost),
    "shares in a car differ by less than the number of people in it": (s) =>
      s.cars.every((c) => {
        const v = Object.values(shares(c));
        return v.length === 0 || Math.max(...v) - Math.min(...v) < v.length;
      }),
    "everyone in a car is in the chat": (s, ctx) => s.cars.every((c) => (c.driver === null || inChat(ctx, c.driver)) && c.riders.every((u) => inChat(ctx, u))),
    "at most 5 cars, each id once": (s) => s.cars.length <= MAX_CARS && new Set(s.cars.map((c) => c.id)).size === s.cars.length,
  },

  transitions: {
    "a join seats the actor in that car, which had room, and moves no one else": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const before = p.cars.find((c) => c.id === a.car);
      const after = n.cars.find((c) => c.id === a.car);
      const others = (x: State) => JSON.stringify(x.cars.map((c) => [c.id, c.driver === m.user ? null : c.driver, c.riders.filter((u) => u !== m.user)]));
      return !!before && !!after && !p.cars.some((c) => c.driver === m.user) && before.riders.length < before.seats && after.riders.at(-1) === m.user && where(n, m.user).join() === a.car && others(p) === others(n);
    },
    "the car that fills up starts pulling out at that moment": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const after = n.cars.find((c) => c.id === a.car)!;
      return after.riders.length === after.seats ? after.full === m.time : after.full === 0;
    },
    "leaving empties only the actor's place": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      const others = (x: State) => JSON.stringify(x.cars.map((c) => [c.id, c.driver === m.user ? null : c.driver, c.riders.filter((u) => u !== m.user)]));
      return where(p, m.user).length === 1 && where(n, m.user).length === 0 && others(p) === others(n) && n.cars.length === p.cars.length;
    },
    "offering a car adds one, driven by the actor, at the end": (p, n, a, m) => {
      if (a.t !== "drive" || p === n) return true;
      const car = n.cars.at(-1);
      return n.cars.length === p.cars.length + 1 && car?.driver === m.user && car.seats === a.seats && car.riders.length === 0 && car.id === `c${m.seq}` && !p.cars.some((c) => c.driver === m.user);
    },
    "taking the wheel fills a driverless car with the actor": (p, n, a, m) => {
      if (a.t !== "wheel" || p === n) return true;
      return p.cars.find((c) => c.id === a.car)?.driver === null && n.cars.find((c) => c.id === a.car)?.driver === m.user && where(n, m.user).join() === a.car;
    },
    "times and costs never change": (p, n) => p.cars.every((c) => { const x = n.cars.find((y) => y.id === c.id); return !!x && x.leaves === c.leaves && x.cost === c.cost && x.seats === c.seats; }),
    "only people in the chat move anyone": (p, n, a, m, ctx) => seatMap(p) === seatMap(n) || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (k < 0.08) return { t: "leave" };
    if (k < 0.16) return { t: "drive", seats: 1 + r.int(5), leaves: r.pick(["6:00 PM", "6:45", "after class"]) };
    const c = s.cars.length ? r.pick(s.cars) : null;
    if (!c) return { t: "drive", seats: 1 + r.int(5), leaves: "7:00 PM" };
    if (c.driver === null && r.next() < 0.5) return { t: "wheel", car: c.id };
    return { t: "join", car: c.id };
  },

  local: { offering: false, seats: 3, leaves: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const mine = state.cars.find((c) => c.driver === me || c.riders.includes(me));
    const riderless = members.filter((m) => !state.cars.some((c) => c.driver === m.id || c.riders.includes(m.id)));
    const firstOpen = state.cars.find((c) => c.riders.length < c.seats && c.driver !== null)?.id ?? state.cars.find((c) => c.riders.length < c.seats)?.id;
    const fullest = state.cars.reduce((t, c) => Math.max(t, c.full), 0);

    const car = (c: Car) => {
      const e = c.full ? running(c.full, PULL_MS) : null;
      // The car eases forward and settles back as the last seat fills.
      const x = e === null ? 0 : Math.sin(pull(e) * Math.PI) * 32;
      const open = c.seats - c.riders.length;
      const mineHere = mine?.id === c.id;
      const each = shares(c);
      return (
        <div key={c.id} style={{ padding: "6px 0", borderTop: `1px solid ${theme.color.divider}` }}>
         <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                width: "fit-content",
                maxWidth: "100%",
                padding: "4px 10px 4px 4px",
                borderRadius: "18px 22px 22px 18px",
                background: c.full ? theme.color.selected : theme.color.input,
                transform: `translateX(${x}px)`,
              }}
            >
              {c.driver ? <Avatar user={c.driver} size={28} /> : <span style={{ width: 28, height: 28, borderRadius: 14, border: `2px dashed ${theme.color.divider}` }} />}
              <span style={{ width: 1, height: 20, background: theme.color.divider, margin: "0 2px" }} />
              {c.riders.map((u) => (
                <Avatar key={u} user={u} size={24} />
              ))}
              {Array.from({ length: open }, (_, i) => (
                <span key={`o${i}`} style={{ width: 24, height: 24, borderRadius: 12, background: theme.color.card, boxShadow: `inset 0 0 0 1.5px ${theme.color.divider}` }} />
              ))}
            </div>
          </div>
          {mineHere ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "leave" })}>
              Leave
            </Button>
          ) : c.driver === null && !state.cars.some((x) => x.driver === me) ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "wheel", car: c.id })}>
              Drive
            </Button>
          ) : open > 0 && !state.cars.some((x) => x.driver === me) ? (
            <Button kind={!mine && c.id === firstOpen ? "primary" : "secondary"} onClick={() => dispatch({ t: "join", car: c.id })}>
              {mine ? "Switch" : "Join"}
            </Button>
          ) : null}
         </div>
            <div style={{ marginTop: 2 }}>
              <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[c.driver === me ? "You're driving" : c.driver ? `${nameOf(c.driver)} driving` : "Needs a driver", c.leaves || null, c.full ? "full" : null, c.cost ? (c.riders.length ? `${money(each[c.riders[0]!] ?? 0)} each` : `${money(c.cost)} gas`) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </div>
        </div>
      );
    };

    return (
      <div>
        <CardHeader title={state.title} subtitle={mine ? (mine.driver === me ? `You're driving · ${mine.riders.length} riding` : `You're with ${nameOf(mine.driver ?? "")}${mine.leaves ? ` · leaving ${mine.leaves}` : ""}`) : `${state.cars.length} cars · tap one to ride`} />
        <div>{state.cars.map(car)}</div>
        {local.offering ? (
          <form
            style={{ display: "grid", gridTemplateColumns: "1fr 88px auto", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              dispatch({ t: "drive", seats: local.seats, leaves: local.leaves });
              setLocal({ offering: false, leaves: "" });
            }}
          >
            <input value={local.leaves} placeholder="Leaving at" aria-label="When you leave" onInput={(e) => setLocal({ leaves: e.currentTarget.value })} />
            <select aria-label="Seats for riders" value={String(local.seats)} onInput={(e) => setLocal({ seats: Number(e.currentTarget.value) || 3 })}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={String(n)}>{`${n} seats`}</option>
              ))}
            </select>
            <Button
              kind="primary"
              onClick={() => {
                dispatch({ t: "drive", seats: local.seats, leaves: local.leaves });
                setLocal({ offering: false, leaves: "" });
              }}
            >
              Add
            </Button>
          </form>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, borderTop: `1px solid ${theme.color.divider}`, paddingTop: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {fullest && running(fullest, PULL_MS) !== null ? (
              <SystemLine>{(() => {
                const c = state.cars.find((x) => x.full === fullest)!;
                const who = c.driver === me ? "Your car" : c.driver ? `${nameOf(c.driver)}'s car` : "A car";
                return `${who} is full`;
              })()}</SystemLine>
            ) : riderless.length ? (
              <SystemLine>{`No ride yet: ${riderless.slice(0, 3).map((m) => (m.id === me ? "you" : m.name)).join(", ")}${riderless.length > 3 ? ` +${riderless.length - 3}` : ""}`}</SystemLine>
            ) : (
              <SystemLine>Everyone has a ride</SystemLine>
            )}
          </div>
          {state.cars.some((c) => c.driver === me) || state.cars.length >= MAX_CARS ? null : (
            <Button kind="deemphasized" onClick={() => setLocal({ offering: !local.offering })}>
              {local.offering ? "Cancel" : "I'll drive"}
            </Button>
          )}
        </div>
      </div>
    );
  },
});
