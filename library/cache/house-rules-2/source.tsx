import { defineApp, Button, CardHeader } from "@muse/app";

// Rules vote. Everyone votes yes or no on each proposed suite rule; anyone can add a rule.

const CONTENT = {
  title: "Which suite rules do we adopt?",
  rules: [
    "Whoever fills the trash takes it out",
    "Headset only after 1am",
    "Text the group chat for sleepovers",
    "Labelled food is off limits",
    "Headset after 12:30 instead of 1am",
  ],
  canAdd: true,
};

type Rule = { id: string; label: string; yes: string[]; no: string[] };
type State = { title: string; canAdd: boolean; rules: Rule[] };
type Action = { t: "vote"; rule: string; choice: "yes" | "no" } | { t: "add"; label: string };
type Local = { draft: string };

const MAX_RULES = 8;
const MAX_LABEL = 40;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const without = (xs: string[], user: string) => xs.filter((x) => x !== user).join();
const listOf = (r: Rule | undefined, choice: unknown) => (!r ? [] : choice === "yes" ? r.yes : choice === "no" ? r.no : []);
const find = (s: State, id: unknown) => s.rules.find((r) => r.id === id);
const sameRule = (a: Rule, b: Rule) => a.id === b.id && a.label === b.label && a.yes.join() === b.yes.join() && a.no.join() === b.no.join();

function vote(s: State, user: string, id: unknown, choice: unknown): State {
  if (typeof id !== "string" || (choice !== "yes" && choice !== "no")) return s;
  const target = find(s, id);
  if (!target) return s;
  const had = (choice === "yes" ? target.yes : target.no).includes(user);
  return {
    ...s,
    rules: s.rules.map((r) => {
      if (r.id !== id) return r;
      const yes = r.yes.filter((v) => v !== user);
      const no = r.no.filter((v) => v !== user);
      if (!had) (choice === "yes" ? yes : no).push(user);
      return { ...r, yes, no };
    }),
  };
}

function add(s: State, raw: unknown, seq: number): State {
  if (!s.canAdd || typeof raw !== "string") return s;
  const label = clean(raw);
  if (!label || label.length > MAX_LABEL || s.rules.length >= MAX_RULES) return s;
  if (s.rules.some((r) => r.label.toLowerCase() === label.toLowerCase())) return s;
  return { ...s, rules: [...s.rules, { id: `r${seq}`, label, yes: [], no: [] }] };
}

const votedAll = (s: State, id: string) => s.rules.length > 0 && s.rules.every((r) => r.yes.includes(id) || r.no.includes(id));

export default defineApp<State, Action, Local>({
  name: "Rules vote",
  summary: (s, ctx) => {
    const n = ctx.members.filter((m) => votedAll(s, m.id)).length;
    return `${s.title} ${n} of ${ctx.members.length} voted on all rules.`;
  },

  init: () => {
    const seen = new Set<string>();
    const rules: Rule[] = [];
    for (const raw of CONTENT.rules) {
      const label = clean(raw).slice(0, MAX_LABEL);
      if (!label || seen.has(label.toLowerCase()) || rules.length >= MAX_RULES) continue;
      seen.add(label.toLowerCase());
      rules.push({ id: `p${rules.length}`, label, yes: [], no: [] });
    }
    return { title: CONTENT.title, canAdd: CONTENT.canAdd, rules };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "vote") return vote(state, meta.user, action.rule, action.choice);
    if (action.t === "add") return add(state, action.label, meta.seq);
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.rules.every((r) => r.yes.every((v) => inChat(ctx, v)) && r.no.every((v) => inChat(ctx, v)))) return state;
    return {
      ...state,
      rules: state.rules.map((r) => ({ ...r, yes: r.yes.filter((v) => inChat(ctx, v)), no: r.no.filter((v) => inChat(ctx, v)) })),
    };
  },

  invariants: {
    "no one is in both yes and no for a rule": (s) => s.rules.every((r) => r.yes.every((v) => !r.no.includes(v))),
    "no one appears twice in a yes list or a no list": (s) =>
      s.rules.every((r) => new Set(r.yes).size === r.yes.length && new Set(r.no).size === r.no.length),
    "everyone who voted is in the chat": (s, ctx) => s.rules.every((r) => r.yes.every((v) => inChat(ctx, v)) && r.no.every((v) => inChat(ctx, v))),
    "rule ids and labels are unique": (s) =>
      new Set(s.rules.map((r) => r.id)).size === s.rules.length && new Set(s.rules.map((r) => r.label.toLowerCase())).size === s.rules.length,
    "at most 8 rules, each label 1 to 40 characters": (s) =>
      s.rules.length <= MAX_RULES && s.rules.every((r) => r.label.length > 0 && r.label.length <= MAX_LABEL && r.label === clean(r.label)),
  },

  transitions: {
    "a vote changes only the actor's yes and no on that one rule": (p, n, a, m) =>
      a.t !== "vote" ||
      p === n ||
      (p.rules.length === n.rules.length &&
        p.rules.every((r, i) => {
          const q = n.rules[i]!;
          if (r.id !== a.rule) return sameRule(r, q);
          return r.id === q.id && r.label === q.label && without(r.yes, m.user) === without(q.yes, m.user) && without(r.no, m.user) === without(q.no, m.user);
        })),
    "after a vote the actor is in the chosen list only if they were not before, and not in the other": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const before = listOf(find(p, a.rule), a.choice).includes(m.user);
      const nr = find(n, a.rule);
      const other = listOf(nr, a.choice === "yes" ? "no" : "yes");
      return listOf(nr, a.choice).includes(m.user) === !before && !other.includes(m.user);
    },
    "an add appends exactly one empty rule last and leaves votes alone": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.rules.at(-1);
      return (
        n.rules.length === p.rules.length + 1 &&
        !!last &&
        last.label === clean(String(a.label)) &&
        last.yes.length === 0 &&
        last.no.length === 0 &&
        last.id === `r${m.seq}` &&
        p.rules.every((r, i) => sameRule(r, n.rules[i]!))
      );
    },
    "rule labels never change on a vote": (p, n, a) => a.t !== "vote" || p === n || p.rules.map((r) => r.label).join("|") === n.rules.map((r) => r.label).join("|"),
    "adding is allowed only when the vote lets people add": (p, n, a) => a.t !== "add" || p === n || p.canAdd,
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    if (s.canAdd && (s.rules.length === 0 || r.next() < 0.15))
      return { t: "add", label: r.pick(["No cooking after midnight", "  quiet hours  ", "", "Dishes same day", s.rules[0]?.label ?? "Shoes off"]) };
    if (!s.rules.length) return null;
    return { t: "vote", rule: r.pick(s.rules).id, choice: r.pick(["yes", "no"] as const) };
  },

  local: { draft: "" },

  view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
    const done = members.filter((m) => votedAll(state, m.id)).length;
    const canAdd = state.canAdd && clean(local.draft).length > 0 && state.rules.length < MAX_RULES;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "" });
    };
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${done} of ${members.length} voted on all rules`} />
        <div>
          {state.rules.map((r) => (
            <div
              key={r.id}
              style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 48, borderTop: `1px solid ${theme.color.divider}` }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>{r.label}</div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <Button kind={r.yes.includes(me) ? "secondary" : "deemphasized"} onClick={() => dispatch({ t: "vote", rule: r.id, choice: "yes" })}>
                  {`Yes ${r.yes.length}`}
                </Button>
                <Button kind={r.no.includes(me) ? "secondary" : "deemphasized"} onClick={() => dispatch({ t: "vote", rule: r.id, choice: "no" })}>
                  {`No ${r.no.length}`}
                </Button>
              </div>
            </div>
          ))}
        </div>
        {state.canAdd && state.rules.length < MAX_RULES ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add rule" aria-label="Add rule" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
            <Button kind="deemphasized" disabled={!canAdd} onClick={submit}>
              Add
            </Button>
          </form>
        ) : null}
      </div>
    );
  },
});
