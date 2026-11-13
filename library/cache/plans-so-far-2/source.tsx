import { defineApp, Avatar, Button, CardHeader, Progress, Toast } from "@muse/app";

// Checklist of what the group decided for the lake weekend, with who suggested each item.
// Anyone can tick an item, add one, or remove an item they suggested.

const C = {
  title: "Lake weekend checklist",
  items: [
    { label: "Dates Oct 10-12", by: "Lena" },
    { label: "Ty drives, Subaru fits 5", by: "Ty" },
    { label: "Dani drives, 3 more seats", by: "Dani" },
    { label: "Cabin on Airbnb with hot tub, $64 each", by: "Tess" },
    { label: "Tess books it, everyone Venmos her", by: "Dani" },
    { label: "Grilling: burgers and veggie skewers for Lily", by: "Luis" },
    { label: "Drinks and the speaker", by: "Gabe" },
    { label: "Funfetti cake", by: "Lena" },
    { label: "Leave Friday 5:30pm from the parking lot behind the library", by: "Ty" },
    { label: "Bonfire night with s'mores", by: "Lily" },
  ],
};

type Item = { id: string; label: string; by: string; done: string | null };
type State = { items: Item[] };
type Action = { t: "toggle"; item: string } | { t: "add"; label: string } | { t: "remove"; item: string };
type Local = { draft: string; toast: number; manage: boolean; all: boolean };

const MAX_ITEMS = 12;
const MAX_LABEL = 60;
const SHOWN = 4;

const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default defineApp<State, Action, Local>({
  name: "Decision checklist",
  summary: (s) => `${C.title} ${s.items.filter((i) => i.done !== null).length} of ${s.items.length} done.`,

  init: (ctx) => {
    if (ctx.members.length === 0) return { items: [] };
    const find = (name: string) =>
      ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? ctx.members[0]?.id ?? "";
    return {
      items: C.items.slice(0, MAX_ITEMS).map((x, i) => ({ id: `p${i}`, label: x.label, by: find(x.by), done: null })),
    };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "toggle") {
      if (typeof action.item !== "string") return state;
      const it = state.items.find((x) => x.id === action.item);
      if (!it) return state;
      if (it.done === null) {
        return { items: state.items.map((x) => (x.id === it.id ? { ...x, done: meta.user } : x)) };
      }
      if (it.done === meta.user) {
        return { items: state.items.map((x) => (x.id === it.id ? { ...x, done: null } : x)) };
      }
      return state;
    }
    if (action.t === "add") {
      if (typeof action.label !== "string") return state;
      const label = clean(action.label);
      if (!label || label.length > MAX_LABEL || state.items.length >= MAX_ITEMS) return state;
      if (state.items.some((x) => x.label.toLowerCase() === label.toLowerCase())) return state;
      return { items: [...state.items, { id: `i${meta.seq}`, label, by: meta.user, done: null }] };
    }
    if (action.t === "remove") {
      if (typeof action.item !== "string") return state;
      const it = state.items.find((x) => x.id === action.item);
      if (!it || it.by !== meta.user) return state;
      return { items: state.items.filter((x) => x.id !== it.id) };
    }
    return state;
  },

  // Someone left: their suggestions go to the first person still here, and their ticks are cleared.
  onMembers: (state, ctx) => {
    if (ctx.members.length === 0) return state;
    const first = ctx.members[0]!.id;
    if (state.items.every((i) => inChat(ctx, i.by) && (i.done === null || inChat(ctx, i.done)))) return state;
    return {
      items: state.items.map((i) => ({
        ...i,
        by: inChat(ctx, i.by) ? i.by : first,
        done: i.done !== null && !inChat(ctx, i.done) ? null : i.done,
      })),
    };
  },

  invariants: {
    "item ids are unique and there are at most 12 items": (s) =>
      s.items.length <= MAX_ITEMS && new Set(s.items.map((i) => i.id)).size === s.items.length,
    "labels are 1 to 60 characters and unique ignoring case": (s) =>
      s.items.every((i) => i.label.length > 0 && i.label.length <= MAX_LABEL && i.label === clean(i.label)) &&
      new Set(s.items.map((i) => i.label.toLowerCase())).size === s.items.length,
    "every suggester is in the chat": (s, ctx) => ctx.members.length === 0 || s.items.every((i) => inChat(ctx, i.by)),
    "everyone who ticked an item is in the chat": (s, ctx) =>
      ctx.members.length === 0 || s.items.every((i) => i.done === null || inChat(ctx, i.done)),
    "done is empty or a person": (s) => s.items.every((i) => i.done === null || (typeof i.done === "string" && i.done.length > 0)),
  },

  transitions: {
    "a toggle ticks or unticks only that item, and only for the actor": (p, n, a, m) =>
      a.t !== "toggle" ||
      p === n ||
      (n.items.length === p.items.length &&
        p.items.every((x, i) => {
          const y = n.items[i]!;
          if (x.id !== a.item) return same(x, y);
          return (
            y.id === x.id &&
            y.label === x.label &&
            y.by === x.by &&
            ((x.done === null && y.done === m.user) || (x.done === m.user && y.done === null))
          );
        })),
    "an add puts one unticked item on the end, suggested by the actor": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.items.at(-1);
      return (
        n.items.length === p.items.length + 1 &&
        !!last &&
        last.id === `i${m.seq}` &&
        last.by === m.user &&
        last.done === null &&
        last.label === clean(a.label) &&
        p.items.every((x, i) => same(x, n.items[i]))
      );
    },
    "a remove deletes one item and only its suggester can do it": (p, n, a, m) => {
      if (a.t !== "remove" || p === n) return true;
      const gone = p.items.find((x) => x.id === a.item);
      return !!gone && gone.by === m.user && n.items.length === p.items.length - 1 && same(n.items, p.items.filter((x) => x.id !== a.item));
    },
    "only people in the chat change the list": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (k < 0.5 && s.items.length) return { t: "toggle", item: r.pick(s.items).id };
    if (k < 0.75 || s.items.length === 0)
      return { t: "add", label: r.pick(["Firewood", "Board games", "Towels", "  Paper plates ", "", "Dates Oct 10-12"]) };
    const mine = s.items.filter((i) => i.by === user);
    if (mine.length && k < 0.9) return { t: "remove", item: r.pick(mine).id };
    return { t: "toggle", item: "missing" };
  },

  local: { draft: "", toast: 0, manage: false, all: false },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const total = state.items.length;
    const done = state.items.filter((i) => i.done !== null).length;
    const canAdd = clean(local.draft).length > 0 && total < MAX_ITEMS;
    const visible = local.all ? state.items : state.items.slice(0, SHOWN);
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "", toast: local.toast + 1 });
    };
    return (
      <div>
        <CardHeader title={C.title} subtitle={`${done} of ${total} done`} />
        <Progress value={done} max={Math.max(1, total)} label={`${done} of ${total} done`} />
        <div style={{ marginTop: 4 }}>
          {visible.map((it) => {
            const ticked = it.done !== null;
            return (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                <div
                  role="checkbox"
                  aria-checked={ticked}
                  aria-label={it.label}
                  tabIndex={0}
                  onClick={() => dispatch({ t: "toggle", item: it.id })}
                  style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, minHeight: 44 }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      flex: "none",
                      borderRadius: 6,
                      boxSizing: "border-box",
                      border: `2px solid ${ticked ? theme.color.primary : theme.color.secondaryText}`,
                      background: ticked ? theme.color.primary : theme.color.card,
                      color: theme.color.onPrimary,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                    }}
                  >
                    {ticked ? "✓" : ""}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: ticked ? theme.color.secondaryText : theme.color.text,
                        textDecoration: ticked ? "line-through" : "none",
                      }}
                    >
                      {it.label}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                      <Avatar user={it.by} size={16} />
                      <small
                        style={{
                          display: "block",
                          minWidth: 0,
                          lineHeight: "18px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {nameOf(it.by)}
                      </small>
                    </div>
                  </div>
                </div>
                {local.manage && it.by === me ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "remove", item: it.id })}>
                    Remove
                  </Button>
                ) : it.done !== null ? (
                  <Avatar user={it.done} size={24} />
                ) : null}
              </div>
            );
          })}
        </div>
        {total > SHOWN ? (
          <Button kind="deemphasized" wide onClick={() => setLocal({ all: !local.all })}>
            {local.all ? "Show less" : `Show all ${total}`}
          </Button>
        ) : null}
        <form
          style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            style={{ flex: 1, minWidth: 0 }}
            value={local.draft}
            maxLength={MAX_LABEL}
            placeholder="Add item"
            aria-label="Add item"
            onInput={(e) => setLocal({ draft: e.currentTarget.value })}
          />
          <Button kind="primary" disabled={!canAdd} onClick={submit}>
            Add
          </Button>
          <Button kind="secondary" onClick={() => setLocal({ manage: !local.manage })}>
            {local.manage ? "Done" : "Edit"}
          </Button>
        </form>
        {local.toast ? <Toast key={local.toast}>Item added</Toast> : null}
      </div>
    );
  },
});
