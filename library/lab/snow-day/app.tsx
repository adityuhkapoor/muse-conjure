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
  textWidth,
  type Child,
  type Ctx,
  type Member,
} from "@muse/app";

// "Classes canceled Tuesday": the post becomes the hill. Sleds and dining hall trays wait at the
// top; tap to grab one and your face rides it down to join the others. Whoever brings trays shows
// under the hill, and anyone left without a ride goes down on a trash bag.

type Params = {
  /** Card title, e.g. "Snow day on Miller Hill" */
  title: string;
  /** The post that started it, e.g. "Eastfield · classes canceled Tuesday" */
  post: string;
  /** The hill's name on the sign */
  place: string;
  /** When everyone meets, e.g. "1pm" */
  time: string;
  /** Who is already going, in order, with what they said */
  riders: { name: string; said: string }[];
  /** Who is bringing something to ride: kind is tray or sled, n how many */
  gear: { by: string; kind: string; n: number }[];
};

// @params
const P: Params = {
  title: "Snow day on Miller Hill",
  post: "Eastfield · classes canceled Tuesday",
  place: "Miller Hill",
  time: "1pm",
  riders: [
    { name: "Arun", said: "liberated 3 trays from hollis" },
    { name: "Will", said: "the sube has a sled in it" },
    { name: "Tsai Lin", said: "i'm doing the big run first" },
    { name: "Calvin", said: "7 alarms set for 12:50" },
  ],
  gear: [
    { by: "Arun", kind: "tray", n: 3 },
    { by: "Will", kind: "sled", n: 1 },
  ],
};
// @end params

type Rider = { user: string; said: string; at: number };
type Gear = { user: string; kind: "tray" | "sled"; n: number };
type State = { title: string; post: string; place: string; time: string; riders: Rider[]; gear: Gear[] };
type Action = { t: "ride" } | { t: "tray"; n: number };

const MAX_RIDERS = 40;
const MAX_TRAYS = 3;
const RIDE_MS = 1700;
const PIC_H = 236;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const standIn = (u: string) => u.startsWith("~");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const r1 = (n: number) => Math.round(n * 10) / 10;
const rides = (s: State) => s.gear.reduce((n, g) => n + g.n, 0);
const trayOf = (s: State, u: string) => s.gear.find((g) => g.user === u && g.kind === "tray")?.n ?? 0;

function initState(ctx: Ctx): State {
  const idFor = (name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.toLowerCase())?.id ?? `~${name}`;
  const riders: Rider[] = [];
  for (const r of Array.isArray(P.riders) ? P.riders : []) {
    const name = clean(r?.name, 16);
    if (!name || riders.length >= MAX_RIDERS) continue;
    const user = idFor(name);
    if (riders.some((x) => x.user === user)) continue;
    riders.push({ user, said: clean(r?.said, 40), at: 0 });
  }
  const gear: Gear[] = [];
  for (const g of Array.isArray(P.gear) ? P.gear : []) {
    const name = clean(g?.by, 16);
    const kind = g?.kind === "sled" ? "sled" : "tray";
    const n = typeof g?.n === "number" && Number.isFinite(g.n) ? Math.max(0, Math.min(MAX_TRAYS, Math.round(g.n))) : 0;
    if (!name || n === 0) continue;
    const user = idFor(name);
    if (gear.some((x) => x.user === user && x.kind === kind)) continue;
    gear.push({ user, kind, n });
  }
  return {
    title: clean(P.title, 40) || "Snow day",
    post: clean(P.post, 48),
    place: clean(P.place, 20) || "the hill",
    time: clean(P.time, 10),
    riders,
    gear,
  };
}

// ---- drawing ----

type Pal = ReturnType<typeof pal>;
type Ride = "sled" | "tray" | "bag";

function vehicle(kind: Ride, p: Pal, key: string): Child {
  if (kind === "sled")
    return (
      <g key={key}>
        <path d="M-17 4 Q-21 4 -21 0 M-17 4 H15 Q20 4 21 -3" fill="none" stroke={p.dark} stroke-width={2} stroke-linecap="round" />
        <rect x={-16} y={-5} width={30} height={7} rx={3} fill={p.red} />
        <line x1={-11} y1={-1.5} x2={10} y2={-1.5} stroke={mix(p.red, p.paper, 0.4)} stroke-width={1.2} />
      </g>
    );
  if (kind === "tray")
    return (
      <g key={key}>
        <rect x={-15} y={-3} width={30} height={6} rx={2} fill={p.orange} />
        <rect x={-12} y={-2} width={24} height={2} rx={1} fill={mix(p.orange, p.paper, 0.35)} />
      </g>
    );
  return (
    <g key={key}>
      <path d="M-15 3 Q-16 -4 -9 -4 L10 -5 Q16 -4 15 3 Z" fill={p.dark} />
      <path d="M14 -4 l5 -4 M14 -4 l6 0" stroke={p.dark} stroke-width={1.6} stroke-linecap="round" />
    </g>
  );
}

function pine(x: number, y: number, s: number, p: Pal, key: string): Child {
  return (
    <g key={key}>
      <rect x={r1(x - 1.5 * s)} y={r1(y - 2 * s)} width={r1(3 * s)} height={r1(6 * s)} fill={p.brown} />
      <path d={`M${r1(x)} ${r1(y - 26 * s)} L${r1(x + 10 * s)} ${r1(y - 2 * s)} L${r1(x - 10 * s)} ${r1(y - 2 * s)} Z`} fill={p.leaf} />
      <path d={`M${r1(x)} ${r1(y - 26 * s)} L${r1(x + 5 * s)} ${r1(y - 15 * s)} L${r1(x - 5 * s)} ${r1(y - 15 * s)} Z`} fill={p.paper} />
    </g>
  );
}

const CSS =
  "@keyframes sdBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}" +
  "@keyframes sdIn{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}" +
  "@keyframes sdPuff{from{transform:scale(.3);opacity:.9}to{transform:scale(1.6);opacity:0}}" +
  ".sd-bob{animation:sdBob 2.4s ease-in-out infinite}" +
  ".sd-in{animation:sdIn .35s cubic-bezier(.34,1.56,.64,1) both}" +
  ".sd-puff{transform-box:fill-box;transform-origin:center;animation:sdPuff .7s ease-out both}" +
  "@media (prefers-reduced-motion:reduce){.sd-bob,.sd-in,.sd-puff{animation:none}}";

export default defineApp<State, Action>({
  name: "Snow day",
  summary: (s) => {
    const short = s.riders.length - rides(s);
    return s.riders.length === 0
      ? `${s.place}${s.time ? ` · ${s.time}` : ""} · nobody's going yet`
      : `${s.place}${s.time ? ` · ${s.time}` : ""} · ${s.riders.length} going · ${rides(s)} rides${short > 0 ? `, ${short} on trash bags` : ""}`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "ride") {
      if (state.riders.some((r) => r.user === meta.user)) return { ...state, riders: state.riders.filter((r) => r.user !== meta.user) };
      if (state.riders.length >= MAX_RIDERS) return state;
      return { ...state, riders: [...state.riders, { user: meta.user, said: "", at: meta.time }] };
    }
    if (action.t === "tray") {
      const n = action.n;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_TRAYS) return state;
      if (trayOf(state, meta.user) === n) return state;
      const rest = state.gear.filter((g) => !(g.user === meta.user && g.kind === "tray"));
      return { ...state, gear: n === 0 ? rest : [...rest, { user: meta.user, kind: "tray", n }] };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const riders = state.riders.filter((r) => standIn(r.user) || inChat(ctx, r.user));
    const gear = state.gear.filter((g) => standIn(g.user) || inChat(ctx, g.user));
    return riders.length === state.riders.length && gear.length === state.gear.length ? state : { ...state, riders, gear };
  },

  invariants: {
    "each rider once": (s) => new Set(s.riders.map((r) => r.user)).size === s.riders.length,
    "riders are in the chat or named in the post": (s, ctx) => s.riders.every((r) => standIn(r.user) || inChat(ctx, r.user)),
    "gear counts are 1 to 3": (s) => s.gear.every((g) => Number.isInteger(g.n) && g.n >= 1 && g.n <= MAX_TRAYS),
    "one tray pile per person": (s) => {
      const t = s.gear.filter((g) => g.kind === "tray").map((g) => g.user);
      return new Set(t).size === t.length;
    },
    "at most 40 riders": (s) => s.riders.length <= MAX_RIDERS,
    "ride times are never negative": (s) => s.riders.every((r) => r.at >= 0),
  },

  transitions: {
    "ride toggles only the rider": (p, n, a, m) => {
      if (a.t !== "ride" || p === n) return true;
      const was = p.riders.some((r) => r.user === m.user);
      const now = n.riders.some((r) => r.user === m.user);
      return was !== now && same(p.riders.filter((r) => r.user !== m.user), n.riders.filter((r) => r.user !== m.user));
    },
    "a new rider starts at the top now": (p, n, a, m) => {
      if (a.t !== "ride" || p.riders.some((r) => r.user === m.user)) return true;
      const last = n.riders[n.riders.length - 1];
      return p === n || (!!last && last.user === m.user && last.at === m.time && last.said === "");
    },
    "a tray tap sets only my pile": (p, n, a, m) => {
      if (a.t !== "tray" || p === n) return true;
      return trayOf(n, m.user) === a.n && same(p.gear.filter((g) => g.user !== m.user), n.gear.filter((g) => g.user !== m.user));
    },
    "a fresh rider gets on": (p, n, a, m, ctx) => a.t !== "ride" || !inChat(ctx, m.user) || p.riders.length >= MAX_RIDERS || n !== p,
    "trays never touch the riders": (p, n, a) => a.t !== "tray" || same(p.riders, n.riders),
    "riding never touches the gear": (p, n, a) => a.t !== "ride" || same(p.gear, n.gear),
    "the post never changes": (p, n) => p.title === n.title && p.place === n.place && p.time === n.time && p.post === n.post,
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (k < 0.5) return { t: "ride" };
    if (k < 0.93) return { t: "tray", n: (trayOf(s, user) + 1 + r.int(2)) % (MAX_TRAYS + 1) };
    return { t: "tray", n: 9 };
  },

  view: ({ state, me, members, dispatch, theme }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const dark = theme.mode === "dark";
    const snow = dark ? mix(c.text, c.card, 0.2) : c.card;
    const snowShade = mix(snow, p.sky, dark ? 0.35 : 0.6);
    const sky = dark ? mix(c.series1, c.wash, 0.75) : mix(p.sky, c.card, 0.2);
    const person = (u: string): Member => (standIn(u) ? { id: u, name: u.slice(1) } : members.find((m) => m.id === u)) ?? { id: u, name: "Friend" };
    const going = state.riders.some((r) => r.user === me);
    const here = members.some((m) => m.id === me);
    const myTrays = trayOf(state, me);
    const total = rides(state);
    const short = Math.max(0, state.riders.length - total);

    // The slope: a plateau at the top left, then a curve down to the bottom right.
    const x0 = Math.round(W * 0.3);
    const yTop = 76;
    const yBot = PIC_H - 18;
    const sx = (u: number) => x0 + u * (W - x0 - 8);
    const sy = (u: number) => yTop + (yBot - yTop) * (u * u * (3 - 2 * u));
    const ang = (u: number) => {
      const d = 0.01;
      return (Math.atan2(sy(Math.min(1, u + d)) - sy(Math.max(0, u - d)), sx(Math.min(1, u + d)) - sx(Math.max(0, u - d))) * 180) / Math.PI;
    };
    let slope = `M0 ${yTop} L${x0} ${yTop}`;
    for (let k = 1; k <= 24; k++) slope += ` L${r1(sx(k / 24))} ${r1(sy(k / 24))}`;
    slope += ` L${W} ${PIC_H} L0 ${PIC_H} Z`;
    const track = (o: number) => { let d = `M${x0 - 30} ${yTop + o}`; for (let k = 0; k <= 24; k++) d += ` L${r1(sx(k / 24))} ${r1(sy(k / 24) + o)}`; return d; };

    // Who rides what, in the order they joined: sleds first, then trays, then trash bags.
    const sleds = state.gear.filter((g) => g.kind === "sled").reduce((n, g) => n + g.n, 0);
    const rideOf = (i: number): Ride => (i < sleds ? "sled" : i < total ? "tray" : "bag");
    const VISIBLE = 7;
    const shownRiders = state.riders.slice(0, VISIBLE);
    if (going && !shownRiders.some((r) => r.user === me)) shownRiders[VISIBLE - 1] = state.riders.find((r) => r.user === me)!;
    const extra = state.riders.length - shownRiders.length;
    const slots = shownRiders.length;
    const spotU = (i: number, n: number) => 0.94 - ((n - 1 - i) * 0.8) / Math.max(1, Math.max(n, 5) - 1);
    const wantGhost = !going && here && state.riders.length < MAX_RIDERS;

    const parked: Child[] = [];
    const left = Math.max(0, total - state.riders.length);
    for (let k = 0; k < Math.min(left, 6); k++) {
      const kind: Ride = state.riders.length + k < sleds ? "sled" : "tray";
      parked.push(<g key={`pk${k}`} transform={`translate(${r1(x0 - 22 - (k % 3) * 30)} ${yTop - 4 - Math.floor(k / 3) * 9})`}>{vehicle(kind, p, "v")}</g>);
    }

    const art: Child[] = [
      <rect key="sky" x={0} y={0} width={W} height={PIC_H} fill={sky} />,
      <path key="far" d={`M0 ${yTop + 6} Q${W * 0.35} 14 ${W * 0.7} 52 T${W} 40 L${W} ${PIC_H} L0 ${PIC_H} Z`} fill={mix(sky, snowShade, 0.55)} />,
      pine(W * 0.55, 66, 0.8, p, "t1"),
      pine(W * 0.63, 70, 0.65, p, "t2"),
      pine(W * 0.86, 62, 0.75, p, "t3"),
      <path key="slope" d={slope} fill={snow} />,
      <path key="shade" d={`M0 ${PIC_H - 44} Q${r1(W * 0.3)} ${PIC_H - 24} ${r1(W * 0.62)} ${PIC_H} L0 ${PIC_H} Z`} fill={snowShade} />,
      <path key="track1" d={track(4)} fill="none" stroke={snowShade} stroke-width={1.5} />,
      <path key="track2" d={track(9)} fill="none" stroke={snowShade} stroke-width={1.5} />,
      pine(18, PIC_H - 8, 1, p, "t4"),
      pine(W * 0.12, PIC_H - 2, 0.75, p, "t5"),
      <g key="sign">
        <rect x={20} y={yTop - 30} width={3} height={30} fill={p.brown} />
        <rect x={Math.max(70, x0 - 8) - 3} y={yTop - 30} width={3} height={30} fill={p.brown} />
      </g>,
      ...parked,
    ];
    const signW = Math.max(70, x0 - 8) - 6;
    const signText = fitText(`${state.place}${state.time ? ` · ${state.time}` : ""}`, signW - 12, { size: 13, weight: 700, min: 9 });

    // Riders, with the newest one still sliding down.
    const riderArt: Child[] = [];
    const faces: Child[] = [];
    shownRiders.forEach((r, i) => {
      const order = state.riders.indexOf(r);
      const target = spotU(i, slots + (wantGhost ? 1 : 0));
      const e = r.at > 0 ? running(r.at, RIDE_MS) : null;
      const k = e === null ? 1 : e / RIDE_MS;
      const eased = k < 1 ? k * k * (3 - 2 * k) : 1;
      const u = Math.max(0, target * eased);
      const onTop = e !== null && k < 0.15;
      const x = onTop ? x0 - 10 : sx(u);
      const y = onTop ? yTop - 4 : sy(u) - 3;
      const a = onTop ? 0 : ang(u);
      riderArt.push(
        <g key={`r${r.user}`} transform={`translate(${r1(x)} ${r1(y)}) rotate(${r1(a)})`}>
          {vehicle(rideOf(order), p, "v")}
        </g>,
      );
      if (e !== null && k > 0.2 && k < 1)
        riderArt.push(<circle key={`s${r.user}`} cx={r1(x - 18)} cy={r1(y - 2)} r={6} fill={snow} stroke={snowShade} stroke-width={1} class="sd-puff" />);
      const mine = r.user === me;
      faces.push(
        <div key={`f${r.user}`} class={e === null ? "sd-bob" : "sd-ride"} style={{ position: "absolute", left: r1(x - 13), top: r1(y - 27), width: 26, height: 26, borderRadius: 13, boxShadow: `0 0 0 2px ${mine ? c.primary : snow}`, animationDelay: `${(i * 0.37) % 2}s` }}>
          <Avatar user={person(r.user)} size={26} />
        </div>,
      );
    });

    // My empty spot when I'm not going.
    const ghostU = spotU(slots, slots + 1);
    const ghost = wantGhost ? (
      <g key="ghost" transform={`translate(${r1(sx(ghostU))} ${r1(sy(ghostU) - 3)}) rotate(${r1(ang(ghostU))})`}>
        <rect x={-17} y={-6} width={34} height={10} rx={4} fill="none" stroke={c.primary} stroke-width={1.5} stroke-dasharray="4 3" />
      </g>
    ) : null;

    // One speech bubble: my line, or the newest rider who said something.
    const speaker = [...state.riders].reverse().find((r) => r.said);
    const bubbleText = speaker ? fitText(`${person(speaker.user).name}: ${speaker.said}`, W - x0 - 30, { size: 13, min: 11 }) : null;

    const snowDraw = (g: CanvasRenderingContext2D, f: { now: number; width: number; height: number }) => {
      g.clearRect(0, 0, f.width, f.height);
      g.fillStyle = dark ? c.text : c.card;
      g.beginPath();
      const t = f.now / 1000;
      for (let k = 0; k < 46; k++) {
        const speed = 14 + (k % 5) * 5;
        const y = ((k * 53.7 + t * speed) % (f.height + 10)) - 5;
        const x = ((k * 97.3) % f.width) + 6 * Math.sin(t * 0.8 + k);
        const r = 1 + (k % 3) * 0.6;
        g.moveTo(x + r, y);
        g.arc(x, y, r, 0, Math.PI * 2);
      }
      g.fill();
      return true;
    };

    const gearPeople = state.gear;
    const leftLabel = `${state.riders.length} going · ${total} rides`;
    const fitGear = Math.max(0, Math.floor((W - textWidth(leftLabel, 13) - 16 - (short > 0 ? textWidth(`${short} on bags`, 13, 600) + 8 : 0)) / 84));
    const trayIcon = (kind: "tray" | "sled", key: string) => (
      <svg key={key} width={26} height={14} viewBox="-15 -7 30 14" aria-hidden="true" style={{ flex: "none" }}>
        {vehicle(kind, p, "v")}
      </svg>
    );

    const mainLabel = going ? "Can't make it" : "Grab a sled";
    const trayLabel = myTrays === 0 ? "Bring a tray" : myTrays < MAX_TRAYS ? `Bring ${myTrays + 1} trays` : "No trays";

    return (
      <div>
        <style>{CSS}</style>
        <CardHeader title={state.title} subtitle={state.post || undefined} />
        <div role="img" aria-label={`${state.place}: ${state.riders.length} going, ${total} sleds and trays`} style={{ position: "relative", height: PIC_H, borderRadius: 12, overflow: "hidden" }}>
          <svg width={W} height={PIC_H} viewBox={`0 0 ${W} ${PIC_H}`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            {art}
            <rect x={14} y={yTop - 44} width={signW + 12} height={22} rx={4} fill={p.crust} stroke={p.brown} stroke-width={1.5} />
            <text x={r1(20 + signW / 2)} y={yTop - 28.5} text-anchor="middle" font-size={signText.size} font-weight={700} fill={p.dark}>{signText.text}</text>
            {ghost}
            {riderArt}
          </svg>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <Canvas height={PIC_H} label="Snow falling" draw={snowDraw} />
          </div>
          {faces}
          {bubbleText ? (
            <div class="sd-in" key={`b${speaker!.user}`} style={{ position: "absolute", right: 10, top: 10, maxWidth: W - x0 - 20, height: 26, padding: "0 10px", borderRadius: 13, background: c.card, color: c.text, fontSize: bubbleText.size, lineHeight: "26px", whiteSpace: "nowrap", boxShadow: `0 1px 0 ${c.divider}` }}>
              {bubbleText.text}
            </div>
          ) : null}
          {state.riders.length === 0 ? (
            <div style={{ position: "absolute", right: 10, top: 10, height: 26, padding: "0 10px", borderRadius: 13, background: c.card, color: c.text, fontSize: 13, lineHeight: "26px", whiteSpace: "nowrap" }}>First one down picks the run</div>
          ) : null}
          {extra > 0 ? (
            <div style={{ position: "absolute", left: 8, bottom: 8, height: 22, padding: "0 8px", borderRadius: 11, background: c.card, color: c.text, fontSize: 12, fontWeight: 600, lineHeight: "22px" }}>{`+${extra} more on the hill`}</div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, marginTop: 8, overflow: "hidden" }}>
          <span style={{ flex: "none", fontSize: 13, color: c.secondaryText }}>{leftLabel}</span>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
            {gearPeople.length === 0 ? (
              <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap" }}>· no trays yet</span>
            ) : (
              gearPeople.slice(0, fitGear).map((g) => (
                <span key={`${g.user}${g.kind}`} style={{ display: "flex", alignItems: "center", gap: 2, flex: "none" }}>
                  <Avatar user={person(g.user)} size={20} />
                  {trayIcon(g.kind, "i")}
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{`×${g.n}`}</span>
                </span>
              ))
            )}
          </div>
          {short > 0 ? <span style={{ flex: "none", fontSize: 13, fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{`${short} on bags`}</span> : null}
        </div>

        {here ? (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <Button
                kind={going ? "secondary" : "primary"}
                wide
                onClick={() => {
                  dispatch({ t: "ride" });
                  haptic(going ? "light" : "success");
                }}
              >
                {mainLabel}
              </Button>
            </div>
            <Button kind="secondary" disabled={myTrays >= MAX_TRAYS} onClick={() => dispatch({ t: "tray", n: Math.min(MAX_TRAYS, myTrays + 1) })}>
              {trayLabel}
            </Button>
          </div>
        ) : null}
        {going ? (() => {
          const mine = state.riders.find((r) => r.user === me)!;
          return mine.at > 0 && running(mine.at, 2400) !== null ? <Toast key={mine.at}>{`See you on ${state.place}${state.time ? ` at ${state.time}` : ""}`}</Toast> : null;
        })() : null}
      </div>
    );
  },
});
