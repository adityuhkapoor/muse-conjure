import { defineApp, Avatar, Button, CardHeader } from "@muse/app";

// Headcount for the friendsgiving turkey: who is coming, plus ones included.

const CHAT = {
  title: "Who's coming to friendsgiving?",
  host: "Lena",
  maxPlus: 3,
  plusLocked: true,
  people: [
    { name: "Lena", plus: [] as string[] },
    { name: "Kofi", plus: ["Tara"] },
    { name: "Maya", plus: ["Sam"] },
    { name: "Rhea", plus: [] as string[] },
  ],
};

type Status = "going" | "no";
type Plus = { id: string; name: string };
type Guest = { id: string; status: Status; plus: Plus[] };
type State = { host: string; plusLocked: boolean; maxPlus: number; guests: Guest[] };
type Action =
  | { t: "rsvp"; status: Status }
  | { t: "addPlus"; name: string }
  | { t: "removePlus"; plus: string }
  | { t: "lock"; locked: boolean };
type Local = { draft: string };

const MAX_NAME = 30;
const clean = (x: string) => x.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const entry = (s: State, id: string) => s.guests.find((g) => g.id === id);
const plusCount = (s: State) => s.guests.reduce((n, g) => n + g.plus.length, 0);
const goingCount = (s: State) => s.guests.filter((g) => g.status === "going").length;
const headcount = (s: State) => goingCount(s) + plusCount(s);
const othersSame = (p: State, n: State, user: string) =>
  JSON.stringify(p.guests.filter((g) => g.id !== user)) === JSON.stringify(n.guests.filter((g) => g.id !== user));
const allPlusIds = (s: State) => s.guests.flatMap((g) => g.plus.map((x) => x.id));
const plusWord = (n: number) => (n === 1 ? "plus one" : "plus ones");

export default defineApp<State, Action, Local>({
  name: "Headcount",
  summary: (s) => `${headcount(s)} coming · ${goingCount(s)} people, ${plusCount(s)} ${plusWord(plusCount(s))}`,

  init: (ctx) => {
    const host = ctx.members.find((m) => m.name.toLowerCase() === CHAT.host.toLowerCase())?.id ?? ctx.members[0]?.id ?? "";
    let k = 0;
    const guests: Guest[] = [];
    for (const p of CHAT.people) {
      const mem = ctx.members.find((m) => m.name.toLowerCase() === p.name.toLowerCase());
      if (!mem || guests.some((g) => g.id === mem.id)) continue;
      guests.push({ id: mem.id, status: "going", plus: p.plus.map((name) => ({ id: `c${k++}`, name })) });
    }
    return { host, plusLocked: CHAT.plusLocked, maxPlus: CHAT.maxPlus, guests };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const me = m.user;
    const cur = entry(s, me);
    if (a.t === "rsvp") {
      if (a.status !== "going" && a.status !== "no") return s;
      if (cur && cur.status === a.status) return s;
      if (!cur) return { ...s, guests: [...s.guests, { id: me, status: a.status, plus: [] }] };
      return { ...s, guests: s.guests.map((g) => (g.id === me ? { ...g, status: a.status, plus: a.status === "no" ? [] : g.plus } : g)) };
    }
    if (a.t === "addPlus") {
      if (!cur || cur.status !== "going") return s;
      if (s.plusLocked && me !== s.host) return s;
      if (typeof a.name !== "string") return s;
      const name = clean(a.name);
      if (!name || name.length > MAX_NAME || cur.plus.length >= s.maxPlus) return s;
      if (cur.plus.some((p) => p.name.toLowerCase() === name.toLowerCase())) return s;
      return { ...s, guests: s.guests.map((g) => (g.id === me ? { ...g, plus: [...g.plus, { id: `p${m.seq}`, name }] } : g)) };
    }
    if (a.t === "removePlus") {
      if (!cur || typeof a.plus !== "string") return s;
      if (!cur.plus.some((p) => p.id === a.plus)) return s;
      return { ...s, guests: s.guests.map((g) => (g.id === me ? { ...g, plus: g.plus.filter((p) => p.id !== a.plus) } : g)) };
    }
    if (a.t === "lock") {
      if (me !== s.host || typeof a.locked !== "boolean" || a.locked === s.plusLocked) return s;
      return { ...s, plusLocked: a.locked };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const guests = s.guests.filter((g) => inChat(ctx, g.id));
    const host = ctx.members.length === 0 || inChat(ctx, s.host) ? s.host : ctx.members[0]!.id;
    if (guests.length === s.guests.length && host === s.host) return s;
    return { ...s, guests, host };
  },

  invariants: {
    "each guest appears once and is in the chat": (s, ctx) =>
      new Set(s.guests.map((g) => g.id)).size === s.guests.length && s.guests.every((g) => inChat(ctx, g.id)),
    "anyone who can't go has no plus ones": (s) => s.guests.every((g) => g.status === "going" || g.plus.length === 0),
    "no one has more plus ones than the limit": (s) => s.guests.every((g) => g.plus.length <= s.maxPlus),
    "plus one ids are unique and names are 1 to 30 clean characters": (s) =>
      new Set(allPlusIds(s)).size === allPlusIds(s).length &&
      s.guests.every((g) => g.plus.every((p) => p.name.length >= 1 && p.name.length <= MAX_NAME && p.name === clean(p.name))),
    "the host is in the chat": (s, ctx) => ctx.members.length === 0 || inChat(ctx, s.host),
    "headcount is the people going plus all plus ones, within the limit": (s, ctx) =>
      headcount(s) === s.guests.filter((g) => g.status === "going").length + s.guests.reduce((n, g) => n + g.plus.length, 0) &&
      headcount(s) <= Math.max(1, ctx.members.length) * (1 + s.maxPlus),
  },

  transitions: {
    "an rsvp sets the actor's own status and no one else's": (p, n, a, m) => {
      if (a.t !== "rsvp" || p === n) return true;
      const mine = entry(n, m.user);
      const before = entry(p, m.user);
      return (
        !!mine &&
        mine.status === a.status &&
        othersSame(p, n, m.user) &&
        p.plusLocked === n.plusLocked &&
        (a.status === "no" ? mine.plus.length === 0 : (before?.plus.length ?? 0) === mine.plus.length)
      );
    },
    "an added plus one is named as asked, goes to the actor, and no one else changes": (p, n, a, m) => {
      if (a.t !== "addPlus" || p === n) return true;
      const before = entry(p, m.user);
      const after = entry(n, m.user);
      if (!before || !after || typeof a.name !== "string") return false;
      const last = after.plus.at(-1);
      return after.plus.length === before.plus.length + 1 && !!last && last.name === clean(a.name) && last.id === `p${m.seq}` && othersSame(p, n, m.user);
    },
    "a removed plus one leaves the actor's own list and nothing else changes": (p, n, a, m) => {
      if (a.t !== "removePlus" || p === n) return true;
      const before = entry(p, m.user);
      const after = entry(n, m.user);
      return (
        !!before && !!after && before.plus.some((x) => x.id === a.plus) && after.plus.length === before.plus.length - 1 && !after.plus.some((x) => x.id === a.plus) && othersSame(p, n, m.user)
      );
    },
    "only the host changes whether plus ones are open, and nothing else changes with it": (p, n, a, m) => {
      if (p.plusLocked === n.plusLocked) return a.t !== "lock" || p === n || false;
      return a.t === "lock" && m.user === p.host && n.plusLocked === a.locked && p.guests === n.guests;
    },
    "while plus ones are closed, only the host adds one": (p, n, a, m) =>
      a.t !== "addPlus" || p === n || !p.plusLocked || m.user === p.host,
    "the host and the limit never change from an action": (p, n) => p.host === n.host && p.maxPlus === n.maxPlus,
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const mine = entry(s, user);
    const x = r.next();
    if (!mine || x < 0.1) return { t: "rsvp", status: !mine ? "going" : r.pick<Status>(["going", "no"]) };
    if (mine.status === "going" && x < 0.5) return { t: "addPlus", name: r.pick(["Tara", "Sam", "Jo", "", "  Priya ", "Alex"]) };
    if (x < 0.65 && mine.plus.length) return { t: "removePlus", plus: r.next() < 0.8 ? r.pick(mine.plus).id : "zz" };
    if (x < 0.85) return { t: "lock", locked: r.next() < 0.5 };
    return { t: "rsvp", status: r.pick<Status>(["going", "going", "no"]) };
  },

  local: { draft: "" },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const total = headcount(state);
    const plusN = plusCount(state);
    const goingN = goingCount(state);
    const mine = entry(state, me);
    const isHost = me === state.host;
    const going = mine?.status === "going";
    const canAdd = going && (!state.plusLocked || isHost) && (mine?.plus.length ?? 0) < state.maxPlus;
    const draft = clean(local.draft);
    const answered = state.guests.length;
    const ordered = [...members.filter((m) => m.id === me), ...members.filter((m) => m.id !== me)];
    const submit = () => {
      if (!canAdd || !draft) return;
      dispatch({ t: "addPlus", name: local.draft.slice(0, MAX_NAME) });
      setLocal({ draft: "" });
    };
    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={`${answered} of ${members.length} answered`} />
        <div style={{ marginTop: 4 }}>
          <h2 style={{ margin: 0 }}>{`${total} coming`}</h2>
          <small>{`${goingN} people + ${plusN} ${plusWord(plusN)} · ${state.plusLocked ? "plus ones closed" : "plus ones open"}`}</small>
        </div>
        <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
          {ordered.map((m) => {
            const g = entry(state, m.id);
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 34 }}>
                <Avatar user={m} size={24} />
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.id === me ? "You" : m.name}
                  {m.id === state.host ? <small>{" · host"}</small> : null}
                </div>
                {g && g.status === "going" && g.plus.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end", maxWidth: "55%" }}>
                    {g.plus.map((p) => (
                      <span
                        key={p.id}
                        style={{
                          background: "var(--color-input)",
                          color: "var(--color-text)",
                          borderRadius: 999,
                          padding: "2px 8px",
                          maxWidth: 90,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 13,
                        }}
                      >
                        {p.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <small>{!g ? "No answer" : g.status === "going" ? "Going" : "Can't go"}</small>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
          {!going ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Button kind="primary" onClick={() => dispatch({ t: "rsvp", status: "going" })}>
                Going
              </Button>
              {!mine ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "rsvp", status: "no" })}>
                  Can't go
                </Button>
              ) : null}
            </div>
          ) : null}
          {canAdd ? (
            <form
              style={{ display: "flex", gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input value={local.draft} maxLength={MAX_NAME} placeholder="Plus one's name" aria-label="Plus one's name" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
              <Button kind="secondary" disabled={!draft} onClick={submit}>
                Add
              </Button>
            </form>
          ) : null}
          {going || isHost ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {going && mine
                ? mine.plus.map((p) => (
                    <Button key={p.id} kind="deemphasized" onClick={() => dispatch({ t: "removePlus", plus: p.id })}>
                      {`Remove ${p.name.slice(0, 10)}`}
                    </Button>
                  ))
                : null}
              {going ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "rsvp", status: "no" })}>
                  Can't go
                </Button>
              ) : null}
              {isHost ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "lock", locked: !state.plusLocked })}>
                  {state.plusLocked ? "Reopen" : "Close"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  },
});
