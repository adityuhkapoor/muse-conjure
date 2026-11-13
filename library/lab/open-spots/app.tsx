import { defineApp, Avatar, Button, CardHeader, Chip, Facepile, More, Toast, haptic, mix, running, type Ctx, type Member, type Meta } from "@muse/app";

// Open spots: a plan with a few places left is opened to friends of friends. Requests arrive as a
// stack of cards with mutual-friend faces and a note; the host accepts or declines, accepted faces
// fill the dashed spots, and the rest wait. The host is always the first person going.

type Params = {
  title: string;
  when: string;
  going: string[];
  spots: number;
  requests: { name: string; meta: string; mutuals: string[]; note: string }[];
};

// @params
const P: Params = {
  title: "Sunset hike · Mission Peak",
  when: "Sat 5:30 · Stanford Ave lot",
  going: ["Maya", "Theo", "Noa", "Dev", "Priya"],
  spots: 3,
  requests: [
    { name: "Lena Park", meta: "Cal '27 · climbs at Mission Cliffs", mutuals: ["Maya", "Noa"], note: "Can bring headlamps for the way down" },
    { name: "Omar Haddad", meta: "Theo's roommate · runs Lake Merritt", mutuals: ["Theo"], note: "Been wanting to do this one forever" },
    { name: "Bea Santos", meta: "SF State · Bay Area Hikers group", mutuals: [], note: "Is the trail dog friendly?" },
    { name: "Chris Wu", meta: "Stanford '26 · has a car with 3 seats", mutuals: ["Maya", "Theo", "Dev"], note: "Can drive 3 from Palo Alto" },
    { name: "Hana Ito", meta: "Cal '28 · photo club", mutuals: ["Noa"], note: "I'll bring my film camera" },
  ],
};
// @end params

type Req = { id: string; name: string; user: string | null; meta: string; mutuals: string[]; note: string; status: "waiting" | "in" | "no"; at: number };
type State = { title: string; when: string; going: string[]; cap: number; reqs: Req[]; fullAt: number };
type Action = { t: "decide"; req: string; ok: boolean } | { t: "ask"; note: string } | { t: "leave" };
type Local = { note: string };

const MAX_REQS = 8;
const MAX_QUEUE = 20;
const POP_MS = 600;

const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);
const inCount = (s: State) => s.reqs.filter((r) => r.status === "in").length;
const full = (s: State) => s.going.length + inCount(s) >= s.cap;
const live = (s: State, user: string) => s.reqs.find((r) => r.user === user && r.status !== "no");
const text = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** Keep fullAt exact after every change: the time the last spot filled, 0 while open. */
function stamped(prev: State, next: State, time: number): State {
  return { ...next, fullAt: full(next) ? (full(prev) ? prev.fullAt : time) : 0 };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function reduceOpen(s: State, a: Record<string, unknown>, meta: Meta, ctx: Ctx): State {
  const user = meta.user;
  const time = meta.time;

  if (a.t === "decide") {
    if (typeof a.req !== "string" || typeof a.ok !== "boolean") return s;
    if (s.going[0] !== user) return s;
    const r = s.reqs.find((x) => x.id === a.req);
    if (!r || r.status !== "waiting") return s;
    if (a.ok) {
      if (full(s)) return s;
      return stamped(s, { ...s, reqs: s.reqs.map((x) => (x.id === r.id ? { ...x, status: "in", at: time } : x)) }, time);
    }
    return stamped(s, { ...s, reqs: s.reqs.map((x) => (x.id === r.id ? { ...x, status: "no", at: 0 } : x)) }, time);
  }

  if (a.t === "ask") {
    if (typeof a.note !== "string") return s;
    if (s.going.includes(user) || live(s, user) || s.reqs.length >= MAX_QUEUE) return s;
    const req: Req = { id: `r${meta.seq}`, name: "", user, meta: "In this chat", mutuals: [], note: a.note.trim().slice(0, 60), status: "waiting", at: 0 };
    return stamped(s, { ...s, reqs: [...s.reqs, req] }, time);
  }

  if (a.t === "leave") {
    if (s.going.includes(user)) return stamped(s, { ...s, going: s.going.filter((u) => u !== user) }, time);
    const mine = live(s, user);
    if (!mine) return s;
    return stamped(s, { ...s, reqs: s.reqs.map((x) => (x.id === mine.id ? { ...x, status: "no", at: 0 } : x)) }, time);
  }

  return s;
}

export default defineApp<State, Action, Local>({
  name: "Open spots",
  summary: (s) => {
    const n = s.going.length + inCount(s);
    const waiting = s.reqs.filter((r) => r.status === "waiting").length;
    return full(s) ? `${s.title}: full at ${s.cap} · ${waiting} on the waitlist` : `${s.title}: ${n} going · ${s.cap - n} spots left · ${waiting} waiting`;
  },

  init: (ctx) => {
    const used = new Set<string>();
    const going: string[] = [];
    for (const want of Array.isArray(P.going) ? P.going : []) {
      const w = String(want ?? "").trim().toLowerCase();
      const m = ctx.members.find((x) => x.id === want || (x.name ?? "").trim().toLowerCase() === w);
      if (m && !used.has(m.id)) {
        used.add(m.id);
        going.push(m.id);
      }
    }
    const spots = Number.isFinite(P.spots) ? Math.trunc(P.spots) : 3;
    const cap = going.length + Math.max(1, Math.min(8, spots));
    const reqs: Req[] = (Array.isArray(P.requests) ? P.requests : []).slice(0, MAX_REQS).map((r, i) => ({
      id: `p${i}`,
      name: text(r?.name, 28) || "Someone",
      user: null,
      meta: text(r?.meta, 48),
      mutuals: (Array.isArray(r?.mutuals) ? r.mutuals : []).slice(0, 6).map((n) => text(n, 20)).filter(Boolean),
      note: text(r?.note, 60),
      status: "waiting",
      at: 0,
    }));
    return { title: text(P.title, 60) || "Open spots", when: text(P.when, 60), going, cap, reqs, fullAt: 0 };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reduceOpen(state, action as unknown as Record<string, unknown>, meta, ctx) : state),

  // People who left give up their place or their request; the plan may reopen a spot.
  onMembers: (state, ctx) => {
    const here = new Set(ctx.members.map((m) => m.id));
    const going = state.going.filter((u) => here.has(u));
    const reqs = state.reqs.map((r) => (r.user !== null && !here.has(r.user) && (r.status === "waiting" || r.status === "in") ? { ...r, status: "no" as const, at: 0 } : r));
    if (same(going, state.going) && same(reqs, state.reqs)) return state;
    const next = { ...state, going, reqs };
    return { ...next, fullAt: full(next) ? (state.fullAt > 0 ? state.fullAt : 1) : 0 };
  },

  invariants: {
    "the host is the first person going": (s, ctx) => new Set(s.going).size === s.going.length && s.going.every((u) => inChat(ctx, u)),
    "never more people than places": (s) => s.going.length + inCount(s) <= s.cap && Number.isInteger(s.cap) && s.cap >= 1,
    "full is stamped exactly when the plan is full": (s) => (s.fullAt > 0) === full(s),
    "a chat member has one live request at most, and none if going": (s, ctx) =>
      ctx.members.every((m) => {
        const n = s.reqs.filter((r) => r.user === m.id && r.status !== "no").length;
        return n <= 1 && (!s.going.includes(m.id) || n === 0);
      }),
    "requests from the chat come from people in it": (s, ctx) => s.reqs.every((r) => r.user === null || r.status === "no" || inChat(ctx, r.user)),
    "request ids are unique": (s) => new Set(s.reqs.map((r) => r.id)).size === s.reqs.length,
    "accepted requests carry their time": (s) => s.reqs.every((r) => (r.status === "in") === (r.at > 0)),
  },

  transitions: {
    "only the host decides": (p, n, a, m) => a.t !== "decide" || p === n || m.user === p.going[0],
    "accepting takes a free spot": (p, n, a, m) => {
      if (a.t !== "decide" || p === n || !a.ok) return true;
      const before = p.reqs.find((r) => r.id === a.req);
      const after = n.reqs.find((r) => r.id === a.req);
      return !full(p) && before?.status === "waiting" && after?.status === "in" && after.at === m.time;
    },
    "declining marks only that request": (p, n, a) => {
      if (a.t !== "decide" || p === n || a.ok) return true;
      const before = p.reqs.find((r) => r.id === a.req);
      const after = n.reqs.find((r) => r.id === a.req);
      return before?.status === "waiting" && after?.status === "no";
    },
    "a decision changes one request": (p, n, a) => {
      if (a.t !== "decide" || p === n) return true;
      return sameExcept(p.reqs, n.reqs, a.req) && same(p.going, n.going);
    },
    "asking adds one waiting request from the actor": (p, n, a, m) => {
      if (a.t !== "ask" || p === n) return true;
      const last = n.reqs.at(-1);
      return n.reqs.length === p.reqs.length + 1 && last?.id === `r${m.seq}` && last.user === m.user && last.status === "waiting" && !p.going.includes(m.user);
    },
    "leaving removes only the actor": (p, n, a, m) => {
      if (a.t !== "leave" || p === n) return true;
      return !n.going.includes(m.user) && same(p.going.filter((u) => u !== m.user), n.going) && n.reqs.every((r) => r.user === m.user || same(r, p.reqs.find((x) => x.id === r.id)));
    },
    "full is stamped when the last spot fills": (p, n, a, m) => n.fullAt === (full(n) ? (full(p) ? p.fullAt : m.time) : 0),
    "a declined request stays declined": (p, n) => p.reqs.every((r) => r.status !== "no" || n.reqs.find((x) => x.id === r.id)?.status === "no"),
    "only people in the chat change anything": (p, n, a, m, ctx) => same(p, n) || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    const waiting = s.reqs.filter((x) => x.status === "waiting");
    const mine = s.reqs.find((x) => x.user === user && x.status !== "no");
    if (s.going[0] === user) return waiting.length && k < 0.9 ? { t: "decide", req: r.pick(waiting).id, ok: r.next() < 0.6 } : { t: "leave" };
    if (s.going.includes(user)) return k < 0.15 ? { t: "leave" } : waiting.length ? { t: "decide", req: r.pick(waiting).id, ok: true } : { t: "leave" };
    if (mine) return k < 0.3 ? { t: "leave" } : { t: "ask", note: "me too" };
    return { t: "ask", note: r.pick(["Can I come?", "", "I have a car"]) };
  },

  local: { note: "" },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const W = theme.width - 24;
    const host = state.going[0];
    const accepted = state.reqs.filter((r) => r.status === "in");
    const waiting = state.reqs.filter((r) => r.status === "waiting");
    const nGoing = state.going.length + accepted.length;
    const left = state.cap - nGoing;
    const spots = state.cap - state.going.length;
    const isFull = full(state);
    const nameOf = (id: string) => members.find((m) => m.id === id)?.name?.trim() || "Someone";
    const hostName = host ? nameOf(host) : "the host";
    const matchMember = (name: string) => {
      const w = name.trim().toLowerCase();
      return members.find((m) => m.id === name || (m.name ?? "").trim().toLowerCase() === w);
    };
    const person = (name: string): string | Member => matchMember(name) ?? { id: `x:${name}`, name };
    const reqName = (r: Req) => (r.user ? nameOf(r.user) : r.name || "Someone");
    const reqFace = (r: Req): string | Member => (r.user ? r.user : { id: `x:${r.name}`, name: r.name || "Someone" });
    const mine = state.reqs.find((r) => r.user === me && r.status !== "no");
    const goingOut = state.going.includes(me) || mine?.status === "in";

    // The plan row: going, then accepted, then dashed open spots; collapse going into "+N".
    const circles = state.going.length + accepted.length + Math.max(0, left);
    const slots = Math.floor((W + 5) / 31);
    let shownGoing = state.going;
    if (circles > slots) {
      const room = Math.max(0, slots - accepted.length - Math.max(0, left) - 1);
      shownGoing = state.going.slice(0, room);
    }
    const moreGoing = state.going.length - shownGoing.length;

    const pop = (at: number) => (el: HTMLElement | null) => {
      if (!el || !at || running(at, POP_MS) === null) return;
      el.animate([{ scale: "0.2", opacity: 0 }, { scale: "1", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.34,1.56,.64,1)" });
    };
    const popAt = (r: Req) => confirmed.reqs.find((x) => x.id === r.id)?.at ?? 0;
    const accept = (r: Req) => {
      if (state.going.length + inCount(state) + 1 >= state.cap) haptic("success");
      dispatch({ t: "decide", req: r.id, ok: true });
    };

    const strip = (
      <div style={{ background: theme.color.input, borderRadius: 12, padding: "8px 12px", minHeight: 66, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, height: 26, overflow: "hidden" }} aria-label={`${nGoing} going, ${Math.max(0, left)} open spots`}>
          {shownGoing.map((u) => (
            <span key={u} style={{ display: "inline-flex", flex: "none", borderRadius: "50%", boxShadow: u === me ? `0 0 0 2px ${theme.color.primary}` : undefined }}>
              <Avatar user={u} size={26} />
            </span>
          ))}
          {moreGoing > 0 ? <More n={moreGoing} size={26} /> : null}
          {accepted.map((r) => (
            <span key={r.id} ref={pop(popAt(r))} style={{ display: "inline-flex", flex: "none", borderRadius: "50%", boxShadow: `0 0 0 2px ${theme.color.card}, 0 0 0 4px ${theme.color.positive}` }}>
              <Avatar user={reqFace(r)} size={26} />
            </span>
          ))}
          {Array.from({ length: Math.max(0, left) }, (_, i) => (
            <span
              key={`o${i}`}
              aria-hidden="true"
              style={{ display: "inline-flex", flex: "none", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", border: `1.5px dashed ${theme.color.primary}`, color: theme.color.link, fontSize: 14, lineHeight: 1, fontWeight: 600 }}
            >
              +
            </span>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, height: 20, minWidth: 0 }}>
          <small style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {`${nGoing} going · ${accepted.length} of ${spots} spots filled`}
          </small>
          <Chip tone={isFull ? "negative" : "positive"} maxWidth={Math.round((W - 24) * 0.55)}>
            {isFull ? "Full" : "Open to friends of friends"}
          </Chip>
        </div>
      </div>
    );

    const requestCard = (r: Req) => {
      const i = waiting.findIndex((x) => x.id === r.id) + 1;
      const user = r.user && members.some((m) => m.id === r.user);
      const mutualFaces = r.mutuals.map(person);
      return (
        <div key={r.id}>
          <div style={{ background: theme.color.input, borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar user={reqFace(r)} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, lineHeight: "22px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reqName(r)}</div>
                <div style={{ fontSize: 13, lineHeight: "16px", color: theme.color.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.meta}</div>
              </div>
              <span style={{ flex: "none", alignSelf: "flex-start", fontSize: 12, lineHeight: "16px", color: theme.color.secondaryText }}>{`${i} of ${waiting.length}`}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, height: 24, minWidth: 0 }}>
              {user ? (
                <Chip tone="primary">In this chat</Chip>
              ) : r.mutuals.length === 0 ? (
                <Chip>No mutual friends yet</Chip>
              ) : (
                <>
                  <Facepile users={mutualFaces} max={3} size={20} />
                  <span style={{ fontSize: 13, lineHeight: "16px", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {`${r.mutuals.length} ${r.mutuals.length === 1 ? "mutual friend" : "mutual friends"} · ${r.mutuals.join(", ")}`}
                  </span>
                </>
              )}
            </div>
            {r.note ? (
              <div style={{ marginTop: 8, background: theme.color.secondaryButton, color: theme.color.secondaryButtonText, borderRadius: 17, padding: "7px 14px", fontSize: 15, lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {`“${r.note}”`}
              </div>
            ) : null}
            <div style={{ marginTop: 10 }}>
              {host === me ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Button kind="secondary" wide onClick={() => dispatch({ t: "decide", req: r.id, ok: false })}>
                    Decline
                  </Button>
                  <Button kind="primary" wide onClick={() => accept(r)}>
                    Accept
                  </Button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 36 }}>
                  <small>{`Waiting on ${hostName}`}</small>
                </div>
              )}
            </div>
          </div>
          <div style={{ height: 5, margin: "0 10px", background: mix(theme.color.input, theme.color.card, 0.4), borderRadius: "0 0 12px 12px" }} />
          <div style={{ height: 5, margin: "0 20px", background: mix(theme.color.input, theme.color.card, 0.7), borderRadius: "0 0 12px 12px" }} />
        </div>
      );
    };

    const fullCard = (
      <div style={{ background: theme.color.input, borderRadius: 12, padding: 12 }}>
        <small style={{ display: "block" }}>{accepted.length === 0 && waiting.length === 0 ? "No requests yet" : `The new ${accepted.length}`}</small>
        {accepted.length ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 8 }}>
            {accepted.slice(0, 4).map((r) => (
              <div key={r.id} style={{ flex: 1, minWidth: 0, maxWidth: 110, textAlign: "center" }}>
                <span ref={pop(popAt(r))} style={{ display: "inline-flex", borderRadius: "50%", boxShadow: `0 0 0 2px ${theme.color.card}, 0 0 0 4px ${theme.color.positive}` }}>
                  <Avatar user={reqFace(r)} size={44} />
                </span>
                <div style={{ marginTop: 4, fontSize: 13, lineHeight: "16px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reqName(r)}</div>
              </div>
            ))}
            {accepted.length > 4 ? (
              <div style={{ flex: "none", display: "flex", alignItems: "center", height: 44 }}>
                <More n={accepted.length - 4} size={44} />
              </div>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, height: 20, minWidth: 0 }}>
          <Facepile users={waiting.map(reqFace)} max={3} size={20} />
          <small style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {isFull ? `${waiting.length} on the waitlist · requests closed` : "Waiting for requests"}
          </small>
        </div>
      </div>
    );

    const footerText = isFull
      ? `Plan full at ${state.cap} · see you there`
      : `${waiting.length} ${waiting.length === 1 ? "request" : "requests"} · ${Math.max(0, left)} ${Math.max(0, left) === 1 ? "spot" : "spots"} left`;

    const footer =
      host === me ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 44 }}>
          <small>{footerText}</small>
        </div>
      ) : mine?.status === "waiting" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, minWidth: 0 }}>
          <small style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`Your request is with ${hostName}`}</small>
          <Button kind="secondary" onClick={() => dispatch({ t: "leave" })}>
            Cancel
          </Button>
        </div>
      ) : goingOut ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, minWidth: 0 }}>
          <small style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{footerText}</small>
          <Button kind="secondary" onClick={() => dispatch({ t: "leave" })}>
            Leave
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, minWidth: 0 }}>
          <input
            placeholder="Add a note"
            aria-label="Note to the host"
            value={local.note}
            onInput={(e) => setLocal({ note: e.currentTarget.value })}
            style={{ flex: 1, minWidth: 0 }}
          />
          <Button
            kind="primary"
            onClick={() => {
              dispatch({ t: "ask", note: local.note });
              setLocal({ note: "" });
            }}
          >
            Request
          </Button>
        </div>
      );

    return (
      <div>
        <CardHeader title={state.title} subtitle={state.when} />
        {strip}
        <div style={{ marginTop: 8 }}>
          {waiting.length && !isFull ? requestCard(waiting[0]!) : fullCard}
        </div>
        <div style={{ marginTop: 8 }}>{footer}</div>
        {confirmed.fullAt > 0 && running(confirmed.fullAt, 2400) !== null ? <Toast key={confirmed.fullAt}>{"Plan's full. See you there."}</Toast> : null}
      </div>
    );
  },
});

/** Every request except `id` is unchanged, in the same order. */
function sameExcept(a: Req[], b: Req[], id: string): boolean {
  if (a.length !== b.length) return false;
  return a.every((r) => r.id === id || same(r, b.find((x) => x.id === r.id)));
}
