import {
  defineApp,
  Avatar,
  Button,
  Burst,
  CardHeader,
  Changed,
  Chip,
  Locked,
  More,
  Placed,
  Scene,
  Summary,
  Toast,
  at,
  circle,
  haptic,
  h,
  innerWidth,
  line,
  mix,
  pal,
  path,
  rect,
  running,
  userColor,
  type Child,
  type Theme,
} from "@muse/app";

// Group ticket buy: the friends pick a tier, see themselves in the seats, one fronts the money,
// and they buy as a block. Afterwards everyone marks their share sent. Money is integer cents.

type Kind = "lawn" | "rows" | "pit";
type Params = {
  venue: string;
  date: string;
  tiers: { name: string; kind: Kind; priceCents: number; feeCents: number; left: number; together: string; row?: string }[];
  tier: number;
  people: string[];
  payer: string;
};
type Tier = { name: string; kind: Kind; price: number; fee: number; left: number; together: string; row: string };
type Bought = { at: number; tier: number; people: string[]; payer: string; each: number; total: number };
type State = {
  venue: string;
  date: string;
  tiers: Tier[];
  tier: number;
  tierAt: number;
  inn: string[];
  payer: string | null;
  bought: Bought | null;
  sent: string[];
};
type Action = { t: "tier"; i: number } | { t: "toggle" } | { t: "front" } | { t: "buy" } | { t: "sent" };
type Local = { burst: number };

// @params
const P: Params = {
  venue: "Greek Theatre",
  date: "Sat, Oct 4",
  tiers: [
    { name: "Lawn GA", kind: "lawn", priceCents: 6800, feeCents: 1125, left: 212, together: "Blanket together · sit anywhere" },
    { name: "Reserved", kind: "rows", priceCents: 9600, feeCents: 1450, left: 40, together: "Row K · seats side by side", row: "K" },
    { name: "Pit", kind: "pit", priceCents: 13900, feeCents: 1875, left: 9, together: "Standing · at the rail" },
  ],
  tier: 1,
  people: ["Maya", "Theo", "Dev", "Noa", "Priya"],
  payer: "Theo",
};
// @end params

const GAP = 5;
const MAX_TIERS = 3;
const FALLBACK: Tier = { name: "General", kind: "rows", price: 5000, fee: 0, left: 99, together: "Seats together", row: "A" };

const money = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const inChat = (ctx: { members: { id: string }[] }, id: string) => ctx.members.some((m) => m.id === id);
const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" ? Math.floor(v) : NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

/** Clean the params into the tiers init keeps forever. */
function makeTiers(): Tier[] {
  const out = P.tiers.slice(0, MAX_TIERS).map((t, i) => {
    const kind: Kind = t.kind === "lawn" || t.kind === "pit" ? t.kind : "rows";
    return {
      name: String(t.name ?? "").trim().slice(0, 24) || `Tier ${i + 1}`,
      kind,
      price: clampInt(t.priceCents, 0, 100_000, 0),
      fee: clampInt(t.feeCents, 0, 100_000, 0),
      left: Number.isInteger(t.left) ? Math.max(1, Math.min(9999, t.left)) : 99,
      together: String(t.together ?? "").trim().slice(0, 40) || "Seats together",
      row: String(t.row ?? "").trim().slice(0, 4) || "K",
    };
  });
  return out.length ? out : [FALLBACK];
}

/** Match a name or id in the chat to a member id. */
function matchMember(members: { id: string; name: string }[], who: string): string | undefined {
  const want = who.trim().toLowerCase();
  if (!want) return undefined;
  return members.find((m) => m.id === who || m.name.toLowerCase() === want)?.id;
}

export default defineApp<State, Action, Local>({
  name: "Group ticket buy",
  summary: (s, ctx) => {
    const person = (id: string | null) => (id ? (ctx.members.find((m) => m.id === id)?.name ?? "Someone") : "Somebody");
    const tier = s.tiers[s.tier] ?? s.tiers[0] ?? FALLBACK;
    const n = s.inn.length;
    if (s.bought) {
      const b = s.bought;
      return `${person(b.payer)} is buying ${b.people.length} ${tier.name} tickets · ${s.sent.length} of ${b.people.length - 1} sent`;
    }
    if (!n) return `${s.venue}: pick a tier and get in`;
    return `${s.venue}: ${n} in for ${tier.name} · ${money(tier.price + tier.fee)} each`;
  },

  init: (ctx) => {
    const tiers = makeTiers();
    const tier = clampInt(P.tier, 0, tiers.length - 1, 0);
    const used = new Set<string>();
    const inn: string[] = [];
    for (const who of P.people) {
      if (typeof who !== "string") continue;
      const id = matchMember(ctx.members, who);
      if (!id || used.has(id)) continue;
      used.add(id);
      inn.push(id);
    }
    const capped = inn.slice(0, tiers[tier]!.left);
    const payerName = typeof P.payer === "string" ? P.payer.trim() : "";
    const payer = (payerName ? matchMember(ctx.members, payerName) : undefined) ?? null;
    return {
      venue: String(P.venue ?? "").trim().slice(0, 60) || "The venue",
      date: String(P.date ?? "").trim().slice(0, 40) || "Tonight",
      tiers,
      tier,
      tierAt: 0,
      inn: capped,
      payer: payer && capped.includes(payer) ? payer : (capped[0] ?? null),
      bought: null,
      sent: [],
    };
  },

  reduce: (s, a, m, ctx) => {
    if (!inChat(ctx, m.user)) return s;

    if (a.t === "tier") {
      const i = a.i;
      if (s.bought || !Number.isInteger(i) || i < 0 || i >= s.tiers.length || i === s.tier) return s;
      if (s.inn.length > s.tiers[i]!.left) return s;
      return { ...s, tier: i, tierAt: m.time };
    }

    if (a.t === "toggle") {
      if (s.bought) return s;
      if (s.inn.includes(m.user)) {
        const inn = s.inn.filter((u) => u !== m.user);
        const payer = s.payer === m.user ? (inn[0] ?? null) : s.payer;
        return { ...s, inn, payer };
      }
      if (s.inn.length >= s.tiers[s.tier]!.left) return s;
      const inn = [...s.inn, m.user];
      return { ...s, inn, payer: s.payer ?? m.user };
    }

    if (a.t === "front") {
      if (s.bought || !s.inn.includes(m.user) || s.payer === m.user) return s;
      return { ...s, payer: m.user };
    }

    if (a.t === "buy") {
      if (s.bought || s.payer !== m.user || !s.inn.length) return s;
      const tier = s.tiers[s.tier]!;
      const each = tier.price + tier.fee;
      const bought: Bought = { at: m.time, tier: s.tier, people: [...s.inn], payer: m.user, each, total: each * s.inn.length };
      return { ...s, bought };
    }

    if (a.t === "sent") {
      const b = s.bought;
      if (!b || !b.people.includes(m.user) || m.user === b.payer || s.sent.includes(m.user)) return s;
      return { ...s, sent: [...s.sent, m.user] };
    }

    return s;
  },

  onMembers: (s, ctx) => {
    if (s.bought) return s;
    const inn = s.inn.filter((u) => inChat(ctx, u));
    if (inn.length === s.inn.length) return s;
    return { ...s, inn, payer: s.payer && inn.includes(s.payer) ? s.payer : (inn[0] ?? null) };
  },

  invariants: {
    "tier is a valid index": (s) => Number.isInteger(s.tier) && s.tier >= 0 && s.tier < s.tiers.length && s.tiers.length >= 1 && s.tiers.length <= MAX_TIERS,
    "no one is in twice": (s) => new Set(s.inn).size === s.inn.length,
    "before buying, everyone in is in the chat": (s, ctx) => s.bought !== null || s.inn.every((u) => inChat(ctx, u)),
    "payer is one of the people in": (s) => (s.payer === null) === (s.inn.length === 0) && (s.payer === null || s.inn.includes(s.payer)),
    "the group fits the seats left": (s) => !!s.tiers[s.tier] && s.inn.length <= s.tiers[s.tier]!.left,
    "a purchase adds up": (s) => {
      const b = s.bought;
      if (!b) return true;
      const t = s.tiers[b.tier];
      return !!t && b.each === t.price + t.fee && b.total === b.each * b.people.length && b.people.includes(b.payer);
    },
    "a purchase matches the group": (s) => {
      const b = s.bought;
      return !b || (same(b.people, s.inn) && b.tier === s.tier && b.payer === s.payer);
    },
    "only people who owe mark sent": (s) => {
      const b = s.bought;
      return (
        (b ? s.sent.every((u) => b.people.includes(u) && u !== b.payer) : s.sent.length === 0) &&
        new Set(s.sent).size === s.sent.length
      );
    },
  },

  transitions: {
    "a tier change moves only the tier": (p, n, a, m) =>
      a.t !== "tier" ||
      p === n ||
      (p.bought === null &&
        n.tier === a.i &&
        n.tierAt === m.time &&
        same(p.inn, n.inn) &&
        p.payer === n.payer),
    "toggle moves only the actor": (p, n, a, m) =>
      a.t !== "toggle" ||
      p === n ||
      (p.bought === null &&
        same(p.inn.filter((u) => u !== m.user), n.inn.filter((u) => u !== m.user)) &&
        p.inn.includes(m.user) !== n.inn.includes(m.user) &&
        (n.inn.includes(m.user) ? n.inn.at(-1) === m.user : true) &&
        n.tier === p.tier),
    "the payer hands over when they leave": (p, n, a, m) =>
      a.t !== "toggle" ||
      p === n ||
      n.payer ===
        (p.payer === m.user && !n.inn.includes(m.user) ? (n.inn[0] ?? null) : p.payer === null ? (n.inn.includes(m.user) ? m.user : null) : p.payer),
    "fronting makes the actor the payer": (p, n, a, m) =>
      a.t !== "front" || p === n || (p.inn.includes(m.user) && n.payer === m.user && same(p.inn, n.inn) && p.tier === n.tier),
    "only the payer buys, once, as the group stands": (p, n, a, m) =>
      a.t !== "buy" ||
      p === n ||
      (p.bought === null &&
        p.payer === m.user &&
        n.bought?.at === m.time &&
        same(n.bought.people, p.inn) &&
        n.bought.tier === p.tier),
    "sent adds the actor only": (p, n, a, m) =>
      a.t !== "sent" ||
      p === n ||
      (n.sent.length === p.sent.length + 1 && n.sent.at(-1) === m.user && p.bought !== null && p.bought.payer !== m.user),
    "a purchase never changes": (p, n) => p.bought === null || JSON.stringify(p.bought) === JSON.stringify(n.bought),
    "only people in the chat change anything": (p, n, _a, m, ctx) => JSON.stringify(p) === JSON.stringify(n) || inChat(ctx, m.user),
  },

  arbitrary: (s, user, r) => {
    const k = r.next();
    const n = s.tiers.length;
    if (s.bought) return { t: "sent" };
    if (!s.inn.includes(user)) return k < 0.2 ? { t: "tier", i: r.int(n) } : { t: "toggle" };
    if (user === s.payer) {
      return k < 0.06 ? { t: "buy" } : k < 0.5 ? { t: "tier", i: r.int(n) } : k < 0.75 ? { t: "toggle" } : { t: "front" };
    }
    return k < 0.35 ? { t: "front" } : k < 0.65 ? { t: "tier", i: r.int(n) } : { t: "toggle" };
  },

  local: { burst: 0 },

  view: ({ state, confirmed, me, members, dispatch, theme, local, setLocal }) => {
    const W = innerWidth();
    const n = state.inn.length;
    const tier = state.tiers[state.tier] ?? state.tiers[0] ?? FALLBACK;
    const each = tier.price + tier.fee;
    const total = each * n;
    const bought = state.bought;
    const iAmIn = state.inn.includes(me);
    const iAmPayer = state.payer === me;
    const nameOf = (id: string) => (id === me ? "You" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const lowerName = (id: string) => (id === me ? "you" : (members.find((m) => m.id === id)?.name ?? "Someone"));
    const payer = state.payer;
    const owe = !payer ? "Nobody's in yet" : payer === me ? "You front it" : iAmIn ? `You owe ${nameOf(payer)}` : `${nameOf(payer)} fronts it`;

    // ---- tiers
    const canPick = (i: number) => !bought && n <= state.tiers[i]!.left;
    const tierCard = (t: Tier, i: number) => {
      const selected = state.tier === i;
      const low = t.left <= 10;
      return (
        <button
          key={`tier-${i}`}
          type="button"
          aria-pressed={selected}
          aria-disabled={!canPick(i)}
          aria-label={`${t.name}, ${money(t.price)}, ${t.left} left`}
          onClick={() => {
            if (canPick(i)) dispatch({ t: "tier", i });
          }}
          style={{
            position: "relative",
            height: 66,
            padding: "6px 10px",
            borderRadius: 12,
            border: 0,
            textAlign: "left",
            background: selected ? theme.color.selected : theme.color.input,
            boxShadow: selected ? `inset 0 0 0 1.5px ${theme.color.primary}` : undefined,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            justifyContent: "flex-start",
            minWidth: 0,
            overflow: "visible",
            cursor: canPick(i) ? "pointer" : "default",
          }}
        >
          <div style={{ flexShrink: 0, fontSize: 13, lineHeight: "16px", fontWeight: 600, color: theme.color.secondaryText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: selected ? 18 : 0 }}>{t.name}</div>
          <div style={{ flexShrink: 0, fontSize: 20, lineHeight: "24px", fontWeight: 700, color: theme.color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{money(t.price)}</div>
          <div style={{ flexShrink: 0, minHeight: 16, display: "flex", alignItems: "center" }}>
            {low ? (
              <Chip tone="negative" style={{ height: 16, padding: "0 7px", lineHeight: "16px" }}>
                {`${t.left} left`}
              </Chip>
            ) : (
              <span style={{ fontSize: 12, lineHeight: "16px", color: theme.color.secondaryText }}>{`${t.left} left`}</span>
            )}
          </div>
          {selected ? (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 16,
                height: 16,
                borderRadius: 8,
                background: theme.color.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke={theme.color.onPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8.5l2.5 2.5L12 5.5" />
              </svg>
            </span>
          ) : null}
        </button>
      );
    };

    // ---- scene art
    const scene = buildScene(tier, state.inn, W, theme);

    // ---- who row
    const ordered = [...state.inn, ...members.filter((m) => !state.inn.includes(m.id)).map((m) => m.id)];
    const columns = Math.max(1, Math.floor(W / 46));
    const crowded = ordered.length > columns;
    const shownCount = crowded ? Math.max(0, columns - 1) : ordered.length;
    const shown = ordered.slice(0, shownCount);
    if (shownCount > 0 && !shown.includes(me) && ordered.includes(me)) shown[shownCount - 1] = me;
    const extra = ordered.length - shownCount;
    const sent = state.sent;

    const whoLabel = (id: string) => {
      const isIn = state.inn.includes(id);
      if (bought) {
        if (id === bought.payer) return "buying";
        if (bought.people.includes(id)) return sent.includes(id) ? "sent" : "owes";
        return id === me ? "you?" : "out";
      }
      if (id === state.payer) return "fronts";
      if (isIn) return "in";
      return id === me ? "you?" : "out";
    };

    const whoColumn = (id: string) => {
      const isIn = state.inn.includes(id);
      const label = whoLabel(id);
      const owes = bought && bought.people.includes(id);
      const gotCheck = bought && (id === bought.payer || sent.includes(id));
      const avatar = (
        <span
          style={{
            position: "relative",
            width: 32,
            height: 32,
            borderRadius: 16,
            flex: "none",
            boxShadow: isIn ? `0 0 0 2px ${theme.color.card}, 0 0 0 4px ${theme.color.positive}` : undefined,
          }}
        >
          {isIn ? (
            <Avatar user={id} size={32} />
          ) : (
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: theme.color.secondaryButton,
                color: theme.color.text,
                fontSize: 14,
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              {(members.find((m) => m.id === id)?.name ?? id).trim().charAt(0).toUpperCase() || "?"}
            </span>
          )}
          {id === state.payer ? (
            <span aria-hidden="true" style={{ position: "absolute", top: -3, right: -3, lineHeight: 0 }}>
              <svg width={16} height={11} viewBox="0 0 16 11">
                <rect x={0} y={0} width={16} height={11} rx={2} fill={theme.color.series2} />
                <rect x={0} y={3} width={16} height={2} fill={theme.color.text} opacity={0.6} />
              </svg>
            </span>
          ) : null}
          {gotCheck ? (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -3,
                left: -3,
                width: 14,
                height: 14,
                borderRadius: 7,
                background: theme.color.positive,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width={9} height={9} viewBox="0 0 16 16" fill="none" stroke={theme.color.onPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8.5l2.5 2.5L12 5.5" />
              </svg>
            </span>
          ) : null}
        </span>
      );
      const labelEl = (
        <small
          style={{
            display: "block",
            fontSize: 12,
            lineHeight: "16px",
            color: label === "sent" || label === "buying" ? theme.color.positive : id === me ? theme.color.link : theme.color.secondaryText,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </small>
      );
      const body = (
        <div style={{ width: 44, height: 50, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          {avatar}
          {labelEl}
        </div>
      );
      if (id === me) {
        return (
          <button
            key={`who-${id}`}
            type="button"
            aria-label={isIn ? "Drop out" : "Count me in"}
            aria-pressed={isIn}
            aria-disabled={!!bought}
            onClick={() => {
              if (!bought) dispatch({ t: "toggle" });
            }}
            style={{ width: 44, height: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", background: "none", border: 0, padding: 0 }}
          >
            {body}
          </button>
        );
      }
      return <div key={`who-${id}`}>{body}</div>;
    };

    return (
      <div>
        <CardHeader title="Group ticket buy" subtitle={`${state.venue} · ${state.date}`} />

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${state.tiers.length},1fr)`, gap: 8, height: 66 }}>
          {state.tiers.map(tierCard)}
        </div>

        <div style={{ marginTop: GAP }}>
          <Changed at={confirmed.bought?.at ?? 0} radius={12}>
            <Scene height={80} bg={theme.color.input} radius={12} label={`${tier.name}: ${n} of ${members.length} in, ${tier.together}`} art={scene.art}>
              <Chip tone="card" maxWidth={W - 16} style={at(0, 0, { transform: "none", left: 8, top: 6 })}>
                {tier.together}
              </Chip>
              {scene.places.map((p) => (
                <Placed key={`${state.tier}-${p.id}`} user={p.id} x={p.x} y={p.y} size={p.size} me={me} />
              ))}
            </Scene>
          </Changed>
        </div>

        <div style={{ marginTop: GAP, height: 16 }}>
          <small>{`Who's in · ${n} of ${members.length}`}</small>
        </div>

        <div style={{ display: "flex", gap: 2, height: 50, alignItems: "flex-start", overflow: "hidden" }}>
          {shown.map(whoColumn)}
          {extra > 0 ? (
            <div style={{ width: 44, height: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 4 }}>
              <More n={extra} />
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: GAP }}>
          <Changed at={state.tierAt} radius={12}>
            <Summary
              title={`${money(each)} each`}
              detail={`${n} × ${money(tier.price)} + ${money(tier.fee)} fees · ${money(total)}`}
              note={owe}
              tone="secondary"
              aside={
                !bought && iAmIn && !iAmPayer ? (
                  <Button kind="deemphasized" onClick={() => dispatch({ t: "front" })}>
                    I'll pay
                  </Button>
                ) : undefined
              }
            />
          </Changed>
        </div>

        <div style={{ marginTop: GAP }}>
          {bought ? (
            bought.people.includes(me) && me !== bought.payer && !sent.includes(me) ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40 }}>
                <small style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {`Seats locked · you owe ${lowerName(bought.payer)} ${money(bought.each)}`}
                </small>
                <div style={{ position: "relative", flex: "none" }}>
                  {local.burst ? <Burst key={local.burst} emoji="💸" /> : null}
                  <Button
                    kind="primary"
                    onClick={() => {
                      dispatch({ t: "sent" });
                      setLocal({ burst: local.burst + 1 });
                    }}
                  >
                    Mark sent
                  </Button>
                </div>
              </div>
            ) : (
              <Locked detail={`${bought.payer === me ? "You're" : `${nameOf(bought.payer)} is`} buying ${money(bought.total)} · ${sent.length} of ${bought.people.length - 1} sent`}>
                {`Seats locked · ${bought.people.length} together`}
              </Locked>
            )
          ) : !iAmIn ? (
            <Button kind="primary" wide onClick={() => dispatch({ t: "toggle" })}>
              I'm in
            </Button>
          ) : iAmPayer ? (
            <Button
              kind="primary"
              wide
              onClick={() => {
                haptic("success");
                dispatch({ t: "buy" });
              }}
            >
              {`Buy ${n} · ${money(total)}`}
            </Button>
          ) : (
            <Button kind="secondary" wide onClick={() => dispatch({ t: "toggle" })}>
              Drop out
            </Button>
          )}
        </div>

        {confirmed.bought && running(confirmed.bought.at, 2400) !== null ? (
          <Toast key={confirmed.bought.at}>{`Seats locked · ${bought?.people.length ?? n} together`}</Toast>
        ) : null}
      </div>
    );
  },
});

// ---- The scene: seats, a lawn blanket, or the pit rail. ----

type Place = { id: string; x: number; y: number; size: number };

function buildScene(tier: Tier, inn: string[], W: number, theme: Theme): { art: Child[]; places: Place[] } {
  const n = inn.length;
  const c = theme.color;
  const p = pal(theme);
  const art: Child[] = [];
  const places: Place[] = [];
  const q = (v: number) => Math.round(v * 10) / 10;

  if (tier.kind === "lawn") {
    const hill: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      hill.push(`${q(u * W)} ${q(30 - Math.sin(u * 3) * 8)}`);
    }
    art.push(path(`M0 80 L${hill.join(" L")} L${q(W)} 80 Z`, p.grass, { key: "hill" }));

    const bw = Math.min(W - 32, 30 * n + 26);
    const clipId = `blanket-${q(W)}-${n}`;
    art.push(
      h(
        "defs",
        { key: "defs" },
        h("clipPath", { id: clipId }, h("rect", { x: 16, y: 40, width: q(bw), height: 30, rx: 4 })),
      ),
    );
    art.push(rect(16, 40, bw, 30, 4, p.cream, { key: "blanket" }));
    for (let x = 16; x < 16 + bw; x += 12) {
      art.push(rect(x, 40, Math.min(6, 16 + bw - x), 30, 0, p.red, { key: `v${x}`, opacity: 0.3, "clip-path": `url(#${clipId})` }));
    }
    for (let y = 40; y < 70; y += 12) {
      art.push(rect(16, y, bw, Math.min(6, 70 - y), 0, p.red, { key: `h${y}`, opacity: 0.3, "clip-path": `url(#${clipId})` }));
    }
    art.push(rect(W - 80, 8, 60, 8, 3, p.soft, { key: "stage", opacity: 0.5 }));

    if (n > 0) {
      const step = Math.min(30, (bw - 36) / Math.max(1, n - 1));
      inn.forEach((id, i) => {
        const x = 16 + 18 + i * step;
        places.push({ id, x: x / W, y: (50 + (i % 2) * 6) / 80, size: 22 });
      });
    }
  } else if (tier.kind === "pit") {
    art.push(rect(0, 0, W, 16, 0, p.ink, { key: "band", opacity: 0.75 }));
    for (let k = 0; k < 6; k++) {
      const x = 30 + k * 64;
      art.push(path(`M${q(x)} 16 L${q(x - 18)} 80 L${q(x + 18)} 80 Z`, p.yellow, { key: `cone${k}`, opacity: 0.18 }));
    }
    art.push(line(0, 26, W, 26, p.soft, 3, { key: "rail" }));
    for (let k = 0; k < 14; k++) {
      art.push(circle(12 + k * 26, 76 + (k % 3) * 2, 8, p.soft, { key: `crowd${k}`, opacity: 0.3 }));
    }
    if (n > 0) {
      const spacing = Math.min(34, (W - 40) / Math.max(1, n - 1));
      inn.forEach((id, i) => {
        const x = W / 2 + (i - (n - 1) / 2) * spacing;
        const col = userColor(id, theme);
        art.push(line(x - 8, 54, x - 14, 36, col, 3, { key: `arml${i}` }));
        art.push(line(x + 8, 54, x + 14, 36, col, 3, { key: `armr${i}` }));
        places.push({ id, x: x / W, y: 50 / 80, size: 24 });
      });
    }
  } else {
    const seats = Math.max(9, n);
    const seatW = (W - 24) / seats;
    const start = Math.floor((seats - n) / 2);
    for (let s = 0; s < seats; s++) {
      const x = 12 + s * seatW + 3;
      const w = seatW - 6;
      const ours = s >= start && s < start + n;
      const fill = ours ? c.selected : c.secondaryButton;
      art.push(rect(x, 26, w, 8, 3, mix(fill, c.text, 0.15), { key: `back${s}` }));
      art.push(rect(x, 32, w, 28, 6, fill, { key: `seat${s}` }));
      if (seatW >= 26) {
        art.push(
          h(
            "text",
            { key: `label${s}`, x: q(x + w / 2), y: 72, fill: c.secondaryText, "text-anchor": "middle", "font-family": theme.type.family, "font-size": 11 },
            `${tier.row}${9 + s}`,
          ),
        );
      }
      const who = ours ? inn[s - start] : undefined;
      if (who) places.push({ id: who, x: (x + w / 2) / W, y: 46 / 80, size: Math.min(24, seatW - 6) });
    }
  }

  return { art, places };
}
