import { defineApp, Avatar, Button, CardHeader, SystemLine } from "@muse/app";

// Song turns: everyone takes a turn adding songs to the playlist, a few at a time.

const C = {
  title: "Playlist turns for friendsgiving",
  when: "Saturday at Ana's · dinner at 6",
  cap: 3,
  maxSongs: 40,
  maxTitle: 40,
};

type Song = { id: string; title: string; by: string };
type State = { order: string[]; turn: string; left: number; songs: Song[]; round: number };
type Action = { t: "add"; title: string } | { t: "pass" } | { t: "remove"; song: string };
type Local = { draft: string };

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const uniq = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) === i);
const countBy = (s: State, id: string) => s.songs.filter((x) => x.by === id).length;
const ids = (s: State) => s.songs.map((x) => x.id).join();
const nextIdx = (order: string[], turn: string) => (order.length ? (order.indexOf(turn) + 1) % order.length : 0);

function advance(s: State): State {
  if (!s.order.length) return s;
  const j = nextIdx(s.order, s.turn);
  return { ...s, turn: s.order[j]!, left: C.cap, round: s.round + (j === 0 ? 1 : 0) };
}

function add(s: State, user: string, raw: unknown, seq: number): State {
  if (typeof raw !== "string" || s.turn !== user || s.songs.length >= C.maxSongs) return s;
  const title = clean(raw);
  if (!title || title.length > C.maxTitle) return s;
  if (s.songs.some((x) => x.title.toLowerCase() === title.toLowerCase())) return s;
  const next: State = { ...s, songs: [...s.songs, { id: `s${seq}`, title, by: user }], left: s.left - 1 };
  return next.left <= 0 ? advance(next) : next;
}

export default defineApp<State, Action, Local>({
  name: "Song turns",
  summary: (s, ctx) => {
    const who = ctx.members.find((m) => m.id === s.turn)?.name ?? "No one";
    return `${C.title}. ${who}'s turn · ${s.left} left. ${s.songs.length} songs added.`;
  },

  init: (ctx) => {
    const order = uniq(ctx.members.map((m) => m.id));
    return { order, turn: order[0] ?? "", left: C.cap, songs: [], round: 0 };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "add") return add(state, meta.user, action.title, meta.seq);
    if (action.t === "pass") return state.turn === meta.user ? advance(state) : state;
    if (action.t === "remove") {
      if (typeof action.song !== "string") return state;
      const song = state.songs.find((x) => x.id === action.song);
      if (!song || song.by !== meta.user) return state;
      return { ...state, songs: state.songs.filter((x) => x.id !== song.id) };
    }
    return state;
  },

  onMembers: (s, ctx) => {
    const kept = s.order.filter((id) => inChat(ctx, id));
    const added = uniq(ctx.members.map((m) => m.id)).filter((id) => !s.order.includes(id));
    const order = [...kept, ...added];
    if (order.length === s.order.length && order.every((x, i) => x === s.order[i])) return s;
    let turn = s.turn;
    let left = s.left;
    if (!order.includes(turn)) {
      const n = s.order.length;
      const i = s.order.indexOf(s.turn);
      const rotated = s.order.map((_, k) => s.order[(i + 1 + k) % n]!);
      turn = rotated.find((cand) => order.includes(cand)) ?? order[0] ?? "";
      left = C.cap;
    }
    return { ...s, order, turn, left };
  },

  invariants: {
    "the turn belongs to someone in the order, or both are empty": (s) => (s.order.length === 0 && s.turn === "") || s.order.includes(s.turn),
    "the order has no repeats and everyone in it is in the chat": (s, ctx) => new Set(s.order).size === s.order.length && s.order.every((id) => inChat(ctx, id)),
    "everyone in the chat has a place in the order": (s, ctx) => ctx.members.every((m) => s.order.includes(m.id)),
    "songs left this turn is a whole number from 1 to the cap": (s) => Number.isInteger(s.left) && s.left >= 1 && s.left <= C.cap && Number.isInteger(s.round) && s.round >= 0,
    "the playlist has unique ids and titles, each 1 to 40 characters, at most 40 songs": (s) =>
      s.songs.length <= C.maxSongs &&
      new Set(s.songs.map((x) => x.id)).size === s.songs.length &&
      new Set(s.songs.map((x) => x.title.toLowerCase())).size === s.songs.length &&
      s.songs.every((x) => x.title.length > 0 && x.title.length <= C.maxTitle && x.title === clean(x.title)),
  },

  transitions: {
    "an add appends one song by the actor with the cleaned title and changes no earlier song": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      const last = n.songs[n.songs.length - 1];
      return (
        n.songs.length === p.songs.length + 1 &&
        p.songs.every((x, i) => n.songs[i]!.id === x.id && n.songs[i]!.title === x.title && n.songs[i]!.by === x.by) &&
        !!last && last.by === m.user && last.title === clean(a.title) && last.id === `s${m.seq}`
      );
    },
    "an add comes only from the person on turn, and spends one song or passes the turn": (p, n, a, m) => {
      if (a.t !== "add" || p === n) return true;
      if (p.turn !== m.user) return false;
      return p.left > 1 ? n.turn === p.turn && n.left === p.left - 1 : n.left === C.cap && n.turn === p.order[nextIdx(p.order, p.turn)];
    },
    "a pass comes only from the person on turn, moves to the next person and keeps the songs": (p, n, a, m) => {
      if (a.t !== "pass" || p === n) return true;
      const wrapped = nextIdx(p.order, p.turn) === 0 ? 1 : 0;
      return p.turn === m.user && n.turn === p.order[nextIdx(p.order, p.turn)] && n.left === C.cap && ids(n) === ids(p) && n.round === p.round + wrapped;
    },
    "a remove deletes exactly one song, and it was the actor's": (p, n, a, m) => {
      if (a.t !== "remove" || p === n) return true;
      return (
        n.songs.length === p.songs.length - 1 &&
        p.songs.some((x) => x.id === a.song && x.by === m.user) &&
        !n.songs.some((x) => x.id === a.song) &&
        n.turn === p.turn && n.left === p.left
      );
    },
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.turn === user) {
      const x = r.next();
      if (x < 0.15) return { t: "pass" };
      if (x < 0.25) return { t: "add", title: r.pick(["", s.songs[0]?.title ?? "Late night", "  Spaced   out  "]) };
      return { t: "add", title: `Song ${r.int(1000)}` };
    }
    const mine = s.songs.filter((x) => x.by === user);
    if (mine.length && r.next() < 0.5) return { t: "remove", song: r.pick(mine).id };
    if (r.next() < 0.2) return { t: "remove", song: "nope" };
    return r.next() < 0.5 ? { t: "add", title: `Song ${r.int(1000)}` } : { t: "pass" };
  },

  local: { draft: "" },

  view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const mine = state.turn === me;
    const songWord = state.left === 1 ? "song" : "songs";
    const subtitle = !state.turn ? "No one yet" : mine ? `Your turn · ${state.left} ${songWord} left` : `${nameOf(state.turn)}'s turn · ${state.left} left`;
    const canAdd = mine && clean(local.draft).length > 0;
    const submit = () => {
      if (!canAdd) return;
      dispatch({ t: "add", title: local.draft.slice(0, C.maxTitle) });
      setLocal({ draft: "" });
    };
    const shown = state.songs.slice(-3);
    const hidden = state.songs.length - shown.length;
    return (
      <div>
        <CardHeader title={C.title} subtitle={subtitle} />
        <div style={{ display: "flex", gap: 2, marginTop: 4 }} role="group" aria-label="Songs added per person, turn order">
          {state.order.map((id) => (
            <div
              key={id}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "6px 2px",
                borderRadius: theme.radius.button,
                boxShadow: id === state.turn ? `0 0 0 2px ${theme.color.primary}` : "none",
              }}
            >
              <Avatar user={id} size={32} />
              <small style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(id)}</small>
              <b>{countBy(state, id)}</b>
            </div>
          ))}
        </div>
        <small style={{ display: "block", margin: "4px 0 8px", color: theme.color.secondaryText }}>{C.when}</small>
        {mine ? (
          <form
            style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input style={{ flex: 1, minWidth: 0 }} value={local.draft} maxLength={C.maxTitle} placeholder="Add song" aria-label="Add song" onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
            <Button kind="primary" disabled={!canAdd} onClick={submit}>Add</Button>
            <Button kind="deemphasized" onClick={() => dispatch({ t: "pass" })}>Pass</Button>
          </form>
        ) : state.turn ? (
          <div style={{ minHeight: 24, marginBottom: 8 }}>
            <SystemLine>{`Waiting for ${nameOf(state.turn)}`}</SystemLine>
          </div>
        ) : null}
        <div>
          {shown.length === 0 ? <small>No songs yet</small> : null}
          {shown.map((x) => (
            <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.title}</div>
                <small>{nameOf(x.by)}</small>
              </div>
              {x.by === me ? <Button kind="deemphasized" onClick={() => dispatch({ t: "remove", song: x.id })}>Remove</Button> : null}
            </div>
          ))}
          {hidden > 0 ? <small>{`${hidden} more`}</small> : null}
        </div>
      </div>
    );
  },
});
