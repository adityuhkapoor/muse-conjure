import { defineApp, Avatar, Button, CardHeader, Facepile, SystemLine } from "@muse/app";

// Veto round: everyone gets one veto, each veto strikes a place, and the last place left wins.

const CHAT = {
  title: "Where should we eat?",
  detail: "Mia's birthday dinner · Saturday",
  places: ["Kura Sushi", "Seoul BBQ House", "Olive Garden", "La Monarca", "Ippudo"],
};

type Place = { id: string; label: string; vetoedBy: string | null; at: number };
type State = { title: string; detail: string; places: Place[]; vetoers: string[]; winner: string | null };
type Action = { t: "veto"; place: string } | { t: "undo"; place: string };
type Local = Record<string, never>;
type Ctx = { members: { id: string }[] };

const MAX_PLACES = 8;
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const standing = (s: State) => s.places.filter((p) => p.vetoedBy === null);
const same = (a: Place, b: Place | undefined) => !!b && a.id === b.id && a.label === b.label && a.vetoedBy === b.vetoedBy && a.at === b.at;
const othersSame = (p: State, n: State, i: number) => p.places.length === n.places.length && p.places.every((x, j) => j === i || same(x, n.places[j]));

function veto(s: State, user: string, id: unknown, time: number): State {
  if (s.winner !== null || typeof id !== "string") return s;
  if (s.vetoers.includes(user)) return s;
  const target = s.places.find((p) => p.id === id);
  if (!target || target.vetoedBy !== null) return s;
  if (standing(s).length < 2) return s;
  const places = s.places.map((p) => (p.id === target.id ? { ...p, vetoedBy: user, at: time } : p));
  const left = places.filter((p) => p.vetoedBy === null);
  return { ...s, places, vetoers: [...s.vetoers, user], winner: left.length === 1 ? left[0]!.id : null };
}

function undo(s: State, user: string, id: unknown): State {
  if (s.winner !== null || typeof id !== "string") return s;
  const target = s.places.find((p) => p.id === id);
  if (!target || target.vetoedBy !== user) return s;
  return {
    ...s,
    places: s.places.map((p) => (p.id === target.id ? { ...p, vetoedBy: null, at: 0 } : p)),
    vetoers: s.vetoers.filter((v) => v !== user),
  };
}

export default defineApp<State, Action, Local>({
  name: "Veto round",
  summary: (s) => {
    const w = s.winner !== null ? s.places.find((p) => p.id === s.winner) : undefined;
    if (w) return `${s.title} ${w.label} · ${s.detail}`;
    return `${s.title} ${standing(s).length} of ${s.places.length} places left.`;
  },

  init: () => {
    const seen = new Set<string>();
    const places: Place[] = [];
    for (const raw of CHAT.places) {
      const label = raw.trim().replace(/\s+/g, " ").slice(0, 40);
      if (!label || seen.has(label.toLowerCase()) || places.length >= MAX_PLACES) continue;
      seen.add(label.toLowerCase());
      places.push({ id: `p${places.length}`, label, vetoedBy: null, at: 0 });
    }
    return { title: CHAT.title, detail: CHAT.detail, places, vetoers: [], winner: null };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "veto") return veto(state, meta.user, action.place, meta.time);
    if (action.t === "undo") return undo(state, meta.user, action.place);
    return state;
  },

  invariants: {
    "each person is in vetoers at most once": (s) => new Set(s.vetoers).size === s.vetoers.length,
    "struck places match the number of vetoers": (s) => s.places.filter((p) => p.vetoedBy !== null).length === s.vetoers.length,
    "every striker is in vetoers": (s) => s.places.every((p) => p.vetoedBy === null || s.vetoers.includes(p.vetoedBy)),
    "one striker per person": (s) => {
      const by = s.places.map((p) => p.vetoedBy).filter((v): v is string => v !== null);
      return new Set(by).size === by.length;
    },
    "at least one place is left and the winner is the single place left": (s) => {
      const left = standing(s);
      return left.length >= 1 && s.winner === (left.length === 1 ? left[0]!.id : null);
    },
    "place ids and labels are unique, at most 8": (s) =>
      s.places.length <= MAX_PLACES &&
      new Set(s.places.map((p) => p.id)).size === s.places.length &&
      new Set(s.places.map((p) => p.label.toLowerCase())).size === s.places.length,
  },

  transitions: {
    "a veto strikes the named place for the actor and nothing else": (p, n, a, m) => {
      if (a.t !== "veto" || p === n) return true;
      const i = p.places.findIndex((x) => x.id === a.place);
      return (
        i >= 0 &&
        p.places[i]!.vetoedBy === null &&
        n.places[i]?.vetoedBy === m.user &&
        n.places[i]!.at === m.time &&
        !p.vetoers.includes(m.user) &&
        n.vetoers.join() === [...p.vetoers, m.user].join() &&
        othersSame(p, n, i)
      );
    },
    "an undo lifts only the actor's own veto": (p, n, a, m) => {
      if (a.t !== "undo" || p === n) return true;
      const i = p.places.findIndex((x) => x.id === a.place);
      return (
        i >= 0 &&
        p.places[i]!.vetoedBy === m.user &&
        n.places[i]?.vetoedBy === null &&
        n.vetoers.join() === p.vetoers.filter((v) => v !== m.user).join() &&
        othersSame(p, n, i)
      );
    },
    "nothing changes once a winner is set": (p, n) => p.winner === null || p === n,
    "only people in the chat change anything": (p, n, _a, m, ctx) => p === n || inChat(ctx, m.user),
    "the title and detail never change": (p, n) => p.title === n.title && p.detail === n.detail,
  },

  arbitrary: (s, user, r) => {
    const mine = s.places.filter((p) => p.vetoedBy === user);
    if (mine.length && r.next() < 0.3) return { t: "undo", place: r.pick(mine).id };
    if (r.next() < 0.05) return { t: "veto", place: "nope" };
    return { t: "veto", place: r.pick(s.places).id };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const left = standing(state);
    const iUsed = state.vetoers.includes(me);
    const won = state.winner !== null ? state.places.find((p) => p.id === state.winner) : undefined;
    const waiting = members.filter((m) => !state.vetoers.includes(m.id)).map((m) => m.id);
    const vetoesToGo = Math.max(0, left.length - 1);
    return (
      <div>
        <CardHeader
          title={state.title}
          subtitle={won ? "One place left" : `${left.length} of ${state.places.length} places left · ${state.vetoers.length} vetoed`}
        />
        <div style={{ display: "grid" }}>
          {state.places.map((p) => {
            const out = p.vetoedBy !== null;
            const isWin = !!won && won.id === p.id;
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 44,
                  padding: "0 8px",
                  borderRadius: theme.radius.button,
                  background: isWin ? theme.color.selected : "transparent",
                  boxShadow: isWin ? `inset 0 0 0 2px ${theme.color.primary}` : "none",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: isWin ? 600 : 400,
                    textDecoration: out ? "line-through" : "none",
                    color: out ? theme.color.secondaryText : theme.color.text,
                  }}
                >
                  {p.label}
                </span>
                {out ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                    <Avatar user={p.vetoedBy!} size={24} />
                    {p.vetoedBy === me && !state.winner ? (
                      <Button kind="secondary" onClick={() => dispatch({ t: "undo", place: p.id })}>
                        Undo
                      </Button>
                    ) : null}
                  </div>
                ) : isWin ? (
                  <small style={{ fontWeight: 600, color: theme.color.link, flex: "none" }}>Winner</small>
                ) : !state.winner && !iUsed ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "veto", place: p.id })}>
                    Veto
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8 }}>
          {won ? (
            <div style={{ display: "grid", gap: 2 }}>
              <div style={{ fontWeight: 600, color: theme.color.text }}>{`Locked · ${won.label}`}</div>
              <small>{state.detail}</small>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              <SystemLine>{iUsed ? "Your veto is used" : "You have one veto"}</SystemLine>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28 }}>
                {waiting.length ? <Facepile users={waiting} max={5} size={20} /> : null}
                <small>{`${vetoesToGo} ${vetoesToGo === 1 ? "veto" : "vetoes"} to go · the last place wins`}</small>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
});
