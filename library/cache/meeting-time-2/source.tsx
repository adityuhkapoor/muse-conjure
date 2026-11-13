import { defineApp, Button, CardHeader, OptionRow, Facepile, SystemLine } from "@muse/app";

const CHAT = {
  title: "When can we practice?",
  note: "Room closes at 9 on Sun · open mic on the 21st",
  slots: ["Sat after 4", "Sun 1 to 9", "Weeknight after 7, not Wed", "Sat afternoon"],
};

type Slot = { id: string; label: string; yes: string[] };
type State = { title: string; note: string; slots: Slot[]; locked: string | null; lockedBy: string | null };
type Action = { t: "toggle"; slot: string } | { t: "add"; label: string } | { t: "lock"; slot: string } | { t: "unlock" };
type Local = { draft: string };

const MAX_SLOTS = 8;
const MAX_LABEL = 40;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const has = (s: State, id: unknown, user: string) => s.slots.some((x) => x.id === id && x.yes.includes(user));
const without = (xs: string[], u: string) => xs.filter((x) => x !== u).join();
const sameOthers = (p: State, n: State, user: string) =>
  p.slots.length === n.slots.length &&
  p.locked === n.locked &&
  p.lockedBy === n.lockedBy &&
  p.slots.every((s, i) => n.slots[i]!.id === s.id && n.slots[i]!.label === s.label && without(s.yes, user) === without(n.slots[i]!.yes, user));
const leader = (s: State): Slot | undefined => {
  const top = s.slots.reduce((m, x) => Math.max(m, x.yes.length), 0);
  return top > 0 ? s.slots.find((x) => x.yes.length === top) : undefined;
};

function toggle(s: State, user: string, id: unknown): State {
  if (s.locked !== null || typeof id !== "string" || !s.slots.some((x) => x.id === id)) return s;
  return {
    ...s,
    slots: s.slots.map((x) => (x.id !== id ? x : { ...x, yes: x.yes.includes(user) ? x.yes.filter((u) => u !== user) : [...x.yes, user] })),
  };
}

function add(s: State, user: string, raw: unknown, seq: number): State {
  if (s.locked !== null || typeof raw !== "string") return s;
  const label = clean(raw);
  if (!label || label.length > MAX_LABEL || s.slots.length >= MAX_SLOTS) return s;
  if (s.slots.some((x) => x.label.toLowerCase() === label.toLowerCase())) return s;
  return { ...s, slots: [...s.slots, { id: `s${seq}`, label, yes: [user] }] };
}

function lock(s: State, user: string, id: unknown): State {
  if (s.locked !== null || typeof id !== "string") return s;
  const slot = s.slots.find((x) => x.id === id);
  if (!slot || slot.yes.length === 0) return s;
  return { ...s, locked: slot.id, lockedBy: user };
}

export default defineApp<State, Action, Local>({
  name: "Practice times",
  summary: (s) => {
    const l = s.slots.find((x) => x.id === s.locked);
    if (l) return `${s.title} Locked: ${l.label}.`;
    const top = leader(s);
    return top ? `${s.title} ${top.label} leads with ${top.yes.length}.` : `${s.title} No one has answered yet.`;
  },

  init: () => {
    const seen = new Set<string>();
    const slots: Slot[] = [];
    for (const raw of CHAT.slots) {
      const label = clean(raw).slice(0, MAX_LABEL);
      if (!label || seen.has(label.toLowerCase()) || slots.length >= MAX_SLOTS) continue;
      seen.add(label.toLowerCase());
      slots.push({ id: `p${slots.length}`, label, yes: [] });
    }
    return { title: CHAT.title, note: CHAT.note, slots, locked: null, lockedBy: null };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "toggle") return toggle(state, meta.user, action.slot);
    if (action.t === "add") return add(state, meta.user, action.label, meta.seq);
    if (action.t === "lock") return lock(state, meta.user, action.slot);
    if (action.t === "unlock") {
      if (state.locked === null || state.lockedBy === null) return state;
      if (state.lockedBy !== meta.user && inChat(ctx, state.lockedBy)) return state;
      return { ...state, locked: null, lockedBy: null };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    if (state.slots.every((s) => s.yes.every((u) => inChat(ctx, u)))) return state;
    const slots = state.slots.map((s) => (s.yes.every((u) => inChat(ctx, u)) ? s : { ...s, yes: s.yes.filter((u) => inChat(ctx, u)) }));
    const ls = slots.find((s) => s.id === state.locked);
    if (state.locked !== null && (!ls || ls.yes.length === 0)) return { ...state, slots, locked: null, lockedBy: null };
    return { ...state, slots };
  },

  invariants: {
    "no one is in a slot twice": (s) => s.slots.every((x) => new Set(x.yes).size === x.yes.length),
    "everyone in a slot is in the chat": (s, ctx) => s.slots.every((x) => x.yes.every((u) => inChat(ctx, u))),
    "slot ids and labels are unique": (s) =>
      new Set(s.slots.map((x) => x.id)).size === s.slots.length && new Set(s.slots.map((x) => x.label.toLowerCase())).size === s.slots.length,
    "at most 8 slots, each label 1 to 40 characters": (s) =>
      s.slots.length <= MAX_SLOTS && s.slots.every((x) => x.label.length > 0 && x.label.length <= MAX_LABEL && x.label === clean(x.label)),
    "a lock names an existing slot and who locked it": (s) => (s.locked === null) === (s.lockedBy === null) && (s.locked === null || s.slots.some((x) => x.id === s.locked)),
    "a locked slot has at least one yes": (s) => s.locked === null || s.slots.some((x) => x.id === s.locked && x.yes.length > 0),
  },

  transitions: {
    "a toggle flips the actor on that slot and changes no one else": (p, n, a, m) =>
      a.t !== "toggle" || p === n || (has(p, a.slot, m.user) !== has(n, a.slot, m.user) && sameOthers(p, n, m.user)),
    "an added slot comes last with only the adder in it": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.slots.at(-1);
      return (
        n.slots.length === p.slots.length + 1 &&
        !!last &&
        last.label === clean(a.label) &&
        last.id === `s${m.seq}` &&
        last.yes.length === 1 &&
        last.yes[0] === m.user &&
        p.slots.every((x, i) => n.slots[i] === x) &&
        n.locked === p.locked
      );
    },
    "a lock sets that slot and the actor and changes nothing else": (p, n, a, m) =>
      a.t !== "lock" || p === n || (p.locked === null && n.locked === a.slot && n.lockedBy === m.user && n.slots === p.slots),
    "only the person who locked can unlock, or anyone if they left": (p, n, a, m, ctx) =>
      a.t !== "unlock" || p === n || (p.locked !== null && n.locked === null && n.lockedBy === null && n.slots === p.slots && (m.user === p.lockedBy || (p.lockedBy !== null && !inChat(ctx, p.lockedBy)))),
    "toggle and add change nothing while a slot is locked": (p, n, a) => (a.t !== "toggle" && a.t !== "add") || p.locked === null || p === n,
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.locked !== null) {
      const k = r.next();
      if (k < 0.35) return { t: "unlock" };
      if (k < 0.6) return { t: "toggle", slot: r.pick(s.slots).id };
      return { t: "lock", slot: r.pick(s.slots).id };
    }
    if (s.slots.length === 0) return { t: "add", label: r.pick(["Sat after 4", "Sun evening", ""]) };
    const k = r.next();
    if (k < 0.55) return { t: "toggle", slot: r.pick(s.slots).id };
    if (k < 0.75) return { t: "add", label: r.pick(["Fri after 6", "  Sun   morning ", "Mon after 7", "", s.slots[0]!.label]) };
    if (k < 0.9) {
      const top = leader(s);
      return { t: "lock", slot: top && r.next() < 0.8 ? top.id : r.pick(s.slots).id };
    }
    return { t: "unlock" };
  },

  local: { draft: "" },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const total = Math.max(1, members.length);
    const answered = members.filter((m) => state.slots.some((x) => x.yes.includes(m.id))).length;
    const locked = state.slots.find((x) => x.id === state.locked);
    const lead = leader(state);
    const lockerName = state.lockedBy ? (members.find((m) => m.id === state.lockedBy)?.name ?? "Someone") : "";
    const canUnlock = state.lockedBy !== null && (state.lockedBy === me || !members.some((m) => m.id === state.lockedBy));
    const canAdd = clean(local.draft).length > 0 && state.slots.length < MAX_SLOTS;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "" });
    };

    if (locked) {
      return (
        <div>
          <CardHeader title={state.title} subtitle={`Locked · ${locked.label}`} />
          <small>{state.note}</small>
          <div style={{ marginTop: 8 }}>
            <OptionRow label={locked.label} count={locked.yes.length} total={total} voters={locked.yes} selected={locked.yes.includes(me)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <small>{`Locked by ${state.lockedBy === me ? "you" : lockerName} · ${locked.yes.length} of ${members.length} can make it`}</small>
            </div>
            {canUnlock ? (
              <Button kind="secondary" onClick={() => dispatch({ t: "unlock" })}>
                Unlock
              </Button>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${answered} of ${members.length} answered`} />
        <small>{state.note}</small>
        <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
          {state.slots.map((x) => (
            <OptionRow
              key={x.id}
              label={x.label}
              count={x.yes.length}
              total={total}
              voters={x.yes}
              selected={x.yes.includes(me)}
              onClick={() => dispatch({ t: "toggle", slot: x.id })}
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {lead ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Facepile users={lead.yes} max={3} size={20} />
                <small>{`${lead.label} · ${lead.yes.length} free`}</small>
              </div>
            ) : (
              <small>Tap every time that works for you</small>
            )}
          </div>
          <Button kind="primary" disabled={!lead} onClick={() => { if (lead) dispatch({ t: "lock", slot: lead.id }); }}>
            Lock
          </Button>
        </div>
        {state.slots.length < MAX_SLOTS ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input value={local.draft} maxLength={MAX_LABEL} placeholder="Add a time" aria-label="Add a time" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
            <Button kind="deemphasized" disabled={!canAdd} onClick={submit}>
              Add
            </Button>
          </form>
        ) : (
          <SystemLine>All 8 times are in</SystemLine>
        )}
      </div>
    );
  },
});
