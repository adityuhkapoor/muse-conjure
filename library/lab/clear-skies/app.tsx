import {
  defineApp,
  Button,
  Burst,
  Canvas,
  CardHeader,
  Facepile,
  Locked,
  Toast,
  fitText,
  haptic,
  mix,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Weeks of "i can't that weekend": the month drawn as a weather map. Every conflict Muse read in
// the chat is a cloud over its days; one weekend is open sky. Drag the sun onto it, the clouds
// part, and the trip goes on everyone's calendar. Tap a weekend to add your own cloud.

type Params = {
  /** Card title: "Spring break or bust" */
  title: string;
  /** Under the title: "weeks of “i can't that weekend”" */
  sub: string;
  /** Month name: "April" */
  month: string;
  /** Short month for dates: "Apr" */
  mon: string;
  /** Weekday of the 1st, 0 = Monday to 6 = Sunday. */
  first: number;
  /** Days in the month (28 to 31). */
  days: number;
  /** What it becomes once the sun lands: "Spring break trip" */
  plan: string;
  /** Everyone on the trip, by name. */
  crew: string[];
  /** Conflicts read from the chat: who, what, first and last day. */
  clouds: { name: string; what: string; from: number; to: number }[];
};

// @params
const P: Params = {
  title: "Spring break or bust",
  sub: "weeks of “i can't that weekend”",
  month: "April",
  mon: "Apr",
  first: 1,
  days: 30,
  plan: "Spring break trip",
  crew: ["Aditya", "Calvin", "Arun", "Tsai Lin", "Will", "Maya"],
  clouds: [
    { name: "Arun", what: "cousin's wedding", from: 4, to: 6 },
    { name: "Tsai Lin", what: "formal", from: 11, to: 12 },
    { name: "Calvin", what: "MCAT", from: 18, to: 19 },
    { name: "Will", what: "Sube inspection lol", from: 15, to: 15 },
    { name: "Maya", what: "orgo midterm", from: 22, to: 23 },
  ],
};
// @end params

type Cloud = { id: string; who: string; name: string; what: string; from: number; to: number };
type State = {
  title: string;
  sub: string;
  month: string;
  mon: string;
  first: number;
  days: number;
  plan: string;
  crew: string[];
  names: Record<string, string>;
  clouds: Cloud[];
  sun: { week: number; at: number; by: string } | null;
  miss: { week: number; at: number; by: string; cloud: string } | null;
  tries: number;
  cal: string[];
};
type Action = { t: "sun"; week: number } | { t: "cant"; week: number } | { t: "cal" };
type Local = { drag: number; x: number; y: number; burst: number };

const TAU = Math.PI * 2;
const TOP = 40;
const HEAD = 18;
const ROW = 38;
const PART = 1400;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seeded = (who: string) => who.startsWith("~");
const firstName = (n: string) => n.split(" ")[0] ?? n;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const rows = (s: State) => Math.ceil((s.first + s.days) / 7);
const cellOf = (s: State, day: number) => ({ row: Math.floor((s.first + day - 1) / 7), col: (s.first + day - 1) % 7 });
/** Weekend w: its Friday to Sunday days inside the month. */
const weekend = (s: State, w: number) => [4, 5, 6].map((col) => w * 7 + col - s.first + 1).filter((d) => d >= 1 && d <= s.days);
const weekends = (s: State) => Array.from({ length: rows(s) }, (_, w) => w).filter((w) => weekend(s, w).length > 0);
const blockers = (s: State, w: number) => {
  const ds = weekend(s, w);
  return s.clouds.filter((c) => ds.some((d) => d >= c.from && d <= c.to));
};
const range = (s: State, w: number) => {
  const ds = weekend(s, w);
  return ds.length ? `${s.mon} ${ds[0]}${ds.length > 1 ? `–${ds[ds.length - 1]}` : ""}` : "";
};
const nameOf = (s: State, who: string) => s.names[who] ?? (seeded(who) ? who.slice(1) : "Someone");
const memberOf = (s: State, who: string): Member => ({ id: who, name: nameOf(s, who) });

function initState(ctx: Ctx): State {
  const names: Record<string, string> = {};
  const bind = (raw: string) => {
    const name = clean(raw, 20);
    if (!name) return "";
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    names[who] = m ? m.name : name;
    return who;
  };
  const crew: string[] = [];
  for (const n of P.crew.slice(0, 12)) {
    const w = bind(n);
    if (w && !crew.includes(w)) crew.push(w);
  }
  for (const m of ctx.members) {
    if (crew.length >= 16 || crew.includes(m.id)) continue;
    names[m.id] = m.name;
    crew.push(m.id);
  }
  const days = Number.isInteger(P.days) ? Math.min(31, Math.max(28, P.days)) : 30;
  const clouds: Cloud[] = [];
  for (const c of P.clouds) {
    if (clouds.length >= 10) break;
    const who = bind(c.name);
    const from = Number.isInteger(c.from) ? Math.min(days, Math.max(1, c.from)) : 0;
    const to = Number.isInteger(c.to) ? Math.min(days, Math.max(from, c.to)) : from;
    if (!who || !from) continue;
    clouds.push({ id: `c${clouds.length}`, who, name: names[who] ?? "", what: clean(c.what, 24), from, to });
  }
  return {
    title: clean(P.title, 40) || "Clear skies",
    sub: clean(P.sub, 60),
    month: clean(P.month, 12) || "This month",
    mon: clean(P.mon, 4) || "",
    first: Number.isInteger(P.first) ? Math.min(6, Math.max(0, P.first)) : 0,
    days,
    plan: clean(P.plan, 30) || "The trip",
    crew,
    names,
    clouds,
    sun: null,
    miss: null,
    tries: 0,
    cal: [],
  };
}

function cloudShape(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // One filled union: a pill body and bumps along the top (nonzero fill, no seams).
  g.roundRect(x, y + h * 0.3, w, h * 0.7, (h * 0.7) / 2);
  const bumps = Math.max(1, Math.round(w / 22));
  for (let i = 0; i < bumps; i++) {
    const bx = x + ((i + 0.5) * w) / bumps;
    const r = h * (i % 2 ? 0.36 : 0.44);
    g.moveTo(bx + r, y + h * 0.42);
    g.arc(bx, y + h * 0.42, r, 0, TAU);
  }
}

function sunAt(g: CanvasRenderingContext2D, t: Theme, x: number, y: number, r: number, spin: number) {
  const c = t.color;
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = spin + (k / 10) * TAU;
    g.moveTo(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3));
    g.lineTo(x + Math.cos(a) * (r + 8), y + Math.sin(a) * (r + 8));
  }
  g.lineWidth = 2.5;
  g.lineCap = "round";
  g.strokeStyle = c.series2;
  g.stroke();
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = c.series2;
  g.fill();
  const ink = t.mode === "dark" ? c.wash : c.text;
  g.beginPath();
  g.arc(x - r * 0.35, y - r * 0.15, 1.6, 0, TAU);
  g.moveTo(x + r * 0.35 + 1.6, y - r * 0.15);
  g.arc(x + r * 0.35, y - r * 0.15, 1.6, 0, TAU);
  g.fillStyle = ink;
  g.fill();
  g.beginPath();
  g.arc(x, y + r * 0.1, r * 0.35, 0.15 * Math.PI, 0.85 * Math.PI);
  g.lineWidth = 1.5;
  g.strokeStyle = ink;
  g.stroke();
}

function drawMap(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, local: Local) {
  const t = f.theme;
  const c = t.color;
  const dk = t.mode === "dark";
  const ink = dk ? c.wash : c.text;
  const W = f.width;
  const cw = W / 7;
  const R = rows(s);
  let anim = local.drag > 0;
  const sunE = s.sun ? running(s.sun.at, PART) : null;
  const missE = s.miss ? running(s.miss.at, 1200) : null;
  if (sunE !== null || missE !== null) anim = true;
  const part = s.sun ? (sunE === null ? 1 : sunE / PART) : 0;

  // Sky map.
  g.beginPath();
  g.roundRect(0, TOP, W, HEAD + R * ROW + 4, 12);
  g.fillStyle = mix(c.series1, c.card, dk ? 0.7 : 0.82);
  g.fill();
  // Weekday letters.
  g.font = `600 11px ${t.type.family}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  ["M", "T", "W", "T", "F", "S", "S"].forEach((d, i) => {
    g.fillStyle = c.text;
    g.fillText(d, cw * i + cw / 2, TOP + 10);
  });
  // Weekend bands.
  for (const w of weekends(s)) {
    const y = TOP + HEAD + w * ROW;
    const open = blockers(s, w).length === 0;
    const isSun = s.sun?.week === w;
    g.beginPath();
    g.roundRect(cw * 4 + 2, y + 2, cw * 3 - 4, ROW - 4, 8);
    g.fillStyle = isSun ? mix(c.series2, c.card, 0.55 - 0.25 * part) : open ? mix(c.series1, c.card, dk ? 0.55 : 0.6) : mix(c.series1, c.card, dk ? 0.62 : 0.72);
    g.fill();
    if (open && !s.sun) {
      g.setLineDash([4, 3]);
      g.lineWidth = 1.5;
      g.strokeStyle = c.series2;
      g.stroke();
      g.setLineDash([]);
    }
  }
  // Day numbers, one font.
  g.font = `500 11px ${t.type.family}`;
  g.textAlign = "left";
  g.textBaseline = "top";
  for (let d = 1; d <= s.days; d++) {
    const { row, col } = cellOf(s, d);
    g.fillStyle = c.text;
    g.fillText(`${d}`, col * cw + 5, TOP + HEAD + row * ROW + 3);
  }
  // Rays from the sun's weekend.
  if (s.sun) {
    const y = TOP + HEAD + s.sun.week * ROW + ROW / 2;
    const x = cw * 5.5;
    sunAt(g, t, x, y, 9, f.now / 900);
    anim = true;
  }

  // Clouds, split per row; they drift apart when the sun lands.
  for (const cl of s.clouds) {
    for (let r = cellOf(s, cl.from).row; r <= cellOf(s, cl.to).row; r++) {
      const a = Math.max(cl.from, r * 7 - s.first + 1);
      const b = Math.min(cl.to, r * 7 - s.first + 7);
      const ca = cellOf(s, a).col;
      const cb = cellOf(s, b).col;
      let x = ca * cw + 3;
      const w = (cb - ca + 1) * cw - 6;
      let y = TOP + HEAD + r * ROW + 13;
      const near = s.sun ? Math.abs(r - s.sun.week) : 9;
      if (s.sun && near <= 1) x += (ca + cb >= 6 ? 1 : -1) * part * 8 * (2 - near);
      const shake = s.miss && missE !== null && s.miss.cloud === cl.id ? Math.sin(missE / 25) * 2 * (1 - missE / 1200) : 0;
      x += shake;
      g.beginPath();
      cloudShape(g, x, y, w, ROW - 15);
      g.fillStyle = mix(c.card, c.secondaryText, dk ? 0.3 : 0.12);
      if (dk) g.fillStyle = mix(c.text, c.card, 0.3);
      g.fill();
      // Face dot and label.
      const fy = y + (ROW - 15) * 0.65;
      g.beginPath();
      g.arc(x + 9, fy, 6, 0, TAU);
      g.fillStyle = userColor(memberOf(s, cl.who), t);
      g.fill();
      const label = w > 70 ? `${cl.name}'s ${cl.what}` : cl.what;
      let fit = fitText(label, w - 22, { g, size: 11, min: 10, weight: 600 });
      if (fit.text !== label) fit = fitText(cl.what, w - 22, { g, size: 11, min: 10, weight: 600 });
      if (fit.text && (fit.text === label || fit.text === cl.what || fit.text.length > 5)) {
        g.font = fit.font;
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.fillStyle = dk ? c.wash : c.text;
        g.fillText(fit.text, x + 18, fy + 0.5);
      }
      // Lightning when the sun was sent here.
      if (s.miss && missE !== null && s.miss.cloud === cl.id && Math.floor(missE / 120) % 2 === 0) {
        g.beginPath();
        g.moveTo(x + w / 2, y + ROW - 14);
        g.lineTo(x + w / 2 - 5, y + ROW - 4);
        g.lineTo(x + w / 2 + 1, y + ROW - 5);
        g.lineTo(x + w / 2 - 3, y + ROW + 4);
        g.lineWidth = 2;
        g.strokeStyle = c.series2;
        g.stroke();
      }
    }
  }

  // The sun, parked or in hand.
  if (!s.sun) {
    const held = local.drag > 0;
    const sx = held ? local.x : 24;
    const sy = held ? local.y : 20;
    const bob = held ? 0 : Math.sin(f.now / 500) * 1.5;
    anim = true;
    sunAt(g, t, sx, sy + bob, 11, f.now / 1400);
    if (!held) {
      const hint = fitText(s.miss ? "Not that one. Try the open sky" : "Drag the sun to the open weekend", W - 60, { g, size: 13, min: 11, weight: 500 });
      g.font = hint.font;
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillStyle = c.secondaryText;
      g.fillText(hint.text, 48, 20);
    }
  } else {
    const done = fitText(`${range(s, s.sun.week)} · clear skies`, W - 20, { g, size: 13, min: 11, weight: 600 });
    g.font = done.font;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillStyle = c.text;
    g.fillText(done.text, 4, 20);
  }
  void ink;
  void me;
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Clear skies",
  summary: (s) => {
    if (s.sun) return `${s.plan} · ${range(s, s.sun.week)} · on ${s.cal.length} of ${s.crew.length} calendars`;
    const open = weekends(s).filter((w) => blockers(s, w).length === 0);
    return `${s.title}: ${open.length} open ${open.length === 1 ? "weekend" : "weekends"} in ${s.month}`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "sun") {
      if (s.sun || !Number.isInteger(a.week) || !weekends(s).includes(a.week)) return s;
      const b = blockers(s, a.week);
      if (b.length) return { ...s, miss: { week: a.week, at: m.time, by: m.user, cloud: b[0]!.id }, tries: s.tries + 1 };
      return { ...s, sun: { week: a.week, at: m.time, by: m.user }, miss: null, tries: s.tries + 1, cal: [m.user] };
    }
    if (a.t === "cant") {
      if (s.sun || !Number.isInteger(a.week) || !weekends(s).includes(a.week)) return s;
      const ds = weekend(s, a.week);
      const mine = s.clouds.findIndex((c) => c.who === m.user && c.from === ds[0] && c.to === ds[ds.length - 1] && c.what === "can't");
      if (mine >= 0) return { ...s, clouds: s.clouds.filter((_, i) => i !== mine) };
      if (s.clouds.length >= 16) return s;
      const name = ctx.members.find((x) => x.id === m.user)?.name ?? "Friend";
      return { ...s, names: { ...s.names, [m.user]: name }, clouds: [...s.clouds, { id: `m${m.seq}`, who: m.user, name, what: "can't", from: ds[0]!, to: ds[ds.length - 1]! }] };
    }
    if (a.t === "cal") {
      if (!s.sun) return s;
      return { ...s, cal: s.cal.includes(m.user) ? s.cal.filter((u) => u !== m.user) : [...s.cal, m.user] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const names = { ...s.names };
    const crew = s.crew.filter((u) => seeded(u) || inChat(ctx, u));
    for (const m of ctx.members) {
      if (crew.length >= 16 || crew.includes(m.id)) continue;
      names[m.id] = m.name;
      crew.push(m.id);
    }
    return { ...s, names, crew, cal: s.cal.filter((u) => inChat(ctx, u)) };
  },

  invariants: {
    "the sun only sits on open sky": (s) => s.sun === null || (weekends(s).includes(s.sun.week) && blockers(s, s.sun.week).length === 0),
    "a miss names a cloud over that weekend": (s) => s.miss === null || blockers(s, s.miss.week).some((c) => c.id === s.miss!.cloud),
    "clouds sit inside the month": (s) => s.clouds.every((c) => Number.isInteger(c.from) && Number.isInteger(c.to) && c.from >= 1 && c.from <= c.to && c.to <= s.days),
    "cloud ids are unique": (s) => new Set(s.clouds.map((c) => c.id)).size === s.clouds.length,
    "calendars only after the sun lands, once each": (s, ctx) => (s.sun !== null || s.cal.length === 0) && new Set(s.cal).size === s.cal.length && s.cal.every((u) => inChat(ctx, u)),
    "tries count every drop": (s) => Number.isInteger(s.tries) && s.tries >= (s.sun ? 1 : 0) + (s.miss ? 1 : 0) - (s.sun && s.miss ? 1 : 0),
  },

  transitions: {
    "a drop lands on open sky or misses on a cloud": (p, n, a, m) => {
      if (a.t !== "sun" || p === n) return true;
      const b = blockers(p, a.week);
      if (b.length) return n.sun === null && n.miss?.week === a.week && n.miss.cloud === b[0]!.id && n.miss.at === m.time && n.tries === p.tries + 1;
      return n.sun?.week === a.week && n.sun.by === m.user && n.sun.at === m.time && n.cal.join() === m.user && n.tries === p.tries + 1;
    },
    "the sun stays once it lands": (p, n) => p.sun === null || (JSON.stringify(p.sun) === JSON.stringify(n.sun) && JSON.stringify(p.clouds) === JSON.stringify(n.clouds)),
    "a can't cloud is the sender's own": (p, n, a, m) => {
      if (a.t !== "cant" || p === n) return true;
      const added = n.clouds.filter((c) => !p.clouds.some((x) => x.id === c.id));
      const gone = p.clouds.filter((c) => !n.clouds.some((x) => x.id === c.id));
      return added.length + gone.length === 1 && [...added, ...gone].every((c) => c.who === m.user && c.what === "can't");
    },
    "only a can't changes clouds": (p, n, a) => a.t === "cant" || JSON.stringify(p.clouds) === JSON.stringify(n.clouds),
    "calendar toggles only the sender": (p, n, a, m) => {
      if (a.t !== "cal" || p === n) return true;
      const diff = [...p.cal.filter((u) => !n.cal.includes(u)), ...n.cal.filter((u) => !p.cal.includes(u))];
      return diff.length === 1 && diff[0] === m.user;
    },
    "unknown actions change nothing": (p, n, a) => a.t === "sun" || a.t === "cant" || a.t === "cal" || JSON.stringify(p) === JSON.stringify(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => {
    if (s.sun) return { t: "cal" };
    const ws = weekends(s);
    if (r.next() < 0.25) return { t: "cant", week: r.pick(ws) };
    return { t: "sun", week: r.pick(ws) };
  },

  local: { drag: 0, x: 0, y: 0, burst: 0 },

  view: ({ state, confirmed, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = confirmed;
    const R = rows(s);
    const H = TOP + HEAD + R * ROW + 6;
    const W = theme.width - 2 * theme.space.card;
    const open = weekends(s).filter((w) => blockers(s, w).length === 0);
    const best = open[0];
    const miss = s.miss ? s.clouds.find((x) => x.id === s.miss!.cloud) : undefined;
    const label = `${s.month} as a weather map. ${s.clouds.map((x) => `${x.name} ${x.what} ${s.mon} ${x.from}${x.to > x.from ? `–${x.to}` : ""}`).join(", ")}. ${open.length ? `Open: ${open.map((w) => range(s, w)).join(", ")}` : "No open weekend"}`;
    const weekAt = (y: number) => Math.floor((y - TOP - HEAD) / ROW);
    const drop = (w: number) => {
      haptic(blockers(s, w).length ? "light" : "success");
      if (!blockers(s, w).length) setLocal({ drag: 0, burst: local.burst + 1 });
      else setLocal({ drag: 0 });
      dispatch({ t: "sun", week: w });
    };
    const onPointer = (e: { type: string; x: number; y: number }) => {
      if (s.sun) return;
      if (e.type === "down") {
        if (Math.hypot(e.x - 24, e.y - 20) < 30) setLocal({ drag: 1, x: e.x, y: e.y });
        return;
      }
      if (e.type === "move" && local.drag) return setLocal({ x: e.x, y: e.y });
      if (e.type === "up") {
        const w = weekAt(e.y);
        if (local.drag) {
          if (weekends(s).includes(w) && e.x > (W * 3) / 7) drop(w);
          else setLocal({ drag: 0 });
        } else if (weekends(s).includes(w) && e.x > (W * 4) / 7) dispatch({ t: "cant", week: w });
      }
    };

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={H} label={label} drag draw={(g, f) => drawMap(g, f, s, me, local)} onPointer={onPointer} />
        {s.sun ? (
          <div style={{ position: "relative", marginTop: 6 }}>
            {local.burst > 0 ? (
              <div style={{ position: "absolute", left: "50%", top: 0, pointerEvents: "none" }}>
                <Burst key={local.burst} emoji="☀️" />
              </div>
            ) : null}
            <Locked detail={`${range(s, s.sun.week)} · on ${s.cal.length} of ${s.crew.length} calendars`}>{s.plan}</Locked>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minWidth: 0 }}>
              <Facepile users={s.cal.map((u) => memberOf(s, u))} max={5} size={24} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>{s.cal.includes(me) ? "It's on your calendar" : "Add it to yours"}</span>
              <Button kind={s.cal.includes(me) ? "secondary" : "primary"} onClick={() => dispatch({ t: "cal" })}>
                {s.cal.includes(me) ? "Remove" : "Add to mine"}
              </Button>
            </div>
            {local.burst > 0 ? <Toast key={local.burst}>{`${range(s, s.sun.week)} is on the calendar`}</Toast> : null}
          </div>
        ) : (
          <div>
            <div style={{ height: 30, display: "flex", alignItems: "center", fontSize: 13, color: c.secondaryText, minWidth: 0, ...ell }}>
              {miss ? `${firstName(miss.name)}'s ${miss.what} is that weekend` : `${s.clouds.length} conflicts read from the chat · tap a weekend you can't do`}
            </div>
            <Button kind="primary" wide disabled={best === undefined} onClick={() => best !== undefined && drop(best)}>
              {best === undefined ? "No open weekend" : `Pick ${range(s, best)}`}
            </Button>
          </div>
        )}
      </div>
    );
  },
});
