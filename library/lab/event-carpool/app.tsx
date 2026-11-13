import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Chip,
  Locked,
  More,
  Placed,
  Scene,
  Toast,
  at,
  circle,
  haptic,
  innerWidth,
  pal,
  rect,
  running,
  tween,
  type Child,
  type Ctx,
} from "@muse/app";

// Event carpool: the group's cars seen from above, friends in their actual seats, the parking
// split for each car, and a lock once everyone has a ride. Tapping a "+" seat puts you there; a
// lock fills every open rider seat in chat order, then the cars roll off and the wheels-up toast
// shows. All facts (who sits where, when the cars locked) live in shared state. Money is integer
// cents: the driver keeps the leftover cents of each car's cost.

type Params = {
  /** Card title, where everyone is going: "Rides to Outside Lands" */
  title: string;
  /** Place and day, short: "Golden Gate Park · Sat" */
  place: string;
  /**
   * Up to three cars. driver is matched to the chat by id or name. seats counts the driver and
   * riders, 2 to 7. leaves: "4:15". from: "Unit 2". costCents: parking for that car, integer
   * cents. costLabel: "Kezar lot". riders: names already riding, front passenger first.
   */
  cars: { driver: string; model: string; seats: number; leaves: string; from: string; costCents: number; costLabel: string; riders: string[] }[];
};

// @params
const P: Params = {
  title: "Rides to Outside Lands",
  place: "Golden Gate Park · Sat",
  cars: [
    { driver: "Maya", model: "Maya's Civic", seats: 4, leaves: "4:15", from: "Unit 2", costCents: 4000, costLabel: "Kezar lot", riders: ["Noa"] },
    { driver: "Theo", model: "Theo's RAV4", seats: 5, leaves: "4:30", from: "Northside", costCents: 4000, costLabel: "Kezar lot", riders: ["Priya"] },
    { driver: "Dev", model: "Dev's Jeep", seats: 4, leaves: "5:00", from: "Clark Kerr", costCents: 2400, costLabel: "Street meter", riders: [] },
  ],
};
// @end params

type Car = { id: string; model: string; leaves: string; from: string; cost: number; lot: string; seats: (string | null)[] };
type State = { title: string; place: string; cars: Car[]; lockedAt: number };
type Action = { t: "sit"; car: string; k: number } | { t: "leave" } | { t: "auto" } | { t: "lock" };
type Local = Record<string, never>;
type Spot = [number, number];

const MAX_CARS = 3;
const MIN_SEATS = 2;
const MAX_SEATS = 7;
const MAX_COST = 100_000;
const ROW_H = 76;
const ROW_GAP = 6;
const LOCK_MS = 2400;
const ROLL_MS = 600;
const ROLL_STAGGER = 150;
const ROLL_PX = 14;

const roll = tween({ duration: ROLL_MS, easing: "decelerate" });

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}.${String(Math.abs(Math.round(c)) % 100).padStart(2, "0")}`;
/** Whole dollars when the cost is whole, cents otherwise. */
const dollars = (c: number) => (c % 100 === 0 ? `$${c / 100}` : money(c));
const trim = (s: string, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function seatCount(v: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 4;
  return clamp(Math.trunc(v), MIN_SEATS, MAX_SEATS);
}

function costOf(v: number): number {
  return Number.isInteger(v) ? clamp(v, 0, MAX_COST) : 0;
}

/** [car index, seat index] for a person, or null when they have no seat. */
function seatOf(s: { cars: Car[] }, user: string): Spot | null {
  for (let i = 0; i < s.cars.length; i++) {
    const k = s.cars[i]!.seats.indexOf(user);
    if (k >= 0) return [i, k];
  }
  return null;
}

const isOpenRider = (c: Car, k: number) => k >= 1 && k < c.seats.length && c.seats[k] === null;

const openRiderSeats = (s: { cars: Car[] }) => s.cars.reduce((n, c) => n + c.seats.filter((x, k) => isOpenRider(c, k)).length, 0);

/** The car with the most open rider seats (ties by index), and its lowest open rider seat. */
function firstOpen(s: { cars: Car[] }): Spot | null {
  let best = -1;
  let bestCount = 0;
  for (let i = 0; i < s.cars.length; i++) {
    const c = s.cars[i]!;
    let n = 0;
    for (let k = 1; k < c.seats.length; k++) if (c.seats[k] === null) n++;
    if (n > bestCount) {
      best = i;
      bestCount = n;
    }
  }
  if (best < 0) return null;
  const k = s.cars[best]!.seats.findIndex((x, i) => i >= 1 && x === null);
  return k >= 0 ? [best, k] : null;
}

const seated = (s: { cars: Car[] }) => s.cars.reduce((n, c) => n + c.seats.filter((x) => x !== null).length, 0);
const unseatedMembers = (s: State, ctx: Ctx) => ctx.members.filter((m) => seatOf(s, m.id) === null).length;

const sameSpot = (a: Spot | null, b: Spot | null) => (a === null ? b === null : b !== null && a[0] === b[0] && a[1] === b[1]);

/** Every non-null seat in p still holds the same person in n. */
function everySeatKept(p: State, n: State): boolean {
  if (n.cars.length !== p.cars.length) return false;
  return p.cars.every((c) => {
    const d = n.cars.find((x) => x.id === c.id);
    if (!d || d.seats.length !== c.seats.length) return false;
    return c.seats.every((u, k) => u === null || d.seats[k] === u);
  });
}

/** The seat map, with one person treated as absent. */
const others = (s: State, user: string) => JSON.stringify(s.cars.map((c) => [c.id, c.seats.map((x) => (x === user ? null : x))]));
const seatsJson = (s: State) => JSON.stringify(s.cars.map((c) => [c.id, c.seats]));

/** Each person's part of a car's cost: even across the people in it; the first person keeps the cents. */
function shares(c: Car): Record<string, number> {
  const people = c.seats.filter((x): x is string => x !== null);
  const out: Record<string, number> = {};
  if (!people.length || c.cost === 0) return out;
  const each = Math.floor(c.cost / people.length);
  for (const u of people) out[u] = each;
  out[people[0]!] = each + (c.cost - each * people.length);
  return out;
}

// ---- Reducer side ----

function vacate(cars: Car[], user: string): Car[] {
  return cars.map((c) => (c.seats.includes(user) ? { ...c, seats: c.seats.map((x) => (x === user ? null : x)) } : c));
}

function sitAt(cars: Car[], id: string, k: number, user: string): Car[] {
  return vacate(cars, user).map((c) => (c.id === id ? { ...c, seats: c.seats.map((x, i) => (i === k ? user : x)) } : c));
}

function reduceCarpool(s: State, a: Action, time: number, ctx: Ctx, user: string): State {
  if (a.t === "sit") {
    if (typeof a.car !== "string" || typeof a.k !== "number" || !Number.isInteger(a.k)) return s;
    const car = s.cars.find((c) => c.id === a.car);
    if (!car || a.k < 0 || a.k >= car.seats.length || car.seats[a.k] !== null) return s;
    const mine = seatOf(s, user);
    if (s.lockedAt > 0 && mine !== null) return s;
    return { ...s, cars: sitAt(s.cars, car.id, a.k, user) };
  }

  if (a.t === "leave") {
    if (s.lockedAt > 0 || seatOf(s, user) === null) return s;
    return { ...s, cars: vacate(s.cars, user) };
  }

  if (a.t === "auto") {
    if (seatOf(s, user) !== null) return s;
    const spot = firstOpen(s);
    if (!spot) return s;
    return { ...s, cars: sitAt(s.cars, s.cars[spot[0]]!.id, spot[1], user) };
  }

  if (a.t === "lock") {
    if (s.lockedAt > 0 || seatOf(s, user) === null) return s;
    let cars = s.cars.map((c) => ({ ...c, seats: [...c.seats] }));
    for (const member of ctx.members) {
      if (seatOf({ cars }, member.id) !== null) continue;
      const spot = firstOpen({ cars });
      if (!spot) break;
      const id = cars[spot[0]]!.id;
      cars = cars.map((c) => (c.id === id ? { ...c, seats: c.seats.map((x, k) => (k === spot[1] ? member.id : x)) } : c));
    }
    return { ...s, cars, lockedAt: time };
  }

  return s;
}

export default defineApp<State, Action, Local>({
  name: "Event carpool",
  summary: (s, ctx) => {
    const n = seated(s);
    if (s.lockedAt > 0) return `${s.title}: cars locked · ${n} riders in ${s.cars.length} cars`;
    return `${s.title}: ${n} seated · ${unseatedMembers(s, ctx)} need a ride`;
  },

  init: (ctx) => {
    const used = new Set<string>();
    const match = (who: string): string | null => {
      const want = typeof who === "string" ? who.trim().toLowerCase() : "";
      if (!want) return null;
      const m = ctx.members.find((x) => x.id === who || x.name.trim().toLowerCase() === want);
      return m ? m.id : null;
    };
    const cars: Car[] = P.cars.slice(0, MAX_CARS).map((src, i) => {
      const n = seatCount(src.seats);
      const seats: (string | null)[] = Array.from({ length: n }, () => null);
      const driver = match(src.driver);
      if (driver && !used.has(driver)) {
        seats[0] = driver;
        used.add(driver);
      }
      let k = 1;
      for (const name of src.riders) {
        if (k >= n) break;
        const id = match(name);
        if (!id || used.has(id)) continue;
        seats[k] = id;
        used.add(id);
        k++;
      }
      return {
        id: `c${i}`,
        model: trim(src.model, 28) || `Car ${i + 1}`,
        leaves: trim(src.leaves, 16),
        from: trim(src.from, 16),
        cost: costOf(src.costCents),
        lot: trim(src.costLabel, 16),
        seats,
      };
    });
    return { title: P.title, place: P.place, cars, lockedAt: 0 };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceCarpool(state, action, meta.time, ctx, meta.user) : state),

  // Anyone who left the chat gives up their seat, driver's seat included; the lock stays a fact.
  onMembers: (state, ctx) => {
    const here = new Set(ctx.members.map((m) => m.id));
    let changed = false;
    const cars = state.cars.map((c) => {
      const seats = c.seats.map((x) => (x !== null && !here.has(x) ? null : x));
      if (seats.every((x, i) => x === c.seats[i])) return c;
      changed = true;
      return { ...c, seats };
    });
    return changed ? { ...state, cars } : state;
  },

  invariants: {
    "nobody sits twice": (s) => {
      const all = s.cars.flatMap((c) => c.seats).filter((x): x is string => x !== null);
      return new Set(all).size === all.length;
    },
    "everyone seated is in the chat": (s, ctx) => s.cars.every((c) => c.seats.every((x) => x === null || inChat(ctx, x))),
    "cars keep their shape": (s) =>
      s.cars.length >= 1 && s.cars.length <= MAX_CARS && s.cars.every((c) => c.seats.length >= MIN_SEATS && c.seats.length <= MAX_SEATS) && new Set(s.cars.map((c) => c.id)).size === s.cars.length,
    "shares add up to each car's cost": (s) =>
      s.cars.every((c) => {
        const v = Object.values(shares(c));
        return v.length === 0 || v.reduce((a, x) => a + x, 0) === c.cost;
      }),
    "shares differ by less than the number of people": (s) =>
      s.cars.every((c) => {
        const v = Object.values(shares(c));
        return v.length === 0 || Math.max(...v) - Math.min(...v) < v.length;
      }),
    "lock time is a whole number": (s) => Number.isInteger(s.lockedAt) && s.lockedAt >= 0,
  },

  transitions: {
    "sitting puts the actor in an open seat and moves no one else": (p, n, a, m) => {
      if (a.t !== "sit" || p === n) return true;
      const car = p.cars.find((c) => c.id === a.car);
      if (!car || typeof a.k !== "number" || !Number.isInteger(a.k) || a.k < 0 || a.k >= car.seats.length) return false;
      const after = n.cars.find((c) => c.id === a.car);
      return (
        car.seats[a.k] === null &&
        !!after &&
        after.seats[a.k] === m.user &&
        sameSpot(seatOf(n, m.user), [p.cars.indexOf(car), a.k]) &&
        others(p, m.user) === others(n, m.user) &&
        (p.lockedAt === 0 || seatOf(p, m.user) === null)
      );
    },
    "leaving frees only the actor's seat": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      return p.lockedAt === 0 && seatOf(p, m.user) !== null && seatOf(n, m.user) === null && others(p, m.user) === others(n, m.user);
    },
    "seat me takes the first open rider seat": (p, n, a, m) => {
      if (a.t !== "auto" || p === n) return true;
      return seatOf(p, m.user) === null && sameSpot(seatOf(n, m.user), firstOpen(p)) && others(p, m.user) === others(n, m.user);
    },
    "locking keeps every seat and seats who it can": (p, n, a, m, ctx) => {
      if (a.t !== "lock" || p === n) return true;
      return (
        p.lockedAt === 0 &&
        seatOf(p, m.user) !== null &&
        n.lockedAt === m.time &&
        everySeatKept(p, n) &&
        seated(n) === seated(p) + Math.min(unseatedMembers(p, ctx), openRiderSeats(p))
      );
    },
    "after the lock nobody is moved": (p, n) => p.lockedAt === 0 || everySeatKept(p, n),
    "car details never change": (p, n) =>
      p.cars.length === n.cars.length &&
      p.cars.every((c) => {
        const d = n.cars.find((x) => x.id === c.id);
        return !!d && d.id === c.id && d.model === c.model && d.leaves === c.leaves && d.from === c.from && d.cost === c.cost && d.lot === c.lot && d.seats.length === c.seats.length;
      }),
    "only people in the chat move anyone": (p, n, _a, m, ctx) => (seatsJson(p) === seatsJson(n) && p.lockedAt === n.lockedAt) || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (!s.cars.length) return null;
    const k = r.next();
    const c = r.pick(s.cars);
    const open = c.seats.map((x, i) => (x === null ? i : -1)).filter((i) => i >= 0);
    if (seatOf(s, user) === null) return k < 0.3 || !open.length ? { t: "auto" } : { t: "sit", car: c.id, k: r.pick(open) };
    if (s.lockedAt === 0) {
      if (k < 0.06) return { t: "lock" };
      if (k < 0.2) return { t: "leave" };
      return { t: "sit", car: c.id, k: open.length ? r.pick(open) : r.int(c.seats.length) };
    }
    return { t: "sit", car: c.id, k: r.int(c.seats.length) };
  },

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = innerWidth();
    const B = Math.min(150, Math.round(W * 0.42));
    const locked = state.lockedAt > 0;
    const mine = seatOf(state, me);
    const mineCar = mine ? state.cars[mine[0]] : null;
    const unseated = members.filter((m) => seatOf(state, m.id) === null);
    const everyone = unseated.length === 0;
    const riders = seated(state);
    const openAny = state.cars.some((car) => car.seats.some((x) => x === null));
    const e = running(confirmed.lockedAt, LOCK_MS);

    const rollFor = (i: number) => {
      if (e === null) return locked ? ROLL_PX : 0;
      const u = clamp(e - i * ROLL_STAGGER, 0, ROLL_MS);
      return ROLL_PX * roll(u);
    };

    const seatPositions = (n: number, x0: number, y0: number) => {
      const fx = x0 + B * 0.6;
      const bx = x0 + B * 0.3;
      const cy = y0 + 28;
      const out: { x: number; y: number; size: number }[] = [
        { x: fx, y: cy - 13, size: 22 },
        { x: fx, y: cy + 13, size: 22 },
      ];
      const back = Math.max(0, n - 2);
      const column = (x: number, count: number) => {
        if (count <= 0) return;
        if (count === 1) out.push({ x, y: cy, size: 22 });
        else if (count === 2) out.push({ x, y: cy - 13, size: 22 }, { x, y: cy + 13, size: 22 });
        else for (let i = 0; i < count; i++) out.push({ x, y: cy - ((count - 1) / 2) * 19 + i * 19, size: 18 });
      };
      if (back <= 3) column(bx, back);
      else {
        const first = Math.ceil(back / 2);
        column(bx, first);
        column(x0 + B * 0.42, back - first);
      }
      return out;
    };

    const carRow = (car: Car, i: number) => {
      const n = car.seats.length;
      const dx = rollFor(i);
      const x0 = 12 + dx;
      const y0 = 10;
      const spots = seatPositions(n, x0, y0);
      const people = car.seats.filter((x) => x !== null).length;
      const open = n - people;
      const each = people ? Math.floor(car.cost / people) : 0;
      const fill = [c.series1, c.series3, c.series2][i] ?? c.series1;

      const art: Child[] = [];
      if (e !== null) {
        const off = -((e * 0.16) % 40);
        for (let x = off; x < B + 28; x += 40) art.push(rect(x, 38, 18, 3, 1.5, c.secondaryText, { key: `d${Math.round(x)}`, opacity: 0.6 }));
      }
      [
        [0.22, 0],
        [0.78, 0],
        [0.22, 1],
        [0.78, 1],
      ].forEach(([fx, fy], j) => art.push(rect(x0 + B * fx! - 10, y0 + 56 * fy! - 4, 20, 8, 3, p.ink, { key: `w${j}` })));
      art.push(rect(x0, y0, B, 56, 20, fill, { key: "body" }));
      art.push(rect(x0 + B * 0.72, y0 + 7, B * 0.1, 42, 5, c.card, { key: "ws", opacity: 0.55 }));
      art.push(rect(x0 + 8, y0 + 10, 7, 36, 3, c.card, { key: "rw", opacity: 0.45 }));
      art.push(circle(x0 + B - 4, y0 + 10, 3.5, p.cream, { key: "hl1" }));
      art.push(circle(x0 + B - 4, y0 + 46, 3.5, p.cream, { key: "hl2" }));
      art.push(circle(spots[0]!.x, spots[0]!.y, 15, "none", { key: "ring", stroke: c.text, "stroke-width": 1.5, opacity: 0.5 }));

      const showOpen = !(locked && mine !== null);
      // Open seats take one tap target each; the back seats, packed closer than a fingertip, share one.
      const openAt = (ks: number[]) => (showOpen ? ks.filter((k) => car.seats[k] === null) : []);
      const backKs = Array.from({ length: Math.max(0, n - 2) }, (_, i) => i + 2);
      const groups = [[0], [1], ...(backKs.length <= 2 ? backKs.map((k) => [k]) : [backKs])].map(openAt).filter((g) => g.length > 0);

      return (
        <Scene key={car.id} height={ROW_H} bg={c.input} radius={12} label={`${car.model}: ${people} of ${n} seats taken`} art={art}>
          {car.seats.map((u, k) =>
            u !== null ? <Placed key={`p${k}`} user={u} x={spots[k]!.x / W} y={spots[k]!.y / ROW_H} size={spots[k]!.size} me={me} /> : null,
          )}
          {groups.map((g) => {
            const xs = g.map((k) => spots[k]!.x);
            const lo = Math.min(...xs);
            const hi = Math.max(...xs);
            const w = 44 + (hi - lo);
            const gx = (lo + hi) / 2;
            const gy = g.reduce((t, k) => t + spots[k]!.y, 0) / g.length;
            const first = g[0]!;
            return (
              <button
                key={`s${first}`}
                type="button"
                aria-label={first === 0 ? `Drive ${car.model}` : `Sit in ${car.model}`}
                onClick={() => dispatch({ t: "sit", car: car.id, k: first })}
                style={{ ...(at(gx / W, gy / ROW_H, { width: w, height: 44, background: "none", border: 0, padding: 0 }) as Record<string, string | number>) }}
              >
                {g.map((k) => (
                  <span
                    key={k}
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: spots[k]!.x - (gx - w / 2) - 11,
                      top: spots[k]!.y - (gy - 22) - 11,
                      width: 22,
                      height: 22,
                      boxSizing: "border-box",
                      borderRadius: "50%",
                      background: c.card,
                      border: `1.5px dashed ${c.text}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: c.text,
                      fontSize: 13,
                      lineHeight: 1,
                      fontWeight: 600,
                    }}
                  >
                    +
                  </span>
                ))}
              </button>
            );
          })}
          <div style={{ position: "absolute", left: B + 34, right: 10, top: 6, pointerEvents: "none" }}>
            <div style={{ position: "relative", paddingRight: 54, fontSize: car.model.length > 10 ? 14 : 15, lineHeight: "20px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {car.model}
            </div>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {car.seats[0] === null ? `Needs a driver · ${car.leaves}` : `Leaves ${car.leaves} · ${car.from}`}
            </div>
            <div style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {car.cost === 0 ? "No parking cost" : `${money(each)} each`}
            </div>
            {car.cost === 0 ? null : (
              <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {`${car.lot} ${dollars(car.cost)} ÷ ${people}`}
              </div>
            )}
          </div>
          <div style={{ position: "absolute", top: 6, right: 8 }}>
            <Chip tone={open === 0 ? "positive" : "neutral"}>{open === 0 ? "Full" : `${open} open`}</Chip>
          </div>
        </Scene>
      );
    };

    const shown = unseated.slice(0, 5);
    const extra = unseated.length - shown.length;

    const tray = (
      <div style={{ height: 44, display: "flex", alignItems: "center", gap: 8, background: c.input, borderRadius: 12, padding: "0 12px", overflow: "hidden" }}>
        <small style={{ flex: "none", color: c.secondaryText }}>Need a ride</small>
        {shown.length ? (
          <div style={{ display: "flex", alignItems: "center", flex: "none" }}>
            {shown.map((m, i) => (
              <span
                key={m.id}
                style={{
                  display: "flex",
                  flex: "none",
                  marginLeft: i ? -9 : 0,
                  borderRadius: "50%",
                  boxShadow: m.id === me ? `0 0 0 2px ${c.card}, 0 0 0 4px ${c.primary}` : undefined,
                }}
              >
                <Avatar user={m.id} size={26} />
              </span>
            ))}
            {extra > 0 ? (
              <span style={{ display: "flex", marginLeft: -9, flex: "none" }}>
                <More n={extra} />
              </span>
            ) : null}
          </div>
        ) : null}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          {everyone ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span
                aria-hidden="true"
                style={{ flex: "none", width: 14, height: 14, borderRadius: 7, background: c.positive, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width={9} height={9} viewBox="0 0 16 16" fill="none" stroke={c.onPrimary} stroke-width={1.8} stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 8.5l2.5 2.5L12 5.5" />
                </svg>
              </span>
              <span style={{ minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                Everyone has a seat
              </span>
            </span>
          ) : mine === null ? (
            <span style={{ minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.link, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Tap a + seat
            </span>
          ) : !locked ? (
            <>
              <span style={{ minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {`You're in ${mineCar ? mineCar.model : "a car"}`}
              </span>
              <Button kind="secondary" onClick={() => dispatch({ t: "leave" })}>
                Leave
              </Button>
            </>
          ) : null}
        </div>
      </div>
    );

    const action = locked ? (
      !mine && openAny ? (
        <div style={{ height: 40, display: "flex", alignItems: "center" }}>
          <Button kind="primary" wide onClick={() => dispatch({ t: "auto" })}>
            Seat me
          </Button>
        </div>
      ) : (
        <Locked detail={`${mine && mineCar ? `You're in ${mineCar.model}` : "No seat yet"} · ${riders} riders · ${state.cars.length} cars`}>
          Wheels up · cars are locked
        </Locked>
      )
    ) : mine ? (
      <div style={{ height: 40, display: "flex", alignItems: "center" }}>
        <Button
          kind="primary"
          wide
          onClick={() => {
            haptic("success");
            dispatch({ t: "lock" });
          }}
        >
          Lock cars
        </Button>
      </div>
    ) : (
      <div style={{ height: 40, display: "flex", alignItems: "center" }}>
        <Button kind="primary" wide onClick={() => dispatch({ t: "auto" })}>
          Seat me
        </Button>
      </div>
    );

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.place} />

        <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>{state.cars.map(carRow)}</div>

        <div style={{ height: 8 }} />
        {tray}
        <div style={{ height: 8 }} />
        {action}

        {e !== null ? <Toast key={confirmed.lockedAt}>Wheels up. Cars are locked.</Toast> : null}
      </div>
    );
  },
});
