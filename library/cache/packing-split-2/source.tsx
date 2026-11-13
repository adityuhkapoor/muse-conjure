import { defineApp, Avatar, Button, CardHeader, Toast } from "@muse/app";

// Gear claim for the Austin road trip. Tap an open item to bring it, tap your own to let it go.

const G = {
  title: "Who brings what to Austin?",
  items: [
    { label: "Speaker", note: "UE Boom", who: "Omar" },
    { label: "Aux and charger", note: "3-port car charger", who: "Felix" },
    { label: "Food cooler", note: "Blue Igloo", who: "Theo" },
    { label: "Drinks cooler", note: "Smaller one", who: "June" },
    { label: "4 person tent", note: "Theo's brother's", who: "Theo" },
    { label: "2 person tent", note: "REI", who: "Felix" },
    { label: "Uno and cards", note: "", who: "June" },
    { label: "Sleeping bags", note: "2 extras, need 1 more", who: "Nora" },
  ],
};

type Item = { id: string; label: string; note: string; owner: string | null };
type State = { title: string; items: Item[]; at: number };
type Action = { t: "claim"; item: string } | { t: "release"; item: string } | { t: "add"; label: string };
type Local = { draft: string; toast: number };

const MAX_ITEMS = 12;
const MAX_LABEL = 40;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const itemOf = (s: State, id: unknown) => s.items.find((i) => i.id === id);
const same = (a: Item, b: Item | undefined) => !!b && JSON.stringify(a) === JSON.stringify(b);
/** Every item except `id` is exactly as it was, in the same order. */
const othersSame = (p: State, n: State, id: unknown) =>
  p.items.length === n.items.length && p.items.every((x, i) => x.id === id || same(x, n.items[i]));

export default defineApp<State, Action, Local>({
  name: "Gear claim",
  summary: (s) => {
    const claimed = s.items.filter((i) => i.owner !== null).length;
    return `${s.title} ${claimed} of ${s.items.length} claimed.`;
  },

  init: (ctx) => {
    const byName = (name: string) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null;
    return {
      title: G.title,
      at: 0,
      items: G.items.slice(0, MAX_ITEMS).map((g, i) => ({ id: `p${i}`, label: g.label, note: g.note, owner: byName(g.who) })),
    };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "claim") {
      if (typeof action.item !== "string") return state;
      const it = itemOf(state, action.item);
      if (!it || it.owner !== null) return state;
      return { ...state, at: meta.time, items: state.items.map((i) => (i.id === it.id ? { ...i, owner: meta.user } : i)) };
    }
    if (action.t === "release") {
      if (typeof action.item !== "string") return state;
      const it = itemOf(state, action.item);
      if (!it || it.owner !== meta.user) return state;
      return { ...state, at: meta.time, items: state.items.map((i) => (i.id === it.id ? { ...i, owner: null } : i)) };
    }
    if (action.t === "add") {
      if (typeof action.label !== "string") return state;
      const label = clean(action.label);
      if (!label || label.length > MAX_LABEL || state.items.length >= MAX_ITEMS) return state;
      if (state.items.some((i) => i.label.toLowerCase() === label.toLowerCase())) return state;
      return { ...state, at: meta.time, items: [...state.items, { id: `i${meta.seq}`, label, note: "", owner: null }] };
    }
    return state;
  },

  // Someone left: what they were bringing is open again.
  onMembers: (state, ctx) => {
    if (state.items.every((i) => i.owner === null || inChat(ctx, i.owner))) return state;
    return { ...state, items: state.items.map((i) => (i.owner !== null && !inChat(ctx, i.owner) ? { ...i, owner: null } : i)) };
  },

  invariants: {
    "every owner is open or in the chat": (s, ctx) => s.items.every((i) => i.owner === null || inChat(ctx, i.owner)),
    "ids are unique and labels are unique ignoring case": (s) =>
      new Set(s.items.map((i) => i.id)).size === s.items.length && new Set(s.items.map((i) => i.label.toLowerCase())).size === s.items.length,
    "at most 12 items, each label 1 to 40 characters and tidy": (s) =>
      s.items.length <= MAX_ITEMS && s.items.every((i) => i.label.length > 0 && i.label.length <= MAX_LABEL && i.label === clean(i.label)),
    "the time of the last change is a whole number, never negative": (s) => Number.isInteger(s.at) && s.at >= 0,
  },

  transitions: {
    "a claim gives that open item to the actor and changes no other item": (p, n, a, m) =>
      a.t !== "claim" || p === n || (itemOf(p, a.item)?.owner === null && itemOf(n, a.item)?.owner === m.user && othersSame(p, n, a.item)),
    "a release opens the actor's own item and changes no other item": (p, n, a, m) =>
      a.t !== "release" || p === n || (itemOf(p, a.item)?.owner === m.user && itemOf(n, a.item)?.owner === null && othersSame(p, n, a.item)),
    "an add appends one open item with the trimmed label and leaves the rest": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.items.at(-1);
      return (
        typeof a.label === "string" &&
        n.items.length === p.items.length + 1 &&
        !!last &&
        last.id === `i${m.seq}` &&
        last.label === clean(a.label) &&
        last.owner === null &&
        p.items.every((x, i) => same(x, n.items[i]))
      );
    },
    "a change records when it happened": (p, n, _a, m) => p === n || n.at === m.time,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    const mine = s.items.filter((i) => i.owner === user);
    if (k < 0.15 || s.items.length === 0) return { t: "add", label: r.pick(["Ice", "Snacks", "  phone mount ", "", "Speaker", "Camp stove"]) };
    if (mine.length && k < 0.4) return { t: "release", item: r.pick(mine).id };
    return { t: "claim", item: r.pick(s.items).id };
  },

  local: { draft: "", toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const claimed = state.items.filter((i) => i.owner !== null).length;
    const open = state.items.length - claimed;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const canAdd = clean(local.draft).length > 0 && state.items.length < MAX_ITEMS;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "", toast: local.toast + 1 });
    };
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${claimed} of ${state.items.length} claimed · ${open} open`} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4 }}>
          {state.items.map((i) => {
            const mine = i.owner === me;
            const interactive = mine || i.owner === null;
            const who = i.owner === null ? "Open" : nameOf(i.owner);
            const line = i.note ? `${who} · ${i.note}` : who;
            return (
              <div
                key={i.id}
                role={interactive ? "button" : "group"}
                aria-label={`${i.label} · ${line}`}
                onClick={() => {
                  if (mine) dispatch({ t: "release", item: i.id });
                  else if (i.owner === null) dispatch({ t: "claim", item: i.id });
                }}
                style={{
                  minWidth: 0,
                  minHeight: 60,
                  boxSizing: "border-box",
                  padding: "6px 8px",
                  borderRadius: theme.radius.button,
                  border: `1px ${i.owner === null ? "dashed" : "solid"} ${mine ? theme.color.primary : theme.color.divider}`,
                  background: mine ? theme.color.selected : i.owner === null ? theme.color.card : theme.color.wash,
                  color: theme.color.text,
                  cursor: interactive ? "pointer" : "default",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 2,
                }}
              >
                <div style={{ fontWeight: 600, lineHeight: "18px" }}>{i.label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                  {i.owner !== null ? <Avatar user={i.owner} size={18} /> : null}
                  <small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{line}</small>
                </div>
              </div>
            );
          })}
        </div>
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
