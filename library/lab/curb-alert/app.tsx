import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  CardHeader,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  type Ctx,
  type DrawFrame,
  type Theme,
} from "@muse/app";

// Curb alert: someone just put free stuff on the curb. The street drawn at eye level, the things
// sitting by the curb; tap one and claim it, and a little dolly with your face rolls in, tips it
// on and wheels it away. It is gone from the curb for everyone else.

type Kind = "bookshelf" | "chair" | "mugs" | "lamp" | "table" | "mirror" | "box";
type Params = {
  /** Where on the street */
  place: string;
  /** Who spotted it, and what they said */
  spotted: { who: string; said: string };
  /** 1 to 5 things on the curb */
  items: { name: string; kind: Kind }[];
  /** Already claimed: item index, who, and their line */
  claims: { item: number; who: string; said?: string }[];
};

// @params
const P: Params = {
  place: "outside 418 Pine",
  spotted: { who: "Tsai Lin", said: "free stuff on Pine rn, go go go" },
  items: [
    { name: "Bookshelf", kind: "bookshelf" },
    { name: "Desk chair", kind: "chair" },
    { name: "Box of mugs", kind: "mugs" },
  ],
  claims: [{ item: 0, who: "Calvin", said: "dolly lives in my trunk. you know this" }],
};
// @end params

type Item = { name: string; kind: Kind; by: string; said: string; at: number };
type State = { place: string; spotter: string; spotSaid: string; items: Item[] };
type Action = { t: "claim"; item: number } | { t: "release"; item: number };
type Local = { sel: number; toast: number };

const KINDS: Kind[] = ["bookshelf", "chair", "mugs", "lamp", "table", "mirror", "box"];
const H = 206;
const ROLL = 1900;
const MAX_EACH = 2;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const mine = (s: State, u: string) => s.items.filter((i) => i.by === u).length;

function initState(ctx: Ctx): State {
  const items: Item[] = [];
  for (const it of Array.isArray(P.items) ? P.items : []) {
    if (items.length >= 5 || !it) continue;
    const name = clean(it.name, 22);
    if (name) items.push({ name, kind: KINDS.includes(it.kind) ? it.kind : "box", by: "", said: "", at: 0 });
  }
  if (!items.length) items.push({ name: "Mystery box", kind: "box", by: "", said: "", at: 0 });
  for (const cl of Array.isArray(P.claims) ? P.claims : []) {
    const it = items[cl?.item as number];
    const who = clean(cl?.who, 20);
    if (!it || it.by || !who) continue;
    const m = ctx.members.find((x) => x.id === who || x.name.trim().toLowerCase() === who.toLowerCase());
    it.by = m ? m.id : `o:${who}`;
    it.said = clean(cl.said, 48);
  }
  return { place: clean(P.place, 32) || "on the curb", spotter: clean(P.spotted?.who, 20), spotSaid: clean(P.spotted?.said, 48), items };
}

/** A thing on the curb, drawn standing on the ground line at (x, base), about `s` tall. */
function drawThing(g: CanvasRenderingContext2D, kind: Kind, x: number, base: number, s: number, t: Theme, tilt = 0) {
  const p = pal(t);
  const c = t.color;
  const u = s / 60;
  g.save();
  g.translate(x, base);
  g.rotate(tilt);
  g.scale(u, u);
  const wood = mix(p.brown, c.card, 0.2);
  switch (kind) {
    case "bookshelf":
      g.fillStyle = wood;
      g.fillRect(-20, -66, 40, 66);
      g.fillStyle = mix(wood, p.dark, 0.35);
      g.fillRect(-16, -62, 32, 60);
      g.fillStyle = wood;
      for (const y of [-44, -24]) g.fillRect(-16, y, 32, 3);
      [[-14, -62, p.red], [-9, -62, p.blue], [-4, -60, p.yellow], [-14, -41, p.green], [-8, -41, p.purple]].forEach(([bx, by, col]) => {
        g.fillStyle = col as string;
        g.fillRect(bx as number, by as number, 4, 18 - ((bx as number) % 3));
      });
      g.fillStyle = mix(p.cream, c.card, 0.2);
      g.save();
      g.rotate(-0.4);
      g.fillRect(-2, -38, 4, 17);
      g.restore();
      break;
    case "chair":
      g.strokeStyle = mix(c.secondaryText, c.card, 0.2);
      g.lineWidth = 3;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(0, -24);
      g.lineTo(0, -6);
      g.moveTo(-16, -2);
      g.lineTo(16, -2);
      g.stroke();
      g.fillStyle = p.dark;
      g.beginPath();
      g.arc(-16, -2, 3, 0, Math.PI * 2);
      g.arc(16, -2, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(p.purple, p.dark, 0.35);
      g.beginPath();
      g.roundRect(-16, -30, 30, 8, 4);
      g.roundRect(8, -62, 9, 36, 4);
      g.fill();
      break;
    case "mugs":
      ([[-12, p.red], [0, p.blue], [11, p.yellow]] as const).forEach(([mx, col]) => {
        g.fillStyle = col;
        g.beginPath();
        g.roundRect(mx - 5, -36, 10, 13, 2);
        g.fill();
      });
      g.fillStyle = p.crust;
      g.fillRect(-20, -28, 40, 28);
      g.fillStyle = mix(p.crust, p.dark, 0.2);
      g.beginPath();
      g.moveTo(-20, -28);
      g.lineTo(-27, -36);
      g.lineTo(-18, -36);
      g.closePath();
      g.moveTo(20, -28);
      g.lineTo(27, -36);
      g.lineTo(18, -36);
      g.closePath();
      g.fill();
      g.fillStyle = c.card;
      g.save();
      g.rotate(-0.08);
      g.fillRect(-12, -20, 24, 12);
      g.restore();
      g.fillStyle = c.text;
      g.font = `700 11px ${t.type.family}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("free", 0, -14);
      break;
    case "lamp":
      g.strokeStyle = mix(c.secondaryText, c.card, 0.2);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, -2);
      g.lineTo(0, -58);
      g.stroke();
      g.fillStyle = p.cream;
      g.beginPath();
      g.moveTo(-10, -56);
      g.lineTo(10, -56);
      g.lineTo(6, -72);
      g.lineTo(-6, -72);
      g.closePath();
      g.fill();
      g.fillStyle = mix(c.secondaryText, c.card, 0.2);
      g.fillRect(-9, -3, 18, 3);
      break;
    case "table":
      g.fillStyle = wood;
      g.fillRect(-20, -30, 40, 5);
      g.fillRect(-17, -26, 4, 26);
      g.fillRect(13, -26, 4, 26);
      break;
    case "mirror":
      g.fillStyle = wood;
      g.beginPath();
      g.roundRect(-12, -70, 24, 70, 12);
      g.fill();
      g.fillStyle = mix(p.sky, c.card, 0.2);
      g.beginPath();
      g.roundRect(-9, -67, 18, 64, 9);
      g.fill();
      break;
    default:
      g.fillStyle = p.crust;
      g.fillRect(-18, -32, 36, 32);
      g.fillStyle = mix(p.crust, c.card, 0.4);
      g.fillRect(-4, -32, 8, 32);
  }
  g.restore();
}

function drawDolly(g: CanvasRenderingContext2D, x: number, base: number, t: Theme) {
  const p = pal(t);
  const c = t.color;
  g.strokeStyle = mix(c.secondaryText, c.text, 0.3);
  g.lineWidth = 3;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x - 6, base - 6);
  g.lineTo(x - 12, base - 58);
  g.moveTo(x - 6, base - 6);
  g.lineTo(x + 18, base - 6);
  g.stroke();
  g.fillStyle = p.dark;
  g.beginPath();
  g.arc(x - 4, base - 4, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.card;
  g.beginPath();
  g.arc(x - 4, base - 4, 1.8, 0, Math.PI * 2);
  g.fill();
}

export default defineApp<State, Action, Local>({
  name: "Curb alert",
  summary: (s) => {
    const left = s.items.filter((i) => !i.by).length;
    return left ? `Free on the curb ${s.place} · ${left} of ${s.items.length} still there` : `Curb's clear ${s.place} · all ${s.items.length} claimed`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || typeof a.item !== "number") return s;
    const it = s.items[a.item];
    if (!it) return s;
    if (a.t === "claim") {
      if (it.by || mine(s, m.user) >= MAX_EACH) return s;
      return { ...s, items: s.items.map((x, i) => (i === a.item ? { ...x, by: m.user, said: "", at: m.time } : x)) };
    }
    if (a.t === "release") {
      if (it.by !== m.user) return s;
      return { ...s, items: s.items.map((x, i) => (i === a.item ? { ...x, by: "", said: "", at: 0 } : x)) };
    }
    return s;
  },

  onMembers: (s, ctx) =>
    s.items.some((i) => i.by && !i.by.startsWith("o:") && !inChat(ctx, i.by))
      ? { ...s, items: s.items.map((i) => (i.by && !i.by.startsWith("o:") && !inChat(ctx, i.by) ? { ...i, by: "", said: "", at: 0 } : i)) }
      : s,

  invariants: {
    "nobody hauls more than two": (s) => [...new Set(s.items.map((i) => i.by).filter((u) => u && !u.startsWith("o:")))].every((u) => mine(s, u) <= MAX_EACH),
    "a thing on the curb has no claim time": (s) => s.items.every((i) => i.by !== "" || (i.at === 0 && i.said === "")),
    "claimers are in the chat": (s, ctx) => s.items.every((i) => !i.by || i.by.startsWith("o:") || inChat(ctx, i.by)),
  },

  transitions: {
    "a claim takes a free thing": (p, n, a, m) => a.t !== "claim" || p === n || (p.items[a.item]!.by === "" && n.items[a.item]!.by === m.user && n.items[a.item]!.at === m.time),
    "claimed things stay claimed": (p, n, a, m) => n.items.every((x, i) => p.items[i]!.by === "" || x.by === p.items[i]!.by || (a.t === "release" && a.item === i && p.items[i]!.by === m.user)),
    "one thing at a time": (p, n) => n.items.filter((x, i) => x !== p.items[i]).length <= 1,
    "release puts it back on the curb": (p, n, a) => a.t !== "release" || p === n || (n.items[a.item]!.by === "" && n.items[a.item]!.at === 0),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const mineIdx = s.items.map((x, i) => (x.by === user ? i : -1)).filter((i) => i >= 0);
    if (mineIdx.length && r.next() < 0.3) return { t: "release", item: r.pick(mineIdx) };
    return { t: "claim", item: r.int(s.items.length) };
  },

  local: { sel: -1, toast: 0 },

  view: ({ state: s, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const n = s.items.length;
    const BASE = 150;
    const xOf = (i: number) => W * 0.16 + ((W * 0.8) / Math.max(1, n)) * (i + 0.5);
    const free = s.items.map((x, i) => (x.by ? -1 : i)).filter((i) => i >= 0);
    const sel = local.sel >= 0 && local.sel < n ? local.sel : free[0] ?? -1;
    const nameOf = (id: string) => (id.startsWith("o:") ? id.slice(2) : members.find((x) => x.id === id)?.name ?? "Someone");
    const rolling = s.items.map((it) => (it.by && it.at ? running(it.at, ROLL) : null));
    const anyRolling = rolling.some((r) => r !== null);
    /** Where the dolly is while hauling item i: rolls in, tips it on, wheels it off left. */
    const dollyAt = (i: number, e: number) => {
      const x = xOf(i);
      if (e < 800) return { dx: -40 + (x - 22 + 40) * (1 - (1 - e / 800) ** 2), tip: 0, carry: false };
      if (e < 1100) return { dx: x - 22, tip: ((e - 800) / 300) * -0.35, carry: true };
      return { dx: x - 22 - ((e - 1100) / 800) ** 2 * (x + 60), tip: -0.35, carry: true };
    };

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      // sky and the row houses
      g.fillStyle = dark ? mix(p.sky, c.wash, 0.55) : p.sky;
      g.beginPath();
      g.roundRect(0, 0, w, BASE + 12, [12, 12, 0, 0]);
      g.fill();
      const brick = dark ? mix(p.red, c.wash, 0.55) : mix(p.red, p.wall, 0.55);
      const brick2 = dark ? mix(p.orange, c.wash, 0.55) : mix(p.orange, p.wall, 0.5);
      g.fillStyle = brick;
      g.fillRect(0, 22, w * 0.55, BASE - 22 + 2);
      g.fillStyle = brick2;
      g.fillRect(w * 0.55, 34, w * 0.45, BASE - 34 + 2);
      // cornices
      g.fillStyle = mix(brick, c.card, 0.35);
      g.fillRect(0, 22, w * 0.55, 6);
      g.fillStyle = mix(brick2, c.card, 0.35);
      g.fillRect(w * 0.55, 34, w * 0.45, 6);
      // windows
      const glass = dark ? mix(p.yellow, c.wash, 0.35) : mix(p.sky, c.card, 0.35);
      g.fillStyle = glass;
      g.beginPath();
      for (const [x, y] of [[0.06, 40], [0.22, 40], [0.38, 40], [0.62, 50], [0.8, 50]] as const) g.roundRect(w * x, y, w * 0.1, 30, 2);
      g.fill();
      g.strokeStyle = mix(brick, c.card, 0.5);
      g.lineWidth = 2;
      g.beginPath();
      for (const [x, y] of [[0.06, 40], [0.22, 40], [0.38, 40], [0.62, 50], [0.8, 50]] as const) {
        g.moveTo(w * x + w * 0.05, y);
        g.lineTo(w * x + w * 0.05, y + 30);
      }
      g.stroke();
      // a door and stoop
      g.fillStyle = mix(p.dark, brick, 0.2);
      g.beginPath();
      g.roundRect(w * 0.42, 88, w * 0.08, BASE - 96, [8, 8, 0, 0]);
      g.fill();
      g.fillStyle = mix(c.secondaryText, c.card, 0.45);
      g.fillRect(w * 0.4, BASE - 8, w * 0.12, 4);
      g.fillRect(w * 0.39, BASE - 4, w * 0.14, 4);
      // sidewalk, curb, street
      g.fillStyle = dark ? mix(c.text, c.wash, 0.7) : mix(c.secondaryText, c.card, 0.72);
      g.fillRect(0, BASE, w, 18);
      g.fillStyle = dark ? mix(c.text, c.wash, 0.55) : mix(c.secondaryText, c.card, 0.55);
      g.fillRect(0, BASE + 18, w, 5);
      g.fillStyle = dark ? mix(c.wash, c.text, 0.08) : mix(c.secondaryText, c.text, 0.25);
      g.beginPath();
      g.roundRect(0, BASE + 23, w, H - BASE - 23, [0, 0, 12, 12]);
      g.fill();
      g.strokeStyle = p.yellow;
      g.lineWidth = 2;
      g.setLineDash([16, 12]);
      g.beginPath();
      g.moveTo(0, H - 10);
      g.lineTo(w, H - 10);
      g.stroke();
      g.setLineDash([]);
      // a tree
      g.fillStyle = p.brown;
      g.fillRect(w * 0.08, BASE - 34, 5, 36);
      g.fillStyle = dark ? mix(p.green, c.wash, 0.3) : p.green;
      g.beginPath();
      g.arc(w * 0.08 + 2, BASE - 46, 18, 0, Math.PI * 2);
      g.arc(w * 0.08 + 14, BASE - 38, 12, 0, Math.PI * 2);
      g.fill();
      // the curb: empty spots, things waiting, things being hauled
      const ground = BASE + 16;
      s.items.forEach((it, i) => {
        const x = xOf(i);
        const e = rolling[i] ?? null;
        if (it.by && e === null) {
          g.strokeStyle = dark ? mix(c.text, c.wash, 0.5) : c.card;
          g.lineWidth = 1.5;
          g.setLineDash([4, 3]);
          g.beginPath();
          g.ellipse(x, ground - 2, 22, 5, 0, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
          return;
        }
        if (it.by && e !== null) {
          const d = dollyAt(i, e);
          if (d.carry) drawThing(g, it.kind, d.dx + 16, ground - 6, 64, theme, d.tip);
          else drawThing(g, it.kind, x, ground, 68, theme);
          drawDolly(g, d.dx, ground, theme);
          return;
        }
        if (i === sel) {
          g.fillStyle = mix(c.primary, c.card, 0.75);
          g.beginPath();
          g.ellipse(x, ground - 1, 28, 6, 0, 0, Math.PI * 2);
          g.fill();
        }
        drawThing(g, it.kind, x, ground, 68, theme);
      });
      return anyRolling;
    };

    const tags = s.items.map((it, i) => {
      const x = xOf(i);
      const e = rolling[i] ?? null;
      if (it.by && e !== null) {
        const d = dollyAt(i, e);
        return (
          <div key={`d${i}`} style={{ position: "absolute", left: d.dx - 24, top: BASE - 60, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${c.card}`, pointerEvents: "none" }}>
            <Avatar user={it.by.startsWith("o:") ? { id: it.by, name: nameOf(it.by) } : it.by} size={22} />
          </div>
        );
      }
      if (it.by) {
        return (
          <div key={`t${i}`} style={{ position: "absolute", left: x - 34, width: 68, top: BASE - 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, pointerEvents: "none" }}>
            <span style={{ display: "flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${c.card}` }}>
              <Avatar user={it.by.startsWith("o:") ? { id: it.by, name: nameOf(it.by) } : it.by} size={22} />
            </span>
            <span style={{ maxWidth: 68, padding: "0 6px", borderRadius: 8, background: c.card, color: c.text, fontSize: 11, lineHeight: "16px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {it.by === me ? "yours" : "claimed"}
            </span>
          </div>
        );
      }
      return null;
    });

    const target = sel >= 0 ? s.items[sel]! : null;
    const myCount = mine(s, me);
    const quote = [...s.items].filter((i) => i.said).slice(-1)[0];
    const left = free.length;
    const claim = () => {
      if (sel < 0) return;
      dispatch({ t: "claim", item: sel });
      haptic("success");
      setLocal({ sel: -1, toast: local.toast + 1 });
    };
    const lastMine = [...s.items].filter((i) => i.by === me).sort((a, b) => b.at - a.at)[0];

    return (
      <div>
        <CardHeader title="Free on the curb" subtitle={`${s.place}${s.spotter ? ` · spotted by ${s.spotter}` : ""}`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} label={`Street with ${left} of ${n} free things still on the curb`} draw={draw} />
          {s.items.map((it, i) =>
            it.by ? null : (
              <button
                key={i}
                aria-label={`${it.name}, on the curb`}
                onClick={() => setLocal({ sel: i })}
                style={{ position: "absolute", left: xOf(i) - 28, top: BASE - 76, width: 56, height: 96, padding: 0, border: 0, background: "transparent", cursor: "pointer" }}
              />
            ),
          )}
          {tags}
          {target && !target.by ? (
            <div style={{ position: "absolute", left: Math.max(0, Math.min(W - 120, xOf(sel) - 60)), width: 120, top: BASE - 104, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
              <span style={{ maxWidth: 120, padding: "1px 8px", borderRadius: 10, background: c.card, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{target.name}</span>
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 18, fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {quote ? `${nameOf(quote.by)}: “${quote.said}”` : s.spotSaid ? `${s.spotter}: “${s.spotSaid}”` : "Tap something on the curb, then claim it"}
        </div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {left ? `${left} of ${n} ${myCount ? "left · you have " + myCount : "still on the curb"}` : "Curb's clear"}
          </span>
          {lastMine ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "release", item: s.items.indexOf(lastMine) })}>
              Put back
            </Button>
          ) : null}
          {target && !target.by && myCount < MAX_EACH ? (
            <Button kind="primary" onClick={claim}>
              {`Claim ${target.kind === "mugs" ? "the mugs" : "it"}`}
            </Button>
          ) : null}
        </div>
        {local.toast > 0 && lastMine ? <Toast key={local.toast}>{`The ${lastMine.name.toLowerCase()} is yours`}</Toast> : null}
      </div>
    );
  },
});
