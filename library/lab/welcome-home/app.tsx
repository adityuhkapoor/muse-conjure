import { defineApp, Avatar, Button, CardHeader, Toast, haptic, mix, pal, type Ctx, type Member, type Theme } from "@muse/app";

// Welcome home: someone away posts a countdown to coming back. A dotted route across the sky from
// where they are to a little house with its porch light; the plane sits however many days out.
// Friends claim a welcome-back job in the yard (the airport pickup, the first meal, the couch) and
// the porch light gets warmer with every job taken; on the day it's fully on.

type Kind = "car" | "meal" | "couch" | "bag" | "sign" | "cake";
type Params = {
  /** Who's coming home: "Calvin" */
  author: string;
  /** Where they are now: "Barcelona" */
  from: string;
  /** Days left, 0 on the day */
  days: number;
  /** How long they've been away in days, for the route */
  total: number;
  /** The post line: "home in 9 days, i miss real food" */
  line: string;
  /** Welcome-back jobs, 2 to 6. kind: car, meal, couch, bag, sign or cake. who: whoever already claimed it, said: their words */
  jobs: { job: string; kind: Kind; who?: string; said?: string }[];
};

// @params
const P: Params = {
  author: "Calvin",
  from: "Barcelona",
  days: 9,
  total: 30,
  line: "home in 9 days, i miss real food",
  jobs: [
    { job: "Airport pickup", kind: "car", who: "Will", said: "the Sube is ready. mostly" },
    { job: "First meal", kind: "meal", who: "Arun", said: "rice cooker on standby" },
    { job: "Couch for the jet lag", kind: "couch" },
    { job: "Fill the fridge", kind: "bag", who: "Maya", said: "list is color-coded" },
    { job: "Welcome sign", kind: "sign" },
  ],
};
// @end params

type Job = { id: string; label: string; kind: Kind; who: string; name: string; said: string; at: number };
type State = { author: string; authorName: string; from: string; days: number; total: number; line: string; jobs: Job[] };
type Action = { t: "claim"; job: string } | { t: "drop" };
type Local = { sel: string; toast: number };

const KINDS: Kind[] = ["car", "meal", "couch", "bag", "sign", "cake"];
const SCENE_H = 214;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);

function memberFor(ctx: Ctx, name: string): Member | undefined {
  const k = name.trim().toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k);
}

function initState(ctx: Ctx): State {
  const authorName = clean(P.author, 20) || "Someone";
  const author = memberFor(ctx, authorName)?.id ?? `name:${authorName}`;
  const jobs: Job[] = [];
  for (const [i, j] of (Array.isArray(P.jobs) ? P.jobs : []).slice(0, 6).entries()) {
    const label = clean(j?.job, 28);
    if (!label) continue;
    const name = clean(j.who, 20);
    const m = name ? memberFor(ctx, name) : undefined;
    let who = name ? (m?.id ?? `name:${name}`) : "";
    if (who === author || (who && jobs.some((q) => q.who === who))) who = "";
    jobs.push({ id: `j${i}`, label, kind: (KINDS as string[]).includes(j.kind) ? j.kind : "cake", who, name: who ? (m?.name ?? name) : "", said: who ? clean(j.said, 36) : "", at: 0 });
  }
  const total = int(P.total, 1, 365, 14);
  return { author, authorName, from: clean(P.from, 20) || "away", days: int(P.days, 0, total, 0), total, line: clean(P.line, 60), jobs };
}

function jobArt(kind: Kind, t: Theme) {
  const p = pal(t), c = t.color, edge = mix(c.text, c.card, 0.2);
  if (kind === "car")
    return (
      <g>
        <path d="M4 26 L6 17 Q8 12 14 12 L28 12 Q33 12 35 17 L38 26 Z" fill={p.green} stroke={edge} stroke-width={1} />
        <rect x={10} y={14} width={8} height={6} rx={1} fill={p.sky} />
        <rect x={21} y={14} width={9} height={6} rx={1} fill={p.sky} />
        <rect x={12} y={8} width={16} height={3} rx={1} fill={edge} />
        <circle cx={12} cy={27} r={4} fill={edge} />
        <circle cx={31} cy={27} r={4} fill={edge} />
      </g>
    );
  if (kind === "meal")
    return (
      <g>
        <path d="M5 16 L37 16 Q36 30 21 30 Q6 30 5 16 Z" fill={p.red} stroke={edge} stroke-width={1} />
        <ellipse cx={21} cy={16} rx={16} ry={4} fill={p.cream} />
        <path d="M14 10 q2 -4 0 -7 M21 10 q2 -4 0 -7 M28 10 q2 -4 0 -7" fill="none" stroke={p.soft} stroke-width={1.5} stroke-linecap="round" />
      </g>
    );
  if (kind === "couch")
    return (
      <g>
        <rect x={6} y={10} width={30} height={12} rx={4} fill={p.purple} stroke={edge} stroke-width={1} />
        <rect x={3} y={16} width={36} height={10} rx={4} fill={mix(p.purple, c.card, 0.25)} stroke={edge} stroke-width={1} />
        <rect x={6} y={26} width={3} height={4} fill={edge} />
        <rect x={33} y={26} width={3} height={4} fill={edge} />
        <rect x={11} y={13} width={9} height={6} rx={2} fill={p.yellow} />
      </g>
    );
  if (kind === "bag")
    return (
      <g>
        <path d="M9 12 L33 12 L31 30 L11 30 Z" fill={p.crust} stroke={edge} stroke-width={1} />
        <circle cx={15} cy={10} r={4} fill={p.red} />
        <path d="M22 12 L24 3 L26 12" fill={p.green} />
        <circle cx={29} cy={10} r={3.5} fill={p.yellow} />
      </g>
    );
  if (kind === "sign")
    return (
      <g>
        <line x1={8} y1={30} x2={8} y2={6} stroke={edge} stroke-width={2} />
        <line x1={34} y1={30} x2={34} y2={6} stroke={edge} stroke-width={2} />
        <path d="M6 7 Q21 13 36 7 L36 18 Q21 24 6 18 Z" fill={p.blue} />
        <path d="M12 13 L30 13" stroke={c.card} stroke-width={2} stroke-dasharray="3 2" />
      </g>
    );
  return (
    <g>
      <rect x={8} y={14} width={26} height={15} rx={2} fill={p.cream} stroke={edge} stroke-width={1} />
      <path d="M8 18 q4 3 8 0 t9 0 t9 0" fill="none" stroke={p.red} stroke-width={2} />
      <line x1={21} y1={14} x2={21} y2={7} stroke={p.blue} stroke-width={2} />
      <circle cx={21} cy={5.5} r={2} fill={p.yellow} />
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Welcome home",
  summary: (s) => `${s.authorName} home ${s.days === 0 ? "today" : `in ${s.days} ${s.days === 1 ? "day" : "days"}`} · ${s.jobs.filter((j) => j.who).length} of ${s.jobs.length} welcome jobs taken`,

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user) || meta.user === s.author) return s;
    const u = meta.user;
    if (a.t === "claim") {
      const j = s.jobs.find((x) => x.id === a.job);
      if (!j || (j.who && j.who !== u)) return s;
      if (j.who === u) return { ...s, jobs: s.jobs.map((x) => (x === j ? { ...x, who: "", name: "", said: "", at: 0 } : x)) };
      const name = clean(ctx.members.find((m) => m.id === u)?.name, 20) || "Friend";
      return { ...s, jobs: s.jobs.map((x) => (x === j ? { ...x, who: u, name, said: "", at: meta.time } : x.who === u ? { ...x, who: "", name: "", said: "", at: 0 } : x)) };
    }
    if (a.t === "drop") {
      if (!s.jobs.some((x) => x.who === u)) return s;
      return { ...s, jobs: s.jobs.map((x) => (x.who === u ? { ...x, who: "", name: "", said: "", at: 0 } : x)) };
    }
    return s;
  },

  invariants: {
    "one job per friend": (s) => {
      const w = s.jobs.map((j) => j.who).filter(Boolean);
      return new Set(w).size === w.length;
    },
    "the one coming home doesn't work their own welcome": (s) => s.jobs.every((j) => j.who !== s.author),
    "an open job has nobody on it": (s) => s.jobs.every((j) => j.who !== "" || (j.name === "" && j.said === "" && j.at === 0)),
    "the countdown holds": (s) => Number.isInteger(s.days) && s.days >= 0 && s.days <= s.total,
  },

  transitions: {
    "a claim puts me on that job": (p, n, a, m) => {
      if (a.t !== "claim" || p === n) return true;
      const was = p.jobs.find((j) => j.id === a.job), now = n.jobs.find((j) => j.id === a.job);
      return !!was && !!now && (was.who === m.user ? now.who === "" : was.who === "" && now.who === m.user && now.at === m.time);
    },
    "a claim never bumps anyone else": (p, n, _a, m) => p.jobs.every((j, i) => j.who === "" || j.who === m.user || n.jobs[i]!.who === j.who),
    "an open job is there for the taking": (p, n, a, m, ctx) => a.t !== "claim" || !inChat(ctx, m.user) || m.user === p.author || !p.jobs.some((j) => j.id === a.job && j.who === "") || p !== n,
    "taking a job leaves my old one open": (p, n, a, m) => a.t !== "claim" || p === n || n.jobs.filter((j) => j.who === m.user).length <= 1,
    "dropping frees my job": (p, n, a, m) => a.t !== "drop" || p === n || (!n.jobs.some((j) => j.who === m.user) && n.jobs.every((j, i) => j.who === p.jobs[i]!.who || p.jobs[i]!.who === m.user)),
    "jobs keep their order and words": (p, n) => n.jobs.length === p.jobs.length && n.jobs.every((j, i) => j.id === p.jobs[i]!.id && j.label === p.jobs[i]!.label),
    "the trip never changes": (p, n) => p.days === n.days && p.total === n.total && p.from === n.from && p.author === n.author,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => (r.next() < 0.15 ? { t: "drop" } : { t: "claim", job: s.jobs.length ? r.pick(s.jobs).id : "j0" }),

  local: { sel: "", toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const isAuthor = me === state.author;
    const taken = state.jobs.filter((j) => j.who).length;
    const warm = state.days === 0 ? 1 : state.jobs.length ? taken / state.jobs.length : 0;
    const mine = state.jobs.find((j) => j.who === me);
    const sel = state.jobs.find((j) => j.id === local.sel) ?? state.jobs.find((j) => !j.who) ?? mine;
    const person = (j: Job): Member => members.find((m) => m.id === j.who) ?? { id: j.who, name: j.name };
    const author: Member = members.find((m) => m.id === state.author) ?? { id: state.author, name: state.authorName };
    // route geometry
    const hx = W - 70, hy = 84; // house centre
    const ax = 30, ay = 70; // away
    const k = state.total ? 1 - state.days / state.total : 1;
    const qx = (ax + hx) / 2, qy = 4;
    const bez = (t: number) => ({ x: (1 - t) ** 2 * ax + 2 * (1 - t) * t * qx + t * t * hx, y: (1 - t) ** 2 * ay + 2 * (1 - t) * t * qy + t * t * (hy - 40) });
    const plane = bez(Math.max(0.04, Math.min(0.96, k)));
    const ahead = bez(Math.min(1, k + 0.02));
    const ang = (Math.atan2(ahead.y - plane.y, ahead.x - plane.x) * 180) / Math.PI;
    const n = state.jobs.length;
    const colW = W / Math.max(1, n);
    const groundY = 136;
    const glow = mix(p.yellow, c.card, 1 - (0.25 + 0.75 * warm));

    return (
      <div>
        <style>{"@keyframes whBob { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-3px) } } @keyframes whDash { to { stroke-dashoffset: -16 } } @keyframes whPop { 0% { transform: scale(.2) } 70% { transform: scale(1.15) } 100% { transform: scale(1) } }"}</style>
        <CardHeader title={state.days === 0 ? `${state.authorName} is home today` : `${state.authorName} home in ${state.days} ${state.days === 1 ? "day" : "days"}`} subtitle={state.line ? `“${state.line}”` : `from ${state.from}`} />
        <div style={{ position: "relative", height: SCENE_H }}>
          <svg width={W} height={SCENE_H} viewBox={`0 0 ${W} ${SCENE_H}`} role="img" aria-label={`Route from ${state.from} to home, ${state.days} days out; porch with ${taken} of ${n} jobs taken`} style={{ position: "absolute", left: 0, top: 0 }}>
            <rect x={0} y={0} width={W} height={groundY} rx={12} fill={dark ? mix(c.wash, p.blue, 0.15) : p.sky} />
            <rect x={0} y={groundY - 12} width={W} height={SCENE_H - groundY + 12} rx={12} fill={dark ? mix(c.wash, p.green, 0.2) : mix(p.grass, c.card, 0.35)} />
            <path d={`M${ax} ${ay} Q${qx} ${qy} ${hx} ${hy - 40}`} fill="none" stroke={dark ? c.text : mix(c.text, c.card, 0.35)} stroke-width={2} stroke-dasharray="4 6" style={{ animation: "whDash 1.2s linear infinite" }} />
            {/* away marker */}
            <circle cx={ax} cy={ay} r={9} fill={p.red} />
            <circle cx={ax} cy={ay} r={3.5} fill={c.card} />
            <text x={ax - 8} y={ay + 24} font-size={11} font-weight={700} fill={c.text}>
              {state.from}
            </text>
            {/* house */}
            <g transform={`translate(${hx - 44} ${hy - 44})`}>
              <circle cx={58} cy={52} r={10 + 14 * warm} fill={glow} opacity={0.6} />
              <rect x={8} y={36} width={72} height={52} fill={dark ? mix(p.wall, c.wash, 0.4) : p.wall} stroke={mix(c.text, c.card, 0.3)} stroke-width={1} />
              <path d="M0 40 L44 4 L88 40 Z" fill={p.red} stroke={mix(c.text, c.card, 0.3)} stroke-width={1} />
              <rect x={18} y={50} width={18} height={16} fill={warm > 0.5 ? glow : p.sky} stroke={mix(c.text, c.card, 0.3)} stroke-width={1} />
              <rect x={52} y={58} width={18} height={30} fill={p.brown} />
              <circle cx={58} cy={52} r={4} fill={warm > 0 ? p.yellow : c.track} stroke={mix(c.text, c.card, 0.3)} stroke-width={1} />
            </g>
          </svg>
          {/* plane with the traveller */}
          <div style={{ position: "absolute", left: plane.x - 16, top: plane.y - 16, width: 32, height: 32, animation: "whBob 1.8s ease-in-out infinite", pointerEvents: "none" }}>
            <svg width={32} height={32} viewBox="0 0 32 32" style={{ transform: `rotate(${ang}deg)` }} aria-hidden="true">
              <path d="M2 16 L30 14 Q32 16 30 18 L2 16 Z M14 15 L8 4 L12 4 L20 15 Z M14 17 L8 28 L12 28 L20 17 Z M4 16 L2 10 L5 10 L8 16 Z" fill={c.card} stroke={mix(c.text, c.card, 0.2)} stroke-width={1.2} stroke-linejoin="round" />
            </svg>
            <div style={{ position: "absolute", left: 8, top: -12 }}>
              <Avatar user={author} size={16} />
            </div>
          </div>
          <div style={{ position: "absolute", left: plane.x - 30, top: plane.y + 14, width: 60, textAlign: "center", fontSize: 11, fontWeight: 700, color: c.text, pointerEvents: "none" }}>{state.days === 0 ? "landing" : `${state.days} ${state.days === 1 ? "day" : "days"}`}</div>
          {/* jobs in the yard */}
          {state.jobs.map((j, i) => {
            const x = colW * i + colW / 2;
            const isSel = sel?.id === j.id && !isAuthor;
            return (
              <button
                key={j.id}
                type="button"
                aria-label={`${j.label}${j.who ? `, ${j.who === me ? "you" : j.name}` : ", open"}`}
                onClick={() => setLocal({ sel: j.id })}
                style={{ position: "absolute", left: x - Math.min(32, colW / 2), top: groundY - 6, width: Math.min(64, colW), height: 74, padding: 0, border: "none", background: "none", display: "flex", flexDirection: "column", alignItems: "center" }}
              >
                <div style={{ position: "relative", width: 46, height: 40, borderRadius: 10, border: j.who ? "none" : `1.5px dashed ${isSel ? c.primary : c.secondaryText}`, background: isSel ? mix(c.card, c.primary, 0.15) : j.who ? "none" : mix(c.card, p.grass, 0.2), boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width={42} height={32} viewBox="0 0 42 32" aria-hidden="true" style={{ opacity: j.who ? 1 : 0.6 }}>
                    {jobArt(j.kind, theme)}
                  </svg>
                  {j.who ? (
                    <div style={{ position: "absolute", right: -6, top: -8, animation: j.at ? "whPop .4s ease-out" : undefined }}>
                      <Avatar user={j.who === me ? me : person(j)} size={20} />
                    </div>
                  ) : null}
                </div>
                <span style={{ marginTop: 3, width: "100%", fontSize: 11, lineHeight: "13px", color: c.text, fontWeight: isSel ? 700 : 400, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", textAlign: "center", overflowWrap: "anywhere" }}>{j.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {sel && sel.who
            ? `${sel.who === me ? "You" : sel.name.split(" ")[0]}${sel.said ? `: “${sel.said}”` : ` · ${sel.label.toLowerCase()}`}`
            : `${taken} of ${n} jobs taken · the porch light warms up with each`}
        </div>
        {!isAuthor ? (
          <div style={{ marginTop: 8 }}>
            {sel && (!sel.who || sel.who === me) ? (
              <Button
                kind={sel.who === me ? "secondary" : "primary"}
                wide
                onClick={() => {
                  dispatch({ t: "claim", job: sel.id });
                  if (!sel.who) {
                    setLocal({ toast: local.toast + 1 });
                    haptic("success");
                  }
                }}
              >
                {sel.who === me ? "Give it back" : `Take ${sel.label.length > 16 ? "this job" : sel.label.toLowerCase()}`}
              </Button>
            ) : (
              <Button kind="secondary" wide disabled>
                {mine ? `You have ${mine.label.length > 14 ? "a job" : mine.label.toLowerCase()}` : "All jobs taken"}
              </Button>
            )}
          </div>
        ) : null}
        {local.toast > 0 && mine ? <Toast key={local.toast}>{`You're on ${mine.label.toLowerCase()}`}</Toast> : null}
      </div>
    );
  },
});
