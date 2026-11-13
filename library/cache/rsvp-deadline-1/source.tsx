import { defineApp, Avatar, Button, CardHeader, Facepile } from "@muse/app";

const CHAT = {
  title: "Lake house on Saturday",
  deadline: "needed by Thursday night",
};

type Going = "yes" | "maybe" | "no";
type Stay = "stay" | "day";
type State = {
  title: string;
  deadline: string;
  going: Record<string, Going>;
  stay: Record<string, Stay>;
  closed: boolean;
  closedBy: string;
};
type Action = { t: "going"; value: Going } | { t: "stay"; value: Stay } | { t: "close" } | { t: "reopen" };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const omit = <V,>(r: Record<string, V>, k: string): Record<string, V> =>
  Object.fromEntries(Object.entries(r).filter(([x]) => x !== k)) as Record<string, V>;
/** The record without one person's entry, as a string, so two records can be compared. */
const rest = (r: Record<string, string>, user: string) => JSON.stringify(Object.entries(r).filter(([k]) => k !== user));
const count = (r: Record<string, string>, v: string) => Object.values(r).filter((x) => x === v).length;
const GOING: Going[] = ["yes", "maybe", "no"];
const STAY: Stay[] = ["stay", "day"];
const GOING_LABEL: Record<Going, string> = { yes: "Yes", maybe: "Maybe", no: "No" };
const STAY_LABEL: Record<Stay, string> = { stay: "Stay over", day: "Day trip" };

const waitingOf = (s: State, members: { id: string }[]) => members.filter((m) => !s.going[m.id] || !s.stay[m.id]);

export default defineApp<State, Action, Local>({
  name: "Headcount poll",
  summary: (s, ctx) => {
    const done = ctx.members.length - waitingOf(s, ctx.members).length;
    return `${s.title} · ${done} of ${ctx.members.length} answered${s.closed ? " · closed" : ""}`;
  },

  init: () => ({ title: CHAT.title, deadline: CHAT.deadline, going: {}, stay: {}, closed: false, closedBy: "" }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "going") {
      const v = action.value;
      if (state.closed || (v !== "yes" && v !== "maybe" && v !== "no")) return state;
      return { ...state, going: state.going[meta.user] === v ? omit(state.going, meta.user) : { ...state.going, [meta.user]: v } };
    }
    if (action.t === "stay") {
      const v = action.value;
      if (state.closed || (v !== "stay" && v !== "day")) return state;
      return { ...state, stay: state.stay[meta.user] === v ? omit(state.stay, meta.user) : { ...state.stay, [meta.user]: v } };
    }
    if (action.t === "close") {
      if (state.closed) return state;
      return { ...state, closed: true, closedBy: meta.user };
    }
    if (action.t === "reopen") {
      if (!state.closed || state.closedBy !== meta.user) return state;
      return { ...state, closed: false, closedBy: "" };
    }
    return state;
  },

  // Someone left: their answers go. If they had closed the poll, it opens again.
  onMembers: (state, ctx) => {
    const goneG = Object.keys(state.going).some((k) => !inChat(ctx, k));
    const goneS = Object.keys(state.stay).some((k) => !inChat(ctx, k));
    const goneCloser = state.closed && !inChat(ctx, state.closedBy);
    if (!goneG && !goneS && !goneCloser) return state;
    return {
      ...state,
      going: goneG ? (Object.fromEntries(Object.entries(state.going).filter(([k]) => inChat(ctx, k))) as Record<string, Going>) : state.going,
      stay: goneS ? (Object.fromEntries(Object.entries(state.stay).filter(([k]) => inChat(ctx, k))) as Record<string, Stay>) : state.stay,
      closed: goneCloser ? false : state.closed,
      closedBy: goneCloser ? "" : state.closedBy,
    };
  },

  invariants: {
    "everyone with a going answer is in the chat": (s, ctx) => Object.keys(s.going).every((k) => inChat(ctx, k)),
    "everyone with a stay answer is in the chat": (s, ctx) => Object.keys(s.stay).every((k) => inChat(ctx, k)),
    "going answers are yes, maybe or no": (s) => Object.values(s.going).every((v) => v === "yes" || v === "maybe" || v === "no"),
    "stay answers are stay or day": (s) => Object.values(s.stay).every((v) => v === "stay" || v === "day"),
    "a closed poll names a closer in the chat, an open poll names none": (s, ctx) =>
      s.closed ? s.closedBy !== "" && inChat(ctx, s.closedBy) : s.closedBy === "",
    "answer counts never pass the number of people": (s, ctx) =>
      Object.keys(s.going).length <= ctx.members.length && Object.keys(s.stay).length <= ctx.members.length,
  },

  transitions: {
    "a going action changes only the actor's going answer, or clears it when repeated": (p, n, a, m) =>
      a.t !== "going" ||
      p === n ||
      (n.stay === p.stay &&
        n.closed === p.closed &&
        n.closedBy === p.closedBy &&
        rest(p.going, m.user) === rest(n.going, m.user) &&
        n.going[m.user] === (p.going[m.user] === a.value ? undefined : a.value)),
    "a stay action changes only the actor's stay answer, or clears it when repeated": (p, n, a, m) =>
      a.t !== "stay" ||
      p === n ||
      (n.going === p.going &&
        n.closed === p.closed &&
        n.closedBy === p.closedBy &&
        rest(p.stay, m.user) === rest(n.stay, m.user) &&
        n.stay[m.user] === (p.stay[m.user] === a.value ? undefined : a.value)),
    "answers never change while the poll is closed": (p, n, a) =>
      !p.closed || a.t === "reopen" || (n.going === p.going && n.stay === p.stay && n.closed === p.closed),
    "closing records the actor and changes no answers": (p, n, a, m) =>
      a.t !== "close" || p === n || (!p.closed && n.closed && n.closedBy === m.user && n.going === p.going && n.stay === p.stay),
    "only the person who closed can reopen": (p, n, a, m) =>
      a.t !== "reopen" || p === n || (p.closed && p.closedBy === m.user && !n.closed && n.closedBy === "" && n.going === p.going && n.stay === p.stay),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    const x = r.next();
    if (s.closed && x < 0.35) return { t: "reopen" };
    if (x < 0.08) return { t: "close" };
    if (x < 0.55) return { t: "going", value: r.pick(GOING) };
    return { t: "stay", value: r.pick(STAY) };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const waiting = waitingOf(state, members);
    const done = members.length - waiting.length;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const mineG = state.going[me];
    const mineS = state.stay[me];
    const mine =
      mineG || mineS
        ? `Your answers: ${mineG ? GOING_LABEL[mineG] : "no going answer"} · ${mineS ? STAY_LABEL[mineS] : "no stay answer"}`
        : "You have not answered yet";
    return (
      <div>
        <CardHeader title={state.title} subtitle={`${done} of ${members.length} answered · ${state.deadline}`} />
        <small>Going?</small>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {GOING.map((v) => (
            <Button key={v} kind={mineG === v ? "secondary" : "deemphasized"} disabled={state.closed} onClick={() => dispatch({ t: "going", value: v })}>
              {`${GOING_LABEL[v]} · ${count(state.going, v)}`}
            </Button>
          ))}
        </div>
        <small>Staying over?</small>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {STAY.map((v) => (
            <Button key={v} kind={mineS === v ? "secondary" : "deemphasized"} disabled={state.closed} onClick={() => dispatch({ t: "stay", value: v })}>
              {`${STAY_LABEL[v]} · ${count(state.stay, v)}`}
            </Button>
          ))}
        </div>
        <div><small>{mine}</small></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32, marginTop: 8 }}>
          {waiting.length === 0 ? (
            <span>Everyone answered</span>
          ) : (
            <>
              <Facepile users={waiting.map((m) => m.id)} max={4} size={24} />
              <span style={{ minWidth: 0 }}>{`Waiting on ${waiting.map((m) => nameOf(m.id)).join(", ")}`}</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {state.closed ? (
            <>
              <Avatar user={state.closedBy} size={24} />
              <span>{`Closed by ${nameOf(state.closedBy)}`}</span>
              {state.closedBy === me ? <Button kind="secondary" onClick={() => dispatch({ t: "reopen" })}>Reopen</Button> : null}
            </>
          ) : (
            <Button kind="primary" onClick={() => dispatch({ t: "close" })}>Close</Button>
          )}
        </div>
      </div>
    );
  },
});
