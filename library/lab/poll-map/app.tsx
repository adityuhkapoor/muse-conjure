import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  Facepile,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Poll map: Tsai Lin's story poll "best study spot on campus" closed at 212 votes. The campus from
// above with each spot as a pin sized by its votes. Friends sit at the spot they voted for; the
// sticker under the map says "see you at the winner Thursday 7pm", and tapping it hops your face
// across campus to the winning pin.

type Kind = "library" | "basement" | "cafe" | "lawn" | "spot";
type Params = {
  /** Whose story: "Tsai Lin" */
  author: string;
  /** How long ago: "5h" */
  ago: string;
  /** The poll question */
  question: string;
  /** 2 to 4 spots with their vote counts and where they sit on campus (thousandths of the map) */
  options: { label: string; votes: number; kind: Kind; x: number; y: number }[];
  /** When the group meets at the winner: "Thursday 7pm" */
  when: string;
  /** Friends in the chat and which spot they picked (0-based), with an optional line */
  friends: { who: string; pick: number; note?: string }[];
  /** Friends already going to the winner */
  going: string[];
};

// @params
const P: Params = {
  author: "Tsai Lin",
  ago: "5h",
  question: "best study spot on campus",
  options: [
    { label: "Fenwick 3rd floor", votes: 88, kind: "library", x: 250, y: 300 },
    { label: "Larkin basement", votes: 61, kind: "basement", x: 760, y: 250 },
    { label: "Kettle & Crumb", votes: 39, kind: "cafe", x: 780, y: 760 },
    { label: "The Quad lawn", votes: 24, kind: "lawn", x: 330, y: 720 },
  ],
  when: "Thursday 7pm",
  friends: [
    { who: "Tsai Lin", pick: 0, note: "silent floor or nothing" },
    { who: "Maya", pick: 0, note: "i'll bring the color-coded schedule" },
    { who: "Calvin", pick: 1, note: "fine, but larkin has outlets. setting 7 alarms for 6:55" },
    { who: "Arun", pick: 2 },
    { who: "Will", pick: 3, note: "the lawn is a study spot if you believe" },
  ],
  going: ["Tsai Lin", "Maya", "Calvin"],
};
// @end params

type Opt = { label: string; votes: number; kind: Kind; x: number; y: number };
type State = {
  author: string;
  ago: string;
  question: string;
  when: string;
  options: Opt[];
  picks: Record<string, number>;
  notes: { who: string; text: string }[];
  /** Going to the winner, in order; at is meta.time, 0 when seeded. */
  going: { id: string; at: number }[];
};
type Action = { t: "join" };
type Local = { cheers: number; focus: number };

const PANEL = 556;
const MAP_TOP = 104;
const MAP_H = 286;
const KINDS: Kind[] = ["library", "basement", "cafe", "lawn", "spot"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const findMember = (ctx: Ctx, name: string): Member | undefined => {
  const k = name.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k) : undefined;
};
const okCoord = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.min(920, Math.max(80, Math.round(v))) : 500;
const winnerOf = (s: State) => s.options.reduce((b, o, i) => (o.votes > s.options[b]!.votes ? i : b), 0);
const totalOf = (s: State) => s.options.reduce((n, o) => n + o.votes, 0);

function initState(ctx: Ctx): State {
  const raw = Array.isArray(P.options) ? P.options : [];
  const defaults = [[250, 300], [760, 260], [760, 740], [300, 720]];
  const options: Opt[] = [];
  for (const o of raw) {
    if (options.length >= 4) break;
    const label = clean(o?.label, 24);
    if (!label) continue;
    const d = defaults[options.length]!;
    options.push({
      label,
      votes: Number.isInteger(o.votes) && o.votes >= 0 ? Math.min(99999, o.votes) : 0,
      kind: KINDS.includes(o.kind) ? o.kind : "spot",
      x: typeof o.x === "number" ? okCoord(o.x) : d[0]!,
      y: typeof o.y === "number" ? okCoord(o.y) : d[1]!,
    });
  }
  while (options.length < 2) options.push({ label: options.length ? "Somewhere else" : "Library", votes: 0, kind: "spot", x: defaults[options.length]![0]!, y: defaults[options.length]![1]! });
  const picks: Record<string, number> = {};
  const notes: State["notes"] = [];
  for (const f of Array.isArray(P.friends) ? P.friends : []) {
    const m = findMember(ctx, clean(f?.who, 20));
    if (!m || picks[m.id] !== undefined) continue;
    if (!Number.isInteger(f.pick) || f.pick < 0 || f.pick >= options.length) continue;
    picks[m.id] = f.pick;
    const note = clean(f.note, 70);
    if (note) notes.push({ who: m.id, text: note });
  }
  const going: State["going"] = [];
  for (const g of Array.isArray(P.going) ? P.going : []) {
    const m = findMember(ctx, clean(g, 20));
    if (m && !going.some((x) => x.id === m.id)) going.push({ id: m.id, at: 0 });
  }
  return {
    author: clean(P.author, 20),
    ago: clean(P.ago, 6),
    question: clean(P.question, 48) || "Where should we go?",
    when: clean(P.when, 24),
    options,
    picks,
    notes,
    going,
  };
}

// ---- The campus from above -------------------------------------------------------------------

function drawCampus(g: CanvasRenderingContext2D, f: DrawFrame, s: State, theme: Theme): boolean {
  const p = pal(theme);
  const w = f.width;
  const h = f.height;
  const X = (x: number) => (x / 1000) * w;
  const Y = (y: number) => (y / 1000) * h;
  const t = f.now / 1000;
  g.fillStyle = p.grass;
  g.fillRect(0, 0, w, h);
  // Paths: the big cross and the diagonals of the quad.
  g.strokeStyle = mix(p.cream, p.paper, 0.4);
  g.lineCap = "round";
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(0, Y(520));
  g.lineTo(w, Y(500));
  g.moveTo(X(540), 0);
  g.lineTo(X(520), h);
  g.stroke();
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(X(330), Y(400));
  g.lineTo(X(720), Y(620));
  g.moveTo(X(720), Y(400));
  g.lineTo(X(330), Y(620));
  g.stroke();
  // The quad's fountain.
  g.fillStyle = mix(p.cream, p.paper, 0.4);
  g.beginPath();
  g.arc(X(528), Y(510), 18, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = p.sky;
  g.beginPath();
  g.arc(X(528), Y(510), 12, 0, Math.PI * 2);
  g.fill();
  // Lake Wren peeking in at the corner.
  g.fillStyle = mix(p.blue, p.sky, 0.55);
  g.beginPath();
  g.ellipse(X(-20), Y(1020), X(170), Y(170), 0, 0, Math.PI * 2);
  g.fill();
  // Background buildings: flat roofs with a ridge.
  const blocks = [[60, 60, 170, 120], [620, 40, 140, 110], [860, 400, 120, 180], [60, 470, 120, 150], [440, 840, 160, 120], [880, 880, 110, 100], [380, 70, 120, 100]];
  g.fillStyle = mix(p.wall, p.shade, 0.35);
  g.beginPath();
  for (const [x, y, bw, bh] of blocks) g.roundRect(X(x!), Y(y!), X(bw!), Y(bh!), 3);
  g.fill();
  g.strokeStyle = mix(p.wall, p.shade, 0.6);
  g.lineWidth = 1.5;
  g.beginPath();
  for (const [x, y, bw, bh] of blocks) {
    g.moveTo(X(x! + 10), Y(y! + bh! / 2));
    g.lineTo(X(x! + bw! - 10), Y(y! + bh! / 2));
  }
  g.stroke();
  // Trees: one fill for crowns.
  g.fillStyle = p.leaf;
  g.beginPath();
  for (let k = 0; k < 22; k++) {
    const x = (k * 379 + 90) % 1000;
    const y = (k * 613 + 140) % 1000;
    if (Math.abs(x - 530) < 60 || Math.abs(y - 510) < 50 || s.options.some((o) => Math.hypot(o.x - x, o.y - y) < 150)) continue;
    g.moveTo(X(x) + 9, Y(y));
    g.arc(X(x), Y(y), 9, 0, Math.PI * 2);
  }
  g.fill();

  // Pins: a soft halo sized by votes, the spot's own little drawing, then the number.
  const max = Math.max(1, ...s.options.map((o) => o.votes));
  const win = winnerOf(s);
  s.options.forEach((o, i) => {
    const cx = X(o.x);
    const cy = Y(o.y);
    const r = 16 + 30 * Math.sqrt(o.votes / max);
    const pulse = i === win ? 1 + 0.05 * Math.sin(t * 2.4) : 1;
    g.fillStyle = i === win ? p.primary : p.ink;
    g.globalAlpha = i === win ? 0.22 : 0.12;
    g.beginPath();
    g.arc(cx, cy, r * pulse, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = i === win ? p.primary : mix(p.ink, p.grass, 0.4);
    g.lineWidth = i === win ? 2.5 : 1.5;
    g.beginPath();
    g.arc(cx, cy, r * pulse, 0, Math.PI * 2);
    g.stroke();
    drawSpot(g, o.kind, cx, cy, p);
  });
  return true;
}

function drawSpot(g: CanvasRenderingContext2D, kind: Kind, x: number, y: number, p: ReturnType<typeof pal>) {
  if (kind === "library") {
    g.fillStyle = mix(p.wall, p.paper, 0.3);
    g.beginPath();
    g.moveTo(x - 16, y - 4);
    g.lineTo(x, y - 14);
    g.lineTo(x + 16, y - 4);
    g.closePath();
    g.rect(x - 15, y + 8, 30, 4);
    g.fill();
    g.fillStyle = p.paper;
    g.beginPath();
    for (const dx of [-11, -4, 3, 10]) g.rect(x + dx - 1, y - 3, 3, 11);
    g.fill();
  } else if (kind === "basement") {
    g.fillStyle = mix(p.red, p.brown, 0.4);
    g.beginPath();
    g.roundRect(x - 14, y - 12, 28, 24, 3);
    g.fill();
    g.fillStyle = p.paper;
    g.beginPath();
    for (let k = 0; k < 4; k++) g.rect(x - 9 + k * 3, y + 6 - k * 4, 14 - k * 3, 3);
    g.fill();
  } else if (kind === "cafe") {
    g.fillStyle = p.paper;
    g.beginPath();
    g.roundRect(x - 10, y - 6, 18, 16, 4);
    g.fill();
    g.strokeStyle = p.paper;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x + 9, y + 2, 4, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.strokeStyle = mix(p.brown, p.paper, 0.2);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x - 4, y - 9);
    g.quadraticCurveTo(x - 7, y - 13, x - 4, y - 17);
    g.moveTo(x + 2, y - 9);
    g.quadraticCurveTo(x - 1, y - 13, x + 2, y - 17);
    g.stroke();
  } else if (kind === "lawn") {
    g.fillStyle = p.red;
    g.beginPath();
    g.rect(x - 14, y, 20, 12);
    g.fill();
    g.fillStyle = p.paper;
    g.beginPath();
    g.rect(x - 9, y, 4, 12);
    g.rect(x - 1, y, 4, 12);
    g.fill();
    g.fillStyle = mix(p.leaf, p.ink, 0.15);
    g.beginPath();
    g.arc(x + 8, y - 6, 11, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = p.red;
    g.beginPath();
    g.arc(x, y - 6, 8, Math.PI, 0);
    g.lineTo(x, y + 10);
    g.closePath();
    g.fill();
  }
}

export default defineApp<State, Action, Local>({
  name: "Poll map",
  summary: (s) => {
    const o = s.options[winnerOf(s)]!;
    return `${s.question}: ${o.label} won with ${o.votes} · ${s.going.length} going${s.when ? ` ${s.when}` : ""}`;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (a.t !== "join" || !inChat(ctx, meta.user)) return s;
    const u = meta.user;
    if (s.going.some((g) => g.id === u)) return { ...s, going: s.going.filter((g) => g.id !== u) };
    return { ...s, going: [...s.going, { id: u, at: meta.time }] };
  },

  onMembers: (s, ctx) => (s.going.every((g) => inChat(ctx, g.id)) ? s : { ...s, going: s.going.filter((g) => inChat(ctx, g.id)) }),

  invariants: {
    "going once each, all in the chat": (s, ctx) => new Set(s.going.map((g) => g.id)).size === s.going.length && s.going.every((g) => inChat(ctx, g.id)),
    "picks point at a spot": (s) => Object.values(s.picks).every((v) => Number.isInteger(v) && v >= 0 && v < s.options.length),
    "join times are real": (s) => s.going.every((g) => Number.isInteger(g.at) && g.at >= 0),
    "two to four spots with whole votes": (s) => s.options.length >= 2 && s.options.length <= 4 && s.options.every((o) => Number.isInteger(o.votes) && o.votes >= 0),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "joining toggles only me": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const was = p.going.some((g) => g.id === m.user);
      const now = n.going.some((g) => g.id === m.user);
      const others = (xs: State["going"]) => JSON.stringify(xs.filter((x) => x.id !== m.user));
      return was !== now && others(p.going) === others(n.going) && n.going.length === p.going.length + (now ? 1 : -1);
    },
    "joining puts me last, stamped now": (p, n, a, m) => {
      if (a.t !== "join" || p === n) return true;
      const last = n.going[n.going.length - 1];
      return !n.going.some((g) => g.id === m.user) || (last?.id === m.user && last.at === m.time);
    },
    "the poll result never changes": (p, n) => p.options === n.options || JSON.stringify(p.options) === JSON.stringify(n.options),
    "picks never change on a join": (p, n, a) => a.t !== "join" || JSON.stringify(p.picks) === JSON.stringify(n.picks),
  },

  arbitrary: () => ({ t: "join" }),

  local: { cheers: 0, focus: -1 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card - 24;
    const win = winnerOf(state);
    const wo = state.options[win]!;
    const total = totalOf(state);
    const iGo = state.going.some((g) => g.id === me);
    const isGoing = (id: string) => state.going.some((g) => g.id === id);
    const max = Math.max(1, ...state.options.map((o) => o.votes));
    const author = members.find((m) => m.name.trim().toLowerCase() === state.author.toLowerCase()) ?? { id: `o:${state.author || "?"}`, name: state.author || "?" };
    const mem = (id: string): Member => members.find((m) => m.id === id) ?? { id, name: "?" };

    // Faces on the map: at their pick, or hopping to the winner once going.
    const where = (id: string) => (isGoing(id) ? win : state.picks[id] ?? -1);
    const shown = members.filter((m) => where(m.id) >= 0);
    const byPin = new Map<number, string[]>();
    for (const m of shown) byPin.set(where(m.id), [...(byPin.get(where(m.id)) ?? []), m.id]);
    const faces = shown.map((m) => {
      const pin = where(m.id);
      const o = state.options[pin]!;
      const list = byPin.get(pin)!;
      const k = list.indexOf(m.id);
      const r = 16 + 30 * Math.sqrt(o.votes / max);
      const ang = -Math.PI / 2 + (k - (list.length - 1) / 2) * 0.62;
      const rr = r + 10;
      const x = Math.min(W - 14, Math.max(14, (o.x / 1000) * W + rr * Math.cos(ang + Math.PI)));
      const y = Math.min(MAP_H - 14, Math.max(14, (o.y / 1000) * MAP_H + rr * Math.sin(ang + Math.PI) * -1));
      return { id: m.id, x, y };
    });

    // Label chips under each pin.
    const chips = state.options.map((o, i) => {
      const r = 16 + 30 * Math.sqrt(o.votes / max);
      const text = `${o.label} · ${o.votes}`;
      const cw = Math.min(176, W * 0.5);
      const fit = fitText(text, cw - 20, { size: 12, weight: 700, min: 10 });
      const cx = Math.min(W - cw / 2 - 4, Math.max(cw / 2 + 4, (o.x / 1000) * W));
      const top = Math.min(MAP_H - 24, (o.y / 1000) * MAP_H + r + 4);
      return { i, text: fit.text, size: fit.size, cx, top, cw };
    });

    const loserFriends = members.filter((m) => state.picks[m.id] !== undefined && state.picks[m.id] !== win && !isGoing(m.id));
    const here = state.notes.filter((n) => members.some((m) => m.id === n.who));
    const note = here.find((n) => isGoing(n.who) && state.picks[n.who] !== win) ?? here[here.length - 1];
    const myJoin = state.going.find((g) => g.id === me)?.at || undefined;
    const hopping = myJoin !== undefined && running(myJoin, 1200) !== null;
    const q = fitText(state.question, W - 40, { size: 24, weight: 800, min: 15 });
    const going = state.going.map((g) => mem(g.id));

    return (
      <div>
        <style>{"@keyframes pmPop{0%{transform:scale(.4)}70%{transform:scale(1.15)}100%{transform:scale(1)}}@keyframes pmBob{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(-1deg) translateY(-2px)}}"}</style>
        <div style={{ position: "relative", height: PANEL, borderRadius: 12, overflow: "hidden", background: mix(p.blue, p.dark, 0.55), color: p.on }}>
          <div aria-hidden="true" style={{ position: "absolute", left: 8, right: 8, top: 8, height: 3, display: "flex", gap: 4 }}>
            {[0, 1].map((i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i === 0 ? p.on : mix(p.on, p.dark, 0.55) }} />
            ))}
          </div>
          <div style={{ position: "absolute", left: 11, right: 12, top: 18, height: 32, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
            <span style={{ width: 32, height: 32, flex: "none", borderRadius: 16, background: p.on, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Avatar user={author} size={28} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: p.on, flex: "none" }}>{state.author || "Story"}</span>
            <span style={{ fontSize: 15, color: p.on, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${state.ago} · poll closed`}</span>
          </div>
          <div style={{ position: "absolute", left: 16, right: 16, top: 58, height: 40, display: "flex", alignItems: "baseline", justifyContent: "center", gap: 8, pointerEvents: "none" }}>
            <span style={{ fontSize: q.size, fontWeight: 800, lineHeight: "32px", color: p.on, whiteSpace: "nowrap" }}>{q.text}</span>
          </div>
          <div style={{ position: "absolute", left: 12, right: 12, top: MAP_TOP, height: MAP_H, borderRadius: 14, overflow: "hidden" }}>
            <Canvas height={MAP_H} label={`Campus map: ${state.options.map((o) => `${o.label} ${o.votes}`).join(", ")}`} draw={(g, f) => drawCampus(g, f, state, theme)} />
            {chips.map((ch) => (
              <button
                key={ch.i}
                type="button"
                aria-label={`${state.options[ch.i]!.label}, ${state.options[ch.i]!.votes} votes`}
                onClick={() => setLocal({ focus: local.focus === ch.i ? -1 : ch.i })}
                style={{
                  position: "absolute",
                  left: ch.cx - ch.cw / 2,
                  top: ch.top - 10,
                  width: ch.cw,
                  height: 44,
                  padding: 0,
                  border: 0,
                  background: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  paddingTop: 10,
                  boxSizing: "border-box",
                }}
              >
                <span style={{ maxWidth: ch.cw, padding: "2px 8px", borderRadius: 10, background: ch.i === win ? c.primary : c.card, color: ch.i === win ? c.onPrimary : c.text, fontSize: ch.size, fontWeight: ch.i === win ? 700 : 600, lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.text}</span>
              </button>
            ))}
            {faces.map((f) => (
              <span
                key={f.id}
                style={{
                  position: "absolute",
                  left: f.x - 12,
                  top: f.y - 12,
                  display: "flex",
                  borderRadius: 13,
                  boxShadow: `0 0 0 2px ${f.id === me ? c.primary : c.card}`,
                  transition: "left 900ms cubic-bezier(.34,1.56,.64,1), top 900ms cubic-bezier(.34,1.56,.64,1)",
                  animation: f.id === me && hopping ? "pmPop 600ms ease-out both" : undefined,
                  pointerEvents: "none",
                }}
              >
                <Avatar user={mem(f.id)} size={24} />
              </span>
            ))}
          </div>

          <div style={{ position: "absolute", left: 22, right: 22, top: MAP_TOP + MAP_H + 12, borderRadius: 16, background: c.card, color: c.text, padding: "12px 12px 10px", boxSizing: "border-box", transform: "rotate(-1.5deg)", }}>
            <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${wo.votes} of ${total} votes · see you at the winner`}</div>
            <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${wo.label}${state.when ? ` · ${state.when}` : ""}`}</div>
            <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
              {going.length ? <Facepile users={going.slice(0, 4)} max={4} size={24} /> : null}
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{going.length ? `${going.length} going` : "Nobody yet"}</span>
              {iGo ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "join" })}>
                  Going
                </Button>
              ) : (
                <Button
                  kind="primary"
                  onClick={() => {
                    haptic("success");
                    dispatch({ t: "join" });
                    setLocal({ cheers: local.cheers + 1 });
                  }}
                >
                  I'm in
                </Button>
              )}
            </div>
            {iGo && local.cheers > 0 ? (
              <div style={{ position: "absolute", right: 40, top: 70, pointerEvents: "none" }}>
                <Burst key={local.cheers} emoji="📚" />
              </div>
            ) : null}
          </div>
          <div style={{ position: "absolute", left: 16, right: 16, top: 528, height: 20, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: p.on, pointerEvents: "none" }}>
            {local.focus >= 0 && state.options[local.focus] ? (
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {(() => {
                  const o = state.options[local.focus]!;
                  const who = members.filter((m) => state.picks[m.id] === local.focus).map((m) => m.name);
                  return `${o.label}: ${o.votes} of ${total}${who.length ? ` · ${who.join(", ")}` : ""}`;
                })()}
              </span>
            ) : note ? (
              <>
                <span style={{ fontWeight: 700, flex: "none" }}>{mem(note.who).name}</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`"${note.text}"`}</span>
              </>
            ) : (
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{loserFriends.length ? `${loserFriends.length} friends picked another spot` : "Tap a spot to see who picked it"}</span>
            )}
          </div>
        </div>
        {iGo && local.cheers > 0 ? <Toast key={local.cheers}>{`See you at ${wo.label}`}</Toast> : null}
      </div>
    );
  },
});
