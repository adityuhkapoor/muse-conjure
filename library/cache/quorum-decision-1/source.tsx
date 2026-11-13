import { defineApp, Button, CardHeader, OptionRow, Progress, SystemLine } from "@muse/app";

// Yes or no on booking the cabin. Once enough say yes, the vote locks and the booker books.

const CABIN = {
  title: "Book the cabin?",
  need: 4,
  bookerName: "Naomi",
  facts: "Tahoe · $840 · Dec 6-8 · about $120 each if all 7 go · hot tub · listing holds till Friday",
};

type State = { need: number; yes: string[]; no: string[]; booker: string; lockedAt: number | null };
type Action = { t: "vote"; choice: "yes" | "no" } | { t: "clear" };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const rest = (s: State, user: string) => `${s.yes.filter((u) => u !== user).join()}|${s.no.filter((u) => u !== user).join()}`;

function vote(s: State, user: string, choice: unknown, time: unknown): State {
  if (s.lockedAt !== null || (choice !== "yes" && choice !== "no") || typeof time !== "number") return s;
  if ((choice === "yes" ? s.yes : s.no).includes(user)) return s;
  const yes = choice === "yes" ? [...s.yes, user] : s.yes.filter((u) => u !== user);
  const no = choice === "no" ? [...s.no, user] : s.no.filter((u) => u !== user);
  return { ...s, yes, no, lockedAt: yes.length >= s.need ? time : null };
}

function clear(s: State, user: string): State {
  if (s.lockedAt !== null || (!s.yes.includes(user) && !s.no.includes(user))) return s;
  return { ...s, yes: s.yes.filter((u) => u !== user), no: s.no.filter((u) => u !== user) };
}

export default defineApp<State, Action, Local>({
  name: "Cabin vote",
  summary: (s) => (s.lockedAt !== null ? `${CABIN.title} Locked · ${s.yes.length} yes.` : `${CABIN.title} ${s.yes.length} of ${s.need} yes · ${s.no.length} no.`),

  init: (ctx) => {
    const named = ctx.members.find((m) => m.name.toLowerCase() === CABIN.bookerName.toLowerCase())?.id;
    return { need: CABIN.need, yes: [], no: [], booker: named ?? ctx.members[0]?.id ?? "", lockedAt: null };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "vote") return vote(state, meta.user, action.choice, meta.time);
    if (action.t === "clear") return clear(state, meta.user);
    return state;
  },

  onMembers: (state, ctx) => {
    const yes = state.yes.filter((u) => inChat(ctx, u));
    const no = state.no.filter((u) => inChat(ctx, u));
    const booker = state.booker !== "" && inChat(ctx, state.booker) ? state.booker : (ctx.members[0]?.id ?? "");
    if (yes.length === state.yes.length && no.length === state.no.length && booker === state.booker) return state;
    return { ...state, yes, no, booker };
  },

  invariants: {
    "no one is in both lists or twice in one": (s) =>
      new Set(s.yes).size === s.yes.length && new Set(s.no).size === s.no.length && s.yes.every((u) => !s.no.includes(u)),
    "everyone who voted is in the chat": (s, ctx) => s.yes.every((u) => inChat(ctx, u)) && s.no.every((u) => inChat(ctx, u)),
    "not locked means fewer yes than needed": (s) => s.lockedAt !== null || s.yes.length < s.need,
    "the bar is 4 and the booker is empty or in the chat": (s, ctx) => s.need === CABIN.need && (s.booker === "" || inChat(ctx, s.booker)),
  },

  transitions: {
    "a vote puts the voter on the chosen side only and leaves everyone else as they were": (p, n, a, m) =>
      a.t !== "vote" ||
      p === n ||
      ((a.choice === "yes" ? n.yes : n.no).includes(m.user) && !(a.choice === "yes" ? n.no : n.yes).includes(m.user) && rest(p, m.user) === rest(n, m.user)),
    "a clear removes only the actor from both lists": (p, n, a, m) =>
      a.t !== "clear" || p === n || (!n.yes.includes(m.user) && !n.no.includes(m.user) && rest(p, m.user) === rest(n, m.user) && (p.yes.includes(m.user) || p.no.includes(m.user))),
    "once locked, votes and clears change nothing": (p, n) => p.lockedAt === null || p === n,
    "the lock is set only by a vote that brings yes to the bar, at that time": (p, n, a, m) =>
      p.lockedAt === n.lockedAt || (a.t === "vote" && p.lockedAt === null && n.yes.length >= n.need && n.lockedAt === m.time),
    "the bar and the booker never change by an action": (p, n) => p.need === n.need && p.booker === n.booker,
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if ((s.yes.includes(user) || s.no.includes(user)) && r.next() < 0.15) return { t: "clear" };
    return { t: "vote", choice: r.pick(["yes", "no"] as const) };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const locked = state.lockedAt !== null;
    const bookerName = members.find((m) => m.id === state.booker)?.name ?? "Someone";
    const total = Math.max(1, members.length);
    const voted = state.yes.includes(me) || state.no.includes(me);
    const left = Math.max(0, state.need - state.yes.length);
    return (
      <div>
        <CardHeader title={CABIN.title} subtitle={locked ? `Locked · ${bookerName} books` : `${state.yes.length} of ${state.need} yes needed`} />
        <small style={{ display: "block", marginBottom: 8 }}>{CABIN.facts}</small>
        <div style={{ display: "grid", gap: 2 }}>
          <OptionRow
            label="Yes"
            count={state.yes.length}
            total={total}
            voters={state.yes}
            selected={state.yes.includes(me)}
            onClick={() => {
              if (!locked) dispatch({ t: "vote", choice: "yes" });
            }}
          />
          <OptionRow
            label="No"
            count={state.no.length}
            total={total}
            voters={state.no}
            selected={state.no.includes(me)}
            onClick={() => {
              if (!locked) dispatch({ t: "vote", choice: "no" });
            }}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <Progress
            value={Math.min(state.yes.length, state.need)}
            max={state.need}
            label={locked ? `Locked · ${state.yes.length} yes` : `${state.yes.length} of ${state.need} yes · ${left} more to lock`}
          />
        </div>
        <div style={{ minHeight: 24, marginTop: 8 }}>
          {locked ? <SystemLine>{`Locked · ${bookerName} books it`}</SystemLine> : <SystemLine>{`Nobody pays until ${state.need} say yes`}</SystemLine>}
        </div>
        {voted && !locked ? (
          <Button kind="deemphasized" onClick={() => dispatch({ t: "clear" })}>
            Clear vote
          </Button>
        ) : null}
      </div>
    );
  },
});
