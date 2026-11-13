import { defineApp, Avatar, Button, CardHeader, Facepile, OptionRow, rng, running } from "@muse/app";

const CHAT = {
  title: "Who's the imposter?",
  minPlayers: 3,
  spots: ["Library", "Dining hall", "Rec center", "Quad", "Laundry room", "Bookstore", "Shuttle bus", "24hr diner on Main St"],
};

type Phase = "lobby" | "hints" | "vote" | "done";
type Hint = { user: string; text: string };
type Vote = { voter: string; target: string };
type State = {
  spots: string[];
  phase: Phase;
  players: string[];
  word: string;
  imposter: string;
  startedAt: number;
  hints: Hint[];
  votes: Vote[];
};
type Action = { t: "start" } | { t: "hint"; text: string } | { t: "vote"; target: string } | { t: "again" };
type Local = { draft: string };

const MAX_HINT = 20;
const DEAL_MS = 1500;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const clean = (t: string) => t.trim().replace(/\s+/g, " ");
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
const countFor = (s: State, id: string) => s.votes.filter((v) => v.target === id).length;
const caught = (s: State) => s.players.every((p) => p === s.imposter || countFor(s, p) < countFor(s, s.imposter));

const lobbyOf = (s: State): State => ({ ...s, phase: "lobby", players: [], word: "", imposter: "", startedAt: 0, hints: [], votes: [] });

export default defineApp<State, Action, Local>({
  name: "Imposter game",
  summary: (s) => {
    if (s.phase === "lobby") return `${CHAT.title} Waiting to start.`;
    if (s.phase === "hints") return `${CHAT.title} ${s.hints.length} of ${s.players.length} hinted.`;
    if (s.phase === "vote") return `${CHAT.title} ${s.votes.length} of ${s.players.length} voted.`;
    return `${CHAT.title} Imposter ${caught(s) ? "caught" : "escaped"}.`;
  },

  init: () => ({ spots: [...CHAT.spots], phase: "lobby", players: [], word: "", imposter: "", startedAt: 0, hints: [], votes: [] }),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "start") {
      if (s.phase !== "lobby" || ctx.members.length < CHAT.minPlayers || s.spots.length === 0) return s;
      const r = rng(m.seed);
      const word = r.pick(s.spots);
      const players = ctx.members.map((x) => x.id);
      const imposter = r.pick(players);
      return { ...s, phase: "hints", players, word, imposter, startedAt: m.time, hints: [], votes: [] };
    }
    if (a.t === "hint") {
      if (s.phase !== "hints" || !s.players.includes(m.user) || typeof a.text !== "string") return s;
      const text = clean(a.text);
      if (!text || text.length > MAX_HINT || s.hints.some((h) => h.user === m.user)) return s;
      const hints = [...s.hints, { user: m.user, text }];
      return { ...s, hints, phase: hints.length === s.players.length ? "vote" : "hints" };
    }
    if (a.t === "vote") {
      if (s.phase !== "vote" || !s.players.includes(m.user) || typeof a.target !== "string") return s;
      if (!s.players.includes(a.target) || a.target === m.user || s.votes.some((v) => v.voter === m.user)) return s;
      const votes = [...s.votes, { voter: m.user, target: a.target }];
      return { ...s, votes, phase: votes.length === s.players.length ? "done" : "vote" };
    }
    if (a.t === "again") {
      if (s.phase !== "done") return s;
      return lobbyOf(s);
    }
    return s;
  },

  // Someone in the round left: the round can't finish fairly, so go back to the lobby.
  onMembers: (s, ctx) => {
    if (s.phase === "lobby") return s;
    if (s.players.every((p) => inChat(ctx, p))) return s;
    return lobbyOf(s);
  },

  invariants: {
    "players are in the chat and not repeated": (s, ctx) => s.players.every((p) => inChat(ctx, p)) && new Set(s.players).size === s.players.length,
    "lobby is empty; a round has a spot, an imposter among the players and at least 3 players": (s) =>
      s.phase === "lobby"
        ? s.players.length === 0 && s.hints.length === 0 && s.votes.length === 0 && s.word === "" && s.imposter === ""
        : s.spots.includes(s.word) && s.players.includes(s.imposter) && s.players.length >= CHAT.minPlayers,
    "one hint and one vote per player at most, from players only": (s) =>
      new Set(s.hints.map((h) => h.user)).size === s.hints.length &&
      new Set(s.votes.map((v) => v.voter)).size === s.votes.length &&
      s.hints.every((h) => s.players.includes(h.user) && h.text === clean(h.text) && h.text.length > 0 && h.text.length <= MAX_HINT) &&
      s.votes.every((v) => s.players.includes(v.voter) && s.players.includes(v.target)),
    "no one votes for themselves": (s) => s.votes.every((v) => v.voter !== v.target),
    "the phase agrees with the hint and vote counts": (s) => {
      const n = s.players.length;
      if (s.phase === "lobby") return s.hints.length === 0 && s.votes.length === 0;
      if (s.phase === "hints") return s.hints.length < n && s.votes.length === 0;
      if (s.phase === "vote") return s.hints.length === n && s.votes.length < n;
      return s.hints.length === n && s.votes.length === n;
    },
  },

  transitions: {
    "a start deals everyone in the chat, picks the spot and imposter from the seed, and moves to hints": (p, n, a, m, ctx) => {
      if (a.t !== "start" || p === n) return true;
      const r = rng(m.seed);
      const word = r.pick(p.spots);
      const players = ctx.members.map((x) => x.id);
      const imposter = r.pick(players);
      return (
        p.phase === "lobby" && n.phase === "hints" && n.players.join() === players.join() && n.word === word && n.imposter === imposter &&
        n.startedAt === m.time && n.hints.length === 0 && n.votes.length === 0
      );
    },
    "a hint adds one trimmed entry for the actor and changes nothing else": (p, n, a, m) => {
      if (a.t !== "hint" || p === n) return true;
      const last = n.hints[n.hints.length - 1];
      return (
        typeof a.text === "string" && p.phase === "hints" && n.hints.length === p.hints.length + 1 && !!last && last.user === m.user &&
        last.text === clean(a.text) && same(p.hints, n.hints.slice(0, -1)) && same(p.votes, n.votes) && same(p.players, n.players)
      );
    },
    "a vote adds one entry for the actor naming another player and leaves hints and players alone": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const last = n.votes[n.votes.length - 1];
      return (
        p.phase === "vote" && n.votes.length === p.votes.length + 1 && !!last && last.voter === m.user && last.target === a.target &&
        last.target !== m.user && same(p.votes, n.votes.slice(0, -1)) && same(p.hints, n.hints) && same(p.players, n.players)
      );
    },
    "play again only follows a finished round and returns to the lobby": (p, n, a) => a.t !== "again" || p === n || (p.phase === "done" && n.phase === "lobby"),
    "only people in the chat change anything, and only players hint or vote": (p, n, a, m, ctx) =>
      p === n || (inChat(ctx, m.user) && ((a.t !== "hint" && a.t !== "vote") || p.players.includes(m.user))),
    "the spots never change, and the spot and imposter change only on start or again": (p, n, a) =>
      p.spots.join("|") === n.spots.join("|") && (a.t === "start" || a.t === "again" || (p.word === n.word && p.imposter === n.imposter && same(p.players, n.players))),
  },

  arbitrary: (s, user, r) => {
    if (s.phase === "lobby") return r.next() < 0.85 ? { t: "start" } : { t: "again" };
    if (s.phase === "hints") return { t: "hint", text: r.pick(["books", "food", "late", "", "study", "loud", "a very long hint that is too long"]) };
    if (s.phase === "vote") return { t: "vote", target: r.pick(s.players.length ? s.players : [user]) };
    return { t: "again" };
  },

  local: { draft: "" },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((x) => x.id === id)?.name ?? "Someone"));
    const n = state.players.length;
    const iPlay = state.players.includes(me);
    const myHint = state.hints.find((h) => h.user === me);
    const myVote = state.votes.find((v) => v.voter === me);
    const dealing = state.phase !== "lobby" && (confirmed.phase === "lobby" || running(confirmed.startedAt, DEAL_MS) !== null);

    let subtitle = "Waiting to start";
    if (state.phase === "hints") subtitle = `${state.hints.length} of ${n} hinted`;
    if (state.phase === "vote") subtitle = `${state.votes.length} of ${n} voted`;
    if (state.phase === "done") subtitle = caught(state) ? "Imposter caught" : "Imposter escaped";

    const cardStyle = { background: theme.color.wash, color: theme.color.text, borderRadius: theme.radius.card, padding: 12, marginBottom: 8 };
    const cIm = confirmed.imposter === me;
    const cPlays = confirmed.players.includes(me);

    const role = () => {
      if (dealing) {
        return (
          <div style={cardStyle}>
            <b>Dealing</b>
            <div><small>Roles show in a moment</small></div>
          </div>
        );
      }
      if (!cPlays) {
        return (
          <div style={cardStyle}>
            <b>You are watching this round</b>
          </div>
        );
      }
      if (state.phase === "vote") {
        return <div style={{ marginBottom: 8 }}><small>{cIm ? "You are the imposter · no word" : `The spot is ${confirmed.word}`}</small></div>;
      }
      return cIm ? (
        <div style={cardStyle}>
          <b>You are the imposter</b>
          <div><small>No word. Listen and blend in.</small></div>
        </div>
      ) : (
        <div style={cardStyle}>
          <small>The spot is</small>
          <h2 style={{ margin: 0 }}>{confirmed.word}</h2>
        </div>
      );
    };

    const hintList = () => (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginBottom: 8 }}>
        {state.hints.map((h) => (
          <div key={h.user} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <Avatar user={h.user} size={20} />
            <small>{nameOf(h.user)}</small>
            <span style={{ fontWeight: 600 }}>{h.text}</span>
          </div>
        ))}
      </div>
    );

    const submit = () => {
      const text = clean(local.draft);
      if (!text || text.length > MAX_HINT) return;
      dispatch({ t: "hint", text });
      setLocal({ draft: "" });
    };

    const waiting = state.players.filter((p) => !state.hints.some((h) => h.user === p));
    const canVote = iPlay && !myVote && state.phase === "vote";
    const candidates = iPlay ? state.players.filter((p) => p !== me) : state.players;
    const imposterName = nameOf(state.imposter);

    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={subtitle} />

        {state.phase === "lobby" ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Facepile users={members} max={5} size={28} />
              <small>{members.length} in the chat · 1 imposter</small>
            </div>
            <div style={{ marginBottom: 8 }}>
              <small>The app picks the spot, so no one has to. Spots: {state.spots.join(" · ")}</small>
            </div>
            {members.length < CHAT.minPlayers ? <div style={{ marginBottom: 8 }}><small>Needs at least 3 people</small></div> : null}
            <Button kind="primary" wide disabled={members.length < CHAT.minPlayers} onClick={() => dispatch({ t: "start" })}>
              Start
            </Button>
          </div>
        ) : null}

        {state.phase === "hints" ? (
          <div>
            {role()}
            {!dealing && iPlay && !myHint ? (
              <form
                style={{ display: "flex", gap: 8, marginBottom: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <input value={local.draft} maxLength={MAX_HINT} placeholder="One word hint" aria-label="One word hint" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
                <Button kind="primary" disabled={clean(local.draft).length === 0} onClick={submit}>
                  Add
                </Button>
              </form>
            ) : null}
            {hintList()}
            {waiting.length ? <div style={{ marginBottom: 8 }}><small>Waiting on {waiting.map((p) => nameOf(p)).slice(0, 5).join(", ")}</small></div> : null}
            <small>Spots: {state.spots.join(" · ")}</small>
          </div>
        ) : null}

        {state.phase === "vote" ? (
          <div>
            {role()}
            {hintList()}
            <div style={{ display: "grid", gap: 2 }}>
              {candidates.map((id) => (
                <OptionRow
                  key={id}
                  label={nameOf(id)}
                  count={0}
                  total={Math.max(1, n)}
                  selected={myVote?.target === id}
                  onClick={() => {
                    if (canVote) dispatch({ t: "vote", target: id });
                  }}
                />
              ))}
            </div>
            <div style={{ marginTop: 4 }}>
              <small>{canVote ? "Tap who you think is the imposter" : myVote ? `You voted for ${nameOf(myVote.target)}` : "Voting is open to players"}</small>
            </div>
          </div>
        ) : null}

        {state.phase === "done" ? (
          <div>
            <h2 style={{ margin: "0 0 4px" }}>{caught(state) ? "Imposter caught" : "Imposter escaped"}</h2>
            <div style={{ marginBottom: 8 }}>
              <small>{imposterName === "You" ? "You were" : `${imposterName} was`} the imposter · the spot was {state.word}</small>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginBottom: 8 }}>
              {state.players.map((id) => (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Avatar user={id} size={20} />
                  <small>
                    {nameOf(id)} · {countFor(state, id)} {countFor(state, id) === 1 ? "vote" : "votes"}
                  </small>
                </div>
              ))}
            </div>
            <Button kind="secondary" onClick={() => dispatch({ t: "again" })}>
              Play again
            </Button>
          </div>
        ) : null}
      </div>
    );
  },
});
