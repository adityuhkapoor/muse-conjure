import { defineApp, Avatar, Button, CardHeader, SystemLine, rng, running } from "@muse/app";

// Snake draft for Austin spring break. Start draws the order from the server's seed; the order
// snakes (1 2 3, 3 2 1, ...). One pick per turn until the limit is reached or the board is empty.

const C = {
  title: "Austin spring break draft",
  items: ["Barton Springs", "Franklin BBQ", "Bat bridge at sunset", "South Congress thrifting", "Kayaking on Lady Bird Lake"],
  limit: 5,
};

type Item = { id: string; label: string; by: string | null };
type State = { title: string; limit: number; items: Item[]; order: string[]; started: boolean; startedAt: number; pos: number; host: string };
type Action = { t: "add"; label: string } | { t: "start" } | { t: "pick"; item: string } | { t: "reset" };
type Local = { draft: string };

const MAX_ITEMS = 8;
const MAX_LABEL = 40;

const clean = (x: string) => x.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const picked = (s: State) => s.items.filter((o) => o.by !== null).length;
const isDone = (s: State) => s.started && (s.pos >= s.limit || s.items.every((o) => o.by !== null));
const turnOf = (s: State): string | null => {
  if (!s.started || s.order.length === 0) return null;
  const n = s.order.length;
  const r = Math.floor(s.pos / n);
  const i = r % 2 === 0 ? s.pos % n : n - 1 - (s.pos % n);
  return s.order[i] ?? null;
};
const blank = (s: State): State => ({ ...s, items: s.items.map((o) => ({ ...o, by: null })), order: [], started: false, startedAt: 0, pos: 0 });

function add(s: State, raw: unknown, seq: number): State {
  if (s.started || typeof raw !== "string") return s;
  const label = clean(raw);
  if (!label || label.length > MAX_LABEL || s.items.length >= MAX_ITEMS) return s;
  if (s.items.some((o) => o.label.toLowerCase() === label.toLowerCase())) return s;
  return { ...s, items: [...s.items, { id: "i" + seq, label, by: null }] };
}

function pick(s: State, user: string, id: unknown): State {
  if (!s.started || isDone(s) || typeof id !== "string") return s;
  const o = s.items.find((x) => x.id === id);
  if (!o || o.by !== null || turnOf(s) !== user) return s;
  return { ...s, items: s.items.map((x) => (x.id === o.id ? { ...x, by: user } : x)), pos: s.pos + 1 };
}

export default defineApp<State, Action, Local>({
  name: "Snake draft",
  summary: (s, ctx) => {
    if (!s.started) return `${s.title} · not started · ${s.items.length} things`;
    if (isDone(s)) return `${s.title} · done · ${s.pos} picks`;
    const up = ctx.members.find((m) => m.id === turnOf(s))?.name ?? "Someone";
    return `${s.title} · ${s.pos} of ${Math.min(s.limit, s.items.length)} picked · ${up} is up`;
  },

  init: (ctx) => {
    const seen = new Set<string>();
    const items: Item[] = [];
    for (const raw of C.items) {
      const label = clean(raw).slice(0, MAX_LABEL);
      if (!label || seen.has(label.toLowerCase()) || items.length >= MAX_ITEMS) continue;
      seen.add(label.toLowerCase());
      items.push({ id: "p" + items.length, label, by: null });
    }
    return { title: C.title, limit: C.limit, items, order: [], started: false, startedAt: 0, pos: 0, host: ctx.members[0]?.id ?? "" };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "add") return add(state, action.label, meta.seq);
    if (action.t === "start") {
      if (state.started || state.items.length === 0 || ctx.members.length < 2) return state;
      return { ...state, started: true, startedAt: meta.time, pos: 0, order: rng(meta.seed).shuffle(ctx.members.map((m) => m.id)) };
    }
    if (action.t === "pick") return pick(state, meta.user, action.item);
    if (action.t === "reset") {
      if (meta.user !== state.host || (!state.started && state.pos === 0)) return state;
      return blank(state);
    }
    return state;
  },

  // Someone left: their picks go back on the board and they leave the order. The host passes on.
  onMembers: (state, ctx) => {
    let next = state;
    if (ctx.members.length > 0 && !inChat(ctx, next.host)) next = { ...next, host: ctx.members[0]!.id };
    if (next.started && next.order.some((u) => !inChat(ctx, u))) {
      const order = next.order.filter((u) => inChat(ctx, u));
      const items = next.items.map((o) => (o.by !== null && !inChat(ctx, o.by) ? { ...o, by: null } : o));
      if (order.length < 2) return blank({ ...next, items });
      return { ...next, items, order, pos: items.filter((o) => o.by !== null).length };
    }
    return next;
  },

  invariants: {
    "pos equals the number of picks and never passes the limit": (s) => s.pos === picked(s) && s.pos <= s.limit,
    "picks come only from people in the order, and none before the start": (s) =>
      s.items.every((o) => o.by === null || (s.started && s.order.includes(o.by))) && (s.started || (s.pos === 0 && s.startedAt === 0)),
    "the order has no repeats, is in the chat, and exists exactly when started": (s, ctx) =>
      new Set(s.order).size === s.order.length && s.order.every((u) => inChat(ctx, u)) && s.started === (s.order.length > 0),
    "while the draft runs, someone in the order is on turn": (s) => !s.started || isDone(s) || (turnOf(s) !== null && s.order.includes(turnOf(s)!)),
    "ids and labels are unique, at most 8 items, labels 1 to 40 characters": (s) =>
      s.items.length <= MAX_ITEMS &&
      new Set(s.items.map((o) => o.id)).size === s.items.length &&
      new Set(s.items.map((o) => o.label.toLowerCase())).size === s.items.length &&
      s.items.every((o) => o.label.length > 0 && o.label.length <= MAX_LABEL),
    "the host is in the chat": (s, ctx) => ctx.members.length === 0 || inChat(ctx, s.host),
  },

  transitions: {
    "a pick is made by whoever is on turn, takes one free item and moves one step": (p, n, a, m) => {
      if (a.t !== "pick" || p === n) return true;
      const i = p.items.findIndex((o) => o.id === a.item);
      if (i < 0 || turnOf(p) !== m.user || p.items[i]!.by !== null || isDone(p)) return false;
      return (
        n.items[i]!.by === m.user &&
        p.items.every((o, j) => j === i || JSON.stringify(o) === JSON.stringify(n.items[j])) &&
        n.pos === p.pos + 1 &&
        n.order.join() === p.order.join()
      );
    },
    "start draws the order once, from the seed, with two or more people and something to pick": (p, n, a, m, ctx) =>
      a.t !== "start" ||
      p === n ||
      (!p.started &&
        p.items.length > 0 &&
        ctx.members.length >= 2 &&
        n.started &&
        n.pos === 0 &&
        n.startedAt === m.time &&
        n.order.join() === rng(m.seed).shuffle(ctx.members.map((x) => x.id)).join()),
    "only the host can reset, and reset clears the board": (p, n, a, m) =>
      a.t !== "reset" || p === n || (m.user === p.host && !n.started && n.pos === 0 && n.order.length === 0 && n.items.every((o) => o.by === null)),
    "a reset by the host on a started or picked board clears it": (p, n, a, m, ctx) =>
      a.t !== "reset" || !inChat(ctx, m.user) || m.user !== p.host || (!p.started && p.pos === 0) || (!n.started && n.pos === 0 && n.order.length === 0),
    "add appends one free item, only before the start": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.items.at(-1);
      return !p.started && n.items.length === p.items.length + 1 && !!last && last.by === null && last.label === clean(a.label) && last.id === "i" + m.seq;
    },
    "the title and limit never change": (p, n) => p.title === n.title && p.limit === n.limit,
    "only people in the chat change the draft": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (!s.started) {
      if (r.next() < 0.3) return { t: "add", label: r.pick(["Zilker park", "  Torchy's tacos ", "", "Barton Springs", "Mozart's lights"]) };
      return { t: "start" };
    }
    if (s.items.length === 0) return { t: "reset" };
    if (isDone(s)) return r.next() < 0.5 ? { t: "reset" } : { t: "pick", item: s.items[0]!.id };
    if (r.next() < 0.05) return { t: "reset" };
    const free = s.items.filter((o) => o.by === null);
    return { t: "pick", item: r.pick(free.length ? free : s.items).id };
  },

  local: { draft: "" },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const nameOf = (id: string | null) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const spinning = state.started && ((pending && !confirmed.started) || running(confirmed.startedAt, 2000) !== null);
    const up = turnOf(state);
    const done = isDone(state);
    const myTurn = up === me && !done && !spinning;
    const cap = Math.min(state.limit, state.items.length);
    const free = state.items.filter((o) => o.by === null);
    const taken = state.items.filter((o) => o.by !== null);
    const fit = Math.max(6, Math.floor(((theme.width - 30) / 2 - 24) / 8));
    const cut = (t: string) => (t.length > fit ? `${t.slice(0, fit - 1).trimEnd()}…` : t);
    const canAdd = clean(local.draft).length > 0 && state.items.length < MAX_ITEMS;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "" });
    };
    const chip: Record<string, string | number> = {
      display: "block",
      maxWidth: "100%",
      padding: "4px 10px",
      borderRadius: theme.radius.pill,
      background: theme.color.input,
      color: theme.color.text,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    };
    const subtitle = !state.started ? `${state.items.length} things · pick ${cap}` : spinning ? "Drawing the order" : done ? "Draft done" : `${state.pos} of ${cap} picked`;

    return (
      <div>
        <CardHeader title={state.title} subtitle={subtitle} />
        {!state.started ? (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {state.items.map((o) => (
                <span key={o.id} style={chip}>
                  {o.label}
                </span>
              ))}
            </div>
            {state.items.length < MAX_ITEMS ? (
              <form
                style={{ display: "flex", gap: 8, marginTop: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add a thing" aria-label="Add a thing" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
                <Button kind="deemphasized" disabled={!canAdd} onClick={submit}>
                  Add
                </Button>
              </form>
            ) : null}
            <div style={{ minHeight: 24, margin: "8px 0 4px" }}>
              <SystemLine>Start draws the order at random</SystemLine>
            </div>
            <Button kind="primary" wide disabled={members.length < 2 || state.items.length === 0} onClick={() => dispatch({ t: "start" })}>
              Start draft
            </Button>
          </div>
        ) : spinning ? (
          <div style={{ minHeight: 60, display: "grid", alignItems: "center" }}>
            <SystemLine>Spinning the order</SystemLine>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {state.order.map((u) => {
                const isUp = u === up && !done;
                return (
                  <div key={u} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 56, minWidth: 0 }}>
                    <div style={{ display: "flex", padding: 2, borderRadius: 99, boxShadow: isUp ? `0 0 0 2px ${theme.color.primary}` : "none" }}>
                      <Avatar user={u} size={28} />
                    </div>
                    <small style={{ maxWidth: "100%", fontWeight: isUp ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(u)}</small>
                  </div>
                );
              })}
            </div>
            <div style={{ minHeight: 24, margin: "8px 0 4px" }}>
              {done ? (
                <SystemLine>Draft done</SystemLine>
              ) : myTurn ? (
                <SystemLine>Your pick · tap one below</SystemLine>
              ) : (
                <SystemLine actor={nameOf(up)}>is picking</SystemLine>
              )}
            </div>
            {done ? (
              <div style={{ display: "grid", gap: 6 }}>
                {state.order.map((u) => (
                  <div key={u} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Avatar user={u} size={24} />
                    <small style={{ flex: 1, minWidth: 0 }}>
                      {nameOf(u)} · {state.items.filter((o) => o.by === u).map((o) => o.label).join(", ") || "no picks"}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 6 }}>
                  {free.map((o) =>
                    myTurn ? (
                      <Button key={o.id} kind="deemphasized" wide onClick={() => dispatch({ t: "pick", item: o.id })}>
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{cut(o.label)}</span>
                      </Button>
                    ) : (
                      <span key={o.id} style={{ ...chip, borderRadius: theme.radius.button, textAlign: "center", padding: "6px 10px" }}>
                        {cut(o.label)}
                      </span>
                    ),
                  )}
                </div>
                {taken.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {taken.map((o) => (
                      <span key={o.id} style={{ ...chip, display: "flex", alignItems: "center", gap: 4, background: theme.color.selected }}>
                        <Avatar user={o.by ?? ""} size={20} />
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            {!state.order.includes(me) ? (
              <div style={{ marginTop: 8 }}>
                <small>You are not in this draft</small>
              </div>
            ) : null}
            {me === state.host ? (
              <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                <Button kind="secondary" onClick={() => dispatch({ t: "reset" })}>
                  Redraw
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  },
});
