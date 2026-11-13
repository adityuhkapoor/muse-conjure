import { defineApp, Burst, Button, CardHeader, Toast, fitText, haptic, innerWidth, mix, rng, running, tween } from "@muse/app";

// King's Cup: the apartment's own rules. Take your turn, the card flies off the deck and flips to the
// house rule; kings fill the cup, and the 4th king's drawer drinks it.

type Rule = { title: string; rule: string };
type Params = { title: string; sub: string; rules: Rule[]; drawn: { card: string; name: string }[] };
type Draw = { card: number; by: string | null; at: number };
type State = { title: string; sub: string; rules: Rule[]; drawn: Draw[]; players: string[]; turn: number; games: number };
type Action = { t: "draw" } | { t: "new" };
type Local = { open: boolean };
type Ctx = { members: { id: string; name?: string }[] };

// @params
const P: Params = {
  title: "King's cup",
  sub: "Apt 4b rules v3",
  rules: [
    { title: "Waterfall", rule: "Theo starts. Nobody stops before Theo." },
    { title: "You", rule: "Pick someone to sip." },
    { title: "Me", rule: "You sip. Sorry." },
    { title: "Floor", rule: "Last to touch the (sticky) floor drinks." },
    { title: "Guys", rule: "Guys drink." },
    { title: "Girls", rule: "Girls drink." },
    { title: "Pans", rule: "Whoever left pans out drinks. (Jonah.)" },
    { title: "Mate", rule: "Pick a mate. Noa picks Jonah, every time." },
    { title: "Rhyme", rule: "Rhyme with “pan”. Go." },
    { title: "Categories", rule: "Things soaking in our sink." },
    { title: "New rule", rule: "Make a rule. Not “no phones” again, Noa." },
    { title: "Questions", rule: "Only answer with a question." },
    { title: "King's cup", rule: "Pour some in. 4th king drinks it. Water counts, no pressure." },
  ],
  drawn: [
    { card: "3s", name: "Theo" },
    { card: "Kh", name: "Maya" },
    { card: "9d", name: "Jonah" },
  ],
};
// @end params

const DEFAULT_RULES: Rule[] = [
  { title: "Waterfall", rule: "Everyone drinks until the person before them stops." },
  { title: "You", rule: "Pick someone to sip." },
  { title: "Me", rule: "You sip." },
  { title: "Floor", rule: "Last to touch the floor drinks." },
  { title: "Guys", rule: "Guys drink." },
  { title: "Girls", rule: "Girls drink." },
  { title: "Heaven", rule: "Last to point up drinks." },
  { title: "Mate", rule: "Pick a mate. They drink when you drink." },
  { title: "Rhyme", rule: "Rhyme with a word. Go." },
  { title: "Categories", rule: "Name things in a category." },
  { title: "New rule", rule: "Make a rule." },
  { title: "Questions", rule: "Only answer with a question." },
  { title: "King's cup", rule: "Pour some in. 4th king drinks it." },
];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_WORDS = ["ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "jack", "queen", "king"];
const SUITS = ["♠", "♥", "♦", "♣"];
const SUIT_WORDS = ["spades", "hearts", "diamonds", "clubs"];
const FLY_MS = 550;
const CUP_DELAY = 500;
const CUP_MS = 600;
const fly = tween({ duration: FLY_MS, easing: "easeInOut" });
const rise = tween({ duration: CUP_MS, easing: "decelerate" });

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const rankOf = (c: number) => Math.floor(c / 4);
const suitOf = (c: number) => c % 4;
const kingsOf = (s: State) => s.drawn.filter((d) => rankOf(d.card) === 12).length;
const leftOf = (s: State) => 52 - s.drawn.length;
const currentOf = (s: State): string | null => s.players[s.turn] ?? null;
const overOf = (s: State) => kingsOf(s) >= 4 || leftOf(s) === 0;
const remaining = (s: State): number[] => {
  const used = new Set(s.drawn.map((d) => d.card));
  return Array.from({ length: 52 }, (_, i) => i).filter((i) => !used.has(i));
};
const pickWith = (s: State, seed: number) => {
  const r = remaining(s);
  return r.length ? rng(seed).pick(r) : -1;
};
const parseCard = (v: unknown): number => {
  const m = /^(10|[2-9]|[AJQK])([shdc])$/i.exec(String(v ?? "").trim());
  if (!m) return -1;
  const rank = RANKS.indexOf(m[1]!.toUpperCase());
  const suit = "shdc".indexOf(m[2]!.toLowerCase());
  return rank < 0 || suit < 0 ? -1 : rank * 4 + suit;
};

export default defineApp<State, Action, Local>({
  name: "King's cup",
  summary: (s, ctx) => {
    if (s.drawn.length === 0) return `${s.title}: ${leftOf(s)} cards left`;
    const last = s.drawn[s.drawn.length - 1]!;
    if (overOf(s) && rankOf(last.card) === 12) {
      const who = ctx.members.find((m) => m.id === last.by)?.name ?? "someone";
      return `${s.title}: 4th king drawn by ${who}`;
    }
    return `${s.title}: ${RANK_WORDS[rankOf(last.card)]} of ${SUIT_WORDS[suitOf(last.card)]} · ${s.rules[rankOf(last.card)]?.title ?? ""} · ${kingsOf(s)} of 4 kings`;
  },

  init: (ctx) => {
    const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
    const given = Array.isArray(P.rules) ? P.rules : [];
    const rules: Rule[] = DEFAULT_RULES.map((d, i) => ({
      title: text(given[i]?.title, 24) || d.title,
      rule: text(given[i]?.rule, 90) || d.rule,
    }));
    const drawn: Draw[] = [];
    let kings = 0;
    for (const x of Array.isArray(P.drawn) ? P.drawn : []) {
      const card = parseCard(x?.card);
      if (card < 0 || drawn.some((d) => d.card === card)) continue;
      if (rankOf(card) === 12 && kings >= 3) continue;
      if (rankOf(card) === 12) kings++;
      const want = String(x?.name ?? "").trim().toLowerCase();
      const m = want ? ctx.members.find((u) => u.id === x.name || (u.name ?? "").toLowerCase() === want) : undefined;
      drawn.push({ card, by: m ? m.id : null, at: 0 });
    }
    const players = [...new Set(ctx.members.map((m) => m.id))];
    return { title: text(P.title, 24) || "King's cup", sub: text(P.sub, 40), rules, drawn, players, turn: drawn.length % Math.max(1, players.length), games: 0 };
  },

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "draw") {
      if (overOf(s) || meta.user !== currentOf(s) || s.players.length === 0) return s;
      const card = pickWith(s, meta.seed);
      if (card < 0) return s;
      return { ...s, drawn: [...s.drawn, { card, by: meta.user, at: meta.time }], turn: (s.turn + 1) % s.players.length };
    }
    if (a.t === "new") {
      if (!overOf(s)) return s;
      return { ...s, drawn: [], games: s.games + 1 };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const ids = [...new Set(ctx.members.map((m) => m.id))];
    const kept = s.players.filter((id) => ids.includes(id));
    const players = [...kept, ...ids.filter((id) => !kept.includes(id))];
    const cur = s.players[s.turn];
    const turn = players.length === 0 ? 0 : cur !== undefined && players.includes(cur) ? players.indexOf(cur) : s.turn % players.length;
    if (turn === s.turn && players.length === s.players.length && players.every((id, i) => id === s.players[i])) return s;
    return { ...s, players, turn };
  },

  invariants: {
    "every card is drawn at most once": (s) => s.drawn.length <= 52 && s.drawn.every((d) => Number.isInteger(d.card) && d.card >= 0 && d.card <= 51) && new Set(s.drawn.map((d) => d.card)).size === s.drawn.length,
    "at most four kings": (s) => kingsOf(s) <= 4,
    "players are exactly the chat, in one order": (s, ctx) => new Set(s.players).size === s.players.length && s.players.length === ctx.members.length && ctx.members.every((m) => s.players.includes(m.id)),
    "the turn points at a player": (s) => (s.players.length === 0 ? s.turn === 0 : Number.isInteger(s.turn) && s.turn >= 0 && s.turn < s.players.length),
    "thirteen rules": (s) => s.rules.length === 13 && s.rules.every((r) => r.title.length > 0),
  },

  transitions: {
    "only the player whose turn it is draws": (p, n, a, m) => a.t !== "draw" || p === n || m.user === currentOf(p),
    "a draw adds the seed's card from the deck": (p, n, a, m) =>
      a.t !== "draw" || p === n || (n.drawn.length === p.drawn.length + 1 && n.drawn[n.drawn.length - 1]!.card === pickWith(p, m.seed) && n.drawn[n.drawn.length - 1]!.by === m.user && n.drawn[n.drawn.length - 1]!.at === m.time),
    "a draw passes the turn on": (p, n, a) => a.t !== "draw" || p === n || n.turn === (p.turn + 1) % p.players.length,
    "no draws after the 4th king": (p, n, a) => a.t !== "draw" || !overOf(p) || p === n,
    "a new game only when this one is over, and starts empty": (p, n, a) => a.t !== "new" || p === n || (overOf(p) && n.drawn.length === 0 && n.games === p.games + 1),
    "earlier draws never change": (p, n, a) => a.t !== "draw" || JSON.stringify(n.drawn.slice(0, p.drawn.length)) === JSON.stringify(p.drawn),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    if (overOf(s)) return { t: "new" };
    return r.next() < 0.95 ? { t: "draw" } : { t: "new" };
  },

  local: { open: false },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = innerWidth();
    const s = confirmed;
    const nameOf = (id: string | null) => (id === null ? "Someone" : id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const left = leftOf(s);
    const kings = kingsOf(s);
    const over = overOf(s);
    const cur = currentOf(s);
    const last = s.drawn.length ? s.drawn[s.drawn.length - 1]! : null;
    const lastKing = last !== null && rankOf(last.card) === 12;
    const drawing = pending && state.drawn.length > confirmed.drawn.length;
    const myTurn = cur === me && !over;

    // Animations come from the confirmed draw only.
    const e = last && last.at ? running(last.at, FLY_MS) : null;
    const k = e === null ? 1 : fly(e);
    const e2 = last && last.at ? running(last.at, CUP_DELAY + CUP_MS + 900) : null;
    let lvl = kings / 4;
    if (lastKing && e2 !== null) lvl = (kings - 1 + rise(Math.max(0, Math.min(CUP_MS, e2 - CUP_DELAY)))) / 4;
    const fresh = over && lastKing && last!.at ? running(last!.at, 3000) : null;
    const shake = fresh !== null && fresh - CUP_DELAY > 0 && fresh - CUP_DELAY < 1500 ? Math.sin(((fresh - CUP_DELAY) / 1000) * 30) * 1.5 * (1 - (fresh - CUP_DELAY) / 1500) : 0;

    const sub = `${s.sub}${s.sub ? " · " : ""}${over || cur === null ? "" : cur === me ? "Your turn · " : `${nameOf(cur)}'s turn · `}${left} left`;

    const suitColor = (suit: number) => (suit === 1 || suit === 2 ? c.negative : c.text);

    const clip = (t: string, px: number) => {
      const per = Math.max(6, Math.floor(118 / (px * 0.56)));
      const words = t.split(" ");
      let lines = 1;
      let w = 0;
      const out: string[] = [];
      for (const word of words) {
        const add = (w ? 1 : 0) + word.length;
        if (w && w + add > per) {
          lines++;
          w = word.length;
        } else w += add;
        if (lines > 4) return out.join(" ") + "…";
        out.push(word);
      }
      return t;
    };

    const pattern = (w: number) =>
      [0, 1, 2].flatMap((i) =>
        [0, 1, 2, 3].map((j) => (
          <span
            key={`${i}${j}`}
            style={{ position: "absolute", left: `${((17 + 20 * i) / 74) * 100}%`, top: `${((20 + 22 * j) / 104) * 100}%`, transform: "translate(-50%,-50%)", fontSize: (9 * w) / 74, lineHeight: 1, color: c.card, opacity: 0.35 }}
          >
            {SUITS[(i + j) % 4]}
          </span>
        )),
      );
    const back = (w: number, h: number, top: boolean) => (
      <div style={{ position: "relative", width: w, height: h, borderRadius: 8, background: c.series4, boxSizing: "border-box" }}>
        <div style={{ position: "absolute", inset: 5, borderRadius: 5, boxShadow: `inset 0 0 0 1.5px ${mix(c.series4, c.card, 0.45)}` }} />
        {top ? pattern(w) : null}
      </div>
    );

    const face = (d: Draw | null, style: Record<string, string | number>) => {
      if (!d) {
        return (
          <div style={{ ...style, borderRadius: 10, background: c.input, boxShadow: `inset 0 0 0 1px ${c.divider}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: c.secondaryText }}>
            Draw to start
          </div>
        );
      }
      const rank = rankOf(d.card);
      const suit = suitOf(d.card);
      const rule = s.rules[rank]!;
      const col = suitColor(suit);
      const t = fitText(rule.title, 124, { size: 22, min: 14, weight: 600 });
      const px = rule.rule.length > 60 ? 11 : 12.5;
      const who = d.by === null ? "Drawn earlier" : d.by === me ? "You drew" : `${nameOf(d.by)} drew`;
      return (
        <div role="img" aria-label={`${RANK_WORDS[rank]} of ${SUIT_WORDS[suit]}: ${rule.title}. ${rule.rule}`} style={{ ...style, borderRadius: 10, background: c.input, boxShadow: `inset 0 0 0 1px ${c.divider}`, overflow: "hidden", color: c.text }}>
          <div style={{ position: "absolute", left: 10, top: 6, fontSize: 26, lineHeight: "30px", fontWeight: 700, color: col }}>{RANKS[rank]}</div>
          <div aria-hidden="true" style={{ position: "absolute", left: 12, top: 36, fontSize: 22, lineHeight: "26px", color: col }}>{SUITS[suit]}</div>
          <div aria-hidden="true" style={{ position: "absolute", left: 88 - 40, top: 66 - 40, width: 80, height: 80, fontSize: 80, lineHeight: "80px", textAlign: "center", color: col, opacity: 0.13 }}>{SUITS[suit]}</div>
          <div style={{ position: "absolute", left: 8, top: 80, width: 124, textAlign: "center", fontSize: t.size, lineHeight: "26px", fontWeight: 600, whiteSpace: "nowrap" }}>{t.text}</div>
          <div style={{ position: "absolute", left: 11, top: 108, width: 118, fontSize: px, lineHeight: `${Math.round(px + 2)}px` }}>{clip(rule.rule, px)}</div>
          <div style={{ position: "absolute", left: 10, bottom: 8, fontSize: 10, lineHeight: "12px", color: c.secondaryText }}>{who}</div>
          <div aria-hidden="true" style={{ position: "absolute", right: 10, bottom: 8, fontSize: 18, lineHeight: "20px", fontWeight: 600, color: col, opacity: 0.6 }}>{RANKS[rank]}</div>
        </div>
      );
    };

    // Cup geometry.
    // The drawn card shrinks on a narrow card so it never covers the cup.
    const sc = Math.max(0.5, Math.min(1, (W - 161) / 140));
    const cx = (87 + (W - 10 - 140 * sc)) / 2;
    const hw = (y: number) => 28 - (9 * (y - 95)) / 66;
    const ly = 156 - (156 - 99) * Math.min(1, lvl * 0.92);
    const liquid = lvl > 0;
    const wave = Array.from({ length: 13 }, (_, i) => `${i ? "L" : "M"}${(cx - (hw(ly) - 4) + ((2 * (hw(ly) - 4)) * i) / 12).toFixed(1)} ${(ly + Math.sin((i / 12) * Math.PI * 4) * 1.5).toFixed(1)}`).join(" ");
    const kingsLabel = over ? "Drink it" : `${kings} of 4 kings`;
    const kl = fitText(kingsLabel, Math.min(150, W - 110), { size: 13, weight: 600 });
    const layers = Math.min(5, Math.ceil(left / 8));

    const prev = s.drawn.slice(0, -1).slice(-14);
    const n = prev.length;
    const spread = n > 1 ? Math.min(0.15, 0.26 / (n - 1)) : 0;
    const curRank = last ? rankOf(last.card) : -1;
    const lastRule = curRank >= 0 ? s.rules[curRank]! : null;

    const fl = e !== null && last ? (
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 140,
          height: 192,
          transformOrigin: "50% 50%",
          transform: `translate(${50 + (W - 10 - 70 * sc - 50) * k - 70}px, ${82 + (2 + 96 * sc - 82) * k - Math.sin(k * Math.PI) * 40 - 96}px) scale(${(74 / 140) * (1 - k) + sc * k}) scaleX(${Math.max(0.02, Math.abs(Math.cos(k * Math.PI)))})`,
          zIndex: 3,
        }}
      >
        {k < 0.5 ? back(140, 192, true) : face(last, { position: "absolute", inset: 0 })}
      </div>
    ) : null;

    return (
      <div>
        <div style={{ height: 44, overflow: "hidden" }}>
          <CardHeader title={s.title} subtitle={sub} />
        </div>

        <div style={{ position: "relative", height: 200 }}>
          <div aria-hidden="true" style={{ position: "absolute", left: 13, top: 30, width: 74, height: 104 }}>
            {left > 0 ? (
              Array.from({ length: layers }, (_, i) => (
                <div key={i} style={{ position: "absolute", left: 1.5 * i, top: -2 * i }}>
                  {back(74, 104, i === layers - 1)}
                </div>
              ))
            ) : (
              <div style={{ width: 74, height: 104, borderRadius: 8, border: `1.5px dashed ${c.secondaryText}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: c.secondaryText }}>Empty</div>
            )}
          </div>
          <div style={{ position: "absolute", left: 5, top: 162, width: 90 }}>
            {over ? (
              <Button kind="primary" wide onClick={() => dispatch({ t: "new" })}>New game</Button>
            ) : drawing ? (
              <Button kind="secondary" wide disabled>Drawing</Button>
            ) : myTurn ? (
              <Button kind="primary" wide onClick={() => (haptic("medium"), dispatch({ t: "draw" }))}>Draw</Button>
            ) : (
              <Button kind="secondary" wide disabled>Draw</Button>
            )}
          </div>

          <svg width={W} height={200} viewBox={`0 0 ${W} 200`} role="img" aria-label={`Cup with ${kings} of 4 kings`} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
            <g transform={`translate(${shake.toFixed(2)} 0)`}>
              <ellipse cx={cx} cy={164} rx={26} ry={5} fill={c.wash} />
              <path d={`M${cx - 28} 95 L${cx + 28} 95 L${cx + 19} 161 L${cx - 19} 161 Z`} fill={c.primary} />
              {liquid ? <path d={`M${cx - (hw(ly) - 4)} ${ly} L${cx + (hw(ly) - 4)} ${ly} L${cx + (hw(156) - 4)} 156 L${cx - (hw(156) - 4)} 156 Z`} fill={c.series2} /> : null}
              {liquid ? <path d={wave} fill="none" stroke={mix(c.series2, c.card, 0.5)} stroke-width={1.5} stroke-linecap="round" /> : null}
              <line x1={cx - hw(101)} y1={101} x2={cx + hw(101)} y2={101} stroke={mix(c.primary, c.card, 0.6)} stroke-width={1} />
              <line x1={cx - hw(107)} y1={107} x2={cx + hw(107)} y2={107} stroke={mix(c.primary, c.card, 0.6)} stroke-width={1} />
              <rect x={cx - 30} y={93.5} width={60} height={5} rx={2.5} fill={mix(c.primary, c.card, 0.35)} />
            </g>
            <text x={100} y={194} text-anchor="start" font-size={kl.size} font-weight={600} fill={over ? c.link : c.text} style={{ fontFamily: "inherit" }}>{kl.text}</text>
            {[0, 1, 2, 3].map((i) => (
              <circle key={i} cx={cx - 18 + 12 * i} cy={175} r={4} fill={i < kings ? c.series2 : "none"} stroke={i < kings ? "none" : c.secondaryText} stroke-width={1.2} />
            ))}
          </svg>

          {e === null ? face(last, { position: "absolute", left: W - 10 - 140, top: 2, width: 140, height: 192, transform: `scale(${sc})`, transformOrigin: "100% 0" }) : null}
          {fl}
          {over && lastKing && fresh !== null ? (
            <div style={{ position: "absolute", left: cx, top: 120 }}>
              <Burst key={last!.at} emoji="🍺" />
            </div>
          ) : null}
        </div>

        <div style={{ position: "relative", height: 64 }}>
          <div style={{ position: "absolute", left: 0, top: 0, fontSize: 11, lineHeight: "14px", color: c.secondaryText }}>{`Drawn · ${s.drawn.length}`}</div>
          <svg width={W} height={64} viewBox={`0 0 ${W} 64`} role="img" aria-label={`${s.drawn.length} cards drawn`} style={{ position: "absolute", left: 0, top: 0 }}>
            {prev.map((d, i) => {
              const a = (i - (n - 1) / 2) * spread;
              const x = W / 2 + Math.sin(a) * 178;
              const y = 214 - Math.cos(a) * 178;
              const col = suitColor(suitOf(d.card));
              return (
                <g key={d.card} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${((a * 180) / Math.PI).toFixed(2)})`}>
                  <rect x={-17} y={-24} width={34} height={48} rx={4} fill={c.card} stroke={c.divider} stroke-width={1} />
                  <text x={-8} y={-13} font-size={13} font-weight={700} fill={col} style={{ fontFamily: "inherit" }}>{RANKS[rankOf(d.card)]}</text>
                  <text aria-hidden="true" x={-8} y={2} font-size={10} fill={col} style={{ fontFamily: "inherit" }}>{SUITS[suitOf(d.card)]}</text>
                  <text aria-hidden="true" x={4} y={12} font-size={12} fill={col} opacity={0.35} style={{ fontFamily: "inherit" }}>{SUITS[suitOf(d.card)]}</text>
                </g>
              );
            })}
          </svg>
        </div>

        <div aria-hidden="true" style={{ display: "flex", gap: 3, height: 30, alignItems: "flex-start" }}>
          {RANKS.map((r, i) => (
            <div key={r} style={{ flex: 1, minWidth: 0, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: i === curRank ? c.primary : c.input, color: i === curRank ? c.onPrimary : c.text }}>
              {r}
            </div>
          ))}
        </div>

        <button
          type="button"
          aria-expanded={local.open}
          onClick={() => setLocal({ open: !local.open })}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 44, textAlign: "left" }}
        >
          <span style={{ flex: "none", fontSize: 17, fontWeight: 600 }}>{lastRule ? `${RANKS[curRank]} · ${lastRule.title}` : "Rules"}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lastRule ? lastRule.rule : "Tap to read all 13"}</span>
          <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none", transform: local.open ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>
            <path d="M4 6l4 4 4-4" fill="none" stroke={c.secondaryText} stroke-width={2} stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        {local.open ? (
          <div>
            {s.rules.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 6, height: 20, alignItems: "center", fontSize: 13, borderRadius: 4, padding: "0 4px", background: i === curRank ? c.selected : "transparent", overflow: "hidden", whiteSpace: "nowrap" }}>
                <span style={{ flex: "none", fontWeight: 600 }}>{`${RANKS[i]} · ${r.title}`}</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", color: c.secondaryText }}>{r.rule}</span>
              </div>
            ))}
          </div>
        ) : null}
        {over && lastKing && fresh !== null ? <Toast key={last!.at}>{`4th king · ${last!.by === me ? "You drink" : `${nameOf(last!.by)} drinks`} the cup`}</Toast> : null}
      </div>
    );
  },
});
