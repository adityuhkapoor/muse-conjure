import { defineApp, Avatar, Button, CardHeader, Facepile, Progress, Toast } from "@muse/app";

// Claim list: a bring list, a chore list, a packing list. Each item needs some number of people;
// you tap to take it or let it go. With checkable, the person who took an item can mark it done.

type Params = {
  /** Card title: "What's everyone bringing?" or "Chores this week" */
  title: string;
  /** Items from the chat. need = how many people it takes (usually 1). */
  items: { label: string; need: number }[];
  /** Most items one person can take; 0 means no limit. */
  perPerson: number;
  /** true: anyone can add an item. */
  allowAdd: boolean;
  /** true: items can be marked done (chores, errands). false for a bring list. */
  checkable: boolean;
};

// @params
const P: Params = {
  title: "What's everyone bringing?",
  items: [
    { label: "Chips and salsa", need: 1 },
    { label: "Drinks", need: 2 },
    { label: "Speaker", need: 1 },
    { label: "Plates and cups", need: 1 },
  ],
  perPerson: 0,
  allowAdd: true,
  checkable: false,
};
// @end params

type Item = { id: string; label: string; need: number; takers: string[]; done: boolean };
type State = { title: string; perPerson: number; allowAdd: boolean; checkable: boolean; items: Item[] };
type Action = { t: "take"; item: string } | { t: "done"; item: string } | { t: "add"; label: string };
type Local = { draft: string; toast: number };

const MAX_ITEMS = 12;
const MAX_LABEL = 40;
const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const takenBy = (s: State, user: string) => s.items.filter((i) => i.takers.includes(user)).length;
const itemOf = (s: State, id: unknown) => s.items.find((i) => i.id === id);
/** Same items in the same order; every other item is exactly as it was. */
const onlyItem = (p: State, n: State, id: string) => p.items.length === n.items.length && p.items.every((x, i) => x.id === id || n.items[i] === x || JSON.stringify(n.items[i]) === JSON.stringify(x));

function take(s: State, user: string, id: unknown): State {
  const item = itemOf(s, id);
  if (!item) return s;
  const had = item.takers.includes(user);
  if (!had && (item.takers.length >= item.need || (s.perPerson > 0 && takenBy(s, user) >= s.perPerson))) return s;
  if (had && item.done) return s; // finished work stays credited
  const takers = had ? item.takers.filter((u) => u !== user) : [...item.takers, user];
  return { ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, takers } : i)) };
}

function done(s: State, user: string, id: unknown): State {
  const item = itemOf(s, id);
  if (!s.checkable || !item || !item.takers.includes(user)) return s;
  return { ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) };
}

function add(s: State, raw: unknown, seq: number): State {
  if (!s.allowAdd || typeof raw !== "string") return s;
  const label = clean(raw);
  if (!label || label.length > MAX_LABEL || s.items.length >= MAX_ITEMS) return s;
  if (s.items.some((i) => i.label.toLowerCase() === label.toLowerCase())) return s;
  return { ...s, items: [...s.items, { id: `i${seq}`, label, need: 1, takers: [], done: false }] };
}

export default defineApp<State, Action, Local>({
  name: "Claim list",
  summary: (s) => {
    const open = s.items.filter((i) => i.takers.length < i.need).length;
    return open ? `${s.title} ${open} of ${s.items.length} still open.` : `${s.title} Everything is covered.`;
  },

  init: () => {
    const seen = new Set<string>();
    const items: Item[] = [];
    for (const raw of P.items) {
      const label = clean(raw.label).slice(0, MAX_LABEL);
      if (!label || seen.has(label.toLowerCase()) || items.length >= MAX_ITEMS) continue;
      seen.add(label.toLowerCase());
      items.push({ id: `p${items.length}`, label, need: Math.max(1, Math.min(10, Math.floor(raw.need) || 1)), takers: [], done: false });
    }
    return { title: clean(P.title).slice(0, 60) || "Claim list", perPerson: Math.max(0, Math.floor(P.perPerson)), allowAdd: P.allowAdd || items.length === 0, checkable: P.checkable, items };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "take") return take(state, meta.user, action.item);
    if (action.t === "done") return done(state, meta.user, action.item);
    if (action.t === "add") return add(state, action.label, meta.seq);
    return state;
  },

  // Someone left: their claims open up again, and an item nobody holds any more is not done.
  onMembers: (state, ctx) => {
    if (state.items.every((i) => i.takers.every((u) => inChat(ctx, u)))) return state;
    return {
      ...state,
      items: state.items.map((i) => {
        const takers = i.takers.filter((u) => inChat(ctx, u));
        return takers.length === i.takers.length ? i : { ...i, takers, done: i.done && takers.length > 0 };
      }),
    };
  },

  invariants: {
    "no item has more takers than it needs": (s) => s.items.every((i) => i.takers.length <= i.need),
    "no one takes an item twice": (s) => s.items.every((i) => new Set(i.takers).size === i.takers.length),
    "no one goes over the per-person limit": (s, ctx) => s.perPerson === 0 || ctx.members.every((m) => takenBy(s, m.id) <= s.perPerson),
    "done items have someone on them": (s) => s.items.every((i) => !i.done || (s.checkable && i.takers.length > 0)),
    "takers are in the chat": (s, ctx) => s.items.every((i) => i.takers.every((u) => inChat(ctx, u))),
    "items are unique and short": (s) =>
      s.items.length <= MAX_ITEMS &&
      new Set(s.items.map((i) => i.label.toLowerCase())).size === s.items.length &&
      new Set(s.items.map((i) => i.id)).size === s.items.length &&
      s.items.every((i) => i.label.length > 0 && i.label.length <= MAX_LABEL && i.need >= 1),
  },

  transitions: {
    "a take or a drop changes the actor on that item and nothing else": (p, n, a, m) => {
      if (a.t !== "take" || p === n) return true;
      const before = itemOf(p, a.item);
      const after = itemOf(n, a.item);
      if (!before || !after || !onlyItem(p, n, before.id)) return false;
      const flipped = before.takers.includes(m.user) !== after.takers.includes(m.user);
      const rest = (x: Item) => x.takers.filter((u) => u !== m.user).join();
      return flipped && rest(before) === rest(after) && before.done === after.done;
    },
    "taking stays inside the item's size and the per-person limit": (p, n, a, m) => {
      if (a.t !== "take" || p === n || !itemOf(n, a.item)?.takers.includes(m.user)) return true;
      return itemOf(p, a.item)!.takers.length < itemOf(p, a.item)!.need && (p.perPerson === 0 || takenBy(p, m.user) < p.perPerson);
    },
    "dropping a finished item is not allowed": (p, n, a, m) => a.t !== "take" || p === n || !itemOf(p, a.item)?.done || !!itemOf(n, a.item)?.takers.includes(m.user),
    "only someone on an item marks it done or undone": (p, n, a, m) => {
      if (a.t !== "done" || p === n) return true;
      const before = itemOf(p, a.item);
      const after = itemOf(n, a.item);
      return !!before && !!after && p.checkable && before.takers.includes(m.user) && before.done !== after.done && onlyItem(p, n, before.id);
    },
    "an added item goes last, with one open place": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.items.at(-1);
      return p.allowAdd && n.items.length === p.items.length + 1 && last?.label === clean(a.label) && last.id === `i${m.seq}` && last.need === 1 && last.takers.length === 0 && !last.done;
    },
    "only people in the chat change the list": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (s.allowAdd && (k < 0.15 || s.items.length === 0)) return { t: "add", label: r.pick(["Ice", "Napkins", " cups ", "", "Speaker", "Grill"]) };
    if (!s.items.length) return null;
    const mine = s.items.filter((i) => i.takers.includes(user));
    if (s.checkable && mine.length && k < 0.35) return { t: "done", item: r.pick(mine).id };
    return { t: "take", item: r.pick(s.items).id };
  },

  local: { draft: "", toast: 0 },

  view: ({ state, me, dispatch, local, setLocal }) => {
    const { draft, toast } = local;
    const covered = state.items.filter((i) => i.takers.length >= i.need).length;
    const doneCount = state.items.filter((i) => i.done).length;
    const atLimit = state.perPerson > 0 && takenBy(state, me) >= state.perPerson;
    const submit = () => {
      if (!clean(draft)) return;
      dispatch({ t: "add", label: draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "", toast: toast + 1 });
    };
    return (
      <div>
        <CardHeader title={state.title} subtitle={state.checkable ? `${doneCount} of ${state.items.length} done` : `${covered} of ${state.items.length} covered`} />
        <Progress value={state.checkable ? doneCount : covered} max={Math.max(1, state.items.length)} />
        <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
          {state.items.map((i) => {
            const mine = i.takers.includes(me);
            const full = i.takers.length >= i.need;
            return (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, textDecoration: i.done ? "line-through" : "none" }}>{i.label}</div>
                  <small>{i.need > 1 ? `${i.takers.length} of ${i.need}` : i.takers.length ? "Taken" : "Open"}</small>
                </div>
                {i.need > 1 ? <Facepile users={i.takers} max={3} size={20} /> : i.takers[0] ? <Avatar user={i.takers[0]} size={24} /> : null}
                {mine && state.checkable ? (
                  <Button kind={i.done ? "secondary" : "primary"} onClick={() => dispatch({ t: "done", item: i.id })}>
                    {i.done ? "Undo" : "Done"}
                  </Button>
                ) : null}
                {mine && !i.done ? (
                  <Button kind="secondary" onClick={() => dispatch({ t: "take", item: i.id })}>
                    Drop
                  </Button>
                ) : !mine && !full ? (
                  <Button kind="deemphasized" disabled={atLimit} onClick={() => dispatch({ t: "take", item: i.id })}>
                    Take
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        {state.allowAdd && state.items.length < MAX_ITEMS ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input value={draft} maxLength={MAX_LABEL} placeholder="Add item" aria-label="Add item" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
            <Button kind="deemphasized" disabled={!clean(draft)} onClick={submit}>
              Add
            </Button>
          </form>
        ) : null}
        {toast ? <Toast key={toast}>Item added</Toast> : null}
      </div>
    );
  },
});
