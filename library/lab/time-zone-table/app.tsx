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
  tween,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
  type Theme,
} from "@muse/app";

// Winter break, everyone says "we should call". A round table with each friend's clock and face,
// awake or asleep at their local hour. Drag the hour hand in the middle and every clock turns;
// find the hour nobody is asleep and send the invite.

type Params = {
  /** Card title: "We should call" */
  title: string;
  /** Under the title: "winter break · six time zones" */
  sub: string;
  /** Day the call is on, in the home zone: "Sun" */
  day: string;
  /** Name of the home zone: "ET" */
  zone: string;
  /** Starting hour of the dial in the home zone (0 to 23). */
  start: number;
  /** Everyone: city, offset from the home zone in hours, and the hours they're awake (local, wake 0-23, sleep up to 30 for past midnight). */
  people: { name: string; city: string; offset: number; wake: number; sleep: number; said: string }[];
};

// @params
const P: Params = {
  title: "We should call",
  sub: "winter break · six cities, one call",
  day: "Sun",
  zone: "ET",
  start: 23,
  people: [
    { name: "Will", city: "Seoul", offset: 14, wake: 9, sleep: 24, said: "we should call fr" },
    { name: "Maya", city: "Denver", offset: -2, wake: 8, sleep: 24, said: "" },
    { name: "Arun", city: "New Jersey", offset: 0, wake: 10, sleep: 26, said: "up late, rice cooker's on" },
    { name: "Tsai Lin", city: "Vancouver", offset: -3, wake: 8, sleep: 24, said: "i pick the call music" },
    { name: "Calvin", city: "Chicago", offset: -1, wake: 6, sleep: 22, said: "asleep by 10. seven alarms." },
    { name: "Aditya", city: "Eastfield", offset: 0, wake: 9, sleep: 25, said: "lowkey any time" },
  ],
};
// @end params

type Person = { who: string; name: string; city: string; offset: number; wake: number; sleep: number; said: string };
type State = {
  title: string;
  sub: string;
  day: string;
  zone: string;
  people: Person[];
  h: number;
  from: number;
  turnedAt: number;
  turnedBy: string;
  invite: { h: number; by: string; at: number } | null;
  yes: string[];
};
type Action = { t: "turn"; h: number } | { t: "invite" } | { t: "yes" };
type Local = { drag: number; dh: number; burst: number };

const TAU = Math.PI * 2;
const CH = 230;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const turn = tween({ duration: 500, easing: "standard" });
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seeded = (who: string) => who.startsWith("~");
const firstName = (n: string) => n.split(" ")[0] ?? n;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const localH = (p: Person, h: number) => mod(h + p.offset, 24);
const awake = (p: Person, h: number) => {
  const l = localH(p, h);
  return (l >= p.wake && l < p.sleep) || l + 24 < p.sleep;
};
const asleep = (s: State, h: number) => s.people.filter((p) => !awake(p, h));
const ampm = (h: number) => `${mod(h, 12) === 0 ? 12 : mod(h, 12)}${h < 12 ? "am" : "pm"}`;
const dayOf = (s: State, p: Person, h: number) => {
  const i = DAYS.findIndex((d) => d.toLowerCase() === s.day.toLowerCase());
  return i < 0 ? "" : DAYS[mod(i + Math.floor((h + p.offset) / 24), 7)]!;
};
const memberOf = (p: Person): Member => ({ id: p.who, name: p.name });
const farthest = (s: State) => s.people.reduce<Person | null>((a, p) => (a === null || Math.abs(p.offset) > Math.abs(a.offset) ? p : a), null);

function initState(ctx: Ctx): State {
  const people: Person[] = [];
  const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : d);
  for (const raw of P.people) {
    if (people.length >= 8) break;
    const name = clean(raw.name, 20);
    if (!name) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (people.some((x) => x.who === who)) continue;
    const wake = int(raw.wake, 0, 23, 8);
    people.push({ who, name, city: clean(raw.city, 16), offset: int(raw.offset, -12, 14, 0), wake, sleep: int(raw.sleep, wake + 1, 30, 24), said: clean(raw.said, 50) });
  }
  for (const m of ctx.members) {
    if (people.length >= 8 || people.some((x) => x.who === m.id)) continue;
    people.push({ who: m.id, name: clean(m.name, 20) || "Friend", city: "", offset: 0, wake: 8, sleep: 24, said: "" });
  }
  const h = int(P.start, 0, 23, 20);
  return { title: clean(P.title, 40) || "We should call", sub: clean(P.sub, 60), day: clean(P.day, 3) || "Sun", zone: clean(P.zone, 6) || "ET", people, h, from: h, turnedAt: 0, turnedBy: "", invite: null, yes: [] };
}

function clockFace(g: CanvasRenderingContext2D, t: Theme, x: number, y: number, r: number, hour: number, up: boolean) {
  const c = t.color;
  const ink = t.mode === "dark" ? c.wash : c.text;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = up ? mix(c.series2, t.mode === "dark" ? c.text : c.card, 0.7) : mix(c.series6, ink, 0.45);
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = up ? mix(c.series2, ink, 0.3) : mix(c.series6, c.card, 0.3);
  g.stroke();
  const a = (hour / 12) * TAU - Math.PI / 2;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
  g.lineWidth = 2.2;
  g.lineCap = "round";
  g.strokeStyle = up ? ink : c.card;
  g.stroke();
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - r * 0.82);
  g.lineWidth = 1.2;
  g.stroke();
}

function drawTable(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string, dialH: number, dragging: boolean) {
  const t = f.theme;
  const c = t.color;
  const dk = t.mode === "dark";
  const ink = dk ? c.wash : c.text;
  const W = f.width;
  const cx = W / 2;
  const cy = 117;
  const e = s.turnedAt ? running(s.turnedAt, 500) : null;
  const h = dragging ? dialH : e !== null ? s.from + (dialH - s.from) * turn(e) : dialH;

  // Table.
  g.beginPath();
  g.ellipse(cx, cy + 6, Math.min(W / 2 - 70, 120), 58, 0, 0, TAU);
  g.fillStyle = mix(c.series5, ink, dk ? 0.5 : 0.35);
  g.fill();
  g.beginPath();
  g.ellipse(cx, cy, Math.min(W / 2 - 70, 120), 58, 0, 0, TAU);
  g.fillStyle = mix(c.series5, c.card, dk ? 0.35 : 0.45);
  g.fill();

  // Center dial: 24 hours, day on top half, night on bottom.
  const R = 36;
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.fillStyle = c.card;
  g.fill();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU - Math.PI / 2;
    const ok = asleep(s, k).length === 0;
    g.beginPath();
    g.arc(cx, cy, R - 4, a - TAU / 48 + 0.02, a + TAU / 48 - 0.02);
    g.lineWidth = 6;
    g.lineCap = "butt";
    g.strokeStyle = ok ? c.positive : k >= 7 && k < 19 ? mix(c.series2, c.card, 0.4) : mix(c.series6, c.card, 0.3);
    g.stroke();
  }
  const ha = (h / 24) * TAU - Math.PI / 2;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(ha) * (R - 9), cy + Math.sin(ha) * (R - 9));
  g.lineWidth = 3.5;
  g.lineCap = "round";
  g.strokeStyle = c.primary;
  g.stroke();
  g.beginPath();
  g.arc(cx + Math.cos(ha) * (R - 9), cy + Math.sin(ha) * (R - 9), 5, 0, TAU);
  g.fillStyle = c.primary;
  g.fill();
  const hr = Math.round(mod(h, 24));
  g.font = `700 13px ${t.type.family}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = c.text;
  g.fillText(ampm(hr), cx, cy + 12);
  g.font = `600 10px ${t.type.family}`;
  g.fillStyle = c.secondaryText;
  g.fillText(s.zone, cx, cy - 13);

  // Seats around the table.
  const n = s.people.length;
  const rx = Math.min(W / 2 - 50, 160);
  const ry = 80;
  s.people.forEach((p, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) / n) * TAU;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    const lh = mod(hr + p.offset, 24);
    const up = awake(p, hr);
    const col = userColor(memberOf(p), t);
    // Small clock on the table edge, toward the middle.
    const side = Math.abs(Math.cos(a)) < 0.3 ? 0 : x < cx ? 1 : -1;
    const kx = side === 0 ? x : x + side * 30;
    const ky = side === 0 ? y + (y < cy ? 30 : -34) : y - 4;
    clockFace(g, t, kx, ky, 11, lh + (h - Math.floor(h)), up);
    // Head: awake or asleep with a nightcap.
    g.beginPath();
    g.arc(x, y - 4, 14, 0, TAU);
    g.fillStyle = up ? col : mix(col, ink, 0.45);
    g.fill();
    if (p.who === me) {
      g.lineWidth = 2.5;
      g.strokeStyle = c.primary;
      g.stroke();
    }
    g.beginPath();
    if (up) {
      g.arc(x - 4.5, y - 6, 1.7, 0, TAU);
      g.moveTo(x + 6.2, y - 6);
      g.arc(x + 4.5, y - 6, 1.7, 0, TAU);
      g.fillStyle = ink;
      g.fill();
      g.beginPath();
      g.arc(x, y - 2, 4, 0.15 * Math.PI, 0.85 * Math.PI);
    } else {
      g.moveTo(x - 7, y - 5);
      g.quadraticCurveTo(x - 4.5, y - 3, x - 2, y - 5);
      g.moveTo(x + 2, y - 5);
      g.quadraticCurveTo(x + 4.5, y - 3, x + 7, y - 5);
      g.moveTo(x - 2, y + 2);
      g.lineTo(x + 2, y + 2);
    }
    g.lineWidth = 1.5;
    g.strokeStyle = ink;
    g.stroke();
    if (!up) {
      g.beginPath();
      g.moveTo(x - 13, y - 9);
      g.quadraticCurveTo(x - 2, y - 30, x + 16, y - 24);
      g.quadraticCurveTo(x + 6, y - 16, x + 13, y - 9);
      g.closePath();
      g.fillStyle = mix(c.series6, c.card, 0.2);
      g.fill();
      g.beginPath();
      g.arc(x + 17, y - 24, 3, 0, TAU);
      g.fillStyle = c.card;
      g.fill();
      g.font = `700 11px ${t.type.family}`;
      g.textAlign = "left";
      g.fillStyle = c.text;
      g.textAlign = "center";
      g.fillText("z", x - 22, y - 14 - Math.abs(Math.sin(f.now / 600)) * 3);
    }
    // City and local time under the head.
    const top = Math.sin(a) < -0.3;
    const ly = top ? y - 35 : y + 18;
    const label = fitText(`${p.who === me ? "You" : p.name} · ${ampm(lh)}`, 92, { g, size: 11, min: 10, weight: 600 });
    g.font = label.font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = c.text;
    g.fillText(label.text, x, ly);
    if (p.city) {
      const city = fitText(p.city, 92, { g, size: 10, min: 10, weight: 400 });
      g.font = city.font;
      g.fillStyle = c.secondaryText;
      g.fillText(city.text, x, ly + 12);
    }
  });
  return dragging || e !== null || asleep(s, hr).length > 0;
}

export default defineApp<State, Action, Local>({
  name: "Time zone table",
  summary: (s) => {
    if (s.invite) return `Call · ${s.day} ${ampm(s.invite.h)} ${s.zone} · ${s.yes.length} of ${s.people.length} in`;
    const z = asleep(s, s.h);
    return `${s.title}: ${s.day} ${ampm(s.h)} ${s.zone}${z.length ? ` · ${z.length} asleep` : " · everyone's up"}`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "turn") {
      if (s.invite || typeof a.h !== "number" || !Number.isInteger(a.h) || a.h < 0 || a.h > 23 || a.h === s.h) return s;
      return { ...s, from: s.h, h: a.h, turnedAt: m.time, turnedBy: m.user };
    }
    if (a.t === "invite") {
      if (s.invite || asleep(s, s.h).length) return s;
      return { ...s, invite: { h: s.h, by: m.user, at: m.time }, yes: [m.user] };
    }
    if (a.t === "yes") {
      if (!s.invite) return s;
      return { ...s, yes: s.yes.includes(m.user) ? s.yes.filter((u) => u !== m.user) : [...s.yes, m.user] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    let people = s.people.map((p) => (seeded(p.who) || inChat(ctx, p.who) ? p : { ...p, who: `~${p.name}` }));
    people = people.filter((p, i) => people.findIndex((x) => x.who === p.who) === i);
    for (const m of ctx.members) {
      if (people.some((p) => p.who === m.id)) continue;
      const k = people.findIndex((p) => seeded(p.who) && p.name.toLowerCase() === m.name.toLowerCase());
      if (k >= 0) people = people.map((p, j) => (j === k ? { ...p, who: m.id } : p));
      else if (people.length < 8 && !s.invite) people = [...people, { who: m.id, name: clean(m.name, 20) || "Friend", city: "", offset: 0, wake: 8, sleep: 24, said: "" }];
    }
    const next = { ...s, people, yes: s.yes.filter((u) => inChat(ctx, u)) };
    // A newcomer can't make an invite to an hour they sleep through.
    return next.invite && asleep(next, next.invite.h).length ? { ...next, invite: null, yes: [] } : next;
  },

  invariants: {
    "everyone in the chat has a seat": (s, ctx) => s.invite !== null || s.people.length >= 8 || ctx.members.every((m) => s.people.some((p) => p.who === m.id)),
    "a friend who joins takes their own seat": (s, ctx) => ctx.members.every((m) => s.people.some((p) => p.who === m.id) || !s.people.some((p) => seeded(p.who) && p.name.toLowerCase() === m.name.toLowerCase())),
    "the hand points at a whole hour": (s) => Number.isInteger(s.h) && s.h >= 0 && s.h <= 23 && Number.isInteger(s.from) && s.from >= 0 && s.from <= 23,
    "an invite only when nobody's asleep": (s) => s.invite === null || (s.invite.h === s.h && asleep(s, s.invite.h).length === 0),
    "yes only after an invite, once each": (s, ctx) => (s.invite !== null || s.yes.length === 0) && new Set(s.yes).size === s.yes.length && s.yes.every((u) => inChat(ctx, u)),
    "one seat per person": (s) => s.people.length >= 1 && new Set(s.people.map((p) => p.who)).size === s.people.length,
    "awake hours make sense": (s) => s.people.every((p) => p.wake >= 0 && p.wake < p.sleep && p.sleep <= 30 && Number.isInteger(p.offset)),
  },

  transitions: {
    "turning to the same hour changes nothing": (p, n, a) => a.t !== "turn" || a.h !== p.h || JSON.stringify(p) === JSON.stringify(n),
    "a turn moves the hand from where it was": (p, n, a, m) => a.t !== "turn" || p === n || (n.h === a.h && n.from === p.h && n.turnedAt === m.time && n.turnedBy === m.user),
    "the hand stays put once invited": (p, n) => p.invite === null || n.h === p.h,
    "only a turn moves the hand": (p, n, a) => a.t === "turn" || n.h === p.h,
    "an invite puts the sender in": (p, n, a, m) => a.t !== "invite" || p === n || (n.invite?.by === m.user && n.invite.at === m.time && n.yes.join() === m.user && asleep(p, p.h).length === 0),
    "yes toggles only the sender": (p, n, a, m) => {
      if (a.t !== "yes" || p === n) return true;
      const diff = [...p.yes.filter((u) => !n.yes.includes(u)), ...n.yes.filter((u) => !p.yes.includes(u))];
      return diff.length === 1 && diff[0] === m.user;
    },
    "unknown actions change nothing": (p, n, a) => a.t === "turn" || a.t === "invite" || a.t === "yes" || JSON.stringify(p) === JSON.stringify(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, _u, r) => {
    if (s.invite) return r.next() < 0.8 ? { t: "yes" } : { t: "turn", h: r.int(24) };
    if (asleep(s, s.h).length === 0 && r.next() < 0.5) return { t: "invite" };
    return { t: "turn", h: r.int(24) };
  },

  local: { drag: 0, dh: 0, burst: 0 },

  view: ({ state, confirmed, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = state;
    const W = theme.width - 2 * theme.space.card;
    const h = local.drag ? local.dh : s.h;
    const hr = Math.round(mod(h, 24));
    const z = asleep(s, hr);
    const far = farthest(s);
    const inv = confirmed.invite;
    const label = `Round table at ${ampm(s.h)} ${s.zone}: ${s.people.map((p) => `${p.name} ${ampm(localH(p, s.h))}${p.city ? ` in ${p.city}` : ""}, ${awake(p, s.h) ? "awake" : "asleep"}`).join("; ")}`;
    const hourAt = (x: number, y: number) => mod(((Math.atan2(y - 117, x - W / 2) + Math.PI / 2) / TAU) * 24, 24);
    const onPointer = (e: { type: string; x: number; y: number }) => {
      if (inv) return;
      if (e.type === "down") {
        if (Math.hypot(e.x - W / 2, e.y - 117) < 70) setLocal({ drag: 1, dh: hourAt(e.x, e.y) });
        return;
      }
      if (!local.drag) return;
      if (e.type === "move") return setLocal({ dh: hourAt(e.x, e.y) });
      if (e.type === "up") {
        const nh = Math.round(hourAt(e.x, e.y)) % 24;
        setLocal({ drag: 0 });
        if (nh !== s.h) {
          haptic("light");
          dispatch({ t: "turn", h: nh });
        }
      }
    };
    const nudge = (d: number) => dispatch({ t: "turn", h: mod(s.h + d, 24) });
    const farLine = far && far.offset !== 0 ? ` = ${dayOf(s, far, hr)} ${ampm(localH(far, hr))} ${far.city || firstName(far.name)}` : "";
    const zz = z[0];

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={CH} label={label} drag draw={(g, f) => drawTable(g, f, s, me, h, local.drag > 0)} onPointer={onPointer} />
        {inv ? (
          <div style={{ position: "relative" }}>
            {local.burst > 0 ? (
              <div style={{ position: "absolute", left: "50%", top: 0, pointerEvents: "none" }}>
                <Burst key={local.burst} emoji="📞" />
              </div>
            ) : null}
            <Locked detail={far && far.offset !== 0 ? `${dayOf(s, far, inv.h)} ${ampm(localH(far, inv.h))} for ${firstName(far.name)} · nobody's asleep` : "Nobody's asleep"}>{`Call · ${s.day} ${ampm(inv.h)} ${s.zone}`}</Locked>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minWidth: 0 }}>
              <Facepile users={confirmed.yes.map((u) => ({ id: u, name: s.people.find((p) => p.who === u)?.name ?? "Friend" }))} max={5} size={24} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, ...ell }}>{`${confirmed.yes.length} of ${s.people.length} in`}</span>
              <Button kind={confirmed.yes.includes(me) ? "secondary" : "primary"} onClick={() => dispatch({ t: "yes" })}>
                {confirmed.yes.includes(me) ? "Can't" : "I'm in"}
              </Button>
            </div>
            {local.burst > 0 ? <Toast key={local.burst}>Invite sent to everyone</Toast> : null}
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, minWidth: 0 }}>
              <button type="button" aria-label="An hour earlier" onClick={() => nudge(-1)} style={{ flex: "none", width: 44, height: 44, border: "none", borderRadius: 22, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 17, cursor: "pointer" }}>
                ‹
              </button>
              <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, ...ell }}>{`${s.day} ${ampm(hr)} ${s.zone}${farLine}`}</div>
                <div style={{ fontSize: 13, lineHeight: "16px", color: zz ? c.secondaryText : c.positive, ...ell }}>
                  {zz ? `${firstName(zz.name)}'s asleep (${ampm(localH(zz, hr))}${zz.city ? ` in ${zz.city}` : ""})${z.length > 1 ? ` + ${z.length - 1} more` : ""}` : "Everyone's up"}
                </div>
              </div>
              <button type="button" aria-label="An hour later" onClick={() => nudge(1)} style={{ flex: "none", width: 44, height: 44, border: "none", borderRadius: 22, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 17, cursor: "pointer" }}>
                ›
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <Button
                kind="primary"
                wide
                disabled={z.length > 0 || local.drag > 0}
                onClick={() => {
                  haptic("success");
                  setLocal({ burst: local.burst + 1 });
                  dispatch({ t: "invite" });
                }}
              >
                {z.length ? "Find an hour" : "Send invite"}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  },
});
