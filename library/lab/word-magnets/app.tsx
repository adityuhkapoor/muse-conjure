import { defineApp, Avatar, Button, Canvas, CardHeader, fitText, haptic, mix, pal, running, seedOf, textWidth, tween, type Ctx, type DrawFrame } from "@muse/app";

// Word magnets: the apartment fridge door, with a pile of word magnets pulled from the chat. Tap
// magnets to build your line under the others, then stick it: the magnets snap onto the door next
// to your face. Everyone gets one line, and together the door turns into the group's poem.

type Params = {
  /** Card title */
  title: string;
  /** Whose fridge: "412 Pine" */
  fridge: string;
  /** Up to 36 single words from the chat, lowercase unless a name */
  words: string[];
  /** Lines already on the door: who and their words, each from the list */
  lines: { who: string; words: string[] }[];
};

// @params
const P: Params = {
  title: "Fridge poem",
  fridge: "412 Pine",
  words: ["rice", "cooker", "seven", "alarms", "sing", "the", "Sube", "is", "warm", "cold", "shower", "lowkey", "forever", "aux", "veto", "spreadsheet", "my", "heart", "Pine", "snow", "again", "we", "never", "sleep", "dumplings", "and", "at", "2am", "home", "still", "louder", "color-coded"],
  lines: [
    { who: "Arun", words: ["rice", "cooker", "is", "my", "heart"] },
    { who: "Calvin", words: ["seven", "alarms", "sing", "at", "2am"] },
    { who: "Maya", words: ["color-coded", "snow", "and", "dumplings"] },
    { who: "Will", words: ["warm", "Sube", "cold", "shower"] },
  ],
};
// @end params

type Line = { u: string; idx: number[]; at: number };
type State = { title: string; fridge: string; words: string[]; lines: Line[] };
type Action = { t: "stick"; idx: number[] } | { t: "peel" };
type Local = { draft: number[] };

const MAX_WORDS = 7;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const snap = tween({ duration: 380, easing: [0.34, 1.56, 0.64, 1] });
const okIdx = (s: State, idx: unknown): idx is number[] =>
  Array.isArray(idx) && idx.length >= 1 && idx.length <= MAX_WORDS && idx.every((i) => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < s.words.length) && new Set(idx).size === idx.length;

function initState(ctx: Ctx): State {
  const words: string[] = [];
  for (const w of Array.isArray(P.words) ? P.words : []) {
    const x = clean(w, 14);
    if (x && !x.includes(" ") && !words.includes(x) && words.length < 36) words.push(x);
  }
  if (words.length < 6) for (const w of ["we", "are", "home", "again", "the", "kitchen", "light", "is", "on"]) if (!words.includes(w)) words.push(w);
  const lines: Line[] = [];
  for (const l of Array.isArray(P.lines) ? P.lines : []) {
    const n = clean(l?.who, 40).toLowerCase();
    const m = ctx.members.find((x) => x.id === n || x.name.toLowerCase() === n);
    if (!m || lines.some((x) => x.u === m.id)) continue;
    const idx = (Array.isArray(l.words) ? l.words : []).map((w) => words.indexOf(clean(w, 14))).filter((i, k, a) => i >= 0 && a.indexOf(i) === k).slice(0, MAX_WORDS);
    if (idx.length) lines.push({ u: m.id, idx, at: 0 });
  }
  return { title: clean(P.title, 40) || "Fridge poem", fridge: clean(P.fridge, 30), words, lines };
}

export default defineApp<State, Action, Local>({
  name: "Word magnets",
  summary: (s) => {
    const last = s.lines[s.lines.length - 1];
    return last ? `${s.title}: "${last.idx.map((i) => s.words[i]).join(" ")}" · ${s.lines.length} ${s.lines.length === 1 ? "line" : "lines"}` : `${s.title}: an empty fridge door`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u)) return s;
    if (a.t === "stick") {
      if (!okIdx(s, a.idx)) return s;
      return { ...s, lines: [...s.lines.filter((l) => l.u !== u), { u, idx: [...a.idx], at: meta.time }].slice(-12) };
    }
    if (a.t === "peel") {
      if (!s.lines.some((l) => l.u === u)) return s;
      return { ...s, lines: s.lines.filter((l) => l.u !== u) };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const lines = s.lines.filter((l) => inChat(ctx, l.u));
    return lines.length === s.lines.length ? s : { ...s, lines };
  },

  invariants: {
    "one line each": (s) => new Set(s.lines.map((l) => l.u)).size === s.lines.length,
    "lines use real magnets, each once": (s) => s.lines.every((l) => okIdx(s, l.idx)),
    "the door holds twelve lines at most": (s) => s.lines.length <= 12,
    "poets are in the chat": (s, ctx) => s.lines.every((l) => inChat(ctx, l.u)),
  },

  transitions: {
    "only sticking or peeling changes the door": (p, n, a) => a.t === "stick" || a.t === "peel" || p === n,
    "sticking puts your line last": (p, n, a, m) => a.t !== "stick" || p === n || (n.lines[n.lines.length - 1]!.u === m.user && n.lines[n.lines.length - 1]!.idx.join() === a.idx.join() && n.lines[n.lines.length - 1]!.at === m.time),
    "other lines stay put": (p, n, _a, m) => {
      const others = (s: State) => s.lines.filter((l) => l.u !== m.user).map((l) => l.u + ":" + l.idx.join());
      const was = others(p);
      const now = others(n);
      return now.every((x) => was.includes(x)) && (was.length === now.length || (was.length > now.length && n.lines.length === 12));
    },
    "peeling takes only your line": (p, n, a, m) => a.t !== "peel" || p === n || (!n.lines.some((l) => l.u === m.user) && n.lines.length === p.lines.length - 1),
    "the word list never changes": (p, n) => p.words.join() === n.words.join(),
  },

  arbitrary: (s, _u, r) => {
    if (r.next() < 0.15) return { t: "peel" };
    const n = 1 + r.int(5);
    const idx: number[] = [];
    for (let k = 0; k < n; k++) {
      const i = r.int(s.words.length);
      if (!idx.includes(i)) idx.push(i);
    }
    return { t: "stick", idx };
  },

  local: { draft: [] },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal(theme);
    const hues = [pl.red, pl.yellow, pl.green, pl.blue, pl.orange, pl.purple];
    const W = theme.width - 2 * theme.space.card;
    const mine = state.lines.find((l) => l.u === me);
    const shown = state.lines.slice(-3);
    const draft = local.draft.filter((i) => i < state.words.length);
    const FS = 12.5;
    const TH = 20;
    const tileW = (w: string) => Math.ceil(textWidth(w, FS)) + 12;
    // Layout, shared by drawing and tapping.
    type Tile = { i: number; x: number; y: number; w: number; rot: number; at: number; k: number };
    const flow = (idx: number[], x0: number, y0: number, right: number, rowH: number, at = 0) => {
      const out: Tile[] = [];
      let x = x0;
      let y = y0;
      idx.forEach((i, k) => {
        const w = tileW(state.words[i]!);
        if (x + w > right && x > x0) {
          x = x0;
          y += rowH;
        }
        out.push({ i, x, y, w, rot: (((seedOf(state.words[i]! + k) % 7) - 3) * 0.022), at, k });
        x += w + 5;
      });
      return { tiles: out, bottom: idx.length ? y + rowH : y0 };
    };
    const right = W - 24;
    let y = 10;
    const lineRows: { u: string; y: number; tiles: Tile[] }[] = [];
    for (const l of shown) {
      const f = flow(l.idx, 38, y, right, TH + 4, l.at);
      lineRows.push({ u: l.u, y, tiles: f.tiles });
      y = f.bottom + 3;
    }
    if (!shown.length) y = 46;
    const draftY = y + 4;
    const df = flow(draft, 16, draftY + 6, right - 4, TH + 4);
    const draftH = Math.max(32, df.bottom - draftY + 2);
    const pileTop = draftY + draftH + 11;
    const pileIdx = state.words.map((_, i) => i).filter((i) => !draft.includes(i));
    const pf = flow(pileIdx, 10, pileTop, right, TH + 5);
    const H = Math.max(pileTop + 30, pf.bottom + 6);

    const tile = (g: CanvasRenderingContext2D, t: Tile, q = 1) => {
      const w = state.words[t.i]!;
      const hue = hues[seedOf(w) % hues.length]!;
      g.save();
      g.translate(t.x + t.w / 2, t.y + TH / 2 - (1 - q) * 20);
      g.rotate(t.rot);
      g.scale(0.6 + 0.4 * q, 0.6 + 0.4 * q);
      g.fillStyle = mix(hue, c.text, 0.25);
      g.fillRect(-t.w / 2, -TH / 2 + 2, t.w, TH);
      g.fillStyle = mix(hue, c.card, theme.mode === "dark" ? 0.72 : 0.82);
      g.fillRect(-t.w / 2, -TH / 2, t.w, TH);
      g.fillStyle = c.text;
      g.font = `400 ${FS}px Georgia, serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(w, 0, 1);
      g.restore();
    };

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      // the door
      g.fillStyle = theme.mode === "dark" ? mix(c.text, c.card, 0.86) : mix(pl.sky, c.card, 0.5);
      g.beginPath();
      g.roundRect(0, 0, w, H, 14);
      g.fill();
      g.fillStyle = mix(c.text, c.card, 0.55);
      g.beginPath();
      g.roundRect(w - 13, 16, 6, 70, 3);
      g.fill();
      // a seam between freezer and fridge
      g.fillStyle = mix(c.text, c.card, 0.72);
      g.fillRect(0, pileTop - 7, w, 2);
      let moving = false;
      for (const row of lineRows)
        for (const t of row.tiles) {
          const e = running(t.at, 900);
          if (e !== null) moving = true;
          tile(g, t, e === null ? 1 : snap(Math.max(0, Math.min(380, e - t.k * 70))));
        }
      if (!shown.length) {
        g.fillStyle = c.text;
        g.font = `400 15px ${theme.type.family}`;
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.fillText("A clean door. First line sets the mood.", 14, 26);
      }
      // your line slot
      g.strokeStyle = draft.length ? c.primary : mix(c.text, c.card, 0.45);
      g.lineWidth = 1.5;
      g.setLineDash([5, 4]);
      g.beginPath();
      g.roundRect(8, draftY, w - 32, draftH, 8);
      g.stroke();
      g.setLineDash([]);
      for (const t of df.tiles) tile(g, t);
      if (!draft.length) {
        const ft = fitText(mine ? "Yours is up · tap magnets to redo it" : "Your line · tap magnets below", w - 60, { g, size: 13 });
        g.font = ft.font;
        g.fillStyle = c.text;
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.fillText(ft.text, 18, draftY + draftH / 2);
      }
      for (const t of pf.tiles) tile(g, t);
      return moving;
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "down") return;
      const hit = (ts: Tile[]) => ts.find((t) => e.x >= t.x - 3 && e.x <= t.x + t.w + 3 && e.y >= t.y - 4 && e.y <= t.y + TH + 4);
      const d = hit(df.tiles);
      if (d) {
        setLocal({ draft: draft.filter((x) => x !== d.i) });
        return;
      }
      const p = hit(pf.tiles);
      if (p && draft.length < MAX_WORDS) {
        haptic("light");
        setLocal({ draft: [...draft, p.i] });
      }
    };

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${state.fridge ? `${state.fridge} fridge · ` : ""}one line each`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`Fridge door with ${state.lines.length} lines and ${state.words.length} magnets`} draw={draw} onPointer={onPointer} />
          {lineRows.map((r) => (
            <div key={r.u} style={{ position: "absolute", left: 10, top: r.y + 1, display: "flex", pointerEvents: "none" }}>
              <Avatar user={r.u} size={20} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {draft.length ? `"${draft.map((i) => state.words[i]).join(" ")}"` : `${state.lines.length} of ${members.length} ${members.length === 1 ? "line" : "lines"} on the door`}
          </span>
          {mine && !draft.length ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "peel" })}>
              Peel mine
            </Button>
          ) : (
            <Button
              kind="primary"
              disabled={draft.length < 1}
              onClick={() => {
                haptic("success");
                dispatch({ t: "stick", idx: draft });
                setLocal({ draft: [] });
              }}
            >
              Stick it
            </Button>
          )}
        </div>
      </div>
    );
  },
});
