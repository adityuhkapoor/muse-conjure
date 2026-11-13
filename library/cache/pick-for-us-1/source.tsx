import { defineApp, Avatar, Button, CardHeader, rng, running } from "@muse/app";

// Lunch tiebreak. Anyone asks Muse to pick one of the places from the chat, once, for everyone.
// The pick comes from the server seed; the person who picked can clear it to pick again.

const CHAT = {
  title: "Where should we eat?",
  options: [
    { label: "Thai Palace", note: "Lunch special $11.99" },
    { label: "La Casita Tacos", note: "3 for $9" },
    { label: "Joe's Pizza", note: "" },
  ],
  out: "dumplings are out",
  deadline: "Reservation for 5 closes at 8",
};

const SPIN_MS = 1500;

type Option = { id: string; label: string; note: string };
type Result = { option: string; at: number; by: string };
type State = { options: Option[]; result: Result | null };
type Action = { t: "pick" } | { t: "reset" };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default defineApp<State, Action, Local>({
  name: "Lunch tiebreak",
  summary: (s) => {
    const w = s.result ? s.options.find((o) => o.id === s.result!.option) : undefined;
    return w ? `${CHAT.title} ${w.label}.` : `${CHAT.title} ${s.options.length} places, no pick yet.`;
  },

  init: () => ({
    options: CHAT.options.map((o, i) => ({ id: `p${i}`, label: o.label, note: o.note })),
    result: null,
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "pick") {
      if (state.result !== null || state.options.length === 0) return state;
      const win = rng(meta.seed).pick(state.options);
      return { ...state, result: { option: win.id, at: meta.time, by: meta.user } };
    }
    if (action.t === "reset") {
      if (state.result === null || state.result.by !== meta.user) return state;
      return { ...state, result: null };
    }
    return state;
  },

  invariants: {
    "there are 3 options with unique ids and labels": (s) =>
      s.options.length === 3 && new Set(s.options.map((o) => o.id)).size === 3 && s.options.every((o) => o.label.length > 0),
    "a result names an option that exists": (s) => s.result === null || s.options.some((o) => o.id === s.result!.option),
    "a result has a time and a person": (s) =>
      s.result === null || (Number.isInteger(s.result.at) && s.result.at >= 0 && typeof s.result.by === "string" && s.result.by.length > 0),
    "options keep their starting ids, labels and notes": (s) =>
      s.options.length === CHAT.options.length &&
      s.options.every((o, i) => o.id === `p${i}` && o.label === CHAT.options[i]!.label && o.note === CHAT.options[i]!.note),
  },

  transitions: {
    "a pick sets the option the seed gives, the time and the picker": (p, n, a, m) =>
      a.t !== "pick" ||
      p === n ||
      (p.result === null &&
        n.result !== null &&
        p.options.length > 0 &&
        n.result.option === rng(m.seed).pick(p.options).id &&
        n.result.at === m.time &&
        n.result.by === m.user),
    "a pick never changes a result that exists": (p, n, a) => a.t !== "pick" || p.result === null || p === n || same(p.result, n.result),
    "a reset only clears the result, and only for who made it": (p, n, a, m) =>
      a.t !== "reset" || p === n || (p.result !== null && p.result.by === m.user && n.result === null),
    "options never change in any step": (p, n) => same(p.options, n.options),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _user, r) => (r.next() < 0.6 ? { t: "pick" } : { t: "reset" }),

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const res = confirmed.result;
    const spinning = pending ? res === null || state.result === null : res !== null && running(res.at, SPIN_MS) !== null;
    const shown = !pending && res !== null && !spinning ? res : null;
    const win = shown ? confirmed.options.find((o) => o.id === shown.option) : undefined;
    const by = shown ? members.find((m) => m.id === shown.by) : undefined;

    if (spinning) {
      return (
        <div>
          <CardHeader title={CHAT.title} subtitle="Picking" />
          <div style={{ minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <h2>Spinning</h2>
          </div>
        </div>
      );
    }

    if (shown && win) {
      return (
        <div>
          <CardHeader title={CHAT.title} subtitle="Picked" />
          <div style={{ display: "grid", gap: 6, padding: "8px 0" }}>
            <h2>{win.label}</h2>
            {win.note ? <small>{win.note}</small> : null}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}>
              {by ? <Avatar user={by} size={24} /> : null}
              <small>{`Picked by ${by ? by.name : "Someone"}`}</small>
            </div>
            <small>{CHAT.deadline}</small>
          </div>
          {shown.by === me ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "reset" })}>
              Pick again
            </Button>
          ) : null}
        </div>
      );
    }

    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={`${confirmed.options.length} places · ${CHAT.out}`} />
        <div style={{ display: "grid", marginBottom: 12 }}>
          {confirmed.options.map((o) => (
            <div key={o.id} style={{ display: "grid", gap: 2, padding: "8px 0", minHeight: 44, borderBottom: `1px solid ${theme.color.divider}` }}>
              <span style={{ fontWeight: 600 }}>{o.label}</span>
              {o.note ? <small>{o.note}</small> : null}
            </div>
          ))}
        </div>
        <Button kind="primary" wide disabled={pending} onClick={() => dispatch({ t: "pick" })}>
          Pick one
        </Button>
      </div>
    );
  },
});
