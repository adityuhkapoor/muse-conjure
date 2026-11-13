import { defineApp, Button, CardHeader, OptionRow } from "@muse/app";

const CHAT = {
  title: "Which weekend for Hugo's karaoke?",
  weekends: ["Mar 7", "Mar 14", "Mar 21", "Mar 28"],
};

type Option = { id: string; label: string; yes: string[] };
type State = { title: string; options: Option[]; lockedId: string | null; lockedBy: string | null; lockedAt: number };
type Action = { t: "vote"; option: string } | { t: "lock"; option: string } | { t: "unlock" };
type Local = Record<string, never>;

const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const need = (ctx: { members: unknown[] }) => Math.floor(Math.max(1, ctx.members.length) / 2) + 1;
const yesOf = (s: State, id: unknown) => s.options.find((o) => o.id === id)?.yes ?? [];
const without = (xs: string[], u: string) => xs.filter((x) => x !== u).join();
const sameYes = (p: State, n: State) =>
  p.options.length === n.options.length && p.options.every((o, i) => n.options[i]?.id === o.id && n.options[i]?.yes.join() === o.yes.join());
const leader = (s: State) => s.options.reduce<Option | null>((best, o) => (best === null || o.yes.length > best.yes.length ? o : best), null);

export default defineApp<State, Action, Local>({
  name: "Weekend poll",
  summary: (s, ctx) => {
    const locked = s.options.find((o) => o.id === s.lockedId);
    if (locked) return `${s.title} Locked: ${locked.label} with ${locked.yes.length} yeses.`;
    const top = leader(s);
    if (!top || top.yes.length === 0) return `${s.title} No yeses yet.`;
    return `${s.title} ${top.label} leads with ${top.yes.length} of ${ctx.members.length}.`;
  },

  init: () => ({
    title: CHAT.title,
    options: CHAT.weekends.map((label, i) => ({ id: `d${i}`, label, yes: [] })),
    lockedId: null,
    lockedBy: null,
    lockedAt: 0,
  }),

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "vote") {
      if (s.lockedId !== null || typeof a.option !== "string" || !s.options.some((o) => o.id === a.option)) return s;
      return {
        ...s,
        options: s.options.map((o) =>
          o.id !== a.option ? o : { ...o, yes: o.yes.includes(m.user) ? o.yes.filter((u) => u !== m.user) : [...o.yes, m.user] },
        ),
      };
    }
    if (a.t === "lock") {
      if (s.lockedId !== null || typeof a.option !== "string") return s;
      const opt = s.options.find((o) => o.id === a.option);
      if (!opt || opt.yes.length < need(ctx)) return s;
      return { ...s, lockedId: opt.id, lockedBy: m.user, lockedAt: m.time };
    }
    if (a.t === "unlock") {
      if (s.lockedId === null || s.lockedBy === null) return s;
      if (s.lockedBy !== m.user && inChat(ctx, s.lockedBy)) return s;
      return { ...s, lockedId: null, lockedBy: null, lockedAt: 0 };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    if (s.options.every((o) => o.yes.every((u) => inChat(ctx, u)))) return s;
    return { ...s, options: s.options.map((o) => (o.yes.every((u) => inChat(ctx, u)) ? o : { ...o, yes: o.yes.filter((u) => inChat(ctx, u)) })) };
  },

  invariants: {
    "no one is in a weekend's yes list twice": (s) => s.options.every((o) => new Set(o.yes).size === o.yes.length),
    "everyone who said yes is in the chat": (s, ctx) => s.options.every((o) => o.yes.every((u) => inChat(ctx, u))),
    "there are exactly the chat's weekends with unique ids": (s) =>
      s.options.length === CHAT.weekends.length && new Set(s.options.map((o) => o.id)).size === s.options.length,
    "a lock names an existing weekend and a locker, and an open poll has neither": (s) =>
      s.lockedId === null
        ? s.lockedBy === null && s.lockedAt === 0
        : s.lockedBy !== null && s.options.some((o) => o.id === s.lockedId),
  },

  transitions: {
    "a vote flips the voter's yes on that weekend and leaves everyone else alone": (p, n, a, m) =>
      a.t !== "vote" ||
      p === n ||
      (p.lockedId === null &&
        yesOf(p, a.option).includes(m.user) !== yesOf(n, a.option).includes(m.user) &&
        p.options.every((o, i) =>
          n.options[i]?.id !== o.id
            ? false
            : o.id === a.option
              ? without(o.yes, m.user) === without(n.options[i]?.yes ?? [], m.user)
              : n.options[i]?.yes.join() === o.yes.join(),
        )),
    "a lock records the weekend, the locker and the time, and only with enough yeses": (p, n, a, m, ctx) =>
      a.t !== "lock" ||
      p === n ||
      (p.lockedId === null &&
        yesOf(p, a.option).length >= need(ctx) &&
        n.lockedId === a.option &&
        n.lockedBy === m.user &&
        n.lockedAt === m.time &&
        sameYes(p, n)),
    "only the locker reopens the poll, and the yeses are kept": (p, n, a, m, ctx) =>
      a.t !== "unlock" ||
      p === n ||
      (p.lockedId !== null && (p.lockedBy === m.user || (p.lockedBy !== null && !inChat(ctx, p.lockedBy))) && n.lockedId === null && sameYes(p, n)),
    "the title and weekends never change": (p, n) =>
      p.title === n.title && p.options.length === n.options.length && p.options.every((o, i) => n.options[i]?.id === o.id && n.options[i]?.label === o.label),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    if (s.lockedId !== null) {
      if (s.lockedBy === user && r.next() < 0.6) return { t: "unlock" };
      return r.next() < 0.5 ? { t: "vote", option: r.pick(s.options).id } : { t: "lock", option: r.pick(s.options).id };
    }
    const x = r.next();
    if (x < 0.1) return { t: "vote", option: "zz" };
    if (x < 0.3) {
      const top = leader(s);
      return { t: "lock", option: top ? top.id : r.pick(s.options).id };
    }
    return { t: "vote", option: r.pick(s.options).id };
  },

  local: {},

  view: ({ state, me, members, dispatch }) => {
    const n = Math.max(1, members.length);
    const bar = need({ members });
    const top = leader(state);
    const locked = state.options.find((o) => o.id === state.lockedId) ?? null;
    const nameOf = (id: string | null) => (id === null ? "someone" : id === me ? "you" : (members.find((x) => x.id === id)?.name ?? "someone"));
    const canLock = !locked && !!top && top.yes.length >= bar;
    const subtitle = locked
      ? `Locked · ${locked.label}`
      : top && top.yes.length > 0
        ? `${top.yes.length} of ${members.length} in on ${top.label}`
        : "Tap the weekends you can do";
    const canReopen = !!locked && (state.lockedBy === me || (state.lockedBy !== null && !members.some((x) => x.id === state.lockedBy)));
    return (
      <div>
        <CardHeader title={state.title} subtitle={subtitle} />
        <div style={{ display: "grid", gap: 2 }}>
          {state.options.map((o) => {
            const props = locked ? {} : { onClick: () => dispatch({ t: "vote", option: o.id }) };
            return (
              <OptionRow
                key={o.id}
                label={o.label}
                count={o.yes.length}
                total={n}
                voters={o.yes}
                selected={o.yes.includes(me)}
                {...props}
              />
            );
          })}
        </div>
        <div style={{ marginTop: 8 }}>
          {locked ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{`Locked · ${locked.label} · ${locked.yes.length} going`}</div>
                <small>{`Locked by ${nameOf(state.lockedBy)}`}</small>
              </div>
              {canReopen ? (
                <Button kind="deemphasized" onClick={() => dispatch({ t: "unlock" })}>
                  Reopen
                </Button>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44 }}>
              <small>{canLock && top ? `${top.label} has ${top.yes.length} yeses` : `Needs ${bar} yeses to lock`}</small>
              <Button kind="primary" disabled={!canLock} onClick={() => { if (top) dispatch({ t: "lock", option: top.id }); }}>
                Lock
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  },
});
