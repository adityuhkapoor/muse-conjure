import { defineApp, Avatar, Button, CardHeader, SystemLine } from "@muse/app";

const CHAT = {
  title: "Chores before Sunday's inspection",
  chores: [
    "Trash + recycling",
    "Dishes",
    "Bathroom",
    "Vacuum living room",
    "Mop whole kitchen",
    "Costco run",
    "Fridge cleanout",
    "Towels laundry",
  ],
};

type Chore = { id: string; label: string; owner: string | null; done: boolean };
type State = { title: string; chores: Chore[] };
type Action = { t: "claim"; chore: string } | { t: "release"; chore: string } | { t: "done"; chore: string };
type Local = Record<string, never>;
type Ctx = { members: { id: string }[] };

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ownedBy = (s: State, user: string) => s.chores.filter((c) => c.owner === user).length;
const js = (c: Chore | undefined) => JSON.stringify(c ?? null);

/** Every chore other than `id` is unchanged, or (if allowed) was the actor's and is now released. */
const othersOk = (p: State, n: State, id: string, user: string, allowRelease: boolean) =>
  p.chores.length === n.chores.length &&
  p.chores.every((c, i) => {
    if (c.id === id) return true;
    const d = n.chores[i];
    if (!d) return false;
    if (js(c) === js(d)) return true;
    return allowRelease && c.owner === user && d.id === c.id && d.label === c.label && d.owner === null && d.done === false;
  });

export default defineApp<State, Action, Local>({
  name: "Chore board",
  summary: (s) => {
    const claimed = s.chores.filter((c) => c.owner !== null).length;
    const done = s.chores.filter((c) => c.done).length;
    return `${s.title}: ${claimed} of ${s.chores.length} claimed · ${done} done`;
  },

  init: () => ({
    title: CHAT.title,
    chores: CHAT.chores.map((label, i) => ({ id: `c${i}`, label, owner: null, done: false })),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    const user = meta.user;
    if (action.t === "claim") {
      if (typeof action.chore !== "string") return state;
      const chore = state.chores.find((c) => c.id === action.chore);
      if (!chore || chore.owner !== null) return state;
      return {
        ...state,
        chores: state.chores.map((c) =>
          c.id === chore.id ? { ...c, owner: user, done: false } : c.owner === user ? { ...c, owner: null, done: false } : c,
        ),
      };
    }
    if (action.t === "release") {
      if (typeof action.chore !== "string") return state;
      const chore = state.chores.find((c) => c.id === action.chore);
      if (!chore || chore.owner !== user) return state;
      return { ...state, chores: state.chores.map((c) => (c.id === chore.id ? { ...c, owner: null, done: false } : c)) };
    }
    if (action.t === "done") {
      if (typeof action.chore !== "string") return state;
      const chore = state.chores.find((c) => c.id === action.chore);
      if (!chore || chore.owner !== user) return state;
      return { ...state, chores: state.chores.map((c) => (c.id === chore.id ? { ...c, done: !c.done } : c)) };
    }
    return state;
  },

  // Someone left: their chore opens up again and is no longer marked done.
  onMembers: (state, ctx) => {
    if (state.chores.every((c) => c.owner === null || inChat(ctx, c.owner))) return state;
    return {
      ...state,
      chores: state.chores.map((c) => (c.owner !== null && !inChat(ctx, c.owner) ? { ...c, owner: null, done: false } : c)),
    };
  },

  invariants: {
    "each person owns at most one chore": (s) => {
      const owners = s.chores.filter((c) => c.owner !== null).map((c) => c.owner);
      return new Set(owners).size === owners.length;
    },
    "chore owners are in the chat": (s, ctx) => s.chores.every((c) => c.owner === null || inChat(ctx, c.owner)),
    "a chore with no owner is not done": (s) => s.chores.every((c) => c.owner !== null || !c.done),
    "the chores are always the same eight, in order": (s) =>
      s.chores.length === CHAT.chores.length &&
      s.chores.every((c, i) => c.id === `c${i}` && c.label === CHAT.chores[i]),
  },

  transitions: {
    "a claim gives the open chore to the actor and frees only the actor's other chore": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const before = p.chores.find((c) => c.id === a.chore);
      const after = n.chores.find((c) => c.id === a.chore);
      return !!before && !!after && before.owner === null && after.owner === m.user && after.done === false && othersOk(p, n, before.id, m.user, true);
    },
    "a release clears the owner and done on the actor's own chore only": (p, n, a, m) => {
      if (a.t !== "release" || p === n) return true;
      const before = p.chores.find((c) => c.id === a.chore);
      const after = n.chores.find((c) => c.id === a.chore);
      return !!before && !!after && before.owner === m.user && after.owner === null && after.done === false && othersOk(p, n, before.id, m.user, false);
    },
    "done flips only the done mark of the actor's own chore": (p, n, a, m) => {
      if (a.t !== "done" || p === n) return true;
      const before = p.chores.find((c) => c.id === a.chore);
      const after = n.chores.find((c) => c.id === a.chore);
      return !!before && !!after && before.owner === m.user && after.owner === m.user && after.done !== before.done && othersOk(p, n, before.id, m.user, false);
    },
    "a taken chore is never handed to someone else": (p, n, a, m) =>
      a.t !== "claim" || p === n || p.chores.every((c, i) => c.owner === null || n.chores[i]?.owner === c.owner || (c.owner === m.user && n.chores[i]?.owner === null)),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const mine = s.chores.find((c) => c.owner === user);
    const k = r.next();
    if (mine && k < 0.3) return { t: "done", chore: mine.id };
    if (mine && k < 0.4) return { t: "release", chore: mine.id };
    const open = s.chores.filter((c) => c.owner === null);
    if (open.length && k < 0.9) return { t: "claim", chore: r.pick(open).id };
    return { t: r.pick(["claim", "done", "release"] as const), chore: r.pick(s.chores).id };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const claimed = state.chores.filter((c) => c.owner !== null).length;
    const done = state.chores.filter((c) => c.done).length;
    const mine = state.chores.find((c) => c.owner === me);
    const waiting = members.filter((m) => ownedBy(state, m.id) === 0);
    const waitingText =
      waiting
        .slice(0, 4)
        .map((m) => (m.id === me ? "you" : m.name))
        .join(", ") + (waiting.length > 4 ? ` +${waiting.length - 4}` : "");
    const clip = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 } as const;
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${claimed} of ${state.chores.length} claimed · ${done} done`} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            minHeight: 52,
            borderRadius: theme.radius.card,
            background: mine ? theme.color.selected : theme.color.input,
            color: theme.color.text,
            marginBottom: 8,
          }}
        >
          <div style={{ flex: 1, ...clip }}>
            <div style={{ fontWeight: 600, ...clip }}>{mine ? mine.label : "You have no chore"}</div>
            <small>{mine ? (mine.done ? "Marked done" : "Yours this week") : "Tap an open chore"}</small>
          </div>
          {mine ? (
            <div style={{ display: "flex", gap: 6, flex: "none" }}>
              <Button kind="primary" onClick={() => dispatch({ t: "done", chore: mine.id })}>
                {mine.done ? "Undo" : "Done"}
              </Button>
              <Button kind="deemphasized" onClick={() => dispatch({ t: "release", chore: mine.id })}>
                Release
              </Button>
            </div>
          ) : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {state.chores.map((c) => {
            const cellStyle = {
              minHeight: 52,
              minWidth: 0,
              padding: "6px 10px",
              borderRadius: theme.radius.button,
              textAlign: "left",
              color: theme.color.text,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 2,
            } as const;
            const label = <span style={{ fontWeight: 600, ...clip }}>{c.label}</span>;
            if (c.owner === null) {
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-label={`Take ${c.label}`}
                  onClick={() => dispatch({ t: "claim", chore: c.id })}
                  style={{ ...cellStyle, background: theme.color.input, boxShadow: `inset 0 0 0 1px ${theme.color.divider}` }}
                >
                  {label}
                  <small style={clip}>Open</small>
                </button>
              );
            }
            return (
              <div
                key={c.id}
                style={{
                  ...cellStyle,
                  background: c.owner === me ? theme.color.selected : theme.color.card,
                  boxShadow: `inset 0 0 0 1px ${theme.color.divider}`,
                }}
              >
                {label}
                <span style={{ display: "flex", alignItems: "center", gap: 4, ...clip }}>
                  <Avatar user={c.owner} size={16} />
                  <small style={clip}>{c.done ? `${nameOf(c.owner)} · done` : nameOf(c.owner)}</small>
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ minHeight: 24, marginTop: 8 }}>
          <SystemLine>{waiting.length ? `No chore yet: ${waitingText}` : "Everyone has a chore"}</SystemLine>
        </div>
      </div>
    );
  },
});
