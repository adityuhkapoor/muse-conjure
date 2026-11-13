import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  CardHeader,
  Toast,
  haptic,
  mix,
  running,
  tween,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// Gym streaks: a week of flames, one per person per day. Check in and today's flame ignites and the
// streak ticks up; tap someone whose today is empty to nudge them; whoever went least buys smoothies.

type Params = {
  /** Card title: "Gym rats streaks" */
  title: string;
  /** Today, 0 to 6, Monday = 0 */
  today: number;
  /** One line of chat lore about the slacker, shown as the Sunday roast */
  roast: string;
  /** What someone said about your streak */
  cheer: { name: string; text: string };
  /** week: 1 for each day Monday to today they went. before: streak carried in from last week. nudge: what the chat says to them. */
  people: { name: string; week: number[]; before: number; nudge?: string }[];
};

// @params
const P: Params = {
  title: "Gym rats streaks",
  today: 4,
  roast: "Theo has been \"deloading\" since October",
  cheer: { name: "Maya", text: "ok who are you" },
  people: [
    { name: "Maya", week: [1, 1, 1, 1, 1], before: 18 },
    { name: "Jonah", week: [1, 0, 1, 1, 0], before: 0 },
    { name: "Priya", week: [1, 1, 0, 1, 1], before: 0 },
    { name: "Theo", week: [0, 1, 0, 0, 0], before: 0, nudge: "get up Theo" },
    { name: "Dev", week: [1, 1, 0, 1, 0], before: 0 },
    { name: "Noa", week: [1, 1, 1, 1, 0], before: 4 },
  ],
};
// @end params

type State = {
  title: string;
  today: number;
  roast: string;
  cheer: { name: string; text: string };
  /** member id to 7 days, false after today */
  week: Record<string, boolean[]>;
  /** streak carried in from last week */
  before: Record<string, number>;
  /** member id to the time of today's check-in (1 when seeded) */
  at: Record<string, number>;
  /** lowercased name to what the chat says when they are nudged */
  lines: Record<string, string>;
  nudges: { from: string; to: string; at: number }[];
};
type Action = { t: "in" } | { t: "nudge"; who: string };
type Local = { burst: number };

const F7: boolean[] = [false, false, false, false, false, false, false];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const IGNITE = tween({ duration: 600, easing: [0.34, 1.56, 0.64, 1] });
const OUT_BACK = tween({ duration: 350, easing: [0.34, 1.56, 0.64, 1] });
const SETTLE = tween({ duration: 400, easing: "decelerate" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const wk = (s: State, u: string) => s.week[u] ?? F7;
const went = (s: State, u: string) => wk(s, u)[s.today] === true;
const days = (s: State, u: string) => wk(s, u).filter(Boolean).length;
const streak = (s: State, u: string) => {
  let d = went(s, u) ? s.today : s.today - 1;
  let n = 0;
  while (d >= 0 && wk(s, u)[d]) {
    n++;
    d--;
  }
  return d < 0 ? n + (s.before[u] ?? 0) : n;
};

/** Rows for a viewer: the board's order, everyone else first, the viewer last, at most 6. */
function rowsFor(s: State, me: string, members: Member[]) {
  const keyed = Object.keys(s.week)
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is Member => !!m);
  const rest = members.filter((m) => !keyed.some((k) => k.id === m.id));
  const others = [...keyed, ...rest].filter((m) => m.id !== me);
  const mine = members.find((m) => m.id === me);
  const shown = mine ? [...others.slice(0, 5), mine] : others.slice(0, 6);
  const hidden = mine ? others.slice(5) : others.slice(6);
  return { shown, hidden };
}

function initState(ctx: Ctx): State {
  const today = Number.isInteger(P.today) ? Math.max(0, Math.min(6, P.today)) : 4;
  const week: State["week"] = {};
  const before: State["before"] = {};
  const at: State["at"] = {};
  const lines: State["lines"] = {};
  for (const person of P.people) {
    const name = clean(person.name, 20);
    const m = ctx.members.find((x) => x.id === name || x.name.toLowerCase() === name.toLowerCase());
    if (!m || week[m.id]) continue;
    const w = F7.map((_, d) => d <= today && Array.isArray(person.week) && person.week[d] === 1);
    week[m.id] = w;
    before[m.id] = Number.isInteger(person.before) ? Math.max(0, Math.min(999, person.before)) : 0;
    if (w[today]) at[m.id] = 1;
    const line = clean(person.nudge, 30);
    if (line) lines[name.toLowerCase()] = line;
  }
  for (const m of ctx.members) if (!week[m.id]) week[m.id] = F7;
  return {
    title: clean(P.title, 30) || "Gym streaks",
    today,
    roast: clean(P.roast, 60),
    cheer: { name: clean(P.cheer?.name, 20), text: clean(P.cheer?.text, 30) },
    week,
    before,
    at,
    lines,
    nudges: [],
  };
}

type Flame = { bx: number; by: number; h: number; w: number; sway: number };

function drawBoard(g: CanvasRenderingContext2D, f: DrawFrame, s: State, rows: Member[], me: string, rowH: number, boardH: number, gx: number, cw: number) {
  const c = f.theme.color;
  const t = f.now / 1000;
  const k = rowH / 44;
  const sc = cw / 32;
  const today = s.today;
  g.globalAlpha = 1;

  // My row, then the today column over it.
  const myIndex = rows.findIndex((m) => m.id === me);
  if (myIndex >= 0) {
    g.beginPath();
    g.roundRect(0, 22 + rowH * myIndex + 2, f.width, rowH - 4, 8);
    g.fillStyle = c.selected;
    g.fill();
  }
  g.beginPath();
  g.roundRect(gx + cw * today + 1, 0, cw - 2, boardH, 10);
  g.fillStyle = c.input;
  g.globalAlpha = myIndex >= 0 ? 0.75 : 1;
  g.fill();
  g.globalAlpha = 1;

  const flames: Flame[] = [];
  const glows: { x: number; y: number; r: number; a: number }[] = [];
  const ash: { x: number; y: number }[] = [];
  const dots: { x: number; y: number }[] = [];
  rows.forEach((m, i) => {
    const cy = 22 + rowH * i + rowH / 2;
    const wkm = wk(s, m.id);
    for (let d = 0; d < 7; d++) {
      const x = gx + cw * (d + 0.5);
      if (wkm[d]) {
        let kk = 1;
        if (m.id === me && d === today && (s.at[me] ?? 1) > 1) kk = IGNITE(Math.min(600, Math.max(0, f.now - (s.at[me] ?? 0))));
        const seed = i * 7 + d;
        const fl = (a: number) => Math.sin(t * a + seed * 7.1);
        const H = 28 * sc * k * kk;
        const hh = H * (1 + 0.08 * fl(9));
        const w = 0.36 * hh;
        const by = cy + 13 * sc * k;
        flames.push({ bx: x, by, h: hh, w, sway: 0.18 * fl(5.3) });
        glows.push({ x, y: by - 0.3 * hh, r: 1.5 * w, a: 0.12 * kk });
      } else if (d < today || (d === today && m.id !== me)) {
        ash.push({ x, y: cy });
      } else if (d === today) {
        const p = 0.5 + 0.5 * Math.sin(3 * t);
        g.beginPath();
        g.arc(x, cy + 4, 9 + 2 * p, 0, Math.PI * 2);
        g.strokeStyle = c.primary;
        g.lineWidth = 2;
        g.globalAlpha = 0.5 + 0.4 * p;
        g.stroke();
        g.globalAlpha = 1;
      } else {
        dots.push({ x, y: cy });
      }
    }
  });

  // Ash: one fill for the discs, one stroke for the slashes.
  g.globalAlpha = 0.25;
  g.beginPath();
  for (const a of ash) {
    g.moveTo(a.x + 6, a.y + 6);
    g.arc(a.x, a.y + 6, 6, 0, Math.PI * 2);
  }
  g.fillStyle = c.secondaryText;
  g.fill();
  g.globalAlpha = 0.6;
  g.beginPath();
  for (const a of ash) {
    g.moveTo(a.x - 4, a.y + 2);
    g.lineTo(a.x + 4, a.y + 10);
  }
  g.strokeStyle = c.secondaryText;
  g.lineWidth = 1.5;
  g.lineCap = "round";
  g.stroke();
  g.globalAlpha = 0.35;
  g.beginPath();
  for (const d of dots) {
    g.moveTo(d.x + 2.5, d.y + 4);
    g.arc(d.x, d.y + 4, 2.5, 0, Math.PI * 2);
  }
  g.fillStyle = c.secondaryText;
  g.fill();
  g.globalAlpha = 1;

  // Flames: glow first, then the three layers, one fill per colour.
  g.globalAlpha = 0.12;
  g.beginPath();
  for (const gl of glows) {
    g.moveTo(gl.x + gl.r, gl.y);
    g.arc(gl.x, gl.y, gl.r, 0, Math.PI * 2);
  }
  g.fillStyle = c.series5;
  g.fill();
  g.globalAlpha = 1;
  const layers: [number, number, number, string][] = [
    [1, 1, 0, mix(c.negative, c.series5, 0.5)],
    [0.68, 0.66, 0.15, mix(c.series5, c.series2, 0.5)],
    [0.38, 0.38, 0.3, mix(c.series2, c.onPrimary, 0.4)],
  ];
  for (const [hk, wk2, ok, color] of layers) {
    g.beginPath();
    for (const fl of flames) {
      const h = fl.h * hk;
      const w = fl.w * wk2;
      const off = ok * fl.w;
      const bcx = fl.bx;
      const bcy = fl.by - (w + off);
      const tipx = fl.bx + fl.sway * fl.h;
      const tipy = fl.by - h - off;
      g.moveTo(tipx, tipy);
      g.quadraticCurveTo(bcx + 1.05 * w, bcy - 0.25 * h, bcx + w, bcy);
      g.arc(bcx, bcy, w, 0, Math.PI);
      g.quadraticCurveTo(bcx - 1.05 * w, bcy - 0.25 * h, tipx, tipy);
    }
    g.fillStyle = color;
    g.fill();
  }
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Gym streaks",
  summary: (s, ctx) => {
    const ms = ctx.members;
    if (!ms.length) return `${s.title}: no one on the board yet`;
    const k = ms.filter((m) => went(s, m.id)).length;
    if (k === ms.length) return `${s.title}: everyone went today`;
    const loser = ms.reduce((a, m) => (days(s, m.id) < days(s, a.id) ? m : a), ms[0]!);
    return `${s.title}: ${k} of ${ms.length} went today · ${loser.name} buys smoothies`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "in") {
      const u = meta.user;
      const w = [...wk(state, u)];
      if (!went(state, u)) {
        w[state.today] = true;
        return {
          ...state,
          week: { ...state.week, [u]: w },
          at: { ...state.at, [u]: meta.time },
          nudges: state.nudges.filter((x) => x.to !== u),
        };
      }
      w[state.today] = false;
      const at = { ...state.at };
      delete at[u];
      return { ...state, week: { ...state.week, [u]: w }, at };
    }
    if (action.t === "nudge") {
      const who = action.who;
      if (typeof who !== "string" || !inChat(ctx, who) || who === meta.user || went(state, who)) return state;
      if (state.nudges.some((x) => x.from === meta.user && x.to === who)) return state;
      return { ...state, nudges: [...state.nudges, { from: meta.user, to: who, at: meta.time }] };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    const keep = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([u]) => here(u)));
    const missing = ctx.members.filter((m) => !(m.id in state.week));
    const gone = Object.keys(state.week).some((u) => !here(u)) || Object.keys(state.before).some((u) => !here(u)) || Object.keys(state.at).some((u) => !here(u));
    const badNudge = state.nudges.some((x) => !here(x.from) || !here(x.to));
    if (!missing.length && !gone && !badNudge) return state;
    const week = keep(state.week);
    for (const m of missing) week[m.id] = F7;
    return { ...state, week, before: keep(state.before), at: keep(state.at), nudges: state.nudges.filter((x) => here(x.from) && here(x.to)) };
  },

  invariants: {
    "weeks are 7 days with nothing after today": (s) => Object.values(s.week).every((w) => w.length === 7 && w.every((x) => typeof x === "boolean") && w.slice(s.today + 1).every((x) => !x)),
    "a check-in time exactly for today's check-ins": (s) =>
      Object.keys(s.at).every((u) => went(s, u) && (s.at[u] ?? 0) >= 1) && Object.keys(s.week).every((u) => !went(s, u) || s.at[u] !== undefined),
    "only people in the chat are on the board": (s, ctx) => {
      const here = (u: string) => ctx.members.some((m) => m.id === u);
      return [...Object.keys(s.week), ...Object.keys(s.before), ...Object.keys(s.at)].every(here) && s.nudges.every((x) => here(x.from) && here(x.to));
    },
    "nudges go to someone else who hasn't gone, once per pair": (s) =>
      s.nudges.every((x) => x.from !== x.to && !went(s, x.to)) && new Set(s.nudges.map((x) => `${x.from}>${x.to}`)).size === s.nudges.length,
    "carried streaks and today are sane": (s) => Number.isInteger(s.today) && s.today >= 0 && s.today <= 6 && Object.values(s.before).every((b) => Number.isInteger(b) && b >= 0 && b <= 999),
  },

  transitions: {
    "a check-in flips only the sender's today": (p, n, a, m) => {
      if (a.t !== "in" || p === n) return true;
      const mine = (st: State) => st.week[m.user] ?? F7;
      if (mine(n)[p.today] === mine(p)[p.today]) return false;
      for (const u of new Set([...Object.keys(p.week), ...Object.keys(n.week)])) {
        if (u !== m.user && JSON.stringify(p.week[u] ?? F7) !== JSON.stringify(n.week[u] ?? F7)) return false;
      }
      return mine(n).every((x, d) => d === p.today || x === mine(p)[d]);
    },
    "a check-in is stamped and answers the nudges": (p, n, a, m) => {
      if (a.t !== "in") return true;
      const was = (st: State) => (st.week[m.user] ?? F7)[st.today] === true;
      if (!was(n) || was(p)) return true;
      return n.at[m.user] === m.time && n.nudges.every((x) => x.to !== m.user);
    },
    "an undo removes the stamp": (_p, n, a, m) => a.t !== "in" || (n.week[m.user] ?? F7)[n.today] === true || n.at[m.user] === undefined,
    "a nudge is one new line from the sender to someone who hasn't gone": (p, n, a, m) => {
      if (a.t !== "nudge" || p === n) return true;
      const last = n.nudges[n.nudges.length - 1];
      return n.nudges.length === p.nudges.length + 1 && !!last && last.from === m.user && last.to === a.who && last.at === m.time && a.who !== m.user && (p.week[a.who] ?? F7)[p.today] !== true;
    },
    "a nudge changes no check-ins": (p, n, a) => a.t !== "nudge" || JSON.stringify(n.week) === JSON.stringify(p.week),
    "today, carried streaks, lore never change": (p, n) =>
      n.today === p.today && JSON.stringify(n.before) === JSON.stringify(p.before) && JSON.stringify(n.lines) === JSON.stringify(p.lines) && n.roast === p.roast,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    const k = r.next();
    const me = went(s, user);
    if (!me && k < 0.5) return { t: "in" };
    if (me && k < 0.15) return { t: "in" };
    const others = ctx.members.filter((m) => m.id !== user && !went(s, m.id));
    if (others.length) return { t: "nudge", who: r.pick(others).id };
    return { t: "in" };
  },

  local: { burst: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const { shown, hidden } = rowsFor(state, me, members);
    const rowN = shown.length;
    const rowH = rowN <= 5 ? 44 : 36;
    const gx = 86;
    const cw = Math.min(32, Math.floor((W - gx - 44) / 7));
    const boardH = 22 + rowH * rowN;
    const today = state.today;
    const wentToday = members.filter((m) => went(state, m.id)).length;
    const iWent = went(state, me);
    const myAt = state.at[me] ?? 0;
    const sinceMine = myAt > 1 ? running(myAt, 1400) : null;
    const settle = myAt > 1 ? running(myAt + 300, 400) : null;
    const topStreak = shown.reduce((best, m) => (streak(state, m.id) > streak(state, best.id) ? m : best), shown[0] ?? { id: "", name: "" });
    const loser = shown.reduce<Member | null>((a, m) => (a === null || days(state, m.id) < days(state, a.id) ? m : a), null);
    const cheerer = members.find((m) => m.id !== me && m.name.toLowerCase() === state.cheer.name.toLowerCase());
    const mineStreak = streak(state, me);
    const hiddenWent = hidden.filter((m) => went(state, m.id)).length;
    const label = shown.length ? `Gym week: ${wentToday} of ${members.length} went today, ${topStreak.name} on a ${streak(state, topStreak.id)}-day streak` : "Gym week: nobody on the board yet";

    return (
      <div style={{ position: "relative" }}>
        <style>{".gy-n{position:absolute;left:0;right:0;border:0;padding:0;margin:0;background:transparent;cursor:pointer}.gy-n::after{content:\"\";position:absolute;left:0;right:0;top:-4px;bottom:-4px}"}</style>
        <CardHeader title={state.title} subtitle={`${wentToday} of ${members.length} went today`} />

        <div style={{ position: "relative", height: boardH }}>
          <Canvas height={boardH} label={label} draw={(g, f) => drawBoard(g, f, state, shown, me, rowH, boardH, gx, cw)} />

          {LETTERS.map((l, d) => (
            <span key={d} style={{ position: "absolute", left: gx + cw * d, width: cw, top: 2, textAlign: "center", fontSize: 13, lineHeight: "16px", fontWeight: 600, color: d === today ? c.text : c.secondaryText }}>
              {l}
            </span>
          ))}
          <span style={{ position: "absolute", right: 4, top: 4, fontSize: 11, lineHeight: "14px", color: c.secondaryText }}>streak</span>

          {shown.map((m, i) => {
            const y = 22 + rowH * i;
            const isMe = m.id === me;
            const gone = went(state, m.id);
            const nudge = [...state.nudges].reverse().find((x) => x.to === m.id);
            const eShake = nudge ? running(nudge.at, 500) : null;
            const shake = eShake !== null ? 4 * Math.sin(40 * (eShake / 1000)) * (1 - eShake / 500) : 0;
            const eBubble = nudge ? OUT_BACK(running(nudge.at, 350) ?? 350) : 1;
            const sn = streak(state, m.id);
            const grow = isMe && settle !== null ? 1.5 - 0.5 * SETTLE(settle) : isMe && myAt > 1 && sinceMine !== null ? 1.5 : 1;
            const fromName = nudge ? (nudge.from === me ? "You" : (members.find((x) => x.id === nudge.from)?.name ?? "Someone")) : "";
            return (
              <div key={m.id}>
                <span style={{ position: "absolute", left: 5 + shake, top: y + rowH / 2 - 13, display: "flex" }}>
                  <Avatar user={m} size={26} />
                </span>
                <span style={{ position: "absolute", left: 36, width: 46, top: y + rowH / 2 - 10, fontSize: 13, lineHeight: "20px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isMe ? "You" : m.name}</span>
                <span style={{ position: "absolute", right: 6, top: y + rowH / 2 - 14, fontSize: 22, lineHeight: "28px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: sn === 0 ? c.secondaryText : c.text, transform: `scale(${grow.toFixed(3)})`, transformOrigin: "right center" }}>{sn}</span>
                {!isMe && !gone ? (
                  <button type="button" class="gy-n" aria-label={`Nudge ${m.name}`} style={{ top: y, height: rowH }} onClick={() => dispatch({ t: "nudge", who: m.id })} />
                ) : null}
                {nudge && !gone ? (
                  <span
                    style={{
                      position: "absolute",
                      left: 54,
                      top: y + rowH / 2 - 28 + 6 * (1 - eBubble),
                      maxWidth: W - 120,
                      padding: "2px 6px",
                      borderRadius: 8,
                      background: c.secondaryButton,
                      color: c.secondaryButtonText,
                      fontSize: 12,
                      lineHeight: "16px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      pointerEvents: "none",
                      zIndex: 2,
                    }}
                  >
                    {`${fromName}: ${state.lines[m.name.toLowerCase()] ?? "gym?? today??"}`}
                  </span>
                ) : null}
              </div>
            );
          })}

          {iWent && sinceMine !== null ? (
            <span style={{ position: "absolute", left: gx + cw * (today + 0.5), top: 22 + rowH * (rowN - 1) + rowH / 2 + 8, width: 0, height: 0 }}>
              <Burst key={local.burst} emoji="🔥" />
            </span>
          ) : null}
        </div>

        {hidden.length > 0 ? (
          <div style={{ height: 20, fontSize: 13, lineHeight: "20px", color: c.secondaryText }}>{`+${hidden.length} more · ${hiddenWent} went today`}</div>
        ) : null}

        <div style={{ marginTop: 8, height: 42 }}>
          {!iWent ? (
            <Button
              kind="primary"
              wide
              onClick={() => {
                haptic("success");
                setLocal({ burst: local.burst + 1 });
                dispatch({ t: "in" });
              }}
            >
              Check in
            </Button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, borderRadius: 8, background: c.wash, padding: "0 4px 0 12px" }}>
              <span style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 13, lineHeight: "16px", fontWeight: 600, color: c.text, maxHeight: 32, overflow: "hidden" }}>
                {`You're in · ${mineStreak}-day streak${cheerer ? ` · ${cheerer.name}: "${state.cheer.text}"` : ""}`}
              </span>
              <Button kind="deemphasized" onClick={() => dispatch({ t: "in" })}>
                Undo
              </Button>
            </div>
          )}
        </div>

        <div style={{ position: "relative", height: 66 }}>
          <svg width={40} height={66} viewBox="0 0 40 66" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            <line x1={23} y1={20} x2={29} y2={6} stroke={c.series3} stroke-width={3} stroke-linecap="round" />
            <polygon points="8,20 32,20 28,52 12,52" fill={c.series4} />
            <rect x={6} y={16} width={28} height={6} rx={3} fill={c.input} />
          </svg>
          <span style={{ position: "absolute", left: 44, right: 0, top: 10, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {loser ? (loser.id === me ? `You buy smoothies (${days(state, loser.id)} of ${today + 1} days)` : `${loser.name} buys smoothies (${days(state, loser.id)} of ${today + 1} days)`) : "Loser buys smoothies"}
          </span>
          {state.roast ? (
            <span style={{ position: "absolute", left: 44, right: 0, top: 32, maxHeight: 32, overflow: "hidden", fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{`Sunday roast: ${state.roast}`}</span>
          ) : null}
        </div>
        {iWent && local.burst > 0 ? <Toast key={local.burst}>{`Checked in for ${DAYS[today]}`}</Toast> : null}
      </div>
    );
  },
});
