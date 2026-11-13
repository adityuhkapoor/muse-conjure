import { defineApp, Button, CardHeader, Facepile } from "@muse/app";

// One in/out vote per person on each house rule. A repeat vote on the same side clears it.

const HOUSE = {
  title: "Which house rules are in?",
  rules: [
    "Quiet hours 11pm-8am weeknights (midnight suggested, weekends none)",
    "Overnight guests max 2 nights a week, ask the group first (3 suggested)",
    "Dishes done same day, no soaking overnight (next morning suggested)",
    "Shoes off at the door",
    "Bathroom chore wheel, switches every Sunday",
    "No pad thai leftovers in the fridge more than 4 days",
    "Shared snacks are fair game, replace if you finish it",
  ],
};

type Choice = "in" | "out";
type Rule = { id: string; label: string; ins: string[]; outs: string[] };
type State = { rules: Rule[] };
type Action = { t: "vote"; rule: string; choice: Choice };
type Local = { at: number };

const MAX_LABEL = 80;
const LABELS = HOUSE.rules.map((l) => l.trim().replace(/\s+/g, " ").slice(0, MAX_LABEL));

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const side = (r: Rule, c: Choice) => (c === "in" ? r.ins : r.outs);
const voted = (r: Rule, u: string) => r.ins.includes(u) || r.outs.includes(u);
const wo = (xs: string[], u: string) => xs.filter((x) => x !== u).join();
const dup = (xs: string[]) => new Set(xs).size !== xs.length;

function castVote(r: Rule, user: string, choice: Choice): Rule {
  const rm = (xs: string[]) => xs.filter((x) => x !== user);
  const had = side(r, choice).includes(user);
  const ins = choice === "in" ? (had ? rm(r.ins) : [...r.ins, user]) : rm(r.ins);
  const outs = choice === "out" ? (had ? rm(r.outs) : [...r.outs, user]) : rm(r.outs);
  return { ...r, ins, outs };
}

const votedOnAll = (s: State, id: string) => s.rules.every((r) => voted(r, id));

export default defineApp<State, Action, Local>({
  name: "House rules vote",
  summary: (s, ctx) => `House rules · ${ctx.members.filter((m) => votedOnAll(s, m.id)).length} of ${ctx.members.length} voted on every rule`,

  init: () => ({ rules: LABELS.map((label, i) => ({ id: `r${i}`, label, ins: [], outs: [] })) }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t !== "vote") return state;
    if (typeof action.rule !== "string" || (action.choice !== "in" && action.choice !== "out")) return state;
    const target = state.rules.find((r) => r.id === action.rule);
    if (!target) return state;
    return { ...state, rules: state.rules.map((r) => (r.id === target.id ? castVote(r, meta.user, action.choice) : r)) };
  },

  onMembers: (state, ctx) => {
    if (state.rules.every((r) => r.ins.every((v) => inChat(ctx, v)) && r.outs.every((v) => inChat(ctx, v)))) return state;
    return {
      ...state,
      rules: state.rules.map((r) => ({ ...r, ins: r.ins.filter((v) => inChat(ctx, v)), outs: r.outs.filter((v) => inChat(ctx, v)) })),
    };
  },

  invariants: {
    "no one is both in and out on a rule": (s) => s.rules.every((r) => !r.ins.some((v) => r.outs.includes(v))),
    "no one is listed twice on a side": (s) => s.rules.every((r) => !dup(r.ins) && !dup(r.outs)),
    "voters are in the chat": (s, ctx) => s.rules.every((r) => r.ins.every((v) => inChat(ctx, v)) && r.outs.every((v) => inChat(ctx, v))),
    "the 7 rules keep their ids and labels": (s) =>
      s.rules.length === LABELS.length && s.rules.every((r, i) => r.id === `r${i}` && r.label === LABELS[i]),
    "every label is 1 to 80 characters": (s) => s.rules.every((r) => r.label.length >= 1 && r.label.length <= MAX_LABEL),
  },

  transitions: {
    "a vote changes only the actor's own vote on the named rule": (p, n, a, m) =>
      a.t !== "vote" ||
      p === n ||
      (p.rules.length === n.rules.length &&
        p.rules.every((r, i) => {
          const q = n.rules[i]!;
          if (q.id !== r.id || q.label !== r.label) return false;
          return r.id === a.rule
            ? wo(r.ins, m.user) === wo(q.ins, m.user) && wo(r.outs, m.user) === wo(q.outs, m.user)
            : r.ins.join() === q.ins.join() && r.outs.join() === q.outs.join();
        })),
    "a vote puts the actor on the chosen side only, or clears a repeat": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const before = p.rules.find((r) => r.id === a.rule);
      const after = n.rules.find((r) => r.id === a.rule);
      if (!before || !after) return false;
      const other: Choice = a.choice === "in" ? "out" : "in";
      const had = side(before, a.choice).includes(m.user);
      return side(after, a.choice).includes(m.user) === !had && !side(after, other).includes(m.user);
    },
    "a vote with a bad rule or choice changes nothing": (p, n, a) =>
      a.t !== "vote" || p === n || ((a.choice === "in" || a.choice === "out") && typeof a.rule === "string" && p.rules.some((r) => r.id === a.rule)),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "votes never change labels or the number of rules": (p, n) =>
      p.rules.length === n.rules.length && p.rules.every((r, i) => n.rules[i]!.label === r.label && n.rules[i]!.id === r.id),
  },

  arbitrary: (s, _user, r) => ({
    t: "vote",
    rule: r.next() < 0.1 ? "r99" : r.pick(s.rules).id,
    choice: r.next() < 0.5 ? "in" : "out",
  }),

  local: { at: -1 },

  view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
    const rules = state.rules;
    const last = rules.length - 1;
    const firstOpen = rules.findIndex((x) => !voted(x, me));
    const cur = Math.min(last, Math.max(0, local.at >= 0 ? local.at : firstOpen >= 0 ? firstOpen : 0));
    const r = rules[cur]!;
    const mine: Choice | null = r.ins.includes(me) ? "in" : r.outs.includes(me) ? "out" : null;
    const done = members.filter((m) => votedOnAll(state, m.id)).length;
    const cast = (choice: Choice) => {
      dispatch({ t: "vote", rule: r.id, choice });
      setLocal({ at: cur });
    };
    return (
      <div>
        <CardHeader title={HOUSE.title} subtitle={`${done} of ${members.length} voted on every rule`} />
        <div style={{ display: "flex", gap: 4, alignItems: "center", height: 12, margin: "4px 0 8px" }}>
          {rules.map((x, i) => (
            <div
              key={x.id}
              style={{
                flex: 1,
                height: i === cur ? 8 : 4,
                borderRadius: 4,
                background: voted(x, me) ? theme.color.primary : theme.color.track,
              }}
            />
          ))}
        </div>
        <small>{`Rule ${cur + 1} of ${rules.length}`}</small>
        <div style={{ fontWeight: 600, margin: "2px 0 4px", minHeight: 40 }}>{r.label}</div>
        <small>{`${r.ins.length} in · ${r.outs.length} out · Your vote: ${mine ?? "not yet"}`}</small>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "8px 0" }}>
          <Button wide kind={mine === "in" ? "primary" : "secondary"} onClick={() => cast("in")}>
            In
          </Button>
          <Button wide kind={mine === "out" ? "primary" : "secondary"} onClick={() => cast("out")}>
            Out
          </Button>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", minHeight: 28 }}>
          {r.ins.length ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <small>In</small>
              <Facepile users={r.ins} max={3} size={20} />
            </div>
          ) : null}
          {r.outs.length ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <small>Out</small>
              <Facepile users={r.outs} max={3} size={20} />
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
          <Button kind="deemphasized" disabled={cur === 0} onClick={() => setLocal({ at: cur - 1 })}>
            Back
          </Button>
          <Button kind="secondary" disabled={cur === last} onClick={() => setLocal({ at: cur + 1 })}>
            Next
          </Button>
        </div>
      </div>
    );
  },
});
