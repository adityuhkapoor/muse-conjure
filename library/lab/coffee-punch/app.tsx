import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  Toast,
  haptic,
  mix,
  pal,
  running,
  spring,
  springs,
  tween,
  type Child,
  type Ctx,
  type Meta,
} from "@muse/app";

// Coffee punch cards: whose turn it is to buy the round. Every friend has a café punch card, and the
// cards are stacked one per round they bought this month, so the stacks are the tally. The
// thinnest stack is up next: its card is pulled out in front with the round's order on it. Tap
// "Buying" and a stamp thunks onto your card.

type Params = {
  /** The café: "Kettle & Crumb" */
  place: string;
  /** What the run is called: "fenwick grind" */
  run: string;
  /** Everyone on the run, with the rounds they bought this month (0 to 9) */
  people: { who: string; rounds: number }[];
  /** The order for this round, one drink per line */
  order: string[];
  /** The running joke: who keeps saying it and how many times */
  joke: { who: string; line: string; times: number };
};

// @params
const P: Params = {
  place: "Kettle & Crumb",
  run: "fenwick grind",
  people: [
    { who: "Maya", rounds: 7 },
    { who: "Will", rounds: 4 },
    { who: "Tsai Lin", rounds: 3 },
    { who: "Arun", rounds: 3 },
    { who: "Aditya", rounds: 2 },
    { who: "Calvin", rounds: 1 },
  ],
  order: ["2 oat lattes", "1 cold brew", "Arun's chai"],
  joke: { who: "Calvin", line: "i'll get the next one", times: 4 },
};
// @end params

type Person = { id: string; name: string; base: number };
type Round = { by: string; at: number };
type State = {
  place: string;
  run: string;
  people: Person[];
  rounds: Round[];
  order: string[];
  joke: { who: string; line: string; times: number };
  nudges: { to: string; from: string; at: number }[];
};
type Action = { t: "buy" } | { t: "undo" } | { t: "nudge"; who: string };
type Local = { toast: number };

const SLOTS = 10;
const MAXP = 8;
const NUDGE_GAP = 60_000;
const THUNK = spring(springs.iosBouncy);
const DROP = tween({ duration: 450, easing: "decelerate" });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const stamps = (s: State, id: string) => (s.people.find((p) => p.id === id)?.base ?? 0) + s.rounds.filter((r) => r.by === id).length;
/** Up next: the fewest stamps; ties go to whoever is listed first. */
const nextUp = (s: State) => s.people.reduce<Person | null>((b, p) => (b === null || stamps(s, p.id) < stamps(s, b.id) ? p : b), null);

function initState(ctx: Ctx): State {
  const people: Person[] = [];
  for (const raw of Array.isArray(P.people) ? P.people : []) {
    if (people.length >= MAXP) break;
    const name = clean(raw?.who, 20);
    if (!name) continue;
    const m = ctx.members.find((x) => x.id === name || same(x.name, name));
    const id = m ? m.id : name;
    if (people.some((p) => p.id === id)) continue;
    const base = Number.isInteger(raw.rounds) ? Math.max(0, Math.min(SLOTS - 1, raw.rounds)) : 0;
    people.push({ id, name: m ? clean(m.name, 20) || name : name, base });
  }
  for (const m of ctx.members) {
    if (people.length >= MAXP) break;
    if (!people.some((p) => p.id === m.id)) people.push({ id: m.id, name: clean(m.name, 20) || "Friend", base: 0 });
  }
  const order = (Array.isArray(P.order) ? P.order : []).map((o) => clean(o, 24)).filter(Boolean).slice(0, 4);
  return {
    place: clean(P.place, 24) || "the café",
    run: clean(P.run, 24) || "coffee run",
    people,
    rounds: [],
    order: order.length ? order : ["the usual"],
    joke: { who: clean(P.joke?.who, 20), line: clean(P.joke?.line, 32), times: Number.isInteger(P.joke?.times) ? Math.max(0, Math.min(9, P.joke.times)) : 0 },
    nudges: [],
  };
}

function reduceCoffee(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;
  const u = meta.user;
  if (a.t === "buy") {
    if (!s.people.some((p) => p.id === u) || stamps(s, u) >= SLOTS) return s;
    return { ...s, rounds: [...s.rounds, { by: u, at: meta.time }], nudges: s.nudges.filter((x) => x.to !== u) };
  }
  if (a.t === "undo") {
    const last = s.rounds[s.rounds.length - 1];
    if (!last || last.by !== u) return s;
    return { ...s, rounds: s.rounds.slice(0, -1) };
  }
  if (a.t === "nudge") {
    const who = a.who;
    if (typeof who !== "string" || who === u || !s.people.some((p) => p.id === who)) return s;
    if (s.nudges.some((x) => x.to === who && meta.time - x.at < NUDGE_GAP)) return s;
    return { ...s, nudges: [...s.nudges.filter((x) => x.to !== who), { to: who, from: u, at: meta.time }] };
  }
  return s;
}

/** A tiny cup, drawn at (x, y), r is the stamp's radius. */
function Cup(p: { x: number; y: number; r: number; ink: string; k?: number }) {
  const s = (p.r / 11) * (p.k ?? 1);
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${s}) rotate(-8)`}>
      <path d="M-6 -4 H6 L4.5 6 Q4 7.5 2.5 7.5 H-2.5 Q-4 7.5 -4.5 6 Z" fill={p.ink} />
      <path d="M6 -2 Q10 -2 9 2 Q8 4.5 5 4" fill="none" stroke={p.ink} stroke-width={1.6} />
      <path d="M-2 -7 Q-3 -9 -1 -11 M2 -7 Q1 -9 3 -11" fill="none" stroke={p.ink} stroke-width={1.3} stroke-linecap="round" />
    </g>
  );
}

export default defineApp<State, Action, Local>({
  name: "Coffee punch cards",
  summary: (s) => {
    const n = nextUp(s);
    const last = s.rounds[s.rounds.length - 1];
    const by = last ? s.people.find((p) => p.id === last.by)?.name : null;
    if (by) return `${s.place}: ${by} bought a round · ${n?.name ?? "someone"} is up next`;
    return `${s.place}: ${n?.name ?? "someone"} is up next, ${n ? stamps(s, n.id) : 0} rounds this month`;
  },

  init: initState,
  reduce: (s, a, meta, ctx) => reduceCoffee(s, a as unknown as Record<string, unknown>, meta, ctx),

  onMembers: (s, ctx) => {
    let people = s.people;
    for (const m of ctx.members) {
      if (people.length >= MAXP) break;
      if (!people.some((p) => p.id === m.id)) people = [...people, { id: m.id, name: clean(m.name, 20) || "Friend", base: 0 }];
    }
    return people === s.people ? s : { ...s, people };
  },

  invariants: {
    "no card holds more than ten stamps": (s) => s.people.every((p) => stamps(s, p.id) >= 0 && stamps(s, p.id) <= SLOTS),
    "every round was bought by someone on the run": (s) => s.rounds.every((r) => s.people.some((p) => p.id === r.by)),
    "people are listed once, eight at most": (s) => new Set(s.people.map((p) => p.id)).size === s.people.length && s.people.length <= MAXP,
    "everyone in the chat has a card while there is room": (s, ctx) => s.people.length >= MAXP || ctx.members.every((m) => s.people.some((p) => p.id === m.id)),
    "nudges are one per person and never to yourself": (s) =>
      new Set(s.nudges.map((x) => x.to)).size === s.nudges.length && s.nudges.every((x) => x.to !== x.from && s.people.some((p) => p.id === x.to)),
    "someone is up next": (s) => s.people.length === 0 || nextUp(s) !== null,
  },

  transitions: {
    "buying stamps exactly your card once": (p, n, a, m) =>
      a.t !== "buy" || p === n || (n.rounds.length === p.rounds.length + 1 && n.rounds.at(-1)!.by === m.user && n.rounds.at(-1)!.at === m.time && stamps(n, m.user) === stamps(p, m.user) + 1),
    "a full card takes no stamp": (p, n, a, m) => a.t !== "buy" || stamps(p, m.user) < SLOTS || p === n,
    "undo only takes back your own latest round": (p, n, a, m) =>
      a.t !== "undo" || p === n || (p.rounds.at(-1)?.by === m.user && n.rounds.length === p.rounds.length - 1),
    "rounds only change by buying or undoing": (p, n, a) => a.t === "buy" || a.t === "undo" || n.rounds === p.rounds,
    "a nudge waits a minute": (p, n, a, m) =>
      a.t !== "nudge" || p === n || (!p.nudges.some((x) => x.to === a.who && m.time - x.at < NUDGE_GAP) && n.nudges.some((x) => x.to === a.who && x.from === m.user && x.at === m.time)),
    "buying clears your nudge": (p, n, a, m) => a.t !== "buy" || p === n || !n.nudges.some((x) => x.to === m.user),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (k < 0.55) return { t: "buy" };
    if (k < 0.75) return { t: "undo" };
    const others = s.people.filter((p) => p.id !== user);
    return others.length ? { t: "nudge", who: r.pick(others).id } : { t: "buy" };
  },

  local: { toast: 0 },

  view: ({ state, confirmed, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const pl = pal();
    const dark = theme.mode === "dark";
    const W = theme.width - 2 * theme.space.card;
    const up = nextUp(state);
    const onRun = state.people.some((p) => p.id === me);
    const last = confirmed.rounds[confirmed.rounds.length - 1];
    const lastMine = state.rounds[state.rounds.length - 1]?.by === me;
    const kraft = dark ? mix(pl.orange, c.card, 0.55) : mix(pl.orange, c.card, 0.78);
    const kraftEdge = dark ? mix(pl.orange, c.card, 0.35) : mix(pl.orange, c.card, 0.55);
    const ink = dark ? c.text : mix(pl.brown, c.text, 0.35);
    const cardInk = c.text;
    const noteInk = dark ? c.card : c.text;

    // ---- the stacks: one small card per round bought this month ----
    const n = Math.max(1, state.people.length);
    const col = W / n;
    const SH = 146;
    const base = 94;
    const most = Math.max(1, ...state.people.map((p) => stamps(state, p.id)));
    const step = Math.min(8, (base - 30) / most);
    const stacks: Child[] = [];
    const faces: Child[] = [];
    state.people.forEach((p, i) => {
      const cx = col * i + col / 2;
      const k = stamps(state, p.id);
      const isUp = up?.id === p.id;
      const cw = Math.min(46, col - 10);
      const fresh = last && last.by === p.id ? running(last.at, 450) : null;
      if (isUp) stacks.push(<ellipse key={`g${p.id}`} cx={cx} cy={base - 4} rx={cw * 0.75} ry={16} fill={c.primary} opacity={0.16} />);
      for (let j = 0; j < Math.max(1, k); j++) {
        const empty = k === 0;
        const topOne = j === k - 1;
        const drop = topOne && fresh !== null ? (1 - DROP(fresh)) * -40 : 0;
        const tilt = ((i * 7 + j * 13) % 9) - 4;
        stacks.push(
          <g key={`s${p.id}-${j}`} transform={`translate(${cx} ${base - 6 - j * step + drop}) rotate(${tilt * 0.6})`}>
            <rect x={-cw / 2} y={-8} width={cw} height={14} rx={3} fill={empty ? "none" : isUp ? kraft : mix(kraft, c.card, 0.25)} stroke={empty ? c.secondaryText : kraftEdge} stroke-width={1} stroke-dasharray={empty ? "3 3" : undefined} />
            {!empty ? <circle cx={cw / 2 - 7} cy={-1} r={3} fill={kraftEdge} /> : null}
          </g>,
        );
      }
      stacks.push(
        <text key={`n${p.id}`} x={cx} y={Math.max(13, base - 16 - Math.max(1, k) * step)} text-anchor="middle" font-size={13} font-weight={700} fill={isUp ? c.link : c.text} font-family={theme.type.family}>
          {String(k)}
        </text>,
      );
      faces.push(
        <div key={p.id} style={{ position: "absolute", left: col * i, width: col, top: base + 6, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Avatar user={{ id: p.id, name: p.name }} size={24} />
          <span style={{ maxWidth: col - 2, fontSize: 11, lineHeight: "14px", marginTop: 2, color: isUp ? c.text : c.secondaryText, fontWeight: isUp || p.id === me ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.id === me ? "You" : p.name}
          </span>
        </div>,
      );
    });

    // ---- the card up front: whoever is up next ----
    // Right after a round, the buyer's card stays up front so the stamp lands where you can see it.
    const justNow = last ? running(last.at, 1800) : null;
    const hero = justNow !== null ? state.people.find((p) => p.id === last!.by) ?? up : up;
    const hk = hero ? stamps(state, hero.id) : 0;
    const heroFresh = last && hero && last.by === hero.id ? running(last.at, 900) : null;
    const CH = 116;
    const gridW = Math.min(170, W * 0.5);
    const pr = Math.min(12, gridW / 12);
    const dots: Child[] = [];
    for (let j = 0; j < SLOTS; j++) {
      const x = 14 + pr + (j % 5) * ((gridW - 2 * pr) / 4);
      const y = 50 + Math.floor(j / 5) * (pr * 2 + 8);
      const filled = j < hk;
      const thunk = filled && j === hk - 1 && heroFresh !== null ? 1 + (1 - Math.min(1, THUNK(heroFresh))) * 1.4 : 1;
      dots.push(<circle key={`d${j}`} cx={x} cy={y} r={pr} fill={filled ? mix(kraft, c.card, 0.4) : "none"} stroke={kraftEdge} stroke-width={1.4} stroke-dasharray={filled ? undefined : "3 2"} />);
      if (filled) dots.push(<Cup key={`c${j}`} x={x} y={y} r={pr} ink={mix(pl.red, c.text, dark ? 0 : 0.2)} k={thunk} />);
    }
    const shake = heroFresh !== null ? Math.sin(heroFresh / 30) * 3 * (1 - heroFresh / 900) : 0;
    const noteX = gridW + 24;
    const noteW = W - noteX - 10;
    const jokeOn = state.joke.line && state.joke.times > 0;

    return (
      <div>
        <CardHeader title={`${state.place} run`} subtitle={`${state.run} · ${state.rounds.length + state.people.reduce((a, p) => a + p.base, 0)} rounds this month`} />
        <div style={{ position: "relative", height: SH }}>
          <svg width={W} height={SH} viewBox={`0 0 ${W} ${SH}`} role="img" aria-label={`Punch cards: ${state.people.map((p) => `${p.name} ${stamps(state, p.id)}`).join(", ")}`} style={{ display: "block", overflow: "visible" }}>
            {stacks}
          </svg>
          {faces}
        </div>
        {hero ? (
          <div style={{ position: "relative", height: CH, marginTop: 6, transform: `translateX(${shake}px) rotate(${shake * 0.15}deg)` }}>
            <svg width={W} height={CH} viewBox={`0 0 ${W} ${CH}`} role="img" aria-label={`${hero.name}'s card: ${hk} of ${SLOTS} stamps. Order: ${state.order.join(", ")}`} style={{ display: "block" }}>
              <rect x={1} y={1} width={W - 2} height={CH - 2} rx={14} fill={kraft} stroke={justNow !== null ? kraftEdge : c.primary} stroke-width={2} />
              <text x={14} y={24} font-size={15} font-weight={700} fill={cardInk} font-family={theme.type.family}>
                {`${hero.id === me ? "Your" : `${hero.name}'s`} card`}
              </text>
              <text x={14} y={34 + 2} font-size={11} fill={ink} font-family={theme.type.family}>
                {justNow !== null && hero?.id === last?.by ? `${hk} of ${SLOTS} · stamped` : `${hk} of ${SLOTS} · up next`}
              </text>
              {dots}
              <g transform={`translate(${noteX} 12) rotate(2)`}>
                <rect x={0} y={0} width={noteW} height={CH - 26} rx={4} fill={dark ? mix(pl.yellow, c.text, 0.55) : mix(pl.yellow, c.card, 0.6)} />
                <rect x={noteW / 2 - 16} y={-5} width={32} height={10} rx={2} fill={c.card} opacity={0.6} />
                <text x={10} y={22} font-size={12} font-weight={700} fill={noteInk} font-family={theme.type.family}>
                  The order
                </text>
                {state.order.map((o, j) => (
                  <text key={`o${j}`} x={10} y={42 + j * 17} font-size={13} fill={noteInk} font-family={theme.type.family}>
                    {o.length > Math.floor(noteW / 7.2) ? o.slice(0, Math.floor(noteW / 7.2) - 1) + "…" : o}
                  </text>
                ))}
              </g>
            </svg>
          </div>
        ) : null}
        <div style={{ marginTop: 8, minHeight: 16, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {last
            ? `${last.by === me ? "You" : state.people.find((p) => p.id === last.by)?.name} bought this round · ${up?.id === me ? "you're" : `${up?.name} is`} up next`
            : jokeOn
              ? `${state.joke.who}: "${state.joke.line}" ×${state.joke.times}`
              : `${hero?.name ?? "Someone"} is up next`}
        </div>
        <div style={{ marginTop: 8, height: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {!onRun ? (
            <span style={{ fontSize: 13, color: c.secondaryText }}>Only people on the run can buy</span>
          ) : lastMine ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`Stamped · ${stamps(state, me)} of ${SLOTS} on your card`}</span>
              <Button kind="deemphasized" onClick={() => dispatch({ t: "undo" })}>
                Undo
              </Button>
            </>
          ) : (
            <>
              <div style={{ flex: 1 }}>
                <Button
                  kind="primary"
                  wide
                  disabled={stamps(state, me) >= SLOTS}
                  onClick={() => {
                    dispatch({ t: "buy" });
                    haptic("medium");
                    setLocal({ toast: local.toast + 1 });
                  }}
                >
                  Buying
                </Button>
              </div>
              {hero && hero.id !== me ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "nudge", who: hero.id })}>
                  {state.nudges.some((x) => x.to === hero.id) ? "Nudged" : `Nudge ${hero.name.split(" ")[0]}`}
                </Button>
              ) : null}
            </>
          )}
        </div>
        {local.toast > 0 && lastMine ? <Toast key={local.toast}>{`Round's on you · ${state.order.length} drinks`}</Toast> : null}
      </div>
    );
  },
});
