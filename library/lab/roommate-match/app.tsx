import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Facepile,
  Toast,
  fitText,
  haptic,
  innerWidth,
  mix,
  running,
  textWidth,
  tween,
  type Child,
  type Theme,
} from "@muse/app";

// Roommate match: a 6-question lifestyle quiz. Every tap re-ranks the members who are looking for a
// room; after question 6 your top match lands and you can say hi. Questions are constants; the
// listings and the chat's answers come from the params. Scores are counts ("5 of 6"), never percents.

type Params = {
  group: string;
  took: number;
  listings: { name: string; hood: string; note: string; answers: number[] }[];
  people: { name: string; picks: number[]; hi?: string[] }[];
};

// @params
const P: Params = {
  group: "SF Roommate Exchange",
  took: 412,
  listings: [
    { name: "Marco", hood: "SoMa", note: "startup, big kitchen", answers: [1, 1, 1, 2, 2, 2] },
    { name: "Kai", hood: "Inner Richmond", note: "grad student, quiet", answers: [0, 0, 0, 2, 1, 1] },
    { name: "Dani", hood: "Temescal", note: "DJ on weekends", answers: [2, 2, 2, 1, 1, 0] },
    { name: "Rosa", hood: "Mission", note: "has a cat named Tofu", answers: [1, 0, 1, 1, 0, 1] },
    { name: "Jess", hood: "Nob Hill", note: "nurse, night shifts", answers: [2, 1, 0, 0, 1, 2] },
    { name: "Leo", hood: "Sunset", note: "surfs, up at 6", answers: [0, 1, 1, 0, 0, 0] },
    { name: "Ana", hood: "Lower Haight", note: "Priya's friend", answers: [1, 0, 1, 1, 1, 1] },
  ],
  people: [
    { name: "Noa", picks: [1, 0, 1, 1, 1, 1], hi: ["Ana"] },
    { name: "Dev", picks: [2, 1, 2] },
  ],
};
// @end params

type Listing = { id: string; name: string; hood: string; note: string; ans: number[] }; // ans: 6 values 0..2
type Mine = { picks: number[]; at: number }; // picks: 0..6 values 0..2; at: meta.time of last pick (0 if seeded)
type Hi = { by: string; to: string; at: number };
type State = { group: string; took: number; listings: Listing[]; quiz: { [user: string]: Mine }; hi: Hi[] };
type Action = { t: "answer"; q: number; choice: number } | { t: "retake" } | { t: "hi"; to: string };
type Ctx = { members: { id: string; name?: string }[] };

const QS = [
  { q: "Weeknight bedtime?", opts: ["Before 11", "Around 1", "3am gremlin"], icons: ["sun", "moon", "stars"], traits: ["Early bird", "Night owl", "Nocturnal"] },
  { q: "Kitchen after dinner?", opts: ["Spotless", "By morning", "It's a vibe"], icons: ["sparkle", "plates", "confetti"], traits: ["Spotless", "Tidy-ish", "Chaos chef"] },
  { q: "People over?", opts: ["Rarely", "Weekends", "Always"], icons: ["book", "door", "party"], traits: ["Homebody", "Weekend host", "Party house"] },
  { q: "Work from home?", opts: ["Never", "2-3 days", "Every day"], icons: ["coffee", "laptop", "house"], traits: ["Office", "Hybrid", "Full remote"] },
  { q: "Pets?", opts: ["I have one", "Love them", "Allergic"], icons: ["paw", "heart", "sneeze"], traits: ["Has a pet", "Pet lover", "No pets"] },
  { q: "Room budget?", opts: ["Under $1.3K", "$1.3–1.7K", "$1.7K+"], icons: ["coin1", "coin2", "coin3"], traits: ["Under $1.3K", "$1.3–1.7K", "$1.7K+"] },
] as const;

const NQ = QS.length;
const MAX_HI = 100;
const MAX_LISTINGS = 7;
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isChoice = (v: unknown): v is number => isInt(v) && v >= 0 && v <= 2;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// ---- Scoring ----

const sim = (a: number, b: number, q: number) => (a === b ? 2 : q === 4 && (a === 2) !== (b === 2) ? 0 : 2 - Math.abs(a - b));
const score = (l: Listing, picks: number[]) => picks.reduce((s, p, q) => s + sim(p, l.ans[q]!, q), 0);
const same = (l: Listing, picks: number[]) => picks.reduce((s, p, q) => s + (p === l.ans[q] ? 1 : 0), 0);
const rank = (listings: Listing[], picks: number[]) =>
  listings
    .map((l, i) => ({ l, i, s: score(l, picks) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.l);

// ---- Reducer side ----

function reduceMatch(s: State, a: Record<string, unknown>, user: string, time: number): State {
  if (a.t === "answer") {
    const have = s.quiz[user]?.picks ?? [];
    if (!isInt(a.q) || !isChoice(a.choice) || a.q !== have.length || a.q >= NQ) return s;
    return { ...s, quiz: { ...s.quiz, [user]: { picks: [...have, a.choice], at: time } } };
  }
  if (a.t === "retake") {
    if (!s.quiz[user]) return s;
    const quiz = { ...s.quiz };
    delete quiz[user];
    return { ...s, quiz };
  }
  if (a.t === "hi") {
    const to = a.to;
    if (s.quiz[user]?.picks.length !== NQ || typeof to !== "string" || !s.listings.some((l) => l.id === to)) return s;
    if (s.hi.some((h) => h.by === user && h.to === to) || s.hi.length >= MAX_HI) return s;
    return { ...s, hi: [...s.hi, { by: user, to, at: time }] };
  }
  return s;
}

// ---- Check side ----

const quizOthersEqual = (p: State, n: State, user: string) => {
  const keys = new Set([...Object.keys(p.quiz), ...Object.keys(n.quiz)]);
  for (const k of keys) if (k !== user && JSON.stringify(p.quiz[k] ?? null) !== JSON.stringify(n.quiz[k] ?? null)) return false;
  return true;
};

// ---- Icons (36 x 36, theme colors only) ----

type Cols = Theme["color"];
const star = (cx: number, cy: number, R: number, r: number, pts: number) =>
  Array.from({ length: pts * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / pts;
    const rad = i % 2 ? r : R;
    return `${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`;
  }).join(" ");

function iconArt(name: string, k: number, c: Cols): Child {
  const accent = [c.series1, c.series3, c.series4][k]!;
  const soft = mix(accent, c.card, 0.5);
  const X = 18, Y = 18;
  switch (name) {
    case "sun":
      return (
        <g>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            return <line key={i} x1={X + Math.cos(a) * 10.5} y1={Y + Math.sin(a) * 10.5} x2={X + Math.cos(a) * 15} y2={Y + Math.sin(a) * 15} stroke={accent} stroke-width={2} stroke-linecap="round" />;
          })}
          <circle cx={X} cy={Y} r={7.5} fill={accent} />
        </g>
      );
    case "moon":
      return (
        <g>
          <circle cx={X} cy={Y} r={11.25} fill={accent} />
          <circle cx={X + 5.25} cy={Y - 3.75} r={9} fill={mix(c.card, accent, 0.12)} />
        </g>
      );
    case "stars":
      return (
        <g fill={accent}>
          <polygon points={star(X - 4.5, Y + 1.5, 9, 3.75, 5)} />
          <polygon points={star(X + 8.25, Y - 6.75, 4.5, 1.8, 5)} />
          <polygon points={star(X + 9, Y + 7.5, 3.3, 1.35, 4)} />
        </g>
      );
    case "sparkle":
      return (
        <g fill={accent}>
          <polygon points={star(X, Y, 13.5, 3.3, 4)} />
          <polygon points={star(X + 10.5, Y - 9, 5.25, 1.5, 4)} />
        </g>
      );
    case "plates":
      return (
        <g>
          <ellipse cx={X} cy={Y + 6} rx={12.75} ry={3} fill={accent} />
          <ellipse cx={X} cy={Y + 0.75} rx={12.75} ry={3} fill={soft} />
          <ellipse cx={X} cy={Y - 4.5} rx={12.75} ry={3} fill={accent} />
        </g>
      );
    case "confetti":
      return (
        <g>
          {Array.from({ length: 9 }, (_, i) => {
            const a = 2.4 * i;
            const d = 3 + 1.2 * i;
            const x = X + Math.cos(a) * d, y = Y + Math.sin(a) * d;
            return <rect key={i} x={x - 2.25} y={y - 1.05} width={4.5} height={2.1} fill={[accent, c.series2, c.series3][i % 3]} transform={`rotate(${((a * 180) / Math.PI).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})`} />;
          })}
        </g>
      );
    case "book":
      return (
        <g>
          <rect x={X - 11.25} y={Y - 8.25} width={22.5} height={16.5} rx={3} fill={accent} />
          <line x1={X} y1={Y - 8.25} x2={X} y2={Y + 8.25} stroke={c.card} stroke-width={2} />
        </g>
      );
    case "door":
      return (
        <g>
          <rect x={X - 7.5} y={Y - 12} width={15} height={24} rx={3} fill={accent} />
          <circle cx={X + 7.5 - 3.3} cy={Y} r={1.5} fill={c.card} />
        </g>
      );
    case "party":
      return (
        <g>
          <polygon points={`${X - 10.5},${Y + 12} ${X + 1.5},${Y - 12} ${X + 9},${Y + 7.5}`} fill={accent} stroke={accent} stroke-width={2} stroke-linejoin="round" />
          {[c.series2, c.series3, c.series4, c.series1].map((f, i) => {
            const a = -1.2 + 0.5 * i;
            return <circle key={i} cx={X + 4.5 + Math.cos(a) * 8} cy={Y - 7.5 + Math.sin(a) * 8} r={2} fill={f} />;
          })}
        </g>
      );
    case "coffee":
      return (
        <g>
          <rect x={X - 1.5 - 7.5} y={Y + 1.5 - 7.5} width={15} height={15} rx={4} fill={accent} />
          <circle cx={X + 7.5} cy={Y + 1.5} r={3.75} fill="none" stroke={accent} stroke-width={2.5} />
        </g>
      );
    case "laptop":
      return (
        <g>
          <rect x={X - 9.75} y={Y - 2.25 - 6.375} width={19.5} height={12.75} rx={3} fill={accent} />
          <rect x={X - 12.75} y={Y + 6 - 1.5} width={25.5} height={3} rx={2} fill={mix(accent, c.text, 0.3)} />
        </g>
      );
    case "house":
      return (
        <g>
          <polygon points={`${X - 15},${Y - 0.75} ${X},${Y - 13.5} ${X + 15},${Y - 0.75}`} fill={accent} />
          <rect x={X - 10.5} y={Y - 1.5} width={21} height={13.5} fill={accent} />
          <rect x={X - 2.25} y={Y + 3.75} width={4.5} height={8.25} fill={c.card} />
        </g>
      );
    case "paw":
      return (
        <g fill={accent}>
          <ellipse cx={X} cy={Y + 4.5} rx={6.75} ry={5.7} />
          {[[-8.25, -2.25], [-3, -8.25], [3, -8.25], [8.25, -2.25]].map(([dx, dy], i) => (
            <circle key={i} cx={X + dx!} cy={Y + dy!} r={2.7} />
          ))}
        </g>
      );
    case "heart":
      return <path d="M18 28.5C7 21 6.5 12 11.5 9.7c3-1.3 5.4.5 6.5 2.6 1.1-2.1 3.5-3.9 6.5-2.6 5 2.3 4.5 11.3-6.5 18.8Z" fill={accent} />;
    case "sneeze":
      return (
        <g>
          <circle cx={X} cy={Y} r={12} fill="none" stroke={accent} stroke-width={2.5} />
          <line x1={X - 8.4} y1={Y - 8.4} x2={X + 8.4} y2={Y + 8.4} stroke={accent} stroke-width={2.5} stroke-linecap="round" />
          <ellipse cx={X} cy={Y} rx={4.5} ry={3} fill={accent} />
        </g>
      );
    default: {
      const N = Number(name.slice(4));
      return (
        <g>
          {Array.from({ length: N }, (_, s) =>
            Array.from({ length: s + 2 }, (_, j) => <ellipse key={`${s}.${j}`} cx={X + (s - (N - 1) / 2) * 8.25} cy={Y + 9 - 4.2 * j} rx={4.5} ry={2} fill={j % 2 ? mix(accent, c.card, 0.3) : accent} />),
          )}
        </g>
      );
    }
  }
}

const Icon = (p: { name: string; k: number; c: Cols }) => (
  <svg viewBox="0 0 36 36" width={36} height={36} aria-hidden="true" style={{ display: "block" }}>
    {iconArt(p.name, p.k, p.c)}
  </svg>
);

const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const slide = tween({ duration: 350, easing: "decelerate" });
const grow = tween({ duration: 300, easing: "decelerate" });
const popIn = tween({ duration: 300, easing: "decelerate" });
const SLIDE_MS = 350;
const GROW_MS = 300;
const TOAST_MS = 2400;
const FADE_MS = 600;
const ROW = 38;

export default defineApp<State, Action>({
  name: "Roommate match",
  summary: (s, ctx) => {
    const done = ctx.members.filter((m) => s.quiz[m.id]?.picks.length === NQ).length;
    return `${s.group}: ${done} of ${ctx.members.length} took the roommate quiz${s.hi.length ? ` · ${s.hi.length} said hi` : ""}`;
  },

  init: (ctx) => {
    const listings: Listing[] = [];
    for (const l of Array.isArray(P.listings) ? P.listings : []) {
      const name = clean(l?.name, 16);
      if (!name || listings.length >= MAX_LISTINGS) continue;
      listings.push({ id: `l${listings.length}`, name, hood: clean(l.hood, 20), note: clean(l.note, 32), ans: Array.from({ length: NQ }, (_, q) => (isChoice(l.answers?.[q]) ? l.answers[q]! : 1)) });
    }
    const quiz: { [user: string]: Mine } = {};
    const hi: Hi[] = [];
    for (const person of Array.isArray(P.people) ? P.people : []) {
      const want = clean(person?.name, 60).toLowerCase();
      if (!want) continue;
      const m = ctx.members.find((x) => !quiz[x.id] && (x.id === person.name || (x.name ?? "").toLowerCase() === want));
      if (!m) continue;
      const picks: number[] = [];
      for (const v of Array.isArray(person.picks) ? person.picks : []) {
        if (!isChoice(v) || picks.length >= NQ) break;
        picks.push(v);
      }
      if (!picks.length) continue;
      quiz[m.id] = { picks, at: 0 };
      if (picks.length === NQ) {
        for (const nm of Array.isArray(person.hi) ? person.hi : []) {
          const l = listings.find((x) => x.name.toLowerCase() === clean(nm, 16).toLowerCase());
          if (l && !hi.some((h) => h.by === m.id && h.to === l.id)) hi.push({ by: m.id, to: l.id, at: 0 });
        }
      }
    }
    return { group: clean(P.group, 40) || "This group", took: Math.max(0, Math.min(1_000_000, Math.round(Number(P.took) || 0))), listings, quiz, hi };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceMatch(state, action as unknown as Record<string, unknown>, meta.user, meta.time) : state),

  onMembers: (state, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    if (Object.keys(state.quiz).every(here) && state.hi.every((h) => here(h.by))) return state;
    const quiz: { [user: string]: Mine } = {};
    for (const k of Object.keys(state.quiz)) if (here(k)) quiz[k] = state.quiz[k]!;
    return { ...state, quiz, hi: state.hi.filter((h) => here(h.by)) };
  },

  invariants: {
    "answers are valid": (s) => Object.values(s.quiz).every((m) => m.picks.length >= 1 && m.picks.length <= NQ && m.picks.every(isChoice)),
    "only chat members have answers": (s, ctx) => Object.keys(s.quiz).every((u) => inChat(ctx, u)),
    "his are by chat members to real listings, once each": (s, ctx) =>
      s.hi.every((h) => inChat(ctx, h.by) && s.listings.some((l) => l.id === h.to)) && new Set(s.hi.map((h) => `${h.by}|${h.to}`)).size === s.hi.length && s.hi.length <= MAX_HI,
    "listings are well formed": (s) => new Set(s.listings.map((l) => l.id)).size === s.listings.length && s.listings.every((l) => l.ans.length === NQ && l.ans.every(isChoice)),
  },

  transitions: {
    "an answer appends exactly the choice to the actor's picks": (p, n, a, m) =>
      a.t !== "answer" || p === n || (JSON.stringify(n.quiz[m.user]?.picks) === JSON.stringify([...(p.quiz[m.user]?.picks ?? []), a.choice]) && n.quiz[m.user]?.at === m.time && quizOthersEqual(p, n, m.user)),
    "questions go in order": (p, n, a, m) => a.t !== "answer" || p === n || a.q === (p.quiz[m.user]?.picks.length ?? 0),
    "retake clears only the actor": (p, n, a, m) => a.t !== "retake" || p === n || (!(m.user in n.quiz) && m.user in p.quiz && quizOthersEqual(p, n, m.user) && n.hi === p.hi),
    "say hi needs a finished quiz and adds one hi": (p, n, a, m) => {
      if (a.t !== "hi" || p === n) return true;
      const last = n.hi[n.hi.length - 1];
      return p.quiz[m.user]?.picks.length === NQ && n.hi.length === p.hi.length + 1 && !!last && last.by === m.user && last.to === a.to && last.at === m.time;
    },
    "listings never change": (p, n) => JSON.stringify(p.listings) === JSON.stringify(n.listings) && p.took === n.took,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    const n = s.quiz[user]?.picks.length ?? 0;
    if (n < NQ) {
      if (k < 0.8) return { t: "answer", q: n, choice: r.int(3) };
      if (k < 0.9) return { t: "answer", q: r.int(NQ), choice: r.int(3) };
      return { t: "retake" };
    }
    if (k < 0.5) return s.listings.length ? { t: "hi", to: r.pick(s.listings).id } : { t: "retake" };
    if (k < 0.75) return { t: "retake" };
    return { t: "answer", q: NQ, choice: 0 };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const c = theme.color;
    const W = innerWidth();
    const mine = state.quiz[me];
    const picks = mine?.picks ?? [];
    const n = picks.length;
    const at = mine?.at ?? 0;
    const finished = members.filter((m) => state.quiz[m.id]?.picks.length === NQ).length;
    const ranked = rank(state.listings, picks);
    const prior = n ? rank(state.listings, picks.slice(0, -1)) : ranked;
    const top = ranked[0];

    const eSlide = at && n < NQ ? running(at, SLIDE_MS) : null;
    const slideP = eSlide === null ? 1 : slide(eSlide);
    const eGrow = at ? running(at, GROW_MS) : null;
    const eFade = at ? running(at, FADE_MS) : null;
    const tileW = (W - 24 - 16) / 3;

    // ---- quiz card ----
    const quizCard = () => {
      const q = QS[n]!;
      const answered = members.filter((m) => (state.quiz[m.id]?.picks.length ?? 0) > n).map((m) => m.id);
      const dx = (1 - slideP) * 40;
      return (
        <>
          <div style={{ position: "absolute", left: 12, right: 12, top: 12, display: "flex", gap: 4 }}>
            {Array.from({ length: NQ }, (_, i) => (
              <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: c.track, overflow: "hidden" }}>
                {i < n ? <span style={{ display: "block", height: 4, background: c.primary, transformOrigin: "left", transform: i === n - 1 && eGrow !== null ? `scaleX(${grow(eGrow)})` : undefined }} /> : null}
              </span>
            ))}
          </div>
          <div style={{ position: "absolute", left: 12, right: 12, top: 22, height: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: c.secondaryText }}>{`${n + 1} of ${NQ}`}</span>
            {answered.length ? <Facepile users={answered} max={3} size={18} /> : null}
          </div>
          <div style={{ position: "absolute", left: 12, right: 12, top: 42, height: 26, lineHeight: "26px", fontSize: 20, fontWeight: 700, color: c.text, transform: `translateX(${dx}px)`, opacity: slideP, ...ellipsis }}>{q.q}</div>
          <div style={{ position: "absolute", left: 12, right: 12, top: 70, height: 66, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, transform: `translateX(${dx}px)`, opacity: slideP }}>
            {q.opts.map((opt, k) => {
              const f = fitText(opt, tileW - 8, { size: 14, min: 11 });
              return (
                <button
                  key={opt}
                  aria-label={opt}
                  onClick={() => {
                    dispatch({ t: "answer", q: n, choice: k });
                    haptic("light");
                  }}
                  style={{ position: "relative", height: 66, minWidth: 0, padding: 0, border: "none", borderRadius: 12, background: c.card, cursor: "pointer", color: c.text }}
                >
                  <span style={{ position: "absolute", left: "50%", top: 3, marginLeft: -18 }}>
                    <Icon name={q.icons[k]!} k={k} c={c} />
                  </span>
                  <span style={{ position: "absolute", left: 4, right: 4, top: 46, height: 14, lineHeight: "14px", textAlign: "center", fontSize: f.size, color: c.text, whiteSpace: "nowrap" }}>{f.text}</span>
                </button>
              );
            })}
          </div>
        </>
      );
    };

    // ---- result card ----
    const resultCard = () => {
      if (!top) {
        return (
          <div style={{ position: "absolute", left: 12, right: 12, top: 12 }}>
            <div style={{ fontSize: 13, color: c.secondaryText }}>Your top match</div>
            <div style={{ fontSize: 15, color: c.text, margin: "6px 0 10px" }}>No one is looking yet.</div>
            <Button kind="secondary" wide onClick={() => dispatch({ t: "retake" })}>Retake</Button>
          </div>
        );
      }
      const sent = state.hi.some((h) => h.by === me && h.to === top.id);
      const x0 = 104;
      const room = W - x0 - 10;
      const matched = QS.map((_, q) => q).filter((q) => picks[q] === top.ans[q]);
      const chips: number[] = [];
      let used = 0;
      for (const q of matched) {
        if (chips.length >= 3) break;
        const w = textWidth(QS[q]!.traits[picks[q]!]!, 12) + 16;
        if (used + w > room) break;
        chips.push(q);
        used += w + 5;
      }
      const ePop = at ? running(at, 250 + 120 * 3 + 300) : null;
      return (
        <>
          <span style={{ position: "absolute", left: 14, top: 34, width: 76, height: 76, borderRadius: 38, background: c.card, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <Avatar user={{ id: top.id, name: top.name }} size={64} />
          </span>
          <div style={{ position: "absolute", left: x0, right: 10, top: 10 }}>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>Your top match</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, height: 28, lineHeight: "28px", fontSize: 24, fontWeight: 700, minWidth: 0 }}>
              <span style={{ color: c.text, minWidth: 0, ...ellipsis }}>{top.name}</span>
              <span style={{ color: c.secondaryText, whiteSpace: "nowrap" }}>{`${same(top, picks)} of ${NQ}`}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ellipsis }}>{[top.hood, top.note].filter(Boolean).join(" · ")}</div>
            <div style={{ display: "flex", gap: 5, height: 22, marginTop: 4 }}>
              {chips.map((q, i) => {
                const sc = ePop === null ? 1 : popIn(Math.min(300, Math.max(0, ePop - (250 + 120 * i))));
                return (
                  <span key={q} style={{ height: 22, lineHeight: "22px", padding: "0 8px", borderRadius: 11, fontSize: 12, color: c.text, background: mix(c.card, c.positive, 0.15), whiteSpace: "nowrap", transform: `scale(${sc})` }}>
                    {QS[q]!.traits[picks[q]!]}
                  </span>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, height: 36, marginTop: 4, alignItems: "center" }}>
              {sent ? (
                <span style={{ width: 120, height: 36, borderRadius: 8, background: mix(c.card, c.positive, 0.15), color: c.positive, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 15, fontWeight: 600 }}>
                  <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke={c.positive} stroke-width={2} stroke-linecap="round" stroke-linejoin="round" /></svg>
                  Sent
                </span>
              ) : (
                <div style={{ width: 120 }}>
                  <Button kind="primary" wide onClick={() => { dispatch({ t: "hi", to: top.id }); haptic("success"); }}>Say hi</Button>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Button kind="secondary" wide onClick={() => dispatch({ t: "retake" })}>Retake</Button>
              </div>
            </div>
          </div>
        </>
      );
    };

    // ---- ranking ----
    const status = n === 0 ? "Members looking now · answer to re-rank" : n < NQ ? "Re-ranking as you answer" : "Your ranking";
    const row = (l: Listing, r: number) => {
      const climbed = n > 0 && r < prior.indexOf(l);
      const out = climbed && eFade !== null ? 1 - eFade / FADE_MS : 0;
      const bg = r === 0 ? c.selected : c.input;
      const said = members.filter((m) => state.hi.some((h) => h.by === m.id && h.to === l.id)).map((m) => m.id);
      const sc = score(l, picks);
      return (
        <div
          key={l.id}
          style={{ position: "absolute", left: 0, right: 0, top: r * ROW, height: 36, borderRadius: 12, background: bg, boxShadow: out > 0 ? `inset 0 0 0 1px ${mix(bg, c.primary, out)}` : undefined, transition: "top 500ms cubic-bezier(.2,0,0,1)", display: "flex", alignItems: "center", gap: 8, padding: "0 8px 0 4px", overflow: "hidden" }}
        >
          <Avatar user={{ id: l.id, name: l.name }} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, height: 18 }}>
              <span style={{ fontSize: 15, lineHeight: "18px", fontWeight: 600, color: c.text, flex: "0 1 auto", ...ellipsis }}>{l.name}</span>
              <span style={{ fontSize: 12, color: c.secondaryText, flex: "0 1 auto", minWidth: 0, ...ellipsis }}>{l.hood}</span>
              {said.length ? <Facepile users={said} max={3} size={16} /> : null}
            </div>
            <div style={{ fontSize: 12, lineHeight: "14px", color: c.secondaryText, ...ellipsis }}>{l.note}</div>
          </div>
          {n === 0 ? (
            <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", flex: "0 0 auto" }}>{QS[5].traits[l.ans[5]!]}</span>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
              <span style={{ width: 70, height: 8, borderRadius: 4, background: c.track, overflow: "hidden", display: "block" }}>
                <span style={{ display: "block", height: 8, borderRadius: 4, background: c.primary, width: (70 * sc) / (2 * n) }} />
              </span>
              <span style={{ width: 44, textAlign: "right", fontSize: 15, fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>{`${same(l, picks)} of ${n}`}</span>
            </div>
          )}
        </div>
      );
    };

    return (
      <div>
        <div style={{ height: 40 }}>
          <CardHeader title="Roommate match" subtitle={`${state.group} · ${state.took + finished} took it`} />
        </div>
        <div style={{ position: "relative", height: 144, background: c.wash, borderRadius: 12, overflow: "hidden" }}>{n < NQ ? quizCard() : resultCard()}</div>
        <div style={{ height: 4 }} />
        <div style={{ height: 16, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: c.secondaryText }}>
          <span style={{ minWidth: 0, ...ellipsis }}>{status}</span>
          <span>Match</span>
        </div>
        <div style={{ height: 2 }} />
        <div style={{ position: "relative", height: 190 }}>
          {ranked.length ? (
            ranked.slice(0, 5).map((l, r) => row(l, r))
          ) : (
            <div style={{ height: 36, borderRadius: 12, background: c.input, display: "flex", alignItems: "center", padding: "0 12px", fontSize: 13, color: c.secondaryText }}>No one is looking yet. Answers still save.</div>
          )}
        </div>
        {n === NQ && at && running(at, TOAST_MS) !== null && top ? <Toast key={at}>{`Top match · ${top.name}`}</Toast> : null}
      </div>
    );
  },
});
