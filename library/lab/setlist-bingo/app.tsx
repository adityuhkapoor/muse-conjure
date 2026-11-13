import { defineApp, Avatar, Burst, CardHeader, Chip, Toast, haptic, running, userColor } from "@muse/app";

// Setlist bingo: friends at a show share one 5x5 card of likely songs and show moments. Tapping a
// square marks it for you (and calls it played if nobody had); friends' marks show as dots, a small
// board shows who is closest, and the first full line is bingo.

type Params = {
  title: string;
  /** artist · venue · when */
  sub: string;
  /** 24 short labels, row by row, the center skipped */
  cells: string[];
  /** indices 0-23 into cells already played, in order */
  played: number[];
  /** what each friend has marked so far (indices 0-23, played ones only) */
  marks: { name: string; cells: number[] }[];
};

// @params
const P: Params = {
  title: "Setlist bingo",
  sub: "Khruangbin · Greek · live",
  cells: [
    "Texas Sun", "Pelota", "August 10", "Two Fish", "Crowd sings along",
    "White Gloves", "Maria También", "Laura's hair flip", "So We Won't Forget", "Shida",
    "Time (You and I)", "People Everywhere", "Lady and Man", "Evan Finds the Third Room",
    "Dern Kala", "A 10-min jam", "Friday Morning", "Rules", "First Class",
    "Mr. White", "Encore", "A Hymn", "Father Bird", "Two Fish (reprise)",
  ],
  played: [2, 7, 10, 11, 12, 13],
  marks: [
    { name: "Maya", cells: [2, 7, 10, 11, 12] },
    { name: "Theo", cells: [7, 10, 11, 12] },
    { name: "Noa", cells: [2, 11, 12] },
    { name: "Dev", cells: [2, 7] },
    { name: "Jonah", cells: [10] },
  ],
};
// @end params

type Bingo = { user: string; at: number; line: number };
type State = {
  title: string;
  sub: string;
  cells: string[];
  played: number[];
  playedAt: number;
  marks: Record<string, number[]>;
  bingos: Bingo[];
};
type Action = { t: "mark"; cell: number } | { t: "unmark"; cell: number };

const LINES: number[][] = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];
const FREE = 12;
const FALLBACK = ["Opener", "Encore", "Crowd sings along", "A new song", "Lights go out", "A cover", "Long jam", "Slow one", "Phones up", "Guest on stage", "Crowd surfer", "Band intro"];

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const isCell = (c: unknown): c is number => typeof c === "number" && Number.isInteger(c) && c >= 0 && c <= 24 && c !== FREE;
const toCell = (i: number) => (i < 12 ? i : i + 1);
const label = (v: unknown, i: number) => {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  return t || `${FALLBACK[i % 12]}${i >= 12 ? " 2" : ""}`;
};
/** Index of the first line fully covered by these marks (the Free square counts), or -1. */
const lineOf = (marks: number[]) => LINES.findIndex((l) => l.every((c) => c === FREE || marks.includes(c)));
const toGo = (marks: number[]) => Math.min(...LINES.map((l) => l.filter((c) => c !== FREE && !marks.includes(c)).length));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const othersMarks = (s: State, user: string) => JSON.stringify(Object.entries(s.marks).filter(([k]) => k !== user));
const distinct = (xs: number[]) => new Set(xs).size === xs.length;

/** Rank: people with a bingo first (in bingo order), then fewest to go, then chat order. */
function ranking(s: State, ids: string[]): string[] {
  const won = s.bingos.map((b) => b.user).filter((u) => ids.includes(u));
  const rest = ids.filter((u) => !won.includes(u)).map((u, i) => ({ u, i, g: toGo(s.marks[u] ?? []) }));
  rest.sort((a, b) => a.g - b.g || a.i - b.i);
  return [...won, ...rest.map((x) => x.u)];
}

export default defineApp<State, Action>({
  name: "Setlist bingo",

  summary: (s, ctx) => {
    if (!s.played.length) return `${s.title}: waiting for the first song`;
    const name = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? "Someone";
    const first = s.bingos[0];
    if (first) return `${s.title}: ${name(first.user)} has bingo · ${s.played.length} played`;
    const best = ranking(s, ctx.members.map((m) => m.id))[0];
    return best ? `${s.title}: ${s.played.length} played · ${name(best)} is ${toGo(s.marks[best] ?? [])} to go` : `${s.title}: ${s.played.length} played`;
  },

  init: (ctx) => {
    const cells = Array.from({ length: 24 }, (_, i) => label(P.cells?.[i], i));
    cells.splice(FREE, 0, "Free");
    const played: number[] = [];
    for (const i of Array.isArray(P.played) ? P.played : []) {
      if (typeof i === "number" && Number.isInteger(i) && i >= 0 && i <= 23 && !played.includes(toCell(i))) played.push(toCell(i));
    }
    const marks: Record<string, number[]> = {};
    const bingos: Bingo[] = [];
    for (const m of ctx.members) {
      const hit = (Array.isArray(P.marks) ? P.marks : []).find((x) => x && (x.name === m.id || (typeof x.name === "string" && x.name.toLowerCase() === m.name.toLowerCase())));
      const mine: number[] = [];
      for (const i of Array.isArray(hit?.cells) ? hit!.cells : []) {
        if (typeof i === "number" && Number.isInteger(i) && i >= 0 && i <= 23 && played.includes(toCell(i)) && !mine.includes(toCell(i))) mine.push(toCell(i));
      }
      marks[m.id] = mine;
      const line = lineOf(mine);
      if (line >= 0) bingos.push({ user: m.id, at: 0, line });
    }
    return { title: String(P.title ?? "").trim().slice(0, 60) || "Setlist bingo", sub: String(P.sub ?? "").trim().slice(0, 80), cells, played, playedAt: 0, marks, bingos };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || !isCell(a.cell)) return s;
    const mine = s.marks[m.user] ?? [];
    if (a.t === "mark") {
      if (mine.includes(a.cell)) return s;
      const callIt = !s.played.includes(a.cell);
      const next = [...mine, a.cell];
      const line = lineOf(next);
      return {
        ...s,
        played: callIt ? [...s.played, a.cell] : s.played,
        playedAt: callIt ? m.time : s.playedAt,
        marks: { ...s.marks, [m.user]: next },
        bingos: line >= 0 && !s.bingos.some((b) => b.user === m.user) ? [...s.bingos, { user: m.user, at: m.time, line }] : s.bingos,
      };
    }
    if (a.t === "unmark") {
      const won = s.bingos.find((b) => b.user === m.user);
      if (!mine.includes(a.cell) || (won && LINES[won.line]!.includes(a.cell))) return s;
      return { ...s, marks: { ...s.marks, [m.user]: mine.filter((c) => c !== a.cell) } };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const marks: Record<string, number[]> = {};
    for (const m of ctx.members) marks[m.id] = s.marks[m.id] ?? [];
    return { ...s, marks, bingos: s.bingos.filter((b) => inChat(ctx, b.user)) };
  },

  invariants: {
    "the card has 25 cells with Free in the middle": (s) => s.cells.length === 25 && s.cells[FREE] === "Free",
    "played cells are real, distinct, never Free": (s) => s.played.every(isCell) && distinct(s.played),
    "people mark only played cells, once each": (s) => Object.values(s.marks).every((l) => l.every((c) => isCell(c) && s.played.includes(c)) && distinct(l)),
    "marks belong to people in the chat": (s, ctx) => Object.keys(s.marks).every((id) => inChat(ctx, id)),
    "every bingo is a full line": (s) => s.bingos.every((b) => LINES[b.line]?.every((c) => c === FREE || (s.marks[b.user] ?? []).includes(c))),
    "one bingo per person": (s) => new Set(s.bingos.map((b) => b.user)).size === s.bingos.length,
    "no full line goes unnoticed": (s, ctx) => ctx.members.every((x) => lineOf(s.marks[x.id] ?? []) < 0 || s.bingos.some((b) => b.user === x.id)),
  },

  transitions: {
    "marking adds the cell to the actor only": (p, n, a, m) =>
      a.t !== "mark" || p === n || (same(n.marks[m.user], [...(p.marks[m.user] ?? []), a.cell]) && othersMarks(p, m.user) === othersMarks(n, m.user)),
    "marking an unplayed cell calls it": (p, n, a, m) =>
      a.t !== "mark" || p === n || (p.played.includes(a.cell) ? same(p.played, n.played) && p.playedAt === n.playedAt : same(n.played, [...p.played, a.cell]) && n.playedAt === m.time),
    "unmarking removes only that cell, never from a bingo line": (p, n, a, m) => {
      if (a.t !== "unmark" || p === n) return true;
      const won = p.bingos.find((b) => b.user === m.user);
      return same(n.marks[m.user], (p.marks[m.user] ?? []).filter((c) => c !== a.cell)) && !(won && LINES[won.line]!.includes(a.cell)) && same(p.played, n.played) && othersMarks(p, m.user) === othersMarks(n, m.user);
    },
    "a bingo is recorded the moment it happens": (p, n, a, m) => {
      if (a.t !== "mark" || p === n) return true;
      const gained = lineOf(n.marks[m.user] ?? []) >= 0 && !p.bingos.some((b) => b.user === m.user) ? 1 : 0;
      return n.bingos.length === p.bingos.length + gained && (!gained || (n.bingos.at(-1)!.user === m.user && n.bingos.at(-1)!.at === m.time));
    },
    "bingos are never taken back": (p, n) => same(p.bingos, n.bingos.slice(0, p.bingos.length)),
    "only people in the chat mark": (p, n, _a, m, ctx) => same(p, n) || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const mine = s.marks[user] ?? [];
    const k = r.next();
    const won = s.bingos.find((b) => b.user === user);
    const free = mine.filter((c) => !won || !LINES[won.line]!.includes(c));
    if (k < 0.12 && free.length) return { t: "unmark", cell: r.pick(free) };
    const playedNotMine = s.played.filter((c) => !mine.includes(c));
    if (k < 0.6 && playedNotMine.length) return { t: "mark", cell: r.pick(playedNotMine) };
    const open = Array.from({ length: 25 }, (_, c) => c).filter((c) => c !== FREE && !mine.includes(c));
    return open.length ? { t: "mark", cell: r.pick(open) } : free.length ? { t: "unmark", cell: r.pick(free) } : null;
  },

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const c = theme.color;
    const W = theme.width - 24;
    const mine = state.marks[me] ?? [];
    const ids = members.map((m) => m.id);
    const nameOf = (id: string) => (id === me ? "you" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const nowPlaying = state.played.length ? state.cells[state.played[state.played.length - 1]!] : null;
    const lastPlayed = state.played.length ? state.played[state.played.length - 1]! : -1;

    // My line turns primary cell by cell once the server has confirmed it.
    const myBingo = confirmed.bingos.find((b) => b.user === me);
    const reveal = myBingo ? running(myBingo.at, 900) : null;
    const inLine = (cell: number) => {
      if (!myBingo) return false;
      const j = LINES[myBingo.line]!.indexOf(cell);
      return j >= 0 && (reveal === null || reveal >= j * 120);
    };

    const rank = ranking(state, ids);
    const slots = W < 340 ? 3 : 4;
    let shown = rank.slice(0, slots);
    if (ids.includes(me) && !shown.includes(me)) shown = [...shown.slice(0, slots - 1), me];

    const latest = confirmed.bingos.at(-1);
    const burstOn = myBingo ? running(myBingo.at, 2400) !== null : false;
    const toastOn = latest ? running(latest.at, 2400) !== null : false;
    const toastText = (() => {
      if (!latest) return "";
      const place = confirmed.bingos.findIndex((b) => b === latest) + 1;
      if (place === 1) return latest.user === me ? "Bingo · you called it first" : `Bingo · ${nameOf(latest.user)} called it first`;
      return latest.user === me ? `Bingo · you're #${place}` : `Bingo · ${nameOf(latest.user)} is #${place}`;
    })();

    const tap = (cell: number) => {
      if (mine.includes(cell)) {
        const won = state.bingos.find((b) => b.user === me);
        if (won && LINES[won.line]!.includes(cell)) return;
        dispatch({ t: "unmark", cell });
        return;
      }
      const completes = lineOf([...mine, cell]) >= 0 && !state.bingos.some((b) => b.user === me);
      haptic(completes ? "success" : "light");
      dispatch({ t: "mark", cell });
    };

    const rowOfLine = myBingo ? (myBingo.line < 5 ? myBingo.line : 2) : 0;

    return (
      <div>
        <style>{"@keyframes bingoPop { from { transform: scale(0) } to { transform: scale(1) } }"}</style>
        <CardHeader title={state.title} subtitle={state.sub} />

        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32, borderRadius: 16, background: c.input, padding: "0 12px" }}>
          {nowPlaying ? (
            <>
              <svg width={18} height={16} viewBox="0 0 18 16" aria-hidden="true" style={{ flex: "none" }}>
                {[8, 14, 10, 16].map((h, i) => (
                  <rect key={i} x={i * 5} y={16 - h} width={3} height={h} rx={1} fill={c.primary} />
                ))}
              </svg>
              <small style={{ flex: "none", fontSize: 13, color: c.secondaryText }}>Now playing</small>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nowPlaying}</span>
            </>
          ) : (
            <small style={{ fontSize: 13, color: c.secondaryText }}>Tap a song when it starts</small>
          )}
        </div>

        <div style={{ height: 0, position: "relative", marginTop: 6, zIndex: 3 }}>
          {burstOn && myBingo ? (
            <div style={{ position: "absolute", left: "50%", top: rowOfLine * 54 - 6, transform: "translateX(-50%)", pointerEvents: "none" }}>
              <Burst key={myBingo.at} emoji="❤️" />
            </div>
          ) : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
          {state.cells.map((text, cell) => {
            if (cell === FREE) {
              return (
                <div key={cell} style={{ minHeight: 46, borderRadius: 8, padding: "7px 3px 3px", background: c.input, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
                  <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 1.2l2.1 4.5 4.9.6-3.6 3.4.9 4.9L8 12.2l-4.3 2.4.9-4.9L1 6.3l4.9-.6z" fill={c.series2} />
                  </svg>
                  <span style={{ fontSize: 11, lineHeight: "12px", fontWeight: 600, color: c.text }}>Free</span>
                </div>
              );
            }
            const isMine = mine.includes(cell);
            const played = state.played.includes(cell);
            const line = isMine && inLine(cell);
            const now = cell === lastPlayed && !isMine;
            const friends = ids.filter((id) => id !== me && (state.marks[id] ?? []).includes(cell)).slice(0, 3);
            return (
              <button
                key={cell}
                type="button"
                aria-label={`${text}${isMine ? ", marked" : played ? ", played" : ""}`}
                aria-pressed={isMine}
                onClick={() => tap(cell)}
                style={{
                  position: "relative",
                  minHeight: 46,
                  minWidth: 0,
                  border: 0,
                  borderRadius: 8,
                  padding: W < 340 ? "7px 1px 3px" : "7px 3px 3px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  font: "inherit",
                  cursor: "pointer",
                  background: line ? c.primary : isMine ? c.selected : c.input,
                  color: line ? c.onPrimary : isMine ? c.link : c.text,
                  boxShadow: now ? `inset 0 0 0 1.5px ${c.primary}` : "none",
                }}
              >
                {friends.map((id, j) => (
                  <span key={id} aria-hidden="true" style={{ position: "absolute", top: 4, left: 4 + j * 7, width: 6, height: 6, borderRadius: 3, background: userColor(id, theme) }} />
                ))}
                <span
                  style={{
                    fontSize: W < 340 ? 10 : 11,
                    lineHeight: "12px",
                    fontWeight: line || (now && W >= 340) ? 600 : 400,
                    display: "-webkit-box",
                    WebkitLineClamp: "3",
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    overflowWrap: "anywhere",
                  }}
                >
                  {text}
                </span>
                {isMine ? (
                  <svg key={cell} width={14} height={14} viewBox="0 0 14 14" aria-hidden="true" style={{ position: "absolute", top: 3, right: 3, animation: "bingoPop .3s cubic-bezier(.34,1.56,.64,1)" }}>
                    <circle cx={7} cy={7} r={7} fill={line ? c.card : c.primary} />
                    <path d="M4 7.2l2 2L10 5" fill="none" stroke={line ? c.primary : c.onPrimary} stroke-width={1.6} stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>

        <div role="list" aria-label="Who's closest" style={{ marginTop: 6, height: 56, boxSizing: "border-box", background: c.input, borderRadius: 12, padding: "6px 10px", display: "flex", justifyContent: "space-between" }}>
          {shown.map((id) => {
            const place = rank.indexOf(id) + 1;
            const won = state.bingos.some((b) => b.user === id);
            return (
              <div key={id} role="listitem" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "flex", borderRadius: "50%", boxShadow: id === me ? `0 0 0 2px ${c.card}, 0 0 0 4px ${c.primary}` : "none" }}>
                    <Avatar user={id} size={26} />
                  </span>
                  {won ? <Chip tone="positive">Bingo</Chip> : <span style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, color: c.secondaryText, whiteSpace: "nowrap" }}>{`${toGo(state.marks[id] ?? [])} to go`}</span>}
                </div>
                <span style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>{`#${place}`}</span>
              </div>
            );
          })}
        </div>

        {toastOn && latest ? <Toast key={latest.at}>{toastText}</Toast> : null}
      </div>
    );
  },
});
