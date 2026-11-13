// Bad fixture: with no options the card keeps a tall empty box where the list was.
// Expect: stage render, rule empty-state-blank.
// Profile: strict.
import { defineApp, Button, CardHeader, SystemLine, rng } from "@muse/app";

type Option = { id: string; label: string; by: string };
type State = { title: string; options: Option[]; picked: string | null; closed: boolean };
type Action = { t: "add"; label: string } | { t: "remove"; option: string } | { t: "pick" };
type Local = { draft: string };

const MAX = 8;
const MAX_LABEL = 40;
const SHOW = 4;
const IDEAS = ["Tacos", "Pho", "Sushi", "Ramen", "Dumplings", "Pizza", ""];

const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const isMember = (ctx: { members: { id: string }[] }, u: string) => ctx.members.some((m) => m.id === u);

function add(s: State, raw: unknown, seq: number, user: string): State {
  if (s.closed || typeof raw !== "string") return s;
  const label = clean(raw);
  if (!label || label.length > MAX_LABEL || s.options.length >= MAX) return s;
  if (s.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return s;
  return { ...s, options: [...s.options, { id: `o${seq}`, label, by: user }] };
}

export default defineApp<State, Action, Local>({
  name: "Pick one",
  summary: (s) => (s.closed ? `Picked: ${s.options.find((o) => o.id === s.picked)?.label ?? "nothing"}.` : s.options.length ? `${s.options.length} options.` : "No options yet."),
  init: () => ({ title: "Where should we eat?", options: [{ id: "a", label: "Tacos", by: "" }, { id: "b", label: "Pho", by: "" }], picked: null, closed: false }),
  reduce: (s, a, m, ctx) => {
    if (!isMember(ctx, m.user)) return s;
    if (a.t === "add") return add(s, a.label, m.seq, m.user);
    if (a.t === "remove") {
      if (s.closed || typeof a.option !== "string" || !s.options.some((o) => o.id === a.option)) return s;
      return { ...s, options: s.options.filter((o) => o.id !== a.option) };
    }
    if (a.t === "pick") {
      if (s.closed || s.options.length < 2) return s;
      return { ...s, closed: true, picked: rng(m.seed).pick(s.options).id };
    }
    return s;
  },
  invariants: {
    "options are unique, short and capped": (s) =>
      s.options.length <= MAX &&
      new Set(s.options.map((o) => o.id)).size === s.options.length &&
      new Set(s.options.map((o) => o.label.toLowerCase())).size === s.options.length &&
      s.options.every((o) => o.label.length > 0 && o.label.length <= MAX_LABEL && o.label === clean(o.label)),
    "a pick is made only when closed, and is an option": (s) => (s.closed ? s.options.some((o) => o.id === s.picked) : s.picked === null),
  },
  transitions: {
    "an add appends one cleaned option by the sender": (p, n, a, m) =>
      a.t !== "add" || p === n || (n.options.length === p.options.length + 1 && n.options.at(-1)!.label === clean(String(a.label)) && n.options.at(-1)!.by === m.user && n.options.at(-1)!.id === `o${m.seq}` && n.closed === p.closed),
    "a remove drops exactly that option": (p, n, a) =>
      a.t !== "remove" || p === n || (n.options.length === p.options.length - 1 && !n.options.some((o) => o.id === a.option) && p.options.some((o) => o.id === a.option)),
    "a pick closes with what the seed picks": (p, n, a, m) => a.t !== "pick" || p === n || (!p.closed && n.closed && p.options.length >= 2 && n.picked === rng(m.seed).pick(p.options).id),
    "nothing changes once closed": (p, n) => !p.closed || p === n,
    "only people in the chat change it": (p, n, _a, m, ctx) => p === n || isMember(ctx, m.user),
  },
  arbitrary: (s, _u, r) => {
    if (s.closed) return null;
    const k = r.next();
    if (k < 0.5) return { t: "add", label: r.pick(IDEAS) };
    if (k < 0.92 && s.options.length) return { t: "remove", option: r.pick(s.options).id };
    return { t: "pick" };
  },
  local: { draft: "" },
  view: ({ state, dispatch, local, setLocal }) => {
    const submit = () => {
      if (clean(local.draft)) dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "" });
    };
    if (state.closed) {
      const pick = state.options.find((o) => o.id === state.picked);
      return (
        <div>
          <CardHeader title={state.title} subtitle="Picked" />
          <p style={{ fontWeight: 600 }}>{pick?.label ?? "Nothing"}</p>
        </div>
      );
    }
    const shown = state.options.slice(0, SHOW);
    const rest = state.options.length - shown.length;
    return (
      <div>
        <CardHeader title={state.title} subtitle={state.options.length ? `${state.options.length} ${state.options.length === 1 ? "option" : "options"}` : "No options yet"} />
        {state.options.length === 0 ? <div style={{ height: 220 }} /> : null}
        {shown.map((o) => (
          <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
            <Button kind="deemphasized" onClick={() => dispatch({ t: "remove", option: o.id })}>
              Remove
            </Button>
          </div>
        ))}
        {rest > 0 ? <SystemLine>and {rest} more</SystemLine> : null}
        {state.options.length < MAX ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add an option" aria-label="Add an option" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
            <Button kind="secondary" disabled={!clean(local.draft)} onClick={submit}>
              Add
            </Button>
          </form>
        ) : null}
        <div style={{ display: "flex", marginTop: 8 }}>
          <Button kind="primary" wide disabled={state.options.length < 2} onClick={() => dispatch({ t: "pick" })}>
            Pick one
          </Button>
        </div>
      </div>
    );
  },
});
