import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine, running, spring, springs, tween } from "@muse/app";

// Rate together: one subject (a dating profile, "is $350 fair for this couch", a new menu), and
// each person gives one score or one word. Answers stay hidden behind faces until everyone in the
// chat is in (or someone who answered reveals early); then the faces drop onto the scale with
// the group average and spread. People can change their answer after the reveal.

type Params = {
  /** The subject, as a short question or name: "Is $350 fair for the West Elm couch?" */
  title: string;
  /** One plain line of facts from the chat, or "": "Retail is $900 · 2 years old" */
  detail: string;
  /** "score": everyone picks a number from low to high. "word": everyone gives one word. */
  mode: "score" | "word";
  /** Score mode: the scale, e.g. 1 to 10. low 0 or 1, high up to 10. */
  low: number;
  high: number;
  /** Score mode: what the ends mean, e.g. "ripoff" and "steal". "" to leave out. */
  lowLabel: string;
  highLabel: string;
  /** Word mode: a few words to tap, from the chat. People can also type their own. */
  words: string[];
};

// @params
const P: Params = {
  title: "Is $350 fair for the West Elm couch?",
  detail: "Retail is $900 · 2 years old · pickup in Oakland",
  mode: "score",
  low: 1,
  high: 10,
  lowLabel: "ripoff",
  highLabel: "steal",
  words: [],
};
// @end params

type Answer = { u: string; score: number; word: string; at: number };
type State = {
  title: string;
  detail: string;
  mode: "score" | "word";
  low: number;
  high: number;
  lowLabel: string;
  highLabel: string;
  words: string[];
  answers: Answer[];
  /** When the answers were revealed (server ms), 0 while hidden. */
  revealAt: number;
};
type Action = { t: "score"; value: number } | { t: "word"; word: string } | { t: "reveal" };
type Local = { draft: string };
type Ctx = { members: { id: string }[] };

const MAX_WORD = 20;
const REVEAL_MS = 1400;
const drop = spring(springs.iosBouncy);
const fade = tween({ duration: 300, easing: "enter" });

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const cleanWord = (w: string) => w.trim().replace(/\s+/g, " ").toLowerCase().slice(0, MAX_WORD);

/** Average in tenths, rounded half up, in integer math: 37 means 3.7. */
export function avgTenths(scores: number[]): number {
  const n = scores.length;
  if (!n) return 0;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.floor((sum * 20 + n) / (2 * n));
}
const tenths = (t: number) => `${Math.floor(t / 10)}.${t % 10}`;

// ---- Checks. ----
const answerOf = (s: State, u: string) => s.answers.find((x) => x.u === u);
const othersText = (s: State, u: string) => s.answers.filter((x) => x.u !== u).map((x) => `${x.u}:${x.score}:${x.word}:${x.at}`).sort().join("|");
const allIn = (s: State, ctx: Ctx) => ctx.members.length > 0 && ctx.members.every((m) => s.answers.some((x) => x.u === m.id));
const setupText = (s: State) => [s.title, s.detail, s.mode, s.low, s.high, s.lowLabel, s.highLabel, s.words.join(",")].join("|");

// ---- Reducer. ----
function settle(s: State, ctx: Ctx, time: number): State {
  if (s.revealAt !== 0) return s;
  const everyone = ctx.members.length > 0 && ctx.members.every((m) => s.answers.some((x) => x.u === m.id));
  return everyone ? { ...s, revealAt: time } : s;
}

function give(s: State, user: string, score: number, word: string, time: number, ctx: Ctx): State {
  const had = s.answers.find((x) => x.u === user);
  if (had && had.score === score && had.word === word) return s;
  return settle({ ...s, answers: [...s.answers.filter((x) => x.u !== user), { u: user, score, word, at: time }] }, ctx, time);
}

export default defineApp<State, Action, Local>({
  name: "Rate together",
  summary: (s, ctx) => {
    const n = s.answers.length;
    if (s.revealAt === 0) return `${s.title} ${n} of ${ctx.members.length} in.`;
    if (s.mode === "score") return `${s.title} Average ${tenths(avgTenths(s.answers.map((x) => x.score)))} from ${n}.`;
    return `${s.title} ${n} answers in.`;
  },

  init: () => {
    const low = Number.isInteger(P.low) && P.low >= 0 && P.low <= 1 ? P.low : 1;
    const high = Number.isInteger(P.high) && P.high >= low + 2 && P.high <= 10 ? P.high : 10;
    const words: string[] = [];
    for (const w of P.words) {
      const c = cleanWord(w);
      if (c && !words.includes(c) && words.length < 6) words.push(c);
    }
    return {
      title: P.title.trim().slice(0, 80) || "Rate it",
      detail: P.detail.trim().slice(0, 90),
      mode: P.mode === "word" ? "word" : "score",
      low,
      high,
      lowLabel: P.lowLabel.trim().slice(0, 16),
      highLabel: P.highLabel.trim().slice(0, 16),
      words,
      answers: [],
      revealAt: 0,
    };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "score") {
      const v = action.value;
      if (state.mode !== "score" || typeof v !== "number" || !Number.isInteger(v) || v < state.low || v > state.high) return state;
      return give(state, meta.user, v, "", meta.time, ctx);
    }
    if (action.t === "word") {
      if (state.mode !== "word" || typeof action.word !== "string") return state;
      const w = cleanWord(action.word);
      if (!w) return state;
      return give(state, meta.user, 0, w, meta.time, ctx);
    }
    if (action.t === "reveal") {
      if (state.revealAt !== 0 || state.answers.length < 2 || !state.answers.some((x) => x.u === meta.user)) return state;
      return { ...state, revealAt: meta.time };
    }
    return state;
  },

  // Someone left: their answer goes. If everyone still here has answered, the answers show.
  // Someone joined: they can answer at once (after a reveal they see the others straight away).
  onMembers: (state, ctx) => {
    const answers = state.answers.filter((x) => inChat(ctx, x.u));
    const next = answers.length === state.answers.length ? state : { ...state, answers };
    return settle(next, ctx, Math.max(1, ...next.answers.map((x) => x.at)));
  },

  invariants: {
    "one answer per person": (s) => new Set(s.answers.map((x) => x.u)).size === s.answers.length,
    "everyone who answered is in the chat": (s, ctx) => s.answers.every((x) => inChat(ctx, x.u)),
    "scores are whole numbers on the scale": (s) => s.mode !== "score" || s.answers.every((x) => Number.isInteger(x.score) && x.score >= s.low && x.score <= s.high && x.word === ""),
    "words are short and lowercase": (s) => s.mode !== "word" || s.answers.every((x) => x.score === 0 && x.word.length > 0 && x.word.length <= MAX_WORD && x.word === x.word.toLowerCase()),
    "answers stay hidden only while someone here has not answered": (s, ctx) => s.revealAt !== 0 || !allIn(s, ctx),
    "the average sits on the scale": (s) => s.mode !== "score" || !s.answers.length || (avgTenths(s.answers.map((x) => x.score)) >= s.low * 10 && avgTenths(s.answers.map((x) => x.score)) <= s.high * 10),
  },

  transitions: {
    "an answer sets the actor's own answer and nobody else's": (p, n, a, m) => {
      if ((a.t !== "score" && a.t !== "word") || p === n) return true;
      const x = answerOf(n, m.user);
      const want = a.t === "score" ? x?.score === a.value && x.word === "" : x?.word === cleanWord(String(a.word)) && x.score === 0;
      return !!x && want && x.at === m.time && othersText(p, m.user) === othersText(n, m.user) && n.answers.length >= p.answers.length;
    },
    "answers reveal at once when the last person is in, and never hide again": (p, n, a, m, ctx) =>
      p === n || (p.revealAt !== 0 ? n.revealAt === p.revealAt : n.revealAt === 0 ? !allIn(n, ctx) : n.revealAt === m.time && (a.t === "reveal" || allIn(n, ctx))),
    "a valid answer from someone in the chat always lands": (p, n, a, m, ctx) => {
      if (!inChat(ctx, m.user)) return true;
      if (a.t === "score") return p.mode !== "score" || !Number.isInteger(a.value) || a.value < p.low || a.value > p.high || answerOf(n, m.user)?.score === a.value;
      if (a.t === "word") return p.mode !== "word" || typeof a.word !== "string" || !cleanWord(a.word) || answerOf(n, m.user)?.word === cleanWord(a.word);
      return true;
    },
    "a reveal by someone who answered, with two or more in, shows the answers": (p, n, a, m, ctx) =>
      a.t !== "reveal" || !inChat(ctx, m.user) || p.revealAt !== 0 || p.answers.length < 2 || !answerOf(p, m.user) || n.revealAt === m.time,
    "an early reveal needs the actor's answer and one more, and changes no answer": (p, n, a, m) =>
      a.t !== "reveal" || p === n || (p.revealAt === 0 && n.revealAt === m.time && !!answerOf(p, m.user) && p.answers.length >= 2 && JSON.stringify(p.answers) === JSON.stringify(n.answers)),
    "the subject and scale never change": (p, n) => setupText(p) === setupText(n),
    "only people in the chat answer": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (k < 0.12) return { t: "reveal" };
    if (s.mode === "score") return { t: "score", value: s.low + r.int(s.high - s.low + 1) };
    return { t: "word", word: s.words.length && k < 0.7 ? r.pick(s.words) : r.pick(["mid", "green flag", "fair", "no", "cute"]) };
  },

  local: { draft: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const mine = answerOf(state, me);
    const answered = members.filter((m) => answerOf(state, m.id)).map((m) => m.id);
    const waiting = members.filter((m) => !answerOf(state, m.id)).map((m) => m.id);
    const shown = state.revealAt !== 0;
    const t = shown ? running(state.revealAt, REVEAL_MS) : null;
    const span = state.high - state.low;
    const steps = Array.from({ length: span + 1 }, (_, i) => state.low + i);
    const cols = steps.length <= 6 ? steps.length : Math.ceil(steps.length / 2);
    const scores = state.answers.map((x) => x.score);
    const avg = avgTenths(scores);

    // The strip: faces placed by score, stacked when they share one. On reveal they drop in
    // from the average, one after another.
    const strip = () => {
      const byScore = new Map<number, string[]>();
      for (const x of state.answers) byScore.set(x.score, [...(byScore.get(x.score) ?? []), x.u]);
      const from = span ? (avg / 10 - state.low) / span : 0.5;
      let k = 0;
      return (
        <div style={{ position: "relative", height: 92, margin: "4px 12px 0" }}>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 22, height: 4, borderRadius: 2, background: theme.color.track }} />
          {steps.map((v) => (
            <div key={v} aria-hidden="true" style={{ position: "absolute", bottom: 4, left: `${((v - state.low) / span) * 100}%`, transform: "translateX(-50%)", fontSize: 11, lineHeight: "14px", color: theme.color.secondaryText }}>
              {v}
            </div>
          ))}
          {[...byScore.entries()].flatMap(([v, us]) =>
            us.slice(0, 3).map((u, i) => {
              const at = (v - state.low) / span;
              const e = t === null ? 1 : drop(Math.max(0, t - 120 * k++));
              const x = from + (at - from) * e;
              return (
                <div key={u} style={{ position: "absolute", left: `${x * 100}%`, bottom: 30 + i * 18, transform: `translate(-50%, ${(1 - Math.min(1, e)) * -24}px)`, opacity: Math.min(1, e * 2) }}>
                  <Avatar user={u} size={24} />
                </div>
              );
            }),
          )}
        </div>
      );
    };

    const words = () => {
      const groups = new Map<string, string[]>();
      for (const x of state.answers) groups.set(x.word, [...(groups.get(x.word) ?? []), x.u]);
      const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, minHeight: 48, alignContent: "flex-start" }}>
          {sorted.slice(0, 6).map(([w, us], i) => {
            const e = t === null ? 1 : drop(Math.max(0, t - 140 * i));
            return (
              <div key={w} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px 6px 12px", borderRadius: 18, background: i === 0 ? theme.color.selected : theme.color.input, transform: `scale(${0.6 + 0.4 * e})`, opacity: Math.min(1, e * 2), maxWidth: "100%" }}>
                <span style={{ fontWeight: 600, color: i === 0 ? theme.color.link : theme.color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w}</span>
                <Facepile users={us} max={3} size={20} />
                {us.length > 1 ? <small>{us.length}</small> : null}
              </div>
            );
          })}
        </div>
      );
    };

    const sendWord = () => {
      if (cleanWord(local.draft)) dispatch({ t: "word", word: local.draft });
      setLocal({ draft: "" });
    };

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.detail || undefined} />
        {shown ? (
          <div>
            {state.mode === "score" ? (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, opacity: t === null ? 1 : fade(t) }}>
                <div style={{ fontSize: 28, lineHeight: "32px", fontWeight: 700 }}>{state.answers.length ? tenths(avg) : "–"}</div>
                <small>{state.answers.length ? `average · lowest ${Math.min(...scores)}, highest ${Math.max(...scores)} · ${state.answers.length} rated` : "No ratings yet"}</small>
              </div>
            ) : null}
            {state.mode === "score" ? strip() : words()}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: theme.radius.card, background: theme.color.input, minHeight: 56 }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
              {answered.map((u) => (
                <Avatar key={u} user={u} size={28} />
              ))}
              {waiting.map((u) => (
                <span key={u} aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 14, boxShadow: `inset 0 0 0 2px ${theme.color.divider}` }} />
              ))}
            </div>
            <div style={{ textAlign: "right", flex: "none" }}>
              <div style={{ fontWeight: 600 }}>{`${answered.length} of ${members.length} in`}</div>
              <small>Hidden till everyone's in</small>
            </div>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          {state.mode === "score" ? (
            <div>
              <div role="group" aria-label="Your score" style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
                {steps.map((v) => {
                  const on = mine?.score === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={on}
                      onClick={() => dispatch({ t: "score", value: v })}
                      style={{ height: 44, borderRadius: theme.radius.button, fontWeight: 600, background: on ? theme.color.primary : theme.color.secondaryButton, color: on ? theme.color.onPrimary : theme.color.secondaryButtonText }}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
              {state.lowLabel || state.highLabel ? (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <small>{state.lowLabel ? `${state.low} · ${state.lowLabel}` : ""}</small>
                  <small>{state.highLabel ? `${state.highLabel} · ${state.high}` : ""}</small>
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              {state.words.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {state.words.map((w) => (
                    <Button key={w} kind={mine?.word === w ? "deemphasized" : "secondary"} onClick={() => dispatch({ t: "word", word: w })}>
                      {w}
                    </Button>
                  ))}
                </div>
              ) : null}
              <form
                style={{ display: "flex", gap: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  sendWord();
                }}
              >
                <input value={local.draft} maxLength={MAX_WORD} placeholder={mine ? `You said "${mine.word}"` : "One word"} aria-label="Your word" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
                <Button kind="primary" disabled={!cleanWord(local.draft)} onClick={sendWord}>
                  Send
                </Button>
              </form>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44, marginTop: 4 }}>
          {!shown && mine && state.answers.length >= 2 ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "reveal" })}>
              Reveal now
            </Button>
          ) : (
            <SystemLine>{shown ? (t !== null ? (allIn(state, { members }) ? "Everyone's in" : "Revealed early") : mine ? "You can still change yours" : "Add yours") : mine ? "Yours is in" : "Pick yours"}</SystemLine>
          )}
        </div>
      </div>
    );
  },
});
