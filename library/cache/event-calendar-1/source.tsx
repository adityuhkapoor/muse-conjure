import { defineApp, Button, CardHeader, Facepile } from "@muse/app";

// Before break: one shared timeline. Everyone taps the dates they are in for. Owners are always in
// and can remove their own date. Friendsgiving sides are listed with who brings what.

const C = {
  title: "Before break timeline",
  events: [
    { day: "Thu Nov 19", when: "", place: "", label: "Abby's orgo midterm", needs: "", owners: ["abby"] },
    { day: "Sat Nov 21", when: "2 PM", place: "The quad", label: "Intramural semis", needs: "Needs people to show up", owners: ["gabe"] },
    { day: "Sat Nov 21", when: "", place: "", label: "Leo's acapella dress rehearsal", needs: "", owners: ["leo"] },
    { day: "Sat Nov 21", when: "", place: "Library until 6", label: "Nora is working", needs: "", owners: ["nora"] },
    { day: "Sun Nov 22", when: "7 PM", place: "The chapel", label: "Leo's acapella show", needs: "", owners: ["leo"] },
    { day: "Mon Nov 23", when: "11-3", place: "Outside the dining hall", label: "Abby's bake sale", needs: "Needs people to sit an hour each", owners: ["abby"] },
    { day: "Tue Nov 24", when: "6 AM", place: "", label: "Maya flies home", needs: "", owners: ["maya"] },
    { day: "Fri Dec 4", when: "7 PM", place: "Nora's · bring a side", label: "Friendsgiving", needs: "", owners: ["nora"] },
  ],
  sides: [
    { label: "Mac n cheese", by: "abby" },
    { label: "Rolls", by: "gabe" },
  ],
  away: [
    { who: "leo", note: "here until Dec 6" },
    { who: "maya", note: "gone before Dec 4" },
  ],
};

type Ev = { id: string; day: string; when: string; label: string; place: string; needs: string; going: string[]; fixed: string[] };
type Side = { id: string; label: string; by: string };
type Away = { user: string; note: string };
type State = { title: string; events: Ev[]; sides: Side[]; away: Away[] };
type Action =
  | { t: "join"; event: string }
  | { t: "add"; day: string; label: string }
  | { t: "remove"; event: string }
  | { t: "bring"; label: string }
  | { t: "drop"; side: string };
type Local = { panel: "none" | "add" | "bring"; day: string; label: string; side: string; all: boolean; confirm: string };
type Ctx = { members: { id: string }[] };

const MAX_EVENTS = 12;
const MAX_SIDES = 8;
const MAX_LABEL = 40;
const MAX_DAY = 12;
const MAX_SIDE = 30;
const SHOWN = 4;

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
const J = (x: unknown) => JSON.stringify(x);
const uniq = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) === i);

function join(s: State, user: string, id: unknown): State {
  const ev = s.events.find((e) => e.id === id);
  if (!ev || ev.fixed.includes(user)) return s;
  const going = ev.going.includes(user) ? ev.going.filter((x) => x !== user) : [...ev.going, user];
  return { ...s, events: s.events.map((e) => (e.id === ev.id ? { ...e, going } : e)) };
}

function add(s: State, user: string, day: unknown, label: unknown, seq: number): State {
  if (typeof day !== "string" || typeof label !== "string") return s;
  const d = tidy(day);
  const l = tidy(label);
  if (!d || !l || d.length > MAX_DAY || l.length > MAX_LABEL || s.events.length >= MAX_EVENTS) return s;
  if (s.events.some((e) => e.day.toLowerCase() === d.toLowerCase() && e.label.toLowerCase() === l.toLowerCase())) return s;
  const ev: Ev = { id: `e${seq}`, day: d, when: "", label: l, place: "", needs: "", going: [user], fixed: [user] };
  return { ...s, events: [...s.events, ev] };
}

function remove(s: State, user: string, id: unknown): State {
  const ev = s.events.find((e) => e.id === id);
  if (!ev || !(ev.fixed.includes(user) || ev.fixed.length === 0)) return s;
  return { ...s, events: s.events.filter((e) => e.id !== ev.id) };
}

function bring(s: State, user: string, label: unknown, seq: number): State {
  if (typeof label !== "string") return s;
  const l = tidy(label);
  if (!l || l.length > MAX_SIDE || s.sides.length >= MAX_SIDES) return s;
  if (s.sides.some((x) => x.by === user || x.label.toLowerCase() === l.toLowerCase())) return s;
  return { ...s, sides: [...s.sides, { id: `s${seq}`, label: l, by: user }] };
}

function drop(s: State, user: string, id: unknown): State {
  const side = s.sides.find((x) => x.id === id);
  if (!side || side.by !== user) return s;
  return { ...s, sides: s.sides.filter((x) => x.id !== side.id) };
}

const ell = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

export default defineApp<State, Action, Local>({
  name: "Before break",
  summary: (s) => {
    const need = s.events.filter((e) => e.needs).length;
    return `${s.title}: ${s.events.length} dates${need ? ` · ${need} need people` : ""}`;
  },

  init: (ctx) => {
    const idOf = (name: string) => ctx.members.find((m) => m.name.toLowerCase() === name)?.id ?? "";
    const events: Ev[] = C.events.map((e, i) => {
      const fixed = uniq(e.owners.map(idOf).filter((x) => x !== ""));
      return { id: `p${i}`, day: e.day, when: e.when, label: e.label, place: e.place, needs: e.needs, going: [...fixed], fixed };
    });
    const sides: Side[] = [];
    C.sides.forEach((x, i) => {
      const by = idOf(x.by);
      if (by && !sides.some((y) => y.by === by)) sides.push({ id: `q${i}`, label: x.label, by });
    });
    const away: Away[] = [];
    for (const x of C.away) {
      const user = idOf(x.who);
      if (user) away.push({ user, note: x.note });
    }
    return { title: C.title, events, sides, away };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    switch (action.t) {
      case "join":
        return join(state, meta.user, action.event);
      case "add":
        return add(state, meta.user, action.day, action.label, meta.seq);
      case "remove":
        return remove(state, meta.user, action.event);
      case "bring":
        return bring(state, meta.user, action.label, meta.seq);
      case "drop":
        return drop(state, meta.user, action.side);
    }
    return state;
  },

  // Someone left: they come off every date, their side and their away note go.
  onMembers: (state, ctx) => {
    const ok = (id: string) => inChat(ctx, id);
    const stale =
      state.events.some((e) => !e.going.every(ok) || !e.fixed.every(ok)) ||
      state.sides.some((x) => !ok(x.by)) ||
      state.away.some((x) => !ok(x.user));
    if (!stale) return state;
    return {
      ...state,
      events: state.events.map((e) => (e.going.every(ok) && e.fixed.every(ok) ? e : { ...e, going: e.going.filter(ok), fixed: e.fixed.filter(ok) })),
      sides: state.sides.filter((x) => ok(x.by)),
      away: state.away.filter((x) => ok(x.user)),
    };
  },

  invariants: {
    "everyone in a date, side or away note is in the chat": (s, ctx) =>
      s.events.every((e) => e.going.every((v) => inChat(ctx, v)) && e.fixed.every((v) => inChat(ctx, v))) &&
      s.sides.every((x) => inChat(ctx, x.by)) &&
      s.away.every((x) => inChat(ctx, x.user)),
    "no one is in a date twice": (s) => s.events.every((e) => new Set(e.going).size === e.going.length),
    "date ids are unique and there are at most 12": (s) => s.events.length <= MAX_EVENTS && new Set(s.events.map((e) => e.id)).size === s.events.length,
    "side ids are unique, at most 8, one side per person": (s) =>
      s.sides.length <= MAX_SIDES && new Set(s.sides.map((x) => x.id)).size === s.sides.length && new Set(s.sides.map((x) => x.by)).size === s.sides.length,
    "every date has a day and a label of 1 to 40 characters": (s) =>
      s.events.every((e) => e.day.length > 0 && e.label.length > 0 && e.label.length <= MAX_LABEL) && s.sides.every((x) => x.label.length > 0 && x.label.length <= MAX_SIDE),
    "owners of a date are always in it": (s) => s.events.every((e) => e.fixed.every((f) => e.going.includes(f))),
  },

  transitions: {
    "a join flips only the actor in that date and touches nothing else": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const pe = p.events.find((e) => e.id === a.event);
      if (!pe || pe.fixed.includes(m.user)) return false;
      const going = pe.going.includes(m.user) ? pe.going.filter((x) => x !== m.user) : [...pe.going, m.user];
      return (
        n.events.length === p.events.length &&
        p.events.every((e, i) => J(n.events[i]) === J(e.id === a.event ? { ...e, going } : e)) &&
        J(p.sides) === J(n.sides) &&
        J(p.away) === J(n.away)
      );
    },
    "an add appends one date last with the actor as owner and in it": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.events.at(-1);
      return (
        n.events.length === p.events.length + 1 &&
        !!last &&
        J(n.events.slice(0, -1)) === J(p.events) &&
        last.id === `e${m.seq}` &&
        last.label === tidy(a.label) &&
        last.day === tidy(a.day) &&
        J(last.fixed) === J([m.user]) &&
        J(last.going) === J([m.user]) &&
        J(p.sides) === J(n.sides)
      );
    },
    "only an owner removes a date, and only that date goes": (p, n, a, m) => {
      if (a.t !== "remove" || p === n) return true;
      const pe = p.events.find((e) => e.id === a.event);
      return !!pe && (pe.fixed.includes(m.user) || pe.fixed.length === 0) && J(n.events) === J(p.events.filter((e) => e.id !== a.event)) && J(p.sides) === J(n.sides);
    },
    "a bring appends one side by the actor and keeps the other sides": (p, n, a, m) => {
      if (a.t !== "bring" || p === n) return true;
      const last = n.sides.at(-1);
      return (
        n.sides.length === p.sides.length + 1 &&
        !!last &&
        J(n.sides.slice(0, -1)) === J(p.sides) &&
        last.id === `s${m.seq}` &&
        last.by === m.user &&
        last.label === tidy(a.label) &&
        J(p.events) === J(n.events)
      );
    },
    "only the person who brings a side drops it, and only that side goes": (p, n, a, m) => {
      if (a.t !== "drop" || p === n) return true;
      const ps = p.sides.find((x) => x.id === a.side);
      return !!ps && ps.by === m.user && J(n.sides) === J(p.sides.filter((x) => x.id !== a.side)) && J(p.events) === J(n.events);
    },
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
    "no action changes the title or the away notes": (p, n) => p.title === n.title && J(p.away) === J(n.away),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (k < 0.45 && s.events.length) return { t: "join", event: r.pick(s.events).id };
    if (k < 0.6) return { t: "add", day: r.pick(["Wed Dec 2", "Thu Dec 3", "Sat Dec 5", ""]), label: r.pick(["Study group", "Pizza night", "Pack the car", "", "Study group"]) };
    if (k < 0.68) {
      const mine = s.events.filter((e) => e.fixed.includes(user));
      if (mine.length) return { t: "remove", event: r.pick(mine).id };
    }
    if (k < 0.85) return { t: "bring", label: r.pick(["Salad", "Pie", "Drinks", "Rolls"]) };
    const side = s.sides.find((x) => x.by === user);
    if (side) return { t: "drop", side: side.id };
    if (s.events.length) return { t: "join", event: r.pick(s.events).id };
    return { t: "add", day: "Wed Dec 2", label: "Study group" };
  },

  local: { panel: "none", day: "", label: "", side: "", all: false, confirm: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const plainName = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const n = state.events.length;
    const need = state.events.filter((e) => e.needs).length;
    const shown = local.all ? state.events : state.events.slice(0, SHOWN);
    const next = state.events.find((e) => !e.going.includes(me));
    const mySide = state.sides.find((x) => x.by === me);
    const canAdd = tidy(local.day).length > 0 && tidy(local.day).length <= MAX_DAY && tidy(local.label).length > 0 && tidy(local.label).length <= MAX_LABEL && n < MAX_EVENTS;
    const canBring = tidy(local.side).length > 0 && tidy(local.side).length <= MAX_SIDE;
    const close = () => setLocal({ panel: "none", day: "", label: "", side: "" });
    const submitAdd = () => {
      if (!canAdd) return;
      dispatch({ t: "add", day: local.day, label: local.label });
      close();
    };
    const submitBring = () => {
      if (!canBring) return;
      dispatch({ t: "bring", label: local.side });
      close();
    };
    const sidesText = state.sides.length ? `Sides · ${state.sides.map((x) => `${x.label} (${nameOf(x.by)})`).join(", ")}` : "Sides · none yet";

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${n === 1 ? "1 date" : `${n} dates`}${need ? ` · ${need} need people` : ""}`} />
        <div style={{ display: "grid", gap: 2 }}>
          {shown.map((e) => {
            const inIt = e.going.includes(me);
            const owned = e.fixed.includes(me);
            const line1 = [e.day, e.when, e.place].filter((x) => x).join(" · ");
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  type="button"
                  aria-pressed={inIt}
                  aria-label={`${e.label}, ${e.day}${inIt ? ", you are in" : ""}`}
                  onClick={() => {
                    if (!owned) dispatch({ t: "join", event: e.id });
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 44,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 8px",
                    borderRadius: theme.radius.button,
                    background: inIt ? theme.color.selected : theme.color.card,
                    color: theme.color.text,
                    textAlign: "left",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <small style={ell}>{line1}</small>
                    <div style={{ ...ell, fontWeight: 600 }}>{e.label}</div>
                    {e.needs ? <small style={ell}>{e.needs}</small> : null}
                  </div>
                  {e.going.length ? <Facepile users={e.going} max={3} size={20} /> : null}
                </button>
                {owned ? (
                  local.confirm === e.id ? (
                    <Button
                      kind="deemphasized"
                      onClick={() => {
                        dispatch({ t: "remove", event: e.id });
                        setLocal({ confirm: "" });
                      }}
                    >
                      Remove
                    </Button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remove ${e.label}`}
                      onClick={() => setLocal({ confirm: e.id })}
                      style={{ width: 44, height: 44, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: theme.color.secondaryText }}
                    >
                      ×
                    </button>
                  )
                ) : null}
              </div>
            );
          })}
        </div>

        {local.panel === "add" ? (
          <form
            style={{ display: "grid", gap: 8, marginTop: 8 }}
            onSubmit={(ev) => {
              ev.preventDefault();
              submitAdd();
            }}
          >
            <input value={local.day} maxLength={MAX_DAY} placeholder="Day, like Wed Dec 2" aria-label="Day" onInput={(ev) => setLocal({ day: ev.currentTarget.value })} />
            <input value={local.label} maxLength={MAX_LABEL} placeholder="What is happening" aria-label="What is happening" onInput={(ev) => setLocal({ label: ev.currentTarget.value })} />
            <div style={{ display: "flex", gap: 8 }}>
              <Button kind="primary" disabled={!canAdd} onClick={submitAdd}>
                Add
              </Button>
              <Button kind="deemphasized" onClick={close}>
                Cancel
              </Button>
            </div>
          </form>
        ) : local.panel === "bring" ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}
            onSubmit={(ev) => {
              ev.preventDefault();
              submitBring();
            }}
          >
            <input style={{ flex: 1, minWidth: 0 }} value={local.side} maxLength={MAX_SIDE} placeholder="Your side" aria-label="Your side" onInput={(ev) => setLocal({ side: ev.currentTarget.value })} />
            <Button kind="primary" disabled={!canBring} onClick={submitBring}>
              Add
            </Button>
            <Button kind="deemphasized" onClick={close}>
              Cancel
            </Button>
          </form>
        ) : (
          <div style={{ marginTop: 6 }}>
            <small style={ell}>{next ? `Up next · ${next.day} · ${next.label}` : "You are in on every date"}</small>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
              <Button
                kind="primary"
                disabled={!next}
                onClick={() => {
                  if (next) dispatch({ t: "join", event: next.id });
                }}
              >
                I'm in
              </Button>
              <Button kind="secondary" disabled={n >= MAX_EVENTS} onClick={() => setLocal({ panel: "add" })}>
                Add date
              </Button>
              {n > SHOWN ? (
                <Button kind="deemphasized" onClick={() => setLocal({ all: !local.all })}>
                  {local.all ? "Show less" : "Show all"}
                </Button>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
              <small style={{ flex: 1, minWidth: 0 }}>{sidesText}</small>
              {mySide ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "drop", side: mySide.id })}>
                  Drop side
                </Button>
              ) : (
                <Button kind="deemphasized" disabled={state.sides.length >= MAX_SIDES} onClick={() => setLocal({ panel: "bring" })}>
                  I'll bring
                </Button>
              )}
            </div>
            {state.away.length && !local.all ? <small style={ell}>{state.away.map((x) => `${plainName(x.user)} ${x.note}`).join(" · ")}</small> : null}
          </div>
        )}
      </div>
    );
  },
});
