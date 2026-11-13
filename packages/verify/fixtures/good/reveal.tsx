// Good fixture: a secret guess. Guesses stay face down (a "?" card per person) until everyone in
// the chat has guessed, then all are shown. The hidden cards look sparse but are deliberate and
// must not be flagged as a blank card or a decoration without its subject. Once revealed nothing
// more can change: a finished card with no buttons.
// Profile: strict.
import { defineApp, Avatar, Button, CardHeader, SystemLine } from "@muse/app";

type State = { question: string; guesses: Record<string, number> };
type Action = { t: "guess"; n: number };

const CHOICES = [1, 2, 3, 4, 5];
const isMember = (ctx: { members: { id: string }[] }, u: string) => ctx.members.some((m) => m.id === u);
const allIn = (s: State, ids: string[]) => ids.length > 0 && ids.every((id) => s.guesses[id] !== undefined);
const keep = (g: Record<string, number>, ids: string[]) => {
  const out: Record<string, number> = {};
  for (const k of Object.keys(g).sort()) if (ids.includes(k)) out[k] = g[k]!;
  return out;
};

export default defineApp<State, Action>({
  name: "Secret guess",
  summary: (s, ctx) => `${Object.keys(s.guesses).length} of ${ctx.members.length} guessed.`,
  init: () => ({ question: "How many slices will Theo eat?", guesses: {} }),
  reduce: (s, a, m, ctx) => {
    if (!isMember(ctx, m.user) || a.t !== "guess" || allIn(s, ctx.members.map((x) => x.id))) return s;
    if (typeof a.n !== "number" || !CHOICES.includes(a.n) || s.guesses[m.user] !== undefined) return s;
    return { ...s, guesses: keep({ ...s.guesses, [m.user]: a.n }, ctx.members.map((x) => x.id)) };
  },
  onMembers: (s, ctx) => ({ ...s, guesses: keep(s.guesses, ctx.members.map((x) => x.id)) }),
  invariants: {
    "guesses are choices from people in the chat": (s, ctx) => Object.keys(s.guesses).every((k) => isMember(ctx, k) && CHOICES.includes(s.guesses[k]!)),
  },
  transitions: {
    "a guess records only the sender's first guess": (p, n, a, m) =>
      a.t !== "guess" || p === n || (p.guesses[m.user] === undefined && n.guesses[m.user] === a.n && Object.keys(n.guesses).length === Object.keys(p.guesses).length + 1),
    "nothing changes once everyone guessed": (p, n, _a, _m, ctx) => !allIn(p, ctx.members.map((x) => x.id)) || p === n,
    "only people in the chat guess": (p, n, _a, m, ctx) => p === n || isMember(ctx, m.user),
  },
  arbitrary: (s, u, r, ctx) => (allIn(s, ctx.members.map((x) => x.id)) || s.guesses[u] !== undefined ? null : { t: "guess", n: r.pick(CHOICES) }),
  view: ({ state, me, members, dispatch }) => {
    const done = allIn(state, members.map((m) => m.id));
    const mine = state.guesses[me];
    const count = Object.keys(state.guesses).length;
    return (
      <div>
        <CardHeader title={state.question} subtitle={done ? "Everyone guessed" : `${count} of ${members.length} guessed`} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "4px 0 8px" }}>
          {members.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 4px", borderRadius: 99, background: "var(--color-input)" }}>
              <Avatar user={m} size={24} />
              <span>{done ? String(state.guesses[m.id]) : state.guesses[m.id] !== undefined ? "Ready" : "?"}</span>
            </div>
          ))}
        </div>
        {done || mine !== undefined ? (
          <SystemLine>{done ? "All guesses are shown" : `You guessed ${mine}. Waiting for the others.`}</SystemLine>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            {CHOICES.map((n) => (
              <Button key={n} kind="secondary" onClick={() => dispatch({ t: "guess", n })}>
                {String(n)}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  },
});
