import {
  defineApp,
  Button,
  CardHeader,
  OptionRow,
  Scene,
  Toast,
  circle,
  ellipse,
  fitText,
  haptic,
  line,
  mix,
  pal,
  path,
  rect,
  running,
  spring,
  springs,
  tween,
  type Ctx,
  type Meta,
  type Theme,
} from "@muse/app";

// Bracket post: an 8-spot bracket in a feed post. Round 1 is already played; friends vote the two
// semis, close the round, the winners move up the tree, then vote the final and crown a champ.

type Food = "burrito" | "taco" | "donut" | "shake" | "pizza" | "burger" | "curry" | "fries";
type Params = {
  /** "Best late night food in SF" */
  title: string;
  /** Time left in the round: "3h left" */
  left: string;
  /** 8 entries in bracket order: name, and food only when the entries are food */
  teams: { name: string; food?: Food }[];
  /** "food" draws a food icon per entry; "initials" (the default unless every entry names a food) a coloured disc with initials */
  kind?: "food" | "initials";
  /** Round 1 winners: for each of the 4 pairs, 0 (first) or 1 (second) */
  quarters: number[];
  /** Votes from outside this chat for each semi: [[first, second], [first, second]] */
  semis: number[][];
  /** Outside votes for the final: [first, second] */
  final: number[];
  /** Chat members' semi votes, by team name */
  people: { name: string; picks: string[] }[];
};

// @params
const P: Params = {
  title: "Best late night food in SF",
  left: "3h left",
  teams: [
    { name: "El Farolito", food: "burrito" },
    { name: "Taqueria Cancún", food: "taco" },
    { name: "Bob's Donuts", food: "donut" },
    { name: "Orphan Andy's", food: "shake" },
    { name: "Golden Boy", food: "pizza" },
    { name: "Sam's Burgers", food: "burger" },
    { name: "Shalimar", food: "curry" },
    { name: "Grubstake", food: "fries" },
  ],
  quarters: [0, 0, 0, 0],
  semis: [
    [31, 26],
    [29, 28],
  ],
  final: [31, 31],
  people: [
    { name: "Noa", picks: ["El Farolito", "Golden Boy"] },
    { name: "Jonah", picks: ["El Farolito"] },
    { name: "Dev", picks: ["Bob's Donuts", "Shalimar"] },
    { name: "Priya", picks: ["Shalimar"] },
    { name: "Theo", picks: ["El Farolito", "Shalimar"] },
  ],
};
// @end params

type Team = { name: string; food: Food };
/** match: 0 and 1 are the semis, 2 is the final. side: 0 or 1. */
type Vote = { user: string; match: number; side: number };
/** base: outside votes [[s0a, s0b], [s1a, s1b], [fa, fb]]. round: 1 semis live, 2 final live, 3 done. semiWin: team indices. */
type State = {
  kind: "food" | "initials";
  title: string;
  left: string;
  teams: Team[];
  quarters: number[];
  base: number[][];
  round: 1 | 2 | 3;
  votes: Vote[];
  semiWin: number[];
  champ: number;
  closedAt: number;
};
type Action = { t: "vote"; match: number; side: number } | { t: "close" };
type Rec = Record<string, unknown>;

const FOODS: Food[] = ["burrito", "taco", "donut", "shake", "pizza", "burger", "curry", "fries"];
const MAX_BASE = 100_000;
const SLIDE_MS = 450;
const slide = tween({ duration: SLIDE_MS, easing: [0.34, 1.56, 0.64, 1] });
const rise = tween({ duration: 400, easing: "decelerate" });
const popSpring = spring(springs.iosBouncy);
const POP_AT = 500;

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const semiTeams = (s: { quarters: number[] }, m: number): number[] => [m * 4 + (s.quarters[m * 2] ?? 0), m * 4 + 2 + (s.quarters[m * 2 + 1] ?? 0)];
const live = (s: State): number[] => (s.round === 1 ? [0, 1] : s.round === 2 ? [2] : []);
const sides = (s: State, m: number): number[] => (m === 2 ? s.semiWin : semiTeams(s, m));
const tally = (s: State, m: number): [number, number] => [
  (s.base[m]?.[0] ?? 0) + s.votes.filter((v) => v.match === m && v.side === 0).length,
  (s.base[m]?.[1] ?? 0) + s.votes.filter((v) => v.match === m && v.side === 1).length,
];
/** The higher seed (side 0) wins ties. */
const winner = (s: State, m: number): number => {
  const [a, b] = tally(s, m);
  return a >= b ? 0 : 1;
};
const voted = (s: State, u: string, m: number) => s.votes.some((v) => v.user === u && v.match === m);

// ---- Reducer side ----

function reduceBracket(s: State, a: Rec, meta: Meta, ctx: Ctx): State {
  if (!inChat(ctx, meta.user)) return s;

  if (a.t === "vote") {
    const { match, side } = a;
    if (!isInt(match) || !isInt(side) || (side !== 0 && side !== 1) || !live(s).includes(match)) return s;
    const mine = s.votes.find((v) => v.user === meta.user && v.match === match);
    if (mine && mine.side === side) return s;
    const vote: Vote = { user: meta.user, match, side };
    return { ...s, votes: mine ? s.votes.map((v) => (v === mine ? vote : v)) : [...s.votes, vote] };
  }

  if (a.t === "close") {
    if (s.round >= 3 || !live(s).every((m) => voted(s, meta.user, m))) return s;
    if (s.round === 1) {
      return { ...s, round: 2, semiWin: [semiTeams(s, 0)[winner(s, 0)]!, semiTeams(s, 1)[winner(s, 1)]!], closedAt: meta.time };
    }
    return { ...s, round: 3, champ: s.semiWin[winner(s, 2)]!, closedAt: meta.time };
  }

  return s;
}

// ---- Check side ----

const frozen = (s: State) => JSON.stringify([s.teams, s.quarters, s.base, s.title]);

export default defineApp<State, Action>({
  name: "Bracket post",
  summary: (s) => {
    if (s.round === 1) return `${s.title}: semis live, ${new Set(s.votes.map((v) => v.user)).size} friends voted`;
    if (s.round === 2) return `${s.title}: ${s.teams[s.semiWin[0]!]?.name} vs ${s.teams[s.semiWin[1]!]?.name} in the final`;
    return `${s.title}: ${s.teams[s.champ]?.name} won`;
  },

  init: (ctx) => {
    const raw = Array.isArray(P.teams) ? P.teams : [];
    const allFood = raw.length >= 8 && raw.slice(0, 8).every((t) => t && typeof t.name === "string" && t.name.trim() && FOODS.includes(t.food as Food));
    const kind: "food" | "initials" = P.kind === "food" || P.kind === "initials" ? P.kind : allFood ? "food" : "initials";
    const teams: Team[] = Array.from({ length: 8 }, (_, i) => {
      const t = raw[i];
      if (!t || typeof t.name !== "string" || !t.name.trim()) return { name: "Open spot", food: "fries" as Food };
      return { name: t.name.trim().slice(0, 20), food: FOODS.includes(t.food as Food) ? (t.food as Food) : FOODS[i]! };
    });
    const quarters = Array.from({ length: 4 }, (_, i) => (Array.isArray(P.quarters) && P.quarters[i] === 1 ? 1 : 0));
    const num = (v: unknown) => (isInt(v) ? Math.max(0, Math.min(MAX_BASE, v)) : 0);
    const base = [0, 1].map((m) => [num(P.semis?.[m]?.[0]), num(P.semis?.[m]?.[1])]);
    base.push([num(P.final?.[0]), num(P.final?.[1])]);
    const s0 = { quarters };
    const votes: Vote[] = [];
    for (const p of Array.isArray(P.people) ? P.people : []) {
      if (!p || typeof p.name !== "string") continue;
      const want = p.name.trim().toLowerCase();
      const m = ctx.members.find((x) => x.id === p.name || (x.name ?? "").toLowerCase() === want);
      if (!m) continue;
      for (const pick of Array.isArray(p.picks) ? p.picks : []) {
        for (const match of [0, 1]) {
          const side = semiTeams(s0, match).findIndex((ti) => teams[ti]!.name === pick);
          if (side >= 0 && !votes.some((v) => v.user === m.id && v.match === match)) votes.push({ user: m.id, match, side });
        }
      }
    }
    return {
      kind,
      title: typeof P.title === "string" ? P.title.trim().slice(0, 48) || "Bracket" : "Bracket",
      left: typeof P.left === "string" ? P.left.trim().slice(0, 16) : "",
      teams,
      quarters,
      base,
      round: 1,
      votes,
      semiWin: [],
      champ: -1,
      closedAt: 0,
    };
  },

  reduce: (state, action, meta, ctx) => reduceBracket(state, action as unknown as Rec, meta, ctx),

  onMembers: (state, ctx) => (state.votes.every((v) => inChat(ctx, v.user)) ? state : { ...state, votes: state.votes.filter((v) => inChat(ctx, v.user)) }),

  invariants: {
    "one vote per person per match": (s, ctx) => new Set(s.votes.map((v) => `${v.user}|${v.match}`)).size === s.votes.length && s.votes.every((v) => (v.side === 0 || v.side === 1) && inChat(ctx, v.user)),
    "votes are only in rounds that opened": (s) => s.votes.every((v) => v.match === 0 || v.match === 1 || (v.match === 2 && s.round >= 2)),
    "results match the round": (s) =>
      s.round === 1 ? s.semiWin.length === 0 && s.champ === -1 : s.round === 2 ? s.semiWin.length === 2 && s.champ === -1 : s.semiWin.length === 2 && s.semiWin.includes(s.champ),
    "semifinal winners came from their semis": (s) => s.semiWin.every((t, m) => semiTeams(s, m).includes(t)),
    "the bracket is eight teams and four winners": (s) => s.teams.length === 8 && s.quarters.length === 4 && s.quarters.every((q) => q === 0 || q === 1),
  },

  transitions: {
    "a vote sets only the actor's side in a live match": (p, n, a, m) =>
      a.t !== "vote" ||
      p === n ||
      (live(p).includes(a.match) &&
        n.votes.some((v) => v.user === m.user && v.match === a.match && v.side === a.side) &&
        JSON.stringify(p.votes.filter((v) => !(v.user === m.user && v.match === a.match))) === JSON.stringify(n.votes.filter((v) => !(v.user === m.user && v.match === a.match)))),
    "closing needs your votes and picks the leader": (p, n, a, m) =>
      a.t !== "close" ||
      p === n ||
      (live(p).every((mm) => p.votes.some((v) => v.user === m.user && v.match === mm)) &&
        n.round === p.round + 1 &&
        n.closedAt === m.time &&
        (p.round !== 1 || (n.semiWin[0] === semiTeams(p, 0)[winner(p, 0)] && n.semiWin[1] === semiTeams(p, 1)[winner(p, 1)])) &&
        (p.round !== 2 || n.champ === p.semiWin[winner(p, 2)])),
    "rounds only move forward and results stay": (p, n) => n.round >= p.round && (p.round === 1 || JSON.stringify(p.semiWin) === JSON.stringify(n.semiWin)) && (p.round < 3 || p.champ === n.champ),
    "the bracket never changes": (p, n) => frozen(p) === frozen(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    if (s.round < 3) {
      if (r.next() < 0.7) return { t: "vote", match: r.pick(live(s)), side: r.int(2) };
      return { t: "close" };
    }
    return { t: "vote", match: 2, side: r.int(2) };
  },

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const s = state;
    const p = pal(theme);
    const name = (t: number) => s.teams[t]?.name ?? "";
    const done = s.round === 3;

    // ---- Food icons, centered on 0,0 in an 8-unit box ----
    // Not food (NBA teams, bands, places): a coloured disc with the entry's initials.
    const DISCS = [p.red, p.blue, p.green, p.orange, p.yellow, p.brown, p.crust, mix(p.blue, p.red, 0.5)];
    const initials = (nm: string, k: number, key: string) => {
      const words = nm.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean);
      const txt = (words.length > 1 ? words[0]![0]! + words[words.length - 1]![0]! : (words[0] ?? "?").slice(0, 2)).toUpperCase();
      return (
        <g key={key}>
          {circle(0, 0, 8, DISCS[k % DISCS.length]!)}
          <text x={0} y={0.5} text-anchor="middle" dominant-baseline="central" font-size={7.4} font-weight={700} fill="#fff" style={{ fontFamily: "inherit" }}>{txt}</text>
        </g>
      );
    };
    const food = (f: Food, key: string) => {
      const g = (kids: unknown) => <g key={key}>{kids as never}</g>;
      switch (f) {
        case "burrito":
          return g(
            <>
              {rect(-6.8, -3.8, 13.6, 7.6, 3, mix(p.tile, p.soft, 0.3), { transform: "rotate(-29)" })}
              {circle(5, -2.7, 3.8, p.cream)}
              {circle(5, -2.7, 2, p.crust)}
            </>,
          );
        case "taco":
          return g(
            <>
              {path("M-8 -0.4A8 8 0 0 0 8 -0.4Z", p.yellow)}
              {circle(-3.2, -0.8, 2.4, p.green)}
              {circle(0.8, -1.6, 2.4, p.red)}
              {circle(4, -0.4, 2, p.green)}
            </>,
          );
        case "donut": {
          const cols = [p.yellow, p.green, p.blue, p.purple];
          return g(
            <>
              {circle(0, 0, 7.6, p.crust)}
              {circle(0, 0, 6.6, mix(p.red, p.card, 0.45))}
              {circle(0, 0, 2.4, p.cream)}
              {Array.from({ length: 8 }, (_, k) => {
                const ang = 0.8 * k;
                return rect(4.8 * Math.cos(ang) - 0.6, 4.8 * Math.sin(ang) - 0.3, 1.2, 0.6, 0.3, cols[k % 4]!, { key: k, transform: `rotate(${((ang * 180) / Math.PI).toFixed(1)} ${(4.8 * Math.cos(ang)).toFixed(2)} ${(4.8 * Math.sin(ang)).toFixed(2)})` });
              })}
            </>,
          );
        }
        case "shake":
          return g(
            <>
              {line(0.8, -4, 3.6, -8.4, p.red, 1.6)}
              {path("M-4.4 -2L4.4 -2L3 7.6L-3 7.6Z", p.purple)}
              {circle(-1.6, -2.8, 2.6, p.cream)}
              {circle(1.6, -3, 2.6, p.cream)}
              {circle(0, -5, 1.4, p.red)}
            </>,
          );
        case "pizza":
          return g(
            <>
              {path("M-6.8 -4.8L6.8 -4.8L0 7.6Z", p.yellow)}
              {line(-6.8, -4.8, 6.8, -4.8, p.crust, 2.2)}
              {circle(-2.4, -1.6, 1.2, p.red)}
              {circle(2.4, -1.2, 1.2, p.red)}
              {circle(0, 2.4, 1.2, p.red)}
            </>,
          );
        case "burger":
          return g(
            <>
              {path("M-7.2 -1.2A7.2 4.8 0 0 1 7.2 -1.2Z", p.crust)}
              {rect(-7.6, -0.4, 15.2, 1.6, 0.8, p.green)}
              {rect(-7.2, 1.4, 14.4, 2.4, 1, p.brown)}
              {rect(-6.8, 4, 13.6, 2.6, 1.3, p.crust)}
            </>,
          );
        case "curry":
          return g(
            <>
              {path("M-2 -3Q-3.5 -4.5 -2 -6T-2 -9", "none", { stroke: p.soft, "stroke-width": 1, opacity: 0.5 })}
              {path("M2 -3Q0.5 -4.5 2 -6T2 -9", "none", { stroke: p.soft, "stroke-width": 1, opacity: 0.5 })}
              {path("M-7.6 -0.4A7.6 6.8 0 0 0 7.6 -0.4Z", p.blue)}
              {line(-7.2, -0.8, 7.2, -0.8, p.orange, 2.4)}
            </>,
          );
        default:
          return g(
            <>
              {[0, 1, 2, 3, 4].map((k) => rect((k - 2) * 2.2 - 0.8, -1.2 - (k % 2 ? 6.4 : 7.2), 1.6, (k % 2 ? 6.4 : 7.2) + 1, 0.5, p.yellow, { key: k }))}
              {path("M-6 -1.2L6 -1.2L4.4 7.2L-4.4 7.2Z", p.red)}
            </>,
          );
      }
    };

    // ---- Tree geometry ----
    const ROW_Y = [14, 47, 80, 112];
    const RAD = [12, 12, 13, 14];
    const px = (k: number, i: number) => 4 + ((i + 0.5) * (W - 8)) / (8 >> k);
    const quarterWin = [0, 1, 2, 3].map((j) => j * 2 + (s.quarters[j] ?? 0));
    const semiNodes = [0, 1].map((m) => s.semiWin[m] ?? -1);
    const cl = confirmed.closedAt;
    const slideE = confirmed.round === 2 && cl ? running(cl, SLIDE_MS + 120) : null;
    const popE = confirmed.round === 3 && cl ? running(cl, POP_AT + popSpring.duration) : null;

    const elbow = (k: number, i: number, hot: boolean) => {
      const x1 = px(k, i), y1 = ROW_Y[k]! + RAD[k]!;
      const x2 = px(k + 1, i >> 1), y2 = ROW_Y[k + 1]! - RAD[k + 1]!;
      const mid = (y1 + y2) / 2;
      return path(`M${x1.toFixed(1)} ${y1}V${mid}H${x2.toFixed(1)}V${y2}`, "none", {
        key: `e${k}-${i}`,
        stroke: hot ? c.primary : c.secondaryText,
        opacity: hot ? 0.7 : 0.35,
        "stroke-width": hot ? 2 : 1.2,
      });
    };
    const connectors: unknown[] = [];
    const hotLines: unknown[] = [];
    for (let i = 0; i < 8; i++) (i % 2 === (s.quarters[i >> 1] ?? 0) ? hotLines : connectors).push(elbow(0, i, i % 2 === (s.quarters[i >> 1] ?? 0)));
    for (let j = 0; j < 4; j++) {
      const hot = s.round >= 2 && s.semiWin[j >> 1] === quarterWin[j];
      (hot ? hotLines : connectors).push(elbow(1, j, hot));
    }
    for (let m = 0; m < 2; m++) {
      const hot = done && s.champ === s.semiWin[m];
      (hot ? hotLines : connectors).push(elbow(2, m, hot));
    }

    const node = (k: number, i: number, team: number, ringOn: boolean, loser: boolean, at?: { x: number; y: number; scale?: number }) => {
      const x = at ? at.x : px(k, i), y = at ? at.y : ROW_Y[k]!, r = RAD[k]!;
      const sc = (at?.scale ?? 1);
      return (
        <g key={`n${k}-${i}`}>
          {circle(x, y, (r + 1.5) * sc, ringOn ? c.primary : c.secondaryText, ringOn ? {} : { opacity: 0.25 })}
          {circle(x, y, r * sc, c.wash)}
          {sc > 0 ? (
            <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${((r * 0.62 * sc) / 8).toFixed(3)})`}>{(s.kind === "initials" ? initials(s.teams[team]!.name, team, `f${k}-${i}`) : food(s.teams[team]!.food, `f${k}-${i}`)) as never}</g>
          ) : null}
          {loser ? circle(x, y, r * sc, c.card, { opacity: 0.62 }) : null}
        </g>
      );
    };
    const unknown = (k: number, i: number) => {
      const f = fitText("?", 20, { size: 13, weight: 700 });
      const x = px(k, i), y = ROW_Y[k]!;
      return (
        <g key={`q${k}-${i}`}>
          {circle(x, y, RAD[k]! + 1.5, c.secondaryText, { opacity: 0.25 })}
          {circle(x, y, RAD[k]!, c.wash)}
          <text x={x} y={y + 4.5} style={{ textAnchor: "middle", fontSize: f.size, fontWeight: 700 }} fill={c.secondaryText}>
            {f.text}
          </text>
        </g>
      );
    };

    const nodes: unknown[] = [];
    for (let i = 0; i < 8; i++) nodes.push(node(0, i, i, false, i % 2 !== (s.quarters[i >> 1] ?? 0)));
    for (let j = 0; j < 4; j++) nodes.push(node(1, j, quarterWin[j]!, s.round === 1, s.round >= 2 && s.semiWin[j >> 1] !== quarterWin[j]));
    for (let m = 0; m < 2; m++) {
      if (s.round === 1) nodes.push(unknown(2, m));
      else {
        const e = slideE === null ? null : Math.max(0, slideE - m * 120);
        const t = e === null ? 1 : slide(Math.min(e, SLIDE_MS));
        const fromX = px(1, m * 2 + (s.semiWin[m] === quarterWin[m * 2] ? 0 : 1));
        nodes.push(node(2, m, s.semiWin[m]!, s.round === 2, done && s.champ !== s.semiWin[m], { x: fromX + (px(2, m) - fromX) * t, y: ROW_Y[1]! + (ROW_Y[2]! - ROW_Y[1]!) * t }));
      }
    }
    const champX = px(3, 0);
    if (done) {
      const sc = popE === null ? 1 : popE < POP_AT ? 0 : popSpring(popE - POP_AT);
      nodes.push(node(3, 0, s.champ, true, false, { x: champX, y: ROW_Y[3]!, scale: Math.max(0, sc) }));
    } else nodes.push(unknown(3, 0));

    const treeLabel = done ? `Bracket: ${name(s.champ)} is the champ` : s.round === 2 ? `Bracket: ${name(s.semiWin[0]!)} vs ${name(s.semiWin[1]!)} in the final` : `Bracket: ${[0, 1].map((m) => `${name(semiTeams(s, m)[0]!)} vs ${name(semiTeams(s, m)[1]!)}`).join(", ")}`;
    const champName = fitText(name(s.champ), Math.max(40, W - champX - 30 - 4), { size: 15, weight: 700 });

    const tree = (
      <Scene height={128} label={treeLabel} art={<g>{connectors as never}{hotLines as never}{nodes as never}</g>}>
        {done ? (
          <div style={{ position: "absolute", left: champX + 30, top: ROW_Y[3]! - 10, maxWidth: W - champX - 34, fontSize: champName.size, lineHeight: "20px", fontWeight: 700, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>
            {name(s.champ)}
          </div>
        ) : (
          <div style={{ position: "absolute", left: champX + 22, top: ROW_Y[3]! - 9, fontSize: 13, lineHeight: "18px", color: c.secondaryText, pointerEvents: "none" }}>Champ</div>
        )}
      </Scene>
    );

    // ---- Matchups ----
    const liveMatches = live(s);
    const allVoted = liveMatches.length > 0 && liveMatches.every((m) => voted(s, me, m));
    const finalTally = tally(s, 2);
    const total = finalTally[0] + finalTally[1];
    const label =
      s.round === 1
        ? "Semifinals · pick both"
        : s.round === 2
          ? finalTally[0] === finalTally[1]
            ? `Final · tied ${finalTally[0]}–${finalTally[1]}, your vote breaks it`
            : "Final · pick one"
          : "Final · decided";
    const subtitle = s.round === 1 ? (s.left ? `Semis · ${s.left}` : "Semis") : s.round === 2 ? "Final · live" : `Final · ${total} votes`;

    const rows = (m: number) => {
      const t = tally(s, m);
      return [0, 1].map((side) => {
        const ids = s.votes.filter((v) => v.match === m && v.side === side).map((v) => v.user);
        const mine = ids.includes(me);
        const ordered = mine ? [me, ...ids.filter((x) => x !== me)] : ids;
        const click = done ? {} : { onClick: () => dispatch({ t: "vote", match: m, side }) };
        return (
          <OptionRow key={`${m}-${side}`} label={name(sides(s, m)[side]!)} count={t[side]!} total={t[0] + t[1]} voters={ordered} selected={mine} {...click} />
        );
      });
    };
    const riseE = confirmed.round === 2 && cl ? running(cl, 400) : null;
    const riseT = riseE === null ? 1 : rise(riseE);

    return (
      <div>
        <CardHeader title={s.title} subtitle={subtitle} />
        {tree}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 24 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{label}</span>
          {allVoted ? (
            <Button
              kind="primary"
              onClick={() => {
                haptic("success");
                dispatch({ t: "close" });
              }}
            >
              {s.round === 1 ? "Start final" : "Crown champ"}
            </Button>
          ) : null}
        </div>
        <div style={{ opacity: riseT, transform: `translateY(${((1 - riseT) * 16).toFixed(1)}px)` }}>
          {s.round === 1 ? (
            <>
              {rows(0)}
              <div style={{ height: 1, margin: "0 0 0 36px", background: c.divider }} />
              {rows(1)}
            </>
          ) : (
            rows(2)
          )}
        </div>
        {done ? (
          <div style={{ marginTop: 8, fontSize: 15, lineHeight: "20px", fontWeight: 700, color: c.text }}>{`${name(s.champ)} is the champ.`}</div>
        ) : null}
        {done && confirmed.round === 3 && cl && running(cl, 2400) !== null ? <Toast key={cl}>{`${name(s.champ)} is the champ`}</Toast> : null}
      </div>
    );
  },
});
