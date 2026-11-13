import { defineApp, Avatar, Burst, Button, CardHeader, Locked, fitText, haptic, mix, pal, running, seedOf, spring, springs, tween, userColor, type Ctx, type Theme } from "@muse/app";

// Date deck: a hand of date-idea cards fanned on the table, each drawn with its own little
// picture, cost and time. Both of you tap the ones you'd do; your face goes on the corner and the
// card lifts out of the hand. The first card you both picked turns over into the plan for the day,
// with a reminder to book it.

type Params = {
  /** Card title: "Second date ideas" */
  title: string;
  /** Who has the date: "Calvin" */
  asker: string;
  /** Who's helping pick: "Maya" */
  helper: string;
  /** What the asker said */
  quote: string;
  /** The day of the date: "Saturday" */
  day: string;
  /** When to book by: "Thu" */
  bookBy: string;
  /** 3 to 6 idea cards */
  cards: { title: string; cost: string; time: string }[];
  /** Cards the asker already picked (titles) */
  askerPicks: string[];
  /** Cards the helper already picked (titles) */
  helperPicks: string[];
};

// @params
const P: Params = {
  title: "Second date ideas",
  asker: "Calvin",
  helper: "Maya",
  quote: "help i have a second date saturday and no ideas",
  day: "Saturday",
  bookBy: "Thu",
  cards: [
    { title: "Pottery night at Clay Co", cost: "$28", time: "7pm" },
    { title: "Sunset on Miller Hill", cost: "Free", time: "6:40pm" },
    { title: "Night market", cost: "$15", time: "8pm" },
    { title: "Mini golf", cost: "$12", time: "Any" },
    { title: "Dumplings at Golden Lantern", cost: "$20", time: "7:30pm" },
  ],
  askerPicks: ["Mini golf"],
  helperPicks: ["Sunset on Miller Hill", "Night market"],
};
// @end params

type Card = { title: string; cost: string; time: string };
type State = {
  title: string;
  asker: string;
  helper: string;
  aName: string;
  hName: string;
  quote: string;
  day: string;
  bookBy: string;
  cards: Card[];
  picks: string[][];
  matchAt: number;
  booked: boolean;
};
type Action = { t: "pick"; i: number } | { t: "book" } | { t: "unbook" };
type Local = { bursts: number };
type Kind = "pottery" | "hill" | "market" | "golf" | "food" | "movie" | "other";

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const FLIP = tween({ duration: 900, easing: "easeInOut" });
const LIFT = spring(springs.iosBouncy);
const pair = (s: State) => [s.asker, s.helper].filter(Boolean);
const matchOf = (s: State) => (s.asker && s.helper ? s.picks.findIndex((p) => p.includes(s.asker) && p.includes(s.helper)) : -1);

function kindOf(t: string): Kind {
  const l = t.toLowerCase();
  if (/pottery|clay|ceramic|paint|craft/.test(l)) return "pottery";
  if (/sunset|hill|hike|lake|picnic|park|stars/.test(l)) return "hill";
  if (/market|fair|thrift|shop/.test(l)) return "market";
  if (/golf|bowling|lanes|arcade|skate/.test(l)) return "golf";
  if (/dumpling|taco|pizza|dinner|ramen|brunch|cafe|coffee|food|eat/.test(l)) return "food";
  if (/movie|film|show|theater|concert/.test(l)) return "movie";
  return "other";
}

function initState(ctx: Ctx): State {
  const find = (n: unknown) => {
    const x = clean(n, 40).toLowerCase();
    return x ? ctx.members.find((m) => m.id === x || m.name.toLowerCase() === x) : undefined;
  };
  const am = find(P.asker);
  const asker = am?.id ?? ctx.members[0]?.id ?? "";
  const hm = find(P.helper);
  const helper = hm && hm.id !== asker ? hm.id : ctx.members.find((m) => m.id !== asker)?.id ?? "";
  let cards = (Array.isArray(P.cards) ? P.cards : [])
    .map((c) => ({ title: clean(c?.title, 40), cost: clean(c?.cost, 10), time: clean(c?.time, 10) }))
    .filter((c) => c.title)
    .slice(0, 6);
  if (cards.length < 2) cards = [{ title: "Coffee", cost: "", time: "" }, { title: "A walk", cost: "Free", time: "" }];
  const has = (list: unknown, t: string) => Array.isArray(list) && list.some((x) => clean(x, 40).toLowerCase() === t.toLowerCase());
  const picks = cards.map((c) => [...(asker && has(P.askerPicks, c.title) ? [asker] : []), ...(helper && has(P.helperPicks, c.title) ? [helper] : [])]);
  const s: State = {
    title: clean(P.title, 40) || "Date ideas",
    asker,
    helper,
    aName: am?.name ?? ctx.members.find((m) => m.id === asker)?.name ?? (clean(P.asker, 20) || "You"),
    hName: hm?.name ?? ctx.members.find((m) => m.id === helper)?.name ?? (clean(P.helper, 20) || "Friend"),
    quote: clean(P.quote, 90),
    day: clean(P.day, 16) || "the day",
    bookBy: clean(P.bookBy, 12),
    cards,
    picks,
    matchAt: 0,
    booked: false,
  };
  return matchOf(s) >= 0 ? { ...s, matchAt: 1 } : s;
}

function Art({ kind, w, h, seed, theme }: { kind: Kind; w: number; h: number; seed: string; theme: Theme }) {
  const p = pal(theme);
  const c = theme.color;
  const cx = w / 2;
  const bgs: Record<Kind, string> = { pottery: p.wall, hill: mix(p.orange, p.yellow, 0.4), market: mix(p.dark, p.blue, 0.4), golf: p.grass, food: mix(p.red, p.wall, 0.6), movie: mix(p.dark, p.purple, 0.3), other: p.sky };
  const bg = bgs[kind];
  const ink = mix(c.text, bg, 0.2);
  let body: unknown = null;
  if (kind === "pottery")
    body = (
      <g>
        <ellipse cx={cx} cy={h - 10} rx={24} ry={5} fill={p.brown} />
        <path d={`M ${cx - 9} ${h - 12} q -10 -12 0 -22 q -4 -6 4 -8 h 10 q 8 2 4 8 q 10 10 0 22 Z`} fill={p.crust} stroke={ink} stroke-width={1.2} />
        <path d={`M ${cx - 6} ${h - 28} q 6 4 12 0`} fill="none" stroke={ink} stroke-width={1} />
      </g>
    );
  else if (kind === "hill")
    body = (
      <g>
        <circle cx={cx + 8} cy={h - 18} r={11} fill={p.yellow} />
        <path d={`M 0 ${h} Q ${cx - 10} ${h - 26} ${w} ${h - 8} V ${h} Z`} fill={p.leaf} />
        <path d={`M 4 ${h - 30} h 10 M 20 ${h - 36} h 8`} stroke={p.cream} stroke-width={1.5} stroke-linecap="round" />
      </g>
    );
  else if (kind === "market")
    body = (
      <g>
        <path d={`M 6 12 Q ${cx} 22 ${w - 6} 12`} fill="none" stroke={p.cream} stroke-width={1} />
        {[0.2, 0.5, 0.8].map((f, i) => (
          <circle key={i} cx={w * f} cy={15 + Math.sin(f * Math.PI) * 4} r={3.5} fill={[p.yellow, p.red, p.orange][i]} />
        ))}
        {[0, 1].map((i) => (
          <g key={i} transform={`translate(${8 + i * (w / 2 - 4)} ${h - 22})`}>
            <rect x={0} y={6} width={w / 2 - 12} height={16} fill={p.paper} />
            <path d={`M -2 6 h ${w / 2 - 8} l -3 -7 h ${-(w / 2 - 14)} Z`} fill={i ? p.red : p.green} />
          </g>
        ))}
      </g>
    );
  else if (kind === "golf")
    body = (
      <g>
        <ellipse cx={cx + 6} cy={h - 8} rx={7} ry={2.5} fill={mix(p.leaf, c.text, 0.3)} />
        <line x1={cx + 6} y1={h - 8} x2={cx + 6} y2={h - 38} stroke={ink} stroke-width={1.5} />
        <path d={`M ${cx + 6} ${h - 38} l 14 5 l -14 5 Z`} fill={p.red} />
        <circle cx={cx - 14} cy={h - 10} r={4} fill={p.paper} stroke={ink} stroke-width={1} />
      </g>
    );
  else if (kind === "food")
    body = (
      <g>
        <path d={`M ${cx - 20} ${h - 22} h 40 q -2 16 -20 16 q -18 0 -20 -16 Z`} fill={p.paper} stroke={ink} stroke-width={1.2} />
        {[-10, 0, 10].map((dx) => (
          <path key={dx} d={`M ${cx + dx - 6} ${h - 22} q 6 -12 12 0 Z`} fill={p.cream} stroke={ink} stroke-width={1} />
        ))}
        <path d={`M ${cx - 4} ${h - 40} q -3 -4 0 -8 M ${cx + 6} ${h - 40} q 3 -4 0 -8`} stroke={p.paper} stroke-width={1.5} fill="none" />
      </g>
    );
  else if (kind === "movie")
    body = (
      <g>
        <rect x={10} y={8} width={w - 20} height={h - 26} rx={2} fill={p.sky} />
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={14 + i * ((w - 28) / 3)} cy={h - 9} r={5} fill={p.dark} />
        ))}
      </g>
    );
  else {
    const r = seedOf(seed) % 3;
    body = <path d={`M ${cx} 10 l 5 12 l 13 1 l -10 8 l 4 13 l -12 -7 l -12 7 l 4 -13 l -10 -8 l 13 -1 Z`} fill={[p.yellow, p.red, p.purple][r]} />;
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: "block", borderRadius: "8px 8px 0 0" }}>
      <rect x={0} y={0} width={w} height={h} fill={bg} />
      {body as never}
    </svg>
  );
}

export default defineApp<State, Action, Local>({
  name: "Date deck",
  summary: (s) => {
    const m = matchOf(s);
    if (m >= 0) return `${s.day}: ${s.cards[m]!.title}${s.booked ? " · booked" : ` · book by ${s.bookBy || "soon"}`}`;
    return `${s.aName}'s ${s.title.toLowerCase()} · ${s.cards.length} cards · no match yet`;
  },
  init: initState,

  reduce: (s, a, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u) || !pair(s).includes(u)) return s;
    if (a.t === "pick") {
      if (s.booked || !Number.isInteger(a.i) || a.i < 0 || a.i >= s.cards.length) return s;
      const picks = s.picks.map((p, i) => (i !== a.i ? p : p.includes(u) ? p.filter((x) => x !== u) : [...p, u]));
      const before = matchOf(s);
      const next = { ...s, picks };
      const after = matchOf(next);
      return { ...next, matchAt: after < 0 ? 0 : after !== before ? Math.max(1, meta.time) : s.matchAt };
    }
    if (a.t === "book") {
      if (u !== s.asker || s.booked || matchOf(s) < 0) return s;
      return { ...s, booked: true };
    }
    if (a.t === "unbook") {
      if (u !== s.asker || !s.booked) return s;
      return { ...s, booked: false };
    }
    return s;
  },

  invariants: {
    "only the two pick, once per card": (s) => s.picks.length === s.cards.length && s.picks.every((p) => new Set(p).size === p.length && p.every((u) => u === s.asker || u === s.helper)),
    "a match has a time": (s) => (matchOf(s) >= 0) === (s.matchAt > 0),
    "booking needs a match": (s) => !s.booked || matchOf(s) >= 0,
    "two to six cards": (s) => s.cards.length >= 2 && s.cards.length <= 6,
  },

  transitions: {
    "only the two act": (p, n, _a, m, ctx) => p === n || (pair(p).includes(m.user) && inChat(ctx, m.user)),
    "a tap moves only your face on that card": (p, n, a, m) =>
      a.t !== "pick" || p === n || n.picks.every((x, i) => (i === a.i ? x.includes(m.user) !== p.picks[i]!.includes(m.user) && x.filter((u) => u !== m.user).join() === p.picks[i]!.filter((u) => u !== m.user).join() : x.join() === p.picks[i]!.join())),
    "a new match turns over now": (p, n, a, m) => a.t !== "pick" || matchOf(n) < 0 || matchOf(n) === matchOf(p) || n.matchAt === Math.max(1, m.time),
    "only the asker books": (p, n, a, m) => (a.t !== "book" && a.t !== "unbook") || p === n || (m.user === p.asker && n.booked === (a.t === "book")),
    "a booked plan holds": (p, n) => !p.booked || JSON.stringify(n.picks) === JSON.stringify(p.picks),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.75) return { t: "pick", i: r.int(s.cards.length) };
    if (k < 0.9) return { t: "book" };
    return { t: "unbook" };
  },

  local: { bursts: 0 },

  view: ({ state, me, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const H = 196;
    const n = state.cards.length;
    const m = matchOf(state);
    const mine = pair(state).includes(me);
    const gap = 3;
    const cw = Math.min(90, (W - gap * (n - 1) - 14) / n);
    const ch = 132;
    const artH = Math.round(cw * 0.62);
    const flipE = m >= 0 && state.matchAt > 1 ? running(state.matchAt, 900) : null;
    const flip = m < 0 ? 0 : flipE === null ? 1 : FLIP(flipE);
    const showBack = flip >= 0.5;
    const sx = Math.abs(Math.cos(flip * Math.PI));
    const nameOf = (u: string) => (u === me ? "You" : u === state.asker ? state.aName : state.hName);
    const other = me === state.asker ? state.helper : state.asker;

    const fan = state.cards.map((card, i) => {
      const picks = state.picks[i] ?? [];
      const mid = (n - 1) / 2;
      const rot = (i - mid) * (n > 4 ? 4 : 5);
      const x = (W - n * cw - (n - 1) * gap) / 2 + i * (cw + gap);
      const lastPickAt = 0;
      const up = picks.length ? (picks.includes(me) ? 22 : 12) : 0;
      const y = 34 + Math.abs(i - mid) * Math.abs(i - mid) * 3 - up + lastPickAt;
      const isMatch = i === m;
      const longest = card.title.split(" ").reduce((a, b) => (b.length > a.length ? b : a), "");
      const wordSize = fitText(longest, cw - 10, { size: 13, min: 10, weight: 600 }).size;
      const lines = 3;
      const titleFit = fitText(card.title, (cw - 10) * 4, { size: wordSize, min: 10, weight: 600 });
      const metaFit = fitText([card.cost, card.time].filter(Boolean).join(" · "), cw - 12, { size: 12, min: 10 });
      const meta = [card.cost, card.time].filter(Boolean).join(" · ");
      return (
        <button
          key={i}
          type="button"
          aria-label={`${card.title}${meta ? `, ${meta}` : ""}${picks.length ? `, picked by ${picks.map(nameOf).join(" and ")}` : ""}`}
          aria-pressed={picks.includes(me)}
          onClick={() => {
            if (!mine || state.booked) return;
            haptic("light");
            setLocal({ bursts: local.bursts + 1 });
            dispatch({ t: "pick", i });
          }}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: cw,
            height: ch,
            padding: 0,
            border: 0,
            borderRadius: 10,
            background: c.card,
            boxShadow: `0 0 0 ${picks.includes(me) ? 2 : 1}px ${picks.includes(me) ? c.primary : c.divider}, 0 4px 10px ${mix(c.text, c.wash, 0.85)}`,
            transform: `rotate(${rot}deg)${isMatch && m >= 0 ? ` scaleX(${showBack ? 0 : sx})` : ""}`,
            transition: "top 300ms",
            textAlign: "left",
            font: "inherit",
            color: c.text,
            cursor: mine ? "pointer" : "default",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            overflow: "hidden",
            visibility: isMatch && showBack ? "hidden" : "visible",
          }}
        >
          <Art kind={kindOf(card.title)} w={cw} h={artH} seed={card.title} theme={theme} />
          <div style={{ padding: "5px 5px 0", fontSize: titleFit.size, lineHeight: "16px", fontWeight: 600, color: c.text, overflow: "hidden", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical" }}>{titleFit.text}</div>
          <div style={{ position: "absolute", left: 6, right: 6, bottom: 6, fontSize: metaFit.size, lineHeight: "14px", color: c.secondaryText, whiteSpace: "nowrap" }}>{metaFit.text}</div>
          {picks.length ? (
            <div style={{ position: "absolute", right: 4, top: 4, display: "flex", gap: 2 }}>
              {picks.map((u) => (
                <span key={u} style={{ display: "flex", borderRadius: 99, boxShadow: `0 0 0 2px ${c.card}` }}>
                  <Avatar user={u} size={18} />
                </span>
              ))}
            </div>
          ) : null}
        </button>
      );
    });

    const mc = m >= 0 ? state.cards[m]! : null;
    const back =
      mc && showBack ? (
        <div
          style={{ position: "absolute", left: W / 2 - Math.min(150, W / 2 - 10), top: 10, width: Math.min(300, W - 20), height: H - 24, borderRadius: 14, background: c.card, boxShadow: `0 0 0 2px ${c.primary}, 0 8px 18px ${mix(c.text, c.wash, 0.8)}`, transform: `scaleX(${sx.toFixed(3)})`, overflow: "hidden", zIndex: 5 }}
        >
          <Art kind={kindOf(mc.title)} w={Math.min(300, W - 20)} h={78} seed={mc.title} theme={theme} />
          <div style={{ padding: "8px 12px 0" }}>
            <div style={{ fontSize: 12, lineHeight: "16px", fontWeight: 700, color: c.primary }}>{`It's a match · ${state.day}`}</div>
            <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 700, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mc.title}</div>
            <div style={{ fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>{[mc.cost, mc.time].filter(Boolean).join(" · ")}</div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
              {pair(state).map((u) => (
                <Avatar key={u} user={u} size={20} />
              ))}
              <span style={{ fontSize: 12, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.booked ? "Booked · on the calendar" : state.bookBy ? `Reminder: book by ${state.bookBy}` : "Both picked this one"}</span>
            </div>
          </div>
        </div>
      ) : null;

    const myPicks = state.picks.filter((x) => x.includes(me)).length;
    const otherPicks = state.picks.filter((x) => x.includes(other)).length;

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.quote ? `${state.aName}: "${state.quote}"` : `${state.aName} and ${state.hName} · ${state.day}`} />
        <div style={{ position: "relative", height: H, borderRadius: 14, background: mix(p.green, c.wash, theme.mode === "dark" ? 0.75 : 0.82), overflow: "hidden" }} role="group" aria-label={`${n} date ideas`}>
          {fan}
          {back}
          {local.bursts > 0 && m >= 0 && showBack ? <Burst key={local.bursts} emoji="💘" /> : null}
        </div>
        <div style={{ marginTop: 8, minHeight: 48, display: "flex", alignItems: "center", gap: 8 }}>
          {state.booked && mc ? (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Locked detail={`${mc.title} · reminder set`}>{`${state.day} is set`}</Locked>
              </div>
              {me === state.asker ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "unbook" })}>
                  Undo
                </Button>
              ) : null}
            </>
          ) : mc ? (
            <>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>{me === state.asker ? "You both picked it" : `${state.aName} books it`}</span>
              {me === state.asker ? (
                <>
                <Button kind="deemphasized" onClick={() => dispatch({ t: "pick", i: m })}>
                  Keep looking
                </Button>
                <Button
                  kind="primary"
                  onClick={() => {
                    haptic("success");
                    dispatch({ t: "book" });
                  }}
                >
                  Book it
                </Button>
                </>
              ) : mine ? (
                <Button kind="secondary" onClick={() => dispatch({ t: "pick", i: m })}>
                  Keep looking
                </Button>
              ) : null}
            </>
          ) : (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "17px", color: c.secondaryText }}>
              {mine
                ? `Tap the ones you'd do · ${other ? `${nameOf(other)} picked ${otherPicks}` : ""}${myPicks ? ` · you picked ${myPicks}` : ""}`
                : `${state.aName} and ${state.hName} are picking`}
            </span>
          )}
        </div>
      </div>
    );
  },
});
