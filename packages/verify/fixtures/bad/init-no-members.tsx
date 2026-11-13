// Bad fixture: init assumes someone is in the chat, but it first runs before the member list arrives.
// Expect: stage determinism, rule init-throws.
import { defineApp, Avatar, Button, CardHeader, SystemLine } from "@muse/app";

// Pick seats for a group booking. Each person holds at most one seat; claiming a new seat frees
// the old one. The organizer can block seats that are not available. Two people racing for the
// same seat: the first claim in the log wins, the second is a no-op.

type State = {
  rows: number;
  cols: number;
  organizer: string;
  people: string[];
  seats: (string | null)[];
  held: Record<string, number>;
  blocked: number[];
};
type Action =
  | { t: "claim"; seat: number }
  | { t: "release" }
  | { t: "block"; seat: number }
  | { t: "unblock"; seat: number };

const ROWS = 3;
const COLS = 4;

const isObj = (a: unknown): a is Record<string, unknown> => typeof a === "object" && a !== null && !Array.isArray(a);
const isSeat = (s: State, n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < s.rows * s.cols;
const seatName = (cols: number, i: number) => `${String.fromCharCode(65 + Math.floor(i / cols))}${(i % cols) + 1}`;

function setSeat(seats: (string | null)[], i: number, who: string | null): (string | null)[] {
  return seats.map((x, j) => (j === i ? who : x));
}

function claim(s: State, user: string, seat: unknown): State {
  if (!isSeat(s, seat) || !s.people.includes(user)) return s;
  if (s.seats[seat] !== null || s.blocked.includes(seat)) return s;
  const old = s.held[user];
  let seats = setSeat(s.seats, seat, user);
  if (old !== undefined) seats = setSeat(seats, old, null);
  return { ...s, seats, held: { ...s.held, [user]: seat } };
}

function release(s: State, user: string): State {
  const old = s.held[user];
  if (old === undefined) return s;
  const held: Record<string, number> = {};
  for (const k of Object.keys(s.held).sort()) if (k !== user) held[k] = s.held[k]!;
  return { ...s, seats: setSeat(s.seats, old, null), held };
}

function block(s: State, user: string, seat: unknown): State {
  if (user !== s.organizer || !isSeat(s, seat)) return s;
  if (s.seats[seat] !== null || s.blocked.includes(seat)) return s;
  return { ...s, blocked: [...s.blocked, seat].sort((a, b) => a - b) };
}

function unblock(s: State, user: string, seat: unknown): State {
  if (user !== s.organizer || !isSeat(s, seat) || !s.blocked.includes(seat)) return s;
  return { ...s, blocked: s.blocked.filter((b) => b !== seat) };
}

export default defineApp<State, Action>({
  name: "Seats",

  summary: (s) => {
    const taken = Object.keys(s.held).length;
    const open = s.seats.filter((x, i) => x === null && !s.blocked.includes(i)).length;
    return `${taken} of ${s.people.length} have seats. ${open} open.`;
  },

  init: (ctx) => ({
    rows: ROWS,
    cols: COLS,
    organizer: ctx.members[0]!.id,
    people: ctx.members.map((m) => m.id),
    seats: Array.from({ length: ROWS * COLS }, () => null),
    held: {},
    blocked: [],
  }),

  reduce: (state, action, meta) => {
    const a: unknown = action;
    if (!isObj(a)) return state;
    if (a.t === "claim") return claim(state, meta.user, a.seat);
    if (a.t === "release") return release(state, meta.user);
    if (a.t === "block") return block(state, meta.user, a.seat);
    if (a.t === "unblock") return unblock(state, meta.user, a.seat);
    return state;
  },

  // People who left give up their seats; a new organizer takes over.
  onMembers: (s, ctx) => {
    const ids = ctx.members.map((m) => m.id);
    let next: State = { ...s, people: ids, organizer: ids.includes(s.organizer) ? s.organizer : (ids[0] ?? "") };
    for (const u of Object.keys(s.held).sort()) if (!ids.includes(u)) next = release(next, u);
    return next;
  },

  invariants: {
    "the map keeps its size": (s) => s.rows === ROWS && s.cols === COLS && s.seats.length === s.rows * s.cols,
    "every taken seat is held by its taker": (s) => s.seats.every((who, i) => who === null || s.held[who] === i),
    "every held seat shows its holder": (s) => Object.keys(s.held).every((u) => s.seats[s.held[u]!] === u),
    "no one holds two seats": (s) => {
      const taken = s.seats.filter((x): x is string => x !== null);
      return new Set(taken).size === taken.length;
    },
    "blocked seats are empty, sorted and on the map": (s) =>
      s.blocked.every((b, i) => Number.isInteger(b) && b >= 0 && b < s.seats.length && s.seats[b] === null && (i === 0 || b > s.blocked[i - 1]!)),
    "only people in the chat hold seats": (s, ctx) => Object.keys(s.held).every((u) => ctx.members.some((m) => m.id === u)),
  },

  arbitrary: (s, user, r) => {
    const roll = r.int(100);
    const free = s.seats.map((x, i) => i).filter((i) => s.seats[i] === null && !s.blocked.includes(i));
    if (roll < 60 && free.length) return { t: "claim", seat: r.pick(free) };
    if (roll < 70) return { t: "claim", seat: r.int(s.rows * s.cols) };
    if (roll < 80) return { t: "release" };
    if (roll < 90 && free.length) return { t: "block", seat: r.pick(free) };
    if (s.blocked.length) return { t: "unblock", seat: r.pick(s.blocked) };
    return null;
  },

  view: ({ state, me, members, dispatch, theme }) => {
    const mine = state.held[me];
    const size = Math.min(56, Math.floor((theme.width - 32 - (state.cols - 1) * 8) / state.cols));
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    return (
      <div>
        <CardHeader
          title="Pick your seat"
          subtitle={mine === undefined ? "Tap an open seat" : `You're in ${seatName(state.cols, mine)}`}
        />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${state.cols}, ${size}px)`, gap: 8 }}>
          {state.seats.map((who, i) => {
            const blocked = state.blocked.includes(i);
            const label = blocked ? "Not available" : who ? `${seatName(state.cols, i)}, ${nameOf(who)}` : `${seatName(state.cols, i)}, open`;
            return (
              <button
                key={i}
                aria-label={label}
                disabled={blocked || (who !== null && who !== me)}
                style={{ height: size, borderRadius: 8, opacity: blocked ? 0.4 : 1 }}
                onClick={() => (who === me ? dispatch({ t: "release" }) : dispatch({ t: "claim", seat: i }))}
              >
                {who ? <Avatar user={who} size={28} /> : seatName(state.cols, i)}
              </button>
            );
          })}
        </div>
        {mine !== undefined ? (
          <div style={{ marginTop: 8 }}>
            <Button kind="secondary" onClick={() => dispatch({ t: "release" })}>
              Give up
            </Button>
          </div>
        ) : null}
        {state.blocked.length > 0 ? (
          <SystemLine actor={nameOf(state.organizer)}>blocked {String(state.blocked.length)} seats</SystemLine>
        ) : null}
      </div>
    );
  },
});
