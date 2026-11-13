import { defineApp, CardHeader, OptionRow } from "@muse/app";

// Study slot claim for Hillman Room B. Tap a slot to take it, tap again to drop it.

const CHAT = {
  title: "Who takes which study slot?",
  capacity: 4,
  slots: [
    { label: "Thu 6-8 PM", note: "Eli reserved", starter: "eli" },
    { label: "Thu 8-10 PM", note: "Ines called it", starter: "ines" },
    { label: "Thu 10-12 PM", note: "Too late for Tyler", starter: "" },
    { label: "Fri 1-3 PM", note: "", starter: "" },
    { label: "Fri 3-5 PM", note: "Wren takes it", starter: "wren" },
  ],
};

type Slot = { id: string; label: string; note: string; people: string[] };
type State = { title: string; capacity: number; slots: Slot[] };
type Action = { t: "claim"; slot: string };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const without = (xs: string[], user: string) => xs.filter((x) => x !== user).join();
const filled = (s: State) => s.slots.filter((x) => x.people.length > 0).length;

function claim(s: State, user: string, slot: unknown): State {
  if (typeof slot !== "string") return s;
  const target = s.slots.find((x) => x.id === slot);
  if (!target) return s;
  const has = target.people.includes(user);
  if (!has && target.people.length >= s.capacity) return s;
  return {
    ...s,
    slots: s.slots.map((x) =>
      x.id !== target.id ? x : { ...x, people: has ? x.people.filter((p) => p !== user) : [...x.people, user] },
    ),
  };
}

export default defineApp<State, Action, Local>({
  name: "Slot claim",
  summary: (s) => `${s.title} ${filled(s)} of ${s.slots.length} slots have someone.`,

  init: (ctx) => ({
    title: CHAT.title,
    capacity: CHAT.capacity,
    slots: CHAT.slots.map((x, i) => {
      const who = x.starter ? ctx.members.find((m) => m.name.toLowerCase() === x.starter) : undefined;
      return { id: `s${i}`, label: x.label, note: x.note, people: who ? [who.id] : [] };
    }),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "claim") return claim(state, meta.user, action.slot);
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.slots.every((x) => x.people.every((p) => inChat(ctx, p)))) return state;
    return { ...state, slots: state.slots.map((x) => ({ ...x, people: x.people.filter((p) => inChat(ctx, p)) })) };
  },

  invariants: {
    "no slot has more people than the room seats": (s) => s.slots.every((x) => x.people.length <= s.capacity),
    "no one is in a slot twice": (s) => s.slots.every((x) => new Set(x.people).size === x.people.length),
    "everyone in a slot is in the chat": (s, ctx) => s.slots.every((x) => x.people.every((p) => inChat(ctx, p))),
    "slot ids are unique and the slots never change in number": (s) =>
      s.slots.length === CHAT.slots.length && new Set(s.slots.map((x) => x.id)).size === s.slots.length,
    "capacity is a positive whole number": (s) => Number.isInteger(s.capacity) && s.capacity > 0,
  },

  transitions: {
    "a claim flips only the actor on the named slot and touches no one else": (p, n, a, m) =>
      a.t !== "claim" ||
      p === n ||
      (typeof a.slot === "string" &&
        p.slots.length === n.slots.length &&
        p.slots.every((x, i) => {
          const y = n.slots[i]!;
          return x.id === a.slot
            ? x.people.includes(m.user) !== y.people.includes(m.user) && without(x.people, m.user) === without(y.people, m.user)
            : x.people.join() === y.people.join();
        })),
    "a claim adds the actor only when the slot had room": (p, n, a, m) =>
      a.t !== "claim" ||
      p === n ||
      p.slots.every((x, i) => x.id !== a.slot || !n.slots[i]!.people.includes(m.user) || x.people.includes(m.user) || x.people.length < p.capacity),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "labels, notes, ids and capacity never change": (p, n) =>
      p.capacity === n.capacity &&
      p.title === n.title &&
      p.slots.length === n.slots.length &&
      p.slots.every((x, i) => x.id === n.slots[i]!.id && x.label === n.slots[i]!.label && x.note === n.slots[i]!.note),
  },

  arbitrary: (s, _user, r) => {
    if (r.next() < 0.1) return { t: "claim", slot: "nope" };
    return { t: "claim", slot: r.pick(s.slots).id };
  },

  local: {},

  view: ({ state, me, dispatch }) => (
    <div>
      <CardHeader title={state.title} subtitle={`${filled(state)} of ${state.slots.length} slots have someone`} />
      <div style={{ display: "grid", gap: 2 }}>
        {state.slots.map((x) => (
          <div key={x.id}>
            <OptionRow
              label={x.label}
              count={x.people.length}
              total={state.capacity}
              voters={x.people}
              selected={x.people.includes(me)}
              onClick={() => dispatch({ t: "claim", slot: x.id })}
            />
            {x.note ? (
              <small style={{ display: "block", paddingLeft: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {x.note}
              </small>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  ),
});
