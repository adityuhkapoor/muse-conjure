import {
  defineApp,
  Avatar,
  Burst,
  Button,
  Canvas,
  Toast,
  fitText,
  haptic,
  mix,
  pal,
  running,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Step ladder: Arun's story says "i walked 31k steps today??". A tall ladder leans on a brick wall;
// everyone who taps drags their face up to today's step count and it stays on that rung. The top
// rung is whoever walked the most. Tomorrow's first climb sends everyone back to the bottom.

type Params = {
  /** Whose story: "Arun" */
  author: string;
  /** How long ago: "8h" */
  ago: string;
  /** Text on the story */
  caption: string;
  /** Steps already climbed today, with a line */
  climbs: { who: string; steps: number; note?: string }[];
};

// @params
const P: Params = {
  author: "Arun",
  ago: "8h",
  caption: "i walked 31k steps today??",
  climbs: [
    { who: "Arun", steps: 31200, note: "rice cooker was across campus. long story" },
    { who: "Tsai Lin", steps: 18400, note: "fenwick stairs, six times" },
    { who: "Maya", steps: 14800, note: "color-coded route to every class" },
    { who: "Calvin", steps: 9700, note: "snoozed 7 alarms and still made it" },
    { who: "Will", steps: 3100, note: "the Sube counts as walking" },
  ],
};
// @end params

type Climb = { steps: number; note: string; at: number };
type State = { author: string; ago: string; caption: string; day: number; climbs: Record<string, Climb> };
type Action = { t: "climb"; steps: number };
type Local = { drag: number; dragging: boolean; cheers: number };

const PANEL = 556;
const MAX_STEPS = 80000;
const DAY = 86400000;
const BOTTOM_Y = 474;
const TOP_Y = 152;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const findMember = (ctx: Ctx, name: string): Member | undefined => {
  const k = name.trim().toLowerCase();
  return k ? ctx.members.find((m) => m.id === name || m.name.trim().toLowerCase() === k) : undefined;
};
const okSteps = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_STEPS;
const k = (n: number) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toFixed(1).replace(/\.0$/, "")}K` : String(n));

function initState(ctx: Ctx): State {
  const climbs: Record<string, Climb> = {};
  for (const c of Array.isArray(P.climbs) ? P.climbs : []) {
    const m = findMember(ctx, clean(c?.who, 20));
    if (!m || climbs[m.id] || !okSteps(c.steps)) continue;
    climbs[m.id] = { steps: c.steps, note: clean(c.note, 60), at: 0 };
  }
  return { author: clean(P.author, 20), ago: clean(P.ago, 6), caption: clean(P.caption, 40), day: -1, climbs };
}

/** The ladder's top: the best so far rounded up to the next 5K, at least 20K. */
const topOf = (s: State, extra = 0) => Math.max(20000, Math.ceil((Math.max(extra, ...Object.values(s.climbs).map((c) => c.steps)) + 1) / 5000) * 5000);
const yOf = (steps: number, top: number) => BOTTOM_Y - (Math.min(steps, top) / top) * (BOTTOM_Y - TOP_Y);
const xOf = (y: number, w: number) => w * 0.42 + ((BOTTOM_Y - y) / (BOTTOM_Y - TOP_Y)) * w * 0.08;

function drawScene(g: CanvasRenderingContext2D, f: DrawFrame, top: number, theme: Theme): boolean {
  const p = pal(theme);
  const w = f.width;
  const h = f.height;
  const t = f.now / 1000;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, mix(p.orange, p.purple, 0.55));
  sky.addColorStop(0.5, mix(p.orange, p.yellow, 0.35));
  sky.addColorStop(1, p.cream);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // The wall: right two thirds, bricks in two shades.
  const wx = w * 0.3;
  g.fillStyle = mix(p.red, p.brown, 0.45);
  g.fillRect(wx, 92, w - wx, h - 92);
  g.fillStyle = mix(p.red, p.brown, 0.25);
  g.beginPath();
  for (let row = 0; row * 14 < h - 92; row++) {
    const off = row % 2 ? 0 : 18;
    for (let x = wx - 18 + off; x < w; x += 36) if ((row * 7 + x) % 5 < 2) g.rect(Math.max(wx, x + 1), 93 + row * 14, 34, 12);
  }
  g.fill();
  g.strokeStyle = mix(p.cream, p.brown, 0.4);
  g.lineWidth = 1;
  g.beginPath();
  for (let row = 0; row * 14 < h - 92; row++) {
    const y = 92 + row * 14;
    g.moveTo(wx, y);
    g.lineTo(w, y);
    const off = row % 2 ? 0 : 18;
    for (let x = wx + off; x < w; x += 36) {
      g.moveTo(x, y);
      g.lineTo(x, y + 14);
    }
  }
  g.stroke();
  // A lit window and a roof edge.
  g.fillStyle = p.dark;
  g.fillRect(wx, 84, w - wx, 10);
  g.fillStyle = mix(p.yellow, p.cream, 0.4 + 0.1 * Math.sin(t));
  g.fillRect(w - 86, 180, 54, 70);
  g.strokeStyle = p.dark;
  g.lineWidth = 4;
  g.strokeRect(w - 86, 180, 54, 70);
  g.beginPath();
  g.moveTo(w - 59, 180);
  g.lineTo(w - 59, 250);
  g.moveTo(w - 86, 215);
  g.lineTo(w - 32, 215);
  g.stroke();
  // Sidewalk.
  g.fillStyle = mix(p.shade, p.paper, 0.4);
  g.fillRect(0, BOTTOM_Y + 18, w, h);
  g.strokeStyle = mix(p.shade, p.ink, 0.15);
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 20; x < w; x += 60) {
    g.moveTo(x, BOTTOM_Y + 18);
    g.lineTo(x - 14, h);
  }
  g.stroke();
  // The ladder: two rails and a rung every 1K steps.
  const rail = 30;
  const rungs = top / 1000;
  g.strokeStyle = p.crust;
  g.lineCap = "round";
  g.lineWidth = 7;
  g.beginPath();
  for (const side of [-1, 1]) {
    g.moveTo(xOf(BOTTOM_Y + 20, w) + side * rail, BOTTOM_Y + 20);
    g.lineTo(xOf(TOP_Y - 26, w) + side * rail, TOP_Y - 26);
  }
  g.stroke();
  g.lineWidth = 4;
  g.strokeStyle = mix(p.crust, p.brown, 0.35);
  g.beginPath();
  for (let i = 0; i <= rungs; i++) {
    const y = yOf(i * 1000, top);
    const x = xOf(y, w);
    g.moveTo(x - rail, y);
    g.lineTo(x + rail, y);
  }
  g.stroke();
  // A little flag on the top rung.
  const fy = TOP_Y - 26;
  const fx = xOf(fy, w) + rail;
  g.strokeStyle = p.ink;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(fx, fy);
  g.lineTo(fx, fy - 30);
  g.stroke();
  g.fillStyle = p.primary;
  g.beginPath();
  const wave = 3 * Math.sin(t * 4);
  g.moveTo(fx, fy - 30);
  g.quadraticCurveTo(fx + 12, fy - 32 + wave, fx + 24, fy - 26);
  g.lineTo(fx, fy - 18);
  g.closePath();
  g.fill();
  return true;
}

export default defineApp<State, Action, Local>({
  name: "Step ladder",
  summary: (s, ctx) => {
    const list = Object.entries(s.climbs).sort((a, b) => b[1].steps - a[1].steps);
    const best = list[0];
    const name = best ? ctx.members.find((m) => m.id === best[0])?.name ?? "Someone" : "";
    return best ? `Step ladder: ${name} on top with ${best[1].steps} steps · ${list.length} climbed` : "Step ladder: nobody has climbed today";
  },

  init: initState,

  reduce: (s, a, meta, ctx) => {
    if (a.t !== "climb" || !inChat(ctx, meta.user) || !okSteps(a.steps)) return s;
    const today = Math.floor(meta.time / DAY);
    // A new day sends everyone back to the bottom; the seeded climbs belong to whatever day comes first.
    const fresh = s.day >= 0 && today > s.day;
    const climbs = fresh ? {} : s.climbs;
    const prev = climbs[meta.user];
    if (!fresh && prev && prev.steps === a.steps) return s;
    return { ...s, day: Math.max(s.day, today), climbs: { ...climbs, [meta.user]: { steps: a.steps, note: prev?.note ?? "", at: meta.time } } };
  },

  onMembers: (s, ctx) => {
    if (Object.keys(s.climbs).every((id) => inChat(ctx, id))) return s;
    return { ...s, climbs: Object.fromEntries(Object.entries(s.climbs).filter(([id]) => inChat(ctx, id))) };
  },

  invariants: {
    "steps are whole and in range": (s) => Object.values(s.climbs).every((c) => okSteps(c.steps) && c.at >= 0),
    "climbers are in the chat": (s, ctx) => Object.keys(s.climbs).every((id) => inChat(ctx, id)),
    "live climbs belong to the current day": (s) => Object.values(s.climbs).every((c) => c.at === 0 || Math.floor(c.at / DAY) === s.day),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "a climb puts me on my rung, now": (p, n, a, m) => {
      if (a.t !== "climb" || p === n) return true;
      const c = n.climbs[m.user];
      return !!c && c.steps === a.steps && c.at === m.time && n.day === Math.max(p.day, Math.floor(m.time / 86400000));
    },
    "same day: nobody else moves": (p, n, a, m) => {
      if (a.t !== "climb" || p === n) return true;
      if (p.day >= 0 && Math.floor(m.time / 86400000) > p.day) return true;
      const ids = new Set([...Object.keys(p.climbs), ...Object.keys(n.climbs)]);
      for (const id of ids) if (id !== m.user && p.climbs[id] !== n.climbs[id]) return false;
      return n.climbs[m.user]!.note === (p.climbs[m.user]?.note ?? "");
    },
    "a new day starts from the bottom": (p, n, a, m) => {
      if (a.t !== "climb" || p === n) return true;
      if (!(p.day >= 0 && Math.floor(m.time / 86400000) > p.day)) return true;
      return Object.keys(n.climbs).length === 1 && n.climbs[m.user]?.note === "";
    },
    "the day never goes back": (p, n) => n.day >= p.day,
    "climbing to the same rung changes nothing": (p, n, a, m) =>
      a.t !== "climb" || p === n || (p.day >= 0 && Math.floor(m.time / 86400000) > p.day) || p.climbs[m.user]?.steps !== a.steps,
  },

  arbitrary: (s, u, r) => {
    const mine = s.climbs[u]?.steps ?? 0;
    return { t: "climb", steps: r.next() < 0.7 ? Math.min(MAX_STEPS, mine + 500 * (1 + r.int(20))) : r.int(40) * 1000 };
  },

  local: { drag: -1, dragging: false, cheers: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const mine = state.climbs[me];
    const draft = local.drag >= 0 ? local.drag : -1;
    const top = topOf(state, draft);
    const list = Object.entries(state.climbs)
      .filter(([id]) => members.some((m) => m.id === id))
      .sort((a, b) => b[1].steps - a[1].steps);
    const leader = list[0];
    const mem = (id: string): Member => members.find((m) => m.id === id) ?? { id, name: "?" };
    const author = members.find((m) => m.name.trim().toLowerCase() === state.author.toLowerCase()) ?? { id: `o:${state.author || "?"}`, name: state.author || "?" };
    const myNow = draft >= 0 ? draft : mine?.steps ?? 0;
    const rail = 30;

    const stepsAt = (y: number) => Math.max(0, Math.min(MAX_STEPS, Math.round(((BOTTOM_Y - y) / (BOTTOM_Y - TOP_Y)) * top / 100) * 100));
    const onPointer = (e: { type: "down" | "move" | "up"; x: number; y: number }) => {
      if (e.type === "down") {
        if (Math.abs(e.x - xOf(e.y, W)) > 90) return;
        setLocal({ dragging: true, drag: stepsAt(e.y) });
      } else if (e.type === "move") {
        if (local.dragging) setLocal({ drag: stepsAt(e.y) });
      } else if (local.dragging) setLocal({ dragging: false, drag: stepsAt(e.y) });
    };
    const climb = () => {
      const steps = draft >= 0 ? draft : 0;
      haptic("success");
      dispatch({ t: "climb", steps });
      setLocal({ drag: -1, cheers: local.cheers + 1 });
    };

    // Faces on rungs: alternate sides, nudged apart when two land close together.
    const placed: { id: string; steps: number; y: number; side: number; ghost: boolean }[] = [];
    const ranked = [...list.map(([id, cl]) => ({ id, steps: id === me && draft >= 0 ? draft : cl.steps }))];
    if (!mine && members.some((m) => m.id === me)) ranked.push({ id: me, steps: Math.max(0, draft) });
    ranked.sort((a, b) => b.steps - a.steps);
    ranked.forEach((r, i) => {
      let y = yOf(r.steps, top);
      const side = i % 2 === 0 ? 1 : -1;
      for (const q of placed) if (q.side === side && Math.abs(q.y - y) < 30) y = q.y + 30;
      placed.push({ id: r.id, steps: r.steps, y: Math.min(BOTTOM_Y + 4, y), side, ghost: r.id === me && draft >= 0 });
    });
    const recent = mine && mine.at > 0 ? running(mine.at, 2400) : null;
    const note = leader && state.climbs[leader[0]]?.note ? { id: leader[0], text: state.climbs[leader[0]]!.note } : null;
    const myRank = ranked.findIndex((r) => r.id === me) + 1;
    const cap = fitText(state.caption, W - 32, { size: 26, weight: 800, min: 15 });

    return (
      <div>
        <style>{"@keyframes slHop{0%{transform:translateY(0)}40%{transform:translateY(-10px)}100%{transform:translateY(0)}}"}</style>
        <div style={{ position: "relative", height: PANEL, borderRadius: 12, overflow: "hidden", background: p.dark, color: p.on }}>
          <Canvas height={PANEL} drag label={`Ladder up to ${top} steps, ${list.length} friends on it`} draw={(g, f) => drawScene(g, f, top, theme)} onPointer={onPointer} />
          <div aria-hidden="true" style={{ position: "absolute", left: 8, right: 8, top: 8, height: 3, borderRadius: 2, background: mix(p.on, p.dark, 0.55), pointerEvents: "none" }}>
            <div style={{ width: "62%", height: 3, borderRadius: 2, background: p.on }} />
          </div>
          <div style={{ position: "absolute", left: 11, right: 12, top: 18, height: 32, display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
            <span style={{ width: 32, height: 32, flex: "none", borderRadius: 16, background: p.on, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Avatar user={author} size={28} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: p.on, flex: "none" }}>{state.author || "Story"}</span>
            <span style={{ fontSize: 15, color: p.on, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.ago}</span>
          </div>
          {state.caption ? (
            <div style={{ position: "absolute", left: 16, top: 50, padding: "2px 10px", borderRadius: 8, background: p.dark, color: p.on, fontSize: cap.size, fontWeight: 800, lineHeight: "34px", whiteSpace: "nowrap", transform: "rotate(-2deg)", pointerEvents: "none" }}>{cap.text}</div>
          ) : null}
          {placed.map((q) => {
            const x = xOf(q.y, W) + q.side * (rail + 18);
            const isMe = q.id === me;
            const label = `${isMe ? "You" : mem(q.id).name} · ${k(q.steps)}`;
            const fit = fitText(label, 110, { size: 12, weight: 700, min: 10 });
            const hop = isMe && recent !== null;
            return (
              <div key={q.id} style={{ position: "absolute", left: x - 15, top: q.y - 15, width: 30, height: 30, transition: q.ghost ? "none" : "top 700ms cubic-bezier(.34,1.56,.64,1), left 700ms cubic-bezier(.34,1.56,.64,1)", pointerEvents: "none", animation: hop ? "slHop 500ms ease-out 2" : undefined }}>
                <span style={{ display: "flex", borderRadius: 16, boxShadow: `0 0 0 2px ${isMe ? c.primary : p.on}`, outline: isMe && !mine && draft < 0 ? `2px dashed ${p.on}` : undefined, outlineOffset: 3 }}>
                  <Avatar user={mem(q.id)} size={30} />
                </span>
                <span style={{ position: "absolute", top: 6, [q.side > 0 ? "left" : "right"]: 36, padding: "0 6px", borderRadius: 8, background: isMe ? c.primary : c.card, color: isMe ? c.onPrimary : c.text, fontSize: fit.size, fontWeight: 700, lineHeight: "18px", whiteSpace: "nowrap" }}>{fit.text}</span>
              </div>
            );
          })}

          <div style={{ position: "absolute", left: 12, right: 12, top: 498, height: 48, borderRadius: 14, background: c.card, color: c.text, display: "flex", alignItems: "center", gap: 8, padding: "0 4px 0 12px", boxSizing: "border-box" }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {draft >= 0
                ? `${draft.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} steps${leader && draft > leader[1].steps && leader[0] !== me ? ` · past ${mem(leader[0]).name}` : ""}`
                : mine
                  ? `You're ${myRank === 1 ? "on top" : `number ${myRank}`} with ${mine.steps.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} steps`
                  : note
                    ? `${mem(note.id).name}: "${note.text}"`
                    : "Drag your face up the ladder to your steps today"}
            </span>
            <Button kind="primary" onClick={() => (draft < 0 ? setLocal({ drag: mine?.steps ?? 6000 }) : climb())}>
              {draft < 0 ? (mine ? "Move me" : "Add my steps") : "Climb"}
            </Button>
          </div>
          {recent !== null && local.cheers > 0 ? (
            <div style={{ position: "absolute", left: "50%", top: 300, pointerEvents: "none" }}>
              <Burst key={local.cheers} emoji="👟" />
            </div>
          ) : null}
        </div>
        {recent !== null && local.cheers > 0 && mine ? <Toast key={local.cheers}>{`${k(mine.steps)} steps · number ${myRank}`}</Toast> : null}
      </div>
    );
  },
});
