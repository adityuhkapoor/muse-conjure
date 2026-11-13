import { defineApp, Avatar, Burst, Button, CardHeader, Facepile, Toast, haptic, innerWidth, mix, pal, running, tween, type Ctx } from "@muse/app";

// Notes relay: the lectures before the midterm laid out as a running track, one lap segment per
// lecture. Covered laps are solid with the note-taker's face, claimed laps show who's typing, and
// gaps glow red. Tap a gap and take it; mark it done and the baton runs on to the next uncovered
// lap. Close the whole track before the midterm and the group gets a cheer.

type Params = {
  /** Card title */
  title: string;
  /** Course, e.g. 'ECON 210' */
  course: string;
  /** The deadline, as said: 'Midterm Thu Oct 30' */
  finish: string;
  /** Lectures in order. by: who took or is taking notes (name); done: notes are up; said: their words */
  laps: { when: string; topic: string; by?: string; done?: boolean; said?: string }[];
};

// @params
const P: Params = {
  title: "Notes relay",
  course: "ECON 210",
  finish: "Midterm Thu Oct 30",
  laps: [
    { when: "Wk 1 Tue", topic: "Supply and demand", by: "Maya", done: true, said: "color-coded, you're welcome" },
    { when: "Wk 1 Thu", topic: "Elasticity", by: "Maya", done: true },
    { when: "Wk 2 Tue", topic: "Consumer choice", by: "Tsai Lin", done: true },
    { when: "Wk 2 Thu", topic: "Costs", by: "Will", done: true, said: "typed it in the sube, excuse typos" },
    { when: "Wk 3 Tue", topic: "Perfect competition", by: "Arun", done: true },
    { when: "Wk 3 Thu", topic: "Monopoly", by: "Arun", said: "typing between rice cooker batches" },
    { when: "Wk 4 Tue", topic: "Game theory" },
    { when: "Wk 4 Thu", topic: "Oligopoly" },
    { when: "Wk 5 Tue", topic: "Labor markets", by: "Calvin", said: "after alarm 4. maybe 5" },
    { when: "Wk 5 Thu", topic: "Review" },
  ],
};
// @end params

type Lap = { when: string; topic: string; by: string; name: string; done: boolean; said: string; at: number; thanks: string[] };
type State = { title: string; course: string; finish: string; laps: Lap[]; fullAt: number };
type Action = { t: "claim"; i: number } | { t: "drop"; i: number } | { t: "done"; i: number } | { t: "thank"; i: number };
type Local = { sel: number };

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const doneN = (s: State) => s.laps.filter((l) => l.done).length;
const baton = tween({ duration: 1100, easing: "easeInOut" });

function initState(ctx: Ctx): State {
  const laps: Lap[] = [];
  for (const l of Array.isArray(P.laps) ? P.laps : []) {
    const topic = clean(l?.topic, 30);
    if (!topic || laps.length >= 16) continue;
    const bn = clean(l.by, 20);
    const m = bn ? ctx.members.find((x) => x.id === bn || x.name.toLowerCase() === bn.toLowerCase()) : undefined;
    const by = m ? m.id : bn ? `o:${bn}` : "";
    laps.push({ when: clean(l.when, 12), topic, by, name: m ? m.name : bn, done: !!by && l.done === true, said: by ? clean(l.said, 60) : "", at: 0, thanks: [] });
  }
  while (laps.length < 4) laps.push({ when: `Lecture ${laps.length + 1}`, topic: "Lecture", by: "", name: "", done: false, said: "", at: 0, thanks: [] });
  return { title: clean(P.title, 40) || "Notes relay", course: clean(P.course, 30), finish: clean(P.finish, 30), laps, fullAt: 0 };
}

// Stadium track: t in [0, 1) clockwise from the left end of the top straight.
function trackPoint(t: number, cx: number, cy: number, L: number, R: number): [number, number] {
  const per = 2 * L + 2 * Math.PI * R;
  let d = (((t % 1) + 1) % 1) * per;
  if (d < L) return [cx - L / 2 + d, cy - R];
  d -= L;
  if (d < Math.PI * R) {
    const a = -Math.PI / 2 + d / R;
    return [cx + L / 2 + Math.cos(a) * R, cy + Math.sin(a) * R];
  }
  d -= Math.PI * R;
  if (d < L) return [cx + L / 2 - d, cy + R];
  d -= L;
  const a = Math.PI / 2 + d / R;
  return [cx - L / 2 + Math.cos(a) * R, cy + Math.sin(a) * R];
}

export default defineApp<State, Action, Local>({
  name: "Notes relay",
  summary: (s) => {
    const gaps = s.laps.filter((l) => !l.by).length;
    return `${s.course} notes · ${doneN(s)} of ${s.laps.length} lectures covered${gaps ? ` · ${gaps} nobody has` : ""}${s.finish ? ` · ${s.finish}` : ""}`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || !isInt(a.i, 0, s.laps.length - 1)) return s;
    const l = s.laps[a.i]!;
    const u = m.user;
    const set = (patch: Partial<Lap>, extra: Partial<State> = {}) => ({ ...s, ...extra, laps: s.laps.map((x, j) => (j === a.i ? { ...x, ...patch } : x)) });
    if (a.t === "claim") {
      if (l.by) return s;
      return set({ by: u, name: ctx.members.find((x) => x.id === u)?.name ?? "Someone", done: false, said: "", at: m.time, thanks: [] });
    }
    if (a.t === "drop") {
      if (l.by !== u || l.done) return s;
      return set({ by: "", name: "", said: "", at: m.time, thanks: [] });
    }
    if (a.t === "done") {
      if (l.by !== u || l.done) return s;
      const full = s.laps.every((x, j) => j === a.i || x.done);
      return set({ done: true, at: m.time }, full ? { fullAt: m.time } : {});
    }
    if (a.t === "thank") {
      if (!l.done || l.by === u || l.thanks.includes(u) || l.thanks.length >= 50) return s;
      return set({ thanks: [...l.thanks, u] });
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = (u: string) => !u.startsWith("o:") && !inChat(ctx, u);
    if (!s.laps.some((l) => (l.by && !l.done && gone(l.by)) || l.thanks.some(gone))) return s;
    return {
      ...s,
      laps: s.laps.map((l) => {
        const thanks = l.thanks.filter((u) => !gone(u));
        return l.by && !l.done && gone(l.by) ? { ...l, by: "", name: "", said: "", thanks: [] } : { ...l, thanks };
      }),
    };
  },

  invariants: {
    "done laps have a note-taker": (s) => s.laps.every((l) => !l.done || l.by !== ""),
    "open laps have no thanks or quote": (s) => s.laps.every((l) => l.by !== "" || (l.thanks.length === 0 && l.said === "" && !l.done)),
    "thanks are once each and never self": (s) => s.laps.every((l) => new Set(l.thanks).size === l.thanks.length && !l.thanks.includes(l.by)),
    "thanks only on done laps": (s) => s.laps.every((l) => l.done || l.thanks.length === 0),
    "a full track is stamped only when full": (s) => s.fullAt === 0 || doneN(s) === s.laps.length,
  },

  transitions: {
    "only chat members change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "one action touches one lap": (p, n, a) => p === n || n.laps.every((x, j) => j === a.i || x === p.laps[j]),
    "claiming gives an open lap to the actor": (p, n, a, m) => a.t !== "claim" || p === n || (!p.laps[a.i]!.by && n.laps[a.i]!.by === m.user && !n.laps[a.i]!.done && n.laps[a.i]!.at === m.time),
    "an open lap is never refused": (p, n, a, m, ctx) => a.t !== "claim" || p !== n || !(inChat(ctx, m.user) && isInt(a.i, 0, p.laps.length - 1) && !p.laps[a.i]!.by),
    "only the taker drops or finishes, and only before done": (p, n, a, m) =>
      (a.t !== "drop" && a.t !== "done") || p === n || (p.laps[a.i]!.by === m.user && !p.laps[a.i]!.done),
    "dropping opens the lap": (p, n, a) => a.t !== "drop" || p === n || (n.laps[a.i]!.by === "" && !n.laps[a.i]!.done),
    "finishing marks it done and stamps a full track": (p, n, a, m) =>
      a.t !== "done" || p === n || (n.laps[a.i]!.done && n.laps[a.i]!.by === m.user && n.laps[a.i]!.at === m.time && (doneN(n) === n.laps.length) === (n.fullAt === m.time)),
    "done laps stay done": (p, n) => p.laps.every((l, j) => !l.done || n.laps[j]!.done),
    "a thank adds the actor once": (p, n, a, m) => a.t !== "thank" || p === n || (n.laps[a.i]!.thanks.length === p.laps[a.i]!.thanks.length + 1 && n.laps[a.i]!.thanks.at(-1) === m.user),
  },

  arbitrary: (s, u, r) => {
    const i = r.int(s.laps.length);
    const l = s.laps[i]!;
    if (!l.by) return { t: "claim", i };
    if (l.by === u) return l.done ? { t: "claim", i: r.int(s.laps.length) } : r.next() < 0.7 ? { t: "done", i } : { t: "drop", i };
    return l.done ? { t: "thank", i } : { t: "claim", i };
  },

  local: { sel: -1 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = Math.min(innerWidth(), theme.width - 24);
    const H = W < 340 ? 176 : 196;
    const laps = state.laps;
    const n = laps.length;
    const R = H / 2 - 22;
    const L = Math.max(40, W - 2 * R - 52);
    const cx = W / 2, cy = H / 2;
    const firstGap = laps.findIndex((l) => !l.by);
    const firstOpen = laps.findIndex((l) => !l.done);
    const sel = local.sel >= 0 && local.sel < n ? local.sel : firstGap >= 0 ? firstGap : Math.max(0, firstOpen);
    const lap = laps[sel]!;
    const nameOf = (u: string) => (u === me ? "You" : (members.find((m) => m.id === u)?.name ?? laps.find((l) => l.by === u)?.name ?? "Someone"));
    const face = (l: Lap) => (l.by.startsWith("o:") ? { id: l.by, name: l.name } : l.by);
    const segPath = (i: number) => {
      const t0 = i / n + 0.006, t1 = (i + 1) / n - 0.006;
      const pts: string[] = [];
      for (let k = 0; k <= 14; k++) {
        const q = trackPoint(t0 + ((t1 - t0) * k) / 14, cx, cy, L, R);
        pts.push(`${k ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`);
      }
      return pts.join(" ");
    };
    const mid = (i: number) => trackPoint((i + 0.5) / n, cx, cy, L, R);

    // Baton: rests at the start of the first lap not done; runs there when a lap finishes.
    const lastDone = confirmed.laps.reduce((b, l, j) => (l.done && l.at > (b.at ?? 0) ? { at: l.at, j } : b), { at: 0, j: -1 } as { at: number; j: number });
    const target = lastDone.j >= 0 ? (lastDone.j + 1) / n : firstOpen < 0 ? 0 : firstOpen / n;
    const be = lastDone.at > 0 ? running(lastDone.at, 1100) : null;
    const from = lastDone.j >= 0 ? lastDone.j / n : target;
    const bt = be === null ? target : from + (target - from) * baton(be);
    const bp = trackPoint(bt, cx, cy, L, R);
    const full = doneN(state) === n;
    const fe = confirmed.fullAt > 0 ? running(confirmed.fullAt, 2400) : null;

    const lane = mix(p.red, p.orange, 0.35);
    const track = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Track of ${n} lectures: ${doneN(state)} covered, ${laps.filter((l) => !l.by).length} nobody has`} style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} rx={12} fill={mix(p.grass, c.card, 0.25)} />
        <rect x={cx - L / 2 - R - 13} y={cy - R - 13} width={L + 2 * R + 26} height={2 * R + 26} rx={R + 13} fill={mix(lane, c.card, 0.55)} />
        <rect x={cx - L / 2 - R + 13} y={cy - R + 13} width={L + 2 * R - 26} height={2 * R - 26} rx={R - 13} fill={p.grass} />
        {laps.map((l, i) => {
          const gap = !l.by;
          const col = l.done ? c.positive : gap ? c.negative : c.primary;
          return (
            <path key={`s${i}`} d={segPath(i)} fill="none" stroke={col} stroke-width={gap ? 12 : 14} stroke-linecap="butt" stroke-dasharray={!l.done && !gap ? "7 4" : undefined}
              class={gap ? "nr-glow" : ""} opacity={l.done ? 1 : 0.95} />
          );
        })}
        {/* start / finish line, checkered */}
        {Array.from({ length: 6 }, (_v, k) => (
          <rect key={`c${k}`} x={cx - L / 2 - 4 + (k % 2) * 4} y={cy - R - 14 + Math.floor(k / 2) * 0 + k * 4.6} width={4} height={4.6} fill={k % 2 ? p.dark : c.card} />
        ))}
        <rect x={bp[0] - 9} y={bp[1] - 3.5} width={18} height={7} rx={3.5} fill={p.yellow} stroke={p.dark} stroke-width={1.2} transform={`rotate(${(Math.atan2(cy - bp[1], cx - bp[0]) * 180) / Math.PI + 90} ${bp[0]} ${bp[1]})`} />
      </svg>
    );

    const overlays = laps.map((l, i) => {
      const [x, y] = mid(i);
      const on = i === sel;
      return (
        <div key={`o${i}`}>
          {l.by ? (
            <span style={{ position: "absolute", left: x - 11, top: y - 11, display: "flex", borderRadius: 99, boxShadow: `0 0 0 2px ${l.done ? c.positive : c.primary}`, pointerEvents: "none" }}>
              <Avatar user={face(l)} size={22} />
            </span>
          ) : (
            <span style={{ position: "absolute", left: x - 11, top: y - 11, width: 22, height: 22, borderRadius: 11, background: c.card, color: c.negative, fontSize: 14, fontWeight: 800, lineHeight: "22px", textAlign: "center", pointerEvents: "none" }}>?</span>
          )}
          <button type="button" aria-label={`${l.when}: ${l.topic}, ${l.done ? `notes by ${nameOf(l.by)}` : l.by ? `${nameOf(l.by)} is typing` : "nobody has it"}`} aria-pressed={on ? "true" : "false"}
            onClick={() => { setLocal({ sel: i }); haptic("light"); }}
            style={{ position: "absolute", left: x - 22, top: y - 22, width: 44, height: 44, padding: 0, border: 0, borderRadius: 22, background: "transparent", cursor: "pointer", boxShadow: on ? `0 0 0 2.5px ${c.text} inset` : "none" }} />
        </div>
      );
    });

    const infield = (
      <div style={{ position: "absolute", left: cx - L / 2 - 4, width: L + 8, top: cy - 26, height: 52, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <span style={{ fontSize: 22, fontWeight: 800, lineHeight: "26px", color: c.text, whiteSpace: "nowrap" }}>{full ? "Track done" : `${doneN(state)} of ${n} laps`}</span>
        {state.finish ? <span style={{ fontSize: 12, fontWeight: 600, lineHeight: "16px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: L }}>{`Finish: ${state.finish}`}</span> : null}
      </div>
    );

    let line2: string;
    let act;
    if (!lap.by) {
      line2 = "Nobody has this one";
      act = <Button kind="primary" onClick={() => { dispatch({ t: "claim", i: sel }); setLocal({ sel }); haptic("light"); }}>I'll take it</Button>;
    } else if (lap.by === me && !lap.done) {
      line2 = "You're typing this one";
      act = (
        <div style={{ display: "flex", gap: 6 }}>
          <Button kind="deemphasized" onClick={() => dispatch({ t: "drop", i: sel })}>Drop</Button>
          <Button kind="primary" onClick={() => { dispatch({ t: "done", i: sel }); haptic("success"); }}>Notes are up</Button>
        </div>
      );
    } else if (!lap.done) {
      line2 = lap.said ? `${nameOf(lap.by)}: "${lap.said}"` : `${nameOf(lap.by)} is typing`;
      act = null;
    } else {
      line2 = lap.said ? `${nameOf(lap.by)}: "${lap.said}"` : `${lap.by === me ? "Your notes are up" : `Notes by ${nameOf(lap.by)}`}${lap.thanks.length ? ` · ${lap.thanks.length} thanks` : ""}`;
      act = lap.by === me ? null : lap.thanks.includes(me) ? (
        <span style={{ fontSize: 14, fontWeight: 600, color: c.secondaryText, whiteSpace: "nowrap" }}>{`Thanked · ${lap.thanks.length}`}</span>
      ) : (
        <Button kind="secondary" onClick={() => { dispatch({ t: "thank", i: sel }); haptic("light"); }}>Thanks</Button>
      );
    }

    const takers = [...new Set(laps.filter((l) => l.by && !l.by.startsWith("o:")).map((l) => l.by))];
    const gaps = laps.filter((l) => !l.by).length;
    const myLap = confirmed.laps.find((l) => l.by === me && l.at > 0 && running(l.at, 2400) !== null);

    return (
      <div>
        <style>{".nr-glow{animation:nrGlow 1.1s ease-in-out infinite alternate}@keyframes nrGlow{from{stroke-opacity:1}to{stroke-opacity:.45}}@media (prefers-reduced-motion:reduce){.nr-glow{animation:none}}"}</style>
        <CardHeader title={state.title} subtitle={[state.course, `${n} lectures`, gaps ? `${gaps} uncovered` : "all covered"].join(" · ")} />
        <div style={{ height: 4 }} />
        <div style={{ position: "relative", height: H }}>
          {track}
          {infield}
          {overlays}
          {fe !== null ? <div style={{ position: "absolute", left: cx, top: cy, pointerEvents: "none" }}><Burst key={confirmed.fullAt} emoji="🎉" count={10} /></div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, minHeight: 50, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${lap.when} · ${lap.topic}`}</div>
            <div style={{ fontSize: 13, lineHeight: "17px", color: !lap.by ? c.negative : c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line2}</div>
          </div>
          {act ? <div style={{ flexShrink: 0 }}>{act}</div> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginTop: 4, minWidth: 0 }}>
          {takers.length ? <Facepile users={takers} max={4} size={18} /> : null}
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {full ? "Every lecture is covered · good luck on the midterm" : takers.length ? `${takers.length} on the relay · ${gaps ? `${gaps} ${gaps === 1 ? "lap glows" : "laps glow"} red` : "every lap is taken"}` : "Tap a red lap and take it"}
          </span>
        </div>
        {fe !== null ? <Toast key={confirmed.fullAt}>Whole track covered before the finish</Toast> : myLap ? <Toast key={myLap.at}>{myLap.done ? `${myLap.when} notes are up · baton passed` : `${myLap.when} is yours`}</Toast> : null}
      </div>
    );
  },
});
