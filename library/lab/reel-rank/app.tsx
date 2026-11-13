import {
  defineApp,
  Avatar,
  Button,
  CardHeader,
  More,
  Thumb,
  Toast,
  clock,
  crowd,
  fitText,
  haptic,
  mix,
  pal,
  running,
  thumbKind,
  tween,
  userColor,
  type Child,
  type Ctx,
  type Member,
  type Theme,
} from "@muse/app";

// The reels the group shared this week, ranked live by laughs. Tap the laugh on your favorite and
// it overtakes the row above; then turn the top five into a watch party tonight.

type Kind = "roomba" | "backflip" | "stairs" | "pasta" | "mic" | "plain";
type Params = {
  /** Card title: "This week's reels, ranked" */
  title: string;
  /** The group chat's name */
  chat: string;
  /** 2 to 6 reels. count: laughs before the chat joined in. last: who laughed most recently. */
  reels: { title: string; by: string; kind: Kind; count: number; last: string }[];
  /** The watch party the top reels turn into */
  party: { when: string; where: string; treat: string };
};

// @params
const P: Params = {
  title: "This week's reels, ranked", chat: "the unit",
  reels: [
    { title: "cat rides roomba into the pool", by: "Theo", kind: "roomba", count: 41, last: "" },
    { title: "Kev's backflip attempt #4", by: "Sam", kind: "backflip", count: 46, last: "Ana" },
    { title: "golden retriever vs. stairs", by: "Jess", kind: "stairs", count: 37, last: "Priya" },
    { title: "dining hall pasta hack", by: "Ana", kind: "pasta", count: 25, last: "Kev" },
    { title: "prof drops the mic (literally)", by: "Leo", kind: "mic", count: 24, last: "Dani" },
  ],
  party: { when: "9pm tonight", where: "Theo's room", treat: "Popcorn's on Theo" },
};
// @end params

type Reel = { id: string; title: string; by: string; kind: Kind; base: number; last: string };
type State = {
  title: string;
  chat: string;
  reels: Reel[];
  when: string;
  where: string;
  treat: string;
  /** reel id to member id to laughs (1 to 9) */
  laughs: Record<string, Record<string, number>>;
  /** The latest 12 laughs, oldest first. */
  bumps: { reel: string; u: string; at: number }[];
  party: { at: number; by: string; going: string[] } | null;
};
type Action = { t: "laugh"; reel: string } | { t: "party" } | { t: "going" };
type Local = { toasts: number };

const KINDS: Kind[] = ["roomba", "backflip", "stairs", "pasta", "mic", "plain"];
const ROW = 62;
const PITCH = 70;
const MOVE = tween({ duration: 600, easing: "decelerate" });
const GROW = tween({ duration: 400, easing: [0.34, 1.56, 0.64, 1] });

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const sum = (r: Record<string, number> | undefined) => Object.values(r ?? {}).reduce((a, b) => a + b, 0);
const score = (s: State, id: string) => (s.reels.find((r) => r.id === id)?.base ?? 0) + sum(s.laughs[id]);
const orderOf = (s: State, adjust?: { reel: string }) => {
  const sc = (r: Reel, i: number) => ({ id: r.id, i, n: score(s, r.id) - (adjust?.reel === r.id ? 1 : 0) });
  return s.reels.map(sc).sort((a, b) => b.n - a.n || a.i - b.i).map((x) => x.id);
};
const totalOf = (s: State) => s.reels.reduce((a, r) => a + score(s, r.id), 0);
const frac = (x: number) => x - Math.floor(x);

function initState(): State {
  const reels: Reel[] = [];
  for (const r of P.reels) {
    if (reels.length >= 6) break;
    const title = clean(r.title, 40);
    if (!title) continue;
    const count = Number.isInteger(r.count) && r.count >= 0 && r.count <= 9999 ? r.count : 0;
    reels.push({ id: `r${reels.length}`, title, by: clean(r.by, 24), kind: KINDS.includes(r.kind) ? r.kind : "plain", base: count, last: clean(r.last, 14) });
  }
  return {
    title: clean(P.title, 40) || "This week's reels, ranked",
    chat: clean(P.chat, 20),
    reels,
    when: clean(P.party.when, 20),
    where: clean(P.party.where, 40),
    treat: clean(P.party.treat, 32),
    laughs: {},
    bumps: [],
    party: null,
  };
}

function Laugh({ s }: { s: number }) {
  const c = s / 2;
  const p = pal();
  const eye = (k: number) => `${c + k * 0.25 * s},${c - 0.16 * s} ${c + k * 0.13 * s},${c - 0.09 * s} ${c + k * 0.25 * s},${c - 0.03 * s}`;
  const r = 0.24 * s;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" style={{ display: "block" }}>
      <circle cx={c} cy={c} r={0.5 * s} fill={p.yellow} />
      <polyline points={eye(-1)} fill="none" stroke={p.brown} stroke-width={Math.max(1, 0.06 * s)} stroke-linecap="round" stroke-linejoin="round" />
      <polyline points={eye(1)} fill="none" stroke={p.brown} stroke-width={Math.max(1, 0.06 * s)} stroke-linecap="round" stroke-linejoin="round" />
      <path d={`M ${c - r} ${c + 0.06 * s} A ${r} ${r} 0 0 0 ${c + r} ${c + 0.06 * s} Z`} fill={mix(p.red, p.dark, 0.5)} />
    </svg>
  );
}

function Clip({ kind, id, title, t, theme }: { kind: Kind; id: string; title: string; t: number; theme: Theme }) {
  const p = pal(theme);
  const cx = 15, cy = 26;
  const grad = (a: string, b: string) => (
    <>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={a} />
          <stop offset="1" stop-color={b} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={30} height={52} fill={`url(#g-${id})`} />
    </>
  );
  let body: Child = null;
  if (kind === "roomba") {
    const b = 2 * Math.sin(3 * t);
    body = (
      <>
        {grad(p.sky, p.blue)}
        <ellipse cx={cx} cy={cy + 8 + b} rx={11} ry={4} fill={mix(p.ink, p.tile, 0.6)} />
        <circle cx={cx - 4} cy={cy - 3 + b} r={2.5} fill={p.orange} />
        <circle cx={cx + 4} cy={cy - 3 + b} r={2.5} fill={p.orange} />
        <circle cx={cx} cy={cy + 1 + b} r={6} fill={p.orange} />
      </>
    );
  } else if (kind === "backflip") {
    const a = 4 * t;
    const hy = cy - 6 - 6 * Math.abs(Math.sin(2 * t));
    body = (
      <>
        {grad(mix(p.green, p.card, 0.35), p.green)}
        <rect x={0} y={46} width={30} height={6} fill={p.leaf} />
        <line x1={cx} y1={hy} x2={cx - 6 * Math.cos(a)} y2={hy - 6 * Math.sin(a)} stroke={p.dark} stroke-width={2} stroke-linecap="round" />
        <circle cx={cx + 5 * Math.cos(a)} cy={hy + 5 * Math.sin(a)} r={3} fill={p.dark} />
      </>
    );
  } else if (kind === "stairs") {
    const x = 9 + 4 * Math.sin(1.5 * t);
    const dog = mix(p.yellow, p.orange, 0.4);
    body = (
      <>
        {grad(p.wall, mix(p.wall, p.brown, 0.3))}
        {[0, 1, 2, 3].map((k) => (
          <rect key={k} x={7 * k} y={44 - 8 * k} width={30} height={3} fill={p.brown} />
        ))}
        <ellipse cx={x} cy={32} rx={7} ry={4} fill={dog} />
        <circle cx={x + 6} cy={27} r={4} fill={dog} />
      </>
    );
  } else if (kind === "pasta") {
    body = (
      <>
        {grad(mix(p.wall, p.orange, 0.15), mix(p.wall, p.orange, 0.4))}
        <circle cx={cx} cy={cy} r={11} fill={p.paper} />
        <circle cx={cx} cy={cy} r={8} fill={p.red} />
        {[0, 1, 2, 3].map((k) => (
          <circle key={k} cx={cx + 2 * Math.cos(1.5 * k + t)} cy={cy + 2 * Math.sin(1.5 * k + t)} r={4} fill="none" stroke={p.cream} stroke-width={1.2} />
        ))}
      </>
    );
  } else if (kind === "mic") {
    const my = cy - 12 + 18 * frac(0.8 * t);
    body = (
      <>
        {grad(mix(p.purple, p.dark, 0.5), p.dark)}
        <rect x={cx - 8} y={cy + 10 - 7} width={16} height={14} fill={p.brown} />
        <rect x={cx + 6 - 1.5} y={my - 3.5} width={3} height={7} fill={p.tile} />
        <circle cx={cx - 3} cy={cy - 6} r={3.5} fill={mix(p.yellow, p.orange, 0.3)} />
      </>
    );
  }
  return (
    <span style={{ position: "absolute", left: 32, top: 5, width: 30, height: 52, borderRadius: 6, overflow: "hidden", background: theme.color.wash }}>
      {kind === "plain" ? (
        <span style={{ position: "absolute", left: 0, top: 11 }}>
          <Thumb kind={thumbKind(title)} seed={title} size={30} label="" />
        </span>
      ) : (
        <svg width={30} height={52} viewBox="0 0 30 52" aria-hidden="true" style={{ display: "block" }}>
          {body}
        </svg>
      )}
    </span>
  );
}

function Face({ name, members, size, theme, ring }: { name: string; members: Member[]; size: number; theme: Theme; ring?: boolean }) {
  const m = members.find((x) => x.name.toLowerCase() === name.toLowerCase() || x.id === name);
  const shadow = ring ? `0 0 0 1.5px ${theme.color.card}` : undefined;
  if (m) {
    return (
      <span style={{ display: "flex", borderRadius: "50%", boxShadow: shadow }}>
        <Avatar user={m} size={size} />
      </span>
    );
  }
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: "50%", background: userColor(name || "?", theme), color: theme.color.onPrimary, fontSize: Math.max(8, Math.round(size * 0.55)), fontWeight: 600, lineHeight: 1, boxShadow: shadow }}>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function Popcorn({ t, theme }: { t: number; theme: Theme }) {
  const p = pal(theme);
  return (
    <svg width={60} height={92} viewBox="0 0 60 92" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
      <polygon points="16,36 52,36 47,72 21,72" fill={p.paper} stroke={p.rim} stroke-width={1} />
      {[0, 1, 2].map((k) => {
        const x = 24 + 10 * k;
        return <polygon key={k} points={`${x - 3},36 ${x + 3},36 ${x + 2.4},72 ${x - 2.4},72`} fill={p.red} />;
      })}
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <circle key={k} cx={20 + 5.6 * k} cy={34 - 4 * (k % 2)} r={5} fill={p.cream} />
      ))}
      {[0, 1, 2, 3].map((k) => {
        const ph = frac(0.9 * t + 0.27 * k);
        return <circle key={`p${k}`} cx={34 + (k - 1.5) * 8 + ph * (k - 1.5) * 10} cy={30 - 26 * Math.sin(Math.PI * ph)} r={3.6} fill={p.cream} opacity={1 - 0.3 * ph} />;
      })}
    </svg>
  );
}

export default defineApp<State, Action, Local>({
  name: "Reels ranked",
  summary: (s) => {
    const top = s.reels.find((r) => r.id === orderOf(s)[0]);
    const base = top ? `This week's reels: ${top.title} leads with ${score(s, top.id)} · ${totalOf(s)} reactions` : `This week's reels: nothing shared yet`;
    return s.party ? `${base} · watch party ${s.when}, ${s.party.going.length} going` : base;
  },

  init: () => initState(),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "laugh") {
      if (typeof action.reel !== "string" || !state.reels.some((r) => r.id === action.reel)) return state;
      const mine = state.laughs[action.reel]?.[meta.user] ?? 0;
      if (mine >= 9) return state;
      return {
        ...state,
        laughs: { ...state.laughs, [action.reel]: { ...state.laughs[action.reel], [meta.user]: mine + 1 } },
        bumps: [...state.bumps, { reel: action.reel, u: meta.user, at: meta.time }].slice(-12),
      };
    }
    if (action.t === "party") {
      if (state.party) return state;
      return { ...state, party: { at: Math.max(1, meta.time), by: meta.user, going: [meta.user] } };
    }
    if (action.t === "going") {
      if (!state.party) return state;
      const going = state.party.going.includes(meta.user) ? state.party.going.filter((u) => u !== meta.user) : [...state.party.going, meta.user];
      return { ...state, party: { ...state.party, going } };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    const laughs: State["laughs"] = {};
    let changed = false;
    for (const [reel, who] of Object.entries(state.laughs)) {
      const kept = Object.fromEntries(Object.entries(who).filter(([u]) => here(u)));
      if (Object.keys(kept).length !== Object.keys(who).length) changed = true;
      if (Object.keys(kept).length) laughs[reel] = kept;
    }
    const bumps = state.bumps.filter((b) => here(b.u));
    if (bumps.length !== state.bumps.length) changed = true;
    let party = state.party;
    if (party && !party.going.every(here)) {
      party = { ...party, going: party.going.filter(here) };
      changed = true;
    }
    return changed ? { ...state, laughs, bumps, party } : state;
  },

  invariants: {
    "laughs are 1 to 9 from people here on real reels": (s, ctx) =>
      Object.entries(s.laughs).every(
        ([reel, who]) => s.reels.some((r) => r.id === reel) && Object.entries(who).every(([u, n]) => ctx.members.some((m) => m.id === u) && Number.isInteger(n) && n >= 1 && n <= 9),
      ),
    "recent laughs are capped and real": (s, ctx) =>
      s.bumps.length <= 12 && s.bumps.every((b) => s.reels.some((r) => r.id === b.reel) && ctx.members.some((m) => m.id === b.u) && Number.isInteger(b.at)),
    "every recent laugh is counted": (s) => {
      const seen: Record<string, number> = {};
      for (const b of s.bumps) seen[`${b.reel}|${b.u}`] = (seen[`${b.reel}|${b.u}`] ?? 0) + 1;
      return Object.entries(seen).every(([k, n]) => {
        const [reel, u] = k.split("|") as [string, string];
        return n <= (s.laughs[reel]?.[u] ?? 0);
      });
    },
    "party: positive time, going unique and here": (s, ctx) =>
      s.party === null || (s.party.at > 0 && new Set(s.party.going).size === s.party.going.length && s.party.going.every((u) => ctx.members.some((m) => m.id === u))),
    "reels are fixed and whole": (s) => new Set(s.reels.map((r) => r.id)).size === s.reels.length && s.reels.length <= 6 && s.reels.every((r) => Number.isInteger(r.base) && r.base >= 0),
  },

  transitions: {
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
    "a laugh adds exactly one, mine, on that reel": (p, n, a, m) => {
      if (a.t !== "laugh" || p === n) return true;
      const cnt = (st: State, reel: string, u: string) => st.laughs[reel]?.[u] ?? 0;
      if (cnt(n, a.reel, m.user) !== cnt(p, a.reel, m.user) + 1) return false;
      const reels = new Set([...Object.keys(p.laughs), ...Object.keys(n.laughs)]);
      for (const reel of reels) {
        const users = new Set([...Object.keys(p.laughs[reel] ?? {}), ...Object.keys(n.laughs[reel] ?? {})]);
        for (const u of users) if (!(reel === a.reel && u === m.user) && cnt(n, reel, u) !== cnt(p, reel, u)) return false;
      }
      return true;
    },
    "no more than 9 each": (p, n, a, m) => a.t !== "laugh" || (p.laughs[a.reel]?.[m.user] ?? 0) < 9 || p === n,
    "a laugh is logged as the latest": (p, n, a, m) => {
      if (a.t !== "laugh" || p === n) return true;
      const last = n.bumps[n.bumps.length - 1];
      return !!last && last.reel === a.reel && last.u === m.user && last.at === m.time;
    },
    "one party, started by its planner": (p, n, a, m) =>
      a.t !== "party" || p === n || (p.party === null && n.party !== null && n.party.by === m.user && n.party.going.join() === m.user && n.party.at === Math.max(1, m.time)),
    "going toggles only me": (p, n, a, m) => {
      if (a.t !== "going" || p === n) return true;
      if (!p.party || !n.party) return false;
      const before = new Set(p.party.going);
      const after = new Set(n.party.going);
      const diff = [...p.party.going.filter((u) => !after.has(u)), ...n.party.going.filter((u) => !before.has(u))];
      return diff.length === 1 && diff[0] === m.user;
    },
    "only a laugh changes laughs": (p, n, a) => a.t === "laugh" || JSON.stringify(n.laughs) === JSON.stringify(p.laughs),
    "only party and going change the party": (p, n, a) => a.t === "party" || a.t === "going" || n.party === p.party,
    "the reels never change": (p, n) => JSON.stringify(p.reels) === JSON.stringify(n.reels),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (!s.party && k < 0.1) return { t: "party" };
    if (s.party && k < 0.3) return { t: "going" };
    if (!s.reels.length) return { t: "party" };
    return { t: "laugh", reel: r.pick(s.reels.map((x) => x.id)) };
  },

  local: { toasts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const W = theme.width - 2 * theme.space.card;
    const t = clock.value / 1000;
    const n = state.reels.length;
    const order = orderOf(state);
    const last = state.bumps[state.bumps.length - 1];
    const prev = last ? orderOf(state, { reel: last.reel }) : order;
    const eMove = last && last.at > 0 ? MOVE(running(last.at, 600) ?? 600) : 1;
    const total = totalOf(state);
    const maxScore = Math.max(1, ...state.reels.map((r) => score(state, r.id)));
    const topN = Math.min(5, n);
    const tx = 72;
    const tw = Math.max(40, W - tx - 100);
    const listH = n ? PITCH * n - 8 : ROW;
    const going = state.party?.going ?? [];
    const mineGoing = going.includes(me);
    const grow = state.party ? Math.min(1, GROW(running(state.party.at, 400) ?? 400)) : 0;

    const subtitle = n ? `${n} reels shared in “${state.chat}” · ${total} reactions` : state.chat ? `Nothing shared in “${state.chat}” yet` : "Nothing shared yet";
    const tip = state.where ? `${state.where} · ${topN ? `top ${topN} ` : ""}on the big screen` : topN ? `Top ${topN} on the big screen` : "On the big screen";
    const shown = crowd(going, 6);
    const slots = shown.shown.length + (shown.extra > 0 ? 1 : 0);
    const faceW = slots ? 20 + 16 * (slots - 1) : 0;

    const toastText = state.party ? `${going.length} going${state.treat ? `. ${state.treat}.` : ""}` : "";

    return (
      <div style={{ position: "relative" }}>
        <CardHeader title={state.title} subtitle={subtitle} />

        <div style={{ position: "relative", height: listH, marginTop: 6 }}>
          {n === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: ROW, borderRadius: 12, border: `1.5px dashed ${c.divider}`, boxSizing: "border-box", fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>
              Reels shared in the chat land here
            </div>
          ) : null}
          {state.reels.map((r) => {
            const rank = order.indexOf(r.id);
            const from = prev.indexOf(r.id);
            const moving = eMove < 1 && from !== rank;
            const y = (from + (rank - from) * eMove) * PITCH;
            const sc = score(state, r.id);
            const mine = state.laughs[r.id]?.[me] ?? 0;
            const bumpsHere = state.bumps.filter((b) => b.reel === r.id);
            const lastHere = bumpsHere[bumpsHere.length - 1];
            const bumpK = lastHere && lastHere.at > 0 ? (running(lastHere.at, 500) ?? 500) / 500 : 1;
            const reactor = lastHere ? (members.find((m) => m.id === lastHere.u)?.name ?? "") : r.last;
            const fit = fitText(r.title, tw, { size: 14, min: 11 });
            return (
              <div
                key={r.id}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: y,
                  height: ROW,
                  borderRadius: 12,
                  background: mine ? mix(c.card, c.primary, 0.1) : c.wash,
                  zIndex: moving ? 2 : 1,
                  transform: moving ? "translateY(-3px)" : undefined,
                }}
              >
                <span style={{ position: "absolute", left: 0, width: 32, top: 17, textAlign: "center", fontSize: 22, lineHeight: "28px", fontWeight: 700, color: mine ? (theme.mode === "dark" ? mix(c.primary, c.text, 0.4) : c.primary) : rank === 0 ? c.text : c.secondaryText }}>{rank + 1}</span>
                {rank === 0 ? (
                  <svg width={24} height={18} viewBox="0 0 24 18" aria-hidden="true" style={{ position: "absolute", left: 4, top: 1 }}>
                    <polygon points={[[-9, 3.6], [-9, -4.5], [-4.5, 0], [0, -7.2], [4.5, 0], [9, -4.5], [9, 3.6]].map(([px, py]) => `${12 + px!},${9 + py!}`).join(" ")} fill={p.yellow} />
                  </svg>
                ) : null}
                <Clip kind={r.kind} id={r.id} title={r.title} t={t} theme={theme} />
                <span style={{ position: "absolute", left: tx, top: 8, width: tw, fontSize: fit.size, lineHeight: "20px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</span>
                {r.by ? (
                  <>
                    <span style={{ position: "absolute", left: tx, top: 31 }}>
                      <Face name={r.by} members={members} size={14} theme={theme} />
                    </span>
                    <span style={{ position: "absolute", left: tx + 18, top: 30, width: tw - 18, fontSize: 12, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`${r.by} shared`}</span>
                  </>
                ) : null}
                <span style={{ position: "absolute", left: tx, top: 50, width: tw, height: 4, borderRadius: 2, background: c.card }}>
                  <span style={{ display: "block", width: (tw * sc) / maxScore, height: 4, borderRadius: 2, background: c.primary }} />
                </span>
                <span style={{ position: "absolute", right: 66, top: 19, minWidth: 28, textAlign: "right", fontSize: 18, lineHeight: "24px", fontWeight: 700, color: c.text, fontVariantNumeric: "tabular-nums", transform: `scale(${(1 + 0.3 * (1 - bumpK)).toFixed(3)})`, transformOrigin: "right center" }}>{sc}</span>
                <button
                  type="button"
                  aria-label={`Laugh at ${r.title}, ${sc}`}
                  onClick={() => {
                    haptic("light");
                    dispatch({ t: "laugh", reel: r.id });
                  }}
                  style={{ position: "absolute", left: W - 54, top: 9, width: 44, height: 44, padding: 0, border: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "50%", background: mine ? mix(c.card, p.yellow, 0.35) : c.card }}>
                    <Laugh s={26} />
                  </span>
                  {mine > 0 ? (
                    <span style={{ position: "absolute", left: 22 + 13 - 8, top: 22 - 13 - 8, width: 16, height: 16, borderRadius: "50%", background: c.primary, color: c.onPrimary, fontSize: 11, fontWeight: 600, lineHeight: "16px", textAlign: "center" }}>{mine}</span>
                  ) : null}
                </button>
                {reactor ? (
                  <span style={{ position: "absolute", left: W - 32 - 14 - 7, top: 31 - 16 - 7, pointerEvents: "none" }}>
                    <Face name={reactor} members={members} size={14} theme={theme} ring />
                  </span>
                ) : null}
              </div>
            );
          })}
          {state.bumps.map((b, i) => {
            const e = b.at > 0 ? running(b.at, 1400) : null;
            const idx = order.indexOf(b.reel);
            if (e === null || idx < 0) return null;
            const u = e / 1400;
            const who = members.find((m) => m.id === b.u);
            const rowY = (prev.indexOf(b.reel) + (idx - prev.indexOf(b.reel)) * eMove) * PITCH;
            const fy = rowY + 20 - 40 * u;
            return (
              <span key={`f${i}-${b.at}`} aria-hidden="true">
                <span style={{ position: "absolute", left: W - 34 - 8, top: fy - 8, opacity: 1 - u, pointerEvents: "none", zIndex: 5 }}>
                  <Laugh s={16} />
                </span>
                {who ? (
                  <span style={{ position: "absolute", left: W - 48 - 7.5, top: fy - 7.5, opacity: 1 - u, pointerEvents: "none", zIndex: 5 }}>
                    <Face name={who.name} members={members} size={15} theme={theme} ring />
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>

        <div style={{ position: "relative", marginTop: 8, height: 92 }}>
          {state.party ? (
            <div style={{ position: "relative", height: 5 + 87 * grow, borderRadius: 12, background: c.wash, overflow: "hidden" }}>
              <Popcorn t={t} theme={theme} />
              {grow >= 0.6 ? (
                <>
                  <span style={{ position: "absolute", left: 70, right: 8, top: 12, fontSize: 15, lineHeight: "20px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.when ? `Watch party · ${state.when}` : "Watch party"}</span>
                  <span style={{ position: "absolute", left: 70, right: 8, top: 34, fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tip}</span>
                  {shown.shown.map((u, k) => (
                    <span key={u} style={{ position: "absolute", left: 70 + 16 * k, top: 58, display: "flex", borderRadius: "50%", boxShadow: `0 0 0 1.5px ${c.card}`, zIndex: 10 - k }}>
                      <Avatar user={u} size={20} />
                    </span>
                  ))}
                  {shown.extra > 0 ? (
                    <span style={{ position: "absolute", left: 70 + 16 * shown.shown.length, top: 58 }}>
                      <More n={shown.extra} size={20} />
                    </span>
                  ) : null}
                  <span style={{ position: "absolute", left: 70 + faceW + 8, top: 60, fontSize: 13, lineHeight: "16px", color: c.text, whiteSpace: "nowrap" }}>{`${going.length} going`}</span>
                  <span style={{ position: "absolute", right: 8, top: 50 }}>
                    <Button
                      kind="secondary"
                      onClick={() => {
                        if (!mineGoing) {
                          haptic("success");
                          setLocal({ toasts: local.toasts + 1 });
                        }
                        dispatch({ t: "going" });
                      }}
                    >
                      {mineGoing ? "Leave" : "Join"}
                    </Button>
                  </span>
                </>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: 4 }}>
              <Button
                kind="primary"
                wide
                onClick={() => {
                  haptic("success");
                  setLocal({ toasts: local.toasts + 1 });
                  dispatch({ t: "party" });
                }}
              >
                Plan a watch party
              </Button>
              <span style={{ display: "block", marginTop: 4, textAlign: "center", fontSize: 13, lineHeight: "20px", color: c.secondaryText }}>Tap the laugh to bump a reel up</span>
            </div>
          )}
        </div>
        {local.toasts > 0 && state.party ? <Toast key={local.toasts}>{toastText}</Toast> : null}
      </div>
    );
  },
});
