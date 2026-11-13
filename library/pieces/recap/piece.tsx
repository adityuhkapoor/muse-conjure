import { defineApp, Avatar, Button, CardHeader, Facepile, clock, running, tween } from "@muse/app";

// Recap: a tap-through set of fact cards about the group or a trip, like a story. Every card is a
// fact from the chat (a count, a time, a place, an amount) passed in as a parameter; the piece
// never writes captions, jokes or banter about anyone. People tap through at their own pace; the
// group sees who has seen the whole recap and can like a card.

type Params = {
  /** Card title, what the recap covers: "Nashville trip · Mar 13-16" */
  title: string;
  /**
   * 2 to 8 fact cards. label: what is counted ("Steps", "Latest night"). value: the fact itself,
   * short ("61,204", "2:40 AM", "$1,486"). line: one plain sentence of fact, no jokes ("Sam walked
   * 14,310 on Saturday"). people: names, exactly as in the members list, the fact is about; empty
   * if it is about everyone.
   */
  cards: { label: string; value: string; line: string; people: string[] }[];
};

// @params
const P: Params = {
  title: "Nashville trip · Mar 13-16",
  cards: [
    { label: "Days away", value: "4", line: "6 of us, 2 cars, 1 Airbnb in East Nashville", people: [] },
    { label: "Steps", value: "61,204", line: "Sam walked the most: 14,310 on Saturday", people: ["Sam"] },
    { label: "Hot chicken", value: "3 times", line: "Hattie B's twice, Prince's once", people: [] },
    { label: "Latest night", value: "2:40 AM", line: "Friday on Broadway", people: ["Leo", "Kev"] },
    { label: "Photos in the chat", value: "412", line: "Priya sent 168 of them", people: ["Priya"] },
    { label: "Spent together", value: "$1,486", line: "$248 each after settling up", people: [] },
  ],
};
// @end params

type Card = { label: string; value: string; line: string; people: string[] };
/** seen: furthest card each person reached. likes: who liked each card, by card index. */
type State = { title: string; cards: Card[]; seen: { user: string; upTo: number }[]; likes: string[][] };
type Action = { t: "see"; card: number } | { t: "like"; card: number };
type Local = { i: number; at: number };
type Ctx = { members: { id: string }[] };

const MAX_CARDS = 8;
const SLIDE_MS = 360;
const slide = tween({ duration: SLIDE_MS, easing: "enter" });

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const isCard = (s: State, n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < s.cards.length;
// Check helpers (invariants, transitions, view).
const upToOf = (s: State, u: string) => s.seen.find((x) => x.user === u)?.upTo ?? -1;
const sameSeenBut = (p: State, n: State, u: string) => JSON.stringify(p.seen.filter((x) => x.user !== u)) === JSON.stringify(n.seen.filter((x) => x.user !== u));
const clean = (t: string, n: number) => t.trim().replace(/\s+/g, " ").slice(0, n);

export default defineApp<State, Action, Local>({
  name: "Recap",
  summary: (s) => {
    const all = s.seen.filter((x) => x.upTo === s.cards.length - 1).length;
    return `${s.title}: ${s.cards.length} cards · ${all} seen it all.`;
  },

  init: () => {
    const cards = P.cards
      .map((c) => ({ label: clean(c.label, 30), value: clean(c.value, 16), line: clean(c.line, 90), people: c.people.map((p) => clean(p, 30)).filter(Boolean).slice(0, 6) }))
      .filter((c) => c.label && c.value)
      .slice(0, MAX_CARDS);
    const safe = cards.length ? cards : [{ label: "Nothing yet", value: "0", line: "", people: [] }];
    return { title: clean(P.title, 60) || "Recap", cards: safe, seen: [], likes: safe.map(() => []) };
  },

  reduce: (state, action, meta, ctx) => {
    const u = meta.user;
    if (!inChat(ctx, u) || !isCard(state, action.card)) return state;
    if (action.t === "see") {
      const prev = state.seen.find((x) => x.user === u);
      if (prev && prev.upTo >= action.card) return state;
      const seen = prev ? state.seen.map((x) => (x.user === u ? { user: u, upTo: action.card } : x)) : [...state.seen, { user: u, upTo: action.card }];
      return { ...state, seen };
    }
    if (action.t === "like") {
      const on = state.likes[action.card]!.includes(u);
      return { ...state, likes: state.likes.map((l, i) => (i !== action.card ? l : on ? l.filter((x) => x !== u) : [...l, u])) };
    }
    return state;
  },

  // Someone left: their progress and likes go. A late joiner starts at the first card.
  onMembers: (state, ctx) => {
    const seen = state.seen.filter((x) => inChat(ctx, x.user));
    const likes = state.likes.map((l) => (l.every((u) => inChat(ctx, u)) ? l : l.filter((u) => inChat(ctx, u))));
    if (seen.length === state.seen.length && likes.every((l, i) => l === state.likes[i])) return state;
    return { ...state, seen, likes };
  },

  invariants: {
    "progress points at a real card, once per person": (s) => new Set(s.seen.map((x) => x.user)).size === s.seen.length && s.seen.every((x) => isCard(s, x.upTo)),
    "one like list per card, each person once": (s) => s.likes.length === s.cards.length && s.likes.every((l) => new Set(l).size === l.length),
    "everyone in the recap is in the chat": (s, ctx) => [...s.seen.map((x) => x.user), ...s.likes.flat()].every((u) => inChat(ctx, u)),
    "there are 1 to 8 cards, each with a label and a value": (s) => s.cards.length >= 1 && s.cards.length <= MAX_CARDS && s.cards.every((c) => c.label.length > 0 && c.value.length > 0),
  },

  transitions: {
    "seeing moves only the actor's progress, and only forward to that card": (p, n, a, m) =>
      a.t !== "see" || p === n || (upToOf(n, m.user) === a.card && a.card > upToOf(p, m.user) && sameSeenBut(p, n, m.user) && JSON.stringify(p.likes) === JSON.stringify(n.likes)),
    "seeing a card further on always lands": (p, n, a, m, ctx) => a.t !== "see" || !inChat(ctx, m.user) || !isCard(p, a.card) || a.card <= upToOf(p, m.user) || p !== n,
    "a like flips only the actor on that one card": (p, n, a, m) =>
      a.t !== "like" || p === n || (p.likes[a.card]!.includes(m.user) !== n.likes[a.card]!.includes(m.user) && p.likes.every((l, i) => i === a.card || l.join() === n.likes[i]!.join()) && n.likes[a.card]!.filter((u) => u !== m.user).join() === p.likes[a.card]!.filter((u) => u !== m.user).join() && JSON.stringify(p.seen) === JSON.stringify(n.seen)),
    "a like on a real card always lands": (p, n, a, m, ctx) => a.t !== "like" || !inChat(ctx, m.user) || !isCard(p, a.card) || p !== n,
    "the cards never change": (p, n) => p.title === n.title && JSON.stringify(p.cards) === JSON.stringify(n.cards),
    "only people in the chat change the recap": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const card = Math.min(s.cards.length - 1, upToOf(s, user) + 1);
    if (r.next() < 0.3) return { t: "like", card: r.int(s.cards.length) };
    return { t: "see", card: r.next() < 0.8 ? card : r.int(s.cards.length) };
  },

  local: { i: 0, at: 0 },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const n = state.cards.length;
    const i = Math.max(0, Math.min(n - 1, local.i));
    const card = state.cards[i]!;
    const last = i === n - 1;
    const memberOf = (name: string) => members.find((m) => m.name.toLowerCase() === name.toLowerCase()) ?? { id: `name:${name}`, name };
    const seenAll = state.seen.filter((x) => x.upTo === n - 1 && inChat({ members }, x.user)).map((x) => x.user);
    const likes = state.likes[i] ?? [];
    const liked = likes.includes(me);
    const e = local.at ? running(local.at, SLIDE_MS) : null;
    const k = e === null ? 1 : slide(e);
    const bg = theme.color.selected;
    const go = (to: number) => {
      setLocal({ i: to, at: clock.peek() });
      if (to > upToOf(state, me)) dispatch({ t: "see", card: to });
    };

    return (
      <div>
        <CardHeader title={state.title} subtitle={`${i + 1} of ${n}`} />
        <div aria-hidden="true" style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {state.cards.map((_, j) => (
            <div key={j} style={{ flex: 1, height: 3, borderRadius: 2, background: j <= i ? theme.color.text : theme.color.track }} />
          ))}
        </div>
        <div style={{ borderRadius: theme.radius.richCard, overflow: "hidden" }}>
          <div
            role="group"
            aria-label={`${card.label}: ${card.value}. ${card.line}`}
            style={{
              minHeight: 196,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 12,
              background: bg,
              color: theme.color.text,
              transform: `translateX(${Math.round((1 - k) * 48)}px)`,
              opacity: 0.4 + 0.6 * k,
            }}
          >
            <div style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, color: theme.color.secondaryText }}>{card.label}</div>
            <div>
              <div style={{ fontSize: 40, lineHeight: "44px", fontWeight: 700, color: theme.color.link, overflowWrap: "anywhere" }}>{card.value}</div>
              {card.line ? <div style={{ marginTop: 6 }}>{card.line}</div> : null}
            </div>
            {card.people.length ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex" }}>
                  {card.people.slice(0, 4).map((p, j) => (
                    <div key={p} style={{ marginLeft: j ? -6 : 0, borderRadius: 999, boxShadow: `0 0 0 2px ${bg}` }}>
                      <Avatar user={memberOf(p)} size={28} />
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.people.join(", ")}</span>
              </div>
            ) : (
              <div style={{ height: 0 }} />
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minHeight: 28 }}>
          <button
            type="button"
            aria-label={liked ? "Unlike" : "Like"}
            aria-pressed={liked}
            onClick={() => dispatch({ t: "like", card: i })}
            style={{ position: "relative", width: 44, height: 44, margin: "-8px 0 -8px -10px", display: "flex", alignItems: "center", justifyContent: "center", color: liked ? theme.color.negative : theme.color.secondaryText }}
          >
            <svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true">
              <path d="M10 17s-8-4.8-8-10.4A4.6 4.6 0 0 1 10 3.7a4.6 4.6 0 0 1 8 2.9C18 12.2 10 17 10 17Z" fill={liked ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
            </svg>
          </button>
          {likes.length ? <Facepile users={likes} max={3} size={20} /> : null}
          <small style={{ flex: 1, minWidth: 0 }}>{likes.length ? `${likes.length} ${likes.length === 1 ? "like" : "likes"}` : ""}</small>
          {seenAll.length ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Facepile users={seenAll} max={3} size={20} />
              <small>{`${seenAll.length} saw it all`}</small>
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Button disabled={i === 0} onClick={() => go(i - 1)}>
            Back
          </Button>
          <div style={{ flex: 1, display: "flex" }}>
            <Button kind="primary" wide onClick={() => go(last ? 0 : i + 1)}>
              {last ? "Start over" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    );
  },
});
