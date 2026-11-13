import { defineApp, Button, CardHeader, Facepile, Toast } from "@muse/app";

// Bring list for the finals BBQ: tap an item to sign up, tap it again to drop. Two people per item at most.

const CONTENT = {
  title: "What to bring to the finals BBQ",
  when: "Thursday 5ish",
  cap: 2,
  items: ["Cornhole set", "Ice for the cooler (a lot)", "Red cups", "Charcoal", "Weber grill", "Buns", "Hot dogs", "Veggie burgers", "Speaker"],
};

type Item = { id: string; label: string; bringers: string[] };
type State = { items: Item[]; cap: number };
type Action = { t: "claim"; item: string } | { t: "drop"; item: string } | { t: "add"; label: string };
type Local = { draft: string; toast: number };

const MAX_ITEMS = 12;
const MAX_LABEL = 40;
const CAP = 2;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const find = (s: State, id: unknown) => s.items.find((i) => i.id === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Every item except `id` is exactly as it was, in the same order. */
const restSame = (p: State, n: State, id: string) =>
  p.items.length === n.items.length && p.items.every((x, i) => (x.id === id ? n.items[i]!.id === id : same(x, n.items[i])));

function claim(s: State, user: string, id: unknown): State {
  const item = find(s, id);
  if (!item || item.bringers.includes(user) || item.bringers.length >= s.cap) return s;
  return { ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, bringers: [...i.bringers, user] } : i)) };
}

function drop(s: State, user: string, id: unknown): State {
  const item = find(s, id);
  if (!item || !item.bringers.includes(user)) return s;
  return { ...s, items: s.items.map((i) => (i.id === item.id ? { ...i, bringers: i.bringers.filter((u) => u !== user) } : i)) };
}

function add(s: State, raw: unknown, seq: number): State {
  if (typeof raw !== "string") return s;
  const label = clean(raw);
  if (!label || label.length > MAX_LABEL || s.items.length >= MAX_ITEMS) return s;
  if (s.items.some((i) => i.label.toLowerCase() === label.toLowerCase())) return s;
  return { ...s, items: [...s.items, { id: `i${seq}`, label, bringers: [] }] };
}

export default defineApp<State, Action, Local>({
  name: "Bring list",
  summary: (s) => {
    const covered = s.items.filter((i) => i.bringers.length > 0).length;
    return `${CONTENT.title} ${covered} of ${s.items.length} covered.`;
  },

  init: () => {
    const seen = new Set<string>();
    const items: Item[] = [];
    CONTENT.items.forEach((raw, idx) => {
      const label = clean(raw).slice(0, MAX_LABEL);
      if (!label || seen.has(label.toLowerCase()) || items.length >= MAX_ITEMS) return;
      seen.add(label.toLowerCase());
      items.push({ id: `p${idx}`, label, bringers: [] });
    });
    return { items, cap: CAP };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "claim") return claim(state, meta.user, action.item);
    if (action.t === "drop") return drop(state, meta.user, action.item);
    if (action.t === "add") return add(state, action.label, meta.seq);
    return state;
  },

  // Someone left: their sign-ups open up again.
  onMembers: (state, ctx) => {
    if (state.items.every((i) => i.bringers.every((u) => inChat(ctx, u)))) return state;
    return { ...state, items: state.items.map((i) => (i.bringers.every((u) => inChat(ctx, u)) ? i : { ...i, bringers: i.bringers.filter((u) => inChat(ctx, u)) })) };
  },

  invariants: {
    "no item has more than 2 bringers": (s) => s.items.every((i) => i.bringers.length <= CAP),
    "no one is on the same item twice": (s) => s.items.every((i) => new Set(i.bringers).size === i.bringers.length),
    "bringers are in the chat": (s, ctx) => s.items.every((i) => i.bringers.every((u) => inChat(ctx, u))),
    "item ids and labels are unique": (s) =>
      new Set(s.items.map((i) => i.id)).size === s.items.length && new Set(s.items.map((i) => i.label.toLowerCase())).size === s.items.length,
    "at most 12 items, each label 1 to 40 characters": (s) =>
      s.items.length <= MAX_ITEMS && s.items.every((i) => i.label.length > 0 && i.label.length <= MAX_LABEL && i.label === clean(i.label)),
    "the cap is 2 people": (s) => s.cap === CAP,
  },

  transitions: {
    "a claim adds the actor at the end of that item and changes nothing else": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const b = find(p, a.item);
      const x = find(n, a.item);
      return !!b && !!x && x.bringers.join() === [...b.bringers, m.user].join() && b.label === x.label && restSame(p, n, b.id);
    },
    "a claim never lands on an item that already had 2 bringers": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const b = find(p, a.item);
      return !!b && b.bringers.length < p.cap && !b.bringers.includes(m.user);
    },
    "a drop removes only the actor from that item": (p, n, a, m) => {
      if (a.t !== "drop" || p === n) return true;
      const b = find(p, a.item);
      const x = find(n, a.item);
      return !!b && !!x && b.bringers.includes(m.user) && x.bringers.join() === b.bringers.filter((u) => u !== m.user).join() && restSame(p, n, b.id);
    },
    "an add appends one item with the cleaned label and no bringers": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.items.at(-1);
      return (
        n.items.length === p.items.length + 1 &&
        p.items.every((x, i) => same(x, n.items[i])) &&
        !!last &&
        last.id === `i${m.seq}` &&
        last.label === clean(a.label) &&
        last.bringers.length === 0
      );
    },
    "only people in the chat change the list": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the cap never changes": (p, n) => p.cap === n.cap,
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (k < 0.15 || s.items.length === 0) return { t: "add", label: r.pick(["Napkins", "Lawn chairs", "  ", "Speaker", "Tongs", "Cornhole set"]) };
    const mine = s.items.filter((i) => i.bringers.includes(user));
    if (mine.length && k < 0.4) return { t: "drop", item: r.pick(mine).id };
    return { t: "claim", item: r.pick(s.items).id };
  },

  local: { draft: "", toast: 0 },

  view: ({ state, me, dispatch, local, setLocal, theme }) => {
    const covered = state.items.filter((i) => i.bringers.length > 0).length;
    const canAdd = clean(local.draft).length > 0 && state.items.length < MAX_ITEMS;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "", toast: local.toast + 1 });
    };
    return (
      <div>
        <CardHeader title={CONTENT.title} subtitle={`${covered} of ${state.items.length} covered · ${CONTENT.when}`} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4 }}>
          {state.items.map((i) => {
            const mine = i.bringers.includes(me);
            const full = i.bringers.length >= state.cap;
            const status = mine ? "You" : full ? "Full" : i.bringers.length === 0 ? "Open" : "1 more";
            return (
              <div
                key={i.id}
                role="button"
                aria-label={`${i.label}, ${status}`}
                onClick={() => {
                  if (mine) dispatch({ t: "drop", item: i.id });
                  else if (!full) dispatch({ t: "claim", item: i.id });
                }}
                style={{
                  minHeight: 48,
                  minWidth: 0,
                  padding: "4px 8px",
                  borderRadius: theme.radius.button,
                  background: mine ? theme.color.primary : theme.color.input,
                  color: mine ? theme.color.onPrimary : theme.color.text,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 2,
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, lineHeight: "17px", overflowWrap: "anywhere" }}>{i.label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 20 }}>
                  {i.bringers.length ? <Facepile users={i.bringers} max={2} size={20} /> : null}
                  <span style={{ fontSize: 13, color: mine ? theme.color.onPrimary : theme.color.text }}>{status}</span>
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
