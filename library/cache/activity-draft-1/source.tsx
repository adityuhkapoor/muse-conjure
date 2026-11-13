import { defineApp, Avatar, Button, CardHeader, rng, running } from "@muse/app";

// Saturday draft: draw a random pick order once, then take turns in snake order until the
// pick limit is reached. Only the person whose turn it is can pick.

const CHAT = {
  title: "Saturday plan draft",
  cap: 4,
  options: [
    { label: "Honky Tonk Row", note: "" },
    { label: "Hattie B's", note: "" },
    { label: "Country Music Hall of Fame", note: "" },
    { label: "Pedal Tavern", note: "$30 each" },
    { label: "Bluebird Cafe", note: "" },
  ],
};

type Option = { id: string; label: string; note: string; by: string | null };
type State = { title: string; cap: number; options: Option[]; order: string[]; drawnAt: number; picks: string[] };
type Action = { t: "draw" } | { t: "pick"; option: string } | { t: "reset" };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);

/** Snake order: round 1 forward, round 2 reversed, and so on. */
function pickerOf(s: State): string | null {
  const n = s.order.length;
  if (n === 0 || s.picks.length >= s.cap) return null;
  const i = s.picks.length;
  const pos = i % n;
  return Math.floor(i / n) % 2 === 0 ? (s.order[pos] ?? null) : (s.order[n - 1 - pos] ?? null);
}

const takenIds = (s: State) => s.options.filter((o) => o.by !== null).map((o) => o.id);
const optionsJson = (s: State) => JSON.stringify(s.options);

export default defineApp<State, Action, Local>({
  name: "Saturday draft",
  summary: (s) => (s.order.length === 0 ? `${s.title}: order not drawn yet.` : `${s.title}: ${s.picks.length} of ${s.cap} picked.`),

  init: () => ({
    title: CHAT.title,
    cap: CHAT.cap,
    options: CHAT.options.map((o, i) => ({ id: `o${i}`, label: o.label, note: o.note, by: null })),
    order: [],
    drawnAt: 0,
    picks: [],
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "draw") {
      if (state.order.length > 0 || ctx.members.length === 0) return state;
      const order = [...rng(meta.seed).shuffle(ctx.members.map((m) => m.id))];
      return { ...state, order, drawnAt: meta.time };
    }
    if (action.t === "pick") {
      if (typeof action.option !== "string") return state;
      if (pickerOf(state) !== meta.user) return state;
      const target = state.options.find((o) => o.id === action.option);
      if (!target || target.by !== null) return state;
      return {
        ...state,
        options: state.options.map((o) => (o.id === target.id ? { ...o, by: meta.user } : o)),
        picks: [...state.picks, target.id],
      };
    }
    if (action.t === "reset") {
      if (state.order.length === 0) return state;
      return { ...state, order: [], drawnAt: 0, picks: [], options: state.options.map((o) => ({ ...o, by: null })) };
    }
    return state;
  },

  // Someone left: they drop out of the order and their picks open up. Someone joined after the
  // draw: they go to the end of the order.
  onMembers: (state, ctx) => {
    if (state.order.length === 0) return state;
    const kept = state.order.filter((id) => inChat(ctx, id));
    const added = ctx.members.map((m) => m.id).filter((id) => !kept.includes(id));
    const optionLeft = state.options.some((o) => o.by !== null && !inChat(ctx, o.by));
    if (kept.length === state.order.length && added.length === 0 && !optionLeft) return state;
    const options = optionLeft ? state.options.map((o) => (o.by !== null && !inChat(ctx, o.by) ? { ...o, by: null } : o)) : state.options;
    const picks = optionLeft ? state.picks.filter((id) => options.find((o) => o.id === id)?.by !== null) : state.picks;
    return { ...state, order: [...kept, ...added], options, picks };
  },

  invariants: {
    "picks list exactly the taken options, once each": (s) => {
      const taken = takenIds(s);
      return s.picks.length === taken.length && new Set(s.picks).size === s.picks.length && s.picks.every((id) => taken.includes(id));
    },
    "picks never go past the limit": (s) => s.picks.length <= s.cap,
    "everyone in the order and every picker is in the chat": (s, ctx) =>
      s.order.every((id) => inChat(ctx, id)) && s.options.every((o) => o.by === null || inChat(ctx, o.by)),
    "everyone in the chat is in the order once it is drawn": (s, ctx) =>
      s.order.length === 0 || ctx.members.every((m) => s.order.includes(m.id)),
    "every picker is in the order, and the order has no repeats": (s) =>
      new Set(s.order).size === s.order.length && s.options.every((o) => o.by === null || s.order.includes(o.by)),
    "option ids are unique and the option count never changes": (s) =>
      new Set(s.options.map((o) => o.id)).size === s.options.length && s.options.length === CHAT.options.length,
    "no draw means no picks": (s) => s.order.length > 0 || (s.picks.length === 0 && takenIds(s).length === 0),
  },

  transitions: {
    "a draw sets the order from the seed and changes nothing else": (p, n, a, m, ctx) =>
      a.t !== "draw" ||
      p === n ||
      (p.order.length === 0 &&
        n.order.join() === rng(m.seed).shuffle(ctx.members.map((x) => x.id)).join() &&
        n.drawnAt === m.time &&
        n.picks.length === 0 &&
        optionsJson(p) === optionsJson(n)),
    "a pick gives that option to the actor, adds it to picks and touches no other option": (p, n, a, m) =>
      a.t !== "pick" ||
      p === n ||
      (p.options.every((o, i) => (o.id === a.option ? o.by === null && n.options[i]?.by === m.user : n.options[i]?.by === o.by)) &&
        n.picks.join() === [...p.picks, a.option].join() &&
        n.order.join() === p.order.join()),
    "only the person whose turn it is can pick": (p, n, a, m) => a.t !== "pick" || p === n || pickerOf(p) === m.user,
    "no pick before the draw or after the limit": (p, n, a) => a.t !== "pick" || p === n || (p.order.length > 0 && p.picks.length < p.cap),
    "a draw is only possible when no order exists": (p, n, a) => a.t !== "draw" || p === n || p.order.length === 0,
    "a reset clears the order, the time, the picks and every pick holder": (p, n, a) =>
      a.t !== "reset" || p === n || (n.order.length === 0 && n.drawnAt === 0 && n.picks.length === 0 && n.options.every((o) => o.by === null)),
    "a reset only happens after a draw, and always works then": (p, n, a, m, ctx) =>
      a.t !== "reset" || !inChat(ctx, m.user) || (p.order.length === 0 ? p === n : n.order.length === 0 && p !== n),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.order.length === 0) return r.next() < 0.9 ? { t: "draw" } : { t: "reset" };
    if (s.picks.length >= s.cap) return r.next() < 0.5 ? { t: "reset" } : { t: "pick", option: r.pick(s.options).id };
    if (pickerOf(s) === user) {
      const open = s.options.filter((o) => o.by === null);
      if (open.length && r.next() < 0.9) return { t: "pick", option: r.pick(open).id };
    }
    const x = r.next();
    if (x < 0.5) return { t: "pick", option: r.pick(s.options).id };
    if (x < 0.6) return { t: "reset" };
    return { t: "draw" };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const e = confirmed.drawnAt > 0 ? running(confirmed.drawnAt, 2000) : null;
    const drawing = pending && confirmed.order.length === 0 && state.order.length > 0;
    const spinning = drawing || e !== null;
    const drawn = state.order.length > 0;
    const done = drawn && state.picks.length >= state.cap;
    const picker = spinning ? null : pickerOf(state);
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));

    const subtitle = spinning ? "Drawing the order" : !drawn ? "Draw the order" : done ? "Plan is set" : `${state.picks.length} of ${state.cap} picked`;
    const status = spinning
      ? "Spinning"
      : !drawn
        ? "Pick order is drawn at random"
        : done
          ? "Everyone has a pick"
          : picker === me
            ? "Your turn"
            : picker
              ? `${nameOf(picker)} is picking`
              : "Waiting";

    return (
      <div>
        <CardHeader title={state.title} subtitle={subtitle} />
        {drawn && !spinning ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
            {state.order.map((id) => (
              <div
                key={id}
                style={{ padding: 2, borderRadius: theme.radius.pill, border: `2px solid ${id === picker ? theme.color.primary : theme.color.card}` }}
              >
                <Avatar user={id} size={28} />
              </div>
            ))}
          </div>
        ) : null}
        <div>
          {state.options.map((o) => {
            const left = done && o.by === null;
            const meta = [o.note, left ? "Left out" : ""].filter(Boolean).join(" · ");
            return (
              <div
                key={o.id}
                style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, borderBottom: `1px solid ${theme.color.divider}` }}
              >
                <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                  <div>{o.label}</div>
                  {meta ? <small>{meta}</small> : null}
                </div>
                {o.by !== null ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <small>{nameOf(o.by)}</small>
                    <Avatar user={o.by} size={24} />
                  </div>
                ) : picker === me && !done ? (
                  <Button kind="secondary" onClick={() => dispatch({ t: "pick", option: o.id })}>
                    Pick
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minHeight: 44 }}>
          <small style={{ flex: 1, minWidth: 0 }}>{status}</small>
          {!drawn ? (
            <Button kind="primary" onClick={() => dispatch({ t: "draw" })}>
              Draw order
            </Button>
          ) : !spinning ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "reset" })}>
              Start over
            </Button>
          ) : null}
        </div>
      </div>
    );
  },
});
