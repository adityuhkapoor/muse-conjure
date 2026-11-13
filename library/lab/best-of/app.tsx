import { defineApp, Avatar, Button, CardHeader, Facepile, Stars, Toast, haptic, innerWidth, mix, running, tween, type Ctx, type Meta, type Member } from "@muse/app";

// Best of: the same recommendation question keeps coming back, so the group gets one ranked answer
// built from past replies. Members +1 their pick (one each) and someone pins it, which collapses
// the pile of repeat questions into the answer.

type Params = {
  group: string;
  members: number;
  question: string;
  posts: number;
  replies: number;
  helped: number;
  asks: { who: string; text: string; ago: string }[];
  picks: { name: string; detail: string; mentions: number; rating: number; quotes: { who: string; text: string }[] }[];
  plus: { name: string; pick: string }[];
};

// @params
const P: Params = {
  group: "Cal Class of '28", members: 6200, question: "Best dentist near campus", posts: 40, replies: 212, helped: 86,
  asks: [
    { who: "Jordan", text: "best dentist near campus?", ago: "2h" },
    { who: "Kev", text: "dentist recs?? tooth emergency", ago: "3d" },
    { who: "Ana", text: "anyone know a dentist that takes SHIP", ago: "1w" },
  ],
  picks: [
    { name: "Telegraph Smiles", detail: "Telegraph Ave · takes SHIP", mentions: 56, rating: 4.8, quotes: [{ who: "Priya", text: "Dr. Lin numbed me like a pro, zero pain" }, { who: "Kev", text: "walked in w/ a cracked tooth, out in 40 min" }] },
    { name: "Tang Center Dental", detail: "on campus · free cleanings", mentions: 50, rating: 4.3, quotes: [{ who: "Ana", text: "free cleaning w/ SHIP, book 2 wks out" }, { who: "Theo", text: "slow but it's literally free" }] },
    { name: "Shattuck Family DDS", detail: "Downtown · Sat hours", mentions: 33, rating: 4.6, quotes: [{ who: "Maya", text: "only place open saturdays" }, { who: "Dev", text: "they gave me a toothbrush and a sticker" }] },
    { name: "Elmwood Dental", detail: "College Ave · pricey", mentions: 19, rating: 4.9, quotes: [{ who: "Jess", text: "fancy, $$$, but the TVs on the ceiling" }, { who: "Nico", text: "my parents' insurance only lol" }] },
  ],
  plus: [{ name: "Priya", pick: "Telegraph Smiles" }, { name: "Maya", pick: "Telegraph Smiles" }, { name: "Theo", pick: "Tang Center Dental" }],
};
// @end params

type Quote = { who: string; text: string };
type Pick = { id: string; name: string; detail: string; mentions: number; rating: number; quotes: Quote[] };
type Ask = { who: string; text: string; ago: string };
type State = {
  group: string;
  members: number;
  question: string;
  posts: number;
  replies: number;
  helped: number;
  asks: Ask[];
  picks: Pick[];
  plus: { [user: string]: string };
  pinned: { by: string; at: number } | null;
};
type Action = { t: "plus"; pick: string } | { t: "pin" } | { t: "unpin" };
type Local = { open: string };

const PIN_MS = 700;
const PIN_TOAST_MS = 2400;
const pinTween = tween({ duration: PIN_MS, easing: "easeInOut" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1_000_000, Math.max(0, Math.round(v))) : 0);
const score = (s: State, id: string) => (s.picks.find((p) => p.id === id)?.mentions ?? 0) + Object.values(s.plus).filter((v) => v === id).length;
const ranked = (s: State) => s.picks.map((p, i) => ({ p, i, sc: score(s, p.id) })).sort((a, b) => b.sc - a.sc || a.i - b.i);
const total = (s: State) => s.picks.reduce((n, p) => n + score(s, p.id), 0);
const plusKey = (plus: { [u: string]: string }, skip: string) => JSON.stringify(Object.entries(plus).filter(([k]) => k !== skip).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
const content = (s: State) => JSON.stringify([s.picks, s.asks, s.question, s.posts, s.replies, s.helped]);
const kfmt = (n: number) => (n >= 1000 ? `${(Math.floor(n / 100) / 10).toString().replace(/\.0$/, "")}K` : String(n));

export default defineApp<State, Action, Local>({
  name: "Group answer",
  summary: (s) => {
    const top = ranked(s)[0];
    if (!top) return `${s.question}: no answers yet`;
    return `${s.question}: ${top.p.name} leads with ${top.sc} mentions${s.pinned ? " · pinned" : ""}`;
  },

  init: (ctx) => {
    const asks: Ask[] = [];
    for (const a of P.asks ?? []) {
      const text = clean(a.text, 60);
      if (text && asks.length < 3) asks.push({ who: clean(a.who, 12), text, ago: clean(a.ago, 6) });
    }
    const picks: Pick[] = [];
    for (const p of P.picks ?? []) {
      const name = clean(p.name, 28);
      if (!name || picks.length >= 5) continue;
      const quotes: Quote[] = [];
      for (const q of p.quotes ?? []) {
        const text = clean(q.text, 60);
        if (text && quotes.length < 2) quotes.push({ who: clean(q.who, 12), text });
      }
      const r = typeof p.rating === "number" && Number.isFinite(p.rating) ? Math.round(p.rating * 10) : 40;
      picks.push({ id: `p${picks.length}`, name, detail: clean(p.detail, 40), mentions: count(p.mentions), rating: Math.min(50, Math.max(10, r)), quotes });
    }
    const plus: { [u: string]: string } = {};
    for (const x of P.plus ?? []) {
      const want = clean(x.name, 40).toLowerCase();
      const m = ctx.members.find((y) => y.id === x.name || (y.name ?? "").toLowerCase() === want);
      const pk = picks.find((y) => y.name.toLowerCase() === clean(x.pick, 28).toLowerCase());
      if (m && pk) plus[m.id] = pk.id;
    }
    return {
      group: clean(P.group, 40),
      members: count(P.members),
      question: clean(P.question, 48) || "Group answer",
      posts: count(P.posts),
      replies: count(P.replies),
      helped: count(P.helped),
      asks,
      picks,
      plus,
      pinned: null,
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "plus") {
      if (typeof a.pick !== "string" || !s.picks.some((p) => p.id === a.pick)) return s;
      if (s.plus[m.user] === a.pick) {
        const { [m.user]: _gone, ...rest } = s.plus;
        return { ...s, plus: rest };
      }
      return { ...s, plus: { ...s.plus, [m.user]: a.pick } };
    }
    if (a.t === "pin") {
      if (s.pinned !== null || s.picks.length === 0) return s;
      return { ...s, pinned: { by: m.user, at: m.time } };
    }
    if (a.t === "unpin") {
      if (s.pinned?.by !== m.user) return s;
      return { ...s, pinned: null };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const keep = Object.entries(s.plus).filter(([u]) => inChat(ctx, u));
    return keep.length === Object.keys(s.plus).length ? s : { ...s, plus: Object.fromEntries(keep) };
  },

  invariants: {
    "one +1 per person, on a real pick": (s, ctx) => Object.entries(s.plus).every(([u, id]) => inChat(ctx, u) && s.picks.some((p) => p.id === id)),
    "scores never fall below what the group said": (s) => s.picks.every((p) => score(s, p.id) >= p.mentions),
    "the pin is real": (s) => s.pinned === null || (s.picks.length > 0 && typeof s.pinned.by === "string"),
  },

  transitions: {
    "a +1 changes only the actor's vote": (p, n, a, m) =>
      a.t !== "plus" || p === n || (plusKey(p.plus, m.user) === plusKey(n.plus, m.user) && (p.plus[m.user] === a.pick ? !(m.user in n.plus) : n.plus[m.user] === a.pick)),
    "a +1 moves at most one point between picks": (p, n, a) => a.t !== "plus" || Math.abs(total(n) - total(p)) <= 1,
    "pin once, by the actor, now": (p, n, a, m) => a.t !== "pin" || p === n || (p.pinned === null && n.pinned?.by === m.user && n.pinned.at === m.time),
    "only the pinner unpins": (p, n, a, m) => a.t !== "unpin" || p === n || (p.pinned?.by === m.user && n.pinned === null),
    "the answer's content never changes": (p, n) => content(p) === content(n),
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    if (k < 0.7) return s.picks.length ? { t: "plus", pick: r.pick(s.picks).id } : { t: "pin" };
    if (k < 0.85) return { t: "pin" };
    return { t: "unpin" };
  },

  local: { open: "*" },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const W = innerWidth();
    const order = ranked(state);
    const maxScore = Math.max(60, order[0]?.sc ?? 0);
    const topId = order[0]?.p.id ?? "";
    const openId = local.open === "*" ? (state.picks.length >= 5 ? "" : topId) : local.open;
    const rowH = (p: Pick) => 40 + (p.id === openId && p.quotes.length ? 52 : 0);
    const tops: { [id: string]: number } = {};
    let y = 0;
    for (const o of order) {
      tops[o.p.id] = y;
      y += rowH(o.p);
    }
    const rowsH = y;
    const compact = theme.width < 340;
    const member = (who: string): Member => members.find((x) => x.id === who || (x.name ?? "").toLowerCase() === who.toLowerCase()) ?? { id: `q:${who}`, name: who };
    const voters = (id: string) => members.filter((x) => state.plus[x.id] === id).map((x) => x.id);
    const allVoters = members.filter((x) => state.plus[x.id]).map((x) => x.id);
    const helpedN = state.helped + Object.keys(state.plus).length;

    const at = confirmed.pinned?.at ?? 0;
    const el = confirmed.pinned ? running(at, PIN_MS) : null;
    const p = el === null ? (confirmed.pinned ? 1 : 0) : pinTween(el);
    const showPile = !confirmed.pinned || el !== null;
    const showHeadline = !!confirmed.pinned && p >= 0.6;
    const headlineA = (p - 0.6) / 0.4;
    const toastOn = !!confirmed.pinned && running(at, PIN_TOAST_MS) !== null;
    const pinGlyph = (k: string) => (
      <span key={k} aria-hidden="true" style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", width: 14, flex: "none" }}>
        <span style={{ width: 14, height: 14, borderRadius: 7, background: c.primary }} />
        <span style={{ width: 2, height: 12, background: c.primary }} />
      </span>
    );

    const bw = Math.min(240, W - 110);
    const asks = state.asks;
    const bubble = (k: number) => {
      const a = asks[k]!;
      const x0 = 4 * k;
      const y0 = 4 * k;
      const dx = (W - 40 - (x0 + bw / 2)) * p;
      const dy = (88 - (y0 + 20)) * p;
      return (
        <div
          key={k}
          style={{
            position: "absolute", left: x0, top: y0, width: bw, height: 40, borderRadius: 18, background: c.secondaryButton,
            opacity: (k === 0 ? 1 : 0.85) * (1 - p), transform: `translate(${dx}px, ${dy}px) scale(${1 - 0.85 * p})`, zIndex: 3 - k,
            display: "flex", alignItems: "center", gap: 6, paddingLeft: 6, paddingRight: 10, boxSizing: "border-box",
          }}
        >
          {k === 0 ? (
            <>
              <Avatar user={{ id: `a:${a.who}`, name: a.who }} size={24} />
              <span style={{ fontSize: 14, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{a.text}</span>
              <span style={{ fontSize: 12, color: c.secondaryButtonText, flex: "none" }}>{a.ago}</span>
            </>
          ) : null}
        </div>
      );
    };
    const badgeDx = (W - 40 - (W - 54)) * p;
    const badgeDy = (88 - 24) * p;

    const row = (o: { p: Pick; sc: number }, rank: number) => {
      const pk = o.p;
      const isOpen = pk.id === openId && pk.quotes.length > 0;
      const mine = state.plus[me] === pk.id;
      const vs = voters(pk.id);
      return (
        <div
          key={pk.id}
          style={{
            position: "absolute", left: 0, right: 0, top: 0, height: rowH(pk), transform: `translateY(${tops[pk.id]}px)`,
            transition: "transform 400ms ease, height 300ms ease", borderRadius: 12,
            background: isOpen ? mix(c.wash, c.secondaryButton, 0.5) : "transparent",
          }}
        >
          <button
            aria-expanded={isOpen}
            aria-label={`${pk.name}, ${o.sc} mentions`}
            onClick={() => setLocal({ open: openId === pk.id ? "" : pk.id })}
            style={{ position: "absolute", left: 0, top: -2, bottom: -2, right: 60, background: "transparent", border: 0, padding: 0, margin: 0, textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", display: "block" }}
          >
            <span style={{ position: "absolute", left: 4, top: 7, width: 26, height: 26, borderRadius: 13, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{rank + 1}</span>
            <span style={{ position: "absolute", left: 38, top: 4, right: vs.length ? 26 : 0, height: 18, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: compact ? "50%" : "55%", flex: "0 1 auto", lineHeight: "18px" }}>{pk.name}</span>
              <Stars value={pk.rating / 10} size={10} />
              <span style={{ fontSize: 12, color: c.secondaryText, flex: "none" }}>{(pk.rating / 10).toFixed(1)}</span>
            </span>
            <span style={{ position: "absolute", left: 38, top: 23, right: vs.length ? 26 : 0, height: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 64, height: 7, borderRadius: 3.5, background: c.track, flex: "none", overflow: "hidden", display: "block" }}>
                <span style={{ display: "block", height: 7, borderRadius: 3.5, background: c.primary, width: `${Math.min(100, (o.sc / maxScore) * 100)}%`, transformOrigin: "left", animation: `bestBar 800ms ${rank * 100}ms ease both` }} />
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: c.text, flex: "none" }}>{o.sc}</span>
              {compact ? null : <span style={{ fontSize: 12, color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{pk.detail}</span>}
            </span>
            {(isOpen ? pk.quotes : []).map((q, j) => (
              <span key={j} style={{ position: "absolute", left: 38, right: -48, top: 40 + 26 * j, height: 24, display: "flex", alignItems: "center", gap: 4 }}>
                <Avatar user={member(q.who)} size={18} />
                <span style={{ fontSize: 13, color: c.text, background: c.secondaryButton, borderRadius: 12, height: 24, lineHeight: "24px", padding: "0 11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>{`“${q.text}”`}</span>
              </span>
            ))}
          </button>
          {vs.length ? (
            <span style={{ position: "absolute", right: 56, top: 13, pointerEvents: "none" }}>
              <Facepile users={vs} max={2} size={14} />
            </span>
          ) : null}
          <button
            aria-label={mine ? `Remove your +1 from ${pk.name}` : `+1 ${pk.name}`}
            aria-pressed={mine}
            onClick={() => {
              haptic("light");
              dispatch({ t: "plus", pick: pk.id });
            }}
            style={{ position: "absolute", right: 0, top: -2, width: 52, height: 44, background: "transparent", border: 0, padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <span
              key={mine ? "mine" : "not"}
              style={{ width: 46, height: 28, borderRadius: 14, background: mine ? c.selected : c.secondaryButton, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 14, fontWeight: 700, color: mine ? c.link : c.text, position: "relative", animation: mine ? "bestPop 350ms cubic-bezier(.3,1.6,.5,1) both" : undefined }}
            >
              {mine ? (
                <span style={{ position: "absolute", left: 6, top: 6, display: "flex" }}>
                  <Avatar user={me} size={16} />
                </span>
              ) : null}
              <span style={{ marginLeft: mine ? 14 : 0 }}>+1</span>
            </span>
          </button>
        </div>
      );
    };

    const pinnedBy = state.pinned?.by;
    return (
      <div style={{ position: "relative" }}>
        <style>{"@keyframes bestBar { from { transform: scaleX(0) } to { transform: scaleX(1) } } @keyframes bestPop { from { transform: scale(.3) } to { transform: scale(1) } } @keyframes bestBob { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-2px) } } @keyframes bestDrop { 0% { transform: translateY(-30px); opacity: 0 } 60% { transform: translateY(4px); opacity: 1 } 100% { transform: translateY(0); opacity: 1 } }"}</style>
        <CardHeader title="Group answer" subtitle={`${state.group} · ${kfmt(state.members)} members`} />

        <div style={{ position: "relative", height: 48, marginBottom: 4 }}>
          {showPile && asks.length ? (
            <>
              {[2, 1, 0].filter((k) => k < asks.length).map(bubble)}
              <div style={{ position: "absolute", left: W - 78, top: 0, width: 48, height: 48, transform: `translate(${badgeDx}px, ${badgeDy}px) scale(${1 - 0.85 * p})`, opacity: 1 - p }}>
                <div style={{ width: 48, height: 48, borderRadius: 24, background: c.wash, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "bestBob 2s ease-in-out infinite" }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: c.text, lineHeight: "20px" }}>{`${state.posts}×`}</span>
                  <span style={{ fontSize: 11, color: c.secondaryText, lineHeight: "12px" }}>asked</span>
                </div>
              </div>
            </>
          ) : null}
          {showHeadline ? (
            <div style={{ position: "absolute", left: 4, right: 0, top: 0, opacity: Math.min(1, headlineA) }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.text, lineHeight: "26px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${state.posts} posts, now 1 pinned answer`}</div>
              <div style={{ fontSize: 13, color: c.secondaryText, lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Muse will reply with this next time it's asked</div>
            </div>
          ) : null}
        </div>

        <div style={{ position: "relative", background: c.wash, borderRadius: 12, padding: "0 8px" }}>
          <div style={{ position: "relative", height: 44 }}>
            <span style={{ position: "absolute", left: 4, top: 12, width: 22, height: 22, borderRadius: 11, boxSizing: "border-box", border: `4px solid ${c.primary}` }} />
            <div style={{ position: "absolute", left: 36, right: 40, top: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.text, lineHeight: "22px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.question}</div>
              <div style={{ fontSize: 13, color: c.secondaryText, lineHeight: "16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`built from ${state.replies} replies in ${state.posts} posts`}</div>
            </div>
            {state.pinned ? (
              <span key={state.pinned.at} style={{ position: "absolute", right: 14, top: -10, animation: "bestDrop 400ms 550ms cubic-bezier(.3,1.5,.5,1) both" }}>
                {pinGlyph("g")}
              </span>
            ) : null}
          </div>

          {order.length ? (
            <div style={{ position: "relative", height: rowsH, transition: "height 300ms ease" }}>{order.map((o, i) => row(o, i))}</div>
          ) : (
            <div style={{ height: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: c.text }}>No answers yet</div>
              <div style={{ fontSize: 13, color: c.secondaryText }}>Replies with recommendations show up here.</div>
            </div>
          )}

          <div style={{ height: 38, borderTop: `1px solid ${c.divider}`, display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
            {allVoters.length ? <Facepile users={allVoters} max={4} size={20} /> : null}
            <span style={{ fontSize: 13, color: c.secondaryText, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`+${helpedN} helped`}</span>
            {state.pinned ? (
              <>
                <span style={{ height: 36, flex: "0 1 128px", minWidth: 84, borderRadius: 8, background: c.secondaryButton, color: c.text, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15, fontWeight: 600 }}>
                  {pinGlyph("b")}
                  Pinned
                </span>
                {pinnedBy === me ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "unpin" })}>
                    Unpin
                  </Button>
                ) : null}
              </>
            ) : state.picks.length ? (
              <Button
                kind="primary"
                onClick={() => {
                  haptic("success");
                  dispatch({ t: "pin" });
                }}
              >
                Pin to group
              </Button>
            ) : null}
          </div>
        </div>
        {toastOn && confirmed.pinned ? <Toast key={confirmed.pinned.at}>Pinned · Muse will answer next time</Toast> : null}
      </div>
    );
  },
});
