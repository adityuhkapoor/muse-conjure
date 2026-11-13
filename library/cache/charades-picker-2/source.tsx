import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine, Toast, rng, running } from "@muse/app";

const C = {
  title: "Charades and Pictionary",
  words: [
    "Leo getting stuck in the kayak",
    "Ravi's burnt s'mores",
    "Amir and the goose",
    "Tess's playlist of only Taylor",
    "The wrong exit to Pittsfield",
    "Jake's mystery cooler",
  ],
  teamNames: { a: "Team A", b: "Team B" },
  charades: "Charades",
  pictionary: "Pictionary",
};

type Side = "a" | "b";
type Word = { id: string; label: string; used: boolean };
type Entry = { round: number; side: string; word: string; got: boolean };
type State = {
  words: Word[];
  teams: { a: string[]; b: string[] };
  phase: "setup" | "ready" | "playing" | "reveal";
  round: number;
  turn: { a: number; b: number };
  side: Side;
  performer: string | null;
  wordId: string | null;
  drawnAt: number;
  score: { a: number; b: number };
  log: Entry[];
};
type Action =
  | { t: "split" }
  | { t: "addWord"; label: string }
  | { t: "draw" }
  | { t: "score"; got: boolean }
  | { t: "next" }
  | { t: "reset" };
type Local = { draft: string; toast: number };

const MAX_WORDS = 12;
const MAX_LABEL = 40;
const MAX_LOG = 12;
const REVEAL_MS = 1200;

const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const other = (s: Side): Side => (s === "a" ? "b" : "a");
const nextUp = (s: State, side: Side): string | null => {
  const l = s.teams[side];
  return l.length ? (l[s.turn[side] % l.length] ?? null) : null;
};
const usedN = (s: State) => s.words.filter((w) => w.used).length;
const pool = (s: State) => {
  const u = s.words.filter((w) => !w.used);
  return u.length ? u : s.words;
};
const teamOf = (s: State, id: string): Side | null => (s.teams.a.includes(id) ? "a" : s.teams.b.includes(id) ? "b" : null);
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

export default defineApp<State, Action, Local>({
  name: "Charades and Pictionary",
  summary: (s) =>
    s.phase === "setup"
      ? `${C.title} · teams not split yet`
      : `Round ${s.round + 1} · ${C.teamNames.a} ${s.score.a} · ${C.teamNames.b} ${s.score.b}`,

  init: (): State => ({
    words: C.words.slice(0, MAX_WORDS).map((label, i) => ({ id: "s" + i, label, used: false })),
    teams: { a: [], b: [] },
    phase: "setup",
    round: 0,
    turn: { a: 0, b: 0 },
    side: "a",
    performer: null,
    wordId: null,
    drawnAt: 0,
    score: { a: 0, b: 0 },
    log: [],
  }),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    switch (action.t) {
      case "split": {
        if (state.phase !== "setup" || ctx.members.length < 2) return state;
        const order = rng(meta.seed).shuffle(ctx.members.map((m) => m.id));
        const k = Math.ceil(order.length / 2);
        return { ...state, teams: { a: order.slice(0, k), b: order.slice(k) }, phase: "ready", side: "a" };
      }
      case "addWord": {
        if (typeof action.label !== "string") return state;
        const label = clean(action.label);
        if (!label || label.length > MAX_LABEL || state.words.length >= MAX_WORDS) return state;
        if (state.words.some((w) => w.label.toLowerCase() === label.toLowerCase())) return state;
        return { ...state, words: [...state.words, { id: "w" + meta.seq, label, used: false }] };
      }
      case "draw": {
        if (state.phase !== "ready" || state.words.length === 0) return state;
        if (nextUp(state, state.side) !== meta.user) return state;
        const pick = rng(meta.seed).pick(pool(state));
        const fresh = state.words.some((w) => !w.used) ? state.words : state.words.map((w) => ({ ...w, used: false }));
        return {
          ...state,
          words: fresh.map((w) => (w.id === pick.id ? { ...w, used: true } : w)),
          performer: meta.user,
          wordId: pick.id,
          phase: "playing",
          drawnAt: meta.time,
        };
      }
      case "score": {
        if (typeof action.got !== "boolean" || state.phase !== "playing") return state;
        if (!state.teams[state.side].includes(meta.user) || meta.user === state.performer) return state;
        const w = state.words.find((x) => x.id === state.wordId);
        if (!w) return state;
        const add = action.got ? 1 : 0;
        const score = state.side === "a" ? { a: state.score.a + add, b: state.score.b } : { a: state.score.a, b: state.score.b + add };
        const entry: Entry = { round: state.round, side: state.side, word: w.label, got: action.got };
        return { ...state, score, log: [...state.log, entry].slice(-MAX_LOG), phase: "reveal", performer: null };
      }
      case "next": {
        if (state.phase !== "reveal") return state;
        const turn = state.side === "a" ? { a: state.turn.a + 1, b: state.turn.b } : { a: state.turn.a, b: state.turn.b + 1 };
        return { ...state, round: state.round + 1, turn, side: other(state.side), wordId: null, drawnAt: 0, phase: "ready" };
      }
      case "reset": {
        if (state.phase === "setup") return state;
        return {
          ...state,
          words: state.words.map((w) => (w.used ? { ...w, used: false } : w)),
          teams: { a: [], b: [] },
          phase: "setup",
          round: 0,
          turn: { a: 0, b: 0 },
          side: "a",
          performer: null,
          wordId: null,
          drawnAt: 0,
          score: { a: 0, b: 0 },
          log: [],
        };
      }
      default:
        return state;
    }
  },

  onMembers: (state, ctx) => {
    if (state.phase === "setup") return state;
    let a = state.teams.a.filter((id) => inChat(ctx, id));
    let b = state.teams.b.filter((id) => inChat(ctx, id));
    const move = (src: string[], dst: string[]): [string[], string[]] => {
      let i = src.length - 1;
      while (i >= 0 && src[i] === state.performer) i--;
      if (i < 0) return [src, dst];
      return [src.filter((_, j) => j !== i), [...dst, src[i]!]];
    };
    while (a.length - b.length > 1) {
      const r = move(a, b);
      if (r[0] === a) break;
      a = r[0];
      b = r[1];
    }
    while (b.length - a.length > 1) {
      const r = move(b, a);
      if (r[0] === b) break;
      b = r[0];
      a = r[1];
    }
    for (const m of ctx.members) {
      if (!a.includes(m.id) && !b.includes(m.id)) {
        if (a.length <= b.length) a = [...a, m.id];
        else b = [...b, m.id];
      }
    }
    const gone = state.performer !== null && !inChat(ctx, state.performer);
    const unchanged = a.join() === state.teams.a.join() && b.join() === state.teams.b.join();
    if (unchanged && !gone) return state;
    const next: State = { ...state, teams: { a, b } };
    if (gone) return { ...next, performer: null, phase: "ready", wordId: null, drawnAt: 0 };
    return next;
  },

  invariants: {
    "nobody is on both teams and no one repeats": (s) => new Set([...s.teams.a, ...s.teams.b]).size === s.teams.a.length + s.teams.b.length,
    "team members are in the chat": (s, ctx) => [...s.teams.a, ...s.teams.b].every((id) => inChat(ctx, id)),
    "setup has no teams, and once split everyone is on a team and sizes differ by at most one": (s, ctx) =>
      s.phase === "setup"
        ? s.teams.a.length === 0 && s.teams.b.length === 0
        : ctx.members.every((m) => teamOf(s, m.id) !== null) && Math.abs(s.teams.a.length - s.teams.b.length) <= 1,
    "scores are whole numbers within the rounds played, and the side follows the round": (s) =>
      Number.isInteger(s.round) &&
      s.round >= 0 &&
      Number.isInteger(s.score.a) &&
      Number.isInteger(s.score.b) &&
      s.score.a >= 0 &&
      s.score.b >= 0 &&
      s.score.a + s.score.b <= s.round + (s.phase === "reveal" ? 1 : 0) &&
      s.side === (s.round % 2 === 0 ? "a" : "b") &&
      Number.isInteger(s.turn.a) &&
      Number.isInteger(s.turn.b) &&
      s.turn.a >= 0 &&
      s.turn.b >= 0,
    "playing needs a performer on the team up with a used word; waiting phases have no performer": (s) => {
      if (s.phase === "playing") {
        const w = s.words.find((x) => x.id === s.wordId);
        return s.performer !== null && s.teams[s.side].includes(s.performer) && !!w && w.used;
      }
      if (s.phase === "reveal") return s.performer === null && s.words.some((x) => x.id === s.wordId);
      return s.performer === null && s.wordId === null;
    },
    "the word bank and log stay within limits": (s) =>
      s.words.length <= MAX_WORDS &&
      new Set(s.words.map((w) => w.id)).size === s.words.length &&
      new Set(s.words.map((w) => w.label.toLowerCase())).size === s.words.length &&
      s.words.every((w) => w.label.length > 0 && w.label.length <= MAX_LABEL) &&
      s.log.length <= MAX_LOG,
  },

  transitions: {
    "a split puts everyone on a team in the order the seed gives": (p, n, a, m, ctx) => {
      if (a.t !== "split" || p === n) return true;
      const ord = rng(m.seed).shuffle(ctx.members.map((x) => x.id));
      const k = Math.ceil(ord.length / 2);
      return p.phase === "setup" && n.phase === "ready" && n.side === "a" && same(n.teams, { a: ord.slice(0, k), b: ord.slice(k) }) && same(p.words, n.words);
    },
    "a draw by the next performer picks the seeded word and starts the round": (p, n, a, m) => {
      if (a.t !== "draw" || p === n) return true;
      const pick = rng(m.seed).pick(pool(p));
      return (
        p.phase === "ready" &&
        m.user === nextUp(p, p.side) &&
        n.phase === "playing" &&
        n.performer === m.user &&
        n.wordId === pick.id &&
        n.drawnAt === m.time &&
        n.words.find((w) => w.id === pick.id)?.used === true &&
        usedN(n) === (p.words.some((w) => !w.used) ? usedN(p) : 0) + 1
      );
    },
    "a score closes the round for the team up, and only a teammate who is not acting makes it": (p, n, a, m) => {
      if (a.t !== "score" || p === n) return true;
      const s = p.side;
      const add = a.got === true ? 1 : 0;
      const last = n.log[n.log.length - 1];
      return (
        p.phase === "playing" &&
        n.phase === "reveal" &&
        p.teams[s].includes(m.user) &&
        m.user !== p.performer &&
        n.score[s] === p.score[s] + add &&
        n.score[other(s)] === p.score[other(s)] &&
        n.log.length === Math.min(MAX_LOG, p.log.length + 1) &&
        !!last &&
        last.got === (a.got === true) &&
        n.performer === null &&
        n.wordId === p.wordId
      );
    },
    "next adds one round, flips the side and moves that team's turn on, leaving score and words alone": (p, n, a) =>
      a.t !== "next" ||
      p === n ||
      (p.phase === "reveal" &&
        n.phase === "ready" &&
        n.round === p.round + 1 &&
        n.side === other(p.side) &&
        n.score.a === p.score.a &&
        n.score.b === p.score.b &&
        same(n.words, p.words) &&
        n.turn[p.side] === p.turn[p.side] + 1 &&
        n.turn[other(p.side)] === p.turn[other(p.side)] &&
        n.wordId === null),
    "adding a word appends one unused word and changes nothing else": (p, n, a, m) => {
      if (a.t !== "addWord" || p === n) return true;
      const last = n.words[n.words.length - 1];
      return (
        n.words.length === p.words.length + 1 &&
        same(n.words.slice(0, -1), p.words) &&
        !!last &&
        last.id === "w" + m.seq &&
        last.label === clean(String(a.label)) &&
        !last.used &&
        n.phase === p.phase &&
        n.round === p.round &&
        same(n.teams, p.teams) &&
        same(n.score, p.score)
      );
    },
    "a reset goes back to setup with no teams, no score and no used words": (p, n, a) =>
      a.t !== "reset" ||
      p === n ||
      (n.phase === "setup" &&
        n.score.a === 0 &&
        n.score.b === 0 &&
        n.log.length === 0 &&
        n.round === 0 &&
        n.teams.a.length === 0 &&
        n.teams.b.length === 0 &&
        n.words.length === p.words.length &&
        n.words.every((w) => !w.used)),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (k < 0.05) return { t: "reset" };
    if (k < 0.15) return { t: "addWord", label: r.pick(["Dani's paddleboard", "Tess's sunburn", "", "Late night ping pong", "Amir and the goose"]) };
    if (s.phase === "setup") return { t: "split" };
    if (s.phase === "ready") return nextUp(s, s.side) === user || k < 0.4 ? { t: "draw" } : { t: "next" };
    if (s.phase === "playing") return { t: "score", got: r.next() < 0.6 };
    return { t: "next" };
  },

  local: { draft: "", toast: 0 },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((x) => x.id === id)?.name ?? "Someone"));
    const mode = state.round % 2 === 0 ? C.charades : C.pictionary;
    const verb = state.round % 2 === 0 ? "acting" : "drawing";
    const setup = state.phase === "setup";
    const splitting = confirmed.phase === "setup" && state.phase !== "setup";
    const drawing = state.phase === "playing" && (confirmed.phase !== "playing" || running(confirmed.drawnAt, REVEAL_MS) !== null);
    const marked = state.phase === "playing" ? state.performer : state.phase === "ready" ? nextUp(state, state.side) : null;
    const up = nextUp(state, state.side);
    const myTeam = teamOf(confirmed, me);
    const secret = confirmed.phase === "playing" ? (confirmed.words.find((w) => w.id === confirmed.wordId)?.label ?? "") : "";
    const last = state.log[state.log.length - 1];
    const canAdd = clean(local.draft).length > 0 && state.words.length < MAX_WORDS;

    const sendWord = () => {
      if (!canAdd) return;
      dispatch({ t: "addWord", label: local.draft.slice(0, MAX_LABEL) });
      setLocal({ draft: "", toast: local.toast + 1 });
    };

    const teamBox = (side: Side) => {
      const ids = confirmed.teams[side];
      const isUp = !setup && !splitting && state.side === side;
      return (
        <div key={side} style={{ flex: 1, minWidth: 0, padding: 8, borderRadius: theme.radius.card, background: isUp ? theme.color.selected : theme.color.input }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <b style={ellipsis}>{C.teamNames[side]}</b>
            <b>{state.score[side]}</b>
          </div>
          <div style={{ display: "grid", gap: 2 }}>
            {ids.slice(0, 4).map((id) => (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 28 }}>
                <Avatar user={id} size={24} />
                <span style={{ ...ellipsis, flex: 1, minWidth: 0, fontWeight: id === marked && isUp ? 700 : 400 }}>{nameOf(id)}</span>
                {id === marked && isUp ? <small style={{ fontWeight: 700, color: theme.color.text }}>Up</small> : null}
              </div>
            ))}
            {ids.length > 4 ? <small>{`+${ids.length - 4} more`}</small> : null}
          </div>
        </div>
      );
    };

    const action = () => {
      if (splitting) return <SystemLine>Spinning</SystemLine>;
      if (setup)
        return (
          <Button kind="primary" wide disabled={members.length < 2 || pending} onClick={() => dispatch({ t: "split" })}>
            Split teams
          </Button>
        );
      if (state.phase === "ready") {
        if (up === me)
          return (
            <div style={{ display: "grid", gap: 4 }}>
              <small>{`Your turn · ${mode}`}</small>
              <Button kind="primary" wide onClick={() => dispatch({ t: "draw" })}>
                Draw word
              </Button>
            </div>
          );
        if (up === null)
          return (
            <div style={{ display: "grid", gap: 4 }}>
              <SystemLine>No one on this team</SystemLine>
              <Button kind="deemphasized" wide onClick={() => dispatch({ t: "reset" })}>
                Reset
              </Button>
            </div>
          );
        return <SystemLine>{`Waiting for ${nameOf(up)} · ${mode}`}</SystemLine>;
      }
      if (state.phase === "playing") {
        if (drawing) return <SystemLine>Spinning</SystemLine>;
        if (state.performer === me)
          return (
            <div>
              <h2>{secret}</h2>
              <small>{`Only you can see this · keep ${verb}`}</small>
            </div>
          );
        if (myTeam === state.side)
          return (
            <div style={{ display: "grid", gap: 6 }}>
              <small>{`${state.performer ? nameOf(state.performer) : "Someone"} is ${verb}`}</small>
              <div style={{ display: "flex", gap: 8 }}>
                <Button kind="primary" wide onClick={() => dispatch({ t: "score", got: true })}>
                  Got it
                </Button>
                <Button kind="secondary" wide onClick={() => dispatch({ t: "score", got: false })}>
                  Missed
                </Button>
              </div>
            </div>
          );
        return <SystemLine>{`${C.teamNames[state.side]} is guessing`}</SystemLine>;
      }
      return (
        <div style={{ display: "grid", gap: 6 }}>
          {last ? (
            <div>
              <h2>{last.word}</h2>
              <small>{last.got ? `${C.teamNames[last.side === "b" ? "b" : "a"]} got it · 1 point` : `${C.teamNames[last.side === "b" ? "b" : "a"]} missed`}</small>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <Button kind="primary" wide onClick={() => dispatch({ t: "next" })}>
              Next round
            </Button>
            <Button kind="deemphasized" onClick={() => dispatch({ t: "reset" })}>
              Reset
            </Button>
          </div>
        </div>
      );
    };

    return (
      <div>
        <CardHeader
          title={setup ? C.title : `Round ${state.round + 1} · ${mode}`}
          subtitle={setup ? `${members.length} here` : `${C.teamNames.a} ${state.score.a} · ${C.teamNames.b} ${state.score.b}`}
        />
        {confirmed.phase === "setup" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: theme.radius.card, background: theme.color.input, minHeight: 64 }}>
            <Facepile users={members} max={6} size={28} />
            <small style={{ flex: 1, minWidth: 0 }}>Split into two teams to start</small>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            {teamBox("a")}
            {teamBox("b")}
          </div>
        )}
        <div style={{ marginTop: 8, minHeight: 72, display: "flex", flexDirection: "column", justifyContent: "center" }}>{action()}</div>
        {state.words.length < MAX_WORDS ? (
          <form
            style={{ display: "flex", gap: 8, marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              sendWord();
            }}
          >
            <input
              value={local.draft}
              maxLength={MAX_LABEL}
              placeholder={`Add a word · ${state.words.length} of ${MAX_WORDS}`}
              aria-label="Add a word"
              onInput={(e) => setLocal({ draft: e.currentTarget.value })}
            />
            <Button kind="deemphasized" disabled={!canAdd} onClick={sendWord}>
              Add
            </Button>
          </form>
        ) : (
          <small>{`${state.words.length} words in the bank`}</small>
        )}
        {local.toast ? <Toast key={local.toast}>Word added</Toast> : null}
      </div>
    );
  },
});
