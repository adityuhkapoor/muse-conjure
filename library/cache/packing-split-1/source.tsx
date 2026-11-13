import { defineApp, Avatar, Button, CardHeader, Toast } from "@muse/app";

// Gear list for the weekend: every piece of gear and who is bringing it.
// Anyone can add gear, claim an open item, drop their own, or remove an item that is theirs or open.

const CHAT = {
  title: "Who's bringing what?",
  trip: "Lake George Fri-Sun",
  // owner: a member name from the chat, or "" when nobody in the chat has it yet.
  items: [
    { label: "JBL bluetooth speaker", owner: "Wren", note: "" },
    { label: "Big boombox", owner: "Bryan", note: "" },
    { label: "4 person tent", owner: "Owen", note: "" },
    { label: "6 person tent", owner: "Ines", note: "" },
    { label: "Small cooler, 24 cans", owner: "Theo", note: "" },
    { label: "Yeti cooler", owner: "", note: "Tess's roommate" },
    { label: "Uno", owner: "Wren", note: "" },
    { label: "Regular deck of cards", owner: "Bryan", note: "" },
    { label: "Cards Against Humanity", owner: "Bryan", note: "" },
    { label: "Lantern", owner: "Priya", note: "" },
    { label: "Camp stove", owner: "Priya", note: "" },
  ],
};

type Item = { id: string; label: string; owner: string | null; note: string };
type State = { title: string; items: Item[] };
type Action = { t: "claim"; item: string } | { t: "drop"; item: string } | { t: "add"; label: string } | { t: "remove"; item: string };
type Local = { sel: string; draft: string; toast: number };

const MAX_ITEMS = 12;
const MAX_LABEL = 40;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);

const same = (x: Item, y: Item | undefined) => !!y && x.id === y.id && x.label === y.label && x.owner === y.owner && x.note === y.note;
/** Every item other than `id` is unchanged and in the same place. */
const restSame = (p: State, n: State, id: string) => p.items.length === n.items.length && p.items.every((x, i) => x.id === id || same(x, n.items[i]));
/** Only the owner of item `id` changed, from `before` to `after`. */
const ownerChanged = (p: State, n: State, id: string, before: string | null, after: string | null) => {
  const x = p.items.find((i) => i.id === id);
  const y = n.items.find((i) => i.id === id);
  return !!x && !!y && x.owner === before && y.owner === after && x.label === y.label && x.note === y.note && restSame(p, n, id);
};

export default defineApp<State, Action, Local>({
  name: "Gear list",
  summary: (s) => `${s.title} ${s.items.filter((i) => i.owner !== null).length} of ${s.items.length} claimed.`,

  init: (ctx) => {
    const items: Item[] = [];
    for (const it of CHAT.items) {
      const label = clean(it.label).slice(0, MAX_LABEL);
      if (!label || items.length >= MAX_ITEMS || items.some((x) => x.label.toLowerCase() === label.toLowerCase())) continue;
      const want = it.owner.trim().toLowerCase();
      const owner = want ? (ctx.members.find((m) => m.name.toLowerCase() === want)?.id ?? null) : null;
      items.push({ id: `p${items.length}`, label, owner, note: it.note.trim().slice(0, 40) });
    }
    return { title: CHAT.title, items };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    const u = meta.user;
    if (action.t === "claim") {
      const it = typeof action.item === "string" ? state.items.find((i) => i.id === action.item) : undefined;
      if (!it || it.owner !== null) return state;
      return { ...state, items: state.items.map((i) => (i.id === it.id ? { ...i, owner: u } : i)) };
    }
    if (action.t === "drop") {
      const it = typeof action.item === "string" ? state.items.find((i) => i.id === action.item) : undefined;
      if (!it || it.owner !== u) return state;
      return { ...state, items: state.items.map((i) => (i.id === it.id ? { ...i, owner: null } : i)) };
    }
    if (action.t === "add") {
      if (typeof action.label !== "string") return state;
      const label = clean(action.label);
      if (!label || label.length > MAX_LABEL || state.items.length >= MAX_ITEMS) return state;
      if (state.items.some((i) => i.label.toLowerCase() === label.toLowerCase())) return state;
      return { ...state, items: [...state.items, { id: `i${meta.seq}`, label, owner: u, note: "" }] };
    }
    if (action.t === "remove") {
      const it = typeof action.item === "string" ? state.items.find((i) => i.id === action.item) : undefined;
      if (!it || (it.owner !== null && it.owner !== u)) return state;
      return { ...state, items: state.items.filter((i) => i.id !== it.id) };
    }
    return state;
  },

  // Someone left: what they were bringing goes back to open. Someone joined: they can claim or add at once.
  onMembers: (state, ctx) =>
    state.items.every((i) => i.owner === null || inChat(ctx, i.owner))
      ? state
      : { ...state, items: state.items.map((i) => (i.owner !== null && !inChat(ctx, i.owner) ? { ...i, owner: null } : i)) },

  invariants: {
    "item ids are unique and labels are unique ignoring case": (s) =>
      new Set(s.items.map((i) => i.id)).size === s.items.length && new Set(s.items.map((i) => i.label.toLowerCase())).size === s.items.length,
    "at most 12 items, each label 1 to 40 characters and trimmed": (s) =>
      s.items.length <= MAX_ITEMS && s.items.every((i) => i.label.length > 0 && i.label.length <= MAX_LABEL && i.label === clean(i.label)),
    "every owner is open or in the chat": (s, ctx) => s.items.every((i) => i.owner === null || inChat(ctx, i.owner)),
    "each note is at most 40 characters": (s) => s.items.every((i) => typeof i.note === "string" && i.note.length <= 40),
  },

  transitions: {
    "a claim gives one open item to the actor and changes nothing else": (p, n, a, m) =>
      a.t !== "claim" || p === n || ownerChanged(p, n, a.item, null, m.user),
    "a drop opens one item the actor owned and changes nothing else": (p, n, a, m) =>
      a.t !== "drop" || p === n || ownerChanged(p, n, a.item, m.user, null),
    "an add puts one new item last with the cleaned label and the actor as owner": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.items[n.items.length - 1];
      return (
        typeof a.label === "string" &&
        n.items.length === p.items.length + 1 &&
        p.items.every((x, i) => same(x, n.items[i])) &&
        !!last &&
        last.id === `i${m.seq}` &&
        last.label === clean(a.label) &&
        last.owner === m.user
      );
    },
    "a remove deletes one item the actor owned or that was open, and nothing else": (p, n, a, m) => {
      if (a.t !== "remove" || p === n) return true;
      const x = p.items.find((i) => i.id === a.item);
      const rest = p.items.filter((i) => i.id !== a.item);
      return !!x && (x.owner === null || x.owner === m.user) && n.items.length === rest.length && rest.every((y, i) => same(y, n.items[i]));
    },
    "only people in the chat change the list": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the title never changes": (p, n) => p.title === n.title,
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    const free = s.items.filter((i) => i.owner === null);
    const mine = s.items.filter((i) => i.owner === user);
    if (k < 0.25) return { t: "add", label: r.pick(["Hammock", "Firewood", "  extra   chairs ", "Frisbee", "", "Uno", "Bug spray", "Paddle board"]) };
    if (k < 0.55 && free.length) return { t: "claim", item: r.pick(free).id };
    if (k < 0.75 && mine.length) return { t: "drop", item: r.pick(mine).id };
    if (k < 0.85 && free.length + mine.length) return { t: "remove", item: r.pick([...free, ...mine]).id };
    if (s.items.length) return { t: "claim", item: r.pick(s.items).id };
    return { t: "add", label: "Hammock" };
  },

  local: { sel: "", draft: "", toast: 0 },

  view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const claimed = state.items.filter((i) => i.owner !== null).length;
    const sel = state.items.find((i) => i.id === local.sel);
    const canAdd = clean(local.draft).length > 0 && state.items.length < MAX_ITEMS;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "", toast: local.toast + 1 });
    };
    const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
    const line = { ...ellipsis, lineHeight: "16px" } as const;

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${claimed} of ${state.items.length} claimed`} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4 }}>
          {state.items.map((it) => (
            <div
              key={it.id}
              role="button"
              tabIndex={0}
              aria-label={it.label}
              onClick={() => setLocal({ sel: local.sel === it.id ? "" : it.id })}
              style={{
                height: 44,
                minWidth: 0,
                padding: "2px 8px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                overflow: "hidden",
                borderRadius: theme.radius.button,
                background: local.sel === it.id ? theme.color.selected : theme.color.wash,
                color: theme.color.text,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, ...line }}>{it.label}</div>
              {it.owner === null ? (
                <small style={{ color: theme.color.secondaryText, ...line }}>Open</small>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                  <Avatar user={it.owner} size={16} />
                  <small style={{ minWidth: 0, ...line }}>{nameOf(it.owner)}</small>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          {sel ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, ...ellipsis }}>{sel.label}</div>
                <small style={{ display: "block", ...ellipsis }}>
                  {sel.owner === null ? sel.note || "Nobody yet" : sel.owner === me ? "You have it" : `${nameOf(sel.owner)} has it`}
                </small>
              </div>
              {sel.owner === null ? (
                <Button kind="primary" onClick={() => dispatch({ t: "claim", item: sel.id })}>
                  Claim
                </Button>
              ) : null}
              {sel.owner === me ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "drop", item: sel.id })}>
                  Drop
                </Button>
              ) : null}
              {sel.owner === null || sel.owner === me ? (
                <Button
                  kind="deemphasized"
                  onClick={() => {
                    dispatch({ t: "remove", item: sel.id });
                    setLocal({ sel: "" });
                  }}
                >
                  Remove
                </Button>
              ) : (
                <Button kind="secondary" onClick={() => setLocal({ sel: "" })}>
                  Done
                </Button>
              )}
            </div>
          ) : state.items.length < MAX_ITEMS ? (
            <form
              style={{ display: "flex", gap: 8, alignItems: "center" }}
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add gear" aria-label="Add gear" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
              <Button kind="primary" disabled={!canAdd} onClick={submit}>
                Add
              </Button>
            </form>
          ) : (
            <small>List is full · 12 items</small>
          )}
        </div>
        {local.toast ? <Toast key={local.toast}>Gear added</Toast> : null}
      </div>
    );
  },
});
