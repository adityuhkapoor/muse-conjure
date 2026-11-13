import { defineApp, Button, Canvas, CardHeader, Facepile, fitText, haptic, mix, pal, running, userColor, type Ctx, type DrawFrame, type Theme } from "@muse/app";

// Listening party: the album everyone's been waiting for drops at midnight and the chat listens
// together. A vinyl spins with each track as a band of grooves; the needle sits on the track
// that's playing. Everyone slaps a sticker per track (fire, fine, skip) and it sticks to that
// groove and spins with the record. After the last track: the group's ranked tracklist and the
// one track everyone agreed on.

type Params = {
  /** Card title, e.g. "Listening party" */
  title: string;
  /** The album and artist: "Neon Valley · Lumen Park" */
  album: string;
  /** The tracks in order */
  tracks: string[];
  /** Which track is playing now (0 is the first) */
  now: number;
  /** Stickers already on the record: who, which track, 0 fire, 1 fine, 2 skip, and what they said */
  reactions: { who: string; track: number; r: number; said?: string }[];
};

// @params
const P: Params = {
  title: "Listening party",
  album: "Neon Valley · Lumen Park",
  tracks: ["Static Bloom", "Kettle Song", "Interlude (Lot C)", "Glass Hours", "Two Moons Late", "Paper Planes", "Miller Hill", "Slow Burn", "Afterglow", "Lake Wren"],
  now: 4,
  reactions: [
    { who: "Maya", track: 0, r: 0, said: "already made a spreadsheet ranking these" },
    { who: "Calvin", track: 0, r: 0 },
    { who: "Will", track: 0, r: 1 },
    { who: "Tsai Lin", track: 0, r: 0 },
    { who: "Arun", track: 1, r: 0, said: "this one goes with rice cooker steam" },
    { who: "Maya", track: 1, r: 0 },
    { who: "Calvin", track: 1, r: 1 },
    { who: "Tsai Lin", track: 2, r: 2, said: "aux veto. skip the interlude" },
    { who: "Will", track: 2, r: 2 },
    { who: "Arun", track: 2, r: 1 },
    { who: "Calvin", track: 3, r: 0, said: "woke up for this. alarm 4 of 7" },
    { who: "Maya", track: 3, r: 0 },
    { who: "Will", track: 3, r: 0 },
    { who: "Tsai Lin", track: 3, r: 0 },
    { who: "Arun", track: 3, r: 0 },
    { who: "Tsai Lin", track: 4, r: 1 },
    { who: "Will", track: 4, r: 0, said: "playing this in the sube tomorrow" },
  ],
};
// @end params

type Sticker = { who: string; name: string; track: number; r: number; at: number };
type State = { title: string; album: string; tracks: string[]; now: number; stickers: Sticker[]; said: { who: string; name: string; track: number; text: string }[]; at: number };
type Action = { t: "react"; r: number } | { t: "next" };

const CH = 214;
const NAMES = ["Fire", "Fine", "Skip"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const done = (s: State) => s.now >= s.tracks.length;
const score = (s: State, k: number) => s.stickers.reduce((n, x) => n + (x.track === k ? [2, 1, 0][x.r]! : 0), 0);
const voters = (s: State, k: number) => s.stickers.filter((x) => x.track === k);
/** Tracks best first: points, then more fire, then album order. */
const ranked = (s: State) => s.tracks.map((_, k) => k).sort((a, b) => score(s, b) - score(s, a) || voters(s, b).filter((x) => x.r === 0).length - voters(s, a).filter((x) => x.r === 0).length || a - b);
/** The track everyone who weighed in called fire, with the most people; -1 if none. */
const agreed = (s: State) => {
  let best = -1;
  let n = 1;
  s.tracks.forEach((_, k) => {
    const v = voters(s, k);
    if (v.length > n && v.every((x) => x.r === 0)) {
      best = k;
      n = v.length;
    }
  });
  return best;
};
const reactColor = (r: number, t: Theme) => {
  const p = pal(t);
  return r === 0 ? p.orange : r === 1 ? p.yellow : mix(p.blue, t.color.secondaryText, 0.3);
};

function initState(ctx: Ctx): State {
  const tracks = (Array.isArray(P.tracks) ? P.tracks : []).map((x) => clean(x, 28)).filter(Boolean).slice(0, 12);
  while (tracks.length < 3) tracks.push(`Track ${tracks.length + 1}`);
  const stickers: Sticker[] = [];
  const said: State["said"] = [];
  for (const x of Array.isArray(P.reactions) ? P.reactions : []) {
    const nm = clean(x?.who, 20);
    if (!nm || !isInt(x.track, 0, tracks.length - 1) || !isInt(x.r, 0, 2)) continue;
    const m = ctx.members.find((y) => y.id === nm || y.name.toLowerCase() === nm.toLowerCase());
    const who = m ? m.id : `~${nm}`;
    if (stickers.some((y) => y.who === who && y.track === x.track)) continue;
    stickers.push({ who, name: m ? clean(m.name, 20) || nm : nm, track: x.track, r: x.r, at: 0 });
    const text = clean(x.said, 60);
    if (text) said.push({ who, name: nm, track: x.track, text });
  }
  const now = isInt(P.now, 0, tracks.length - 1) ? P.now : 0;
  return { title: clean(P.title, 40) || "Listening party", album: clean(P.album, 48), tracks, now, stickers: stickers.filter((x) => x.track <= now), said: said.filter((x) => x.track <= now), at: 0 };
}

function drawRecord(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string) {
  const t = f.theme;
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const W = f.width;
  const R = Math.min(102, (CH - 10) / 2, W * 0.29);
  const cx = R + 6;
  const cy = CH / 2;
  const n = s.tracks.length;
  const over = done(s);
  const end = over ? (s.at ? running(s.at, 1400) : null) : null;
  // The record slows to a stop when the album ends.
  const spin = over ? (end === null ? 0 : (1 - end / 1400) * 0.9) : 0.9;
  const ang = (f.now / 1000) * spin;
  const inner = R * 0.42;
  const band = (R - 6 - inner) / n;
  const rOf = (k: number) => R - 6 - band * (k + 0.5);

  // Turntable plinth behind the record.
  g.beginPath();
  g.roundRect(0, 0, W, CH, 14);
  g.fillStyle = dk ? mix(pl.brown, c.wash, 0.55) : mix(pl.wall, c.secondaryText, 0.12);
  g.fill();

  // Vinyl.
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fillStyle = dk ? mix(c.wash, c.text, 0.06) : mix(c.text, pl.purple, 0.08);
  g.fill();
  // Grooves: a thin ring between tracks, the playing track a little lighter.
  for (let k = 0; k < n; k++) {
    const r0 = R - 6 - band * k;
    if (k === s.now && !over) {
      g.beginPath();
      g.arc(cx, cy, r0 - band / 2, 0, Math.PI * 2);
      g.lineWidth = band;
      g.strokeStyle = mix(c.text, pl.purple, dk ? 0.5 : 0.3);
      if (dk) g.strokeStyle = mix(c.wash, pl.purple, 0.35);
      g.stroke();
    }
    g.beginPath();
    g.arc(cx, cy, r0, 0, Math.PI * 2);
    g.lineWidth = 1;
    g.strokeStyle = dk ? mix(c.wash, c.text, 0.18) : mix(c.text, c.card, 0.18);
    g.stroke();
  }

  // Stickers ride the grooves.
  let anim = !over || end !== null;
  const order = new Map<string, number>();
  for (const x of s.stickers) {
    const k = order.get(`${x.track}`) ?? 0;
    order.set(`${x.track}`, k + 1);
    const a = ang + k * 0.9 + x.track * 1.7;
    let px = cx + Math.cos(a) * rOf(x.track);
    let py = cy + Math.sin(a) * rOf(x.track);
    const fly = x.at ? running(x.at, 650) : null;
    let size = Math.min(8, band * 0.5 + 2);
    if (fly !== null) {
      anim = true;
      const u = fly / 650;
      const e = 1 - (1 - u) * (1 - u);
      px = W - 40 + (px - (W - 40)) * e;
      py = CH + 10 + (py - CH - 10) * e - Math.sin(u * Math.PI) * 30;
      size *= 1 + (1 - e) * 1.2;
    }
    g.beginPath();
    g.arc(px, py, size, 0, Math.PI * 2);
    g.fillStyle = reactColor(x.r, t);
    g.fill();
    g.lineWidth = x.who === me ? 2.5 : 1.5;
    g.strokeStyle = x.who === me ? c.primary : userColor(x.who, t);
    g.stroke();
  }

  // Center label: the track that's playing, or the group's number one.
  g.beginPath();
  g.arc(cx, cy, inner, 0, Math.PI * 2);
  g.fillStyle = dk ? mix(pl.red, c.wash, 0.25) : mix(pl.red, c.text, 0.3);
  g.fill();
  g.beginPath();
  g.arc(cx, cy, 2.5, 0, Math.PI * 2);
  g.fillStyle = c.text;
  g.fill();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = c.onPrimary;
  const top = over ? "group's #1" : `track ${s.now + 1}`;
  const name = over ? s.tracks[ranked(s)[0]!]! : s.tracks[s.now]!;
  const a1 = fitText(top, inner * 1.5, { g, size: 10, min: 10, weight: 600 });
  g.font = a1.font;
  g.fillText(a1.text, cx, cy - 10);
  const a2 = fitText(name, inner * 1.75, { g, size: 12, min: 10, weight: 700 });
  g.font = a2.font;
  g.fillText(a2.text, cx, cy + 9);

  // Tonearm from the top right of the record, needle on the playing track's band.
  const bx = cx + R + 8;
  const by = 18;
  const target = over ? R + 4 : rOf(Math.min(s.now, n - 1));
  const move = s.at ? running(s.at, 900) : null;
  const prev = over ? rOf(n - 1) : rOf(Math.max(0, s.now - 1));
  const rr = move === null ? target : prev + (target - prev) * (1 - Math.pow(1 - move / 900, 3));
  if (move !== null) anim = true;
  const na = -0.5;
  const nx = cx + Math.cos(na) * rr;
  const ny = cy - Math.sin(-na) * rr;
  g.lineCap = "round";
  g.lineWidth = 4;
  g.strokeStyle = dk ? c.text : mix(c.secondaryText, c.card, 0.2);
  g.beginPath();
  g.moveTo(bx, by);
  g.lineTo(nx + 6, ny - 8);
  g.stroke();
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(nx + 6, ny - 8);
  g.lineTo(nx, ny);
  g.strokeStyle = dk ? mix(c.text, c.wash, 0.3) : c.text;
  g.stroke();
  g.beginPath();
  g.arc(bx, by, 8, 0, Math.PI * 2);
  g.fillStyle = dk ? c.text : mix(c.secondaryText, c.card, 0.2);
  g.fill();
  g.lineCap = "butt";
  return anim;
}

export default defineApp<State, Action>({
  name: "Listening party",
  summary: (s) => {
    if (done(s)) {
      const r = ranked(s);
      const a = agreed(s);
      return `${s.album || s.title}: #1 ${s.tracks[r[0]!]}${a >= 0 ? ` · everyone agreed on ${s.tracks[a]}` : ""}`;
    }
    const v = voters(s, s.now);
    return `Track ${s.now + 1}, ${s.tracks[s.now]} · ${v.filter((x) => x.r === 0).length} fire, ${v.filter((x) => x.r === 2).length} skip`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    const u = m.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "react") {
      if (done(s) || !isInt(a.r, 0, 2)) return s;
      const name = clean(ctx.members.find((x) => x.id === u)?.name, 20) || "Friend";
      const mine = s.stickers.find((x) => x.who === u && x.track === s.now);
      if (mine && mine.r === a.r) return s;
      const rest = s.stickers.filter((x) => !(x.who === u && x.track === s.now));
      return { ...s, stickers: [...rest, { who: u, name, track: s.now, r: a.r, at: m.time }] };
    }
    if (a.t === "next") {
      if (done(s)) return s;
      return { ...s, now: s.now + 1, at: m.time };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = (u: string) => !u.startsWith("~") && !inChat(ctx, u);
    if (!s.stickers.some((x) => gone(x.who))) return s;
    return { ...s, stickers: s.stickers.filter((x) => !gone(x.who)) };
  },

  invariants: {
    "one sticker per person per track": (s) => new Set(s.stickers.map((x) => `${x.who}@${x.track}`)).size === s.stickers.length,
    "stickers only on tracks already played": (s) => s.stickers.every((x) => isInt(x.track, 0, Math.min(s.now, s.tracks.length - 1)) && isInt(x.r, 0, 2)),
    "the needle stays on the record": (s) => isInt(s.now, 0, s.tracks.length) && s.tracks.length >= 3,
    "live stickers belong to the chat": (s, ctx) => s.stickers.every((x) => x.who.startsWith("~") || inChat(ctx, x.who)),
  },

  transitions: {
    "a sticker lands on the playing track, from you": (p, n, a, m) => {
      if (a.t !== "react" || p === n) return true;
      const mine = n.stickers.find((x) => x.who === m.user && x.track === p.now);
      return !!mine && mine.r === a.r && mine.at === m.time && n.now === p.now && n.stickers.filter((x) => x.who !== m.user || x.track !== p.now).length === p.stickers.filter((x) => x.who !== m.user || x.track !== p.now).length;
    },
    "next moves the needle one track": (p, n, a, m) => a.t !== "next" || p === n || (n.now === p.now + 1 && n.at === m.time && n.stickers.length === p.stickers.length),
    "the needle never goes back": (p, n) => n.now >= p.now,
    "only people in the chat play": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a sticker never moves the needle": (p, n, a) => a.t !== "react" || (n.now === p.now && n.at === p.at && n.tracks === p.tracks && n.said === p.said),
    "next leaves every sticker where it was": (p, n, a) => a.t !== "next" || JSON.stringify(n.stickers) === JSON.stringify(p.stickers),
    "nothing else changes the record": (p, n, a) => a.t === "react" || a.t === "next" || JSON.stringify(p) === JSON.stringify(n),
    "other people keep their stickers": (p, n, _a, m) => p.stickers.every((x) => x.who === m.user || n.stickers.some((y) => y.who === x.who && y.track === x.track && y.r === x.r)),
    "the same sticker twice changes nothing": (p, n, a, m) => a.t !== "react" || !p.stickers.some((x) => x.who === m.user && x.track === p.now && x.r === a.r) || p === n,
    "a new reaction always lands": (p, n, a, m, ctx) => a.t !== "react" || !inChat(ctx, m.user) || done(p) || !isInt(a.r, 0, 2) || p.stickers.some((x) => x.who === m.user && x.track === p.now && x.r === a.r) || p !== n,
  },

  arbitrary: (s, _u, r) => (r.next() < 0.75 ? { t: "react", r: r.int(3) } : { t: "next" }),

  view: ({ state: s, me, dispatch, theme }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const R = Math.min(102, (CH - 10) / 2, W * 0.29);
    const listX = R * 2 + 26;
    const over = done(s);
    const mine = over ? undefined : s.stickers.find((x) => x.who === me && x.track === s.now);
    const order = over ? ranked(s) : s.tracks.map((_, k) => k);
    const ag = agreed(s);
    const rowH = Math.min(19, (CH - 34) / s.tracks.length);
    const cur = voters(s, s.now);
    const quote = [...s.said].filter((x) => x.track <= s.now).sort((a, b) => b.track - a.track)[0];
    const latest = [...s.stickers].sort((a, b) => b.at - a.at)[0];
    const people = new Set(s.stickers.map((x) => x.who)).size;
    const label = over
      ? `The album is over. Ranked: ${order.map((k, i) => `${i + 1}. ${s.tracks[k]}`).join(", ")}`
      : `A spinning record on track ${s.now + 1}, ${s.tracks[s.now]}; ${cur.length} stickers on it`;

    const icon = (r: number, on: boolean) => {
      const col = reactColor(r, theme);
      const ink = on ? c.onPrimary : c.text;
      return (
        <svg width={30} height={30} viewBox="0 0 30 30" aria-hidden="true">
          <circle cx={15} cy={15} r={14} fill={col} />
          {r === 0 ? (
            <path d="M15 6 C 18 11 22 13 21 18 C 20.5 22 17.5 24 15 24 C 12 24 9 22 9 18 C 9 15 11 14 12 11 C 13 14 14 14 15 6 Z" fill={c.card} />
          ) : r === 1 ? (
            <>
              <circle cx={11} cy={13} r={1.8} fill={c.text} />
              <circle cx={19} cy={13} r={1.8} fill={c.text} />
              <path d="M10 19 L 20 19" stroke={c.text} stroke-width={2} stroke-linecap="round" />
            </>
          ) : (
            <path d="M8 9 L 15 15 L 8 21 Z M 15 9 L 22 15 L 15 21 Z" fill={c.card} />
          )}
        </svg>
      );
    };

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.album || `${s.tracks.length} tracks`} />
        <div style={{ position: "relative", height: CH }}>
          <Canvas height={CH} label={label} draw={(g, f) => drawRecord(g, f, s, me)} />
          <div style={{ position: "absolute", left: listX, right: 8, top: 10, bottom: 8, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ fontSize: 11, lineHeight: "14px", fontWeight: 700, color: c.text, marginBottom: 4, ...ell }}>{over ? "Ranked by the group" : "Tracklist"}</div>
            {order.map((k, i) => {
              const v = voters(s, k);
              const playing = !over && k === s.now;
              const future = !over && k > s.now;
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, height: rowH, minWidth: 0, fontSize: 12, lineHeight: `${rowH}px`, color: c.text, fontWeight: playing || (over && i === 0) ? 700 : 400 }}>
                  <span style={{ width: 16, flexShrink: 0, textAlign: "right", color: future ? c.secondaryText : c.text }}>{over ? i + 1 : k + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, color: future ? c.secondaryText : c.text, ...ell }}>{s.tracks[k]}</span>
                  <span style={{ display: "flex", gap: 1, flexShrink: 0 }}>
                    {v.slice(0, 6).map((x) => (
                      <span key={x.who} style={{ width: 5, height: 5, borderRadius: 9, background: reactColor(x.r, theme) }} />
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        {over ? (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, minHeight: 36, minWidth: 0 }}>
            <Facepile users={[...new Map(s.stickers.map((x) => [x.who, { id: x.who, name: x.name }])).values()]} max={6} size={22} />
            <span style={{ fontSize: 15, lineHeight: "20px", color: c.text, minWidth: 0, ...ell }}>
              {ag >= 0 ? <><b>{s.tracks[ag]}</b>{` · everyone said fire`}</> : `${people} listened · #1 ${s.tracks[order[0]!]}`}
            </span>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32, marginTop: 4, minWidth: 0 }}>
              {latest && latest.at > 0 ? (
                <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{`${latest.who === me ? "You" : first(latest.name)} said ${NAMES[latest.r]!.toLowerCase()} to ${s.tracks[latest.track]}`}</span>
              ) : quote ? (
                <>
                  <b style={{ fontSize: 13, lineHeight: "16px", color: c.text, flexShrink: 0 }}>{first(quote.name)}</b>
                  <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>{`“${quote.text}”`}</span>
                </>
              ) : (
                <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>Stick a reaction on this track, then play the next one</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {[0, 1, 2].map((r) => {
                const on = mine?.r === r;
                const n = cur.filter((x) => x.r === r).length;
                return (
                  <button
                    key={r}
                    type="button"
                    aria-label={`${NAMES[r]} on ${s.tracks[s.now]}, ${n} so far`}
                    aria-pressed={on}
                    onClick={() => { haptic(r === 0 ? "success" : "light"); dispatch({ t: "react", r }); }}
                    style={{ flex: 1, minWidth: 0, height: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 24, background: on ? c.selected : c.secondaryButton, boxShadow: on ? `inset 0 0 0 2px ${c.primary}` : "none", color: c.text, fontSize: 14, fontWeight: 600 }}
                  >
                    {icon(r, on)}
                    <span>{n}</span>
                  </button>
                );
              })}
              <Button kind={mine ? "primary" : "secondary"} onClick={() => { haptic("light"); dispatch({ t: "next" }); }}>
                {s.now === s.tracks.length - 1 ? "Finish" : "Next"}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  },
});
