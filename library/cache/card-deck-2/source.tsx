import { defineApp, Avatar, Button, CardHeader, rng, running } from "@muse/app";

const CONTENT = {
  title: "Question cards for Saturday",
  subtitle: "Lounge · no skips",
  first: ["June", "Ana"],
  cards: [
    "Favorite thing in the dining hall?",
    "Worst haircut you've had?",
    "What would you do with a free day in the city?",
    "What was your first phone?",
    "What's a show you rewatch?",
    "What's a smell that takes you back to childhood?",
    "What did you want to be at age 8?",
    "Best thing you ate this semester?",
    "What's your go-to comfort food?",
    "What song is on repeat lately?",
    "Best trip you've ever taken?",
    "What skill would you learn overnight?",
    "Favorite cartoon as a kid?",
    "Best gift you've ever received?",
    "Which movie can you quote the most?",
    "What's your ideal Sunday morning?",
    "What small thing makes your day better?",
    "Which animal would you want as a pet?",
    "What was the last thing that made you laugh?",
    "Favorite game growing up?",
    "Which season is your favorite?",
    "What hobby would you like to try?",
    "Best view you've ever seen?",
    "Favorite spot on campus?",
    "A food you used to hate and now love?",
    "Where would you live for a year?",
    "Favorite way to spend a rainy day?",
    "What would you recommend: a book or a game?",
    "Which fictional place would you visit?",
    "What's your go-to karaoke song?",
    "Best sandwich you've ever had?",
    "A tradition your family has?",
    "What are you looking forward to?",
    "Which decade had the best music?",
    "Favorite board or card game?",
    "A nickname you've had?",
    "Weirdest food combo you like?",
    "Which superpower would you pick?",
    "Best thing about summer?",
    "What's a place you'd go back to?",
  ],
};

const CARDS = CONTENT.cards;
const N = CARDS.length;

type Entry = { card: number; by: string };
type State = {
  started: boolean;
  order: number[];
  circle: string[];
  current: string | null;
  log: Entry[];
  at: number;
};
type Action = { t: "start" } | { t: "draw" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name: string }[] };

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const range = () => Array.from({ length: N }, (_, i) => i);

function circleOf(ctx: Ctx): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (const name of CONTENT.first) {
    const m = ctx.members.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
    if (m && !used.has(m.id)) {
      used.add(m.id);
      out.push(m.id);
    }
  }
  for (const m of ctx.members) {
    if (!used.has(m.id)) {
      used.add(m.id);
      out.push(m.id);
    }
  }
  return out;
}

const nextAfter = (p: State, user: string): string | null => {
  if (p.log.length + 1 >= N) return null;
  const i = p.circle.indexOf(user);
  if (i < 0) return null;
  return p.circle[(i + 1) % p.circle.length] ?? null;
};

export default defineApp<State, Action, Local>({
  name: "Question deck",
  summary: (s) => (s.started ? (s.log.length >= N ? `${CONTENT.title} Deck done.` : `${CONTENT.title} ${s.log.length} of ${N} drawn.`) : `${CONTENT.title} Not shuffled yet.`),

  init: () => ({ started: false, order: [], circle: [], current: null, log: [], at: 0 }),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "start") {
      if (s.started) return s;
      const circle = circleOf(ctx);
      if (circle.length === 0) return s;
      return { started: true, order: rng(m.seed).shuffle(range()), circle, current: circle[0] ?? null, log: [], at: m.time };
    }
    if (a.t === "draw") {
      if (!s.started || s.current === null || s.current !== m.user || s.log.length >= N) return s;
      const card = s.order[s.log.length];
      if (typeof card !== "number") return s;
      const i = s.circle.indexOf(m.user);
      if (i < 0) return s;
      const log = [...s.log, { card, by: m.user }];
      const current = log.length >= N ? null : (s.circle[(i + 1) % s.circle.length] ?? null);
      return { ...s, log, current };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    if (!s.started) return s;
    const keep = s.circle.filter((u) => inChat(ctx, u));
    const added = ctx.members.map((m) => m.id).filter((id, i, all) => !s.circle.includes(id) && all.indexOf(id) === i);
    const circle = [...keep, ...added];
    let current: string | null = s.current;
    if (s.log.length >= N || circle.length === 0) {
      current = null;
    } else if (current === null || !circle.includes(current)) {
      current = null;
      const i = s.current === null ? -1 : s.circle.indexOf(s.current);
      if (i >= 0) {
        for (let k = 1; k <= s.circle.length; k++) {
          const u = s.circle[(i + k) % s.circle.length];
          if (u !== undefined && circle.includes(u)) {
            current = u;
            break;
          }
        }
      }
      if (current === null) current = circle[0] ?? null;
    }
    if (circle.join() === s.circle.join() && current === s.current) return s;
    return { ...s, circle, current };
  },

  invariants: {
    "before the shuffle everything is empty, after it the order holds every card once": (s) =>
      s.started
        ? s.order.length === N && [...s.order].sort((x, y) => x - y).every((v, i) => v === i)
        : s.order.length === 0 && s.circle.length === 0 && s.log.length === 0 && s.current === null && s.at === 0,
    "no card is drawn twice: each log entry is the next card in the order": (s) =>
      s.log.length <= N && s.log.every((e, i) => e.card === s.order[i] && typeof e.by === "string" && Number.isInteger(e.card) && e.card >= 0 && e.card < N),
    "everyone in the circle is in the chat, once": (s, ctx) => s.circle.every((u) => inChat(ctx, u)) && new Set(s.circle).size === s.circle.length,
    "the turn is empty when the deck is done or not started, else someone in the circle": (s) =>
      !s.started ? s.current === null : s.log.length >= N || s.circle.length === 0 ? s.current === null : s.current !== null && s.circle.includes(s.current),
  },

  transitions: {
    "a start shuffles with the seed, builds the circle from the chat and gives the first turn": (p, n, a, m, ctx) =>
      a.t !== "start" ||
      p === n ||
      (!p.started &&
        n.started &&
        n.order.join() === rng(m.seed).shuffle(range()).join() &&
        n.log.length === 0 &&
        n.at === m.time &&
        n.current === (n.circle[0] ?? null) &&
        n.circle.length === new Set(ctx.members.map((x) => x.id)).size),
    "a draw adds the next card in the order for the actor and changes nothing else": (p, n, a, m) =>
      a.t !== "draw" ||
      p === n ||
      (n.log.length === p.log.length + 1 &&
        n.log[p.log.length]?.card === p.order[p.log.length] &&
        n.log[p.log.length]?.by === m.user &&
        n.order.join() === p.order.join() &&
        n.circle.join() === p.circle.join() &&
        n.at === p.at),
    "only the person whose turn it is can draw": (p, n, a, m) => a.t !== "draw" || p === n || (p.current !== null && m.user === p.current),
    "after a draw the turn goes to the next person in the circle, or ends with the deck": (p, n, a, m) =>
      a.t !== "draw" || p === n || n.current === nextAfter(p, m.user),
    "once started the order never changes and the log only grows at the end": (p, n) =>
      !p.started || (n.started && n.order.join() === p.order.join() && JSON.stringify(n.log.slice(0, p.log.length)) === JSON.stringify(p.log)),
    "only people in the chat change the deck": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (!s.started) return { t: "start" };
    if (s.current === user) return { t: "draw" };
    return r.next() < 0.3 ? { t: "draw" } : { t: "start" };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const waiting = pending && !confirmed.started && state.started;
    const s = waiting ? confirmed : state;
    const anim = confirmed.started ? running(confirmed.at, 1200) : null;
    const shuffling = waiting || anim !== null;
    const nameOf = (id: string | null) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const done = s.started && s.log.length >= N;
    const myTurn = s.started && !done && s.current === me && !shuffling;
    const last = s.log[s.log.length - 1];
    const earlier = s.log.slice(0, -1).slice(-2).reverse();
    const people = s.started ? s.circle : members.map((m) => m.id);
    const turnText = s.current === me ? "your turn" : `${nameOf(s.current)}'s turn`;

    return (
      <div>
        <CardHeader title={CONTENT.title} subtitle={CONTENT.subtitle} />
        <div
          style={{
            background: theme.color.input,
            color: theme.color.text,
            borderRadius: theme.radius.richCard,
            padding: 14,
            minHeight: 104,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 6,
            overflow: "hidden",
          }}
        >
          {shuffling ? (
            <div style={{ fontSize: theme.type.headline, fontWeight: 600 }}>Shuffling</div>
          ) : !s.started ? (
            <div>
              <div style={{ fontSize: theme.type.headline, fontWeight: 600 }}>Shuffle the deck</div>
              <small>{`${N} questions · one order for everyone`}</small>
            </div>
          ) : !last ? (
            <div>
              <div style={{ fontSize: theme.type.headline, fontWeight: 600 }}>Deck is ready</div>
              <small>{`${nameOf(s.current)} ${s.current === me ? "draw" : "draws"} first`}</small>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <Avatar user={last.by} size={24} />
                <small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{`${nameOf(last.by)} drew`}</small>
              </div>
              <div style={{ fontSize: theme.type.headline, fontWeight: 600, lineHeight: "24px", overflowWrap: "anywhere" }}>{CARDS[last.card] ?? ""}</div>
            </div>
          )}
        </div>
        <div style={{ margin: "8px 0 4px", fontWeight: 600 }}>
          {done ? `Deck done · ${N} of ${N}` : s.started && !shuffling ? `${s.log.length} of ${N} drawn · ${turnText}` : `${s.log.length} of ${N} drawn`}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {people.map((u) => (
            <div
              key={u}
              style={{
                display: "flex",
                padding: 2,
                borderRadius: theme.radius.pill,
                boxShadow: s.started && !done && u === s.current ? `0 0 0 2px ${theme.color.primary}` : "none",
              }}
            >
              <Avatar user={u} size={24} />
            </div>
          ))}
        </div>
        {!s.started ? (
          <Button kind="primary" wide disabled={waiting || members.length === 0} onClick={() => dispatch({ t: "start" })}>
            Shuffle
          </Button>
        ) : done ? null : (
          <div>
            <Button kind="primary" wide disabled={!myTurn} onClick={() => dispatch({ t: "draw" })}>
              Draw
            </Button>
            {myTurn || shuffling ? null : (
              <div style={{ textAlign: "center", marginTop: 2 }}>
                <small>{`Waiting for ${nameOf(s.current)}`}</small>
              </div>
            )}
          </div>
        )}
        {earlier.length > 0 && !shuffling ? (
          <div style={{ marginTop: 6 }}>
            {earlier.map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, height: 26, minWidth: 0 }}>
                <Avatar user={e.by} size={20} />
                <small style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{CARDS[e.card] ?? ""}</small>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
});
