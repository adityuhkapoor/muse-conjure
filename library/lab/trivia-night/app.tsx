import {
  defineApp,
  Avatar,
  Button,
  Burst,
  CardHeader,
  Facepile,
  More,
  clock,
  haptic,
  mix,
  path,
  rng,
  running,
  spring,
  springs,
  tween,
  type Ctx,
  type Meta,
} from "@muse/app";

// Trivia night: two teams from the chat race to buzz on questions about each other. A miss hands
// the other team a steal; after the last question the losers buy the wings. The questions and the
// receipts all come from the chat, so Muse never invents a fact.

type Params = {
  teams: { name: string; people: string[] }[];
  questions: { about: string; q: string; opts: string[]; answer: number; note: string }[];
  stake: string;
  where: string;
};

// @params
const P: Params = {
  teams: [
    { name: "Aux Cords", people: ["Maya", "Noa", "Dev"] },
    { name: "Late Again", people: ["Jonah", "Priya", "Theo"] },
  ],
  questions: [
    { about: "Dev", q: "How many times has Dev said “last one, I swear” this month?", opts: ["3", "7", "12", "19"], answer: 2, note: "12 times. There were 14 last ones." },
    { about: "Jonah", q: "Whose Uber rating is a 4.62?", opts: ["Maya", "Jonah", "Theo", "Noa"], answer: 1, note: "He slammed one door. One door." },
    { about: "Theo", q: "What did Theo name his car?", opts: ["Big Sauce", "The Tank", "Shirley", "Lightning"], answer: 2, note: "Shirley: 212k miles and a cassette deck." },
    { about: "the chat", q: "Most-sent reaction in this chat?", opts: ["Skull", "Crying laughing", "The goat", "Thumbs up"], answer: 0, note: "4,812 skulls since 2022." },
    { about: "Noa", q: "Who left the chat in 2023 and rejoined 9 minutes later?", opts: ["Dev", "Priya", "Theo", "Noa"], answer: 3, note: "She said it was an accident. It was not." },
  ],
  stake: "the wings",
  where: "Thursday at Buffalo Joe's",
};
// @end params

type Side = 0 | 1;
type Question = { about: string; q: string; opts: string[]; ans: number; note: string; by: string };
type Phase = "open" | "floor" | "steal" | "done";
type State = {
  teams: { name: string; people: string[] }[];
  qs: Question[];
  i: number;
  phase: Phase;
  qAt: number;
  buzz: { side: Side; user: string } | null;
  picks: { user: string; side: Side; opt: number }[];
  scores: number[];
  log: { side: Side | -1; pts: number }[];
  at: number;
  stake: string;
  where: string;
};
type Action =
  | { t: "buzz" }
  | { t: "answer"; opt: number }
  | { t: "next" }
  | { t: "rematch" }
  | { t: "add"; q: string; right: string; wrong: string[] };
type Local = { q: string; right: string; wrong: string; err: boolean; bursts: number };

const MAX_QS = 10;
const POP = spring(springs.iosBouncy);
const RISE = spring(springs.ios);
const SHAKE = tween({ duration: 400, easing: "standard" });
const CHECK = "M2.5 6.2 5 8.6l4.5-5";
const CROSS = "M3 3l6 6M9 3 3 9";

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const trim = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const sideOf = (s: State, u: string): Side | -1 => (s.teams[0]!.people.includes(u) ? 0 : s.teams[1]!.people.includes(u) ? 1 : -1);
const over = (s: State) => s.qs.length > 0 && s.i === s.qs.length;
const current = (s: State): Question | null => (s.i >= 0 && s.i < s.qs.length ? s.qs[s.i]! : null);
const teamName = (s: State, k: number) => s.teams[k]?.name || `Team ${k + 1}`;

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function balanceTeams(teams: { name: string; people: string[] }[], members: Ctx["members"]): { name: string; people: string[] }[] {
  const placed = new Set(teams.flatMap((t) => t.people));
  for (const m of members) {
    if (placed.has(m.id)) continue;
    placed.add(m.id);
    const k = teams[0]!.people.length <= teams[1]!.people.length ? 0 : 1;
    teams[k]!.people.push(m.id);
  }
  return teams;
}

function initTeams(ctx: Ctx): { name: string; people: string[] }[] {
  const used = new Set<string>();
  const teams = [0, 1].map((k) => {
    const p = P.teams[k];
    const name = clean(p?.name, 24) || `Team ${k + 1}`;
    const people: string[] = [];
    for (const want of p?.people ?? []) {
      const key = typeof want === "string" ? want.trim().toLowerCase() : "";
      const m = ctx.members.find((x) => (x.id === want || (key && x.name.trim().toLowerCase() === key)) && !used.has(x.id));
      if (!m) continue;
      used.add(m.id);
      people.push(m.id);
    }
    return { name, people };
  });
  return balanceTeams(teams, ctx.members);
}

function initQuestions(): Question[] {
  const out: Question[] = [];
  for (const q of P.questions) {
    if (out.length >= MAX_QS) break;
    const text = trim(q?.q, 160);
    if (!text) continue;
    const opts = Array.isArray(q?.opts) ? q.opts.map((o) => trim(o, 40)).filter(Boolean) : [];
    if (opts.length < 2 || opts.length > 4) continue;
    if (!Number.isInteger(q?.answer) || q.answer < 0 || q.answer >= opts.length) continue;
    out.push({ about: typeof q.about === "string" ? q.about.trim() : "", q: text, opts, ans: q.answer, note: typeof q.note === "string" ? q.note : "", by: "" });
  }
  return out;
}

// ---- Reducer ----

function reduceTrivia(s: State, a: Record<string, unknown>, m: Meta, ctx: Ctx): State {
  const user = m.user;
  if (!inChat(ctx, user)) return s;

  if (a.t === "add") {
    const q = trim(a.q, 160);
    const right = trim(a.right, 40);
    if (s.qs.length >= MAX_QS || !q || !right) return s;
    if (!Array.isArray(a.wrong) || a.wrong.length < 1 || a.wrong.length > 3) return s;
    const wrong: string[] = [];
    for (const w of a.wrong) {
      const t = trim(w, 40);
      if (!t) return s;
      wrong.push(t);
    }
    const keys = [right, ...wrong].map((x) => x.toLowerCase());
    if (new Set(keys).size !== keys.length) return s;
    const slot = rng(m.seed).int(wrong.length + 1);
    const opts = [...wrong.slice(0, slot), right, ...wrong.slice(slot)];
    const qs = [...s.qs, { about: "", q, opts, ans: slot, note: "", by: user }];
    if (s.i === s.qs.length) return { ...s, qs, phase: "open", buzz: null, picks: [], qAt: m.time };
    return { ...s, qs };
  }

  const side = sideOf(s, user);
  if (side === -1) return s;

  if (a.t === "buzz") {
    if (s.phase !== "open" || over(s) || s.qs.length === 0) return s;
    return { ...s, phase: "floor", buzz: { side, user } };
  }

  if (a.t === "answer") {
    const q = current(s);
    if (!q || typeof a.opt !== "number" || !Number.isInteger(a.opt) || a.opt < 0 || a.opt >= q.opts.length) return s;
    if (s.phase === "floor") {
      if (!s.buzz || s.buzz.side !== side || s.picks.length !== 0) return s;
    } else if (s.phase === "steal") {
      if (!s.buzz || s.buzz.side === side || s.picks.length !== 1 || a.opt === s.picks[0]!.opt) return s;
    } else return s;
    const picks = [...s.picks, { user, side, opt: a.opt }];
    if (a.opt === q.ans) {
      const pts = s.phase === "steal" ? 150 : 100;
      const scores = [...s.scores];
      scores[side] = (scores[side] ?? 0) + pts;
      return { ...s, picks, scores, phase: "done", log: [...s.log, { side, pts }], at: m.time };
    }
    if (s.phase === "floor" && s.teams[1 - side]!.people.length > 0) return { ...s, picks, phase: "steal", at: m.time };
    return { ...s, picks, phase: "done", log: [...s.log, { side: -1, pts: 0 }], at: m.time };
  }

  if (a.t === "next") {
    if (s.phase !== "done" || over(s)) return s;
    const i = s.i + 1;
    return { ...s, i, buzz: null, picks: [], qAt: m.time, phase: i === s.qs.length ? "done" : "open" };
  }

  if (a.t === "rematch") {
    if (!over(s)) return s;
    return { ...s, i: 0, phase: "open", buzz: null, picks: [], scores: [0, 0], log: [], qAt: m.time, at: m.time };
  }

  return s;
}

export default defineApp<State, Action, Local>({
  name: "Trivia night",

  summary: (s) => {
    if (s.qs.length === 0) return "Trivia night · no questions yet";
    if (over(s)) {
      const [a, b] = s.scores;
      if (a === b) return `Tied at ${a}`;
      return a! > b! ? `${teamName(s, 0)} won ${a} to ${b}` : `${teamName(s, 1)} won ${b} to ${a}`;
    }
    return `Trivia night · ${teamName(s, 0)} ${s.scores[0]}, ${teamName(s, 1)} ${s.scores[1]} · question ${Math.min(s.i + 1, s.qs.length)} of ${s.qs.length}`;
  },

  init: (initCtx) => ({
    teams: initTeams(initCtx),
    qs: initQuestions(),
    i: 0,
    phase: "open",
    qAt: 0,
    buzz: null,
    picks: [],
    scores: [0, 0],
    log: [],
    at: 0,
    stake: typeof P.stake === "string" ? P.stake : "",
    where: typeof P.where === "string" ? P.where : "",
  }),

  reduce: (state, action, meta, ctx) => reduceTrivia(state, action as unknown as Record<string, unknown>, meta, ctx),

  onMembers: (state, ctx) => {
    const here = new Set(ctx.members.map((m) => m.id));
    const teams = state.teams.map((t) => ({ ...t, people: t.people.filter((u) => here.has(u)) }));
    balanceTeams(teams, ctx.members);
    let phase = state.phase;
    let buzz = state.buzz;
    let log = state.log;
    if (phase === "floor" && buzz && !here.has(buzz.user)) {
      phase = "open";
      buzz = null;
    }
    if (phase === "steal" && buzz && teams[1 - buzz.side]!.people.length === 0) {
      phase = "done";
      log = [...log, { side: -1, pts: 0 }];
    }
    return { ...state, teams, phase, buzz, log };
  },

  invariants: {
    "two teams, everyone on one at most": (s) => {
      const all = s.teams.flatMap((t) => t.people);
      return s.teams.length === 2 && new Set(all).size === all.length;
    },
    "team members are in the chat": (s, ctx) => s.teams.every((t) => t.people.every((u) => inChat(ctx, u))),
    "everyone in the chat has a team": (s, ctx) => ctx.members.every((m) => s.teams.some((t) => t.people.includes(m.id))),
    "scores are the sum of the log": (s) => [0, 1].every((k) => s.scores[k] === s.log.filter((e) => e.side === k).reduce((t, e) => t + e.pts, 0)),
    "points are 0, 100 or 150": (s) => s.log.every((e) => (e.side === -1 ? e.pts === 0 : e.pts === 100 || e.pts === 150)),
    "one log entry per resolved question": (s) => s.log.length === Math.min(s.qs.length, s.i + (s.phase === "done" ? 1 : 0)),
    "phase matches buzz and picks": (s) => {
      if (s.qs.length === 0 || s.i >= s.qs.length) return true;
      const q = s.qs[s.i]!;
      if (s.phase === "open") return s.buzz === null && s.picks.length === 0;
      if (s.phase === "floor") return s.buzz !== null && s.picks.length === 0;
      if (s.phase === "steal") return s.buzz !== null && s.picks.length === 1 && s.picks[0]!.side === s.buzz.side && s.picks[0]!.opt !== q.ans;
      return true;
    },
    "picks are real options from different teams": (s) => {
      if (s.qs.length === 0) return s.picks.length === 0;
      const q = s.qs[Math.min(s.i, s.qs.length - 1)]!;
      return s.picks.length <= 2 && s.picks.every((p) => Number.isInteger(p.opt) && p.opt >= 0 && p.opt < q.opts.length) && new Set(s.picks.map((p) => p.side)).size === s.picks.length;
    },
    "index in range": (s) => {
      if (s.i < 0 || s.i > s.qs.length) return false;
      if (s.qs.length === 0) return s.i === 0 && s.phase === "open";
      return s.i === s.qs.length ? s.phase === "done" : true;
    },
    "questions are well formed": (s) =>
      s.qs.length <= MAX_QS &&
      s.qs.every(
        (q) =>
          typeof q.q === "string" &&
          q.q.length > 0 &&
          typeof q.about === "string" &&
          typeof q.note === "string" &&
          typeof q.by === "string" &&
          q.opts.length >= 2 &&
          q.opts.length <= 4 &&
          q.opts.every((o) => typeof o === "string" && o.length > 0) &&
          Number.isInteger(q.ans) &&
          q.ans >= 0 &&
          q.ans < q.opts.length,
      ),
  },

  transitions: {
    "a buzz gives the floor to the buzzer's team": (p, n, a, m) =>
      a.t !== "buzz" || p === n || (p.phase === "open" && n.phase === "floor" && n.buzz?.user === m.user && n.buzz.side === sideOf(p, m.user)),
    "only the floor team answers first, only the other team steals": (p, n, a, m) =>
      a.t !== "answer" ||
      p === n ||
      (p.phase === "floor" && !!p.buzz && sideOf(p, m.user) === p.buzz.side) ||
      (p.phase === "steal" && !!p.buzz && sideOf(p, m.user) === 1 - p.buzz.side),
    "a right answer scores 100, or 150 on a steal; a wrong one scores nothing": (p, n, a, m) => {
      if (a.t !== "answer" || p === n) return true;
      const q = current(p);
      if (!q || typeof a.opt !== "number") return true;
      const side = sideOf(p, m.user);
      if (side === -1) return true;
      if (a.opt !== q.ans) return n.scores[0] === p.scores[0] && n.scores[1] === p.scores[1];
      const pts = p.phase === "steal" ? 150 : 100;
      return n.scores[side] === p.scores[side]! + pts && n.scores[1 - side] === p.scores[1 - side];
    },
    "a wrong first answer opens a steal when the other team has someone": (p, n, a, m) => {
      if (a.t !== "answer" || p === n || p.phase !== "floor") return true;
      const q = current(p);
      if (!q || typeof a.opt !== "number" || a.opt === q.ans || sideOf(p, m.user) === -1) return true;
      const other = 1 - sideOf(p, m.user);
      return p.teams[other]!.people.length > 0 ? n.phase === "steal" : n.phase === "done";
    },
    "next moves on one question, only when it is done": (p, n, a, m) =>
      a.t !== "next" || p === n || (p.phase === "done" && n.i === p.i + 1 && n.qAt === m.time && n.picks.length === 0),
    "questions are append only": (p, n, a) =>
      n.qs.length >= p.qs.length &&
      p.qs.every((q, i) => JSON.stringify(q) === JSON.stringify(n.qs[i])) &&
      n.qs.length - p.qs.length === (a.t === "add" && p !== n ? 1 : 0),
    "rematch only after the final": (p, n, a) => a.t !== "rematch" || p === n || (over(p) && n.i === 0 && n.scores[0]! + n.scores[1]! === 0),
    "a resolution stamps the time": (p, n, a, m) => a.t !== "answer" || n.log.length === p.log.length || n.at === m.time,
    "only people in the chat change the game": (p, n, a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _user, r) => {
    const add = (): Action => ({ t: "add", q: "Who is always late?", right: r.pick(["Noa", "Dev"]), wrong: ["Maya", "Theo"] });
    if (s.qs.length < MAX_QS && r.next() < 0.03) return add();
    if (s.qs.length === 0) return add();
    if (over(s)) return r.next() < 0.7 ? { t: "rematch" } : add();
    const q = s.qs[s.i];
    if (!q) return add();
    if (s.phase === "open") return r.next() < 0.9 ? { t: "buzz" } : { t: "next" };
    if (s.phase === "done") return r.next() < 0.85 ? { t: "next" } : { t: "answer", opt: r.int(q.opts.length) };
    return { t: "answer", opt: r.int(q.opts.length) };
  },

  local: { q: "", right: "", wrong: "", err: false, bursts: 0 },

  view: ({ confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const s = confirmed;
    const c = theme.color;
    const W = theme.width;
    const compact = W <= 320;
    const mySide = sideOf(s, me);
    const T = mySide === 1 ? 1 : 0;
    const O = 1 - T;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name?.trim() || "Someone";
    const firstName = (id: string) => nameOf(id).split(/\s+/)[0]?.slice(0, 14) || "Someone";
    const overNow = over(s);
    const cur = current(s);
    const lastLog = s.log[s.log.length - 1];
    const empty = s.qs.length === 0;
    const sub = empty ? "Add a question to start" : overNow ? `${teamName(s, 0)} vs ${teamName(s, 1)} · final` : `${teamName(s, 0)} vs ${teamName(s, 1)} · ${Math.min(s.i + 1, s.qs.length)} of ${s.qs.length}`;
    const now = s.phase === "open" ? clock.value : 0;

    const canAnswer = (k: number) => {
      if (!cur || s.phase === "floor") return !!cur && !!s.buzz && s.buzz.side === mySide && s.picks.length === 0;
      if (s.phase === "steal") return !!s.buzz && s.buzz.side !== mySide && s.picks.length === 1 && k !== s.picks[0]!.opt;
      return false;
    };

    const answer = (k: number) => {
      if (cur && k === cur.ans && canAnswer(k)) {
        setLocal({ bursts: local.bursts + 1 });
        haptic("success");
      }
      dispatch({ t: "answer", opt: k });
    };

    const shakeX = (k: number) => {
      const pick = s.picks.find((x) => x.opt === k);
      if (!pick || !cur || k === cur.ans || !s.at) return 0;
      const e = running(s.at, 400);
      if (e === null) return 0;
      const t = SHAKE(e);
      return Math.sin(t * Math.PI * 4) * 8 * (1 - t);
    };

    const scoreCell = (side: number) => {
      const pop = lastLog && lastLog.side === side ? running(s.at, 500) : null;
      const scale = pop === null ? 1 : 1 + 0.35 * Math.sin(POP(pop) * Math.PI);
      const leading = s.scores[side]! > s.scores[1 - side]!;
      return (
        <span style={{ display: "inline-block", width: 40, textAlign: "center", fontSize: 22, lineHeight: "28px", fontWeight: 700, color: leading ? c.primary : c.text, transform: `scale(${scale})` }}>
          {String(s.scores[side] ?? 0)}
        </span>
      );
    };

    const teamCell = (side: number) => (
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: side === 1 ? "flex-end" : "flex-start", justifyContent: "center" }}>
        <Facepile users={s.teams[side]?.people ?? []} max={3} size={20} />
        <span style={{ display: "block", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>
          {teamName(s, side)}
        </span>
      </div>
    );

    const scoreboard = (
      <div
        style={{
          height: 56,
          boxSizing: "border-box",
          padding: "8px 12px",
          borderRadius: 12,
          background: c.wash,
          display: "grid",
          gridTemplateColumns: "1fr auto auto auto 1fr",
          alignItems: "center",
        }}
      >
        {teamCell(0)}
        {scoreCell(0)}
        <span style={{ width: 40, textAlign: "center", fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>vs</span>
        {scoreCell(1)}
        {teamCell(1)}
      </div>
    );

    const answerGrid = cur ? (
      <div style={{ position: "relative", height: 86, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "40px 40px", columnGap: 8, rowGap: 6 }}>
        {cur.opts.map((label, k) => {
          const pick = s.picks.find((x) => x.opt === k);
          const right = k === cur.ans;
          const reveal = s.phase === "done";
          const can = canAnswer(k);
          const strong = right && pick && pick.side === mySide;
          const fillInk = theme.mode === "dark" ? c.card : c.onPrimary;
          const tone: { fill: string; ink: string; mark: "check" | "cross" | "small" | "idle" } = strong
            ? { fill: c.positive, ink: fillInk, mark: "check" }
            : pick && !right
              ? { fill: c.negative, ink: fillInk, mark: "cross" }
              : right && reveal && !pick
                ? { fill: mix(c.card, c.positive, 0.2), ink: c.text, mark: "small" }
                : can
                  ? { fill: c.wash, ink: c.text, mark: "idle" }
                  : { fill: c.wash, ink: c.secondaryText, mark: "idle" };
          const size = compact || label.length > 18 ? 13 : 15;
          return (
            <button
              key={k}
              type="button"
              aria-label={`Answer ${label}`}
              onClick={() => answer(k)}
              style={{
                position: "relative",
                width: "100%",
                height: 44,
                alignSelf: "center",
                border: 0,
                padding: 0,
                background: "none",
                cursor: "pointer",
                opacity: pending ? 0.72 : 1,
                transform: `translateX(${shakeX(k)}px)`,
              }}
            >
              <span
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  height: 40,
                  boxSizing: "border-box",
                  borderRadius: 20,
                  padding: "0 40px 0 16px",
                  background: tone.fill,
                  color: tone.ink,
                  textAlign: "left",
                  fontSize: size,
                  lineHeight: size === 13 ? "16px" : "18px",
                  fontWeight: 400,
                }}
              >
                <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis", wordBreak: "break-word" }}>{label}</span>
                {pick ? (
                  <span style={{ position: "absolute", right: 40, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                    <Avatar user={pick.user} size={20} />
                  </span>
                ) : null}
                <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                  {tone.mark === "check" ? (
                    <span style={{ width: 20, height: 20, borderRadius: 10, background: c.onPrimary, display: "grid", placeItems: "center" }}>
                      <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        {path(CHECK, "none", { stroke: c.positive, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" })}
                      </svg>
                    </span>
                  ) : tone.mark === "cross" ? (
                    <span style={{ width: 20, height: 20, borderRadius: 10, background: c.onPrimary, display: "grid", placeItems: "center" }}>
                      <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        {path(CROSS, "none", { stroke: c.negative, "stroke-width": 2.2, "stroke-linecap": "round" })}
                      </svg>
                    </span>
                  ) : tone.mark === "small" ? (
                    <span style={{ width: 16, height: 16, borderRadius: 8, background: c.positive, display: "grid", placeItems: "center" }}>
                      <svg width={10} height={10} viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        {path(CHECK, "none", { stroke: c.onPrimary, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" })}
                      </svg>
                    </span>
                  ) : (
                    <span style={{ width: 18, height: 18, borderRadius: 9, boxSizing: "border-box", border: `1px solid ${c.divider}` }} />
                  )}
                </span>
              </span>
            </button>
          );
        })}
        {local.bursts ? (
          <div style={{ position: "absolute", left: "50%", top: 30, width: 0 }}>
            <Burst key={local.bursts} />
          </div>
        ) : null}
      </div>
    ) : null;

    const buzzerName = s.buzz ? (s.buzz.user === me ? "You" : nameOf(s.buzz.user)) : "Someone";
    const canBuzz = s.phase === "open" && mySide !== -1;
    const myFloor = s.buzz !== null && s.buzz.side === mySide;
    const barElapsed = s.qAt > 0 ? Math.min(1, Math.max(0, (s.phase === "open" ? clock.value : 0) - s.qAt) / 20000) : 0;

    const panel = (() => {
      if (s.phase === "open") {
        return (
          <div style={{ flex: 1, minWidth: 0, height: 80, position: "relative", borderRadius: 12, padding: 12, background: c.wash, boxSizing: "border-box" }}>
            <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${teamName(s, O)} is thinking…`}</div>
            <div style={{ marginTop: 4 }}>
              <Facepile users={s.teams[O]?.people ?? []} max={3} size={20} />
            </div>
            <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, height: 6, borderRadius: 3, background: c.track, overflow: "hidden" }}>
              <div style={{ width: `${barElapsed * 100}%`, height: 6, borderRadius: 3, background: barElapsed > 0.7 ? c.negative : c.warning }} />
            </div>
          </div>
        );
      }
      if (s.phase === "floor" && myFloor) {
        return (
          <div style={{ flex: 1, minWidth: 0, height: 80, borderRadius: 12, padding: 12, background: c.wash, boxSizing: "border-box" }}>
            <div style={{ fontSize: 15, lineHeight: "18px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.buzz?.user === me ? "You have the floor" : `${buzzerName} has the floor`}</div>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${teamName(s, O)} is locked out`}</div>
            <div style={{ marginTop: 2 }}>
              <Facepile users={s.teams[O]?.people ?? []} max={3} size={20} />
            </div>
          </div>
        );
      }
      if (s.phase === "floor") {
        return (
          <div style={{ flex: 1, minWidth: 0, height: 80, borderRadius: 12, padding: 12, background: c.wash, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10 }}>
            {s.buzz ? <Avatar user={s.buzz.user} size={36} /> : null}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, lineHeight: "18px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${buzzerName} buzzed first`}</div>
              <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>Too slow this time</div>
            </div>
          </div>
        );
      }
      if (s.phase === "steal" && mySide !== s.buzz?.side) {
        return (
          <div style={{ flex: 1, minWidth: 0, height: 80, borderRadius: 12, padding: 12, background: c.wash, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10 }}>
            {s.buzz ? <Avatar user={s.buzz.user} size={36} /> : null}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, lineHeight: "18px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Wrong. Steal it.</div>
              <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Tap the right one for 150</div>
            </div>
          </div>
        );
      }
      if (s.phase === "steal") {
        return (
          <div style={{ flex: 1, minWidth: 0, height: 80, borderRadius: 12, padding: 12, background: c.wash, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10 }}>
            {s.buzz ? <Avatar user={s.buzz.user} size={36} /> : null}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, lineHeight: "18px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${buzzerName} missed`}</div>
              <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${teamName(s, O)} can steal for 150`}</div>
            </div>
          </div>
        );
      }
      const head = !lastLog || lastLog.side === -1 ? "Nobody scores" : `+${lastLog.pts} ${teamName(s, lastLog.side)}`;
      return (
        <div style={{ flex: 1, minWidth: 0, height: 80, borderRadius: 12, padding: 12, background: c.wash, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, lineHeight: "18px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{head}</div>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{cur?.note ?? ""}</div>
          </div>
          <div style={{ flex: "0 0 68px" }}>
            <Button kind="primary" wide onClick={() => dispatch({ t: "next" })}>
              {s.i + 1 === s.qs.length ? "Final" : "Next"}
            </Button>
          </div>
        </div>
      );
    })();

    const buzzRow = (
      <div style={{ display: "flex", alignItems: "center", gap: 12, height: 80 }}>
        <button
          type="button"
          aria-label="Buzz in"
          onClick={() => dispatch({ t: "buzz" })}
          style={{ width: 80, height: 80, flex: "0 0 80px", background: "none", border: 0, padding: 0, display: "grid", placeItems: "center", cursor: "pointer" }}
        >
          <span
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              display: "grid",
              placeItems: "center",
              background: canBuzz ? c.primary : myFloor ? c.selected : c.secondaryButton,
              color: canBuzz ? c.onPrimary : myFloor ? (theme.mode === "dark" ? c.link : mix(c.primary, c.text, 0.1)) : c.secondaryButtonText,
              fontSize: myFloor ? 13 : 15,
              fontWeight: 600,
              transform: canBuzz ? `scale(${1 + 0.03 * Math.sin(now / 250)})` : "scale(1)",
            }}
          >
            {canBuzz ? (pending ? "Buzzing" : "Buzz") : myFloor ? "Buzzed" : "Buzz"}
          </span>
        </button>
        {panel}
      </div>
    );

    const play = (
      <>
        <small style={{ display: "block", height: 18, lineHeight: "18px" }}>{cur?.by ? `Added by ${nameOf(cur.by)}` : `About ${cur?.about ?? ""}`}</small>
        <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 600, color: c.text, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{cur?.q ?? ""}</div>
        {answerGrid}
        {buzzRow}
      </>
    );

    const final = (() => {
      const winner = s.scores[0] === s.scores[1] ? -1 : s.scores[0]! > s.scores[1]! ? 0 : 1;
      const all = s.teams.flatMap((t) => t.people);
      const winners = winner >= 0 ? s.teams[winner]!.people : [...s.teams[0]!.people.slice(0, 4), ...s.teams[1]!.people.slice(0, 4)];
      const shown = winner >= 0 ? winners.slice(0, 4) : winners;
      const extra = winner >= 0 ? Math.max(0, winners.length - 4) : 0;
      const loserIds = winner >= 0 ? s.teams[1 - winner]!.people : all;
      const detail = [joinNames(loserIds.map(nameOf)), s.where].filter(Boolean).join(" · ");
      const title = winner < 0 ? "Dead heat. Sudden death next week." : `${teamName(s, winner)} take the night.`;
      const rise = (i: number) => {
        const e = s.at ? running(s.at + i * 100, RISE.duration) : null;
        const k = e === null ? 1 : RISE(e);
        return (1 - k) * 30;
      };
      return (
        <>
          <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 600 }}>{title}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 24px", alignItems: "flex-start" }}>
            {shown.map((u, i) => (
              <div key={u} style={{ width: 52, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transform: `translateY(${rise(i)}px)` }}>
                <Avatar user={u} size={52} />
                <span style={{ maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, lineHeight: "16px", fontWeight: 600 }}>{firstName(u)}</span>
              </div>
            ))}
            {extra > 0 ? (
              <div style={{ width: 52, height: 72, display: "grid", placeItems: "center" }}>
                <More n={extra} size={40} />
              </div>
            ) : null}
          </div>
          <div style={{ height: 60, boxSizing: "border-box", padding: "10px 14px", borderRadius: 12, background: c.wash }}>
            <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{winner < 0 ? `Everyone splits ${s.stake}` : `Losers buy ${s.stake}`}</div>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</div>
          </div>
          <Button kind="primary" wide onClick={() => dispatch({ t: "rematch" })}>
            Rematch
          </Button>
        </>
      );
    })();

    const submit = () => {
      const q = local.q.trim();
      const right = local.right.trim();
      const wrong = local.wrong.split(",").map((x) => x.trim()).filter(Boolean);
      const keys = [right, ...wrong].map((x) => x.toLowerCase());
      if (!q || q.length > 160 || !right || right.length > 40 || wrong.length < 1 || wrong.length > 3 || wrong.some((w) => w.length > 40) || new Set(keys).size !== keys.length) {
        setLocal({ err: true });
        return;
      }
      dispatch({ t: "add", q, right, wrong });
      setLocal({ q: "", right: "", wrong: "", err: false });
    };

    const form = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        <input aria-label="Question" placeholder="Ask something about the group" value={local.q} onInput={(e) => setLocal({ q: e.currentTarget.value, err: false })} />
        <input aria-label="Right answer" placeholder="Right answer" value={local.right} onInput={(e) => setLocal({ right: e.currentTarget.value, err: false })} />
        <input aria-label="Wrong answers" placeholder="Wrong answers, comma separated" value={local.wrong} onInput={(e) => setLocal({ wrong: e.currentTarget.value, err: false })} />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button kind="primary" onClick={submit}>
            Add
          </Button>
        </div>
        {local.err ? <div style={{ fontSize: 13, lineHeight: "16px", color: c.negative }}>Add a question and two answers</div> : null}
      </form>
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <CardHeader title="Trivia night" subtitle={sub} />
        {scoreboard}
        {empty ? form : overNow ? final : play}
      </div>
    );
  },
});
