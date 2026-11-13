import {
  defineApp,
  Avatar,
  Button,
  Canvas,
  Changed,
  Chip,
  Facepile,
  Stars,
  Thumb,
  haptic,
  mix,
  pal,
  running,
  thumbKind,
  tween,
  type Member,
} from "@muse/app";

// A food reel Maya shared ("Friday??") turns into the group's to-try list. Tap Add and the bowl
// flies into the list as a new row; friends tap in, and spots you have been to show the group's
// stars. The reel is the picture; the list underneath is the shared state.

type Params = {
  /** The shared reel: from (name), note, account, caption, likes, place, area. */
  reel: { from: string; note: string; account: string; caption: string; likes: string; place: string; area: string };
  /** Places already on the list, with their tried date and the chat's ratings and wants. */
  spots: { name: string; area: string; tried: string; ratings: { by: string; stars: number }[]; want: string[] }[];
  /** Chat layout: a short reel, tighter rows, three places and a "more" row. Fits 420 px. Default: the 600 px reel layout. */
  compact?: boolean;
};

// @params
const P: Params = {
  reel: { from: "Maya", note: "Friday??", account: "sfbitesdaily", caption: "The $13 tonkotsu in Japantown that ended me", likes: "48K", place: "Marufuku Ramen", area: "Japantown" },
  spots: [
    { name: "Señor Sisig", area: "Mission", tried: "Oct 3", ratings: [{ by: "Priya", stars: 5 }, { by: "Sam", stars: 4 }], want: [] },
    { name: "Tartine", area: "Mission", tried: "Sep 20", ratings: [{ by: "Ana", stars: 4 }, { by: "Kev", stars: 5 }, { by: "Leo", stars: 4 }], want: [] },
    { name: "Mitchell's Ice Cream", area: "Bernal", tried: "", ratings: [], want: ["Sam", "Ana", "Kev"] },
    { name: "Boba Guys", area: "Hayes Valley", tried: "Aug 30", ratings: [{ by: "Jess", stars: 3 }, { by: "Nico", stars: 4 }, { by: "Leo", stars: 3 }], want: [] },
  ],
};
// @end params

type Rating = { u: string; n: number; at: number };
type Spot = {
  id: string;
  name: string;
  area: string;
  /** "Oct 3", "recently", or null while it is still on the to-try side. */
  tried: string | null;
  /** Stars from params whose rater is not in the chat (anonymous, 1..5). */
  past: number[];
  /** Stars from members, one per member. */
  ratings: Rating[];
  /** Member ids who want in (used while tried === null). */
  want: string[];
};
type State = {
  reel: { from: string; note: string; account: string; caption: string; likes: string; place: string; area: string };
  /** The reel's place is on the list. */
  added: { by: string; at: number } | null;
  /** Newest first; at most 8. */
  spots: Spot[];
};
// `add` with no label puts the reel's own place on the list (once); with a label, a further reel shared to the chat adds one of its places.
type Action = { t: "add"; label?: string; area?: string } | { t: "want"; spot: string } | { t: "went"; spot: string } | { t: "rate"; spot: string; stars: number };
type Local = { all: boolean };

const MAX_SPOTS = 8;
const SHOWN = 5;
const SHOWN_COMPACT = 3;
const REEL_ID = "reel";
const fly = tween({ duration: 600, easing: "easeInOut" });
const grow = tween({ duration: 350, easing: "decelerate" });
const STAR = "M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z";

const cut = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const memberFor = (members: readonly Member[], name: string) => {
  const want = name.trim().toLowerCase();
  return members.find((m) => m.id === name || m.name.trim().toLowerCase() === want);
};
const starsOf = (v: unknown) => {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(1, Math.min(5, Math.round(v)));
};
const spotOf = (s: State, id: string) => s.spots.find((x) => x.id === id);
const avgOf = (spot: Spot) => {
  const all = [...spot.ratings.map((r) => r.n), ...spot.past];
  return all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
};
const sameWithout = (a: string[], b: string[], user: string) => {
  const x = a.filter((u) => u !== user);
  const y = b.filter((u) => u !== user);
  return x.length === y.length && x.every((u, i) => u === y[i]);
};
const otherRatings = (a: Rating[], b: Rating[], user: string) => {
  const x = a.filter((r) => r.u !== user);
  const y = b.filter((r) => r.u !== user);
  return x.length === y.length && x.every((r, i) => r.u === y[i]!.u && r.n === y[i]!.n && r.at === y[i]!.at);
};

export default defineApp<State, Action, Local>({
  name: "Reel to try list",
  summary: (s) =>
    s.added
      ? `${s.reel.place} is on the to-try list · ${s.spots.length} spots`
      : `${s.reel.from} shared a reel: ${s.reel.place} · ${s.spots.length} spots on the list`,

  init: (ctx) => {
    const reel = {
      from: cut(P.reel.from, 40),
      note: cut(P.reel.note, 30),
      account: cut(P.reel.account, 24),
      caption: cut(P.reel.caption, 80),
      likes: cut(P.reel.likes, 6),
      place: cut(P.reel.place, 40),
      area: cut(P.reel.area, 24),
    };
    const spots: Spot[] = [];
    P.spots.forEach((raw, i) => {
      if (spots.length >= MAX_SPOTS) return;
      const name = cut(raw.name, 40);
      if (name.toLowerCase() === reel.place.toLowerCase()) return;
      const tried = cut(raw.tried, 30) || null;
      const ratings: Rating[] = [];
      const past: number[] = [];
      if (tried !== null) {
        const seen = new Set<string>();
        for (const r of raw.ratings) {
          const n = starsOf(r.stars);
          if (n === null) continue;
          const who = memberFor(ctx.members, cut(r.by, 40));
          if (who && !seen.has(who.id)) {
            seen.add(who.id);
            ratings.push({ u: who.id, n, at: 0 });
          } else if (!who) {
            past.push(n);
          }
        }
      }
      const want: string[] = [];
      for (const w of raw.want) {
        const who = memberFor(ctx.members, cut(w, 40));
        if (who && !want.includes(who.id)) want.push(who.id);
      }
      spots.push({ id: `s${i}`, name, area: cut(raw.area, 24), tried, past, ratings, want });
    });
    return { reel, added: null, spots };
  },

  reduce: (s, a, meta, ctx) => {
    if (!ctx.members.some((m) => m.id === meta.user)) return s;

    if (a.t === "add") {
      if (typeof a.label === "string") {
        const name = cut(a.label, 40);
        if (!name || s.spots.length >= MAX_SPOTS) return s;
        if (name.toLowerCase() === s.reel.place.toLowerCase() || s.spots.some((x) => x.name.toLowerCase() === name.toLowerCase())) return s;
        const row: Spot = { id: `a${meta.seq}`, name, area: cut(a.area, 24), tried: null, past: [], ratings: [], want: [meta.user] };
        return { ...s, spots: [row, ...s.spots] };
      }
      if (s.added !== null) return s;
      const sharer = memberFor(ctx.members, s.reel.from);
      const want = sharer && sharer.id !== meta.user ? [meta.user, sharer.id] : [meta.user];
      const row: Spot = { id: REEL_ID, name: s.reel.place, area: s.reel.area, tried: null, past: [], ratings: [], want };
      return { ...s, added: { by: meta.user, at: meta.time }, spots: [row, ...s.spots].slice(0, MAX_SPOTS) };
    }

    if (a.t === "want") {
      if (typeof a.spot !== "string") return s;
      const row = spotOf(s, a.spot);
      if (!row || row.tried !== null) return s;
      return {
        ...s,
        spots: s.spots.map((x) => (x.id !== a.spot ? x : { ...x, want: x.want.includes(meta.user) ? x.want.filter((u) => u !== meta.user) : [...x.want, meta.user] })),
      };
    }

    if (a.t === "went") {
      if (typeof a.spot !== "string") return s;
      const row = spotOf(s, a.spot);
      if (!row || row.tried !== null || !row.want.includes(meta.user)) return s;
      return { ...s, spots: s.spots.map((x) => (x.id !== a.spot ? x : { ...x, tried: "recently" })) };
    }

    if (a.t === "rate") {
      if (typeof a.spot !== "string" || typeof a.stars !== "number" || !Number.isInteger(a.stars) || a.stars < 1 || a.stars > 5) return s;
      const row = spotOf(s, a.spot);
      if (!row || row.tried === null) return s;
      const rating: Rating = { u: meta.user, n: a.stars, at: meta.time };
      return {
        ...s,
        spots: s.spots.map((x) => {
          if (x.id !== a.spot) return x;
          const at = x.ratings.findIndex((r) => r.u === meta.user);
          if (at < 0) return { ...x, ratings: [...x.ratings, rating] };
          return { ...x, ratings: x.ratings.map((r, i) => (i === at ? rating : r)) };
        }),
      };
    }

    return s;
  },

  onMembers: (s, ctx) => {
    const here = new Set(ctx.members.map((m) => m.id));
    let changed = false;
    const spots = s.spots.map((x) => {
      const want = x.want.filter((u) => here.has(u));
      const ratings = x.ratings.filter((r) => here.has(r.u));
      if (want.length === x.want.length && ratings.length === x.ratings.length) return x;
      changed = true;
      return { ...x, want, ratings };
    });
    return changed ? { ...s, spots } : s;
  },

  invariants: {
    "spots capped": (s) => s.spots.length <= MAX_SPOTS,
    "ids unique": (s) => new Set(s.spots.map((x) => x.id)).size === s.spots.length,
    "no reel row before add": (s) => s.added !== null || !s.spots.some((x) => x.id === REEL_ID),
    "stars are 1 to 5": (s) => s.spots.every((x) => x.ratings.every((r) => Number.isInteger(r.n) && r.n >= 1 && r.n <= 5) && x.past.every((n) => Number.isInteger(n) && n >= 1 && n <= 5)),
    "one rating per person": (s) => s.spots.every((x) => new Set(x.ratings.map((r) => r.u)).size === x.ratings.length),
    "only tried spots have stars": (s) => s.spots.every((x) => x.tried !== null || (x.ratings.length === 0 && x.past.length === 0)),
    "people are in the chat": (s, ctx) => s.spots.every((x) => x.want.every((u) => ctx.members.some((m) => m.id === u)) && x.ratings.every((r) => ctx.members.some((m) => m.id === r.u))),
    "want has no repeats": (s) => s.spots.every((x) => new Set(x.want).size === x.want.length),
    "spots are well formed": (s) =>
      s.spots.every((x) => typeof x.id === "string" && typeof x.name === "string" && x.name.length <= 40 && typeof x.area === "string" && x.area.length <= 24 && (x.tried === null || (typeof x.tried === "string" && x.tried.length <= 30))),
    "added is well formed": (s) => s.added === null || (typeof s.added.by === "string" && typeof s.added.at === "number"),
  },

  transitions: {
    "add happens once": (p, n, a) => a.t !== "add" || p.added === null || n.added === p.added,
    "add puts the reel first": (p, n, a, m) => {
      if (a.t !== "add" || typeof a.label === "string") return true;
      if (p.added !== null || n === p) return true;
      const first = n.spots[0];
      return !!first && n.added?.by === m.user && first.id === REEL_ID && first.want.includes(m.user);
    },
    "added never changes after": (p, n, a) => a.t === "add" || n.added === p.added,
    "want toggles only the actor": (p, n, a, m) => {
      if (a.t !== "want" || n === p) return true;
      if (typeof a.spot !== "string") return true;
      const before = spotOf(p, a.spot);
      const after = spotOf(n, a.spot);
      if (!before || !after) return false;
      return before.want.includes(m.user) !== after.want.includes(m.user) && sameWithout(before.want, after.want, m.user);
    },
    "went needs a want": (p, n, a, m) => {
      if (a.t !== "went" || n === p) return true;
      if (typeof a.spot !== "string") return true;
      const before = spotOf(p, a.spot);
      const after = spotOf(n, a.spot);
      return !!before && !!after && before.tried === null && before.want.includes(m.user) && after.tried === "recently";
    },
    "rate sets the actor's stars": (p, n, a, m) => {
      if (a.t !== "rate" || n === p) return true;
      if (typeof a.spot !== "string") return true;
      const after = spotOf(n, a.spot);
      return !!after && after.ratings.find((r) => r.u === m.user)?.n === a.stars;
    },
    "rate leaves other raters alone": (p, n, a, m) => {
      if (a.t !== "rate" || n === p) return true;
      if (typeof a.spot !== "string") return true;
      const before = spotOf(p, a.spot);
      const after = spotOf(n, a.spot);
      if (!before || !after) return false;
      if (!otherRatings(before.ratings, after.ratings, m.user)) return false;
      return p.spots.every((x) => x.id === a.spot || n.spots.some((y) => y.id === x.id && y === x));
    },
    "only add changes the list length": (p, n, a) => a.t === "add" || n.spots.length === p.spots.length,
    "a place add puts that place first, wanted by the actor": (p, n, a, m) => {
      if (a.t !== "add" || typeof a.label !== "string" || n === p) return true;
      const first = n.spots[0];
      return n.spots.length === p.spots.length + 1 && n.added === p.added && !!first && first.name === cut(a.label, 40) && first.want.length === 1 && first.want[0] === m.user;
    },
  },

  arbitrary: (s, user, r) => {
    if (s.added === null && r.next() < 0.4) return { t: "add" };
    if (r.next() < 0.15) return { t: "add", label: r.pick(["Golden Fold", "Mr. Bao", "Tacos Lupe", "El Primo truck", ""]), area: "Telegraph" };
    const x = s.spots.length ? r.pick(s.spots) : null;
    if (!x) return { t: "add" };
    if (x.tried !== null) return { t: "rate", spot: x.id, stars: r.int(5) + 1 };
    if (x.want.includes(user) && r.next() < 0.4) return { t: "went", spot: x.id };
    return { t: "want", spot: x.id };
  },

  local: { all: false },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const here = members.some((m) => m.id === me);
    const compact = P.compact === true;
    const reelBox = compact ? 112 : 218;
    const rowBase = compact ? 48 : 56;
    const thumb = compact ? 36 : 44;
    const first = state.spots[0];
    const flying = state.added ? running(state.added.at, 900) : null;
    const e = flying !== null && flying <= 600 ? flying : null;
    const k = e === null ? null : fly(e);
    const growing = state.added ? running(state.added.at + 550, 350) : null;
    const reelH = state.added ? (growing === null ? rowBase : Math.round(grow(growing) * rowBase)) : rowBase;
    // compact shows every place up to four; five or more fold to three and a "more" row
    const cap = compact ? (state.spots.length > 4 ? SHOWN_COMPACT : 4) : SHOWN;
    const shown = local.all ? state.spots : state.spots.slice(0, cap);
    const tried = state.spots.filter((x) => x.tried !== null).length;
    const fromMember = memberFor(members, state.reel.from);

    // The footer line only shows when it fits the 600 px budget (card padding included).
    const rowsH = shown.reduce((t, x) => t + (x.tried !== null && here && !x.ratings.some((r) => r.u === me) ? rowBase + 8 : rowBase), 0) + Math.max(0, shown.length - 1) + (state.spots.length > cap ? 44 : 0);
    const showFooter = !compact && state.spots.length > 0 && state.added === null && 306 + rowsH + 44 + 2 * theme.space.card <= 600;

    const sub = (x: Spot) => {
      if (x.tried !== null) return `${x.area} · tried ${x.tried}`;
      if (x.id === REEL_ID) return `${x.area} · from ${state.reel.from}'s reel`;
      if (x.want.length === 0) return `${x.area} · nobody yet`;
      return x.want.length === 1 ? `${x.area} · 1 in` : `${x.area} · ${x.want.length} want in`;
    };

    const row = (x: Spot, top: boolean) => {
      const canRate = x.tried !== null && here && !x.ratings.some((r) => r.u === me);
      const rated = x.tried !== null && !canRate;
      const avg = avgOf(x);
      const hasStars = x.ratings.length + x.past.length > 0;
      const h = canRate ? rowBase + 8 : rowBase;

      return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: h, borderTop: top ? undefined : `1px solid ${c.divider}` }}>
          <Thumb kind={thumbKind(x.name)} seed={x.name} size={thumb} label="" />
          {canRate ? (
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, height: 20 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</div>
                {hasStars ? (
                  <div style={{ flex: "none", fontSize: 17, fontWeight: 600, lineHeight: "20px" }}>{avg.toFixed(1)}</div>
                ) : (
                  <div style={{ flex: "none", fontSize: 13, color: c.secondaryText }}>New</div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", height: 36 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    class="m-hit"
                    aria-label={`Rate ${n} stars`}
                    onClick={() => dispatch({ t: "rate", spot: x.id, stars: n })}
                    style={{ position: "relative", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "none" }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill={c.track}>
                      <path d={STAR} />
                    </svg>
                  </button>
                ))}
                <span style={{ marginLeft: 2, fontSize: 12, color: c.secondaryText, whiteSpace: "nowrap" }}>Rate it</span>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 0 }}>
              <div style={{ fontSize: 15, lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</div>
              <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub(x)}</div>
            </div>
          )}
          {x.tried === null ? (
            <button
              type="button"
              aria-label={x.want.includes(me) ? "Not for me" : "I want in"}
              onClick={() => dispatch({ t: "want", spot: x.id })}
              style={{ position: "relative", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none" }}
            >
              {x.want.length === 0 ? <Chip>Want in</Chip> : <Facepile users={x.want} max={3} size={26} />}
            </button>
          ) : rated ? (
            <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {hasStars ? (
                  <>
                    <Stars value={avg} size={14} />
                    <span style={{ fontSize: 17, fontWeight: 600, lineHeight: "20px" }}>{avg.toFixed(1)}</span>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: c.secondaryText }}>New</span>
                )}
              </div>
              {x.ratings.length > 0 ? <Facepile users={x.ratings.map((r) => r.u)} max={3} size={18} /> : null}
            </div>
          ) : null}
        </div>
      );
    };

    const listRow = (x: Spot) => {
      const top = state.spots[0]?.id === x.id;
      if (x.id !== REEL_ID) return <div key={x.id}>{row(x, top)}</div>;
      return (
        <Changed key={x.id} at={state.added?.at ?? 0} ms={1400} radius={12}>
          <div style={{ height: reelH, overflow: "hidden" }}>{row(x, top)}</div>
        </Changed>
      );
    };

    return (
      <div role="region" aria-label="Our to-try list" style={{ position: "relative", display: "flex", flexDirection: "column" }}>
        {k !== null && state.added ? (
          <div
            style={{
              position: "absolute",
              left: (W / 2) * (1 - k) + (12 + thumb / 2) * k,
              top: (reelBox / 2) * (1 - k) + (reelBox + (compact ? 80 : 88) + rowBase / 2) * k - Math.sin(k * Math.PI) * 60,
              zIndex: 5,
              pointerEvents: "none",
              transform: "translate(-50%, -50%)",
            }}
          >
            <Thumb kind="ramen" seed={state.reel.place} size={60 + (thumb - 60) * k} label="" />
          </div>
        ) : null}

        <div style={{ position: "relative", height: reelBox, borderRadius: theme.radius.card, overflow: "hidden", background: p.brown }}>
          <Canvas
            height={reelBox}
            label={`Reel from ${state.reel.account}: ${state.reel.caption || state.reel.place}`}
            draw={(g, { now, width, height }) => {
              const pp = pal(theme);
              // compact draws the same picture at 0.42 scale, right of centre, above the caption bar
              const sc = compact ? 0.42 : 1;
              const Wd = width / sc;
              const H = height / sc;
              const cx = compact ? Wd * 0.62 : Wd / 2 - 10;
              const cy = compact ? 98 : 128;
              g.scale(sc, sc);
              g.clearRect(0, 0, Wd, H);
              g.fillStyle = pp.brown;
              g.fillRect(0, 0, Wd, H);

              g.strokeStyle = pp.dark;
              g.lineWidth = 1.5;
              g.globalAlpha = 0.5;
              for (let i = 0; i < 8; i++) {
                const y = 10 + i * 32;
                g.beginPath();
                g.moveTo(0, y);
                g.lineTo(Wd, y + 6);
                g.stroke();
              }
              g.globalAlpha = 1;

              g.fillStyle = pp.dark;
              g.globalAlpha = 0.3;
              g.beginPath();
              g.arc(cx, cy + 8, 98, 0, Math.PI * 2);
              g.fill();
              g.globalAlpha = 1;

              g.fillStyle = pp.dark;
              g.beginPath();
              g.arc(cx, cy, 92, 0, Math.PI * 2);
              g.fill();

              g.strokeStyle = pp.red;
              g.lineWidth = 3;
              g.beginPath();
              g.arc(cx, cy, 86, 0, Math.PI * 2);
              g.stroke();

              g.fillStyle = pp.crust;
              g.beginPath();
              g.arc(cx, cy, 72, 0, Math.PI * 2);
              g.fill();

              g.strokeStyle = pp.cream;
              g.lineWidth = 4;
              g.lineCap = "round";
              for (let i = 0; i < 7; i++) {
                const r = 92 * (0.12 + i * 0.07);
                const a = i * 0.7;
                g.beginPath();
                g.arc(cx - 10, cy + 6, r, a, a + 4.2);
                g.stroke();
              }

              const chashu = (dx: number, dy: number, r: number, inner: number) => {
                g.fillStyle = pp.orange;
                g.beginPath();
                g.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
                g.fill();
                g.strokeStyle = pp.wall;
                g.lineWidth = 2;
                g.beginPath();
                g.arc(cx + dx, cy + dy, inner, 0, Math.PI * 2);
                g.stroke();
              };
              chashu(36, 22, 22, 16);
              chashu(48, -6, 20, 14);

              const egg = (dx: number, dy: number) => {
                g.fillStyle = pp.paper;
                g.beginPath();
                g.ellipse(cx + dx, cy + dy, 17, 13, 0, 0, Math.PI * 2);
                g.fill();
                g.fillStyle = pp.orange;
                g.beginPath();
                g.ellipse(cx + dx + 1, cy + dy + 1, 9, 7, 0, 0, Math.PI * 2);
                g.fill();
              };
              egg(-40, -30);
              egg(-14, -46);

              const nori = (dx: number, dy: number, w: number, hh: number) => {
                g.fillStyle = pp.leaf;
                g.beginPath();
                g.moveTo(cx + dx + 2, cy + dy);
                g.lineTo(cx + dx + w - 2, cy + dy);
                g.arcTo(cx + dx + w, cy + dy, cx + dx + w, cy + dy + 2, 2);
                g.lineTo(cx + dx + w, cy + dy + hh - 2);
                g.arcTo(cx + dx + w, cy + dy + hh, cx + dx + w - 2, cy + dy + hh, 2);
                g.lineTo(cx + dx + 2, cy + dy + hh);
                g.arcTo(cx + dx, cy + dy + hh, cx + dx, cy + dy + hh - 2, 2);
                g.lineTo(cx + dx, cy + dy + 2);
                g.arcTo(cx + dx, cy + dy, cx + dx + 2, cy + dy, 2);
                g.closePath();
                g.fill();
              };
              nori(-70, -10, 26, 52);
              nori(-56, -2, 22, 46);

              g.fillStyle = pp.green;
              for (let i = 0; i < 12; i++) {
                const x = cx + Math.cos(2.4 * i) * (12 + 2.5 * i);
                const y = cy + Math.sin(2.4 * i) * (10 + 2 * i);
                g.beginPath();
                g.arc(x, y, 3, 0, Math.PI * 2);
                g.fill();
              }

              const lift = (Math.sin((now / 1000) * 0.9) * 0.5 + 0.5) * 34;
              const tx = cx + 16;
              const ty = cy - 20 - lift;
              g.strokeStyle = pp.crust;
              g.lineWidth = 5;
              g.lineCap = "round";
              for (const d of [0, 7]) {
                g.beginPath();
                g.moveTo(tx + d, ty);
                g.lineTo(tx + 110 + d, ty - 110);
                g.stroke();
              }

              g.strokeStyle = pp.cream;
              g.lineWidth = 3;
              for (let n = 0; n < 5; n++) {
                g.beginPath();
                for (let i = 0; i <= 10; i++) {
                  const u = i / 10;
                  const x = tx + Math.sin(u * 6 + (now / 1000) * 3 + n) * 3;
                  const y = ty + u * (lift + 18);
                  if (i === 0) g.moveTo(x, y);
                  else g.lineTo(x, y);
                }
                g.stroke();
              }

              g.strokeStyle = pp.on;
              g.globalAlpha = 0.5;
              g.lineWidth = 2.5;
              for (let n = 0; n < 3; n++) {
                const ox = cx + (n % 2 === 0 ? -30 : 30) + (n === 2 ? -12 : 0);
                const oy = cy - 62 - n * 7;
                g.beginPath();
                for (let i = 0; i <= 12; i++) {
                  const u = i / 12;
                  const x = ox + Math.sin(u * 6 + now / 1000 + n) * 4;
                  const y = oy - u * 46;
                  if (i === 0) g.moveTo(x, y);
                  else g.lineTo(x, y);
                }
                g.stroke();
              }
              g.globalAlpha = 1;

              g.fillStyle = pp.dark;
              for (let i = 0; i < 8; i++) {
                g.globalAlpha = i / 7;
                g.fillRect(0, H - 101 + i * 5, Wd, 5);
              }
              g.globalAlpha = 1;

              g.fillStyle = pp.on;
              g.globalAlpha = 0.3;
              g.fillRect(0, H - 3, Wd, 3);
              g.globalAlpha = 1;
              g.fillRect(0, H - 3, Wd * ((now / 9000) % 1), 3);
              return true;
            }}
          />

          <div style={{ position: "absolute", left: 12, top: 14, height: 30, maxWidth: "70%", display: "flex", alignItems: "center", gap: 6, padding: "0 10px 0 4px", borderRadius: 15, background: p.dark }}>
            {fromMember ? <Avatar user={fromMember} size={22} /> : null}
            <span style={{ minWidth: 0, fontSize: 13, color: p.on, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {state.reel.from}: {state.reel.note}
            </span>
          </div>

          <div style={{ position: "absolute", right: 10, top: compact ? 8 : 56, width: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: p.dark, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill={p.on}>
                <path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.8-8 11-8 11z" />
              </svg>
            </div>
            <span style={{ background: p.dark, color: p.on, fontSize: 12, fontWeight: 600, lineHeight: "16px", padding: "1px 6px", borderRadius: 99 }}>{state.reel.likes}</span>
          </div>

          <div style={{ position: "absolute", left: 0, right: 0, bottom: 3, height: compact ? 28 : 58, background: p.dark, padding: compact ? "4px 12px" : "6px 12px", overflow: "hidden" }}>
            {compact ? null : <div style={{ height: 24, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ flex: "none", width: 24, height: 24, borderRadius: 12, background: mix(p.orange, p.cream, 0.45), color: p.dark, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {state.reel.account.slice(0, 2)}
              </span>
              <span style={{ minWidth: 0, fontSize: 13, color: p.on, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.reel.account} · Follow</span>
            </div>}
            <div style={{ height: 20, fontSize: 14, lineHeight: "20px", color: p.on, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.reel.caption || state.reel.place}</div>
          </div>
        </div>

        <div style={{ height: 40, marginTop: 8, display: "flex" }}>
          {state.added ? (
            <div style={{ flex: 1, height: 40, borderRadius: 8, background: c.secondaryButton, color: c.text, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15, fontWeight: 600 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke={c.positive} stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 12l5 5L20 6" />
              </svg>
              On the list
            </div>
          ) : (
            <Button
              kind="primary"
              wide
              onClick={() => {
                dispatch({ t: "add" });
                haptic("success");
              }}
            >
              Add spot
            </Button>
          )}
        </div>

        <div style={{ height: compact ? 24 : 28, marginTop: compact ? 8 : 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke={c.primary} stroke-width="3">
              <circle cx="8" cy="8" r="6" />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Our to-try list</span>
          </div>
          <span style={{ flex: "none", fontSize: 13, color: c.secondaryText }}>{`${state.spots.length} ${state.spots.length === 1 ? "spot" : "spots"} · ${tried} tried`}</span>
        </div>

        <div style={{ background: c.wash, borderRadius: 12, padding: "0 12px" }}>
          {state.spots.length === 0 ? (
            <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: c.secondaryText }}>Nothing on the list yet</div>
          ) : (
            shown.map(listRow)
          )}

          {state.spots.length > SHOWN ? (
            <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, borderTop: `1px solid ${c.divider}` }}>
              {local.all ? null : <span style={{ fontSize: 13, color: c.secondaryText }}>{`${state.spots.length - SHOWN} more`}</span>}
              <Button kind="deemphasized" onClick={() => setLocal({ all: !local.all })}>
                {local.all ? "Show less" : "Show all"}
              </Button>
            </div>
          ) : null}

          {showFooter ? (
            <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: c.secondaryText, textAlign: "center" }}>After you go, Muse asks everyone for stars</div>
          ) : null}
        </div>
      </div>
    );
  },
});
