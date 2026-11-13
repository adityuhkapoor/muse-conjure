import { defineApp, Avatar, Button, CardHeader, Progress, Toast } from "@muse/app";

// Who is bringing or doing each item for Maya's birthday dinner, and what is still open.

const C = {
  title: "Who's bringing what?",
  items: [
    { label: "Pasta", note: "At Maya's place", owner: "Maya", done: false },
    { label: "Tiramisu", note: "Made Saturday", owner: "Sam", done: false },
    { label: "Cake", note: "Ordered from the bakery on 5th", owner: "Noor", done: false },
    { label: "Cake pickup", note: "Sunday at noon", owner: "", done: false },
    { label: "Wine", note: "One red, one white · buying Friday", owner: "Paige", done: false },
    { label: "Salad and garlic bread", note: "", owner: "Lily", done: false },
    { label: "Candles", note: "", owner: "Hugo", done: false },
    { label: "Balloons", note: "", owner: "Hugo", done: true },
    { label: "Playlist", note: "", owner: "Abby", done: true },
    { label: "Board games", note: "", owner: "Abby", done: false },
    { label: "Sparkling water and soda", note: "", owner: "Lily", done: false },
    { label: "Ice", note: "Nobody has confirmed", owner: "", done: false },
    { label: "Come early to cook", note: "At 4", owner: "Ines", done: false },
  ],
};

type Item = { id: string; label: string; note: string; owner: string | null; done: boolean };
type State = { title: string; items: Item[] };
type Action =
  | { t: "claim"; item: string }
  | { t: "release"; item: string }
  | { t: "done"; item: string }
  | { t: "add"; label: string };
type Local = { draft: string; toast: number; open: boolean; all: boolean };

const MAX_ITEMS = 16;
const MAX_LABEL = 40;
const SHOWN_OPEN = 2;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const itemOf = (s: State, id: unknown) => s.items.find((i) => i.id === id);
const onlyItem = (p: State, n: State, id: string) =>
  p.items.length === n.items.length &&
  p.items.every((x, i) => (x.id === id ? n.items[i]!.id === id : JSON.stringify(n.items[i]) === JSON.stringify(x)));

function change(s: State, id: string, f: (i: Item) => Item): State {
  return { ...s, items: s.items.map((i) => (i.id === id ? f(i) : i)) };
}

export default defineApp<State, Action, Local>({
  name: "Dinner tasks",
  summary: (s) => {
    const open = s.items.filter((i) => i.owner === null).length;
    return open ? `${s.title} ${s.items.length - open} of ${s.items.length} covered · ${open} open` : `${s.title} Everything is covered`;
  },

  init: (ctx) => ({
    title: C.title,
    items: C.items.map((it, idx) => {
      const found = it.owner
        ? ctx.members.find((m) => m.name.trim().split(/\s+/)[0]!.toLowerCase() === it.owner.toLowerCase())
        : undefined;
      return { id: `p${idx}`, label: it.label, note: it.note, owner: found ? found.id : null, done: it.done && !!found };
    }),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "claim") {
      const item = itemOf(state, action.item);
      if (!item || item.owner !== null) return state;
      return change(state, item.id, (i) => ({ ...i, owner: meta.user }));
    }
    if (action.t === "release") {
      const item = itemOf(state, action.item);
      if (!item || item.owner !== meta.user) return state;
      return change(state, item.id, (i) => ({ ...i, owner: null, done: false }));
    }
    if (action.t === "done") {
      const item = itemOf(state, action.item);
      if (!item || item.owner !== meta.user) return state;
      return change(state, item.id, (i) => ({ ...i, done: !i.done }));
    }
    if (action.t === "add") {
      if (typeof action.label !== "string") return state;
      const label = clean(action.label);
      if (!label || label.length > MAX_LABEL || state.items.length >= MAX_ITEMS) return state;
      if (state.items.some((i) => i.label.toLowerCase() === label.toLowerCase())) return state;
      return { ...state, items: [...state.items, { id: `i${meta.seq}`, label, note: "", owner: null, done: false }] };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.items.every((i) => i.owner === null || inChat(ctx, i.owner))) return state;
    return {
      ...state,
      items: state.items.map((i) => (i.owner === null || inChat(ctx, i.owner) ? i : { ...i, owner: null, done: false })),
    };
  },

  invariants: {
    "every owner is in the chat": (s, ctx) => s.items.every((i) => i.owner === null || inChat(ctx, i.owner)),
    "a done item has an owner": (s) => s.items.every((i) => !i.done || i.owner !== null),
    "ids and labels are unique": (s) =>
      new Set(s.items.map((i) => i.id)).size === s.items.length &&
      new Set(s.items.map((i) => i.label.toLowerCase())).size === s.items.length,
    "at most 16 items, labels 1 to 40 characters and trimmed": (s) =>
      s.items.length <= MAX_ITEMS && s.items.every((i) => i.label.length > 0 && i.label.length <= MAX_LABEL && i.label === clean(i.label)),
  },

  transitions: {
    "a claim gives an open item to the actor and changes nothing else": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const before = itemOf(p, a.item);
      const after = itemOf(n, a.item);
      return !!before && !!after && before.owner === null && after.owner === m.user && after.done === false && after.label === before.label && onlyItem(p, n, before.id);
    },
    "a release frees the actor's own item and clears done": (p, n, a, m) => {
      if (a.t !== "release" || p === n) return true;
      const before = itemOf(p, a.item);
      const after = itemOf(n, a.item);
      return !!before && !!after && before.owner === m.user && after.owner === null && !after.done && after.label === before.label && onlyItem(p, n, before.id);
    },
    "done flips only the owner's own flag and keeps the owner": (p, n, a, m) => {
      if (a.t !== "done" || p === n) return true;
      const before = itemOf(p, a.item);
      const after = itemOf(n, a.item);
      return !!before && !!after && before.owner === m.user && after.owner === before.owner && after.done !== before.done && onlyItem(p, n, before.id);
    },
    "an add appends one open item last with the trimmed label": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.items.at(-1);
      return (
        typeof a.label === "string" &&
        n.items.length === p.items.length + 1 &&
        !!last &&
        last.label === clean(a.label) &&
        last.id === `i${m.seq}` &&
        last.owner === null &&
        !last.done &&
        p.items.every((x, i) => JSON.stringify(n.items[i]) === JSON.stringify(x))
      );
    },
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (s.items.length === 0 || k < 0.12) return { t: "add", label: r.pick(["Napkins", "Plates", " cups ", "", "Ice", "Speaker"]) };
    const mine = s.items.filter((i) => i.owner === user);
    if (mine.length && k < 0.4) return r.next() < 0.7 ? { t: "done", item: r.pick(mine).id } : { t: "release", item: r.pick(mine).id };
    const open = s.items.filter((i) => i.owner === null);
    if (open.length && k < 0.85) return { t: "claim", item: r.pick(open).id };
    return { t: "claim", item: r.pick(s.items).id };
  },

  local: { draft: "", toast: 0, open: false, all: false },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const open = state.items.filter((i) => i.owner === null);
    const mine = state.items.filter((i) => i.owner === me);
    const others = state.items.filter((i) => i.owner !== null && i.owner !== me);
    const covered = state.items.length - open.length;
    const doneCount = state.items.filter((i) => i.done).length;
    const canAdd = clean(local.draft).length > 0;
    const shownOpen = local.all ? open : open.slice(0, SHOWN_OPEN);
    const hiddenOpen = open.length - shownOpen.length;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "", toast: local.toast + 1 });
    };
    const rowStyle = { display: "flex", alignItems: "center", gap: 8, minHeight: 44 } as const;
    const textStyle = { flex: 1, minWidth: 0 } as const;

    return (
      <div>
        <CardHeader title={state.title} subtitle={open.length ? `${covered} of ${state.items.length} covered · ${open.length} open` : "Everything is covered"} />
        <Progress value={covered} max={Math.max(1, state.items.length)} label={`${doneCount} done · ${covered} covered`} />
        <div style={{ display: "grid", gap: 2, marginTop: 8 }}>
          {shownOpen.map((i) => (
            <div key={i.id} style={rowStyle}>
              <div style={textStyle}>
                <div style={{ fontWeight: 600 }}>{i.label}</div>
                <small>{i.note ? `Open · ${i.note}` : "Open"}</small>
              </div>
              <Button kind="secondary" onClick={() => dispatch({ t: "claim", item: i.id })}>
                Take
              </Button>
            </div>
          ))}
          {mine.map((i) => (
            <div key={i.id} style={rowStyle}>
              <div style={textStyle}>
                <div style={{ fontWeight: 600, textDecoration: i.done ? "line-through" : "none" }}>{i.label}</div>
                <small>{i.done ? "Yours · done" : i.note ? `Yours · ${i.note}` : "Yours"}</small>
              </div>
              <Button kind="secondary" onClick={() => dispatch({ t: "done", item: i.id })}>
                {i.done ? "Undo" : "Done"}
              </Button>
              <Button kind="deemphasized" onClick={() => dispatch({ t: "release", item: i.id })}>
                Release
              </Button>
            </div>
          ))}
        </div>
        {hiddenOpen > 0 || local.all || others.length ? (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {hiddenOpen > 0 || (local.all && open.length > SHOWN_OPEN) ? (
              <Button kind="deemphasized" wide onClick={() => setLocal({ all: !local.all })}>
                {local.all ? "Fewer open" : `More open · ${hiddenOpen}`}
              </Button>
            ) : null}
            {others.length ? (
              <Button kind="deemphasized" wide onClick={() => setLocal({ open: !local.open })}>
                {local.open ? "Hide others" : `Others · ${others.length}`}
              </Button>
            ) : null}
          </div>
        ) : null}
        {local.open
          ? others.map((i) => (
              <div key={i.id} style={rowStyle}>
                <Avatar user={i.owner ?? ""} size={24} />
                <div style={textStyle}>
                  <div style={{ fontWeight: 600, textDecoration: i.done ? "line-through" : "none" }}>{i.label}</div>
                  <small>{`${nameOf(i.owner ?? "")}${i.done ? " · done" : i.note ? ` · ${i.note}` : ""}`}</small>
                </div>
              </div>
            ))
          : null}
        {state.items.length < MAX_ITEMS ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add item" aria-label="Add item" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
            <Button kind="deemphasized" disabled={!canAdd} onClick={submit}>
              Add
            </Button>
          </form>
        ) : null}
        {local.toast ? <Toast key={local.toast}>Item added</Toast> : null}
      </div>
    );
  },
});
