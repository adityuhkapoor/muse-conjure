import { defineApp, Avatar, Button, CardHeader } from "@muse/app";

// Headcount for an event: everyone sets going, maybe or no, and how many guests they bring.
// Only people going count, each with their guests.

type Status = "going" | "maybe" | "no";

// Chat content: what people already said.
const C = {
  title: "Who's coming to Diwali at Dev's?",
  when: "Sat the 14th · 7 PM",
  maxGuests: 5,
  start: [
    { name: "Dev", status: "going" as Status, guests: 0 },
    { name: "Rohan", status: "going" as Status, guests: 2 },
    { name: "Kofi", status: "going" as Status, guests: 0 },
    { name: "Ana", status: "going" as Status, guests: 1 },
    { name: "Bea", status: "going" as Status, guests: 0 },
    { name: "Priya", status: "going" as Status, guests: 1 },
    { name: "Ty", status: "going" as Status, guests: 0 },
  ],
};

type Rsvp = { user: string; status: Status; guests: number };
type State = { title: string; when: string; rsvps: Rsvp[] };
type Action = { t: "rsvp"; status: Status } | { t: "guests"; count: number };
type Local = Record<string, never>;

const isStatus = (x: unknown): x is Status => x === "going" || x === "maybe" || x === "no";
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const mine = (s: State, user: string) => s.rsvps.find((r) => r.user === user);
const others = (s: State, user: string) => JSON.stringify(s.rsvps.filter((r) => r.user !== user));
const goingPeople = (s: State) => s.rsvps.filter((r) => r.status === "going").length;
const guestTotal = (s: State) => s.rsvps.reduce((n, r) => n + (r.status === "going" ? r.guests : 0), 0);
const total = (s: State) => goingPeople(s) + guestTotal(s);
const maybeCount = (s: State) => s.rsvps.filter((r) => r.status === "maybe").length;

function setStatus(s: State, user: string, status: unknown): State {
  if (!isStatus(status)) return s;
  const e = mine(s, user);
  if (e && e.status === status) return s;
  if (!e) return { ...s, rsvps: [...s.rsvps, { user, status, guests: 0 }] };
  return { ...s, rsvps: s.rsvps.map((r) => (r.user === user ? { ...r, status, guests: status === "no" ? 0 : r.guests } : r)) };
}

function setGuests(s: State, user: string, count: unknown): State {
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > C.maxGuests) return s;
  const e = mine(s, user);
  if (!e) return { ...s, rsvps: [...s.rsvps, { user, status: "going", guests: count }] };
  if (e.status === "no" || e.guests === count) return s;
  return { ...s, rsvps: s.rsvps.map((r) => (r.user === user ? { ...r, guests: count } : r)) };
}

const STATUS_LABEL: Record<Status, string> = { going: "Going", maybe: "Maybe", no: "No" };

export default defineApp<State, Action, Local>({
  name: "Headcount",
  summary: (s) => `${s.title} ${total(s)} coming · ${maybeCount(s)} maybe`,

  init: (ctx) => {
    const rsvps: Rsvp[] = [];
    for (const p of C.start) {
      const m = ctx.members.find((x) => x.name.toLowerCase() === p.name.toLowerCase());
      if (!m || rsvps.some((r) => r.user === m.id)) continue;
      rsvps.push({ user: m.id, status: p.status, guests: p.status === "no" ? 0 : p.guests });
    }
    return { title: C.title, when: C.when, rsvps };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "rsvp") return setStatus(state, meta.user, action.status);
    if (action.t === "guests") return setGuests(state, meta.user, action.count);
    return state;
  },

  onMembers: (state, ctx) => (state.rsvps.every((r) => inChat(ctx, r.user)) ? state : { ...state, rsvps: state.rsvps.filter((r) => inChat(ctx, r.user)) }),

  invariants: {
    "each person appears at most once": (s) => new Set(s.rsvps.map((r) => r.user)).size === s.rsvps.length,
    "everyone answering is in the chat": (s, ctx) => s.rsvps.every((r) => inChat(ctx, r.user)),
    "guests are whole numbers from 0 to the limit": (s) => s.rsvps.every((r) => Number.isInteger(r.guests) && r.guests >= 0 && r.guests <= C.maxGuests),
    "no one who said no has guests": (s) => s.rsvps.every((r) => r.status !== "no" || r.guests === 0),
    "the total is people going plus their guests only": (s) =>
      total(s) === s.rsvps.filter((r) => r.status === "going").reduce((n, r) => n + 1 + r.guests, 0) && s.rsvps.every((r) => isStatus(r.status)),
  },

  transitions: {
    "an rsvp sets the actor's status and keeps their guests unless it is no": (p, n, a, m) =>
      a.t !== "rsvp" ||
      p === n ||
      (mine(n, m.user)?.status === a.status && mine(n, m.user)?.guests === (a.status === "no" ? 0 : (mine(p, m.user)?.guests ?? 0))),
    "a guests action sets the actor's own guests to the count asked": (p, n, a, m) =>
      a.t !== "guests" || p === n || (mine(n, m.user)?.guests === a.count && mine(n, m.user)?.status !== "no"),
    "a guests action never changes an existing status": (p, n, a, m) => {
      if (a.t !== "guests" || p === n) return true;
      const before = mine(p, m.user);
      return !before || before.status === mine(n, m.user)?.status;
    },
    "nobody changes another person's entry": (p, n, _a, m) => p === n || others(p, m.user) === others(n, m.user),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "the title and time never change": (p, n) => p.title === n.title && p.when === n.when,
  },

  arbitrary: (s, user, r) => {
    const x = r.next();
    if (x < 0.4) return { t: "rsvp", status: r.pick<Status>(["going", "maybe", "no", "going"]) };
    if (x < 0.9) return { t: "guests", count: r.int(C.maxGuests + 1) };
    return { t: "guests", count: r.pick([-1, 6, 2]) };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const my = mine(state, me);
    const going = goingPeople(state);
    const guests = guestTotal(state);
    const t = total(state);
    const maybe = maybeCount(state);
    const shown = state.rsvps.filter((r) => r.user !== me && members.some((m) => m.id === r.user));
    const rows = shown.slice(0, 6);
    const noReply = members.filter((m) => m.id !== me && !state.rsvps.some((r) => r.user === m.id));
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const myGuests = my ? my.guests : 0;
    const canStep = !my || my.status !== "no";
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${t} coming · ${maybe} maybe`} />
        <div style={{ marginTop: 4 }}>
          <h2 style={{ margin: 0 }}>{t === 1 ? "1 person" : `${t} people`}</h2>
          <small>{`${going} going + ${guests} ${guests === 1 ? "guest" : "guests"} · ${state.when}`}</small>
        </div>
        <div style={{ display: "grid", gap: 2, marginTop: 8 }}>
          {rows.map((r) => (
            <div key={r.user} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}>
              <Avatar user={r.user} size={24} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(r.user)}</span>
              <small>{STATUS_LABEL[r.status]}</small>
              {r.guests > 0 ? <small>{`+${r.guests}`}</small> : null}
            </div>
          ))}
          {shown.length > rows.length ? <small>{`and ${shown.length - rows.length} more`}</small> : null}
          {noReply.length ? (
            <small>{`No reply: ${noReply.slice(0, 3).map((m) => m.name).join(", ")}${noReply.length > 3 ? ` and ${noReply.length - 3} more` : ""}`}</small>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {(["going", "maybe", "no"] as Status[]).map((k) => (
            <div key={k} style={{ flex: 1, display: "flex" }}>
              <Button kind={my?.status === k || (!my && k === "going") ? "primary" : "secondary"} wide onClick={() => dispatch({ t: "rsvp", status: k })}>
                {STATUS_LABEL[k]}
              </Button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <small style={{ flex: 1 }}>Your guests</small>
          <Button kind="secondary" aria-label="Fewer guests" disabled={!canStep || myGuests <= 0} onClick={() => dispatch({ t: "guests", count: myGuests - 1 })}>
            −
          </Button>
          <span style={{ minWidth: 20, textAlign: "center" }}>{myGuests}</span>
          <Button kind="secondary" aria-label="More guests" disabled={!canStep || myGuests >= C.maxGuests} onClick={() => dispatch({ t: "guests", count: myGuests + 1 })}>
            +
          </Button>
        </div>
      </div>
    );
  },
});
