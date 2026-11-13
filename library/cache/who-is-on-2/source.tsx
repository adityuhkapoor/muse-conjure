import { defineApp, Button, CardHeader, Avatar } from "@muse/app";

// Who is free tonight. Everyone sets the hours they are free; the card shows the window
// where everyone who answered is free.

const CHAT = {
  title: "Who's free tonight?",
  note: "Thinking of ordering Thai",
  start: 1020, // 5:00 pm, minutes since midnight
  end: 1410, // 11:30 pm, end of the last slot
  step: 30,
  // What people already said in the chat. Matched to members by name.
  people: [
    { name: "Nora", from: 1020, to: 1410 },
    { name: "Gabe", from: 1140, to: 1260 },
    { name: "Lena", from: 1125, to: 1410 },
    { name: "Sam", from: 1200, to: 1320 },
    { name: "Bryan", from: 1170, to: 1410 },
  ],
};

const START = CHAT.start;
const END = CHAT.end;
const STEP = CHAT.step;

type State = { slots: number[]; free: Record<string, number[]>; note: string };
type Action = { t: "toggle"; slot: number } | { t: "set"; from: number; to: number } | { t: "clear" };
type Local = { open: boolean; from: number; to: number };

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);

const fmt = (min: number) => {
  const h = Math.floor(min / 60);
  const mm = min % 60;
  return `${h % 12 || 12}:${mm < 10 ? "0" : ""}${mm} ${h >= 12 ? "pm" : "am"}`;
};

const withList = (s: State, user: string, list: number[]): State => {
  const free: Record<string, number[]> = {};
  for (const k of Object.keys(s.free)) if (k !== user) free[k] = s.free[k]!;
  if (list.length) free[user] = list;
  return { ...s, free };
};

const answeredIds = (s: State, members: { id: string }[]) => members.filter((m) => (s.free[m.id]?.length ?? 0) > 0).map((m) => m.id);

const commonSlots = (s: State, ids: string[]) => (ids.length === 0 ? [] : s.slots.filter((x) => ids.every((id) => (s.free[id] ?? []).includes(x))));

/** Longest run of consecutive common slots, as a start and an end time. */
const bestWindow = (s: State, ids: string[]): { from: number; to: number } | null => {
  const common = commonSlots(s, ids);
  let best: { from: number; to: number } | null = null;
  let cur: { from: number; to: number } | null = null;
  for (const x of common) {
    if (cur && x === cur.to) cur = { from: cur.from, to: x + STEP };
    else cur = { from: x, to: x + STEP };
    if (!best || cur.to - cur.from > best.to - best.from) best = cur;
  }
  return best;
};

const othersSame = (p: State, n: State, user: string) =>
  [...Object.keys(p.free), ...Object.keys(n.free)].every((k) => k === user || (p.free[k] ?? []).join() === (n.free[k] ?? []).join());

const validSet = (s: State, a: { from: unknown; to: unknown }) =>
  typeof a.from === "number" &&
  typeof a.to === "number" &&
  Number.isInteger(a.from) &&
  Number.isInteger(a.to) &&
  s.slots.includes(a.from) &&
  (s.slots.includes(a.to) || a.to === END) &&
  a.from < a.to;

export default defineApp<State, Action, Local>({
  name: "Free tonight",
  summary: (s, ctx) => {
    const ids = answeredIds(s, ctx.members);
    if (ids.length === 0) return `${CHAT.title} No one has answered yet.`;
    const w = bestWindow(s, ids);
    if (!w) return `${CHAT.title} ${ids.length} answered, no shared time yet.`;
    return `${CHAT.title} Everyone free ${fmt(w.from)} to ${fmt(w.to)}.`;
  },

  init: (ctx) => {
    const slots = Array.from({ length: (END - START) / STEP }, (_, i) => START + i * STEP);
    const free: Record<string, number[]> = {};
    for (const p of CHAT.people) {
      const m = ctx.members.find((x) => x.name.trim().toLowerCase() === p.name.toLowerCase());
      if (!m) continue;
      const list = slots.filter((x) => x >= p.from && x + STEP <= p.to);
      if (list.length) free[m.id] = list;
    }
    return { slots, free, note: CHAT.note };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    const cur = state.free[meta.user] ?? [];
    if (action.t === "toggle") {
      if (typeof action.slot !== "number" || !state.slots.includes(action.slot)) return state;
      const slot = action.slot;
      const next = cur.includes(slot) ? cur.filter((x) => x !== slot) : [...cur, slot].sort((a, b) => a - b);
      return withList(state, meta.user, next);
    }
    if (action.t === "set") {
      const { from, to } = action;
      if (typeof from !== "number" || typeof to !== "number" || !Number.isInteger(from) || !Number.isInteger(to)) return state;
      if (!state.slots.includes(from) || !(state.slots.includes(to) || to === END) || from >= to) return state;
      const list = state.slots.filter((x) => x >= from && x < to);
      if (list.join() === cur.join()) return state;
      return withList(state, meta.user, list);
    }
    if (action.t === "clear") {
      if (state.free[meta.user] === undefined) return state;
      return withList(state, meta.user, []);
    }
    return state;
  },

  onMembers: (state, ctx) => {
    if (Object.keys(state.free).every((k) => inChat(ctx, k))) return state;
    const free: Record<string, number[]> = {};
    for (const k of Object.keys(state.free)) if (inChat(ctx, k)) free[k] = state.free[k]!;
    return { ...state, free };
  },

  invariants: {
    "each list is sorted, has no repeats and uses only real slots": (s) =>
      Object.keys(s.free).every((k) => s.free[k]!.every((x, i, xs) => s.slots.includes(x) && (i === 0 || x > xs[i - 1]!))),
    "everyone with an entry is in the chat": (s, ctx) => Object.keys(s.free).every((k) => inChat(ctx, k)),
    "the slots are 13 half hours from 5:00 pm": (s) => s.slots.length === 13 && s.slots.every((x, i) => x === START + i * STEP),
    "no one keeps an empty list": (s) => Object.keys(s.free).every((k) => s.free[k]!.length > 0),
  },

  transitions: {
    "a toggle flips that slot for the actor and leaves everyone else as they were": (p, n, a, m) =>
      a.t !== "toggle" ||
      p === n ||
      ((p.free[m.user] ?? []).includes(a.slot) !== (n.free[m.user] ?? []).includes(a.slot) && othersSame(p, n, m.user)),
    "a set makes the actor's list the slots from start up to the end time": (p, n, a, m) =>
      a.t !== "set" ||
      p === n ||
      ((n.free[m.user] ?? []).join() === p.slots.filter((x) => x >= a.from && x < a.to).join() && othersSame(p, n, m.user)),
    "a set with a bad range changes nothing, a good one from a member is applied": (p, n, a, m, ctx) =>
      a.t !== "set" ||
      (!validSet(p, a)
        ? p === n
        : !inChat(ctx, m.user) || (n.free[m.user] ?? []).join() === p.slots.filter((x) => x >= a.from && x < a.to).join()),
    "a clear removes only the actor's entry": (p, n, a, m) =>
      a.t !== "clear" || p === n || (p.free[m.user] !== undefined && n.free[m.user] === undefined && othersSame(p, n, m.user)),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the slots and the note never change": (p, n) => p.slots.join() === n.slots.join() && p.note === n.note,
  },

  arbitrary: (s, _user, r) => {
    const k = r.next();
    if (k < 0.4) return { t: "toggle", slot: r.pick(s.slots) };
    if (k < 0.75) return { t: "set", from: r.pick(s.slots), to: r.pick([...s.slots.slice(1), END]) };
    if (k < 0.88) return { t: "clear" };
    if (k < 0.94) return { t: "toggle", slot: 1 };
    return { t: "set", from: 5, to: END };
  },

  local: { open: false, from: 1140, to: 1260 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const ids = answeredIds(state, members);
    const win = bestWindow(state, ids);
    const common = commonSlots(state, ids);
    const mine = state.free[me] ?? [];
    const first = state.slots[0] ?? START;

    const openEditor = () => {
      if (mine.length) setLocal({ open: true, from: mine[0]!, to: mine[mine.length - 1]! + STEP });
      else setLocal({ open: true });
    };
    const save = () => {
      dispatch({ t: "set", from: local.from, to: local.to });
      setLocal({ open: false });
    };

    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={state.note} />
        <div style={{ display: "grid", gap: 4 }}>
          {members.map((m) => {
            const list = state.free[m.id] ?? [];
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 24 }}>
                <Avatar user={m} size={20} />
                <small style={{ width: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.id === me ? "You" : m.name}</small>
                {list.length === 0 ? (
                  <small style={{ color: theme.color.secondaryText }}>No answer</small>
                ) : (
                  <div style={{ display: "flex", gap: 2, flex: 1 }}>
                    {state.slots.map((x) => (
                      <div
                        key={x}
                        style={{
                          flex: 1,
                          height: 16,
                          borderRadius: 3,
                          background: common.includes(x) ? theme.color.primary : list.includes(x) ? theme.color.positive : theme.color.track,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 84, marginTop: 2 }}>
          <small>{fmt(first)}</small>
          <small>{fmt(END)}</small>
        </div>
        <div style={{ margin: "8px 0", minHeight: 40 }}>
          {ids.length === 0 ? (
            <div style={{ fontWeight: 600 }}>No one has answered yet</div>
          ) : win ? (
            <div style={{ fontWeight: 600 }}>{`Everyone free ${fmt(win.from)} to ${fmt(win.to)}`}</div>
          ) : (
            <div style={{ fontWeight: 600 }}>No shared time yet</div>
          )}
          <small>{`${ids.length} of ${members.length} answered`}</small>
        </div>
        {local.open ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{`From ${fmt(local.from)}`}</span>
              <Button disabled={local.from - STEP < START} onClick={() => setLocal({ from: local.from - STEP })}>
                Earlier
              </Button>
              <Button disabled={local.from + STEP >= local.to} onClick={() => setLocal({ from: local.from + STEP })}>
                Later
              </Button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{`Until ${fmt(local.to)}`}</span>
              <Button disabled={local.to - STEP <= local.from} onClick={() => setLocal({ to: local.to - STEP })}>
                Earlier
              </Button>
              <Button disabled={local.to + STEP > END} onClick={() => setLocal({ to: local.to + STEP })}>
                Later
              </Button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <Button kind="primary" onClick={save}>
                Save
              </Button>
              <Button kind="deemphasized" onClick={() => setLocal({ open: false })}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button kind="primary" onClick={openEditor}>
              Set hours
            </Button>
            <Button onClick={() => dispatch({ t: "set", from: START, to: END })}>All evening</Button>
            <Button kind="deemphasized" disabled={mine.length === 0} onClick={() => dispatch({ t: "clear" })}>
              Clear
            </Button>
          </div>
        )}
      </div>
    );
  },
});
