import { defineApp, Avatar, Button, CardHeader, SystemLine } from "@muse/app";

// Sleeping spots at the cabin. Tap an open spot to take it, tap yours to give it up.
// First claim in the log wins. One spot per person.

const C = {
  title: "Who sleeps where?",
  note: "leaving Friday at 4",
  spots: ["Queen bed 1", "Queen bed 2", "Bunk bed 1", "Bunk bed 2", "Pull-out couch", "Couch by the heater"],
};

type Spot = { id: string; label: string; holder: string | null };
type State = { spots: Spot[] };
type Action = { t: "claim"; spot: string } | { t: "release"; spot: string };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const hasSpot = (s: State, user: string) => s.spots.some((x) => x.holder === user);
const taken = (s: State) => s.spots.filter((x) => x.holder !== null).length;
const changedAt = (p: State, n: State) =>
  p.spots.map((x, i) => (n.spots[i] !== undefined && x.holder !== n.spots[i]!.holder ? i : -1)).filter((i) => i >= 0);

export default defineApp<State, Action, Local>({
  name: "Sleeping spots",
  summary: (s) => `${C.title} ${taken(s)} of ${s.spots.length} spots taken.`,

  init: () => ({ spots: C.spots.map((label, i) => ({ id: `s${i}`, label, holder: null })) }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "claim") {
      if (typeof action.spot !== "string") return state;
      const spot = state.spots.find((x) => x.id === action.spot);
      if (!spot || spot.holder !== null || hasSpot(state, meta.user)) return state;
      return { ...state, spots: state.spots.map((x) => (x.id === spot.id ? { ...x, holder: meta.user } : x)) };
    }
    if (action.t === "release") {
      if (typeof action.spot !== "string") return state;
      const spot = state.spots.find((x) => x.id === action.spot);
      if (!spot || spot.holder !== meta.user) return state;
      return { ...state, spots: state.spots.map((x) => (x.id === spot.id ? { ...x, holder: null } : x)) };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.spots.every((x) => x.holder === null || inChat(ctx, x.holder))) return state;
    return { ...state, spots: state.spots.map((x) => (x.holder !== null && !inChat(ctx, x.holder) ? { ...x, holder: null } : x)) };
  },

  invariants: {
    "no one holds more than one spot": (s) => {
      const hs = s.spots.map((x) => x.holder).filter((h) => h !== null);
      return new Set(hs).size === hs.length;
    },
    "every holder is in the chat": (s, ctx) => s.spots.every((x) => x.holder === null || inChat(ctx, x.holder)),
    "the spots are the six from the chat, with unique ids": (s) =>
      s.spots.length === C.spots.length &&
      s.spots.every((x, i) => x.id === `s${i}` && x.label === C.spots[i]) &&
      new Set(s.spots.map((x) => x.id)).size === s.spots.length,
    "held spots never exceed the spots or the people": (s, ctx) => taken(s) <= s.spots.length && taken(s) <= ctx.members.length,
  },

  transitions: {
    "a claim fills the named open spot with the actor and changes no other spot": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const ch = changedAt(p, n);
      if (p.spots.length !== n.spots.length || ch.length !== 1) return false;
      const i = ch[0]!;
      return p.spots[i]!.id === a.spot && p.spots[i]!.holder === null && n.spots[i]!.holder === m.user && !hasSpot(p, m.user);
    },
    "a release empties the named spot, and only the holder can do it": (p, n, a, m) => {
      if (a.t !== "release" || p === n) return true;
      const ch = changedAt(p, n);
      if (p.spots.length !== n.spots.length || ch.length !== 1) return false;
      const i = ch[0]!;
      return p.spots[i]!.id === a.spot && p.spots[i]!.holder === m.user && n.spots[i]!.holder === null;
    },
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "labels and ids never change": (p, n) =>
      p.spots.length === n.spots.length && p.spots.every((x, i) => x.id === n.spots[i]!.id && x.label === n.spots[i]!.label),
  },

  arbitrary: (s, user, r) => {
    const mine = s.spots.find((x) => x.holder === user);
    if (mine && r.next() < 0.35) return { t: "release", spot: mine.id };
    const open = s.spots.filter((x) => x.holder === null);
    if (open.length && r.next() < 0.8) return { t: "claim", spot: r.pick(open).id };
    return { t: "claim", spot: r.pick(s.spots).id };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const mineHeld = hasSpot(state, me);
    const unseated = members.filter((m) => !hasSpot(state, m.id));
    const names = unseated.slice(0, 4).map((m) => (m.id === me ? "you" : m.name)).join(", ");
    const more = unseated.length > 4 ? ` and ${unseated.length - 4} more` : "";
    return (
      <div>
        <CardHeader title={C.title} subtitle={`${taken(state)} of ${state.spots.length} spots taken · ${C.note}`} />
        <div style={{ display: "grid", gap: 2 }}>
          {state.spots.map((x) => {
            const holder = x.holder === null ? null : members.find((m) => m.id === x.holder);
            const mine = x.holder === me;
            return (
              <div
                key={x.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  minHeight: 44,
                  padding: "0 8px",
                  borderRadius: theme.radius.button,
                  background: mine ? theme.color.selected : "transparent",
                  color: theme.color.text,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>{x.label}</div>
                {mine ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "release", spot: x.id })}>
                    Leave
                  </Button>
                ) : holder ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: 130 }}>
                    <Avatar user={holder} size={24} />
                    <small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{holder.name}</small>
                  </div>
                ) : mineHeld ? (
                  <small>Open</small>
                ) : (
                  <Button kind="secondary" onClick={() => dispatch({ t: "claim", spot: x.id })}>
                    Take
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ minHeight: 24, marginTop: 8 }}>
          {unseated.length ? <SystemLine>{`No spot yet: ${names}${more}`}</SystemLine> : <SystemLine>Everyone has a spot</SystemLine>}
        </div>
      </div>
    );
  },
});
