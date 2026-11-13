import { defineApp, Avatar, Burst, Button, Canvas, CardHeader, clock, fitText, haptic, mix, pal, rng, type Ctx, type DrawFrame } from "@muse/app";

// Musical chairs for the chat: chairs in a circle, everyone still in walks around them while the
// music bar bounces. The music cuts at a moment set by the server's seed; tap a chair after that and
// you sit. Tap before it and it's a false start (Calvin). When the chairs are full, whoever is
// standing is out and a chair goes away. Last one sitting wins the prize.

type Params = {
  /** Card title: "Musical chairs" */
  title: string;
  /** What the winner gets, said after their name: "picks the movie" */
  prize: string;
  /** The song on the speaker: "Mr. Brightside" */
  song: string;
  /** Already out, in order: who, and what they said */
  out: { who: string; said?: string }[];
  /** False starts so far: who and how many */
  early: { who: string; n: number }[];
};

// @params
const P: Params = {
  title: "Musical chairs",
  prize: "picks the movie",
  song: "Mr. Brightside",
  out: [
    { who: "Arun", said: "the rice cooker beeped, i had to" },
    { who: "Will", said: "i was mid-sentence" },
  ],
  early: [{ who: "Calvin", n: 4 }],
};
// @end params

type Out = { u: string; said: string };
type State = {
  title: string;
  prize: string;
  song: string;
  players: string[];
  out: Out[];
  seats: (string | null)[];
  early: Record<string, number>;
  startAt: number;
  stopAt: number;
  last: number;
};
type Action = { t: "start" } | { t: "sit"; chair: number };
type Local = { bursts: number; early: number };

const H = 236;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const alive = (s: State) => s.players.filter((u) => !s.out.some((o) => o.u === u));
const winner = (s: State) => (s.players.length >= 2 && alive(s).length === 1 ? alive(s)[0]! : null);
const chairsFor = (s: State) => Math.max(0, alive(s).length - 1);
const emptySeats = (n: number): (string | null)[] => Array.from({ length: n }, () => null);
const cutAfter = (seed: number) => 1500 + rng(seed).int(3000);

function initState(ctx: Ctx): State {
  const players = ctx.members.map((m) => m.id);
  const find = (who: unknown) => {
    const n = clean(who, 40).toLowerCase();
    return ctx.members.find((m) => m.id === n || m.name.toLowerCase() === n);
  };
  const out: Out[] = [];
  for (const o of Array.isArray(P.out) ? P.out : []) {
    const m = find(o?.who);
    if (m && !out.some((x) => x.u === m.id) && players.length - out.length > 2) out.push({ u: m.id, said: clean(o.said, 60) });
  }
  const early: Record<string, number> = {};
  for (const e of Array.isArray(P.early) ? P.early : []) {
    const m = find(e?.who);
    if (m && Number.isInteger(e.n) && e.n > 0) early[m.id] = Math.min(99, e.n);
  }
  const s: State = { title: clean(P.title, 40) || "Musical chairs", prize: clean(P.prize, 40) || "wins", song: clean(P.song, 40), players, out, seats: [], early, startAt: 0, stopAt: 0, last: 0 };
  return { ...s, seats: emptySeats(chairsFor(s)) };
}

function reduce(s: State, a: Action, meta: { user: string; time: number; seed: number }, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u) || winner(s)) return s;
  const live = alive(s);
  if (!live.includes(u) || live.length < 2) return s;
  if (a.t === "start") {
    if (s.startAt !== 0) return s;
    return { ...s, startAt: meta.time, stopAt: meta.time + cutAfter(meta.seed), seats: emptySeats(chairsFor(s)) };
  }
  if (a.t === "sit") {
    if (s.startAt === 0 || typeof a.chair !== "number" || !Number.isInteger(a.chair) || a.chair < 0 || a.chair >= s.seats.length) return s;
    if (s.seats.includes(u)) return s;
    if (meta.time < s.stopAt) return { ...s, early: { ...s.early, [u]: (s.early[u] ?? 0) + 1 } };
    if (s.seats[a.chair] !== null) return s;
    const seats = s.seats.map((x, i) => (i === a.chair ? u : x));
    if (seats.every((x) => x !== null)) {
      const standing = live.find((p) => !seats.includes(p))!;
      const next: State = { ...s, out: [...s.out, { u: standing, said: "" }], startAt: 0, stopAt: 0, last: meta.time };
      return { ...next, seats: emptySeats(chairsFor(next)) };
    }
    return { ...s, seats };
  }
  return s;
}

function onMembers(s: State, ctx: Ctx): State {
  const here = (u: string) => inChat(ctx, u);
  const kept = s.players.filter(here);
  const out = s.out.filter((o) => here(o.u)).slice(0, Math.max(0, kept.length - 1));
  const players = out.length === 0 ? ctx.members.map((m) => m.id) : kept;
  if (players.length === s.players.length && players.every((u, i) => u === s.players[i]) && out.length === s.out.length) return s;
  const next: State = { ...s, players, out, startAt: 0, stopAt: 0 };
  return { ...next, seats: emptySeats(chairsFor(next)) };
}

function chairPath(g: CanvasRenderingContext2D, x: number, y: number, ang: number, wood: string, back: string, seat: string) {
  g.save();
  g.translate(x, y);
  g.rotate(ang + Math.PI / 2);
  g.fillStyle = back;
  g.beginPath();
  g.roundRect(-15, 12, 30, 7, 3);
  g.fill();
  g.fillStyle = wood;
  g.beginPath();
  g.roundRect(-13, 18, 4, 6, 1);
  g.roundRect(9, 18, 4, 6, 1);
  g.fill();
  g.fillStyle = seat;
  g.beginPath();
  g.roundRect(-14, -12, 28, 25, 6);
  g.fill();
  g.restore();
}

export default defineApp<State, Action, Local>({
  name: "Musical chairs",
  summary: (s, ctx) => {
    const w = winner(s);
    const name = (u: string) => ctx.members.find((m) => m.id === u)?.name ?? "Someone";
    if (w) return `${name(w)} won musical chairs and ${s.prize}`;
    if (s.out.length) return `Musical chairs · round ${s.out.length + 1} · ${alive(s).length} still in`;
    return `Musical chairs · ${s.players.length} playing, nobody out yet`;
  },
  init: initState,
  reduce: (s, a, m, ctx) => reduce(s, a, m, ctx),
  onMembers,

  invariants: {
    "everyone out was playing, once": (s) => s.out.every((o) => s.players.includes(o.u)) && new Set(s.out.map((o) => o.u)).size === s.out.length,
    "one chair fewer than people still in": (s) => s.seats.length === chairsFor(s),
    "seated people are still in, once each": (s) => {
      const sat = s.seats.filter((x): x is string => x !== null);
      return new Set(sat).size === sat.length && sat.every((u) => alive(s).includes(u));
    },
    "chairs are never all full": (s) => s.seats.length === 0 || s.seats.some((x) => x === null),
    "nobody sits while the music is off": (s) => s.startAt !== 0 || s.seats.every((x) => x === null),
    "the music cuts 1.5 to 4.5 s in": (s) => (s.startAt === 0 ? s.stopAt === 0 : s.stopAt - s.startAt >= 1500 && s.stopAt - s.startAt < 4500),
    "false starts are counts": (s) => Object.values(s.early).every((n) => Number.isInteger(n) && n >= 0),
    "players are in the chat": (s, ctx) => s.players.every((u) => inChat(ctx, u)),
    "before anyone is out, everyone in the chat plays": (s, ctx) => s.out.length > 0 || (s.players.length === ctx.members.length && ctx.members.every((m) => s.players.includes(m.id))),
  },

  transitions: {
    "a seated person stays put": (p, n, a, m) => a.t !== "sit" || !p.seats.includes(m.user) || p === n,
    "a tap before the cut is a false start": (p, n, a, m) =>
      a.t !== "sit" || p === n || m.time >= p.stopAt || ((n.early[m.user] ?? 0) === (p.early[m.user] ?? 0) + 1 && n.seats.every((x, i) => x === p.seats[i])),
    "a tap after the cut seats you there": (p, n, a, m) =>
      a.t !== "sit" || p === n || m.time < p.stopAt || n.seats[a.chair] === m.user || n.out.length === p.out.length + 1,
    "a full round puts out whoever stood": (p, n, a, m) =>
      a.t !== "sit" || n.out.length === p.out.length || (n.out.length === p.out.length + 1 && !p.seats.includes(n.out[n.out.length - 1]!.u) && n.out[n.out.length - 1]!.u !== m.user && n.startAt === 0),
    "start only when the music is off": (p, n, a, m) => a.t !== "start" || p === n || (p.startAt === 0 && n.startAt === m.time && n.out.length === p.out.length),
    "people out stay out": (p, n, _a, _m, ctx) => p.out.every((o) => !inChat(ctx, o.u) || n.out.some((x) => x.u === o.u)),
    "only players still in can act": (p, n, _a, m) => p === n || alive(p).includes(m.user),
  },

  arbitrary: (s, u, r) => {
    if (s.startAt === 0 && r.next() < 0.85) return { t: "start" };
    const open = s.seats.map((x, i) => (x === null ? i : -1)).filter((i) => i >= 0);
    return { t: "sit", chair: open.length && r.next() < 0.9 ? r.pick(open) : r.int(Math.max(1, s.seats.length)) };
  },

  local: { bursts: 0, early: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const now = clock.value;
    const live = alive(state);
    const won = winner(state);
    const playing = confirmed.startAt !== 0;
    const cut = playing && now >= confirmed.stopAt;
    const music = playing && !cut;
    const imIn = live.includes(me);
    const nameOf = (u: string) => (u === me ? "You" : members.find((m) => m.id === u)?.name ?? "Someone");
    const cx = W / 2;
    const cy = 128;
    const rc = 54;
    const rw = Math.min(90, W / 2 - 30);
    const n = state.seats.length;
    const chairAt = (i: number) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n) + (n % 2 ? 0 : Math.PI / Math.max(1, n));
      return { x: cx + rc * Math.cos(ang), y: cy + rc * Math.sin(ang), ang };
    };
    const walkT = playing ? Math.min(now, confirmed.stopAt) - confirmed.startAt : 0;
    const walkers = live.filter((u) => !state.seats.includes(u));
    const walkAt = (k: number) => {
      const ang = -Math.PI / 2 + (k * 2 * Math.PI) / Math.max(1, walkers.length) + walkT / 1400;
      const bob = music ? Math.sin(now / 120 + k) * 3 : 0;
      return { x: cx + rw * Math.cos(ang), y: cy + rw * 0.92 * Math.sin(ang) + bob };
    };
    const earlyTop = Object.entries(state.early).filter(([u]) => inChat({ room: "", members }, u)).sort((a, b) => b[1] - a[1])[0];

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      const t = f.now;
      // rug
      g.fillStyle = mix(pl.purple, c.card, theme.mode === "dark" ? 0.75 : 0.86);
      g.beginPath();
      g.ellipse(cx, cy, rw + 22, (rw + 22) * 0.92, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = mix(pl.purple, c.card, 0.6);
      g.lineWidth = 2;
      g.setLineDash([3, 7]);
      g.beginPath();
      g.ellipse(cx, cy, rw + 12, (rw + 12) * 0.92, 0, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      // speaker + equalizer, top left
      g.fillStyle = mix(c.text, c.card, 0.12);
      g.beginPath();
      g.roundRect(4, 6, 22, 30, 5);
      g.fill();
      g.fillStyle = mix(c.text, c.card, 0.55);
      g.beginPath();
      g.arc(15, 25, 6, 0, Math.PI * 2);
      g.arc(15, 12, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = music ? pl.green : c.secondaryText;
      g.beginPath();
      for (let i = 0; i < 7; i++) {
        const hh = music ? 4 + Math.abs(Math.sin(t / (90 + i * 23) + i * 1.7)) * 20 : 2;
        g.roundRect(32 + i * 6, 34 - hh, 4, hh, 2);
      }
      g.fill();
      if (state.song) {
        const sf = fitText(state.song, Math.max(40, cx - 110), { g, size: 12, weight: 600 });
        g.font = sf.font;
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.fillStyle = c.secondaryText;
        g.fillText(sf.text, 4, 48);
      }
      if (music) {
        g.fillStyle = pl.purple;
        for (let k = 0; k < 3; k++) {
          const ph = ((t / 900 + k / 3) % 1);
          const nx = 30 + k * 16 + Math.sin(ph * 6) * 4;
          const ny = 30 - ph * 28;
          g.globalAlpha = 1 - ph;
          g.beginPath();
          g.ellipse(nx, ny, 3.5, 2.6, -0.4, 0, Math.PI * 2);
          g.fill();
          g.fillRect(nx + 2.5, ny - 9, 1.4, 9);
        }
        g.globalAlpha = 1;
      }
      // chairs
      for (let i = 0; i < n; i++) {
        const p = chairAt(i);
        const open = state.seats[i] === null;
        const pulse = cut && open && imIn && !state.seats.includes(me) ? 1 + 0.06 * Math.sin(t / 90) : 1;
        g.save();
        g.translate(p.x, p.y);
        g.scale(pulse, pulse);
        chairPath(g, 0, 0, p.ang, pl.brown, mix(pl.brown, c.text, 0.15), cut && open ? pl.yellow : pl.crust);
        g.restore();
      }
      if (n === 0 && !won) {
        g.strokeStyle = c.secondaryText;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.roundRect(cx - 15, cy - 13, 30, 26, 6);
        g.stroke();
        g.setLineDash([]);
      }
      // crown for the winner
      if (won) {
        g.fillStyle = pl.yellow;
        g.beginPath();
        g.moveTo(cx - 20, cy - 26);
        g.lineTo(cx - 20, cy - 44);
        g.lineTo(cx - 10, cy - 34);
        g.lineTo(cx, cy - 50);
        g.lineTo(cx + 10, cy - 34);
        g.lineTo(cx + 20, cy - 44);
        g.lineTo(cx + 20, cy - 26);
        g.closePath();
        g.fill();
      }
      // round marker, top right
      const label = fitText(won ? "Winner" : `Round ${state.out.length + 1} of ${Math.max(1, state.players.length - 1)}`, 120, { g, size: 13, weight: 600 });
      g.font = label.font;
      g.textAlign = "right";
      g.textBaseline = "top";
      g.fillStyle = c.text;
      g.fillText(label.text, w - 4, 8);
      return music || (cut && imIn);
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "down" || !playing || !imIn || state.seats.includes(me)) return;
      let best = -1;
      let d0 = 40;
      for (let i = 0; i < n; i++) {
        const p = chairAt(i);
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < d0) {
          d0 = d;
          best = i;
        }
      }
      if (best < 0) return;
      haptic(now >= confirmed.stopAt ? "success" : "medium");
      setLocal(now >= confirmed.stopAt ? { bursts: local.bursts + 1 } : { early: now });
      dispatch({ t: "sit", chair: best });
    };

    const faces = [
      ...state.seats.map((u, i) => (u ? { u, ...chairAt(i), seated: true } : null)).filter((x): x is NonNullable<typeof x> => x !== null),
      ...(won ? [{ u: won, x: cx, y: cy, seated: true }] : walkers.map((u, k) => ({ u, ...walkAt(k), seated: false }))),
    ];
    const lastOut = state.out[state.out.length - 1];
    const outRow = state.out.slice(-5);
    const mine = state.early[me] ?? 0;
    const line = won
      ? `${nameOf(won)} ${won === me ? "pick" : "picks"} ${state.prize.replace(/^picks /, "")}`
      : !imIn
        ? `You're out · cheer from the bench`
        : music
          ? "Wait for it"
          : cut
            ? state.seats.includes(me)
              ? "Seated · hold on"
              : "Music stopped · tap a chair"
            : state.out.length === 0
              ? "Tap a chair when it stops"
              : `${chairsFor(state)} ${chairsFor(state) === 1 ? "chair" : "chairs"} left for ${live.length}`;
    const quote = lastOut?.said ? `${nameOf(lastOut.u)}: "${lastOut.said}"` : earlyTop && earlyTop[1] > 1 ? `${nameOf(earlyTop[0])} · ${earlyTop[1]} false starts` : state.song ? `Now playing · ${state.song}` : "";

    return (
      <div>
        <CardHeader title={state.title} subtitle={won ? `${nameOf(won)} ${state.prize}` : `Last one sitting ${state.prize}`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`${n} chairs, ${live.length} people still in, ${state.out.length} out`} draw={draw} onPointer={onPointer} />
          {faces.map((f) => (
            <div key={f.u} style={{ position: "absolute", left: f.x - 15, top: f.y - (f.seated ? 17 : 15), display: "flex", pointerEvents: "none", borderRadius: 99, boxShadow: f.u === me ? `0 0 0 2px ${c.primary}` : "none" }}>
              <Avatar user={f.u} size={30} />
            </div>
          ))}
          {outRow.length ? (
            <div style={{ position: "absolute", left: 0, bottom: 0, display: "flex", alignItems: "center", gap: 3, padding: "2px 8px 2px 4px", borderRadius: 99, background: c.wash, pointerEvents: "none" }}>
              {outRow.map((o) => (
                <span key={o.u} style={{ display: "flex", filter: "grayscale(1)" }}>
                  <Avatar user={o.u} size={20} />
                </span>
              ))}
              <span style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, marginLeft: 2 }}>out</span>
            </div>
          ) : null}
          {local.early && now - local.early < 1400 ? (
            <div style={{ position: "absolute", left: cx - 50, top: cy - 12, width: 100, textAlign: "center", padding: "2px 0", borderRadius: 99, background: c.text, color: c.card, fontSize: 13, lineHeight: "20px", fontWeight: 600, pointerEvents: "none", transform: "rotate(-6deg)" }}>Too early</div>
          ) : null}
          {music ? (
            <div style={{ position: "absolute", right: 0, bottom: 0, padding: "2px 10px", borderRadius: 99, background: c.wash, fontSize: 12, lineHeight: "18px", color: c.text, pointerEvents: "none" }}>Walking…</div>
          ) : null}
          {local.bursts > 0 && state.seats.includes(me) ? <Burst key={local.bursts} emoji="🪑" /> : null}
        </div>
        <div style={{ marginTop: 6, minHeight: 16, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {mine > 0 && imIn && !won ? `You: ${mine} false ${mine === 1 ? "start" : "starts"} · ${quote}` : quote}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
          {!won && imIn && !playing && live.length >= 2 ? (
            <Button kind="primary" onClick={() => dispatch({ t: "start" })}>
              Start music
            </Button>
          ) : null}
        </div>
      </div>
    );
  },
});
