import { defineApp, Avatar, Button, CardHeader, Facepile, Toast, clock, haptic, innerWidth, mix, pal, rng, running, seedOf, tween, userColor, type Ctx, type Member } from "@muse/app";

// Club ballot: the candidates are climbers at the foot of three bouldering walls. Members tap the
// walls in order (1st, 2nd, 3rd) and drop the ranked slip into the box. When someone closes the
// vote, the count plays as a climb: everyone rises by first choices, the lowest climber drops off
// the wall and their slips fly to the next choice, until somebody tops out past half.

type Params = {
  /** Card title */
  title: string;
  /** Club name, e.g. 'Eastfield Climbing Club' */
  club: string;
  /** Members in the whole group, e.g. 212 */
  members: number;
  /** The office being elected, e.g. 'President' */
  role: string;
  /** When voting closes, as said: 'Fri 6pm' */
  closes: string;
  /** 2 to 4 candidates with a one-line pitch in their words */
  candidates: { name: string; pitch: string }[];
  /** Ballots already in from members outside this chat: a ranking by candidate name and how many */
  outside: { rank: string[]; n: number }[];
  /** Chat friends who already voted: their ranking (kept secret in the view) and what they said */
  voted: { name: string; rank: string[]; said?: string }[];
};

// @params
const P: Params = {
  title: "Climbing club election",
  club: "Eastfield Climbing Club",
  members: 212,
  role: "President",
  closes: "Fri 6pm",
  candidates: [
    { name: "Priya", pitch: "more weeknight sessions" },
    { name: "Jonah", pitch: "a real trip to the Gunks" },
    { name: "Calvin", pitch: "7am bouldering. I have the alarms" },
  ],
  outside: [
    { rank: ["Priya", "Jonah", "Calvin"], n: 14 }, { rank: ["Priya", "Calvin", "Jonah"], n: 6 },
    { rank: ["Jonah", "Priya", "Calvin"], n: 12 }, { rank: ["Jonah", "Calvin", "Priya"], n: 7 }, { rank: ["Jonah"], n: 3 },
    { rank: ["Calvin", "Priya", "Jonah"], n: 6 }, { rank: ["Calvin", "Jonah", "Priya"], n: 7 },
  ],
  voted: [
    { name: "Tsai Lin", rank: ["Jonah", "Priya", "Calvin"], said: "jonah promised me the aux on the drive" },
    { name: "Arun", rank: ["Priya", "Jonah"], said: "weeknights = rice cooker dinners after" },
    { name: "Will", rank: ["Jonah", "Calvin", "Priya"], said: "gunks or bust. the sube fits 4" },
    { name: "Maya", rank: ["Priya", "Calvin", "Jonah"], said: "I made a spreadsheet of all three platforms" },
  ],
};
// @end params

type Cand = { name: string; pitch: string };
type Ballot = { rank: number[]; at: number };
type State = {
  title: string; club: string; members: number; role: string; closes: string;
  cands: Cand[];
  outside: { rank: number[]; n: number }[];
  ballots: { [user: string]: Ballot };
  said: { [user: string]: string };
  closed: boolean; closedAt: number; closer: string;
};
type Action = { t: "cast"; rank: number[] } | { t: "close" };
type Local = { rank: number[]; editing: boolean; replay: number };
type Round = { tally: number[]; out: number; win: number; active: number };

const STEP = 1700;
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const validRank = (r: unknown, n: number): r is number[] =>
  Array.isArray(r) && r.length >= 1 && r.length <= n && r.every((x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x < n) && new Set(r).size === r.length;
const total = (s: State) => s.outside.reduce((a, b) => a + b.n, 0) + Object.keys(s.ballots).length;
const ease = tween({ duration: 1000, easing: "easeInOut" });
const slip = tween({ duration: 700, easing: "decelerate" });

function rounds(s: State): Round[] {
  const all = [...s.outside, ...Object.values(s.ballots).map((b) => ({ rank: b.rank, n: 1 }))];
  const n = s.cands.length;
  const gone = new Set<number>();
  const out: Round[] = [];
  for (let k = 0; k < n; k++) {
    const tally = s.cands.map(() => 0);
    for (const b of all) {
      const top = b.rank.find((c) => !gone.has(c));
      if (top !== undefined) tally[top]! += b.n;
    }
    const active = tally.reduce((a, b) => a + b, 0);
    const alive = s.cands.map((_c, i) => i).filter((c) => !gone.has(c));
    let win = alive.find((c) => tally[c]! * 2 > active) ?? -1;
    if (win < 0 && alive.length === 1 && active > 0) win = alive[0]!;
    if (win >= 0 || active === 0 || alive.length <= 1) {
      out.push({ tally, out: -1, win, active });
      break;
    }
    let lo = alive[0]!;
    for (const c of alive) if (tally[c]! < tally[lo]! || (tally[c] === tally[lo] && c > lo)) lo = c;
    out.push({ tally, out: lo, win: -1, active });
    gone.add(lo);
  }
  return out;
}

function initState(ctx: Ctx): State {
  const cands: Cand[] = [];
  for (const c of Array.isArray(P.candidates) ? P.candidates : []) {
    const name = clean(c?.name, 18);
    if (name && cands.length < 4 && !cands.some((x) => x.name.toLowerCase() === name.toLowerCase())) cands.push({ name, pitch: clean(c.pitch, 60) });
  }
  while (cands.length < 2) cands.push({ name: cands.length ? "Someone else" : "Write-in", pitch: "" });
  const idx = (r: unknown) => {
    const out: number[] = [];
    for (const nm of Array.isArray(r) ? r : []) {
      const k = cands.findIndex((c) => c.name.toLowerCase() === clean(nm, 18).toLowerCase());
      if (k >= 0 && !out.includes(k)) out.push(k);
    }
    return out;
  };
  const outside: { rank: number[]; n: number }[] = [];
  for (const o of Array.isArray(P.outside) ? P.outside : []) {
    const rank = idx(o?.rank);
    const n = typeof o?.n === "number" && Number.isInteger(o.n) ? Math.max(0, Math.min(5000, o.n)) : 0;
    if (rank.length && n > 0 && outside.length < 24) outside.push({ rank, n });
  }
  const ballots: { [u: string]: Ballot } = {};
  const said: { [u: string]: string } = {};
  for (const v of Array.isArray(P.voted) ? P.voted : []) {
    const want = clean(v?.name, 40).toLowerCase();
    const m = ctx.members.find((x) => x.id === v?.name || x.name.toLowerCase() === want);
    const rank = idx(v?.rank);
    if (!m || !rank.length || ballots[m.id]) continue;
    ballots[m.id] = { rank, at: 0 };
    const q = clean(v.said, 70);
    if (q) said[m.id] = q;
  }
  const members = typeof P.members === "number" && Number.isInteger(P.members) ? Math.max(1, Math.min(1_000_000, P.members)) : 1;
  const s: State = {
    title: clean(P.title, 40) || "Club election", club: clean(P.club, 40), members, role: clean(P.role, 24), closes: clean(P.closes, 20),
    cands, outside, ballots, said, closed: false, closedAt: 0, closer: "",
  };
  return { ...s, members: Math.max(s.members, total(s)) };
}

export default defineApp<State, Action, Local>({
  name: "Club ballot",
  summary: (s) => {
    if (s.closed) {
      const r = rounds(s);
      const last = r[r.length - 1];
      const w = last && last.win >= 0 ? s.cands[last.win]!.name : "";
      return w ? `${w} wins ${s.role ? `the ${s.role.toLowerCase()} vote` : "the vote"} · ${total(s)} ballots` : `Vote closed · ${total(s)} ballots`;
    }
    return `${s.title} · ${total(s)} of ${s.members} voted`;
  },

  init: initState,

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user) || s.closed) return s;
    if (a.t === "cast") {
      if (!validRank(a.rank, s.cands.length)) return s;
      const prev = s.ballots[m.user];
      if (prev && same(prev.rank, a.rank)) return s;
      return { ...s, ballots: { ...s.ballots, [m.user]: { rank: [...a.rank], at: m.time } } };
    }
    if (a.t === "close") {
      if (total(s) === 0) return s;
      return { ...s, closed: true, closedAt: m.time, closer: m.user };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    if (s.closed) return s;
    const keep = Object.keys(s.ballots).filter((u) => inChat(ctx, u));
    if (keep.length === Object.keys(s.ballots).length && Object.keys(s.said).every((u) => inChat(ctx, u))) return s;
    return {
      ...s,
      ballots: Object.fromEntries(keep.map((u) => [u, s.ballots[u]!])),
      said: Object.fromEntries(Object.entries(s.said).filter(([u]) => inChat(ctx, u))),
    };
  },

  invariants: {
    "every ballot ranks real candidates once each": (s) => Object.values(s.ballots).every((b) => validRank(b.rank, s.cands.length) && typeof b.at === "number"),
    "outside ballots are valid and counted": (s) => s.outside.every((o) => validRank(o.rank, s.cands.length) && Number.isInteger(o.n) && o.n > 0),
    "open ballots come from the chat": (s, ctx) => s.closed || (Object.keys(s.ballots).every((u) => inChat(ctx, u)) && Object.keys(s.said).every((u) => inChat(ctx, u))),
    "a closed vote has a closer and ballots": (s) => (s.closed ? s.closer !== "" && total(s) > 0 : s.closer === "" && s.closedAt === 0),
    "two to four candidates": (s) => s.cands.length >= 2 && s.cands.length <= 4,
    "a winner has more than half or is last standing": (s) => {
      const r = rounds(s);
      return r.every((x) => x.win < 0 || x.tally[x.win]! * 2 > x.active || x.tally.filter((t) => t > 0).length <= 1);
    },
  },

  transitions: {
    "only chat members change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "a closed vote never changes": (p, n) => !p.closed || p === n,
    "candidates and outside ballots never change": (p, n) => JSON.stringify([p.cands, p.outside]) === JSON.stringify([n.cands, n.outside]),
    "casting sets exactly the actor's ballot": (p, n, a, m) => {
      if (a.t !== "cast" || p === n) return true;
      const b = n.ballots[m.user];
      const others = (s: State) => JSON.stringify(Object.entries(s.ballots).filter(([u]) => u !== m.user).sort());
      return !!b && same(b.rank, a.rank) && b.at === m.time && others(p) === others(n) && !n.closed;
    },
    "a fresh valid ballot is never dropped": (p, n, a, m, ctx) => {
      if (a.t !== "cast" || p !== n) return true;
      const ok = inChat(ctx, m.user) && !p.closed && validRank(a.rank, p.cands.length) && !(p.ballots[m.user] && same(p.ballots[m.user]!.rank, a.rank));
      return !ok;
    },
    "closing stamps the actor and keeps the ballots": (p, n, a, m, ctx) => {
      if (a.t !== "close") return p.closed === n.closed;
      const ok = inChat(ctx, m.user) && !p.closed && total(p) > 0;
      if (p === n) return !ok;
      return ok && n.closed && n.closer === m.user && n.closedAt === m.time && JSON.stringify(n.ballots) === JSON.stringify(p.ballots);
    },
  },

  arbitrary: (s, _u, r) => {
    if (r.next() < 0.12) return { t: "close" };
    const order = r.shuffle(s.cands.map((_c, i) => i));
    return { t: "cast", rank: order.slice(0, 1 + r.int(order.length)) };
  },

  local: { rank: [], editing: false, replay: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = Math.min(innerWidth(), theme.width - 24);
    const n = state.cands.length;
    const gap = 8;
    const ww = (W - gap * (n - 1)) / n;
    const WH = W < 340 ? 136 : 158;
    const TOP = 26;
    const BASE = WH - 44;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const faceOf = (cd: Cand): string | Member => members.find((m) => m.name.toLowerCase() === cd.name.toLowerCase())?.id ?? { id: `c:${cd.name}`, name: cd.name };
    const mine = state.ballots[me];
    const drafting = !state.closed && (!mine || local.editing);
    const shownRank = drafting ? local.rank : (mine?.rank ?? []);
    const tot = total(state);
    const maj = Math.floor(tot / 2) + 1;

    // Count playback (from confirmed only; replay is local).
    const R = state.closed ? rounds(state) : [];
    const start = local.replay > 0 ? local.replay : confirmed.closed ? confirmed.closedAt : 0;
    const span = R.length * STEP;
    const e = state.closed && start > 0 ? running(start, span + 200) : null;
    const t = !state.closed ? 0 : e === null ? R.length : Math.min(R.length, e / STEP);
    const k = Math.min(R.length - 1, Math.floor(t));
    const f = state.closed ? (e === null ? 1 : ease(Math.min(1000, (t - k) * STEP))) : 0;
    const shown = (ci: number) => {
      if (!state.closed || k < 0) return 0;
      const now = R[k]!.tally[ci]!;
      const was = k > 0 ? R[k - 1]!.tally[ci]! : 0;
      return was + (now - was) * f;
    };
    const outAt = (ci: number) => R.findIndex((r) => r.out === ci);
    const isOut = (ci: number) => state.closed && outAt(ci) >= 0 && outAt(ci) < k;
    const last = R[R.length - 1];
    const winner = state.closed && last && t >= R.length - 0.05 ? last.win : -1;
    const roundMaj = state.closed && R[k] ? Math.floor(R[k]!.active / 2) + 1 : maj;

    const xOf = (i: number) => i * (ww + gap);
    const yOf = (ci: number) => BASE - Math.min(1, shown(ci) / Math.max(1, roundMaj)) * (BASE - TOP - 6);

    const walls = state.cands.map((cd, i) => {
      const x = xOf(i);
      const q = rng(seedOf(`wall:${cd.name}`));
      const holds = Array.from({ length: 11 }, (_v, j) => {
        const hx = x + 10 + q.next() * (ww - 20);
        const hy = TOP + 6 + (j / 11) * (BASE - TOP + 4) + q.next() * 8;
        const hue = [p.red, p.blue, p.green, p.yellow, p.purple, p.orange][q.int(6)]!;
        const rx = 4 + q.next() * 4;
        return { hx, hy, hue, rx, ry: 3 + q.next() * 3, rot: q.int(180) };
      });
      return { cd, x, holds };
    });

    const climber = (i: number) => {
      const cx = xOf(i) + ww / 2;
      const y = yOf(i);
      const out = isOut(i);
      const col = out ? c.disabledText : userColor(typeof faceOf(state.cands[i]!) === "string" ? (faceOf(state.cands[i]!) as string) : `c:${state.cands[i]!.name}`, theme);
      return (
        <g key={`cl${i}`}>
          <line x1={cx} y1={TOP - 12} x2={cx} y2={y + 14} stroke={out ? c.disabledText : p.red} stroke-width={2} />
          <path d={`M${cx} ${y + 4} L${cx} ${y + 20} M${cx} ${y + 6} L${cx - 13} ${y - 4} M${cx} ${y + 6} L${cx + 13} ${y + 2} M${cx} ${y + 20} L${cx - 9} ${y + 32} M${cx} ${y + 20} L${cx + 10} ${y + 28}`}
            stroke={col} stroke-width={4} stroke-linecap="round" fill="none" />
          <rect x={cx - 5} y={y + 13} width={10} height={5} rx={2} fill={p.dark} />
        </g>
      );
    };

    // Slips flying from an eliminated climber to the next choices, during the round they move.
    const flying: { x: number; y: number }[] = [];
    if (state.closed && k >= 1 && f < 1 && R[k - 1]!.out >= 0) {
      const from = R[k - 1]!.out;
      const fx = xOf(from) + ww / 2;
      const fy = BASE - 10;
      state.cands.forEach((_cd, ci) => {
        if (ci === from) return;
        const gain = R[k]!.tally[ci]! - R[k - 1]!.tally[ci]!;
        for (let j = 0; j < Math.min(5, gain); j++) {
          const g = Math.max(0, Math.min(1, f * 1.4 - j * 0.08));
          const tx = xOf(ci) + ww / 2 + (j - 2) * 6;
          const ty = yOf(ci) + 10;
          flying.push({ x: fx + (tx - fx) * g, y: fy + (ty - fy) * g - Math.sin(g * Math.PI) * 40 });
        }
      });
    }

    const tapWall = (i: number) => {
      if (state.closed) return;
      haptic("light");
      if (!drafting) return setLocal({ editing: true, rank: [i] });
      const r = local.rank.includes(i) ? local.rank.slice(0, local.rank.indexOf(i)) : [...local.rank, i];
      setLocal({ rank: r });
    };

    const ord = ["1st", "2nd", "3rd", "4th"];
    const picture = (
      <div style={{ position: "relative", height: WH }}>
        <svg width={W} height={WH} viewBox={`0 0 ${W} ${WH}`} role="img" aria-label={state.closed ? `Count in ${R.length} rounds` : `${n} candidates on ${n} walls`} style={{ display: "block" }}>
          {walls.map((w) => (
            <g key={w.cd.name}>
              <rect x={w.x} y={0} width={ww} height={WH} rx={12} fill={p.wall} />
              {w.holds.map((h, j) => (
                <ellipse key={j} cx={h.hx} cy={h.hy} rx={h.rx} ry={h.ry} fill={h.hue} transform={`rotate(${h.rot} ${h.hx} ${h.hy})`} />
              ))}
              <rect x={w.x + 8} y={WH - 14} width={ww - 16} height={9} rx={3} fill={mix(p.blue, c.card, 0.35)} />
              <circle cx={w.x + ww / 2} cy={TOP - 12} r={4} fill="none" stroke={p.dark} stroke-width={2} />
            </g>
          ))}
          <line x1={4} y1={TOP} x2={W - 4} y2={TOP} stroke={c.secondaryText} stroke-width={1.5} stroke-dasharray="5 4" />
          {state.cands.map((_cd, i) => climber(i))}
                    {flying.map((s, j) => (
            <rect key={j} x={s.x - 5} y={s.y - 3.5} width={10} height={7} rx={1.5} fill={c.card} stroke={c.secondaryText} stroke-width={1} />
          ))}
        </svg>
        {state.cands.map((cd, i) => {
          const cx = xOf(i) + ww / 2;
          const y = yOf(i);
          const r = shownRank.indexOf(i);
          const count = Math.round(shown(i));
          return (
            <div key={cd.name}>
              <span style={{ position: "absolute", left: cx - 13, top: y - 22, display: "flex", borderRadius: 99, boxShadow: winner === i ? `0 0 0 3px ${p.yellow}` : `0 0 0 2px ${c.card}`, filter: isOut(i) ? "grayscale(1)" : undefined, pointerEvents: "none" }}>
                <Avatar user={faceOf(cd)} size={26} />
              </span>
              {state.closed ? (
                <span style={{ position: "absolute", left: cx + 14, top: y - 20, padding: "1px 7px", borderRadius: 99, background: winner === i ? c.positive : c.card, color: winner === i ? c.onPrimary : c.text, fontSize: 13, fontWeight: 700, lineHeight: "18px", pointerEvents: "none" }}>
                  {isOut(i) ? "Out" : count}
                </span>
              ) : null}
              {r >= 0 && !state.closed ? (
                <span style={{ position: "absolute", left: xOf(i) + 6, top: 6, padding: "0 8px", height: 24, borderRadius: 99, background: c.primary, color: c.onPrimary, fontSize: 13, fontWeight: 700, lineHeight: "24px", pointerEvents: "none" }}>{ord[r]}</span>
              ) : null}
              {!state.closed ? (
                <button type="button" aria-label={r >= 0 ? `Unrank ${cd.name}` : `Rank ${cd.name} ${ord[drafting ? local.rank.length : 0]}`} onClick={() => tapWall(i)}
                  style={{ position: "absolute", left: xOf(i), top: 0, width: ww, height: WH, padding: 0, border: 0, borderRadius: 12, background: "transparent", cursor: "pointer", boxShadow: r >= 0 ? `inset 0 0 0 2px ${c.primary}` : "none" }} />
              ) : null}
            </div>
          );
        })}
        <span style={{ position: "absolute", right: 6, top: TOP - 9, padding: "0 6px", borderRadius: 99, background: c.card, color: c.secondaryText, fontSize: 11, fontWeight: 600, lineHeight: "16px", pointerEvents: "none" }}>
          {`Half · ${roundMaj}`}
        </span>
      </div>
    );

    const names = (
      <div style={{ display: "flex", gap, marginTop: 6 }}>
        {state.cands.map((cd) => (
          <div key={cd.name} style={{ width: ww, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: "18px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cd.name}</div>
            <div style={{ fontSize: 12, lineHeight: "15px", minHeight: 30, color: c.secondaryText, overflowWrap: "break-word" }}>{cd.pitch ? `"${cd.pitch}"` : ""}</div>
          </div>
        ))}
      </div>
    );

    // The ballot box: a clear front fills with slips as turnout grows; my slip drops in when cast.
    const fill = Math.min(1, tot / Math.max(1, state.members));
    const myAt = confirmed.ballots[me]?.at ?? 0;
    const drop = myAt > 0 ? running(myAt, 700) : null;
    const box = (
      <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
        <svg width={56} height={56} viewBox="0 0 56 56" aria-hidden="true">
          <rect x={6} y={14} width={44} height={38} rx={4} fill={p.brown} />
          <rect x={11} y={20} width={34} height={28} rx={2} fill={c.wash} />
          {Array.from({ length: Math.min(9, 3 + Math.round(fill * 6)) }, (_v, j) => (
            <rect key={j} x={13 + (j % 3) * 9} y={44 - Math.floor(j / 3) * 6 - (j % 2) * 2} width={12} height={5} rx={1} fill={j % 2 ? c.card : p.cream} stroke={c.secondaryText} stroke-width={0.6} transform={`rotate(${(j % 3) * 9 - 9} ${19 + (j % 3) * 9} ${46 - Math.floor(j / 3) * 6})`} />
          ))}
          <rect x={4} y={10} width={48} height={6} rx={2} fill={mix(p.brown, c.text, 0.2)} />
          <rect x={18} y={12} width={20} height={2} rx={1} fill={p.dark} />
          {drop !== null ? <rect x={21} y={-6 + 18 * slip(drop)} width={14} height={10} rx={1.5} fill={c.card} stroke={c.primary} stroke-width={1.2} /> : null}
        </svg>
      </div>
    );

    let main;
    let line1: string;
    let line2: string;
    if (state.closed) {
      const playing = winner < 0 && e !== null;
      const lastR = R[R.length - 1];
      const firstOut = R.find((r) => r.out >= 0);
      line1 = playing ? `Counting · round ${k + 1}` : winner >= 0 ? state.role ? `${state.cands[winner]!.name} is ${state.role.toLowerCase()}` : `${state.cands[winner]!.name} wins` : "No majority";
      line2 = playing
        ? `${tot} ballots · half is ${roundMaj}`
        : winner >= 0 && lastR
          ? `${lastR.tally[winner]} of ${lastR.active} in round ${R.length}${firstOut ? ` · ${state.cands[firstOut.out]!.name} out first` : ""}`
          : `${tot} ballots`;
      main = <Button kind="deemphasized" onClick={() => setLocal({ replay: clock.value })}>Replay</Button>;
    } else if (drafting) {
      line1 = local.rank.length ? local.rank.map((i, j) => `${j + 1} ${state.cands[i]!.name}`).join(" · ") : "Tap the walls in order";
      line2 = local.rank.length ? `${local.rank.length < n ? "Rank more or drop it in" : "Ready to drop in"}` : `${tot} of ${state.members} voted${state.closes ? ` · closes ${state.closes}` : ""}`;
      main = (
        <Button kind="primary" disabled={!local.rank.length} onClick={() => {
          dispatch({ t: "cast", rank: local.rank });
          setLocal({ rank: [], editing: false });
          haptic("success");
        }}>Drop it in</Button>
      );
    } else {
      line1 = "Your ballot is in";
      line2 = `${tot} of ${state.members} voted${state.closes ? ` · closes ${state.closes}` : ""}`;
      main = <Button kind="secondary" onClick={() => dispatch({ t: "close" })}>Close and count</Button>;
    }

    const voters = members.filter((m) => state.ballots[m.id]).map((m) => m.id);
    const quoted = [...voters].reverse().find((u) => state.said[u] && u !== me);
    const toast = myAt > 0 && running(myAt, 2400) !== null && !state.closed ? myAt : null;

    return (
      <div>
        <CardHeader title={state.title} subtitle={[state.club, state.role ? `${state.role} vote` : "", `${state.members} members`].filter(Boolean).join(" · ")} />
        <div style={{ height: 4 }} />
        {picture}
        {names}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, minHeight: 56 }}>
          {box}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line1}</div>
            <div style={{ fontSize: 13, lineHeight: "17px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line2}</div>
          </div>
          {main}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, marginTop: 4, minWidth: 0 }}>
          {voters.length ? <Facepile users={voters} max={4} size={18} /> : null}
          <span style={{ fontSize: 13, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {quoted ? `${nameOf(quoted)}: "${state.said[quoted]}"` : voters.length ? `${voters.map(nameOf).join(", ")} voted` : "Nobody here has voted yet · ballots are secret"}
          </span>
        </div>
        {toast ? <Toast key={toast}>{`Ballot in · ${tot} of ${state.members} voted`}</Toast> : null}
      </div>
    );
  },
});
