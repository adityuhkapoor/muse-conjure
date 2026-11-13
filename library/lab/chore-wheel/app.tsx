import {
  defineApp,
  Avatar,
  Canvas,
  CardHeader,
  Facepile,
  Locked,
  More,
  Toast,
  fitText,
  haptic,
  mix,
  rng,
  running,
  tween,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// "Who's doing dishes this week": a wheel whose slices are sized by how many fights each chore
// caused. Each roommate spins once; the pointer flaps over the pegs and the wheel can only land
// on a chore nobody (or the fewest people) has yet.

type Params = {
  /** Card title: "Chore wheel" */
  title: string;
  /** The place, shown under the title: "Apt 4B" */
  sub: string;
  /** House rule shown on the result card: "Swaps allowed till Sun 8 PM" */
  rule: string;
  /** 2 to 8 chores. fights: how many fights it caused (1 to 20). note: shown on the result card. */
  chores: { label: string; fights: number; note: string }[];
  /** Who already spun this week: { name: "Dev", chore: "Dishes" } */
  spun: { name: string; chore: string }[];
};

// @params
const P: Params = {
  title: "Chore wheel",
  sub: "Apt 4B",
  rule: "Swaps allowed till Sun 8 PM",
  chores: [
    { label: "Dishes", fights: 7, note: "Pans clause: nothing soaks overnight" },
    { label: "Trash", fights: 4, note: "" },
    { label: "Bathroom", fights: 3, note: "" },
    { label: "Vacuum", fights: 1, note: "" },
  ],
  spun: [ { name: "Dev", chore: "Dishes" }, { name: "Noa", chore: "Trash" }, { name: "Theo", chore: "Vacuum" } ],
};
// @end params

type Chore = { id: string; label: string; fights: number; note: string };
type Spin = { by: string; chore: string; at: number; from: number; to: number };
type State = {
  title: string;
  sub: string;
  rule: string;
  chores: Chore[];
  who: Record<string, string>;
  done: string[];
  rot: number;
  spin: Spin | null;
  spins: number;
  week: number;
};
type Action = { t: "spin" } | { t: "done" } | { t: "reset" };
type Local = { mine: number };

const TAU = 2 * Math.PI;
const SPIN_MS = 4200;
const PULSE_MS = 3000;
const ease = tween({ duration: SPIN_MS, easing: [0.33, 1, 0.68, 1] });
const rise = tween({ duration: 500, easing: [0.34, 1.56, 0.64, 1] });
const DEFAULTS = ["Dishes", "Trash", "Bathroom", "Vacuum"];

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const holders = (s: State, c: string) => Object.keys(s.who).filter((u) => s.who[u] === c);
const total = (cs: Chore[]) => cs.reduce((a, c) => a + c.fights, 0);
const cumBefore = (cs: Chore[], i: number) => cs.slice(0, i).reduce((a, c) => a + c.fights, 0);
const sliceAt = (cs: Chore[], rot: number) => {
  const a = ((((-rot) % 1) + 1) % 1) * total(cs);
  for (let i = 0; i < cs.length; i++) if (a < cumBefore(cs, i) + cs[i]!.fights) return cs[i]!.id;
  return cs[cs.length - 1]!.id;
};
const allDone = (s: State, ctx: Ctx) => ctx.members.length > 0 && ctx.members.every((m) => s.who[m.id] !== undefined && s.done.includes(m.id));
const pickWith = (s: State, seed: number, from: number) => {
  const counts = s.chores.map((c) => holders(s, c.id).length);
  const lo = Math.min(...counts);
  const open = s.chores.filter((_, i) => counts[i] === lo);
  const g = rng(seed);
  const x = g.next() * open.reduce((a, c) => a + c.fights, 0);
  let run = 0;
  let chosen = open[open.length - 1]!;
  for (const c of open) {
    run += c.fights;
    if (x < run) {
      chosen = c;
      break;
    }
  }
  const off = 0.15 + 0.7 * g.next();
  const k = 4 + g.int(2);
  const i = s.chores.indexOf(chosen);
  const land = (cumBefore(s.chores, i) + off * chosen.fights) / total(s.chores);
  const rot = (((1 - land) % 1) + 1) % 1;
  const to = from + k + ((((rot - from) % 1) + 1) % 1);
  return { chore: chosen.id, rot, to };
};

const nameOf = (members: readonly Member[], id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
const first = (name: string) => name.split(" ")[0] ?? name;
const lower = (s: string) => s.toLowerCase();
const listNames = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const fightsText = (n: number) => `${n} ${n === 1 ? "fight" : "fights"}`;
const ellipsis = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

function initState(ctx: Ctx): State {
  const chores: Chore[] = [];
  for (const raw of P.chores) {
    if (chores.length >= 8) break;
    const label = clean(raw.label, 16);
    if (!label) continue;
    const f = Number.isInteger(raw.fights) ? Math.min(20, Math.max(1, raw.fights)) : 1;
    chores.push({ id: `c${chores.length}`, label, fights: f, note: clean(raw.note, 40) });
  }
  const list: Chore[] = chores.length >= 2 ? chores : DEFAULTS.map((label, i) => ({ id: `c${i}`, label, fights: 1, note: "" }));
  const who: Record<string, string> = {};
  for (const sp of P.spun) {
    const name = clean(sp.name, 40).toLowerCase();
    const m = ctx.members.find((x) => x.id === sp.name || x.name.toLowerCase() === name);
    const c = list.find((x) => x.label.toLowerCase() === clean(sp.chore, 16).toLowerCase());
    if (!m || !c || who[m.id] !== undefined) continue;
    who[m.id] = c.id;
  }
  return { title: clean(P.title, 30) || "Chore wheel", sub: clean(P.sub, 24), rule: clean(P.rule, 40), chores: list, who, done: [], rot: 0, spin: null, spins: 0, week: 1 };
}

function drawWheel(g: CanvasRenderingContext2D, f: DrawFrame, s: State, members: readonly Member[], waiting: boolean) {
  const t = f.theme;
  const c = t.color;
  const cx = f.width / 2;
  const cy = 138;
  const r = 112;
  const dark = t.mode === "light" ? c.text : c.wash;
  const series = [c.series1, c.series2, c.series3, c.series4, c.series5, c.series6];
  const sp = s.spin;
  const e = sp ? f.now - sp.at : -1;
  const posAt = (time: number) => {
    if (waiting) return s.rot + time / 1400;
    if (sp) {
      const el = time - sp.at;
      if (el < SPIN_MS) return sp.from + (sp.to - sp.from) * ease(Math.max(0, el));
    }
    return s.rot;
  };
  const pos = posAt(f.now);
  const moving = waiting || (sp !== null && e < SPIN_MS);
  const pulsing = sp !== null && e >= SPIN_MS && e < SPIN_MS + PULSE_MS;

  let flap = 0;
  if (moving) {
    const q = pos * 24;
    const v = (q - posAt(f.now - 16) * 24) / 0.016;
    flap = v > 0 ? Math.max(0, 1 - 6 * ((q % 1) / v)) : 0;
  }

  g.globalAlpha = 1;
  g.beginPath();
  g.arc(cx, cy, r + 14, 0, TAU);
  g.fillStyle = c.wash;
  g.fill();

  const sum = total(s.chores);
  let a0 = -Math.PI / 2 + pos * TAU;
  s.chores.forEach((ch, i) => {
    const sweep = (ch.fights / sum) * TAU;
    const mid = a0 + sweep / 2;
    let fill = series[i % 6]!;
    if (i >= 6) fill = mix(fill, c.card, 0.35);
    if (pulsing && sp && sp.chore === ch.id) fill = mix(fill, c.card, 0.18 + 0.12 * Math.sin(6 * ((e - SPIN_MS) / 1000)));
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, a0, a0 + sweep);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 2;
    g.lineJoin = "round";
    g.strokeStyle = c.card;
    g.stroke();
    a0 += sweep;
  });

  // Labels and faces go on after every slice so no seam paints over them.
  a0 = -Math.PI / 2 + pos * TAU;
  s.chores.forEach((ch, i) => {
    const sweep = (ch.fights / sum) * TAU;
    const mid = a0 + sweep / 2;
    // Label: along the tangent as in the original; a sliver too narrow for its name reads outward.
    const ink = i % 6 === 0 && i < 6 ? c.onPrimary : dark;
    const size = Math.min(22, 14 + sweep * 4) * 0.8;
    const lr = sweep < 0.6 ? 0.7 * r : 0.6 * r;
    const tangent = fitText(ch.label, Math.min(r * 0.9, sweep * lr - 8), { g, size, min: 9, weight: 600 });
    g.fillStyle = ink;
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (tangent.text === ch.label) {
      g.save();
      g.translate(cx + Math.cos(mid) * lr, cy + Math.sin(mid) * lr);
      g.rotate(mid + Math.PI / 2);
      g.font = tangent.font;
      g.fillText(tangent.text, 0, 0);
      g.restore();
      if (sweep > 0.9) {
        const sr = lr - size - 2;
        g.save();
        g.translate(cx + Math.cos(mid) * sr, cy + Math.sin(mid) * sr);
        g.rotate(mid + Math.PI / 2);
        g.font = `400 11px ${t.type.family}`;
        g.fillText(fightsText(ch.fights), 0, 0);
        g.restore();
      }
    } else {
      const rr = 61;
      const radial = fitText(ch.label, 42, { g, size: Math.min(size, Math.max(9, sweep * rr - 4)), min: 9, weight: 600 });
      if (radial.text !== "…" && radial.text !== "") {
        g.save();
        g.translate(cx + Math.cos(mid) * rr, cy + Math.sin(mid) * rr);
        g.rotate(Math.cos(mid) < 0 ? mid + Math.PI : mid);
        g.font = radial.font;
        g.fillText(radial.text, 0, 0);
        g.restore();
      }
    }

    // The people who hold this chore sit on its slice, so the faces are in the picture.
    const hs = holders(s, ch.id);
    const shown = Math.min(2, hs.length);
    for (let k = 0; k < shown; k++) {
      const ang = mid + (k - (shown - 1) / 2) * 0.22;
      const fx = cx + Math.cos(ang) * (r - 18);
      const fy = cy + Math.sin(ang) * (r - 18);
      const more = k === 1 && hs.length > 2;
      g.beginPath();
      g.arc(fx, fy, 10, 0, TAU);
      g.fillStyle = more ? c.secondaryButton : userColor(hs[k]!, t);
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = c.card;
      g.stroke();
      g.fillStyle = more ? c.secondaryButtonText : c.onPrimary;
      g.font = `600 ${more ? 10 : 11}px ${t.type.family}`;
      g.fillText(more ? `+${hs.length - 1}` : (nameOf(members, hs[k]!)[0] ?? "?").toUpperCase(), fx, fy + 0.5);
    }
    a0 += sweep;
  });

  // Pegs around the track.
  g.beginPath();
  for (let k = 0; k < 24; k++) {
    const a = -Math.PI / 2 + pos * TAU + (k * TAU) / 24;
    const px = cx + Math.cos(a) * (r + 7);
    const py = cy + Math.sin(a) * (r + 7);
    g.moveTo(px + 2.4, py);
    g.arc(px, py, 2.4, 0, TAU);
  }
  g.fillStyle = c.divider;
  g.fill();

  g.beginPath();
  g.arc(cx, cy, 36, 0, TAU);
  g.fillStyle = c.card;
  g.fill();

  // Pointer: flaps back when a peg passes under it.
  g.save();
  g.translate(cx, cy - r + 6);
  g.rotate(-0.35 * flap);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(-15, -32);
  g.lineTo(15, -32);
  g.closePath();
  g.fillStyle = c.text;
  g.fill();
  g.lineWidth = 2;
  g.lineJoin = "round";
  g.strokeStyle = c.card;
  g.stroke();
  g.restore();

  return moving || pulsing;
}

export default defineApp<State, Action, Local>({
  name: "Chore wheel",
  summary: (s, ctx) => {
    const n = ctx.members.length;
    const taken = Object.keys(s.who).length;
    if (n > 0 && ctx.members.every((m) => s.who[m.id] !== undefined)) {
      return allDone(s, ctx) ? `${s.title}: all done this week` : `${s.title}: everyone's set · ${s.done.length} of ${n} done`;
    }
    if (taken === 0) return `${s.title}: nobody's spun yet`;
    const open = s.chores.filter((c) => holders(s, c.id).length === 0).map((c) => c.label);
    return `${s.title}: ${taken} of ${n} spun${open.length ? ` · ${open.join(", ")} open` : ""}`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "spin") {
      if (s.who[meta.user] !== undefined) return s;
      const p = pickWith(s, meta.seed, s.rot);
      return { ...s, who: { ...s.who, [meta.user]: p.chore }, rot: p.rot, spin: { by: meta.user, chore: p.chore, at: meta.time, from: s.rot, to: p.to }, spins: s.spins + 1 };
    }
    if (a.t === "done") {
      if (s.who[meta.user] === undefined) return s;
      return { ...s, done: s.done.includes(meta.user) ? s.done.filter((u) => u !== meta.user) : [...s.done, meta.user] };
    }
    if (a.t === "reset") {
      if (!allDone(s, ctx)) return s;
      return { ...s, who: {}, done: [], spin: null, week: s.week + 1 };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const gone = Object.keys(s.who).filter((u) => !inChat(ctx, u));
    const doneGone = s.done.filter((u) => !inChat(ctx, u));
    if (!gone.length && !doneGone.length) return s;
    const who: Record<string, string> = {};
    for (const u of Object.keys(s.who)) if (inChat(ctx, u)) who[u] = s.who[u]!;
    const done = s.done.filter((u) => inChat(ctx, u));
    const spin = s.spin && who[s.spin.by] !== undefined ? s.spin : null;
    return { ...s, who, done, spin };
  },

  invariants: {
    "rota holds people in the chat and real chores": (s, ctx) => Object.entries(s.who).every(([u, c]) => ctx.members.some((m) => m.id === u) && s.chores.some((x) => x.id === c)),
    "done only by people with a chore, once each": (s) => new Set(s.done).size === s.done.length && s.done.every((u) => s.who[u] !== undefined),
    "the wheel rests within one turn": (s) => Number.isFinite(s.rot) && s.rot >= 0 && s.rot < 1,
    "the last spin rests under the pointer": (s) => {
      if (s.spin === null) return true;
      const a = ((((-s.rot) % 1) + 1) % 1) * s.chores.reduce((n, c) => n + c.fights, 0);
      let run = 0;
      let at = s.chores[s.chores.length - 1]!.id;
      for (const c of s.chores) {
        run += c.fights;
        if (a < run) {
          at = c.id;
          break;
        }
      }
      return at === s.spin.chore && s.spin.to - s.spin.from >= 4 && s.who[s.spin.by] === s.spin.chore;
    },
    "counts are sane": (s) => Number.isInteger(s.spins) && s.spins >= 0 && Number.isInteger(s.week) && s.week >= 1 && (s.spins > 0 || s.spin === null),
    "chores are 2 to 8 with whole fights": (s) => s.chores.length >= 2 && s.chores.length <= 8 && s.chores.every((c) => Number.isInteger(c.fights) && c.fights >= 1 && c.fights <= 20),
  },

  transitions: {
    "a spin gives the spinner one chore": (p, n, a, m) =>
      a.t !== "spin" ||
      p === n ||
      (p.who[m.user] === undefined &&
        n.spin !== null &&
        n.who[m.user] === n.spin.chore &&
        Object.keys(n.who).length === Object.keys(p.who).length + 1 &&
        n.spin.by === m.user &&
        n.spin.at === m.time &&
        n.spins === p.spins + 1),
    "a spin lands on a least-staffed chore": (p, n, a) => {
      if (a.t !== "spin" || p === n || n.spin === null) return true;
      const count = (id: string) => Object.values(p.who).filter((c) => c === id).length;
      return count(n.spin.chore) === Math.min(...p.chores.map((c) => count(c.id)));
    },
    "the seed decides the spin": (p, n, a, m) => {
      if (a.t !== "spin" || p === n || n.spin === null) return true;
      const counts = p.chores.map((c) => Object.values(p.who).filter((x) => x === c.id).length);
      const lo = Math.min(...counts);
      const open = p.chores.filter((_, i) => counts[i] === lo);
      const g = rng(m.seed);
      const x = g.next() * open.reduce((q, c) => q + c.fights, 0);
      let run = 0;
      let ch = open[open.length - 1]!;
      for (const c of open) {
        run += c.fights;
        if (x < run) {
          ch = c;
          break;
        }
      }
      const off = 0.15 + 0.7 * g.next();
      const before = p.chores.slice(0, p.chores.indexOf(ch)).reduce((q, c) => q + c.fights, 0);
      const land = (before + off * ch.fights) / p.chores.reduce((q, c) => q + c.fights, 0);
      return n.spin.chore === ch.id && n.rot === (((1 - land) % 1) + 1) % 1;
    },
    "a spin starts where the wheel rested": (p, n, a) => a.t !== "spin" || p === n || (n.spin !== null && n.spin.from === p.rot),
    "done toggles only the sender, who has a chore": (p, n, a, m) => {
      if (a.t !== "done" || p === n) return true;
      const diff = [...p.done.filter((u) => !n.done.includes(u)), ...n.done.filter((u) => !p.done.includes(u))];
      return p.who[m.user] !== undefined && diff.length === 1 && diff[0] === m.user && JSON.stringify(n.who) === JSON.stringify(p.who);
    },
    "a new week only once everyone's done": (p, n, a, _m, ctx) =>
      a.t !== "reset" ||
      p === n ||
      (ctx.members.length > 0 && ctx.members.every((x) => p.who[x.id] !== undefined && p.done.includes(x.id)) && Object.keys(n.who).length === 0 && n.done.length === 0 && n.week === p.week + 1),
    "the rota changes only by spin or reset": (p, n, a) => a.t === "spin" || a.t === "reset" || JSON.stringify(n.who) === JSON.stringify(p.who),
    "chores never change": (p, n) => JSON.stringify(n.chores) === JSON.stringify(p.chores),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    if (allDone(s, ctx)) return r.next() < 0.7 ? { t: "reset" } : { t: "done" };
    if (s.who[user] === undefined) return { t: "spin" };
    return r.next() < 0.75 ? { t: "done" } : { t: "spin" };
  },

  local: { mine: 0 },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const sp = confirmed.spin;
    const waiting = pending && state.spins !== confirmed.spins;
    const e = sp ? running(sp.at, SPIN_MS) : null;
    const turning = e !== null;
    const settled = !turning;
    const everyone = members.length > 0 && members.every((m) => confirmed.who[m.id] !== undefined && confirmed.done.includes(m.id));
    const mineId = confirmed.who[me];
    const mineChore = mineId !== undefined ? confirmed.chores.find((x) => x.id === mineId) : undefined;
    const iDone = confirmed.done.includes(me);
    const spinners = Object.keys(confirmed.who);
    const biggest = confirmed.chores.reduce((a, x) => (x.fights > a.fights ? x : a), confirmed.chores[0]!);
    const spinning = waiting || turning;
    const showCard = !everyone && mineChore !== undefined && !waiting && (settled || (sp !== null && sp.by !== me));
    const lift = sp && settled ? running(sp.at + SPIN_MS, 500) : null;
    const dy = lift === null ? 0 : 30 * (1 - rise(lift));

    const label = `Chore wheel: ${confirmed.chores
      .map((ch) => {
        const names = holders(confirmed, ch.id).map((u) => first(nameOf(members, u)));
        if (!names.length) return `${ch.label} open`;
        return `${ch.label} ${names.length > 2 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : listNames(names)}`;
      })
      .join(", ")}`;

    let hub: { text: string; aria: string; fill: string; ink: string; onClick: (() => void) | null; two?: boolean };
    if (spinning) hub = { text: "", aria: "Spinning", fill: c.secondaryButton, ink: c.secondaryButtonText, onClick: null };
    else if (everyone) hub = { text: "New week", aria: "Start a new week", fill: c.primary, ink: c.onPrimary, onClick: () => dispatch({ t: "reset" }), two: true };
    else if (mineChore === undefined)
      hub = {
        text: "Spin",
        aria: "Spin the chore wheel",
        fill: c.primary,
        ink: c.onPrimary,
        onClick: () => {
          haptic("light");
          setLocal({ mine: confirmed.spins + 1 });
          dispatch({ t: "spin" });
        },
      };
    else if (!iDone) hub = { text: "Done", aria: `Mark ${mineChore.label} done`, fill: c.primary, ink: c.onPrimary, onClick: () => dispatch({ t: "done" }) };
    else hub = { text: "Undo", aria: `Mark ${mineChore.label} not done`, fill: c.secondaryButton, ink: c.secondaryButtonText, onClick: () => dispatch({ t: "done" }) };

    const others = confirmed.chores.flatMap((ch) => holders(confirmed, ch.id).filter((u) => u !== me).map((u) => ({ u, ch })));
    const shownOthers = others.slice(0, 3);
    const rest = others.length - shownOthers.length;
    const side = ellipsis;

    let bottom;
    if (everyone) {
      bottom = (
        <div style={{ marginTop: 8, height: 96 }}>
          <Locked detail={`Week ${confirmed.week} · ${confirmed.chores.length} chores done`}>All done this week</Locked>
          <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, padding: "8px 2px 0", ...ellipsis }}>Tap New week to spin again</div>
        </div>
      );
    } else if (showCard && mineChore) {
      bottom = (
        <div
          style={{
            marginTop: 8,
            height: 96,
            boxSizing: "border-box",
            borderRadius: 12,
            background: c.wash,
            padding: "10px 16px 8px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            transform: `translateY(${dy}px)`,
            opacity: lift === null ? 1 : Math.min(1, 0.2 + lift / 150),
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, lineHeight: "18px" }}>
            <span style={{ fontSize: 13, color: c.secondaryText, flex: "none" }}>You got</span>
            <span style={{ fontSize: 13, color: c.secondaryText, minWidth: 0, ...side }}>{mineChore.note || confirmed.rule}</span>
          </div>
          <div style={{ lineHeight: "30px", ...ellipsis }}>
            <span style={{ fontSize: 24, fontWeight: 700, color: c.text }}>{mineChore.label}</span>
            {iDone ? <span style={{ fontSize: 15, fontWeight: 600, color: c.positive }}>{" · done"}</span> : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, height: 20, minWidth: 0, overflow: "hidden" }}>
            {shownOthers.map(({ u, ch }) => (
              <span key={u} style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, flex: "0 1 auto" }}>
                <Avatar user={u} size={18} />
                <span style={{ fontSize: 13, lineHeight: "18px", color: confirmed.done.includes(u) ? c.secondaryText : c.text, textDecoration: confirmed.done.includes(u) ? "line-through" : "none", ...ellipsis }}>{lower(ch.label)}</span>
              </span>
            ))}
            {rest > 0 ? <More n={rest} size={18} /> : null}
          </div>
        </div>
      );
    } else {
      const names = spinners.map((u) => first(nameOf(members, u)));
      const who = names.length > 3 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} others` : listNames(names);
      let line = `${who} already spun`;
      if (spinning) line = waiting || (sp && sp.by === me) ? `Come on… not ${lower(biggest.label)}…` : `${first(nameOf(members, sp!.by))} is spinning…`;
      else if (!spinners.length) line = "Nobody's spun yet";
      bottom = (
        <div style={{ height: 34, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minWidth: 0 }}>
          {!spinning && spinners.length ? <Facepile users={spinners} max={3} size={20} /> : null}
          <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, minWidth: 0, ...ellipsis }}>{line}</span>
        </div>
      );
    }

    const toast = sp !== null && settled && confirmed.spins === local.mine && sp.by === me && mineChore !== undefined;

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub ? `${state.sub} · slice size = fights caused` : "Slice size = fights caused"} />
        <div style={{ position: "relative", height: 264 }}>
          <Canvas height={264} label={label} draw={(g, f) => drawWheel(g, f, confirmed, members, waiting)} />
          <button
            type="button"
            aria-label={hub.aria}
            disabled={hub.onClick === null}
            {...(hub.onClick ? { onClick: hub.onClick } : {})}
            style={{
              position: "absolute",
              left: "calc(50% - 32px)",
              top: 106,
              width: 64,
              height: 64,
              padding: 0,
              border: "none",
              borderRadius: theme.radius.pill,
              background: hub.fill,
              color: hub.ink,
              font: "inherit",
              fontSize: hub.two ? 15 : 17,
              fontWeight: 600,
              lineHeight: hub.two ? "16px" : undefined,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              textAlign: "center",
              cursor: hub.onClick ? "pointer" : "default",
            }}
          >
            {hub.text
              ? hub.text
              : [0, 1, 2].map((k) => <span key={k} style={{ width: 4, height: 4, borderRadius: 2, background: c.secondaryButtonText }} />)}
          </button>
        </div>
        {bottom}
        {toast ? <Toast key={confirmed.spins}>{`${mineChore!.label} it is`}</Toast> : null}
      </div>
    );
  },
});
