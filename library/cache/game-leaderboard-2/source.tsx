import { defineApp, Avatar, Button, CardHeader, SystemLine, type Child } from "@muse/app";

// Running trivia leaderboard. One night per month; the first is tonight's scores from the chat.
// Everyone can set or clear their own score, add a night, and switch which night is shown.

const CHAT = {
  title: "Trivia leaderboard",
  firstNight: "Tonight",
  scores: [
    ["Cleo", 14],
    ["Omar", 11],
    ["Theo", 9],
    ["Maya", 17],
    ["Wren", 13],
    ["June", 12],
    ["Marcus", 15],
    ["Sam", 8],
  ] as [string, number][],
};

type Night = { id: string; label: string; scores: Record<string, number> };
type State = { nights: Night[]; current: string };
type Action =
  | { t: "score"; night: string; points: number }
  | { t: "clear"; night: string }
  | { t: "newNight"; label: string }
  | { t: "show"; night: string };
type Local = { draft: string; label: string; rest: boolean; add: boolean };

const MAX_NIGHTS = 12;
const MAX_LABEL = 30;
const MAX_POINTS = 100;
const SHOWN = 5;

const clean = (label: string) => label.trim().replace(/\s+/g, " ");
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const without = (scores: Record<string, number>, user: string) => Object.fromEntries(Object.entries(scores).filter(([k]) => k !== user));
/** The whole state with one person's entry on one night removed, to compare before and after. */
const dropUser = (s: State, night: unknown, user: string) =>
  JSON.stringify({ c: s.current, n: s.nights.map((x) => (x.id === night ? { ...x, scores: without(x.scores, user) } : x)) });
const nightOf = (s: State, id: unknown) => s.nights.find((x) => x.id === id);

/** A simple show/hide section built from a button, used where a disclosure is needed. */
const disclose = (title: string, summary: string | null, open: boolean, onToggle: () => void, children: Child) => (
  <div style={{ marginTop: 4 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Button kind="deemphasized" onClick={onToggle}>
        {title}
      </Button>
      {summary && !open ? <small>{summary}</small> : null}
    </div>
    {open ? <div style={{ marginTop: 4 }}>{children}</div> : null}
  </div>
);

export default defineApp<State, Action, Local>({
  name: "Trivia board",
  summary: (s, ctx) => {
    const cur = nightOf(s, s.current) ?? s.nights[0]!;
    const top = ctx.members
      .filter((m) => cur.scores[m.id] !== undefined)
      .sort((a, b) => (cur.scores[b.id] ?? 0) - (cur.scores[a.id] ?? 0) || a.name.localeCompare(b.name))[0];
    return top ? `${CHAT.title} · ${cur.label} · ${top.name} leads with ${cur.scores[top.id] ?? 0}` : `${CHAT.title} · ${cur.label} · No scores yet`;
  },

  init: (ctx) => {
    const scores: Record<string, number> = {};
    for (const [name, pts] of CHAT.scores) {
      const m = ctx.members.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (m) scores[m.id] = pts;
    }
    return { nights: [{ id: "first", label: CHAT.firstNight, scores }], current: "first" };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "score") {
      if (typeof a.night !== "string" || typeof a.points !== "number" || !Number.isInteger(a.points) || a.points < 0 || a.points > MAX_POINTS) return s;
      const night = nightOf(s, a.night);
      if (!night || night.scores[m.user] === a.points) return s;
      return { ...s, nights: s.nights.map((x) => (x.id === a.night ? { ...x, scores: { ...x.scores, [m.user]: a.points } } : x)) };
    }
    if (a.t === "clear") {
      if (typeof a.night !== "string") return s;
      const night = nightOf(s, a.night);
      if (!night || night.scores[m.user] === undefined) return s;
      return { ...s, nights: s.nights.map((x) => (x.id === a.night ? { ...x, scores: without(x.scores, m.user) } : x)) };
    }
    if (a.t === "newNight") {
      if (typeof a.label !== "string") return s;
      const label = clean(a.label);
      const id = `n${m.seq}`;
      if (!label || label.length > MAX_LABEL || s.nights.length >= MAX_NIGHTS || s.nights.some((x) => x.id === id)) return s;
      return { nights: [...s.nights, { id, label, scores: {} }], current: id };
    }
    if (a.t === "show") {
      if (typeof a.night !== "string" || a.night === s.current || !nightOf(s, a.night)) return s;
      return { ...s, current: a.night };
    }
    return s;
  },

  // Someone left: their scores go with them. Someone joined: they can add a score at once.
  onMembers: (s, ctx) => {
    if (s.nights.every((n) => Object.keys(n.scores).every((u) => inChat(ctx, u)))) return s;
    return { ...s, nights: s.nights.map((n) => ({ ...n, scores: Object.fromEntries(Object.entries(n.scores).filter(([u]) => inChat(ctx, u))) })) };
  },

  invariants: {
    "every score is a whole number from 0 to 100": (s) => s.nights.every((n) => Object.values(n.scores).every((v) => Number.isInteger(v) && v >= 0 && v <= MAX_POINTS)),
    "every score belongs to someone in the chat": (s, ctx) => s.nights.every((n) => Object.keys(n.scores).every((u) => inChat(ctx, u))),
    "the shown night is one of the nights": (s) => s.nights.some((n) => n.id === s.current),
    "there are 1 to 12 nights with unique ids": (s) => s.nights.length >= 1 && s.nights.length <= MAX_NIGHTS && new Set(s.nights.map((n) => n.id)).size === s.nights.length,
    "night labels are 1 to 30 characters, tidy": (s) => s.nights.every((n) => n.label.length >= 1 && n.label.length <= MAX_LABEL && n.label === clean(n.label)),
  },

  transitions: {
    "a score sets the actor's entry on that night and changes nothing else": (p, n, a, m) =>
      a.t !== "score" || p === n || (nightOf(n, a.night)?.scores[m.user] === a.points && dropUser(p, a.night, m.user) === dropUser(n, a.night, m.user)),
    "a clear removes only the actor's entry on that night": (p, n, a, m) =>
      a.t !== "clear" ||
      p === n ||
      (nightOf(p, a.night)?.scores[m.user] !== undefined && nightOf(n, a.night)?.scores[m.user] === undefined && dropUser(p, a.night, m.user) === dropUser(n, a.night, m.user)),
    "a new night is added last, empty, and becomes the shown night": (p, n, a, m) => {
      if (a.t !== "newNight" || p === n) return true;
      const last = n.nights.at(-1);
      return (
        !!last &&
        n.nights.length === p.nights.length + 1 &&
        last.id === `n${m.seq}` &&
        Object.keys(last.scores).length === 0 &&
        last.label === clean(String(a.label)) &&
        n.current === last.id &&
        JSON.stringify(p.nights) === JSON.stringify(n.nights.slice(0, -1))
      );
    },
    "show changes only which night is shown": (p, n, a) => a.t !== "show" || p === n || (JSON.stringify(p.nights) === JSON.stringify(n.nights) && n.current === a.night),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, _user, r) => {
    const k = r.next();
    const night = r.pick(s.nights).id;
    if (k < 0.55) return { t: "score", night, points: r.next() < 0.1 ? MAX_POINTS + 1 : r.int(MAX_POINTS + 1) };
    if (k < 0.65) return { t: "clear", night };
    if (k < 0.8) return { t: "newNight", label: r.pick(["Next month", "Night 3", "", "Quiz league", "  Holiday   special "]) };
    return { t: "show", night };
  },

  local: { draft: "", label: "", rest: false, add: false },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const cur = nightOf(state, state.current) ?? state.nights[0]!;
    const entries = members
      .filter((m) => cur.scores[m.id] !== undefined)
      .map((m) => ({ id: m.id, name: m.name, pts: cur.scores[m.id] ?? 0 }))
      .sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
    const ranked = entries.map((e) => ({ ...e, rank: entries.findIndex((x) => x.pts === e.pts) + 1 }));
    const top = ranked.slice(0, SHOWN);
    const mineRow = ranked.find((x) => x.id === me);
    const pinned = mineRow && !top.includes(mineRow) ? mineRow : null;
    const rest = ranked.slice(SHOWN).filter((x) => x !== pinned);
    const max = Math.max(1, ranked[0]?.pts ?? 1);
    const mine = cur.scores[me];

    const nightsWithMine = state.nights.filter((n) => n.scores[me] !== undefined);
    const myTotal = nightsWithMine.reduce((t, n) => t + (n.scores[me] ?? 0), 0);

    const valid = /^\d{1,3}$/.test(local.draft) && Number(local.draft) <= MAX_POINTS;
    const submit = () => {
      if (!valid) return;
      dispatch({ t: "score", night: cur.id, points: Number(local.draft) });
      setLocal({ draft: "" });
    };
    const addNight = () => {
      if (!clean(local.label)) return;
      dispatch({ t: "newNight", label: clean(local.label).slice(0, MAX_LABEL) });
      setLocal({ label: "", add: false });
    };

    const row = (e: { id: string; name: string; pts: number; rank: number }) => {
      const isMe = e.id === me;
      return (
        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32, padding: "3px 0" }}>
          <div style={{ width: 20, textAlign: "center", fontWeight: 600, color: theme.color.secondaryText }}>{e.rank}</div>
          <Avatar user={e.id} size={24} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: isMe ? 700 : 400, lineHeight: "20px" }}>{isMe ? `${e.name} · you` : e.name}</div>
            <div style={{ height: 4, borderRadius: 2, background: theme.color.track, marginTop: 2 }}>
              <div style={{ height: 4, borderRadius: 2, width: `${Math.round((e.pts / max) * 100)}%`, background: isMe ? theme.color.primary : theme.color.secondaryText }} />
            </div>
          </div>
          <div style={{ minWidth: 28, textAlign: "right", fontWeight: 700 }}>{e.pts}</div>
        </div>
      );
    };

    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={`${cur.label} · ${ranked.length} ${ranked.length === 1 ? "score" : "scores"}`} />
        {state.nights.length > 1 ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {state.nights.map((n) => (
              <div key={n.id} style={{ maxWidth: "100%", minWidth: 0 }}>
                <Button kind={n.id === cur.id ? "primary" : "secondary"} onClick={() => dispatch({ t: "show", night: n.id })}>
                  {n.label}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ marginTop: 6 }}>
          {ranked.length === 0 ? <SystemLine>No scores yet · add yours below</SystemLine> : null}
          {top.map(row)}
          {pinned ? row(pinned) : null}
          {rest.length ? disclose("More scores", `${rest.length} more`, local.rest, () => setLocal({ rest: !local.rest }), rest.map(row)) : null}
        </div>
        {state.nights.length > 1 && nightsWithMine.length ? (
          <small style={{ display: "block", marginTop: 4 }}>{`Total · ${myTotal} · ${nightsWithMine.length} ${nightsWithMine.length === 1 ? "night" : "nights"}`}</small>
        ) : null}
        <form
          style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            value={local.draft}
            maxLength={3}
            placeholder={mine !== undefined ? `Your score · ${mine}` : "Your score"}
            aria-label="Your score"
            onInput={(e) => setLocal({ draft: e.currentTarget.value.replace(/\D/g, "") })}
          />
          {mine !== undefined && local.draft === "" ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "clear", night: cur.id })}>
              Clear
            </Button>
          ) : (
            <Button kind="primary" disabled={!valid} onClick={submit}>
              {mine !== undefined ? "Update" : "Add score"}
            </Button>
          )}
        </form>
        {state.nights.length < MAX_NIGHTS
          ? disclose(
              "New night",
              null,
              local.add,
              () => setLocal({ add: !local.add }),
              <form
                style={{ display: "flex", gap: 8, alignItems: "center" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  addNight();
                }}
              >
                <input value={local.label} maxLength={MAX_LABEL} placeholder="Night name" aria-label="Night name" onInput={(e) => setLocal({ label: e.currentTarget.value })} />
                <Button kind="secondary" disabled={!clean(local.label)} onClick={addNight}>
                  Add
                </Button>
              </form>,
            )
          : null}
      </div>
    );
  },
});
