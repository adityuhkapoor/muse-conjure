import { defineApp, CardHeader } from "@muse/app";

// Dinner bracket: 8 places, 7 head-to-head matches. Every person in the chat votes in each match.
// A match closes when everyone in the chat has voted. Ties go to the lower seed.

const CHAT = {
  title: "Where should we eat?",
  entries: [
    { label: "Chipotle", note: "" },
    { label: "Pho 79 on 5th", note: "" },
    { label: "Joe's Pizza", note: "By the slice, $1.50 on Thursdays" },
    { label: "Haidilao", note: "Hot pot, about $35 each" },
    { label: "Wings at BDubs", note: "Tuesday boneless deal" },
    { label: "El Pollo Tacos", note: "The truck outside the library" },
    { label: "Lucky House", note: "Dumplings" },
    { label: "Dining hall", note: "Seed 8" },
  ],
};

type Entry = { id: string; label: string; note: string };
type Match = { id: string; round: number; a: string | null; b: string | null; votes: Record<string, string>; winner: string | null };
type State = { entries: Entry[]; matches: Match[]; champion: string | null };
type Action = { t: "vote"; match: string; pick: string };
type Local = Record<string, never>;

const NEXT: Record<string, { id: string; slot: "a" | "b" }> = {
  m0: { id: "m4", slot: "a" },
  m1: { id: "m4", slot: "b" },
  m2: { id: "m5", slot: "a" },
  m3: { id: "m5", slot: "b" },
  m4: { id: "m6", slot: "a" },
  m5: { id: "m6", slot: "b" },
};
const FEED: Record<string, [string, string]> = { m4: ["m0", "m1"], m5: ["m2", "m3"], m6: ["m4", "m5"] };
const ROUND0: [string, string][] = [["s0", "s1"], ["s2", "s3"], ["s4", "s5"], ["s6", "s7"]];
const STAGE = ["Round 1", "Semifinals", "Final"];

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const seed = (id: string) => Number(id.slice(1));
const countFor = (m: Match, id: string | null) => Object.keys(m.votes).filter((k) => m.votes[k] === id).length;
const isOpen = (m: Match) => m.winner === null && m.a !== null && m.b !== null;

function decide(m: Match): string {
  const a = m.a ?? "";
  const b = m.b ?? "";
  const va = countFor(m, m.a);
  const vb = countFor(m, m.b);
  if (va > vb) return a;
  if (vb > va) return b;
  return seed(a) <= seed(b) ? a : b;
}

function settle(s: State, members: { id: string }[]): State {
  if (members.length === 0) return s;
  let matches = s.matches;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    if (!isOpen(m)) continue;
    if (!members.every((x) => m.votes[x.id] !== undefined)) continue;
    const w = decide(m);
    const nx = NEXT[m.id];
    matches = matches.map((x) => {
      if (x.id === m.id) return { ...x, winner: w };
      if (nx && x.id === nx.id) return nx.slot === "a" ? { ...x, a: w } : { ...x, b: w };
      return x;
    });
  }
  if (matches === s.matches) return s;
  return { ...s, matches, champion: matches[6]!.winner };
}

function keepVotes(votes: Record<string, string>, ctx: { members: { id: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(votes)) if (inChat(ctx, k)) out[k] = votes[k]!;
  return out;
}

export default defineApp<State, Action, Local>({
  name: "Dinner bracket",
  summary: (s) => {
    const label = (id: string | null) => s.entries.find((e) => e.id === id)?.label ?? "";
    if (s.champion !== null) return `${CHAT.title} ${label(s.champion)} won the bracket.`;
    const open = s.matches.filter(isOpen);
    const rd = open.length ? Math.min(...open.map((m) => m.round)) : 0;
    return `${CHAT.title} ${STAGE[rd] ?? "Bracket"}, ${open.length} ${open.length === 1 ? "match" : "matches"} open.`;
  },

  init: () => {
    const entries: Entry[] = CHAT.entries.slice(0, 8).map((e, i) => ({ id: `s${i}`, label: e.label.slice(0, 40), note: e.note.slice(0, 60) }));
    const matches: Match[] = [
      ...ROUND0.map(([a, b], i): Match => ({ id: `m${i}`, round: 0, a, b, votes: {}, winner: null })),
      { id: "m4", round: 1, a: null, b: null, votes: {}, winner: null },
      { id: "m5", round: 1, a: null, b: null, votes: {}, winner: null },
      { id: "m6", round: 2, a: null, b: null, votes: {}, winner: null },
    ];
    return { entries, matches, champion: null };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t !== "vote") return state;
    if (typeof action.match !== "string" || typeof action.pick !== "string") return state;
    const id = action.match;
    const pick = action.pick;
    const m = state.matches.find((x) => x.id === id);
    if (!m || !isOpen(m)) return state;
    if (pick !== m.a && pick !== m.b) return state;
    if (m.votes[meta.user] === pick) return state;
    const matches = state.matches.map((x) => (x.id === id ? { ...x, votes: { ...x.votes, [meta.user]: pick } } : x));
    return settle({ ...state, matches }, ctx.members);
  },

  // Someone left: their votes in open matches go, and a match may now have every vote it needs.
  onMembers: (state, ctx) => {
    const matches = state.matches.map((m) =>
      m.winner !== null || Object.keys(m.votes).every((k) => inChat(ctx, k)) ? m : { ...m, votes: keepVotes(m.votes, ctx) },
    );
    const next = settle({ ...state, matches }, ctx.members);
    return JSON.stringify(next) === JSON.stringify(state) ? state : next;
  },

  invariants: {
    "every vote is for a side of its own match, and only matches with two sides have votes": (s) =>
      s.matches.every((m) => (m.a !== null && m.b !== null ? Object.keys(m.votes).every((k) => m.votes[k] === m.a || m.votes[k] === m.b) : Object.keys(m.votes).length === 0)),
    "voters in open matches are in the chat": (s, ctx) => s.matches.every((m) => m.winner !== null || Object.keys(m.votes).every((k) => inChat(ctx, k))),
    "a winner has two sides and is the one with more votes, a tie going to the lower seed": (s) =>
      s.matches.every((m) => m.winner === null || (m.a !== null && m.b !== null && m.winner === decide(m))),
    "no open match has a vote from every member, since it would have closed": (s, ctx) =>
      ctx.members.length === 0 || s.matches.every((m) => !isOpen(m) || !ctx.members.every((u) => m.votes[u.id] !== undefined)),
    "later rounds hold exactly the winners of their feeder matches": (s) =>
      Object.keys(FEED).every((id) => {
        const m = s.matches.find((x) => x.id === id);
        const f0 = s.matches.find((x) => x.id === FEED[id]![0]);
        const f1 = s.matches.find((x) => x.id === FEED[id]![1]);
        return !!m && !!f0 && !!f1 && m.a === f0.winner && m.b === f1.winner;
      }),
    "the champion is the final's winner": (s) => s.champion === (s.matches[6]?.winner ?? null),
    "there are 7 matches and 8 entries, with unique ids and the seeded first round": (s) =>
      s.matches.length === 7 &&
      s.entries.length === 8 &&
      new Set(s.matches.map((m) => m.id)).size === 7 &&
      new Set(s.entries.map((e) => e.id)).size === 8 &&
      ROUND0.every(([a, b], i) => s.matches[i]!.a === a && s.matches[i]!.b === b),
  },

  transitions: {
    "a vote sets the actor's own vote in that match and changes no one else's": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const pm = p.matches.find((x) => x.id === a.match);
      const nm = n.matches.find((x) => x.id === a.match);
      if (!pm || !nm) return false;
      const others = (v: Record<string, string>) => Object.keys(v).filter((k) => k !== m.user).sort().map((k) => `${k}=${v[k]}`).join();
      return (
        pm.winner === null &&
        nm.votes[m.user] === a.pick &&
        others(pm.votes) === others(nm.votes) &&
        p.matches.every((x, i) => x.id === a.match || JSON.stringify(x.votes) === JSON.stringify(n.matches[i]!.votes))
      );
    },
    "a match closes only when every member has voted, for the side with more votes, and the winner moves on": (p, n, _a, _m, ctx) =>
      p === n ||
      n.matches.every((x, i) => {
        const o = p.matches[i]!;
        if (o.winner !== null || x.winner === null) return true;
        const nx = NEXT[x.id];
        const dest = nx ? n.matches.find((y) => y.id === nx.id) : undefined;
        return (
          ctx.members.every((u) => x.votes[u.id] !== undefined) &&
          x.winner === decide(x) &&
          (!nx || (dest !== undefined && (nx.slot === "a" ? dest.a : dest.b) === x.winner))
        );
      }),
    "a closed match never changes": (p, n) => p.matches.every((x, i) => x.winner === null || JSON.stringify(x) === JSON.stringify(n.matches[i])),
    "only people in the chat change the bracket": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "entries and match ids never change": (p, n) =>
      JSON.stringify(p.entries) === JSON.stringify(n.entries) && p.matches.map((x) => x.id).join() === n.matches.map((x) => x.id).join(),
  },

  arbitrary: (s, _user, r) => {
    const open = s.matches.filter(isOpen);
    if (!open.length) return null;
    const m = r.pick(open);
    if (r.next() < 0.1) return { t: "vote", match: m.id, pick: "s9" };
    return { t: "vote", match: m.id, pick: (r.next() < 0.5 ? m.a : m.b) ?? "" };
  },

  local: {},

  view: ({ state, me, dispatch, theme }) => {
    const entry = (id: string | null) => state.entries.find((e) => e.id === id);
    const open = state.matches.filter(isOpen);
    const champ = entry(state.champion);
    if (champ) {
      return (
        <div>
          <CardHeader title={CHAT.title} subtitle="Bracket done" />
          <div style={{ padding: "16px 0", textAlign: "center" }}>
            <h2>{champ.label}</h2>
            {champ.note ? <small>{champ.note}</small> : null}
            <div>
              <small>Won the bracket</small>
            </div>
          </div>
        </div>
      );
    }
    const undecided = state.matches.filter((m) => m.winner === null);
    const rd = undecided.length ? Math.min(...undecided.map((m) => m.round)) : 2;
    const inRound = state.matches.filter((m) => m.round === rd);
    const decided = inRound.filter((m) => m.winner !== null).length;
    const myLeft = open.filter((m) => m.votes[me] === undefined).length;
    const through = state.matches.filter((m) => m.winner !== null).map((m) => entry(m.winner)?.label ?? "");
    const showNotes = open.length <= 2;
    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={`${STAGE[rd] ?? "Round"} · ${decided} of ${inRound.length} decided`} />
        <div style={{ display: "grid", gap: 6 }}>
          {open.map((m) => (
            <div key={m.id} style={{ display: "flex", gap: 8 }}>
              {[m.a, m.b].map((id) => {
                const e = entry(id);
                const n = countFor(m, id);
                return (
                  <button
                    key={id ?? ""}
                    onClick={() => dispatch({ t: "vote", match: m.id, pick: id ?? "" })}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: 48,
                      padding: "4px 8px",
                      borderRadius: theme.radius.button,
                      textAlign: "left",
                      background: m.votes[me] === id ? theme.color.selected : theme.color.input,
                      color: theme.color.text,
                      overflowWrap: "anywhere",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{e?.label ?? ""}</div>
                    {showNotes && e?.note ? <small style={{ display: "block" }}>{e.note}</small> : null}
                    <small>{n === 1 ? "1 vote" : `${n} votes`}</small>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {through.length ? (
          <div style={{ marginTop: 8 }}>
            <small>{`Through: ${through.join(", ")}`}</small>
          </div>
        ) : null}
        <div style={{ marginTop: 8 }}>
          <small>{myLeft > 0 ? `Your vote is needed in ${myLeft} ${myLeft === 1 ? "match" : "matches"}` : "Waiting on the others"}</small>
        </div>
      </div>
    );
  },
});
