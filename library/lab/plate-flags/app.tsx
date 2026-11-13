import { defineApp, Avatar, Button, Canvas, CardHeader, Toast, haptic, mix, pal, rng, userColor, type Ctx, type DrawFrame, type Member, type Theme } from "@muse/app";

// Plate flags: someone posts what they're eating. The plate drawn from above, toppings and all;
// friends stick a toothpick flag into it with how badly they want it (1 to 5 chillies) and a word.
// The flags crowd the plate; the hungriest corner is obvious.

type Dish = "tostada" | "noodles" | "pizza" | "cake";
type Params = {
  /** Who posted: "Tsai Lin" */
  author: string;
  /** What it is, in their words: "first tostada of the trip" */
  title: string;
  /** Which dish to draw: tostada, noodles, pizza or cake */
  dish: Dish;
  /** Where: "a market stall in Cusco" */
  place: string;
  /** Flags already in: heat 1 to 5 chillies, a word or two; slot 0 to 9 is optional (even slots lean left, odd right) */
  flags: { who: string; heat: number; word?: string; slot?: number }[];
};

// @params
const P: Params = {
  author: "Tsai Lin",
  title: "first tostada of the trip",
  dish: "tostada",
  place: "a market stall in Cusco",
  flags: [
    { who: "Will", heat: 5, word: "JEALOUS", slot: 0 },
    { who: "Maya", heat: 4, word: "recipe pls", slot: 3 },
    { who: "Arun", heat: 3, word: "rice cooker could", slot: 6 },
    { who: "Calvin", heat: 5, word: "for breakfast??", slot: 5 },
  ],
};
// @end params

type Flag = { who: string; name: string; slot: number; heat: number; word: string; at: number };
type State = { author: string; authorName: string; title: string; dish: Dish; place: string; flags: Flag[] };
type Action = { t: "stick"; slot: number; heat: number; word: string } | { t: "pull" };
type Local = { slot: number; placed: boolean; heat: number; word: string; toast: number };

const DISHES: Dish[] = ["tostada", "noodles", "pizza", "cake"];
const PLATE_H = 222;
const MAX = 10;
/** Sockets around the middle of the plate, in px from its centre; even ones lean left, odd ones right. */
const SOCKETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ dx: (i % 2 ? 1 : -1) * (14 + ((i >> 1) % 2) * 26), dy: -40 + (i >> 1) * 30 }));
const okSlot = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < MAX;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okHeat = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
const avg = (s: State) => (s.flags.length ? Math.round((s.flags.reduce((n, f) => n + f.heat, 0) * 10) / s.flags.length) / 10 : 0);

function memberFor(ctx: Ctx, name: string): Member | undefined {
  const k = name.trim().toLowerCase();
  return ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k);
}

function initState(ctx: Ctx): State {
  const authorName = clean(P.author, 20) || "Someone";
  const author = memberFor(ctx, authorName)?.id ?? `name:${authorName}`;
  const flags: Flag[] = [];
  for (const f of Array.isArray(P.flags) ? P.flags : []) {
    const name = clean(f?.who, 20);
    if (!name || !okHeat(f.heat) || flags.length >= MAX) continue;
    const m = memberFor(ctx, name);
    const who = m?.id ?? `name:${name}`;
    if (who === author || flags.some((q) => q.who === who)) continue;
    const want = okSlot(f.slot) && !flags.some((q) => q.slot === f.slot) ? f.slot : SOCKETS.findIndex((_, i) => !flags.some((q) => q.slot === i));
    flags.push({ who, name: m?.name ?? name, slot: want, heat: f.heat, word: clean(f.word, 18), at: 0 });
  }
  return { author, authorName, title: clean(P.title, 48) || "look what i'm eating", dish: (DISHES as string[]).includes(P.dish) ? P.dish : "tostada", place: clean(P.place, 32), flags };
}

function drawDish(g: CanvasRenderingContext2D, t: Theme, dish: Dish, cx: number, cy: number, R: number) {
  const p = pal(t), c = t.color;
  const r = rng(7);
  const dot = (col: string, n: number, rad: number, rr: number) => {
    g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = r.next() * Math.PI * 2, d = Math.sqrt(r.next()) * rad;
      g.moveTo(cx + Math.cos(a) * d + rr, cy + Math.sin(a) * d);
      g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, Math.PI * 2);
    }
    g.fill();
  };
  if (dish === "tostada") {
    g.fillStyle = p.crust;
    g.strokeStyle = mix(p.crust, c.text, 0.3);
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2, rr = R * 0.74 * (1 + 0.03 * Math.sin(i * 3.1));
      if (i === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = p.brown;
    g.beginPath();
    g.ellipse(cx, cy, R * 0.6, R * 0.56, 0.3, 0, Math.PI * 2);
    g.fill();
    // lettuce shreds
    g.strokeStyle = p.green;
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    for (let i = 0; i < 46; i++) {
      const a = r.next() * Math.PI * 2, d = Math.sqrt(r.next()) * R * 0.5, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, b = r.next() * Math.PI;
      g.moveTo(x - Math.cos(b) * 6, y - Math.sin(b) * 6);
      g.lineTo(x + Math.cos(b) * 6, y + Math.sin(b) * 6);
    }
    g.stroke();
    dot(p.red, 14, R * 0.5, 4.5);
    // avocado
    g.fillStyle = mix(p.green, p.yellow, 0.5);
    g.beginPath();
    for (const [dx, dy, a] of [[-0.2, 0.15, 0.4], [0.18, -0.2, 2.2], [0.25, 0.22, 4]] as const) {
      g.moveTo(cx + dx * R, cy + dy * R);
      g.ellipse(cx + dx * R, cy + dy * R, 14, 6, a, 0, Math.PI * 2);
    }
    g.fill();
    // crema drizzle
    g.strokeStyle = p.cream;
    g.lineWidth = 2.5;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const x = cx - R * 0.46 + (i / 40) * R * 0.92, y = cy + Math.sin(i * 0.45) * R * 0.16 + (i / 40 - 0.5) * R * 0.3;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  } else if (dish === "noodles") {
    g.fillStyle = mix(p.orange, p.cream, 0.4);
    g.beginPath();
    g.arc(cx, cy, R * 0.72, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = p.yellow;
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i < 9; i++) {
      const rr = R * (0.12 + i * 0.065);
      g.moveTo(cx + rr, cy);
      g.arc(cx, cy, rr, 0, Math.PI * (1.2 + (i % 3) * 0.3));
    }
    g.stroke();
    g.fillStyle = c.card;
    g.beginPath();
    g.ellipse(cx + R * 0.3, cy - R * 0.25, 16, 12, 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.orange;
    g.beginPath();
    g.arc(cx + R * 0.3, cy - R * 0.25, 7, 0, Math.PI * 2);
    g.fill();
    dot(p.green, 22, R * 0.6, 3);
  } else if (dish === "pizza") {
    g.fillStyle = p.crust;
    g.beginPath();
    g.arc(cx, cy, R * 0.76, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.red;
    g.beginPath();
    g.arc(cx, cy, R * 0.66, 0, Math.PI * 2);
    g.fill();
    dot(p.cream, 30, R * 0.6, 7);
    dot(mix(p.red, c.text, 0.25), 9, R * 0.55, 8);
    g.strokeStyle = mix(p.crust, c.text, 0.3);
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4;
      g.moveTo(cx - Math.cos(a) * R * 0.76, cy - Math.sin(a) * R * 0.76);
      g.lineTo(cx + Math.cos(a) * R * 0.76, cy + Math.sin(a) * R * 0.76);
    }
    g.stroke();
  } else {
    g.fillStyle = p.cream;
    g.beginPath();
    g.arc(cx, cy, R * 0.7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = p.red;
    g.lineWidth = 6;
    g.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.moveTo(cx + Math.cos(a) * R * 0.62 + 4, cy + Math.sin(a) * R * 0.62);
      g.arc(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, 4, 0, Math.PI * 2);
    }
    g.stroke();
    dot(p.purple, 16, R * 0.45, 4);
  }
}

export default defineApp<State, Action, Local>({
  name: "Plate flags",
  summary: (s) => `${s.authorName}: ${s.title} · ${s.flags.length} ${s.flags.length === 1 ? "flag" : "flags"}${s.flags.length ? ` · ${avg(s)} chillies of envy` : ""}`,

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user) || meta.user === s.author) return s;
    const old = s.flags.find((f) => f.who === meta.user);
    if (a.t === "stick") {
      if (!okSlot(a.slot) || !okHeat(a.heat) || s.flags.some((q) => q.slot === a.slot && q !== old)) return s;
      const name = clean(ctx.members.find((m) => m.id === meta.user)?.name, 20) || "Friend";
      const f: Flag = { who: meta.user, name, slot: a.slot, heat: a.heat, word: clean(a.word, 18), at: meta.time };
      return { ...s, flags: [...s.flags.filter((q) => q !== old), f] };
    }
    if (a.t === "pull") {
      if (!old) return s;
      return { ...s, flags: s.flags.filter((q) => q !== old) };
    }
    return s;
  },

  invariants: {
    "one flag per friend, never the cook": (s) => new Set(s.flags.map((f) => f.who)).size === s.flags.length && s.flags.every((f) => f.who !== s.author),
    "one flag per socket": (s) => s.flags.every((f) => okSlot(f.slot)) && new Set(s.flags.map((f) => f.slot)).size === s.flags.length,
    "heat is 1 to 5 chillies": (s) => s.flags.every((f) => okHeat(f.heat)),
    "a dozen flags at most": (s) => s.flags.length <= MAX && s.flags.every((f) => f.word.length <= 18),
  },

  transitions: {
    "sticking puts my flag on top, where I tapped": (p, n, a, m) => {
      if (a.t !== "stick" || p === n) return true;
      const f = n.flags[n.flags.length - 1];
      return !!f && f.who === m.user && f.slot === a.slot && f.heat === a.heat && f.word === clean(a.word, 18) && f.at === m.time && n.flags.filter((q) => q.who === m.user).length === 1;
    },
    "nobody else's flag moves": (p, n, _a, m) => p.flags.filter((q) => q.who !== m.user).every((q) => n.flags.includes(q)) && n.flags.filter((q) => q.who !== m.user).length === p.flags.filter((q) => q.who !== m.user).length,
    "a good stick lands": (p, n, a, m, ctx) => a.t !== "stick" || !inChat(ctx, m.user) || m.user === p.author || !okSlot(a.slot) || !okHeat(a.heat) || p.flags.some((f) => f.slot === a.slot && f.who !== m.user) || p !== n,
    "pulling takes only mine out": (p, n, a, m) => a.t !== "pull" || p === n || (n.flags.length === p.flags.length - 1 && !n.flags.some((f) => f.who === m.user)),
    "the dish never changes": (p, n) => p.author === n.author && p.title === n.title && p.dish === n.dish && p.place === n.place,
    "only people in the chat stick flags": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _u, r) => {
    if (r.next() < 0.15) return { t: "pull" };
    return { t: "stick", slot: r.next() < 0.95 ? r.int(MAX) : 11, heat: r.next() < 0.95 ? 1 + r.int(5) : 9, word: r.pick(["want", "JEALOUS", "", "need it now"]) };
  },

  local: { slot: -1, placed: false, heat: 0, word: "", toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const S = PLATE_H;
    const isAuthor = me === state.author;
    const mine = state.flags.find((f) => f.who === me);
    const person = (f: Flag): Member => members.find((m) => m.id === f.who) ?? { id: f.who, name: f.name };
    const lastAt = Math.max(0, ...state.flags.map((f) => f.at));
    const draft = !isAuthor && local.placed;
    const toPx = (slot: number) => ({ x: W / 2 + SOCKETS[slot]!.dx, y: S / 2 + 46 + SOCKETS[slot]!.dy - 22 });
    const free = (i: number) => !state.flags.some((f) => f.slot === i && f.who !== me);
    const mySlot = local.placed && local.slot >= 0 && free(local.slot) ? local.slot : mine?.slot ?? SOCKETS.findIndex((_, i) => free(i));
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "up" || isAuthor) return;
      let best = -1, bd = 1e9;
      for (let i = 0; i < MAX; i++) {
        if (!free(i)) continue;
        const q = toPx(i), d = (q.x - e.x) ** 2 + (q.y - 30 - e.y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return;
      setLocal({ slot: best, placed: true, heat: local.heat || mine?.heat || 3, word: local.placed ? local.word : mine?.word ?? local.word });
      haptic("light");
    };
    const stick = () => {
      if (mySlot < 0) return;
      dispatch({ t: "stick", slot: mySlot, heat: local.heat || 3, word: local.word });
      setLocal({ placed: false, word: "", toast: local.toast + 1 });
      haptic("success");
    };
    const shown = [...state.flags.filter((f) => !(draft && f.who === me))].sort((a, b) => a.slot - b.slot);
    const flagEl = (f: { key: string; slot: number; heat: number; word: string; who: Member | string; col: string; fresh: boolean; ghost: boolean }) => {
      const q = toPx(f.slot);
      const wordW = Math.min(132, W / 2 - Math.abs(SOCKETS[f.slot]!.dx) - 4, Math.max(56, f.word.length * 6.2 + 34));
      const left = f.slot % 2 ? 0 : -wordW;
      return (
        <div key={f.key} style={{ position: "absolute", left: q.x, top: q.y - 46, width: 1, height: 46, pointerEvents: "none", animation: f.fresh ? "pfDrop .5s cubic-bezier(.2,1.3,.5,1)" : undefined }}>
          <svg width={8} height={46} viewBox="0 0 8 46" style={{ position: "absolute", left: -4, top: 0 }} aria-hidden="true">
            <line x1={4} y1={2} x2={4} y2={44} stroke={mix(p.crust, c.text, 0.35)} stroke-width={2.2} stroke-linecap="round" />
            <ellipse cx={4} cy={45} rx={3.5} ry={1.4} fill={mix(c.text, c.card, 0.5)} />
          </svg>
          <div style={{ position: "absolute", left, top: 0, width: wordW, height: 28, borderRadius: left < 0 ? "6px 0 0 6px" : "0 6px 6px 0", background: f.ghost ? c.card : mix(c.card, f.col, 0.18), border: `1.5px ${f.ghost ? "dashed" : "solid"} ${f.col}`, boxSizing: "border-box", padding: f.slot % 2 ? "1px 5px 1px 22px" : "1px 22px 1px 5px", overflow: "hidden" }}>
            <div style={{ fontSize: 10, lineHeight: "11px", fontWeight: 700, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.word || " "}</div>
            <svg width={wordW - 28} height={12} viewBox={`0 0 ${wordW - 28} 12`} aria-hidden="true">
              {Array.from({ length: f.heat }, (_, i) => (
                <path key={i} transform={`translate(${i * 10} 0) scale(.48)`} d="M6 7 C3 15 9 23 23 22 C17 19 14 13 13 7 Z M9 7 Q9 2 13 2" fill={p.red} />
              ))}
            </svg>
          </div>
          <div style={{ position: "absolute", left: f.slot % 2 ? 4 : -20, top: 4 }}>
            <Avatar user={f.who} size={16} />
          </div>
        </div>
      );
    };

    return (
      <div>
        <style>{"@keyframes pfDrop { 0% { transform: translateY(-40px) rotate(-12deg); opacity: 0 } 60% { transform: translateY(3px) rotate(4deg); opacity: 1 } 100% { transform: translateY(0) rotate(0) } }"}</style>
        <CardHeader title={`${state.authorName}: “${state.title}”`} subtitle={state.flags.length ? `${state.flags.length} flags · ${avg(state)} chillies of envy${state.place ? ` · ${state.place}` : ""}` : state.place || "Stick the first flag in"} />
        <div style={{ position: "relative", height: S }}>
          <Canvas
            height={S}
            label={`${state.dish} on a plate with ${state.flags.length} flags`}
            draw={(g, f: DrawFrame) => {
              const cx = f.width / 2, cy = S / 2, R = S / 2 - 4;
              g.fillStyle = mix(c.text, c.card, 0.88);
              g.beginPath();
              g.ellipse(cx + 3, cy + 5, R, R, 0, 0, Math.PI * 2);
              g.fill();
              g.fillStyle = p.plate;
              g.strokeStyle = c.divider;
              g.lineWidth = 1.5;
              g.beginPath();
              g.arc(cx, cy, R, 0, Math.PI * 2);
              g.fill();
              g.stroke();
              g.strokeStyle = mix(c.divider, c.card, 0.3);
              g.beginPath();
              g.arc(cx, cy, R * 0.84, 0, Math.PI * 2);
              g.stroke();
              drawDish(g, f.theme, state.dish, cx, cy, R);
            }}
            onPointer={onPointer}
          />
          {shown.map((f) => flagEl({ key: f.who, slot: f.slot, heat: f.heat, word: f.word, who: f.who === me ? me : person(f), col: userColor(f.who, theme), fresh: f.at > 0 && f.at === lastAt, ghost: false }))}
          {draft && mySlot >= 0 ? flagEl({ key: "draft", slot: mySlot, heat: local.heat || 3, word: local.word, who: me, col: c.primary, fresh: false, ghost: true }) : null}
          {!isAuthor && !draft && !mine ? (
            <div style={{ position: "absolute", left: 0, bottom: 4, padding: "2px 10px", borderRadius: 999, background: c.card, border: `1px solid ${c.divider}`, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, pointerEvents: "none" }}>Tap the plate to stick yours</div>
          ) : null}
        </div>
        {!isAuthor ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <span style={{ fontSize: 13, color: c.secondaryText, marginRight: 4, whiteSpace: "nowrap" }}>How badly</span>
              {[1, 2, 3, 4, 5].map((h) => {
                const lit = h <= (draft ? local.heat || 3 : mine?.heat ?? 0);
                return (
                  <button
                    key={h}
                    type="button"
                    aria-label={`${h} ${h === 1 ? "chilli" : "chillies"}`}
                    onClick={() => setLocal({ heat: h, placed: true, slot: local.placed ? local.slot : mine?.slot ?? -1, word: local.placed ? local.word : mine?.word ?? local.word })}
                    style={{ width: 44, height: 44, padding: 0, border: "none", background: "none", flex: "none" }}
                  >
                    <svg width={26} height={26} viewBox="0 0 26 26" aria-hidden="true" style={{ transform: lit ? "scale(1.12) rotate(-8deg)" : "none", transition: "transform .2s" }}>
                      <path d="M6 7 C3 15 9 23 23 22 C17 19 14 13 13 7 Z" fill={lit ? p.red : c.track} />
                      <path d="M9 7 Q8 2 12 2" fill="none" stroke={lit ? p.green : c.disabledText} stroke-width={2} stroke-linecap="round" />
                    </svg>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <input
                value={local.word}
                maxLength={18}
                placeholder="A word or two"
                aria-label="Your word"
                onInput={(e: { currentTarget: { value: string } }) => setLocal({ word: e.currentTarget.value, placed: true, slot: local.placed ? local.slot : mine?.slot ?? -1, heat: local.heat || mine?.heat || 3 })}
                onKeyDown={(e: { key: string }) => (e.key === "Enter" ? stick() : undefined)}
                style={{ flex: 1, minWidth: 0 }}
              />
              <Button kind="primary" onClick={stick}>
                {mine ? "Move my flag" : "Stick it"}
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>
            {state.flags.length ? `Hungriest: ${[...state.flags].sort((a, b) => b.heat - a.heat || a.at - b.at)[0]!.name.split(" ")[0]} · ${state.flags.filter((f) => f.heat === 5).length} at five chillies` : "Flags show up as friends react"}
          </div>
        )}
        {local.toast > 0 && mine ? <Toast key={local.toast}>{`Flag in · ${mine.heat} ${mine.heat === 1 ? "chilli" : "chillies"}`}</Toast> : null}
      </div>
    );
  },
});
