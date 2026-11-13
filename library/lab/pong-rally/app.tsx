import { Avatar, Button, Canvas, CardHeader, Toast, clock, defineApp, haptic, innerWidth, mix, pal, rng, running, type Ctx } from "@muse/app";

// Pong rally: the table tennis club's rally ladder. A table from above with the club's ball
// machine on the far side; serve, then tap as the ball reaches your paddle. Every return comes
// back a little faster. Miss and the rally's over: post it and your face climbs the ladder.

type Params = {
  /** Card title */
  title: string;
  /** Club name */
  club: string;
  /** What the ball machine is called */
  machine: string;
  /** Best rallies so far: name, count, and what they said */
  best: { name: string; n: number; said?: string }[];
};

// @params
const P: Params = {
  title: "Rally ladder",
  club: "Eastfield Table Tennis",
  machine: "Spinny",
  best: [
    { name: "Will", n: 25, said: "25. same as my shower, coincidence" },
    { name: "Maya", n: 19, said: "I have a spreadsheet of spin types" },
    { name: "Arun", n: 12, said: "the rice cooker beeped and I lost focus" },
    { name: "Calvin", n: 7, said: "seven. it's a theme" },
  ],
};
// @end params

type Best = { n: number; at: number; tries: number };
type State = { title: string; club: string; machine: string; best: { [u: string]: Best }; said: { [u: string]: string }; last: { by: string; n: number; at: number } | null };
type Action = { t: "score"; n: number };
type Local = { start: number; hits: number; flash: number };

const MAXN = 500;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
// Timing: leg i takes leg(i) ms; my k-th return is due at the end of leg 2k; the window shrinks.
const leg = (i: number) => Math.max(300, 760 - 22 * i);
const dueOf = (k: number) => {
  let t = 900;
  for (let i = 0; i <= 2 * k; i++) t += leg(i);
  return t;
};
const win = (k: number) => Math.max(95, 175 - 5 * k);

function initState(ctx: Ctx): State {
  const best: { [u: string]: Best } = {};
  const said: { [u: string]: string } = {};
  for (const b of Array.isArray(P.best) ? P.best : []) {
    const m = ctx.members.find((x) => x.id === b?.name || x.name.toLowerCase() === clean(b?.name, 40).toLowerCase());
    if (!m || best[m.id] || !isInt(b.n, 0, MAXN)) continue;
    best[m.id] = { n: b.n, at: 0, tries: 1 };
    const q = clean(b.said, 60);
    if (q) said[m.id] = q;
  }
  return { title: clean(P.title, 40) || "Rally ladder", club: clean(P.club, 40), machine: clean(P.machine, 16) || "the machine", best, said, last: null };
}

export default defineApp<State, Action, Local>({
  name: "Pong rally",
  summary: (s, ctx) => {
    const top = Object.entries(s.best).sort((a, b) => b[1].n - a[1].n)[0];
    const who = top ? (ctx.members.find((m) => m.id === top[0])?.name ?? "Someone") : "";
    return top ? `${s.club || s.title} rally ladder · ${who} leads with ${top[1].n}` : `${s.club || s.title} rally ladder · no rallies yet`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || a.t !== "score" || !isInt(a.n, 0, MAXN)) return s;
    const prev = s.best[m.user];
    const best = { n: Math.max(prev?.n ?? 0, a.n), at: !prev || a.n > prev.n ? m.time : prev.at, tries: (prev?.tries ?? 0) + 1 };
    return { ...s, best: { ...s.best, [m.user]: best }, last: { by: m.user, n: a.n, at: m.time } };
  },

  onMembers: (s, ctx) => {
    const ok = (u: string) => inChat(ctx, u);
    if (Object.keys(s.best).every(ok) && Object.keys(s.said).every(ok) && (!s.last || ok(s.last.by))) return s;
    const f = <T,>(o: { [u: string]: T }) => Object.fromEntries(Object.entries(o).filter(([u]) => ok(u))) as { [u: string]: T };
    return { ...s, best: f(s.best), said: f(s.said), last: s.last && ok(s.last.by) ? s.last : null };
  },

  invariants: {
    "bests are whole rallies": (s) => Object.values(s.best).every((b) => isInt(b.n, 0, MAXN) && isInt(b.tries, 1, 1_000_000)),
    "players are in the chat": (s, ctx) => Object.keys(s.best).every((u) => inChat(ctx, u)),
    "the last rally is on the board and never beats the best": (s) => !s.last || (!!s.best[s.last.by] && s.last.n <= s.best[s.last.by]!.n),
  },

  transitions: {
    "only chat members change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a rally keeps the best and counts the try": (p, n, a, m) => {
      if (p === n) return true;
      const b = n.best[m.user]!;
      const was = p.best[m.user];
      return b.n === Math.max(was?.n ?? 0, a.n) && b.tries === (was?.tries ?? 0) + 1 && n.last?.by === m.user && n.last.n === a.n && n.last.at === m.time;
    },
    "a valid rally is never dropped": (p, n, a, m, ctx) => p !== n || !(inChat(ctx, m.user) && isInt(a.n, 0, MAXN)),
    "other players are untouched": (p, n, _a, m) => Object.keys({ ...p.best, ...n.best }).every((u) => u === m.user || p.best[u] === n.best[u]),
  },

  arbitrary: (_s, _u, r) => ({ t: "score", n: r.next() < 0.1 ? r.int(MAXN + 1) : r.int(40) }),

  local: { start: 0, hits: 0, flash: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = Math.min(innerWidth(), theme.width - 24);
    const H = W < 340 ? 146 : 160;
    const playing = local.start > 0;
    const now = playing ? clock.value : 0;
    const t = now - local.start;
    const over = playing && t > dueOf(local.hits) + win(local.hits);
    const score = local.hits;
    const nameOf = (u: string) => (u === me ? "You" : (members.find((m) => m.id === u)?.name ?? "Someone"));
    const mine = state.best[me];

    // Geometry
    const tx = 44, tw = W - 76, ty = 14, th = H - 28;
    const xMe = tx + 6, xOpp = tx + tw - 6;
    const laneY = (i: number) => ty + 14 + rng(9000 + i).next() * (th - 28);
    const ballAt = (ms: number): { x: number; y: number; z: number; leg: number } => {
      if (ms < 900) return { x: xOpp, y: ty + th / 2, z: 0, leg: -1 };
      let s0 = 900;
      for (let i = 0; i < 400; i++) {
        const L = leg(i);
        if (ms < s0 + L) {
          const f = (ms - s0) / L;
          const toMe = i % 2 === 0;
          const x0 = toMe ? xOpp : xMe, x1 = toMe ? xMe : xOpp;
          return { x: x0 + (x1 - x0) * f, y: laneY(i) + (laneY(i + 1) - laneY(i)) * f, z: Math.sin(f * Math.PI) * (1 - Math.abs(f - 0.5)), leg: i };
        }
        s0 += L;
      }
      return { x: xMe, y: ty + th / 2, z: 0, leg: 0 };
    };

    const draw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number }) => {
      const w = f.width, h = f.height;
      g.fillStyle = mix(p.shade, c.card, 0.2);
      g.beginPath();
      g.roundRect(0, 0, w, h, 12);
      g.fill();
      // table
      g.fillStyle = mix(p.blue, p.dark, 0.25);
      g.beginPath();
      g.roundRect(tx, ty, tw, th, 4);
      g.fill();
      g.strokeStyle = p.cream;
      g.lineWidth = 2;
      g.strokeRect(tx + 1, ty + 1, tw - 2, th - 2);
      g.beginPath();
      g.moveTo(tx, ty + th / 2);
      g.lineTo(tx + tw, ty + th / 2);
      g.lineWidth = 1;
      g.stroke();
      // net
      g.fillStyle = p.cream;
      g.fillRect(tx + tw / 2 - 2, ty - 6, 4, th + 12);
      g.fillStyle = mix(p.cream, p.dark, 0.25);
      for (let y = ty - 4; y < ty + th + 6; y += 6) g.fillRect(tx + tw / 2 - 1, y, 2, 2);
      // ball and paddles
      const tt = playing ? f.now - local.start : 0;
      const b = playing && !over ? ballAt(tt) : { x: xMe + 18, y: ty + th / 2, z: Math.abs(Math.sin(f.now / 260)) * 0.8, leg: -1 };
      const dueK = local.hits;
      const near = playing && !over && Math.abs(tt - dueOf(dueK)) <= win(dueK);
      // hit zone glow on my side
      if (playing && !over) {
        g.globalAlpha = near ? 0.35 : 0.12;
        g.fillStyle = p.yellow;
        g.fillRect(tx, ty, 34, th);
        g.globalAlpha = 1;
      }
      // shadow then ball
      g.fillStyle = mix(p.dark, p.blue, 0.3);
      g.globalAlpha = 0.5;
      g.beginPath();
      g.ellipse(b.x + 3, b.y + 4, 5, 3, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = p.orange;
      g.beginPath();
      g.arc(b.x, b.y - b.z * 16, 5 + b.z * 2, 0, Math.PI * 2);
      g.fill();
      // paddles follow the ball's lane
      const pyMe = playing && !over ? Math.max(ty + 14, Math.min(ty + th - 14, b.y)) : ty + th / 2;
      const pyOpp = playing && !over ? Math.max(ty + 14, Math.min(ty + th - 14, b.leg % 2 === 1 ? b.y : ty + th / 2)) : ty + th / 2;
      const fl = local.flash > 0 ? Math.max(0, 1 - (f.now - local.flash) / 250) : 0;
      g.fillStyle = p.red;
      g.beginPath();
      g.ellipse(xMe - 8 - fl * 6, pyMe, 8, 12, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.brown;
      g.fillRect(xMe - 18 - fl * 6, pyMe - 2.5, 4, 5);
      // the ball machine: a little robot on the far side
      g.fillStyle = p.purple;
      g.beginPath();
      g.roundRect(xOpp + 4, pyOpp - 16, 20, 32, 6);
      g.fill();
      g.fillStyle = p.cream;
      g.beginPath();
      g.arc(xOpp + 11, pyOpp - 5, 3, 0, Math.PI * 2);
      g.arc(xOpp + 18, pyOpp - 5, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.dark;
      g.fillRect(xOpp + 1, pyOpp + 4, 6, 6);
      return true;
    };

    // Ladder: everyone's best, high to low, mine highlighted.
    const ladder = Object.entries(state.best).filter(([u]) => members.some((m) => m.id === u)).sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1));
    const rung = (u: string, b: Best, k: number) => {
      const recent = confirmed.best[u] && confirmed.best[u]!.at > 0 && running(confirmed.best[u]!.at, 900) !== null;
      return (
        <div key={u} class={recent ? "pr-climb" : ""} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flex: "1 1 0", minWidth: 0, paddingTop: Math.min(18, k * 5) }}>
          <span style={{ display: "flex", borderRadius: 99, boxShadow: u === me ? `0 0 0 2px ${c.primary}` : k === 0 ? `0 0 0 2px ${p.yellow}` : "none" }}>
            <Avatar user={u} size={k === 0 ? 30 : 24} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, lineHeight: "16px", color: c.text }}>{b.n}</span>
        </div>
      );
    };

    let line1: string;
    let act;
    if (!playing) {
      line1 = mine ? `Your best: ${mine.n} · beat it` : `Rally ${state.machine} · tap as it reaches you`;
      act = <Button kind="primary" onClick={() => { setLocal({ start: clock.value, hits: 0, flash: 0 }); haptic("light"); }}>Serve</Button>;
    } else if (!over) {
      line1 = `${score} in a row`;
      act = <span style={{ fontSize: 13, fontWeight: 600, color: c.secondaryText, whiteSpace: "nowrap" }}>Tap the table</span>;
    } else {
      line1 = `Rally over · ${score} ${score === 1 ? "return" : "returns"}${mine && score > mine.n ? " · new best" : ""}`;
      act = (
        <div style={{ display: "flex", gap: 6 }}>
          <Button kind="deemphasized" onClick={() => setLocal({ start: clock.value, hits: 0, flash: 0 })}>Again</Button>
          <Button kind="primary" onClick={() => { dispatch({ t: "score", n: Math.min(MAXN, score) }); setLocal({ start: 0, hits: 0 }); haptic("success"); }}>{`Post ${score}`}</Button>
        </div>
      );
    }

    const quoted = ladder.map(([u]) => u).find((u) => state.said[u] && u !== me);
    const lastMine = confirmed.last && confirmed.last.by === me && running(confirmed.last.at, 2400) !== null ? confirmed.last : null;
    const rank = ladder.findIndex(([u]) => u === me);

    return (
      <div>
        <style>{".pr-climb{animation:prC .8s cubic-bezier(.3,1.5,.6,1)}@keyframes prC{from{transform:translateY(16px);opacity:.3}to{transform:none;opacity:1}}@media (prefers-reduced-motion:reduce){.pr-climb{animation:none}}"}</style>
        <CardHeader title={state.title} subtitle={[state.club, `vs ${state.machine}`].filter(Boolean).join(" · ")} />
        <div style={{ height: 4 }} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={playing ? `Rally in progress, ${score} returns` : `Table with ${state.machine} on the far side`} draw={draw} />
          {playing && !over ? (
            <button type="button" aria-label="Hit it" onPointerDown={() => {
              const tt = clock.value - local.start;
              const k = local.hits;
              if (Math.abs(tt - dueOf(k)) <= win(k)) {
                setLocal({ hits: k + 1, flash: clock.value });
                haptic("light");
              }
            }} style={{ position: "absolute", inset: 0, padding: 0, border: 0, borderRadius: 12, background: "transparent", cursor: "pointer" }} />
          ) : null}
          <span style={{ position: "absolute", left: 4, top: H / 2 - 13, display: "flex", borderRadius: 99, boxShadow: `0 0 0 2px ${c.card}`, pointerEvents: "none" }}><Avatar user={me} size={26} /></span>
          {playing && !over ? (
            <span style={{ position: "absolute", left: W / 2 - 30, top: 2, width: 60, textAlign: "center", fontSize: 22, fontWeight: 800, lineHeight: "26px", color: c.text, pointerEvents: "none" }}>{score}</span>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, minHeight: 44, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line1}</div>
          <div style={{ flexShrink: 0 }}>{act}</div>
        </div>
        <div role="group" aria-label="Rally ladder" style={{ display: "flex", alignItems: "flex-start", gap: 4, marginTop: 6, minHeight: 52, padding: "6px 6px 4px", borderRadius: 12, background: c.wash }}>
          {ladder.length ? ladder.slice(0, 6).map(([u, b], k) => rung(u, b, k)) : (
            <span style={{ fontSize: 13, color: c.secondaryText, padding: "10px 4px" }}>Nobody's on the ladder yet · first rally sets the bar</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginTop: 4, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {quoted ? `${nameOf(quoted)}: "${state.said[quoted]}"` : `${ladder.length} on the ladder`}
          </span>
        </div>
        {lastMine ? <Toast key={lastMine.at}>{rank >= 0 ? `Posted ${lastMine.n} · you're number ${rank + 1}` : `Posted ${lastMine.n}`}</Toast> : null}
      </div>
    );
  },
});
