import { defineApp, Avatar, Button, CardHeader, Changed, Chip, Facepile, Toast, haptic, mix, running } from "@muse/app";

// Squad lock: on a concert's event page the friends who said "interested" become a short Going
// list that locks at a threshold. Tap Going and your row slides in; at the threshold the header
// turns "Locked", and a ticket-drop line with "Remind all" takes over.

type Params = {
  /** Card title: "Go with friends" */
  title: string;
  /** Event, venue and interest count: "Khruangbin · Greek Theatre · 2.1K interested" */
  sub: string;
  /** Event date line in capitals: "SAT, OCT 4 AT 7 PM" */
  date: string;
  /** One line about the ticket sale: "Tickets on sale Fri 10 AM · GA $68" */
  tickets: string;
  /** Host, name exactly as in the members list */
  host: string;
  /** People going that lock the squad, 2 to 12 */
  threshold: number;
  /** Already going, names as in the members list, with a short quote each (may be empty) */
  going: { name: string; note: string }[];
  /** Said maybe, names as in the members list */
  maybe: string[];
};

// @params
const P: Params = {
  title: "Go with friends",
  sub: "Khruangbin · Greek Theatre · 2.1K interested",
  date: "SAT, OCT 4 AT 7 PM",
  tickets: "Tickets on sale Fri 10 AM · GA $68",
  host: "Maya",
  threshold: 4,
  going: [
    { name: "Maya", note: "Already got the day off" },
    { name: "Theo", note: "I'll drive 3" },
    { name: "Dev", note: "Fit is planned" },
  ],
  maybe: [],
};
// @end params

type V = "going" | "maybe" | "no";
/** at: when they said going (server time), 0 for seeded */
type Going = { user: string; at: number };
type State = {
  title: string;
  sub: string;
  date: string;
  tickets: string;
  host: string | null;
  threshold: number;
  going: Going[];
  maybe: string[];
  no: string[];
  notes: Record<string, string>;
  lockedAt: number;
  remindBy: string | null;
};
type Action = { t: "rsvp"; v: V } | { t: "remind" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name: string }[] };

const MAX_ROWS = 4;
const ANSWERS: [V, string, string][] = [
  ["going", "Going", "M2.5 6.2 5 8.6l4.5-5"],
  ["maybe", "Maybe", "M4.3 4.4a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.3M6 9.4v.1"],
  ["no", "Can't go", "M3 3l6 6M9 3 3 9"],
];
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const statusOf = (s: State, u: string): V | null => (s.going.some((g) => g.user === u) ? "going" : s.maybe.includes(u) ? "maybe" : s.no.includes(u) ? "no" : null);
const lists = (s: State) => JSON.stringify([s.going, s.maybe, s.no]);
const without = (s: State, u: string) => JSON.stringify([s.going.filter((g) => g.user !== u), s.maybe.filter((x) => x !== u), s.no.filter((x) => x !== u)]);
const holds = (s: State) => s.remindBy !== null && s.lockedAt > 0 && s.going.some((g) => g.user === s.remindBy);

export default defineApp<State, Action, Local>({
  name: "Go with friends",
  summary: (s) =>
    s.lockedAt > 0 ? `${s.title}: locked · ${s.going.length} going${s.remindBy ? " · reminder on" : ""}` : `${s.title}: ${s.going.length} of ${s.threshold} going`,

  init: (ctx) => {
    const find = (name: string) => {
      const want = String(name).trim().toLowerCase();
      return want ? ctx.members.find((m) => m.id === name || m.name.toLowerCase() === want)?.id : undefined;
    };
    const going: Going[] = [];
    const notes: Record<string, string> = {};
    for (const g of P.going) {
      const id = find(g.name);
      if (!id || going.some((x) => x.user === id)) continue;
      going.push({ user: id, at: 0 });
      const note = clip(g.note, 40);
      if (note) notes[id] = note;
    }
    const maybe: string[] = [];
    for (const n of P.maybe) {
      const id = find(n);
      if (id && !going.some((x) => x.user === id) && !maybe.includes(id)) maybe.push(id);
    }
    const threshold = Number.isInteger(P.threshold) ? Math.max(2, Math.min(12, P.threshold)) : 4;
    return {
      title: clip(P.title, 40) || "Go with friends",
      sub: clip(P.sub, 60),
      date: clip(P.date, 32),
      tickets: clip(P.tickets, 60),
      host: find(P.host) ?? null,
      threshold,
      going,
      maybe,
      no: [],
      notes,
      lockedAt: going.length >= threshold ? 1 : 0,
      remindBy: null,
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    if (a.t === "rsvp") {
      if (a.v !== "going" && a.v !== "maybe" && a.v !== "no") return s;
      if (statusOf(s, m.user) === a.v) return s;
      const going = s.going.filter((g) => g.user !== m.user);
      const next: State = {
        ...s,
        going: a.v === "going" ? [...going, { user: m.user, at: m.time }] : going,
        maybe: a.v === "maybe" ? [...s.maybe.filter((x) => x !== m.user), m.user] : s.maybe.filter((x) => x !== m.user),
        no: a.v === "no" ? [...s.no.filter((x) => x !== m.user), m.user] : s.no.filter((x) => x !== m.user),
      };
      next.lockedAt = next.going.length >= s.threshold ? (s.going.length >= s.threshold ? s.lockedAt : m.time) : 0;
      next.remindBy = holds(next) ? s.remindBy : null;
      return next;
    }
    if (a.t === "remind") {
      if (s.lockedAt <= 0 || s.remindBy !== null || !s.going.some((g) => g.user === m.user)) return s;
      return { ...s, remindBy: m.user };
    }
    return s;
  },

  onMembers: (s, ctx) => {
    const here = (u: string) => inChat(ctx, u);
    if (s.going.every((g) => here(g.user)) && s.maybe.every(here) && s.no.every(here) && (s.host === null || here(s.host))) return s;
    const next: State = {
      ...s,
      going: s.going.filter((g) => here(g.user)),
      maybe: s.maybe.filter(here),
      no: s.no.filter(here),
      host: s.host !== null && here(s.host) ? s.host : null,
    };
    next.lockedAt = next.going.length >= s.threshold ? s.lockedAt || 1 : 0;
    next.remindBy = holds(next) ? s.remindBy : null;
    return next;
  },

  invariants: {
    "everyone has at most one answer": (s) => {
      const all = [...s.going.map((g) => g.user), ...s.maybe, ...s.no];
      return new Set(all).size === all.length;
    },
    "answers come from people in the chat": (s, ctx) => s.going.every((g) => inChat(ctx, g.user)) && s.maybe.every((u) => inChat(ctx, u)) && s.no.every((u) => inChat(ctx, u)) && (s.host === null || inChat(ctx, s.host)),
    "locked exactly when enough are going": (s) => s.lockedAt > 0 === s.going.length >= s.threshold,
    "the reminder belongs to someone going in a locked squad": (s) => s.remindBy === null || (s.lockedAt > 0 && s.going.some((g) => g.user === s.remindBy)),
    "the threshold is 2 to 12": (s) => Number.isInteger(s.threshold) && s.threshold >= 2 && s.threshold <= 12,
  },

  transitions: {
    "an answer moves only the actor, into that list": (p, n, a, m) => a.t !== "rsvp" || p === n || (statusOf(n, m.user) === a.v && without(p, m.user) === without(n, m.user)),
    "saying going adds the actor last, now": (p, n, a, m) => a.t !== "rsvp" || p === n || a.v !== "going" || (n.going.at(-1)?.user === m.user && n.going.at(-1)?.at === m.time),
    "the lock is stamped when the squad reaches the threshold": (p, n, a, m) =>
      a.t !== "rsvp" || p === n || n.lockedAt === (n.going.length >= n.threshold ? (p.going.length >= p.threshold ? p.lockedAt : m.time) : 0),
    "a reminder is set once, by someone going": (p, n, a, m) =>
      a.t !== "remind" || p === n || (p.remindBy === null && n.remindBy === m.user && p.lockedAt > 0 && p.going.some((g) => g.user === m.user) && JSON.stringify(p.going) === JSON.stringify(n.going)),
    "a reminder stays while the squad holds": (p, n) => p.remindBy === null || n.remindBy === p.remindBy || n.lockedAt === 0 || !n.going.some((g) => g.user === p.remindBy),
    "a good answer always lands": (p, n, a, m, ctx) => a.t !== "rsvp" || !inChat(ctx, m.user) || !(a.v === "going" || a.v === "maybe" || a.v === "no") || statusOf(p, m.user) === a.v || p !== n,
    "a good reminder always lands": (p, n, a, m, ctx) => a.t !== "remind" || !inChat(ctx, m.user) || p.lockedAt <= 0 || p.remindBy !== null || !p.going.some((g) => g.user === m.user) || n.remindBy === m.user,
    "only people in the chat answer": (p, n, _a, m, ctx) => (lists(p) === lists(n) && p.remindBy === n.remindBy) || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (k < 0.15 && s.lockedAt > 0 && s.going.some((g) => g.user === user) && s.remindBy === null) return { t: "remind" };
    const v = r.next();
    return { t: "rsvp", v: v < 0.5 ? "going" : v < 0.75 ? "maybe" : "no" };
  },

  local: {},

  view: ({ state, confirmed, me, members, dispatch, theme }) => {
    const c = theme.color;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const first = (id: string) => (members.find((m) => m.id === id)?.name ?? "Someone");
    const n = state.going.length;
    const th = state.threshold;
    const locked = state.lockedAt > 0;
    const mine = statusOf(state, me);
    const myAt = state.going.find((g) => g.user === me)?.at ?? 0;
    const interested = members.filter((m) => statusOf(state, m.id) === null).map((m) => m.id);

    const shownGoing = n > MAX_ROWS ? state.going.slice(0, MAX_ROWS - 1) : state.going;
    const rest = n > MAX_ROWS ? state.going.slice(MAX_ROWS - 1) : [];
    const placeholder = n < th && shownGoing.length + (rest.length ? 1 : 0) < MAX_ROWS;
    const k = th - n;

    const row = (g: Going) => {
      const isMe = g.user === me;
      const note = state.notes[g.user];
      const body = (
        <div style={{ display: "flex", alignItems: "center", gap: 12, height: 42, padding: "0 8px", borderRadius: 8, background: isMe ? c.selected : "transparent" }}>
          <Avatar user={g.user} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: 15, lineHeight: "20px", fontWeight: 600, color: c.text }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(g.user)}</span>
              {state.host === g.user ? (
                <span style={{ flex: "none", marginLeft: 6, padding: "0 6px", borderRadius: 99, background: c.deemphasizedButton, color: c.deemphasizedButtonText, fontSize: 12, lineHeight: "16px", fontWeight: 600 }}>Host</span>
              ) : null}
            </div>
            <div style={{ fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {note ? `“${note}”` : isMe ? "“I'm going”" : "Going"}
            </div>
          </div>
        </div>
      );
      return (
        <div key={g.user} role="listitem">
          {isMe ? <Changed at={myAt} ms={1200} radius={8}>{body}</Changed> : body}
        </div>
      );
    };

    const interestedLine = (() => {
      const names = interested.map(first);
      const maybeBit = state.maybe.length ? ` · ${state.maybe.length} maybe` : "";
      if (names.length === 0) return "Everyone answered";
      if (names.length === 1) return `${names[0]} is interested${maybeBit}`;
      if (names.length === 2) return `${names[0]} and ${names[1]} are interested${maybeBit}`;
      if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} are interested${maybeBit}`;
      return `${names[0]}, ${names[1]} and ${names.length - 2} others are interested${maybeBit}`;
    })();

    const toast =
      confirmed.lockedAt > 1 && running(confirmed.lockedAt, 2400) !== null
        ? (() => {
            const last = confirmed.going.at(-1)?.user ?? "";
            return last === me ? "You're in. It's a plan." : `${first(last)} is in. It's a plan.`;
          })()
        : null;

    const footer = locked ? (
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.tickets}</div>
          <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.remindBy ? `Reminder on for all ${n}` : "Remind everyone before the drop"}</small>
        </div>
        {state.remindBy === null && mine === "going" ? (
          <Button kind="secondary" onClick={() => dispatch({ t: "remind" })}>
            Remind all
          </Button>
        ) : state.remindBy !== null ? (
          <Chip tone="positive">Reminder on</Chip>
        ) : null}
      </div>
    ) : (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 44, textAlign: "center" }}>
        <small>{mine === "maybe" ? "Muse will check in before tickets go on sale" : mine === "no" ? "Next time. The squad will miss you" : `Going locks the squad at ${th}`}</small>
      </div>
    );

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.sub} />
        <div style={{ height: 20, fontSize: 13, lineHeight: "20px", fontWeight: 600, color: mix(c.negative, c.text, 0.2), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{state.date}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 28, gap: 8 }}>
          <span style={{ fontSize: 17, lineHeight: "22px", fontWeight: 600, color: c.text }}>Going</span>
          <span style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, color: locked ? mix(c.positive, c.text, 0.3) : c.secondaryText, whiteSpace: "nowrap" }}>
            {locked ? `Locked · ${n} going` : `${n} of ${th} · locks at ${th}`}
          </span>
        </div>
        <div role="list" aria-label="Going">
          {shownGoing.map(row)}
          {rest.length ? (
            <div role="listitem" style={{ display: "flex", alignItems: "center", gap: 12, height: 42, padding: "0 8px" }}>
              <Facepile users={rest.map((g) => g.user)} max={3} size={32} />
              <span style={{ fontSize: 15, lineHeight: "20px", color: c.text }}>{`+${rest.length} more going`}</span>
            </div>
          ) : null}
          {placeholder ? (
            <div role="listitem" style={{ display: "flex", alignItems: "center", gap: 12, height: 42, padding: "0 8px" }}>
              <span aria-hidden="true" style={{ flex: "none", width: 32, height: 32, borderRadius: 16, background: c.input, color: c.secondaryText, fontSize: 17, lineHeight: "32px", fontWeight: 600, textAlign: "center" }}>+</span>
              <span style={{ fontSize: 15, lineHeight: "20px", color: c.secondaryText }}>{`${k} ${k === 1 ? "spot" : "spots"} to lock it`}</span>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 24 }}>
          {interested.length ? <Facepile users={interested} max={3} size={20} /> : null}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: c.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{interestedLine}</span>
        </div>
        <div style={{ height: 8 }} />
        <div role="group" style={{ display: "flex", justifyContent: "space-around", minHeight: 66 }}>
          {ANSWERS.map(([v, label, d]) => {
            const on = mine === v;
            const count = v === "going" ? n : v === "maybe" ? state.maybe.length : state.no.length;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  if (v === "going" && mine !== "going" && n < th && n + 1 >= th) haptic("success");
                  dispatch({ t: "rsvp", v });
                }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 72, padding: "4px 0", fontSize: 13, lineHeight: "16px", fontWeight: 600, color: c.text }}
              >
                <span style={{ width: 36, height: 36, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", background: on ? c.primary : c.secondaryButton, color: on ? c.onPrimary : c.text }}>
                  <svg width="16" height="16" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d={d} />
                  </svg>
                </span>
                {`${label} · ${count}`}
              </button>
            );
          })}
        </div>
        {footer}
        {toast ? <Toast key={confirmed.lockedAt}>{toast}</Toast> : null}
      </div>
    );
  },
});
