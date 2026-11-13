import { defineApp, Avatar, Button, CardHeader, SystemLine, running, tween } from "@muse/app";

// Shared list: groceries, a Costco run, a Target list for the apartment. Anyone adds an item or
// flags it urgent. One person taps "I'm going" and takes the whole run; while they are out, only
// they check items off (the line strikes through), so two people never buy the same eggs. When
// they tap Done, the bought items leave the list and the rest wait for the next run.

type Params = {
  /** Card title: "Apt 4b groceries" or "Target run" */
  title: string;
  /** Items from the chat, up to 20. urgent: someone said "asap", "critical", "we're out". */
  items: { label: string; urgent: boolean }[];
};

// @params
const P: Params = {
  title: "Apt 4b groceries",
  items: [
    { label: "TP", urgent: true },
    { label: "Eggs", urgent: true },
    { label: "Oat milk", urgent: false },
    { label: "Frozen dumplings", urgent: false },
    { label: "Paper towels", urgent: false },
    { label: "Limes", urgent: false },
  ],
};
// @end params

type Item = { id: string; label: string; urgent: boolean; by: string | null; done: boolean; at: number };
/** runner: who took the run, or null. at: when an item was checked or unchecked, for the strike. */
type State = { title: string; items: Item[]; runner: string | null; since: number };
type Action =
  | { t: "add"; label: string }
  | { t: "flag"; item: string }
  | { t: "check"; item: string }
  | { t: "go" }
  | { t: "finish" };
type Local = { draft: string; all: boolean };
type Ctx = { members: { id: string }[] };

const MAX_ITEMS = 20;
const MAX_LABEL = 30;
const STRIKE_MS = 360;
const SETTLE_MS = 1200;
const strike = tween({ duration: STRIKE_MS, easing: "standard" });

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const tidy = (label: string) => label.trim().replace(/\s+/g, " ").slice(0, MAX_LABEL);

// ---- Checks. ----
const find = (s: State, id: string) => s.items.find((i) => i.id === id);
const restText = (s: State, id: string | null) => s.items.filter((i) => i.id !== id).map((i) => JSON.stringify(i)).join("|");

// ---- Reducer. ----
function add(s: State, user: string, label: unknown, seq: number, time: number): State {
  if (typeof label !== "string") return s;
  const l = tidy(label);
  if (!l || s.items.length >= MAX_ITEMS) return s;
  if (s.items.some((i) => !i.done && i.label.toLowerCase() === l.toLowerCase())) return s;
  return { ...s, items: [...s.items, { id: `i${seq}`, label: l, urgent: false, by: user, done: false, at: time }] };
}

function flag(s: State, id: unknown): State {
  const it = s.items.find((i) => i.id === id);
  if (!it || it.done) return s;
  return { ...s, items: s.items.map((i) => (i.id === it.id ? { ...i, urgent: !i.urgent } : i)) };
}

function check(s: State, user: string, id: unknown, time: number): State {
  const it = s.items.find((i) => i.id === id);
  if (!it || s.runner !== user) return s;
  // Unchecking must not make two open items with the same name.
  if (it.done && s.items.some((i) => !i.done && i.label.toLowerCase() === it.label.toLowerCase())) return s;
  return { ...s, items: s.items.map((i) => (i.id === it.id ? { ...i, done: !i.done, at: time } : i)) };
}

function go(s: State, user: string, time: number): State {
  if (s.runner !== null || !s.items.some((i) => !i.done)) return s;
  return { ...s, runner: user, since: time };
}

function finish(s: State, user: string): State {
  if (s.runner !== user) return s;
  return { ...s, runner: null, since: 0, items: s.items.filter((i) => !i.done) };
}

export default defineApp<State, Action, Local>({
  name: "Shared list",
  summary: (s, ctx) => {
    const left = s.items.filter((i) => !i.done).length;
    const who = s.runner ? `${ctx.members.find((m) => m.id === s.runner)?.name ?? "Someone"} is going. ` : "";
    return `${s.title}: ${who}${left} to get.`;
  },

  init: () => {
    const seen = new Set<string>();
    const items: Item[] = [];
    for (const raw of P.items) {
      const label = tidy(raw.label);
      if (!label || seen.has(label.toLowerCase()) || items.length >= MAX_ITEMS) continue;
      seen.add(label.toLowerCase());
      items.push({ id: `p${items.length}`, label, urgent: raw.urgent === true, by: null, done: false, at: 0 });
    }
    return { title: P.title.trim().slice(0, 60) || "Shared list", items, runner: null, since: 0 };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    switch (action.t) {
      case "add":
        return add(state, meta.user, action.label, meta.seq, meta.time);
      case "flag":
        return flag(state, action.item);
      case "check":
        return check(state, meta.user, action.item, meta.time);
      case "go":
        return go(state, meta.user, meta.time);
      case "finish":
        return finish(state, meta.user);
    }
    return state;
  },

  // Someone left: if they had the run, it opens up again (what they checked stays checked); the
  // items they added stay on the list without their face.
  onMembers: (state, ctx) => {
    const runner = state.runner === null || inChat(ctx, state.runner) ? state.runner : null;
    const stale = state.items.some((i) => i.by !== null && !inChat(ctx, i.by));
    if (runner === state.runner && !stale) return state;
    return {
      ...state,
      runner,
      since: runner === null ? 0 : state.since,
      items: stale ? state.items.map((i) => (i.by === null || inChat(ctx, i.by) ? i : { ...i, by: null })) : state.items,
    };
  },

  invariants: {
    "the runner is in the chat": (s, ctx) => s.runner === null || inChat(ctx, s.runner),
    "no run means no start time": (s) => (s.runner === null) === (s.since === 0),
    "whoever added an item is in the chat": (s, ctx) => s.items.every((i) => i.by === null || inChat(ctx, i.by)),
    "no two open items with the same name": (s) => {
      const open = s.items.filter((i) => !i.done).map((i) => i.label.toLowerCase());
      return new Set(open).size === open.length;
    },
    "items are short and at most 20": (s) => s.items.length <= MAX_ITEMS && s.items.every((i) => i.label.length > 0 && i.label.length <= MAX_LABEL),
    "item ids are unique": (s) => new Set(s.items.map((i) => i.id)).size === s.items.length,
  },

  transitions: {
    "an add puts one new open item at the end, added by the actor": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.items.at(-1);
      return n.items.length === p.items.length + 1 && !!last && last.id === `i${m.seq}` && last.by === m.user && !last.done && !last.urgent && restText(p, null) === restText(n, last.id) && n.runner === p.runner;
    },
    "a flag flips urgent on one open item and nothing else": (p, n, a) => {
      if (a.t !== "flag" || p === n) return true;
      const b = find(p, a.item), c = find(n, a.item);
      return !!b && !!c && !b.done && c.urgent !== b.urgent && c.done === b.done && c.label === b.label && restText(p, a.item) === restText(n, a.item) && n.runner === p.runner;
    },
    "only the person on the run checks an item, and only that item changes": (p, n, a, m) => {
      if (a.t !== "check" || p === n) return true;
      const b = find(p, a.item), c = find(n, a.item);
      return p.runner === m.user && !!b && !!c && c.done !== b.done && c.at === m.time && c.urgent === b.urgent && restText(p, a.item) === restText(n, a.item);
    },
    "going takes a free run for the actor while something is left": (p, n, a, m) =>
      a.t !== "go" || p === n || (p.runner === null && n.runner === m.user && n.since === m.time && p.items.some((i) => !i.done) && restText(p, null) === restText(n, null)),
    "only the runner finishes, and only checked items leave": (p, n, a, m) =>
      a.t !== "finish" || p === n || (p.runner === m.user && n.runner === null && restText(n, null) === p.items.filter((i) => !i.done).map((i) => JSON.stringify(i)).join("|")),
    "only people in the chat change the list": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (s.runner === null && k < 0.25) return { t: "go" };
    if (s.runner === user && s.items.length && k < 0.7) return { t: "check", item: r.pick(s.items).id };
    if (s.runner === user && k < 0.8) return { t: "finish" };
    if (k < 0.5) return { t: "add", label: r.pick(["Eggs", "Hot sauce", "Dish soap", "Bananas", "Coffee"]) };
    if (s.items.length && k < 0.75) return { t: "flag", item: r.pick(s.items).id };
    if (s.items.length) return { t: "check", item: r.pick(s.items).id };
    return { t: "add", label: "Ice" };
  },

  local: { draft: "", all: false },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const runner = state.runner;
    const mine = runner === me;
    const open = state.items.filter((i) => !i.done);
    const urgent = open.filter((i) => i.urgent).length;
    // Urgent first, then the rest; a checked item keeps its place while its line strikes through,
    // then sinks to the bottom.
    const rank = (i: Item) => (i.done && running(i.at, SETTLE_MS) === null ? 2 : i.urgent && !i.done ? 0 : 1);
    const sorted = state.items.map((i, n) => ({ i, n })).sort((a, b) => rank(a.i) - rank(b.i) || a.n - b.n).map((x) => x.i);
    const shown = local.all ? sorted : sorted.slice(0, 4);
    const submit = () => {
      if (tidy(local.draft)) dispatch({ t: "add", label: local.draft });
      setLocal({ draft: "" });
    };
    return (
      <div>
        <CardHeader title={state.title} subtitle={open.length ? `${open.length} to get${urgent ? ` · ${urgent} urgent` : ""}` : "Nothing on the list"} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: theme.radius.card, background: runner ? theme.color.selected : theme.color.input, minHeight: 52 }}>
          {runner ? <Avatar user={runner} size={32} /> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{runner ? (mine ? "You're going" : `${nameOf(runner)} is going`) : "No one's going yet"}</div>
            <small>{runner ? (mine ? "Check items off as you get them" : "They'll check items off") : "Take the run and it's yours"}</small>
          </div>
          {runner === null ? (
            <Button kind="primary" disabled={!open.length} onClick={() => dispatch({ t: "go" })}>
              I'm going
            </Button>
          ) : mine ? (
            <Button kind="primary" onClick={() => dispatch({ t: "finish" })}>
              Done
            </Button>
          ) : null}
        </div>
        <div style={{ marginTop: 4 }}>
          {shown.map((i) => {
            const t = running(i.at, STRIKE_MS);
            const w = i.done ? (t === null ? 1 : strike(t)) : t === null ? 0 : 1 - strike(t);
            return (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                <button
                  type="button"
                  aria-label={i.done ? `Uncheck ${i.label}` : `Check off ${i.label}`}
                  aria-pressed={i.done}
                  disabled={!mine}
                  onClick={() => dispatch({ t: "check", item: i.id })}
                  style={{ width: 44, height: 44, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      boxShadow: i.done ? "none" : `inset 0 0 0 2px ${mine ? theme.color.secondaryText : theme.color.divider}`,
                      background: i.done ? theme.color.positive : "transparent",
                      color: theme.color.card,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      transform: `scale(${t !== null && i.done ? 0.8 + 0.2 * strike(t) : 1})`,
                    }}
                  >
                    {i.done ? "✓" : ""}
                  </span>
                </button>
                <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                  <span style={{ position: "relative", display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "middle", color: i.done ? theme.color.secondaryText : theme.color.text }}>
                    {i.label}
                    <span aria-hidden="true" style={{ position: "absolute", left: 0, top: "50%", height: 2, marginTop: -1, width: `${w * 100}%`, background: theme.color.secondaryText, borderRadius: 1 }} />
                  </span>
                  {i.by ? <small>{` · ${nameOf(i.by).replace("You", "you")}`}</small> : null}
                </div>
                {i.done ? null : (
                  <button
                    type="button"
                    aria-label={i.urgent ? `${i.label} is urgent` : `Mark ${i.label} urgent`}
                    aria-pressed={i.urgent}
                    onClick={() => dispatch({ t: "flag", item: i.id })}
                    style={{ minWidth: 44, height: 44, flex: "none", display: "flex", alignItems: "center", justifyContent: "flex-end" }}
                  >
                    {i.urgent ? (
                      <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: theme.type.meta, lineHeight: "16px", fontWeight: 600, color: theme.color.negative, boxShadow: `inset 0 0 0 1px ${theme.color.negative}` }}>Urgent</span>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={theme.color.secondaryText} stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
                        <path d="M4 14V2.5h7.5l-1.5 3 1.5 3H4" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            );
          })}
          {sorted.length > 4 ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Button kind="deemphasized" onClick={() => setLocal({ all: !local.all })}>
                {local.all ? "Show less" : `${sorted.length - 4} more`}
              </Button>
            </div>
          ) : null}
          {!state.items.length ? <SystemLine>Add what the place needs</SystemLine> : null}
        </div>
        <form
          style={{ display: "flex", gap: 8, marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input value={local.draft} placeholder="Add an item" aria-label="Add an item" maxLength={MAX_LABEL} onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
          <Button disabled={!tidy(local.draft)} onClick={submit}>
            Add
          </Button>
        </form>
      </div>
    );
  },
});
