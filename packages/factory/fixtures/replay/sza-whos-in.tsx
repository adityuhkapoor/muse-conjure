import { defineApp, Button, CardHeader, Facepile, Progress, SystemLine } from "@muse/app";

// Threshold lock: "3 of 4 in". Everyone answers going, maybe or no. When enough people are going,
// the plan locks. The lock stays, so people can count on it, and the card still shows who dropped.

type Params = {
  /** What the plan is, short: "SZA on Saturday" */
  title: string;
  /** Where and when, from the chat or the event: "Kia Forum · Sat 8 PM". Empty if unknown. */
  detail: string;
  /** How many going locks it. Use the number from the chat ("need 4"), else everyone in the chat. 0 means everyone. */
  need: number;
};

// @params
const P: Params = {
  "title": "SZA at Kia Forum",
  "detail": "Kia Forum · Sat Mar 14, 8 PM · presale Fri 10 AM · about $95 each",
  "need": 4
};
// @end params

type Answer = "going" | "maybe" | "no";
/** Set once, when enough people were going; it never lifts. `need` is the bar at that moment. */
type Lock = { going: string[]; need: number };
type State = { title: string; detail: string; need: number; going: string[]; maybe: string[]; no: string[]; lock: Lock | null };
type Action = { t: "answer"; answer: Answer };
type Local = Record<string, never>;

const ANSWERS: Answer[] = ["going", "maybe", "no"];
const LABELS: Record<Answer, string> = { going: "Going", maybe: "Maybe", no: "No" };
const isAnswer = (x: unknown): x is Answer => x === "going" || x === "maybe" || x === "no";
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const everyone = (s: State) => [...s.going, ...s.maybe, ...s.no];
/** How many going locks it: the number asked for, capped at the chat size; 0 means everyone in the chat. */
const bar = (s: State, ctx: { members: unknown[] }) => {
  const n = Math.max(1, ctx.members.length);
  return s.need > 0 ? Math.min(s.need, n) : n;
};

function answer(s: State, user: string, a: unknown, need: number): State {
  if (!isAnswer(a) || s[a].includes(user)) return s;
  const next: State = {
    ...s,
    going: s.going.filter((u) => u !== user),
    maybe: s.maybe.filter((u) => u !== user),
    no: s.no.filter((u) => u !== user),
  };
  next[a] = [...next[a], user];
  if (!next.lock && next.going.length >= need) next.lock = { going: next.going, need };
  return next;
}

export default defineApp<State, Action, Local>({
  name: "Who's in",
  summary: (s, ctx) => (s.lock ? `${s.title}: locked. ${s.going.length} going.` : `${s.title}: ${s.going.length} of ${bar(s, ctx)} in.`),

  init: () => ({ title: P.title.trim().slice(0, 60) || "Who's in", detail: P.detail.trim().slice(0, 60), need: Math.max(0, Math.floor(P.need) || 0), going: [], maybe: [], no: [], lock: null }),

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? answer(state, meta.user, action.answer, bar(state, ctx)) : state),

  // Someone left: their answer goes, and the bar can drop with the chat. Someone joined: they are
  // simply waiting; a bar of "everyone" goes up by one.
  onMembers: (state, ctx) => {
    const going = state.going.filter((u) => inChat(ctx, u));
    const next: State = { ...state, going, maybe: state.maybe.filter((u) => inChat(ctx, u)), no: state.no.filter((u) => inChat(ctx, u)) };
    return !next.lock && going.length > 0 && going.length >= bar(next, ctx) ? { ...next, lock: { going, need: bar(next, ctx) } } : next;
  },

  invariants: {
    "each person has one answer at most": (s) => new Set(everyone(s)).size === everyone(s).length,
    "not locked means fewer than needed are going": (s, ctx) => s.lock !== null || s.going.length < bar(s, ctx),
    "a lock was earned: enough were going when it happened": (s) => s.lock === null || (s.lock.going.length >= s.lock.need && s.lock.need >= 1),
    "everyone answering is in the chat": (s, ctx) => everyone(s).every((u) => inChat(ctx, u)),
  },

  transitions: {
    "an answer puts the person on that answer only": (p, n, a, m) => {
      if (a.t !== "answer" || p === n) return true;
      const where = (x: State) => ANSWERS.filter((k) => x[k].includes(m.user));
      const rest = (x: State) => everyone(x).filter((u) => u !== m.user).sort().join();
      return where(n).join() === a.answer && rest(p) === rest(n);
    },
    "repeating my answer changes nothing": (p, n, a, m) => a.t !== "answer" || !isAnswer(a.answer) || !p[a.answer].includes(m.user) || p === n,
    "the plan locks exactly when enough are going": (p, n, a, m, ctx) => {
      if (a.t !== "answer" || p === n) return true;
      return (n.lock !== null) === (p.lock !== null || n.going.length >= bar(n, ctx));
    },
    "a lock never lifts": (p, n) => p.lock === null || n.lock === p.lock,
    "the plan itself never changes": (p, n) => p.title === n.title && p.detail === n.detail && p.need === n.need,
    "only people in the chat answer": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _user, r) => ({ t: "answer", answer: r.pick(ANSWERS) }),

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const need = bar(state, { members });
    const mine = state.going.includes(me) ? "going" : state.maybe.includes(me) ? "maybe" : state.no.includes(me) ? "no" : null;
    const waiting = members.filter((m) => !everyone(state).includes(m.id));
    const left = Math.max(0, need - state.going.length);
    const dropped = state.lock ? state.lock.going.filter((u) => !state.going.includes(u)) : [];
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    return (
      <div>
        <CardHeader title={state.title} subtitle={state.detail || undefined} />
        <Progress
          value={Math.min(state.going.length, need)}
          max={need}
          label={state.lock ? `Locked · ${state.going.length} going` : `${state.going.length} of ${need} in · ${left} more to lock`}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32, marginTop: 8 }}>
          <Facepile users={state.going} max={6} size={24} />
          <small>{state.going.length ? `${state.going.length} going` : "No one yet"}</small>
          {state.maybe.length ? <small>· {state.maybe.length} maybe</small> : null}
        </div>
        <div style={{ marginTop: 8 }}>
          {/* Buttons, not Rsvp: Rsvp's selected label is primary blue on the dark card, under AA contrast. */}
          <div style={{ display: "flex", gap: 8 }}>
            {ANSWERS.map((k) => (
              <div key={k} style={{ flex: 1, display: "flex" }}>
                <Button kind={mine === k ? "primary" : "secondary"} wide onClick={() => dispatch({ t: "answer", answer: k })}>
                  {`${LABELS[k]} · ${state[k].length}`}
                </Button>
              </div>
            ))}
          </div>
        </div>
        <div style={{ minHeight: 24, marginTop: 8 }}>
          {state.lock ? (
            <SystemLine>{dropped.length ? `Locked · ${dropped.map(nameOf).join(", ")} dropped out` : "Locked · the plan is on"}</SystemLine>
          ) : waiting.length ? (
            <SystemLine>{`Waiting on ${waiting.map((m) => m.name).slice(0, 3).join(", ")}${waiting.length > 3 ? ` and ${waiting.length - 3} more` : ""}`}</SystemLine>
          ) : null}
        </div>
      </div>
    );
  },
});
