import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine, running, spring, springs, tween } from "@muse/app";

// Sign-up grid: shifts or jobs in time order, each needing a number of people ("couch carry ·
// 9:30 · needs 3"). People sign up for as many as they like (up to an optional cap), and the gaps
// stay visible: rows still short are called out at the top. When a row gets its last person it
// fills and turns done.

type Params = {
  /** Card title: "Move-in day" or "Club fair booth" */
  title: string;
  /** Shifts or jobs from the chat, in time order, 1 to 8. need = people it takes, 1 to 6. */
  shifts: { label: string; time: string; need: number }[];
  /** Most rows one person can sign up for; 0 means no limit. */
  perPerson: number;
};

// @params
const P: Params = {
  title: "Move-in day",
  shifts: [
    { label: "Pick up the truck", time: "9:00", need: 1 },
    { label: "Couch and bed frames", time: "9:30", need: 3 },
    { label: "Boxes up the stairs", time: "10:00", need: 4 },
    { label: "Build the IKEA stuff", time: "12:00", need: 2 },
    { label: "Return the truck", time: "3:00", need: 1 },
  ],
  perPerson: 0,
};
// @end params

/** fullAt: when the last needed person signed up (server ms), 0 while it still needs people. */
type Shift = { id: string; label: string; time: string; need: number; people: string[]; fullAt: number };
type State = { title: string; perPerson: number; shifts: Shift[] };
type Action = { t: "join"; shift: string } | { t: "drop"; shift: string };
type Local = { all: boolean };
type Ctx = { members: { id: string }[] };

const MAX_SHIFTS = 8;
const MAX_NEED = 6;
const FILL_MS = 900;
const sweep = tween({ duration: 500, easing: "decelerate" });
const pop = spring(springs.iosBouncy);

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);

// ---- Checks. ----
const rowOf = (s: State, id: string) => s.shifts.find((x) => x.id === id);
const restText = (s: State, id: string) => s.shifts.filter((x) => x.id !== id).map((x) => JSON.stringify(x)).join("|");
const loadOf = (s: State, u: string) => s.shifts.filter((x) => x.people.includes(u)).length;

// ---- Reducer. ----
function join(s: State, user: string, id: unknown, time: number): State {
  const row = s.shifts.find((x) => x.id === id);
  if (!row || row.people.includes(user) || row.people.length >= row.need) return s;
  if (s.perPerson > 0 && s.shifts.filter((x) => x.people.includes(user)).length >= s.perPerson) return s;
  const people = [...row.people, user];
  return { ...s, shifts: s.shifts.map((x) => (x.id === row.id ? { ...x, people, fullAt: people.length === x.need ? time : 0 } : x)) };
}

function drop(s: State, user: string, id: unknown): State {
  const row = s.shifts.find((x) => x.id === id);
  if (!row || !row.people.includes(user)) return s;
  return { ...s, shifts: s.shifts.map((x) => (x.id === row.id ? { ...x, people: x.people.filter((u) => u !== user), fullAt: 0 } : x)) };
}

export default defineApp<State, Action, Local>({
  name: "Sign-up grid",
  summary: (s) => {
    const short = s.shifts.filter((x) => x.people.length < x.need);
    const open = short.reduce((n, x) => n + x.need - x.people.length, 0);
    return short.length ? `${s.title}: ${open} spots open across ${short.length} of ${s.shifts.length}.` : `${s.title}: every shift is covered.`;
  },

  init: () => {
    const shifts: Shift[] = P.shifts
      .filter((x) => x.label.trim())
      .slice(0, MAX_SHIFTS)
      .map((x, i) => ({
        id: `s${i}`,
        label: x.label.trim().replace(/\s+/g, " ").slice(0, 36),
        time: x.time.trim().slice(0, 12),
        need: Math.max(1, Math.min(MAX_NEED, Math.floor(x.need) || 1)),
        people: [],
        fullAt: 0,
      }));
    const perPerson = Number.isInteger(P.perPerson) && P.perPerson > 0 ? Math.min(P.perPerson, MAX_SHIFTS) : 0;
    return { title: P.title.trim().slice(0, 60) || "Sign-ups", perPerson, shifts };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "join") return join(state, meta.user, action.shift, meta.time);
    if (action.t === "drop") return drop(state, meta.user, action.shift);
    return state;
  },

  // Someone left: they come off every row, and a row they filled opens up again.
  // Someone joined: every open spot is theirs to take.
  onMembers: (state, ctx) => {
    if (state.shifts.every((x) => x.people.every((u) => inChat(ctx, u)))) return state;
    return {
      ...state,
      shifts: state.shifts.map((x) => {
        const people = x.people.filter((u) => inChat(ctx, u));
        return people.length === x.people.length ? x : { ...x, people, fullAt: 0 };
      }),
    };
  },

  invariants: {
    "no row has more people than it needs": (s) => s.shifts.every((x) => x.people.length <= x.need && x.need >= 1 && x.need <= MAX_NEED),
    "a person is on a row once": (s) => s.shifts.every((x) => new Set(x.people).size === x.people.length),
    "everyone signed up is in the chat": (s, ctx) => s.shifts.every((x) => x.people.every((u) => inChat(ctx, u))),
    "a row is marked full exactly when it is full": (s) => s.shifts.every((x) => (x.fullAt !== 0) === (x.people.length === x.need)),
    "nobody is over the per-person cap": (s, ctx) => s.perPerson === 0 || ctx.members.every((m) => loadOf(s, m.id) <= s.perPerson),
  },

  transitions: {
    "a join adds the actor to the end of one row and touches no other row": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const b = rowOf(p, a.shift), c = rowOf(n, a.shift);
      return !!b && !!c && c.people.join() === [...b.people, m.user].join() && restText(p, a.shift) === restText(n, a.shift) && (c.people.length === c.need ? c.fullAt === m.time : c.fullAt === 0);
    },
    "a drop takes only the actor off one row and opens it": (p, n, a, m) => {
      if (a.t !== "drop" || p === n) return true;
      const b = rowOf(p, a.shift), c = rowOf(n, a.shift);
      return !!b && !!c && c.people.join() === b.people.filter((u) => u !== m.user).join() && b.people.includes(m.user) && c.fullAt === 0 && restText(p, a.shift) === restText(n, a.shift);
    },
    "a join that fits always lands": (p, n, a, m, ctx) => {
      if (a.t !== "join" || !inChat(ctx, m.user)) return true;
      const b = rowOf(p, a.shift);
      if (!b || b.people.includes(m.user) || b.people.length >= b.need || (p.perPerson > 0 && loadOf(p, m.user) >= p.perPerson)) return true;
      return !!rowOf(n, a.shift)?.people.includes(m.user);
    },
    "the rows themselves never change": (p, n) => p.title === n.title && p.perPerson === n.perPerson && p.shifts.map((x) => x.id + x.label + x.time + x.need).join() === n.shifts.map((x) => x.id + x.label + x.time + x.need).join(),
    "only people in the chat sign up": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (!s.shifts.length) return null;
    const mine = s.shifts.filter((x) => x.people.includes(user));
    if (mine.length && r.next() < 0.25) return { t: "drop", shift: r.pick(mine).id };
    const open = s.shifts.filter((x) => x.people.length < x.need && !x.people.includes(user));
    return { t: "join", shift: (open.length && r.next() < 0.8 ? r.pick(open) : r.pick(s.shifts)).id };
  },

  local: { all: false },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const short = state.shifts.filter((x) => x.people.length < x.need);
    const openSpots = short.reduce((n, x) => n + x.need - x.people.length, 0);
    const helpers = members.filter((m) => state.shifts.some((x) => x.people.includes(m.id))).map((m) => m.id);
    const mineCount = state.shifts.filter((x) => x.people.includes(me)).length;
    const capped = state.perPerson > 0 && mineCount >= state.perPerson;
    const LIMIT = theme.width < 360 ? 3 : 4;
    const rows = local.all ? state.shifts : state.shifts.slice(0, LIMIT);
    return (
      <div>
        <CardHeader title={state.title} subtitle={state.perPerson ? `Up to ${state.perPerson} each · you have ${mineCount}` : `${helpers.length} of ${members.length} signed up`} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginBottom: 6, borderRadius: theme.radius.button, background: short.length ? theme.color.input : theme.color.selected, minHeight: 36 }}>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: theme.type.meta, lineHeight: "16px", color: short.length ? theme.color.text : theme.color.link }}>
            {short.length ? `${openSpots} ${openSpots === 1 ? "spot" : "spots"} open · ${short.length} short` : "Every shift is covered"}
          </div>
          {helpers.length ? <Facepile users={helpers} max={4} size={20} /> : null}
        </div>
        <div style={{ position: "relative" }}>
          <div aria-hidden="true" style={{ position: "absolute", left: 21, top: 14, bottom: 14, width: 2, background: theme.color.divider }} />
          {rows.map((x) => {
            const full = x.people.length === x.need;
            const t = full ? running(x.fullAt, FILL_MS) : null;
            const fill = full ? (t === null ? 1 : sweep(t)) : 0;
            const mine = x.people.includes(me);
            const gap = x.need - x.people.length;
            return (
              <div key={x.id} style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, minHeight: 56, padding: "4px 0" }}>
                <div style={{ width: 44, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      background: full ? theme.color.positive : theme.color.card,
                      boxShadow: full ? `0 0 0 3px ${theme.color.card}` : `inset 0 0 0 2px ${theme.color.warning}, 0 0 0 3px ${theme.color.card}`,
                      transform: `scale(${t === null ? 1 : 0.6 + 0.4 * pop(t)})`,
                    }}
                  />
                  <small style={{ fontWeight: 600, background: theme.color.card, padding: "0 2px", whiteSpace: "nowrap" }}>{x.time}</small>
                </div>
                <div style={{ flex: 1, minWidth: 0, position: "relative", borderRadius: theme.radius.button, padding: "4px 8px", overflow: "hidden" }}>
                  <div aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fill * 100}%`, background: theme.color.selected, borderRadius: theme.radius.button }} />
                  <div style={{ position: "relative", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</div>
                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4, marginTop: 2, flexWrap: "wrap" }}>
                    {x.people.map((u) => (
                      <Avatar key={u} user={u} size={20} />
                    ))}
                    {Array.from({ length: gap }, (_, i) => (
                      <span key={`o${i}`} aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 10, boxShadow: `inset 0 0 0 1.5px ${theme.color.divider}` }} />
                    ))}
                    <small style={{ marginLeft: 4, fontWeight: full ? 600 : 400, color: full ? theme.color.positive : gap === x.need ? theme.color.text : theme.color.secondaryText }}>
                      {full ? "Full" : `needs ${gap} more`}
                    </small>
                  </div>
                </div>
                <div style={{ width: 72, flex: "none", display: "flex", justifyContent: "flex-end" }}>
                  {mine ? (
                    <Button onClick={() => dispatch({ t: "drop", shift: x.id })}>Leave</Button>
                  ) : full ? null : (
                    <Button kind="deemphasized" disabled={capped} onClick={() => dispatch({ t: "join", shift: x.id })}>
                      Join
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {state.shifts.length > LIMIT ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Button kind="deemphasized" onClick={() => setLocal({ all: !local.all })}>
              {local.all ? "Show less" : `${state.shifts.length - LIMIT} more`}
            </Button>
          </div>
        ) : null}
        {!state.shifts.length ? <SystemLine>No shifts yet</SystemLine> : null}
      </div>
    );
  },
});
