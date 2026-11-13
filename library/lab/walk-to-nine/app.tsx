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

// Walk to nine: everyone's walk to their first class, as a campus map. Each route runs from the
// apartment across the quad to a building, drawn in its walker's color, thicker where people share
// it. Play the morning and the faces walk at their real times; tap "Walk with" to leave with
// someone heading out about when you do.

type Params = {
  /** Card title */
  title: string;
  /** Home, where everyone starts; x and y in thousandths of the map */
  home: { name: string; x: number; y: number };
  /** Buildings people walk to */
  places: { name: string; x: number; y: number }[];
  /** Each person's first class: place name, time (24-hour "9:00"), minutes to walk, and who they already walk with */
  people: { who: string; to: string; at: string; walk: number; with?: string; note?: string }[];
};

// @params
const P: Params = {
  title: "Walk to the 9ams",
  home: { name: "412 Pine", x: 110, y: 860 },
  places: [
    { name: "Larkin Hall", x: 850, y: 170 },
    { name: "Fenwick Library", x: 190, y: 160 },
    { name: "Hollis Dining", x: 870, y: 660 },
  ],
  people: [
    { who: "Calvin", to: "Larkin Hall", at: "9:00", walk: 14, note: "seven alarms, still late" },
    { who: "Arun", to: "Larkin Hall", at: "9:00", walk: 14, with: "Calvin" },
    { who: "Aditya", to: "Fenwick Library", at: "9:00", walk: 11 },
    { who: "Will", to: "Hollis Dining", at: "9:00", walk: 9, note: "breakfast first" },
    { who: "Maya", to: "Larkin Hall", at: "9:30", walk: 15 },
  ],
};
// @end params

type Place = { name: string; x: number; y: number };
type Walker = { id: string; name: string; to: number; cls: number; walk: number; with: string; note: string };
type State = { title: string; home: Place; places: Place[]; people: Walker[]; pairs: number };
type Action = { t: "pair"; with: string } | { t: "solo" } | { t: "join"; to: number; at: number };
type Local = { play: number; toast: number; msg: string };

const H = 224;
const walkTo = (s: State, to: number) => {
  const b = s.places[to]!;
  return Math.max(4, Math.round((Math.hypot(QUAD.x - s.home.x, QUAD.y - s.home.y) + Math.hypot(b.x - QUAD.x, b.y - QUAD.y)) / 70));
};
const QUAD = { x: 500, y: 520 };
const BUFFER = 3;
const PLAY_MS = 7000;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const first = (n: string) => n.split(" ")[0] ?? n;
const coord = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(40, Math.min(960, Math.round(v))) : d);
const parse = (v: unknown, d: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clean(v, 5));
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : d;
};
const hm = (min: number) => `${Math.floor(min / 60) % 12 || 12}:${String(((min % 60) + 60) % 60).padStart(2, "0")}`;
const own = (w: Walker) => w.cls - w.walk - BUFFER;
const leader = (s: State, w: Walker) => (w.with ? s.people.find((x) => x.id === w.with) : undefined);
const leaveOf = (s: State, w: Walker) => {
  const l = leader(s, w);
  return l ? Math.min(own(w), own(l)) : own(w);
};
/** Who you could walk with: not you, not following anyone, leaving no later than you must and within 8 minutes. */
const buddies = (s: State, u: string) => {
  const me = s.people.find((w) => w.id === u);
  if (!me) return [];
  return s.people
    .filter((w) => w.id !== u && !w.with && own(w) <= own(me) && own(me) - own(w) <= 8 && !s.people.some((x) => x.with === u && x.id === w.id))
    .sort((a, b) => own(me) - own(a) - (own(me) - own(b)));
};

function initState(ctx: Ctx): State {
  const home = { name: clean(P.home?.name, 18) || "Home", x: coord(P.home?.x, 110), y: coord(P.home?.y, 860) };
  const places: Place[] = [];
  for (const p of Array.isArray(P.places) ? P.places : []) {
    const name = clean(p?.name, 20);
    if (!name || places.length >= 4) continue;
    places.push({ name, x: coord(p.x, 500), y: coord(p.y, 200) });
  }
  if (!places.length) places.push({ name: "Class", x: 850, y: 170 });
  const people: Walker[] = [];
  for (const q of Array.isArray(P.people) ? P.people : []) {
    const who = clean(q?.who, 24);
    if (!who || people.length >= 6) continue;
    const m = ctx.members.find((x) => x.id === who || x.name.toLowerCase() === who.toLowerCase());
    const id = m ? m.id : `?${who.toLowerCase()}`;
    if (people.some((w) => w.id === id)) continue;
    const to = Math.max(0, places.findIndex((p) => p.name.toLowerCase() === clean(q?.to, 20).toLowerCase()));
    people.push({ id, name: m ? m.name : who, to, cls: Math.max(360, Math.min(1320, parse(q?.at, 540))), walk: Number.isInteger(q?.walk) ? Math.max(2, Math.min(40, q.walk)) : 10, with: clean(q?.with, 24), note: clean(q?.note, 40) });
  }
  // "with" names become ids, kept only if that person leads (follows nobody) and leaves early enough
  const s: State = { title: clean(P.title, 30) || "Walk to class", home, places, people, pairs: 0 };
  s.people = people.map((w) => {
    const l = people.find((x) => x.id !== w.id && (x.name.toLowerCase() === w.with.toLowerCase() || x.id === w.with));
    return { ...w, with: l && !clean(l.with, 24) && own(l) <= own(w) ? l.id : "" };
  });
  return s;
}

function reduceW(s: State, a: Action, meta: Meta, ctx: Ctx): State {
  const u = meta.user;
  if (!inChat(ctx, u)) return s;
  const me = s.people.find((w) => w.id === u);
  if (a.t === "join") {
    if (me || s.people.length >= 6 || typeof a.to !== "number" || !Number.isInteger(a.to) || !s.places[a.to] || typeof a.at !== "number" || !Number.isInteger(a.at) || a.at < 360 || a.at > 1320) return s;
    const name = ctx.members.find((m) => m.id === u)?.name ?? "";
    return { ...s, people: [...s.people, { id: u, name, to: a.to, cls: a.at, walk: walkTo(s, a.to), with: "", note: "" }] };
  }
  if (!me) return s;
  if (a.t === "pair") {
    if (typeof a.with !== "string" || me.with === a.with) return s;
    const ok = buddies(s, u).some((w) => w.id === a.with);
    if (!ok) return s;
    // Anyone walking with me now walks with my new buddy too.
    return { ...s, pairs: s.pairs + 1, people: s.people.map((w) => (w.id === u || w.with === u ? { ...w, with: a.with } : w)) };
  }
  if (a.t === "solo") {
    if (!me.with) return s;
    return { ...s, people: s.people.map((w) => (w.id === u ? { ...w, with: "" } : w)) };
  }
  return s;
}

const routeOf = (s: State, w: Walker) => {
  const b = s.places[w.to] ?? s.places[0]!;
  return [s.home, QUAD, b];
};
const along = (pts: { x: number; y: number }[], q: number) => {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));
  let d = Math.max(0, Math.min(1, q)) * segs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i]! || i === segs.length - 1) {
      const k = segs[i]! ? Math.min(1, d / segs[i]!) : 0;
      return { x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * k, y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * k };
    }
    d -= segs[i]!;
  }
  return pts[pts.length - 1]!;
};

function drawMap(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, members: readonly Member[], ctx: Ctx, play: number) {
  const t = f.theme;
  const c = t.color;
  const p = pal(t);
  const W = f.width;
  const dark = t.mode === "dark";
  const X = (x: number) => (x / 1000) * W;
  const Y = (y: number) => (y / 1000) * H;
  g.fillStyle = dark ? mix(c.card, p.green, 0.12) : mix(p.grass, c.card, 0.45);
  g.beginPath();
  g.roundRect(0, 0, W, H, 12);
  g.fill();
  // the quad
  g.fillStyle = dark ? mix(c.card, p.green, 0.28) : p.grass;
  g.beginPath();
  g.roundRect(X(QUAD.x) - 52, Y(QUAD.y) - 34, 104, 68, 10);
  g.fill();
  g.fillStyle = mix(p.leaf, c.card, dark ? 0.2 : 0);
  g.beginPath();
  for (const [dx, dy] of [[-36, -20], [34, -18], [-30, 20], [38, 22], [0, -24]]) {
    g.moveTo(X(QUAD.x) + dx! + 7, Y(QUAD.y) + dy!);
    g.arc(X(QUAD.x) + dx!, Y(QUAD.y) + dy!, 7, 0, Math.PI * 2);
  }
  g.fill();
  // paths
  const path = dark ? mix(c.card, c.text, 0.2) : c.card;
  g.strokeStyle = path;
  g.lineWidth = 10;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(X(s.home.x), Y(s.home.y));
  g.lineTo(X(QUAD.x), Y(QUAD.y));
  for (const b of s.places) {
    g.moveTo(X(QUAD.x), Y(QUAD.y));
    g.lineTo(X(b.x), Y(b.y));
  }
  g.stroke();
  // routes, in their walkers' colors, side by side
  s.people.forEach((w, i) => {
    const pts = routeOf(s, w);
    const off = (i - (s.people.length - 1) / 2) * 2.6;
    g.strokeStyle = inChat(ctx, w.id) ? userColor(w.id, t) : c.secondaryText;
    g.lineWidth = w.id === me ? 3 : 2;
    g.setLineDash(w.with ? [] : [6, 4]);
    g.beginPath();
    pts.forEach((q, k) => (k ? g.lineTo(X(q.x) + off, Y(q.y) + off) : g.moveTo(X(q.x) + off, Y(q.y) + off)));
    g.stroke();
  });
  g.setLineDash([]);
  g.lineCap = "butt";
  // buildings and home
  const block = (q: Place, home: boolean) => {
    const bx = X(q.x);
    const by = Y(q.y);
    g.fillStyle = home ? p.orange : dark ? mix(c.card, c.text, 0.35) : mix(p.brown, c.card, 0.25);
    g.beginPath();
    if (home) {
      g.moveTo(bx - 14, by - 2);
      g.lineTo(bx, by - 16);
      g.lineTo(bx + 14, by - 2);
      g.lineTo(bx + 11, by - 2);
      g.lineTo(bx + 11, by + 12);
      g.lineTo(bx - 11, by + 12);
      g.lineTo(bx - 11, by - 2);
    } else g.roundRect(bx - 18, by - 14, 36, 28, 3);
    g.fill();
    if (!home) {
      g.fillStyle = mix(p.sky, c.card, 0.3);
      g.beginPath();
      for (const [dx, dy] of [[-11, -7], [3, -7], [-11, 3], [3, 3]]) g.rect(bx + dx!, by + dy!, 8, 6);
      g.fill();
    }
    const lab = fitText(q.name, 96, { g, size: 11, min: 9, weight: 700 });
    g.font = lab.font;
    const tw = g.measureText(lab.text).width + 10;
    const lx = Math.max(4, Math.min(W - tw - 4, bx - tw / 2));
    const ly = by + (home ? 16 : by < H / 2 ? 17 : -34);
    g.fillStyle = c.card;
    g.beginPath();
    g.roundRect(lx, ly, tw, 16, 8);
    g.fill();
    g.fillStyle = c.text;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(lab.text, lx + 5, ly + 8.5);
  };
  s.places.forEach((b) => block(b, false));
  block(s.home, true);

  // faces: at rest in a row by home with leave times; while playing, walking at their times
  const t0 = Math.min(...s.people.map((w) => leaveOf(s, w))) - 2;
  const t1 = Math.max(...s.people.map((w) => w.cls)) + 1;
  const e = play ? f.now - play : -1;
  const playing = e >= 0 && e < PLAY_MS;
  const nowMin = playing ? t0 + ((t1 - t0) * e) / PLAY_MS : -1;
  g.textAlign = "center";
  g.textBaseline = "middle";
  s.people.forEach((w, i) => {
    const col = inChat(ctx, w.id) ? userColor(w.id, t) : c.secondaryButton;
    const lv = leaveOf(s, w);
    let x: number;
    let y: number;
    if (playing) {
      const q = (nowMin - lv) / w.walk;
      const at = q <= 0 ? { x: s.home.x, y: s.home.y } : along(routeOf(s, w), q);
      x = X(at.x) + (q <= 0 ? (i - (s.people.length - 1) / 2) * 6 : 0);
      y = Y(at.y) - (q <= 0 ? 0 : 0);
    } else {
      x = X(s.home.x) + 30 + (i % 3) * 30;
      y = Y(s.home.y) - 20 - Math.floor(i / 3) * 30;
    }
    g.beginPath();
    g.arc(x, y, 10, 0, Math.PI * 2);
    g.fillStyle = col;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = w.id === me ? c.primary : c.card;
    g.stroke();
    g.fillStyle = c.onPrimary;
    g.font = `700 10px ${t.type.family}`;
    g.fillText((members.find((m) => m.id === w.id)?.name ?? w.name)[0]?.toUpperCase() ?? "?", x, y + 0.5);
  });
  if (playing) {
    const lab = hm(Math.floor(nowMin));
    g.font = `700 15px ${t.type.family}`;
    const tw = g.measureText(lab).width + 16;
    g.fillStyle = c.card;
    g.beginPath();
    g.roundRect(W / 2 - tw / 2, 8, tw, 24, 12);
    g.fill();
    g.fillStyle = c.text;
    g.fillText(lab, W / 2, 20.5);
  }
  return playing;
}

export default defineApp<State, Action, Local>({
  name: "Walk to nine",
  summary: (s) => {
    const groups = s.people.filter((w) => !w.with).length;
    return `${s.title}: ${s.people.length} walking in ${groups} group${groups === 1 ? "" : "s"} · first out at ${hm(Math.min(...s.people.map((w) => leaveOf(s, w)), 9999))}`;
  },
  init: initState,
  reduce: reduceW,

  invariants: {
    "nobody walks with a follower": (s) => s.people.every((w) => !w.with || s.people.some((l) => l.id === w.with && !l.with)),
    "nobody walks with themselves": (s) => s.people.every((w) => w.with !== w.id),
    "nobody leaves after they must": (s) => s.people.every((w) => leaveOf(s, w) <= own(w)),
    "walks go to real places": (s) => s.people.every((w) => Number.isInteger(w.to) && w.to >= 0 && w.to < s.places.length && w.walk > 0),
    "one walker each": (s) => new Set(s.people.map((w) => w.id)).size === s.people.length && s.people.length <= 6,
    "classes are in the day": (s) => s.people.every((w) => Number.isInteger(w.cls) && w.cls >= 360 && w.cls <= 1320),
  },

  transitions: {
    "pairing sets yours and brings your followers": (p, n, a, m) =>
      a.t !== "pair" || p === n || (n.people.find((w) => w.id === m.user)?.with === a.with && p.people.filter((w) => w.with === m.user).every((w) => n.people.find((x) => x.id === w.id)?.with === a.with) && n.pairs === p.pairs + 1),
    "a fair pair goes through": (p, n, a, m, ctx) => a.t !== "pair" || !inChat(ctx, m.user) || p.people.find((w) => w.id === m.user)?.with === a.with || !buddies(p, m.user).some((w) => w.id === a.with) || n.people.find((w) => w.id === m.user)?.with === a.with,
    "you only pair with a real buddy": (p, n, a, m) => a.t !== "pair" || p === n || buddies(p, m.user).some((w) => w.id === a.with),
    "solo frees only you": (p, n, a, m) => a.t !== "solo" || p === n || (n.people.find((w) => w.id === m.user)?.with === "" && n.people.filter((w) => w.id !== m.user).every((w) => JSON.stringify(w) === JSON.stringify(p.people.find((x) => x.id === w.id)))),
    "joining adds you once, walking alone": (p, n, a, m) => a.t !== "join" || p === n || (!p.people.some((w) => w.id === m.user) && n.people.length === p.people.length + 1 && n.people[n.people.length - 1]!.id === m.user && n.people[n.people.length - 1]!.with === "" && n.people[n.people.length - 1]!.cls === a.at),
    "classes never move": (p, n) => n.people.every((w) => { const o = p.people.find((x) => x.id === w.id); return !o || o.cls === w.cls && o.walk === w.walk && o.to === w.to; }),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const me = s.people.find((w) => w.id === user);
    if (!me) return { t: "join", to: r.int(s.places.length), at: 480 + 30 * r.int(5) };
    if (me?.with && r.next() < 0.5) return { t: "solo" };
    const bs = buddies(s, user);
    if (bs.length && r.next() < 0.85) return { t: "pair", with: r.pick(bs).id };
    return r.next() < 0.5 ? { t: "solo" } : { t: "pair", with: r.pick(s.people.length ? s.people : [{ id: user } as Walker]).id };
  },

  local: { play: 0, toast: 0, msg: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const ctx: Ctx = { room: "", members };
    const mine = state.people.find((w) => w.id === me);
    const nm = (id: string) => (id === me ? "You" : first(members.find((m) => m.id === id)?.name ?? state.people.find((w) => w.id === id)?.name ?? "Someone"));
    const bs = buddies(state, me);
    const lead = mine?.with ? state.people.find((w) => w.id === mine.with) : undefined;
    const followers = state.people.filter((w) => w.with && w.with === (lead ? lead.id : me));
    const noted = state.people.find((w) => w.note && w.id !== me);

    let line: string;
    let action;
    if (!mine) {
      line = `${state.people.length} walking · first out at ${hm(Math.min(...state.people.map((w) => leaveOf(state, w)), 9999))}`;
      const lead0 = state.people[0];
      action = (
        <Button kind="primary" onClick={() => { dispatch({ t: "join", to: lead0 ? lead0.to : 0, at: lead0 ? lead0.cls : 540 }); setLocal({ toast: local.toast + 1, msg: "You're on the map" }); }}>
          Add my walk
        </Button>
      );
    } else if (lead) {
      line = `You leave with ${nm(lead.id)} at ${hm(leaveOf(state, mine))} · ${[lead, ...followers].filter((w) => w.id !== me).length + 1} walking`;
      action = <Button kind="secondary" onClick={() => dispatch({ t: "solo" })}>Go solo</Button>;
    } else if (bs.length) {
      const b = bs[0]!;
      line = `You leave at ${hm(own(mine))} · ${nm(b.id)} heads out at ${hm(own(b))}`;
      action = (
        <Button kind="primary" onClick={() => { haptic("success"); dispatch({ t: "pair", with: b.id }); setLocal({ toast: local.toast + 1, msg: `Walking with ${nm(b.id)} at ${hm(own(b))}` }); }}>
          {`Walk with ${nm(b.id)}`}
        </Button>
      );
    } else {
      line = followers.length ? `${followers.map((w) => nm(w.id)).join(", ")} walking with you at ${hm(own(mine))}` : `You leave at ${hm(own(mine))} · nobody heads out then`;
    }

    return (
      <div>
        <CardHeader title={state.title} subtitle={noted ? `${nm(noted.id)}: “${noted.note}”` : `From ${state.home.name}`} />
        <Canvas
          height={H}
          label={`Campus map: ${state.people.map((w) => `${nm(w.id)} to ${state.places[w.to]?.name ?? "class"}, leaves ${hm(leaveOf(state, w))}`).join("; ")}`}
          draw={(g, f) => drawMap(g, f, state, me, members, ctx, local.play)}
        />
        <div style={{ marginTop: 8, display: "flex", gap: 6, height: 30, overflow: "hidden" }}>
          {[...state.people].sort((a, b) => leaveOf(state, a) - leaveOf(state, b)).slice(0, theme.width < 360 ? 3 : 4).map((w) => (
            <div key={w.id} style={{ flex: "none", display: "flex", alignItems: "center", gap: 4, padding: "0 10px 0 4px", borderRadius: 15, background: w.id === me ? c.selected : c.wash, fontSize: 13, whiteSpace: "nowrap" }}>
              <span style={{ width: 20, height: 20, borderRadius: 10, background: inChat(ctx, w.id) ? userColor(w.id, theme) : c.secondaryButton, color: inChat(ctx, w.id) ? c.onPrimary : c.secondaryButtonText, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{((members.find((m) => m.id === w.id)?.name ?? w.name)[0] ?? "?").toUpperCase()}</span>
              <span style={{ fontWeight: 600, color: c.text }}>{hm(leaveOf(state, w))}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: "18px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</div>
        <div style={{ marginTop: 6, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <Button kind="secondary" onClick={() => setLocal({ play: clock.value })}>Play morning</Button>
          <span style={{ flex: 1 }} />
          {action}
        </div>
        {local.toast > 0 ? <Toast key={local.toast}>{local.msg}</Toast> : null}
      </div>
    );
  },
});
