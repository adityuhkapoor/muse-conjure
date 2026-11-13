import { defineApp, Avatar, Button, CardHeader, Facepile, Progress } from "@muse/app";

// Gift fund: who pledged, who sent, who holds the money, and whether the goal is reached.
// Anyone can pledge and record what they sent. Only the person holding the money confirms it.

const CHAT = {
  title: "Coach K retirement gift",
  deadline: "Last game on the 16th",
  items: [
    { label: "Signed team jersey frame", cents: 14000 },
    { label: "Card and engraving plate", cents: 2200 },
  ],
  collectors: ["Paige", "Jake"],
  gifts: [
    { name: "Bryan", pledge: 2500, sent: 0, holder: "", confirmed: false },
    { name: "Maya", pledge: 2000, sent: 2000, holder: "Jake", confirmed: true },
    { name: "Jake", pledge: 3000, sent: 3000, holder: "Jake", confirmed: true },
    { name: "Omar", pledge: 2500, sent: 0, holder: "", confirmed: false },
    { name: "Naomi", pledge: 1500, sent: 1500, holder: "Paige", confirmed: false },
    { name: "Paige", pledge: 3000, sent: 3000, holder: "Paige", confirmed: true },
  ],
};

type Gift = { id: string; from: string; holder: string; pledge: number; sent: number; confirmed: boolean };
type State = { goal: number; items: { label: string; cents: number }[]; deadline: string; gifts: Gift[]; collectors: string[] };
type Action =
  | { t: "pledge"; cents: number }
  | { t: "sent"; holder: string; cents: number }
  | { t: "confirm"; from: string }
  | { t: "unsend" };
type Local = { draft: string; holder: string };

const MAX_CENTS = 100000;
const isCents = (n: unknown, min: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= min && n <= MAX_CENTS;
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const rowOf = (s: State, u: string) => s.gifts.find((g) => g.from === u);
const othersSame = (p: State, n: State, u: string) =>
  JSON.stringify(p.gifts.filter((g) => g.from !== u)) === JSON.stringify(n.gifts.filter((g) => g.from !== u));
const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function parseCents(text: string): number | null {
  const m = /^\$?\s*(\d{1,4})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const c = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return c >= 1 && c <= MAX_CENTS ? c : null;
}

export default defineApp<State, Action, Local>({
  name: "Gift fund",
  summary: (s) => `${CHAT.title}: ${money(sum(s.gifts.map((g) => g.sent)))} of ${money(s.goal)} sent.`,

  init: (ctx) => {
    const idOf = (name: string) => ctx.members.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id;
    const first = ctx.members[0]?.id;
    const collectors = [...new Set(CHAT.collectors.map((n) => idOf(n) ?? first).filter((x): x is string => typeof x === "string"))];
    const gifts: Gift[] = [];
    for (const g of CHAT.gifts) {
      const from = idOf(g.name);
      if (!from || gifts.some((x) => x.from === from)) continue;
      const holder = idOf(g.holder) ?? "";
      const ok = g.sent > 0 && holder !== "" && collectors.includes(holder);
      gifts.push({ id: `c${gifts.length}`, from, holder: ok ? holder : "", pledge: g.pledge, sent: ok ? g.sent : 0, confirmed: ok && g.confirmed });
    }
    return { goal: sum(CHAT.items.map((i) => i.cents)), items: CHAT.items.map((i) => ({ ...i })), deadline: CHAT.deadline, gifts, collectors };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;
    const mine = rowOf(s, m.user);
    switch (a.t) {
      case "pledge": {
        if (!isCents(a.cents, 0)) return s;
        if (mine) {
          if (mine.pledge === a.cents) return s;
          return { ...s, gifts: s.gifts.map((g) => (g.from === m.user ? { ...g, pledge: a.cents } : g)) };
        }
        if (a.cents === 0) return s;
        return { ...s, gifts: [...s.gifts, { id: `g${m.seq}`, from: m.user, holder: "", pledge: a.cents, sent: 0, confirmed: false }] };
      }
      case "sent": {
        if (!isCents(a.cents, 1) || typeof a.holder !== "string" || !s.collectors.includes(a.holder)) return s;
        if (mine) {
          if (mine.sent === a.cents && mine.holder === a.holder) return s;
          return { ...s, gifts: s.gifts.map((g) => (g.from === m.user ? { ...g, sent: a.cents, holder: a.holder, confirmed: false } : g)) };
        }
        return { ...s, gifts: [...s.gifts, { id: `g${m.seq}`, from: m.user, holder: a.holder, pledge: a.cents, sent: a.cents, confirmed: false }] };
      }
      case "confirm": {
        if (typeof a.from !== "string") return s;
        const row = rowOf(s, a.from);
        if (!row || row.holder !== m.user || row.sent <= 0 || row.confirmed) return s;
        return { ...s, gifts: s.gifts.map((g) => (g.from === a.from ? { ...g, confirmed: true } : g)) };
      }
      case "unsend": {
        if (!mine || mine.sent <= 0) return s;
        return { ...s, gifts: s.gifts.map((g) => (g.from === m.user ? { ...g, sent: 0, holder: "", confirmed: false } : g)) };
      }
    }
    return s;
  },

  // Someone left: their row goes. If a holder left, money sent to them is no longer counted as sent.
  onMembers: (s, ctx) => {
    let collectors = s.collectors.filter((c) => inChat(ctx, c));
    const firstId = ctx.members[0]?.id;
    if (collectors.length === 0 && firstId !== undefined) collectors = [firstId];
    const gifts = s.gifts
      .filter((g) => inChat(ctx, g.from))
      .map((g) => (g.holder !== "" && !collectors.includes(g.holder) ? { ...g, holder: "", sent: 0, confirmed: false } : g));
    if (collectors.join() === s.collectors.join() && gifts.length === s.gifts.length && gifts.every((g, i) => g === s.gifts[i])) return s;
    return { ...s, collectors, gifts };
  },

  invariants: {
    "each person has one row": (s) => new Set(s.gifts.map((g) => g.from)).size === s.gifts.length && new Set(s.gifts.map((g) => g.id)).size === s.gifts.length,
    "givers, holders and collectors are in the chat": (s, ctx) =>
      s.collectors.every((c) => inChat(ctx, c)) &&
      s.gifts.every((g) => inChat(ctx, g.from) && (g.holder === "" || (inChat(ctx, g.holder) && s.collectors.includes(g.holder)))),
    "pledges and sent amounts are whole cents up to 1000 dollars": (s) =>
      s.gifts.every((g) => isCents(g.pledge, 0) && isCents(g.sent, 0)),
    "sent money has a holder, unsent money has none and is not confirmed": (s) =>
      s.gifts.every((g) => (g.sent > 0 ? g.holder !== "" : g.holder === "" && !g.confirmed)),
    "the goal is the items added up": (s) => s.goal === sum(s.items.map((i) => i.cents)),
    "someone can hold money whenever anyone is in the chat": (s, ctx) =>
      new Set(s.collectors).size === s.collectors.length && (ctx.members.length === 0 || s.collectors.length > 0),
  },

  transitions: {
    "a pledge changes only the actor's own pledge": (p, n, a, m) =>
      a.t !== "pledge" ||
      p === n ||
      (othersSame(p, n, m.user) && rowOf(n, m.user)?.pledge === a.cents && (rowOf(n, m.user)?.sent ?? 0) === (rowOf(p, m.user)?.sent ?? 0)),
    "a sent sets the actor's own amount and holder, unconfirmed": (p, n, a, m) => {
      if (a.t !== "sent" || p === n) return true;
      const r = rowOf(n, m.user);
      return othersSame(p, n, m.user) && r !== undefined && r.sent === a.cents && r.holder === a.holder && !r.confirmed;
    },
    "only the holder confirms, and only that row flips": (p, n, a, m) => {
      if (a.t !== "confirm" || p === n) return true;
      const rp = rowOf(p, a.from);
      const rn = rowOf(n, a.from);
      return (
        rp !== undefined && rn !== undefined && rp.holder === m.user && !rp.confirmed && rn.confirmed &&
        rn.sent === rp.sent && rn.holder === rp.holder && rn.pledge === rp.pledge && othersSame(p, n, a.from)
      );
    },
    "an unsend clears only the actor's own sent money": (p, n, a, m) => {
      if (a.t !== "unsend" || p === n) return true;
      const rp = rowOf(p, m.user);
      const rn = rowOf(n, m.user);
      return rp !== undefined && rn !== undefined && rp.sent > 0 && rn.sent === 0 && rn.holder === "" && !rn.confirmed && rn.pledge === rp.pledge && othersSame(p, n, m.user);
    },
    "the goal, items and holders never change through actions": (p, n) =>
      p.goal === n.goal && JSON.stringify(p.items) === JSON.stringify(n.items) && p.collectors.join() === n.collectors.join(),
    "only people in the chat change anything": (p, n, a, m, ctx) => p === n || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const mine = rowOf(s, user);
    const toConfirm = s.gifts.filter((g) => g.holder === user && g.sent > 0 && !g.confirmed);
    const k = r.next();
    if (toConfirm.length > 0 && k < 0.5) return { t: "confirm", from: r.pick(toConfirm).from };
    if (mine && mine.sent > 0 && k < 0.15) return { t: "unsend" };
    if (s.collectors.length > 0 && k < 0.65) return { t: "sent", holder: r.pick(s.collectors), cents: (r.int(10) + 1) * 500 };
    if (k < 0.9) return { t: "pledge", cents: (r.int(10) + 1) * 500 };
    const bad: Action[] = [
      { t: "pledge", cents: -5 },
      { t: "sent", holder: "nobody", cents: 500 },
      { t: "confirm", from: "nobody" },
    ];
    return r.pick(bad);
  },

  local: { draft: "", holder: "" },

  view: ({ state, me, members, dispatch, local, setLocal, theme }) => {
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const sent = sum(state.gifts.map((g) => g.sent));
    const confirmedTotal = sum(state.gifts.filter((g) => g.confirmed).map((g) => g.sent));
    const mine = rowOf(state, me);
    const frame = state.items[0]?.cents ?? state.goal;

    const chosen = state.collectors.includes(local.holder) ? local.holder : state.collectors.length === 1 ? (state.collectors[0] ?? "") : "";
    const parsed = parseCents(local.draft);
    const amountSend = parsed ?? (mine && mine.pledge > 0 ? mine.pledge : null);
    const canSend = amountSend !== null && chosen !== "" && !(mine && mine.sent === amountSend && mine.holder === chosen);
    const canPledge = parsed !== null && parsed !== mine?.pledge;
    const waiting = state.gifts.filter((g) => g.holder === me && g.sent > 0 && !g.confirmed);

    const pend = state.gifts.filter((g) => g.sent === 0 && g.pledge > 0).map((g) => `${nameOf(g.from)} ${money(g.pledge)}`);
    const quiet = members.filter((m) => !rowOf(state, m.id)).map((m) => nameOf(m.id));

    const status = !mine
      ? "No pledge from you yet"
      : mine.sent === 0
        ? `You pledged ${money(mine.pledge)} · not sent`
        : `You sent ${money(mine.sent)} to ${mine.holder === me ? "yourself" : nameOf(mine.holder)} · ${mine.confirmed ? "confirmed" : "not confirmed yet"}`;

    return (
      <div style={{ display: "grid", gap: 6 }}>
        <CardHeader title={CHAT.title} subtitle={`${money(sent)} of ${money(state.goal)} sent`} />
        <Progress
          value={Math.min(sent, state.goal)}
          max={Math.max(1, state.goal)}
          label={`${money(sent)} of ${money(state.goal)} sent · ${money(confirmedTotal)} confirmed`}
        />
        <div>
          <small style={{ display: "block" }}>
            {sent >= state.goal ? `Goal reached · ${money(confirmedTotal)} confirmed` : `${money(state.goal - sent)} to go · ${money(confirmedTotal)} confirmed`}
          </small>
          <small style={{ display: "block" }}>{`Frame ${money(frame)} · ${state.deadline}`}</small>
        </div>
        <div style={{ display: "grid", gap: 2 }}>
          {state.collectors.map((c) => {
            const held = state.gifts.filter((g) => g.holder === c && g.sent > 0);
            const total = sum(held.map((g) => g.sent));
            const sel = chosen === c;
            const unconf = held.filter((g) => !g.confirmed);
            return (
              <div
                key={c}
                onClick={() => setLocal({ holder: c })}
                style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 8px", borderRadius: theme.radius.input, background: sel ? theme.color.selected : theme.color.card }}
              >
                <Avatar user={c} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{nameOf(c)}</div>
                  <small>{`${money(total)} held${sel ? " · selected" : ""}`}</small>
                </div>
                {held.length > 0 ? <Facepile users={held.map((g) => g.from)} max={3} size={20} /> : null}
                {c === me && unconf.length > 0 ? (
                  <Button kind="primary" onClick={() => unconf.forEach((g) => dispatch({ t: "confirm", from: g.from }))}>
                    Confirm
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        {pend.length > 0 ? <small>{`Not sent yet: ${pend.join(", ")}`}</small> : null}
        {quiet.length > 0 ? <small>{`No pledge: ${quiet.join(", ")}`}</small> : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
          <small style={{ flex: 1, minWidth: 0 }}>{status}</small>
          {mine && mine.sent > 0 ? (
            <Button kind="deemphasized" onClick={() => dispatch({ t: "unsend" })}>
              Undo
            </Button>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            style={{ flex: 1, minWidth: 0 }}
            value={local.draft}
            inputMode="decimal"
            placeholder="Amount, e.g. 25"
            aria-label="Amount in dollars"
            onInput={(e) => setLocal({ draft: e.currentTarget.value })}
          />
          <Button
            kind="secondary"
            disabled={!canPledge}
            onClick={() => {
              if (parsed === null) return;
              dispatch({ t: "pledge", cents: parsed });
              setLocal({ draft: "" });
            }}
          >
            Pledge
          </Button>
          <Button
            kind={waiting.length > 0 ? "secondary" : "primary"}
            disabled={!canSend}
            onClick={() => {
              if (amountSend === null || chosen === "") return;
              dispatch({ t: "sent", holder: chosen, cents: amountSend });
              setLocal({ draft: "" });
            }}
          >
            I sent
          </Button>
        </div>
      </div>
    );
  },
});
