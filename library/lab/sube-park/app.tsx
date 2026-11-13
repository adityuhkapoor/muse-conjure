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
  type Ctx,
  type DrawFrame,
  type Meta,
} from "@muse/app";

// Sube park: a two-minute parallel parking game. The street from above: a gap between two parked
// cars outside the spot everyone fights over, a cone that has seen things. Drag the car into the gap
// and let go: the closer to the middle of the spot and the curb line, the higher the score. Friends'
// tries stay on the street as ghost cars with their faces; best score wins the spot.

type Params = {
  /** The street: "Lot C" */
  street: string;
  /** The car everyone parks: "the Sube" */
  car: string;
  /** Whose car it is */
  owner: string;
  /** Earlier tries: x and y in thousandths of the street (the spot's middle is 390, 300) */
  tries: { who: string; x: number; y: number; said?: string }[];
};

// @params
const P: Params = {
  street: "outside 412 Pine",
  car: "the Sube",
  owner: "Will",
  tries: [
    { who: "Will", x: 398, y: 296, said: "i've done this 400 times" },
    { who: "Calvin", x: 300, y: 330, said: "the cone came out of nowhere" },
    { who: "Maya", x: 352, y: 318 },
  ],
};
// @end params

type Try = { id: string; name: string; x: number; y: number; score: number; at: number; said: string };
type State = { street: string; car: string; owner: string; tries: Try[]; count: Record<string, number> };
type Action = { t: "park"; x: number; y: number } | { t: "reset" };
type Local = { dx: number; dy: number; dragging: boolean; moved: boolean; toast: number };

// Street layout, in thousandths of the picture.
const BACK = [40, 240];
const FRONT = [540, 740];
const CONE = 860;
const SPOT_X = 390;
const LANE_Y = 300;
const HALF = 85; // half a car length
const START = { x: 170, y: 790 };
const H = 184;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const okNum = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000;
const inLane = (y: number) => Math.abs(y - LANE_Y) <= 150;
/** 0 means bumped (a car, the cone or the curb) or not in the spot at all. */
function scoreOf(x: number, y: number): number {
  if (y < 170) return 0; // curb
  if (!inLane(y)) return 0;
  if (x - HALF < BACK[1]! || x + HALF > FRONT[0]!) return 0;
  return Math.max(1, Math.min(100, Math.round(100 - Math.abs(x - SPOT_X) * 0.9 - Math.abs(y - LANE_Y) * 0.6)));
}
const verdict = (t: Try) => (t.score === 0 ? (t.y < 170 ? "Curb" : !inLane(t.y) ? "In the road" : "Bumped") : t.score >= 90 ? "Clean" : t.score >= 70 ? "Close" : "Wonky");
const best = (s: State) => [...s.tries].sort((a, b) => b.score - a.score || a.at - b.at)[0] ?? null;

function initState(ctx: Ctx): State {
  const tries: Try[] = [];
  const count: Record<string, number> = {};
  for (const t of Array.isArray(P.tries) ? P.tries : []) {
    const name = clean(t?.who, 20);
    if (!name || !okNum(t.x) || !okNum(t.y) || tries.length >= 8) continue;
    const m = ctx.members.find((x) => x.id === name || same(x.name, name));
    const id = m ? m.id : name;
    if (tries.some((x) => x.id === id)) continue;
    tries.push({ id, name: m ? clean(m.name, 20) || name : name, x: t.x, y: t.y, score: scoreOf(t.x, t.y), at: 0, said: clean(t.said, 48) });
    count[id] = 1;
  }
  return { street: clean(P.street, 28) || "the street", car: clean(P.car, 16) || "the car", owner: clean(P.owner, 20), tries, count };
}

function reducePark(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;
  const u = meta.user;
  if (a.t === "park") {
    if (!okNum(a.x) || !okNum(a.y)) return s;
    const x = a.x as number;
    const y = a.y as number;
    const name = clean(ctx.members.find((m) => m.id === u)?.name, 20) || "Friend";
    const t: Try = { id: u, name, x, y, score: scoreOf(x, y), at: meta.time, said: "" };
    const old = s.tries.find((q) => q.id === u);
    const count = { ...s.count, [u]: (s.count[u] ?? 0) + 1 };
    // A worse try only counts as a try; a better one moves your car to where you let go.
    if (old && old.score > t.score) return { ...s, count, tries: s.tries.map((q) => (q.id === u ? { ...q, at: meta.time } : q)) };
    return { ...s, count, tries: [...s.tries.filter((q) => q.id !== u), t].slice(-8) };
  }
  if (a.t === "reset") {
    if (!s.tries.some((q) => q.id === u)) return s;
    return { ...s, tries: s.tries.filter((q) => q.id !== u) };
  }
  return s;
}

function car(g: CanvasRenderingContext2D, x: number, y: number, len: number, wid: number, body: string, glass: string, alpha = 1) {
  g.globalAlpha = alpha;
  g.fillStyle = body;
  g.beginPath();
  g.roundRect(x - len / 2, y - wid / 2, len, wid, 7);
  g.fill();
  g.fillStyle = glass;
  g.beginPath();
  g.roundRect(x + len * 0.12, y - wid / 2 + 4, len * 0.16, wid - 8, 3);
  g.roundRect(x - len * 0.34, y - wid / 2 + 4, len * 0.13, wid - 8, 3);
  g.fill();
  g.globalAlpha = 1;
}

export default defineApp<State, Action, Local>({
  name: "Parallel park",
  summary: (s) => {
    const b = best(s);
    return b ? `Park ${s.car}: ${b.name} leads with ${b.score} · ${s.tries.length} tried` : `Park ${s.car}: nobody has tried yet`;
  },

  init: initState,
  reduce: (s, a, meta, ctx) => reducePark(s, a as unknown as Record<string, unknown>, meta, ctx),

  invariants: {
    "scores come from where the car stopped": (s) => s.tries.every((t) => okNum(t.x) && okNum(t.y) && t.score === scoreOf(t.x, t.y)),
    "one car per person on the street": (s) => new Set(s.tries.map((t) => t.id)).size === s.tries.length && s.tries.length <= 8,
    "everyone on the street has tried": (s) => s.tries.every((t) => (s.count[t.id] ?? 0) >= 1),
    "try counts are whole": (s) => Object.values(s.count).every((n) => Number.isInteger(n) && n >= 0),
    "people keep their chat names": (s, ctx) =>
      s.tries.every((t) => {
        const m = ctx.members.find((x) => x.id === t.id);
        return !m || t.at === 0 || t.name === (clean(m.name, 20) || "Friend");
      }),
  },

  transitions: {
    "a try counts once": (p, n, a, m) => a.t !== "park" || p === n || (n.count[m.user] ?? 0) === (p.count[m.user] ?? 0) + 1,
    "your best never gets worse": (p, n, a, m) => {
      if (a.t !== "park" || p === n) return true;
      const was = p.tries.find((t) => t.id === m.user)?.score ?? -1;
      const now = n.tries.find((t) => t.id === m.user)?.score ?? -1;
      return now >= was && now >= scoreOf(a.x, a.y) && (now === was || now === scoreOf(a.x, a.y));
    },
    "a better try lands where you let go": (p, n, a, m) => {
      if (a.t !== "park" || p === n) return true;
      const was = p.tries.find((t) => t.id === m.user)?.score ?? -1;
      const t = n.tries.find((q) => q.id === m.user)!;
      return scoreOf(a.x, a.y) < was || (t.x === a.x && t.y === a.y && t.at === m.time);
    },
    "a park changes only your car": (p, n, a, m) => a.t !== "park" || p === n || n.tries.filter((t) => t.id !== m.user).every((t) => p.tries.some((q) => q.id === t.id && q.score === t.score && q.x === t.x)),
    "every try stamps your car": (p, n, a, m) => a.t !== "park" || p === n || n.tries.find((t) => t.id === m.user)?.at === m.time,
    "unknown actions change nothing": (p, n, a) => a.t === "park" || a.t === "reset" || p === n,
    "reset clears only yours": (p, n, a, m) => a.t !== "reset" || p === n || (!n.tries.some((t) => t.id === m.user) && n.tries.length === p.tries.length - 1),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (_s, _u, r) => (r.next() < 0.9 ? { t: "park", x: 250 + r.int(400), y: 150 + r.int(500) } : { t: "reset" }),

  local: { dx: START.x, dy: START.y, dragging: false, moved: false, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const X = (x: number) => (x / 1000) * W;
    const Y = (y: number) => (y / 1000) * H;
    const len = X(2 * HALF);
    const wid = Math.min(34, H * 0.16);
    const mine = state.tries.find((t) => t.id === me) ?? null;
    const myCount = state.count[me] ?? 0;
    const pos = local.dragging || local.moved ? { x: local.dx, y: local.dy } : mine ? { x: mine.x, y: mine.y } : START;
    const lastAt = Math.max(0, ...state.tries.map((t) => t.at));
    const recent = mine && mine.at === lastAt ? running(mine.at, 600) : null;
    const shake = recent !== null && mine && mine.score === 0 ? Math.sin(recent / 25) * 4 * (1 - recent / 600) : 0;
    const ranked = [...state.tries].sort((a, b) => b.score - a.score || a.at - b.at);
    const top = ranked[0] ?? null;
    const nameOf = (t: Try) => members.find((m) => m.id === t.id)?.name ?? t.name;

    const draw = (g: CanvasRenderingContext2D, f: DrawFrame) => {
      const w = f.width;
      const XX = (x: number) => (x / 1000) * w;
      const asphalt = dark ? mix(c.wash, c.text, 0.08) : mix(c.secondaryText, c.card, 0.35);
      g.fillStyle = asphalt;
      g.fillRect(0, 0, w, H);
      // sidewalk and curb
      g.fillStyle = dark ? mix(c.wash, c.text, 0.22) : mix(c.secondaryText, c.card, 0.75);
      g.fillRect(0, 0, w, Y(150));
      g.fillStyle = dark ? mix(c.text, c.wash, 0.45) : c.card;
      g.fillRect(0, Y(150), w, 4);
      // sidewalk trees and a hydrant
      g.fillStyle = dark ? mix(pl.green, c.wash, 0.3) : pl.green;
      g.beginPath();
      for (const tx of [90, 470, 930]) g.arc(XX(tx), Y(70), Math.min(13, Y(70)), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pl.red;
      g.beginPath();
      g.arc(XX(640), Y(95), 5, 0, Math.PI * 2);
      g.fill();
      // the spot, outlined
      g.strokeStyle = dark ? mix(pl.yellow, c.wash, 0.2) : pl.yellow;
      g.lineWidth = 2;
      g.setLineDash([6, 5]);
      g.strokeRect(XX(BACK[1]! + 8), Y(LANE_Y - 120), XX(FRONT[0]! - BACK[1]! - 16), Y(240));
      g.setLineDash([]);
      // lane line
      g.strokeStyle = dark ? mix(c.text, c.wash, 0.55) : c.card;
      g.lineWidth = 2;
      g.setLineDash([14, 12]);
      g.beginPath();
      g.moveTo(0, Y(560));
      g.lineTo(w, Y(560));
      g.stroke();
      g.setLineDash([]);
      // parked cars and the cone
      car(g, XX((BACK[0]! + BACK[1]!) / 2), Y(LANE_Y), XX(BACK[1]! - BACK[0]!), wid, pl.purple, mix(pl.purple, c.card, 0.6));
      car(g, XX((FRONT[0]! + FRONT[1]!) / 2), Y(LANE_Y), XX(FRONT[1]! - FRONT[0]!), wid, pl.red, mix(pl.red, c.card, 0.6));
      g.fillStyle = pl.orange;
      g.beginPath();
      g.moveTo(XX(CONE) - 8, Y(LANE_Y) + 8);
      g.lineTo(XX(CONE), Y(LANE_Y) - 12);
      g.lineTo(XX(CONE) + 8, Y(LANE_Y) + 8);
      g.closePath();
      g.fill();
      // ghosts: everyone else's last try
      g.setLineDash([4, 3]);
      g.lineWidth = 1.5;
      g.strokeStyle = dark ? mix(c.text, asphalt, 0.3) : c.card;
      g.beginPath();
      for (const t of state.tries) {
        if (t.id === me) continue;
        g.roundRect(XX(t.x) - len / 2, Y(t.y) - wid / 2, len, wid, 7);
      }
      g.stroke();
      g.setLineDash([]);
      // the Sube (yours), roof rack and all
      car(g, XX(pos.x) + shake, Y(pos.y), len, wid, pl.green, mix(pl.green, c.card, 0.6));
      g.strokeStyle = mix(pl.green, c.text, 0.45);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(XX(pos.x) + shake - len * 0.18, Y(pos.y) - wid / 2 + 3);
      g.lineTo(XX(pos.x) + shake + len * 0.08, Y(pos.y) - wid / 2 + 3);
      g.moveTo(XX(pos.x) + shake - len * 0.18, Y(pos.y) + wid / 2 - 3);
      g.lineTo(XX(pos.x) + shake + len * 0.08, Y(pos.y) + wid / 2 - 3);
      g.stroke();
      if (local.dragging) {
        g.strokeStyle = c.primary;
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(XX(pos.x) - len / 2 - 3, Y(pos.y) - wid / 2 - 3, len + 6, wid + 6, 9);
        g.stroke();
      }
      return recent !== null;
    };

    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      const x = Math.max(0, Math.min(1000, Math.round((e.x / W) * 1000)));
      const y = Math.max(0, Math.min(1000, Math.round((e.y / H) * 1000)));
      if (e.type === "down") {
        if (Math.abs(x - pos.x) < 160 && Math.abs(y - pos.y) < 220) setLocal({ dragging: true, dx: x, dy: y });
      } else if (e.type === "move") {
        if (local.dragging) setLocal({ dx: x, dy: y });
      } else if (local.dragging) {
        setLocal({ dragging: false, moved: true, dx: x, dy: y });
      }
    };

    const ghostFaces = state.tries
      .filter((t) => t.id !== me)
      .map((t) => (
        <div key={t.id} style={{ position: "absolute", left: X(t.x) - 9, top: Y(t.y) - wid / 2 - 20, display: "flex", pointerEvents: "none" }}>
          <Avatar user={{ id: t.id, name: nameOf(t) }} size={18} />
        </div>
      ));
    const said = state.tries.find((t) => t.said && t.at === 0 && t.score === (top?.score ?? -1)) ?? state.tries.find((t) => t.said);

    return (
      <div>
        <CardHeader title={`Park ${state.car}`} subtitle={`${state.street} · drag it into the spot`} />
        <div style={{ position: "relative", height: H }}>
          <Canvas height={H} drag label={`Street with a parking spot; ${state.tries.length} tries, best ${top ? top.score : 0}`} draw={draw} onPointer={onPointer} />
          {ghostFaces}
          {!local.dragging && !local.moved && !mine ? (
            <div style={{ position: "absolute", left: X(START.x) + len / 2 + 6, top: Y(START.y) - 9, padding: "1px 8px", borderRadius: 99, background: c.card, color: c.text, fontSize: 12, lineHeight: "18px", fontWeight: 600, pointerEvents: "none", whiteSpace: "nowrap" }}>
              Drag me
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, height: 32, overflow: "hidden" }}>
          {ranked.slice(0, theme.width < 360 ? 3 : 4).map((t, i) => (
            <div key={t.id} style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 8px 0 4px", borderRadius: 16, background: t.id === me ? c.selected : c.wash, fontSize: 13, lineHeight: "16px", whiteSpace: "nowrap" }}>
              <Avatar user={{ id: t.id, name: nameOf(t) }} size={22} />
              <span style={{ fontWeight: 600, color: c.text }}>{t.score ? String(t.score) : "0"}</span>
              {i === 0 && t.score ? <span style={{ color: c.secondaryText }}>spot</span> : t.score === 0 ? <span style={{ color: c.secondaryText }}>{verdict(t).toLowerCase()}</span> : null}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, minHeight: 16, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {mine && mine.at > 0
            ? `${verdict(mine)} · your best ${mine.score} · ${myCount} ${myCount === 1 ? "try" : "tries"}`
            : said
              ? `${nameOf(said)}: "${said.said}"`
              : "Closer to the middle scores higher"}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {top ? (top.id === me ? "You have the spot" : `${nameOf(top)} has the spot with ${top.score}`) : "Nobody has the spot"}
          </span>
          {local.moved || !mine ? (
            <Button
              kind="primary"
              disabled={!local.moved}
              onClick={() => {
                dispatch({ t: "park", x: local.dx, y: local.dy });
                setLocal({ moved: false, toast: local.toast + 1 });
                haptic(scoreOf(local.dx, local.dy) ? "success" : "medium");
              }}
            >
              Park it
            </Button>
          ) : (
            <Button kind="secondary" onClick={() => setLocal({ moved: true, dx: START.x, dy: START.y })}>
              Try again
            </Button>
          )}
        </div>
        {local.toast > 0 && mine && mine.at > 0 ? <Toast key={local.toast}>{mine.score ? `${mine.score} · ${verdict(mine).toLowerCase()}` : `${verdict(mine)} · try again`}</Toast> : null}
      </div>
    );
  },
});
