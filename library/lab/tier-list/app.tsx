import { defineApp, Avatar, Button, CardHeader, Facepile, Progress, Toast, haptic, mix, running, spring, springs, type Ctx } from "@muse/app";

// Tier list: everyone ranks the same things S to D in private. Locking yours unlocks the group's
// average, where you disagree, and the most controversial pick. Each person plays to an end
// state (locked); the game is over when everyone has locked.

type Params = { title: string; noun: string; items: string[]; ranked: { name: string; tiers: string }[] };

// @params
const P: Params = {
  title: "Dining hall tier list",
  noun: "hall",
  items: ["Commons", "The Pit", "Bates", "Hillside", "Late Night", "Halal Cart"],
  ranked: [
    { name: "Noa", tiers: "ASCBAS" },
    { name: "Dev", tiers: "ASDACS" },
    { name: "Jonah", tiers: "BACBDS" },
    { name: "Priya", tiers: "ASCBSA" },
  ],
};
// @end params

/** tier 0 = S .. 4 = D; order: meta.seq of the placement (0 when unplaced); locked: meta.time (0 when not). */
type List = { user: string; tiers: (number | null)[]; order: number[]; locked: number };
type State = { title: string; noun: string; items: string[]; lists: List[] };
type Action = { t: "place"; item: number; tier: number | null } | { t: "lock" } | { t: "add"; label: string };
type Local = { sel: number | null; view: "mine" | "group"; draft: string };

const MAX_ITEMS = 8;
const LETTERS = "SABCD";
const VIBES = ["Would fight for it", "Solid, no notes", "It's fine. It's food.", "Only at 1am", "Emergency only"];
const POP = spring(springs.iosBouncy);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const mine = (s: State, u: string): List => s.lists.find((l) => l.user === u) ?? { user: u, tiers: s.items.map(() => null), order: s.items.map(() => 0), locked: 0 };
const full = (l: List) => l.tiers.every((t) => t !== null);
const sameLabel = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const lockedLists = (s: State, except?: string) => s.lists.filter((l) => l.locked > 0 && l.user !== except);
const consensus = (s: State, me: string, k: number): number | null => {
  const o = lockedLists(s, me);
  return o.length ? Math.round(o.reduce((a, l) => a + (l.tiers[k] ?? 0), 0) / o.length) : null;
};
/** The item the group splits on most: the first with the biggest gap between best and worst, if it is 2 tiers or more. */
function fight(s: State, me: string): { k: number; hi: string; lo: string } | null {
  const o = lockedLists(s, me);
  if (o.length < 2) return null;
  let best = -1;
  let bestK = -1;
  s.items.forEach((_, k) => {
    const v = o.map((l) => l.tiers[k] ?? 0);
    const sp = Math.max(...v) - Math.min(...v);
    if (sp > best) {
      best = sp;
      bestK = k;
    }
  });
  if (best < 2) return null;
  const v = o.map((l) => l.tiers[bestK] ?? 0);
  return { k: bestK, hi: o[v.indexOf(Math.min(...v))]!.user, lo: o[v.indexOf(Math.max(...v))]!.user };
}
const tierOf = (s: State, u: string, k: number) => s.lists.find((l) => l.user === u)?.tiers[k] ?? null;
const clean = (t: string, max: number) => t.trim().slice(0, max);

export default defineApp<State, Action, Local>({
  name: "Tier list",
  summary: (s, ctx) => {
    if (s.items.length === 0) return `${s.title} · nothing to rank yet`;
    const done = lockedLists(s);
    if (ctx.members.length > 0 && ctx.members.every((m) => done.some((l) => l.user === m.id))) {
      const f = fight(s, "");
      return `${s.title} · everyone ranked${f ? ` · most controversial: ${s.items[f.k]}` : ""}`;
    }
    return `${s.title} · ${done.length} of ${ctx.members.length} locked in`;
  },

  init: (ctx) => {
    const items: string[] = [];
    for (const raw of P.items) {
      const label = clean(raw, 40);
      if (label && items.length < MAX_ITEMS && !items.some((x) => sameLabel(x, label))) items.push(label);
    }
    const used = new Set<string>();
    const lists: List[] = [];
    for (const r of P.ranked) {
      const want = r.name.trim().toLowerCase();
      const who = ctx.members.find((m) => !used.has(m.id) && (m.id === r.name || m.name.toLowerCase() === want));
      if (!who || r.tiers.length !== items.length || !/^[SABCD]*$/.test(r.tiers)) continue;
      used.add(who.id);
      lists.push({ user: who.id, tiers: [...r.tiers].map((ch) => LETTERS.indexOf(ch)), order: items.map((_, k) => k + 1), locked: 1 });
    }
    return { title: clean(P.title, 40) || "Tier list", noun: clean(P.noun, 16) || "one", items, lists };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "place") {
      const { item, tier } = a;
      if (!Number.isInteger(item) || item < 0 || item >= s.items.length) return s;
      if (tier !== null && !(Number.isInteger(tier) && tier >= 0 && tier <= 4)) return s;
      const cur = mine(s, m.user);
      if (cur.locked > 0 || cur.tiers[item] === tier) return s;
      const next: List = {
        ...cur,
        tiers: cur.tiers.map((t, k) => (k === item ? tier : t)),
        order: cur.order.map((o, k) => (k === item ? (tier === null ? 0 : Math.max(1, m.seq)) : o)),
      };
      const rest = s.lists.filter((l) => l.user !== m.user);
      const exists = s.lists.some((l) => l.user === m.user);
      if (next.tiers.every((t) => t === null)) return { ...s, lists: rest };
      return { ...s, lists: exists ? s.lists.map((l) => (l.user === m.user ? next : l)) : [...s.lists, next] };
    }
    if (a.t === "lock") {
      const cur = s.lists.find((l) => l.user === m.user);
      if (!cur || cur.locked > 0 || !full(cur)) return s;
      return { ...s, lists: s.lists.map((l) => (l.user === m.user ? { ...l, locked: m.time } : l)) };
    }
    if (a.t === "add") {
      if (typeof a.label !== "string" || s.lists.some((l) => l.locked > 0) || s.items.length >= MAX_ITEMS) return s;
      const label = clean(a.label, 100);
      if (label.length < 1 || label.length > 24 || s.items.some((x) => sameLabel(x, label))) return s;
      return { ...s, items: [...s.items, label], lists: s.lists.map((l) => ({ ...l, tiers: [...l.tiers, null], order: [...l.order, 0] })) };
    }
    return s;
  },

  onMembers: (s, ctx) => (s.lists.every((l) => inChat(ctx, l.user)) ? s : { ...s, lists: s.lists.filter((l) => inChat(ctx, l.user)) }),

  invariants: {
    "one list per person, each in the chat": (s, ctx) => new Set(s.lists.map((l) => l.user)).size === s.lists.length && s.lists.every((l) => inChat(ctx, l.user)),
    "lists match the items": (s) => s.lists.every((l) => l.tiers.length === s.items.length && l.order.length === s.items.length),
    "tiers are S to D or unplaced": (s) => s.lists.every((l) => l.tiers.every((t) => t === null || (Number.isInteger(t) && t >= 0 && t <= 4))),
    "placed exactly when it has an order": (s) => s.lists.every((l) => l.tiers.every((t, k) => (t === null) === (l.order[k] === 0))),
    "a locked list is complete": (s) => s.lists.every((l) => l.locked === 0 || full(l)),
    "no empty lists": (s) => s.lists.every((l) => l.tiers.some((t) => t !== null)),
    "items are unique and at most 8": (s) => s.items.length <= MAX_ITEMS && new Set(s.items.map((x) => x.toLowerCase())).size === s.items.length,
  },

  transitions: {
    "a locked list never changes": (p, n) =>
      p.lists.every((l) => {
        if (l.locked === 0) return true;
        const x = n.lists.find((y) => y.user === l.user);
        return !x || (x.locked === l.locked && JSON.stringify(x.tiers.slice(0, l.tiers.length)) === JSON.stringify(l.tiers));
      }),
    "place moves only the actor's one item to that tier": (p, n, a, m) => {
      if (a.t !== "place" || p === n) return true;
      const others = (x: State) => JSON.stringify(x.lists.filter((l) => l.user !== m.user));
      const keep = (x: State) => JSON.stringify(mine(x, m.user).tiers.map((t, k) => (k === a.item ? "x" : t)));
      return others(p) === others(n) && keep(p) === keep(n) && tierOf(n, m.user, a.item) === a.tier;
    },
    "lock needs a full list and stamps the time": (p, n, a, m) => a.t !== "lock" || p === n || (full(mine(p, m.user)) && mine(n, m.user).locked === m.time),
    "items are only added before anyone locks": (p, n) => n.items.length === p.items.length || !p.lists.some((l) => l.locked > 0),
    "items never change or reorder": (p, n) => p.items.every((x, k) => n.items[k] === x),
    "only people in the chat change lists": (p, n, _a, m, ctx) => p === n || JSON.stringify(p) === JSON.stringify(n) || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.items.length === 0) return { t: "add", label: r.pick(["Commons", "Bates", "Hillside", "The Pit"]) + (r.int(3) || "") };
    const l = mine(s, user);
    if (full(l) && l.locked === 0 && r.next() < 0.7) return { t: "lock" };
    const k = r.next();
    if (k < 0.8) return { t: "place", item: r.int(s.items.length), tier: r.next() < 0.1 ? null : r.int(5) };
    if (k < 0.9) return { t: "lock" };
    return { t: "add", label: "Spot " + r.int(9) };
  },

  local: { sel: null, view: "mine", draft: "" },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const narrow = theme.width < 360;
    const my = mine(state, me);
    const locked = my.locked > 0;
    const n = state.items.length;
    const placed = my.tiers.filter((t) => t !== null).length;
    const allPlaced = n > 0 && placed === n;
    const sel = local.sel !== null && local.sel < n ? local.sel : null;
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";
    const dark = theme.mode === "dark";
    const itemColor = [c.series5, c.series4, c.secondaryText, c.series3, c.series6, c.series2];
    const tierColor = [c.primary, c.series2, c.series3, c.series4, mix(c.secondaryText, c.card, 0.3)];
    const letterColor = (t: number) => (t === 0 ? c.onPrimary : dark ? c.wash : c.text);

    const others = lockedLists(state, me);
    const names = (() => {
      const xs = others.map((l) => nameOf(l.user));
      if (xs.length === 0) return "";
      if (xs.length === 1) return xs[0]!;
      if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
      if (xs.length === 3) return `${xs[0]}, ${xs[1]} and ${xs[2]}`;
      return `${xs[0]}, ${xs[1]} and ${xs.length - 2} others`;
    })();
    const subtitle = n === 0 ? "Add what to rank" : locked ? (local.view === "group" ? `Average of ${names || "the group"}` : "Yours · badges show the group's pick") : others.length ? `${names} ranked · yours unlocks theirs` : "Rank them, then see the group's";

    const cons = state.items.map((_, k) => consensus(state, me, k));
    const hot = fight(state, me);
    const group = locked && local.view === "group";
    const tierOfItem = (k: number) => (group ? cons[k] : my.tiers[k]) ?? null;
    const agree = state.items.filter((_, k) => my.tiers[k] === cons[k]).length;
    const badgeOrder = state.items.map((_, k) => k).filter((k) => cons[k] !== null && cons[k] !== my.tiers[k]);

    const chipCss = "position:relative";
    const pop = (i: number) => {
      const e = running(my.locked + 300 + i * 80, 600);
      return e === null ? 1 : e < 0 ? 0 : POP(e);
    };

    const chip = (k: number, where: "tray" | "row", t: number) => {
      const active = sel === k;
      const hidden = where === "tray" && my.tiers[k] !== null;
      const interactive = !locked && !hidden;
      const color = itemColor[k % 6]!;
      const badge = locked && !group && cons[k] !== null && cons[k] !== my.tiers[k];
      const bolt = locked && group && hot?.k === k;
      const inner = (
        <>
          <span style={{ position: "absolute", left: narrow ? 6 : 9, top: 8, width: 12, height: 12, borderRadius: 6, background: active ? c.card : color, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {active ? <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} /> : null}
          </span>
          <span style={{ display: "block", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.items[k]}</span>
          {badge ? (
            <span role="img" aria-label={`Group says ${LETTERS[cons[k]!]}`} style={{ position: "absolute", right: -6, top: -6, width: 18, height: 18, borderRadius: 9, boxSizing: "border-box", border: `1.5px solid ${c.card}`, background: tierColor[cons[k]!], color: letterColor(cons[k]!), fontSize: 11, fontWeight: 600, lineHeight: "15px", textAlign: "center", transform: `scale(${pop(badgeOrder.indexOf(k))})` }}>
              {LETTERS[cons[k]!]}
            </span>
          ) : null}
          {bolt ? (
            <span role="img" aria-label="Most controversial" style={{ position: "absolute", right: -4, top: -5, width: 14, height: 14, borderRadius: 7, background: c.card, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width={7} height={9} viewBox="0 0 7 9" aria-hidden="true">
                <path d="M4.2 0L0 5.2h2.8L2.2 9 7 3.6H4.1z" fill={c.warning} />
              </svg>
            </span>
          ) : null}
        </>
      );
      const base = {
        position: "relative",
        flex: "none",
        height: 28,
        boxSizing: "border-box",
        padding: narrow ? "0 9px 0 24px" : "0 12px 0 28px",
        borderRadius: 14,
        border: 0,
        background: active ? c.primary : c.card,
        color: active ? c.onPrimary : c.text,
        font: "inherit",
        fontSize: 12,
        lineHeight: "28px",
        pointerEvents: "auto",
        visibility: hidden ? "hidden" : "visible",
        transform: active ? "translateY(-3px)" : undefined,
        boxShadow: active ? `0 5px 0 ${mix(c.text, c.card, 0.9)}` : undefined,
        transition: `transform ${theme.motion.fast}ms, box-shadow ${theme.motion.fast}ms`,
      } as const;
      const label = my.tiers[k] === null ? `${state.items[k]}, not ranked` : `${state.items[k]}, in tier ${LETTERS[t]}`;
      return interactive ? (
        <button key={`${where}${k}`} class="tl-chip" aria-label={label} aria-pressed={active} style={base} onClick={() => setLocal({ sel: active ? null : k })}>
          {inner}
        </button>
      ) : (
        <span key={`${where}${k}`} aria-hidden={hidden ? "true" : undefined} aria-label={hidden ? undefined : label} role={hidden ? undefined : "img"} style={base}>
          {inner}
        </span>
      );
    };

    const put = (t: number) => {
      if (sel === null) return;
      dispatch({ t: "place", item: sel, tier: t });
      setLocal({ sel: null });
    };
    const rowMin = narrow ? 36 : 38;
    const rows = [0, 1, 2, 3, 4].map((t) => {
      const ks = state.items.map((_, k) => k).filter((k) => tierOfItem(k) === t);
      if (!group) ks.sort((a, b) => my.order[a]! - my.order[b]! || a - b);
      const box = narrow ? 26 : 30;
      return (
        <div key={t} style={{ position: "relative", minHeight: rowMin, boxSizing: "border-box", borderRadius: 12, background: c.wash, display: "flex", alignItems: "center", padding: `${(rowMin - 28) / 2}px 6px ${(rowMin - 28) / 2}px 52px`, marginTop: t ? 3 : 0 }}>
          {!locked ? (
            <>
              <button class="m-hit" aria-label={`Tier ${LETTERS[t]}`} disabled={sel === null} onClick={() => put(t)} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 52, border: 0, background: "transparent", borderRadius: "12px 0 0 12px", padding: 0, margin: 0 }} />
              <div aria-hidden="true" onClick={() => put(t)} style={{ position: "absolute", left: 52, right: 0, top: 0, bottom: 0 }} />
            </>
          ) : null}
          <span aria-hidden="true" style={{ position: "absolute", left: 6, top: (rowMin - box) / 2, width: box, height: box, borderRadius: 8, background: tierColor[t], color: letterColor(t), fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>{LETTERS[t]}</span>
          {ks.length ? (
            <div style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: 6, pointerEvents: "none", animation: locked ? `tlFade ${theme.motion.fast}ms` : undefined }}>{ks.map((k) => chip(k, "row", t))}</div>
          ) : (
            <span style={{ position: "relative", marginLeft: 6, fontSize: narrow ? 12 : 13, color: c.secondaryText, pointerEvents: "none" }}>{VIBES[t]}</span>
          )}
        </div>
      );
    });

    const selPlaced = sel !== null && my.tiers[sel] !== null;
    const tray =
      n === 0 ? (
        <form
          style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", minHeight: 74 }}
          onSubmit={(e) => {
            e.preventDefault();
            dispatch({ t: "add", label: local.draft });
            setLocal({ draft: "" });
          }}
        >
          <input value={local.draft} placeholder={`Add a ${state.noun}`} aria-label={`Add a ${state.noun}`} maxLength={40} onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
          <Button
            kind="primary"
            onClick={() => {
              dispatch({ t: "add", label: local.draft });
              setLocal({ draft: "" });
            }}
          >
            Add
          </Button>
        </form>
      ) : (
        <div style={{ position: "relative", minHeight: 74, boxSizing: "border-box", padding: 6, borderRadius: 12, background: c.wash }}>
          {selPlaced ? (
            <button class="m-hit" aria-label="Move it back to the tray" onClick={() => (dispatch({ t: "place", item: sel!, tier: null }), setLocal({ sel: null }))} style={{ position: "absolute", inset: 0, width: "100%", border: 0, background: "transparent", borderRadius: 12, padding: 0, margin: 0 }} />
          ) : null}
          {allPlaced ? (
            <div style={{ position: "relative", minHeight: 62, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: c.secondaryText, pointerEvents: "none" }}>{`All placed · tap a ${state.noun} to move it`}</div>
          ) : (
            <div style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: 6, pointerEvents: "none" }}>{state.items.map((_, k) => chip(k, "tray", my.tiers[k] ?? 0))}</div>
          )}
        </div>
      );

    const justLocked = locked && running(my.locked, 3000) !== null;

    return (
      <div>
        <style>{".tl-chip::after{content:'';position:absolute;left:-2px;right:-2px;top:-8px;bottom:-8px}@keyframes tlFade{from{opacity:0}to{opacity:1}}"}</style>
        <div style={{ position: "relative" }}>
          <CardHeader title={state.title} subtitle={subtitle} />
          {locked ? (
            <div style={{ display: "flex", gap: 4, margin: "2px 0 8px" }}>
              {(["mine", "group"] as const).map((v) => (
                <button
                  key={v}
                  class="tl-chip"
                  aria-pressed={local.view === v}
                  onClick={() => setLocal({ view: v })}
                  style={{ position: "relative", height: 28, padding: "0 12px", borderRadius: 14, border: 0, fontSize: 13, fontWeight: 600, font: "inherit", background: local.view === v ? c.selected : c.secondaryButton, color: local.view === v ? c.text : c.secondaryButtonText }}
                >
                  {v === "mine" ? "Mine" : "Group"}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {locked ? null : tray}
        <div style={{ marginTop: locked ? 0 : 4 }}>{rows}</div>

        {locked ? (
          <div style={{ marginTop: 8 }}>
            {others.length >= 2 ? <div style={{ fontSize: 15, fontWeight: 600, textAlign: "center", marginBottom: 6 }}>{`You agree with the group on ${agree} of ${n}`}</div> : null}
            {others.length >= 2 ? <Progress value={agree} max={n} /> : null}
            <div style={{ marginTop: 8, height: 44, boxSizing: "border-box", borderRadius: 12, background: c.wash, display: "flex", alignItems: "center", gap: 8, padding: "0 10px 0 18px" }}>
              <svg width={11} height={14} viewBox="0 0 7 9" aria-hidden="true" style={{ flex: "none" }}>
                <path d="M4.2 0L0 5.2h2.8L2.2 9 7 3.6H4.1z" fill={c.warning} />
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: "17px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {others.length < 2 ? "You're first" : hot ? `Most controversial: ${state.items[hot.k]}` : "No fights yet"}
                </div>
                <div style={{ fontSize: 12, lineHeight: "15px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {others.length < 2 ? "Theirs show up as they lock in" : hot ? `${nameOf(hot.hi)} says ${LETTERS[tierOf(state, hot.hi, hot.k) ?? 0]} · ${nameOf(hot.lo)} says ${LETTERS[tierOf(state, hot.lo, hot.k) ?? 0]} · chat in shambles` : "Everyone is within a tier of each other"}
                </div>
              </div>
              {hot && others.length >= 2 ? <Facepile users={[hot.hi, hot.lo]} size={20} /> : null}
            </div>
          </div>
        ) : n > 0 ? (
          <div style={{ marginTop: 4, minHeight: 52, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            {allPlaced ? (
              <>
                <div style={{ width: "100%" }}>
                  <Button
                    kind="primary"
                    wide
                    onClick={() => {
                      haptic("success");
                      dispatch({ t: "lock" });
                    }}
                  >
                    Lock in
                  </Button>
                </div>
                <div style={{ fontSize: 13, color: c.secondaryText }}>No take-backs. This goes in the chat.</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{sel === null ? `Tap a ${state.noun}, then a tier` : "Now tap a tier"}</div>
                <div style={{ fontSize: 13, color: c.secondaryText }}>{`${placed} of ${n} ranked`}</div>
              </>
            )}
          </div>
        ) : null}
        {justLocked ? <Toast key={my.locked}>Locked in · shared with the group</Toast> : null}
        {void chipCss}
      </div>
    );
  },
});
