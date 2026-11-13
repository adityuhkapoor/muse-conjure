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
  seedOf,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Tank pals: the fish tank on the counter at 412 Pine, one fish per friend in their colour. It just
// lives in the chat: bubbles, swaying weed, fish drifting about. A fish nobody has fed for a day
// sinks low and slow; tap it (yours or anyone's) and flakes drift down and it darts up to eat.
// Everyone gets to drop one thing on the gravel too.

type Decor = "castle" | "shell" | "diver" | "cooker" | "car" | "plant";
type Params = {
  /** Whose tank: "412 Pine" */
  home: string;
  /** Fish by owner, with a name and hours since someone fed it */
  fish: { owner: string; name: string; fedHoursAgo: number; fedBy?: string }[];
  /** Things already on the gravel */
  decor: { by: string; kind: Decor }[];
};

// @params
const P: Params = {
  home: "412 Pine",
  fish: [
    { owner: "Arun", name: "Grain", fedHoursAgo: 2, fedBy: "Arun" },
    { owner: "Calvin", name: "Snooze", fedHoursAgo: 30, fedBy: "Maya" },
    { owner: "Will", name: "Sube Jr.", fedHoursAgo: 5, fedBy: "Will" },
    { owner: "Maya", name: "Pivot Table", fedHoursAgo: 1, fedBy: "Maya" },
    { owner: "Tsai Lin", name: "Veto", fedHoursAgo: 26, fedBy: "Tsai Lin" },
    { owner: "Aditya", name: "Lowkey", fedHoursAgo: 14, fedBy: "Arun" },
  ],
  decor: [
    { by: "Arun", kind: "cooker" },
    { by: "Will", kind: "car" },
    { by: "Maya", kind: "castle" },
  ],
};
// @end params

type Fish = { owner: string; name: string };
type Fed = { at: number; ago: number; by: string };
type State = { home: string; fish: Fish[]; fed: Record<string, Fed>; decor: { by: string; kind: Decor; at: number }[] };
type Action = { t: "feed"; fish: string } | { t: "decor"; kind: string };
type Local = { tray: boolean; toast: number; last: string };

const H = 178;
const HOUR = 3600000;
const DECOR: Decor[] = ["castle", "shell", "diver", "cooker", "car", "plant"];
const DECOR_NAME: Record<Decor, string> = { castle: "Castle", shell: "Shell", diver: "Diver", cooker: "Rice cooker", car: "Tiny car", plant: "Plant" };
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const findMember = (ctx: Ctx, name: string): Member | undefined => {
  const k = name.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k) : undefined;
};
const isDecor = (v: unknown): v is Decor => typeof v === "string" && (DECOR as string[]).includes(v);
const hoursSince = (f: Fed | undefined, now: number) => (!f ? 48 : f.at > 0 ? Math.max(0, (now - f.at) / HOUR) : f.ago);
const moodOf = (h: number) => (h < 8 ? 2 : h < 24 ? 1 : 0);

function initState(ctx: Ctx): State {
  const fish: Fish[] = [];
  const fed: Record<string, Fed> = {};
  for (const f of Array.isArray(P.fish) ? P.fish : []) {
    const m = findMember(ctx, clean(f?.owner, 20));
    if (!m || fish.some((x) => x.owner === m.id)) continue;
    fish.push({ owner: m.id, name: clean(f.name, 16) || `${m.name}'s fish` });
    const ago = typeof f.fedHoursAgo === "number" && Number.isFinite(f.fedHoursAgo) ? Math.min(72, Math.max(0, Math.round(f.fedHoursAgo))) : 12;
    fed[m.id] = { at: 0, ago, by: findMember(ctx, clean(f.fedBy, 20))?.id ?? m.id };
  }
  for (const m of ctx.members) if (!fish.some((x) => x.owner === m.id) && fish.length < 12) fish.push({ owner: m.id, name: `${m.name.split(" ")[0]}'s fish` });
  const decor: State["decor"] = [];
  for (const d of Array.isArray(P.decor) ? P.decor : []) {
    const m = findMember(ctx, clean(d?.by, 20));
    if (m && isDecor(d.kind) && !decor.some((x) => x.by === m.id)) decor.push({ by: m.id, kind: d.kind, at: 0 });
  }
  return { home: clean(P.home, 24) || "the apartment", fish, fed, decor };
}

// ---- The tank ----------------------------------------------------------------------------------

/** Where fish i is at time t: a slow loop around its own lane; hungry fish sink and slow down. */
function fishAt(i: number, n: number, owner: string, t: number, hungry: number, w: number, fedAt: number) {
  const s = seedOf(owner);
  const speed = (0.18 + (s % 7) * 0.02) * (hungry === 0 ? 0.4 : 1);
  const phase = (s % 1000) / 160;
  const u = Math.sin(t * speed + phase);
  const x = w * 0.5 + u * (w * 0.38);
  const lane = 36 + ((i + 0.5) / Math.max(1, n)) * (H - 96);
  let y = (hungry === 0 ? H - 64 - (i % 2) * 10 : lane) + 6 * Math.sin(t * 1.3 + phase);
  const e = fedAt > 0 ? (t * 1000 - fedAt) / 1000 : 99;
  if (e >= 0 && e < 3) y = y + (30 - y) * Math.sin((Math.PI * e) / 3) * 0.8;
  const dir = Math.cos(t * speed + phase) >= 0 ? 1 : -1;
  return { x, y, dir };
}

function drawDecor(g: CanvasRenderingContext2D, kind: Decor, x: number, y: number, p: ReturnType<typeof pal>) {
  if (kind === "castle") {
    g.fillStyle = mix(p.shade, p.paper, 0.2);
    g.beginPath();
    g.rect(x - 16, y - 26, 32, 26);
    for (const dx of [-16, -6, 4]) g.rect(x + dx, y - 32, 6, 6);
    g.rect(x - 6, y - 40, 12, 14);
    g.fill();
    g.fillStyle = p.dark;
    g.beginPath();
    g.arc(x, y - 6, 6, Math.PI, 0);
    g.lineTo(x + 6, y);
    g.lineTo(x - 6, y);
    g.fill();
  } else if (kind === "shell") {
    g.fillStyle = mix(p.orange, p.cream, 0.5);
    g.beginPath();
    g.moveTo(x - 12, y);
    g.quadraticCurveTo(x, y - 26, x + 12, y);
    g.closePath();
    g.fill();
    g.strokeStyle = mix(p.orange, p.brown, 0.3);
    g.lineWidth = 1;
    g.beginPath();
    for (const dx of [-6, 0, 6]) {
      g.moveTo(x, y - 2);
      g.lineTo(x + dx * 1.6, y - 16 + Math.abs(dx));
    }
    g.stroke();
  } else if (kind === "diver") {
    g.fillStyle = p.yellow;
    g.beginPath();
    g.roundRect(x - 7, y - 22, 14, 20, 4);
    g.fill();
    g.fillStyle = mix(p.shade, p.paper, 0.3);
    g.beginPath();
    g.arc(x, y - 28, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.sky;
    g.beginPath();
    g.arc(x + 2, y - 28, 5, 0, Math.PI * 2);
    g.fill();
  } else if (kind === "cooker") {
    g.fillStyle = p.paper;
    g.beginPath();
    g.roundRect(x - 13, y - 20, 26, 20, 6);
    g.fill();
    g.fillStyle = mix(p.paper, p.shade, 0.4);
    g.beginPath();
    g.ellipse(x, y - 20, 13, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.red;
    g.beginPath();
    g.arc(x + 7, y - 9, 2, 0, Math.PI * 2);
    g.fill();
  } else if (kind === "car") {
    g.fillStyle = p.green;
    g.beginPath();
    g.roundRect(x - 15, y - 12, 30, 9, 3);
    g.roundRect(x - 9, y - 19, 17, 8, 3);
    g.fill();
    g.fillStyle = p.ink;
    g.beginPath();
    g.arc(x - 8, y - 3, 3.5, 0, Math.PI * 2);
    g.arc(x + 8, y - 3, 3.5, 0, Math.PI * 2);
    g.fill();
  } else {
    g.strokeStyle = p.green;
    g.lineWidth = 4;
    g.lineCap = "round";
    g.beginPath();
    for (const dx of [-6, 0, 6]) {
      g.moveTo(x + dx, y);
      g.quadraticCurveTo(x + dx * 2, y - 18, x + dx, y - 30 - Math.abs(dx));
    }
    g.stroke();
  }
}

function drawTank(g: CanvasRenderingContext2D, f: DrawFrame, s: State, sel: string, theme: Theme): boolean {
  const p = pal(theme);
  const w = f.width;
  const t = f.now / 1000;
  const water = g.createLinearGradient(0, 0, 0, H);
  water.addColorStop(0, mix(p.sky, p.blue, 0.25));
  water.addColorStop(1, mix(p.blue, p.dark, 0.3));
  g.fillStyle = water;
  g.fillRect(0, 0, w, H);
  // Light rays from the lid.
  g.fillStyle = p.paper;
  g.globalAlpha = 0.07;
  g.beginPath();
  for (let k = 0; k < 4; k++) {
    const x = w * (0.15 + k * 0.24) + 10 * Math.sin(t * 0.3 + k);
    g.moveTo(x, 0);
    g.lineTo(x + 26, 0);
    g.lineTo(x + 60, H);
    g.lineTo(x + 20, H);
  }
  g.fill();
  g.globalAlpha = 1;
  // Gravel.
  g.fillStyle = mix(p.crust, p.paper, 0.2);
  g.beginPath();
  g.moveTo(0, H - 20);
  for (let x = 0; x <= w; x += 12) g.lineTo(x, H - 20 - 4 * Math.sin(x / 31));
  g.lineTo(w, H);
  g.lineTo(0, H);
  g.fill();
  g.fillStyle = mix(p.crust, p.brown, 0.3);
  g.beginPath();
  for (let k = 0; k < 40; k++) {
    const x = (k * 37.7) % w;
    const y = H - 12 + ((k * 13) % 10);
    g.moveTo(x + 2.5, y);
    g.arc(x, y, 2.5, 0, Math.PI * 2);
  }
  g.fill();
  // Weed swaying.
  g.strokeStyle = p.leaf;
  g.lineWidth = 5;
  g.lineCap = "round";
  g.beginPath();
  for (const bx of [w * 0.08, w * 0.12, w * 0.9, w * 0.94]) {
    g.moveTo(bx, H - 18);
    const sway = 10 * Math.sin(t * 0.9 + bx);
    g.bezierCurveTo(bx + sway, H - 60, bx - sway, H - 90, bx + sway * 0.6, H - 120 + (bx % 20));
  }
  g.stroke();
  // Decorations, each at its own spot on the gravel.
  s.decor.forEach((d) => drawDecor(g, d.kind, w * (0.22 + ((seedOf(d.by) % 1000) / 1000) * 0.56), H - 16, p));
  // Bubbles.
  g.strokeStyle = p.paper;
  g.lineWidth = 1.2;
  g.globalAlpha = 0.7;
  g.beginPath();
  for (let k = 0; k < 14; k++) {
    const ph = (t * (0.12 + (k % 4) * 0.03) + k * 0.17) % 1;
    const x = w * (k % 2 ? 0.86 : 0.18) + 6 * Math.sin(t * 2 + k);
    const y = H - 24 - ph * (H - 24);
    const r = 1.5 + (k % 3);
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, Math.PI * 2);
  }
  g.stroke();
  g.globalAlpha = 1;
  // Flakes falling where someone just fed.
  g.fillStyle = mix(p.orange, p.yellow, 0.4);
  g.beginPath();
  s.fish.forEach((fi, i) => {
    const fd = s.fed[fi.owner];
    if (!fd || fd.at <= 0) return;
    const e = (f.now - fd.at) / 1000;
    if (e < 0 || e > 3) return;
    const pos = fishAt(i, s.fish.length, fi.owner, t, 2, w, 0);
    for (let k = 0; k < 7; k++) {
      const x = pos.x - 18 + k * 6 + 4 * Math.sin(e * 3 + k);
      const y = 4 + e * 18 + (k % 3) * 5;
      g.rect(x, y, 3, 2);
    }
  });
  g.fill();
  // Fish: body, tail, eye. Hungry ones sink and droop.
  s.fish.forEach((fi, i) => {
    const hrs = hoursSince(s.fed[fi.owner], f.now);
    const mood = moodOf(hrs);
    const pos = fishAt(i, s.fish.length, fi.owner, t, mood, w, s.fed[fi.owner]?.at ?? 0);
    const col = userColor(fi.owner, theme);
    const sz = mood === 0 ? 0.85 : 1;
    g.save();
    g.translate(pos.x, pos.y);
    g.scale(pos.dir * sz, sz);
    if (mood === 0) g.rotate(0.25);
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2);
    g.fill();
    const wag = 4 * Math.sin(t * (mood ? 8 : 3) + i);
    g.beginPath();
    g.moveTo(-13, 0);
    g.lineTo(-26, -9 + wag);
    g.lineTo(-26, 9 + wag);
    g.closePath();
    g.fill();
    g.fillStyle = mix(col, p.paper, 0.35);
    g.beginPath();
    g.moveTo(-2, -9);
    g.quadraticCurveTo(4, -17, 8, -8);
    g.fill();
    g.fillStyle = p.paper;
    g.beginPath();
    g.arc(8, -2, 3.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.dark;
    g.beginPath();
    g.arc(9, -2, 1.8, 0, Math.PI * 2);
    g.fill();
    if (fi.owner === sel) {
      g.strokeStyle = p.paper;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(-4, 0, 26, 15, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  });
  // Glass glare.
  g.fillStyle = p.paper;
  g.globalAlpha = 0.12;
  g.fillRect(8, 6, 6, H - 40);
  g.globalAlpha = 1;
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Tank pals",
  summary: (s) => {
    const fedToday = s.fish.filter((f) => {
      const fd = s.fed[f.owner];
      return !!fd && (fd.at > 0 || fd.ago < 24);
    }).length;
    return `The ${s.home} tank: ${s.fish.length} fish · ${fedToday} fed in the last day · ${s.decor.length} things on the gravel`;
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "feed") {
      if (typeof a.fish !== "string" || !s.fish.some((f) => f.owner === a.fish)) return s;
      const was = s.fed[a.fish];
      // A fish fed in the last hour is full; more food just clouds the water.
      if (was && was.at > 0 && meta.time - was.at < HOUR) return s;
      return { ...s, fed: { ...s.fed, [a.fish]: { at: Math.max(1, meta.time), ago: 0, by: meta.user } } };
    }
    if (a.t === "decor") {
      if (!isDecor(a.kind)) return s;
      const rest = s.decor.filter((d) => d.by !== meta.user);
      if (rest.length >= 8) return s;
      if (s.decor.some((d) => d.by === meta.user && d.kind === a.kind)) return s;
      return { ...s, decor: [...rest, { by: meta.user, kind: a.kind, at: meta.time }] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const missing = ctx.members.filter((m) => !s.fish.some((f) => f.owner === m.id));
    if (!missing.length || s.fish.length >= 12) return s;
    return { ...s, fish: [...s.fish, ...missing.slice(0, 12 - s.fish.length).map((m) => ({ owner: m.id, name: `${m.name.split(" ")[0]}'s fish` }))] };
  },

  invariants: {
    "every friend has a fish while there is room": (s, ctx) => s.fish.length >= 12 || ctx.members.every((m) => s.fish.some((f) => f.owner === m.id)),
    "one fish per friend, twelve at most": (s) => new Set(s.fish.map((f) => f.owner)).size === s.fish.length && s.fish.length <= 12,
    "feeding records point at a fish": (s) => Object.keys(s.fed).every((k) => s.fish.some((f) => f.owner === k)),
    "feeding times are real": (s) => Object.values(s.fed).every((f) => f.at >= 0 && f.ago >= 0 && (f.at === 0 || f.ago === 0)),
    "one thing each on the gravel, eight at most": (s) => new Set(s.decor.map((d) => d.by)).size === s.decor.length && s.decor.length <= 8 && s.decor.every((d) => isDecor(d.kind)),
  },

  transitions: {
    "a new pick always lands": (p, n, a, m, ctx) =>
      a.t !== "decor" || p !== n || !isDecor(a.kind) || !ctx.members.some((x) => x.id === m.user) || p.decor.some((d) => d.by === m.user && d.kind === a.kind) || p.decor.filter((d) => d.by !== m.user).length >= 8,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "feeding stamps one fish with me, now": (p, n, a, m) => {
      if (a.t !== "feed" || p === n) return true;
      const f = n.fed[a.fish];
      if (!f || f.by !== m.user || f.at !== Math.max(1, m.time) || f.ago !== 0) return false;
      const ids = new Set([...Object.keys(p.fed), ...Object.keys(n.fed)]);
      for (const id of ids) if (id !== a.fish && p.fed[id] !== n.fed[id]) return false;
      return n.decor === p.decor && n.fish === p.fish;
    },
    "a full fish is not fed again within the hour": (p, n, a, m) => a.t !== "feed" || p === n || !p.fed[a.fish] || p.fed[a.fish]!.at === 0 || m.time - p.fed[a.fish]!.at >= 3600000,
    "decorating puts my one thing last": (p, n, a, m) => {
      if (a.t !== "decor" || p === n) return true;
      const d = n.decor[n.decor.length - 1];
      const others = (xs: State["decor"]) => xs.filter((x) => x.by !== m.user);
      return !!d && d.by === m.user && d.kind === a.kind && d.at === m.time && others(n.decor).length === others(p.decor).length && others(p.decor).every((x, i) => others(n.decor)[i] === x) && n.fed === p.fed;
    },
  },

  arbitrary: (s, _u, r) => (r.next() < 0.7 && s.fish.length ? { t: "feed", fish: r.pick(s.fish).owner } : { t: "decor", kind: r.pick(DECOR) }),

  local: { tray: false, toast: 0, last: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const now = clock.value;
    const mem = (id: string): Member => members.find((m) => m.id === id) ?? { id, name: "?" };
    const rows = state.fish.map((f) => ({ f, h: hoursSince(state.fed[f.owner], now) }));
    const hungry = rows.filter((r) => moodOf(r.h) === 0);
    const fedToday = rows.filter((r) => r.h < 24).length;
    const mine = state.fish.find((f) => f.owner === me);
    const target = hungry.find((r) => r.f.owner === me)?.f ?? hungry[0]?.f ?? mine ?? state.fish[0];
    const myDecor = state.decor.find((d) => d.by === me);
    const feed = (owner: string) => {
      const fd = state.fed[owner];
      if (fd && fd.at > 0 && now - fd.at < HOUR) return;
      haptic("light");
      dispatch({ t: "feed", fish: owner });
      setLocal({ toast: local.toast + 1, last: owner });
    };
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type !== "up") return;
      const t = now / 1000;
      let best = "";
      let bd = 30;
      state.fish.forEach((fi, i) => {
        const mood = moodOf(hoursSince(state.fed[fi.owner], now));
        const q = fishAt(i, state.fish.length, fi.owner, t, mood, W, state.fed[fi.owner]?.at ?? 0);
        const d = Math.hypot(q.x - e.x, q.y - e.y);
        if (d < bd) {
          bd = d;
          best = fi.owner;
        }
      });
      if (best) feed(best);
    };
    const ago = (h: number) => (h < 1 ? "just fed" : h < 24 ? `fed ${Math.floor(h)}h ago` : "hungry");
    const lastFed = local.last ? state.fed[local.last] : undefined;
    const showToast = local.toast > 0 && !!lastFed && lastFed.by === me && lastFed.at > 0 && now - lastFed.at < 2400;

    return (
      <div>
        <CardHeader title={`The ${state.home} tank`} subtitle={`${fedToday} of ${state.fish.length} fed today · tap a fish to feed it`} />
        <div style={{ position: "relative", height: H, borderRadius: 12, overflow: "hidden", boxShadow: `inset 0 0 0 3px ${c.divider}` }}>
          <Canvas height={H} label={`Fish tank with ${state.fish.length} fish, ${hungry.length} hungry`} draw={(g, f) => drawTank(g, f, state, local.last, theme)} onPointer={onPointer} />
        </div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {rows.slice(0, 6).map(({ f, h }) => {
            const mood = moodOf(h);
            const fit = fitText(f.name, (W - 12) / 3 - 40, { size: 13, weight: 600, min: 10 });
            return (
              <button
                key={f.owner}
                type="button"
                aria-label={`Feed ${f.name}, ${ago(h)}`}
                onClick={() => feed(f.owner)}
                style={{ height: 44, padding: "0 6px 0 4px", border: 0, borderRadius: 22, background: f.owner === me ? c.selected : c.wash, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", font: "inherit", minWidth: 0 }}
              >
                <Avatar user={mem(f.owner)} size={26} />
                <span style={{ minWidth: 0, flex: 1, textAlign: "left", display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: fit.size, fontWeight: 600, lineHeight: "16px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fit.text}</span>
                  <span style={{ fontSize: 11, lineHeight: "14px", color: mood === 0 ? c.text : c.secondaryText, fontWeight: mood === 0 ? 700 : 400, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                    {mood === 0 ? <span style={{ width: 6, height: 6, borderRadius: 3, background: c.negative, flex: "none" }} /> : null}
                    {ago(h)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {local.tray ? (
          <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
            {DECOR.map((k) => (
              <button
                key={k}
                type="button"
                aria-label={DECOR_NAME[k]}
                aria-pressed={myDecor?.kind === k}
                onClick={() => {
                  haptic("light");
                  dispatch({ t: "decor", kind: k });
                  setLocal({ tray: false });
                }}
                style={{ flex: 1, height: 44, padding: 0, border: 0, borderRadius: 10, background: myDecor?.kind === k ? c.selected : c.wash, cursor: "pointer", overflow: "hidden" }}
              >
                <Canvas height={44} label={DECOR_NAME[k]} draw={(g, fr) => drawDecor(g, k, fr.width / 2, 38, pal(theme))} />
              </button>
            ))}
          </div>
        ) : null}
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {hungry.length ? `${hungry.map((r) => r.f.name).slice(0, 2).join(" and ")} ${hungry.length === 1 ? "is" : "are"} hungry` : "Everyone's fed. Just watch them swim."}
          </span>
          <Button kind="secondary" onClick={() => setLocal({ tray: !local.tray })}>
            {myDecor ? "Swap decor" : "Add decor"}
          </Button>
          {target ? (
            <Button kind="primary" onClick={() => feed(target.owner)}>
              {`Feed ${fitText(target.name, 70, { size: 15, weight: 600 }).text}`}
            </Button>
          ) : null}
        </div>
        {showToast && lastFed ? <Toast key={local.toast}>{`${state.fish.find((f) => f.owner === local.last)?.name ?? "Fish"} is fed`}</Toast> : null}
      </div>
    );
  },
});
