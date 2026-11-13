import {
  defineApp,
  Burst,
  Button,
  Canvas,
  CardHeader,
  Locked,
  OptionRow,
  running,
  tween,
  type Ctx,
} from "@muse/app";

// Which weekend: a few concrete weekends for a trip. Each person answers free or not, one card at
// a time (swipe or tap); the first weekend to reach the lock count locks.

type Params = {
  place: string;
  lockAt: number;
  weekends: { label: string; month: string; day: number; span: string; why: string; free: string[] }[];
};

// @params
const P: Params = {
  place: "Nashville",
  lockAt: 5,
  weekends: [
    { label: "Mar 6–8", month: "Mar", day: 6, span: "Thu–Sun", why: "midterms week tho", free: ["Priya", "Sam"] },
    { label: "Mar 13–15", month: "Mar", day: 13, span: "Thu–Sun", why: "break starts · flights $118", free: ["Priya", "Sam", "Ana", "Kev"] },
    { label: "Mar 27–29", month: "Mar", day: 27, span: "Thu–Sun", why: "Leo's bday weekend", free: ["Leo", "Ana", "Kev"] },
    { label: "Apr 10–12", month: "Apr", day: 10, span: "Thu–Sun", why: "warm out · fest crowds", free: ["Leo"] },
  ],
};
// @end params

type Weekend = { id: string; label: string; month: string; day: number; span: string; why: string; free: string[]; cant: string[] };
/** locked: weekend id once locked, null before. lockedAt: meta.time, 0 before. saved: who added it to their calendar. */
type State = { place: string; lockAt: number; weekends: Weekend[]; locked: string | null; lockedAt: number; saved: string[] };
type Action = { t: "answer"; id: string; free: boolean } | { t: "save" };
type Local = { drag: number; start: number; skip: string[] };

const MAX_WEEKENDS = 4;
const clean = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/!/g, "").replace(/\s+/g, " ").trim().slice(0, n) : "");
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const need = (s: State, ctx: { members: unknown[] }) => Math.max(1, Math.min(s.lockAt, ctx.members.length));
const upper = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const sameAnswers = (a: Weekend, b: Weekend) => JSON.stringify([a.free, a.cant]) === JSON.stringify([b.free, b.cant]);
const answered = (w: Weekend, u: string) => w.free.includes(u) || w.cant.includes(u);
const nextFor = (s: State, me: string, skip: string[]) => s.weekends.find((w) => !answered(w, me) && !skip.includes(w.id)) ?? null;
const best = (s: State) => s.weekends.reduce<Weekend | null>((b, w) => (b === null || w.free.length > b.free.length ? w : b), null);

export default defineApp<State, Action, Local>({
  name: "Which weekend",
  summary: (s, ctx) => {
    if (s.weekends.length === 0) return `${s.place}: no dates yet`;
    if (s.locked !== null) {
      const w = s.weekends.find((x) => x.id === s.locked)!;
      return `${s.place}: ${w.label}, ${w.free.length} going`;
    }
    const b = best(s)!;
    return `${s.place}: ${b.label} is at ${b.free.length} of ${need(s, ctx)}`;
  },

  init: (ctx) => {
    const who = (name: string) => {
      const want = name.trim().toLowerCase();
      return ctx.members.find((m) => m.id === name || m.name.toLowerCase() === want)?.id;
    };
    const weekends: Weekend[] = P.weekends.slice(0, MAX_WEEKENDS).map((w, i) => {
      const free: string[] = [];
      for (const name of w.free) {
        const u = who(name);
        if (u && !free.includes(u)) free.push(u);
      }
      const month = clean(w.month, 3);
      return {
        id: `w${i}`,
        label: clean(w.label, 16),
        month: month ? month[0]!.toUpperCase() + month.slice(1).toLowerCase() : "",
        day: Number.isInteger(w.day) && w.day >= 1 && w.day <= 31 ? w.day : 1,
        span: clean(w.span, 12),
        why: clean(w.why, 40),
        free,
        cant: [],
      };
    });
    const lockAt = Number.isInteger(P.lockAt) && P.lockAt >= 2 && P.lockAt <= 12 ? P.lockAt : 5;
    return { place: clean(P.place, 48) || "The trip", lockAt, weekends, locked: null, lockedAt: 0, saved: [] };
  },

  reduce: (s, a, meta, ctx) => {
    if (!inChat(ctx, meta.user)) return s;
    if (a.t === "answer") {
      if (s.locked !== null || typeof a.free !== "boolean" || typeof a.id !== "string" || !s.weekends.some((w) => w.id === a.id)) return s;
      const u = meta.user;
      const weekends = s.weekends.map((w) =>
        w.id !== a.id ? w : { ...w, free: [...w.free.filter((x) => x !== u), ...(a.free ? [u] : [])], cant: [...w.cant.filter((x) => x !== u), ...(a.free ? [] : [u])] },
      );
      const n = need(s, ctx);
      const hit = weekends.filter((w) => w.free.length >= n);
      if (hit.length === 0) return { ...s, weekends };
      const top = Math.max(...hit.map((w) => w.free.length));
      const tied = hit.filter((w) => w.free.length === top);
      const pick = tied.find((w) => w.id === a.id) ?? tied[0]!;
      return { ...s, weekends, locked: pick.id, lockedAt: meta.time };
    }
    if (a.t === "save") {
      const w = s.weekends.find((x) => x.id === s.locked);
      if (!w || s.saved.includes(meta.user) || !w.free.includes(meta.user)) return s;
      return { ...s, saved: [...s.saved, meta.user] };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    if (s.locked !== null) return s.saved.every(here) ? s : { ...s, saved: s.saved.filter(here) };
    if (s.weekends.every((w) => w.free.every(here) && w.cant.every(here))) return s;
    return { ...s, weekends: s.weekends.map((w) => ({ ...w, free: w.free.filter(here), cant: w.cant.filter(here) })) };
  },

  invariants: {
    "one answer per person per weekend": (s) =>
      s.weekends.every((w) => new Set(w.free).size === w.free.length && new Set(w.cant).size === w.cant.length && !w.free.some((u) => w.cant.includes(u))),
    "locked exactly when stamped": (s) => (s.locked === null) === (s.lockedAt === 0),
    "the locked weekend exists": (s) => s.locked === null || s.weekends.some((w) => w.id === s.locked),
    "only free people save it": (s) => {
      if (s.locked === null) return s.saved.length === 0;
      const w = s.weekends.find((x) => x.id === s.locked);
      return !!w && new Set(s.saved).size === s.saved.length && s.saved.every((u) => w.free.includes(u));
    },
    "answers are from the chat while open": (s, ctx) => s.locked !== null || s.weekends.every((w) => [...w.free, ...w.cant].every((u) => inChat(ctx, u))),
    "at most 4 weekends": (s) => s.weekends.length <= MAX_WEEKENDS && new Set(s.weekends.map((w) => w.id)).size === s.weekends.length,
  },

  transitions: {
    "an answer moves only the actor on one weekend": (p, n, a, m) => {
      if (a.t !== "answer" || p === n) return true;
      return p.weekends.every((w, i) => {
        const x = n.weekends[i]!;
        const others = (v: Weekend) => JSON.stringify([v.free.filter((u) => u !== m.user), v.cant.filter((u) => u !== m.user)]);
        if (w.id !== a.id) return sameAnswers(w, x);
        return x.free.includes(m.user) === a.free && x.cant.includes(m.user) === !a.free && others(w) === others(x);
      });
    },
    "reaching the count locks": (p, n, a, _m, ctx) => a.t !== "answer" || p === n || p.locked !== null || n.locked !== null || n.weekends.every((w) => w.free.length < need(n, ctx)),
    "locking stamps the answer's time": (p, n, _a, m) => p.locked !== null || n.locked === null || n.lockedAt === m.time,
    "a lock is final": (p, n) => p.locked === null || (n.locked === p.locked && n.lockedAt === p.lockedAt && JSON.stringify(n.weekends) === JSON.stringify(p.weekends)),
    "saving adds only the actor": (p, n, a, m) => a.t !== "save" || p === n || (n.saved.length === p.saved.length + 1 && n.saved.at(-1) === m.user),
    "the lock goes to the weekend with the most free": (p, n) => {
      if (p.locked !== null || n.locked === null) return true;
      const w = n.weekends.find((x) => x.id === n.locked)!;
      return n.weekends.every((x) => x.free.length <= w.free.length);
    },
  },

  arbitrary: (s, _u, r) => {
    if (s.locked !== null) return { t: "save" };
    const k = r.next();
    const id = s.weekends.length ? r.pick(s.weekends).id : "w0";
    if (k < 0.6) return { t: "answer", id, free: true };
    if (k < 0.95) return { t: "answer", id, free: false };
    return { t: "save" };
  },

  local: { drag: 0, start: 0, skip: [] },

  view: ({ state, me, members, dispatch, theme, local, setLocal }) => {
    const c = theme.color;
    const M = members.length;
    const n = need(state, { members });
    const lockedW = state.locked !== null ? state.weekends.find((w) => w.id === state.locked) ?? null : null;
    const mine = lockedW ? null : nextFor(state, me, local.skip);
    const waitingOn = members.filter((m) => state.weekends.some((w) => !answered(w, m.id)));
    const top = best(state);
    const shown = lockedW ?? mine ?? top;
    const names = waitingOn.map((m) => (m.id === me ? "you" : m.name));
    const who = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
    const e = lockedW ? running(state.lockedAt, 500) : null;
    const flip = e === null ? 1 : tween({ duration: 250, easing: "decelerate" })(Math.max(0, e - 250) / 250);
    const dragging = mine !== null && Math.abs(local.drag) > 8;
    const subtitle = lockedW ? `Locked · ${lockedW.label} · ${lockedW.free.length} going` : `${state.place} · locks at ${n} of ${M}`;
    const answerFor = (free: boolean) => {
      if (!mine) return;
      dispatch({ t: "answer", id: mine.id, free });
      setLocal({ drag: 0, skip: [...local.skip, mine.id] });
    };

    const tile = (w: Weekend | null) => (
      <div style={{ flex: "none", width: 76, height: 76, borderRadius: 10, overflow: "hidden", background: c.card, display: "flex", flexDirection: "column", transform: `perspective(300px) rotateX(${-90 * (1 - flip)}deg)`, transformOrigin: "50% 50%" }}>
        <div style={{ height: 26, display: "grid", placeItems: "center", background: c.negative, color: c.card, fontSize: 19, fontWeight: 700, lineHeight: "26px" }}>{w ? w.month : ""}</div>
        <div style={{ flex: 1, display: "grid", placeItems: "center", fontSize: 34, fontWeight: 700, lineHeight: "40px", color: c.text }}>{w ? w.day : "?"}</div>
      </div>
    );

    const line = (text: string, color: string, size: number, weight: number) => (
      <div style={{ fontSize: size, fontWeight: weight, lineHeight: size === 17 ? "22px" : "18px", color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</div>
    );

    const card = (
      <div style={{ position: "relative", margin: "2px 0", padding: "10px 12px", height: 96, boxSizing: "border-box", borderRadius: 12, background: c.wash, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", transform: `translateX(${mine ? local.drag : 0}px)`, transition: dragging ? "none" : "transform .2s" }}>
          {tile(shown)}
          <div style={{ flex: 1, minWidth: 0 }}>
            {state.weekends.length === 0 ? (
              line("No dates yet", c.text, 17, 600)
            ) : lockedW ? (
              <>
                {line("It's a date.", c.link, 13, 400)}
                {line([lockedW.label, lockedW.span].filter(Boolean).join(" · "), c.text, 17, 600)}
                {line(upper(lockedW.why), c.secondaryText, 13, 400)}
              </>
            ) : mine ? (
              <>
                {line("Are you free?", c.secondaryText, 13, 400)}
                {line([mine.label, mine.span].filter(Boolean).join(" · "), c.text, 17, 600)}
                {line(upper(mine.why), c.secondaryText, 13, 400)}
              </>
            ) : (
              <>
                {line(`No weekend hit ${n} yet`, c.secondaryText, 13, 400)}
                {line(`Waiting on ${who}`, c.text, 17, 600)}
              </>
            )}
          </div>
        </div>
        {dragging ? (
          <span
            style={{
              position: "absolute",
              top: 8,
              right: 10,
              padding: "2px 10px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              color: c.onPrimary,
              background: local.drag > 0 ? c.positive : c.negative,
              opacity: Math.min(1, Math.abs(local.drag) / 60),
            }}
          >
            {local.drag > 0 ? "Free" : "Can't"}
          </span>
        ) : null}
        {mine ? (
          <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
            <Canvas
              height={96}
              label="Swipe right if you're free, left if you can't"
              draw={() => {}}
              drag
              onPointer={(ev) => {
                if (ev.type === "down") setLocal({ start: ev.x, drag: 0 });
                else if (ev.type === "move") setLocal({ drag: ev.x - local.start });
                else if (ev.type === "up") {
                  if (local.drag > 60) answerFor(true);
                  else if (local.drag < -60) answerFor(false);
                  else setLocal({ drag: 0 });
                }
              }}
            />
          </div>
        ) : null}
        {e !== null ? <Burst key={state.lockedAt} emoji="❤️" /> : null}
      </div>
    );

    const detail = lockedW ? `${lockedW.label} · ${lockedW.free.length} going` : "";
    const actions = lockedW ? (
      lockedW.free.includes(me) ? (
        state.saved.includes(me) ? (
          <Locked detail={detail}>Added</Locked>
        ) : (
          <Button kind="primary" wide onClick={() => dispatch({ t: "save" })}>
            Add to calendar
          </Button>
        )
      ) : (
        <Locked detail={detail}>Locked</Locked>
      )
    ) : mine ? (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Button kind="secondary" wide onClick={() => answerFor(false)}>
          Can't
        </Button>
        <Button kind="primary" wide onClick={() => answerFor(true)}>
          I'm free
        </Button>
      </div>
    ) : state.weekends.length > 0 ? (
      <div style={{ display: "grid", placeItems: "center", height: 44, borderRadius: 8, background: c.secondaryButton, color: c.secondaryButtonText, fontSize: 15, fontWeight: 600 }}>{`Waiting on ${waitingOn.length}`}</div>
    ) : null;

    return (
      <div>
        <CardHeader title="Which weekend?" subtitle={subtitle} />
        {card}
        {actions}
        <div style={{ marginTop: 4 }}>
          {state.weekends.map((w) => (
            <OptionRow
              key={w.id}
              label={`${w.label}${state.locked === w.id ? " · locked" : ""}${w.cant.includes(me) ? " · you can't" : ""}`}
              count={w.free.length}
              total={n}
              voters={w.free}
              selected={w.free.includes(me)}
              {...(state.locked === null ? { onClick: () => dispatch({ t: "answer", id: w.id, free: !w.free.includes(me) }) } : {})}
            />
          ))}
        </div>
      </div>
    );
  },
});
