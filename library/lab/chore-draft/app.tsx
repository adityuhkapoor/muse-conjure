import { defineApp, Avatar, Button, CardHeader, More, Toast, clock, running, haptic, mix } from "@muse/app";

type Params = { title: string; sub: string; chores: { name: string; pts: number; note: string }[]; order: string[]; picks: { chore: number; name: string }[] };

// @params
const P: Params = {
  title: "Chore draft", sub: "Apt 4B · November",
  chores: [
    { name: "Bathrooms", pts: 5, note: "Both. Yes both" }, { name: "Dishes", pts: 4, note: "Pans included" },
    { name: "Fridge", pts: 4, note: "Purge it 1st Sun" }, { name: "Trash", pts: 3, note: "+ curb on Tue" },
    { name: "Vacuum", pts: 3, note: "Whole apt" }, { name: "Recycling", pts: 2, note: "Flatten boxes" },
    { name: "Mail runs", pts: 2, note: "Lobby + packages" }, { name: "Plants", pts: 1, note: "Keep Gerald alive" },
  ],
  order: ["Maya", "Theo", "Noa", "Dev"],
  picks: [{ chore: 1, name: "Maya" }, { chore: 2, name: "Theo" }],
};
// @end params

type Chore = { name: string; pts: number; note: string };
type Pick = { chore: number; by: string; at: number };
type State = {
  title: string; sub: string; chores: Chore[];
  order: string[];
  picks: Pick[];
  turnAt: number;
  doneAt: number;
};
type Action = { t: "pick"; chore: number } | { t: "auto" } | { t: "redraft" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name?: string }[] };

const CLOCK_MS = 30000;
const MAX_DRAFTERS = 8;
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const whoAt = (s: State, k: number): string => {
  const n = s.order.length;
  const r = Math.floor(k / n);
  const i = k % n;
  return r % 2 === 0 ? s.order[i]! : s.order[n - 1 - i]!;
};
const complete = (s: State) => s.chores.length > 0 && s.picks.length === s.chores.length;
const onClock = (s: State): string | null => (s.picks.length < s.chores.length && s.order.length ? whoAt(s, s.picks.length) : null);
const total = (s: State, u: string) => s.picks.reduce((a, p) => (p.by === u ? a + (s.chores[p.chore]?.pts ?? 0) : a), 0);
const target = (s: State) => Math.round(s.chores.reduce((a, c) => a + c.pts, 0) / Math.max(1, s.order.length));
const isFree = (s: State, i: number) => Number.isInteger(i) && i >= 0 && i < s.chores.length && !s.picks.some((p) => p.chore === i);

function botPick(s: State, u: string): number {
  const free = s.chores.map((_, i) => i).filter((i) => isFree(s, i));
  const mine = total(s, u);
  const has = s.picks.some((p) => p.by === u);
  let best = free[0]!;
  if (!has) {
    for (const i of free) if (s.chores[i]!.pts > s.chores[best]!.pts) best = i;
    return best;
  }
  const t = target(s);
  const cost = (i: number) => Math.abs(mine + s.chores[i]!.pts - t);
  for (const i of free) {
    const a = cost(i), b = cost(best);
    if (a < b || (a === b && s.chores[i]!.pts < s.chores[best]!.pts)) best = i;
  }
  return best;
}

const stamp = (s: State, time: number) => Math.max(time, s.picks.at(-1)?.at ?? 0);
const settle = (prev: State, next: State, time: number): State => ({
  ...next,
  doneAt: complete(next) ? (complete(prev) ? prev.doneAt : time) : 0,
});

const spread = (s: State) => {
  const t = s.order.map((u) => total(s, u));
  return t.length ? Math.max(...t) - Math.min(...t) : 0;
};
const lightest = (s: State) => s.order.reduce((best, u) => (total(s, u) < total(s, best) ? u : best), s.order[0]!);

export default defineApp<State, Action, Local>({
  name: "Chore draft",
  summary: (s, ctx) => {
    const nameOf = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? "Someone";
    if (complete(s)) return `${s.title}: done · ${spread(s) <= 1 ? "dead even" : `${nameOf(lightest(s))} got off light`}`;
    const c = onClock(s);
    return `${s.title}: ${s.picks.length} of ${s.chores.length} picked${c ? ` · ${nameOf(c)} is up` : ""}`;
  },

  init: (ctx) => {
    let chores: Chore[] = [];
    for (const c of P.chores) {
      if (chores.length >= 8) break;
      const name = typeof c.name === "string" ? c.name.trim().slice(0, 32) : "";
      if (!name || typeof c.pts !== "number" || !Number.isFinite(c.pts)) continue;
      chores.push({ name, pts: Math.max(1, Math.min(5, Math.round(c.pts))), note: typeof c.note === "string" ? c.note.trim().slice(0, 40) : "" });
    }
    if (chores.length < 2) {
      chores = [{ name: "Dishes", pts: 4, note: "" }, { name: "Trash", pts: 3, note: "" }, { name: "Bathrooms", pts: 5, note: "" }, { name: "Plants", pts: 1, note: "" }];
    }
    let order: string[] = [];
    for (const w of P.order) {
      const want = w.trim().toLowerCase();
      const m = ctx.members.find((x) => x.id === w || (x.name ?? "").toLowerCase() === want);
      if (m && !order.includes(m.id) && order.length < MAX_DRAFTERS) order.push(m.id);
    }
    if (order.length < 2) order = ctx.members.slice(0, MAX_DRAFTERS).map((m) => m.id);
    let s: State = { title: P.title.trim().slice(0, 60) || "Chore draft", sub: P.sub.trim().slice(0, 40), chores, order, picks: [], turnAt: 0, doneAt: 0 };
    for (const p of P.picks) {
      const m = ctx.members.find((x) => x.id === p.name || (x.name ?? "").toLowerCase() === String(p.name).trim().toLowerCase());
      if (!s.order.length || !m || m.id !== onClock(s) || !isFree(s, p.chore)) break;
      s = { ...s, picks: [...s.picks, { chore: p.chore, by: m.id, at: 0 }] };
    }
    return { ...s, doneAt: complete(s) ? 1 : 0 };
  },

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    const clk = onClock(s);
    if (a.t === "pick") {
      if (clk === null || meta.user !== clk || !isFree(s, a.chore)) return s;
      return settle(s, { ...s, picks: [...s.picks, { chore: a.chore, by: meta.user, at: stamp(s, meta.time) }], turnAt: meta.time }, meta.time);
    }
    if (a.t === "auto") {
      if (clk === null || !(meta.user === clk || meta.time - s.turnAt >= CLOCK_MS)) return s;
      return settle(s, { ...s, picks: [...s.picks, { chore: botPick(s, clk), by: clk, at: stamp(s, meta.time) }], turnAt: meta.time }, meta.time);
    }
    if (a.t === "redraft") {
      if (!complete(s) || !s.order.includes(meta.user)) return s;
      return { ...s, picks: [], turnAt: meta.time, doneAt: 0 };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    let order = s.order.filter((u) => inChat(ctx, u));
    if (s.picks.length === 0) {
      for (const m of ctx.members) if (order.length < MAX_DRAFTERS && !order.includes(m.id)) order.push(m.id);
    }
    const picks = s.picks.filter((p) => order.includes(p.by) && inChat(ctx, p.by));
    const next = { ...s, order, picks };
    return { ...next, doneAt: complete(next) ? s.doneAt || 1 : 0 };
  },

  invariants: {
    "each chore is picked once": (s) => s.picks.every((p) => Number.isInteger(p.chore) && p.chore >= 0 && p.chore < s.chores.length) && new Set(s.picks.map((p) => p.chore)).size === s.picks.length,
    "only drafters pick": (s, ctx) => s.picks.every((p) => s.order.includes(p.by)) && new Set(s.order).size === s.order.length && s.order.every((u) => inChat(ctx, u)),
    "done is stamped exactly when every chore is taken": (s) => (s.doneAt > 0) === complete(s),
    "picks are in time order": (s) => s.picks.every((p, i) => i === 0 || s.picks[i - 1]!.at <= p.at),
    "the load adds up": (s) => s.order.reduce((a, u) => a + total(s, u), 0) === s.picks.reduce((a, p) => a + (s.chores[p.chore]?.pts ?? 0), 0),
    "chores are 2 to 8, worth 1 to 5": (s) => s.chores.length >= 2 && s.chores.length <= 8 && s.chores.every((c) => Number.isInteger(c.pts) && c.pts >= 1 && c.pts <= 5),
  },

  transitions: {
    "only the person on the clock picks, and gets that chore": (p, n, a, m) =>
      a.t !== "pick" || p === n || (onClock(p) === m.user && same(n.picks, [...p.picks, { chore: a.chore, by: m.user, at: stamp(p, m.time) }]) && n.turnAt === m.time),
    "auto-pick takes the balancing chore for whoever is up, once their clock runs out": (p, n, a, m) =>
      a.t !== "auto" || p === n || (onClock(p) !== null && (m.user === onClock(p) || m.time - p.turnAt >= CLOCK_MS) && same(n.picks, [...p.picks, { chore: botPick(p, onClock(p)!), by: onClock(p), at: stamp(p, m.time) }])),
    "done is stamped when the last chore goes": (p, n, a, m) => p === n || a.t === "redraft" || n.doneAt === (complete(n) ? (complete(p) ? p.doneAt : m.time) : 0),
    "redraft clears a finished draft": (p, n, a, m) => a.t !== "redraft" || p === n || (complete(p) && n.picks.length === 0 && n.turnAt === m.time && p.order.includes(m.user)),
    "picks are only ever added": (p, n, a) => a.t === "redraft" || same(n.picks.slice(0, p.picks.length), p.picks),
    "the chores never change": (p, n) => same(p.chores, n.chores),
    "only people in the chat draft": (p, n, _a, m, ctx) => same(p, n) || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (complete(s)) return k < 0.5 ? { t: "redraft" } : { t: "auto" };
    const free = s.chores.map((_, i) => i).filter((i) => isFree(s, i));
    if (onClock(s) === user) return k < 0.8 && free.length ? { t: "pick", chore: r.pick(free) } : { t: "auto" };
    return k < 0.2 && free.length ? { t: "pick", chore: r.pick(free) } : { t: "auto" };
  },

  local: {},

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const c = theme.color;
    const s = state;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const clk = onClock(s);
    const myTurn = clk === me;
    const done = complete(s);
    const t = target(s);
    const n = s.order.length;
    const round = n ? Math.floor(s.picks.length / n) + 1 : 1;
    const subtitle = done ? `${s.sub} · draft's in` : round === 1 ? "Round 1 · grosser chores are worth more" : `Round ${round} · snake order back`;
    const even = spread(s) <= 1;
    const light = n ? lightest(s) : "";
    const ss = clk && s.turnAt > 0 ? 30 - Math.floor((clock.value - s.turnAt) / 1000) : 0;
    const expired = !!clk && !myTurn && s.turnAt > 0 && ss <= 0;
    const snake = clk && s.picks.length + 1 < s.chores.length && n > 0 && whoAt(s, s.picks.length) === whoAt(s, s.picks.length + 1);
    const pop = (p: Pick) => running(p.at, 400) !== null;
    const pickMap = new Map(s.picks.map((p) => [p.chore, p]));
    const rows = Math.min(4, Math.max(1, Math.ceil(s.chores.length / 2)));
    const draft = (i: number) => {
      if (s.picks.length + 1 === s.chores.length) haptic("success");
      dispatch({ t: "pick", chore: i });
    };

    const cell = (ch: Chore, i: number) => {
      const p = pickMap.get(i);
      const lastInCol = (i + 1) % rows === 0 || i === s.chores.length - 1;
      const canTap = !p && myTurn;
      const body = (
        <>
          <span style={{ width: 24, height: 24, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {p ? (
              <span key={`${i}:${p.by}`} ref={(el: HTMLElement | null) => { if (el && pop(p) && confirmed.picks.some((x) => x.chore === i && x.at === p.at)) el.animate([{ scale: "0.2" }, { scale: "1" }], { duration: 350, easing: "cubic-bezier(.34,1.56,.64,1)" }); }} style={{ display: "flex" }}>
                {p.by === me ? (
                  <span style={{ width: 22, height: 22, borderRadius: 11, background: c.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={c.onPrimary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 11.5l3 3L16 8" /></svg>
                  </span>
                ) : (
                  <Avatar user={p.by} size={22} />
                )}
              </span>
            ) : (
              <span style={{ width: 20, height: 20, borderRadius: 10, boxShadow: `inset 0 0 0 1.5px ${c.divider}` }} />
            )}
          </span>
          <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere", fontSize: 15, lineHeight: "20px", color: p ? c.secondaryText : c.text, overflow: "hidden" }}>{ch.name}</span>
            <span style={{ display: "block", fontSize: 12, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b style={{ fontWeight: 600 }}>{ch.pts === 1 ? "1 pt" : `${ch.pts} pts`}</b>{ch.note ? ` · ${ch.note}` : ""}</span>
          </span>
        </>
      );
      const style = { display: "flex", alignItems: "center", gap: 10, height: 48, boxSizing: "border-box", paddingTop: 4, borderBottom: lastInCol ? "none" : `1px solid ${c.divider}`, minWidth: 0 } as const;
      return canTap ? (
        <button key={i} aria-label={`Draft ${ch.name}, ${ch.pts} pts`} onClick={() => draft(i)} style={{ ...style, border: "none", borderBottom: style.borderBottom, background: "none", padding: "4px 0 0", font: "inherit", color: "inherit", cursor: "pointer", width: "100%" }}>
          {body}
        </button>
      ) : (
        <div key={i} style={style}>{body}</div>
      );
    };

    const shown = n > 6 ? s.order.slice(0, 5) : s.order;
    const col = (u: string) => {
      const tot = total(s, u);
      const ok = Math.abs(tot - t) <= 1;
      return (
        <div key={u} aria-label={`${nameOf(u)}: ${tot} points`} role="group" style={{ flex: 1, minWidth: 0, height: 84, borderRadius: 8, paddingTop: 6, textAlign: "center", boxSizing: "border-box", background: u === me ? c.selected : "none" }}>
          <div style={{ display: "flex", justifyContent: "center", height: 26 }}>
            <span style={{ display: "flex", borderRadius: 13, boxShadow: clk === u ? `0 0 0 2px ${c.card}, 0 0 0 4px ${c.primary}` : "none" }}>
              <Avatar user={u} size={26} />
            </span>
          </div>
          <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600 }}>{`${tot} pts`}</div>
          <div style={{ fontSize: 13, lineHeight: "16px", color: u === me ? c.link : c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" }}>{u === me ? "You" : nameOf(u)}</div>
          <div style={{ height: 4, margin: "6px 12px 0", borderRadius: 2, background: c.track, overflow: "hidden" }}>
            <div style={{ height: 4, borderRadius: 2, width: `${Math.min(1, tot / (t + 1)) * 100}%`, background: ok ? c.positive : c.primary, transition: "width .4s" }} />
          </div>
        </div>
      );
    };

    const verdict = !n ? null : done ? (even ? { text: "Dead even", color: mix(c.positive, c.text, 0.3) } : { text: light === me ? "You got off light" : `${nameOf(light)} got off light`, color: mix(c.negative, c.text, 0.2) }) : null;

    return (
      <div>
        <div style={{ marginBottom: -4 }}><CardHeader title={s.title} subtitle={subtitle} /></div>
        <div style={{ height: 36, display: "flex", alignItems: "center", gap: 8 }}>
          {done ? (
            <>
              <div style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{even ? "It's even. Starts Monday." : "Uneven. Trade a chore by Sunday?"}</div>
              {s.order.includes(me) ? <Button kind="secondary" onClick={() => dispatch({ t: "redraft" })}>Redraft</Button> : null}
            </>
          ) : (
            <>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {!clk ? "Waiting for roommates" : myTurn ? (
                  <><b>You're up</b>{` · tap a chore to draft it${ss > 0 ? ` · 0:${String(ss).padStart(2, "0")}` : ""}`}</>
                ) : (
                  <><b>{nameOf(clk)}</b>{` is picking${snake ? " · snake turn, picks twice" : ""}`}</>
                )}
              </div>
              {myTurn || expired ? <Button kind="deemphasized" onClick={() => dispatch({ t: "auto" })}>Auto-pick</Button> : null}
            </>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px", gridAutoFlow: "column", gridTemplateRows: `repeat(${rows}, 48px)` }}>
          {s.chores.map(cell)}
        </div>
        <div style={{ height: 12 }} />
        <div style={{ height: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600 }}>Load</span>
          {n ? (
            <span style={{ fontSize: 13, lineHeight: "16px", color: verdict ? verdict.color : c.secondaryText, whiteSpace: "nowrap" }}>
              {verdict ? verdict.text : `Fair is ${t - 1}–${t + 1} pts each`}
            </span>
          ) : null}
        </div>
        <div style={{ height: 8 }} />
        <div style={{ display: "flex", height: 84 }}>
          {shown.map(col)}
          {n > 6 ? (
            <div style={{ flex: 1, minWidth: 0, paddingTop: 6, display: "flex", justifyContent: "center" }}>
              <More n={n - 5} />
            </div>
          ) : null}
        </div>
        {done && even && running(confirmed.doneAt, 2400) !== null ? <Toast key={s.doneAt}>Chores are set for the month.</Toast> : null}
      </div>
    );
  },
});
