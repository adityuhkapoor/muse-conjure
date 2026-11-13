import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Facepile,
  Toast,
  clock,
  haptic,
  mix,
  running,
  userColor,
  type Ctx,
  type Member,
} from "@muse/app";

// The chat's own mini crossword. Every clue comes from the group chat; every square you fill keeps
// your colour, so the finished grid is a picture of who knew what. Tap a square, type the word,
// fill it. Wrong guesses count against you, gently, in the log.

type Params = {
  /** Card title: "The six mini" */
  title: string;
  /** Under the title: "Monday · every clue is from the chat" */
  sub: string;
  /** Grid rows, all the same length (3 to 5); "#" is a black square. */
  rows: string[];
  /** Clues by number and direction, written from the chat. */
  clues: { num: number; dir: "across" | "down"; text: string }[];
  /** Words friends already filled, by answer. */
  solved: { name: string; answer: string }[];
  /** Wrong tries already made, with what they typed. */
  misses: { name: string; guess: string; num: number; dir: "across" | "down" }[];
};

// @params
const P: Params = {
  title: "The six mini",
  sub: "Monday · every clue is from the chat",
  rows: ["SLOT", "NOPE", "OVEN", "WENT"],
  clues: [
    { num: 1, dir: "across", text: "Lot C had one left. Will took it" },
    { num: 5, dir: "across", text: "Tsai Lin's answer to every aux request" },
    { num: 6, dir: "across", text: "What Arun says the rice cooker basically is" },
    { num: 7, dir: "across", text: "Who ___ to Kettle & Crumb without us" },
    { num: 1, dir: "down", text: "What shut Miller Hill down last week" },
    { num: 2, dir: "down", text: "Aditya's feelings for Golden Lantern, lowkey" },
    { num: 3, dir: "down", text: "Rook's is ___ till 2am" },
    { num: 4, dir: "down", text: "Will's Lake Wren sleeping plan" },
  ],
  solved: [
    { name: "Tsai Lin", answer: "NOPE" },
    { name: "Arun", answer: "OVEN" },
    { name: "Maya", answer: "SNOW" },
  ],
  misses: [{ name: "Calvin", guess: "NAPS", num: 1, dir: "across" }],
};
// @end params

type Dir = "across" | "down";
type Clue = { num: number; dir: Dir; text: string; cells: number[]; answer: string };
type Fill = { who: string; name: string } | null;
type Miss = { who: string; name: string; guess: string; clue: number; at: number };
type State = { title: string; sub: string; cols: number; grid: string; clues: Clue[]; cells: Fill[]; misses: Miss[]; tally: Record<string, number>; started: number; done: number };
type Action = { t: "fill"; clue: number; word: string };
type Local = { sel: number; draft: string; toast: number; shake: number };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const letters = (v: unknown) => (typeof v === "string" ? v.toUpperCase().replace(/[^A-Z]/g, "") : "");

/** Parse rows into a grid string and the clue list with standard numbering. */
function build(rows: string[], texts: Params["clues"]): { cols: number; grid: string; clues: Clue[] } {
  const rs = rows.map((r) => (typeof r === "string" ? r.toUpperCase().replace(/[^A-Z#]/g, "") : "")).filter(Boolean).slice(0, 5);
  const cols = Math.min(5, Math.max(0, ...rs.map((r) => r.length)));
  if (rs.length < 3 || cols < 3) return build(["SLOT", "NOPE", "OVEN", "WENT"], texts);
  const grid = rs.map((r) => r.padEnd(cols, "#").slice(0, cols)).join("");
  const n = rs.length;
  const open = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < cols && grid[r * cols + c] !== "#";
  const clues: Clue[] = [];
  let num = 0;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < cols; c++) {
      if (!open(r, c)) continue;
      const a = !open(r, c - 1) && open(r, c + 1);
      const d = !open(r - 1, c) && open(r + 1, c);
      if (!a && !d) continue;
      num++;
      for (const dir of ["across", "down"] as Dir[]) {
        if ((dir === "across" && !a) || (dir === "down" && !d)) continue;
        const cells: number[] = [];
        for (let k = 0; dir === "across" ? open(r, c + k) : open(r + k, c); k++) cells.push(dir === "across" ? r * cols + c + k : (r + k) * cols + c);
        const t = (Array.isArray(texts) ? texts : []).find((x) => x?.num === num && x?.dir === dir);
        clues.push({ num, dir, text: clean(t?.text, 70) || `${cells.length} letters`, cells, answer: cells.map((i) => grid[i]).join("") });
      }
    }
  return { cols, grid, clues };
}

function initState(ctx: Ctx): State {
  const { cols, grid, clues } = build(Array.isArray(P.rows) ? P.rows : [], P.clues);
  const cells: Fill[] = Array.from({ length: grid.length }, () => null);
  const tally: Record<string, number> = {};
  const who = (name: string) => {
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return m ? m.id : `~${name}`;
  };
  for (const s of Array.isArray(P.solved) ? P.solved : []) {
    const name = clean(s?.name, 20);
    const clue = clues.find((c) => c.answer === letters(s?.answer));
    if (!name || !clue) continue;
    for (const i of clue.cells) if (!cells[i]) cells[i] = { who: who(name), name };
  }
  for (const f of cells) if (f) tally[f.who] = (tally[f.who] ?? 0) + 1;
  const misses: Miss[] = [];
  for (const m of Array.isArray(P.misses) ? P.misses : []) {
    const name = clean(m?.name, 20);
    const k = clues.findIndex((c) => c.num === m?.num && c.dir === m?.dir);
    if (!name || k < 0 || misses.length >= 6) continue;
    misses.push({ who: who(name), name, guess: letters(m.guess).slice(0, 5), clue: k, at: 0 });
  }
  const full = grid.length > 0 && [...grid].every((ch, i) => ch === "#" || cells[i]);
  return { title: clean(P.title, 40) || "Mini crossword", sub: clean(P.sub, 60), cols, grid, clues, cells, misses, tally, started: 0, done: full ? 1 : 0 };
}

const isFull = (s: State) => [...s.grid].every((ch, i) => ch === "#" || s.cells[i]);
const solvedClue = (s: State, k: number) => (s.clues[k]?.cells ?? []).every((i) => s.cells[i]);
const mins = (ms: number) => Math.max(1, Math.round(ms / 60000));

export default defineApp<State, Action, Local>({
  name: "Chat crossword",
  summary: (s) => {
    const filled = s.cells.filter(Boolean).length;
    const open = [...s.grid].filter((c) => c !== "#").length;
    return s.done ? `${s.title}: solved · ${Object.keys(s.tally).length} of you filled it` : `${s.title}: ${filled} of ${open} squares filled`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || a.t !== "fill" || s.done) return s;
    const k = typeof a.clue === "number" && Number.isInteger(a.clue) ? a.clue : -1;
    const clue = s.clues[k];
    const word = letters(a.word);
    if (!clue || word.length !== clue.answer.length || solvedClue(s, k)) return s;
    const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
    const started = s.started || m.time;
    if (word !== clue.answer) {
      return { ...s, started, misses: [...s.misses, { who: m.user, name, guess: word, clue: k, at: m.time }].slice(-6) };
    }
    const cells = s.cells.map((f, i) => (f || !clue.cells.includes(i) ? f : { who: m.user, name }));
    const gained = cells.filter((f, i) => f && !s.cells[i]).length;
    const next = { ...s, started, cells, tally: { ...s.tally, [m.user]: (s.tally[m.user] ?? 0) + gained } };
    return isFull(next) ? { ...next, done: m.time || 1 } : next;
  },

  invariants: {
    "black squares stay empty": (s) => [...s.grid].every((ch, i) => ch !== "#" || s.cells[i] === null),
    "the tally counts the squares": (s) => {
      const n: Record<string, number> = {};
      for (const f of s.cells) if (f) n[f.who] = (n[f.who] ?? 0) + 1;
      return Object.keys(n).length === Object.keys(s.tally).filter((k) => s.tally[k]! > 0).length && Object.entries(n).every(([k, v]) => s.tally[k] === v);
    },
    "done only when every square is filled": (s) => !s.done === !isFull(s),
    "misses are wrong words": (s) => s.misses.every((x) => !!s.clues[x.clue] && x.guess !== s.clues[x.clue]!.answer),
  },

  transitions: {
    "a right word fills every square of it": (p, n, a) => a.t !== "fill" || p === n || letters(a.word) !== p.clues[a.clue]?.answer || p.clues[a.clue]!.cells.every((i) => n.cells[i]),
    "filled squares keep their filler": (p, n) => p.cells.every((f, i) => !f || n.cells[i]?.who === f.who),
    "new squares are yours": (p, n, _a, m) => n.cells.every((f, i) => !f || p.cells[i] || f.who === m.user),
    "a wrong word fills nothing and is logged": (p, n, a, m) =>
      a.t !== "fill" || p === n || letters(a.word) === p.clues[a.clue]?.answer || (n.cells.every((f, i) => f === p.cells[i]) && n.misses[n.misses.length - 1]?.who === m.user),
    "nothing changes once it's solved": (p, n) => !p.done || p === n,
    "new squares are credited to you": (p, n, _a, m) => {
      const got = n.cells.filter((f, i) => f && !p.cells[i]).length;
      return (n.tally[m.user] ?? 0) === (p.tally[m.user] ?? 0) + got;
    },
    "the clock starts at the first move": (p, n, _a, m) => p === n || n.started === (p.started || m.time),
    "solving stamps the time": (p, n, _a, m) => !!p.done || !n.done || n.done === (m.time || 1),
    "a word must fit an open clue": (p, n, a) => {
      if (a.t !== "fill" || p === n) return true;
      const k = typeof a.clue === "number" && Number.isInteger(a.clue) ? a.clue : -1;
      return !!p.clues[k] && letters(a.word).length === p.clues[k]!.answer.length && !solvedClue(p, k);
    },
    "new squares carry your chat name": (p, n, _a, m, ctx) => n.cells.every((f, i) => !f || p.cells[i] || f.name === (clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend")),
    "a miss is one more line": (p, n, a, m) => a.t !== "fill" || p === n || letters(a.word) === p.clues[a.clue]?.answer || (n.misses.length === Math.min(6, p.misses.length + 1) && n.misses[n.misses.length - 1]!.guess === letters(a.word) && n.misses[n.misses.length - 1]!.clue === a.clue && n.misses[n.misses.length - 1]!.at === m.time),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const open = s.clues.map((_, k) => k).filter((k) => !solvedClue(s, k));
    if (!open.length) return null;
    const k = r.pick(open);
    const c = s.clues[k]!;
    return { t: "fill", clue: k, word: r.next() < 0.6 ? c.answer : c.answer.split("").map((ch) => (r.next() < 0.5 ? "E" : ch)).join("") };
  },

  local: { sel: -1, draft: "", toast: 0, shake: 0 },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const dk = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const nrows = s.cols ? s.grid.length / s.cols : 0;
    const side = Math.min(204, W - 132);
    const cell = Math.max(46, Math.floor(side / Math.max(s.cols, nrows)));
    const firstOpen = s.clues.findIndex((_, k) => !solvedClue(s, k));
    const sel = local.sel >= 0 && s.clues[local.sel] && !solvedClue(s, local.sel) ? local.sel : -1;
    const clue = sel >= 0 ? s.clues[sel]! : null;
    const draft = letters(local.draft).slice(0, clue?.answer.length ?? 0);
    const nameOf = (id: string, fallback: string) => members.find((m) => m.id === id)?.name ?? fallback;
    const colOf = (id: string) => userColor(id, theme);
    const people = Object.entries(s.tally)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ id, n, name: nameOf(id, s.cells.find((f) => f?.who === id)?.name ?? "Friend") }));
    const filled = s.cells.filter(Boolean).length;
    const open = [...s.grid].filter((ch) => ch !== "#").length;
    const lastMiss = s.misses[s.misses.length - 1];
    const shake = running(local.shake, 420);
    const pop = s.done > 1 ? running(s.done, 900) : null;
    const pick = (i: number) => {
      const ks = s.clues.map((_, k) => k).filter((k) => s.clues[k]!.cells.includes(i) && !solvedClue(s, k));
      if (!ks.length) return;
      const k = ks.includes(sel) && ks.length > 1 ? ks.find((x) => x !== sel)! : ks[0]!;
      haptic("light");
      setLocal({ sel: k, draft: "" });
    };

    const grid = (
      <div
        role="group"
        aria-label={`Crossword, ${filled} of ${open} squares filled`}
        style={{ position: "relative", width: cell * s.cols + 4, height: cell * nrows + 4, padding: 2, borderRadius: 10, background: dk ? c.divider : c.text, flex: "none", transform: pop !== null ? `scale(${1 + 0.04 * Math.sin((pop / 900) * Math.PI)})` : undefined }}
      >
        {[...s.grid].map((ch, i) => {
          const r = Math.floor(i / s.cols);
          const col = i % s.cols;
          const f = s.cells[i];
          const inSel = clue?.cells.includes(i) ?? false;
          const pos = clue ? clue.cells.indexOf(i) : -1;
          const typed = inSel && pos < draft.length ? draft[pos] : "";
          const num = s.clues.find((q) => q.cells[0] === i)?.num;
          const dx = inSel && shake !== null ? Math.sin(shake / 30) * 4 * (1 - shake / 420) : 0;
          if (ch === "#") return <div key={i} style={{ position: "absolute", left: 2 + col * cell, top: 2 + r * cell, width: cell, height: cell, background: dk ? c.divider : c.text }} />;
          const bg = f ? mix(colOf(f.who), c.card, dk ? 0.45 : 0.62) : inSel ? mix(c.primary, c.card, 0.82) : c.card;
          return (
            <button
              key={i}
              type="button"
              aria-label={`Square ${r + 1}, ${col + 1}${f ? `, ${ch} by ${nameOf(f.who, f.name)}` : ""}`}
              onClick={() => pick(i)}
              disabled={!!f}
              style={{ position: "absolute", left: 2 + col * cell, top: 2 + r * cell, width: cell - 1.5, height: cell - 1.5, background: bg, borderRadius: 3, transform: dx ? `translateX(${dx}px)` : undefined, boxShadow: inSel ? `inset 0 0 0 2px ${c.primary}` : undefined }}
            >
              {num ? <span style={{ position: "absolute", left: 3, top: 1, fontSize: 10, lineHeight: "12px", fontWeight: 600, color: c.text }}>{String(num)}</span> : null}
              <span style={{ fontSize: Math.round(cell * 0.48), fontWeight: 700, color: c.text, lineHeight: `${cell}px` }}>{f ? ch : typed}</span>
              {f ? <span aria-hidden="true" style={{ position: "absolute", right: 3, bottom: 3, width: 7, height: 7, borderRadius: 4, background: colOf(f.who) }} /> : null}
            </button>
          );
        })}
      </div>
    );

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {grid}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{s.done ? "Solved" : `${filled} of ${open} squares`}</div>
            <div style={{ height: 6, borderRadius: 3, background: c.track, overflow: "hidden", display: "flex" }}>
              {people.map((p) => (
                <i key={p.id} style={{ flex: p.n, background: colOf(p.id) }} />
              ))}
              <i style={{ flex: open - filled }} />
            </div>
            {people.slice(0, lastMiss ? 3 : 4).map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 13, lineHeight: "16px" }}>
                <Avatar user={{ id: p.id, name: p.name }} size={20} />
                <span style={{ color: c.text, fontWeight: 600, ...ell }}>{first(p.name)}</span>
                <span style={{ color: c.secondaryText, flex: "none" }}>{String(p.n)}</span>
              </div>
            ))}
            {!people.length ? <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>Nobody's filled a square yet. Tap one to start.</div> : null}
            {lastMiss ? (
              <div style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>
                {`${first(nameOf(lastMiss.who, lastMiss.name))} tried ${lastMiss.guess} for ${s.clues[lastMiss.clue]?.num ?? ""} ${s.clues[lastMiss.clue]?.dir ?? ""}`}
              </div>
            ) : null}
          </div>
        </div>
        {s.done ? (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
            <Facepile users={people.map((p): Member => ({ id: p.id, name: p.name }))} max={6} size={24} />
            <span style={{ fontSize: 15, color: c.text, minWidth: 0, ...ell }}>
              {s.started && s.done > s.started ? `Solved in ${mins(s.done - s.started)} min · ${first(people[0]?.name ?? "")} filled the most` : `Solved · ${first(people[0]?.name ?? "")} filled the most`}
            </span>
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <div style={{ minHeight: 40, padding: "6px 10px", borderRadius: 10, background: c.wash, fontSize: 15, lineHeight: "20px", color: c.text }}>
              {clue ? (
                <span>
                  <b style={{ fontWeight: 600 }}>{`${clue.num} ${clue.dir} `}</b>
                  {`${clue.text} (${clue.answer.length})`}
                </span>
              ) : (
                <span style={{ color: c.secondaryText }}>{firstOpen >= 0 ? `Tap a square · ${s.clues.filter((_, k) => !solvedClue(s, k)).length} clues left, all from the chat` : ""}</span>
              )}
            </div>
            <form
              style={{ display: "flex", gap: 8, marginTop: 8 }}
              onSubmit={(e: Event) => {
                e.preventDefault();
                if (!clue || draft.length !== clue.answer.length) return;
                const right = draft === clue.answer;
                haptic(right ? "success" : "medium");
                dispatch({ t: "fill", clue: sel, word: draft });
                setLocal(right ? { sel: -1, draft: "", toast: local.toast + 1 } : { draft: "", shake: clock.peek() });
              }}
            >
              <input
                aria-label="Your answer"
                placeholder={clue ? `${clue.answer.length} letters` : "Pick a square first"}
                value={draft}
                disabled={!clue}
                maxLength={5}
                onInput={(e: Event) => setLocal({ draft: letters((e.currentTarget as HTMLInputElement).value) })}
                style={{ flex: 1, letterSpacing: draft ? 2 : 0, fontWeight: draft ? 600 : 400 }}
              />
              <Button
                kind="primary"
                disabled={!clue || draft.length !== (clue?.answer.length ?? 0)}
                onClick={() => {
                  if (!clue || draft.length !== clue.answer.length) return;
                  const right = draft === clue.answer;
                  haptic(right ? "success" : "medium");
                  dispatch({ t: "fill", clue: sel, word: draft });
                  setLocal(right ? { sel: -1, draft: "", toast: local.toast + 1 } : { draft: "", shake: clock.peek() });
                }}
              >
                Fill it
              </Button>
            </form>
          </div>
        )}
        {local.toast > 0 ? <Toast key={local.toast}>{s.done ? "Grid solved" : "Filled in your color"}</Toast> : null}
      </div>
    );
  },
});
