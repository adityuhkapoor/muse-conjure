import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  running,
  type Ctx,
  type DrawFrame,
  type Theme,
} from "@muse/app";

// Label maker: everyone's moving boxes need labels. A handheld label maker prints your words onto
// a strip of embossed tape in the color you pick; the strip feeds out, then sticks onto the next box
// in the group's stack. The boxes show whose labels are whose.

type Params = {
  /** Card title */
  title: string;
  /** Whose boxes: "412 Pine boxes" */
  stack: string;
  /** Labels already printed: who, the words, tape 0-3 */
  labels: { who: string; text: string; tape: number }[];
};

// @params
const P: Params = {
  title: "Label the boxes",
  stack: "412 Pine boxes · move-out Saturday",
  labels: [
    { who: "Arun", text: "rice cooker. do not sell", tape: 1 },
    { who: "Maya", text: "cables, sorted by color", tape: 2 },
    { who: "Calvin", text: "alarms (all 7)", tape: 0 },
  ],
};
// @end params

type Label = { id: number; user: string; name: string; text: string; tape: number; at: number };
type State = { title: string; stack: string; labels: Label[]; next: number };
type Action = { t: "print"; text: string; tape: number } | { t: "peel"; id: number };
type Local = { draft: string; tape: number; toast: number; printAt: number };

const H = 204;
const MAX = 24;
const PRINT = 1300;
const TAPES = 4;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const tapeColor = (t: Theme, i: number) => {
  const p = pal(t);
  const base = [p.red, p.blue, p.green, p.purple][i % TAPES]!;
  return mix(base, t.mode === "dark" ? t.color.wash : t.color.text, 0.38);
};

/** Server-aligned now; the clock only ticks while read, so narrow it down with running(). */
function freshNow(): number {
  let lo = clock.value - 1;
  let hi = lo + 3_600_000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (running(mid, 1) === null) lo = mid;
    else hi = mid;
  }
  return hi;
}

function initState(ctx: Ctx): State {
  const labels: Label[] = [];
  for (const l of Array.isArray(P.labels) ? P.labels : []) {
    const name = clean(l?.who, 20), text = clean(l?.text, MAX);
    if (!name || !text || labels.length >= 12) continue;
    const m = ctx.members.find((x) => x.id === name || x.name.trim().toLowerCase() === name.toLowerCase());
    labels.push({ id: labels.length + 1, user: m ? m.id : `o:${name}`, name, text, tape: Number.isInteger(l.tape) && l.tape >= 0 && l.tape < TAPES ? l.tape : 0, at: 0 });
  }
  return { title: clean(P.title, 32) || "Label the boxes", stack: clean(P.stack, 44), labels, next: labels.length + 1 };
}

/** Embossed tape with the words raised on it, centered on (x, y). */
function tape(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, col: string, t: Theme, tilt: number) {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  const h = 20;
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-w / 2, -h / 2);
  g.lineTo(w / 2, -h / 2);
  g.lineTo(w / 2 - 3, 0);
  g.lineTo(w / 2, h / 2);
  g.lineTo(-w / 2, h / 2);
  g.lineTo(-w / 2 + 3, 0);
  g.closePath();
  g.fill();
  const f = fitText(text.toUpperCase(), w - 10, { g, size: 11, weight: 800, min: 10, family: t.type.family });
  g.font = f.font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = t.mode === "dark" ? t.color.text : t.color.card;
  g.fillText(f.text, 0, 0);
  g.restore();
}

export default defineApp<State, Action, Local>({
  name: "Label maker",
  summary: (s) => `${s.title} · ${s.labels.length} ${s.labels.length === 1 ? "box" : "boxes"} labeled${s.labels.length ? ` · latest: ${s.labels[s.labels.length - 1]!.text}` : ""}`,

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "print") {
      const text = clean(a.text, MAX);
      if (!text || typeof a.tape !== "number" || !Number.isInteger(a.tape) || a.tape < 0 || a.tape >= TAPES) return s;
      const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
      return { ...s, labels: [...s.labels, { id: s.next, user: m.user, name, text, tape: a.tape, at: m.time }].slice(-30), next: s.next + 1 };
    }
    if (a.t === "peel") {
      if (!s.labels.some((l) => l.id === a.id && l.user === m.user)) return s;
      return { ...s, labels: s.labels.filter((l) => l.id !== a.id) };
    }
    return s;
  },

  invariants: {
    "labels have words": (s) => s.labels.every((l) => l.text.length > 0 && l.text.length <= MAX && l.text === l.text.trim()),
    "each label has its own number": (s) => new Set(s.labels.map((l) => l.id)).size === s.labels.length && s.labels.every((l) => l.id < s.next),
    "tape is one of the rolls": (s) => s.labels.every((l) => Number.isInteger(l.tape) && l.tape >= 0 && l.tape < TAPES),
  },

  transitions: {
    "printing adds your label": (p, n, a, m) => {
      if (a.t !== "print" || p === n) return true;
      const l = n.labels[n.labels.length - 1]!;
      return l.user === m.user && l.text === clean(a.text, MAX) && l.tape === a.tape && l.at === m.time && l.id === p.next && n.next === p.next + 1;
    },
    "you only peel your own": (p, n, a, m) => a.t !== "peel" || p === n || (p.labels.find((l) => l.id === a.id)?.user === m.user && n.labels.length === p.labels.length - 1),
    "other labels stay put": (p, n, a) => a.t === "peel" || n.labels.slice(0, -1).every((l) => p.labels.some((q) => q.id === l.id && q.text === l.text)),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const mine = s.labels.filter((l) => l.user === user);
    if (mine.length && r.next() < 0.3) return { t: "peel", id: r.pick(mine).id };
    return { t: "print", text: r.pick(["kitchen", "books (heavy)", "fragile!!", "bathroom stuff", "  ", "will's shampoos (12)"]), tape: r.int(TAPES + 1) };
  },

  local: { draft: "", tape: 1, toast: 0, printAt: 0 },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const shown = s.labels.slice(-6);
    const extra = s.labels.length - shown.length;
    const cols = 3;
    const bw = (W - 16) / cols, bh = 58;
    const boxAt = (i: number) => ({ x: (i % cols) * (bw + 8), y: 150 - bh - Math.floor(i / cols) * (bh + 4) });
    const newest = s.labels[s.labels.length - 1];
    const fresh = newest && newest.at ? running(newest.at, PRINT) : null;
    const printing = local.printAt ? running(local.printAt, 600) : null;
    const nameOf = (l: Label) => (l.user === me ? "You" : members.find((x) => x.id === l.user)?.name ?? l.name);
    const draft = clean(local.draft, MAX);

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      g.fillStyle = dark ? mix(c.wash, c.card, 0.4) : c.wash;
      g.beginPath();
      g.roundRect(0, 0, w, H, 12);
      g.fill();
      // floor line
      g.fillStyle = dark ? mix(c.wash, c.text, 0.05) : mix(c.wash, c.secondaryText, 0.1);
      g.fillRect(0, 150, w, H - 150);
      // the boxes, back row first
      const order = shown.map((_, i) => i).sort((a, b) => Math.floor(b / cols) - Math.floor(a / cols));
      const slots = Math.max(cols, Math.ceil((shown.length + (shown.length < 6 ? 1 : 0)) / cols) * cols);
      for (let i = 0; i < Math.min(6, slots); i++) {
        if (i < shown.length) continue;
        const b = boxAt(i);
        g.strokeStyle = dark ? mix(c.text, c.wash, 0.55) : mix(c.secondaryText, c.wash, 0.4);
        g.lineWidth = 1.5;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.roundRect(b.x + 2, b.y + 2, bw - 4, bh - 4, 4);
        g.stroke();
        g.setLineDash([]);
      }
      for (const i of order) {
        const l = shown[i]!;
        const b = boxAt(i);
        const isNew = l === newest && fresh !== null;
        const drop = isNew ? Math.max(0, 1 - (fresh! - 700) / 500) : 0;
        const by = b.y - (isNew && fresh! > 700 ? 0 : 0);
        g.fillStyle = mix(p.crust, c.card, dark ? 0.35 : 0.15);
        g.beginPath();
        g.roundRect(b.x, by, bw, bh, 3);
        g.fill();
        g.fillStyle = mix(p.crust, p.dark, 0.18);
        g.fillRect(b.x, by, bw, 8);
        g.fillStyle = mix(p.crust, c.card, 0.45);
        g.fillRect(b.x + bw / 2 - 7, by, 14, bh);
        // the label lands after it feeds out
        if (!isNew || fresh! > 700) {
          const tilt = (((l.id * 37) % 9) - 4) * 0.012;
          tape(g, l.text, b.x + bw / 2, by + bh / 2 + 6 - drop * 30, bw - 2, tapeColor(theme, l.tape), theme, tilt);
        }
      }
      // the label maker
      const dx = 10, dy = 158, dw = 96, dh = 40;
      g.fillStyle = mix(p.yellow, p.orange, 0.3);
      g.beginPath();
      g.roundRect(dx, dy, dw, dh, 10);
      g.fill();
      g.fillStyle = dark ? c.wash : p.dark;
      g.beginPath();
      g.roundRect(dx + 8, dy + 7, 54, 15, 3);
      g.fill();
      const scr = fitText((draft || "type below").toUpperCase(), 50, { g, size: 10, weight: 700, min: 10, family: "ui-monospace, Menlo, monospace" });
      g.font = scr.font;
      g.fillStyle = dark ? p.green : mix(p.green, c.card, 0.35);
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.save();
      g.beginPath();
      g.rect(dx + 10, dy + 7, 50, 15);
      g.clip();
      g.fillText(scr.text, dx + 11, dy + 15);
      g.restore();
      g.fillStyle = mix(p.yellow, p.dark, 0.3);
      g.beginPath();
      for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
        g.moveTo(dx + 12 + k * 9 + 2.5, dy + 28 + r * 6);
        g.arc(dx + 12 + k * 9, dy + 28 + r * 6, 2.5, 0, Math.PI * 2);
      }
      g.fill();
      g.fillStyle = tapeColor(theme, local.tape);
      g.beginPath();
      g.arc(dx + 80, dy + 20, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(p.yellow, p.orange, 0.3);
      g.beginPath();
      g.arc(dx + 80, dy + 20, 4, 0, Math.PI * 2);
      g.fill();
      // the newest strip feeding out of the slot
      if (newest && fresh !== null && fresh <= 700) {
        const k = Math.min(1, fresh / 600);
        const tw = Math.min(w - dx - dw - 10, 200);
        g.save();
        g.beginPath();
        g.rect(dx + dw, dy, tw + 10, dh);
        g.clip();
        tape(g, newest.text, dx + dw - tw / 2 + tw * k, dy + 20, tw, tapeColor(theme, newest.tape), theme, 0);
        g.restore();
      } else if (draft && printing === null) {
        g.textAlign = "left";
        const hint = fitText("tap print to feed it out", w - dx - dw - 20, { g, size: 11, weight: 400, min: 10, family: theme.type.family });
        g.font = hint.font;
        g.fillStyle = c.secondaryText;
        g.fillText(hint.text, dx + dw + 12, dy + 20);
      }
      return fresh !== null || printing !== null;
    };

    const faces = shown.map((l, i) => {
      const b = boxAt(i);
      return (
        <div key={l.id} style={{ position: "absolute", left: b.x + 4, top: b.y + 12, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 1.5px ${c.card}`, pointerEvents: "none" }}>
          <Avatar user={l.user.startsWith("o:") ? { id: l.user, name: l.name } : l.user} size={16} />
        </div>
      );
    });
    const print = () => {
      if (!draft) return;
      dispatch({ t: "print", text: draft, tape: local.tape });
      haptic("light");
      setLocal({ draft: "", printAt: freshNow(), toast: local.toast + 1 });
    };
    const mineLast = [...s.labels].reverse().find((l) => l.user === me);

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.stack || `${s.labels.length} boxes labeled`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`Stack of ${s.labels.length} moving boxes with labels; a label maker`} draw={draw} />
          {faces}
          {extra > 0 ? (
            <div style={{ position: "absolute", right: 6, top: 6, padding: "0 8px", borderRadius: 10, background: c.card, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, pointerEvents: "none" }}>{`+${extra} more boxes`}</div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 6 }}>
          <input
            aria-label="Label text"
            value={local.draft}
            maxLength={MAX}
            placeholder={s.labels.length ? "What's in your box?" : "Label the first box"}
            onInput={(e: { currentTarget: { value: string } }) => setLocal({ draft: e.currentTarget.value.slice(0, MAX) })}
            onKeyDown={(e: { key: string }) => e.key === "Enter" && print()}
            style={{ flex: 1, minWidth: 0, height: 40 }}
          />
          {Array.from({ length: TAPES }, (_, i) => (
            <button
              key={i}
              aria-label={`Tape color ${i + 1}${i === local.tape ? ", picked" : ""}`}
              onClick={() => setLocal({ tape: i })}
              style={{ flex: "none", width: 44, height: 44, margin: "0 -9px", padding: 0, border: 0, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span style={{ width: 22, height: 22, borderRadius: 11, background: tapeColor(theme, i), boxShadow: i === local.tape ? `0 0 0 2px ${c.card}, 0 0 0 4px ${c.primary}` : "none" }} />
            </button>
          ))}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {newest ? `${nameOf(newest)}: “${newest.text}”` : "Nothing labeled yet · type what's inside"}
          </span>
          {mineLast ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "peel", id: mineLast.id })}>
              Peel
            </Button>
          ) : null}
          <Button kind="primary" disabled={!draft} onClick={print}>
            Print
          </Button>
        </div>
        {local.toast > 0 && mineLast ? <Toast key={local.toast}>Stuck on a box</Toast> : null}
      </div>
    );
  },
});
