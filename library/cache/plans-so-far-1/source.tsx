import { defineApp, Avatar, Button, CardHeader, OptionRow } from "@muse/app";

const C = {
  title: "Friendsgiving: what we decided",
  date: "Sat the 21st · Eli's apartment · Wren works till 4",
  items: [
    { label: "Drinks", owner: "Theo" },
    { label: "Turkey", owner: "Bryan" },
    { label: "Mac and cheese", owner: "Wren" },
    { label: "Rolls", owner: "Wren" },
    { label: "Mashed potatoes", owner: "Eli" },
    { label: "Plates and cups", owner: "Eli" },
    { label: "Pumpkin and pecan pie", owner: "Theo" },
    { label: "Cards Against Humanity", owner: "Bryan" },
  ],
  later: "Secret Santa, $15 limit · December get-together",
  openLabel: "Movie after",
  options: [{ label: "Elf", voters: ["Wren", "Theo"] }],
};

type Item = { id: string; label: string; owner: string; done: boolean };
type Opt = { id: string; label: string; voters: string[] };
type Open = { label: string; options: Opt[]; picked: string };
type State = { date: string; items: Item[]; later: string; open: Open };
type Action =
  | { t: "claim"; item: string }
  | { t: "release"; item: string }
  | { t: "done"; item: string }
  | { t: "vote"; option: string }
  | { t: "add"; label: string }
  | { t: "decide"; option: string };
type Local = { panel: boolean };

const MAX_OPTIONS = 6;
const MAX_LABEL = 40;

const clean = (x: string) => x.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const itemOf = (s: State, id: unknown) => s.items.find((i) => i.id === id);
const optOf = (s: State, id: unknown) => s.open.options.find((o) => o.id === id);
const restItems = (s: State, id: unknown) => JSON.stringify(s.items.filter((i) => i.id !== id));
const itemsSame = (p: State, n: State) => JSON.stringify(p.items) === JSON.stringify(n.items);
const openSame = (p: State, n: State) => JSON.stringify(p.open) === JSON.stringify(n.open);
const votedFor = (s: State, id: unknown, user: string) => !!optOf(s, id)?.voters.includes(user);
const without = (xs: string[], user: string) => xs.filter((x) => x !== user).join();
const optionsOthersSame = (p: State, n: State, user: string) =>
  p.open.picked === n.open.picked &&
  p.open.options.length === n.open.options.length &&
  p.open.options.every((o, i) => n.open.options[i]!.id === o.id && n.open.options[i]!.label === o.label && without(o.voters, user) === without(n.open.options[i]!.voters, user));
const maxVotes = (s: State) => s.open.options.reduce((n, o) => Math.max(n, o.voters.length), 0);

export default defineApp<State, Action, Local>({
  name: "Decision recap",
  summary: (s) => {
    const done = s.items.filter((i) => i.done).length;
    const pick = optOf(s, s.open.picked);
    return `${C.title}. ${done} of ${s.items.length} sorted. ${pick ? `${s.open.label}: ${pick.label}.` : `Open: ${s.open.label}.`}`;
  },

  init: (ctx) => {
    const find = (name: string) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? "";
    return {
      date: C.date,
      items: C.items.map((it, i) => ({ id: `i${i}`, label: it.label, owner: find(it.owner), done: false })),
      later: C.later,
      open: {
        label: C.openLabel,
        options: C.options.map((o, i) => ({
          id: `p${i}`,
          label: o.label,
          voters: o.voters.map(find).filter((id, k, all) => id !== "" && all.indexOf(id) === k),
        })),
        picked: "",
      },
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    switch (a.t) {
      case "claim": {
        if (typeof a.item !== "string") return s;
        const it = itemOf(s, a.item);
        if (!it || it.owner !== "") return s;
        return { ...s, items: s.items.map((i) => (i.id === it.id ? { ...i, owner: m.user, done: false } : i)) };
      }
      case "release": {
        if (typeof a.item !== "string") return s;
        const it = itemOf(s, a.item);
        if (!it || it.owner !== m.user) return s;
        return { ...s, items: s.items.map((i) => (i.id === it.id ? { ...i, owner: "", done: false } : i)) };
      }
      case "done": {
        if (typeof a.item !== "string") return s;
        const it = itemOf(s, a.item);
        if (!it || it.owner !== m.user) return s;
        return { ...s, items: s.items.map((i) => (i.id === it.id ? { ...i, done: !i.done } : i)) };
      }
      case "vote": {
        if (typeof a.option !== "string" || s.open.picked !== "") return s;
        const o = optOf(s, a.option);
        if (!o) return s;
        const had = o.voters.includes(m.user);
        return {
          ...s,
          open: {
            ...s.open,
            options: s.open.options.map((x) => (x.id === o.id ? { ...x, voters: had ? x.voters.filter((v) => v !== m.user) : [...x.voters, m.user] } : x)),
          },
        };
      }
      case "add": {
        if (typeof a.label !== "string" || s.open.picked !== "") return s;
        const label = clean(a.label);
        if (!label || label.length > MAX_LABEL || s.open.options.length >= MAX_OPTIONS) return s;
        if (s.open.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) return s;
        return { ...s, open: { ...s.open, options: [...s.open.options, { id: `o${m.seq}`, label, voters: [m.user] }] } };
      }
      case "decide": {
        if (typeof a.option !== "string" || s.open.picked !== "") return s;
        const o = optOf(s, a.option);
        if (!o || o.voters.length === 0 || o.voters.length < maxVotes(s)) return s;
        return { ...s, open: { ...s.open, picked: o.id } };
      }
      default:
        return s;
    }
  },

  onMembers: (s, ctx) => {
    const itemsOk = s.items.every((i) => i.owner === "" || inChat(ctx, i.owner));
    const votersOk = s.open.options.every((o) => o.voters.every((v) => inChat(ctx, v)));
    if (itemsOk && votersOk) return s;
    return {
      ...s,
      items: itemsOk ? s.items : s.items.map((i) => (i.owner === "" || inChat(ctx, i.owner) ? i : { ...i, owner: "", done: false })),
      open: votersOk ? s.open : { ...s.open, options: s.open.options.map((o) => ({ ...o, voters: o.voters.filter((v) => inChat(ctx, v)) })) },
    };
  },

  invariants: {
    "every item owner is no one or someone in the chat": (s, ctx) => s.items.every((i) => i.owner === "" || inChat(ctx, i.owner)),
    "an item with no owner is not done": (s) => s.items.every((i) => i.owner !== "" || !i.done),
    "item ids are unique and the item count never changes": (s) => s.items.length === C.items.length && new Set(s.items.map((i) => i.id)).size === s.items.length,
    "no one votes twice and every voter is in the chat": (s, ctx) =>
      s.open.options.every((o) => new Set(o.voters).size === o.voters.length && o.voters.every((v) => inChat(ctx, v))),
    "option ids and labels are unique, at most 6, each 1 to 40 characters": (s) =>
      s.open.options.length <= MAX_OPTIONS &&
      new Set(s.open.options.map((o) => o.id)).size === s.open.options.length &&
      new Set(s.open.options.map((o) => o.label.toLowerCase())).size === s.open.options.length &&
      s.open.options.every((o) => o.label.length > 0 && o.label.length <= MAX_LABEL && o.label === clean(o.label)),
    "the pick is empty or an existing option": (s) => s.open.picked === "" || s.open.options.some((o) => o.id === s.open.picked),
  },

  transitions: {
    "a claim gives one unowned item to the actor and changes nothing else": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const b = itemOf(p, a.item);
      const c = itemOf(n, a.item);
      return !!b && !!c && b.owner === "" && c.owner === m.user && !c.done && restItems(p, a.item) === restItems(n, a.item) && openSame(p, n);
    },
    "a release clears owner and done on the actor's own item only": (p, n, a, m) => {
      if (a.t !== "release" || p === n) return true;
      const b = itemOf(p, a.item);
      const c = itemOf(n, a.item);
      return !!b && !!c && b.owner === m.user && c.owner === "" && !c.done && restItems(p, a.item) === restItems(n, a.item) && openSame(p, n);
    },
    "done flips only the actor's own item": (p, n, a, m) => {
      if (a.t !== "done" || p === n) return true;
      const b = itemOf(p, a.item);
      const c = itemOf(n, a.item);
      return !!b && !!c && b.owner === m.user && c.owner === b.owner && c.done === !b.done && c.label === b.label && restItems(p, a.item) === restItems(n, a.item) && openSame(p, n);
    },
    "a vote flips the voter on that option and no one else, before a pick": (p, n, a, m) =>
      a.t !== "vote" || p === n || (p.open.picked === "" && votedFor(p, a.option, m.user) !== votedFor(n, a.option, m.user) && optionsOthersSame(p, n, m.user) && itemsSame(p, n)),
    "an added option comes last with the adder's vote": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.open.options.at(-1);
      return (
        typeof a.label === "string" &&
        p.open.picked === "" &&
        n.open.options.length === p.open.options.length + 1 &&
        !!last &&
        last.label === clean(a.label) &&
        last.id === `o${m.seq}` &&
        last.voters.length === 1 &&
        last.voters[0] === m.user &&
        JSON.stringify(n.open.options.slice(0, -1)) === JSON.stringify(p.open.options) &&
        n.open.picked === "" &&
        itemsSame(p, n)
      );
    },
    "a decide picks the named option only when it had the most votes": (p, n, a) => {
      if (a.t !== "decide" || p === n) return true;
      const o = optOf(p, a.option);
      return !!o && p.open.picked === "" && n.open.picked === o.id && o.voters.length > 0 && o.voters.length >= maxVotes(p) && itemsSame(p, n) && JSON.stringify(p.open.options) === JSON.stringify(n.open.options);
    },
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "the date, the later note and the item labels never change": (p, n) =>
      p.date === n.date && p.later === n.later && p.open.label === n.open.label && p.items.map((i) => i.label).join("|") === n.items.map((i) => i.label).join("|"),
  },

  arbitrary: (s, user, r) => {
    const x = r.next();
    const mine = s.items.filter((i) => i.owner === user);
    const free = s.items.filter((i) => i.owner === "");
    if (x < 0.3 && free.length) return { t: "claim", item: r.pick(free).id };
    if (x < 0.5 && mine.length) return { t: "done", item: r.pick(mine).id };
    if (x < 0.56 && mine.length) return { t: "release", item: r.pick(mine).id };
    if (x < 0.75 && s.open.options.length) return { t: "vote", option: r.pick(s.open.options).id };
    if (x < 0.85) return { t: "add", label: r.pick(["Home Alone", "  Klaus ", "", "Elf", "Arthur Christmas", "Paddington"]) };
    if (x < 0.95 && s.open.options.length) return { t: "decide", option: r.pick(s.open.options).id };
    return { t: "claim", item: r.pick(s.items).id };
  },

  local: { panel: false },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((x) => x.id === id)?.name ?? "Someone"));
    const total = state.items.length;
    const doneCount = state.items.filter((i) => i.done).length;
    const mine = state.items.filter((i) => i.owner === me);
    const free = state.items.filter((i) => i.owner === "");

    if (local.panel) {
      return (
        <div>
          <CardHeader title={C.title} subtitle={state.date} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
            <small>Your items · {mine.length}</small>
            <Button kind="deemphasized" onClick={() => setLocal({ panel: false })}>
              Back
            </Button>
          </div>
          <div>
            {mine.map((it) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {it.label}
                  {it.done ? <small> · done</small> : null}
                </span>
                <Button kind="secondary" onClick={() => dispatch({ t: "done", item: it.id })}>
                  {it.done ? "Undo" : "Done"}
                </Button>
                <Button kind="deemphasized" onClick={() => dispatch({ t: "release", item: it.id })}>
                  Release
                </Button>
              </div>
            ))}
            {free.map((it) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36 }}>
                <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
                <Button kind="secondary" onClick={() => dispatch({ t: "claim", item: it.id })}>
                  Take
                </Button>
              </div>
            ))}
            {mine.length === 0 && free.length === 0 ? <small>Nothing to take or mark</small> : null}
          </div>
        </div>
      );
    }

    const people = members.filter((mm) => state.items.some((i) => i.owner === mm.id));
    const pick = optOf(state, state.open.picked);
    const top = state.open.options.reduce<Opt | null>((best, o) => (o.voters.length > 0 && (!best || o.voters.length > best.voters.length) ? o : best), null);

    return (
      <div>
        <CardHeader title={C.title} subtitle={state.date} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
          <small>
            {doneCount} of {total} sorted
          </small>
          <Button kind="deemphasized" onClick={() => setLocal({ panel: true })}>
            My items
          </Button>
        </div>
        {people.map((mm) => (
          <div key={mm.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32, padding: "2px 0" }}>
            <Avatar user={mm} size={20} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{nameOf(mm.id)}</span>{" "}
              <small>
                {state.items
                  .filter((i) => i.owner === mm.id)
                  .map((i) => (i.done ? `${i.label} · done` : i.label))
                  .join(", ")}
              </small>
            </div>
          </div>
        ))}
        {free.length ? (
          <div style={{ padding: "2px 0" }}>
            <small>Unclaimed · {free.map((i) => i.label).join(", ")}</small>
          </div>
        ) : null}
        <div style={{ padding: "6px 0 0" }}>
          <small>Later · {state.later}</small>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
          <small>{pick ? `Picked · ${pick.label}` : `Still open · ${state.open.label}`}</small>
          {!pick && top ? (
            <Button kind="primary" onClick={() => dispatch({ t: "decide", option: top.id })}>
              Decide
            </Button>
          ) : null}
        </div>
        {state.open.options.map((o) => (
          <OptionRow
            key={o.id}
            label={o.label}
            count={o.voters.length}
            total={Math.max(1, members.length)}
            voters={o.voters}
            selected={o.voters.includes(me)}
            onClick={() => dispatch({ t: "vote", option: o.id })}
          />
        ))}
      </div>
    );
  },
});
