import {
  defineApp,
  Avatar,
  Button,
  Chip,
  More,
  Toast,
  clock,
  haptic,
  mix,
  pal,
  running,
  tween,
  type Ctx,
  type Meta,
  type Member,
} from "@muse/app";

// Chatdle: a daily five-letter word taken from the group chat. Type on the keys, Enter scores the
// row, friends' streaks sit beside the board with their grids greyed out until you finish, then the
// receipt shows the chat message the word came from. Typing lives in local; only Enter dispatches.

type Params = {
  word: string;
  said: number;
  chat: string;
  no: number;
  day: string;
  source: { who: string; text: string; when: string };
  streaks: { who: string; days: number }[];
  played: { who: string; marks: string[] }[];
};

// @params
const P: Params = {
  word: "TACOS",
  said: 41,
  chat: "Unit 7",
  no: 212,
  day: "Thu",
  source: { who: "Leo", text: "Who's down for tacos at 1am", when: "Tue" },
  streaks: [
    { who: "Maya", days: 6 },
    { who: "Leo", days: 12 },
    { who: "Priya", days: 4 },
    { who: "Ana", days: 0 },
  ],
  played: [
    { who: "Leo", marks: ["02002", "22222"] },
    { who: "Priya", marks: ["00100", "00010", "12000", "22002", "22222"] },
  ],
};
// @end params

type Source = { who: string; text: string; when: string };
type Board = { u: string; words: string[]; marks: string[]; done: 0 | 1 | 2; at: number; shared: boolean };
type State = {
  word: string;
  said: number;
  chat: string;
  no: number;
  day: string;
  source: Source;
  streaks: { u: string; days: number }[];
  boards: Board[];
  nudges: { from: string; to: string }[];
};
type Action = { t: "guess"; word: string } | { t: "share" } | { t: "nudge"; who: string };
type Local = { cur: string; bad: number; nudged: string; nt: number };

const ROWS = 6;
const MAX_NUDGES = 30;
const WORDS = ["CHATS", "TOAST", "COAST", "PASTA", "SALSA", "CLASS", "TACOS", "OCTAS"];
const FIVE = /^[A-Z]{5}$/;
const MARKS = /^[012]{5}$/;
const FADE = tween({ duration: 300, easing: "decelerate" });
const KEYS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "");
const wholeNum = (n: unknown, max = Infinity) => (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max ? n : 0);

/** Two-pass Wordle scoring: exact hits first, then near misses from what is left of the answer. */
function score(guess: string, answer: string): string {
  const out: string[] = ["0", "0", "0", "0", "0"];
  const pool: string[] = [];
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) out[i] = "2";
    else pool.push(answer[i] ?? "");
  }
  for (let i = 0; i < 5; i++) {
    if (out[i] === "2") continue;
    const k = pool.indexOf(guess[i] ?? "");
    if (k >= 0) {
      out[i] = "1";
      pool.splice(k, 1);
    }
  }
  return out.join("");
}

const rgbOf = (col: string): number[] => {
  if (col[0] === "#") {
    const n = parseInt(col.slice(1, 7), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  const m = col.match(/[\d.]+/g) ?? [];
  return [0, 1, 2].map((i) => Number(m[i] ?? 0));
};
const lum = (col: string) => {
  const [r, g, b] = rgbOf(col).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
/** The first of these inks that reads best on the fill. */
const inkOn = (fill: string, inks: string[]) => inks.reduce((best, x) => (ratio(x, fill) > ratio(best, fill) ? x : best), inks[0]!);

const boardOf = (s: State, u: string) => s.boards.find((b) => b.u === u);

function reduceChatdle(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  const user = meta.user;
  const mine = boardOf(s, user);
  if (a.t === "guess") {
    const w = typeof a.word === "string" ? a.word.toUpperCase() : "";
    if (!FIVE.test(w)) return s;
    if (mine && (mine.done !== 0 || mine.marks.length >= ROWS)) return s;
    const base: Board = mine ?? { u: user, words: [], marks: [], done: 0, at: 0, shared: false };
    const marks = [...base.marks, score(w, s.word)];
    const next: Board = { ...base, words: [...base.words, w], marks, at: meta.time, done: w === s.word ? 1 : marks.length === ROWS ? 2 : 0 };
    return { ...s, boards: mine ? s.boards.map((b) => (b.u === user ? next : b)) : [...s.boards, next] };
  }
  if (a.t === "share") {
    if (!mine || mine.done === 0 || mine.shared) return s;
    return { ...s, boards: s.boards.map((b) => (b.u === user ? { ...b, shared: true } : b)) };
  }
  if (a.t === "nudge") {
    const who = a.who;
    if (!mine || mine.done === 0 || typeof who !== "string" || who === user || !inChat(ctx, who) || boardOf(s, who)) return s;
    if (s.nudges.some((n) => n.from === user && n.to === who)) return s;
    return { ...s, nudges: [...s.nudges, { from: user, to: who }].slice(-MAX_NUDGES) };
  }
  return s;
}

const firstName = (members: { id: string; name?: string }[], id: string) => (members.find((m) => m.id === id)?.name ?? "").trim().split(/\s+/)[0] || "Someone";

export default defineApp<State, Action, Local>({
  name: "Chatdle",

  summary: (s) => `Chatdle #${s.no} · ${s.boards.filter((b) => b.done === 1).length} solved · ${s.boards.filter((b) => b.done === 0).length} playing`,

  init: (ctx) => {
    const match = (who: string) => {
      const want = who.trim().toLowerCase();
      return want ? ctx.members.find((m) => m.id === who || (m.name ?? "").toLowerCase() === want)?.id : undefined;
    };
    const word = typeof P.word === "string" && FIVE.test(P.word.toUpperCase()) ? P.word.toUpperCase() : "CHATS";
    const streaks: State["streaks"] = [];
    for (const x of P.streaks) {
      const u = match(x.who);
      if (u && !streaks.some((y) => y.u === u)) streaks.push({ u, days: wholeNum(x.days, 999) });
    }
    const boards: Board[] = [];
    for (const x of P.played) {
      const u = match(x.who);
      if (!u || boards.some((b) => b.u === u)) continue;
      const marks = x.marks.filter((m) => MARKS.test(m)).slice(0, ROWS);
      if (marks.length === 0) continue;
      const last = marks[marks.length - 1]!;
      if (marks.slice(0, -1).includes("22222")) continue;
      const done = last === "22222" ? 1 : marks.length === ROWS ? 2 : 0;
      if (done === 0) continue;
      boards.push({ u, words: [], marks, done, at: 0, shared: false });
    }
    return {
      word,
      said: wholeNum(P.said),
      chat: clip(P.chat, 16),
      no: wholeNum(P.no),
      day: clip(P.day, 4),
      source: { who: clip(P.source.who, 16), text: clip(P.source.text, 60), when: clip(P.source.when, 6) },
      streaks,
      boards,
      nudges: [],
    };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceChatdle(state, action as unknown as Record<string, unknown>, meta, ctx) : state),

  onMembers: (state, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    if (state.boards.every((b) => here(b.u)) && state.streaks.every((x) => here(x.u)) && state.nudges.every((n) => here(n.from) && here(n.to))) return state;
    return {
      ...state,
      boards: state.boards.filter((b) => here(b.u)),
      streaks: state.streaks.filter((x) => here(x.u)),
      nudges: state.nudges.filter((n) => here(n.from) && here(n.to)),
    };
  },

  invariants: {
    "one board each, people here": (s, ctx) => new Set(s.boards.map((b) => b.u)).size === s.boards.length && s.boards.every((b) => inChat(ctx, b.u)),
    "rows are scored": (s) => s.boards.every((b) => b.marks.length <= ROWS && b.marks.every((m) => MARKS.test(m))),
    "words match their marks": (s) => s.boards.every((b) => b.words.length === 0 || (b.words.length === b.marks.length && b.words.every((w, i) => score(w, s.word) === b.marks[i]))),
    "done is honest": (s) =>
      s.boards.every((b) =>
        b.done === 1 ? b.marks.at(-1) === "22222" : b.done === 2 ? b.marks.length === ROWS && b.marks.at(-1) !== "22222" : b.marks.length < ROWS && !b.marks.includes("22222"),
      ),
    "share after finishing": (s) => s.boards.every((b) => !b.shared || b.done !== 0),
    "nudges are unique and capped": (s) => s.nudges.length <= MAX_NUDGES && new Set(s.nudges.map((n) => `${n.from}|${n.to}`)).size === s.nudges.length && s.nudges.every((n) => n.from !== n.to),
    "streaks are whole days": (s, ctx) => s.streaks.every((x) => Number.isInteger(x.days) && x.days >= 0 && inChat(ctx, x.u)) && new Set(s.streaks.map((x) => x.u)).size === s.streaks.length,
    "the word is five letters": (s) => FIVE.test(s.word),
  },

  transitions: {
    "guess adds one scored row to my board": (p, n, a, m) => {
      if (a.t !== "guess" || n === p) return true;
      const before = boardOf(p, m.user);
      const after = boardOf(n, m.user);
      return !!after && after.marks.length === (before?.marks.length ?? 0) + 1 && after.marks.at(-1) === score(String(a.word).toUpperCase(), p.word) && after.at === m.time;
    },
    "guess leaves other boards alone": (p, n, a, m) =>
      a.t !== "guess" || n === p || (n.boards.length >= p.boards.length && p.boards.filter((b) => b.u !== m.user).every((b) => JSON.stringify(boardOf(n, b.u)) === JSON.stringify(b)) && JSON.stringify(p.nudges) === JSON.stringify(n.nudges)),
    "no guesses after finishing": (p, n, a, m) => {
      const before = boardOf(p, m.user);
      return a.t !== "guess" || !before || before.done === 0 || n === p;
    },
    "share flips only my flag": (p, n, a, m) => {
      if (a.t !== "share" || n === p) return true;
      const before = boardOf(p, m.user);
      const after = boardOf(n, m.user);
      return !!before && !!after && !before.shared && after.shared && JSON.stringify({ ...after, shared: false }) === JSON.stringify({ ...before, shared: false }) && p.boards.length === n.boards.length;
    },
    "nudge is from me to someone who has not played": (p, n, a, m) => {
      if (a.t !== "nudge" || n === p) return true;
      const last = n.nudges.at(-1);
      return !!last && last.from === m.user && last.to === a.who && !p.boards.some((b) => b.u === a.who) && boardOf(p, m.user)?.done !== 0 && JSON.stringify(p.boards) === JSON.stringify(n.boards);
    },
    "the word never changes": (p, n) => n.word === p.word && JSON.stringify(n.source) === JSON.stringify(p.source),
  },

  arbitrary: (s, user, r, ctx) => {
    const mine = boardOf(s, user);
    const k = r.next();
    if (!mine || mine.done === 0) {
      if (k < 0.85) return { t: "guess", word: r.pick(WORDS.concat([s.word])) };
      return { t: "guess", word: "TACO" };
    }
    const idle = ctx.members.filter((m) => m.id !== user && !boardOf(s, m.id));
    if (!mine.shared && k < 0.5) return { t: "share" };
    if (idle.length) return { t: "nudge", who: r.pick(idle).id };
    return mine.shared ? { t: "nudge", who: r.pick(ctx.members).id } : { t: "share" };
  },

  local: { cur: "", bad: 0, nudged: "", nt: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width;
    const inner = W - 24;
    const compact = W < 380;
    const s = state;
    const mine = boardOf(s, me);
    const finished = !!mine && mine.done !== 0;
    const name = (id: string) => firstName(members, id);
    const markFill = (m: string) => (m === "2" ? c.positive : m === "1" ? c.warning : c.secondaryButton);
    const markInk = (m: string) => (m === "0" ? c.text : inkOn(markFill(m), [p.dark, c.text, c.card]));

    // Row reveal from my board's `at`: cell i flips over 320 ms starting i * 160 ms; keys follow; a win bounces.
    const e = mine && mine.at > 0 ? running(mine.at, 1500) : null;
    const flip = (i: number) => (e === null ? 1 : Math.max(0, Math.min(1, (e - i * 160) / 320)));
    const lastRow = (mine?.marks.length ?? 0) - 1;
    const mineDays = (s.streaks.find((x) => x.u === me)?.days ?? 0) + (mine?.done === 1 ? 1 : 0);
    const popE = mine?.done === 1 && e !== null ? e - 960 : -1;
    const pop = popE >= 0 && popE < 400 ? 1 + 0.15 * Math.sin((popE / 400) * Math.PI) : 1;

    // ---- Header ----
    const flame = (size: number) => (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" style={{ flex: "none" }}>
        <path d="M7 .8c.8 2.6 4.2 3.8 4.2 7.6a4.2 4.2 0 0 1-8.4 0c0-1.8.9-3 1.9-3.9.1 1.1.7 1.9 1.5 2.2C6 5.3 6 2.8 7 .8z" fill={p.orange} />
        <path d="M7 7.4c.5 1.2 1.9 1.7 1.9 3.1a1.9 1.9 0 0 1-3.8 0c0-1 .6-1.6 1-2 .3.5.5.8.9.9-.1-.7 0-1.4 0-2z" fill={p.yellow} />
      </svg>
    );
    const streakLabel = mineDays === 0 ? "No streak yet" : `${mineDays}-day streak`;
    const header = (
      <div style={{ position: "relative", height: 44 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 24, paddingRight: 132 }}>
          <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
            <circle cx={8} cy={8} r={6.5} fill="none" stroke={c.primary} stroke-width="3" />
          </svg>
          <b style={{ fontSize: 15, lineHeight: "24px", fontWeight: 600, color: c.text }}>Chatdle</b>
          <span style={{ fontSize: 13, lineHeight: "24px", color: c.secondaryText, whiteSpace: "nowrap" }}>{`#${s.no} · ${s.day}`}</span>
        </div>
        <div style={{ position: "absolute", top: 0, right: 0, height: 24, display: "flex", alignItems: "center", gap: 4, padding: "0 10px", borderRadius: 12, background: c.selected, transform: `scale(${pop})`, transformOrigin: "right center" }}>
          {flame(14)}
          <span style={{ fontSize: 13, lineHeight: "24px", fontWeight: 600, color: c.link, whiteSpace: "nowrap" }}>{streakLabel}</span>
        </div>
        <div style={{ marginLeft: 24, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`Today's word was said ${s.said} times in ${s.chat}`}</div>
      </div>
    );

    // ---- Board ----
    const rowE = local.bad > 0 ? running(local.bad, 400) : null;
    const shake = rowE === null ? 0 : Math.sin((rowE / 1000) * 40) * 6 * (1 - rowE / 400);
    const typedRow = finished ? -1 : mine?.marks.length ?? 0;
    const board = (
      <div role="img" aria-label="Guess board" style={{ width: 176, display: "grid", gap: 4, flex: "none" }}>
        {Array.from({ length: ROWS }, (_, r) => (
          <div key={r} style={{ display: "grid", gridTemplateColumns: "repeat(5, 32px)", gap: 4, transform: r === typedRow && shake ? `translateX(${shake}px)` : undefined }}>
            {Array.from({ length: 5 }, (_, i) => {
              const scored = mine && r < mine.marks.length;
              const k = scored && r === lastRow ? flip(i) : 1;
              const revealed = scored && k >= 0.5;
              const letter = scored ? mine!.words[r]?.[i] ?? "" : r === typedRow ? local.cur[i] ?? "" : "";
              const mk = scored ? mine!.marks[r]![i]! : "0";
              const typed = r === typedRow && !!letter;
              const caret = r === typedRow && i === local.cur.length && !letter;
              const lift = mine?.done === 1 && r === lastRow && popE >= i * 80 && popE < i * 80 + 300 ? Math.sin(((popE - i * 80) / 300) * Math.PI) * 12 : 0;
              const style: Record<string, string | number> = {
                width: 32,
                height: 32,
                boxSizing: "border-box",
                borderRadius: 6,
                display: "grid",
                placeItems: "center",
                fontSize: 20,
                lineHeight: "24px",
                fontWeight: 700,
              };
              if (revealed) {
                style.background = markFill(mk);
                style.color = markInk(mk);
              } else if (scored || typed) {
                style.background = c.card;
                style.border = `2px solid ${mix(c.text, c.card, 0.3)}`;
                style.color = c.text;
              } else {
                style.background = c.input;
                style.border = caret ? `2px solid ${c.primary}` : `1.5px solid ${c.divider}`;
              }
              const sy = scored && r === lastRow && k < 1 ? Math.abs(1 - 2 * k) : 1;
              style.transform = `translateY(${-lift}px) scaleY(${sy})`;
              return (
                <span key={i} style={style}>
                  {letter}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );

    // ---- Friends panel ----
    const others = members.filter((m) => m.id !== me);
    const withBoard = others.filter((m) => boardOf(s, m.id)).sort((a, b) => (s.streaks.find((x) => x.u === b.id)?.days ?? 0) - (s.streaks.find((x) => x.u === a.id)?.days ?? 0));
    const ordered = [...withBoard, ...others.filter((m) => !boardOf(s, m.id))];
    const showN = ordered.length > 4 ? 3 : ordered.length;
    const shown = ordered.slice(0, showN);
    const extra = ordered.length - shown.length;
    const panelW = inner - 176 - 12;
    const friend = (m: Member, idx: number) => {
      const b = boardOf(s, m.id);
      const days = s.streaks.find((x) => x.u === m.id)?.days ?? 0;
      const sub = b ? (b.done === 0 ? "Playing" : `${days} · ${b.marks.length}/${ROWS}`) : "Hasn't played";
      const fe = finished && mine!.at > 0 ? running(mine!.at, 1500 + idx * 120) : null;
      const reveal = fe === null ? 1 : FADE(Math.max(0, fe - 1100 - idx * 120));
      return (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, height: 38 }}>
          <Avatar user={m} size={24} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: "block", fontSize: 13, lineHeight: "16px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</b>
            <span style={{ display: "block", fontSize: 11, lineHeight: "14px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {b && b.done !== 0 ? <span style={{ display: "inline-block", verticalAlign: "-1px", marginRight: 3 }}>{flame(10)}</span> : null}
              {sub}
            </span>
          </div>
          {!compact && b ? (
            <span style={{ position: "relative", flex: "none", display: "grid", gridTemplateColumns: "repeat(5, 5px)", gap: 1 }} aria-hidden="true">
              {b.marks.flatMap((row, r) => row.split("").map((mk, i) => <i key={`${r}${i}`} style={{ width: 5, height: 5, borderRadius: 1, background: finished ? mix(c.divider, markFill(mk), reveal) : c.divider }} />))}
            </span>
          ) : null}
        </div>
      );
    };
    const panel = (
      <div style={{ width: panelW, boxSizing: "border-box", height: 212, padding: "10px 12px", borderRadius: 12, background: c.wash, overflow: "hidden", minWidth: 0 }}>
        <b style={{ display: "block", fontSize: 13, lineHeight: "16px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${s.chat} today`}</b>
        <span style={{ display: "block", fontSize: 11, lineHeight: "14px", color: c.secondaryText }}>{finished ? "Grids unlocked" : "Solve to peek at grids"}</span>
        <div style={{ height: 1, background: c.divider, margin: "6px 0 2px" }} />
        {shown.map(friend)}
        {extra > 0 ? (
          <div style={{ paddingTop: 4 }}>
            <More n={extra} />
          </div>
        ) : null}
        {!others.length ? <span style={{ display: "block", paddingTop: 6, fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>Just you so far</span> : !withBoard.length ? <span style={{ display: "none" }}>No one has played yet</span> : null}
      </div>
    );

    // ---- Keyboard / input ----
    const best: Record<string, string> = {};
    if (mine) {
      mine.words.forEach((w, r) => {
        for (let i = 0; i < 5; i++) {
          if (r === lastRow && e !== null && e < i * 160 + 320) continue;
          const mk = mine.marks[r]![i]!;
          const L = w[i]!;
          if (best[L] === undefined || mk > best[L]!) best[L] = mk;
        }
      });
    }
    const submit = () => {
      if (local.cur.length === 5) {
        if (local.cur === s.word) haptic("success");
        dispatch({ t: "guess", word: local.cur });
        setLocal({ cur: "" });
      } else {
        setLocal({ bad: clock.value });
      }
    };
    const type = (L: string) => {
      if (local.cur.length < 5) setLocal({ cur: local.cur + L });
    };
    const pitch = inner / 10;
    const key = (label: string, width: number, kind: "letter" | "enter" | "del") => {
      const L = kind === "letter" ? label : "";
      const mk = L ? best[L] : undefined;
      const enterOn = kind === "enter" && local.cur.length === 5;
      const bg = enterOn ? c.primary : mk === undefined ? c.secondaryButton : mk === "0" ? mix(c.secondaryText, c.card, theme.mode === "dark" ? 0.72 : 0.45) : markFill(mk);
      const ink = enterOn ? c.onPrimary : mk === "1" || mk === "2" ? markInk(mk) : mk === "0" ? inkOn(bg, [c.text, c.card, p.dark]) : c.text;
      return (
        <button
          key={label}
          type="button"
          class="m-hit"
          aria-label={kind === "del" ? "Delete" : kind === "enter" ? "Enter" : label}
          onClick={() => (kind === "enter" ? submit() : kind === "del" ? setLocal({ cur: local.cur.slice(0, -1) }) : type(label))}
          style={{ position: "relative", flex: "none", width, height: 36, padding: 0, border: 0, background: "none" }}
        >
          <span style={{ position: "absolute", inset: "0 2px", borderRadius: 8, background: bg, color: ink, display: "grid", placeItems: "center", fontSize: kind === "enter" ? 13 : 15, fontWeight: 600 }}>
            {kind === "del" ? (
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
                <path d="M4 12l6-7h11v14H10z" />
                <path d="M13 9.5l5 5M18 9.5l-5 5" />
              </svg>
            ) : (
              label
            )}
          </span>
        </button>
      );
    };
    const keyboard = (
      <div style={{ display: "grid", gap: 4, height: 116 }}>
        <div style={{ display: "flex" }}>{KEYS[0]!.split("").map((L) => key(L, pitch, "letter"))}</div>
        <div style={{ display: "flex", paddingLeft: pitch / 2 }}>{KEYS[1]!.split("").map((L) => key(L, pitch, "letter"))}</div>
        <div style={{ display: "flex" }}>
          {key("Enter", pitch * 1.5, "enter")}
          {KEYS[2]!.split("").map((L) => key(L, pitch, "letter"))}
          {key("Delete", pitch * 1.5, "del")}
        </div>
      </div>
    );
    const inputRow = (
      <form
        style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        <input style={{ flex: 1, minWidth: 0, textTransform: "uppercase" }} value={local.cur} maxLength={5} aria-label="Your guess" placeholder="Five letters" onInput={(ev) => setLocal({ cur: ev.currentTarget.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) })} />
        <Button kind="primary" onClick={submit}>
          Guess
        </Button>
      </form>
    );

    // ---- Receipt ----
    const src = s.source;
    const srcMember = src.who ? members.find((m) => m.id === src.who || (m.name ?? "").toLowerCase() === src.who.toLowerCase()) : undefined;
    const idle = members.find((m) => m.id !== me && !boardOf(s, m.id) && !s.nudges.some((n) => n.from === me && n.to === m.id));
    const nudgedAny = s.nudges.some((n) => n.from === me);
    const receipt = mine ? (
      <div style={{ boxSizing: "border-box", minHeight: 116, padding: "10px 14px", borderRadius: 12, background: c.wash }}>
        <b style={{ display: "block", fontSize: 19, lineHeight: "24px", fontWeight: 700, color: c.text }}>{mine.done === 1 ? `Solved in ${mine.marks.length}/${ROWS}` : `So close. It was ${s.word}`}</b>
        <span style={{ display: "block", fontSize: 12, lineHeight: "14px", color: c.secondaryText }}>Where today's word came from</span>
        {src.text ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "5px 0 4px" }}>
            {srcMember ? <Avatar user={srcMember} size={22} /> : null}
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "4px 10px", borderRadius: 14, background: c.secondaryButton }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src.text}</span>
              <span style={{ flex: "none", fontSize: 11, lineHeight: "16px", color: c.text }}>{src.when}</span>
            </div>
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36 }}>
          {mine.shared ? (
            <Chip tone="positive">Shared</Chip>
          ) : (
            <Button kind="primary" onClick={() => dispatch({ t: "share" })}>
              Share
            </Button>
          )}
          {idle ? (
            <Button
              onClick={() => {
                setLocal({ nudged: idle.name ?? "", nt: clock.value });
                dispatch({ t: "nudge", who: idle.id });
              }}
            >
              {`Nudge ${name(idle.id)}`}
            </Button>
          ) : nudgedAny ? (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>Nudged</span>
          ) : null}
        </div>
      </div>
    ) : null;

    const toastSolve = mine?.done === 1 && mine.at > 0 && running(mine.at, 2400) !== null;
    const toastNudge = local.nt > 0 && running(local.nt, 2400) !== null;
    return (
      <div>
        {header}
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          {board}
          {panel}
        </div>
        <div style={{ marginTop: 8 }}>{finished ? receipt : compact ? inputRow : keyboard}</div>
        {toastNudge ? <Toast key={`n${local.nt}`}>{`Nudged ${local.nudged.split(" ")[0]}`}</Toast> : toastSolve ? <Toast key={`s${mine!.at}`}>{`Solved · ${mineDays}-day streak`}</Toast> : null}
      </div>
    );
  },
});
