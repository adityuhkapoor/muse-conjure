import { defineApp, Button, CardHeader, Facepile, Progress } from "@muse/app";

type Size = "S" | "M" | "L" | "XL";

// Chat content: the order rules, and who already said what.
const C = {
  title: "Hoodie sizes",
  min: 12,
  deadline: "Friday night",
  priceBase: 3800,
  priceBackPrint: 4500,
  backPrintUnder: 20,
  picks: [
    { name: "Jake", size: "L" },
    { name: "Ines", size: "M" },
    { name: "Paige", size: "M" },
    { name: "Mina", size: "S" },
    { name: "Nora", size: "L" },
    { name: "Tyler", size: "L" },
    { name: "Sofia", size: "M" },
    { name: "Sam", size: "XL" },
  ] as { name: string; size: Size }[],
  guests: [
    { host: "Ines", label: "Ines's sister", size: "S" },
    { host: "Tyler", label: "Tyler's roommate", size: "XL" },
  ] as { host: string; label: string; size: Size }[],
};

type Pick = { user: string; size: Size };
type Guest = { id: string; host: string; label: string; size: Size };
type State = {
  min: number;
  deadline: string;
  prices: { base: number; large: number };
  picks: Pick[];
  guests: Guest[];
};
type Action =
  | { t: "set"; size: Size }
  | { t: "out" }
  | { t: "addGuest"; label: string; size: Size }
  | { t: "removeGuest"; id: string };
type Local = { open: boolean; draft: string; size: Size };

const SIZES: Size[] = ["S", "M", "L", "XL"];
const MAX_LABEL = 30;
const MAX_PER_HOST = 3;
const MAX_GUESTS = 12;

const isSize = (x: unknown): x is Size => x === "S" || x === "M" || x === "L" || x === "XL";
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const total = (s: State) => s.picks.length + s.guests.length;
const money = (c: number) => `$${Math.floor(c / 100)}`;
const restPicks = (s: State, u: string) => JSON.stringify(s.picks.filter((p) => p.user !== u));
const sameGuests = (p: State, n: State) => JSON.stringify(p.guests) === JSON.stringify(n.guests);
const samePicks = (p: State, n: State) => JSON.stringify(p.picks) === JSON.stringify(n.picks);

export default defineApp<State, Action, Local>({
  name: "Hoodie tally",
  summary: (s) => `${total(s)} of ${s.min} hoodies · due ${s.deadline}`,

  init: (ctx) => {
    const findId = (name: string) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
    const picks: Pick[] = [];
    for (const p of C.picks) {
      const id = findId(p.name);
      if (id && !picks.some((x) => x.user === id)) picks.push({ user: id, size: p.size });
    }
    const guests: Guest[] = [];
    for (const g of C.guests) {
      const host = findId(g.host);
      if (host) guests.push({ id: `s${guests.length}`, host, label: g.label, size: g.size });
    }
    return { min: C.min, deadline: C.deadline, prices: { base: C.priceBase, large: C.priceBackPrint }, picks, guests };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "set") {
      if (!isSize(a.size)) return s;
      const cur = s.picks.find((p) => p.user === m.user);
      if (cur && cur.size === a.size) return s;
      return {
        ...s,
        picks: cur
          ? s.picks.map((p) => (p.user === m.user ? { ...p, size: a.size } : p))
          : [...s.picks, { user: m.user, size: a.size }],
      };
    }
    if (a.t === "out") {
      if (!s.picks.some((p) => p.user === m.user)) return s;
      return { ...s, picks: s.picks.filter((p) => p.user !== m.user) };
    }
    if (a.t === "addGuest") {
      if (typeof a.label !== "string" || !isSize(a.size)) return s;
      const label = clean(a.label);
      if (!label || label.length > MAX_LABEL) return s;
      if (s.guests.length >= MAX_GUESTS) return s;
      if (s.guests.filter((g) => g.host === m.user).length >= MAX_PER_HOST) return s;
      if (s.guests.some((g) => g.host === m.user && g.label.toLowerCase() === label.toLowerCase())) return s;
      return { ...s, guests: [...s.guests, { id: `g${m.seq}`, host: m.user, label, size: a.size }] };
    }
    if (a.t === "removeGuest") {
      if (typeof a.id !== "string") return s;
      const g = s.guests.find((x) => x.id === a.id);
      if (!g || g.host !== m.user) return s;
      return { ...s, guests: s.guests.filter((x) => x.id !== a.id) };
    }
    return s;
  },

  // Someone left: their pick and the guests they hosted go with them.
  onMembers: (s, ctx) => {
    if (s.picks.every((p) => inChat(ctx, p.user)) && s.guests.every((g) => inChat(ctx, g.host))) return s;
    return {
      ...s,
      picks: s.picks.filter((p) => inChat(ctx, p.user)),
      guests: s.guests.filter((g) => inChat(ctx, g.host)),
    };
  },

  invariants: {
    "each member has at most one pick": (s) => new Set(s.picks.map((p) => p.user)).size === s.picks.length,
    "every pick and guest has a real size": (s) => s.picks.every((p) => isSize(p.size)) && s.guests.every((g) => isSize(g.size)),
    "picks and guest hosts are in the chat": (s, ctx) => s.picks.every((p) => inChat(ctx, p.user)) && s.guests.every((g) => inChat(ctx, g.host)),
    "guest ids are unique, at most 3 per host, at most 12 in all": (s) =>
      new Set(s.guests.map((g) => g.id)).size === s.guests.length &&
      s.guests.length <= MAX_GUESTS &&
      s.guests.every((g) => s.guests.filter((x) => x.host === g.host).length <= MAX_PER_HOST),
    "guest labels are trimmed, 1 to 30 characters": (s) => s.guests.every((g) => g.label.length >= 1 && g.label.length <= MAX_LABEL && g.label === clean(g.label)),
    "the minimum and prices are the ones from the chat": (s) => s.min === C.min && s.prices.base === C.priceBase && s.prices.large === C.priceBackPrint,
  },

  transitions: {
    "setting a size gives the actor that size and changes no one else": (p, n, a, m) =>
      a.t !== "set" || p === n || (n.picks.find((x) => x.user === m.user)?.size === a.size && restPicks(p, m.user) === restPicks(n, m.user) && sameGuests(p, n)),
    "going out removes only the actor's pick": (p, n, a, m) =>
      a.t !== "out" || p === n || (p.picks.some((x) => x.user === m.user) && !n.picks.some((x) => x.user === m.user) && restPicks(p, m.user) === restPicks(n, m.user) && sameGuests(p, n)),
    "adding a guest adds one guest hosted by the actor and changes no picks": (p, n, a, m) => {
      if (a.t !== "addGuest" || p === n) return true;
      const last = n.guests[n.guests.length - 1];
      return (
        n.guests.length === p.guests.length + 1 &&
        !!last &&
        last.host === m.user &&
        last.id === `g${m.seq}` &&
        last.size === a.size &&
        last.label === clean(a.label) &&
        JSON.stringify(n.guests.slice(0, -1)) === JSON.stringify(p.guests) &&
        samePicks(p, n)
      );
    },
    "only a guest's host removes it, and only that guest goes": (p, n, a, m) =>
      a.t !== "removeGuest" ||
      p === n ||
      (p.guests.some((g) => g.id === a.id && g.host === m.user) &&
        JSON.stringify(n.guests) === JSON.stringify(p.guests.filter((g) => g.id !== a.id)) &&
        samePicks(p, n)),
    "only people in the chat change the tally": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "the minimum, deadline and prices never change": (p, n) =>
      p.min === n.min && p.deadline === n.deadline && p.prices.base === n.prices.base && p.prices.large === n.prices.large,
  },

  arbitrary: (s, user, r) => {
    const x = r.next();
    if (x < 0.5) return { t: "set", size: r.pick(SIZES) };
    if (x < 0.6) return { t: "out" };
    if (x < 0.85) return { t: "addGuest", label: r.pick(["Cousin", "Roommate", "  Coach ", "", "Neighbor", "Cousin"]), size: r.pick(SIZES) };
    const mine = s.guests.filter((g) => g.host === user);
    const any = s.guests.length ? r.pick(s.guests) : null;
    return { t: "removeGuest", id: mine.length ? r.pick(mine).id : any ? any.id : "none" };
  },

  local: { open: false, draft: "", size: "M" },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const n = total(state);
    const mineSize = state.picks.find((p) => p.user === me)?.size ?? null;
    const myGuests = state.guests.filter((g) => g.host === me);
    const left = Math.max(0, state.min - n);
    const canAdd = clean(local.draft).length > 0 && myGuests.length < MAX_PER_HOST && state.guests.length < MAX_GUESTS;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "addGuest", label: local.draft.slice(0, MAX_LABEL), size: local.size });
      setLocal({ draft: "" });
    };
    const guestLine = state.guests.length
      ? `Guests · ${state.guests.map((g) => `${g.label} ${g.size}`).join(", ")}`
      : "No guests yet";
    const status =
      left > 0
        ? `${left} more to print · ${money(state.prices.base)} each at ${state.min}`
        : `Enough to print · ${money(state.prices.base)} each · ${money(state.prices.large)} with back print under ${C.backPrintUnder}`;

    return (
      <div>
        <CardHeader title={C.title} subtitle={`${n} of ${state.min} · due ${state.deadline}`} />
        <Progress value={Math.min(n, state.min)} max={state.min} label={`${n} of ${state.min} hoodies · ${state.picks.length} members · ${state.guests.length} guests`} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {SIZES.map((sz) => {
            const faces = state.picks.filter((p) => p.size === sz).map((p) => p.user);
            const count = faces.length + state.guests.filter((g) => g.size === sz).length;
            return (
              <div key={sz} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <Button kind={mineSize === sz ? "primary" : "secondary"} wide onClick={() => dispatch({ t: "set", size: sz })}>
                  {sz}
                </Button>
                <small>{count}</small>
                <div style={{ minHeight: 24 }}>
                  <Facepile users={faces} max={2} size={20} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 4 }}>
          <small>{guestLine}</small>
        </div>
        <div style={{ marginTop: 4 }}>
          <small>{status}</small>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Button kind="secondary" onClick={() => setLocal({ open: !local.open })}>
            {local.open ? "Close" : "Add guest"}
          </Button>
          {mineSize ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "out" })}>
              Out
            </Button>
          ) : (
            <small style={{ alignSelf: "center" }}>Tap your size to be counted</small>
          )}
        </div>
        {local.open ? (
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            <form
              style={{ display: "flex", gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input value={local.draft} maxLength={MAX_LABEL} placeholder="Guest name" aria-label="Guest name" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
              <Button kind="secondary" disabled={!canAdd} onClick={submit}>
                Add
              </Button>
            </form>
            <div style={{ display: "flex", gap: 8 }}>
              {SIZES.map((sz) => (
                <div key={sz} style={{ flex: 1, display: "flex" }}>
                  <Button kind={local.size === sz ? "secondary" : "deemphasized"} wide onClick={() => setLocal({ size: sz })}>
                    {sz}
                  </Button>
                </div>
              ))}
            </div>
            {myGuests.length ? <small>Tap a guest to remove</small> : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {myGuests.map((g) => (
                <Button key={g.id} kind="deemphasized" onClick={() => dispatch({ t: "removeGuest", id: g.id })}>
                  {`${g.label} ${g.size}`}
                </Button>
              ))}
            </div>
            {members.length === 0 ? <small>No one here yet</small> : null}
          </div>
        ) : null}
      </div>
    );
  },
});
