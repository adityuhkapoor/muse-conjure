import { defineApp, Button, CardHeader, Facepile, SystemLine, rng, running, tween, type Theme } from "@muse/app";

// Places: the four dinner spots from the chat as tiles with drawn thumbnails, each with its price,
// how far it is and who suggested it. Tap every place you'd go to (Zoe said "ramen or dumplings",
// so more than one is fine). Zoe asked, so Zoe picks: the place with the most people wins; a tie
// is broken by the server's seed. The picked tile turns blue with the time, the rest fade back.
// Votes people already gave in the chat start filled in.

// Everything here comes from the chat.
const CHAT = {
  title: "Dinner after finals",
  when: "Fri 7:30",
  host: "Zoe",
  places: [
    { id: "koji", name: "Menya Koji", price: "$16", far: "10 min walk", by: "Arjun", note: "", art: "ramen", fans: ["Arjun", "Zoe"] },
    { id: "palma", name: "Tacos La Palma", price: "$11", far: "by the dorms", by: "Bea", note: "", art: "tacos", fans: ["Bea"] },
    { id: "notte", name: "Bella Notte", price: "$28", far: "15 min drive", by: "Caleb", note: "No walk-ins Fri", art: "plate", fans: ["Caleb"] },
    { id: "golden", name: "Golden Dumpling House", price: "$14", far: "0.8 mi", by: "Wes", note: "", art: "dumplings", fans: ["Wes", "Zoe"] },
  ],
} as const;

type Place = { id: string; votes: string[] };
type State = { places: Place[]; host: string; picked: string | null; pickedAt: number };
type Action = { t: "vote"; place: string } | { t: "pick" } | { t: "reopen" };
type Local = Record<string, never>;
type Ctx = { members: { id: string; name: string }[] };

const IDS: string[] = CHAT.places.map((p) => p.id);
const PICK_MS = 600;
const settle = tween({ duration: PICK_MS, easing: "decelerate" });
const inChat = (ctx: Ctx, id: string) => ctx.members.some((m) => m.id === id);

// ---- Check helpers ----
const top = (s: State) => Math.max(0, ...s.places.map((p) => p.votes.length));
const leaders = (s: State) => (top(s) > 0 ? s.places.filter((p) => p.votes.length === top(s)).map((p) => p.id) : []);
const votesOf = (s: State, u: string) => s.places.filter((p) => p.votes.includes(u)).map((p) => p.id).join();
const othersVotes = (s: State, u: string) => JSON.stringify(s.places.map((p) => p.votes.filter((v) => v !== u)));

function reducePlaces(s: State, a: Record<string, unknown>, user: string, meta: { time: number; seed: number }): State {
  if (a.t === "vote") {
    if (s.picked !== null || typeof a.place !== "string" || !s.places.some((p) => p.id === a.place)) return s;
    return { ...s, places: s.places.map((p) => (p.id !== a.place ? p : { ...p, votes: p.votes.includes(user) ? p.votes.filter((v) => v !== user) : [...p.votes, user] })) };
  }
  if (a.t === "pick") {
    if (s.picked !== null || user !== s.host) return s;
    const most = Math.max(0, ...s.places.map((p) => p.votes.length));
    if (most === 0) return s;
    const tied = s.places.filter((p) => p.votes.length === most);
    return { ...s, picked: tied.length === 1 ? tied[0]!.id : rng(meta.seed).pick(tied).id, pickedAt: meta.time };
  }
  if (a.t === "reopen") {
    if (s.picked === null || user !== s.host) return s;
    return { ...s, picked: null, pickedAt: 0 };
  }
  return s;
}

// ---- Thumbnails, drawn from theme colors only ----
function Thumb({ art, theme }: { art: string; theme: Theme }) {
  const c = theme.color;
  const body =
    art === "ramen" ? (
      <g>
        <line x1="52" y1="6" x2="86" y2="30" stroke={c.secondaryText} stroke-width="2.5" stroke-linecap="round" />
        <line x1="60" y1="4" x2="90" y2="28" stroke={c.secondaryText} stroke-width="2.5" stroke-linecap="round" />
        <path d="M36 30h48a24 22 0 0 1-48 0z" fill={c.series5} />
        <path d="M40 30q4-6 8 0t8 0 8 0 8 0 8 0" fill="none" stroke={c.series2} stroke-width="3" stroke-linecap="round" />
        <circle cx="70" cy="26" r="6" fill={c.card} />
        <circle cx="70" cy="26" r="3" fill={c.series2} />
        <rect x="46" y="20" width="10" height="8" rx="1.5" fill={c.series3} transform="rotate(-12 51 24)" />
      </g>
    ) : art === "tacos" ? (
      <g>
        {[0, 1].map((k) => (
          <g key={k} transform={`translate(${k * 30 - 15} ${k * 4})`}>
            <path d="M40 46a20 20 0 0 1 40 0z" fill={c.series2} />
            {[0.2, 0.38, 0.56, 0.74].map((f, i) => (
              <circle key={i} cx={60 - Math.cos(f * Math.PI) * 18} cy={46 - Math.sin(f * Math.PI) * 18} r={i % 2 ? 3 : 4} fill={i % 2 ? c.series4 : c.series3} />
            ))}
          </g>
        ))}
      </g>
    ) : art === "plate" ? (
      <g>
        <circle cx="60" cy="32" r="22" fill={c.card} stroke={c.divider} stroke-width="1" />
        <circle cx="60" cy="32" r="14" fill="none" stroke={c.divider} stroke-width="1" />
        <path d="M28 14v10m-3-10v7a3 3 0 0 0 6 0v-7M28 24v26" fill="none" stroke={c.secondaryText} stroke-width="2" stroke-linecap="round" />
        <path d="M92 14c4 3 4 12 0 16v20" fill="none" stroke={c.secondaryText} stroke-width="2.5" stroke-linecap="round" />
      </g>
    ) : (
      <g>
        <rect x="28" y="36" width="64" height="16" rx="4" fill={c.series5} />
        <line x1="28" y1="44" x2="92" y2="44" stroke={c.card} stroke-width="1" opacity="0.5" />
        {[38, 60, 82].map((x, i) => (
          <g key={i}>
            <path d={`M${x - 11} 36a11 10 0 0 1 22 0z`} fill={c.card} stroke={c.secondaryText} stroke-width="1" />
            <path d={`M${x - 4} 29l2 4m2-5v5m2-4-2 4`} fill="none" stroke={c.secondaryText} stroke-width="1" stroke-linecap="round" />
          </g>
        ))}
      </g>
    );
  return (
    <svg width="100%" height="60" viewBox="0 0 120 56" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{ display: "block" }}>
      {body}
    </svg>
  );
}

export default defineApp<State, Action, Local>({
  name: "Places",
  summary: (s) => {
    const p = s.picked ? CHAT.places.find((x) => x.id === s.picked) : null;
    return p ? `${CHAT.title}: ${p.name} · ${CHAT.when}` : `${CHAT.title} · ${CHAT.places.length} places · ${new Set(s.places.flatMap((x) => x.votes)).size} have voted`;
  },

  // Votes from the chat are matched by name; init reruns with the member list until the first tap.
  init: (ctx) => {
    const idOf = (name: string) => ctx.members.find((m) => m.name.trim().toLowerCase() === name.toLowerCase())?.id;
    return {
      places: CHAT.places.map((p) => ({ id: p.id, votes: [...new Set(p.fans.map(idOf).filter((u): u is string => !!u))] })),
      host: idOf(CHAT.host) ?? ctx.members[0]?.id ?? "",
      picked: null,
      pickedAt: 0,
    };
  },

  reduce: (state, action, meta, ctx) => (inChat(ctx, meta.user) ? reducePlaces(state, action as unknown as Record<string, unknown>, meta.user, meta) : state),

  // Someone left: their votes go. If Zoe left, the first person in the chat picks. A pick stays.
  onMembers: (state, ctx) => {
    const host = inChat(ctx, state.host) ? state.host : (ctx.members[0]?.id ?? "");
    const stale = state.places.some((p) => p.votes.some((v) => !inChat(ctx, v)));
    if (!stale && host === state.host) return state;
    return { ...state, host, places: stale ? state.places.map((p) => ({ ...p, votes: p.votes.filter((v) => inChat(ctx, v)) })) : state.places };
  },

  invariants: {
    "the four places from the chat stay, in order": (s) => s.places.length === IDS.length && s.places.every((p, i) => p.id === IDS[i]),
    "nobody votes twice for a place": (s) => s.places.every((p) => new Set(p.votes).size === p.votes.length),
    "voters are in the chat": (s, ctx) => s.places.every((p) => p.votes.every((v) => inChat(ctx, v))),
    "the host is in the chat": (s, ctx) => (ctx.members.length === 0 ? true : inChat(ctx, s.host)),
    "picked exactly when there is a pick time": (s) => (s.picked === null) === (s.pickedAt === 0) && (s.picked === null || IDS.includes(s.picked)),
  },

  transitions: {
    "a vote flips the actor on that place and nothing else": (p, n, a, m) => {
      if (a.t !== "vote" || p === n) return true;
      const before = p.places.find((x) => x.id === a.place);
      const after = n.places.find((x) => x.id === a.place);
      return p.picked === null && !!before && !!after && before.votes.includes(m.user) !== after.votes.includes(m.user) && othersVotes(p, m.user) === othersVotes(n, m.user) && votesOf(p, m.user).split(",").filter((x) => x && x !== a.place).join() === votesOf(n, m.user).split(",").filter((x) => x && x !== a.place).join() && n.picked === null;
    },
    "a vote is never refused while the pick is open": (p, n, a, m, ctx) => a.t !== "vote" || !inChat(ctx, m.user) || p.picked !== null || !IDS.includes(a.place) || p !== n,
    "only the host picks, a place with the most votes, by the seed on a tie": (p, n, a, m) => {
      if (a.t !== "pick" || p === n) return true;
      const lead = leaders(p);
      const want = lead.length === 1 ? lead[0] : lead.length ? rng(m.seed).pick(lead) : null;
      return m.user === p.host && p.picked === null && n.picked === want && n.pickedAt === m.time && JSON.stringify(p.places) === JSON.stringify(n.places);
    },
    "the host can always pick once someone voted": (p, n, a, m, ctx) => a.t !== "pick" || m.user !== p.host || !inChat(ctx, m.user) || p.picked !== null || top(p) === 0 || n.picked !== null,
    "only the host reopens": (p, n, a, m) => a.t !== "reopen" || p === n || (m.user === p.host && p.picked !== null && n.picked === null && JSON.stringify(p.places) === JSON.stringify(n.places)),
    "votes hold still once a place is picked": (p, n) => p.picked === null || n.picked === null || JSON.stringify(p.places) === JSON.stringify(n.places),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    if (s.picked !== null) return user === s.host && k < 0.5 ? { t: "reopen" } : { t: "vote", place: r.pick(IDS) };
    if (user === s.host && k < 0.12) return { t: "pick" };
    return { t: "vote", place: r.pick(IDS) };
  },

  local: {},

  view: ({ state, confirmed, pending, me, members, dispatch, theme }) => {
    const c = theme.color;
    // A pick can come from the seed, so it is shown from `confirmed`; my own pick shows "Picking" until it lands.
    const picking = pending && state.picked !== null && confirmed.picked === null;
    const picked = picking ? null : confirmed.picked;
    const pickedAt = confirmed.pickedAt;
    const e = picked ? running(pickedAt, PICK_MS) : null;
    const k = picked ? (e === null ? 1 : settle(e)) : 0;
    const most = top(state);
    const isHost = me === state.host;
    const hostName = members.find((m) => m.id === state.host)?.name ?? "The host";
    const voted = new Set(state.places.flatMap((p) => p.votes)).size;
    const lead = leaders(state);
    const won = picked ? CHAT.places.find((p) => p.id === picked) : null;
    const wonVotes = picked ? (confirmed.places.find((p) => p.id === picked)?.votes ?? []) : [];

    return (
      <div>
        <CardHeader title={CHAT.title} subtitle={won ? `${won.name} · ${CHAT.when}` : `${CHAT.when} · tap every place you'd go`} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
          {CHAT.places.map((info) => {
            const p = state.places.find((x) => x.id === info.id)!;
            const mine = p.votes.includes(me);
            const win = picked === info.id;
            const faded = !!picked && !win;
            const leading = !picked && most > 0 && p.votes.length === most;
            return (
              <button
                key={info.id}
                type="button"
                aria-pressed={mine}
                aria-label={`${info.name}, ${p.votes.length} going`}
                disabled={!!picked || picking}
                onClick={() => dispatch({ t: "vote", place: info.id })}
                style={{
                  position: "relative",
                  minWidth: 0,
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr)",
                  alignContent: "start",
                  gap: 2,
                  padding: 6,
                  textAlign: "left",
                  borderRadius: theme.radius.card,
                  background: win || (!picked && mine) ? c.selected : c.card,
                  boxShadow: win ? `inset 0 0 0 ${k.toFixed(2)}px ${c.primary}` : `inset 0 0 0 1px ${c.divider}`,
                  opacity: faded ? 1 - 0.5 * k : 1,
                  cursor: picked ? "default" : "pointer",
                }}
              >
                <div style={{ position: "relative", borderRadius: 8, background: c.wash, overflow: "hidden" }}>
                  <Thumb art={info.art} theme={theme} />
                  {mine || win ? (
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={{ position: "absolute", right: 4, top: 4 }}>
                      <circle cx="10" cy="10" r="10" fill={c.primary} />
                      <path d="M5.5 10.3 8.6 13.2 14.5 7" fill="none" stroke={c.onPrimary} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  ) : null}
                </div>
                <b style={{ display: "block", paddingTop: 2, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.name}</b>
                <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`${info.price} · ${info.far}`}</small>
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, minHeight: 20 }}>
                  <small style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: win ? c.link : c.secondaryText, fontWeight: win ? 600 : 400 }}>{win ? `Picked · ${CHAT.when}` : info.note || `${info.by}'s idea`}</small>
                  {p.votes.length ? <Facepile users={p.votes} max={2} size={20} /> : null}
                  <small style={{ flex: "none", fontWeight: 600, color: win || leading ? c.link : c.secondaryText }}>{p.votes.length}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, minHeight: 44 }}>
          <div style={{ flex: 1, minWidth: 0, display: "grid" }}>
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {picking ? "Picking" : won ? `${wonVotes.length} going to ${won.name}` : lead.length > 1 ? `${lead.length} places tied at ${most}` : lead.length ? `${CHAT.places.find((x) => x.id === lead[0])!.name} leads` : "No votes yet"}
            </span>
            <small style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {won ? `Picked by ${state.host === me ? "you" : hostName}` : `${voted} of ${members.length} voted · ${isHost ? "you pick" : `${hostName} picks`}${lead.length > 1 ? " · a tie is drawn" : ""}`}
            </small>
          </div>
          {isHost ? (
            won ? (
              <Button onClick={() => dispatch({ t: "reopen" })}>Reopen</Button>
            ) : (
              <Button kind="primary" disabled={most === 0 || picking} onClick={() => dispatch({ t: "pick" })}>
                Pick
              </Button>
            )
          ) : null}
        </div>
        {won && e === null && won.note ? <SystemLine>{won.note}</SystemLine> : null}
      </div>
    );
  },
});
