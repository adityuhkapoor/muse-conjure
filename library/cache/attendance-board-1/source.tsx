import { defineApp, Avatar, Button, CardHeader } from "@muse/app";

// Who earns a Friendsgiving seat: attendance per event, ranked by events attended.

const CHAT = {
  title: "Who earns a Friendsgiving seat?",
  events: [
    { name: "Trivia Thursday", went: ["Noor", "Abby", "Omar", "Rhea", "Lena", "Mina"] },
    { name: "Halloween party", went: ["Abby", "Nora", "Noor", "Owen", "Lena", "Rhea"] },
    { name: "Pumpkin patch", went: ["Owen", "Nora", "Mina", "Abby", "Lena", "Omar"] },
    { name: "Movie night", went: ["Abby", "Lena", "Noor", "Omar", "Nora", "Rhea"] },
  ],
  minEvents: 1,
  seats: 0,
};

type Ev = { id: string; name: string; went: string[] };
type State = { title: string; events: Ev[]; seats: number; minEvents: number };
type Action =
  | { t: "toggle"; event: string; person: string }
  | { t: "setSeats"; n: number }
  | { t: "setMin"; n: number };
type Local = { panel: string };
type Ctx = { members: { id: string; name: string }[] };

const MAX_SEATS = 20;
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const countOf = (s: State, id: string) => s.events.filter((e) => e.went.includes(id)).length;
const strip = (xs: string[], id: string) => xs.filter((x) => x !== id).join();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function ranked(s: State, members: { id: string; name: string }[]) {
  const rows = members.map((m) => ({ m, n: countOf(s, m.id) }));
  rows.sort((a, b) => (b.n !== a.n ? b.n - a.n : a.m.name < b.m.name ? -1 : a.m.name > b.m.name ? 1 : 0));
  let given = 0;
  return rows.map((r) => {
    const ok = r.n >= s.minEvents;
    const seat = ok && (s.seats === 0 || given < s.seats);
    if (seat) given += 1;
    return { ...r, ok, seat };
  });
}

export default defineApp<State, Action, Local>({
  name: "Seat ranking",
  summary: (s, ctx) => {
    const q = ctx.members.filter((m) => countOf(s, m.id) >= s.minEvents).length;
    return `${s.title} ${q} of ${ctx.members.length} qualify.`;
  },

  init: (ctx) => {
    const events: Ev[] = CHAT.events.slice(0, 4).map((e, i) => {
      const ids = e.went
        .map((name) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id)
        .filter((x): x is string => x !== undefined);
      return { id: `e${i}`, name: e.name, went: ids.filter((x, j) => ids.indexOf(x) === j) };
    });
    return { title: CHAT.title, events, seats: CHAT.seats, minEvents: Math.max(1, Math.min(events.length, CHAT.minEvents)) };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "toggle") {
      if (typeof action.event !== "string" || typeof action.person !== "string") return state;
      const id = action.event;
      const who = action.person;
      if (!inChat(ctx, who) || !state.events.some((e) => e.id === id)) return state;
      return {
        ...state,
        events: state.events.map((e) =>
          e.id !== id ? e : { ...e, went: e.went.includes(who) ? e.went.filter((x) => x !== who) : [...e.went, who] },
        ),
      };
    }
    if (action.t === "setSeats") {
      if (typeof action.n !== "number" || !Number.isInteger(action.n) || action.n < 0 || action.n > MAX_SEATS || action.n === state.seats) return state;
      return { ...state, seats: action.n };
    }
    if (action.t === "setMin") {
      if (typeof action.n !== "number" || !Number.isInteger(action.n) || action.n < 1 || action.n > state.events.length || action.n === state.minEvents) return state;
      return { ...state, minEvents: action.n };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.events.every((e) => e.went.every((x) => inChat(ctx, x)))) return state;
    return { ...state, events: state.events.map((e) => ({ ...e, went: e.went.filter((x) => inChat(ctx, x)) })) };
  },

  invariants: {
    "no one is listed twice for an event": (s) => s.events.every((e) => new Set(e.went).size === e.went.length),
    "everyone who went is in the chat": (s, ctx) => s.events.every((e) => e.went.every((x) => inChat(ctx, x))),
    "event ids are unique and there are at most 4 events": (s) => s.events.length <= 4 && new Set(s.events.map((e) => e.id)).size === s.events.length,
    "seats is a whole number from 0 to 20": (s) => Number.isInteger(s.seats) && s.seats >= 0 && s.seats <= MAX_SEATS,
    "the minimum is a whole number from 1 to the number of events": (s) => Number.isInteger(s.minEvents) && s.minEvents >= 1 && s.minEvents <= Math.max(1, s.events.length),
    "no seat goes to someone under the minimum": (s, ctx) => ranked(s, ctx.members).every((r) => !r.seat || r.n >= s.minEvents),
  },

  transitions: {
    "a toggle flips only that person on that event": (p, n, a) => {
      if (a.t !== "toggle" || p === n) return true;
      if (typeof a.event !== "string" || typeof a.person !== "string") return false;
      const pe = p.events.find((e) => e.id === a.event);
      const ne = n.events.find((e) => e.id === a.event);
      if (!pe || !ne) return false;
      return (
        pe.went.includes(a.person) !== ne.went.includes(a.person) &&
        strip(pe.went, a.person) === strip(ne.went, a.person) &&
        p.events.every((e, i) => e.id === a.event || same(e, n.events[i])) &&
        p.seats === n.seats &&
        p.minEvents === n.minEvents
      );
    },
    "setSeats changes only the seats to the number asked": (p, n, a) =>
      a.t !== "setSeats" || p === n || (n.seats === a.n && n.minEvents === p.minEvents && same(p.events, n.events)),
    "setMin changes only the minimum to the number asked": (p, n, a) =>
      a.t !== "setMin" || p === n || (n.minEvents === a.n && n.seats === p.seats && same(p.events, n.events)),
    "event ids and names never change": (p, n) => p.events.length === n.events.length && p.events.every((e, i) => e.id === n.events[i]!.id && e.name === n.events[i]!.name),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r, ctx) => {
    const x = r.next();
    if (x < 0.7 && ctx.members.length && s.events.length) {
      return { t: "toggle", event: r.pick(s.events).id, person: r.pick(ctx.members).id };
    }
    if (x < 0.8) return { t: "toggle", event: "nope", person: "nobody" };
    if (x < 0.9) return { t: "setSeats", n: r.int(MAX_SEATS + 3) };
    return { t: "setMin", n: 1 + r.int(5) };
  },

  local: { panel: "" },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const rows = ranked(state, members);
    const q = rows.filter((r) => r.ok).length;
    const total = state.events.length;
    const open = state.events.find((e) => e.id === local.panel);
    const rules = local.panel === "rules";
    const sub = `${q} of ${members.length} qualify${state.seats > 0 ? ` · ${state.seats} seats` : ""}`;

    return (
      <div>
        <CardHeader title={state.title} subtitle={rules ? "Rules" : open ? `${open.name} · ${open.went.length} went` : sub} onMore={() => setLocal({ panel: rules ? "" : "rules" })} />

        {open ? (
          <div>
            <small>Tap a name to mark who went</small>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {members.map((m) => {
                const went = open.went.includes(m.id);
                return (
                  <div key={m.id} style={{ flex: "1 1 130px", minWidth: 0, display: "flex" }}>
                    <Button wide kind={went ? "secondary" : "deemphasized"} onClick={() => dispatch({ t: "toggle", event: open.id, person: m.id })}>
                      {went ? `${m.id === me ? "You" : m.name} · went` : m.id === me ? "You" : m.name}
                    </Button>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 8 }}>
              <Button kind="primary" onClick={() => setLocal({ panel: "" })}>Done</Button>
            </div>
          </div>
        ) : rules ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600 }}>Seats</div>
              <small>{state.seats === 0 ? "No cap" : `${state.seats} seats`}</small>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Button kind="secondary" disabled={state.seats <= 0} onClick={() => dispatch({ t: "setSeats", n: state.seats - 1 })}>Fewer</Button>
                <Button kind="secondary" disabled={state.seats >= MAX_SEATS} onClick={() => dispatch({ t: "setSeats", n: state.seats + 1 })}>More</Button>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Events to qualify</div>
              <small>{`${state.minEvents} of ${total}`}</small>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Button kind="secondary" disabled={state.minEvents <= 1} onClick={() => dispatch({ t: "setMin", n: state.minEvents - 1 })}>Fewer</Button>
                <Button kind="secondary" disabled={state.minEvents >= total} onClick={() => dispatch({ t: "setMin", n: state.minEvents + 1 })}>More</Button>
              </div>
            </div>
            <div>
              <Button kind="primary" onClick={() => setLocal({ panel: "" })}>Done</Button>
            </div>
          </div>
        ) : (
          <div>
            <div>
              {rows.map((r) => (
                <div
                  key={r.m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 26,
                    padding: "0 4px",
                    borderRadius: 6,
                    background: r.m.id === me ? "var(--color-selected)" : "transparent",
                  }}
                >
                  <Avatar user={r.m} size={20} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.m.id === me ? `${r.m.name} · you` : r.m.name}</span>
                  <small>{`${r.n} of ${total}`}</small>
                  <small style={{ width: 36, textAlign: "right", fontWeight: 600 }}>{r.seat ? "Seat" : ""}</small>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {state.events.map((e) => (
                <div key={e.id} style={{ flex: "1 1 130px", minWidth: 0, display: "flex" }}>
                  <Button wide kind="deemphasized" onClick={() => setLocal({ panel: e.id })}>
                    {e.name}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
});
