import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  Locked,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  seedOf,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Meta,
  type Theme,
} from "@muse/app";

// Sound crate: every song from a reel the chat shared this month, as a crate of records. Drag across
// the crate (or tap the arrows) to flip through; the one in front lifts out so you can see its sleeve.
// Pull the ones you want and they land on the road trip stack beside the crate. One friend holds the
// veto stamp, and only gets so many. Make the playlist when the stack looks right.

type Params = {
  /** Card title */
  title: string;
  /** The chat's name and what the playlist is for */
  chat: string;
  forWhat: string;
  /** 3 to 14 songs from reels: title, artist, length in seconds, whose reel it came from */
  songs: { title: string; artist: string; secs: number; from: string }[];
  /** Songs people already pulled (indexes into songs) */
  pulls: { who: string; songs: number[] }[];
  /** Who holds the veto stamp, how many stamps, and the songs already stamped */
  vetoer: string;
  stamps: number;
  vetoed: { song: number; note?: string }[];
};

// @params
const P: Params = {
  title: "Road trip crate",
  chat: "the six",
  forWhat: "the road trip",
  songs: [
    { title: "Lake Wren Summer", artist: "The Tidy Hours", secs: 192, from: "Maya" },
    { title: "Highway Snacks", artist: "Duplex Moon", secs: 168, from: "Will" },
    { title: "Snooze Button Love", artist: "Neon Cardigan", secs: 210, from: "Calvin" },
    { title: "Rice and Shine", artist: "Steam Club", secs: 175, from: "Arun" },
    { title: "Spreadsheet Heart", artist: "Cellmates", secs: 221, from: "Maya" },
    { title: "Sube Anthem", artist: "Parking Brake", secs: 242, from: "Will" },
    { title: "Lowkey", artist: "Low Tide Kid", secs: 185, from: "Aditya" },
    { title: "Golden Lantern", artist: "Paper Dragons", secs: 202, from: "Tsai Lin" },
    { title: "Night Drive to Millbrook", artist: "Glass Garage", secs: 238, from: "Calvin" },
    { title: "Miller Hill Sunrise", artist: "Early Birds Club", secs: 160, from: "Tsai Lin" },
  ],
  pulls: [
    { who: "Maya", songs: [0, 4, 7] },
    { who: "Will", songs: [1, 5] },
    { who: "Tsai Lin", songs: [7, 9] },
    { who: "Calvin", songs: [8] },
    { who: "Arun", songs: [3, 0] },
  ],
  vetoer: "Tsai Lin",
  stamps: 2,
  vetoed: [{ song: 5, note: "the Sube does not get an anthem" }],
};
// @end params

type Song = { title: string; artist: string; secs: number; from: string };
type State = {
  title: string;
  chat: string;
  forWhat: string;
  songs: Song[];
  pulls: string[][];
  cast: string[];
  vetoer: string;
  stamps: number;
  vetoed: number[];
  note: string;
  made: { at: number; by: string; count: number } | null;
};
type Action = { t: "pull"; i: number } | { t: "veto"; i: number } | { t: "make" };
type Local = { idx: number; flip: number; dir: number; drag: number | null; toast: number };

const H = 214;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const idFor = (ctx: Ctx, name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? name;
const idx = (v: unknown, n: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < n;
/** The road trip stack: anything somebody pulled that has not been stamped. */
const stack = (s: State) => s.songs.map((_, i) => i).filter((i) => (s.pulls[i]?.length ?? 0) > 0 && !s.vetoed.includes(i));
const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

function initState(ctx: Ctx): State {
  const songs: Song[] = [];
  for (const s of Array.isArray(P.songs) ? P.songs : []) {
    const title = clean(s?.title, 36);
    if (!title || songs.length >= 14) continue;
    songs.push({ title, artist: clean(s.artist, 28), secs: Number.isInteger(s.secs) && s.secs > 0 && s.secs < 3600 ? s.secs : 180, from: clean(s.from, 20) });
  }
  const pulls: string[][] = songs.map(() => []);
  const cast: string[] = [];
  for (const p of Array.isArray(P.pulls) ? P.pulls : []) {
    const name = clean(p?.who, 20);
    if (!name) continue;
    const id = idFor(ctx, name);
    if (!cast.includes(id)) cast.push(id);
    for (const i of Array.isArray(p.songs) ? p.songs : []) if (idx(i, songs.length) && !pulls[i]!.includes(id)) pulls[i]!.push(id);
  }
  const stamps = Number.isInteger(P.stamps) && P.stamps >= 0 && P.stamps <= 5 ? P.stamps : 2;
  const vetoed: number[] = [];
  let note = "";
  for (const v of Array.isArray(P.vetoed) ? P.vetoed : []) {
    if (!idx(v?.song, songs.length) || vetoed.includes(v.song) || vetoed.length >= stamps) continue;
    vetoed.push(v.song);
    note = clean(v.note, 50) || note;
  }
  const vn = clean(P.vetoer, 20);
  return { title: clean(P.title, 40) || "Sound crate", chat: clean(P.chat, 24), forWhat: clean(P.forWhat, 30) || "the playlist", songs, pulls, cast, vetoer: vn ? idFor(ctx, vn) : "", stamps, vetoed, note, made: null };
}

function reduceIt(s: State, a: Action, m: Meta, ctx: Ctx): State {
  const u = m.user;
  if (!inChat(ctx, u) || s.made) return s;
  if (a.t === "pull") {
    if (!idx(a.i, s.songs.length) || s.vetoed.includes(a.i)) return s;
    const l = s.pulls[a.i]!;
    return { ...s, pulls: s.pulls.map((x, i) => (i !== a.i ? x : l.includes(u) ? l.filter((v) => v !== u) : [...l, u])) };
  }
  if (a.t === "veto") {
    if (u !== s.vetoer || !idx(a.i, s.songs.length)) return s;
    if (s.vetoed.includes(a.i)) return { ...s, vetoed: s.vetoed.filter((v) => v !== a.i), note: "" };
    if (s.vetoed.length >= s.stamps) return s;
    return { ...s, vetoed: [...s.vetoed, a.i], note: "" };
  }
  if (a.t === "make") {
    const st = stack(s);
    if (!st.length) return s;
    return { ...s, made: { at: Math.max(1, m.time), by: u, count: st.length } };
  }
  return s;
}

function Face({ id, members, size, theme }: { id: string; members: Member[]; size: number; theme: Theme }) {
  const m = members.find((x) => x.id === id || x.name.toLowerCase() === id.toLowerCase());
  if (m) return <Avatar user={m} size={size} />;
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: "50%", background: userColor(id || "?", theme), color: theme.color.onPrimary, fontSize: Math.round(size * 0.5), fontWeight: 600 }}>
      {(id.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** A sleeve's colors and motif, fixed by the song's title. */
function sleeveOf(title: string, theme: Theme) {
  const p = pal(theme);
  const hues = [p.red, p.yellow, p.green, p.blue, p.purple, p.orange];
  const n = seedOf(title);
  return { bg: hues[n % 6]!, fg: hues[(n >> 3) % 6] === hues[n % 6] ? p.cream : hues[(n >> 3) % 6]!, motif: (n >> 7) % 4 };
}

export default defineApp<State, Action, Local>({
  name: "Sound crate",
  summary: (s) => {
    const st = stack(s);
    const mins = Math.round(st.reduce((n, i) => n + (s.songs[i]?.secs ?? 0), 0) / 60);
    return s.made ? `${s.title}: playlist made · ${s.made.count} songs, ${mins} min` : `${s.title}: ${st.length} of ${s.songs.length} songs on the stack · ${mins} min`;
  },

  init: initState,
  reduce: (s, a, m, ctx) => reduceIt(s, a, m, ctx),
  onMembers: (s, ctx) => (s.made ? s : { ...s, pulls: s.pulls.map((l) => l.filter((u) => inChat(ctx, u) || s.cast.includes(u))) }),

  invariants: {
    "one pull per person per song": (s) => s.pulls.length === s.songs.length && s.pulls.every((l) => new Set(l).size === l.length),
    "pulls come from the chat or the people named": (s, ctx) => s.made !== null || s.pulls.every((l) => l.every((u) => inChat(ctx, u) || s.cast.includes(u))),
    "stamps are limited and real": (s) => s.vetoed.length <= s.stamps && new Set(s.vetoed).size === s.vetoed.length && s.vetoed.every((i) => idx(i, s.songs.length)),
    "the playlist has songs": (s) => s.made === null || (s.made.at > 0 && s.made.count > 0 && s.made.count <= s.songs.length),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a pull flips only my pull on that song": (p, n, a, m) => {
      if (a.t !== "pull" || p === n) return true;
      const was = p.pulls[a.i]!.includes(m.user);
      return !p.vetoed.includes(a.i) && n.pulls[a.i]!.includes(m.user) !== was && n.pulls[a.i]!.length === p.pulls[a.i]!.length + (was ? -1 : 1) && n.pulls.every((l, i) => i === a.i || l === p.pulls[i]);
    },
    "only the stamp holder stamps": (p, n, a, m) => a.t !== "veto" || p === n || m.user === p.vetoer,
    "a stamp toggles that one song": (p, n, a) => a.t !== "veto" || p === n || (n.vetoed.includes(a.i) !== p.vetoed.includes(a.i) && Math.abs(n.vetoed.length - p.vetoed.length) === 1),
    "making locks the stack once": (p, n, a, m) => a.t !== "make" || p === n || (p.made === null && !!n.made && n.made.by === m.user && n.made.count === stack(p).length),
    "nothing moves once it is made": (p, n) => p.made === null || p === n,
    "pulls only change by pulling": (p, n, a) => a.t === "pull" || n.pulls === p.pulls,
    "stamps only change by stamping": (p, n, a) => a.t === "veto" || n.vetoed === p.vetoed,
  },

  arbitrary: (s, u, r) => {
    const k = r.next();
    if (!s.songs.length) return { t: "make" };
    if (k < 0.06) return { t: "make" };
    if (k < 0.25 && u === s.vetoer) return { t: "veto", i: r.int(s.songs.length) };
    return { t: "pull", i: r.int(s.songs.length) };
  },

  local: { idx: 0, flip: 0, dir: 1, drag: null, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dk = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const n = state.songs.length;
    const cur = n ? ((local.idx % n) + n) % n : 0;
    const song = state.songs[cur];
    const st = stack(state);
    const crateW = Math.round(W * 0.62);
    const sleeve = Math.min(128, crateW - 70);
    const sx = (crateW - sleeve) / 2;
    const pulled = song ? state.pulls[cur]! : [];
    const mine = pulled.includes(me);
    const isVetoed = state.vetoed.includes(cur);
    const left = state.stamps - state.vetoed.length;
    const vetoName = members.find((m) => m.id === state.vetoer)?.name ?? state.vetoer;
    const iVeto = me === state.vetoer;
    const mins = Math.round(st.reduce((t, i) => t + (state.songs[i]?.secs ?? 0), 0) / 60);

    const go = (d: number) => {
      if (!n || state.made) return;
      haptic("light");
      setLocal({ idx: (cur + d + n) % n, flip: clock.value, dir: d });
    };

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const t = local.flip ? Math.min(1, (f.now - local.flip) / 260) : 1;
      const e = 1 - (1 - t) ** 3;
      const wood = dk ? mix(p.brown, c.text, 0.12) : mix(p.brown, p.orange, 0.25);
      const woodDark = mix(wood, p.dark, 0.35);
      // the back of the crate
      g.fillStyle = woodDark;
      g.beginPath();
      g.roundRect(6, 70, crateW - 12, 70, 6);
      g.fill();
      // sleeves standing behind the one in front
      for (let k = Math.min(5, n - 1); k >= 1; k--) {
        const sv = sleeveOf(state.songs[(cur + k) % n]!.title, theme);
        g.fillStyle = mix(sv.bg, p.dark, 0.12 * k);
        g.beginPath();
        g.roundRect(sx + 10 + k * 9, 52 + k * 5, sleeve - 6, 90, 3);
        g.fill();
      }
      // the sleeve in front, lifting out
      if (song) {
        const sv = sleeveOf(song.title, theme);
        const y = 22 + (1 - e) * 26;
        const x = sx + (1 - e) * 14 * local.dir;
        // the record peeking out
        g.fillStyle = p.dark;
        g.beginPath();
        g.arc(x + sleeve * 0.78, y + sleeve / 2, sleeve * 0.44, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = mix(p.dark, c.card, 0.25);
        g.lineWidth = 1;
        g.beginPath();
        for (const r of [0.38, 0.32, 0.26]) {
          g.moveTo(x + sleeve * 0.78 + sleeve * r, y + sleeve / 2);
          g.arc(x + sleeve * 0.78, y + sleeve / 2, sleeve * r, 0, Math.PI * 2);
        }
        g.stroke();
        g.fillStyle = sv.fg;
        g.beginPath();
        g.arc(x + sleeve * 0.78, y + sleeve / 2, sleeve * 0.12, 0, Math.PI * 2);
        g.fill();
        // the sleeve
        g.fillStyle = sv.bg;
        g.beginPath();
        g.roundRect(x, y, sleeve, sleeve, 4);
        g.fill();
        const cx = x + sleeve / 2, cy = y + sleeve / 2;
        g.fillStyle = sv.fg;
        g.save();
        g.beginPath();
        g.roundRect(x, y, sleeve, sleeve, 4);
        g.clip();
        g.beginPath();
        if (sv.motif === 0) {
          g.arc(cx, cy - 8, sleeve * 0.24, 0, Math.PI * 2);
          for (let k = 0; k < 4; k++) g.rect(x + 10, cy + 18 + k * 8, sleeve - 20, 3);
        } else if (sv.motif === 1) {
          for (const r of [0.38, 0.26, 0.14]) {
            g.moveTo(cx + sleeve * r, cy);
            g.arc(cx, cy, sleeve * r, 0, Math.PI * 2);
          }
        } else if (sv.motif === 2) {
          for (let k = -2; k < 4; k++) {
            g.moveTo(x + k * 28, y + sleeve);
            g.lineTo(x + k * 28 + 14, y + sleeve);
            g.lineTo(x + k * 28 + 14 + sleeve * 0.6, y);
            g.lineTo(x + k * 28 + sleeve * 0.6, y);
          }
        } else {
          for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
            g.moveTo(x + 18 + a * ((sleeve - 36) / 3) + 7, y + 18 + b * ((sleeve - 36) / 3));
            g.arc(x + 18 + a * ((sleeve - 36) / 3), y + 18 + b * ((sleeve - 36) / 3), 7, 0, Math.PI * 2);
          }
        }
        g.fill(sv.motif === 1 ? "evenodd" : "nonzero");
        g.restore();
      }
      // flipped sleeves leaning toward you, then the front of the crate
      for (let k = 1; k <= Math.min(3, n - 1); k++) {
        const sv = sleeveOf(state.songs[(cur - k + n) % n]!.title, theme);
        g.fillStyle = mix(sv.bg, p.dark, 0.2);
        g.beginPath();
        g.moveTo(sx + 6, 150 - k * 3);
        g.lineTo(sx + sleeve - 6, 150 - k * 3);
        g.lineTo(sx + sleeve + 4, 156 - k * 3 + 6);
        g.lineTo(sx - 4, 156 - k * 3 + 6);
        g.closePath();
        g.fill();
      }
      g.fillStyle = wood;
      g.beginPath();
      g.roundRect(0, 140, crateW, H - 146, 8);
      g.fill();
      g.strokeStyle = woodDark;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(8, 174);
      g.lineTo(crateW - 8, 174);
      g.moveTo(crateW * 0.3, 150);
      g.quadraticCurveTo(crateW * 0.4, 160, crateW * 0.55, 152);
      g.stroke();
      g.fillStyle = woodDark;
      g.beginPath();
      g.roundRect(crateW / 2 - 22, 152, 44, 12, 6);
      g.fill();
      // the stack: pulled records, seen from the side
      const bx = crateW + (W - crateW) / 2;
      const rw = Math.min(46, (W - crateW) / 2 - 6);
      g.fillStyle = mix(c.divider, c.card, 0.3);
      g.beginPath();
      g.ellipse(bx, H - 12, rw + 6, 8, 0, 0, Math.PI * 2);
      g.fill();
      st.slice(0, 14).forEach((i, k) => {
        const sv = sleeveOf(state.songs[i]!.title, theme);
        const y = H - 16 - k * 9;
        g.fillStyle = p.dark;
        g.beginPath();
        g.ellipse(bx, y + 2, rw, 7, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = sv.bg;
        g.beginPath();
        g.ellipse(bx, y, rw * 0.36, 2.6, 0, 0, Math.PI * 2);
        g.fill();
      });
      return t < 1;
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.x > crateW) return;
      if (e.type === "down") setLocal({ drag: e.x });
      else if (e.type === "move" && local.drag !== null && Math.abs(e.x - local.drag) > 36) {
        const d = e.x < local.drag ? 1 : -1;
        setLocal({ drag: e.x, idx: (cur + d + n) % n, flip: clock.value, dir: d });
      } else if (e.type === "up") setLocal({ drag: null });
    };

    const tf = song ? fitText(song.title, W - 60, { size: 17, min: 13, weight: 700 }) : null;

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${n} songs from reels in “${state.chat}” this month · ${st.length} pulled`} />
        <div style={{ position: "relative", height: H, marginTop: 4 }}>
          <Canvas height={H} label={song ? `Crate of ${n} records, ${song.title} in front; ${st.length} on the stack` : "An empty record crate"} draw={draw} onPointer={onPointer} />
          {n === 0 ? (
            <div style={{ position: "absolute", left: 16, top: 70, width: crateW - 32, height: 60, border: `1.5px dashed ${c.divider}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: c.secondaryText, textAlign: "center" }}>Songs from shared reels go here</div>
          ) : null}
          {isVetoed && song ? (
            <span style={{ position: "absolute", left: sx + 8, top: 64, padding: "2px 10px", border: `2.5px solid ${p.red}`, borderRadius: 6, color: c.onPrimary, background: mix(p.red, p.dark, 0.3), fontWeight: 800, fontSize: 18, lineHeight: "24px", transform: "rotate(-12deg)", pointerEvents: "none" }}>Vetoed</span>
          ) : null}
          {pulled.length && song ? (
            <span style={{ position: "absolute", left: sx - 6, top: 12, display: "flex", pointerEvents: "none" }}>
              <Facepile users={pulled} max={3} size={20} />
            </span>
          ) : null}
          <span style={{ position: "absolute", left: crateW, right: 0, top: Math.max(4, H - 64 - Math.min(14, st.length) * 9), textAlign: "center", fontSize: 13, lineHeight: "16px", color: c.text, fontWeight: 600 }}>{state.made ? "Playlist" : "The stack"}</span>
          <span style={{ position: "absolute", left: crateW, right: 0, top: Math.max(22, H - 46 - Math.min(14, st.length) * 9), textAlign: "center", fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>{st.length ? `${st.length} · ${mins} min` : "empty"}</span>
        </div>

        {/* the record in front */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, minHeight: 44 }}>
          <button type="button" aria-label="Previous record" onClick={() => go(-1)} style={{ width: 44, height: 44, flex: "none", borderRadius: 22, border: 0, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 20, cursor: "pointer" }}>‹</button>
          <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            {song ? (
              <>
                <div style={{ fontSize: tf!.size, lineHeight: "20px", fontWeight: 700, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{song.title}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden" }}>
                  {song.from ? <Face id={song.from} members={members} size={14} theme={theme} /> : null}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{`${song.artist} · ${mmss(song.secs)}${song.from ? ` · ${song.from}'s reel` : ""}`}</span>
                </div>
              </>
            ) : (
              <span style={{ fontSize: 13, color: c.secondaryText }}>Nothing in the crate yet</span>
            )}
          </div>
          <button type="button" aria-label="Next record" onClick={() => go(1)} style={{ width: 44, height: 44, flex: "none", borderRadius: 22, border: 0, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 20, cursor: "pointer" }}>›</button>
        </div>

        <div style={{ marginTop: 8 }}>
          {state.made ? (
            <Locked detail={`${state.made.count} songs · ${mins} min · for ${state.forWhat}`}>Playlist made</Locked>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Button kind={mine ? "secondary" : "primary"} wide disabled={!song || isVetoed} onClick={() => { haptic(mine ? "light" : "success"); dispatch({ t: "pull", i: cur }); }}>
                  {isVetoed ? "Vetoed" : mine ? "Put it back" : "Pull it"}
                </Button>
              </div>
              {iVeto ? (
                <Button kind="secondary" disabled={!song || (!isVetoed && left <= 0)} onClick={() => { haptic("medium"); dispatch({ t: "veto", i: cur }); }}>{isVetoed ? "Unstamp" : `Veto · ${left}`}</Button>
              ) : null}
              <Button kind={mine ? "primary" : "secondary"} disabled={!st.length} onClick={() => { haptic("success"); setLocal({ toast: local.toast + 1 }); dispatch({ t: "make" }); }}>Make playlist</Button>
            </div>
          )}
        </div>
        <div style={{ marginTop: 6, textAlign: "center", fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {state.made
            ? `For ${state.forWhat}`
            : state.note && state.vetoed.length
              ? `${vetoName} stamped ${state.songs[state.vetoed[state.vetoed.length - 1]!]?.title ?? "one"}: “${state.note}”`
              : state.vetoer
                ? `${vetoName} has ${left} veto ${left === 1 ? "stamp" : "stamps"} left · drag to flip`
                : "Drag the crate to flip through"}
        </div>
        {local.toast > 0 && state.made ? <Toast key={local.toast}>{`Playlist made · ${state.made.count} songs`}</Toast> : null}
      </div>
    );
  },
});
