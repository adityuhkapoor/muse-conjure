import { defineApp, Button, CardHeader, Facepile } from "@muse/app";

const CHAT = {
  title: "Target run list",
  shopper: "Jess",
  driver: "Theo",
  items: [
    { label: "Batiste dry shampoo, small", by: ["Priya"] },
    { label: "Toilet paper, 12 pack", by: ["Ana", "Bryan"] },
    { label: "Spicy Shin ramen, 2 packs", by: ["Bryan"] },
    { label: "Phone charger cable, 6ft", by: ["Priya"] },
    { label: "Tape", by: ["Bryan"] },
    { label: "Sharpies", by: ["Bryan"] },
    { label: "Old Spice deodorant, blue", by: ["Theo"] },
  ],
};

type Item = { id: string; label: string; by: string[]; got: boolean };
type State = { title: string; shopper: string; driver: string; items: Item[] };
type Action =
  | { t: "add"; label: string }
  | { t: "want"; item: string }
  | { t: "check"; item: string }
  | { t: "remove"; item: string }
  | { t: "setShopper"; user: string };
type Local = { draft: string };

const MAX_ITEMS = 12;
const MAX_LABEL = 40;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const without = (xs: string[], user: string) => xs.filter((x) => x !== user).join();
const byName = (members: { id: string; name: string }[], name: string) =>
  members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;

export default defineApp<State, Action, Local>({
  name: "Target list",
  summary: (s) => `${s.title} ${s.items.filter((i) => i.got).length} of ${s.items.length} got.`,

  init: (ctx) => {
    const seen = new Set<string>();
    const items: Item[] = [];
    for (const raw of CHAT.items) {
      const label = clean(raw.label).slice(0, MAX_LABEL);
      const by: string[] = [];
      for (const n of raw.by) {
        const id = byName(ctx.members, n);
        if (id && !by.includes(id)) by.push(id);
      }
      if (!label || by.length === 0 || seen.has(label.toLowerCase()) || items.length >= MAX_ITEMS) continue;
      seen.add(label.toLowerCase());
      items.push({ id: `p${items.length}`, label, by, got: false });
    }
    const first = ctx.members[0]?.id ?? "";
    return {
      title: CHAT.title,
      shopper: byName(ctx.members, CHAT.shopper) ?? first,
      driver: byName(ctx.members, CHAT.driver) ?? first,
      items,
    };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    const u = meta.user;
    switch (action.t) {
      case "add": {
        if (typeof action.label !== "string") return state;
        const label = clean(action.label);
        if (!label || label.length > MAX_LABEL || state.items.length >= MAX_ITEMS) return state;
        if (state.items.some((i) => i.label.toLowerCase() === label.toLowerCase())) return state;
        return { ...state, items: [...state.items, { id: `i${meta.seq}`, label, by: [u], got: false }] };
      }
      case "want": {
        if (typeof action.item !== "string") return state;
        const it = state.items.find((i) => i.id === action.item);
        if (!it || it.got) return state;
        const had = it.by.includes(u);
        if (had && it.by.length === 1) return state;
        const by = had ? it.by.filter((x) => x !== u) : [...it.by, u];
        return { ...state, items: state.items.map((i) => (i.id === it.id ? { ...i, by } : i)) };
      }
      case "check": {
        if (typeof action.item !== "string" || u !== state.shopper) return state;
        const it = state.items.find((i) => i.id === action.item);
        if (!it) return state;
        if (it.got && it.by.length === 0) return state;
        return { ...state, items: state.items.map((i) => (i.id === it.id ? { ...i, got: !i.got } : i)) };
      }
      case "remove": {
        if (typeof action.item !== "string") return state;
        const it = state.items.find((i) => i.id === action.item);
        if (!it || !(it.by.includes(u) || u === state.shopper)) return state;
        return { ...state, items: state.items.filter((i) => i.id !== it.id) };
      }
      case "setShopper": {
        if (typeof action.user !== "string" || u !== state.shopper) return state;
        if (!inChat(ctx, action.user) || action.user === state.shopper) return state;
        return { ...state, shopper: action.user };
      }
    }
    return state;
  },

  onMembers: (s, ctx) => {
    if (ctx.members.length === 0) return s;
    const items = s.items.flatMap((it): Item[] => {
      const by = it.by.filter((x) => inChat(ctx, x));
      if (by.length === it.by.length) return [it];
      if (by.length === 0 && !it.got) return [];
      return [{ ...it, by }];
    });
    const first = ctx.members[0]!.id;
    const shopper = inChat(ctx, s.shopper) ? s.shopper : first;
    const driver = inChat(ctx, s.driver) ? s.driver : first;
    if (items.length === s.items.length && items.every((x, i) => x === s.items[i]) && shopper === s.shopper && driver === s.driver) return s;
    return { ...s, items, shopper, driver };
  },

  invariants: {
    "item ids are unique and labels are unique ignoring case": (s) =>
      new Set(s.items.map((i) => i.id)).size === s.items.length &&
      new Set(s.items.map((i) => i.label.toLowerCase())).size === s.items.length,
    "every asker is in the chat and appears once per item": (s, ctx) =>
      s.items.every((i) => new Set(i.by).size === i.by.length && i.by.every((x) => inChat(ctx, x))),
    "the shopper and driver are in the chat": (s, ctx) =>
      ctx.members.length === 0 || (inChat(ctx, s.shopper) && inChat(ctx, s.driver)),
    "at most 12 items, each label 1 to 40 characters": (s) =>
      s.items.length <= MAX_ITEMS && s.items.every((i) => i.label.length > 0 && i.label.length <= MAX_LABEL && i.label === clean(i.label)),
    "an item with no askers is kept only if it is got": (s) => s.items.every((i) => i.got || i.by.length > 0),
  },

  transitions: {
    "an add appends one item last with the actor as sole asker and changes nothing else": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.items.at(-1);
      return (
        n.items.length === p.items.length + 1 &&
        !!last &&
        last.id === `i${m.seq}` &&
        last.label === clean(a.label) &&
        last.by.length === 1 &&
        last.by[0] === m.user &&
        !last.got &&
        p.items.every((x, i) => same(x, n.items[i])) &&
        p.shopper === n.shopper &&
        p.driver === n.driver
      );
    },
    "a want toggles only the actor on that item": (p, n, a, m) => {
      if (a.t !== "want" || p === n) return true;
      const pi = p.items.find((i) => i.id === a.item);
      const ni = n.items.find((i) => i.id === a.item);
      if (!pi || !ni || p.items.length !== n.items.length) return false;
      return (
        !pi.got &&
        ni.got === pi.got &&
        pi.by.includes(m.user) !== ni.by.includes(m.user) &&
        without(pi.by, m.user) === without(ni.by, m.user) &&
        p.items.every((x, i) => x.id === a.item || same(x, n.items[i])) &&
        p.shopper === n.shopper
      );
    },
    "a check flips got on that item only, and only the shopper does it": (p, n, a, m) => {
      if (a.t !== "check" || p === n) return true;
      const pi = p.items.find((i) => i.id === a.item);
      const ni = n.items.find((i) => i.id === a.item);
      if (!pi || !ni || p.items.length !== n.items.length) return false;
      return (
        m.user === p.shopper &&
        ni.got !== pi.got &&
        same(ni.by, pi.by) &&
        p.items.every((x, i) => x.id === a.item || same(x, n.items[i]))
      );
    },
    "only the shopper changes got on any item": (p, n, _a, m) =>
      p.items.every((x) => {
        const y = n.items.find((i) => i.id === x.id);
        return !y || y.got === x.got || m.user === p.shopper;
      }),
    "a remove deletes only that item, by an asker or the shopper": (p, n, a, m) => {
      if (a.t !== "remove" || p === n) return true;
      const gone = p.items.find((i) => i.id === a.item);
      return (
        !!gone &&
        (gone.by.includes(m.user) || m.user === p.shopper) &&
        n.items.length === p.items.length - 1 &&
        !n.items.some((i) => i.id === a.item) &&
        n.items.every((x) => same(x, p.items.find((i) => i.id === x.id)))
      );
    },
    "only the shopper hands over the role, and the driver never changes": (p, n, a, m) =>
      p.driver === n.driver && (p.shopper === n.shopper || (a.t === "setShopper" && m.user === p.shopper && n.shopper === a.user)),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const k = r.next();
    if (s.items.length === 0 || k < 0.2) {
      return { t: "add", label: r.pick(["Batteries", "  paper towels ", "Gum", "", "Tape", "Soap", "Notebook"]) };
    }
    const it = r.pick(s.items);
    if (user === s.shopper && k < 0.7) return { t: "check", item: it.id };
    if (k < 0.5) return { t: "want", item: it.id };
    if (k < 0.8) return { t: "check", item: it.id };
    if (k < 0.9) return { t: "remove", item: it.id };
    const who = ctx.members.length ? r.pick(ctx.members).id : "";
    return { t: "setShopper", user: who };
  },

  local: { draft: "" },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const isShopper = me === state.shopper;
    const gotCount = state.items.filter((i) => i.got).length;
    const ordered = [...state.items.filter((i) => !i.got), ...state.items.filter((i) => i.got)];
    const canAdd = clean(local.draft).length > 0 && state.items.length < MAX_ITEMS;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "" });
    };
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${gotCount} of ${state.items.length} got · ${nameOf(state.shopper)} shopping`} />
        <div style={{ maxHeight: 232, overflowY: "auto" }}>
          {ordered.map((it) => {
            const asking = it.by.includes(me);
            return (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflowWrap: "anywhere",
                    color: it.got ? "var(--color-secondaryText)" : "var(--color-text)",
                    textDecoration: it.got ? "line-through" : "none",
                  }}
                >
                  {it.label}
                </div>
                {it.by.length ? <Facepile users={it.by} max={2} size={20} /> : null}
                {isShopper ? (
                  <Button kind={it.got ? "deemphasized" : "secondary"} disabled={it.got && it.by.length === 0} onClick={() => dispatch({ t: "check", item: it.id })}>
                    {it.got ? "Undo" : "Got it"}
                  </Button>
                ) : it.got ? (
                  <small>Got</small>
                ) : !asking ? (
                  <Button kind="secondary" onClick={() => dispatch({ t: "want", item: it.id })}>
                    Me too
                  </Button>
                ) : it.by.length === 1 ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "remove", item: it.id })}>
                    Remove
                  </Button>
                ) : (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "want", item: it.id })}>
                    Not me
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <small style={{ display: "block", marginTop: 4 }}>{nameOf(state.driver)} driving</small>
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
      </div>
    );
  },
});
