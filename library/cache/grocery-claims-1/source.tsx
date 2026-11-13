import { defineApp, Avatar, Button, CardHeader, Toast } from "@muse/app";

// Who is bringing what: tap an open item to claim it, tap your own to give it back.
// The first claim in the log wins. Anyone can add an item.

const CHAT = {
  title: "Who's bringing what?",
  // who = a first name from the chat, matched against the member list in init (else the item starts open)
  items: [
    { label: "Grill and charcoal", who: "Jake" },
    { label: "Buns", who: "Eli" },
    { label: "Cheese slices", who: "Eli" },
    { label: "Patties, 3 lbs beef", who: "Leo" },
    { label: "Chips", who: "Dre" },
    { label: "Watermelon", who: "Dre" },
    { label: "Hot dogs", who: "" },
    { label: "Drinks", who: "" },
    { label: "Ketchup and stuff", who: "" },
    { label: "Ice", who: "" },
  ],
};

type Item = { id: string; label: string; by: string | null };
type State = { title: string; items: Item[] };
type Action = { t: "claim"; item: string } | { t: "release"; item: string } | { t: "add"; label: string };
type Local = { draft: string; toast: number };

const MAX_ITEMS = 12;
const MAX_LABEL = 40;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const claimedCount = (s: State) => s.items.filter((i) => i.by !== null).length;

/** Same items in the same order, and every item except `id` is exactly as it was. */
const sameExcept = (p: State, n: State, id: string) =>
  p.items.length === n.items.length &&
  p.items.every((o, i) => {
    const q = n.items[i]!;
    return q.id === o.id && q.label === o.label && (o.id === id || q.by === o.by);
  });

const byOf = (s: State, id: string) => s.items.find((i) => i.id === id)?.by;

export default defineApp<State, Action, Local>({
  name: "Cookout list",
  summary: (s) => `${s.title} ${claimedCount(s)} of ${s.items.length} claimed.`,

  init: (ctx) => ({
    title: CHAT.title,
    items: CHAT.items.map((it, i) => ({
      id: `p${i}`,
      label: it.label,
      by: it.who ? (ctx.members.find((m) => m.name.toLowerCase() === it.who.toLowerCase())?.id ?? null) : null,
    })),
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "claim") {
      if (typeof action.item !== "string") return state;
      const it = state.items.find((i) => i.id === action.item);
      if (!it || it.by !== null) return state;
      return { ...state, items: state.items.map((i) => (i.id === it.id ? { ...i, by: meta.user } : i)) };
    }
    if (action.t === "release") {
      if (typeof action.item !== "string") return state;
      const it = state.items.find((i) => i.id === action.item);
      if (!it || it.by !== meta.user) return state;
      return { ...state, items: state.items.map((i) => (i.id === it.id ? { ...i, by: null } : i)) };
    }
    if (action.t === "add") {
      if (typeof action.label !== "string") return state;
      const label = clean(action.label);
      if (!label || label.length > MAX_LABEL || state.items.length >= MAX_ITEMS) return state;
      if (state.items.some((i) => i.label.toLowerCase() === label.toLowerCase())) return state;
      return { ...state, items: [...state.items, { id: `i${meta.seq}`, label, by: null }] };
    }
    return state;
  },

  // Someone left: what they claimed is open again.
  onMembers: (state, ctx) => {
    if (state.items.every((i) => i.by === null || inChat(ctx, i.by))) return state;
    return { ...state, items: state.items.map((i) => (i.by !== null && !inChat(ctx, i.by) ? { ...i, by: null } : i)) };
  },

  invariants: {
    "every claimed item is held by someone in the chat": (s, ctx) => s.items.every((i) => i.by === null || inChat(ctx, i.by)),
    "item ids are unique and labels are unique ignoring case": (s) =>
      new Set(s.items.map((i) => i.id)).size === s.items.length && new Set(s.items.map((i) => i.label.toLowerCase())).size === s.items.length,
    "at most 12 items, each label 1 to 40 characters and trimmed": (s) =>
      s.items.length <= MAX_ITEMS && s.items.every((i) => i.label.length > 0 && i.label.length <= MAX_LABEL && i.label === clean(i.label)),
    "each item has one holder or none": (s) => s.items.every((i) => i.by === null || typeof i.by === "string"),
  },

  transitions: {
    "a claim gives that open item to the actor and changes no other item": (p, n, a, m) =>
      a.t !== "claim" || p === n || (byOf(p, a.item) === null && byOf(n, a.item) === m.user && sameExcept(p, n, a.item)),
    "a release opens only an item the actor held and changes no other item": (p, n, a, m) =>
      a.t !== "release" || p === n || (byOf(p, a.item) === m.user && byOf(n, a.item) === null && sameExcept(p, n, a.item)),
    "an add appends one open item last and leaves the others as they were": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.items.at(-1);
      return (
        typeof a.label === "string" &&
        n.items.length === p.items.length + 1 &&
        !!last &&
        last.id === `i${m.seq}` &&
        last.label === clean(a.label) &&
        last.by === null &&
        p.items.every((o, i) => n.items[i]!.id === o.id && n.items[i]!.label === o.label && n.items[i]!.by === o.by)
      );
    },
    "a claim never takes an item someone else holds": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const before = byOf(p, a.item);
      return before === null || before === m.user;
    },
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the title never changes": (p, n) => p.title === n.title,
  },

  arbitrary: (s, user, r) => {
    if (s.items.length === 0 || r.next() < 0.15) {
      return { t: "add", label: r.pick(["Napkins", "Plates", "  Cups ", "", "Buns", "Mustard", "Soda"]) };
    }
    const mine = s.items.filter((i) => i.by === user);
    if (mine.length && r.next() < 0.3) return { t: "release", item: r.pick(mine).id };
    const open = s.items.filter((i) => i.by === null);
    if (open.length && r.next() < 0.8) return { t: "claim", item: r.pick(open).id };
    return { t: "claim", item: r.pick(s.items).id };
  },

  local: { draft: "", toast: 0 },

  view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const canAdd = clean(local.draft).length > 0 && state.items.length < MAX_ITEMS;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "", toast: local.toast + 1 });
    };
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${claimedCount(state)} of ${state.items.length} claimed`} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 6 }}>
          {state.items.map((i) => {
            const mine = i.by === me;
            const free = i.by === null;
            return (
              <div
                key={i.id}
                role="button"
                aria-label={free ? `Claim ${i.label}` : mine ? `Give back ${i.label}` : `${i.label}, ${nameOf(i.by!)}`}
                onClick={() => {
                  if (free) dispatch({ t: "claim", item: i.id });
                  else if (mine) dispatch({ t: "release", item: i.id });
                }}
                style={{
                  minHeight: 44,
                  minWidth: 0,
                  boxSizing: "border-box",
                  padding: "4px 8px",
                  borderRadius: theme.radius.button,
                  border: `1px solid ${theme.color.divider}`,
                  background: mine ? theme.color.primary : free ? theme.color.wash : theme.color.card,
                  color: mine ? theme.color.onPrimary : theme.color.text,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: theme.type.meta, overflow: "hidden", whiteSpace: "nowrap" }}>
                  {free ? (
                    <span>Open</span>
                  ) : (
                    <>
                      <Avatar user={i.by!} size={16} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{mine ? "You" : nameOf(i.by!)}</span>
                    </>
                  )}
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
