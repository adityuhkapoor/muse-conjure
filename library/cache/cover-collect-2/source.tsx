import { defineApp, Avatar, Button, CardHeader, Progress } from "@muse/app";

// Door checklist for the cover charge. Everyone can say "sent it"; only the host ticks people
// as paid. Guests (plus-ones) are separate rows owned by whoever brought them.

const C = {
  title: "Who paid the $10?",
  coverCents: 1000,
  doorCents: 1500,
  venmo: "@jalen-k",
  host: "jalen",
  paidNames: ["paige"],
  saidNames: ["bryan", "marcus"],
  guestGroups: [{ host: "naomi", count: 3 }],
  maxGuests: 8,
};

type Guest = { id: string; host: string; name: string; paid: boolean };
type State = { host: string; cover: number; doorPrice: number; paid: string[]; said: string[]; guests: Guest[] };
type Action =
  | { t: "tick"; person: string }
  | { t: "say" }
  | { t: "tickGuest"; guest: string }
  | { t: "addGuest" }
  | { t: "removeGuest"; guest: string };
type Local = { open: boolean };
type Ctx = { members: { id: string }[] };

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => `$${Math.floor(c / 100)}`;
const rest = (xs: string[], id: string) => xs.filter((x) => x !== id).join("|");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const guestPaid = (s: State) => s.guests.filter((g) => g.paid).length;
const payersOf = (s: State, ctx: Ctx) => ctx.members.filter((m) => m.id !== s.host);

export default defineApp<State, Action, Local>({
  name: "Door checklist",
  summary: (s, ctx) => {
    const total = payersOf(s, ctx).length + s.guests.length;
    return `${C.title} ${s.paid.length + guestPaid(s)} of ${total} paid.`;
  },

  init: (ctx) => {
    const find = (name: string) => ctx.members.find((m) => m.name.toLowerCase() === name)?.id;
    const host = find(C.host) ?? ctx.members[0]?.id ?? "";
    const pick = (names: string[]) => names.map(find).filter((x): x is string => !!x && x !== host);
    const paid = [...new Set(pick(C.paidNames))];
    const said = [...new Set(pick(C.saidNames))].filter((u) => !paid.includes(u));
    const guests: Guest[] = [];
    for (const grp of C.guestGroups) {
      const h = find(grp.host);
      if (!h) continue;
      for (let i = 0; i < grp.count && guests.length < C.maxGuests; i++) {
        guests.push({ id: `s${guests.length}`, host: h, name: `Guest ${guests.length + 1}`, paid: false });
      }
    }
    return { host, cover: C.coverCents, doorPrice: C.doorCents, paid, said, guests };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const isHost = m.user === s.host;
    switch (a.t) {
      case "tick": {
        const p = a.person;
        if (!isHost || typeof p !== "string" || p === s.host || !inChat(ctx, p)) return s;
        if (s.paid.includes(p)) return { ...s, paid: s.paid.filter((x) => x !== p) };
        return { ...s, paid: [...s.paid, p], said: s.said.filter((x) => x !== p) };
      }
      case "say": {
        if (isHost || s.paid.includes(m.user)) return s;
        return { ...s, said: s.said.includes(m.user) ? s.said.filter((x) => x !== m.user) : [...s.said, m.user] };
      }
      case "tickGuest": {
        if (!isHost || typeof a.guest !== "string" || !s.guests.some((g) => g.id === a.guest)) return s;
        return { ...s, guests: s.guests.map((g) => (g.id === a.guest ? { ...g, paid: !g.paid } : g)) };
      }
      case "addGuest": {
        if (s.guests.length >= C.maxGuests) return s;
        const g: Guest = { id: `g${m.seq}`, host: m.user, name: `Guest ${s.guests.length + 1}`, paid: false };
        return { ...s, guests: [...s.guests, g] };
      }
      case "removeGuest": {
        const g = typeof a.guest === "string" ? s.guests.find((x) => x.id === a.guest) : undefined;
        if (!g || (m.user !== g.host && !isHost)) return s;
        return { ...s, guests: s.guests.filter((x) => x.id !== g.id) };
      }
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const host = inChat(ctx, s.host) ? s.host : (ctx.members[0]?.id ?? "");
    const ok = (u: string) => inChat(ctx, u) && u !== host;
    const paid = s.paid.filter(ok);
    const said = s.said.filter(ok);
    const guests = s.guests.filter((g) => inChat(ctx, g.host));
    if (host === s.host && paid.length === s.paid.length && said.length === s.said.length && guests.length === s.guests.length) return s;
    return { ...s, host, paid, said, guests };
  },

  invariants: {
    "no one is ticked paid twice": (s) => new Set(s.paid).size === s.paid.length,
    "no one says sent twice": (s) => new Set(s.said).size === s.said.length,
    "paid and sent lists hold only people in the chat, never the host": (s, ctx) =>
      [...s.paid, ...s.said].every((u) => inChat(ctx, u) && u !== s.host),
    "nobody is both paid and waiting to be checked": (s) => s.paid.every((u) => !s.said.includes(u)),
    "guests belong to people in the chat, have unique ids, at most 8": (s, ctx) =>
      s.guests.length <= C.maxGuests && new Set(s.guests.map((g) => g.id)).size === s.guests.length && s.guests.every((g) => inChat(ctx, g.host)),
    "the host is in the chat whenever the chat has people": (s, ctx) => (ctx.members.length === 0 ? s.host === "" : inChat(ctx, s.host)),
    "cover is $10 and door is $15": (s) => s.cover === C.coverCents && s.doorPrice === C.doorCents,
  },

  transitions: {
    "a tick flips only that person, clears their sent note and changes nothing else": (p, n, a, m) =>
      a.t !== "tick" ||
      p === n ||
      (m.user === p.host &&
        typeof a.person === "string" &&
        p.paid.includes(a.person) !== n.paid.includes(a.person) &&
        rest(p.paid, a.person) === rest(n.paid, a.person) &&
        (!n.paid.includes(a.person) || !n.said.includes(a.person)) &&
        rest(p.said, a.person) === rest(n.said, a.person) &&
        same(p.guests, n.guests)),
    "only the host changes who has paid": (p, n, a, m) =>
      (p.paid.join("|") === n.paid.join("|") && p.guests.map((g) => g.paid).join() === n.guests.map((g) => g.paid).join()) ||
      m.user === p.host ||
      a.t === "removeGuest" ||
      a.t === "addGuest",
    "a guest tick flips only that guest, by the host": (p, n, a, m) =>
      a.t !== "tickGuest" ||
      p === n ||
      (m.user === p.host &&
        p.guests.length === n.guests.length &&
        p.guests.every((g, i) => (g.id === a.guest ? n.guests[i]!.paid !== g.paid && n.guests[i]!.id === g.id : same(g, n.guests[i]))) &&
        p.paid.join() === n.paid.join()),
    "saying sent flips only the actor in the sent list": (p, n, a, m) =>
      a.t !== "say" ||
      p === n ||
      (p.said.includes(m.user) !== n.said.includes(m.user) && rest(p.said, m.user) === rest(n.said, m.user) && p.paid.join() === n.paid.join() && same(p.guests, n.guests)),
    "adding a guest adds one unpaid guest owned by the actor": (p, n, a, m) => {
      if (a.t !== "addGuest" || p === n) return true;
      const last = n.guests.at(-1);
      return (
        n.guests.length === p.guests.length + 1 &&
        !!last &&
        last.host === m.user &&
        !last.paid &&
        last.id === `g${m.seq}` &&
        same(p.guests, n.guests.slice(0, -1)) &&
        p.paid.join() === n.paid.join() &&
        p.said.join() === n.said.join()
      );
    },
    "removing a guest removes one, by its owner or the host": (p, n, a, m) => {
      if (a.t !== "removeGuest" || p === n) return true;
      const g = p.guests.find((x) => x.id === a.guest);
      return !!g && (m.user === g.host || m.user === p.host) && n.guests.length === p.guests.length - 1 && !n.guests.some((x) => x.id === g.id) && p.paid.join() === n.paid.join();
    },
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "an action never changes the host, cover or door price": (p, n) => p.host === n.host && p.cover === n.cover && p.doorPrice === n.doorPrice,
  },

  arbitrary: (s, user, r, ctx) => {
    const ids = ctx.members.map((m) => m.id);
    if (ids.length === 0) return { t: "say" };
    const k = r.next();
    if (user === s.host) {
      if (k < 0.55) return { t: "tick", person: r.pick(ids) };
      if (k < 0.7 && s.guests.length) return { t: "tickGuest", guest: r.pick(s.guests).id };
      if (k < 0.8) return { t: "addGuest" };
      if (k < 0.88 && s.guests.length) return { t: "removeGuest", guest: r.pick(s.guests).id };
      if (k < 0.94) return { t: "tickGuest", guest: "nope" };
      return { t: "tick", person: "nobody" };
    }
    if (k < 0.45) return { t: "say" };
    if (k < 0.65) return { t: "addGuest" };
    if (k < 0.75) return { t: "tick", person: r.pick(ids) };
    if (k < 0.88 && s.guests.length) return { t: "removeGuest", guest: r.pick(s.guests).id };
    if (k < 0.94) return { t: "tickGuest", guest: s.guests.length ? r.pick(s.guests).id : "nope" };
    return { t: "say" };
  },

  local: { open: false },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const isHost = me === state.host;
    const payers = members
      .filter((m) => m.id !== state.host)
      .slice()
      .sort((a, b) => Number(state.paid.includes(a.id)) - Number(state.paid.includes(b.id)));
    const total = payers.length + state.guests.length;
    const done = state.paid.length + guestPaid(state);
    const left = Math.max(0, total - done);
    const row = { display: "flex", alignItems: "center", gap: 8, minHeight: 44, flexWrap: "wrap" as const };
    return (
      <div>
        <CardHeader
          title={C.title}
          subtitle={left === 0 ? "Everyone has paid" : `${money(left * state.cover)} still to collect · ${nameOf(state.host) === "You" ? "you tick" : nameOf(state.host) + " ticks"}`}
        />
        <Progress value={done} max={Math.max(1, total)} label={`${done} of ${total} paid`} />
        <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
          {payers.map((m) => {
            const paid = state.paid.includes(m.id);
            const said = state.said.includes(m.id);
            return (
              <div key={m.id} style={row}>
                <Avatar user={m} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(m.id)}</div>
                  <small>{paid ? "Paid" : said ? "Says sent · check Venmo" : "Not yet"}</small>
                </div>
                {isHost ? (
                  <Button kind={paid ? "deemphasized" : "secondary"} onClick={() => dispatch({ t: "tick", person: m.id })}>
                    {paid ? "Undo" : "Mark paid"}
                  </Button>
                ) : m.id === me && !paid ? (
                  <Button kind={said ? "deemphasized" : "primary"} onClick={() => dispatch({ t: "say" })}>
                    {said ? "Undo" : "Sent it"}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        <div style={{ ...row, justifyContent: "space-between" }}>
          <small>{`${state.guests.length} guests · ${guestPaid(state)} paid`}</small>
          <Button kind="deemphasized" onClick={() => setLocal({ open: !local.open })}>
            {local.open ? "Hide guests" : "Show guests"}
          </Button>
        </div>
        {local.open ? (
          <div style={{ display: "grid", gap: 2 }}>
            {state.guests.map((g) => (
              <div key={g.id} style={row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{g.name}</div>
                  <small>{`${g.paid ? "Paid" : "Not yet"} · with ${nameOf(g.host).replace("You", "you")}`}</small>
                </div>
                {isHost ? (
                  <Button kind={g.paid ? "deemphasized" : "secondary"} onClick={() => dispatch({ t: "tickGuest", guest: g.id })}>
                    {g.paid ? "Undo" : "Mark paid"}
                  </Button>
                ) : null}
                {isHost || g.host === me ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "removeGuest", guest: g.id })}>
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
            {state.guests.length < C.maxGuests ? (
              <div style={row}>
                <Button kind="secondary" onClick={() => dispatch({ t: "addGuest" })}>
                  Add guest
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        <small style={{ display: "block", marginTop: 4 }}>{`Venmo ${C.venmo} · door is ${money(state.doorPrice)}`}</small>
      </div>
    );
  },
});
