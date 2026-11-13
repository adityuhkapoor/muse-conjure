import { defineApp, Button, CardHeader, Canvas, OptionRow } from "@muse/app";

const CHAT = {
  title: "Saturday movie bracket",
  movies: [
    "Interstellar",
    "Shrek 2",
    "Everything Everywhere All at Once",
    "Mean Girls",
    "Coco",
    "The Dark Knight",
    "Hot Fuzz",
    "Ratatouille",
  ],
  context: "Saturday night movies · pizza from Mama's at 8",
};

type Match = {
  id: string;
  round: number;
  a: number | null;
  b: number | null;
  votesA: string[];
  votesB: string[];
  winner: number | null;
};
type State = { movies: string[]; matches: Match[]; champion: number | null; at: number };
type Action =
  | { t: "vote"; match: string; side: "a" | "b" }
  | { t: "decide"; match: string }
  | { t: "reset" };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
const roundOf = (i: number) => (i < 4 ? 0 : i < 6 ? 1 : 2);

/** Label at the largest size that fits (estimated width), down to min, then cut with an ellipsis. */
const fitLabel = (label: string, maxWidth: number, size: number, min: number, weight: number) => {
  const font = (s: number) => `${weight} ${s}px sans-serif`;
  for (let s = size; s >= min; s--) {
    if (label.length * s * 0.56 <= maxWidth) return { text: label, size: s, font: font(s) };
  }
  const n = Math.max(1, Math.floor(maxWidth / (min * 0.56)) - 1);
  return { text: label.slice(0, n) + "…", size: min, font: font(min) };
};

/** Where the winner of match i goes: even index feeds a, odd feeds b. */
const feed = (i: number): { to: number; slot: "a" | "b" } | null =>
  i >= 6 ? null : { to: i < 4 ? 4 + Math.floor(i / 2) : 6, slot: i % 2 === 0 ? "a" : "b" };

const fresh = (): State => ({
  movies: [...CHAT.movies],
  matches: Array.from({ length: 7 }, (_, i): Match => ({
    id: `m${i}`,
    round: roundOf(i),
    a: i < 4 ? 2 * i : null,
    b: i < 4 ? 2 * i + 1 : null,
    votesA: [],
    votesB: [],
    winner: null,
  })),
  champion: null,
  at: 0,
});

const openMatch = (s: State): number => s.matches.findIndex((m) => m.winner === null && m.a !== null && m.b !== null);

function vote(s: State, user: string, id: unknown, side: unknown): State {
  if (typeof id !== "string" || (side !== "a" && side !== "b")) return s;
  const m = s.matches.find((x) => x.id === id);
  if (!m || m.winner !== null || m.a === null || m.b === null) return s;
  const had = (side === "a" ? m.votesA : m.votesB).includes(user);
  const next: Match = {
    ...m,
    votesA: side === "a" ? (had ? m.votesA.filter((u) => u !== user) : [...m.votesA, user]) : m.votesA.filter((u) => u !== user),
    votesB: side === "b" ? (had ? m.votesB.filter((u) => u !== user) : [...m.votesB, user]) : m.votesB.filter((u) => u !== user),
  };
  return { ...s, matches: s.matches.map((x) => (x.id === id ? next : x)) };
}

function decide(s: State, id: unknown, time: number): State {
  if (typeof id !== "string") return s;
  const i = s.matches.findIndex((x) => x.id === id);
  if (i < 0) return s;
  const m = s.matches[i]!;
  if (m.winner !== null || m.a === null || m.b === null || m.votesA.length === m.votesB.length) return s;
  const win = m.votesA.length > m.votesB.length ? m.a : m.b;
  const nx = feed(i);
  const matches = s.matches.map((x, j): Match => {
    if (j === i) return { ...x, winner: win };
    if (nx && j === nx.to) return nx.slot === "a" ? { ...x, a: win } : { ...x, b: win };
    return x;
  });
  return { ...s, matches, champion: i === 6 ? win : s.champion, at: time };
}

export default defineApp<State, Action, Local>({
  name: "Movie bracket",

  summary: (s) => {
    if (s.champion !== null) return `${CHAT.title}: ${s.movies[s.champion] ?? ""} wins.`;
    const i = openMatch(s);
    const m = s.matches[i];
    const n = m ? m.votesA.length + m.votesB.length : 0;
    const done = s.matches.filter((x) => x.winner !== null).length;
    return `${CHAT.title}: ${done} of 7 matches decided, ${n} voted in the open one.`;
  },

  init: () => fresh(),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "vote") return vote(state, meta.user, action.match, action.side);
    if (action.t === "decide") return decide(state, action.match, meta.time);
    if (action.t === "reset") return same(state, fresh()) ? state : fresh();
    return state;
  },

  // Someone left: their votes in open matches go. Decided matches keep their frozen record.
  onMembers: (state, ctx) => {
    const bad = (m: Match) => m.winner === null && [...m.votesA, ...m.votesB].some((u) => !inChat(ctx, u));
    if (!state.matches.some(bad)) return state;
    return {
      ...state,
      matches: state.matches.map((m) =>
        bad(m) ? { ...m, votesA: m.votesA.filter((u) => inChat(ctx, u)), votesB: m.votesB.filter((u) => inChat(ctx, u)) } : m,
      ),
    };
  },

  invariants: {
    "there are the 8 movies from the chat and 7 matches with fixed ids and rounds": (s) =>
      same(s.movies, CHAT.movies) && s.matches.length === 7 && s.matches.every((m, i) => m.id === `m${i}` && m.round === roundOf(i)),
    "no one is on both sides of a match or twice on one side": (s) =>
      s.matches.every((m) => new Set([...m.votesA, ...m.votesB]).size === m.votesA.length + m.votesB.length),
    "voters in open matches are in the chat": (s, ctx) =>
      s.matches.every((m) => m.winner !== null || [...m.votesA, ...m.votesB].every((u) => inChat(ctx, u))),
    "a decided match was won by the side with strictly more votes": (s) =>
      s.matches.every(
        (m) =>
          m.winner === null ||
          (m.a !== null && m.b !== null && ((m.winner === m.a && m.votesA.length > m.votesB.length) || (m.winner === m.b && m.votesB.length > m.votesA.length))),
      ),
    "each later slot holds the winner of its feeder match, first round is seeded in order": (s) =>
      s.matches.every((m, i) => i >= 4 || (m.a === 2 * i && m.b === 2 * i + 1)) &&
      [0, 1, 2, 3, 4, 5].every((i) => {
        const f = feed(i)!;
        const t = s.matches[f.to]!;
        return (f.slot === "a" ? t.a : t.b) === s.matches[i]!.winner;
      }),
    "a match with an empty slot has no votes and no winner": (s) =>
      s.matches.every((m) => (m.a !== null && m.b !== null) || (m.votesA.length === 0 && m.votesB.length === 0 && m.winner === null)),
    "the champion is the winner of the final": (s) => s.champion === s.matches[6]!.winner,
  },

  transitions: {
    "a vote changes only the actor's place in that open match": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const i = p.matches.findIndex((x) => x.id === a.match);
      if (i < 0) return false;
      const b = p.matches[i]!;
      const f = n.matches[i]!;
      if (b.winner !== null || b.a === null || b.b === null) return false;
      const rest = (x: Match) => `${x.votesA.filter((u) => u !== m.user)}|${x.votesB.filter((u) => u !== m.user)}`;
      const side = (x: Match) => (x.votesA.includes(m.user) ? "a" : x.votesB.includes(m.user) ? "b" : "");
      return (
        rest(b) === rest(f) &&
        side(f) === (side(b) === a.side ? "" : a.side) &&
        f.a === b.a &&
        f.b === b.b &&
        f.winner === null &&
        n.champion === p.champion &&
        n.at === p.at &&
        p.matches.every((x, j) => j === i || same(x, n.matches[j]))
      );
    },
    "a decide gives the win to the leading side, fills one slot in the next match and changes nothing else": (p, n, a, m) => {
      if (a.t !== "decide" || p === n) return true;
      const i = p.matches.findIndex((x) => x.id === a.match);
      if (i < 0) return false;
      const b = p.matches[i]!;
      const f = n.matches[i]!;
      if (b.a === null || b.b === null || b.winner !== null || b.votesA.length === b.votesB.length) return false;
      const win = b.votesA.length > b.votesB.length ? b.a : b.b;
      if (f.winner !== win || !same(f.votesA, b.votesA) || !same(f.votesB, b.votesB) || f.a !== b.a || f.b !== b.b) return false;
      if (n.at !== m.time || !same(n.movies, p.movies)) return false;
      const nx = feed(i);
      if (!nx) return n.champion === win && p.champion === null && p.matches.every((x, j) => j === i || same(x, n.matches[j]));
      if (n.champion !== p.champion) return false;
      const pt = p.matches[nx.to]!;
      const nt = n.matches[nx.to]!;
      const own = nx.slot === "a" ? [pt.a, nt.a] : [pt.b, nt.b];
      const other = nx.slot === "a" ? [pt.b, nt.b] : [pt.a, nt.a];
      return (
        own[0] === null &&
        own[1] === win &&
        other[0] === other[1] &&
        same(pt.votesA, nt.votesA) &&
        same(pt.votesB, nt.votesB) &&
        pt.winner === nt.winner &&
        p.matches.every((x, j) => j === i || j === nx.to || same(x, n.matches[j]))
      );
    },
    "a decide only happens when the vote counts differ": (p, n, a) => {
      if (a.t !== "decide" || p === n) return true;
      const b = p.matches.find((x) => x.id === a.match);
      return !!b && b.votesA.length !== b.votesB.length;
    },
    "decided matches never change their winner or votes except by reset": (p, n, a) =>
      a.t === "reset" ||
      p.matches.every((x, i) => x.winner === null || (n.matches[i]!.winner === x.winner && same(n.matches[i]!.votesA, x.votesA) && same(n.matches[i]!.votesB, x.votesB))),
    "a reset returns the whole bracket to its start": (p, n, a) => a.t !== "reset" || p === n || same(n, fresh()),
    "only people in the chat change anything, and the movie list never changes": (p, n, a, m, ctx) =>
      same(p.movies, n.movies) && (p === n || inChat(ctx, m.user)),
  },

  arbitrary: (s, _user, r) => {
    const ci = openMatch(s);
    const any = r.pick(s.matches);
    const side = r.next() < 0.5 ? ("a" as const) : ("b" as const);
    if (ci < 0) return r.next() < 0.7 ? { t: "reset" } : { t: "vote", match: any.id, side };
    const cur = s.matches[ci]!;
    const x = r.next();
    if (x < 0.5) return { t: "vote", match: cur.id, side };
    if (x < 0.8) return { t: "decide", match: cur.id };
    if (x < 0.9) return { t: "vote", match: any.id, side };
    if (x < 0.95) return { t: "decide", match: any.id };
    return { t: "reset" };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const s = state;
    const ci = openMatch(s);
    const cur = ci >= 0 ? s.matches[ci]! : null;
    const champ = s.champion;
    const name = (i: number | null) => (i === null ? "" : (s.movies[i] ?? ""));
    const decidedCount = s.matches.filter((m) => m.winner !== null).length;
    const voted = cur ? cur.votesA.length + cur.votesB.length : 0;
    const stage = ci < 0 ? "" : ci < 4 ? `Match ${ci + 1} of 4` : ci < 6 ? `Semifinal ${ci - 3} of 2` : "Final";
    const subtitle = champ !== null ? "Bracket done" : cur ? `${stage} · ${voted} of ${members.length} voted` : "Waiting";

    let status = "";
    let canDecide = false;
    if (cur) {
      const na = cur.votesA.length;
      const nb = cur.votesB.length;
      canDecide = na !== nb;
      status = na + nb === 0 ? "Vote for one movie" : na === nb ? "Tied · one more vote breaks it" : `${name(na > nb ? cur.a : cur.b)} leads ${Math.max(na, nb)} to ${Math.min(na, nb)}`;
    }
    const fin = s.matches[6]!;

    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={subtitle} />
        <div style={{ marginTop: 4 }}>
          <Canvas
            height={152}
            label={`Bracket of 8 movies, ${decidedCount} of 7 matches decided${champ !== null ? `, ${name(champ)} won` : ""}`}
            draw={(g, { width, height, theme }) => {
              const gap = 14;
              const usable = width - 2 * gap;
              const w0 = Math.floor(usable * 0.4);
              const w1 = Math.floor(usable * 0.3);
              const x1 = w0 + gap;
              const x2 = x1 + w1 + gap;
              const w2 = width - x2;
              const rowH = height / 8;
              const slotH = rowH - 3;
              const pos = (i: number, side: number) => {
                if (i < 4) return { x: 0, w: w0, cy: (2 * i + side + 0.5) * rowH };
                if (i < 6) return { x: x1, w: w1, cy: (2 * ((i - 4) * 2 + side) + 1) * rowH };
                return { x: x2, w: w2, cy: (4 * side + 2) * rowH };
              };
              g.clearRect(0, 0, width, height);
              g.strokeStyle = theme.color.divider;
              g.lineWidth = 1;
              g.setLineDash([]);
              g.beginPath();
              for (let k = 0; k < 4; k++) {
                const ya = (2 * k + 0.5) * rowH;
                const yb = (2 * k + 1.5) * rowH;
                const ym = (2 * k + 1) * rowH;
                const xm = w0 + gap / 2;
                g.moveTo(w0, ya);
                g.lineTo(xm, ya);
                g.lineTo(xm, yb);
                g.lineTo(w0, yb);
                g.moveTo(xm, ym);
                g.lineTo(x1, ym);
              }
              for (let k = 0; k < 2; k++) {
                const ya = (4 * k + 1) * rowH;
                const yb = (4 * k + 3) * rowH;
                const ym = (4 * k + 2) * rowH;
                const xr = x1 + w1;
                const xm = xr + gap / 2;
                g.moveTo(xr, ya);
                g.lineTo(xm, ya);
                g.lineTo(xm, yb);
                g.lineTo(xr, yb);
                g.moveTo(xm, ym);
                g.lineTo(x2, ym);
              }
              g.stroke();
              g.textBaseline = "middle";
              g.textAlign = "left";
              for (let i = 0; i < 7; i++) {
                const m = s.matches[i]!;
                for (let side = 0; side < 2; side++) {
                  const v = side === 0 ? m.a : m.b;
                  const p = pos(i, side);
                  const top = p.cy - slotH / 2;
                  if (v === null) {
                    g.strokeStyle = theme.color.disabledText;
                    g.lineWidth = 1;
                    g.setLineDash([3, 3]);
                    g.strokeRect(p.x + 0.5, top + 0.5, p.w - 1, slotH - 1);
                    g.setLineDash([]);
                    continue;
                  }
                  const won = m.winner === v;
                  const lost = m.winner !== null && !won;
                  g.fillStyle = won ? theme.color.primary : theme.color.input;
                  g.fillRect(p.x, top, p.w, slotH);
                  if (i === ci) {
                    g.strokeStyle = theme.color.primary;
                    g.lineWidth = 2;
                    g.setLineDash([]);
                    g.strokeRect(p.x + 1, top + 1, p.w - 2, slotH - 2);
                  }
                  const f = fitLabel(name(v), p.w - 10, 11, 10, 600);
                  g.font = f.font;
                  g.fillStyle = won ? theme.color.onPrimary : lost ? theme.color.secondaryText : theme.color.text;
                  g.fillText(f.text, p.x + 5, p.cy + 0.5);
                }
              }
            }}
          />
        </div>

        {champ !== null ? (
          <div style={{ marginTop: 8 }}>
            <div>
              <h2>{name(champ)}</h2>
              <small>{`Won the final ${Math.max(fin.votesA.length, fin.votesB.length)} to ${Math.min(fin.votesA.length, fin.votesB.length)} · ${CHAT.context}`}</small>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <Button kind="deemphasized" onClick={() => dispatch({ t: "reset" })}>
                Reset
              </Button>
            </div>
          </div>
        ) : cur ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "grid", gap: 2 }}>
              <OptionRow
                label={name(cur.a)}
                count={cur.votesA.length}
                total={Math.max(1, voted)}
                voters={cur.votesA}
                selected={cur.votesA.includes(me)}
                onClick={() => dispatch({ t: "vote", match: cur.id, side: "a" })}
              />
              <OptionRow
                label={name(cur.b)}
                count={cur.votesB.length}
                total={Math.max(1, voted)}
                voters={cur.votesB}
                selected={cur.votesB.includes(me)}
                onClick={() => dispatch({ t: "vote", match: cur.id, side: "b" })}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <small style={{ flex: 1, minWidth: 0 }}>{status}</small>
              <Button kind="primary" disabled={!canDecide} onClick={() => dispatch({ t: "decide", match: cur.id })}>
                Decide
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
});
