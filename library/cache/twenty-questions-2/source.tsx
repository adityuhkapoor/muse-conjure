import { defineApp, Avatar, Button, CardHeader, SystemLine, clock, rng } from "@muse/app";

// Chat content for this game.
const CHAT = {
  title: "20 questions",
  max: 20,
  reader: "Naomi",
  rules: "Only people in this chat · yes or no only",
};

type Q = { id: string; by: string; text: string; answer: "yes" | "no" | null };
type Phase = "idle" | "playing" | "over";
type State = {
  phase: Phase;
  holder: string | null;
  secret: string | null;
  asked: Q[];
  winner: string | null;
  at: number;
  rounds: number;
};
type Action =
  | { t: "start" }
  | { t: "choose"; person: string }
  | { t: "ask"; text: string }
  | { t: "answer"; id: string; answer: "yes" | "no" }
  | { t: "guess"; person: string }
  | { t: "reset" };
type Local = { draft: string; open: boolean };

const MAX = CHAT.max;
const MAX_TEXT = 60;
const SPIN_MS = 1500;

const inChat = (ctx: { members: { id: string }[] }, id: unknown) => ctx.members.some((m) => m.id === id);
const nameIn = (ctx: { members: { id: string; name: string }[] }, id: string) => ctx.members.find((m) => m.id === id)?.name ?? "Someone";
const idle = (rounds: number): State => ({ phase: "idle", holder: null, secret: null, asked: [], winner: null, at: 0, rounds });
const openQ = (s: State) => s.asked.length > 0 && s.asked[s.asked.length - 1]!.answer === null;
const allAnswered = (s: State) => s.asked.every((q) => q.answer !== null);
const settle = (s: State): State => (s.phase === "playing" && s.asked.length >= MAX && allAnswered(s) ? { ...s, phase: "over" } : s);

export default defineApp<State, Action, Local>({
  name: "20 questions",
  summary: (s, ctx) => {
    if (s.phase === "idle") return "20 questions. Ready to start.";
    if (s.phase === "playing") return `20 questions · ${s.asked.length} of ${MAX} used`;
    return s.winner !== null ? `20 questions · ${nameIn(ctx, s.winner)} guessed it` : "20 questions · out of questions";
  },

  init: () => idle(0),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    switch (a.t) {
      case "start": {
        if (s.phase === "playing" || ctx.members.length < 2) return s;
        const holder = rng(m.seed).pick(ctx.members.map((x) => x.id));
        return { phase: "playing", holder, secret: null, asked: [], winner: null, at: m.time, rounds: s.rounds + 1 };
      }
      case "choose": {
        if (s.phase !== "playing" || m.user !== s.holder || s.secret !== null) return s;
        if (typeof a.person !== "string" || a.person === s.holder || !inChat(ctx, a.person)) return s;
        return { ...s, secret: a.person };
      }
      case "ask": {
        if (s.phase !== "playing" || s.secret === null || m.user === s.holder) return s;
        if (typeof a.text !== "string" || s.asked.length >= MAX || openQ(s)) return s;
        const text = a.text.trim();
        if (!text || text.length > MAX_TEXT) return s;
        return { ...s, asked: [...s.asked, { id: "q" + m.seq, by: m.user, text, answer: null }] };
      }
      case "answer": {
        if (s.phase !== "playing" || m.user !== s.holder) return s;
        if (typeof a.id !== "string" || (a.answer !== "yes" && a.answer !== "no")) return s;
        const ans: "yes" | "no" = a.answer;
        const q = s.asked.find((x) => x.id === a.id);
        if (!q || q.answer !== null) return s;
        return settle({ ...s, asked: s.asked.map((x) => (x.id === q.id ? { ...x, answer: ans } : x)) });
      }
      case "guess": {
        if (s.phase !== "playing" || s.secret === null || m.user === s.holder) return s;
        if (typeof a.person !== "string" || a.person === s.holder || !inChat(ctx, a.person)) return s;
        if (s.asked.length >= MAX || openQ(s)) return s;
        if (a.person === s.secret) return { ...s, phase: "over", winner: m.user };
        const text = `Is it ${nameIn(ctx, a.person)}?`.slice(0, MAX_TEXT);
        return settle({ ...s, asked: [...s.asked, { id: "q" + m.seq, by: m.user, text, answer: "no" }] });
      }
      case "reset":
        return s.phase === "idle" ? s : idle(s.rounds);
    }
    return s;
  },

  // If the holder, the secret person or the winner leaves, the round ends.
  onMembers: (s, ctx) => {
    if (s.phase === "idle") return s;
    const gone = (id: string | null) => id !== null && !inChat(ctx, id);
    if (gone(s.holder) || gone(s.secret) || gone(s.winner)) return idle(s.rounds);
    return s;
  },

  invariants: {
    "at most 20 questions, unique ids, answers are yes, no or open, and only the last is open": (s) =>
      s.asked.length <= MAX &&
      new Set(s.asked.map((q) => q.id)).size === s.asked.length &&
      s.asked.every((q, i) => q.answer === "yes" || q.answer === "no" || (q.answer === null && i === s.asked.length - 1)),
    "idle means nothing is set": (s) => s.phase !== "idle" || (s.holder === null && s.secret === null && s.winner === null && s.asked.length === 0),
    "a round has a holder who is never the secret and never asks, and questions need a secret": (s) =>
      s.phase === "idle" ||
      (typeof s.holder === "string" && s.secret !== s.holder && s.asked.every((q) => q.by !== s.holder) && (s.asked.length === 0 || s.secret !== null)),
    "a round ends with a winner or 20 answered questions, and only then": (s) =>
      (s.phase !== "over" || s.winner !== null || (s.asked.length === MAX && allAnswered(s))) &&
      (s.winner === null || (s.phase === "over" && s.winner !== s.holder)) &&
      (s.phase !== "playing" || !(s.asked.length === MAX && allAnswered(s))),
    "holder, secret and winner are in the chat": (s, ctx) => [s.holder, s.secret, s.winner].every((id) => id === null || inChat(ctx, id)),
  },

  transitions: {
    "start makes the seed's pick the holder, with a clean round": (p, n, a, m, ctx) =>
      a.t !== "start" ||
      p === n ||
      (p.phase !== "playing" &&
        n.phase === "playing" &&
        n.holder === rng(m.seed).pick(ctx.members.map((x) => x.id)) &&
        n.secret === null &&
        n.winner === null &&
        n.asked.length === 0 &&
        n.at === m.time &&
        n.rounds === p.rounds + 1),
    "only the holder chooses the secret, and it is the person given": (p, n, a, m) =>
      a.t !== "choose" || p === n || (m.user === p.holder && p.secret === null && n.secret === a.person && n.asked === p.asked && n.holder === p.holder),
    "an ask adds one open question by the actor, never the holder": (p, n, a, m) => {
      if (a.t !== "ask" || p === n) return true;
      const last = n.asked[n.asked.length - 1];
      return n.asked.length === p.asked.length + 1 && !!last && last.id === "q" + m.seq && last.by === m.user && m.user !== p.holder && last.answer === null && last.text === a.text.trim();
    },
    "only the holder answers, and only that question changes": (p, n, a, m) => {
      if (a.t !== "answer" || p === n) return true;
      const before = p.asked.find((q) => q.id === a.id);
      const after = n.asked.find((q) => q.id === a.id);
      return (
        m.user === p.holder &&
        !!before &&
        before.answer === null &&
        after?.answer === a.answer &&
        n.asked.length === p.asked.length &&
        p.asked.filter((q, i) => q.answer !== n.asked[i]!.answer).length === 1
      );
    },
    "a right guess wins for the actor, a wrong guess costs one question": (p, n, a, m) => {
      if (a.t !== "guess" || p === n) return true;
      if (m.user === p.holder) return false;
      if (a.person === p.secret) return n.phase === "over" && n.winner === m.user;
      const last = n.asked[n.asked.length - 1];
      return n.winner === null && n.asked.length === p.asked.length + 1 && last?.by === m.user && last.answer === "no";
    },
    "a reset goes back to idle keeping the round count, and only people in the chat change anything": (p, n, a, m, ctx) =>
      p === n || (inChat(ctx, m.user) && n.rounds >= p.rounds && (a.t !== "reset" || (n.phase === "idle" && n.rounds === p.rounds && p.phase !== "idle"))),
  },

  arbitrary: (s, user, r, ctx) => {
    const ids = ctx.members.map((x) => x.id);
    if (ids.length === 0) return null;
    if (s.phase !== "playing") return r.next() < 0.85 ? { t: "start" } : { t: "reset" };
    if (user === s.holder) {
      const others = ids.filter((i) => i !== user);
      if (s.secret === null) return others.length ? { t: "choose", person: r.pick(others) } : { t: "reset" };
      const last = s.asked[s.asked.length - 1];
      if (last && last.answer === null) return { t: "answer", id: last.id, answer: r.next() < 0.5 ? "yes" : "no" };
      return r.next() < 0.2 ? { t: "reset" } : { t: "answer", id: "q0", answer: "yes" };
    }
    const k = r.next();
    if (k < 0.55) return { t: "ask", text: r.pick(["Are they tall?", "Do they drive?", "Are they in this car?", "", "Do they like takis?", "Is it a girl?"]) };
    if (k < 0.88) {
      const pool = ids.filter((i) => i !== s.holder);
      return pool.length ? { t: "guess", person: r.pick(pool) } : null;
    }
    return r.next() < 0.5 ? { t: "start" } : { t: "reset" };
  },

  local: { draft: "", open: false },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const nameOf = (id: string | null) => (id === null ? "" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const used = state.asked.length;
    const waiting = pending && state.rounds !== confirmed.rounds;
    const animating = !waiting && confirmed.phase === "playing" && confirmed.at > 0 && clock.value - confirmed.at < SPIN_MS;
    const spinning = waiting || animating;
    const iAmHolder = state.holder === me;
    const open = openQ(state);
    const hasReader = members.some((m) => m.name === CHAT.reader);

    const bars = Array.from({ length: MAX }, (_, i) => {
      const q = state.asked[i];
      if (!q) return theme.color.track;
      return q.answer === "yes" ? theme.color.positive : q.answer === "no" ? theme.color.secondaryText : theme.color.warning;
    });

    const subtitle =
      state.phase === "idle"
        ? "Pick a holder"
        : state.phase === "over"
          ? state.winner !== null
            ? `${nameOf(state.winner)} guessed it`
            : "Out of questions"
          : spinning
            ? "Picking a holder"
            : `Question ${Math.min(used + 1, MAX)} of ${MAX}`;

    const submit = () => {
      const text = local.draft.trim();
      if (!text || open || used >= MAX) return;
      dispatch({ t: "ask", text: text.slice(0, MAX_TEXT) });
      setLocal({ draft: "" });
    };

    const recent = state.asked.slice(-2);
    const firstIdx = used - recent.length;

    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={subtitle} />
        <div role="img" aria-label={`${used} of ${MAX} questions used`} style={{ display: "flex", gap: 3, height: 12, margin: "4px 0 8px" }}>
          {bars.map((c, i) => (
            <div key={i} style={{ flex: 1, borderRadius: 6, background: c }} />
          ))}
        </div>

        {state.phase === "idle" ? (
          <div style={{ display: "grid", gap: 8 }}>
            <small>{CHAT.rules}</small>
            {hasReader ? <small>{CHAT.reader} reads the questions aloud</small> : null}
            <Button kind="primary" wide disabled={members.length < 2} onClick={() => dispatch({ t: "start" })}>
              Start
            </Button>
          </div>
        ) : null}

        {state.phase === "over" ? (
          <div style={{ display: "grid", gap: 8 }}>
            {state.winner !== null ? (
              <div>
                <h2 style={{ color: theme.color.positive }}>{`${nameOf(state.winner)} got it`}</h2>
                <small>{`It was ${nameOf(state.secret)} · ${used} of ${MAX} questions`}</small>
              </div>
            ) : (
              <div>
                <h2>Out of questions</h2>
                <small>{`It was ${nameOf(state.secret)} · ${used} of ${MAX} questions`}</small>
              </div>
            )}
            <small>Held by {nameOf(state.holder)}</small>
            <Button kind="primary" wide onClick={() => dispatch({ t: "start" })}>
              Play again
            </Button>
          </div>
        ) : null}

        {state.phase === "playing" && spinning ? <SystemLine>Spinning</SystemLine> : null}

        {state.phase === "playing" && !spinning && state.holder !== null ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
              <Avatar user={state.holder} size={32} />
              <div>
                <div style={{ fontWeight: 600 }}>{iAmHolder ? "You hold it" : `${nameOf(state.holder)} holds it`}</div>
                <small>{iAmHolder && state.secret !== null ? `Your person · ${nameOf(state.secret)}` : CHAT.rules}</small>
              </div>
            </div>

            {state.secret === null ? (
              iAmHolder ? (
                <div>
                  <small>Pick someone from the chat</small>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                    {members
                      .filter((m) => m.id !== me)
                      .map((m) => (
                        <Button key={m.id} kind="secondary" onClick={() => dispatch({ t: "choose", person: m.id })}>
                          {m.name}
                        </Button>
                      ))}
                  </div>
                </div>
              ) : (
                <SystemLine>{`Waiting for ${nameOf(state.holder)} to pick`}</SystemLine>
              )
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {recent.length ? (
                  <div style={{ display: "grid", gap: 2 }}>
                    {recent.map((q, i) => (
                      <div key={q.id} style={{ display: "flex", gap: 8, alignItems: "baseline", minHeight: 24 }}>
                        <small>{`Q${firstIdx + i + 1}`}</small>
                        <span style={{ flex: 1, minWidth: 0 }}>{q.text}</span>
                        <b>{q.answer === "yes" ? "Yes" : q.answer === "no" ? "No" : "…"}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <small>No questions yet</small>
                )}

                {iAmHolder ? (
                  open ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button kind="primary" wide onClick={() => dispatch({ t: "answer", id: state.asked[used - 1]!.id, answer: "yes" })}>
                        Yes
                      </Button>
                      <Button wide onClick={() => dispatch({ t: "answer", id: state.asked[used - 1]!.id, answer: "no" })}>
                        No
                      </Button>
                    </div>
                  ) : (
                    <SystemLine>Waiting for the next question</SystemLine>
                  )
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    <form
                      style={{ display: "flex", gap: 8 }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        submit();
                      }}
                    >
                      <input value={local.draft} maxLength={MAX_TEXT} placeholder="Yes or no question" aria-label="Question" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
                      <Button kind="primary" disabled={open || !local.draft.trim()} onClick={submit}>
                        Ask
                      </Button>
                    </form>
                    {open ? <small>Waiting for the answer</small> : null}
                    <Button kind="deemphasized" wide onClick={() => setLocal({ open: !local.open })}>
                      Guess who
                    </Button>
                    {local.open ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {members
                          .filter((m) => m.id !== state.holder)
                          .map((m) => (
                            <Button
                              key={m.id}
                              kind="secondary"
                              disabled={open}
                              onClick={() => {
                                dispatch({ t: "guess", person: m.id });
                                setLocal({ open: false });
                              }}
                            >
                              {m.name}
                            </Button>
                          ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  },
});
