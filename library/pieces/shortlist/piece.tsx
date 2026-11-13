import { defineApp, Button, CardHeader, Facepile, SystemLine, running, spring, springs, tween } from "@muse/app";

// Shortlist: a stack of candidates (sublets, couches, apartments). Each person goes through the
// stack one card at a time and saves or skips; the card slides off. Below, the group shortlist
// ranks every saved candidate by saves, with the faces of who saved it. Where you are in the
// stack comes from what you have answered, so it is the same on every device.

type Params = {
  /** Card title: "Summer sublets" */
  title: string;
  /** Candidates from the chat, 2 to 12, in the order they were posted. */
  items: {
    /** Short name: "Mission 2br" */
    title: string;
    /** Price in cents (1450/mo -> 145000), 0 if none was given. */
    cents: number;
    /** One plain line of facts: "Valencia St · Jun 1-Aug 15 · Priya's cousin posted" */
    detail: string;
  }[];
  /** Price suffix: "/mo", "/night" or "". */
  unit: string;
};

// @params
const P: Params = {
  title: "Summer sublets",
  items: [
    { title: "Mission 2br", cents: 145000, detail: "Valencia St · Jun 1-Aug 15 · Priya's cousin posted" },
    { title: "SoMa studio", cents: 162500, detail: "Has a gym · May 25-Aug 20" },
    { title: "Inner Sunset room", cents: 98000, detail: "Near the N · Jun 1-Aug 31 · 2 roommates" },
    { title: "Lower Haight 1br", cents: 175000, detail: "Furnished · Jun 15-Sep 1" },
    { title: "Noe Valley room", cents: 120000, detail: "Quiet · Jun 1-Aug 10 · grad students" },
  ],
  unit: "/mo",
};
// @end params

type Vote = { u: string; save: boolean; at: number };
type Item = { id: string; title: string; cents: number; detail: string; votes: Vote[] };
type State = { title: string; unit: string; items: Item[] };
type Action = { t: "answer"; item: string; save: boolean } | { t: "clear"; item: string } | { t: "restart" };
type Local = Record<string, never>;
type Ctx = { members: { id: string }[] };

const MAX_ITEMS = 12;
const FLING_MS = 420;
const fling = tween({ duration: FLING_MS, easing: "accelerate" });
const rise = spring(springs.ios);

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const money = (c: number) => {
  const d = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return c % 100 ? `$${d}.${String(c % 100).padStart(2, "0")}` : `$${d}`;
};

// ---- Checks (used by invariants and transitions; the gate does not mutate these). ----
const voteOf = (s: State, item: string, u: string) => s.items.find((i) => i.id === item)?.votes.find((v) => v.u === u);
/** Every vote except one person's vote on one item, as text, so two states can be compared. */
const othersText = (s: State, item: string | null, u: string) =>
  s.items.map((i) => `${i.id}:${i.votes.filter((v) => v.u !== u || (item !== null && i.id !== item)).map((v) => `${v.u}=${v.save}@${v.at}`).join(",")}`).join("|");
const setupText = (s: State) => s.title + s.unit + s.items.map((i) => `${i.id}${i.title}${i.cents}${i.detail}`).join("|");

// ---- Reducer. ----
function answer(s: State, user: string, id: unknown, save: unknown, time: number): State {
  const it = s.items.find((i) => i.id === id);
  if (!it || typeof save !== "boolean") return s;
  const had = it.votes.find((v) => v.u === user);
  if (had && had.save === save) return s;
  const votes = [...it.votes.filter((v) => v.u !== user), { u: user, save, at: time }];
  return { ...s, items: s.items.map((i) => (i.id === it.id ? { ...i, votes } : i)) };
}

function clear(s: State, user: string, id: unknown): State {
  const it = s.items.find((i) => i.id === id);
  if (!it || !it.votes.some((v) => v.u === user)) return s;
  return { ...s, items: s.items.map((i) => (i.id === it.id ? { ...i, votes: i.votes.filter((v) => v.u !== user) } : i)) };
}

function restart(s: State, user: string): State {
  if (!s.items.some((i) => i.votes.some((v) => v.u === user))) return s;
  return { ...s, items: s.items.map((i) => (i.votes.some((v) => v.u === user) ? { ...i, votes: i.votes.filter((v) => v.u !== user) } : i)) };
}

// ---- View helpers. ----
const saversOf = (i: Item) => i.votes.filter((v) => v.save).map((v) => v.u);
const ranked = (s: State) =>
  s.items
    .map((i, n) => ({ i, n, saves: saversOf(i).length }))
    .filter((x) => x.saves > 0)
    .sort((a, b) => b.saves - a.saves || a.n - b.n);

export default defineApp<State, Action, Local>({
  name: "Shortlist",
  summary: (s) => {
    const top = ranked(s)[0];
    return top ? `${s.title}: ${top.i.title} leads with ${top.saves} ${top.saves === 1 ? "save" : "saves"}.` : `${s.title}: ${s.items.length} to go through.`;
  },

  init: () => {
    const seen = new Set<string>();
    const items: Item[] = [];
    for (const raw of P.items) {
      const title = raw.title.trim().replace(/\s+/g, " ").slice(0, 40);
      if (!title || seen.has(title.toLowerCase()) || items.length >= MAX_ITEMS) continue;
      seen.add(title.toLowerCase());
      const cents = Number.isInteger(raw.cents) && raw.cents > 0 && raw.cents <= 100_000_000 ? raw.cents : 0;
      items.push({ id: `c${items.length}`, title, cents, detail: raw.detail.trim().replace(/\s+/g, " ").slice(0, 80), votes: [] });
    }
    return { title: P.title.trim().slice(0, 60) || "Shortlist", unit: P.unit.trim().slice(0, 8), items };
  },

  reduce: (state, action, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return state;
    if (action.t === "answer") return answer(state, meta.user, action.item, action.save, meta.time);
    if (action.t === "clear") return clear(state, meta.user, action.item);
    if (action.t === "restart") return restart(state, meta.user);
    return state;
  },

  // Someone left: their saves and skips go. Someone joined: the whole stack is theirs to go through.
  onMembers: (state, ctx) => {
    if (state.items.every((i) => i.votes.every((v) => inChat(ctx, v.u)))) return state;
    return { ...state, items: state.items.map((i) => ({ ...i, votes: i.votes.filter((v) => inChat(ctx, v.u)) })) };
  },

  invariants: {
    "one answer per person per candidate": (s) => s.items.every((i) => new Set(i.votes.map((v) => v.u)).size === i.votes.length),
    "everyone who answered is in the chat": (s, ctx) => s.items.every((i) => i.votes.every((v) => inChat(ctx, v.u))),
    "answers are save or skip": (s) => s.items.every((i) => i.votes.every((v) => typeof v.save === "boolean" && Number.isFinite(v.at))),
    "candidate ids are unique": (s) => new Set(s.items.map((i) => i.id)).size === s.items.length,
  },

  transitions: {
    "an answer sets the actor's answer on that candidate and touches nothing else": (p, n, a, m) => {
      if (a.t !== "answer" || p === n) return true;
      const v = voteOf(n, a.item, m.user);
      return !!v && v.save === a.save && v.at === m.time && voteOf(p, a.item, m.user)?.save !== a.save && othersText(p, a.item, m.user) === othersText(n, a.item, m.user);
    },
    "a clear removes only the actor's answer on that candidate": (p, n, a, m) =>
      a.t !== "clear" || p === n || (!!voteOf(p, a.item, m.user) && !voteOf(n, a.item, m.user) && othersText(p, a.item, m.user) === othersText(n, a.item, m.user)),
    "a restart removes every answer of the actor and nobody else's": (p, n, a, m) =>
      a.t !== "restart" || p === n || (n.items.every((i) => !i.votes.some((v) => v.u === m.user)) && othersText(p, null, m.user) === othersText(n, null, m.user)),
    "the candidates never change": (p, n) => setupText(p) === setupText(n),
    "only people in the chat answer": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (!s.items.length) return null;
    const k = r.next();
    const next = s.items.find((i) => !i.votes.some((v) => v.u === user));
    if (next && k < 0.7) return { t: "answer", item: next.id, save: r.next() < 0.55 };
    if (k < 0.85) return { t: "answer", item: r.pick(s.items).id, save: r.next() < 0.5 };
    if (k < 0.95) return { t: "clear", item: r.pick(s.items).id };
    return { t: "restart" };
  },

  local: {},

  view: ({ state, me, members, dispatch, theme }) => {
    const items = state.items;
    const mineCount = items.filter((i) => i.votes.some((v) => v.u === me)).length;
    const current = items.find((i) => !i.votes.some((v) => v.u === me)) ?? null;
    const left = items.length - mineCount;
    // My newest answer: the card it belongs to slides off while the next one rises.
    let last: { item: Item; v: Vote } | null = null;
    for (const i of items) for (const v of i.votes) if (v.u === me && (!last || v.at > last.v.at)) last = { item: i, v };
    const t = last ? running(last.v.at, FLING_MS) : null;
    const done = members.filter((m) => items.length > 0 && items.every((i) => i.votes.some((v) => v.u === m.id))).map((m) => m.id);
    const list = ranked(state);
    const price = (c: number) => (c ? `${money(c)}${state.unit}` : "");

    const face = (it: Item, extra: object) => (
      <div
        style={{
          position: "relative",
          background: theme.color.card,
          borderRadius: theme.radius.richCard,
          boxShadow: `0 0 0 1px ${theme.color.divider}`,
          padding: "12px 14px",
          minHeight: 96,
          ...extra,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: theme.type.title, fontWeight: 600, lineHeight: "22px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
          {it.cents ? <div style={{ flex: "none", fontWeight: 600, color: theme.color.link }}>{price(it.cents)}</div> : null}
        </div>
        <div style={{ marginTop: 4, color: theme.color.secondaryText, fontSize: theme.type.meta, lineHeight: "16px" }}>{it.detail || " "}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, minHeight: 20 }}>
          {saversOf(it).length ? <Facepile users={saversOf(it)} max={4} size={20} /> : null}
          <small>{saversOf(it).length ? `${saversOf(it).length} saved` : "No saves yet"}</small>
        </div>
      </div>
    );

    const rising = t !== null ? rise(t) : 1;
    const out = t !== null ? fling(t) : 1;
    const dir = last?.v.save ? 1 : -1;

    return (
      <div>
        <CardHeader title={state.title} subtitle={current ? `${mineCount + 1} of ${items.length} · save the ones you'd take` : `You went through all ${items.length}`} />
        <div style={{ position: "relative", paddingBottom: current && left > 1 ? 8 : 0 }}>
          {current && left > 1 ? (
            <div aria-hidden="true" style={{ position: "absolute", left: 10, right: 10, bottom: 0, height: 24, borderRadius: theme.radius.richCard, background: theme.color.input }} />
          ) : null}
          {current ? (
            face(current, { transform: `translateY(${(1 - rising) * 10}px) scale(${0.96 + 0.04 * rising})` })
          ) : (
            <div style={{ borderRadius: theme.radius.richCard, background: theme.color.input, padding: "14px", minHeight: 96, display: "grid", gap: 6, alignContent: "center", justifyItems: "center" }}>
              <div style={{ fontWeight: 600 }}>That's the whole stack</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Facepile users={done} max={5} size={20} />
                <small>{`${done.length} of ${members.length} done`}</small>
              </div>
            </div>
          )}
          {last && t !== null ? (
            <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, pointerEvents: "none", opacity: 1 - out, transform: `translateX(${dir * out * 110}%) rotate(${dir * out * 14}deg)` }}>
              {face(last.item, {})}
              <div style={{ position: "absolute", top: 12, [dir > 0 ? "left" : "right"]: 14, padding: "2px 8px", borderRadius: 6, fontWeight: 700, fontSize: theme.type.meta, color: theme.color.onPrimary, background: dir > 0 ? theme.color.positive : theme.color.secondaryText }}>
                {dir > 0 ? "Saved" : "Skipped"}
              </div>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {current ? (
            <>
              <div style={{ flex: 1, display: "flex" }}>
                <Button wide onClick={() => dispatch({ t: "answer", item: current.id, save: false })}>
                  Skip
                </Button>
              </div>
              <div style={{ flex: 1, display: "flex" }}>
                <Button kind="primary" wide onClick={() => dispatch({ t: "answer", item: current.id, save: true })}>
                  Save
                </Button>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex" }}>
              <Button wide onClick={() => dispatch({ t: "restart" })}>
                Start over
              </Button>
            </div>
          )}
        </div>
        <div style={{ marginTop: 12, borderTop: `1px solid ${theme.color.divider}`, paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600 }}>Group shortlist</div>
            <small>{list.length ? `${list.length} saved` : ""}</small>
          </div>
          {list.length ? (
            list.slice(0, 3).map(({ i, saves }, k) => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44 }}>
                <div style={{ width: 20, flex: "none", textAlign: "center", fontWeight: 700, color: k === 0 ? theme.color.link : theme.color.secondaryText }}>{k + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: k === 0 ? 600 : 400 }}>{i.title}</div>
                  {i.cents ? <small>{price(i.cents)}</small> : null}
                </div>
                <Facepile users={saversOf(i)} max={3} size={20} />
                <small style={{ minWidth: 48, textAlign: "right" }}>{`${saves} ${saves === 1 ? "save" : "saves"}`}</small>
              </div>
            ))
          ) : (
            <SystemLine>Saved places show up here</SystemLine>
          )}
          {list.length > 3 ? <SystemLine>{`and ${list.length - 3} more saved`}</SystemLine> : null}
        </div>
      </div>
    );
  },
});
