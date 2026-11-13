import { defineApp, Button, CardHeader, Avatar, userColor } from "@muse/app";

const C = {
  title: "Study pact check-in",
  days: 15,
  stakeCents: 1500,
  missCents: 300,
  pizza: "Koronet",
};

type State = {
  days: number;
  today: number;
  in: string[];
  checks: Record<string, number[]>;
  counter: string;
  stakeCents: number;
  missCents: number;
};
type Action =
  | { t: "join" }
  | { t: "check"; day: number }
  | { t: "uncheck"; day: number }
  | { t: "next" }
  | { t: "counter" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name: string }[] };

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const list = (s: State, u: string): number[] => s.checks[u] ?? [];
const isDay = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1;
const asc = (x: number, y: number) => x - y;
const missesOf = (s: State, u: string) => {
  let n = 0;
  for (let d = 1; d < s.today; d++) if (!list(s, u).includes(d)) n++;
  return n;
};
const totalMisses = (s: State) => s.in.reduce((n, u) => n + missesOf(s, u), 0);
const potOf = (s: State) => s.in.length * s.stakeCents + totalMisses(s) * s.missCents;
const money = (c: number) => `$${Math.floor(c / 100)}${c % 100 ? "." + String(c % 100).padStart(2, "0") : ""}`;
const rest = (c: Record<string, number[]>, u: string) =>
  Object.keys(c)
    .filter((k) => k !== u)
    .sort()
    .map((k) => k + ":" + (c[k] ?? []).join(","))
    .join("|");
const doneToday = (s: State) => s.in.filter((u) => list(s, u).includes(s.today)).length;

export default defineApp<State, Action, Local>({
  name: "Study pact",
  summary: (s) => `Day ${s.today} of ${s.days} · ${doneToday(s)} of ${s.in.length} checked in · ${totalMisses(s)} misses`,

  init: () => ({
    days: C.days,
    today: 1,
    in: [],
    checks: {},
    counter: "",
    stakeCents: C.stakeCents,
    missCents: C.missCents,
  }),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const u = m.user;
    switch (a.t) {
      case "join":
        if (s.in.includes(u)) return s;
        return { ...s, in: [...s.in, u], checks: { ...s.checks, [u]: [] }, counter: s.counter === "" ? u : s.counter };
      case "check": {
        if (!s.in.includes(u) || !isDay(a.day) || a.day > s.today) return s;
        const l = list(s, u);
        if (l.includes(a.day)) return s;
        return { ...s, checks: { ...s.checks, [u]: [...l, a.day].sort(asc) } };
      }
      case "uncheck": {
        if (!s.in.includes(u) || !isDay(a.day)) return s;
        const l = list(s, u);
        if (!l.includes(a.day)) return s;
        return { ...s, checks: { ...s.checks, [u]: l.filter((d) => d !== a.day) } };
      }
      case "next":
        if (s.counter !== u || s.today >= s.days) return s;
        return { ...s, today: s.today + 1 };
      case "counter":
        if (!s.in.includes(u) || s.counter === u) return s;
        return { ...s, counter: u };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const keep = s.in.filter((u) => inChat(ctx, u));
    const keysOk = Object.keys(s.checks).every((k) => keep.includes(k));
    const counterOk = s.counter === "" ? keep.length === 0 || true : keep.includes(s.counter);
    if (keep.length === s.in.length && keysOk && counterOk) return s;
    const checks: Record<string, number[]> = {};
    for (const u of keep) checks[u] = s.checks[u] ?? [];
    const counter = keep.includes(s.counter) ? s.counter : (keep[0] ?? "");
    return { ...s, in: keep, checks, counter };
  },

  invariants: {
    "today is a whole day from 1 to the length of the pact": (s) => Number.isInteger(s.today) && s.today >= 1 && s.today <= s.days,
    "everyone in the pact and the counter are in the chat": (s, ctx) => s.in.every((u) => inChat(ctx, u)) && (s.counter === "" || inChat(ctx, s.counter)),
    "no one is in twice and every check belongs to someone in": (s) =>
      new Set(s.in).size === s.in.length && Object.keys(s.checks).every((k) => s.in.includes(k)),
    "check lists are sorted unique days from 1 to today": (s) =>
      Object.values(s.checks).every((l) => l.every((d, i) => Number.isInteger(d) && d >= 1 && d <= s.today && (i === 0 || d > (l[i - 1] ?? 0)))),
    "the counter is empty or in the pact": (s) => s.counter === "" ? s.in.length === 0 : s.in.includes(s.counter),
    "the pact keeps its length, buy-in and miss cost": (s) => s.days === C.days && s.stakeCents === C.stakeCents && s.missCents === C.missCents,
  },

  transitions: {
    "a join adds only the actor and takes the count if no one has it": (p, n, a, m) =>
      a.t !== "join" ||
      p === n ||
      (n.in.length === p.in.length + 1 &&
        n.in.at(-1) === m.user &&
        !p.in.includes(m.user) &&
        n.today === p.today &&
        rest(p.checks, m.user) === rest(n.checks, m.user) &&
        n.counter === (p.counter === "" ? m.user : p.counter)),
    "a check adds exactly that day to the actor's list and no one else's": (p, n, a, m) =>
      a.t !== "check" ||
      p === n ||
      (typeof a.day === "number" &&
        list(n, m.user).join() === [...list(p, m.user), a.day].sort(asc).join() &&
        !list(p, m.user).includes(a.day) &&
        rest(p.checks, m.user) === rest(n.checks, m.user) &&
        p.in.join() === n.in.join() &&
        p.today === n.today),
    "an uncheck removes exactly that day from the actor's list and no one else's": (p, n, a, m) =>
      a.t !== "uncheck" ||
      p === n ||
      (typeof a.day === "number" &&
        list(p, m.user).includes(a.day) &&
        list(n, m.user).join() === list(p, m.user).filter((d) => d !== a.day).join() &&
        rest(p.checks, m.user) === rest(n.checks, m.user) &&
        p.today === n.today),
    "next raises today by one and only for the counter": (p, n, a, m) =>
      a.t !== "next" || p === n || (n.today === p.today + 1 && m.user === p.counter && rest(p.checks, "") === rest(n.checks, "")),
    "only the counter changes today": (p, n, _a, m) => p.today === n.today || m.user === p.counter,
    "taking the count makes the actor the counter and only changes that": (p, n, a, m) =>
      a.t !== "counter" || p === n || (n.counter === m.user && p.in.includes(m.user) && n.today === p.today && n.in.join() === p.in.join()),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (!s.in.includes(user)) return r.next() < 0.85 ? { t: "join" } : { t: "check", day: 1 };
    const k = r.next();
    if (k < 0.5) return { t: "check", day: r.int(s.today + 1) + (r.next() < 0.1 ? 1 : 0) };
    if (k < 0.65) return { t: "uncheck", day: r.int(s.today) + 1 };
    if (k < 0.85) return { t: "next" };
    if (k < 0.95) return { t: "counter" };
    return { t: "join" };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const ctx: Ctx = { members };
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const joined = state.in.includes(me);
    const checkedToday = list(state, me).includes(state.today);
    const isCounter = state.counter === me;
    const misses = totalMisses(state);
    void ctx;
    return (
      <div>
        <CardHeader
          title={C.title}
          subtitle={`Day ${state.today} of ${state.days} · ${doneToday(state)} of ${state.in.length} checked in`}
        />
        <div style={{ display: "grid", gap: 0, marginTop: 4 }}>
          {state.in.length === 0 ? (
            <small>No one is in yet. Tap Join to start.</small>
          ) : (
            state.in.map((u) => {
              const miss = missesOf(state, u);
              return (
                <div
                  key={u}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 36,
                    padding: "0 4px",
                    borderRadius: theme.radius.button,
                    background: u === me ? theme.color.wash : "transparent",
                  }}
                >
                  <Avatar user={u} size={24} />
                  <div style={{ width: 84, minWidth: 0 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: u === me ? 600 : 400, lineHeight: "18px" }}>{nameOf(u)}</div>
                    <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: "16px" }}>
                      {miss === 0 ? "On track" : `${miss} missed · ${money(miss * state.missCents)}`}
                    </small>
                  </div>
                  <div
                    role="img"
                    aria-label={`${nameOf(u)} checked in ${list(state, u).length} of ${state.today} days`}
                    style={{ display: "flex", flex: 1, gap: 2, minWidth: 0 }}
                  >
                    {Array.from({ length: state.days }, (_, i) => {
                      const d = i + 1;
                      const done = list(state, u).includes(d);
                      const border = done
                        ? `1px solid ${userColor(u, theme)}`
                        : d === state.today
                          ? `2px solid ${theme.color.primary}`
                          : d < state.today
                            ? `1px dashed ${theme.color.negative}`
                            : `1px dashed ${theme.color.divider}`;
                      return (
                        <span
                          key={d}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            height: 12,
                            borderRadius: 3,
                            boxSizing: "border-box",
                            border,
                            background: done ? userColor(u, theme) : "transparent",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <small style={{ display: "block", marginTop: 8 }}>
          {`${money(potOf(state))} pot · ${misses} ${misses === 1 ? "miss" : "misses"} · pizza at ${C.pizza}`}
          {state.counter ? ` · ${nameOf(state.counter) === "You" ? "you keep" : nameOf(state.counter) + " keeps"} count` : ""}
        </small>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {!joined ? (
            <Button kind="primary" onClick={() => dispatch({ t: "join" })}>
              Join
            </Button>
          ) : checkedToday ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "uncheck", day: state.today })}>
              Undo
            </Button>
          ) : (
            <Button kind="primary" onClick={() => dispatch({ t: "check", day: state.today })}>
              Check in
            </Button>
          )}
          {joined && isCounter ? (
            <Button kind="secondary" disabled={state.today >= state.days} onClick={() => dispatch({ t: "next" })}>
              Next day
            </Button>
          ) : null}
          {joined && !isCounter ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "counter" })}>
              Keep count
            </Button>
          ) : null}
        </div>
      </div>
    );
  },
});
