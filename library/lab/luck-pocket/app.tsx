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
  seedOf,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Luck pocket: Will's story says "first date tonight, wish me luck". His jacket pocket fills the
// bottom of the frame; friends drop a good-luck charm in it (a clover, a horseshoe, a tiny Sube)
// with one word. Afterwards Will can add one sticker, sun, half sun or cloud, and every charm in
// the pocket does a little dance. Kind only, nothing to read into.

type Charm = "clover" | "horseshoe" | "car" | "star" | "heart" | "coffee";
type Params = {
  /** Whose story: "Will" */
  author: string;
  /** How long ago: "2h" */
  ago: string;
  /** Text on the story */
  caption: string;
  /** What the little car charm is called: "tiny Sube" */
  car: string;
  /** Charms already dropped, one each, with one word */
  charms: { who: string; charm: Charm; word: string }[];
};

// @params
const P: Params = {
  author: "Will",
  ago: "2h",
  caption: "first date tonight, wish me luck",
  car: "tiny Sube",
  charms: [
    { who: "Maya", charm: "clover", word: "listen" },
    { who: "Calvin", charm: "horseshoe", word: "breathe" },
    { who: "Arun", charm: "car", word: "parallel-park" },
    { who: "Tsai Lin", charm: "star", word: "aux" },
    { who: "Jordan", charm: "heart", word: "cute" },
  ],
};
// @end params

type Drop = { who: string; name: string; charm: Charm; word: string; at: number };
type State = { author: string; authorId: string | null; ago: string; caption: string; car: string; drops: Drop[]; outcome: { o: number; at: number } | null };
type Action = { t: "drop"; charm: string; word: string } | { t: "after"; o: number };
type Local = { charm: Charm; word: string; cheers: number };

const PANEL = 556;
const CHARMS: Charm[] = ["clover", "horseshoe", "car", "star", "heart", "coffee"];
const OUTCOMES = ["Sun", "Half sun", "Cloud"];
const OUT_LINE = ["it went great", "it was nice", "not the one, still a good night"];
const POCKET = { top: 286, h: 132 };
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
/** One word: the first run of letters, digits, apostrophes or dashes. */
const oneWord = (v: unknown) => (clean(v, 40).match(/[\p{L}\p{N}'’-]+/u)?.[0] ?? "").slice(0, 16);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const findMember = (ctx: Ctx, name: string): Member | undefined => {
  const k = name.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k) : undefined;
};
const isCharm = (v: unknown): v is Charm => typeof v === "string" && (CHARMS as string[]).includes(v);

function initState(ctx: Ctx): State {
  const author = clean(P.author, 20);
  const drops: Drop[] = [];
  for (const d of Array.isArray(P.charms) ? P.charms : []) {
    if (drops.length >= 24) break;
    const name = clean(d?.who, 20);
    const word = oneWord(d?.word);
    if (!name || !isCharm(d.charm) || !word) continue;
    const m = findMember(ctx, name);
    const who = m ? m.id : `o:${name}`;
    if (drops.some((x) => x.who === who)) continue;
    drops.push({ who, name: m ? m.name : name, charm: d.charm, word, at: 0 });
  }
  return { author, authorId: findMember(ctx, author)?.id ?? null, ago: clean(P.ago, 6), caption: clean(P.caption, 44), car: clean(P.car, 16) || "tiny car", drops, outcome: null };
}

// ---- Charms ------------------------------------------------------------------------------------

type Pal = ReturnType<typeof pal>;
function drawCharm(g: CanvasRenderingContext2D, kind: Charm, x: number, y: number, s: number, rot: number, p: Pal) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s);
  if (kind === "clover") {
    g.fillStyle = p.green;
    g.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      g.moveTo(Math.cos(a) * 6 + 5, Math.sin(a) * 6);
      g.arc(Math.cos(a) * 6, Math.sin(a) * 6, 5.5, 0, Math.PI * 2);
    }
    g.fill();
    g.strokeStyle = p.leaf;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 2);
    g.quadraticCurveTo(3, 10, 1, 15);
    g.stroke();
  } else if (kind === "horseshoe") {
    g.strokeStyle = p.soft;
    g.lineWidth = 5;
    g.lineCap = "round";
    g.beginPath();
    g.arc(0, -1, 9, Math.PI * 0.85, Math.PI * 2.15);
    g.stroke();
    g.fillStyle = p.paper;
    g.beginPath();
    for (const a of [1.0, 1.4, 1.6, 2.0]) {
      g.moveTo(Math.cos(a * Math.PI) * 9 + 1, -1 + Math.sin(a * Math.PI) * 9);
      g.arc(Math.cos(a * Math.PI) * 9, -1 + Math.sin(a * Math.PI) * 9, 1, 0, Math.PI * 2);
    }
    g.fill();
  } else if (kind === "car") {
    g.fillStyle = p.green;
    g.beginPath();
    g.roundRect(-13, -4, 26, 9, 3);
    g.roundRect(-8, -10, 15, 8, 3);
    g.fill();
    g.fillStyle = p.sky;
    g.fillRect(-6, -8, 5, 5);
    g.fillRect(1, -8, 4, 5);
    g.fillStyle = p.ink;
    g.beginPath();
    g.arc(-7, 6, 3.4, 0, Math.PI * 2);
    g.arc(7, 6, 3.4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = p.ink;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-9, -12);
    g.lineTo(7, -12);
    g.stroke();
  } else if (kind === "star") {
    g.fillStyle = p.yellow;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 5 : 12;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      if (k === 0) g.moveTo(r * Math.cos(a), r * Math.sin(a));
      else g.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    g.closePath();
    g.fill();
  } else if (kind === "heart") {
    g.fillStyle = p.red;
    g.beginPath();
    g.moveTo(0, 10);
    g.bezierCurveTo(-14, 0, -8, -12, 0, -5);
    g.bezierCurveTo(8, -12, 14, 0, 0, 10);
    g.fill();
  } else {
    g.fillStyle = p.paper;
    g.beginPath();
    g.moveTo(-8, -9);
    g.lineTo(8, -9);
    g.lineTo(6, 10);
    g.lineTo(-6, 10);
    g.closePath();
    g.fill();
    g.fillStyle = p.brown;
    g.fillRect(-7.5, -2, 15, 6);
    g.fillStyle = p.ink;
    g.fillRect(-9, -12, 18, 3);
  }
  g.restore();
}

function spot(d: Drop, i: number, w: number) {
  const r = seedOf(`${d.who}:${d.charm}`);
  const pw = Math.min(220, w * 0.62);
  const x = w / 2 - pw / 2 + 24 + (((i % 5) + 0.5) / 5) * (pw - 48) + ((r % 13) - 6) + (Math.floor(i / 5) % 2) * 14;
  const row = Math.floor(i / 5);
  const y = POCKET.top + 40 - row * 15 - ((r >> 10) % 8);
  return { x, y, rot: (((r >> 4) % 100) / 100 - 0.5) * 1.2 };
}

function drawScene(g: CanvasRenderingContext2D, f: DrawFrame, s: State, theme: Theme): boolean {
  const p = pal(theme);
  const w = f.width;
  const h = f.height;
  const t = f.now / 1000;
  // Evening out a window: dusk sky and city lights.
  const sky = g.createLinearGradient(0, 0, 0, 260);
  sky.addColorStop(0, mix(p.purple, p.dark, 0.55));
  sky.addColorStop(1, mix(p.orange, p.purple, 0.45));
  g.fillStyle = sky;
  g.fillRect(0, 0, w, 260);
  g.fillStyle = mix(p.dark, p.purple, 0.25);
  g.beginPath();
  for (let k = 0; k < 9; k++) {
    const bw = 30 + ((k * 17) % 22);
    const bh = 40 + ((k * 29) % 60);
    g.rect(k * (w / 8.5), 250 - bh, bw, bh);
  }
  g.fill();
  g.fillStyle = mix(p.yellow, p.cream, 0.5);
  g.beginPath();
  for (let k = 0; k < 24; k++) {
    if ((k * 7 + Math.floor(t / 3)) % 5 === 0) continue;
    const x = ((k * 53) % (w - 10)) + 4;
    const y = 200 + ((k * 37) % 40);
    g.rect(x, y, 3, 4);
  }
  g.fill();
  // Denim from the waist down: base, twill lines, seams.
  const denim = mix(p.blue, p.dark, 0.35);
  g.fillStyle = denim;
  g.beginPath();
  g.moveTo(0, 262);
  g.quadraticCurveTo(w / 2, 240, w, 262);
  g.lineTo(w, h);
  g.lineTo(0, h);
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = mix(p.blue, p.dark, 0.2);
  g.lineWidth = 1;
  g.globalAlpha = 0.5;
  g.beginPath();
  for (let x = -h; x < w; x += 7) {
    g.moveTo(x, h);
    g.lineTo(x + h * 0.6, 0);
  }
  g.stroke();
  g.globalAlpha = 1;
  g.restore();
  g.strokeStyle = p.orange;
  g.lineWidth = 1.5;
  g.setLineDash([5, 4]);
  g.beginPath();
  g.moveTo(w * 0.5, 252);
  g.lineTo(w * 0.5, POCKET.top - 18);
  g.moveTo(0, 270);
  g.quadraticCurveTo(w / 2, 250, w, 270);
  g.stroke();
  // The pocket: back panel, charms inside, front panel with a stitched V and a flap.
  const pw = Math.min(220, w * 0.62);
  const px = w / 2 - pw / 2;
  g.setLineDash([]);
  g.fillStyle = mix(p.blue, p.dark, 0.6);
  g.beginPath();
  g.roundRect(px, POCKET.top, pw, POCKET.h, [6, 6, 26, 26]);
  g.fill();
  const dance = s.outcome ? Math.max(0, f.now - s.outcome.at) : -1;
  s.drops.forEach((d, i) => {
    const q = spot(d, i, w);
    let y = q.y;
    let rot = q.rot;
    if (d.at > 0 && f.now - d.at < 900) {
      const e = Math.max(0, f.now - d.at) / 900;
      const fall = e < 0.7 ? (e / 0.7) ** 2 : 1 - 0.12 * Math.sin(((e - 0.7) / 0.3) * Math.PI);
      y = 40 + (q.y - 40) * fall;
      rot += (1 - e) * 4;
    }
    if (dance >= 0) {
      y -= Math.abs(Math.sin(t * 6 + i)) * (dance < 4000 ? 18 : 6);
      rot += 0.3 * Math.sin(t * 5 + i * 2);
    }
    drawCharm(g, d.charm, q.x, y - 12, 1.75, rot, p);
  });
  g.fillStyle = mix(p.blue, p.dark, 0.25);
  g.beginPath();
  g.moveTo(px, POCKET.top + 34);
  g.lineTo(px + pw, POCKET.top + 34);
  g.lineTo(px + pw, POCKET.top + POCKET.h - 26);
  g.quadraticCurveTo(px + pw, POCKET.top + POCKET.h, px + pw - 26, POCKET.top + POCKET.h);
  g.lineTo(px + 26, POCKET.top + POCKET.h);
  g.quadraticCurveTo(px, POCKET.top + POCKET.h, px, POCKET.top + POCKET.h - 26);
  g.closePath();
  g.fill();
  g.strokeStyle = p.orange;
  g.lineWidth = 1.5;
  g.setLineDash([5, 4]);
  g.beginPath();
  g.moveTo(px + 6, POCKET.top + 40);
  g.lineTo(px + 6, POCKET.top + POCKET.h - 22);
  g.quadraticCurveTo(px + 6, POCKET.top + POCKET.h - 6, px + 26, POCKET.top + POCKET.h - 6);
  g.lineTo(px + pw - 26, POCKET.top + POCKET.h - 6);
  g.quadraticCurveTo(px + pw - 6, POCKET.top + POCKET.h - 6, px + pw - 6, POCKET.top + POCKET.h - 22);
  g.lineTo(px + pw - 6, POCKET.top + 40);
  g.moveTo(px + 20, POCKET.top + 52);
  g.lineTo(px + pw / 2, POCKET.top + 80);
  g.lineTo(px + pw - 20, POCKET.top + 52);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = mix(p.yellow, p.brown, 0.35);
  g.beginPath();
  for (const rx of [px + 8, px + pw - 8]) {
    g.moveTo(rx + 4, POCKET.top + 42);
    g.arc(rx, POCKET.top + 42, 4, 0, Math.PI * 2);
  }
  g.fill();
  return true;
}

function Sticker(a: { o: number; size: number; theme: Theme }) {
  const p = pal(a.theme);
  const s = a.size;
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden="true">
      {a.o < 2 ? (
        <g>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
            <line key={k} x1={a.o === 1 ? 16 : 20} y1={a.o === 1 ? 16 : 20} x2={(a.o === 1 ? 16 : 20) + 16 * Math.cos((k * Math.PI) / 4)} y2={(a.o === 1 ? 16 : 20) + 16 * Math.sin((k * Math.PI) / 4)} stroke={p.yellow} stroke-width="2.5" stroke-linecap="round" />
          ))}
          <circle cx={a.o === 1 ? 16 : 20} cy={a.o === 1 ? 16 : 20} r="10" fill={p.yellow} />
        </g>
      ) : null}
      {a.o > 0 ? <path d={a.o === 1 ? "M14 32 a7 7 0 0 1 4-12 a9 9 0 0 1 16 2 a6 6 0 0 1 0 10 Z" : "M8 30 a8 8 0 0 1 4-14 a11 11 0 0 1 20 2 a7 7 0 0 1 0 12 Z"} fill={a.o === 1 ? p.paper : mix(p.shade, p.ink, 0.3)} /> : null}
    </svg>
  );
}

function CharmIcon(a: { kind: Charm; theme: Theme }) {
  return <Canvas height={40} label={a.kind} draw={(g, f) => drawCharm(g, a.kind, f.width / 2, 21, 1.1, 0, pal(a.theme))} />;
}

export default defineApp<State, Action, Local>({
  name: "Luck pocket",
  summary: (s) => {
    const who = s.author || "Their";
    const base = `${who}'s pocket: ${s.drops.length} ${s.drops.length === 1 ? "charm" : "charms"}`;
    return s.outcome ? `${base} · ${OUTCOMES[s.outcome.o]!.toLowerCase()}` : base;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "drop") {
      const word = oneWord(a.word);
      if (s.outcome || !isCharm(a.charm) || !word || meta.user === s.authorId) return s;
      const name = ctx.members.find((m) => m.id === meta.user)?.name ?? "Friend";
      const rest = s.drops.filter((d) => d.who !== meta.user);
      if (rest.length >= 24) return s;
      return { ...s, drops: [...rest, { who: meta.user, name, charm: a.charm, word, at: meta.time }] };
    }
    if (a.t === "after") {
      if (meta.user !== s.authorId || typeof a.o !== "number" || !Number.isInteger(a.o) || a.o < 0 || a.o > 2) return s;
      if (s.outcome?.o === a.o) return s;
      return { ...s, outcome: { o: a.o, at: Math.max(1, meta.time) } };
    }
    return s;
  },

  invariants: {
    "one charm each, a real charm and one word": (s) => new Set(s.drops.map((d) => d.who)).size === s.drops.length && s.drops.every((d) => isCharm(d.charm) && d.word.length > 0 && !/\s/.test(d.word)),
    "the pocket holds 24 at most": (s) => s.drops.length <= 24,
    "the outcome is sun, half sun or cloud": (s) => s.outcome === null || (Number.isInteger(s.outcome.o) && s.outcome.o >= 0 && s.outcome.o <= 2 && s.outcome.at > 0),
    "nobody charms their own pocket": (s) => s.authorId === null || !s.drops.some((d) => d.who === s.authorId),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "a drop puts my one charm last": (p, n, a, m) => {
      if (a.t !== "drop" || p === n) return true;
      const d = n.drops[n.drops.length - 1];
      const others = (xs: Drop[]) => xs.filter((x) => x.who !== m.user);
      return !!d && d.who === m.user && d.charm === a.charm && d.at === m.time && n.drops.filter((x) => x.who === m.user).length === 1 && others(p.drops).length === others(n.drops).length && others(p.drops).every((x, i) => others(n.drops)[i] === x) && n.outcome === p.outcome;
    },
    "the word is the first word typed": (p, n, a) => {
      if (a.t !== "drop" || p === n) return true;
      const typed = typeof a.word === "string" ? a.word.trim().split(/\s+/)[0] ?? "" : "";
      const got = n.drops[n.drops.length - 1]!.word;
      return got.length > 0 && got.length <= 16 && typed.toLowerCase().includes(got.toLowerCase().slice(0, 3));
    },
    "no drops after the sticker": (p, n, a) => a.t !== "drop" || p.outcome === null || p === n,
    "only the story's author adds the sticker": (p, n, a, m) => a.t !== "after" || p === n || (m.user === p.authorId && n.outcome?.o === a.o && n.outcome.at === Math.max(1, m.time) && n.drops === p.drops),
  },

  arbitrary: (s, u, r) => {
    if (u === s.authorId) return { t: "after", o: r.int(3) };
    if (r.next() < 0.08) return { t: "after", o: r.int(3) };
    return { t: "drop", charm: r.pick(CHARMS), word: r.pick(["luck", "breathe", "you got this", "  smile ", "ask questions"]) };
  },

  local: { charm: "clover", word: "", cheers: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const isAuthor = !!state.authorId && state.authorId === me;
    const mine = state.drops.find((d) => d.who === me);
    const author = members.find((m) => m.id === state.authorId) ?? { id: `o:${state.author || "?"}`, name: state.author || "?" };
    const face = (d: Drop): Member => members.find((m) => m.id === d.who) ?? { id: d.who, name: d.name };
    const tags = [...state.drops].sort((a, b) => b.at - a.at || state.drops.indexOf(b) - state.drops.indexOf(a)).slice(0, 4);
    const fresh = mine && mine.at > 0 && running(mine.at, 2000) !== null;
    const cap = fitText(state.caption, W - 36, { size: 24, weight: 800, min: 14 });
    const charmName = (k: Charm) => (k === "car" ? state.car : k);
    const drop = () => {
      haptic("success");
      dispatch({ t: "drop", charm: local.charm, word: local.word.trim() || "luck" });
      setLocal({ word: "", cheers: local.cheers + 1 });
    };
    const tagPos = [
      { left: 10, top: 196 },
      { right: 10, top: 196 },
      { left: 10, top: 238 },
      { right: 10, top: 238 },
    ];

    return (
      <div>
        <style>{".lpc::after{content:\"\";position:absolute;top:0;bottom:0;left:-3px;right:-3px}"}</style>
        <div style={{ position: "relative", height: PANEL, borderRadius: 12, overflow: "hidden", background: p.dark, color: p.on }}>
          <Canvas height={PANEL} label={`Jacket pocket with ${state.drops.length} good-luck charms`} draw={(g, f) => drawScene(g, f, state, theme)} />
          <div aria-hidden="true" style={{ position: "absolute", left: 8, right: 8, top: 8, height: 3, borderRadius: 2, background: mix(p.on, p.dark, 0.55), pointerEvents: "none" }}>
            <div style={{ width: "30%", height: 3, borderRadius: 2, background: p.on }} />
          </div>
          <div style={{ position: "absolute", left: 11, right: 12, top: 18, height: 32, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
            <span style={{ width: 32, height: 32, flex: "none", borderRadius: 16, background: p.on, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Avatar user={author} size={28} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: p.on, flex: "none" }}>{state.author || "Story"}</span>
            <span style={{ fontSize: 15, color: p.on, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.ago}</span>
          </div>
          {state.caption ? (
            <div style={{ position: "absolute", left: 16, right: 16, top: 66, textAlign: "center", pointerEvents: "none" }}>
              <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 8, background: p.on, color: p.dark, fontSize: cap.size, fontWeight: 800, lineHeight: "32px", whiteSpace: "nowrap", transform: "rotate(-2deg)" }}>{cap.text}</span>
            </div>
          ) : null}
          {state.outcome ? (
            <div style={{ position: "absolute", left: "50%", top: 108, marginLeft: -40, width: 80, height: 80, borderRadius: 40, background: p.on, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(8deg)", pointerEvents: "none" }}>
              <Sticker o={state.outcome.o} size={64} theme={theme} />
            </div>
          ) : null}
          <div style={{ position: "absolute", left: "50%", top: POCKET.top + 84, transform: "translateX(-50%) rotate(-3deg)", padding: "4px 12px", borderRadius: 6, border: `1.5px dashed ${p.on}`, color: p.on, fontSize: 15, fontWeight: 700, lineHeight: "20px", whiteSpace: "nowrap", pointerEvents: "none", background: mix(p.blue, p.dark, 0.25) }}>
            {state.drops.length ? `${state.drops.length} ${state.drops.length === 1 ? "charm" : "charms"} for ${state.author || "luck"}` : "Drop the first charm"}
          </div>
          {tags.map((d, i) => {
            const pos = tagPos[i]!;
            const fit = fitText(d.word, 92, { size: 13, weight: 700, min: 10 });
            return (
              <div key={d.who} style={{ position: "absolute", ...pos, height: 30, padding: "0 10px 0 3px", borderRadius: 15, background: p.on, color: p.dark, display: "flex", alignItems: "center", gap: 6, pointerEvents: "none", transform: `rotate(${i % 2 ? 3 : -3}deg)` }}>
                <Avatar user={face(d)} size={24} />
                <span style={{ fontSize: fit.size, fontWeight: 700, whiteSpace: "nowrap" }}>{fit.text}</span>
              </div>
            );
          })}

          <div style={{ position: "absolute", left: 12, right: 12, top: 430, height: 116, borderRadius: 16, background: c.card, color: c.text, padding: "8px 10px", boxSizing: "border-box" }}>
            {isAuthor ? (
              <>
                <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>{state.outcome ? `You added ${OUTCOMES[state.outcome.o]!.toLowerCase()} · ${OUT_LINE[state.outcome.o]}` : `${state.drops.length} charms in your pocket · after, add one sticker`}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {[0, 1, 2].map((o) => (
                    <button
                      key={o}
                      type="button"
                      aria-label={OUTCOMES[o]}
                      aria-pressed={state.outcome?.o === o}
                      onClick={() => {
                        haptic("success");
                        dispatch({ t: "after", o });
                      }}
                      style={{ flex: 1, height: 68, border: 0, borderRadius: 12, background: state.outcome?.o === o ? c.selected : c.wash, boxShadow: state.outcome?.o === o ? `inset 0 0 0 2px ${c.primary}` : undefined, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                      <Sticker o={o} size={48} theme={theme} />
                    </button>
                  ))}
                </div>
              </>
            ) : state.outcome ? (
              <div style={{ height: 100, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{`${state.author || "They"} added a sticker`}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.secondaryText }}>
                  <Facepile users={state.drops.map(face).slice(0, 4)} max={4} size={22} />
                  <span>{`${state.drops.length} charms danced`}</span>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 4 }}>
                  {CHARMS.map((k) => (
                    <button
                      key={k}
                      class="lpc"
                      type="button"
                      aria-label={charmName(k)}
                      aria-pressed={local.charm === k}
                      onClick={() => setLocal({ charm: k })}
                      style={{ position: "relative", flex: 1, height: 44, padding: 0, border: 0, borderRadius: 10, background: local.charm === k ? c.selected : c.wash, boxShadow: local.charm === k ? `inset 0 0 0 2px ${c.primary}` : undefined, cursor: "pointer", overflow: "hidden" }}
                    >
                      <CharmIcon kind={k} theme={theme} />
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                  <input
                    aria-label="One word"
                    placeholder={mine ? `Yours: ${mine.word}` : "One word…"}
                    maxLength={16}
                    value={local.word}
                    onInput={(e: { currentTarget: { value: string } }) => setLocal({ word: e.currentTarget.value })}
                    style={{ flex: 1, minWidth: 0, height: 40, boxSizing: "border-box" }}
                  />
                  <Button kind="primary" onClick={drop}>
                    {mine ? "Swap it" : "Drop it in"}
                  </Button>
                </div>
              </>
            )}
          </div>
          {fresh ? (
            <div style={{ position: "absolute", left: "50%", top: POCKET.top + 20, pointerEvents: "none" }}>
              <Burst key={local.cheers} emoji="🍀" />
            </div>
          ) : null}
        </div>
        {fresh && mine ? <Toast key={local.cheers}>{`Your ${charmName(mine.charm)} is in the pocket`}</Toast> : null}
      </div>
    );
  },
});
