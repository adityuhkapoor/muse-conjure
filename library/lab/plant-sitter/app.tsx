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

// Plant sitter: the apartment's plants on the windowsill, living on real time. Each one droops as
// the days since it was watered pass its schedule; tap one and water it and the can tips over it.
// Before everyone leaves for the summer, someone takes each plant home.

type Kind = "monstera" | "pothos" | "basil" | "cactus" | "snake";
type Params = {
  /** Where the sill is */
  place: string;
  /** 1 to 5 plants: name, kind, water every n days, days since it was last watered, by whom, and who's taking it for the summer */
  plants: { name: string; kind: Kind; everyDays: number; daysAgo: number; wateredBy?: string; keeper?: string; said?: string }[];
};

// @params
const P: Params = {
  place: "412 Pine kitchen window",
  plants: [
    { name: "Monstera", kind: "monstera", everyDays: 7, daysAgo: 3, wateredBy: "Maya" },
    { name: "Arun's pothos", kind: "pothos", everyDays: 5, daysAgo: 2, wateredBy: "Arun", said: "it only drinks rice water now" },
    { name: "The basil", kind: "basil", everyDays: 2, daysAgo: 4, wateredBy: "Aditya" },
    { name: "Will's cactus", kind: "cactus", everyDays: 21, daysAgo: 30, keeper: "Will", said: "you literally cannot kill a cactus" },
  ],
};
// @end params

const KINDS: Kind[] = ["monstera", "pothos", "basil", "cactus", "snake"];
const DAY = 86_400_000;
type Plant = { name: string; kind: Kind; every: number; ago: number; by: string; at: number; keeper: string; said: string };
type State = { place: string; plants: Plant[] };
type Action = { t: "water"; plant: number } | { t: "keep"; plant: number };
type Local = { sel: number; toast: number; msg: string };

const H = 196;
const POUR = 1400;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

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
/** Days since it was watered, as of `now`. */
const daysSince = (pl: Plant, now: number) => (pl.at ? Math.max(0, (now - pl.at) / DAY) : pl.ago);
const thirst = (pl: Plant, now: number) => Math.min(1.6, daysSince(pl, now) / pl.every);

function initState(ctx: Ctx): State {
  const plants: Plant[] = [];
  const who = (name: string) => {
    if (!name) return "";
    const m = ctx.members.find((x) => x.id === name || x.name.trim().toLowerCase() === name.toLowerCase());
    return m ? m.id : `o:${name}`;
  };
  for (const p of Array.isArray(P.plants) ? P.plants : []) {
    const name = clean(p?.name, 18);
    if (!name || plants.length >= 5) continue;
    plants.push({
      name,
      kind: KINDS.includes(p.kind) ? p.kind : "pothos",
      every: isInt(p.everyDays, 1, 60) ? p.everyDays : 3,
      ago: isInt(p.daysAgo, 0, 90) ? p.daysAgo : 0,
      by: who(clean(p.wateredBy, 20)),
      at: 0,
      keeper: who(clean(p.keeper, 20)),
      said: clean(p.said, 44),
    });
  }
  if (!plants.length) plants.push({ name: "Pothos", kind: "pothos", every: 5, ago: 0, by: "", at: 0, keeper: "", said: "" });
  return { place: clean(P.place, 36), plants };
}

function drawPlant(g: CanvasRenderingContext2D, kind: Kind, x: number, base: number, s: number, droop: number, t: Theme, sway: number) {
  const p = pal(t);
  const c = t.color;
  const dk = t.mode === "dark";
  const dry = Math.max(0, Math.min(1, droop - 0.8));
  const leaf = mix(dk ? mix(p.green, c.wash, 0.15) : p.green, p.crust, dry * 0.75);
  const leafHi = mix(leaf, c.card, 0.2);
  const u = s / 60;
  // pot
  g.save();
  g.translate(x, base);
  g.scale(u, u);
  const pot = kind === "cactus" ? mix(p.blue, c.card, 0.35) : kind === "basil" ? mix(p.orange, p.brown, 0.15) : kind === "monstera" ? mix(c.card, c.secondaryText, 0.15) : mix(p.orange, p.brown, 0.35);
  g.fillStyle = pot;
  g.beginPath();
  g.moveTo(-15, -22);
  g.lineTo(15, -22);
  g.lineTo(11, 0);
  g.lineTo(-11, 0);
  g.closePath();
  g.fill();
  g.fillStyle = mix(pot, p.dark, 0.15);
  g.fillRect(-17, -26, 34, 6);
  g.restore();
  // plant, bending with thirst
  g.save();
  g.translate(x, base - 24 * u);
  g.scale(u, u);
  const bend = Math.min(1.2, droop) * 0.55;
  g.rotate(sway * 0.03);
  g.fillStyle = leaf;
  g.strokeStyle = mix(leaf, p.dark, 0.25);
  g.lineCap = "round";
  switch (kind) {
    case "monstera": {
      for (const [a, len, sz] of [[-0.9, 34, 15], [-0.2, 42, 17], [0.6, 36, 15], [1.2, 26, 12]] as const) {
        const ang = a + (a > 0 ? bend : -bend) * 0.9;
        const ex = Math.sin(ang) * len, ey = -Math.cos(ang) * len * (1 - bend * 0.35);
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(ex * 0.3, ey * 0.7, ex, ey);
        g.stroke();
        g.beginPath();
        g.ellipse(ex, ey, sz, sz * 0.72, ang, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = dk ? c.wash : c.card;
        g.lineWidth = 1.6;
        g.beginPath();
        for (const k of [-0.5, 0.1, 0.6]) {
          g.moveTo(ex + Math.cos(ang + k) * sz * 0.3, ey + Math.sin(ang + k) * sz * 0.3);
          g.lineTo(ex + Math.cos(ang + k) * sz * 0.95, ey + Math.sin(ang + k) * sz * 0.7);
        }
        g.stroke();
        g.strokeStyle = mix(leaf, p.dark, 0.25);
      }
      break;
    }
    case "pothos": {
      g.lineWidth = 1.6;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(0, -4);
        const ex = side * (20 + bend * 8), ey = 10 + bend * 30;
        g.bezierCurveTo(side * 18, -14, side * 24, -2, ex, ey);
        g.stroke();
        for (let k = 0; k < 4; k++) {
          const tt = k / 3;
          const lx = side * (6 + 16 * tt + bend * 6 * tt), ly = -10 + (ey + 10) * tt * tt;
          g.beginPath();
          g.ellipse(lx, ly, 6, 4.4, side * 0.6 + bend * side, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.beginPath();
      g.ellipse(0, -12 + bend * 6, 7, 5, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "basil": {
      g.lineWidth = 1.8;
      for (const [a, len] of [[-0.4, 26], [0, 32], [0.45, 24]] as const) {
        const ang = a + Math.sign(a || 1) * bend;
        const ex = Math.sin(ang) * len, ey = -Math.cos(ang) * len;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(ex, ey);
        g.stroke();
        for (let k = 1; k <= 3; k++) {
          const lx = (ex * k) / 3, ly = (ey * k) / 3;
          g.beginPath();
          g.ellipse(lx - 5, ly, 5, 3.4, -0.5 + bend, 0, Math.PI * 2);
          g.ellipse(lx + 5, ly, 5, 3.4, 0.5 - bend, 0, Math.PI * 2);
          g.fill();
        }
      }
      break;
    }
    case "cactus": {
      g.fillStyle = mix(leaf, p.dark, 0.1);
      g.beginPath();
      g.roundRect(-8, -40, 16, 42, 8);
      g.roundRect(-20, -26, 8, 16, 4);
      g.roundRect(-20, -14, 14, 6, 3);
      g.roundRect(12, -32, 8, 16, 4);
      g.roundRect(6, -20, 14, 6, 3);
      g.fill();
      g.fillStyle = mix(p.red, c.card, 0.2);
      g.beginPath();
      g.arc(0, -42, 4, 0, Math.PI * 2);
      g.fill();
      break;
    }
    default: {
      g.fillStyle = leaf;
      for (const [a, len] of [[-0.25, 44], [0, 52], [0.25, 40], [-0.5, 30], [0.5, 32]] as const) {
        const ang = a * (1 + bend);
        g.save();
        g.rotate(ang);
        g.beginPath();
        g.moveTo(-4, 0);
        g.quadraticCurveTo(-5, -len * 0.6, 0, -len);
        g.quadraticCurveTo(5, -len * 0.6, 4, 0);
        g.closePath();
        g.fill();
        g.restore();
      }
    }
  }
  g.fillStyle = leafHi;
  g.restore();
}

export default defineApp<State, Action, Local>({
  name: "Plant sitter",
  summary: (s) => {
    const kept = s.plants.filter((p) => p.keeper).length;
    return `${s.plants.length} plants on the sill · ${kept} of ${s.plants.length} have a summer home`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || typeof a.plant !== "number") return s;
    const pl = s.plants[a.plant];
    if (!pl) return s;
    if (a.t === "water") {
      if (pl.at && m.time - pl.at < 60_000) return s;
      return { ...s, plants: s.plants.map((x, i) => (i === a.plant ? { ...x, by: m.user, at: m.time, ago: 0 } : x)) };
    }
    if (a.t === "keep") {
      if (pl.keeper && pl.keeper !== m.user) return s;
      return { ...s, plants: s.plants.map((x, i) => (i === a.plant ? { ...x, keeper: pl.keeper === m.user ? "" : m.user } : x)) };
    }
    return s;
  },

  onMembers: (s, ctx) =>
    s.plants.some((p) => p.keeper && !p.keeper.startsWith("o:") && !inChat(ctx, p.keeper))
      ? { ...s, plants: s.plants.map((p) => (p.keeper && !p.keeper.startsWith("o:") && !inChat(ctx, p.keeper) ? { ...p, keeper: "" } : p)) }
      : s,

  invariants: {
    "a watered plant has a waterer": (s) => s.plants.every((p) => !p.at || (p.by !== "" && p.ago === 0)),
    "schedules are whole days": (s) => s.plants.every((p) => isInt(p.every, 1, 60) && isInt(p.ago, 0, 90)),
    "keepers are in the chat": (s, ctx) => s.plants.every((p) => !p.keeper || p.keeper.startsWith("o:") || inChat(ctx, p.keeper)),
  },

  transitions: {
    "watering resets the clock": (p, n, a, m) => a.t !== "water" || p === n || (n.plants[a.plant]!.at === m.time && n.plants[a.plant]!.by === m.user && n.plants[a.plant]!.ago === 0),
    "no double watering within a minute": (p, n, a, m) => a.t !== "water" || !p.plants[a.plant]?.at || m.time - p.plants[a.plant]!.at >= 60_000 || n === p,
    "one plant at a time": (p, n) => n.plants.filter((x, i) => x !== p.plants[i]).length <= 1,
    "you can't take someone else's plant": (p, n, a, m) => a.t !== "keep" || p === n || ((p.plants[a.plant]!.keeper === "" && n.plants[a.plant]!.keeper === m.user) || (p.plants[a.plant]!.keeper === m.user && n.plants[a.plant]!.keeper === "")),
    "watering leaves custody alone": (p, n, a) => a.t !== "water" || n.plants.every((x, i) => x.keeper === p.plants[i]!.keeper),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => (r.next() < 0.6 ? { t: "water", plant: r.int(s.plants.length) } : { t: "keep", plant: r.int(s.plants.length) }),

  local: { sel: -1, toast: 0, msg: "" },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const n = s.plants.length;
    const SILL = 150;
    const xOf = (i: number) => (W / n) * (i + 0.5);
    const now = clock.value;
    const neediest = s.plants.map((x, i) => ({ i, t: thirst(x, now) })).sort((a, b) => b.t - a.t)[0]!.i;
    const sel = local.sel >= 0 && local.sel < n ? local.sel : neediest;
    const pl = s.plants[sel]!;
    const nameOf = (id: string) => (id === me ? "you" : id.startsWith("o:") ? id.slice(2) : members.find((x) => x.id === id)?.name ?? "someone");
    const pours = s.plants.map((x) => (x.at ? running(x.at, POUR) : null));

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      // wall
      g.fillStyle = dark ? mix(p.wall, c.wash, 0.75) : p.wall;
      g.beginPath();
      g.roundRect(0, 0, w, H, 12);
      g.fill();
      // window, with the sky outside
      const wx = 14, wy = 12, ww = w - 28, wh = SILL - 18;
      g.fillStyle = dark ? mix(p.blue, c.wash, 0.7) : p.sky;
      g.beginPath();
      g.roundRect(wx, wy, ww, wh, 6);
      g.fill();
      // a sun or a moon, slowly crossing
      const sx = wx + 30 + ((now / 60_000) % 60) / 60 * (ww - 60);
      g.fillStyle = dark ? mix(p.cream, c.wash, 0.2) : mix(p.yellow, c.card, 0.25);
      g.beginPath();
      g.arc(sx, wy + 26, 11, 0, Math.PI * 2);
      g.fill();
      // rooftops across the street
      g.fillStyle = dark ? mix(c.wash, p.blue, 0.15) : mix(p.sky, c.secondaryText, 0.35);
      g.beginPath();
      g.moveTo(wx, wy + wh);
      for (let k = 0; k <= 6; k++) {
        const bx = wx + (ww / 6) * k;
        g.lineTo(bx, wy + wh - 30 - ((k * 37) % 4) * 9);
        g.lineTo(bx + ww / 6, wy + wh - 30 - ((k * 37) % 4) * 9);
      }
      g.lineTo(wx + ww, wy + wh);
      g.closePath();
      g.fill();
      // frame and mullion
      g.strokeStyle = dark ? mix(c.text, c.wash, 0.55) : c.card;
      g.lineWidth = 5;
      g.beginPath();
      g.roundRect(wx, wy, ww, wh, 6);
      g.moveTo(wx + ww / 2, wy);
      g.lineTo(wx + ww / 2, wy + wh);
      g.stroke();
      // the sill
      g.fillStyle = dark ? mix(c.text, c.wash, 0.5) : c.card;
      g.beginPath();
      g.roundRect(4, SILL - 6, w - 8, 12, 4);
      g.fill();
      g.fillStyle = dark ? mix(c.text, c.wash, 0.7) : mix(c.secondaryText, c.card, 0.6);
      g.fillRect(8, SILL + 6, w - 16, 4);
      // plants
      let moving = true;
      s.plants.forEach((x, i) => {
        const tt = thirst(x, now);
        const sway = Math.sin(f.now / 1300 + i * 1.7) * (1 - Math.min(1, tt));
        if (i === sel) {
          g.fillStyle = mix(c.primary, c.card, 0.8);
          g.beginPath();
          g.ellipse(xOf(i), SILL + 1, 26, 5, 0, 0, Math.PI * 2);
          g.fill();
        }
        drawPlant(g, x.kind, xOf(i), SILL - 2, Math.min(64, W / n - 6), tt, theme, sway);
        // the watering can, pouring
        const e = pours[i];
        if (e !== null && e !== undefined) {
          const k = e / POUR;
          const cx = xOf(i) + 30, cy = 34;
          const tip = Math.min(1, k * 3) * -0.6;
          g.save();
          g.translate(cx, cy);
          g.rotate(tip);
          g.fillStyle = mix(p.green, c.secondaryText, 0.35);
          g.beginPath();
          g.roundRect(-12, -10, 24, 20, 4);
          g.fill();
          g.beginPath();
          g.moveTo(-12, -2);
          g.lineTo(-28, -12);
          g.lineTo(-28, -8);
          g.lineTo(-12, 4);
          g.closePath();
          g.fill();
          g.restore();
          g.fillStyle = mix(p.blue, c.card, 0.2);
          g.beginPath();
          for (let d = 0; d < 7; d++) {
            const ph = (e / 140 + d / 7) % 1;
            if (k > 0.15 && k < 0.9) {
              g.moveTo(cx - 24 + (d % 3) * 3, cy + 8 + ph * 60);
              g.arc(cx - 26 + (d % 3) * 3, cy + 8 + ph * 60, 1.8, 0, Math.PI * 2);
            }
          }
          g.fill();
        }
      });
      return moving;
    };

    const days = daysSince(pl, now);
    const dayText = days < 1 ? "today" : `${Math.floor(days)} ${Math.floor(days) === 1 ? "day" : "days"} ago`;
    const state = (x: Plant) => {
      const tt = thirst(x, now);
      return tt >= 1.2 ? "thirsty" : tt >= 0.85 ? "due" : "fine";
    };
    const water = () => {
      dispatch({ t: "water", plant: sel });
      haptic("light");
      setLocal({ sel, toast: local.toast + 1, msg: `${pl.name} got water` });
    };
    const quote = s.plants.find((x) => x.said);

    return (
      <div>
        <CardHeader title="Plant sitter" subtitle={s.place || `${n} plants on the sill`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`${n} plants on a windowsill; ${s.plants.filter((x) => state(x) !== "fine").length} need water`} draw={draw} />
          {s.plants.map((x, i) => {
            const st = state(x);
            return (
              <button
                key={i}
                aria-label={`${x.name}, ${st}`}
                onClick={() => setLocal({ sel: i })}
                style={{ position: "absolute", left: xOf(i) - Math.min(40, W / n / 2), width: Math.min(80, W / n), top: SILL - 74, height: 120, padding: 0, border: 0, background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 2 }}
              >
                <span style={{ maxWidth: Math.min(80, W / n) - 4, padding: "0 6px", borderRadius: 8, background: st === "thirsty" ? mix(c.warning, c.card, dark ? 0.72 : 0.2) : c.card, color: c.text, fontSize: 11, lineHeight: "16px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {fitText(x.name, Math.min(80, W / n) - 16, { size: 11, min: 10, weight: 600 }).text}
                </span>
              </button>
            );
          })}
          {s.plants.map((x, i) =>
            x.keeper ? (
              <div key={`k${i}`} style={{ position: "absolute", left: xOf(i) + 12, top: SILL - 40, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${c.card}`, pointerEvents: "none" }}>
                <Avatar user={x.keeper.startsWith("o:") ? { id: x.keeper, name: x.keeper.slice(2) } : x.keeper} size={18} />
              </div>
            ) : null,
          )}
        </div>
        <div style={{ marginTop: 8, minHeight: 36 }}>
          <div style={{ fontSize: 14, lineHeight: "18px", fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {`${pl.name} · ${state(pl) === "thirsty" ? "thirsty" : state(pl) === "due" ? "due for water" : "doing fine"}`}
          </div>
          <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pl.said && !pl.at ? `${nameOf(pl.keeper || pl.by)}: “${pl.said}”` : `Watered ${dayText}${pl.by ? ` by ${nameOf(pl.by)}` : ""} · every ${pl.every} ${pl.every === 1 ? "day" : "days"}`}
          </div>
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pl.keeper ? `Summer home: ${nameOf(pl.keeper)}` : `${s.plants.filter((x) => !x.keeper).length} need a summer home${quote && quote !== pl ? "" : ""}`}
          </span>
          {!pl.keeper || pl.keeper === me ? (
            <Button kind="secondary" onClick={() => { dispatch({ t: "keep", plant: sel }); setLocal({ sel, toast: local.toast + 1, msg: pl.keeper === me ? "Back on the sill" : `${pl.name} is coming home with you` }); }}>
              {pl.keeper === me ? "Leave it" : "Take home"}
            </Button>
          ) : null}
          <Button kind="primary" onClick={water}>
            Water
          </Button>
        </div>
        {local.toast > 0 && local.msg ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
