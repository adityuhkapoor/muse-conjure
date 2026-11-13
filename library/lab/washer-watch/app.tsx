import {
  defineApp,
  Button,
  Canvas,
  CardHeader,
  Toast,
  clock,
  fitText,
  haptic,
  mix,
  pal,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Meta,
} from "@muse/app";

// Washer watch: the building's laundry room, live. Machines in a row with their portholes; a
// running load tumbles in its owner's color and counts down, a finished one waits with its owner's
// face. Tap a free machine to start yours; tap a done one to nudge its owner, and after the grace
// period anyone can move it out to the basket.

type Params = {
  /** Card title */
  title: string;
  /** Where the machines are */
  place: string;
  /** Up to 4 machines. kind: washer or dryer. who: whose load is in it ("" if free). left: minutes left now (0 = done). waited: minutes it has sat done. */
  machines: { name: string; kind: string; who: string; left: number; waited?: number }[];
  /** Minutes a done load can sit before anyone may move it out */
  grace: number;
};

// @params
const P: Params = {
  title: "Laundry room",
  place: "412 Pine basement",
  machines: [
    { name: "Washer 1", kind: "washer", who: "Will", left: 22 },
    { name: "Washer 2", kind: "washer", who: "Calvin", left: 0, waited: 40 },
    { name: "Dryer 1", kind: "dryer", who: "", left: 0 },
    { name: "Dryer 2", kind: "dryer", who: "Maya", left: 15 },
  ],
  grace: 10,
};
// @end params

type Load = { by: string; name: string; end: number; left: number; nudges: number };
type Machine = { name: string; kind: "washer" | "dryer"; load: Load | null; waited: number };
type Moved = { by: string; name: string; mover: string; at: number };
type State = { title: string; place: string; grace: number; machines: Machine[]; basket: Moved[] };
type Action = { t: "start"; m: number } | { t: "collect"; m: number } | { t: "nudge"; m: number } | { t: "move"; m: number } | { t: "claim" };
type Local = { sel: number; toast: number; msg: string };

const H = 190;
const MINS = { washer: 35, dryer: 45 } as const;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const first = (n: string) => n.split(" ")[0] ?? n;
const okM = (s: State, m: unknown): m is number => typeof m === "number" && Number.isInteger(m) && m >= 0 && m < s.machines.length;
/** A live load ends at `end` (server ms); a load from the chat's description has `end` 0 and a fixed `left`. */
const isDone = (l: Load, now: number) => (l.end ? now >= l.end : l.left === 0);
const minsLeft = (l: Load, now: number) => (l.end ? Math.max(0, Math.ceil((l.end - now) / 60000)) : l.left);
const sat = (mc: Machine, now: number) => (mc.load ? (mc.load.end ? Math.max(0, Math.floor((now - mc.load.end) / 60000)) : mc.waited) : 0);

function initState(ctx: Ctx): State {
  const machines: Machine[] = [];
  for (const x of Array.isArray(P.machines) ? P.machines : []) {
    if (machines.length >= 4) break;
    const kind = x?.kind === "dryer" ? "dryer" : "washer";
    const who = clean(x?.who, 24);
    const m = who ? ctx.members.find((y) => y.id === who || y.name.toLowerCase() === who.toLowerCase()) : undefined;
    const left = Number.isInteger(x?.left) ? Math.max(0, Math.min(90, x.left)) : 0;
    machines.push({
      name: clean(x?.name, 14) || `${kind === "dryer" ? "Dryer" : "Washer"} ${machines.length + 1}`,
      kind,
      load: who ? { by: m ? m.id : `?${who.toLowerCase()}`, name: m ? m.name : who, end: 0, left, nudges: 0 } : null,
      waited: who && left === 0 && Number.isInteger(x?.waited) ? Math.max(0, Math.min(600, x.waited ?? 0)) : 0,
    });
  }
  if (!machines.length) machines.push({ name: "Washer", kind: "washer", load: null, waited: 0 }, { name: "Dryer", kind: "dryer", load: null, waited: 0 });
  return { title: clean(P.title, 30) || "Laundry room", place: clean(P.place, 30), grace: Number.isInteger(P.grace) ? Math.max(0, Math.min(60, P.grace)) : 10, machines, basket: [] };
}

function reduceL(s: State, a: Action, meta: Meta, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u)) return s;
  const put = (i: number, mc: Machine) => ({ ...s, machines: s.machines.map((x, k) => (k === i ? mc : x)) });
  if (a.t === "claim") {
    if (!s.basket.some((b) => b.by === u)) return s;
    return { ...s, basket: s.basket.filter((b) => b.by !== u) };
  }
  if (!okM(s, a.m)) return s;
  const mc = s.machines[a.m]!;
  if (a.t === "start") {
    if (mc.load) return s;
    const name = ctx.members.find((m) => m.id === u)?.name ?? "";
    return put(a.m, { ...mc, load: { by: u, name, end: meta.time + MINS[mc.kind] * 60000, left: MINS[mc.kind], nudges: 0 }, waited: 0 });
  }
  if (!mc.load) return s;
  if (a.t === "collect") {
    if (mc.load.by !== u) return s;
    return put(a.m, { ...mc, load: null, waited: 0 });
  }
  if (a.t === "nudge") {
    if (mc.load.by === u || !isDone(mc.load, meta.time)) return s;
    return put(a.m, { ...mc, load: { ...mc.load, nudges: mc.load.nudges + 1 } });
  }
  if (a.t === "move") {
    if (mc.load.by === u || !isDone(mc.load, meta.time) || sat(mc, meta.time) < s.grace) return s;
    return { ...put(a.m, { ...mc, load: null, waited: 0 }), basket: [...s.basket.filter((b) => b.by !== mc.load!.by), { by: mc.load.by, name: mc.load.name, mover: u, at: meta.time }].slice(-6) };
  }
  return s;
}

function drawRoom(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, sel: number, members: readonly Member[], ctx: Ctx) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const W = f.width;
  const now = f.now;
  const dark = t.mode === "dark";
  // wall, floor tiles
  g.fillStyle = dark ? mix(c.card, p.blue, 0.1) : mix(p.sky, c.card, 0.55);
  g.beginPath();
  g.roundRect(0, 0, W, H, 12);
  g.fill();
  g.fillStyle = dark ? mix(c.card, c.text, 0.08) : mix(c.secondaryText, c.card, 0.82);
  g.fillRect(0, 166, W, H - 166);
  const n = s.machines.length;
  const gap = 8;
  const mw = Math.min(84, (W - 24 - gap * (n - 1)) / n);
  const x0 = (W - (mw * n + gap * (n - 1))) / 2;
  let busy = false;
  const body = dark ? mix(c.text, c.card, 0.3) : c.card;
  const edge = dark ? mix(c.text, c.card, 0.55) : mix(c.secondaryText, c.card, 0.45);
  s.machines.forEach((mc, i) => {
    const x = x0 + i * (mw + gap);
    const y = 46;
    const h = 122;
    const l = mc.load;
    const done = l ? isDone(l, now) : false;
    const bounce = l && done ? Math.abs(Math.sin(now / 260)) * 2 : 0;
    if (l && done) busy = true;
    g.fillStyle = body;
    g.strokeStyle = i === sel ? c.primary : edge;
    g.lineWidth = i === sel ? 3 : 1.5;
    g.beginPath();
    g.roundRect(x, y - bounce, mw, h, 8);
    g.fill();
    g.stroke();
    // control strip and light
    g.fillStyle = mix(edge, body, 0.6);
    g.fillRect(x + 1, y - bounce + 1, mw - 2, 16);
    g.fillStyle = !l ? mix(c.secondaryText, body, 0.4) : done ? p.green : p.orange;
    g.beginPath();
    g.arc(x + mw - 10, y - bounce + 9, 3.5, 0, Math.PI * 2);
    g.fill();
    const nm = fitText(mc.name, mw - 22, { g, size: 10, min: 8, weight: 700 });
    g.font = nm.font;
    g.fillStyle = dark ? c.wash : c.text;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(nm.text, x + 6, y - bounce + 9.5);
    // porthole
    const pr = Math.min(28, mw * 0.36);
    const px = x + mw / 2;
    const py = y - bounce + 18 + (h - 18) / 2 - 6;
    g.fillStyle = edge;
    g.beginPath();
    g.arc(px, py, pr + 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = dark ? mix(c.wash, p.blue, 0.25) : mix(p.sky, c.card, 0.2);
    g.beginPath();
    g.arc(px, py, pr, 0, Math.PI * 2);
    g.fill();
    if (l) {
      const col = inChat(ctx, l.by) ? userColor(l.by, t) : c.secondaryText;
      g.save();
      g.beginPath();
      g.arc(px, py, pr, 0, Math.PI * 2);
      g.clip();
      // clothes: tumbling while it runs, slumped at the bottom when done
      const spin = done ? 0 : now / (mc.kind === "dryer" ? 260 : 380);
      if (!done) busy = true;
      g.fillStyle = mix(col, c.card, 0.15);
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = spin + k * 1.57;
        const rr = done ? 0 : pr * 0.45;
        const cx = px + Math.cos(a) * rr;
        const cy = done ? py + pr * 0.55 - (k % 2) * 5 : py + Math.sin(a) * rr;
        g.moveTo(cx + 9, cy);
        g.ellipse(done ? px - 12 + k * 8 : cx, cy, 9, 6, a, 0, Math.PI * 2);
      }
      g.fill();
      if (!done && mc.kind === "washer") {
        g.fillStyle = mix(p.sky, c.card, 0.5);
        g.globalAlpha = 0.7;
        g.fillRect(px - pr, py + pr * 0.25 + Math.sin(now / 300) * 2, pr * 2, pr);
        g.globalAlpha = 1;
      }
      g.restore();
      // owner face on the door
      const fx = x + mw / 2;
      const fy = y - bounce + h - 14;
      g.beginPath();
      g.arc(fx, fy, 9, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = l.by === me ? c.primary : body;
      g.stroke();
      g.fillStyle = inChat(ctx, l.by) ? c.onPrimary : c.secondaryButtonText;
      g.font = `700 10px ${t.type.family}`;
      g.textAlign = "center";
      g.fillText((members.find((m) => m.id === l.by)?.name ?? l.name)[0]?.toUpperCase() ?? "?", fx, fy + 0.5);
      // time left, or how long it's been sitting
      const tag = done ? `done ${sat(mc, now)}m` : `${minsLeft(l, now)}m left`;
      g.font = `600 11px ${t.type.family}`;
      const tw = g.measureText(tag).width + 12;
      g.fillStyle = done && sat(mc, now) >= s.grace ? c.negative : done ? c.positive : c.text;
      g.beginPath();
      g.roundRect(px - tw / 2, y - bounce - 26, tw, 18, 9);
      g.fill();
      g.fillStyle = dark ? c.wash : c.card;
      g.fillText(tag, px, y - bounce - 16.5);
    } else {
      g.strokeStyle = mix(edge, body, 0.2);
      g.setLineDash([4, 3]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(px, py, pr - 6, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.font = `600 11px ${t.type.family}`;
      g.fillStyle = c.secondaryText;
      g.textAlign = "center";
      g.fillText("free", px, y - 16);
    }
  });
  // the basket of moved-out loads
  if (s.basket.length) {
    const bx = W - 58;
    g.fillStyle = mix(p.crust, c.card, 0.2);
    g.beginPath();
    g.roundRect(bx, 170, 48, 18, [3, 3, 8, 8]);
    g.fill();
    s.basket.slice(-3).forEach((b, k) => {
      g.fillStyle = inChat(ctx, b.by) ? userColor(b.by, t) : c.secondaryText;
      g.beginPath();
      g.ellipse(bx + 12 + k * 12, 170, 9, 5, 0.3 * k, 0, Math.PI * 2);
      g.fill();
    });
  }
  return busy;
}

export default defineApp<State, Action, Local>({
  name: "Washer watch",
  summary: (s) => {
    const free = s.machines.filter((m) => !m.load).length;
    return `${s.title}: ${free} of ${s.machines.length} free${s.basket.length ? ` · ${s.basket.length} in the basket` : ""}`;
  },
  init: initState,
  reduce: reduceL,

  invariants: {
    "machines are washers or dryers": (s) => s.machines.length >= 1 && s.machines.length <= 4 && s.machines.every((m) => m.kind === "washer" || m.kind === "dryer"),
    "loads have a time": (s) => s.machines.every((m) => !m.load || (Number.isFinite(m.load.end) && m.load.end >= 0 && Number.isInteger(m.load.left) && m.load.left >= 0 && Number.isInteger(m.load.nudges) && m.load.nudges >= 0)),
    "a free machine has waited nothing": (s) => s.machines.every((m) => m.load !== null || m.waited === 0),
    "one basket pile each": (s) => new Set(s.basket.map((b) => b.by)).size === s.basket.length && s.basket.length <= 6,
  },

  transitions: {
    "starting fills a free machine with yours": (p, n, a, m) => {
      if (a.t !== "start" || p === n) return true;
      const x = n.machines[a.m]!;
      return !p.machines[a.m]!.load && !!x.load && x.load.by === m.user && x.load.end === m.time + MINS[x.kind] * 60000;
    },
    "only the owner collects": (p, n, a, m) => a.t !== "collect" || p === n || (p.machines[a.m]!.load?.by === m.user && n.machines[a.m]!.load === null),
    "a nudge pings a finished load's owner": (p, n, a, m) => {
      if (a.t !== "nudge" || p === n) return true;
      const b = p.machines[a.m]!.load;
      const x = n.machines[a.m]!.load;
      return !!b && !!x && b.by !== m.user && isDone(b, m.time) && x.nudges === b.nudges + 1;
    },
    "moving out waits out the grace": (p, n, a, m) => {
      if (a.t !== "move" || p === n) return true;
      const mc = p.machines[a.m]!;
      return !!mc.load && mc.load.by !== m.user && isDone(mc.load, m.time) && sat(mc, m.time) >= p.grace && n.machines[a.m]!.load === null && n.basket.some((b) => b.by === mc.load!.by && b.mover === m.user);
    },
    "one action, one machine": (p, n, a) => a.t === "claim" || n.machines.filter((x, i) => JSON.stringify(x) !== JSON.stringify(p.machines[i])).length <= 1,
    "claiming empties only your pile": (p, n, a, m) => a.t !== "claim" || p === n || (!n.basket.some((b) => b.by === m.user) && n.basket.length === p.basket.length - 1),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const i = r.int(s.machines.length);
    const mc = s.machines[i]!;
    if (s.basket.some((b) => b.by === user) && r.next() < 0.3) return { t: "claim" };
    if (!mc.load) return { t: "start", m: i };
    if (mc.load.by === user) return { t: "collect", m: i };
    return r.next() < 0.5 ? { t: "nudge", m: i } : { t: "move", m: i };
  },

  local: { sel: -1, toast: 0, msg: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const ctx: Ctx = { room: "", members };
    const W = theme.width - 2 * theme.space.card;
    const now = state.machines.some((m) => m.load && m.load.end) ? clock.value : 0;
    const nm = (id: string, fb: string) => (id === me ? "You" : first(members.find((m) => m.id === id)?.name ?? fb));
    const mineAt = state.machines.findIndex((m) => m.load?.by === me);
    const freeAt = state.machines.findIndex((m) => !m.load);
    const sel = local.sel >= 0 && local.sel < state.machines.length ? local.sel : mineAt >= 0 ? mineAt : state.machines.findIndex((m) => m.load && isDone(m.load, now) && m.load.by !== me) >= 0 ? state.machines.findIndex((m) => m.load && isDone(m.load, now) && m.load.by !== me) : freeAt;
    const mc = sel >= 0 ? state.machines[sel]! : null;
    const n = state.machines.length;
    const mw = Math.min(84, (W - 24 - 8 * (n - 1)) / n);
    const x0 = (W - (mw * n + 8 * (n - 1))) / 2;
    const myPile = state.basket.find((b) => b.by === me);

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "up" || e.y < 30 || e.y > 172) return;
      const i = Math.floor((e.x - x0) / (mw + 8));
      if (i >= 0 && i < n && e.x - x0 - i * (mw + 8) <= mw) setLocal({ sel: i });
    };
    const say = (msg: string) => setLocal({ toast: local.toast + 1, msg });

    let line = state.place ? `${state.place} · tap a machine` : "Tap a machine";
    let action = null;
    if (myPile) {
      line = `${nm(myPile.mover, "Someone")} moved your load to the basket`;
      action = <Button kind="primary" onClick={() => { dispatch({ t: "claim" }); say("Got your stuff"); }}>Got my stuff</Button>;
    } else if (mc && !mc.load) {
      line = `${mc.name} is free · ${MINS[mc.kind]} min cycle`;
      action = <Button kind="primary" onClick={() => { haptic("success"); dispatch({ t: "start", m: sel }); say(`${mc.name} started · back in ${MINS[mc.kind]} min`); }}>Start mine</Button>;
    } else if (mc && mc.load) {
      const l = mc.load;
      const done = isDone(l, now);
      const owner = nm(l.by, l.name);
      if (l.by === me) {
        line = done ? `Your load in ${mc.name} is done${l.nudges ? ` · nudged ${l.nudges}` : ""}` : `Your load · ${minsLeft(l, now)} min left`;
        action = <Button kind={done ? "primary" : "secondary"} onClick={() => { dispatch({ t: "collect", m: sel }); say(`${mc.name} is free`); }}>{done ? "Got it" : "Take it out"}</Button>;
      } else if (!done) {
        line = `${owner}'s load · ${minsLeft(l, now)} min left`;
      } else if (sat(mc, now) >= state.grace) {
        line = `${owner}'s load has sat ${sat(mc, now)} min`;
        action = <Button kind="primary" onClick={() => { haptic("medium"); dispatch({ t: "move", m: sel }); say(`Moved ${owner}'s load to the basket`); }}>Move it out</Button>;
      } else {
        line = `${owner}'s load is done · moveable in ${state.grace - sat(mc, now)} min`;
        action = <Button kind="secondary" onClick={() => { dispatch({ t: "nudge", m: sel }); say(`Nudged ${owner}`); }}>{`Nudge ${owner}`}</Button>;
      }
    }

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${state.machines.filter((m) => !m.load).length} of ${n} free${state.place ? ` · ${state.place}` : ""}`} />
        <Canvas
          height={H}
          label={`Laundry room: ${state.machines.map((m) => `${m.name} ${m.load ? `${nm(m.load.by, m.load.name)}, ${isDone(m.load, now) ? "done" : `${minsLeft(m.load, now)} minutes left`}` : "free"}`).join("; ")}`}
          draw={(g, f) => drawRoom(g, f, state, me, sel, members, ctx)}
          onPointer={onPointer}
        />
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
          {action}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
