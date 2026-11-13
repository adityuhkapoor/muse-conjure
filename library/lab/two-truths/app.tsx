import {
  defineApp,
  Avatar,
  Button,
  Burst,
  CardHeader,
  Expand,
  Facepile,
  Progress,
  Toast,
  haptic,
  mix,
  path,
  running,
  spring,
  springs,
  tween,
  type Ctx,
  type Meta,
} from "@muse/app";

// Two truths and a lie: three claims about one friend, pulled from the chat. Everyone but that
// friend taps the lie; receipts prove it; after every friend each player gets a lie detector rating.

type Params = {
  chat: string;
  rounds: { about: string; facts: { claim: string; receipt: string }[]; lie: number; guesses: { name: string; fact: number }[] }[];
};

// @params
const P: Params = {
  chat: "the boys chat",
  rounds: [
    {
      about: "Theo",
      lie: 1,
      facts: [
        { claim: "Fell asleep at a Drake concert. Front row.", receipt: "Jonah, Jun 14: “bro was snoring during Hotline Bling”" },
        { claim: "Ran a half marathon last spring", receipt: "Theo, Apr 9: “my knees hurt from walking to the bus”" },
        { claim: "Hasn't paid for Netflix since 2019", receipt: "Dev, Jan 2: “Theo log out of my account”" },
      ],
      guesses: [
        { name: "Jonah", fact: 1 },
        { name: "Priya", fact: 0 },
        { name: "Noa", fact: 1 },
      ],
    },
    {
      about: "Noa",
      lie: 2,
      facts: [
        { claim: "Locked herself out of her car 3 times in one week", receipt: "Noa, Sep 12: “ok who has a coat hanger. again.”" },
        { claim: "Cried during the Ratatouille rewatch", receipt: "Priya: “Noa u good?” Noa: “onions”" },
        { claim: "Is lactose intolerant", receipt: "Noa, every Friday: “large pie, extra cheese”" },
      ],
      guesses: [
        { name: "Theo", fact: 1 },
        { name: "Dev", fact: 2 },
        { name: "Jonah", fact: 2 },
      ],
    },
    {
      about: "Dev",
      lie: 0,
      facts: [
        { claim: "Has never lost to Jonah in FIFA", receipt: "Jonah, Oct 2: “Dev 0, Jonah 5. Screenshot this”" },
        { claim: "Got carded buying a Lunchable", receipt: "Dev, Aug 30: “cashier said ‘nice try little man’”" },
        { claim: "Knows every word of Mamma Mia", receipt: "Priya, Jul 4: “he did the harmonies. All of them.”" },
      ],
      guesses: [
        { name: "Theo", fact: 2 },
        { name: "Noa", fact: 0 },
        { name: "Priya", fact: 1 },
      ],
    },
  ],
};
// @end params

type Round = { about: string; facts: { claim: string; receipt: string }[]; lie: number; guesses: { user: string; fact: number; at: number }[] };
type State = { chat: string; rounds: Round[]; i: number; at: number; done: number };
type Action = { t: "guess"; fact: number } | { t: "next" } | { t: "again" } | { t: "add"; claims: string[]; lie: number };
type Local = { claims: string[]; lie: number; err: boolean; bursts: number };

const MAX_ROUNDS = 6;
const MAX_CLAIM = 80;
const MAX_RECEIPT = 120;
const RATINGS = ["Gullible", "Trusting", "Sus-dar", "Human polygraph"];
const DEAL = spring(springs.ios);
const SHAKE = tween({ duration: 400, easing: "standard" });
const FADE = tween({ duration: 300, easing: "decelerate" });
const FILL = tween({ duration: 800, easing: "standard" });
const CHECK = "M2.5 6.2 5 8.6l4.5-5";
const CROSS = "M3 3l6 6M9 3 3 9";

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");
const isFact = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 2;
const players = (r: Round, ctx: Ctx) => ctx.members.filter((m) => m.id !== r.about);
const guessOf = (r: Round, u: string) => r.guesses.find((g) => g.user === u);
const allIn = (r: Round, ctx: Ctx) => players(r, ctx).every((m) => !!guessOf(r, m.id));
const guessedOrSubject = (r: Round, u: string) => r.about === u || !!guessOf(r, u);
/** next is valid for this actor now. */
const canNext = (s: State, u: string, ctx: Ctx) => {
  const r = s.rounds[s.i];
  return s.done === 0 && !!r && guessedOrSubject(r, u) && (allIn(r, ctx) || r.guesses.length >= 2);
};
const score = (s: State, u: string) => s.rounds.filter((r) => guessOf(r, u)?.fact === r.lie).length;
const ratingOf = (sc: number, n: number) => Math.min(3, Math.floor((sc * 4) / (n + 1)));
const firstName = (members: { id: string; name?: string }[], id: string) => (members.find((m) => m.id === id)?.name ?? "").trim().split(/\s+/)[0] || "Someone";

function reduceTruths(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  const user = meta.user;
  const r = s.rounds[s.i];
  if (a.t === "guess") {
    if (s.done !== 0 || !r || !isFact(a.fact) || r.about === user || guessOf(r, user)) return s;
    const next: Round = { ...r, guesses: [...r.guesses, { user, fact: a.fact, at: meta.time }] };
    return { ...s, rounds: s.rounds.map((x, k) => (k === s.i ? next : x)) };
  }
  if (a.t === "next") {
    if (!r || !canNext(s, user, ctx)) return s;
    return s.i < s.rounds.length - 1 ? { ...s, i: s.i + 1, at: meta.time } : { ...s, done: meta.time };
  }
  if (a.t === "again") {
    if (s.done <= 0) return s;
    return { ...s, rounds: s.rounds.map((x) => ({ ...x, guesses: [] })), i: 0, at: meta.time, done: 0 };
  }
  if (a.t === "add") {
    if (s.done !== 0 || s.rounds.length >= MAX_ROUNDS || !Array.isArray(a.claims) || a.claims.length !== 3 || !isFact(a.lie)) return s;
    const claims = a.claims.map(clean);
    if (claims.some((c) => c.length < 1 || c.length > MAX_CLAIM)) return s;
    if (s.rounds.some((x) => x.about === user)) return s;
    const round: Round = { about: user, facts: claims.map((c) => ({ claim: c, receipt: "" })), lie: a.lie, guesses: [] };
    return { ...s, rounds: [...s.rounds, round], ...(s.rounds.length === 0 ? { i: 0, at: meta.time } : {}) };
  }
  return s;
}

export default defineApp<State, Action, Local>({
  name: "Two truths and a lie",

  summary: (s, ctx) => {
    const r = s.rounds[s.i];
    if (!r) return "Two truths and a lie · write yours";
    if (s.done > 0) {
      let best = ctx.members[0];
      for (const m of ctx.members) if (best && score(s, m.id) > score(s, best.id)) best = m;
      return best ? `Two truths and a lie · ${firstName(ctx.members, best.id)} caught ${score(s, best.id)} of ${s.rounds.length}` : "Two truths and a lie · finished";
    }
    return `Two truths and a lie · ${firstName(ctx.members, r.about)}'s round · ${r.guesses.length} of ${players(r, ctx).length} guessed`;
  },

  init: (ctx) => {
    const match = (name: string) => {
      const want = name.trim().toLowerCase();
      return want ? ctx.members.find((m) => m.id === name || (m.name ?? "").toLowerCase() === want)?.id : undefined;
    };
    const rounds: Round[] = [];
    for (const pr of P.rounds) {
      if (rounds.length >= MAX_ROUNDS) break;
      const about = match(pr.about);
      if (!about || rounds.some((r) => r.about === about)) continue;
      if (pr.facts.length !== 3 || !isFact(pr.lie)) continue;
      const facts = pr.facts.map((f) => ({ claim: clean(f.claim), receipt: clean(f.receipt).slice(0, MAX_RECEIPT) }));
      if (facts.some((f) => f.claim.length < 1 || f.claim.length > MAX_CLAIM)) continue;
      const guesses: Round["guesses"] = [];
      for (const g of pr.guesses) {
        const u = match(g.name);
        if (!u || u === about || !isFact(g.fact) || guesses.some((x) => x.user === u)) continue;
        guesses.push({ user: u, fact: g.fact, at: 0 });
      }
      rounds.push({ about, facts, lie: pr.lie, guesses });
    }
    return { chat: clean(P.chat).slice(0, 32) || "the chat", rounds, i: 0, at: 0, done: 0 };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceTruths(state, action as unknown as Record<string, unknown>, meta, ctx) : state),

  onMembers: (state, ctx) => {
    if (state.rounds.every((r) => r.guesses.every((g) => inChat(ctx, g.user)))) return state;
    return { ...state, rounds: state.rounds.map((r) => ({ ...r, guesses: r.guesses.filter((g) => inChat(ctx, g.user)) })) };
  },

  invariants: {
    "one guess per person per round, never by the subject": (s) => s.rounds.every((r) => new Set(r.guesses.map((g) => g.user)).size === r.guesses.length && r.guesses.every((g) => g.user !== r.about)),
    "guesses and lies are 0 to 2": (s) => s.rounds.every((r) => isFact(r.lie) && r.guesses.every((g) => isFact(g.fact))),
    "guessers are in the chat": (s, ctx) => s.rounds.every((r) => r.guesses.every((g) => inChat(ctx, g.user))),
    "index in range": (s) => Number.isInteger(s.i) && s.i >= 0 && s.i < Math.max(1, s.rounds.length) && (s.done === 0 || s.i === s.rounds.length - 1),
    "times are whole server times": (s) => Number.isInteger(s.done) && s.done >= 0 && Number.isInteger(s.at) && s.at >= 0 && s.rounds.every((r) => r.guesses.every((g) => Number.isInteger(g.at) && g.at >= 0)),
    "every round has three claims": (s) => s.rounds.every((r) => r.facts.length === 3 && r.facts.every((f) => f.claim.length > 0 && f.claim.length <= MAX_CLAIM)),
    "at most 6 rounds, one per subject": (s) => s.rounds.length <= MAX_ROUNDS && new Set(s.rounds.map((r) => r.about)).size === s.rounds.length,
  },

  transitions: {
    "a guess adds only the actor's guess on the current round": (p, n, a, m) => {
      if (a.t !== "guess" || p === n) return true;
      const before = p.rounds[p.i]!;
      const after = n.rounds[n.i]!;
      return (
        n.i === p.i &&
        n.at === p.at &&
        n.done === p.done &&
        JSON.stringify(after.guesses) === JSON.stringify([...before.guesses, { user: m.user, fact: a.fact, at: m.time }]) &&
        JSON.stringify(after.facts) === JSON.stringify(before.facts) &&
        p.rounds.every((r, k) => k === p.i || r === n.rounds[k])
      );
    },
    "the subject never guesses": (p, n, a, m) => a.t !== "guess" || p === n || p.rounds[p.i]?.about !== m.user,
    "next needs the actor in the round and enough guesses": (p, n, a, m, ctx) => {
      if (a.t !== "next" || p === n) return true;
      const r = p.rounds[p.i]!;
      return guessedOrSubject(r, m.user) && (allIn(r, ctx) || r.guesses.length >= 2);
    },
    "next moves on by one or ends the game": (p, n, a, m) => a.t !== "next" || p === n || (n.i === p.i + 1 && n.at === m.time && n.done === 0) || (n.done === m.time && n.i === p.i && n.at === p.at),
    "again only after the end, and clears every guess": (p, n, a, m) =>
      a.t !== "again" || p === n || (p.done > 0 && n.done === 0 && n.i === 0 && n.at === m.time && n.rounds.every((r, k) => r.guesses.length === 0 && r.about === p.rounds[k]!.about)),
    "rounds are append only and never change their claims or lie": (p, n) =>
      n.rounds.length >= p.rounds.length && p.rounds.every((r, k) => n.rounds[k]!.about === r.about && n.rounds[k]!.lie === r.lie && JSON.stringify(n.rounds[k]!.facts) === JSON.stringify(r.facts)),
    "a new round is about the actor, with no guesses, only while playing": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const added = n.rounds[n.rounds.length - 1]!;
      return p.done === 0 && n.rounds.length === p.rounds.length + 1 && added.about === m.user && added.guesses.length === 0 && added.lie === a.lie && !p.rounds.some((r) => r.about === m.user);
    },
    "only people in the chat play": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r, ctx) => {
    if (s.done > 0) return { t: "again" };
    const cur = s.rounds[s.i];
    if (!cur) return { t: "add", claims: ["Hates pizza", "Has a twin", "Can juggle"], lie: r.int(3) };
    const k = r.next();
    if (guessedOrSubject(cur, user) || !inChat(ctx, user)) {
      if (k < 0.75) return { t: "next" };
      return { t: "guess", fact: r.int(3) };
    }
    if (k < 0.85) return { t: "guess", fact: r.int(3) };
    if (k < 0.95) return { t: "next" };
    return { t: "add", claims: ["Hates pizza", "Has a twin", "Can juggle"], lie: r.int(3) };
  },

  local: { claims: ["", "", ""], lie: -1, err: false, bursts: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = theme.width;
    const compact = W < 360;
    const s = state;
    const R = s.rounds[s.i];
    const name = (id: string) => firstName(members, id);
    const fillInk = theme.mode === "dark" ? c.card : c.onPrimary;
    const ctx: Ctx = { room: "", members };

    // ---- Empty: write yours ----
    if (!R) {
      const submit = () => {
        const claims = local.claims.map((x) => x.trim());
        if (claims.some((x) => x.length < 1 || x.length > MAX_CLAIM) || local.lie < 0 || local.lie > 2) {
          setLocal({ err: true });
          return;
        }
        setLocal({ err: false, claims: ["", "", ""], lie: -1 });
        dispatch({ t: "add", claims, lie: local.lie });
      };
      return (
        <div>
          <CardHeader title="Two truths and a lie" subtitle={`pulled from ${s.chat}`} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48 }}>
            <Avatar user={me} size={32} />
            <b style={{ fontWeight: 600, fontSize: 15, lineHeight: "18px", minWidth: 0 }}>Write two truths and a lie about you</b>
          </div>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {[0, 1, 2].map((k) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  style={{ flex: 1, minWidth: 0 }}
                  value={local.claims[k] ?? ""}
                  maxLength={MAX_CLAIM}
                  placeholder={`Claim ${k + 1}`}
                  aria-label={`Claim ${k + 1}`}
                  onInput={(e) => setLocal({ claims: local.claims.map((x, j) => (j === k ? e.currentTarget.value : x)) })}
                />
                <button
                  type="button"
                  aria-pressed={local.lie === k}
                  aria-label={`Claim ${k + 1} is the lie`}
                  onClick={() => setLocal({ lie: k })}
                  style={{ minWidth: 56, height: 44, borderRadius: 22, border: 0, fontSize: 13, fontWeight: 600, background: local.lie === k ? c.negative : c.wash, color: local.lie === k ? fillInk : c.secondaryText }}
                >
                  Lie
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minHeight: 44 }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: local.err ? c.negative : c.secondaryText }}>{local.err ? "Write three claims and pick the lie" : "Friends tap the one that's cap"}</div>
            <Button kind="primary" onClick={submit}>
              Add
            </Button>
          </div>
        </div>
      );
    }

    // ---- Finished: rating ----
    if (s.done > 0) {
      const n = s.rounds.length;
      const sc = score(s, me);
      const fill = (() => {
        const e = running(s.done, 800);
        return sc * FILL(e ?? 800);
      })();
      let best = members[0];
      for (const m of members) if (best && score(s, m.id) > score(s, best.id)) best = m;
      const inner = W - 24;
      const row = (r: Round) => {
        const mine = guessOf(r, me);
        const status = r.about === me ? { t: "Your round", col: c.secondaryText } : mine?.fact === r.lie ? { t: "Caught the lie", col: c.positive } : { t: "Fooled you", col: c.negative };
        return (
          <div key={r.about} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 52, borderTop: `1px solid ${c.wash}` }}>
            <span style={{ display: "flex", flex: "none", marginLeft: 2 }}>
              <Avatar user={r.about} size={40} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: "block", fontWeight: 600, fontSize: 15, lineHeight: "19px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(r.about)}</b>
              <span style={{ display: "block", fontSize: 13, lineHeight: "16px", color: status.col }}>{status.t}</span>
            </div>
            <span style={{ flex: "none", width: Math.max(96, inner - 200), textAlign: "right", fontSize: 13, lineHeight: "16px", color: c.secondaryText, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}>{r.facts[r.lie]?.claim}</span>
          </div>
        );
      };
      const shown = s.rounds.slice(0, 4);
      const more = s.rounds.slice(4);
      return (
        <div>
          <CardHeader title="Your lie detector rating" subtitle={`Calibrated on ${s.chat}`} />
          <div style={{ fontSize: 24, lineHeight: "30px", fontWeight: 700, color: c.text }}>{RATINGS[ratingOf(sc, n)]}</div>
          <div style={{ fontSize: 15, lineHeight: "20px", color: c.secondaryText, marginBottom: 6 }}>{`You caught ${sc} of ${n} ${n === 1 ? "lie" : "lies"}`}</div>
          <Progress value={fill} max={n} label={null} />
          <div style={{ marginTop: 6 }}>{shown.map(row)}</div>
          {more.length ? (
            <Expand title={`${more.length} more friends`} open={false} onToggle={() => {}}>
              {more.map(row)}
            </Expand>
          ) : null}
          {best ? <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, margin: "6px 0 8px" }}>{`Best detector: ${name(best.id)} · ${score(s, best.id)} of ${n}`}</div> : null}
          <Button kind="primary" wide onClick={() => dispatch({ t: "again" })}>
            Play again
          </Button>
        </div>
      );
    }

    // ---- Playing ----
    const subject = R.about === me;
    const mine = guessOf(R, me);
    const answered = !!mine || subject;
    const others = players(R, ctx);
    const guessers = R.guesses.map((g) => g.user);
    const subjName = name(R.about);
    const listNames = (ids: string[]) => {
      const nm = ids.map(name);
      if (nm.length <= 3) return nm.length > 1 ? `${nm.slice(0, -1).join(", ")} and ${nm[nm.length - 1]}` : nm[0] ?? "";
      return `${nm.slice(0, 2).join(", ")} and ${nm.length - 2} more`;
    };
    const guessedBy = (k: number) => R.guesses.filter((g) => g.fact === k).map((g) => g.user);
    const otherGuessers = guessers.filter((u) => u !== me);
    const line2 = subject
      ? `Your round · ${R.guesses.length} of ${others.length} guessed`
      : !otherGuessers.length
        ? "Be the first to guess"
        : `${listNames(otherGuessers)} ${answered ? "guessed too" : "already guessed"}`;

    const guess = (k: number) => {
      if (answered) return;
      if (k === R.lie) {
        setLocal({ bursts: local.bursts + 1 });
        haptic("success");
      }
      dispatch({ t: "guess", fact: k });
    };

    const shakeX = (k: number) => {
      if (!mine || mine.fact !== k || k === R.lie) return 0;
      const e = running(mine.at, 400);
      if (e === null) return 0;
      const t = SHAKE(e);
      return Math.sin(t * Math.PI * 4) * 8 * (1 - t);
    };

    const pill = (k: number) => {
      const claim = R.facts[k]!.claim;
      const isLie = k === R.lie;
      const picked = mine?.fact === k;
      const tone: { fill: string; ink: string; mark: "check" | "cross" | "small" | "idle" } = !answered
        ? { fill: c.wash, ink: c.text, mark: "idle" }
        : picked && isLie
          ? { fill: c.positive, ink: fillInk, mark: "check" }
          : picked
            ? { fill: c.negative, ink: fillInk, mark: "cross" }
            : isLie
              ? { fill: mix(c.card, c.positive, 0.2), ink: c.text, mark: "small" }
              : { fill: c.wash, ink: c.secondaryText, mark: "idle" };
      const size = claim.length > (compact ? 52 : 70) ? 13 : 15;
      const dealE = s.at > 0 ? running(s.at, 80 * k + DEAL.duration) : null;
      const deal = dealE === null ? 1 : DEAL(Math.max(0, dealE - 80 * k));
      const faces = answered ? guessedBy(k) : [];
      const receipt = R.facts[k]!.receipt;
      const fadeE = answered && mine && mine.at > 0 ? running(mine.at, 100 * k + 300) : null;
      const fade = fadeE === null ? 1 : FADE(Math.max(0, fadeE - 100 * k));
      return (
        <div key={k}>
          <button
            type="button"
            aria-label={answered ? `${claim}, ${isLie ? "the lie" : "true"}` : claim}
            aria-disabled={answered}
            onClick={() => guess(k)}
            style={{
              position: "relative",
              display: "block",
              width: "100%",
              height: 48,
              border: 0,
              padding: 0,
              background: "none",
              cursor: answered ? "default" : "pointer",
              transform: `translateX(${shakeX(k) + (1 - deal) * 40}px)`,
              opacity: 0.2 + 0.8 * deal,
            }}
          >
            <span style={{ position: "relative", display: "flex", alignItems: "center", width: "100%", height: 48, boxSizing: "border-box", borderRadius: 24, padding: `0 ${faces.length ? 50 + Math.min(3, faces.length) * 14 : 44}px 0 16px`, background: tone.fill, color: tone.ink, textAlign: "left", fontSize: size, lineHeight: size === 13 ? "17px" : "19px" }}>
              <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>{claim}</span>
              {faces.length ? (
                <span style={{ position: "absolute", right: 42, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
                  <Facepile users={faces} max={3} size={20} />
                </span>
              ) : null}
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                {tone.mark === "check" || tone.mark === "cross" ? (
                  <span style={{ width: 20, height: 20, borderRadius: 10, background: c.card, display: "grid", placeItems: "center" }}>
                    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      {tone.mark === "check" ? path(CHECK, "none", { stroke: c.positive, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" }) : path(CROSS, "none", { stroke: c.negative, "stroke-width": 2.2, "stroke-linecap": "round" })}
                    </svg>
                  </span>
                ) : tone.mark === "small" ? (
                  <span style={{ width: 16, height: 16, borderRadius: 8, background: c.positive, display: "grid", placeItems: "center" }}>
                    <svg width={10} height={10} viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      {path(CHECK, "none", { stroke: c.card, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" })}
                    </svg>
                  </span>
                ) : (
                  <span style={{ width: 18, height: 18, borderRadius: 9, boxSizing: "border-box", border: `1px solid ${c.divider}` }} />
                )}
              </span>
            </span>
          </button>
          {answered && receipt ? (
            <div style={{ margin: "3px 0 0 16px", fontSize: 13, lineHeight: "16px", color: c.secondaryText, opacity: fade, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: compact ? 1 : 2, overflow: "hidden" }}>{receipt}</div>
          ) : null}
        </div>
      );
    };

    // Footer
    const last = s.i >= s.rounds.length - 1;
    const nextOk = canNext(s, me, ctx);
    const pending = others.filter((m) => !guessOf(R, m.id)).map((m) => m.id);
    const caught = mine?.fact === R.lie;
    const head = subject ? `${R.guesses.filter((g) => g.fact === R.lie).length} of ${others.length} caught you` : caught ? `You caught ${subjName}.` : `${subjName} got you.`;
    const sub = subject ? "It's always the boring one" : caught ? "Lie detector: working" : "It's always the boring one";
    const toastAt = mine && caught && mine.at > 0 ? mine.at : 0;

    const footer = !answered ? (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
        {guessers.length ? <Facepile users={guessers} max={3} size={20} /> : null}
        <span style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{R.guesses.length || !others.length ? (others.length ? "Tap the one that's cap" : "Waiting on guesses") : "Tap the one that's cap"}</span>
      </div>
    ) : (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: "block", fontSize: 15, lineHeight: "20px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{others.length ? head : "Waiting on guesses"}</b>
          <span style={{ display: "block", fontSize: 13, lineHeight: "16px", color: c.secondaryText }}>{others.length ? sub : "Nobody else is here yet"}</span>
        </div>
        {nextOk ? (
          <Button kind="primary" onClick={() => dispatch({ t: "next" })}>
            {last ? "See rating" : "Next friend"}
          </Button>
        ) : (
          <span style={{ flex: "none", maxWidth: "45%", fontSize: 13, lineHeight: "16px", color: c.secondaryText, textAlign: "right" }}>{pending.length ? `Waiting on ${listNames(pending)}` : ""}</span>
        )}
      </div>
    );

    return (
      <div style={{ position: "relative" }}>
        <CardHeader title="Two truths and a lie" subtitle={`${s.i + 1} of ${s.rounds.length} · pulled from ${s.chat}`} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48 }}>
          <Avatar user={R.about} size={32} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <b style={{ display: "block", fontWeight: 600, fontSize: 15, lineHeight: "18px" }}>{`Which one about ${subjName} is the lie?`}</b>
            <span style={{ display: "block", fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line2}</span>
          </div>
        </div>
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>{[0, 1, 2].map(pill)}</div>
        {footer}
        {local.bursts && caught ? (
          <div style={{ position: "absolute", left: "50%", top: 200, width: 0 }}>
            <Burst key={local.bursts} />
          </div>
        ) : null}
        {toastAt && running(toastAt, 2400) !== null ? <Toast key={toastAt}>{`You caught ${subjName}`}</Toast> : null}
      </div>
    );
  },
});
