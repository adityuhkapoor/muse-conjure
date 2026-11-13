import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Toast,
  haptic,
  mix,
  pal,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Alarm box: the group writes Calvin's eighth alarm on a music box. The drum is a grid of 16 steps
// by 8 notes; tap it to set a pin in your colour. Crank it and the drum turns, pins pluck the comb,
// and little notes float up for everyone watching. When it's good, set it as the alarm.

type Params = {
  /** Card title: "Calvin's alarm 8" */
  title: string;
  /** Under the title: "a tune he can't sleep through" */
  sub: string;
  /** Whose alarm it becomes. */
  owner: string;
  /** Pins already set: who, step (1 to 16), note (1 low to 8 high). */
  pins: { name: string; step: number; note: number }[];
  /** A line from a friend about the tune so far. */
  said: { name: string; text: string }[];
};

// @params
const P: Params = {
  title: "Calvin's alarm 8",
  sub: "a tune he can't sleep through",
  owner: "Calvin",
  pins: [
    { name: "Maya", step: 1, note: 1 },
    { name: "Maya", step: 3, note: 3 },
    { name: "Maya", step: 5, note: 5 },
    { name: "Maya", step: 7, note: 8 },
    { name: "Will", step: 9, note: 7 },
    { name: "Will", step: 10, note: 6 },
    { name: "Will", step: 11, note: 5 },
    { name: "Arun", step: 13, note: 3 },
    { name: "Arun", step: 14, note: 3 },
    { name: "Arun", step: 15, note: 3 },
    { name: "Tsai Lin", step: 16, note: 8 },
    { name: "Tsai Lin", step: 12, note: 1 },
  ],
  said: [
    { name: "Arun", text: "the three in a row is the rice cooker beep. you're welcome" },
    { name: "Tsai Lin", text: "the high one at the end is my veto" },
  ],
};
// @end params

type Pin = { step: number; note: number; who: string; name: string };
type State = { title: string; sub: string; owner: string; pins: Pin[]; playAt: number; plays: number; locked: string; lockedName: string; said: { who: string; name: string; text: string }[] };
type Action = { t: "pin"; step: number; note: number } | { t: "play" } | { t: "lock" };
type Local = { toast: number; msg: string };

const STEPS = 16;
const NOTES = 8;
const STEP_MS = 260;
const MINE = 12;
const NAMES = ["C", "D", "E", "F", "G", "A", "B", "C"];
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const first = (n: string) => n.split(" ")[0] ?? n;
const okCell = (step: unknown, note: unknown) => typeof step === "number" && typeof note === "number" && Number.isInteger(step) && Number.isInteger(note) && step >= 0 && step < STEPS && note >= 0 && note < NOTES;
const PLAY_MS = STEPS * STEP_MS + 900;

function initState(ctx: Ctx): State {
  const who = (name: string) => {
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return m ? m.id : `~${name}`;
  };
  const pins: Pin[] = [];
  for (const p of Array.isArray(P.pins) ? P.pins : []) {
    const name = clean(p?.name, 20);
    const step = typeof p?.step === "number" ? Math.round(p.step) - 1 : -1;
    const note = typeof p?.note === "number" ? Math.round(p.note) - 1 : -1;
    if (!name || !okCell(step, note) || pins.some((q) => q.step === step && q.note === note)) continue;
    const id = who(name);
    if (pins.filter((q) => q.who === id).length >= MINE) continue;
    pins.push({ step, note, who: id, name });
  }
  const said = (Array.isArray(P.said) ? P.said : [])
    .map((x) => ({ name: clean(x?.name, 20), text: clean(x?.text, 80) }))
    .filter((x) => x.name && x.text)
    .slice(0, 4)
    .map((x) => ({ who: who(x.name), ...x }));
  return { title: clean(P.title, 40) || "Alarm box", sub: clean(P.sub, 60), owner: clean(P.owner, 20), pins, playAt: 0, plays: 0, locked: "", lockedName: "", said };
}

const CL = 56;
const geo = (W: number, H: number) => {
  const DX = CL + 4;
  const dw = W - DX - 30;
  const top = 18;
  return { DX, dw, cw: dw / STEPS, top, rh: (H - top - 18) / NOTES };
};

function drawBox(g: CanvasRenderingContext2D, t: Theme, f: DrawFrame, s: State, me: string, H: number) {
  const c = t.color;
  const pl = pal(t);
  const dk = t.mode === "dark";
  const W = f.width;
  const e = s.playAt ? f.now - s.playAt : -1;
  const playing = e >= 0 && e < PLAY_MS;
  const head = playing ? e / STEP_MS : 0; // how many steps the drum has turned
  const { DX, dw, cw, top, rh } = geo(W, H);
  const rowY = (n: number) => top + (NOTES - 1 - n + 0.5) * rh;
  // wooden box
  g.fillStyle = dk ? mix(pl.brown, c.card, 0.35) : mix(pl.brown, pl.crust, 0.35);
  g.beginPath();
  g.roundRect(0, 0, W, H, 12);
  g.fill();
  g.fillStyle = dk ? mix(pl.brown, c.card, 0.5) : mix(pl.brown, pl.crust, 0.55);
  for (let y = 6; y < H; y += 11) g.fillRect(4, y, W - 8, 1);
  // crank on the right
  const ang = playing ? e / 160 : 0.6;
  const kx = W - 14;
  g.strokeStyle = mix(c.text, c.card, 0.2);
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(kx, H / 2);
  g.lineTo(kx + Math.cos(ang) * 10, H / 2 + Math.sin(ang) * 16);
  g.stroke();
  g.fillStyle = pl.red;
  g.beginPath();
  g.arc(kx + Math.cos(ang) * 10, H / 2 + Math.sin(ang) * 16, 5.5, 0, Math.PI * 2);
  g.arc(kx, H / 2, 3, 0, Math.PI * 2);
  g.fill();
  // the drum: brass, lighter in the middle like a cylinder
  const drumTop = top - 6;
  const drumH = NOTES * rh + 12;
  const grad = g.createLinearGradient(0, drumTop, 0, drumTop + drumH);
  grad.addColorStop(0, mix(pl.yellow, pl.brown, 0.45));
  grad.addColorStop(0.45, mix(pl.yellow, c.card, 0.25));
  grad.addColorStop(1, mix(pl.yellow, pl.brown, 0.5));
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(DX, drumTop, dw, drumH, 10);
  g.fill();
  // step lines that turn with the drum
  const turn = (head % 1) * cw;
  g.strokeStyle = mix(pl.brown, pl.yellow, 0.5);
  g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k <= STEPS + 1; k++) {
    const x = DX + k * cw - turn;
    if (x < DX + 2 || x > DX + dw - 2) continue;
    g.moveTo(x, drumTop + 4);
    g.lineTo(x, drumTop + drumH - 4);
  }
  g.stroke();
  // pins roll left into the comb as the drum turns
  for (const p of s.pins) {
    const x = DX + (p.step - head + 0.5) * cw;
    if (x < DX + 2 || x > DX + dw - 2) continue;
    g.fillStyle = userColor(p.who, t);
    g.beginPath();
    g.arc(x, rowY(p.note), Math.min(5.5, cw * 0.36), 0, Math.PI * 2);
    g.fill();
    if (p.who === me) {
      g.strokeStyle = c.card;
      g.lineWidth = 1.5;
      g.stroke();
    }
  }
  // comb on the left, one tooth per note; a tooth shakes when its pin reaches it
  g.fillStyle = dk ? mix(c.secondaryText, c.card, 0.55) : mix(c.secondaryText, c.text, 0.35);
  g.beginPath();
  g.roundRect(6, top - 8, 16, NOTES * rh + 16, 4);
  g.fill();
  for (let n = 0; n < NOTES; n++) {
    const y = rowY(n);
    const plucked = playing && s.pins.some((p) => p.note === n && head - p.step >= 0 && head - p.step < 1.2);
    const shake = plucked ? Math.sin(f.now / 18) * 2 : 0;
    const len = DX - 22 - (NOTES - 1 - n) * 2;
    g.fillStyle = plucked ? mix(pl.yellow, c.card, 0.2) : mix(c.secondaryText, c.card, dk ? 0.1 : 0.45);
    g.beginPath();
    g.roundRect(23, y - 3 + shake, len - 3, 6, 3);
    g.fill();
  }
  // note names on the base of the comb
  g.font = `700 10px ${t.type.family}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = dk ? c.text : c.card;
  for (let n = 0; n < NOTES; n++) g.fillText(NAMES[n]!, 13.5, rowY(n) + 0.5);
  // notes floating up off the comb
  if (playing) {
    for (const p of s.pins) {
      const since = (head - p.step) * STEP_MS;
      if (since < 0 || since > 900) continue;
      const k = since / 900;
      const x = 34 + Math.sin(p.step * 2 + k * 4) * 6;
      const y = rowY(p.note) - k * 44;
      g.fillStyle = userColor(p.who, t);
      g.beginPath();
      g.ellipse(x, y, 4.5, 3.5, -0.4, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x + 3, y - 13, 1.8, 13);
    }
  }
  return playing;
}

export default defineApp<State, Action, Local>({
  name: "Alarm box",
  summary: (s) => {
    const people = new Set(s.pins.map((p) => p.who)).size;
    return s.locked ? `${s.title}: set, ${s.pins.length} notes from ${people} of you` : `${s.title}: ${s.pins.length} notes from ${people} ${people === 1 ? "person" : "people"}`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const name = clean(ctx.members.find((x) => x.id === m.user)?.name, 20) || "Friend";
    if (a.t === "pin") {
      if (s.locked || !okCell(a.step, a.note)) return s;
      const here = s.pins.find((p) => p.step === a.step && p.note === a.note);
      if (here) return here.who === m.user ? { ...s, pins: s.pins.filter((p) => p !== here) } : s;
      if (s.pins.filter((p) => p.who === m.user).length >= MINE) return s;
      return { ...s, pins: [...s.pins, { step: a.step, note: a.note, who: m.user, name }] };
    }
    if (a.t === "play") {
      if (!s.pins.length || (s.playAt && m.time < s.playAt + PLAY_MS)) return s;
      return { ...s, playAt: m.time, plays: s.plays + 1 };
    }
    if (a.t === "lock") {
      if (s.locked || s.pins.length < 4) return s;
      return { ...s, locked: m.user, lockedName: name };
    }
    return s;
  },

  invariants: {
    "one pin per spot": (s) => new Set(s.pins.map((p) => `${p.step}|${p.note}`)).size === s.pins.length,
    "pins sit on the drum": (s) => s.pins.every((p) => okCell(p.step, p.note)),
    "nobody hogs the drum": (s) => {
      const n: Record<string, number> = {};
      for (const p of s.pins) n[p.who] = (n[p.who] ?? 0) + 1;
      return Object.values(n).every((k) => k <= MINE);
    },
    "a set alarm has a tune": (s) => !s.locked || s.pins.length >= 4,
  },

  transitions: {
    "a set alarm doesn't change": (p, n) => !p.locked || (n.pins.length === p.pins.length && n.locked === p.locked),
    "you only lift your own pins": (p, n, _a, m) => p.pins.every((x) => x.who === m.user || n.pins.some((y) => y.step === x.step && y.note === x.note && y.who === x.who)),
    "a pin toggles one spot": (p, n, a, m) => {
      if (a.t !== "pin" || p === n) return true;
      const had = p.pins.some((x) => x.step === a.step && x.note === a.note);
      const has = n.pins.some((x) => x.step === a.step && x.note === a.note && x.who === m.user);
      return Math.abs(n.pins.length - p.pins.length) === 1 && had !== has;
    },
    "new pins carry your chat name": (p, n, _a, m, ctx) => n.pins.every((x) => p.pins.some((y) => y.step === x.step && y.note === x.note) || x.name === (clean(ctx.members.find((q) => q.id === m.user)?.name, 20) || "Friend")),
    "a crank starts the tune for everyone": (p, n, a, m) => a.t !== "play" || p === n || (n.playAt === m.time && n.plays === p.plays + 1 && (!p.playAt || m.time >= p.playAt + PLAY_MS)),
    "setting it records who": (p, n, a, m) => a.t !== "lock" || p === n || (n.locked === m.user && p.pins.length >= 4),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const x = r.next();
    if (x < 0.08) return { t: "play" };
    if (x < 0.1) return { t: "lock" };
    const mine = s.pins.filter((p) => p.who === user);
    if (mine.length && r.next() < 0.3) {
      const p = r.pick(mine);
      return { t: "pin", step: p.step, note: p.note };
    }
    return { t: "pin", step: r.int(STEPS), note: r.int(NOTES) };
  },

  local: { toast: 0, msg: "" },

  view: ({ state: s, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const H = 196;
    const { DX, cw, top, rh } = geo(W, H);
    const nameOf = (id: string, fb: string) => members.find((m) => m.id === id)?.name ?? fb;
    const count = new Map<string, { id: string; name: string; n: number }>();
    for (const p of s.pins) {
      const e = count.get(p.who) ?? { id: p.who, name: nameOf(p.who, p.name), n: 0 };
      e.n++;
      count.set(p.who, e);
    }
    const crew = [...count.values()].sort((a, b) => b.n - a.n);
    const mineN = s.pins.filter((p) => p.who === me).length;
    const playing = confirmed.playAt ? running(confirmed.playAt, PLAY_MS) !== null : false;
    const onPointer = (e: { type: string; x: number; y: number }) => {
      if (e.type !== "down" || s.locked || playing) return;
      const step = Math.floor((e.x - DX) / cw);
      const note = NOTES - 1 - Math.floor((e.y - top) / rh);
      if (!okCell(step, note)) return;
      const here = s.pins.find((p) => p.step === step && p.note === note);
      if (here && here.who !== me) return;
      if (!here && mineN >= MINE) {
        setLocal({ toast: local.toast + 1, msg: `${MINE} pins each · lift one first` });
        return;
      }
      haptic("light");
      dispatch({ t: "pin", step, note });
    };
    const said = s.said[0];
    const label = `Music box drum, ${s.pins.length} pins from ${crew.length} people${s.locked ? `, set by ${s.lockedName}` : ""}`;

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.locked ? `set by ${first(nameOf(s.locked, s.lockedName))} · it goes off tomorrow` : `${s.sub ? `${s.sub} · ` : ""}tap the drum`} />
        <Canvas height={H} label={label} draw={(g, f) => drawBox(g, theme, f, confirmed, me, H)} onPointer={onPointer} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, height: 28, overflow: "hidden" }}>
          {crew.slice(0, theme.width < 360 ? 3 : 4).map((p) => (
            <span key={p.id} style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 8px 0 3px", height: 26, borderRadius: 13, background: p.id === me ? c.selected : c.wash, fontSize: 13, color: c.text }}>
              <Avatar user={{ id: p.id, name: p.name } as Member} size={20} />
              <b style={{ fontWeight: 600 }}>{String(p.n)}</b>
            </span>
          ))}
          {!crew.length ? <span style={{ fontSize: 13, color: c.secondaryText }}>The drum is empty · set the first pin</span> : null}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: "16px", color: c.secondaryText, ...ell }}>
          {said ? `${first(nameOf(said.who, said.name))}: “${said.text}”` : mineN ? `${mineN} of your ${MINE} pins set` : "Higher rows ring higher"}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <Button
            kind={s.locked ? "primary" : "secondary"}
            wide
            disabled={!s.pins.length || playing}
            onClick={() => {
              haptic("medium");
              dispatch({ t: "play" });
            }}
          >
            {playing ? "Playing" : "Crank it"}
          </Button>
          {!s.locked ? (
            <Button
              kind="primary"
              wide
              disabled={s.pins.length < 4}
              onClick={() => {
                haptic("success");
                dispatch({ t: "lock" });
                setLocal({ toast: local.toast + 1, msg: `Set as ${s.title.toLowerCase().startsWith(first(s.owner).toLowerCase()) ? "the alarm" : s.title}` });
              }}
            >
              Set the alarm
            </Button>
          ) : null}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
