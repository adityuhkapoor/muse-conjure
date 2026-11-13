import { defineApp, Avatar, Button, CardHeader, SystemLine, rng } from "@muse/app";

// Guess who: a card about someone in the chat shows one clue at a time. Everyone else guesses
// who it is. A right guess scores 4 minus the clues showing.

const CONTENT = {
  title: "Guess who",
  cards: [
    { name: "Owen", clues: ["Says they have a plan for it", "Shops the Trader Joe's sales", "Leaves a rotisserie chicken in the dining hall fridge every week"] },
    { name: "Jalen", clues: ["Was in a hoodie, not a bathrobe", "Missed the bus to the away game", "Sleeps through everything"] },
    { name: "Abby", clues: ["Gets an oat latte", "Sent the purple route on Tuesday", "At the rock wall til 9"] },
    { name: "Tess", clues: ["Takes coffee just black", "Watched someone send the purple route", "Got their cat Biscuit a tiny sweater"] },
    { name: "Felix", clues: ["Knows everyone's coffee order", "Says they are broke", "Works shifts at the campus coffee place"] },
    { name: "Leo", clues: ["Says it's seasonal", "Gets the pumpkin drink with 3 shots", "Wears a yellow rain jacket every day"] },
  ],
};

type Card = { id: string; name: string; clues: string[] };
type Guess = { user: string; guess: string; points: number };
type Round = { card: string; subject: string; shown: number; at: number; revealed: boolean; guesses: Guess[] };
type Score = { user: string; points: number };
type State = { cards: Card[]; used: string[]; round: Round | null; scores: Score[]; roundNo: number };
type Action = { t: "start" } | { t: "clue" } | { t: "reveal" } | { t: "guess"; who: string };
type Local = Record<string, never>;
type Mems = { members: { id: string; name: string }[] };

const MAX_CLUES = 3;
const inChat = (ctx: Mems, id: string) => ctx.members.some((m) => m.id === id);
const memberFor = (ctx: Mems, name: string) => ctx.members.find((m) => m.name.trim().toLowerCase() === name.trim().toLowerCase());
const eligible = (s: State, ctx: Mems) => s.cards.filter((c) => !s.used.includes(c.id) && !!memberFor(ctx, c.name));
const allGuessed = (r: Round, ctx: Mems) => ctx.members.filter((m) => m.id !== r.subject).every((m) => r.guesses.some((g) => g.user === m.id));
const closed = (r: Round, ctx: Mems) => r.revealed || allGuessed(r, ctx);
const scoreOf = (s: State, u: string) => s.scores.find((x) => x.user === u)?.points ?? 0;
const scoresKey = (s: State) => s.scores.map((x) => `${x.user}:${x.points}`).join();
const guessKey = (gs: Guess[]) => gs.map((g) => `${g.user}>${g.guess}:${g.points}`).join();
const sameRoundBase = (a: Round, b: Round) => a.card === b.card && a.subject === b.subject && a.at === b.at;
const pts = (n: number) => `${n} point${n === 1 ? "" : "s"}`;

function addScore(s: State, user: string, points: number): Score[] {
  if (points <= 0) return s.scores;
  if (s.scores.some((x) => x.user === user)) return s.scores.map((x) => (x.user === user ? { ...x, points: x.points + points } : x));
  return [...s.scores, { user, points }];
}

export default defineApp<State, Action, Local>({
  name: "Guess who",
  summary: (s, ctx) => {
    const r = s.round;
    if (!r) return s.roundNo === 0 ? "Guess who · no round yet" : `Guess who · ${s.roundNo} rounds played`;
    const total = ctx.members.filter((m) => m.id !== r.subject).length;
    return `Guess who · round ${s.roundNo} · ${r.guesses.length} of ${total} guessed`;
  },

  init: () => ({
    cards: CONTENT.cards.map((c, i) => ({ id: `c${i}`, name: c.name, clues: c.clues.slice(0, MAX_CLUES) })),
    used: [],
    round: null,
    scores: [],
    roundNo: 0,
  }),

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    const r = s.round;
    if (a.t === "start") {
      if (r && !closed(r, ctx)) return s;
      const el = eligible(s, ctx);
      if (el.length === 0) return s;
      const card = rng(meta.seed).pick(el);
      const subject = memberFor(ctx, card.name);
      if (!subject) return s;
      return {
        ...s,
        used: [...s.used, card.id],
        roundNo: s.roundNo + 1,
        round: { card: card.id, subject: subject.id, shown: 1, at: meta.time, revealed: false, guesses: [] },
      };
    }
    if (a.t === "clue") {
      if (!r || closed(r, ctx) || r.shown >= MAX_CLUES) return s;
      return { ...s, round: { ...r, shown: r.shown + 1 } };
    }
    if (a.t === "reveal") {
      if (!r || r.revealed || r.shown !== MAX_CLUES) return s;
      return { ...s, round: { ...r, revealed: true } };
    }
    if (a.t === "guess") {
      if (!r || r.revealed || meta.user === r.subject) return s;
      if (r.guesses.some((g) => g.user === meta.user)) return s;
      const who = a.who;
      if (typeof who !== "string" || !inChat(ctx, who) || who === meta.user) return s;
      const points = who === r.subject ? 4 - r.shown : 0;
      return {
        ...s,
        round: { ...r, guesses: [...r.guesses, { user: meta.user, guess: who, points }] },
        scores: addScore(s, meta.user, points),
      };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    let round = s.round;
    if (round && !inChat(ctx, round.subject)) round = null;
    else if (round) {
      const guesses = round.guesses.filter((g) => inChat(ctx, g.user) && inChat(ctx, g.guess));
      if (guesses.length !== round.guesses.length) round = { ...round, guesses };
    }
    const scores = s.scores.filter((x) => inChat(ctx, x.user));
    if (round === s.round && scores.length === s.scores.length) return s;
    return { ...s, round, scores };
  },

  invariants: {
    "scores are unique, positive and cover every right guess": (s) =>
      new Set(s.scores.map((x) => x.user)).size === s.scores.length &&
      s.scores.every((x) => Number.isInteger(x.points) && x.points > 0) &&
      (s.round === null || s.round.guesses.every((g) => g.points === 0 || scoreOf(s, g.user) >= g.points)),
    "each card is played once and rounds match cards played": (s) =>
      s.cards.length === CONTENT.cards.length &&
      s.cards.every((c, i) => c.id === `c${i}` && c.name === CONTENT.cards[i]!.name && c.clues.length === MAX_CLUES) &&
      new Set(s.used).size === s.used.length &&
      s.used.every((u) => s.cards.some((c) => c.id === u)) &&
      s.roundNo === s.used.length &&
      (s.round === null || s.used.includes(s.round.card)),
    "a round shows 1 to 3 clues and each person guesses once, never the subject": (s) => {
      const r = s.round;
      if (!r) return true;
      return (
        Number.isInteger(r.shown) && r.shown >= 1 && r.shown <= MAX_CLUES &&
        (!r.revealed || r.shown === MAX_CLUES) &&
        new Set(r.guesses.map((g) => g.user)).size === r.guesses.length &&
        r.guesses.every((g) => g.user !== r.subject && g.user !== g.guess)
      );
    },
    "a guess scores only when it names the subject, more with fewer clues": (s) => {
      const r = s.round;
      if (!r) return true;
      return r.guesses.every((g) => (g.guess === r.subject ? Number.isInteger(g.points) && g.points >= 4 - r.shown && g.points <= 3 : g.points === 0));
    },
    "everyone in the game is in the chat and the subject fits the card": (s, ctx) => {
      if (!s.scores.every((x) => inChat(ctx, x.user))) return false;
      const r = s.round;
      if (!r) return true;
      const card = s.cards.find((c) => c.id === r.card);
      const subj = ctx.members.find((m) => m.id === r.subject);
      return (
        !!card && !!subj && subj.name.trim().toLowerCase() === card.name.trim().toLowerCase() &&
        r.guesses.every((g) => inChat(ctx, g.user) && inChat(ctx, g.guess))
      );
    },
  },

  transitions: {
    "a guess adds one entry for the guesser with the right points and their score": (p, n, a, m) => {
      if (a.t !== "guess" || p === n) return true;
      const pr = p.round, nr = n.round;
      if (!pr || !nr || pr.revealed || !sameRoundBase(pr, nr) || nr.shown !== pr.shown || nr.revealed !== pr.revealed) return false;
      const points = a.who === pr.subject ? 4 - pr.shown : 0;
      const expect = [...pr.guesses, { user: m.user, guess: String(a.who), points }];
      const othersSame = p.scores.every((x) => x.user === m.user || scoreOf(n, x.user) === x.points) && n.scores.every((x) => x.user === m.user || scoreOf(p, x.user) === x.points);
      return guessKey(nr.guesses) === guessKey(expect) && scoreOf(n, m.user) === scoreOf(p, m.user) + points && othersSame && n.used.join() === p.used.join() && n.roundNo === p.roundNo;
    },
    "a clue shows exactly one more clue and changes nothing else": (p, n, a) => {
      if (a.t !== "clue" || p === n) return true;
      const pr = p.round, nr = n.round;
      return !!pr && !!nr && !pr.revealed && sameRoundBase(pr, nr) && nr.shown === pr.shown + 1 && nr.revealed === pr.revealed &&
        guessKey(nr.guesses) === guessKey(pr.guesses) && scoresKey(n) === scoresKey(p) && n.roundNo === p.roundNo;
    },
    "showing the answer needs every clue out and changes nothing else": (p, n, a) => {
      if (a.t !== "reveal" || p === n) return true;
      const pr = p.round, nr = n.round;
      return !!pr && !!nr && pr.shown === MAX_CLUES && !pr.revealed && nr.revealed && sameRoundBase(pr, nr) && nr.shown === pr.shown &&
        guessKey(nr.guesses) === guessKey(pr.guesses) && scoresKey(n) === scoresKey(p);
    },
    "a start plays the unused card the seed picks, with one clue and no guesses": (p, n, a, m, ctx) => {
      if (a.t !== "start" || p === n) return true;
      if (p.round && !closed(p.round, ctx)) return false;
      const el = eligible(p, ctx);
      if (el.length === 0) return false;
      const card = rng(m.seed).pick(el);
      const r = n.round;
      return !!r && r.card === card.id && r.subject === memberFor(ctx, card.name)?.id && r.shown === 1 && !r.revealed && r.at === m.time &&
        r.guesses.length === 0 && !p.used.includes(card.id) && n.used.join() === [...p.used, card.id].join() &&
        n.roundNo === p.roundNo + 1 && scoresKey(n) === scoresKey(p);
    },
    "the subject never guesses and no score goes down": (p, n, a, m) =>
      p.scores.every((x) => scoreOf(n, x.user) >= x.points) &&
      (a.t !== "guess" || p === n || !p.round || m.user !== p.round.subject),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const rd = s.round;
    if (!rd || closed(rd, ctx)) return r.next() < 0.9 ? { t: "start" } : { t: "clue" };
    if (rd.shown === MAX_CLUES && r.next() < 0.3) return { t: "reveal" };
    const canGuess = user !== rd.subject && !rd.guesses.some((g) => g.user === user);
    if (canGuess && r.next() < 0.7) {
      const pool = ctx.members.map((x) => x.id);
      const who = r.next() < 0.4 || pool.length === 0 ? rd.subject : r.pick(pool);
      return { t: "guess", who };
    }
    return r.next() < 0.6 ? { t: "clue" } : { t: "reveal" };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const ctx = { members };
    const name = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const picking = pending && state.roundNo !== confirmed.roundNo;
    const r = picking ? null : state.round;
    const card = r ? state.cards.find((c) => c.id === r.card) : undefined;
    const guessers = r ? members.filter((m) => m.id !== r.subject) : [];
    const isClosed = r ? closed(r, ctx) : false;
    const mine = r?.guesses.find((g) => g.user === me);
    const left = eligible(state, ctx).length;
    const roundNo = picking ? confirmed.roundNo + 1 : state.roundNo;
    const subtitle = picking
      ? `Round ${roundNo}`
      : r
        ? `Round ${roundNo} · ${r.guesses.length} of ${guessers.length} guessed`
        : left > 0
          ? `${left} cards left`
          : "All cards played";
    const scores = [...state.scores].sort((a, b) => b.points - a.points);

    return (
      <div>
        <CardHeader title={CONTENT.title} subtitle={subtitle} />
        {picking ? (
          <SystemLine>Picking a card</SystemLine>
        ) : r && card ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gap: 4 }}>
              {card.clues.slice(0, r.shown).map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 6, color: theme.color.text }}>
                  <span style={{ color: theme.color.secondaryText, flexShrink: 0 }}>{`${i + 1}.`}</span>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{c}</span>
                </div>
              ))}
            </div>
            {isClosed ? (
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar user={r.subject} size={28} />
                  <span style={{ fontWeight: 600, color: theme.color.text }}>{`It was ${name(r.subject)}`}</span>
                </div>
                {r.guesses.length === 0 ? <small>No guesses</small> : null}
                {r.guesses.map((g) => (
                  <small key={g.user} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {`${name(g.user)} said ${name(g.guess)} · ${g.points > 0 ? `right · ${pts(g.points)}` : "wrong"}`}
                  </small>
                ))}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <small>{`Right now: ${pts(4 - r.shown)}`}</small>
                {me === r.subject ? (
                  <SystemLine>This one is about you</SystemLine>
                ) : mine ? (
                  <SystemLine>{`You guessed ${name(mine.guess)}`}</SystemLine>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 6 }}>
                    {members
                      .filter((m) => m.id !== me)
                      .map((m) => (
                        <button
                          key={m.id}
                          onClick={() => dispatch({ t: "guess", who: m.id })}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            minHeight: 44,
                            minWidth: 0,
                            padding: "0 8px",
                            border: "none",
                            borderRadius: theme.radius.button,
                            background: theme.color.secondaryButton,
                            color: theme.color.secondaryButtonText,
                            font: "inherit",
                            cursor: "pointer",
                          }}
                        >
                          <Avatar user={m.id} size={20} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isClosed ? (
                <Button kind="primary" disabled={left === 0} onClick={() => dispatch({ t: "start" })}>
                  Next round
                </Button>
              ) : r.shown < MAX_CLUES ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "clue" })}>
                  Next clue
                </Button>
              ) : (
                <Button kind="secondary" onClick={() => dispatch({ t: "reveal" })}>
                  Show answer
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <small>{left > 0 ? "A card about someone here, one clue at a time" : "Every card has been played"}</small>
            <div>
              <Button kind="primary" disabled={left === 0} onClick={() => dispatch({ t: "start" })}>
                Start
              </Button>
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 12, minHeight: 24 }}>
          {scores.length === 0 ? (
            <small>No points yet</small>
          ) : (
            scores.map((x) => (
              <div key={x.user} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Avatar user={x.user} size={20} />
                <small>{`${name(x.user)} ${x.points}`}</small>
              </div>
            ))
          )}
        </div>
      </div>
    );
  },
});
