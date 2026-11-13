import {
  defineApp,
  Button,
  Canvas,
  CardHeader,
  Facepile,
  Toast,
  fitText,
  haptic,
  mix,
  running,
  userColor,
  type Ctx,
  type DrawFrame,
  type Member,
} from "@muse/app";

// 1:20am after the party: "text when ur home". Eastfield drawn small at night, a little house for
// each friend and their dot walking home from the party. Tap "I'm home" and your window lights
// up; check on someone still out and they answer. It settles to "All 6 home" and goes quiet.
// Calvin's dot always detours past the halal cart.

type Params = {
  /** Card title: "Home safe" */
  title: string;
  /** Under the title: "after the Anchor · “text when ur home”" */
  sub: string;
  /** Where everyone left from: "the Anchor" */
  from: string;
  /** Story time now, H:MM: "1:41" */
  now: string;
  /** Everyone. home: H:MM they got home, or "" if still walking. walked: 0 to 9, how far along. reply: what they say when someone checks on them. detour: their path passes the halal cart. */
  people: { name: string; home: string; walked: number; said: string; reply: string; detour: boolean }[];
};

// @params
const P: Params = {
  title: "Home safe",
  sub: "after the Anchor · “text when ur home”",
  from: "the Anchor",
  now: "1:41",
  people: [
    { name: "Tsai Lin", home: "1:31", walked: 9, said: "home. lock ur doors", reply: "", detour: false },
    { name: "Aditya", home: "1:38", walked: 9, said: "lowkey home", reply: "", detour: false },
    { name: "Will", home: "", walked: 7, said: "left the Sube, walking", reply: "turning onto Pine, 2 min", detour: false },
    { name: "Arun", home: "", walked: 4, said: "carrying the rice cooker back. slow", reply: "it's heavier than it looks. home now", detour: false },
    { name: "Calvin", home: "", walked: 3, said: "one sec", reply: "got the lamb over rice. NOW home", detour: true },
    { name: "Maya", home: "", walked: 6, said: "", reply: "", detour: false },
  ],
};
// @end params

type Person = { who: string; name: string; at: number; walked: number; said: string; reply: string; detour: boolean; pings: string[]; ping: number };
type State = { title: string; sub: string; from: string; base: number; start: number; people: Person[]; last: number };
type Action = { t: "home" } | { t: "ping"; who: string };
type Local = { toast: number };

const TAU = Math.PI * 2;
const CH = 222;
const RUN = 1300;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const seeded = (who: string) => who.startsWith("~");
const firstName = (n: string) => n.split(" ")[0] ?? n;
const ell = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
const memberOf = (p: Person): Member => ({ id: p.who, name: p.name });
const hm = (min: number) => `${Math.floor(min / 60) % 12 === 0 ? 12 : Math.floor(min / 60) % 12}:${String(min % 60).padStart(2, "0")}`;
const parse = (v: unknown) => {
  const s = clean(v, 5);
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? (Number(m[1]) % 24) * 60 + Math.min(59, Number(m[2])) : -1;
};
const isHome = (p: Person) => p.at >= 0;
const allHome = (s: State) => s.people.length > 0 && s.people.every(isHome);
/** Story minute for a server time: the card's "now" plus minutes since the first tap. */
const storyAt = (s: State, time: number) => s.base + Math.max(0, Math.floor((time - (s.start || time)) / 60000));

function initState(ctx: Ctx): State {
  const base = Math.max(0, parse(P.now));
  const people: Person[] = [];
  for (const raw of P.people) {
    if (people.length >= 8) break;
    const name = clean(raw.name, 20);
    if (!name) continue;
    const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const who = m ? m.id : `~${name}`;
    if (people.some((x) => x.who === who)) continue;
    const at = Math.min(base, parse(raw.home));
    const walked = Number.isInteger(raw.walked) ? Math.min(9, Math.max(0, raw.walked)) : 0;
    people.push({ who, name, at, walked: at >= 0 ? 9 : Math.min(8, walked), said: clean(raw.said, 50), reply: clean(raw.reply, 50), detour: !!raw.detour, pings: [], ping: 0 });
  }
  for (const m of ctx.members) {
    if (people.length >= 8 || people.some((x) => x.who === m.id)) continue;
    people.push({ who: m.id, name: clean(m.name, 20) || "Friend", at: -1, walked: 2, said: "", reply: "", detour: false, pings: [], ping: 0 });
  }
  if (people.length && people.every(isHome)) people[people.length - 1] = { ...people[people.length - 1]!, at: -1, walked: 6 };
  return { title: clean(P.title, 40) || "Home safe", sub: clean(P.sub, 60), from: clean(P.from, 20) || "the party", base, start: 0, people, last: 0 };
}

// Houses on a little grid to the right of the party; paths are quadratic curves.
function layout(n: number, W: number) {
  // Two staggered rows of houses across the right of the map.
  const top = Math.ceil(n / 2);
  const x0 = W * 0.36;
  const x1 = W - 26;
  const step = (x1 - x0) / Math.max(1, top - 0.5);
  return Array.from({ length: n }, (_, i) => {
    const row = i < top ? 0 : 1;
    const k = row ? i - top : i;
    return { x: x0 + k * step + (row ? step / 2 : 0), y: row ? 136 : 62 };
  });
}
function pathPoint(ax: number, ay: number, hx: number, hy: number, cart: { x: number; y: number } | null, u: number) {
  if (cart) {
    // Two legs: the party to the cart, the cart to home.
    if (u < 0.5) {
      const k = u / 0.5;
      return quad(ax, ay, (ax + cart.x) / 2, cart.y + 34, cart.x, cart.y + 10, k);
    }
    const k = (u - 0.5) / 0.5;
    return quad(cart.x, cart.y + 10, (cart.x + hx) / 2, Math.min(cart.y, hy) - 20, hx, hy + 14, k);
  }
  return quad(ax, ay, (ax + hx) / 2, Math.max(ay, hy) + 10, hx, hy + 14, u);
}
function quad(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, u: number) {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return { x: a * x0 + b * cx + c * x1, y: a * y0 + b * cy + c * y1 };
}

function drawTown(g: CanvasRenderingContext2D, f: DrawFrame, s: State, me: string) {
  const t = f.theme;
  const c = t.color;
  const dk = t.mode === "dark";
  const ink = dk ? c.wash : c.text;
  const W = f.width;
  const quiet = allHome(s);
  let anim = false;
  const night = mix(c.series1, ink, dk ? 0.78 : 0.7);

  g.beginPath();
  g.roundRect(0, 0, W, CH, 14);
  g.fillStyle = night;
  g.fill();
  // Stars and moon.
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const x = (((i * 67) % 100) / 100) * W;
    const y = 6 + ((i * 41) % 34);
    g.moveTo(x + 1, y);
    g.arc(x, y, i % 4 === 0 ? 1.2 : 0.7, 0, TAU);
  }
  g.fillStyle = mix(c.series2, c.card, 0.5);
  g.fill();
  g.beginPath();
  g.arc(W - 22, 20, 9, 0, TAU);
  g.fillStyle = mix(c.series2, c.card, 0.55);
  g.fill();
  g.beginPath();
  g.arc(W - 18, 17, 8, 0, TAU);
  g.fillStyle = night;
  g.fill();

  // The party.
  const ax = 34;
  const ay = CH - 44;
  g.beginPath();
  g.roundRect(ax - 22, ay - 30, 44, 34, 4);
  g.fillStyle = mix(c.series6, ink, 0.35);
  g.fill();
  g.beginPath();
  g.rect(ax - 14, ay - 22, 10, 9);
  g.rect(ax + 4, ay - 22, 10, 9);
  g.fillStyle = quiet ? mix(c.series6, ink, 0.6) : mix(c.series4, c.series2, 0.5);
  g.fill();
  const anchor = fitText(s.from, 76, { g, size: 11, min: 10, weight: 600 });
  g.font = anchor.font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = dk ? c.text : c.card;
  g.fillText(anchor.text, ax + 4, ay + 16);

  // Halal cart, if anyone detours.
  const pos = layout(s.people.length, W);
  const cart = s.people.some((p) => p.detour) ? { x: W * 0.22, y: 34 } : null;
  if (cart) {
    g.beginPath();
    g.moveTo(cart.x - 14, cart.y - 6);
    g.quadraticCurveTo(cart.x, cart.y - 18, cart.x + 14, cart.y - 6);
    g.closePath();
    g.fillStyle = c.series4;
    g.fill();
    g.beginPath();
    g.rect(cart.x - 0.8, cart.y - 6, 1.6, 6);
    g.roundRect(cart.x - 12, cart.y, 24, 11, 2);
    g.fillStyle = mix(c.card, c.secondaryText, 0.15);
    if (dk) g.fillStyle = mix(c.text, c.card, 0.2);
    g.fill();
    g.beginPath();
    g.arc(cart.x - 6, cart.y + 13, 2.5, 0, TAU);
    g.moveTo(cart.x + 8.5, cart.y + 13);
    g.arc(cart.x + 6, cart.y + 13, 2.5, 0, TAU);
    g.fillStyle = mix(c.secondaryText, ink, 0.4);
    g.fill();
    // Steam.
    g.beginPath();
    for (const k of [-4, 3]) {
      g.moveTo(cart.x + k, cart.y - 18);
      g.quadraticCurveTo(cart.x + k + 3 * Math.sin(f.now / 300 + k), cart.y - 24, cart.x + k, cart.y - 30);
    }
    g.lineWidth = 1.5;
    g.strokeStyle = mix(c.card, night, 0.5);
    g.stroke();
    if (!quiet) anim = true;
  }

  // Paths for whoever is still out (and a fresh arrival): walked part solid, rest dashed.
  s.people.forEach((p, i) => {
    if (isHome(p) && !(p.ping && running(p.ping, RUN) !== null)) return;
    const h = pos[i]!;
    const cartP = p.detour ? cart : null;
    const steps = 24;
    const done = isHome(p) ? 1 : p.walked / 9;
    g.beginPath();
    for (let k = 0; k <= steps; k++) {
      const q = pathPoint(ax, ay, h.x, h.y, cartP, k / steps);
      if (k === 0) g.moveTo(q.x, q.y);
      else g.lineTo(q.x, q.y);
    }
    g.setLineDash([3, 4]);
    g.lineWidth = 1.5;
    g.strokeStyle = mix(night, c.card, 0.3);
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    for (let k = 0; k <= Math.round(steps * done); k++) {
      const q = pathPoint(ax, ay, h.x, h.y, cartP, k / steps);
      if (k === 0) g.moveTo(q.x, q.y);
      else g.lineTo(q.x, q.y);
    }
    g.lineWidth = 2;
    g.strokeStyle = mix(userColor(memberOf(p), t), c.card, 0.25);
    g.stroke();
  });

  // Houses.
  s.people.forEach((p, i) => {
    const h = pos[i]!;
    const lit = isHome(p);
    const e = lit && p.ping ? running(p.ping, RUN) : null;
    g.beginPath();
    g.moveTo(h.x - 16, h.y - 2);
    g.lineTo(h.x, h.y - 16);
    g.lineTo(h.x + 16, h.y - 2);
    g.closePath();
    g.fillStyle = mix(c.series5, ink, 0.45);
    g.fill();
    g.beginPath();
    g.rect(h.x - 12, h.y - 2, 24, 18);
    g.fillStyle = mix(c.series5, ink, 0.25);
    g.fill();
    if (lit) {
      g.globalAlpha = 0.35;
      g.beginPath();
      g.arc(h.x, h.y + 6, 14, 0, TAU);
      g.fillStyle = c.series2;
      g.fill();
      g.globalAlpha = 1;
    }
    g.beginPath();
    g.rect(h.x - 6, h.y + 1, 12, 9);
    g.fillStyle = lit ? c.series2 : mix(c.series1, ink, 0.6);
    g.fill();
    // Name under the house.
    const nm = fitText(p.who === me ? "You" : p.name, 64, { g, size: 11, min: 10, weight: 600 });
    g.font = nm.font;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = dk ? c.text : c.card;
    g.fillText(nm.text, h.x, h.y - 25);
    if (lit && p.at >= 0) {
      g.font = `400 10px ${t.type.family}`;
      g.fillStyle = dk ? c.series2 : mix(c.series2, c.card, 0.4);
      g.fillText(hm(p.at), h.x, h.y + 26);
    }
    if (e !== null) anim = true;
  });

  // Walkers: dots on their paths, inching along; a new arrival runs the rest of the way.
  s.people.forEach((p, i) => {
    const h = pos[i]!;
    const run = isHome(p) && p.ping ? running(p.ping, RUN) : null;
    if (isHome(p) && run === null) return;
    let u = p.walked / 9;
    if (run !== null) u = u + (1 - u) * (run / RUN);
    else {
      u = Math.min(0.97, u + 0.015 * Math.sin(f.now / 700 + i));
      anim = true;
    }
    const q = pathPoint(ax, ay, h.x, h.y, p.detour ? cart : null, u);
    const bob = Math.abs(Math.sin(f.now / 160 + i)) * 2;
    g.beginPath();
    g.arc(q.x, q.y - bob, 7, 0, TAU);
    g.fillStyle = userColor(memberOf(p), t);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = p.who === me ? c.primary : c.card;
    g.stroke();
    if (p.pings.length && run === null) {
      g.beginPath();
      g.arc(q.x + 7, q.y - bob - 7, 3.5, 0, TAU);
      g.fillStyle = c.negative;
      g.fill();
    }
  });
  return anim;
}

export default defineApp<State, Action, Local>({
  name: "Home check",
  summary: (s) => {
    const n = s.people.filter(isHome).length;
    if (allHome(s)) return `All ${s.people.length} home · ${hm(s.last || s.base)}`;
    const out = s.people.filter((p) => !isHome(p)).map((p) => firstName(p.name));
    return `${n} of ${s.people.length} home · ${out.join(", ")} still out`;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const start = s.start || m.time;
    const now = storyAt({ ...s, start }, m.time);
    if (a.t === "home") {
      const i = s.people.findIndex((p) => p.who === m.user);
      if (i < 0 || isHome(s.people[i]!)) return s;
      return { ...s, start, last: Math.max(s.last, now), people: s.people.map((p, k) => (k === i ? { ...p, at: now, ping: m.time, pings: [] } : p)) };
    }
    if (a.t === "ping") {
      if (typeof a.who !== "string" || a.who === m.user) return s;
      const i = s.people.findIndex((p) => p.who === a.who);
      if (i < 0) return s;
      const p = s.people[i]!;
      if (isHome(p) || p.pings.includes(m.user)) return s;
      // Friends who aren't in the chat answer with what they'd say and make it home.
      if (seeded(p.who)) return { ...s, start, last: Math.max(s.last, now), people: s.people.map((x, k) => (k === i ? { ...x, at: now, ping: m.time, pings: [...x.pings, m.user], said: x.reply || x.said } : x)) };
      return { ...s, start, people: s.people.map((x, k) => (k === i ? { ...x, pings: [...x.pings, m.user].slice(-8) } : x)) };
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
      else if (people.length < 8) people = [...people, { who: m.id, name: clean(m.name, 20) || "Friend", at: -1, walked: 2, said: "", reply: "", detour: false, pings: [], ping: 0 }];
    }
    people = people.map((p) => ({ ...p, pings: p.pings.filter((u) => inChat(ctx, u)) }));
    return { ...s, people };
  },

  invariants: {
    "one house per person": (s) => s.people.length >= 1 && s.people.length <= 8 && new Set(s.people.map((p) => p.who)).size === s.people.length,
    "live dots are in the chat": (s, ctx) => s.people.every((p) => seeded(p.who) || inChat(ctx, p.who)),
    "home times are on the story clock": (s) => s.people.every((p) => p.at === -1 || (Number.isInteger(p.at) && p.at >= 0 && p.at <= Math.max(s.base, s.last))) && s.last >= 0,
    "nobody home is still being pinged": (s) => s.people.every((p) => !isHome(p) || p.pings.length === 0 || seeded(p.who) || p.ping > 0),
    "pings come from people in the chat, once each": (s, ctx) => s.people.every((p) => new Set(p.pings).size === p.pings.length && p.pings.every((u) => inChat(ctx, u) && u !== p.who)),
    "walked is a step from 0 to 9": (s) => s.people.every((p) => Number.isInteger(p.walked) && p.walked >= 0 && p.walked <= 9),
    "the clock starts with the first tap": (s) => s.start > 0 || s.people.every((p) => p.ping === 0),
  },

  transitions: {
    "home marks only the sender, at the story time": (p, n, a, m) => {
      if (a.t !== "home" || p === n) return true;
      const i = n.people.findIndex((x) => x.who === m.user);
      const changed = n.people.filter((x, k) => x.at !== p.people[k]?.at);
      return changed.length === 1 && i >= 0 && n.people[i]!.at === storyAt({ ...p, start: p.start || m.time }, m.time) && n.people[i]!.ping === m.time;
    },
    "nobody goes back out": (p, n) => p.people.every((x) => !isHome(x) || n.people.find((y) => y.name === x.name)?.at === x.at),
    "a ping touches only the friend pinged": (p, n, a, m) => {
      if (a.t !== "ping" || p === n) return true;
      const changed = n.people.filter((x, k) => JSON.stringify(x) !== JSON.stringify(p.people[k]));
      return changed.length === 1 && changed[0]!.who === a.who && changed[0]!.pings.includes(m.user) && (seeded(a.who) ? isHome(changed[0]!) : !isHome(changed[0]!));
    },
    "the story clock never runs back": (p, n) => n.last >= p.last && (p.start === 0 || n.start === p.start),
    "unknown actions change nothing": (p, n, a) => a.t === "home" || a.t === "ping" || JSON.stringify(p) === JSON.stringify(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r) => {
    const out = s.people.filter((p) => !isHome(p) && p.who !== user);
    const mine = s.people.find((p) => p.who === user);
    if (mine && !isHome(mine) && r.next() < 0.5) return { t: "home" };
    if (out.length) return { t: "ping", who: r.pick(out).who };
    return { t: "home" };
  },

  local: { toast: 0 },

  view: ({ state, confirmed, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const s = state;
    const mine = s.people.find((p) => p.who === me);
    const home = s.people.filter(isHome);
    const out = s.people.filter((p) => !isHome(p) && p.who !== me);
    const pool = out.some((p) => seeded(p.who) && p.reply) ? out.filter((p) => seeded(p.who) && p.reply) : out;
    const slowest = pool.reduce<(typeof out)[number] | null>((a, p) => (a === null || p.walked < a.walked ? p : a), null);
    const latest = [...s.people].filter((p) => p.said).sort((a, b) => (b.ping || 0) - (a.ping || 0) || b.at - a.at)[0];
    const done = allHome(confirmed);
    const label = `Night map: ${s.people.map((p) => `${p.name} ${isHome(p) ? `home ${hm(p.at)}` : "walking"}`).join(", ")}`;

    return (
      <div>
        <CardHeader title={s.title} subtitle={s.sub} />
        <Canvas height={CH} label={label} draw={(g, f) => drawTown(g, f, s, me)} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, minWidth: 0 }}>
          <Facepile users={home.map(memberOf)} max={6} size={20} />
          <span style={{ fontSize: 13, lineHeight: "16px", color: done ? c.text : c.secondaryText, fontWeight: done ? 600 : 400, minWidth: 0, ...ell }}>
            {done ? `All ${s.people.length} home · ${hm(confirmed.last || confirmed.base)}` : `${home.length} of ${s.people.length} home`}
          </span>
        </div>
        {done ? (
          <div style={{ fontSize: 15, lineHeight: "20px", color: c.secondaryText, ...ell }}>Goodnight. Muse will stay quiet now.</div>
        ) : (
          <div>
            {latest ? (
              <div style={{ fontSize: 15, lineHeight: "20px", color: c.text, marginBottom: 8, ...ell }}>
                <b>{latest.name}</b>
                <span style={{ color: c.secondaryText }}>{` · “${latest.said}”`}</span>
              </div>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: slowest ? "1fr 1fr" : "1fr", gap: 8 }}>
              {slowest ? (
                <Button kind="secondary" wide disabled={slowest.pings.includes(me)} onClick={() => dispatch({ t: "ping", who: slowest.who })}>
                  {slowest.pings.includes(me) ? "Checked" : `Check on ${firstName(slowest.name)}`}
                </Button>
              ) : null}
              <Button
                kind="primary"
                wide
                disabled={!mine || isHome(mine)}
                onClick={() => {
                  haptic("success");
                  setLocal({ toast: local.toast + 1 });
                  dispatch({ t: "home" });
                }}
              >
                {mine && isHome(mine) ? "You're home" : "I'm home"}
              </Button>
            </div>
          </div>
        )}
        {local.toast > 0 ? <Toast key={local.toast}>Your window's lit</Toast> : null}
      </div>
    );
  },
});
