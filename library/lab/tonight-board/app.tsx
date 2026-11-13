import { defineApp, Button, Canvas, CardHeader, Facepile, Toast, fitText, haptic, mix, pal, type Ctx, type DrawFrame } from "@muse/app";

// Tonight board: the group's posts about tonight are scattered (open mic at 8, a free movie on the
// Quad, a dumpling fundraiser). Muse puts them up on a theater marquee with chasing bulbs, each
// with its time and walk. Tap a line to star it; your face joins the ones gathered under it and
// its bulbs light up.

type Params = {
  /** Card title */
  title: string;
  /** Under the title: the group */
  sub: string;
  /** The sign's header, painted on the marquee: "Tonight in Eastfield" */
  sign: string;
  /** Tonight's events from the group's posts: name, start time, where, minutes to walk, stars from the group so far, friends going, and a line from the post */
  events: { name: string; time: string; place: string; walk: number; stars: number; going?: string[]; said?: string }[];
};

// @params
const P: Params = {
  title: "Tonight board",
  sub: "Eastfield events · from 9 posts today",
  sign: "Tonight in Eastfield",
  events: [
    { name: "Dumpling fundraiser", time: "7:30", place: "Golden Lantern", walk: 12, stars: 22, going: ["Calvin"], said: "$5 a plate, all for the food bank" },
    { name: "Open mic", time: "8:00", place: "Kettle & Crumb", walk: 6, stars: 14, going: ["Will", "Maya"], said: "will is signed up. tsai lin has veto on his song" },
    { name: "Free movie on the Quad", time: "9:00", place: "the Quad", walk: 3, stars: 31, going: ["Arun", "Tsai Lin"], said: "bring a blanket, it's cold" },
    { name: "Glow bowling", time: "10:30", place: "Midtown Lanes", walk: 18, stars: 9 },
  ],
};
// @end params

type Ev = { name: string; time: string; place: string; walk: number; stars: number; going: string[]; said: string };
type State = { title: string; sub: string; sign: string; events: Ev[]; last: { who: string; i: number; at: number } | null };
type Action = { t: "star"; i: number };
type Local = { toast: number };

const HEAD = 40;
const ROW = 50;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const total = (e: Ev) => e.stars + e.going.length;
const signH = (n: number) => HEAD + n * ROW + 14;
const nameOf = (id: string, ctx: { members: { id: string; name: string }[] }) => (id.startsWith("~") ? id.slice(1) : ctx.members.find((m) => m.id === id)?.name ?? "Friend");

function initState(ctx: Ctx): State {
  const events: Ev[] = [];
  for (const x of Array.isArray(P.events) ? P.events : []) {
    const name = clean(x?.name, 32);
    if (!name || events.length >= 6) continue;
    const going: string[] = [];
    for (const g of Array.isArray(x.going) ? x.going : []) {
      const nm = clean(g, 20);
      if (!nm) continue;
      const m = ctx.members.find((y) => y.id === nm || y.name.toLowerCase() === nm.toLowerCase());
      const id = m ? m.id : `~${nm}`;
      if (!going.includes(id)) going.push(id);
    }
    events.push({ name, time: clean(x.time, 8), place: clean(x.place, 24), walk: isInt(x.walk, 0, 120) ? x.walk : 0, stars: isInt(x.stars, 0, 9999) ? x.stars : 0, going, said: clean(x.said, 60) });
  }
  if (!events.length) events.push({ name: "Something on the Quad", time: "8:00", place: "the Quad", walk: 5, stars: 0, going: [], said: "" });
  return { title: clean(P.title, 40) || "Tonight board", sub: clean(P.sub, 60), sign: clean(P.sign, 28) || "Tonight", events, last: null };
}

function drawSign(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string) {
  const t = f.theme;
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const W = f.width;
  const H = signH(s.events.length);
  const frame = dk ? mix(pl.red, c.wash, 0.35) : mix(pl.red, c.text, 0.25);
  const board = dk ? mix(c.wash, c.text, 0.04) : mix(c.text, pl.purple, 0.1);
  const bulbOn = pl.yellow;
  const bulbOff = dk ? mix(pl.yellow, c.wash, 0.7) : mix(pl.yellow, frame, 0.65);
  // Frame and board.
  g.beginPath();
  g.roundRect(0, 0, W, H, 14);
  g.fillStyle = frame;
  g.fill();
  g.beginPath();
  g.roundRect(12, HEAD - 4, W - 24, H - HEAD - 8, 6);
  g.fillStyle = board;
  g.fill();
  // Chasing bulbs around the frame.
  const step = 15;
  const pts: [number, number][] = [];
  for (let x = 8; x <= W - 8; x += step) pts.push([x, 7]);
  for (let y = 7 + step; y <= H - 7; y += step) pts.push([W - 7, y]);
  for (let x = W - 8 - step; x >= 8; x -= step) pts.push([x, H - 7]);
  for (let y = H - 7 - step; y > 7; y -= step) pts.push([7, y]);
  const tick = Math.floor(f.now / 160);
  const on = new Path2D();
  const off = new Path2D();
  pts.forEach(([x, y], k) => {
    const p = (k + tick) % 4 === 0 ? on : off;
    p.moveTo(x + 3, y);
    p.arc(x, y, 3, 0, Math.PI * 2);
  });
  g.fillStyle = bulbOff;
  g.fill(off);
  g.fillStyle = bulbOn;
  g.fill(on);
  // Header lettering.
  const hd = fitText(s.sign, W - 60, { g, size: 17, min: 12, weight: 800 });
  g.font = hd.font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = mix(pl.yellow, c.card, 0.7);
  if (dk) g.fillStyle = mix(pl.yellow, c.text, 0.5);
  g.fillText(hd.text, W / 2, HEAD / 2 + 2);

  // Rows: letter-board lines with a time tile, the name, place and walk, and the stars.
  const maxStars = Math.max(1, ...s.events.map(total));
  s.events.forEach((e, i) => {
    const y = HEAD + i * ROW + 4;
    const mine = e.going.includes(me);
    const fresh = s.last && s.last.i === i ? Math.max(0, 1 - (f.now - s.last.at) / 900) : 0;
    if (mine || fresh > 0) {
      g.beginPath();
      g.roundRect(16, y + 1, W - 32, ROW - 4, 6);
      g.fillStyle = mix(board, pl.yellow, 0.12 + fresh * 0.25);
      g.fill();
    }
    if (i > 0) {
      g.fillStyle = mix(board, c.card, 0.12);
      g.fillRect(22, y - 1, W - 44, 1);
    }
    // Time tile.
    g.beginPath();
    g.roundRect(22, y + 9, 44, 26, 4);
    g.fillStyle = mix(pl.yellow, c.card, 0.25);
    g.fill();
    const tm = fitText(e.time, 40, { g, size: 13, min: 10, weight: 800 });
    g.font = tm.font;
    g.textAlign = "center";
    g.fillStyle = dk ? c.wash : c.text;
    g.fillText(tm.text, 44, y + 22.5);
    // Name and where.
    const room = W - 74 - 96;
    const nm = fitText(e.name, room, { g, size: 14, min: 11, weight: 700 });
    g.font = nm.font;
    g.textAlign = "left";
    g.fillStyle = dk ? c.text : c.card;
    g.fillText(nm.text, 74, y + 15);
    const where = fitText(`${e.place}${e.walk ? ` · ${e.walk} min walk` : ""}`, room, { g, size: 11, min: 10, weight: 500 });
    g.font = where.font;
    g.fillStyle = dk ? mix(c.text, c.wash, 0.25) : mix(c.card, board, 0.22);
    g.fillText(where.text, 74, y + 31);
    // Heat: a row of small bulbs by how many starred it.
    const lit = Math.round((total(e) / maxStars) * 6);
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.arc(74 + k * 9 + 3, y + 42, 2.4, 0, Math.PI * 2);
      g.fillStyle = k < lit ? bulbOn : mix(board, c.card, 0.2);
      g.fill();
    }
    // The star.
    const sx = W - 34;
    const sy = y + 22;
    const pop = fresh > 0 && mine ? 1 + Math.sin(fresh * Math.PI) * 0.35 : 1;
    g.save();
    g.translate(sx, sy);
    g.scale(pop, pop);
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 4.2 : 10;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      if (k === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    if (mine) {
      g.fillStyle = bulbOn;
      g.fill();
    } else {
      g.lineWidth = 1.6;
      g.strokeStyle = mix(c.card, board, 0.35);
      if (dk) g.strokeStyle = mix(c.text, c.wash, 0.3);
      g.stroke();
    }
    g.restore();
  });
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Tonight board",
  summary: (s) => {
    const top = [...s.events].sort((a, b) => total(b) - total(a))[0]!;
    return `${s.sign}: ${s.events.length} things tonight · most stars: ${top.name} at ${top.time} (${total(top)})`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    const u = m.user;
    if (!inChat(ctx, u) || a.t !== "star" || !isInt(a.i, 0, s.events.length - 1)) return s;
    const e = s.events[a.i]!;
    const going = e.going.includes(u) ? e.going.filter((x) => x !== u) : [...e.going, u];
    return { ...s, events: s.events.map((x, k) => (k === a.i ? { ...x, going } : x)), last: { who: u, i: a.i, at: m.time } };
  },

  onMembers: (s, ctx) => {
    const gone = (u: string) => !u.startsWith("~") && !inChat(ctx, u);
    if (!s.events.some((e) => e.going.some(gone))) return s;
    return { ...s, events: s.events.map((e) => ({ ...e, going: e.going.filter((u) => !gone(u)) })) };
  },

  invariants: {
    "one star per person per event": (s) => s.events.every((e) => new Set(e.going).size === e.going.length),
    "stars come from the group": (s, ctx) => s.events.every((e) => e.going.every((u) => u.startsWith("~") || inChat(ctx, u))),
    "the last star points at a real line": (s) => !s.last || isInt(s.last.i, 0, s.events.length - 1),
  },

  transitions: {
    "a star toggles only you on that line": (p, n, a, m) => {
      if (a.t !== "star" || p === n) return true;
      const was = p.events[a.i]!.going;
      const now = n.events[a.i]!.going;
      return now.includes(m.user) !== was.includes(m.user) && now.filter((u) => u !== m.user).join() === was.filter((u) => u !== m.user).join() && n.last?.at === m.time && n.last.who === m.user && n.last.i === a.i;
    },
    "other lines keep their stars": (p, n, a) => a.t !== "star" || n.events.every((e, k) => k === a.i || e.going.join() === p.events[k]!.going.join()),
    "the posts never change": (p, n) => n.events.length === p.events.length && n.events.every((e, k) => e.name === p.events[k]!.name && e.stars === p.events[k]!.stars && e.time === p.events[k]!.time),
    "only the group stars": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => ({ t: "star", i: r.int(s.events.length) }),

  local: { toast: 0 },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const H = signH(s.events.length);
    const mine = s.events.map((e, i) => (e.going.includes(me) ? i : -1)).filter((i) => i >= 0);
    const top = s.events.map((_, i) => i).sort((a, b) => total(s.events[b]!) - total(s.events[a]!) || a - b)[0]!;
    const quote = s.events.find((e) => e.said);
    const friends = [...new Set(s.events.flatMap((e) => e.going))];
    const ctxish = { members };
    const star = (i: number) => {
      const e = s.events[i]!;
      haptic(e.going.includes(me) ? "light" : "success");
      if (!e.going.includes(me)) setLocal({ toast: local.toast + 1 });
      dispatch({ t: "star", i });
    };
    const latest = s.last && s.last.who !== me ? s.last : null;

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`A marquee of tonight: ${s.events.map((e) => `${e.time} ${e.name} at ${e.place}, ${total(e)} stars`).join("; ")}`} draw={(g, f) => drawSign(g, f, s, me)} />
          {s.events.map((e, i) => {
            const shown = e.going.map((u) => ({ id: u, name: nameOf(u, ctxish) }));
            return (
              <button
                key={i}
                type="button"
                aria-label={`${e.going.includes(me) ? "Unstar" : "Star"} ${e.name} at ${e.time}, ${total(e)} stars`}
                aria-pressed={e.going.includes(me)}
                onClick={() => star(i)}
                style={{ position: "absolute", left: 14, right: 14, top: HEAD + i * ROW + 2, height: ROW - 2, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 46, borderRadius: 6 }}
              >
                {shown.length ? <Facepile users={shown} max={3} size={18} /> : null}
                <span style={{ marginLeft: 4, minWidth: 18, fontSize: 12, fontWeight: 700, padding: "0 3px", borderRadius: 4, background: theme.mode === "dark" ? mix(c.wash, c.text, 0.04) : mix(c.text, pal(theme).purple, 0.1), color: theme.mode === "dark" ? c.text : c.card }}>{total(e)}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, marginTop: 4, minWidth: 0 }}>
          {latest ? (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{`${first(nameOf(latest.who, ctxish))} starred ${s.events[latest.i]!.name.toLowerCase()}`}</span>
          ) : quote ? (
            <>
              <b style={{ fontSize: 13, lineHeight: "16px", color: c.text, flexShrink: 0, maxWidth: "45%", ...ell }}>{quote.name}</b>
              <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>{`“${quote.said}”`}</span>
            </>
          ) : (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>Star what you're going to so friends can find you</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, minWidth: 0 }}>
          {friends.length ? <Facepile users={friends.map((u) => ({ id: u, name: nameOf(u, ctxish) }))} max={5} size={20} /> : null}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>
            {mine.length ? `You're going to ${mine.length === 1 ? s.events[mine[0]!]!.name.toLowerCase() : `${mine.length} things`}` : friends.length ? `${friends.length} friends starred something` : "Nobody has starred anything yet"}
          </span>
          {mine.includes(top) ? null : (
            <Button kind="primary" onClick={() => star(top)}>
              {`Star ${s.events[top]!.time}`}
            </Button>
          )}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>Starred · your face is on the board</Toast> : null}
      </div>
    );
  },
});
