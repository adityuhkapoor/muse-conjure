import { defineApp, Button, CardHeader, OptionRow, Progress, SystemLine } from "@muse/app";

const C = {
  title: "Friday karaoke at the Rusty Mic",
  doors: "Doors at 9",
  needed: 4,
};

type Status = "going" | "maybe" | "no";
type Answer = { user: string; status: Status; note: string };
type State = { title: string; doors: string; needed: number; locked: boolean; lockedBy: string | null; answers: Answer[] };
type Action =
  | { t: "set"; status: Status; note: string }
  | { t: "clear" }
  | { t: "lock" }
  | { t: "unlock" };
type Local = { note: string | null };

const STATUSES: Status[] = ["going", "maybe", "no"];
const LABELS: Record<Status, string> = { going: "Going", maybe: "Maybe", no: "No" };
const MAX_NOTE = 40;

const isStatus = (x: unknown): x is Status => x === "going" || x === "maybe" || x === "no";
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const norm = (x: string) => x.trim().replace(/\s+/g, " ").slice(0, MAX_NOTE).trim();
const ansOf = (s: State, u: string) => s.answers.find((a) => a.user === u);
const goingCount = (answers: Answer[]) => answers.filter((a) => a.status === "going").length;
const key = (xs: Answer[]) => JSON.stringify(xs);
const othersKey = (s: State, u: string) => key(s.answers.filter((a) => a.user !== u));

export default defineApp<State, Action, Local>({
  name: "RSVP lock",
  summary: (s) =>
    s.locked
      ? `${s.title}: locked, ${goingCount(s.answers)} going.`
      : `${s.title}: ${goingCount(s.answers)} of ${s.needed} going.`,

  init: () => ({ title: C.title, doors: C.doors, needed: C.needed, locked: false, lockedBy: null, answers: [] }),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "set") {
      if (s.locked || !isStatus(a.status) || typeof a.note !== "string") return s;
      const note = norm(a.note);
      const mine = ansOf(s, m.user);
      if (mine && mine.status === a.status && mine.note === note) return s;
      const entry: Answer = { user: m.user, status: a.status, note };
      return { ...s, answers: mine ? s.answers.map((x) => (x.user === m.user ? entry : x)) : [...s.answers, entry] };
    }
    if (a.t === "clear") {
      if (s.locked || !ansOf(s, m.user)) return s;
      return { ...s, answers: s.answers.filter((x) => x.user !== m.user) };
    }
    if (a.t === "lock") {
      if (s.locked || goingCount(s.answers) < s.needed || ansOf(s, m.user)?.status !== "going") return s;
      return { ...s, locked: true, lockedBy: m.user };
    }
    if (a.t === "unlock") {
      if (!s.locked || s.lockedBy !== m.user) return s;
      return { ...s, locked: false, lockedBy: null };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const answers = s.answers.filter((a) => inChat(ctx, a.user));
    const keep = s.locked && s.lockedBy !== null && inChat(ctx, s.lockedBy) && goingCount(answers) >= s.needed;
    if (answers.length === s.answers.length && (keep || !s.locked)) return s;
    return { ...s, answers, locked: keep, lockedBy: keep ? s.lockedBy : null };
  },

  invariants: {
    "at most one answer per person": (s) => new Set(s.answers.map((a) => a.user)).size === s.answers.length,
    "everyone with an answer is in the chat": (s, ctx) => s.answers.every((a) => inChat(ctx, a.user)),
    "every status is valid and every note is short and tidy": (s) =>
      s.answers.every((a) => isStatus(a.status) && a.note.length <= MAX_NOTE && a.note === norm(a.note)),
    "a locked plan has enough going, and the locker is going and in the chat": (s, ctx) =>
      !s.locked ||
      (s.lockedBy !== null && inChat(ctx, s.lockedBy) && goingCount(s.answers) >= s.needed && ansOf(s, s.lockedBy)?.status === "going"),
    "an open plan has no locker": (s) => s.locked || s.lockedBy === null,
  },

  transitions: {
    "a set changes only the actor's own answer to the given status and note": (p, n, a, m) => {
      if (a.t !== "set" || p === n) return true;
      if (typeof a.note !== "string") return false;
      const mine = ansOf(n, m.user);
      return !!mine && mine.status === a.status && mine.note === norm(a.note) && othersKey(p, m.user) === othersKey(n, m.user);
    },
    "a clear removes only the actor's own answer": (p, n, a, m) =>
      a.t !== "clear" || p === n || (!!ansOf(p, m.user) && !ansOf(n, m.user) && othersKey(p, m.user) === othersKey(n, m.user)),
    "a lock needs enough going and the actor going, and sets the actor as locker": (p, n, a, m) =>
      a.t !== "lock" ||
      p === n ||
      (n.locked && n.lockedBy === m.user && goingCount(p.answers) >= p.needed && ansOf(p, m.user)?.status === "going" && key(p.answers) === key(n.answers)),
    "only the locker can unlock": (p, n, a, m) =>
      a.t !== "unlock" || p === n || (p.locked && p.lockedBy === m.user && !n.locked && n.lockedBy === null && key(p.answers) === key(n.answers)),
    "answers do not change while the plan is locked": (p, n, a) => !p.locked || a.t === "unlock" || key(p.answers) === key(n.answers),
    "the plan itself never changes": (p, n) => p.title === n.title && p.doors === n.doors && p.needed === n.needed,
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const x = r.next();
    if (s.locked) return x < 0.5 ? { t: "unlock" } : { t: "set", status: r.pick(STATUSES), note: "" };
    if (goingCount(s.answers) >= s.needed && x < 0.4) return { t: "lock" };
    if (x < 0.1) return { t: "clear" };
    if (x < 0.15) return { t: "lock" };
    return {
      t: "set",
      status: x < 0.65 ? "going" : r.pick(STATUSES),
      note: r.pick(["", "lab report due Sat morning", "might work till 10", "  running late  ", "this note is much longer than forty characters allow"]),
    };
  },

  local: { note: null },

  view: ({ state, me, members, dispatch, local, setLocal }) => {
    const going = goingCount(state.answers);
    const mine = ansOf(state, me);
    const nameOf = (id: string) => (id === me ? "You" : (members.find((x) => x.id === id)?.name ?? "Someone"));
    const unanswered = members.filter((x) => !ansOf(state, x.id));
    const canLock = !state.locked && going >= state.needed && mine?.status === "going";
    const noteValue = local.note ?? mine?.note ?? "";
    const notes = state.answers
      .filter((a) => a.user !== me && a.note)
      .slice(0, 2)
      .map((a) => `${nameOf(a.user)}: ${a.note}`);
    const pick = (status: Status) => {
      if (state.locked) return;
      dispatch({ t: "set", status, note: noteValue });
      setLocal({ note: null });
    };
    return (
      <div>
        <CardHeader
          title={state.title}
          subtitle={state.locked ? `Locked · ${going} going` : `${going} of ${state.needed} going · ${state.doors.toLowerCase()}`}
        />
        <Progress value={Math.min(going, state.needed)} max={state.needed} label={state.locked ? `Locked · ${going} going` : `${going} of ${state.needed} going · maybe does not count`} />
        <div style={{ display: "grid", gap: 2, marginTop: 8 }}>
          {STATUSES.map((k) => {
            const ids = state.answers.filter((a) => a.status === k).map((a) => a.user);
            return (
              <OptionRow
                key={k}
                label={LABELS[k]}
                count={ids.length}
                total={Math.max(1, members.length)}
                voters={ids}
                selected={mine?.status === k}
                onClick={() => pick(k)}
              />
            );
          })}
        </div>
        {!state.locked ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (mine) {
                dispatch({ t: "set", status: mine.status, note: noteValue });
                setLocal({ note: null });
              }
            }}
          >
            <input
              value={noteValue}
              maxLength={MAX_NOTE}
              placeholder="Add a note"
              aria-label="Add a note"
              onInput={(e) => setLocal({ note: e.currentTarget.value })}
            />
            <Button kind="deemphasized" disabled={!mine || noteValue === mine.note} onClick={() => {
              if (mine) {
                dispatch({ t: "set", status: mine.status, note: noteValue });
                setLocal({ note: null });
              }
            }}>
              Save
            </Button>
          </form>
        ) : null}
        <div style={{ marginTop: 8 }}>
          {notes.length ? <small>{notes.join(" · ")}</small> : null}
          {unanswered.length && !state.locked ? (
            <div>
              <small>{`Not answered: ${unanswered.map((x) => (x.id === me ? "you" : x.name)).slice(0, 3).join(", ")}${unanswered.length > 3 ? ` and ${unanswered.length - 3} more` : ""}`}</small>
            </div>
          ) : null}
        </div>
        {canLock ? (
          <div style={{ marginTop: 8 }}>
            <Button kind="primary" wide onClick={() => dispatch({ t: "lock" })}>
              Lock
            </Button>
          </div>
        ) : null}
        {state.locked && state.lockedBy ? (
          <div style={{ marginTop: 8 }}>
            <SystemLine>{`Locked by ${nameOf(state.lockedBy)}`}</SystemLine>
            {state.lockedBy === me ? (
              <Button kind="deemphasized" wide onClick={() => dispatch({ t: "unlock" })}>
                Unlock
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  },
});
