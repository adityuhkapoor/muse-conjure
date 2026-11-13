import { defineApp, Avatar, Button, Facepile, Toast, clock, fitText, haptic, mix, pal, running, spring, springs, tween, type Member } from "@muse/app";

// Semester wrapped: the group's term as a pack of six superlative cards. Each person rips their own
// foil pack, flips the cards face-down one by one, then shares the full set to a story. Every
// number and name on a card comes from the parameters (facts from the chat).

type Kind = "study" | "food" | "chat" | "music" | "night" | "squad";
type Card = {
  /** study, food, chat, music, night or squad */
  kind: Kind;
  /** "Library hours" */
  title: string;
  /** The number as text: "212", "3,402", "4:12" */
  big: string;
  /** "hrs at Doe" */
  unit: string;
  /** A person, place or song: "Leo", "Crossroads" */
  who: string;
  /** One fact: "Mostly the 3rd floor" */
  detail: string;
};
type Params = {
  /** e.g. "Fall '26" */
  term: string;
  /** 1 to 6 cards. */
  cards: Card[];
  /** Names of people who already opened theirs. */
  opened: string[];
};

// @params
const P: Params = {
  term: "Fall '26",
  cards: [
    { kind: "study", title: "Library hours", big: "212", unit: "hrs at Doe", who: "Leo", detail: "Mostly the 3rd floor" },
    { kind: "food", title: "Dining loyalty", big: "87", unit: "group visits", who: "Crossroads", detail: "Pesto pasta on Tuesdays" },
    { kind: "chat", title: "Chat MVP", big: "3,402", unit: "messages", who: "Maya", detail: "1,395 of them voice memos" },
    { kind: "music", title: "Pregame song", big: "61", unit: "plays", who: "Pink Pony Club", detail: "Always on Ana's aux" },
    { kind: "night", title: "Latest night", big: "4:12", unit: "am, finals week", who: "Kev", detail: "Dec 12, Moffitt" },
    { kind: "squad", title: "Holo rare", big: "6", unit: "of us, 1 semester", who: "The Unit 2 squad", detail: "Unit 2, floor 3" },
  ],
  opened: ["Ana", "Leo", "Kev", "Priya", "Theo"],
};
// @end params

/** shared: meta.time when the set went to the story, 0 = not yet. */
type Pack = { u: string; at: number; flips: { i: number; at: number }[]; shared: number };
type State = { term: string; cards: Card[]; packs: Pack[] };
type Action = { t: "rip" } | { t: "flip"; card: number } | { t: "share" };
/** Index of the card held up close, -1 for none. */
type Local = { focus: number };

const KINDS: Kind[] = ["study", "food", "chat", "music", "night", "squad"];
const MAX_CARDS = 6;
const PANEL_H = 556;
const slide = tween({ duration: 500, easing: "easeInOut" });
const deal = spring(springs.iosBouncy);

const cut = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const packOf = (s: State, u: string) => s.packs.find((p) => p.u === u);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Points of an n-point star polygon, outer radius R, inner r, as an SVG points string. */
function star(cx: number, cy: number, R: number, r: number, n: number, rot = 0): string {
  const pts: string[] = [];
  for (let k = 0; k < n * 2; k++) {
    const a = rot + (k * Math.PI) / n - Math.PI / 2;
    const rad = k % 2 === 0 ? R : r;
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`);
  }
  return pts.join(" ");
}

export default defineApp<State, Action, Local>({
  name: "Semester wrapped",
  summary: (s, ctx) => `${s.term} wrapped · ${s.packs.length} of ${ctx.members.length} opened their pack`,

  init: (ctx) => {
    const cards: Card[] = [];
    for (const raw of P.cards.slice(0, MAX_CARDS)) {
      const kind = (KINDS as string[]).includes(raw.kind) ? raw.kind : "squad";
      const card: Card = { kind, title: cut(raw.title, 18), big: cut(raw.big, 7), unit: cut(raw.unit, 20), who: cut(raw.who, 22), detail: cut(raw.detail, 60) };
      if (card.title || card.big) cards.push(card);
    }
    if (cards.length === 0) cards.push({ kind: "squad", title: "The group", big: String(ctx.members.length), unit: "of us", who: "This chat", detail: "" });
    const packs: Pack[] = [];
    for (const name of P.opened) {
      const want = cut(name, 40).toLowerCase();
      const m = ctx.members.find((x) => x.id === name || x.name.trim().toLowerCase() === want);
      if (m && !packs.some((p) => p.u === m.id)) packs.push({ u: m.id, at: 0, flips: cards.map((_, i) => ({ i, at: 0 })), shared: 0 });
    }
    return { term: cut(P.term, 12), cards, packs };
  },

  reduce: (s, a, meta, ctx) => {
    if (!ctx.members.some((m) => m.id === meta.user)) return s;
    const mine = packOf(s, meta.user);
    const put = (pack: Pack): State => ({ ...s, packs: s.packs.map((p) => (p.u === meta.user ? pack : p)) });
    if (a.t === "rip") {
      if (mine) return s;
      return { ...s, packs: [...s.packs, { u: meta.user, at: meta.time, flips: [], shared: 0 }] };
    }
    if (a.t === "flip") {
      if (!mine || !Number.isInteger(a.card) || a.card < 0 || a.card >= s.cards.length || mine.flips.some((f) => f.i === a.card)) return s;
      return put({ ...mine, flips: [...mine.flips, { i: a.card, at: meta.time }] });
    }
    if (a.t === "share") {
      if (!mine || mine.flips.length !== s.cards.length || mine.shared !== 0) return s;
      return put({ ...mine, shared: meta.time || 1 });
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const packs = s.packs.filter((p) => ctx.members.some((m) => m.id === p.u));
    return packs.length === s.packs.length ? s : { ...s, packs };
  },

  invariants: {
    "one pack each": (s) => new Set(s.packs.map((p) => p.u)).size === s.packs.length,
    "packs belong to people here": (s, ctx) => s.packs.every((p) => ctx.members.some((m) => m.id === p.u)),
    "flips are real cards": (s) => s.packs.every((p) => p.flips.every((f) => Number.isInteger(f.i) && f.i >= 0 && f.i < s.cards.length) && new Set(p.flips.map((f) => f.i)).size === p.flips.length),
    "share needs the full set": (s) => s.packs.every((p) => p.shared === 0 || p.flips.length === s.cards.length),
    "1 to 6 cards": (s) => s.cards.length >= 1 && s.cards.length <= MAX_CARDS,
  },

  transitions: {
    "rip makes only my pack": (p, n, a, m) => a.t !== "rip" || n === p || (!packOf(p, m.user) && packOf(n, m.user)?.flips.length === 0 && n.packs.length === p.packs.length + 1),
    "flip adds that card": (p, n, a, m) => {
      if (a.t !== "flip" || n === p) return true;
      const before = packOf(p, m.user);
      const after = packOf(n, m.user);
      return !!before && !!after && after.flips.length === before.flips.length + 1 && after.flips[after.flips.length - 1]!.i === a.card && !before.flips.some((f) => f.i === a.card);
    },
    "share once": (p, n, a, m) => a.t !== "share" || n === p || (packOf(p, m.user)?.shared === 0 && (packOf(n, m.user)?.shared ?? 0) > 0),
    "others' packs untouched": (p, n, _a, m) => n.packs.every((x) => x.u === m.user || p.packs.some((y) => y === x)),
    "cards never change": (p, n) => n.cards === p.cards && n.term === p.term,
    "flips are never undone": (p, n) => p.packs.every((x) => (packOf(n, x.u)?.flips.length ?? 0) >= x.flips.length),
  },

  arbitrary: (s, user, r) => {
    const mine = packOf(s, user);
    if (!mine) return { t: "rip" };
    const open = s.cards.map((_, i) => i).filter((i) => !mine.flips.some((f) => f.i === i));
    if (open.length > 0) return r.next() < 0.85 ? { t: "flip", card: r.pick(open) } : { t: "flip", card: r.int(s.cards.length) };
    if (mine.shared === 0) return { t: "share" };
    return { t: "flip", card: r.int(s.cards.length) };
  },

  local: { focus: -1 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const p = pal(theme);
    const now = clock.value;
    const W = theme.width - 2 * theme.space.card;
    const N = state.cards.length;
    const mine = packOf(state, me);
    const here = members.some((m) => m.id === me);
    const flipped = (i: number) => mine?.flips.find((f) => f.i === i);
    const nFlips = mine?.flips.length ?? 0;
    const full = nFlips === N;
    const col = [p.blue, p.yellow, p.green, p.red, p.blue, p.yellow];
    const memberNamed = (name: string): Member | undefined => members.find((m) => m.name.trim().toLowerCase() === name.trim().toLowerCase());
    const title = fitText(`${state.term} wrapped`, W - 24, { size: 34, min: 22, weight: 700 });
    const hasHolo = state.cards.some((x) => x.kind === "squad");
    const digits = state.term.replace(/\D/g, "").slice(-2);

    const cw = Math.floor((W - 24 - 24) / 3);
    const gridW = cw * 3 + 24;
    const gx = (W - gridW) / 2;
    const slot = (i: number) => ({ x: gx + (i % 3) * (cw + 12), y: 100 + Math.floor(i / 3) * 180 });

    const ripE = mine ? running(mine.at, 1800) : null;

    // ---- Pack art ----
    const pack = (strip: boolean, body: boolean) => (
      <svg width="200" height="280" viewBox="0 0 200 280" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id="swp-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color={mix(p.blue, p.dark, 0.15)} />
            <stop offset="1" stop-color={mix(p.blue, p.dark, 0.7)} />
          </linearGradient>
          <clipPath id="swp-clip">
            <rect x="0" y="24" width="200" height="256" />
          </clipPath>
        </defs>
        {body ? (
          <g>
            <rect x="0" y="24" width="200" height="256" fill="url(#swp-body)" />
            <g clip-path="url(#swp-clip)">
              <polygon points={`${((now / 1000) * 0.45 % 1 * 2 - 0.5) * 200},24 ${((now / 1000) * 0.45 % 1 * 2 - 0.5) * 200 + 30},24 ${((now / 1000) * 0.45 % 1 * 2 - 0.5) * 200 - 30},280 ${((now / 1000) * 0.45 % 1 * 2 - 0.5) * 200 - 60},280`} fill={p.on} opacity="0.22" />
            </g>
            {Array.from({ length: 20 }, (_, k) => (
              <polygon key={k} points={`${k * 10},270 ${k * 10 + 10},270 ${k * 10 + 5},280`} fill={p.dark} opacity="0.15" />
            ))}
            <text x="100" y="92" text-anchor="middle" font-size="30" font-weight="700" fill={p.on}>Semester</text>
            <text x="100" y="124" text-anchor="middle" font-size="30" font-weight="700" fill={p.on}>wrapped</text>
            <polygon points={star(100, 170, 44, 18, 5)} fill={p.yellow} stroke={p.on} stroke-width="2" stroke-linejoin="round" />
            <text x="100" y="178" text-anchor="middle" font-size="24" font-weight="700" fill={p.dark}>{digits}</text>
            <text x="100" y="232" text-anchor="middle" font-size="13" fill={p.on}>{`${N} ${N === 1 ? "card" : "cards"}${hasHolo ? " · 1 holo rare" : ""}`}</text>
          </g>
        ) : null}
        {strip ? (
          <g>
            <rect x="0" y="0" width="200" height="24" fill={mix(p.blue, p.on, 0.25)} />
            {Array.from({ length: 18 }, (_, k) => (
              <circle key={k} cx={8 + k * 10.6} cy="24" r="1.6" fill={p.dark} opacity="0.5" />
            ))}
          </g>
        ) : null}
      </svg>
    );

    // ---- Card art ----
    const artH = (w: number) => (66 * w) / 108;
    const art = (card: Card, i: number, w: number) => {
      const s = now / 1000;
      const base = col[i % 6]!;
      let g: unknown = null;
      if (card.kind === "study") {
        g = (
          <g>
            <circle cx="80" cy="16" r="14" fill={p.cream} opacity="0.3" />
            <circle cx="80" cy="16" r="6" fill={p.cream} />
            <rect x="34" y="50" width="40" height="7" rx="1.5" fill={p.blue} />
            <rect x="36" y="43" width="36" height="7" rx="1.5" fill={p.red} />
            <rect x="33" y="36" width="32" height="7" rx="1.5" fill={p.yellow} />
          </g>
        );
      } else if (card.kind === "food") {
        g = (
          <g>
            <rect x="14" y="22" width="72" height="34" rx="6" fill={p.tile} />
            <circle cx="38" cy="39" r="13" fill={p.plate} />
            {Array.from({ length: 5 }, (_, k) => (
              <circle key={k} cx={38 + Math.cos(k * 1.3) * 3} cy={39 + Math.sin(k * 1.3) * 3} r="5" fill="none" stroke={p.green} stroke-width="1.6" />
            ))}
            <rect x="55" y="28" width="18" height="22" rx="3" fill={p.orange} />
          </g>
        );
      } else if (card.kind === "chat") {
        const ws = [28, 41, 34, 47];
        g = (
          <g>
            {ws.map((bw, k) => {
              const y = 58 - (((s * 0.7 + k * 0.25) % 1) * 4 * 14);
              const right = k % 2 === 1;
              return <rect key={k} x={right ? 92 - bw : 8} y={y} width={bw} height="12" rx="6" fill={right ? p.blue : p.paper} />;
            })}
          </g>
        );
      } else if (card.kind === "music") {
        g = (
          <g>
            <circle cx="44" cy="35" r="26" fill={p.dark} />
            {[12, 16.5, 21].map((r) => (
              <circle key={r} cx="44" cy="35" r={r} fill="none" stroke={mix(p.dark, p.on, 0.15)} stroke-width="0.8" />
            ))}
            <circle cx="44" cy="35" r="8" fill={p.red} />
            <line x1="84" y1="13" x2="66" y2="45" stroke={p.tile} stroke-width="2.5" stroke-linecap="round" />
          </g>
        );
      } else if (card.kind === "night") {
        g = (
          <g>
            <circle cx="76" cy="24" r="12" fill={p.cream} />
            <circle cx="81" cy="20" r="10" fill={base} />
            <rect x="64" y="48" width="30" height="18" rx="2" fill={p.sky} />
          </g>
        );
      }
      const person = card.kind === "study" || card.kind === "chat" || card.kind === "night" ? memberNamed(card.who) : undefined;
      const aw = w - 12;
      const ah = artH(w);
      const squad = card.kind === "squad" ? members.slice(0, 6) : [];
      return (
        <div style={{ position: "relative", width: aw, height: ah, borderRadius: 6, overflow: "hidden", background: base, flex: "none" }}>
          <svg width={aw} height={ah} viewBox="0 0 100 66" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", left: 0, top: 0 }}>
            <rect x="0" y="0" width="100" height="20" fill={mix(base, c.card, 0.15)} />
            {g as never}
          </svg>
          {person ? (
            <div style={{ position: "absolute", left: 8, bottom: 6, display: "flex" }}>
              <Avatar user={person} size={26} />
            </div>
          ) : null}
          {squad.map((m, k) => (
            <div key={m.id} style={{ position: "absolute", left: ((12 + k * 15.5) / 100) * aw - 10, top: ((k % 2 === 0 ? 24 : 38) / 66) * ah - 10, display: "flex", borderRadius: 12, boxShadow: `0 0 0 2px ${c.card}` }}>
              <Avatar user={m} size={20} />
            </div>
          ))}
        </div>
      );
    };

    const front = (card: Card, i: number, w: number, h: number, detail: boolean) => {
      const base = col[i % 6]!;
      const t = fitText(card.title, w - 12 - 18, { size: 11, min: 9, weight: 600 });
      const big = fitText(card.big, w - 12, { size: detail ? 40 : 26, min: 16, weight: 700 });
      return (
        <div style={{ position: "relative", width: w, height: h, borderRadius: 12, background: c.card, padding: 6, boxSizing: "border-box", overflow: "hidden", display: "flex", flexDirection: "column", gap: 3, textAlign: "left", boxShadow: `0 3px 0 ${p.dark}` }}>
          <div style={{ height: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
            <span style={{ minWidth: 0, fontSize: t.size, fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{t.text}</span>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ flex: "none" }}>
              <polygon points={star(7, 7, 6, 2.6, 4)} fill={base} />
            </svg>
          </div>
          {art(card, i, w)}
          <div style={{ fontSize: big.size, fontWeight: 700, lineHeight: `${Math.round(big.size * 1.15)}px`, color: c.text, whiteSpace: "nowrap" }}>{big.text}</div>
          <div style={{ fontSize: detail ? 13 : 10, lineHeight: detail ? "16px" : "12px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.unit}</div>
          <div style={{ fontSize: detail ? 16 : 12, fontWeight: 600, lineHeight: detail ? "20px" : "16px", color: c.link, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.who}</div>
          {detail ? <div style={{ fontSize: 14, lineHeight: "18px", color: c.secondaryText }}>{card.detail}</div> : null}
          {card.kind === "squad" ? (
            <svg width={w} height={h} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
              {Array.from({ length: 10 }, (_, k) => {
                const x = ((((k * 0.2 + (now / 1000) * 0.25) % 1) * 2 - 0.5) * w);
                const sc = [c.series1, c.series2, c.series3, c.series4, c.series5, c.series6][k % 6]!;
                return <polygon key={k} points={`${x},0 ${x + 14},0 ${x + 14 - 40},${h} ${x - 40},${h}`} fill={sc} opacity="0.16" />;
              })}
            </svg>
          ) : null}
        </div>
      );
    };

    const back = (i: number) => {
      const base = col[i % 6]!;
      const h = 166;
      const rot = ((now / 1000) * 0.4 + i) * (180 / Math.PI);
      return (
        <svg width={cw} height={h} viewBox={`0 0 ${cw} ${h}`} aria-hidden="true" style={{ display: "block" }}>
          <defs>
            <clipPath id={`swc-${i}`}>
              <rect x="6" y="6" width={cw - 12} height={h - 12} rx="8" />
            </clipPath>
          </defs>
          <rect x="0" y="0" width={cw} height={h} rx="12" fill={p.dark} />
          <rect x="6" y="6" width={cw - 12} height={h - 12} rx="8" fill={mix(base, p.dark, 0.35)} />
          <g clip-path={`url(#swc-${i})`}>
            {Array.from({ length: 20 }, (_, k) => (
              <polygon key={k} points={`${k * 16 - 60},${h} ${k * 16 - 60 + 5},${h} ${k * 16 - 60 + 5 + h},0 ${k * 16 - 60 + h},0`} fill={p.on} opacity="0.07" />
            ))}
          </g>
          <g transform={`translate(${cw / 2} ${h / 2}) rotate(${rot})`}>
            <polygon points={star(0, 0, 20, 8, 4)} fill={p.on} />
          </g>
        </svg>
      );
    };

    const cardAt = (card: Card, i: number) => {
      const f = flipped(i);
      const s = slot(i);
      const dealt = ripE === null ? 1 : (() => {
        const el = ripE - (250 + i * 120);
        return el <= 0 ? -1 : deal(Math.min(el, 900));
      })();
      if (dealt === -1) return null;
      const fe = f ? running(f.at, 450) : null;
      const k = fe === null ? 1 : fe / 450;
      const showBack = !f || k < 0.5;
      const sx = fe === null ? 1 : Math.abs(Math.cos(k * Math.PI));
      const lift = fe === null ? 0 : Math.sin(k * Math.PI) * 10;
      const ox = (W / 2 - cw / 2 - s.x) * (1 - dealt);
      const oy = (250 - 83 - s.y) * (1 - dealt);
      const scale = 0.6 + 0.4 * dealt;
      return (
        <button
          key={i}
          type="button"
          aria-label={f ? `${card.title}: ${card.big} ${card.unit}, ${card.who}` : `Flip card ${i + 1}`}
          onClick={() => {
            if (f) setLocal({ focus: i });
            else {
              dispatch({ t: "flip", card: i });
              if (nFlips === N - 1) haptic("success");
            }
          }}
          style={{ position: "absolute", left: s.x, top: s.y, width: cw, height: 166, padding: 0, background: "none", transform: `translate(${ox}px, ${oy - lift}px) scale(${scale * sx}, ${scale})` }}
        >
          {showBack ? back(i) : front(card, i, cw, 166, false)}
        </button>
      );
    };

    // ---- Footer text ----
    const openers = state.packs.map((x) => x.u);
    const openerNames = state.packs.map((x) => members.find((m) => m.id === x.u)?.name).filter((x): x is string => !!x);
    const openedLine =
      openerNames.length === 0 ? "Be the first to open yours" : openerNames.length === 1 ? `${openerNames[0]} opened theirs` : openerNames.length === 2 ? `${openerNames[0]} and ${openerNames[1]} opened theirs` : `${openerNames[0]}, ${openerNames[1]} and ${openerNames.length - 2} ${openerNames.length - 2 === 1 ? "other" : "others"} opened theirs`;
    const sharedByOthers = state.packs.filter((x) => x.shared > 0 && x.u !== me);
    const lastFlip = mine && mine.flips.length > 0 ? mine.flips[mine.flips.length - 1]! : null;
    const fullToast = full && lastFlip !== null && lastFlip.at > 0 && running(lastFlip.at, 2600) !== null;
    const sharedToast = mine && mine.shared > 1 && running(mine.shared, 2600) !== null;

    const focusCard = local.focus >= 0 && local.focus < N && flipped(local.focus) ? state.cards[local.focus]! : null;

    return (
      <div>
        <div role="region" aria-label={`${state.term} wrapped`} style={{ position: "relative", height: PANEL_H, borderRadius: 12, overflow: "hidden", backgroundColor: p.dark, backgroundImage: `linear-gradient(180deg, ${mix(p.red, p.dark, 0.25)}, ${p.dark})` }}>
          <svg width={W} height={PANEL_H} viewBox={`0 0 ${W} ${PANEL_H}`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
            {Array.from({ length: 10 }, (_, k) => {
              const sz = [5, 7, 9][k % 3]!;
              const x = (k * 97 + 30) % W;
              const y = 90 + ((k * 173 + (now / 1000) * 8) % (PANEL_H - 120));
              return <polygon key={k} points={star(x, y, sz, sz * 0.3, 4)} fill={p.on} opacity="0.12" />;
            })}
          </svg>

          <div style={{ position: "absolute", left: 8, right: 8, top: 6, height: 3, borderRadius: 2, background: p.on, opacity: 0.35 }} />
          <div style={{ position: "absolute", left: 8, top: 6, height: 3, borderRadius: 2, background: p.on, width: (W - 16) * (nFlips / N) }} />

          <div style={{ position: "absolute", left: 12, top: 14, height: 32, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 30, height: 30, borderRadius: 15, background: c.card, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke={c.primary} stroke-width="3">
                <circle cx="8" cy="8" r="6" />
              </svg>
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, color: p.on }}>Muse</span>
            <span style={{ fontSize: 13, color: p.on }}>Your semester · from the chat</span>
          </div>

          <div style={{ position: "absolute", left: 12, top: 52, height: 40, lineHeight: "40px", fontSize: title.size, fontWeight: 700, color: p.on, whiteSpace: "nowrap" }}>{title.text}</div>

          {!mine ? (
            <>
              <button
                type="button"
                aria-label="Open pack"
                onClick={() => here && dispatch({ t: "rip" })}
                style={{ position: "absolute", left: W / 2 - 100, top: 250 + Math.sin((now / 1000) * 1.6) * 6 - 140, width: 200, height: 280, padding: 0, background: "none", transform: `rotate(${Math.sin((now / 1000) * 1.1) * 2.3}deg)` }}
              >
                {pack(true, true)}
              </button>
              <div style={{ position: "absolute", left: (W - 170) / 2, top: 448, width: 170 }}>
                <Button kind="secondary" wide onClick={() => here && dispatch({ t: "rip" })}>
                  Open pack
                </Button>
              </div>
              <div style={{ position: "absolute", left: 12, right: 12, top: 506, height: 24, display: "flex", alignItems: "center", gap: 8 }}>
                {openers.length > 0 ? <Facepile users={openers} max={3} size={22} /> : null}
                <span style={{ minWidth: 0, fontSize: 13, color: p.on, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{openedLine}</span>
              </div>
            </>
          ) : (
            <>
              {ripE !== null && ripE < 1100 ? (
                <div style={{ position: "absolute", left: W / 2 - 100, top: 250 + Math.sin((now / 1000) * 1.6) * 6 - 140, width: 200, height: 280, pointerEvents: "none" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, width: 200, height: 280, transform: `translateY(${ripE > 500 ? 420 * slide((ripE - 500) / 600 > 1 ? 600 : ripE - 500) : 0}px)` }}>{pack(false, true)}</div>
                  <div style={{ position: "absolute", left: 0, top: 0, width: 200, height: 280, transform: (() => { const k = Math.min(1, ripE / 500); return `translate(${k * 160}px, ${-k * 120 + k * k * 60}px) rotate(${k * 80}deg)`; })() }}>{pack(true, false)}</div>
                </div>
              ) : null}

              {state.cards.map(cardAt)}

              <div style={{ position: "absolute", left: 12, right: 12, top: 458, height: 20, display: "flex", alignItems: "center", gap: 10 }}>
                <svg width={N * 16} height="16" viewBox={`0 0 ${N * 16} 16`} aria-hidden="true" style={{ flex: "none" }}>
                  {state.cards.map((_, i) => (flipped(i) ? <circle key={i} cx={8 + i * 16} cy="8" r="6" fill={col[i % 6]!} /> : <circle key={i} cx={8 + i * 16} cy="8" r="5.25" fill="none" stroke={p.on} stroke-width="1.5" opacity="0.6" />))}
                </svg>
                <span style={{ minWidth: 0, fontSize: 13, color: p.on, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{full ? "Full set · Tap a card to hold it up" : `${nFlips} of ${N} · Tap a card to flip it`}</span>
              </div>

              {full && mine.shared === 0 ? (
                <div style={{ position: "absolute", left: 12, right: 12, top: 492, height: 44 }}>
                  <Button kind="primary" wide onClick={() => dispatch({ t: "share" })}>
                    Share
                  </Button>
                </div>
              ) : null}
              {mine.shared > 0 ? (
                <div style={{ position: "absolute", left: 12, right: 12, top: 492, height: 44, borderRadius: 8, backgroundColor: mix(p.dark, p.on, 0.12), display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {sharedByOthers.length > 0 ? <Facepile users={sharedByOthers.map((x) => x.u)} max={3} size={22} /> : null}
                  <span style={{ fontSize: 13, color: p.on, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{`On your story${sharedByOthers.length > 0 ? ` · ${sharedByOthers.length} ${sharedByOthers.length === 1 ? "other" : "others"} shared theirs` : ""}`}</span>
                </div>
              ) : null}
            </>
          )}

          {focusCard ? (
            <button type="button" aria-label="Put it back" onClick={() => setLocal({ focus: -1 })} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", padding: 0, background: "none", zIndex: 10 }}>
              <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", backgroundColor: p.dark, opacity: 0.7 }} />
              <div style={{ position: "absolute", left: (W - 240) / 2, top: 85 }}>{front(focusCard, local.focus, 240, 370, true)}</div>
              <div style={{ position: "absolute", left: 0, right: 0, top: 465, textAlign: "center", fontSize: 13, color: p.on }}>Tap anywhere to put it back</div>
            </button>
          ) : null}
        </div>
        {sharedToast ? <Toast key={mine!.shared}>Shared to your story</Toast> : fullToast ? <Toast key={lastFlip!.at}>{`Full set: ${N} of ${N}`}</Toast> : null}
      </div>
    );
  },
});
