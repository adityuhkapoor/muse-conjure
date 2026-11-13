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
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// Lanes score: the classic bowling sheet, drawn the old way, frames and little boxes. Each person
// taps the pins they knocked down on their own deck and rolls; strikes send a ball rolling across
// their row. Totals run live, and whoever's last after the tenth pays for shoes.

type Params = {
  /** Card title: "Midtown Lanes" */
  title: string;
  /** Under the title: "lane 7 · Thursday" */
  sub: string;
  /** What the last place pays for: "shoes" */
  stakes: string;
  /** Bowlers, with pins knocked per roll so far (bowling order: 10 is a strike; a frame's two rolls add to 10 or less). */
  players: { name: string; rolls: number[]; said?: string }[];
};

// @params
const P: Params = {
  title: "Midtown Lanes",
  sub: "lane 7 · Thursday",
  stakes: "shoes",
  players: [
    { name: "Will", rolls: [10, 7, 3, 9, 0, 10, 8, 1], said: "bowling in the sube's honor" },
    { name: "Maya", rolls: [9, 1, 8, 1, 10, 7, 2, 9, 1] },
    { name: "Tsai Lin", rolls: [10, 10, 6, 2, 7, 3] },
    { name: "Arun", rolls: [6, 3, 10, 4, 5, 8, 1] },
    { name: "Calvin", rolls: [3, 4, 0, 0, 5, 2, 1, 6], said: "the gutter has a vendetta" },
    { name: "Aditya", rolls: [8, 1, 7, 2, 9, 0] },
  ],
};
// @end params

type Bowler = { who: string; name: string; rolls: number[]; said: string; at: number };
type State = { title: string; sub: string; stakes: string; bowlers: Bowler[] };
type Action = { t: "roll"; pins: number } | { t: "undo" } | { t: "join" };
type Local = { down: number; toast: number; msg: string };
type Frame = { marks: string[]; score: number | null };

const ALL = 1023;
const KNOCK_ORDER = [0, 1, 2, 4, 3, 5, 7, 8, 6, 9];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const pop = (m: number) => {
  let n = 0;
  for (let k = 0; k < 10; k++) if (m & (1 << k)) n++;
  return n;
};

/** Where a sequence of rolls stands: frame, roll in frame, pins standing, finished. */
function where(rolls: number[]): { frame: number; ball: number; standing: number; done: boolean } {
  let frame = 0;
  let ball = 0;
  let standing = ALL;
  let first10 = 0;
  let second10 = 0;
  for (const r of rolls) {
    const n = pop(r);
    if (frame < 9) {
      if (ball === 0 && n === 10) {
        frame++;
        standing = ALL;
      } else if (ball === 0) {
        ball = 1;
        standing &= ~r;
      } else {
        frame++;
        ball = 0;
        standing = ALL;
      }
      continue;
    }
    // tenth frame
    if (ball === 0) {
      first10 = n;
      ball = 1;
      standing = n === 10 ? ALL : standing & ~r;
    } else if (ball === 1) {
      second10 = n;
      ball = 2;
      if (first10 === 10) standing = n === 10 ? ALL : standing & ~r;
      else if (first10 + n === 10) standing = ALL;
      else return { frame: 10, ball: 0, standing: 0, done: true };
    } else return { frame: 10, ball: 0, standing: 0, done: true };
  }
  if (frame === 9 && ball === 2 && first10 !== 10 && first10 + second10 < 10) return { frame: 10, ball: 0, standing: 0, done: true };
  return { frame, ball, standing, done: false };
}
const canRoll = (rolls: number[], mask: number) => {
  const w = where(rolls);
  return !w.done && Number.isInteger(mask) && mask >= 0 && mask <= ALL && (mask & ~w.standing) === 0;
};
/** Marks for each frame box and running totals (null until a frame can be scored). */
function sheet(rolls: number[]): { frames: Frame[]; total: number } {
  const ns = rolls.map(pop);
  const frames: Frame[] = [];
  let i = 0;
  let total = 0;
  for (let f = 0; f < 10; f++) {
    const a = ns[i];
    if (a === undefined) {
      frames.push({ marks: [], score: null });
      continue;
    }
    if (f < 9) {
      if (a === 10) {
        const ok = ns[i + 1] !== undefined && ns[i + 2] !== undefined;
        total += ok ? 10 + ns[i + 1]! + ns[i + 2]! : 0;
        frames.push({ marks: ["", "X"], score: ok ? total : null });
        i += 1;
        continue;
      }
      const b = ns[i + 1];
      if (b === undefined) {
        frames.push({ marks: [a ? String(a) : "-"], score: null });
        i += 1;
        continue;
      }
      const spare = a + b === 10;
      const ok = !spare || ns[i + 2] !== undefined;
      total += ok ? a + b + (spare ? ns[i + 2]! : 0) : 0;
      frames.push({ marks: [a ? String(a) : "-", spare ? "/" : b ? String(b) : "-"], score: ok ? total : null });
      i += 2;
      continue;
    }
    // tenth
    const rest = ns.slice(i, i + 3);
    const marks: string[] = [];
    rest.forEach((n, k) => {
      const prev = rest[k - 1];
      const fresh = k === 0 || prev === 10 || (k === 2 && rest[0]! + rest[1]! === 10 && rest[0] !== 10);
      marks.push(n === 10 && fresh ? "X" : !fresh && prev !== undefined && prev + n === 10 ? "/" : n ? String(n) : "-");
    });
    const w = where(rolls);
    if (w.done) total += rest.reduce((x, y) => x + y, 0);
    frames.push({ marks, score: w.done ? total : null });
  }
  return { frames, total };
}
/** Pins so far, counting open frames as they stand (for live standings). */
const live = (rolls: number[]) => {
  const s = sheet(rolls);
  const last = [...s.frames].reverse().find((f) => f.score !== null)?.score ?? 0;
  return Math.max(last, s.total);
};
function maskOf(n: number, standing: number): number {
  let m = 0;
  let k = 0;
  for (const p of KNOCK_ORDER) {
    if (k >= n) break;
    if (standing & (1 << p)) {
      m |= 1 << p;
      k++;
    }
  }
  return m;
}

function initState(ctx: Ctx): State {
  const bowlers: Bowler[] = [];
  for (const p of Array.isArray(P.players) ? P.players : []) {
    const name = clean(p?.name, 20);
    if (!name || bowlers.length >= 8) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (bowlers.some((b) => b.who === who)) continue;
    const rolls: number[] = [];
    for (const n of Array.isArray(p.rolls) ? p.rolls : []) {
      const w = where(rolls);
      if (w.done || typeof n !== "number") break;
      const mask = maskOf(Math.max(0, Math.min(pop(w.standing), Math.round(n))), w.standing);
      rolls.push(mask);
    }
    bowlers.push({ who, name, rolls, said: clean(p.said, 50), at: 0 });
  }
  return { title: clean(P.title, 40) || "Bowling", sub: clean(P.sub, 50), stakes: clean(P.stakes, 24), bowlers };
}

// Pin positions in a deck, as fractions: row 4 at the back.
const PINS: [number, number][] = [
  [0.5, 0.88],
  [0.38, 0.64],
  [0.62, 0.64],
  [0.26, 0.4],
  [0.5, 0.4],
  [0.74, 0.4],
  [0.14, 0.16],
  [0.38, 0.16],
  [0.62, 0.16],
  [0.86, 0.16],
];

export default defineApp<State, Action, Local>({
  name: "Lanes score",
  summary: (s) => {
    const r = [...s.bowlers].sort((a, b) => live(b.rolls) - live(a.rolls));
    const done = s.bowlers.length > 0 && s.bowlers.every((b) => where(b.rolls).done);
    if (!r.length) return `${s.title}: nobody's bowling yet`;
    return done ? `${s.title}: ${first(r[0]!.name)} wins, ${first(r[r.length - 1]!.name)} pays for ${s.stakes || "shoes"}` : `${s.title}: ${first(r[0]!.name)} leads with ${live(r[0]!.rolls)}`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const me = s.bowlers.find((b) => b.who === m.user);
    if (a.t === "join") {
      if (me || s.bowlers.length >= 8) return s;
      const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
      return { ...s, bowlers: [...s.bowlers, { who: m.user, name, rolls: [], said: "", at: m.time }] };
    }
    if (!me) return s;
    if (a.t === "roll") {
      if (typeof a.pins !== "number" || !canRoll(me.rolls, a.pins)) return s;
      return { ...s, bowlers: s.bowlers.map((b) => (b === me ? { ...b, rolls: [...b.rolls, a.pins], at: m.time } : b)) };
    }
    if (a.t === "undo") {
      if (!me.rolls.length) return s;
      return { ...s, bowlers: s.bowlers.map((b) => (b === me ? { ...b, rolls: b.rolls.slice(0, -1), at: m.time } : b)) };
    }
    return s;
  },

  invariants: {
    "every roll knocks standing pins": (s) => s.bowlers.every((b) => b.rolls.every((r, i) => canRoll(b.rolls.slice(0, i), r))),
    "one row per bowler": (s) => new Set(s.bowlers.map((b) => b.who)).size === s.bowlers.length && s.bowlers.length <= 8,
    "scores stay in range": (s) => s.bowlers.every((b) => sheet(b.rolls).total >= 0 && sheet(b.rolls).total <= 300),
  },

  transitions: {
    "you only roll on your row": (p, n, a, m) => a.t === "join" || n.bowlers.every((b) => b.who === m.user || p.bowlers.some((x) => x.who === b.who && x.rolls.length === b.rolls.length)),
    "a roll adds exactly those pins": (p, n, a, m) => {
      if (a.t !== "roll" || p === n) return true;
      const was = p.bowlers.find((b) => b.who === m.user)!;
      const now = n.bowlers.find((b) => b.who === m.user)!;
      return now.rolls.length === was.rolls.length + 1 && now.rolls[now.rolls.length - 1] === a.pins && now.at === m.time;
    },
    "undo takes back one roll": (p, n, a, m) => {
      if (a.t !== "undo" || p === n) return true;
      const was = p.bowlers.find((b) => b.who === m.user)!;
      const now = n.bowlers.find((b) => b.who === m.user)!;
      return now.rolls.length === was.rolls.length - 1 && now.rolls.every((r, i) => r === was.rolls[i]);
    },
    "joining adds you with a fresh sheet": (p, n, a, m, ctx) =>
      a.t !== "join" || p === n || (n.bowlers.length === p.bowlers.length + 1 && n.bowlers[n.bowlers.length - 1]!.who === m.user && n.bowlers[n.bowlers.length - 1]!.rolls.length === 0 && n.bowlers[n.bowlers.length - 1]!.name === (clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend")),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const me = s.bowlers.find((b) => b.who === user);
    if (!me) return { t: "join" };
    if (r.next() < 0.1) return { t: "undo" };
    const w = where(me.rolls);
    let mask = 0;
    for (let k = 0; k < 10; k++) if (w.standing & (1 << k) && r.next() < 0.6) mask |= 1 << k;
    return { t: "roll", pins: r.next() < 0.05 ? ALL : mask };
  },

  local: { down: 0, toast: 0, msg: "" },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dk = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const nameOf = (b: Bowler) => members.find((m) => m.id === b.who)?.name ?? b.name;
    const mine = s.bowlers.find((b) => b.who === me) ?? null;
    const w = mine ? where(mine.rolls) : null;
    const down = w ? local.down & w.standing : 0;
    const allDone = s.bowlers.length > 0 && s.bowlers.every((b) => where(b.rolls).done);
    const ranked = [...s.bowlers].sort((a, b) => live(b.rolls) - live(a.rolls));
    const last = ranked[ranked.length - 1];
    const rows = Math.max(1, s.bowlers.length);
    const RH = rows > 6 ? 24 : 28;
    const HEAD = 14;
    const SH = HEAD + rows * RH + 2;
    const NAME = 30;
    const TOT = 34;
    const FW = (W - NAME - TOT - 10) / 10.4;
    const fx = (f: number) => NAME + f * FW;
    const newest = s.bowlers.reduce((x, b) => Math.max(x, b.at), 0);

    const drawSheet = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const paper = dk ? mix(c.card, c.text, 0.06) : mix(pl.cream, c.card, 0.6);
      const ink = mix(c.text, paper, 0.25);
      g.fillStyle = paper;
      g.beginPath();
      g.roundRect(0, 0, W, SH, 8);
      g.fill();
      g.font = `600 10px ${theme.type.family}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = c.text;
      for (let k = 0; k < 10; k++) g.fillText(String(k + 1), fx(k) + (k === 9 ? FW * 0.7 : FW / 2), HEAD / 2 + 1);
      g.fillText("tot", W - TOT / 2 - 2, HEAD / 2 + 1);
      g.strokeStyle = ink;
      g.lineWidth = 1;
      g.beginPath();
      for (let r = 0; r <= rows; r++) {
        g.moveTo(NAME, HEAD + r * RH);
        g.lineTo(W - 2, HEAD + r * RH);
      }
      for (let k = 0; k <= 10; k++) {
        const x = k === 10 ? fx(9) + FW * 1.4 : fx(k);
        g.moveTo(x, HEAD);
        g.lineTo(x, HEAD + rows * RH);
      }
      g.moveTo(W - 2, HEAD);
      g.lineTo(W - 2, HEAD + rows * RH);
      // the little boxes in each frame's corner
      const bx = Math.min(11, FW / 2.2);
      for (let r = 0; r < rows; r++) {
        const y = HEAD + r * RH;
        for (let k = 0; k < 10; k++) {
          const right = k === 9 ? fx(9) + FW * 1.4 : fx(k + 1);
          const nb = k === 9 ? 3 : 2;
          for (let b = 1; b < nb; b++) {
            g.moveTo(right - b * bx, y);
            g.lineTo(right - b * bx, y + bx);
          }
          g.moveTo(right - (nb - 1) * bx, y + bx);
          g.lineTo(right, y + bx);
        }
      }
      g.stroke();
      // marks and totals
      let rolling = false;
      s.bowlers.forEach((b, r) => {
        const y = HEAD + r * RH;
        const sh = sheet(b.rolls);
        const col = userColor(b.who, theme);
        sh.frames.forEach((fr, k) => {
          const right = k === 9 ? fx(9) + FW * 1.4 : fx(k + 1);
          const nb = k === 9 ? 3 : 2;
          fr.marks.forEach((mk, j) => {
            if (!mk) return;
            const x = k === 9 ? right - (3 - j) * bx + bx / 2 : fr.marks.length === 1 ? right - 2 * bx + bx / 2 : right - (2 - j) * bx + bx / 2;
            g.font = `700 ${mk === "X" || mk === "/" ? 10 : 9.5}px ${theme.type.family}`;
            g.fillStyle = mk === "X" || mk === "/" ? col : c.text;
            g.fillText(mk, x, y + bx / 2 + 0.5);
          });
          if (fr.score !== null) {
            g.font = `600 10px ${theme.type.family}`;
            g.fillStyle = c.text;
            g.fillText(String(fr.score), fx(k) + (k === 9 ? FW * 0.7 : FW / 2), y + bx + (RH - bx) / 2 + 0.5);
          }
        });
        const tot = fitText(String(live(b.rolls)), TOT - 4, { g, size: 13, min: 10, weight: 700 });
        g.font = tot.font;
        g.fillStyle = c.text;
        g.fillText(tot.text, W - TOT / 2 - 1, y + RH / 2 + 0.5);
        // a strike rolls a ball across the row
        const lastRoll = b.rolls[b.rolls.length - 1];
        const t = b.at && b.at === newest && lastRoll !== undefined && pop(lastRoll) === 10 ? running(b.at, 1100) : null;
        if (t !== null) {
          rolling = true;
          const wf = where(b.rolls.slice(0, -1)).frame;
          const p = Math.min(1, t / 900);
          const x = NAME + p * (fx(Math.min(9, wf)) + FW / 2 - NAME);
          g.fillStyle = col;
          g.beginPath();
          g.arc(x, y + RH / 2, RH / 2 - 5, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = paper;
          g.beginPath();
          g.arc(x + 2 * Math.cos(f.now / 60), y + RH / 2 - 3 + 2 * Math.sin(f.now / 60), 1.6, 0, Math.PI * 2);
          g.fill();
        }
      });
      return rolling;
    };

    const deckW = 118;
    const deckH = 96;
    const drawDeck = (g: CanvasRenderingContext2D) => {
      g.fillStyle = dk ? mix(pl.crust, c.card, 0.6) : mix(pl.crust, c.card, 0.45);
      g.beginPath();
      g.roundRect(0, 0, deckW, deckH, 10);
      g.fill();
      PINS.forEach(([px, py], k) => {
        const x = px * deckW;
        const y = py * (deckH - 8) + 4;
        const standing = w ? (w.standing & (1 << k)) !== 0 : true;
        const knocked = (down & (1 << k)) !== 0;
        if (!standing) {
          g.strokeStyle = mix(c.text, c.card, 0.6);
          g.setLineDash([2, 2]);
          g.lineWidth = 1;
          g.beginPath();
          g.arc(x, y, 8, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
          return;
        }
        g.fillStyle = knocked ? mix(c.text, c.card, 0.75) : pl.paper;
        g.beginPath();
        g.arc(x, y, 9, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = knocked ? c.secondaryText : pl.red;
        g.lineWidth = 2;
        g.beginPath();
        if (knocked) {
          g.moveTo(x - 4, y - 4);
          g.lineTo(x + 4, y + 4);
          g.moveTo(x + 4, y - 4);
          g.lineTo(x - 4, y + 4);
        } else g.arc(x, y, 5, 0, Math.PI * 2);
        g.stroke();
      });
    };
    const onDeck = (e: { type: string; x: number; y: number }) => {
      if (e.type !== "down" || !w || w.done) return;
      const k = PINS.findIndex(([px, py]) => Math.hypot(e.x - px * deckW, e.y - (py * (deckH - 8) + 4)) < 15);
      if (k < 0 || !(w.standing & (1 << k))) return;
      haptic("light");
      setLocal({ down: down ^ (1 << k) });
    };

    const n = pop(down);
    const standingN = w ? pop(w.standing) : 0;
    const said = s.bowlers.find((b) => b.said);
    const rollLabel = n === standingN && standingN > 0 ? (standingN === 10 ? "Strike" : "Spare") : n === 0 ? "Gutter ball" : `Roll ${n}`;

    return (
      <div>
        <CardHeader title={s.title} subtitle={`${s.sub}${s.stakes ? ` · last pays for ${s.stakes}` : ""}`} />
        <div style={{ position: "relative", height: SH }}>
          <Canvas height={SH} label={`Bowling sheet: ${ranked.map((b) => `${b.name} ${live(b.rolls)}`).join(", ") || "no bowlers"}`} draw={drawSheet} />
          {s.bowlers.map((b, r) => (
            <div key={b.who} style={{ position: "absolute", left: 2, top: HEAD + r * RH + (RH - 22) / 2, display: "flex", pointerEvents: "none" }}>
              <Avatar user={{ id: b.who, name: nameOf(b) } as Member} size={22} />
            </div>
          ))}
          {!s.bowlers.length ? <div style={{ position: "absolute", left: NAME + 8, top: HEAD + 6, fontSize: 13, color: c.secondaryText }}>No bowlers yet</div> : null}
        </div>
        {mine && w && !w.done ? (
          <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "stretch" }}>
            <div style={{ width: deckW, flex: "none" }}>
              <Canvas height={deckH} label={`Your pins: ${standingN} standing, ${n} tapped down`} draw={drawDeck} onPointer={onDeck} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>
                <div style={{ color: c.text, fontWeight: 600, ...ell }}>{`Frame ${w.frame + 1} · ball ${w.ball + 1}`}</div>
                <div style={ell}>{n ? `${n} down · tap pins you hit` : "Tap the pins you knocked down"}</div>
                <div style={ell}>{said ? `${first(nameOf(said))}: “${said.said}”` : `${standingN} standing`}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {mine.rolls.length ? (
                  <Button kind="secondary" onClick={() => dispatch({ t: "undo" })}>
                    Undo
                  </Button>
                ) : null}
                <Button
                  kind="primary"
                  wide
                  onClick={() => {
                    haptic(n === standingN ? "success" : "light");
                    dispatch({ t: "roll", pins: down });
                    setLocal({ down: 0, toast: local.toast + 1, msg: n === 10 ? "Strike" : n === standingN && n ? "Spare" : `${n} on the sheet` });
                  }}
                >
                  {rollLabel}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: c.text, ...ell }}>
              {allDone && last ? `${first(nameOf(ranked[0]!))} wins · ${first(nameOf(last))} pays for ${s.stakes || "shoes"}` : mine ? "Your ten are in · waiting on the lane" : ranked[0] ? `${first(nameOf(ranked[0]))} leads with ${live(ranked[0].rolls)}` : "Start the sheet"}
            </span>
            {!mine ? (
              <Button kind="primary" onClick={() => dispatch({ t: "join" })}>
                Add me
              </Button>
            ) : null}
          </div>
        )}
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
