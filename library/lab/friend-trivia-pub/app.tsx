import { defineApp, Avatar, Button, CardHeader, Chip, Facepile, Placed, Toast, clock, haptic, mix, pal, running, spring, springs, type Theme } from "@muse/app";

// Friend trivia: five questions a friend wrote about the group. Answer fast for a speed bonus; on each
// reveal you see who picked what, and the race track shows you chasing the friends who already played.
// Finish on a leaderboard.

type Params = {
  /** Card title, e.g. "How well do you know Unit 7?" */
  title: string;
  /** Who wrote it, as in the chat */
  by: string;
  /** How many people have played, e.g. 212 */
  plays: number;
  /** 1 to 5 questions: about (a name or "the group"), q, options (2 to 4), answer (index of the right one) */
  questions: { about: string; q: string; options: string[]; answer: number }[];
  /** Friends who already played: name, their pick per question, points per question */
  played: { who: string; picks: number[]; points: number[] }[];
};

// @params
const P: Params = {
  title: "How well do you know Unit 7?",
  by: "Maya",
  plays: 212,
  questions: [
    { about: "Maya", q: "Maya's boba order, every time?", options: ["Taro milk tea", "Brown sugar", "Thai tea", "Matcha latte"], answer: 1 },
    { about: "Theo", q: "Theo's major?", options: ["Econ", "Film", "Data science", "Undeclared"], answer: 2 },
    { about: "Leo", q: "How many hot sauces are in Leo's fridge?", options: ["4", "9", "14", "22"], answer: 2 },
    { about: "Priya", q: "Priya's karaoke song?", options: ["Mr. Brightside", "Dancing Queen", "Since U Been Gone", "Valerie"], answer: 2 },
    { about: "the group", q: "Where did Unit 7 first hang out?", options: ["Laundry room", "Ike's line", "The 3am fire drill", "CS 61A lab"], answer: 2 },
  ],
  played: [
    { who: "Leo", picks: [1, 2, 2, 0, 2], points: [160, 180, 200, 0, 150] },
    { who: "Priya", picks: [0, 2, 3, 2, 2], points: [0, 150, 0, 190, 170] },
    { who: "Sam", picks: [1, 3, 2, 2, 1], points: [140, 0, 120, 130, 0] },
    { who: "Theo", picks: [2, 3, 1, 2, 2], points: [0, 0, 0, 110, 140] },
    { who: "Ana", picks: [1, 2, 2, 2, 2], points: [190, 170, 150, 180, 160] },
  ],
};
// @end params

type Q = { about: string; q: string; opts: string[]; ans: number };
type Pick = { opt: number; pts: number; at: number };
/** q: the question on screen (qs.length when finished); qAt: when it opened; picks.length is q or q + 1. */
type Run = { u: string; q: number; qAt: number; picks: Pick[]; shared: boolean };
type State = { title: string; by: string; plays: number; qs: Q[]; runs: Run[] };
type Action = { t: "answer"; opt: number } | { t: "next" } | { t: "again" } | { t: "share" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name?: string }[] };

const QTIME = 12000;
const BASE = 100;
const BONUS = 100;
const MAX_Q = 5;
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const points = (dt: number) => BASE + Math.max(0, Math.min(BONUS, Math.floor((QTIME - Math.max(0, dt)) / 120)));
const rn = (s: State, u: string) => s.runs.find((r) => r.u === u);
const total = (r: Run, upTo = r.picks.length) => r.picks.slice(0, upTo).reduce((a, p) => a + p.pts, 0);
const ordinal = (n: number) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};
const LETTERS = ["A", "B", "C", "D"];

const slide = spring(springs.ios);
const land = spring(springs.iosBouncy);

// ---- Reducer side ----

function reduceTrivia(s: State, a: Record<string, unknown>, user: string, meta: { time: number }): State {
  const run = rn(s, user);
  const put = (r: Run): State => ({ ...s, runs: run ? s.runs.map((x) => (x.u === user ? r : x)) : [...s.runs, r] });
  if (a.t === "answer") {
    const r = run ?? { u: user, q: 0, qAt: meta.time, picks: [], shared: false };
    const q = s.qs[r.q];
    const opt = a.opt;
    if (!q || r.picks.length !== r.q) return s;
    if (typeof opt !== "number" || !Number.isInteger(opt) || opt < 0 || opt >= q.opts.length) return s;
    return put({ ...r, picks: [...r.picks, { opt, pts: opt === q.ans ? points(meta.time - r.qAt) : 0, at: meta.time }] });
  }
  if (a.t === "next") {
    if (!run || run.q >= s.qs.length || run.picks.length !== run.q + 1) return s;
    return put({ ...run, q: run.q + 1, qAt: meta.time });
  }
  if (a.t === "again") {
    if (!run || run.q !== s.qs.length) return s;
    return put({ ...run, q: 0, qAt: meta.time, picks: [], shared: false });
  }
  if (a.t === "share") {
    if (!run || run.q !== s.qs.length || run.shared) return s;
    return put({ ...run, shared: true });
  }
  return s;
}

export default defineApp<State, Action, Local>({
  name: "Friend trivia",
  summary: (s) => {
    if (!s.qs.length) return "No questions yet";
    const done = s.runs.filter((r) => r.q === s.qs.length);
    return `${s.title} · ${done.length} played · top score ${done.reduce((m, r) => Math.max(m, total(r)), 0)}`;
  },

  init: (ctx) => {
    const qs: Q[] = [];
    for (const x of P.questions) {
      const opts = (Array.isArray(x.options) ? x.options : []).map((o) => String(o).trim().slice(0, 40)).slice(0, 4);
      if (opts.length < 2 || qs.length >= MAX_Q) continue;
      const ans = Number.isInteger(x.answer) && x.answer >= 0 && x.answer < opts.length ? x.answer : 0;
      qs.push({ about: String(x.about ?? "").trim().slice(0, 16), q: String(x.q ?? "").trim().slice(0, 80), opts, ans });
    }
    const by = P.by.trim().toLowerCase();
    const runs: Run[] = [];
    for (const pl of P.played) {
      const want = pl.who.trim().toLowerCase();
      const m = ctx.members.find((x) => x.id === pl.who || (x.name ?? "").toLowerCase() === want);
      if (!m || m.id === P.by || (m.name ?? "").toLowerCase() === by || runs.some((r) => r.u === m.id)) continue;
      if (!qs.length || !Array.isArray(pl.picks) || qs.some((_, i) => !Number.isInteger(pl.picks[i]))) continue;
      const picks: Pick[] = qs.map((q, i) => {
        const opt = pl.picks[i]!;
        const given = pl.points?.[i];
        const right = opt === q.ans;
        return { opt, pts: right ? (typeof given === "number" && Number.isInteger(given) && given >= 100 && given <= 200 ? given : 100) : 0, at: 0 };
      });
      if (picks.some((p, i) => p.opt < 0 || p.opt >= qs[i]!.opts.length)) continue;
      runs.push({ u: m.id, q: qs.length, qAt: 0, picks, shared: false });
    }
    return { title: P.title.trim().slice(0, 48) || "Friend trivia", by: P.by.trim().slice(0, 16), plays: Number.isInteger(P.plays) && P.plays >= 0 ? P.plays : 0, qs, runs };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceTrivia(state, action as unknown as Record<string, unknown>, meta.user, meta) : state),

  onMembers: (state, ctx) => (state.runs.every((r) => inChat(ctx, r.u)) ? state : { ...state, runs: state.runs.filter((r) => inChat(ctx, r.u)) }),

  invariants: {
    "one run each, people here": (s, ctx) => new Set(s.runs.map((r) => r.u)).size === s.runs.length && s.runs.every((r) => inChat(ctx, r.u)),
    "picks keep pace": (s) => s.runs.every((r) => r.q <= s.qs.length && (r.picks.length === r.q || r.picks.length === r.q + 1) && r.picks.length <= s.qs.length),
    "picks are real options": (s) => s.runs.every((r) => r.picks.every((p, i) => Number.isInteger(p.opt) && p.opt >= 0 && p.opt < (s.qs[i]?.opts.length ?? 0))),
    "points follow the answer": (s) =>
      s.runs.every((r) => r.picks.every((p, i) => (p.opt === s.qs[i]?.ans ? p.pts >= 100 && p.pts <= 200 && Number.isInteger(p.pts) : p.pts === 0))),
    "share after finishing": (s) => s.runs.every((r) => !r.shared || r.q === s.qs.length),
    "at least one question": (s) => s.qs.length >= 1 || s.runs.length === 0,
  },

  transitions: {
    "answer adds one pick to my run": (p, n, a, m) => {
      if (a.t !== "answer" || n === p) return true;
      const r = rn(n, m.user);
      return !!r && r.picks.length === (rn(p, m.user)?.picks.length ?? 0) + 1 && r.picks.at(-1)!.opt === a.opt;
    },
    "speed counts": (p, n, a, m) => {
      if (a.t !== "answer" || n === p) return true;
      const r = rn(n, m.user)!;
      return r.picks.at(-1)!.pts === (a.opt === p.qs[r.q]!.ans ? points(m.time - r.qAt) : 0);
    },
    "one answer per question": (p, n, a, m) => {
      if (a.t !== "answer") return true;
      const r = rn(p, m.user);
      return !r || r.picks.length === r.q || n === p;
    },
    "next only after answering": (p, n, a, m) => {
      if (a.t !== "next" || n === p) return true;
      const before = rn(p, m.user)!;
      const after = rn(n, m.user)!;
      return before.picks.length === before.q + 1 && after.q === before.q + 1 && after.qAt === m.time;
    },
    "again only when finished": (p, n, a, m) => {
      if (a.t !== "again" || n === p) return true;
      const after = rn(n, m.user)!;
      return rn(p, m.user)!.q === p.qs.length && after.q === 0 && after.picks.length === 0;
    },
    "others' runs untouched": (p, n, _a, m) => n.runs.every((r) => r.u === m.user || p.runs.find((x) => x.u === r.u) === r),
    "questions never change": (p, n) => n.qs === p.qs,
  },

  arbitrary: (s, user, r) => {
    const run = rn(s, user);
    const k = r.next();
    if (!run || (run.q < s.qs.length && run.picks.length === run.q)) {
      const q = s.qs[run?.q ?? 0];
      if (!q) return { t: "next" };
      return { t: "answer", opt: k < 0.4 ? q.ans : r.int(q.opts.length) };
    }
    if (run.q < s.qs.length) return k < 0.85 ? { t: "next" } : { t: "answer", opt: 0 };
    return k < 0.4 ? { t: "again" } : k < 0.8 ? { t: "share" } : { t: "next" };
  },

  view: ({ state, me, members, dispatch, theme }) => {
    const c = theme.color;
    const W = theme.width - 24;
    const N = state.qs.length;
    const run = rn(state, me);
    const q = run?.q ?? 0;
    const finished = !!run && q >= N && N > 0;
    const answered = !!run && !finished && run.picks.length === q + 1;
    const cur = state.qs[q];
    const myPick = answered ? run!.picks[q]! : null;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const revealed = run ? run.picks.length : 0;
    const MAX = Math.max(1, N * 200);
    const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

    if (!N) {
      return (
        <div>
          <CardHeader title={state.title} subtitle={`by ${state.by} · ${state.plays} plays`} />
          <div style={{ height: 92, boxSizing: "border-box", borderRadius: 12, background: c.wash, padding: 12 }}>
            <div style={{ fontSize: 18, lineHeight: "24px", fontWeight: 600, color: c.text }}>No questions yet</div>
            <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>Ask whoever made it to add some</div>
          </div>
        </div>
      );
    }

    // Time left on this question: reads the clock only while it is unanswered and a question is open.
    const open = !!run && !finished && !answered;
    const elapsed = answered ? myPick!.at - run!.qAt : open ? clock.value - run!.qAt : 0;
    const left = 1 - Math.min(1, Math.max(0, elapsed) / QTIME);
    const secs = Math.max(0, Math.ceil((QTIME - Math.max(0, elapsed)) / 1000));

    const header = (
      <CardHeader
        title={state.title}
        subtitle={finished ? `Final results · by ${state.by} · ${state.plays} plays` : `Question ${q + 1} of ${N} · by ${state.by} · ${state.plays} plays`}
      />
    );

    // ---- Race track ----
    const racers = [...state.runs.filter((r) => r.u !== me), ...(run ? [run] : [])]
      .map((r) => ({ u: r.u, score: r.u === me ? total(r) : total(r, revealed) }))
      .concat(run ? [] : [{ u: me, score: 0 }])
      .sort((a, b) => a.score - b.score);
    const lastX = [-100, -100];
    const placedRacers = racers.map((r, rank) => {
      const lane = rank % 2;
      const x = Math.min(W - 42, Math.max(20 + Math.min(1, r.score / MAX) * (W - 62), lastX[lane]! + 24));
      lastX[lane] = x;
      return { ...r, lane, x };
    });
    const mineRacer = placedRacers.find((r) => r.u === me);
    const track = (
      <div style={{ position: "relative", height: 58, borderRadius: 12, background: c.wash, marginTop: 8 }}>
        <svg width={W} height={58} viewBox={`0 0 ${W} 58`} aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
          {[20, 40].map((y) => (
            <line key={y} x1={18} y1={y} x2={W - 30} y2={y} stroke={c.divider} strokeWidth={1.5} strokeDasharray="6 6" />
          ))}
        </svg>
        <svg width={20} height={30} viewBox="0 0 20 30" aria-hidden="true" style={{ position: "absolute", right: 24, bottom: 10, overflow: "visible" }}>
          <rect x={0} y={4} width={2} height={26} fill={c.text} />
          {[0, 1, 2].map((col) => (
            <g
              key={col}
              ref={(el: Element) => {
                (el as unknown as SVGGElement).animate?.([{ transform: "translateY(-1.2px)" }, { transform: "translateY(1.2px)" }], { duration: 800, direction: "alternate", iterations: Infinity, delay: -col * 250, easing: "ease-in-out" });
              }}
            >
              {[0, 1, 2].map((row) => (
                <rect key={row} x={2 + col * 4} y={4 + row * 4} width={4} height={4} fill={(row + col) % 2 === 0 ? c.text : c.wash} />
              ))}
            </g>
          ))}
        </svg>
        {placedRacers.map((r) => (
          <Placed key={r.u} user={r.u} x={r.x / W} y={r.lane ? 40 / 58 : 20 / 58} size={22} me={me} />
        ))}
        {mineRacer ? (
          <span key="you" style={{ position: "absolute", top: 49, left: mineRacer.x, transform: "translateX(-50%)", transition: "left .5s cubic-bezier(.34,1.56,.64,1)", pointerEvents: "none" }}>
            <Chip tone="primary">You</Chip>
          </span>
        ) : null}
      </div>
    );

    // ---- Finished view ----
    if (finished) {
      const done = state.runs.filter((r) => r.q === N);
      const board = [...done].sort((a, b) => total(b) - total(a));
      const mine = total(run!);
      const place = 1 + done.filter((r) => r.u !== me && total(r) > mine).length;
      const behind = done.filter((r) => r.u !== me && total(r) < mine).length;
      const myIdx = board.findIndex((r) => r.u === me);
      const top = board.slice(0, 5);
      const rows = myIdx >= 5 ? [...top, board[myIdx]!] : board.slice(0, 6);
      const showToast = place <= 3 && !run!.shared && running(run!.picks[N - 1]!.at, 2400) !== null;
      return (
        <div>
          {header}
          {track}
          <div style={{ marginTop: 14, height: 262 - 0, position: "relative" }}>
            <div style={{ height: 24, fontSize: 17, lineHeight: "24px", fontWeight: 700, color: c.text }}>{`You placed ${ordinal(place)}`}</div>
            <div style={{ height: 18, fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>{`${mine} points · ahead of ${behind} ${behind === 1 ? "friend" : "friends"}`}</div>
            <div style={{ marginTop: 4 }}>
              {rows.map((r) => {
                const rank = board.indexOf(r) + 1;
                const isMe = r.u === me;
                return (
                  <div key={r.u} style={{ height: 30, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 8, padding: "0 8px", borderRadius: 8, background: isMe ? c.selected : "transparent" }}>
                    <Avatar user={r.u} size={22} />
                    <span style={{ ...ellipsis, flex: 1, minWidth: 0, fontSize: 14, lineHeight: "18px", fontWeight: 600, color: c.text, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={ellipsis}>{isMe ? "You" : nameOf(r.u)}</span>
                      {rank === 1 ? (
                        <svg width={12} height={12} viewBox="0 0 12 12" aria-label="First place" role="img" style={{ flex: "none" }}>
                          <path d="M3 1h6v3a3 3 0 0 1-6 0zM1.5 1.8h1.5v1.5A1.3 1.3 0 0 1 1.5 1.8zM10.5 1.8H9v1.5a1.3 1.3 0 0 0 1.5-1.5zM5.4 7h1.2v1.7H8V10H4V8.7h1.4z" fill={pal(theme).yellow} />
                        </svg>
                      ) : null}
                    </span>
                    <span style={{ width: 44, textAlign: "right", fontSize: 14, lineHeight: "18px", color: c.text }}>{total(r)}</span>
                    <span style={{ width: 28, textAlign: "right", fontSize: 15, lineHeight: "18px", fontWeight: 600, color: isMe ? c.link : c.secondaryText }}>{ordinal(rank)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 36, display: "flex", gap: 8 }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {run!.shared ? (
                  <Chip tone="positive">Shared</Chip>
                ) : (
                  <Button kind="primary" wide onClick={() => dispatch({ t: "share" })}>
                    Share
                  </Button>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <Button wide onClick={() => dispatch({ t: "again" })}>
                  Play again
                </Button>
              </div>
            </div>
          </div>
          {showToast ? <Toast key="top3">You know Unit 7 well</Toast> : run!.shared ? <Toast key="shared">Score shared to Unit 7</Toast> : null}
        </div>
      );
    }

    // ---- Question ----
    const aboutMember = members.find((m) => (m.name ?? "").toLowerCase() === cur!.about.toLowerCase() || m.id === cur!.about);
    const sl = run ? running(run.qAt, slide.duration) : null;
    const dx = sl === null ? 0 : 40 * (1 - slide(sl));
    const others = state.runs.filter((r) => r.u !== me);
    const onOpt = (k: number) => state.runs.filter((r) => r.picks.length > q && r.picks[q]!.opt === k && (r.u !== me || answered));
    const gotIt = others.filter((r) => r.picks.length > q && r.picks[q]!.opt === cur!.ans).length;
    const heard = others.filter((r) => r.picks.length > q).length;
    const shake = myPick && myPick.opt !== cur!.ans ? running(myPick.at, 300) : null;

    const optionBox = (k: number) => {
      const label = cur!.opts[k]!;
      const right = answered && k === cur!.ans;
      const wrong = answered && myPick!.opt === k && k !== cur!.ans;
      const bg = right ? mix(c.positive, c.card, 0.82) : wrong ? mix(c.negative, c.card, 0.85) : c.card;
      const border = right ? c.positive : wrong ? c.negative : c.divider;
      const who = answered ? onOpt(k).map((r) => r.u) : [];
      const f = myPick && k === myPick.opt ? running(myPick.at, 600) : null;
      const inner = (
        <div
          style={{
            height: 44,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 10px 0 12px",
            borderRadius: 22,
            background: bg,
            border: `${right || wrong ? 2 : 1}px solid ${border}`,
            transform: wrong && shake !== null ? `translateX(${Math.sin(shake / 30) * 6 * (1 - shake / 300)}px)` : undefined,
          }}
        >
          <span
            aria-hidden="true"
            style={{ flex: "none", width: 20, height: 20, boxSizing: "border-box", borderRadius: 10, display: "grid", placeItems: "center", fontSize: 11, lineHeight: "12px", fontWeight: 600, color: c.secondaryText, border: right ? "none" : wrong ? "none" : `1px solid ${c.secondaryText}`, background: right ? c.positive : wrong ? c.negative : "transparent" }}
          >
            {right ? (
              <svg width={12} height={12} viewBox="4 6 16 12"><path d="M6 12l4 4 8-8" fill="none" stroke={c.onPrimary} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : wrong ? (
              <svg width={10} height={10} viewBox="0 0 10 10"><path d="M2 2l6 6M8 2L2 8" fill="none" stroke={c.onPrimary} strokeWidth={2} strokeLinecap="round" /></svg>
            ) : (
              LETTERS[k]
            )}
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", fontWeight: 600, color: answered && !right && !wrong ? c.secondaryText : c.text, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{label}</span>
          {answered && who.length ? (
            <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, transform: f !== null ? `translateY(${-8 * (1 - land(f))}px)` : undefined }}>
              <Facepile users={who.slice(0, 2)} max={2} size={18} />
              <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: 600, color: c.text }}>{who.length}</span>
            </span>
          ) : null}
        </div>
      );
      const aria = `${LETTERS[k]}: ${label}${right ? ", right answer" : wrong ? ", your pick" : ""}`;
      return answered ? (
        <div key={k} role="img" aria-label={aria} style={{ height: 52, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {inner}
        </div>
      ) : (
        <button
          key={k}
          type="button"
          aria-label={aria}
          onClick={() => {
            haptic(k === cur!.ans ? "success" : "light");
            dispatch({ t: "answer", opt: k });
          }}
          style={{ height: 52, padding: 0, border: 0, background: "none", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}
        >
          {inner}
        </button>
      );
    };

    const footer = answered ? (
      <div style={{ height: 36, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ ...ellipsis, flex: 1, minWidth: 0, color: c.text }}>
          {myPick!.opt === cur!.ans ? (
            <>
              <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600 }}>{`+${myPick!.pts}`}</span>
              <span style={{ fontSize: 13, lineHeight: "20px", color: c.secondaryText }}>{` · ${myPick!.pts - BASE} speed bonus`}</span>
            </>
          ) : (
            <span style={{ fontSize: 15, lineHeight: "20px" }}>{`Not quite · ${gotIt} of ${heard} friends got it`}</span>
          )}
        </div>
        <Button kind="primary" onClick={() => dispatch({ t: "next" })}>
          {q + 1 === N ? "Results" : "Next"}
        </Button>
      </div>
    ) : (
      <div style={{ height: 36, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ ...ellipsis, flex: 1, minWidth: 0, fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>
          {open && elapsed >= QTIME ? "Time's up · still 100 for a right answer" : `${secs}s left · faster = more points`}
        </span>
        {state.runs.some((r) => r.q === N) ? <Facepile users={state.runs.filter((r) => r.q === N && r.u !== me).map((r) => r.u)} max={4} size={18} /> : null}
      </div>
    );

    return (
      <div>
        {header}
        {track}
        <div
          key={`q${q}`}
          style={{ marginTop: 14, height: 92, boxSizing: "border-box", borderRadius: 12, background: c.wash, padding: 12, display: "flex", flexDirection: "column", justifyContent: "space-between", transform: `translateX(${dx}px)` }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, height: 18 }}>
              <span style={{ ...ellipsis, fontSize: 13, lineHeight: "18px", fontWeight: 600, color: c.secondaryText }}>{cur!.about.toLowerCase() === "the group" ? "About the group" : `About ${cur!.about}`}</span>
              {aboutMember ? <Avatar user={aboutMember} size={18} /> : null}
            </div>
            <div style={{ fontSize: 18, lineHeight: "22px", fontWeight: 600, color: c.text, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{cur!.q}</div>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: c.track, overflow: "hidden", flex: "none" }}>
            <div style={{ height: 6, width: `${left * 100}%`, background: c.primary }} />
          </div>
        </div>
        <div style={{ marginTop: 10, minHeight: 112, display: "grid", gridTemplateColumns: "1fr 1fr", gridAutoRows: 52, gap: 8, alignContent: "start" }}>{cur!.opts.map((_, k) => optionBox(k))}</div>
        <div style={{ marginTop: 12 }}>{footer}</div>
      </div>
    );
  },
});
