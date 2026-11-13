import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  Toast,
  haptic,
  mix,
  pal,
  rng,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// Try this here: someone posts from a new place asking what to eat or do. The few blocks around
// them drawn from above with a "you are here" dot; friends stick a pin with a few words; every
// "Same" makes a pin taller. The poster taps one and a dotted walking route draws to it.

type Kind = "food" | "coffee" | "sight" | "night" | "shop";
type Params = {
  /** Who posted: "Will" */
  author: string;
  /** Where they are: "Lima" */
  place: string;
  /** The post line: "in Lima for 3 days, what do i eat" */
  line: string;
  /** Is there water on one side (sea, river, lake) */
  water: boolean;
  /** Recs already pinned. kind: food, coffee, sight, night or shop. x and y in thousandths of the map (you are at 500, 560); same: who tapped Same */
  recs: { who: string; what: string; note?: string; kind: Kind; x?: number; y?: number; same?: string[] }[];
};

// @params
const P: Params = {
  author: "Will",
  place: "Lima",
  line: "in Lima for 3 days, what do i eat",
  water: true,
  recs: [
    { who: "Maya", what: "Ceviche at the market", note: "go before 1, it sells out", kind: "food", x: 260, y: 300, same: ["Tsai Lin", "Calvin"] },
    { who: "Calvin", what: "Churros at 2am", note: "ask me how i know", kind: "night", x: 700, y: 250, same: ["Arun"] },
    { who: "Tsai Lin", what: "Sunset at the cliffs", note: "the paragliders!!", kind: "sight", x: 800, y: 700, same: [] },
    { who: "Arun", what: "Find a rice cooker", note: "trust", kind: "shop", x: 180, y: 760, same: [] },
  ],
};
// @end params

type Rec = { id: string; who: string; name: string; what: string; note: string; kind: Kind; x: number; y: number; same: string[]; at: number };
type State = { author: string; authorName: string; place: string; line: string; water: boolean; recs: Rec[]; going: string; goingAt: number };
type Action = { t: "add"; what: string; kind: Kind; x: number; y: number } | { t: "same"; id: string } | { t: "go"; id: string };
type Local = { sel: string; adding: boolean; draft: string; kind: Kind; px: number; py: number; toast: number };

const KINDS: Kind[] = ["food", "coffee", "sight", "night", "shop"];
const KIND_NAME: Record<Kind, string> = { food: "Food", coffee: "Coffee", sight: "Sight", night: "Night out", shop: "Shop" };
const MAP_H = 196;
const HERE = { x: 500, y: 560 };
const MAX_RECS = 12;
const PER_PERSON = 3;
const hash = (s: string) => { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return x >>> 0; };
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okXY = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 40 && v <= 960;
const isKind = (v: unknown): v is Kind => typeof v === "string" && (KINDS as string[]).includes(v);
const minutes = (r: { x: number; y: number }) => 3 + Math.round((Math.abs(r.x - HERE.x) + Math.abs(r.y - HERE.y)) / 40);

function memberFor(ctx: Ctx, name: string): Member | undefined {
  const k = name.trim().toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k);
}
const idFor = (ctx: Ctx, name: string) => memberFor(ctx, name)?.id ?? `name:${name}`;

function initState(ctx: Ctx): State {
  const authorName = clean(P.author, 20) || "Someone";
  const recs: Rec[] = [];
  for (const [i, r] of (Array.isArray(P.recs) ? P.recs : []).slice(0, MAX_RECS).entries()) {
    const name = clean(r?.who, 20);
    const what = clean(r?.what, 32);
    if (!name || !what) continue;
    const s = rng(hash(what));
    const x = okXY(r.x) ? r.x! : 100 + s.int(800);
    const y = okXY(r.y) ? r.y! : 100 + s.int(800);
    const who = idFor(ctx, name);
    const same = [...new Set((Array.isArray(r.same) ? r.same : []).map((n) => clean(n, 20)).filter(Boolean).map((n) => idFor(ctx, n)))].filter((u) => u !== who);
    recs.push({ id: `p${i}`, who, name: memberFor(ctx, name)?.name ?? name, what, note: clean(r.note, 40), kind: isKind(r.kind) ? r.kind : "food", x, y, same, at: 0 });
  }
  return { author: idFor(ctx, authorName), authorName, place: clean(P.place, 24) || "here", line: clean(P.line, 60), water: P.water !== false, recs, going: "", goingAt: 0 };
}

const ranked = (s: State) => [...s.recs].sort((a, b) => b.same.length - a.same.length || a.at - b.at);

function icon(g: CanvasRenderingContext2D, kind: Kind, x: number, y: number) {
  // Each icon fits in about 12 px; drawn in the current stroke and fill.
  g.beginPath();
  if (kind === "food") {
    g.arc(x, y - 1, 5.5, 0, Math.PI);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(x - 1, y - 2);
    g.lineTo(x + 4, y - 7);
    g.moveTo(x + 1, y - 2);
    g.lineTo(x + 6, y - 6);
    g.stroke();
  } else if (kind === "coffee") {
    g.roundRect(x - 5, y - 4, 8, 8, 2);
    g.fill();
    g.beginPath();
    g.arc(x + 4, y, 2.5, -Math.PI / 2, Math.PI / 2);
    g.stroke();
  } else if (kind === "sight") {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 2.6 : 6;
      if (i === 0) g.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
      else g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    g.closePath();
    g.fill();
  } else if (kind === "night") {
    g.arc(x, y, 5.5, 0.6, Math.PI * 2 - 0.6);
    g.arc(x + 3, y - 0.5, 4, Math.PI * 2 - 0.9, 0.9, true);
    g.closePath();
    g.fill();
  } else {
    g.roundRect(x - 5, y - 3, 10, 8, 1.5);
    g.fill();
    g.beginPath();
    g.arc(x, y - 3, 3, Math.PI, 0);
    g.stroke();
  }
}

function drawMap(g: CanvasRenderingContext2D, f: DrawFrame, s: State, sel: string, draft: { x: number; y: number; kind: Kind } | null) {
  const t = f.theme, c = t.color, pl = pal(t), dark = t.mode === "dark";
  const W = f.width, H = MAP_H;
  const X = (x: number) => (x / 1000) * W, Y = (y: number) => (y / 1000) * H;
  const tt = f.now / 1000;
  g.fillStyle = dark ? mix(c.wash, pl.yellow, 0.1) : mix(c.card, pl.yellow, 0.16);
  g.beginPath();
  g.roundRect(0, 0, W, H, 12);
  g.fill();
  g.save();
  g.beginPath();
  g.roundRect(0, 0, W, H, 12);
  g.clip();
  // blocks of buildings
  const r = rng(hash(s.place));
  const bld = new Path2D();
  for (let bx = 0; bx < 5; bx++)
    for (let by = 0; by < 3; by++) {
      const x0 = X(bx * 200 + 30), y0 = Y(by * 333 + 40);
      for (let k = 0; k < 3; k++) bld.roundRect(x0 + k * X(52) + r.int(4), y0 + r.int(6), X(40), Y(90 + r.int(80)), 2);
    }
  g.fillStyle = dark ? mix(c.wash, c.text, 0.12) : mix(c.card, pl.orange, 0.22);
  g.fill(bld);
  // park
  g.fillStyle = dark ? mix(pl.green, c.wash, 0.55) : mix(pl.green, c.card, 0.55);
  g.beginPath();
  g.roundRect(X(420), Y(40), X(160), Y(260), 8);
  g.fill();
  g.fillStyle = dark ? mix(pl.green, c.wash, 0.3) : mix(pl.green, c.card, 0.25);
  g.beginPath();
  for (const [x, y] of [[450, 90], [520, 120], [470, 200], [545, 240], [500, 160]] as const) {
    g.moveTo(X(x) + 6, Y(y));
    g.arc(X(x), Y(y), 6, 0, Math.PI * 2);
  }
  g.fill();
  // streets: a grid and one diagonal avenue
  g.strokeStyle = dark ? mix(c.wash, c.text, 0.28) : c.card;
  g.lineCap = "round";
  g.lineWidth = 7;
  g.beginPath();
  for (const x of [200, 400, 600, 800]) {
    g.moveTo(X(x), 0);
    g.lineTo(X(x), H);
  }
  for (const y of [333, 666]) {
    g.moveTo(0, Y(y));
    g.lineTo(W, Y(y));
  }
  g.moveTo(X(0), Y(980));
  g.lineTo(X(420), Y(360));
  g.stroke();
  // water on the right
  if (s.water) {
    g.fillStyle = dark ? mix(pl.blue, c.wash, 0.55) : mix(pl.blue, c.card, 0.6);
    g.beginPath();
    g.moveTo(W, 0);
    g.lineTo(X(900), 0);
    for (let y = 0; y <= H; y += 8) g.lineTo(X(900) + Math.sin(y / 14 + tt * 0.8) * 4 + y * 0.08, y);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  }
  // a walking route to the chosen pin
  const goal = s.recs.find((q) => q.id === s.going);
  if (goal) {
    const k = Math.min(1, (running(s.goingAt, 1200) ?? 1200) / 1200);
    const ax = X(HERE.x), ay = Y(HERE.y), bx = X(goal.x), by = Y(goal.y);
    const l1 = Math.abs(bx - ax), l2 = Math.abs(by - ay), d = (l1 + l2) * k;
    g.strokeStyle = c.primary;
    g.lineWidth = 3;
    g.setLineDash([2, 6]);
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(ax + Math.sign(bx - ax) * Math.min(d, l1), ay);
    if (d > l1) g.lineTo(bx, ay + Math.sign(by - ay) * Math.min(d - l1, l2));
    g.stroke();
    g.setLineDash([]);
  }
  // you are here
  const q = 0.5 + 0.5 * Math.sin(tt * 3);
  g.fillStyle = mix(c.primary, c.card, 0.75);
  g.beginPath();
  g.arc(X(HERE.x), Y(HERE.y), 14 + 5 * q, 0, Math.PI * 2);
  g.fill();
  // pins: a stick as tall as the Sames, a head with the kind
  const all = [...s.recs].sort((a, b) => a.y - b.y);
  const heads: { x: number; y: number; kind: Kind; ring: string; big: boolean }[] = [];
  g.strokeStyle = dark ? c.text : mix(c.text, c.card, 0.3);
  g.lineWidth = 2;
  g.beginPath();
  for (const p of all) {
    const tall = 14 + Math.min(6, p.same.length) * 5;
    g.moveTo(X(p.x), Y(p.y));
    g.lineTo(X(p.x), Y(p.y) - tall);
    heads.push({ x: X(p.x), y: Y(p.y) - tall, kind: p.kind, ring: p.id === sel ? c.primary : userColor(p.who, t), big: p.id === sel });
  }
  if (draft) {
    g.moveTo(X(draft.x), Y(draft.y));
    g.lineTo(X(draft.x), Y(draft.y) - 14);
    heads.push({ x: X(draft.x), y: Y(draft.y) - 14, kind: draft.kind, ring: c.primary, big: true });
  }
  g.stroke();
  g.fillStyle = mix(c.text, c.card, 0.5);
  g.beginPath();
  for (const p of all) {
    g.moveTo(X(p.x) + 3, Y(p.y));
    g.ellipse(X(p.x), Y(p.y), 3, 1.5, 0, 0, Math.PI * 2);
  }
  g.fill();
  for (const h of heads) {
    const r = h.big ? 12 : 10;
    g.fillStyle = c.card;
    g.strokeStyle = h.ring;
    g.lineWidth = h.big ? 3 : 2.5;
    g.beginPath();
    g.arc(h.x, h.y, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = c.text;
    g.strokeStyle = c.text;
    g.lineWidth = 1.4;
    icon(g, h.kind, h.x, h.y);
  }
  g.restore();
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Try this here",
  summary: (s) => {
    const goal = s.recs.find((r) => r.id === s.going);
    if (goal) return `${s.authorName} is going to ${goal.what} · ${minutes(goal)} min walk`;
    const top = ranked(s)[0];
    return `What to do in ${s.place} · ${s.recs.length} ${s.recs.length === 1 ? "rec" : "recs"}${top ? ` · ${top.what} leads` : ""}`;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    const u = meta.user;
    if (a.t === "add") {
      const what = clean(a.what, 32);
      if (!what || !isKind(a.kind) || !okXY(a.x) || !okXY(a.y) || u === s.author) return s;
      if (s.recs.length >= MAX_RECS || s.recs.filter((r) => r.who === u).length >= PER_PERSON) return s;
      const name = clean(ctx.members.find((m) => m.id === u)?.name, 20) || "Friend";
      return { ...s, recs: [...s.recs, { id: `r${meta.seq}`, who: u, name, what, note: "", kind: a.kind, x: a.x, y: a.y, same: [], at: meta.time }] };
    }
    if (a.t === "same") {
      const r = s.recs.find((q) => q.id === a.id);
      if (!r || r.who === u) return s;
      const same = r.same.includes(u) ? r.same.filter((x) => x !== u) : [...r.same, u];
      return { ...s, recs: s.recs.map((q) => (q === r ? { ...q, same } : q)) };
    }
    if (a.t === "go") {
      if (u !== s.author || s.going === a.id || !s.recs.some((q) => q.id === a.id)) return s;
      return { ...s, going: a.id, goingAt: meta.time };
    }
    return s;
  },

  invariants: {
    "rec ids are unique": (s) => new Set(s.recs.map((r) => r.id)).size === s.recs.length,
    "pins sit on the map": (s) => s.recs.every((r) => okXY(r.x) && okXY(r.y) && isKind(r.kind) && r.what.length > 0),
    "a Same is one person once, never your own": (s) => s.recs.every((r) => new Set(r.same).size === r.same.length && !r.same.includes(r.who)),
    "the chosen pin exists": (s) => s.going === "" || s.recs.some((r) => r.id === s.going),
    "the poster never pins": (s) => s.recs.every((r) => r.who !== s.author || r.at === 0),
    "a few recs each, a dozen in all": (s) => s.recs.length <= MAX_RECS && s.recs.every((r) => r.at === 0 || s.recs.filter((q) => q.who === r.who).length <= PER_PERSON),
  },

  transitions: {
    "an add puts my pin where I tapped": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const r = n.recs[n.recs.length - 1];
      return n.recs.length === p.recs.length + 1 && !!r && r.who === m.user && r.x === a.x && r.y === a.y && r.kind === a.kind && r.what === clean(a.what, 32) && r.same.length === 0 && p.recs.every((q, i) => n.recs[i] === q);
    },
    "a Same toggles only me on one pin": (p, n, a, m) => {
      if (a.t !== "same" || p === n) return true;
      return p.recs.every((q, i) => {
        const r = n.recs[i]!;
        if (q.id !== a.id) return r === q;
        return r.id === q.id && Math.abs(r.same.length - q.same.length) === 1 && r.same.includes(m.user) !== q.same.includes(m.user) && r.same.filter((x) => x !== m.user).join() === q.same.filter((x) => x !== m.user).join();
      }) && n.recs.length === p.recs.length;
    },
    "a Same from a friend lands": (p, n, a, m, ctx) => a.t !== "same" || !inChat(ctx, m.user) || !p.recs.some((r) => r.id === a.id && r.who !== m.user) || p !== n,
    "only the poster picks where to go": (p, n, a, m) => a.t !== "go" || p === n || (m.user === p.author && n.going === a.id && n.goingAt === m.time && n.recs === p.recs),
    "the poster's pick lands": (p, n, a, m, ctx) => a.t !== "go" || m.user !== p.author || !inChat(ctx, m.user) || p.going === a.id || !p.recs.some((r) => r.id === a.id) || n.going === a.id,
    "no rec is ever lost": (p, n) => p.recs.every((r) => n.recs.some((q) => q.id === r.id && q.what === r.what && q.x === r.x)),
    "the post never changes": (p, n) => p.author === n.author && p.place === n.place && p.line === n.line && p.water === n.water,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const pick = s.recs.length ? r.pick(s.recs).id : "p0";
    if (user === s.author) return { t: "go", id: pick };
    const x = r.next();
    if (x < 0.45) return { t: "add", what: r.pick(["Tacos al pastor", "The night market", "Rooftop bar", "Old town walk"]), kind: r.pick(KINDS), x: 40 + r.int(921), y: 40 + r.int(921) };
    if (x < 0.95) return { t: "same", id: pick };
    return { t: "go", id: pick };
  },

  local: { sel: "", adding: false, draft: "", kind: "food", px: 300, py: 450, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const isAuthor = me === state.author;
    const top = ranked(state)[0];
    const sel = state.recs.find((r) => r.id === local.sel) ?? state.recs.find((r) => r.id === state.going) ?? top;
    const person = (id: string, name: string): Member => members.find((m) => m.id === id) ?? { id, name };
    const goal = state.recs.find((r) => r.id === state.going);
    const mineCount = state.recs.filter((r) => r.who === me).length;
    const canAdd = !isAuthor && mineCount < PER_PERSON && state.recs.length < MAX_RECS;
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "up" && !(local.adding && e.type === "move")) return;
      const x = Math.max(40, Math.min(960, Math.round((e.x / W) * 1000)));
      const y = Math.max(40, Math.min(960, Math.round((e.y / MAP_H) * 1000)));
      if (local.adding) return setLocal({ px: x, py: y });
      let best = "", bd = 900;
      for (const r of state.recs) {
        const tall = 14 + Math.min(6, r.same.length) * 5;
        const dx = (r.x / 1000) * W - e.x, dy = (r.y / 1000) * MAP_H - tall - e.y;
        if (dx * dx + dy * dy < bd) {
          bd = dx * dx + dy * dy;
          best = r.id;
        }
      }
      if (best) setLocal({ sel: best });
    };
    const submit = () => {
      if (!clean(local.draft, 32)) return;
      dispatch({ t: "add", what: clean(local.draft, 32), kind: local.kind, x: local.px, y: local.py });
      setLocal({ adding: false, draft: "", toast: local.toast + 1 });
      haptic("success");
    };
    const iSame = !!sel && sel.same.includes(me);

    return (
      <div>
        <CardHeader title={`What to do in ${state.place}`} subtitle={state.line ? `${state.authorName}: “${state.line}”` : `${state.recs.length} recs`} />
        <div style={{ position: "relative", height: MAP_H }}>
          <Canvas
            height={MAP_H}
            drag={local.adding}
            label={`Map around ${state.authorName} in ${state.place} with ${state.recs.length} pinned recs${goal ? `; route to ${goal.what}` : ""}`}
            draw={(g, f) => drawMap(g, f, state, sel?.id ?? "", local.adding ? { x: local.px, y: local.py, kind: local.kind } : null)}
            onPointer={onPointer}
          />
          <div style={{ position: "absolute", left: (HERE.x / 1000) * W - 11, top: (HERE.y / 1000) * MAP_H - 11, pointerEvents: "none" }}>
            <Avatar user={person(state.author, state.authorName)} size={22} />
          </div>
          {goal && running(state.goingAt, 1200) === null ? (
            <div style={{ position: "absolute", right: 8, bottom: 8, padding: "2px 10px", borderRadius: 999, background: c.primary, color: c.onPrimary, fontSize: 12, lineHeight: "18px", fontWeight: 700, pointerEvents: "none" }}>{`${minutes(goal)} min walk`}</div>
          ) : null}
          {state.recs.length === 0 && !local.adding ? (
            <div style={{ position: "absolute", left: 8, bottom: 8, padding: "2px 10px", borderRadius: 999, background: c.card, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, pointerEvents: "none" }}>No pins yet · drop the first one</div>
          ) : local.adding ? (
            <div style={{ position: "absolute", left: 8, bottom: 8, padding: "2px 10px", borderRadius: 999, background: c.card, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, pointerEvents: "none" }}>Tap the map to place it</div>
          ) : null}
        </div>

        {local.adding ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={KIND_NAME[k]}
                  onClick={() => setLocal({ kind: k })}
                  style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 8, border: `1.5px solid ${local.kind === k ? c.primary : c.divider}`, background: local.kind === k ? c.selected : c.card, color: c.text, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 2px" }}
                >
                  {KIND_NAME[k]}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={local.draft}
                placeholder="Ceviche at the market"
                maxLength={32}
                onInput={(e: { currentTarget: { value: string } }) => setLocal({ draft: e.currentTarget.value })}
                onKeyDown={(e: { key: string }) => (e.key === "Enter" ? submit() : undefined)}
                style={{ flex: 1, minWidth: 0 }}
                aria-label="Your rec"
              />
              <Button kind="primary" disabled={!clean(local.draft, 32)} onClick={submit}>
                Pin it
              </Button>
            </div>
          </div>
        ) : sel ? (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, background: c.wash, minHeight: 60, boxSizing: "border-box" }}>
            <Avatar user={person(sel.who, sel.name)} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sel.what}</div>
              <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {`${sel.who === me ? "You" : sel.name.split(" ")[0]}${sel.note ? `: “${sel.note}”` : ""} · ${minutes(sel)} min`}
              </div>
            </div>
            {sel.same.length ? <Facepile users={sel.same.map((u) => person(u, members.find((m) => m.id === u)?.name ?? u.replace(/^name:/, "")))} max={3} size={18} /> : null}
            {!isAuthor && sel.who !== me ? (
              <Button kind={iSame ? "secondary" : "deemphasized"} onClick={() => { dispatch({ t: "same", id: sel.id }); haptic("light"); }}>
                {iSame ? `Same · ${sel.same.length}` : "Same"}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {goal ? `${goal.who === me ? "Your" : `${goal.name.split(" ")[0]}'s`} pick won · ${state.authorName} is going` : state.recs.length ? `${state.recs.length} pinned · tap a pin to see it` : `Tell ${state.authorName} where to go`}
          </span>
          {isAuthor && sel ? (
            <Button kind="primary" disabled={state.going === sel.id} onClick={() => { dispatch({ t: "go", id: sel.id }); haptic("success"); }}>
              {state.going === sel.id ? "Going" : "Go here"}
            </Button>
          ) : local.adding ? (
            <Button kind="deemphasized" onClick={() => setLocal({ adding: false })}>
              Cancel
            </Button>
          ) : canAdd ? (
            <Button kind="primary" onClick={() => setLocal({ adding: true, sel: "" })}>
              Add a rec
            </Button>
          ) : null}
        </div>
        {local.toast > 0 && !local.adding ? <Toast key={local.toast}>Pinned</Toast> : null}
      </div>
    );
  },
});
