import {
  defineApp,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  Locked,
  Toast,
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

// Quiet clock: a 24-hour clock with each roommate's sleep as a ring in their color. Where everyone
// is asleep at once, the clock darkens into quiet hours. Drag the ends of your ring to fix your
// sleep; when everyone agrees, the quiet hours get pinned as the house rule.

type Params = {
  /** Card title */
  title: string;
  /** Under the title: the standoff in the chat's words */
  sub: string;
  /** Each person's sleep, "23:30" to "6:00" style 24-hour times, with a note about it */
  sleep: { who: string; from: string; to: string; note?: string }[];
  /** Who already agreed */
  agreed: string[];
};

// @params
const P: Params = {
  title: "Quiet hours",
  sub: "Calvin's 6am alarms (all seven) vs Will's 1am guitar",
  sleep: [
    { who: "Calvin", from: "23:00", to: "6:00", note: "seven alarms from 6" },
    { who: "Arun", from: "0:00", to: "7:30" },
    { who: "Aditya", from: "0:30", to: "8:00", note: "lowkey a night owl" },
    { who: "Will", from: "1:00", to: "9:00", note: "guitar till 1" },
  ],
  agreed: ["Arun"],
};
// @end params

type Ring = { id: string; name: string; from: number; to: number; note: string };
type State = { title: string; sub: string; rings: Ring[]; agreed: string[]; pinned: boolean; at: number };
type Action = { t: "set"; from: number; to: number } | { t: "agree" } | { t: "unpin" };
type Local = { edge: "" | "from" | "to"; from: number; to: number; dirty: boolean; toast: number; msg: string };

const N = 96; // 15-minute slots in a day
const H = 252;
const CY = 124;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const first = (n: string) => n.split(" ")[0] ?? n;
const okSlot = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < N;
const parse = (v: unknown, d: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clean(v, 5));
  if (!m) return d;
  const h = Number(m[1]);
  const q = Math.round(Number(m[2]) / 15);
  return h > 23 ? d : (h * 4 + q) % N;
};
const label = (slot: number) => {
  const h = Math.floor(slot / 4) % 24;
  const m = (slot % 4) * 15;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
};
const asleep = (r: Ring, k: number) => (r.from <= r.to ? k >= r.from && k < r.to : k >= r.from || k < r.to);
/** The longest stretch, wrapping past midnight, when every ring is asleep. */
function quiet(rings: Ring[]): { from: number; to: number } | null {
  if (!rings.length) return null;
  const all = Array.from({ length: N }, (_, k) => rings.every((r) => asleep(r, k)));
  if (all.every(Boolean)) return { from: 0, to: 0 };
  let best: { from: number; len: number } | null = null;
  const start = all.indexOf(false);
  let run = 0;
  let from = -1;
  for (let i = 1; i <= N; i++) {
    const k = (start + i) % N;
    if (all[k]) {
      if (run === 0) from = k;
      run++;
      if (!best || run > best.len) best = { from, len: run };
    } else run = 0;
  }
  return best ? { from: best.from, to: (best.from + best.len) % N } : null;
}
const needed = (s: State, ctx: Ctx) => s.rings.filter((r) => inChat(ctx, r.id)).map((r) => r.id);
const allAgree = (s: State, agreed: string[], ctx: Ctx) => {
  const n = needed(s, ctx);
  return n.length > 0 && n.every((u) => agreed.includes(u)) && quiet(s.rings) !== null;
};
const span = (from: number, to: number) => (to - from + N) % N;

function initState(ctx: Ctx): State {
  const rings: Ring[] = [];
  for (const raw of Array.isArray(P.sleep) ? P.sleep : []) {
    const who = clean(raw?.who, 24);
    if (!who || rings.length >= 6) continue;
    const m = ctx.members.find((x) => x.id === who || x.name.toLowerCase() === who.toLowerCase());
    const id = m ? m.id : `?${who.toLowerCase()}`;
    if (rings.some((r) => r.id === id)) continue;
    const from = parse(raw?.from, 0);
    let to = parse(raw?.to, 32);
    if (to === from) to = (from + 32) % N;
    rings.push({ id, name: m ? m.name : who, from, to, note: clean(raw?.note, 32) });
  }
  const agreed = [...new Set((Array.isArray(P.agreed) ? P.agreed : []).map((w) => rings.find((r) => r.name.toLowerCase() === clean(w, 24).toLowerCase() && inChat(ctx, r.id))?.id).filter((x): x is string => !!x))];
  const s: State = { title: clean(P.title, 30) || "Quiet hours", sub: clean(P.sub, 64), rings, agreed, pinned: false, at: 0 };
  return { ...s, pinned: allAgree(s, agreed, ctx) };
}

function reduceQ(s: State, a: Action, meta: Meta, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u)) return s;
  if (a.t === "set") {
    if (!okSlot(a.from) || !okSlot(a.to) || a.from === a.to || span(a.from, a.to) > 64) return s;
    const name = ctx.members.find((m) => m.id === u)?.name ?? "";
    const has = s.rings.some((r) => r.id === u);
    if (!has && s.rings.length >= 6) return s;
    const rings = has ? s.rings.map((r) => (r.id === u ? { ...r, from: a.from, to: a.to } : r)) : [...s.rings, { id: u, name, from: a.from, to: a.to, note: "" }];
    const next = { ...s, rings, agreed: [u], at: meta.time };
    return { ...next, pinned: allAgree(next, next.agreed, ctx) };
  }
  if (a.t === "agree") {
    if (s.pinned || s.agreed.includes(u) || !s.rings.some((r) => r.id === u) || quiet(s.rings) === null) return s;
    const agreed = [...s.agreed, u];
    const pinned = allAgree(s, agreed, ctx);
    return { ...s, agreed, pinned, at: pinned ? meta.time : s.at };
  }
  if (a.t === "unpin") {
    if (!s.pinned) return s;
    return { ...s, pinned: false, agreed: [], at: meta.time };
  }
  return s;
}

const angle = (slot: number) => -Math.PI / 2 + (slot / N) * Math.PI * 2;
const ringR = (i: number, n: number) => 94 - i * Math.min(13, 56 / Math.max(1, n - 1));

function drawClock(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, draft: { from: number; to: number } | null, members: readonly Member[], ctx: Ctx) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const W = f.width;
  const cx = W / 2;
  const dark = t.mode === "dark";
  const rings = s.rings.map((r) => (r.id === me && draft ? { ...r, ...draft } : r));
  const q = quiet(rings);
  // face
  g.fillStyle = dark ? mix(c.wash, c.card, 0.5) : c.wash;
  g.beginPath();
  g.arc(cx, CY, 112, 0, Math.PI * 2);
  g.fill();
  // the quiet wedge: night where everyone sleeps
  if (q) {
    const night = dark ? mix(p.blue, c.wash, 0.55) : mix(p.blue, c.text, 0.62);
    g.fillStyle = night;
    g.beginPath();
    g.moveTo(cx, CY);
    if (q.from === q.to) g.arc(cx, CY, 108, 0, Math.PI * 2);
    else g.arc(cx, CY, 108, angle(q.from), angle(q.to));
    g.closePath();
    g.fill();
    // a few stars in it
    g.fillStyle = mix(night, p.cream, 0.8);
    const L = span(q.from, q.to) || N;
    g.beginPath();
    for (let k = 0; k < Math.min(7, Math.ceil(L / 4)); k++) {
      const a = angle(q.from + ((k + 0.5) / Math.min(7, Math.ceil(L / 4))) * L);
      const rr = 100 + (k % 2) * 4;
      g.moveTo(cx + Math.cos(a) * rr + 1.5, CY + Math.sin(a) * rr);
      g.arc(cx + Math.cos(a) * rr, CY + Math.sin(a) * rr, 1.5, 0, Math.PI * 2);
    }
    g.fill();
  }
  // hour ticks and labels
  g.strokeStyle = c.divider;
  g.lineWidth = 1.5;
  g.beginPath();
  for (let h = 0; h < 24; h++) {
    const a = angle(h * 4);
    const r0 = h % 6 === 0 ? 102 : 106;
    g.moveTo(cx + Math.cos(a) * r0, CY + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * 110, CY + Math.sin(a) * 110);
  }
  g.stroke();
  g.fillStyle = c.secondaryText;
  g.font = `600 11px ${t.type.family}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const [h, lab] of [[0, "12a"], [6, "6a"], [12, "12p"], [18, "6p"]] as const) {
    const a = angle(h * 4);
    g.fillText(lab, cx + Math.cos(a) * 124, CY + Math.sin(a) * 118);
  }
  // rings
  g.lineCap = "round";
  rings.forEach((r, i) => {
    const rr = ringR(i, rings.length);
    g.strokeStyle = mix(c.divider, c.wash, 0.3);
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, CY, rr, 0, Math.PI * 2);
    g.stroke();
    const known = inChat(ctx, r.id);
    g.strokeStyle = known ? userColor(r.id, t) : c.secondaryText;
    g.lineWidth = r.id === me ? 10 : 8;
    g.beginPath();
    g.arc(cx, CY, rr, angle(r.from), angle(r.to));
    g.stroke();
  });
  g.lineCap = "butt";
  // faces at the bedtime end; handles on mine
  rings.forEach((r, i) => {
    const rr = ringR(i, rings.length);
    const known = inChat(ctx, r.id);
    const a = angle(r.from);
    const fx = cx + Math.cos(a) * rr;
    const fy = CY + Math.sin(a) * rr;
    g.beginPath();
    g.arc(fx, fy, 8.5, 0, Math.PI * 2);
    g.fillStyle = known ? userColor(r.id, t) : c.secondaryButton;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = r.id === me ? c.primary : c.card;
    g.stroke();
    g.fillStyle = known ? c.onPrimary : c.secondaryButtonText;
    g.font = `700 9px ${t.type.family}`;
    g.fillText((members.find((m) => m.id === r.id)?.name ?? r.name)[0]?.toUpperCase() ?? "?", fx, fy + 0.5);
    if (r.id === me) {
      const b = angle(r.to);
      const hx = cx + Math.cos(b) * rr;
      const hy = CY + Math.sin(b) * rr;
      g.beginPath();
      g.arc(hx, hy, 8, 0, Math.PI * 2);
      g.fillStyle = c.card;
      g.fill();
      g.lineWidth = 2.5;
      g.strokeStyle = c.primary;
      g.stroke();
    }
  });
  // center: the quiet hours
  const inner = ringR(rings.length - 1, rings.length) - 12;
  g.fillStyle = c.card;
  g.beginPath();
  g.arc(cx, CY, Math.max(30, inner), 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.secondaryText;
  g.font = `500 11px ${t.type.family}`;
  g.fillText(s.pinned ? "house rule" : "quiet", cx, CY - 13);
  const big = q ? (q.from === q.to ? "all day" : `${label(q.from)}–${label(q.to)}`) : "none yet";
  const fb = fitText(big, Math.max(52, inner * 2 - 8), { g, size: 15, min: 10, weight: 700 });
  g.font = fb.font;
  g.fillStyle = c.text;
  g.fillText(fb.text, cx, CY + 4);
  if (q && q.from !== q.to) {
    const hrs = span(q.from, q.to) / 4;
    g.font = `500 11px ${t.type.family}`;
    g.fillStyle = c.secondaryText;
    g.fillText(`${hrs} hr${hrs === 1 ? "" : "s"}`, cx, CY + 20);
  }
}

export default defineApp<State, Action, Local>({
  name: "Quiet clock",
  summary: (s, ctx) => {
    const q = quiet(s.rings);
    const qs = q ? (q.from === q.to ? "all day" : `${label(q.from)}–${label(q.to)}`) : "no overlap";
    return s.pinned ? `${s.title}: pinned ${qs}` : `${s.title}: ${qs} · ${s.agreed.length} of ${needed(s, ctx).length} agree`;
  },
  init: initState,
  reduce: reduceQ,
  onMembers: (s, ctx) => {
    const agreed = s.agreed.filter((u) => inChat(ctx, u) && s.rings.some((r) => r.id === u));
    return { ...s, agreed, pinned: s.pinned && allAgree(s, agreed, ctx) };
  },

  invariants: {
    "sleep is in slots and never zero length": (s) => s.rings.every((r) => okSlot(r.from) && okSlot(r.to) && r.from !== r.to),
    "one ring each": (s) => new Set(s.rings.map((r) => r.id)).size === s.rings.length && s.rings.length <= 6,
    "agreements are from ring holders in the chat": (s, ctx) => new Set(s.agreed).size === s.agreed.length && s.agreed.every((u) => inChat(ctx, u) && s.rings.some((r) => r.id === u)),
    "pinned means everyone agreed on real quiet hours": (s, ctx) => !s.pinned || allAgree(s, s.agreed, ctx),
  },

  transitions: {
    "setting moves only your ring": (p, n, a, m) =>
      a.t !== "set" || p === n || (n.rings.find((r) => r.id === m.user)?.from === a.from && n.rings.find((r) => r.id === m.user)?.to === a.to && n.rings.filter((r) => r.id !== m.user).every((r) => JSON.stringify(r) === JSON.stringify(p.rings.find((x) => x.id === r.id)))),
    "a new sleep restarts agreeing": (p, n, a, m) => a.t !== "set" || p === n || (n.agreed.length === 1 && n.agreed[0] === m.user && n.at === m.time),
    "a valid sleep is taken": (p, n, a, m, ctx) =>
      a.t !== "set" || !inChat(ctx, m.user) || !okSlot(a.from) || !okSlot(a.to) || a.from === a.to || span(a.from, a.to) > 64 || (!p.rings.some((r) => r.id === m.user) && p.rings.length >= 6) || n.rings.some((r) => r.id === m.user && r.from === a.from && r.to === a.to),
    "agree adds the sender once": (p, n, a, m) => a.t !== "agree" || p === n || (!p.agreed.includes(m.user) && n.agreed.length === p.agreed.length + 1 && n.agreed.includes(m.user) && JSON.stringify(n.rings) === JSON.stringify(p.rings)),
    "it pins when the last one agrees": (p, n, a, _m, ctx) => (a.t !== "agree" && a.t !== "set") || p === n || n.pinned === allAgree(n, n.agreed, ctx),
    "pinning stamps the time": (p, n, a, m) => a.t !== "agree" || p === n || (n.pinned ? n.at === m.time : n.at === p.at),
    "unpin needs a pin and clears it": (p, n, a, m, ctx) => a.t !== "unpin" || !inChat(ctx, m.user) || (p.pinned ? !n.pinned && n.agreed.length === 0 : JSON.stringify(p) === JSON.stringify(n)),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.pinned) return r.next() < 0.5 ? { t: "unpin" } : { t: "agree" };
    if (r.next() < 0.45 && s.rings.some((x) => x.id === user)) return { t: "agree" };
    const from = (84 + r.int(24)) % N;
    return { t: "set", from, to: (from + 20 + r.int(20)) % N };
  },

  local: { edge: "", from: 0, to: 0, dirty: false, toast: 0, msg: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const ctx: Ctx = { room: "", members };
    const W = theme.width - 2 * theme.space.card;
    const cx = W / 2;
    const mineIdx = state.rings.findIndex((r) => r.id === me);
    const mine = mineIdx >= 0 ? state.rings[mineIdx]! : null;
    const draft = local.dirty ? { from: local.from, to: local.to } : null;
    const shown = state.rings.map((r) => (r.id === me && draft ? { ...r, ...draft } : r));
    const q = quiet(shown);
    const need = needed(state, ctx);
    const yes = state.agreed.filter((u) => need.includes(u));
    const qs = q ? (q.from === q.to ? "all day" : `${label(q.from)}–${label(q.to)}`) : "";

    const slotAt = (x: number, y: number) => {
      let a = Math.atan2(y - CY, x - cx) + Math.PI / 2;
      if (a < 0) a += Math.PI * 2;
      return Math.round((a / (Math.PI * 2)) * N) % N;
    };
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (state.pinned) return;
      const base = draft ?? (mine ? { from: mine.from, to: mine.to } : { from: 0, to: 32 });
      const idx = mineIdx >= 0 ? mineIdx : state.rings.length;
      const rr = ringR(idx, Math.max(state.rings.length, idx + 1));
      if (e.type === "down") {
        const d = (k: number) => Math.hypot(e.x - (cx + Math.cos(angle(k)) * rr), e.y - (CY + Math.sin(angle(k)) * rr));
        const df = d(base.from);
        const dt = d(base.to);
        if (Math.min(df, dt) > 26) return;
        setLocal({ edge: df < dt ? "from" : "to", from: base.from, to: base.to, dirty: true });
        return;
      }
      if (!local.edge) return;
      const k = slotAt(e.x, e.y);
      const next = local.edge === "from" ? { from: k, to: local.to } : { from: local.from, to: k };
      if (next.from === next.to || span(next.from, next.to) > 64) return;
      if (next.from !== local.from || next.to !== local.to) haptic("light");
      setLocal({ ...next, edge: e.type === "up" ? "" : local.edge });
    };

    const changed = !!draft && (!mine || draft.from !== mine.from || draft.to !== mine.to);
    let action;
    if (state.pinned) action = <Button kind="secondary" onClick={() => dispatch({ t: "unpin" })}>Unpin</Button>;
    else if (changed)
      action = (
        <Button kind="primary" onClick={() => { haptic("medium"); dispatch({ t: "set", from: draft!.from, to: draft!.to }); setLocal({ dirty: false, toast: local.toast + 1, msg: `Your sleep: ${label(draft!.from)}–${label(draft!.to)}` }); }}>
          Save my sleep
        </Button>
      );
    else if (!mine)
      action = (
        <Button kind="primary" onClick={() => setLocal({ dirty: true, from: 0, to: 32, edge: "" })}>
          Add my sleep
        </Button>
      );
    else if (!state.agreed.includes(me) && q)
      action = (
        <Button kind="primary" onClick={() => { haptic("success"); dispatch({ t: "agree" }); setLocal({ toast: local.toast + 1, msg: `You agreed to ${qs}` }); }}>
          Agree
        </Button>
      );
    else action = <Button kind="secondary" disabled>{q ? "Agreed" : "Agree"}</Button>;

    // who sets each edge of the quiet hours
    const starter = q ? shown.find((r) => r.from === q.from) : undefined;
    const ender = q ? shown.find((r) => r.to === q.to) : undefined;
    const nameOf = (r: Ring) => (r.id === me ? "your" : `${first(members.find((m) => m.id === r.id)?.name ?? r.name)}'s`);
    const why = local.edge
      ? `${label(local.from)} to ${label(local.to)} · let go to place it`
      : changed
        ? `You: ${label(draft!.from)} to ${label(draft!.to)}`
        : q && starter && ender && q.from !== q.to
          ? `Starts at ${nameOf(starter)} bedtime${starter.note ? ` (${starter.note})` : ""} · ends at ${nameOf(ender)} wake-up${ender.note ? ` (${ender.note})` : ""}`
          : mine
            ? "Drag the ends of your ring"
            : "Add your sleep to the clock";

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub || "When everyone's asleep, it's quiet"} />
        <Canvas
          height={H}
          drag
          label={`24-hour clock with ${shown.length} sleep rings; quiet hours ${qs || "none yet"}`}
          draw={(g, f) => drawClock(g, f, state, me, draft, members, ctx)}
          onPointer={onPointer}
        />
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{why}</div>
        {state.pinned ? (
          <div style={{ marginTop: 8 }}>
            <Locked detail={`${need.length} agreed`}>{`Quiet ${qs}`}</Locked>
          </div>
        ) : null}
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {yes.length ? <Facepile users={yes} max={4} size={22} /> : null}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {state.pinned ? "Pinned to the chat" : q ? `${yes.length} of ${need.length} agree` : "No overlap yet"}
          </span>
          {action}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
