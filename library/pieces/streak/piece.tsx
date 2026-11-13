import { defineApp, Avatar, Button, CardHeader, Facepile, clock, running, spring, springs } from "@muse/app";

// Streak board: one check-in per person per day. The board shows this week, Monday to Sunday,
// each person's current streak (days in a row, alive until a whole day is missed) and best streak,
// and the weekly stake line with whoever has the fewest days so far.
//
// The day comes from the server time of the check-in (meta.time), never from the device: a day is
// 24 hours starting at `dayStartsAt` o'clock at the fixed UTC offset `utcOffsetMinutes`. With the
// default (4 AM Pacific standard time) a 1 AM workout still counts for the night before.

type Params = {
  /** Card title: "Gym streak" */
  title: string;
  /** The weekly stake, one plain line from the chat: "Fewest days by Sunday buys smoothies". Empty if none. */
  stake: string;
  /** The group's UTC offset in minutes, fixed (no daylight saving): -480 is Pacific standard time, -300 Eastern. */
  utcOffsetMinutes: number;
  /** Hour the day starts, 0 to 23. 4 means check-ins before 4 AM count for the day before. */
  dayStartsAt: number;
};

// @params
const P: Params = {
  title: "Gym streak",
  stake: "Fewest days by Sunday buys smoothies",
  utcOffsetMinutes: -480,
  dayStartsAt: 4,
};
// @end params

/** days: day numbers checked in, ascending. at: server time of the newest check-in. */
type Person = { user: string; days: number[]; at: number };
type State = { title: string; stake: string; shift: number; people: Person[] };
type Action = { t: "check" } | { t: "undo" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name?: string }[] };

const DAY_MS = 86_400_000;
const MAX_DAYS = 400;
const FILL_MS = 900;
const pop = spring(springs.iosBouncy);
const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
// Check helpers (invariants, transitions, view).
/** Day number of a server time: days since 1970-01-01 at the group's day boundary. */
const dayOf = (shift: number, time: number) => Math.floor((time + shift) / DAY_MS);
/** Monday of the week holding `day` (day 0, 1970-01-01, was a Thursday). */
const mondayOf = (day: number) => day - ((((day + 3) % 7) + 7) % 7);
const personOf = (s: State, u: string) => s.people.find((p) => p.user === u);
/** Days in a row ending today, or ending yesterday if today is not in yet. */
function current(days: readonly number[], today: number): number {
  let i = days.length - 1;
  if (i < 0 || days[i]! < today - 1) return 0;
  let n = 1;
  while (i > 0 && days[i - 1] === days[i]! - 1) (n++, i--);
  return n;
}
function best(days: readonly number[]): number {
  let top = 0, run = 0;
  days.forEach((d, i) => ((run = i > 0 && days[i - 1] === d - 1 ? run + 1 : 1), (top = Math.max(top, run))));
  return top;
}
const weekCount = (days: readonly number[], today: number) => days.filter((d) => d >= mondayOf(today) && d <= today).length;
const othersSame = (p: State, n: State, u: string) => JSON.stringify(p.people.filter((x) => x.user !== u)) === JSON.stringify(n.people.filter((x) => x.user !== u));

// Reducer helpers.
function checkIn(s: State, user: string, time: number): State {
  const today = Math.floor((time + s.shift) / DAY_MS);
  const me = s.people.find((p) => p.user === user);
  if (!me) return { ...s, people: [...s.people, { user, days: [today], at: time }] };
  const last = me.days[me.days.length - 1]!;
  if (last >= today) return s; // already in today (or a clock that ran backwards)
  const days = [...me.days, today].slice(-MAX_DAYS);
  return { ...s, people: s.people.map((p) => (p.user === user ? { user, days, at: time } : p)) };
}

function undo(s: State, user: string, time: number): State {
  const today = Math.floor((time + s.shift) / DAY_MS);
  const me = s.people.find((p) => p.user === user);
  if (!me || me.days[me.days.length - 1] !== today) return s;
  const days = me.days.slice(0, -1);
  if (days.length === 0) return { ...s, people: s.people.filter((p) => p.user !== user) };
  return { ...s, people: s.people.map((p) => (p.user === user ? { user, days, at: 0 } : p)) };
}

export default defineApp<State, Action, Local>({
  name: "Streak board",
  summary: (s, ctx) => {
    const today = s.people.reduce((t, p) => Math.max(t, p.days[p.days.length - 1] ?? 0), 0);
    const inToday = s.people.filter((p) => p.days[p.days.length - 1] === today && inChat(ctx, p.user)).length;
    return `${s.title}: ${inToday} of ${ctx.members.length} checked in today.`;
  },

  init: () => {
    const off = Number.isFinite(P.utcOffsetMinutes) ? Math.max(-720, Math.min(840, Math.round(P.utcOffsetMinutes))) : 0;
    const start = Number.isFinite(P.dayStartsAt) ? Math.max(0, Math.min(23, Math.floor(P.dayStartsAt))) : 0;
    return { title: P.title.trim().slice(0, 60) || "Streak board", stake: P.stake.trim().slice(0, 80), shift: off * 60_000 - start * 3_600_000, people: [] };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "check") return checkIn(state, meta.user, meta.time);
    if (action.t === "undo") return undo(state, meta.user, meta.time);
    return state;
  },

  // Someone left: their row goes. Someone joined: they start at zero and can check in at once.
  onMembers: (state, ctx) => {
    const people = state.people.filter((p) => inChat(ctx, p.user));
    return people.length === state.people.length ? state : { ...state, people };
  },

  invariants: {
    "days only go forward, one check-in a day": (s) => s.people.every((p) => p.days.every((d, i) => Number.isInteger(d) && (i === 0 || d > p.days[i - 1]!))),
    "every row has a check-in and at most 400 days": (s) => s.people.every((p) => p.days.length >= 1 && p.days.length <= MAX_DAYS),
    "one row per person, all in the chat": (s, ctx) => new Set(s.people.map((p) => p.user)).size === s.people.length && s.people.every((p) => inChat(ctx, p.user)),
    "the newest check-in time falls on the newest day, or was taken back": (s) => s.people.every((p) => p.at === 0 || dayOf(s.shift, p.at) === p.days[p.days.length - 1]),
  },

  transitions: {
    "a check-in adds today to the actor's days and touches no one else": (p, n, a, m) => {
      if (a.t !== "check" || p === n) return true;
      const today = dayOf(p.shift, m.time);
      const before = personOf(p, m.user)?.days ?? [];
      const after = personOf(n, m.user);
      return !!after && after.days[after.days.length - 1] === today && after.days.length === Math.min(MAX_DAYS, before.length + 1) && !before.includes(today) && after.at === m.time && othersSame(p, n, m.user);
    },
    "a check-in from someone not yet in today always lands": (p, n, a, m, ctx) => {
      if (a.t !== "check" || !inChat(ctx, m.user)) return true;
      const days = personOf(p, m.user)?.days ?? [];
      return (days[days.length - 1] ?? -Infinity) >= dayOf(p.shift, m.time) || p !== n;
    },
    "an undo takes back only today's check-in, only the actor's": (p, n, a, m) => {
      if (a.t !== "undo" || p === n) return true;
      const before = personOf(p, m.user)?.days ?? [];
      const after = personOf(n, m.user)?.days ?? [];
      return before[before.length - 1] === dayOf(p.shift, m.time) && after.join() === before.slice(0, -1).join() && othersSame(p, n, m.user);
    },
    "an undo of today's own check-in always lands": (p, n, a, m, ctx) => {
      if (a.t !== "undo" || !inChat(ctx, m.user)) return true;
      const days = personOf(p, m.user)?.days ?? [];
      return days[days.length - 1] !== dayOf(p.shift, m.time) || p !== n;
    },
    "anything but a check-in or an undo changes nothing": (p, n, a) => a.t === "check" || a.t === "undo" || p === n,
    "the board's setup never changes": (p, n) => p.title === n.title && p.stake === n.stake && p.shift === n.shift,
    "only people in the chat change the board": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const me = personOf(s, user);
    if (me && me.at > 0 && r.next() < 0.2) return { t: "undo" };
    return { t: "check" };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    // Today from the server-aligned clock; the view re-renders on every log update, so peek is enough.
    const today = Math.max(dayOf(state.shift, clock.peek()), ...state.people.map((p) => p.days[p.days.length - 1]!));
    const monday = mondayOf(today);
    const name = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const daysOf = (u: string) => personOf(state, u)?.days ?? [];
    const rows = members
      .map((m) => ({ id: m.id, days: daysOf(m.id), cur: current(daysOf(m.id), today), week: weekCount(daysOf(m.id), today) }))
      .sort((a, b) => b.cur - a.cur || b.week - a.week || (a.id === me ? -1 : b.id === me ? 1 : 0));
    const mine = daysOf(me);
    const inToday = mine[mine.length - 1] === today;
    const myCur = current(mine, today);
    const fewest = Math.min(...rows.map((r) => r.week));
    const behind = rows.filter((r) => r.week === fewest).map((r) => r.id);
    // Up to six rows; past that the top five, with my own row kept in view.
    const top = rows.slice(0, 5);
    const shown = rows.length <= 6 ? rows : top.some((r) => r.id === me) ? top : [...top.slice(0, 4), ...rows.filter((r) => r.id === me)];
    const narrow = theme.width < 360;
    const cell = narrow ? 22 : 24;
    const flame = theme.color.series5;

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${rows.filter((r) => r.days[r.days.length - 1] === today).length} of ${members.length} in today${best(mine) ? ` · your best ${best(mine)}` : ""}`} />
        {state.stake ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: theme.radius.button, background: theme.color.input, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: "16px" }}>{state.stake}</div>
              <small>{behind.length === members.length ? "Everyone is even so far" : `Fewest so far: ${behind.length > 2 ? `${behind.length} people` : behind.map((u) => name(u)).join(" and ")} · ${fewest} ${fewest === 1 ? "day" : "days"}`}</small>
            </div>
            {behind.length < members.length ? <Facepile users={behind} max={3} size={24} /> : null}
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 4 }}>
          <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 4 }}>
              {LETTERS.map((l, i) => (
                <small key={i} style={{ width: cell, textAlign: "center", fontWeight: monday + i === today ? 700 : 400, color: monday + i === today ? theme.color.text : theme.color.secondaryText }}>
                  {l}
                </small>
              ))}
            </div>
            <div style={{ width: 40 }} />
          </div>
          {shown.map((r) => {
            const p = personOf(state, r.id);
            const e = p && p.days[p.days.length - 1] === today ? running(p.at, FILL_MS) : null;
            return (
              <div key={r.id} role="group" aria-label={`${name(r.id)}: ${r.week} this week, ${r.cur} in a row`} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 30 }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar user={r.id} size={26} />
                  {narrow ? null : <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: r.id === me ? 600 : 400 }}>{name(r.id)}</span>}
                </div>
                <div aria-hidden="true" style={{ display: "flex", gap: 4 }}>
                  {LETTERS.map((_, i) => {
                    const d = monday + i;
                    const on = r.days.includes(d);
                    const k = on && d === today && e !== null ? pop(e) : 1;
                    return (
                      <div
                        key={i}
                        style={{
                          width: cell,
                          height: cell,
                          borderRadius: 999,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: d > today ? "transparent" : theme.color.input,
                          boxShadow: d === today ? `inset 0 0 0 2px ${on ? flame : theme.color.divider}` : d > today ? `inset 0 0 0 1px ${theme.color.divider}` : "none",
                        }}
                      >
                        {on ? <div style={{ width: cell - 6, height: cell - 6, borderRadius: 999, background: flame, transform: `scale(${k})` }} /> : null}
                      </div>
                    );
                  })}
                </div>
                <div style={{ width: 40, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2, fontWeight: 600, color: r.cur ? theme.color.text : theme.color.secondaryText }}>
                  <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
                    <path d="M6 0C6.6 2.6 10.5 4.6 10.5 8.6A4.5 4.5 0 0 1 1.5 8.6C1.5 6.4 2.8 5 3.9 4c.1 1.4.8 2.3 1.7 2.6C5.3 4.6 5.2 2.2 6 0Z" fill={r.cur ? flame : theme.color.divider} />
                  </svg>
                  {r.cur}
                </div>
              </div>
            );
          })}
          {rows.length > shown.length ? <small>{`${rows.length - shown.length} more`}</small> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, display: "flex" }}>
            <Button kind="primary" wide disabled={inToday} onClick={() => dispatch({ t: "check" })}>
              {inToday ? (myCur > 1 ? `Day ${myCur} done` : "Checked in") : "Check in"}
            </Button>
          </div>
          {inToday && personOf(state, me)!.at > 0 ? <Button onClick={() => dispatch({ t: "undo" })}>Undo</Button> : null}
        </div>
      </div>
    );
  },
});
