import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  More,
  Toast,
  fitText,
  haptic,
  mix,
  running,
  tween,
  userColor,
  type Ctx,
  type Member,
  type Theme,
} from "@muse/app";

// Smash ladder: an Elo ladder built from every "gg i won" in the chat. Tap who won, then who lost:
// the ratings roll, the rows slide into their new order and the claim pinned to Omar keeps saying
// where he really is. Head-to-head sets sit in a grid underneath.

type Stock = "fox" | "sword" | "orb" | "block" | "puff" | "bolt";
type Params = {
  /** Card title: "The boys smash ladder" */
  title: string;
  /** How many results were found in the chat */
  logged: number;
  /** 2 to 12 players: name, main character, stock icon, starting rating 1000 to 2000 */
  players: { name: string; main: string; stock: Stock; elo: number }[];
  /** wins[i][j] = sets player i won against player j */
  wins: number[][];
  /** The line someone keeps saying, pinned to their row */
  claim: { who: string; text: string } | null;
};

// @params
const P: Params = {
  title: "The boys smash ladder", logged: 47,
  players: [
    { name: "Jake", main: "Fox", stock: "fox", elo: 1612 }, { name: "Kev", main: "Marth", stock: "sword", elo: 1574 },
    { name: "Dev", main: "Kirby", stock: "orb", elo: 1541 }, { name: "Omar", main: "Ganondorf", stock: "block", elo: 1528 },
    { name: "Bryan", main: "Jigglypuff", stock: "puff", elo: 1490 }, { name: "Sam", main: "Pikachu", stock: "bolt", elo: 1455 },
  ],
  wins: [[0, 4, 3, 5, 3, 4], [2, 0, 3, 3, 4, 3], [2, 2, 0, 3, 3, 4], [1, 3, 2, 0, 4, 3], [2, 1, 2, 2, 0, 3], [1, 2, 1, 2, 2, 0]],
  claim: { who: "Omar", text: "i'm the best here" },
};
// @end params

type Player = { id: string; name: string; main: string; stock: Stock; user: string | null; base: number; elo: number };
type Last = { w: string; l: string; d: number; at: number; by: string };
type State = {
  title: string;
  logged: number;
  players: Player[];
  wins: number[][];
  claim: { who: string; text: string } | null;
  last: Last | null;
};
type Action = { t: "set"; w: string; l: string } | { t: "join" };
type Local = { pick: string | null; open: boolean; bursts: number };

const STOCKS: Stock[] = ["fox", "sword", "orb", "block", "puff", "bolt"];
const MAX_PLAYERS = 12;
const ROW = 34;
const MOVE_MS = 900;
const FLOAT_MS = 1600;
const FLASH_MS = 1200;
const move = tween({ duration: MOVE_MS, easing: "decelerate" });

const gain = (rw: number, rl: number) => Math.round(32 / (1 + 10 ** ((rw - rl) / 400)));
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 999 ? v : 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Players by rating, best first, ties by seat. */
const order = (s: State): Player[] =>
  s.players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.elo - a.p.elo || a.i - b.i)
    .map((x) => x.p);

function initState(ctx: Ctx): State {
  const taken = new Set<string>();
  const players: Player[] = [];
  for (const raw of P.players) {
    if (players.length >= MAX_PLAYERS) break;
    const name = clean(raw.name, 14);
    if (!name) continue;
    const elo = typeof raw.elo === "number" && Number.isInteger(raw.elo) ? Math.min(2000, Math.max(1000, raw.elo)) : 1500;
    const member = ctx.members.find((m) => !taken.has(m.id) && m.name.trim().toLowerCase() === name.toLowerCase());
    if (member) taken.add(member.id);
    players.push({
      id: `p${players.length}`,
      name,
      main: clean(raw.main, 14),
      stock: STOCKS.includes(raw.stock) ? raw.stock : "orb",
      user: member ? member.id : null,
      base: elo,
      elo,
    });
  }
  const n = players.length;
  const rows = Array.isArray(P.wins) ? P.wins : [];
  const wins = players.map((_, i) => players.map((_x, j) => (i === j ? 0 : count(Array.isArray(rows[i]) ? rows[i]![j] : 0))));
  const who = P.claim ? players.find((p) => p.name.toLowerCase() === clean(P.claim?.who, 14).toLowerCase()) : undefined;
  const text = clean(P.claim?.text, 24);
  const logged = typeof P.logged === "number" && Number.isInteger(P.logged) && P.logged >= 0 && P.logged <= 9999 ? P.logged : 0;
  return {
    title: clean(P.title, 60) || "Smash ladder",
    logged,
    players,
    wins: n ? wins : [],
    claim: who && text ? { who: who.id, text } : null,
    last: null,
  };
}

/** Which rows the ladder draws: everyone when open or small, else 5 and then me or the 6th. */
function shownRows(ord: Player[], open: boolean, me: string): Player[] {
  if (open || ord.length <= 6) return ord;
  const head = ord.slice(0, 5);
  const mine = ord.slice(5).find((p) => p.user === me);
  return [...head, mine ?? ord[5]!];
}

// ---- drawing ----

function StockIcon({ stock, theme }: { stock: Stock; theme: Theme }) {
  const c = theme.color;
  const fill = [c.series1, c.series2, c.series3, c.series4, c.positive, c.negative][STOCKS.indexOf(stock)] ?? c.series3;
  const common = { transform: "translate(8 8)" };
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block" }}>
      {stock === "fox" ? <polygon {...common} points="0,-8 7,6 -7,6" fill={fill} /> : null}
      {stock === "sword" ? <line {...common} x1={-6} y1={7} x2={6} y2={-7} stroke={fill} stroke-width={3} stroke-linecap="round" /> : null}
      {stock === "orb" ? <circle {...common} cx={0} cy={0} r={7} fill={fill} /> : null}
      {stock === "block" ? <rect {...common} x={-6} y={-6} width={12} height={12} rx={2} fill={fill} /> : null}
      {stock === "puff" ? (
        <g {...common} fill={fill}>
          <circle cx={0} cy={1} r={6.5} />
          <circle cx={-4} cy={-6} r={2.5} />
          <circle cx={4} cy={-6} r={2.5} />
        </g>
      ) : null}
      {stock === "bolt" ? <polygon {...common} points="-3,-8 4,-2 0,-1 4,8 -4,1 0,0" fill={fill} /> : null}
    </svg>
  );
}

function Face({ p, members, size, theme }: { p: Player; members: Member[]; size: number; theme: Theme }) {
  const member = p.user ? members.find((m) => m.id === p.user) : undefined;
  if (member) return <Avatar user={member} size={size} />;
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        width: size,
        height: size,
        borderRadius: "50%",
        background: userColor(p.name, theme),
        color: theme.color.onPrimary,
        fontSize: Math.round(size * 0.45),
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {(p.name[0] ?? "?").toUpperCase()}
    </span>
  );
}

const CSS =
  ".se-hit{position:relative}.se-hit::after{content:'';position:absolute;left:-4px;right:-4px;top:-9px;bottom:-9px}" +
  ".se-pick:hover .se-face{transform:scale(1.06)}.se-face{transition:transform .2s}" +
  ".se-scroll{scrollbar-width:none}.se-scroll::-webkit-scrollbar{display:none}" +
  "@media (prefers-reduced-motion:reduce){.se-face{transition:none}}";

export default defineApp<State, Action, Local>({
  name: "Smash ladder",
  summary: (s, ctx) => {
    const ord = order(s);
    if (!ord.length) return `${s.title}: no sets yet`;
    const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name ?? "";
    void ctx;
    const base = `${s.title}: ${ord[0]!.name} leads at ${ord[0]!.elo} · ${s.logged} sets`;
    return s.last ? `${base} · last: ${nameOf(s.last.w)} beat ${nameOf(s.last.l)}` : base;
  },

  init: (ctx) => initState(ctx),

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "set") {
      if (typeof a.w !== "string" || typeof a.l !== "string" || a.w === a.l) return s;
      const iw = s.players.findIndex((p) => p.id === a.w);
      const il = s.players.findIndex((p) => p.id === a.l);
      if (iw < 0 || il < 0) return s;
      const d = gain(s.players[iw]!.elo, s.players[il]!.elo);
      return {
        ...s,
        players: s.players.map((p, i) => (i === iw ? { ...p, elo: p.elo + d } : i === il ? { ...p, elo: p.elo - d } : p)),
        wins: s.wins.map((row, i) => (i === iw ? row.map((v, j) => (j === il ? v + 1 : v)) : row)),
        logged: s.logged + 1,
        last: { w: a.w, l: a.l, d, at: meta.time, by: meta.user },
      };
    }
    if (a.t === "join") {
      if (s.players.length >= MAX_PLAYERS || s.players.some((p) => p.user === meta.user)) return s;
      const name = clean(ctx.members.find((m) => m.id === meta.user)?.name, 14);
      if (!name) return s;
      const me: Player = { id: `j${meta.seq}`, name, main: "", stock: "orb", user: meta.user, base: 1500, elo: 1500 };
      return {
        ...s,
        players: [...s.players, me],
        wins: [...s.wins.map((row) => [...row, 0]), [...s.players.map(() => 0), 0]],
      };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    if (s.players.every((p) => p.user === null || inChat(ctx, p.user))) return s;
    return { ...s, players: s.players.map((p) => (p.user !== null && !inChat(ctx, p.user) ? { ...p, user: null } : p)) };
  },

  invariants: {
    "ratings are conserved": (s) => s.players.every((p) => Number.isInteger(p.elo) && Number.isInteger(p.base)) && s.players.reduce((a, p) => a + p.elo, 0) === s.players.reduce((a, p) => a + p.base, 0),
    "wins is square with an empty diagonal": (s) =>
      s.wins.length === s.players.length &&
      s.wins.every((row, i) => row.length === s.players.length && row.every((v) => Number.isInteger(v) && v >= 0) && row[i] === 0),
    "unique ids, 12 at most": (s) => new Set(s.players.map((p) => p.id)).size === s.players.length && s.players.length <= MAX_PLAYERS,
    "linked players are in the chat, once each": (s, ctx) => {
      const users = s.players.map((p) => p.user).filter((u): u is string => u !== null);
      return new Set(users).size === users.length && users.every((u) => ctx.members.some((m) => m.id === u));
    },
    "the last set names two different players": (s) =>
      s.last === null ||
      (s.last.w !== s.last.l &&
        s.players.some((p) => p.id === s.last!.w) &&
        s.players.some((p) => p.id === s.last!.l) &&
        Number.isInteger(s.last.d) &&
        s.last.d >= 0 &&
        s.last.d <= 32),
    "the claim points at a player": (s) => s.claim === null || s.players.some((p) => p.id === s.claim!.who),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "no set against yourself": (p, n, a) => a.t !== "set" || a.w !== a.l || p === n,
    "a set moves the expected points from loser to winner": (p, n, a) => {
      if (a.t !== "set" || p === n) return true;
      const iw = p.players.findIndex((x) => x.id === a.w);
      const il = p.players.findIndex((x) => x.id === a.l);
      if (iw < 0 || il < 0) return false;
      const d = Math.round(32 / (1 + 10 ** ((p.players[iw]!.elo - p.players[il]!.elo) / 400)));
      return p.players.every((x, i) => n.players[i]!.elo === x.elo + (i === iw ? d : i === il ? -d : 0));
    },
    "a set adds one win and one to the count": (p, n, a) => {
      if (a.t !== "set" || p === n) return true;
      const iw = p.players.findIndex((x) => x.id === a.w);
      const il = p.players.findIndex((x) => x.id === a.l);
      return n.logged === p.logged + 1 && p.wins.every((row, i) => row.every((v, j) => n.wins[i]![j] === v + (i === iw && j === il ? 1 : 0)));
    },
    "the last set is this one": (p, n, a, m) => a.t !== "set" || p === n || (n.last !== null && n.last.w === a.w && n.last.l === a.l && n.last.at === m.time && n.last.by === m.user),
    "join adds only me, at 1500": (p, n, a, m) =>
      a.t !== "join" ||
      p === n ||
      (!p.players.some((x) => x.user === m.user) &&
        n.players.length === p.players.length + 1 &&
        n.players[n.players.length - 1]!.user === m.user &&
        n.players[n.players.length - 1]!.elo === 1500 &&
        p.players.every((x, i) => JSON.stringify(x) === JSON.stringify(n.players[i]))),
    "names, mains and the claim never change": (p, n) =>
      JSON.stringify(p.claim) === JSON.stringify(n.claim) && p.players.every((x, i) => n.players[i]!.name === x.name && n.players[i]!.main === x.main && n.players[i]!.id === x.id),
  },

  arbitrary: (s, user, r) => {
    const have = s.players.some((p) => p.user === user);
    if (!have && s.players.length < MAX_PLAYERS && r.next() < 0.15) return { t: "join" };
    if (s.players.length >= 2) {
      const ids = s.players.map((p) => p.id);
      const w = r.pick(ids);
      const l = r.pick(ids.filter((id) => id !== w));
      return { t: "set", w, l };
    }
    return { t: "join" };
  },

  local: { pick: null, open: false, bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const wide = W >= 360;
    const ord = order(state);
    const n = ord.length;
    const rankOf = (id: string) => ord.findIndex((p) => p.id === id);
    const mine = state.players.find((p) => p.user === me);
    const open = local.open && n >= 2;

    // The moment: ratings roll and rows slide, all from state.last.
    const last = state.last;
    const run = last ? running(last.at, MOVE_MS) : null;
    const e = move(run ?? MOVE_MS);
    const floating = last ? running(last.at, FLOAT_MS) : null;
    const flash = last ? running(last.at, FLASH_MS) : null;
    const prevElo = (p: Player) => (last ? p.elo - (p.id === last.w ? last.d : p.id === last.l ? -last.d : 0) : p.elo);
    const prevOrd = last
      ? state.players
          .map((p, i) => ({ p, i, v: prevElo(p) }))
          .sort((a, b) => b.v - a.v || a.i - b.i)
          .map((x) => x.p)
      : ord;
    const shown = shownRows(ord, open, me);
    const prevShown = shownRows(prevOrd, open, me);
    const rest = n - shown.length;

    const claimer = state.claim ? state.players.find((p) => p.id === state.claim!.who) : undefined;
    const bubbleCx = Math.round((214 / 380) * W);
    const ladderH = n === 0 ? 34 : 2 + shown.length * ROW;
    const pickedName = local.pick ? state.players.find((p) => p.id === local.pick)?.name : undefined;

    const step = n ? Math.min(72, (W - 8) / Math.min(6, n)) : 0;
    const pickerW = Math.max(W, step * n + 8);

    const tapFace = (id: string) => {
      if (!local.pick) setLocal({ pick: id });
      else if (local.pick === id) setLocal({ pick: null });
      else {
        dispatch({ t: "set", w: local.pick, l: id });
        setLocal({ pick: null, bursts: local.bursts + 1 });
        haptic("light");
      }
    };

    const toast = (() => {
      if (!last || local.bursts === 0 || last.by !== me) return null;
      const w = state.players.find((p) => p.id === last.w);
      const l = state.players.find((p) => p.id === last.l);
      if (!w || !l) return null;
      const wasFirst = prevOrd[0]?.id === w.id;
      return rankOf(w.id) === 0 && !wasFirst ? `${w.name} takes #1` : `${w.name} +${last.d} · ${l.name} −${last.d}`;
    })();

    // head-to-head grid: top six by rating
    const top = ord.slice(0, 6);
    const gx = Math.min(90, W - 209);
    const cellX = (cIdx: number) => gx + 26 * (cIdx + 1.5);

    return (
      <div>
        <style>{CSS}</style>
        <CardHeader title={state.title} subtitle={`Muse · from ${state.logged} “gg i won”s in chat`} />

        <div role="list" aria-label={`Ladder: ${n} players`} style={{ position: "relative", height: ladderH, marginTop: 4 }}>
          {n === 0 ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 2,
                height: 30,
                border: `1px dashed ${c.divider}`,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                color: c.secondaryText,
              }}
            >
              No sets yet · join, then log who won
            </div>
          ) : null}

          {shown.map((p, idx) => {
            const rank = rankOf(p.id);
            const from = prevShown.findIndex((x) => x.id === p.id);
            const y = lerp(from < 0 ? idx : from, idx, e) * ROW;
            const shownElo = Math.round(lerp(prevElo(p), p.elo, e));
            const isClaimer = claimer?.id === p.id;
            const picked = local.pick === p.id;
            const hasFloat = floating !== null && last && (p.id === last.w || p.id === last.l);
            const nameMax = isClaimer ? 110 : 110;
            const claimText = isClaimer && state.claim ? fitText(`“${state.claim.text}”`, Math.max(40, W - 200), { size: 12 }) : null;
            const bw = claimText ? claimText.width * 0.92 + 14 : 0;
            const bl = bubbleCx - bw / 2;
            const nameFit = fitText(p.name, isClaimer ? Math.max(30, Math.min(nameMax, bl - 64)) : nameMax, { size: 15, weight: 600, min: 12 });
                        return (
              <div key={p.id} role="listitem" aria-label={`${rank + 1}. ${p.name}, ${shownElo}`} style={{ position: "absolute", left: 0, width: W, top: 2 + y, height: 30 }}>
                {rank === 0 || picked ? (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: -2,
                      bottom: -2,
                      borderRadius: 8,
                      background: mix(c.card, c.primary, picked ? 0.16 : 0.08),
                    }}
                  />
                ) : (
                  <div style={{ position: "absolute", left: 8, right: 8, top: -2, height: 1, background: c.divider }} />
                )}
                <span style={{ position: "absolute", left: 4, top: 0, width: 24, textAlign: "center", fontSize: 15, lineHeight: "30px", fontWeight: 600, color: rank === 0 ? c.link : c.secondaryText }}>{rank + 1}</span>
                <span style={{ position: "absolute", left: 31, top: 4, display: "flex" }}>
                  <Face p={p} members={members} size={22} theme={theme} />
                </span>
                <span style={{ position: "absolute", left: 60, top: 0, fontSize: 15, lineHeight: "18px", fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{nameFit.text}</span>
                <span style={{ position: "absolute", left: 58, top: 15, display: "flex" }}>
                  <StockIcon stock={p.stock} theme={theme} />
                </span>
                {p.main ? (
                  <span style={{ position: "absolute", left: 76, top: 16, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, lineHeight: "14px", color: c.secondaryText }}>{p.main}</span>
                ) : null}
                {claimText ? (
                  <>
                    <span
                      style={{
                        position: "absolute",
                        left: bubbleCx,
                        top: 5,
                        padding: "3px 7px",
                        borderRadius: 9,
                        background: c.wash,
                        color: c.text,
                        fontSize: 12,
                        lineHeight: "14px",
                        whiteSpace: "nowrap",
                        transform: "translateX(-50%) rotate(-2deg)",
                      }}
                    >
                      {claimText.text}
                      {rank !== 0 && wide && !hasFloat ? (
                        <span style={{ position: "absolute", left: "100%", marginLeft: 6, top: 0, fontSize: 13, lineHeight: "20px", fontWeight: 600, color: c.secondaryText }}>{`(#${rank + 1})`}</span>
                      ) : null}
                    </span>
                  </>
                ) : null}
                <span style={{ position: "absolute", right: 12, top: 0, fontSize: 20, lineHeight: "30px", fontWeight: 600, letterSpacing: -0.4, color: c.text, fontVariantNumeric: "tabular-nums" }}>{shownElo}</span>
                {hasFloat && last ? (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      right: 66,
                      top: -10 * (floating! / FLOAT_MS),
                      fontSize: 16,
                      lineHeight: "30px",
                      fontWeight: 600,
                      color: p.id === last.w ? c.positive : c.negative,
                      opacity: 1 - (floating! / FLOAT_MS) ** 2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.id === last.w ? `+${last.d}` : `−${last.d}`}
                  </span>
                ) : null}
              </div>
            );
          })}

          {last && local.bursts > 0 && last.by === me && shown.some((p) => p.id === last.l) ? (
            <div style={{ position: "absolute", left: 42, top: 2 + (shown.findIndex((p) => p.id === last.l) as number) * ROW + 15, width: 0, pointerEvents: "none" }}>
              <Burst key={local.bursts} emoji={"\u{1F525}"} count={5} />
            </div>
          ) : null}
        </div>

        {rest > 0 ? (
          <div style={{ marginTop: 2 }}>
            <More n={rest} />
          </div>
        ) : null}

        {n > 0 ? (
          <div style={{ marginTop: rest > 0 ? 2 : 8 }}>
            <div style={{ height: 22, fontSize: 13, lineHeight: "22px", color: pickedName ? c.link : c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {n < 2 ? "Log a set once 2 people are on the ladder" : pickedName ? `${pickedName} won. Now tap who lost` : "Log a set: tap who won"}
            </div>
            <div className="se-scroll" style={{ overflowX: "auto", overflowY: "hidden", height: 60, textAlign: n <= 6 ? "center" : "left" }}>
              <div style={{ display: "inline-flex", width: n <= 6 ? undefined : pickerW, padding: "0 4px", height: 60 }}>
                {ord.length
                  ? state.players.map((p) => {
                      const picked = local.pick === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="se-pick"
                          aria-label={`${p.name}, ${p.elo}`}
                          aria-pressed={picked}
                          onClick={() => tapFace(p.id)}
                          style={{
                            flex: "none",
                            width: step,
                            height: 56,
                            padding: 0,
                            border: 0,
                            background: "none",
                            font: "inherit",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            cursor: "pointer",
                          }}
                        >
                          <span
                            className="se-face"
                            style={{ marginTop: picked ? 0 : 2, display: "flex", borderRadius: "50%", boxShadow: picked ? `0 0 0 4px ${mix(c.card, c.primary, 0.45)}` : "none" }}
                          >
                            <Face p={p} members={members} size={picked ? 34 : 30} theme={theme} />
                          </span>
                          <span style={{ marginTop: picked ? 5 : 8, maxWidth: step - 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, lineHeight: "16px", color: picked ? c.text : c.secondaryText, fontWeight: picked ? 600 : 400 }}>{p.name}</span>
                        </button>
                      );
                    })
                  : null}
              </div>
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 36, marginTop: n > 0 ? 0 : 8 }}>
          {n >= 2 ? (
            <button
              type="button"
              className="se-hit"
              onClick={() => setLocal({ open: !local.open })}
              aria-expanded={open}
              style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 26, padding: 0, border: 0, background: "none", font: "inherit", fontSize: 14, fontWeight: 600, color: c.link, cursor: "pointer" }}
            >
              {open ? "Hide matchups" : "Matchups"}
              <svg width={10} height={6} viewBox="0 0 10 6" aria-hidden="true">
                {open ? <polygon points="0,6 5,0 10,6" fill={c.link} /> : <polygon points="0,0 10,0 5,6" fill={c.link} />}
              </svg>
            </button>
          ) : (
            <span />
          )}
          {!mine && n < MAX_PLAYERS ? (
            <Button kind="secondary" onClick={() => dispatch({ t: "join" })}>
              Join
            </Button>
          ) : null}
        </div>

        {open ? (
          <div role="table" aria-label="Head-to-head sets, row beat column" style={{ position: "relative", height: 186 }}>
            <span style={{ position: "absolute", left: 2, top: 1, fontSize: 11, lineHeight: "14px", color: c.secondaryText }}>Row beat column</span>
            {top.map((p, ci) => (
              <span key={`h${p.id}`} style={{ position: "absolute", left: cellX(ci) - 9, top: 4, display: "flex" }}>
                <Face p={p} members={members} size={18} theme={theme} />
              </span>
            ))}
            {top.map((rp, ri) => {
              const i = state.players.indexOf(rp);
              const nameFit = fitText(rp.name, Math.max(24, gx + 27.5 - 34 - 6), { size: 12, min: 10 });
              return (
                <div key={`r${rp.id}`} role="row" aria-label={rp.name}>
                  <span style={{ position: "absolute", left: 20 - 9, top: 26 * (ri + 1.5) - 9, display: "flex" }}>
                    <Face p={rp} members={members} size={18} theme={theme} />
                  </span>
                  <span style={{ position: "absolute", left: 34, top: 26 * (ri + 1.5) - 8, fontSize: 12, lineHeight: "16px", color: c.text, whiteSpace: "nowrap" }}>{nameFit.text}</span>
                  {top.map((cp, ci) => {
                    const j = state.players.indexOf(cp);
                    const box = { position: "absolute" as const, left: cellX(ci) - 11.5, top: 26 * (ri + 1.5) - 11.5, width: 23, height: 23, borderRadius: 5 };
                    if (i === j) return <span key={cp.id} style={{ ...box, background: mix(c.card, c.secondaryText, 0.12) }} />;
                    const w = state.wins[i]![j]!;
                    const l = state.wins[j]![i]!;
                    const edge = (w - l) / Math.max(1, w + l);
                    const col = edge > 0 ? c.positive : edge < 0 ? c.negative : c.secondaryText;
                    let fill = mix(c.card, col, 0.12 + Math.abs(edge) * 0.24);
                    const fresh = flash !== null && last && last.w === rp.id && last.l === cp.id;
                    if (fresh) fill = mix(fill, c.series2, 0.25 * (1 - flash / FLASH_MS));
                    return (
                      <span
                        key={cp.id}
                        role="cell"
                        aria-label={`${rp.name} beat ${cp.name} ${w} to ${l}`}
                        style={{ ...box, background: fill, color: c.text, fontSize: 12, lineHeight: "23px", fontWeight: 600, textAlign: "center", letterSpacing: -0.2, overflow: "hidden", fontVariantNumeric: "tabular-nums", boxShadow: fresh ? `inset 0 0 0 2px ${mix(c.card, c.series2, 1 - flash! / FLASH_MS)}` : "none" }}
                      >{`${w}-${l}`}</span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : null}

        {toast ? <Toast key={local.bursts}>{toast}</Toast> : null}
      </div>
    );
  },
});
