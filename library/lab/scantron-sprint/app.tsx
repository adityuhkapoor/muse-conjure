import { defineApp, Avatar, Button, Canvas, CardHeader, Toast, clock, haptic, mix, pal, rng, running, type Ctx, type DrawFrame } from "@muse/app";

// Scantron sprint: a two-minute memory game on a bubble sheet. Peek and the answer key fills in
// pencil for a few seconds, then erases itself. Fill the bubbles from memory and turn it in: it
// comes back graded in red pen, with your score circled at the top. Everyone gets the same key,
// so the chat's scores line up on the side like returned tests.

type Params = {
  /** Card title */
  title: string;
  /** Printed at the top of the sheet: "PSYCH 110 · practice midterm" */
  sheet: string;
  /** Round name; a new round is a new key */
  round: string;
  /** Number of questions, 5 to 9 */
  questions: number;
  /** How long the key shows, in seconds */
  peek: number;
  /** Scores already turned in: who, how many right, and what they said */
  scores: { who: string; score: number; said?: string }[];
};

// @params
const P: Params = {
  title: "Scantron sprint",
  sheet: "PSYCH 110 · practice midterm",
  round: "Dec 3",
  questions: 8,
  peek: 3,
  scores: [
    { who: "Maya", score: 8, said: "it's just a spreadsheet with bubbles" },
    { who: "Tsai Lin", score: 7 },
    { who: "Arun", score: 6, said: "studied by the rice cooker light" },
    { who: "Will", score: 5 },
    { who: "Calvin", score: 3, said: "blinked. an alarm went off" },
  ],
};
// @end params

type Paper = { who: string; name: string; score: number; picks: number[]; said: string; at: number };
type State = { title: string; sheet: string; key: number[]; peek: number; papers: Paper[] };
type Action = { t: "turnin"; picks: number[] };
type Local = { peek: number; picks: number[]; toast: number };

const LET = ["A", "B", "C", "D", "E"];
const ROWH = 22;
const TOPH = 30;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const hash = (t: string) => {
  let x = 2166136261;
  for (let i = 0; i < t.length; i++) x = Math.imul(x ^ t.charCodeAt(i), 16777619);
  return x >>> 0;
};
const grade = (key: number[], picks: number[]) => key.reduce((n, k, i) => n + (picks[i] === k ? 1 : 0), 0);
const sheetH = (n: number) => TOPH + n * ROWH + 10;
const geom = (W: number) => {
  const sw = Math.min(250, W - 112);
  return { sw, bx: 34, step: (sw - 34 - 46) / 4 };
};

function initState(ctx: Ctx): State {
  const n = isInt(P.questions, 5, 9) ? P.questions : 8;
  const r = rng(hash(`${clean(P.sheet, 60)}|${clean(P.round, 20)}`));
  const key = Array.from({ length: n }, () => r.int(5));
  const papers: Paper[] = [];
  for (const x of Array.isArray(P.scores) ? P.scores : []) {
    const nm = clean(x?.who, 20);
    if (!nm || !isInt(x.score, 0, n) || papers.length >= 12) continue;
    const m = ctx.members.find((y) => y.id === nm || y.name.toLowerCase() === nm.toLowerCase());
    const who = m ? m.id : `~${nm}`;
    if (papers.some((p) => p.who === who)) continue;
    papers.push({ who, name: m ? clean(m.name, 20) || nm : nm, score: x.score, picks: [], said: clean(x.said, 60), at: 0 });
  }
  return { title: clean(P.title, 40) || "Scantron sprint", sheet: clean(P.sheet, 48), key, peek: isInt(P.peek, 1, 8) ? P.peek : 3, papers };
}

function drawSheet(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, local: Local, gm: { sw: number; bx: number; step: number }) {
  const t = f.theme;
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const n = s.key.length;
  const H = sheetH(n);
  const { sw, bx, step } = gm;
  const mine = s.papers.find((p) => p.who === me && p.picks.length);
  const PEEK = s.peek * 1000;
  const peekRun = local.peek ? running(local.peek, PEEK + 600) : null;
  let anim = peekRun !== null;
  const paper = dk ? mix(pl.green, c.wash, 0.78) : mix(pl.green, c.card, 0.86);
  const ink = dk ? mix(pl.green, c.text, 0.75) : mix(pl.green, c.text, 0.7);
  const pencil = dk ? c.text : mix(c.text, c.secondaryText, 0.25);
  const red = pl.red;

  // The sheet, a little tilted, with its timing marks down the edge.
  g.save();
  g.translate(sw / 2 + 4, H / 2);
  g.rotate(-0.012);
  g.translate(-sw / 2, -H / 2);
  g.beginPath();
  g.roundRect(0, 0, sw, H, 6);
  g.fillStyle = paper;
  g.fill();
  g.fillStyle = mix(paper, ink, 0.12);
  for (let i = 0; i < n; i += 2) g.fillRect(0, TOPH + i * ROWH, sw, ROWH);
  g.fillStyle = dk ? c.text : c.text;
  for (let i = 0; i < n; i++) g.fillRect(sw - 7, TOPH + i * ROWH + 8, 5, 6);
  // Header.
  g.font = `700 10px ${t.type.family}`;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = ink;
  g.fillText(s.sheet.slice(0, 36), 8, 11);
  g.font = `600 10px ${t.type.family}`;
  for (let k = 0; k < 5; k++) {
    g.textAlign = "center";
    g.fillText(LET[k]!, bx + k * step, 23);
  }
  // Rows of bubbles.
  for (let i = 0; i < n; i++) {
    const y = TOPH + i * ROWH + ROWH / 2;
    g.textAlign = "right";
    g.font = `700 10px ${t.type.family}`;
    g.fillStyle = ink;
    g.fillText(String(i + 1), 18, y);
    // Key in pencil while peeking: one bubble at a time, then it erases.
    let keyFill = 0;
    if (peekRun !== null) {
      const fillAt = (i / n) * (PEEK * 0.55);
      keyFill = peekRun < fillAt ? 0 : peekRun < PEEK ? 1 : Math.max(0, 1 - (peekRun - PEEK) / 600);
    }
    for (let k = 0; k < 5; k++) {
      const x = bx + k * step;
      const pick = mine ? mine.picks[i] === k : local.picks[i] === k;
      const isKey = s.key[i] === k;
      g.beginPath();
      g.ellipse(x, y, 7.5, 6, 0, 0, Math.PI * 2);
      if (pick) {
        g.fillStyle = pencil;
        g.fill();
      } else if (isKey && keyFill > 0) {
        g.globalAlpha = keyFill;
        g.fillStyle = pencil;
        g.fill();
        g.globalAlpha = 1;
      } else {
        g.lineWidth = 1;
        g.strokeStyle = ink;
        g.stroke();
      }
      // Graded: red circles round the right answer when you missed it.
      if (mine && isKey && mine.picks[i] !== k) {
        g.beginPath();
        g.ellipse(x, y, 10, 8.5, 0, 0, Math.PI * 2);
        g.lineWidth = 2;
        g.strokeStyle = red;
        g.stroke();
      }
    }
    if (mine) {
      const ok = mine.picks[i] === s.key[i];
      const mx = bx + 4 * step + 18;
      g.lineWidth = 2.2;
      g.strokeStyle = red;
      g.lineCap = "round";
      g.beginPath();
      if (ok) {
        g.moveTo(mx - 4, y);
        g.lineTo(mx - 1, y + 4);
        g.lineTo(mx + 5, y - 5);
      } else {
        g.moveTo(mx - 4, y - 4);
        g.lineTo(mx + 4, y + 4);
        g.moveTo(mx + 4, y - 4);
        g.lineTo(mx - 4, y + 4);
      }
      g.stroke();
      g.lineCap = "butt";
    }
  }
  // The grade, circled in red pen at the top corner.
  if (mine) {
    const run = running(mine.at, 700);
    if (run !== null) anim = true;
    const k = run === null ? 1 : Math.min(1, run / 500);
    const gx = sw - 66;
    const gy = 13;
    g.save();
    g.translate(gx, gy);
    g.rotate(-0.18);
    g.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
    g.globalAlpha = k;
    g.beginPath();
    g.ellipse(0, 0, 26, 15, 0, 0, Math.PI * 2 * k);
    g.lineWidth = 2.2;
    g.strokeStyle = red;
    g.stroke();
    g.font = `800 15px ${t.type.family}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = red;
    g.fillText(`${mine.score}/${n}`, 0, 1);
    g.restore();
  }
  g.restore();
  // A pencil lying by the sheet.
  g.save();
  g.translate(sw + 17, H - 34);
  g.rotate(0.12);
  g.fillStyle = pl.yellow;
  g.fillRect(-4, -40, 8, 52);
  g.fillStyle = pl.red;
  g.fillRect(-4, -48, 8, 8);
  g.beginPath();
  g.moveTo(-4, 12);
  g.lineTo(4, 12);
  g.lineTo(0, 22);
  g.closePath();
  g.fillStyle = pl.cream;
  g.fill();
  g.restore();
  // Keep the clock ticking so a peek always starts from the real time.
  return anim || true;
}

export default defineApp<State, Action, Local>({
  name: "Scantron sprint",
  summary: (s) => {
    const best = [...s.papers].sort((a, b) => b.score - a.score)[0];
    return `${s.title}: ${s.papers.length} turned in${best ? ` · top score ${first(best.name)} ${best.score}/${s.key.length}` : ""}`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    const u = m.user;
    if (!inChat(ctx, u) || a.t !== "turnin") return s;
    if (!Array.isArray(a.picks) || a.picks.length !== s.key.length || !a.picks.every((p) => isInt(p, -1, 4))) return s;
    if (s.papers.some((p) => p.who === u)) return s;
    const name = clean(ctx.members.find((x) => x.id === u)?.name, 20) || "Friend";
    return { ...s, papers: [...s.papers, { who: u, name, score: grade(s.key, a.picks), picks: [...a.picks], said: "", at: m.time }] };
  },

  onMembers: (s, ctx) => {
    const gone = (u: string) => !u.startsWith("~") && !inChat(ctx, u);
    return s.papers.some((p) => gone(p.who)) ? { ...s, papers: s.papers.filter((p) => !gone(p.who)) } : s;
  },

  invariants: {
    "one paper per person": (s) => new Set(s.papers.map((p) => p.who)).size === s.papers.length,
    "turned-in papers are graded against the key": (s) => s.papers.every((p) => (p.picks.length ? p.picks.length === s.key.length && p.score === grade(s.key, p.picks) : isInt(p.score, 0, s.key.length))),
    "the key is a real answer for every question": (s) => s.key.length >= 5 && s.key.every((k) => isInt(k, 0, 4)),
    "live papers come from the chat": (s, ctx) => s.papers.every((p) => p.who.startsWith("~") || inChat(ctx, p.who)),
  },

  transitions: {
    "turning in adds only your graded paper": (p, n, a, m) => {
      if (a.t !== "turnin" || p === n) return true;
      const mine = n.papers.at(-1)!;
      return n.papers.length === p.papers.length + 1 && mine.who === m.user && mine.at === m.time && mine.picks.join() === a.picks.join() && !p.papers.some((x) => x.who === m.user);
    },
    "the key never changes": (p, n) => n.key.join() === p.key.join(),
    "papers stay as they were handed back": (p, n) => p.papers.every((x) => !n.papers.some((y) => y.who === x.who) || n.papers.some((y) => y.who === x.who && y.score === x.score && y.picks.join() === x.picks.join())),
    "only the chat plays": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => ({ t: "turnin", picks: s.key.map((k) => (r.next() < 0.5 ? k : r.int(5) - (r.next() < 0.1 ? 1 : 0))) }),

  local: { peek: 0, picks: [], toast: 0 },

  view: ({ state: s, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const n = s.key.length;
    const H = sheetH(n);
    const { sw, bx, step } = geom(W);
    const mine = s.papers.find((p) => p.who === me && p.picks.length);
    const PEEK = s.peek * 1000;
    const peeking = local.peek ? running(local.peek, PEEK) !== null : false;
    const peeked = local.peek > 0;
    const filled = local.picks.filter((p) => isInt(p, 0, 4)).length;
    const board = [...s.papers].sort((a, b) => b.score - a.score || a.at - b.at);
    const quote = s.papers.find((p) => p.said);
    const label = mine ? `Your graded sheet: ${mine.score} of ${n} right` : peeking ? "The answer key is showing" : `A blank bubble sheet, ${n} questions`;
    const tap = (x: number, y: number) => {
      if (mine || peeking || !peeked) return;
      const i = Math.floor((y - TOPH) / ROWH);
      const k = Math.round((x - 4 - bx) / step);
      if (i < 0 || i >= n || k < 0 || k > 4 || Math.abs(x - 4 - (bx + k * step)) > step / 2) return;
      haptic("light");
      const picks = Array.from({ length: n }, (_, j) => (isInt(local.picks[j], 0, 4) ? local.picks[j]! : -1));
      picks[i] = picks[i] === k ? -1 : k;
      setLocal({ picks });
    };

    return (
      <div>
        <CardHeader title={s.title} subtitle={`${s.papers.length} turned in · everyone gets the same key`} />
        <div style={{ position: "relative", height: H, display: "flex" }}>
          <div style={{ position: "relative", width: sw + 30, height: H, flexShrink: 0 }}>
            <Canvas height={H} label={label} draw={(g, f) => drawSheet(g, f, s, me, local, { sw, bx, step })} onPointer={(e) => e.type === "up" && tap(e.x, e.y)} />
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingLeft: 8, display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" }}>
            <div style={{ fontSize: 11, lineHeight: "14px", fontWeight: 700, color: c.secondaryText, ...ell }}>Handed back</div>
            {board.slice(0, Math.floor((H - 18) / 26)).map((p) => (
              <div key={p.who} style={{ display: "flex", alignItems: "center", gap: 6, height: 22, minWidth: 0 }}>
                <span style={{ display: "flex", borderRadius: 99, boxShadow: p.who === me ? `0 0 0 2px ${c.primary}` : "none", flexShrink: 0 }}>
                  <Avatar user={{ id: p.who, name: p.name }} size={20} />
                </span>
                <span style={{ fontSize: 13, lineHeight: "16px", fontWeight: 700, color: c.text, flexShrink: 0 }}>{`${p.score}/${n}`}</span>
                <span style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>{p.who === me ? "you" : first(p.name)}</span>
              </div>
            ))}
            {board.length === 0 ? <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>Nobody yet. Set the bar.</div> : null}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32, marginTop: 4, minWidth: 0 }}>
          {mine ? (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{`You got ${mine.score} of ${n} · ${["1st", "2nd", "3rd"][board.findIndex((p) => p.who === me)] ?? `${board.findIndex((p) => p.who === me) + 1}th`} of ${board.length} in the chat`}</span>
          ) : peeking ? (
            <span style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, color: c.text, ...ell }}>Memorize it. It erases in a moment</span>
          ) : peeked ? (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{`Fill in what you remember · ${filled} of ${n}`}</span>
          ) : quote ? (
            <>
              <b style={{ fontSize: 13, lineHeight: "16px", color: c.text, flexShrink: 0 }}>{first(quote.name)}</b>
              <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ell }}>{`“${quote.said}”`}</span>
            </>
          ) : (
            <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>{`Peek at the key for ${s.peek} seconds, then fill it from memory`}</span>
          )}
        </div>
        {mine ? null : (
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {peeked ? (
              <Button
                kind="primary"
                wide
                disabled={peeking}
                onClick={() => {
                  haptic("success");
                  setLocal({ toast: local.toast + 1 });
                  dispatch({ t: "turnin", picks: Array.from({ length: n }, (_, j) => (isInt(local.picks[j], 0, 4) ? local.picks[j]! : -1)) });
                }}
              >
                Turn it in
              </Button>
            ) : (
              <Button kind="primary" wide onClick={() => { haptic("light"); setLocal({ peek: clock.value, picks: [] }); }}>
                Peek at the key
              </Button>
            )}
          </div>
        )}
        {local.toast > 0 ? <Toast key={local.toast}>Graded in red pen</Toast> : null}
      </div>
    );
  },
});
