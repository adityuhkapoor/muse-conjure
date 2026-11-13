import {
  defineApp,
  Avatar,
  Button,
  Chip,
  Facepile,
  MapStrip,
  More,
  Placed,
  Thumb,
  Toast,
  clock,
  fitText,
  haptic,
  innerWidth,
  mix,
  pal,
  running,
  tween,
  type Child,
  type Ctx,
  type Member,
} from "@muse/app";

// Trip story: a tap-through recap of a group trip built only from facts the group gave. Everyone's
// reactions float up live; the last frame asks "Same time next year?" and people tap "I'm in".

type Params = {
  city: string;
  days: number;
  dates: string;
  stops: { label: string; x: number; y: number }[];
  miles: string;
  milesNote: string;
  moment: string;
  mvp: { who: string; facts: string[] };
  costs: { label: string; cents: number }[];
  next: string;
};

// @params
const P: Params = {
  city: "Nashville", days: 4, dates: "Mar 13-16",
  stops: [
    { label: "Airbnb", x: 0.88, y: 0.42 }, { label: "Broadway", x: 0.51, y: 0.53 }, { label: "Hattie B's", x: 0.34, y: 0.29 },
    { label: "Parthenon", x: 0.18, y: 0.76 }, { label: "The Opry", x: 0.83, y: 0.84 },
  ],
  miles: "31.4 mi", milesNote: "42,118 steps each",
  moment: "1:12am · Ana got on stage at Robert's",
  mvp: { who: "Priya", facts: ["Booked all 3 nights", "Found the $4 tacos", "0 missed flights"] },
  costs: [
    { label: "Airbnb, East Nash", cents: 96000 }, { label: "Hot chicken and tacos", cents: 61200 },
    { label: "Broadway drinks", cents: 34400 }, { label: "Ubers", cents: 18000 }, { label: "Boots", cents: 8800 },
  ],
  next: "Nash '27",
};
// @end params

type Trip = Params;
type Reaction = { u: string; k: number; at: number };
type State = { trip: Trip; counts: number[]; reacts: Reaction[]; ins: string[] };
type Action = { t: "react"; kind: number } | { t: "in" };
type Local = { frame: number; at: number; dir: number; toast: number };

const SLIDE_MS = 420;
const FLOAT_MS = 2200;
const FRAME_MS = 6000;
const BH = 420;
const slide = tween({ duration: SLIDE_MS, easing: "decelerate" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function clean(p: Params): Trip {
  const stops: Trip["stops"] = [];
  for (const s of p.stops ?? []) {
    const x = num(s?.x, 0.05, 0.95);
    const y = num(s?.y, 0.05, 0.95);
    const label = str(s?.label, 18);
    if (x !== null && y !== null && stops.length < 6) stops.push({ label, x, y });
  }
  const costs: Trip["costs"] = [];
  for (const c of p.costs ?? []) {
    const cents = c?.cents;
    if (typeof cents === "number" && Number.isInteger(cents) && cents >= 0 && cents <= 10_000_000 && costs.length < 5) costs.push({ label: str(c.label, 24), cents });
  }
  const days = typeof p.days === "number" && Number.isInteger(p.days) && p.days >= 1 && p.days <= 30 ? p.days : 1;
  const facts = (p.mvp?.facts ?? []).map((f) => str(f, 40)).filter(Boolean).slice(0, 4);
  return {
    city: str(p.city, 20),
    days,
    dates: str(p.dates, 20),
    stops,
    miles: str(p.miles, 10),
    milesNote: str(p.milesNote, 40),
    moment: str(p.moment, 60),
    mvp: { who: str(p.mvp?.who, 20), facts },
    costs,
    next: str(p.next, 16),
  };
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const money = (cents: number) => {
  const d = Math.floor(cents / 100);
  const whole = String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${whole}${cents % 100 ? `.${String(cents % 100).padStart(2, "0")}` : ""}`;
};

export default defineApp<State, Action, Local>({
  name: "Trip story",
  summary: (s) => `${s.trip.city} trip story · ${s.ins.length} in for ${s.trip.next}`,

  init: () => ({ trip: clean(P), counts: [0, 0, 0], reacts: [], ins: [] }),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "react") {
      const k = a.kind;
      if (k !== 0 && k !== 1 && k !== 2) return s;
      return { ...s, counts: s.counts.map((c, i) => (i === k ? c + 1 : c)), reacts: [...s.reacts, { u: m.user, k, at: m.time }].slice(-30) };
    }
    if (a.t === "in") {
      return { ...s, ins: s.ins.includes(m.user) ? s.ins.filter((u) => u !== m.user) : [...s.ins, m.user] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    if (s.ins.every(here) && s.reacts.every((r) => here(r.u))) return s;
    return { ...s, ins: s.ins.filter(here), reacts: s.reacts.filter((r) => here(r.u)) };
  },

  invariants: {
    "three counts": (s) => s.counts.length === 3 && s.counts.every((c) => Number.isInteger(c) && c >= 0),
    "counts cover the recent reactions": (s) => [0, 1, 2].every((k) => (s.counts[k] ?? 0) >= s.reacts.filter((r) => r.k === k).length),
    "recent list capped": (s) => s.reacts.length <= 30 && s.reacts.every((r) => r.k === 0 || r.k === 1 || r.k === 2),
    "ins unique and here": (s, ctx) => new Set(s.ins).size === s.ins.length && s.ins.every((u) => inChat(ctx, u)),
    "reactors are here": (s, ctx) => s.reacts.every((r) => inChat(ctx, r.u)),
    "money is whole cents": (s) => s.trip.costs.every((c) => Number.isInteger(c.cents) && c.cents >= 0),
  },

  transitions: {
    "react adds one": (p, n, a) => a.t !== "react" || n === p || (n.counts[a.kind] === (p.counts[a.kind] ?? 0) + 1 && sum(n.counts) === sum(p.counts) + 1),
    "react is mine": (p, n, a, m) => a.t !== "react" || n === p || (n.reacts.at(-1)?.u === m.user && n.reacts.at(-1)?.k === a.kind),
    "in toggles only me": (p, n, a, m) =>
      a.t !== "in" || n === p || (p.ins.includes(m.user) !== n.ins.includes(m.user) && sameList(p.ins.filter((u) => u !== m.user), n.ins.filter((u) => u !== m.user))),
    "only react counts": (p, n, a) => a.t === "react" || n.counts === p.counts,
    "only in changes ins": (p, n, a) => a.t === "in" || n.ins === p.ins,
    "trip is fixed": (p, n) => n.trip === p.trip,
  },

  arbitrary: (_s, _u, r) => (r.next() < 0.7 ? { t: "react", kind: r.int(3) } : { t: "in" }),

  local: { frame: 0, at: 0, dir: 1, toast: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const p = pal();
    const c = theme.color;
    const W = innerWidth();
    const now = clock.value;
    const trip = state.trip;
    const n = members.length;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));

    type Frame = { id: string; title: string };
    const frames: Frame[] = [{ id: "cover", title: "The trip" }];
    if (trip.stops.length) frames.push({ id: "route", title: "The route" });
    if (trip.moment) frames.push({ id: "moment", title: "Best moment" });
    if (trip.mvp.who) frames.push({ id: "mvp", title: "MVP" });
    if (trip.costs.length) frames.push({ id: "costs", title: "The costs" });
    frames.push({ id: "again", title: "Again?" });
    const fi = Math.min(Math.max(0, local.frame), frames.length - 1);
    const frame = frames[fi]!;

    const accs: Record<string, string> = { cover: p.red, route: p.green, moment: p.blue, mvp: p.yellow, costs: p.green, again: p.blue };
    const acc = accs[frame.id] ?? p.blue;
    const top = mix(acc, p.dark, 0.35);
    const bot = p.dark;

    const go = (d: number) => {
      if (d < 0 && fi === 0) return;
      setLocal({ frame: (fi + d + frames.length) % frames.length, at: clock.value, dir: d });
    };
    const el = local.at ? running(local.at, SLIDE_MS) : null;
    const shift = local.at ? local.dir * W * (1 - slide(el ?? SLIDE_MS)) : 0;
    const since = local.at ? now - local.at : 0;

    // ---- shared pieces ----
    const glyph = (k: number, size: number) => {
      const fill = [p.red, p.yellow, p.orange][k]!;
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ display: "block" }}>
          <circle cx="16" cy="16" r="16" fill={fill} />
          {k === 0 ? <path d="M16 24.5s-8-4.9-8-10.6a4.3 4.3 0 0 1 8-2.3 4.3 4.3 0 0 1 8 2.3c0 5.7-8 10.6-8 10.6z" fill={p.on} /> : null}
          {k === 1 ? (
            <g fill="none" stroke={p.dark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 11.5l5 2.2-5 2.2" />
              <path d="M23.5 11.5l-5 2.2 5 2.2" />
              <path d="M9.5 19h13c0 4-2.8 6.5-6.5 6.5S9.5 23 9.5 19z" fill={p.dark} />
            </g>
          ) : null}
          {k === 2 ? (
            <>
              <path d="M16 4c1 4.5 6.5 7 6.5 13a6.5 6.5 0 0 1-13 0c0-3 1.6-4.4 2.6-6 .6 1.8 1.4 2.4 2 2.4C14 10 14.6 6.6 16 4z" fill={p.yellow} />
              <path d="M16 15c.6 2.2 3 3.2 3 6a3 3 0 0 1-6 0c0-1.6.8-2.2 1.3-3 .3.9.7 1.2 1 1.2.4-1.3.7-2.7.7-4.2z" fill={p.on} />
            </>
          ) : null}
        </svg>
      );
    };
    const BAR_W = 56;
    const barX = (k: number) => W - 8 - BAR_W / 2 - (2 - k) * (BAR_W + 4);
    const labels = ["Heart", "Laugh", "Fire"];
    const recent: string[] = [];
    for (let i = state.reacts.length - 1; i >= 0; i--) {
      const u = state.reacts[i]!.u;
      if (!recent.includes(u)) recent.push(u);
    }
    const reactLine = !recent.length
      ? "React to the trip"
      : recent.length === 1
        ? `${nameOf(recent[0]!)} reacted`
        : recent.length === 2
          ? `${nameOf(recent[0]!)} and ${nameOf(recent[1]!)} reacted`
          : `${nameOf(recent[0]!)} and ${recent.length - 1} others reacted`;
    const floats = state.reacts
      .filter((r) => running(r.at, FLOAT_MS) !== null)
      .slice(-8)
      .map((r, i) => {
        const e = running(r.at, FLOAT_MS) ?? 0;
        const u = e / FLOAT_MS;
        const mine = r.u === me;
        const x = barX(r.k) + Math.sin(u * 9 + barX(r.k)) * 10;
        const y = 470 - (1 - Math.pow(1 - u, 3)) * 220;
        return (
          <div key={`${r.u}${r.at}${i}`} style={{ position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)", opacity: 1 - u * u, pointerEvents: "none", zIndex: 3 }}>
            {glyph(r.k, mine ? 30 : 20)}
            {mine ? null : (
              <span style={{ position: "absolute", left: -8, bottom: -6, display: "flex" }}>
                <Avatar user={r.u} size={16} />
              </span>
            )}
          </div>
        );
      });

    const memberOf = (who: string): Member | undefined => members.find((m) => m.id === who || (m.name ?? "").toLowerCase() === who.toLowerCase());
    const crew = members.slice(0, 4);
    const crewMore = Math.max(0, n - 4);

    // ---- frame bodies (BH tall, x padding 20) ----
    const days = `${trip.days} day${trip.days === 1 ? "" : "s"} in`;
    const text = (extra: Record<string, unknown>) => ({ position: "absolute" as const, left: 20, right: 20, color: p.on, ...extra });

    const cover = () => {
      const city = fitText(trip.city, W - 40, { size: 70, min: 36, weight: 700 });
      const tcx = W / 2 + 44;
      const BASE = 230;
      const back = Array.from({ length: 9 }, (_, k) => {
        const hgt = 90 + ((k * 37) % 60);
        return <rect key={`b${k}`} x={k * 44 - 6} y={BASE - hgt} width={40} height={hgt} fill={mix(p.dark, p.purple, 0.25)} />;
      });
      const front = Array.from({ length: 7 }, (_, k) => {
        const x = k * 58 - 10;
        if (Math.abs(x + 25 - tcx) < 40) return null;
        const hgt = 56 + ((k * 53) % 50);
        const wins: Child[] = [];
        for (let wy = 0; wy < 3; wy++)
          for (let wx = 0; wx < 3; wx++)
            if ((k * 7 + wy * 3 + wx) % 5 !== 0) wins.push(<rect key={`w${wy}${wx}`} x={x + 8 + wx * 13} y={BASE - hgt + 8 + wy * 13} width={6} height={7} fill={p.cream} opacity={0.65} />);
        return (
          <g key={`f${k}`}>
            <rect x={x} y={BASE - hgt} width={50} height={hgt} fill={p.dark} />
            {wins}
          </g>
        );
      });
      const shown = crew.length + (crewMore ? 1 : 0);
      const sub = `${trip.dates}${trip.dates ? " · " : ""}${n} ${n === 1 ? "friend" : "friends"}`;
      return (
        <>
          <svg viewBox={`0 0 ${W} 300`} width={W} height={300} aria-hidden="true" style={{ position: "absolute", left: 0, top: 120, display: "block", overflow: "visible" }}>
            <circle cx={W - 62} cy={60} r={70} fill={p.cream} opacity={0.25} />
            <circle cx={W - 62} cy={60} r={22} fill={p.cream} />
            {back}
            <rect x={tcx - 23} y={-4} width={46} height={BASE + 4} fill={p.dark} />
            <path d={`M${tcx - 23} -4 L${tcx - 20} -20 L${tcx - 17} -4 Z`} fill={p.dark} />
            <path d={`M${tcx + 17} -4 L${tcx + 21} -20 L${tcx + 23} -4 Z`} fill={p.dark} />
            <path d={`M${tcx - 12} -4 L${tcx} -14 L${tcx + 12} -4 Z`} fill={p.dark} />
            {front}
            <rect x={0} y={BASE} width={W} height={70} fill={mix(p.dark, p.on, 0.04)} />
          </svg>
          <div style={text({ top: 10, fontSize: 16, lineHeight: "22px" })}>{days}</div>
          <div style={text({ top: 32, fontSize: city.size, fontWeight: 700, lineHeight: "80px", whiteSpace: "nowrap" })}>{city.text}</div>
          <div style={text({ top: 112, fontSize: 15, lineHeight: "20px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })}>{sub}</div>
          {crew.map((m, k) => {
            const x = (k + 0.5) / shown;
            const y = 0.78 - (Math.abs(Math.sin((now / 1000) * 3.2 + k * 0.9)) * 7) / BH;
            return (
              <div key={m.id}>
                <Placed user={m} x={x} y={y} size={44} me={me} move={false} />
                <div style={{ position: "absolute", left: `${x * 100}%`, top: 0.78 * BH + 26, transform: "translateX(-50%)" }}>
                  <Chip tone="card" maxWidth={Math.floor(W / shown) - 8}>{m.id === me ? "You" : (m.name ?? "")}</Chip>
                </div>
              </div>
            );
          })}
          {crewMore ? (
            <div style={{ position: "absolute", left: `${((shown - 0.5) / shown) * 100}%`, top: 0.78 * BH, transform: "translate(-50%,-50%)" }}>
              <More n={crewMore} size={44} />
            </div>
          ) : null}
        </>
      );
    };

    const miles = fitText(trip.miles, W - 40, { size: 52, min: 30, weight: 700 });
    const route = () => (
      <>
        <div style={{ position: "absolute", left: 0, right: 0, top: 10 }}>
          <MapStrip
            pins={trip.stops.map((s, i) => ({ id: `s${i}`, x: s.x, y: s.y, label: s.label, n: i + 1 }))}
            route
            label={`Route through ${trip.stops.length} ${trip.stops.length === 1 ? "stop" : "stops"}`}
            height={280}
            seed={trip.city}
          />
        </div>
        {trip.miles ? <div style={text({ top: 306, fontSize: miles.size, fontWeight: 700, lineHeight: "56px", whiteSpace: "nowrap" })}>{miles.text}</div> : null}
        {trip.milesNote ? <div style={text({ top: 366, fontSize: 15, lineHeight: "20px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })}>{trip.milesNote}</div> : null}
      </>
    );

    const moment = () => {
      const pw = Math.min(290, W - 60);
      const ph = Math.round(pw * 334 / 290);
      return (
        <div style={{ position: "absolute", left: "50%", top: 190, width: pw, height: ph, transform: "translate(-50%,-50%) rotate(-2deg)", background: c.card, borderRadius: 4, boxSizing: "border-box", padding: "16px 16px 56px", boxShadow: `0 6px 20px ${p.dark}` }}>
          <Thumb kind="venue" seed={trip.moment} size={pw - 32} label="" />
          <div style={{ position: "absolute", left: 16, right: 16, bottom: 6, height: 44, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 14, lineHeight: "18px", color: c.text, overflow: "hidden" }}>{trip.moment}</div>
        </div>
      );
    };

    const mvp = () => {
      const cx = W / 2;
      const cy = 130;
      const who = memberOf(trip.mvp.who);
      const name = fitText(trip.mvp.who, W - 40, { size: 56, min: 28, weight: 700 });
      const rays = Array.from({ length: 14 }, (_, k) => {
        const a = (k / 14) * Math.PI * 2 + (now / 1000) * 0.25;
        const w = 0.13;
        const pt = (ang: number) => `${(cx + Math.cos(ang) * 230).toFixed(1)},${(cy + Math.sin(ang) * 230).toFixed(1)}`;
        return <polygon key={k} points={`${cx},${cy} ${pt(a - w / 2)} ${pt(a + w / 2)}`} fill={p.on} opacity={0.07} />;
      });
      return (
        <>
          <svg viewBox={`0 0 ${W} ${BH}`} width={W} height={BH} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            {rays}
            <circle cx={cx} cy={cy} r={100} fill={p.yellow} opacity={0.35} />
            <path d={`M${cx - 22} 80 L${cx - 22} 61 L${cx - 11} 71 L${cx} 56 L${cx + 11} 71 L${cx + 22} 61 L${cx + 22} 80 Z`} fill={p.yellow} />
          </svg>
          <div style={{ position: "absolute", left: cx - 46, top: cy - 46, width: 92, height: 92 }}>
            {who ? (
              <Avatar user={who} size={92} />
            ) : (
              <div style={{ width: 92, height: 92, borderRadius: 46, background: p.purple, color: p.on, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 700 }}>{trip.mvp.who.slice(0, 1).toUpperCase()}</div>
            )}
          </div>
          <div style={text({ top: 236, textAlign: "center", fontSize: name.size, fontWeight: 700, lineHeight: "56px", whiteSpace: "nowrap" })}>{name.text}</div>
          <div style={text({ top: 310, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 })}>
            {trip.mvp.facts.map((f, i) => (
              <Chip key={i} tone="card" maxWidth={W - 48} style={{ fontSize: 13, padding: "3px 12px", lineHeight: "18px" }}>
                {f}
              </Chip>
            ))}
          </div>
        </>
      );
    };

    const costs = () => {
      const total = sum(trip.costs.map((x) => x.cents));
      const each = Math.floor(total / Math.max(1, n));
      const series = [c.series1, c.series2, c.series3, c.series4, c.series5];
      const barW = W - 40;
      let acc0 = 0;
      const segs = trip.costs.map((x, i) => {
        const left = total ? (acc0 / total) * barW : 0;
        const full = total ? (x.cents / total) * barW : 0;
        acc0 += x.cents;
        const g = local.at ? clamp01((since - i * 120) / 600) : 1;
        return <div key={i} style={{ position: "absolute", left, top: 0, height: 22, width: Math.max(0, full * g), background: series[i % 5] }} />;
      });
      return (
        <>
          <div style={text({ top: 10, fontSize: 64, fontWeight: 700, lineHeight: "72px", whiteSpace: "nowrap" })}>{money(total)}</div>
          <div style={text({ top: 90, fontSize: 15, lineHeight: "20px", whiteSpace: "nowrap" })}>{`${money(each)} each · split ${n} ${n === 1 ? "way" : "ways"}`}</div>
          <div style={text({ top: 126, height: 22, borderRadius: 11, background: mix(p.dark, p.on, 0.15), overflow: "hidden" })}>{segs}</div>
          {trip.costs.map((x, i) => (
            <div key={i} style={text({ top: 168 + i * 34, height: 28, display: "flex", alignItems: "center", gap: 10, fontSize: 15 })}>
              <span style={{ width: 14, height: 14, borderRadius: 7, background: series[i % 5], flex: "none" }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.label}</span>
              <span style={{ flex: "none", fontVariantNumeric: "tabular-nums" }}>{money(x.cents)}</span>
            </div>
          ))}
        </>
      );
    };

    const again = () => {
      const nx = fitText(trip.next, W - 40, { size: 72, min: 36, weight: 700 });
      const shown = crew.length + (crewMore ? 1 : 0);
      const iAmIn = state.ins.includes(me);
      return (
        <>
          <div style={text({ top: 10, textAlign: "center", fontSize: 16, lineHeight: "22px" })}>Same time next year?</div>
          <div style={text({ top: 32, textAlign: "center", fontSize: nx.size, fontWeight: 700, lineHeight: "80px", whiteSpace: "nowrap" })}>{nx.text}</div>
          {crew.map((m, k) => (
            <Placed
              key={m.id}
              user={m}
              x={(k + 0.5) / shown}
              y={0.55}
              size={48}
              me={me}
              move={false}
              badge={
                state.ins.includes(m.id) ? (
                  <span key="in" aria-label="In" style={{ width: 20, height: 20, borderRadius: 10, background: c.positive, display: "flex", alignItems: "center", justifyContent: "center", animation: "tripPop 350ms cubic-bezier(.3,1.6,.5,1) both" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={p.on} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 12l5 5L20 6" />
                    </svg>
                  </span>
                ) : null
              }
            />
          ))}
          {crewMore ? (
            <div style={{ position: "absolute", left: `${((shown - 0.5) / shown) * 100}%`, top: 0.55 * BH, transform: "translate(-50%,-50%)" }}>
              <More n={crewMore} size={48} />
            </div>
          ) : null}
          <div style={text({ top: 0.55 * BH + 36, textAlign: "center", fontSize: 15, lineHeight: "20px" })}>{`${state.ins.length} of ${n} in`}</div>
          <div style={{ position: "absolute", left: "50%", top: 330, width: Math.min(220, W - 40), transform: "translateX(-50%)", pointerEvents: "auto" }}>
            <Button
              kind={iAmIn ? "secondary" : "primary"}
              wide
              onClick={() => {
                haptic("success");
                dispatch({ t: "in" });
                if (!iAmIn) setLocal({ toast: clock.value });
              }}
            >
              {iAmIn ? "I'm out" : "I'm in"}
            </Button>
          </div>
        </>
      );
    };

    const body = { cover, route, moment, mvp, costs, again }[frame.id as "cover"]!();
    const header = frame.title;
    const toastOn = local.toast > 0 && running(local.toast, 2400) !== null && state.ins.includes(me);

    return (
      <div>
        <style>{"@keyframes tripPop { from { transform: scale(.2) } to { transform: scale(1) } }"}</style>
        <div style={{ position: "relative", height: 556, borderRadius: 12, overflow: "hidden", backgroundColor: bot, backgroundImage: `linear-gradient(180deg, ${top}, ${bot})`, color: p.on }}>
          <div style={{ position: "absolute", top: 6, left: 8, right: 8, height: 3, display: "flex", gap: 4 }}>
            {frames.map((f, i) => (
              <div key={f.id} style={{ flex: 1, height: 3, borderRadius: 2, background: i < fi ? p.on : mix(p.dark, p.on, 0.35), overflow: "hidden" }}>
                {i === fi ? <div style={{ height: 3, width: `${clamp01(since / FRAME_MS) * 100}%`, background: p.on }} /> : null}
              </div>
            ))}
          </div>

          <div style={{ position: "absolute", top: 14, left: 12, right: 12, height: 32, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 15, background: c.card, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={c.primary} strokeWidth="3">
                <circle cx="8" cy="8" r="6" />
              </svg>
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, color: p.on, flex: "none" }}>Muse</span>
            <span style={{ fontSize: 13, color: p.on, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{`${header}${trip.dates ? ` · ${trip.dates}` : ""}`}</span>
          </div>

          <div key={frame.id} style={{ position: "absolute", left: 0, right: 0, top: 56, height: BH, overflow: "hidden", transform: `translateX(${shift}px)`, zIndex: 1, pointerEvents: "none" }}>
            {body}
          </div>
          <button aria-label="Previous" onClick={() => go(-1)} style={{ position: "absolute", left: 0, top: 56, width: "30%", height: BH, background: "transparent", border: 0, padding: 0, cursor: "pointer" }} />
          <button aria-label="Next" onClick={() => go(1)} style={{ position: "absolute", left: "30%", top: 56, width: "70%", height: BH, background: "transparent", border: 0, padding: 0, cursor: "pointer" }} />

          <div style={{ position: "absolute", left: 12, right: 8, top: 488, height: 48, display: "flex", alignItems: "center", gap: 8, zIndex: 2 }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
              {recent.length ? <Facepile users={recent.slice(0, 3)} max={3} size={22} /> : null}
              <span style={{ fontSize: 13, color: p.on, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{reactLine}</span>
            </div>
            <div style={{ display: "flex", gap: 4, flex: "none" }}>
              {[0, 1, 2].map((k) => (
                <button
                  key={k}
                  aria-label={labels[k]}
                  onClick={() => dispatch({ t: "react", kind: k })}
                  style={{ width: BAR_W, height: 48, background: "transparent", border: 0, padding: 0, color: p.on, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, cursor: "pointer" }}
                >
                  {glyph(k, 32)}
                  <span style={{ fontSize: 11, lineHeight: "13px", color: p.on }}>{state.counts[k] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>
          {floats}
        </div>
        {toastOn ? <Toast key={local.toast}>{`You're in for ${trip.next}`}</Toast> : null}
      </div>
    );
  },
});
