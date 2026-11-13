import { defineApp, CardHeader, OptionRow, Progress, SystemLine } from "@muse/app";

// Headcount: everyone answers in, maybe or out. The cabin books at 4 people in.

const C = {
  title: "Who's in for the cabin?",
  detail: "Dec 6 weekend · about $140 each",
  min: 4,
};

type Answer = "in" | "maybe" | "out";
type State = { min: number; replies: Record<string, Answer>; lockedAt: number | null };
type Action = { t: "reply"; answer: Answer } | { t: "clear" };
type Local = Record<string, never>;

const ANSWERS: Answer[] = ["in", "maybe", "out"];
const LABELS: Record<Answer, string> = { in: "In", maybe: "Maybe", out: "Out" };
const isAnswer = (x: unknown): x is Answer => x === "in" || x === "maybe" || x === "out";
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const count = (r: Record<string, Answer>, a: Answer) => Object.keys(r).filter((k) => r[k] === a).length;
const who = (r: Record<string, Answer>, a: Answer) => Object.keys(r).filter((k) => r[k] === a);
const rest = (r: Record<string, Answer>, u: string) =>
  Object.keys(r)
    .filter((k) => k !== u)
    .sort()
    .map((k) => k + "=" + r[k])
    .join();

function settle(s: State, replies: Record<string, Answer>, time: number): State {
  const ins = count(replies, "in");
  const lockedAt = ins >= s.min ? (s.lockedAt ?? time) : null;
  return { ...s, replies, lockedAt };
}

export default defineApp<State, Action, Local>({
  name: "Headcount",
  summary: (s) => (s.lockedAt !== null ? `${C.title} Cabin books · ${count(s.replies, "in")} in.` : `${C.title} ${count(s.replies, "in")} of ${s.min} in.`),

  init: () => ({ min: C.min, replies: {}, lockedAt: null }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "reply") {
      if (!isAnswer(action.answer) || state.replies[meta.user] === action.answer) return state;
      return settle(state, { ...state.replies, [meta.user]: action.answer }, meta.time);
    }
    if (action.t === "clear") {
      if (state.replies[meta.user] === undefined) return state;
      const replies: Record<string, Answer> = {};
      for (const k of Object.keys(state.replies)) if (k !== meta.user) replies[k] = state.replies[k]!;
      return settle(state, replies, meta.time);
    }
    return state;
  },

  // Someone left: their answer goes, and the lock lifts if the ins drop below the minimum.
  onMembers: (state, ctx) => {
    const keys = Object.keys(state.replies);
    if (keys.every((k) => inChat(ctx, k))) return state;
    const replies: Record<string, Answer> = {};
    for (const k of keys) if (inChat(ctx, k)) replies[k] = state.replies[k]!;
    return { ...state, replies, lockedAt: count(replies, "in") >= state.min ? state.lockedAt : null };
  },

  invariants: {
    "every answer belongs to someone in the chat": (s, ctx) => Object.keys(s.replies).every((k) => inChat(ctx, k)),
    "every answer is in, maybe or out": (s) => Object.keys(s.replies).every((k) => isAnswer(s.replies[k])),
    "the minimum is 4": (s) => s.min === C.min,
    "locked exactly when the ins reach the minimum": (s) => (s.lockedAt !== null) === (count(s.replies, "in") >= s.min),
    "the ins never outnumber the chat": (s, ctx) => count(s.replies, "in") <= ctx.members.length,
  },

  transitions: {
    "a reply sets the actor's answer and leaves everyone else's alone": (p, n, a, m) =>
      a.t !== "reply" || p === n || (n.replies[m.user] === a.answer && rest(p.replies, m.user) === rest(n.replies, m.user)),
    "a clear removes only the actor's answer": (p, n, a, m) =>
      a.t !== "clear" || p === n || (p.replies[m.user] !== undefined && n.replies[m.user] === undefined && rest(p.replies, m.user) === rest(n.replies, m.user)),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the minimum never changes": (p, n) => p.min === n.min,
    "the lock time is set when the minimum is reached and then kept": (p, n, a, m) => {
      if (p.lockedAt !== null && n.lockedAt !== null) return p.lockedAt === n.lockedAt;
      if (p.lockedAt === null && n.lockedAt !== null) return count(n.replies, "in") >= n.min && n.lockedAt === m.time;
      return true;
    },
  },

  arbitrary: (s, user, r) => {
    if (s.replies[user] !== undefined && r.next() < 0.15) return { t: "clear" };
    return { t: "reply", answer: r.pick(ANSWERS) };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const ins = count(state.replies, "in");
    const left = Math.max(0, state.min - ins);
    const mine = state.replies[me] ?? null;
    const waiting = members.filter((m) => state.replies[m.id] === undefined);
    const locked = state.lockedAt !== null;
    return (
      <div>
        <CardHeader title={C.title} subtitle={locked ? `Cabin books · ${ins} in` : `${ins} of ${state.min} needed · ${left} more to book`} />
        <Progress value={Math.min(ins, state.min)} max={state.min} label={`${ins} of ${state.min} in`} />
        <div style={{ display: "grid", gap: 2, marginTop: 8 }}>
          {ANSWERS.map((k) => (
            <OptionRow
              key={k}
              label={LABELS[k]}
              count={count(state.replies, k)}
              total={Math.max(1, members.length)}
              voters={who(state.replies, k)}
              selected={mine === k}
              onClick={() => {
                if (mine === k) dispatch({ t: "clear" });
                else dispatch({ t: "reply", answer: k });
              }}
            />
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <small>{C.detail}</small>
        </div>
        <div style={{ minHeight: 24, marginTop: 4 }}>
          {locked ? (
            <SystemLine>Enough to book</SystemLine>
          ) : waiting.length ? (
            <SystemLine>{`Waiting on ${waiting.map((m) => m.name).slice(0, 3).join(", ")}${waiting.length > 3 ? ` and ${waiting.length - 3} more` : ""}`}</SystemLine>
          ) : null}
        </div>
      </div>
    );
  },
});
