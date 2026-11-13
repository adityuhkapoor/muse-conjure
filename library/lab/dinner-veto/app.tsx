import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  Changed,
  Facepile,
  Locked,
  Thumb,
  Toast,
  path,
  rng,
  running,
  thumbKind,
  tween,
  type Ctx,
  type Meta,
} from "@muse/app";

// Dinner veto: a handful of nearby places, and everyone strikes one (or passes). The last place
// standing is where the group eats; if everyone has had their say and several are left, the seed
// picks one of them.

type Params = {
  title: string;
  time: string;
  leaveBy: string;
  spots: { name: string; kind: string; price?: string; miles?: number; stars?: number }[];
  vetoes: { name: string; spot: number; why: string }[];
  passed: string[];
};

// @params
const P: Params = {
  title: "Dinner for 6",
  time: "7:30",
  leaveBy: "7:15",
  spots: [
    { name: "Sakura Ramen", kind: "ramen", price: "$$", miles: 0.3, stars: 4.6 },
    { name: "Lucia's Trattoria", kind: "pasta", price: "$$$", miles: 0.8, stars: 4.7 },
    { name: "El Toro Taqueria", kind: "tacos", price: "$", miles: 0.5, stars: 4.5 },
    { name: "Golden Dumpling", kind: "dim sum", price: "$$", miles: 0.6, stars: 4.4 },
    { name: "Smoke & Barrel", kind: "bbq", price: "$$", miles: 1.2, stars: 4.5 },
    { name: "Basil Thai", kind: "thai", price: "$", miles: 0.4, stars: 4.3 },
  ],
  vetoes: [
    { name: "Maya", spot: 0, why: "had it tues" },
    { name: "Jess", spot: 1, why: "$$$ this week?" },
    { name: "Sam", spot: 4, why: "1.2 mi in the rain??" },
  ],
  passed: ["Rae"],
};
// @end params

type Veto = { user: string; why: string; at: number };
/** dist: tenths of a mile (3 -> "0.3 mi"); stars: tenths (46 -> "4.6"). */
type Spot = { id: string; name: string; kind: string; price: string; dist: number; stars: number; veto: Veto | null };
/** winner: spot id once decided, else null. decidedAt: meta.time, 0 while open. tie: picked by seed among several left. */
type State = { title: string; time: string; leaveBy: string; spots: Spot[]; passed: string[]; winner: string | null; decidedAt: number; tie: boolean; booked: string | null };
type Action = { t: "veto"; spot: string; why: string } | { t: "pass" } | { t: "decide" } | { t: "book" };
type Local = { sel: string | null; why: string };

const MAX_SPOTS = 6;
const clean = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/!/g, "").replace(/\s+/g, " ").trim().slice(0, n) : "");
const standing = (s: State) => s.spots.filter((x) => !x.veto);
const used = (s: State, u: string) => s.spots.some((x) => x.veto?.user === u) || s.passed.includes(u);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : 0)));

/** Decide when one place is left, or when everyone in the chat has had their say. */
function settle(s: State, meta: Meta, ctx: Ctx): State {
  const left = standing(s);
  if (left.length === 1) return { ...s, winner: left[0]!.id, decidedAt: meta.time, tie: false };
  if (ctx.members.every((m) => used(s, m.id))) return { ...s, winner: rng(meta.seed).pick(left).id, decidedAt: meta.time, tie: true };
  return s;
}

const TICK = "M2.5 6.2 L5 8.7 L9.5 3.5";
const tick = (size: number, color: string) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
    {path(TICK, "none", { stroke: color, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" })}
  </svg>
);

export default defineApp<State, Action, Local>({
  name: "Dinner veto",
  summary: (s, ctx) => {
    if (s.spots.length < 2) return "Dinner: no places yet";
    const left = standing(s);
    if (s.winner !== null) {
      const w = s.spots.find((x) => x.id === s.winner)!;
      return s.booked !== null ? `${s.title}: ${w.name}, table held` : `${s.title}: ${w.name} it is`;
    }
    return `${s.title}: ${left.length} places left, ${s.spots.length - left.length} of ${ctx.members.length} vetoed`;
  },

  init: (ctx) => {
    const spots: Spot[] = P.spots.slice(0, MAX_SPOTS).map((x, i) => ({
      id: `s${i}`,
      name: clean(x.name, 32),
      kind: clean(x.kind, 16),
      price: /^\${1,4}$/.test(x.price ?? "") ? x.price! : "",
      dist: clamp((x.miles ?? 0) * 10, 0, 999),
      stars: clamp((x.stars ?? 0) * 10, 0, 50),
      veto: null,
    }));
    const who = (name: string) => {
      const want = name.trim().toLowerCase();
      return ctx.members.find((m) => m.id === name || m.name.toLowerCase() === want)?.id;
    };
    const base: State = { title: clean(P.title, 40) || "Dinner", time: clean(P.time, 12), leaveBy: clean(P.leaveBy, 12), spots, passed: [], winner: null, decidedAt: 0, tie: false, booked: null };
    let s = base;
    for (const v of P.vetoes) {
      const u = who(v.name);
      const spot = s.spots[v.spot];
      if (!u || !spot || spot.veto || used(s, u) || standing(s).length <= 1) continue;
      s = { ...s, spots: s.spots.map((x) => (x.id === spot.id ? { ...x, veto: { user: u, why: clean(v.why, 40), at: 0 } } : x)) };
    }
    const passed: string[] = [];
    for (const name of P.passed) {
      const u = who(name);
      if (u && !used(s, u) && !passed.includes(u)) passed.push(u);
    }
    return { ...s, passed };
  },

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "book") return s.winner !== null && s.booked === null ? { ...s, booked: meta.user } : s;
    if (s.winner !== null) return s;
    if (a.t === "veto") {
      if (used(s, meta.user) || typeof a.why !== "string" || typeof a.spot !== "string") return s;
      const spot = s.spots.find((x) => x.id === a.spot);
      if (!spot || spot.veto || standing(s).length <= 1) return s;
      const veto: Veto = { user: meta.user, why: clean(a.why, 40), at: meta.time };
      return settle({ ...s, spots: s.spots.map((x) => (x.id === spot.id ? { ...x, veto } : x)) }, meta, ctx);
    }
    if (a.t === "pass") {
      if (used(s, meta.user)) return s;
      return settle({ ...s, passed: [...s.passed, meta.user] }, meta, ctx);
    }
    if (a.t === "decide") {
      if (!s.spots.some((x) => x.veto)) return s;
      const left = standing(s);
      return { ...s, winner: left.length === 1 ? left[0]!.id : rng(meta.seed).pick(left).id, decidedAt: meta.time, tie: left.length > 1 };
    }
    return s;
  },

  onMembers: (s, ctx) => (s.passed.every((u) => inChat(ctx, u)) ? s : { ...s, passed: s.passed.filter((u) => inChat(ctx, u)) }),

  invariants: {
    "one veto or pass per person": (s) => {
      const v = s.spots.filter((x) => x.veto).map((x) => x.veto!.user);
      return new Set(v).size === v.length && new Set(s.passed).size === s.passed.length && !s.passed.some((u) => v.includes(u));
    },
    "at least one place stands": (s) => s.spots.length === 0 || standing(s).length >= 1,
    "the winner is still standing": (s) => s.winner === null || standing(s).some((x) => x.id === s.winner),
    "decided exactly when timed": (s) => (s.winner === null) === (s.decidedAt === 0),
    "a sole survivor wins without a flip": (s) => s.winner === null || standing(s).length > 1 || !s.tie,
    "only a decided dinner gets booked": (s) => s.booked === null || s.winner !== null,
    "spots are well formed": (s) =>
      new Set(s.spots.map((x) => x.id)).size === s.spots.length &&
      s.spots.length <= MAX_SPOTS &&
      s.spots.every((x) => Number.isInteger(x.dist) && x.dist >= 0 && x.dist <= 999 && Number.isInteger(x.stars) && x.stars >= 0 && x.stars <= 50),
  },

  transitions: {
    "a veto strikes one standing place for the actor": (p, n, a, m) => {
      if (a.t !== "veto" || p === n) return true;
      const changed = n.spots.filter((x, i) => JSON.stringify(x) !== JSON.stringify(p.spots[i]));
      const c = changed[0];
      return changed.length === 1 && c!.id === a.spot && p.spots.find((x) => x.id === a.spot)?.veto === null && c!.veto?.user === m.user && c!.veto.at === m.time && !used(p, m.user);
    },
    "a pass adds only the actor": (p, n, a, m) => a.t !== "pass" || p === n || (n.passed.length === p.passed.length + 1 && n.passed.at(-1) === m.user),
    "the last place standing wins at once": (p, n, _a, m) => p.winner !== null || standing(n).length !== 1 || (n.winner === standing(n)[0]!.id && n.decidedAt === m.time),
    "a decision is final": (p, n) => p.winner === null || (n.winner === p.winner && n.decidedAt === p.decidedAt && JSON.stringify(n.spots) === JSON.stringify(p.spots)),
    "only people in the chat act": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a decision stamps the time and picks by seed": (p, n, a, m) =>
      a.t !== "decide" || p === n || (p.winner === null && p.spots.some((x) => x.veto) && n.winner === rng(m.seed).pick(standing(p)).id && n.decidedAt === m.time && n.tie === (standing(p).length > 1) && JSON.stringify(n.spots) === JSON.stringify(p.spots) && n.passed.length === p.passed.length),
    "booking changes only who booked": (p, n, a, m) =>
      a.t !== "book" || p === n || (p.winner !== null && p.booked === null && n.booked === m.user && n.winner === p.winner && JSON.stringify(n.spots) === JSON.stringify(p.spots)),
    "booking is once": (p, n) => p.booked === null || n.booked === p.booked,
    "a seed pick is among the standing": (p, n) => p.winner !== null || n.winner === null || standing(p).some((x) => x.id === n.winner),
  },

  arbitrary: (s, user, r) => {
    if (s.winner !== null) return s.booked === null ? { t: "book" } : null;
    const k = r.next();
    const left = standing(s);
    if (!used(s, user)) {
      if (k < 0.7) return { t: "veto", spot: r.pick(left).id, why: r.pick(["meh", "had it yesterday", "too far", ""]) };
      if (k < 0.9) return { t: "pass" };
      return { t: "decide" };
    }
    if (k < 0.6) return { t: "decide" };
    return { t: "veto", spot: r.pick(left).id, why: "" };
  },

  local: { sel: null, why: "" },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const M = members.length;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    if (state.spots.length < 2) {
      return (
        <div>
          <CardHeader title={state.time ? `${state.title} · ${state.time}` : state.title} />
          <div style={{ fontSize: 15, color: c.secondaryText, padding: "8px 0" }}>Need at least 2 places to veto</div>
        </div>
      );
    }

    const decided = confirmed.winner !== null;
    const win = decided ? confirmed.spots.find((x) => x.id === confirmed.winner)! : null;
    const left = standing(state);
    const mine = used(state, me);
    const waiting = members.filter((m) => !used(state, m.id)).length;
    const vetoers = state.spots.filter((x) => x.veto).map((x) => x.veto!.user);
    const heard = [...vetoers, ...state.passed.filter((u) => !vetoers.includes(u))];
    const sel = !mine && !decided && local.sel !== null && left.length > 1 && left.some((x) => x.id === local.sel) ? local.sel : null;
    const anim = decided ? running(confirmed.decidedAt, 1200) : null;
    const pop = anim === null ? 1 : tween({ duration: 300, easing: [0.34, 1.56, 0.64, 1] })(Math.min(anim, 300));
    const dim = c.secondaryText;

    const subtitle = decided ? `Decided · ${M} of ${M} in` : mine ? `Waiting on ${waiting}` : "1 veto each · last one standing wins";

    const row = (sp: Spot, i: number) => {
      const isWin = decided && confirmed.winner === sp.id;
      const struck = sp.veto !== null;
      const tappable = !mine && !decided && !struck && left.length > 1;
      const picked = sel === sp.id;
      const line2 = struck
        ? sp.veto!.why
          ? `${nameOf(sp.veto!.user)}: “${sp.veto!.why}”`
          : `${nameOf(sp.veto!.user)} vetoed`
        : isWin
          ? confirmed.tie
            ? `Picked from ${confirmed.spots.filter((x) => !x.veto).length} left`
            : "Last one standing"
          : [sp.kind, sp.price, sp.dist > 0 ? `${(sp.dist / 10).toFixed(1)} mi` : "", sp.stars > 0 ? (sp.stars / 10).toFixed(1) : ""].filter(Boolean).join(" · ") || "Still in";
      const style = {
        position: "relative" as const,
        display: "grid",
        gridTemplateColumns: "48px 1fr auto",
        alignItems: "center",
        width: "100%",
        height: 46,
        padding: 0,
        border: "none",
        borderRadius: 8,
        font: "inherit",
        color: c.text,
        textAlign: "left" as const,
        cursor: tappable ? "pointer" : "default",
        background: isWin ? c.selected : picked ? c.selected : "transparent",
        transition: "background 300ms",
      };
      const inner = (
        <>
          <span style={{ display: "grid", placeItems: "center", justifySelf: "center", width: 36, height: 36, borderRadius: 18, background: c.wash, overflow: "hidden", opacity: struck ? 0.5 : 1 }}>
            <Thumb kind={thumbKind(`${sp.kind} ${sp.name}`, "storefront")} seed={sp.name} size={36} label="" />
          </span>
          <span style={{ display: "block", minWidth: 0, paddingRight: 8 }}>
            <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere", fontSize: 15, fontWeight: 600, lineHeight: "20px", color: struck ? dim : c.text, textDecoration: struck ? "line-through" : "none", overflow: "hidden" }}>{sp.name}</span>
            <span style={{ display: "block", fontSize: 13, lineHeight: "16px", color: isWin ? c.link : dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line2}</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, maxWidth: 96, paddingRight: 6 }}>
            {struck ? (
              <>
                <span style={{ fontSize: 13, color: dim }}>Vetoed</span>
                <Avatar user={sp.veto!.user} size={22} />
              </>
            ) : isWin ? (
              <span style={{ display: "grid", placeItems: "center", width: 20, height: 20, borderRadius: 10, background: c.primary, transform: `scale(${pop})` }}>{tick(12, c.onPrimary)}</span>
            ) : tappable ? (
              <span style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: 9, boxSizing: "border-box", background: picked ? c.primary : "transparent", border: picked ? "none" : `1.5px solid ${c.divider}` }}>{picked ? tick(10, c.onPrimary) : null}</span>
            ) : mine && !decided ? (
              <span style={{ fontSize: 13, color: dim }}>Still in</span>
            ) : null}
          </span>
          {i < state.spots.length - 1 ? <span aria-hidden="true" style={{ position: "absolute", left: 52, right: 0, bottom: 0, height: 1, background: c.divider }} /> : null}
          {isWin && anim !== null ? <Burst key={confirmed.decidedAt} emoji="❤️" /> : null}
        </>
      );
      const flash = confirmed.spots.find((x) => x.id === sp.id)?.veto;
      const body = tappable ? (
        <button key={sp.id} aria-label={`Veto ${sp.name}`} aria-pressed={picked} style={style} onClick={() => setLocal({ sel: picked ? null : sp.id })}>
          {inner}
        </button>
      ) : (
        <div key={sp.id} style={style}>
          {inner}
        </div>
      );
      return flash && flash.at > 0 && running(flash.at, 600) !== null ? (
        <Changed key={sp.id} at={flash.at} ms={600} radius={8}>
          {body}
        </Changed>
      ) : (
        body
      );
    };

    const passers = state.passed.map((u) => nameOf(u));
    const openLine = `${vetoers.length} of ${M} vetoed${passers.length === 0 ? "" : passers.length > 2 ? ` · ${passers.length} passed` : ` · ${passers.join(", ")} passed`}`;
    const status = decided ? (
      <span style={{ fontWeight: 600, color: c.text }}>{`${win!.name} it is.${confirmed.leaveBy ? ` Leave by ${confirmed.leaveBy}.` : ""}`}</span>
    ) : (
      openLine
    );

    return (
      <div>
        <CardHeader title={state.time ? `${state.title} · ${state.time}` : state.title} subtitle={subtitle} />
        <div>{state.spots.map(row)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 28 }}>
          {heard.length > 0 ? <Facepile users={heard} size={20} max={5} /> : null}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{status}</span>
        </div>
        {decided ? (
          confirmed.booked === null ? (
            <Button kind="primary" wide onClick={() => dispatch({ t: "book" })}>
              Book table
            </Button>
          ) : (
            <Locked detail={confirmed.time ? `${confirmed.time} PM · ${M} people` : `${M} people`}>Table held</Locked>
          )
        ) : sel ? (
          <Button
            kind="primary"
            wide
            onClick={() => {
              dispatch({ t: "veto", spot: sel, why: local.why });
              setLocal({ sel: null, why: "" });
            }}
          >
            Veto
          </Button>
        ) : !mine ? (
          <Button kind="secondary" wide onClick={() => dispatch({ t: "pass" })}>
            Pass
          </Button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 12px", borderRadius: 8, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 15, fontWeight: 600 }}>
            <span style={{ flex: 1 }}>{`Waiting on ${waiting}`}</span>
            {waiting >= 1 && vetoers.length > 0 ? (
              <Button kind="deemphasized" onClick={() => dispatch({ t: "decide" })}>
                Decide
              </Button>
            ) : null}
          </div>
        )}
        {decided && anim !== null ? <Toast key={confirmed.decidedAt}>It's a plan.</Toast> : null}
      </div>
    );
  },
});
