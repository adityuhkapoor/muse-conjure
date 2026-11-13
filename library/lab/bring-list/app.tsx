import { defineApp, Avatar, Burst, Button, CardHeader, Changed, Facepile, Toast, haptic, mix, pal, running, type Child, type Theme } from "@muse/app";

// Bring list: a potluck list. Each dish has a small drawn glyph and who is bringing it; doubles are
// flagged in red with a Fix, gaps carry a Bring button, and the bar fills until the table is covered.

type Kind = "turkey" | "mac" | "chips" | "drinks" | "pie" | "salad" | "ice" | "cups" | "other";
type Params = {
  /** The event: "Friendsgiving potluck" */
  title: string;
  /** when · where · how many */
  sub: string;
  /** 1 to 8 things to bring; by: names as in the chat; suggested: Muse's idea, nobody in the chat said it */
  items: { label: string; kind: Kind; by: string[]; suggested?: boolean }[];
};

// @params
const P: Params = {
  title: "Friendsgiving potluck",
  sub: "Sat 6 PM · Maya's · 11 coming",
  items: [
    { label: "Turkey", kind: "turkey", by: ["Maya"] },
    { label: "Mac & cheese", kind: "mac", by: ["Noa"] },
    { label: "Chips", kind: "chips", by: ["Jonah", "Dev"] },
    { label: "Drinks", kind: "drinks", by: ["Theo"] },
    { label: "Pumpkin pie", kind: "pie", by: ["Priya"] },
    { label: "Salad", kind: "salad", by: [] },
    { label: "Ice", kind: "ice", by: [] },
    { label: "Cups & plates", kind: "cups", by: [] },
  ],
};
// @end params

/** at: meta.time of the last claim change, 0 at init */
type Item = { id: string; label: string; kind: Kind; by: string[]; at: number; suggested: boolean };
/** coveredAt > 0 exactly while covered */
type State = { title: string; sub: string; items: Item[]; coveredAt: number };
type Action = { t: "bring"; item: string } | { t: "fix"; item: string } | { t: "add"; label: string };
type Local = { draft: string };
type Ctx = { members: { id: string; name?: string }[] };

const MAX_ITEMS = 8;
const MAX_LABEL = 28;
const KINDS: Kind[] = ["turkey", "mac", "chips", "drinks", "pie", "salad", "ice", "cups", "other"];

function kindOf(label: string): Kind {
  const l = label.toLowerCase();
  if (/turkey|chicken|ham|roast/.test(l)) return "turkey";
  if (/mac|cheese|pasta|casserole/.test(l)) return "mac";
  if (/chip|snack|crisps|pretzel/.test(l)) return "chips";
  if (/drink|soda|juice|beer|wine|seltzer/.test(l)) return "drinks";
  if (/pie|cake|dessert|cookie|brownie/.test(l)) return "pie";
  if (/salad|veg|greens/.test(l)) return "salad";
  if (/ice\b|^ice/.test(l)) return "ice";
  if (/cup|plate|napkin|fork|utensil/.test(l)) return "cups";
  return "other";
}

const covered = (s: State) => s.items.length > 0 && s.items.every((i) => i.by.length === 1);
const firstGap = (s: State) => s.items.find((i) => i.by.length === 0);
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const stamp = (prev: State, next: State, time: number): State => ({ ...next, coveredAt: covered(next) ? (covered(prev) ? prev.coveredAt : time) : 0 });

function step(s: State, a: Record<string, unknown>, user: string, meta: { seq: number; time: number }): State {
  if (a.t === "bring") {
    const item = typeof a.item === "string" ? s.items.find((i) => i.id === a.item) : undefined;
    if (!item || item.by.includes(user)) return s;
    const items = s.items.map((i) => {
      if (i.id === item.id) return { ...i, by: [...i.by.filter((u) => u !== user), user], at: meta.time };
      return i.by.includes(user) ? { ...i, by: i.by.filter((u) => u !== user), at: meta.time } : i;
    });
    return stamp(s, { ...s, items }, meta.time);
  }
  if (a.t === "fix") {
    const item = typeof a.item === "string" ? s.items.find((i) => i.id === a.item) : undefined;
    const gap = firstGap(s);
    if (!item || item.by.length < 2 || !gap) return s;
    const moved = item.by[item.by.length - 1]!;
    const items = s.items.map((i) => (i.id === item.id ? { ...i, by: i.by.slice(0, -1), at: meta.time } : i.id === gap.id ? { ...i, by: [moved], at: meta.time } : i));
    return stamp(s, { ...s, items }, meta.time);
  }
  if (a.t === "add") {
    if (typeof a.label !== "string") return s;
    const label = a.label.trim();
    if (!label || label.length > MAX_LABEL || s.items.length >= MAX_ITEMS || s.items.some((i) => i.label.toLowerCase() === label.toLowerCase())) return s;
    return stamp(s, { ...s, items: [...s.items, { id: `i${meta.seq}`, label, kind: kindOf(label), by: [], at: meta.time, suggested: false }] }, meta.time);
  }
  return s;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const without = (s: State, u: string) => JSON.stringify(s.items.map((i) => [i.id, i.by.filter((x) => x !== u)]));
const othersSame = (p: State, n: State, ids: string[]) => same(p.items.filter((i) => !ids.includes(i.id)), n.items.filter((i) => !ids.includes(i.id)));

export default defineApp<State, Action, Local>({
  name: "Bring list",
  summary: (s) => {
    const n = s.items.length;
    if (!n) return `${s.title}: nothing on the list yet`;
    if (covered(s)) return `${s.title}: all ${n} covered`;
    const done = s.items.filter((i) => i.by.length === 1).length;
    const gaps = s.items.filter((i) => i.by.length === 0).length;
    const doubles = s.items.filter((i) => i.by.length >= 2).length;
    return `${s.title}: ${done} of ${n} covered · ${gaps} gaps${doubles ? ` · ${doubles} doubled` : ""}`;
  },

  init: (ctx) => {
    const used = new Set<string>();
    const items: Item[] = [];
    P.items.slice(0, MAX_ITEMS).forEach((it, idx) => {
      const label = String(it.label ?? "").trim().slice(0, MAX_LABEL);
      if (!label) return;
      const by: string[] = [];
      for (const name of it.by ?? []) {
        const want = String(name).trim().toLowerCase();
        const m = ctx.members.find((x) => x.id === name || (x.name ?? "").toLowerCase() === want);
        if (m && !used.has(m.id)) {
          used.add(m.id);
          by.push(m.id);
        }
      }
      items.push({ id: `p${idx}`, label, kind: KINDS.includes(it.kind) ? it.kind : kindOf(label), by, at: 0, suggested: it.suggested === true });
    });
    const s: State = { title: P.title.trim().slice(0, 60) || "Bring list", sub: P.sub.trim().slice(0, 60), items, coveredAt: 0 };
    return { ...s, coveredAt: covered(s) ? 1 : 0 };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? step(state, action as unknown as Record<string, unknown>, meta.user, meta) : state),

  onMembers: (state, ctx) => {
    if (state.items.every((i) => i.by.every((u) => inChat(ctx, u)))) return state;
    const s = { ...state, items: state.items.map((i) => ({ ...i, by: i.by.filter((u) => inChat(ctx, u)) })) };
    return { ...s, coveredAt: covered(s) ? state.coveredAt || 1 : 0 };
  },

  invariants: {
    "each person brings one thing at most": (s) => {
      const all = s.items.flatMap((i) => i.by);
      return new Set(all).size === all.length;
    },
    "everyone bringing is in the chat": (s, ctx) => s.items.every((i) => i.by.every((u) => inChat(ctx, u))),
    "the list has at most 8 items with unique ids and labels": (s) =>
      s.items.length <= MAX_ITEMS &&
      new Set(s.items.map((i) => i.id)).size === s.items.length &&
      s.items.every((i) => i.label.trim().length > 0) &&
      new Set(s.items.map((i) => i.label.toLowerCase())).size === s.items.length,
    "covered is stamped exactly when every item has one person": (s) => s.coveredAt > 0 === covered(s),
  },

  transitions: {
    "bringing puts the actor on that item and moves no one else": (p, n, a, m) =>
      a.t !== "bring" || p === n || (n.items.find((i) => i.id === a.item)!.by.at(-1) === m.user && n.items.filter((i) => i.by.includes(m.user)).length === 1 && without(p, m.user) === without(n, m.user)),
    "fix moves the last of the doubled people to the first gap": (p, n, a) => {
      if (a.t !== "fix" || p === n) return true;
      const from = p.items.find((i) => i.id === a.item);
      const gap = firstGap(p);
      return !!from && !!gap && from.by.length >= 2 && same(n.items.find((i) => i.id === from.id)!.by, from.by.slice(0, -1)) && same(n.items.find((i) => i.id === gap.id)!.by, [from.by.at(-1)]) && othersSame(p, n, [from.id, gap.id]);
    },
    "adding appends one empty item": (p, n, a, m) =>
      a.t !== "add" || p === n || (n.items.length === p.items.length + 1 && n.items.at(-1)!.id === `i${m.seq}` && n.items.at(-1)!.by.length === 0 && n.items.at(-1)!.label === a.label.trim()),
    "covered is stamped the moment the table is covered": (p, n, _a, m) => n.coveredAt === (covered(n) ? (covered(p) ? p.coveredAt : m.time) : 0),
    "items are never removed or renamed": (p, n) => p.items.every((i, k) => n.items[k]?.id === i.id && n.items[k]?.label === i.label && n.items[k]?.kind === i.kind),
    "only people in the chat change the list": (p, n, _a, m, ctx) => same(p, n) || inChat(ctx, m.user),
  },

  arbitrary: (s, _u, r) => {
    const k = r.next();
    const doubles = s.items.filter((i) => i.by.length >= 2);
    if (k < 0.1 && s.items.length < MAX_ITEMS) return { t: "add", label: r.pick(["Napkins", "Rolls", "Cranberry sauce", "Ice"]) };
    if (k < 0.35 && doubles.length) return { t: "fix", item: r.pick(doubles).id };
    if (!s.items.length) return { t: "add", label: "Snacks" };
    return { t: "bring", item: r.pick(s.items).id };
  },

  local: { draft: "" },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const n = state.items.length;
    const isCovered = covered(state);
    const done = state.items.filter((i) => i.by.length === 1).length;
    const gaps = state.items.filter((i) => i.by.length === 0).length;
    const doubles = state.items.filter((i) => i.by.length >= 2).length;
    const iBring = state.items.some((i) => i.by.includes(me));
    const warn = mix(c.negative, c.text, 0.2);

    const status = !n ? "Nothing on the list yet" : isCovered ? `All ${n} covered · no doubles` : `${done} of ${n} covered${doubles ? ` · ${doubles} double${doubles > 1 ? "s" : ""}` : ""} · ${gaps} gap${gaps === 1 ? "" : "s"}`;
    const hint = !n ? "Add the first thing" : isCovered ? "Table's covered" : !iBring && gaps ? "Tap Bring on a gap" : doubles ? "Fix the double" : "Waiting on the last gap";

    const celebrating = confirmed.coveredAt > 1 && running(confirmed.coveredAt, 2400) !== null;
    const mineDid = celebrating && confirmed.items.some((i) => i.at === confirmed.coveredAt && i.by.includes(me));

    const sub = (i: Item) => {
      if (!i.by.length) return { text: "Nobody yet", color: c.secondaryText };
      if (i.by.length === 1) return { text: nameOf(i.by[0]!), color: c.secondaryText };
      const l = i.label.toLowerCase();
      return { text: i.by.length === 2 ? `${nameOf(i.by[0]!)} and ${nameOf(i.by[1]!)} both said ${l}` : `${i.by.length} people said ${l}`, color: warn };
    };

    const submit = () => {
      if (!local.draft.trim()) return;
      dispatch({ t: "add", label: local.draft });
      setLocal({ draft: "" });
    };

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub} />
        <div role="list">
          {state.items.map((i) => {
            const mine = i.by.includes(me);
            const s = sub(i);
            const gap = i.by.length === 0;
            const dbl = i.by.length >= 2;
            return (
              <Changed key={i.id} at={i.at} radius={8}>
                <div role="listitem" style={{ display: "flex", alignItems: "center", gap: 10, height: 39, padding: "0 4px", borderRadius: 8, background: mine ? c.selected : undefined }}>
                  <span style={{ width: 34, height: 34, borderRadius: 17, background: c.input, flex: "none", display: "inline-flex" }}>
                    <Glyph kind={i.kind} theme={theme} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.label}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 13, lineHeight: "16px" }}>
                      <span style={{ flex: "0 1 auto", minWidth: 0, color: s.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.text}</span>
                      {i.suggested ? <small style={{ flex: "none", fontSize: 12, lineHeight: "16px", color: c.secondaryText }}>Suggested</small> : null}
                    </div>
                  </div>
                  <div style={{ flex: "none", display: "flex", alignItems: "center" }}>
                    {gap && !isCovered ? (
                      <Button kind="deemphasized" aria-label={`Bring ${i.label}`} onClick={() => {
                        const next = step(state, { t: "bring", item: i.id }, me, { seq: 0, time: 1 });
                        if (covered(next) && !isCovered) haptic("success");
                        dispatch({ t: "bring", item: i.id });
                      }}>
                        Bring
                      </Button>
                    ) : dbl && gaps ? (
                      <Button kind="secondary" aria-label={`Fix ${i.label}`} onClick={() => dispatch({ t: "fix", item: i.id })}>
                        Fix
                      </Button>
                    ) : mine && i.by.length === 1 ? (
                      <span style={{ display: "inline-flex", borderRadius: 12, boxShadow: `0 0 0 2px ${c.card}, 0 0 0 3.5px ${c.primary}` }}>
                        <Avatar user={me} size={20} />
                      </span>
                    ) : (
                      <Facepile users={i.by} max={3} size={20} />
                    )}
                  </div>
                </div>
              </Changed>
            );
          })}
        </div>
        {n < MAX_ITEMS ? (
          <form
            style={{ display: "flex", alignItems: "center", gap: 8, height: 44 }}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input style={{ flex: 1, minWidth: 0 }} placeholder="Add something to bring" aria-label="Item to add" value={local.draft} onInput={(e) => setLocal({ draft: e.currentTarget.value })} />
            <Button kind="secondary" onClick={submit}>
              Add
            </Button>
          </form>
        ) : null}
        {mineDid ? <Burst key={confirmed.coveredAt} emoji="❤️" /> : null}
        <div style={{ marginTop: 6 }}>
          <div role="progressbar" aria-label="Items covered" aria-valuenow={done} aria-valuemin={0} aria-valuemax={n} style={{ height: 6, borderRadius: 3, background: c.track, overflow: "hidden" }}>
            <div style={{ height: 6, width: `${n ? (done / n) * 100 : 0}%`, background: isCovered ? c.positive : c.primary, transition: "width .4s cubic-bezier(.2,0,0,1), background-color .4s" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, height: 16 }}>
            <span style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, color: isCovered ? mix(c.positive, c.text, 0.3) : c.text, flex: "none" }}>{status}</span>
            <small style={{ flex: 1, minWidth: 0, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</small>
          </div>
        </div>
        {celebrating ? <Toast key={confirmed.coveredAt}>Table's covered.</Toast> : null}
      </div>
    );
  },
});

function Glyph({ kind, theme }: { kind: Kind; theme: Theme }) {
  const p = pal(theme);
  const o = { stroke: p.ink, strokeWidth: 1.2 };
  const bowl = <path d="M6 17 A11 8 0 0 0 28 17 Z" fill={p.plate} {...o} />;
  let art: Child;
  if (kind === "turkey")
    art = (
      <>
        <circle cx="20" cy="14" r="8" fill={p.brown} {...o} />
        <line x1="16" y1="18" x2="9" y2="25" stroke={p.cream} strokeWidth="4" strokeLinecap="round" />
        <circle cx="8" cy="26" r="3" fill={p.cream} {...o} />
      </>
    );
  else if (kind === "mac")
    art = (
      <>
        <circle cx="17" cy="17" r="7" fill={p.yellow} {...o} />
        {bowl}
      </>
    );
  else if (kind === "chips")
    art = (
      <>
        <rect x="9.5" y="7.5" width="15" height="19" rx="3" fill={p.red} {...o} />
        <circle cx="17" cy="19" r="3.5" fill={p.yellow} />
      </>
    );
  else if (kind === "drinks")
    art = (
      <>
        <rect x="12" y="12.5" width="10" height="15" rx="3" fill={p.green} {...o} />
        <rect x="14.5" y="7" width="5" height="6" rx="1" fill={p.green} {...o} />
      </>
    );
  else if (kind === "pie")
    art = (
      <>
        <path d="M7 24 L27 24 L17 8 Z" fill={p.orange} {...o} />
        <line x1="7" y1="24" x2="27" y2="24" stroke={p.crust} strokeWidth="3" />
      </>
    );
  else if (kind === "salad")
    art = (
      <>
        <circle cx="12" cy="15" r="4" fill={p.green} />
        <circle cx="18" cy="13" r="4" fill={p.green} />
        <circle cx="22" cy="16" r="4" fill={p.green} />
        <circle cx="16" cy="16" r="2" fill={p.red} />
        {bowl}
      </>
    );
  else if (kind === "ice")
    art = (
      <>
        {[[13, 19], [21, 20], [17, 13]].map(([x, y]) => (
          <rect key={`${x}`} x={x! - 4.5} y={y! - 4.5} width="9" height="9" rx="2.5" fill={p.sky} stroke={p.ink} strokeWidth="1" />
        ))}
      </>
    );
  else if (kind === "cups")
    art = (
      <>
        <path d="M10 8 L24 8 L21.5 26 L12.5 26 Z" fill={p.red} {...o} />
        <line x1="10.5" y1="12" x2="23.5" y2="12" stroke={p.card} strokeWidth="2" />
      </>
    );
  else
    art = (
      <>
        <circle cx="17" cy="17" r="10" fill={p.plate} {...o} />
        <circle cx="17" cy="17" r="4" fill={p.yellow} />
      </>
    );
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      {art}
    </svg>
  );
}
