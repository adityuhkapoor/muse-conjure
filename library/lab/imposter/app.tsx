import {
  defineApp,
  Avatar,
  Burst,
  Button,
  CardHeader,
  Facepile,
  clock,
  fitText,
  haptic,
  mix,
  rng,
  running,
  tween,
  type Ctx,
} from "@muse/app";

// Imposter: everyone in the chat gets the same secret word except one. Flip your card to peek (only
// you see it), drop a one-word clue that shows as a chat bubble over your face, then the clues become
// a poll: vote out the faker and the cards flip. The state holds both words and the imposter's id;
// secrecy is the view's job, so the view reads your word from `confirmed` and nothing else shows it.

type Pair = { word: string; odd: string; hints: string[]; oddHints: string[] };
type Params = {
  /** What the chat calls itself in copy: "girls" */
  crew: string;
  /** 1 to 6 rounds: the crowd's word, the imposter's word, and clue suggestions for each side. */
  pairs: Pair[];
  /** Member name who has the odd word in round 1. */
  imposter: string;
  /** Round 1 clues already in the chat. */
  clues: { by: string; text: string }[];
};

// @params
const P: Params = {
  crew: "girls",
  pairs: [
    { word: "Beach", odd: "Pool", hints: ["seashells", "towel", "salty"], oddHints: ["chlorine", "cannonball", "deep end"] },
    { word: "Coffee", odd: "Matcha", hints: ["oat milk", "jitters", "Starbucks line"], oddHints: ["green", "cozy", "whisked"] },
  ],
  imposter: "Ana",
  clues: [{ by: "Lily", text: "sandy" }, { by: "Maya", text: "sunscreen" }, { by: "Ana", text: "lifeguard" }, { by: "Priya", text: "waves" }],
};
// @end params

type Clue = { u: string; text: string; at: number };
type Phase = "clues" | "vote" | "reveal";
type State = {
  crew: string;
  pairs: Pair[];
  round: number;
  pair: number;
  players: string[];
  imposter: string;
  clues: Clue[];
  votes: { u: string; for: string }[];
  phase: Phase;
  revealAt: number;
  left: string;
  dealtAt: number;
};
type Action = { t: "clue"; text: string } | { t: "call" } | { t: "vote"; for: string } | { t: "next" };
type Local = { peekAt: number; hideAt: number; peeked: number };

const FALLBACK: Pair = { word: "Beach", odd: "Pool", hints: ["seashells", "towel", "salty"], oddHints: ["chlorine", "cannonball", "deep end"] };
const FLIP = tween({ duration: 300, easing: "standard" });
const POP = tween({ duration: 350, easing: [0.34, 1.56, 0.64, 1] });
const PEEK_MS = 3000;

const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");
const has = (text: string, word: string) => word !== "" && text.toLowerCase().includes(word.toLowerCase());
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const pairOf = (s: State): Pair => s.pairs[s.pair] ?? FALLBACK;
const wordFor = (s: State, u: string) => (u === s.imposter ? pairOf(s).odd : pairOf(s).word);
const hasClue = (s: State, u: string) => s.clues.some((c) => c.u === u);
const hasVoted = (s: State, u: string) => s.votes.some((v) => v.u === u);
const allClued = (s: State) => s.players.length >= 3 && s.players.every((u) => hasClue(s, u));
const allVoted = (s: State) => s.players.length > 0 && s.players.every((u) => hasVoted(s, u));
/** A stable uint32 for a string (FNV-1a), so the same chat always deals the same way. */
function hashOf(s: string): number {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x1000193);
  return (x ^ (x >>> 13)) >>> 0;
}
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The unique top-voted player, or null on a tie or no votes. */
function outed(s: State): string | null {
  const counts = new Map<string, number>();
  for (const v of s.votes) counts.set(v.for, (counts.get(v.for) ?? 0) + 1);
  let top = 0;
  let who: string | null = null;
  let tie = false;
  for (const [u, k] of counts) {
    if (k > top) {
      top = k;
      who = u;
      tie = false;
    } else if (k === top) tie = true;
  }
  return tie ? null : who;
}

function initState(ctx: Ctx): State {
  const pairs: Pair[] = [];
  for (const raw of P.pairs) {
    if (pairs.length >= 6) break;
    const word = clean(raw.word, 16);
    const odd = clean(raw.odd, 16);
    if (!word || !odd || word.toLowerCase() === odd.toLowerCase()) continue;
    const hints = (xs: unknown, own: string) =>
      (Array.isArray(xs) ? xs : [])
        .map((x) => clean(x, 16))
        .filter((x) => x && !has(x, own))
        .slice(0, 3);
    pairs.push({ word, odd, hints: hints(raw.hints, word), oddHints: hints(raw.oddHints, odd) });
  }
  if (!pairs.length) pairs.push(FALLBACK);
  const players = ctx.members.map((m) => m.id);
  const match = (name: string) => ctx.members.find((m) => m.id === name || m.name.toLowerCase() === name.trim().toLowerCase());
  const seeded: { u: string; text: string }[] = [];
  for (const c of P.clues) {
    const m = match(typeof c.by === "string" ? c.by : "");
    if (m && !seeded.some((x) => x.u === m.id)) seeded.push({ u: m.id, text: clean(c.text, 32) });
  }
  let imposter = "";
  if (players.length >= 3) {
    const named = match(clean(P.imposter, 40));
    if (named) imposter = named.id;
    else {
      const quiet = players.filter((u) => !seeded.some((x) => x.u === u));
      const list = quiet.length ? quiet : players;
      imposter = list[hashOf(players.join()) % list.length]!;
    }
  }
  const base: State = { crew: clean(P.crew, 12) || "group", pairs, round: 0, pair: 0, players, imposter, clues: [], votes: [], phase: "clues", revealAt: 0, left: "", dealtAt: 0 };
  const clues: Clue[] = seeded
    .filter((x) => x.text && !has(x.text, wordFor(base, x.u)))
    .map((x) => ({ u: x.u, text: x.text, at: 0 }));
  const next: State = { ...base, clues };
  return allClued(next) ? { ...next, phase: "vote" } : next;
}

// ---- drawing ----

const CSS =
  "@keyframes imDot{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-2.5px)}}" +
  "@keyframes imPop{from{transform:translateY(10px) scale(.2);opacity:0}to{transform:none;opacity:1}}" +
  "@keyframes imFade{from{opacity:0}to{opacity:1}}" +
  ".im-dot{animation:imDot 1s ease-in-out infinite}" +
  ".im-pop{animation:imPop .35s cubic-bezier(.34,1.56,.64,1) both}" +
  ".im-fade{animation:imFade .2s ease-out both}" +
  ".im-card:active{filter:brightness(.97)}" +
  "@media (prefers-reduced-motion:reduce){.im-dot,.im-pop,.im-fade{animation:none}}";

const eye = (c: Record<string, string>) => (
  <svg viewBox="0 0 36 36" width={36} height={36} aria-hidden="true" style={{ display: "block" }}>
    <circle cx={18} cy={18} r={18} fill={c.secondaryButton} />
    <ellipse cx={18} cy={18} rx={9} ry={5.5} fill={c.text} />
    <circle cx={18} cy={18} r={3.6} fill={c.secondaryButton} />
    <circle cx={18} cy={18} r={2} fill={c.text} />
  </svg>
);

const check = (c: Record<string, string>) => (
  <svg viewBox="0 0 12 12" width={12} height={12} fill="none" stroke={c.onPrimary} stroke-width={2} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2.5 6.2 5 8.6 9.5 3.6" />
  </svg>
);

export default defineApp<State, Action, Local>({
  name: "Imposter",
  summary: (s, ctx) => {
    const n = s.players.length;
    if (s.phase === "clues") return `Imposter · round ${s.round + 1} · ${s.clues.length} of ${n} clues in`;
    if (s.phase === "vote") return `Imposter · round ${s.round + 1} · ${s.votes.length} of ${n} voted`;
    const name = ctx.members.find((m) => m.id === s.imposter)?.name ?? "The imposter";
    if (s.left) return `Imposter · ${name} left · round over`;
    return `Imposter · ${name} was the imposter · ${outed(s) === s.imposter ? "caught" : "got away"}`;
  },

  init: (ctx) => initState(ctx),

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    const me = meta.user;
    if (action.t === "clue") {
      if (state.phase !== "clues" || !state.players.includes(me) || hasClue(state, me) || typeof action.text !== "string") return state;
      const text = action.text.trim().slice(0, 32);
      if (!text || has(text, wordFor(state, me))) return state;
      const next: State = { ...state, clues: [...state.clues, { u: me, text, at: meta.time }] };
      return allClued(next) ? { ...next, phase: "vote" } : next;
    }
    if (action.t === "call") {
      if (state.phase === "clues") {
        if (!hasClue(state, me) || state.clues.length < 3 || state.imposter === "") return state;
        return { ...state, phase: "vote" };
      }
      if (state.phase === "vote") {
        if (!hasVoted(state, me) || state.votes.length * 2 < state.players.length) return state;
        return { ...state, phase: "reveal", revealAt: meta.time };
      }
      return state;
    }
    if (action.t === "vote") {
      const target = action.for;
      if (state.phase !== "vote" || !state.players.includes(me) || hasVoted(state, me)) return state;
      if (typeof target !== "string" || !state.players.includes(target) || target === me) return state;
      const next: State = { ...state, votes: [...state.votes, { u: me, for: target }] };
      return allVoted(next) ? { ...next, phase: "reveal", revealAt: meta.time } : next;
    }
    if (action.t === "next") {
      if (state.phase !== "reveal") return state;
      const players = ctx.members.map((m) => m.id);
      return {
        ...state,
        players,
        round: state.round + 1,
        pair: (state.pair + 1) % state.pairs.length,
        imposter: players.length >= 3 ? rng(meta.seed).pick(players) : "",
        clues: [],
        votes: [],
        phase: "clues",
        revealAt: 0,
        left: "",
        dealtAt: meta.time,
      };
    }
    return state;
  },

  onMembers: (state, ctx) => {
    const players = state.players.filter((u) => inChat(ctx, u));
    const gone = players.length !== state.players.length;
    let next = state;
    if (gone) {
      next = {
        ...next,
        players,
        clues: next.clues.filter((c) => players.includes(c.u)),
        votes: next.votes.filter((v) => players.includes(v.u) && players.includes(v.for)),
      };
      if (state.imposter !== "" && !players.includes(state.imposter)) {
        next = { ...next, phase: "reveal", left: state.imposter };
      }
    }
    if (next.phase === "clues") {
      const joined = ctx.members.map((m) => m.id).filter((u) => !next.players.includes(u));
      if (joined.length) next = { ...next, players: [...next.players, ...joined] };
      if (next.imposter === "" && next.players.length >= 3) next = { ...next, imposter: next.players[hashOf(next.players.join()) % next.players.length]! };
    }
    return next === state ? state : next;
  },

  invariants: {
    "players are in the chat, once each": (s, ctx) => new Set(s.players).size === s.players.length && s.players.every((u) => ctx.members.some((m) => m.id === u)),
    "the imposter is a player": (s) => (s.imposter === "" ? s.phase === "clues" && s.players.length < 3 : s.players.includes(s.imposter) || s.left === s.imposter),
    "one clue per player": (s) =>
      new Set(s.clues.map((c) => c.u)).size === s.clues.length && s.clues.every((c) => s.players.includes(c.u) && c.text.length >= 1 && c.text.length <= 24),
    "no clue says its sender's word": (s) => s.clues.every((c) => !has(c.text, wordFor(s, c.u))),
    "no votes before the vote": (s) => s.phase !== "clues" || s.votes.length === 0,
    "one vote each, never for yourself": (s) =>
      new Set(s.votes.map((v) => v.u)).size === s.votes.length && s.votes.every((v) => v.u !== v.for && s.players.includes(v.u) && s.players.includes(v.for)),
    "a reveal has a time or a leaver": (s) => (s.phase === "reveal") === (s.revealAt > 0 || s.left !== ""),
    "pair and round in range": (s) => Number.isInteger(s.pair) && s.pair >= 0 && s.pair < s.pairs.length && Number.isInteger(s.round) && s.round >= 0,
  },

  transitions: {
    "a clue adds only the sender's, once": (p, n, a, m) => {
      if (a.t !== "clue" || p === n) return true;
      const last = n.clues[n.clues.length - 1];
      return p.phase === "clues" && !hasClue(p, m.user) && n.clues.length === p.clues.length + 1 && !!last && last.u === m.user && last.at === m.time;
    },
    "the vote opens when everyone has a clue": (p, n, a) => a.t !== "clue" || p === n || (n.phase === "vote") === (n.players.length >= 3 && n.players.every((u) => n.clues.some((c) => c.u === u))),
    "a vote adds only the voter's": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const last = n.votes[n.votes.length - 1];
      return p.phase === "vote" && n.votes.length === p.votes.length + 1 && !!last && last.u === m.user && last.for === a.for;
    },
    "the last vote reveals": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const all = n.players.every((u) => n.votes.some((v) => v.u === u));
      return (n.phase === "reveal") === all && (n.phase !== "reveal" || n.revealAt === m.time);
    },
    "calling needs your own clue or vote": (p, n, a, m) => {
      if (a.t !== "call" || p === n) return true;
      if (p.phase === "clues") return p.clues.some((c) => c.u === m.user) && p.clues.length >= 3 && n.phase === "vote";
      return p.votes.some((v) => v.u === m.user) && p.votes.length * 2 >= p.players.length && n.phase === "reveal" && n.revealAt === m.time;
    },
    "word and imposter hold for the round": (p, n, a) => a.t === "next" || (n.round === p.round && n.pair === p.pair && (p.imposter === "" || n.imposter === p.imposter)),
    "the seed picks the imposter": (p, n, a, m) =>
      a.t !== "next" ||
      p === n ||
      (p.phase === "reveal" && n.round === p.round + 1 && n.imposter === (n.players.length >= 3 ? rng(m.seed).pick(n.players) : "") && n.clues.length === 0 && n.votes.length === 0 && n.phase === "clues"),
    "nothing changes after the reveal but a deal": (p, n, a) => p.phase !== "reveal" || a.t === "next" || p === n,
    "only people in the chat play": (p, n, _a, m, ctx) => p === n || ctx.members.some((x) => x.id === m.user),
  },

  arbitrary: (s, user, r) => {
    const side = (u: string) => (u === s.imposter ? pairOf(s).oddHints : pairOf(s).hints);
    if (s.phase === "clues") {
      if (s.players.includes(user) && !hasClue(s, user) && r.next() < 0.9) {
        if (r.next() < 0.05) return { t: "clue", text: wordFor(s, user) };
        const hints = side(user);
        return { t: "clue", text: hints.length ? r.pick(hints) : "vibes" };
      }
      return { t: "call" };
    }
    if (s.phase === "vote") {
      const others = s.players.filter((u) => u !== user);
      if (s.players.includes(user) && !hasVoted(s, user) && others.length) return { t: "vote", for: r.pick(others) };
      return { t: "call" };
    }
    return { t: "next" };
  },

  local: { peekAt: 0, hideAt: 0, peeked: -1 },

  view: ({ state, confirmed, pending, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width - 2 * theme.space.card;
    const cs = confirmed;
    const dealing = pending && state.round !== cs.round;
    const s = dealing ? cs : state;
    const pr = pairOf(cs);
    const here = cs.players.includes(me);
    const myWord = here ? (me === cs.imposter ? pr.odd : pr.word) : null;
    const myHints = here ? (me === cs.imposter ? pr.oddHints : pr.hints) : [];
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const person = (id: string) => (id === me ? "You" : nameOf(id));
    const n = s.players.length;
    const revealed = cs.phase === "reveal";
    const revealRun = revealed && cs.revealAt > 0 ? running(cs.revealAt, 1000) : null;
    const outcomeOn = revealed && revealRun === null;
    const crew = cs.crew;

    // The word card flips locally: opens on a tap, closes by itself after three seconds.
    const run = local.peekAt > 0 ? running(local.peekAt, PEEK_MS + 300) : null;
    const closeAt = local.hideAt > local.peekAt ? local.hideAt - local.peekAt : PEEK_MS;
    let k = 0;
    if (revealed && here) k = 1;
    else if (run !== null) k = run < closeAt ? FLIP(Math.min(run, 300)) : 1 - FLIP(Math.min(run - closeAt, 300));
    const open = k > 0.5;
    const sx = Math.max(0.02, Math.abs(2 * k - 1));
    const flipping = k > 0 && k < 1;
    const peekedNow = run !== null && run < closeAt;
    const other = cs.players.find((u) => u !== me);
    const cover = other ? `Cover your screen from ${nameOf(other)}` : "Cover your screen";
    const hint = myWord !== null && me === cs.imposter ? "Everyone else has another word. Blend in." : `One of the ${crew} has a different word.`;

    const peek = () => {
      if (!here) return;
      const now = clock.value;
      if (peekedNow && !revealed) setLocal({ hideAt: now });
      else if (!revealed) setLocal({ peekAt: now, hideAt: 0, peeked: cs.round });
    };

    const wordCard = !here ? (
      <div style={{ height: 52, borderRadius: 12, background: c.wash, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 15, fontWeight: 600, color: c.text }}>You're watching this round</div>
    ) : (
      <button
        type="button"
        class="im-card"
        aria-label={open ? "Your word. Tap to hide" : "Peek at your word"}
        onClick={peek}
        disabled={dealing}
        style={{ position: "relative", display: "block", width: "100%", height: 52, padding: 0, borderRadius: 12, background: c.wash, color: c.text, textAlign: "left", transform: flipping ? `scaleX(${Math.round(sx * 100) / 100})` : undefined, overflow: "hidden" }}
      >
        {dealing || (!open && sx < 0.6 && flipping) ? null : !open ? (
          <>
            <span style={{ position: "absolute", left: 12, top: 8 }}>{eye(c)}</span>
            <span style={{ position: "absolute", left: 58, top: 7, right: 8, fontSize: 15, fontWeight: 600, lineHeight: "20px", whiteSpace: "nowrap" }}>{local.peeked >= 0 ? "Tap to peek again" : "Tap to peek at your word"}</span>
            <span style={{ position: "absolute", left: 58, top: 28, right: 8, fontSize: 13, lineHeight: "16px", color: c.secondaryText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cover}</span>
          </>
        ) : sx < 0.6 ? null : (
          <>
            <span style={{ position: "absolute", left: 14, top: 8, fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>Your word</span>
            <span style={{ position: "absolute", left: 14, top: 26, fontSize: 17, fontWeight: 700, lineHeight: "22px", color: c.text, maxWidth: W - 140 - 14, whiteSpace: "nowrap" }}>{myWord}</span>
            <span style={{ position: "absolute", right: 12, top: 8, width: W - 140, textAlign: "right", fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>{hint}</span>
          </>
        )}
      </button>
    );

    // ---- the table: faces in a row, a bubble over each ----
    const seatsList: (string | null)[] = [...s.players.slice(0, 12)];
    while (seatsList.length < 3) seatsList.push(null);
    const count = seatsList.length;
    const two = count > 6;
    const per = two ? Math.ceil(count / 2) : count;
    const slot = two ? W / per : count < 5 ? W / 5 : W / count;
    const off = two ? 0 : (W - slot * per) / 2;
    const faceSize = two ? 28 : 36;
    const rowH = two ? 96 : 122;
    const yB = two ? 20 : 38;
    const yF = two ? 54 : 82;
    const yN = two ? 82 : 112;
    const tableH = two ? 192 : 122;

    const table = (
      <div style={{ position: "relative", height: tableH }} role="group" aria-label="Players">
        {seatsList.map((u, i) => {
          const row = two ? Math.floor(i / per) : 0;
          const col = two ? i % per : i;
          const left = off + col * slot;
          const top = row * rowH;
          if (u === null) {
            return (
              <div key={`empty${i}`} style={{ position: "absolute", left, top, width: slot, height: rowH }}>
                <div style={{ position: "absolute", left: slot / 2 - 18, top: yF - 18, width: 36, height: 36, borderRadius: 18, border: `2px dashed ${c.divider}`, boxSizing: "border-box" }} />
              </div>
            );
          }
          const clue = s.clues.find((x) => x.u === u);
          const mine = u === me;
          const fit = clue ? fitText(clue.text, slot - 14, { size: 13, min: clue.text.includes(" ") ? 11 : 10 }) : null;
          const wrap = !!clue && !!fit && fit.text !== clue.text;
          const popping = !!clue && clue.at > 0 && running(clue.at, 350) !== null;
          const pk = popping ? POP(Math.min(350, running(clue!.at, 350) ?? 350)) : 1;
          const label = person(u);
          const nameFit = fitText(label, slot - 4, { size: 13, min: 11 });
          return (
            <div key={u} style={{ position: "absolute", left, top, width: slot, height: rowH }}>
              <div style={{ position: "absolute", left: slot / 2, top: yB, transform: "translate(-50%,-50%)", display: "flex", justifyContent: "center" }}>
                {clue ? (
                  <span
                    {...(popping ? { class: "im-pop" } : {})}
                    style={{
                      display: "block",
                      maxWidth: slot - 6,
                      padding: "5px 6px",
                      borderRadius: 14,
                      background: mine ? c.primary : c.input,
                      color: mine ? c.onPrimary : c.text,
                      fontSize: wrap ? 11 : fit!.size,
                      lineHeight: wrap ? "13px" : "18px",
                      textAlign: "center",
                      whiteSpace: wrap ? "normal" : "nowrap",
                      opacity: pk < 0.1 ? 0 : 1,
                    }}
                  >
                    {wrap ? clue.text : fit!.text}
                  </span>
                ) : (
                  <span aria-label={`${label} is typing`} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: 40, height: 24, borderRadius: 12, background: c.input }}>
                    {[0, 1, 2].map((d) => (
                      <span key={d} class="im-dot" style={{ width: 5.2, height: 5.2, borderRadius: 3, background: c.secondaryText, animationDelay: `${d * 0.1}s` }} />
                    ))}
                  </span>
                )}
              </div>
              <div style={{ position: "absolute", left: slot / 2 - faceSize / 2, top: yF - faceSize / 2 }}>
                <Avatar user={members.find((m) => m.id === u) ?? u} size={faceSize} />
              </div>
              <div style={{ position: "absolute", left: 2, right: 2, top: yN - 9, height: 18, textAlign: "center", fontSize: nameFit.size, lineHeight: "18px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameFit.text}</div>
            </div>
          );
        })}
      </div>
    );

    // ---- the action area under the table ----
    const needs = n < 3 ? `Imposter needs 3 players · ${n} here` : null;
    const note = (t: string, top: number) => (
      <div style={{ position: "absolute", left: 0, right: 0, top, textAlign: "center", fontSize: 13, lineHeight: "18px", color: c.secondaryText }}>{t}</div>
    );
    const mineClued = here && hasClue(s, me);
    const colW = (W - 16) / 3;
    const action = (
      <div style={{ position: "relative", height: 98 }}>
        {dealing ? (
          <div style={{ position: "absolute", left: 0, right: 0, top: 12, textAlign: "center", fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text }}>Dealing…</div>
        ) : !here ? (
          note(needs ?? "You're watching this round", 20)
        ) : !mineClued && local.peeked !== cs.round ? (
          <>
            <div style={{ position: "absolute", left: 0, right: 0, top: 12, textAlign: "center", fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text }}>Peek at your word first</div>
            {note("Then drop a one-word clue. Not too obvious.", 34)}
            {needs ? note(needs, 60) : null}
          </>
        ) : !mineClued ? (
          <>
            <div style={{ position: "absolute", left: 4, top: 2, fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text }}>Pick your clue</div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 28, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {myHints.map((h) => {
                const f = fitText(h, colW - 12, { size: 15, min: 11, weight: 600 });
                return (
                  <button
                    key={h}
                    type="button"
                    class="m-hit"
                    onClick={() => dispatch({ t: "clue", text: h })}
                    style={{ position: "relative", height: 36, borderRadius: 8, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: f.size, fontWeight: 600, whiteSpace: "nowrap", padding: "0 6px" }}
                  >
                    {f.text}
                  </button>
                );
              })}
            </div>
            {note(needs ?? (me === cs.imposter ? "You don't know their word. Guess from their clues." : "Too obvious and the imposter catches on"), 76)}
          </>
        ) : (
          <>
            {note(needs ?? "Clue sent · waiting on the others…", 12)}
            {s.clues.length >= 3 && s.imposter !== "" ? (
              <div style={{ position: "absolute", left: 0, right: 0, top: 36, display: "flex", justifyContent: "center" }}>
                <Button kind="primary" onClick={() => dispatch({ t: "call" })}>
                  Vote now
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    );

    // ---- vote and reveal ----
    const myVote = s.votes.find((v) => v.u === me);
    const tallyOn = revealed || !!myVote || !here;
    const wasOut = outed(cs);
    const caught = wasOut === cs.imposter && cs.imposter !== "";
    const imp = nameOf(cs.imposter);
    const impClue = cs.clues.find((x) => x.u === cs.imposter)?.text;
    const odd = pr.odd;
    let head = "";
    let sub = "";
    let good = false;
    if (revealed) {
      if (cs.left) {
        head = `${imp} left. Round over.`;
        sub = `${imp} had ${odd}.`;
      } else if (me === cs.imposter) {
        good = !caught;
        head = caught ? "Busted." : "You got away with it.";
        sub = caught ? `The ${crew} know you too well.` : wasOut ? `${nameOf(wasOut)} took the fall. Oscar-worthy bluff.` : "Nobody took the fall.";
      } else if (!here) {
        head = `${imp} was the imposter.`;
        sub = `${imp} had ${odd}.`;
      } else {
        good = caught;
        const lines = impClue ? `“${impClue}” was doing a lot of work. ${imp} had ${odd}.` : `${imp} had ${odd}.`;
        const mineVote = cs.votes.find((v) => v.u === me)?.for;
        if (caught) {
          head = mineVote === cs.imposter ? `You caught ${imp}.` : `The ${crew} caught ${imp}.`;
          sub = lines;
        } else {
          head = `${imp} escaped.`;
          sub = wasOut ? `${nameOf(wasOut)} took the fall.` : "The vote split.";
        }
      }
    }
    const voteRows = s.players.map((u) => {
      const votesFor = s.votes.filter((v) => v.for === u);
      const clue = s.clues.find((x) => x.u === u);
      const isImp = revealed && u === cs.imposter;
      const picked = myVote?.for === u;
      const tappable = phaseVote(s) && here && !myVote && u !== me && !dealing;
      const label = `${person(u)} · ${clue ? `“${clue.text}”` : "no clue"}`;
      const shown = tallyOn ? votesFor.length : 0;
      const body = (
        <>
          <span style={{ flex: "none", width: 22, height: 22, borderRadius: 11, marginTop: 1, boxSizing: "border-box", border: picked ? undefined : `2px solid ${c.divider}`, background: picked ? c.primary : undefined, display: "flex", alignItems: "center", justifyContent: "center" }}>{picked ? check(c) : null}</span>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: "20px", color: c.text, overflowWrap: "anywhere" }}>{label}</span>
              {tallyOn && shown > 0 ? <Facepile users={votesFor.map((v) => v.u)} max={3} size={20} /> : null}
              <b style={{ flex: "none", fontSize: 16, lineHeight: "22px", fontWeight: 700, color: c.secondaryText }}>{shown}</b>
            </span>
            {isImp && outcomeOn ? (
              <span class="im-fade" style={{ fontSize: 13, lineHeight: "16px", color: mix(c.negative, c.text, 0.3) }}>{`Imposter · had ${odd}`}</span>
            ) : null}
            <span style={{ display: "block", height: 6, borderRadius: 3, background: c.track, overflow: "hidden" }}>
              <span style={{ display: "block", height: 6, borderRadius: 3, width: `${n > 0 ? Math.min(100, (shown / n) * 100) : 0}%`, background: isImp && outcomeOn ? c.negative : c.primary, transition: "width .4s" }} />
            </span>
          </span>
        </>
      );
      const box = { display: "flex", flex: "none" as const, gap: 10, width: "100%", minWidth: 0, padding: "6px 4px", borderRadius: 8, minHeight: 44, textAlign: "left" as const };
      return tappable ? (
        <button
          key={u}
          type="button"
          aria-label={`Vote ${person(u)}`}
          onClick={() => {
            haptic("light");
            dispatch({ t: "vote", for: u });
          }}
          style={{ ...box, color: c.text }}
        >
          {body}
        </button>
      ) : (
        <div key={u} style={box}>
          {body}
        </div>
      );
    });

    const ballot = (
      <div>
        <div style={{ height: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "0 4px 0 4px" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{me === cs.imposter && here ? "Vote someone out" : "Who's the imposter?"}</span>
          <span style={{ fontSize: 13, color: c.secondaryText, whiteSpace: "nowrap" }}>{tallyOn ? `${s.votes.length} of ${n} voted` : `The ${crew} are voting`}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: revealed ? 240 : 220, overflowY: "auto", marginTop: 2 }}>{voteRows}</div>
        {revealed ? (
          <div style={{ position: "relative", marginTop: 8, minHeight: 44 }}>
            {outcomeOn && good ? (
              <div style={{ position: "absolute", left: "30%", top: 0 }}>
                <Burst key={cs.revealAt} emoji="👀" />
              </div>
            ) : null}
            {outcomeOn ? (
              <div class="im-fade" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, lineHeight: "20px", color: c.text }}>{head}</div>
                  <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{sub}</div>
                </div>
                <Button kind="primary" onClick={() => dispatch({ t: "next" })}>
                  {`Round ${cs.round + 2}`}
                </Button>
              </div>
            ) : (
              <div style={{ height: 44, display: "flex", alignItems: "center", fontSize: 13, color: c.secondaryText }}>Flipping cards…</div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 8, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {!here ? (
              <span style={{ fontSize: 13, color: c.secondaryText }}>The {crew} are voting</span>
            ) : !myVote ? (
              <span style={{ fontSize: 13, color: c.secondaryText }}>Tap a row to vote</span>
            ) : allVoted(s) ? (
              <span style={{ fontSize: 13, color: c.secondaryText }}>Flipping cards…</span>
            ) : s.votes.length * 2 >= n ? (
              <Button kind="primary" onClick={() => dispatch({ t: "call" })}>
                Reveal
              </Button>
            ) : (
              <span style={{ fontSize: 13, color: c.secondaryText }}>Waiting on the others…</span>
            )}
          </div>
        )}
      </div>
    );

    return (
      <div>
        <style>{CSS}</style>
        <CardHeader title="Imposter" subtitle={`Round ${cs.round + 1} · one of you has a different word`} />
        <div style={{ marginTop: 0 }}>{wordCard}</div>
        {s.phase === "clues" && !revealed ? (
          <>
            {table}
            <div style={{ height: 14 }} />
            {action}
          </>
        ) : (
          <div style={{ marginTop: 8 }}>{ballot}</div>
        )}
      </div>
    );
  },
});

const phaseVote = (s: State) => s.phase === "vote";
