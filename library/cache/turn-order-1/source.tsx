import { defineApp, Avatar, Button, CardHeader } from "@muse/app";

// Shower order: three windows, up to 4 showers each (the hot water tank is about 40 gal).
// Everyone takes one slot, can move up or down, mark a long one, and leave a short note.

const CHAT = {
  title: "Who showers when?",
  windows: [
    { id: "w0", label: "Fri night", cap: 4 },
    { id: "w1", label: "Sat am", cap: 4 },
    { id: "w2", label: "Sun am", cap: 4 },
  ],
  notes: [
    { name: "Zoe", text: "Out by 8:15 Sat" },
    { name: "Rhea", text: "Long one, first on Sat" },
    { name: "Ravi", text: "Night slot, last in the mornings" },
    { name: "Dani", text: "Wants a long one" },
    { name: "Cam", text: "First on Sun, 10 min cap" },
  ],
};

type Slot = { user: string; long: boolean };
type Win = { id: string; label: string; cap: number; slots: Slot[] };
type Note = { user: string; text: string };
type State = { windows: Win[]; notes: Note[] };
type Action =
  | { t: "take"; window: string }
  | { t: "leave" }
  | { t: "move"; window: string; dir: number }
  | { t: "long"; window: string }
  | { t: "note"; text: string };
type Local = { notes: boolean; draft: string };

const MAX_NOTE = 40;
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const holds = (s: State, u: string) => s.windows.filter((w) => w.slots.some((x) => x.user === u)).length;
const flat = (s: State) => s.windows.flatMap((w) => w.slots.map((x) => ({ w: w.id, u: x.user, l: x.long })));
/** Every window's slots with `u` removed, so two states can be compared without that person. */
const others = (s: State, u: string) => JSON.stringify(s.windows.map((w) => w.slots.filter((x) => x.user !== u)));
const filled = (s: State) => new Set(s.windows.flatMap((w) => w.slots.map((x) => x.user))).size;

function take(s: State, user: string, wid: unknown): State {
  if (typeof wid !== "string") return s;
  const w = s.windows.find((x) => x.id === wid);
  if (!w || w.slots.length >= w.cap || w.slots.some((x) => x.user === user)) return s;
  return {
    ...s,
    windows: s.windows.map((x) => (x.id === w.id ? { ...x, slots: [...x.slots, { user, long: false }] } : { ...x, slots: x.slots.filter((y) => y.user !== user) })),
  };
}

function leave(s: State, user: string): State {
  if (holds(s, user) === 0) return s;
  return { ...s, windows: s.windows.map((w) => ({ ...w, slots: w.slots.filter((x) => x.user !== user) })) };
}

function move(s: State, user: string, wid: unknown, dir: unknown): State {
  if (typeof wid !== "string" || (dir !== -1 && dir !== 1)) return s;
  const w = s.windows.find((x) => x.id === wid);
  if (!w) return s;
  const i = w.slots.findIndex((x) => x.user === user);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= w.slots.length) return s;
  const slots = [...w.slots];
  slots[i] = w.slots[j]!;
  slots[j] = w.slots[i]!;
  return { ...s, windows: s.windows.map((x) => (x.id === w.id ? { ...x, slots } : x)) };
}

function toggleLong(s: State, user: string, wid: unknown): State {
  if (typeof wid !== "string") return s;
  const w = s.windows.find((x) => x.id === wid);
  if (!w || !w.slots.some((x) => x.user === user)) return s;
  return { ...s, windows: s.windows.map((x) => (x.id === w.id ? { ...x, slots: x.slots.map((y) => (y.user === user ? { ...y, long: !y.long } : y)) } : x)) };
}

function note(s: State, user: string, raw: unknown): State {
  if (typeof raw !== "string") return s;
  const text = raw.trim();
  if (text.length > MAX_NOTE) return s;
  const cur = s.notes.find((x) => x.user === user);
  if (text === "") return cur ? { ...s, notes: s.notes.filter((x) => x.user !== user) } : s;
  if (cur && cur.text === text) return s;
  return { ...s, notes: cur ? s.notes.map((x) => (x.user === user ? { user, text } : x)) : [...s.notes, { user, text }] };
}

export default defineApp<State, Action, Local>({
  name: "Shower order",
  summary: (s, ctx) => `${CHAT.title} ${filled(s)} of ${ctx.members.length} have a slot.`,

  init: (ctx) => {
    const notes: Note[] = [];
    for (const n of CHAT.notes) {
      const m = ctx.members.find((x) => x.name.toLowerCase() === n.name.toLowerCase());
      if (m && !notes.some((x) => x.user === m.id)) notes.push({ user: m.id, text: n.text.slice(0, MAX_NOTE) });
    }
    return { windows: CHAT.windows.map((w) => ({ id: w.id, label: w.label, cap: w.cap, slots: [] })), notes };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "take") return take(state, meta.user, action.window);
    if (action.t === "leave") return leave(state, meta.user);
    if (action.t === "move") return move(state, meta.user, action.window, action.dir);
    if (action.t === "long") return toggleLong(state, meta.user, action.window);
    if (action.t === "note") return note(state, meta.user, action.text);
    return state;
  },

  // Someone left: their slot and their note go with them.
  onMembers: (state, ctx) => {
    const slotsOk = state.windows.every((w) => w.slots.every((x) => inChat(ctx, x.user)));
    const notesOk = state.notes.every((x) => inChat(ctx, x.user));
    if (slotsOk && notesOk) return state;
    return {
      windows: slotsOk ? state.windows : state.windows.map((w) => ({ ...w, slots: w.slots.filter((x) => inChat(ctx, x.user)) })),
      notes: notesOk ? state.notes : state.notes.filter((x) => inChat(ctx, x.user)),
    };
  },

  invariants: {
    "each person holds at most one slot": (s) => {
      const all = s.windows.flatMap((w) => w.slots.map((x) => x.user));
      return new Set(all).size === all.length;
    },
    "no window has more slots than its cap": (s) => s.windows.every((w) => w.slots.length <= w.cap),
    "everyone in a slot or a note is in the chat": (s, ctx) => s.windows.every((w) => w.slots.every((x) => inChat(ctx, x.user))) && s.notes.every((x) => inChat(ctx, x.user)),
    "the three windows keep their ids, labels and caps": (s) =>
      s.windows.length === CHAT.windows.length && s.windows.every((w, i) => w.id === CHAT.windows[i]!.id && w.label === CHAT.windows[i]!.label && w.cap === CHAT.windows[i]!.cap),
    "each person has at most one note, trimmed, 1 to 40 characters": (s) =>
      new Set(s.notes.map((x) => x.user)).size === s.notes.length && s.notes.every((x) => x.text.length > 0 && x.text.length <= MAX_NOTE && x.text === x.text.trim()),
  },

  transitions: {
    "a take puts the actor last in that window and leaves everyone else's order as it was": (p, n, a, m) => {
      if (a.t !== "take" || p === n) return true;
      const before = p.windows.find((x) => x.id === a.window);
      const after = n.windows.find((x) => x.id === a.window);
      const last = after?.slots.at(-1);
      return (
        !!before && !before.slots.some((x) => x.user === m.user) && !!last && last.user === m.user && !last.long &&
        holds(n, m.user) === 1 && others(p, m.user) === others(n, m.user) && n.notes === p.notes
      );
    },
    "a leave removes only the actor's slot": (p, n, a, m) =>
      a.t !== "leave" || p === n || (holds(p, m.user) === 1 && holds(n, m.user) === 0 && others(p, m.user) === others(n, m.user) && n.notes === p.notes),
    "a move swaps the actor with one neighbour in the same window and changes nothing else": (p, n, a, m) => {
      if (a.t !== "move" || p === n) return true;
      const w = p.windows.find((x) => x.id === a.window);
      if (!w) return false;
      const i = w.slots.findIndex((x) => x.user === m.user);
      const j = i + a.dir;
      if (i < 0 || j < 0 || j >= w.slots.length || (a.dir !== -1 && a.dir !== 1)) return false;
      const swapped = [...w.slots];
      swapped[i] = w.slots[j]!;
      swapped[j] = w.slots[i]!;
      const expected = p.windows.map((x) => (x.id === w.id ? { ...x, slots: swapped } : x));
      return JSON.stringify(expected) === JSON.stringify(n.windows) && n.notes === p.notes;
    },
    "a long toggle flips only the actor's flag in that window": (p, n, a, m) => {
      if (a.t !== "long" || p === n) return true;
      const pf = flat(p);
      const nf = flat(n);
      if (pf.length !== nf.length || n.notes !== p.notes) return false;
      let changed = 0;
      for (let i = 0; i < pf.length; i++) {
        const x = pf[i]!;
        const y = nf[i]!;
        if (x.w !== y.w || x.u !== y.u) return false;
        const mine = x.w === a.window && x.u === m.user;
        if ((x.l !== y.l) !== mine) return false;
        if (x.l !== y.l) changed++;
      }
      return changed === 1;
    },
    "a note changes only the actor's own note": (p, n, a, m) => {
      if (a.t !== "note" || p === n) return true;
      const text = typeof a.text === "string" ? a.text.trim() : "";
      const mine = n.notes.find((x) => x.user === m.user)?.text ?? "";
      return n.windows === p.windows && mine === text && JSON.stringify(p.notes.filter((x) => x.user !== m.user)) === JSON.stringify(n.notes.filter((x) => x.user !== m.user));
    },
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    const wid = () => (r.next() < 0.05 ? "w9" : r.pick(s.windows).id);
    const has = holds(s, user) > 0;
    if (!has || k < 0.3) return { t: "take", window: wid() };
    if (k < 0.5) return { t: "move", window: wid(), dir: r.pick([-1, 1, 1, -1, 0]) };
    if (k < 0.65) return { t: "long", window: wid() };
    if (k < 0.8) return { t: "note", text: r.pick(["Out by 9", "Long one", "", "  Night only  ", "This note is far too long to fit in forty characters"]) };
    return { t: "leave" };
  },

  local: { notes: false, draft: "" },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const mine = state.windows.find((w) => w.slots.some((x) => x.user === me));
    const idx = mine ? mine.slots.findIndex((x) => x.user === me) : -1;
    const myLong = mine && idx >= 0 ? mine.slots[idx]!.long : false;
    const firstOpen = state.windows.find((w) => w.slots.length < w.cap)?.id ?? "";
    const without = members.filter((m) => holds(state, m.id) === 0);
    const submit = () => {
      if (local.draft.trim().length > MAX_NOTE) return;
      dispatch({ t: "note", text: local.draft });
      setLocal({ draft: "" });
    };
    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={`${filled(state)} of ${members.length} have a slot`} />
        <div style={{ display: "grid", gap: 4 }}>
          {state.windows.map((w) => (
            <div key={w.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{w.label}</span> <small>· {w.slots.length} of {w.cap}</small>
                </div>
                {mine && mine.id === w.id ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "leave" })}>
                    Leave
                  </Button>
                ) : (
                  <Button kind={!mine && w.id === firstOpen ? "primary" : "secondary"} disabled={w.slots.length >= w.cap} onClick={() => dispatch({ t: "take", window: w.id })}>
                    Take
                  </Button>
                )}
              </div>
              <small style={{ display: "flex", flexWrap: "wrap", columnGap: 10 }}>
                {w.slots.length === 0 ? (
                  <span>No one yet</span>
                ) : (
                  w.slots.map((x, i) => (
                    <span key={x.user} style={{ fontWeight: x.user === me ? 700 : 400 }}>
                      {i + 1} {nameOf(x.user)}
                      {x.long ? " (long)" : ""}
                    </span>
                  ))
                )}
              </small>
            </div>
          ))}
        </div>
        {mine ? (
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Button disabled={idx <= 0} onClick={() => dispatch({ t: "move", window: mine.id, dir: -1 })}>
              Up
            </Button>
            <Button disabled={idx < 0 || idx >= mine.slots.length - 1} onClick={() => dispatch({ t: "move", window: mine.id, dir: 1 })}>
              Down
            </Button>
            <Button kind={myLong ? "primary" : "secondary"} onClick={() => dispatch({ t: "long", window: mine.id })}>
              Long
            </Button>
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <Button kind="deemphasized" onClick={() => setLocal({ notes: !local.notes })}>
            {local.notes ? "Hide notes" : "Notes"}
          </Button>
          <small style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {without.length ? `No slot: ${without.map((m) => (m.id === me ? "you" : m.name)).join(", ")}` : "Everyone has a slot"}
          </small>
        </div>
        {local.notes ? (
          <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
            {state.notes.length === 0 ? <small>No notes yet</small> : null}
            {state.notes.map((x) => (
              <div key={x.user} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Avatar user={x.user} size={20} />
                <small>
                  {nameOf(x.user)} · {x.text}
                </small>
              </div>
            ))}
            <form
              style={{ display: "flex", gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input value={local.draft} maxLength={MAX_NOTE} placeholder="Your note, empty clears" aria-label="Your note" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
              <Button kind="deemphasized" onClick={submit}>
                Save
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    );
  },
});
