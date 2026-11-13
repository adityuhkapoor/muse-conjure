import { defineApp, Button, CardHeader, Chip, Facepile, More, OptionRow, Placed, Scene, Toast, at, circle, haptic, innerWidth, line, mix, pal, path, rect, rng, running } from "@muse/app";

// Pregame vote: a small map of the blocks around the venue with three meetup pins. Friends stand by
// the pin they voted for; time rows sit below. Lock picks the leading pin and time (ties by the
// seed), everyone gathers at the winning pin and a dashed route runs to the venue.

type Params = {
  /** Card title: "Pregame before the Greek" */
  title: string;
  sub: string;
  /** Short venue name */
  venue: string;
  /** Doors time in minutes after midnight, 0 to 1439 */
  doorsMin: number;
  /** 3 spots; x, y are fractions of the map; voters are names as in the chat */
  spots: { name: string; walk: number; x: number; y: number; voters: string[] }[];
  /** 2 to 3 times */
  times: { label: string; voters: string[] }[];
  /** Up to 2 street names for the map */
  streets: { name: string; x: number; y: number }[];
};

// @params
const P: Params = {
  title: "Pregame before the Greek",
  sub: "Doors 7:00 · 7 going",
  venue: "The Greek",
  doorsMin: 1140,
  spots: [
    { name: "Jana's apt", walk: 14, x: 0.205, y: 0.63, voters: ["Maya", "Theo"] },
    { name: "Top Dog", walk: 11, x: 0.437, y: 0.37, voters: ["Noa", "Jonah"] },
    { name: "Memorial Glade", walk: 7, x: 0.658, y: 0.75, voters: ["Priya", "Dev"] },
  ],
  times: [
    { label: "6:00 PM", voters: ["Jonah"] },
    { label: "6:30 PM", voters: ["Maya", "Noa", "Priya"] },
    { label: "7:00 PM", voters: ["Theo", "Dev"] },
  ],
  streets: [
    { name: "Bancroft", x: 0.32, y: 0.8 },
    { name: "Piedmont", x: 0.76, y: 0.95 },
  ],
};
// @end params

type Spot = { id: string; name: string; walk: number; x: number; y: number; voters: string[] };
type Slot = { id: string; label: string; voters: string[] };
/** lockedAt, spot and time are set together by lock */
type State = {
  title: string;
  sub: string;
  venue: string;
  doorsMin: number;
  streets: { name: string; x: number; y: number }[];
  spots: Spot[];
  times: Slot[];
  lockedAt: number;
  spot: string | null;
  time: string | null;
};
type Action = { t: "spot"; id: string } | { t: "time"; id: string } | { t: "lock" };
type Ctx = { members: { id: string; name?: string }[] };

const MAP_H = 130;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const top = <T extends { voters: string[] }>(xs: T[]): T[] => {
  const m = Math.max(0, ...xs.map((x) => x.voters.length));
  return xs.filter((x) => x.voters.length === m);
};
const maxCount = (xs: { voters: string[] }[]) => Math.max(0, ...xs.map((x) => x.voters.length));
const countOf = (xs: { id: string; voters: string[] }[], id: string | null) => xs.find((x) => x.id === id)?.voters.length ?? -1;
const voteOf = (xs: { voters: string[] }[], u: string) => xs.some((x) => x.voters.includes(u));
const votes = (xs: { id: string; voters: string[] }[], u: string) => JSON.stringify(xs.map((x) => [x.id, x.voters.filter((v) => v !== u)]));
const hm = (min: number) => {
  const t = ((min % 1440) + 1440) % 1440;
  return `${(Math.floor(t / 60) + 11) % 12 + 1}:${String(t % 60).padStart(2, "0")}`;
};

function vote<T extends { id: string; voters: string[] }>(xs: T[], id: unknown, user: string): T[] | null {
  const x = typeof id === "string" ? xs.find((y) => y.id === id) : undefined;
  if (!x || x.voters.includes(user)) return null;
  return xs.map((y) => ({ ...y, voters: y.id === x.id ? [...y.voters.filter((v) => v !== user), user] : y.voters.filter((v) => v !== user) }));
}

const pos = (x: number, y: number, extra: Record<string, string | number>) => at(x, y, extra) as Record<string, string | number>;
const lockedOf = (s: State) => s.lockedAt > 0;

export default defineApp<State, Action>({
  name: "Pregame vote",
  summary: (s) => {
    if (s.lockedAt > 0) return `${s.title}: ${s.spots.find((x) => x.id === s.spot)?.name ?? ""} at ${s.times.find((x) => x.id === s.time)?.label ?? ""}`;
    const sp = top(s.spots);
    const lead = maxCount(s.spots) > 0 && sp.length === 1 ? sp[0]!.name : null;
    const tm = maxCount(s.times) > 0 ? top(s.times)[0]!.label : "";
    return `${s.title}: ${lead ?? "no votes yet"}${tm ? ` · ${tm}` : ""}`;
  },

  init: (ctx) => {
    const find = (name: string) => {
      const want = String(name).trim().toLowerCase();
      return ctx.members.find((m) => m.id === name || (m.name ?? "").toLowerCase() === want)?.id;
    };
    const placed = (lists: string[][]) => {
      const seen = new Set<string>();
      return lists.map((names) => {
        const out: string[] = [];
        for (const n of names ?? []) {
          const id = find(n);
          if (id && !seen.has(id)) {
            seen.add(id);
            out.push(id);
          }
        }
        return out;
      });
    };
    const sv = placed(P.spots.slice(0, 3).map((x) => x.voters));
    const spots: Spot[] = P.spots.slice(0, 3).map((x, i) => ({
      id: `s${i}`,
      name: String(x.name).trim().slice(0, 20) || "Spot",
      walk: Math.round(clamp(x.walk, 1, 60)),
      x: clamp(x.x, 0.08, 0.8),
      y: clamp(x.y, 0.3, 0.85),
      voters: sv[i]!,
    }));
    const tv = placed(P.times.slice(0, 3).map((x) => x.voters));
    const times: Slot[] = P.times.slice(0, 3).map((x, i) => ({ id: `t${i}`, label: String(x.label).trim().slice(0, 12), voters: tv[i]! }));
    const doors = Number.isInteger(P.doorsMin) && P.doorsMin >= 0 && P.doorsMin <= 1439 ? P.doorsMin : 1140;
    return {
      title: P.title.trim().slice(0, 60) || "Pregame",
      sub: P.sub.trim().slice(0, 60),
      venue: P.venue.trim().slice(0, 24),
      doorsMin: doors,
      streets: P.streets.slice(0, 2).map((s) => ({ name: String(s.name).trim().slice(0, 14), x: clamp(s.x, 0, 1), y: clamp(s.y, 0, 1) })),
      spots,
      times,
      lockedAt: 0,
      spot: null,
      time: null,
    };
  },

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user) || lockedOf(s)) return s;
    if (a.t === "spot") {
      const spots = vote(s.spots, a.id, meta.user);
      return spots ? { ...s, spots } : s;
    }
    if (a.t === "time") {
      const times = vote(s.times, a.id, meta.user);
      return times ? { ...s, times } : s;
    }
    if (a.t === "lock") {
      if (maxCount(s.spots) === 0 || maxCount(s.times) === 0) return s;
      const r = rng(meta.seed);
      const spot = r.pick(top(s.spots)).id;
      const time = r.pick(top(s.times)).id;
      return { ...s, lockedAt: meta.time, spot, time };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const ok = (xs: { voters: string[] }[]) => xs.every((x) => x.voters.every((u) => inChat(ctx, u)));
    if (ok(s.spots) && ok(s.times)) return s;
    const strip = <T extends { voters: string[] }>(xs: T[]): T[] => xs.map((x) => ({ ...x, voters: x.voters.filter((u) => inChat(ctx, u)) }));
    return { ...s, spots: strip(s.spots), times: strip(s.times) };
  },

  invariants: {
    "one spot vote and one time vote per person": (s) => {
      const a = s.spots.flatMap((x) => x.voters);
      const b = s.times.flatMap((x) => x.voters);
      return new Set(a).size === a.length && new Set(b).size === b.length;
    },
    "voters are in the chat": (s, ctx) => [...s.spots, ...s.times].every((x) => x.voters.every((u) => inChat(ctx, u))),
    "a lock names a real spot and time": (s) =>
      s.lockedAt > 0 === (s.spot !== null) &&
      (s.spot === null) === (s.time === null) &&
      (s.spot === null || s.spots.some((x) => x.id === s.spot)) &&
      (s.time === null || s.times.some((x) => x.id === s.time)),
    "the map keeps its shape": (s) =>
      s.spots.length >= 1 && s.spots.length <= 3 && s.times.length >= 1 && s.times.length <= 3 &&
      new Set(s.spots.map((x) => x.id)).size === s.spots.length &&
      new Set(s.times.map((x) => x.id)).size === s.times.length &&
      s.spots.every((x) => x.x >= 0 && x.x <= 1 && x.y >= 0 && x.y <= 1),
  },

  transitions: {
    "a spot vote moves only the actor, onto that pin": (p, n, a, m) =>
      a.t !== "spot" || p === n || (p.lockedAt === 0 && n.spots.find((x) => x.id === a.id)!.voters.at(-1) === m.user && n.spots.filter((x) => x.voters.includes(m.user)).length === 1 && votes(p.spots, m.user) === votes(n.spots, m.user) && same(p.times, n.times)),
    "a time vote moves only the actor, onto that time": (p, n, a, m) =>
      a.t !== "time" || p === n || (p.lockedAt === 0 && n.times.find((x) => x.id === a.id)!.voters.at(-1) === m.user && n.times.filter((x) => x.voters.includes(m.user)).length === 1 && votes(p.times, m.user) === votes(n.times, m.user) && same(p.spots, n.spots)),
    "lock picks a spot and a time with the most votes": (p, n, a, m) =>
      a.t !== "lock" || p === n || (p.lockedAt === 0 && n.lockedAt === m.time && maxCount(p.spots) > 0 && maxCount(p.times) > 0 && maxCount(p.spots) === countOf(p.spots, n.spot) && maxCount(p.times) === countOf(p.times, n.time) && same(p.spots, n.spots) && same(p.times, n.times)),
    "lock breaks ties with the seed": (p, n, a, m) => {
      if (a.t !== "lock" || p === n) return true;
      const r = rng(m.seed);
      return n.spot === r.pick(top(p.spots)).id && n.time === r.pick(top(p.times)).id;
    },
    "after the lock nothing moves": (p, n) => p.lockedAt === 0 || same(p, n),
    "only people in the chat vote": (p, n, _a, m, ctx) => same(p, n) || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.07) return { t: "lock" };
    if (k < 0.55) return { t: "spot", id: r.pick(s.spots).id };
    return { t: "time", id: r.pick(s.times).id };
  },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = innerWidth();
    const H = MAP_H;
    const X = (f: number) => f * W;
    const Y = (f: number) => f * H;
    const locked = lockedOf(confirmed);
    const v = locked ? confirmed : state;
    const pins = [c.series1, c.series2, c.series3];
    const chosen = locked ? v.spots.find((x) => x.id === v.spot) : undefined;
    const chosenTime = locked ? v.times.find((x) => x.id === v.time) : undefined;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";

    const vx = X(0.868);
    const vy = Y(0.25);
    const tipOf = (s: Spot) => ({ tx: X(s.x), ty: Y(s.y) - (locked && s.id === v.spot ? 3 : 0) });
    const mySpot = voteOf(v.spots, me);
    const myTime = voteOf(state.times, me) ;
    const anySpot = maxCount(state.spots) > 0;
    const anyTime = maxCount(state.times) > 0;

    // ---- art ----
    // Street names sit on the map but never under a chip or a pin: try nearby heights, else skip.
    const boxes = [
      { l: vx - 24, r: vx + 24, t: vy + 14, b: vy + 38 },
      ...v.spots.flatMap((s) => {
        const { tx, ty } = tipOf(s);
        const w = Math.min(140, `${s.name} · ${s.walk} min`.length * 6.6 + 16);
        const l = tx - w * s.x;
        return [{ l, r: l + w, t: ty + 2, b: ty + 22 }, { l: tx - 14, r: tx + 14, t: ty - 36, b: ty }];
      }),
    ];
    const streetsAt: { name: string; x: number; y: number }[] = [];
    for (const s of v.streets) {
      const w = s.name.length * 6.2;
      for (const dy of [0, -12, 12, -24, 24, -36, 36]) {
        const x = X(s.x), y = Y(s.y) + dy;
        if (x + w > W - 2 || y < 12 || y > H - 3) continue;
        const hit = [...boxes, ...streetsAt.map((o) => ({ l: o.x, r: o.x + o.name.length * 6.2, t: o.y - 11, b: o.y + 3 }))].some((b) => x - 3 < b.r && x + w + 3 > b.l && y - 12 < b.b && y + 4 > b.t);
        if (!hit) {
          streetsAt.push({ name: s.name, x, y });
          break;
        }
      }
    }

    const art = [
      circle(X(0.79), Y(0.26), 40, p.grass, { opacity: 0.5 }),
      circle(X(0.91), Y(0.38), 34, p.grass, { opacity: 0.5 }),
      circle(X(0.85), 0, 34, p.grass, { opacity: 0.5 }),
      circle(X(0.97), Y(0.13), 30, p.grass, { opacity: 0.5 }),
      ...[0.19, 0.52, 0.84].map((f) => line(0, Y(f), W, Y(f), c.card, 7)),
      ...[0.105, 0.29, 0.5, 0.69].map((f) => line(X(f), 0, X(f) + 8, H, c.card, 7)),
      line(0, Y(0.94), W, Y(0.06), c.card, 4, { opacity: 0.7 }),
      ...streetsAt.map((s) => (
          <text key={s.name} x={s.x} y={s.y} fontSize="11" fill={c.secondaryText} textAnchor="start">
            {s.name}
          </text>
        )),
      ...[0, 1, 2, 3].map((k) => {
        const r = 8 + 6 * k;
        return <path key={`a${k}`} d={`M${vx - r} ${vy + 6} A${r} ${0.7 * r} 0 0 1 ${vx + r} ${vy + 6}`} stroke={mix(c.text, c.series4, 0.5)} strokeWidth="3" fill="none" />;
      }),
      rect(vx - 7, vy + 5, 14, 6, 2, c.text),
      ...(locked && chosen
        ? [
            <path
              key="route"
              d={`M${tipOf(chosen).tx} ${tipOf(chosen).ty - 4} L${vx - 34} ${tipOf(chosen).ty - 4} L${vx - 34} ${vy + 4} L${vx} ${vy + 4}`}
              fill="none"
              stroke={c.primary}
              strokeWidth="3"
              strokeDasharray="7 5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: routeOpacity(confirmed.lockedAt) }}
            />,
          ]
        : []),
      ...v.spots.map((s, i) => {
        const { tx, ty } = tipOf(s);
        const dim = locked && s.id !== v.spot;
        return (
          <g key={s.id} opacity={dim ? 0.4 : 1}>
            {path(`M${tx} ${ty} l-8 -14 a11 11 0 1 1 16 0 Z`, pins[i] ?? c.series1)}
            {circle(tx, ty - 21, 4, c.card)}
          </g>
        );
      }),
    ];

    // ---- people: one flat keyed list so a face springs from its pin to the winning pin ----
    const faces: { id: string; x: number; y: number; more?: number }[] = [];
    const mores: { key: string; n: number; x: number; y: number }[] = [];
    if (locked && chosen) {
      const { tx, ty } = tipOf(chosen);
      const everyone = [...new Set([...v.spots.flatMap((s) => s.voters), ...v.times.flatMap((t) => t.voters)])];
      everyone.forEach((u, k) => {
        if (k < 10) faces.push({ id: u, x: (tx - 26 - (k % 5) * 17) / W, y: (ty - 22 + Math.floor(k / 5) * 20) / H });
      });
      if (everyone.length > 10) mores.push({ key: "more", n: everyone.length - 10, x: (tx - 26) / W, y: (ty - 22 + 40) / H });
    } else {
      v.spots.forEach((s) => {
        const { tx, ty } = tipOf(s);
        s.voters.forEach((u, k) => {
          if (k < 3) faces.push({ id: u, x: Math.max(12 / W, (tx - 26 - k * 17) / W), y: (ty - 22) / H });
          else if (k === 3) mores.push({ key: `m${s.id}`, n: s.voters.length - 3, x: Math.max(12 / W, (tx - 26 - 3 * 17) / W), y: (ty - 22) / H });
        });
      });
      if (!mySpot && !faces.some((f) => f.id === me)) faces.push({ id: me, x: 22 / W, y: (H - 18) / H });
    }

    const mapLabel = locked && chosen ? `Map: meeting at ${chosen.name}, ${chosen.walk} min walk to ${v.venue}` : `Map: ${v.spots.map((s) => `${s.name} ${s.voters.length}`).join(", ")}`;

    // ---- tally ----
    const counts = state.spots.map((s) => s.voters.length);
    const topSpots = top(state.spots);
    const topTimes = top(state.times);
    const voters = new Set([...state.spots.flatMap((s) => s.voters), ...state.times.flatMap((t) => t.voters)]);
    const timeVoters = new Set(state.times.flatMap((t) => t.voters));
    const lead = topSpots[0]?.name ?? "";
    const tally = !anySpot
      ? "Tap a pin to vote"
      : topSpots.length > 1
        ? `Spots are tied ${counts.join("–")} · tap a pin to break it`
        : mySpot && !myTime
          ? `${lead} leads · now pick a time`
          : anyTime
            ? `${lead} at ${topTimes[0]!.label} · ${voters.size} of ${members.length} voted`
            : `${lead} leads · now pick a time`;
    const lockPending = pending && lockedOf(state) && !locked;
    const celebrating = locked && running(confirmed.lockedAt, 2400) !== null;
    const everyone = [...new Set([...v.spots.flatMap((s) => s.voters), ...v.times.flatMap((t) => t.voters)])];

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub} />
        <Scene height={H} radius={12} bg={mix(c.card, c.series3, 0.1)} label={mapLabel} art={art}>
          <Chip tone="card" style={at(0.868, (vy + 26) / H)}>{v.venue}</Chip>
          {v.spots.map((s) => {
            const { tx, ty } = tipOf(s);
            return (
              <Chip key={`c${s.id}`} tone="card" maxWidth={140} style={at(s.x, (ty + 12) / H, { transform: `translate(-${s.x * 100}%,-50%)` })}>
                {`${s.name} · ${s.walk} min`}
              </Chip>
            );
          })}
          {locked
            ? null
            : v.spots.map((s) => {
                const { ty } = tipOf(s);
                const mine = s.voters.includes(me);
                return <button key={`b${s.id}`} type="button" aria-label={`Meet at ${s.name}`} aria-pressed={mine} onClick={() => dispatch({ t: "spot", id: s.id })} style={pos(s.x, (ty - 21) / H, { width: 48, height: 48, borderRadius: 24, background: "transparent", border: 0, padding: 0, cursor: "pointer" })} />;
              })}
          {faces.map((f) => (
            <Placed key={`u${f.id}`} user={f.id} x={f.x} y={f.y} size={f.id === me && !mySpot && !locked ? 20 : 19} me={me} />
          ))}
          {mores.map((m) => (
            <span key={m.key} style={pos(m.x, m.y, { display: "flex" })}>
              <More n={m.n} size={19} />
            </span>
          ))}
          {!locked && !mySpot ? (
            <Chip tone="primary" style={at(70 / W, (H - 18) / H)}>
              Tap a pin
            </Chip>
          ) : null}
        </Scene>
        <div style={{ height: 4 }} />
        {v.times.map((t) => (
          <OptionRow key={t.id} label={t.label} count={t.voters.length} total={Math.max(1, timeVoters.size)} voters={t.voters} selected={t.voters.includes(me)} {...(locked ? {} : { onClick: () => dispatch({ t: "time", id: t.id }) })} />
        ))}
        <div style={{ height: 8 }} />
        {locked && chosen && chosenTime ? (
          <div style={{ background: c.input, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`Pregame at ${chosen.name} · ${chosenTime.label}`}</div>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`Leave ${hm(v.doorsMin - chosen.walk - 3)} · ${chosen.walk} min walk · doors ${hm(v.doorsMin)}`}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Facepile users={everyone} max={4} size={20} />
              <small>{`${everyone.length} meeting up`}</small>
            </div>
          </div>
        ) : lockPending ? (
          <small style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 36 }}>Locking</small>
        ) : (
          <>
            {anySpot && anyTime ? (
              <Button
                kind="primary"
                wide
                onClick={() => {
                  haptic("success");
                  dispatch({ t: "lock" });
                }}
              >
                Lock it
              </Button>
            ) : null}
            <small style={{ display: "block", marginTop: anySpot && anyTime ? 6 : 0, height: 16, lineHeight: "16px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tally}</small>
          </>
        )}
        {celebrating ? <Toast key={confirmed.lockedAt}>It's a plan.</Toast> : null}
      </div>
    );
    void nameOf;
  },
});

/** The route fades in over 400 ms after the lock. */
function routeOpacity(lockedAt: number): number {
  const e = running(lockedAt, 400);
  return e === null ? 1 : Math.min(1, e / 400);
}
