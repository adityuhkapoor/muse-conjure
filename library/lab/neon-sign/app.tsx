import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
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

// Neon sign: the apartment gets a neon sign for the wall, and everyone bends one line of it. Type a
// few words, pick a tube colour and a little doodle, hang it, and it flickers on next to everyone
// else's. Anyone can flip the switch.

type Params = {
  /** The big line at the top: "412 PINE" */
  title: string;
  /** Lines already hung: color 0-5 (pink, yellow, blue, green, purple, orange), doodle 0-5 (none, heart, star, arrow, moon, cactus) */
  lines: { who: string; text: string; color: number; doodle: number }[];
};

// @params
const P: Params = {
  title: "412 PINE",
  lines: [
    { who: "Maya", text: "open 24/7", color: 0, doodle: 1 },
    { who: "Arun", text: "rice served daily", color: 1, doodle: 0 },
    { who: "Will", text: "parking: good luck", color: 2, doodle: 3 },
    { who: "Calvin", text: "quiet till 7:05", color: 4, doodle: 4 },
    { who: "Tsai Lin", text: "no aux requests", color: 3, doodle: 2 },
  ],
};
// @end params

type Line = { by: string; name: string; text: string; color: number; doodle: number; at: number };
type State = { title: string; lines: Line[]; on: boolean; flippedAt: number; flippedBy: string };
type Action = { t: "hang"; text: string; color: number; doodle: number } | { t: "switch" };
type Local = { draft: string; color: number; doodle: number; toast: number };

const H = 214;
const MAX_LINES = 6;
const COLOR_NAMES = ["Pink", "Yellow", "Blue", "Green", "Purple", "Orange"];
const DOODLE_NAMES = ["No doodle", "Heart", "Star", "Arrow", "Moon", "Cactus"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const findMember = (ctx: Ctx, name: string): Member | undefined => {
  const k = name.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k) : undefined;
};
const okIdx = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 5;
const tube = (i: number, theme: Theme) => {
  const p = pal(theme);
  return [mix(p.red, p.purple, 0.25), p.yellow, p.blue, p.green, p.purple, p.orange][i] ?? p.red;
};

function initState(ctx: Ctx): State {
  const lines: Line[] = [];
  for (const l of Array.isArray(P.lines) ? P.lines : []) {
    if (lines.length >= MAX_LINES) break;
    const name = clean(l?.who, 20);
    const text = clean(l?.text, 22);
    if (!name || !text) continue;
    const m = findMember(ctx, name);
    const by = m ? m.id : `o:${name}`;
    if (lines.some((x) => x.by === by)) continue;
    lines.push({ by, name: m ? m.name : name, text, color: okIdx(l.color) ? l.color : 0, doodle: okIdx(l.doodle) ? l.doodle : 0, at: 0 });
  }
  return { title: clean(P.title, 14) || "HOME", lines, on: true, flippedAt: 0, flippedBy: "" };
}

function doodle(g: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number) {
  g.beginPath();
  if (kind === 1) {
    g.moveTo(x, y + 6 * s);
    g.bezierCurveTo(x - 9 * s, y, x - 6 * s, y - 8 * s, x, y - 3 * s);
    g.bezierCurveTo(x + 6 * s, y - 8 * s, x + 9 * s, y, x, y + 6 * s);
  } else if (kind === 2) {
    for (let k = 0; k < 10; k++) {
      const r = (k % 2 ? 3.5 : 8) * s;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      if (k === 0) g.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
      else g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    g.closePath();
  } else if (kind === 3) {
    g.moveTo(x - 9 * s, y);
    g.lineTo(x + 7 * s, y);
    g.moveTo(x + 2 * s, y - 5 * s);
    g.lineTo(x + 8 * s, y);
    g.lineTo(x + 2 * s, y + 5 * s);
  } else if (kind === 4) {
    g.arc(x, y, 7 * s, Math.PI * 0.35, Math.PI * 1.65);
    g.arc(x + 3.5 * s, y, 5.5 * s, Math.PI * 1.55, Math.PI * 0.45, true);
  } else if (kind === 5) {
    g.moveTo(x, y + 8 * s);
    g.lineTo(x, y - 8 * s);
    g.moveTo(x, y + 1 * s);
    g.lineTo(x - 5 * s, y + 1 * s);
    g.lineTo(x - 5 * s, y - 4 * s);
    g.moveTo(x, y - 1 * s);
    g.lineTo(x + 5 * s, y - 1 * s);
    g.lineTo(x + 5 * s, y - 6 * s);
  }
  g.stroke();
}

function drawWall(g: CanvasRenderingContext2D, f: DrawFrame, s: State, preview: Line | null, theme: Theme): boolean {
  const p = pal(theme);
  const w = f.width;
  const now = f.now;
  // Night wall: dark bricks.
  g.fillStyle = mix(p.dark, p.brown, 0.3);
  g.fillRect(0, 0, w, H);
  g.fillStyle = mix(p.dark, p.brown, 0.45);
  g.beginPath();
  for (let row = 0; row * 16 < H; row++) {
    const off = row % 2 ? 0 : 20;
    for (let x = -20 + off; x < w; x += 40) g.rect(x + 1, row * 16 + 1, 38, 14);
  }
  g.fill();
  const lines = preview ? [...s.lines.filter((l) => l.by !== preview.by), preview] : s.lines;
  const n = lines.length + 1;
  const top = 18;
  const gap = Math.min(34, (H - top - 16) / n);
  const glow = (color: string, alpha: number, blur: number) => {
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.globalAlpha = alpha;
  };
  const flick = (at: number) => {
    if (!s.on) return 0.7;
    const e = now - at;
    if (at <= 0 || e > 1100) return 1;
    if (e < 0) return 0.25;
    return [0.25, 1, 0.3, 1, 0.4, 1, 1, 0.5, 1][Math.floor(e / 120)] ?? 1;
  };
  const sw = s.on ? Math.max(0, now - s.flippedAt) : 0;
  const master = s.on ? (s.flippedAt > 0 && sw < 500 ? 0.3 + 0.7 * (sw / 500) : 1) : 0.7;
  // Title in big tubes.
  const tcol = mix(p.red, p.on, 0.15);
  const tf = fitText(s.title, w - 40, { g, size: 34, weight: 800, min: 18 });
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `italic ${tf.font}`;
  glow(tcol, master, s.on ? 16 : 0);
  g.lineWidth = 3;
  g.strokeStyle = s.on ? tcol : mix(tcol, p.dark, 0.35);
  g.strokeText(tf.text, w / 2, top + gap * 0.5 + 4);
  g.fillStyle = s.on ? mix(tcol, p.on, 0.7) : mix(tcol, p.dark, 0.55);
  g.fillText(tf.text, w / 2, top + gap * 0.5 + 4);
  // Each friend's line.
  lines.forEach((l, i) => {
    const col = tube(l.color, theme);
    const y = top + gap * (i + 1.5) + 6;
    const lf = fitText(l.text, w - 80, { g, size: 18, weight: 600, min: 11 });
    const a = l === preview ? 0.6 + 0.2 * Math.sin(now / 200) : flick(l.at) * master;
    glow(col, a, s.on ? 10 : 0);
    g.font = `italic ${lf.font}`;
    g.lineWidth = 1.5;
    g.strokeStyle = s.on ? col : mix(col, p.dark, 0.35);
    g.fillStyle = s.on ? mix(col, p.on, 0.6) : mix(col, p.dark, 0.55);
    const tw = g.measureText(lf.text).width;
    g.strokeText(lf.text, w / 2, y);
    g.fillText(lf.text, w / 2, y);
    if (l.doodle) {
      g.lineWidth = 2.2;
      g.lineCap = "round";
      g.lineJoin = "round";
      doodle(g, l.doodle, w / 2 + tw / 2 + 16, y, 1);
    }
  });
  g.shadowBlur = 0;
  g.globalAlpha = 1;
  // Mounting wires.
  g.strokeStyle = mix(p.dark, p.on, 0.25);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(w * 0.2, 0);
  g.lineTo(w * 0.2, 8);
  g.moveTo(w * 0.8, 0);
  g.lineTo(w * 0.8, 8);
  g.stroke();
  return s.on && (now - s.flippedAt < 600 || lines.some((l) => now - l.at < 1200) || !!preview);
}

export default defineApp<State, Action, Local>({
  name: "Neon sign",
  summary: (s) => `${s.title} neon: ${s.lines.length} ${s.lines.length === 1 ? "line" : "lines"} · ${s.on ? "on" : "off"}`,

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "hang") {
      const text = clean(a.text, 22);
      if (!text || !okIdx(a.color) || !okIdx(a.doodle)) return s;
      const rest = s.lines.filter((l) => l.by !== meta.user);
      if (rest.length >= MAX_LINES) return s;
      const name = ctx.members.find((m) => m.id === meta.user)?.name ?? "Friend";
      return { ...s, lines: [...rest, { by: meta.user, name, text, color: a.color, doodle: a.doodle, at: meta.time }] };
    }
    if (a.t === "switch") return { ...s, on: !s.on, flippedAt: meta.time, flippedBy: meta.user };
    return s;
  },

  invariants: {
    "one line each, six at most": (s) => new Set(s.lines.map((l) => l.by)).size === s.lines.length && s.lines.length <= MAX_LINES,
    "lines are short, with a real colour and doodle": (s) => s.lines.every((l) => l.text.length > 0 && l.text.length <= 22 && okIdx(l.color) && okIdx(l.doodle)),
    "the switch remembers who flipped it": (s) => (s.flippedAt === 0) === (s.flippedBy === ""),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "hanging puts my one line last": (p, n, a, m) => {
      if (a.t !== "hang" || p === n) return true;
      const l = n.lines[n.lines.length - 1];
      const others = (xs: Line[]) => xs.filter((x) => x.by !== m.user);
      const want = typeof a.text === "string" ? a.text.trim().replace(/\s+/g, " ").slice(0, 22) : "";
      return !!l && l.by === m.user && l.text === want && l.color === a.color && l.doodle === a.doodle && l.at === m.time && others(n.lines).length === others(p.lines).length && others(p.lines).every((x, i) => others(n.lines)[i] === x) && n.on === p.on;
    },
    "the switch flips and nothing else": (p, n, a, m) => a.t !== "switch" || p === n || (n.on === !p.on && n.flippedAt === m.time && n.flippedBy === m.user && n.lines === p.lines),
  },

  arbitrary: (_s, _u, r) =>
    r.next() < 0.2 ? { t: "switch" } : { t: "hang", text: r.pick(["open late", "  dishes?? ", "no shoes", "rice o'clock", "", "home of the Sube"]), color: r.int(6), doodle: r.int(6) },

  local: { draft: "", color: 0, doodle: 1, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const mine = state.lines.find((l) => l.by === me);
    const draft = local.draft.trim();
    const preview: Line | null = draft ? { by: me, name: "You", text: draft.slice(0, 22), color: local.color, doodle: local.doodle, at: 0 } : null;
    const people = state.lines.map((l) => members.find((m) => m.id === l.by) ?? { id: l.by, name: l.name });
    const flipper = members.find((m) => m.id === state.flippedBy);
    const fresh = mine && mine.at > 0 && running(mine.at, 2400) !== null;
    const full = !mine && state.lines.length >= MAX_LINES;
    const hang = () => {
      if (!draft) return;
      haptic("success");
      dispatch({ t: "hang", text: draft, color: local.color, doodle: local.doodle });
      setLocal({ draft: "", toast: local.toast + 1 });
    };

    return (
      <div>
        <style>{".nsc::after{content:\"\";position:absolute;top:0;bottom:0;left:-4px;right:-4px}"}</style>
        <CardHeader title="Neon sign" subtitle={`${state.lines.length} of ${MAX_LINES} lines bent${state.flippedBy && flipper ? ` · ${flipper.id === me ? "you" : flipper.name} hit the switch` : ""}`} />
        <div style={{ position: "relative", height: H, borderRadius: 12, overflow: "hidden" }}>
          <Canvas height={H} label={`Neon sign reading ${state.title}, then ${state.lines.map((l) => l.text).join(", ")}${state.on ? "" : ", switched off"}`} draw={(g, f) => drawWall(g, f, state, preview, theme)} />
          <button
            type="button"
            aria-label={state.on ? "Switch off" : "Switch on"}
            onClick={() => {
              haptic("light");
              dispatch({ t: "switch" });
            }}
            style={{ position: "absolute", right: 6, bottom: 6, width: 44, height: 44, border: 0, borderRadius: 10, background: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <span style={{ width: 22, height: 32, borderRadius: 4, background: c.card, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 1px ${c.divider}` }}>
              <span style={{ width: 8, height: 14, borderRadius: 2, background: state.on ? c.primary : c.secondaryText, transform: state.on ? "translateY(-4px)" : "translateY(4px)", transition: "transform 150ms" }} />
            </span>
          </button>
        </div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, height: 44 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              class="nsc"
              type="button"
              aria-label={`${COLOR_NAMES[i]} tube`}
              aria-pressed={local.color === i}
              onClick={() => setLocal({ color: i })}
              style={{ position: "relative", flex: 1, height: 44, minWidth: 0, border: 0, padding: 0, borderRadius: 22, background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span style={{ width: 26, height: 26, borderRadius: 13, background: tube(i, theme), boxShadow: local.color === i ? `0 0 0 3px ${c.card}, 0 0 0 5px ${c.primary}` : "none" }} />
            </button>
          ))}
          <button
            type="button"
            aria-label={`${DOODLE_NAMES[local.doodle]}, tap for another`}
            onClick={() => setLocal({ doodle: (local.doodle + 1) % 6 })}
            style={{ flex: "none", width: 44, height: 44, border: 0, borderRadius: 10, background: c.wash, padding: 0, cursor: "pointer" }}
          >
            <Canvas
              height={44}
              label={DOODLE_NAMES[local.doodle]!}
              draw={(g, f) => {
                g.strokeStyle = tube(local.color, theme);
                g.lineWidth = 2.2;
                g.lineCap = "round";
                if (local.doodle) doodle(g, local.doodle, f.width / 2, 22, 1.2);
                else {
                  g.beginPath();
                  g.moveTo(f.width / 2 - 7, 22);
                  g.lineTo(f.width / 2 + 7, 22);
                  g.stroke();
                }
              }}
            />
          </button>
        </div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            aria-label="Your line"
            placeholder={full ? "The sign is full" : mine ? `Yours: ${mine.text}` : "Your line, a few words"}
            maxLength={22}
            value={local.draft}
            disabled={full}
            onInput={(e: { currentTarget: { value: string } }) => setLocal({ draft: e.currentTarget.value })}
            style={{ flex: 1, minWidth: 0, height: 40, boxSizing: "border-box" }}
          />
          <Button kind="primary" disabled={!draft || full} onClick={hang}>
            {mine ? "Rehang" : "Hang it"}
          </Button>
        </div>
        <div style={{ marginTop: 8, height: 22, display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: c.secondaryText }}>
          {people.length ? <Facepile users={people.slice(0, 5)} max={5} size={20} /> : null}
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{people.length ? `${people.length} bent a line` : "Bend the first line under the title"}</span>
        </div>
        {local.toast > 0 && fresh ? <Toast key={local.toast}>Your line is lit</Toast> : null}
      </div>
    );
  },
});
